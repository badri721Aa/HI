// Research Trail: the branching tree of how pages led to one another (data from bg/history.js).
// Days → trails (root navigations) → collapsible children with connector lines.
import { siteOf } from '../../lib/text.js'

const DAY = 864e5
const RANGES = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: 'all', label: 'All' },
]
const ROW_BUDGET = 400 // rows rendered before "Show older trails"
const ROOT_BADGE = { typed: 'Typed', generated: 'Search', keyword: 'Search', keyword_generated: 'Search', auto_bookmark: 'Bookmark', start_page: 'Start page', auto_toplevel: 'Opened' }

const ICON = {
  chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
  search: '<svg class="mm-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  expand: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 15l5 5 5-5M7 9l5-5 5 5"/></svg>',
  collapse: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 20l5-5 5 5M7 4l5 5 5-5"/></svg>',
  trail: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3v6a3 3 0 0 0 3 3h6a3 3 0 0 1 3 3v6M6 21v-4M18 3v4"/><circle cx="6" cy="15" r="2"/><circle cx="18" cy="9" r="2"/></svg>',
  newtab: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
}

const STYLES = `
.hv{max-width:1040px;display:flex;flex-direction:column;gap:16px}
.hv .view-head{margin-bottom:0;align-items:flex-end;flex-wrap:nowrap}
.hv .view-head>div:first-child{min-width:0}
.hv .view-head>.mm-btn{flex:none}
.hv-sub{margin:5px 0 0}
.hv-tools{display:flex;flex-wrap:wrap;align-items:center;gap:10px}
.hv-seg{display:inline-flex;gap:2px;padding:3px;border-radius:11px;background:rgba(0,0,0,.3);border:1px solid var(--mm-border)}
.hv-seg button{font:600 12.5px/1 var(--mm-font);color:var(--mm-muted);background:none;border:0;border-radius:8px;padding:8px 12px;cursor:pointer;transition:color .15s,background .15s}
.hv-seg button:hover{color:var(--mm-fg)}
.hv-seg button[aria-pressed="true"]{color:var(--mm-heading);background:rgba(255,255,255,.09);box-shadow:inset 0 0 0 1px var(--mm-border-strong),0 0 14px color-mix(in srgb,var(--mm-accent) 14%,transparent)}
.hv-search{position:relative;flex:1 1 240px;max-width:420px}
.hv-search .mm-icon{position:absolute;left:11px;top:50%;transform:translateY(-50%);color:var(--mm-muted);pointer-events:none}
.hv-search input{padding-left:35px;height:38px}
.hv-sp{flex:1}
.hv-count{font-size:12.5px;color:var(--mm-muted);min-height:18px}
.hv-day{display:flex;flex-direction:column;gap:10px}
.hv-day-h{display:flex;align-items:baseline;gap:10px;margin:6px 2px 0;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--mm-fg-2)}
.hv-day-h .n{font:500 12px/1 var(--mm-font);letter-spacing:0;text-transform:none;color:var(--mm-muted)}
.hv-day-h::after{content:"";flex:1;height:1px;background:linear-gradient(90deg,var(--mm-border),transparent);align-self:center}
.hv-trails{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
.hv-trail{padding:8px 10px 8px 8px}
.hv-tree,.hv-kids{list-style:none;margin:0;padding:0}
.hv-kids{padding-left:30px}
.hv-node{position:relative;--line:color-mix(in srgb,var(--mm-accent) 30%,rgba(255,255,255,.1))}
.hv-kids>.hv-node::before{content:"";position:absolute;left:-18px;top:-4px;width:14px;height:24px;border-left:1.5px solid var(--line);border-bottom:1.5px solid var(--line);border-bottom-left-radius:10px;pointer-events:none}
.hv-kids>.hv-node:not(:last-child)::after{content:"";position:absolute;left:-18px;top:18px;bottom:-2px;border-left:1.5px solid var(--line);pointer-events:none}
.hv-row{display:flex;align-items:center;gap:8px;min-height:40px;padding:3px 8px 3px 0;border-radius:10px;transition:background .12s}
.hv-row:hover{background:rgba(255,255,255,.035)}
.hv-tw{width:24px;height:24px;flex:none;display:grid;place-items:center;border:0;border-radius:7px;background:none;color:var(--mm-muted);cursor:pointer;padding:0}
.hv-tw:hover{color:var(--mm-fg);background:rgba(255,255,255,.07)}
.hv-tw svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round;transition:transform .18s var(--mm-ease)}
.hv-tw[aria-expanded="true"] svg{transform:rotate(90deg)}
.hv-tw-dot{width:24px;height:24px;flex:none;display:grid;place-items:center}
.hv-tw-dot::before{content:"";width:5px;height:5px;border-radius:50%;background:color-mix(in srgb,var(--mm-accent) 55%,transparent);box-shadow:0 0 6px color-mix(in srgb,var(--mm-accent) 40%,transparent)}
.hv-av{width:28px;height:28px;flex:none;border-radius:9px;display:grid;place-items:center;font:700 13px/1 var(--mm-font);color:hsl(var(--h) 85% 76%);background:hsl(var(--h) 70% 55% / .14);border:1px solid hsl(var(--h) 70% 60% / .32);box-shadow:0 0 14px hsl(var(--h) 80% 55% / .12)}
.hv .hv-link{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;color:var(--mm-fg);text-decoration:none;padding:3px 6px;border-radius:8px;outline-offset:1px}
.hv .hv-link:hover{text-decoration:none}
.hv .hv-link:hover .hv-title,.hv .hv-link:focus-visible .hv-title{color:var(--mm-accent)}
.hv-title{font-weight:600;font-size:13.5px;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:color .12s}
.hv-meta{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--mm-muted);min-width:0}
.hv-dom{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.hv-badge{flex:none;display:inline-flex;align-items:center;gap:4px;font:700 10px/1 var(--mm-font);letter-spacing:.05em;text-transform:uppercase;padding:3px 6px;border-radius:6px;background:rgba(255,255,255,.06);color:var(--mm-fg-2)}
.hv-badge svg{width:10px;height:10px;fill:none;stroke:currentColor;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
.hv-badge.root{color:var(--mm-accent);background:color-mix(in srgb,var(--mm-accent) 12%,transparent)}
.hv-badge.cont{color:var(--mm-violet);background:color-mix(in srgb,var(--mm-violet) 12%,transparent)}
.hv-n{flex:none;font:600 11.5px/1 var(--mm-font);color:var(--mm-muted);padding:4px 7px;border-radius:99px;border:1px solid var(--mm-border);font-variant-numeric:tabular-nums}
.hv-time{flex:none;font:500 12px/1 var(--mm-mono);color:var(--mm-muted);font-variant-numeric:tabular-nums;min-width:44px;text-align:right}
.hv-node.dim>.hv-row .hv-link{opacity:.55}
.hv mark{background:color-mix(in srgb,var(--mm-accent) 30%,transparent);color:var(--mm-heading);border-radius:3px;padding:0 1px}
.hv-more{align-self:center}
.hv-hint{font-size:12px;color:var(--mm-muted);text-align:center;margin-top:4px}
.hv-skel{display:flex;flex-direction:column;gap:10px}
.hv-skel .mm-card{display:flex;flex-direction:column;gap:12px}
.hv-empty{padding:44px 24px;display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center}
.hv-empty .art{width:64px;height:64px;border-radius:18px;display:grid;place-items:center;color:var(--mm-accent);background:color-mix(in srgb,var(--mm-accent) 10%,transparent);border:1px solid color-mix(in srgb,var(--mm-accent) 30%,transparent);box-shadow:0 0 30px color-mix(in srgb,var(--mm-accent) 18%,transparent)}
.hv-empty .art svg{width:30px;height:30px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.hv-empty h2{font-size:17px}
.hv-empty p{margin:0;max-width:520px;color:var(--mm-fg-2)}
.hv-empty ul{margin:6px 0 0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px;text-align:left;color:var(--mm-fg-2);font-size:13px}
.hv-empty li{display:flex;gap:8px;align-items:baseline}
.hv-empty li b{color:var(--mm-heading)}
@media (max-width:760px){.hv-time{display:none}.hv-kids{padding-left:22px}.hv-kids>.hv-node::before,.hv-kids>.hv-node:not(:last-child)::after{left:-12px}}
`

/** Tiny element builder. `text` → textContent, `html` → trusted static markup (icons only). */
function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue
    if (k === 'text') e.textContent = v
    else if (k === 'html') e.innerHTML = v
    else if (k === 'class') e.className = v
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v)
    else e.setAttribute(k, v === true ? '' : v)
  }
  for (const c of children.flat()) if (c != null && c !== false) e.append(c)
  return e
}

const hueOf = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 360 }
const isWeb = u => /^https?:\/\//i.test(u || '')
const startOfDay = ts => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime() }

function sinceFor(range) {
  const now = Date.now()
  if (range === 'today') return startOfDay(now)
  if (range === '7d') return startOfDay(now - 6 * DAY)
  if (range === '30d') return startOfDay(now - 29 * DAY)
  return 0
}

function dayLabel(ts) {
  const today = startOfDay(Date.now())
  const d = startOfDay(ts)
  if (d === today) return 'Today'
  if (d === today - DAY) return 'Yesterday'
  const sameYear = new Date(d).getFullYear() === new Date(today).getFullYear()
  return new Date(d).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) })
}

const timeOf = ts => new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

/** Readable fallback when a page never reported a title. */
function titleOf(n) {
  if (n.title) return n.title
  try {
    const u = new URL(n.url)
    const path = decodeURIComponent(u.pathname).replace(/\/+$/, '')
    return path && path !== '/' ? `${u.hostname.replace(/^www\./, '')}${path}` : u.hostname.replace(/^www\./, '')
  } catch { return n.url }
}

/** Text with <mark>s around query terms, built from text nodes (never HTML). */
function marked(text, terms) {
  if (!terms.length) return document.createTextNode(text)
  const frag = document.createDocumentFragment()
  const lower = text.toLowerCase()
  const hits = []
  for (const t of terms) {
    let i = lower.indexOf(t)
    while (i !== -1) { hits.push([i, i + t.length]); i = lower.indexOf(t, i + t.length) }
  }
  hits.sort((a, b) => a[0] - b[0])
  let pos = 0
  for (const [a, b] of hits) {
    if (a < pos) continue
    if (a > pos) frag.append(text.slice(pos, a))
    frag.append(el('mark', { text: text.slice(a, b) }))
    pos = b
  }
  if (pos < text.length) frag.append(text.slice(pos))
  return frag
}

const DIALOG_CSS = `
.mm-dlg{border:1px solid var(--mm-border-strong);background:var(--mm-glass-strong);backdrop-filter:var(--mm-blur);-webkit-backdrop-filter:var(--mm-blur);color:var(--mm-fg);border-radius:16px;padding:20px 20px 16px;width:min(440px,92vw);box-shadow:var(--mm-shadow)}
.mm-dlg[open]{animation:mm-dlg-in .18s var(--mm-ease)}
.mm-dlg::backdrop{background:rgba(5,6,10,.62);backdrop-filter:blur(3px)}
.mm-dlg h2{font-size:16px;margin:0 0 8px}
.mm-dlg p{margin:0 0 16px;color:var(--mm-fg-2);line-height:1.55}
.mm-dlg .mm-row{justify-content:flex-end}
@keyframes mm-dlg-in{from{opacity:0;transform:translateY(6px) scale(.98)}}
@media (prefers-reduced-motion:reduce){.mm-dlg[open]{animation:none}}
`

/** Shared confirm dialog (native <dialog>: focus trap + Escape for free). Resolves true on confirm. */
export function confirmDialog({ title, body, confirm = 'Confirm', danger = false }) {
  if (!document.getElementById('mm-dlg-style')) document.head.append(el('style', { id: 'mm-dlg-style', text: DIALOG_CSS }))
  return new Promise(resolve => {
    const ok = el('button', { type: 'button', class: `mm-btn ${danger ? 'danger' : 'primary'}`, text: confirm })
    const cancel = el('button', { type: 'button', class: 'mm-btn ghost', text: 'Cancel' })
    const dlg = el('dialog', { class: 'mm-dlg mm-root', 'aria-labelledby': 'mm-dlg-t' },
      el('h2', { id: 'mm-dlg-t', text: title }),
      el('p', { text: body }),
      el('div', { class: 'mm-row' }, cancel, ok))
    let result = false
    ok.addEventListener('click', () => { result = true; dlg.close() })
    cancel.addEventListener('click', () => dlg.close())
    dlg.addEventListener('close', () => { dlg.remove(); resolve(result) })
    document.body.append(dlg)
    dlg.showModal()
    cancel.focus()
  })
}

export function mount(root, ctx) {
  const state = {
    range: RANGES.some(r => r.id === ctx.params.get('range')) ? ctx.params.get('range') : '7d',
    query: '',
    nodes: [],
    loaded: false,
    error: '',
    collapsed: new Set(),
    limit: ROW_BUDGET,
    reqId: 0,
    loading: 0, // HISTORY_TREE requests in flight
  }
  let alive = true
  const timers = new Set()
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn() }, ms); timers.add(t); return t }

  // ── static chrome ──
  const sub = el('p', { class: 'hv-sub mm-muted', text: 'How your pages led to one another: links branch from the page you were on, new tabs from their opener, searches start new trails.' })
  const clearBtn = el('button', { type: 'button', class: 'mm-btn danger sm', html: ICON.trash }, 'Clear history')
  const head = el('div', { class: 'view-head' }, el('div', {}, el('h1', { text: 'Research Trail' }), sub), clearBtn)

  const seg = el('div', { class: 'hv-seg', role: 'group', 'aria-label': 'Time range' })
  for (const r of RANGES) {
    seg.append(el('button', { type: 'button', 'data-range': r.id, 'aria-pressed': String(r.id === state.range), text: r.label, onclick: () => setRange(r.id) }))
  }
  const search = el('input', { class: 'mm-input', type: 'search', placeholder: 'Search titles and URLs…', 'aria-label': 'Search the research trail', autocomplete: 'off', spellcheck: 'false' })
  const expandBtn = el('button', { type: 'button', class: 'mm-btn ghost sm', html: ICON.expand, title: 'Expand every trail' }, 'Expand all')
  const collapseBtn = el('button', { type: 'button', class: 'mm-btn ghost sm', html: ICON.collapse, title: 'Collapse every trail' }, 'Collapse all')
  const tools = el('div', { class: 'hv-tools' }, seg, el('label', { class: 'hv-search' }, el('span', { html: ICON.search }), search), el('span', { class: 'hv-sp' }), expandBtn, collapseBtn)
  const count = el('div', { class: 'hv-count', role: 'status', 'aria-live': 'polite' })
  const list = el('div', { class: 'hv-list' })
  const wrap = el('div', { class: 'hv' }, head, tools, count, list)
  root.replaceChildren(el('style', { text: STYLES }), wrap)

  // ── data ──
  async function load({ quiet = false } = {}) {
    const id = ++state.reqId
    if (!quiet) { state.loaded = false; render() }
    state.loading++
    try {
      const res = await chrome.runtime.sendMessage({ type: 'HISTORY_TREE', since: sinceFor(state.range) })
      if (!alive || id !== state.reqId) return // a newer request (range change) superseded this one
      if (!res?.ok) throw new Error(res?.error || 'The background service did not answer.')
      state.nodes = res.nodes || []
      state.error = ''
    } catch (e) {
      if (!alive || id !== state.reqId) return
      state.error = String(e?.message || e)
    } finally {
      state.loading--
    }
    state.loaded = true
    render()
  }

  /**
   * Live updates. A single-record put (a page you just opened, a title arriving) is read back on its own and
   * patched in: a new or moved node re-renders the trail, a title change only rewrites that row. Bulk changes
   * (import, trim, clear) reload the range.
   */
  const dirty = new Set()
  let reloadAll = false
  async function applyChanges() {
    const ids = [...dirty]
    dirty.clear()
    if (reloadAll || ids.length > 40 || !state.loaded || state.error || state.loading) {
      reloadAll = false
      return load({ quiet: true })
    }
    const reqId = state.reqId
    let recs
    try { recs = await Promise.all(ids.map(id => ctx.db.get('history', id))) } catch { return load({ quiet: true }) }
    if (!alive) return
    if (reqId !== state.reqId || state.loading) return // a reload started meanwhile and will bring these too
    const since = sinceFor(state.range)
    const index = new Map(state.nodes.map((n, i) => [n.id, i]))
    const retitled = []
    let structural = false
    ids.forEach((id, k) => {
      const rec = recs[k]
      const i = index.get(id)
      const inRange = !!rec && (rec.ts || 0) >= since
      if (i === undefined) {
        if (inRange) { state.nodes.push(rec); structural = true }
        return
      }
      const old = state.nodes[i]
      if (!inRange) { state.nodes[i] = null; structural = true; return }
      state.nodes[i] = rec
      if (rec.url !== old.url || rec.parentId !== old.parentId || rec.ts !== old.ts || rec.tabId !== old.tabId || rec.transition !== old.transition) structural = true
      else if (rec.title !== old.title) retitled.push([old, rec])
    })
    if (structural) {
      state.nodes = state.nodes.filter(Boolean)
      for (let i = 1; i < state.nodes.length; i++) {
        if ((state.nodes[i - 1].ts || 0) > (state.nodes[i].ts || 0)) { state.nodes.sort((a, b) => (a.ts || 0) - (b.ts || 0)); break }
      }
      render()
    } else if (retitled.length) patchTitles(retitled)
  }

  /** Rewrite just the rows whose title changed (a full render only when a search's matches change). */
  function patchTitles(pairs) {
    const terms = state.query.toLowerCase().split(/\s+/).filter(Boolean)
    const matches = n => terms.every(t => `${n.title || ''} ${n.url}`.toLowerCase().includes(t))
    if (terms.length && pairs.some(([a, b]) => matches(a) !== matches(b))) return render()
    for (const [, n] of pairs) {
      const li = list.querySelector(`.hv-node[data-id="${CSS.escape(n.id)}"]`)
      if (!li) continue // collapsed away or beyond the row budget: the next render picks it up
      const title = titleOf(n)
      const link = li.querySelector(':scope > .hv-row .hv-link')
      if (link) {
        link.title = `${title}\n${n.url}\n${new Date(n.ts).toLocaleString()}`
        link.querySelector('.hv-title')?.replaceChildren(marked(title, terms))
      }
      const tw = li.querySelector(':scope > .hv-row .hv-tw')
      if (tw) tw.setAttribute('aria-label', tw.getAttribute('aria-label').replace(/ opened from [\s\S]*$/, ` opened from ${title}`))
    }
  }

  function setRange(id) {
    if (id === state.range) return
    state.range = id
    state.limit = ROW_BUDGET
    for (const b of seg.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.range === id))
    load()
  }

  /** Nodes → forest. A parent must be older than its child, which also rules out cycles in damaged data. */
  function forest(nodes) {
    const byId = new Map(nodes.map(n => [n.id, { ...n, kids: [], size: 1 }]))
    const roots = []
    for (const n of byId.values()) {
      const p = n.parentId ? byId.get(n.parentId) : null
      if (p && (p.ts < n.ts || (p.ts === n.ts && p.id < n.id))) p.kids.push(n)
      else { n.continued = !!n.parentId; roots.push(n) }
    }
    const finish = n => {
      n.kids.sort((a, b) => a.ts - b.ts)
      for (const k of n.kids) { finish(k); n.size += k.size }
    }
    for (const r of roots) finish(r)
    roots.sort((a, b) => b.ts - a.ts)
    return { byId, roots }
  }

  function render() {
    const focusId = document.activeElement?.closest?.('.hv-node')?.dataset.id
    const focusTw = document.activeElement?.classList?.contains('hv-tw')
    list.replaceChildren()
    count.textContent = ''
    clearBtn.disabled = state.loaded && !state.error && state.range === 'all' && !state.nodes.length

    if (!state.loaded) {
      list.append(el('div', { class: 'hv-skel', 'aria-busy': 'true', 'aria-label': 'Loading research trail' },
        ...[0, 1, 2].map(i => el('div', { class: 'mm-card' },
          el('div', { class: 'mm-skeleton', style: `width:${46 - i * 8}%;height:14px` }),
          el('div', { class: 'mm-skeleton', style: 'width:72%;height:12px;margin-left:30px' }),
          el('div', { class: 'mm-skeleton', style: 'width:58%;height:12px;margin-left:60px' })))))
      return
    }
    if (state.error) {
      list.append(el('div', { class: 'mm-error', role: 'alert' },
        el('span', { text: `Couldn’t load your research trail: ${state.error} ` }),
        el('button', { type: 'button', class: 'mm-btn sm', text: 'Retry', onclick: () => load() })))
      return
    }

    const terms = state.query.toLowerCase().split(/\s+/).filter(Boolean)
    const { roots } = forest(state.nodes)
    const total = state.nodes.length
    const sites = new Set(state.nodes.map(n => siteOf(n.url)))

    if (!total) {
      const range = RANGES.find(r => r.id === state.range)
      list.append(state.range === 'all' ? emptyAll() : el('div', { class: 'mm-card hv-empty' },
        el('div', { class: 'art', html: ICON.trail }),
        el('h2', { text: state.range === 'today' ? 'Nothing recorded today yet' : `Nothing in the last ${range.label}` }),
        el('p', { text: 'Pages you open from now on will appear here as a branching trail.' }),
        el('button', { type: 'button', class: 'mm-btn', text: 'Show all time', onclick: () => setRange('all') })))
      return
    }

    // Search keeps matches plus the ancestors that give them context.
    let keep = null
    let matchCount = 0
    if (terms.length) {
      keep = new Map() // id → isMatch
      const byId = new Map(state.nodes.map(n => [n.id, n]))
      for (const n of state.nodes) {
        const hay = `${n.title || ''} ${n.url}`.toLowerCase()
        if (!terms.every(t => hay.includes(t))) continue
        matchCount++
        keep.set(n.id, true)
        let p = byId.get(n.parentId)
        let guard = 0
        while (p && !keep.has(p.id) && guard++ < 5000) { keep.set(p.id, false); p = byId.get(p.parentId) }
      }
      count.textContent = matchCount ? `${matchCount} matching page${matchCount === 1 ? '' : 's'}` : ''
      if (!matchCount) {
        list.append(el('div', { class: 'mm-card hv-empty' },
          el('h2', { text: 'No pages match' }),
          el('p', { text: `Nothing in this range matches “${state.query}”.` }),
          el('div', { class: 'mm-row' },
            el('button', { type: 'button', class: 'mm-btn', text: 'Clear search', onclick: () => { search.value = ''; state.query = ''; render(); search.focus() } }),
            state.range !== 'all' ? el('button', { type: 'button', class: 'mm-btn ghost', text: 'Search all time', onclick: () => setRange('all') }) : null)))
        return
      }
    } else {
      count.textContent = `${total.toLocaleString()} page${total === 1 ? '' : 's'} · ${roots.length.toLocaleString()} trail${roots.length === 1 ? '' : 's'} · ${sites.size.toLocaleString()} site${sites.size === 1 ? '' : 's'}`
    }

    // Group trails by the day their root started.
    const days = new Map()
    for (const r of roots) {
      if (keep && !keep.has(r.id)) continue
      const d = startOfDay(r.ts)
      if (!days.has(d)) days.set(d, [])
      days.get(d).push(r)
    }

    let rows = 0
    let truncated = false
    for (const [d, trails] of days) {
      if (rows >= state.limit) { truncated = true; break }
      const pageCount = trails.reduce((s, t) => s + t.size, 0)
      const ol = el('ol', { class: 'hv-trails' })
      const section = el('section', { class: 'hv-day', 'aria-label': dayLabel(d) },
        el('h2', { class: 'hv-day-h' }, el('span', { text: dayLabel(d) }), el('span', { class: 'n', text: keep ? '' : `${pageCount} page${pageCount === 1 ? '' : 's'} · ${trails.length} trail${trails.length === 1 ? '' : 's'}` })),
        ol)
      for (const t of trails) {
        if (rows >= state.limit) { truncated = true; break }
        const tree = el('ul', { class: 'hv-tree' })
        const counter = { n: 0 }
        tree.append(nodeEl(t, 0, terms, keep, counter))
        rows += counter.n
        ol.append(el('li', { class: 'hv-trail mm-card' }, tree))
      }
      list.append(section)
    }
    if (truncated) {
      list.append(el('button', { type: 'button', class: 'mm-btn hv-more', text: 'Show older trails', onclick: () => { state.limit += ROW_BUDGET; render() } }))
    }
    list.append(el('p', { class: 'hv-hint', text: 'Tip: ↑ ↓ move between pages · ← → collapse or expand · Enter opens the page in a new tab.' }))

    if (focusId) {
      const node = list.querySelector(`.hv-node[data-id="${CSS.escape(focusId)}"]`)
      node?.querySelector(focusTw ? ':scope > .hv-row .hv-tw' : ':scope > .hv-row .hv-link')?.focus({ preventScroll: true })
    }
  }

  function nodeEl(n, depth, terms, keep, counter) {
    counter.n++
    const kids = keep ? n.kids.filter(k => keep.has(k.id)) : n.kids
    const open = keep ? true : !state.collapsed.has(n.id)
    const site = siteOf(n.url)
    const title = titleOf(n)
    const li = el('li', { class: `hv-node${keep && !keep.get(n.id) ? ' dim' : ''}`, 'data-id': n.id, 'data-url': n.url })
    const kidsId = `hv-k-${n.id}`
    const twisty = kids.length
      ? el('button', { type: 'button', class: 'hv-tw', tabindex: '-1', 'aria-expanded': String(open), 'aria-controls': kidsId, 'aria-label': `${open ? 'Collapse' : 'Expand'} ${kids.length} page${kids.length === 1 ? '' : 's'} opened from ${title}`, html: ICON.chevron, onclick: () => toggle(n.id) })
      : el('span', { class: 'hv-tw-dot', 'aria-hidden': 'true' })

    const meta = el('span', { class: 'hv-meta' }, el('span', { class: 'hv-dom' }, marked(site || n.url, terms)))
    if (depth === 0 && n.continued) meta.append(el('span', { class: 'hv-badge cont', text: 'Continued' }))
    else if (depth === 0 && ROOT_BADGE[n.transition]) meta.append(el('span', { class: 'hv-badge root', text: ROOT_BADGE[n.transition] }))
    if (n.parentTab !== undefined && n.parentTab !== n.tabId) meta.append(el('span', { class: 'hv-badge', html: ICON.newtab }, 'New tab'))
    if (n.transition === 'form_submit') meta.append(el('span', { class: 'hv-badge', text: 'Form' }))

    const web = isWeb(n.url) // the trail only records web pages; anything else is never opened
    const link = el('a', {
      class: 'hv-link', href: web ? n.url : '#', title: `${title}\n${n.url}\n${new Date(n.ts).toLocaleString()}`,
    }, el('span', { class: 'hv-title' }, marked(title, terms)), meta)
    link.addEventListener('click', e => {
      if (web && (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey)) return
      e.preventDefault()
      if (web) ctx.openUrl(n.url)
    })

    const row = el('div', { class: 'hv-row' }, twisty, el('span', { class: 'hv-av', style: `--h:${hueOf(site || n.url)}`, 'aria-hidden': 'true', text: (site || '?').charAt(0).toUpperCase() }), link)
    if (depth === 0 && n.size > 1) row.append(el('span', { class: 'hv-n', title: `${n.size} pages in this trail`, text: `${n.size} pages` }))
    row.append(el('time', { class: 'hv-time', datetime: new Date(n.ts).toISOString(), text: timeOf(n.ts) }))
    li.append(row)

    if (kids.length && open) {
      const ul = el('ul', { class: 'hv-kids', id: kidsId })
      for (const k of kids) { k.parentTab = n.tabId; ul.append(nodeEl(k, depth + 1, terms, keep, counter)) }
      li.append(ul)
    }
    return li
  }

  function toggle(id, force) {
    const isOpen = !state.collapsed.has(id)
    const next = force ?? !isOpen
    if (next) state.collapsed.delete(id); else state.collapsed.add(id)
    render()
  }

  function emptyAll() {
    return el('div', { class: 'mm-card hv-empty' },
      el('div', { class: 'art', html: ICON.trail }),
      el('h2', { text: 'Your research trail is empty' }),
      el('p', { text: 'Browse as usual. Master Mind quietly maps how one page leads to the next so you can retrace a line of research later.' }),
      el('ul', {},
        el('li', {}, el('b', { text: 'Links' }), el('span', { text: 'you follow branch from the page you were reading.' })),
        el('li', {}, el('b', { text: 'New tabs' }), el('span', { text: 'opened from a page branch from that page.' })),
        el('li', {}, el('b', { text: 'Searches' }), el('span', { text: 'and typed addresses start a fresh trail.' }))),
      el('p', { class: 'mm-small mm-muted', text: 'Your trail stays on this device (up to 5,000 pages) and never leaves your browser.' }))
  }

  // ── keyboard: ↑/↓ between rows, ←/→ collapse/expand or jump to parent/child, Home/End ──
  list.addEventListener('keydown', e => {
    const link = e.target.closest?.('.hv-link')
    if (!link) return
    const links = [...list.querySelectorAll('.hv-link')]
    const i = links.indexOf(link)
    const node = link.closest('.hv-node')
    const id = node.dataset.id
    const tw = node.querySelector(':scope > .hv-row .hv-tw')
    const focusLink = l => { if (l) { e.preventDefault(); l.focus(); l.scrollIntoView({ block: 'nearest' }) } }
    if (e.key === 'ArrowDown') focusLink(links[i + 1])
    else if (e.key === 'ArrowUp') focusLink(links[i - 1])
    else if (e.key === 'Home') focusLink(links[0])
    else if (e.key === 'End') focusLink(links[links.length - 1])
    else if (e.key === 'ArrowRight') {
      e.preventDefault()
      if (tw && tw.getAttribute('aria-expanded') === 'false') { toggle(id, true); list.querySelector(`.hv-node[data-id="${CSS.escape(id)}"] .hv-link`)?.focus() } else focusLink(node.querySelector(':scope > .hv-kids .hv-link'))
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      if (tw && tw.getAttribute('aria-expanded') === 'true' && !state.query) { toggle(id, false); list.querySelector(`.hv-node[data-id="${CSS.escape(id)}"] .hv-link`)?.focus() } else focusLink(node.parentElement.closest('.hv-node')?.querySelector(':scope > .hv-row .hv-link'))
    }
  })

  let searchTimer
  search.addEventListener('input', () => {
    clearTimeout(searchTimer)
    searchTimer = later(() => { state.query = search.value.trim(); state.limit = ROW_BUDGET; render() }, 160)
  })
  search.addEventListener('keydown', e => {
    if (e.key === 'Escape' && search.value) { e.preventDefault(); search.value = ''; state.query = ''; render() }
  })
  expandBtn.addEventListener('click', () => { state.collapsed.clear(); render() })
  collapseBtn.addEventListener('click', () => {
    for (const n of state.nodes) state.collapsed.add(n.id)
    render()
  })
  clearBtn.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Clear your research trail?',
      body: `This permanently deletes every recorded page and trail on this device, across all dates${state.range === 'all' && state.nodes.length ? ` (${state.nodes.length.toLocaleString()} pages)` : ''}. Your notes, highlights and knowledge graph are not affected.`,
      confirm: 'Clear history',
      danger: true,
    })
    if (!ok || !alive) return
    try {
      const res = await chrome.runtime.sendMessage({ type: 'HISTORY_CLEAR' })
      if (!res?.ok) throw new Error(res?.error || 'No response')
      state.collapsed.clear()
      ctx.toast('Research trail cleared')
      await load({ quiet: true })
    } catch (e) {
      ctx.toast(`Couldn’t clear history: ${e?.message || e}`)
    }
  })

  // Live updates while you browse in other tabs: one refresh per burst (700 ms quiet), and never more than
  // ~2 s behind a steady stream of changes.
  let pending = 0
  let burstStart = 0
  const offDb = ctx.onDbChange(evt => {
    if (evt?.store !== 'history') return
    if (evt.op === 'put' && typeof evt.key === 'string' && evt.key) dirty.add(evt.key)
    else reloadAll = true
    const now = Date.now()
    if (!pending) burstStart = now
    clearTimeout(pending)
    timers.delete(pending)
    pending = later(() => { pending = 0; applyChanges() }, Math.max(0, Math.min(700, burstStart + 2000 - now)))
  })

  load()

  return {
    unmount() {
      alive = false
      offDb()
      for (const t of timers) clearTimeout(t)
      timers.clear()
      document.querySelectorAll('dialog.mm-dlg').forEach(d => d.close())
    },
  }
}
