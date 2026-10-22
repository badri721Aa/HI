'use strict';
/** Everyday maths: money, health, geometry and dates. */
const { fmt, num, NO_PINGS } = require('../text/_lib');

const bad = (msg) => Object.assign(new Error(msg), { userMessage: msg });
const reply = (ctx, text) => ctx.reply({ content: text, allowedMentions: NO_PINGS });

function n(v, name, { min = -Infinity, max = Infinity, def } = {}) {
  if ((v === undefined || v === '') && def !== undefined) return def;
  const x = num(String(v ?? '').replace(/^[$€£¥]|%$/g, ''));
  if (Number.isNaN(x)) throw bad(`${name} must be a number.`);
  if (x < min || x > max) throw bad(`${name} must be between ${min} and ${max}.`);
  return x;
}
const money = (x) => x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ---------- dates (all in UTC, date-only) ----------
const DAY = 86400000;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const todayUTC = () => {
  const d = new Date();
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};
function validYMD(y, m, d) {
  const t = Date.UTC(y, m - 1, d);
  const x = new Date(t);
  return x.getUTCFullYear() === y && x.getUTCMonth() === m - 1 && x.getUTCDate() === d ? t : null;
}
/** Accepts 2024-12-25, 2024/12/25, "25 Dec 2024", "Dec 25 2024", or "today". Returns UTC ms. */
function parseDate(s) {
  const t = String(s || '').trim().toLowerCase().replace(/,/g, '');
  if (t === 'today' || t === 'now') return todayUTC();
  if (t === 'tomorrow') return todayUTC() + DAY;
  if (t === 'yesterday') return todayUTC() - DAY;
  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return validYMD(+m[1], +m[2], +m[3]);
  m = t.match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/);
  if (m && MONTHS.indexOf(m[2].slice(0, 3)) >= 0) return validYMD(+m[3], MONTHS.indexOf(m[2].slice(0, 3)) + 1, +m[1]);
  m = t.match(/^([a-z]+)\s+(\d{1,2})\s+(\d{4})$/);
  if (m && MONTHS.indexOf(m[1].slice(0, 3)) >= 0) return validYMD(+m[3], MONTHS.indexOf(m[1].slice(0, 3)) + 1, +m[2]);
  return null;
}
const showDate = (t) => new Date(t).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', year: 'numeric', month: 'long', day: 'numeric' });

/** Next occurrence (today or later) of a month/day. */
function nextMonthDay(month, day) {
  const now = todayUTC();
  const y = new Date(now).getUTCFullYear();
  for (let yy = y; yy <= y + 8; yy++) {
    const t = validYMD(yy, month, day);
    if (t !== null && t >= now) return t;
  }
  return null;
}
function easter(y) {
  // Anonymous Gregorian algorithm (Meeus/Jones/Butcher)
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(y, month - 1, day);
}
const HOLIDAYS = {
  christmas: () => nextMonthDay(12, 25),
  xmas: () => nextMonthDay(12, 25),
  newyear: () => nextMonthDay(1, 1),
  newyears: () => nextMonthDay(1, 1),
  halloween: () => nextMonthDay(10, 31),
  valentines: () => nextMonthDay(2, 14),
  valentine: () => nextMonthDay(2, 14),
  easter: () => {
    const y = new Date(todayUTC()).getUTCFullYear();
    const e = easter(y);
    return e >= todayUTC() ? e : easter(y + 1);
  },
};

module.exports = [
  {
    name: 'bmi',
    aliases: ['bodymassindex'],
    description: 'Body-mass index from weight and height (kg/cm or lb/in)',
    usage: '<weight>[kg|lb] <height>[cm|m|in]',
    examples: ['70 175', '154lb 69in', '80kg 1.8m'],
    minArgs: 2,
    cooldown: 1,
    async execute(ctx) {
      const [w, h] = ctx.args.map((x) => x.toLowerCase());
      const wv = n(w.replace(/kg|lbs?$/, ''), 'Weight', { min: 1, max: 1000 });
      const hv = n(h.replace(/cm|m|in$/, ''), 'Height', { min: 0.3, max: 300 });
      const kg = /lb/.test(w) ? wv * 0.45359237 : wv;
      const meters = /in$/.test(h) ? hv * 0.0254 : /cm$/.test(h) || (!/m$/.test(h) && hv > 3) ? hv / 100 : hv;
      const bmi = kg / meters ** 2;
      const cat = bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal weight' : bmi < 30 ? 'Overweight' : 'Obesity';
      return reply(ctx, `⚖️ BMI = **${bmi.toFixed(1)}** — ${cat} (WHO adult categories). *Not medical advice.*`);
    },
  },
  {
    name: 'tip',
    aliases: ['tipcalc', 'gratuity'],
    description: 'Tip calculator, optionally split between people',
    usage: '<bill> [tip % = 15] [people = 1]',
    examples: ['84.50', '120 20 4'],
    minArgs: 1,
    cooldown: 1,
    async execute(ctx) {
      const bill = n(ctx.args[0], 'Bill', { min: 0, max: 1e12 });
      const pct = n(ctx.args[1], 'Tip %', { min: 0, max: 100, def: 15 });
      const people = Math.round(n(ctx.args[2], 'People', { min: 1, max: 1000, def: 1 }));
      const tipAmt = (bill * pct) / 100;
      const total = bill + tipAmt;
      return reply(ctx, `💵 Bill ${money(bill)} + **${pct}%** tip (${money(tipAmt)}) = **${money(total)}**${people > 1 ? `\n👥 Split ${people} ways: **${money(total / people)}** each` : ''}`);
    },
  },
  {
    name: 'splitbill',
    aliases: ['split'],
    description: 'Split a bill between people (with optional tip %)',
    usage: '<total> <people> [tip %]',
    examples: ['150 4', '89.99 3 18'],
    minArgs: 2,
    cooldown: 1,
    async execute(ctx) {
      const total = n(ctx.args[0], 'Total', { min: 0, max: 1e12 });
      const people = Math.round(n(ctx.args[1], 'People', { min: 1, max: 1000 }));
      const pct = n(ctx.args[2], 'Tip %', { min: 0, max: 100, def: 0 });
      const grand = total * (1 + pct / 100);
      return reply(ctx, `👥 ${money(grand)}${pct ? ` (incl. ${pct}% tip)` : ''} split ${people} ways = **${money(grand / people)}** each`);
    },
  },
  {
    name: 'discount',
    aliases: ['sale', 'percentoff'],
    description: 'Price after a percentage discount',
    usage: '<price> <percent off>',
    examples: ['59.99 25', '200 15%'],
    minArgs: 2,
    cooldown: 1,
    async execute(ctx) {
      const price = n(ctx.args[0], 'Price', { min: 0, max: 1e12 });
      const pct = n(ctx.args[1], 'Discount', { min: 0, max: 100 });
      const off = (price * pct) / 100;
      return reply(ctx, `🏷️ ${money(price)} − ${pct}% (${money(off)}) = **${money(price - off)}**`);
    },
  },
  {
    name: 'tax',
    aliases: ['salestax', 'vat'],
    description: 'Add sales tax / VAT to an amount',
    usage: '<amount> <tax rate %>',
    examples: ['100 8.25', '49.99 20'],
    minArgs: 2,
    cooldown: 1,
    async execute(ctx) {
      const amt = n(ctx.args[0], 'Amount', { min: 0, max: 1e12 });
      const rate = n(ctx.args[1], 'Rate', { min: 0, max: 100 });
      const t = (amt * rate) / 100;
      return reply(ctx, `🧾 ${money(amt)} + ${rate}% tax (${money(t)}) = **${money(amt + t)}** • pre-tax price if ${money(amt)} already includes tax: ${money(amt / (1 + rate / 100))}`);
    },
  },
  {
    name: 'compound',
    aliases: ['compoundinterest', 'invest'],
    description: 'Compound interest: final balance after N years',
    usage: '<principal> <annual rate %> <years> [compounds per year = 12] [monthly deposit]',
    examples: ['1000 5 10', '5000 7 30 12 200'],
    minArgs: 3,
    cooldown: 1,
    async execute(ctx) {
      const p = n(ctx.args[0], 'Principal', { min: 0, max: 1e12 });
      const r = n(ctx.args[1], 'Rate', { min: -100, max: 1000 }) / 100;
      const years = n(ctx.args[2], 'Years', { min: 0, max: 200 });
      const k = Math.round(n(ctx.args[3], 'Compounds per year', { min: 1, max: 365, def: 12 }));
      const dep = n(ctx.args[4], 'Monthly deposit', { min: 0, max: 1e9, def: 0 });
      // simulate month by month so deposits and any compounding frequency mix correctly
      let bal = p;
      let deposited = p;
      const months = Math.round(years * 12);
      const ratePerPeriod = r / k;
      for (let m = 1; m <= months; m++) {
        bal += dep;
        deposited += dep;
        // apply the compounding that falls in this month
        const periodsThisMonth = Math.floor((m * k) / 12) - Math.floor(((m - 1) * k) / 12);
        bal *= (1 + ratePerPeriod) ** periodsThisMonth;
      }
      if (!Number.isFinite(bal)) return ctx.fail('That balance is too large to show.');
      return reply(ctx, `📈 After **${years}** years at ${fmt(r * 100)}% (compounded ${k}×/yr): **${money(bal)}**\nContributed ${money(deposited)} • Interest earned **${money(bal - deposited)}**`);
    },
  },
  {
    name: 'simpleinterest',
    aliases: ['interest'],
    description: 'Simple interest: principal × rate × time',
    usage: '<principal> <annual rate %> <years>',
    examples: ['1000 5 3'],
    minArgs: 3,
    cooldown: 1,
    async execute(ctx) {
      const p = n(ctx.args[0], 'Principal', { min: 0, max: 1e12 });
      const r = n(ctx.args[1], 'Rate', { min: 0, max: 1000 });
      const t = n(ctx.args[2], 'Years', { min: 0, max: 1000 });
      const i = (p * r * t) / 100;
      return reply(ctx, `💰 Interest = **${money(i)}** • Total = **${money(p + i)}**`);
    },
  },
  {
    name: 'loan',
    aliases: ['mortgage', 'loancalc'],
    description: 'Monthly payment, total paid and total interest for a loan',
    usage: '<amount> <annual rate %> <years>',
    examples: ['250000 6.5 30', '20000 4.9 5', '1000 0 1'],
    minArgs: 3,
    cooldown: 1,
    async execute(ctx) {
      const amount = n(ctx.args[0], 'Amount', { min: 1, max: 1e12 });
      const annual = n(ctx.args[1], 'Rate', { min: 0, max: 100 });
      const years = n(ctx.args[2], 'Years', { min: 1 / 12, max: 100 });
      const months = Math.round(years * 12);
      const r = annual / 100 / 12;
      const pay = r === 0 ? amount / months : (amount * r) / (1 - (1 + r) ** -months);
      const total = pay * months;
      return reply(ctx, `🏦 Loan ${money(amount)} at ${annual}% for ${months} months\nMonthly payment **${money(pay)}** • Total paid ${money(total)} • Total interest **${money(total - amount)}**`);
    },
  },
  {
    name: 'quadratic',
    aliases: ['solvequadratic', 'qeq'],
    description: 'Solve ax² + bx + c = 0 (real or complex roots)',
    usage: '<a> <b> <c>',
    examples: ['1 -3 2', '1 2 5', '1 -4 4', '0 2 -4'],
    minArgs: 3,
    cooldown: 1,
    async execute(ctx) {
      const [a, b, c] = [0, 1, 2].map((i) => n(ctx.args[i], 'Coefficient'));
      const eq = `${fmt(a)}x² ${b < 0 ? '−' : '+'} ${fmt(Math.abs(b))}x ${c < 0 ? '−' : '+'} ${fmt(Math.abs(c))} = 0`;
      if (a === 0) {
        if (b === 0) return ctx.fail(c === 0 ? 'Every x is a solution (0 = 0).' : 'There is no solution.');
        return reply(ctx, `📐 ${eq} is linear: **x = ${fmt(-c / b)}**`);
      }
      const d = b * b - 4 * a * c;
      if (d > 0) {
        const s = Math.sqrt(d);
        // numerically stable form
        const q = -0.5 * (b + Math.sign(b || 1) * s);
        const x1 = q / a;
        const x2 = c / q;
        return reply(ctx, `📐 ${eq}\nDiscriminant ${fmt(d)} > 0 → **x₁ = ${fmt(Math.max(x1, x2))}**, **x₂ = ${fmt(Math.min(x1, x2))}**`);
      }
      if (d === 0) return reply(ctx, `📐 ${eq}\nDiscriminant 0 → one root **x = ${fmt(-b / (2 * a))}**`);
      const re = -b / (2 * a);
      const im = Math.sqrt(-d) / (2 * Math.abs(a));
      return reply(ctx, `📐 ${eq}\nDiscriminant ${fmt(d)} < 0 → complex roots **x = ${fmt(re)} ± ${fmt(im)}i**`);
    },
  },
  {
    name: 'hypot',
    aliases: ['pythagoras', 'hypotenuse'],
    description: 'Hypotenuse of a right triangle from its two legs',
    usage: '<a> <b>',
    examples: ['3 4', '5 12'],
    minArgs: 2,
    cooldown: 1,
    async execute(ctx) {
      const a = n(ctx.args[0], 'Side a', { min: 0 });
      const b = n(ctx.args[1], 'Side b', { min: 0 });
      return reply(ctx, `📐 √(${fmt(a)}² + ${fmt(b)}²) = **${fmt(Math.hypot(a, b))}**`);
    },
  },
  {
    name: 'distance',
    aliases: ['dist2d', 'pointdistance'],
    description: 'Distance, midpoint and slope between two points',
    usage: '<x1> <y1> <x2> <y2>',
    examples: ['0 0 3 4', '1 2 1 8'],
    minArgs: 4,
    cooldown: 1,
    async execute(ctx) {
      const [x1, y1, x2, y2] = [0, 1, 2, 3].map((i) => n(ctx.args[i], 'Coordinate'));
      const slope = x2 === x1 ? 'undefined (vertical)' : fmt((y2 - y1) / (x2 - x1));
      return reply(ctx, `📍 Distance **${fmt(Math.hypot(x2 - x1, y2 - y1))}** • Midpoint (${fmt((x1 + x2) / 2)}, ${fmt((y1 + y2) / 2)}) • Slope ${slope}`);
    },
  },
  {
    name: 'circle',
    aliases: ['circlearea'],
    description: 'Area, circumference and diameter of a circle',
    usage: '<radius>',
    examples: ['5'],
    minArgs: 1,
    cooldown: 1,
    async execute(ctx) {
      const r = n(ctx.args[0], 'Radius', { min: 0 });
      return reply(ctx, `⭕ r = ${fmt(r)} → area **${fmt(Math.PI * r * r)}** • circumference **${fmt(2 * Math.PI * r)}** • diameter ${fmt(2 * r)}`);
    },
  },
  {
    name: 'sphere',
    aliases: ['spherevolume'],
    description: 'Volume and surface area of a sphere',
    usage: '<radius>',
    examples: ['3'],
    minArgs: 1,
    cooldown: 1,
    async execute(ctx) {
      const r = n(ctx.args[0], 'Radius', { min: 0 });
      return reply(ctx, `🔵 r = ${fmt(r)} → volume **${fmt((4 / 3) * Math.PI * r ** 3)}** • surface area **${fmt(4 * Math.PI * r * r)}**`);
    },
  },
  {
    name: 'deg2rad',
    aliases: ['degtorad'],
    description: 'Convert degrees to radians',
    usage: '<degrees>',
    examples: ['180', '45'],
    minArgs: 1,
    cooldown: 1,
    async execute(ctx) {
      const d = n(ctx.args[0], 'Degrees');
      const r = (d * Math.PI) / 180;
      const piFrac = (() => {
        for (const den of [1, 2, 3, 4, 6, 8, 12, 180]) {
          const num_ = (d * den) / 180;
          if (Number.isInteger(num_)) return ` = ${num_ === 1 ? '' : num_ === -1 ? '-' : num_}π${den === 1 ? '' : `/${den}`}`;
        }
        return '';
      })();
      return reply(ctx, `📐 ${fmt(d)}° = **${fmt(r)} rad**${piFrac}`);
    },
  },
  {
    name: 'rad2deg',
    aliases: ['radtodeg'],
    description: 'Convert radians to degrees (accepts expressions like pi/4)',
    usage: '<radians>',
    examples: ['3.14159265', 'pi/4'],
    minArgs: 1,
    cooldown: 1,
    async execute(ctx) {
      const { evaluate } = require('./_expr');
      const r = evaluate(ctx.rest(0));
      return reply(ctx, `📐 ${ctx.rest(0).slice(0, 50)} rad = **${fmt((r * 180) / Math.PI)}°**`);
    },
  },
  {
    name: 'agecalc',
    aliases: ['howold', 'birthdate'],
    description: 'Exact age from a birth date, plus days to the next birthday',
    usage: '<YYYY-MM-DD | "25 Dec 2000">',
    examples: ['2000-01-15', '29 Feb 2004', 'not-a-date'],
    minArgs: 1,
    cooldown: 1,
    async execute(ctx) {
      const born = parseDate(ctx.rest(0));
      if (born === null) return ctx.fail('Use a date like `2000-01-15` or `15 Jan 2000`.');
      const now = todayUTC();
      if (born > now) return ctx.fail('That date is in the future.');
      const b = new Date(born);
      const t = new Date(now);
      let years = t.getUTCFullYear() - b.getUTCFullYear();
      let months = t.getUTCMonth() - b.getUTCMonth();
      let days = t.getUTCDate() - b.getUTCDate();
      if (days < 0) {
        months--;
        days += new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 0)).getUTCDate();
      }
      if (months < 0) {
        years--;
        months += 12;
      }
      // Feb 29 birthdays are celebrated on Feb 28 in non-leap years
      const leapling = b.getUTCMonth() === 1 && b.getUTCDate() === 29;
      let next;
      if (leapling) {
        // celebrated on Feb 29 in leap years, Feb 28 otherwise
        for (let y = t.getUTCFullYear(); next === undefined || next < now; y++) next = validYMD(y, 2, 29) ?? Date.UTC(y, 1, 28);
      } else next = nextMonthDay(b.getUTCMonth() + 1, b.getUTCDate());
      const until = Math.round((next - now) / DAY);
      return reply(ctx, `🎂 Age: **${years}** years, ${months} months, ${days} days (${Math.round((now - born) / DAY).toLocaleString('en-US')} days total)\n${until === 0 ? '🎉 Happy birthday — it is today!' : `Next birthday in **${until}** day(s).`}`);
    },
  },
  {
    name: 'daysbetween',
    aliases: ['datediff'],
    description: 'Number of days (and weeks) between two dates',
    usage: '<date> <date>  (YYYY-MM-DD, or "today")',
    examples: ['2024-01-01 2024-12-25', 'today 2030-01-01'],
    minArgs: 2,
    cooldown: 1,
    async execute(ctx) {
      const a = parseDate(ctx.args[0]);
      const b = parseDate(ctx.args[1]);
      if (a === null || b === null) return ctx.fail('Use dates like `2024-01-31` (wrap "25 Dec 2024" style dates in quotes).');
      const d = Math.round(Math.abs(b - a) / DAY);
      return reply(ctx, `📅 ${showDate(a)} → ${showDate(b)}: **${d.toLocaleString('en-US')}** days (${Math.floor(d / 7)} weeks ${d % 7} days)`);
    },
  },
  {
    name: 'daysuntil',
    aliases: ['countdownto', 'daystill'],
    description: 'Days until a date or holiday (christmas, halloween, newyear, easter…)',
    usage: '<YYYY-MM-DD | MM-DD | christmas | halloween | newyear | valentines | easter>',
    examples: ['christmas', 'easter', '2030-01-01', '07-04'],
    minArgs: 1,
    cooldown: 1,
    async execute(ctx) {
      const q = ctx.rest(0).toLowerCase().replace(/[^a-z0-9/-]/g, '');
      let target = HOLIDAYS[q]?.() ?? null;
      if (target === null) {
        const md = q.match(/^(\d{1,2})[-/](\d{1,2})$/);
        target = md ? nextMonthDay(+md[1], +md[2]) : parseDate(ctx.rest(0));
      }
      if (target === null) return ctx.fail('Use a date like `2030-01-01`, `12-25`, or a holiday name.');
      const d = Math.round((target - todayUTC()) / DAY);
      const text = d === 0 ? "🎉 That's **today**!" : d > 0 ? `⏳ **${d.toLocaleString('en-US')}** day(s) until ${showDate(target)}` : `⌛ That was **${(-d).toLocaleString('en-US')}** day(s) ago (${showDate(target)})`;
      return reply(ctx, text);
    },
  },
];

module.exports.parseDate = parseDate;
