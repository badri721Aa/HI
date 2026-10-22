'use strict';
/** Pure encode/decode functions (no Discord code) — easy to test in isolation. */

const bad = (msg) => Object.assign(new Error(msg), { userMessage: msg });
const utf8 = (s) => Buffer.from(String(s), 'utf8');

/** Bytes -> text; flags invalid UTF-8 so callers can show hex instead of mojibake. */
function bytesToText(buf) {
  const text = buf.toString('utf8');
  return { text, valid: Buffer.from(text, 'utf8').equals(buf) };
}

// ---------- base64 / base32 / base58 / ascii85 ----------
const base64 = (s) => utf8(s).toString('base64');
const base64url = (s) => utf8(s).toString('base64url');
function unbase64(s) {
  const clean = String(s).replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean) || !clean.length) throw bad('That is not valid Base64.');
  return Buffer.from(clean, 'base64');
}

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32(s) {
  const bytes = utf8(s);
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  while (out.length % 8) out += '=';
  return out;
}
function unbase32(s) {
  const clean = String(s).toUpperCase().replace(/\s+/g, '').replace(/=+$/, '');
  if (!/^[A-Z2-7]+$/.test(clean)) throw bad('That is not valid Base32 (A–Z and 2–7).');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function base58(s) {
  const bytes = utf8(s);
  if (!bytes.length) return '';
  let n = BigInt(`0x${bytes.toString('hex')}`);
  let out = '';
  while (n > 0n) {
    out = B58[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = `1${out}`;
  }
  return out;
}
function unbase58(s) {
  const clean = String(s).trim();
  if (!clean || [...clean].some((c) => !B58.includes(c))) throw bad('That is not valid Base58 (Bitcoin alphabet).');
  let n = 0n;
  for (const c of clean) n = n * 58n + BigInt(B58.indexOf(c));
  let hex = n === 0n ? '' : n.toString(16);
  if (hex.length % 2) hex = `0${hex}`;
  const lead = clean.match(/^1*/)[0].length;
  return Buffer.concat([Buffer.alloc(lead), Buffer.from(hex, 'hex')]);
}

function ascii85(s) {
  const bytes = utf8(s);
  let out = '';
  for (let i = 0; i < bytes.length; i += 4) {
    const chunk = [...bytes.subarray(i, i + 4)];
    const pad = 4 - chunk.length;
    while (chunk.length < 4) chunk.push(0);
    let v = ((chunk[0] << 24) | (chunk[1] << 16) | (chunk[2] << 8) | chunk[3]) >>> 0;
    if (v === 0 && pad === 0) {
      out += 'z';
      continue;
    }
    const enc = [];
    for (let j = 0; j < 5; j++) {
      enc.unshift(String.fromCharCode((v % 85) + 33));
      v = Math.floor(v / 85);
    }
    out += enc.join('').slice(0, 5 - pad);
  }
  return `<~${out}~>`;
}
function unascii85(s) {
  const clean = String(s).trim().replace(/^<~/, '').replace(/~>$/, '').replace(/\s+/g, '').replace(/z/g, '!!!!!');
  if ([...clean].some((c) => c.charCodeAt(0) < 33 || c.charCodeAt(0) > 117)) throw bad('That is not valid Ascii85.');
  const out = [];
  for (let i = 0; i < clean.length; i += 5) {
    const chunk = clean.slice(i, i + 5);
    const pad = 5 - chunk.length;
    const full = chunk + 'u'.repeat(pad);
    let v = 0;
    for (const c of full) v = v * 85 + (c.charCodeAt(0) - 33);
    if (v > 0xffffffff) throw bad('That is not valid Ascii85.');
    const bytes = [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
    out.push(...bytes.slice(0, 4 - pad));
  }
  return Buffer.from(out);
}

// ---------- byte-level number encodings ----------
const hex = (s) => utf8(s).toString('hex').replace(/(..)(?!$)/g, '$1 ');
function unhex(s) {
  const clean = String(s).replace(/0x/gi, '').replace(/[\s,:\\x-]/gi, '');
  if (!/^[0-9a-f]*$/i.test(clean) || !clean.length || clean.length % 2) throw bad('That is not valid hex (pairs of 0-9 / a-f).');
  return Buffer.from(clean, 'hex');
}
const binary = (s) => [...utf8(s)].map((b) => b.toString(2).padStart(8, '0')).join(' ');
function unbinary(s) {
  const str = String(s).trim();
  if (!/^[01\s]+$/.test(str)) throw bad('Binary can only contain 0, 1 and spaces.');
  const groups = /\s/.test(str) ? str.split(/\s+/) : str.match(/.{1,8}/g);
  if (groups.some((g) => g.length > 8)) throw bad('Each byte must be at most 8 bits.');
  return Buffer.from(groups.map((g) => parseInt(g, 2)));
}
const octal = (s) => [...utf8(s)].map((b) => b.toString(8).padStart(3, '0')).join(' ');
function unoctal(s) {
  const groups = String(s).trim().split(/[\s,]+/);
  if (groups.some((g) => !/^[0-7]{1,3}$/.test(g) || parseInt(g, 8) > 255)) throw bad('Octal bytes must be 0–377, separated by spaces.');
  return Buffer.from(groups.map((g) => parseInt(g, 8)));
}
const charcodes = (s) => Array.from(String(s), (c) => c.codePointAt(0)).join(' ');
function uncharcodes(s) {
  const parts = String(s).trim().split(/[\s,;]+/);
  if (parts.some((p) => !/^\d+$/.test(p) || Number(p) > 0x10ffff)) throw bad('Give decimal code points (0–1114111) separated by spaces.');
  return String.fromCodePoint(...parts.map(Number));
}

// ---------- web ----------
const urlencode = (s) => encodeURIComponent(s);
function urldecode(s) {
  try {
    return decodeURIComponent(String(s).replace(/\+/g, ' '));
  } catch {
    throw bad('That contains an invalid %-escape.');
  }
}
const HTML_ENC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const htmlencode = (s) => String(s).replace(/[&<>"']/g, (c) => HTML_ENC[c]);
const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®', trade: '™', hellip: '…', mdash: '—', ndash: '–',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', euro: '€', pound: '£', yen: '¥', cent: '¢', deg: '°', times: '×', divide: '÷',
  laquo: '«', raquo: '»', bull: '•', middot: '·', para: '¶', sect: '§', plusmn: '±', micro: 'µ', frac12: '½', frac14: '¼', frac34: '¾',
  larr: '←', rarr: '→', uarr: '↑', darr: '↓', hearts: '♥', spades: '♠', clubs: '♣', diams: '♦', iexcl: '¡', iquest: '¿', shy: '­',
};
const htmldecode = (s) =>
  String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, e) => {
    if (e[0] === '#') {
      const cp = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });

function unicodeEscape(s) {
  return Array.from(String(s), (c) => {
    const cp = c.codePointAt(0);
    return cp > 0xffff ? `\\u{${cp.toString(16).toUpperCase()}}` : `\\u${cp.toString(16).toUpperCase().padStart(4, '0')}`;
  }).join('');
}
function unicodeUnescape(s) {
  const simple = { n: '\n', t: '\t', r: '\r', '0': '\0', '\\': '\\', '"': '"', "'": "'" };
  return String(s).replace(/\\u\{([0-9a-f]{1,6})\}|\\u([0-9a-f]{4})|\\x([0-9a-f]{2})|\\([ntr0\\"'])/gi, (m, a, b, c, d) => {
    if (a) {
      const cp = parseInt(a, 16);
      return cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    }
    if (b) return String.fromCharCode(parseInt(b, 16));
    if (c) return String.fromCharCode(parseInt(c, 16));
    return simple[d];
  });
}

// ---------- classic ciphers ----------
function shiftLetters(s, shift) {
  const k = ((shift % 26) + 26) % 26;
  return String(s).replace(/[a-z]/gi, (c) => {
    const base = c <= 'Z' ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + k) % 26) + base);
  });
}
const rot13 = (s) => shiftLetters(s, 13);
const rot47 = (s) => String(s).replace(/[!-~]/g, (c) => String.fromCharCode(33 + ((c.charCodeAt(0) - 33 + 47) % 94)));
const atbash = (s) =>
  String(s).replace(/[a-z]/gi, (c) => {
    const base = c <= 'Z' ? 65 : 97;
    return String.fromCharCode(base + 25 - (c.charCodeAt(0) - base));
  });

function vigenere(s, key, decrypt = false) {
  const k = String(key).toLowerCase().replace(/[^a-z]/g, '');
  if (!k) throw bad('The key must contain letters.');
  let i = 0;
  return String(s).replace(/[a-z]/gi, (c) => {
    const base = c <= 'Z' ? 65 : 97;
    const shift = k.charCodeAt(i++ % k.length) - 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + (decrypt ? 26 - shift : shift)) % 26) + base);
  });
}

const a1z26 = (s) =>
  String(s)
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => [...w].filter((c) => /[a-z]/.test(c)).map((c) => c.charCodeAt(0) - 96).join('-'))
    .filter(Boolean)
    .join(' ');
function una1z26(s) {
  const words = String(s).trim().split(/\s+/);
  return words
    .map((w) =>
      w
        .split(/[-,.]/)
        .filter(Boolean)
        .map((n) => {
          const v = Number(n);
          if (!Number.isInteger(v) || v < 1 || v > 26) throw bad(`"${n}" is not a number from 1 to 26.`);
          return String.fromCharCode(96 + v);
        })
        .join(''),
    )
    .join(' ');
}

const bacon = (s) =>
  String(s)
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => [...w].filter((c) => /[a-z]/.test(c)).map((c) => (c.charCodeAt(0) - 97).toString(2).padStart(5, '0').replace(/0/g, 'A').replace(/1/g, 'B')).join(' '))
    .filter(Boolean)
    .join(' / ');
function unbacon(s) {
  return String(s)
    .toUpperCase()
    .split('/')
    .map((w) => {
      const letters = w.replace(/[^AB]/g, '');
      if (letters.length % 5) throw bad('Bacon code must be groups of 5 A/B letters.');
      return (letters.match(/.{5}/g) || []).map((g) => String.fromCharCode(97 + parseInt(g.replace(/A/g, '0').replace(/B/g, '1'), 2))).join('');
    })
    .join(' ')
    .trim();
}

function railfence(s, rails, decrypt = false) {
  const text = Array.from(String(s));
  const n = text.length;
  if (rails < 2 || rails >= n) return text.join('');
  const pattern = [];
  let r = 0;
  let dir = 1;
  for (let i = 0; i < n; i++) {
    pattern.push(r);
    if (r === 0) dir = 1;
    else if (r === rails - 1) dir = -1;
    r += dir;
  }
  const order = [...pattern.keys()].sort((a, b) => pattern[a] - pattern[b] || a - b);
  if (!decrypt) return order.map((i) => text[i]).join('');
  const out = new Array(n);
  order.forEach((pos, k) => (out[pos] = text[k]));
  return out.join('');
}

const POLY = 'ABCDEFGHIKLMNOPQRSTUVWXYZ';
const polybius = (s) =>
  String(s)
    .toUpperCase()
    .replace(/J/g, 'I')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) =>
      [...w]
        .filter((c) => POLY.includes(c))
        .map((c) => {
          const i = POLY.indexOf(c);
          return `${Math.floor(i / 5) + 1}${(i % 5) + 1}`;
        })
        .join(' '),
    )
    .filter(Boolean)
    .join(' / ');
function unpolybius(s) {
  return String(s)
    .split('/')
    .map((w) => {
      const digits = w.replace(/\D/g, '');
      if (digits.length % 2 || /[06-9]/.test(digits)) throw bad('Polybius code is pairs of digits 1–5.');
      return (digits.match(/../g) || []).map((p) => POLY[(Number(p[0]) - 1) * 5 + (Number(p[1]) - 1)]).join('');
    })
    .join(' ')
    .toLowerCase();
}

function xorHex(s, key) {
  const k = utf8(key);
  if (!k.length) throw bad('The key cannot be empty.');
  return Buffer.from([...utf8(s)].map((b, i) => b ^ k[i % k.length])).toString('hex');
}
function unxorHex(h, key) {
  const k = utf8(key);
  if (!k.length) throw bad('The key cannot be empty.');
  return Buffer.from([...unhex(h)].map((b, i) => b ^ k[i % k.length]));
}

// ---------- morse / nato / braille / keypad ----------
const MORSE = {
  a: '.-', b: '-...', c: '-.-.', d: '-..', e: '.', f: '..-.', g: '--.', h: '....', i: '..', j: '.---', k: '-.-', l: '.-..', m: '--',
  n: '-.', o: '---', p: '.--.', q: '--.-', r: '.-.', s: '...', t: '-', u: '..-', v: '...-', w: '.--', x: '-..-', y: '-.--', z: '--..',
  0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.',
  '.': '.-.-.-', ',': '--..--', '?': '..--..', "'": '.----.', '!': '-.-.--', '/': '-..-.', '(': '-.--.', ')': '-.--.-', '&': '.-...',
  ':': '---...', ';': '-.-.-.', '=': '-...-', '+': '.-.-.', '-': '-....-', _: '..--.-', '"': '.-..-.', $: '...-..-', '@': '.--.-.',
};
const MORSE_REV = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]));
const morse = (s) =>
  String(s)
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => [...w].map((c) => MORSE[c]).filter(Boolean).join(' '))
    .filter(Boolean)
    .join(' / ');
function unmorse(s) {
  const norm = String(s).replace(/[•·]/g, '.').replace(/[—–_−]/g, '-').trim();
  if (!/^[.\-\s/|]+$/.test(norm)) throw bad('Morse code can only contain . - spaces and / between words.');
  return norm
    .split(/\s*[/|]\s*|\s{3,}/)
    .map((w) => w.split(/\s+/).filter(Boolean).map((code) => MORSE_REV[code] ?? '�').join(''))
    .join(' ')
    .toUpperCase();
}

const NATO = {
  a: 'Alfa', b: 'Bravo', c: 'Charlie', d: 'Delta', e: 'Echo', f: 'Foxtrot', g: 'Golf', h: 'Hotel', i: 'India', j: 'Juliett', k: 'Kilo', l: 'Lima',
  m: 'Mike', n: 'November', o: 'Oscar', p: 'Papa', q: 'Quebec', r: 'Romeo', s: 'Sierra', t: 'Tango', u: 'Uniform', v: 'Victor', w: 'Whiskey',
  x: 'X-ray', y: 'Yankee', z: 'Zulu', 0: 'Zero', 1: 'One', 2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six', 7: 'Seven', 8: 'Eight', 9: 'Niner',
};
const NATO_REV = Object.fromEntries([...Object.entries(NATO).map(([k, v]) => [v.toLowerCase(), k]), ['alpha', 'a'], ['juliet', 'j'], ['xray', 'x'], ['nine', '9']]);
const nato = (s) =>
  String(s)
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => [...w].map((c) => NATO[c]).filter(Boolean).join(' '))
    .filter(Boolean)
    .join(' / ');
const unnato = (s) =>
  String(s)
    .split(/\s*\/\s*/)
    .map((w) => w.split(/\s+/).filter(Boolean).map((x) => NATO_REV[x.toLowerCase()] ?? '?').join(''))
    .join(' ')
    .toUpperCase();

// Grade-1 braille. Digits use the number sign ⠼ followed by a–j.
const BRAILLE = {
  a: '⠁', b: '⠃', c: '⠉', d: '⠙', e: '⠑', f: '⠋', g: '⠛', h: '⠓', i: '⠊', j: '⠚', k: '⠅', l: '⠇', m: '⠍', n: '⠝', o: '⠕', p: '⠏',
  q: '⠟', r: '⠗', s: '⠎', t: '⠞', u: '⠥', v: '⠧', w: '⠺', x: '⠭', y: '⠽', z: '⠵', ' ': '⠀', ',': '⠂', ';': '⠆', ':': '⠒', '.': '⠲',
  '!': '⠖', '?': '⠦', "'": '⠄', '-': '⠤', '(': '⠐⠣', ')': '⠐⠜', '/': '⠸⠌',
};
const DIGIT_LETTER = 'jabcdefghi';
function braille(s) {
  let out = '';
  let inNumber = false;
  for (const c of String(s).toLowerCase()) {
    if (/\d/.test(c)) {
      if (!inNumber) out += '⠼';
      inNumber = true;
      out += BRAILLE[DIGIT_LETTER[Number(c)]];
      continue;
    }
    if (inNumber && /[a-j]/.test(c)) out += '⠰'; // letter sign so a–j after digits stays a letter
    inNumber = false;
    out += BRAILLE[c] ?? (c === '\n' ? '\n' : '');
  }
  return out;
}
const BRAILLE_REV = Object.fromEntries(Object.entries(BRAILLE).filter(([, v]) => v.length === 1).map(([k, v]) => [v, k]));
function unbraille(s) {
  let out = '';
  let inNumber = false;
  const chars = Array.from(String(s));
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    const pair = c + (chars[i + 1] || '');
    if (pair === '⠐⠣' || pair === '⠐⠜' || pair === '⠸⠌') {
      out += pair === '⠐⠣' ? '(' : pair === '⠐⠜' ? ')' : '/';
      i++;
      inNumber = false;
      continue;
    }
    if (c === '⠼') {
      inNumber = true;
      continue;
    }
    if (c === '⠰') {
      inNumber = false;
      continue;
    }
    const letter = BRAILLE_REV[c];
    if (letter === undefined) {
      out += c === '\n' || c === ' ' ? c : '';
      inNumber = false;
      continue;
    }
    if (inNumber && DIGIT_LETTER.includes(letter)) out += String(DIGIT_LETTER.indexOf(letter));
    else {
      if (letter === ' ') inNumber = false;
      out += letter;
    }
  }
  return out;
}

const KEYPAD = { a: '2', b: '22', c: '222', d: '3', e: '33', f: '333', g: '4', h: '44', i: '444', j: '5', k: '55', l: '555', m: '6', n: '66', o: '666', p: '7', q: '77', r: '777', s: '7777', t: '8', u: '88', v: '888', w: '9', x: '99', y: '999', z: '9999', ' ': '0' };
const KEYPAD_REV = Object.fromEntries(Object.entries(KEYPAD).map(([k, v]) => [v, k]));
const multitap = (s) => [...String(s).toLowerCase()].map((c) => KEYPAD[c] ?? (/\d/.test(c) ? c : '')).filter(Boolean).join(' ');
const unmultitap = (s) =>
  String(s)
    .trim()
    .split(/\s+/)
    .map((g) => KEYPAD_REV[g] ?? '?')
    .join('');

// ---------- checksums ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(s) {
  let c = 0xffffffff;
  for (const b of utf8(s)) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return ((c ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0');
}
function adler32(s) {
  let a = 1;
  let b = 0;
  for (const byte of utf8(s)) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return (((b << 16) | a) >>> 0).toString(16).padStart(8, '0');
}
function fnv1a(s) {
  let h = 0x811c9dc5;
  for (const byte of utf8(s)) {
    h ^= byte;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function entropy(s) {
  const chars = Array.from(String(s));
  const counts = new Map();
  for (const c of chars) counts.set(c, (counts.get(c) || 0) + 1);
  let h = 0;
  for (const n of counts.values()) {
    const p = n / chars.length;
    h -= p * Math.log2(p);
  }
  return { perChar: h, total: h * chars.length, unique: counts.size, length: chars.length };
}

module.exports = {
  bad, utf8, bytesToText,
  base64, base64url, unbase64, base32, unbase32, base58, unbase58, ascii85, unascii85,
  hex, unhex, binary, unbinary, octal, unoctal, charcodes, uncharcodes,
  urlencode, urldecode, htmlencode, htmldecode, unicodeEscape, unicodeUnescape,
  shiftLetters, rot13, rot47, atbash, vigenere, a1z26, una1z26, bacon, unbacon, railfence, polybius, unpolybius, xorHex, unxorHex,
  morse, unmorse, nato, unnato, braille, unbraille, multitap, unmultitap,
  crc32, adler32, fnv1a, entropy,
};
