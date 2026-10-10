// Offline unit conversions.
import { fmtCalc } from '../util.js'

// Every unit is expressed as a multiple of the base unit of its kind.
const UNITS = {
  length: { m: 1, km: 1000, cm: 0.01, mm: 0.001, mi: 1609.344, mile: 1609.344, miles: 1609.344, yd: 0.9144, ft: 0.3048, feet: 0.3048, in: 0.0254, inch: 0.0254, nmi: 1852 },
  weight: { kg: 1, g: 0.001, mg: 1e-6, t: 1000, ton: 1000, lb: 0.45359237, lbs: 0.45359237, oz: 0.028349523, st: 6.35029318 },
  volume: { l: 1, ml: 0.001, m3: 1000, gal: 3.785411784, qt: 0.946352946, pt: 0.473176473, cup: 0.24, floz: 0.0295735296, tbsp: 0.0147867648, tsp: 0.00492892159 },
  speed: { 'm/s': 1, 'km/h': 1 / 3.6, kmh: 1 / 3.6, kph: 1 / 3.6, mph: 0.44704, knot: 0.514444, knots: 0.514444 },
  area: { m2: 1, km2: 1e6, cm2: 1e-4, ha: 1e4, acre: 4046.8564224, ft2: 0.09290304, mi2: 2589988.11 },
  data: { b: 1, kb: 1e3, mb: 1e6, gb: 1e9, tb: 1e12, kib: 1024, mib: 1024 ** 2, gib: 1024 ** 3, tib: 1024 ** 4, bit: 0.125 },
  time: { s: 1, sec: 1, min: 60, h: 3600, hr: 3600, day: 86400, d: 86400, week: 604800, month: 2629746, year: 31556952, ms: 0.001 },
}

function convert(value, from, to) {
  for (const [kind, table] of Object.entries(UNITS)) {
    if (from in table && to in table) return { kind, result: (value * table[from]) / table[to] }
  }
  return null
}

const toC = { c: (v) => v, f: (v) => ((v - 32) * 5) / 9, k: (v) => v - 273.15 }
const fromC = { c: (v) => v, f: (v) => (v * 9) / 5 + 32, k: (v) => v + 273.15 }

// Shortcut command for one unit kind, e.g. !length 5 km mi
const kindCmd = (name, kind, example) => ({
  name,
  desc: `Convert ${kind} (${Object.keys(UNITS[kind]).slice(0, 6).join(', ')}…)`,
  usage: '<value> <from> <to>',
  run: ({ reply, args }) => {
    const [v, from, to] = [Number(args[0]), args[1]?.toLowerCase(), args[2]?.toLowerCase()]
    const table = UNITS[kind]
    if (!Number.isFinite(v) || !(from in table) || !(to in table)) return reply(`Usage: !${name} ${example}\nUnits: ${Object.keys(table).join(', ')}`)
    reply(`${v} ${from} = *${fmtCalc((v * table[from]) / table[to])}* ${to}`)
  },
})

export const commands = [
  {
    name: 'convert',
    aliases: ['conv', 'unit'],
    desc: 'Convert any unit (length, weight, volume, speed, area, data, time, temperature)',
    usage: '<value> <from> <to>',
    run: ({ reply, args }) => {
      const v = Number(args[0])
      const from = args[1]?.toLowerCase()
      const to = args[2]?.toLowerCase()
      if (!Number.isFinite(v) || !from || !to) return reply('Usage: !convert 10 km mi')
      if (from in toC && to in toC) return reply(`${v}°${from.toUpperCase()} = *${fmtCalc(fromC[to](toC[from](v)))}*°${to.toUpperCase()}`)
      const r = convert(v, from, to)
      reply(r ? `${v} ${from} = *${fmtCalc(r.result)}* ${to}` : "I can't convert between those units. Try !help convert")
    },
  },
  {
    name: 'temp',
    aliases: ['temperature'],
    desc: 'Convert temperature between C, F and K',
    usage: '<value><C|F|K>',
    run: ({ reply, args }) => {
      const m = /^(-?\d+(?:\.\d+)?)\s*°?([cfk])$/i.exec(args.join(''))
      if (!m) return reply('Usage: !temp 36.6c  or  !temp 98f')
      const c = toC[m[2].toLowerCase()](Number(m[1]))
      reply(`🌡️ ${fmtCalc(+c.toFixed(2))}°C = ${fmtCalc(+fromC.f(c).toFixed(2))}°F = ${fmtCalc(+fromC.k(c).toFixed(2))}K`)
    },
  },
  kindCmd('length', 'length', '5 km mi'),
  kindCmd('weight', 'weight', '70 kg lb'),
  kindCmd('volume', 'volume', '2 l cup'),
  kindCmd('speed', 'speed', '100 km/h mph'),
  kindCmd('area', 'area', '1 acre m2'),
  kindCmd('datasize', 'data', '1.5 gb mb'),
  kindCmd('timeunit', 'time', '3 day h'),
  {
    name: 'hex2rgb',
    desc: 'Hex colour → RGB',
    usage: '<#hex>',
    run: ({ reply, args }) => {
      let h = (args[0] || '').replace('#', '')
      if (h.length === 3) h = [...h].map((c) => c + c).join('')
      if (!/^[0-9a-f]{6}$/i.test(h)) return reply('Usage: !hex2rgb #ff8800')
      reply(`rgb(${[0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(', ')})`)
    },
  },
  {
    name: 'rgb2hex',
    desc: 'RGB → hex colour',
    usage: '<r> <g> <b>',
    run: ({ reply, args }) => {
      const v = args.join(' ').split(/[\s,]+/).map(Number)
      if (v.length !== 3 || !v.every((x) => Number.isInteger(x) && x >= 0 && x <= 255)) return reply('Usage: !rgb2hex 255 136 0')
      reply('#' + v.map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase())
    },
  },
  {
    name: 'epoch',
    aliases: ['timestamp', 'unix'],
    desc: 'Unix timestamp ↔ date (no arg = now)',
    usage: '[timestamp | YYYY-MM-DD]',
    run: ({ reply, args }) => {
      const a = args.join(' ')
      if (!a) return reply(`⏱️ Now: ${Math.floor(Date.now() / 1000)}`)
      if (/^\d+$/.test(a)) {
        const ms = a.length > 11 ? Number(a) : Number(a) * 1000
        return reply(new Date(ms).toUTCString())
      }
      const d = new Date(a)
      reply(isNaN(d) ? 'Usage: !epoch 1767225600  or  !epoch 2026-01-01' : String(Math.floor(d / 1000)))
    },
  },
  {
    name: 'shoesize',
    desc: 'Shoe size EU ↔ US (men) ↔ UK',
    usage: '<size> <eu|us|uk>',
    run: ({ reply, args }) => {
      const s = Number(args[0])
      const sys = args[1]?.toLowerCase()
      const eu = sys === 'eu' ? s : sys === 'us' ? s + 33 : sys === 'uk' ? s + 33.5 : NaN
      if (!Number.isFinite(eu)) return reply('Usage: !shoesize 42 eu')
      reply(`👟 EU ${eu} ≈ US ${(eu - 33).toFixed(1)} ≈ UK ${(eu - 33.5).toFixed(1)}`)
    },
  },
]
