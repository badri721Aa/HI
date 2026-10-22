'use strict';
const db = require('../../core/db');
const { embed } = require('../../core/embeds');
const { truncate } = require('../../core/utils');
const { peek, owns, withLock, fetchMsg } = require('./_lib');

/**
 * Guild section "sticky": { channels: { [channelId]: { content, lastMessageId, botId } } }
 * After activity in the channel the sticky message is re-posted at the bottom (debounced).
 */
const DEFAULTS = { channels: {} };
const MAX_STICKIES = 15;
const DEBOUNCE_MS = 5000;
const timers = new Map();
const section = (ctx) => db.section(ctx.guild.id, 'sticky', DEFAULTS);

function stickyPayload(content, color) {
  return { embeds: [embed({ color, title: '📌 Sticky message', description: content })], allowedMentions: { parse: [] } };
}

async function repost(client, channel, entry) {
  await withLock(`sticky:${channel.id}`, async () => {
    if (entry.lastMessageId) {
      const old = await fetchMsg(channel, entry.lastMessageId);
      await old?.delete().catch(() => {});
    }
    const sent = await channel.send(stickyPayload(entry.content, client.botProfile.color)).catch(() => null);
    entry.lastMessageId = sent?.id || null;
    db.save();
  });
}

module.exports = {
  commands: [
    {
      name: 'stick',
      aliases: ['sticky', 'setsticky'],
      description: 'Keep a message pinned to the bottom of this channel',
      usage: '<message>',
      examples: ['Read the rules before posting!'],
      guildOnly: true,
      userPerms: ['ManageMessages'],
      botPerms: ['ManageMessages', 'SendMessages', 'EmbedLinks'],
      minArgs: 1,
      async execute(ctx) {
        const cfg = section(ctx);
        const content = truncate(ctx.rest(0), 2000);
        const existing = cfg.channels[ctx.channel.id];
        if (!existing && Object.keys(cfg.channels).length >= MAX_STICKIES) return ctx.fail(`You can have at most ${MAX_STICKIES} sticky messages.`);
        const entry = { content, lastMessageId: existing?.lastMessageId || null, botId: ctx.client.user.id };
        cfg.channels[ctx.channel.id] = entry;
        db.save();
        if (ctx.message) await ctx.message.delete().catch(() => {});
        await repost(ctx.client, ctx.channel, entry);
        if (ctx.isSlash) await ctx.reply({ content: '📌 Sticky message set.', ephemeral: true });
      },
    },
    {
      name: 'unstick',
      aliases: ['removesticky'],
      description: 'Remove the sticky message from this channel',
      guildOnly: true,
      userPerms: ['ManageMessages'],
      async execute(ctx) {
        const cfg = section(ctx);
        const entry = cfg.channels[ctx.channel.id];
        if (!entry) return ctx.fail('This channel has no sticky message.');
        delete cfg.channels[ctx.channel.id];
        db.save();
        const old = await fetchMsg(ctx.channel, entry.lastMessageId);
        await old?.delete().catch(() => {});
        await ctx.ok('Sticky message removed.');
      },
    },
    {
      name: 'stickies',
      aliases: ['stickylist'],
      description: 'List sticky messages in this server',
      guildOnly: true,
      userPerms: ['ManageMessages'],
      async execute(ctx) {
        const entries = Object.entries(section(ctx).channels);
        if (!entries.length) return ctx.info(`No sticky messages. Add one with \`${ctx.prefix}stick <message>\`.`);
        await ctx.info(entries.map(([ch, e]) => `<#${ch}> — ${truncate(e.content.replace(/\n/g, ' '), 80)}`).join('\n'), '📌 Sticky messages');
      },
    },
  ],
  events: {
    async messageCreate(client, message) {
      if (!message.guild) return false;
      const entry = peek(message.guild.id, 'sticky')?.channels?.[message.channel.id];
      if (!entry || !owns(entry, client)) return false;
      clearTimeout(timers.get(message.channel.id));
      const t = setTimeout(() => {
        timers.delete(message.channel.id);
        const live = peek(message.guild.id, 'sticky')?.channels?.[message.channel.id];
        if (live) repost(client, message.channel, live).catch(() => {});
      }, DEBOUNCE_MS);
      t.unref?.();
      timers.set(message.channel.id, t);
      return false;
    },
  },
};
