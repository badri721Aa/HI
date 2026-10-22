'use strict';
/**
 * Unicode "fancy font" styles. The Mathematical Alphanumeric Symbols block has
 * holes where a letter already existed elsewhere (e.g. italic h is ℎ U+210E),
 * so each style lists its exceptions explicitly.
 */
const { sendText, graphemes } = require('../text/_lib');

const range = (start) => (i) => String.fromCodePoint(start + i);

function mathStyle(upper, lower, digits, holes = {}) {
  return (ch) => {
    if (holes[ch]) return holes[ch];
    const c = ch.charCodeAt(0);
    if (ch.length !== 1) return null;
    if (upper && c >= 65 && c <= 90) return range(upper)(c - 65);
    if (lower && c >= 97 && c <= 122) return range(lower)(c - 97);
    if (digits && c >= 48 && c <= 57) return range(digits)(c - 48);
    return null;
  };
}

const STYLES = {
  bold: { label: 'Bold', fn: mathStyle(0x1d400, 0x1d41a, 0x1d7ce) },
  italic: { label: 'Italic', fn: mathStyle(0x1d434, 0x1d44e, null, { h: 'ℎ' }) },
  bolditalic: { label: 'Bold italic', fn: mathStyle(0x1d468, 0x1d482, 0x1d7ce) },
  script: {
    label: 'Script / cursive',
    aliases: ['cursive'],
    fn: mathStyle(0x1d49c, 0x1d4b6, null, { B: 'ℬ', E: 'ℰ', F: 'ℱ', H: 'ℋ', I: 'ℐ', L: 'ℒ', M: 'ℳ', R: 'ℛ', e: 'ℯ', g: 'ℊ', o: 'ℴ' }),
  },
  boldscript: { label: 'Bold script', aliases: ['boldcursive'], fn: mathStyle(0x1d4d0, 0x1d4ea, 0x1d7ce) },
  fraktur: { label: 'Fraktur / gothic', aliases: ['gothic', 'medieval'], fn: mathStyle(0x1d504, 0x1d51e, null, { C: 'ℭ', H: 'ℌ', I: 'ℑ', R: 'ℜ', Z: 'ℨ' }) },
  boldfraktur: { label: 'Bold fraktur', aliases: ['boldgothic'], fn: mathStyle(0x1d56c, 0x1d586, 0x1d7ce) },
  doublestruck: {
    label: 'Double-struck',
    aliases: ['outline', 'blackboard'],
    fn: mathStyle(0x1d538, 0x1d552, 0x1d7d8, { C: 'ℂ', H: 'ℍ', N: 'ℕ', P: 'ℙ', Q: 'ℚ', R: 'ℝ', Z: 'ℤ' }),
  },
  sans: { label: 'Sans-serif', fn: mathStyle(0x1d5a0, 0x1d5ba, 0x1d7e2) },
  sansbold: { label: 'Sans bold', aliases: ['boldsans'], fn: mathStyle(0x1d5d4, 0x1d5ee, 0x1d7ec) },
  sansitalic: { label: 'Sans italic', aliases: ['italicsans'], fn: mathStyle(0x1d608, 0x1d622, 0x1d7e2) },
  sansbolditalic: { label: 'Sans bold italic', fn: mathStyle(0x1d63c, 0x1d656, 0x1d7ec) },
  monospace: { label: 'Monospace', aliases: ['mono', 'typewriter'], fn: mathStyle(0x1d670, 0x1d68a, 0x1d7f6) },
  circled: {
    label: 'Circled',
    aliases: ['bubble'],
    fn: (ch) => {
      const c = ch.charCodeAt(0);
      if (ch.length !== 1) return null;
      if (c >= 65 && c <= 90) return range(0x24b6)(c - 65);
      if (c >= 97 && c <= 122) return range(0x24d0)(c - 97);
      if (ch === '0') return '⓪';
      if (c >= 49 && c <= 57) return range(0x2460)(c - 49);
      return null;
    },
  },
  negativecircled: {
    label: 'Negative circled',
    aliases: ['blackbubble', 'darkbubble'],
    fn: (ch) => {
      const c = ch.toUpperCase().charCodeAt(0);
      if (ch.length !== 1) return null;
      if (c >= 65 && c <= 90) return range(0x1f150)(c - 65);
      if (ch === '0') return '⓿';
      if (c >= 49 && c <= 57) return range(0x2776)(c - 49);
      return null;
    },
  },
  squared: {
    label: 'Squared',
    aliases: ['boxed'],
    fn: (ch) => {
      const c = ch.toUpperCase().charCodeAt(0);
      return ch.length === 1 && c >= 65 && c <= 90 ? range(0x1f130)(c - 65) : null;
    },
  },
  negativesquared: {
    label: 'Negative squared',
    aliases: ['blackbox'],
    fn: (ch) => {
      const c = ch.toUpperCase().charCodeAt(0);
      return ch.length === 1 && c >= 65 && c <= 90 ? range(0x1f170)(c - 65) : null;
    },
  },
  parenthesized: {
    label: 'Parenthesized',
    aliases: ['parens'],
    fn: (ch) => {
      const c = ch.charCodeAt(0);
      if (ch.length !== 1) return null;
      if (c >= 65 && c <= 90) return range(0x1f110)(c - 65);
      if (c >= 97 && c <= 122) return range(0x249c)(c - 97);
      if (c >= 49 && c <= 57) return range(0x2474)(c - 49);
      return null;
    },
  },
  fullwidth: {
    label: 'Fullwidth',
    aliases: ['wide'],
    fn: (ch) => {
      const c = ch.charCodeAt(0);
      if (ch === ' ') return '　';
      return ch.length === 1 && c >= 0x21 && c <= 0x7e ? String.fromCodePoint(c + 0xfee0) : null;
    },
  },
  overline: { label: 'O̅v̅e̅r̅l̅i̅n̅e̅', combining: '̅' },
  doubleunderline: { label: 'D̳o̳u̳b̳l̳e̳ underline', aliases: ['dunderline'], combining: '̳' },
  slashed: { label: 'S̸l̸a̸s̸h̸e̸d̸', aliases: ['slashthrough'], combining: '̸' },
};

function stylize(style, text) {
  const s = STYLES[style];
  if (s.combining) return graphemes(text).map((c) => (/\s/.test(c) ? c : c + s.combining)).join('');
  return Array.from(text, (ch) => s.fn(ch) ?? ch).join('');
}

const styleNames = Object.keys(STYLES);
const resolveStyle = (name) => {
  const n = String(name || '').toLowerCase();
  return styleNames.find((k) => k === n || STYLES[k].aliases?.includes(n)) || null;
};

const perStyle = styleNames.map((key) => ({
  name: key,
  aliases: STYLES[key].aliases || [],
  description: `Write text in the ${stylize(key, STYLES[key].label.replace(/[^\x20-\x7e]/g, '').trim() || key)} font style`,
  usage: '<text>',
  examples: ['Hello World 2025'],
  minArgs: 1,
  cooldown: 1,
  async execute(ctx) {
    return sendText(ctx, stylize(key, ctx.rest(0)));
  },
}));

module.exports = [
  ...perStyle,
  {
    name: 'font',
    aliases: ['fancytext', 'fancy'],
    description: 'Write text in any fancy Unicode font style',
    usage: '<style> <text>',
    examples: ['bold Hello', 'script Beautiful Calligraphy', 'doublestruck CHNPQRZ'],
    minArgs: 2,
    cooldown: 1,
    slash: true,
    args: [
      { name: 'style', type: 'string', description: 'Font style', required: true, choices: styleNames.map((k) => ({ name: STYLES[k].label.replace(/[^\x20-\x7e]/g, '').trim() || k, value: k })) },
      { name: 'text', type: 'string', description: 'Text to style', required: true, rest: true },
    ],
    async execute(ctx) {
      const style = resolveStyle(ctx.args[0]);
      if (!style) return ctx.fail(`Unknown style. Try one of: ${styleNames.map((s) => `\`${s}\``).join(', ')}`);
      return sendText(ctx, stylize(style, ctx.rest(1)));
    },
  },
  {
    name: 'fontlist',
    aliases: ['fonts', 'allfonts'],
    description: 'Preview your text in every fancy font style',
    usage: '[text]',
    examples: ['', 'Discord'],
    cooldown: 3,
    async execute(ctx) {
      const sample = (ctx.rest(0) || 'Hello World 123').slice(0, 40);
      const lines = styleNames.map((k) => `\`${k.padEnd(16)}\` ${stylize(k, sample)}`);
      await ctx.reply({ embeds: [ctx.embed({ title: '🅰️ Fancy fonts', description: lines.join('\n'), footer: `Use ${ctx.prefix}<style> <text> or ${ctx.prefix}font <style> <text>` })] });
    },
  },
];

module.exports.stylize = stylize;
module.exports.STYLES = STYLES;
