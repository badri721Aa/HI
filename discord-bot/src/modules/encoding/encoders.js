'use strict';
const c = require('./_codecs');
const { sendText, fence, NO_PINGS } = require('../text/_lib');

/** Show decoded bytes as text, or as hex if they aren't valid UTF-8. */
function sendDecoded(ctx, out) {
  if (!Buffer.isBuffer(out)) return sendText(ctx, out, { code: true });
  const { text, valid } = c.bytesToText(out);
  if (valid) return sendText(ctx, text, { code: true });
  return sendText(ctx, out.toString('hex').replace(/(..)(?!$)/g, '$1 '), { code: true, prefix: '⚠️ The decoded bytes are not valid UTF-8 text, so here they are as hex:' });
}

/** Simple encoder/decoder command: whole text in, result in a code block out. */
function codec(name, description, fn, { aliases = [], examples = ['Hello World'], decode = false, usage = '<text>' } = {}) {
  return {
    name,
    aliases,
    description,
    usage,
    examples,
    minArgs: 1,
    cooldown: 1,
    async execute(ctx) {
      const out = fn(ctx.rest(0));
      return decode ? sendDecoded(ctx, out) : sendText(ctx, out, { code: true });
    },
  };
}

/** "<number> <text>" commands (caesar, railfence). */
function keyed(name, description, usage, examples, parseKey, fn, { aliases = [], decode = false } = {}) {
  return {
    name,
    aliases,
    description,
    usage,
    examples,
    minArgs: 2,
    cooldown: 1,
    async execute(ctx) {
      const key = parseKey(ctx.args[0]);
      if (key === null) return ctx.usage('That key is not valid.');
      const out = fn(ctx.rest(1), key);
      return decode ? sendDecoded(ctx, out) : sendText(ctx, out, { code: true });
    },
  };
}

const intKey = (min, max) => (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};
const strKey = (v) => (v ? String(v) : null);

module.exports = [
  codec('base64', 'Encode text to Base64', c.base64, { aliases: ['b64', 'btoa'] }),
  codec('unbase64', 'Decode Base64 (or Base64URL) to text', c.unbase64, { aliases: ['b64decode', 'atob', 'debase64'], examples: ['SGVsbG8gV29ybGQ='], decode: true }),
  codec('base64url', 'Encode text to URL-safe Base64 (no padding)', c.base64url, { aliases: ['b64url'] }),
  codec('base32', 'Encode text to Base32 (RFC 4648)', c.base32, { aliases: ['b32'] }),
  codec('unbase32', 'Decode Base32 to text', c.unbase32, { aliases: ['b32decode'], examples: ['JBSWY3DPEBLW64TMMQ======'], decode: true }),
  codec('base58', 'Encode text to Base58 (Bitcoin alphabet)', c.base58, { aliases: ['b58'] }),
  codec('unbase58', 'Decode Base58 (Bitcoin alphabet) to text', c.unbase58, { aliases: ['b58decode'], examples: ['JxF12TrwUP45BMd'], decode: true }),
  codec('ascii85', 'Encode text to Ascii85 / Base85', c.ascii85, { aliases: ['base85', 'a85'] }),
  codec('unascii85', 'Decode Ascii85 / Base85 to text', c.unascii85, { aliases: ['unbase85', 'a85decode'], examples: ['<~87cURD]i,"Ebo80~>'], decode: true }),
  codec('hex', 'Encode text to hexadecimal bytes', c.hex, { aliases: ['tohex', 'texttohex'] }),
  codec('unhex', 'Decode hexadecimal bytes to text', c.unhex, { aliases: ['fromhex', 'hextotext'], examples: ['48 65 6c 6c 6f', '0x48656c6c6f'], decode: true }),
  codec('binary', 'Encode text to binary (8 bits per byte)', c.binary, { aliases: ['tobinary', 'texttobinary'], examples: ['Hi'] }),
  codec('unbinary', 'Decode binary to text', c.unbinary, { aliases: ['frombinary', 'binarytotext'], examples: ['01001000 01101001', '0100100001101001'], decode: true }),
  codec('octal', 'Encode text to octal bytes', c.octal, { aliases: ['tooctal'], examples: ['Hi!'] }),
  codec('unoctal', 'Decode octal bytes to text', c.unoctal, { aliases: ['fromoctal'], examples: ['110 151 041'], decode: true }),
  codec('charcodes', 'Show the Unicode code point (decimal) of every character', c.charcodes, { aliases: ['ascii', 'tocodes'], examples: ['Hi 😀'] }),
  codec('uncharcodes', 'Turn decimal code points back into text', c.uncharcodes, { aliases: ['fromcodes'], examples: ['72 105 32 128512'] }),
  codec('urlencode', 'Percent-encode text for URLs', c.urlencode, { aliases: ['encodeurl'], examples: ['hello world & friends?'] }),
  codec('urldecode', 'Decode percent-encoded URL text', c.urldecode, { aliases: ['decodeurl'], examples: ['hello%20world%20%26%20friends%3F'] }),
  codec('htmlencode', 'Escape text for HTML (&, <, >, quotes)', c.htmlencode, { aliases: ['htmlescape'], examples: ['<b>"Tom" & \'Jerry\'</b>'] }),
  codec('htmldecode', 'Decode HTML entities like &amp; &lt; &#x1F600;', c.htmldecode, { aliases: ['htmlunescape'], examples: ['&lt;b&gt;Tom &amp; Jerry&lt;/b&gt; &copy; &#x1F600;'] }),
  codec('unicodeescape', 'Escape text as \\uXXXX sequences', c.unicodeEscape, { aliases: ['uescape'], examples: ['Héllo 😀'] }),
  codec('unicodeunescape', 'Turn \\uXXXX / \\u{...} / \\xXX escapes back into text', c.unicodeUnescape, { aliases: ['uunescape'], examples: ['H\\u00E9llo \\u{1F600}\\n\\x41'] }),
  codec('rot13', 'ROT13 (apply again to decode)', c.rot13, { aliases: ['rot-13'] }),
  codec('rot47', 'ROT47 — rotates all printable ASCII (apply again to decode)', c.rot47, { aliases: ['rot-47'] }),
  codec('atbash', 'Atbash cipher, A↔Z B↔Y… (apply again to decode)', c.atbash),
  keyed('caesar', 'Caesar cipher: shift letters forward', '<shift 1-25> <text>', ['3 Hello World', '13 attack at dawn'], intKey(-25, 25), c.shiftLetters, { aliases: ['caesarencode'] }),
  keyed('uncaesar', 'Decode a Caesar cipher with a known shift', '<shift 1-25> <text>', ['3 Khoor Zruog'], intKey(-25, 25), (s, k) => c.shiftLetters(s, -k), { aliases: ['caesardecode'] }),
  {
    name: 'caesarall',
    aliases: ['caesarbrute', 'bruteforcecaesar'],
    description: 'Show all 25 Caesar shifts (to crack an unknown shift)',
    usage: '<text>',
    examples: ['Khoor Zruog'],
    minArgs: 1,
    cooldown: 2,
    async execute(ctx) {
      const text = ctx.rest(0).slice(0, 60);
      const lines = Array.from({ length: 25 }, (_, i) => `${String(i + 1).padStart(2)} │ ${c.shiftLetters(text, -(i + 1))}`);
      return sendText(ctx, lines.join('\n'), { code: true, prefix: '🔓 Decoding with every shift:' });
    },
  },
  keyed('vigenere', 'Vigenère cipher: encrypt with a keyword', '<key> <text>', ['LEMON ATTACK AT DAWN'], strKey, (s, k) => c.vigenere(s, k), { aliases: ['vigenereencode'] }),
  keyed('unvigenere', 'Decrypt a Vigenère cipher with its keyword', '<key> <text>', ['LEMON LXFOPV EF RNHR'], strKey, (s, k) => c.vigenere(s, k, true), { aliases: ['vigeneredecode'] }),
  codec('a1z26', 'Letters to numbers (A=1 … Z=26)', c.a1z26, { aliases: ['lettersnumbers'] }),
  codec('una1z26', 'Numbers back to letters (1=A … 26=Z)', c.una1z26, { aliases: ['numbersletters'], examples: ['8-5-12-12-15 23-15-18-12-4'] }),
  codec('bacon', "Bacon's cipher (A/B groups of five)", c.bacon, { aliases: ['baconian'], examples: ['Hi there'] }),
  codec('unbacon', "Decode Bacon's cipher", c.unbacon, { aliases: ['unbaconian'], examples: ['AABBB ABAAA / BAABB AABBB AABAA BAAAB AABAA'] }),
  keyed('railfence', 'Rail-fence (zigzag) cipher', '<rails 2-10> <text>', ['3 WEAREDISCOVERED'], intKey(2, 10), (s, k) => c.railfence(s, k), { aliases: ['zigzag'] }),
  keyed('unrailfence', 'Decode a rail-fence cipher', '<rails 2-10> <text>', ['3 WECRERDSOEEAIVD'], intKey(2, 10), (s, k) => c.railfence(s, k, true), { aliases: ['unzigzag'] }),
  codec('polybius', 'Polybius square cipher (letters to 2-digit pairs)', c.polybius, { examples: ['Hello World'] }),
  codec('unpolybius', 'Decode a Polybius square cipher', c.unpolybius, { examples: ['23 15 31 31 34 / 52 34 42 31 14'] }),
  keyed('xor', 'XOR text with a key (output as hex)', '<key> <text>', ['secret Hello World'], strKey, (s, k) => c.xorHex(s, k), { aliases: ['xorencode'] }),
  keyed('unxor', 'Reverse an XOR (hex input) with its key', '<key> <hex>', ['secret 3b000f1e0a54240a111e01'], strKey, (s, k) => c.unxorHex(s, k), { aliases: ['xordecode'], decode: true }),
  {
    name: 'morse',
    aliases: ['morsecode', 'tomorse'],
    description: 'Translate text to Morse code',
    usage: '<text>',
    examples: ['SOS Help'],
    minArgs: 1,
    cooldown: 1,
    slash: true,
    args: [{ name: 'text', type: 'string', description: 'Text to translate', required: true, rest: true }],
    async execute(ctx) {
      return sendText(ctx, c.morse(ctx.rest(0)) || '(nothing translatable)', { code: true });
    },
  },
  codec('unmorse', 'Translate Morse code back to text', c.unmorse, { aliases: ['frommorse', 'demorse'], examples: ['... --- ... / .... . .-.. .--.'] }),
  codec('nato', 'Spell text with the NATO phonetic alphabet', c.nato, { aliases: ['phonetic', 'spellout'], examples: ['ABC 123'] }),
  codec('unnato', 'Turn NATO phonetic words back into letters', c.unnato, { aliases: ['fromnato'], examples: ['Hotel India / Niner'] }),
  codec('braille', 'Translate text to (grade 1) Braille', c.braille, { aliases: ['tobraille'], examples: ['hello 123'] }),
  codec('unbraille', 'Translate Braille back to text', c.unbraille, { aliases: ['frombraille'], examples: ['⠓⠑⠇⠇⠕⠀⠼⠁⠃⠉'] }),
  codec('multitap', 'Type text as old phone keypad presses (multi-tap)', c.multitap, { aliases: ['phonekeys', 'keypad'], examples: ['hello world'] }),
  codec('unmultitap', 'Decode phone keypad presses back to text', c.unmultitap, { aliases: ['unphonekeys'], examples: ['44 33 555 555 666'] }),
  {
    name: 'jwtdecode',
    aliases: ['jwt', 'decodejwt'],
    description: 'Decode a JWT header and payload (does NOT verify the signature)',
    usage: '<token>',
    examples: ['eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c', 'not.a.jwt'],
    minArgs: 1,
    cooldown: 2,
    async execute(ctx) {
      const parts = ctx.args[0].split('.');
      const part = (p) => {
        try {
          return JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
        } catch {
          return null;
        }
      };
      const header = parts.length >= 2 ? part(parts[0]) : null;
      const payload = parts.length >= 2 ? part(parts[1]) : null;
      if (!header || !payload) return ctx.fail('That does not look like a JWT (header.payload.signature).');
      const times = ['iat', 'nbf', 'exp']
        .filter((k) => typeof payload[k] === 'number')
        .map((k) => ({ name: k, value: `<t:${Math.floor(payload[k])}:F>${k === 'exp' ? (payload[k] * 1000 < Date.now() ? ' — **expired**' : ' — still valid') : ''}`, inline: true }));
      const block = (o) => `\`\`\`json\n${fence(JSON.stringify(o, null, 2)).slice(0, 1000)}\n\`\`\``;
      if (ctx.message) ctx.message.delete().catch(() => {}); // tokens are secrets — don't leave them in chat
      await ctx.reply({
        embeds: [
          ctx.embed({
            title: '🔑 JWT decoded',
            fields: [{ name: 'Header', value: block(header) }, { name: 'Payload', value: block(payload) }, ...times],
            footer: '⚠️ Signature NOT verified. Never paste real production tokens into chat.',
          }),
        ],
        allowedMentions: NO_PINGS,
      });
    },
  },
  {
    name: 'entropy',
    aliases: ['shannon'],
    description: 'Shannon entropy of text (how random it looks)',
    usage: '<text>',
    examples: ['aaaaaaa', 'correct horse battery staple', 'X9$kq!2Lz@'],
    minArgs: 1,
    cooldown: 1,
    async execute(ctx) {
      const e = c.entropy(ctx.rest(0));
      await ctx.reply({
        embeds: [
          ctx.embed({
            title: '🎲 Shannon entropy',
            fields: [
              { name: 'Per character', value: `${e.perChar.toFixed(3)} bits`, inline: true },
              { name: 'Total', value: `${e.total.toFixed(1)} bits`, inline: true },
              { name: 'Unique / length', value: `${e.unique} / ${e.length}`, inline: true },
            ],
            footer: 'Measures character variety in this text only — not the strength of a password scheme.',
          }),
        ],
      });
    },
  },
];
