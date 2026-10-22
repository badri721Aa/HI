'use strict';
const crypto = require('node:crypto');

/** Deterministic 0..(mod-1) number from any strings — same input, same result. */
function hashNum(mod, ...parts) {
  const h = crypto.createHash('md5').update(parts.join('|').toLowerCase()).digest();
  return h.readUInt32BE(0) % mod;
}

/** "[██████░░░░]" style bar for 0..100. */
function bar(pct, size = 10) {
  const filled = Math.round((Math.max(0, Math.min(100, pct)) / 100) * size);
  return `${'█'.repeat(filled)}${'░'.repeat(size - filled)}`;
}

/** Display name for a User/GuildMember-ish object. */
function nameOf(u) {
  if (!u) return 'someone';
  return u.displayName || u.globalName || u.username || u.user?.username || 'someone';
}

module.exports = { hashNum, bar, nameOf };
