'use strict';
/** Number theory and base conversion — exact BigInt arithmetic throughout. */
const { sendText, NO_PINGS } = require('../text/_lib');

const reply = (ctx, text) => ctx.reply({ content: text, allowedMentions: NO_PINGS });
const bad = (msg) => Object.assign(new Error(msg), { userMessage: msg });

function parseBig(v, { min = null, max = null, name = 'number' } = {}) {
  const s = String(v ?? '').replace(/[,_]/g, '').trim();
  if (!/^-?\d+$/.test(s)) throw bad(`The ${name} must be a whole number.`);
  const n = BigInt(s);
  if (min !== null && n < min) throw bad(`The ${name} must be at least ${min}.`);
  if (max !== null && n > max) throw bad(`The ${name} is too large (max ${max.toString().length - 1 > 6 ? `10^${max.toString().length - 1}` : max}).`);
  return n;
}
const abs = (n) => (n < 0n ? -n : n);
const bgcd = (a, b) => {
  a = abs(a);
  b = abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
};
function modpow(base, exp, mod) {
  let r = 1n;
  base %= mod;
  while (exp > 0n) {
    if (exp & 1n) r = (r * base) % mod;
    base = (base * base) % mod;
    exp >>= 1n;
  }
  return r;
}

const SMALL_PRIMES = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n];
/** Deterministic Miller–Rabin for n < 3.3·10^24 (and a very strong test above that). */
function isPrime(n) {
  if (n < 2n) return false;
  for (const p of SMALL_PRIMES) {
    if (n === p) return true;
    if (n % p === 0n) return false;
  }
  let d = n - 1n;
  let s = 0;
  while ((d & 1n) === 0n) {
    d >>= 1n;
    s++;
  }
  outer: for (const a of SMALL_PRIMES) {
    let x = modpow(a, d, n);
    if (x === 1n || x === n - 1n) continue;
    for (let i = 1; i < s; i++) {
      x = (x * x) % n;
      if (x === n - 1n) continue outer;
    }
    return false;
  }
  return true;
}

/** Pollard–Brent rho; returns a non-trivial factor or null if the budget runs out. */
function rho(n, budget) {
  if (n % 2n === 0n) return 2n;
  for (let c = 1n; c < 20n; c++) {
    let y = 2n;
    let r = 1;
    let q = 1n;
    let g = 1n;
    let x;
    let ys;
    const f = (v) => (v * v + c) % n;
    while (g === 1n) {
      x = y;
      for (let i = 0; i < r; i++) y = f(y);
      let k = 0;
      while (k < r && g === 1n) {
        ys = y;
        for (let i = 0; i < Math.min(128, r - k); i++) {
          y = f(y);
          q = (q * abs(x - y)) % n;
        }
        g = bgcd(q, n);
        k += 128;
        if ((budget.left -= 128) < 0) return null;
      }
      r *= 2;
    }
    if (g === n) {
      do {
        ys = f(ys);
        g = bgcd(abs(x - ys), n);
      } while (g === 1n);
    }
    if (g !== n) return g;
  }
  return null;
}

function factorize(n) {
  const factors = [];
  let incomplete = false;
  for (let p = 2n; p < 1000n && p * p <= n; p += p === 2n ? 1n : 2n) {
    while (n % p === 0n) {
      factors.push(p);
      n /= p;
    }
  }
  const budget = { left: 3_000_000 };
  const stack = n > 1n ? [n] : [];
  while (stack.length) {
    const m = stack.pop();
    if (isPrime(m)) {
      factors.push(m);
      continue;
    }
    const d = rho(m, budget);
    if (!d) {
      factors.push(m);
      incomplete = true;
      continue;
    }
    stack.push(d, m / d);
  }
  factors.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return { factors, incomplete };
}

function sieve(limit) {
  const is = new Uint8Array(limit + 1).fill(1);
  is[0] = 0;
  if (limit >= 1) is[1] = 0;
  for (let i = 2; i * i <= limit; i++) if (is[i]) for (let j = i * i; j <= limit; j += i) is[j] = 0;
  const out = [];
  for (let i = 2; i <= limit; i++) if (is[i]) out.push(i);
  return out;
}

function divisors(n) {
  const small = [];
  const large = [];
  for (let i = 1n; i * i <= n; i++) {
    if (n % i === 0n) {
      small.push(i);
      if (i * i !== n) large.unshift(n / i);
    }
  }
  return [...small, ...large];
}

const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';
function parseBase(str, base) {
  let s = String(str).trim().toLowerCase().replace(/[_\s]/g, '');
  let neg = false;
  if (s.startsWith('-')) {
    neg = true;
    s = s.slice(1);
  }
  const prefix = { 2: '0b', 8: '0o', 16: '0x' }[base];
  if (prefix && s.startsWith(prefix)) s = s.slice(2);
  if (!s) throw bad('Give a number to convert.');
  let n = 0n;
  const B = BigInt(base);
  for (const ch of s) {
    const d = DIGITS.indexOf(ch);
    if (d < 0 || d >= base) throw bad(`"${ch}" is not a valid digit in base ${base}.`);
    n = n * B + BigInt(d);
  }
  if (s.length > 1000) throw bad('That number is too long.');
  return neg ? -n : n;
}
const toBase = (n, base) => (n < 0n ? `-${(-n).toString(base)}` : n.toString(base));
const grouped = (s, size) => s.replace(new RegExp(`\\B(?=(.{${size}})+$)`, 'g'), ' ');

function baseCmd(name, from, to, { aliases = [], example }) {
  const label = { 2: 'binary', 8: 'octal', 10: 'decimal', 16: 'hex' };
  return {
    name,
    aliases,
    description: `Convert a ${label[from]} number to ${label[to]}`,
    usage: `<${label[from]} number>`,
    examples: [example],
    minArgs: 1,
    cooldown: 1,
    async execute(ctx) {
      const n = parseBase(ctx.rest(0), from);
      let out = toBase(n, to);
      if (to === 2) out = grouped(out.replace('-', ''), 4).replace(/^/, n < 0n ? '-' : '');
      if (to === 16) out = out.toUpperCase();
      return reply(ctx, `🔢 \`${ctx.rest(0).slice(0, 200)}\`₍${from}₎ = **\`${out}\`**₍${to}₎`);
    },
  };
}

const ROMAN = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
function toRoman(n) {
  let out = '';
  for (const [v, s] of ROMAN) while (n >= v) {
    out += s;
    n -= v;
  }
  return out;
}
const ROMAN_RE = /^M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/;

function listNumbers(text) {
  return String(text)
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map((x) => parseBig(x));
}

module.exports = [
  {
    name: 'isprime',
    aliases: ['prime', 'primecheck'],
    description: 'Check whether a number is prime (works for huge numbers)',
    usage: '<number>',
    examples: ['97', '561', '1000000007', '170141183460469231731687303715884105727'],
    minArgs: 1,
    cooldown: 1,
    async execute(ctx) {
      const n = parseBig(ctx.args[0], { max: 10n ** 60n });
      const p = isPrime(n);
      const note = n >= 3317044064679887385961981n && p ? ' (probable prime — Miller–Rabin with 13 bases)' : '';
      return reply(ctx, p ? `✅ **${n}** is prime${note}.` : `❌ **${n}** is not prime.${n > 1n ? ` Try \`${ctx.prefix}primefactors ${n}\`.` : ''}`);
    },
  },
  {
    name: 'primefactors',
    aliases: ['factorize', 'factors', 'pfactors'],
    description: 'Prime factorization of a number (up to 10^24)',
    usage: '<number>',
    examples: ['360', '600851475143', '1000000016000000063'],
    minArgs: 1,
    cooldown: 2,
    async execute(ctx) {
      const n = parseBig(ctx.args[0], { min: 2n, max: 10n ** 24n });
      const { factors, incomplete } = factorize(n);
      const counts = new Map();
      for (const f of factors) counts.set(f, (counts.get(f) || 0) + 1);
      const sup = (k) => String(k).replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d]);
      const pretty = [...counts].map(([f, k]) => (k > 1 ? `${f}${sup(k)}` : `${f}`)).join(' × ');
      return reply(ctx, `🔢 **${n}** = ${pretty}${factors.length === 1 && !incomplete ? ' (prime)' : ''}${incomplete ? '\n⚠️ The last factor could not be split within the time limit.' : ''}`);
    },
  },
  {
    name: 'divisors',
    aliases: ['alldivisors'],
    description: 'List every divisor of a number (up to 10^12)',
    usage: '<number>',
    examples: ['360', '97'],
    minArgs: 1,
    cooldown: 2,
    async execute(ctx) {
      const n = parseBig(ctx.args[0], { min: 1n, max: 10n ** 12n });
      const d = divisors(n);
      return sendText(ctx, d.join(', '), { prefix: `🔢 **${n}** has **${d.length}** divisors (sum ${d.reduce((a, b) => a + b, 0n)}):` });
    },
  },
  {
    name: 'nextprime',
    aliases: ['primeafter'],
    description: 'The smallest prime greater than a number',
    usage: '<number>',
    examples: ['100', '1000000'],
    minArgs: 1,
    cooldown: 1,
    async execute(ctx) {
      let n = parseBig(ctx.args[0], { max: 10n ** 40n }) + 1n;
      if (n < 2n) n = 2n;
      while (!isPrime(n)) n++;
      return reply(ctx, `➡️ The next prime after **${ctx.args[0]}** is **${n}**.`);
    },
  },
  {
    name: 'prevprime',
    aliases: ['primebefore'],
    description: 'The largest prime smaller than a number',
    usage: '<number>',
    examples: ['100', '3', '2'],
    minArgs: 1,
    cooldown: 1,
    async execute(ctx) {
      let n = parseBig(ctx.args[0], { max: 10n ** 40n }) - 1n;
      while (n >= 2n && !isPrime(n)) n--;
      if (n < 2n) return ctx.fail('There is no prime below that.');
      return reply(ctx, `⬅️ The prime before **${ctx.args[0]}** is **${n}**.`);
    },
  },
  {
    name: 'primes',
    aliases: ['listprimes', 'primesbetween'],
    description: 'List primes up to N, or between A and B (max range 1,000,000)',
    usage: '<max> | <from> <to>',
    examples: ['50', '100 200'],
    minArgs: 1,
    cooldown: 2,
    async execute(ctx) {
      const a = ctx.args.length > 1 ? Number(parseBig(ctx.args[0], { min: 0n, max: 1000000n })) : 0;
      const b = Number(parseBig(ctx.args[ctx.args.length > 1 ? 1 : 0], { min: 0n, max: 1000000n }));
      if (b < a) return ctx.fail('The end must be larger than the start.');
      const list = sieve(b).filter((p) => p >= a);
      return sendText(ctx, list.join(', ') || '(none)', { prefix: `🔢 **${list.length}** prime(s) between ${a} and ${b}:`, file: 'primes.txt' });
    },
  },
  {
    name: 'gcd',
    aliases: ['hcf', 'gcf'],
    description: 'Greatest common divisor of two or more numbers',
    usage: '<a> <b> [c …]',
    examples: ['48 180', '12 18 24'],
    minArgs: 2,
    cooldown: 1,
    async execute(ctx) {
      const nums = listNumbers(ctx.rest(0));
      return reply(ctx, `🔢 gcd(${nums.join(', ')}) = **${nums.reduce(bgcd)}**`);
    },
  },
  {
    name: 'lcm',
    aliases: ['lowestcommonmultiple'],
    description: 'Least common multiple of two or more numbers',
    usage: '<a> <b> [c …]',
    examples: ['4 6', '3 4 5'],
    minArgs: 2,
    cooldown: 1,
    async execute(ctx) {
      const nums = listNumbers(ctx.rest(0));
      const l = nums.reduce((a, b) => (a === 0n || b === 0n ? 0n : abs(a * b) / bgcd(a, b)));
      return reply(ctx, `🔢 lcm(${nums.join(', ')}) = **${l}**`);
    },
  },
  {
    name: 'modulo',
    aliases: ['modulus', 'remainder'],
    description: 'Remainder of a ÷ b (always non-negative)',
    usage: '<a> <b>',
    examples: ['17 5', '-7 3'],
    minArgs: 2,
    cooldown: 1,
    async execute(ctx) {
      const a = parseBig(ctx.args[0]);
      const b = parseBig(ctx.args[1]);
      if (b === 0n) return ctx.fail('Modulo by zero is undefined.');
      const r = ((a % b) + abs(b)) % abs(b);
      return reply(ctx, `🔢 ${a} mod ${b} = **${r}** (quotient ${(a - r) / b})`);
    },
  },
  {
    name: 'collatz',
    aliases: ['3nplus1'],
    description: 'Collatz (3n+1) sequence: steps to reach 1',
    usage: '<number>',
    examples: ['27', '6'],
    minArgs: 1,
    cooldown: 2,
    async execute(ctx) {
      let n = parseBig(ctx.args[0], { min: 1n, max: 10n ** 30n });
      const seq = [n];
      let peak = n;
      while (n !== 1n && seq.length < 100000) {
        n = n % 2n ? 3n * n + 1n : n / 2n;
        seq.push(n);
        if (n > peak) peak = n;
      }
      const shown = seq.length > 60 ? `${seq.slice(0, 30).join(' → ')} → … → ${seq.slice(-5).join(' → ')}` : seq.join(' → ');
      return sendText(ctx, shown, { prefix: `🔁 **${seq[0]}** reaches 1 in **${seq.length - 1}** steps (peak ${peak}):` });
    },
  },
  {
    name: 'digitsum',
    aliases: ['sumdigits', 'digitalroot'],
    description: 'Sum of the digits and the digital root',
    usage: '<number>',
    examples: ['987654321'],
    minArgs: 1,
    cooldown: 1,
    async execute(ctx) {
      const s = abs(parseBig(ctx.args[0])).toString();
      let sum = [...s].reduce((a, d) => a + Number(d), 0);
      let root = sum;
      while (root >= 10) root = [...String(root)].reduce((a, d) => a + Number(d), 0);
      return reply(ctx, `🔢 Digit sum of **${s}** is **${sum}**, digital root **${root}**.`);
    },
  },
  {
    name: 'perfect',
    aliases: ['isperfect', 'abundant'],
    description: 'Is a number perfect, abundant or deficient?',
    usage: '<number>',
    examples: ['28', '12', '13'],
    minArgs: 1,
    cooldown: 1,
    async execute(ctx) {
      const n = parseBig(ctx.args[0], { min: 1n, max: 10n ** 12n });
      const sum = divisors(n).reduce((a, b) => a + b, 0n) - n;
      const kind = sum === n ? '**perfect** ✨' : sum > n ? '**abundant**' : '**deficient**';
      return reply(ctx, `🔢 **${n}** is ${kind} — its proper divisors add up to ${sum}.`);
    },
  },
  {
    name: 'triangular',
    aliases: ['trianglenumber'],
    description: 'The n-th triangular number, and whether a number is triangular',
    usage: '<n>',
    examples: ['10', '55'],
    minArgs: 1,
    cooldown: 1,
    async execute(ctx) {
      const n = parseBig(ctx.args[0], { min: 0n, max: 10n ** 30n });
      const tn = (n * (n + 1n)) / 2n;
      // n is triangular if 8n+1 is a perfect square
      const m = 8n * n + 1n;
      let r = BigInt(Math.floor(Math.sqrt(Number(m))));
      while (r * r > m) r--;
      while ((r + 1n) * (r + 1n) <= m) r++;
      const isTri = r * r === m;
      return reply(ctx, `🔺 T(${n}) = **${tn}**\n${isTri ? `✅ ${n} itself is triangular (T(${(r - 1n) / 2n}))` : `❌ ${n} itself is not a triangular number`}`);
    },
  },
  {
    name: 'armstrong',
    aliases: ['narcissistic'],
    description: 'Is a number an Armstrong (narcissistic) number?',
    usage: '<number>',
    examples: ['153', '154'],
    minArgs: 1,
    cooldown: 1,
    async execute(ctx) {
      const n = parseBig(ctx.args[0], { min: 0n, max: 10n ** 40n });
      const d = n.toString();
      const sum = [...d].reduce((a, x) => a + BigInt(x) ** BigInt(d.length), 0n);
      return reply(ctx, `${sum === n ? '✅' : '❌'} **${n}**: ${[...d].map((x) => `${x}^${d.length}`).join(' + ')} = ${sum}`);
    },
  },
  baseCmd('dec2bin', 10, 2, { aliases: ['tobin'], example: '255' }),
  baseCmd('bin2dec', 2, 10, { aliases: ['frombin'], example: '11111111' }),
  baseCmd('dec2hex', 10, 16, { aliases: ['tohexnum'], example: '48879' }),
  baseCmd('hex2dec', 16, 10, { aliases: ['fromhexnum'], example: 'BEEF' }),
  baseCmd('dec2oct', 10, 8, { aliases: ['tooct'], example: '511' }),
  baseCmd('oct2dec', 8, 10, { aliases: ['fromoct'], example: '777' }),
  baseCmd('bin2hex', 2, 16, { example: '1011111011101111' }),
  baseCmd('hex2bin', 16, 2, { example: 'BEEF' }),
  baseCmd('bin2oct', 2, 8, { example: '111111111' }),
  baseCmd('oct2bin', 8, 2, { example: '777' }),
  {
    name: 'baseconvert',
    aliases: ['base', 'radix'],
    description: 'Convert a number between any bases from 2 to 36',
    usage: '<number> <from base> <to base>',
    examples: ['255 10 2', 'zz 36 10', 'ff 16 3'],
    minArgs: 3,
    cooldown: 1,
    async execute(ctx) {
      const from = Number(ctx.args[1]);
      const to = Number(ctx.args[2]);
      if (![from, to].every((b) => Number.isInteger(b) && b >= 2 && b <= 36)) return ctx.fail('Bases must be whole numbers from 2 to 36.');
      const n = parseBase(ctx.args[0], from);
      return reply(ctx, `🔢 \`${ctx.args[0]}\`₍${from}₎ = **\`${toBase(n, to).toUpperCase()}\`**₍${to}₎`);
    },
  },
  {
    name: 'roman',
    aliases: ['toroman'],
    description: 'Convert a number (1–3999) to Roman numerals',
    usage: '<number>',
    examples: ['2024', '3999', '4'],
    minArgs: 1,
    cooldown: 1,
    async execute(ctx) {
      const n = Number(parseBig(ctx.args[0], { min: 1n, max: 3999n }));
      return reply(ctx, `🏛️ **${n}** = **${toRoman(n)}**`);
    },
  },
  {
    name: 'unroman',
    aliases: ['fromroman'],
    description: 'Convert Roman numerals to a number',
    usage: '<roman numerals>',
    examples: ['MMXXIV', 'XLII', 'IIII'],
    minArgs: 1,
    cooldown: 1,
    async execute(ctx) {
      const s = ctx.args[0].toUpperCase();
      if (!s || !ROMAN_RE.test(s)) return ctx.fail('That is not a valid Roman numeral (standard form, I to MMMCMXCIX).');
      let n = 0;
      let rest = s;
      for (const [v, sym] of ROMAN) while (rest.startsWith(sym)) {
        n += v;
        rest = rest.slice(sym.length);
      }
      return reply(ctx, `🏛️ **${s}** = **${n}**`);
    },
  },
];

module.exports.isPrime = isPrime;
module.exports.factorize = factorize;
