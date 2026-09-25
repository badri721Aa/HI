// Headless smoke test for the shared simulation: node test/sim.test.js
const assert = require('assert');
const D = require('../shared/data');
const { World, fixProfile, sellPrice } = require('../shared/sim');

assert(D.SPECIES.length >= 1000, 'need 1000+ species, got ' + D.SPECIES.length);
assert.strictEqual(new Set(D.SPECIES.map((s) => s.name)).size, D.SPECIES.length, 'species names must be unique');
console.log('species:', D.SPECIES.length, 'bosses:', D.BOSSES.length, 'weapons:', D.WEAPONS.length);

const w = new World({ seed: 7, pvp: true });
const p = w.addPlayer('a', 'Tester');
const q = w.addPlayer('b', 'Other');

// movement physics
w.setInput('a', { up: 1, aim: 0 });
for (let i = 0; i < 60; i++) w.step(1 / 30);
assert(Math.hypot(p.vx, p.vy) > 50, 'boat should accelerate');

// economy is validated: can't buy away from dock
p.x = 3000; p.y = 0;
assert.strictEqual(w.act('a', { a: 'buy', cat: 'rod', id: 'bamboo' }), false);
p.x = 100; p.y = 0; p.profile.money = 1000;
assert.strictEqual(w.act('a', { a: 'buy', cat: 'rod', id: 'bamboo' }), true);
assert.strictEqual(p.profile.money, 400);
assert.strictEqual(w.act('a', { a: 'buy', cat: 'rod', id: 'trident' }), false, 'cannot afford');

// fishing: cast -> bite -> hook -> reel -> catch
p.x = 1500; p.y = 0; p.vx = p.vy = 0; w.setInput('a', { aim: 0 });
w.creatures = []; w.spawnTimer = 999;
assert(w.act('a', { a: 'cast', x: 1700, y: 0 }));
let caught = 0, guard = 0;
while (!caught && guard++ < 20000) {
  w.step(1 / 30);
  p.hp = p.st.maxHp; w.creatures = [];
  if (p.fish.state === 'bite') w.act('a', { a: 'hook' });
  if (p.fish.state === 'reel') w.setInput('a', { reel: p.fish.tension < 0.6 ? 1 : 0, aim: 0 });
  if (p.fish.state === 'idle') { caught = p.profile.cargo.length; if (!caught) w.act('a', { a: 'cast', x: 1700, y: 0 }); }
}
assert(caught > 0, 'should catch a fish');
const it = p.profile.cargo[0];
console.log('caught', D.SPECIES[it.s].name, it.w + 'kg', '$' + sellPrice(it, w.market));

// selling
p.x = 0; p.y = 300;
const before = p.profile.money;
assert(w.act('a', { a: 'sellall' }));
assert(p.profile.money > before && p.profile.cargo.length === 0);

// combat + gore events
p.x = 2500; p.y = 0; p.profile.ammo.light = 50;
const c = w.spawnCreature('shark', 2600, 0);
for (let i = 0; i < 300 && !c.dead; i++) {
  w.setInput('a', { fire: 1, aim: Math.atan2(c.y - p.y, c.x - p.x) });
  w.step(1 / 30); p.hp = p.st.maxHp;
}
assert(c.dead, 'shark should die');
assert(p.profile.stats.kills >= 1);
const ev = w.drainEvents();
assert(ev.some((e) => e.e === 'die') && ev.some((e) => e.e === 'hit'));

// boss fight via chum
w.setInput('a', {});
p.profile.baits.chum = 1; p.profile.bait = 'chum'; p.fish = { state: 'idle' };
p.x = 1500; p.y = 0;
w.act('a', { a: 'cast', x: 1600, y: 0 });
for (let i = 0; i < 200; i++) w.step(1 / 30);
const boss = w.creatures.find((x) => x.boss);
assert(boss, 'boss should spawn from chum');
console.log('boss spawned:', boss.name, boss.hp + 'hp');
for (let i = 0; i < 600; i++) { w.step(1 / 30); p.hp = p.st.maxHp; q.hp = q.st.maxHp; }
boss.hp = 1; w.hurtCreature(boss, 10, p, boss.x, boss.y);
assert(p.profile.stats.bosses[boss.bossDef.id] === 1);

// tampered profile is sanitized
const bad = fixProfile({ money: 'lots', rods: ['hax', 'trident'], ammo: { light: -5 }, cargo: [{ s: 99999, w: 1 }] });
assert.strictEqual(bad.money, 250); assert(bad.rods.includes('trident')); assert.strictEqual(bad.ammo.light, 0); assert.strictEqual(bad.cargo.length, 0);

// snapshot serializes
const snap = JSON.stringify(w.snapshot('a'));
console.log('snapshot bytes:', snap.length);
console.log('ALL SIM TESTS PASSED');
