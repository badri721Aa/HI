'use strict';
const db = require('../../core/db');
const { parseToggle, formatNumber } = require('../../core/utils');
const { peek, claim, owns, postableChannel } = require('./_lib');

/**
 * Guild section "counting":
 *   { channel, current, lastUser, highscore, mode: 'reset'|'delete', allowDouble, fails, total, users: {id: count}, botId }
 * mode "reset": a wrong number restarts the count from 1 (message stays, gets ❌).
 * mode "delete": wrong numbers and chatter are deleted; the count never resets.
 */
const DEFAULTS = { channel: null, current: 0, lastUser: null, highscore: 0, mode: 'reset', allowDouble: false, fails: 0, total: 0, users: {}, botId: null };
const section = (ctx) => db.section(ctx.guild.id, 'counting', DEFAULTS);
const base = { guildOnly: true, userPerms: ['ManageGuild'] };

async function hook(client, message, { prefix } = {}) {
  if (!message.guild) return false;
  const cfg = peek(message.guild.id, 'counting');
  if (!cfg?.channel || cfg.channel !== message.channel.id || !owns(cfg, client)) return false;
  // Let real bot commands through (e.g. an admin running countingreset in the channel).
  if (prefix && message.content.startsWith(prefix) && client.registry.get(message.content.slice(prefix.length).trim().split(/\s+/)[0])) return false;

  const match = message.content.trim().match(/^(\d{1,15})(?!\d)/);
  if (!match) {
    if (cfg.mode === 'delete') {
      await message.delete().catch(() => {});
      return true;
    }
    return false; // chatter is allowed in reset mode
  }
  const n = Number(match[1]);
  const expected = cfg.current + 1;
  const doublePost = !cfg.allowDouble && cfg.lastUser === message.author.id;

  if (n === expected && !doublePost) {
    cfg.current = n;
    cfg.lastUser = message.author.id;
    cfg.total += 1;
    cfg.users[message.author.id] = (cfg.users[message.author.id] || 0) + 1;
    const record = n > cfg.highscore;
    if (record) cfg.highscore = n;
    db.save();
    await message.react(record && n % 100 === 0 ? '🏆' : n % 100 === 0 ? '💯' : '✅').catch(() => {});
    return false;
  }

  if (cfg.mode === 'delete') {
    await message.delete().catch(() => {});
    return true;
  }

  // reset mode
  const reason = doublePost ? 'You can\'t count twice in a row' : `Wrong number — the next number was **${expected}**`;
  const reached = cfg.current;
  cfg.current = 0;
  cfg.lastUser = null;
  cfg.fails += 1;
  db.save();
  await message.react('❌').catch(() => {});
  await message.channel
    .send({ content: `💥 <@${message.author.id}> ruined it at **${reached}**! ${reason}. Start again from **1**. (High score: **${cfg.highscore}**)`, allowedMentions: { users: [message.author.id] } })
    .catch(() => {});
  return false;
}

module.exports = {
  commands: [
    {
      ...base,
      name: 'setcounting',
      aliases: ['countingchannel'],
      description: 'Make a channel the counting game channel',
      usage: '<#channel>',
      examples: ['#general'],
      minArgs: 1,
      async execute(ctx) {
        const { channel, error } = postableChannel(ctx, ctx.args[0]);
        if (error) return ctx.fail(error);
        const cfg = section(ctx);
        cfg.channel = channel.id;
        cfg.current = 0;
        cfg.lastUser = null;
        claim(cfg, ctx.client);
        await ctx.ok(`Counting game started in ${channel}! The first number is **1**.`);
        await channel.send('🔢 **Counting game!** Count up one number at a time, starting at **1**. Don\'t count twice in a row!').catch(() => {});
      },
    },
    {
      ...base,
      name: 'countingoff',
      description: 'Stop the counting game',
      async execute(ctx) {
        section(ctx).channel = null;
        db.save();
        await ctx.ok('Counting game turned off. Stats are kept.');
      },
    },
    {
      ...base,
      name: 'countingreset',
      description: 'Reset the current count to 0',
      async execute(ctx) {
        const cfg = section(ctx);
        cfg.current = 0;
        cfg.lastUser = null;
        db.save();
        await ctx.ok('Count reset — the next number is **1**.');
      },
    },
    {
      ...base,
      name: 'countingset',
      description: 'Set the current count (the next number will be one higher)',
      usage: '<number>',
      examples: ['100'],
      minArgs: 1,
      async execute(ctx) {
        const n = parseInt(ctx.args[0], 10);
        if (!Number.isInteger(n) || n < 0 || n > 1e12) return ctx.usage();
        const cfg = section(ctx);
        cfg.current = n;
        cfg.lastUser = null;
        db.save();
        await ctx.ok(`Count set to **${n}** — the next number is **${n + 1}**.`);
      },
    },
    {
      ...base,
      name: 'countingmode',
      description: 'On a wrong number: reset the count, or just delete the message',
      usage: '<reset|delete>',
      examples: ['delete'],
      minArgs: 1,
      async execute(ctx) {
        const mode = ctx.args[0].toLowerCase();
        if (!['reset', 'delete'].includes(mode)) return ctx.usage();
        const cfg = section(ctx);
        cfg.mode = mode;
        claim(cfg, ctx.client);
        await ctx.ok(mode === 'reset' ? 'Wrong numbers now **reset** the count to 0.' : 'Wrong numbers and chat messages are now **deleted** (the count never resets). I need Manage Messages.');
      },
    },
    {
      ...base,
      name: 'countingdouble',
      description: 'Allow (on) or forbid (off) the same person counting twice in a row',
      usage: '<on|off>',
      examples: ['off'],
      minArgs: 1,
      async execute(ctx) {
        const v = parseToggle(ctx.args[0]);
        if (v === null) return ctx.usage();
        const cfg = section(ctx);
        cfg.allowDouble = v;
        claim(cfg, ctx.client);
        await ctx.ok(`Counting twice in a row is now **${v ? 'allowed' : 'not allowed'}**.`);
      },
    },
    {
      name: 'countingstats',
      aliases: ['countstats'],
      description: 'Counting game stats and top counters',
      guildOnly: true,
      async execute(ctx) {
        const cfg = section(ctx);
        const top = Object.entries(cfg.users)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([id, n], i) => `**${i + 1}.** <@${id}> — ${formatNumber(n)}`);
        await ctx.reply({
          embeds: [
            ctx.embed({
              title: '🔢 Counting stats',
              fields: [
                { name: 'Channel', value: cfg.channel ? `<#${cfg.channel}>` : 'not set', inline: true },
                { name: 'Current', value: formatNumber(cfg.current), inline: true },
                { name: 'Next', value: formatNumber(cfg.current + 1), inline: true },
                { name: 'High score', value: formatNumber(cfg.highscore), inline: true },
                { name: 'Total counted', value: formatNumber(cfg.total), inline: true },
                { name: 'Times ruined', value: formatNumber(cfg.fails), inline: true },
                { name: 'Top counters', value: top.join('\n') || 'nobody yet' },
              ],
            }),
          ],
          allowedMentions: { parse: [] },
        });
      },
    },
  ],
  events: { messageCreate: hook },
};
