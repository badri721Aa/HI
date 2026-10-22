'use strict';
const db = require('../../core/db');
const { colors } = require('../../core/embeds');
const { parseDuration, formatDuration, truncate, chunk, discordTimestamp } = require('../../core/utils');
const { paginate, confirm } = require('../../core/ui');
const lib = require('./_lib');

const WARN_ACTIONS = ['timeout', 'kick', 'ban'];

function caseLine(c) {
  const m = lib.typeMeta(c.type);
  return `**#${c.id}** ${m.emoji} ${m.label}${c.duration ? ` (${formatDuration(c.duration)})` : ''} — ${truncate(c.reason, 80)}\n   by ${c.modTag} • ${discordTimestamp(c.at)}`;
}

function casesPages(ctx, cases, title) {
  return chunk([...cases].reverse().map(caseLine), 8).map((p, i, a) =>
    ctx.embed({ title, description: p.join('\n'), footer: `${cases.length} case(s) • page ${i + 1}/${a.length}` }),
  );
}

const commands = [
  {
    name: 'warn',
    modPerm: 'ModerateMembers',
    description: 'Warn a member (creates a case; may trigger automatic punishments)',
    usage: '<user> [reason]',
    examples: ['tester please stop spamming', '@nobody'],
    guildOnly: true,
    minArgs: 1,
    slash: true,
    args: [
      { name: 'user', type: 'user', description: 'Member to warn', required: true },
      { name: 'reason', type: 'string', description: 'Reason', rest: true },
    ],
    async execute(ctx) {
      if (!(await lib.requirePerm(ctx, 'ModerateMembers'))) return;
      const member = await lib.getMember(ctx, ctx.args[0]);
      if (!member) return ctx.fail('Member not found.');
      if (member.user.bot) return ctx.fail('You can\'t warn bots.');
      const err = lib.hierarchyError(ctx, member, 'warn');
      if (err) return ctx.fail(err);
      const reason = ctx.rest(1);
      await lib.punish(ctx, { type: 'warn', user: member.user, reason, dmFirst: false, action: async () => {} });
      const count = lib.caseStore(ctx.guild.id).cases.filter((c) => c.type === 'warn' && c.userId === member.id).length;
      const escalated = await lib.applyWarnActions(ctx.guild, member, ctx.author);
      if (escalated) await ctx.send({ embeds: [ctx.embed({ color: colors.warn, description: `⚖️ ${member} reached **${count}** warnings and was automatically **${escalated}**.` })] });
    },
  },
  {
    name: 'warnings',
    aliases: ['warns', 'infractions'],
    description: 'Show a member\'s warnings (yours if no user given)',
    usage: '[user]',
    examples: ['', 'tester'],
    guildOnly: true,
    slash: true,
    args: [{ name: 'user', type: 'user', description: 'Member (defaults to you)' }],
    async execute(ctx) {
      const user = ctx.args[0] ? await lib.getUser(ctx, ctx.args[0]) : ctx.author;
      if (!user) return ctx.fail('User not found.');
      if (user.id !== ctx.author.id && !lib.hasPerm(ctx, 'ModerateMembers')) return ctx.fail('You can only view your own warnings.');
      const warns = lib.caseStore(ctx.guild.id).cases.filter((c) => c.type === 'warn' && c.userId === user.id);
      if (!warns.length) return ctx.info(`✅ **${user.tag || user.username}** has no warnings.`);
      await paginate(ctx, casesPages(ctx, warns, `⚠️ Warnings for ${user.tag || user.username}`));
    },
  },
  {
    name: 'delwarn',
    modPerm: 'ModerateMembers',
    aliases: ['removewarn', 'unwarn', 'rmwarn'],
    description: 'Delete a warning by its case number',
    usage: '<case #>',
    examples: ['12'],
    guildOnly: true,
    minArgs: 1,
    async execute(ctx) {
      if (!(await lib.requirePerm(ctx, 'ModerateMembers'))) return;
      const store = lib.caseStore(ctx.guild.id);
      const id = parseInt(String(ctx.args[0]).replace('#', ''), 10);
      const idx = store.cases.findIndex((c) => c.id === id && c.type === 'warn');
      if (idx === -1) return ctx.fail(`No warning with case **#${ctx.args[0]}**.`);
      const [c] = store.cases.splice(idx, 1);
      db.save();
      await ctx.ok(`Removed warning **#${c.id}** from **${c.userTag}**.`);
      await lib.postModlog(ctx.guild, lib.actionEmbed('🗑️ Warning removed', `${ctx.author} removed warning #${c.id} (${c.userTag}): ${truncate(c.reason, 300)}`));
    },
  },
  {
    name: 'clearwarns',
    modPerm: 'ModerateMembers',
    aliases: ['clearwarnings', 'resetwarns'],
    description: 'Remove all of a member\'s warnings',
    usage: '<user>',
    examples: ['tester'],
    guildOnly: true,
    minArgs: 1,
    async execute(ctx) {
      if (!(await lib.requirePerm(ctx, 'ModerateMembers'))) return;
      const user = await lib.getUser(ctx, ctx.args[0]);
      if (!user) return ctx.fail('User not found.');
      const store = lib.caseStore(ctx.guild.id);
      const count = store.cases.filter((c) => c.type === 'warn' && c.userId === user.id).length;
      if (!count) return ctx.info(`**${user.tag || user.username}** has no warnings.`);
      if (!(await confirm(ctx, `Clear **${count}** warning(s) for **${user.tag || user.username}**?`))) return;
      store.cases = store.cases.filter((c) => !(c.type === 'warn' && c.userId === user.id));
      db.save();
      await ctx.send({ embeds: [ctx.embed({ description: `🧽 Cleared **${count}** warning(s) for **${user.tag || user.username}**.` })] });
      await lib.postModlog(ctx.guild, lib.actionEmbed('🧽 Warnings cleared', `${ctx.author} cleared ${count} warning(s) for <@${user.id}>.`));
    },
  },
  {
    name: 'warnaction',
    aliases: ['warnpunish', 'warnthreshold'],
    description: 'Auto-punish at N warnings: warnaction <count> <timeout|kick|ban|off> [duration]',
    usage: '<count> <timeout|kick|ban|off> [duration] | list',
    examples: ['list', '3 timeout 1h', '5 kick', '3 off'],
    guildOnly: true,
    userPerms: ['ManageGuild'],
    minArgs: 1,
    async execute(ctx) {
      const cfg = lib.settings(ctx.guild.id);
      if (ctx.args[0].toLowerCase() === 'list') {
        const entries = Object.entries(cfg.warnActions).sort((a, b) => a[0] - b[0]);
        if (!entries.length) return ctx.info('No automatic warn punishments set. Example: `warnaction 3 timeout 1h`.');
        return ctx.info(entries.map(([n, s]) => `**${n} warnings** → ${s.action}${s.duration ? ` (${formatDuration(s.duration)})` : ''}`).join('\n'), '⚖️ Warn escalation');
      }
      const count = parseInt(ctx.args[0], 10);
      const action = String(ctx.args[1] || '').toLowerCase();
      if (!(count >= 1 && count <= 50) || ![...WARN_ACTIONS, 'off', 'none', 'remove'].includes(action)) return ctx.usage();
      if (['off', 'none', 'remove'].includes(action)) {
        delete cfg.warnActions[String(count)];
        db.save();
        return ctx.ok(`Removed the action at **${count}** warnings.`);
      }
      let duration = null;
      if (action === 'timeout') {
        duration = parseDuration(ctx.args[2] || '1h');
        if (!duration || duration > 28 * 86400000) return ctx.fail('Give a timeout duration up to 28d, e.g. `1h`.');
      }
      cfg.warnActions[String(count)] = { action, duration };
      db.save();
      await ctx.ok(`At **${count}** warnings members will be **${action}**${duration ? ` for ${formatDuration(duration)}` : ''}.`);
    },
  },
  {
    name: 'modlogs',
    modPerm: 'ModerateMembers',
    aliases: ['history', 'cases'],
    description: 'Show every moderation case for a user',
    usage: '<user>',
    examples: ['tester'],
    guildOnly: true,
    minArgs: 1,
    slash: true,
    args: [{ name: 'user', type: 'user', description: 'User to look up', required: true }],
    async execute(ctx) {
      if (!(await lib.requirePerm(ctx, 'ModerateMembers'))) return;
      const user = await lib.getUser(ctx, ctx.args[0]);
      const id = user?.id || String(ctx.args[0]).replace(/[<@!>]/g, '');
      const cases = lib.caseStore(ctx.guild.id).cases.filter((c) => c.userId === id);
      if (!cases.length) return ctx.info(`✅ No cases for **${user?.tag || id}**.`);
      await paginate(ctx, casesPages(ctx, cases, `📁 Mod logs for ${user?.tag || id}`));
    },
  },
  {
    name: 'case',
    modPerm: 'ModerateMembers',
    aliases: ['viewcase'],
    description: 'Show one moderation case',
    usage: '<case #>',
    examples: ['1'],
    guildOnly: true,
    minArgs: 1,
    async execute(ctx) {
      if (!(await lib.requirePerm(ctx, 'ModerateMembers'))) return;
      const c = lib.findCase(ctx.guild.id, String(ctx.args[0]).replace('#', ''));
      if (!c) return ctx.fail(`Case **#${ctx.args[0]}** not found.`);
      await ctx.reply({ embeds: [lib.caseEmbed(c)] });
    },
  },
  {
    name: 'reason',
    modPerm: 'ModerateMembers',
    aliases: ['editcase'],
    description: 'Change the reason of a moderation case',
    usage: '<case #> <new reason>',
    examples: ['1 Spamming invite links'],
    guildOnly: true,
    minArgs: 2,
    async execute(ctx) {
      if (!(await lib.requirePerm(ctx, 'ModerateMembers'))) return;
      const c = lib.findCase(ctx.guild.id, String(ctx.args[0]).replace('#', ''));
      if (!c) return ctx.fail(`Case **#${ctx.args[0]}** not found.`);
      if (c.modId !== ctx.author.id && !lib.hasPerm(ctx, 'ManageGuild')) return ctx.fail('Only the case\'s moderator (or a Manage Server admin) can edit it.');
      c.reason = truncate(ctx.rest(1), 900);
      c.editedBy = ctx.author.id;
      db.save();
      await ctx.ok(`Updated the reason for case **#${c.id}**.`);
      await lib.postModlog(ctx.guild, lib.actionEmbed(`✏️ Case #${c.id} edited`, `${ctx.author} changed the reason to: ${c.reason}`));
    },
  },
  {
    name: 'deletecase',
    aliases: ['delcase', 'removecase'],
    description: 'Delete a moderation case',
    usage: '<case #>',
    examples: ['1'],
    guildOnly: true,
    userPerms: ['ManageGuild'],
    minArgs: 1,
    async execute(ctx) {
      const store = lib.caseStore(ctx.guild.id);
      const id = parseInt(String(ctx.args[0]).replace('#', ''), 10);
      const idx = store.cases.findIndex((c) => c.id === id);
      if (idx === -1) return ctx.fail(`Case **#${ctx.args[0]}** not found.`);
      const [c] = store.cases.splice(idx, 1);
      db.save();
      await ctx.ok(`Deleted case **#${c.id}** (${lib.typeMeta(c.type).label} — ${c.userTag}).`);
    },
  },
  {
    name: 'modstats',
    modPerm: 'ModerateMembers',
    aliases: ['modstat'],
    description: 'Moderation statistics for the server or one moderator',
    usage: '[moderator]',
    examples: ['', 'tester'],
    guildOnly: true,
    async execute(ctx) {
      if (!(await lib.requirePerm(ctx, 'ModerateMembers'))) return;
      const cases = lib.caseStore(ctx.guild.id).cases;
      const mod = ctx.args[0] ? await lib.getUser(ctx, ctx.args[0]) : null;
      if (ctx.args[0] && !mod) return ctx.fail('User not found.');
      const list = mod ? cases.filter((c) => c.modId === mod.id) : cases;
      const since = (ms) => list.filter((c) => c.at > Date.now() - ms).length;
      const byType = {};
      for (const c of list) byType[c.type] = (byType[c.type] || 0) + 1;
      const fields = [
        { name: 'Last 7 days', value: String(since(7 * 86400000)), inline: true },
        { name: 'Last 30 days', value: String(since(30 * 86400000)), inline: true },
        { name: 'All time', value: String(list.length), inline: true },
        { name: 'By type', value: Object.entries(byType).map(([t, n]) => `${lib.typeMeta(t).emoji} ${lib.typeMeta(t).label}: **${n}**`).join('\n') || 'none' },
      ];
      if (!mod) {
        const byMod = {};
        for (const c of list) byMod[c.modId] = (byMod[c.modId] || 0) + 1;
        const top = Object.entries(byMod).sort((a, b) => b[1] - a[1]).slice(0, 10);
        fields.push({ name: 'Top moderators', value: top.map(([id, n], i) => `${i + 1}. <@${id}> — **${n}**`).join('\n') || 'none' });
      }
      await ctx.reply({ embeds: [ctx.embed({ title: `📊 Mod stats${mod ? ` — ${mod.tag || mod.username}` : ''}`, fields })] });
    },
  },
  {
    name: 'report',
    description: 'Report a member to the moderators privately',
    usage: '<user> <reason>',
    examples: ['tester posting scam links'],
    guildOnly: true,
    cooldown: 60,
    minArgs: 2,
    slash: true,
    args: [
      { name: 'user', type: 'user', description: 'Who are you reporting?', required: true },
      { name: 'reason', type: 'string', description: 'What happened?', required: true, rest: true },
    ],
    async execute(ctx) {
      const user = await lib.getUser(ctx, ctx.args[0]);
      if (!user) return ctx.fail('User not found.');
      if (user.id === ctx.author.id) return ctx.fail('You can\'t report yourself.');
      const cfg = lib.settings(ctx.guild.id);
      const ch = ctx.guild.channels.cache.get(cfg.reportChannel) || lib.modlogChannel(ctx.guild);
      if (!ch?.isTextBased?.()) return ctx.fail('This server has no report or modlog channel set up yet. Ask an admin to run `setreportchannel`.');
      const reason = truncate(ctx.rest(1), 1000);
      const jump = ctx.message?.url;
      if (!ctx.isSlash) ctx.message.delete().catch(() => {});
      await ch.send({
        embeds: [
          ctx.embed({
            color: colors.warn,
            title: '🚩 New report',
            fields: [
              { name: 'Reported user', value: `<@${user.id}> (${user.tag || user.username})\n\`${user.id}\``, inline: true },
              { name: 'Reported by', value: `<@${ctx.author.id}> (${ctx.author.tag || ctx.author.username})`, inline: true },
              { name: 'Channel', value: `<#${ctx.channel.id}>${jump ? ` • [context](${jump})` : ''}`, inline: true },
              { name: 'Reason', value: reason },
            ],
            timestamp: true,
          }),
        ],
        allowedMentions: { parse: [] },
      });
      const msg = await ctx.reply({ embeds: [ctx.embed({ description: '✅ Your report was sent to the moderators. Thank you!' })], ephemeral: true });
      lib.autoDelete(ctx, msg, 6000);
    },
  },
  {
    name: 'setreportchannel',
    aliases: ['reportchannel'],
    description: 'Set where member reports are sent (defaults to the modlog channel)',
    usage: '<#channel|off>',
    examples: ['#reports', 'off'],
    guildOnly: true,
    userPerms: ['ManageGuild'],
    minArgs: 1,
    async execute(ctx) {
      const cfg = lib.settings(ctx.guild.id);
      if (['off', 'none', 'reset'].includes(ctx.args[0].toLowerCase())) {
        cfg.reportChannel = null;
        db.save();
        return ctx.ok('Reports will go to the modlog channel.');
      }
      const ch = ctx.resolveChannel(ctx.args[0]);
      if (!ch?.isTextBased?.()) return ctx.fail('Text channel not found.');
      cfg.reportChannel = ch.id;
      db.save();
      await ctx.ok(`Reports will be sent to ${ch}.`);
    },
  },
];

module.exports = commands;
