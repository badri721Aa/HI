// Master Mind main-content extractor (B1 page intelligence).
// Finds the article-like container on any page, turns it into numbered paragraphs (the Page object
// in ARCHITECTURE.md) and tags every source element with data-mm-pid="pN" so the side panel's
// citations can scroll to and glow the exact paragraph.
//
// Handlers: MM_EXTRACT, MM_SCROLL_TO, MM_GLOW.
// Helpers for other content modules: MM.extract({force}), MM.paraEl(pid), MM.paraEls(), MM.glowParas(pids, opts).
(() => {
  const MM = globalThis.MM
  if (!MM || MM.__skip) return

  const MAX_PARAS = 1500
  const MAX_CHARS = 6000 // per paragraph
  const MAX_SCORED = 6000 // paragraph-like nodes considered when picking the main container
  const PID_RE = /^p\d+$/

  // Elements emitted as paragraphs, mapped to the Page tag vocabulary.
  const TAG_MAP = {
    p: 'p', h1: 'h1', h2: 'h2', h3: 'h3', h4: 'h4', h5: 'h4', h6: 'h4',
    li: 'li', dt: 'li', dd: 'li', blockquote: 'blockquote', pre: 'pre',
    figcaption: 'figcaption', caption: 'figcaption', td: 'td', th: 'td', summary: 'h4',
  }
  const INLINE = new Set(('a abbr acronym b bdi bdo big br cite code data del dfn em font i img ins kbd label mark nobr q rp rt ruby s samp small span strike strong sub sup time tt u var wbr')
    .split(' '))
  // Never read inside these.
  const SKIP_TAGS = new Set(('script style noscript template svg canvas iframe frame object embed video audio picture map select textarea input button form nav aside footer dialog menu head link meta math option datalist output progress meter')
    .split(' '))
  const SKIP_ROLES = new Set(['navigation', 'complementary', 'contentinfo', 'search', 'dialog', 'alertdialog', 'menu', 'menubar', 'toolbar', 'tablist', 'tooltip', 'button', 'banner'])
  const BLOCKISH = 'p,div,section,article,main,h1,h2,h3,h4,h5,h6,ul,ol,li,dl,table,blockquote,pre,figure,header,footer,aside,nav,form'
  // Junk hints in class/id. Whole tokens (split on space, _ and -) or distinctive substrings.
  const NEG_TOKENS = new Set(('nav navbar navigation menu menus sidebar side aside footer foot header masthead comment comments disqus ad ads adv advert adverts advertisement advertising banner promo promos promoted sponsor sponsored share sharing social related recommend recommended recommendations cookie cookies consent gdpr newsletter subscribe subscription signup breadcrumb breadcrumbs modal popup popover overlay widget widgets outbrain taboola paywall toolbar skip')
    .split(' '))
  const NEG_SUBSTR = /sidebar|navbar|newsletter|breadcrumb|cookie|sponsor|advert|promo|social|subscribe|footer|masthead|popup|modal|outbrain|taboola|related-?(posts|articles|stories|content|links)|share-?(bar|buttons|links|tools)|comment-?(list|form|section|s\b)/i
  const POS_HINT = /article|body|content|entry|hentry|main|page|post|text|blog|story|prose|markdown|rich-?text/i

  const state = {
    key: MM.pageKey(), // page identity (no hash): ids reset when it changes
    next: 0, // next fresh paragraph number
    texts: new Map(), // pid → text from the last extraction (reuse ids for unchanged elements)
    els: new Map(), // pid → element from the last extraction
    cache: null, // last Page
    sig: '', // cheap fingerprint of the main container, for MM.extract() cache checks
    root: null,
    spaNavigated: false,
    urlChangedAt: 0,
    lastMutation: 0,
  }

  // ───────── helpers ─────────
  const clean = s => String(s || '').replace(/[\u200b\ufeff]/g, '').replace(/[\s\u00a0]+/g, ' ').trim()
  const cleanPre = s => String(s || '').replace(/[\u200b\ufeff]/g, '').replace(/\u00a0/g, ' ').replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').replace(/^\n+|\s+$/g, '')
  const cap = s => (s.length > MAX_CHARS ? `${s.slice(0, MAX_CHARS - 1)}…` : s)
  const isOwnTag = el => el.localName === 'mm-host'
  const visible = el => {
    try { return el.checkVisibility ? el.checkVisibility({ visibilityProperty: true, checkVisibilityCSS: true }) : !!el.getClientRects().length } catch { return true }
  }
  const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu
  function countWords(text) {
    const cjk = (text.match(CJK) || []).length
    const rest = cjk ? text.replace(CJK, ' ') : text
    return (rest.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length + Math.round(cjk / 2)
  }

  const hintCache = new WeakMap()
  /** -1 junk, +1 content, 0 neutral, from class/id/role. */
  function hint(el) {
    let v = hintCache.get(el)
    if (v !== undefined) return v
    const s = `${typeof el.className === 'string' ? el.className : el.getAttribute('class') || ''} ${el.id || ''}`.trim()
    v = 0
    if (s) {
      let neg = NEG_SUBSTR.test(s)
      if (!neg) for (const tok of s.toLowerCase().split(/[\s_-]+/)) if (NEG_TOKENS.has(tok)) { neg = true; break }
      const pos = POS_HINT.test(s)
      v = neg && !pos ? -1 : pos && !neg ? 1 : 0
    }
    hintCache.set(el, v)
    return v
  }

  function inlineHasBlocks(el) {
    return !!el.firstElementChild && !!el.querySelector(BLOCKISH)
  }

  function linkLen(el) {
    if (el.localName === 'a') return el.textContent.length
    if (!el.firstElementChild) return 0
    let n = 0
    for (const a of el.querySelectorAll('a')) n += a.textContent.length
    return n
  }

  // ───────── 1. pick the main container ─────────
  const SKIP_CLOSEST = 'nav,aside,footer,form,dialog,menu,[role="navigation"],[role="complementary"],[role="contentinfo"],[role="dialog"],[aria-hidden="true"],mm-host,[data-mm-host]'
  const BLOCKED_TAGS = new Set(['nav', 'aside', 'footer', 'form', 'dialog', 'menu', 'mm-host', 'script', 'style', 'noscript', 'template'])
  const BLOCKED_ROLES = new Set(['navigation', 'complementary', 'contentinfo', 'dialog', 'alertdialog', 'menu', 'menubar', 'search'])
  const blockedCache = new WeakMap()
  /** Is this element itself a container whose text never counts as main content? (cached) */
  function blocked(el) {
    let v = blockedCache.get(el)
    if (v === undefined) {
      v = BLOCKED_TAGS.has(el.localName) || el.getAttribute('aria-hidden') === 'true' || el.hasAttribute('data-mm-host') || BLOCKED_ROLES.has(el.getAttribute('role'))
      blockedCache.set(el, v)
    }
    return v
  }

  function pickRoot({ useHints = true } = {}) {
    const body = document.body
    if (!body) return document.documentElement
    const scores = new Map()
    const goodLen = new Map()
    const init = el => {
      let s = 0
      const t = el.localName
      if (t === 'article') s += 10
      else if (t === 'main') s += 8
      else if (t === 'div') s += 5
      else if (t === 'section') s += 3
      else if (t === 'pre' || t === 'td' || t === 'blockquote') s += 3
      else if (t === 'ol' || t === 'ul' || t === 'dl' || t === 'li' || t === 'form') s -= 3
      else if (/^h[1-6]$/.test(t) || t === 'th') s -= 5
      const role = el.getAttribute('role')
      if (role === 'main') s += 8
      if (el.getAttribute('itemprop') === 'articleBody') s += 12
      s += hint(el) * 25
      scores.set(el, s)
    }

    const nodes = body.querySelectorAll('p,pre,td,blockquote')
    const list = []
    for (let i = 0; i < nodes.length && list.length < MAX_SCORED; i++) list.push(nodes[i])
    // Text sitting directly in divs (sites that don't use <p>).
    if (list.length < 30) {
      for (const d of body.querySelectorAll('div,section,article')) {
        if (list.length >= MAX_SCORED) break
        for (let c = d.firstChild; c; c = c.nextSibling) {
          if (c.nodeType === 3 && c.nodeValue.trim().length >= 40) { list.push(d); break }
        }
      }
    }

    for (const node of list) {
      if (blocked(node)) continue
      const text = node.textContent
      let len = text.length
      if (len < 25) continue
      if (len < 160 && (len = clean(text).length) < 25) continue // whitespace-padded fragments
      // Paragraphs inside nav/aside/footer… or junk-hinted wrappers don't count.
      let junk = false
      const chain = []
      for (let a = node.parentElement; a && a !== body && a !== document.documentElement; a = a.parentElement) {
        if (blocked(a) || (useHints && hint(a) < 0 && a.localName !== 'article' && a.localName !== 'main')) { junk = true; break }
        chain.push(a)
      }
      if (junk) continue
      const s = 1 + (text.match(/[,，、]/g) || []).length + Math.min(3, Math.floor(len / 100))
      chain.forEach((a, level) => {
        goodLen.set(a, (goodLen.get(a) || 0) + len)
        if (level > 3) return
        if (!scores.has(a)) init(a)
        scores.set(a, scores.get(a) + s / (level === 0 ? 1 : level === 1 ? 2 : level * 3))
      })
    }
    if (!scores.size) return body

    // Weigh the strongest candidates by link density.
    const top = [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
    let best = null
    let bestScore = -Infinity
    for (const [el, s] of top) {
      const tl = el.textContent.length || 1
      const ld = Math.min(1, linkLen(el) / tl)
      const final = s * (1 - ld)
      if (final > bestScore) { bestScore = final; best = el }
    }
    if (!best) return body

    // Climb while the parent holds clearly more real paragraph text (content split over sibling blocks),
    // or while the parent is the semantic article wrapper of what we found.
    for (let p = best.parentElement; p && p !== body && p !== document.documentElement; p = p.parentElement) {
      const mine = goodLen.get(best) || 0
      const theirs = goodLen.get(p) || 0
      const semantic = p.localName === 'article' || p.localName === 'main' || p.getAttribute('role') === 'main' || p.getAttribute('itemprop') === 'articleBody'
      const tl = p.textContent.length || 1
      const ld = linkLen(p) / tl
      if (ld > 0.4 || (useHints && hint(p) < 0)) break
      if (theirs >= mine * 1.25 || (semantic && theirs >= mine)) best = p
      else if (!semantic) break
    }
    return best
  }

  // ───────── 2. collect blocks from the container ─────────
  /** Site-level header (logo, menu) rather than an article header (title, byline)? */
  const siteHeader = (el, wholeBody) => !el.closest('article,main,[role="main"],[itemprop="articleBody"]') && (wholeBody || !!el.querySelector('nav,[role="navigation"],[role="search"],form'))

  function shouldSkip(el, rootLen, wholeBody) {
    const t = el.localName
    if (SKIP_TAGS.has(t) || isOwnTag(el) || el.hasAttribute('data-mm-host')) return true
    if (el.hidden || el.getAttribute('aria-hidden') === 'true' || el.inert) return true
    const role = el.getAttribute('role')
    if (role === 'banner') { if (siteHeader(el, wholeBody)) return true } else if (role && SKIP_ROLES.has(role)) return true
    if (t === 'header' && siteHeader(el, wholeBody)) return true
    if (hint(el) < 0 && rootLen) {
      // A junk hint on a small block inside the article (share bar, ad slot, related links) → skip it.
      // A hint on a huge wrapper is likely a false positive ("content-with-sidebar"), so keep it.
      if (el.textContent.length < rootLen * 0.4) return true
    }
    return !visible(el)
  }

  function collect(root, { skipJunk = true } = {}) {
    const out = [] // {el, tag, text} or null (reserved slot that didn't qualify)
    const rootLen = skipJunk ? root.textContent.length : 0
    const wholeBody = root === document.body || root === document.documentElement
    let count = 0

    const pushBlock = (el, tag, text, links) => {
      const isPre = tag === 'pre'
      text = isPre ? cleanPre(text) : clean(text)
      if (!text) return null
      const n = text.length
      const heading = /^h\d$/.test(tag)
      const min = heading ? 2 : tag === 'li' ? 3 : isPre ? 8 : tag === 'td' ? 8 : 25
      if (n < min) return null
      if (!heading && !isPre && links / n > 0.6) return null // link lists, "read more" rows
      count++
      return { el, tag, text: cap(text) }
    }

    const visit = (el, ctxTag) => {
      if (count >= MAX_PARAS) return
      const t = el.localName
      const mapped = TAG_MAP[t]

      if (t === 'pre') {
        const b = pushBlock(el, 'pre', el.textContent, 0)
        if (b) out.push(b)
        return
      }
      if (t === 'tr') {
        const cells = [...el.children].filter(c => c.localName === 'td' || c.localName === 'th')
        if (cells.length && !cells.some(c => c.querySelector(BLOCKISH))) {
          const text = cells.filter(visible).map(c => clean(c.textContent)).filter(Boolean).join(' | ')
          const b = pushBlock(el, 'td', text, linkLen(el))
          if (b) out.push(b)
          return
        }
      }

      const nextCtx = t === 'blockquote' ? 'blockquote' : t === 'li' || t === 'dd' || t === 'dt' ? 'li' : ctxTag
      let slot = -1 // reserved position of this element's own inline text, in document order
      let run = ''
      let links = 0
      const reserve = () => { if (slot < 0) { slot = out.length; out.push(null) } }
      for (let c = el.firstChild; c; c = c.nextSibling) {
        if (count >= MAX_PARAS) break
        if (c.nodeType === 3) {
          const v = c.nodeValue
          if (v.trim()) reserve()
          run += v
        } else if (c.nodeType === 1) {
          const ct = c.localName
          if ((INLINE.has(ct) || ct === 'mm-term' || ct === 'mm-mark' || (ct.includes('-') && !isOwnTag(c))) && !inlineHasBlocks(c)) {
            if (ct === 'br') { run += ' '; continue }
            if (ct === 'img' || !visible(c) || c.getAttribute('aria-hidden') === 'true') continue
            const s = c.textContent
            if (s.trim()) reserve()
            run += s
            links += linkLen(c)
          } else if (!shouldSkip(c, rootLen, wholeBody)) {
            run += ' '
            visit(c, nextCtx)
          }
        }
      }
      if (slot >= 0) {
        let tag = mapped || 'p'
        if (tag === 'p' && ctxTag) tag = ctxTag
        out[slot] = pushBlock(el, tag, run, links)
      }
    }

    if (wholeBody || !shouldSkip(root, 0, false)) visit(root, null)
    return out.filter(Boolean).slice(0, MAX_PARAS)
  }

  /** The page's title heading, if the container doesn't include one (e.g. <header><h1> above the body div). */
  function titleHeading(root, blocks) {
    if (blocks.some(b => b.tag === 'h1')) return null
    let pick = null
    for (const h of document.querySelectorAll('h1')) {
      if (root.contains(h) || h.closest(SKIP_CLOSEST) || !visible(h)) continue
      if (!(h.compareDocumentPosition(root) & Node.DOCUMENT_POSITION_FOLLOWING)) continue
      const text = clean(h.textContent)
      if (text.length >= 2) pick = { el: h, tag: 'h1', text: cap(text) }
    }
    return pick
  }

  // ───────── 3. metadata ─────────
  const meta = (attr, name) => clean(document.querySelector(`meta[${attr}="${name}"]`)?.getAttribute('content'))

  let ldCache = null
  function jsonLd() {
    if (ldCache && ldCache.url === location.href) return ldCache.data
    const data = {}
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      let j
      try { j = JSON.parse(s.textContent) } catch { continue }
      const items = [].concat(j?.['@graph'] || j || [])
      for (const it of items) {
        if (!it || typeof it !== 'object') continue
        const type = [].concat(it['@type'] || []).join(' ')
        if (!/Article|Posting|Report|WebPage|BlogPosting|NewsArticle/i.test(type)) continue
        data.headline ??= typeof it.headline === 'string' ? it.headline : undefined
        data.datePublished ??= typeof it.datePublished === 'string' ? it.datePublished : undefined
        const a = [].concat(it.author || [])[0]
        data.author ??= typeof a === 'string' ? a : typeof a?.name === 'string' ? a.name : undefined
      }
    }
    ldCache = { url: location.href, data }
    return data
  }

  function getTitle(blocks) {
    const h1 = blocks.find(b => b.tag === 'h1')?.text || clean([...document.querySelectorAll('h1')].find(h => !h.closest(SKIP_CLOSEST) && visible(h))?.textContent)
    const og = meta('property', 'og:title') || meta('name', 'twitter:title')
    // After an SPA navigation, meta tags are often stale; trust what's on screen.
    const t = state.spaNavigated ? (h1 || clean(document.title) || og) : (og || h1 || clean(document.title))
    return (t || location.hostname).slice(0, 300)
  }

  function getByline(root) {
    let s = meta('name', 'author') || meta('property', 'article:author') || meta('name', 'byl')
    if (/^https?:/i.test(s)) s = ''
    if (!s) {
      const el = document.querySelector('[rel="author"]') || root.querySelector('[itemprop="author"], .byline, .author, [class*="byline"]') || document.querySelector('[itemprop="author"], .byline')
      if (el && !el.closest('mm-host')) s = clean(el.textContent)
    }
    if (!s) s = clean(jsonLd().author)
    s = s.replace(/^by[\s:]+/i, '').split(/\s[·|•—–]\s/)[0].trim()
    return s.length > 120 ? '' : s
  }

  function getPublished(root) {
    const m = meta('property', 'article:published_time') || meta('itemprop', 'datePublished') || meta('name', 'date') || meta('name', 'pubdate') || meta('name', 'publish-date')
    if (m) return m
    const time = root.querySelector('time[datetime]') || document.querySelector('article time[datetime], main time[datetime], time[datetime]')
    return clean(time?.getAttribute('datetime')) || clean(jsonLd().datePublished)
  }

  function getLang() {
    return clean(document.documentElement.getAttribute('lang') || document.querySelector('meta[http-equiv="content-language" i]')?.getAttribute('content') || '').slice(0, 20)
  }

  // ───────── 4. extraction ─────────
  function resetIds() {
    for (const el of document.querySelectorAll('[data-mm-pid]')) el.removeAttribute('data-mm-pid')
    state.texts = new Map()
    state.els = new Map()
    state.next = 0
    state.cache = null
    state.sig = ''
    state.root = null
    ldCache = null
  }

  const sigOf = root => (root?.isConnected ? `${location.href}|${root.textContent.length}|${root.childElementCount}` : '')

  function run() {
    if (MM.pageKey() !== state.key) { state.key = MM.pageKey(); state.spaNavigated = true; resetIds() }
    const t0 = performance.now()
    let root = pickRoot()
    let blocks = collect(root)
    let words = blocks.reduce((n, b) => n + countWords(b.text), 0)
    if (words < 40 && root !== document.body) {
      // Too little in the chosen container: retry without class hints, then fall back to the whole body.
      const alt = pickRoot({ useHints: false })
      const altBlocks = alt !== root ? collect(alt) : []
      const altWords = altBlocks.reduce((n, b) => n + countWords(b.text), 0)
      if (altWords > words) { root = alt; blocks = altBlocks; words = altWords }
      if (words < 40 && document.body) {
        const bodyBlocks = collect(document.body)
        const bodyWords = bodyBlocks.reduce((n, b) => n + countWords(b.text), 0)
        if (bodyWords > words * 1.5) { root = document.body; blocks = bodyBlocks; words = bodyWords }
      }
    }
    const head = titleHeading(root, blocks)
    if (head) { blocks.unshift(head); words += countWords(head.text); if (blocks.length > MAX_PARAS) blocks.length = MAX_PARAS }

    // Assign ids: reuse the old id when the same element still has the same text.
    const used = new Set()
    const els = new Map()
    const texts = new Map()
    const paragraphs = []
    for (const b of blocks) {
      let pid = b.el.getAttribute('data-mm-pid')
      if (!(pid && PID_RE.test(pid) && !used.has(pid) && state.els.get(pid) === b.el && state.texts.get(pid) === b.text)) pid = `p${state.next++}`
      used.add(pid)
      els.set(pid, b.el)
      texts.set(pid, b.text)
      paragraphs.push({ id: pid, text: b.text, tag: b.tag })
    }
    // Batch DOM writes after all reads (attribute writes invalidate style; reads above force it).
    for (const el of document.querySelectorAll('[data-mm-pid]')) {
      const pid = el.getAttribute('data-mm-pid')
      if (els.get(pid) !== el) el.removeAttribute('data-mm-pid')
    }
    for (const [pid, el] of els) if (el.getAttribute('data-mm-pid') !== pid) el.setAttribute('data-mm-pid', pid)
    state.els = els
    state.texts = texts
    state.root = root

    const page = {
      url: location.href,
      key: MM.pageKey(),
      title: getTitle(blocks),
      site: location.hostname.replace(/^www\./, ''),
      lang: getLang(),
      byline: getByline(root),
      published: getPublished(root),
      wordCount: words,
      readingMin: Math.max(1, Math.round(words / 230)),
      paragraphs,
      extractedAt: Date.now(),
    }
    state.cache = page
    state.sig = sigOf(root)
    const ms = performance.now() - t0
    if (ms > 250) console.debug(`[Master Mind] extracted ${paragraphs.length} paragraphs in ${Math.round(ms)}ms`)
    return page
  }

  /**
   * Extract the main content. Cached until the page's main container changes.
   * @param {{force?: boolean}} [opts]
   * @returns {object} Page (see ARCHITECTURE.md)
   */
  function extract({ force = false } = {}) {
    if (!force && state.cache && state.key === MM.pageKey() && state.sig && state.sig === sigOf(state.root)) {
      let intact = true
      for (const el of state.els.values()) if (!el.isConnected) { intact = false; break }
      if (intact) return state.cache
    }
    return run()
  }

  // After an SPA navigation the new view often renders a beat later: wait for the DOM to settle.
  let settleObserver = null
  function watchSettle() {
    state.lastMutation = Date.now()
    settleObserver?.disconnect()
    settleObserver = new MutationObserver(records => {
      for (const r of records) {
        const tgt = r.target.nodeType === 1 ? r.target : r.target.parentElement
        if (tgt && !MM.isOwn(tgt) && !tgt.closest('mm-term,mm-mark')) { state.lastMutation = Date.now(); return }
      }
    })
    settleObserver.observe(document.body || document.documentElement, { childList: true, subtree: true, characterData: true })
    setTimeout(() => { settleObserver?.disconnect(); settleObserver = null }, 3000)
  }
  async function settled() {
    const QUIET = 250
    const MAX = 2000
    while (Date.now() - state.urlChangedAt < MAX && Date.now() - state.lastMutation < QUIET) {
      await new Promise(r => setTimeout(r, 60))
    }
  }

  /** SPA navigation to a different page (hash-only changes keep ids). */
  function navigated() {
    state.key = MM.pageKey()
    state.spaNavigated = true
    state.urlChangedAt = Date.now()
    resetIds()
    watchSettle()
  }
  MM.events.on('urlchange', () => { if (MM.pageKey() !== state.key) navigated() })

  // ───────── glow ─────────
  const ACCENT = { cyan: '#22D3EE', violet: '#A78BFA', lime: '#A3E635', pink: '#F472B6', amber: '#FBBF24' }
  const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches
  function ensureStyle() {
    if (document.getElementById('mm-page-style-extract')) return
    const s = document.createElement('style')
    s.id = 'mm-page-style-extract'
    s.textContent = `
[data-mm-glow]{--mm-glow-c:#22D3EE;outline:2px solid var(--mm-glow-c)!important;outline-offset:4px!important;border-radius:6px;scroll-margin:96px;
box-shadow:0 0 0 6px color-mix(in srgb,var(--mm-glow-c) 20%,transparent),0 0 34px 6px color-mix(in srgb,var(--mm-glow-c) 42%,transparent),inset 0 0 0 100vmax color-mix(in srgb,var(--mm-glow-c) 9%,transparent)!important;
transition:outline-color var(--mm-glow-fade,.7s) ease,outline-offset var(--mm-glow-fade,.7s) ease,box-shadow var(--mm-glow-fade,.7s) ease!important;animation:mm-glow-in .5s cubic-bezier(.2,.8,.2,1)}
[data-mm-glow="fade"]{outline-color:transparent!important;box-shadow:0 0 0 6px transparent,0 0 34px 6px transparent,inset 0 0 0 100vmax transparent!important}
@keyframes mm-glow-in{from{outline-offset:12px;outline-color:transparent}}
@media (prefers-reduced-motion:reduce){[data-mm-glow]{transition:none!important;animation:none!important}}`
    ;(document.head || document.documentElement).appendChild(s)
  }

  const glowTimers = new WeakMap()
  function glowEl(el, { color, ms = 2200 } = {}) {
    ensureStyle()
    const prev = glowTimers.get(el)
    if (prev) prev.forEach(clearTimeout)
    const c = color && CSS.supports('color', color) ? color : ACCENT[MM.settings.accent] || ''
    if (c) el.style.setProperty('--mm-glow-c', c)
    else el.style.removeProperty('--mm-glow-c')
    // The fade takes the last 40% of the glow (max 0.7s).
    const fade = reduceMotion() ? 0 : Math.min(700, Math.round(ms * 0.4))
    if (fade !== 700) el.style.setProperty('--mm-glow-fade', `${fade}ms`)
    else el.style.removeProperty('--mm-glow-fade')
    el.removeAttribute('data-mm-glow')
    void el.offsetWidth // restart the intro animation when re-glowing
    el.setAttribute('data-mm-glow', 'on')
    const t1 = setTimeout(() => el.setAttribute('data-mm-glow', 'fade'), ms - fade)
    const t2 = setTimeout(() => {
      el.removeAttribute('data-mm-glow')
      el.style.removeProperty('--mm-glow-c')
      el.style.removeProperty('--mm-glow-fade')
      if (el.getAttribute('style') === '') el.removeAttribute('style')
      glowTimers.delete(el)
    }, ms)
    glowTimers.set(el, [t1, t2])
  }

  /**
   * Element for a paragraph id. If the page re-rendered since the panel's extraction, re-extract once
   * and find the paragraph with the same text.
   */
  function paraEl(pid, batch = null) {
    if (!PID_RE.test(String(pid))) return null
    const el = document.querySelector(`[data-mm-pid="${pid}"]`)
    if (el) return el
    const oldText = (batch?.texts || state.texts).get(pid)
    if (!oldText) return null
    if (batch && !batch.page) batch.page = run()
    const page = batch ? batch.page : run()
    const match = page.paragraphs.find(p => p.text === oldText)
    return match ? state.els.get(match.id) || null : null
  }

  // ───────── public API ─────────
  MM.extract = extract
  MM.paraEl = paraEl
  /** Current paragraph elements in document order: [{pid, el, tag}] (extracts if needed). */
  MM.paraEls = () => {
    const page = extract()
    return page.paragraphs.map(p => ({ pid: p.id, el: state.els.get(p.id), tag: p.tag })).filter(x => x.el)
  }
  MM.glowParas = (pids, opts = {}) => {
    let found = 0
    const batch = { texts: state.texts, page: null }
    for (const pid of [].concat(pids || []).slice(0, 200)) {
      const el = paraEl(pid, batch)
      if (el) { glowEl(el, opts); found++ }
    }
    return found
  }

  MM.on('MM_EXTRACT', async msg => {
    if (MM.pageKey() !== state.key) navigated()
    if (Date.now() - state.urlChangedAt < 2000) await settled()
    // The panel asks only on navigation or an explicit refresh, so always read fresh (ids stay stable).
    return msg?.force === false ? extract() : run()
  })

  MM.on('MM_SCROLL_TO', ({ pid }) => {
    const el = paraEl(pid)
    if (!el) return { ok: true, found: false }
    el.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'center', inline: 'nearest' })
    glowEl(el, { ms: 2200 })
    return { ok: true, found: true }
  })

  MM.on('MM_GLOW', ({ pids, color, ms }) => {
    const dur = Math.min(60000, Math.max(300, Number(ms) || 2200))
    const found = MM.glowParas(pids, { color, ms: dur })
    return { ok: true, found }
  })
})()
