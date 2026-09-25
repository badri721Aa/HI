// Multiplayer integration test: node test/server.test.js
const assert = require('assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
process.env.MAX_CONN_PER_IP = '50';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-'));
const WebSocket = require('ws');
const { server } = require('../server/server');

function client(port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const inbox = [];
  const waiters = [];
  ws.on('message', (d) => {
    const m = JSON.parse(d);
    inbox.push(m);
    for (const w of [...waiters]) if (w.pred(m)) { waiters.splice(waiters.indexOf(w), 1); w.res(m); }
  });
  const c = {
    ws, inbox,
    send: (m) => ws.send(JSON.stringify(m)),
    wait: (pred, ms = 3000) => new Promise((res, rej) => {
      const hit = inbox.find(pred); if (hit) { inbox.splice(inbox.indexOf(hit), 1); return res(hit); }
      const w = { pred, res: (m) => { clearTimeout(to); inbox.splice(inbox.indexOf(m), 1); res(m); } };
      const to = setTimeout(() => rej(new Error('timeout waiting')), ms);
      waiters.push(w);
    }),
    open: () => new Promise((r) => ws.on('open', r)),
  };
  return c;
}

(async () => {
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;

  // status endpoint + static client
  const st = await (await fetch(`http://127.0.0.1:${port}/api/status`)).json();
  assert(st.ok && st.species >= 1000);
  const html = await (await fetch(`http://127.0.0.1:${port}/`)).status;
  const trav = await (await fetch(`http://127.0.0.1:${port}/..%2fserver%2fserver.js`)).status;
  assert(trav === 403 || trav === 404, 'path traversal must be blocked');

  const a = client(port); await a.open();
  a.send({ t: 'hello', name: 'Alice' });
  const wa = await a.wait((m) => m.t === 'welcome');
  assert(wa.token && wa.lobbies.length >= 3, 'official lobbies listed');

  // invite-only lobby is unlisted and joinable only by invite
  a.send({ t: 'create', name: 'Secret Cove', type: 'invite', pvp: false });
  const ja = await a.wait((m) => m.t === 'joined');
  const inv = await a.wait((m) => m.t === 'invite');
  a.send({ t: 'list' });
  const list = await a.wait((m) => m.t === 'lobbies');
  assert(!list.list.some((l) => l.name === 'Secret Cove'), 'invite lobby must be hidden');

  const b = client(port); await b.open();
  b.send({ t: 'hello', name: 'Bob' });
  await b.wait((m) => m.t === 'welcome');
  b.send({ t: 'join', id: ja.lobby.id });
  const e1 = await b.wait((m) => m.t === 'err');
  assert(/invite/i.test(e1.msg), 'joining invite lobby by id must fail');
  b.send({ t: 'join', invite: inv.code });
  await b.wait((m) => m.t === 'joined');
  const snap = await b.wait((m) => m.t === 'snap' && m.players.length === 2);
  assert(snap.me, 'private me block');

  // invite codes are single use
  const c3 = client(port); await c3.open();
  c3.send({ t: 'hello', name: 'Carl' }); await c3.wait((m) => m.t === 'welcome');
  c3.send({ t: 'join', invite: inv.code });
  await c3.wait((m) => m.t === 'err');

  // private lobby: password
  c3.send({ t: 'create', name: 'Locked', type: 'private', password: 'hunter2' });
  const jl = await c3.wait((m) => m.t === 'joined');
  const d = client(port); await d.open();
  d.send({ t: 'hello', name: 'Dan' }); await d.wait((m) => m.t === 'welcome');
  d.send({ t: 'join', id: jl.lobby.id, password: 'nope' });
  assert(/password/i.test((await d.wait((m) => m.t === 'err')).msg));
  d.send({ t: 'join', id: jl.lobby.id, password: 'hunter2' });
  await d.wait((m) => m.t === 'joined');

  // client cannot grant itself money: forged fields are ignored, buying far from dock fails
  a.send({ t: 'act', a: 'buy', cat: 'rod', id: 'trident' });
  a.send({ t: 'act', a: 'sell', i: 'all; drop table' });
  a.send({ t: 'me', profile: { money: 99999999 } });
  const me = await a.wait((m) => m.t === 'me');
  assert(me.profile.money < 1000, 'money must stay server-side');

  // max 10 players
  const pub = [];
  for (let i = 0; i < 11; i++) {
    const c = client(port); await c.open();
    c.send({ t: 'hello', name: 'Bot' + i }); await c.wait((m) => m.t === 'welcome');
    pub.push(c);
  }
  pub[0].send({ t: 'create', name: 'Full House', type: 'public' });
  const jf = await pub[0].wait((m) => m.t === 'joined');
  for (let i = 1; i < 10; i++) { pub[i].send({ t: 'join', id: jf.lobby.id }); await pub[i].wait((m) => m.t === 'joined'); }
  pub[10].send({ t: 'join', id: jf.lobby.id });
  assert(/full/i.test((await pub[10].wait((m) => m.t === 'err')).msg), '11th player rejected');

  // flood protection kicks spammers
  const spam = client(port); await spam.open();
  spam.send({ t: 'hello', name: 'Spammer' }); await spam.wait((m) => m.t === 'welcome');
  for (let i = 0; i < 400; i++) spam.send({ t: 'bogus' + i });
  const k = await spam.wait((m) => m.t === 'kicked');
  assert(/anti-cheat/i.test(k.reason));

  console.log('ALL SERVER TESTS PASSED');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
