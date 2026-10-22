'use strict';
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const db = require('../../core/db');
const { colors } = require('../../core/embeds');
const { parseDuration, truncate } = require('../../core/utils');
const { confirm } = require('../../core/ui');
const lib = require('./_lib');
const jail = require('./_jail');

const HOIST_RE = /^[\s!-/:-@[-`{-~]+/;

function dehoisted(name) {
  const stripped = name.replace(HOIST_RE, '').trim();
  return stripped.slice(0, 32) || 'Dehoisted';
}

/** Turn "𝕱𝖆𝖓𝖈𝖞 ★ ｎａｍｅ" into "Fancy name" (plain readable ASCII). */
function decancered(name) {
  const plain = name
    .normalize('NFKD')
    .replace(/[̀-ͯ҉᷀-᷿⃐-⃿︠-︯]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length >= 2 ? plain.slice(0, 32) : 'Moderated Nickname';
}

async function setNick(ctx, member, nick, why) {
  if (!member.manageable) throw Object.assign(new Error('unmanageable'), { userMessage: 'I can\'t change that member\'s nickname (role hierarchy).' });
  await member.setNickname(nick, `${ctx.author.tag}: ${why}`);
}

const commands = [
  {
    name: 'nick',
    modPerm: 'ManageNicknames',
    aliases: ['setnick', 'nickname'],
    description: 'Change a member\'s nickname (leave empty to reset)',
    usage: '<user> [new nickname]',
    examples: ['tester Cool Person', 'tester'],
    guildOnly: true,
    botPerms: ['ManageNicknames'],
    minArgs: 1,
    slash: true,
    args: [
      { name: 'user', type: 'user', description: 'Member', required: true },
      { name: 'nickname', type: 'string', description: 'New nickname (empty = reset)', rest: true },
    ],
    async execute(ctx) {
      if (!(await lib.requirePerm(ctx, 'ManageNicknames'))) return;
      const member = await lib.getMember(ctx, ctx.args[0]);
      if (!member) return ctx.fail('Member not found.');
      const err = lib.hierarchyError(ctx, member, 'rename', { allowSelf: true });
      if (err) return ctx.fail(err);
      const nick = ctx.rest(1);
      if (nick.length > 32) return ctx.fail('Nicknames can be at most 32 characters.');
      await setNick(ctx, member, nick || null, 'nickname change');
      await ctx.ok(nick ? `Renamed **${member.user.tag}** to **${nick}**.` : `Reset **${member.user.tag}**'s nickname.`);
    },
  },
  {
    name: 'resetnick',
    modPerm: 'ManageNicknames',
    aliases: ['clearnick', 'removenick'],
    description: 'Reset a member\'s nickname',
    usage: '<user>',
    examples: ['tester'],
    guildOnly: true,
    botPerms: ['ManageNicknames'],
    minArgs: 1,
    async execute(ctx) {
      if (!(await lib.requirePerm(ctx, 'ManageNicknames'))) return;
      const member = await lib.getMember(ctx, ctx.args[0]);
      if (!member) return ctx.fail('Member not found.');
      const err = lib.hierarchyError(ctx, member, 'rename', { allowSelf: true });
      if (err) return ctx.fail(err);
      if (!member.nickname) return ctx.fail('That member has no nickname.');
      await setNick(ctx, member, null, 'nickname reset');
      await ctx.ok(`Reset **${member.user.tag}**'s nickname.`);
    },
  },
  {
    name: 'dehoist',
    modPerm: 'ManageNicknames',
    description: 'Strip symbols that push names to the top of the member list (user or "all")',
    usage: '<user|all>',
    examples: ['tester', 'all'],
    guildOnly: true,
    botPerms: ['ManageNicknames'],
    cooldown: 10,
    minArgs: 1,
    async execute(ctx) {
      if (!(await lib.requirePerm(ctx, 'ManageNicknames'))) return;
      if (ctx.args[0].toLowerCase() === 'all') {
        await ctx.defer();
        const members = await ctx.guild.members.fetch().catch(() => ctx.guild.members.cache);
        const targets = [...members.values()].filter((m) => !m.user.bot && HOIST_RE.test(m.displayName) && m.manageable);
        if (!targets.length) return ctx.info('✅ No hoisted names found.');
        if (!(await confirm(ctx, `Dehoist **${targets.length}** member(s)?`, { danger: false }))) return;
        let n = 0;
        for (const m of targets) {
          await m.setNickname(dehoisted(m.displayName), `${ctx.author.tag}: dehoist`).then(() => n++).catch(() => {});
        }
        return ctx.send({ embeds: [ctx.embed({ description: `✅ Dehoisted **${n}/${targets.length}** member(s).` })] });
      }
      const member = await lib.getMember(ctx, ctx.args[0]);
      if (!member) return ctx.fail('Member not found.');
      if (!HOIST_RE.test(member.displayName)) return ctx.info(`**${member.displayName}** isn't hoisted.`);
      await setNick(ctx, member, dehoisted(member.displayName), 'dehoist');
      await ctx.ok(`Dehoisted **${member.user.tag}** → **${dehoisted(member.displayName)}**.`);
    },
  },
  {
    name: 'decancer',
    modPerm: 'ManageNicknames',
    aliases: ['normalize', 'cleannick'],
    description: 'Replace a fancy/unreadable unicode name with plain text',
    usage: '<user>',
    examples: ['tester'],
    guildOnly: true,
    botPerms: ['ManageNicknames'],
    minArgs: 1,
    async execute(ctx) {
      if (!(await lib.requirePerm(ctx, 'ManageNicknames'))) return;
      const member = await lib.getMember(ctx, ctx.args[0]);
      if (!member) return ctx.fail('Member not found.');
      const err = lib.hierarchyError(ctx, member, 'rename', { allowSelf: true });
      if (err) return ctx.fail(err);
      const clean = decancered(member.displayName);
      if (clean === member.displayName) return ctx.info('That name is already plain text.');
      await setNick(ctx, member, clean, 'decancer');
      await ctx.ok(`Renamed **${truncate(member.displayName, 40)}** → **${clean}**.`);
    },
  },
  {
    name: 'jailsetup',
    description: 'Create a Jailed role + #jail channel and hide every other channel from jailed members',
    guildOnly: true,
    userPerms: ['ManageGuild'],
    botPerms: ['ManageRoles', 'ManageChannels'],
    cooldown: 60,
    async execute(ctx) {
      const cfg = lib.settings(ctx.guild.id);
      if (!(await confirm(ctx, 'This creates a **Jailed** role and a **#jail** channel and edits permissions on every channel. Continue?', { danger: false }))) return;
      const status = await ctx.send({ embeds: [ctx.embed({ description: '⏳ Setting up jail…' })] });
      let role = ctx.guild.roles.cache.get(cfg.jailRole);
      if (!role) {
        role = await ctx.guild.roles.create({ name: 'Jailed', permissions: [], colors: { primaryColor: 0x546e7a }, reason: `Jail setup by ${ctx.author.tag}` });
      }
      const me = ctx.guild.members.me;
      let done = 0;
      const channels = ctx.guild.channels.cache.filter((c) => !c.isThread?.() && c.permissionOverwrites && c.permissionsFor(me)?.has(PermissionFlagsBits.ManageRoles));
      for (const ch of channels.values()) {
        await ch.permissionOverwrites.edit(role, { ViewChannel: false, SendMessages: false, Connect: false }, { reason: 'Jail setup' }).then(() => done++).catch(() => {});
      }
      let jailChannel = ctx.guild.channels.cache.get(cfg.jailChannel);
      if (!jailChannel) {
        jailChannel = await ctx.guild.channels.create({
          name: 'jail',
          type: ChannelType.GuildText,
          topic: 'You are jailed. Talk to the moderators here.',
          permissionOverwrites: [
            { id: ctx.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: role.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
            { id: me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] },
          ],
          reason: 'Jail setup',
        });
      }
      cfg.jailRole = role.id;
      cfg.jailChannel = jailChannel.id;
      db.save();
      await status.edit({ embeds: [ctx.embed({ color: colors.success, description: `✅ Jail ready: role ${role}, channel ${jailChannel}. Updated **${done}** channel(s).\nTip: give your moderator roles access to ${jailChannel}.` })] }).catch(() => {});
    },
  },
  {
    name: 'setjail',
    aliases: ['jailrole'],
    description: 'Use an existing role (and optional channel) for jail',
    usage: '<role> [#channel]',
    examples: ['Jailed', '@Jailed #jail'],
    guildOnly: true,
    userPerms: ['ManageGuild'],
    minArgs: 1,
    async execute(ctx) {
      const cfg = lib.settings(ctx.guild.id);
      const ch = ctx.args.length > 1 ? ctx.resolveChannel(ctx.args[ctx.args.length - 1]) : null;
      const roleText = ch ? ctx.args.slice(0, -1).join(' ') : ctx.rest(0);
      const role = ctx.resolveRole(roleText);
      const err = lib.roleError(ctx, role);
      if (err) return ctx.fail(err);
      cfg.jailRole = role.id;
      if (ch) cfg.jailChannel = ch.id;
      db.save();
      await ctx.ok(`Jail role set to ${role}${ch ? ` and jail channel to ${ch}` : ''}.`);
    },
  },
  {
    name: 'jail',
    modPerm: 'ModerateMembers',
    description: 'Remove a member\'s roles and lock them in the jail channel (optional duration)',
    usage: '<user> [duration] [reason]',
    examples: ['tester 1h being disruptive', '@nobody'],
    guildOnly: true,
    botPerms: ['ManageRoles'],
    minArgs: 1,
    async execute(ctx) {
      if (!(await lib.requirePerm(ctx, 'ModerateMembers'))) return;
      const member = await lib.getMember(ctx, ctx.args[0]);
      if (!member) return ctx.fail('Member not found.');
      const err = lib.hierarchyError(ctx, member, 'jail');
      if (err) return ctx.fail(err);
      if (jail.isJailed(ctx.guild.id, member.id)) return ctx.fail('That member is already jailed.');
      let duration = null;
      let from = 1;
      if (lib.looksLikeDuration(ctx.args[1])) {
        duration = parseDuration(ctx.args[1]);
        from = 2;
      }
      const reason = ctx.rest(from);
      await lib.punish(ctx, { type: 'jail', user: member.user, reason, duration, dmFirst: false, action: () => jail.jailMember(member, `${ctx.author.tag}: ${reason || 'jailed'}`) });
      if (duration) lib.addTimer(ctx.client, ctx.guild.id, 'unjail', member.id, Date.now() + duration);
    },
  },
  {
    name: 'unjail',
    modPerm: 'ModerateMembers',
    aliases: ['release'],
    description: 'Release a jailed member and give their roles back',
    usage: '<user> [reason]',
    examples: ['tester'],
    guildOnly: true,
    botPerms: ['ManageRoles'],
    minArgs: 1,
    async execute(ctx) {
      if (!(await lib.requirePerm(ctx, 'ModerateMembers'))) return;
      const user = await lib.getUser(ctx, ctx.args[0]);
      if (!user) return ctx.fail('User not found.');
      const reason = ctx.rest(1);
      let released = false;
      await lib.punish(ctx, {
        type: 'unjail',
        user,
        reason,
        dmFirst: false,
        silent: true,
        action: async () => {
          released = await jail.releaseJail(ctx.guild, user.id, `${ctx.author.tag}: ${reason || 'released'}`);
          if (!released) throw Object.assign(new Error('not jailed'), { userMessage: 'That member is not jailed.' });
        },
      });
      await ctx.ok(`🕊️ Released **${user.tag || user.username}** from jail.`);
    },
  },
];

module.exports = commands;
