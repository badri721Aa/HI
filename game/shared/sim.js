/*
 * DEEP WATERS — authoritative world simulation.
 * Runs in the browser for single-player and on the server for multiplayer.
 * Clients never own game state online: they only send inputs + action requests.
 */
(function (root, factory) {
  const D = root.SeaData || (typeof require === 'function' ? require('./data') : null);
  const mod = factory(D);
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else root.SeaSim = mod;
})(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';

  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  // distance from point (cx,cy) to segment (ax,ay)-(bx,by): swept collision so fast bullets never tunnel
  const segDist = (ax, ay, bx, by, cx, cy) => {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = l2 ? clamp(((cx - ax) * dx + (cy - ay) * dy) / l2, 0, 1) : 0;
    return Math.hypot(ax + dx * t - cx, ay + dy * t - cy);
  };
  const pickWeighted = (list) => {
    let tot = 0; for (const [, w] of list) tot += w;
    let r = Math.random() * tot;
    for (const [v, w] of list) { r -= w; if (r <= 0) return v; }
    return list[list.length - 1][0];
  };
  const KIND_LIST = Object.keys(D.KINDS).concat('treasure');

  // ---------------------------------------------------------------- profiles
  function newProfile(name) {
    return {
      v: 1, name: name || 'Sailor', money: 250,
      rods: ['twig'], rod: 'twig', boats: ['dinghy'], boat: 'dinghy', weapons: ['pistol'], weapon: 'pistol',
      ammo: { light: 80, shells: 0, harpoons: 0, heavy: 0, fuel: 0, rockets: 0, cells: 0 },
      baits: { worm: 10 }, bait: 'worm',
      upg: { engine: 0, hull: 0, cargo: 0, luck: 0 },
      pots: 1, patches: 1, cargo: [], dex: {}, ach: {}, bounties: [],
      stats: { caught: 0, kills: 0, bosses: {}, earned: 0, deaths: 0, biggest: 0, biomes: {}, pvp: 0, playtime: 0 },
    };
  }

  // Repairs / sanitizes a stored profile so corrupted or tampered saves can't break the sim.
  function fixProfile(p, name) {
    const base = newProfile(name);
    if (!p || typeof p !== 'object') return base;
    const out = base;
    const num = (v, d, max = 1e12) => (typeof v === 'number' && isFinite(v) ? clamp(v, 0, max) : d);
    out.name = typeof p.name === 'string' ? p.name.slice(0, 16) : out.name;
    out.money = Math.floor(num(p.money, out.money));
    const idList = (arr, table, def) => {
      const r = Array.isArray(arr) ? arr.filter((x) => table[x]) : [];
      if (!r.includes(def)) r.unshift(def);
      return [...new Set(r)];
    };
    out.rods = idList(p.rods, D.ROD, 'twig');
    out.boats = idList(p.boats, D.BOAT, 'dinghy');
    out.weapons = idList(p.weapons, D.WEAPON, 'pistol');
    out.rod = out.rods.includes(p.rod) ? p.rod : 'twig';
    out.boat = out.boats.includes(p.boat) ? p.boat : 'dinghy';
    out.weapon = out.weapons.includes(p.weapon) ? p.weapon : 'pistol';
    for (const a of D.AMMO) out.ammo[a.id] = Math.floor(num(p.ammo && p.ammo[a.id], out.ammo[a.id] || 0, 1e6));
    out.baits = {};
    for (const b of D.BAITS) { const n = Math.floor(num(p.baits && p.baits[b.id], 0, 1e5)); if (n > 0) out.baits[b.id] = n; }
    out.bait = D.BAIT[p.bait] ? p.bait : 'worm';
    for (const u of D.UPGRADES) out.upg[u.id] = Math.floor(num(p.upg && p.upg[u.id], 0, u.prices.length));
    out.pots = Math.floor(num(p.pots, 1, 10));
    out.patches = Math.floor(num(p.patches, 1, 99));
    out.cargo = Array.isArray(p.cargo) ? p.cargo.filter((c) => c && D.SPECIES[c.s] && typeof c.w === 'number').slice(0, 200).map((c) => ({ s: c.s, w: +c.w })) : [];
    if (p.dex && typeof p.dex === 'object') for (const k in p.dex) if (D.SPECIES[k]) out.dex[k] = { n: num(p.dex[k].n, 1), b: num(p.dex[k].b, 0) };
    if (p.ach && typeof p.ach === 'object') for (const [id] of D.ACHIEVEMENTS) if (p.ach[id]) out.ach[id] = 1;
    if (Array.isArray(p.bounties)) out.bounties = p.bounties.filter((b) => b && typeof b.type === 'string').slice(0, 3);
    if (p.stats && typeof p.stats === 'object') {
      for (const k of ['caught', 'kills', 'earned', 'deaths', 'biggest', 'pvp', 'playtime']) out.stats[k] = num(p.stats[k], 0);
      if (p.stats.bosses) for (const b of D.BOSSES) if (p.stats.bosses[b.id]) out.stats.bosses[b.id] = num(p.stats.bosses[b.id], 0);
      if (p.stats.biomes) for (let i = 0; i < 7; i++) if (p.stats.biomes[i]) out.stats.biomes[i] = 1;
    }
    return out;
  }

  function boatStats(profile) {
    const b = D.BOAT[profile.boat] || D.BOATS[0];
    const u = profile.upg;
    return {
      boat: b,
      maxHp: Math.round(b.hp * (1 + 0.2 * u.hull)),
      armor: 1 - 0.06 * u.hull,
      thrust: b.thrust * (1 + 0.12 * u.engine),
      turn: b.turn, mass: b.mass, r: b.r,
      cargoMax: b.cargo + 6 * u.cargo,
      luck: 0.6 * u.luck,
    };
  }

  function sellPrice(item, market) {
    const sp = D.SPECIES[item.s];
    if (!sp) return 0;
    const size = sp.kind === 'treasure' ? 1 : 0.6 + 0.8 * clamp(item.w / sp.maxW, 0, 1.6);
    return Math.max(1, Math.round(sp.value * size * ((market && market[sp.kind]) || 1)));
  }

  // ---------------------------------------------------------------- world
  class World {
    constructor(opts = {}) {
      this.seed = opts.seed || 20260925;
      this.pvp = !!opts.pvp;
      this.t = 0;
      this.nextId = 1;
      this.players = new Map();
      this.creatures = [];
      this.projectiles = [];
      this.crates = [];
      this.pots = [];
      this.events = [];
      this.islands = D.makeIslands(this.seed);
      this.day = 0.3; // 0..1, 0.5 = noon
      this.weather = { kind: 'clear', left: 120, wind: 0, windA: 0 };
      this.market = {}; this.marketLeft = 0; this.rollMarket();
      this.spawnTimer = 0;
      this.worldBossTimer = rand(420, 720);
    }

    id() { return this.nextId++; }
    emit(ev) { this.events.push(ev); }
    msg(p, text, kind) { this.emit({ e: 'msg', to: p.id, text, kind: kind || 'info' }); }
    drainEvents() { const e = this.events; this.events = []; return e; }
    isNight() { return this.day > 0.74 || this.day < 0.22; }

    rollMarket() {
      for (const k of KIND_LIST) this.market[k] = k === 'treasure' ? 1 : +rand(0.7, 1.6).toFixed(2);
      this.marketLeft = 180;
    }

    inWater(x, y, pad = 0) {
      for (const is of this.islands) if (dist(x, y, is.x, is.y) < is.r + pad) return false;
      return Math.hypot(x, y) < D.WORLD_R;
    }

    // -------------------------------------------------------------- players
    addPlayer(id, name, profile) {
      const prof = fixProfile(profile, name);
      prof.name = name || prof.name;
      const st = boatStats(prof);
      const a = Math.random() * TAU;
      const p = {
        id, name: prof.name, profile: prof, st,
        x: Math.cos(a) * 380, y: Math.sin(a) * 380, a: a, vx: 0, vy: 0, va: 0,
        hp: st.maxHp, dead: false, respawn: 0, invuln: 3,
        input: { up: 0, down: 0, left: 0, right: 0, fire: 0, reel: 0, aim: 0 },
        fireCd: 0, spin: 0, patchCd: 0, outOfAmmoMsg: 0,
        fish: { state: 'idle' },
        session: { caught: 0, kills: 0, earned: 0 },
        dirty: true, color: `hsl(${Math.floor(Math.random() * 360)},70%,60%)`,
      };
      this.players.set(id, p);
      this.ensureBounties(p);
      this.emit({ e: 'join', name: p.name });
      return p;
    }

    removePlayer(id) {
      const p = this.players.get(id);
      if (!p) return null;
      this.players.delete(id);
      this.pots = this.pots.filter((pt) => pt.owner !== id);
      this.emit({ e: 'leave', name: p.name });
      return p.profile;
    }

    setInput(id, inp) {
      const p = this.players.get(id);
      if (!p) return;
      const i = p.input;
      i.up = inp.up ? 1 : 0; i.down = inp.down ? 1 : 0; i.left = inp.left ? 1 : 0; i.right = inp.right ? 1 : 0;
      i.fire = inp.fire ? 1 : 0; i.reel = inp.reel ? 1 : 0;
      if (typeof inp.aim === 'number' && isFinite(inp.aim)) i.aim = clamp(inp.aim, -10, 10);
    }

    refreshStats(p) {
      const hpFrac = p.hp / p.st.maxHp;
      p.st = boatStats(p.profile);
      p.hp = Math.min(p.st.maxHp, Math.max(1, Math.round(hpFrac * p.st.maxHp)));
      p.dirty = true;
    }

    atDock(p) { return Math.hypot(p.x, p.y) < D.DOCK_R && !p.dead; }
    inSafe(x, y) { return Math.hypot(x, y) < D.SAFE_R; }

    // -------------------------------------------------------------- actions
    // Every request is validated here — the server never trusts the client.
    act(id, a) {
      const p = this.players.get(id);
      if (!p || !a || typeof a.a !== 'string') return false;
      const pr = p.profile;
      switch (a.a) {
        case 'cast': return this.cast(p, +a.x, +a.y);
        case 'hook': return this.hook(p);
        case 'reelin': if (p.fish.state !== 'idle' && p.fish.state !== 'reel') { p.fish = { state: 'idle' }; } return true;
        case 'weapon': if (pr.weapons.includes(a.id)) { pr.weapon = a.id; p.spin = 0; p.dirty = true; return true; } return false;
        case 'bait': if (a.id === 'none' || (pr.baits[a.id] || 0) > 0) { pr.bait = a.id; p.dirty = true; return true; } return false;
        case 'rod': if (pr.rods.includes(a.id) && p.fish.state === 'idle') { pr.rod = a.id; p.dirty = true; return true; } return false;
        case 'boat':
          if (!this.atDock(p)) return this.msg(p, 'Switch boats at the harbor.', 'warn'), false;
          if (!pr.boats.includes(a.id)) return false;
          pr.boat = a.id; p.hp = boatStats(pr).maxHp; this.refreshStats(p); p.hp = p.st.maxHp; return true;
        case 'buy': return this.buy(p, a.cat, a.id);
        case 'sell': return this.sell(p, a.i);
        case 'sellall': return this.sell(p, 'all');
        case 'repair': return this.repair(p);
        case 'patch': return this.usePatch(p);
        case 'pot': return this.potAction(p);
        case 'bounty_reroll': return this.rerollBounties(p);
        default: return false;
      }
    }

    buy(p, cat, id) {
      const pr = p.profile;
      if (!this.atDock(p)) { this.msg(p, 'Sail to the harbor shop first.', 'warn'); return false; }
      const pay = (price) => {
        if (pr.money < price) { this.msg(p, 'Not enough money.', 'warn'); return false; }
        pr.money -= price; p.dirty = true; this.emit({ e: 'buy', to: p.id }); return true;
      };
      if (cat === 'rod') {
        const r = D.ROD[id]; if (!r || pr.rods.includes(id)) return false;
        if (!pay(r.price)) return false; pr.rods.push(id); pr.rod = id;
        if (id === 'trident') this.achieve(p, 'trident');
        return true;
      }
      if (cat === 'boat') {
        const b = D.BOAT[id]; if (!b || pr.boats.includes(id)) return false;
        if (!pay(b.price)) return false; pr.boats.push(id); pr.boat = id; this.refreshStats(p); p.hp = p.st.maxHp;
        if (id === 'dreadnought') this.achieve(p, 'dread');
        return true;
      }
      if (cat === 'weapon') {
        const w = D.WEAPON[id]; if (!w || pr.weapons.includes(id)) return false;
        if (!pay(w.price)) return false; pr.weapons.push(id); pr.weapon = id;
        return true;
      }
      if (cat === 'ammo') {
        const am = D.AMMO_BY[id]; if (!am) return false;
        if (!pay(am.price)) return false; pr.ammo[id] = (pr.ammo[id] || 0) + am.pack; return true;
      }
      if (cat === 'bait') {
        const b = D.BAIT[id]; if (!b || !b.pack) return false;
        if (!pay(b.price)) return false; pr.baits[id] = (pr.baits[id] || 0) + b.pack; pr.bait = id; return true;
      }
      if (cat === 'upg') {
        const u = D.UPGRADE[id]; if (!u) return false;
        const lvl = pr.upg[id]; if (lvl >= u.prices.length) return false;
        if (!pay(u.prices[lvl])) return false; pr.upg[id] = lvl + 1; this.refreshStats(p); return true;
      }
      if (cat === 'item') {
        const it = D.ITEM[id]; if (!it) return false;
        if (id === 'pot' && pr.pots >= 6) { this.msg(p, 'Max 6 crab pots.', 'warn'); return false; }
        if (id === 'patch' && pr.patches >= 20) { this.msg(p, 'Max 20 patches.', 'warn'); return false; }
        if (!pay(it.price)) return false;
        if (id === 'pot') pr.pots++; else pr.patches++;
        return true;
      }
      return false;
    }

    sell(p, i) {
      const pr = p.profile;
      if (!this.atDock(p)) { this.msg(p, 'Sell your catch at the harbor.', 'warn'); return false; }
      let total = 0;
      if (i === 'all') {
        for (const it of pr.cargo) total += sellPrice(it, this.market);
        if (!pr.cargo.length) return false;
        pr.cargo = [];
      } else {
        i = i | 0;
        if (i < 0 || i >= pr.cargo.length) return false;
        total = sellPrice(pr.cargo[i], this.market);
        pr.cargo.splice(i, 1);
      }
      this.pay(p, total);
      this.emit({ e: 'cash', to: p.id, amount: total });
      return true;
    }

    pay(p, amount) {
      const pr = p.profile;
      pr.money += amount; pr.stats.earned += amount; p.session.earned += amount; p.dirty = true;
      if (pr.stats.earned >= 10000) this.achieve(p, 'rich_10k');
      if (pr.stats.earned >= 1000000) this.achieve(p, 'rich_1m');
    }

    repair(p) {
      if (!this.atDock(p)) return false;
      const missing = p.st.maxHp - p.hp;
      if (missing <= 0) return false;
      const cost = Math.ceil(missing * 1.5);
      if (p.profile.money < cost) { this.msg(p, 'Not enough money to repair.', 'warn'); return false; }
      p.profile.money -= cost; p.hp = p.st.maxHp; p.dirty = true;
      this.emit({ e: 'repair', to: p.id });
      return true;
    }

    usePatch(p) {
      if (p.dead || p.patchCd > 0 || p.profile.patches <= 0 || p.hp >= p.st.maxHp) return false;
      p.profile.patches--; p.patchCd = 5; p.hp = Math.min(p.st.maxHp, p.hp + p.st.maxHp * 0.4); p.dirty = true;
      this.emit({ e: 'repair', to: p.id });
      return true;
    }

    potAction(p) {
      if (p.dead) return false;
      const near = this.pots.find((pt) => dist(pt.x, pt.y, p.x, p.y) < p.st.r + 70 && (pt.owner === p.id || (this.pvp && pt.t >= 60)));
      if (near) {
        if (near.t < 60) { this.msg(p, `Crab pot needs ${Math.ceil(60 - near.t)}s more.`); return false; }
        const pool = D.BY_BIOME[near.biome].filter((sid) => ['crab', 'lobster', 'shrimp'].includes(D.SPECIES[sid].kind));
        const n = 2 + Math.floor(Math.random() * 3);
        let got = 0;
        for (let k = 0; k < n; k++) {
          const sid = this.rollFrom(pool.map((s) => D.SPECIES[s]), 1 + p.st.luck, false, false);
          if (sid == null) continue;
          if (this.addCatch(p, sid, true)) got++;
        }
        this.pots.splice(this.pots.indexOf(near), 1);
        if (near.owner !== p.id) { const o = this.players.get(near.owner); if (o) this.msg(o, `${p.name} raided your crab pot!`, 'warn'); }
        this.msg(p, `Crab pot: ${got} catch${got === 1 ? '' : 'es'}!`, 'good');
        this.achieve(p, 'crabber');
        return true;
      }
      if (this.inSafe(p.x, p.y)) { this.msg(p, 'Drop crab pots outside the harbor.', 'warn'); return false; }
      const mine = this.pots.filter((pt) => pt.owner === p.id).length;
      if (mine >= p.profile.pots) { this.msg(p, 'All your crab pots are deployed.', 'warn'); return false; }
      this.pots.push({ id: this.id(), owner: p.id, x: p.x - Math.cos(p.a) * p.st.r * 1.5, y: p.y - Math.sin(p.a) * p.st.r * 1.5, biome: D.biomeAt(p.x, p.y), t: 0 });
      this.emit({ e: 'splash', x: p.x, y: p.y, s: 0.6 });
      return true;
    }

    // -------------------------------------------------------------- fishing
    cast(p, tx, ty) {
      if (p.dead || p.fish.state !== 'idle' || !isFinite(tx) || !isFinite(ty)) return false;
      const rod = D.ROD[p.profile.rod];
      let dx = tx - p.x, dy = ty - p.y;
      const d = Math.hypot(dx, dy) || 1;
      const reach = Math.min(d, rod.range);
      tx = p.x + (dx / d) * reach; ty = p.y + (dy / d) * reach;
      if (!this.inWater(tx, ty, 10)) { this.msg(p, "Can't cast onto land."); return false; }
      p.fish = { state: 'cast', sx: p.x, sy: p.y, x: tx, y: ty, t: 0, dur: 0.35 + reach / 900 };
      this.emit({ e: 'cast', x: p.x, y: p.y });
      return true;
    }

    currentBait(p) {
      const pr = p.profile;
      if (pr.bait !== 'none' && (pr.baits[pr.bait] || 0) <= 0) pr.bait = 'none';
      return D.BAIT[pr.bait];
    }

    consumeBait(p) {
      const pr = p.profile;
      if (pr.bait !== 'none' && pr.baits[pr.bait] > 0) { pr.baits[pr.bait]--; if (!pr.baits[pr.bait]) delete pr.baits[pr.bait]; p.dirty = true; }
    }

    rollFrom(list, luck, night, storm) {
      const pool = [];
      for (const sp of list) {
        if (sp.night && !night) continue;
        if (sp.storm && !storm) continue;
        pool.push([sp.id, D.RARITY[sp.rarity].weight * (1 + luck * sp.rarity * 0.3)]);
      }
      return pool.length ? pickWeighted(pool) : null;
    }

    hook(p) {
      const f = p.fish;
      if (f.state === 'bite') {
        const sp = D.SPECIES[f.sid];
        const w = +(sp.minW + (sp.maxW - sp.minW) * Math.pow(Math.random(), 2.2) * (Math.random() < 0.03 ? 1.5 : 1)).toFixed(2);
        const rod = D.ROD[p.profile.rod];
        const diff = 0.22 + sp.rarity * 0.14 + clamp(w / (sp.maxW || 1), 0, 1.5) * 0.18 + (sp.biome > 0 ? sp.biome * 0.03 : 0);
        this.consumeBait(p);
        p.fish = { state: 'reel', x: f.x, y: f.y, sid: f.sid, w, diff, force: diff, burst: 0, burstIn: rand(1, 2.5), progress: 0.25, tension: 0.15, rod: rod.id, t: 0 };
        this.emit({ e: 'hooked', to: p.id });
        return true;
      }
      if (f.state === 'wait' || f.state === 'cast') { p.fish = { state: 'idle' }; return true; }
      return false;
    }

    updateFishing(p, dt) {
      const f = p.fish;
      if (f.state === 'idle') return;
      const rod = D.ROD[p.profile.rod];
      if (f.state !== 'cast' && dist(p.x, p.y, f.x, f.y) > rod.range * 1.35) {
        p.fish = { state: 'idle' };
        this.emit({ e: 'snap', to: p.id, x: f.x, y: f.y });
        this.msg(p, 'Line snapped — you sailed too far!', 'warn');
        return;
      }
      if (f.state === 'cast') {
        f.t += dt;
        if (f.t >= f.dur) {
          f.state = 'wait';
          const bait = this.currentBait(p);
          if (bait.boss) {
            f.boss = bait.boss === true ? 'biome' : bait.boss;
            f.timer = 3;
          } else {
            const w = this.weather.kind;
            f.timer = rand(2.5, 9) * rod.speed * bait.speed * (w === 'storm' ? 0.75 : w === 'rain' ? 0.88 : 1);
          }
          this.emit({ e: 'splash', x: f.x, y: f.y, s: 0.5 });
        }
        return;
      }
      if (f.state === 'wait') {
        f.timer -= dt;
        if (f.timer <= 0) {
          if (f.boss) {
            const biome = D.biomeAt(f.x, f.y);
            let def = f.boss === 'biome' ? null : D.BOSS[f.boss];
            if (def && def.biome !== biome) { this.msg(p, `The ${def.name} only answers in the ${D.BIOMES[def.biome].name}.`, 'warn'); p.fish = { state: 'idle' }; return; }
            if (!def) { const opts = D.BOSSES.filter((b) => b.biome === biome && !b.final); def = opts[Math.floor(Math.random() * opts.length)]; }
            if (this.creatures.some((c) => c.boss)) { this.msg(p, 'A boss is already hunting these waters!', 'warn'); p.fish = { state: 'idle' }; return; }
            this.consumeBait(p);
            this.spawnBoss(def, f.x, f.y, p);
            p.fish = { state: 'idle' };
            return;
          }
          const biome = D.biomeAt(f.x, f.y);
          const luck = D.ROD[p.profile.rod].luck + this.currentBait(p).luck + p.st.luck + (this.weather.kind === 'storm' ? 1 : this.weather.kind === 'rain' ? 0.4 : 0);
          let sid;
          if (Math.random() < 0.025) sid = this.rollFrom(D.TREASURE_IDS.map((i) => D.SPECIES[i]), luck, true, true);
          else sid = this.rollFrom(D.BY_BIOME[biome].map((i) => D.SPECIES[i]), luck, this.isNight(), this.weather.kind === 'storm');
          if (sid == null) { f.timer = 3; return; }
          f.state = 'bite'; f.sid = sid; f.window = 1.1;
          this.emit({ e: 'bite', to: p.id, x: f.x, y: f.y });
        }
        return;
      }
      if (f.state === 'bite') {
        f.window -= dt;
        if (f.window <= 0) {
          f.state = 'wait'; f.timer = rand(2, 6) * rod.speed;
          this.msg(p, 'It got away... too slow!');
        }
        return;
      }
      if (f.state === 'reel') {
        f.t += dt;
        f.burstIn -= dt;
        if (f.burstIn <= 0) { f.burst = rand(0.5, 1.1); f.burstIn = rand(1.4, 3.2); this.emit({ e: 'thrash', to: p.id }); }
        if (f.burst > 0) f.burst -= dt;
        f.force = f.diff * (0.75 + 0.25 * Math.sin(f.t * 3.1)) * (f.burst > 0 ? 1.9 : 1);
        const R = D.ROD[f.rod] || rod;
        if (p.input.reel) {
          f.tension += (f.force * 1.1 - R.strength * 0.33 + 0.18) * dt * 1.35;
          f.progress += R.power * 0.15 * (1 - Math.min(0.8, f.force * 0.5)) * dt;
        } else {
          f.tension -= 0.75 * dt;
          f.progress -= f.force * 0.07 * dt;
        }
        f.tension = Math.max(0, f.tension);
        // the bobber thrashes around physically
        f.x += Math.cos(f.t * 7) * f.force * 40 * dt; f.y += Math.sin(f.t * 5.3) * f.force * 40 * dt;
        if (f.tension >= 1) {
          p.fish = { state: 'idle' };
          this.emit({ e: 'snap', to: p.id, x: f.x, y: f.y });
          this.msg(p, `SNAP! The ${D.SPECIES[f.sid].name} broke your line.`, 'bad');
        } else if (f.progress <= 0) {
          p.fish = { state: 'idle' };
          this.msg(p, 'The fish escaped!', 'warn');
          this.emit({ e: 'escape', to: p.id });
        } else if (f.progress >= 1) {
          p.fish = { state: 'idle' };
          this.addCatch(p, f.sid, false, f.w);
          this.emit({ e: 'splash', x: f.x, y: f.y, s: 0.8 });
        }
      }
    }

    addCatch(p, sid, quiet, weight) {
      const sp = D.SPECIES[sid];
      const pr = p.profile;
      const w = weight != null ? weight : +(sp.minW + (sp.maxW - sp.minW) * Math.pow(Math.random(), 2)).toFixed(2);
      const first = !pr.dex[sid];
      const d = pr.dex[sid] || (pr.dex[sid] = { n: 0, b: 0 });
      d.n++; if (w > d.b) d.b = w;
      pr.stats.caught++; p.session.caught++;
      if (sp.biome >= 0) pr.stats.biomes[sp.biome] = 1;
      if (w > pr.stats.biggest) pr.stats.biggest = w;
      p.dirty = true;
      let stored = false;
      if (pr.cargo.length < p.st.cargoMax) { pr.cargo.push({ s: sid, w }); stored = true; }
      else this.msg(p, 'Cargo hold full! Sell at the harbor. (Logged in bestiary)', 'warn');
      this.emit({ e: 'catch', to: p.id, s: sid, w, first, quiet: !!quiet, stored });
      if (sp.rarity >= 4 && !quiet) this.emit({ e: 'announce', text: `${p.name} caught a ${D.RARITY[sp.rarity].name} ${sp.name}!` });
      this.progressBounty(p, 'catch', sp);
      this.checkCatchAch(p, sp);
      return stored;
    }

    checkCatchAch(p, sp) {
      const pr = p.profile, n = pr.stats.caught, dex = Object.keys(pr.dex).length;
      this.achieve(p, 'first_catch');
      if (n >= 10) this.achieve(p, 'catch_10');
      if (n >= 100) this.achieve(p, 'catch_100');
      if (n >= 1000) this.achieve(p, 'catch_1000');
      if (dex >= 25) this.achieve(p, 'dex_25');
      if (dex >= 100) this.achieve(p, 'dex_100');
      if (dex >= 500) this.achieve(p, 'dex_500');
      if (dex >= D.SPECIES.length) this.achieve(p, 'dex_all');
      if (sp.rarity >= 2) this.achieve(p, 'rare');
      if (sp.rarity >= 4) this.achieve(p, 'legendary');
      if (sp.rarity >= 5) this.achieve(p, 'mythic');
      if (sp.kind === 'treasure') this.achieve(p, 'treasure');
      if (Object.keys(pr.stats.biomes).length >= 7) this.achieve(p, 'explorer');
    }

    achieve(p, id) {
      if (p.profile.ach[id]) return;
      p.profile.ach[id] = 1; p.dirty = true;
      this.emit({ e: 'ach', to: p.id, id });
    }

    // -------------------------------------------------------------- bounties
    ensureBounties(p) {
      const b = p.profile.bounties;
      while (b.length < 3) b.push(this.makeBounty(p));
    }

    makeBounty(p) {
      const tier = Math.min(6, Math.floor(Math.log10(Math.max(10, p.profile.stats.earned)) - 1));
      const r = Math.random();
      if (r < 0.3) { const n = 3 + Math.floor(Math.random() * 8); return { type: 'catch', n, got: 0, reward: 60 * n * (1 + tier), text: `Catch ${n} fish` }; }
      if (r < 0.5) { const rar = Math.min(3, 1 + Math.floor(Math.random() * (1 + tier / 2))); const n = 1 + Math.floor(Math.random() * 3); return { type: 'catch', rarity: rar, n, got: 0, reward: 250 * n * Math.pow(2.5, rar) * (1 + tier * 0.5) | 0, text: `Catch ${n} ${D.RARITY[rar].name}+ fish` }; }
      if (r < 0.65) { const kinds = ['crab', 'eel', 'shark', 'squid', 'ray', 'jelly', 'lobster']; const k = kinds[Math.floor(Math.random() * kinds.length)]; const n = 1 + Math.floor(Math.random() * 3); return { type: 'catch', kind: k, n, got: 0, reward: 400 * n * (1 + tier), text: `Catch ${n} ${k === 'shark' ? 'shark' : k}${n > 1 ? 's' : ''}` }; }
      if (r < 0.9) { const n = 5 + Math.floor(Math.random() * 15); return { type: 'kill', n, got: 0, reward: 50 * n * (1 + tier), text: `Kill ${n} sea creatures` }; }
      return { type: 'boss', n: 1, got: 0, reward: 5000 * (1 + tier * 2), text: 'Defeat any boss' };
    }

    progressBounty(p, type, sp) {
      const pr = p.profile;
      let changed = false;
      for (let i = 0; i < pr.bounties.length; i++) {
        const b = pr.bounties[i];
        if (b.type !== type) continue;
        if (type === 'catch' && sp) {
          if (b.rarity != null && sp.rarity < b.rarity) continue;
          if (b.kind && sp.kind !== b.kind) continue;
        }
        b.got++; changed = true;
        if (b.got >= b.n) {
          this.pay(p, b.reward);
          this.emit({ e: 'bounty', to: p.id, text: b.text, reward: b.reward });
          pr.bounties[i] = this.makeBounty(p);
        }
      }
      if (changed) p.dirty = true;
    }

    rerollBounties(p) {
      if (!this.atDock(p) || p.profile.money < 200) return false;
      p.profile.money -= 200; p.profile.bounties = []; this.ensureBounties(p); p.dirty = true; return true;
    }

    // -------------------------------------------------------------- combat
    fire(p, dt) {
      const pr = p.profile;
      const w = D.WEAPON[pr.weapon];
      if (!w || p.dead) return;
      if (w.spin) { p.spin = Math.min(w.spin, p.spin + dt); if (p.spin < w.spin) return; }
      if (p.fireCd > 0) return;
      if (this.inSafe(p.x, p.y)) { if (p.outOfAmmoMsg <= 0) { this.msg(p, 'No shooting in the harbor.'); p.outOfAmmoMsg = 2; } return; }
      if ((pr.ammo[w.ammo] || 0) <= 0) {
        if (p.outOfAmmoMsg <= 0) { this.msg(p, `Out of ${D.AMMO_BY[w.ammo].name}! Buy more at the harbor.`, 'warn'); p.outOfAmmoMsg = 3; this.emit({ e: 'click', to: p.id }); }
        return;
      }
      pr.ammo[w.ammo]--;
      p.fireCd = 1 / w.rate;
      const aim = p.input.aim;
      const mx = p.x + Math.cos(aim) * (p.st.r + 6), my = p.y + Math.sin(aim) * (p.st.r + 6);
      const dmgMul = p.st.boat.dmgMul;
      for (let k = 0; k < w.pellets; k++) {
        const a = aim + (Math.random() - 0.5) * 2 * w.spread;
        const sp = w.speed * (w.pellets > 1 ? rand(0.85, 1.1) : 1);
        this.projectiles.push({
          x: mx, y: my, vx: Math.cos(a) * sp + p.vx * 0.5, vy: Math.sin(a) * sp + p.vy * 0.5,
          life: w.life, dmg: w.dmg * dmgMul, owner: p.id, team: 'p', kind: w.id, pierce: w.pierce || 0,
          splash: w.splash || 0, knock: w.knock || 0, pull: w.pull || 0, flame: !!w.flame, hit: null, r: w.flame ? 14 : 4,
        });
      }
      p.vx -= (Math.cos(aim) * w.recoil) / p.st.mass;
      p.vy -= (Math.sin(aim) * w.recoil) / p.st.mass;
      this.emit({ e: 'shot', x: mx, y: my, a: aim, w: w.id, pid: p.id });
    }

    hurtCreature(c, dmg, src, x, y, kx, ky) {
      if (c.dead) return;
      c.hp -= dmg;
      c.vx += (kx || 0) / c.mass; c.vy += (ky || 0) / c.mass;
      if (src) { c.dmgBy[src.id] = (c.dmgBy[src.id] || 0) + dmg; if (!c.boss || Math.random() < 0.3) c.target = src.id; }
      c.flash = 0.08;
      this.emit({ e: 'hit', x, y, c: c.blood, n: Math.min(14, 2 + dmg / 8) });
      if (c.hp <= 0) this.killCreature(c, src);
    }

    killCreature(c, killer) {
      c.dead = true;
      this.emit({ e: 'die', x: c.x, y: c.y, r: c.r, c: c.blood, col: c.color, look: c.look, boss: !!c.boss });
      if (c.boss) {
        const def = c.bossDef;
        this.emit({ e: 'bossdead', name: def.name });
        for (const pid of Object.keys(c.dmgBy)) {
          const p = this.players.get(+pid) || this.players.get(pid);
          if (!p) continue;
          const reward = Math.round(def.reward * (0.5 + 0.5 * Math.min(1, c.dmgBy[pid] / (c.maxHp * 0.15))));
          this.pay(p, reward);
          this.emit({ e: 'cash', to: p.id, amount: reward });
          this.msg(p, `${def.name} slain! +$${reward.toLocaleString()}`, 'good');
          const bs = p.profile.stats.bosses; bs[def.id] = (bs[def.id] || 0) + 1;
          this.achieve(p, 'boss_1');
          if (def.final) this.achieve(p, 'leviathan');
          if (D.BOSSES.every((b) => bs[b.id])) this.achieve(p, 'boss_all');
          this.progressBounty(p, 'boss');
        }
        for (let k = 0; k < 6; k++) this.dropCrate(c.x + rand(-c.r, c.r), c.y + rand(-c.r, c.r), { money: Math.round(def.reward * 0.05), ammo: this.randomAmmo(3) });
        return;
      }
      if (killer) {
        const pr = killer.profile;
        pr.stats.kills++; killer.session.kills++;
        this.pay(killer, c.bounty);
        this.achieve(killer, 'kill_1');
        if (pr.stats.kills >= 100) this.achieve(killer, 'kill_100');
        if (pr.stats.kills >= 1000) this.achieve(killer, 'kill_1000');
        this.progressBounty(killer, 'kill');
        this.emit({ e: 'kill', to: killer.id, name: c.name, bounty: c.bounty });
      }
      if (Math.random() < 0.18) this.dropCrate(c.x, c.y, { money: Math.round(c.bounty * rand(0.5, 2)), ammo: this.randomAmmo(1) });
    }

    randomAmmo(mult) {
      const a = D.AMMO[Math.floor(Math.random() * 5)];
      return { [a.id]: Math.max(1, Math.round(a.pack * 0.2 * mult)) };
    }

    dropCrate(x, y, contents, kind) {
      if (!this.inWater(x, y)) return;
      this.crates.push({ id: this.id(), x, y, vx: rand(-60, 60), vy: rand(-60, 60), life: kind === 'wreck' ? 180 : 90, kind: kind || 'loot', c: contents });
    }

    hurtPlayer(p, dmg, src, kx, ky) {
      if (p.dead || p.invuln > 0) return;
      if (this.inSafe(p.x, p.y)) return;
      const d = dmg * p.st.armor;
      p.hp -= d;
      p.vx += (kx || 0) / p.st.mass; p.vy += (ky || 0) / p.st.mass;
      p.lastHit = src || null;
      this.emit({ e: 'phit', x: p.x, y: p.y, pid: p.id, n: Math.min(10, 2 + d / 6) });
      if (p.hp <= 0) this.sink(p, src);
    }

    sink(p, src) {
      p.dead = true; p.hp = 0; p.respawn = 6; p.fish = { state: 'idle' };
      const pr = p.profile;
      pr.stats.deaths++;
      this.achieve(p, 'sink');
      const lostMoney = Math.floor(pr.money * 0.1);
      pr.money -= lostMoney;
      if (pr.cargo.length || lostMoney) this.dropCrate(p.x, p.y, { cargo: pr.cargo, money: lostMoney }, 'wreck');
      pr.cargo = [];
      p.dirty = true;
      this.emit({ e: 'sink', x: p.x, y: p.y, pid: p.id, boat: pr.boat });
      let by = 'the sea';
      if (src && src.profile) { by = src.name; src.profile.stats.pvp++; this.achieve(src, 'pvp'); src.session.kills++; }
      else if (src && src.name) by = src.name;
      this.emit({ e: 'announce', text: `${p.name} was sunk by ${by}` });
    }

    // -------------------------------------------------------------- spawning
    spawnCreature(type, x, y, extra) {
      const T = D.CREATURES[type];
      const c = {
        id: this.id(), type, name: T.name, look: T.look, x, y, vx: 0, vy: 0, a: Math.random() * TAU,
        hp: T.hp, maxHp: T.hp, r: T.r, speed: T.speed, dmg: T.dmg, ai: T.ai, shot: T.shot,
        color: T.color, blood: T.blood, bounty: T.bounty, mass: T.mass, cd: rand(0.5, 1.5),
        target: null, wander: Math.random() * TAU, dmgBy: {}, flash: 0, age: 0,
      };
      Object.assign(c, extra || {});
      this.creatures.push(c);
      return c;
    }

    spawnBoss(def, x, y, summoner) {
      const n = Math.max(1, this.players.size);
      const hp = Math.round(def.hp * (1 + 0.55 * (n - 1)));
      const c = this.spawnCreature(def.minion || 'crab', x, y, {
        boss: true, bossDef: def, type: 'boss', name: def.name, look: def.look, hp, maxHp: hp, r: def.r,
        speed: def.speed, dmg: def.dmg, color: def.color, blood: def.blood, mass: def.r / 8, bounty: 0,
        pattern: -1, pstate: 'idle', ptimer: 2.5, phase: 1,
      });
      if (summoner) c.target = summoner.id;
      this.emit({ e: 'boss', name: def.name, x, y, id: c.id });
      this.emit({ e: 'boom', x, y, r: def.r * 1.5, water: true });
      return c;
    }

    spawnAround(p) {
      if (this.inSafe(p.x, p.y) && Math.hypot(p.x, p.y) < D.SAFE_R - 200) return;
      const biome = D.biomeAt(p.x, p.y);
      let near = 0;
      for (const c of this.creatures) if (!c.boss && dist(c.x, c.y, p.x, p.y) < 1500) near++;
      const cap = Math.round(3 + D.BIOMES[biome].danger * 4 + (this.isNight() ? 2 : 0) + (this.weather.kind === 'storm' ? 2 : 0));
      if (near >= cap || this.creatures.length > 160) return;
      const a = Math.random() * TAU, d = rand(950, 1350);
      const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
      if (!this.inWater(x, y, 40) || this.inSafe(x, y)) return;
      const type = pickWeighted(D.SPAWNS[D.biomeAt(x, y)]);
      const group = D.CREATURES[type].group || 1;
      for (let k = 0; k < group; k++) this.spawnCreature(type, x + rand(-60, 60), y + rand(-60, 60));
    }

    // -------------------------------------------------------------- update
    step(dt) {
      this.t += dt;
      this.day = (this.day + dt / 480) % 1;
      this.updateWeather(dt);
      this.marketLeft -= dt; if (this.marketLeft <= 0) { this.rollMarket(); this.emit({ e: 'market' }); }

      for (const p of this.players.values()) this.updatePlayer(p, dt);
      this.collidePlayers();
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) { this.spawnTimer = 0.8; for (const p of this.players.values()) if (!p.dead) this.spawnAround(p); }
      this.worldBossTimer -= dt;
      if (this.worldBossTimer <= 0) this.worldBossEvent();
      for (const c of this.creatures) this.updateCreature(c, dt);
      this.creatures = this.creatures.filter((c) => !c.dead && !c.gone);
      this.updateProjectiles(dt);
      this.updateCrates(dt);
      for (const pt of this.pots) { const was = pt.t < 60; pt.t += dt; if (was && pt.t >= 60) { const o = this.players.get(pt.owner); if (o) this.msg(o, 'A crab pot is ready to collect!', 'good'); } }
    }

    worldBossEvent() {
      this.worldBossTimer = rand(540, 900);
      if (this.creatures.some((c) => c.boss)) return;
      const cands = [...this.players.values()].filter((p) => !p.dead && Math.hypot(p.x, p.y) > 1100);
      if (!cands.length) { this.worldBossTimer = 60; return; }
      const p = cands[Math.floor(Math.random() * cands.length)];
      const biome = D.biomeAt(p.x, p.y);
      const opts = D.BOSSES.filter((b) => b.biome === biome && !b.final);
      const def = opts[Math.floor(Math.random() * opts.length)];
      const a = Math.random() * TAU;
      const x = p.x + Math.cos(a) * 700, y = p.y + Math.sin(a) * 700;
      if (!this.inWater(x, y, def.r)) { this.worldBossTimer = 30; return; }
      this.emit({ e: 'announce', text: `WORLD BOSS: ${def.name} has surfaced near ${p.name}!` });
      this.spawnBoss(def, x, y, p);
    }

    updateWeather(dt) {
      const w = this.weather;
      w.left -= dt;
      if (w.left <= 0) {
        w.kind = pickWeighted([['clear', 5], ['rain', 3], ['fog', 2], ['storm', 1.6]]);
        w.left = rand(90, 220);
        w.windA = Math.random() * TAU;
        w.wind = w.kind === 'storm' ? rand(60, 110) : w.kind === 'rain' ? rand(10, 30) : rand(0, 12);
        this.emit({ e: 'weather', kind: w.kind });
      }
      if (w.kind === 'storm' && Math.random() < dt / 5) {
        const ps = [...this.players.values()].filter((p) => !p.dead);
        if (ps.length) {
          const p = ps[Math.floor(Math.random() * ps.length)];
          const x = p.x + rand(-600, 600), y = p.y + rand(-450, 450);
          this.emit({ e: 'lightning', x, y });
          for (const q of ps) if (dist(q.x, q.y, x, y) < 90) this.hurtPlayer(q, 35, { name: 'lightning' });
          for (const c of this.creatures) if (dist(c.x, c.y, x, y) < 90) this.hurtCreature(c, 120, null, c.x, c.y);
        }
      }
    }

    updatePlayer(p, dt) {
      if (p.dead) {
        p.respawn -= dt;
        if (p.respawn <= 0) {
          const a = Math.random() * TAU;
          p.dead = false; p.hp = p.st.maxHp; p.invuln = 3;
          p.x = Math.cos(a) * 380; p.y = Math.sin(a) * 380; p.vx = p.vy = p.va = 0; p.a = a;
          p.dirty = true;
          this.emit({ e: 'respawn', pid: p.id });
        }
        return;
      }
      p.profile.stats.playtime += dt;
      p.invuln = Math.max(0, p.invuln - dt);
      p.fireCd -= dt; p.patchCd -= dt; p.outOfAmmoMsg -= dt;
      const i = p.input, st = p.st;
      // --- boat physics: thrust along heading, rudder turning, keel drag
      const fx = Math.cos(p.a), fy = Math.sin(p.a);
      let vf = p.vx * fx + p.vy * fy;          // forward speed
      let vl = -p.vx * fy + p.vy * fx;         // lateral (sideways) speed
      const thrust = (i.up ? 1 : 0) - (i.down ? 0.5 : 0);
      vf += (thrust * st.thrust / st.mass) * dt;
      vf *= Math.exp(-1.1 * dt);
      vl *= Math.exp(-4.5 * dt);                // keel resists sliding
      const steer = (i.right ? 1 : 0) - (i.left ? 1 : 0);
      const rudder = 0.35 + Math.min(1, Math.abs(vf) / 160);
      p.va += steer * st.turn * rudder * 6 * dt * Math.sign(vf >= -5 ? 1 : -1);
      p.va *= Math.exp(-6 * dt);
      p.a += p.va * dt;
      p.vx = fx * vf - fy * vl; p.vy = fy * vf + fx * vl;
      // wind / storm currents push everything around
      const w = this.weather;
      p.vx += Math.cos(w.windA) * w.wind * 0.25 * dt; p.vy += Math.sin(w.windA) * w.wind * 0.25 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      this.collideIslands(p, st.r, (impact) => { if (impact > 180) this.hurtPlayer(p, (impact - 180) * 0.08, { name: 'the rocks' }); });
      const d = Math.hypot(p.x, p.y);
      if (d > D.WORLD_R) { const k = (d - D.WORLD_R) * 3; p.vx -= (p.x / d) * k * dt; p.vy -= (p.y / d) * k * dt; }
      // harbor regen
      if (Math.hypot(p.x, p.y) < D.SAFE_R && p.hp < st.maxHp) p.hp = Math.min(st.maxHp, p.hp + st.maxHp * 0.02 * dt);
      if (i.fire) this.fire(p, dt); else p.spin = Math.max(0, p.spin - dt * 2);
      this.updateFishing(p, dt);
      for (const c of this.crates) {
        if (dist(c.x, c.y, p.x, p.y) < st.r + 22) this.pickupCrate(p, c);
      }
    }

    pickupCrate(p, c) {
      if (c.taken) return;
      const pr = p.profile, k = c.c;
      if (k.money) { this.pay(p, k.money); this.emit({ e: 'cash', to: p.id, amount: k.money }); k.money = 0; }
      if (k.ammo) { for (const a in k.ammo) if (pr.ammo[a] != null) pr.ammo[a] += k.ammo[a]; this.msg(p, 'Picked up ammo.', 'good'); k.ammo = null; }
      if (k.cargo && k.cargo.length) {
        let n = 0;
        while (k.cargo.length && pr.cargo.length < p.st.cargoMax) { pr.cargo.push(k.cargo.shift()); n++; }
        if (n) this.msg(p, `Salvaged ${n} fish from the wreck!`, 'good');
      }
      p.dirty = true;
      if (!k.cargo || !k.cargo.length) { c.taken = true; this.emit({ e: 'pickup', x: c.x, y: c.y, to: p.id }); }
    }

    collideIslands(o, r, onImpact) {
      for (const is of this.islands) {
        const dx = o.x - is.x, dy = o.y - is.y;
        const d = Math.hypot(dx, dy), min = is.r + r;
        if (d < min && d > 0.001) {
          const nx = dx / d, ny = dy / d;
          o.x = is.x + nx * min; o.y = is.y + ny * min;
          const vn = o.vx * nx + o.vy * ny;
          if (vn < 0) { o.vx -= 1.5 * vn * nx; o.vy -= 1.5 * vn * ny; if (onImpact) onImpact(-vn); }
        }
      }
    }

    collidePlayers() {
      const ps = [...this.players.values()].filter((p) => !p.dead);
      for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
        const a = ps[i], b = ps[j];
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), min = a.st.r + b.st.r;
        if (d >= min || d < 0.001) continue;
        const nx = dx / d, ny = dy / d, ma = a.st.mass, mb = b.st.mass;
        const push = (min - d) / (ma + mb);
        a.x -= nx * push * mb; a.y -= ny * push * mb; b.x += nx * push * ma; b.y += ny * push * ma;
        const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rv < 0) {
          const j2 = (-(1 + 0.4) * rv) / (1 / ma + 1 / mb);
          a.vx -= (j2 * nx) / ma; a.vy -= (j2 * ny) / ma; b.vx += (j2 * nx) / mb; b.vy += (j2 * ny) / mb;
          if (this.pvp && -rv > 150) { this.hurtPlayer(a, (-rv - 150) * 0.1 * mb, b); this.hurtPlayer(b, (-rv - 150) * 0.1 * ma, a); }
        }
      }
    }

    nearestPlayer(x, y, maxD) {
      let best = null, bd = maxD;
      for (const p of this.players.values()) {
        if (p.dead || this.inSafe(p.x, p.y)) continue;
        const d = dist(x, y, p.x, p.y);
        if (d < bd) { bd = d; best = p; }
      }
      return best;
    }

    updateCreature(c, dt) {
      c.age += dt; c.cd -= dt; c.flash = Math.max(0, c.flash - dt);
      let nearestD = Infinity;
      for (const p of this.players.values()) nearestD = Math.min(nearestD, dist(c.x, c.y, p.x, p.y));
      if (!c.boss && nearestD > 2700) { c.gone = true; return; }
      if (c.boss && nearestD > 4200) { c.lost = (c.lost || 0) + dt; if (c.lost > 45) { c.gone = true; this.emit({ e: 'announce', text: `${c.name} sinks back into the deep...` }); return; } } else c.lost = 0;

      let tgt = c.target != null ? this.players.get(c.target) : null;
      if (!tgt || tgt.dead || this.inSafe(tgt.x, tgt.y) || dist(c.x, c.y, tgt.x, tgt.y) > (c.boss ? 2400 : 900)) {
        tgt = this.nearestPlayer(c.x, c.y, c.boss ? 1800 : 560 + (this.isNight() ? 200 : 0));
        c.target = tgt ? tgt.id : null;
      }
      if (c.boss) this.bossAI(c, tgt, dt);
      else this.creatureAI(c, tgt, dt);

      c.vx *= Math.exp(-2.2 * dt); c.vy *= Math.exp(-2.2 * dt);
      const w = this.weather;
      c.vx += Math.cos(w.windA) * w.wind * 0.1 * dt; c.vy += Math.sin(w.windA) * w.wind * 0.1 * dt;
      c.x += c.vx * dt; c.y += c.vy * dt;
      if (Math.hypot(c.vx, c.vy) > 5) c.a = Math.atan2(c.vy, c.vx);
      this.collideIslands(c, c.r * 0.8);
      // monsters refuse to enter the harbor
      const hd = Math.hypot(c.x, c.y);
      if (hd < D.SAFE_R + c.r) { c.x = (c.x / hd) * (D.SAFE_R + c.r); c.y = (c.y / hd) * (D.SAFE_R + c.r); c.vx += (c.x / hd) * 40; c.vy += (c.y / hd) * 40; }
      // body contact with boats
      for (const p of this.players.values()) {
        if (p.dead) continue;
        const dx = p.x - c.x, dy = p.y - c.y, d = Math.hypot(dx, dy), min = p.st.r + c.r * 0.85;
        if (d < min && d > 0.001) {
          const nx = dx / d, ny = dy / d, tot = p.st.mass + c.mass;
          const push = min - d;
          p.x += nx * push * (c.mass / tot); p.y += ny * push * (c.mass / tot);
          c.x -= nx * push * (p.st.mass / tot); c.y -= ny * push * (p.st.mass / tot);
          if (c.ai !== 'jelly' && c.cd <= 0 && c.target === p.id) {
            c.cd = c.boss ? 0.7 : 1.0;
            const force = c.boss && c.pstate === 'charge' ? 900 : 250;
            this.hurtPlayer(p, c.boss && c.pstate === 'charge' ? c.dmg * 1.6 : c.dmg, c, nx * force, ny * force);
            this.emit({ e: 'chomp', x: (p.x + c.x) / 2, y: (p.y + c.y) / 2, big: !!c.boss });
            c.vx -= nx * 150; c.vy -= ny * 150;
          }
        }
      }
    }

    creatureAI(c, tgt, dt) {
      const accel = c.speed * 2.6;
      const steer = (ang, mul = 1) => { c.vx += Math.cos(ang) * accel * mul * dt; c.vy += Math.sin(ang) * accel * mul * dt; };
      if (!tgt) {
        c.wander += rand(-1.5, 1.5) * dt;
        steer(c.wander, 0.25);
        return;
      }
      const ang = Math.atan2(tgt.y - c.y, tgt.x - c.x);
      const d = dist(c.x, c.y, tgt.x, tgt.y);
      if (c.ai === 'chase') steer(ang);
      else if (c.ai === 'swarm') steer(ang + Math.sin(c.age * 4 + c.id) * 0.8);
      else if (c.ai === 'jelly') {
        steer(ang, 0.3);
        if (d < 130 + tgt.st.r && c.cd <= 0) { c.cd = 1.6; this.emit({ e: 'zap', x1: c.x, y1: c.y, x2: tgt.x, y2: tgt.y }); this.hurtPlayer(tgt, c.dmg, c); }
      } else if (c.ai === 'ranged') {
        if (d > 380) steer(ang); else if (d < 260) steer(ang + Math.PI, 0.8); else steer(ang + Math.PI / 2, 0.5);
        if (d < 600 && c.cd <= 0) {
          c.cd = rand(1.6, 2.6);
          if (c.shot === 'zap') { this.emit({ e: 'zap', x1: c.x, y1: c.y, x2: tgt.x, y2: tgt.y }); this.hurtPlayer(tgt, c.dmg, c); }
          else this.enemyShot(c.x, c.y, ang, 420, c.dmg, c.shot, c);
        }
      }
      const sp = Math.hypot(c.vx, c.vy), max = c.speed;
      if (sp > max) { c.vx *= max / sp; c.vy *= max / sp; }
    }

    enemyShot(x, y, a, speed, dmg, kind, src) {
      this.projectiles.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: 2.2, dmg, owner: src ? src.id : 0, team: 'e', kind: kind || 'spit', pierce: 0, splash: 0, knock: 0, pull: 0, r: kind === 'fire' ? 10 : 8, src });
    }

    bossAI(c, tgt, dt) {
      const def = c.bossDef;
      const frac = c.hp / c.maxHp;
      const phase = frac < 0.33 ? 3 : frac < 0.66 ? 2 : 1;
      if (phase !== c.phase) { c.phase = phase; this.emit({ e: 'announce', text: `${def.name} is ENRAGED! (phase ${phase})` }); this.emit({ e: 'roar', x: c.x, y: c.y }); }
      const rage = 1 + (phase - 1) * 0.3;
      c.ptimer -= dt * rage;
      if (!tgt) { c.vx *= 0.98; c.vy *= 0.98; return; }
      const ang = Math.atan2(tgt.y - c.y, tgt.x - c.x);
      const d = dist(c.x, c.y, tgt.x, tgt.y);
      const accel = c.speed * 2;
      if (c.pstate === 'idle') {
        // stalk: approach to mid range, circle
        const want = d > 420 ? ang : ang + Math.PI / 2;
        c.vx += Math.cos(want) * accel * dt; c.vy += Math.sin(want) * accel * dt;
        const sp = Math.hypot(c.vx, c.vy);
        if (sp > c.speed) { c.vx *= c.speed / sp; c.vy *= c.speed / sp; }
        if (c.ptimer <= 0) {
          c.pattern = (c.pattern + 1) % def.patterns.length;
          c.pstate = def.patterns[c.pattern];
          c.pt = 0; c.pdone = false;
          if (c.pstate === 'charge') { c.chargeA = ang; this.emit({ e: 'warn', x: c.x, y: c.y, a: ang, kind: 'charge', id: c.id }); }
          if (c.pstate === 'slam') { c.slamX = tgt.x; c.slamY = tgt.y; c.slamR = 200 + c.r; this.emit({ e: 'warn', x: tgt.x, y: tgt.y, r: c.slamR, kind: 'slam', t: 1.1 }); }
          if (c.pstate === 'whirl') this.emit({ e: 'warn', x: c.x, y: c.y, r: 800, kind: 'whirl', t: 3.5, id: c.id });
          this.emit({ e: 'roar', x: c.x, y: c.y });
        }
        return;
      }
      c.pt += dt;
      const endPattern = () => { c.pstate = 'idle'; c.ptimer = 1.8 / rage; };
      switch (c.pstate) {
        case 'charge':
          if (c.pt < 0.7) { c.vx *= 0.9; c.vy *= 0.9; c.chargeA = ang; }
          else if (c.pt < 1.7) { c.vx = Math.cos(c.chargeA) * c.speed * 3.3; c.vy = Math.sin(c.chargeA) * c.speed * 3.3; if (Math.random() < 0.3) this.emit({ e: 'wake', x: c.x, y: c.y }); }
          else endPattern();
          break;
        case 'spray': {
          const shots = 10 + phase * 5;
          const idx = Math.floor((c.pt / 1.4) * shots);
          c.sprayed = c.sprayed || 0;
          while (c.sprayed < Math.min(idx, shots)) {
            const a = ang + (c.sprayed / shots - 0.5) * 1.1 + rand(-0.05, 0.05);
            this.enemyShot(c.x + Math.cos(a) * c.r, c.y + Math.sin(a) * c.r, a, 480, c.dmg * 0.45, def.biome === 5 ? 'fire' : 'spike', c);
            c.sprayed++;
          }
          if (c.pt > 1.5) { c.sprayed = 0; endPattern(); }
          break;
        }
        case 'nova':
          if (!c.pdone && c.pt > 0.6) {
            c.pdone = true;
            const n = 20 + phase * 8;
            for (let k = 0; k < n; k++) { const a = (k / n) * TAU + c.age; this.enemyShot(c.x + Math.cos(a) * c.r, c.y + Math.sin(a) * c.r, a, 380, c.dmg * 0.5, 'spike', c); }
            this.emit({ e: 'boom', x: c.x, y: c.y, r: c.r, water: true });
          }
          if (c.pt > 1.2) endPattern();
          break;
        case 'slam':
          c.vx *= 0.9; c.vy *= 0.9;
          if (!c.pdone && c.pt > 1.1) {
            c.pdone = true;
            this.emit({ e: 'boom', x: c.slamX, y: c.slamY, r: c.slamR, water: true });
            for (const p of this.players.values()) {
              const dd = dist(p.x, p.y, c.slamX, c.slamY);
              if (dd < c.slamR) { const a = Math.atan2(p.y - c.slamY, p.x - c.slamX); this.hurtPlayer(p, c.dmg * 1.5, c, Math.cos(a) * 1200, Math.sin(a) * 1200); }
            }
          }
          if (c.pt > 1.6) endPattern();
          break;
        case 'summon':
          if (!c.pdone && c.pt > 0.5) {
            c.pdone = true;
            const type = def.minion || 'piranha';
            for (let k = 0; k < 2 + phase; k++) { const a = Math.random() * TAU; this.spawnCreature(type, c.x + Math.cos(a) * (c.r + 50), c.y + Math.sin(a) * (c.r + 50), { target: tgt.id }); }
            this.emit({ e: 'boom', x: c.x, y: c.y, r: c.r * 0.8, water: true });
          }
          if (c.pt > 1.1) endPattern();
          break;
        case 'whirl':
          c.vx *= 0.9; c.vy *= 0.9;
          for (const p of this.players.values()) {
            if (p.dead || this.inSafe(p.x, p.y)) continue;
            const dd = dist(p.x, p.y, c.x, c.y);
            if (dd < 800 && dd > 1) {
              const a = Math.atan2(c.y - p.y, c.x - p.x);
              const pull = 260 * (1 - dd / 900) / p.st.mass;
              p.vx += (Math.cos(a) * pull + Math.cos(a + Math.PI / 2) * pull * 0.8) * dt;
              p.vy += (Math.sin(a) * pull + Math.sin(a + Math.PI / 2) * pull * 0.8) * dt;
            }
          }
          if (c.pt > 3.5) endPattern();
          break;
        case 'zap':
          if (!c.pdone && c.pt > 0.5) {
            c.pdone = true;
            let hits = 0;
            for (const p of this.players.values()) {
              if (p.dead || hits >= 2 + phase || dist(p.x, p.y, c.x, c.y) > 750) continue;
              hits++;
              this.emit({ e: 'zap', x1: c.x, y1: c.y, x2: p.x, y2: p.y, big: true });
              this.hurtPlayer(p, c.dmg * 0.9, c);
            }
          }
          if (c.pt > 1) endPattern();
          break;
        default: endPattern();
      }
    }

    updateProjectiles(dt) {
      const out = [];
      for (const pr of this.projectiles) {
        pr.life -= dt;
        const ox = pr.x, oy = pr.y;
        pr.x += pr.vx * dt; pr.y += pr.vy * dt;
        if (pr.flame) { pr.vx *= Math.exp(-2 * dt); pr.vy *= Math.exp(-2 * dt); pr.r += 30 * dt; }
        let dead = pr.life <= 0;
        if (!dead && !this.inWater(pr.x, pr.y)) { dead = true; if (!pr.flame) this.emit({ e: 'spark', x: pr.x, y: pr.y }); }
        if (!dead && pr.team === 'p') {
          const owner = this.players.get(pr.owner);
          for (const c of this.creatures) {
            if (c.dead || (pr.hit && pr.hit.has(c.id))) continue;
            if (segDist(ox, oy, pr.x, pr.y, c.x, c.y) < c.r + pr.r) {
              if (pr.splash) { dead = true; break; }
              const sp = Math.hypot(pr.vx, pr.vy) || 1;
              let kx = (pr.vx / sp) * 60, ky = (pr.vy / sp) * 60;
              if (pr.pull && owner) { const a = Math.atan2(owner.y - c.y, owner.x - c.x); kx = Math.cos(a) * pr.pull; ky = Math.sin(a) * pr.pull; this.emit({ e: 'harpoon', x1: owner.x, y1: owner.y, x2: c.x, y2: c.y }); }
              this.hurtCreature(c, pr.dmg, owner, pr.x, pr.y, kx, ky);
              (pr.hit || (pr.hit = new Set())).add(c.id);
              if (pr.pierce-- <= 0) { dead = true; break; }
            }
          }
          if (!dead && this.pvp && owner && !this.inSafe(pr.x, pr.y)) {
            for (const p of this.players.values()) {
              if (p.dead || p.id === pr.owner || (pr.hit && pr.hit.has('p' + p.id))) continue;
              if (segDist(ox, oy, pr.x, pr.y, p.x, p.y) < p.st.r + pr.r) {
                if (pr.splash) { dead = true; break; }
                this.hurtPlayer(p, pr.dmg * 0.5, owner, pr.vx * 0.05, pr.vy * 0.05);
                (pr.hit || (pr.hit = new Set())).add('p' + p.id);
                if (pr.pierce-- <= 0) { dead = true; break; }
              }
            }
          }
          if (dead && pr.splash) this.explode(pr.x, pr.y, pr.splash, pr.dmg, pr.knock, owner);
        } else if (!dead && pr.team === 'e') {
          for (const p of this.players.values()) {
            if (p.dead) continue;
            if (segDist(ox, oy, pr.x, pr.y, p.x, p.y) < p.st.r + pr.r) {
              this.hurtPlayer(p, pr.dmg, pr.src, pr.vx * 0.15, pr.vy * 0.15);
              if (pr.kind === 'ink') this.emit({ e: 'ink', to: p.id });
              dead = true; break;
            }
          }
        }
        if (!dead) out.push(pr);
      }
      this.projectiles = out;
    }

    explode(x, y, r, dmg, knock, owner) {
      this.emit({ e: 'boom', x, y, r });
      for (const c of this.creatures) {
        const d = dist(x, y, c.x, c.y);
        if (d < r + c.r) {
          const f = 1 - Math.min(1, d / (r + c.r)) * 0.6;
          const a = Math.atan2(c.y - y, c.x - x);
          this.hurtCreature(c, dmg * f, owner, c.x, c.y, Math.cos(a) * knock * f, Math.sin(a) * knock * f);
        }
      }
      for (const p of this.players.values()) {
        if (p.dead) continue;
        const d = dist(x, y, p.x, p.y);
        if (d < r + p.st.r) {
          const a = Math.atan2(p.y - y, p.x - x), f = 1 - Math.min(1, d / (r + p.st.r));
          p.vx += (Math.cos(a) * knock * f * 0.4) / p.st.mass; p.vy += (Math.sin(a) * knock * f * 0.4) / p.st.mass;
          if (this.pvp && owner && p.id !== owner.id) this.hurtPlayer(p, dmg * f * 0.5, owner);
        }
      }
    }

    updateCrates(dt) {
      for (const c of this.crates) {
        c.life -= dt; c.x += c.vx * dt; c.y += c.vy * dt; c.vx *= Math.exp(-1.5 * dt); c.vy *= Math.exp(-1.5 * dt);
        const w = this.weather; c.x += Math.cos(w.windA) * w.wind * 0.2 * dt; c.y += Math.sin(w.windA) * w.wind * 0.2 * dt;
      }
      this.crates = this.crates.filter((c) => c.life > 0 && !c.taken);
    }

    // -------------------------------------------------------------- network view
    // Compact per-player snapshot: only nearby entities, private data only for "me".
    snapshot(pid) {
      const me = this.players.get(pid);
      const cx = me ? me.x : 0, cy = me ? me.y : 0, R = 1700;
      const near = (x, y, pad = 0) => Math.abs(x - cx) < R + pad && Math.abs(y - cy) < R + pad;
      const players = [];
      for (const p of this.players.values()) {
        const f = p.fish;
        players.push({
          id: p.id, n: p.name, x: Math.round(p.x), y: Math.round(p.y), a: +p.a.toFixed(3), hp: Math.ceil(p.hp), mh: p.st.maxHp,
          b: p.profile.boat, w: p.profile.weapon, aim: +p.input.aim.toFixed(2), d: p.dead ? 1 : 0, inv: p.invuln > 0 ? 1 : 0,
          f: f.state === 'idle' ? null : [f.state, Math.round(f.x), Math.round(f.y), f.state === 'cast' ? +(f.t / f.dur).toFixed(2) : 0],
          c: p.color, sc: [p.session.caught, p.session.kills, p.session.earned], vx: Math.round(p.vx), vy: Math.round(p.vy),
        });
      }
      const cr = [];
      for (const c of this.creatures) if (c.boss || near(c.x, c.y, c.r)) cr.push([c.id, c.boss ? c.bossDef.id : c.type, Math.round(c.x), Math.round(c.y), +c.a.toFixed(2), Math.ceil(c.hp), c.maxHp, c.r, c.flash > 0 ? 1 : 0, c.boss ? c.pstate : 0]);
      const pj = [];
      for (const p of this.projectiles) if (near(p.x, p.y)) pj.push([Math.round(p.x), Math.round(p.y), Math.round(p.vx), Math.round(p.vy), p.kind, Math.round(p.r)]);
      const crates = this.crates.filter((c) => near(c.x, c.y)).map((c) => [c.id, Math.round(c.x), Math.round(c.y), c.kind]);
      const pots = this.pots.filter((p) => p.owner === pid || near(p.x, p.y)).map((p) => [p.id, Math.round(p.x), Math.round(p.y), p.owner === pid ? 1 : 0, Math.min(60, Math.floor(p.t))]);
      const snap = { t: +this.t.toFixed(2), day: +this.day.toFixed(4), wx: this.weather.kind, wa: +this.weather.windA.toFixed(2), wv: Math.round(this.weather.wind), pvp: this.pvp, players, cr, pj, crates, pots };
      if (me) {
        const f = me.fish;
        snap.me = {
          ammo: me.profile.ammo[D.WEAPON[me.profile.weapon].ammo] || 0, spin: me.spin, patchCd: Math.max(0, me.patchCd), respawn: Math.max(0, me.respawn),
          reel: f.state === 'reel' ? { p: +f.progress.toFixed(3), t: +f.tension.toFixed(3), f: +f.force.toFixed(2), burst: f.burst > 0 ? 1 : 0, sid: f.sid } : null,
          bite: f.state === 'bite' ? 1 : 0,
        };
      }
      return snap;
    }
  }

  return { World, newProfile, fixProfile, boatStats, sellPrice, KIND_LIST };
});
