/*
 * DEEP WATERS — DOM panels: shop, bestiary, journal, settings, help, pause, scoreboard.
 */
(function () {
  'use strict';
  const D = window.SeaData, Sim = window.SeaSim, R = window.SeaRender;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => '$' + Math.round(n).toLocaleString();

  const UI = (window.UI = { current: null, tab: {}, dexPage: 0, dexFilter: { biome: -2, q: '', found: false } });

  UI.isOpen = () => !!UI.current;
  UI.open = function (name) {
    UI.current = name; UI._sameView = false;
    $('s-panel').classList.remove('hidden');
    render();
    window.Sfx && window.Sfx.play('ui');
  };
  UI.close = function () { UI.current = null; $('s-panel').classList.add('hidden'); };
  UI.refresh = function () { if (UI.current === 'shop' || UI.current === 'journal' || UI.current === 'pause') render(); };
  $('s-panel').addEventListener('mousedown', (e) => { if (e.target.id === 's-panel') UI.close(); });

  function render() {
    const el = $('panel');
    const G = window.G;
    if (!G) return;
    const scroll = el.querySelector('.scroll');
    const keep = scroll ? scroll.scrollTop : 0;
    ({ shop, dex, journal, settings, help, pause }[UI.current] || (() => {}))(el, G);
    const s2 = el.querySelector('.scroll');
    if (s2 && UI._sameView) s2.scrollTop = keep;
    UI._sameView = true;
  }

  function header(title, extra = '') {
    return `<header><h2>${title}</h2>${extra}<button data-close>✕ Close</button></header>`;
  }
  function wire(el) {
    el.querySelectorAll('[data-close]').forEach((b) => (b.onclick = UI.close));
    el.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { UI.tab[UI.current] = b.dataset.tab; UI._sameView = false; render(); window.Sfx.play('ui'); }));
  }
  function tabs(list, cur) { return `<div class="tabs">${list.map(([id, label]) => `<button data-tab="${id}" class="${cur === id ? 'on' : ''}">${label}</button>`).join('')}</div>`; }

  // ------------------------------------------------------------------ shop
  function shop(el, G) {
    const pr = G.profile;
    if (!pr) { el.innerHTML = header('Harbor Shop') + '<div class="muted">Loading…</div>'; wire(el); return; }
    const me = G.me;
    const tab = UI.tab.shop || 'sell';
    const missing = me ? Math.max(0, me.mh - me.hp) : 0;
    el.innerHTML = header('⚓ Harbor Shop', `<span class="gold" style="font-size:22px;font-weight:900">${money(pr.money)}</span>
      <button id="repairB" ${missing < 1 ? 'disabled' : ''}>🔧 Repair ${missing >= 1 ? money(Math.ceil(missing * 1.5)) : '(full)'}</button>`) +
      tabs([['sell', `🐟 Sell (${pr.cargo.length})`], ['rod', '🎣 Rods'], ['boat', '⛵ Boats'], ['weapon', '🔫 Weapons'], ['ammo', '📦 Ammo'], ['bait', '🪱 Bait'], ['upg', '⚙ Upgrades'], ['item', '🧰 Items'], ['market', '📈 Market']], tab) +
      '<div class="scroll" id="shopBody"></div>';
    wire(el);
    $('repairB').onclick = () => G.act({ a: 'repair' });
    const body = $('shopBody');
    const buy = (cat, id) => () => G.act({ a: 'buy', cat, id });

    if (tab === 'sell') {
      const total = pr.cargo.reduce((s, it) => s + Sim.sellPrice(it, G.market), 0);
      body.innerHTML = `<div class="row" style="justify-content:space-between;margin-bottom:8px"><span class="muted">Cargo ${pr.cargo.length}/${G.st.cargoMax} · prices change every few minutes (see Market)</span>
        <button class="primary" id="sellAll" ${pr.cargo.length ? '' : 'disabled'}>Sell all for ${money(total)}</button></div><div id="cargoList"></div>`;
      $('sellAll').onclick = () => G.act({ a: 'sellall' });
      const list = $('cargoList');
      if (!pr.cargo.length) list.innerHTML = '<div class="muted" style="padding:30px;text-align:center">Your hold is empty. Go catch something!</div>';
      pr.cargo.forEach((it, i) => {
        const sp = D.SPECIES[it.s], rar = D.RARITY[sp.rarity];
        const row = document.createElement('div'); row.className = 'cargo-row';
        const c = document.createElement('canvas'); c.width = 90; c.height = 46;
        R.drawSpecies(c.getContext('2d'), sp, 45, 23, 70, 0);
        row.appendChild(c);
        row.insertAdjacentHTML('beforeend', `<div class="n"><b style="color:${rar.color}">${esc(sp.name)}</b><div class="muted small">${rar.name} · ${sp.kind === 'treasure' ? 'treasure' : it.w + ' kg'} · market ×${(G.market[sp.kind] || 1).toFixed(2)}</div></div><b class="gold">${money(Sim.sellPrice(it, G.market))}</b>`);
        const b = document.createElement('button'); b.textContent = 'Sell'; b.onclick = () => G.act({ a: 'sell', i });
        row.appendChild(b); list.appendChild(row);
      });
      return;
    }
    const grid = document.createElement('div'); grid.className = 'grid'; body.appendChild(grid);
    const card = (html, cls, btnText, onClick, disabled) => {
      const d = document.createElement('div'); d.className = 'item ' + (cls || ''); d.innerHTML = html;
      if (btnText) { const b = document.createElement('button'); b.textContent = btnText; b.disabled = !!disabled; if (!disabled) b.className = cls && cls.includes('owned') ? '' : 'primary'; b.onclick = onClick; d.appendChild(b); }
      grid.appendChild(d);
    };
    if (tab === 'rod') for (const r of D.RODS) {
      const owned = pr.rods.includes(r.id), eq = pr.rod === r.id;
      card(`<h4>${r.name}</h4><div class="stats"><span>Cast range</span><b>${r.range}</b><span>Reel power</span><b>${r.power}</b><span>Line strength</span><b>${r.strength}</b><span>Luck</span><b>+${r.luck}</b><span>Bite speed</span><b>${Math.round((1 / r.speed) * 100)}%</b></div><div class="gold">${r.price ? money(r.price) : 'Free'}</div>`,
        eq ? 'equipped owned' : owned ? 'owned' : '', eq ? 'Equipped' : owned ? 'Equip' : 'Buy', owned ? () => G.act({ a: 'rod', id: r.id }) : buy('rod', r.id), eq || (!owned && pr.money < r.price));
    }
    if (tab === 'boat') for (const b of D.BOATS) {
      const owned = pr.boats.includes(b.id), eq = pr.boat === b.id;
      card(`<h4>${b.name}</h4><div class="stats"><span>Hull HP</span><b>${b.hp}</b><span>Top speed</span><b>${Math.round(b.thrust / b.mass / 1.1)}</b><span>Cargo</span><b>${b.cargo}</b><span>Mass</span><b>${b.mass}t</b><span>Gun damage</span><b>×${b.dmgMul}</b><span>Handling</span><b>${b.turn}</b></div><div class="gold">${b.price ? money(b.price) : 'Free'}</div>`,
        eq ? 'equipped owned' : owned ? 'owned' : '', eq ? 'Sailing' : owned ? 'Switch' : 'Buy', owned ? () => G.act({ a: 'boat', id: b.id }) : buy('boat', b.id), eq || (!owned && pr.money < b.price));
    }
    if (tab === 'weapon') D.WEAPONS.forEach((w, i) => {
      const owned = pr.weapons.includes(w.id), eq = pr.weapon === w.id;
      card(`<h4>[${i + 1}] ${w.name}</h4><div class="stats"><span>Damage</span><b>${w.dmg}${w.pellets > 1 ? '×' + w.pellets : ''}</b><span>Fire rate</span><b>${w.rate}/s</b><span>Ammo</span><b>${D.AMMO_BY[w.ammo].name}</b><span>Special</span><b>${w.splash ? 'Explosive' : w.pull ? 'Pulls prey' : w.pierce > 20 ? 'Pierces all' : w.pierce ? 'Pierce ' + w.pierce : w.flame ? 'Flames' : w.spin ? 'Spin-up' : '—'}</b></div><div class="gold">${w.price ? money(w.price) : 'Free'}</div>`,
        eq ? 'equipped owned' : owned ? 'owned' : '', eq ? 'Equipped' : owned ? 'Equip' : 'Buy', owned ? () => G.act({ a: 'weapon', id: w.id }) : buy('weapon', w.id), eq || (!owned && pr.money < w.price));
    });
    if (tab === 'ammo') for (const a of D.AMMO) card(`<h4>${a.name}</h4><div class="muted">You have <b>${pr.ammo[a.id] || 0}</b></div><div>Pack of ${a.pack} · <span class="gold">${money(a.price)}</span></div><div class="muted small">Used by: ${D.WEAPONS.filter((w) => w.ammo === a.id).map((w) => w.name).join(', ')}</div>`, '', 'Buy pack', buy('ammo', a.id), pr.money < a.price);
    if (tab === 'bait') for (const b of D.BAITS.filter((x) => x.pack)) card(`<h4>${b.name}</h4><div class="stats"><span>Luck</span><b>+${b.luck}</b><span>Bite speed</span><b>${Math.round((1 / b.speed) * 100)}%</b></div><div class="muted small">${b.boss === true ? 'Summons the boss of the biome you cast in!' : b.boss ? 'Summons the LEVIATHAN (Abyssal Trench only).' : 'Higher luck = rarer fish.'}</div><div>You have <b>${pr.baits[b.id] || 0}</b> · pack of ${b.pack} · <span class="gold">${money(b.price)}</span></div>`, pr.bait === b.id ? 'equipped' : '', 'Buy', buy('bait', b.id), pr.money < b.price);
    if (tab === 'upg') for (const u of D.UPGRADES) {
      const lvl = pr.upg[u.id], max = lvl >= u.prices.length;
      card(`<h4>${u.name}</h4><div class="muted small">${u.desc}</div><div>Level <b>${lvl}</b> / ${u.prices.length}</div><div style="letter-spacing:3px">${'■'.repeat(lvl)}${'□'.repeat(u.prices.length - lvl)}</div><div class="gold">${max ? 'MAXED' : money(u.prices[lvl])}</div>`, max ? 'owned' : '', max ? 'Maxed' : 'Upgrade', buy('upg', u.id), max || pr.money < u.prices[lvl]);
    }
    if (tab === 'item') for (const it of D.ITEMS) card(`<h4>${it.name}</h4><div class="muted small">${it.desc}</div><div>You have <b>${it.id === 'pot' ? pr.pots : pr.patches}</b></div><div class="gold">${money(it.price)}</div>`, '', 'Buy', buy('item', it.id), pr.money < it.price);
    if (tab === 'market') {
      grid.innerHTML = Object.entries(G.market).sort((a, b) => b[1] - a[1]).map(([k, m]) => `<div class="item"><h4 style="text-transform:capitalize">${k}</h4><div style="font-size:22px;font-weight:900" class="${m >= 1.2 ? 'good' : m < 0.9 ? 'bad' : ''}">×${m.toFixed(2)}</div><div class="muted small">${m >= 1.2 ? 'High demand — sell now!' : m < 0.9 ? 'Low demand — maybe hold.' : 'Normal demand'}</div></div>`).join('');
    }
  }

  // ------------------------------------------------------------------ bestiary
  function dex(el, G) {
    const f = UI.dexFilter;
    const dexData = G.dex || {};
    const found = Object.keys(dexData).length;
    el.innerHTML = header(`📖 Bestiary — ${found} / ${D.SPECIES.length} discovered`) +
      `<div class="row" style="margin-bottom:10px">
        <input id="dq" placeholder="Search species…" value="${esc(f.q)}" style="flex:1">
        <select id="db"><option value="-2">All waters</option>${D.BIOMES.map((b) => `<option value="${b.id}" ${f.biome === b.id ? 'selected' : ''}>${b.name}</option>`).join('')}<option value="-1" ${f.biome === -1 ? 'selected' : ''}>Treasures</option></select>
        <label class="row"><input type="checkbox" id="df" ${f.found ? 'checked' : ''}> Discovered only</label>
      </div><div class="scroll"><div class="dex" id="dexGrid"></div></div><div class="row" style="justify-content:center;margin-top:8px"><button id="dPrev">◀</button><span id="dPage" class="muted"></span><button id="dNext">▶</button></div>`;
    wire(el);
    const q = f.q.toLowerCase();
    const list = D.SPECIES.filter((s) => (f.biome === -2 || s.biome === f.biome) && (!f.found || dexData[s.id]) && (!q || (dexData[s.id] && s.name.toLowerCase().includes(q))));
    const per = 48, pages = Math.max(1, Math.ceil(list.length / per));
    UI.dexPage = Math.min(UI.dexPage, pages - 1);
    $('dPage').textContent = `Page ${UI.dexPage + 1} / ${pages} · ${list.length} species`;
    const grid = $('dexGrid');
    for (const sp of list.slice(UI.dexPage * per, UI.dexPage * per + per)) {
      const got = dexData[sp.id], rar = D.RARITY[sp.rarity];
      const d = document.createElement('div'); d.className = 'e' + (got ? '' : ' unk');
      d.style.borderColor = got ? rar.color + '88' : '';
      const c = document.createElement('canvas'); c.width = 130; c.height = 70;
      R.drawSpecies(c.getContext('2d'), sp, 65, 35, 100, 0, !got);
      d.appendChild(c);
      d.insertAdjacentHTML('beforeend', got
        ? `<b style="color:${rar.color}">${esc(sp.name)}</b><div class="muted">${rar.name} · ×${got.n}${sp.kind !== 'treasure' ? ' · best ' + got.b + 'kg' : ''}</div>`
        : `<b>???</b><div class="muted">${sp.biome >= 0 ? D.BIOMES[sp.biome].name : 'Anywhere'}${sp.night ? ' · 🌙 night' : ''}${sp.storm ? ' · ⛈ storms' : ''}</div>`);
      if (got) d.title = `${sp.name}\n${sp.fact}\nBase value ${money(sp.value)} · ${sp.minW}-${sp.maxW}kg${sp.night ? '\nOnly bites at night' : ''}${sp.storm ? '\nOnly bites during storms' : ''}`;
      grid.appendChild(d);
    }
    $('dq').oninput = (e) => { f.q = e.target.value; UI.dexPage = 0; UI._sameView = false; render(); const i = $('dq'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); };
    $('db').onchange = (e) => { f.biome = +e.target.value; UI.dexPage = 0; UI._sameView = false; render(); };
    $('df').onchange = (e) => { f.found = e.target.checked; UI.dexPage = 0; UI._sameView = false; render(); };
    $('dPrev').onclick = () => { UI.dexPage = Math.max(0, UI.dexPage - 1); UI._sameView = false; render(); };
    $('dNext').onclick = () => { UI.dexPage = Math.min(pages - 1, UI.dexPage + 1); UI._sameView = false; render(); };
  }

  // ------------------------------------------------------------------ journal
  function journal(el, G) {
    const pr = G.profile;
    if (!pr) return;
    const tab = UI.tab.journal || 'bounties';
    el.innerHTML = header('📜 Captain’s Journal') + tabs([['bounties', 'Bounties'], ['ach', `Achievements (${Object.keys(pr.ach).length}/${D.ACHIEVEMENTS.length})`], ['bosses', 'Boss Log'], ['stats', 'Stats']], tab) + '<div class="scroll" id="jBody"></div>';
    wire(el);
    const body = $('jBody');
    if (tab === 'bounties') {
      body.innerHTML = pr.bounties.map((b) => `<div class="item" style="margin-bottom:8px"><h4>${esc(b.text)}</h4><div style="height:8px;background:#0006;border-radius:9px;overflow:hidden"><div style="height:100%;width:${Math.min(100, (b.got / b.n) * 100)}%;background:var(--acc)"></div></div><div class="row" style="justify-content:space-between"><span>${b.got} / ${b.n}</span><b class="gold">${money(b.reward)}</b></div></div>`).join('') +
        '<button id="reroll">🎲 New bounties ($200, at harbor)</button>';
      $('reroll').onclick = () => G.act({ a: 'bounty_reroll' });
    } else if (tab === 'ach') {
      body.innerHTML = D.ACHIEVEMENTS.map(([id, name, desc]) => `<div class="ach ${pr.ach[id] ? 'got' : ''}"><div class="i">${pr.ach[id] ? '★' : '?'}</div><div><b>${name}</b><div class="muted small">${desc}</div></div></div>`).join('');
    } else if (tab === 'bosses') {
      body.innerHTML = '<div class="grid">' + D.BOSSES.map((b) => { const k = pr.stats.bosses[b.id] || 0; return `<div class="item ${k ? 'owned' : ''}"><h4>${k ? '☠ ' : ''}${esc(b.name)}</h4><div class="muted small">${D.BIOMES[b.biome].name} · ${b.hp.toLocaleString()} HP</div><div class="small">Attacks: ${b.patterns.filter((x, i, a) => a.indexOf(x) === i).join(', ')}</div><div class="gold small">Reward up to ${money(b.reward)}</div><div>${k ? `Defeated ×${k}` : '<span class="muted">Not yet defeated</span>'}</div></div>`; }).join('') + '</div><p class="muted">Summon bosses with <b>Boss Chum</b> bait (cast it in the boss’s biome). The Leviathan requires a <b>Leviathan Heart</b> in the Abyssal Trench. World bosses also surface on their own.</p>';
    } else {
      const s = pr.stats;
      const rows = [['Fish caught', s.caught], ['Species discovered', `${Object.keys(G.dex).length} / ${D.SPECIES.length}`], ['Creatures killed', s.kills], ['Bosses defeated', Object.values(s.bosses).reduce((a, b) => a + b, 0)], ['Total earned', money(s.earned)], ['Biggest catch', s.biggest + ' kg'], ['Times sunk', s.deaths], ['Players sunk', s.pvp], ['Biomes fished', `${Object.keys(s.biomes).length} / 7`], ['Time at sea', Math.round(s.playtime / 60) + ' min']];
      body.innerHTML = '<table class="lob">' + rows.map(([k, v]) => `<tr><td class="muted">${k}</td><td><b>${v}</b></td></tr>`).join('') + '</table>';
    }
  }

  // ------------------------------------------------------------------ settings
  function settings(el, G) {
    const s = G.settings;
    el.innerHTML = header('⚙ Settings') + `<div class="scroll"><div class="col" style="max-width:520px;gap:14px">
      <label class="row">Master volume <input class="vol" type="range" min="0" max="1" step="0.05" id="sM" value="${s.master}"></label>
      <label class="row">Sound effects <input class="vol" type="range" min="0" max="1" step="0.05" id="sS" value="${s.sfx}"></label>
      <label class="row">Music <input class="vol" type="range" min="0" max="1" step="0.05" id="sMu" value="${s.music}"></label>
      <label class="row">Gore <select id="sG"><option value="0">Off (splashes only)</option><option value="1">Normal</option><option value="2">EXTREME</option></select></label>
      <label class="row"><input type="checkbox" id="sSh" ${s.shake ? 'checked' : ''}> Screen shake</label>
      <label class="row"><input type="checkbox" id="sF" ${s.fps ? 'checked' : ''}> Show FPS</label>
      <hr style="border-color:#23445f;width:100%">
      <div><b>Solo save</b><div class="muted small">Stored in this browser. Online progress is separate and lives on the server (so nobody can cheat it in).</div></div>
      <div class="row"><button id="sExport">Export solo save</button><button id="sImport">Import solo save</button><button class="danger" id="sReset">Delete solo save</button></div>
    </div></div>`;
    wire(el);
    $('sG').value = s.gore;
    const save = () => { G.saveSettings(); G.applyVolumes(); };
    $('sM').oninput = (e) => { s.master = +e.target.value; save(); };
    $('sS').oninput = (e) => { s.sfx = +e.target.value; save(); window.Sfx.play('ui'); };
    $('sMu').oninput = (e) => { s.music = +e.target.value; save(); };
    $('sG').onchange = (e) => { s.gore = +e.target.value; R.fx.gore = s.gore; save(); };
    $('sSh').onchange = (e) => { s.shake = e.target.checked; save(); };
    $('sF').onchange = (e) => { s.fps = e.target.checked; save(); };
    $('sExport').onclick = () => { const data = localStorage.getItem('dw_solo') || '{}'; const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' })); a.download = 'deep-waters-save.json'; a.click(); };
    $('sImport').onclick = () => { const i = document.createElement('input'); i.type = 'file'; i.accept = '.json'; i.onchange = () => { const r = new FileReader(); r.onload = () => { try { const p = Sim.fixProfile(JSON.parse(r.result)); G.store.set('dw_solo', p); G.toast('Save imported. Start Solo to load it.', 'good'); } catch { G.toast('Invalid save file', 'bad'); } }; r.readAsText(i.files[0]); }; i.click(); };
    $('sReset').onclick = () => { if (G.mode === 'solo') return G.toast('Quit to the menu first.', 'warn'); if (confirm('Delete your solo save? This cannot be undone.')) { localStorage.removeItem('dw_solo'); localStorage.removeItem('dw_seed'); G.toast('Solo save deleted.', 'warn'); } };
  }

  // ------------------------------------------------------------------ help
  function help(el) {
    const k = (s) => `<span class="kbd">${s}</span>`;
    el.innerHTML = header('📖 How to Play') + `<div class="scroll"><div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(320px,1fr))">
      <div class="item"><h4>Controls</h4><table class="help">
        <tr><td>${k('W')}${k('A')}${k('S')}${k('D')}</td><td>Sail (real boat physics — momentum, drift, rudder)</td></tr>
        <tr><td>Mouse</td><td>Aim · ${k('Left click')} shoot</td></tr>
        <tr><td>${k('Right click')} / ${k('F')}</td><td>Cast at cursor · hook the bite · hold to reel</td></tr>
        <tr><td>${k('Space')}</td><td>Hook / hold to reel</td></tr>
        <tr><td>${k('1')}–${k('9')}</td><td>Switch weapon</td></tr>
        <tr><td>${k('Q')} / ${k('R')}</td><td>Cycle bait / rod</td></tr>
        <tr><td>${k('E')}</td><td>Shop (at harbor)</td></tr>
        <tr><td>${k('T')}</td><td>Drop / haul crab pot</td></tr>
        <tr><td>${k('H')}</td><td>Hull patch (heal 40%)</td></tr>
        <tr><td>${k('B')} ${k('J')} ${k('M')}</td><td>Bestiary · Journal · Map</td></tr>
        <tr><td>${k('Tab')} ${k('Enter')}</td><td>Scoreboard · Chat (online)</td></tr>
        <tr><td>Mouse wheel</td><td>Zoom</td></tr>
        <tr><td>${k('Esc')}</td><td>Menu / invite friends</td></tr></table></div>
      <div class="item"><h4>Fishing</h4><p>Cast, wait for the <b>!</b>, then hook it fast. Hold to reel and fill the CATCH bar — but watch LINE TENSION. When the fish runs, let go or your line snaps. Better rods reel faster and hold more tension. Bait and luck raise your odds for rare fish. Some species only bite at <b>night</b> or during <b>storms</b>.</p>
      <p>There are <b>${D.SPECIES.length.toLocaleString()} species</b> across 7 biomes — the further from the harbor, the rarer, pricier and more dangerous it gets.</p></div>
      <div class="item"><h4>Combat & Bosses</h4><p>The sea fights back: sharks, eels, jellies, serpents, abyss horrors. Kill them for bounties and loot crates. <b>${D.BOSSES.length} bosses</b> can be summoned with Boss Chum or surface as world events. Watch for red telegraphs: charges, slams, whirlpools, spike novas.</p>
      <p>If you sink, you lose 10% of your cash and your whole cargo floats in a wreck — race back to salvage it (in PvP, others can steal it!).</p></div>
      <div class="item"><h4>Making money</h4><p>Sell fish at the harbor. Prices follow the <b>market</b>, which shifts every few minutes. Complete <b>bounties</b> for bonus cash. Drop <b>crab pots</b> and come back for free catches. Upgrade rods → boats → guns → the Leviathan.</p></div>
    </div></div>`;
    wire(el);
  }

  // ------------------------------------------------------------------ pause
  function pause(el, G) {
    const online = G.mode === 'online';
    const snap = G.view;
    let players = '';
    if (online && snap) {
      players = '<h3>Players</h3><table class="lob">' + snap.players.map((p) => `<tr><td>${esc(p.n)}${p.id === G.myId ? ' (you)' : ''}</td><td>🐟 ${p.sc[0]}</td><td>☠ ${p.sc[1]}</td><td>${money(p.sc[2])}</td><td>${G.host && p.id !== G.myId ? `<button data-kick="${esc(p.id)}" class="danger">Kick</button>` : ''}</td></tr>`).join('') + '</table>';
    }
    const lob = G.lobby;
    el.innerHTML = header(online ? `⏸ ${esc(lob ? lob.name : 'Online')}` : '⏸ Paused (solo keeps running)') + `<div class="scroll"><div class="col" style="max-width:640px">
      <button class="primary" data-close>▶ Resume</button>
      ${online ? `<div class="item"><b>Invite friends</b><div class="muted small">${lob && lob.type === 'invite' ? 'This lobby is invite-only: each code works once and expires in 30 minutes.' : lob && lob.type === 'private' ? `Private lobby. Share the ID <b>${esc(lob.id)}</b> and the password.` : `Public lobby ID: <b>${esc(lob ? lob.id : '')}</b>`}</div><button id="pInv">${lob && lob.type === 'invite' ? 'Create invite code' : 'Copy lobby ID'}</button></div>` : ''}
      ${players}
      <div class="row"><button id="pDex">📖 Bestiary</button><button id="pJ">📜 Journal</button><button id="pS">⚙ Settings</button><button id="pH">❓ Help</button></div>
      <button class="danger" id="pQuit">${online ? 'Leave lobby' : 'Save & quit to menu'}</button>
    </div></div>`;
    wire(el);
    if ($('pInv')) $('pInv').onclick = () => G.net.send({ t: 'invite' });
    el.querySelectorAll('[data-kick]').forEach((b) => (b.onclick = () => { if (confirm('Kick this player? They cannot rejoin this lobby.')) G.net.send({ t: 'kick', pid: b.dataset.kick }); }));
    $('pDex').onclick = () => UI.open('dex');
    $('pJ').onclick = () => UI.open('journal');
    $('pS').onclick = () => UI.open('settings');
    $('pH').onclick = () => UI.open('help');
    $('pQuit').onclick = () => G.quitToMenu();
  }

  // ------------------------------------------------------------------ scoreboard (hold Tab)
  UI.scoreboard = function (show) {
    const el = $('scoreboard');
    const G = window.G;
    if (!show || !G.view) { el.classList.add('hidden'); return; }
    const rows = [...G.view.players].sort((a, b) => b.sc[2] - a.sc[2]);
    el.innerHTML = `<h3 style="margin-top:0">${G.mode === 'online' && G.lobby ? esc(G.lobby.name) : 'Solo'} — ${rows.length}/10</h3><table class="lob"><tr><th>Captain</th><th>Boat</th><th>Caught</th><th>Kills</th><th>Earned</th></tr>` +
      rows.map((p) => `<tr><td style="color:${esc(p.c)}">${esc(p.n)}${p.d ? ' ☠' : ''}</td><td>${esc((D.BOAT[p.b] || {}).name || '')}</td><td>${p.sc[0]}</td><td>${p.sc[1]}</td><td class="gold">${money(p.sc[2])}</td></tr>`).join('') + '</table>';
    el.classList.remove('hidden');
  };
})();
