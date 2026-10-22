'use strict';
const { PermissionFlagsBits } = require('discord.js');
const { discordTimestamp, formatNumber } = require('../../core/utils');
const { button, row } = require('../../core/ui');
const { allMembers, getMember, prettyPerm, keyPermissions, snowflakeDate, userArg } = require('./_helpers');

const BADGES = {
  Staff: 'Discord Staff',
  Partner: 'Partnered Server Owner',
  Hypesquad: 'HypeSquad Events',
  BugHunterLevel1: 'Bug Hunter',
  BugHunterLevel2: 'Bug Hunter (Gold)',
  HypeSquadOnlineHouse1: 'HypeSquad Bravery',
  HypeSquadOnlineHouse2: 'HypeSquad Brilliance',
  HypeSquadOnlineHouse3: 'HypeSquad Balance',
  PremiumEarlySupporter: 'Early Supporter',
  VerifiedBot: 'Verified Bot',
  VerifiedDeveloper: 'Early Verified Bot Developer',
  CertifiedModerator: 'Moderator Programs Alumni',
  ActiveDeveloper: 'Active Developer',
};

const notFound = (ctx) => ctx.fail('I could not find that user. Mention them, or use their ID or username.');

function avatarLinks(user, member) {
  const animated = (member?.avatar || user.avatar || '').startsWith('a_');
  const src = member?.avatar ? member : user;
  const url = (extension) => src.displayAvatarURL({ extension, size: 4096, forceStatic: extension !== 'gif' });
  const buttons = [button(url('png'), 'PNG', 'Link'), button(url('jpg'), 'JPG', 'Link'), button(url('webp'), 'WEBP', 'Link')];
  if (animated) buttons.push(button(url('gif'), 'GIF', 'Link'));
  return row(...buttons);
}

const ALL_PERMS = Object.keys(PermissionFlagsBits);

module.exports = [
  {
    name: 'userinfo',
    aliases: ['whois', 'ui', 'user', 'memberinfo'],
    description: 'Detailed information about a user or member',
    usage: '[user]',
    examples: ['', '111111111111111111'],
    slash: true,
    args: [{ name: 'user', type: 'user', description: 'Who to look up (default: you)', required: false }],
    cooldown: 3,
    async execute(ctx) {
      const found = await userArg(ctx);
      if (!found) return notFound(ctx);
      const user = (await ctx.client.users.fetch(found.id, { force: true }).catch(() => null)) || found;
      const member = await getMember(ctx.guild, user.id);
      const badges = (user.flags?.toArray?.() || []).map((f) => BADGES[f]).filter(Boolean);
      const fields = [
        { name: 'ID', value: `\`${user.id}\``, inline: true },
        { name: 'Type', value: user.bot ? '🤖 Bot' : '👤 Human', inline: true },
        { name: 'Account created', value: `${discordTimestamp(user.createdAt, 'F')}\n${discordTimestamp(user.createdAt, 'R')}`, inline: false },
      ];
      if (member) {
        const roles = [...member.roles.cache.values()].filter((r) => r.id !== ctx.guild.id).sort((a, b) => b.position - a.position);
        const shown = roles.slice(0, 15).map((r) => r.toString()).join(' ');
        fields.push(
          { name: 'Joined server', value: member.joinedAt ? `${discordTimestamp(member.joinedAt, 'F')}\n${discordTimestamp(member.joinedAt, 'R')}` : 'Unknown', inline: false },
          { name: 'Nickname', value: member.nickname || 'None', inline: true },
          { name: 'Boosting', value: member.premiumSince ? `Since ${discordTimestamp(member.premiumSince, 'D')}` : 'No', inline: true },
          { name: `Roles [${roles.length}]`, value: roles.length ? `${shown}${roles.length > 15 ? ` …and ${roles.length - 15} more` : ''}` : 'None', inline: false },
          { name: 'Key permissions', value: keyPermissions(member.permissions), inline: false },
        );
        if (member.communicationDisabledUntilTimestamp > Date.now()) {
          fields.push({ name: 'Timed out until', value: discordTimestamp(member.communicationDisabledUntilTimestamp, 'F'), inline: false });
        }
      } else if (ctx.guild) {
        fields.push({ name: 'Server member', value: 'Not in this server', inline: false });
      }
      if (badges.length) fields.push({ name: 'Badges', value: badges.join(', '), inline: false });
      await ctx.reply({
        embeds: [
          ctx.embed({
            author: { name: user.tag || user.username, iconURL: user.displayAvatarURL() },
            title: member?.displayName || user.globalName || user.username,
            thumbnail: (member || user).displayAvatarURL({ size: 512 }),
            image: user.bannerURL?.({ size: 1024 }) || undefined,
            color: member && member.displayHexColor !== '#000000' ? parseInt(member.displayHexColor.slice(1), 16) : ctx.color,
            fields,
          }),
        ],
      });
    },
  },
  {
    name: 'avatar',
    aliases: ['av', 'pfp'],
    description: 'Show a user\'s avatar in full size',
    usage: '[user]',
    examples: ['', '111111111111111111'],
    slash: true,
    args: [{ name: 'user', type: 'user', description: 'Whose avatar (default: you)', required: false }],
    async execute(ctx) {
      const user = await userArg(ctx);
      if (!user) return notFound(ctx);
      await ctx.reply({
        embeds: [ctx.embed({ title: `🖼️ ${user.globalName || user.username}'s avatar`, image: user.displayAvatarURL({ size: 4096 }) })],
        components: [avatarLinks(user, null)],
      });
    },
  },
  {
    name: 'serveravatar',
    aliases: ['sav', 'guildavatar'],
    description: 'Show a member\'s server-specific avatar',
    usage: '[user]',
    examples: [''],
    guildOnly: true,
    async execute(ctx) {
      const user = await userArg(ctx);
      if (!user) return notFound(ctx);
      const member = await getMember(ctx.guild, user.id);
      if (!member) return ctx.fail('That user is not in this server.');
      const hasOwn = !!member.avatar;
      await ctx.reply({
        embeds: [
          ctx.embed({
            title: `🖼️ ${member.displayName}'s ${hasOwn ? 'server' : 'global'} avatar`,
            description: hasOwn ? null : 'They have no server-specific avatar, so this is their global one.',
            image: member.displayAvatarURL({ size: 4096 }),
          }),
        ],
        components: [avatarLinks(user, member)],
      });
    },
  },
  {
    name: 'banner',
    aliases: ['userbanner'],
    description: 'Show a user\'s profile banner (or accent colour)',
    usage: '[user]',
    examples: [''],
    cooldown: 3,
    async execute(ctx) {
      const found = await userArg(ctx);
      if (!found) return notFound(ctx);
      const user = (await ctx.client.users.fetch(found.id, { force: true }).catch(() => null)) || found;
      const url = user.bannerURL?.({ size: 4096 });
      if (url) {
        return ctx.reply({ embeds: [ctx.embed({ title: `🎏 ${user.username}'s banner`, image: url })], components: [row(button(url, 'Open original', 'Link'))] });
      }
      if (user.hexAccentColor) {
        return ctx.reply({ embeds: [ctx.embed({ color: user.accentColor, description: `${user.username} has no banner image. Their profile accent colour is **${user.hexAccentColor}**.` })] });
      }
      await ctx.info(`${user.username} has no profile banner.`);
    },
  },
  {
    name: 'created',
    aliases: ['accountage'],
    description: 'When a Discord account was created',
    usage: '[user]',
    examples: [''],
    async execute(ctx) {
      const user = await userArg(ctx);
      if (!user) return notFound(ctx);
      const days = Math.floor((Date.now() - user.createdTimestamp) / 86400000);
      await ctx.info(`📅 **${user.username}**'s account was created ${discordTimestamp(user.createdAt, 'F')} (${discordTimestamp(user.createdAt, 'R')}) — **${formatNumber(days)}** days ago.`);
    },
  },
  {
    name: 'joined',
    aliases: ['joinposition', 'joinpos', 'joindate'],
    description: 'When a member joined and their join position',
    usage: '[user]',
    examples: [''],
    guildOnly: true,
    cooldown: 5,
    async execute(ctx) {
      const user = await userArg(ctx);
      if (!user) return notFound(ctx);
      const member = await getMember(ctx.guild, user.id);
      if (!member?.joinedTimestamp) return ctx.fail('That user is not in this server.');
      const members = await allMembers(ctx.guild);
      const sorted = [...members.values()].filter((m) => m.joinedTimestamp).sort((a, b) => a.joinedTimestamp - b.joinedTimestamp);
      const pos = sorted.findIndex((m) => m.id === member.id) + 1;
      const complete = members.size >= ctx.guild.memberCount;
      await ctx.info(
        `📥 **${member.displayName}** joined ${discordTimestamp(member.joinedAt, 'F')} (${discordTimestamp(member.joinedAt, 'R')}).\n` +
          `Join position: **#${formatNumber(pos)}** of ${formatNumber(ctx.guild.memberCount)}${complete ? '' : ' (approximate — member list not fully loaded)'}`,
      );
    },
  },
  {
    name: 'permissions',
    aliases: ['perms', 'userperms'],
    description: 'List a member\'s permissions (optionally in a channel)',
    usage: '[user] [#channel]',
    examples: ['', '111111111111111111'],
    guildOnly: true,
    async execute(ctx) {
      let channel = null;
      const args = [...ctx.args];
      if (args.length && /^<#\d+>$/.test(args[args.length - 1])) channel = ctx.resolveChannel(args.pop());
      const user = args.length ? await ctx.resolveUser(args.join(' ')) : ctx.author;
      if (!user) return notFound(ctx);
      const member = await getMember(ctx.guild, user.id);
      if (!member) return ctx.fail('That user is not in this server.');
      const perms = channel ? channel.permissionsFor(member) : member.permissions;
      const has = ALL_PERMS.filter((p) => perms?.has(PermissionFlagsBits[p], false));
      const admin = perms?.has(PermissionFlagsBits.Administrator);
      const body = admin ? '👑 **Administrator** — has every permission.' : has.length ? has.map((p) => `✅ ${prettyPerm(p)}`).join('\n') : 'No permissions.';
      await ctx.reply({ embeds: [ctx.embed({ title: `🔑 ${member.displayName}'s permissions${channel ? ` in #${channel.name}` : ''}`, description: body })] });
    },
  },
  {
    name: 'botperms',
    aliases: ['myperms', 'checkperms'],
    description: 'Check which permissions I have here (and what I am missing)',
    guildOnly: true,
    async execute(ctx) {
      const me = ctx.guild.members.me;
      const perms = ctx.channel.permissionsFor?.(me) || me?.permissions;
      const wanted = [
        'ViewChannel', 'SendMessages', 'EmbedLinks', 'AttachFiles', 'ReadMessageHistory', 'AddReactions', 'UseExternalEmojis',
        'ManageMessages', 'ManageChannels', 'ManageRoles', 'ManageNicknames', 'ManageGuildExpressions', 'KickMembers', 'BanMembers',
        'ModerateMembers', 'ViewAuditLog', 'ManageGuild', 'Connect', 'Speak', 'MoveMembers',
      ];
      const lines = wanted.map((p) => `${perms?.has(PermissionFlagsBits[p]) ? '✅' : '❌'} ${prettyPerm(p)}`);
      const missing = wanted.filter((p) => !perms?.has(PermissionFlagsBits[p])).length;
      await ctx.reply({
        embeds: [
          ctx.embed({
            title: `🤖 My permissions in #${ctx.channel.name}`,
            description: `${lines.join('\n')}\n\n${missing ? `Missing **${missing}** — some features won't work until I get them.` : 'I have everything I need here. 🎉'}`,
          }),
        ],
      });
    },
  },
  {
    name: 'snowflake',
    aliases: ['decodeid', 'idinfo'],
    description: 'Decode a Discord ID into its creation time and internal parts',
    usage: '<id>',
    examples: ['175928847299117063'],
    minArgs: 1,
    async execute(ctx) {
      const raw = ctx.args[0].replace(/[^\d]/g, '');
      if (!/^\d{15,21}$/.test(raw)) return ctx.fail('That is not a valid Discord ID (snowflake).');
      const id = BigInt(raw);
      const date = snowflakeDate(raw);
      await ctx.reply({
        embeds: [
          ctx.embed({
            title: '❄️ Snowflake decoded',
            fields: [
              { name: 'ID', value: `\`${raw}\``, inline: false },
              { name: 'Created', value: `${discordTimestamp(date, 'F')} (${discordTimestamp(date, 'R')})`, inline: false },
              { name: 'Unix (ms)', value: `\`${date.getTime()}\``, inline: true },
              { name: 'Worker ID', value: String((id & 0x3e0000n) >> 17n), inline: true },
              { name: 'Process ID', value: String((id & 0x1f000n) >> 12n), inline: true },
              { name: 'Increment', value: String(id & 0xfffn), inline: true },
            ],
          }),
        ],
      });
    },
  },
  {
    name: 'idof',
    aliases: ['getid'],
    description: 'Get the ID of a user, role, channel or custom emoji',
    usage: '<mention | name | emoji>',
    examples: ['general', '<:pepe:123456789012345678>'],
    minArgs: 1,
    async execute(ctx) {
      const q = ctx.rest(0);
      const emoji = q.match(/<a?:(\w+):(\d{15,21})>/);
      const results = [];
      if (emoji) results.push(`😀 Emoji **${emoji[1]}**: \`${emoji[2]}\``);
      const channel = ctx.resolveChannel(q);
      if (channel) results.push(`#️⃣ Channel **#${channel.name}**: \`${channel.id}\``);
      const role = ctx.resolveRole(q);
      if (role) results.push(`🏷️ Role **${role.name}**: \`${role.id}\``);
      if (!emoji) {
        const user = await ctx.resolveUser(q);
        if (user) results.push(`👤 User **${user.username}**: \`${user.id}\``);
      }
      if (!results.length) return ctx.fail('Nothing matched that.');
      await ctx.info(results.join('\n'));
    },
  },
];
