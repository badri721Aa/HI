'use strict';
/**
 * Shared moderation helpers: permission checks (with optional moderator roles),
 * role-hierarchy checks, the case system, modlog posting, DMs, timers and
 * channel locking. Used by the moderation, automod and config modules.
 */
const { PermissionFlagsBits, ChannelType } = require('discord.js');
const db = require('../../core/db');
const { embed, colors } = require('../../core/embeds');
const { formatDuration, discordTimestamp, truncate, parseDuration } = require('../../core/utils');

const MOD_DEFAULTS = {
  modlogChannel: null,
  reportChannel: null,
  dmOnPunish: true,
  modRoles: [],
  jailRole: null,
  jailChannel: null,
  warnActions: {}, // { "3": { action: "timeout", duration: 3600000 } }
  lockdownChannels: [],
};

const settings = (guildId) => db.section(guildId, 'moderation', MOD_DEFAULTS);

const permLabel = (p) => p.replace(/([a-z])([A-Z])/g, '$1 $2');

// Permissions a configured moderator role may stand in for.
const DELEGABLE = new Set([
  'KickMembers', 'BanMembers', 'ModerateMembers', 'ManageMessages', 'ManageNicknames',
  'ManageRoles', 'ManageChannels', 'MuteMembers', 'DeafenMembers', 'MoveMembers',
]);

function hasPerm(ctx, perm) {
  if (!ctx.guild) return false;
  if (ctx.isOwner() || ctx.guild.ownerId === ctx.author.id) return true;
  const perms = ctx.channel?.permissionsFor?.(ctx.member) || ctx.member?.permissions;
  if (perms?.has?.(PermissionFlagsBits.Administrator) || perms?.has?.(PermissionFlagsBits[perm])) return true;
  const modRoles = settings(ctx.guild.id).modRoles;
  return DELEGABLE.has(perm) && modRoles.length > 0 && !!ctx.member?.roles?.cache?.some((r) => modRoles.includes(r.id));
}

/** Checks the member has `perm` (or a moderator role). Replies with an error and returns false if not. */
async function requirePerm(ctx, perm) {
  if (!ctx.guild) {
    await ctx.fail('This command only works in a server.');
    return false;
  }
  if (hasPerm(ctx, perm)) return true;
  await ctx.fail(`You need the **${permLabel(perm)}** permission${DELEGABLE.has(perm) ? ' (or a moderator role)' : ''}.`);
  return false;
}

/** Bot permission check in the current (or given) channel. */
async function requireBotPerm(ctx, perm, channel = ctx.channel) {
  const me = ctx.guild?.members?.me;
  const perms = channel?.permissionsFor?.(me) || me?.permissions;
  if (perms?.has?.(PermissionFlagsBits[perm])) return true;
  await ctx.fail(`I need the **${permLabel(perm)}** permission to do that.`);
  return false;
}

/** resolveMember that only returns real GuildMember-like objects. */
async function getMember(ctx, arg) {
  if (!arg) return null;
  const m = await ctx.resolveMember(arg).catch(() => null);
  return m && m.user && m.id ? m : null;
}

async function getUser(ctx, arg) {
  if (!arg) return null;
  const u = await ctx.resolveUser(arg).catch(() => null);
  return u && u.id ? u : null;
}

const highest = (member) => member?.roles?.highest?.position ?? 0;

/** Returns an error string if the moderator or the bot cannot act on `target`, else null. */
function hierarchyError(ctx, target, verb = 'moderate', { allowSelf = false } = {}) {
  const { guild, author, client } = ctx;
  const name = target.user?.tag || target.user?.username || 'That member';
  if (!allowSelf && target.id === author.id) return `You can't ${verb} yourself.`;
  if (target.id === client.user.id) return `I can't ${verb} myself.`;
  if (target.id === guild.ownerId) return `You can't ${verb} the server owner.`;
  if (author.id !== guild.ownerId && target.id !== author.id && highest(target) >= highest(ctx.member)) {
    return `**${name}**'s highest role is equal to or above yours.`;
  }
  const me = guild.members.me;
  if (me && highest(target) >= highest(me)) return `**${name}**'s highest role is equal to or above mine — move my role higher.`;
  return null;
}

/** Error string if a role can't be assigned by this moderator/bot, else null. */
function roleError(ctx, role) {
  if (!role) return 'Role not found.';
  if (role.id === ctx.guild.id) return 'You can\'t assign @everyone.';
  if (role.managed) return `**${role.name}** is managed by an integration and can't be assigned manually.`;
  const me = ctx.guild.members.me;
  if (me && role.position >= highest(me)) return `**${role.name}** is equal to or above my highest role — move my role higher.`;
  if (ctx.author.id !== ctx.guild.ownerId && !ctx.isOwner() && role.position >= highest(ctx.member)) {
    return `**${role.name}** is equal to or above your highest role.`;
  }
  return null;
}

// ---------------------------------------------------------------- cases

const TYPE_META = {
  ban: { label: 'Ban', color: colors.error, emoji: '🔨' },
  tempban: { label: 'Temp Ban', color: colors.error, emoji: '⏳' },
  softban: { label: 'Softban', color: 0xe67e22, emoji: '🧹' },
  massban: { label: 'Mass Ban', color: colors.error, emoji: '🔨' },
  unban: { label: 'Unban', color: colors.success, emoji: '🔓' },
  kick: { label: 'Kick', color: 0xe67e22, emoji: '👢' },
  timeout: { label: 'Timeout', color: colors.warn, emoji: '🔇' },
  untimeout: { label: 'Timeout Removed', color: colors.success, emoji: '🔊' },
  warn: { label: 'Warn', color: colors.warn, emoji: '⚠️' },
  jail: { label: 'Jail', color: 0x95a5a6, emoji: '⛓️' },
  unjail: { label: 'Unjail', color: colors.success, emoji: '🕊️' },
};
const typeMeta = (t) => TYPE_META[t] || { label: t, color: colors.info, emoji: '📝' };

const caseStore = (guildId) => db.ensure('modcases', String(guildId), { next: 1, cases: [] });

function createCase(guild, { type, user, moderator, reason, duration = null }) {
  const store = caseStore(guild.id);
  const c = {
    id: store.next++,
    type,
    userId: user.id,
    userTag: user.tag || user.username || user.id,
    modId: moderator.id,
    modTag: moderator.tag || moderator.username || moderator.id,
    reason: truncate(reason || 'No reason provided', 900),
    duration,
    at: Date.now(),
  };
  store.cases.push(c);
  if (store.cases.length > 5000) store.cases.splice(0, store.cases.length - 5000);
  db.save();
  return c;
}

const findCase = (guildId, id) => caseStore(guildId).cases.find((c) => c.id === Number(id)) || null;

function caseEmbed(c) {
  const m = typeMeta(c.type);
  return embed({
    color: m.color,
    title: `${m.emoji} ${m.label} | Case #${c.id}`,
    fields: [
      { name: 'User', value: `<@${c.userId}> (${c.userTag})\n\`${c.userId}\``, inline: true },
      { name: 'Moderator', value: `<@${c.modId}> (${c.modTag})`, inline: true },
      { name: 'Duration', value: c.duration ? formatDuration(c.duration) : null, inline: true },
      { name: 'Reason', value: c.reason },
      { name: 'When', value: `${discordTimestamp(c.at, 'F')} (${discordTimestamp(c.at)})` },
    ],
  });
}

function modlogChannel(guild) {
  const id = settings(guild.id).modlogChannel;
  const ch = id ? guild.channels.cache.get(id) : null;
  return ch?.isTextBased?.() ? ch : null;
}

/** Post an embed (or a case) to the modlog channel, if one is set. Never throws. */
async function postModlog(guild, caseOrEmbed, extra = {}) {
  const ch = modlogChannel(guild);
  if (!ch) return null;
  const e = caseOrEmbed?.id && caseOrEmbed?.type ? caseEmbed(caseOrEmbed) : caseOrEmbed;
  return ch.send({ embeds: [e], allowedMentions: { parse: [] }, ...extra }).catch(() => null);
}

/** Simple non-case action log ("Purged 50 messages", "Locked #general"…). */
function actionEmbed(title, description, color = colors.info) {
  return embed({ title, description, color, timestamp: true });
}

/** DM a punished user (if the server allows it). Returns true if delivered. */
async function dmUser(guild, user, type, reason, duration) {
  if (!settings(guild.id).dmOnPunish || !user?.send) return false;
  const m = typeMeta(type);
  const e = embed({
    color: m.color,
    title: `${m.emoji} ${m.label} — ${guild.name}`,
    fields: [
      { name: 'Reason', value: reason || 'No reason provided' },
      { name: 'Duration', value: duration ? formatDuration(duration) : null, inline: true },
    ],
    timestamp: true,
  });
  return user.send({ embeds: [e] }).then(() => true).catch(() => false);
}

/** Standard flow: DM → action → case → modlog → reply. */
async function punish(ctx, { type, user, reason, duration = null, action, dmFirst = true, silent = false }) {
  let dmed = false;
  if (dmFirst) dmed = await dmUser(ctx.guild, user, type, reason, duration);
  await api(action, `${typeMeta(type).label.toLowerCase()} ${user.tag || user.username || user.id}`);
  if (!dmFirst) dmed = await dmUser(ctx.guild, user, type, reason, duration);
  const c = createCase(ctx.guild, { type, user, moderator: ctx.author, reason, duration });
  await postModlog(ctx.guild, c);
  if (!silent) {
    const m = typeMeta(type);
    await ctx.reply({
      embeds: [
        ctx.embed({
          color: m.color,
          description: `${m.emoji} **${user.tag || user.username}** — ${m.label.toLowerCase()}${duration ? ` for **${formatDuration(duration)}**` : ''}.\n**Reason:** ${c.reason}`,
          footer: `Case #${c.id}${dmed ? '' : ' • could not DM user'}`,
        }),
      ],
    });
  }
  return c;
}

/**
 * Await a Discord API call; on failure attach a readable userMessage
 * ("Couldn't ban x: Missing Permissions") unless one is already set.
 */
async function api(fn, what) {
  try {
    return await (typeof fn === 'function' ? fn() : fn);
  } catch (err) {
    if (err && typeof err === 'object' && !err.userMessage) err.userMessage = `Couldn't ${what}: ${err.message || err}`;
    throw err;
  }
}

// ---------------------------------------------------------------- timers (temp bans/roles/jails)

const timerKey = (botId, guildId, kind, userId, extra = '') => `${botId}:${guildId}:${kind}:${userId}:${extra}`;

function addTimer(client, guildId, kind, userId, at, extra = {}) {
  const key = timerKey(client.user.id, guildId, kind, userId, extra.roleId || '');
  db.set('modtimers', key, { botId: client.user.id, guildId, kind, userId, at, attempts: 0, ...extra });
  return key;
}

function removeTimers(guildId, kind, userId) {
  for (const [key, t] of db.entries('modtimers')) {
    if (t.guildId === guildId && t.kind === kind && t.userId === userId) db.delete('modtimers', key);
  }
}

// ---------------------------------------------------------------- warn escalation

async function applyWarnActions(guild, member, moderator) {
  if (!member) return null;
  const cfg = settings(guild.id);
  const count = caseStore(guild.id).cases.filter((c) => c.type === 'warn' && c.userId === member.id).length;
  const step = cfg.warnActions[String(count)];
  if (!step) return null;
  const reason = `Automatic: reached ${count} warnings`;
  const me = guild.members.me;
  try {
    if (step.action === 'timeout' && member.moderatable) {
      const dur = Math.min(step.duration || 3600000, 28 * 86400000);
      await dmUser(guild, member.user, 'timeout', reason, dur);
      await member.timeout(dur, reason);
      const c = createCase(guild, { type: 'timeout', user: member.user, moderator: moderator || me.user, reason, duration: dur });
      await postModlog(guild, c);
      return `timed out for ${formatDuration(dur)}`;
    }
    if (step.action === 'kick' && member.kickable) {
      await dmUser(guild, member.user, 'kick', reason);
      await member.kick(reason);
      const c = createCase(guild, { type: 'kick', user: member.user, moderator: moderator || me.user, reason });
      await postModlog(guild, c);
      return 'kicked';
    }
    if (step.action === 'ban' && member.bannable) {
      await dmUser(guild, member.user, 'ban', reason);
      await guild.members.ban(member.id, { reason });
      const c = createCase(guild, { type: 'ban', user: member.user, moderator: moderator || me.user, reason });
      await postModlog(guild, c);
      return 'banned';
    }
  } catch {
    return null;
  }
  return null;
}

// ---------------------------------------------------------------- channel locking

const LOCKABLE = new Set([ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum, ChannelType.GuildVoice, ChannelType.GuildStageVoice]);
const LOCK_PERMS = { SendMessages: false, SendMessagesInThreads: false, CreatePublicThreads: false, CreatePrivateThreads: false, AddReactions: false };
const UNLOCK_PERMS = { SendMessages: null, SendMessagesInThreads: null, CreatePublicThreads: null, CreatePrivateThreads: null, AddReactions: null };

function isLocked(channel) {
  const ow = channel.permissionOverwrites?.cache?.get(channel.guild.id);
  return !!ow?.deny?.has(PermissionFlagsBits.SendMessages);
}

async function lockChannel(channel, reason) {
  await channel.permissionOverwrites.edit(channel.guild.roles.everyone, LOCK_PERMS, { reason });
}
async function unlockChannel(channel, reason) {
  await channel.permissionOverwrites.edit(channel.guild.roles.everyone, UNLOCK_PERMS, { reason });
}

/** Lock every text-like channel that isn't locked yet. Remembers which ones it locked. */
async function lockdownGuild(guild, reason, onProgress) {
  const cfg = settings(guild.id);
  const me = guild.members.me;
  const targets = guild.channels.cache.filter(
    (c) => LOCKABLE.has(c.type) && c.type !== ChannelType.GuildVoice && c.type !== ChannelType.GuildStageVoice && !isLocked(c) && c.permissionsFor(me)?.has(PermissionFlagsBits.ManageRoles),
  );
  const locked = [];
  for (const ch of targets.values()) {
    try {
      await lockChannel(ch, reason);
      locked.push(ch.id);
      if (onProgress && locked.length % 10 === 0) await onProgress(locked.length, targets.size);
    } catch {
      /* skip channels we can't edit */
    }
  }
  cfg.lockdownChannels = [...new Set([...(cfg.lockdownChannels || []), ...locked])];
  db.save();
  return { locked: locked.length, total: targets.size };
}

async function unlockdownGuild(guild, reason) {
  const cfg = settings(guild.id);
  let unlocked = 0;
  for (const id of cfg.lockdownChannels || []) {
    const ch = guild.channels.cache.get(id);
    if (!ch) continue;
    try {
      await unlockChannel(ch, reason);
      unlocked++;
    } catch {
      /* ignore */
    }
  }
  const total = (cfg.lockdownChannels || []).length;
  cfg.lockdownChannels = [];
  db.save();
  return { unlocked, total };
}

// ---------------------------------------------------------------- misc

/**
 * Several bot accounts can share one process (and one guild). claim(key) returns
 * true only for the first caller within `ttl`, so logs/automod act once.
 */
const claims = new Map();
function claim(key, ttl = 15000) {
  const now = Date.now();
  const until = claims.get(key);
  if (until && until > now) return false;
  claims.set(key, now + ttl);
  if (claims.size > 10000) for (const [k, v] of claims) if (v < now) claims.delete(k);
  return true;
}

/** True if the args at index i look like a duration with a unit ("10m", "2h30m", "7d"). */
function looksLikeDuration(token) {
  return typeof token === 'string' && /^\d+(\.\d+)?[a-z]/i.test(token) && parseDuration(token) !== null;
}

/** Options of a dedicated slash command (not /cmd), else null. */
function slashOptions(ctx) {
  return ctx.isSlash && ctx.interaction.commandName === ctx.command.name ? ctx.interaction.options : null;
}

/** Auto-delete a reply after `ms` (prefix mode only; ephemeral slash replies vanish on their own). */
function autoDelete(ctx, msg, ms = 5000) {
  if (!ctx.isSlash && msg?.delete) setTimeout(() => msg.delete().catch(() => {}), ms).unref?.();
}

module.exports = {
  MOD_DEFAULTS,
  settings,
  hasPerm,
  requirePerm,
  requireBotPerm,
  getMember,
  getUser,
  hierarchyError,
  roleError,
  highest,
  TYPE_META,
  typeMeta,
  caseStore,
  createCase,
  findCase,
  caseEmbed,
  postModlog,
  modlogChannel,
  actionEmbed,
  dmUser,
  punish,
  api,
  addTimer,
  removeTimers,
  applyWarnActions,
  LOCKABLE,
  isLocked,
  lockChannel,
  unlockChannel,
  lockdownGuild,
  unlockdownGuild,
  claim,
  looksLikeDuration,
  slashOptions,
  autoDelete,
  permLabel,
};
