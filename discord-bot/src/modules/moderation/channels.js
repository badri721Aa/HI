'use strict';
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { colors } = require('../../core/embeds');
const { parseDuration, formatDuration, truncate } = require('../../core/utils');
const { confirm } = require('../../core/ui');
const lib = require('./_lib');

/** "[#channel] [reason…]" → { channel, reason } (channel defaults to the current one). */
function channelAndReason(ctx) {
  const ch = ctx.args[0] ? ctx.resolveChannel(ctx.args[0]) : null;
  return ch ? { channel: ch, reason: ctx.rest(1) } : { channel: ctx.channel, reason: ctx.rest(0) };
}

function editable(ctx, channel) {
  if (!channel?.permissionOverwrites) return 'That channel can\'t be edited.';
  const me = ctx.guild.members.me;
  if (!channel.permissionsFor?.(me)?.has(PermissionFlagsBits.ManageRoles)) return `I need **Manage Permissions** in ${channel}.`;
  return null;
}

const commands = [
  {
    name: 'slowmode',
    aliases: ['slow', 'sm'],
    description: 'Set a channel\'s slowmode (0/off to disable, max 6h)',
    usage: '<duration|off> [#channel]',
    examples: ['10s', 'off', '5m #general'],
    guildOnly: true,
    botPerms: ['ManageChannels'],
    minArgs: 1,
    slash: true,
    args: [
      { name: 'duration', type: 'string', description: 'e.g. 5s, 1m, 2h, or off', required: true },
      { name: 'channel', type: 'channel', description: 'Channel (defaults to this one)' },
    ],
    async execute(ctx) {
      if (!(await lib.requirePerm(ctx, 'ManageChannels'))) return;
      const channel = ctx.args[1] ? ctx.resolveChannel(ctx.args[1]) : ctx.channel;
      if (!channel?.setRateLimitPerUser) return ctx.fail('That channel doesn\'t support slowmode.');
      const off = ['off', '0', 'none', 'disable'].includes(ctx.args[0].toLowerCase());
      const ms = off ? 0 : /^\d+$/.test(ctx.args[0]) ? parseInt(ctx.args[0], 10) * 1000 : parseDuration(ctx.args[0]);
      if (ms === null || ms === undefined || Number.isNaN(ms)) return ctx.usage('Give a duration like `10s`, `5m`, `1h` (bare numbers are seconds).');
      const seconds = Math.round(ms / 1000);
      if (seconds > 21600) return ctx.fail('Slowmode can be at most **6 hours**.');
      await channel.setRateLimitPerUser(seconds, `${ctx.author.tag}: slowmode`);
      await ctx.ok(seconds ? `Slowmode in ${channel} set to **${formatDuration(seconds * 1000)}**.` : `Slowmode disabled in ${channel}.`);
    },
  },
  {
    name: 'lock',
    aliases: ['lockchannel'],
    description: 'Stop @everyone from sending messages in a channel',
    usage: '[#channel] [reason]',
    examples: ['', '#general raid in progress'],
    guildOnly: true,
    botPerms: ['ManageChannels'],
    slash: true,
    args: [
      { name: 'channel', type: 'channel', description: 'Channel (defaults to this one)' },
      { name: 'reason', type: 'string', description: 'Reason', rest: true },
    ],
    async execute(ctx) {
      if (!(await lib.requirePerm(ctx, 'ManageChannels'))) return;
      const { channel, reason } = channelAndReason(ctx);
      const err = editable(ctx, channel);
      if (err) return ctx.fail(err);
      if (lib.isLocked(channel)) return ctx.fail(`${channel} is already locked.`);
      await lib.lockChannel(channel, `${ctx.author.tag}: ${reason || 'lock'}`);
      await ctx.reply({ embeds: [ctx.embed({ color: colors.error, description: `🔒 ${channel} has been locked.${reason ? `\n**Reason:** ${truncate(reason, 500)}` : ''}` })] });
      if (channel.id !== ctx.channel.id) channel.send({ embeds: [ctx.embed({ color: colors.error, description: `🔒 This channel has been locked by a moderator.${reason ? `\n**Reason:** ${truncate(reason, 500)}` : ''}` })] }).catch(() => {});
      await lib.postModlog(ctx.guild, lib.actionEmbed('🔒 Channel locked', `${ctx.author} locked <#${channel.id}>.${reason ? `\n**Reason:** ${truncate(reason, 500)}` : ''}`, colors.error));
    },
  },
  {
    name: 'unlock',
    aliases: ['unlockchannel'],
    description: 'Let @everyone send messages in a channel again',
    usage: '[#channel] [reason]',
    examples: ['', '#general'],
    guildOnly: true,
    botPerms: ['ManageChannels'],
    slash: true,
    args: [
      { name: 'channel', type: 'channel', description: 'Channel (defaults to this one)' },
      { name: 'reason', type: 'string', description: 'Reason', rest: true },
    ],
    async execute(ctx) {
      if (!(await lib.requirePerm(ctx, 'ManageChannels'))) return;
      const { channel, reason } = channelAndReason(ctx);
      const err = editable(ctx, channel);
      if (err) return ctx.fail(err);
      if (!lib.isLocked(channel)) return ctx.fail(`${channel} is not locked.`);
      await lib.unlockChannel(channel, `${ctx.author.tag}: ${reason || 'unlock'}`);
      await ctx.reply({ embeds: [ctx.embed({ color: colors.success, description: `🔓 ${channel} has been unlocked.` })] });
      await lib.postModlog(ctx.guild, lib.actionEmbed('🔓 Channel unlocked', `${ctx.author} unlocked <#${channel.id}>.`, colors.success));
    },
  },
  {
    name: 'lockdown',
    aliases: ['lockall', 'serverlock'],
    description: 'Lock every text channel in the server (confirmation required)',
    usage: '[reason]',
    examples: ['raid in progress'],
    guildOnly: true,
    botPerms: ['ManageChannels'],
    cooldown: 30,
    async execute(ctx) {
      if (!(await lib.requirePerm(ctx, 'ManageGuild'))) return;
      const reason = ctx.rest(0) || 'Server lockdown';
      if (!(await confirm(ctx, `🔒 Lock **all** text channels for @everyone?\n**Reason:** ${truncate(reason, 300)}`))) return;
      const status = await ctx.send({ embeds: [ctx.embed({ description: '⏳ Locking channels…' })] });
      const { locked, total } = await lib.lockdownGuild(ctx.guild, `${ctx.author.tag}: ${reason}`, (n, t) =>
        status.edit({ embeds: [ctx.embed({ description: `⏳ Locked ${n}/${t} channels…` })] }).catch(() => {}),
      );
      await status.edit({ embeds: [ctx.embed({ color: colors.error, description: `🔒 Lockdown active: locked **${locked}/${total}** channel(s). Use \`${ctx.prefix}unlockdown\` to undo.` })] }).catch(() => {});
      await lib.postModlog(ctx.guild, lib.actionEmbed('🚨 Server lockdown', `${ctx.author} locked ${locked} channel(s).\n**Reason:** ${truncate(reason, 500)}`, colors.error));
    },
  },
  {
    name: 'unlockdown',
    aliases: ['unlockall', 'serverunlock'],
    description: 'Unlock every channel locked by the last lockdown',
    guildOnly: true,
    botPerms: ['ManageChannels'],
    cooldown: 30,
    async execute(ctx) {
      if (!(await lib.requirePerm(ctx, 'ManageGuild'))) return;
      if (!lib.settings(ctx.guild.id).lockdownChannels?.length) return ctx.fail('There is no active lockdown to undo.');
      if (!(await confirm(ctx, '🔓 Unlock every channel from the last lockdown?', { danger: false }))) return;
      const { unlocked, total } = await lib.unlockdownGuild(ctx.guild, `${ctx.author.tag}: lockdown lifted`);
      await ctx.send({ embeds: [ctx.embed({ color: colors.success, description: `🔓 Lockdown lifted: unlocked **${unlocked}/${total}** channel(s).` })] });
      await lib.postModlog(ctx.guild, lib.actionEmbed('✅ Lockdown lifted', `${ctx.author} unlocked ${unlocked} channel(s).`, colors.success));
    },
  },
  {
    name: 'hide',
    aliases: ['hidechannel'],
    description: 'Hide a channel from @everyone',
    usage: '[#channel]',
    examples: ['', '#staff-chat'],
    guildOnly: true,
    botPerms: ['ManageChannels'],
    async execute(ctx) {
      if (!(await lib.requirePerm(ctx, 'ManageChannels'))) return;
      const { channel } = channelAndReason(ctx);
      const err = editable(ctx, channel);
      if (err) return ctx.fail(err);
      await channel.permissionOverwrites.edit(ctx.guild.roles.everyone, { ViewChannel: false }, { reason: `${ctx.author.tag}: hide` });
      await ctx.ok(`🙈 ${channel} is now hidden from @everyone.`);
    },
  },
  {
    name: 'unhide',
    aliases: ['showchannel', 'unhidechannel'],
    description: 'Make a hidden channel visible to @everyone again',
    usage: '[#channel]',
    examples: ['', '#staff-chat'],
    guildOnly: true,
    botPerms: ['ManageChannels'],
    async execute(ctx) {
      if (!(await lib.requirePerm(ctx, 'ManageChannels'))) return;
      const { channel } = channelAndReason(ctx);
      const err = editable(ctx, channel);
      if (err) return ctx.fail(err);
      await channel.permissionOverwrites.edit(ctx.guild.roles.everyone, { ViewChannel: null }, { reason: `${ctx.author.tag}: unhide` });
      await ctx.ok(`👀 ${channel} is visible to @everyone again.`);
    },
  },
  {
    name: 'nuke',
    aliases: ['wipechannel'],
    description: 'Clone a channel and delete the original — wipes all messages (confirmation)',
    usage: '[#channel]',
    examples: [''],
    guildOnly: true,
    botPerms: ['ManageChannels'],
    cooldown: 30,
    async execute(ctx) {
      if (!(await lib.requirePerm(ctx, 'ManageChannels'))) return;
      const channel = ctx.args[0] ? ctx.resolveChannel(ctx.args[0]) : ctx.channel;
      if (!channel?.clone || ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) return ctx.fail('Only text/announcement channels can be nuked.');
      if ([ctx.guild.rulesChannelId, ctx.guild.publicUpdatesChannelId].includes(channel.id)) {
        return ctx.fail('Community rules/updates channels can\'t be deleted. Pick another channel in Server Settings first.');
      }
      const ok = await confirm(ctx, `💣 This **deletes ${channel}** and recreates it empty with the same settings. All messages are lost forever. Continue?`, { yes: 'Nuke it' });
      if (!ok) return;
      let clone;
      try {
        clone = await channel.clone({ reason: `Nuked by ${ctx.author.tag}` });
        await clone.setPosition(channel.position).catch(() => {});
        await channel.delete(`Nuked by ${ctx.author.tag}`);
      } catch (err) {
        if (clone) await clone.delete('Nuke failed — removing clone').catch(() => {});
        throw Object.assign(err, { userMessage: `Nuke failed: ${err.message}` });
      }
      await clone.send({ embeds: [ctx.embed({ color: colors.error, title: '💥 Channel nuked', description: `This channel was wiped by ${ctx.author}.` })] }).catch(() => {});
      await lib.postModlog(ctx.guild, lib.actionEmbed('💣 Channel nuked', `${ctx.author} nuked #${channel.name} (now <#${clone.id}>).`, colors.error));
    },
  },
];

module.exports = commands;
