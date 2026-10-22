'use strict';
/** Colour tools. Swatches are real PNGs built in memory (zlib + CRC), no image library needed. */
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { AttachmentBuilder } = require('discord.js');
const { NO_PINGS } = require('../text/_lib');

const NAMED = {
  black: '000000', white: 'ffffff', red: 'ff0000', lime: '00ff00', green: '008000', blue: '0000ff', yellow: 'ffff00', cyan: '00ffff',
  aqua: '00ffff', magenta: 'ff00ff', fuchsia: 'ff00ff', silver: 'c0c0c0', gray: '808080', grey: '808080', maroon: '800000', olive: '808000',
  purple: '800080', teal: '008080', navy: '000080', orange: 'ffa500', pink: 'ffc0cb', hotpink: 'ff69b4', gold: 'ffd700', brown: 'a52a2a',
  chocolate: 'd2691e', coral: 'ff7f50', crimson: 'dc143c', indigo: '4b0082', violet: 'ee82ee', lavender: 'e6e6fa', beige: 'f5f5dc',
  salmon: 'fa8072', tomato: 'ff6347', turquoise: '40e0d0', skyblue: '87ceeb', royalblue: '4169e1', steelblue: '4682b4', khaki: 'f0e68c',
  mint: '98ff98', plum: 'dda0dd', orchid: 'da70d6', tan: 'd2b48c', ivory: 'fffff0', azure: 'f0ffff', forestgreen: '228b22', seagreen: '2e8b57',
  slategray: '708090', midnightblue: '191970', blurple: '5865f2', discord: '5865f2',
};

// ---------- conversions ----------
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const toHex = ({ r, g, b }) => [r, g, b].map((x) => Math.round(x).toString(16).padStart(2, '0')).join('').toUpperCase();
function rgbToHsl({ r, g, b }) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
}
function hslToRgb({ h, s, l }) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255) };
}
function rgbToHsv({ r, g, b }) {
  const { h } = rgbToHsl({ r, g, b });
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  return { h, s: max === 0 ? 0 : ((max - min) / max) * 100, v: max * 100 };
}
function rgbToCmyk({ r, g, b }) {
  const k = 1 - Math.max(r, g, b) / 255;
  if (k === 1) return { c: 0, m: 0, y: 0, k: 100 };
  const f = (x) => ((1 - x / 255 - k) / (1 - k)) * 100;
  return { c: f(r), m: f(g), y: f(b), k: k * 100 };
}
/** WCAG relative luminance and contrast against white/black. */
function luminance({ r, g, b }) {
  const lin = (x) => {
    const c = x / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
const contrast = (l1, l2) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

/** Parse "#ff8800", "f80", "rgb(255,136,0)", "255 136 0", "hsl(30,100%,50%)", "orange". */
function parseColor(input) {
  const s = String(input || '').trim().toLowerCase();
  if (!s) return null;
  if (s === 'random') return randomRgb();
  if (NAMED[s.replace(/\s+/g, '')]) return parseColor(NAMED[s.replace(/\s+/g, '')]);
  let m = s.match(/^(?:#|0x)?([0-9a-f]{6}|[0-9a-f]{3})$/);
  if (m) {
    const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
  }
  m = s.match(/^hsl\(?\s*(-?\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)%?[\s,]+(\d+(?:\.\d+)?)%?\s*\)?$/);
  if (m) {
    const [h, sat, l] = [((Number(m[1]) % 360) + 360) % 360, Number(m[2]), Number(m[3])];
    if (sat > 100 || l > 100) return null;
    return hslToRgb({ h, s: sat, l });
  }
  m = s.match(/^(?:rgb\(?)?\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})\s*\)?$/);
  if (m) {
    const [r, g, b] = m.slice(1).map(Number);
    if ([r, g, b].some((x) => x > 255)) return null;
    return { r, g, b };
  }
  if (/^\d+$/.test(s) && Number(s) <= 0xffffff) {
    const n = Number(s);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  return null;
}
const randomRgb = () => {
  const [r, g, b] = crypto.randomBytes(3);
  return { r, g, b };
};

// ---------- tiny PNG encoder ----------
const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
/** PNG with vertical stripes, one per colour. */
function swatchPng(colors, width = 64 * colors.length, height = 64) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour RGB
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) {
    const c = colors[Math.min(colors.length - 1, Math.floor((x / width) * colors.length))];
    row[1 + x * 3] = c.r;
    row[2 + x * 3] = c.g;
    row[3 + x * 3] = c.b;
  }
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const f1 = (x) => Math.round(x * 10) / 10;
const fmtHsl = ({ h, s, l }) => `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
const nearestName = (rgb) => {
  let best = null;
  let bestD = Infinity;
  for (const [name, hex] of Object.entries(NAMED)) {
    const c = parseColor(hex);
    const d = (c.r - rgb.r) ** 2 + (c.g - rgb.g) ** 2 + (c.b - rgb.b) ** 2;
    if (d < bestD) {
      bestD = d;
      best = name;
    }
  }
  return bestD === 0 ? best : `≈ ${best}`;
};

async function colorCard(ctx, rgb, title = '🎨 Color') {
  const hex = toHex(rgb);
  const hsl = rgbToHsl(rgb);
  const hsv = rgbToHsv(rgb);
  const cmyk = rgbToCmyk(rgb);
  const lum = luminance(rgb);
  const comp = hslToRgb({ ...hsl, h: (hsl.h + 180) % 360 });
  const file = new AttachmentBuilder(swatchPng([rgb], 128, 128), { name: 'color.png' });
  return ctx.reply({
    embeds: [
      ctx.embed({
        title: `${title} #${hex}`,
        color: parseInt(hex, 16),
        thumbnail: 'attachment://color.png',
        fields: [
          { name: 'HEX', value: `\`#${hex}\``, inline: true },
          { name: 'RGB', value: `\`rgb(${rgb.r}, ${rgb.g}, ${rgb.b})\``, inline: true },
          { name: 'HSL', value: `\`${fmtHsl(hsl)}\``, inline: true },
          { name: 'HSV', value: `\`${Math.round(hsv.h)}°, ${Math.round(hsv.s)}%, ${Math.round(hsv.v)}%\``, inline: true },
          { name: 'CMYK', value: `\`${[cmyk.c, cmyk.m, cmyk.y, cmyk.k].map((x) => Math.round(x)).join('%, ')}%\``, inline: true },
          { name: 'Decimal', value: `\`${parseInt(hex, 16)}\``, inline: true },
          { name: 'Name', value: nearestName(rgb), inline: true },
          { name: 'Complement', value: `\`#${toHex(comp)}\``, inline: true },
          { name: 'Contrast', value: `vs white ${f1(contrast(lum, 1))}:1 • vs black ${f1(contrast(lum, 0))}:1`, inline: true },
        ],
      }),
    ],
    files: [file],
    allowedMentions: NO_PINGS,
  });
}

function needColor(ctx, text) {
  const c = parseColor(text);
  if (!c) throw Object.assign(new Error('bad color'), { userMessage: 'I could not read that colour. Try `#ff8800`, `rgb(255,136,0)`, `hsl(30,100%,50%)` or a name like `orange`.' });
  return c;
}

module.exports = [
  {
    name: 'colorinfo',
    aliases: ['color', 'colour', 'colourinfo', 'hexcolor'],
    description: 'Show any colour in HEX/RGB/HSL/HSV/CMYK with a swatch',
    usage: '<#hex | rgb(r,g,b) | hsl(h,s%,l%) | name>',
    examples: ['#5865F2', 'rgb(255, 136, 0)', 'hsl(120, 100%, 25%)', 'teal', 'not a colour'],
    minArgs: 1,
    cooldown: 2,
    slash: true,
    args: [{ name: 'color', type: 'string', description: 'e.g. #5865F2, rgb(255,0,0), hsl(120,100%,50%), orange', required: true, rest: true }],
    async execute(ctx) {
      return colorCard(ctx, needColor(ctx, ctx.rest(0)));
    },
  },
  {
    name: 'randomcolor',
    aliases: ['randomcolour', 'randcolor'],
    description: 'Random colour with all its codes and a swatch',
    cooldown: 2,
    async execute(ctx) {
      return colorCard(ctx, randomRgb(), '🎲 Random color');
    },
  },
  {
    name: 'hex2rgb',
    aliases: ['hextorgb'],
    description: 'Convert a HEX colour to RGB',
    usage: '<#hex>',
    examples: ['#FF8800', 'f80'],
    minArgs: 1,
    cooldown: 1,
    async execute(ctx) {
      const c = needColor(ctx, ctx.args[0]);
      return ctx.reply({ content: `🎨 #${toHex(c)} = **rgb(${c.r}, ${c.g}, ${c.b})**`, allowedMentions: NO_PINGS });
    },
  },
  {
    name: 'rgb2hex',
    aliases: ['rgbtohex'],
    description: 'Convert RGB values to a HEX colour',
    usage: '<r> <g> <b>',
    examples: ['255 136 0', 'rgb(88,101,242)'],
    minArgs: 1,
    cooldown: 1,
    async execute(ctx) {
      const c = needColor(ctx, ctx.rest(0));
      return ctx.reply({ content: `🎨 rgb(${c.r}, ${c.g}, ${c.b}) = **#${toHex(c)}**`, allowedMentions: NO_PINGS });
    },
  },
  {
    name: 'hex2hsl',
    aliases: ['hextohsl'],
    description: 'Convert a HEX colour to HSL',
    usage: '<#hex>',
    examples: ['#5865F2'],
    minArgs: 1,
    cooldown: 1,
    async execute(ctx) {
      const c = needColor(ctx, ctx.args[0]);
      return ctx.reply({ content: `🎨 #${toHex(c)} = **${fmtHsl(rgbToHsl(c))}**`, allowedMentions: NO_PINGS });
    },
  },
  {
    name: 'hsl2hex',
    aliases: ['hsltohex'],
    description: 'Convert HSL to a HEX colour',
    usage: '<h> <s%> <l%>',
    examples: ['30 100 50', 'hsl(235, 86%, 65%)'],
    minArgs: 1,
    cooldown: 1,
    async execute(ctx) {
      const text = ctx.rest(0);
      const c = needColor(ctx, /^hsl/i.test(text) ? text : `hsl(${text})`);
      return ctx.reply({ content: `🎨 ${fmtHsl(rgbToHsl(c))} = **#${toHex(c)}**`, allowedMentions: NO_PINGS });
    },
  },
  {
    name: 'mixcolors',
    aliases: ['blendcolors', 'colormix'],
    description: 'Blend two colours together (optional ratio 0-100)',
    usage: '<color1> <color2> [percent of color2 = 50]',
    examples: ['red blue', '#ffffff #000000 25', '"rgb(255,0,0)" yellow'],
    minArgs: 2,
    cooldown: 2,
    async execute(ctx) {
      const a = needColor(ctx, ctx.args[0]);
      const b = needColor(ctx, ctx.args[1]);
      const p = ctx.args[2] !== undefined ? Number(ctx.args[2]) : 50;
      if (!(p >= 0 && p <= 100)) return ctx.fail('Percent must be between 0 and 100.');
      const t = p / 100;
      const mix = { r: Math.round(a.r + (b.r - a.r) * t), g: Math.round(a.g + (b.g - a.g) * t), b: Math.round(a.b + (b.b - a.b) * t) };
      return colorCard(ctx, mix, `🧪 #${toHex(a)} + #${toHex(b)} (${p}%) →`);
    },
  },
  {
    name: 'colorpalette',
    aliases: ['palette', 'colorscheme'],
    description: 'Harmonious palette from a colour (complementary/triadic/analogous…)',
    usage: '[color = random] [analogous|complementary|triadic|tetradic|monochrome]',
    examples: ['', '#5865F2 triadic', 'orange analogous', 'teal monochrome'],
    cooldown: 2,
    async execute(ctx) {
      const modes = ['analogous', 'complementary', 'triadic', 'tetradic', 'monochrome'];
      let mode = ctx.args.find((a) => modes.includes(a.toLowerCase()))?.toLowerCase();
      const colorText = ctx.args.filter((a) => !modes.includes(a.toLowerCase())).join(' ');
      const base = colorText ? needColor(ctx, colorText) : randomRgb();
      mode = mode || 'analogous';
      const hsl = rgbToHsl(base);
      const rot = (deg) => hslToRgb({ ...hsl, h: (hsl.h + deg + 360) % 360 });
      const offsets = { analogous: [-30, -15, 0, 15, 30], complementary: [0, 180], triadic: [0, 120, 240], tetradic: [0, 90, 180, 270] }[mode];
      const colors = offsets
        ? offsets.map(rot)
        : [20, 35, 50, 65, 80].map((l) => hslToRgb({ ...hsl, l }));
      const file = new AttachmentBuilder(swatchPng(colors, 320, 80), { name: 'palette.png' });
      return ctx.reply({
        embeds: [ctx.embed({ title: `🎨 ${mode[0].toUpperCase() + mode.slice(1)} palette`, color: parseInt(toHex(base), 16), description: colors.map((c) => `\`#${toHex(c)}\``).join('  '), image: 'attachment://palette.png' })],
        files: [file],
      });
    },
  },
];

module.exports.parseColor = parseColor;
module.exports.swatchPng = swatchPng;
