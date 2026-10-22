'use strict';
const db = require('../../core/db');
const { confirm } = require('../../core/ui');
const { truncate } = require('../../core/utils');
const { peek, claim, owns } = require('../community/_lib');
const { render, PLACEHOLDER_HELP } = require('./_lib');

/**
 * Guild section "autoresponders":
 *   { items: [{ id, trigger, response, mode, createdBy }], nextId, botId }
 * Modes: word (whole word/phrase, default), contains, exact, startswith.
 * Matching never uses user-supplied regexes, so there is no ReDoS risk.
 */
const DEFAULTS = { items: [], nextId: 1, botId: null };
const MODES = ['word', 'contains', 'exact', 'startswith'];
const MAX = 50;
const COOLDOWN_MS = 5000;
const lastFired = new Map(); // `${channelId}:${id}` -> ts
const section = (ctx) => db.section(ctx.guild.id, 'autoresponders', DEFAULTS);
const base = { guildOnly: true, userPerms: ['ManageGuild'] };

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function matches(item, content) {
  const text = content.toLowerCase().trim();
  const trig = item.trigger;
  switch (item.mode) {
    case 'exact':
      return text === trig;
    case 'startswith':
      return text.startsWith(trig);
    case 'contains':
      return text.includes(trig);
    default:
      return new RegExp(`(^|[^\\p{L}\\p{N}_])${escapeRe(trig)}($|[^\\p{L}\\p{N}_])`, 'u').test(text);
  }
}

function findMatch(items, content) {
  return items.find((i) => matches(i, content)) || null;
}

module.exports = {
  commands: [
    {
      ...base,
      name: 'aradd',
      aliases: ['autoresponderadd', 'addresponder'],
      description: 'Auto-reply when a message matches a trigger',
      usage: '[word|contains|exact|startswith] <trigger> | <response>',
      examples: ['good morning | Good morning {user}! ☀️', 'exact ping | pong'],
      minArgs: 1,
      async execute(ctx) {
        let text = ctx.rest(0);
        let mode = 'word';
        const first = ctx.args[0].toLowerCase();
        if (MODES.includes(first) && text.includes('|')) {
          mode = first;
          text = ctx.rest(1);
        }
        const bar = text.indexOf('|');
        if (bar < 0) return ctx.usage('Separate the trigger and the response with `|`.');
        const trigger = text.slice(0, bar).trim().toLowerCase();
        const response = text.slice(bar + 1).trim();
        if (!trigger || !response) return ctx.usage();
        if (trigger.length > 100) return ctx.fail('Triggers can be at most 100 characters.');
        if (response.length > 2000) return ctx.fail('Responses can be at most 2000 characters.');
        const cfg = section(ctx);
        if (cfg.items.length >= MAX) return ctx.fail(`This server reached the limit of ${MAX} auto-responders.`);
        if (cfg.items.some((i) => i.trigger === trigger && i.mode === mode)) return ctx.fail('An auto-responder with that trigger already exists.');
        const item = { id: cfg.nextId++, trigger, response, mode, createdBy: ctx.author.id };
        cfg.items.push(item);
        claim(cfg, ctx.client);
        await ctx.ok(`Auto-responder **#${item.id}** added (${mode}): \`${truncate(trigger, 60)}\` → ${truncate(response, 100)}\nPlaceholders: ${PLACEHOLDER_HELP}`);
      },
    },
    {
      ...base,
      name: 'arremove',
      aliases: ['ardel', 'removeresponder'],
      description: 'Delete an auto-responder by its number or trigger',
      usage: '<id|trigger>',
      examples: ['1'],
      minArgs: 1,
      async execute(ctx) {
        const cfg = section(ctx);
        const q = ctx.rest(0).toLowerCase().replace(/^#/, '');
        const idx = cfg.items.findIndex((i) => String(i.id) === q || i.trigger === q);
        if (idx < 0) return ctx.fail('No auto-responder matches that.');
        const [removed] = cfg.items.splice(idx, 1);
        db.save();
        await ctx.ok(`Auto-responder **#${removed.id}** (\`${truncate(removed.trigger, 60)}\`) deleted.`);
      },
    },
    {
      name: 'arlist',
      aliases: ['autoresponders', 'responders'],
      description: 'List this server\'s auto-responders',
      guildOnly: true,
      async execute(ctx) {
        const cfg = section(ctx);
        if (!cfg.items.length) return ctx.info(`No auto-responders. Add one with \`${ctx.prefix}aradd hello | Hi {user}!\`.`);
        const lines = cfg.items.map((i) => `**#${i.id}** \`${i.mode}\` **${truncate(i.trigger, 50)}** → ${truncate(i.response.replace(/\n/g, ' '), 70)}`);
        await ctx.reply({ embeds: [ctx.embed({ title: `💬 Auto-responders (${cfg.items.length}/${MAX})`, description: lines.join('\n').slice(0, 4000) })], allowedMentions: { parse: [] } });
      },
    },
    {
      ...base,
      name: 'artest',
      description: 'Check which auto-responder (if any) a message would trigger',
      usage: '<sample message>',
      examples: ['good morning everyone'],
      minArgs: 1,
      async execute(ctx) {
        const hit = findMatch(section(ctx).items, ctx.rest(0));
        if (!hit) return ctx.info('No auto-responder would fire for that message.');
        await ctx.info(`That would trigger **#${hit.id}** (\`${hit.mode}\` **${truncate(hit.trigger, 60)}**) and reply:\n\n${render(hit.response, { user: ctx.author, member: ctx.member, guild: ctx.guild, channel: ctx.channel })}`);
      },
    },
    {
      ...base,
      name: 'arclear',
      description: 'Delete every auto-responder',
      async execute(ctx) {
        const cfg = section(ctx);
        if (!cfg.items.length) return ctx.fail('There are no auto-responders.');
        if (!(await confirm(ctx, `Delete all **${cfg.items.length}** auto-responders?`))) return;
        cfg.items = [];
        db.save();
        await ctx.send({ embeds: [ctx.embeds.success('All auto-responders deleted.')] });
      },
    },
  ],
  events: {
    async messageCreate(client, message, { prefix } = {}) {
      if (!message.guild || !message.content) return false;
      const cfg = peek(message.guild.id, 'autoresponders');
      if (!cfg?.items?.length || !owns(cfg, client)) return false;
      if (prefix && message.content.startsWith(prefix)) return false;
      if (db.guild(message.guild.id).disabledCategories.includes('customcommands') || db.get('blacklist', message.author.id)) return false;
      const hit = findMatch(cfg.items, message.content);
      if (!hit) return false;
      const key = `${message.channel.id}:${hit.id}`;
      if (Date.now() - (lastFired.get(key) || 0) < COOLDOWN_MS) return false;
      lastFired.set(key, Date.now());
      if (lastFired.size > 5000) lastFired.clear();
      const text = render(hit.response, { user: message.author, member: message.member, guild: message.guild, channel: message.channel, args: message.content.split(/\s+/) });
      await message.channel.send({ content: text || '​', allowedMentions: { parse: ['users'] } }).catch(() => {});
      return false;
    },
  },
};

module.exports.matches = matches;
