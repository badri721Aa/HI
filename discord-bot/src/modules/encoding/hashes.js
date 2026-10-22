'use strict';
const crypto = require('node:crypto');
const c = require('./_codecs');
const { sendText } = require('../text/_lib');

// Curated algorithms; only the ones this Node/OpenSSL build actually supports are registered.
const CANDIDATES = [
  'md5', 'sha1', 'sha224', 'sha256', 'sha384', 'sha512', 'sha512-224', 'sha512-256',
  'sha3-224', 'sha3-256', 'sha3-384', 'sha3-512', 'shake128', 'shake256',
  'ripemd160', 'blake2b512', 'blake2s256', 'sm3', 'md4', 'whirlpool',
];
const SHAKE_BYTES = { shake128: 16, shake256: 32 };
const opts = (algo) => (SHAKE_BYTES[algo] ? { outputLength: SHAKE_BYTES[algo] } : undefined);

const available = new Set(crypto.getHashes());
const ALGOS = CANDIDATES.filter((a) => {
  if (!available.has(a)) return false;
  try {
    crypto.createHash(a, opts(a)).update('').digest();
    return true;
  } catch {
    return false; // listed but disabled (e.g. legacy provider not loaded)
  }
});

const digest = (algo, text) => crypto.createHash(algo, opts(algo)).update(String(text), 'utf8').digest('hex');
const findAlgo = (name) => {
  const n = String(name || '').toLowerCase().replace(/_/g, '-');
  return ALGOS.find((a) => a === n || a.replace(/-/g, '') === n.replace(/-/g, '')) || null;
};

const perAlgo = ALGOS.map((algo) => ({
  name: algo,
  description: `${algo.toUpperCase()} hash of text (hex)`,
  usage: '<text>',
  examples: ['abc'],
  minArgs: 1,
  cooldown: 1,
  async execute(ctx) {
    return sendText(ctx, digest(algo, ctx.rest(0)), { code: true });
  },
}));

const checksums = [
  ['crc32', 'CRC-32 checksum of text (IEEE)', c.crc32],
  ['adler32', 'Adler-32 checksum of text', c.adler32],
  ['fnv1a', 'FNV-1a 32-bit hash of text', c.fnv1a],
].map(([name, description, fn]) => ({
  name,
  description,
  usage: '<text>',
  examples: ['123456789'],
  minArgs: 1,
  cooldown: 1,
  async execute(ctx) {
    return sendText(ctx, fn(ctx.rest(0)), { code: true });
  },
}));

module.exports = [
  ...perAlgo,
  ...checksums,
  {
    name: 'hash',
    aliases: ['digest', 'checksum'],
    description: 'Hash text with any supported algorithm (md5, sha256, sha3-512…)',
    usage: '<algorithm> <text>',
    examples: ['sha256 abc', 'md5 hello world', 'crc32 123456789'],
    minArgs: 2,
    cooldown: 1,
    slash: true,
    args: [
      { name: 'algorithm', type: 'string', description: 'Hash algorithm', required: true, choices: [...ALGOS, 'crc32', 'adler32', 'fnv1a'].slice(0, 25) },
      { name: 'text', type: 'string', description: 'Text to hash', required: true, rest: true },
    ],
    async execute(ctx) {
      const name = ctx.args[0].toLowerCase();
      const text = ctx.rest(1);
      const check = { crc32: c.crc32, adler32: c.adler32, fnv1a: c.fnv1a }[name];
      if (check) return sendText(ctx, check(text), { code: true, prefix: `🔐 **${name}**` });
      const algo = findAlgo(name);
      if (!algo) return ctx.fail(`Unknown algorithm. Supported: ${[...ALGOS, 'crc32', 'adler32', 'fnv1a'].map((a) => `\`${a}\``).join(', ')}`);
      return sendText(ctx, digest(algo, text), { code: true, prefix: `🔐 **${algo}**` });
    },
  },
  {
    name: 'hashall',
    aliases: ['allhashes'],
    description: 'Hash text with every supported algorithm at once',
    usage: '<text>',
    examples: ['abc'],
    minArgs: 1,
    cooldown: 3,
    async execute(ctx) {
      const text = ctx.rest(0);
      const rows = [...ALGOS.map((a) => [a, digest(a, text)]), ['crc32', c.crc32(text)], ['adler32', c.adler32(text)], ['fnv1a', c.fnv1a(text)]];
      const width = Math.max(...rows.map(([a]) => a.length));
      return sendText(ctx, rows.map(([a, h]) => `${a.padEnd(width)}  ${h}`).join('\n'), { code: true, file: 'hashes.txt' });
    },
  },
  {
    name: 'hashlist',
    aliases: ['hashes', 'hashalgos'],
    description: 'List the hash algorithms the bot supports',
    async execute(ctx) {
      await ctx.info(`${[...ALGOS, 'crc32', 'adler32', 'fnv1a'].map((a) => `\`${a}\``).join(' • ')}\n\nUse \`${ctx.prefix}hash <algorithm> <text>\` or \`${ctx.prefix}<algorithm> <text>\`.`, '🔐 Hash algorithms');
    },
  },
  {
    name: 'hmac',
    description: 'HMAC signature of text with a secret key',
    usage: '<algorithm> <key> <text>',
    examples: ['sha256 key The quick brown fox jumps over the lazy dog', 'md5 secret hello'],
    minArgs: 3,
    cooldown: 1,
    async execute(ctx) {
      const algo = findAlgo(ctx.args[0]);
      if (!algo || SHAKE_BYTES[algo]) return ctx.fail(`Unknown HMAC algorithm. Try: ${ALGOS.filter((a) => !SHAKE_BYTES[a]).map((a) => `\`${a}\``).join(', ')}`);
      const mac = crypto.createHmac(algo, ctx.args[1]).update(ctx.rest(2), 'utf8').digest('hex');
      return sendText(ctx, mac, { code: true, prefix: `🔏 **HMAC-${algo}**` });
    },
  },
];

module.exports.ALGOS = ALGOS;
