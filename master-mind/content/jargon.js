// Master Mind jargon decoder (B1 page intelligence).
// MM_JARGON_APPLY wraps the first occurrences of each term inside the extracted paragraphs in
// <mm-term tabindex=0> with a dotted neon underline. Hover or focus shows a Shadow DOM micro-card
// (term, kind, pronunciation, definition, related concepts, pronounce button).
// MM_JARGON_CLEAR unwraps everything.
(() => {
  const MM = globalThis.MM
  if (!MM || MM.__skip) return

  const MAX_PER_TERM = 2
  const MAX_TERMS = 40
  const SHOW_DELAY = 110
  const HIDE_DELAY = 260
  const ACCENT = { cyan: '#22D3EE', violet: '#A78BFA', lime: '#A3E635', pink: '#F472B6', amber: '#FBBF24' }
  const KINDS = new Set(['acronym', 'technical', 'entity', 'foreign', 'historical', 'other'])
  const WORD = '[\\p{L}\\p{N}_]'
  // Terms are matched in each paragraph's text as a whole, not Text node by Text node: other features split
  // words across elements (Bionic Reading turns "electrolyte" into <mm-b>elec</mm-b>trolyte, highlights can
  // start mid-word) and pages put <em>/<b> inside terms.
  /** Elements that end a run of text (a term never spans them); their content is skipped. */
  const BREAK = 'mm-term,mm-host,[data-mm-host],[contenteditable]:not([contenteditable="false"]),script,style,noscript,template,textarea,select,option,input,button,svg,math,iframe,object,embed,video,audio,canvas,img,picture,br,hr'
  /** Block containers: text in different blocks belongs to different runs. */
  const BLOCK = 'address,article,aside,blockquote,dd,details,div,dl,dt,fieldset,figcaption,figure,footer,form,h1,h2,h3,h4,h5,h6,header,li,main,nav,ol,p,pre,section,summary,table,tbody,td,tfoot,th,thead,tr,ul'
  /** Inline elements an underline may enclose whole: formatting and our own wrappers, never links or controls. */
  const ENCLOSE = 'abbr,b,bdi,bdo,big,cite,code,data,del,dfn,em,font,i,ins,kbd,mark,q,s,samp,small,span,strong,sub,sup,time,tt,u,var,wbr,mm-b,mm-bionic,mm-mark'
  const INTERACTIVE = '[tabindex],[role="button"],[role="link"]' // e.g. a highlight's focusable first <mm-mark>
  const NOT_ENCLOSE = `:not(${ENCLOSE}),${INTERACTIVE}`

  let terms = [] // [{term, definition, related, kind, pronunciation}]
  let listening = false
  let navGen = 0 // bumps on navigation to another page, so an apply still in flight doesn't mark up the new one

  const accent = () => ACCENT[MM.settings.accent] || ACCENT.cyan
  const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const str = (v, max = 400) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')

  // ───────── page style: only our own tag ─────────
  function ensurePageStyle() {
    // The last rule keeps Bionic Reading's bold word starts bold when a term encloses them.
    const css = `mm-term[data-mm-term]{cursor:help;border-radius:3px;transition:background-color .15s ease}
mm-term[data-mm-term]:hover,mm-term[data-mm-term][aria-expanded="true"]{background-color:color-mix(in srgb,var(--mm-term-c,#22D3EE) 16%,transparent)}
mm-term[data-mm-term]:focus-visible{outline:2px solid var(--mm-term-c,#22D3EE);outline-offset:2px}
@media (prefers-reduced-motion:reduce){mm-term[data-mm-term]{transition:none}}
mm-term[data-mm-term]>mm-b{display:inline;font-weight:700}`
    let s = document.getElementById('mm-page-style-jargon')
    if (!s) {
      s = document.createElement('style')
      s.id = 'mm-page-style-jargon'
      ;(document.head || document.documentElement).appendChild(s)
    }
    if (s.textContent !== css) s.textContent = css
  }

  // ───────── wrapping ─────────
  function normalizeTerms(list) {
    const seen = new Set()
    const out = []
    for (const t of Array.isArray(list) ? list : []) {
      const term = str(t?.term, 80)
      if (term.length < 2 || seen.has(term.toLowerCase())) continue
      seen.add(term.toLowerCase())
      out.push({
        term,
        definition: str(t.definition, 600),
        related: (Array.isArray(t.related) ? t.related : []).map(r => str(r, 60)).filter(Boolean).slice(0, 4),
        kind: KINDS.has(t.kind) ? t.kind : 'other',
        pronunciation: str(t.pronunciation, 80),
      })
      if (out.length >= MAX_TERMS) break
    }
    return out
  }

  /**
   * A paragraph element's text as runs of inline text (split at blocks, line breaks and embedded content),
   * each with the Text nodes it is made of and where each one starts in `text`.
   * @returns {{text: string, nodes: Text[], starts: number[]}[]}
   */
  function runsOf(el) {
    const runs = []
    if (el.isContentEditable) return runs
    const blockOf = new Map() // parent element → its block container
    let run = null
    let block = null
    let brk = true
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (n.nodeType === 3) return n.length ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
        // A nested paragraph (its own data-mm-pid) is matched on its own.
        if (n.matches(BREAK) || n.hasAttribute('data-mm-pid')) { brk = true; return NodeFilter.FILTER_REJECT }
        return NodeFilter.FILTER_SKIP
      },
    })
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const p = n.parentElement
      let b = blockOf.get(p)
      if (b === undefined) blockOf.set(p, (b = p.closest(BLOCK)))
      if (brk || b !== block || !run) { run = { text: '', nodes: [], starts: [] }; runs.push(run) }
      brk = false
      block = b
      run.starts.push(run.text.length)
      run.nodes.push(n)
      run.text += n.data
    }
    return runs.filter(r => r.text.length >= 2)
  }

  /** The Text nodes and offsets where run positions s (inclusive) and e (exclusive) fall. */
  function locate(run, s, e) {
    const last = (x, strict) => { // index of the last node starting at (or, when strict, before) x
      let lo = 0, hi = run.starts.length - 1, ans = 0
      while (lo <= hi) {
        const mid = (lo + hi) >> 1
        if (strict ? run.starts[mid] < x : run.starts[mid] <= x) { ans = mid; lo = mid + 1 } else hi = mid - 1
      }
      return ans
    }
    const a = last(s, false)
    const b = last(e, true)
    return { sNode: run.nodes[a], sOff: s - run.starts[a], eNode: run.nodes[b], eOff: e - run.starts[b] }
  }

  const isGap = n => n.nodeType === 8 || (n.nodeType === 3 && !n.length) // comments, empty text
  const sibling = (n, dir) => {
    let x = dir < 0 ? n.previousSibling : n.nextSibling
    while (x && isGap(x)) x = dir < 0 ? x.previousSibling : x.nextSibling
    return x
  }
  const enclosable = n => n.nodeType !== 1 || (!n.matches(NOT_ENCLOSE) && !n.querySelector(NOT_ENCLOSE))

  /**
   * Where the <mm-term> for a match goes: siblings [first..last] under one parent that hold exactly the matched
   * text once the edge Text nodes are split. Climbs out of inline wrappers the match covers whole (bionic
   * <mm-b>, <em>…). Null when it would cut an element in two or swallow a link or control.
   */
  function planWrap(h) {
    const { sNode, sOff, eNode, eOff } = h
    if (!sNode.parentNode || !eNode.parentNode) return null
    if (sNode === eNode) return { parent: sNode.parentNode, first: sNode, last: sNode }
    const up = new Set()
    for (let n = sNode.parentNode; n; n = n.parentNode) up.add(n)
    let parent = eNode.parentNode
    while (parent && !up.has(parent)) parent = parent.parentNode
    if (!parent) return null
    let first = sNode
    if (first.parentNode !== parent && sOff > 0) return null
    while (first.parentNode !== parent) {
      if (sibling(first, -1)) return null // the wrapper starts before the match
      first = first.parentNode
    }
    let last = eNode
    if (last.parentNode !== parent && eOff < eNode.length) return null
    while (last.parentNode !== parent) {
      if (sibling(last, 1)) return null // the wrapper goes on after the match
      last = last.parentNode
    }
    for (let n = first; n; n = n.nextSibling) {
      if (!enclosable(n)) return null
      if (n === last) return { parent, first, last }
    }
    return null
  }

  /**
   * Find the first occurrences of each term in document order. Whole-word, case-sensitive first;
   * a term with no exact match falls back to case-insensitive matching. Only occurrences we can
   * underline cleanly count.
   * @param {Element[]} els paragraph elements in document order
   * @returns {{run: object, s: number, e: number, index: number, sNode: Text, sOff: number, eNode: Text, eOff: number}[]}
   */
  function findMatches(els, list) {
    const hits = []
    const counts = new Array(list.length).fill(0)
    const cache = new Map() // element → runs (built lazily, numbered in document order)
    let seq = 0
    const runsFor = el => {
      let runs = cache.get(el)
      if (!runs) {
        runs = runsOf(el)
        for (const r of runs) { r.seq = seq++; r.taken = [] }
        cache.set(el, runs)
      }
      return runs
    }
    const pass = (indices, flags) => {
      if (!indices.length) return
      const key = s => { const k = s.replace(/\s+/g, ' '); return flags ? k.toLowerCase() : k }
      const byKey = new Map(indices.map(i => [key(list[i].term), i]))
      // Any whitespace between the words of a multi-word term (line breaks in the HTML, &nbsp;).
      const alts = indices.map(i => list[i].term).sort((a, b) => b.length - a.length).map(t => escRe(t).replace(/ /g, '\\s+')).join('|')
      const re = new RegExp(`(?<!${WORD})(?:${alts})(?!${WORD})`, `g${flags}u`)
      let remaining = indices.length
      for (const el of els) {
        if (!remaining) break
        for (const run of runsFor(el)) {
          if (!remaining) break
          re.lastIndex = 0
          for (let m; (m = re.exec(run.text));) {
            const i = byKey.get(key(m[0]))
            if (i === undefined || counts[i] >= MAX_PER_TERM) continue
            const s = m.index
            const e = s + m[0].length
            if (run.taken.some(([a, b]) => s < b && e > a)) continue
            const hit = { run, s, e, index: i, ...locate(run, s, e) }
            if (!planWrap(hit)) continue
            counts[i]++
            if (counts[i] === MAX_PER_TERM) remaining--
            hits.push(hit)
            run.taken.push([s, e])
          }
        }
      }
    }
    pass(list.map((_, i) => i), '')
    pass(list.map((_, i) => i).filter(i => counts[i] === 0), 'i')
    return hits
  }

  function wrapHit(h, color) {
    const plan = planWrap(h)
    if (!plan) return null
    let { first, last } = plan
    if (h.sNode === h.eNode) {
      if (h.eOff < h.sNode.length) h.sNode.splitText(h.eOff)
      first = last = h.sOff > 0 ? h.sNode.splitText(h.sOff) : h.sNode
    } else {
      if (first === h.sNode && h.sOff > 0) first = h.sNode.splitText(h.sOff)
      if (last === h.eNode && h.eOff < h.eNode.length) h.eNode.splitText(h.eOff)
    }
    const t = terms[h.index]
    const el = document.createElement('mm-term')
    el.dataset.mmTerm = String(h.index)
    el.tabIndex = 0
    el.setAttribute('role', 'button')
    el.setAttribute('aria-expanded', 'false')
    el.setAttribute('aria-description', `${t.kind === 'acronym' ? 'Acronym' : 'Term'}: ${t.definition}`)
    el.style.cssText = `text-decoration:underline dotted ${color};text-decoration-thickness:2px;text-underline-offset:3px;text-decoration-skip-ink:none;--mm-term-c:${color}`
    plan.parent.insertBefore(el, first)
    for (let n = first, next; n; n = next) {
      next = n === last ? null : n.nextSibling
      el.appendChild(n)
    }
    return el
  }

  /** Underline normalized terms on the page (replacing any current ones). Returns the number of underlines. */
  function apply(list) {
    clear()
    terms = list
    if (!terms.length) return 0
    const paras = (MM.paraEls ? MM.paraEls() : [...document.querySelectorAll('[data-mm-pid]')].map(el => ({ el, tag: el.localName })))
      .filter(p => p.el?.isConnected && p.tag !== 'pre' && !/^h\d$/.test(p.tag))
    const hits = findMatches(paras.map(p => p.el), terms)
    if (!hits.length) return 0
    ensurePageStyle()
    const color = accent()
    // Last match first: splitting a Text node keeps the part before the split in place, so the node
    // references of earlier matches stay valid.
    hits.sort((a, b) => b.run.seq - a.run.seq || b.s - a.s)
    let n = 0
    for (const h of hits) if (wrapHit(h, color)) n++
    if (n) listen(true)
    return n
  }

  /**
   * Run fn on the page without Bionic Reading's word splitting (content/reader.js), then turn it back on.
   * Bionic then re-wraps the text inside our <mm-term>s: the same DOM as underlining before bionic, which
   * bionic restores exactly when it's switched off later. (Matching works across its <mm-b> tags anyway,
   * in case it can't be paused.)
   */
  async function withoutBionic(fn) {
    const bio = MM.bionic
    let paused = false
    if (bio?.isOn?.()) {
      try { await bio.set(false); paused = true } catch (e) { console.warn('[Master Mind] could not pause bionic reading', e) }
    }
    try {
      return fn()
    } finally {
      if (paused && !bio.isOn()) {
        try { await bio.set(true) } catch (e) { console.warn('[Master Mind] could not restore bionic reading', e) }
      }
    }
  }

  function clear() {
    hideCard(true)
    const parents = new Set()
    let removed = 0
    for (const el of document.querySelectorAll('mm-term[data-mm-term]')) {
      const parent = el.parentNode
      if (!parent) continue
      el.replaceWith(...el.childNodes)
      parents.add(parent)
      removed++
    }
    for (const p of parents) if (p.isConnected) p.normalize()
    terms = []
    listen(false)
    return removed
  }

  // ───────── micro-card (Shadow DOM) ─────────
  const CARD_CSS = `
.jc{position:fixed;left:0;top:0;width:min(320px,calc(100vw - 16px));z-index:1;padding:13px 14px 11px;border-radius:14px;
  background:rgba(16,18,27,.9);backdrop-filter:var(--mm-blur);-webkit-backdrop-filter:var(--mm-blur);
  border:1px solid var(--mm-border-strong);box-shadow:0 18px 50px rgba(0,0,0,.55),0 0 0 1px rgba(0,0,0,.4),0 0 28px color-mix(in srgb,var(--mm-accent) 16%,transparent);
  color:var(--mm-fg);font:13px/1.5 var(--mm-font);text-align:left;opacity:0;transform:translateY(4px) scale(.98);transform-origin:top left;
  transition:opacity .14s ease,transform .16s var(--mm-ease);pointer-events:none}
.jc.on{opacity:1;transform:none;pointer-events:auto}
.jc.above{transform-origin:bottom left}
.jc::before{content:"";position:absolute;inset:0 0 auto;height:2px;border-radius:14px 14px 0 0;background:var(--mm-gradient);opacity:.85}
.arrow{position:absolute;width:10px;height:10px;transform:rotate(45deg);background:rgb(16,18,27);border:1px solid var(--mm-border-strong)}
.jc:not(.above) .arrow{top:-6px;border-right:0;border-bottom:0}
.jc.above .arrow{bottom:-6px;border-left:0;border-top:0}
.top{display:flex;align-items:flex-start;gap:8px}
.titles{flex:1;min-width:0}
.term{font-weight:700;font-size:15px;color:var(--mm-heading);letter-spacing:-.01em;overflow-wrap:anywhere;line-height:1.3}
.pron{font:12px/1.4 var(--mm-mono);color:var(--mm-muted);margin-top:2px;overflow-wrap:anywhere}
.kind{margin-top:2px;flex:none}
.k-acronym{color:var(--mm-cyan);background:color-mix(in srgb,var(--mm-cyan) 14%,transparent)}
.k-technical{color:var(--mm-violet);background:color-mix(in srgb,var(--mm-violet) 14%,transparent)}
.k-entity{color:var(--mm-amber);background:color-mix(in srgb,var(--mm-amber) 14%,transparent)}
.k-foreign{color:var(--mm-pink);background:color-mix(in srgb,var(--mm-pink) 14%,transparent)}
.k-historical{color:var(--mm-lime);background:color-mix(in srgb,var(--mm-lime) 14%,transparent)}
.say{flex:none;margin:-3px -4px 0 0;color:var(--mm-fg-2)}
.say.speaking{color:var(--mm-accent);box-shadow:var(--mm-glow)}
.say.speaking svg{animation:mm-pulse 1s ease-in-out infinite}
@keyframes mm-pulse{50%{opacity:.45}}
.def{margin:8px 0 0;color:var(--mm-fg);font-size:13px;line-height:1.55}
.rel{display:flex;flex-wrap:wrap;align-items:center;gap:5px;margin-top:10px}
.rel-label{font:700 10px/1 var(--mm-font);letter-spacing:.08em;text-transform:uppercase;color:var(--mm-muted);margin-right:2px}
.rel .mm-chip{cursor:default;padding:4px 8px;font-size:11px;font-weight:600}
.rel .mm-chip:hover{color:var(--mm-fg-2);border-color:var(--mm-border-strong)}
.foot{display:flex;align-items:center;gap:6px;margin-top:10px;padding-top:8px;border-top:1px solid var(--mm-border);font:600 10.5px/1 var(--mm-font);color:var(--mm-muted);letter-spacing:.02em}
.foot .mm-dot{width:6px;height:6px}
.foot kbd{margin-left:auto;font-size:10px;padding:1px 5px}
`
  let card = null // {host, root, layer, box, arrow, term, pron, kind, def, rel, say}
  let active = null // the <mm-term> the card belongs to
  let showTimer = 0
  let hideTimer = 0
  let rafPending = false

  const SPEAKER = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>'

  function buildCard() {
    if (card) return card
    const h = MM.shadow('jargon-card', CARD_CSS)
    const box = document.createElement('div')
    box.className = 'jc'
    box.setAttribute('role', 'dialog')
    box.setAttribute('aria-modal', 'false')
    box.hidden = true
    const arrow = document.createElement('div')
    arrow.className = 'arrow'
    const top = document.createElement('div')
    top.className = 'top'
    const titles = document.createElement('div')
    titles.className = 'titles'
    const term = document.createElement('div')
    term.className = 'term'
    const pron = document.createElement('div')
    pron.className = 'pron'
    titles.append(term, pron)
    const kind = document.createElement('span')
    kind.className = 'mm-badge kind'
    const say = document.createElement('button')
    say.type = 'button'
    say.className = 'mm-btn ghost icon sm say'
    say.innerHTML = SPEAKER // static markup, no page data
    top.append(titles, kind, say)
    const def = document.createElement('p')
    def.className = 'def'
    const rel = document.createElement('div')
    rel.className = 'rel'
    const foot = document.createElement('div')
    foot.className = 'foot'
    const dot = document.createElement('span')
    dot.className = 'mm-dot'
    const brand = document.createElement('span')
    brand.textContent = 'Master Mind · Jargon decoder'
    const kbd = document.createElement('kbd')
    kbd.textContent = 'Esc'
    kbd.title = 'Press Esc to close'
    foot.append(dot, brand, kbd)
    box.append(arrow, top, def, rel, foot)
    h.layer.appendChild(box)

    box.addEventListener('mouseenter', () => { clearTimeout(hideTimer); clearTimeout(showTimer) })
    box.addEventListener('mouseleave', () => scheduleHide())
    box.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); const t = active; hideCard(); refocus(t) }
    })
    box.addEventListener('focusout', e => {
      if (!box.contains(e.relatedTarget) && e.relatedTarget !== active) scheduleHide(80)
    })
    say.addEventListener('click', () => speak())

    card = { ...h, box, arrow, term, pron, kind, def, rel, say }
    return card
  }

  function fill(t) {
    const c = buildCard()
    c.term.textContent = t.term
    c.pron.textContent = t.pronunciation ? `/${t.pronunciation.replace(/^\/|\/$/g, '')}/` : ''
    c.pron.hidden = !t.pronunciation
    c.kind.textContent = t.kind
    c.kind.className = `mm-badge kind k-${t.kind}`
    c.def.textContent = t.definition || 'No definition available.'
    c.rel.replaceChildren()
    if (t.related.length) {
      const label = document.createElement('span')
      label.className = 'rel-label'
      label.textContent = 'Related'
      c.rel.appendChild(label)
      for (const r of t.related) {
        const chip = document.createElement('span')
        chip.className = 'mm-chip'
        chip.textContent = r
        c.rel.appendChild(chip)
      }
    }
    c.rel.hidden = !t.related.length
    c.say.setAttribute('aria-label', `Pronounce “${t.term}”`)
    c.say.title = 'Pronounce'
    c.say.disabled = !('speechSynthesis' in globalThis)
    c.say.classList.remove('speaking')
    c.box.setAttribute('aria-label', `Definition of ${t.term}`)
  }

  function position() {
    if (!card || !active) return
    if (!active.isConnected) return hideCard(true)
    const rects = [...active.getClientRects()]
    if (!rects.length) return hideCard(true)
    const r = rects[0]
    const vw = document.documentElement.clientWidth || innerWidth
    const vh = innerHeight
    if (r.bottom < 0 || r.top > vh) return hideCard(true)
    const box = card.box
    const w = box.offsetWidth
    const hgt = box.offsetHeight
    const gap = 10
    let left = Math.min(Math.max(8, r.left - 14), vw - w - 8)
    const below = r.bottom + gap + hgt <= vh - 8 || r.top - gap - hgt < 8
    const top = below ? Math.min(r.bottom + gap, vh - hgt - 8) : r.top - gap - hgt
    left = Math.max(8, left)
    box.classList.toggle('above', !below)
    box.style.left = `${Math.round(left)}px`
    box.style.top = `${Math.round(Math.max(8, top))}px`
    const ax = Math.min(Math.max(r.left + Math.min(r.width, 60) / 2 - left - 5, 12), w - 22)
    card.arrow.style.left = `${Math.round(ax)}px`
  }

  function showCard(el) {
    const t = terms[Number(el.dataset.mmTerm)]
    if (!t) return
    clearTimeout(hideTimer)
    clearTimeout(showTimer)
    if (active && active !== el) active.setAttribute('aria-expanded', 'false')
    const c = buildCard()
    if (!c.host.isConnected) (document.body || document.documentElement).appendChild(c.host) // page re-rendered <body>
    if (active !== el || c.box.hidden) {
      fill(t)
      active = el
      c.box.hidden = false
      c.box.classList.remove('on')
      position()
      requestAnimationFrame(() => card?.box && !card.box.hidden && card.box.classList.add('on'))
    }
    el.setAttribute('aria-expanded', 'true')
  }

  function hideCard(immediate = false) {
    clearTimeout(showTimer)
    clearTimeout(hideTimer)
    if (!card) { active = null; return }
    const prev = active
    const focusInside = !!card.root.activeElement
    prev?.setAttribute('aria-expanded', 'false')
    active = null
    if (focusInside && prev) refocus(prev) // don't strand keyboard focus in a hidden card
    card.box.classList.remove('on')
    if (immediate) card.box.hidden = true
    else hideTimer = setTimeout(() => { if (!active && card) card.box.hidden = true }, 160)
    if (card.say.classList.contains('speaking')) { try { speechSynthesis.cancel() } catch { /* unsupported */ } }
  }

  /** Return focus to a term without re-opening its card. */
  let quietFocus = null
  function refocus(t) {
    if (!t?.isConnected) return
    quietFocus = t
    t.focus({ preventScroll: true })
    quietFocus = null
  }

  function scheduleShow(el, delay = SHOW_DELAY) {
    clearTimeout(hideTimer)
    if (active === el && card && !card.box.hidden) return
    clearTimeout(showTimer)
    showTimer = setTimeout(() => showCard(el), delay)
  }
  function scheduleHide(delay = HIDE_DELAY) {
    clearTimeout(showTimer)
    clearTimeout(hideTimer)
    hideTimer = setTimeout(() => hideCard(), delay)
  }

  function speak() {
    const t = active && terms[Number(active.dataset.mmTerm)]
    if (!t || !('speechSynthesis' in globalThis)) return
    try {
      speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(t.term)
      u.lang = document.documentElement.lang || navigator.language || 'en'
      u.rate = 0.9
      const voice = MM.settings.ttsVoice && speechSynthesis.getVoices().find(v => v.name === MM.settings.ttsVoice)
      if (voice) u.voice = voice
      const btn = card.say
      btn.classList.add('speaking')
      u.onend = u.onerror = () => btn.classList.remove('speaking')
      speechSynthesis.speak(u)
    } catch { card?.say.classList.remove('speaking') }
  }

  // ───────── events (delegated; only while terms are on the page) ─────────
  const termOf = e => (e.target?.closest ? e.target.closest('mm-term[data-mm-term]') : null)
  const onOver = e => { const t = termOf(e); if (t) scheduleShow(t) }
  const onOut = e => {
    const t = termOf(e)
    if (!t || t.contains(e.relatedTarget)) return
    if (card && e.relatedTarget === card.host) return // moving onto the card
    if (t === active || !active) scheduleHide()
    else clearTimeout(showTimer)
  }
  const onFocusIn = e => { const t = termOf(e); if (t && t !== quietFocus) showCard(t) }
  const onFocusOut = e => {
    const t = termOf(e)
    if (!t) return
    if (card && (e.relatedTarget === card.host || card.box.contains(e.relatedTarget))) return
    scheduleHide(80)
  }
  const onKey = e => {
    if (card && e.target === card.host) return // keys inside the card are handled by the card
    const t = termOf(e)
    if (e.key === 'Escape' && active && card && !card.box.hidden) { hideCard(); return }
    if (!t) return
    if (e.key === 'Enter' || e.key === ' ') {
      // Keyboard path into the card (pronounce button).
      e.preventDefault()
      showCard(t)
      if (!card.say.disabled) card.say.focus({ preventScroll: true })
    }
  }
  const onViewport = () => {
    if (!active || rafPending) return
    rafPending = true
    requestAnimationFrame(() => { rafPending = false; position() })
  }

  function listen(on) {
    if (on === listening) return
    listening = on
    const m = on ? 'addEventListener' : 'removeEventListener'
    document[m]('mouseover', onOver, true)
    document[m]('mouseout', onOut, true)
    document[m]('focusin', onFocusIn, true)
    document[m]('focusout', onFocusOut, true)
    document[m]('keydown', onKey, true)
    globalThis[m]('scroll', onViewport, { capture: true, passive: true })
    globalThis[m]('resize', onViewport, { passive: true })
  }

  // ───────── handlers ─────────
  // Apply can wait on bionic reading, so applies and clears run one at a time, in the order they arrive.
  let queue = Promise.resolve()
  const serial = fn => {
    const p = queue.then(fn)
    queue = p.catch(() => {})
    return p
  }

  MM.on('MM_JARGON_APPLY', ({ terms: raw }) => serial(async () => {
    const list = normalizeTerms(raw)
    const gen = navGen
    const applied = list.length ? await withoutBionic(() => (gen === navGen ? apply(list) : 0)) : apply(list)
    const idx = new Set([...document.querySelectorAll('mm-term[data-mm-term]')].map(el => Number(el.dataset.mmTerm)))
    return { ok: true, applied, found: [...idx].map(i => terms[i]?.term).filter(Boolean) }
  }))
  MM.on('MM_JARGON_CLEAR', () => serial(() => ({ ok: true, removed: clear() })))

  // Terms belong to the page they were found on (a hash change stays on the same page).
  MM.events.on('urlchange', ({ from, to } = {}) => {
    if (from && to && MM.pageKey(from) === MM.pageKey(to)) return
    navGen++
    if (terms.length) clear()
  })
  MM.events.on('settings', () => {
    const c = accent()
    for (const el of document.querySelectorAll('mm-term[data-mm-term]')) {
      el.style.textDecorationColor = c
      el.style.setProperty('--mm-term-c', c)
    }
  })
})()
