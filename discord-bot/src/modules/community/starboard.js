'use strict';
const db = require('../../core/db');
const { embed } = require('../../core/embeds');
const { parseToggle, truncate } = require('../../core/utils');
const { peek, claim, owns, parseEmoji, reactionKey, postableChannel, withLock, fetchMsg } = require('./_lib');

/**
 * Settings: guild section "starboard". Posted messages: collection "starboard"
 *   `${guildId}:${originalMessageId}` -> { starMessageId, channelId, count, botId }
 */
const DEFAULTS = { enabled: false, channel: null, threshold: 3, emoji: '⭐', emojiKey: '⭐', selfStar: false, ignored: [], botId: null };
const COL = 'starboard';
const section = (ctx) => db.section(ctx.guild.id, 'starboard', DEFAULTS);

function starEmoji(count, base) {
  if (base !== '⭐') return base;
  return count >= 25 ? '💫' : count >= 10 ? '🌟' : '⭐';
}

function starPost(msg, count, cfg) {
  const image = [...msg.attachments.values()].find((a) => a.contentType?.startsWith('image/'))?.url || msg.embeds.find((e) => e.image || e.thumbnail)?.image?.url;
  const description = truncate(msg.content || (msg.embeds[0]?.description ?? ''), 3800) || (image ? '' : '*[no text]*');
  return {
    content: `${starEmoji(count, cfg.emoji)} **${count}** | <#${msg.channelId}>`,
    embeds: [
      embed({
        color: 0xf1c40f,
        author: { name: msg.author.username, iconURL: msg.author.displayAvatarURL() },
        description: `${description}\n\n[Jump to message](${msg.url})`,
        image,
        timestamp: msg.createdAt,
        footer: `ID ${msg.id}`,
      }),
    ],
    allowedMentions: { parse: [] },
  };
}

async function onReaction(client, reaction) {
  const guildId = reaction.message.guildId;
  if (!guildId) return;
  const cfg = peek(guildId, 'starboard');
  if (!cfg?.enabled || !cfg.channel || !owns(cfg, client)) return;
  if (reactionKey(reaction.emoji) !== cfg.emojiKey) return;
  if (reaction.message.channelId === cfg.channel || cfg.ignored.includes(reaction.message.channelId)) return;

  await withLock(`star:${reaction.message.id}`, async () => {
    if (reaction.partial) await reaction.fetch().catch(() => null);
    const msg = reaction.message.partial ? await reaction.message.fetch().catch(() => null) : reaction.message;
    if (!msg?.guild || !msg.author) return;
    const starChannel = msg.guild.channels.cache.get(cfg.channel);
    if (!starChannel?.send) return;
    if (msg.channel.nsfw && !starChannel.nsfw) return; // never leak NSFW content to a SFW starboard

    const live = msg.reactions.cache.find((r) => reactionKey(r.emoji) === cfg.emojiKey);
    let count = live?.count || 0;
    if (live && count <= 100) {
      // Count real people only; the author's own star counts only when self-stars are allowed.
      const users = await live.users.fetch().catch(() => null);
      if (users) count = users.filter((u) => !u.bot && (cfg.selfStar || u.id !== msg.author.id)).size;
    }

    const key = `${guildId}:${msg.id}`;
    const rec = db.get(COL, key, null);
    if (count >= cfg.threshold) {
      const payload = starPost(msg, count, cfg);
      const existing = rec && (await fetchMsg(starChannel, rec.starMessageId));
      if (existing) {
        await existing.edit(payload).catch(() => {});
        rec.count = count;
        db.save();
      } else {
        const posted = await starChannel.send(payload).catch(() => null);
        if (posted) db.set(COL, key, { starMessageId: posted.id, channelId: starChannel.id, count, botId: client.user.id });
      }
    } else if (rec) {
      const existing = await fetchMsg(starChannel, rec.starMessageId);
      await existing?.delete().catch(() => {});
      db.delete(COL, key);
    }
  });
}

const base = { guildOnly: true, userPerms: ['ManageGuild'] };

module.exports = {
  commands: [
    {
      ...base,
      name: 'starboard',
      description: 'Show the starboard settings',
      async execute(ctx) {
        const cfg = section(ctx);
        await ctx.info(
          [
            `**Status:** ${cfg.enabled && cfg.channel ? '🟢 On' : '🔴 Off'}`,
            `**Channel:** ${cfg.channel ? `<#${cfg.channel}>` : 'not set'}`,
            `**Emoji:** ${cfg.emoji} • **Needed:** ${cfg.threshold}`,
            `**Self-stars count:** ${cfg.selfStar ? 'yes' : 'no'}`,
            `**Ignored channels:** ${cfg.ignored.map((c) => `<#${c}>`).join(', ') || 'none'}`,
          ].join('\n'),
          '⭐ Starboard',
        );
      },
    },
    {
      ...base,
      name: 'setstarboard',
      description: 'Set the starboard channel and turn the starboard on',
      usage: '<#channel>',
      examples: ['#general'],
      minArgs: 1,
      async execute(ctx) {
        const { channel, error } = postableChannel(ctx, ctx.args[0]);
        if (error) return ctx.fail(error);
        const cfg = section(ctx);
        cfg.channel = channel.id;
        cfg.enabled = true;
        claim(cfg, ctx.client);
        await ctx.ok(`Messages with **${cfg.threshold}** ${cfg.emoji} reactions will be posted in ${channel}.`);
      },
    },
    {
      ...base,
      name: 'starthreshold',
      aliases: ['starlimit'],
      description: 'How many star reactions a message needs (1-100)',
      usage: '<number>',
      examples: ['5'],
      minArgs: 1,
      async execute(ctx) {
        const n = parseInt(ctx.args[0], 10);
        if (!Number.isInteger(n) || n < 1 || n > 100) return ctx.usage('Pick a number from 1 to 100.');
        const cfg = section(ctx);
        cfg.threshold = n;
        claim(cfg, ctx.client);
        await ctx.ok(`Messages now need **${n}** ${cfg.emoji} to reach the starboard.`);
      },
    },
    {
      ...base,
      name: 'staremoji',
      description: 'Change the starboard emoji',
      usage: '<emoji>',
      examples: ['🔥'],
      minArgs: 1,
      async execute(ctx) {
        const e = parseEmoji(ctx.args[0]);
        if (!e) return ctx.fail('That is not a valid emoji.');
        const cfg = section(ctx);
        cfg.emoji = e.display;
        cfg.emojiKey = e.key;
        claim(cfg, ctx.client);
        await ctx.ok(`Starboard emoji set to ${e.display}.`);
      },
    },
    {
      ...base,
      name: 'selfstar',
      description: 'Whether authors starring their own message counts (on/off)',
      usage: '<on|off>',
      examples: ['off'],
      minArgs: 1,
      async execute(ctx) {
        const v = parseToggle(ctx.args[0]);
        if (v === null) return ctx.usage();
        const cfg = section(ctx);
        cfg.selfStar = v;
        claim(cfg, ctx.client);
        await ctx.ok(`Self-stars ${v ? 'now count' : 'no longer count'}.`);
      },
    },
    {
      ...base,
      name: 'starignore',
      description: 'Toggle a channel being ignored by the starboard',
      usage: '<#channel>',
      examples: ['#general'],
      minArgs: 1,
      async execute(ctx) {
        const ch = ctx.resolveChannel(ctx.args[0]);
        if (!ch) return ctx.fail('Channel not found.');
        const cfg = section(ctx);
        const was = cfg.ignored.includes(ch.id);
        cfg.ignored = was ? cfg.ignored.filter((c) => c !== ch.id) : [...cfg.ignored, ch.id];
        db.save();
        await ctx.ok(`${ch} is ${was ? 'no longer' : 'now'} ignored by the starboard.`);
      },
    },
    {
      ...base,
      name: 'starboardoff',
      description: 'Turn the starboard off',
      async execute(ctx) {
        const cfg = section(ctx);
        cfg.enabled = false;
        db.save();
        await ctx.ok('Starboard turned off.');
      },
    },
  ],
  events: {
    messageReactionAdd: (client, reaction) => onReaction(client, reaction),
    messageReactionRemove: (client, reaction) => onReaction(client, reaction),
    async messageReactionRemoveAll(client, message) {
      if (!message.guildId) return;
      const cfg = peek(message.guildId, 'starboard');
      const rec = db.get(COL, `${message.guildId}:${message.id}`, null);
      if (!cfg || !rec || !owns(cfg, client)) return;
      const ch = client.channels.cache.get(rec.channelId);
      const posted = await fetchMsg(ch, rec.starMessageId);
      await posted?.delete().catch(() => {});
      db.delete(COL, `${message.guildId}:${message.id}`);
    },
  },
};
