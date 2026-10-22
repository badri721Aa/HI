'use strict';
const { evaluate } = require('./_expr');
const { sendText, fmt, NO_PINGS } = require('../text/_lib');

const code = (s) => `\`${String(s).replace(/`/g, 'ˋ').slice(0, 300)}\``;
const answer = (ctx, label, value) => ctx.reply({ content: `🧮 ${label} = **${value}**`, allowedMentions: NO_PINGS });

/** Pull an optional trailing/leading "deg" / "rad" mode word off the input. */
function angleMode(text, defaultDegrees) {
  let t = text.trim();
  let degrees = defaultDegrees;
  const m = t.match(/^(deg|degrees|rad|radians)\s+|\s+(deg|degrees|rad|radians|°)$/i);
  if (m) {
    degrees = /^d|°/i.test(m[1] || m[2]);
    t = t.replace(m[0], '').trim();
  }
  t = t.replace(/°/g, '');
  return { text: t, degrees };
}

/** One-argument function commands; the argument may itself be an expression ("sqrt 2*8"). */
function fnCommand(name, description, fnName, { aliases = [], examples = ['16'], trig = null, inverse = false, usage = '<number or expression>' } = {}) {
  return {
    name,
    aliases,
    description,
    usage: trig ? `${usage} [deg|rad]` : usage,
    examples,
    minArgs: 1,
    cooldown: 1,
    async execute(ctx) {
      const { text, degrees } = trig ? angleMode(ctx.rest(0), trig === 'deg') : { text: ctx.rest(0), degrees: false };
      const value = evaluate(`${fnName}(${text})`, { degrees });
      const unit = trig ? (degrees ? '°' : ' rad') : '';
      if (inverse) return answer(ctx, `${fnName}(${code(text)})`, `${fmt(value, 12, false)}${unit}`);
      return answer(ctx, `${fnName}(${code(text)}${unit})`, fmt(value, 12, false));
    },
  };
}

function bigFactorial(n) {
  let r = 1n;
  for (let i = 2n; i <= BigInt(n); i++) r *= i;
  return r;
}
function bigFib(n) {
  let a = 0n;
  let b = 1n;
  for (let i = 0; i < n; i++) [a, b] = [b, a + b];
  return a;
}

module.exports = [
  {
    name: 'calc',
    aliases: ['math', 'calculate', 'calculator'],
    description: 'Safe calculator: + - * / ^ % ! ( ), sqrt, sin, log, pi, e… (add "deg" for degrees)',
    usage: '<expression> [deg]',
    examples: ['2(3+4)^2 - sqrt(16) + 5!', 'sin(30) deg', '1,000,000 / 7', 'log(8, 2) + ln(e)', '10 / 0', '2 +'],
    minArgs: 1,
    cooldown: 1,
    slash: true,
    args: [{ name: 'expression', type: 'string', description: 'e.g. 2(3+4)^2 - sqrt(16) — end with "deg" for degree trig', required: true, rest: true }],
    async execute(ctx) {
      const { text, degrees } = angleMode(ctx.rest(0), false);
      const value = evaluate(text, { degrees });
      const exact = Number.isInteger(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER ? String(value) : fmt(value, 15, false);
      await ctx.reply({
        embeds: [
          ctx.embed({
            title: '🧮 Calculator',
            fields: [
              { name: 'Input', value: `\`\`\`${text.replace(/```/g, '').slice(0, 1000)}\`\`\`` },
              { name: 'Result', value: `\`\`\`${exact}\`\`\`` },
            ],
            footer: degrees ? 'Trig in degrees' : 'Trig in radians — add "deg" for degrees',
          }),
        ],
      });
    },
  },
  fnCommand('sqrt', 'Square root', 'sqrt', { examples: ['144', '2'], aliases: ['squareroot'] }),
  fnCommand('cbrt', 'Cube root', 'cbrt', { examples: ['27', '-8'], aliases: ['cuberoot'] }),
  fnCommand('abs', 'Absolute value', 'abs', { examples: ['-42.5'] }),
  fnCommand('floor', 'Round down to a whole number', 'floor', { examples: ['4.7', '-4.2'] }),
  fnCommand('ceil', 'Round up to a whole number', 'ceil', { examples: ['4.2', '-4.7'], aliases: ['ceiling'] }),
  fnCommand('sin', 'Sine (degrees by default, add "rad" for radians)', 'sin', { trig: 'deg', examples: ['30', 'pi/6 rad'] }),
  fnCommand('cos', 'Cosine (degrees by default, add "rad" for radians)', 'cos', { trig: 'deg', examples: ['60', '90'] }),
  fnCommand('tan', 'Tangent (degrees by default, add "rad" for radians)', 'tan', { trig: 'deg', examples: ['45', '90'] }),
  fnCommand('sec', 'Secant = 1/cos (degrees by default)', 'sec', { trig: 'deg', examples: ['60'] }),
  fnCommand('csc', 'Cosecant = 1/sin (degrees by default)', 'csc', { trig: 'deg', examples: ['30'] }),
  fnCommand('cot', 'Cotangent = 1/tan (degrees by default)', 'cot', { trig: 'deg', examples: ['45'] }),
  fnCommand('asin', 'Inverse sine — answer in degrees (add "rad" for radians)', 'asin', { trig: 'deg', examples: ['0.5', '1 rad'], usage: '<value -1..1>', aliases: ['arcsin'], inverse: true }),
  fnCommand('acos', 'Inverse cosine — answer in degrees (add "rad" for radians)', 'acos', { trig: 'deg', examples: ['0.5'], usage: '<value -1..1>', aliases: ['arccos'], inverse: true }),
  fnCommand('atan', 'Inverse tangent — answer in degrees (add "rad" for radians)', 'atan', { trig: 'deg', examples: ['1'], usage: '<value>', aliases: ['arctan'], inverse: true }),
  fnCommand('sinh', 'Hyperbolic sine', 'sinh', { examples: ['1'] }),
  fnCommand('cosh', 'Hyperbolic cosine', 'cosh', { examples: ['1'] }),
  fnCommand('tanh', 'Hyperbolic tangent', 'tanh', { examples: ['0.5'] }),
  fnCommand('ln', 'Natural logarithm (base e)', 'ln', { examples: ['e^3', '10'], aliases: ['naturallog'] }),
  fnCommand('log2', 'Logarithm base 2', 'log2', { examples: ['1024'] }),
  fnCommand('epower', 'e raised to a power (eˣ)', 'exp', { examples: ['1', '2.5'], aliases: ['expe'] }),
  {
    name: 'logarithm',
    aliases: ['log10', 'logb'],
    description: 'Logarithm: base 10 by default, or give a base',
    usage: '<number> [base]',
    examples: ['1000', '8 2', '81 3'],
    minArgs: 1,
    cooldown: 1,
    async execute(ctx) {
      const [x, b] = ctx.args;
      const v = evaluate(b ? `log(${x}, ${b})` : `log(${x})`);
      return answer(ctx, `log${b ? `₍${code(b)}₎` : '₁₀'}(${code(x)})`, fmt(v, 12, false));
    },
  },
  {
    name: 'pow',
    aliases: ['power'],
    description: 'Raise a number to a power',
    usage: '<base> <exponent>',
    examples: ['2 10', '9 0.5', '10 -2'],
    minArgs: 2,
    cooldown: 1,
    async execute(ctx) {
      const [a, b] = ctx.args;
      return answer(ctx, `${code(a)} ^ ${code(b)}`, fmt(evaluate(`(${a})^(${b})`), 15, false));
    },
  },
  {
    name: 'root',
    aliases: ['nthroot'],
    description: 'N-th root of a number',
    usage: '<n> <number>',
    examples: ['3 27', '4 16', '3 -8'],
    minArgs: 2,
    cooldown: 1,
    async execute(ctx) {
      const n = evaluate(ctx.args[0]);
      const x = evaluate(ctx.rest(1));
      if (n === 0) return ctx.fail('The 0th root is undefined.');
      if (x < 0 && Number.isInteger(n) && n % 2 === 1) return answer(ctx, `${n}√${code(x)}`, fmt(-(Math.abs(x) ** (1 / n)), 12, false));
      if (x < 0) return ctx.fail('An even root of a negative number is not a real number.');
      return answer(ctx, `${n}√${code(x)}`, fmt(x ** (1 / n), 12, false));
    },
  },
  {
    name: 'round',
    aliases: ['roundto'],
    description: 'Round a number (optionally to N decimal places)',
    usage: '<number> [decimals]',
    examples: ['3.14159 2', '2.5', '1234.5678 -2'],
    minArgs: 1,
    cooldown: 1,
    async execute(ctx) {
      const x = evaluate(ctx.args[0]);
      const d = ctx.args[1] ? Number(ctx.args[1]) : 0;
      if (!Number.isInteger(d) || d < -15 || d > 15) return ctx.fail('Decimals must be a whole number from -15 to 15.');
      const f = 10 ** d;
      const r = Math.round((x + Number.EPSILON * Math.sign(x)) * f) / f;
      return answer(ctx, `round(${code(x)}, ${d})`, d > 0 ? r.toFixed(d) : fmt(r, 15, false));
    },
  },
  {
    name: 'factorial',
    aliases: ['factorialbig'],
    description: 'Exact factorial n! (up to 2000!)',
    usage: '<n>',
    examples: ['5', '20', '100'],
    minArgs: 1,
    cooldown: 2,
    async execute(ctx) {
      const n = Number(ctx.args[0]);
      if (!Number.isInteger(n) || n < 0 || n > 2000) return ctx.fail('Give a whole number from 0 to 2000.');
      const r = bigFactorial(n).toString();
      return sendText(ctx, r, { prefix: `🧮 **${n}!** (${r.length} digits) =`, code: true, file: `${n}-factorial.txt` });
    },
  },
  {
    name: 'fib',
    aliases: ['fibonacci'],
    description: 'The n-th Fibonacci number (exact, up to n = 10000)',
    usage: '<n>',
    examples: ['10', '100'],
    minArgs: 1,
    cooldown: 2,
    async execute(ctx) {
      const n = Number(ctx.args[0]);
      if (!Number.isInteger(n) || n < 0 || n > 10000) return ctx.fail('Give a whole number from 0 to 10000.');
      const r = bigFib(n).toString();
      return sendText(ctx, r, { prefix: `🧮 **F(${n})** (${r.length} digits) =`, code: true, file: `fib-${n}.txt` });
    },
  },
  {
    name: 'ncr',
    aliases: ['combinations', 'choosecount'],
    description: 'Combinations: ways to choose r items from n (nCr)',
    usage: '<n> <r>',
    examples: ['5 2', '52 5'],
    minArgs: 2,
    cooldown: 1,
    async execute(ctx) {
      const [n, r] = ctx.args.map((x) => evaluate(x));
      return answer(ctx, `C(${n}, ${r})`, fmt(evaluate(`ncr(${n}, ${r})`), 15));
    },
  },
  {
    name: 'npr',
    aliases: ['permutations'],
    description: 'Permutations: ordered ways to pick r items from n (nPr)',
    usage: '<n> <r>',
    examples: ['5 2', '10 3'],
    minArgs: 2,
    cooldown: 1,
    async execute(ctx) {
      const [n, r] = ctx.args.map((x) => evaluate(x));
      return answer(ctx, `P(${n}, ${r})`, fmt(evaluate(`npr(${n}, ${r})`), 15));
    },
  },
];

module.exports.answer = answer;
module.exports.code = code;
