'use strict';
const crypto = require('node:crypto');
const db = require('../../core/db');
const { discordTimestamp, formatDuration, parseDuration, truncate } = require('../../core/utils');
const { embed, colors } = require('../../core/embeds');
const { paginate } = require('../../core/ui');
const { parseWhen, words } = require('./_time');

const COL = 'reminders';
const MAX_PER_USER = 25;
const MAX_AHEAD = 366 * 86400000;
const stopwatches = new Map(); // `${botId}:${userId}` -> start time

const newId = () => crypto.randomBytes(3).toString('hex');

function mine(client, userId) {
  return db
    .entries(COL)
    .map(([, r]) => r)
    .filter((r) => r.botId === client.user.id && r.userId === userId)
    .sort((a, b) => a.at - b.at);
}

function create(ctx, { at, text, kind = 'reminder', dm = false }) {
  const r = {
    id: newId(),
    botId: ctx.client.user.id,
    userId: ctx.author.id,
    guildId: ctx.guild?.id || null,
    channelId: ctx.channel?.id || null,
    text: truncate(text, 1500),
    kind,
    dm: dm || !ctx.guild,
    at,
    createdAt: Date.now(),
  };
  db.set(COL, r.id, r);
  return r;
}

async function deliver(client, r) {
  const title = { reminder: '⏰ Reminder', timer: '⏲️ Timer finished', pomodoro: '🍅 Pomodoro' }[r.kind] || '⏰ Reminder';
  const payload = {
    content: `<@${r.userId}>`,
    embeds: [embed({ color: colors.gold, title, description: r.text || '(no message)', footer: 'Set', timestamp: new Date(r.createdAt) })],
    allowedMentions: { users: [r.userId] },
  };
  if (!r.dm && r.channelId) {
    const channel = await client.channels.fetch(r.channelId).catch(() => null);
    if (channel?.send) {
      const sent = await channel.send(payload).catch(() => null);
      if (sent) return;
    }
  }
  const user = await client.users.fetch(r.userId).catch(() => null);
  await user?.send({ embeds: payload.embeds }).catch(() => {});
}

const commands = [
  {
    name: 'remind',
    aliases: ['remindme', 'reminder'],
    description: 'Set a reminder: 10m, 2h30m, tomorrow 9am, 2026-12-25 18:00 EST…',
    usage: '[--dm] <when> <message>',
    examples: ['10m take a break', '2h 30m check the oven', 'tomorrow 9am call mom', '2030-12-25 18:00 UTC open presents', '--dm 1d renew domain'],
    minArgs: 1,
    slash: true,
    args: [
      { name: 'when', type: 'string', description: 'e.g. 10m, 2h30m, tomorrow 9am, 2026-12-25 18:00 EST', required: true },
      { name: 'message', type: 'string', description: 'What to remind you about', required: false, rest: true },
    ],
    async execute(ctx) {
      let w = words(ctx);
      const dm = w.some((x) => x.toLowerCase() === '--dm');
      w = w.filter((x) => x.toLowerCase() !== '--dm');
      const parsed = parseWhen(w);
      if (!parsed) return ctx.usage('I could not understand when. Try `10m`, `2h30m`, `tomorrow 9am`, `18:00 UTC` or `2026-12-25 18:00`.');
      const delay = parsed.date.getTime() - Date.now();
      if (delay < 5000) return ctx.fail('That time is in the past (or less than 5 seconds away).');
      if (delay > MAX_AHEAD) return ctx.fail('Reminders can be at most one year ahead.');
      if (mine(ctx.client, ctx.author.id).length >= MAX_PER_USER) return ctx.fail(`You already have ${MAX_PER_USER} reminders. Delete some with \`${ctx.prefix}delreminder\`.`);
      const text = w.slice(parsed.used).join(' ') || 'Something you asked me to remind you about.';
      const r = create(ctx, { at: parsed.date.getTime(), text, dm });
      await ctx.ok(`I'll remind you ${discordTimestamp(r.at, 'R')} (${discordTimestamp(r.at, 'f')})${r.dm ? ' in your DMs' : ' here'}.\n> ${truncate(text, 200)}\nID: \`${r.id}\``);
    },
  },
  {
    name: 'reminders',
    aliases: ['myreminders', 'listreminders'],
    description: 'List your upcoming reminders and timers',
    slash: true,
    args: [],
    async execute(ctx) {
      const list = mine(ctx.client, ctx.author.id);
      if (!list.length) return ctx.info(`You have no reminders. Set one with \`${ctx.prefix}remind 10m stretch\`.`);
      const lines = list.map((r, i) => `**${i + 1}.** ${discordTimestamp(r.at, 'R')} — ${truncate(r.text, 80)} \`${r.id}\`${r.dm ? ' 📩' : ''}`);
      const pages = [];
      for (let i = 0; i < lines.length; i += 10) {
        pages.push(ctx.embed({ title: `⏰ Your reminders (${list.length})`, description: lines.slice(i, i + 10).join('\n'), footer: `Delete with ${ctx.prefix}delreminder <number|id>` }));
      }
      await paginate(ctx, pages, { ephemeral: true });
    },
  },
  {
    name: 'delreminder',
    aliases: ['deletereminder', 'rmreminder', 'cancelreminder'],
    description: 'Delete one of your reminders by its number or ID',
    usage: '<number | id>',
    examples: ['1', 'a1b2c3'],
    minArgs: 1,
    async execute(ctx) {
      const list = mine(ctx.client, ctx.author.id);
      const q = ctx.args[0].toLowerCase();
      const r = /^\d+$/.test(q) && +q >= 1 && +q <= list.length ? list[+q - 1] : list.find((x) => x.id === q);
      if (!r) return ctx.fail(`No reminder \`${q}\`. See \`${ctx.prefix}reminders\`.`);
      db.delete(COL, r.id);
      await ctx.ok(`Deleted reminder: ${truncate(r.text, 100)}`);
    },
  },
  {
    name: 'clearreminders',
    aliases: ['delallreminders'],
    description: 'Delete all of your reminders and timers',
    async execute(ctx) {
      const list = mine(ctx.client, ctx.author.id);
      for (const r of list) db.delete(COL, r.id);
      await ctx.ok(list.length ? `Deleted **${list.length}** reminder(s).` : 'You had no reminders.');
    },
  },
  {
    name: 'timer',
    aliases: ['settimer'],
    description: 'Start a countdown timer (up to 7 days) that pings you when done',
    usage: '<duration> [label]',
    examples: ['5m', '1h30m pizza', '90s tea'],
    minArgs: 1,
    async execute(ctx) {
      const w = words(ctx);
      let used = 0;
      let ms = null;
      for (let j = 1; j <= Math.min(w.length, 4); j++) {
        const v = parseDuration(w.slice(0, j).join(''));
        if (v) {
          ms = v;
          used = j;
        }
      }
      if (!ms || ms < 5000) return ctx.usage('Give a duration like `5m`, `90s` or `1h30m`.');
      if (ms > 7 * 86400000) return ctx.fail('Timers can be at most 7 days. Use `remind` for longer.');
      const label = w.slice(used).join(' ');
      const r = create(ctx, { at: Date.now() + ms, text: `Your **${formatDuration(ms)}** timer${label ? ` for **${label}**` : ''} is done!`, kind: 'timer' });
      await ctx.ok(`⏲️ Timer set for **${formatDuration(ms)}**${label ? ` (${label})` : ''} — ends ${discordTimestamp(r.at, 'R')}.`);
    },
  },
  {
    name: 'pomodoro',
    aliases: ['focus'],
    description: 'Pomodoro focus session: pings you when to break and when to resume',
    usage: '[work minutes] [break minutes]',
    examples: ['', '50 10'],
    async execute(ctx) {
      const work = Math.min(Math.max(parseInt(ctx.args[0], 10) || 25, 1), 180);
      const rest = Math.min(Math.max(parseInt(ctx.args[1], 10) || 5, 1), 60);
      const end = Date.now() + work * 60000;
      create(ctx, { at: end, text: `Focus session of **${work} min** complete! Take a **${rest} min** break. ☕`, kind: 'pomodoro' });
      create(ctx, { at: end + rest * 60000, text: 'Break is over — time to focus again! 💪', kind: 'pomodoro' });
      await ctx.ok(`🍅 Focus for **${work} min** (until ${discordTimestamp(end, 't')}), then a **${rest} min** break. I'll ping you for both.`);
    },
  },
  {
    name: 'stopwatch',
    aliases: ['sw'],
    description: 'Start or stop your personal stopwatch',
    usage: '[start | stop | check]',
    examples: ['', 'check'],
    async execute(ctx) {
      const key = `${ctx.client.user.id}:${ctx.author.id}`;
      const action = (ctx.args[0] || '').toLowerCase();
      const started = stopwatches.get(key);
      if (started && action === 'check') return ctx.info(`⏱️ Running for **${formatDuration(Date.now() - started)}**.`);
      if (started && action !== 'start') {
        stopwatches.delete(key);
        return ctx.ok(`⏱️ Stopped at **${formatDuration(Date.now() - started)}**.`);
      }
      if (!started && (action === 'stop' || action === 'check')) return ctx.fail('Your stopwatch is not running.');
      stopwatches.set(key, Date.now());
      await ctx.ok(`⏱️ Stopwatch started! Run \`${ctx.prefix}stopwatch\` again to stop it.`);
    },
  },
];

const tasks = [
  {
    name: 'deliver-reminders',
    interval: 10000,
    async run(client) {
      const now = Date.now();
      const due = db
        .entries(COL)
        .map(([, r]) => r)
        .filter((r) => r.botId === client.user.id && r.at <= now);
      for (const r of due) {
        db.delete(COL, r.id);
        await deliver(client, r).catch(() => {});
      }
    },
  },
];

module.exports = { commands, tasks };
