/*
 * DEEP WATERS — anti-cheat & abuse protection.
 *
 * The biggest defence is architectural: the server runs the whole simulation.
 * Clients only send button states + requests ("cast here", "buy X"), so they
 * cannot edit money, teleport, spawn items, or shoot faster than the gun allows.
 *
 * This module adds the layers on top of that:
 *  - strict message schema validation (unknown / malformed => strike)
 *  - token-bucket flood protection per connection
 *  - action + chat rate limits, spam/repeat muting
 *  - connection caps per IP, temporary IP bans for repeat offenders
 *  - one live session per profile (blocks item/money duplication)
 *  - movement & economy audits that catch anything that slips through
 */
'use strict';

const D = require('../shared/data');

const LIMITS = {
  bucketSize: 150,        // max burst of messages
  refillPerSec: 90,       // sustained messages/sec (inputs are sent ~30/s)
  actionsPerSec: 15,
  chatIntervalMs: 700,
  strikesToKick: 12,
  kicksToBan: 3,
  banMs: 30 * 60 * 1000,
  maxConnPerIp: +process.env.MAX_CONN_PER_IP || 4,
  maxSpeed: 2600,         // px/s — nothing legit (even rocket-jumping) exceeds this
  maxMoneyPerMin: 2_500_000,
};

const bans = new Map();       // ip -> unban timestamp
const kickLog = new Map();    // ip -> [timestamps]
const ipConns = new Map();    // ip -> count

function isBanned(ip) {
  const until = bans.get(ip);
  if (!until) return false;
  if (Date.now() > until) { bans.delete(ip); return false; }
  return true;
}

function noteKick(ip) {
  const now = Date.now();
  const arr = (kickLog.get(ip) || []).filter((t) => now - t < LIMITS.banMs);
  arr.push(now);
  kickLog.set(ip, arr);
  if (arr.length >= LIMITS.kicksToBan) { bans.set(ip, now + LIMITS.banMs); return true; }
  return false;
}

function trackConn(ip, delta) {
  const n = Math.max(0, (ipConns.get(ip) || 0) + delta);
  if (n) ipConns.set(ip, n); else ipConns.delete(ip);
  return n;
}
const connCount = (ip) => ipConns.get(ip) || 0;

class Guard {
  constructor(ip, log) {
    this.ip = ip;
    this.tokens = LIMITS.bucketSize;
    this.last = Date.now();
    this.strikes = 0;
    this.actions = [];
    this.chatAt = 0;
    this.lastChat = '';
    this.repeat = 0;
    this.mutedUntil = 0;
    this.log = log || (() => {});
  }

  // returns false when the message must be dropped
  allowMessage() {
    const now = Date.now();
    this.tokens = Math.min(LIMITS.bucketSize, this.tokens + ((now - this.last) / 1000) * LIMITS.refillPerSec);
    this.last = now;
    if (this.tokens < 1) { this.strike('flood'); return false; }
    this.tokens -= 1;
    return true;
  }

  allowAction() {
    const now = Date.now();
    this.actions = this.actions.filter((t) => now - t < 1000);
    if (this.actions.length >= LIMITS.actionsPerSec) { this.strike('action spam'); return false; }
    this.actions.push(now);
    return true;
  }

  allowChat(text) {
    const now = Date.now();
    if (now < this.mutedUntil) return 'You are muted for spamming.';
    if (now - this.chatAt < LIMITS.chatIntervalMs) return 'Slow down.';
    this.repeat = text === this.lastChat ? this.repeat + 1 : 0;
    this.lastChat = text; this.chatAt = now;
    if (this.repeat >= 2) { this.mutedUntil = now + 15000; return 'Muted 15s for repeating messages.'; }
    return null;
  }

  strike(reason) {
    this.strikes++;
    this.log(`strike ${this.strikes} (${reason}) from ${this.ip}`);
  }

  get shouldKick() { return this.strikes >= LIMITS.strikesToKick; }
}

// ------------------------------------------------------------------ validation
const str = (v, max) => (typeof v === 'string' && v.length <= max ? v : null);
const fin = (v) => typeof v === 'number' && isFinite(v);

const BAD_WORDS = ['nigger', 'faggot', 'retard', 'kys'];
function cleanText(s, max) {
  if (typeof s !== 'string') return '';
  let out = s.replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮]/g, '').trim().slice(0, max);
  for (const w of BAD_WORDS) out = out.replace(new RegExp(w, 'gi'), (m) => '*'.repeat(m.length));
  return out;
}
function cleanName(s) {
  const n = cleanText(s, 16).replace(/[<>&"'`]/g, '');
  return n.length >= 2 ? n : 'Sailor' + Math.floor(Math.random() * 9000 + 1000);
}

function sanitizeInput(m) {
  return {
    up: m.u ? 1 : 0, down: m.d ? 1 : 0, left: m.l ? 1 : 0, right: m.r ? 1 : 0,
    fire: m.f ? 1 : 0, reel: m.rl ? 1 : 0,
    aim: fin(m.aim) ? Math.max(-Math.PI * 2, Math.min(Math.PI * 2, m.aim)) : 0,
  };
}

const ACTIONS = new Set(['cast', 'hook', 'reelin', 'weapon', 'bait', 'rod', 'boat', 'buy', 'sell', 'sellall', 'repair', 'patch', 'pot', 'bounty_reroll']);
const BUY_CATS = new Set(['rod', 'boat', 'weapon', 'ammo', 'bait', 'upg', 'item']);

// returns a clean action object, or null if malformed
function sanitizeAction(m) {
  if (!ACTIONS.has(m.a)) return null;
  const a = { a: m.a };
  if (m.a === 'cast') {
    if (!fin(m.x) || !fin(m.y) || Math.abs(m.x) > D.WORLD_R * 1.5 || Math.abs(m.y) > D.WORLD_R * 1.5) return null;
    a.x = m.x; a.y = m.y;
  } else if (['weapon', 'bait', 'rod', 'boat'].includes(m.a)) {
    a.id = str(m.id, 24); if (!a.id) return null;
  } else if (m.a === 'buy') {
    if (!BUY_CATS.has(m.cat)) return null;
    a.cat = m.cat; a.id = str(m.id, 24); if (!a.id) return null;
  } else if (m.a === 'sell') {
    if (!Number.isInteger(m.i) || m.i < 0 || m.i > 500) return null;
    a.i = m.i;
  }
  return a;
}

// ------------------------------------------------------------------ audits
// Runs every few seconds per lobby. The sim is authoritative so these should
// never fire — if they do, it's an exploit or a bug, and we contain it.
class Auditor {
  constructor(log) { this.last = new Map(); this.log = log || (() => {}); }
  check(world, now) {
    const flagged = [];
    for (const p of world.players.values()) {
      const prev = this.last.get(p.id);
      const cur = { x: p.x, y: p.y, earned: p.profile.stats.earned, t: now, dead: p.dead };
      if (prev && !p.dead && !prev.dead) {
        const dt = Math.max(0.001, (now - prev.t) / 1000);
        const speed = Math.hypot(p.x - prev.x, p.y - prev.y) / dt;
        if (speed > LIMITS.maxSpeed) {
          this.log(`audit: ${p.name} moved ${speed | 0}px/s — resetting`);
          p.x = prev.x; p.y = prev.y; p.vx = p.vy = 0;
          flagged.push([p.id, 'speed']);
        }
        const earnedRate = ((p.profile.stats.earned - prev.earned) / dt) * 60;
        if (earnedRate > LIMITS.maxMoneyPerMin) {
          this.log(`audit: ${p.name} earned $${earnedRate | 0}/min — flagged`);
          flagged.push([p.id, 'economy']);
        }
      }
      if (!isFinite(p.x) || !isFinite(p.y) || !isFinite(p.profile.money) || p.profile.money < 0) {
        this.log(`audit: ${p.name} has invalid state — repairing`);
        p.x = 0; p.y = 380; p.vx = p.vy = 0;
        if (!isFinite(p.profile.money) || p.profile.money < 0) p.profile.money = 0;
        flagged.push([p.id, 'state']);
      }
      this.last.set(p.id, cur);
    }
    for (const id of this.last.keys()) if (!world.players.has(id)) this.last.delete(id);
    return flagged;
  }
}

module.exports = { LIMITS, Guard, Auditor, isBanned, noteKick, trackConn, connCount, sanitizeInput, sanitizeAction, cleanText, cleanName };
