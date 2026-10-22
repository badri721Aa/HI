'use strict';
const { ChannelType } = require('discord.js');
const db = require('../../core/db');
const { template, truncate } = require('../../core/utils');
const { peek, claim, owns, parseEmoji } = require('./_lib');

/**
 * Guild section "autochannels":
 *   { publish: [channelId], threads: { [channelId]: nameTemplate }, reacts: { [channelId]: [emoji] }, botId }
 */
const DEFAULTS = { publish: [], threads: {}, reacts: {}, botId: null };
const section = (ctx) => db.section(ctx.guild.id, 'autochannels', DEFAULTS);
const base = { guildOnly: true, userPerms: ['ManageChannels'] };

module.exports = {
  commands: [
    {
      ...base,
      name: 'autopublish',
      description: 'Toggle auto-publishing every message in an announcement channel',
      usage: '<#announcement-channel>',
      examples: ['#general'],
      botPerms: ['ManageMessages'],
      minArgs: 1,
      async execute(ctx) {
        const ch = ctx.resolveChannel(ctx.args[0]);
        if (!ch) return ctx.fail('Channel not found.');
        if (ch.type !== ChannelType.GuildAnnouncement) return ctx.fail(`${ch} is not an announcement channel (Channel settings → enable "Announcement Channel").`);
        const cfg = section(ctx);
        const on = !cfg.publish.includes(ch.id);
        cfg.publish = on ? [...cfg.publish, ch.id] : cfg.publish.filter((c) => c !== ch.id);
        claim(cfg, ctx.client);
        await ctx.ok(`Auto-publish ${on ? 'enabled' : 'disabled'} in ${ch}.`);
      },
    },
    {
      ...base,
      name: 'autothread',
      description: 'Create a thread for every new message in a channel (or "off")',
      usage: '<#channel> [thread name template | off]',
      examples: ['#general Discussion: {user}', '#general off'],
      botPerms: ['CreatePublicThreads'],
      minArgs: 1,
      async execute(ctx) {
        const ch = ctx.resolveChannel(ctx.args[0]);
        if (!ch || ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(ch.type)) return ctx.fail('Pick a text or announcement channel.');
        const cfg = section(ctx);
        if ((ctx.args[1] || '').toLowerCase() === 'off') {
          delete cfg.threads[ch.id];
          db.save();
          return ctx.ok(`Auto-threads disabled in ${ch}.`);
        }
        cfg.threads[ch.id] = truncate(ctx.rest(1) || '{user}: {content}', 90);
        claim(cfg, ctx.client);
        await ctx.ok(`Every new message in ${ch} now gets a thread named \`${cfg.threads[ch.id]}\`.\nPlaceholders: \`{user}\` \`{content}\` \`{date}\``);
      },
    },
    {
      ...base,
      name: 'autoreact',
      description: 'React with emojis to every message in a channel (or "off")',
      usage: '<#channel> <emoji...|off>',
      examples: ['#general 👍 👎', '#general off'],
      botPerms: ['AddReactions'],
      minArgs: 2,
      async execute(ctx) {
        const ch = ctx.resolveChannel(ctx.args[0]);
        if (!ch?.isTextBased?.()) return ctx.fail('Pick a text channel.');
        const cfg = section(ctx);
        if (ctx.args[1].toLowerCase() === 'off') {
          delete cfg.reacts[ch.id];
          db.save();
          return ctx.ok(`Auto-reactions disabled in ${ch}.`);
        }
        const emojis = ctx.args.slice(1).map(parseEmoji);
        if (emojis.some((e) => !e)) return ctx.fail('One of those is not a valid emoji.');
        if (emojis.length > 5) return ctx.fail('Use at most 5 emojis.');
        cfg.reacts[ch.id] = emojis.map((e) => e.react);
        claim(cfg, ctx.client);
        await ctx.ok(`I'll react with ${emojis.map((e) => e.display).join(' ')} to every message in ${ch}.`);
      },
    },
    {
      name: 'autochannels',
      description: 'Show auto-publish, auto-thread and auto-react channels',
      guildOnly: true,
      async execute(ctx) {
        const cfg = section(ctx);
        const threads = Object.entries(cfg.threads).map(([c, t]) => `<#${c}> → \`${t}\``);
        const reacts = Object.entries(cfg.reacts).map(([c, e]) => `<#${c}> → ${e.map((x) => (/^\d+$/.test(x) ? `<:e:${x}>` : x)).join(' ')}`);
        await ctx.info(
          [
            `**Auto-publish:** ${cfg.publish.map((c) => `<#${c}>`).join(', ') || 'none'}`,
            `**Auto-thread:**\n${threads.join('\n') || 'none'}`,
            `**Auto-react:**\n${reacts.join('\n') || 'none'}`,
          ].join('\n\n'),
          '⚙️ Automatic channels',
        );
      },
    },
  ],
  events: {
    async messageCreate(client, message) {
      if (!message.guild) return false;
      const cfg = peek(message.guild.id, 'autochannels');
      if (!cfg || !owns(cfg, client)) return false;
      const id = message.channel.id;
      if (cfg.publish?.includes(id) && message.crosspostable) await message.crosspost().catch(() => {});
      const tpl = cfg.threads?.[id];
      if (tpl && !message.hasThread && message.channel.threads) {
        const name = template(tpl, {
          user: message.member?.displayName || message.author.username,
          content: (message.content || 'Discussion').replace(/\s+/g, ' '),
          date: new Date().toISOString().slice(0, 10),
        });
        await message.startThread({ name: truncate(name, 100) || 'Discussion', autoArchiveDuration: 1440 }).catch(() => {});
      }
      for (const e of cfg.reacts?.[id] || []) await message.react(e).catch(() => {});
      return false;
    },
  },
};
