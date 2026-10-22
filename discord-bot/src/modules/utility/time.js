'use strict';
const { discordTimestamp, formatDuration, formatNumber, chunk } = require('../../core/utils');
const { paginate } = require('../../core/ui');
const T = require('./_time');

const STYLES = [
  ['t', 'Short time'],
  ['T', 'Long time'],
  ['d', 'Short date'],
  ['D', 'Long date'],
  ['f', 'Short date/time'],
  ['F', 'Long date/time'],
  ['R', 'Relative'],
];

const WORLD = ['Los Angeles', 'Denver', 'Chicago', 'New York', 'Sao Paulo', 'London', 'Paris', 'Cairo', 'Moscow', 'Dubai', 'Karachi', 'Delhi', 'Bangkok', 'Singapore', 'Tokyo', 'Sydney', 'Auckland'];

const DAY_MS = 86400000;

/** Parse a date (and optional time/zone) from all args. */
function dateFromArgs(ctx, opts) {
  const w = T.words(ctx);
  if (!w.length) return null;
  return T.parseWhen(w, { cities: true, ...opts });
}

/** Parse "<date>" or "<date> to <date>" style pairs for datediff. */
function splitTwoDates(words) {
  const sep = words.findIndex((w) => /^(to|and|-|until)$/i.test(w));
  if (sep > 0) return [words.slice(0, sep), words.slice(sep + 1)];
  const first = T.parseWhen(words, { cities: true });
  if (!first) return [words, []];
  return [words.slice(0, first.used), words.slice(first.used)];
}

function zoneLine(zone, date = new Date()) {
  const off = T.zoneOffset(date, zone);
  return `${T.formatInZone(date, zone, { weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })} (UTC${T.formatOffset(off)})`;
}

module.exports = [
  {
    name: 'timestamp',
    aliases: ['ts', 'discordtime', 'hammertime'],
    description: 'Make Discord timestamps (<t:…>) that show in everyone\'s own time zone',
    usage: '<when>  e.g. 2h, tomorrow 9am EST, 2026-12-25 18:00 UTC',
    examples: ['2h', 'tomorrow 9am est', '2030-12-25 18:00 utc', '1767225600'],
    minArgs: 1,
    slash: true,
    args: [{ name: 'when', type: 'string', description: 'e.g. 2h, tomorrow 9am EST, 2026-12-25 18:00 UTC, or a unix time', required: true, rest: true }],
    async execute(ctx) {
      const p = dateFromArgs(ctx);
      if (!p) return ctx.usage('I could not understand that date/time.');
      const unix = Math.floor(p.date.getTime() / 1000);
      const lines = STYLES.map(([s, label]) => `${label}: <t:${unix}:${s}> — \`<t:${unix}:${s}>\``);
      await ctx.reply({ embeds: [ctx.embed({ title: '🕒 Discord timestamps', description: `${lines.join('\n')}\n\nUnix: \`${unix}\` • ISO: \`${p.date.toISOString()}\`` })] });
    },
  },
  {
    name: 'time',
    aliases: ['timein', 'tz', 'clock'],
    description: 'Current time in a city, country, abbreviation or IANA zone',
    usage: '[place | zone]',
    examples: ['', 'tokyo', 'new york', 'est', 'Europe/Berlin', 'utc+5:30'],
    slash: true,
    args: [{ name: 'place', type: 'string', description: 'City, country, abbreviation (EST) or zone (Europe/Paris)', required: false, rest: true }],
    async execute(ctx) {
      const q = ctx.rest(0);
      const zone = q ? T.resolveZone(q) : T.UTC;
      if (!zone) return ctx.fail(`I don't know the time zone for **${q}**. Try a big city, \`EST\`, \`UTC+3\` or an IANA zone like \`Europe/Paris\` (see \`${ctx.prefix}timezones\`).`);
      const now = new Date();
      await ctx.reply({
        embeds: [
          ctx.embed({
            title: `🕒 ${zone.label}`,
            description: `**${T.formatInZone(now, zone, { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })}**\n${T.formatInZone(now, zone, { dateStyle: 'full' })}`,
            fields: [
              { name: 'UTC offset', value: `UTC${T.formatOffset(T.zoneOffset(now, zone))}`, inline: true },
              { name: '12-hour', value: T.formatInZone(now, zone, { hour: 'numeric', minute: '2-digit', hour12: true }), inline: true },
              { name: 'Zone', value: zone.id || 'Fixed offset', inline: true },
            ],
            footer: q ? null : `Tip: ${ctx.prefix}time <city> — e.g. ${ctx.prefix}time london`,
          }),
        ],
      });
    },
  },
  {
    name: 'worldclock',
    aliases: ['wc', 'worldtime'],
    description: 'Current time in major cities around the world',
    async execute(ctx) {
      const now = new Date();
      const lines = WORLD.map((city) => `**${city}** — ${zoneLine(T.resolveZone(city), now)}`);
      await ctx.reply({ embeds: [ctx.embed({ title: '🌍 World clock', description: lines.join('\n'), footer: `UTC: ${now.toISOString().slice(11, 16)}` })] });
    },
  },
  {
    name: 'tzconvert',
    aliases: ['convertime', 'timeconvert'],
    description: 'Convert a time between zones, e.g. 18:00 london tokyo',
    usage: '<time> <from zone> <to zone>',
    examples: ['18:00 london tokyo', '9am est ist', '14:30 utc new york'],
    minArgs: 3,
    async execute(ctx) {
      const w = T.words(ctx);
      let clock = T.parseClock(w[0]);
      let rest = w.slice(1);
      if (!clock && /^\d{1,2}$/.test(w[0]) && /^(am|pm)$/i.test(w[1] || '')) {
        clock = T.parseClock(w[0] + w[1]);
        rest = w.slice(2);
      }
      if (!clock) return ctx.usage('Start with a time like `18:00` or `9am`.');
      let from = null;
      let to = null;
      for (let k = 1; k < rest.length && !(from && to); k++) {
        const a = T.resolveZone(rest.slice(0, k).join(' '));
        const b = T.resolveZone(rest.slice(k).join(' '));
        if (a && b) [from, to] = [a, b];
      }
      if (!from || !to) return ctx.fail('I could not recognise both time zones. Try cities (`london`), abbreviations (`est`) or IANA zones.');
      const today = T.wallParts(new Date(), from);
      const instant = T.zonedDate(today.y, today.mo, today.d, clock.h, clock.mi, from);
      const fmt = (z) => T.formatInZone(instant, z, { weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
      await ctx.info(`🕒 **${fmt(from)}** in ${from.label}\n➡️ **${fmt(to)}** in ${to.label}\n\nEveryone sees it locally as: ${discordTimestamp(instant, 't')}`);
    },
  },
  {
    name: 'timezones',
    aliases: ['tzlist', 'zones'],
    description: 'Search the list of supported IANA time zones',
    usage: '[search]',
    examples: ['', 'america'],
    async execute(ctx) {
      const q = ctx.rest(0).toLowerCase().replace(/ /g, '_');
      const zones = T.allZones().filter((z) => !q || z.toLowerCase().includes(q));
      if (!zones.length) return ctx.fail('No zones match that.');
      const now = new Date();
      const pages = chunk(zones, 30).map((part, i, all) =>
        ctx.embed({
          title: `🌐 Time zones${q ? ` matching "${q}"` : ''} (${zones.length})`,
          description: part.map((z) => `\`${z}\` UTC${T.formatOffset(T.zoneOffset(now, { id: z }))}`).join('\n'),
          footer: `Page ${i + 1}/${all.length} • use with ${ctx.prefix}time <zone>`,
        }),
      );
      await paginate(ctx, pages);
    },
  },
  {
    name: 'epoch',
    aliases: ['unixtime', 'unixtimestamp'],
    description: 'Current Unix timestamp, or convert one to a date',
    usage: '[unix seconds/ms]',
    examples: ['', '1700000000'],
    async execute(ctx) {
      const arg = ctx.args[0];
      if (!arg) {
        const now = Date.now();
        return ctx.info(`⏱️ Unix time now: \`${Math.floor(now / 1000)}\` (ms: \`${now}\`)\n${discordTimestamp(now, 'F')}`);
      }
      if (!/^-?\d{1,16}$/.test(arg)) return ctx.fail('Give a whole number of seconds (10 digits) or milliseconds (13 digits).');
      const n = Number(arg);
      const ms = Math.abs(n) >= 1e11 ? n : n * 1000;
      const d = new Date(ms);
      if (Number.isNaN(d.getTime())) return ctx.fail('That timestamp is out of range.');
      await ctx.info(`📅 \`${arg}\` = **${d.toUTCString()}**\nLocal: ${discordTimestamp(d, 'F')} (${discordTimestamp(d, 'R')})\nISO: \`${d.toISOString()}\``);
    },
  },
  {
    name: 'countdown',
    aliases: ['timeuntil', 'howlong'],
    description: 'Live countdown to a date (e.g. 2026-12-25, dec 25, new year)',
    usage: '<date> [label]',
    examples: ['2030-12-25 christmas', 'dec 25', 'new year'],
    minArgs: 1,
    async execute(ctx) {
      let w = T.words(ctx);
      let label = '';
      let date;
      if (/^new\s*years?$/i.test(w.slice(0, 2).join(' ')) || /^newyear/i.test(w[0])) {
        const y = new Date().getUTCFullYear() + 1;
        date = new Date(Date.UTC(y, 0, 1));
        label = `New Year ${y}`;
        w = [];
      } else {
        const p = T.parseWhen(w, { cities: true });
        if (!p) return ctx.usage('I could not understand that date.');
        date = p.date;
        label = w.slice(p.used).join(' ');
      }
      const diff = date.getTime() - Date.now();
      const what = label ? `**${label}**` : discordTimestamp(date, 'D');
      if (diff <= 0) return ctx.info(`${what} was ${discordTimestamp(date, 'R')} (${formatDuration(-diff)} ago).`);
      await ctx.info(
        `⏳ ${what} is ${discordTimestamp(date, 'R')} — ${discordTimestamp(date, 'F')}\n` +
          `That's **${formatDuration(diff)}** — ${formatNumber(Math.floor(diff / DAY_MS))} days, ${formatNumber(Math.floor(diff / 3600000))} hours, or ${formatNumber(Math.floor(diff / 1000))} seconds.`,
      );
    },
  },
  {
    name: 'calendar',
    aliases: ['cal', 'month'],
    description: 'Show a month calendar',
    usage: '[month] [year]',
    examples: ['', 'december 2026', '2 2027'],
    async execute(ctx) {
      const now = new Date();
      let mo = now.getUTCMonth();
      let y = now.getUTCFullYear();
      for (const a of ctx.args) {
        if (/^\d{4}$/.test(a)) y = +a;
        else if (/^\d{1,2}$/.test(a) && +a >= 1 && +a <= 12) mo = +a - 1;
        else if (T.monthIndex(a) >= 0) mo = T.monthIndex(a);
        else return ctx.usage('Use a month name or number and an optional year, e.g. `march 2027`.');
      }
      if (y < 1 || y > 9999) return ctx.fail('Year must be between 1 and 9999.');
      const first = new Date(Date.UTC(2000, mo, 1));
      first.setUTCFullYear(y); // avoids Date.UTC mapping years < 100 to 19xx
      const startDow = (first.getUTCDay() + 6) % 7; // Monday first
      const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
      const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo];
      const isThisMonth = y === now.getUTCFullYear() && mo === now.getUTCMonth();
      const cells = Array(startDow).fill('   ');
      for (let d = 1; d <= monthDays; d++) cells.push(isThisMonth && d === now.getUTCDate() ? `[${String(d).padStart(2)}`.slice(-3) : ` ${String(d).padStart(2)}`);
      const lines = ['  Mo  Tu  We  Th  Fr  Sa  Su'];
      for (let i = 0; i < cells.length; i += 7) lines.push(cells.slice(i, i + 7).map((c) => ` ${c}`).join(''));
      const title = `${T.MONTHS[mo][0].toUpperCase()}${T.MONTHS[mo].slice(1)} ${y}`;
      await ctx.reply({ embeds: [ctx.embed({ title: `📅 ${title}`, description: `\`\`\`\n${lines.join('\n')}\n\`\`\``, footer: isThisMonth ? '[ marks today (UTC)' : null })] });
    },
  },
  {
    name: 'datediff',
    aliases: ['between'],
    description: 'Time between two dates (second defaults to today)',
    usage: '<date> [to <date>]',
    examples: ['2000-01-01', '2026-01-01 to 2026-12-25', 'dec 25 2020 to jan 1 2021'],
    minArgs: 1,
    async execute(ctx) {
      const [a, b] = splitTwoDates(T.words(ctx));
      const pa = T.parseWhen(a, { cities: true });
      const pb = b.length ? T.parseWhen(b, { cities: true }) : { date: new Date() };
      if (!pa || !pb) return ctx.usage('I could not understand those dates. Use YYYY-MM-DD or "dec 25 2026".');
      const ms = Math.abs(pb.date - pa.date);
      const days = Math.floor(ms / DAY_MS);
      await ctx.info(
        `📏 From ${discordTimestamp(pa.date, 'D')} to ${discordTimestamp(pb.date, 'D')}:\n` +
          `**${formatNumber(days)}** days • ${formatNumber(Math.floor(days / 7))} weeks ${days % 7} days • ~${formatNumber(days / 30.4369)} months • ~${formatNumber(days / 365.2425)} years\n` +
          `(${formatNumber(Math.floor(ms / 3600000))} hours, ${formatNumber(Math.floor(ms / 60000))} minutes)`,
      );
    },
  },
  {
    name: 'dayofweek',
    aliases: ['whatday', 'dow'],
    description: 'Which weekday a date falls on',
    usage: '<date>',
    examples: ['2000-01-01', 'july 4 1776', 'tomorrow'],
    minArgs: 1,
    async execute(ctx) {
      const w = T.words(ctx);
      const cal = T.parseCalendarDate(w, 0);
      let date;
      if (cal) {
        const d = new Date(Date.UTC(2000, cal.mo, cal.d));
        d.setUTCFullYear(cal.y ?? new Date().getUTCFullYear());
        date = d;
      } else {
        date = T.parseWhen(w, { cities: true })?.date;
      }
      if (!date || Number.isNaN(date.getTime())) return ctx.usage('Use a date like `2000-01-01` or `july 4 1776`.');
      const name = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(date);
      const pretty = new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(date);
      await ctx.info(`📅 **${pretty}** ${date.getTime() < Date.now() - DAY_MS ? 'was' : 'is'} a **${name}**.`);
    },
  },
  {
    name: 'weeknumber',
    aliases: ['isoweek', 'weekno'],
    description: 'ISO week number of today or a date',
    usage: '[date]',
    examples: ['', '2026-12-31'],
    async execute(ctx) {
      const date = ctx.args.length ? dateFromArgs(ctx)?.date : new Date();
      if (!date) return ctx.usage('Use a date like `2026-12-31`.');
      const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
      const dow = d.getUTCDay() || 7;
      d.setUTCDate(d.getUTCDate() + 4 - dow);
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      const week = Math.ceil(((d - yearStart) / DAY_MS + 1) / 7);
      const dayOfYear = Math.floor((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - Date.UTC(date.getUTCFullYear(), 0, 1)) / DAY_MS) + 1;
      await ctx.info(`📆 ${discordTimestamp(date, 'D')} is in **ISO week ${week}** of ${d.getUTCFullYear()} (day ${dayOfYear} of the year).`);
    },
  },
  {
    name: 'sleepcalc',
    aliases: ['sleepcycle', 'bedtime'],
    description: 'Best bedtimes for a wake-up time (90-minute sleep cycles)',
    usage: '<wake-up time, e.g. 7am or 06:30>',
    examples: ['7am', '06:30'],
    minArgs: 1,
    async execute(ctx) {
      const w = T.words(ctx);
      const clock = T.parseClock(w[0]) || (/^(am|pm)$/i.test(w[1] || '') ? T.parseClock(w[0] + w[1]) : null);
      if (!clock) return ctx.usage('Give a wake-up time like `7am` or `06:30`.');
      const wake = clock.h * 60 + clock.mi;
      const fmt = (mins) => {
        const m = ((mins % 1440) + 1440) % 1440;
        const h = Math.floor(m / 60);
        return `${((h + 11) % 12) + 1}:${String(m % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
      };
      const options = [6, 5, 4, 3].map((cycles) => `**${fmt(wake - cycles * 90 - 15)}** — ${cycles} cycles (${(cycles * 1.5).toFixed(1)}h sleep)`);
      await ctx.info(`😴 To wake up at **${fmt(wake)}**, try falling asleep at:\n${options.join('\n')}\n\n*Includes ~15 minutes to fall asleep. 5–6 cycles is ideal for most adults.*`);
    },
  },
];
