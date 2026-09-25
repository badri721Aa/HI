/*
 * DEEP WATERS — procedural renderer. No sprite files: every fish, monster,
 * boss, boat and island is drawn from code (and from each species' genes).
 */
(function (root) {
  'use strict';
  const D = root.SeaData;
  const TAU = Math.PI * 2;
  const R = {};

  // ---------------------------------------------------------------- helpers
  const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;
  function shade(hex, amt) {
    if (hex[0] !== '#') return hex;
    let c = hex.slice(1); if (c.length === 3) c = c.split('').map((x) => x + x).join('');
    const n = parseInt(c, 16);
    const f = (v) => Math.max(0, Math.min(255, Math.round(v + amt * 255)));
    return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
  }
  R.shade = shade;
  function hash(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  R.hash = hash;
  function eye(ctx, x, y, r, glow) {
    ctx.fillStyle = glow ? '#eaff7a' : '#fff'; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(x + r * 0.2, y, r * 0.55, 0, TAU); ctx.fill();
  }

  // ---------------------------------------------------------------- bodies
  // Draws a creature facing +x, centred on 0,0, overall length L.
  // g = genes: { c1, c2, pattern, body, tail, fin, glow, name }
  function drawBody(ctx, kind, L, g, t) {
    const c1 = g.c1, c2 = g.c2;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    switch (kind) {
      case 'fish': case 'angler': case 'puffer': {
        const puffer = kind === 'puffer', angler = kind === 'angler';
        const h = L * (puffer ? 0.85 : angler ? 0.6 : g.body || 0.4);
        const wag = Math.sin(t * 9) * 0.18;
        ctx.fillStyle = c2;
        ctx.beginPath(); ctx.moveTo(-L * 0.38, 0);
        ctx.lineTo(-L * (0.52 + 0.14 * (g.tail || 1)), -h * 0.55 * (g.tail || 1) + wag * L * 0.2);
        ctx.lineTo(-L * (0.46 + 0.06 * (g.tail || 1)), wag * L * 0.1);
        ctx.lineTo(-L * (0.52 + 0.14 * (g.tail || 1)), h * 0.55 * (g.tail || 1) + wag * L * 0.2); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-L * 0.18, -h * 0.4);
        ctx.quadraticCurveTo(-L * 0.05, -h * (0.5 + 0.55 * (g.fin || 0.6)), L * 0.12, -h * 0.42); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-L * 0.1, h * 0.38); ctx.quadraticCurveTo(-L * 0.02, h * (0.5 + 0.3 * (g.fin || 0.6)), L * 0.08, h * 0.4); ctx.closePath(); ctx.fill();
        const grd = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
        grd.addColorStop(0, c1); grd.addColorStop(1, g.belly || shade2(c1));
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.ellipse(0, 0, L * 0.47, h * 0.5, 0, 0, TAU); ctx.fill();
        ctx.save(); ctx.clip();
        ctx.fillStyle = c2; ctx.globalAlpha = 0.55;
        const p = g.pattern || 0;
        if (p === 1) for (let i = -3; i <= 3; i++) ctx.fillRect(i * L * 0.12 - L * 0.02, -h, L * 0.04, h * 2);
        if (p === 2) for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.arc(Math.sin(i * 7.1) * L * 0.35, Math.cos(i * 3.3) * h * 0.3, L * 0.035, 0, TAU); ctx.fill(); }
        if (p === 3) { const gg = ctx.createLinearGradient(-L / 2, 0, L / 2, 0); gg.addColorStop(0, c2); gg.addColorStop(1, 'transparent'); ctx.fillStyle = gg; ctx.fillRect(-L / 2, -h, L, h * 2); }
        if (p === 4) { ctx.fillRect(-L * 0.25, -h, L * 0.1, h * 2); ctx.fillRect(L * 0.05, -h, L * 0.1, h * 2); }
        ctx.restore(); ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = Math.max(1, L * 0.015);
        ctx.beginPath(); ctx.ellipse(0, 0, L * 0.47, h * 0.5, 0, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.arc(L * 0.22, 0, h * 0.35, -0.9, 0.9); ctx.stroke();
        if (puffer) { ctx.strokeStyle = c2; ctx.lineWidth = Math.max(1, L * 0.02); for (let i = 0; i < 22; i++) { const a = (i / 22) * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(a) * L * 0.44, Math.sin(a) * h * 0.47); ctx.lineTo(Math.cos(a) * L * 0.58, Math.sin(a) * h * 0.62); ctx.stroke(); } }
        if (angler) {
          ctx.strokeStyle = shade2(c1); ctx.lineWidth = L * 0.02;
          ctx.beginPath(); ctx.moveTo(L * 0.2, -h * 0.4); ctx.quadraticCurveTo(L * 0.4, -h * 1.1, L * 0.62, -h * 0.55 + Math.sin(t * 3) * 3); ctx.stroke();
          ctx.save(); ctx.shadowColor = '#bfff5a'; ctx.shadowBlur = 20; ctx.fillStyle = '#e8ff8a';
          ctx.beginPath(); ctx.arc(L * 0.62, -h * 0.55 + Math.sin(t * 3) * 3, L * 0.05, 0, TAU); ctx.fill(); ctx.restore();
          ctx.fillStyle = '#fff';
          for (let i = 0; i < 6; i++) { const x = L * (0.3 + i * 0.03); ctx.beginPath(); ctx.moveTo(x, h * 0.05); ctx.lineTo(x + L * 0.012, h * 0.2); ctx.lineTo(x + L * 0.024, h * 0.05); ctx.fill(); }
        }
        eye(ctx, L * 0.3, -h * 0.12, Math.max(1.5, h * 0.11), g.glow);
        break;
      }
      case 'shark': case 'orca': case 'whale': {
        const whale = kind === 'whale', orca = kind === 'orca';
        const h = L * (whale ? 0.32 : 0.26);
        const wag = Math.sin(t * (whale ? 3 : 6)) * 0.2;
        ctx.fillStyle = c1;
        // tail
        ctx.beginPath(); ctx.moveTo(-L * 0.4, 0);
        if (whale || orca) { ctx.quadraticCurveTo(-L * 0.55, -h * 0.2, -L * 0.62, -h * 0.9 + wag * L * 0.1); ctx.quadraticCurveTo(-L * 0.52, 0, -L * 0.62, h * 0.9 + wag * L * 0.1); }
        else { ctx.lineTo(-L * 0.6, -h * 1.1 + wag * L * 0.2); ctx.lineTo(-L * 0.5, 0); ctx.lineTo(-L * 0.56, h * 0.7 + wag * L * 0.2); }
        ctx.closePath(); ctx.fill();
        // pectorals
        ctx.fillStyle = shade(c1[0] === '#' ? c1 : '#777777', -0.08);
        ctx.beginPath(); ctx.moveTo(L * 0.1, -h * 0.3); ctx.lineTo(-L * 0.08, -h * 1.1); ctx.lineTo(-L * 0.06, -h * 0.3); ctx.fill();
        ctx.beginPath(); ctx.moveTo(L * 0.1, h * 0.3); ctx.lineTo(-L * 0.08, h * 1.1); ctx.lineTo(-L * 0.06, h * 0.3); ctx.fill();
        // body
        ctx.fillStyle = c1;
        ctx.beginPath(); ctx.moveTo(L * 0.5, 0);
        ctx.bezierCurveTo(L * 0.42, -h * 0.75, -L * 0.1, -h * 0.7, -L * 0.42, -h * 0.12);
        ctx.lineTo(-L * 0.42, h * 0.12);
        ctx.bezierCurveTo(-L * 0.1, h * 0.7, L * 0.42, h * 0.75, L * 0.5, 0); ctx.fill();
        if (orca) { ctx.fillStyle = '#f2f2f2'; ctx.beginPath(); ctx.ellipse(L * 0.28, -h * 0.25, L * 0.07, h * 0.12, 0.3, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.ellipse(-L * 0.05, h * 0.25, L * 0.18, h * 0.12, 0, 0, TAU); ctx.fill(); }
        else { ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.beginPath(); ctx.ellipse(L * 0.05, h * 0.2, L * 0.35, h * 0.18, 0, 0, TAU); ctx.fill(); }
        // dorsal ridge line
        ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = Math.max(1, L * 0.012);
        ctx.beginPath(); ctx.moveTo(L * 0.35, 0); ctx.lineTo(-L * 0.4, 0); ctx.stroke();
        if (!whale) { ctx.fillStyle = shade(c1[0] === '#' ? c1 : '#666666', -0.15); ctx.beginPath(); ctx.moveTo(L * 0.08, -h * 0.05); ctx.lineTo(-L * 0.12, -h * 0.05); ctx.lineTo(-L * 0.08, h * 0.05); ctx.closePath(); ctx.fill(); }
        if (!whale) for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(L * (0.22 - i * 0.03), -h * 0.45); ctx.lineTo(L * (0.2 - i * 0.03), -h * 0.2); ctx.stroke(); }
        if (whale) { ctx.strokeStyle = 'rgba(0,0,0,.25)'; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(L * (0.1 + i * 0.05), -h * 0.4); ctx.lineTo(L * (0.02 + i * 0.05), -h * 0.1); ctx.stroke(); } ctx.fillStyle = '#333'; ctx.beginPath(); ctx.arc(L * 0.2, 0, L * 0.012, 0, TAU); ctx.fill(); }
        eye(ctx, L * 0.36, -h * 0.28, Math.max(1.5, L * 0.018), g.glow);
        eye(ctx, L * 0.36, h * 0.28, Math.max(1.5, L * 0.018), g.glow);
        break;
      }
      case 'eel': case 'serpent': {
        const serp = kind === 'serpent';
        const seg = 16, w = L * (serp ? 0.13 : 0.1);
        const pts = [];
        for (let i = 0; i <= seg; i++) { const u = i / seg; pts.push([L * 0.5 - u * L, Math.sin(u * 7 - t * 6) * L * 0.06 * u]); }
        ctx.strokeStyle = c1; ctx.lineWidth = w;
        ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
        ctx.strokeStyle = c2; ctx.lineWidth = w * 0.3;
        ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
        if (serp) { ctx.fillStyle = c2; for (let i = 1; i < seg; i += 2) { const [x, y] = pts[i]; ctx.beginPath(); ctx.moveTo(x - w * 0.3, y); ctx.lineTo(x, y - w * 0.95); ctx.lineTo(x + w * 0.3, y); ctx.fill(); ctx.beginPath(); ctx.moveTo(x - w * 0.3, y); ctx.lineTo(x, y + w * 0.95); ctx.lineTo(x + w * 0.3, y); ctx.fill(); } }
        ctx.fillStyle = c1; ctx.beginPath(); ctx.ellipse(L * 0.5, 0, w * (serp ? 1.1 : 0.8), w * (serp ? 0.8 : 0.6), 0, 0, TAU); ctx.fill();
        if (serp) { ctx.strokeStyle = c2; ctx.lineWidth = w * 0.2; ctx.beginPath(); ctx.moveTo(L * 0.45, -w * 0.5); ctx.lineTo(L * 0.35, -w * 1.2); ctx.moveTo(L * 0.45, w * 0.5); ctx.lineTo(L * 0.35, w * 1.2); ctx.stroke(); ctx.fillStyle = '#fff'; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(L * 0.5 + w * (0.2 + i * 0.2), -w * 0.3); ctx.lineTo(L * 0.5 + w * (0.3 + i * 0.2), 0); ctx.lineTo(L * 0.5 + w * (0.4 + i * 0.2), -w * 0.3); ctx.fill(); } }
        eye(ctx, L * 0.52, -w * 0.3, Math.max(1.5, w * 0.22), g.glow || serp);
        break;
      }
      case 'ray': {
        const flap = 1 + Math.sin(t * 4) * 0.12;
        ctx.strokeStyle = c1; ctx.lineWidth = Math.max(1, L * 0.02);
        ctx.beginPath(); ctx.moveTo(-L * 0.2, 0); ctx.lineTo(-L * 0.62, Math.sin(t * 5) * L * 0.04); ctx.stroke();
        ctx.fillStyle = c1;
        ctx.beginPath(); ctx.moveTo(L * 0.35, 0); ctx.quadraticCurveTo(L * 0.15, -L * 0.45 * flap, -L * 0.05, -L * 0.48 * flap); ctx.quadraticCurveTo(-L * 0.1, -L * 0.2, -L * 0.25, 0);
        ctx.quadraticCurveTo(-L * 0.1, L * 0.2, -L * 0.05, L * 0.48 * flap); ctx.quadraticCurveTo(L * 0.15, L * 0.45 * flap, L * 0.35, 0); ctx.fill();
        ctx.fillStyle = c2; ctx.globalAlpha = 0.5;
        for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(Math.sin(i * 5.3) * L * 0.12, Math.cos(i * 2.1) * L * 0.25, L * 0.03, 0, TAU); ctx.fill(); }
        ctx.globalAlpha = 1;
        eye(ctx, L * 0.2, -L * 0.06, Math.max(1.5, L * 0.025)); eye(ctx, L * 0.2, L * 0.06, Math.max(1.5, L * 0.025));
        break;
      }
      case 'crab': {
        const w = L * 0.5, h = L * 0.36, walk = Math.sin(t * 12);
        ctx.strokeStyle = shade2(c1); ctx.lineWidth = Math.max(1.5, L * 0.045);
        for (let s = -1; s <= 1; s += 2) for (let i = 0; i < 3; i++) {
          const bx = -w * 0.3 + i * w * 0.3, ph = walk * (i % 2 ? 1 : -1) * 0.25;
          ctx.beginPath(); ctx.moveTo(bx, s * h * 0.4); ctx.lineTo(bx - L * 0.06 + ph * L * 0.1, s * h * 0.95); ctx.lineTo(bx - L * 0.12 + ph * L * 0.1, s * h * 1.25); ctx.stroke();
        }
        // claws
        for (let s = -1; s <= 1; s += 2) {
          const pinch = 0.3 + Math.abs(Math.sin(t * 3 + s)) * 0.4;
          ctx.beginPath(); ctx.moveTo(w * 0.3, s * h * 0.35); ctx.lineTo(w * 0.62, s * h * 0.75); ctx.stroke();
          ctx.fillStyle = c2; ctx.beginPath(); ctx.ellipse(w * 0.78, s * h * 0.78, L * 0.13, L * 0.09, s * 0.4, 0, TAU); ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = Math.max(1, L * 0.02);
          ctx.beginPath(); ctx.moveTo(w * 0.85, s * h * 0.78); ctx.lineTo(w * 1.02, s * h * (0.78 - pinch * 0.4)); ctx.moveTo(w * 0.85, s * h * 0.78); ctx.lineTo(w * 1.02, s * h * (0.78 + pinch * 0.4)); ctx.stroke();
          ctx.strokeStyle = shade2(c1); ctx.lineWidth = Math.max(1.5, L * 0.045);
        }
        const grd = ctx.createRadialGradient(0, -h * 0.2, 1, 0, 0, w * 0.6); grd.addColorStop(0, c2); grd.addColorStop(1, c1);
        ctx.fillStyle = grd; ctx.beginPath(); ctx.ellipse(0, 0, w * 0.5, h * 0.55, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = Math.max(1, L * 0.015); ctx.stroke();
        ctx.fillStyle = 'rgba(0,0,0,.25)'; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(Math.cos(i * 1.3) * w * 0.25, Math.sin(i * 1.9) * h * 0.25, L * 0.02, 0, TAU); ctx.fill(); }
        eye(ctx, w * 0.45, -h * 0.18, Math.max(1.5, L * 0.035), g.glow); eye(ctx, w * 0.45, h * 0.18, Math.max(1.5, L * 0.035), g.glow);
        break;
      }
      case 'lobster': case 'shrimp': {
        const shrimp = kind === 'shrimp';
        const segs = shrimp ? 6 : 5;
        ctx.strokeStyle = c2; ctx.lineWidth = Math.max(1, L * 0.012);
        ctx.beginPath(); ctx.moveTo(L * 0.35, -L * 0.03); ctx.quadraticCurveTo(L * 0.6, -L * 0.25, L * 0.7, -L * 0.15 + Math.sin(t * 3) * L * 0.03);
        ctx.moveTo(L * 0.35, L * 0.03); ctx.quadraticCurveTo(L * 0.6, L * 0.25, L * 0.7, L * 0.15 - Math.sin(t * 3) * L * 0.03); ctx.stroke();
        ctx.fillStyle = c1;
        for (let i = segs; i >= 0; i--) {
          const x = L * 0.25 - i * L * (shrimp ? 0.11 : 0.1), y = shrimp ? Math.sin(i * 0.5) * L * 0.08 : 0;
          const r = L * (0.1 - i * 0.008);
          ctx.beginPath(); ctx.ellipse(x, y, r * 1.1, r, 0, 0, TAU); ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.stroke();
        }
        ctx.fillStyle = c2;
        const tx = L * 0.25 - (segs + 1) * L * 0.1;
        ctx.beginPath(); ctx.moveTo(tx + L * 0.05, 0); ctx.lineTo(tx - L * 0.08, -L * 0.1); ctx.lineTo(tx - L * 0.1, L * 0.1); ctx.fill();
        if (!shrimp) for (let s = -1; s <= 1; s += 2) {
          ctx.strokeStyle = c1; ctx.lineWidth = L * 0.03;
          ctx.beginPath(); ctx.moveTo(L * 0.25, s * L * 0.06); ctx.lineTo(L * 0.42, s * L * 0.2); ctx.stroke();
          ctx.fillStyle = c1; ctx.beginPath(); ctx.ellipse(L * 0.52, s * L * 0.22, L * 0.12, L * 0.06, s * 0.2, 0, TAU); ctx.fill();
        }
        eye(ctx, L * 0.33, -L * 0.04, Math.max(1.2, L * 0.022)); eye(ctx, L * 0.33, L * 0.04, Math.max(1.2, L * 0.022));
        break;
      }
      case 'squid': case 'octopus': case 'kraken': {
        const oct = kind !== 'squid', kr = kind === 'kraken';
        const arms = oct ? 8 : 10;
        ctx.strokeStyle = c1; ctx.lineCap = 'round';
        for (let i = 0; i < arms; i++) {
          const base = oct ? (i / arms) * TAU : Math.PI + (i / (arms - 1) - 0.5) * 0.9;
          const len = L * (oct ? (kr ? 0.75 : 0.5) : (i === 0 || i === arms - 1 ? 0.75 : 0.45));
          ctx.lineWidth = L * (kr ? 0.06 : 0.04);
          ctx.beginPath();
          const cx = oct ? 0 : -L * 0.15;
          ctx.moveTo(cx, 0);
          for (let k = 1; k <= 8; k++) {
            const u = k / 8, a = base + Math.sin(t * 3 + i + u * 4) * 0.5 * u;
            ctx.lineTo(cx + Math.cos(a) * len * u, Math.sin(a) * len * u);
            ctx.lineWidth = L * (kr ? 0.06 : 0.04) * (1 - u * 0.7);
          }
          ctx.stroke();
          if (kr) { ctx.fillStyle = c2; for (let k = 2; k < 8; k += 2) { const u = k / 8, a = base + Math.sin(t * 3 + i + u * 4) * 0.5 * u; ctx.beginPath(); ctx.arc(Math.cos(a) * len * u, Math.sin(a) * len * u, L * 0.012, 0, TAU); ctx.fill(); } }
        }
        const grd = ctx.createRadialGradient(L * 0.05, -L * 0.05, 1, 0, 0, L * 0.35); grd.addColorStop(0, c2); grd.addColorStop(1, c1);
        ctx.fillStyle = grd;
        if (oct) { ctx.beginPath(); ctx.ellipse(L * 0.05, 0, L * (kr ? 0.3 : 0.25), L * (kr ? 0.26 : 0.22), 0, 0, TAU); ctx.fill(); }
        else { ctx.beginPath(); ctx.moveTo(L * 0.5, 0); ctx.quadraticCurveTo(L * 0.2, -L * 0.17, -L * 0.15, -L * 0.1); ctx.lineTo(-L * 0.15, L * 0.1); ctx.quadraticCurveTo(L * 0.2, L * 0.17, L * 0.5, 0); ctx.fill(); ctx.fillStyle = c2; ctx.beginPath(); ctx.moveTo(L * 0.5, 0); ctx.lineTo(L * 0.35, -L * 0.14); ctx.lineTo(L * 0.35, L * 0.14); ctx.fill(); }
        const ex = oct ? L * 0.12 : -L * 0.08;
        eye(ctx, ex, -L * 0.09, Math.max(1.5, L * (kr ? 0.05 : 0.035)), g.glow || kr); eye(ctx, ex, L * 0.09, Math.max(1.5, L * (kr ? 0.05 : 0.035)), g.glow || kr);
        break;
      }
      case 'jelly': {
        ctx.globalAlpha = 0.85;
        ctx.strokeStyle = c2; ctx.lineWidth = Math.max(1, L * 0.02);
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * TAU;
          ctx.beginPath(); ctx.moveTo(Math.cos(a) * L * 0.2, Math.sin(a) * L * 0.2);
          for (let k = 1; k <= 6; k++) { const u = k / 6, aa = a + Math.sin(t * 3 + i + u * 5) * 0.25; ctx.lineTo(Math.cos(aa) * L * (0.2 + u * 0.4), Math.sin(aa) * L * (0.2 + u * 0.4)); }
          ctx.stroke();
        }
        const pulse = 1 + Math.sin(t * 4) * 0.08;
        const grd = ctx.createRadialGradient(0, 0, 1, 0, 0, L * 0.3 * pulse); grd.addColorStop(0, 'rgba(255,255,255,.9)'); grd.addColorStop(0.5, c1); grd.addColorStop(1, 'rgba(255,255,255,.15)');
        ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(0, 0, L * 0.3 * pulse, 0, TAU); ctx.fill();
        ctx.strokeStyle = c2; ctx.beginPath(); for (let i = 0; i < 4; i++) { ctx.moveTo(0, 0); ctx.arc(0, 0, L * 0.12, (i / 4) * TAU, (i / 4) * TAU + 0.9); } ctx.stroke();
        ctx.globalAlpha = 1;
        break;
      }
      case 'star': {
        ctx.save(); ctx.rotate(t * 0.2);
        ctx.fillStyle = c1; ctx.beginPath();
        for (let i = 0; i < 10; i++) { const r = i % 2 ? L * 0.18 : L * 0.5, a = (i / 10) * TAU - Math.PI / 2; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
        ctx.closePath(); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = Math.max(1, L * 0.02); ctx.stroke();
        ctx.fillStyle = c2; for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU - Math.PI / 2; for (let k = 1; k < 4; k++) { ctx.beginPath(); ctx.arc(Math.cos(a) * L * 0.1 * k, Math.sin(a) * L * 0.1 * k, L * 0.025, 0, TAU); ctx.fill(); } }
        ctx.restore();
        break;
      }
      case 'urchin': {
        ctx.strokeStyle = c2; ctx.lineWidth = Math.max(1, L * 0.02);
        for (let i = 0; i < 36; i++) { const a = (i / 36) * TAU + Math.sin(t * 2 + i) * 0.05; ctx.beginPath(); ctx.moveTo(Math.cos(a) * L * 0.25, Math.sin(a) * L * 0.25); ctx.lineTo(Math.cos(a) * L * 0.5, Math.sin(a) * L * 0.5); ctx.stroke(); }
        const grd = ctx.createRadialGradient(-L * 0.08, -L * 0.08, 1, 0, 0, L * 0.3); grd.addColorStop(0, c2); grd.addColorStop(1, c1);
        ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(0, 0, L * 0.3, 0, TAU); ctx.fill();
        break;
      }
      case 'walrus': case 'horror': case 'hydra': {
        if (kind === 'hydra') {
          for (let i = 0; i < 5; i++) {
            const a = (i - 2) * 0.35, sway = Math.sin(t * 2.5 + i) * 0.25;
            const hx = Math.cos(a + sway) * L * 0.55, hy = Math.sin(a + sway) * L * 0.55;
            ctx.strokeStyle = c1; ctx.lineWidth = L * 0.08;
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(hx * 0.5, hy * 0.5 + Math.sin(t * 3 + i) * L * 0.08, hx, hy); ctx.stroke();
            ctx.fillStyle = c2; ctx.beginPath(); ctx.ellipse(hx, hy, L * 0.09, L * 0.06, a + sway, 0, TAU); ctx.fill();
            eye(ctx, hx + L * 0.02, hy - L * 0.02, L * 0.018, true);
          }
        }
        const grd = ctx.createRadialGradient(0, -L * 0.1, 1, 0, 0, L * 0.45); grd.addColorStop(0, g.c2); grd.addColorStop(1, c1);
        ctx.fillStyle = grd;
        if (kind === 'horror') {
          ctx.strokeStyle = c1; ctx.lineWidth = L * 0.05;
          for (let i = 0; i < 7; i++) { const a = Math.PI + (i / 6 - 0.5) * 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(Math.cos(a) * L * 0.4, Math.sin(a) * L * 0.4 + Math.sin(t * 4 + i) * L * 0.1, Math.cos(a) * L * 0.65, Math.sin(a) * L * 0.65); ctx.stroke(); }
        }
        ctx.beginPath(); ctx.ellipse(0, 0, L * 0.42, L * 0.33, 0, 0, TAU); ctx.fill();
        if (kind === 'walrus') {
          ctx.fillStyle = shade2(c1); for (let s = -1; s <= 1; s += 2) { ctx.beginPath(); ctx.ellipse(-L * 0.05, s * L * 0.33, L * 0.14, L * 0.06, s * 0.5, 0, TAU); ctx.fill(); }
          ctx.fillStyle = '#f4efe0'; for (let s = -1; s <= 1; s += 2) { ctx.beginPath(); ctx.moveTo(L * 0.36, s * L * 0.06); ctx.lineTo(L * 0.62, s * L * 0.1); ctx.lineTo(L * 0.36, s * L * 0.12); ctx.fill(); }
          eye(ctx, L * 0.25, -L * 0.13, L * 0.03); eye(ctx, L * 0.25, L * 0.13, L * 0.03);
        } else if (kind === 'horror') {
          for (let i = 0; i < 7; i++) eye(ctx, L * (0.05 + Math.cos(i * 2.4) * 0.2), L * Math.sin(i * 2.4) * 0.2, L * (0.03 + (i % 3) * 0.012), true);
          ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(L * 0.3, 0, L * 0.08, L * 0.14, 0, 0, TAU); ctx.fill();
          ctx.fillStyle = '#fff'; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(L * 0.27, -L * 0.12 + i * L * 0.045); ctx.lineTo(L * 0.34, -L * 0.1 + i * L * 0.045); ctx.lineTo(L * 0.27, -L * 0.08 + i * L * 0.045); ctx.fill(); }
        } else { eye(ctx, L * 0.2, 0, L * 0.05, true); }
        break;
      }
      case 'treasure': {
        const n = g.name || '';
        const s = L * 0.4;
        if (/Chest/.test(n)) { ctx.fillStyle = '#7a4a1e'; ctx.fillRect(-s, -s * 0.6, s * 2, s * 1.3); ctx.fillStyle = '#e8b93a'; ctx.fillRect(-s, -s * 0.1, s * 2, s * 0.15); ctx.fillRect(-s * 0.1, -s * 0.2, s * 0.2, s * 0.35); ctx.fillStyle = '#9b6230'; ctx.beginPath(); ctx.ellipse(0, -s * 0.6, s, s * 0.35, 0, Math.PI, TAU); ctx.fill(); }
        else if (/Coin|Doubloon/.test(n)) { ctx.fillStyle = /Poseidon/.test(n) ? '#7ff0ff' : '#f2c14e'; ctx.beginPath(); ctx.arc(0, 0, s, 0, TAU); ctx.fill(); ctx.strokeStyle = '#a6781d'; ctx.lineWidth = s * 0.12; ctx.beginPath(); ctx.arc(0, 0, s * 0.72, 0, TAU); ctx.stroke(); ctx.fillStyle = '#a6781d'; ctx.font = `bold ${s}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(/Poseidon/.test(n) ? 'Ψ' : '$', 0, s * 0.05); }
        else if (/Pearl/.test(n)) { const gg = ctx.createRadialGradient(-s * 0.3, -s * 0.3, 1, 0, 0, s); gg.addColorStop(0, '#fff'); gg.addColorStop(1, /Black/.test(n) ? '#222' : '#d9d2e9'); ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(0, 0, s * 0.8, 0, TAU); ctx.fill(); }
        else if (/Boot/.test(n)) { ctx.fillStyle = '#4a3322'; ctx.fillRect(-s * 0.4, -s, s * 0.7, s * 1.4); ctx.fillRect(-s * 0.4, s * 0.2, s * 1.3, s * 0.5); }
        else if (/Can/.test(n)) { ctx.fillStyle = '#8a8f96'; ctx.fillRect(-s * 0.5, -s * 0.8, s, s * 1.6); ctx.fillStyle = '#b5452c'; ctx.fillRect(-s * 0.5, -s * 0.3, s, s * 0.6); }
        else if (/Bottle/.test(n)) { ctx.fillStyle = 'rgba(120,200,140,.8)'; ctx.fillRect(-s * 0.35, -s * 0.4, s * 0.7, s * 1.3); ctx.fillRect(-s * 0.15, -s, s * 0.3, s * 0.7); ctx.fillStyle = '#f0e6c8'; ctx.fillRect(-s * 0.2, -s * 0.2, s * 0.4, s * 0.8); }
        else if (/Anchor/.test(n)) { ctx.strokeStyle = '#6d7479'; ctx.lineWidth = s * 0.2; ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(0, s * 0.8); ctx.moveTo(-s * 0.5, -s * 0.5); ctx.lineTo(s * 0.5, -s * 0.5); ctx.moveTo(-s * 0.8, s * 0.2); ctx.quadraticCurveTo(0, s * 1.3, s * 0.8, s * 0.2); ctx.stroke(); }
        else if (/Compass/.test(n)) { ctx.fillStyle = '#c9a35a'; ctx.beginPath(); ctx.arc(0, 0, s, 0, TAU); ctx.fill(); ctx.fillStyle = '#f5f0e0'; ctx.beginPath(); ctx.arc(0, 0, s * 0.8, 0, TAU); ctx.fill(); ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.moveTo(0, -s * 0.7); ctx.lineTo(s * 0.12, 0); ctx.lineTo(-s * 0.12, 0); ctx.fill(); }
        else if (/Map/.test(n)) { ctx.fillStyle = '#e8d6a8'; ctx.fillRect(-s, -s * 0.7, s * 2, s * 1.4); ctx.strokeStyle = '#a33'; ctx.lineWidth = s * 0.08; ctx.setLineDash([s * 0.15, s * 0.1]); ctx.beginPath(); ctx.moveTo(-s * 0.7, s * 0.4); ctx.quadraticCurveTo(0, -s * 0.5, s * 0.5, s * 0.1); ctx.stroke(); ctx.setLineDash([]); ctx.font = `bold ${s * 0.5}px serif`; ctx.fillStyle = '#a33'; ctx.fillText('X', s * 0.45, s * 0.25); }
        else if (/Idol/.test(n)) { ctx.fillStyle = '#f2c14e'; ctx.beginPath(); ctx.arc(0, -s * 0.5, s * 0.4, 0, TAU); ctx.fill(); ctx.fillRect(-s * 0.45, -s * 0.2, s * 0.9, s * 1.1); ctx.fillStyle = '#a6781d'; ctx.fillRect(-s * 0.2, -s * 0.6, s * 0.12, s * 0.12); ctx.fillRect(s * 0.08, -s * 0.6, s * 0.12, s * 0.12); }
        else if (/Tooth/.test(n)) { ctx.fillStyle = '#f4efe0'; ctx.beginPath(); ctx.moveTo(-s * 0.5, -s * 0.6); ctx.quadraticCurveTo(0, -s, s * 0.5, -s * 0.6); ctx.lineTo(0, s); ctx.fill(); }
        else if (/Scale/.test(n)) { const gg = ctx.createLinearGradient(-s, -s, s, s); gg.addColorStop(0, '#7ff0ff'); gg.addColorStop(0.5, '#ff7ae0'); gg.addColorStop(1, '#7affb0'); ctx.fillStyle = gg; ctx.beginPath(); ctx.moveTo(0, -s); ctx.quadraticCurveTo(s, 0, 0, s); ctx.quadraticCurveTo(-s, 0, 0, -s); ctx.fill(); }
        else { ctx.strokeStyle = '#2f7a3a'; ctx.lineWidth = s * 0.2; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * s * 0.3, s); ctx.quadraticCurveTo(i * s * 0.3 + Math.sin(t * 2 + i) * s * 0.4, 0, i * s * 0.4, -s); ctx.stroke(); } }
        break;
      }
      default: drawBody(ctx, 'fish', L, g, t);
    }
  }
  function shade2(c) { return c[0] === '#' ? shade(c, -0.22) : c.replace(/(\d+)%\s*,\s*([\d.]+)\)$/, (m, l, a) => `${Math.max(0, +l - 18)}%,${a})`).replace(/(\d+)%\)$/, (m, l) => `${Math.max(0, +l - 18)}%)`); }

  const genesCache = new Map();
  function speciesGenes(sp) {
    let g = genesCache.get(sp.id);
    if (!g) {
      g = { c1: hsl(sp.hue, sp.sat, sp.lit), c2: hsl(sp.hue2, sp.sat, Math.min(80, sp.lit + 12)), belly: hsl(sp.hue, sp.sat - 10, Math.min(88, sp.lit + 28)), pattern: sp.pattern, body: sp.body, tail: sp.tail, fin: sp.fin, glow: sp.glow, name: sp.name };
      genesCache.set(sp.id, g);
    }
    return g;
  }

  R.drawSpecies = function (ctx, sp, x, y, size, t = 0, silhouette = false) {
    ctx.save(); ctx.translate(x, y);
    const g = speciesGenes(sp);
    if (silhouette) { ctx.filter = 'brightness(0) opacity(0.55)'; }
    else if (sp.glow) { ctx.shadowColor = g.c1; ctx.shadowBlur = size * 0.25; }
    drawBody(ctx, sp.kind, size, g, t);
    ctx.restore();
  };

  const CREATURE_GENES = {};
  R.drawCreature = function (ctx, look, x, y, a, r, color, t, flash) {
    let g = CREATURE_GENES[look + color];
    if (!g) {
      g = CREATURE_GENES[look + color] = { c1: color, c2: color[0] === '#' ? shade(color, 0.18) : color, belly: color[0] === '#' ? shade(color, 0.25) : color, pattern: look === 'fish' ? 1 : 0, body: 0.38, tail: 1, fin: 0.8, glow: look === 'angler' || look === 'horror' };
    }
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    const L = r * (look === 'crab' || look === 'urchin' || look === 'jelly' || look === 'kraken' || look === 'hydra' || look === 'walrus' || look === 'horror' || look === 'puffer' ? 2.1 : look === 'eel' || look === 'serpent' ? 3.2 : 2.5);
    drawBody(ctx, look, L, g, t);
    if (flash) { ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillRect(-L, -L, L * 2, L * 2); }
    ctx.restore();
  };

  // ---------------------------------------------------------------- boats
  const BARREL = { pistol: 0.5, smg: 0.6, shotgun: 0.7, harpoon: 0.95, rifle: 1.1, flamer: 0.6, minigun: 0.9, rocket: 0.85, railgun: 1.25 };
  R.drawBoat = function (ctx, bid, x, y, a, aim, weapon, t, opts = {}) {
    const b = D.BOAT[bid] || D.BOATS[0];
    const L = b.len, W = b.wid;
    ctx.save(); ctx.translate(x, y);
    const bob = Math.sin(t * 2 + x * 0.01) * 0.03;
    ctx.rotate(a + bob);
    if (opts.ghost) ctx.globalAlpha = 0.5;
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.ellipse(4, 6, L * 0.52, W * 0.55, 0, 0, TAU); ctx.fill();
    // hull
    const hull = () => { ctx.beginPath(); ctx.moveTo(L * 0.5, 0); ctx.quadraticCurveTo(L * 0.35, -W * 0.52, L * 0.05, -W * 0.5); ctx.lineTo(-L * 0.48, -W * 0.44); ctx.quadraticCurveTo(-L * 0.52, 0, -L * 0.48, W * 0.44); ctx.lineTo(L * 0.05, W * 0.5); ctx.quadraticCurveTo(L * 0.35, W * 0.52, L * 0.5, 0); ctx.closePath(); };
    hull(); ctx.fillStyle = shade(b.color, -0.25); ctx.fill();
    ctx.save(); ctx.scale(0.86, 0.78); hull(); ctx.fillStyle = b.id === 'dinghy' ? '#c49a6c' : shade(b.color, 0.12); ctx.fill(); ctx.restore();
    hull(); ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 1.5; ctx.stroke();
    if (b.id === 'dinghy') {
      ctx.strokeStyle = '#8a5a2b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-L * 0.05, -W * 0.38); ctx.lineTo(-L * 0.05, W * 0.38); ctx.stroke();
      const row = Math.sin(t * 5) * 0.4 * (opts.moving ? 1 : 0.1);
      ctx.strokeStyle = '#6b4520'; ctx.lineWidth = 2.5;
      for (let s = -1; s <= 1; s += 2) { ctx.beginPath(); ctx.moveTo(-L * 0.05, s * W * 0.4); ctx.lineTo(-L * 0.05 - Math.sin(row) * L * 0.3, s * W * 1.05); ctx.stroke(); }
    } else if (b.id === 'skiff') {
      ctx.fillStyle = '#5b86a8'; ctx.fillRect(-L * 0.25, -W * 0.25, L * 0.25, W * 0.5); ctx.fillStyle = '#9fd3ff'; ctx.fillRect(-L * 0.02, -W * 0.22, L * 0.04, W * 0.44);
      ctx.fillStyle = '#333'; ctx.fillRect(-L * 0.55, -W * 0.12, L * 0.08, W * 0.24);
    } else if (b.id === 'speedboat') {
      ctx.fillStyle = '#fff'; ctx.fillRect(-L * 0.35, -W * 0.08, L * 0.7, W * 0.16);
      ctx.fillStyle = 'rgba(150,220,255,.85)'; ctx.beginPath(); ctx.moveTo(L * 0.12, -W * 0.36); ctx.quadraticCurveTo(L * 0.22, 0, L * 0.12, W * 0.36); ctx.lineTo(L * 0.05, W * 0.3); ctx.quadraticCurveTo(L * 0.14, 0, L * 0.05, -W * 0.3); ctx.fill();
      ctx.fillStyle = '#222'; ctx.fillRect(-L * 0.56, -W * 0.2, L * 0.1, W * 0.18); ctx.fillRect(-L * 0.56, W * 0.02, L * 0.1, W * 0.18);
    } else if (b.id === 'trawler') {
      ctx.fillStyle = '#eee'; ctx.fillRect(-L * 0.05, -W * 0.3, L * 0.28, W * 0.6); ctx.fillStyle = '#2b4d70'; ctx.fillRect(L * 0.18, -W * 0.25, L * 0.04, W * 0.5);
      ctx.strokeStyle = '#555'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-L * 0.1, 0); ctx.lineTo(-L * 0.45, 0); ctx.stroke();
      ctx.strokeStyle = 'rgba(220,220,200,.5)'; ctx.lineWidth = 1; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(-L * 0.45, -W * 0.3 + i * W * 0.15); ctx.lineTo(-L * 0.2, -W * 0.3 + i * W * 0.15); ctx.stroke(); }
    } else if (b.id === 'gunship') {
      ctx.fillStyle = '#3d4535'; ctx.fillRect(-L * 0.3, -W * 0.32, L * 0.35, W * 0.64); ctx.fillStyle = '#222'; ctx.fillRect(-L * 0.05, -W * 0.25, L * 0.06, W * 0.5);
      ctx.fillStyle = '#6a7560'; for (let i = 0; i < 4; i++) ctx.fillRect(-L * 0.42 + i * L * 0.2, -W * 0.48, L * 0.12, W * 0.08), ctx.fillRect(-L * 0.42 + i * L * 0.2, W * 0.4, L * 0.12, W * 0.08);
    } else if (b.id === 'dreadnought') {
      ctx.fillStyle = '#1b1c22'; ctx.fillRect(-L * 0.3, -W * 0.28, L * 0.4, W * 0.56);
      ctx.fillStyle = '#444'; ctx.beginPath(); ctx.arc(-L * 0.2, 0, W * 0.14, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(-L * 0.05, 0, W * 0.12, 0, TAU); ctx.fill();
      ctx.fillStyle = '#2a0000'; ctx.fillRect(-L * 0.25, -W * 0.05, L * 0.05, W * 0.1);
      for (const tx of [L * 0.3, -L * 0.4]) { ctx.save(); ctx.translate(tx, 0); ctx.rotate(aim - a); ctx.fillStyle = '#555'; ctx.beginPath(); ctx.arc(0, 0, W * 0.16, 0, TAU); ctx.fill(); ctx.fillStyle = '#222'; ctx.fillRect(0, -3, W * 0.45, 6); ctx.restore(); }
    }
    if (opts.flash) { ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = 'rgba(255,60,60,.5)'; ctx.fillRect(-L, -W, L * 2, W * 2); ctx.globalCompositeOperation = 'source-over'; }
    // gun turret (rotates independently to aim)
    ctx.rotate(aim - a - bob);
    const bl = W * 0.35 + 22 * (BARREL[weapon] || 0.6);
    ctx.fillStyle = '#1d1f24'; ctx.fillRect(0, -3.5, bl, 7);
    if (weapon === 'minigun') { ctx.fillStyle = '#444'; for (let i = -1; i <= 1; i++) ctx.fillRect(bl * 0.3, i * 3 - 1, bl * 0.7, 2); }
    if (weapon === 'rocket') { ctx.fillStyle = '#4b5320'; ctx.fillRect(0, -6, bl, 12); }
    if (weapon === 'railgun') { ctx.fillStyle = '#6ff'; ctx.fillRect(bl * 0.3, -1, bl * 0.7, 2); }
    if (weapon === 'harpoon') { ctx.fillStyle = '#ccc'; ctx.beginPath(); ctx.moveTo(bl + 8, 0); ctx.lineTo(bl, -4); ctx.lineTo(bl, 4); ctx.fill(); }
    ctx.fillStyle = '#2d3036'; ctx.beginPath(); ctx.arc(0, 0, 7, 0, TAU); ctx.fill();
    ctx.fillStyle = opts.color || '#fff'; ctx.beginPath(); ctx.arc(0, 0, 3, 0, TAU); ctx.fill();
    ctx.restore();
  };

  // ---------------------------------------------------------------- islands
  const islandShapes = new Map();
  function islandShape(is) {
    let s = islandShapes.get(is);
    if (!s) {
      const rng = D.mulberry32(is.seed || 7);
      const n = 28, pts = [], inner = [];
      for (let i = 0; i < n; i++) { const a = (i / n) * TAU; const k = 0.9 + rng() * 0.18; pts.push([Math.cos(a) * is.r * k, Math.sin(a) * is.r * k]); inner.push([Math.cos(a) * is.r * k * (0.62 + rng() * 0.12), Math.sin(a) * is.r * k * (0.62 + rng() * 0.12)]); }
      const trees = [], rocks = [];
      const nt = Math.floor(is.r / 40);
      for (let i = 0; i < nt; i++) { const a = rng() * TAU, d = rng() * is.r * 0.55; trees.push([Math.cos(a) * d, Math.sin(a) * d, 0.7 + rng() * 0.6, rng() * TAU]); }
      for (let i = 0; i < 4; i++) { const a = rng() * TAU, d = is.r * (0.6 + rng() * 0.3); rocks.push([Math.cos(a) * d, Math.sin(a) * d, 6 + rng() * 12]); }
      s = { pts, inner, trees, rocks, biome: D.biomeAt(is.x, is.y) };
      islandShapes.set(is, s);
    }
    return s;
  }
  const poly = (ctx, pts) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); };
  const ISLAND_THEME = {
    0: ['#e8d49a', '#5fae4e', 'palm'], 1: ['#f3e3b0', '#57b85a', 'palm'], 2: ['#d6c48a', '#2f7d3f', 'pine'], 3: ['#d9c58f', '#4d9a48', 'palm'],
    4: ['#dfe9f0', '#f7fbff', 'snowpine'], 5: ['#3b2a2a', '#1e1414', 'vent'], 6: ['#2a2638', '#15121f', 'crystal'],
  };
  R.drawIsland = function (ctx, is, t) {
    const s = islandShape(is);
    const th = ISLAND_THEME[s.biome];
    ctx.save(); ctx.translate(is.x, is.y);
    ctx.fillStyle = 'rgba(160,240,230,.18)'; ctx.beginPath(); ctx.arc(0, 0, is.r * 1.28, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.35 + Math.sin(t * 2 + is.x) * 0.15) + ')'; ctx.lineWidth = 4;
    ctx.save(); ctx.scale(1.05 + Math.sin(t * 1.5) * 0.01, 1.05 + Math.sin(t * 1.5) * 0.01); poly(ctx, s.pts); ctx.stroke(); ctx.restore();
    poly(ctx, s.pts); ctx.fillStyle = th[0]; ctx.fill();
    poly(ctx, s.inner); ctx.fillStyle = th[1]; ctx.fill();
    for (const [x, y, r] of s.rocks) { ctx.fillStyle = s.biome >= 5 ? '#111' : '#7d7a74'; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
    for (const [x, y, k, rot] of s.trees) drawTree(ctx, th[2], x, y, k, rot, t);
    ctx.restore();
  };
  function drawTree(ctx, kind, x, y, k, rot, t) {
    if (kind === 'palm') {
      ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.arc(x + 6, y + 6, 16 * k, 0, TAU); ctx.fill();
      ctx.fillStyle = '#2f8a3a';
      for (let i = 0; i < 6; i++) { const a = rot + (i / 6) * TAU + Math.sin(t + x) * 0.05; ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * 11 * k, y + Math.sin(a) * 11 * k, 13 * k, 4 * k, a, 0, TAU); ctx.fill(); }
      ctx.fillStyle = '#7a5a2a'; ctx.beginPath(); ctx.arc(x, y, 3.5 * k, 0, TAU); ctx.fill();
    } else if (kind === 'pine' || kind === 'snowpine') {
      ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.arc(x + 5, y + 5, 13 * k, 0, TAU); ctx.fill();
      ctx.fillStyle = kind === 'pine' ? '#1f5a2e' : '#3b6b52'; ctx.beginPath(); ctx.arc(x, y, 13 * k, 0, TAU); ctx.fill();
      ctx.fillStyle = kind === 'pine' ? '#2d7a40' : '#f4fbff'; ctx.beginPath(); ctx.arc(x - 2, y - 2, 8 * k, 0, TAU); ctx.fill();
    } else if (kind === 'vent') {
      const g = ctx.createRadialGradient(x, y, 1, x, y, 16 * k); g.addColorStop(0, '#ffd27a'); g.addColorStop(0.4, '#ff5a1a'); g.addColorStop(1, 'rgba(80,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 16 * k * (1 + Math.sin(t * 3 + x) * 0.1), 0, TAU); ctx.fill();
    } else if (kind === 'crystal') {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.shadowColor = '#7af'; ctx.shadowBlur = 12; ctx.fillStyle = `hsla(${200 + Math.sin(t + x) * 40},90%,70%,.9)`;
      ctx.beginPath(); ctx.moveTo(0, -14 * k); ctx.lineTo(5 * k, 0); ctx.lineTo(0, 14 * k); ctx.lineTo(-5 * k, 0); ctx.fill(); ctx.restore();
    }
  }

  R.drawHarbor = function (ctx, t, night) {
    ctx.save();
    // safe zone ring
    ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.setLineDash([18, 14]); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, D.SAFE_R, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(255,215,90,.25)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, D.DOCK_R, 0, TAU); ctx.stroke();
    // docks
    for (let i = 0; i < 6; i++) {
      ctx.save(); ctx.rotate((i / 6) * TAU + 0.3);
      ctx.fillStyle = '#6b4a2b'; ctx.fillRect(230, -14, 170, 28);
      ctx.strokeStyle = '#4a321c'; ctx.lineWidth = 1.5; for (let k = 0; k < 17; k++) { ctx.beginPath(); ctx.moveTo(232 + k * 10, -14); ctx.lineTo(232 + k * 10, 14); ctx.stroke(); }
      ctx.fillStyle = '#3a2614'; for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(250 + k * 45, -16, 4, 0, TAU); ctx.arc(250 + k * 45, 16, 4, 0, TAU); ctx.fill(); }
      ctx.restore();
    }
    ctx.restore();
    R.drawIsland(ctx, { x: 0, y: 0, r: 260, seed: 42 }, t);
    // town
    const houses = [[-90, -60, '#c0392b'], [60, -110, '#2e86de'], [110, 40, '#8e44ad'], [-120, 70, '#16a085'], [-20, 120, '#d35400'], [150, -30, '#c0392b']];
    for (const [x, y, c] of houses) {
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(x - 18 + 5, y - 14 + 5, 36, 28);
      ctx.fillStyle = c; ctx.fillRect(x - 18, y - 14, 36, 28);
      ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(x - 18, y - 14, 36, 4);
      ctx.fillStyle = night ? '#ffd86b' : '#333'; ctx.fillRect(x - 4, y - 3, 8, 6);
    }
    // shop
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(-45, -25, 100, 60);
    ctx.fillStyle = '#f5e6c4'; ctx.fillRect(-50, -30, 100, 60);
    ctx.fillStyle = '#b03a2e'; for (let i = 0; i < 5; i++) ctx.fillRect(-50 + i * 20, -36, 10, 10);
    ctx.fillStyle = '#1b2a3a'; ctx.font = 'bold 18px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('SHOP', 0, 2);
    // lighthouse
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-170, -150, 20, 0, TAU); ctx.fill();
    ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.arc(-170, -150, 13, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffe680'; ctx.beginPath(); ctx.arc(-170, -150, 6, 0, TAU); ctx.fill();
  };

  // ---------------------------------------------------------------- sea decor
  R.drawDecor = function (ctx, x0, y0, x1, y1, t) {
    const S = 320;
    for (let gx = Math.floor(x0 / S); gx <= Math.floor(x1 / S); gx++) for (let gy = Math.floor(y0 / S); gy <= Math.floor(y1 / S); gy++) {
      const h = hash(gx, gy), h2 = hash(gy * 7 + 3, gx * 13 + 1);
      const cx = gx * S + h * S, cy = gy * S + h2 * S;
      const b = D.biomeAt(cx, cy);
      if (Math.hypot(cx, cy) > D.WORLD_R) continue;
      // wave glints everywhere
      ctx.strokeStyle = 'rgba(255,255,255,.09)'; ctx.lineWidth = 2;
      for (let k = 0; k < 3; k++) {
        const wx = gx * S + hash(gx + k, gy) * S, wy = gy * S + hash(gx, gy + k) * S + Math.sin(t * 0.8 + k + gx) * 8;
        ctx.beginPath(); ctx.arc(wx, wy, 14 + k * 4, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
      }
      if (b === 1 && h < 0.7) { // branching coral under the surface
        const cols = ['rgba(255,110,150,.4)', 'rgba(255,170,80,.35)', 'rgba(180,110,255,.35)'];
        ctx.lineCap = 'round';
        for (let k = 0; k < 3; k++) {
          const bx = cx + Math.sin(k * 3 + h * 9) * 50, by = cy + Math.cos(k * 5 + h * 4) * 40;
          ctx.strokeStyle = cols[(k + gx + gy) % 3]; ctx.lineWidth = 5;
          ctx.beginPath();
          for (let j = 0; j < 5; j++) {
            const a = -Math.PI / 2 + (j - 2) * 0.45 + Math.sin(t * 0.6 + j + k) * 0.05, l = 18 + hash(gx + j, gy + k) * 16;
            const mx = bx + Math.cos(a) * l, my = by + Math.sin(a) * l;
            ctx.moveTo(bx, by); ctx.lineTo(mx, my);
            ctx.moveTo(mx, my); ctx.lineTo(mx + Math.cos(a - 0.5) * l * 0.5, my + Math.sin(a - 0.5) * l * 0.5);
            ctx.moveTo(mx, my); ctx.lineTo(mx + Math.cos(a + 0.5) * l * 0.5, my + Math.sin(a + 0.5) * l * 0.5);
          }
          ctx.stroke();
        }
      } else if (b === 2) { // kelp
        ctx.strokeStyle = 'rgba(20,70,30,.45)'; ctx.lineWidth = 5;
        for (let k = 0; k < 4; k++) { const kx = cx + (k - 2) * 25; ctx.beginPath(); ctx.moveTo(kx, cy + 60); ctx.quadraticCurveTo(kx + Math.sin(t + k) * 20, cy, kx + Math.sin(t * 1.3 + k) * 12, cy - 60); ctx.stroke(); }
      } else if (b === 4 && h < 0.55) { // ice floes
        ctx.fillStyle = 'rgba(240,250,255,.85)'; ctx.strokeStyle = 'rgba(160,210,240,.9)'; ctx.lineWidth = 2;
        const fx = cx + Math.sin(t * 0.1 + h * 10) * 20, fy = cy + Math.cos(t * 0.1 + h * 10) * 20;
        ctx.beginPath(); for (let k = 0; k < 7; k++) { const a = (k / 7) * TAU, r = 20 + hash(gx + k, gy - k) * 30; ctx.lineTo(fx + Math.cos(a) * r, fy + Math.sin(a) * r); } ctx.closePath(); ctx.fill(); ctx.stroke();
      } else if (b === 5 && h < 0.6) { // vents
        const gr = ctx.createRadialGradient(cx, cy, 1, cx, cy, 60); gr.addColorStop(0, `rgba(255,120,30,${0.35 + Math.sin(t * 2 + h * 9) * 0.15})`); gr.addColorStop(1, 'rgba(255,60,0,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(cx, cy, 60, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,220,180,.35)'; for (let k = 0; k < 4; k++) { const ph = (t * 0.5 + k / 4 + h) % 1; ctx.beginPath(); ctx.arc(cx + Math.sin(k * 7) * 10, cy - ph * 50, 3 * (1 - ph) + 1, 0, TAU); ctx.fill(); }
      } else if (b === 6) { // bioluminescence
        for (let k = 0; k < 6; k++) { const a = 0.3 + 0.5 * Math.sin(t * 2 + k * 1.7 + h * 20); ctx.fillStyle = `rgba(90,255,220,${a * 0.6})`; ctx.beginPath(); ctx.arc(cx + Math.sin(k * 2.3 + h * 5) * 80, cy + Math.cos(k * 1.9) * 80, 2, 0, TAU); ctx.fill(); }
      } else if (b === 0 && h < 0.3) { // lily pads / sandbars
        ctx.fillStyle = 'rgba(230,210,150,.18)'; ctx.beginPath(); ctx.ellipse(cx, cy, 70, 30, h * 6, 0, TAU); ctx.fill();
      }
    }
  };

  // ---------------------------------------------------------------- particles & gore
  const FX = { parts: [], decals: [], gore: 2, max: 2500 };
  R.fx = FX;
  function P(o) { if (FX.parts.length < FX.max) FX.parts.push(o); }
  FX.blood = function (x, y, color, n, spread = 1) {
    if (FX.gore === 0) return FX.splash(x, y, 0.3);
    n = Math.round(n * (FX.gore === 2 ? 2.2 : 1));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = (40 + Math.random() * 260) * spread;
      P({ k: 'blood', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.3 + Math.random() * 0.5, max: 0.8, r: 1.5 + Math.random() * 3.5, c: color });
    }
    FX.pool(x, y, color, 6 + n * 1.2);
  };
  FX.pool = function (x, y, color, r) {
    if (FX.gore === 0) return;
    FX.decals.push({ x, y, r: r * 0.3, tr: r * (FX.gore === 2 ? 1.6 : 1), c: color, life: FX.gore === 2 ? 40 : 18, max: FX.gore === 2 ? 40 : 18, rot: Math.random() * TAU, sq: 0.6 + Math.random() * 0.4 });
    if (FX.decals.length > 220) FX.decals.shift();
  };
  FX.gibs = function (x, y, r, color, blood, look) {
    if (FX.gore === 0) { FX.splash(x, y, r / 25); return; }
    const n = Math.round((4 + r / 5) * (FX.gore === 2 ? 2 : 1));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = 60 + Math.random() * 380;
      const sz = 2 + Math.random() * r * 0.28;
      const bone = Math.random() < 0.18;
      P({ k: 'gib', x: x + Math.cos(a) * r * 0.3, y: y + Math.sin(a) * r * 0.3, vx: Math.cos(a) * s, vy: Math.sin(a) * s, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 18, life: 4 + Math.random() * 5, max: 9, r: sz, c: bone ? '#efe6d2' : Math.random() < 0.5 ? color : shade(blood[0] === '#' && blood.length > 4 ? blood : '#770000', 0.1), blood, shape: Math.floor(Math.random() * 3) });
    }
    if (look === 'fish' || look === 'shark' || look === 'eel' || look === 'serpent') for (let i = 0; i < 3; i++) P({ k: 'gib', x, y, vx: (Math.random() - 0.5) * 300, vy: (Math.random() - 0.5) * 300, rot: 0, vr: 6, life: 6, max: 6, r: r * 0.12, c: '#efe6d2', blood, shape: 3 });
    FX.blood(x, y, blood, 10 + r / 2, 1.4);
    FX.pool(x, y, blood, r * 2.2);
  };
  FX.splash = function (x, y, s = 1) {
    const n = Math.round(8 + 14 * s);
    for (let i = 0; i < n; i++) { const a = Math.random() * TAU, v = (40 + Math.random() * 160) * s; P({ k: 'drop', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.3 + Math.random() * 0.4, max: 0.7, r: 1.5 + Math.random() * 2.5 }); }
    P({ k: 'ring', x, y, r: 6 * s, vr: 90 * s, life: 0.8, max: 0.8 });
  };
  FX.ring = function (x, y, r, vr, life, c) { P({ k: 'ring', x, y, r, vr, life, max: life, c }); };
  FX.boom = function (x, y, r, water) {
    for (let i = 0; i < 26; i++) { const a = Math.random() * TAU, s = Math.random() * r * 3; P({ k: 'fire', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4 + Math.random() * 0.4, max: 0.8, r: 8 + Math.random() * r * 0.25 }); }
    for (let i = 0; i < 18; i++) { const a = Math.random() * TAU, s = Math.random() * r * 1.5; P({ k: 'smoke', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1.2 + Math.random() * 1.2, max: 2.4, r: 12 + Math.random() * r * 0.3 }); }
    for (let i = 0; i < 16; i++) { const a = Math.random() * TAU, s = 200 + Math.random() * 500; P({ k: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.3 + Math.random() * 0.3, max: 0.6 }); }
    FX.ring(x, y, r * 0.3, r * 3, 0.6, 'rgba(255,255,255,');
    if (water) FX.splash(x, y, r / 40);
    P({ k: 'flash', x, y, r: r * 1.6, life: 0.12, max: 0.12 });
  };
  FX.muzzle = function (x, y, a, w) {
    if (w === 'flamer') return;
    P({ k: 'muzzle', x, y, a, life: 0.06, max: 0.06, r: w === 'shotgun' || w === 'rocket' || w === 'railgun' ? 22 : 12 });
    if (w !== 'rocket' && w !== 'railgun' && w !== 'harpoon') { const pa = a + Math.PI / 2 + (Math.random() - 0.5) * 0.6; P({ k: 'shell', x, y, vx: Math.cos(pa) * 120, vy: Math.sin(pa) * 120, rot: 0, vr: 20, life: 0.6, max: 0.6, c: w === 'shotgun' ? '#c0392b' : '#d4a93a' }); }
    P({ k: 'smoke', x, y, vx: Math.cos(a) * 40, vy: Math.sin(a) * 40, life: 0.5, max: 0.5, r: 5 });
  };
  FX.wake = function (x, y, a, speed, w) {
    if (Math.random() > Math.min(1, speed / 120)) return;
    const side = Math.random() < 0.5 ? -1 : 1;
    P({ k: 'foam', x: x + Math.cos(a + Math.PI / 2) * w * 0.4 * side, y: y + Math.sin(a + Math.PI / 2) * w * 0.4 * side, vx: Math.cos(a + side * 2.2) * 30, vy: Math.sin(a + side * 2.2) * 30, life: 1.4, max: 1.4, r: 2 + Math.random() * 3 });
  };
  FX.text = function (x, y, text, color, big) { P({ k: 'text', x, y, vy: -40, vx: 0, life: 1.4, max: 1.4, text, c: color || '#fff', big }); };
  FX.zap = function (x1, y1, x2, y2, big) { P({ k: 'zap', x: x1, y: y1, x2, y2, life: big ? 0.3 : 0.18, max: big ? 0.3 : 0.18, big }); };
  FX.debris = function (x, y, color) {
    for (let i = 0; i < 26; i++) { const a = Math.random() * TAU, s = 40 + Math.random() * 250; P({ k: 'gib', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 10, life: 6 + Math.random() * 4, max: 10, r: 4 + Math.random() * 7, c: Math.random() < 0.5 ? color : '#6b4a2b', blood: null, shape: 2 }); }
    FX.boom(x, y, 60, true);
  };
  FX.bubbles = function (x, y, n) { for (let i = 0; i < n; i++) P({ k: 'bubble', x: x + (Math.random() - 0.5) * 30, y: y + (Math.random() - 0.5) * 30, vx: 0, vy: 0, life: 0.5 + Math.random(), max: 1.5, r: 1 + Math.random() * 3 }); };

  FX.update = function (dt) {
    const out = [];
    for (const p of FX.parts) {
      p.life -= dt;
      if (p.life <= 0) {
        if (p.k === 'blood' && Math.random() < 0.25) FX.pool(p.x, p.y, p.c, 3 + p.r * 1.5);
        continue;
      }
      if (p.vx !== undefined) {
        const drag = p.k === 'gib' ? 2.4 : p.k === 'smoke' ? 1.5 : p.k === 'blood' ? 5 : p.k === 'text' ? 0 : 3;
        p.vx *= Math.exp(-drag * dt); p.vy *= Math.exp(-drag * dt);
        p.x += p.vx * dt; p.y += p.vy * dt;
      }
      if (p.vr) p.rot += p.vr * dt, p.vr *= Math.exp(-1.5 * dt);
      if (p.k === 'ring') p.r += p.vr * dt;
      if (p.k === 'gib' && p.blood && FX.gore > 0 && Math.random() < dt * 3) FX.pool(p.x, p.y, p.blood, 2 + p.r * 0.6);
      out.push(p);
    }
    FX.parts = out;
    for (const d of FX.decals) { d.life -= dt; d.r += (d.tr - d.r) * Math.min(1, dt * 2); }
    FX.decals = FX.decals.filter((d) => d.life > 0);
  };

  FX.drawUnder = function (ctx) {
    for (const d of FX.decals) {
      const a = Math.min(1, d.life / d.max * 1.5) * 0.55;
      ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.rot); ctx.scale(1, d.sq);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, d.r);
      g.addColorStop(0, hexA(d.c, a)); g.addColorStop(0.7, hexA(d.c, a * 0.6)); g.addColorStop(1, hexA(d.c, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, d.r, 0, TAU); ctx.fill();
      ctx.restore();
    }
    for (const p of FX.parts) {
      const f = p.life / p.max;
      if (p.k === 'foam') { ctx.fillStyle = `rgba(255,255,255,${f * 0.6})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (2 - f), 0, TAU); ctx.fill(); }
      else if (p.k === 'ring') { ctx.strokeStyle = (p.c || 'rgba(255,255,255,') + f * 0.7 + ')'; ctx.lineWidth = 2 + f * 3; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.stroke(); }
      else if (p.k === 'gib') {
        const sink = Math.min(1, p.life / 2.5);
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.globalAlpha = sink;
        ctx.fillStyle = p.c;
        if (p.shape === 0) { ctx.beginPath(); ctx.moveTo(-p.r, -p.r * 0.5); ctx.lineTo(p.r, -p.r * 0.7); ctx.lineTo(p.r * 0.6, p.r * 0.8); ctx.lineTo(-p.r * 0.8, p.r * 0.5); ctx.fill(); }
        else if (p.shape === 1) { ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * 0.6, 0, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(120,0,0,.6)'; ctx.beginPath(); ctx.arc(p.r * 0.2, 0, p.r * 0.35, 0, TAU); ctx.fill(); }
        else if (p.shape === 2) { ctx.fillRect(-p.r, -p.r * 0.35, p.r * 2, p.r * 0.7); }
        else { ctx.strokeStyle = p.c; ctx.lineWidth = Math.max(1.5, p.r * 0.25); ctx.beginPath(); ctx.moveTo(-p.r * 2, 0); ctx.lineTo(p.r * 2, 0); for (let k = -3; k <= 3; k++) { ctx.moveTo(k * p.r * 0.5, 0); ctx.lineTo(k * p.r * 0.5, -p.r * 0.8); ctx.moveTo(k * p.r * 0.5, 0); ctx.lineTo(k * p.r * 0.5, p.r * 0.8); } ctx.stroke(); }
        ctx.restore();
      } else if (p.k === 'bubble') { ctx.strokeStyle = `rgba(220,245,255,${f})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.stroke(); }
    }
  };

  FX.drawOver = function (ctx) {
    for (const p of FX.parts) {
      const f = p.life / p.max;
      switch (p.k) {
        case 'blood': ctx.fillStyle = p.c; ctx.globalAlpha = Math.min(1, f * 2); ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; break;
        case 'drop': ctx.fillStyle = `rgba(230,250,255,${f})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill(); break;
        case 'fire': { const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r); g.addColorStop(0, `rgba(255,240,180,${f})`); g.addColorStop(0.4, `rgba(255,140,30,${f * 0.8})`); g.addColorStop(1, 'rgba(200,30,0,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill(); break; }
        case 'smoke': ctx.fillStyle = `rgba(60,60,60,${f * 0.35})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (2 - f), 0, TAU); ctx.fill(); break;
        case 'spark': ctx.strokeStyle = `rgba(255,220,120,${f})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); ctx.stroke(); break;
        case 'flash': ctx.fillStyle = `rgba(255,250,220,${f * 0.8})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill(); break;
        case 'muzzle': { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = `rgba(255,230,120,${f / p.max})`; ctx.beginPath(); ctx.moveTo(0, -p.r * 0.35); ctx.lineTo(p.r * 1.4, 0); ctx.lineTo(0, p.r * 0.35); ctx.fill(); ctx.restore(); break; }
        case 'shell': ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.c; ctx.fillRect(-3, -1.2, 6, 2.4); ctx.restore(); break;
        case 'zap': {
          ctx.strokeStyle = `rgba(180,240,255,${f / p.max})`; ctx.lineWidth = p.big ? 4 : 2; ctx.shadowColor = '#8ef'; ctx.shadowBlur = 12;
          ctx.beginPath(); ctx.moveTo(p.x, p.y);
          for (let k = 1; k < 8; k++) { const u = k / 8; ctx.lineTo(p.x + (p.x2 - p.x) * u + (Math.random() - 0.5) * 30, p.y + (p.y2 - p.y) * u + (Math.random() - 0.5) * 30); }
          ctx.lineTo(p.x2, p.y2); ctx.stroke(); ctx.shadowBlur = 0; break;
        }
        case 'text': ctx.font = `900 ${p.big ? 22 : 15}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = `rgba(0,0,0,${f})`; ctx.strokeText(p.text, p.x, p.y); ctx.fillStyle = p.c; ctx.globalAlpha = Math.min(1, f * 2); ctx.fillText(p.text, p.x, p.y); ctx.globalAlpha = 1; break;
      }
    }
  };
  const hexCache = {};
  function hexA(c, a) {
    let rgb = hexCache[c];
    if (!rgb) {
      let h = c.replace('#', '');
      if (h.length === 3) h = h.split('').map((x) => x + x).join('');
      const n = parseInt(h, 16) || 0;
      rgb = hexCache[c] = `${n >> 16},${(n >> 8) & 255},${n & 255}`;
    }
    return `rgba(${rgb},${a})`;
  }

  root.SeaRender = R;
})(typeof self !== 'undefined' ? self : this);
