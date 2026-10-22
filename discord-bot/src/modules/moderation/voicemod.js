'use strict';
const { confirm } = require('../../core/ui');
const lib = require('./_lib');

/** Resolve a member who is currently in a voice channel and passes hierarchy checks. */
async function voiceTarget(ctx, verb, { allowSelf = false } = {}) {
  const member = await lib.getMember(ctx, ctx.args[0]);
  if (!member) {
    await ctx.fail('Member not found.');
    return null;
  }
  const err = lib.hierarchyError(ctx, member, verb, { allowSelf });
  if (err) {
    await ctx.fail(err);
    return null;
  }
  if (!member.voice?.channel) {
    await ctx.fail(`**${member.user.tag}** isn't in a voice channel.`);
    return null;
  }
  return member;
}

function voiceToggle(name, aliases, description, perm, verb, apply, done) {
  return {
    name,
    aliases,
    description,
    modPerm: perm,
    usage: '<user> [reason]',
    examples: ['tester'],
    guildOnly: true,
    botPerms: [perm],
    minArgs: 1,
    async execute(ctx) {
      if (!(await lib.requirePerm(ctx, perm))) return;
      const member = await voiceTarget(ctx, verb);
      if (!member) return;
      const reason = ctx.rest(1);
      const channelId = member.voice.channelId;
      await apply(member, `${ctx.author.tag}: ${reason || name}`);
      await ctx.ok(`${done} **${member.user.tag}**.`);
      await lib.postModlog(ctx.guild, lib.actionEmbed(`🎙️ ${name}`, `${ctx.author} → <@${member.id}> in <#${channelId}>${reason ? `\n**Reason:** ${reason}` : ''}`));
    },
  };
}

/** Voice channel from an argument, or "here" / nothing = the author's current channel. */
function voiceChannelArg(ctx, arg) {
  if (!arg || arg.toLowerCase() === 'here') return ctx.member?.voice?.channel || null;
  const ch = ctx.resolveChannel(arg);
  return ch?.isVoiceBased?.() ? ch : null;
}

const commands = [
  voiceToggle('vmute', ['voicemute'], 'Server-mute a member in voice', 'MuteMembers', 'voice mute', (m, r) => m.voice.setMute(true, r), '🔇 Voice-muted'),
  voiceToggle('vunmute', ['voiceunmute'], 'Remove a member\'s server voice mute', 'MuteMembers', 'voice unmute', (m, r) => m.voice.setMute(false, r), '🔊 Voice-unmuted'),
  voiceToggle('vdeafen', ['voicedeafen', 'vdeaf'], 'Server-deafen a member in voice', 'DeafenMembers', 'deafen', (m, r) => m.voice.setDeaf(true, r), '🙉 Deafened'),
  voiceToggle('vundeafen', ['voiceundeafen', 'vundeaf'], 'Remove a member\'s server deafen', 'DeafenMembers', 'undeafen', (m, r) => m.voice.setDeaf(false, r), '👂 Undeafened'),
  voiceToggle('vkick', ['voicekick', 'vdisconnect'], 'Disconnect a member from voice', 'MoveMembers', 'disconnect', (m, r) => m.voice.disconnect(r), '👋 Disconnected'),
  {
    name: 'vmove',
    modPerm: 'MoveMembers',
    aliases: ['voicemove', 'move'],
    description: 'Move a member to another voice channel',
    usage: '<user> <voice channel>',
    examples: ['tester General'],
    guildOnly: true,
    botPerms: ['MoveMembers'],
    minArgs: 2,
    async execute(ctx) {
      if (!(await lib.requirePerm(ctx, 'MoveMembers'))) return;
      const member = await voiceTarget(ctx, 'move', { allowSelf: true });
      if (!member) return;
      const ch = voiceChannelArg(ctx, ctx.rest(1));
      if (!ch) return ctx.fail('Voice channel not found.');
      await member.voice.setChannel(ch, `${ctx.author.tag}: vmove`);
      await ctx.ok(`Moved **${member.user.tag}** to ${ch}.`);
    },
  },
  {
    name: 'vmoveall',
    modPerm: 'MoveMembers',
    aliases: ['voicemoveall', 'moveall'],
    description: 'Move everyone from one voice channel to another',
    usage: '<from|here> <to>',
    examples: ['here Lounge', '"Gaming 1" "Gaming 2"'],
    guildOnly: true,
    botPerms: ['MoveMembers'],
    cooldown: 15,
    minArgs: 2,
    async execute(ctx) {
      if (!(await lib.requirePerm(ctx, 'MoveMembers'))) return;
      const from = voiceChannelArg(ctx, ctx.args[0]);
      const to = voiceChannelArg(ctx, ctx.args.length > 2 ? ctx.rest(1) : ctx.args[1]);
      if (!from || !to) return ctx.fail('Voice channel not found (use "here" for your current channel; quote names with spaces).');
      if (from.id === to.id) return ctx.fail('Pick two different channels.');
      const members = [...from.members.values()];
      if (!members.length) return ctx.fail(`${from} is empty.`);
      let n = 0;
      for (const m of members) await m.voice.setChannel(to, `${ctx.author.tag}: vmoveall`).then(() => n++).catch(() => {});
      await ctx.ok(`Moved **${n}/${members.length}** member(s) from ${from} to ${to}.`);
    },
  },
  {
    name: 'vkickall',
    modPerm: 'MoveMembers',
    aliases: ['voicekickall', 'vclear'],
    description: 'Disconnect everyone from a voice channel (confirmation required)',
    usage: '[voice channel|here]',
    examples: ['here'],
    guildOnly: true,
    botPerms: ['MoveMembers'],
    cooldown: 15,
    async execute(ctx) {
      if (!(await lib.requirePerm(ctx, 'MoveMembers'))) return;
      const ch = voiceChannelArg(ctx, ctx.rest(0));
      if (!ch) return ctx.fail('Voice channel not found — join one or name it.');
      const members = [...ch.members.values()].filter((m) => m.id !== ctx.client.user.id);
      if (!members.length) return ctx.fail(`${ch} is empty.`);
      if (!(await confirm(ctx, `Disconnect **${members.length}** member(s) from ${ch}?`))) return;
      let n = 0;
      for (const m of members) await m.voice.disconnect(`${ctx.author.tag}: vkickall`).then(() => n++).catch(() => {});
      await ctx.send({ embeds: [ctx.embed({ description: `👋 Disconnected **${n}** member(s) from ${ch}.` })] });
    },
  },
];

module.exports = commands;
