'use strict';
/** Snipe recently deleted/edited messages and removed reactions. Kept in memory only, per bot, for 1 hour. */
const { discordTimestamp, truncate } = require('../../core/utils');

const KEEP = 10;
const TTL = 60 * 60 * 1000;
const stores = new WeakMap(); // client -> { deleted, edited, reactions } maps of channelId -> entries[]

function store(client) {
  let s = stores.get(client);
  if (!s) {
    s = { deleted: new Map(), edited: new Map(), reactions: new Map() };
    stores.set(client, s);
  }
  return s;
}

function push(map, channelId, entry) {
  const list = (map.get(channelId) || []).filter((e) => Date.now() - e.at < TTL);
  list.unshift(entry);
  map.set(channelId, list.slice(0, KEEP));
  if (map.size > 5000) map.delete(map.keys().next().value);
}

function get(map, channelId, n) {
  const list = (map.get(channelId) || []).filter((e) => Date.now() - e.at < TTL);
  return { entry: list[n - 1] || null, total: list.length };
}

const indexArg = (ctx) => Math.min(Math.max(parseInt(ctx.args[0], 10) || 1, 1), KEEP);

const commands = [
  {
    name: 'snipe',
    aliases: ['sniped'],
    description: 'Show the most recently deleted message in this channel',
    usage: '[1-10]',
    examples: ['', '2'],
    guildOnly: true,
    slash: true,
    args: [{ name: 'index', type: 'integer', description: 'How far back (1 = latest)', required: false, min: 1, max: 10 }],
    async execute(ctx) {
      const n = indexArg(ctx);
      const { entry, total } = get(store(ctx.client).deleted, ctx.channel.id, n);
      if (!entry) return ctx.info('There is nothing to snipe here. 🔫');
      await ctx.reply({
        embeds: [
          ctx.embed({
            author: { name: entry.authorTag, iconURL: entry.avatar },
            description: entry.content ? truncate(entry.content, 4000) : '*(no text)*',
            image: entry.image || undefined,
            fields: [entry.files.length > (entry.image ? 1 : 0) && { name: 'Attachments', value: entry.files.map((f, i) => `[file ${i + 1}](${f})`).join(' • ') }],
            footer: `Deleted ${n}/${total} • sent`,
            timestamp: new Date(entry.sentAt),
          }),
        ],
      });
    },
  },
  {
    name: 'editsnipe',
    aliases: ['esnipe', 'es'],
    description: 'Show the most recently edited message (before and after)',
    usage: '[1-10]',
    examples: [''],
    guildOnly: true,
    async execute(ctx) {
      const n = indexArg(ctx);
      const { entry, total } = get(store(ctx.client).edited, ctx.channel.id, n);
      if (!entry) return ctx.info('No edited messages to snipe here.');
      await ctx.reply({
        embeds: [
          ctx.embed({
            author: { name: entry.authorTag, iconURL: entry.avatar },
            url: entry.url,
            title: 'Jump to message',
            fields: [
              { name: 'Before', value: truncate(entry.before || '*(empty)*', 1024) },
              { name: 'After', value: truncate(entry.after || '*(empty)*', 1024) },
            ],
            footer: `Edit ${n}/${total} • edited`,
            timestamp: new Date(entry.at),
          }),
        ],
      });
    },
  },
  {
    name: 'reactionsnipe',
    aliases: ['rsnipe'],
    description: 'Show recently removed reactions in this channel',
    guildOnly: true,
    async execute(ctx) {
      const list = (store(ctx.client).reactions.get(ctx.channel.id) || []).filter((e) => Date.now() - e.at < TTL);
      if (!list.length) return ctx.info('No removed reactions to snipe here.');
      const lines = list.map((e) => `${e.emoji} removed by **${e.userTag}** ${discordTimestamp(e.at, 'R')} — [message](${e.url})`);
      await ctx.reply({ embeds: [ctx.embed({ title: '🔫 Removed reactions', description: lines.join('\n') })] });
    },
  },
  {
    name: 'clearsnipe',
    aliases: ['clearsnipes', 'nosnipe'],
    description: 'Wipe the snipe history for this channel',
    guildOnly: true,
    userPerms: ['ManageMessages'],
    async execute(ctx) {
      const s = store(ctx.client);
      for (const map of [s.deleted, s.edited, s.reactions]) map.delete(ctx.channel.id);
      await ctx.ok('Snipe history for this channel cleared.');
    },
  },
];

const events = {
  async messageDelete(client, message) {
    if (message.partial || !message.guild || message.author?.bot) return;
    if (!message.content && !message.attachments?.size) return;
    const files = [...message.attachments.values()].map((a) => a.proxyURL || a.url);
    const image = [...message.attachments.values()].find((a) => a.contentType?.startsWith('image/'));
    push(store(client).deleted, message.channel.id, {
      content: message.content,
      authorTag: message.author.username,
      avatar: message.author.displayAvatarURL(),
      files,
      image: image ? image.proxyURL || image.url : null,
      sentAt: message.createdTimestamp,
      at: Date.now(),
    });
  },
  async messageUpdate(client, oldMessage, newMessage) {
    if (oldMessage.partial || !newMessage.guild || newMessage.author?.bot) return;
    if (!oldMessage.content || oldMessage.content === newMessage.content) return;
    push(store(client).edited, newMessage.channel.id, {
      before: oldMessage.content,
      after: newMessage.content,
      authorTag: newMessage.author.username,
      avatar: newMessage.author.displayAvatarURL(),
      url: newMessage.url,
      at: Date.now(),
    });
  },
  async messageReactionRemove(client, reaction, user) {
    if (user.bot || !reaction.message.guild) return;
    push(store(client).reactions, reaction.message.channelId, {
      emoji: reaction.emoji.toString(),
      userTag: user.username || 'Unknown',
      url: reaction.message.url,
      at: Date.now(),
    });
  },
};

module.exports = { commands, events };
