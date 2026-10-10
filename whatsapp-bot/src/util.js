export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]
export const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min
export const shuffle = (arr) => {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
export const num = (jid = '') => jid.split('@')[0].split(':')[0]
export const tag = (jid) => `@${num(jid)}`
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
export const fmtNum = (n) => Number(n).toLocaleString('en-US')

// "10m", "2h30m", "1d", "45s", "90" (minutes) → milliseconds
export function parseDuration(s = '') {
  if (/^\d+$/.test(s)) return Number(s) * 60_000
  const units = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 }
  let total = 0
  const re = /(\d+(?:\.\d+)?)\s*([smhdw])/gi
  let m, matched = ''
  while ((m = re.exec(s))) {
    total += parseFloat(m[1]) * units[m[2].toLowerCase()]
    matched += m[0]
  }
  return matched.replace(/\s/g, '').length === s.replace(/\s/g, '').length && total > 0 ? total : null
}

export function fmtDuration(ms) {
  const s = Math.max(0, Math.round(ms / 1000))
  const parts = [[Math.floor(s / 86400), 'd'], [Math.floor((s % 86400) / 3600), 'h'], [Math.floor((s % 3600) / 60), 'm'], [s % 60, 's']]
  return parts.filter(([v]) => v).map(([v, u]) => v + u).join(' ') || '0s'
}

// Safe arithmetic evaluator (no eval). Supports + - * / % ^ ( ), unary minus, constants and functions.
export function calc(expr) {
  const src = expr.toLowerCase().replace(/×/g, '*').replace(/÷/g, '/').replace(/\*\*/g, '^').replace(/\s+/g, '')
  const fns = { sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, sin: Math.sin, cos: Math.cos, tan: Math.tan, log: Math.log10, ln: Math.log, round: Math.round, floor: Math.floor, ceil: Math.ceil, exp: Math.exp }
  const consts = { pi: Math.PI, e: Math.E }
  let i = 0
  const peek = () => src[i]
  const expect = (c) => {
    if (src[i] !== c) throw new Error(`expected ${c}`)
    i++
  }
  function expression() {
    let v = term()
    while (peek() === '+' || peek() === '-') v = src[i++] === '+' ? v + term() : v - term()
    return v
  }
  function term() {
    let v = factor()
    while (peek() === '*' || peek() === '/' || peek() === '%') {
      const op = src[i++]
      const r = factor()
      v = op === '*' ? v * r : op === '/' ? v / r : v % r
    }
    return v
  }
  function factor() {
    const base = unary()
    if (peek() === '^') {
      i++
      return base ** factor()
    }
    return base
  }
  function unary() {
    if (peek() === '-') { i++; return -unary() }
    if (peek() === '+') { i++; return unary() }
    return postfix(primary())
  }
  function postfix(v) {
    while (peek() === '!') {
      i++
      if (v < 0 || v > 170 || !Number.isInteger(v)) throw new Error('bad factorial')
      let f = 1
      for (let k = 2; k <= v; k++) f *= k
      v = f
    }
    return v
  }
  function primary() {
    if (peek() === '(') {
      i++
      const v = expression()
      expect(')')
      return v
    }
    const n = /^\d*\.?\d+(e[+-]?\d+)?/.exec(src.slice(i))
    if (n) {
      i += n[0].length
      return parseFloat(n[0])
    }
    const id = /^[a-z]+/.exec(src.slice(i))
    if (id) {
      i += id[0].length
      if (id[0] in consts) return consts[id[0]]
      if (id[0] in fns) {
        expect('(')
        const v = expression()
        expect(')')
        return fns[id[0]](v)
      }
      throw new Error(`unknown ${id[0]}`)
    }
    throw new Error('syntax')
  }
  const v = expression()
  if (i !== src.length) throw new Error('syntax')
  return v
}

export const fmtCalc = (v) => (Number.isFinite(v) ? String(+v.toPrecision(12)) : 'undefined')

export function progressBar(ratio, len = 10) {
  const n = Math.max(0, Math.min(len, Math.round(ratio * len)))
  return '█'.repeat(n) + '░'.repeat(len - n)
}
