'use strict';
const { transform, graphemes, sendText, NO_PINGS } = require('./_lib');
const { shuffle, pick } = require('../../core/utils');

const mapChars = (map) => (s) => graphemes(s).map((c) => map[c] ?? c).join('');
const zip = (from, to) => {
  const a = Array.from(from);
  const b = Array.from(to);
  return Object.fromEntries(a.map((c, i) => [c, b[i]]));
};

const SMALLCAPS = zip('abcdefghijklmnopqrstuvwxyz', 'ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀꜱᴛᴜᴠᴡxʏᴢ');
const SUPER = {
  ...zip('0123456789+-=()', '⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾'),
  ...zip('abcdefghijklmnoprstuvwxyz', 'ᵃᵇᶜᵈᵉᶠᵍʰⁱʲᵏˡᵐⁿᵒᵖʳˢᵗᵘᵛʷˣʸᶻ'),
  ...zip('ABDEGHIJKLMNOPRTUVW', 'ᴬᴮᴰᴱᴳᴴᴵᴶᴷᴸᴹᴺᴼᴾᴿᵀᵁⱽᵂ'),
};
const SUB = {
  ...zip('0123456789+-=()', '₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎'),
  ...zip('aehijklmnoprstuvx', 'ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓ'),
};
const FLIP = {
  ...zip('abcdefghijklmnopqrstuvwxyz', 'ɐqɔpǝɟƃɥᴉɾʞlɯuodbɹsʇnʌʍxʎz'),
  ...zip('ABCDEFGHIJKLMNOPQRSTUVWXYZ', '∀ᗺƆᗡƎℲ⅁HIſʞ˥WNOԀΌᴚS⊥∩ΛMX⅄Z'),
  ...zip('0123456789', '0ƖᄅƐㄣϛ9ㄥ86'),
  ...zip('.,!?()[]{}<>_&\';', '˙\'¡¿)(][}{><‾⅋,؛'),
  '"': '„',
};
const FULLWIDTH = (s) =>
  graphemes(s)
    .map((c) => {
      const cp = c.codePointAt(0);
      if (c.length === 1 && cp >= 0x21 && cp <= 0x7e) return String.fromCodePoint(cp + 0xfee0);
      if (c === ' ') return '　';
      return c;
    })
    .join('');
const LEET = zip('aegiostbzAEGIOSTBZ', '436105782436105782');
const KEYCAPS = Object.fromEntries('0123456789'.split('').map((d) => [d, `${d}️⃣`]));
const EMOJI_PUNCT = { '!': '❗', '?': '❓', '#': '#️⃣', '*': '*️⃣', '+': '➕', '-': '➖', $: '💲' };

const ZALGO_UP = Array.from('̍̎̄̅̿̑̆̐͒͗͑̇̈̊͂̓̈́͊͋͌̃̂̌͐̀́̋̏̒̓̔̽̉ͣͤͥͦͧͨͩͪͫͬͭͮͯ̾͛');
const ZALGO_MID = Array.from('̴̵̶̡̢̧̨̛̀́̕͘͏̸̷͜͟͢͝͞͠͡');
const ZALGO_DOWN = Array.from('̖̗̘̙̜̝̞̟̠̤̥̦̩̪̫̬̭̮̯̰̱̲̳̹̺̻̼͇͈͉͍͎͓͔͕͖͙͚̣ͅ');

const MINOR = new Set(['a', 'an', 'the', 'and', 'but', 'or', 'nor', 'for', 'so', 'yet', 'on', 'at', 'to', 'by', 'of', 'in', 'up', 'as', 'via', 'per']);

/** "helloWorld foo_bar-Baz" -> ['hello','World','foo','bar','Baz'] */
const splitWords = (s) =>
  String(s)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();

function titleCase(s) {
  return s.replace(/\S+/g, (w, offset, all) => {
    const lower = w.toLowerCase();
    const isFirst = offset === 0 || /[.!?:]\s*$/.test(all.slice(0, offset));
    const isLast = offset + w.length >= all.trimEnd().length;
    if (!isFirst && !isLast && MINOR.has(lower.replace(/[^a-z]/g, ''))) return lower;
    return lower.replace(/[a-zà-ÿ]/i, (c) => c.toUpperCase());
  });
}

function sentenceCase(s) {
  return s
    .toLowerCase()
    .replace(/(^\s*|[.!?]\s+|\n\s*)([a-zà-ÿ])/g, (m, pre, c) => pre + c.toUpperCase())
    .replace(/\bi\b/g, 'I');
}

function owo(s) {
  const faces = ['owo', 'UwU', '>w<', '^w^', '(・`ω´・)', ':3', 'x3', 'OwO', '(*^ω^)', 'nya~'];
  return (
    s
      .replace(/(?:r|l)/g, 'w')
      .replace(/(?:R|L)/g, 'W')
      .replace(/n([aeiou])/g, 'ny$1')
      .replace(/N([aeiou])/g, 'Ny$1')
      .replace(/N([AEIOU])/g, 'NY$1')
      .replace(/ove/g, 'uv')
      .replace(/!+/g, () => ` ${pick(faces)} `)
      .trim() + ` ${pick(faces)}`
  );
}

function pigLatinWord(word) {
  const m = word.match(/^([^A-Za-z]*)([A-Za-z']+)([^A-Za-z]*)$/);
  if (!m) return word;
  const [, pre, core, post] = m;
  const lower = core.toLowerCase();
  let out;
  if (/^[aeiou]/.test(lower)) out = `${lower}way`;
  else {
    const cluster = lower.match(/^(qu|[^aeiouy]+|y)/)?.[0] || '';
    out = `${lower.slice(cluster.length)}${cluster}ay`;
  }
  if (core === core.toUpperCase() && core.length > 1) out = out.toUpperCase();
  else if (core[0] === core[0].toUpperCase()) out = cap(out);
  return pre + out + post;
}

function zalgo(s, level) {
  const n = Math.max(1, Math.min(10, level));
  return graphemes(s)
    .map((c) => {
      if (/\s/.test(c)) return c;
      let out = c;
      const r = (max) => Math.floor(Math.random() * max * (n / 10)) + Math.ceil(n / 4);
      for (let i = r(8); i > 0; i--) out += pick(ZALGO_UP);
      for (let i = r(3); i > 0; i--) out += pick(ZALGO_MID);
      for (let i = r(8); i > 0; i--) out += pick(ZALGO_DOWN);
      return out;
    })
    .join('');
}

function wrapText(text, width) {
  return text
    .split('\n')
    .map((line) => {
      const words = line.split(/\s+/).filter(Boolean);
      const lines = [];
      let cur = '';
      for (let w of words) {
        while (w.length > width) {
          if (cur) {
            lines.push(cur);
            cur = '';
          }
          lines.push(w.slice(0, width));
          w = w.slice(width);
        }
        if (!cur) cur = w;
        else if (cur.length + 1 + w.length <= width) cur += ` ${w}`;
        else {
          lines.push(cur);
          cur = w;
        }
      }
      if (cur) lines.push(cur);
      return lines.join('\n');
    })
    .join('\n');
}

const ANSI = [31, 33, 32, 36, 34, 35];

module.exports = [
  transform('reverse', 'Reverse text (emoji-safe)', (s) => graphemes(s).reverse().join(''), { aliases: ['backwards'] }),
  transform('reversewords', 'Reverse the order of the words', (s) => s.split(/\s+/).filter(Boolean).reverse().join(' '), { examples: ['one two three'] }),
  transform('reverseeach', 'Reverse every word but keep the word order', (s) => s.replace(/\S+/g, (w) => graphemes(w).reverse().join('')), { examples: ['hello there world'] }),
  transform('upper', 'CONVERT TEXT TO UPPERCASE', (s) => s.toUpperCase(), { aliases: ['uppercase', 'caps'] }),
  transform('lower', 'convert text to lowercase', (s) => s.toLowerCase(), { aliases: ['lowercase'] }),
  transform('title', 'Convert Text To Title Case', titleCase, { aliases: ['titlecase'], examples: ['the lord of the rings'] }),
  transform('sentence', 'Convert text to sentence case', sentenceCase, { aliases: ['sentencecase'], examples: ['THIS IS LOUD. i agree! ok'] }),
  transform('capitalize', 'Capitalize the first letter', (s) => s.charAt(0).toUpperCase() + s.slice(1), { examples: ['hello world'] }),
  transform('swapcase', 'sWAP tHE cASE of every letter', (s) => Array.from(s, (c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join(''), { aliases: ['invertcase'] }),
  transform('mock', 'sPoNgEbOb MoCkInG tExT (random case)', (s) => Array.from(s, (c) => (Math.random() < 0.5 ? c.toLowerCase() : c.toUpperCase())).join(''), { aliases: ['spongebob', 'randomcase'], examples: ['I am very smart'] }),
  transform(
    'alternating',
    'aLtErNaTiNg CaSe, strictly every other letter',
    (s) => {
      let i = 0;
      return Array.from(s, (c) => (/\p{L}/u.test(c) ? (i++ % 2 ? c.toUpperCase() : c.toLowerCase()) : c)).join('');
    },
    { aliases: ['altcase'] },
  ),
  transform('owo', 'OwO-ify your text, nya~', owo, { aliases: ['uwu', 'uwuify'], examples: ['Hello friends, I love this!'] }),
  transform('leet', 'Convert text to 1337 5p34k', mapChars(LEET), { aliases: ['1337', 'leetspeak'] }),
  transform('clap', 'Add 👏 between 👏 every 👏 word', (s) => `👏 ${s.split(/\s+/).filter(Boolean).join(' 👏 ')} 👏`, { examples: ['this is important'] }),
  transform(
    'emojify',
    'Turn letters and numbers into big emoji letters',
    (s) =>
      graphemes(s.toLowerCase().slice(0, 300))
        .map((c) => {
          if (/^[a-z]$/.test(c)) return String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 97);
          if (KEYCAPS[c]) return KEYCAPS[c];
          if (EMOJI_PUNCT[c]) return EMOJI_PUNCT[c];
          if (c === ' ') return '  ';
          return c;
        })
        .join(' '),
    { aliases: ['regional', 'bigtext'], examples: ['hi 123!'] },
  ),
  transform('spoilerify', 'Hide every single character in its own ||spoiler||', (s) => graphemes(s).map((c) => (/\s/.test(c) ? c : `||${c}||`)).join(''), { aliases: ['spoilerall'], examples: ['surprise'] }),
  transform('vaporwave', 'Ａ Ｅ Ｓ Ｔ Ｈ Ｅ Ｔ Ｉ Ｃ spaced fullwidth text', (s) => s.split(/\s+/).filter(Boolean).map((w) => graphemes(FULLWIDTH(w)).join(' ')).join('   '), { aliases: ['aesthetic'], examples: ['vaporwave vibes'] }),
  transform('smallcaps', 'Convert text to ꜱᴍᴀʟʟ ᴄᴀᴘꜱ', (s) => mapChars(SMALLCAPS)(s.toLowerCase()), { aliases: ['smallcap'] }),
  transform('superscript', 'Write text in ˢᵘᵖᵉʳˢᶜʳⁱᵖᵗ', mapChars(SUPER), { aliases: ['tinytext', 'sup'], examples: ['x2 + y2 = z2'] }),
  transform('subscript', 'Write text in ₛᵤᵦₛ꜀ᵣᵢₚₜ (where Unicode has it)', mapChars(SUB), { aliases: ['sub'], examples: ['H2O and CO2'] }),
  transform('upsidedown', 'Flip text ʇxǝʇ uʍop ǝpısdn', (s) => graphemes(mapChars(FLIP)(s)).reverse().join(''), { aliases: ['fliptext', 'australian'] }),
  {
    name: 'zalgo',
    aliases: ['glitch', 'cursed'],
    description: 'C̷u̸r̵s̶e̷ your text with zalgo (optional intensity 1-10)',
    usage: '[1-10] <text>',
    examples: ['he comes', '3 a little cursed', '10 MAXIMUM CHAOS'],
    minArgs: 1,
    cooldown: 1,
    async execute(ctx) {
      let level = 5;
      let text = ctx.rest(0);
      if (/^\d+$/.test(ctx.args[0]) && ctx.args.length > 1) {
        level = Number(ctx.args[0]);
        text = ctx.rest(1);
      }
      return sendText(ctx, zalgo(text.slice(0, 200), level));
    },
  },
  transform('strike', 'S̶t̶r̶i̶k̶e̶ through text with combining marks', (s) => graphemes(s).map((c) => (c === '\n' ? c : `${c}̶`)).join(''), { aliases: ['strikethrough'] }),
  transform('underline', 'U̲n̲d̲e̲r̲l̲i̲n̲e̲ text with combining marks', (s) => graphemes(s).map((c) => (c === '\n' ? c : `${c}̲`)).join(''), { aliases: ['underlined'] }),
  transform('stutter', 'S-s-stutter your w-words', (s) => s.replace(/\b([A-Za-z])([A-Za-z]+)/g, (m, a, b) => (Math.random() < 0.6 ? `${a}-${a.toLowerCase()}${b}` : m)), { examples: ['hello there my friend'] }),
  transform('spacedout', 'S p a c e  o u t  your text', (s) => s.split(/(\s+)/).map((w) => (/\s/.test(w) ? '   ' : graphemes(w).join(' '))).join(''), { aliases: ['spaced'], examples: ['space out'] }),
  transform('piglatin', 'Translate text into Pig Latin', (s) => s.replace(/\S+/g, pigLatinWord), { aliases: ['pig'], examples: ['Hello world, string theory'] }),
  transform('acronym', 'Make an acronym from words (Laugh Out Loud -> LOL)', (s) => splitWords(s).map((w) => w[0].toUpperCase()).join(''), { examples: ['laugh out loud'] }),
  transform('initials', 'Get the initials of a name (J.R.R.T.)', (s) => splitWords(s).map((w) => `${w[0].toUpperCase()}.`).join(''), { examples: ['John Ronald Reuel Tolkien'] }),
  transform('slug', 'Make a URL-friendly slug', (s) => splitWords(s).join('-').toLowerCase(), { aliases: ['slugify'], examples: ['Héllo, World! 2024 Edition'], code: true }),
  transform('camelcase', 'convertToCamelCase', (s) => splitWords(s).map((w, i) => (i ? cap(w) : w.toLowerCase())).join(''), { aliases: ['camel'], examples: ['hello big world'], code: true }),
  transform('snakecase', 'convert_to_snake_case', (s) => splitWords(s).join('_').toLowerCase(), { aliases: ['snake_case'], examples: ['helloBigWorld'], code: true }),
  transform('kebabcase', 'convert-to-kebab-case', (s) => splitWords(s).join('-').toLowerCase(), { aliases: ['kebab'], examples: ['Hello Big World'], code: true }),
  transform('pascalcase', 'ConvertToPascalCase', (s) => splitWords(s).map(cap).join(''), { aliases: ['pascal'], examples: ['hello big world'], code: true }),
  transform('constantcase', 'CONVERT_TO_CONSTANT_CASE', (s) => splitWords(s).join('_').toUpperCase(), { aliases: ['screamingsnake'], examples: ['max retry count'], code: true }),
  transform('dotcase', 'convert.to.dot.case', (s) => splitWords(s).join('.').toLowerCase(), { examples: ['App Config Value'], code: true }),
  transform('squeeze', 'Collapse repeated spaces and blank lines', (s) => s.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').split('\n').map((l) => l.trim()).join('\n').trim(), { aliases: ['trimspaces'], examples: ['too    many     spaces'] }),
  transform('removevowels', 'Rmv ll th vwls', (s) => s.replace(/[aeiouAEIOU]/g, ''), { aliases: ['novowels'] }),
  transform('nopunct', 'Remove all punctuation', (s) => s.replace(/[\p{P}\p{S}]/gu, ''), { aliases: ['removepunctuation'], examples: ['Hello, world!!! (yes) — really?'] }),
  transform('shufflechars', 'Shuffle the characters randomly', (s) => shuffle(graphemes(s)).join(''), { aliases: ['jumble'] }),
  transform('shufflewords', 'Shuffle the order of the words', (s) => shuffle(s.split(/\s+/).filter(Boolean)).join(' '), { examples: ['one two three four five'] }),
  transform('sortwords', 'Sort words alphabetically', (s) => s.split(/\s+/).filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })).join(' '), { examples: ['pear apple banana Cherry'] }),
  transform('sortlines', 'Sort lines alphabetically', (s) => s.split('\n').sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })).join('\n'), { examples: ['zebra\napple\nmango'], code: true }),
  transform(
    'uniquewords',
    'Remove duplicate words (keeps the first)',
    (s) => {
      const seen = new Set();
      return s
        .split(/\s+/)
        .filter((w) => {
          const k = w.toLowerCase();
          if (!w || seen.has(k)) return false;
          seen.add(k);
          return true;
        })
        .join(' ');
    },
    { aliases: ['dedupewords'], examples: ['the cat the dog The bird'] },
  ),
  transform(
    'dedupelines',
    'Remove duplicate lines',
    (s) => {
      const seen = new Set();
      return s.split('\n').filter((l) => (seen.has(l.trim()) ? false : seen.add(l.trim()))).join('\n');
    },
    { aliases: ['uniquelines'], examples: ['a\nb\na\nc\nb'], code: true },
  ),
  transform('numberlines', 'Number every line', (s) => { const lines = s.split('\n'); const w = String(lines.length).length; return lines.map((l, i) => `${String(i + 1).padStart(w)} | ${l}`).join('\n'); }, { examples: ['first\nsecond\nthird'], code: true }),
  {
    name: 'repeat',
    aliases: ['echoes'],
    description: 'Repeat text N times (max 100)',
    usage: '<times> <text>',
    examples: ['3 hello', '5 ha'],
    minArgs: 2,
    cooldown: 2,
    async execute(ctx) {
      const n = Number(ctx.args[0]);
      if (!Number.isInteger(n) || n < 1 || n > 100) return ctx.fail('Times must be a whole number from 1 to 100.');
      const text = ctx.rest(1);
      if (text.length * n > 10000) return ctx.fail('That would be more than 10,000 characters.');
      return sendText(ctx, Array(n).fill(text).join(text.includes('\n') ? '\n' : ' '));
    },
  },
  {
    name: 'wrap',
    aliases: ['wordwrap'],
    description: 'Word-wrap text to a line width',
    usage: '<width 10-200> <text>',
    examples: ['20 The quick brown fox jumps over the lazy dog and keeps on running'],
    minArgs: 2,
    cooldown: 1,
    async execute(ctx) {
      const width = Number(ctx.args[0]);
      if (!Number.isInteger(width) || width < 10 || width > 200) return ctx.fail('Width must be a whole number from 10 to 200.');
      return sendText(ctx, wrapText(ctx.rest(1), width), { code: true });
    },
  },
  {
    name: 'replace',
    aliases: ['findreplace'],
    description: 'Replace every occurrence of a word/phrase in text',
    usage: '<find> <replace-with> <text>  (use "quotes" for phrases)',
    examples: ['cat dog my cat likes other cats', '"good morning" "good night" good morning everyone'],
    minArgs: 3,
    cooldown: 1,
    async execute(ctx) {
      const [find, repl] = ctx.args;
      if (!find) return ctx.usage();
      const text = ctx.rest(2);
      const count = text.split(find).length - 1;
      return sendText(ctx, text.split(find).join(repl), { prefix: `🔁 Replaced **${count}** occurrence(s).` });
    },
  },
  {
    name: 'occurrences',
    aliases: ['countof'],
    description: 'Count how often a word/phrase appears in text (case-insensitive)',
    usage: '<word> <text>',
    examples: ['the the cat and the hat', '"is it" is it true? is it really?'],
    minArgs: 2,
    cooldown: 1,
    async execute(ctx) {
      const needle = ctx.args[0].toLowerCase();
      const hay = ctx.rest(1).toLowerCase();
      let count = 0;
      for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + needle.length)) count++;
      return ctx.info(`🔎 **${needle.replace(/[*_`~|]/g, '\\$&')}** appears **${count}** time(s).`);
    },
  },
  {
    name: 'rainbow',
    aliases: ['ansirainbow'],
    description: 'Color text like a rainbow (ANSI code block)',
    usage: '<text>',
    examples: ['taste the rainbow'],
    minArgs: 1,
    cooldown: 1,
    async execute(ctx) {
      const chars = graphemes(ctx.rest(0).replace(/```/g, '').slice(0, 250));
      let i = 0;
      const body = chars.map((c) => (/\s/.test(c) ? c : `\u001b[1;${ANSI[i++ % ANSI.length]}m${c}`)).join('');
      return ctx.reply({ content: `\`\`\`ansi\n${body}\u001b[0m\n\`\`\``, allowedMentions: NO_PINGS });
    },
  },
  transform(
    'box',
    'Draw a box around your text',
    (s) => {
      const lines = s.split('\n').map((l) => l.replace(/\t/g, '  '));
      const w = Math.max(...lines.map((l) => graphemes(l).length));
      return [`┌${'─'.repeat(w + 2)}┐`, ...lines.map((l) => `│ ${l}${' '.repeat(w - graphemes(l).length)} │`), `└${'─'.repeat(w + 2)}┘`].join('\n');
    },
    { aliases: ['frame'], examples: ['Hello\nBoxed World'], code: true },
  ),
  transform(
    'pyramid',
    'Build a text pyramid (max 25 characters)',
    (s) => {
      const c = graphemes(s.replace(/\n/g, ' ').trim()).slice(0, 25);
      const up = c.map((_, i) => c.slice(0, i + 1).join(''));
      return [...up, ...up.slice(0, -1).reverse()].join('\n');
    },
    { examples: ['hello'], code: true },
  ),
];

module.exports.splitWords = splitWords;
module.exports.FULLWIDTH = FULLWIDTH;
