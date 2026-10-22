'use strict';
/** Random generators. Anything secret (passwords, tokens) uses crypto randomness and is sent privately. */
const crypto = require('node:crypto');
const { sendText, num, NO_PINGS } = require('../text/_lib');
const { parseDate } = require('../math/applied');
const D = require('./_data');

const rint = (min, max) => crypto.randomInt(min, max + 1); // inclusive, unbiased
const rpick = (arr) => arr[crypto.randomInt(arr.length)];
function rshuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const reply = (ctx, content) => ctx.reply({ content, allowedMentions: NO_PINGS });

/** Items from "a, b, c" (commas win) or "a b c". */
function items(text) {
  const t = String(text).trim();
  return (t.includes(',') ? t.split(',') : t.split(/\s+/)).map((x) => x.trim()).filter(Boolean);
}

/** Secrets: ephemeral for slash, DM for prefix commands, spoiler as a last resort. */
async function sendSecret(ctx, title, secret, note = '') {
  const body = `🔐 **${title}**\n\`\`\`\n${secret}\n\`\`\`${note ? `\n${note}` : ''}`;
  if (ctx.isSlash) return ctx.reply({ content: body, ephemeral: true });
  try {
    await ctx.author.send({ content: body });
    return ctx.ok(`I sent your ${title.toLowerCase()} to your DMs so nobody else sees it.`);
  } catch {
    return ctx.reply({ content: `⚠️ I couldn't DM you (your DMs are closed), so here it is hidden — delete this message after copying:\n||\`${secret.replace(/`/g, '')}\`||` });
  }
}

const SETS = {
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.<>/?~',
};
const AMBIGUOUS = /[Il1O0o|]/g;

function makePassword(length, flags) {
  const pools = Object.entries(SETS)
    .filter(([k]) => !flags.has(`no${k}`) && !(k === 'upper' && flags.has('nouppercase')) && !(k === 'digits' && flags.has('nonumbers')))
    .map(([, v]) => (flags.has('noambiguous') ? v.replace(AMBIGUOUS, '') : v));
  if (!pools.length) throw Object.assign(new Error('no pools'), { userMessage: 'You turned off every character type!' });
  const all = pools.join('');
  // one from each enabled pool, the rest from everything, then shuffle
  const chars = pools.map((p) => rpick(p));
  while (chars.length < length) chars.push(rpick(all));
  return { password: rshuffle(chars).slice(0, length).join(''), bits: length * Math.log2(all.length) };
}

module.exports = [
  {
    name: 'password',
    aliases: ['passgen', 'genpassword', 'pwgen'],
    description: 'Generate a strong random password (sent privately)',
    usage: '[length 4-128] [nosymbols] [nonumbers] [noupper] [nolower] [noambiguous]',
    examples: ['', '24', '12 nosymbols noambiguous', '8 nolower noupper nodigits nosymbols'],
    cooldown: 2,
    slash: true,
    args: [
      { name: 'length', type: 'integer', description: 'Length (4-128, default 16)', required: false, min: 4, max: 128 },
      { name: 'options', type: 'string', description: 'Any of: nosymbols nonumbers noupper nolower noambiguous', required: false, rest: true },
    ],
    async execute(ctx) {
      let length = 16;
      const flags = new Set();
      for (const a of ctx.args) {
        if (/^\d+$/.test(a)) length = Number(a);
        else flags.add(a.toLowerCase().replace(/^-+/, ''));
      }
      if (length < 4 || length > 128) return ctx.fail('Length must be between 4 and 128.');
      const { password, bits } = makePassword(length, flags);
      const strength = bits >= 100 ? 'excellent' : bits >= 75 ? 'strong' : bits >= 50 ? 'okay' : 'weak';
      return sendSecret(ctx, 'Password', password, `Length ${length} • ~${Math.round(bits)} bits of entropy (${strength})`);
    },
  },
  {
    name: 'passphrase',
    aliases: ['diceware', 'xkcdpass'],
    description: 'Generate a memorable random passphrase (sent privately)',
    usage: '[words 3-12] [separator]',
    examples: ['', '5', '4 .'],
    cooldown: 2,
    async execute(ctx) {
      const n = ctx.args[0] ? Number(ctx.args[0]) : 6;
      if (!Number.isInteger(n) || n < 3 || n > 12) return ctx.fail('Pick 3 to 12 words.');
      const sep = (ctx.args[1] || '-').slice(0, 3);
      const words = Array.from({ length: n }, () => rpick(D.WORDS));
      const bits = n * Math.log2(D.WORDS.length);
      return sendSecret(ctx, 'Passphrase', words.join(sep), `${n} words from a ${D.WORDS.length}-word list • ~${Math.round(bits)} bits of entropy`);
    },
  },
  {
    name: 'tokengen',
    aliases: ['secretkey', 'randomtoken'],
    description: 'Generate a random secret token / API key (sent privately)',
    usage: '[bytes 8-64] [hex|base64|base64url]',
    examples: ['', '16 hex', '48 base64url'],
    cooldown: 2,
    async execute(ctx) {
      const bytes = ctx.args[0] && /^\d+$/.test(ctx.args[0]) ? Number(ctx.args[0]) : 32;
      const enc = (ctx.args.find((a) => /^(hex|base64|base64url)$/i.test(a)) || 'base64url').toLowerCase();
      if (bytes < 8 || bytes > 64) return ctx.fail('Bytes must be between 8 and 64.');
      return sendSecret(ctx, 'Token', crypto.randomBytes(bytes).toString(enc), `${bytes} random bytes (${bytes * 8} bits) as ${enc}`);
    },
  },
  {
    name: 'pincode',
    aliases: ['pingen', 'randompin'],
    description: 'Generate a random numeric PIN (sent privately)',
    usage: '[digits 4-12]',
    examples: ['', '6'],
    cooldown: 2,
    async execute(ctx) {
      const n = ctx.args[0] ? Number(ctx.args[0]) : 4;
      if (!Number.isInteger(n) || n < 4 || n > 12) return ctx.fail('PINs can have 4 to 12 digits.');
      return sendSecret(ctx, 'PIN', Array.from({ length: n }, () => rint(0, 9)).join(''));
    },
  },
  {
    name: 'uuid',
    aliases: ['guid', 'uuid4'],
    description: 'Generate random UUIDs (v4)',
    usage: '[count 1-20]',
    examples: ['', '5'],
    cooldown: 1,
    async execute(ctx) {
      const n = ctx.args[0] ? Number(ctx.args[0]) : 1;
      if (!Number.isInteger(n) || n < 1 || n > 20) return ctx.fail('Count must be 1 to 20.');
      return sendText(ctx, Array.from({ length: n }, () => crypto.randomUUID()).join('\n'), { code: true });
    },
  },
  {
    name: 'randomnumber',
    aliases: ['rng', 'randnum', 'randint'],
    description: 'Random whole number between min and max (default 1-100)',
    usage: '[min] [max]  or  [max]',
    examples: ['', '10', '-50 50', '1 1000000000000'],
    cooldown: 1,
    slash: true,
    args: [
      { name: 'min', type: 'integer', description: 'Smallest value (default 1)', required: false },
      { name: 'max', type: 'integer', description: 'Largest value (default 100)', required: false },
    ],
    async execute(ctx) {
      let [lo, hi] = ctx.args.map((x) => num(x));
      if (ctx.args.length === 1) [lo, hi] = [1, lo];
      lo = lo ?? 1;
      hi = hi ?? 100;
      if (![lo, hi].every(Number.isSafeInteger)) return ctx.fail('Use whole numbers.');
      if (lo > hi) [lo, hi] = [hi, lo];
      const span = hi - lo;
      const value = span < 2 ** 48 - 1 ? rint(lo, hi) : lo + Math.floor((crypto.randomBytes(6).readUIntBE(0, 6) / 2 ** 48) * (span + 1));
      return reply(ctx, `🎲 Random number between ${lo.toLocaleString('en-US')} and ${hi.toLocaleString('en-US')}: **${value.toLocaleString('en-US')}**`);
    },
  },
  {
    name: 'randomletter',
    aliases: ['randletter'],
    description: 'Random letter(s) of the alphabet',
    usage: '[count 1-50]',
    examples: ['', '5'],
    cooldown: 1,
    async execute(ctx) {
      const n = ctx.args[0] ? Number(ctx.args[0]) : 1;
      if (!Number.isInteger(n) || n < 1 || n > 50) return ctx.fail('Count must be 1 to 50.');
      return reply(ctx, `🔤 ${Array.from({ length: n }, () => String.fromCharCode(65 + rint(0, 25))).join(' ')}`);
    },
  },
  {
    name: 'randomemoji',
    aliases: ['randemoji', 'emojiroll'],
    description: 'Random emoji (or several)',
    usage: '[count 1-20]',
    examples: ['', '8'],
    cooldown: 1,
    async execute(ctx) {
      const n = ctx.args[0] ? Number(ctx.args[0]) : 1;
      if (!Number.isInteger(n) || n < 1 || n > 20) return ctx.fail('Count must be 1 to 20.');
      return reply(ctx, Array.from({ length: n }, () => rpick(D.EMOJIS)).join(' '));
    },
  },
  {
    name: 'randomword',
    aliases: ['randword'],
    description: 'Random English word(s)',
    usage: '[count 1-30]',
    examples: ['', '10'],
    cooldown: 1,
    async execute(ctx) {
      const n = ctx.args[0] ? Number(ctx.args[0]) : 1;
      if (!Number.isInteger(n) || n < 1 || n > 30) return ctx.fail('Count must be 1 to 30.');
      return reply(ctx, `📖 ${Array.from({ length: n }, () => rpick(D.WORDS)).join(', ')}`);
    },
  },
  {
    name: 'randomdate',
    aliases: ['randdate'],
    description: 'Random date, optionally between two dates (YYYY-MM-DD)',
    usage: '[from] [to]',
    examples: ['', '2000-01-01 2000-12-31', 'today 2030-01-01'],
    cooldown: 1,
    async execute(ctx) {
      const from = ctx.args[0] ? parseDate(ctx.args[0]) : Date.UTC(1970, 0, 1);
      const to = ctx.args[1] ? parseDate(ctx.args[1]) : Date.UTC(2050, 11, 31);
      if (from === null || to === null) return ctx.fail('Use dates like `2000-01-31`.');
      const [a, b] = from <= to ? [from, to] : [to, from];
      const days = Math.round((b - a) / 86400000);
      const t = a + rint(0, days) * 86400000;
      const d = new Date(t);
      return reply(ctx, `📅 **${d.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}** (${d.toISOString().slice(0, 10)})`);
    },
  },
  {
    name: 'randomtime',
    aliases: ['randtime'],
    description: 'Random time of day',
    cooldown: 1,
    async execute(ctx) {
      const h = rint(0, 23);
      const m = rint(0, 59);
      const h12 = h % 12 || 12;
      return reply(ctx, `🕰️ **${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}** (${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'})`);
    },
  },
  {
    name: 'randomcountry',
    aliases: ['randcountry'],
    description: 'Random country with its flag',
    usage: '[count 1-10]',
    examples: ['', '3'],
    cooldown: 1,
    async execute(ctx) {
      const n = ctx.args[0] ? Number(ctx.args[0]) : 1;
      if (!Number.isInteger(n) || n < 1 || n > 10) return ctx.fail('Count must be 1 to 10.');
      const picks = rshuffle(D.COUNTRIES).slice(0, n);
      return reply(ctx, picks.map(([code, name]) => `${D.flag(code)} **${name}** (${code})`).join('\n'));
    },
  },
  {
    name: 'lorem',
    aliases: ['loremipsum', 'placeholdertext'],
    description: 'Lorem ipsum placeholder text',
    usage: '[count] [words|sentences|paragraphs]',
    examples: ['', '50 words', '3 paragraphs', '2 sentences'],
    cooldown: 1,
    async execute(ctx) {
      const count = ctx.args[0] && /^\d+$/.test(ctx.args[0]) ? Number(ctx.args[0]) : 1;
      const unit = (ctx.args.find((a) => /^(w|s|p)/i.test(a)) || 'paragraphs')[0].toLowerCase();
      const max = { w: 1000, s: 100, p: 20 }[unit];
      if (count < 1 || count > max) return ctx.fail(`Count must be 1 to ${max}.`);
      const words = (n) => Array.from({ length: n }, () => rpick(D.LOREM));
      const sentence = () => {
        const w = words(rint(6, 14));
        w[0] = w[0][0].toUpperCase() + w[0].slice(1);
        if (w.length > 8) w[rint(3, w.length - 3)] += ',';
        return `${w.join(' ')}.`;
      };
      const paragraph = () => Array.from({ length: rint(4, 7) }, sentence).join(' ');
      let out;
      if (unit === 'w') out = words(count).join(' ');
      else if (unit === 's') out = Array.from({ length: count }, sentence).join(' ');
      else out = Array.from({ length: count }, paragraph).join('\n\n');
      out = out.replace(/^\w+ \w+/, 'Lorem ipsum'); // classic opening
      return sendText(ctx, out, { file: 'lorem.txt' });
    },
  },
  {
    name: 'teams',
    aliases: ['maketeams', 'splitteams'],
    description: 'Randomly split names into N teams',
    usage: '<number of teams> <names, separated by commas or spaces>',
    examples: ['2 Alice Bob Carol Dave Erin', '3 Red Team, Blue Team, Ana, Ben, Cy, Di, Ed'],
    minArgs: 3,
    cooldown: 2,
    async execute(ctx) {
      const n = Number(ctx.args[0]);
      const names = items(ctx.rest(1));
      if (!Number.isInteger(n) || n < 2 || n > 25) return ctx.fail('Number of teams must be 2 to 25.');
      if (names.length < n) return ctx.fail(`You need at least ${n} names for ${n} teams.`);
      const teams = Array.from({ length: n }, () => []);
      rshuffle(names).forEach((name, i) => teams[i % n].push(name));
      return ctx.reply({
        embeds: [ctx.embed({ title: `🎲 ${n} random teams`, fields: teams.map((t, i) => ({ name: `Team ${i + 1} (${t.length})`, value: t.join('\n').slice(0, 1024), inline: true })) })],
        allowedMentions: NO_PINGS,
      });
    },
  },
  {
    name: 'shufflelist',
    aliases: ['randomorder', 'shuffleitems'],
    description: 'Shuffle a list into random order',
    usage: '<items, separated by commas or spaces>',
    examples: ['apples, bananas, cherries, dates', 'one two three four'],
    minArgs: 1,
    cooldown: 1,
    async execute(ctx) {
      const list = items(ctx.rest(0));
      if (list.length < 2) return ctx.fail('Give at least two items.');
      return sendText(ctx, rshuffle(list).map((x, i) => `${i + 1}. ${x}`).join('\n'));
    },
  },
  {
    name: 'pickwinner',
    aliases: ['raffle', 'drawwinner'],
    description: 'Pick one random winner from a list',
    usage: '<items, separated by commas or spaces>',
    examples: ['Alice, Bob, Carol', 'pizza tacos sushi'],
    minArgs: 1,
    cooldown: 1,
    async execute(ctx) {
      const list = items(ctx.rest(0));
      if (list.length < 2) return ctx.fail('Give at least two entries.');
      return reply(ctx, `🏆 Out of ${list.length} entries the winner is… **${rpick(list)}**!`);
    },
  },
  {
    name: 'pickmany',
    aliases: ['drawmany', 'pickwinners'],
    description: 'Pick several different random winners from a list',
    usage: '<count> <items, separated by commas or spaces>',
    examples: ['2 Alice, Bob, Carol, Dave', '3 a b c d e f'],
    minArgs: 2,
    cooldown: 1,
    async execute(ctx) {
      const n = Number(ctx.args[0]);
      const list = items(ctx.rest(1));
      if (!Number.isInteger(n) || n < 1) return ctx.usage('The count must be a whole number.');
      if (n > list.length) return ctx.fail(`You asked for ${n} winners but only gave ${list.length} entries.`);
      return reply(ctx, `🏆 Winners: ${rshuffle(list).slice(0, n).map((x, i) => `**${i + 1}.** ${x}`).join('  ')}`);
    },
  },
  {
    name: 'coinflips',
    aliases: ['flipmany', 'massflip'],
    description: 'Flip many coins and see the stats (up to 100,000)',
    usage: '<count>',
    examples: ['10', '1000'],
    minArgs: 1,
    cooldown: 2,
    async execute(ctx) {
      const n = Number(ctx.args[0]);
      if (!Number.isInteger(n) || n < 1 || n > 100000) return ctx.fail('Flip between 1 and 100,000 coins.');
      const bytes = crypto.randomBytes(Math.ceil(n / 8));
      let heads = 0;
      let streak = 0;
      let best = 0;
      let bestSide = 'H';
      let prev = null;
      let preview = '';
      for (let i = 0; i < n; i++) {
        const h = (bytes[i >> 3] >> (i & 7)) & 1;
        heads += h;
        streak = h === prev ? streak + 1 : 1;
        prev = h;
        if (streak > best) {
          best = streak;
          bestSide = h ? 'heads' : 'tails';
        }
        if (i < 40) preview += h ? 'H' : 'T';
      }
      return reply(ctx, `🪙 Flipped **${n.toLocaleString('en-US')}** coins: **${heads.toLocaleString('en-US')}** heads (${((heads / n) * 100).toFixed(1)}%) • **${(n - heads).toLocaleString('en-US')}** tails\nLongest streak: **${best}** ${bestSide}\n\`${preview}${n > 40 ? '…' : ''}\``);
    },
  },
  {
    name: 'dicestats',
    aliases: ['rollmany', 'dicesim'],
    description: 'Roll many dice and show the distribution (up to 100,000)',
    usage: '<count> [sides = 6]',
    examples: ['600', '1000 20'],
    minArgs: 1,
    cooldown: 2,
    async execute(ctx) {
      const n = Number(ctx.args[0]);
      const sides = ctx.args[1] ? Number(ctx.args[1]) : 6;
      if (!Number.isInteger(n) || n < 1 || n > 100000) return ctx.fail('Roll between 1 and 100,000 dice.');
      if (!Number.isInteger(sides) || sides < 2 || sides > 100) return ctx.fail('Dice can have 2 to 100 sides.');
      const counts = new Array(sides).fill(0);
      let total = 0;
      for (let i = 0; i < n; i++) {
        const r = rint(1, sides);
        counts[r - 1]++;
        total += r;
      }
      const max = Math.max(...counts);
      const rows = sides <= 20 ? counts.map((c, i) => `${String(i + 1).padStart(2)} ${'█'.repeat(Math.round((c / max) * 20)).padEnd(20)} ${c}`).join('\n') : null;
      return sendText(ctx, rows || `Most common: ${counts.indexOf(max) + 1} (${max}×)`, {
        code: !!rows,
        prefix: `🎲 Rolled **${n.toLocaleString('en-US')}** d${sides}: average **${(total / n).toFixed(3)}** (expected ${((sides + 1) / 2).toFixed(1)})`,
      });
    },
  },
  {
    name: 'lottonumbers',
    aliases: ['lotterypick', 'quickpick'],
    description: 'Random lottery-style numbers (just for fun)',
    usage: '[count = 6] [max = 49]',
    examples: ['', '5 69'],
    cooldown: 1,
    async execute(ctx) {
      const count = ctx.args[0] ? Number(ctx.args[0]) : 6;
      const max = ctx.args[1] ? Number(ctx.args[1]) : 49;
      if (!Number.isInteger(max) || max < 2 || max > 1000) return ctx.fail('Max must be 2 to 1000.');
      if (!Number.isInteger(count) || count < 1 || count > Math.min(20, max)) return ctx.fail(`Count must be 1 to ${Math.min(20, max)}.`);
      const nums = rshuffle(Array.from({ length: max }, (_, i) => i + 1)).slice(0, count).sort((a, b) => a - b);
      return reply(ctx, `🎟️ ${nums.map((x) => `\`${String(x).padStart(2, '0')}\``).join(' ')}`);
    },
  },
  {
    name: 'bingocard',
    aliases: ['bingo75'],
    description: 'Generate a random 75-ball BINGO card',
    cooldown: 2,
    async execute(ctx) {
      const cols = [0, 1, 2, 3, 4].map((c) => rshuffle(Array.from({ length: 15 }, (_, i) => c * 15 + i + 1)).slice(0, 5));
      const lines = [' B    I    N    G    O', ...[0, 1, 2, 3, 4].map((r) => cols.map((col, c) => (r === 2 && c === 2 ? 'FREE' : String(col[r]).padStart(2).padEnd(4))).join(' '))];
      return sendText(ctx, lines.join('\n'), { code: true, prefix: '🎱 Your BINGO card:' });
    },
  },
  {
    name: 'nickgen',
    aliases: ['nicknamegen', 'randomnick'],
    description: 'Random fun nickname ideas',
    usage: '[count 1-10]',
    examples: ['', '5'],
    cooldown: 1,
    async execute(ctx) {
      const n = ctx.args[0] ? Number(ctx.args[0]) : 5;
      if (!Number.isInteger(n) || n < 1 || n > 10) return ctx.fail('Count must be 1 to 10.');
      const cap = (w) => w[0].toUpperCase() + w.slice(1);
      return reply(ctx, `✨ ${Array.from({ length: n }, () => `**${cap(rpick(D.ADJECTIVES))} ${cap(rpick(D.NOUNS))}**`).join(' • ')}`);
    },
  },
  {
    name: 'usernamegen',
    aliases: ['randomusername', 'namegen'],
    description: 'Random username ideas',
    usage: '[count 1-10]',
    examples: ['', '3'],
    cooldown: 1,
    async execute(ctx) {
      const n = ctx.args[0] ? Number(ctx.args[0]) : 5;
      if (!Number.isInteger(n) || n < 1 || n > 10) return ctx.fail('Count must be 1 to 10.');
      const styles = [
        () => `${rpick(D.ADJECTIVES)}_${rpick(D.NOUNS)}`,
        () => `${rpick(D.ADJECTIVES)}${rpick(D.NOUNS)}${rint(1, 999)}`,
        () => `the.${rpick(D.ADJECTIVES)}.${rpick(D.NOUNS)}`,
        () => `${rpick(D.NOUNS)}${rint(10, 99)}`,
        () => `x${rpick(D.ADJECTIVES)}${rpick(D.NOUNS)}x`,
      ];
      return reply(ctx, `👤 ${Array.from({ length: n }, () => `\`${rpick(styles)()}\``).join(' • ')}`);
    },
  },
  {
    name: 'fakename',
    aliases: ['randomname', 'namepicker'],
    description: 'Random fictional full name (for stories, tests, NPCs)',
    usage: '[count 1-10]',
    examples: ['', '4'],
    cooldown: 1,
    async execute(ctx) {
      const n = ctx.args[0] ? Number(ctx.args[0]) : 1;
      if (!Number.isInteger(n) || n < 1 || n > 10) return ctx.fail('Count must be 1 to 10.');
      return reply(ctx, `🪪 ${Array.from({ length: n }, () => `**${rpick(D.FIRST_NAMES)} ${rpick(D.LAST_NAMES)}**`).join(' • ')}`);
    },
  },
  {
    name: 'fakeemail',
    aliases: ['testemail'],
    description: 'Random test email address on the reserved example.com domain',
    cooldown: 1,
    async execute(ctx) {
      const first = rpick(D.FIRST_NAMES).toLowerCase();
      const last = rpick(D.LAST_NAMES).toLowerCase();
      const domain = rpick(['example.com', 'example.org', 'example.net']);
      const local = rpick([`${first}.${last}`, `${first}${rint(1, 99)}`, `${first[0]}${last}`, `${last}.${first}`]);
      return reply(ctx, `📧 \`${local}@${domain}\` *(RFC 2606 reserved domain — safe for testing)*`);
    },
  },
  {
    name: 'fakephone',
    aliases: ['testphone'],
    description: 'Random fictional phone number (US 555-01xx range)',
    cooldown: 1,
    async execute(ctx) {
      return reply(ctx, `📞 \`(${rint(201, 989)}) 555-01${String(rint(0, 99)).padStart(2, '0')}\` *(555-0100–0199 numbers are reserved for fiction)*`);
    },
  },
  {
    name: 'fakeip',
    aliases: ['testip'],
    description: 'Random IP address from the documentation-only ranges',
    usage: '[v4|v6]',
    examples: ['', 'v6'],
    cooldown: 1,
    async execute(ctx) {
      if (/6/.test(ctx.args[0] || '')) {
        const groups = Array.from({ length: 6 }, () => crypto.randomBytes(2).toString('hex'));
        return reply(ctx, `🌐 \`2001:db8:${groups.join(':')}\` *(2001:db8::/32 is reserved for documentation)*`);
      }
      const prefix = rpick(['192.0.2', '198.51.100', '203.0.113']);
      return reply(ctx, `🌐 \`${prefix}.${rint(1, 254)}\` *(RFC 5737 documentation range — never routed)*`);
    },
  },
  {
    name: 'fakemac',
    aliases: ['randommac', 'macgen'],
    description: 'Random locally-administered MAC address',
    cooldown: 1,
    async execute(ctx) {
      const b = crypto.randomBytes(6);
      b[0] = (b[0] & 0xfc) | 0x02; // unicast + locally administered
      return reply(ctx, `🔌 \`${[...b].map((x) => x.toString(16).padStart(2, '0')).join(':')}\``);
    },
  },
];
