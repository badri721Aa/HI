'use strict';
const { ChannelType, GuildVerificationLevel, GuildPremiumTier, PermissionFlagsBits } = require('discord.js');
const { discordTimestamp, formatNumber, chunk, truncate } = require('../../core/utils');
const { paginate, button, row } = require('../../core/ui');
const { allMembers, keyPermissions, snowflakeDate } = require('./_helpers');

const TYPE_ICON = {
  [ChannelType.GuildText]: '#️⃣',
  [ChannelType.GuildVoice]: '🔊',
  [ChannelType.GuildCategory]: '📁',
  [ChannelType.GuildAnnouncement]: '📢',
  [ChannelType.GuildStageVoice]: '🎙️',
  [ChannelType.GuildForum]: '💬',
  [ChannelType.GuildMedia]: '🖼️',
  [ChannelType.PublicThread]: '🧵',
  [ChannelType.PrivateThread]: '🔒',
  [ChannelType.AnnouncementThread]: '🧵',
};

const TYPE_NAME = {
  [ChannelType.GuildText]: 'Text',
  [ChannelType.GuildVoice]: 'Voice',
  [ChannelType.GuildCategory]: 'Category',
  [ChannelType.GuildAnnouncement]: 'Announcement',
  [ChannelType.GuildStageVoice]: 'Stage',
  [ChannelType.GuildForum]: 'Forum',
  [ChannelType.GuildMedia]: 'Media',
  [ChannelType.PublicThread]: 'Public thread',
  [ChannelType.PrivateThread]: 'Private thread',
  [ChannelType.AnnouncementThread]: 'Announcement thread',
};

const FEATURE_NAMES = {
  COMMUNITY: 'Community',
  PARTNERED: 'Partnered',
  VERIFIED: 'Verified',
  DISCOVERABLE: 'Discoverable',
  VANITY_URL: 'Vanity URL',
  ANIMATED_ICON: 'Animated icon',
  BANNER: 'Banner',
  INVITE_SPLASH: 'Invite splash',
  WELCOME_SCREEN_ENABLED: 'Welcome screen',
  MEMBER_VERIFICATION_GATE_ENABLED: 'Membership screening',
  ROLE_ICONS: 'Role icons',
  NEWS: 'Announcement channels',
  AUTO_MODERATION: 'AutoMod',
  TICKETED_EVENTS_ENABLED: 'Ticketed events',
};

/** Build pages of lines (≤ maxLines each, ≤ 3900 chars). */
function linePages(ctx, title, lines, { perPage = 20, footer } = {}) {
  const pages = [];
  let current = [];
  let len = 0;
  for (const line of lines) {
    if (current.length >= perPage || len + line.length > 3900) {
      pages.push(current);
      current = [];
      len = 0;
    }
    current.push(line);
    len += line.length + 1;
  }
  if (current.length) pages.push(current);
  return pages.map((p, i) => ctx.embed({ title, description: p.join('\n'), footer: `${footer ? `${footer} • ` : ''}Page ${i + 1}/${pages.length}` }));
}

function parseCustomEmoji(str) {
  const m = String(str || '').match(/<(a?):(\w+):(\d{15,21})>/);
  if (!m) return null;
  return { animated: !!m[1], name: m[2], id: m[3], url: `https://cdn.discordapp.com/emojis/${m[3]}.${m[1] ? 'gif' : 'png'}?size=512` };
}

function memberListCommand({ name, aliases, description, filter, sort, line, empty, title }) {
  return {
    name,
    aliases,
    description,
    usage: '[count]',
    examples: [''],
    guildOnly: true,
    cooldown: 5,
    async execute(ctx) {
      await ctx.defer();
      const members = await allMembers(ctx.guild);
      let list = [...members.values()].filter(filter);
      if (sort) list.sort(sort);
      const limit = Math.min(Math.max(parseInt(ctx.args[0], 10) || list.length, 1), list.length || 1);
      list = list.slice(0, limit);
      if (!list.length) return ctx.info(empty);
      const lines = list.map((m, i) => `\`${String(i + 1).padStart(3)}\` ${line(m)}`);
      await paginate(ctx, linePages(ctx, title(list.length), lines));
    },
  };
}

module.exports = [
  {
    name: 'serverinfo',
    aliases: ['si', 'guildinfo', 'server'],
    description: 'Everything about this server',
    guildOnly: true,
    slash: true,
    args: [],
    cooldown: 3,
    async execute(ctx) {
      const g = ctx.guild;
      const owner = await g.fetchOwner?.().catch(() => null);
      const channels = [...g.channels.cache.values()];
      const count = (...types) => channels.filter((c) => types.includes(c.type)).length;
      const features = (g.features || []).map((f) => FEATURE_NAMES[f]).filter(Boolean);
      const bots = g.members.cache.filter((m) => m.user.bot).size;
      await ctx.reply({
        embeds: [
          ctx.embed({
            title: `🏠 ${g.name}`,
            description: g.description || null,
            thumbnail: g.iconURL({ size: 512 }),
            image: g.bannerURL?.({ size: 1024 }) || undefined,
            fields: [
              { name: 'Owner', value: owner ? `${owner.user} (\`${owner.user.username}\`)` : `<@${g.ownerId}>`, inline: true },
              { name: 'ID', value: `\`${g.id}\``, inline: true },
              { name: 'Created', value: `${discordTimestamp(g.createdAt, 'D')}\n${discordTimestamp(g.createdAt, 'R')}`, inline: true },
              { name: 'Members', value: `${formatNumber(g.memberCount)}${bots ? `\n(${bots}+ bots cached)` : ''}`, inline: true },
              {
                name: `Channels [${channels.length}]`,
                value: `#️⃣ ${count(ChannelType.GuildText, ChannelType.GuildAnnouncement)} • 🔊 ${count(ChannelType.GuildVoice, ChannelType.GuildStageVoice)} • 💬 ${count(ChannelType.GuildForum, ChannelType.GuildMedia)} • 📁 ${count(ChannelType.GuildCategory)}`,
                inline: true,
              },
              { name: 'Roles', value: String(Math.max(0, g.roles.cache.size - 1)), inline: true },
              { name: 'Emojis / Stickers', value: `${g.emojis?.cache.size ?? 0} / ${g.stickers?.cache.size ?? 0}`, inline: true },
              { name: 'Boosts', value: `${g.premiumSubscriptionCount || 0} (Level ${GuildPremiumTier[g.premiumTier] === 'None' ? 0 : g.premiumTier ?? 0})`, inline: true },
              { name: 'Verification', value: GuildVerificationLevel[g.verificationLevel] ?? 'Unknown', inline: true },
              { name: 'Vanity URL', value: g.vanityURLCode ? `discord.gg/${g.vanityURLCode}` : null, inline: true },
              { name: 'Features', value: features.length ? features.join(', ') : null, inline: false },
            ],
            footer: `Locale: ${g.preferredLocale || 'en-US'}`,
          }),
        ],
      });
    },
  },
  {
    name: 'servericon',
    aliases: ['guildicon', 'icon'],
    description: 'Show the server icon in full size',
    guildOnly: true,
    async execute(ctx) {
      const url = ctx.guild.iconURL({ size: 4096 });
      if (!url) return ctx.info('This server has no icon.');
      await ctx.reply({ embeds: [ctx.embed({ title: `${ctx.guild.name} — icon`, image: url })], components: [row(button(url, 'Open original', 'Link'))] });
    },
  },
  {
    name: 'serverbanner',
    aliases: ['guildbanner'],
    description: 'Show the server banner',
    guildOnly: true,
    async execute(ctx) {
      const url = ctx.guild.bannerURL?.({ size: 4096 });
      if (!url) return ctx.info('This server has no banner (needs boost level 2).');
      await ctx.reply({ embeds: [ctx.embed({ title: `${ctx.guild.name} — banner`, image: url })], components: [row(button(url, 'Open original', 'Link'))] });
    },
  },
  {
    name: 'splash',
    aliases: ['invitesplash'],
    description: 'Show the server\'s invite splash image',
    guildOnly: true,
    async execute(ctx) {
      const url = ctx.guild.splashURL?.({ size: 4096 }) || ctx.guild.discoverySplashURL?.({ size: 4096 });
      if (!url) return ctx.info('This server has no invite splash (needs boost level 1).');
      await ctx.reply({ embeds: [ctx.embed({ title: `${ctx.guild.name} — invite splash`, image: url })] });
    },
  },
  {
    name: 'membercount',
    aliases: ['mc', 'members'],
    description: 'How many members, humans and bots are here',
    guildOnly: true,
    cooldown: 5,
    async execute(ctx) {
      const members = await allMembers(ctx.guild);
      const bots = members.filter((m) => m.user.bot).size;
      const complete = members.size >= ctx.guild.memberCount;
      await ctx.reply({
        embeds: [
          ctx.embed({
            title: `👥 ${ctx.guild.name}`,
            fields: [
              { name: 'Total', value: formatNumber(ctx.guild.memberCount), inline: true },
              { name: 'Humans', value: complete ? formatNumber(ctx.guild.memberCount - bots) : `~${formatNumber(ctx.guild.memberCount - bots)}`, inline: true },
              { name: 'Bots', value: complete ? formatNumber(bots) : `${formatNumber(bots)}+`, inline: true },
            ],
            footer: complete ? null : 'Member list not fully loaded — human/bot split is approximate.',
          }),
        ],
      });
    },
  },
  memberListCommand({
    name: 'boosters',
    aliases: ['boosts', 'nitroboosters'],
    description: 'List members boosting this server',
    filter: (m) => m.premiumSince,
    sort: (a, b) => a.premiumSinceTimestamp - b.premiumSinceTimestamp,
    line: (m) => `${m} — since ${discordTimestamp(m.premiumSince, 'D')}`,
    empty: 'Nobody is boosting this server yet. 💜',
    title: (n) => `💎 ${n} booster(s)`,
  }),
  memberListCommand({
    name: 'listbots',
    aliases: ['serverbots', 'botlist'],
    description: 'List the bots in this server',
    filter: (m) => m.user.bot,
    sort: (a, b) => a.joinedTimestamp - b.joinedTimestamp,
    line: (m) => `${m} \`${m.user.username}\` — added ${discordTimestamp(m.joinedAt, 'R')}`,
    empty: 'No bots found (the member list may not be loaded).',
    title: (n) => `🤖 ${n} bot(s)`,
  }),
  memberListCommand({
    name: 'oldest',
    aliases: ['oldestmembers', 'firstjoins'],
    description: 'Members who joined this server first',
    filter: (m) => m.joinedTimestamp,
    sort: (a, b) => a.joinedTimestamp - b.joinedTimestamp,
    line: (m) => `${m} — joined ${discordTimestamp(m.joinedAt, 'D')}`,
    empty: 'No members found.',
    title: (n) => `🏛️ ${n} earliest member(s)`,
  }),
  memberListCommand({
    name: 'newest',
    aliases: ['newmembers', 'recentjoins'],
    description: 'Members who joined most recently',
    filter: (m) => m.joinedTimestamp,
    sort: (a, b) => b.joinedTimestamp - a.joinedTimestamp,
    line: (m) => `${m} — joined ${discordTimestamp(m.joinedAt, 'R')}`,
    empty: 'No members found.',
    title: (n) => `🆕 ${n} newest member(s)`,
  }),
  memberListCommand({
    name: 'oldestaccounts',
    aliases: ['oldaccounts'],
    description: 'Members with the oldest Discord accounts',
    filter: (m) => m.user.createdTimestamp,
    sort: (a, b) => a.user.createdTimestamp - b.user.createdTimestamp,
    line: (m) => `${m} — account from ${discordTimestamp(m.user.createdAt, 'D')}`,
    empty: 'No members found.',
    title: (n) => `🦕 ${n} oldest account(s)`,
  }),
  memberListCommand({
    name: 'newestaccounts',
    aliases: ['newaccounts', 'youngaccounts'],
    description: 'Members with the newest Discord accounts (alt check)',
    filter: (m) => m.user.createdTimestamp && !m.user.bot,
    sort: (a, b) => b.user.createdTimestamp - a.user.createdTimestamp,
    line: (m) => `${m} — account created ${discordTimestamp(m.user.createdAt, 'R')}`,
    empty: 'No members found.',
    title: (n) => `🐣 ${n} newest account(s)`,
  }),
  {
    name: 'serverowner',
    aliases: ['owner', 'guildowner'],
    description: 'Who owns this server',
    guildOnly: true,
    async execute(ctx) {
      const owner = await ctx.guild.fetchOwner?.().catch(() => null);
      await ctx.info(`👑 This server is owned by ${owner ? `${owner.user} (\`${owner.user.username}\`)` : `<@${ctx.guild.ownerId}>`}.`);
    },
  },
  {
    name: 'channels',
    aliases: ['channellist'],
    description: 'List all channels grouped by category',
    guildOnly: true,
    cooldown: 3,
    async execute(ctx) {
      const all = [...ctx.guild.channels.cache.values()].filter((c) => !c.isThread?.());
      const byPos = (a, b) => (a.rawPosition ?? a.position ?? 0) - (b.rawPosition ?? b.position ?? 0);
      const cats = all.filter((c) => c.type === ChannelType.GuildCategory).sort(byPos);
      const lines = [];
      const fmt = (c) => `${TYPE_ICON[c.type] || '•'} ${c.type === ChannelType.GuildCategory ? c.name : c.toString()}`;
      for (const c of all.filter((x) => !x.parentId && x.type !== ChannelType.GuildCategory).sort(byPos)) lines.push(fmt(c));
      for (const cat of cats) {
        lines.push(`\n📁 **${cat.name.toUpperCase()}**`);
        for (const c of all.filter((x) => x.parentId === cat.id).sort(byPos)) lines.push(`  ${fmt(c)}`);
      }
      await paginate(ctx, linePages(ctx, `📚 ${all.length} channels`, lines, { perPage: 35 }));
    },
  },
  {
    name: 'channelinfo',
    aliases: ['ci', 'channel'],
    description: 'Information about a channel',
    usage: '[#channel]',
    examples: [''],
    guildOnly: true,
    async execute(ctx) {
      const c = ctx.args.length ? ctx.resolveChannel(ctx.rest(0)) : ctx.channel;
      if (!c) return ctx.fail('Channel not found.');
      const voice = c.isVoiceBased?.();
      await ctx.reply({
        embeds: [
          ctx.embed({
            title: `${TYPE_ICON[c.type] || '#'} ${c.name}`,
            description: c.topic ? truncate(c.topic, 1000) : null,
            fields: [
              { name: 'ID', value: `\`${c.id}\``, inline: true },
              { name: 'Type', value: TYPE_NAME[c.type] || 'Unknown', inline: true },
              { name: 'Category', value: c.parent?.name || 'None', inline: true },
              { name: 'Created', value: `${discordTimestamp(c.createdAt || snowflakeDate(c.id), 'D')} (${discordTimestamp(c.createdAt || snowflakeDate(c.id), 'R')})`, inline: false },
              { name: 'Position', value: String((c.position ?? 0) + 1), inline: true },
              { name: 'NSFW', value: c.nsfw ? 'Yes' : 'No', inline: true },
              { name: 'Slowmode', value: c.rateLimitPerUser ? `${c.rateLimitPerUser}s` : 'Off', inline: true },
              voice && { name: 'Bitrate', value: `${Math.round((c.bitrate || 0) / 1000)} kbps`, inline: true },
              voice && { name: 'User limit', value: c.userLimit ? String(c.userLimit) : 'Unlimited', inline: true },
              voice && { name: 'Connected', value: String(c.members?.size ?? 0), inline: true },
            ],
          }),
        ],
      });
    },
  },
  {
    name: 'threads',
    aliases: ['activethreads'],
    description: 'List active threads in this server',
    guildOnly: true,
    cooldown: 5,
    async execute(ctx) {
      const res = typeof ctx.guild.channels.fetchActiveThreads === 'function' ? await ctx.guild.channels.fetchActiveThreads().catch(() => null) : null;
      const threads = res ? [...res.threads.values()].filter((t) => t.permissionsFor?.(ctx.member)?.has(PermissionFlagsBits.ViewChannel) ?? true) : [];
      if (!threads.length) return ctx.info('There are no active threads I can see.');
      const lines = threads.map((t) => `🧵 ${t} in ${t.parent ? `<#${t.parentId}>` : 'unknown'} — ${t.memberCount ?? '?'} members`);
      await paginate(ctx, linePages(ctx, `🧵 ${threads.length} active thread(s)`, lines));
    },
  },
  {
    name: 'emojis',
    aliases: ['emotes', 'emojilist'],
    description: 'List the server\'s custom emojis',
    guildOnly: true,
    async execute(ctx) {
      const emojis = [...(ctx.guild.emojis?.cache.values() || [])];
      if (!emojis.length) return ctx.info('This server has no custom emojis.');
      const animated = emojis.filter((e) => e.animated).length;
      const pages = chunk(emojis, 40).map((part, i, all) =>
        ctx.embed({
          title: `😀 ${emojis.length} emojis (${emojis.length - animated} static, ${animated} animated)`,
          description: part.map((e) => `${e} \`:${e.name}:\``).join('  '),
          footer: `Page ${i + 1}/${all.length}`,
        }),
      );
      await paginate(ctx, pages);
    },
  },
  {
    name: 'emojiinfo',
    aliases: ['ei', 'emoteinfo'],
    description: 'Info about a custom or standard emoji',
    usage: '<emoji>',
    examples: ['<:pepe:123456789012345678>', '😀'],
    minArgs: 1,
    async execute(ctx) {
      const custom = parseCustomEmoji(ctx.args[0]);
      if (custom) {
        const local = ctx.client.emojis?.cache?.get(custom.id);
        const created = snowflakeDate(custom.id);
        return ctx.reply({
          embeds: [
            ctx.embed({
              title: `:${custom.name}:`,
              thumbnail: custom.url,
              fields: [
                { name: 'ID', value: `\`${custom.id}\``, inline: true },
                { name: 'Animated', value: custom.animated ? 'Yes' : 'No', inline: true },
                { name: 'Created', value: discordTimestamp(created, 'D'), inline: true },
                { name: 'Server', value: local?.guild ? local.guild.name : 'Not a server I am in', inline: true },
                { name: 'Raw', value: `\`${ctx.args[0]}\``, inline: false },
              ],
            }),
          ],
          components: [row(button(custom.url.replace('?size=512', '?size=4096'), 'Open image', 'Link'))],
        });
      }
      const chars = [...ctx.args[0]];
      if (!chars.length || /^[\w\s]+$/.test(ctx.args[0])) return ctx.fail('That does not look like an emoji.');
      const points = chars.map((c) => `U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`);
      const hex = chars.map((c) => c.codePointAt(0).toString(16)).filter((h, _, arr) => (arr.includes('200d') ? true : h !== 'fe0f')).join('-');
      await ctx.reply({
        embeds: [
          ctx.embed({
            title: `${ctx.args[0]} Unicode emoji`,
            thumbnail: `https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/72x72/${hex}.png`,
            fields: [
              { name: 'Code points', value: `\`${points.join(' ')}\``, inline: false },
              { name: 'Escaped', value: `\`${chars.map((c) => `\\u{${c.codePointAt(0).toString(16)}}`).join('')}\``, inline: false },
            ],
          }),
        ],
      });
    },
  },
  {
    name: 'stickers',
    aliases: ['stickerlist'],
    description: 'List the server\'s stickers',
    guildOnly: true,
    async execute(ctx) {
      const stickers = [...(ctx.guild.stickers?.cache.values() || [])];
      if (!stickers.length) return ctx.info('This server has no stickers.');
      const lines = stickers.map((s) => `🏷️ **${s.name}** — ${s.description || 'no description'} ${s.tags ? `(:${s.tags}:)` : ''}`);
      await paginate(ctx, linePages(ctx, `🏷️ ${stickers.length} sticker(s)`, lines));
    },
  },
  {
    name: 'roles',
    aliases: ['rolelist', 'allroles'],
    description: 'List all roles with member counts',
    guildOnly: true,
    cooldown: 5,
    async execute(ctx) {
      await allMembers(ctx.guild);
      const roles = [...ctx.guild.roles.cache.values()].filter((r) => r.id !== ctx.guild.id).sort((a, b) => b.position - a.position);
      if (!roles.length) return ctx.info('This server has no roles besides @everyone.');
      const lines = roles.map((r) => `${r} — ${formatNumber(r.members?.size ?? 0)} member(s)${r.managed ? ' • 🤖 managed' : ''}`);
      await paginate(ctx, linePages(ctx, `🏷️ ${roles.length} role(s)`, lines, { perPage: 25 }));
    },
  },
  {
    name: 'roleinfo',
    aliases: ['ri', 'role-info'],
    description: 'Information about a role',
    usage: '<role>',
    examples: ['@everyone'],
    guildOnly: true,
    minArgs: 1,
    slash: true,
    args: [{ name: 'role', type: 'role', description: 'The role', required: true }],
    async execute(ctx) {
      const role = ctx.resolveRole(ctx.rest(0)) || (ctx.rest(0) === '@everyone' ? ctx.guild.roles.everyone : null);
      if (!role) return ctx.fail('Role not found.');
      await allMembers(ctx.guild);
      await ctx.reply({
        embeds: [
          ctx.embed({
            title: `🏷️ ${role.name}`,
            color: role.color || ctx.color,
            thumbnail: role.iconURL?.() || undefined,
            fields: [
              { name: 'ID', value: `\`${role.id}\``, inline: true },
              { name: 'Colour', value: role.hexColor || '#000000', inline: true },
              { name: 'Position', value: String(role.position), inline: true },
              { name: 'Members', value: formatNumber(role.members?.size ?? 0), inline: true },
              { name: 'Hoisted', value: role.hoist ? 'Yes' : 'No', inline: true },
              { name: 'Mentionable', value: role.mentionable ? 'Yes' : 'No', inline: true },
              { name: 'Managed', value: role.managed ? 'Yes (bot/integration)' : 'No', inline: true },
              { name: 'Created', value: discordTimestamp(role.createdAt || snowflakeDate(role.id), 'R'), inline: true },
              { name: 'Key permissions', value: keyPermissions(role.permissions), inline: false },
            ],
          }),
        ],
      });
    },
  },
  {
    name: 'inrole',
    aliases: ['rolemembers', 'whohas'],
    description: 'List members who have a role',
    usage: '<role>',
    examples: ['@everyone'],
    guildOnly: true,
    minArgs: 1,
    cooldown: 5,
    async execute(ctx) {
      const role = ctx.resolveRole(ctx.rest(0));
      if (!role) return ctx.fail('Role not found.');
      await ctx.defer();
      await allMembers(ctx.guild);
      const members = [...(role.members?.values() || [])].sort((a, b) => a.displayName.localeCompare(b.displayName));
      if (!members.length) return ctx.info(`Nobody has ${role} (or the member list is not loaded).`);
      const lines = members.map((m) => `${m} \`${m.user.username}\``);
      await paginate(ctx, linePages(ctx, `🏷️ ${members.length} member(s) with @${role.name}`, lines, { perPage: 25 }));
    },
  },
  {
    name: 'inviteinfo',
    aliases: ['invinfo', 'checkinvite'],
    description: 'Look up a Discord invite link',
    usage: '<invite link or code>',
    examples: ['discord.gg/discord-developers'],
    minArgs: 1,
    cooldown: 4,
    async execute(ctx) {
      const m = ctx.args[0].match(/(?:discord(?:app)?\.com\/invite|discord\.gg)\/([\w-]+)/i);
      const code = m ? m[1] : ctx.args[0].replace(/[^\w-]/g, '');
      if (!code) return ctx.usage();
      let inv;
      try {
        inv = await ctx.client.fetchInvite(code);
      } catch {
        return ctx.fail('That invite is invalid or has expired.');
      }
      const g = inv.guild;
      await ctx.reply({
        embeds: [
          ctx.embed({
            title: `📨 ${g?.name || inv.channel?.name || 'Invite'}`,
            url: inv.url,
            description: g?.description || null,
            thumbnail: g?.iconURL?.({ size: 256 }) || undefined,
            fields: [
              { name: 'Code', value: `\`${inv.code}\``, inline: true },
              { name: 'Server ID', value: g ? `\`${g.id}\`` : null, inline: true },
              { name: 'Channel', value: inv.channel ? `#${inv.channel.name}` : null, inline: true },
              { name: 'Members', value: inv.memberCount ? `${formatNumber(inv.memberCount)} (${formatNumber(inv.presenceCount || 0)} online)` : null, inline: true },
              { name: 'Inviter', value: inv.inviter ? inv.inviter.username : null, inline: true },
              { name: 'Expires', value: inv.expiresAt ? discordTimestamp(inv.expiresAt, 'R') : 'Never', inline: true },
              { name: 'Boosts', value: g?.premiumSubscriptionCount != null ? String(g.premiumSubscriptionCount) : null, inline: true },
            ],
          }),
        ],
      });
    },
  },
  {
    name: 'firstmessage',
    aliases: ['firstmsg', 'fm'],
    description: 'Jump to the first message in a channel',
    usage: '[#channel]',
    examples: [''],
    guildOnly: true,
    cooldown: 5,
    async execute(ctx) {
      const channel = ctx.args.length ? ctx.resolveChannel(ctx.rest(0)) : ctx.channel;
      if (!channel?.messages) return ctx.fail('That channel has no messages I can read.');
      const perms = channel.permissionsFor?.(ctx.member);
      if (perms && !perms.has(PermissionFlagsBits.ReadMessageHistory)) return ctx.fail('You cannot read the history of that channel.');
      const msgs = await channel.messages.fetch({ after: '1', limit: 1 }).catch(() => null);
      const first = msgs?.first?.();
      if (!first) return ctx.info('I could not find any messages there.');
      await ctx.reply({
        embeds: [
          ctx.embed({
            title: `📜 First message in #${channel.name}`,
            description: truncate(first.content || '*(no text — embed or attachment)*', 1000),
            author: { name: first.author?.username || 'Unknown', iconURL: first.author?.displayAvatarURL?.() },
            footer: `Sent ${first.createdAt?.toUTCString?.() || ''}`,
          }),
        ],
        components: [row(button(first.url, 'Jump to message', 'Link'))],
      });
    },
  },
];
