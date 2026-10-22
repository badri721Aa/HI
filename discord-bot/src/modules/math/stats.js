'use strict';
const { fmt, num, NO_PINGS } = require('../text/_lib');

const bad = (msg) => Object.assign(new Error(msg), { userMessage: msg });
const reply = (ctx, text) => ctx.reply({ content: text, allowedMentions: NO_PINGS });

function numbers(text, min = 1) {
  const parts = String(text).split(/[\s,;]+/).filter(Boolean);
  const out = parts.map((p) => {
    const n = num(p);
    if (Number.isNaN(n)) throw bad(`"${p.slice(0, 20)}" is not a number.`);
    return n;
  });
  if (out.length < min) throw bad(`Give at least ${min} number(s).`);
  if (out.length > 10000) throw bad('That is too many numbers (max 10,000).');
  return out;
}

const sum = (a) => a.reduce((s, x) => s + x, 0);
const mean = (a) => sum(a) / a.length;
const sorted = (a) => [...a].sort((x, y) => x - y);
function median(a) {
  const s = sorted(a);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function variance(a, sample) {
  const m = mean(a);
  return a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - (sample ? 1 : 0));
}
/** Quartile by linear interpolation (same as Excel QUARTILE.INC). */
function quantile(a, q) {
  const s = sorted(a);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (pos - lo);
}

const listCmd = (name, description, fn, { aliases = [], examples = ['4 8 15 16 23 42'], min = 1 } = {}) => ({
  name,
  aliases,
  description,
  usage: '<numbers separated by spaces or commas>',
  examples,
  minArgs: 1,
  cooldown: 1,
  async execute(ctx) {
    return reply(ctx, fn(numbers(ctx.rest(0), min)));
  },
});

// ---- exact fractions (BigInt) ----
const bgcd = (a, b) => {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b) [a, b] = [b, a % b];
  return a;
};
function frac(n, d = 1n) {
  if (d === 0n) throw bad('A fraction cannot have 0 as its denominator.');
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const g = bgcd(n, d) || 1n;
  return { n: n / g, d: d / g };
}
function parseFrac(s) {
  const t = String(s).trim();
  let m = t.match(/^(-?\d+)\s+(\d+)\/(\d+)$/); // mixed "1 1/2"
  if (m) {
    const whole = BigInt(m[1]);
    const f = frac(BigInt(m[2]), BigInt(m[3]));
    return frac(whole * f.d + (whole < 0n || m[1].startsWith('-') ? -f.n : f.n), f.d);
  }
  m = t.match(/^(-?\d+)\/(-?\d+)$/);
  if (m) return frac(BigInt(m[1]), BigInt(m[2]));
  m = t.match(/^(-?)(\d*)\.(\d+)$/);
  if (m) return frac(BigInt(`${m[1]}${m[2] || '0'}${m[3]}`), 10n ** BigInt(m[3].length));
  if (/^-?\d+$/.test(t)) return frac(BigInt(t));
  throw bad(`"${t.slice(0, 20)}" is not a fraction like 3/4, 1 1/2 or 0.25.`);
}
const showFrac = (f) => {
  if (f.d === 1n) return `${f.n}`;
  const whole = f.n / f.d;
  const rem = f.n % f.d;
  const mixed = whole !== 0n ? ` = ${whole} ${rem < 0n ? -rem : rem}/${f.d}` : '';
  return `${f.n}/${f.d}${mixed}`;
};

module.exports = [
  listCmd('avg', 'Average (mean) of a list of numbers', (a) => `📊 Mean of ${a.length} numbers = **${fmt(mean(a))}**`, { aliases: ['mean', 'average'] }),
  listCmd('median', 'Median (middle value) of a list', (a) => `📊 Median = **${fmt(median(a))}**`, { examples: ['3 1 4 1 5 9 2 6'] }),
  listCmd(
    'mode',
    'Most common value(s) in a list',
    (a) => {
      const counts = new Map();
      for (const x of a) counts.set(x, (counts.get(x) || 0) + 1);
      const top = Math.max(...counts.values());
      if (top === 1) return '📊 No mode — every value appears once.';
      const modes = [...counts].filter(([, c]) => c === top).map(([v]) => fmt(v));
      return `📊 Mode = **${modes.join(', ')}** (appears ${top}×)`;
    },
    { examples: ['1 2 2 3 3 3 4', '1 2 3'] },
  ),
  listCmd('sum', 'Add up a list of numbers', (a) => `➕ Sum of ${a.length} numbers = **${fmt(sum(a))}**`, { aliases: ['total', 'add'] }),
  listCmd(
    'product',
    'Multiply a list of numbers together',
    (a) => {
      const p = a.reduce((s, x) => s * x, 1);
      if (!Number.isFinite(p)) throw bad('The product is too large to show.');
      return `✖️ Product = **${fmt(p)}**`;
    },
    { aliases: ['multiply'], examples: ['2 3 7'] },
  ),
  listCmd('min', 'Smallest number in a list', (a) => `⬇️ Minimum = **${fmt(Math.min(...a))}**`, { aliases: ['minimum', 'smallest'] }),
  listCmd('max', 'Largest number in a list', (a) => `⬆️ Maximum = **${fmt(Math.max(...a))}**`, { aliases: ['maximum', 'largest'] }),
  listCmd('range', 'Range (max − min) of a list', (a) => `↔️ Range = **${fmt(Math.max(...a) - Math.min(...a))}** (${fmt(Math.min(...a))} to ${fmt(Math.max(...a))})`, { aliases: ['spread'] }),
  listCmd(
    'stddev',
    'Standard deviation (population and sample)',
    (a) => `📊 σ (population) = **${fmt(Math.sqrt(variance(a, false)))}**${a.length > 1 ? ` • s (sample) = **${fmt(Math.sqrt(variance(a, true)))}**` : ''}`,
    { aliases: ['sd', 'standarddeviation'], examples: ['2 4 4 4 5 5 7 9'] },
  ),
  listCmd(
    'variance',
    'Variance (population and sample)',
    (a) => `📊 Variance (population) = **${fmt(variance(a, false))}**${a.length > 1 ? ` • (sample) = **${fmt(variance(a, true))}**` : ''}`,
    { aliases: ['var'], examples: ['2 4 4 4 5 5 7 9'] },
  ),
  {
    name: 'statsummary',
    aliases: ['describe', 'quartiles', 'fivenumber'],
    description: 'Full summary: count, mean, median, quartiles, std dev…',
    usage: '<numbers>',
    examples: ['6 7 15 36 39 40 41 42 43 47 49'],
    minArgs: 1,
    cooldown: 1,
    async execute(ctx) {
      const a = numbers(ctx.rest(0));
      const f = (n) => fmt(n, 10);
      await ctx.reply({
        embeds: [
          ctx.embed({
            title: '📊 Statistics',
            fields: [
              { name: 'Count', value: String(a.length), inline: true },
              { name: 'Sum', value: f(sum(a)), inline: true },
              { name: 'Mean', value: f(mean(a)), inline: true },
              { name: 'Min', value: f(Math.min(...a)), inline: true },
              { name: 'Q1', value: f(quantile(a, 0.25)), inline: true },
              { name: 'Median', value: f(median(a)), inline: true },
              { name: 'Q3', value: f(quantile(a, 0.75)), inline: true },
              { name: 'Max', value: f(Math.max(...a)), inline: true },
              { name: 'IQR', value: f(quantile(a, 0.75) - quantile(a, 0.25)), inline: true },
              { name: 'Std dev (pop.)', value: f(Math.sqrt(variance(a, false))), inline: true },
              { name: 'Std dev (sample)', value: a.length > 1 ? f(Math.sqrt(variance(a, true))) : '—', inline: true },
              { name: 'Range', value: f(Math.max(...a) - Math.min(...a)), inline: true },
            ],
          }),
        ],
      });
    },
  },
  {
    name: 'percent',
    aliases: ['whatpercent'],
    description: 'What percent is A of B?',
    usage: '<part> <whole>',
    examples: ['25 200', '3 4'],
    minArgs: 2,
    cooldown: 1,
    async execute(ctx) {
      const [a, b] = numbers(ctx.rest(0), 2);
      if (b === 0) return ctx.fail('The whole cannot be 0.');
      return reply(ctx, `💯 **${fmt(a)}** is **${fmt((a / b) * 100, 10)}%** of ${fmt(b)}.`);
    },
  },
  {
    name: 'percentof',
    aliases: ['pctof'],
    description: 'Calculate P% of a number',
    usage: '<percent> <number>',
    examples: ['15 80', '200 12.5'],
    minArgs: 2,
    cooldown: 1,
    async execute(ctx) {
      const [p, n] = numbers(ctx.rest(0).replace(/%/g, ''), 2);
      return reply(ctx, `💯 **${fmt(p)}%** of ${fmt(n)} = **${fmt((p / 100) * n, 12)}**`);
    },
  },
  {
    name: 'percentchange',
    aliases: ['pctchange', 'increase'],
    description: 'Percentage increase/decrease from one value to another',
    usage: '<from> <to>',
    examples: ['50 75', '80 60'],
    minArgs: 2,
    cooldown: 1,
    async execute(ctx) {
      const [a, b] = numbers(ctx.rest(0), 2);
      if (a === 0) return ctx.fail('Cannot compute a percentage change from 0.');
      const ch = ((b - a) / Math.abs(a)) * 100;
      return reply(ctx, `${ch >= 0 ? '📈' : '📉'} From ${fmt(a)} to ${fmt(b)} is a **${ch >= 0 ? '+' : ''}${fmt(ch, 10)}%** change (${b - a >= 0 ? '+' : ''}${fmt(b - a)}).`);
    },
  },
  {
    name: 'ratio',
    aliases: ['simplifyratio'],
    description: 'Simplify a ratio like 1920:1080',
    usage: '<a:b> or <a> <b> [c …]',
    examples: ['1920:1080', '12 18 24', '1.5:2.5'],
    minArgs: 1,
    cooldown: 1,
    async execute(ctx) {
      const parts = ctx.rest(0).split(/[\s:,]+/).filter(Boolean);
      if (parts.length < 2) return ctx.usage();
      const fr = parts.map(parseFrac);
      // scale everything to integers with a common denominator
      const lcmD = fr.reduce((l, f) => (l * f.d) / bgcd(l, f.d), 1n);
      const ints = fr.map((f) => (f.n * lcmD) / f.d);
      const g = ints.reduce(bgcd);
      if (g === 0n) return ctx.fail('A ratio of zeros cannot be simplified.');
      const simple = ints.map((x) => x / g);
      return reply(ctx, `⚖️ ${parts.join(':')} = **${simple.join(':')}**${simple.length === 2 && simple[1] !== 0n ? ` (≈ ${fmt(Number(simple[0]) / Number(simple[1]), 6)} : 1)` : ''}`);
    },
  },
  {
    name: 'fraction',
    aliases: ['frac', 'fractions'],
    description: 'Exact fraction maths: 1/2 + 1/3, 3/4 * 2/5, or simplify 6/8',
    usage: '<a/b> [+ - * / <c/d>]',
    examples: ['1/2 + 1/3', '3/4 * 2/5', '6/8', '1 1/2 - 3/4', '0.125', '1/3 / 0'],
    minArgs: 1,
    cooldown: 1,
    async execute(ctx) {
      const text = ctx.rest(0);
      const m = text.match(/^(.+?)\s+([-+*/×÷])\s+(.+)$/);
      let result;
      if (!m) result = parseFrac(text);
      else {
        const a = parseFrac(m[1]);
        const b = parseFrac(m[3]);
        const op = m[2].replace('×', '*').replace('÷', '/');
        if (op === '+') result = frac(a.n * b.d + b.n * a.d, a.d * b.d);
        else if (op === '-') result = frac(a.n * b.d - b.n * a.d, a.d * b.d);
        else if (op === '*') result = frac(a.n * b.n, a.d * b.d);
        else {
          if (b.n === 0n) return ctx.fail('Division by zero is undefined.');
          result = frac(a.n * b.d, a.d * b.n);
        }
      }
      const dec = Number(result.n) / Number(result.d);
      return reply(ctx, `🍕 \`${text.slice(0, 100)}\` = **${showFrac(result)}** (≈ ${fmt(dec, 10)})`);
    },
  },
];

module.exports.numbers = numbers;
