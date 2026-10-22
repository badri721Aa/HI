'use strict';
/**
 * Safe math expression evaluator — a tokenizer plus a Pratt parser. No eval/Function/vm.
 *
 *   evaluate('2(3+4)^2 - sqrt(16) + 5!')           -> 214
 *   evaluate('sin(30)', { degrees: true })          -> 0.5
 *
 * Operators: + - * / % ^ (also **), unary +/-, postfix ! (factorial), implicit
 * multiplication (2pi, 3(4+1), (1+2)(3+4)). Functions may be called with or
 * without parentheses: "sqrt 16". Constants: pi π e tau τ phi φ.
 */

const MAX_TOKENS = 500;
const MAX_DEPTH = 120;

class MathError extends Error {
  constructor(msg) {
    super(msg);
    this.userMessage = msg;
  }
}

/** Gamma function: Stirling series after shifting x up to >= 15 (relative error ~1e-13). */
function gamma(z) {
  if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
  let shift = 1;
  let x = z;
  while (x < 15) {
    shift *= x;
    x += 1;
  }
  const lg = (x - 0.5) * Math.log(x) - x + 0.5 * Math.log(2 * Math.PI) + 1 / (12 * x) - 1 / (360 * x ** 3) + 1 / (1260 * x ** 5) - 1 / (1680 * x ** 7);
  return Math.exp(lg) / shift;
}

function factorial(n) {
  if (n < 0 && Number.isInteger(n)) throw new MathError('Factorial is undefined for negative integers.');
  if (n > 170) throw new MathError('That factorial is too large (max 170!).');
  if (Number.isInteger(n)) {
    let r = 1;
    for (let i = 2; i <= n; i++) r *= i;
    return r;
  }
  return gamma(n + 1);
}

function gcd(a, b) {
  if (!Number.isInteger(a) || !Number.isInteger(b)) throw new MathError('gcd/lcm need whole numbers.');
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}
const lcm = (a, b) => (a === 0 || b === 0 ? 0 : Math.abs(a * b) / gcd(a, b));
function ncr(n, r) {
  if (!Number.isInteger(n) || !Number.isInteger(r) || n < 0 || r < 0) throw new MathError('nCr needs non-negative whole numbers.');
  if (r > n) return 0;
  r = Math.min(r, n - r);
  let res = 1;
  for (let i = 1; i <= r; i++) res = (res * (n - r + i)) / i;
  return Math.round(res);
}
function npr(n, r) {
  if (!Number.isInteger(n) || !Number.isInteger(r) || n < 0 || r < 0) throw new MathError('nPr needs non-negative whole numbers.');
  if (r > n) return 0;
  let res = 1;
  for (let i = 0; i < r; i++) res *= n - i;
  return res;
}

const CONSTANTS = { pi: Math.PI, 'π': Math.PI, e: Math.E, tau: 2 * Math.PI, 'τ': 2 * Math.PI, phi: (1 + Math.sqrt(5)) / 2, 'φ': (1 + Math.sqrt(5)) / 2 };

/** Snap float noise (cos 90° = 6e-17) to clean values. */
const clean = (x) => (Math.abs(x) < 1e-12 ? 0 : Math.abs(x - Math.round(x)) < 1e-12 ? Math.round(x) : x);

function makeFunctions(degrees) {
  const toRad = (x) => (degrees ? (x * Math.PI) / 180 : x);
  const fromRad = (x) => (degrees ? (x * 180) / Math.PI : x);
  const trig = (fn) => (x) => clean(fn(toRad(x)));
  const tan = (x) => {
    const c = Math.cos(toRad(x));
    if (Math.abs(c) < 1e-12) throw new MathError('tan is undefined there (cos = 0).');
    return clean(Math.tan(toRad(x)));
  };
  const recip = (fn, name) => (x) => {
    const v = clean(fn(toRad(x)));
    if (v === 0) throw new MathError(`${name} is undefined there.`);
    return clean(1 / v);
  };
  const domain = (fn, test, msg) => (x) => {
    if (!test(x)) throw new MathError(msg);
    return fn(x);
  };
  return {
    sin: [1, trig(Math.sin)],
    cos: [1, trig(Math.cos)],
    tan: [1, tan],
    sec: [1, recip(Math.cos, 'sec')],
    csc: [1, recip(Math.sin, 'csc')],
    cot: [1, recip(Math.tan, 'cot')],
    asin: [1, domain((x) => clean(fromRad(Math.asin(x))), (x) => x >= -1 && x <= 1, 'asin needs a value from -1 to 1.')],
    acos: [1, domain((x) => clean(fromRad(Math.acos(x))), (x) => x >= -1 && x <= 1, 'acos needs a value from -1 to 1.')],
    atan: [1, (x) => clean(fromRad(Math.atan(x)))],
    atan2: [2, (y, x) => clean(fromRad(Math.atan2(y, x)))],
    sinh: [1, Math.sinh],
    cosh: [1, Math.cosh],
    tanh: [1, Math.tanh],
    asinh: [1, Math.asinh],
    acosh: [1, domain(Math.acosh, (x) => x >= 1, 'acosh needs a value ≥ 1.')],
    atanh: [1, domain(Math.atanh, (x) => x > -1 && x < 1, 'atanh needs a value between -1 and 1.')],
    sqrt: [1, domain(Math.sqrt, (x) => x >= 0, 'Square root of a negative number is not a real number.')],
    cbrt: [1, Math.cbrt],
    abs: [1, Math.abs],
    sign: [1, Math.sign],
    ln: [1, domain(Math.log, (x) => x > 0, 'Logarithms need a positive number.')],
    log: [[1, 2], (x, b) => {
      if (x <= 0 || (b !== undefined && (b <= 0 || b === 1))) throw new MathError('Logarithms need a positive number (and a base > 0, ≠ 1).');
      return clean(b === undefined ? Math.log10(x) : Math.log(x) / Math.log(b));
    }],
    log10: [1, domain(Math.log10, (x) => x > 0, 'Logarithms need a positive number.')],
    log2: [1, domain(Math.log2, (x) => x > 0, 'Logarithms need a positive number.')],
    exp: [1, Math.exp],
    floor: [1, Math.floor],
    ceil: [1, Math.ceil],
    trunc: [1, Math.trunc],
    round: [[1, 2], (x, d = 0) => {
      const f = 10 ** Math.max(0, Math.min(15, Math.trunc(d)));
      return Math.round(x * f) / f;
    }],
    min: [[1, 100], (...a) => Math.min(...a)],
    max: [[1, 100], (...a) => Math.max(...a)],
    avg: [[1, 100], (...a) => a.reduce((s, x) => s + x, 0) / a.length],
    mean: [[1, 100], (...a) => a.reduce((s, x) => s + x, 0) / a.length],
    sum: [[1, 100], (...a) => a.reduce((s, x) => s + x, 0)],
    pow: [2, (a, b) => a ** b],
    hypot: [[1, 100], Math.hypot],
    mod: [2, (a, b) => {
      if (b === 0) throw new MathError('Modulo by zero is undefined.');
      return ((a % b) + b) % b;
    }],
    fact: [1, factorial],
    factorial: [1, factorial],
    gamma: [1, gamma],
    gcd: [2, gcd],
    lcm: [2, lcm],
    ncr: [2, ncr],
    npr: [2, npr],
    rad: [1, (x) => (x * Math.PI) / 180],
    deg: [1, (x) => (x * 180) / Math.PI],
  };
}

function tokenize(input) {
  const src = String(input)
    .replace(/[×·]/g, '*')
    .replace(/÷/g, '/')
    .replace(/[−–]/g, '-')
    .replace(/\*\*/g, '^')
    .replace(/(\d),(?=\d{3}\b)/g, '$1'); // allow 1,000,000
  const tokens = [];
  const re = /\s*(?:(0x[0-9a-f]+|0b[01]+|0o[0-7]+)|(\d+\.?\d*(?:e[+-]?\d+)?|\.\d+(?:e[+-]?\d+)?)|([a-zπτφ_][a-z0-9_]*)|([-+*/^%!(),]))/iy;
  let pos = 0;
  while (pos < src.length) {
    if (/^\s+$/.test(src.slice(pos))) break;
    re.lastIndex = pos;
    const m = re.exec(src);
    if (!m) throw new MathError(`I don't understand "${src.slice(pos).trim().slice(0, 10)}".`);
    pos = re.lastIndex;
    if (m[1]) {
      const p = m[1].slice(0, 2).toLowerCase();
      tokens.push({ type: 'num', value: parseInt(m[1].slice(2), p === '0x' ? 16 : p === '0b' ? 2 : 8) });
    } else if (m[2]) tokens.push({ type: 'num', value: parseFloat(m[2]) });
    else if (m[3]) tokens.push({ type: 'id', value: m[3].toLowerCase() });
    else tokens.push({ type: 'op', value: m[4] });
    if (tokens.length > MAX_TOKENS) throw new MathError('That expression is too long.');
  }
  return tokens;
}

function evaluate(input, { degrees = false } = {}) {
  const tokens = tokenize(input);
  if (!tokens.length) throw new MathError('Give me something to calculate.');
  const FN = makeFunctions(degrees);
  let i = 0;
  let depth = 0;
  const peek = () => tokens[i];
  const next = () => tokens[i++];
  const isOp = (t, v) => t && t.type === 'op' && t.value === v;

  const BP = { '+': 10, '-': 10, '*': 20, '/': 20, '%': 20, '^': 40 };

  function callFunction(name) {
    const [arity, fn] = FN[name];
    const [lo, hi] = Array.isArray(arity) ? arity : [arity, arity];
    let args;
    if (isOp(peek(), '(')) {
      next();
      args = [];
      if (!isOp(peek(), ')')) {
        args.push(parse(0));
        while (isOp(peek(), ',')) {
          next();
          args.push(parse(0));
        }
      }
      if (!isOp(next(), ')')) throw new MathError(`Missing ")" after ${name}(…`);
    } else {
      args = [parse(30)]; // "sqrt 16" style
    }
    if (args.length < lo || args.length > hi) throw new MathError(`${name}() takes ${lo === hi ? lo : `${lo}–${hi}`} argument(s).`);
    return fn(...args);
  }

  function nud(t) {
    if (!t) throw new MathError('The expression ended unexpectedly.');
    if (t.type === 'num') return t.value;
    if (t.type === 'id') {
      if (Object.hasOwn(CONSTANTS, t.value)) return CONSTANTS[t.value];
      if (Object.hasOwn(FN, t.value)) return callFunction(t.value);
      throw new MathError(`Unknown name "${t.value}".`);
    }
    if (t.value === '(') {
      const v = parse(0);
      if (!isOp(next(), ')')) throw new MathError('Missing a closing ")".');
      return v;
    }
    if (t.value === '-') return -parse(30);
    if (t.value === '+') return parse(30);
    throw new MathError(`Unexpected "${t.value}".`);
  }

  function parse(rbp) {
    if (++depth > MAX_DEPTH) throw new MathError('That expression is nested too deeply.');
    let left = nud(next());
    for (;;) {
      const t = peek();
      if (!t) break;
      if (isOp(t, '!')) {
        next();
        left = factorial(left);
        continue;
      }
      // implicit multiplication: 2pi, 2(3), (1)(2), 3sqrt(4)
      if (t.type === 'id' || isOp(t, '(')) {
        if (20 <= rbp) break;
        left *= parse(20);
        continue;
      }
      if (t.type === 'num') throw new MathError('Two numbers in a row — did you forget an operator?');
      const bp = BP[t.value];
      if (bp === undefined || bp <= rbp) break;
      next();
      const right = parse(t.value === '^' ? bp - 1 : bp); // ^ is right-associative
      switch (t.value) {
        case '+': left += right; break;
        case '-': left -= right; break;
        case '*': left *= right; break;
        case '/':
          if (right === 0) throw new MathError('Division by zero is undefined.');
          left /= right;
          break;
        case '%':
          if (right === 0) throw new MathError('Modulo by zero is undefined.');
          left %= right;
          break;
        case '^':
          if (left < 0 && !Number.isInteger(right)) throw new MathError('A negative number to a fractional power is not a real number.');
          left **= right;
          break;
        default:
          break;
      }
    }
    depth--;
    return left;
  }

  const result = parse(0);
  if (i < tokens.length) throw new MathError(`Unexpected "${tokens[i].value}".`);
  if (Number.isNaN(result)) throw new MathError('The result is undefined.');
  if (!Number.isFinite(result)) throw new MathError('The result is too large to show.');
  return clean(result);
}

module.exports = { evaluate, MathError, factorial, gamma, gcd, lcm, ncr, npr, CONSTANTS };
