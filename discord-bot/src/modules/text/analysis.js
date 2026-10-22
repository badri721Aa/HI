'use strict';
const { graphemes, sendText } = require('./_lib');
const { formatDuration } = require('../../core/utils');

const words = (s) => s.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || [];
const bar = (n, max, width = 12) => '█'.repeat(Math.max(1, Math.round((n / max) * width)));

const GC = [
  ['Lu', 'Uppercase letter'], ['Ll', 'Lowercase letter'], ['Lt', 'Titlecase letter'], ['Lm', 'Modifier letter'], ['Lo', 'Other letter'],
  ['Mn', 'Combining mark'], ['Mc', 'Spacing mark'], ['Me', 'Enclosing mark'],
  ['Nd', 'Decimal digit'], ['Nl', 'Letter number'], ['No', 'Other number'],
  ['Pc', 'Connector punctuation'], ['Pd', 'Dash'], ['Ps', 'Open bracket'], ['Pe', 'Close bracket'], ['Pi', 'Initial quote'], ['Pf', 'Final quote'], ['Po', 'Punctuation'],
  ['Sm', 'Math symbol'], ['Sc', 'Currency symbol'], ['Sk', 'Modifier symbol'], ['So', 'Symbol'],
  ['Zs', 'Space'], ['Zl', 'Line separator'], ['Zp', 'Paragraph separator'],
  ['Cc', 'Control'], ['Cf', 'Format'], ['Co', 'Private use'],
].map(([code, name]) => ({ code, name, re: new RegExp(`^\\p{General_Category=${code}}$`, 'u') }));
const SCRIPTS = ['Latin', 'Greek', 'Cyrillic', 'Armenian', 'Hebrew', 'Arabic', 'Devanagari', 'Bengali', 'Thai', 'Georgian', 'Hangul', 'Hiragana', 'Katakana', 'Han', 'Ethiopic', 'Tamil', 'Common', 'Inherited'].map((s) => ({ s, re: new RegExp(`^\\p{Script=${s}}$`, 'u') }));

function category(ch) {
  return GC.find((g) => g.re.test(ch)) || { code: 'Cn', name: 'Unassigned' };
}

module.exports = [
  {
    name: 'charcount',
    aliases: ['chars', 'length', 'len'],
    description: 'Count characters, letters, digits, spaces and bytes',
    usage: '<text>',
    examples: ['Hello, World! 123 😀'],
    minArgs: 1,
    cooldown: 1,
    async execute(ctx) {
      const s = ctx.rest(0);
      const g = graphemes(s);
      await ctx.reply({
        embeds: [
          ctx.embed({
            title: '🔢 Character count',
            fields: [
              { name: 'Characters', value: g.length.toLocaleString('en-US'), inline: true },
              { name: 'Without spaces', value: g.filter((c) => !/\s/.test(c)).length.toLocaleString('en-US'), inline: true },
              { name: 'Letters', value: String((s.match(/\p{L}/gu) || []).length), inline: true },
              { name: 'Digits', value: String((s.match(/\p{N}/gu) || []).length), inline: true },
              { name: 'Spaces', value: String((s.match(/\s/g) || []).length), inline: true },
              { name: 'Punctuation', value: String((s.match(/\p{P}/gu) || []).length), inline: true },
              { name: 'UTF-16 units', value: String(s.length), inline: true },
              { name: 'UTF-8 bytes', value: String(Buffer.byteLength(s, 'utf8')), inline: true },
            ],
          }),
        ],
      });
    },
  },
  {
    name: 'wordcount',
    aliases: ['words'],
    description: 'Count the words in text',
    usage: '<text>',
    examples: ['The quick brown fox jumps over the lazy dog'],
    minArgs: 1,
    cooldown: 1,
    async execute(ctx) {
      const n = words(ctx.rest(0)).length;
      await ctx.info(`📝 That text has **${n.toLocaleString('en-US')}** word${n === 1 ? '' : 's'}.`);
    },
  },
  {
    name: 'linecount',
    aliases: ['lines'],
    description: 'Count lines (and non-empty lines) in text',
    usage: '<text>',
    examples: ['one\ntwo\n\nfour'],
    minArgs: 1,
    cooldown: 1,
    async execute(ctx) {
      const lines = ctx.rest(0).split('\n');
      await ctx.info(`📄 **${lines.length}** line(s), **${lines.filter((l) => l.trim()).length}** non-empty.`);
    },
  },
  {
    name: 'wordfreq',
    aliases: ['wordfrequency'],
    description: 'Show the most frequent words in text',
    usage: '<text>',
    examples: ['the cat and the dog and the bird'],
    minArgs: 1,
    cooldown: 1,
    async execute(ctx) {
      const counts = new Map();
      for (const w of words(ctx.rest(0).toLowerCase())) counts.set(w, (counts.get(w) || 0) + 1);
      const top = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 15);
      const max = top[0]?.[1] || 1;
      const width = Math.max(...top.map(([w]) => w.length), 4);
      const body = top.map(([w, n]) => `${w.slice(0, 20).padEnd(Math.min(width, 20))} ${bar(n, max)} ${n}`).join('\n');
      await sendText(ctx, body || '(no words)', { code: true, prefix: `📊 **${counts.size}** unique word(s), top ${top.length}:` });
    },
  },
  {
    name: 'letterfreq',
    aliases: ['letterfrequency'],
    description: 'Show how often each letter appears',
    usage: '<text>',
    examples: ['Mississippi river'],
    minArgs: 1,
    cooldown: 1,
    async execute(ctx) {
      const counts = new Map();
      for (const c of ctx.rest(0).toLowerCase().match(/\p{L}/gu) || []) counts.set(c, (counts.get(c) || 0) + 1);
      const top = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 26);
      const total = [...counts.values()].reduce((a, b) => a + b, 0);
      const max = top[0]?.[1] || 1;
      const body = top.map(([c, n]) => `${c} ${bar(n, max, 20).padEnd(20)} ${n} (${((n / total) * 100).toFixed(1)}%)`).join('\n');
      await sendText(ctx, body || '(no letters)', { code: true });
    },
  },
  {
    name: 'vowelcount',
    aliases: ['vowels'],
    description: 'Count vowels and consonants',
    usage: '<text>',
    examples: ['Programming is fun'],
    minArgs: 1,
    cooldown: 1,
    async execute(ctx) {
      const s = ctx.rest(0).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
      const per = 'aeiou'.split('').map((v) => `**${v}** ${(s.match(new RegExp(v, 'g')) || []).length}`).join(' • ');
      const vowels = (s.match(/[aeiou]/g) || []).length;
      const consonants = (s.match(/[b-df-hj-np-tv-z]/g) || []).length;
      await ctx.info(`🔤 Vowels: **${vowels}** • Consonants: **${consonants}**\n${per}`);
    },
  },
  {
    name: 'palindrome',
    aliases: ['ispalindrome'],
    description: 'Check whether text reads the same backwards',
    usage: '<text>',
    examples: ['A man, a plan, a canal: Panama', 'hello'],
    minArgs: 1,
    cooldown: 1,
    async execute(ctx) {
      const clean = ctx.rest(0).toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]/gu, '');
      if (!clean) return ctx.fail('There are no letters or digits to check.');
      const yes = clean === [...clean].reverse().join('');
      await ctx.info(yes ? '✅ Yes — that is a palindrome!' : '❌ Nope, that is not a palindrome.');
    },
  },
  {
    name: 'anagram',
    aliases: ['isanagram'],
    description: 'Check if two words/phrases are anagrams',
    usage: '<first> <second>  (use "quotes" for phrases)',
    examples: ['listen silent', '"dormitory" "dirty room"', 'apple paper'],
    minArgs: 2,
    cooldown: 1,
    async execute(ctx) {
      const norm = (s) => [...s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]/gu, '')].sort().join('');
      const [a, b] = ctx.args;
      const yes = norm(a) === norm(b) && norm(a).length > 0;
      await ctx.info(`${yes ? '✅' : '❌'} **${a}** and **${b}** ${yes ? 'are' : 'are not'} anagrams.`);
    },
  },
  {
    name: 'textstats',
    aliases: ['readingtime', 'readtime'],
    description: 'Full text statistics with reading and speaking time',
    usage: '<text>',
    examples: ['This is a sentence. Here is another one! And a third? Yes.'],
    minArgs: 1,
    cooldown: 1,
    async execute(ctx) {
      const s = ctx.rest(0);
      const w = words(s);
      const unique = new Set(w.map((x) => x.toLowerCase()));
      const sentences = (s.match(/[^.!?\n]+[.!?]+|[^.!?\n]+$/gm) || []).filter((x) => x.trim()).length;
      const paragraphs = s.split(/\n\s*\n/).filter((p) => p.trim()).length;
      const longest = w.reduce((a, b) => (b.length > a.length ? b : a), '');
      const avg = w.length ? w.reduce((n, x) => n + x.length, 0) / w.length : 0;
      await ctx.reply({
        embeds: [
          ctx.embed({
            title: '📊 Text statistics',
            fields: [
              { name: 'Words', value: String(w.length), inline: true },
              { name: 'Unique words', value: `${unique.size} (${w.length ? Math.round((unique.size / w.length) * 100) : 0}%)`, inline: true },
              { name: 'Characters', value: String(graphemes(s).length), inline: true },
              { name: 'Sentences', value: String(sentences), inline: true },
              { name: 'Paragraphs', value: String(paragraphs), inline: true },
              { name: 'Avg word length', value: avg.toFixed(1), inline: true },
              { name: 'Longest word', value: longest ? longest.slice(0, 100) : '—', inline: true },
              { name: 'Reading time', value: `~${formatDuration(Math.max(1000, (w.length / 238) * 60000))}`, inline: true },
              { name: 'Speaking time', value: `~${formatDuration(Math.max(1000, (w.length / 150) * 60000))}`, inline: true },
            ],
            footer: 'Reading at 238 wpm, speaking at 150 wpm',
          }),
        ],
      });
    },
  },
  {
    name: 'charinfo',
    aliases: ['unicodeinfo', 'codepoint'],
    description: 'Show Unicode code points, categories and bytes for characters',
    usage: '<text (max 20 characters)>',
    examples: ['A€😀', 'é ß'],
    minArgs: 1,
    cooldown: 2,
    async execute(ctx) {
      const cps = Array.from(ctx.rest(0)).slice(0, 20);
      const lines = cps.map((ch) => {
        const cp = ch.codePointAt(0);
        const cat = category(ch);
        const script = SCRIPTS.find((x) => x.re.test(ch))?.s || 'Other';
        const utf8 = [...Buffer.from(ch, 'utf8')].map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
        const shown = /\p{C}|\p{Z}|\p{M}/u.test(ch) ? `◌${/\p{M}/u.test(ch) ? ch : ''}` : ch;
        const emoji = /\p{Extended_Pictographic}/u.test(ch) ? ' • emoji' : '';
        return `\`${shown}\` **U+${cp.toString(16).toUpperCase().padStart(4, '0')}** — ${cat.name} (${cat.code}) • ${script}${emoji} • UTF-8 \`${utf8}\` • \`&#x${cp.toString(16).toUpperCase()};\``;
      });
      await ctx.reply({ embeds: [ctx.embed({ title: '🔣 Character info', description: lines.join('\n') })] });
    },
  },
];
