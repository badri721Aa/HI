'use strict';
const { GROUPS, findUnit, convert, unitLabel } = require('./_units');
const { fmt, num, NO_PINGS } = require('../text/_lib');

const KELVIN_MIN = { c: -273.15, f: -459.67, k: 0 };

function result(ctx, value, group, from, to) {
  if (group === 'temperature' && value < KELVIN_MIN[from] - 1e-9) return ctx.fail(`That is below absolute zero (${KELVIN_MIN[from]} ${GROUPS.temperature.units[from].name}).`);
  const out = convert(value, group, from, to);
  const g = GROUPS[group];
  return ctx.reply({
    content: `${g.emoji} **${fmt(value)} ${unitLabel(group, from, value)}** = **${fmt(out)} ${unitLabel(group, to, out)}**`,
    allowedMentions: NO_PINGS,
  });
}

function parseValue(text) {
  const v = num(String(text ?? '').trim() || '1');
  return v;
}

// One shortcut command per ordered pair inside each group: km2mi, c2f, gb2mib, …
const pairs = [];
for (const [group, g] of Object.entries(GROUPS)) {
  const tokens = Object.keys(g.units);
  for (const from of tokens) {
    for (const to of tokens) {
      if (from === to) continue;
      const fromName = g.units[from].plural || `${g.units[from].name}s`;
      const toName = g.units[to].plural || `${g.units[to].name}s`;
      const nice = (u, plural) => (g.units[u].toBase ? g.units[u].aliases[0].replace(/^./, (c) => c.toUpperCase()) : plural);
      pairs.push({
        name: `${from}2${to}`,
        description: `Convert ${nice(from, fromName)} to ${nice(to, toName)}`,
        usage: '[amount = 1]',
        examples: group === 'temperature' ? ['100', '-40'] : ['1'],
        cooldown: 1,
        async execute(ctx) {
          const value = parseValue(ctx.args[0]);
          if (Number.isNaN(value)) return ctx.usage('Give a number to convert.');
          return result(ctx, value, group, from, to);
        },
      });
    }
  }
}

/** Accepts "10 km mi", "10km to mi", "10 km in miles", "5'11 ..." is not supported. */
function parseConvert(text) {
  let t = String(text).trim().replace(/,(?=\d{3}\b)/g, '');
  t = t.replace(/^([-+]?\d*\.?\d+(?:e[-+]?\d+)?)([a-z°"'²/µ])/i, '$1 $2'); // "10km" -> "10 km"
  const parts = t.split(/\s+/);
  if (parts.length === 4 && ['to', 'into', 'in', 'as', '->', '='].includes(parts[2].toLowerCase())) parts.splice(2, 1);
  if (parts.length !== 3) return null;
  return { value: num(parts[0]), from: parts[1], to: parts[2] };
}

module.exports = [
  {
    name: 'convert',
    aliases: ['conv', 'unit', 'unitconvert'],
    description: 'Convert between units: length, mass, temperature, volume, data, time…',
    usage: '<amount> <from unit> <to unit>',
    examples: ['10 km mi', '72 f to c', '5.5 lbs in kg', '1 gib mb', '3 cups ml', '1 km kg', '-500 c f'],
    minArgs: 3,
    cooldown: 1,
    slash: true,
    args: [
      { name: 'amount', type: 'number', description: 'The amount to convert', required: true },
      { name: 'from', type: 'string', description: 'Unit to convert from (e.g. km, lb, f, gb)', required: true },
      { name: 'to', type: 'string', description: 'Unit to convert to (e.g. mi, kg, c, mib)', required: true },
    ],
    async execute(ctx) {
      const p = parseConvert(ctx.rest(0));
      if (!p || Number.isNaN(p.value)) return ctx.usage();
      const a = findUnit(p.from);
      const b = findUnit(p.to);
      if (!a || !b) return ctx.fail(`I don't know the unit **${(!a ? p.from : p.to).slice(0, 30)}**. See \`${ctx.prefix}units\` for the full list.`);
      if (a.group !== b.group) return ctx.fail(`Can't convert ${GROUPS[a.group].label.toLowerCase()} to ${GROUPS[b.group].label.toLowerCase()}.`);
      return result(ctx, p.value, a.group, a.token, b.token);
    },
  },
  {
    name: 'units',
    aliases: ['unitlist', 'conversions'],
    description: 'List every unit the converter understands',
    usage: '[group]',
    examples: ['', 'data'],
    cooldown: 2,
    async execute(ctx) {
      const want = (ctx.args[0] || '').toLowerCase();
      const groups = Object.entries(GROUPS).filter(([k]) => !want || k === want);
      if (!groups.length) return ctx.fail(`Unknown group. Groups: ${Object.keys(GROUPS).join(', ')}`);
      const fields = groups.map(([, g]) => ({
        name: `${g.emoji} ${g.label}`,
        value: Object.entries(g.units)
          .map(([t, u]) => `\`${t}\` ${u.name}`)
          .join(' • '),
      }));
      await ctx.reply({
        embeds: [
          ctx.embed({
            title: '📏 Units',
            description: `\`${ctx.prefix}convert 10 km mi\` or a shortcut like \`${ctx.prefix}km2mi 10\`. There are **${pairs.length}** shortcuts — one for every pair of units in a group.`,
            fields,
          }),
        ],
      });
    },
  },
  ...pairs,
];
