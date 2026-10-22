'use strict';
/** Shared helpers for the text/fonts/encoding/math/conversions/generators modules. */
const { AttachmentBuilder } = require('discord.js');

const NO_PINGS = { parse: [] };
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** Split into user-perceived characters (keeps emoji / combining marks together). */
const graphemes = (s) => Array.from(segmenter.segment(String(s)), (x) => x.segment);

/** Escape triple backticks so text can sit inside a code block. */
const fence = (s) => String(s).replace(/```/g, '`​`​`');

/**
 * Reply with a text result. Long results become a .txt attachment instead of
 * being cut off. `code: true` wraps the result in a code block (optionally `lang`).
 */
async function sendText(ctx, text, { code = false, lang = '', prefix = '', file = 'result.txt' } = {}) {
  const s = String(text ?? '');
  if (!s.length) return ctx.fail('The result is empty.');
  const body = code ? `\`\`\`${lang}\n${fence(s)}\n\`\`\`` : s;
  const content = prefix ? `${prefix}\n${body}` : body;
  if (content.length <= 2000) return ctx.reply({ content, allowedMentions: NO_PINGS });
  return ctx.reply({
    content: `${prefix ? `${prefix}\n` : ''}📄 The result is ${s.length.toLocaleString('en-US')} characters long, so here it is as a file.`,
    files: [new AttachmentBuilder(Buffer.from(s, 'utf8'), { name: file })],
    allowedMentions: NO_PINGS,
  });
}

/** Build a simple "text in -> text out" command. */
function transform(name, description, fn, opts = {}) {
  return {
    name,
    aliases: opts.aliases || [],
    description,
    usage: opts.usage || '<text>',
    examples: opts.examples || ['Hello World'],
    minArgs: opts.minArgs ?? 1,
    cooldown: 1,
    ...(opts.slash ? { slash: true, args: opts.args } : {}),
    async execute(ctx) {
      const out = await fn(ctx.rest(0), ctx);
      if (out && typeof out === 'object' && !Array.isArray(out)) return ctx.reply({ allowedMentions: NO_PINGS, ...out });
      return sendText(ctx, out, { code: !!opts.code, lang: opts.lang || '' });
    },
  };
}

/** Parse a number allowing "1,000", "1_000", "1e3", "-2.5". Returns NaN if invalid. */
function num(v) {
  if (v === undefined || v === null) return NaN;
  const s = String(v).trim().replace(/[,_](?=\d{3}(\D|$))/g, '');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return NaN;
  return Number(s);
}

/** Pretty number: integers stay exact, floats keep ~12 significant digits, extremes use e-notation. */
function fmt(n, sig = 12, group = true) {
  if (typeof n === 'bigint') return n.toString();
  if (!Number.isFinite(n)) return Number.isNaN(n) ? 'undefined' : n > 0 ? '∞' : '-∞';
  if (n === 0) return '0';
  const abs = Math.abs(n);
  if (abs >= 1e21 || abs < 1e-9) return n.toExponential(Math.min(sig, 15) - 1).replace(/\.?0+e/, 'e');
  const r = parseFloat(n.toPrecision(sig));
  const [int, frac] = String(r).split('.');
  const intPart = !group || int === '-0' || /e/i.test(int) ? int : Number(int).toLocaleString('en-US');
  return frac ? `${intPart}.${frac}` : intPart;
}

/** Wrap a message as a user-facing error (the handler shows err.userMessage). */
const userError = (msg) => Object.assign(new Error(msg), { userMessage: msg });

module.exports = { sendText, transform, graphemes, fence, num, fmt, userError, NO_PINGS };
