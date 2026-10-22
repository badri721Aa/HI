'use strict';
const { PermissionFlagsBits } = require('discord.js');
const { truncate } = require('../../core/utils');
const { button, row } = require('../../core/ui');

const LINK_RE = /discord(?:app)?\.com\/channels\/(\d+|@me)\/(\d+)\/(\d+)/;

/** Message from a link argument or from the message being replied to; checks the user may see it. */
async function linkedMessage(ctx) {
  let channelId;
  let messageId;
  const m = (ctx.args[0] || '').match(LINK_RE);
  if (m) {
    if (!ctx.guild || m[1] !== ctx.guild.id) return { error: 'I can only fetch messages from this server.' };
    [, , channelId, messageId] = m;
  } else if (ctx.message?.reference?.messageId) {
    channelId = ctx.message.reference.channelId;
    messageId = ctx.message.reference.messageId;
  } else {
    return { error: null };
  }
  const channel = ctx.guild?.channels.cache.get(channelId) || (await ctx.client.channels.fetch(channelId).catch(() => null));
  if (!channel?.messages) return { error: 'I cannot see that channel.' };
  const perms = channel.permissionsFor?.(ctx.member);
  if (perms && !perms.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory])) return { error: 'You cannot read that channel.' };
  const msg = await channel.messages.fetch(messageId).catch(() => null);
  if (!msg?.author) return { error: 'Message not found (deleted, or I cannot read that channel).' };
  return { msg };
}

function messageEmbed(ctx, msg) {
  const image = [...msg.attachments.values()].find((a) => a.contentType?.startsWith('image/'));
  return ctx.embed({
    author: { name: msg.author.username, iconURL: msg.author.displayAvatarURL() },
    description: truncate(msg.content || (msg.embeds[0]?.description ? `*(embed)* ${msg.embeds[0].description}` : '*(no text)*'), 4000),
    image: image?.url,
    footer: `#${msg.channel.name || 'dm'}`,
    timestamp: msg.createdAt,
  });
}

function parseColor(str) {
  const s = String(str || '').trim().replace(/^#/, '');
  return /^[0-9a-f]{6}$/i.test(s) ? parseInt(s, 16) : null;
}

const isUrl = (s) => /^https?:\/\/\S+$/i.test(String(s || '').trim());

module.exports = [
  {
    name: 'say',
    aliases: ['echo'],
    description: 'Make the bot say something (mentions of @everyone/roles are blocked)',
    usage: '<text>',
    examples: ['Hello everyone!'],
    guildOnly: true,
    minArgs: 1,
    userPerms: ['ManageMessages'],
    async execute(ctx) {
      const text = ctx.rest(0).slice(0, 2000);
      if (ctx.isSlash) {
        await ctx.reply({ content: '✅ Sent.', ephemeral: true });
      } else if (ctx.channel.permissionsFor?.(ctx.guild.members.me)?.has(PermissionFlagsBits.ManageMessages)) {
        await ctx.message.delete().catch(() => {});
      }
      await ctx.channel.send({ content: text });
    },
  },
  {
    name: 'embed',
    aliases: ['embedsay', 'makeembed'],
    description: 'Send a custom embed: title | description | #color | footer | image url',
    usage: '<title> | <description> [| #hex color] [| footer] [| image url]',
    examples: ['Rules | Be nice\\nNo spam | #ff0000 | Thanks for reading'],
    guildOnly: true,
    minArgs: 1,
    userPerms: ['ManageMessages'],
    botPerms: ['EmbedLinks'],
    async execute(ctx) {
      const [title, description, color, footer, image] = ctx.rest(0).split('|').map((s) => s.trim());
      if (!title && !description) return ctx.usage();
      const e = ctx.embed({
        title: title || undefined,
        description: description ? description.replace(/\\n/g, '\n') : undefined,
        color: parseColor(color) ?? ctx.color,
        footer: footer || undefined,
        image: isUrl(image) ? image : undefined,
      });
      if (ctx.isSlash) await ctx.reply({ content: '✅ Sent.', ephemeral: true });
      else await ctx.message.delete().catch(() => {});
      await ctx.channel.send({ embeds: [e] });
    },
  },
  {
    name: 'announce',
    aliases: ['announcement'],
    description: 'Post an announcement embed in a channel',
    usage: '<#channel> <message>',
    examples: ['#general Server maintenance tonight at 10pm UTC.'],
    guildOnly: true,
    minArgs: 2,
    userPerms: ['ManageMessages'],
    async execute(ctx) {
      const channel = ctx.resolveChannel(ctx.args[0]);
      if (!channel?.isTextBased?.() || channel.isVoiceBased?.()) return ctx.fail('Pick a text channel, e.g. `#announcements`.');
      const text = ctx.rest(1);
      if (!text) return ctx.usage();
      const mine = channel.permissionsFor(ctx.guild.members.me);
      if (!mine?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
        return ctx.fail(`I need View Channel, Send Messages and Embed Links in ${channel}.`);
      }
      if (!channel.permissionsFor(ctx.member)?.has(PermissionFlagsBits.SendMessages)) return ctx.fail(`You cannot send messages in ${channel}.`);
      const sent = await channel.send({
        embeds: [
          ctx.embed({
            author: { name: ctx.guild.name, iconURL: ctx.guild.iconURL() || undefined },
            title: '📢 Announcement',
            description: text.slice(0, 4000),
            footer: { text: `Posted by ${ctx.author.username}`, iconURL: ctx.author.displayAvatarURL() },
            timestamp: true,
          }),
        ],
      });
      await ctx.ok(`Announcement posted in ${channel}. [Jump](${sent.url})`);
    },
  },
  {
    name: 'quotemsg',
    aliases: ['quotemessage', 'msglink'],
    description: 'Show a message from a link (or the one you reply to) as an embed',
    usage: '<message link>',
    examples: ['https://discord.com/channels/222222222222222222/333333333333333333/444444444444444444'],
    guildOnly: true,
    async execute(ctx) {
      const { msg, error } = await linkedMessage(ctx);
      if (!msg) return error ? ctx.fail(error) : ctx.usage('Give a message link or reply to a message.');
      await ctx.reply({ embeds: [messageEmbed(ctx, msg)], components: [row(button(msg.url, 'Jump to message', 'Link'))] });
    },
  },
  {
    name: 'bookmark',
    aliases: ['bm', 'savemsg'],
    description: 'DM yourself a copy of a message (link or reply) to read later',
    usage: '<message link> [note]',
    examples: ['https://discord.com/channels/222222222222222222/333333333333333333/444444444444444444 read later'],
    guildOnly: true,
    async execute(ctx) {
      const { msg, error } = await linkedMessage(ctx);
      if (!msg) return error ? ctx.fail(error) : ctx.usage('Give a message link or reply to a message.');
      const note = LINK_RE.test(ctx.args[0] || '') ? ctx.rest(1) : ctx.rest(0);
      try {
        await ctx.author.send({
          content: `🔖 Bookmark from **${ctx.guild.name}**${note ? `: ${truncate(note, 300)}` : ''}`,
          embeds: [messageEmbed(ctx, msg)],
          components: [row(button(msg.url, 'Jump to message', 'Link'))],
        });
      } catch {
        return ctx.fail('I could not DM you — open your DMs (Privacy Settings) and try again.');
      }
      await ctx.ok('Bookmarked — check your DMs. 🔖');
    },
  },
];
