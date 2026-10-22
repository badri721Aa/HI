'use strict';
/**
 * Anti-nuke: watches the audit log for destructive actions (channel/role
 * deletes, bans, kicks, webhook creation, bot adds, Administrator grants).
 * A non-whitelisted executor that exceeds the threshold inside the window is
 * punished (roles stripped, kicked or banned). Admin grants are reverted at once.
 * The server owner, whitelisted users and this process's own bots are trusted.
 */
const { AuditLogEvent, PermissionFlagsBits } = require('discord.js');
const db = require('../../core/db');
const { colors } = require('../../core/embeds');
const { parseToggle } = require('../../core/utils');
const mod = require('../moderation/_lib');

const WATCH = {
  channelDelete: 'Channel deletions',
  roleDelete: 'Role deletions',
  ban: 'Bans',
  kick: 'Kicks',
  webhookCreate: 'Webhook creation',
  botAdd: 'Adding bots (the bot is kicked)',
  adminGrant: 'Granting Administrator (reverted instantly)',
};

const DEFAULTS = {
  enabled: false,
  threshold: 3,
  seconds: 10,
  punishment: 'strip', // strip | kick | ban
  whitelist: [],
  watch: { channelDelete: true, roleDelete: true, ban: true, kick: true, webhookCreate: true, botAdd: false, adminGrant: true },
};
const settings = (guildId) => db.section(guildId, 'antinuke', DEFAULTS);

const ACTION_KIND = {
  [AuditLogEvent.ChannelDelete]: 'channelDelete',
  [AuditLogEvent.RoleDelete]: 'roleDelete',
  [AuditLogEvent.MemberBanAdd]: 'ban',
  [AuditLogEvent.MemberKick]: 'kick',
  [AuditLogEvent.WebhookCreate]: 'webhookCreate',
  [AuditLogEvent.BotAdd]: 'botAdd',
};

const counters = new Map(); // guild:executor -> [timestamps]
const ADMIN = PermissionFlagsBits.Administrator;

function isTrusted(client, guild, cfg, userId) {
  if (!userId) return true;
  if (userId === guild.ownerId || userId === client.user.id) return true;
  if (cfg.whitelist.includes(userId)) return true;
  const siblings = typeof client.siblings === 'function' ? client.siblings() : [];
  return siblings.some((c) => c.user?.id === userId);
}

/** Detect Administrator being granted (member role add or role permission edit). Reverts it. */
async function handleAdminGrant(guild, entry) {
  if (entry.action === AuditLogEvent.MemberRoleUpdate) {
    const added = (entry.changes || []).filter((c) => c.key === '$add').flatMap((c) => c.new || []);
    const adminRoles = added.map((r) => guild.roles.cache.get(r.id)).filter((r) => r?.permissions.has(ADMIN));
    if (!adminRoles.length) return null;
    const target = await guild.members.fetch(entry.targetId).catch(() => null);
    if (target) await target.roles.remove(adminRoles, 'Anti-nuke: unauthorized Administrator grant').catch(() => {});
    return `gave Administrator role(s) ${adminRoles.map((r) => r.name).join(', ')} to <@${entry.targetId}> (reverted)`;
  }
  if (entry.action === AuditLogEvent.RoleUpdate) {
    const change = (entry.changes || []).find((c) => c.key === 'permissions');
    if (!change) return null;
    const had = (BigInt(change.old ?? 0) & ADMIN) === ADMIN;
    const has = (BigInt(change.new ?? 0) & ADMIN) === ADMIN;
    if (had || !has) return null;
    const role = guild.roles.cache.get(entry.targetId);
    if (role?.editable) await role.setPermissions(BigInt(change.old ?? 0), 'Anti-nuke: unauthorized Administrator grant').catch(() => {});
    return `added Administrator to role ${role ? role.name : entry.targetId} (reverted)`;
  }
  return null;
}

async function punishExecutor(guild, cfg, executorId, reason) {
  const member = await guild.members.fetch(executorId).catch(() => null);
  const how = member?.user?.bot && cfg.punishment === 'strip' ? 'kick' : cfg.punishment; // bot roles are managed → kick bots
  try {
    if (how === 'ban') {
      await guild.members.ban(executorId, { reason });
      return 'banned';
    }
    if (!member) return 'not punished (left the server)';
    if (how === 'kick') {
      if (!member.kickable) return 'NOT punished — my role is below theirs';
      await member.kick(reason);
      return 'kicked';
    }
    const myTop = mod.highest(guild.members.me);
    const removable = member.roles.cache.filter((r) => r.id !== guild.id && !r.managed && r.position < myTop);
    if (member.roles.highest.position >= myTop) return 'NOT punished — my role is below theirs';
    await member.roles.remove(removable, reason);
    if (member.moderatable) await member.timeout(60 * 60 * 1000, reason).catch(() => {});
    return `stripped of ${removable.size} role(s) and timed out 1h`;
  } catch (err) {
    return `NOT punished (${err.message})`;
  }
}

async function onAuditLog(client, entry, guild) {
  const raw = db.guild(guild.id).antinuke;
  if (!raw?.enabled) return;
  if (!mod.claim(`an:${guild.id}:${entry.id}`, 60000)) return;
  const cfg = settings(guild.id);
  const executorId = entry.executorId;
  if (isTrusted(client, guild, cfg, executorId)) return;

  let kind = ACTION_KIND[entry.action];
  let detail = null;
  let immediate = false;
  if (!kind && (entry.action === AuditLogEvent.MemberRoleUpdate || entry.action === AuditLogEvent.RoleUpdate)) {
    if (!cfg.watch.adminGrant) return;
    detail = await handleAdminGrant(guild, entry);
    if (!detail) return;
    kind = 'adminGrant';
    immediate = true;
  }
  if (!kind || !cfg.watch[kind]) return;

  if (kind === 'botAdd') {
    const bot = await guild.members.fetch(entry.targetId).catch(() => null);
    if (bot?.kickable) await bot.kick('Anti-nuke: bot added by a non-whitelisted member').catch(() => {});
    detail = `added the bot <@${entry.targetId}> (kicked)`;
  }

  const key = `${guild.id}:${executorId}`;
  const now = Date.now();
  const list = (counters.get(key) || []).filter((t) => now - t < cfg.seconds * 1000);
  list.push(now);
  counters.set(key, list);
  if (!immediate && list.length < cfg.threshold) {
    if (detail) await mod.postModlog(guild, mod.actionEmbed('🛡️ Anti-nuke', `<@${executorId}> ${detail}.`, colors.warn));
    return;
  }
  counters.delete(key);

  const reason = `Anti-nuke: ${immediate ? WATCH[kind] : `${list.length} × ${WATCH[kind].toLowerCase()} in ${cfg.seconds}s`}`;
  const result = await punishExecutor(guild, cfg, executorId, reason);
  await mod.postModlog(
    guild,
    mod.actionEmbed(
      '☢️ Anti-nuke triggered',
      `**Executor:** <@${executorId}> (\`${executorId}\`)\n**Trigger:** ${detail || reason}\n**Result:** ${result}\n\nWhitelist trusted admins with \`antinukewl add @user\`.`,
      colors.error,
    ),
    { content: `<@${guild.ownerId}>`, allowedMentions: { users: [guild.ownerId] } },
  );
}

// ---------------------------------------------------------------- commands

/** Anti-nuke config is owner-only: it exists to stop rogue admins. */
async function ownerOnly(ctx) {
  if (ctx.author.id === ctx.guild.ownerId || ctx.isOwner()) return true;
  await ctx.fail('Only the **server owner** can configure anti-nuke.');
  return false;
}

const onOff = (b) => (b ? '🟢' : '🔴');

const commands = [
  {
    name: 'antinuke',
    aliases: ['an'],
    description: 'Show anti-nuke status, or turn it on/off (server owner only)',
    usage: '[on|off]',
    examples: ['', 'on'],
    guildOnly: true,
    userPerms: ['Administrator'],
    botPerms: ['ViewAuditLog'],
    async execute(ctx) {
      const cfg = settings(ctx.guild.id);
      if (ctx.args[0]) {
        if (!(await ownerOnly(ctx))) return;
        const state = parseToggle(ctx.args[0]);
        if (state === null) return ctx.usage();
        cfg.enabled = state;
        db.save();
        return ctx.ok(
          `Anti-nuke is now **${state ? 'on' : 'off'}**.${state ? `\nMake sure my role is near the top so I can punish rogue admins, set \`${ctx.prefix}setmodlog\`, and whitelist trusted admins with \`${ctx.prefix}antinukewl add @user\`.` : ''}`,
        );
      }
      await ctx.reply({
        embeds: [
          ctx.embed({
            title: `☢️ Anti-nuke — ${cfg.enabled ? 'on' : 'off'}`,
            fields: [
              { name: 'Threshold', value: `${cfg.threshold} actions in ${cfg.seconds}s`, inline: true },
              { name: 'Punishment', value: cfg.punishment, inline: true },
              { name: 'Whitelisted', value: cfg.whitelist.map((id) => `<@${id}>`).join(' ') || 'nobody (owner is always trusted)' },
              { name: 'Watching', value: Object.entries(WATCH).map(([k, label]) => `${onOff(cfg.watch[k])} \`${k}\` ${label}`).join('\n') },
            ],
          }),
        ],
      });
    },
  },
  {
    name: 'antinukewl',
    aliases: ['antinukewhitelist', 'anwl'],
    description: 'Whitelist trusted admins from anti-nuke: add/remove/list',
    usage: '<add|remove|list> [user]',
    examples: ['list', 'add tester', 'remove tester'],
    guildOnly: true,
    userPerms: ['Administrator'],
    minArgs: 1,
    async execute(ctx) {
      const cfg = settings(ctx.guild.id);
      const sub = ctx.args[0].toLowerCase();
      if (sub === 'list') return ctx.info(cfg.whitelist.map((id) => `• <@${id}> \`${id}\``).join('\n') || 'Nobody is whitelisted. (The server owner is always trusted.)', '☢️ Anti-nuke whitelist');
      if (!['add', 'remove'].includes(sub)) return ctx.usage();
      if (!(await ownerOnly(ctx))) return;
      const user = await mod.getUser(ctx, ctx.args[1]);
      if (!user) return ctx.fail('User not found.');
      const i = cfg.whitelist.indexOf(user.id);
      if (sub === 'add') {
        if (i !== -1) return ctx.info(`**${user.tag || user.username}** is already whitelisted.`);
        if (cfg.whitelist.length >= 50) return ctx.fail('The whitelist can hold at most 50 users.');
        cfg.whitelist.push(user.id);
      } else {
        if (i === -1) return ctx.fail(`**${user.tag || user.username}** isn't whitelisted.`);
        cfg.whitelist.splice(i, 1);
      }
      db.save();
      await ctx.ok(`${sub === 'add' ? 'Whitelisted' : 'Removed'} **${user.tag || user.username}**.`);
    },
  },
  {
    name: 'antinukelimit',
    aliases: ['anlimit'],
    description: 'How many destructive actions in how many seconds trigger anti-nuke',
    usage: '<actions> <seconds>',
    examples: ['3 10'],
    guildOnly: true,
    userPerms: ['Administrator'],
    minArgs: 2,
    async execute(ctx) {
      if (!(await ownerOnly(ctx))) return;
      const n = parseInt(ctx.args[0], 10);
      const s = parseInt(ctx.args[1], 10);
      if (!(n >= 1 && n <= 50) || !(s >= 1 && s <= 600)) return ctx.fail('Actions must be 1-50 and seconds 1-600.');
      const cfg = settings(ctx.guild.id);
      cfg.threshold = n;
      cfg.seconds = s;
      db.save();
      await ctx.ok(`Anti-nuke triggers at **${n} actions within ${s}s**.`);
    },
  },
  {
    name: 'antinukepunish',
    aliases: ['anpunish'],
    description: 'Anti-nuke punishment: strip (roles + 1h timeout), kick, or ban',
    usage: '<strip|kick|ban>',
    examples: ['strip', 'ban'],
    guildOnly: true,
    userPerms: ['Administrator'],
    minArgs: 1,
    async execute(ctx) {
      if (!(await ownerOnly(ctx))) return;
      const p = ctx.args[0].toLowerCase();
      if (!['strip', 'kick', 'ban'].includes(p)) return ctx.usage();
      settings(ctx.guild.id).punishment = p;
      db.save();
      const label = { strip: 'stripped of their roles and timed out', kick: 'kicked', ban: 'banned' }[p];
      await ctx.ok(`Rogue executors will be **${label}**.`);
    },
  },
  {
    name: 'antinukewatch',
    aliases: ['anwatch'],
    description: 'Choose which actions anti-nuke watches',
    usage: '<action> <on|off>',
    examples: ['botAdd on', 'kick off'],
    guildOnly: true,
    userPerms: ['Administrator'],
    async execute(ctx) {
      const cfg = settings(ctx.guild.id);
      if (!ctx.args[0]) return ctx.info(Object.entries(WATCH).map(([k, label]) => `${onOff(cfg.watch[k])} \`${k}\` — ${label}`).join('\n'), '☢️ Watched actions');
      if (!(await ownerOnly(ctx))) return;
      const key = Object.keys(WATCH).find((k) => k.toLowerCase() === ctx.args[0].toLowerCase());
      const state = parseToggle(ctx.args[1]);
      if (!key || state === null) return ctx.usage(`Actions: ${Object.keys(WATCH).map((k) => `\`${k}\``).join(', ')}`);
      cfg.watch[key] = state;
      db.save();
      await ctx.ok(`Anti-nuke ${state ? 'now watches' : 'ignores'} **${WATCH[key]}**.`);
    },
  },
];

module.exports = { commands, events: { guildAuditLogEntryCreate: onAuditLog } };
