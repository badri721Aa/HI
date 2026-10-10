import { calc, fmtCalc, fmtNum, rand } from '../util.js'

const nums = (args) => args.join(' ').split(/[\s,]+/).filter(Boolean).map(Number).filter((n) => Number.isFinite(n))
const bigOk = (n, max = 1e12) => Number.isInteger(n) && n >= 0 && n <= max

const isPrime = (n) => {
  if (n < 2) return false
  for (let i = 2; i * i <= n; i++) if (n % i === 0) return false
  return true
}
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a))

const ROMAN = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]

// Single-number command builder.
const one = (name, desc, usage, fn, aliases = []) => ({
  name,
  aliases,
  desc,
  usage,
  run: ({ reply, args }) => {
    const n = Number(args[0])
    if (!args[0] || !Number.isFinite(n)) return reply(`Usage: !${name} ${usage}`)
    reply(fn(n))
  },
})

export const commands = [
  {
    name: 'calc',
    aliases: ['calculate', '='],
    desc: 'Calculator: + - * / ^ % ! sqrt() sin() log() pi e…',
    usage: '<expression>',
    run: ({ reply, text }) => {
      if (!text) return reply('Usage: !calc (2+3)*4^2')
      try {
        reply(`🧮 ${text} = *${fmtCalc(calc(text))}*`)
      } catch {
        reply('❌ Invalid expression')
      }
    },
  },
  one('sqrt', 'Square root', '<number>', (n) => `√${n} = ${fmtCalc(Math.sqrt(n))}`),
  one('square', 'Square and cube of a number', '<number>', (n) => `${n}² = ${fmtCalc(n * n)}\n${n}³ = ${fmtCalc(n ** 3)}`),
  {
    name: 'percent',
    aliases: ['pct'],
    desc: 'X% of Y, or what % X is of Y',
    usage: '<x> <y>',
    run: ({ reply, args }) => {
      const [x, y] = nums(args)
      if (y === undefined) return reply('Usage: !percent 15 200')
      reply(`${x}% of ${y} = *${fmtCalc((x / 100) * y)}*\n${x} is *${fmtCalc((x / y) * 100)}%* of ${y}\n${x} → ${y} is a *${fmtCalc(((y - x) / x) * 100)}%* change`)
    },
  },
  {
    name: 'randnum',
    aliases: ['rng'],
    desc: 'Random number between min and max',
    usage: '[min] <max>',
    run: ({ reply, args }) => {
      const n = nums(args)
      const [min, max] = n.length >= 2 ? n : [1, n[0] || 100]
      reply(`🎲 ${rand(Math.ceil(Math.min(min, max)), Math.floor(Math.max(min, max)))}`)
    },
  },
  one('isprime', 'Is a number prime?', '<number>', (n) => (bigOk(n) ? (isPrime(n) ? `✅ ${n} is prime` : `❌ ${n} is not prime`) : 'Use a whole number up to 1e12'), ['prime']),
  one('factors', 'Prime factorisation', '<number>', (n) => {
    if (!bigOk(n) || n < 2) return 'Use a whole number from 2 to 1e12'
    const f = []
    let x = n
    for (let d = 2; d * d <= x; d++) while (x % d === 0) f.push(d), (x /= d)
    if (x > 1) f.push(x)
    return `${n} = ${f.join(' × ')}`
  }),
  one('divisors', 'All divisors of a number', '<number>', (n) => {
    if (!bigOk(n, 1e9) || n < 1) return 'Use a whole number from 1 to 1e9'
    const d = []
    for (let i = 1; i * i <= n; i++) if (n % i === 0) d.push(i, n / i)
    return [...new Set(d)].sort((a, b) => a - b).join(', ')
  }),
  one('fib', 'Fibonacci sequence (first N numbers)', '<n>', (n) => {
    if (!bigOk(n, 75) || n < 1) return 'Use 1–75'
    const f = [0, 1]
    while (f.length < n) f.push(f.at(-1) + f.at(-2))
    return f.slice(0, n).join(', ')
  }, ['fibonacci']),
  one('factorial', 'n!', '<n>', (n) => {
    if (!bigOk(n, 500)) return 'Use 0–500'
    let f = 1n
    for (let i = 2n; i <= BigInt(n); i++) f *= i
    const s = f.toString()
    return `${n}! = ${s.length > 300 ? s.slice(0, 300) + `… (${s.length} digits)` : s}`
  }),
  {
    name: 'gcd',
    aliases: ['hcf'],
    desc: 'Greatest common divisor',
    usage: '<a> <b> [c…]',
    run: ({ reply, args }) => {
      const n = nums(args)
      if (n.length < 2 || !n.every(Number.isInteger)) return reply('Usage: !gcd 12 18')
      reply(`GCD = ${n.reduce(gcd)}`)
    },
  },
  {
    name: 'lcm',
    desc: 'Least common multiple',
    usage: '<a> <b> [c…]',
    run: ({ reply, args }) => {
      const n = nums(args)
      if (n.length < 2 || !n.every(Number.isInteger)) return reply('Usage: !lcm 4 6')
      reply(`LCM = ${n.reduce((a, b) => Math.abs(a * b) / gcd(a, b))}`)
    },
  },
  {
    name: 'roman',
    desc: 'Number ↔ Roman numerals',
    usage: '<number | numeral>',
    run: ({ reply, args }) => {
      const a = args[0]?.toUpperCase()
      if (!a) return reply('Usage: !roman 2026  or  !roman MMXXVI')
      if (/^\d+$/.test(a)) {
        let n = Number(a)
        if (n < 1 || n > 3999) return reply('Use 1–3999')
        let out = ''
        for (const [v, s] of ROMAN) while (n >= v) (out += s), (n -= v)
        return reply(`${a} = *${out}*`)
      }
      if (!/^[MDCLXVI]+$/.test(a)) return reply('Not a Roman numeral')
      let i = 0
      let n = 0
      for (const [v, s] of ROMAN) while (a.startsWith(s, i)) (n += v), (i += s.length)
      reply(i === a.length ? `${a} = *${n}*` : 'Not a valid Roman numeral')
    },
  },
  {
    name: 'average',
    aliases: ['avg', 'mean', 'statistics'],
    desc: 'Mean, median, min, max, sum of numbers',
    usage: '<n1> <n2> …',
    run: ({ reply, args }) => {
      const n = nums(args).sort((a, b) => a - b)
      if (!n.length) return reply('Usage: !avg 4 8 15 16 23 42')
      const sum = n.reduce((a, b) => a + b, 0)
      const mid = n.length >> 1
      const median = n.length % 2 ? n[mid] : (n[mid - 1] + n[mid]) / 2
      const mean = sum / n.length
      const sd = Math.sqrt(n.reduce((a, b) => a + (b - mean) ** 2, 0) / n.length)
      reply(`Count: ${n.length}\nSum: ${fmtCalc(sum)}\nMean: ${fmtCalc(mean)}\nMedian: ${fmtCalc(median)}\nMin: ${n[0]} · Max: ${n.at(-1)}\nStd dev: ${fmtCalc(sd)}`)
    },
  },
  {
    name: 'bmi',
    desc: 'Body mass index',
    usage: '<weight kg> <height cm>',
    run: ({ reply, args }) => {
      const [w, h] = nums(args)
      if (!(w > 0 && h > 0)) return reply('Usage: !bmi 70 175')
      const bmi = w / (h / 100) ** 2
      const cat = bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal' : bmi < 30 ? 'Overweight' : 'Obese'
      reply(`⚖️ BMI: *${bmi.toFixed(1)}* (${cat})`)
    },
  },
  {
    name: 'tip',
    desc: 'Tip calculator, optionally split',
    usage: '<bill> [tip%] [people]',
    run: ({ reply, args }) => {
      const [bill, pct = 15, people = 1] = nums(args)
      if (!(bill > 0)) return reply('Usage: !tip 120 15 4')
      const tip = (bill * pct) / 100
      reply(`🧾 Bill: ${bill.toFixed(2)}\nTip (${pct}%): ${tip.toFixed(2)}\nTotal: ${(bill + tip).toFixed(2)}` + (people > 1 ? `\nEach (${people}): *${((bill + tip) / people).toFixed(2)}*` : ''))
    },
  },
  {
    name: 'split',
    aliases: ['splitbill'],
    desc: 'Split an amount between people',
    usage: '<amount> <people>',
    run: ({ reply, args }) => {
      const [amt, people] = nums(args)
      if (!(amt > 0 && people >= 1)) return reply('Usage: !split 300 4')
      reply(`💵 ${amt} ÷ ${people} = *${(amt / people).toFixed(2)}* each`)
    },
  },
  {
    name: 'age',
    desc: 'Exact age from a birth date',
    usage: '<YYYY-MM-DD>',
    run: ({ reply, args }) => {
      const b = new Date(args[0] + 'T00:00:00')
      if (isNaN(b) || b > new Date()) return reply('Usage: !age 2000-05-21')
      const now = new Date()
      let y = now.getFullYear() - b.getFullYear()
      let m = now.getMonth() - b.getMonth()
      let d = now.getDate() - b.getDate()
      if (d < 0) m--, (d += new Date(now.getFullYear(), now.getMonth(), 0).getDate())
      if (m < 0) y--, (m += 12)
      const next = new Date(now.getFullYear(), b.getMonth(), b.getDate())
      if (next < now) next.setFullYear(now.getFullYear() + 1)
      const days = Math.floor((now - b) / 86400000)
      reply(`🎂 ${y} years, ${m} months, ${d} days\n(${fmtNum(days)} days total)\nNext birthday in ${Math.ceil((next - now) / 86400000)} days`)
    },
  },
  one('leapyear', 'Is it a leap year?', '<year>', (y) => ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? `✅ ${y} is a leap year` : `❌ ${y} is not a leap year`), ['leap']),
  {
    name: 'base',
    aliases: ['convbase'],
    desc: 'Convert between number bases (2–36)',
    usage: '<number> <from> <to>',
    run: ({ reply, args }) => {
      const [n, from, to] = args
      const f = Number(from)
      const t = Number(to)
      if (!n || !(f >= 2 && f <= 36 && t >= 2 && t <= 36)) return reply('Usage: !base ff 16 2')
      try {
        const v = [...n.toLowerCase()].reduce((acc, c) => {
          const d = parseInt(c, 36)
          if (!(d < f)) throw new Error()
          return acc * BigInt(f) + BigInt(d)
        }, 0n)
        reply(`${n} (base ${f}) = *${v.toString(t)}* (base ${t})`)
      } catch {
        reply('Invalid number for that base')
      }
    },
  },
  {
    name: 'dayofweek',
    aliases: ['weekday'],
    desc: 'What day of the week a date falls on',
    usage: '<YYYY-MM-DD>',
    run: ({ reply, args }) => {
      const d = new Date(args[0] + 'T00:00:00')
      reply(isNaN(d) ? 'Usage: !dayofweek 2026-12-25' : `📅 ${d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`)
    },
  },
  {
    name: 'datediff',
    desc: 'Days between two dates',
    usage: '<YYYY-MM-DD> <YYYY-MM-DD>',
    run: ({ reply, args }) => {
      const [a, b] = args.map((x) => new Date(x + 'T00:00:00'))
      if (!a || !b || isNaN(a) || isNaN(b)) return reply('Usage: !datediff 2026-01-01 2026-12-31')
      const days = Math.round(Math.abs(b - a) / 86400000)
      reply(`📆 ${fmtNum(days)} days (${(days / 7).toFixed(1)} weeks)`)
    },
  },
  {
    name: 'quadratic',
    desc: 'Solve ax² + bx + c = 0',
    usage: '<a> <b> <c>',
    run: ({ reply, args }) => {
      const [a, b, c] = nums(args)
      if (c === undefined || a === 0) return reply('Usage: !quadratic 1 -3 2')
      const d = b * b - 4 * a * c
      if (d < 0) {
        const re = fmtCalc(-b / (2 * a))
        const im = fmtCalc(Math.sqrt(-d) / (2 * a))
        return reply(`x = ${re} ± ${im}i`)
      }
      reply(`x₁ = ${fmtCalc((-b + Math.sqrt(d)) / (2 * a))}\nx₂ = ${fmtCalc((-b - Math.sqrt(d)) / (2 * a))}`)
    },
  },
  {
    name: 'interest',
    desc: 'Compound interest',
    usage: '<principal> <rate%> <years>',
    run: ({ reply, args }) => {
      const [p, r, y] = nums(args)
      if (!(p > 0 && r >= 0 && y > 0)) return reply('Usage: !interest 1000 5 10')
      const total = p * (1 + r / 100) ** y
      reply(`💹 ${fmtNum(p)} at ${r}% for ${y} years\n= *${fmtNum(total.toFixed(2))}* (interest ${fmtNum((total - p).toFixed(2))})`)
    },
  },
  {
    name: 'discount',
    desc: 'Price after a discount',
    usage: '<price> <discount%>',
    run: ({ reply, args }) => {
      const [p, d] = nums(args)
      if (!(p > 0 && d >= 0)) return reply('Usage: !discount 80 25')
      reply(`🏷️ ${p} − ${d}% = *${(p * (1 - d / 100)).toFixed(2)}* (you save ${((p * d) / 100).toFixed(2)})`)
    },
  },
]
