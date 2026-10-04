// Smart Color-Coded Highlighter (content script, classic IIFE).
//
// Select text → a radial tag menu (Shadow DOM) → the range is wrapped across text nodes in <mm-mark> elements
// and saved through the background (HL_SAVE; content scripts can't reach our IndexedDB). On load and after SPA
// navigation the page's highlights are re-anchored by searching a whitespace-normalized index of the document
// text for each quote and picking the occurrence whose prefix/suffix match best. Unresolved ones are retried on
// a throttled MutationObserver (late-loading content) with a retry limit.
(() => {
  const MM = globalThis.MM
  if (!MM || MM.__skip) return

  // ───────── constants ─────────
  /** Mirror of DEFAULT_TAGS in lib/store.js (used until synced settings arrive). */
  const DEFAULT_TAGS = [
    { id: 'fact', name: 'Important Fact', color: '#22D3EE' },
    { id: 'action', name: 'Action Item', color: '#A3E635' },
    { id: 'question', name: 'Question / Unclear', color: '#F472B6' },
    { id: 'code', name: 'Code Snippet', color: '#A78BFA' },
    { id: 'note', name: 'Note', color: '#FBBF24' },
  ]
  const CTX = 48 // chars of surrounding text kept for re-anchoring
  const MAX_CHARS = 20000
  const RETRY_LIMIT = 15 // observer-driven re-anchor attempts per page
  const LOST_LIMIT = 8 // times we re-anchor highlights the page's own re-render removed
  const CHUNK = 150 // text nodes wrapped per task when a highlight spans many nodes
  const AMBER = '#FBBF24'
  const FALLBACK_COLOR = '#94A3B8'
  const SKIP = new Set(['script', 'style', 'noscript', 'template', 'textarea', 'select', 'option', 'optgroup', 'iframe', 'object', 'embed', 'canvas', 'svg', 'math', 'input', 'video', 'audio', 'mm-host', 'head'])
  const BLOCK = 'p,div,li,ul,ol,dl,dt,dd,h1,h2,h3,h4,h5,h6,blockquote,pre,td,th,tr,table,caption,section,article,aside,header,footer,nav,main,figure,figcaption,form,fieldset,legend,details,summary,address,hr,body'
  const NO_WRAP_PARENT = new Set(['table', 'thead', 'tbody', 'tfoot', 'tr', 'colgroup', 'ul', 'ol', 'dl', 'select', 'optgroup'])
  const WS = /\s/
  const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches
  const sleep = ms => new Promise(r => setTimeout(r, ms))

  const ICON = {
    hl: '<svg viewBox="0 0 24 24"><path d="M9 11l-6 6v3h3l6-6M22 3l-9 9-3-3 9-9z"/></svg>',
    note: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/></svg>',
    copy: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
    hub: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
    pin: '<svg viewBox="0 0 24 24"><path d="M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  }

  // ───────── small helpers ─────────
  /** Build an element. `html` is only ever used with the constant ICON markup above. */
  function h(tag, props = {}, ...kids) {
    const el = document.createElement(tag)
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue
      if (k === 'class') el.className = v
      else if (k === 'text') el.textContent = v
      else if (k === 'html') el.innerHTML = v
      else if (k === 'style') el.style.cssText = v // CSSOM: not subject to the page's style-src CSP
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v)
      else el.setAttribute(k, v === true ? '' : String(v))
    }
    for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : String(c))
    return el
  }

  const colorOk = new Map()
  function safeColor(c) {
    if (typeof c !== 'string' || !c) return FALLBACK_COLOR
    if (!colorOk.has(c)) colorOk.set(c, (() => { try { return CSS.supports('color', c) } catch { return false } })())
    return colorOk.get(c) ? c : FALLBACK_COLOR
  }

  function getTags() {
    const t = MM.settings?.tags
    const list = Array.isArray(t) ? t.filter(x => x && typeof x.id === 'string' && x.id) : []
    return list.length ? list : DEFAULT_TAGS
  }
  function tagInfo(id) {
    const t = getTags().find(x => x.id === id)
    return t ? { id: t.id, name: String(t.name || t.id), color: safeColor(t.color) } : { id, name: id ? `Tag “${id}”` : 'Untagged', color: FALLBACK_COLOR }
  }
  function defaultTag() {
    const tags = getTags()
    const d = MM.settings?.defaultTag
    return (tags.find(t => t.id === d) || tags[0]).id
  }
  const menuEnabled = () => MM.settings?.showSelectionMenu !== false

  function timeAgo(ts) {
    const s = Math.round((Date.now() - (ts || 0)) / 1000)
    if (s < 60) return 'just now'
    const m = Math.round(s / 60); if (m < 60) return `${m}m ago`
    const hr = Math.round(m / 60); if (hr < 24) return `${hr}h ago`
    const d = Math.round(hr / 24); if (d < 30) return `${d}d ago`
    return new Date(ts).toLocaleDateString()
  }

  const norm = s => String(s || '').replace(/\s+/g, ' ').trim()
  const site = () => location.hostname.replace(/^www\./, '')

  async function copyText(text, layer) {
    try { await navigator.clipboard.writeText(text); return true } catch { /* not focused / no permission: fall back */ }
    try {
      const ta = h('textarea', { 'aria-hidden': 'true', style: 'position:fixed;left:-9999px;top:0;opacity:0' })
      ta.value = text
      ;(layer || document.body).appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch { return false }
  }

  /** Get one of our Shadow DOM hosts, re-attaching it if the page replaced <body>. */
  function ui(id, css) {
    const s = MM.shadow(id, css)
    if (!s.host.isConnected) (document.body || document.documentElement).appendChild(s.host)
    return s
  }

  // ───────── page text index ─────────
  // The page's text as one whitespace-collapsed string (runs of whitespace → one space, a virtual space between
  // blocks and at <br>), plus the text node that produced each slice of it, so positions map back to the DOM.
  function walker(root) {
    return document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (n.nodeType === 3) return NodeFilter.FILTER_ACCEPT
        const name = n.localName
        if (SKIP.has(name) || n.hasAttribute('data-mm-host')) return NodeFilter.FILTER_REJECT
        return name === 'br' ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP
      },
    })
  }

  function makeBlockOf(root) {
    const cache = new Map()
    return el => {
      let b = cache.get(el)
      if (b === undefined) { b = el.closest(BLOCK) || root; cache.set(el, b) }
      return b
    }
  }

  function buildIndex() {
    const root = document.body || document.documentElement
    const blockOf = makeBlockOf(root)
    const parts = []
    const entries = []
    let pos = 0, ws = true, lastBlock = null, brk = false
    const w = walker(root)
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (n.nodeType === 1) { brk = true; continue } // <br>
      const data = n.data
      const parent = n.parentElement
      if (!data || !parent) continue
      const block = blockOf(parent)
      if ((brk || (lastBlock && block !== lastBlock)) && !ws) { parts.push(' '); pos++; ws = true }
      lastBlock = block
      brk = false
      let t = data.replace(/\s+/g, ' ')
      if (ws && t.charCodeAt(0) === 32) t = t.slice(1)
      if (!t) continue
      entries.push({ node: n, start: pos, end: pos + t.length, ws0: ws })
      parts.push(t)
      pos += t.length
      ws = t.charCodeAt(t.length - 1) === 32
    }
    return { root, text: parts.join(''), entries, blockOf }
  }

  /** DOM offset of the character emitted at normalized position p within entry e, or -1. */
  function charIndexOf(e, p) {
    const data = e.node.data
    let ws = e.ws0, k = e.start
    for (let i = 0; i < data.length; i++) {
      const isWs = WS.test(data[i])
      if (isWs && ws) continue
      if (k === p) return i
      k++
      ws = isWs
    }
    return -1
  }

  /** Normalized position of DOM offset `offset` inside entry e. */
  function posOf(e, offset) {
    const data = e.node.data
    let ws = e.ws0, k = 0
    for (let i = 0; i < offset && i < data.length; i++) {
      const isWs = WS.test(data[i])
      if (isWs && ws) continue
      k++
      ws = isWs
    }
    return e.start + Math.min(k, e.end - e.start)
  }

  function firstEndAfter(entries, p) { // smallest i with entries[i].end > p
    let lo = 0, hi = entries.length - 1, ans = -1
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (entries[mid].end > p) { ans = mid; hi = mid - 1 } else lo = mid + 1 }
    return ans
  }
  function lastStartBefore(entries, q) { // largest i with entries[i].start < q
    let lo = 0, hi = entries.length - 1, ans = -1
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (entries[mid].start < q) { ans = mid; lo = mid + 1 } else hi = mid - 1 }
    return ans
  }

  function posToStart(idx, p) {
    const i = firstEndAfter(idx.entries, p)
    if (i < 0) return null
    const e = idx.entries[i]
    if (!e.node.isConnected) return null
    const off = charIndexOf(e, Math.max(p, e.start))
    return off < 0 ? null : { node: e.node, offset: off }
  }
  function posToEnd(idx, q) {
    const i = lastStartBefore(idx.entries, q)
    if (i < 0) return null
    const e = idx.entries[i]
    if (!e.node.isConnected) return null
    const off = charIndexOf(e, Math.min(q, e.end) - 1)
    return off < 0 ? null : { node: e.node, offset: off + 1 }
  }

  /** Map a live DOM Range to normalized [s, e) (trimmed), or null. */
  function rangeToSpan(idx, range) {
    const E = idx.entries
    if (!E.length) return null
    const before = (node, offset) => { try { return range.comparePoint(node, offset) } catch { return NaN } }
    // first entry whose end is not before the range start
    let lo = 0, hi = E.length - 1, a = -1
    while (lo <= hi) { const mid = (lo + hi) >> 1; const c = before(E[mid].node, E[mid].node.length); if (c >= 0) { a = mid; hi = mid - 1 } else lo = mid + 1 }
    // last entry whose start is not after the range end
    lo = 0; hi = E.length - 1
    let b = -1
    while (lo <= hi) { const mid = (lo + hi) >> 1; const c = before(E[mid].node, 0); if (c <= 0) { b = mid; lo = mid + 1 } else hi = mid - 1 }
    if (a < 0 || b < 0 || b < a) return null
    const ea = E[a], eb = E[b]
    let s = posOf(ea, ea.node === range.startContainer ? range.startOffset : 0)
    let e = posOf(eb, eb.node === range.endContainer ? range.endOffset : eb.node.length)
    const t = idx.text
    while (s < e && t.charCodeAt(s) === 32) s++
    while (e > s && t.charCodeAt(e - 1) === 32) e--
    return e > s ? { s, e } : null
  }

  /** Text nodes (with offsets) covering normalized [s, e), in document order. `brk` marks a block/<br> boundary. */
  function collectSlices(idx, s, e) {
    const a = posToStart(idx, s)
    const b = posToEnd(idx, e)
    if (!a || !b) return null
    if (a.node !== b.node && !(a.node.compareDocumentPosition(b.node) & Node.DOCUMENT_POSITION_FOLLOWING)) return null
    const w = walker(idx.root)
    w.currentNode = a.node
    const out = []
    let n = a.node, brk = false, lastBlock = null, guard = 0
    while (n) {
      if (n.nodeType === 1) brk = true
      else if (n.parentElement) {
        const from = n === a.node ? a.offset : 0
        const to = n === b.node ? b.offset : n.length
        const block = idx.blockOf(n.parentElement)
        if (lastBlock && block !== lastBlock) brk = true
        lastBlock = block
        if (to > from) { out.push({ node: n, from, to, brk: brk && out.length > 0 }); brk = false }
      }
      if (n === b.node) return out
      if (++guard > 500000) return null
      n = w.nextNode()
    }
    return null
  }

  /** Human-friendly quote: whitespace collapsed except in preformatted text, newlines between blocks. */
  function displayText(slices) {
    const preCache = new Map()
    const isPre = el => {
      if (!preCache.has(el)) { const ws = getComputedStyle(el).whiteSpace; preCache.set(el, /^(pre|break-spaces)/.test(ws)) }
      return preCache.get(el)
    }
    let out = ''
    for (const sl of slices) {
      const pre = isPre(sl.node.parentElement)
      let t = sl.node.data.slice(sl.from, sl.to)
      if (!pre) t = t.replace(/\s+/g, ' ')
      if (sl.brk && out) { out = out.replace(/[ \t]+$/, ''); if (!out.endsWith('\n')) out += '\n' }
      if (!pre && out.endsWith('\n')) t = t.replace(/^ /, '')
      out += t
    }
    return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  }

  /** Find a stored highlight in the index: every occurrence of the quote, best prefix/suffix match wins. */
  function locate(idx, rec) {
    const q = norm(rec.text)
    if (!q) return null
    const T = idx.text
    const prefix = String(rec.prefix || '').replace(/\s+/g, ' ')
    const suffix = String(rec.suffix || '').replace(/\s+/g, ' ')
    const find = (hay, needle) => {
      const hits = []
      for (let i = hay.indexOf(needle); i >= 0 && hits.length < 2000; i = hay.indexOf(needle, i + 1)) hits.push(i)
      return hits
    }
    let hits = find(T, q)
    let hay = T, pre = prefix, suf = suffix
    if (!hits.length) { // case differences (text-transform in source, edited capitalization)
      const lower = T.toLowerCase()
      if (lower.length === T.length) { hits = find(lower, q.toLowerCase()); hay = lower; pre = prefix.toLowerCase(); suf = suffix.toLowerCase() }
    }
    if (!hits.length) return null
    let best = hits[0], bestScore = -1
    for (const i of hits) {
      let a = 0
      while (a < pre.length && i - 1 - a >= 0 && hay[i - 1 - a] === pre[pre.length - 1 - a]) a++
      let b = 0
      const j = i + q.length
      while (b < suf.length && j + b < hay.length && hay[j + b] === suf[b]) b++
      if (a + b > bestScore) { bestScore = a + b; best = i }
      if (bestScore >= pre.length + suf.length) break
    }
    return { s: best, e: best + q.length }
  }

  // ───────── marks ─────────
  const markCss = c => `--mm-hl:${c};background-color:color-mix(in srgb,${c} 24%,transparent);box-shadow:inset 0 -2px 0 color-mix(in srgb,${c} 88%,transparent),0 0 10px color-mix(in srgb,${c} 26%,transparent);color:inherit;border-radius:3px;cursor:pointer;-webkit-box-decoration-break:clone;box-decoration-break:clone;transition:background-color .2s ease,box-shadow .2s ease,filter .2s ease;`
  const PIN_CSS = `display:inline-block;width:11px;height:11px;margin:0 2px 0 4px;vertical-align:.42em;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:radial-gradient(circle at 50% 50%,#2A1D02 0 1.7px,${AMBER} 2.3px);box-shadow:0 0 0 1.5px rgba(251,191,36,.25),0 0 10px rgba(251,191,36,.85);cursor:pointer;line-height:0;font-size:0;padding:0;border:0;`

  let pendingColor = AMBER
  function ensurePageStyle() {
    let st = document.getElementById('mm-page-style-highlight')
    if (!st) {
      st = document.createElement('style')
      st.id = 'mm-page-style-highlight'
      ;(document.head || document.documentElement).appendChild(st)
    }
    const css = `mm-mark[data-mm-hl]:hover{filter:brightness(1.12) saturate(1.15)}
mm-mark[data-mm-hl]:focus-visible{outline:2px solid var(--mm-hl);outline-offset:2px}
mm-mark[data-mm-hl][data-mm-pulse]{animation:mm-hl-pulse 1.1s cubic-bezier(.2,.8,.2,1) 2}
@keyframes mm-hl-pulse{0%,100%{box-shadow:inset 0 -2px 0 var(--mm-hl),0 0 10px color-mix(in srgb,var(--mm-hl) 26%,transparent)}50%{background-color:color-mix(in srgb,var(--mm-hl) 42%,transparent);box-shadow:inset 0 -2px 0 var(--mm-hl),0 0 0 4px color-mix(in srgb,var(--mm-hl) 30%,transparent),0 0 30px var(--mm-hl)}}
mm-pin[data-mm-pin]:hover,mm-pin[data-mm-pin]:focus-visible{filter:brightness(1.15);box-shadow:0 0 0 3px rgba(251,191,36,.35),0 0 16px rgba(251,191,36,1)!important;outline:none}
::highlight(mm-pending){background-color:color-mix(in srgb,${pendingColor} 30%,transparent);color:inherit}
@media (prefers-reduced-motion:reduce){mm-mark[data-mm-hl]{transition:none!important}mm-mark[data-mm-hl][data-mm-pulse]{animation:none;outline:2px solid var(--mm-hl);outline-offset:2px}}`
    if (st.textContent !== css) st.textContent = css
  }

  function makeMark(id, color) {
    const m = document.createElement('mm-mark')
    m.dataset.mmHl = id
    m.style.cssText = markCss(color)
    return m
  }

  async function wrapSlices(slices, id, color) {
    ensurePageStyle()
    const targets = slices.filter(sl => sl.node.parentElement && !NO_WRAP_PARENT.has(sl.node.parentElement.localName) && /\S/.test(sl.node.data.slice(sl.from, sl.to)))
    const marks = []
    const one = sl => {
      let n = sl.node
      if (!n.parentNode || n.length < sl.to) return
      if (sl.from > 0) n = n.splitText(sl.from)
      if (sl.to - sl.from < n.length) n.splitText(sl.to - sl.from)
      const m = makeMark(id, color)
      n.parentNode.insertBefore(m, n)
      m.appendChild(n)
      marks.push(m)
    }
    if (targets.length <= 200) targets.forEach(one)
    else {
      for (let i = 0; i < targets.length; i += CHUNK) {
        targets.slice(i, i + CHUNK).forEach(one)
        quiet()
        await sleep(0)
      }
    }
    quiet()
    return marks
  }

  function mergeAdjacent(node) {
    if (!node || node.nodeType !== 3 || !node.parentNode) return
    let base = node
    const prev = node.previousSibling
    if (prev && prev.nodeType === 3) { prev.appendData(node.data); node.remove(); base = prev }
    const next = base.nextSibling
    if (next && next.nodeType === 3) { base.appendData(next.data); next.remove() }
  }

  function unwrapMarks(marks) {
    for (const m of marks) {
      for (const c of [...m.children]) if (c.localName === 'mm-pin') c.remove()
      const nx = m.nextSibling
      if (nx?.localName === 'mm-pin' && nx.dataset.mmPin === m.dataset.mmHl) nx.remove()
      if (!m.parentNode) continue
      const kids = [...m.childNodes]
      m.replaceWith(...kids)
      if (kids.length) { mergeAdjacent(kids[0]); if (kids.length > 1) mergeAdjacent(kids[kids.length - 1]) }
    }
    quiet()
  }

  /** Style, accessibility and the Quick-Note pin for a rendered highlight. */
  function decorate(it) {
    const tag = tagInfo(it.rec.tag)
    it.marks.forEach((m, i) => {
      m.style.cssText = markCss(tag.color)
      if (i === 0) {
        m.tabIndex = 0
        m.setAttribute('role', 'button')
        m.setAttribute('aria-label', `Highlight, ${tag.name}${it.rec.note ? ', has a note' : ''}: ${norm(it.rec.text).slice(0, 90)}. Press Enter for options.`)
      }
    })
    const last = it.marks[it.marks.length - 1]
    let pin = it.pin && it.pin.isConnected ? it.pin : null
    if (it.rec.note && last) {
      if (!pin) {
        pin = document.createElement('mm-pin')
        pin.dataset.mmPin = it.rec.id
        pin.tabIndex = 0
        pin.setAttribute('role', 'button')
        pin.style.cssText = PIN_CSS
      }
      pin.setAttribute('aria-label', `Quick note: ${it.rec.note.slice(0, 80)}`)
      if (pin.previousSibling !== last) last.after(pin)
      it.pin = pin
    } else if (pin) { pin.remove(); it.pin = null }
    quiet()
  }

  // ───────── state ─────────
  const items = new Map() // id → { rec, marks, pin }
  const unresolved = new Map() // id → rec
  let gen = 0
  let attempts = 0
  let lostBudget = LOST_LIMIT
  let seq = 0
  let chain = Promise.resolve()
  /** Serialize everything that rewrites the DOM, so restores, creates and removals never interleave. */
  const exclusive = fn => { const p = chain.then(fn); chain = p.catch(() => {}); return p }

  function removeLocal(id) {
    const it = items.get(id)
    if (it) { unwrapMarks(it.marks); it.pin?.remove(); items.delete(id) }
    unresolved.delete(id)
    if (pop.id === id) closePopover()
    if (noteCard.id === id) closeNote()
    ensureObserver()
    return !!it
  }

  /** Anchor every unresolved highlight against one index; wrap later ones first so earlier positions stay valid. */
  async function anchorPending(my) {
    if (!unresolved.size || !document.body) return 0
    let idx = buildIndex()
    const found = []
    for (const rec of unresolved.values()) {
      const span = locate(idx, rec)
      if (span) found.push({ rec, ...span })
    }
    found.sort((a, b) => b.s - a.s)
    let placed = 0
    for (const f of found) {
      if (my !== gen) return placed
      const color = tagInfo(f.rec.tag).color
      let slices = collectSlices(idx, f.s, f.e)
      if (!slices) { idx = buildIndex(); slices = collectSlices(idx, f.s, f.e) } // overlapping highlight split our nodes
      if (!slices) continue
      const marks = await wrapSlices(slices, f.rec.id, color)
      if (!marks.length) continue
      const it = { rec: f.rec, marks, pin: null }
      items.set(f.rec.id, it)
      unresolved.delete(f.rec.id)
      decorate(it)
      placed++
    }
    ensureObserver()
    return placed
  }

  /** Diff the stored list against what's on the page: unwrap removed, restyle changed, anchor new. */
  async function render(list, my) {
    const incoming = new Map(list.map(r => [r.id, r]))
    for (const id of [...items.keys()]) if (!incoming.has(id)) removeLocal(id)
    for (const id of [...unresolved.keys()]) if (!incoming.has(id)) unresolved.delete(id)
    for (const [id, rec] of incoming) {
      const it = items.get(id)
      if (!it) { unresolved.set(id, rec); continue }
      if (it.rec.tag !== rec.tag || it.rec.note !== rec.note || it.rec.updated !== rec.updated) {
        const textChanged = norm(it.rec.text) !== norm(rec.text)
        if (textChanged) { unwrapMarks(it.marks); it.pin?.remove(); items.delete(id); unresolved.set(id, rec); continue }
        it.rec = rec
        decorate(it)
        if (pop.id === id) renderPopover()
        if (noteCard.id === id && !noteCard.dirty) renderNote()
      }
    }
    attempts = 0
    await anchorPending(my)
  }

  let ready = Promise.resolve()
  /** (Re)load this page's highlights from the background and render them. */
  function restore() {
    const my = ++gen
    const key = MM.pageKey()
    const p = (async () => {
      const res = await MM.send('HL_LIST', { pageKey: key })
      if (my !== gen || key !== MM.pageKey() || !res?.ok) return 0
      await exclusive(() => (my === gen ? render(res.items || [], my) : null))
      return items.size
    })()
    ready = p.catch(() => 0)
    return p
  }

  // ───────── late content / lost marks (throttled MutationObserver) ─────────
  let observer = null
  let checkTimer = 0
  function quiet() { observer?.takeRecords() } // drop records caused by our own writes
  function ensureObserver() {
    const need = items.size > 0 || unresolved.size > 0
    if (need && !observer && document.body) {
      observer = new MutationObserver(() => { if (!checkTimer) checkTimer = setTimeout(runCheck, 700) })
      observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    } else if (!need && observer) { observer.disconnect(); observer = null; clearTimeout(checkTimer); checkTimer = 0 }
  }
  function runCheck() {
    checkTimer = 0
    if (!MM.alive()) { observer?.disconnect(); observer = null; return }
    const my = gen
    exclusive(async () => {
      if (my !== gen) return
      let lost = 0
      for (const [id, it] of [...items]) {
        if (it.marks.every(m => m.isConnected)) continue
        unwrapMarks(it.marks.filter(m => m.isConnected))
        it.pin?.remove()
        items.delete(id)
        unresolved.set(id, it.rec)
        lost++
      }
      if (lost && lostBudget > 0) { lostBudget--; attempts = Math.min(attempts, RETRY_LIMIT - 3) }
      if (unresolved.size && attempts < RETRY_LIMIT) {
        attempts++
        const run = () => anchorPending(my)
        if (globalThis.requestIdleCallback) await new Promise(r => requestIdleCallback(() => run().then(r, r), { timeout: 1200 }))
        else await run()
      }
      ensureObserver()
    })
  }

  // ───────── create / update / delete ─────────
  function selectable(range) {
    if (!range || range.collapsed) return false
    const ae = document.activeElement
    if (ae && (/^(input|textarea|select)$/.test(ae.localName) || ae.isContentEditable)) return false
    for (const n of [range.startContainer, range.endContainer, range.commonAncestorContainer]) {
      const el = n?.nodeType === 1 ? n : n?.parentElement
      if (!el) return false
      if (MM.isOwn(el) || el.isContentEditable || el.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])')) return false
    }
    return true
  }

  function createHighlight(range, tagId, note = '') {
    return exclusive(async () => {
      if (!document.body) return { ok: false, error: 'This page has no text to highlight' }
      const tag = getTags().some(t => t.id === tagId) ? tagId : defaultTag()
      const idx = buildIndex()
      const span = rangeToSpan(idx, range)
      if (!span) return fail('There’s no text in this selection to highlight.')
      if (span.e - span.s > MAX_CHARS) return fail(`That selection is too long to highlight (max ${MAX_CHARS.toLocaleString()} characters).`)
      const slices = collectSlices(idx, span.s, span.e)
      if (!slices) return fail('Couldn’t highlight this selection.')
      const text = displayText(slices)
      const now = Date.now()
      const rec = {
        pageKey: MM.pageKey(), url: location.href, title: (document.title || '').trim() || site(), site: site(),
        text, prefix: idx.text.slice(Math.max(0, span.s - CTX), span.s), suffix: idx.text.slice(span.e, span.e + CTX),
        tag, note: String(note || '').trim(), created: now, updated: now,
      }
      const tempId = `mm-new-${++seq}`
      const marks = await wrapSlices(slices, tempId, tagInfo(tag).color)
      if (!marks.length) return fail('Couldn’t highlight this selection.')
      try { getSelection()?.removeAllRanges() } catch { /* ignore */ }
      const res = await MM.send('HL_SAVE', { highlight: rec })
      if (!res?.ok || !res.highlight?.id) {
        unwrapMarks(marks)
        return fail(res ? `Couldn’t save the highlight: ${res.error || 'unknown error'}` : 'Master Mind was updated. Reload this page to keep highlighting.')
      }
      const saved = res.highlight
      for (const m of marks) m.dataset.mmHl = saved.id
      const it = { rec: saved, marks, pin: null }
      items.set(saved.id, it)
      decorate(it)
      ensureObserver()
      return { ok: true, id: saved.id }
    })
  }
  function fail(msg) { MM.toast(msg); return { ok: false, error: msg } }

  async function saveFields(id, patch) {
    const it = items.get(id)
    const before = it ? { ...it.rec } : null
    if (it) { Object.assign(it.rec, patch); decorate(it) }
    const res = await MM.send('HL_SAVE', { highlight: { id, ...patch } })
    if (!res?.ok) {
      if (it && before) { it.rec = before; decorate(it) }
      MM.toast(res ? `Couldn’t save: ${res.error || 'unknown error'}` : 'Master Mind was updated. Reload this page to edit highlights.')
      return false
    }
    const cur = items.get(id)
    if (cur) { cur.rec = res.highlight; decorate(cur) }
    return true
  }

  async function deleteHighlight(id) {
    const rec = items.get(id)?.rec || unresolved.get(id)
    if (!rec) return false
    await exclusive(() => removeLocal(id))
    const res = await MM.send('HL_DELETE', { id })
    if (!res?.ok) {
      await exclusive(() => { unresolved.set(id, rec); return anchorPending(gen) })
      MM.toast(res ? `Couldn’t delete: ${res.error || 'unknown error'}` : 'Master Mind was updated. Reload this page to edit highlights.')
      return false
    }
    showUndo(rec)
    return true
  }

  async function focusHighlight(id) {
    await ready
    await chain
    let it = items.get(id)
    let relisted = false
    const deadline = Date.now() + 5000
    while (!it && Date.now() < deadline) {
      if (!unresolved.has(id)) {
        if (relisted) break // not a highlight of this page (deleted, or another URL)
        relisted = true
        await restore().catch(() => 0)
      } else {
        const my = gen
        await exclusive(() => anchorPending(my)) // late content may have arrived since the last pass
      }
      it = items.get(id)
      if (!it && unresolved.has(id)) await sleep(400)
    }
    if (!it || !it.marks[0]?.isConnected) {
      if (unresolved.has(id)) MM.toast('Couldn’t find that highlight on this page. Its text may have changed.')
      return { ok: true, found: false }
    }
    it.marks[0].scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' })
    for (const m of it.marks) { m.removeAttribute('data-mm-pulse'); void m.offsetWidth; m.setAttribute('data-mm-pulse', '') }
    setTimeout(() => { for (const m of it.marks) m.removeAttribute('data-mm-pulse') }, 2400)
    return { ok: true, found: true }
  }

  // ───────── radial selection menu ─────────
  const MENU_CSS = `
  .ring{position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;z-index:2}
  .disc{position:absolute;border-radius:50%;pointer-events:auto;background:radial-gradient(closest-side,rgba(12,14,21,.9),rgba(18,21,31,.94) 64%,rgba(24,28,41,.96));border:1px solid var(--mm-border-strong,rgba(255,255,255,.16));-webkit-backdrop-filter:blur(16px) saturate(140%);backdrop-filter:blur(16px) saturate(140%);box-shadow:0 18px 50px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.05),0 0 40px color-mix(in srgb,var(--mm-accent,#22D3EE) 12%,transparent);opacity:0;transform:scale(.55);transition:opacity .16s ease,transform .24s cubic-bezier(.2,.8,.2,1)}
  .ring.open .disc{opacity:1;transform:none}
  .core{position:absolute;left:-16px;top:-16px;width:32px;height:32px;border-radius:50%;display:grid;place-items:center;padding:0;margin:0;cursor:pointer;pointer-events:auto;color:var(--mm-heading,#F7F8FC);border:1px solid var(--mm-border-strong,rgba(255,255,255,.16));background:linear-gradient(135deg,color-mix(in srgb,var(--mm-accent,#22D3EE) 26%,#10121A),color-mix(in srgb,var(--mm-accent-2,#A78BFA) 26%,#10121A));box-shadow:0 0 16px color-mix(in srgb,var(--mm-accent,#22D3EE) 25%,transparent);opacity:0;transition:opacity .2s ease}
  .ring.open .core{opacity:1}
  .core svg,.it svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
  .core .x{display:none}.core:hover .x{display:block}.core:hover .hl{display:none}
  .it{position:absolute;left:-17px;top:-17px;width:34px;height:34px;border-radius:50%;border:0;padding:0;margin:0;cursor:pointer;pointer-events:auto;display:grid;place-items:center;opacity:0;transform:translate(0,0) scale(.3);transition:transform .28s cubic-bezier(.2,.8,.2,1) calc(var(--i) * 22ms),opacity .2s ease calc(var(--i) * 22ms),box-shadow .16s ease}
  .ring.open .it{opacity:1;transform:translate(var(--x),var(--y))}
  .ring.open .it:hover,.ring.open .it.on{transform:translate(var(--x),var(--y)) scale(1.16);transition-delay:0s}
  .it.tag{background:radial-gradient(circle at 32% 28%,color-mix(in srgb,var(--c) 45%,#fff) 0,var(--c) 52%,color-mix(in srgb,var(--c) 62%,#000) 100%);box-shadow:0 0 0 2px rgba(11,12,16,.9),0 0 14px color-mix(in srgb,var(--c) 55%,transparent)}
  .it.tag:hover,.it.tag.on{box-shadow:0 0 0 2px rgba(11,12,16,.9),0 0 0 3.5px var(--c),0 0 24px var(--c)}
  .it.tool{background:rgba(32,37,54,.96);color:var(--c);box-shadow:inset 0 0 0 1px rgba(255,255,255,.14),0 0 12px color-mix(in srgb,var(--c) 22%,transparent)}
  .it.tool:hover,.it.tool.on{box-shadow:inset 0 0 0 1.5px var(--c),0 0 20px color-mix(in srgb,var(--c) 55%,transparent)}
  .it:focus-visible,.core:focus-visible{outline:2px solid #fff;outline-offset:3px;border-radius:50%}
  .cap{position:absolute;left:0;transform:translateX(-50%);display:flex;align-items:center;gap:7px;white-space:nowrap;padding:7px 12px;border-radius:999px;background:rgba(18,21,31,.94);border:1px solid var(--mm-border-strong,rgba(255,255,255,.16));color:var(--mm-fg,#ECEFF7);font:600 12px/1 var(--mm-font);box-shadow:0 10px 30px rgba(0,0,0,.45);opacity:0;transition:opacity .2s ease .06s;pointer-events:none}
  .ring.open .cap{opacity:1}
  .cap .d{width:8px;height:8px;border-radius:50%;background:var(--c);box-shadow:0 0 8px var(--c)}
  .cap .k{color:var(--mm-muted,#7D8498);font-weight:500}
  .cap kbd{font:600 10px/1 var(--mm-mono);padding:2px 5px;border-radius:5px;border:1px solid var(--mm-border-strong,rgba(255,255,255,.16));color:var(--mm-fg-2,#B6BCCC);background:rgba(255,255,255,.04)}
  .panel{position:fixed;width:304px;max-width:calc(100vw - 24px);padding:12px;border-radius:14px;display:flex;flex-direction:column;gap:10px;background:rgba(18,21,31,.92);border:1px solid var(--mm-border-strong,rgba(255,255,255,.16));-webkit-backdrop-filter:blur(16px) saturate(140%);backdrop-filter:blur(16px) saturate(140%);box-shadow:0 18px 50px rgba(0,0,0,.55),0 0 30px rgba(251,191,36,.08);animation:pin .18s cubic-bezier(.2,.8,.2,1)}
  @keyframes pin{from{opacity:0;transform:translateY(6px) scale(.98)}}
  .ph{display:flex;align-items:center;gap:8px;color:var(--mm-heading,#F7F8FC);font:700 13px/1.2 var(--mm-font)}
  .ph svg{width:16px;height:16px;fill:none;stroke:var(--mm-amber,#FBBF24);stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
  .quote{font-size:12px;line-height:1.45;color:var(--mm-fg-2,#B6BCCC);border-left:2px solid var(--c);padding:1px 0 1px 9px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
  .dots{display:flex;flex-wrap:wrap;gap:9px;align-items:center}
  .dot{width:20px;height:20px;border-radius:50%;border:0;padding:0;cursor:pointer;background:var(--c);box-shadow:0 0 0 2px rgba(11,12,16,.9),0 0 9px color-mix(in srgb,var(--c) 45%,transparent);transition:box-shadow .15s,transform .15s}
  .dot:hover{transform:scale(1.1)}
  .dot[aria-checked="true"],.dot[aria-pressed="true"]{box-shadow:0 0 0 2px rgba(11,12,16,.95),0 0 0 4px var(--c),0 0 16px var(--c)}
  .dot:focus-visible{outline:2px solid #fff;outline-offset:4px;border-radius:50%}
  .tname{font:600 12px/1 var(--mm-font);color:var(--mm-fg-2,#B6BCCC);margin-left:2px}
  .panel .mm-textarea{min-height:76px;font-size:13px}
  .pf{display:flex;align-items:center;gap:8px;justify-content:flex-end}
  .hint{margin-right:auto;font-size:11px;color:var(--mm-muted,#7D8498)}
  .hint kbd{font:600 10px/1 var(--mm-mono);padding:2px 5px;border-radius:5px;border:1px solid var(--mm-border-strong,rgba(255,255,255,.16));color:var(--mm-fg-2,#B6BCCC)}`

  const menu = { open: false, mode: '', range: null, text: '', els: [], defs: [], active: -1, prevFocus: null, openedAt: 0, x: 0, top: 0, bottom: 0, noteTag: '' }

  function selectionEnd(sel, range, evt) {
    const rects = [...range.getClientRects()].filter(r => r.width || r.height)
    let backwards = false
    try {
      if (sel.anchorNode && sel.focusNode) {
        backwards = sel.anchorNode === sel.focusNode ? sel.focusOffset < sel.anchorOffset
          : !!(sel.anchorNode.compareDocumentPosition(sel.focusNode) & Node.DOCUMENT_POSITION_PRECEDING)
      }
    } catch { /* detached */ }
    const r = backwards ? rects[0] : rects[rects.length - 1]
    if (r) return { x: backwards ? r.left : r.right, top: r.top, bottom: r.bottom }
    if (evt) return { x: evt.clientX, top: evt.clientY - 10, bottom: evt.clientY + 10 }
    const b = range.getBoundingClientRect()
    return { x: b.right, top: b.top, bottom: b.bottom }
  }

  function openMenu(range, anchor) {
    closeMenu(false)
    closePopover()
    closeNote(true)
    const { layer } = ui('highlight-menu', MENU_CSS)
    const tags = getTags().map(t => ({ kind: 'tag', id: t.id, label: t.name, color: safeColor(t.color) }))
    const defs = [...tags,
      { kind: 'note', label: 'Add a Quick-Note', color: AMBER, icon: ICON.note },
      { kind: 'copy', label: 'Copy text', color: '#22D3EE', icon: ICON.copy }]
    const n = defs.length
    const R = Math.max(50, Math.ceil(42 / (2 * Math.sin(Math.PI / n))))
    const D = R + 25 // disc radius
    const vw = document.documentElement.clientWidth || innerWidth
    const vh = document.documentElement.clientHeight || innerHeight
    const cx = Math.min(Math.max(anchor.x, D + 10), vw - D - 10)
    let cy = anchor.bottom + R + 16
    if (cy + D + 44 > vh) cy = anchor.top - R - 16
    cy = Math.min(Math.max(cy, D + 10), vh - D - 44)

    const ring = h('div', { class: 'ring', role: 'menu', 'aria-label': 'Highlight selection', style: `left:${cx}px;top:${cy}px` })
    ring.append(h('div', { class: 'disc', style: `left:${-D}px;top:${-D}px;width:${2 * D}px;height:${2 * D}px` }))
    const els = defs.map((d, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / n
      const b = h('button', {
        type: 'button', class: `it ${d.kind === 'tag' ? 'tag' : 'tool'}`, role: 'menuitem', tabindex: '-1', 'aria-label': d.kind === 'tag' ? `Highlight as ${d.label}` : d.label,
        style: `--x:${(Math.cos(a) * R).toFixed(1)}px;--y:${(Math.sin(a) * R).toFixed(1)}px;--i:${i};--c:${d.color}`, html: d.icon || null,
      })
      b.addEventListener('click', e => { e.preventDefault(); pick(i) })
      b.addEventListener('mouseenter', () => setActive(i, false))
      b.addEventListener('mouseleave', () => { if (menu.active === i && !ring.contains(ring.getRootNode().activeElement)) setActive(-1, false) })
      b.addEventListener('focus', () => setActive(i, false))
      return b
    })
    const core = h('button', { type: 'button', class: 'core', 'aria-label': 'Close menu', tabindex: '-1', html: `<span class="hl">${ICON.hl}</span><span class="x">${ICON.close}</span>` })
    core.addEventListener('click', e => { e.preventDefault(); closeMenu(true) })
    const cap = h('div', { class: 'cap', 'aria-hidden': 'true', style: `top:${R + 31}px` })
    ring.append(...els, core, cap)
    // Keep the page selection: clicks inside the menu must not move focus or collapse it.
    ring.addEventListener('mousedown', e => e.preventDefault())
    layer.replaceChildren(ring)
    Object.assign(menu, { open: true, mode: 'ring', range: range.cloneRange(), text: range.toString(), els, defs, active: -1, prevFocus: document.activeElement, openedAt: Date.now(), x: anchor.x, top: anchor.top, bottom: anchor.bottom, ring, cap, layer })
    setActive(-1, false)
    requestAnimationFrame(() => requestAnimationFrame(() => ring.classList.add('open')))
  }

  function setActive(i, focus) {
    menu.active = i
    menu.els.forEach((b, j) => b.classList.toggle('on', j === i))
    const cap = menu.cap
    if (!cap) return
    const d = menu.defs[i]
    if (d) {
      cap.replaceChildren(h('span', { class: 'd', style: `--c:${d.color}` }), h('span', { text: d.kind === 'tag' ? d.label : d.label }))
    } else {
      cap.replaceChildren(h('span', { text: 'Highlight' }), h('span', { class: 'k', text: '·' }), h('kbd', { text: 'Tab' }), h('kbd', { text: '←→' }), h('kbd', { text: 'Esc' }))
    }
    if (focus && menu.els[i]) menu.els[i].focus({ preventScroll: true })
  }

  function closeMenu(restoreFocus) {
    if (!menu.open) return
    const wasFocusInside = menu.layer && menu.layer.getRootNode().activeElement
    clearPending()
    menu.open = false
    menu.mode = ''
    menu.layer?.replaceChildren()
    if (restoreFocus && wasFocusInside) {
      const pf = menu.prevFocus
      if (pf && pf !== document.body && pf.isConnected && typeof pf.focus === 'function') pf.focus({ preventScroll: true })
      else wasFocusInside.blur?.()
    }
    menu.range = null
    menu.els = []
  }

  function liveRange() {
    const r = menu.range
    if (r && !r.collapsed && r.startContainer.isConnected && r.endContainer.isConnected) return r
    const sel = getSelection()
    return sel?.rangeCount && !sel.isCollapsed ? sel.getRangeAt(0) : null
  }

  async function pick(i) {
    const d = menu.defs[i]
    if (!d) return
    const range = liveRange()
    if (d.kind === 'copy') {
      const text = norm(menu.text) ? menu.text.trim() : ''
      const ok = text && await copyText(text, menu.layer)
      closeMenu(true)
      MM.toast(ok ? 'Copied to clipboard' : 'Couldn’t copy. Try Ctrl+C.')
      return
    }
    if (!range) { closeMenu(true); MM.toast('The selection changed. Select the text again.'); return }
    if (d.kind === 'note') return openNotePanel(range)
    closeMenu(true)
    await createHighlight(range, d.id)
  }

  function showPending(range, color) {
    pendingColor = color
    ensurePageStyle()
    try { if (globalThis.Highlight && CSS.highlights) CSS.highlights.set('mm-pending', new Highlight(range)) } catch { /* unsupported */ }
  }
  function clearPending() { try { CSS.highlights?.delete('mm-pending') } catch { /* unsupported */ } }

  function openNotePanel(range) {
    const { layer } = ui('highlight-menu', MENU_CSS)
    const tags = getTags()
    menu.noteTag = (tags.find(t => t.id === 'note') || tags.find(t => t.id === defaultTag()) || tags[0]).id
    const quote = h('div', { class: 'quote', text: norm(menu.text).slice(0, 220) })
    const name = h('span', { class: 'tname' })
    const dots = h('div', { class: 'dots', role: 'radiogroup', 'aria-label': 'Tag' })
    const sync = () => {
      const t = tagInfo(menu.noteTag)
      quote.style.setProperty('--c', t.color)
      name.textContent = t.name
      for (const b of dots.querySelectorAll('.dot')) {
        const on = b.dataset.tag === menu.noteTag
        b.setAttribute('aria-checked', String(on))
        b.tabIndex = on ? 0 : -1
      }
      showPending(range, t.color)
    }
    tags.forEach(t => {
      const b = h('button', { type: 'button', class: 'dot', role: 'radio', 'aria-label': t.name, title: t.name, 'data-tag': t.id, style: `--c:${safeColor(t.color)}` })
      b.addEventListener('click', () => { menu.noteTag = t.id; sync() })
      dots.append(b)
    })
    dots.append(name)
    dots.addEventListener('keydown', e => { // radio-group arrow keys
      if (!/^Arrow(Left|Right|Up|Down)$/.test(e.key)) return
      e.preventDefault()
      const i = tags.findIndex(t => t.id === menu.noteTag)
      const j = (i + (/Right|Down/.test(e.key) ? 1 : tags.length - 1)) % tags.length
      menu.noteTag = tags[j].id
      sync()
      dots.querySelector(`[data-tag="${CSS.escape(tags[j].id)}"]`)?.focus()
    })
    const ta = h('textarea', { class: 'mm-textarea', rows: '3', placeholder: 'Why does this matter? Add a thought…', 'aria-label': 'Note text', maxlength: '10000' })
    const save = h('button', { type: 'button', class: 'mm-btn primary sm', text: 'Save' })
    const cancel = h('button', { type: 'button', class: 'mm-btn ghost sm', text: 'Cancel' })
    const submit = async () => {
      const r = liveRange()
      const note = ta.value
      const tag = menu.noteTag
      closeMenu(true)
      if (!r) return MM.toast('The selection changed. Select the text again.')
      await createHighlight(r, tag, note)
    }
    save.addEventListener('click', submit)
    cancel.addEventListener('click', () => closeMenu(true))
    ta.addEventListener('keydown', e => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit() }
    })
    const panel = h('div', { class: 'panel', role: 'dialog', 'aria-label': 'Highlight with a Quick-Note' },
      h('div', { class: 'ph' }, h('span', { html: ICON.note, style: 'display:grid' }), h('span', { text: 'Quick-Note' })),
      quote, dots, ta,
      h('div', { class: 'pf' }, h('span', { class: 'hint' }, h('kbd', { text: 'Ctrl' }), ' ', h('kbd', { text: 'Enter' }), ' to save'), cancel, save))
    panel.addEventListener('mousedown', e => { if (e.target !== ta) e.preventDefault() })
    layer.replaceChildren(panel)
    menu.mode = 'note'
    menu.panel = panel
    menu.els = []
    sync()
    positionPanel()
    ta.focus({ preventScroll: true })
  }

  function positionPanel() {
    const p = menu.panel
    if (!p || menu.mode !== 'note') return
    const r = menu.range && menu.range.startContainer.isConnected ? [...menu.range.getClientRects()].filter(x => x.width || x.height) : []
    const last = r[r.length - 1]
    const anchor = last ? { x: last.right, top: r[0].top, bottom: last.bottom } : { x: menu.x, top: menu.top, bottom: menu.bottom }
    const vw = document.documentElement.clientWidth || innerWidth
    const vh = document.documentElement.clientHeight || innerHeight
    const w = p.offsetWidth, ht = p.offsetHeight
    const left = Math.min(Math.max(12, anchor.x - w / 2), vw - w - 12)
    let top = anchor.bottom + 12
    if (top + ht > vh - 12 && anchor.top - 12 - ht >= 12) top = anchor.top - 12 - ht
    p.style.left = `${left}px`
    p.style.top = `${Math.max(12, Math.min(top, vh - ht - 12))}px`
  }

  // ───────── popover (click a mark) ─────────
  const CARD_CSS = `
  .pop,.nc{position:fixed;max-width:calc(100vw - 24px);-webkit-backdrop-filter:blur(16px) saturate(140%);backdrop-filter:blur(16px) saturate(140%);animation:cin .18s cubic-bezier(.2,.8,.2,1)}
  @keyframes cin{from{opacity:0;transform:translateY(5px) scale(.98)}}
  .pop{width:304px;padding:12px;border-radius:14px;display:flex;flex-direction:column;gap:11px;background:rgba(18,21,31,.93);border:1px solid var(--mm-border-strong,rgba(255,255,255,.16));box-shadow:0 18px 50px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.05),0 0 26px color-mix(in srgb,var(--c) 14%,transparent)}
  .hd{display:flex;align-items:center;gap:8px;min-width:0}
  .hd .d{width:10px;height:10px;border-radius:50%;background:var(--c);box-shadow:0 0 10px var(--c);flex:none}
  .hd b{color:var(--mm-heading,#F7F8FC);font:700 13px/1.2 var(--mm-font);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .hd .when{color:var(--mm-muted,#7D8498);font-size:11.5px;white-space:nowrap}
  .hd .sp{flex:1}
  .x{width:26px;height:26px;border-radius:8px;border:0;background:transparent;color:var(--mm-fg-2,#B6BCCC);display:grid;place-items:center;cursor:pointer;padding:0}
  .x:hover{background:rgba(255,255,255,.07);color:var(--mm-fg,#ECEFF7)}
  .x svg,.act svg,.add svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
  .lbl{font:600 10.5px/1 var(--mm-font);letter-spacing:.07em;text-transform:uppercase;color:var(--mm-muted,#7D8498)}
  .dots{display:flex;flex-wrap:wrap;gap:9px;align-items:center}
  .dot{width:22px;height:22px;border-radius:50%;border:0;padding:0;cursor:pointer;background:var(--c);box-shadow:0 0 0 2px rgba(11,12,16,.9),0 0 9px color-mix(in srgb,var(--c) 45%,transparent);transition:box-shadow .15s,transform .15s}
  .dot:hover{transform:scale(1.1)}
  .dot[aria-pressed="true"]{box-shadow:0 0 0 2px rgba(11,12,16,.95),0 0 0 4px var(--c),0 0 16px var(--c)}
  .dot:focus-visible{outline:2px solid #fff;outline-offset:4px;border-radius:50%}
  .ta{width:100%;min-height:64px;max-height:220px;resize:none;font:13.5px/1.5 var(--mm-font);color:var(--mm-fg,#ECEFF7);background:rgba(0,0,0,.28);border:1px solid var(--mm-border-strong,rgba(255,255,255,.16));border-radius:9px;padding:8px 10px;outline:none;transition:border-color .15s,box-shadow .15s}
  .ta:focus{border-color:var(--mm-amber,#FBBF24);box-shadow:0 0 0 3px rgba(251,191,36,.18)}
  .ta::placeholder{color:var(--mm-muted,#7D8498)}
  .st{font-size:11px;color:var(--mm-muted,#7D8498);min-height:14px}
  .st.ok{color:var(--mm-lime,#A3E635)}.st.err{color:var(--mm-red,#FB7185)}
  .add{align-self:flex-start}
  .acts{display:flex;align-items:center;gap:6px;padding-top:2px;border-top:1px solid var(--mm-border,rgba(255,255,255,.08));padding-top:10px}
  .acts .sp{flex:1}
  .nc{width:288px;padding:10px 12px 9px;border-radius:13px;display:flex;flex-direction:column;gap:4px;background:linear-gradient(180deg,rgba(251,191,36,.10),rgba(251,191,36,.03)),rgba(18,21,31,.93);border:1px solid rgba(251,191,36,.34);box-shadow:0 16px 44px rgba(0,0,0,.55),0 0 26px rgba(251,191,36,.12)}
  .nh{display:flex;align-items:center;gap:7px;font:700 10.5px/1 var(--mm-font);letter-spacing:.08em;text-transform:uppercase;color:var(--mm-amber,#FBBF24)}
  .nh svg{width:13px;height:13px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
  .nh .tg{color:var(--mm-muted,#7D8498);font-weight:600;letter-spacing:.04em;text-transform:none;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .nh .sp{flex:1}
  .nc .ta{background:transparent;border-color:transparent;padding:6px 8px;margin:0 -8px;width:calc(100% + 16px);min-height:40px}
  .nc .ta:hover{border-color:var(--mm-border,rgba(255,255,255,.08))}
  .nc .ta:focus{background:rgba(0,0,0,.25);border-color:rgba(251,191,36,.5)}
  .nf{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:11px;color:var(--mm-muted,#7D8498)}
  .nf kbd,.kb{font:600 10px/1 var(--mm-mono);padding:2px 5px;border-radius:5px;border:1px solid var(--mm-border-strong,rgba(255,255,255,.16));color:var(--mm-fg-2,#B6BCCC)}
  .undo{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);display:flex;align-items:center;gap:12px;padding:7px 7px 7px 14px;border-radius:12px;background:rgba(26,30,44,.94);border:1px solid var(--mm-border-strong,rgba(255,255,255,.16));-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px);box-shadow:0 10px 40px rgba(0,0,0,.45);font:600 13px/1.2 var(--mm-font);color:var(--mm-fg,#ECEFF7);animation:uin .2s cubic-bezier(.2,.8,.2,1)}
  @keyframes uin{from{opacity:0;transform:translate(-50%,6px)}}`

  const pop = { id: null, el: null, anchor: null, rectIndex: 0, byKeyboard: false, timer: 0, dirty: false, editing: false }

  function markRects(el) { return [...el.getClientRects()].filter(r => r.width || r.height) }

  function openPopover(id, markEl, { byKeyboard = false, point = null } = {}) {
    const it = items.get(id)
    if (!it) return
    closeMenu(false)
    closeNote(true)
    if (pop.id && pop.id !== id) closePopover()
    const rects = markRects(markEl)
    let ri = 0
    if (point && rects.length > 1) {
      let bestD = Infinity
      rects.forEach((r, i) => { const d = Math.abs((r.top + r.bottom) / 2 - point.y) + (point.x < r.left ? r.left - point.x : point.x > r.right ? point.x - r.right : 0); if (d < bestD) { bestD = d; ri = i } })
    }
    Object.assign(pop, { id, anchor: markEl, rectIndex: ri, byKeyboard, dirty: false, editing: !!it.rec.note })
    renderPopover()
    if (byKeyboard) pop.el?.querySelector('.dot[aria-pressed="true"]')?.focus({ preventScroll: true })
  }

  function renderPopover() {
    const it = items.get(pop.id)
    if (!it) return closePopover()
    const { layer } = ui('highlight-card', CARD_CSS)
    const rec = it.rec
    const tag = tagInfo(rec.tag)
    const prevTa = pop.el?.querySelector('.ta')
    const keepDraft = pop.dirty && prevTa ? prevTa.value : null
    const hadFocus = pop.el && layer.getRootNode().activeElement && pop.el.contains(layer.getRootNode().activeElement) ? layer.getRootNode().activeElement.className : ''

    const close = h('button', { type: 'button', class: 'x', 'aria-label': 'Close', html: ICON.close })
    close.addEventListener('click', () => closePopover(true))
    const dots = h('div', { class: 'dots', role: 'group', 'aria-label': 'Change tag' })
    for (const t of getTags()) {
      const c = safeColor(t.color)
      const b = h('button', { type: 'button', class: 'dot', title: t.name, 'aria-label': t.name, 'aria-pressed': String(t.id === rec.tag), 'data-tag': t.id, style: `--c:${c}` })
      b.addEventListener('click', () => { if (t.id !== rec.tag) saveFields(rec.id, { tag: t.id }).then(() => renderPopover()) })
      dots.append(b)
    }
    const status = h('div', { class: 'st', role: 'status', 'aria-live': 'polite' })
    let noteBox
    if (pop.editing) {
      const ta = h('textarea', { class: 'ta', placeholder: 'Write a Quick-Note…', 'aria-label': 'Note', maxlength: '10000' })
      ta.value = keepDraft ?? rec.note ?? ''
      const commit = async () => {
        if (!pop.dirty) return
        pop.dirty = false
        status.className = 'st'; status.textContent = 'Saving…'
        const ok = await saveFields(rec.id, { note: ta.value.trim() })
        status.className = ok ? 'st ok' : 'st err'
        status.textContent = ok ? 'Saved' : 'Not saved'
      }
      const deb = MM.debounce(commit, 700)
      ta.addEventListener('input', () => { pop.dirty = true; status.className = 'st'; status.textContent = 'Editing…'; autosize(ta); deb() })
      ta.addEventListener('blur', commit)
      ta.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commit().then(() => closePopover(true)) } })
      pop.commit = commit
      noteBox = h('div', { style: 'display:flex;flex-direction:column;gap:4px' }, h('span', { class: 'lbl', text: 'Quick-Note' }), ta, status)
      requestAnimationFrame(() => autosize(ta))
    } else {
      pop.commit = null
      const add = h('button', { type: 'button', class: 'mm-btn ghost sm add', html: ICON.plus })
      add.append('Add a note')
      add.addEventListener('click', () => { pop.editing = true; renderPopover(); pop.el?.querySelector('.ta')?.focus() })
      noteBox = add
    }
    const copy = h('button', { type: 'button', class: 'mm-btn sm act', html: ICON.copy })
    copy.append('Copy')
    copy.addEventListener('click', async () => { const ok = await copyText(rec.text, layer); MM.toast(ok ? 'Copied to clipboard' : 'Couldn’t copy the text.') })
    const hub = h('button', { type: 'button', class: 'mm-btn ghost sm act', title: 'Open in the Knowledge Hub', html: ICON.hub })
    hub.append('Hub')
    hub.addEventListener('click', () => { MM.send('OPEN_HUB', { view: 'highlights', params: `id=${encodeURIComponent(rec.id)}` }); closePopover() })
    const del = h('button', { type: 'button', class: 'mm-btn danger sm act', html: ICON.trash })
    del.append('Delete')
    del.addEventListener('click', async () => { const id = rec.id; const kb = pop.byKeyboard; const anchorNext = pop.anchor; closePopover(); await deleteHighlight(id); if (kb && anchorNext && !anchorNext.isConnected) document.body?.focus?.() })

    const el = h('div', { class: 'pop', role: 'dialog', 'aria-label': `Highlight options: ${tag.name}`, style: `--c:${tag.color}` },
      h('div', { class: 'hd' }, h('span', { class: 'd' }), h('b', { text: tag.name }), h('span', { class: 'when', text: `· ${timeAgo(rec.created)}` }), h('span', { class: 'sp' }), close),
      dots, noteBox,
      h('div', { class: 'acts' }, copy, hub, h('span', { class: 'sp' }), del))
    el.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); (pop.commit ? pop.commit() : Promise.resolve()).then(() => closePopover(true)) }
    })
    el.addEventListener('focusout', e => {
      if (pop.byKeyboard && e.relatedTarget && !el.contains(e.relatedTarget)) closePopover()
    })
    if (pop.el?.isConnected) pop.el.replaceWith(el)
    else layer.append(el)
    pop.el = el
    positionPopover()
    if (hadFocus) {
      const sel = hadFocus.includes('ta') ? '.ta' : hadFocus.includes('dot') ? '.dot[aria-pressed="true"]' : null
      if (sel) el.querySelector(sel)?.focus({ preventScroll: true })
    }
  }

  function autosize(ta) {
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(220, Math.max(40, ta.scrollHeight + 2))}px`
  }

  function positionPopover() {
    const el = pop.el
    if (!el || !pop.anchor) return
    if (!pop.anchor.isConnected) return closePopover()
    const rects = markRects(pop.anchor)
    const r = rects[Math.min(pop.rectIndex, rects.length - 1)]
    if (!r) return
    place(el, r)
  }

  function place(el, r, gap = 10) {
    const vw = document.documentElement.clientWidth || innerWidth
    const vh = document.documentElement.clientHeight || innerHeight
    const w = el.offsetWidth, ht = el.offsetHeight
    const left = Math.min(Math.max(12, r.left), vw - w - 12)
    let top = r.bottom + gap
    if (top + ht > vh - 12 && r.top - gap - ht >= 12) top = r.top - gap - ht
    el.style.left = `${Math.max(12, left)}px`
    el.style.top = `${top}px`
  }

  function closePopover(returnFocus = false) {
    if (!pop.el && !pop.id) return
    const anchor = pop.anchor
    if (pop.commit && pop.dirty) pop.commit()
    pop.el?.remove()
    Object.assign(pop, { id: null, el: null, anchor: null, commit: null, dirty: false })
    if (returnFocus && anchor?.isConnected) {
      const first = items.get(anchor.dataset.mmHl)?.marks[0] || anchor
      first.focus({ preventScroll: true })
    }
  }

  // ───────── Quick-Note card (pin hover / click) ─────────
  const noteCard = { id: null, el: null, pin: null, pinned: false, showTimer: 0, hideTimer: 0, dirty: false, save: null }

  function openNote(pin, { pinned = false, focus = false } = {}) {
    const id = pin?.dataset.mmPin
    if (!id || !items.get(id)) return
    clearTimeout(noteCard.hideTimer)
    if (noteCard.id === id && noteCard.el?.isConnected) {
      noteCard.pinned ||= pinned
      if (focus) noteCard.el.querySelector('.ta')?.focus({ preventScroll: true })
      return
    }
    closeNote(true)
    closePopover()
    Object.assign(noteCard, { id, pin, pinned, dirty: false })
    renderNote()
    if (focus) noteCard.el?.querySelector('.ta')?.focus({ preventScroll: true })
  }

  function renderNote() {
    const it = items.get(noteCard.id)
    if (!it || !it.rec.note && !noteCard.dirty) return closeNote()
    const { layer } = ui('highlight-card', CARD_CSS)
    const tag = tagInfo(it.rec.tag)
    const ta = h('textarea', { class: 'ta', 'aria-label': 'Quick-Note text', placeholder: 'Empty notes are removed', maxlength: '10000' })
    ta.value = it.rec.note
    const status = h('span', { class: 'st', role: 'status', 'aria-live': 'polite', text: `Saved ${timeAgo(it.rec.updated)}` })
    const id = it.rec.id
    const save = async () => {
      if (!noteCard.dirty || noteCard.id !== id) return
      noteCard.dirty = false
      status.className = 'st'
      status.textContent = 'Saving…'
      const ok = await saveFields(id, { note: ta.value.trim() })
      status.className = ok ? 'st ok' : 'st err'
      status.textContent = ok ? 'Saved' : 'Not saved'
      if (ok && !ta.value.trim()) { closeNote(); MM.toast('Note removed') }
    }
    const deb = MM.debounce(save, 700)
    ta.addEventListener('input', () => { noteCard.dirty = true; noteCard.pinned = true; status.className = 'st'; status.textContent = 'Editing…'; autosize(ta); deb() })
    ta.addEventListener('focus', () => { noteCard.pinned = true })
    ta.addEventListener('blur', save)
    ta.addEventListener('keydown', e => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save().then(() => closeNote(false, true)) }
    })
    const close = h('button', { type: 'button', class: 'x', 'aria-label': 'Close note', html: ICON.close })
    close.addEventListener('click', () => { save(); closeNote(false, true) })
    const el = h('div', { class: 'nc', role: 'dialog', 'aria-label': 'Quick-Note' },
      h('div', { class: 'nh' }, h('span', { html: ICON.pin, style: 'display:grid' }), h('span', { text: 'Quick-Note' }), h('span', { class: 'tg', text: `· ${tag.name}` }), h('span', { class: 'sp' }), close),
      ta,
      h('div', { class: 'nf' }, status, h('span', {}, h('kbd', { text: 'Ctrl' }), ' ', h('kbd', { text: 'Enter' }))))
    el.addEventListener('mouseenter', () => clearTimeout(noteCard.hideTimer))
    el.addEventListener('mouseleave', scheduleNoteHide)
    el.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); save(); closeNote(false, true) } })
    if (noteCard.el?.isConnected) noteCard.el.replaceWith(el)
    else layer.append(el)
    noteCard.el = el
    noteCard.save = save
    positionNote()
    requestAnimationFrame(() => { autosize(ta); positionNote() })
  }

  function positionNote() {
    const { el, pin } = noteCard
    if (!el) return
    if (!pin?.isConnected) return closeNote()
    const r = pin.getBoundingClientRect()
    place(el, { left: r.left - 14, right: r.right, top: r.top, bottom: r.bottom }, 8)
  }

  function scheduleNoteHide() {
    clearTimeout(noteCard.hideTimer)
    noteCard.hideTimer = setTimeout(() => {
      const active = noteCard.el?.getRootNode().activeElement
      if (noteCard.pinned || (active && noteCard.el?.contains(active))) return
      closeNote()
    }, 320)
  }

  function closeNote(force = false, returnFocus = false) {
    clearTimeout(noteCard.showTimer)
    clearTimeout(noteCard.hideTimer)
    if (!noteCard.el && !noteCard.id) return
    if (!force && noteCard.dirty) noteCard.save?.()
    const pin = noteCard.pin
    noteCard.el?.remove()
    Object.assign(noteCard, { id: null, el: null, pin: null, pinned: false, dirty: false, save: null })
    if (returnFocus && pin?.isConnected) pin.focus({ preventScroll: true })
  }

  // ───────── undo (after delete) ─────────
  let undoTimer = 0
  function showUndo(rec) {
    const { layer } = ui('highlight-card', CARD_CSS)
    layer.querySelector('.undo')?.remove()
    clearTimeout(undoTimer)
    MM.shadow('toast').layer.replaceChildren() // the undo bar takes the toast's spot
    const btn = h('button', { type: 'button', class: 'mm-btn sm', text: 'Undo' })
    const bar = h('div', { class: 'undo', role: 'status' }, h('span', { text: 'Highlight deleted' }), btn)
    btn.addEventListener('click', async () => {
      bar.remove()
      clearTimeout(undoTimer)
      const res = await MM.send('HL_SAVE', { highlight: rec })
      if (!res?.ok) return MM.toast('Couldn’t restore the highlight.')
      await exclusive(() => { unresolved.set(res.highlight.id, res.highlight); return anchorPending(gen) })
    })
    layer.append(bar)
    undoTimer = setTimeout(() => bar.remove(), 6000)
  }

  // ───────── events ─────────
  function onMouseUp(e) {
    if (!MM.alive() || e.button !== 0 || !menuEnabled()) return
    if (MM.isOwn(e.target)) return
    setTimeout(() => {
      const sel = getSelection()
      if (!sel?.rangeCount || sel.isCollapsed) return
      const range = sel.getRangeAt(0)
      if (!norm(sel.toString()) || !selectable(range)) return
      openMenu(range, selectionEnd(sel, range, e))
    }, 0)
  }

  function onMouseDown(e) {
    if (!MM.alive()) return
    if (MM.isOwn(e.target)) return
    if (menu.open) closeMenu(false)
    if (pop.el) closePopover()
    if (noteCard.el && !e.target.closest?.('mm-pin')) closeNote()
  }

  function onClick(e) {
    if (!MM.alive() || e.button !== 0) return
    const t = e.target
    if (!t?.closest || MM.isOwn(t)) return
    const pin = t.closest('mm-pin[data-mm-pin]')
    if (pin) { e.preventDefault(); e.stopPropagation(); openNote(pin, { pinned: true, focus: true }); return }
    const mark = t.closest('mm-mark[data-mm-hl]')
    if (!mark || !items.has(mark.dataset.mmHl)) return
    const sel = getSelection()
    if (sel && !sel.isCollapsed && norm(sel.toString())) return // the user was selecting, not clicking
    if (mark.closest('a[href],button,[role="button"]:not(mm-mark),label,summary')) return // let links and controls work
    openPopover(mark.dataset.mmHl, mark, { point: { x: e.clientX, y: e.clientY } })
  }

  function onKeyDown(e) {
    if (!MM.alive()) return
    if (menu.open) {
      if (menu.mode === 'note') {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(true) }
        return
      }
      const n = menu.els.length
      const k = e.key
      if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(true); return }
      if (k === 'Tab') { e.preventDefault(); e.stopPropagation(); setActive(menu.active < 0 ? (e.shiftKey ? n - 1 : 0) : (menu.active + (e.shiftKey ? n - 1 : 1)) % n, true); return }
      if (e.ctrlKey || e.metaKey || e.altKey || /^(Shift|Control|Alt|Meta|CapsLock)$/.test(k)) return // shortcuts (Ctrl+C, Alt+Shift+H) pass through
      if (/^Arrow(Right|Down)$/.test(k) && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); setActive(menu.active < 0 ? 0 : (menu.active + 1) % n, true); return }
      if (/^Arrow(Left|Up)$/.test(k) && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); setActive(menu.active < 0 ? n - 1 : (menu.active + n - 1) % n, true); return }
      if (k === 'Home' || k === 'End') { e.preventDefault(); setActive(k === 'Home' ? 0 : n - 1, true); return }
      if ((k === 'Enter' || k === ' ') && menu.active >= 0) { e.preventDefault(); e.stopPropagation(); pick(menu.active); return }
      closeMenu(false) // any other key: the user moved on
      return
    }
    const t = e.target
    if ((e.key === 'Enter' || e.key === ' ') && !e.ctrlKey && !e.altKey && !e.metaKey) {
      if (t?.localName === 'mm-pin' && t.dataset.mmPin) { e.preventDefault(); openNote(t, { pinned: true, focus: true }); return }
      if (t?.localName === 'mm-mark' && t.dataset.mmHl && items.has(t.dataset.mmHl)) { e.preventDefault(); openPopover(t.dataset.mmHl, t, { byKeyboard: true }); return }
    }
    if (e.key === 'Escape') {
      if (pop.el) { e.preventDefault(); closePopover(true) }
      else if (noteCard.el) { e.preventDefault(); closeNote(false, true) }
    }
  }

  function onOver(e) {
    const pin = e.target?.closest?.('mm-pin[data-mm-pin]')
    if (!pin || !MM.alive()) return
    clearTimeout(noteCard.hideTimer)
    if (noteCard.pin === pin && noteCard.el) return
    if (pop.el || menu.open) return
    clearTimeout(noteCard.showTimer)
    noteCard.showTimer = setTimeout(() => openNote(pin), 130)
  }
  function onOut(e) {
    const pin = e.target?.closest?.('mm-pin[data-mm-pin]')
    if (!pin || pin.contains(e.relatedTarget)) return
    clearTimeout(noteCard.showTimer)
    if (noteCard.pin === pin) scheduleNoteHide()
  }

  let rafPending = false
  function onScroll() {
    if (!MM.alive()) return
    if (menu.open && menu.mode === 'ring' && Date.now() - menu.openedAt > 150) closeMenu(false)
    if (rafPending) return
    rafPending = true
    requestAnimationFrame(() => {
      rafPending = false
      positionPopover()
      positionNote()
      positionPanel()
    })
  }
  function onResize() {
    if (menu.open && menu.mode === 'ring') closeMenu(false)
    onScroll()
  }

  addEventListener('mouseup', onMouseUp, true)
  addEventListener('mousedown', onMouseDown, true)
  addEventListener('click', onClick, true)
  addEventListener('keydown', onKeyDown, true)
  document.addEventListener('mouseover', onOver, { passive: true })
  document.addEventListener('mouseout', onOut, { passive: true })
  addEventListener('scroll', onScroll, { capture: true, passive: true })
  addEventListener('resize', MM.throttle(onResize, 100), { passive: true })

  // ───────── messages ─────────
  MM.on('MM_HIGHLIGHT_SELECTION', async ({ tag } = {}) => {
    let range = menu.open ? liveRange() : null
    if (!range) {
      const sel = getSelection()
      range = sel?.rangeCount && !sel.isCollapsed ? sel.getRangeAt(0) : null
    }
    if (!range || !norm(range.toString())) return fail('Select some text on the page to highlight it.')
    if (!selectable(range)) return fail('Text in inputs and editors can’t be highlighted.')
    range = range.cloneRange()
    closeMenu(false)
    return createHighlight(range, tag || defaultTag())
  })

  MM.on('MM_HIGHLIGHT_REFRESH', async () => {
    await restore()
    return { ok: true, count: items.size, unresolved: unresolved.size }
  })

  MM.on('MM_HIGHLIGHT_REMOVE', async ({ id } = {}) => {
    if (!id) return { ok: false, error: 'id is required' }
    const removed = await exclusive(() => removeLocal(id))
    return { ok: true, removed }
  })

  MM.on('MM_HIGHLIGHT_FOCUS', ({ id } = {}) => (id ? focusHighlight(id) : { ok: false, error: 'id is required' }))

  // ───────── lifecycle ─────────
  MM.events.on('settings', () => {
    for (const it of items.values()) decorate(it)
    if (!menuEnabled() && menu.mode === 'ring') closeMenu(false)
    if (pop.el) renderPopover()
  })

  MM.events.on('urlchange', ({ from, to }) => {
    if (MM.pageKey(from) === MM.pageKey(to)) return
    closeMenu(false)
    closePopover()
    closeNote(true)
    gen++ // abort in-flight anchoring for the old page
    exclusive(() => {
      for (const it of items.values()) { unwrapMarks(it.marks); it.pin?.remove() }
      items.clear()
      unresolved.clear()
      attempts = 0
      lostBudget = LOST_LIMIT
      ensureObserver()
    })
    restore()
  })

  // An orphaned copy (extension reloaded) may have left marks behind: unwrap them before restoring.
  const stale = document.querySelectorAll('mm-mark[data-mm-hl]')
  if (stale.length) unwrapMarks([...stale].reverse())
  document.querySelectorAll('mm-pin[data-mm-pin]').forEach(p => p.remove())

  MM.highlight = {
    create: (range, tag, note) => createHighlight(range, tag, note),
    refresh: restore,
    focus: focusHighlight,
    count: () => items.size,
  }

  restore()
})()
