// Knowledge Graph: pages, entities, topics, notes (and optionally sites) on a DPR-aware canvas.
// Pan by dragging the background, wheel/pinch to zoom around the cursor, drag nodes to pin them
// (positions persist in kv 'graph-layout'), click for the inspector. The render loop only runs
// while the layout is moving or the user is interacting. Whole-graph layout runs tick in a worker
// (see Layout below); new nodes joining a laid-out graph are settled locally without a reheat.
import { buildGraph, ForceSimulation, plainExcerpt, alphaDecayFor, LINK_TYPES, SIM_WORKER } from '../../lib/graph.js'
import { download, timeAgo } from '../../lib/text.js'

const TYPE = {
  page: { label: 'Pages', one: 'Page', color: '#22D3EE', rgb: '34,211,238', base: 7 },
  entity: { label: 'Entities', one: 'Entity', color: '#A78BFA', rgb: '167,139,250', base: 5.2 },
  topic: { label: 'Topics', one: 'Topic', color: '#A3E635', rgb: '163,230,53', base: 6.6 },
  note: { label: 'Notes', one: 'Note', color: '#FBBF24', rgb: '251,191,36', base: 7.2 },
  site: { label: 'Sites', one: 'Site', color: '#F472B6', rgb: '244,114,182', base: 6.4 },
}
const ORDER = ['page', 'entity', 'topic', 'note', 'site']
const DEFAULT_TYPES = ['page', 'entity', 'topic', 'note']
const LINKS = {
  mentions: { stroke: 'rgba(167,139,250,.22)' },
  about: { stroke: 'rgba(163,230,53,.2)' },
  cites: { stroke: 'rgba(251,191,36,.34)' },
  wiki: { stroke: 'rgba(251,191,36,.55)' },
  related: { stroke: 'rgba(34,211,238,.34)', dash: [5, 5] },
  tagged: { stroke: 'rgba(163,230,53,.24)', dash: [2, 4] },
  site: { stroke: 'rgba(244,114,182,.2)' },
}
const LINK_WORD = { mentions: 'mentions', about: 'is about', cites: 'cites', wiki: 'links to', related: 'shares entities with', tagged: 'is tagged', site: 'is on' }
const K_MIN = 0.05
const K_MAX = 6
const LAYOUT_KEY = 'graph-layout'
const FONT = '"Inter MM", Inter, ui-sans-serif, system-ui, sans-serif'
const LABEL_FONT = `600 11.5px ${FONT}`
const LABEL_FONT_BOLD = `700 12.5px ${FONT}`
const SMALL_GRAPH = 250 // up to this many visible nodes, new nodes reheat the whole (cheap) layout
const RELAX_MAX = 150 // more new nodes than this (or than 30% of the graph) re-run the whole layout instead
const MAIN_TICK_MS = 8 // per-frame ticking budget when the layout has to run on the main thread
const DRAFT_NODES = 1500 // bigger graphs paint a cheap draft (no glows, emphasized labels only) while the layout moves
const FRAME_MS = 1000 / 60
const isWeb = u => /^https?:\/\//i.test(u || '')

const ICON = {
  search: '<svg class="mm-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  fit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  relayout: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.9-4M4 4v4h4M4 13a8 8 0 0 0 14.9 4M20 20v-4h-4"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  minus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>',
  download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  open: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  locate: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>',
  note: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h12l4 4v12H4zM8 10h8M8 14h8M8 18h5"/></svg>',
  graph: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="7" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M8.2 7.2l7.6-.2M7.2 8.2l3.8 7.6M16.9 9.2l-3.6 6.8"/></svg>',
}

/** Static SVG glyph for a node type (legend, chips, inspector). */
function glyph(type, size = 12) {
  const c = TYPE[type].color
  const s = size, h = s / 2
  const shape = {
    page: `<circle cx="${h}" cy="${h}" r="${h - 1}" fill="${c}"/>`,
    entity: `<circle cx="${h}" cy="${h}" r="${h - 2}" fill="#0B0C10" stroke="${c}" stroke-width="2.2"/>`,
    topic: `<path d="M${h} 0.8L${s - 0.8} ${h}L${h} ${s - 0.8}L0.8 ${h}Z" fill="${c}"/>`,
    note: `<rect x="1.2" y="1.2" width="${s - 2.4}" height="${s - 2.4}" rx="2.6" fill="${c}"/>`,
    site: `<path d="${hexPath(h, h, h - 0.8)}" fill="${c}"/>`,
  }[type]
  return `<svg class="gv-glyph" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" aria-hidden="true" style="filter:drop-shadow(0 0 4px ${c})">${shape}</svg>`
}
function hexPath(x, y, r) {
  let d = ''
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 6 + i * Math.PI / 3
    d += `${i ? 'L' : 'M'}${(x + r * Math.cos(a)).toFixed(2)} ${(y + r * Math.sin(a)).toFixed(2)}`
  }
  return `${d}Z`
}

const STYLES = `
.gv{display:flex;flex-direction:column;gap:12px;height:calc(100vh - 66px);min-height:560px}
.gv .view-head{margin-bottom:0;align-items:flex-end;flex-wrap:nowrap}
.gv .view-head>div:first-child{min-width:0}
.gv-sub{margin:5px 0 0}
.gv-exports{display:flex;align-items:center;gap:6px;flex:none}
.gv-exports .lbl{font:600 11px/1 var(--mm-font);letter-spacing:.07em;text-transform:uppercase;color:var(--mm-muted);margin-right:2px}
.gv-tb{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px 14px;padding:10px 12px}
.gv-tb-l,.gv-tb-r{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.gv-search{position:relative;width:230px}
.gv-search .mm-icon{position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--mm-muted);pointer-events:none}
.gv-search input{padding-left:33px;height:34px}
.gv-found{font-size:12px;color:var(--mm-muted);min-width:64px}
.gv-found.none{color:var(--mm-red)}
.gv-type{gap:7px;padding:6px 10px 6px 8px}
.gv-type .n{color:var(--mm-muted);font-weight:600;font-variant-numeric:tabular-nums}
.gv-type[aria-pressed="true"]{color:var(--mm-heading);background:color-mix(in srgb,var(--c) 14%,transparent);border-color:color-mix(in srgb,var(--c) 70%,transparent);box-shadow:0 0 14px color-mix(in srgb,var(--c) 22%,transparent)}
.gv-type[aria-pressed="true"] .n{color:var(--mm-fg-2)}
.gv-type[aria-pressed="false"] .gv-glyph{opacity:.45;filter:none!important}
.gv-glyph{flex:none;display:block}
.gv-min{display:flex;align-items:center;gap:8px;font:600 12px/1 var(--mm-font);color:var(--mm-fg-2);white-space:nowrap}
.gv-min input{width:110px}
.gv-min output{font:600 12px/1 var(--mm-mono);color:var(--mm-heading);min-width:26px}
.gv-tb .mm-switch{font-size:12.5px;font-weight:600;color:var(--mm-fg-2)}
.gv-sep{width:1px;height:22px;background:var(--mm-border-strong)}
.gv-stage{position:relative;flex:1;min-height:420px;overflow:hidden;border-radius:var(--mm-radius);border:1px solid var(--mm-border);
  background:radial-gradient(900px 520px at 30% 20%,rgba(34,211,238,.06),transparent 60%),radial-gradient(700px 500px at 85% 90%,rgba(167,139,250,.07),transparent 60%),#090A0E;
  background-image:radial-gradient(rgba(255,255,255,.055) 1px,transparent 1.2px),radial-gradient(900px 520px at 30% 20%,rgba(34,211,238,.06),transparent 60%),radial-gradient(700px 500px at 85% 90%,rgba(167,139,250,.07),transparent 60%);
  background-size:28px 28px,auto,auto;user-select:none;-webkit-user-select:none}
.gv-canvas{position:absolute;inset:0;display:block;touch-action:none;cursor:grab;outline:none}
.gv-canvas.drag{cursor:grabbing}.gv-canvas.over{cursor:pointer}
.gv-stage:has(.gv-canvas:focus-visible){box-shadow:0 0 0 2px var(--mm-accent)}
.gv-ov{position:absolute;z-index:2;pointer-events:none}
.gv-ov>*{pointer-events:auto}
.gv-counts{top:12px;left:12px;font:600 12px/1 var(--mm-font);color:var(--mm-fg-2);padding:8px 10px;border-radius:10px;background:rgba(11,12,16,.62);border:1px solid var(--mm-border);backdrop-filter:var(--mm-blur);pointer-events:none}
.gv-counts b{color:var(--mm-heading);font-variant-numeric:tabular-nums}
.gv-legend{left:12px;bottom:12px;display:flex;flex-direction:column;gap:7px;padding:10px 12px;border-radius:12px;background:rgba(11,12,16,.66);border:1px solid var(--mm-border);backdrop-filter:var(--mm-blur);font-size:11.5px;color:var(--mm-fg-2);pointer-events:none}
.gv-legend .row{display:flex;flex-wrap:wrap;gap:6px 12px}
.gv-legend span{display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
.gv-legend i{display:inline-block;width:18px;height:0;border-top:2px solid var(--c)}
.gv-legend i.dash{border-top-style:dashed}
.gv-legend .hint{color:var(--mm-muted);font-size:11px}
.gv-zoom{right:12px;bottom:12px;display:flex;flex-direction:column;gap:4px;transition:right .2s var(--mm-ease)}
.gv-zoom .mm-btn{background:rgba(11,12,16,.7);backdrop-filter:var(--mm-blur)}
.gv-stage.insp .gv-zoom{right:352px}
.gv-tip{position:absolute;z-index:3;pointer-events:none;max-width:280px;padding:8px 10px;border-radius:10px;background:var(--mm-glass-strong);border:1px solid var(--mm-border-strong);backdrop-filter:var(--mm-blur);box-shadow:var(--mm-shadow);font-size:12px;line-height:1.35;color:var(--mm-fg-2);transform:translate(14px,14px)}
.gv-tip b{display:block;color:var(--mm-heading);font-size:13px;margin-bottom:3px;overflow-wrap:anywhere}
.gv-tip .t{display:flex;align-items:center;gap:6px}
.gv-insp{position:absolute;z-index:4;top:12px;right:12px;bottom:12px;width:328px;display:flex;flex-direction:column;overflow:hidden;
  background:rgba(16,18,26,.84);border:1px solid var(--mm-border-strong);border-radius:var(--mm-radius);backdrop-filter:var(--mm-blur);-webkit-backdrop-filter:var(--mm-blur);box-shadow:var(--mm-shadow);animation:gv-in .18s var(--mm-ease)}
@keyframes gv-in{from{opacity:0;transform:translateX(10px)}}
.gv-insp:focus{outline:none}
.gv-insp-h{display:flex;align-items:center;gap:8px;padding:12px 12px 0 16px}
.gv-insp-h .k{display:inline-flex;align-items:center;gap:7px;font:700 10.5px/1 var(--mm-font);letter-spacing:.08em;text-transform:uppercase;color:var(--c)}
.gv-insp-h .sp{flex:1}
.gv-insp-b{padding:10px 16px 16px;overflow:auto;display:flex;flex-direction:column;gap:14px}
.gv-insp h2{font-size:16.5px;line-height:1.3;overflow-wrap:anywhere}
.gv-insp .meta{font-size:12.5px;color:var(--mm-muted);display:flex;flex-wrap:wrap;gap:4px 10px}
.gv-insp .summary{font-size:13px;color:var(--mm-fg-2);line-height:1.55;margin:0}
.gv-insp .acts{display:flex;flex-wrap:wrap;gap:8px}
.gv-sec h3{font:700 10.5px/1 var(--mm-font);letter-spacing:.08em;text-transform:uppercase;color:var(--mm-muted);margin:0 0 8px;display:flex;justify-content:space-between}
.gv-chips{display:flex;flex-wrap:wrap;gap:6px}
.gv-chips .mm-chip{padding:5px 9px;font-size:11.5px;max-width:100%}
.gv-chips .mm-chip span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gv-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px}
.gv-item{display:flex;align-items:center;gap:6px}
.gv-item>button.go{flex:1;min-width:0;display:flex;align-items:center;gap:9px;text-align:left;padding:7px 8px;border-radius:9px;border:0;background:none;color:var(--mm-fg);cursor:pointer;font:inherit}
.gv-item>button.go:hover{background:rgba(255,255,255,.06)}
.gv-item .tx{min-width:0;display:flex;flex-direction:column;gap:1px}
.gv-item .tx b{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gv-item .tx small{font-size:11.5px;color:var(--mm-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gv-item .ext{flex:none;width:14px;height:14px;color:var(--mm-muted);fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.gv-av{width:26px;height:26px;flex:none;border-radius:8px;display:grid;place-items:center;font:700 12px/1 var(--mm-font);color:hsl(var(--h) 85% 76%);background:hsl(var(--h) 70% 55% / .14);border:1px solid hsl(var(--h) 70% 60% / .3)}
.gv-tags{display:flex;flex-wrap:wrap;gap:5px}
.gv-empty-stage{position:absolute;inset:0;display:grid;place-items:center;z-index:2;pointer-events:none}
.gv-empty-stage .mm-card{pointer-events:auto;text-align:center;max-width:360px}
.gv-empty{flex:1;display:grid;place-items:center}
.gv-empty .mm-card{max-width:620px;padding:34px 34px 30px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:12px}
.gv-empty .art{width:70px;height:70px;border-radius:20px;display:grid;place-items:center;color:var(--mm-accent);background:color-mix(in srgb,var(--mm-accent) 10%,transparent);border:1px solid color-mix(in srgb,var(--mm-accent) 30%,transparent);box-shadow:0 0 34px color-mix(in srgb,var(--mm-accent) 20%,transparent)}
.gv-empty .art svg{width:34px;height:34px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.gv-empty h2{font-size:19px}
.gv-empty p{margin:0;color:var(--mm-fg-2);max-width:500px}
.gv-steps{list-style:none;margin:8px 0 4px;padding:0;display:grid;grid-template-columns:repeat(3,1fr);gap:10px;text-align:left;width:100%}
.gv-steps li{padding:12px;border-radius:12px;background:rgba(255,255,255,.03);border:1px solid var(--mm-border);font-size:12.5px;color:var(--mm-fg-2);display:flex;flex-direction:column;gap:6px}
.gv-steps li b{display:flex;align-items:center;gap:7px;color:var(--mm-heading);font-size:13px}
.gv-skel{flex:1;border-radius:var(--mm-radius)}
.gv-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@media (max-width:980px){.gv-search{width:180px}}
@media (max-width:760px){.gv{height:auto}.gv-stage{min-height:520px}.gv-insp{left:12px;width:auto;top:auto;max-height:62%}.gv-stage.insp .gv-zoom{right:12px}.gv-steps{grid-template-columns:1fr}}
@media (prefers-reduced-motion:reduce){.gv-insp{animation:none}.gv-zoom{transition:none}}
`

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue
    if (k === 'text') e.textContent = v
    else if (k === 'html') e.innerHTML = v // static icon markup only
    else if (k === 'class') e.className = v
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v)
    else e.setAttribute(k, v === true ? '' : v)
  }
  for (const c of children.flat()) if (c != null && c !== false) e.append(c)
  return e
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const hueOf = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 360 }
const truncate = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const today = () => new Date().toISOString().slice(0, 10)
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)')
const reducedMotion = () => REDUCED.matches

/** Mermaid-safe label: quotes and syntax characters become Mermaid entity codes. */
export function mermaidLabel(s) {
  const map = { '"': '#quot;', '#': '#35;', '<': '#lt;', '>': '#gt;', '&': '#amp;', ';': '#59;', '|': '#124;', '`': '#96;', '\\': '#92;', '[': '#91;', ']': '#93;', '{': '#123;', '}': '#125;' }
  return String(s).replace(/[\r\n\t]+/g, ' ').replace(/["#<>&;|`\\[\]{}]/g, c => map[c]).trim() || ' '
}

// Glow sprites (one radial gradient per type), drawn scaled: far cheaper than shadowBlur per node.
const sprites = {}
function sprite(type) {
  if (sprites[type]) return sprites[type]
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  const rgb = TYPE[type].rgb
  grad.addColorStop(0, `rgba(${rgb},.55)`)
  grad.addColorStop(0.35, `rgba(${rgb},.22)`)
  grad.addColorStop(1, `rgba(${rgb},0)`)
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  return (sprites[type] = c)
}

function shapePath(g, type, x, y, r) {
  g.beginPath()
  if (type === 'topic') {
    const d = r * 1.22
    g.moveTo(x, y - d); g.lineTo(x + d, y); g.lineTo(x, y + d); g.lineTo(x - d, y); g.closePath()
  } else if (type === 'note') {
    const s = r * 0.92, rr = r * 0.38
    g.roundRect(x - s, y - s, s * 2, s * 2, rr)
  } else if (type === 'site') {
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + i * Math.PI / 3
      const px = x + r * 1.08 * Math.cos(a), py = y + r * 1.08 * Math.sin(a)
      if (i) g.lineTo(px, py); else g.moveTo(px, py)
    }
    g.closePath()
  } else g.arc(x, y, r, 0, Math.PI * 2)
}

function svgShape(type, x, y, r, cls) {
  const f = n => n.toFixed(1)
  if (type === 'topic') { const d = r * 1.22; return `<path class="${cls}" d="M${f(x)} ${f(y - d)}L${f(x + d)} ${f(y)}L${f(x)} ${f(y + d)}L${f(x - d)} ${f(y)}Z"/>` }
  if (type === 'note') { const s = r * 0.92; return `<rect class="${cls}" x="${f(x - s)}" y="${f(y - s)}" width="${f(s * 2)}" height="${f(s * 2)}" rx="${f(r * 0.38)}"/>` }
  if (type === 'site') return `<path class="${cls}" d="${hexPath(x, y, r * 1.08)}"/>`
  return `<circle class="${cls}" cx="${f(x)}" cy="${f(y)}" r="${f(r)}"/>`
}

const measureCtx = document.createElement('canvas').getContext('2d')
const widthCache = new Map()
function textWidth(text, font) {
  const key = `${font}\u0000${text}`
  let w = widthCache.get(key)
  if (w === undefined) {
    measureCtx.font = font
    w = measureCtx.measureText(text).width
    if (widthCache.size > 5000) widthCache.clear()
    widthCache.set(key, w)
  }
  return w
}

/**
 * Drives the force layout for the view.
 *  • Whole-graph runs (first layout, re-layout, filter changes, dragging) tick in a worker (lib/graph.js loaded
 *    as a module worker) that streams positions back, so even a layout of thousands of nodes leaves the hub, and
 *    the side panel that shares its renderer's main thread, responsive. Without a worker they tick here, a few
 *    milliseconds per frame.
 *  • `relax(movers)` settles a few new nodes synchronously against the fixed rest of the layout.
 *  • The main thread owns pinned positions: the worker's copy only follows them.
 * Changes made in one task (new graph, reheat) reach the worker together on the next frame (`flush`).
 */
class Layout {
  constructor(onUpdate, animate) {
    this.sim = new ForceSimulation([], [])
    this.onUpdate = onUpdate // schedules a frame
    this.animate = animate // () => boolean: false under prefers-reduced-motion
    this.nodes = []
    this.gen = 0 // bumped by every setGraph; worker messages for an older graph are ignored
    this.sentGen = -1
    this.seq = 0 // bumped by every command that changes whether the worker runs; `done` must echo the latest
    this.running = false // a worker run is in progress (or about to start on the next flush)
    this.reheatTo = 0
    this.msg = null // newest positions from the worker, applied on the next frame
    this.lastMsgAt = 0
    this.useWorker = typeof Worker === 'function' // false once a worker failed: everything then ticks here
    this.worker = null // created on the first run (a restored layout never needs one)
  }

  get hot() { return this.useWorker ? this.running : this.sim.hot }
  get alpha() { return this.sim.alpha }
  set alpha(v) { this.sim.alpha = v }
  get onMainThread() { return !this.useWorker }

  ensureWorker() {
    if (this.worker || !this.useWorker) return !!this.worker
    try {
      this.worker = new Worker(new URL('../../lib/graph.js', import.meta.url), { type: 'module', name: SIM_WORKER })
      this.worker.onmessage = e => this.receive(e.data)
      this.worker.onerror = e => { e.preventDefault?.(); this.fallBack() }
      this.worker.onmessageerror = () => this.fallBack()
    } catch {
      this.worker = null
      this.useWorker = false
    }
    return !!this.worker
  }

  setGraph(nodes, links) {
    this.sim.opts.alphaDecay = alphaDecayFor(nodes.length, this.sim.opts.alphaMin)
    this.sim.setGraph(nodes, links) // gives new nodes a spot next to a placed neighbour
    this.nodes = nodes
    this.gen++
    this.msg = null
    if (!nodes.length) this.stop() // everything filtered out: nothing to lay out
    else if (this.running) this.onUpdate() // the run in progress continues on the new graph (next flush)
  }

  /** Keep the layout moving at a temperature of at least `alpha`. */
  start(alpha = 0) {
    this.sim.reheat(alpha)
    if (this.useWorker && this.nodes.length && this.sim.hot && this.ensureWorker()) {
      this.reheatTo = Math.max(this.reheatTo, alpha)
      this.running = true
    }
    this.onUpdate()
  }

  /** While a node is dragged the layout stays warm (alphaTarget > 0); 0 lets it cool down again. */
  target(v) {
    this.sim.alphaTarget = v
    if (this.worker && this.running && this.sentGen === this.gen) {
      this.seq++
      this.post({ type: 'target', gen: this.gen, seq: this.seq, value: v })
    }
  }

  stop() {
    this.sim.stop()
    this.msg = null
    this.reheatTo = 0
    if (this.worker && this.sentGen !== -1) {
      this.seq++
      this.post({ type: 'stop', seq: this.seq })
    }
    this.sentGen = -1 // the worker's copy is stale from now on: the next run sends the whole graph again
    this.running = false
  }

  /** Mirror a pin, a pinned node's move or an unpin into a running worker. */
  pin(n) {
    if (!this.worker || !this.running || this.sentGen !== this.gen || this.nodes[n._i] !== n) return
    this.post({ type: 'pin', gen: this.gen, i: n._i, fx: n.fx ?? null, fy: n.fy ?? null })
  }

  setAspect(a) {
    this.sim.opts.aspect = a
    if (this.worker && this.running && this.sentGen === this.gen) this.post({ type: 'opts', opts: { aspect: a } })
  }

  relax(movers, opts) { return this.sim.relax(movers, opts) }

  /** Bring positions up to date for this frame (worker: apply its newest message; main: tick). True if anything moved. */
  advance() {
    if (!this.useWorker) {
      if (!this.sim.hot) return false
      const animate = this.animate()
      const total = Math.log(this.sim.opts.alphaMin) / Math.log(1 - this.sim.opts.alphaDecay)
      const pace = animate ? Math.max(1, Math.ceil(total / 75)) : Infinity
      const budget = animate ? MAIN_TICK_MS : 14
      const t0 = performance.now()
      let n = 0
      do { this.sim.tick(); n++ } while (this.sim.hot && n < pace && performance.now() - t0 < budget)
      return true
    }
    this.flush()
    const m = this.msg
    if (!m) {
      // A worker that stopped answering mid-run (it never should) must not leave the graph "hot" forever.
      if (this.running && performance.now() - this.lastMsgAt > 5000) this.fallBack()
      return false
    }
    this.msg = null
    const p = m.pos
    const nodes = this.nodes
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i]
      if (n.fx == null) n.x = p[2 * i]
      if (n.fy == null) n.y = p[2 * i + 1]
    }
    this.sim.alpha = m.alpha
    if (m.done && m.seq === this.seq) {
      this.running = false
      this.sentGen = -1 // positions may change here before the next run (new nodes, drags): that run sends them all
    }
    return true
  }

  /** Hand pending work to the worker: the whole graph when it changed (or a run starts), else a reheat. */
  flush() {
    if (!this.worker || !this.running) return
    if (this.sentGen !== this.gen) this.send()
    else if (this.reheatTo > 0) {
      this.seq++
      this.post({ type: 'reheat', gen: this.gen, seq: this.seq, alpha: this.reheatTo })
    }
    this.reheatTo = 0
  }

  send() {
    const nodes = this.nodes
    const buf = new Float64Array(nodes.length * 5)
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i]
      const pinned = n.fx != null && n.fy != null
      buf[i * 5] = n.x; buf[i * 5 + 1] = n.y
      buf[i * 5 + 2] = pinned ? n.fx : NaN; buf[i * 5 + 3] = pinned ? n.fy : NaN
      buf[i * 5 + 4] = n.r || 6
    }
    const L = this.sim.links // already resolved to visible node pairs
    const links = new Int32Array(L.length * 2)
    const types = new Uint8Array(L.length)
    const weights = new Float32Array(L.length)
    for (let j = 0; j < L.length; j++) {
      links[j * 2] = L[j].s._i; links[j * 2 + 1] = L[j].t._i
      types[j] = Math.max(0, LINK_TYPES.indexOf(L[j].type))
      weights[j] = L[j].link.weight || 1
    }
    this.seq++
    this.post({
      type: 'graph', gen: this.gen, seq: this.seq, nodes: buf, links, types, weights,
      opts: { ...this.sim.opts }, alpha: this.sim.alpha, alphaTarget: this.sim.alphaTarget, animate: this.animate(),
    }, [buf.buffer, links.buffer, types.buffer, weights.buffer])
    this.sentGen = this.gen
  }

  post(msg, transfer) {
    this.lastMsgAt = performance.now() // the watchdog in advance() counts from the last exchange either way
    try { this.worker.postMessage(msg, transfer || []) } catch { this.fallBack() }
  }

  receive(m) {
    if (m?.type !== 'tick' || m.gen !== this.gen || m.gen !== this.sentGen || !this.running) return
    if (!(m.pos instanceof Float64Array) || m.pos.length !== this.nodes.length * 2) return
    this.msg = m
    this.lastMsgAt = performance.now()
    this.onUpdate()
  }

  /** The worker failed (or never started): keep laying out on the main thread from where it got to. */
  fallBack() {
    if (!this.useWorker) return
    this.useWorker = false
    try { this.worker?.terminate() } catch { /* already gone */ }
    this.worker = null
    this.msg = null
    this.sentGen = -1
    if (this.running) { this.running = false; this.onUpdate() }
  }

  destroy() {
    try { this.worker?.terminate() } catch { /* already gone */ }
    this.worker = null
    this.running = false
  }
}

export function mount(root, ctx) {
  const S = {
    all: { nodes: [], links: [] },
    byId: new Map(),
    allAdj: new Map(),
    nodes: [],
    links: [],
    adj: new Map(),
    types: new Set(DEFAULT_TYPES),
    minDeg: 0,
    query: '',
    matches: null,
    best: null,
    physics: true,
    hover: null,
    selected: null,
    kb: null,
    drag: null,
    view: { x: 0, y: 0, k: 1 },
    W: 0, H: 0, dpr: 1,
    userMoved: false,
    autoFit: false,
    wasHot: false,
    layoutDirty: false,
    loaded: false,
    inputAt: 0, // last pointer/wheel/key input: frames right after it always paint
  }
  const layout = new Layout(() => requestRender(), () => !reducedMotion())
  let alive = true
  let raf = 0
  let anim = null
  let needsPaint = true
  let lastPaint = 0 // frame time of the last paint
  let paintCost = 0 // moving average of what a paint really costs the main thread (ms), raster included
  let jsCost = 0
  let measureNext = false
  const timers = new Set()
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn() }, ms); timers.add(t); return t }
  const cleanups = []

  // ───────── DOM ─────────
  const sub = el('p', { class: 'gv-sub mm-muted', text: 'Pages you read, the people, organizations and ideas they mention, and the notes that tie them together.' })
  const exportBtn = (fmt, label) => el('button', { type: 'button', class: 'mm-btn sm', 'data-export': fmt, 'aria-label': `Export graph as ${label}`, html: ICON.download }, label)
  const exports = el('div', { class: 'gv-exports', role: 'group', 'aria-label': 'Export' }, el('span', { class: 'lbl', text: 'Export' }), exportBtn('svg', 'SVG'), exportBtn('png', 'PNG'), exportBtn('mermaid', 'Mermaid'))
  const head = el('div', { class: 'view-head' }, el('div', {}, el('h1', { text: 'Knowledge Graph' }), sub), exports)
  const body = el('div', { class: 'gv-body', style: 'display:contents' })
  const wrap = el('div', { class: 'gv' }, head, body)
  root.replaceChildren(el('style', { text: STYLES }), wrap)

  // toolbar
  const search = el('input', { class: 'mm-input', type: 'search', placeholder: 'Search the graph…', 'aria-label': 'Search nodes', autocomplete: 'off', spellcheck: 'false' })
  const found = el('span', { class: 'gv-found', role: 'status', 'aria-live': 'polite' })
  const typeGroup = el('div', { class: 'mm-row wrap', role: 'group', 'aria-label': 'Node types', style: 'gap:6px' })
  const minRange = el('input', { type: 'range', class: 'mm-range', min: '0', max: '10', step: '1', value: '0', 'aria-label': 'Minimum connections per node' })
  const minOut = el('output', { text: '0' })
  const physics = el('input', { type: 'checkbox', checked: true, 'aria-label': 'Physics simulation' })
  const relayoutBtn = el('button', { type: 'button', class: 'mm-btn sm', html: ICON.relayout, title: 'Unpin every node and run the layout again' }, 'Re-layout')
  const fitBtn = el('button', { type: 'button', class: 'mm-btn sm', html: ICON.fit, title: 'Fit the graph to the view (F)' }, 'Fit')
  const toolbar = el('div', { class: 'gv-tb mm-card' },
    el('div', { class: 'gv-tb-l' }, el('label', { class: 'gv-search' }, el('span', { html: ICON.search }), search), found, typeGroup),
    el('div', { class: 'gv-tb-r' },
      el('label', { class: 'gv-min', title: 'Only show nodes with at least this many visible connections' }, el('span', { text: 'Min links' }), minRange, minOut),
      el('span', { class: 'gv-sep', 'aria-hidden': 'true' }),
      el('label', { class: 'mm-switch' }, physics, el('span'), 'Physics'),
      relayoutBtn, fitBtn))

  // stage
  const srHelp = el('span', { id: 'gv-help', class: 'gv-sr', text: 'Interactive knowledge graph. Arrow keys pan, plus and minus zoom, F fits the view, N and P step through nodes by importance, Enter opens details, Escape closes them.' })
  const srLive = el('span', { class: 'gv-sr', role: 'status', 'aria-live': 'polite' })
  const canvas = el('canvas', { class: 'gv-canvas', tabindex: '0', role: 'application', 'aria-label': 'Knowledge graph', 'aria-describedby': 'gv-help' })
  const counts = el('div', { class: 'gv-ov gv-counts', 'aria-hidden': 'true' })
  const legend = el('div', { class: 'gv-ov gv-legend', 'aria-label': 'Legend' })
  const zoomIn = el('button', { type: 'button', class: 'mm-btn icon sm', 'aria-label': 'Zoom in', title: 'Zoom in (+)', html: ICON.plus })
  const zoomOut = el('button', { type: 'button', class: 'mm-btn icon sm', 'aria-label': 'Zoom out', title: 'Zoom out (−)', html: ICON.minus })
  const zoomFit = el('button', { type: 'button', class: 'mm-btn icon sm', 'aria-label': 'Fit to view', title: 'Fit to view (F)', html: ICON.fit })
  const zoom = el('div', { class: 'gv-ov gv-zoom' }, zoomIn, zoomOut, zoomFit)
  const tip = el('div', { class: 'gv-tip', hidden: true, 'aria-hidden': 'true' })
  const filterEmpty = el('div', { class: 'gv-empty-stage', hidden: true })
  const stage = el('div', { class: 'gv-stage' }, canvas, counts, legend, zoom, tip, filterEmpty, srHelp, srLive)
  let inspector = null

  legend.append(
    el('div', { class: 'row', html: ORDER.map(t => `<span>${glyph(t, 11)}${TYPE[t].one}</span>`).join('') }),
    el('div', { class: 'row', html: '<span><i style="--c:rgba(167,139,250,.7)"></i>Mentions</span><span><i class="dash" style="--c:rgba(34,211,238,.8)"></i>Shared entities</span><span><i style="--c:rgba(251,191,36,.85)"></i>Note link</span>' }),
    el('div', { class: 'hint', text: 'Drag to pan · scroll to zoom · drag a node to pin it' }))

  // ───────── data ─────────
  function radius(n) {
    const deg = n.degree - (n.siteLinks || 0)
    let r = TYPE[n.type].base + Math.min(13, Math.sqrt(Math.max(0, deg)) * 2.1)
    if (n.type === 'page' && n.data.highlights) r += Math.min(4, n.data.highlights * 0.6)
    return r
  }

  async function readLayout() {
    try { return (await ctx.db.get('kv', LAYOUT_KEY))?.v || null } catch { return null }
  }

  let loadSeq = 0
  async function load() {
    const seq = ++loadSeq
    let data
    try {
      const [pages, notes, highlights, layout] = await Promise.all([ctx.db.all('pages'), ctx.db.all('notes'), ctx.db.all('highlights'), S.loaded ? null : readLayout()])
      data = { pages, notes, highlights, layout }
    } catch (e) {
      if (!alive || seq !== loadSeq) return
      body.replaceChildren(el('div', { class: 'mm-error', role: 'alert' }, el('span', { text: `Couldn’t load your knowledge: ${e?.message || e} ` }), el('button', { type: 'button', class: 'mm-btn sm', text: 'Retry', onclick: () => load() })))
      return
    }
    if (!alive || seq !== loadSeq) return // a newer load (live update) superseded this one
    const g = buildGraph(data, { sites: true })
    const prev = S.byId
    const byId = new Map(g.nodes.map(n => [n.id, n]))
    for (const n of g.nodes) {
      n.search = [n.label, n.data.site, n.data.url, n.data.kind, ...(n.data.tags || [])].filter(Boolean).join(' ').toLowerCase()
      const old = prev.get(n.id)
      const pos = data.layout?.nodes?.[n.id]
      if (old && Number.isFinite(old.x)) {
        n.x = old.x; n.y = old.y; n.vx = old.vx; n.vy = old.vy; n.fx = old.fx; n.fy = old.fy
      } else if (pos && Number.isFinite(pos[0]) && Number.isFinite(pos[1])) {
        n.x = pos[0]; n.y = pos[1]
        if (pos[2]) { n.fx = n.x; n.fy = n.y }
      }
      n.fresh = !Number.isFinite(n.x) // never laid out: placed next to its neighbours once it is on screen
    }
    const links = g.links.map(l => ({ source: byId.get(l.source), target: byId.get(l.target), type: l.type, weight: l.weight }))
    for (const l of links) if (l.type === 'site') l.source.siteLinks = (l.source.siteLinks || 0) + 1
    for (const n of g.nodes) n.r = radius(n)
    const allAdj = new Map(g.nodes.map(n => [n, new Map()]))
    for (const l of links) { allAdj.get(l.source).set(l.target, l.type); allAdj.get(l.target).set(l.source, l.type) }

    const firstLoad = !S.loaded
    const structureChanged = firstLoad || g.nodes.length !== S.all.nodes.length || links.length !== S.all.links.length || g.nodes.some(n => !prev.has(n.id))
    S.all = { nodes: g.nodes, links }
    S.byId = byId
    S.allAdj = allAdj
    S.loaded = true
    if (S.selected) S.selected = byId.get(S.selected.id) || null
    if (S.kb) S.kb = byId.get(S.kb.id) || null
    S.hover = null

    if (!g.nodes.length) return showEmpty()
    const init = !stage.isConnected // first time the graph is shown (or shown again after being empty)
    if (init) showGraph()
    buildTypeChips()

    if (init) {
      layout.stop()
      applyFilters({ reheat: 0 })
      resize()
      // On-screen nodes without a saved position (hidden types don't count).
      const fresh = S.nodes.filter(n => n.fresh)
      if (!fresh.length) layout.alpha = 0 // exactly as you left it
      else if (fresh.length === S.nodes.length) layout.alpha = 1 // nothing saved yet: a whole new layout
      else layout.alpha = settleLocally(fresh) ? 0 : 0.35 // a few new nodes join quietly; many reshape the layout
      S.autoFit = layout.alpha > 0
      warmUp()
      fit({ animate: false })
      if (S.physics) layout.start()
    } else {
      applyFilters({ reheat: 0 })
      if (structureChanged) {
        const fresh = S.nodes.filter(n => n.fresh)
        // New nodes in a big graph settle locally (even during a run: they then start next to their neighbours).
        // Small graphs, or big batches, re-run the whole layout as before.
        if (fresh.length && settleLocally(fresh)) { /* placed */ } else if (S.physics && (fresh.length || S.nodes.length <= SMALL_GRAPH)) layout.start(0.3)
      }
    }
    if (S.selected) openInspector(S.selected, { focus: false }); else closeInspector({ restoreFocus: false })
    requestRender()
  }

  /**
   * Settle new nodes into an existing layout without moving anything else. Returns false when a whole-layout
   * run fits better: small graphs (cheap, and the rest may need to make room) and big batches of new nodes.
   */
  function settleLocally(fresh) {
    const n = S.nodes.length
    if (S.physics && (n <= SMALL_GRAPH || fresh.length > Math.min(RELAX_MAX, n * 0.3))) return false
    layout.relax(fresh)
    saveLayoutSoon() // the next open then starts cold
    return true
  }

  function showEmpty() {
    closeInspector({ restoreFocus: false })
    exports.hidden = true
    body.replaceChildren(el('div', { class: 'gv-empty' }, el('div', { class: 'mm-card' },
      el('div', { class: 'art', html: ICON.graph }),
      el('h2', { text: 'Your knowledge graph is waiting to grow' }),
      el('p', { text: 'Every page you brief, passage you highlight and note you write becomes a node. Master Mind links them through the people, organizations, places and topics they share.' }),
      el('ol', { class: 'gv-steps' },
        el('li', {}, el('b', { html: `${glyph('page', 12)}<span>Brief a page</span>` }), el('span', { text: 'Open any article, press Alt+Shift+M and run a Brief. Its topics and entities join the graph.' })),
        el('li', {}, el('b', { html: `${glyph('entity', 12)}<span>Highlight</span>` }), el('span', { text: 'Highlighted pages appear even before you brief them.' })),
        el('li', {}, el('b', { html: `${glyph('note', 12)}<span>Write notes</span>` }), el('span', { text: 'Notes with sources or [[wiki links]] connect to pages and to each other.' }))),
      el('div', { class: 'mm-row', style: 'justify-content:center' },
        el('button', { type: 'button', class: 'mm-btn primary', text: 'Open Notes', onclick: () => ctx.navigate('notes') }),
        el('button', { type: 'button', class: 'mm-btn ghost', text: 'View highlights', onclick: () => ctx.navigate('highlights') })))))
    sub.textContent = 'Nothing to connect yet.'
  }

  function showGraph() {
    exports.hidden = false
    sub.textContent = 'Pages you read, the people, organizations and ideas they mention, and the notes that tie them together.'
    body.replaceChildren(toolbar, stage)
  }

  function buildTypeChips() {
    const n = {}
    for (const node of S.all.nodes) n[node.type] = (n[node.type] || 0) + 1
    typeGroup.replaceChildren(...ORDER.map(t => el('button', {
      type: 'button', class: 'mm-chip gv-type', 'data-type': t, 'aria-pressed': String(S.types.has(t)), style: `--c:${TYPE[t].color}`,
      title: `${S.types.has(t) ? 'Hide' : 'Show'} ${TYPE[t].label.toLowerCase()}`,
      onclick: () => { if (S.types.has(t)) S.types.delete(t); else S.types.add(t); buildTypeChips(); applyFilters({ reheat: 0.25 }) },
    }, el('span', { html: glyph(t, 11), style: 'display:grid' }), TYPE[t].label, el('span', { class: 'n', text: String(n[t] || 0) }))))
  }

  /** Visible subgraph = enabled types, then nodes with at least `minDeg` visible connections. */
  function applyFilters({ reheat = 0.25 } = {}) {
    let nodes = S.all.nodes.filter(n => S.types.has(n.type))
    let set = new Set(nodes)
    let links = S.all.links.filter(l => set.has(l.source) && set.has(l.target))
    const degree = ls => {
      const d = new Map()
      for (const l of ls) { d.set(l.source, (d.get(l.source) || 0) + 1); d.set(l.target, (d.get(l.target) || 0) + 1) }
      return d
    }
    let deg = degree(links)
    // Peel repeatedly (a k-core) so every node left on screen really has `minDeg` visible connections.
    for (let guard = 0; S.minDeg > 0 && guard < 100; guard++) {
      const keep = nodes.filter(n => (deg.get(n) || 0) >= S.minDeg)
      if (keep.length === nodes.length) break
      nodes = keep
      set = new Set(nodes)
      links = links.filter(l => set.has(l.source) && set.has(l.target))
      deg = degree(links)
    }
    for (const n of S.all.nodes) n.vdeg = deg.get(n) || 0
    S.nodes = nodes
    S.links = links
    S.adj = new Map(nodes.map(n => [n, new Set()]))
    for (const l of links) { S.adj.get(l.source).add(l.target); S.adj.get(l.target).add(l.source) }
    S.order = [...nodes].sort((a, b) => b.vdeg - a.vdeg || a.label.localeCompare(b.label))
    layout.setGraph(nodes, links)
    if (reheat && S.physics) layout.start(reheat)
    if (S.selected && !set.has(S.selected)) closeInspector({ restoreFocus: false })
    if (S.kb && !set.has(S.kb)) S.kb = null
    let maxDeg = 1
    for (const n of S.all.nodes) if (S.types.has(n.type) && n.vdeg > maxDeg) maxDeg = n.vdeg
    minRange.max = String(Math.max(Math.min(12, maxDeg), S.minDeg))
    updateCounts()
    runSearch({ focus: false })
    filterEmpty.hidden = nodes.length > 0
    if (!nodes.length) {
      filterEmpty.replaceChildren(el('div', { class: 'mm-card' },
        el('b', { text: 'Nothing matches these filters' }),
        el('p', { class: 'mm-muted mm-small', style: 'margin:6px 0 12px', text: 'Turn a node type back on or lower the minimum connections.' }),
        el('button', { type: 'button', class: 'mm-btn sm', text: 'Reset filters', onclick: resetFilters })))
    }
    requestRender()
  }

  function resetFilters() {
    S.types = new Set(DEFAULT_TYPES)
    S.minDeg = 0
    minRange.value = '0'
    minOut.textContent = '0'
    buildTypeChips()
    applyFilters({ reheat: 0.25 })
  }

  function updateCounts() {
    const total = S.all.nodes.length
    const shown = S.nodes.length
    counts.innerHTML = ''
    counts.append(el('b', { text: shown.toLocaleString() }), ` node${shown === 1 ? '' : 's'} · `, el('b', { text: S.links.length.toLocaleString() }), ` link${S.links.length === 1 ? '' : 's'}`)
    if (shown < total) counts.append(el('span', { class: 'mm-muted', text: ` · ${total.toLocaleString()} total` }))
    canvas.setAttribute('aria-label', `Knowledge graph with ${shown} nodes and ${S.links.length} links`)
  }

  // ───────── simulation + render loop ─────────
  /**
   * Settle most of the layout before the first paint. Small graphs settle completely within the budget; bigger
   * ones would only get a few ticks here, blocking the page, so with a worker they settle there from the start.
   */
  function warmUp(budgetMs = 120) {
    const sim = layout.sim
    if (!S.physics || !sim.hot || (!layout.onMainThread && S.nodes.length > SMALL_GRAPH)) return
    const t0 = performance.now()
    while (sim.hot && sim.alpha > 0.04 && performance.now() - t0 < budgetMs) sim.tick()
  }

  /** Something on screen changed: paint on the next frame. */
  function requestRender() {
    needsPaint = true
    requestFrame()
  }
  function requestFrame() {
    if (!raf && alive) raf = requestAnimationFrame(frame)
  }

  function frame(now) {
    raf = 0
    if (!alive) return
    if (measureNext) {
      // Rasterizing the canvas happens after paint() returns, before this frame: count it in.
      const est = Math.max(jsCost, now - lastPaint - FRAME_MS)
      paintCost = paintCost ? paintCost * 0.6 + est * 0.4 : est
      measureNext = false
    }
    let again = false
    if (S.physics && S.nodes.length && layout.hot) {
      if (layout.advance()) needsPaint = true
      S.wasHot = true
      if (S.autoFit && !S.userMoved && layout.alpha < 0.03) { S.autoFit = false; fit() }
      again = layout.hot // keep frames coming while the layout moves (cheap when nothing new arrived)
    }
    const running = S.physics && layout.hot
    if (S.wasHot && !running) {
      S.wasHot = false
      saveLayoutSoon(400) // cooled down: remember the settled layout
      needsPaint = true // the full-quality paint of the settled layout
    }
    if (anim) {
      const t = clamp((now - anim.t0) / anim.ms, 0, 1)
      const e = 1 - Math.pow(1 - t, 3)
      S.view.x = anim.from.x + (anim.to.x - anim.from.x) * e
      S.view.y = anim.from.y + (anim.to.y - anim.from.y) * e
      S.view.k = anim.from.k + (anim.to.k - anim.from.k) * e
      needsPaint = true
      if (t >= 1) anim = null; else again = true
    }
    // While the layout settles on its own, an expensive paint (a huge graph, a slow canvas) runs at a reduced rate,
    // keeping it to about a third of the main thread; big graphs also paint a cheaper draft (no glows, only the
    // emphasized labels) until they settle. Input and view animations always paint at once.
    const interacting = !!(anim || S.drag?.moved || pinch || now - S.inputAt < 250)
    const gap = running && !interacting && paintCost > 12 ? paintCost * 3 : 0
    let painted = false
    if (needsPaint && now - lastPaint >= gap) {
      const t0 = performance.now()
      const draft = running && S.nodes.length > DRAFT_NODES
      paint(canvas.getContext('2d'), { width: S.W, height: S.H, scale: S.dpr, view: S.view, interactive: true, draft })
      syncStageBackground()
      if (S.kb || S.hover) positionTip()
      jsCost = performance.now() - t0
      lastPaint = now
      needsPaint = false
      painted = true
    } else if (needsPaint) again = true // paint on a later frame
    if (again) requestFrame()
    measureNext = painted && again
  }

  function syncStageBackground() {
    const k = S.view.k
    const size = clamp(28 * k, 10, 120)
    stage.style.backgroundSize = `${size}px ${size}px,auto,auto`
    stage.style.backgroundPosition = `${S.view.x % size}px ${S.view.y % size}px,0 0,0 0`
  }

  /**
   * Draw the graph into `g`. `width/height` are CSS px of the target, `scale` device px per CSS px.
   * interactive=false is used for PNG export (no hover/selection emphasis, opaque background).
   */
  function paint(g, { width, height, scale, view, interactive, draft = false }) {
    g.setTransform(scale, 0, 0, scale, 0, 0)
    g.clearRect(0, 0, width, height)
    if (!interactive) {
      g.fillStyle = '#0B0C10'
      g.fillRect(0, 0, width, height)
      const r1 = g.createRadialGradient(width * 0.25, height * 0.2, 0, width * 0.25, height * 0.2, Math.max(width, height) * 0.7)
      r1.addColorStop(0, 'rgba(34,211,238,.07)'); r1.addColorStop(1, 'rgba(34,211,238,0)')
      g.fillStyle = r1; g.fillRect(0, 0, width, height)
      const r2 = g.createRadialGradient(width * 0.85, height * 0.9, 0, width * 0.85, height * 0.9, Math.max(width, height) * 0.6)
      r2.addColorStop(0, 'rgba(167,139,250,.08)'); r2.addColorStop(1, 'rgba(167,139,250,0)')
      g.fillStyle = r2; g.fillRect(0, 0, width, height)
    }
    const { k } = view
    g.setTransform(scale * k, 0, 0, scale * k, scale * view.x, scale * view.y)
    const m = 60 / k
    const x0 = -view.x / k - m, y0 = -view.y / k - m, x1 = (width - view.x) / k + m, y1 = (height - view.y) / k + m
    const visible = n => n.x + n.r > x0 && n.x - n.r < x1 && n.y + n.r > y0 && n.y - n.r < y1

    const focus = interactive ? (S.drag?.node && S.drag.moved ? S.drag.node : S.hover || S.selected || S.kb) : null
    const nb = focus ? S.adj.get(focus) : null
    const matches = interactive ? S.matches : null
    const dimmed = n => (matches && !matches.has(n)) || (focus && n !== focus && !nb?.has(n))

    // ── links, batched by style ──
    const lw = clamp(1, 0.55 / k, 2.4 / k)
    const buckets = new Map()
    const push = (key, l) => { let b = buckets.get(key); if (!b) buckets.set(key, (b = [])); b.push(l) }
    for (const l of S.links) {
      const a = l.source, b = l.target
      if ((a.x < x0 && b.x < x0) || (a.x > x1 && b.x > x1) || (a.y < y0 && b.y < y0) || (a.y > y1 && b.y > y1)) continue
      if (focus && (a === focus || b === focus)) push(`hi:${(a === focus ? b : a).type}`, l)
      else if (focus || (matches && !(matches.has(a) && matches.has(b)))) push('dim', l)
      else push(l.type, l)
    }
    const strokeBucket = (list, stroke, width, dash) => {
      g.beginPath()
      for (const l of list) { g.moveTo(l.source.x, l.source.y); g.lineTo(l.target.x, l.target.y) }
      g.strokeStyle = stroke
      g.lineWidth = width
      g.setLineDash(dash ? dash.map(d => d / Math.max(k, 0.4)) : [])
      g.stroke()
    }
    g.lineCap = 'round'
    if (buckets.has('dim')) strokeBucket(buckets.get('dim'), 'rgba(148,163,184,.06)', lw)
    for (const [type, st] of Object.entries(LINKS)) if (buckets.has(type)) strokeBucket(buckets.get(type), st.stroke, lw * (type === 'wiki' ? 1.3 : 1), st.dash)
    for (const t of ORDER) if (buckets.has(`hi:${t}`)) strokeBucket(buckets.get(`hi:${t}`), `rgba(${TYPE[t].rgb},.8)`, lw * 1.8)
    g.setLineDash([])

    // ── nodes: dimmed first, emphasized last ──
    const low = [], mid = [], top = []
    for (const n of S.nodes) {
      if (!visible(n)) continue
      if (interactive && (n === focus || n === S.selected || n === S.best)) top.push(n)
      else if (dimmed(n)) low.push(n)
      else mid.push(n)
    }
    const drawNode = (n, alpha, emph) => {
      const t = TYPE[n.type]
      g.globalAlpha = alpha
      const sr = n.r * k
      if (!draft && alpha > 0.5 && sr > 1.2) {
        const R = n.r * (emph ? 3.1 : 2.4)
        g.drawImage(sprite(n.type), n.x - R, n.y - R, R * 2, R * 2)
      }
      shapePath(g, n.type, n.x, n.y, n.r)
      if (n.type === 'entity') {
        g.fillStyle = '#0D0F15'
        g.fill()
        g.lineWidth = Math.max(1.6, n.r * 0.42)
        g.strokeStyle = t.color
        g.stroke()
      } else {
        g.fillStyle = t.color
        g.fill()
        // soft glassy highlight
        if (sr > 4) {
          g.globalAlpha = alpha * 0.35
          g.beginPath()
          g.arc(n.x - n.r * 0.28, n.y - n.r * 0.3, n.r * 0.38, 0, Math.PI * 2)
          g.fillStyle = '#ffffff'
          g.fill()
          g.globalAlpha = alpha
        }
      }
      if (emph) {
        shapePath(g, n.type, n.x, n.y, n.r + 4 / k)
        g.lineWidth = 2 / k
        g.strokeStyle = n === S.selected ? '#F7F8FC' : `rgba(${t.rgb},.95)`
        g.stroke()
      }
      if (n.fx != null && sr > 3) {
        g.beginPath()
        g.arc(n.x + n.r * 0.78, n.y - n.r * 0.78, Math.max(1.6, n.r * 0.24), 0, Math.PI * 2)
        g.fillStyle = '#F7F8FC'
        g.fill()
      }
    }
    for (const n of low) drawNode(n, 0.16, false)
    for (const n of mid) drawNode(n, 1, false)
    for (const n of top) drawNode(n, 1, true)
    g.globalAlpha = 1

    // ── labels, in screen space so they stay crisp ──
    g.setTransform(scale, 0, 0, scale, 0, 0)
    const labels = placeLabels(view, width, height, { interactive, focus, nb, matches, dimmed, visible, draft })
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.lineJoin = 'round'
    for (const L of labels) {
      g.font = L.bold ? LABEL_FONT_BOLD : LABEL_FONT
      g.lineWidth = 3.5
      g.strokeStyle = 'rgba(9,10,14,.92)'
      g.strokeText(L.text, L.x, L.y)
      g.fillStyle = L.bold ? '#F7F8FC' : L.faint ? 'rgba(182,188,204,.85)' : 'rgba(236,239,247,.92)'
      g.fillText(L.text, L.x, L.y)
    }
  }

  /** Greedy, priority-ordered label placement with overlap rejection. */
  function placeLabels(view, width, height, { interactive, focus, nb, matches, dimmed, visible, draft = false }) {
    const { k } = view
    const cands = []
    for (const n of S.nodes) {
      if (!visible(n)) continue
      const dim = dimmed(n)
      let pri
      if (interactive && n === focus) pri = 1e6
      else if (interactive && n === S.selected) pri = 9e5
      else if (interactive && n === S.best) pri = 8e5
      else if (dim || draft) continue
      else if (nb?.has(n)) pri = 5e5 + n.vdeg
      else if (matches?.has(n)) pri = 4e5 + n.vdeg
      else if (!interactive) pri = n.vdeg * 10 + (n.type === 'topic' || n.type === 'note' ? 5 : 0)
      else {
        // Small graphs label everything that fits; big ones reveal labels by degree as you zoom in.
        const sr = n.r * k
        const show = S.nodes.length <= 90 || k >= 1.5 || sr >= 11 || (n.vdeg + 1) * k >= 2.4 || ((n.type === 'topic' || n.type === 'note') && k >= 0.6)
        if (!show) continue
        pri = n.vdeg * 10 + (n.type === 'topic' || n.type === 'note' ? 5 : 0)
      }
      cands.push([pri, n])
    }
    cands.sort((a, b) => b[0] - a[0])
    const out = []
    // Occupancy grid of label boxes and node discs, so labels avoid each other and other nodes.
    const CELL = 64
    const grid = new Map()
    const cellsOf = b => {
      const keys = []
      for (let gx = Math.floor(b[0] / CELL); gx <= Math.floor(b[2] / CELL); gx++) for (let gy = Math.floor(b[1] / CELL); gy <= Math.floor(b[3] / CELL); gy++) keys.push(gx * 100003 + gy)
      return keys
    }
    const add = b => { for (const key of cellsOf(b)) { const c = grid.get(key); if (c) c.push(b); else grid.set(key, [b]) } }
    const hits = (b, self, labelsOnly) => {
      for (const key of cellsOf(b)) {
        for (const o of grid.get(key) || []) {
          if (o.n === self || (labelsOnly && o.n)) continue
          if (o[0] < b[2] && o[2] > b[0] && o[1] < b[3] && o[3] > b[1]) return true
        }
      }
      return false
    }
    // Bright node discs are obstacles (faded ones may sit under a label).
    if (S.nodes.length <= 3000 && !draft) {
      for (const n of S.nodes) {
        if (!visible(n) || dimmed(n)) continue
        const sx = n.x * k + view.x, sy = n.y * k + view.y, sr = Math.max(2, n.r * k)
        const b = [sx - sr, sy - sr, sx + sr, sy + sr]
        b.n = n
        add(b)
      }
    }
    const limit = interactive ? 320 : 1500
    for (const [pri, n] of cands) {
      if (out.length >= limit) break
      const bold = pri >= 8e5
      const text = truncate(n.label, bold ? 60 : 30)
      const font = bold ? LABEL_FONT_BOLD : LABEL_FONT
      const w = textWidth(text, font)
      const sx = n.x * k + view.x
      const sy = (n.y + n.r * (n.type === 'topic' ? 1.22 : 1)) * k + view.y + 11
      if (sx + w / 2 < 0 || sx - w / 2 > width || sy < -10 || sy > height + 10) continue
      const box = [sx - w / 2 - 3, sy - 8, sx + w / 2 + 3, sy + 8]
      // In big, dense graphs the dozen most important labels only avoid other labels, so overviews keep landmarks.
      if (pri < 8e5 && hits(box, n, S.nodes.length > 300 && out.length < 12)) continue
      add(box)
      out.push({ n, text, x: sx, y: sy, bold, faint: n.type === 'entity' && !bold })
    }
    return out
  }

  // ───────── view transform ─────────
  const toWorld = (sx, sy) => [(sx - S.view.x) / S.view.k, (sy - S.view.y) / S.view.k]
  const toScreen = n => [n.x * S.view.k + S.view.x, n.y * S.view.k + S.view.y]

  function setView(v, { animate = true } = {}) {
    const target = { x: v.x, y: v.y, k: clamp(v.k, K_MIN, K_MAX) }
    if (!animate || reducedMotion()) { anim = null; Object.assign(S.view, target) } else anim = { from: { ...S.view }, to: target, t0: performance.now(), ms: 420 }
    requestRender()
  }

  function zoomAt(sx, sy, factor, opts) {
    const k = clamp(S.view.k * factor, K_MIN, K_MAX)
    const [wx, wy] = toWorld(sx, sy)
    setView({ k, x: sx - wx * k, y: sy - wy * k }, opts)
  }

  function bounds(nodes) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const n of nodes) {
      x0 = Math.min(x0, n.x - n.r); y0 = Math.min(y0, n.y - n.r)
      x1 = Math.max(x1, n.x + n.r); y1 = Math.max(y1, n.y + n.r)
    }
    return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 }
  }

  function fit({ animate = true } = {}) {
    if (!S.nodes.length || !S.W) return
    const b = bounds(S.nodes)
    const availW = S.W - (inspector ? 352 : 0)
    // Leave room for the counts badge (top) and the legend (bottom) overlays.
    const padX = 56, padTop = 56, padBottom = S.H > 520 ? 104 : 56
    const k = clamp(Math.min((availW - padX * 2) / Math.max(b.w, 1), (S.H - padTop - padBottom) / Math.max(b.h, 1)), K_MIN, 2.2)
    setView({ k, x: availW / 2 - (b.x0 + b.w / 2) * k, y: padTop + (S.H - padTop - padBottom) / 2 - (b.y0 + b.h / 2) * k }, { animate })
  }

  function centerOn(n, { minK = 1 } = {}) {
    const k = Math.max(S.view.k, minK)
    const availW = S.W - (inspector ? 352 : 0)
    setView({ k, x: availW / 2 - n.x * k, y: S.H / 2 - n.y * k })
  }

  function resize() {
    const r = stage.getBoundingClientRect()
    const W = Math.max(1, Math.round(r.width)), H = Math.max(1, Math.round(r.height))
    const dpr = Math.min(3, window.devicePixelRatio || 1)
    if (W === S.W && H === S.H && dpr === S.dpr) return
    // Keep the centre of the graph steady while the stage resizes.
    if (S.W) { S.view.x += (W - S.W) / 2; S.view.y += (H - S.H) / 2 }
    S.W = W; S.H = H; S.dpr = dpr
    layout.setAspect(clamp(W / H, 0.6, 2.4)) // lay out wide on wide stages
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
    canvas.style.width = `${W}px`
    canvas.style.height = `${H}px`
    requestRender()
  }
  const ro = new ResizeObserver(() => resize())
  ro.observe(stage)
  cleanups.push(() => ro.disconnect())
  // devicePixelRatio changes (moving the window to another display, browser zoom)
  let dprQuery
  const watchDpr = () => {
    dprQuery?.removeEventListener('change', onDpr)
    dprQuery = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
    dprQuery.addEventListener('change', onDpr)
  }
  function onDpr() { resize(); watchDpr() }
  watchDpr()
  cleanups.push(() => dprQuery?.removeEventListener('change', onDpr))

  // ───────── hit testing + pointer interaction ─────────
  function hit(sx, sy) {
    const [wx, wy] = toWorld(sx, sy)
    const slop = 4 / S.view.k
    let best = null, bestD = Infinity
    for (let i = S.nodes.length - 1; i >= 0; i--) {
      const n = S.nodes[i]
      const r = Math.max(n.r, 5 / S.view.k) + slop
      const dx = n.x - wx, dy = n.y - wy
      const d = dx * dx + dy * dy
      if (d <= r * r && d < bestD) { best = n; bestD = d }
    }
    return best
  }

  const pointers = new Map()
  let gesture = null
  let pinch = null
  const local = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] }

  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    S.inputAt = performance.now()
    canvas.setPointerCapture(e.pointerId)
    const [x, y] = local(e)
    pointers.set(e.pointerId, { x, y })
    anim = null
    if (pointers.size === 2) {
      // second finger: switch to pinch zoom
      if (gesture?.type === 'node') endNodeDrag(gesture)
      gesture = null
      const [a, b] = [...pointers.values()]
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, view: { ...S.view }, mid: [(a.x + b.x) / 2, (a.y + b.y) / 2] }
      return
    }
    const n = hit(x, y)
    gesture = n ? { type: 'node', node: n, sx: x, sy: y, moved: false } : { type: 'pan', sx: x, sy: y, vx: S.view.x, vy: S.view.y, moved: false }
    S.drag = gesture
    hideTip()
  })

  canvas.addEventListener('pointermove', e => {
    const [x, y] = local(e)
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x, y })
    if (pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1
      const mid = [(a.x + b.x) / 2, (a.y + b.y) / 2]
      const k = clamp(pinch.view.k * d / pinch.d, K_MIN, K_MAX)
      const wx = (pinch.mid[0] - pinch.view.x) / pinch.view.k, wy = (pinch.mid[1] - pinch.view.y) / pinch.view.k
      S.view.k = k
      S.view.x = mid[0] - wx * k
      S.view.y = mid[1] - wy * k
      S.userMoved = true
      requestRender()
      return
    }
    if (gesture) {
      const dx = x - gesture.sx, dy = y - gesture.sy
      if (!gesture.moved && dx * dx + dy * dy < 16) return
      if (!gesture.moved) {
        gesture.moved = true
        canvas.classList.add('drag')
        if (gesture.type === 'node' && S.physics) { layout.target(0.25); layout.start(0.25) }
      }
      if (gesture.type === 'pan') {
        S.view.x = gesture.vx + dx
        S.view.y = gesture.vy + dy
        S.userMoved = true
      } else {
        const n = gesture.node
        const [wx, wy] = toWorld(x, y)
        n.fx = wx; n.fy = wy
        n.x = wx; n.y = wy; n.vx = 0; n.vy = 0 // the pointer owns this node: no waiting for the next tick
        layout.pin(n)
      }
      requestRender()
      return
    }
    // hover (no buttons down)
    const n = hit(x, y)
    canvas.classList.toggle('over', !!n)
    if (n !== S.hover) {
      S.hover = n
      if (n) showTip(n); else hideTip()
      requestRender()
    }
  })

  function endNodeDrag(gst) {
    const n = gst.node
    layout.target(0)
    if (gst.moved) {
      n.fx = n.x; n.fy = n.y // stays pinned where you dropped it
      layout.pin(n)
      S.layoutDirty = true
      saveLayoutSoon()
    }
  }

  function endPointer(e) {
    pointers.delete(e.pointerId)
    try { canvas.releasePointerCapture(e.pointerId) } catch { /* already released */ }
    if (pinch) { if (pointers.size < 2) pinch = null; return }
    const gst = gesture
    gesture = null
    S.drag = null
    canvas.classList.remove('drag')
    if (!gst) return
    if (gst.type === 'node') {
      endNodeDrag(gst)
      if (!gst.moved && e.type === 'pointerup') select(gst.node)
    } else if (!gst.moved && e.type === 'pointerup') {
      select(null)
    }
    requestRender()
  }
  canvas.addEventListener('pointerup', endPointer)
  canvas.addEventListener('pointercancel', endPointer)
  canvas.addEventListener('pointerleave', () => {
    if (gesture) return
    if (S.hover) { S.hover = null; hideTip(); canvas.classList.remove('over'); requestRender() }
  })
  canvas.addEventListener('dblclick', e => {
    const n = hit(...local(e))
    if (n?.type === 'page') openPage(n.data.url)
    else if (n?.type === 'note') openNote(n)
  })
  canvas.addEventListener('wheel', e => {
    e.preventDefault()
    S.inputAt = performance.now()
    const [x, y] = local(e)
    // ctrlKey = trackpad pinch: much finer deltas
    const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.012 : 0.0016) * (e.deltaMode === 1 ? 16 : 1))
    zoomAt(x, y, factor, { animate: false })
    S.userMoved = true
  }, { passive: false })

  // ───────── keyboard ─────────
  canvas.addEventListener('keydown', e => {
    S.inputAt = performance.now()
    const step = e.shiftKey ? 180 : 60
    const key = e.key
    if (key.startsWith('Arrow')) {
      e.preventDefault()
      const dx = key === 'ArrowLeft' ? step : key === 'ArrowRight' ? -step : 0
      const dy = key === 'ArrowUp' ? step : key === 'ArrowDown' ? -step : 0
      setView({ ...S.view, x: S.view.x + dx, y: S.view.y + dy }, { animate: false })
      S.userMoved = true
    } else if (key === '+' || key === '=') { e.preventDefault(); zoomAt(S.W / 2, S.H / 2, 1.25); S.userMoved = true } else if (key === '-' || key === '_') { e.preventDefault(); zoomAt(S.W / 2, S.H / 2, 0.8); S.userMoved = true } else if (key === 'f' || key === 'F' || key === '0') { e.preventDefault(); fit() } else if (key === 'n' || key === 'N' || key === ']' || key === 'p' || key === 'P' || key === '[') {
      e.preventDefault()
      if (!S.order?.length) return
      const dir = key === 'p' || key === 'P' || key === '[' ? -1 : 1
      const i = S.kb ? S.order.indexOf(S.kb) : -1
      S.kb = S.order[(i + dir + S.order.length) % S.order.length]
      const [sx, sy] = toScreen(S.kb)
      if (sx < 40 || sy < 40 || sx > S.W - 40 || sy > S.H - 40) centerOn(S.kb, { minK: S.view.k })
      showTip(S.kb)
      srLive.textContent = describe(S.kb)
      requestRender()
    } else if ((key === 'Enter' || key === ' ') && (S.kb || S.hover)) {
      e.preventDefault()
      select(S.kb || S.hover, { focus: true })
    } else if (key === 'Escape') {
      if (inspector) { e.preventDefault(); closeInspector() } else if (S.kb) { S.kb = null; hideTip(); requestRender() }
    }
  })
  canvas.addEventListener('blur', () => { if (S.kb) { S.kb = null; hideTip(); requestRender() } })

  function describe(n) {
    const t = TYPE[n.type].one
    const site = n.type === 'page' && n.data.site ? `, ${n.data.site}` : ''
    return `${t}: ${n.label}${site}. ${n.vdeg} connection${n.vdeg === 1 ? '' : 's'}.`
  }

  // ───────── tooltip ─────────
  function showTip(n) {
    const t = TYPE[n.type]
    const extra = n.type === 'page' ? (n.data.site || '') : n.type === 'entity' ? (n.data.kind && n.data.kind !== 'other' ? n.data.kind : '') : n.type === 'note' ? (n.data.updated ? `Updated ${timeAgo(n.data.updated)}` : '') : ''
    tip.replaceChildren(
      el('b', { text: truncate(n.label, 90) }),
      el('div', { class: 't', html: `${glyph(n.type, 10)}` }, el('span', { text: `${t.one}${extra ? ` · ${extra}` : ''} · ${n.vdeg} link${n.vdeg === 1 ? '' : 's'}` })))
    tip.hidden = false
    tip.dataset.id = n.id
    positionTip()
  }
  function positionTip() {
    const n = S.byId.get(tip.dataset.id)
    if (tip.hidden || !n) return
    const [sx, sy] = toScreen(n)
    const w = tip.offsetWidth, h = tip.offsetHeight
    const x = clamp(sx + n.r * S.view.k, 4, S.W - w - 18)
    const y = clamp(sy + n.r * S.view.k, 4, S.H - h - 18)
    tip.style.left = `${x}px`
    tip.style.top = `${y}px`
  }
  function hideTip() { tip.hidden = true; delete tip.dataset.id }

  // ───────── selection + inspector ─────────
  function select(n, { focus = false, center = false } = {}) {
    S.selected = n
    if (n) { openInspector(n, { focus }); if (center) centerOn(n) } else closeInspector({ restoreFocus: false })
    requestRender()
  }

  /** Select a node by id, revealing it first if filters hide it. */
  function reveal(id) {
    const n = S.byId.get(id)
    if (!n) return
    if (!S.nodes.includes(n)) {
      S.types.add(n.type)
      S.minDeg = 0
      minRange.value = '0'
      minOut.textContent = '0'
      buildTypeChips()
      applyFilters({ reheat: 0.2 })
    }
    select(n, { focus: true, center: true })
  }

  function openNote(n) { ctx.navigate('notes', `id=${encodeURIComponent(n.data.noteId)}`) }
  /** Pages open in a new tab; only web addresses (stored data may be imported, so never trust the scheme). */
  function openPage(url) {
    if (isWeb(url)) ctx.openUrl(url)
    else ctx.toast('Only web pages (http and https) can be opened from the graph.')
  }

  function neighbors(n, type) {
    return [...(S.allAdj.get(n) || new Map()).keys()].filter(m => m.type === type)
  }

  function pageItem(p) {
    const site = p.data.site || ''
    const go = el('button', { type: 'button', class: 'go', title: p.data.url, onclick: () => openPage(p.data.url) },
      el('span', { class: 'gv-av', style: `--h:${hueOf(site)}`, 'aria-hidden': 'true', text: (site || '?').charAt(0).toUpperCase() }),
      el('span', { class: 'tx' }, el('b', { text: p.label }), el('small', { text: [site, p.data.visited ? timeAgo(p.data.visited) : ''].filter(Boolean).join(' · ') })),
      el('span', { html: ICON.open.replace('<svg', '<svg class="ext"') }))
    go.setAttribute('aria-label', `Open ${p.label}`)
    return el('li', { class: 'gv-item' }, go,
      el('button', { type: 'button', class: 'mm-btn ghost icon sm', 'aria-label': `Show ${p.label} in the graph`, title: 'Show in graph', html: ICON.locate, onclick: () => reveal(p.id) }))
  }

  function nodeItem(m) {
    return el('li', { class: 'gv-item' },
      el('button', { type: 'button', class: 'go', onclick: () => reveal(m.id), 'aria-label': `Show ${TYPE[m.type].one.toLowerCase()} ${m.label}` },
        el('span', { html: glyph(m.type, 12), style: 'display:grid;width:26px;place-items:center' }),
        el('span', { class: 'tx' }, el('b', { text: m.label }), el('small', { text: m.type === 'note' && m.data.updated ? `Note · updated ${timeAgo(m.data.updated)}` : TYPE[m.type].one }))))
  }

  function chips(list) {
    return el('div', { class: 'gv-chips' }, ...list.map(m => el('button', {
      type: 'button', class: 'mm-chip', title: `Show ${m.label}`, onclick: () => reveal(m.id),
    }, el('span', { html: glyph(m.type, 9), style: 'display:grid' }), el('span', { text: truncate(m.label, 36) }))))
  }

  const section = (title, count, content) => el('section', { class: 'gv-sec' }, el('h3', {}, el('span', { text: title }), count != null ? el('span', { text: String(count) }) : null), content)
  const byRecent = (a, b) => (b.data.visited || b.data.updated || 0) - (a.data.visited || a.data.updated || 0)

  function openInspector(n, { focus = false } = {}) {
    const t = TYPE[n.type]
    const closeBtn = el('button', { type: 'button', class: 'mm-btn ghost icon sm', 'aria-label': 'Close details', html: ICON.close, onclick: () => closeInspector() })
    const b = el('div', { class: 'gv-insp-b' })
    const panel = el('aside', { class: 'gv-insp', tabindex: '-1', role: 'region', 'aria-label': `${t.one} details: ${n.label}`, style: `--c:${t.color}`, 'data-id': n.id },
      el('div', { class: 'gv-insp-h' }, el('span', { class: 'k', html: glyph(n.type, 11) }, el('span', { text: n.type === 'entity' && n.data.kind && n.data.kind !== 'other' ? `${t.one} · ${n.data.kind}` : t.one })), el('span', { class: 'sp' }), closeBtn),
      b)
    panel.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); closeInspector() } })
    b.append(el('h2', { text: n.label }))

    if (n.type === 'page') {
      const d = n.data
      const meta = el('div', { class: 'meta' })
      if (d.site) meta.append(el('span', { text: d.site }))
      if (d.visited) meta.append(el('span', { text: `Visited ${new Date(d.visited).toLocaleDateString(undefined, { dateStyle: 'medium' })}`, title: new Date(d.visited).toLocaleString() }))
      if (d.readingMin) meta.append(el('span', { text: `${d.readingMin} min read` }))
      if (d.highlights) meta.append(el('span', { text: `${d.highlights} highlight${d.highlights === 1 ? '' : 's'}` }))
      if (d.stub) meta.append(el('span', { text: 'Cited in your notes' }))
      b.append(meta)
      if (d.summary) b.append(el('p', { class: 'summary', text: plainExcerpt(d.summary, 320) }))
      b.append(el('div', { class: 'acts' },
        el('button', { type: 'button', class: 'mm-btn primary sm', html: ICON.open, onclick: () => openPage(d.url) }, 'Open page'),
        el('button', { type: 'button', class: 'mm-btn sm', html: ICON.locate, onclick: () => centerOn(n, { minK: 1.2 }) }, 'Center')))
      const topics = neighbors(n, 'topic')
      const ents = neighbors(n, 'entity')
      const notes = neighbors(n, 'note')
      const related = neighbors(n, 'page').sort(byRecent)
      if (topics.length) b.append(section('Topics', topics.length, chips(topics)))
      if (ents.length) b.append(section('Entities', ents.length, chips(ents)))
      if (notes.length) b.append(section('Notes', notes.length, el('ul', { class: 'gv-list' }, ...notes.sort(byRecent).map(nodeItem))))
      if (related.length) b.append(section('Related pages', related.length, el('ul', { class: 'gv-list' }, ...related.slice(0, 30).map(pageItem))))
      if (!topics.length && !ents.length) b.append(el('p', { class: 'mm-small mm-muted', style: 'margin:0', text: 'Brief this page from the side panel to add its topics and entities.' }))
    } else if (n.type === 'entity' || n.type === 'topic' || n.type === 'site') {
      const pages = neighbors(n, 'page').sort(byRecent)
      const notes = neighbors(n, 'note').sort(byRecent)
      b.append(el('div', { class: 'meta' }, el('span', { text: `${pages.length} page${pages.length === 1 ? '' : 's'}${notes.length ? ` · ${notes.length} note${notes.length === 1 ? '' : 's'}` : ''}` })))
      b.append(section('Connected pages', pages.length, pages.length ? el('ul', { class: 'gv-list' }, ...pages.slice(0, 60).map(pageItem)) : el('p', { class: 'mm-small mm-muted', style: 'margin:0', text: 'No pages yet.' })))
      if (pages.length > 60) b.append(el('p', { class: 'mm-small mm-muted', style: 'margin:0', text: `and ${pages.length - 60} more` }))
      if (notes.length) b.append(section('Notes', notes.length, el('ul', { class: 'gv-list' }, ...notes.map(nodeItem))))
      if (n.type === 'entity') {
        const topics = new Map()
        for (const p of pages) for (const tp of neighbors(p, 'topic')) topics.set(tp, (topics.get(tp) || 0) + 1)
        const top = [...topics.entries()].sort((a, c) => c[1] - a[1]).slice(0, 8).map(x => x[0])
        if (top.length) b.append(section('Appears with topics', null, chips(top)))
      }
    } else if (n.type === 'note') {
      const d = n.data
      const meta = el('div', { class: 'meta' })
      if (d.updated) meta.append(el('span', { text: `Updated ${timeAgo(d.updated)}`, title: new Date(d.updated).toLocaleString() }))
      if (d.pinned) meta.append(el('span', { text: 'Pinned' }))
      b.append(meta)
      if (d.tags.length) b.append(el('div', { class: 'gv-tags' }, ...d.tags.slice(0, 12).map(tag => el('span', { class: 'mm-badge', text: `#${tag}` }))))
      if (d.excerpt) b.append(el('p', { class: 'summary', text: d.excerpt }))
      b.append(el('div', { class: 'acts' },
        el('button', { type: 'button', class: 'mm-btn primary sm', html: ICON.note, onclick: () => openNote(n) }, 'Open in Notes'),
        el('button', { type: 'button', class: 'mm-btn sm', html: ICON.locate, onclick: () => centerOn(n, { minK: 1.2 }) }, 'Center')))
      const pages = neighbors(n, 'page').sort(byRecent)
      const notes = neighbors(n, 'note').sort(byRecent)
      const ideas = [...neighbors(n, 'entity'), ...neighbors(n, 'topic')]
      if (pages.length) b.append(section('Sources', pages.length, el('ul', { class: 'gv-list' }, ...pages.map(pageItem))))
      if (notes.length) b.append(section('Linked notes', notes.length, el('ul', { class: 'gv-list' }, ...notes.map(nodeItem))))
      if (ideas.length) b.append(section('Linked ideas', ideas.length, chips(ideas)))
    }

    const hadFocus = inspector?.contains(document.activeElement)
    inspector?.remove()
    inspector = panel
    stage.append(panel)
    stage.classList.add('insp')
    if (focus || hadFocus) panel.focus({ preventScroll: true })
  }

  function closeInspector({ restoreFocus = true } = {}) {
    if (!inspector) { S.selected = null; return }
    const had = inspector.contains(document.activeElement)
    inspector.remove()
    inspector = null
    stage.classList.remove('insp')
    S.selected = null
    if (restoreFocus || had) canvas.focus({ preventScroll: true })
    requestRender()
  }

  // ───────── search ─────────
  function runSearch({ focus = true } = {}) {
    const q = S.query.toLowerCase()
    const terms = q.split(/\s+/).filter(Boolean)
    found.classList.remove('none')
    if (!terms.length) { S.matches = null; S.best = null; found.textContent = ''; requestRender(); return }
    const matches = new Set()
    let best = null, bestScore = -1
    for (const n of S.nodes) {
      if (!terms.every(t => n.search.includes(t))) continue
      matches.add(n)
      const label = n.label.toLowerCase()
      const score = (label === q ? 100 : label.startsWith(q) ? 60 : label.includes(q) ? 30 : 0) + Math.min(20, n.vdeg)
      if (score > bestScore) { best = n; bestScore = score }
    }
    if (!matches.size) {
      S.matches = null
      S.best = null
      found.textContent = 'No matches'
      found.classList.add('none')
      requestRender()
      return
    }
    S.matches = matches
    S.best = best
    found.textContent = `${matches.size} match${matches.size === 1 ? '' : 'es'}`
    if (focus && best) centerOn(best, { minK: Math.min(1, S.view.k) })
    requestRender()
  }
  let searchTimer = 0
  search.addEventListener('input', () => {
    clearTimeout(searchTimer)
    searchTimer = later(() => { S.query = search.value.trim(); runSearch() }, 180)
  })
  search.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault()
      clearTimeout(searchTimer)
      S.query = search.value.trim()
      runSearch()
      if (S.best) select(S.best, { center: true })
    } else if (e.key === 'Escape' && search.value) {
      e.preventDefault()
      search.value = ''
      S.query = ''
      runSearch()
    }
  })

  // ───────── controls ─────────
  minRange.addEventListener('input', () => {
    S.minDeg = Number(minRange.value)
    minOut.textContent = S.minDeg ? `≥${S.minDeg}` : '0'
    applyFilters({ reheat: 0.2 })
  })
  physics.addEventListener('change', () => setPhysics(physics.checked))
  function setPhysics(on) {
    S.physics = on
    physics.checked = on
    if (on) layout.start(0.3)
    else { layout.stop(); saveLayoutSoon(300) }
    requestRender()
  }
  relayoutBtn.addEventListener('click', relayout)
  function relayout() {
    layout.stop()
    for (const n of S.all.nodes) { n.fx = null; n.fy = null; n.x = undefined; n.y = undefined; n.vx = 0; n.vy = 0 }
    layout.setGraph(S.nodes, S.links)
    layout.alpha = 1
    S.physics = true
    physics.checked = true
    warmUp()
    layout.start()
    S.userMoved = false
    S.autoFit = true
    fit({ animate: false })
    S.layoutDirty = true
    ctx.toast('Layout reset: every node unpinned')
    requestRender()
  }
  fitBtn.addEventListener('click', () => fit())
  zoomFit.addEventListener('click', () => fit())
  zoomIn.addEventListener('click', () => { zoomAt(S.W / 2, S.H / 2, 1.35); S.userMoved = true })
  zoomOut.addEventListener('click', () => { zoomAt(S.W / 2, S.H / 2, 1 / 1.35); S.userMoved = true })

  // ───────── persistence ─────────
  let saveTimer = 0
  function saveLayoutSoon(ms = 900) {
    S.layoutDirty = true
    clearTimeout(saveTimer)
    saveTimer = later(saveLayout, ms)
  }
  async function saveLayout() {
    if (!S.layoutDirty || !S.all.nodes.length) return
    S.layoutDirty = false
    const nodes = {}
    for (const n of S.all.nodes) {
      if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) continue
      nodes[n.id] = [Math.round(n.x * 10) / 10, Math.round(n.y * 10) / 10, n.fx != null ? 1 : 0]
    }
    try { await ctx.db.put('kv', { k: LAYOUT_KEY, v: { version: 1, saved: Date.now(), nodes } }) } catch (e) { console.warn('[Master Mind graph] layout not saved', e) }
  }

  // ───────── exports ─────────
  exports.addEventListener('click', e => {
    const fmt = e.target.closest('[data-export]')?.dataset.export
    if (!fmt) return
    if (!S.nodes.length) return ctx.toast('Nothing to export: the graph is empty or filtered out.')
    try {
      if (fmt === 'svg') exportSvg()
      else if (fmt === 'png') exportPng()
      else if (fmt === 'mermaid') exportMermaid()
    } catch (err) {
      ctx.toast(`Export failed: ${err?.message || err}`)
    }
  })

  function exportFrame() {
    const b = bounds(S.nodes)
    const pad = 70
    return { x0: b.x0 - pad, y0: b.y0 - pad, w: Math.ceil(b.w + pad * 2), h: Math.ceil(b.h + pad * 2) }
  }

  function exportSvg() {
    const fr = exportFrame()
    const view = { x: -fr.x0, y: -fr.y0, k: 1 }
    const f = n => n.toFixed(1)
    const out = []
    out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fr.w} ${fr.h}" width="${fr.w}" height="${fr.h}" font-family="Inter, ui-sans-serif, system-ui, sans-serif">`)
    out.push(`<title>Master Mind knowledge graph</title><desc>${S.nodes.length} nodes and ${S.links.length} links, exported ${esc(new Date().toLocaleString())}</desc>`)
    out.push('<defs><style>')
    out.push('.bg{fill:#0B0C10}.l{fill:none;stroke-linecap:round;stroke-width:1}')
    for (const [type, st] of Object.entries(LINKS)) out.push(`.l-${type}{stroke:${st.stroke}${st.dash ? `;stroke-dasharray:${st.dash.join(' ')}` : ''}${type === 'wiki' ? ';stroke-width:1.3' : ''}}`)
    for (const t of ORDER) out.push(`.n-${t}{fill:${t === 'entity' ? '#0D0F15' : TYPE[t].color}${t === 'entity' ? `;stroke:${TYPE[t].color}` : ''}}`)
    out.push('.pin{fill:#F7F8FC}.lbl{font-size:11.5px;font-weight:600;fill:#ECEFF7;text-anchor:middle;dominant-baseline:central;paint-order:stroke;stroke:#090A0E;stroke-width:3.5px;stroke-linejoin:round}.lbl.e{fill:#B6BCCC}')
    out.push('</style>')
    for (const t of ORDER) out.push(`<radialGradient id="glow-${t}"><stop offset="0" stop-color="${TYPE[t].color}" stop-opacity=".55"/><stop offset=".35" stop-color="${TYPE[t].color}" stop-opacity=".22"/><stop offset="1" stop-color="${TYPE[t].color}" stop-opacity="0"/></radialGradient>`)
    out.push('<radialGradient id="bg1" cx=".25" cy=".2" r=".7"><stop offset="0" stop-color="#22D3EE" stop-opacity=".07"/><stop offset="1" stop-color="#22D3EE" stop-opacity="0"/></radialGradient>')
    out.push('</defs>')
    out.push(`<rect class="bg" width="${fr.w}" height="${fr.h}"/><rect width="${fr.w}" height="${fr.h}" fill="url(#bg1)"/>`)
    out.push(`<g transform="translate(${f(-fr.x0)} ${f(-fr.y0)})">`)
    out.push('<g class="links">')
    for (const l of S.links) out.push(`<line class="l l-${l.type}" x1="${f(l.source.x)}" y1="${f(l.source.y)}" x2="${f(l.target.x)}" y2="${f(l.target.y)}"/>`)
    out.push('</g><g class="nodes">')
    for (const n of S.nodes) {
      const R = n.r * 2.4
      out.push(`<g class="node ${n.type}"><title>${esc(`${TYPE[n.type].one}: ${n.label}`)}</title>`)
      out.push(`<circle cx="${f(n.x)}" cy="${f(n.y)}" r="${f(R)}" fill="url(#glow-${n.type})"/>`)
      let shape = svgShape(n.type, n.x, n.y, n.r, `n-${n.type}`)
      if (n.type === 'entity') shape = shape.replace('/>', ` stroke-width="${f(Math.max(1.6, n.r * 0.42))}"/>`)
      out.push(shape)
      if (n.fx != null) out.push(`<circle class="pin" cx="${f(n.x + n.r * 0.78)}" cy="${f(n.y - n.r * 0.78)}" r="${f(Math.max(1.6, n.r * 0.24))}"/>`)
      out.push('</g>')
    }
    out.push('</g></g><g class="labels">')
    const all = () => true
    for (const L of placeLabels(view, fr.w, fr.h, { interactive: false, focus: null, nb: null, matches: null, dimmed: () => false, visible: all })) {
      out.push(`<text class="lbl${L.faint ? ' e' : ''}" x="${f(L.x)}" y="${f(L.y)}">${esc(L.text)}</text>`)
    }
    out.push('</g></svg>')
    download(`knowledge-graph-${today()}.svg`, out.join('\n'), 'image/svg+xml')
    ctx.toast('Exported SVG')
  }

  function exportPng() {
    const fr = exportFrame()
    const MAX_SIDE = 8192, MAX_AREA = 36e6
    let scale = 2
    scale = Math.min(scale, MAX_SIDE / fr.w, MAX_SIDE / fr.h, Math.sqrt(MAX_AREA / (fr.w * fr.h)))
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(fr.w * scale))
    c.height = Math.max(1, Math.round(fr.h * scale))
    const g = c.getContext('2d')
    paint(g, { width: fr.w, height: fr.h, scale, view: { x: -fr.x0, y: -fr.y0, k: 1 }, interactive: false })
    c.toBlob(blob => {
      if (!blob) return ctx.toast('PNG export failed: the graph is too large to rasterize.')
      download(`knowledge-graph-${today()}.png`, blob)
      ctx.toast(scale < 2 ? `Exported PNG (scaled to ${scale.toFixed(2)}× to fit)` : 'Exported PNG (2×)')
    }, 'image/png')
  }

  function exportMermaid() {
    const ids = new Map(S.nodes.map((n, i) => [n, `n${i}`]))
    const shape = (n, label) => ({
      page: `["${label}"]`,
      entity: `(["${label}"])`,
      topic: `{{"${label}"}}`,
      note: `[/"${label}"/]`,
      site: `[("${label}")]`,
    }[n.type])
    const lines = [`%% Master Mind knowledge graph: ${S.nodes.length} nodes, ${S.links.length} links (${today()})`, 'graph LR']
    for (const n of S.nodes) lines.push(`  ${ids.get(n)}${shape(n, mermaidLabel(truncate(n.label, 80)))}`)
    for (const l of S.links) {
      const a = ids.get(l.source), b = ids.get(l.target)
      const arrow = l.type === 'related' ? '-.-' : l.type === 'cites' || l.type === 'wiki' ? '-->' : '---'
      lines.push(`  ${a} ${arrow} ${b}`)
    }
    const fills = { page: '#0B2530', entity: '#1C1730', topic: '#1B2610', note: '#2B220C', site: '#2A1222' }
    for (const t of ORDER) {
      const members = S.nodes.filter(n => n.type === t).map(n => ids.get(n))
      if (!members.length) continue
      lines.push(`  classDef ${t} fill:${fills[t]},stroke:${TYPE[t].color},color:#ECEFF7,stroke-width:1.5px`)
      for (let i = 0; i < members.length; i += 200) lines.push(`  class ${members.slice(i, i + 200).join(',')} ${t}`)
    }
    download(`knowledge-graph-${today()}.mmd`, `${lines.join('\n')}\n`, 'text/plain')
    ctx.toast('Exported Mermaid diagram')
  }

  // ───────── live updates ─────────
  let reloadTimer = 0
  const offDb = ctx.onDbChange(evt => {
    if (!['pages', 'notes', 'highlights'].includes(evt?.store)) return
    clearTimeout(reloadTimer)
    reloadTimer = later(load, 600)
  })
  cleanups.push(offDb)

  // Canvas text uses Inter: repaint once the font is ready so labels measure correctly.
  document.fonts?.load(LABEL_FONT).then(() => { widthCache.clear(); requestRender() }).catch(() => {})

  // Inspection hook for automated tests and devtools (read-only snapshot).
  Object.defineProperty(root, '__mmGraph', {
    configurable: true,
    value: {
      snapshot: () => ({
        view: { ...S.view },
        hot: S.physics && layout.hot,
        selected: S.selected?.id || null,
        best: S.best?.id || null,
        matches: S.matches?.size || 0,
        physics: S.physics,
        nodes: S.nodes.map(n => { const [sx, sy] = toScreen(n); return { id: n.id, type: n.type, label: n.label, x: n.x, y: n.y, r: n.r, sx, sy, pinned: n.fx != null, links: n.vdeg } }),
        links: S.links.length,
      }),
    },
  })

  body.replaceChildren(el('div', { class: 'mm-skeleton gv-skel', 'aria-label': 'Loading knowledge graph', 'aria-busy': 'true' }))
  load()

  return {
    unmount() {
      alive = false
      layout.destroy()
      if (raf) cancelAnimationFrame(raf)
      raf = 0
      for (const t of timers) clearTimeout(t)
      timers.clear()
      for (const fn of cleanups) { try { fn() } catch { /* ignore */ } }
      if (S.layoutDirty) saveLayout()
      delete root.__mmGraph
    },
  }
}
