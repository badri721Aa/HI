/*
 * DEEP WATERS — client: game loop, input, networking, camera, lighting, HUD.
 */
(function () {
  'use strict';
  const D = window.SeaData, Sim = window.SeaSim, R = window.SeaRender, FX = R.fx, Sfx = window.Sfx;
  const TAU = Math.PI * 2;
  const $ = (id) => document.getElementById(id);
  const cv = $('game'), ctx = cv.getContext('2d');
  let W = 0, H = 0, DPR = 1;

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full/blocked */ } },
  };
  const settings = Object.assign({ gore: 2, master: 0.8, sfx: 0.9, music: 0.35, fps: false, shake: true, name: '', server: '' }, store.get('dw_settings', {}));
  FX.gore = settings.gore;

  const G = (window.G = {
    mode: 'menu', world: null, myId: null, net: null,
    profile: null, st: { maxHp: 100, cargoMax: 10 }, market: {}, dex: {}, dexCount: 0, islands: [], lobby: null, host: false,
    view: null, snaps: [], me: null,
    cam: { x: 0, y: 0, zoom: 1, zoomMul: 1, shake: 0 }, mouse: { x: 0, y: 0, wx: 0, wy: 0, l: false, r: false },
    keys: {}, warns: [], ink: 0, lightning: 0, hurt: 0, t: 0, killfeed: [], waterCol: [30, 90, 150],
    schools: [], rain: [], chatOpen: false, fps: 60, settings, store, act, sendChat,
  });

  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  }
  window.addEventListener('resize', resize); resize();

  // ================================================================ modes
  function startSolo() {
    Sfx.init(); applyVolumes();
    const name = settings.name || 'Captain';
    let seed = store.get('dw_seed', 0);
    if (!seed) { seed = Math.floor(Math.random() * 2 ** 30); store.set('dw_seed', seed); }
    G.world = new Sim.World({ seed, pvp: false });
    G.myId = 'me';
    const p = G.world.addPlayer('me', name, store.get('dw_solo', null));
    G.world.drainEvents();
    G.profile = p.profile; G.dex = p.profile.dex; G.islands = G.world.islands; G.market = G.world.market;
    G.mode = 'solo'; G.lobby = null; G.host = true;
    enterGame();
    if (!store.get('dw_tutorial', false)) {
      store.set('dw_tutorial', true);
      const tips = ['WASD to sail · Mouse to aim · Left click to shoot', 'Right click (or F) to cast your rod at the cursor', 'When the bobber dips — click/press again to HOOK!', 'Hold right click / Space to reel. Release when tension is red!', 'Sell fish at the harbor shop (E). Buy rods, boats, guns & bait.', 'Boss Chum bait summons bosses. Good luck, captain.'];
      tips.forEach((t, i) => setTimeout(() => toast(t, 'good'), 800 + i * 3800));
    }
  }

  function enterGame() {
    for (const id of ['s-menu', 's-multi']) $(id).classList.add('hidden');
    $('chat').classList.toggle('hidden', G.mode !== 'online');
    FX.parts = []; FX.decals = []; G.warns = []; G.snaps = []; G.view = null;
    MiniMap.bg = null;
  }

  function quitToMenu() {
    if (G.mode === 'solo') saveSolo();
    if (G.mode === 'online' && G.net) G.net.send({ t: 'leave' });
    G.mode = G.net && G.net.ok ? 'lobby' : 'menu';
    G.world = null; G.view = null;
    UI.close();
    $('chat').classList.add('hidden');
    if (G.mode === 'lobby') showMulti(); else $('s-menu').classList.remove('hidden');
  }
  G.quitToMenu = quitToMenu;

  function saveSolo() {
    if (G.mode !== 'solo' || !G.world) return;
    const p = G.world.players.get('me');
    if (p) store.set('dw_solo', p.profile);
  }
  setInterval(saveSolo, 10000);
  window.addEventListener('beforeunload', saveSolo);

  function act(a) {
    if (G.mode === 'solo' && G.world) return G.world.act('me', a);
    if (G.mode === 'online' && G.net) G.net.send(Object.assign({ t: 'act' }, a));
    return true;
  }

  // ================================================================ networking
  class Net {
    constructor(url) {
      this.url = url; this.ok = false;
      this.ws = new WebSocket(url);
      this.ws.onopen = () => { this.ok = true; this.send({ t: 'hello', name: settings.name || 'Captain', token: store.get('dw_token_' + url, undefined) }); setStatus('Connected', 'good'); };
      this.ws.onclose = (e) => {
        this.ok = false;
        setStatus(e.reason ? 'Disconnected: ' + e.reason : 'Disconnected', 'bad');
        if (G.mode === 'online' || G.mode === 'lobby') { toast('Disconnected from server.', 'bad'); G.mode = 'menu'; UI.close(); $('chat').classList.add('hidden'); showMulti(); }
      };
      this.ws.onerror = () => setStatus('Could not connect.', 'bad');
      this.ws.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch { return; } onNet(m); };
      this.pingT = setInterval(() => this.send({ t: 'ping', c: performance.now() }), 2000);
    }
    send(m) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); }
    close() { clearInterval(this.pingT); this.ws.close(); }
  }

  function onNet(m) {
    switch (m.t) {
      case 'welcome':
        store.set('dw_token_' + G.net.url, m.token);
        G.mode = 'lobby'; renderLobbies(m.lobbies); $('mLobbies').classList.remove('hidden');
        break;
      case 'lobbies': case 'left':
        renderLobbies(m.lobbies || m.list);
        if (m.t === 'left' && G.mode === 'online') { G.mode = 'lobby'; UI.close(); $('chat').classList.add('hidden'); showMulti(); }
        break;
      case 'joined':
        G.mode = 'online'; G.myId = m.you; G.islands = m.islands; G.dex = m.dex || {}; G.dexCount = Object.keys(G.dex).length;
        G.lobby = m.lobby; G.host = m.host; G.profile = null;
        enterGame(); Sfx.init(); applyVolumes();
        toast(`Joined ${m.lobby.name}`, 'good');
        break;
      case 'snap':
        m.rt = performance.now();
        G.snaps.push(m);
        if (G.snaps.length > 30) G.snaps.shift();
        G.host = !!m.host;
        for (const e of m.ev) handleEvent(e);
        break;
      case 'me':
        G.profile = m.profile; G.profile.dex = G.dex; G.st = m.st; G.market = m.market; G.dexCount = m.dexCount;
        UI.refresh();
        break;
      case 'chat': chatLine(m.from, m.text, m.sys); break;
      case 'invite':
        if (m.code) { toast(`Invite code: ${m.code} (single use, 30 min)`, 'big'); copy(m.code); chatLine('', `Invite code ${m.code} copied to clipboard.`, 1); }
        else if (m.id) { toast(`Lobby ID: ${m.id}`, 'big'); copy(m.id); chatLine('', `Lobby ID ${m.id} copied to clipboard.`, 1); }
        break;
      case 'kicked': toast(m.reason, 'bad'); if (!m.soft) setStatus(m.reason, 'bad'); break;
      case 'err': toast(m.msg, 'bad'); setStatus(m.msg, 'bad'); break;
      case 'host': G.host = true; toast('You are now the lobby host.', 'good'); break;
      case 'pong': G.ping = Math.round(performance.now() - m.c); break;
    }
  }
  function copy(t) { try { navigator.clipboard.writeText(t).catch(() => {}); } catch { /* clipboard unavailable */ } }

  // ================================================================ events -> fx/audio
  function myPos() { return G.me ? [G.me.x, G.me.y] : [0, 0]; }
  function isMine(e) { return e.to === undefined || e.to === G.myId; }
  function handleEvent(e) {
    if (!isMine(e)) return;
    const [mx, my] = myPos();
    const near = (x, y, r = 900) => Math.hypot(x - mx, y - my) < r;
    switch (e.e) {
      case 'shot': {
        FX.muzzle(e.x, e.y, e.a, e.w);
        Sfx.play((D.WEAPON[e.w] || {}).sfx || 'pistol', e.x, e.y, e.pid === G.myId ? 0.9 : 0.6);
        if (e.w !== 'flamer' && e.w !== 'rocket' && e.w !== 'railgun') Sfx.play('shell', e.x, e.y, 0.5);
        if (e.pid === G.myId) shake({ shotgun: 5, rocket: 7, railgun: 9, rifle: 4 }[e.w] || 1.2);
        break;
      }
      case 'hit': FX.blood(e.x, e.y, e.c, e.n); Sfx.play('squish', e.x, e.y, 0.5); break;
      case 'die':
        FX.gibs(e.x, e.y, e.r, e.col, e.c, e.look);
        Sfx.play('gore', e.x, e.y, e.boss ? 1.5 : 0.8);
        if (e.boss) { FX.boom(e.x, e.y, e.r * 1.5, true); shake(25); }
        else if (near(e.x, e.y, 500)) shake(3);
        break;
      case 'phit':
        for (let i = 0; i < 6; i++) FX.muzzle(e.x + (Math.random() - 0.5) * 30, e.y + (Math.random() - 0.5) * 30, Math.random() * TAU, 'pistol');
        Sfx.play('clang', e.x, e.y, 0.7);
        if (e.pid === G.myId) { G.hurt = 1; shake(6); }
        break;
      case 'chomp': Sfx.play('chomp', e.x, e.y, e.big ? 1.2 : 0.8); FX.splash(e.x, e.y, e.big ? 1.2 : 0.4); break;
      case 'boom': FX.boom(e.x, e.y, e.r, e.water); Sfx.play('boom', e.x, e.y, 1); if (near(e.x, e.y, 1200)) shake(Math.max(3, 18 - Math.hypot(e.x - mx, e.y - my) / 70)); break;
      case 'splash': FX.splash(e.x, e.y, e.s || 0.6); Sfx.play('splash', e.x, e.y, 0.5); break;
      case 'wake': FX.splash(e.x, e.y, 0.8); break;
      case 'spark': for (let i = 0; i < 3; i++) FX.muzzle(e.x, e.y, Math.random() * TAU, 'smg'); break;
      case 'cast': Sfx.play('cast', e.x, e.y, 0.7); break;
      case 'bite': Sfx.play('bite'); FX.splash(e.x, e.y, 0.5); FX.text(e.x, e.y - 30, '!', '#ffde59', true); break;
      case 'hooked': Sfx.play('thrash'); break;
      case 'thrash': Sfx.play('thrash', null, null, 0.6); break;
      case 'snap': Sfx.play('snap'); if (e.x != null) FX.splash(e.x, e.y, 0.4); break;
      case 'escape': Sfx.play('splash'); break;
      case 'catch': onCatch(e); break;
      case 'msg': toast(e.text, e.kind); break;
      case 'announce': toast(e.text, 'big'); if (G.mode === 'online') chatLine('', e.text, 1); break;
      case 'ach': {
        const a = D.ACHIEVEMENTS.find((x) => x[0] === e.id);
        if (a) { toast(`🏆 Achievement unlocked: ${a[1]}`, 'big'); Sfx.play('ach'); }
        if (G.profile && G.mode === 'online') G.profile.ach[e.id] = 1;
        if (window.steam && window.steam.unlock) try { window.steam.unlock(e.id); } catch { /* steam not running */ }
        break;
      }
      case 'cash': FX.text(mx, my - 40, `+$${e.amount.toLocaleString()}`, '#ffc94a', e.amount > 999); Sfx.play('cash'); break;
      case 'buy': Sfx.play('buy'); break;
      case 'kill': G.killfeed.unshift({ text: `☠ ${e.name}  +$${e.bounty}`, t: 4 }); G.killfeed.length = Math.min(6, G.killfeed.length); break;
      case 'sink':
        FX.debris(e.x, e.y, (D.BOAT[e.boat] || D.BOATS[0]).color);
        FX.bubbles(e.x, e.y, 30);
        Sfx.play('sink', e.x, e.y, 1);
        if (e.pid === G.myId) { shake(20); G.hurt = 1.5; }
        break;
      case 'boss': toast(`⚠ ${e.name} has appeared!`, 'big'); Sfx.play('alarm'); Sfx.play('roar', e.x, e.y, 1.5); shake(12); break;
      case 'bossdead': toast(`☠ ${e.name} has been slain!`, 'big'); Sfx.play('ach'); break;
      case 'roar': Sfx.play('roar', e.x, e.y, 1); break;
      case 'warn': G.warns.push({ ...e, life: e.t || 0.8, max: e.t || 0.8 }); break;
      case 'zap': FX.zap(e.x1, e.y1, e.x2, e.y2, e.big); Sfx.play('zap', e.x2, e.y2, 0.8); break;
      case 'harpoon': break;
      case 'lightning':
        G.lightning = 1; FX.zap(e.x, e.y - 900, e.x, e.y, true); FX.ring(e.x, e.y, 10, 300, 0.6);
        Sfx.play('thunder', null, null, 0.9); shake(8);
        break;
      case 'ink': G.ink = 3.5; break;
      case 'weather': toast({ clear: '☀ Skies are clearing.', rain: '🌧 It started raining. Fish are biting more.', fog: '🌫 A thick fog rolls in...', storm: '⛈ STORM! Rare fish surface — watch for lightning.' }[e.kind] || e.kind, e.kind === 'storm' ? 'warn' : 'info'); break;
      case 'market': toast('📈 Fish market prices changed!', 'info'); break;
      case 'bounty': toast(`📜 Bounty complete: ${e.text} (+$${e.reward.toLocaleString()})`, 'good'); Sfx.play('cash'); break;
      case 'pickup': Sfx.play('pickup'); break;
      case 'repair': Sfx.play('repair'); break;
      case 'click': Sfx.play('click'); break;
      case 'respawn': if (e.pid === G.myId) toast('Back at the harbor. Your wreck is still out there...', 'info'); break;
      case 'join': case 'leave': break;
    }
  }

  function onCatch(e) {
    const sp = D.SPECIES[e.s];
    if (G.mode === 'online') {
      const d = G.dex[e.s] || (G.dex[e.s] = { n: 0, b: 0 });
      d.n++; if (e.w > d.b) d.b = e.w;
      G.dexCount = Object.keys(G.dex).length;
    }
    if (e.quiet) return;
    Sfx.play(sp.rarity >= 3 ? 'rare' : 'catch');
    const box = $('catch');
    const rar = D.RARITY[sp.rarity];
    const price = Sim.sellPrice({ s: e.s, w: e.w }, G.market);
    box.innerHTML = `<div class="card" style="border-color:${rar.color}">
      ${e.first ? '<div class="pill" style="background:#ffc94a;color:#321;font-weight:900;display:inline-block">NEW SPECIES!</div>' : ''}
      <canvas id="catchCv" width="260" height="150"></canvas>
      <h3 style="color:${rar.color}">${sp.name}</h3>
      <div><b style="color:${rar.color}">${rar.name}</b> · ${sp.kind === 'treasure' ? 'Treasure' : D.BIOMES[sp.biome].name}</div>
      <div class="gold" style="font-size:18px;font-weight:800;margin-top:4px">${sp.kind === 'treasure' ? '' : e.w + ' kg · '}$${price.toLocaleString()}</div>
      <div class="muted small" style="margin-top:4px">${sp.fact}</div>
      ${e.stored ? '' : '<div class="bad small">Cargo full — not kept!</div>'}
    </div>`;
    box.classList.remove('hidden');
    const c = $('catchCv').getContext('2d');
    let t0 = performance.now();
    const anim = () => {
      if (!document.getElementById('catchCv')) return;
      const t = (performance.now() - t0) / 1000;
      c.clearRect(0, 0, 260, 150);
      const g = c.createRadialGradient(130, 75, 5, 130, 75, 120); g.addColorStop(0, rar.color + '55'); g.addColorStop(1, 'transparent'); c.fillStyle = g; c.fillRect(0, 0, 260, 150);
      R.drawSpecies(c, sp, 130, 75 + Math.sin(t * 3) * 4, 170, t);
      if (t < 4) requestAnimationFrame(anim);
    };
    anim();
    clearTimeout(onCatch.to);
    onCatch.to = setTimeout(() => box.classList.add('hidden'), 4000);
  }

  // ================================================================ toasts & chat
  function toast(text, kind) {
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.textContent = text;
    $('toasts').appendChild(el);
    setTimeout(() => el.remove(), 3300);
    while ($('toasts').children.length > 5) $('toasts').firstChild.remove();
  }
  G.toast = toast;
  function chatLine(from, text, sys) {
    const el = document.createElement('div');
    if (sys) el.className = 'sys';
    el.textContent = from ? `${from}: ${text}` : text;
    $('chatlog').appendChild(el);
    while ($('chatlog').children.length > 12) $('chatlog').firstChild.remove();
  }
  function sendChat(text) { if (G.net && text.trim()) G.net.send({ t: 'chat', text: text.trim() }); }
  function openChat() {
    if (G.mode !== 'online') return;
    G.chatOpen = true; $('chat').classList.add('open'); const i = $('chatin'); i.classList.remove('hidden'); i.value = ''; i.focus();
  }
  function closeChat() { G.chatOpen = false; $('chat').classList.remove('open'); $('chatin').classList.add('hidden'); $('chatin').blur(); }
  $('chatin').addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { sendChat(e.target.value); closeChat(); }
    if (e.key === 'Escape') closeChat();
  });

  function shake(n) { if (settings.shake) G.cam.shake = Math.min(30, Math.max(G.cam.shake, n)); }

  // ================================================================ input
  const keymap = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right' };
  window.addEventListener('keydown', (e) => {
    if (G.mode !== 'solo' && G.mode !== 'online') return;
    if (e.target && e.target.tagName === 'INPUT') return;
    if (e.code === 'Tab') { e.preventDefault(); UI.scoreboard(true); return; }
    if (e.code === 'Escape') { if (UI.isOpen()) UI.close(); else UI.open('pause'); return; }
    if (UI.isOpen()) { if (e.code === 'KeyE' && UI.current === 'shop') UI.close(); if (e.code === 'KeyB' && UI.current === 'dex') UI.close(); if (e.code === 'KeyJ' && UI.current === 'journal') UI.close(); return; }
    if (e.repeat) { G.keys[e.code] = true; return; }
    G.keys[e.code] = true;
    Sfx.init();
    switch (e.code) {
      case 'Enter': openChat(); e.preventDefault(); break;
      case 'KeyF': case 'Space': fishPress(); e.preventDefault(); break;
      case 'KeyE': if (G.me && Math.hypot(G.me.x, G.me.y) < D.DOCK_R) UI.open('shop'); else toast('Sail into the harbor to use the shop.', 'warn'); break;
      case 'KeyB': UI.open('dex'); break;
      case 'KeyJ': UI.open('journal'); break;
      case 'KeyM': G.bigMap = !G.bigMap; break;
      case 'KeyT': act({ a: 'pot' }); break;
      case 'KeyH': act({ a: 'patch' }); break;
      case 'KeyQ': cycleBait(); break;
      case 'KeyR': cycleRod(); break;
      default:
        if (/^Digit[1-9]$/.test(e.code) && G.profile) {
          const w = D.WEAPONS[+e.code.slice(5) - 1];
          if (w && G.profile.weapons.includes(w.id)) { act({ a: 'weapon', id: w.id }); if (G.mode === 'online') G.profile.weapon = w.id; Sfx.play('ui'); }
        }
    }
  });
  window.addEventListener('keyup', (e) => { G.keys[e.code] = false; if (e.code === 'Tab') UI.scoreboard(false); });
  window.addEventListener('blur', () => { G.keys = {}; G.mouse.l = G.mouse.r = false; });
  cv.addEventListener('mousemove', (e) => { G.mouse.x = e.clientX; G.mouse.y = e.clientY; });
  cv.addEventListener('mousedown', (e) => {
    Sfx.init();
    if (e.button === 0) G.mouse.l = true;
    if (e.button === 2) { G.mouse.r = true; fishPress(); }
  });
  window.addEventListener('mouseup', (e) => { if (e.button === 0) G.mouse.l = false; if (e.button === 2) G.mouse.r = false; });
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  cv.addEventListener('wheel', (e) => { G.cam.zoomMul = Math.max(0.55, Math.min(1.6, G.cam.zoomMul * (e.deltaY > 0 ? 0.92 : 1.08))); }, { passive: true });

  function myFish() { const p = G.view && G.view.players.find((q) => q.id === G.myId); return p ? p.f : null; }
  function fishPress() {
    if (!G.view || !G.view.me) return;
    if (G.view.me.bite) return act({ a: 'hook' });
    const f = myFish();
    if (!f) return act({ a: 'cast', x: G.mouse.wx, y: G.mouse.wy });
    if (f[0] === 'wait' || f[0] === 'cast') return act({ a: 'reelin' });
  }
  function cycleBait() {
    if (!G.profile) return;
    const owned = ['none'].concat(D.BAITS.filter((b) => (G.profile.baits[b.id] || 0) > 0).map((b) => b.id));
    const i = owned.indexOf(G.profile.bait);
    const next = owned[(i + 1) % owned.length];
    act({ a: 'bait', id: next }); if (G.mode === 'online') G.profile.bait = next;
    toast(`Bait: ${D.BAIT[next].name}${next !== 'none' ? ' ×' + G.profile.baits[next] : ''}`);
  }
  function cycleRod() {
    if (!G.profile) return;
    const owned = G.profile.rods;
    const next = owned[(owned.indexOf(G.profile.rod) + 1) % owned.length];
    act({ a: 'rod', id: next }); if (G.mode === 'online') G.profile.rod = next;
    toast(`Rod: ${D.ROD[next].name}`);
  }

  let lastSent = '', lastSentAt = 0;
  function pushInput(now) {
    const k = G.keys;
    const inp = {
      up: k.KeyW || k.ArrowUp ? 1 : 0, down: k.KeyS || k.ArrowDown ? 1 : 0, left: k.KeyA || k.ArrowLeft ? 1 : 0, right: k.KeyD || k.ArrowRight ? 1 : 0,
      fire: G.mouse.l && !UI.isOpen() ? 1 : 0, reel: G.mouse.r || k.Space || k.KeyF ? 1 : 0, aim: 0,
    };
    if (G.chatOpen || UI.isOpen()) { inp.up = inp.down = inp.left = inp.right = inp.reel = 0; }
    if (G.me) inp.aim = Math.atan2(G.mouse.wy - G.me.y, G.mouse.wx - G.me.x);
    if (G.mode === 'solo') G.world.setInput('me', inp);
    else if (G.mode === 'online' && G.net) {
      const m = { t: 'in', u: inp.up, d: inp.down, l: inp.left, r: inp.right, f: inp.fire, rl: inp.reel, aim: +inp.aim.toFixed(3) };
      const s = JSON.stringify(m);
      if ((s !== lastSent && now - lastSentAt > 33) || now - lastSentAt > 250) { G.net.send(m); lastSent = s; lastSentAt = now; }
    }
  }

  // ================================================================ view building (interpolation)
  const INTERP = 110;
  function lerpA(a, b, t) { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return a + d * t; }
  function buildOnlineView(now) {
    const S = G.snaps;
    if (!S.length) return null;
    const latest = S[S.length - 1];
    const rt = now - INTERP;
    let s0 = S[0], s1 = S[0];
    for (let i = S.length - 1; i >= 0; i--) if (S[i].rt <= rt) { s0 = S[i]; s1 = S[i + 1] || S[i]; break; }
    const k = s1 === s0 ? 0 : Math.max(0, Math.min(1, (rt - s0.rt) / (s1.rt - s0.rt)));
    const p0 = new Map(s0.players.map((p) => [p.id, p]));
    const players = s1.players.map((p) => {
      const a = p0.get(p.id); if (!a) return p;
      return Object.assign({}, p, { x: a.x + (p.x - a.x) * k, y: a.y + (p.y - a.y) * k, a: lerpA(a.a, p.a, k), aim: lerpA(a.aim, p.aim, k) });
    });
    const c0 = new Map(s0.cr.map((c) => [c[0], c]));
    const cr = s1.cr.map((c) => { const a = c0.get(c[0]); if (!a) return c; const o = c.slice(); o[2] = a[2] + (c[2] - a[2]) * k; o[3] = a[3] + (c[3] - a[3]) * k; o[4] = lerpA(a[4], c[4], k); return o; });
    const dt = Math.min(0.2, (now - latest.rt) / 1000);
    const pj = latest.pj.map((p) => [p[0] + p[2] * dt, p[1] + p[3] * dt, p[2], p[3], p[4], p[5]]);
    return { players, cr, pj, crates: latest.crates, pots: latest.pots, day: latest.day, wx: latest.wx, wa: latest.wa, wv: latest.wv, me: latest.me, pvp: latest.pvp };
  }

  // ================================================================ main loop
  let last = performance.now(), acc = 0, fpsAcc = 0, fpsN = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = Math.min(0.1, (now - last) / 1000); last = now;
    fpsAcc += dt; fpsN++; if (fpsAcc > 0.5) { G.fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
    G.t += dt;
    if (G.mode !== 'solo' && G.mode !== 'online') { drawMenuBg(dt); return; }
    pushInput(now);
    if (G.mode === 'solo') {
      acc += dt;
      while (acc >= 1 / 60) { G.world.step(1 / 60); acc -= 1 / 60; }
      for (const e of G.world.drainEvents()) handleEvent(e);
      const p = G.world.players.get('me');
      G.profile = p.profile; G.st = { maxHp: p.st.maxHp, cargoMax: p.st.cargoMax }; G.market = G.world.market; G.dexCount = Object.keys(G.dex).length;
      if (p.dirty) { p.dirty = false; UI.refresh(); }
      G.view = G.world.snapshot('me');
    } else {
      G.view = buildOnlineView(now);
    }
    if (!G.view) return;
    G.me = G.view.players.find((p) => p.id === G.myId) || null;
    FX.update(dt);
    updateCamera(dt);
    render(dt);
  }
  requestAnimationFrame(frame);

  function updateCamera(dt) {
    const c = G.cam;
    const base = Math.max(0.55, Math.min(1.25, Math.min(W, H) / 900));
    const boatZoom = G.me ? 1 - Math.min(0.25, ((D.BOAT[G.me.b] || D.BOATS[0]).len - 46) / 240) : 1;
    const target = base * boatZoom * c.zoomMul;
    c.zoom += (target - c.zoom) * Math.min(1, dt * 4);
    if (G.me) {
      // look-ahead toward the cursor so you can see what you're shooting at
      const lx = (G.mouse.x - W / 2) * 0.18 / c.zoom, ly = (G.mouse.y - H / 2) * 0.18 / c.zoom;
      const tx = G.me.x + lx + (G.me.vx || 0) * 0.25, ty = G.me.y + ly + (G.me.vy || 0) * 0.25;
      if (!updateCamera.init || Math.hypot(tx - c.x, ty - c.y) > 2500) { c.x = tx; c.y = ty; updateCamera.init = true; }
      c.x += (tx - c.x) * Math.min(1, dt * 5); c.y += (ty - c.y) * Math.min(1, dt * 5);
    }
    c.shake *= Math.exp(-8 * dt);
    G.mouse.wx = (G.mouse.x - W / 2) / c.zoom + c.x;
    G.mouse.wy = (G.mouse.y - H / 2) / c.zoom + c.y;
    Sfx.setListener(c.x, c.y);
  }

  // ================================================================ rendering
  function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  const BIOME_RGB = D.BIOMES.map((b) => hexToRgb(b.color));
  const lightCv = document.createElement('canvas'), lctx = lightCv.getContext('2d');

  function render(dt) {
    const v = G.view, c = G.cam, t = G.t;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    // water colour eases toward current biome
    const b = D.biomeAt(c.x, c.y), tc = BIOME_RGB[b];
    for (let i = 0; i < 3; i++) G.waterCol[i] += (tc[i] - G.waterCol[i]) * Math.min(1, dt * 1.5);
    const wc = G.waterCol.map(Math.round);
    ctx.fillStyle = `rgb(${wc[0]},${wc[1]},${wc[2]})`; ctx.fillRect(0, 0, W, H);
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(255,255,255,0.04)'); vg.addColorStop(1, 'rgba(0,0,20,0.35)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

    ctx.save();
    const sx = (Math.random() - 0.5) * c.shake, sy = (Math.random() - 0.5) * c.shake;
    ctx.translate(W / 2 + sx, H / 2 + sy); ctx.scale(c.zoom, c.zoom); ctx.translate(-c.x, -c.y);
    const x0 = c.x - W / 2 / c.zoom - 100, x1 = c.x + W / 2 / c.zoom + 100, y0 = c.y - H / 2 / c.zoom - 100, y1 = c.y + H / 2 / c.zoom + 100;
    const inView = (x, y, r = 0) => x + r > x0 && x - r < x1 && y + r > y0 && y - r < y1;

    R.drawDecor(ctx, x0, y0, x1, y1, t);
    drawSchools(dt, x0, y0, x1, y1);
    // world edge
    ctx.strokeStyle = 'rgba(255,80,80,.35)'; ctx.lineWidth = 8; ctx.setLineDash([30, 20]);
    ctx.beginPath(); ctx.arc(0, 0, D.WORLD_R, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    FX.drawUnder(ctx);

    const night = nightLevel(v.day) > 0.4;
    if (inView(0, 0, 700)) R.drawHarbor(ctx, t, night);
    for (const is of G.islands) if (!is.harbor && inView(is.x, is.y, is.r * 1.3)) R.drawIsland(ctx, is, t);

    // crab pots
    for (const [, x, y, mine, pt] of v.pots) {
      const bob = Math.sin(t * 3 + x) * 2;
      ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.arc(x + 3, y + 4, 11, 0, TAU); ctx.fill();
      ctx.fillStyle = pt >= 60 ? (Math.sin(t * 8) > 0 ? '#5ee37a' : '#2e7a4a') : '#ff7a1a';
      ctx.beginPath(); ctx.arc(x, y + bob, 10, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(x - 10, y + bob - 2, 20, 4);
      if (mine) { ctx.fillStyle = '#fff'; ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center'; ctx.fillText(pt >= 60 ? 'READY' : `${60 - pt}s`, x, y - 16); }
    }
    // crates
    for (const [, x, y, kind] of v.crates) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * 1.5 + x) * 0.2);
      if (kind === 'wreck') { ctx.fillStyle = '#4a321c'; ctx.fillRect(-16, -8, 32, 16); ctx.fillStyle = '#6b4a2b'; ctx.fillRect(-12, -14, 10, 28); ctx.fillStyle = '#ffc94a'; ctx.font = 'bold 12px system-ui'; ctx.textAlign = 'center'; ctx.fillText('☠', 6, 5); }
      else { ctx.fillStyle = '#8a5a2b'; ctx.fillRect(-11, -11, 22, 22); ctx.strokeStyle = '#4a321c'; ctx.lineWidth = 2; ctx.strokeRect(-11, -11, 22, 22); ctx.beginPath(); ctx.moveTo(-11, -11); ctx.lineTo(11, 11); ctx.stroke(); }
      ctx.restore();
    }

    // telegraphs
    for (const w of G.warns) {
      w.life -= dt;
      const f = 1 - w.life / w.max;
      if (w.kind === 'slam' || w.kind === 'whirl') {
        ctx.strokeStyle = `rgba(255,50,50,${0.4 + Math.sin(t * 20) * 0.2})`; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(w.x, w.y, w.r, 0, TAU); ctx.stroke();
        ctx.fillStyle = `rgba(255,40,40,${0.15 * f})`; ctx.beginPath(); ctx.arc(w.x, w.y, w.r * (w.kind === 'slam' ? f : 1), 0, TAU); ctx.fill();
        if (w.kind === 'whirl') { ctx.strokeStyle = 'rgba(200,240,255,.35)'; ctx.lineWidth = 3; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(w.x, w.y, w.r * (0.2 + i * 0.13), t * 3 + i, t * 3 + i + 2); ctx.stroke(); } }
      } else if (w.kind === 'charge') {
        const len = 900;
        ctx.strokeStyle = `rgba(255,60,60,${0.5 * (1 - f)})`; ctx.lineWidth = 60; ctx.lineCap = 'butt';
        ctx.beginPath(); ctx.moveTo(w.x, w.y); ctx.lineTo(w.x + Math.cos(w.a) * len, w.y + Math.sin(w.a) * len); ctx.stroke(); ctx.lineCap = 'round';
      }
    }
    G.warns = G.warns.filter((w) => w.life > 0);

    // creatures
    let boss = null;
    for (const cr of v.cr) {
      const [id, type, x, y, a, hp, mh, r, flash, pstate] = cr;
      const bdef = D.BOSS[type], cdef = D.CREATURES[type];
      if (bdef) boss = { def: bdef, hp, mh, x, y, pstate };
      if (!inView(x, y, r * 2)) continue;
      const look = bdef ? bdef.look : cdef ? cdef.look : 'fish';
      const color = bdef ? bdef.color : cdef ? cdef.color : '#888';
      ctx.fillStyle = 'rgba(0,10,30,.25)'; ctx.beginPath(); ctx.ellipse(x + r * 0.2, y + r * 0.25, r * 1.1, r * 0.8, a, 0, TAU); ctx.fill();
      if (bdef && pstate === 'charge') { ctx.save(); ctx.shadowColor = '#f00'; ctx.shadowBlur = 40; }
      R.drawCreature(ctx, look, x, y, a, r, color, t + id, flash);
      if (bdef && pstate === 'charge') ctx.restore();
      if (!bdef && hp < mh) {
        ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(x - r, y - r - 12, r * 2, 5);
        ctx.fillStyle = '#ff4d5e'; ctx.fillRect(x - r, y - r - 12, (r * 2 * hp) / mh, 5);
      }
      if (Math.random() < 0.02) FX.bubbles(x, y, 1);
    }
    G.boss = boss;

    // players, fishing lines
    for (const p of v.players) {
      if (p.d) continue;
      const bd = D.BOAT[p.b] || D.BOATS[0];
      const speed = Math.hypot(p.vx || 0, p.vy || 0);
      FX.wake(p.x - Math.cos(p.a) * bd.len * 0.45, p.y - Math.sin(p.a) * bd.len * 0.45, p.a, speed, bd.wid);
      if (!inView(p.x, p.y, 120)) continue;
      if (p.f) drawLine(p, t);
      if (p.inv && Math.floor(t * 10) % 2) ctx.globalAlpha = 0.5;
      R.drawBoat(ctx, p.b, p.x, p.y, p.a, p.aim, p.w, t, { color: p.c, moving: speed > 20, flash: p.id === G.myId && G.hurt > 0.7 });
      ctx.globalAlpha = 1;
      ctx.font = '600 13px system-ui'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.6)';
      const ny = p.y - bd.len * 0.55 - 14;
      ctx.strokeText(p.n, p.x, ny); ctx.fillStyle = p.id === G.myId ? '#bff9ff' : '#fff'; ctx.fillText(p.n, p.x, ny);
      if (p.hp < p.mh) { ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(p.x - 26, ny + 5, 52, 5); ctx.fillStyle = p.hp / p.mh > 0.35 ? '#5ee37a' : '#ff4d5e'; ctx.fillRect(p.x - 26, ny + 5, (52 * p.hp) / p.mh, 5); }
    }

    // projectiles
    for (const [x, y, vx, vy, kind, r] of v.pj) {
      if (!inView(x, y)) continue;
      const sp = Math.hypot(vx, vy) || 1, ux = vx / sp, uy = vy / sp;
      switch (kind) {
        case 'flamer': { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(255,240,160,.9)'); g.addColorStop(0.5, 'rgba(255,120,20,.6)'); g.addColorStop(1, 'rgba(255,40,0,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); break; }
        case 'rocket': ctx.fillStyle = '#4b5320'; ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(vy, vx)); ctx.fillRect(-10, -4, 20, 8); ctx.fillStyle = '#f33'; ctx.fillRect(8, -4, 4, 8); ctx.restore(); if (Math.random() < 0.9) FX.parts.push({ k: 'smoke', x: x - ux * 12, y: y - uy * 12, vx: -ux * 30, vy: -uy * 30, life: 0.8, max: 0.8, r: 6 }), FX.parts.push({ k: 'fire', x: x - ux * 12, y: y - uy * 12, vx: 0, vy: 0, life: 0.1, max: 0.1, r: 8 }); break;
        case 'railgun': ctx.strokeStyle = 'rgba(120,255,255,.9)'; ctx.lineWidth = 5; ctx.shadowColor = '#6ff'; ctx.shadowBlur = 16; ctx.beginPath(); ctx.moveTo(x - ux * 90, y - uy * 90); ctx.lineTo(x, y); ctx.stroke(); ctx.shadowBlur = 0; break;
        case 'harpoon': ctx.strokeStyle = '#ccc'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - ux * 24, y - uy * 24); ctx.lineTo(x, y); ctx.stroke(); ctx.fillStyle = '#eee'; ctx.beginPath(); ctx.moveTo(x + ux * 6, y + uy * 6); ctx.lineTo(x - uy * 4, y + ux * 4); ctx.lineTo(x + uy * 4, y - ux * 4); ctx.fill(); break;
        case 'spit': case 'ink': ctx.fillStyle = kind === 'ink' ? '#2a1640' : '#9cff5a'; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); break;
        case 'fire': { const g = ctx.createRadialGradient(x, y, 0, x, y, r * 1.6); g.addColorStop(0, '#fff3b0'); g.addColorStop(0.5, '#ff7a1a'); g.addColorStop(1, 'rgba(255,40,0,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 1.6, 0, TAU); ctx.fill(); break; }
        case 'spike': ctx.fillStyle = '#ffd1e6'; ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(vy, vx)); ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-8, -5); ctx.lineTo(-8, 5); ctx.fill(); ctx.restore(); break;
        default: {
          const len = kind === 'rifle' ? 60 : kind === 'shotgun' ? 14 : 26;
          ctx.strokeStyle = kind === 'rifle' ? 'rgba(255,255,220,.95)' : 'rgba(255,230,140,.95)'; ctx.lineWidth = kind === 'rifle' ? 3 : 2;
          ctx.beginPath(); ctx.moveTo(x - ux * len, y - uy * len); ctx.lineTo(x, y); ctx.stroke();
        }
      }
    }

    FX.drawOver(ctx);
    ctx.restore();

    drawLighting(v);
    drawWeather(v, dt);
    drawHUD(v, dt);
  }

  function drawLine(p, t) {
    const [state, bx0, by0, prog] = p.f;
    const side = p.a + Math.PI / 2;
    const bd = D.BOAT[p.b] || D.BOATS[0];
    const rx = p.x + Math.cos(side) * bd.wid * 0.45 + Math.cos(p.a) * bd.len * 0.1, ry = p.y + Math.sin(side) * bd.wid * 0.45 + Math.sin(p.a) * bd.len * 0.1;
    let bx = bx0, by = by0, lift = 0;
    if (state === 'cast') { bx = rx + (bx0 - rx) * prog; by = ry + (by0 - ry) * prog; lift = Math.sin(prog * Math.PI) * 90; }
    const mine = p.id === G.myId;
    const reel = mine && G.view.me && G.view.me.reel;
    const tension = reel ? reel.t : 0;
    ctx.strokeStyle = state === 'reel' ? `rgba(255,${Math.round(255 - tension * 200)},${Math.round(255 - tension * 230)},.9)` : 'rgba(255,255,255,.7)';
    ctx.lineWidth = state === 'reel' ? 1.8 : 1.2;
    ctx.beginPath(); ctx.moveTo(rx, ry);
    if (state === 'reel') ctx.lineTo(bx, by);
    else ctx.quadraticCurveTo((rx + bx) / 2, (ry + by) / 2 + (state === 'cast' ? -lift : 30), bx, by - lift);
    ctx.stroke();
    // rod
    ctx.strokeStyle = '#6b4520'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(rx, ry); ctx.stroke();
    const dip = state === 'bite' ? 4 + Math.sin(t * 30) * 3 : state === 'reel' ? Math.sin(t * 20) * 3 : Math.sin(t * 3) * 1.5;
    if (lift > 0) { ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.arc(bx, by, 5, 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(bx, by - lift + dip, 6, 0, TAU); ctx.fill();
    ctx.fillStyle = '#e8322d'; ctx.beginPath(); ctx.arc(bx, by - lift + dip, 6, Math.PI, TAU); ctx.fill();
    if (state === 'reel' && Math.random() < 0.3) FX.splash(bx + (Math.random() - 0.5) * 20, by + (Math.random() - 0.5) * 20, 0.15);
    if (state === 'bite' && mine) {
      ctx.font = '900 34px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#ffde59'; ctx.strokeStyle = '#000'; ctx.lineWidth = 4;
      const s = 1 + Math.sin(t * 25) * 0.1;
      ctx.save(); ctx.translate(bx, by - 28); ctx.scale(s, s); ctx.strokeText('!', 0, 0); ctx.fillText('!', 0, 0); ctx.restore();
    }
  }

  function nightLevel(day) { const L = (1 - Math.cos(day * TAU)) / 2; return Math.max(0, Math.min(1, (0.6 - L) / 0.6)); }

  function drawLighting(v) {
    const c = G.cam;
    let dark = nightLevel(v.day) * 0.78;
    const biome = D.biomeAt(c.x, c.y);
    if (biome === 6) dark = Math.min(0.9, dark + 0.35);
    if (v.wx === 'storm') dark = Math.min(0.9, dark + 0.2);
    if (dark < 0.03) return;
    const lw = Math.ceil(W / 2), lh = Math.ceil(H / 2);
    if (lightCv.width !== lw || lightCv.height !== lh) { lightCv.width = lw; lightCv.height = lh; }
    lctx.globalCompositeOperation = 'source-over';
    lctx.clearRect(0, 0, lw, lh);
    lctx.fillStyle = `rgba(4,8,24,${dark})`; lctx.fillRect(0, 0, lw, lh);
    lctx.globalCompositeOperation = 'destination-out';
    const light = (x, y, r, a = 1) => {
      const sx = ((x - c.x) * c.zoom + W / 2) / 2, sy = ((y - c.y) * c.zoom + H / 2) / 2, sr = (r * c.zoom) / 2;
      if (sx < -sr || sy < -sr || sx > lw + sr || sy > lh + sr) return;
      const g = lctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
      g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      lctx.fillStyle = g; lctx.beginPath(); lctx.arc(sx, sy, sr, 0, TAU); lctx.fill();
    };
    for (const p of v.players) if (!p.d) { light(p.x, p.y, p.id === G.myId ? 340 : 220); light(p.x + Math.cos(p.aim) * 220, p.y + Math.sin(p.aim) * 220, 200, 0.7); }
    light(-170, -150, 260);
    const beam = G.t * 0.8;
    light(-170 + Math.cos(beam) * 500, -150 + Math.sin(beam) * 500, 380, 0.8);
    light(0, 0, 420, 0.7);
    for (const cr of v.cr) {
      const bd = D.BOSS[cr[1]], cd = D.CREATURES[cr[1]];
      const look = bd ? bd.look : cd ? cd.look : '';
      if (bd) light(cr[2], cr[3], cr[7] * 4, 0.75);
      else if (look === 'angler' || look === 'horror' || look === 'jelly' || (cd && cd.shot === 'fire') || (bd && bd.biome === 5)) light(cr[2], cr[3], cr[7] * 3, 0.6);
    }
    for (const p of FX.parts) if (p.k === 'fire' || p.k === 'flash' || p.k === 'muzzle') light(p.x, p.y, (p.r || 10) * 6, 0.5);
    for (const pt of v.pots) if (pt[4] >= 60) light(pt[1], pt[2], 80, 0.6);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(lightCv, 0, 0, cv.width, cv.height);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  function drawWeather(v, dt) {
    const wx = v.wx;
    const want = wx === 'storm' ? 260 : wx === 'rain' ? 130 : 0;
    while (G.rain.length < want) G.rain.push({ x: Math.random() * W, y: Math.random() * H, s: 600 + Math.random() * 500 });
    if (G.rain.length > want) G.rain.length = want;
    if (G.rain.length) {
      const wa = v.wa || 0, wv = (v.wv || 0) * 3;
      const dx = Math.cos(wa) * wv, dy = Math.sin(wa) * wv * 0.3;
      ctx.strokeStyle = 'rgba(200,220,255,.35)'; ctx.lineWidth = 1.2; ctx.beginPath();
      for (const r of G.rain) {
        r.x += dx * dt; r.y += (r.s + dy) * dt;
        if (r.y > H) { r.y = -20; r.x = Math.random() * W; }
        if (r.x > W) r.x -= W; if (r.x < 0) r.x += W;
        ctx.moveTo(r.x, r.y); ctx.lineTo(r.x - dx * 0.02, r.y - 14);
      }
      ctx.stroke();
    }
    if (wx === 'fog') {
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.15, W / 2, H / 2, Math.max(W, H) * 0.6);
      g.addColorStop(0, 'rgba(210,220,230,.15)'); g.addColorStop(1, 'rgba(210,220,230,.85)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    Sfx.setWeather(wx, v.wv);
    if (G.lightning > 0) { ctx.fillStyle = `rgba(255,255,255,${G.lightning * 0.7})`; ctx.fillRect(0, 0, W, H); G.lightning = Math.max(0, G.lightning - dt * 3); }
    if (G.ink > 0) {
      G.ink -= dt;
      ctx.fillStyle = `rgba(20,8,35,${Math.min(0.85, G.ink / 2)})`;
      for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.arc(W * (0.15 + ((i * 0.37) % 0.8)), H * (0.2 + ((i * 0.53) % 0.7)), 120 + i * 20, 0, TAU); ctx.fill(); }
    }
    if (G.hurt > 0) {
      G.hurt = Math.max(0, G.hurt - dt * 1.5);
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
      g.addColorStop(0, 'rgba(255,0,0,0)'); g.addColorStop(1, `rgba(200,0,0,${Math.min(0.55, G.hurt * 0.5)})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
  }

  // ambient fish schools (visual only)
  function drawSchools(dt, x0, y0, x1, y1) {
    const c = G.cam;
    while (G.schools.length < 14) G.schools.push({ x: c.x + (Math.random() - 0.5) * 2400, y: c.y + (Math.random() - 0.5) * 1600, a: Math.random() * TAU, n: 4 + Math.floor(Math.random() * 9), s: 30 + Math.random() * 40, sz: 4 + Math.random() * 8 });
    ctx.fillStyle = 'rgba(0,15,35,.22)';
    for (const s of G.schools) {
      s.a += (Math.random() - 0.5) * dt;
      if (G.me) { const d = Math.hypot(s.x - G.me.x, s.y - G.me.y); if (d < 200) { s.a = Math.atan2(s.y - G.me.y, s.x - G.me.x); s.x += Math.cos(s.a) * 150 * dt; s.y += Math.sin(s.a) * 150 * dt; } }
      s.x += Math.cos(s.a) * s.s * dt; s.y += Math.sin(s.a) * s.s * dt;
      if (Math.abs(s.x - c.x) > 1600 || Math.abs(s.y - c.y) > 1200) { s.x = c.x + (Math.random() < 0.5 ? -1 : 1) * 1400; s.y = c.y + (Math.random() - 0.5) * 1600; }
      if (s.x < x0 - 100 || s.x > x1 + 100 || s.y < y0 - 100 || s.y > y1 + 100) continue;
      for (let i = 0; i < s.n; i++) {
        const ox = Math.sin(i * 12.9) * 30 + Math.sin(G.t * 2 + i) * 4, oy = Math.cos(i * 7.3) * 25;
        ctx.beginPath(); ctx.ellipse(s.x + ox, s.y + oy, s.sz, s.sz * 0.4, s.a, 0, TAU); ctx.fill();
      }
    }
  }

  // ================================================================ HUD
  const MiniMap = { bg: null, big: null };
  function mapBg(size) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const x = c.getContext('2d'), img = x.createImageData(size, size);
    for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
      const wx = (px / size - 0.5) * 2 * D.WORLD_R, wy = (py / size - 0.5) * 2 * D.WORLD_R;
      const i = (py * size + px) * 4;
      if (Math.hypot(wx, wy) > D.WORLD_R) { img.data[i + 3] = 0; continue; }
      const col = BIOME_RGB[D.biomeAt(wx, wy)];
      img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = 230;
    }
    x.putImageData(img, 0, 0);
    x.fillStyle = '#e8d49a';
    for (const is of G.islands) { x.beginPath(); x.arc((is.x / D.WORLD_R / 2 + 0.5) * size, (is.y / D.WORLD_R / 2 + 0.5) * size, Math.max(1.5, (is.r / D.WORLD_R / 2) * size), 0, TAU); x.fill(); }
    return c;
  }
  function drawMap(cx, cy, size, v, big) {
    const key = big ? 'big' : 'bg';
    if (!MiniMap[key]) MiniMap[key] = mapBg(big ? 600 : 180);
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, size / 2, 0, TAU); ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fill(); ctx.clip();
    ctx.drawImage(MiniMap[key], cx - size / 2, cy - size / 2, size, size);
    const toM = (x, y) => [cx + (x / D.WORLD_R / 2) * size, cy + (y / D.WORLD_R / 2) * size];
    for (const [, x, y, mine] of v.pots) if (mine) { const [mx, my] = toM(x, y); ctx.fillStyle = '#ff7a1a'; ctx.fillRect(mx - 2, my - 2, 4, 4); }
    for (const cr of v.cr) if (D.BOSS[cr[1]]) { const [mx, my] = toM(cr[2], cr[3]); ctx.fillStyle = '#ff2040'; ctx.font = `${big ? 22 : 14}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('☠', mx, my); }
    for (const p of v.players) {
      if (p.d) continue;
      const [mx, my] = toM(p.x, p.y);
      if (p.id === G.myId) { ctx.save(); ctx.translate(mx, my); ctx.rotate(p.a); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-5, -4); ctx.lineTo(-5, 4); ctx.fill(); ctx.restore(); }
      else { ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(mx, my, 3, 0, TAU); ctx.fill(); }
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, size / 2, 0, TAU); ctx.stroke();
    if (big) {
      ctx.font = '600 13px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
      const labels = [[0, 0, 'Harbor'], [0, -1500, 'Coral Reef'], [0, -2500, 'Kelp Forest'], [0, -3600, 'Open Ocean'], [0, -5300, 'Frozen Sea'], [4400, 1500, 'Volcanic Vents'], [-4400, 1500, 'Abyssal Trench']];
      for (const [x, y, t] of labels) { const [mx, my] = toM(x, y); ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.strokeText(t, mx, my); ctx.fillText(t, mx, my); }
    }
  }

  function bar(x, y, w, h, f, col, bg = 'rgba(0,0,0,.55)') {
    ctx.fillStyle = bg; roundRect(x, y, w, h, h / 2); ctx.fill();
    ctx.fillStyle = col; roundRect(x, y, Math.max(h, w * Math.max(0, Math.min(1, f))), h, h / 2); ctx.fill();
  }
  function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function text(s, x, y, size = 14, col = '#fff', align = 'left', weight = 700) {
    ctx.font = `${weight} ${size}px system-ui, sans-serif`; ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.strokeText(s, x, y); ctx.fillStyle = col; ctx.fillText(s, x, y);
  }

  const SHORT = { pistol: 'Pistol', smg: 'SMG', shotgun: 'Shotgun', harpoon: 'Harpoon', rifle: 'Rifle', flamer: 'Torch', minigun: 'Minigun', rocket: 'Rocket', railgun: 'Railgun' };
  function drawHUD(v, dt) {
    const pr = G.profile, me = G.me;
    if (!pr || !me) return;
    // money & status
    text(`$${pr.money.toLocaleString()}`, 18, 38, 28, '#ffc94a', 'left', 900);
    const clock = ((v.day * 24 + 0) % 24), hh = Math.floor(clock), mm = Math.floor((clock - hh) * 60);
    const wIcon = { clear: '☀', rain: '🌧', fog: '🌫', storm: '⛈' }[v.wx] || '';
    text(`${D.BIOMES[D.biomeAt(me.x, me.y)].name}  ·  ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} ${nightLevel(v.day) > 0.4 ? '🌙' : ''}  ${wIcon}`, 18, 62, 14, '#bfe3ff');
    text(`🐟 Cargo ${pr.cargo.length}/${G.st.cargoMax}   📖 ${G.dexCount}/${D.SPECIES.length}`, 18, 84, 13, pr.cargo.length >= G.st.cargoMax ? '#ff4d5e' : '#dfefff', 'left', 600);
    if (G.mode === 'online') text(`${G.lobby ? G.lobby.name : ''} · ${v.players.length}/10 · ${G.ping || 0}ms${v.pvp ? ' · PvP ON' : ''}`, 18, 104, 12, v.pvp ? '#ff8a8a' : '#8fb0c8', 'left', 600);
    if (settings.fps) text(`${G.fps} fps`, 18, 124, 12, '#8fb0c8', 'left', 600);
    // wind arrow
    if (v.wv > 5) { ctx.save(); ctx.translate(W - 200 - 30, 40); ctx.rotate(v.wa); ctx.strokeStyle = '#bfe3ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(12, 0); ctx.lineTo(6, -5); ctx.moveTo(12, 0); ctx.lineTo(6, 5); ctx.stroke(); ctx.restore(); text('wind', W - 230, 62, 10, '#bfe3ff', 'center', 600); }

    // minimap
    drawMap(W - 110, 110, 180, v, false);
    if (G.bigMap) { const s = Math.min(W, H) * 0.85; ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(0, 0, W, H); drawMap(W / 2, H / 2, s, v, true); text('MAP (M to close)', W / 2, H / 2 - s / 2 - 10, 16, '#fff', 'center'); }

    // boss bar
    if (G.boss) {
      const b = G.boss, bw = Math.min(620, W * 0.6), bx = (W - bw) / 2;
      text(b.def.name.toUpperCase(), W / 2, 30, 18, '#ff6b7a', 'center', 900);
      bar(bx, 38, bw, 14, b.hp / b.mh, '#e8283c');
      text(`${Math.ceil(b.hp).toLocaleString()} / ${b.mh.toLocaleString()}`, W / 2, 66, 11, '#fff', 'center', 600);
      if (G.me) {
        const d = Math.hypot(b.x - G.me.x, b.y - G.me.y);
        if (d > 700) { const a = Math.atan2(b.y - G.me.y, b.x - G.me.x); const r = Math.min(W, H) * 0.4; ctx.save(); ctx.translate(W / 2 + Math.cos(a) * r, H / 2 + Math.sin(a) * r); ctx.rotate(a); ctx.fillStyle = '#ff2040'; ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-8, -10); ctx.lineTo(-8, 10); ctx.fill(); ctx.restore(); }
      }
    }

    // hp / boat
    const bd = D.BOAT[pr.boat];
    const hpY = H - 46;
    text(`${bd.name}`, 18, hpY - 10, 14, '#fff');
    bar(18, hpY, 260, 16, me.hp / me.mh, me.hp / me.mh > 0.35 ? '#46d17a' : '#ff4d5e');
    text(`${Math.ceil(me.hp)} / ${me.mh}`, 148, hpY + 13, 12, '#fff', 'center', 700);
    text(`🩹 ${pr.patches} (H)   🦀 pots ${pr.pots} (T)`, 18, hpY + 36, 12, '#bfe3ff', 'left', 600);

    // weapons hotbar
    const slots = D.WEAPONS.length, sw = 46, gap = 4, hbW = slots * (sw + gap);
    const hx = W - hbW - 16, hy = H - 66;
    for (let i = 0; i < slots; i++) {
      const w = D.WEAPONS[i], owned = pr.weapons.includes(w.id), sel = pr.weapon === w.id;
      const x = hx + i * (sw + gap);
      ctx.fillStyle = sel ? 'rgba(58,209,197,.85)' : owned ? 'rgba(10,26,42,.85)' : 'rgba(10,26,42,.35)'; roundRect(x, hy, sw, sw, 8); ctx.fill();
      ctx.strokeStyle = sel ? '#bff9ff' : 'rgba(255,255,255,.15)'; ctx.lineWidth = 1.5; ctx.stroke();
      text(String(i + 1), x + 5, hy + 13, 10, owned ? '#fff' : '#557', 'left', 700);
      text(SHORT[w.id] || w.name, x + sw / 2, hy + 32, 9, sel ? '#032' : owned ? '#dfefff' : '#446', 'center', 700);
    }
    const cw = D.WEAPON[pr.weapon];
    text(`${cw.name}  ·  ${v.me ? v.me.ammo : 0} ${D.AMMO_BY[cw.ammo].name}`, W - 16, hy - 10, 14, v.me && v.me.ammo === 0 ? '#ff4d5e' : '#fff', 'right');
    if (cw.spin && v.me) bar(W - 16 - 120, hy - 36, 120, 5, v.me.spin / cw.spin, '#ffc94a');
    const bait = D.BAIT[pr.bait] || D.BAITS[0];
    text(`🎣 ${D.ROD[pr.rod].name} (R)  ·  ${bait.name}${pr.bait !== 'none' ? ' ×' + (pr.baits[pr.bait] || 0) : ''} (Q)`, W - 16, hy - 30 - (cw.spin ? 14 : 0), 12, '#bfe3ff', 'right', 600);

    // bounties
    let by = 230;
    text('BOUNTIES (J)', W - 16, by, 11, '#ffc94a', 'right', 800);
    for (const b of pr.bounties) { by += 17; text(`${b.text}  ${b.got}/${b.n}  · $${b.reward.toLocaleString()}`, W - 16, by, 12, '#dfefff', 'right', 600); }
    by += 12;
    for (const k of G.killfeed) { k.t -= dt; by += 17; text(k.text, W - 16, by, 12, `rgba(255,140,140,${Math.min(1, k.t)})`, 'right', 700); }
    G.killfeed = G.killfeed.filter((k) => k.t > 0);

    // contextual prompts
    const cxp = W / 2, cyp = H - 150;
    const f = me.f;
    if (v.me && v.me.reel) drawReel(v.me.reel);
    else if (v.me && v.me.bite) text('HOOK IT!  Right click / Space / F', cxp, cyp, 26, '#ffde59', 'center', 900);
    else if (f && f[0] === 'wait') text('Waiting for a bite… (press again to reel in)', cxp, cyp + 40, 14, '#dfefff', 'center', 600);
    else if (Math.hypot(me.x, me.y) < D.DOCK_R) text('⚓ Harbor — press E to open the shop · sell fish · repair', cxp, cyp + 40, 16, '#ffc94a', 'center', 800);
    const ready = v.pots.find((p) => p[3] && p[4] >= 60 && Math.hypot(p[1] - me.x, p[2] - me.y) < 110);
    if (ready) text('Press T to haul up your crab pot', cxp, cyp + 64, 14, '#5ee37a', 'center', 700);

    // death screen
    if (me.d) {
      ctx.fillStyle = 'rgba(40,0,0,.55)'; ctx.fillRect(0, 0, W, H);
      text('YOUR BOAT WAS SUNK', W / 2, H / 2 - 20, 44, '#ff4d5e', 'center', 900);
      text(`Respawning at the harbor in ${Math.ceil(v.me ? v.me.respawn : 0)}…  Your cargo is floating in the wreck — go get it back!`, W / 2, H / 2 + 20, 16, '#fff', 'center', 600);
    }

    // crosshair
    const mx = G.mouse.x, my = G.mouse.y;
    ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(mx, my, 9, 0, TAU); ctx.moveTo(mx - 15, my); ctx.lineTo(mx - 5, my); ctx.moveTo(mx + 5, my); ctx.lineTo(mx + 15, my); ctx.moveTo(mx, my - 15); ctx.lineTo(mx, my - 5); ctx.moveTo(mx, my + 5); ctx.lineTo(mx, my + 15); ctx.stroke();
    if (!f && G.profile) {
      const range = D.ROD[pr.rod].range;
      const d = Math.hypot(G.mouse.wx - me.x, G.mouse.wy - me.y);
      if (d > range) { ctx.fillStyle = 'rgba(255,120,120,.9)'; ctx.font = '600 11px system-ui'; ctx.textAlign = 'center'; ctx.fillText('max cast', mx, my + 28); }
    }

    // music mood
    Sfx.musicTick(dt, G.boss ? 2 : D.biomeAt(me.x, me.y) >= 5 || nightLevel(v.day) > 0.5 ? 1 : 0);
  }

  function drawReel(r) {
    const w = Math.min(460, W * 0.7), x = (W - w) / 2, y = H - 190;
    ctx.fillStyle = 'rgba(5,15,28,.85)'; roundRect(x - 16, y - 34, w + 32, 112, 14); ctx.fill();
    const sp = D.SPECIES[r.sid];
    text(r.burst ? 'IT’S RUNNING! EASE OFF!' : 'Hold Right Click / Space / F to reel', W / 2, y - 12, 15, r.burst ? '#ff6b7a' : '#dfefff', 'center', 800);
    text('CATCH', x, y + 12, 11, '#8fb0c8', 'left', 800);
    bar(x, y + 18, w, 14, r.p, '#3ad1c5');
    if (sp) { ctx.save(); R.drawSpecies(ctx, sp, x + w * Math.max(0.03, Math.min(0.97, r.p)), y + 25, 34, G.t * 2, true); ctx.restore(); }
    text('LINE TENSION', x, y + 52, 11, '#8fb0c8', 'left', 800);
    const col = r.t < 0.5 ? '#46d17a' : r.t < 0.8 ? '#ffc94a' : '#ff4d5e';
    const jitter = r.t > 0.8 ? (Math.random() - 0.5) * 4 : 0;
    bar(x + jitter, y + 58, w, 14, r.t, col);
    ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(x + w * 0.8, y + 56, 2, 18);
    if (G.mouse.r || G.keys.Space || G.keys.KeyF) if (Math.random() < 0.5) Sfx.play('reel');
  }

  // ================================================================ menu background
  let menuT = 0;
  function drawMenuBg(dt) {
    menuT += dt;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = '#062038'; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 9; i++) {
      const sp = D.SPECIES[(i * 137 + Math.floor(menuT / 6) * 11) % D.SPECIES.length];
      const x = ((menuT * (30 + i * 9) + i * 400) % (W + 400)) - 200, y = H * (0.1 + i * 0.1) + Math.sin(menuT + i) * 20;
      ctx.globalAlpha = 0.35; R.drawSpecies(ctx, sp, x, y, 60 + (i % 3) * 30, menuT + i); ctx.globalAlpha = 1;
    }
  }

  // ================================================================ menu wiring
  $('speciesCount').textContent = D.SPECIES.length.toLocaleString();
  $('bossCount').textContent = D.BOSSES.length;
  $('nameIn').value = settings.name || (window.steam && window.steam.name) || '';
  $('nameIn').addEventListener('input', (e) => { settings.name = e.target.value.slice(0, 16); saveSettings(); });
  $('bSolo').onclick = () => { Sfx.init(); startSolo(); };
  $('bMulti').onclick = () => { Sfx.init(); showMulti(); };
  $('bHelp').onclick = () => UI.open('help');
  $('bSettings').onclick = () => UI.open('settings');
  $('mBack').onclick = () => { $('s-multi').classList.add('hidden'); $('s-menu').classList.remove('hidden'); };
  function defaultServer() {
    if (settings.server) return settings.server;
    if (window.steam && window.steam.server) return window.steam.server;
    if (location.protocol.startsWith('http')) return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
    return 'ws://localhost:8080/ws';
  }
  $('srvIn').value = defaultServer();
  function setStatus(t, cls) { const s = $('mStatus'); s.textContent = t; s.className = 'small ' + (cls || 'muted'); }
  function showMulti() {
    $('s-menu').classList.add('hidden'); $('s-multi').classList.remove('hidden');
    if (G.net && G.net.ok) { $('mLobbies').classList.remove('hidden'); G.net.send({ t: 'list' }); }
  }
  $('mConnect').onclick = () => {
    const url = $('srvIn').value.trim();
    settings.server = url; saveSettings();
    if (G.net) G.net.close();
    setStatus('Connecting…');
    try { G.net = new Net(url); } catch (e) { setStatus('Bad server address', 'bad'); }
  };
  $('mRefresh').onclick = () => G.net && G.net.send({ t: 'list' });
  $('cType').onchange = (e) => $('cPw').classList.toggle('hidden', e.target.value !== 'private');
  $('mCreate').onclick = () => G.net && G.net.send({ t: 'create', name: $('cName').value, type: $('cType').value, password: $('cPw').value, pvp: $('cPvp').checked });
  $('mInvJoin').onclick = () => G.net && G.net.send({ t: 'join', invite: $('invIn').value.trim().toUpperCase() });
  $('mIdJoin').onclick = () => G.net && G.net.send({ t: 'join', id: $('idIn').value.trim().toUpperCase(), password: prompt('Password (leave empty if none)') || '' });
  function renderLobbies(list) {
    const tb = $('lobBody'); tb.innerHTML = '';
    for (const l of list || []) {
      const tr = document.createElement('tr');
      const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
      tr.innerHTML = `<td>${l.official ? '⭐ ' : ''}${esc(l.name)}</td><td><span class="pill">${l.locked ? '🔒 private' : 'public'}</span></td><td><span class="pill ${l.pvp ? 'pvp' : 'off'}">${l.pvp ? 'PvP' : 'Co-op'}</span></td><td>${l.players}/${l.max}</td><td></td>`;
      const btn = document.createElement('button'); btn.textContent = l.players >= l.max ? 'Full' : 'Join'; btn.disabled = l.players >= l.max;
      btn.onclick = () => G.net.send({ t: 'join', id: l.id, password: l.locked ? prompt('Lobby password') || '' : '' });
      tr.lastChild.appendChild(btn); tb.appendChild(tr);
    }
    if (!tb.children.length) tb.innerHTML = '<tr><td colspan="5" class="muted">No lobbies yet — create one!</td></tr>';
  }

  function saveSettings() { store.set('dw_settings', settings); }
  function applyVolumes() { Sfx.setVolume('master', settings.master); Sfx.setVolume('sfx', settings.sfx); Sfx.setVolume('music', settings.music); }
  G.saveSettings = saveSettings; G.applyVolumes = applyVolumes;
})();
