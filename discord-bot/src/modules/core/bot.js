'use strict';
const os = require('node:os');
const { PermissionFlagsBits, version: djsVersion } = require('discord.js');
const { formatDuration, formatNumber } = require('../../core/utils');
const { button, row } = require('../../core/ui');

// Everything the bot's features need — no Administrator.
const RECOMMENDED_PERMS = [
  'ViewChannel', 'SendMessages', 'SendMessagesInThreads', 'CreatePublicThreads', 'EmbedLinks', 'AttachFiles',
  'ReadMessageHistory', 'AddReactions', 'UseExternalEmojis', 'ManageMessages', 'ManageChannels', 'ManageRoles',
  'ManageNicknames', 'ManageGuildExpressions', 'ManageWebhooks', 'ManageThreads', 'KickMembers', 'BanMembers',
  'ModerateMembers', 'ViewAuditLog', 'ManageGuild', 'Connect', 'Speak', 'MoveMembers', 'MuteMembers', 'DeafenMembers',
].reduce((acc, p) => acc | PermissionFlagsBits[p], 0n);

function inviteUrl(clientId, perms) {
  return `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=${perms}&scope=bot%20applications.commands`;
}

module.exports = [
  {
    name: 'ping',
    aliases: ['latency'],
    description: 'Check the bot\'s latency',
    slash: true,
    args: [],
    async execute(ctx) {
      const start = Date.now();
      const msg = await ctx.reply({ embeds: [ctx.embed({ description: '🏓 Pinging…' })] });
      const roundtrip = Date.now() - start;
      const e = ctx.embed({
        title: '🏓 Pong!',
        fields: [
          { name: 'Gateway', value: `${Math.round(ctx.client.ws.ping)}ms`, inline: true },
          { name: 'Round-trip', value: `${roundtrip}ms`, inline: true },
        ],
      });
      if (ctx.isSlash) await ctx.interaction.editReply({ embeds: [e] }).catch(() => {});
      else await msg?.edit({ embeds: [e] }).catch(() => {});
    },
  },
  {
    name: 'uptime',
    description: 'How long the bot has been online',
    async execute(ctx) {
      await ctx.info(`⏱️ Online for **${formatDuration(ctx.client.uptime || 0)}** (process: ${formatDuration(process.uptime() * 1000)}).`);
    },
  },
  {
    name: 'botinfo',
    aliases: ['stats', 'about', 'botstats'],
    description: 'Bot statistics: servers, commands, memory, uptime',
    slash: true,
    args: [],
    async execute(ctx) {
      const c = ctx.client;
      const users = c.guilds.cache.reduce((n, g) => n + (g.memberCount || 0), 0);
      await ctx.reply({
        embeds: [
          ctx.embed({
            title: `🤖 ${c.user.username}`,
            thumbnail: c.user.displayAvatarURL?.(),
            fields: [
              { name: 'Servers', value: formatNumber(c.guilds.cache.size), inline: true },
              { name: 'Users', value: formatNumber(users), inline: true },
              { name: 'Commands', value: `${formatNumber(ctx.registry.size)} (+${ctx.registry.aliases.size} aliases)`, inline: true },
              { name: 'Commands run', value: formatNumber(c.stats.commands), inline: true },
              { name: 'Uptime', value: formatDuration(c.uptime || 0), inline: true },
              { name: 'Ping', value: `${Math.round(c.ws.ping)}ms`, inline: true },
              { name: 'Memory', value: `${Math.round(process.memoryUsage().rss / 1048576)} MB`, inline: true },
              { name: 'Platform', value: `Node ${process.version} • discord.js ${djsVersion} • ${os.platform()}`, inline: true },
              { name: 'Prefix', value: `\`${ctx.prefix}\` • slash: \`/cmd\``, inline: true },
            ],
            footer: `Profile: ${ctx.bot.name} • modules: ${ctx.bot.modules === 'all' ? 'all' : ctx.bot.modules.join(', ')}`,
          }),
        ],
      });
    },
  },
  {
    name: 'invite',
    description: 'Get a link to add this bot to another server',
    slash: true,
    args: [],
    async execute(ctx) {
      const id = ctx.client.user.id;
      await ctx.reply({
        embeds: [ctx.embed({ title: '➕ Invite me', description: 'Pick a permission set. **Recommended** grants exactly what my features use.' })],
        components: [
          row(
            button(inviteUrl(id, RECOMMENDED_PERMS), 'Invite (recommended)', 'Link'),
            button(inviteUrl(id, PermissionFlagsBits.Administrator), 'Invite (Administrator)', 'Link'),
          ),
        ],
      });
    },
  },
];

module.exports.inviteUrl = inviteUrl;
module.exports.RECOMMENDED_PERMS = RECOMMENDED_PERMS;
