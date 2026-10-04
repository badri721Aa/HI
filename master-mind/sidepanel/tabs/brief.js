// Brief tab: the Dynamic TL;DR Engine and the Jargon decoder (B1 page intelligence).
// Briefs are cached per page and mode in IndexedDB (pages[key].brief, plus pages[key].briefs[mode]
// so switching back to a style you already generated is instant).
import { BRIEF_MODES } from '../../lib/tasks.js'
import { keywords, siteOf, timeAgo } from '../../lib/text.js'
import { linkCitations } from '../cite.js'

const DAY = 24 * 60 * 60 * 1000
const MODE_IDS = new Set(BRIEF_MODES.map(m => m.id))
const modeLabel = id => BRIEF_MODES.find(m => m.id === id)?.label || id
const CONTENT_TYPES = new Set(['news', 'opinion', 'research', 'documentation', 'tutorial', 'reference', 'blog', 'product', 'other'])
const ENTITY_TYPES = new Set(['person', 'organization', 'place', 'concept', 'technology', 'event', 'work', 'other'])
const TERM_KINDS = new Set(['acronym', 'technical', 'entity', 'foreign', 'historical', 'other'])
const ENTITY_COLOR = {
  person: 'var(--mm-pink)', organization: 'var(--mm-cyan)', place: 'var(--mm-lime)', concept: 'var(--mm-violet)',
  technology: 'var(--mm-amber)', event: 'var(--mm-red)', work: '#60A5FA', other: 'var(--mm-muted)',
}
const TYPE_COLOR = {
  news: 'var(--mm-cyan)', opinion: 'var(--mm-pink)', research: 'var(--mm-violet)', documentation: 'var(--mm-lime)',
  tutorial: 'var(--mm-amber)', reference: '#60A5FA', blog: 'var(--mm-pink)', product: 'var(--mm-amber)', other: 'var(--mm-fg-2)',
}
const LOADING_STEPS = ['Reading {n} words…', 'Finding what matters…', 'Distilling three takeaways…', 'Linking claims to sources…']

// Static, trusted icon markup only (never page or AI data).
const svg = d => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`
const ICON = {
  spark: svg('<path d="M12 3l1.9 5.3L19 10l-5.1 1.7L12 17l-1.9-5.3L5 10l5.1-1.7z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>'),
  refresh: svg('<path d="M20 11a8 8 0 0 0-14.9-3.9M4 4v4h4M4 13a8 8 0 0 0 14.9 3.9M20 20v-4h-4"/>'),
  copy: svg('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>'),
  note: svg('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>'),
  book: svg('<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5M9 7h6M9 11h4"/>'),
  lock: svg('<rect x="4" y="10" width="16" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>'),
  globe: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'),
  chev: svg('<path d="M9 6l6 6-6 6"/>'),
  x: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  speaker: svg('<path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/>'),
  wand: svg('<path d="M15 4V2M15 10V8M11 6H9M21 6h-2M18.5 3.5 17 5M18.5 8.5 17 7M3 21l11-11"/>'),
  ask: svg('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>'),
}

const CSS = `
.bf-card{display:flex;flex-direction:column;gap:12px;position:relative;overflow:hidden}
.bf-card::before{content:"";position:absolute;inset:0 0 auto;height:2px;background:var(--mm-gradient);opacity:.9}
.bf-head{display:flex;align-items:center;gap:10px;min-width:0}
.bf-icon{width:32px;height:32px;border-radius:10px;display:grid;place-items:center;flex:none;background:var(--mm-gradient);color:#06080D;box-shadow:0 0 18px color-mix(in srgb,var(--mm-accent) 32%,transparent)}
.bf-icon svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:2.1;stroke-linecap:round;stroke-linejoin:round}
.bf-icon.alt{background:rgba(255,255,255,.05);color:var(--mm-accent);box-shadow:inset 0 0 0 1px var(--mm-border-strong)}
.bf-head-text{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.mm-root .bf-head-text h2{font-size:15px}
.bf-sub{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px;color:var(--mm-muted)}
.bf-type{flex:none;color:var(--c);background:color-mix(in srgb,var(--c) 13%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--c) 32%,transparent)}
.bf-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.bf-stat{padding:9px 10px 8px;border-radius:11px;background:rgba(255,255,255,.03);border:1px solid var(--mm-border);display:flex;flex-direction:column;gap:4px;min-width:0}
.bf-stat b{font-size:16px;font-weight:700;color:var(--mm-heading);font-variant-numeric:tabular-nums;letter-spacing:-.01em;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bf-stat span{font:600 10px/1 var(--mm-font);text-transform:uppercase;letter-spacing:.08em;color:var(--mm-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
@media (max-width:360px){.bf-stats{gap:6px}.bf-stat{padding:8px 8px 7px}.bf-stat span{font-size:9px;letter-spacing:.02em}.bf-stat b{font-size:15px}}
.bf-modes{display:flex;flex-wrap:wrap;gap:6px}
.bf-modes .mm-chip{padding:6px 10px}
.bf-modes .mm-chip:disabled{opacity:.5;cursor:default}
.bf-body{display:flex;flex-direction:column;gap:12px;min-width:0}
.bf-summary{padding:12px 13px;border-radius:12px;background:rgba(0,0,0,.24);border:1px solid var(--mm-border);font-size:13.5px}
.bf-summary>:last-child{margin-bottom:0}
.mm-root .bf-h{display:flex;align-items:center;gap:8px;margin:2px 0 -3px;font:700 10.5px/1 var(--mm-font);letter-spacing:.09em;text-transform:uppercase;color:var(--mm-muted)}
.mm-root .bf-h::after{content:"";flex:1;height:1px;background:var(--mm-border)}
.bf-takeaways{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:9px}
.bf-takeaways li{display:flex;gap:10px;align-items:flex-start}
.bf-num{flex:none;width:22px;height:22px;border-radius:50%;display:grid;place-items:center;margin-top:0;font:800 11px/1 var(--mm-font);color:#06080D;background:var(--mm-gradient);box-shadow:0 0 12px color-mix(in srgb,var(--mm-accent) 30%,transparent)}
.bf-takeaways .mm-md{flex:1;min-width:0;font-size:13.5px;line-height:1.5;padding-top:1px}
.bf-takeaways .mm-md p{margin:0}
.bf-chips{display:flex;flex-wrap:wrap;gap:6px}
.bf-topic{cursor:default}
.bf-topic:hover{color:var(--mm-fg-2);border-color:var(--mm-border-strong)}
.bf-entity{display:inline-flex;align-items:center;gap:7px;max-width:100%;padding:5px 10px 5px 9px;border-radius:999px;border:1px solid var(--mm-border-strong);background:rgba(255,255,255,.03);color:var(--mm-fg);font:600 12px/1.2 var(--mm-font);cursor:pointer;transition:border-color .15s,background .15s}
.bf-entity:hover{border-color:color-mix(in srgb,var(--c) 60%,transparent);background:color-mix(in srgb,var(--c) 8%,transparent)}
.bf-entity .mm-dot{width:7px;height:7px}
.bf-entity span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bf-entity small{color:var(--mm-muted);font-weight:500;font-size:11px}
.bf-foot{display:flex;align-items:center;gap:2px;padding-top:10px;margin-top:-2px;border-top:1px solid var(--mm-border)}
.bf-meta{flex:1;min-width:0;font-size:11.5px;color:var(--mm-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bf-meta b{color:var(--mm-fg-2);font-weight:600}
.bf-prompt{display:flex;flex-direction:column;align-items:flex-start;gap:11px;padding:14px;border-radius:12px;background:linear-gradient(135deg,color-mix(in srgb,var(--mm-accent) 9%,transparent),color-mix(in srgb,var(--mm-accent-2) 7%,transparent));border:1px dashed color-mix(in srgb,var(--mm-accent) 32%,transparent)}
.bf-prompt p{margin:0;color:var(--mm-fg-2);font-size:13px;line-height:1.5}
.bf-prompt p b{display:block;color:var(--mm-heading);font-size:14px;margin-bottom:2px}
.bf-prompt .bf-hint{font-size:11.5px;color:var(--mm-muted)}
.bf-link{background:none;border:0;padding:0;font:inherit;color:var(--mm-accent);cursor:pointer;text-decoration:underline;text-underline-offset:2px}
.bf-status{display:flex;align-items:center;gap:9px;font-size:12.5px;color:var(--mm-fg-2)}
.bf-skel{display:flex;flex-direction:column;gap:8px}
.bf-skel .mm-skeleton{height:11px}
.bf-skel-row{display:flex;gap:10px;align-items:center}
.bf-skel-row .mm-skeleton:first-child{width:22px;height:22px;border-radius:50%;flex:none}
.bf-skel-row .mm-skeleton:last-child{flex:1}
.bf-errwrap{display:flex;flex-direction:column;gap:10px;align-items:flex-start}
.bf-jargon{display:flex;flex-direction:column;gap:12px}
.bf-jactions{display:flex;gap:8px;flex-wrap:wrap}
.bf-jstatus{font-size:12.5px;color:var(--mm-fg-2);line-height:1.45;display:flex;gap:8px;align-items:flex-start}
.bf-jstatus .mm-dot{margin-top:5px}
.bf-terms{list-style:none;margin:0;padding:0;border:1px solid var(--mm-border);border-radius:12px;overflow:hidden;background:rgba(0,0,0,.16)}
.bf-terms li+li{border-top:1px solid var(--mm-border)}
.bf-terms summary{list-style:none;display:flex;align-items:center;gap:8px;padding:9px 12px;cursor:pointer;border-radius:0}
.bf-terms summary::-webkit-details-marker{display:none}
.bf-terms summary:hover{background:rgba(255,255,255,.035)}
.bf-terms summary:focus-visible{outline-offset:-2px}
.bf-term-name{flex:1;min-width:0;font-weight:650;color:var(--mm-heading);overflow-wrap:anywhere}
.bf-off{font-size:10.5px;color:var(--mm-muted);font-weight:500;white-space:nowrap}
.bf-chev{display:grid;place-items:center;width:16px;height:16px;flex:none;color:var(--mm-muted);transition:transform .18s var(--mm-ease)}
.bf-chev svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
details[open]>summary .bf-chev{transform:rotate(90deg)}
.bf-term-body{padding:0 12px 12px;display:flex;flex-direction:column;gap:7px;font-size:13px;line-height:1.5}
.bf-term-body p{margin:0;color:var(--mm-fg)}
.bf-term-foot{display:flex;align-items:center;flex-wrap:wrap;gap:6px}
.bf-pron{font:12px/1.3 var(--mm-mono);color:var(--mm-muted);margin-right:2px}
.bf-term-foot .mm-btn{margin-left:auto}
.bf-term-body .mm-chip{cursor:default;padding:4px 8px;font-size:11px}
.bf-term-body .mm-chip:hover{color:var(--mm-fg-2);border-color:var(--mm-border-strong)}
.bf-k-acronym{color:var(--mm-cyan);background:color-mix(in srgb,var(--mm-cyan) 13%,transparent)}
.bf-k-technical{color:var(--mm-violet);background:color-mix(in srgb,var(--mm-violet) 13%,transparent)}
.bf-k-entity{color:var(--mm-amber);background:color-mix(in srgb,var(--mm-amber) 13%,transparent)}
.bf-k-foreign{color:var(--mm-pink);background:color-mix(in srgb,var(--mm-pink) 13%,transparent)}
.bf-k-historical{color:var(--mm-lime);background:color-mix(in srgb,var(--mm-lime) 13%,transparent)}
.bf-state{display:flex;flex-direction:column;align-items:center;text-align:center;gap:8px;padding:30px 18px}
.bf-state .bf-icon{width:44px;height:44px;border-radius:14px;margin-bottom:4px}
.bf-state .bf-icon svg{width:21px;height:21px}
.bf-state b{color:var(--mm-heading);font-size:15px}
.bf-state p{margin:0;color:var(--mm-fg-2);font-size:13px;line-height:1.5;max-width:300px}
.bf-state p.mm-muted{color:var(--mm-muted);font-size:12px}
.bf-state .mm-btn{margin-top:6px}
@media (prefers-reduced-motion:reduce){.bf-chev{transition:none}}
`

function injectStyles() {
  if (document.getElementById('mm-style-brief')) return
  const s = document.createElement('style')
  s.id = 'mm-style-brief'
  s.textContent = CSS
  document.head.appendChild(s)
}

/** Tiny DOM builder. `text` is set with textContent; `html` is for static icon markup only. */
function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue
    if (k === 'class') el.className = v
    else if (k === 'text') el.textContent = v
    else if (k === 'html') el.innerHTML = v
    else if (k === 'style') el.style.cssText = v
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v)
    else el.setAttribute(k, v === true ? '' : String(v))
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid)
  return el
}

const strs = (v, n, max = 200) => (Array.isArray(v) ? v : []).filter(x => typeof x === 'string').map(x => x.replace(/\s+/g, ' ').trim().slice(0, max)).filter(Boolean).slice(0, n)
const stripCites = s => String(s || '').replace(/\s*\[p\d+\]/g, '')
const fmtNum = n => Number(n || 0).toLocaleString()
const withArticle = s => `${/^[aeiou]/i.test(s) ? 'an' : 'a'} ${s}`
function fmtDate(s) {
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function cleanEntities(v, n = 12) {
  const seen = new Set()
  const out = []
  for (const e of Array.isArray(v) ? v : []) {
    const name = typeof e?.name === 'string' ? e.name.replace(/\s+/g, ' ').trim().slice(0, 80) : ''
    if (!name || seen.has(name.toLowerCase())) continue
    seen.add(name.toLowerCase())
    out.push({ name, type: ENTITY_TYPES.has(e.type) ? e.type : 'other' })
    if (out.length >= n) break
  }
  return out
}

/** Validate an AI brief payload (untrusted) into the stored shape. */
function cleanBrief(d, mode) {
  const summary = typeof d?.summary === 'string' ? d.summary.trim().slice(0, 6000) : ''
  if (!summary) throw Object.assign(new Error('Claude returned an empty brief. Try again.'), { code: 'FORMAT' })
  return {
    mode,
    summary,
    takeaways: strs(d.takeaways, 3, 400),
    topics: strs(d.topics, 6, 60),
    contentType: CONTENT_TYPES.has(d.contentType) ? d.contentType : 'other',
    entities: cleanEntities(d.entities),
  }
}

function cleanTerms(v) {
  const seen = new Set()
  const out = []
  for (const t of Array.isArray(v) ? v : []) {
    const term = typeof t?.term === 'string' ? t.term.replace(/\s+/g, ' ').trim().slice(0, 80) : ''
    if (term.length < 2 || seen.has(term.toLowerCase())) continue
    seen.add(term.toLowerCase())
    out.push({
      term,
      definition: typeof t.definition === 'string' ? t.definition.trim().slice(0, 600) : '',
      related: strs(t.related, 4, 60),
      kind: TERM_KINDS.has(t.kind) ? t.kind : 'other',
      pronunciation: typeof t.pronunciation === 'string' ? t.pronunciation.trim().slice(0, 80) : '',
    })
    if (out.length >= 30) break
  }
  return out
}

export function mount(root, ctx) {
  injectStyles()

  // ───────── state ─────────
  let page = null
  let epoch = 0 // bumps on every page change; stale async work checks it
  let mode = MODE_IDS.has(ctx.settings.briefMode) ? ctx.settings.briefMode : 'executive'
  let briefs = {} // mode → brief (with entities) for the current page
  let brief = null // the brief on screen
  let briefState = 'idle' // idle | checking | prompt | loading | ready | error | empty
  let briefError = null
  let briefCtrl = null
  let briefRun = 0
  let loadingTimer = 0
  let jState = 'idle' // idle | loading | ready | error
  let jTerms = []
  let jApplied = 0
  let jFound = null
  let jError = null
  let jargonCtrl = null
  let jargonRun = 0
  const jargonCache = new Map() // page key → terms (this panel session)
  const jargonOn = new Set() // page keys whose underlines the user turned on (kept in sync when we come back)
  let lastVisit = ''
  let writeChain = Promise.resolve()

  // ───────── persistence (merge, never clobber) ─────────
  function upsertPage(key, patch) {
    writeChain = writeChain.then(async () => {
      const cur = (await ctx.db.get('pages', key)) || {}
      const add = typeof patch === 'function' ? patch(cur) : patch
      const next = { entities: [], topics: [], keywords: [], ...cur, ...add, key }
      await ctx.db.put('pages', next)
    }).catch(e => console.warn('[Master Mind] could not save page record', e))
    return writeChain
  }

  function recordVisit(p) {
    const sig = `${p.key}|${p.extractedAt}`
    if (sig === lastVisit) return
    lastVisit = sig
    const text = p.paragraphs.map(x => x.text).join('\n')
    upsertPage(p.key, {
      url: p.url, title: p.title, site: p.site || siteOf(p.url), visited: Date.now(),
      wordCount: p.wordCount, readingMin: p.readingMin, keywords: keywords(text),
    })
  }

  function saveBrief(p, b) {
    const stored = { mode: b.mode, summary: b.summary, takeaways: b.takeaways, topics: b.topics, contentType: b.contentType, at: b.at, words: b.words }
    return upsertPage(p.key, cur => {
      const ents = cleanEntities([...b.entities, ...(cur.entities || [])], 24)
      const tops = [...new Set([...b.topics, ...(cur.topics || [])])].slice(0, 10)
      return {
        url: cur.url || p.url, title: cur.title || p.title, site: cur.site || p.site || siteOf(p.url),
        brief: stored,
        briefs: { ...(cur.briefs || {}), [b.mode]: { ...stored, entities: b.entities } },
        entities: ents,
        topics: tops,
      }
    })
  }

  /** A stored brief is reusable for 24h, as long as the page hasn't changed much. */
  function usable(b, p) {
    if (!b?.summary || !b.at || Date.now() - b.at > DAY) return false
    if (b.words && p.wordCount && Math.abs(p.wordCount - b.words) / b.words > 0.15) return false
    return true
  }

  // ───────── shell ─────────
  root.replaceChildren()
  const view = h('div', { class: 'mm-stack', style: 'gap:12px' })
  root.appendChild(view)

  // Brief card
  const subEl = h('span', { class: 'bf-sub' })
  const typeEl = h('span', { class: 'mm-badge bf-type', hidden: true })
  const statRead = h('b')
  const statWords = h('b')
  const statParas = h('b')
  const modeBtns = BRIEF_MODES.map(m => h('button', {
    type: 'button', class: 'mm-chip', 'aria-pressed': String(m.id === mode), 'data-mode': m.id, text: m.label,
    onclick: () => selectMode(m.id),
  }))
  const bodyEl = h('div', { class: 'bf-body', 'aria-live': 'polite', 'aria-busy': 'false' })
  const metaEl = h('span', { class: 'bf-meta' })
  const copyBtn = h('button', { type: 'button', class: 'mm-btn ghost icon sm', title: 'Copy brief as Markdown', 'aria-label': 'Copy brief as Markdown', html: ICON.copy, onclick: copyBrief })
  const noteBtn = h('button', { type: 'button', class: 'mm-btn ghost icon sm', title: 'Send to Notes', 'aria-label': 'Send brief to Notes', html: ICON.note, onclick: sendToNotes })
  const regenBtn = h('button', { type: 'button', class: 'mm-btn ghost icon sm', title: 'Regenerate', 'aria-label': 'Regenerate brief', html: ICON.refresh, onclick: () => generate() })
  const footEl = h('footer', { class: 'bf-foot' }, metaEl, copyBtn, noteBtn, regenBtn)
  const briefCard = h('section', { class: 'mm-card glow bf-card', 'aria-labelledby': 'bf-title' },
    h('header', { class: 'bf-head' },
      h('span', { class: 'bf-icon', html: ICON.spark }),
      h('div', { class: 'bf-head-text' }, h('h2', { id: 'bf-title', text: 'Briefing' }), subEl),
      typeEl),
    h('div', { class: 'bf-stats' },
      h('div', { class: 'bf-stat' }, statRead, h('span', { text: 'Read time' })),
      h('div', { class: 'bf-stat' }, statWords, h('span', { text: 'Words' })),
      h('div', { class: 'bf-stat' }, statParas, h('span', { text: 'Paragraphs' }))),
    h('div', { class: 'bf-modes', role: 'group', 'aria-label': 'Brief style' }, modeBtns),
    bodyEl,
    footEl)

  // Jargon card
  const jBtn = h('button', { type: 'button', class: 'mm-btn sm', html: ICON.wand, onclick: () => explainJargon() }, ' Explain jargon')
  const jClearBtn = h('button', { type: 'button', class: 'mm-btn ghost sm', html: ICON.x, onclick: clearJargon, hidden: true }, ' Clear')
  const jActions = h('div', { class: 'bf-jactions' }, jBtn, jClearBtn)
  const jBody = h('div', { class: 'mm-stack', 'aria-live': 'polite' })
  const jargonCard = h('section', { class: 'mm-card bf-jargon', 'aria-labelledby': 'bf-jtitle' },
    h('header', { class: 'bf-head' },
      h('span', { class: 'bf-icon alt', html: ICON.book }),
      h('div', { class: 'bf-head-text' },
        h('h2', { id: 'bf-jtitle', text: 'Jargon decoder' }),
        h('span', { class: 'bf-sub', text: 'Underline tricky terms with instant definitions' }))),
    jActions,
    jBody)

  const stateEl = h('div', { class: 'mm-card' })

  // ───────── rendering ─────────
  function renderView() {
    if (!page) {
      view.replaceChildren(stateEl)
      if (briefState === 'checking') return renderSkeletonView()
      const err = ctx.pageError
      stateEl.replaceChildren(h('div', { class: 'bf-state' },
        h('span', { class: 'bf-icon alt', html: err ? ICON.lock : ICON.globe }),
        h('b', { text: err ? 'Can’t read this page' : 'Open a page to brief' }),
        h('p', { text: err || 'Switch to an article, doc or blog post and Master Mind will summarize it here.' }),
        err ? h('p', { class: 'mm-muted', text: 'Open an article, doc or blog post in this tab and its brief will appear here.' }) : null,
        h('button', { type: 'button', class: 'mm-btn sm', html: ICON.refresh, onclick: retryPage }, ' Try again')))
      return
    }
    if (view.firstChild !== briefCard) view.replaceChildren(briefCard, jargonCard)
    renderMeta()
    renderBody()
    renderJargon()
  }

  function renderSkeletonView() {
    stateEl.replaceChildren(h('div', { class: 'bf-skel', 'aria-busy': 'true', 'aria-label': 'Reading the page' },
      h('div', { class: 'mm-skeleton', style: 'width:45%;height:15px' }),
      h('div', { class: 'mm-skeleton', style: 'height:46px;border-radius:11px' }),
      h('div', { class: 'mm-skeleton', style: 'width:92%' }),
      h('div', { class: 'mm-skeleton', style: 'width:84%' }),
      h('div', { class: 'mm-skeleton', style: 'width:70%' })))
  }

  function renderMeta() {
    const bits = []
    if (page.byline) bits.push(`By ${page.byline}`)
    const date = fmtDate(page.published)
    if (date) bits.push(date)
    if (!bits.length) bits.push(page.site || siteOf(page.url))
    subEl.textContent = bits.join(' · ')
    subEl.title = subEl.textContent
    statRead.textContent = `${page.readingMin} min`
    statWords.textContent = fmtNum(page.wordCount)
    statParas.textContent = fmtNum(page.paragraphs.length)
    const ct = briefState === 'ready' && brief?.contentType
    typeEl.hidden = !ct
    if (ct) { typeEl.textContent = ct; typeEl.style.setProperty('--c', TYPE_COLOR[ct] || TYPE_COLOR.other) }
    for (const b of modeBtns) {
      b.setAttribute('aria-pressed', String(b.dataset.mode === mode))
      b.disabled = !page.paragraphs.length
    }
  }

  function renderBody() {
    clearInterval(loadingTimer)
    bodyEl.setAttribute('aria-busy', String(briefState === 'loading' || briefState === 'checking'))
    footEl.hidden = briefState !== 'ready'
    if (briefState === 'checking') bodyEl.replaceChildren(skeleton(false))
    else if (briefState === 'loading') bodyEl.replaceChildren(skeleton(true))
    else if (briefState === 'prompt') bodyEl.replaceChildren(promptBlock())
    else if (briefState === 'error') bodyEl.replaceChildren(h('div', { class: 'bf-errwrap' }, ctx.errorBox(briefError), h('button', { type: 'button', class: 'mm-btn sm', html: ICON.refresh, onclick: () => generate() }, ' Try again')))
    else if (briefState === 'empty') bodyEl.replaceChildren(h('div', { class: 'mm-empty' }, h('b', { text: 'No readable text found' }), 'This page has no article-like text to brief. Try another page, or refresh once it finishes loading.'))
    else if (briefState === 'ready' && brief) renderBrief()
    else bodyEl.replaceChildren()
  }

  function skeleton(withStatus) {
    const wrap = h('div', { class: 'bf-skel' })
    if (withStatus) {
      const label = h('span')
      let i = 0
      const step = () => { label.textContent = LOADING_STEPS[i % LOADING_STEPS.length].replace('{n}', fmtNum(page?.wordCount)); i++ }
      step()
      loadingTimer = setInterval(step, 2200)
      wrap.append(h('div', { class: 'bf-status', role: 'status' }, h('span', { class: 'mm-spinner' }), label))
    }
    wrap.append(
      h('div', { class: 'bf-summary bf-skel', 'aria-hidden': 'true' },
        h('div', { class: 'mm-skeleton', style: 'width:96%' }), h('div', { class: 'mm-skeleton', style: 'width:100%' }),
        h('div', { class: 'mm-skeleton', style: 'width:88%' }), h('div', { class: 'mm-skeleton', style: 'width:62%' })),
      ...[78, 90, 70].map(w => h('div', { class: 'bf-skel-row', 'aria-hidden': 'true' }, h('div', { class: 'mm-skeleton' }), h('div', { class: 'mm-skeleton', style: `max-width:${w}%` }))))
    return wrap
  }

  function promptBlock() {
    const s = ctx.settings
    const min = Number(s.autoBriefMinWords) || 600
    const hint = !s.autoBrief
      ? 'Auto-brief is off, so pages wait for you. '
      : `Pages under ${fmtNum(min)} words aren’t briefed automatically. `
    return h('div', { class: 'bf-prompt' },
      h('p', {}, h('b', { text: 'Ready when you are' }), `A ${page.readingMin}-minute read, distilled into ${withArticle(modeLabel(mode).toLowerCase())} with clickable sources.`),
      h('button', { type: 'button', class: 'mm-btn primary', html: ICON.spark, onclick: () => generate() }, ' Generate brief'),
      h('p', { class: 'bf-hint' }, hint, h('button', { type: 'button', class: 'bf-link', text: 'Change in Settings', onclick: () => ctx.openHub('settings') })))
  }

  const validPids = () => new Set(page?.paragraphs.map(p => p.id) || [])
  const onCite = pid => ctx.sendToTab('MM_SCROLL_TO', { pid })
    .then(r => { if (r && r.found === false) ctx.toast('That passage changed on the page. Refresh to re-read it.') })
    .catch(() => ctx.toast('Couldn’t reach the page. Try refreshing it.'))

  function md(text, cls = 'mm-md') {
    const el = h('div', { class: cls })
    el.innerHTML = ctx.renderMarkdown(text) // DOMPurify-sanitized
    linkCitations(el, onCite, { validPids: validPids() })
    return el
  }

  function renderBrief() {
    const kids = [md(brief.summary, 'mm-md bf-summary')]
    if (brief.takeaways.length) {
      kids.push(h('h3', { class: 'bf-h', text: 'Key takeaways' }))
      kids.push(h('ol', { class: 'bf-takeaways' }, brief.takeaways.map((t, i) => h('li', {}, h('span', { class: 'bf-num', 'aria-hidden': 'true', text: String(i + 1) }), md(t)))))
    }
    if (brief.topics.length) {
      kids.push(h('h3', { class: 'bf-h', text: 'Topics' }))
      kids.push(h('div', { class: 'bf-chips' }, brief.topics.map(t => h('span', { class: 'mm-chip bf-topic', text: t }))))
    }
    if (brief.entities?.length) {
      kids.push(h('h3', { class: 'bf-h', text: 'Key entities' }))
      kids.push(h('div', { class: 'bf-chips' }, brief.entities.map(e => h('button', {
        type: 'button', class: 'bf-entity', style: `--c:${ENTITY_COLOR[e.type] || ENTITY_COLOR.other}`,
        title: `Ask what this page says about ${e.name}`, 'aria-label': `${e.name}, ${e.type}. Ask about it`,
        onclick: () => askAbout(e.name),
      }, h('span', { class: 'mm-dot' }), h('span', { text: e.name }), h('small', { text: e.type })))))
    }
    bodyEl.replaceChildren(...kids)
    metaEl.replaceChildren(h('b', { text: modeLabel(brief.mode) }), ` · ${brief.cached ? 'saved ' : ''}${timeAgo(brief.at)}`)
    metaEl.title = new Date(brief.at).toLocaleString()
  }

  function renderJargon() {
    const busy = jState === 'loading'
    jBtn.disabled = busy || !page?.paragraphs.length
    jBtn.hidden = jState === 'ready' || jState === 'error'
    jClearBtn.hidden = jState !== 'ready'
    jActions.hidden = jBtn.hidden && jClearBtn.hidden
    jBtn.lastChild.textContent = busy ? ' Finding terms…' : ' Explain jargon'
    if (busy) {
      jBody.replaceChildren(h('div', { class: 'bf-status', role: 'status' }, h('span', { class: 'mm-spinner' }), 'Scanning the page for specialist terms…'))
    } else if (jState === 'error') {
      jBody.replaceChildren(h('div', { class: 'bf-errwrap' }, ctx.errorBox(jError), h('button', { type: 'button', class: 'mm-btn sm', html: ICON.refresh, onclick: () => explainJargon() }, ' Try again')))
    } else if (jState === 'ready') {
      const found = jFound ? jTerms.filter(t => jFound.has(t.term)).length : jTerms.length
      const status = !jTerms.length
        ? 'No specialist jargon here: this page reads plainly.'
        : jApplied
          ? `Underlined ${found} of ${jTerms.length} terms on the page. Hover one, or Tab to it, for its definition card.`
          : 'Found these terms, but couldn’t underline them on the page (it may have changed).'
      jBody.replaceChildren(h('div', { class: 'bf-jstatus' }, h('span', { class: 'mm-dot', style: `--c:${jApplied ? 'var(--mm-lime)' : 'var(--mm-amber)'}` }), h('span', { text: status })))
      if (jTerms.length) jBody.appendChild(h('ul', { class: 'bf-terms', 'aria-label': 'Jargon terms' }, jTerms.map(termItem)))
    } else jBody.replaceChildren()
  }

  function termItem(t) {
    const onPage = !jFound || jFound.has(t.term)
    const canSpeak = 'speechSynthesis' in globalThis
    const body = h('div', { class: 'bf-term-body' },
      h('p', { text: t.definition || 'No definition available.' }),
      t.pronunciation || t.related.length || canSpeak
        ? h('div', { class: 'bf-term-foot' },
          t.pronunciation ? h('span', { class: 'bf-pron', text: `/${t.pronunciation.replace(/^\/|\/$/g, '')}/` }) : null,
          t.related.map(r => h('span', { class: 'mm-chip', text: r })),
          canSpeak ? h('button', { type: 'button', class: 'mm-btn ghost icon sm', title: 'Pronounce', 'aria-label': `Pronounce ${t.term}`, html: ICON.speaker, onclick: () => say(t.term) }) : null)
        : null)
    return h('li', {}, h('details', {},
      h('summary', {},
        h('span', { class: 'bf-term-name', text: t.term }),
        onPage ? null : h('span', { class: 'bf-off', text: 'not underlined' }),
        h('span', { class: `mm-badge bf-k-${t.kind}`, text: t.kind }),
        h('span', { class: 'bf-chev', html: ICON.chev })),
      body))
  }

  // ───────── actions ─────────
  async function setPage(p, { force = false } = {}) {
    const same = !force && p && page && p.key === page.key
    page = p
    if (same) {
      // Same page re-read (refresh, SPA hash change): keep the brief and any work in flight.
      recordVisit(p)
      if (briefState === 'empty' && p.paragraphs.length) { briefState = 'prompt'; return setPage(p, { force: true }) }
      renderView()
      return
    }
    const my = ++epoch
    briefCtrl?.abort()
    jargonCtrl?.abort()
    briefRun++
    jargonRun++
    briefs = {}
    brief = null
    briefError = null
    jState = 'idle'
    jTerms = []
    jFound = null
    if (!p) { briefState = 'idle'; renderView(); return }
    if (!p.paragraphs.length) { briefState = 'empty'; renderView(); return }
    briefState = 'checking'
    renderView()
    recordVisit(p)
    let rec = null
    try { rec = await ctx.db.get('pages', p.key) } catch (e) { console.warn('[Master Mind] could not read page record', e) }
    if (my !== epoch) return
    for (const [m, b] of Object.entries(rec?.briefs || {})) if (MODE_IDS.has(m) && usable(b, p)) briefs[m] = { ...b, entities: cleanEntities(b.entities || rec.entities) }
    if (!briefs[rec?.brief?.mode] && usable(rec?.brief, p)) briefs[rec.brief.mode] = { ...rec.brief, entities: cleanEntities(rec.entities) }
    const s = ctx.settings
    if (briefs[mode]) showBrief(briefs[mode], true)
    else if (s.autoBrief && p.wordCount >= (Number(s.autoBriefMinWords) || 0)) generate()
    else { briefState = 'prompt'; renderView() }
    if (s.autoJargon || (jargonOn.has(p.key) && jargonCache.has(p.key))) explainJargon()
  }

  function showBrief(b, cached) {
    brief = { ...b, cached }
    briefState = 'ready'
    renderMeta()
    renderBody()
    ctx.emit('brief-ready', { page, data: { summary: b.summary, takeaways: b.takeaways, topics: b.topics, entities: b.entities || [], contentType: b.contentType, mode: b.mode, cached } })
  }

  async function generate() {
    if (!page?.paragraphs.length) return
    const p = page
    const m = mode
    const my = ++briefRun
    briefCtrl?.abort()
    const ctrl = (briefCtrl = new AbortController())
    brief = null
    briefState = 'loading'
    renderMeta()
    renderBody()
    try {
      const res = await ctx.runTask('brief', { page: p, mode: m }, { signal: ctrl.signal })
      if (my !== briefRun || page?.key !== p.key) return
      const b = { ...cleanBrief(res.data, m), at: Date.now(), words: p.wordCount }
      briefs[m] = b
      showBrief(b, false)
      saveBrief(p, b)
    } catch (e) {
      if (my !== briefRun || page?.key !== p.key) return
      if (e?.code === 'ABORT') { briefState = briefs[mode] ? 'ready' : 'prompt'; brief = briefs[mode] || null; renderView(); return }
      briefError = e
      briefState = 'error'
      renderMeta()
      renderBody()
    } finally {
      if (briefCtrl === ctrl) briefCtrl = null
    }
  }

  function selectMode(m) {
    if (!MODE_IDS.has(m) || !page?.paragraphs.length) return
    if (m === mode && (briefState === 'ready' || briefState === 'loading')) return
    mode = m
    if (briefs[m]) { briefCtrl?.abort(); briefRun++; showBrief(briefs[m], true) } else generate()
  }

  async function retryPage() {
    briefState = 'checking'
    page = null
    renderView()
    const p = await ctx.getPage({ force: true }).catch(() => null)
    setPage(p, { force: true })
  }

  function briefMarkdown() {
    const lines = [`## ${page.title}`, '', stripCites(brief.summary).trim()]
    if (brief.takeaways.length) lines.push('', '**Key takeaways**', ...brief.takeaways.map(t => `- ${stripCites(t).trim()}`))
    if (brief.topics.length) lines.push('', `*Topics:* ${brief.topics.join(', ')}`)
    lines.push('', `Source: [${page.title.replace(/[[\]]/g, '')}](${page.url})`)
    return lines.join('\n')
  }

  async function copyBrief() {
    if (!brief || !page) return
    const text = briefMarkdown()
    try { await navigator.clipboard.writeText(text) } catch {
      const ta = h('textarea', { style: 'position:fixed;opacity:0;pointer-events:none' })
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
    ctx.toast('Brief copied as Markdown')
  }

  async function sendToNotes() {
    if (!brief || !page) return
    const markdown = briefMarkdown()
    const source = { url: page.url, title: page.title }
    await ctx.showTab('notes')
    ctx.emit('insert-note', { markdown, source })
  }

  async function askAbout(name) {
    await ctx.showTab('ask')
    ctx.emit('ask', { question: `What does this page say about ${name}?` })
  }

  function say(text) {
    try {
      speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(text)
      u.lang = page?.lang || navigator.language || 'en'
      u.rate = 0.9
      const v = ctx.settings.ttsVoice && speechSynthesis.getVoices().find(x => x.name === ctx.settings.ttsVoice)
      if (v) u.voice = v
      speechSynthesis.speak(u)
    } catch { ctx.toast('Speech isn’t available in this browser.') }
  }

  async function explainJargon() {
    if (!page?.paragraphs.length) return
    const p = page
    const my = ++jargonRun
    jargonCtrl?.abort()
    const ctrl = (jargonCtrl = new AbortController())
    jState = 'loading'
    jError = null
    renderJargon()
    try {
      let terms = jargonCache.get(p.key)
      if (!terms) {
        const res = await ctx.runTask('jargon', { page: p }, { signal: ctrl.signal })
        if (my !== jargonRun || page?.key !== p.key) return
        terms = cleanTerms(res.data?.terms)
        jargonCache.set(p.key, terms)
      }
      const r = terms.length ? await ctx.sendToTab('MM_JARGON_APPLY', { terms }) : { ok: true, applied: 0, found: [] }
      if (my !== jargonRun || page?.key !== p.key) return
      if (r?.ok === false) throw new Error(r.error || 'Couldn’t mark up the page.')
      jTerms = terms
      jApplied = r?.applied || 0
      if (jApplied) jargonOn.add(p.key)
      jFound = Array.isArray(r?.found) ? new Set(r.found) : null
      jState = 'ready'
      renderJargon()
      ctx.emit('jargon-ready', { terms })
    } catch (e) {
      if (my !== jargonRun || page?.key !== p.key) return
      if (e?.code === 'ABORT') { jState = 'idle'; renderJargon(); return }
      jError = e
      jState = 'error'
      renderJargon()
    } finally {
      if (jargonCtrl === ctrl) jargonCtrl = null
    }
  }

  async function clearJargon() {
    jargonCtrl?.abort()
    jargonRun++
    if (page) jargonOn.delete(page.key)
    try { await ctx.sendToTab('MM_JARGON_CLEAR') } catch { /* page gone: nothing to clear */ }
    jState = 'idle'
    jTerms = []
    jFound = null
    renderJargon()
    jBtn.focus()
  }

  // ───────── boot ─────────
  briefState = 'checking'
  renderView()
  ctx.getPage().then(p => { if (briefState === 'checking' && !page) setPage(p ?? null) }, () => setPage(null))

  return {
    onPage(p) { setPage(p ?? null) },
    onShow() { if (brief && briefState === 'ready') renderBrief() },
  }
}
