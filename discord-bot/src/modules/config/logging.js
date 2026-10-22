'use strict';
/**
 * Server logging: posts message edits/deletes, joins/leaves, role & nickname
 * changes, timeouts, voice activity, bans, channel and role changes to a log channel.
 */
const { AttachmentBuilder } = require('discord.js');
const db = require('../../core/db');
const { embed, colors } = require('../../core/embeds');
const { truncate, discordTimestamp, parseToggle } = require('../../core/utils');
const mod = require('../moderation/_lib');

const EVENTS = {
  messageDelete: '🗑️ Deleted messages',
  messageEdit: '✏️ Edited messages',
  bulkDelete: '🧹 Bulk deletes / purges',
  memberJoin: '📥 Member joins',
  memberLeave: '📤 Member leaves',
  memberRoles: '🎭 Member role changes',
  nicknames: '🏷️ Nickname changes',
  timeouts: '🔇 Timeouts',
  voice: '🔊 Voice join/leave/move',
  bans: '🔨 Bans & unbans',
  channels: '#️⃣ Channel create/delete/update',
  roles: '🎨 Role create/delete/update',
};

const DEFAULTS = {
  channel: null,
  ignoredChannels: [],
  events: Object.fromEntries(Object.keys(EVENTS).map((k) => [k, true])),
};
const settings = (guildId) => db.section(guildId, 'logging', DEFAULTS);

/** Post a log entry if logging (and this event) is enabled. `dedupe` keeps multiple bots from double-posting. */
async function post(guild, key, opts, dedupe, files) {
  if (!guild) return;
  const raw = db.guild(guild.id).logging;
  if (!raw?.channel) return;
  const cfg = settings(guild.id);
  if (!cfg.events[key]) return;
  if (dedupe && !mod.claim(`log:${key}:${dedupe}`)) return;
  const ch = guild.channels.cache.get(cfg.channel);
  if (!ch?.isTextBased?.()) return;
  await ch.send({ embeds: [embed({ timestamp: true, ...opts })], files, allowedMentions: { parse: [] } }).catch(() => {});
}

const ignored = (guild, channelId, parentId) => {
  const raw = db.guild(guild.id).logging;
  if (!raw?.channel) return true;
  return raw.channel === channelId || (raw.ignoredChannels || []).includes(channelId) || (parentId && (raw.ignoredChannels || []).includes(parentId));
};

const userLine = (u) => (u ? `<@${u.id}> (${u.tag || u.username}) \`${u.id}\`` : 'Unknown');

// ---------------------------------------------------------------- listeners

const events = {
  async messageDelete(client, message) {
    if (!message.guild || message.author?.bot || ignored(message.guild, message.channelId, message.channel?.parentId)) return;
    const files = [...(message.attachments?.values?.() || [])].map((a) => a.name).join(', ');
    await post(
      message.guild,
      'messageDelete',
      {
        color: colors.error,
        title: '🗑️ Message deleted',
        author: message.author ? { name: message.author.tag || message.author.username, iconURL: message.author.displayAvatarURL?.() } : undefined,
        description: message.partial ? '*Message was not cached — content unknown.*' : truncate(message.content || '*no text*', 3500),
        fields: [
          { name: 'Author', value: userLine(message.author), inline: true },
          { name: 'Channel', value: `<#${message.channelId}>`, inline: true },
          { name: 'Attachments', value: files || null },
        ],
        footer: `Message ID: ${message.id}`,
      },
      message.id,
    );
  },

  async messageUpdate(client, oldMessage, newMessage) {
    if (!newMessage.guild || newMessage.author?.bot || ignored(newMessage.guild, newMessage.channelId, newMessage.channel?.parentId)) return;
    if (newMessage.partial) newMessage = await newMessage.fetch().catch(() => null);
    if (!newMessage || newMessage.author?.bot) return;
    if (!oldMessage.partial && oldMessage.content === newMessage.content) return; // embed/pin updates
    await post(
      newMessage.guild,
      'messageEdit',
      {
        color: colors.warn,
        title: '✏️ Message edited',
        author: { name: newMessage.author.tag || newMessage.author.username, iconURL: newMessage.author.displayAvatarURL?.() },
        description: `[Jump to message](${newMessage.url}) in <#${newMessage.channelId}>`,
        fields: [
          { name: 'Before', value: oldMessage.partial ? '*not cached*' : truncate(oldMessage.content || '*empty*', 1000) },
          { name: 'After', value: truncate(newMessage.content || '*empty*', 1000) },
        ],
        footer: `User ID: ${newMessage.author.id}`,
      },
      `${newMessage.id}:${newMessage.editedTimestamp}`,
    );
  },

  async messageDeleteBulk(client, messages, channel) {
    if (!channel?.guild || ignored(channel.guild, channel.id, channel.parentId)) return;
    const sorted = [...messages.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    const transcript = sorted
      .map((m) => `[${new Date(m.createdTimestamp).toISOString()}] ${m.author ? `${m.author.tag || m.author.username} (${m.author.id})` : 'unknown'}: ${m.content || (m.partial ? '[not cached]' : '')}${m.attachments?.size ? ` [${m.attachments.size} attachment(s)]` : ''}`)
      .join('\n');
    await post(
      channel.guild,
      'bulkDelete',
      { color: colors.error, title: '🧹 Bulk delete', description: `**${messages.size}** messages deleted in <#${channel.id}>. Transcript attached.` },
      `${channel.id}:${messages.firstKey()}`,
      [new AttachmentBuilder(Buffer.from(transcript || 'No cached content.'), { name: `bulk-delete-${channel.id}.txt` })],
    );
  },

  async guildMemberAdd(client, member) {
    const created = member.user.createdTimestamp;
    const young = Date.now() - created < 7 * 86400000;
    await post(
      member.guild,
      'memberJoin',
      {
        color: colors.success,
        title: '📥 Member joined',
        thumbnail: member.user.displayAvatarURL?.(),
        description: `${userLine(member.user)}${member.user.bot ? ' 🤖' : ''}`,
        fields: [
          { name: 'Account created', value: `${discordTimestamp(created, 'D')} (${discordTimestamp(created)})${young ? ' ⚠️ new account' : ''}`, inline: true },
          { name: 'Member count', value: String(member.guild.memberCount), inline: true },
        ],
      },
      `${member.guild.id}:${member.id}:${member.joinedTimestamp}`,
    );
  },

  async guildMemberRemove(client, member) {
    const roles = member.partial ? null : member.roles.cache.filter((r) => r.id !== member.guild.id).map((r) => `<@&${r.id}>`).join(' ');
    await post(
      member.guild,
      'memberLeave',
      {
        color: colors.error,
        title: '📤 Member left',
        thumbnail: member.user?.displayAvatarURL?.(),
        description: userLine(member.user),
        fields: [
          { name: 'Joined', value: member.joinedTimestamp ? discordTimestamp(member.joinedTimestamp) : null, inline: true },
          { name: 'Member count', value: String(member.guild.memberCount), inline: true },
          { name: 'Roles', value: roles ? truncate(roles, 1000) : null },
        ],
      },
      `${member.guild.id}:${member.id}:leave`,
    );
  },

  async guildMemberUpdate(client, oldMember, newMember) {
    if (oldMember.partial) return; // no "before" state to compare
    const guild = newMember.guild;
    const added = newMember.roles.cache.filter((r) => !oldMember.roles.cache.has(r.id));
    const removed = oldMember.roles.cache.filter((r) => !newMember.roles.cache.has(r.id));
    if (added.size || removed.size) {
      await post(
        guild,
        'memberRoles',
        {
          color: colors.info,
          title: '🎭 Roles updated',
          description: userLine(newMember.user),
          fields: [
            { name: 'Added', value: added.map((r) => `<@&${r.id}>`).join(' ') || null },
            { name: 'Removed', value: removed.map((r) => `<@&${r.id}>`).join(' ') || null },
          ],
        },
        `${newMember.id}:roles:${[...added.keys(), '-', ...removed.keys()].join(',')}`,
      );
    }
    if (oldMember.nickname !== newMember.nickname) {
      await post(
        guild,
        'nicknames',
        {
          color: colors.info,
          title: '🏷️ Nickname changed',
          description: userLine(newMember.user),
          fields: [
            { name: 'Before', value: oldMember.nickname || '*none*', inline: true },
            { name: 'After', value: newMember.nickname || '*none*', inline: true },
          ],
        },
        `${newMember.id}:nick:${newMember.nickname}`,
      );
    }
    const oldT = oldMember.communicationDisabledUntilTimestamp || 0;
    const newT = newMember.communicationDisabledUntilTimestamp || 0;
    if (oldT !== newT && (newT > Date.now() || oldT > Date.now())) {
      const on = newT > Date.now();
      await post(
        guild,
        'timeouts',
        {
          color: on ? colors.warn : colors.success,
          title: on ? '🔇 Member timed out' : '🔊 Timeout removed',
          description: userLine(newMember.user),
          fields: [{ name: 'Until', value: on ? `${discordTimestamp(newT, 'F')} (${discordTimestamp(newT)})` : null }],
        },
        `${newMember.id}:timeout:${newT}`,
      );
    }
  },

  async voiceStateUpdate(client, oldState, newState) {
    const member = newState.member || oldState.member;
    if (!member || member.user.bot || oldState.channelId === newState.channelId) return;
    let title;
    let description;
    let color = colors.info;
    if (!oldState.channelId) {
      title = '🔊 Joined voice';
      description = `${userLine(member.user)} joined <#${newState.channelId}>`;
      color = colors.success;
    } else if (!newState.channelId) {
      title = '🔇 Left voice';
      description = `${userLine(member.user)} left <#${oldState.channelId}>`;
      color = colors.error;
    } else {
      title = '🔀 Moved voice';
      description = `${userLine(member.user)}: <#${oldState.channelId}> → <#${newState.channelId}>`;
    }
    await post(newState.guild, 'voice', { color, title, description }, `${member.id}:${oldState.channelId}:${newState.channelId}:${Math.floor(Date.now() / 3000)}`);
  },

  async guildBanAdd(client, ban) {
    const full = ban.partial ? await ban.fetch().catch(() => ban) : ban;
    await post(
      ban.guild,
      'bans',
      { color: colors.error, title: '🔨 Member banned', description: userLine(ban.user), fields: [{ name: 'Reason', value: full.reason || null }] },
      `${ban.guild.id}:${ban.user.id}:ban`,
    );
  },

  async guildBanRemove(client, ban) {
    await post(ban.guild, 'bans', { color: colors.success, title: '🔓 Member unbanned', description: userLine(ban.user) }, `${ban.guild.id}:${ban.user.id}:unban`);
  },

  async channelCreate(client, channel) {
    if (!channel.guild) return;
    await post(channel.guild, 'channels', { color: colors.success, title: '#️⃣ Channel created', description: `<#${channel.id}> (\`${channel.name}\`)` }, `${channel.id}:create`);
  },

  async channelDelete(client, channel) {
    if (!channel.guild) return;
    await post(channel.guild, 'channels', { color: colors.error, title: '#️⃣ Channel deleted', description: `\`#${channel.name}\` (\`${channel.id}\`)` }, `${channel.id}:delete`);
  },

  async channelUpdate(client, oldCh, newCh) {
    if (!newCh.guild) return;
    const changes = [];
    if (oldCh.name !== newCh.name) changes.push(`**Name:** \`${oldCh.name}\` → \`${newCh.name}\``);
    if ((oldCh.topic || '') !== (newCh.topic || '')) changes.push(`**Topic:** ${truncate(oldCh.topic || '*none*', 300)} → ${truncate(newCh.topic || '*none*', 300)}`);
    if (oldCh.nsfw !== newCh.nsfw) changes.push(`**NSFW:** ${oldCh.nsfw} → ${newCh.nsfw}`);
    if (oldCh.rateLimitPerUser !== newCh.rateLimitPerUser) changes.push(`**Slowmode:** ${oldCh.rateLimitPerUser || 0}s → ${newCh.rateLimitPerUser || 0}s`);
    if (!changes.length) return;
    await post(newCh.guild, 'channels', { color: colors.info, title: '#️⃣ Channel updated', description: `<#${newCh.id}>\n${changes.join('\n')}` }, `${newCh.id}:update:${changes.join('|').length}:${Math.floor(Date.now() / 3000)}`);
  },

  async roleCreate(client, role) {
    await post(role.guild, 'roles', { color: colors.success, title: '🎨 Role created', description: `<@&${role.id}> (\`${role.name}\`)` }, `${role.id}:create`);
  },

  async roleDelete(client, role) {
    await post(role.guild, 'roles', { color: colors.error, title: '🎨 Role deleted', description: `\`${role.name}\` (\`${role.id}\`)` }, `${role.id}:delete`);
  },

  async roleUpdate(client, oldRole, newRole) {
    const changes = [];
    if (oldRole.name !== newRole.name) changes.push(`**Name:** \`${oldRole.name}\` → \`${newRole.name}\``);
    if (oldRole.hexColor !== newRole.hexColor) changes.push(`**Color:** ${oldRole.hexColor} → ${newRole.hexColor}`);
    if (oldRole.hoist !== newRole.hoist) changes.push(`**Hoisted:** ${oldRole.hoist} → ${newRole.hoist}`);
    if (oldRole.mentionable !== newRole.mentionable) changes.push(`**Mentionable:** ${oldRole.mentionable} → ${newRole.mentionable}`);
    if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) {
      const gained = newRole.permissions.toArray().filter((p) => !oldRole.permissions.has(p));
      const lost = oldRole.permissions.toArray().filter((p) => !newRole.permissions.has(p));
      if (gained.length) changes.push(`**Permissions added:** ${gained.map(mod.permLabel).join(', ')}`);
      if (lost.length) changes.push(`**Permissions removed:** ${lost.map(mod.permLabel).join(', ')}`);
    }
    if (!changes.length) return;
    await post(newRole.guild, 'roles', { color: colors.info, title: '🎨 Role updated', description: `<@&${newRole.id}>\n${truncate(changes.join('\n'), 3500)}` }, `${newRole.id}:update:${Math.floor(Date.now() / 3000)}`);
  },
};

// ---------------------------------------------------------------- commands

/** "<#channel|off>" → channel | 'off' | null */
function channelOrOff(ctx) {
  const arg = ctx.args[0];
  if (!arg) return null;
  if (['off', 'none', 'disable', 'reset'].includes(arg.toLowerCase())) return 'off';
  const ch = ctx.resolveChannel(arg);
  return ch?.isTextBased?.() ? ch : null;
}

const onOff = (b) => (b ? '🟢' : '🔴');

const commands = [
  {
    name: 'setmodlog',
    aliases: ['modlog', 'modlogchannel'],
    description: 'Set the channel for moderation cases, AutoMod and anti-raid alerts',
    usage: '<#channel|off>',
    examples: ['#mod-log', 'off'],
    guildOnly: true,
    userPerms: ['ManageGuild'],
    minArgs: 1,
    slash: true,
    args: [{ name: 'channel', type: 'string', description: 'A #channel, or "off"', required: true }],
    async execute(ctx) {
      const ch = channelOrOff(ctx);
      if (!ch) return ctx.fail('Text channel not found.');
      const cfg = mod.settings(ctx.guild.id);
      cfg.modlogChannel = ch === 'off' ? null : ch.id;
      db.save();
      if (ch === 'off') return ctx.ok('Mod log disabled.');
      await ctx.ok(`Moderation logs will be posted in ${ch}.`);
      ch.send({ embeds: [embed({ color: colors.success, description: '📋 This channel now receives moderation logs.' })] }).catch(() => ctx.warn(`I can't send messages in ${ch} — check my permissions there.`));
    },
  },
  {
    name: 'setlog',
    aliases: ['logchannel', 'serverlog'],
    description: 'Set the server log channel (edits, deletes, joins, roles, voice…) or turn it off',
    usage: '<#channel|off>',
    examples: ['#server-log', 'off'],
    guildOnly: true,
    userPerms: ['ManageGuild'],
    minArgs: 1,
    slash: true,
    args: [{ name: 'channel', type: 'string', description: 'A #channel, or "off"', required: true }],
    async execute(ctx) {
      const ch = channelOrOff(ctx);
      if (!ch) return ctx.fail('Text channel not found.');
      const cfg = settings(ctx.guild.id);
      cfg.channel = ch === 'off' ? null : ch.id;
      db.save();
      if (ch === 'off') return ctx.ok('Server logging disabled.');
      await ctx.ok(`Server logs will be posted in ${ch}. Choose events with \`${ctx.prefix}logevents\` / \`${ctx.prefix}logevent <event> on|off\`.`);
      ch.send({ embeds: [embed({ color: colors.success, description: '📜 This channel now receives server logs.' })] }).catch(() => ctx.warn(`I can't send messages in ${ch} — check my permissions there.`));
    },
  },
  {
    name: 'logevents',
    aliases: ['logsettings', 'logstatus'],
    description: 'Show which events are logged',
    guildOnly: true,
    async execute(ctx) {
      const cfg = settings(ctx.guild.id);
      await ctx.reply({
        embeds: [
          ctx.embed({
            title: '📜 Server logging',
            description: Object.entries(EVENTS).map(([k, label]) => `${onOff(cfg.events[k])} \`${k}\` — ${label}`).join('\n'),
            fields: [
              { name: 'Log channel', value: cfg.channel ? `<#${cfg.channel}>` : `not set — \`${ctx.prefix}setlog #channel\``, inline: true },
              { name: 'Ignored channels', value: cfg.ignoredChannels.map((c) => `<#${c}>`).join(' ') || 'none', inline: true },
            ],
          }),
        ],
      });
    },
  },
  {
    name: 'logevent',
    aliases: ['togglelog'],
    description: 'Turn logging of one event on or off',
    usage: '<event> <on|off>',
    examples: ['voice off', 'messageDelete on'],
    guildOnly: true,
    userPerms: ['ManageGuild'],
    minArgs: 2,
    async execute(ctx) {
      const key = Object.keys(EVENTS).find((k) => k.toLowerCase() === ctx.args[0].toLowerCase());
      const state = parseToggle(ctx.args[1]);
      if (!key || state === null) return ctx.usage(`Events: ${Object.keys(EVENTS).map((k) => `\`${k}\``).join(', ')}`);
      settings(ctx.guild.id).events[key] = state;
      db.save();
      await ctx.ok(`${EVENTS[key]} logging is **${state ? 'on' : 'off'}**.`);
    },
  },
  {
    name: 'logall',
    description: 'Turn logging of every event on or off at once',
    usage: '<on|off>',
    examples: ['on', 'off'],
    guildOnly: true,
    userPerms: ['ManageGuild'],
    minArgs: 1,
    async execute(ctx) {
      const state = parseToggle(ctx.args[0]);
      if (state === null) return ctx.usage();
      const cfg = settings(ctx.guild.id);
      for (const k of Object.keys(EVENTS)) cfg.events[k] = state;
      db.save();
      await ctx.ok(`All log events are **${state ? 'on' : 'off'}**.`);
    },
  },
  {
    name: 'logignore',
    aliases: ['ignorelog'],
    description: 'Toggle ignoring a channel (or category) in message logs',
    usage: '<#channel>',
    examples: ['#bot-spam'],
    guildOnly: true,
    userPerms: ['ManageGuild'],
    minArgs: 1,
    async execute(ctx) {
      const ch = ctx.resolveChannel(ctx.args[0]);
      if (!ch) return ctx.fail('Channel not found.');
      const list = settings(ctx.guild.id).ignoredChannels;
      const i = list.indexOf(ch.id);
      if (i === -1) list.push(ch.id);
      else list.splice(i, 1);
      db.save();
      await ctx.ok(`${ch} is ${i === -1 ? 'now ignored by' : 'no longer ignored by'} message logs.`);
    },
  },
];

module.exports = { commands, events };
