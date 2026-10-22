'use strict';
/** Shared helpers for worker-B modules (community, tickets, giveaways, polls, customcommands). */
const { PermissionFlagsBits } = require('discord.js');
const db = require('../../core/db');
const { template, ordinal } = require('../../core/utils');

// Roles carrying any of these can never be handed out by panels / autorole / verification.
const DANGEROUS = [
  'Administrator', 'ManageGuild', 'ManageRoles', 'ManageChannels', 'BanMembers', 'KickMembers', 'ModerateMembers',
  'ManageMessages', 'ManageWebhooks', 'MentionEveryone', 'ManageGuildExpressions', 'ManageNicknames', 'ManageThreads',
  'ViewAuditLog', 'ManageEvents', 'MuteMembers', 'DeafenMembers', 'MoveMembers',
].map((p) => PermissionFlagsBits[p]);

/** Read a guild settings section without creating it (cheap for hot event paths). */
function peek(guildId, name) {
  const g = db.get('guilds', String(guildId), null);
  return g && g[name] ? g[name] : null;
}

/**
 * Several bot accounts may share a DB and a guild. A section is "owned" by the bot
 * that last configured it, so only that bot reacts to events for it.
 */
function claim(section, client) {
  section.botId = client.user.id;
  db.save();
}
function owns(section, client) {
  return !section?.botId || section.botId === client.user.id;
}

/** Why a role can't be auto-assigned (string) or null when it's fine. */
function roleProblem(guild, role, { safeOnly = true } = {}) {
  if (!role) return 'I could not find that role.';
  if (role.id === guild.id) return '`@everyone` cannot be assigned.';
  if (role.managed) return `**${role.name}** is managed by an integration or bot and can't be assigned.`;
  const me = guild.members.me;
  if (!me || role.position >= me.roles.highest.position) {
    return `**${role.name}** is above (or equal to) my highest role. Drag my role above it in Server Settings → Roles.`;
  }
  if (safeOnly && role.permissions?.any?.(DANGEROUS)) {
    return `**${role.name}** has moderator/admin permissions, so it can't be handed out automatically.`;
  }
  return null;
}

/** A moderator may only configure roles below their own highest role (owner excepted). */
function userCanManageRole(ctx, role) {
  if (!role || !ctx.guild) return false;
  if (ctx.guild.ownerId === ctx.author.id || ctx.isOwner()) return true;
  return (ctx.member?.roles?.highest?.position ?? -1) > role.position;
}

/** Combined check for config commands. Returns an error string or null. */
function checkRoleForConfig(ctx, role, opts) {
  if (!role) return 'I could not find that role. Mention it, or give its ID or exact name.';
  const p = roleProblem(ctx.guild, role, opts);
  if (p) return p;
  if (!userCanManageRole(ctx, role)) return `You can only configure roles below your own highest role.`;
  return null;
}

const LINK_RE = /discord(?:app)?\.com\/channels\/(\d+|@me)\/(\d+)\/(\d+)/;

/** Message ID from an ID or a message link. */
function messageIdFrom(str) {
  const s = String(str || '').trim();
  const m = s.match(LINK_RE);
  if (m) return m[3];
  return /^\d{15,21}$/.test(s) ? s : null;
}

/** Fetch a message from a link (any channel in this guild) or an ID (current channel). */
async function fetchMessageRef(ctx, ref) {
  const s = String(ref || '').trim();
  const m = s.match(LINK_RE);
  let channel = ctx.channel;
  let id = null;
  if (m) {
    if (m[1] !== ctx.guild?.id) return null;
    channel = ctx.guild.channels.cache.get(m[2]);
    id = m[3];
  } else if (/^\d{15,21}$/.test(s)) id = s;
  if (!id || !channel?.messages?.fetch) return null;
  const msg = await channel.messages.fetch(id).catch(() => null);
  return msg && msg.author && msg.id ? msg : null;
}

/** Fetch a message by ID from a channel; null unless it is a real message. */
async function fetchMsg(channel, id) {
  if (!channel?.messages?.fetch || !id) return null;
  const msg = await channel.messages.fetch(id).catch(() => null);
  return msg && msg.id && msg.author ? msg : null;
}

/** Parse a unicode or custom emoji. key = stable id for matching, react = value for message.react(). */
function parseEmoji(str) {
  if (!str) return null;
  const s = String(str).trim();
  const custom = s.match(/^<(a?):(\w{2,32}):(\d{15,21})>$/);
  if (custom) return { key: custom[3], display: s, react: custom[3] };
  if (s.length <= 16 && /\p{Extended_Pictographic}|\p{Regional_Indicator}|⃣/u.test(s) && !/[a-z0-9]{2,}/i.test(s.replace(/⃣|️/g, ''))) {
    return { key: normEmoji(s), display: s, react: s };
  }
  return null;
}

const normEmoji = (s) => String(s || '').replace(/️/g, '');
const reactionKey = (emoji) => (emoji.id ? emoji.id : normEmoji(emoji.name));

/** Placeholders for welcome/goodbye style messages about a member. */
function memberVars(member) {
  const count = member.guild.memberCount;
  return {
    user: member.displayName || member.user.globalName || member.user.username,
    mention: `<@${member.id}>`,
    username: member.user.username,
    userid: member.id,
    server: member.guild.name,
    count,
    membercount: count,
    ordinal: ordinal(count),
  };
}

const renderMember = (tpl, member) => template(tpl, memberVars(member));

/** A text channel the bot can post in, or an error string. */
function postableChannel(ctx, ref) {
  const ch = ctx.resolveChannel(ref);
  if (!ch) return { error: 'I could not find that channel. Mention it like #general.' };
  if (!ch.isTextBased?.() || ch.isVoiceBased?.()) return { error: 'That is not a text channel.' };
  const perms = ch.permissionsFor?.(ctx.guild.members.me);
  if (perms && !perms.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
    return { error: `I need **View Channel**, **Send Messages** and **Embed Links** in ${ch}.` };
  }
  return { channel: ch };
}

/** Simple per-key async lock so concurrent events don't double-post. */
const locks = new Map();
function withLock(key, fn) {
  const prev = locks.get(key) || Promise.resolve();
  const next = prev.then(fn, fn).finally(() => {
    if (locks.get(key) === next) locks.delete(key);
  });
  locks.set(key, next);
  return next;
}

module.exports = {
  DANGEROUS,
  peek,
  claim,
  owns,
  roleProblem,
  userCanManageRole,
  checkRoleForConfig,
  messageIdFrom,
  fetchMessageRef,
  fetchMsg,
  parseEmoji,
  normEmoji,
  reactionKey,
  memberVars,
  renderMember,
  postableChannel,
  withLock,
};
