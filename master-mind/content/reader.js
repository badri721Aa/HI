// Master Mind: Focus Reading Mode, Bionic Reading and Text-to-Speech (B4 reader).
// Classic content script (see ARCHITECTURE.md). Handles MM_READER, MM_BIONIC, MM_TTS, MM_TTS_STATE, MM_READER_STATE.
// Broadcasts MM_TTS_EVENT {state, pid, rate, index, total, error} and MM_READER_EVENT {open, bionic, translate}
// to extension pages whenever those change, so the side panel can mirror the live state.
// Helpers for other content modules: MM.reader, MM.bionic, MM.tts.
(() => {
  const MM = globalThis.MM
  if (!MM || MM.__skip) return

  // ───────── constants ─────────
  const READER_DEFAULTS = { font: 'serif', size: 19, lineHeight: 1.7, width: 720, theme: 'midnight' }
  const RANGES = {
    size: { min: 14, max: 28, step: 1, label: 'Size', fmt: v => `${v}px` },
    lineHeight: { min: 1.3, max: 2.2, step: 0.1, label: 'Line height', fmt: v => v.toFixed(1) },
    width: { min: 520, max: 960, step: 20, label: 'Width', fmt: v => `${v}px` },
  }
  const FONTS = [
    { id: 'serif', name: 'Serif', stack: '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Charter, "Bitstream Charter", Georgia, Cambria, "Times New Roman", serif' },
    { id: 'sans', name: 'Sans', stack: '"Inter MM", Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
    { id: 'mono', name: 'Mono', stack: '"JetBrains Mono MM", "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
    // High legibility from fonts the OS already ships: open apertures, distinct I/l/1, generous spacing.
    { id: 'legible', name: 'Legible', stack: '"Atkinson Hyperlegible", Verdana, Tahoma, "DejaVu Sans", "Segoe UI", system-ui, sans-serif' },
  ]
  const THEMES = [
    { id: 'midnight', name: 'Midnight', short: 'Midnight', bg: '#0B0C10', fg: '#D7DBE5' },
    { id: 'slate', name: 'Slate', short: 'Slate', bg: '#1B202A', fg: '#D2D8E3' },
    { id: 'sepia', name: 'Sepia', short: 'Sepia', bg: '#F4ECD8', fg: '#5B4636', light: true },
    { id: 'paper', name: 'Paper', short: 'Paper', bg: '#FBFBF8', fg: '#2B2E36', light: true },
    { id: 'contrast', name: 'High contrast', short: 'Contrast', bg: '#000000', fg: '#FFFFFF' },
  ]
  const LANGS = [
    ['English', 'en'], ['Spanish', 'es'], ['French', 'fr'], ['German', 'de'], ['Italian', 'it'], ['Portuguese', 'pt'],
    ['Dutch', 'nl'], ['Swedish', 'sv'], ['Norwegian', 'no'], ['Danish', 'da'], ['Finnish', 'fi'], ['Polish', 'pl'],
    ['Czech', 'cs'], ['Romanian', 'ro'], ['Hungarian', 'hu'], ['Greek', 'el'], ['Turkish', 'tr'], ['Russian', 'ru'],
    ['Ukrainian', 'uk'], ['Arabic', 'ar'], ['Hebrew', 'he'], ['Persian', 'fa'], ['Urdu', 'ur'], ['Hindi', 'hi'],
    ['Bengali', 'bn'], ['Tamil', 'ta'], ['Chinese (Simplified)', 'zh-Hans'], ['Chinese (Traditional)', 'zh-Hant'],
    ['Japanese', 'ja'], ['Korean', 'ko'], ['Vietnamese', 'vi'], ['Thai', 'th'], ['Indonesian', 'id'], ['Malay', 'ms'],
    ['Filipino', 'fil'], ['Swahili', 'sw'],
  ]
  const RTL = new Set(['ar', 'he', 'fa', 'ur'])
  const RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3]
  const ACCENT_HEX = { cyan: '#22D3EE', violet: '#A78BFA', lime: '#A3E635', pink: '#F472B6', amber: '#FBBF24' }
  const WPM = 230
  const MAX_PARAS = 1500
  const MAX_CHARS = 6000

  // ───────── small utilities ─────────
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
  const sleep = ms => new Promise(r => setTimeout(r, ms))
  const reduceMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false } }
  const scrollBehavior = () => (reduceMotion() ? 'auto' : 'smooth')
  const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu
  function countWords(text) {
    const cjk = (text.match(CJK) || []).length
    return ((cjk ? text.replace(CJK, ' ') : text).match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length + Math.round(cjk / 2)
  }
  const langCode = name => LANGS.find(l => l[0].toLowerCase() === String(name || '').toLowerCase())?.[1] || ''
  /** Language names come from our own UI; still keep them short and printable since they go into a prompt. */
  function normLang(v) {
    const s = String(v ?? '').replace(/[\u0000-\u001f<>{}[\]]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40)
    return /^(off|none|no|false)$/i.test(s) ? '' : s
  }
  const fmtRate = r => `${Number(r).toFixed(2).replace(/\.?0+$/, '')}×`
  const yieldIdle = () => new Promise(r => {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(() => r(), { timeout: 50 })
    else setTimeout(r, 0)
  })
  const hexA = (hex, a) => {
    const n = parseInt(hex.slice(1), 16)
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
  }

  /** Tiny element builder. Strings become text nodes (never parsed as HTML). */
  function h(tag, props = {}, ...kids) {
    const el = document.createElement(tag)
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue
      if (k === 'class') el.className = v
      else if (k === 'style') el.style.cssText = v
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v)
      else el.setAttribute(k, v === true ? '' : String(v))
    }
    for (const c of kids.flat()) if (c != null && c !== false) el.append(c)
    return el
  }
  const SVGNS = 'http://www.w3.org/2000/svg'
  const ICONS = {
    book: ['M4 19.5V5.5A2.5 2.5 0 0 1 6.5 3H20v14H6.5A2.5 2.5 0 0 0 4 19.5z', 'M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5'],
    play: ['M7.5 5.2v13.6a.9.9 0 0 0 1.37.77l10.9-6.8a.9.9 0 0 0 0-1.54l-10.9-6.8A.9.9 0 0 0 7.5 5.2z'],
    pause: ['M8.5 5.5v13', 'M15.5 5.5v13'],
    stop: ['M7 7h10v10H7z'],
    close: ['M6 6l12 12', 'M18 6L6 18'],
    globe: ['M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z', 'M3.6 9h16.8', 'M3.6 15h16.8', 'M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9c-2.5-2.6-3.7-5.6-3.7-9s1.2-6.4 3.7-9z'],
    check: ['M5 12.5l4.5 4.5L19 7.5'],
    alert: ['M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z', 'M12 7.5v5.5', 'M12 16.3v.2'],
    retry: ['M20 12a8 8 0 1 1-2.35-5.65', 'M20 4.5V9h-4.5'],
    back: ['M15 18l-6-6 6-6'],
  }
  function icon(name, fill = false) {
    const s = document.createElementNS(SVGNS, 'svg')
    s.setAttribute('viewBox', '0 0 24 24')
    s.setAttribute('aria-hidden', 'true')
    s.setAttribute('class', fill ? 'mm-icon fill' : 'mm-icon')
    for (const d of ICONS[name]) {
      const p = document.createElementNS(SVGNS, 'path')
      p.setAttribute('d', d)
      s.appendChild(p)
    }
    return s
  }

  // ───────── content source ─────────
  // The extractor (content/extract.js) owns paragraph ids and tags source elements with data-mm-pid.
  // If it is missing or fails, a small built-in pass still gives the reader something sensible.
  function fallbackPage() {
    const root = document.querySelector('article, [itemprop="articleBody"], main, [role="main"]') || document.body || document.documentElement
    const SEL = 'h1,h2,h3,h4,h5,h6,p,li,dt,dd,blockquote,pre,figcaption'
    const LEAF = 'h1,h2,h3,h4,h5,h6,p,li,blockquote,pre'
    const BAD = 'nav,aside,footer,form,dialog,menu,[role="navigation"],[role="complementary"],[role="contentinfo"],[aria-hidden="true"],[hidden],mm-host,[data-mm-host],script,style,noscript,template'
    const paragraphs = []
    const els = new Map()
    let words = 0
    for (const el of root.querySelectorAll(SEL)) {
      if (paragraphs.length >= MAX_PARAS) break
      const t = el.localName
      if (el.closest(BAD) || (t !== 'pre' && el.querySelector(LEAF))) continue
      if (el.checkVisibility && !el.checkVisibility({ checkVisibilityCSS: true })) continue
      const isPre = t === 'pre'
      const text = (isPre ? el.textContent.replace(/\s+$/, '') : el.textContent.replace(/\s+/g, ' ').trim()).slice(0, MAX_CHARS)
      const heading = /^h[1-6]$/.test(t)
      if (text.length < (heading ? 2 : t === 'li' || t === 'dt' || t === 'dd' ? 3 : isPre ? 8 : 20)) continue
      const tag = heading ? (t === 'h5' || t === 'h6' ? 'h4' : t)
        : isPre ? 'pre'
          : t === 'figcaption' ? 'figcaption'
            : t === 'li' || t === 'dt' || t === 'dd' ? 'li'
              : el.closest('blockquote') ? 'blockquote'
                : el.closest('li') ? 'li' : 'p'
      const id = `p${paragraphs.length}`
      paragraphs.push({ id, text, tag })
      els.set(id, el)
      words += countWords(text)
    }
    const h1 = paragraphs.find(p => p.tag === 'h1')?.text
    const author = (document.querySelector('meta[name="author"]')?.getAttribute('content') || '').trim()
    return {
      url: location.href, key: MM.pageKey(), title: (h1 || document.title || location.hostname).slice(0, 300),
      site: location.hostname.replace(/^www\./, ''), lang: document.documentElement.lang || '',
      byline: /^https?:/i.test(author) ? '' : author.slice(0, 120), published: '',
      wordCount: words, readingMin: Math.max(1, Math.round(words / WPM)), paragraphs, extractedAt: Date.now(), els,
    }
  }

  /** Current page content: {page, items: [{pid, tag, text, el}]} (el = live source element or null). */
  async function readPage() {
    let page = null
    if (typeof MM.extract === 'function') {
      try { page = await MM.extract() } catch (e) { console.warn('[Master Mind] extraction failed; using basic reader extraction.', e) }
    }
    if (!page || !Array.isArray(page.paragraphs)) page = fallbackPage()
    let byPid = page.els
    if (!byPid) {
      byPid = new Map()
      for (const el of document.querySelectorAll('[data-mm-pid]')) if (!byPid.has(el.dataset.mmPid)) byPid.set(el.dataset.mmPid, el)
    }
    const items = page.paragraphs.slice(0, MAX_PARAS).map(p => ({ pid: String(p.id), tag: String(p.tag || 'p'), text: String(p.text || ''), el: byPid.get(p.id) || null }))
    return { page, items }
  }

  // ───────── settings ─────────
  function readerPrefs(s) {
    const r = { ...READER_DEFAULTS, ...(s?.reader || {}) }
    const step = (v, k) => {
      const { min, max, step: st } = RANGES[k]
      const n = Number(v)
      return Number.isFinite(n) ? clamp(Math.round(n / st) * st, min, max) : READER_DEFAULTS[k]
    }
    return {
      font: FONTS.some(f => f.id === r.font) ? r.font : READER_DEFAULTS.font,
      size: step(r.size, 'size'),
      lineHeight: Math.round(step(r.lineHeight, 'lineHeight') * 10) / 10,
      width: step(r.width, 'width'),
      theme: THEMES.some(t => t.id === r.theme) ? r.theme : READER_DEFAULTS.theme,
    }
  }
  const bioStrength = (s = MM.settings) => { const n = Number(s?.bionicStrength); return Number.isFinite(n) && n > 0 ? clamp(n, 0.1, 0.9) : 0.45 }

  // Debounced, merged write to chrome.storage.sync settings (chrome.storage.sync has write quotas).
  const save = { patch: null, timer: 0, busy: 0 }
  function persist(patch) {
    save.patch = save.patch || {}
    for (const [k, v] of Object.entries(patch)) save.patch[k] = k === 'reader' ? { ...(save.patch.reader || {}), ...v } : v
    clearTimeout(save.timer)
    save.timer = setTimeout(flushSettings, 350)
  }
  async function flushSettings() {
    save.timer = 0
    const patch = save.patch
    save.patch = null
    if (!patch || !MM.alive()) return
    save.busy++
    try {
      const { settings } = await chrome.storage.sync.get('settings')
      const cur = settings || {}
      const next = { ...cur, ...patch }
      if (patch.reader) next.reader = { ...READER_DEFAULTS, ...(cur.reader || {}), ...patch.reader }
      await chrome.storage.sync.set({ settings: next })
    } catch (e) {
      if (MM.alive()) console.warn('[Master Mind] could not save reader settings', e)
    } finally { save.busy-- }
  }
  const savePending = () => !!(save.timer || save.patch || save.busy)

  // ───────── reader state ─────────
  const R = {
    open: false, gen: 0, ui: null, page: null, items: [], prefs: readerPrefs(MM.settings),
    blocks: new Map(), // pid → reader element holding the original text
    liNum: new Map(), // pid → ordinal of a list item within its list (side-by-side rows)
    trCells: new Map(), // pid → translation cell
    translate: '', trCtrl: null, trCache: new Map(), // lang → Map(original text → translation)
    lock: null, prevFocus: null, popOpen: false, barH: 72, progRaf: 0, refreshTimer: 0, speakingEl: null,
  }

  // ───────── Bionic Reading ─────────
  const BIO = { on: false, gen: 0, rgen: 0, page: [], reader: [], strength: 0.45 }
  const ORIGINAL = new WeakMap() // our <mm-bionic> wrapper → the exact Text node it replaced
  const LETTER = /\p{L}/u
  const WORD_RE = /[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*/gu
  const NO_BIO = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}\p{Script=Tibetan}]/u
  const BIO_SKIP = 'pre,code,kbd,samp,var,tt,script,style,noscript,template,textarea,input,select,option,button,svg,math,h1,h2,h3,h4,h5,h6,mm-host,[data-mm-host],[contenteditable]:not([contenteditable="false"]),mm-bionic,.sk,.tr-status,.pairs-head,.doc-head,.doc-end'
  const NO_BIO_TAGS = new Set(['pre', 'h1', 'h2', 'h3', 'h4'])

  /** Fragment with the first ceil(len × strength) letters of each word in <mm-b>, or null if nothing to bold. */
  function bionicFragment(text, strength) {
    WORD_RE.lastIndex = 0
    const frag = document.createDocumentFragment()
    let m, last = 0, buf = '', any = false
    while ((m = WORD_RE.exec(text))) {
      const w = m[0]
      if (NO_BIO.test(w)) continue
      const chars = /[\ud800-\udfff]/.test(w) ? Array.from(w) : null
      const len = chars ? chars.length : w.length
      const k = Math.min(len, Math.ceil(len * strength))
      buf += text.slice(last, m.index)
      if (buf) frag.append(buf)
      const b = document.createElement('mm-b')
      b.textContent = chars ? chars.slice(0, k).join('') : w.slice(0, k)
      frag.append(b)
      buf = chars ? chars.slice(k).join('') : w.slice(k)
      last = m.index + w.length
      any = true
    }
    if (!any) return null
    buf += text.slice(last)
    if (buf) frag.append(buf)
    return frag
  }

  function collectText(roots, out, scoped) {
    for (const el of roots) {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
        acceptNode(n) {
          const p = n.parentElement
          if (!p || !LETTER.test(n.data) || p.closest(BIO_SKIP)) return NodeFilter.FILTER_REJECT
          // A nested element with its own paragraph id is handled (or skipped) as its own item.
          if (scoped && p !== el && p.closest('[data-mm-pid]') !== el) return NodeFilter.FILTER_REJECT
          return NodeFilter.FILTER_ACCEPT
        },
      })
      for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n)
    }
  }

  function wrapText(node, strength) {
    const parent = node.parentNode
    if (!parent || !node.isConnected) return null
    const frag = bionicFragment(node.data, strength)
    if (!frag) return null
    const w = document.createElement('mm-bionic')
    w.appendChild(frag)
    parent.replaceChild(w, node)
    ORIGINAL.set(w, node)
    return w
  }

  function unwrapText(w) {
    if (!w.parentNode) return
    const orig = ORIGINAL.get(w)
    let pristine = !!orig
    for (let c = w.firstChild; c && pristine; c = c.nextSibling) {
      if (!(c.nodeType === 3 || (c.localName === 'mm-b' && c.childElementCount === 0))) pristine = false
    }
    // Put the exact original Text node back, so the page DOM is identical to before.
    if (pristine) w.parentNode.replaceChild(orig, w)
    else {
      // Something else (e.g. a highlight) was added inside: keep it, drop only our tags.
      for (const b of [...w.querySelectorAll('mm-b')]) b.replaceWith(...b.childNodes)
      w.replaceWith(...w.childNodes)
    }
  }

  /** Run fn over list in ~10ms slices, yielding between slices. Returns false if it went stale. */
  async function chunkRun(list, fn, stale) {
    let i = 0
    while (i < list.length) {
      if (stale()) return i
      const t0 = performance.now()
      do fn(list[i++]); while (i < list.length && performance.now() - t0 < 10)
      if (i < list.length) await yieldIdle()
    }
    return -1
  }

  async function bionicPage(on) {
    const gen = ++BIO.gen
    const stale = () => gen !== BIO.gen
    if (!on) {
      const list = BIO.page
      BIO.page = []
      const stoppedAt = await chunkRun(list, unwrapText, stale)
      if (stoppedAt >= 0) BIO.page.push(...list.slice(stoppedAt))
      return
    }
    ensurePageStyle()
    const { items } = await readPage()
    if (stale()) return
    const roots = items.filter(it => it.el?.isConnected && !NO_BIO_TAGS.has(it.tag) && !MM.isOwn(it.el)).map(it => it.el)
    const nodes = []
    collectText(roots, nodes, true)
    const strength = (BIO.strength = bioStrength())
    await chunkRun(nodes, n => { const w = wrapText(n, strength); if (w) BIO.page.push(w) }, stale)
  }

  async function bionicReader(on, scope) {
    const gen = scope ? BIO.rgen : ++BIO.rgen
    const stale = () => gen !== BIO.rgen || !R.ui
    if (!on) {
      const list = BIO.reader
      BIO.reader = []
      const stoppedAt = await chunkRun(list, unwrapText, stale)
      if (stoppedAt >= 0) BIO.reader.push(...list.slice(stoppedAt))
      return
    }
    const root = scope || R.ui?.doc.querySelector('.body')
    if (!root) return
    const nodes = []
    collectText([root], nodes, false)
    const strength = bioStrength()
    await chunkRun(nodes, n => { const w = wrapText(n, strength); if (w) BIO.reader.push(w) }, stale)
  }

  async function setBionic(on) {
    on = !!on
    if (on === BIO.on) return
    BIO.on = on
    syncBioUi()
    broadcastReader()
    await Promise.all([bionicPage(on), R.open && R.ui ? bionicReader(on) : null])
  }

  // ───────── page-level style (only our own tags and highlight names) ─────────
  function ensurePageStyle() {
    let s = document.getElementById('mm-page-style-reader')
    if (!s) {
      s = document.createElement('style')
      s.id = 'mm-page-style-reader'
      ;(document.head || document.documentElement).appendChild(s)
    }
    const a = ACCENT_HEX[MM.settings.accent] || ACCENT_HEX.cyan
    const css = `mm-bionic{display:inline}mm-bionic>mm-b{display:inline;font-weight:700}
::highlight(mm-tts-word){background-color:${hexA(a, 0.42)};text-decoration:underline solid ${a} 2px}
::highlight(mm-tts-para){background-color:${hexA(a, 0.09)}}
[data-mm-tts]{outline:2px solid ${a}!important;outline-offset:4px!important;border-radius:4px;box-shadow:0 0 0 6px ${hexA(a, 0.14)},0 0 26px ${hexA(a, 0.38)}!important}`
    if (s.textContent !== css) s.textContent = css
  }

  // ───────── Text-to-speech ─────────
  const synth = () => globalThis.speechSynthesis
  // CSS Custom Highlight API (no DOM mutation). Looked up lazily; null means "glow the paragraph instead".
  let hlObjs = null
  function hl() {
    if (typeof globalThis.Highlight !== 'function' || !globalThis.CSS?.highlights) return null
    if (!hlObjs) {
      hlObjs = { word: new Highlight(), para: new Highlight() }
      hlObjs.word.priority = 2
      hlObjs.para.priority = 1
    }
    if (CSS.highlights.get('mm-tts-word') !== hlObjs.word) CSS.highlights.set('mm-tts-word', hlObjs.word)
    if (CSS.highlights.get('mm-tts-para') !== hlObjs.para) CSS.highlights.set('mm-tts-para', hlObjs.para)
    return hlObjs
  }
  const T = {
    state: 'stopped', rate: 1, queue: [], idx: -1, pos: 0, resumeAt: 0, tok: 0, started: false,
    utter: null, voice: null, watch: 0, keepAlive: 0, error: '', waiters: [], userScrollAt: 0, glowEl: null, lastSig: '',
  }
  const TTS_ERRORS = {
    'not-allowed': 'Chrome blocked speech until you interact with this page. Click anywhere on the page, then press Play again.',
    'audio-busy': 'Another app is using the audio output. Try again in a moment.',
    'audio-hardware': 'No audio output device is available.',
    network: 'The selected voice needs a network connection. Pick a local voice or check your connection.',
    'synthesis-unavailable': 'No text-to-speech voice is installed on this system.',
    'synthesis-failed': 'The speech engine couldn’t read this paragraph. Try another voice.',
    'language-unavailable': 'No voice is available for this language. Pick a voice in the Reading tools.',
    'voice-unavailable': 'The selected voice is unavailable. Pick another voice.',
    'invalid-argument': 'The speech engine rejected these settings. Try another voice or speed.',
    'no-audio': 'The speech engine didn’t start. Make sure a text-to-speech voice is installed.',
    empty: 'There’s nothing to read aloud on this page.',
    unsupported: 'Speech isn’t available in this browser.',
  }

  const TTS_SKIP = 'script,style,noscript,template,svg,math,button,select,textarea,input,img,video,audio,canvas,iframe,object,mm-host,[data-mm-host],[aria-hidden="true"],[hidden]'
  const SEP_TAGS = new Set('address article aside blockquote br dd div dl dt figcaption figure footer h1 h2 h3 h4 h5 h6 header hr li main nav ol p pre section table tbody td tfoot th thead tr ul'.split(' '))
  const isWs = c => c === 32 || c === 10 || c === 9 || c === 13 || c === 12 || c === 160 || c === 0x1680 || (c >= 0x2000 && c <= 0x200a) || c === 0x2028 || c === 0x2029 || c === 0x202f || c === 0x205f || c === 0x3000
  const isZw = c => c === 0x200b || c === 0xfeff || c === 0xad

  /**
   * Whitespace-collapsed text of an element plus, for every character, the Text node and offset it came from.
   * We speak exactly this text, so speech boundary offsets map straight back onto the DOM for highlighting.
   */
  function buildMap(el) {
    const nodes = []
    const ni = []
    const off = []
    let text = ''
    let ws = true
    const sep = () => {
      if (ws || !ni.length) return
      text += ' '
      ni.push(ni[ni.length - 1])
      off.push(off[off.length - 1] + 1)
      ws = true
    }
    const walk = parent => {
      for (let c = parent.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) {
          const d = c.data
          const n = nodes.push(c) - 1
          for (let k = 0; k < d.length; k++) {
            const code = d.charCodeAt(k)
            if (isZw(code)) continue
            if (isWs(code)) {
              if (!ws) { text += ' '; ni.push(n); off.push(k); ws = true }
              continue
            }
            text += d[k]
            ni.push(n)
            off.push(k)
            ws = false
          }
        } else if (c.nodeType === 1) {
          const tag = c.localName
          if (tag !== 'mm-b' && tag !== 'mm-bionic') {
            if (c.matches(TTS_SKIP) || (c !== el && c.hasAttribute('data-mm-pid'))) continue
            if (c.checkVisibility && !c.checkVisibility({ checkVisibilityCSS: true })) continue
          }
          const block = SEP_TAGS.has(tag)
          if (block) sep()
          walk(c)
          if (block) sep()
        }
      }
    }
    walk(el)
    while (text.endsWith(' ')) { text = text.slice(0, -1); ni.pop(); off.pop() }
    return { text, nodes, ni, off }
  }

  function rangeFor(map, start, end) {
    const n = map.ni.length
    if (start < 0 || start >= n) return null
    end = clamp(end, start + 1, n)
    const sn = map.nodes[map.ni[start]]
    const en = map.nodes[map.ni[end - 1]]
    if (!sn?.isConnected || !en?.isConnected) return null
    try {
      const r = document.createRange()
      r.setStart(sn, Math.min(map.off[start], sn.length))
      r.setEnd(en, Math.min(map.off[end - 1] + 1, en.length))
      return r
    } catch { return null }
  }

  const wordLen = (text, at) => { const m = /^\S+/.exec(text.slice(at, at + 80)); return m ? m[0].length : 1 }

  async function voicesReady() {
    const s = synth()
    if (!s || s.getVoices().length) return
    await Promise.race([new Promise(r => s.addEventListener('voiceschanged', r, { once: true })), sleep(900)])
  }

  function pickVoice() {
    let voices = []
    try { voices = synth().getVoices() } catch { /* unsupported */ }
    if (!voices.length) return null
    const want = MM.settings.ttsVoice
    if (want) {
      const v = voices.find(x => x.voiceURI === want) || voices.find(x => x.name === want)
      if (v) return v
    }
    const base = (ttsLang() || navigator.language || 'en').toLowerCase().split(/[-_]/)[0]
    const match = v => (v.lang || '').toLowerCase().split(/[-_]/)[0] === base
    return voices.find(v => match(v) && v.default) || voices.find(v => match(v) && v.localService) || voices.find(match) || voices.find(v => v.default) || null
  }
  const ttsLang = () => (R.open && R.page?.lang) || document.documentElement.lang || ''

  async function ttsQueue() {
    if (R.open && R.page && R.blocks.size) {
      return R.items.filter(it => it.tag !== 'pre' && it.text.trim()).map(it => ({ pid: it.pid, el: R.blocks.get(it.pid) || null, text: it.text, src: 'reader', map: null }))
    }
    const { items } = await readPage()
    return items.filter(it => it.tag !== 'pre' && it.text.trim()).map(it => ({ pid: it.pid, el: it.el?.isConnected ? it.el : null, text: it.text, src: 'page', map: null }))
  }

  /** Index of the first paragraph at or below the top of the viewport (0 when the reader is at the top). */
  function startIndex(queue) {
    const reader = queue[0]?.src === 'reader'
    const sc = reader ? R.ui.scroller : document.scrollingElement
    if (!sc || sc.scrollTop < 40) return 0
    const top = reader ? sc.getBoundingClientRect().top + R.barH : 0
    for (let i = 0; i < queue.length; i++) {
      const el = queue[i].el
      if (!el) continue
      const r = el.getBoundingClientRect()
      if (r.height && r.bottom > top + 8) return i
    }
    return 0
  }

  function setState(state, error = '') {
    const changed = state !== T.state || error !== T.error
    T.state = state
    T.error = error
    if (state === 'stopped') { clearMarks(); keepAlive(false); watchUserScroll(false) }
    if (changed) broadcastTts()
    syncTtsUi()
  }

  function broadcastTts(force = false) {
    const info = ttsInfo()
    const sig = JSON.stringify(info)
    if (!force && sig === T.lastSig) return
    T.lastSig = sig
    MM.send('MM_TTS_EVENT', info)
  }
  const ttsInfo = () => ({
    state: T.state, rate: T.rate, pid: T.state === 'stopped' ? null : T.queue[T.idx]?.pid || null,
    index: T.state === 'stopped' ? -1 : T.idx, total: T.queue.length, error: T.error || null,
  })

  function resolveWaiters() { const w = T.waiters; T.waiters = []; for (const f of w) f() }
  const waitForStart = ms => Promise.race([new Promise(r => T.waiters.push(r)), sleep(ms)])

  function speakAt(i, from = 0) {
    clearTimeout(T.watch)
    const tok = ++T.tok
    const q = T.queue[i]
    if (!q) return ttsFinish()
    T.idx = i
    if (q.el && (!q.map || !q.map.nodes[0]?.isConnected)) q.map = buildMap(q.el)
    const full = q.map?.text || q.text
    if (!full.trim() || from >= full.length) return speakAt(i + 1, 0)
    T.pos = from
    T.resumeAt = from
    T.started = false
    markPara(q)
    showWord(q, from, from + wordLen(full, from))
    broadcastTts()
    const s = synth()
    const go = () => {
      if (tok !== T.tok || T.state !== 'playing') return
      const u = new SpeechSynthesisUtterance(full.slice(from))
      u.rate = T.rate
      const v = (T.voice = pickVoice())
      if (v) { u.voice = v; u.lang = v.lang } else if (ttsLang()) u.lang = ttsLang()
      u.addEventListener('start', () => {
        if (tok !== T.tok) return
        T.started = true
        clearTimeout(T.watch)
        resolveWaiters()
      })
      u.addEventListener('boundary', e => {
        if (tok !== T.tok || (e.name && e.name !== 'word')) return
        const at = from + e.charIndex
        T.pos = at
        showWord(q, at, at + (e.charLength > 0 ? e.charLength : wordLen(full, at)))
      })
      u.addEventListener('end', () => {
        if (tok !== T.tok || T.state !== 'playing') return
        speakAt(i + 1, 0)
      })
      u.addEventListener('error', e => {
        if (tok !== T.tok || e.error === 'interrupted' || e.error === 'canceled') return
        if (e.error === 'text-too-long') return speakAt(i + 1, 0)
        ttsFail(e.error || 'synthesis-failed')
      })
      T.utter = u // keep a reference: Chrome drops events of garbage-collected utterances
      s.speak(u)
      T.watch = setTimeout(() => {
        if (tok === T.tok && T.state === 'playing' && !T.started && !s.speaking) ttsFail('no-audio')
      }, 8000)
    }
    // Chrome sometimes ignores speak() issued in the same tick as cancel().
    if (s.speaking || s.pending) { s.cancel(); setTimeout(go, 60) } else go()
  }

  function ttsFinish() {
    T.tok++
    T.idx = -1
    setState('stopped')
    resolveWaiters()
  }

  function ttsFail(code) {
    // Chrome reports a missing speech engine as a generic synthesis failure; say what is actually wrong.
    let voices = 1
    try { voices = synth()?.getVoices().length ?? 0 } catch { voices = 0 }
    if (code === 'synthesis-failed' && !voices) code = 'synthesis-unavailable'
    T.tok++
    clearTimeout(T.watch)
    try { synth()?.cancel() } catch { /* ignore */ }
    const msg = TTS_ERRORS[code] || `Speech failed (${code}).`
    setState('stopped', msg)
    resolveWaiters()
    notify(msg)
  }

  async function ttsPlay() {
    if (T.state === 'playing') return
    if (T.state === 'paused') return ttsResume()
    const s = synth()
    if (!s || typeof SpeechSynthesisUtterance !== 'function') { setState('stopped', TTS_ERRORS.unsupported); return }
    const tok = ++T.tok
    T.error = ''
    const [queue] = await Promise.all([ttsQueue(), voicesReady()])
    if (tok !== T.tok) return
    if (!queue.length) { setState('stopped', TTS_ERRORS.empty); notify(TTS_ERRORS.empty); return }
    T.queue = queue
    T.state = 'playing'
    keepAlive(true)
    watchUserScroll(true)
    syncTtsUi()
    const wait = waitForStart(1500)
    speakAt(startIndex(queue), 0)
    await wait
  }

  function ttsPause() {
    if (T.state !== 'playing') return
    T.tok++
    clearTimeout(T.watch)
    T.resumeAt = T.pos
    keepAlive(false)
    // cancel() + resume-from-word is reliable for every voice, unlike speechSynthesis.pause().
    try { synth().cancel() } catch { /* ignore */ }
    setState('paused')
  }

  async function ttsResume() {
    if (T.state === 'stopped') return ttsPlay()
    if (T.state !== 'paused') return
    T.state = 'playing'
    T.error = ''
    keepAlive(true)
    watchUserScroll(true)
    syncTtsUi()
    const wait = waitForStart(1500)
    speakAt(T.idx, T.resumeAt)
    await wait
  }

  function ttsStop() {
    if (T.state === 'stopped' && !T.error) return
    const wasActive = T.state !== 'stopped'
    T.tok++
    clearTimeout(T.watch)
    if (wasActive) { try { synth().cancel() } catch { /* ignore */ } }
    T.idx = -1
    setState('stopped')
    resolveWaiters()
  }

  /** Re-speak the current paragraph from the current word (new rate or voice). */
  function restartCurrent() {
    if (T.state !== 'playing') return
    speakAt(T.idx, T.pos)
  }

  function setRate(r) {
    const n = Number(r)
    if (!Number.isFinite(n)) return
    const next = clamp(Math.round(n * 100) / 100, 0.5, 3)
    if (next === T.rate) return
    T.rate = next
    if (T.state === 'playing') restartCurrent()
    if (T.state !== 'stopped') broadcastTts()
    syncTtsUi()
  }

  // Chrome's network voices stop after ~15s of continuous speech; a pause/resume nudge keeps them going.
  function keepAlive(on) {
    clearInterval(T.keepAlive)
    T.keepAlive = 0
    if (!on) return
    T.keepAlive = setInterval(() => {
      const s = synth()
      if (T.state !== 'playing' || !s?.speaking || !T.voice || T.voice.localService) return
      s.pause()
      s.resume()
    }, 10000)
  }

  const markUserScroll = () => { T.userScrollAt = Date.now() }
  const SCROLL_KEYS = new Set(['PageUp', 'PageDown', 'ArrowUp', 'ArrowDown', 'Home', 'End', ' '])
  const onScrollKey = e => { if (SCROLL_KEYS.has(e.key)) markUserScroll() }
  let watchingScroll = false
  function watchUserScroll(on) {
    if (on === watchingScroll) return
    watchingScroll = on
    const fn = on ? addEventListener : removeEventListener
    fn('wheel', markUserScroll, { capture: true, passive: true })
    fn('touchmove', markUserScroll, { capture: true, passive: true })
    fn('keydown', onScrollKey, { capture: true, passive: true })
  }

  function clearMarks() {
    if (hlObjs) { hlObjs.word.clear(); hlObjs.para.clear() }
    if (R.speakingEl) { R.speakingEl.classList.remove('speaking'); R.speakingEl = null }
    if (T.glowEl) { T.glowEl.removeAttribute('data-mm-tts'); T.glowEl = null }
  }

  function markPara(q) {
    clearMarks()
    if (!q?.el) return
    if (q.src === 'reader') {
      q.el.classList.add('speaking')
      R.speakingEl = q.el
    } else {
      ensurePageStyle()
      const H = hl()
      if (H) {
        const r = document.createRange()
        r.selectNodeContents(q.el)
        H.para.add(r)
      } else {
        // No Custom Highlight API: glow the paragraph instead (our own attribute, removed afterwards).
        q.el.setAttribute('data-mm-tts', '')
        T.glowEl = q.el
      }
    }
    follow(q, q.el.getBoundingClientRect(), true)
  }

  function showWord(q, start, end) {
    if (!q.el || !q.map) return
    let r = rangeFor(q.map, start, end)
    if (!r && q.el.isConnected) { q.map = buildMap(q.el); r = rangeFor(q.map, start, end) } // DOM changed (e.g. bionic)
    if (!r) return
    const H = hl()
    if (H) {
      if (q.src === 'page') ensurePageStyle()
      H.word.clear()
      H.word.add(r)
    }
    follow(q, r.getBoundingClientRect(), false)
  }

  /** Scroll the spoken text back into view, but only once it has left the viewport. */
  function follow(q, rect, isPara) {
    if (!rect || (!rect.width && !rect.height)) return
    if (Date.now() - T.userScrollAt < 3000) return // the reader is looking elsewhere right now
    const reader = q.src === 'reader' && R.ui
    const view = reader ? R.ui.scroller.getBoundingClientRect() : { top: 0, bottom: innerHeight }
    const top = view.top + (reader ? R.barH + 44 : 8) // below the toolbar and its fade
    const bottom = view.bottom - 12
    const probeTop = rect.top
    const probeBottom = isPara ? Math.min(rect.bottom, rect.top + 3 * 28) : rect.bottom
    if (probeTop >= top && probeBottom <= bottom) return
    const delta = rect.top - (top + (bottom - top) * 0.28)
    if (reader) R.ui.scroller.scrollBy({ top: delta, behavior: scrollBehavior() })
    else scrollPageBy(q.el, delta)
  }

  function scrollPageBy(el, delta) {
    for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      if (p.scrollHeight > p.clientHeight + 4) {
        const oy = getComputedStyle(p).overflowY
        if (oy === 'auto' || oy === 'scroll' || oy === 'overlay') { p.scrollBy({ top: delta, behavior: scrollBehavior() }); return }
      }
    }
    window.scrollBy({ top: delta, behavior: scrollBehavior() })
  }

  /** Reader opened or closed while reading aloud: continue at the same paragraph and word in the new view. */
  async function ttsRetarget() {
    if (T.state === 'stopped') return
    const cur = T.queue[T.idx]
    const wasPlaying = T.state === 'playing'
    const snippet = cur ? (cur.map?.text || cur.text).slice(T.pos, T.pos + 40) : ''
    const tok = ++T.tok
    clearTimeout(T.watch)
    clearMarks()
    if (wasPlaying) { try { synth().cancel() } catch { /* ignore */ } }
    const queue = await ttsQueue()
    if (tok !== T.tok) return
    const i = cur ? queue.findIndex(q => q.pid === cur.pid) : -1
    if (i < 0) return ttsStop()
    T.queue = queue
    T.idx = i
    const q = queue[i]
    if (q.el) q.map = buildMap(q.el)
    const text = q.map?.text || q.text
    const at = Math.max(0, snippet ? text.indexOf(snippet) : 0)
    if (wasPlaying) speakAt(i, at)
    else { T.pos = at; T.resumeAt = at; markPara(q); showWord(q, at, at + wordLen(text, at)) }
  }

  function notify(msg) {
    if (R.open && R.ui) rdToast(msg)
    else MM.toast(msg, 4200)
  }

  // ───────── reader UI ─────────
  const READER_CSS = `
.rd{position:fixed;inset:0;z-index:1;color:var(--rd-fg);color-scheme:dark;font:14px/1.5 var(--mm-font);-webkit-font-smoothing:antialiased;
  --rd-bar-h:58px;--rd-size:19px;--rd-lh:1.7;--rd-width:720px;
  --rd-bg:#0B0C10;--rd-fg:#D7DBE5;--rd-heading:#F7F8FC;--rd-muted:#8A91A5;--rd-quote:#B3BACB;--rd-accent:var(--mm-accent);
  --rd-bar:rgba(16,18,26,.8);--rd-line:rgba(255,255,255,.08);--rd-code:rgba(0,0,0,.42);
  --rd-glow:radial-gradient(1100px 520px at 12% -12%,color-mix(in srgb,var(--mm-accent) 9%,transparent),transparent 60%),radial-gradient(900px 480px at 108% -6%,color-mix(in srgb,var(--mm-accent-2) 8%,transparent),transparent 60%);
  background:var(--rd-glow),var(--rd-bg);animation:rd-in .26s var(--mm-ease) both}
.rd[data-theme="slate"]{--rd-bg:#1B202A;--rd-fg:#D2D8E3;--rd-heading:#F1F4F9;--rd-muted:#8E98AA;--rd-quote:#B5BECD;--rd-bar:rgba(38,45,59,.84);--rd-line:rgba(255,255,255,.09);--rd-code:rgba(0,0,0,.26);
  --rd-glow:radial-gradient(1000px 520px at 50% -22%,rgba(148,163,184,.12),transparent 65%)}
.rd[data-theme="sepia"]{--rd-bg:#F4ECD8;--rd-fg:#5B4636;--rd-heading:#3B2A1E;--rd-muted:#8A725F;--rd-quote:#6B5442;--rd-accent:#A0522D;--rd-bar:rgba(248,242,228,.84);--rd-line:rgba(91,70,54,.16);--rd-code:rgba(91,70,54,.07);--rd-glow:none;
  --mm-fg:#3B2A1E;--mm-fg-2:#5B4636;--mm-muted:#8A725F;--mm-heading:#3B2A1E;--mm-border:rgba(91,70,54,.15);--mm-border-strong:rgba(91,70,54,.28);--mm-accent:#A0522D;--mm-accent-2:#C9733B;--mm-bg-2:#F4ECD8;--mm-glass-strong:rgba(250,245,233,.97);--mm-red:#B4321F;--mm-shadow:0 14px 40px rgba(60,40,20,.18)}
.rd[data-theme="paper"]{--rd-bg:#FBFBF8;--rd-fg:#2B2E36;--rd-heading:#111318;--rd-muted:#6A7080;--rd-quote:#454B57;--rd-accent:#0E7490;--rd-bar:rgba(255,255,255,.82);--rd-line:rgba(15,20,30,.1);--rd-code:rgba(15,20,30,.045);--rd-glow:none;
  --mm-fg:#1D2027;--mm-fg-2:#3D424D;--mm-muted:#6A7080;--mm-heading:#111318;--mm-border:rgba(15,20,30,.1);--mm-border-strong:rgba(15,20,30,.2);--mm-accent:#0E7490;--mm-accent-2:#6D28D9;--mm-bg-2:#FFFFFF;--mm-glass-strong:rgba(255,255,255,.97);--mm-red:#B42318;--mm-shadow:0 14px 40px rgba(15,20,30,.14)}
.rd[data-theme="contrast"]{--rd-bg:#000;--rd-fg:#FFF;--rd-heading:#FFF;--rd-muted:#E2E2E2;--rd-quote:#FFF;--rd-accent:#FFE500;--rd-bar:rgba(0,0,0,.94);--rd-line:rgba(255,255,255,.55);--rd-code:#0E0E0E;--rd-glow:none;
  --mm-accent:#FFE500;--mm-accent-2:#FFE500;--mm-fg:#FFF;--mm-fg-2:#FFF;--mm-muted:#E2E2E2;--mm-heading:#FFF;--mm-border:rgba(255,255,255,.5);--mm-border-strong:rgba(255,255,255,.8);--mm-glass-strong:#000}
.rd[data-light]{color-scheme:light;-webkit-font-smoothing:auto}
.rd.closing{animation:rd-out .16s ease both;pointer-events:none}
@keyframes rd-in{from{opacity:0;transform:translateY(10px) scale(.994)}}
@keyframes rd-out{to{opacity:0}}
.rd[data-light] .mm-btn{background:rgba(255,255,255,.5)}
.rd[data-light] .mm-btn.ghost{background:transparent}
.rd[data-light] .mm-btn:hover,.rd[data-light] .mm-btn.ghost:hover{background:rgba(0,0,0,.055)}
.rd[data-light] .mm-btn.primary{color:#fff}
.rd[data-light] .mm-select{background-color:rgba(255,255,255,.7)}
.rd[data-light] .mm-chip{background:rgba(255,255,255,.55)}
.rd[data-light] .mm-chip[aria-pressed="true"]{color:#fff;background:var(--mm-accent)}
.rd[data-light] .mm-skeleton{background:linear-gradient(90deg,rgba(0,0,0,.05),rgba(0,0,0,.11),rgba(0,0,0,.05));background-size:200% 100%}
.rd[data-light] ::-webkit-scrollbar-thumb{background-color:rgba(0,0,0,.18)}
.rd[data-theme="contrast"] .mm-btn.ghost{color:#fff}
.rd[data-theme="contrast"] .mm-chip[aria-pressed="true"]{color:#000}
.mm-icon.fill{fill:currentColor;stroke:none}

.progress{position:absolute;z-index:6;top:0;left:0;right:0;height:3px;pointer-events:none}
.progress i{display:block;height:100%;background:var(--mm-gradient);transform-origin:0 50%;transform:scaleX(0);box-shadow:0 0 10px color-mix(in srgb,var(--mm-accent) 60%,transparent);transition:transform .12s linear}

.bar{position:absolute;z-index:4;top:12px;left:12px;right:12px;margin:0 auto;max-width:1160px;display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;padding:7px 8px 7px 10px;
  background:var(--rd-bar);border:1px solid var(--rd-line);border-radius:16px;backdrop-filter:blur(16px) saturate(140%);-webkit-backdrop-filter:blur(16px) saturate(140%);
  box-shadow:0 12px 34px rgba(0,0,0,.28),0 1px 0 rgba(255,255,255,.05) inset;font-family:var(--mm-font)}
.rd[data-light] .bar{box-shadow:0 10px 30px rgba(40,30,10,.1)}
.brand{display:flex;align-items:center;gap:10px;min-width:0;flex:1 1 150px}
.logo{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;background:var(--mm-gradient);color:#06080D;flex:none;box-shadow:0 0 16px color-mix(in srgb,var(--mm-accent) 35%,transparent)}
.logo .mm-icon{width:16px;height:16px}
.brand-text{display:flex;flex-direction:column;min-width:0;line-height:1.25}
.brand-name{font-weight:700;font-size:13px;color:var(--mm-heading);letter-spacing:.01em}
.brand-site{font-size:11.5px;color:var(--mm-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tools{display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:6px}
.grp{display:flex;align-items:center;gap:4px}
.sep{width:1px;height:22px;background:var(--rd-line);margin:0 3px}
.tb.aa{width:auto;min-width:38px;padding:0 9px;font:700 15px/1 Georgia,"Times New Roman",serif;letter-spacing:.01em}
.tb.aa[aria-expanded="true"]{background:color-mix(in srgb,var(--mm-accent) 16%,transparent);color:var(--mm-heading)}
.bio{height:32px;padding:0 12px;font-weight:500;gap:0}
.bio b{font-weight:800}
.tb.on{color:var(--mm-accent)}
.bar .mm-select{width:auto;height:32px;padding:0 6px 0 9px;font-size:12.5px;border-radius:9px;cursor:pointer}
.lang-wrap{display:inline-flex;align-items:center;gap:6px;color:var(--mm-fg-2)}
.lang-wrap .mm-select{max-width:170px}
.left{font:600 12px/1 var(--mm-font);color:var(--mm-muted);font-variant-numeric:tabular-nums;white-space:nowrap;padding:0 4px;min-width:84px;text-align:right}
@media (max-width:760px){.brand,.sep{display:none}.tools{flex:1;justify-content:space-between;gap:6px 4px}.left{min-width:0}.lang-wrap .mm-select{max-width:132px}}

.pop{position:fixed;z-index:8;width:344px;max-width:calc(100vw - 24px);padding:16px;border-radius:16px;background:var(--mm-glass-strong);border:1px solid var(--mm-border-strong);
  backdrop-filter:blur(16px) saturate(140%);-webkit-backdrop-filter:blur(16px) saturate(140%);box-shadow:var(--mm-shadow);display:flex;flex-direction:column;gap:15px;font-family:var(--mm-font);animation:pop-in .16s var(--mm-ease)}
@keyframes pop-in{from{opacity:0;transform:translateY(-4px)}}
.fld{display:flex;flex-direction:column;gap:8px}
.fld-head{display:flex;justify-content:space-between;align-items:baseline}
.fld-head label,.fld-title{font:700 11px/1 var(--mm-font);color:var(--mm-muted);letter-spacing:.08em;text-transform:uppercase}
.fld-head output{font:600 12px/1 var(--mm-mono);color:var(--mm-fg)}
.rng{display:flex;align-items:center;gap:10px}
.rng .lo,.rng .hi{color:var(--mm-muted);font-family:Georgia,serif;flex:none;width:14px;text-align:center}
.rng .lo{font-size:11px}.rng .hi{font-size:17px}
.seg{display:grid;grid-template-columns:repeat(4,1fr);gap:3px;padding:3px;border-radius:11px;background:rgba(0,0,0,.25);border:1px solid var(--mm-border)}
.rd[data-light] .seg{background:rgba(0,0,0,.04)}
.seg button{border:0;background:transparent;color:var(--mm-fg-2);font-size:13px;line-height:1;padding:8px 2px;border-radius:8px;cursor:pointer;transition:background .15s,color .15s}
.seg button:hover{color:var(--mm-fg);background:rgba(127,127,127,.12)}
.seg button[aria-pressed="true"]{background:var(--mm-accent);color:#06080D;font-weight:650;box-shadow:0 0 12px color-mix(in srgb,var(--mm-accent) 40%,transparent)}
.rd[data-light] .seg button[aria-pressed="true"]{color:#fff}
.themes{display:grid;grid-template-columns:repeat(5,1fr);gap:4px}
.swatch{display:flex;flex-direction:column;align-items:center;gap:7px;background:none;border:0;padding:4px 0 2px;cursor:pointer;color:var(--mm-fg-2);font:600 10.5px/1 var(--mm-font);border-radius:10px}
.swatch .sw{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;font:700 14px/1 Georgia,serif;border:1px solid rgba(128,128,128,.45);transition:box-shadow .15s,transform .15s}
.swatch:hover .sw{transform:translateY(-1px)}
.swatch[aria-pressed="true"]{color:var(--mm-heading)}
.swatch[aria-pressed="true"] .sw{box-shadow:0 0 0 2px var(--rd-bg),0 0 0 4px var(--mm-accent)}
.pop-foot{display:flex;justify-content:flex-end;margin-top:-4px}

.scroll{position:absolute;inset:0;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;outline:none;scroll-padding-top:calc(var(--rd-bar-h) + 40px);
  /* Text fades out before it reaches the floating toolbar, so the bar stays legible over any content. */
  -webkit-mask-image:linear-gradient(to bottom,transparent calc(var(--rd-bar-h) + 8px),#000 calc(var(--rd-bar-h) + 52px));mask-image:linear-gradient(to bottom,transparent calc(var(--rd-bar-h) + 8px),#000 calc(var(--rd-bar-h) + 52px))}
.scroll:focus-visible{outline:none}
.rd.kbd .scroll:focus-visible{box-shadow:inset 0 0 0 2px color-mix(in srgb,var(--rd-accent) 45%,transparent)}
.doc{box-sizing:content-box;max-width:var(--rd-width);margin:0 auto;padding:calc(var(--rd-bar-h) + 66px) 32px 34vh;font-family:var(--rd-font);font-size:var(--rd-size);line-height:var(--rd-lh);
  color:var(--rd-fg);overflow-wrap:break-word;text-rendering:optimizeLegibility;font-kerning:normal}
.doc.pairs{max-width:min(calc(var(--rd-width) * 2 + 48px),1160px)}
.rd[data-font="legible"] .doc{letter-spacing:.012em;word-spacing:.06em}
.doc-head{margin-bottom:2.1em;padding-bottom:1.3em;border-bottom:1px solid var(--rd-line)}
.kicker{display:inline-flex;align-items:center;gap:9px;font:700 11.5px/1 var(--mm-font);letter-spacing:.14em;text-transform:uppercase;color:var(--rd-accent);margin-bottom:18px}
.kicker::before{content:"";width:18px;height:2px;border-radius:2px;background:currentColor;box-shadow:0 0 8px currentColor}
.doc .title{font-family:var(--rd-font);font-size:clamp(26px,calc(var(--rd-size) * 1.9),54px);line-height:1.13;font-weight:750;letter-spacing:-.02em;color:var(--rd-heading);margin:0 0 .5em;text-wrap:balance}
.meta{display:flex;flex-wrap:wrap;align-items:center;gap:6px 0;font:500 13.5px/1.4 var(--mm-font);color:var(--rd-muted);letter-spacing:0;word-spacing:0}
.meta>span+span::before,.meta>time::before{content:"·";margin:0 10px;opacity:.7}
.meta .by{color:var(--rd-fg);font-weight:600}
.body>:first-child{margin-top:0}
.body p{margin:0 0 1.1em}
.body h2,.body h3,.body h4{font-family:var(--rd-font);color:var(--rd-heading);letter-spacing:-.012em;text-wrap:balance;font-weight:700}
.body h2{font-size:1.45em;line-height:1.22;margin:1.8em 0 .6em}
.body h3{font-size:1.22em;line-height:1.3;margin:1.6em 0 .5em}
.body h4{font-size:1.06em;line-height:1.35;margin:1.4em 0 .4em}
.body blockquote{margin:1.5em 0;padding:.15em 0 .15em 1.15em;border-left:3px solid var(--rd-accent);color:var(--rd-quote);font-style:italic}
.body blockquote p{margin:0 0 .6em}.body blockquote p:last-child{margin-bottom:0}
.body ul,.body ol{margin:0 0 1.2em;padding-left:1.45em}
.body li{margin:0 0 .5em;padding-left:.25em}
.body li::marker{color:var(--rd-accent)}
.body pre{margin:1.4em 0;padding:15px 18px;background:var(--rd-code);border:1px solid var(--rd-line);border-radius:12px;overflow-x:auto;font:400 max(12.5px,calc(var(--rd-size) * .74))/1.62 var(--mm-mono);
  color:var(--rd-fg);white-space:pre;tab-size:2;letter-spacing:0;word-spacing:0;font-style:normal}
.body pre code{font:inherit;background:none;padding:0}
.body .cap{font-size:.84em;color:var(--rd-muted);text-align:center;font-style:italic;margin:-.3em 0 1.4em}
.tbl{overflow-x:auto;margin:1.3em 0}
.body table{width:100%;border-collapse:collapse;font-size:.86em;line-height:1.5}
.body td{padding:.5em .7em;border-bottom:1px solid var(--rd-line);vertical-align:top}
.body tr:first-child td{border-top:1px solid var(--rd-line)}
.body [data-pid]{position:relative;scroll-margin-top:calc(var(--rd-bar-h) + 40px)}
.body .speaking::before{content:"";position:absolute;left:-20px;top:.3em;bottom:.3em;width:3px;border-radius:3px;background:var(--rd-accent);box-shadow:0 0 12px var(--rd-accent)}
.body li.speaking::before{left:calc(-1.7em - 12px)}
.body tr.speaking::before{display:none}
.body tr.speaking td{background:color-mix(in srgb,var(--rd-accent) 9%,transparent)}
mm-bionic{display:inline}
mm-b{display:inline;font-weight:700;color:var(--rd-heading)}
.rd ::highlight(mm-tts-word){background-color:rgba(34,211,238,.32);color:#FFFFFF}
.rd[data-theme="slate"] ::highlight(mm-tts-word){background-color:rgba(125,211,252,.3);color:#FFFFFF}
.rd[data-theme="sepia"] ::highlight(mm-tts-word){background-color:rgba(160,82,45,.24);color:#2A1B10}
.rd[data-theme="paper"] ::highlight(mm-tts-word){background-color:rgba(14,116,144,.2);color:#0B0D11}
.rd[data-theme="contrast"] ::highlight(mm-tts-word){background-color:#FFE500;color:#000000}

.tr-status{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 1.8em;padding:11px 14px;border-radius:12px;border:1px solid var(--rd-line);
  background:color-mix(in srgb,var(--rd-accent) 7%,transparent);font:600 13px/1.4 var(--mm-font);color:var(--rd-fg);letter-spacing:0;word-spacing:0}
.tr-status .grow{flex:1;min-width:170px}
.tr-status>.mm-icon{color:var(--rd-accent)}
.tr-status.err{border-color:color-mix(in srgb,var(--mm-red) 45%,transparent);background:color-mix(in srgb,var(--mm-red) 8%,transparent);color:var(--mm-red)}
.tr-status.err>.mm-icon{color:var(--mm-red)}
.tr-status .mm-btn{font-size:12px}
.pairs-head{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:0 48px;margin:0 0 1.4em;font:700 11px/1 var(--mm-font);letter-spacing:.14em;text-transform:uppercase;color:var(--rd-muted);word-spacing:0}
.pairs-head span{padding-bottom:10px;border-bottom:1px solid var(--rd-line)}
.pairs-head .h-tr{color:var(--rd-accent)}
.pair{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:0 48px}
.pair.full{grid-template-columns:minmax(0,1fr)}
.pair>.src,.pair>.tr{min-width:0}
.pair>.tr{position:relative}
.pair>.tr::before{content:"";position:absolute;left:-24px;top:0;bottom:0;width:1px;background:var(--rd-line)}
.pair .solo{margin-bottom:0}
.pair .tbl{margin:0}
.pair .tbl table{table-layout:fixed}
.pair .body tr:first-child td,.pair tr:first-child td{border-top:0}
.pair.t-td+.pair:not(.t-td)>*{padding-top:1.2em}
.pair:not(.t-td)+.pair.t-td .tbl{border-top:1px solid var(--rd-line)}
.pair .solo>li{margin-bottom:.9em}
.tr .sk{height:.72em;margin:.42em 0 .72em;border-radius:6px}
.tr .sk:last-child{margin-bottom:1.5em}
.pair.t-h1 .tr .sk,.pair.t-h2 .tr .sk,.pair.t-h3 .tr .sk{height:1.05em;margin-top:2em}
.tr .fail{color:var(--rd-muted);font-style:italic;font-size:.86em;margin:0 0 1.1em}
.tr[dir="rtl"]{text-align:right}
.tr[dir="rtl"] blockquote{border-left:0;border-right:3px solid var(--rd-accent);padding:.15em 1.15em .15em 0}
@media (max-width:860px){
  .doc.pairs{max-width:var(--rd-width)}
  .pair,.pairs-head{grid-template-columns:minmax(0,1fr)}
  .pairs-head .h-tr{display:none}
  .pair>.tr{margin:-.45em 0 1.3em;padding:.15em 0 .15em 14px;border-left:2px solid color-mix(in srgb,var(--rd-accent) 50%,transparent)}
  .pair>.tr[dir="rtl"]{border-left:0;border-right:2px solid color-mix(in srgb,var(--rd-accent) 50%,transparent);padding:.15em 14px .15em 0}
  .pair>.tr::before{display:none}
  .pair>.tr>:last-child,.pair>.tr .sk:last-child{margin-bottom:0}
}
@media (max-width:560px){.doc{padding-left:20px;padding-right:20px}.body .speaking::before{left:-12px}}
.loading{display:flex;flex-direction:column;gap:14px;padding-top:6px}
.loading .mm-skeleton{height:14px}
.rd-empty{margin-top:8vh;font-family:var(--mm-font);font-size:14px;line-height:1.5}
.doc-end{margin-top:3em;padding-top:1.5em;border-top:1px solid var(--rd-line);display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;
  font:500 13px/1.4 var(--mm-font);color:var(--rd-muted);letter-spacing:0;word-spacing:0}
.doc-end .end-mark{display:inline-flex;align-items:center;gap:9px}
.doc-end .end-mark::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--rd-accent);box-shadow:0 0 10px var(--rd-accent)}
.rd .mm-toast{position:absolute;bottom:22px}
`

  function ensureUI() {
    if (R.ui) {
      if (!R.ui.host.isConnected) (document.body || document.documentElement).appendChild(R.ui.host)
      return R.ui
    }
    const { host, root, layer } = MM.shadow('reader', READER_CSS)
    host.style.zIndex = '2147483647' // above page chrome that uses the max z-index
    const ui = { host, root, layer }

    const wrap = h('div', { class: 'rd', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Focus reader', hidden: true })
    const progressFill = h('i')
    const progress = h('div', { class: 'progress', role: 'progressbar', 'aria-label': 'Reading progress', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0' }, progressFill)

    // toolbar
    const site = h('span', { class: 'brand-site' })
    const brand = h('div', { class: 'brand' }, h('span', { class: 'logo', 'aria-hidden': 'true' }, icon('book')),
      h('span', { class: 'brand-text' }, h('span', { class: 'brand-name' }, 'Focus Reader'), site))
    const aa = h('button', { type: 'button', class: 'mm-btn ghost icon tb aa', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-controls': 'rd-pop', 'aria-label': 'Text and theme', title: 'Text and theme' }, 'Aa')
    const bio = h('button', { type: 'button', class: 'mm-chip bio', 'aria-pressed': 'false', title: 'Bionic reading: bold the start of each word' }, h('b', {}, 'Bi'), 'onic')
    const play = h('button', { type: 'button', class: 'mm-btn ghost icon tb play', 'aria-label': 'Read aloud', title: 'Read aloud' }, icon('play', true))
    const stop = h('button', { type: 'button', class: 'mm-btn ghost icon tb stop', 'aria-label': 'Stop reading aloud', title: 'Stop', disabled: true }, icon('stop', true))
    const rate = h('select', { class: 'mm-select rate', 'aria-label': 'Reading speed', title: 'Reading speed' })
    const lang = h('select', { class: 'mm-select lang', 'aria-label': 'Side-by-side translation language' })
    lang.append(new Option('Translate…', ''))
    for (const [name] of LANGS) lang.append(new Option(name, name))
    const left = h('span', { class: 'left', 'aria-live': 'off' })
    const close = h('button', { type: 'button', class: 'mm-btn ghost icon tb close', 'aria-label': 'Close reader (Esc)', title: 'Close (Esc)' }, icon('close'))
    const bar = h('div', { class: 'bar', role: 'toolbar', 'aria-label': 'Reader controls' }, brand,
      h('div', { class: 'tools' },
        h('div', { class: 'grp' }, aa, bio),
        h('span', { class: 'sep', 'aria-hidden': 'true' }),
        h('div', { class: 'grp', role: 'group', 'aria-label': 'Read aloud' }, play, stop, rate),
        h('span', { class: 'sep', 'aria-hidden': 'true' }),
        h('label', { class: 'lang-wrap', title: 'Side-by-side translation' }, icon('globe'), lang),
        h('span', { class: 'sep', 'aria-hidden': 'true' }),
        left, close))

    // typography popover
    const fontBtns = FONTS.map(f => h('button', { type: 'button', 'data-font': f.id, 'aria-pressed': 'false', style: `font-family:${f.stack}` }, f.name))
    const ranges = Object.entries(RANGES).map(([key, cfg]) => {
      const id = `rd-${key}`
      const input = h('input', { type: 'range', class: 'mm-range', id, min: cfg.min, max: cfg.max, step: cfg.step })
      const out = h('output', { for: id })
      input.addEventListener('input', () => withAnchor(() => setPref(key, Number(input.value))))
      const lo = key === 'size' ? h('span', { class: 'lo', 'aria-hidden': 'true' }, 'A') : null
      const hi = key === 'size' ? h('span', { class: 'hi', 'aria-hidden': 'true' }, 'A') : null
      return { key, cfg, input, out, el: h('div', { class: 'fld' }, h('div', { class: 'fld-head' }, h('label', { for: id }, cfg.label), out), h('div', { class: 'rng' }, lo, input, hi)) }
    })
    const themeBtns = THEMES.map(t => h('button', { type: 'button', class: 'swatch', 'data-theme': t.id, 'aria-pressed': 'false', 'aria-label': `${t.name} theme`, title: t.name },
      h('span', { class: 'sw', 'aria-hidden': 'true', style: `background:${t.bg};color:${t.fg}` }, 'Aa'), h('span', { 'aria-hidden': 'true' }, t.short)))
    const reset = h('button', { type: 'button', class: 'mm-btn ghost sm' }, 'Reset to defaults')
    const pop = h('div', { class: 'pop', id: 'rd-pop', role: 'dialog', 'aria-label': 'Text and theme', hidden: true },
      h('div', { class: 'fld' }, h('span', { class: 'fld-title', id: 'rd-font-lbl' }, 'Font'), h('div', { class: 'seg', role: 'group', 'aria-labelledby': 'rd-font-lbl' }, fontBtns)),
      ranges.map(r => r.el),
      h('div', { class: 'fld' }, h('span', { class: 'fld-title', id: 'rd-theme-lbl' }, 'Theme'), h('div', { class: 'themes', role: 'group', 'aria-labelledby': 'rd-theme-lbl' }, themeBtns)),
      h('div', { class: 'pop-foot' }, reset))

    const doc = h('article', { class: 'doc' })
    const scroller = h('div', { class: 'scroll', tabindex: '0', role: 'document', 'aria-label': 'Article text' }, doc)
    const toast = h('div', { class: 'mm-toast', role: 'status', hidden: true })
    wrap.append(progress, bar, pop, scroller, toast)
    layer.appendChild(wrap)
    Object.assign(ui, { wrap, progress, progressFill, bar, site, aa, bio, play, stop, rate, lang, left, close, pop, fontBtns, ranges, themeBtns, doc, scroller, toast, trStatus: null })

    // events
    scroller.addEventListener('scroll', scheduleProgress, { passive: true })
    aa.addEventListener('click', () => (R.popOpen ? closePop(false) : openPop()))
    bio.addEventListener('click', () => setBionic(!BIO.on)) // per-tab state, not a saved preference
    play.addEventListener('click', () => { if (T.state === 'playing') ttsPause(); else if (T.state === 'paused') ttsResume(); else ttsPlay() })
    stop.addEventListener('click', () => ttsStop())
    rate.addEventListener('change', () => { setRate(Number(rate.value)); persist({ ttsRate: T.rate }) })
    lang.addEventListener('change', () => setTranslate(lang.value))
    close.addEventListener('click', () => closeReader())
    for (const b of fontBtns) b.addEventListener('click', () => withAnchor(() => setPref('font', b.dataset.font)))
    for (const b of themeBtns) b.addEventListener('click', () => setPref('theme', b.dataset.theme))
    reset.addEventListener('click', () => withAnchor(() => {
      R.prefs = { ...READER_DEFAULTS }
      applyPrefs()
      persist({ reader: { ...READER_DEFAULTS } })
    }))
    wrap.addEventListener('pointerdown', e => {
      if (!R.popOpen) return
      const path = e.composedPath()
      if (!path.includes(pop) && !path.includes(aa)) closePop(false)
    })
    wrap.addEventListener('keydown', trapFocus)
    // Show the article's focus ring only for keyboard users (it is focused programmatically on open).
    wrap.addEventListener('keydown', e => { if (e.key === 'Tab') wrap.classList.add('kbd') })
    wrap.addEventListener('pointerdown', () => wrap.classList.remove('kbd'))
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(() => {
        const hgt = bar.offsetHeight
        if (!hgt) return
        R.barH = hgt + 12
        wrap.style.setProperty('--rd-bar-h', `${hgt}px`)
        if (R.popOpen) placePop()
      }).observe(bar)
    }
    addEventListener('resize', MM.debounce(() => { if (R.open) { scheduleProgress(); if (R.popOpen) placePop() } }, 120))
    R.ui = ui
    applyPrefs()
    syncTtsUi()
    syncBioUi()
    return ui
  }
  function trapFocus(e) {
    if (e.key !== 'Tab') return
    const ui = R.ui
    const items = [...ui.wrap.querySelectorAll('button,select,input,[tabindex="0"]')]
      .filter(el => !el.disabled && !el.closest('[hidden]') && el.getClientRects().length)
    if (!items.length) return
    const i = items.indexOf(ui.root.activeElement)
    if (e.shiftKey && i <= 0) { e.preventDefault(); items[items.length - 1].focus() } else if (!e.shiftKey && (i === items.length - 1 || i < 0)) { e.preventDefault(); items[0].focus() }
  }

  function onGlobalKey(e) {
    if (!R.open || e.key !== 'Escape' || e.isComposing) return
    e.preventDefault()
    e.stopPropagation()
    if (R.popOpen) closePop(true)
    else closeReader()
  }

  function openPop() {
    const ui = R.ui
    R.popOpen = true
    ui.pop.hidden = false
    ui.aa.setAttribute('aria-expanded', 'true')
    placePop()
    ;(ui.fontBtns.find(b => b.getAttribute('aria-pressed') === 'true') || ui.fontBtns[0]).focus()
  }
  function placePop() {
    const ui = R.ui
    const r = ui.aa.getBoundingClientRect()
    const w = ui.pop.offsetWidth || 344
    ui.pop.style.top = `${Math.round(r.bottom + 10)}px`
    ui.pop.style.left = `${Math.round(clamp(r.left + r.width / 2 - w / 2, 12, innerWidth - w - 12))}px`
  }
  function closePop(refocus) {
    if (!R.popOpen || !R.ui) return
    R.popOpen = false
    R.ui.pop.hidden = true
    R.ui.aa.setAttribute('aria-expanded', 'false')
    if (refocus) R.ui.aa.focus()
  }

  function setPref(key, value) {
    const next = readerPrefs({ reader: { ...R.prefs, [key]: value } })
    if (next[key] === R.prefs[key]) return
    R.prefs = next
    applyPrefs()
    persist({ reader: { [key]: next[key] } })
  }

  function applyPrefs() {
    const ui = R.ui
    if (!ui) return
    const p = R.prefs
    const st = ui.wrap.style
    st.setProperty('--rd-font', FONTS.find(f => f.id === p.font).stack)
    st.setProperty('--rd-size', `${p.size}px`)
    st.setProperty('--rd-lh', String(p.lineHeight))
    st.setProperty('--rd-width', `${p.width}px`)
    ui.wrap.dataset.theme = p.theme
    ui.wrap.dataset.font = p.font
    ui.wrap.toggleAttribute('data-light', !!THEMES.find(t => t.id === p.theme)?.light)
    for (const b of ui.fontBtns) b.setAttribute('aria-pressed', String(b.dataset.font === p.font))
    for (const b of ui.themeBtns) b.setAttribute('aria-pressed', String(b.dataset.theme === p.theme))
    for (const r of ui.ranges) {
      const v = p[r.key]
      if (Number(r.input.value) !== v) r.input.value = String(v)
      r.out.textContent = r.cfg.fmt(v)
      r.input.setAttribute('aria-valuetext', r.cfg.fmt(v))
    }
    scheduleProgress()
  }

  /** Keep the paragraph at the top of the view in place while text reflows. */
  function withAnchor(fn) {
    const a = R.open ? anchor() : null
    fn()
    if (a) restoreAnchor(a)
  }
  function anchor() {
    const sc = R.ui?.scroller
    if (!sc || sc.scrollTop < 20) return null
    const top = sc.getBoundingClientRect().top + R.barH + 12
    for (const el of R.blocks.values()) {
      const r = el.getBoundingClientRect()
      if (r.bottom > top) return { el, off: r.top - top }
    }
    return null
  }
  function restoreAnchor(a) {
    if (!a.el.isConnected) return
    const sc = R.ui.scroller
    const top = sc.getBoundingClientRect().top + R.barH + 12
    sc.scrollTop += a.el.getBoundingClientRect().top - top - a.off
  }

  function scheduleProgress() {
    if (R.progRaf) return
    R.progRaf = requestAnimationFrame(updateProgress)
  }
  function updateProgress() {
    R.progRaf = 0
    const ui = R.ui
    if (!ui || !R.open) return
    const sc = ui.scroller
    const max = sc.scrollHeight - sc.clientHeight
    const words = R.page?.wordCount || 0
    const p = max > 2 ? clamp(sc.scrollTop / max, 0, 1) : 0
    ui.progressFill.style.transform = `scaleX(${p.toFixed(4)})`
    ui.progress.setAttribute('aria-valuenow', String(Math.round(p * 100)))
    if (!R.items.length || !words) ui.left.textContent = ''
    else if (max <= 2) ui.left.textContent = `${Math.max(1, Math.round(words / WPM))} min read`
    else if (p >= 0.995) ui.left.textContent = 'Finished'
    else {
      const min = (words * (1 - p)) / WPM
      ui.left.textContent = min < 1 ? '< 1 min left' : `${Math.round(min)} min left`
    }
  }

  function rdToast(msg) {
    const t = R.ui?.toast
    if (!t) return
    t.textContent = msg
    t.hidden = false
    clearTimeout(R.toastTimer)
    R.toastTimer = setTimeout(() => { t.hidden = true }, 4200)
  }

  function syncTtsUi() {
    const ui = R.ui
    if (!ui) return
    const s = T.state
    const label = s === 'playing' ? 'Pause reading' : s === 'paused' ? 'Resume reading' : 'Read aloud'
    ui.play.replaceChildren(icon(s === 'playing' ? 'pause' : 'play', s !== 'playing'))
    ui.play.setAttribute('aria-label', label)
    ui.play.title = label
    ui.play.classList.toggle('on', s !== 'stopped')
    ui.stop.disabled = s === 'stopped'
    const opts = [...new Set([...RATES, T.rate])].sort((a, b) => a - b)
    if (ui.rate.options.length !== opts.length || [...ui.rate.options].some((o, i) => Number(o.value) !== opts[i])) {
      ui.rate.replaceChildren(...opts.map(r => new Option(fmtRate(r), String(r))))
    }
    ui.rate.value = String(T.rate)
  }

  function syncBioUi() {
    if (R.ui) R.ui.bio.setAttribute('aria-pressed', String(BIO.on))
  }

  function syncLangUi() {
    const sel = R.ui?.lang
    if (!sel) return
    if (R.translate && ![...sel.options].some(o => o.value === R.translate)) sel.append(new Option(R.translate, R.translate))
    sel.value = R.translate
    sel.options[0].textContent = R.translate ? 'Translation off' : 'Translate…'
  }

  // ───────── reader rendering ─────────
  const BLOCK_TAG = { p: 'p', h1: 'h2', h2: 'h2', h3: 'h3', h4: 'h4', blockquote: 'p', figcaption: 'p', li: 'li' }
  const norm = s => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

  /** Block for one paragraph. Original blocks are registered for TTS/translation by pid. */
  function blockEl(it, text, original) {
    let el
    if (it.tag === 'pre') el = h('pre', {}, h('code', {}, text))
    else if (it.tag === 'td') el = h('tr', {}, text.split(/\s+\|\s+/).map(c => h('td', {}, c)))
    else el = h(BLOCK_TAG[it.tag] || 'p', { class: it.tag === 'figcaption' ? 'cap' : null }, text)
    if (original) { el.dataset.pid = it.pid; R.blocks.set(it.pid, el) }
    return el
  }
  const listTag = it => (it.el?.closest?.('ol,ul')?.localName === 'ol' ? 'ol' : 'ul')
  const table = rowEl => h('div', { class: 'tbl' }, h('table', {}, h('tbody', {}, rowEl)))

  /** Group one item into its block, reusing the current list/quote/table container when it continues. */
  function appendFlow(body, it, state) {
    let key = ''
    if (it.tag === 'li') {
      // Consecutive items of the same source list share one <ul>/<ol>.
      const parent = it.el?.parentElement || null
      if (!state.parentIds.has(parent)) state.parentIds.set(parent, state.parentIds.size)
      key = `${listTag(it)}:${state.parentIds.get(parent)}`
    } else if (it.tag === 'blockquote') key = 'bq'
    else if (it.tag === 'td') key = 'tbl'
    if (!key) { state.key = ''; body.append(blockEl(it, it.text, true)); return }
    if (key !== state.key) {
      state.key = key
      if (it.tag === 'li') state.box = state.inner = h(listTag(it))
      else if (it.tag === 'blockquote') state.box = state.inner = h('blockquote')
      else { state.inner = h('tbody'); state.box = h('div', { class: 'tbl' }, h('table', {}, state.inner)) }
      body.append(state.box)
    }
    state.inner.append(blockEl(it, it.text, true))
  }

  /** Wrap a lone block so it stays valid and styled outside its group (one list item, quote or table row per pair). */
  function wrapLone(it, el) {
    if (it.tag === 'li') {
      const n = R.liNum.get(it.pid)
      if (n) el.value = n // keep ordered-list numbering across separate rows
      return h(listTag(it), { class: 'solo' }, el)
    }
    return it.tag === 'blockquote' ? h('blockquote', {}, el) : it.tag === 'td' ? table(el) : el
  }

  function pairRow(it, lang) {
    if (it.tag === 'pre') return h('div', { class: 'pair full' }, blockEl(it, it.text, true))
    const code = langCode(lang)
    const cell = h('div', { class: 'tr', 'data-tr': it.pid, lang: code || null, dir: RTL.has(code) ? 'rtl' : null })
    R.trCells.set(it.pid, cell)
    return h('div', { class: `pair t-${it.tag}` }, h('div', { class: 'src' }, wrapLone(it, blockEl(it, it.text, true))), cell)
  }

  const trBlock = (it, text) => wrapLone(it, blockEl(it, text, false))

  function renderLoading() {
    const { doc } = R.ui
    doc.classList.remove('pairs')
    doc.replaceChildren(h('div', { class: 'loading', 'aria-busy': 'true', 'aria-label': 'Loading article' },
      h('div', { class: 'mm-skeleton', style: 'width:28%;height:12px' }),
      h('div', { class: 'mm-skeleton', style: 'width:86%;height:34px;margin:8px 0 2px' }),
      h('div', { class: 'mm-skeleton', style: 'width:52%;height:12px;margin-bottom:28px' }),
      ...[100, 96, 99, 62, 0, 100, 94, 97, 40].map(w => (w ? h('div', { class: 'mm-skeleton', style: `width:${w}%` }) : h('div', { style: 'height:10px' })))))
  }

  function renderDoc() {
    const ui = R.ui
    const page = R.page
    const items = R.items
    const lang = R.translate
    R.blocks = new Map()
    R.trCells = new Map()
    R.speakingEl = null
    BIO.reader = []
    BIO.rgen++
    ui.trStatus = null
    const doc = ui.doc
    doc.classList.toggle('pairs', !!lang)
    if (page.lang) doc.setAttribute('lang', page.lang)
    else doc.removeAttribute('lang')

    // Title: the article's own h1 near the top wins over the document title (which often carries the site name).
    const h1 = items.slice(0, 4).find(it => it.tag === 'h1')
    const titleText = h1?.text || page.title || document.title || location.hostname
    const title = h('h1', { class: 'title' }, titleText)
    if (h1) { title.dataset.pid = h1.pid; R.blocks.set(h1.pid, title) }
    const meta = h('div', { class: 'meta' })
    if (page.byline) meta.append(h('span', { class: 'by' }, `By ${page.byline}`))
    meta.append(h('span', {}, `${Math.max(1, page.readingMin || 1)} min read`), h('span', {}, `${(page.wordCount || 0).toLocaleString()} words`))
    const when = page.published ? new Date(page.published) : null
    if (when && !Number.isNaN(when.getTime())) meta.append(h('time', { datetime: when.toISOString() }, when.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })))
    const head = h('header', { class: 'doc-head' }, h('div', { class: 'kicker' }, page.site || location.hostname.replace(/^www\./, '')), title, meta)

    // Skip the title heading and a byline line that the meta row already shows.
    const by = norm(page.byline)
    const body = h('div', { class: 'body' })
    const flow = { key: '', box: null, inner: null, parentIds: new Map() }
    R.liNum = new Map()
    let run = { parent: undefined, n: 0, prev: '' }
    let shown = 0
    for (const [i, it] of items.entries()) {
      if (it === h1) continue
      if (by && i < 5 && it.tag === 'p' && it.text.length < 140 && norm(it.text).includes(by)) continue
      shown++
      if (it.tag === 'li') {
        const parent = it.el?.parentElement || null
        if (run.prev !== 'li' || parent !== run.parent) run = { parent, n: 0, prev: 'li' }
        R.liNum.set(it.pid, ++run.n)
      } else run.prev = it.tag
      if (lang) body.append(pairRow(it, lang))
      else appendFlow(body, it, flow)
    }

    if (!shown && !h1) {
      doc.replaceChildren(head, h('div', { class: 'mm-empty rd-empty' }, h('b', {}, 'Nothing to read here'),
        'Master Mind couldn’t find article text on this page. Focus Reader works best on articles, posts and documentation.'))
      return
    }
    if (lang) {
      ui.trStatus = h('div', { class: 'tr-status', role: 'status', 'aria-live': 'polite' })
      body.prepend(h('div', { class: 'pairs-head', 'aria-hidden': 'true' }, h('span', {}, 'Original'), h('span', { class: 'h-tr' }, lang)))
    }
    const back = h('button', { type: 'button', class: 'mm-btn ghost sm' }, icon('back'), 'Back to page')
    back.addEventListener('click', () => closeReader())
    const end = h('footer', { class: 'doc-end' }, h('span', { class: 'end-mark' }, 'End of article'), back)
    doc.replaceChildren(...[head, ui.trStatus, body, end].filter(Boolean))
  }

  // ───────── translation ─────────
  function makeBatches(list) {
    const out = []
    let cur = []
    let chars = 0
    // A small first batch puts the top of the article on screen quickly.
    let maxN = 8
    let maxC = 3000
    for (const it of list) {
      const n = it.text.length
      if (cur.length && (cur.length >= maxN || chars + n > maxC)) { out.push(cur); cur = []; chars = 0; maxN = 40; maxC = 12000 }
      cur.push(it)
      chars += n
    }
    if (cur.length) out.push(cur)
    return out
  }

  function setPending(it) {
    const cell = R.trCells.get(it.pid)
    if (!cell) return
    cell.classList.add('pending')
    cell.classList.remove('failed')
    cell.setAttribute('aria-busy', 'true')
    const heading = /^h\d$/.test(it.tag)
    const lines = heading ? 1 : clamp(Math.round(it.text.length / 80), 1, 6)
    const last = 35 + (it.text.length % 50)
    cell.replaceChildren(...Array.from({ length: lines }, (_, i) => h('div', { class: 'mm-skeleton sk', style: `width:${i === lines - 1 && lines > 1 ? last : heading ? 70 : 100}%` })))
  }
  function fillTr(it, text) {
    const cell = R.trCells.get(it.pid)
    if (!cell) return
    cell.classList.remove('pending', 'failed')
    cell.removeAttribute('aria-busy')
    cell.replaceChildren(trBlock(it, text))
    if (BIO.on) bionicReader(true, cell)
  }
  function failTr(it) {
    const cell = R.trCells.get(it.pid)
    if (!cell || !cell.classList.contains('pending')) return
    cell.classList.remove('pending')
    cell.classList.add('failed')
    cell.removeAttribute('aria-busy')
    cell.replaceChildren(h('p', { class: 'fail' }, 'Not translated'))
  }

  function trStatus(kind, { lang, done = 0, total = 0, error = null } = {}) {
    const el = R.ui?.trStatus
    if (!el) return
    el.className = `tr-status${kind === 'error' ? ' err' : ''}`
    el.removeAttribute('aria-busy')
    const retry = () => {
      const b = h('button', { type: 'button', class: 'mm-btn sm' }, icon('retry'), 'Retry')
      b.addEventListener('click', () => translateAll())
      return b
    }
    if (kind === 'busy') {
      el.setAttribute('aria-busy', 'true')
      el.replaceChildren(h('span', { class: 'mm-spinner', 'aria-hidden': 'true' }), h('span', { class: 'grow' }, `Translating to ${lang}… ${done} of ${total} paragraphs`))
    } else if (kind === 'done') {
      el.replaceChildren(icon('check'), h('span', { class: 'grow' }, `Translated to ${lang} · ${total} paragraphs`))
    } else if (kind === 'partial') {
      el.replaceChildren(icon('alert'), h('span', { class: 'grow' }, `${total - done} of ${total} paragraphs came back untranslated.`), retry())
    } else {
      const code = error?.code
      const msg = code === 'NO_KEY' ? 'Add your Claude API key in Master Mind settings to translate this page.'
        : code === 'RELOAD' ? 'Master Mind was updated. Reload this page to translate it.'
          : error?.message || 'Translation failed.'
      el.replaceChildren(icon('alert'), h('span', { class: 'grow' }, msg))
      if (code === 'NO_KEY' || code === 'AUTH' || code === 'PERMISSION') {
        const b = h('button', { type: 'button', class: 'mm-btn primary sm' }, 'Open settings')
        b.addEventListener('click', () => MM.send('OPEN_HUB', { view: 'settings' }))
        el.append(b)
      } else if (code !== 'RELOAD') el.append(retry())
    }
  }

  async function translateAll() {
    const lang = R.translate
    if (!lang || !R.open || !R.ui?.trStatus) return
    R.trCtrl?.abort()
    const ctrl = (R.trCtrl = new AbortController())
    if (!R.trCache.has(lang)) R.trCache.set(lang, new Map())
    const cache = R.trCache.get(lang)
    const todo = R.items.filter(it => R.trCells.has(it.pid))
    const need = []
    for (const it of todo) {
      const hit = cache.get(it.text)
      if (hit != null) fillTr(it, hit)
      else { need.push(it); setPending(it) }
    }
    const total = todo.length
    let done = total - need.length
    if (!need.length) { R.trCtrl = null; return trStatus('done', { lang, done, total }) }
    trStatus('busy', { lang, done, total })
    const batches = makeBatches(need)
    let failure = null
    let missing = 0
    const worker = async () => {
      while (batches.length && !ctrl.signal.aborted && !failure) {
        const batch = batches.shift()
        try {
          const res = await MM.ai('translate', { paragraphs: batch.map(it => ({ id: it.pid, text: it.text })), to: lang }, { signal: ctrl.signal })
          if (ctrl.signal.aborted) return
          const got = new Map()
          for (const t of res?.data?.translations || []) {
            if (t && typeof t.id === 'string' && typeof t.text === 'string' && t.text.trim()) got.set(t.id, t.text.trim())
          }
          for (const it of batch) {
            const tx = got.get(it.pid)
            if (tx != null) { cache.set(it.text, tx); fillTr(it, tx); done++ } else { failTr(it); missing++ }
          }
          if (!failure) trStatus('busy', { lang, done, total })
        } catch (e) {
          if (ctrl.signal.aborted) return
          failure = e
          for (const it of batch) failTr(it)
        }
      }
    }
    await Promise.all([worker(), worker()])
    if (ctrl.signal.aborted || R.trCtrl !== ctrl) return
    R.trCtrl = null
    for (const b of batches) for (const it of b) failTr(it)
    if (failure) trStatus('error', { lang, error: failure })
    else if (missing) trStatus('partial', { lang, done, total })
    else trStatus('done', { lang, done, total })
  }

  function setTranslate(value) {
    const lang = normLang(value)
    if (lang === R.translate) {
      syncLangUi()
      // Asked again after a failure (e.g. the API key was just added): retry what's missing.
      if (lang && R.open && !R.trCtrl && R.ui?.doc.querySelector('.tr.failed')) translateAll()
      return
    }
    R.trCtrl?.abort()
    R.trCtrl = null
    R.translate = lang
    syncLangUi()
    broadcastReader()
    if (!R.open || !R.page) return
    const a = anchor()
    const pid = a ? [...R.blocks.entries()].find(([, el]) => el === a.el)?.[0] : null
    renderDoc()
    if (pid && R.blocks.get(pid)) restoreAnchor({ el: R.blocks.get(pid), off: a.off })
    else R.ui.scroller.scrollTop = 0
    scheduleProgress()
    if (BIO.on) bionicReader(true)
    if (lang) translateAll()
    ttsRetarget()
  }

  // ───────── open / close ─────────
  function lockScroll() {
    if (R.lock) return
    R.lock = [document.documentElement, document.body].filter(Boolean).map(el => ({
      el, had: el.hasAttribute('style'),
      x: [el.style.getPropertyValue('overflow-x'), el.style.getPropertyPriority('overflow-x')],
      y: [el.style.getPropertyValue('overflow-y'), el.style.getPropertyPriority('overflow-y')],
    }))
    for (const { el } of R.lock) el.style.setProperty('overflow', 'hidden', 'important')
  }
  function unlockScroll() {
    if (!R.lock) return
    for (const { el, had, x, y } of R.lock) {
      el.style.removeProperty('overflow')
      if (x[0]) el.style.setProperty('overflow-x', x[0], x[1])
      if (y[0]) el.style.setProperty('overflow-y', y[0], y[1])
      if (!had && !el.getAttribute('style')) el.removeAttribute('style')
    }
    R.lock = null
  }

  async function openReader({ translate } = {}) {
    if (R.open) {
      if (translate !== undefined) setTranslate(translate)
      return
    }
    const ui = ensureUI()
    R.open = true
    const gen = ++R.gen
    if (!savePending()) R.prefs = readerPrefs(MM.settings)
    R.translate = translate !== undefined ? normLang(translate) : ''
    R.page = null
    R.items = []
    R.blocks = new Map()
    applyPrefs()
    syncLangUi()
    syncBioUi()
    syncTtsUi()
    ui.site.textContent = location.hostname.replace(/^www\./, '')
    ui.wrap.classList.remove('closing')
    ui.wrap.hidden = false
    ui.left.textContent = ''
    ui.progressFill.style.transform = 'scaleX(0)'
    renderLoading()
    lockScroll()
    const active = document.activeElement
    R.prevFocus = active && active !== document.body && !MM.isOwn(active) ? active : null
    addEventListener('keydown', onGlobalKey, true)
    ui.scroller.scrollTop = 0
    ui.scroller.focus({ preventScroll: true })
    broadcastReader()
    await sleep(16) // let the shell paint before extraction work
    if (gen !== R.gen) return
    const { page, items } = await readPage()
    if (gen !== R.gen) return
    R.page = page
    R.items = items
    ui.site.textContent = page.site || location.hostname.replace(/^www\./, '')
    renderDoc()
    scheduleProgress()
    if (BIO.on) bionicReader(true)
    if (R.translate && R.trCells.size) translateAll()
    ttsRetarget()
  }

  function closeReader() {
    if (!R.open) return
    R.open = false
    R.gen++
    R.trCtrl?.abort()
    R.trCtrl = null
    R.translate = ''
    clearTimeout(R.refreshTimer)
    closePop(false)
    unlockScroll()
    removeEventListener('keydown', onGlobalKey, true)
    const ui = R.ui
    const finish = () => {
      if (R.open) return
      ui.wrap.hidden = true
      ui.wrap.classList.remove('closing')
      ui.doc.replaceChildren()
      ui.trStatus = null
      R.blocks = new Map()
      R.trCells = new Map()
      BIO.reader = []
      BIO.rgen++
    }
    if (reduceMotion()) finish()
    else { ui.wrap.classList.add('closing'); setTimeout(finish, 170) }
    // Return focus to where it was on the page.
    if (ui.root.activeElement) ui.root.activeElement.blur()
    if (R.prevFocus?.isConnected) { try { R.prevFocus.focus({ preventScroll: true }) } catch { /* not focusable */ } }
    R.prevFocus = null
    ttsRetarget()
    broadcastReader()
  }

  /** Content changed under an open reader (SPA navigation): rebuild it. */
  async function refreshReader() {
    if (!R.open) return
    const gen = ++R.gen
    R.trCtrl?.abort()
    R.trCtrl = null
    renderLoading()
    R.ui.scroller.scrollTop = 0
    const { page, items } = await readPage()
    if (gen !== R.gen || !R.open) return
    R.page = page
    R.items = items
    R.ui.site.textContent = page.site || location.hostname.replace(/^www\./, '')
    renderDoc()
    scheduleProgress()
    if (BIO.on) bionicReader(true)
    if (R.translate && R.trCells.size) translateAll()
  }

  function broadcastReader() {
    MM.send('MM_READER_EVENT', { open: R.open, bionic: BIO.on, translate: R.translate })
  }

  // ───────── messages ─────────
  MM.on('MM_READER', async ({ action = 'toggle', translate } = {}) => {
    if (action === 'close' || (action === 'toggle' && R.open)) closeReader()
    else if (action === 'open' || action === 'toggle') await openReader({ translate })
    else return { ok: false, error: `Unknown reader action "${action}"` }
    return { ok: true, open: R.open }
  })

  MM.on('MM_BIONIC', async ({ on } = {}) => {
    await setBionic(on === undefined ? !BIO.on : !!on)
    return { ok: true, on: BIO.on }
  })

  MM.on('MM_TTS', async ({ action, rate } = {}) => {
    if (rate != null) setRate(rate)
    if (action === 'play') await ttsPlay()
    else if (action === 'pause') ttsPause()
    else if (action === 'resume') await ttsResume()
    else if (action === 'stop') ttsStop()
    else if (action === 'toggle') await (T.state === 'playing' ? ttsPause() : T.state === 'paused' ? ttsResume() : ttsPlay())
    else if (action != null) return { ok: false, state: T.state, error: `Unknown speech action "${action}"` }
    return T.error ? { ok: false, state: T.state, error: T.error } : { ok: true, state: T.state }
  })

  MM.on('MM_TTS_STATE', () => ({ ok: true, ...ttsInfo() }))

  MM.on('MM_READER_STATE', () => ({ ok: true, open: R.open, bionic: BIO.on, translate: R.translate, tts: ttsInfo() }))

  // ───────── live settings, navigation, teardown ─────────
  const seen = { reader: null, rate: null, voice: null, strength: null, accent: null }
  function onSettings(s) {
    const rj = JSON.stringify(s.reader || {})
    if (rj !== seen.reader && !savePending()) {
      seen.reader = rj
      const next = readerPrefs(s)
      if (JSON.stringify(next) !== JSON.stringify(R.prefs)) { R.prefs = next; withAnchor(applyPrefs) }
    }
    const rate = s.ttsRate ?? 1
    if (rate !== seen.rate) { seen.rate = rate; setRate(rate) }
    const voice = s.ttsVoice || ''
    if (voice !== seen.voice) {
      const changed = seen.voice !== null
      seen.voice = voice
      if (changed) restartCurrent()
    }
    const strength = bioStrength(s)
    if (strength !== seen.strength) {
      const changed = seen.strength !== null
      seen.strength = strength
      if (changed && BIO.on) {
        Promise.all([bionicPage(false), R.open ? bionicReader(false) : null])
          .then(() => (BIO.on ? Promise.all([bionicPage(true), R.open ? bionicReader(true) : null]) : null))
      }
    }
    if ((s.accent || '') !== seen.accent) {
      seen.accent = s.accent || ''
      if (document.getElementById('mm-page-style-reader')) ensurePageStyle()
    }
  }
  MM.events.on('settings', onSettings)
  onSettings(MM.settings || {})

  MM.events.on('urlchange', ({ from, to }) => {
    if (MM.pageKey(from) === MM.pageKey(to)) return // same document (hash change)
    ttsStop()
    R.trCtrl?.abort()
    clearTimeout(R.refreshTimer)
    if (R.open) R.refreshTimer = setTimeout(refreshReader, 700) // let the new view render first
    if (BIO.on) setTimeout(() => { if (BIO.on) bionicPage(true) }, 900)
  })

  // Leaving the page (reload, navigation, bfcache): stop speaking and tell the panel this document's state is gone.
  addEventListener('pagehide', () => {
    if (T.state !== 'stopped') {
      T.tok++
      try { synth()?.cancel() } catch { /* ignore */ }
      T.idx = -1
      setState('stopped')
    }
    if (R.open || BIO.on) MM.send('MM_READER_EVENT', { open: false, bionic: false, translate: '' })
  })
  addEventListener('pageshow', e => { if (e.persisted) { broadcastReader(); broadcastTts(true) } })

  // ───────── helpers for other content modules ─────────
  MM.reader = { open: openReader, close: closeReader, isOpen: () => R.open, translate: setTranslate }
  MM.bionic = { set: setBionic, isOn: () => BIO.on }
  MM.tts = { play: ttsPlay, pause: ttsPause, resume: ttsResume, stop: ttsStop, setRate, state: ttsInfo }
})()
