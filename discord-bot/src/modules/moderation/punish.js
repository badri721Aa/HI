'use strict';
const db = require('../../core/db');
const { parseDuration, truncate, chunk, discordTimestamp } = require('../../core/utils');
const { paginate, confirm } = require('../../core/ui');
const lib = require('./_lib');
const { releaseJail } = require('./_jail');

const MAX_TIMEOUT = 28 * 86400000;
const auditReason = (ctx, reason) => truncate(`${ctx.author.tag || ctx.author.username}: ${reason || 'No reason provided'}`, 500);

/** Prefix: "<duration?> <reason…> [--delete N]". Slash: named options. */
function parseBanArgs(ctx, from = 1, { requireDuration = false } = {}) {
  const opts = lib.slashOptions(ctx);
  if (opts) {
    const rawDur = opts.getString('duration');
    const duration = rawDur ? parseDuration(rawDur) : null;
    return { duration, badDuration: !!rawDur && !duration, days: opts.getInteger('delete_days') ?? 0, reason: opts.getString('reason') || '' };
  }
  let rest = ctx.rest(from);
  let days = 0;
  rest = rest.replace(/(?:^|\s)(?:--delete|--days|-d)\s+(\d+)/i, (m, n) => {
    days = Math.min(7, parseInt(n, 10));
    return ' ';
  }).trim();
  let duration = null;
  let badDuration = false;
  const first = rest.split(/\s+/)[0];
  if (lib.looksLikeDuration(first) || (requireDuration && first)) {
    duration = parseDuration(first);
    badDuration = !duration;
    if (duration) rest = rest.slice(first.length).trim();
  }
  return { duration, badDuration, days, reason: rest };
}

/** Resolve "<user>" to { member, user } (member may be null for users outside the server). */
async function target(ctx, arg) {
  const member = await lib.getMember(ctx, arg);
  const user = member?.user || (await lib.getUser(ctx, arg));
  return { member, user };
}

function selfChecks(ctx, user, verb) {
  if (user.id === ctx.author.id) return `You can't ${verb} yourself.`;
  if (user.id === ctx.client.user.id) return `I can't ${verb} myself.`;
  if (user.id === ctx.guild.ownerId) return `You can't ${verb} the server owner.`;
  return null;
}

async function doBan(ctx, { tempOnly = false } = {}) {
  if (!(await lib.requirePerm(ctx, 'BanMembers'))) return;
  const opts = lib.slashOptions(ctx);
  const arg = opts ? opts.getUser('user')?.id : ctx.args[0];
  const { member, user } = await target(ctx, arg);
  if (!user) return ctx.fail('User not found. Use a mention or a user ID.');
  const { duration, badDuration, days, reason } = parseBanArgs(ctx, 1, { requireDuration: tempOnly });
  if (badDuration || (tempOnly && !duration)) return ctx.usage('Give a valid duration like `1d`, `12h` or `30m`.');
  const err = member ? lib.hierarchyError(ctx, member, 'ban') : selfChecks(ctx, user, 'ban');
  if (err) return ctx.fail(err);
  if (member && !member.bannable) return ctx.fail('I can\'t ban that member (role hierarchy or missing permission).');
  if (await ctx.guild.bans.fetch({ user: user.id, force: true }).catch(() => null)) return ctx.fail(`**${user.tag || user.id}** is already banned.`);

  await lib.punish(ctx, {
    type: duration ? 'tempban' : 'ban',
    user,
    reason,
    duration,
    dmFirst: !!member,
    action: () => ctx.guild.members.ban(user.id, { deleteMessageSeconds: days * 86400, reason: auditReason(ctx, reason) }),
  });
  if (duration) lib.addTimer(ctx.client, ctx.guild.id, 'unban', user.id, Date.now() + duration);
}

const commands = [
  {
    name: 'ban',
    aliases: ['hackban', 'banish'],
    description: 'Ban a member or user ID (optional duration = temp ban, --delete <days> of messages)',
    usage: '<user> [duration] [reason] [--delete 0-7]',
    examples: ['tester spamming', '@nobody 7d raiding --delete 1'],
    guildOnly: true,
    botPerms: ['BanMembers'],
    minArgs: 1,
    slash: true,
    args: [
      { name: 'user', type: 'user', description: 'Member or user to ban', required: true },
      { name: 'duration', type: 'string', description: 'Optional temp-ban length, e.g. 7d or 12h' },
      { name: 'delete_days', type: 'integer', description: 'Delete their messages from the last N days (0-7)', min: 0, max: 7 },
      { name: 'reason', type: 'string', description: 'Reason', rest: true },
    ],
    execute: (ctx) => doBan(ctx),
  },
  {
    name: 'tempban',
    aliases: ['tban'],
    description: 'Ban a user for a limited time — they are unbanned automatically',
    usage: '<user> <duration> [reason]',
    examples: ['tester 3d cooling off', '@nobody 12h spam'],
    guildOnly: true,
    botPerms: ['BanMembers'],
    minArgs: 2,
    execute: (ctx) => doBan(ctx, { tempOnly: true }),
  },
  {
    name: 'unban',
    aliases: ['pardon'],
    description: 'Unban a user by ID',
    usage: '<user ID> [reason]',
    examples: ['123456789012345678 appealed'],
    guildOnly: true,
    botPerms: ['BanMembers'],
    minArgs: 1,
    slash: true,
    args: [
      { name: 'user_id', type: 'string', description: 'ID of the banned user', required: true },
      { name: 'reason', type: 'string', description: 'Reason', rest: true },
    ],
    async execute(ctx) {
      if (!(await lib.requirePerm(ctx, 'BanMembers'))) return;
      const id = String(ctx.args[0]).replace(/[<@!>]/g, '');
      if (!/^\d{15,21}$/.test(id)) return ctx.usage('That is not a valid user ID.');
      const ban = await ctx.guild.bans.fetch({ user: id, force: true }).catch(() => null);
      if (!ban) return ctx.fail('That user is not banned.');
      const reason = ctx.rest(1);
      await lib.punish(ctx, { type: 'unban', user: ban.user || { id, tag: id }, reason, dmFirst: false, action: () => ctx.guild.members.unban(id, auditReason(ctx, reason)) });
      lib.removeTimers(ctx.guild.id, 'unban', id);
    },
  },
  {
    name: 'softban',
    description: 'Ban + immediately unban to wipe a member\'s last 7 days of messages',
    usage: '<user> [reason]',
    examples: ['tester spam cleanup'],
    guildOnly: true,
    botPerms: ['BanMembers'],
    minArgs: 1,
    async execute(ctx) {
      if (!(await lib.requirePerm(ctx, 'BanMembers'))) return;
      const member = await lib.getMember(ctx, ctx.args[0]);
      if (!member) return ctx.fail('Member not found.');
      const err = lib.hierarchyError(ctx, member, 'softban');
      if (err) return ctx.fail(err);
      if (!member.bannable) return ctx.fail('I can\'t ban that member.');
      const reason = ctx.rest(1);
      await lib.punish(ctx, {
        type: 'softban',
        user: member.user,
        reason,
        action: async () => {
          await ctx.guild.members.ban(member.id, { deleteMessageSeconds: 7 * 86400, reason: auditReason(ctx, `softban: ${reason}`) });
          await ctx.guild.members.unban(member.id, 'Softban: immediate unban');
        },
      });
    },
  },
  {
    name: 'massban',
    description: 'Ban up to 50 user IDs at once (confirmation required)',
    usage: '<id> <id> … [reason]',
    examples: ['123456789012345678 223456789012345678 raid accounts'],
    guildOnly: true,
    botPerms: ['BanMembers'],
    cooldown: 15,
    minArgs: 1,
    async execute(ctx) {
      if (!(await lib.requirePerm(ctx, 'BanMembers'))) return;
      const ids = [];
      let i = 0;
      for (; i < ctx.args.length; i++) {
        const id = ctx.args[i].replace(/[<@!>]/g, '');
        if (!/^\d{15,21}$/.test(id)) break;
        ids.push(id);
      }
      const unique = [...new Set(ids)];
      if (!unique.length) return ctx.usage('Give at least one user ID.');
      if (unique.length > 50) return ctx.fail('You can mass-ban at most 50 users at a time.');
      const reason = ctx.rest(i) || 'Mass ban';
      const skipped = [];
      const valid = [];
      for (const id of unique) {
        if ([ctx.author.id, ctx.client.user.id, ctx.guild.ownerId].includes(id)) {
          skipped.push(`<@${id}> (protected)`);
          continue;
        }
        const m = await ctx.guild.members.fetch(id).catch(() => null);
        const err = m?.user ? lib.hierarchyError(ctx, m, 'ban') : null;
        if (err) skipped.push(`<@${id}> (hierarchy)`);
        else valid.push(id);
      }
      if (!valid.length) return ctx.fail(`Nobody left to ban. Skipped: ${skipped.join(', ')}`);
      const ok = await confirm(ctx, `🔨 Ban **${valid.length}** user(s)?\n**Reason:** ${truncate(reason, 300)}${skipped.length ? `\nSkipping: ${skipped.join(', ')}` : ''}`);
      if (!ok) return;
      let banned = [];
      let failed = [];
      try {
        const res = await ctx.guild.bans.bulkCreate(valid, { reason: auditReason(ctx, reason) });
        banned = res.bannedUsers;
        failed = res.failedUsers;
      } catch {
        for (const id of valid) {
          try {
            await ctx.guild.members.ban(id, { reason: auditReason(ctx, reason) });
            banned.push(id);
          } catch {
            failed.push(id);
          }
        }
      }
      for (const id of banned) {
        const user = ctx.client.users.cache.get(id) || { id, tag: id };
        const c = lib.createCase(ctx.guild, { type: 'massban', user, moderator: ctx.author, reason });
        if (banned.length <= 10) await lib.postModlog(ctx.guild, c);
      }
      if (banned.length > 10) {
        await lib.postModlog(ctx.guild, lib.actionEmbed('🔨 Mass ban', `${ctx.author} banned **${banned.length}** users.\n**Reason:** ${truncate(reason, 500)}`));
      }
      await ctx.send({ embeds: [ctx.embed({ description: `🔨 Banned **${banned.length}** user(s).${failed.length ? ` Failed: ${failed.length}.` : ''}` })] });
    },
  },
  {
    name: 'banlist',
    aliases: ['bans'],
    description: 'List banned users and ban reasons',
    guildOnly: true,
    botPerms: ['BanMembers'],
    cooldown: 10,
    async execute(ctx) {
      if (!(await lib.requirePerm(ctx, 'BanMembers'))) return;
      await ctx.defer();
      const bans = await ctx.guild.bans.fetch();
      if (!bans.size) return ctx.info('✅ Nobody is banned here.');
      const lines = [...bans.values()].map((b) => `\`${b.user.id}\` **${b.user.tag || b.user.username}** — ${truncate(b.reason || 'no reason', 60)}`);
      const pages = chunk(lines, 15).map((part, i, all) =>
        ctx.embed({ title: `🔨 Bans (${bans.size})`, description: part.join('\n'), footer: `Page ${i + 1}/${all.length}` }),
      );
      await paginate(ctx, pages);
    },
  },
  {
    name: 'kick',
    aliases: ['boot'],
    description: 'Kick a member from the server',
    usage: '<user> [reason]',
    examples: ['tester being rude', '@nobody'],
    guildOnly: true,
    botPerms: ['KickMembers'],
    minArgs: 1,
    slash: true,
    args: [
      { name: 'user', type: 'user', description: 'Member to kick', required: true },
      { name: 'reason', type: 'string', description: 'Reason', rest: true },
    ],
    async execute(ctx) {
      if (!(await lib.requirePerm(ctx, 'KickMembers'))) return;
      const member = await lib.getMember(ctx, ctx.args[0]);
      if (!member) return ctx.fail('Member not found.');
      const err = lib.hierarchyError(ctx, member, 'kick');
      if (err) return ctx.fail(err);
      if (!member.kickable) return ctx.fail('I can\'t kick that member.');
      const reason = ctx.rest(1);
      await lib.punish(ctx, { type: 'kick', user: member.user, reason, action: () => member.kick(auditReason(ctx, reason)) });
    },
  },
  {
    name: 'timeout',
    aliases: ['mute', 'to', 'shush'],
    description: 'Time out a member (they can\'t chat or speak). Max 28 days',
    usage: '<user> <duration> [reason]',
    examples: ['tester 10m spam', '@nobody 1h', 'tester 5 calm down'],
    guildOnly: true,
    botPerms: ['ModerateMembers'],
    minArgs: 2,
    slash: true,
    args: [
      { name: 'user', type: 'user', description: 'Member to time out', required: true },
      { name: 'duration', type: 'string', description: 'e.g. 10m, 1h, 2d (max 28d)', required: true },
      { name: 'reason', type: 'string', description: 'Reason', rest: true },
    ],
    async execute(ctx) {
      if (!(await lib.requirePerm(ctx, 'ModerateMembers'))) return;
      const member = await lib.getMember(ctx, ctx.args[0]);
      if (!member) return ctx.fail('Member not found.');
      const duration = parseDuration(ctx.args[1]);
      if (!duration) return ctx.usage('Give a valid duration like `10m`, `1h` or `2d`.');
      if (duration > MAX_TIMEOUT) return ctx.fail('Timeouts can be at most **28 days**.');
      if (duration < 5000) return ctx.fail('Timeouts must be at least 5 seconds.');
      const err = lib.hierarchyError(ctx, member, 'time out');
      if (err) return ctx.fail(err);
      if (!member.moderatable) return ctx.fail('I can\'t time out that member (admins can\'t be timed out).');
      const reason = ctx.rest(2);
      await lib.punish(ctx, { type: 'timeout', user: member.user, reason, duration, dmFirst: false, action: () => member.timeout(duration, auditReason(ctx, reason)) });
    },
  },
  {
    name: 'untimeout',
    aliases: ['unmute', 'rto'],
    description: 'Remove a member\'s timeout',
    usage: '<user> [reason]',
    examples: ['tester served their time'],
    guildOnly: true,
    botPerms: ['ModerateMembers'],
    minArgs: 1,
    slash: true,
    args: [
      { name: 'user', type: 'user', description: 'Member to un-timeout', required: true },
      { name: 'reason', type: 'string', description: 'Reason', rest: true },
    ],
    async execute(ctx) {
      if (!(await lib.requirePerm(ctx, 'ModerateMembers'))) return;
      const member = await lib.getMember(ctx, ctx.args[0]);
      if (!member) return ctx.fail('Member not found.');
      if (!member.isCommunicationDisabled?.()) return ctx.fail('That member is not timed out.');
      const err = lib.hierarchyError(ctx, member, 'moderate');
      if (err) return ctx.fail(err);
      const reason = ctx.rest(1);
      await lib.punish(ctx, { type: 'untimeout', user: member.user, reason, dmFirst: false, action: () => member.timeout(null, auditReason(ctx, reason)) });
    },
  },
  {
    name: 'timeoutlist',
    aliases: ['mutelist', 'timeouts'],
    description: 'List members who are currently timed out',
    guildOnly: true,
    cooldown: 10,
    async execute(ctx) {
      if (!(await lib.requirePerm(ctx, 'ModerateMembers'))) return;
      await ctx.defer();
      const members = await ctx.guild.members.fetch().catch(() => ctx.guild.members.cache);
      const muted = [...members.values()].filter((m) => m.isCommunicationDisabled?.());
      if (!muted.length) return ctx.info('✅ Nobody is timed out.');
      const lines = muted.map((m) => `${m} — ends ${discordTimestamp(m.communicationDisabledUntilTimestamp)}`);
      await paginate(ctx, chunk(lines, 15).map((p, i, a) => ctx.embed({ title: `🔇 Timed out (${muted.length})`, description: p.join('\n'), footer: `Page ${i + 1}/${a.length}` })));
    },
  },
];

const tasks = [
  {
    name: 'moderation-timers',
    interval: 20000,
    async run(client) {
      const now = Date.now();
      for (const [key, t] of db.entries('modtimers')) {
        if (t.botId !== client.user.id || t.at > now) continue;
        const guild = client.guilds.cache.get(t.guildId);
        if (!guild) {
          db.delete('modtimers', key);
          continue;
        }
        try {
          if (t.kind === 'unban') {
            const ban = await guild.bans.fetch({ user: t.userId, force: true }).catch(() => null);
            if (ban) {
              await guild.members.unban(t.userId, 'Temporary ban expired');
              const c = lib.createCase(guild, { type: 'unban', user: ban.user, moderator: client.user, reason: 'Temporary ban expired' });
              await lib.postModlog(guild, c);
            }
          } else if (t.kind === 'unrole') {
            const m = await guild.members.fetch(t.userId).catch(() => null);
            if (m?.roles.cache.has(t.roleId)) {
              await m.roles.remove(t.roleId, 'Temporary role expired');
              await lib.postModlog(guild, lib.actionEmbed('⌛ Temporary role expired', `Removed <@&${t.roleId}> from ${m}.`));
            }
          } else if (t.kind === 'unjail') {
            if (await releaseJail(guild, t.userId, 'Jail time served')) {
              const user = await client.users.fetch(t.userId).catch(() => ({ id: t.userId, tag: t.userId }));
              const c = lib.createCase(guild, { type: 'unjail', user, moderator: client.user, reason: 'Jail time served' });
              await lib.postModlog(guild, c);
            }
          }
          db.delete('modtimers', key);
        } catch (err) {
          // Unknown ban / member / role → nothing left to undo. Otherwise retry a few times.
          if ([10007, 10011, 10013, 10026].includes(err.code) || ++t.attempts >= 5) db.delete('modtimers', key);
          else db.save();
        }
      }
    },
  },
];

module.exports = { commands, tasks };
