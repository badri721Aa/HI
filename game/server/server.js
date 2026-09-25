/*
 * DEEP WATERS — game server.
 *  - serves the web client (http://host:PORT/)
 *  - WebSocket multiplayer at /ws
 *  - lobbies: public (listed), private (listed, password), invite-only (unlisted, invite codes)
 *  - max 10 players per lobby, server-authoritative simulation, persistent profiles
 *
 * Run:  npm install && npm start      (PORT env var, default 8080)
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const D = require('../shared/data');
const { World, fixProfile } = require('../shared/sim');
const AC = require('./anticheat');

const PORT = +process.env.PORT || 8080;
const MAX_PLAYERS = 10;
const MAX_LOBBIES = 100;
const MAX_CONNECTIONS = 400;
const TICK = 1 / 30;
const SNAP_EVERY = 2; // 15 snapshots/sec
const ROOT = path.join(__dirname, '..');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const PROFILE_FILE = path.join(DATA_DIR, 'profiles.json');

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ------------------------------------------------------------------ profiles
let profiles = {};
try { profiles = JSON.parse(fs.readFileSync(PROFILE_FILE, 'utf8')); log(`loaded ${Object.keys(profiles).length} profiles`); } catch { /* first run */ }
let profilesDirty = false;
function saveProfiles() {
  for (const lobby of lobbies.values()) for (const c of lobby.members.values()) {
    const p = lobby.world.players.get(c.id);
    if (p) profiles[c.token] = p.profile;
  }
  if (!profilesDirty && !lobbies.size) return;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = PROFILE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(profiles));
  fs.renameSync(tmp, PROFILE_FILE);
  profilesDirty = false;
}
const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');

// ------------------------------------------------------------------ http
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/status') {
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    return res.end(JSON.stringify({ ok: true, lobbies: lobbies.size, players: conns.size, species: D.SPECIES.length }));
  }
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/client/index.html';
  else if (!rel.startsWith('/client/') && !rel.startsWith('/shared/')) rel = '/client' + rel;
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(path.join(ROOT, 'client')) && !file.startsWith(path.join(ROOT, 'shared'))) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' });
    res.end(buf);
  });
});

// ------------------------------------------------------------------ lobbies
const lobbies = new Map();   // id -> Lobby
const conns = new Map();     // connId -> Conn
const liveTokens = new Map(); // tokenHash -> connId  (one session per profile)
let connSeq = 1;

const code = (n) => { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (const b of crypto.randomBytes(n)) s += A[b % A.length]; return s; };
const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 32).toString('hex');

class Lobby {
  constructor({ name, type, password, pvp, official }) {
    this.id = code(6);
    this.name = name; this.type = type; this.pvp = !!pvp; this.official = !!official;
    this.salt = crypto.randomBytes(8).toString('hex');
    this.pw = type === 'private' && password ? hashPw(password, this.salt) : null;
    this.members = new Map();   // connId -> conn
    this.invites = new Map();   // code -> expiry
    this.bannedTokens = new Set();
    this.hostId = null;
    this.world = new World({ seed: crypto.randomInt(1, 2 ** 31), pvp });
    this.auditor = new AC.Auditor(log);
    this.tick = 0; this.emptySince = Date.now();
    lobbies.set(this.id, this);
  }
  summary() {
    return { id: this.type === 'invite' ? null : this.id, name: this.name, type: this.type, pvp: this.pvp, players: this.members.size, max: MAX_PLAYERS, official: this.official, locked: !!this.pw };
  }
  makeInvite() {
    const c = code(8);
    this.invites.set(c, Date.now() + 30 * 60 * 1000);
    return c;
  }
}

function listLobbies() {
  return [...lobbies.values()].filter((l) => l.type !== 'invite').map((l) => l.summary());
}

// ------------------------------------------------------------------ connection helpers
function send(c, msg) { if (c.ws.readyState === 1) c.ws.send(JSON.stringify(msg)); }
function kick(c, reason, strikeKick) {
  if (c.kicked) return;
  c.kicked = true;
  send(c, { t: 'kicked', reason });
  if (strikeKick && AC.noteKick(c.ip)) log(`banned ${c.ip} (repeat offender)`);
  setTimeout(() => c.ws.terminate(), 50);
}

function leaveLobby(c) {
  const lobby = c.lobby;
  if (!lobby) return;
  const prof = lobby.world.removePlayer(c.id);
  if (prof) { profiles[c.token] = prof; profilesDirty = true; }
  lobby.members.delete(c.id);
  c.lobby = null; c.evq = [];
  if (lobby.hostId === c.id) {
    lobby.hostId = lobby.members.keys().next().value || null;
    const h = lobby.members.get(lobby.hostId);
    if (h) send(h, { t: 'host' });
  }
  broadcast(lobby, { t: 'chat', from: '', text: `${c.name} left.`, sys: 1 });
  if (!lobby.members.size) lobby.emptySince = Date.now();
}

function joinLobby(c, lobby) {
  if (lobby.members.size >= MAX_PLAYERS) return send(c, { t: 'err', msg: 'Lobby is full (10/10).' });
  if (lobby.bannedTokens.has(c.token)) return send(c, { t: 'err', msg: 'You were kicked from this lobby.' });
  leaveLobby(c);
  lobby.members.set(c.id, c);
  c.lobby = lobby; c.evq = [];
  if (!lobby.hostId || !lobby.members.has(lobby.hostId)) lobby.hostId = c.id;
  const p = lobby.world.addPlayer(c.id, c.name, profiles[c.token]);
  p.profile.name = c.name;
  send(c, { t: 'joined', lobby: { ...lobby.summary(), id: lobby.id }, you: c.id, host: lobby.hostId === c.id, islands: lobby.world.islands, seed: lobby.world.seed, dex: p.profile.dex });
  broadcast(lobby, { t: 'chat', from: '', text: `${c.name} joined. (${lobby.members.size}/${MAX_PLAYERS})`, sys: 1 });
  log(`${c.name} joined ${lobby.name} [${lobby.type}] ${lobby.members.size}/${MAX_PLAYERS}`);
}

function broadcast(lobby, msg) { const s = JSON.stringify(msg); for (const m of lobby.members.values()) if (m.ws.readyState === 1) m.ws.send(s); }

// ------------------------------------------------------------------ message handling
function handle(c, m) {
  if (!m || typeof m.t !== 'string') return c.guard.strike('bad message');
  if (!c.token && m.t !== 'hello') return c.guard.strike('not authed');
  switch (m.t) {
    case 'hello': {
      if (c.token) return;
      let token = typeof m.token === 'string' && /^[a-f0-9]{64}$/.test(m.token) ? m.token : null;
      if (!token) token = crypto.randomBytes(32).toString('hex');
      const key = hashToken(token);
      const prev = liveTokens.get(key);
      if (prev && conns.has(prev)) {
        // save the old session's live profile *before* this one loads it (prevents rollback/dupes)
        const old = conns.get(prev);
        leaveLobby(old);
        old.token = null;
        kick(old, 'Logged in from another window.');
      }
      liveTokens.set(key, c.id);
      c.token = key; c.name = AC.cleanName(m.name);
      const pr = profiles[key];
      send(c, { t: 'welcome', token, id: c.id, name: c.name, money: pr ? pr.money : 250, lobbies: listLobbies() });
      return;
    }
    case 'list': return send(c, { t: 'lobbies', list: listLobbies() });
    case 'create': {
      if (lobbies.size >= MAX_LOBBIES) return send(c, { t: 'err', msg: 'Server is full of lobbies, try joining one.' });
      const type = ['public', 'private', 'invite'].includes(m.type) ? m.type : 'public';
      const password = typeof m.password === 'string' ? m.password.slice(0, 32) : '';
      if (type === 'private' && password.length < 3) return send(c, { t: 'err', msg: 'Private lobbies need a password (3+ chars).' });
      const name = AC.cleanText(m.name, 28) || `${c.name}'s Sea`;
      const lobby = new Lobby({ name, type, password, pvp: !!m.pvp });
      joinLobby(c, lobby);
      if (type === 'invite') send(c, { t: 'invite', code: lobby.makeInvite() });
      return;
    }
    case 'join': {
      let lobby = null;
      if (typeof m.invite === 'string') {
        const inv = m.invite.toUpperCase().slice(0, 8);
        for (const l of lobbies.values()) {
          const exp = l.invites.get(inv);
          if (exp && exp > Date.now()) { lobby = l; l.invites.delete(inv); break; }
        }
        if (!lobby) return send(c, { t: 'err', msg: 'Invite code invalid or already used.' });
      } else if (typeof m.id === 'string') {
        lobby = lobbies.get(m.id.toUpperCase().slice(0, 6));
        if (!lobby || lobby.type === 'invite') return send(c, { t: 'err', msg: 'Lobby not found. Invite-only lobbies need an invite code.' });
        if (lobby.pw && hashPw(String(m.password || '').slice(0, 32), lobby.salt) !== lobby.pw) { c.guard.strike('bad password'); return send(c, { t: 'err', msg: 'Wrong password.' }); }
      }
      if (!lobby) return send(c, { t: 'err', msg: 'Lobby not found.' });
      return joinLobby(c, lobby);
    }
    case 'leave': leaveLobby(c); return send(c, { t: 'left', lobbies: listLobbies() });
    case 'invite': {
      if (!c.lobby) return;
      if (c.lobby.type === 'invite' || c.lobby.hostId === c.id) return send(c, { t: 'invite', code: c.lobby.makeInvite() });
      return send(c, { t: 'invite', id: c.lobby.id });
    }
    case 'kick': {
      const l = c.lobby;
      if (!l || l.hostId !== c.id || typeof m.pid !== 'string' || m.pid === c.id) return;
      const t = l.members.get(m.pid);
      if (!t) return;
      l.bannedTokens.add(t.token);
      leaveLobby(t);
      send(t, { t: 'kicked', reason: 'Kicked by the host.', soft: 1 });
      send(t, { t: 'left', lobbies: listLobbies() });
      return;
    }
    case 'in': if (c.lobby) c.lobby.world.setInput(c.id, AC.sanitizeInput(m)); return;
    case 'act': {
      if (!c.lobby || !c.guard.allowAction()) return;
      const a = AC.sanitizeAction(m);
      if (!a) return c.guard.strike('bad action');
      c.lobby.world.act(c.id, a);
      return;
    }
    case 'chat': {
      if (!c.lobby) return;
      const text = AC.cleanText(m.text, 140);
      if (!text) return;
      const why = c.guard.allowChat(text);
      if (why) return send(c, { t: 'chat', from: '', text: why, sys: 1 });
      broadcast(c.lobby, { t: 'chat', from: c.name, text });
      return;
    }
    case 'ping': return send(c, { t: 'pong', c: m.c });
    default: c.guard.strike('unknown type');
  }
}

// ------------------------------------------------------------------ websocket
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096, perMessageDeflate: false });
wss.on('connection', (ws, req) => {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  if (AC.isBanned(ip)) { ws.close(4003, 'banned'); return; }
  if (conns.size >= MAX_CONNECTIONS || AC.connCount(ip) >= AC.LIMITS.maxConnPerIp) { ws.close(4004, 'too many connections'); return; }
  AC.trackConn(ip, 1);
  const c = { id: 'c' + connSeq++, ws, ip, token: null, name: 'Sailor', lobby: null, evq: [], alive: true };
  c.guard = new AC.Guard(ip, log);
  conns.set(c.id, c);
  ws.on('pong', () => { c.alive = true; });
  ws.on('message', (data, isBinary) => {
    if (c.kicked) return;
    if (isBinary || !c.guard.allowMessage()) { if (c.guard.shouldKick) kick(c, 'Kicked by anti-cheat (flooding).', true); return; }
    let m;
    try { m = JSON.parse(data); } catch { c.guard.strike('bad json'); }
    if (m) {
      try { handle(c, m); } catch (e) { log('handler error', e); c.guard.strike('handler error'); }
    }
    if (c.guard.shouldKick) kick(c, 'Kicked by anti-cheat.', true);
  });
  ws.on('close', () => {
    leaveLobby(c);
    conns.delete(c.id);
    AC.trackConn(ip, -1);
    if (c.token && liveTokens.get(c.token) === c.id) liveTokens.delete(c.token);
  });
});

// heartbeat: drop dead sockets
setInterval(() => {
  for (const c of conns.values()) {
    if (!c.alive) { c.ws.terminate(); continue; }
    c.alive = false;
    try { c.ws.ping(); } catch { /* closed */ }
  }
}, 15000);

// ------------------------------------------------------------------ game loop
const NEAR_EVENT = 2400;
function routeEvents(lobby) {
  const evs = lobby.world.drainEvents();
  if (!evs.length) return;
  for (const c of lobby.members.values()) {
    const p = lobby.world.players.get(c.id);
    for (const e of evs) {
      if (e.to !== undefined) { if (e.to === c.id) c.evq.push(e); continue; }
      if (e.x !== undefined && p && e.e !== 'boss' && !e.boss && Math.hypot(e.x - p.x, e.y - p.y) > NEAR_EVENT) continue;
      c.evq.push(e);
    }
    if (c.evq.length > 300) c.evq.splice(0, c.evq.length - 300);
  }
}

let lastAudit = Date.now();
setInterval(() => {
  const now = Date.now();
  const audit = now - lastAudit > 3000;
  if (audit) lastAudit = now;
  for (const lobby of lobbies.values()) {
    if (!lobby.members.size) {
      if (!lobby.official && now - lobby.emptySince > 60000) lobbies.delete(lobby.id);
      continue;
    }
    lobby.world.step(TICK);
    routeEvents(lobby);
    if (audit) {
      for (const [pid, why] of lobby.auditor.check(lobby.world, now)) {
        const c = lobby.members.get(pid);
        if (c) { c.guard.strike('audit:' + why); if (c.guard.shouldKick) kick(c, 'Kicked by anti-cheat audit.', true); }
      }
      for (const [k, exp] of lobby.invites) if (exp < now) lobby.invites.delete(k);
    }
    if (++lobby.tick % SNAP_EVERY) continue;
    for (const c of lobby.members.values()) {
      const snap = lobby.world.snapshot(c.id);
      snap.t = 'snap'; snap.ev = c.evq; c.evq = [];
      snap.host = lobby.hostId === c.id ? 1 : 0;
      send(c, snap);
      const p = lobby.world.players.get(c.id);
      if (p && p.dirty) {
        p.dirty = false;
        const { dex, ...rest } = p.profile; // dex is large; client tracks it from catch events
        send(c, { t: 'me', profile: rest, st: { maxHp: p.st.maxHp, cargoMax: p.st.cargoMax }, market: lobby.world.market, dexCount: Object.keys(dex).length });
      }
    }
  }
}, TICK * 1000);

setInterval(() => { try { saveProfiles(); } catch (e) { log('save failed', e.message); } }, 30000);
function shutdown() { log('saving & shutting down'); try { saveProfiles(); } catch (e) { log(e); } process.exit(0); }
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);

// Permanent official lobbies so there's always somewhere to play.
new Lobby({ name: 'Official Seas #1', type: 'public', pvp: false, official: true });
new Lobby({ name: 'Official Seas #2', type: 'public', pvp: false, official: true });
new Lobby({ name: 'Pirate Waters (PvP)', type: 'public', pvp: true, official: true });

if (require.main === module) server.listen(PORT, () => log(`Deep Waters server on http://localhost:${PORT}  (ws: /ws)`));

module.exports = { server, lobbies, conns, profiles, saveProfiles, MAX_PLAYERS };
