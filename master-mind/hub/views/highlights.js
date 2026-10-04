// Smart Highlight Hub: every highlight across the web, searchable, filterable, grouped by page.
// Reads IndexedDB directly; every mutation goes through the background (HL_SAVE / HL_DELETE) so open tabs update.
import { download, normalizeUrl, timeAgo } from '../../lib/text.js'
import { DEFAULT_TAGS, onSettings } from '../../lib/store.js'

const DAY = 864e5
const PAGE = 200
const FALLBACK = '#94A3B8'

const ICON = {
  search: '<svg class="mm-icon" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  open: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/></svg>',
  note: '<svg viewBox="0 0 24 24"><path d="M4 4h12l4 4v12H4zM8 10h8M8 14h8M8 18h5"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  pin: '<svg viewBox="0 0 24 24"><path d="M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/></svg>',
  caret: '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12l5 5L20 7"/></svg>',
  download: '<svg viewBox="0 0 24 24"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
  hl: '<svg viewBox="0 0 24 24"><path d="M9 11l-6 6v3h3l6-6M22 3l-9 9-3-3 9-9z"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
}

const STYLES = `
.hlv{display:flex;flex-direction:column;gap:16px;max-width:1120px}
.hlv .view-head{margin-bottom:0;align-items:flex-end}
.hlv-sub{margin:5px 0 0}
.hlv-export{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.hlv-export .lbl{font:600 11px/1 var(--mm-font);letter-spacing:.07em;text-transform:uppercase;color:var(--mm-muted);margin-right:4px}
.hlv-stats{display:grid;grid-template-columns:auto auto minmax(0,1fr);align-items:center;gap:28px;padding:16px 20px}
.hlv-stat b{display:block;font-size:28px;font-weight:750;line-height:1;letter-spacing:-.02em;color:var(--mm-heading);font-variant-numeric:tabular-nums}
.hlv-stat span{display:block;margin-top:6px;font:600 11px/1 var(--mm-font);letter-spacing:.08em;text-transform:uppercase;color:var(--mm-muted)}
.hlv-stat + .hlv-stat{padding-left:28px;border-left:1px solid var(--mm-border)}
.hlv-dist{display:flex;flex-direction:column;gap:10px;min-width:0;padding-left:28px;border-left:1px solid var(--mm-border)}
.hlv-bar{display:flex;gap:2px;height:8px;border-radius:99px;overflow:hidden;background:rgba(255,255,255,.05)}
.hlv-bar i{display:block;background:var(--c);box-shadow:0 0 10px var(--c);min-width:4px}
.hlv-legend{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:12.5px;color:var(--mm-fg-2)}
.hlv-legend span{display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
.hlv-legend b{color:var(--mm-heading);font-variant-numeric:tabular-nums}
.hlv-tools{display:flex;flex-direction:column;gap:12px}
.hlv-row1{display:grid;grid-template-columns:minmax(0,1fr) 220px 170px;gap:10px}
.hlv-search{position:relative}
.hlv-search .mm-icon{position:absolute;left:11px;top:50%;transform:translateY(-50%);color:var(--mm-muted);pointer-events:none}
.hlv-search input{padding-left:35px;padding-right:40px;height:38px}
.hlv-search kbd{position:absolute;right:10px;top:50%;transform:translateY(-50%);pointer-events:none}
.hlv-search input:not(:placeholder-shown) + kbd{display:none}
.hlv-row1 .mm-select{height:38px}
.hlv-row2{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.hlv-row2 .lbl{font:600 11px/1 var(--mm-font);letter-spacing:.07em;text-transform:uppercase;color:var(--mm-muted);margin-right:2px}
.hlv-tagchip[aria-pressed="true"]{color:var(--mm-heading);background:color-mix(in srgb,var(--c) 18%,transparent);border-color:var(--c);box-shadow:0 0 14px color-mix(in srgb,var(--c) 30%,transparent)}
.hlv-tagchip .n{color:var(--mm-muted);font-weight:600;font-variant-numeric:tabular-nums}
.hlv-tagchip[aria-pressed="true"] .n{color:var(--mm-fg-2)}
.hlv-sp{flex:1}
.hlv-seg{display:inline-flex;gap:2px;padding:3px;border-radius:10px;background:rgba(0,0,0,.3);border:1px solid var(--mm-border)}
.hlv-seg button{font:600 12px/1 var(--mm-font);color:var(--mm-muted);background:none;border:0;border-radius:7px;padding:7px 10px;cursor:pointer;transition:all .15s}
.hlv-seg button:hover{color:var(--mm-fg)}
.hlv-seg button[aria-pressed="true"]{color:var(--mm-heading);background:rgba(255,255,255,.09);box-shadow:inset 0 0 0 1px var(--mm-border-strong)}
.hlv-summary{display:flex;align-items:center;gap:10px;min-height:34px;padding:0 4px;color:var(--mm-muted);font-size:12.5px}
.hlv-summary b{color:var(--mm-fg-2)}
.hlv-summary .mm-btn{margin-left:auto}
.hlv-check{width:16px;height:16px;margin:0;accent-color:var(--mm-accent);cursor:pointer;flex:none}
.hlv-bulk{position:sticky;top:10px;z-index:15;display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:9px 12px;border-color:color-mix(in srgb,var(--mm-accent) 40%,transparent);box-shadow:0 10px 30px rgba(0,0,0,.45),0 0 24px color-mix(in srgb,var(--mm-accent) 12%,transparent);background:var(--mm-glass-strong)}
.hlv-bulk .cnt{font-weight:700;color:var(--mm-heading)}
.hlv-bulk .confirm{color:var(--mm-red);font-weight:600}
.hlv-results{display:flex;flex-direction:column;gap:14px}
.hlv-group{padding:0;overflow:visible}
.hlv-ghead{display:flex;align-items:center;gap:12px;padding:13px 16px;border-bottom:1px solid var(--mm-border);background:rgba(255,255,255,.015);border-radius:var(--mm-radius) var(--mm-radius) 0 0}
.hlv-av{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;flex:none;font:800 14px/1 var(--mm-font);color:#06080D;background:linear-gradient(135deg,hsl(var(--h) 85% 68%),hsl(calc(var(--h) + 45) 80% 62%));box-shadow:0 0 16px hsla(var(--h),85%,60%,.25)}
.hlv-gt{min-width:0;flex:1}
.hlv-gt a{display:block;color:var(--mm-heading);font-weight:650;font-size:14.5px;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hlv-gm{margin-top:3px;font-size:12px;color:var(--mm-muted);display:flex;gap:6px;flex-wrap:wrap}
.hlv-list{list-style:none;margin:0;padding:6px 8px 8px;display:flex;flex-direction:column;gap:2px}
.hlv-card{display:grid;grid-template-columns:18px minmax(0,1fr);gap:12px;padding:12px 10px;border-radius:12px;position:relative;transition:background .15s,box-shadow .2s}
.hlv-card:hover{background:rgba(255,255,255,.025)}
.hlv-card.sel{background:color-mix(in srgb,var(--mm-accent) 7%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--mm-accent) 30%,transparent)}
.hlv-card.flash{animation:hlv-flash 1.4s ease 2}
@keyframes hlv-flash{50%{box-shadow:inset 0 0 0 1px var(--c),0 0 28px color-mix(in srgb,var(--c) 35%,transparent);background:color-mix(in srgb,var(--c) 8%,transparent)}}
.hlv-card > .hlv-check{margin-top:4px}
.hlv-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.hlv-tag{position:relative;display:inline-flex;align-items:center;gap:6px;font:650 12px/1 var(--mm-font);color:var(--mm-heading);background:color-mix(in srgb,var(--c) 13%,transparent);border:1px solid color-mix(in srgb,var(--c) 40%,transparent);border-radius:999px;padding:5px 8px 5px 9px;cursor:pointer;transition:box-shadow .15s}
.hlv-tag:hover{box-shadow:0 0 14px color-mix(in srgb,var(--c) 30%,transparent)}
.hlv-tag svg{width:13px;height:13px;color:var(--mm-fg-2)}
.hlv-time{font-size:12px;color:var(--mm-muted)}
.hlv-quote{margin:8px 0 0;padding:9px 14px;border-left:3px solid var(--c);border-radius:0 10px 10px 0;background:linear-gradient(90deg,color-mix(in srgb,var(--c) 11%,transparent),color-mix(in srgb,var(--c) 3%,transparent));color:var(--mm-fg);font-size:14px;line-height:1.62;white-space:pre-wrap;overflow-wrap:anywhere;box-shadow:-6px 0 14px -10px var(--c)}
.hlv-quote.clamp{display:-webkit-box;-webkit-line-clamp:7;-webkit-box-orient:vertical;overflow:hidden}
.hlv-more-q{margin-top:4px}
.hlv-note{margin-top:9px;display:flex;gap:9px;align-items:flex-start;padding:9px 11px;border-radius:10px;background:rgba(251,191,36,.07);border:1px solid rgba(251,191,36,.22);font-size:13px;line-height:1.55;color:var(--mm-fg);white-space:pre-wrap;overflow-wrap:anywhere}
.hlv-note svg{width:15px;height:15px;flex:none;margin-top:2px;stroke:var(--mm-amber);fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.hlv-editor{margin-top:9px;display:flex;flex-direction:column;gap:8px}
.hlv-editor .mm-textarea{min-height:76px}
.hlv-editor .mm-textarea:focus{border-color:var(--mm-amber);box-shadow:0 0 0 3px rgba(251,191,36,.18);outline:none}
.hlv-editor .row{display:flex;align-items:center;gap:8px;justify-content:flex-end}
.hlv-editor .hint{margin-right:auto;font-size:11.5px;color:var(--mm-muted)}
.hlv-actions{display:flex;flex-wrap:wrap;gap:2px;margin:8px 0 0 -8px;opacity:.72;transition:opacity .15s}
.hlv-card:hover .hlv-actions,.hlv-card:focus-within .hlv-actions{opacity:1}
.hlv-actions .mm-btn{color:var(--mm-fg-2)}
.hlv-actions .mm-btn:hover{color:var(--mm-fg)}
.hlv-actions .mm-btn.del:hover{color:var(--mm-red);background:color-mix(in srgb,var(--mm-red) 10%,transparent)}
.hlv-actions svg{width:14px;height:14px}
.hlv mark.hit{background:color-mix(in srgb,var(--mm-accent) 32%,transparent);color:var(--mm-heading);border-radius:3px;padding:0 1px;box-shadow:0 0 0 1px color-mix(in srgb,var(--mm-accent) 45%,transparent)}
.hlv-menu{position:fixed;z-index:50;min-width:220px;padding:6px;border-radius:12px;background:var(--mm-glass-strong);border:1px solid var(--mm-border-strong);backdrop-filter:var(--mm-blur);-webkit-backdrop-filter:var(--mm-blur);box-shadow:var(--mm-shadow);animation:hlv-in .14s var(--mm-ease)}
@keyframes hlv-in{from{opacity:0;transform:translateY(-4px)}}
.hlv-menu button{display:flex;align-items:center;gap:9px;width:100%;padding:8px 10px;border:0;border-radius:8px;background:none;color:var(--mm-fg);font:600 13px/1.2 var(--mm-font);cursor:pointer;text-align:left}
.hlv-menu button:hover,.hlv-menu button:focus-visible{background:rgba(255,255,255,.07);outline:none}
.hlv-menu button svg{width:14px;height:14px;margin-left:auto;color:var(--mm-accent)}
.hlv-menu button[aria-checked="false"] svg{visibility:hidden}
.hlv-showmore{display:flex;justify-content:center;padding:4px 0 8px}
.hlv-emptybox{padding:46px 20px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:10px}
.hlv-emptybox .ico{width:54px;height:54px;border-radius:16px;display:grid;place-items:center;color:#06080D;background:var(--mm-gradient);box-shadow:0 0 30px color-mix(in srgb,var(--mm-accent) 35%,transparent)}
.hlv-emptybox .ico svg{width:26px;height:26px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.hlv-emptybox h2{font-size:17px}
.hlv-emptybox p{margin:0;max-width:460px;color:var(--mm-muted);line-height:1.6}
.hlv-skel{display:flex;flex-direction:column;gap:12px;padding:16px}
.hlv-undo{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:60;display:flex;align-items:center;gap:14px;padding:7px 7px 7px 16px;border-radius:12px;background:var(--mm-glass-strong);border:1px solid var(--mm-border-strong);backdrop-filter:var(--mm-blur);-webkit-backdrop-filter:var(--mm-blur);box-shadow:var(--mm-shadow);font:600 13px/1.2 var(--mm-font);animation:hlv-up .2s var(--mm-ease)}
@keyframes hlv-up{from{opacity:0;transform:translate(-50%,8px)}}
.hlv-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@media (max-width:900px){.hlv-row1{grid-template-columns:1fr 1fr}.hlv-search{grid-column:1 / -1}.hlv-stats{grid-template-columns:auto auto;gap:18px}.hlv-dist{grid-column:1 / -1;padding-left:0;border-left:0}}
@media (prefers-reduced-motion:reduce){.hlv-card.flash{animation:none;box-shadow:inset 0 0 0 2px var(--c)}}
`

// ───────── helpers ─────────
/** Element builder. `html` is only ever passed constant icon markup from ICON. */
function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue
    if (k === 'class') el.className = v
    else if (k === 'text') el.textContent = v
    else if (k === 'html') el.innerHTML = v
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v)
    else el.setAttribute(k, v === true ? '' : String(v))
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : String(c))
  return el
}
const iconBtn = (icon, label, props = {}) => {
  const b = h('button', { type: 'button', class: 'mm-btn ghost sm', ...props, html: icon })
  b.append(label)
  return b
}
const safeColor = c => (typeof c === 'string' && CSS.supports('color', c) ? c : FALLBACK)
const fmtDate = ts => new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
const fmtWhen = ts => (Date.now() - ts < 7 * DAY ? timeAgo(ts) : fmtDate(ts))
const isoDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() }
const hueOf = s => { let x = 0; for (const c of String(s)) x = (x * 31 + c.codePointAt(0)) >>> 0; return x % 360 }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const send = msg => chrome.runtime.sendMessage(msg).catch(e => ({ ok: false, error: e?.message || String(e) }))

/** Append `text` to `el`, wrapping case-insensitive matches of `terms` in <mark class="hit"> (DOM only, no HTML). */
function markText(el, text, terms) {
  text = String(text ?? '')
  if (!terms.length || !text) { el.append(text); return el }
  const lower = text.toLowerCase()
  const ranges = []
  if (lower.length === text.length) {
    for (const t of terms) for (let i = lower.indexOf(t); i >= 0; i = lower.indexOf(t, i + t.length)) ranges.push([i, i + t.length])
  }
  ranges.sort((a, b) => a[0] - b[0])
  let pos = 0
  for (const [s, e] of ranges) {
    if (e <= pos) continue
    const from = Math.max(s, pos)
    if (from > pos) el.append(text.slice(pos, from))
    el.append(h('mark', { class: 'hit', text: text.slice(from, e) }))
    pos = e
  }
  if (pos < text.length) el.append(text.slice(pos))
  return el
}

// Markdown / CSV helpers for exports.
const mdText = s => String(s ?? '').replace(/([\\`*_[\]<>#|])/g, '\\$1')
const mdUrl = u => String(u ?? '').replace(/[()\s<>]/g, c => encodeURIComponent(c))
// hard line breaks (two trailing spaces) keep multi-line quotes and code on separate lines
const mdQuote = s => String(s ?? '').split('\n').map(l => `> ${l}`.trimEnd()).join('  \n')
function csvCell(v) {
  let s = String(v ?? '')
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}` // keep spreadsheets from evaluating formulas
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function mount(root, ctx) {
  const state = {
    all: [], loaded: false, error: '',
    q: ctx.params.get('q') || '', site: '', tags: new Set(), date: 'all', sort: 'newest',
    selected: new Set(), limit: PAGE, editing: null, pendingReload: false, lastClicked: null,
    focusId: ctx.params.get('id') || '', expanded: new Set(), confirmBulk: false,
  }
  let tags = (ctx.settings?.tags?.length ? ctx.settings.tags : DEFAULT_TAGS)
  const cleanup = []
  let dead = false
  cleanup.push(() => { dead = true })
  const hayCache = new WeakMap()
  let lastVisible = []

  const tagInfo = id => {
    const t = tags.find(x => x.id === id)
    return t ? { id, name: String(t.name || id), color: safeColor(t.color) } : { id, name: id || 'Untagged', color: FALLBACK }
  }
  const terms = () => state.q.toLowerCase().split(/\s+/).filter(Boolean)

  // ───────── skeleton ─────────
  const style = h('style', { text: STYLES })
  const exportLbl = h('span', { class: 'lbl', text: 'Export' })
  const expMd = iconBtn(ICON.download, 'Markdown', { class: 'mm-btn sm', 'data-fk': 'exp-md' })
  const expJson = iconBtn(ICON.download, 'JSON', { class: 'mm-btn sm', 'data-fk': 'exp-json' })
  const expCsv = iconBtn(ICON.download, 'CSV', { class: 'mm-btn sm', 'data-fk': 'exp-csv' })
  expMd.addEventListener('click', () => exportAs('md'))
  expJson.addEventListener('click', () => exportAs('json'))
  expCsv.addEventListener('click', () => exportAs('csv'))
  const head = h('div', { class: 'view-head' },
    h('div', {}, h('h1', { text: 'Highlights' }), h('p', { class: 'hlv-sub mm-muted mm-small', text: 'Everything you’ve marked across the web, color-coded and searchable.' })),
    h('div', { class: 'hlv-export', role: 'group', 'aria-label': 'Export highlights' }, exportLbl, expMd, expJson, expCsv))

  const stats = h('section', { class: 'hlv-stats mm-card', 'aria-label': 'Highlight statistics' })

  const search = h('input', { class: 'mm-input', type: 'search', placeholder: 'Search quotes, notes, page titles and sites…', 'aria-label': 'Search highlights', autocomplete: 'off', spellcheck: 'false' })
  search.value = state.q
  const siteSel = h('select', { class: 'mm-select', 'aria-label': 'Filter by site' })
  const sortSel = h('select', { class: 'mm-select', 'aria-label': 'Sort' },
    h('option', { value: 'newest', text: 'Newest first' }), h('option', { value: 'oldest', text: 'Oldest first' }), h('option', { value: 'site', text: 'By site (A–Z)' }))
  const tagRow = h('div', { class: 'mm-row wrap', role: 'group', 'aria-label': 'Filter by tag', style: 'gap:6px' })
  const dateSeg = h('div', { class: 'hlv-seg', role: 'group', 'aria-label': 'Filter by date' })
  for (const [v, label] of [['today', 'Today'], ['7', '7 days'], ['30', '30 days'], ['all', 'All']]) {
    const b = h('button', { type: 'button', 'data-v': v, 'aria-pressed': String(state.date === v), text: label })
    b.addEventListener('click', () => { state.date = v; syncSeg(); state.limit = PAGE; renderResults() })
    dateSeg.append(b)
  }
  const clearBtn = h('button', { type: 'button', class: 'mm-btn ghost sm', text: 'Clear filters', 'data-fk': 'clear-filters' })
  clearBtn.addEventListener('click', () => {
    state.q = ''; search.value = ''; state.site = ''; state.tags.clear(); state.date = 'all'; state.limit = PAGE
    syncSeg(); renderFilters(); renderResults(); search.focus()
  })
  const tools = h('section', { class: 'hlv-tools mm-card', 'aria-label': 'Search and filters' },
    h('div', { class: 'hlv-row1' },
      h('div', { class: 'hlv-search', html: ICON.search }, search, h('kbd', { text: '/' })),
      siteSel, sortSel),
    h('div', { class: 'hlv-row2' }, h('span', { class: 'lbl', text: 'Tags' }), tagRow, h('span', { class: 'hlv-sp' }), dateSeg))

  const bulk = h('div', { class: 'hlv-bulk mm-card', role: 'region', 'aria-label': 'Selection actions', hidden: true })
  const summary = h('div', { class: 'hlv-summary', role: 'status', 'aria-live': 'polite' })
  const results = h('div', { class: 'hlv-results' })
  const more = h('div', { class: 'hlv-showmore' })
  const body = h('div', { class: 'hlv' }, head, stats, tools, bulk, summary, results, more)
  root.replaceChildren(style, body)

  const syncSeg = () => { for (const b of dateSeg.children) b.setAttribute('aria-pressed', String(b.dataset.v === state.date)) }

  const onSearch = debounce(() => { state.q = search.value.trim(); state.limit = PAGE; renderResults() }, 160)
  search.addEventListener('input', onSearch)
  search.addEventListener('keydown', e => { if (e.key === 'Escape' && search.value) { e.preventDefault(); search.value = ''; onSearch() } })
  siteSel.addEventListener('change', () => { state.site = siteSel.value; state.limit = PAGE; renderResults() })
  sortSel.addEventListener('change', () => { state.sort = sortSel.value; renderResults() })

  // "/" focuses search (unless typing somewhere already).
  const onKey = e => {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return
    const a = document.activeElement
    if (a && (a.isContentEditable || /^(input|textarea|select)$/i.test(a.tagName))) return
    e.preventDefault()
    search.focus()
    search.select()
  }
  document.addEventListener('keydown', onKey)
  cleanup.push(() => document.removeEventListener('keydown', onKey))

  // ───────── data ─────────
  async function load() {
    if (dead) return
    try {
      const list = await ctx.db.all('highlights')
      state.all = list.filter(r => r && r.id && typeof r.text === 'string')
      state.error = ''
    } catch (e) {
      state.error = e?.message || String(e)
    }
    if (dead) return
    state.loaded = true
    for (const id of [...state.selected]) if (!state.all.some(r => r.id === id)) state.selected.delete(id)
    renderAll()
  }

  const reload = debounce(() => {
    if (state.editing) { state.pendingReload = true; return }
    load()
  }, 220)
  cleanup.push(ctx.onDbChange(evt => { if (evt?.store === 'highlights') reload() }))
  cleanup.push(onSettings(s => { tags = s.tags?.length ? s.tags : DEFAULT_TAGS; if (state.loaded) renderAll() }))

  function hay(r) {
    let s = hayCache.get(r)
    if (!s) { s = `${r.text}\n${r.note || ''}\n${r.title || ''}\n${r.site || ''}`.toLowerCase(); hayCache.set(r, s) }
    return s
  }

  function filtered() {
    const t = terms()
    const since = state.date === 'today' ? startOfToday() : state.date === 'all' ? 0 : Date.now() - Number(state.date) * DAY
    return state.all.filter(r => (!state.site || r.site === state.site)
      && (!state.tags.size || state.tags.has(r.tag))
      && (!since || (r.created || 0) >= since)
      && (!t.length || t.every(x => hay(r).includes(x))))
  }

  function grouped(list) {
    const map = new Map()
    for (const r of list) {
      const key = r.pageKey || normalizeUrl(r.url)
      let g = map.get(key)
      if (!g) { g = { key, items: [], latest: 0, earliest: Infinity, title: r.title, url: r.url, site: r.site }; map.set(key, g) }
      g.items.push(r)
      if ((r.created || 0) >= g.latest) { g.latest = r.created || 0; g.title = r.title || g.title; g.url = r.url || g.url; g.site = r.site || g.site }
      g.earliest = Math.min(g.earliest, r.created || 0)
    }
    const groups = [...map.values()]
    const desc = (a, b) => (b.created || 0) - (a.created || 0)
    const asc = (a, b) => (a.created || 0) - (b.created || 0)
    if (state.sort === 'oldest') { groups.sort((a, b) => a.earliest - b.earliest); groups.forEach(g => g.items.sort(asc)) }
    else if (state.sort === 'site') { groups.sort((a, b) => (a.site || '').localeCompare(b.site || '') || (a.title || '').localeCompare(b.title || '')); groups.forEach(g => g.items.sort(desc)) }
    else { groups.sort((a, b) => b.latest - a.latest); groups.forEach(g => g.items.sort(desc)) }
    return groups
  }

  // ───────── rendering ─────────
  function renderAll() {
    renderStats()
    renderFilters()
    renderResults()
  }

  function renderStats() {
    const all = state.all
    const pages = new Set(all.map(r => r.pageKey)).size
    const counts = new Map()
    for (const r of all) counts.set(r.tag, (counts.get(r.tag) || 0) + 1)
    const order = [...tags.map(t => t.id).filter(id => counts.has(id)), ...[...counts.keys()].filter(id => !tags.some(t => t.id === id))]
    const bar = h('div', { class: 'hlv-bar', role: 'img', 'aria-label': order.map(id => `${tagInfo(id).name}: ${counts.get(id)}`).join(', ') || 'No highlights yet' })
    const legend = h('div', { class: 'hlv-legend' })
    for (const id of order) {
      const t = tagInfo(id)
      const n = counts.get(id)
      bar.append(h('i', { style: `--c:${t.color};flex:${n} 1 0` }))
      legend.append(h('span', {}, h('span', { class: 'mm-dot', style: `--c:${t.color}` }), t.name, h('b', { text: String(n) })))
    }
    if (!order.length) legend.append(h('span', { class: 'mm-muted', text: 'Per-tag counts appear here once you start highlighting.' }))
    stats.replaceChildren(
      h('div', { class: 'hlv-stat' }, h('b', { text: all.length.toLocaleString(), 'data-stat': 'total' }), h('span', { text: all.length === 1 ? 'Highlight' : 'Highlights' })),
      h('div', { class: 'hlv-stat' }, h('b', { text: pages.toLocaleString(), 'data-stat': 'pages' }), h('span', { text: pages === 1 ? 'Page' : 'Pages' })),
      h('div', { class: 'hlv-dist' }, bar, legend))
  }

  function renderFilters() {
    // sites, most-highlighted first
    const siteCounts = new Map()
    for (const r of state.all) if (r.site) siteCounts.set(r.site, (siteCounts.get(r.site) || 0) + 1)
    if (state.site && !siteCounts.has(state.site)) state.site = ''
    const sites = [...siteCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    siteSel.replaceChildren(h('option', { value: '', text: `All sites (${siteCounts.size})` }), ...sites.map(([s, n]) => h('option', { value: s, text: `${s} · ${n}` })))
    siteSel.value = state.site
    // tag chips: configured tags, plus any unknown tag ids found in data
    const counts = new Map()
    for (const r of state.all) counts.set(r.tag, (counts.get(r.tag) || 0) + 1)
    const ids = [...tags.map(t => t.id), ...[...counts.keys()].filter(id => !tags.some(t => t.id === id))]
    for (const id of [...state.tags]) if (!ids.includes(id)) state.tags.delete(id)
    tagRow.replaceChildren(...ids.map(id => {
      const t = tagInfo(id)
      const b = h('button', { type: 'button', class: 'mm-chip hlv-tagchip', 'aria-pressed': String(state.tags.has(id)), style: `--c:${t.color}`, 'data-tag': id },
        h('span', { class: 'mm-dot', style: `--c:${t.color}` }), t.name, h('span', { class: 'n', text: String(counts.get(id) || 0) }))
      b.addEventListener('click', () => {
        state.tags.has(id) ? state.tags.delete(id) : state.tags.add(id)
        b.setAttribute('aria-pressed', String(state.tags.has(id)))
        state.limit = PAGE
        renderResults()
      })
      return b
    }))
  }

  function renderResults() {
    const ae = document.activeElement
    const focusKey = ae && body.contains(ae) ? ae.dataset?.fk || null : null
    closeMenu()
    const anyFilter = !!(state.q || state.site || state.tags.size || state.date !== 'all')
    const hasData = state.loaded && !state.error && state.all.length > 0
    stats.hidden = !hasData
    tools.hidden = !hasData
    summary.hidden = !hasData
    if (!state.loaded) {
      summary.replaceChildren()
      results.replaceChildren(...[0, 1].map(() => h('div', { class: 'mm-card hlv-skel', 'aria-hidden': 'true' },
        h('div', { class: 'mm-skeleton', style: 'width:42%;height:14px' }), h('div', { class: 'mm-skeleton', style: 'height:54px' }), h('div', { class: 'mm-skeleton', style: 'height:54px' }))))
      setExport([])
      return
    }
    if (state.error) {
      const retry = h('button', { type: 'button', class: 'mm-btn sm', text: 'Try again' })
      retry.addEventListener('click', () => { state.loaded = false; renderResults(); load() })
      summary.replaceChildren()
      results.replaceChildren(h('div', { class: 'mm-error mm-row between', role: 'alert' }, h('span', { text: `Couldn’t load your highlights: ${state.error}` }), retry))
      more.replaceChildren()
      setExport([])
      return
    }
    if (!state.all.length) {
      summary.replaceChildren()
      results.replaceChildren(h('div', { class: 'mm-card hlv-emptybox' },
        h('div', { class: 'ico', html: ICON.hl }),
        h('h2', { text: 'No highlights yet' }),
        h('p', {}, 'Select text on any web page and pick a color from the radial menu, or press ', h('kbd', { text: 'Alt' }), '+', h('kbd', { text: 'Shift' }), '+', h('kbd', { text: 'H' }), '. Your highlights, notes and their sources collect here.')))
      more.replaceChildren()
      bulk.hidden = true
      setExport([])
      return
    }
    const list = filtered()
    const groups = grouped(list)
    if (state.focusId && !list.some(r => r.id === state.focusId) && state.all.some(r => r.id === state.focusId)) {
      // Deep link to a highlight hidden by filters: show everything.
      state.q = ''; search.value = ''; state.site = ''; state.tags.clear(); state.date = 'all'
      syncSeg(); renderFilters()
      return renderResults()
    }
    // Ordered, visible items (used for range selection and "select all").
    const ordered = groups.flatMap(g => g.items)
    if (state.focusId) { const i = ordered.findIndex(r => r.id === state.focusId); if (i >= state.limit) state.limit = Math.ceil((i + 1) / PAGE) * PAGE }
    const visible = ordered.slice(0, state.limit)
    lastVisible = visible
    const visibleIds = new Set(visible.map(r => r.id))

    summary.replaceChildren()
    if (list.length) {
      const allBox = h('input', { type: 'checkbox', class: 'hlv-check', 'aria-label': 'Select all shown highlights', 'data-fk': 'sel-all' })
      const nSel = visible.filter(r => state.selected.has(r.id)).length
      allBox.checked = nSel > 0 && nSel === visible.length
      allBox.indeterminate = nSel > 0 && nSel < visible.length
      allBox.addEventListener('change', () => {
        for (const r of visible) allBox.checked ? state.selected.add(r.id) : state.selected.delete(r.id)
        renderResults()
      })
      summary.append(allBox, h('span', {}, 'Showing ', h('b', { text: list.length.toLocaleString() }), ` highlight${list.length === 1 ? '' : 's'} on `, h('b', { text: groups.length.toLocaleString() }), ` page${groups.length === 1 ? '' : 's'}`, anyFilter ? ` (of ${state.all.length.toLocaleString()})` : ''))
    } else summary.append(h('span', { text: `No matches among ${state.all.length.toLocaleString()} highlights` }))
    if (anyFilter) summary.append(clearBtn)

    if (!list.length) {
      const clear = h('button', { type: 'button', class: 'mm-btn sm', text: 'Clear filters' })
      clear.addEventListener('click', () => clearBtn.click())
      results.replaceChildren(h('div', { class: 'mm-card mm-empty' }, h('b', { text: 'No highlights match' }), h('div', { text: 'Try a different search, tag or date range.' }), h('div', { style: 'margin-top:12px' }, clear)))
    } else {
      const t = terms()
      const frag = document.createDocumentFragment()
      for (const g of groups) {
        const items = g.items.filter(r => visibleIds.has(r.id))
        if (!items.length) continue
        frag.append(groupEl(g, items, t))
      }
      results.replaceChildren(frag)
    }
    more.replaceChildren()
    if (ordered.length > visible.length) {
      const b = h('button', { type: 'button', class: 'mm-btn', text: `Show more (${(ordered.length - visible.length).toLocaleString()} left)` })
      b.addEventListener('click', () => { state.limit += PAGE; renderResults() })
      more.append(b)
    }
    renderBulk()
    setExport(state.selected.size ? state.all.filter(r => state.selected.has(r.id)) : list, state.selected.size ? 'selected' : anyFilter ? 'filtered' : 'all')
    if (focusKey) body.querySelector(`[data-fk="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: true })
    if (state.focusId) {
      const id = state.focusId
      state.focusId = ''
      const card = results.querySelector(`.hlv-card[data-id="${CSS.escape(id)}"]`)
      if (card) requestAnimationFrame(() => {
        card.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
        card.classList.add('flash')
        card.querySelector('.hlv-tag')?.focus({ preventScroll: true })
        setTimeout(() => card.classList.remove('flash'), 3000)
      })
    }
  }

  function groupEl(g, items, t) {
    const groupBox = h('input', { type: 'checkbox', class: 'hlv-check', 'aria-label': `Select highlights from ${g.title || g.site}`, 'data-fk': `gsel:${g.key}` })
    const n = items.filter(r => state.selected.has(r.id)).length
    groupBox.checked = n === items.length
    groupBox.indeterminate = n > 0 && n < items.length
    groupBox.addEventListener('change', () => { for (const r of items) groupBox.checked ? state.selected.add(r.id) : state.selected.delete(r.id); renderResults() })
    const link = h('a', { href: g.url, target: '_blank', rel: 'noopener noreferrer', title: g.url })
    markText(link, g.title || g.url, t)
    const siteSpan = markText(h('span'), g.site || '', t)
    const total = g.items.length
    return h('section', { class: 'hlv-group mm-card', 'aria-label': g.title || g.site },
      h('header', { class: 'hlv-ghead' }, groupBox,
        h('div', { class: 'hlv-av', style: `--h:${hueOf(g.site || g.key)}`, 'aria-hidden': 'true', text: (g.site || '?').replace(/^www\./, '').charAt(0).toUpperCase() }),
        h('div', { class: 'hlv-gt' }, link, h('div', { class: 'hlv-gm' }, siteSpan, h('span', { text: '·' }), h('span', { text: fmtDate(g.latest), title: new Date(g.latest).toLocaleString() }), h('span', { text: '·' }), h('span', { text: `${total} highlight${total === 1 ? '' : 's'}` })))),
      h('ol', { class: 'hlv-list' }, items.map(r => cardEl(r, t))))
  }

  function cardEl(r, t) {
    const tag = tagInfo(r.tag)
    const sel = state.selected.has(r.id)
    const box = h('input', { type: 'checkbox', class: 'hlv-check', 'aria-label': 'Select highlight', 'data-fk': `sel:${r.id}` })
    box.checked = sel
    box.addEventListener('click', e => {
      const ids = lastVisible.map(x => x.id)
      if (e.shiftKey && state.lastClicked && ids.includes(state.lastClicked)) {
        const [a, b] = [ids.indexOf(state.lastClicked), ids.indexOf(r.id)].sort((x, y) => x - y)
        for (const id of ids.slice(a, b + 1)) box.checked ? state.selected.add(id) : state.selected.delete(id)
      } else box.checked ? state.selected.add(r.id) : state.selected.delete(r.id)
      state.lastClicked = r.id
      renderResults()
    })
    const tagBtn = h('button', { type: 'button', class: 'hlv-tag', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': `Tag: ${tag.name}. Change tag`, 'data-fk': `tag:${r.id}` },
      h('span', { class: 'mm-dot', style: `--c:${tag.color}` }), tag.name, h('span', { html: ICON.caret, style: 'display:grid' }))
    tagBtn.addEventListener('click', () => openTagMenu(tagBtn, r))
    const quote = h('blockquote', { class: 'hlv-quote' })
    markText(quote, r.text, t)
    const long = r.text.length > 700 || r.text.split('\n').length > 8
    const expanded = state.expanded.has(r.id)
    let toggle = null
    if (long) {
      if (!expanded) quote.classList.add('clamp')
      toggle = h('button', { type: 'button', class: 'mm-btn ghost sm hlv-more-q', 'aria-expanded': String(expanded), text: expanded ? 'Show less' : 'Show full quote' })
      toggle.addEventListener('click', () => { expanded ? state.expanded.delete(r.id) : state.expanded.add(r.id); renderResults() })
    }
    let noteEl = null
    if (state.editing === r.id) noteEl = editorEl(r)
    else if (r.note) noteEl = markText(h('div', { class: 'hlv-note', html: ICON.pin }), r.note, t)

    const open = iconBtn(ICON.open, 'Open source', { 'data-fk': `open:${r.id}`, title: 'Open the page and jump to this highlight' })
    open.addEventListener('click', () => openSource(r, open))
    const copy = iconBtn(ICON.copy, 'Copy', { 'data-fk': `copy:${r.id}` })
    copy.addEventListener('click', () => copyQuote(r))
    const edit = iconBtn(ICON.edit, r.note ? 'Edit note' : 'Add note', { 'data-fk': `edit:${r.id}` })
    edit.addEventListener('click', () => { state.editing = r.id; renderResults(); results.querySelector(`.hlv-card[data-id="${CSS.escape(r.id)}"] textarea`)?.focus() })
    const newNote = iconBtn(ICON.note, 'New note from this', { 'data-fk': `newnote:${r.id}` })
    newNote.addEventListener('click', () => noteFrom(r, newNote))
    const del = iconBtn(ICON.trash, 'Delete', { class: 'mm-btn ghost sm del', 'data-fk': `del:${r.id}` })
    del.addEventListener('click', () => removeMany([r.id]))

    return h('li', { class: `hlv-card${sel ? ' sel' : ''}`, 'data-id': r.id, style: `--c:${tag.color}` },
      box,
      h('div', { style: 'min-width:0' },
        h('div', { class: 'hlv-meta' }, tagBtn, h('span', { class: 'hlv-time', title: new Date(r.created).toLocaleString(), text: fmtWhen(r.created) }), r.updated && r.updated - r.created > 60000 ? h('span', { class: 'hlv-time', text: `· edited ${timeAgo(r.updated)}` }) : null),
        quote, toggle, noteEl,
        state.editing === r.id ? null : h('div', { class: 'hlv-actions' }, open, copy, edit, newNote, del)))
  }

  function editorEl(r) {
    const ta = h('textarea', { class: 'mm-textarea', placeholder: 'Write a Quick-Note for this highlight…', 'aria-label': 'Note', maxlength: '10000' })
    ta.value = r.note || ''
    const save = h('button', { type: 'button', class: 'mm-btn primary sm', text: 'Save note' })
    const cancel = h('button', { type: 'button', class: 'mm-btn ghost sm', text: 'Cancel' })
    const done = () => {
      state.editing = null
      if (state.pendingReload) { state.pendingReload = false; load() } else renderResults()
      requestAnimationFrame(() => results.querySelector(`[data-fk="edit:${CSS.escape(r.id)}"]`)?.focus())
    }
    const commit = async () => {
      const note = ta.value.trim()
      if (note === (r.note || '')) return done()
      save.disabled = true
      save.textContent = 'Saving…'
      const res = await send({ type: 'HL_SAVE', highlight: { id: r.id, note } })
      if (!res?.ok) { save.disabled = false; save.textContent = 'Save note'; ctx.toast(`Couldn’t save the note: ${res?.error || 'unknown error'}`); return }
      Object.assign(r, res.highlight)
      hayCache.delete(r)
      ctx.toast(note ? 'Note saved' : 'Note removed')
      done()
    }
    save.addEventListener('click', commit)
    cancel.addEventListener('click', done)
    ta.addEventListener('keydown', e => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commit() }
      if (e.key === 'Escape') { e.preventDefault(); done() }
    })
    return h('div', { class: 'hlv-editor' }, ta, h('div', { class: 'row' }, h('span', { class: 'hint' }, h('kbd', { text: 'Ctrl' }), ' ', h('kbd', { text: 'Enter' }), ' to save · ', h('kbd', { text: 'Esc' }), ' to cancel'), cancel, save))
  }

  // ───────── tag menu ─────────
  let menuEl = null
  function closeMenu(focusBtn) {
    if (!menuEl) return
    const btn = menuEl._btn
    menuEl.remove()
    menuEl = null
    btn?.setAttribute('aria-expanded', 'false')
    if (focusBtn && btn?.isConnected) btn.focus()
  }
  function openTagMenu(btn, r) {
    if (menuEl?._btn === btn) return closeMenu(true)
    closeMenu()
    const m = h('div', { class: 'hlv-menu', role: 'menu', 'aria-label': 'Change tag' })
    for (const t of tags) {
      const c = safeColor(t.color)
      const b = h('button', { type: 'button', role: 'menuitemradio', 'aria-checked': String(t.id === r.tag), tabindex: '-1' }, h('span', { class: 'mm-dot', style: `--c:${c}` }), String(t.name || t.id), h('span', { html: ICON.check, style: 'display:grid;margin-left:auto' }))
      b.addEventListener('click', () => { closeMenu(true); setTag(r, t.id) })
      m.append(b)
    }
    m.addEventListener('keydown', e => {
      const btns = [...m.querySelectorAll('button')]
      const i = btns.indexOf(document.activeElement)
      if (e.key === 'ArrowDown') { e.preventDefault(); btns[(i + 1) % btns.length].focus() }
      else if (e.key === 'ArrowUp') { e.preventDefault(); btns[(i - 1 + btns.length) % btns.length].focus() }
      else if (e.key === 'Home') { e.preventDefault(); btns[0].focus() }
      else if (e.key === 'End') { e.preventDefault(); btns[btns.length - 1].focus() }
      else if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); closeMenu(true) }
    })
    m._btn = btn
    document.body.append(m)
    menuEl = m
    btn.setAttribute('aria-expanded', 'true')
    const rect = btn.getBoundingClientRect()
    const top = rect.bottom + 6 + m.offsetHeight > innerHeight - 8 ? rect.top - 6 - m.offsetHeight : rect.bottom + 6
    m.style.left = `${Math.min(rect.left, innerWidth - m.offsetWidth - 12)}px`
    m.style.top = `${Math.max(8, top)}px`
    ;(m.querySelector('[aria-checked="true"]') || m.querySelector('button')).focus()
  }
  const onDocDown = e => { if (menuEl && !menuEl.contains(e.target) && e.target !== menuEl._btn && !menuEl._btn.contains(e.target)) closeMenu() }
  const onScroll = () => closeMenu()
  document.addEventListener('mousedown', onDocDown, true)
  addEventListener('scroll', onScroll, true)
  cleanup.push(() => { document.removeEventListener('mousedown', onDocDown, true); removeEventListener('scroll', onScroll, true); closeMenu() })

  // ───────── actions ─────────
  async function setTag(r, tagId) {
    if (r.tag === tagId) return
    const prev = r.tag
    r.tag = tagId
    renderAll()
    const res = await send({ type: 'HL_SAVE', highlight: { id: r.id, tag: tagId } })
    if (!res?.ok) { r.tag = prev; renderAll(); ctx.toast(`Couldn’t change the tag: ${res?.error || 'unknown error'}`); return }
    Object.assign(r, res.highlight)
    ctx.toast(`Tagged as ${tagInfo(tagId).name}`)
  }

  async function copyQuote(r) {
    try {
      await navigator.clipboard.writeText(r.text)
      ctx.toast('Quote copied')
    } catch { ctx.toast('Couldn’t copy to the clipboard.') }
  }

  async function removeMany(ids) {
    const recs = state.all.filter(r => ids.includes(r.id))
    if (!recs.length) return
    const at = Math.max(0, lastVisible.findIndex(r => ids.includes(r.id)))
    // optimistic
    state.all = state.all.filter(r => !ids.includes(r.id))
    for (const id of ids) state.selected.delete(id)
    state.confirmBulk = false
    renderAll()
    // keep keyboard focus nearby: the card that took the removed one's place, else the search box
    const cards = results.querySelectorAll('.hlv-card .hlv-tag')
    ;(cards[Math.min(at, cards.length - 1)] || search).focus({ preventScroll: true })
    const res = await send({ type: 'HL_DELETE', ids })
    if (!res?.ok) {
      ctx.toast(`Couldn’t delete: ${res?.error || 'unknown error'}`)
      load()
      return
    }
    showUndo(recs)
  }

  let undoEl = null, undoTimer = 0
  function showUndo(recs) {
    undoEl?.remove()
    clearTimeout(undoTimer)
    document.querySelector('.mm-toast')?.setAttribute('hidden', '') // the undo bar takes the toast's spot
    const btn = h('button', { type: 'button', class: 'mm-btn sm', text: 'Undo' })
    undoEl = h('div', { class: 'hlv-undo', role: 'status' }, h('span', { text: recs.length === 1 ? 'Highlight deleted' : `${recs.length} highlights deleted` }), btn)
    btn.addEventListener('click', async () => {
      undoEl?.remove(); undoEl = null
      clearTimeout(undoTimer)
      let failed = 0
      for (const rec of recs) { const res = await send({ type: 'HL_SAVE', highlight: rec }); if (!res?.ok) failed++ }
      ctx.toast(failed ? `Couldn’t restore ${failed} highlight${failed === 1 ? '' : 's'}` : recs.length === 1 ? 'Highlight restored' : `${recs.length} highlights restored`)
      load()
    })
    document.body.append(undoEl)
    undoTimer = setTimeout(() => { undoEl?.remove(); undoEl = null }, 7000)
  }
  cleanup.push(() => { clearTimeout(undoTimer); undoEl?.remove() })

  function renderBulk() {
    const n = state.selected.size
    bulk.hidden = n === 0
    if (!n) { state.confirmBulk = false; bulk.replaceChildren(); return }
    const visibleIds = lastVisible.map(r => r.id)
    const allShown = visibleIds.length > 0 && visibleIds.every(id => state.selected.has(id))
    const selAll = h('button', { type: 'button', class: 'mm-btn ghost sm', text: allShown ? 'All shown selected' : `Select all ${visibleIds.length} shown`, disabled: allShown, 'data-fk': 'bulk-all' })
    selAll.addEventListener('click', () => { visibleIds.forEach(id => state.selected.add(id)); renderResults() })
    const clear = h('button', { type: 'button', class: 'mm-btn ghost sm', text: 'Clear selection', 'data-fk': 'bulk-clear' })
    clear.addEventListener('click', () => { state.selected.clear(); state.confirmBulk = false; renderResults() })
    const kids = [h('span', { class: 'cnt', text: `${n} selected` }), selAll, clear, h('span', { class: 'hlv-sp' })]
    if (state.confirmBulk) {
      const no = h('button', { type: 'button', class: 'mm-btn ghost sm', text: 'Cancel', 'data-fk': 'bulk-cancel' })
      no.addEventListener('click', () => { state.confirmBulk = false; renderBulk(); bulk.querySelector('[data-fk="bulk-del"]')?.focus() })
      const yes = h('button', { type: 'button', class: 'mm-btn danger sm', html: ICON.trash, 'data-fk': 'bulk-yes' })
      yes.append(`Delete ${n}`)
      yes.addEventListener('click', () => removeMany([...state.selected]))
      kids.push(h('span', { class: 'confirm', text: `Delete ${n} highlight${n === 1 ? '' : 's'}?` }), no, yes)
      bulk.replaceChildren(...kids)
      yes.focus()
    } else {
      const del = h('button', { type: 'button', class: 'mm-btn danger sm', html: ICON.trash, 'data-fk': 'bulk-del' })
      del.append('Delete selected')
      del.addEventListener('click', () => { state.confirmBulk = true; renderBulk() })
      kids.push(del)
      bulk.replaceChildren(...kids)
    }
  }

  async function openSource(r, btn) {
    btn.disabled = true
    try {
      const tabsList = await chrome.tabs.query({})
      let tab = tabsList.find(t => t.url && /^https?:/.test(t.url) && normalizeUrl(t.url) === r.pageKey)
      if (tab) {
        await chrome.tabs.update(tab.id, { active: true })
        await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {})
      } else tab = await ctx.openUrl(r.url)
      if (!tab?.id) throw new Error('The tab could not be opened')
      await waitComplete(tab.id)
      await focusIn(tab.id, r.id)
    } catch (e) {
      ctx.toast(`Couldn’t open the source: ${e?.message || e}`)
    } finally { btn.disabled = false }
  }

  function waitComplete(tabId, timeout = 25000) {
    return new Promise(resolve => {
      let done = false
      const finish = v => { if (done) return; done = true; chrome.tabs.onUpdated.removeListener(onUp); clearTimeout(timer); resolve(v) }
      const onUp = (id, info) => { if (id === tabId && info.status === 'complete') finish(true) }
      chrome.tabs.onUpdated.addListener(onUp)
      const timer = setTimeout(() => finish(false), timeout)
      chrome.tabs.get(tabId).then(t => { if (t.status === 'complete' && !t.pendingUrl && /^https?:/.test(t.url || '')) finish(true) }, () => finish(false))
    })
  }

  async function focusIn(tabId, id) {
    const msg = { type: 'MM_HIGHLIGHT_FOCUS', id }
    for (let i = 0; i < 10; i++) {
      try { const res = await chrome.tabs.sendMessage(tabId, msg); if (res) return res } catch { /* content script not ready yet */ }
      await sleep(300)
    }
    return send({ type: 'SEND_TO_TAB', tabId, message: msg }) // injects the content scripts if needed
  }

  async function noteFrom(r, btn) {
    btn.disabled = true
    try {
      const now = Date.now()
      const title = r.title || r.site || 'Untitled page'
      const tag = tagInfo(r.tag).name
      const body = [mdQuote(r.text), '', `— [${mdText(title)}](${mdUrl(r.url)})`, ...(r.note ? ['', r.note] : []), ''].join('\n')
      const rec = { id: ctx.uid('note_'), title: `Notes on ${title}`.slice(0, 140), body, tags: [tag], sources: [{ url: r.url, title }], created: now, updated: now, pinned: false }
      await ctx.db.put('notes', rec)
      ctx.navigate('notes', `id=${encodeURIComponent(rec.id)}`)
    } catch (e) {
      btn.disabled = false
      ctx.toast(`Couldn’t create the note: ${e?.message || e}`)
    }
  }

  // ───────── export ─────────
  let exportSet = [], exportScope = 'all'
  function setExport(list, scope = 'all') {
    exportSet = list
    exportScope = scope
    const n = list.length
    exportLbl.textContent = n ? `Export ${scope === 'all' ? 'all' : scope} (${n})` : 'Export'
    for (const b of [expMd, expJson, expCsv]) b.disabled = !n
  }

  function exportAs(fmt) {
    const list = [...exportSet].sort((a, b) => (a.created || 0) - (b.created || 0))
    if (!list.length) return
    const stamp = isoDay()
    const name = `master-mind-highlights-${stamp}`
    if (fmt === 'json') {
      const out = {
        app: 'Master Mind', kind: 'highlights', exportedAt: new Date().toISOString(), scope: exportScope, count: list.length,
        items: list.map(r => ({ id: r.id, text: r.text, note: r.note || '', tag: r.tag, tagName: tagInfo(r.tag).name, tagColor: tagInfo(r.tag).color, title: r.title, url: r.url, site: r.site, pageKey: r.pageKey, created: new Date(r.created).toISOString(), updated: new Date(r.updated || r.created).toISOString(), prefix: r.prefix || '', suffix: r.suffix || '' })),
      }
      download(`${name}.json`, JSON.stringify(out, null, 2), 'application/json')
    } else if (fmt === 'csv') {
      const cols = ['id', 'created', 'updated', 'tag', 'tag_name', 'text', 'note', 'title', 'url', 'site']
      const rows = list.map(r => [r.id, new Date(r.created).toISOString(), new Date(r.updated || r.created).toISOString(), r.tag, tagInfo(r.tag).name, r.text, r.note || '', r.title, r.url, r.site].map(csvCell).join(','))
      download(`${name}.csv`, `﻿${[cols.join(','), ...rows].join('\r\n')}\r\n`, 'text/csv;charset=utf-8')
    } else {
      const groups = new Map()
      for (const r of list) { const k = r.pageKey || r.url; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r) }
      const pages = groups.size
      const lines = ['# Master Mind highlights', '', `_Exported ${fmtDate(Date.now())} · ${list.length} highlight${list.length === 1 ? '' : 's'} from ${pages} page${pages === 1 ? '' : 's'}_`, '']
      for (const items of groups.values()) {
        const first = items[items.length - 1]
        lines.push(`## [${mdText(first.title || first.url)}](${mdUrl(first.url)})`, '', `${mdText(first.site)} · ${items.length} highlight${items.length === 1 ? '' : 's'}`, '')
        for (const r of items) {
          lines.push(mdQuote(r.text), '', `**${mdText(tagInfo(r.tag).name)}** · ${new Date(r.created).toLocaleString()}`, '')
          if (r.note) lines.push(`**Note:** ${r.note.replace(/\n/g, '  \n')}`, '')
        }
        lines.push('---', '')
      }
      download(`${name}.md`, lines.join('\n'), 'text/markdown;charset=utf-8')
    }
    ctx.toast(`Exported ${list.length} highlight${list.length === 1 ? '' : 's'} as ${fmt === 'md' ? 'Markdown' : fmt.toUpperCase()}`)
  }

  renderResults()
  load()

  return {
    unmount() {
      for (const fn of cleanup) { try { fn() } catch { /* already gone */ } }
    },
  }
}

function debounce(fn, ms) {
  let t
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms) }
}
