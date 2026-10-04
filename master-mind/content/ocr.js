// Canvas OCR, page side: MM_OCR_START shows a full-viewport drag-to-crop overlay (Shadow DOM). On release the
// overlay is hidden, two frames pass so it can't end up in the screenshot, and OCR_CAPTURE goes to the background.
// The result card (bottom-right glass) shows a spinner, then the editable text with Copy / Save to notes / Close.
(() => {
  const MM = globalThis.MM
  if (!MM || MM.__skip) return

  const MIN = 8 // smallest selection, CSS px
  const SVGNS = 'http://www.w3.org/2000/svg'
  const ICONS = {
    scan: ['M4 8V6a2 2 0 0 1 2-2h2', 'M16 4h2a2 2 0 0 1 2 2v2', 'M20 16v2a2 2 0 0 1-2 2h-2', 'M8 20H6a2 2 0 0 1-2-2v-2', 'M8 10h8', 'M8 14h5'],
    close: ['M6 6l12 12', 'M18 6L6 18'],
    copy: ['M9 9h10v11H9z', 'M5 15V5a1 1 0 0 1 1-1h9'],
    note: ['M5 4h10l4 4v12H5z', 'M14 4v5h5', 'M8 13h8', 'M8 17h5'],
    check: ['M5 12.5l4.5 4.5L19 7.5'],
    full: ['M4 9V4h5', 'M20 9V4h-5', 'M4 15v5h5', 'M20 15v5h-5'],
    retry: ['M20 11a8 8 0 0 0-14.9-3.9', 'M4 4v4h4', 'M4 13a8 8 0 0 0 14.9 3.9', 'M20 20v-4h-4'],
    open: ['M14 4h6v6', 'M20 4l-9 9', 'M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5'],
  }

  const OVERLAY_CSS = `
.ov:focus,.ov:focus-visible{outline:none}
.ov{position:fixed;inset:0;cursor:crosshair;touch-action:none;user-select:none;-webkit-user-select:none;outline:none;animation:ov-in .16s var(--mm-ease)}
@keyframes ov-in{from{opacity:0}}
.dim{position:absolute;inset:0;background:rgba(5,7,12,.5);transition:opacity .12s}
.ov.dragging .dim{opacity:0}
.gx,.gy{position:absolute;pointer-events:none;background:color-mix(in srgb,var(--mm-accent) 55%,transparent);box-shadow:0 0 6px color-mix(in srgb,var(--mm-accent) 60%,transparent)}
.gx{left:0;right:0;height:1px;top:0}
.gy{top:0;bottom:0;width:1px;left:0}
.ov.dragging .gx,.ov.dragging .gy,.ov.idle .gx,.ov.idle .gy{display:none}
.sel{position:absolute;display:none;border:1.5px solid var(--mm-accent);border-radius:4px;pointer-events:none;
  box-shadow:0 0 0 100vmax rgba(5,7,12,.5),0 0 0 1px rgba(0,0,0,.35),0 0 22px color-mix(in srgb,var(--mm-accent) 60%,transparent),inset 0 0 18px color-mix(in srgb,var(--mm-accent) 22%,transparent)}
.ov.dragging .sel{display:block}
.sel i{position:absolute;width:9px;height:9px;border:2px solid var(--mm-accent);background:var(--mm-bg)}
.sel i:nth-child(1){left:-5px;top:-5px}.sel i:nth-child(2){right:-5px;top:-5px}.sel i:nth-child(3){left:-5px;bottom:-5px}.sel i:nth-child(4){right:-5px;bottom:-5px}
.size{position:absolute;display:none;pointer-events:none;font:600 11px/1 var(--mm-mono);letter-spacing:.02em;padding:5px 7px;border-radius:6px;white-space:nowrap;
  color:#06080D;background:var(--mm-accent);box-shadow:0 0 14px color-mix(in srgb,var(--mm-accent) 55%,transparent)}
.ov.dragging .size{display:block}
.size.small{background:var(--mm-glass-strong);color:var(--mm-fg-2);box-shadow:none;border:1px solid var(--mm-border-strong)}
.hint{position:absolute;top:18px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:center;
  max-width:calc(100vw - 24px);padding:8px 8px 8px 14px;border-radius:999px;cursor:default;
  background:var(--mm-glass-strong);backdrop-filter:var(--mm-blur);-webkit-backdrop-filter:var(--mm-blur);border:1px solid var(--mm-border-strong);
  box-shadow:var(--mm-shadow),0 0 26px color-mix(in srgb,var(--mm-accent) 16%,transparent);font:500 13px/1.3 var(--mm-font);color:var(--mm-fg);transition:opacity .15s}
.ov.dragging .hint{opacity:.18;pointer-events:none}
.hint .lead{display:inline-flex;align-items:center;gap:8px}
.hint .lead .mm-icon{color:var(--mm-accent)}
.hint .keys{color:var(--mm-muted);font-size:12px}
.hint .acts{display:inline-flex;gap:6px}
.hint.warn{border-color:color-mix(in srgb,var(--mm-amber) 55%,transparent)}
.hint.warn .msg{color:var(--mm-amber)}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
`

  const CARD_CSS = `
.card{position:fixed;width:min(384px,calc(100vw - 32px));max-height:calc(100vh - 40px);display:flex;flex-direction:column;gap:11px;padding:14px;
  background:var(--mm-glass-strong);backdrop-filter:var(--mm-blur);-webkit-backdrop-filter:var(--mm-blur);border:1px solid var(--mm-border);border-radius:var(--mm-radius);
  box-shadow:var(--mm-shadow),0 1px 0 rgba(255,255,255,.05) inset,0 0 32px color-mix(in srgb,var(--mm-accent) 13%,transparent);outline:none;animation:card-in .22s var(--mm-ease)}
@keyframes card-in{from{opacity:0;transform:translateY(8px) scale(.98)}}
.card:focus,.card:focus-visible{outline:none}
.card[data-pos="br"]{right:20px;bottom:20px}.card[data-pos="bl"]{left:20px;bottom:20px}
.card[data-pos="tr"]{right:20px;top:20px}.card[data-pos="tl"]{left:20px;top:20px}
.head{display:flex;align-items:center;gap:10px}
.badge{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;flex:none;color:var(--mm-accent);
  background:color-mix(in srgb,var(--mm-accent) 12%,transparent);border:1px solid color-mix(in srgb,var(--mm-accent) 30%,transparent)}
.ttl{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.ttl b{color:var(--mm-heading);font-size:13.5px;font-weight:650;line-height:1.2}
.ttl span{font-size:11.5px;color:var(--mm-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.loading{display:flex;flex-direction:column;gap:9px;padding:2px 0 4px}
.loading .row{display:flex;align-items:center;gap:9px;color:var(--mm-fg-2);font-size:13px}
.loading .mm-skeleton{height:11px}
.out{min-height:96px;max-height:min(46vh,380px);font:13px/1.55 var(--mm-font);resize:vertical;white-space:pre-wrap}
.foot{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:11.5px;color:var(--mm-muted)}
.acts{display:flex;gap:8px;flex-wrap:wrap}
.acts .mm-btn{flex:1 1 auto}
.acts .mm-btn.ghost{flex:0 0 auto}
.status{font-size:12px;color:var(--mm-lime);display:flex;align-items:center;gap:8px;min-height:0}
.status:empty{display:none}
.status .mm-btn{margin-left:auto}
.mm-empty{padding:16px 8px}
.err{display:flex;flex-direction:column;gap:9px}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
`

  /** Element builder: strings become text nodes (never HTML). */
  function h(tag, props = {}, ...kids) {
    const el = document.createElement(tag)
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue
      if (k === 'class') el.className = v
      else if (k === 'text') el.textContent = v
      else if (k === 'style') el.style.cssText = v // CSSOM: allowed even under a strict page CSP
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v)
      else el.setAttribute(k, v === true ? '' : String(v))
    }
    for (const c of kids.flat()) if (c != null && c !== false) el.append(c)
    return el
  }
  function icon(name) {
    const s = document.createElementNS(SVGNS, 'svg')
    s.setAttribute('viewBox', '0 0 24 24')
    s.setAttribute('aria-hidden', 'true')
    s.setAttribute('class', 'mm-icon')
    for (const d of ICONS[name]) {
      const p = document.createElementNS(SVGNS, 'path')
      p.setAttribute('d', d)
      s.appendChild(p)
    }
    return s
  }
  const btn = (cls, label, iconName, onclick, extra = {}) => h('button', { type: 'button', class: `mm-btn ${cls}`, onclick, ...extra }, iconName ? icon(iconName) : null, label)

  /** Wait until a frame without our overlay has been painted. */
  const afterPaint = () => new Promise(resolve => {
    if (document.visibilityState === 'hidden') return setTimeout(resolve, 60)
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
  const siteName = () => location.hostname.replace(/^www\./, '') || 'this page'

  // ───────── overlay ─────────
  let ov = null // { el, sel, size, gx, gy, hint, live, cleanup }
  let prevFocus = null

  function openOverlay() {
    if (ov) return
    closeCard()
    prevFocus = document.activeElement
    const { root, layer } = MM.shadow('ocr-overlay', OVERLAY_CSS)
    const sel = h('div', { class: 'sel' }, h('i'), h('i'), h('i'), h('i'))
    const size = h('div', { class: 'size', 'aria-hidden': 'true' })
    const gx = h('div', { class: 'gx' })
    const gy = h('div', { class: 'gy' })
    const msg = h('span', { class: 'msg', id: 'mm-ocr-msg' }, 'Drag over the text you want to capture')
    const hint = h('div', { class: 'hint' },
      h('span', { class: 'lead' }, icon('scan'), msg),
      h('span', { class: 'keys' }, h('kbd', {}, 'Esc'), ' to cancel'),
      h('span', { class: 'acts' },
        btn('sm', 'Whole screen', 'full', () => finish({ x: 0, y: 0, w: innerWidth, h: innerHeight }), { title: 'Capture everything you can see (Enter)', 'aria-keyshortcuts': 'Enter' }),
        btn('sm ghost', 'Cancel', null, () => cancelOverlay())))
    const live = h('div', { class: 'sr', role: 'status', 'aria-live': 'polite' })
    const el = h('div', {
      class: 'ov idle', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Capture text from screen', 'aria-describedby': 'mm-ocr-msg', tabindex: '-1',
    }, h('div', { class: 'dim' }), gx, gy, sel, size, hint, live)
    layer.replaceChildren(el)

    let start = null
    let pointer = null
    let frame = 0
    const clampX = v => Math.max(0, Math.min(innerWidth, v))
    const clampY = v => Math.max(0, Math.min(innerHeight, v))
    const rectNow = () => {
      const x1 = clampX(start.x), y1 = clampY(start.y), x2 = clampX(pointer.x), y2 = clampY(pointer.y)
      return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) }
    }
    const paint = () => {
      frame = 0
      if (!pointer) return
      if (!start) {
        el.classList.remove('idle')
        gx.style.transform = `translateY(${pointer.y}px)`
        gy.style.transform = `translateX(${pointer.x}px)`
        return
      }
      const r = rectNow()
      Object.assign(sel.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` })
      size.textContent = `${Math.round(r.w)} × ${Math.round(r.h)}`
      size.classList.toggle('small', r.w < MIN || r.h < MIN)
      // Label sits under the bottom-right corner; flips inside when it would leave the viewport.
      const lw = size.offsetWidth || 70
      const lx = Math.max(6, Math.min(innerWidth - lw - 6, r.x + r.w - lw))
      const below = r.y + r.h + 8
      size.style.left = `${lx}px`
      size.style.top = `${below + 24 > innerHeight ? Math.max(6, r.y + r.h - 30) : below}px`
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(paint) }
    const announce = MM.debounce(() => {
      if (start) { const r = rectNow(); live.textContent = `Selection ${Math.round(r.w)} by ${Math.round(r.h)} pixels` }
    }, 400)

    const onDown = e => {
      if (e.button !== 0 || e.target.closest('.hint')) return
      e.preventDefault()
      try { el.setPointerCapture(e.pointerId) } catch { /* synthetic pointer */ }
      start = { x: e.clientX, y: e.clientY }
      pointer = { x: e.clientX, y: e.clientY }
      el.classList.add('dragging')
      paint()
    }
    const onMove = e => {
      pointer = { x: e.clientX, y: e.clientY }
      schedule()
      if (start) announce()
    }
    const onUp = e => {
      if (!start) return
      pointer = { x: e.clientX, y: e.clientY }
      const r = rectNow()
      start = null
      el.classList.remove('dragging')
      if (r.w < MIN || r.h < MIN) {
        hint.classList.add('warn')
        msg.textContent = `Too small: drag an area of at least ${MIN} × ${MIN} px`
        live.textContent = msg.textContent
        paint()
        return
      }
      finish(r)
    }
    const onCancelPointer = () => { start = null; el.classList.remove('dragging') }
    const onWheel = e => { if (start) e.preventDefault() }
    /** aria-modal: Tab / Shift+Tab cycle through the overlay's buttons and never walk into the page underneath
     *  (a Tab press also brings focus back in if a page script moved it out while the overlay is up). */
    const trapTab = e => {
      const items = [...el.querySelectorAll('button')].filter(b => !b.disabled && b.getClientRects().length)
      if (!items.length) return
      e.preventDefault()
      e.stopPropagation()
      const i = items.indexOf(root.activeElement)
      const next = e.shiftKey ? items[i <= 0 ? items.length - 1 : i - 1] : items[i < 0 || i === items.length - 1 ? 0 : i + 1]
      next.focus({ preventScroll: true })
    }
    const onKey = e => {
      const target = e.composedPath?.()[0] || e.target
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelOverlay() }
      else if (e.key === 'Tab' && !e.altKey && !e.ctrlKey && !e.metaKey) trapTab(e)
      else if (e.key === 'Enter' && !target?.closest?.('button')) { e.preventDefault(); e.stopPropagation(); finish({ x: 0, y: 0, w: innerWidth, h: innerHeight }) }
    }
    const onBlurWin = () => { if (start) onCancelPointer() }

    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onCancelPointer)
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('contextmenu', e => e.preventDefault())
    addEventListener('keydown', onKey, true)
    addEventListener('blur', onBlurWin)
    const offUrl = MM.events.on('urlchange', () => cancelOverlay())

    ov = {
      el,
      cleanup() {
        cancelAnimationFrame(frame)
        removeEventListener('keydown', onKey, true)
        removeEventListener('blur', onBlurWin)
        offUrl()
        layer.replaceChildren()
      },
    }
    el.focus({ preventScroll: true })
  }

  function closeOverlay() {
    if (!ov) return
    ov.cleanup()
    ov = null
  }

  /** Give focus back to whatever had it before the overlay opened. */
  function restoreFocus() {
    try { if (prevFocus?.isConnected && prevFocus !== document.body) prevFocus.focus({ preventScroll: true }) } catch { /* ignore */ }
    prevFocus = null
  }

  function cancelOverlay() {
    closeOverlay()
    restoreFocus()
  }

  async function finish(rect) {
    if (!ov) return
    closeOverlay()
    await capture({ x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.w), h: Math.round(rect.h) })
  }

  // ───────── capture + result card ─────────
  let seq = 0
  let job = null // { run, rect, url, title, pos, shown, loading }
  let card = null // { el, body, status, meta }

  /** A corner where the loading card won't overlap the region being captured, or null. */
  function safeCorner(r) {
    const W = Math.min(384, innerWidth - 32) + 20
    const H = 150
    const boxes = {
      br: { x: innerWidth - W, y: innerHeight - H, w: W, h: H },
      bl: { x: 0, y: innerHeight - H, w: W, h: H },
      tr: { x: innerWidth - W, y: 0, w: W, h: H },
      tl: { x: 0, y: 0, w: W, h: H },
    }
    for (const [pos, b] of Object.entries(boxes)) {
      const overlap = r.x < b.x + b.w && r.x + r.w > b.x && r.y < b.y + b.h && r.y + r.h > b.y
      if (!overlap) return pos
    }
    return null
  }

  async function capture(rect) {
    const run = ++seq
    job = { run, rect, url: location.href, title: document.title, pos: 'br', shown: false, loading: true }
    removeCard() // an older card must not end up in the screenshot
    await afterPaint()
    if (run !== seq) return
    const safe = safeCorner(rect)
    if (safe) { job.pos = safe; showLoading() }

    const res = await MM.send('OCR_CAPTURE', { rect, dpr: devicePixelRatio || 1 })
    if (run !== seq) return
    job.loading = false
    if (!job.shown) showLoading()
    if (!res) return showError({ code: 'RELOAD', error: 'Master Mind was updated. Reload this page to capture text.' })
    if (!res.ok) {
      if (res.code === 'ABORT') return removeCard()
      return showError(res)
    }
    if (!res.text) return showEmpty()
    showResult(res.text, res.truncated)
  }

  MM.on('MM_OCR_STATUS', msg => {
    if (job?.loading && !job.shown && msg?.stage === 'reading') showLoading()
    return { ok: true }
  })

  function ensureCard() {
    if (card) return card
    const { layer } = MM.shadow('ocr-card', CARD_CSS)
    const meta = h('span')
    const body = h('div', { class: 'body' })
    const status = h('div', { class: 'status', role: 'status', 'aria-live': 'polite' })
    const el = h('div', { class: 'card', role: 'dialog', 'aria-labelledby': 'mm-ocr-ttl', tabindex: '-1', 'data-pos': job?.pos || 'br' },
      h('div', { class: 'head' },
        h('span', { class: 'badge' }, icon('scan')),
        h('div', { class: 'ttl' }, h('b', { id: 'mm-ocr-ttl' }, 'Captured text'), meta),
        h('button', { type: 'button', class: 'mm-btn ghost icon sm', 'aria-label': 'Close', title: 'Close (Esc)', onclick: () => closeCard() }, icon('close'))),
      body, status)
    el.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); closeCard() } })
    layer.replaceChildren(el)
    card = { el, body, status, meta }
    const { w, h: hh } = job?.rect || {}
    meta.textContent = w ? `${siteName()} · ${w} × ${hh} px region` : siteName()
    return card
  }

  function showLoading() {
    if (!job) return
    job.shown = true
    const c = ensureCard()
    c.status.replaceChildren()
    c.body.replaceChildren(h('div', { class: 'loading', 'aria-busy': 'true' },
      h('div', { class: 'row' }, h('span', { class: 'mm-spinner', 'aria-hidden': 'true' }), h('span', {}, 'Reading text with Claude…')),
      h('div', { class: 'mm-skeleton', style: 'width:92%' }),
      h('div', { class: 'mm-skeleton', style: 'width:78%' }),
      h('div', { class: 'mm-skeleton', style: 'width:55%' })))
    c.el.focus({ preventScroll: true })
  }

  const countWords = s => (s.match(/\S+/g) || []).length

  function showResult(text, truncated) {
    const c = ensureCard()
    const { url, title } = job
    const ta = h('textarea', { class: 'mm-textarea out', spellcheck: 'false', 'aria-label': 'Captured text (editable)' })
    ta.value = text
    const count = h('span')
    const updateCount = () => { const n = countWords(ta.value); count.textContent = `${n.toLocaleString()} word${n === 1 ? '' : 's'} · editable` }
    updateCount()
    const copyBtn = btn('primary', 'Copy', 'copy', async () => {
      const ok = await copyText(ta.value)
      say(ok ? 'Copied to clipboard' : 'Couldn’t copy. Select the text and press Ctrl+C.', !ok)
      if (ok) flash(copyBtn, 'Copied', 'check', 'Copy', 'copy')
    })
    const saveBtn = btn('', 'Save to notes', 'note', async () => {
      const value = ta.value.trim()
      if (!value) return say('There is no text to save.', true)
      saveBtn.disabled = true
      const res = await MM.send('OCR_SAVE_NOTE', { text: value, url, title })
      if (!res?.ok) {
        saveBtn.disabled = false
        return say(res?.error || 'Couldn’t save. Reload the page and try again.', true)
      }
      setLabel(saveBtn, 'Saved', 'check')
      say('Saved to your notes', false, btn('sm', 'Open note', 'open', () => MM.send('OPEN_HUB', { view: 'notes', params: `id=${encodeURIComponent(res.id)}` })))
    })
    ta.addEventListener('input', MM.debounce(() => {
      updateCount()
      if (saveBtn.disabled && !job?.loading) { saveBtn.disabled = false; setLabel(saveBtn, 'Save again', 'note') }
    }, 150))
    ta.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); copyBtn.click() }
    })
    c.body.replaceChildren(h('div', { class: 'mm-stack' },
      ta,
      h('div', { class: 'foot' }, count, truncated ? h('span', {}, 'Long capture: may be cut off') : null),
      h('div', { class: 'acts' }, copyBtn, saveBtn, btn('ghost', 'Close', null, () => closeCard()))))
    c.status.replaceChildren()
    const fit = () => { ta.style.height = 'auto'; ta.style.height = `${Math.min(ta.scrollHeight + 2, Math.max(120, innerHeight * 0.46))}px` }
    fit()
    ta.focus({ preventScroll: true })
    ta.setSelectionRange(0, 0)
  }

  function showEmpty() {
    const c = ensureCard()
    c.status.replaceChildren()
    c.body.replaceChildren(h('div', { class: 'mm-stack' },
      h('div', { class: 'mm-empty' }, h('b', {}, 'No readable text found'), 'Try a tighter selection around the text.'),
      h('div', { class: 'acts' }, btn('primary', 'Try again', 'retry', () => openOverlay()), btn('ghost', 'Close', null, () => closeCard()))))
    c.el.focus({ preventScroll: true })
  }

  function showError(res) {
    const c = ensureCard()
    c.status.replaceChildren()
    const acts = h('div', { class: 'acts' })
    if (res.code === 'NO_KEY' || res.code === 'AUTH') acts.append(btn('primary', 'Open settings', null, () => MM.send('OPEN_HUB', { view: 'settings' })))
    if (res.code !== 'RELOAD') acts.append(btn(res.code === 'NO_KEY' ? '' : 'primary', 'Try again', 'retry', () => openOverlay()))
    acts.append(btn('ghost', 'Close', null, () => closeCard()))
    const message = res.code === 'NO_KEY' ? 'Add your Claude API key in Master Mind settings to capture text.' : (res.error || 'Something went wrong.')
    c.body.replaceChildren(h('div', { class: 'err' }, h('div', { class: 'mm-error', role: 'alert' }, message), acts))
    c.el.focus({ preventScroll: true })
  }

  function removeCard() {
    if (!card) return
    MM.shadow('ocr-card').layer.replaceChildren()
    card = null
  }

  /** User closed the card (or started over): stop any running request and drop the card. */
  function closeCard() {
    if (job?.loading) { seq++; MM.send('OCR_CANCEL') }
    job = null
    const hadFocus = !!card && !!MM.shadow('ocr-card').root.activeElement
    removeCard()
    if (hadFocus) restoreFocus()
  }

  function say(text, isError, action) {
    if (!card) return
    card.status.style.color = isError ? 'var(--mm-red)' : ''
    card.status.replaceChildren(h('span', {}, text), action || null)
  }

  function setLabel(button, label, iconName) { button.replaceChildren(icon(iconName), label) }
  function flash(button, label, iconName, back, backIcon) {
    setLabel(button, label, iconName)
    clearTimeout(button._t)
    button._t = setTimeout(() => setLabel(button, back, backIcon), 1600)
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch { /* not focused / not allowed: fall back to execCommand */ }
    const { layer } = MM.shadow('ocr-card')
    const tmp = h('textarea', { readonly: true, 'aria-hidden': 'true', style: 'position:fixed;left:-9999px;top:0;opacity:0' })
    tmp.value = text
    layer.appendChild(tmp)
    tmp.select()
    let ok = false
    try { ok = document.execCommand('copy') } catch { ok = false }
    tmp.remove()
    return ok
  }

  MM.on('MM_OCR_START', () => {
    if (ov) return { ok: true, already: true }
    openOverlay()
    return { ok: true }
  })

  MM.ocr = { start: openOverlay, cancel: cancelOverlay, isOpen: () => !!ov }
})()
