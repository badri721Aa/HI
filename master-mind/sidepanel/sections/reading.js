// Side panel → Tools → "Reading": Focus Reader, Bionic Reading, read-aloud controls and side-by-side translation.
// Drives content/reader.js through MM_READER, MM_BIONIC, MM_TTS and MM_READER_STATE, and mirrors the
// MM_TTS_EVENT / MM_READER_EVENT broadcasts coming from the tab the panel is following.
import { setSettings, onSettings } from '../../lib/store.js'

const LANGS = [
  'English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Dutch', 'Swedish', 'Norwegian', 'Danish', 'Finnish',
  'Polish', 'Czech', 'Romanian', 'Hungarian', 'Greek', 'Turkish', 'Russian', 'Ukrainian', 'Arabic', 'Hebrew', 'Persian',
  'Urdu', 'Hindi', 'Bengali', 'Tamil', 'Chinese (Simplified)', 'Chinese (Traditional)', 'Japanese', 'Korean', 'Vietnamese',
  'Thai', 'Indonesian', 'Malay', 'Filipino', 'Swahili',
]
const RATE_MIN = 0.5
const RATE_MAX = 3

const SVGNS = 'http://www.w3.org/2000/svg'
const ICONS = {
  book: ['M4 19.5V5.5A2.5 2.5 0 0 1 6.5 3H20v14H6.5A2.5 2.5 0 0 0 4 19.5z', 'M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5'],
  play: ['M7.5 5.2v13.6a.9.9 0 0 0 1.37.77l10.9-6.8a.9.9 0 0 0 0-1.54l-10.9-6.8A.9.9 0 0 0 7.5 5.2z'],
  pause: ['M8.5 5.5v13', 'M15.5 5.5v13'],
  stop: ['M7 7h10v10H7z'],
  globe: ['M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z', 'M3.6 9h16.8', 'M3.6 15h16.8', 'M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9c-2.5-2.6-3.7-5.6-3.7-9s1.2-6.4 3.7-9z'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
}

const STYLE = `
.rs{display:flex;flex-direction:column;gap:12px}
.rs-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
.rs-head h2{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:var(--mm-fg-2)}
.rs-badge{color:var(--mm-accent);background:color-mix(in srgb,var(--mm-accent) 12%,transparent)}
.rs-lead{margin:-4px 0 0;line-height:1.45}
.rs fieldset{border:0;margin:0;padding:0;min-width:0;display:flex;flex-direction:column;gap:12px}
.rs fieldset:disabled{opacity:.5}
.rs-open{width:100%;padding:10px 12px;font-size:13px}
.rs-switch{display:flex;flex-direction:column;gap:3px}
.rs-switch .mm-switch{font-weight:600}
.rs-help{margin:0 0 0 44px;line-height:1.4}
.rs .mm-divider{margin:2px 0}
.rs-sub{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:20px}
.rs-sub h3{font-size:11.5px;text-transform:uppercase;letter-spacing:.08em;color:var(--mm-fg-2)}
.rs-state{display:inline-flex;align-items:center;gap:7px;font-size:12px;color:var(--mm-muted);font-variant-numeric:tabular-nums}
.rs-state .mm-dot{--c:var(--mm-muted);box-shadow:none}
.rs-state[data-state="playing"]{color:var(--mm-fg-2)}
.rs-state[data-state="playing"] .mm-dot{--c:var(--mm-lime);box-shadow:0 0 8px var(--c);animation:rs-pulse 1.4s ease-in-out infinite}
.rs-state[data-state="paused"] .mm-dot{--c:var(--mm-amber);box-shadow:0 0 8px var(--c)}
@keyframes rs-pulse{50%{opacity:.35}}
.rs-tts{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.rs-tts .mm-btn{padding:9px 12px}
.rs-play[data-state="playing"],.rs-play[data-state="paused"]{border-color:color-mix(in srgb,var(--mm-accent) 55%,transparent);box-shadow:0 0 14px color-mix(in srgb,var(--mm-accent) 18%,transparent)}
.mm-icon.fill{fill:currentColor;stroke:none}
.rs-field{display:flex;flex-direction:column;gap:7px}
.rs-field-head{display:flex;align-items:baseline;justify-content:space-between}
.rs-field-head .mm-label{flex-direction:row}
.rs-val{font:600 12px/1 var(--mm-mono);color:var(--mm-fg)}
.rs-scale{position:relative;height:12px;font-size:10.5px;line-height:12px;color:var(--mm-muted);margin-top:-3px}
.rs-scale span{position:absolute;top:0;transform:translateX(-50%)}
.rs-scale span:first-child{transform:none}
.rs-scale span:last-child{transform:translateX(-100%)}
.rs-tr{display:flex;flex-wrap:wrap;gap:8px}
.rs-tr .mm-select{flex:1 1 130px;min-width:0}
.rs-tr .mm-btn{flex:1 1 auto}
.rs-note{display:flex;flex-direction:column;gap:4px;text-align:center;padding:14px 10px;border-radius:var(--mm-radius-sm);border:1px dashed var(--mm-border-strong);color:var(--mm-muted);font-size:12.5px}
.rs-note b{color:var(--mm-fg-2);font-size:13px}
.rs-msg{display:flex;align-items:flex-start;gap:8px}
.rs-msg .mm-error{flex:1}
.rs-msg:empty{display:none}
`

/** Element builder. Strings become text nodes. */
function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue
    if (k === 'class') el.className = v
    else if (k === 'text') el.textContent = v
    else el.setAttribute(k, v === true ? '' : String(v))
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c)
  return el
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
const clampRate = r => { const n = Number(r); return Number.isFinite(n) ? Math.min(RATE_MAX, Math.max(RATE_MIN, Math.round(n * 100) / 100)) : 1 }
const fmtRate = r => `${clampRate(r).toFixed(2).replace(/0$/, '')}×`

function friendly(e) {
  const m = String(e?.message || e || '')
  if (/Cannot access|cannot be scripted|chrome-extension:|webstore|extensions gallery|Receiving end|Could not establish|No active tab|No tab with id|Frame with ID/i.test(m)) {
    return 'Master Mind can’t reach this page. Reload the page and try again.'
  }
  return m || 'Something went wrong.'
}

export function mount(root, ctx) {
  if (!document.getElementById('mm-rs-style')) {
    document.head.appendChild(h('style', { id: 'mm-rs-style' }, STYLE))
  }
  root.classList.add('rs')
  root.setAttribute('aria-labelledby', 'rs-title')

  const S = {
    open: false, bionic: false, translate: '', reachable: true, why: '',
    tts: { state: 'stopped', rate: clampRate(ctx.settings.ttsRate ?? 1), index: -1, total: 0, error: null },
  }
  let rate = S.tts.rate
  let dragging = false
  let rateTimer = 0
  let syncSeq = 0

  // ───────── DOM ─────────
  const badge = h('span', { class: 'mm-badge rs-badge', hidden: true }, 'Reader open')
  const openLabel = h('span', {}, 'Open Focus Reader')
  const openBtn = h('button', { type: 'button', class: 'mm-btn primary rs-open' }, icon('book'), openLabel)
  const bionic = h('input', { type: 'checkbox', role: 'switch', 'aria-describedby': 'rs-bionic-help' })
  const bionicRow = h('div', { class: 'rs-switch' },
    h('label', { class: 'mm-switch' }, bionic, h('span'), 'Bionic reading'),
    h('p', { class: 'rs-help mm-muted mm-small', id: 'rs-bionic-help' }, 'Bolds the start of every word so your eyes glide through the text. Also applies inside the reader.'))

  const stateDot = h('span', { class: 'mm-dot' })
  const stateText = h('span', {}, 'Stopped')
  const stateEl = h('span', { class: 'rs-state', 'data-state': 'stopped', role: 'status', 'aria-live': 'polite' }, stateDot, stateText)
  const playLabel = h('span', {}, 'Play')
  const playBtn = h('button', { type: 'button', class: 'mm-btn rs-play', 'data-state': 'stopped' }, icon('play', true), playLabel)
  const stopBtn = h('button', { type: 'button', class: 'mm-btn rs-stop', disabled: true }, icon('stop', true), 'Stop')
  const rateOut = h('output', { class: 'rs-val', for: 'rs-rate' }, fmtRate(rate))
  const rateIn = h('input', { type: 'range', class: 'mm-range', id: 'rs-rate', min: RATE_MIN, max: RATE_MAX, step: 0.05, value: rate, 'aria-valuetext': fmtRate(rate) })
  const voiceSel = h('select', { class: 'mm-select', id: 'rs-voice' })
  const langSel = h('select', { class: 'mm-select', id: 'rs-lang', 'aria-label': 'Translate into' })
  const trBtn = h('button', { type: 'button', class: 'mm-btn rs-trbtn' }, icon('globe'), 'Side-by-side translation')
  const msg = h('div', { class: 'rs-msg', 'aria-live': 'polite' })
  const note = h('div', { class: 'rs-note', hidden: true })

  const fields = h('fieldset', {},
    openBtn,
    bionicRow,
    h('hr', { class: 'mm-divider' }),
    h('div', { class: 'rs-sub' }, h('h3', {}, 'Read aloud'), stateEl),
    h('div', { class: 'rs-tts' }, playBtn, stopBtn),
    h('div', { class: 'rs-field' },
      h('div', { class: 'rs-field-head' }, h('label', { class: 'mm-label', for: 'rs-rate' }, 'Speed'), rateOut),
      rateIn,
      h('div', { class: 'rs-scale', 'aria-hidden': 'true' }, h('span', {}, '0.5×'), h('span', {}, '1×'), h('span', {}, '2×'), h('span', {}, '3×'))),
    h('label', { class: 'mm-label', for: 'rs-voice' }, 'Voice', voiceSel),
    h('hr', { class: 'mm-divider' }),
    h('div', { class: 'rs-sub' }, h('h3', { id: 'rs-tr-title' }, 'Translate')),
    h('div', { class: 'rs-tr', role: 'group', 'aria-labelledby': 'rs-tr-title' }, langSel, trBtn))

  root.replaceChildren(
    h('div', { class: 'rs-head' }, h('h2', { id: 'rs-title' }, 'Reading'), badge),
    h('p', { class: 'rs-lead mm-muted mm-small' }, 'Distraction-free reading, bionic focus, read-aloud and side-by-side translation for this page.'),
    note, fields, msg)
  // Scale ticks sit under the slider at their real positions (the thumb is ~16px wide).
  for (const [i, v] of [0.5, 1, 2, 3].entries()) {
    const pct = ((v - RATE_MIN) / (RATE_MAX - RATE_MIN)) * 100
    // First and last labels sit flush with the track ends instead of centered on the thumb.
    const edge = i === 0 ? '0px' : i === 3 ? '0px' : `${((0.5 - pct / 100) * 16).toFixed(2)}px`
    fields.querySelector('.rs-scale').children[i].style.left = `calc(${pct}% + ${edge})`
  }

  // Languages: settings.translateTo first-class even if it's not in our list.
  function fillLangs(want = ctx.settings.translateTo || 'English') {
    const list = LANGS.includes(want) ? LANGS : [want, ...LANGS]
    langSel.replaceChildren(...list.map(l => new Option(l, l)))
    langSel.value = want
  }
  fillLangs()

  // Voices come from the same speech engine the page uses; voiceURI identifies them in both places.
  function fillVoices(cur = ctx.settings.ttsVoice || '') {
    const synth = globalThis.speechSynthesis
    const voices = synth ? synth.getVoices() : []
    let names = null
    try { names = new Intl.DisplayNames([navigator.language || 'en'], { type: 'language' }) } catch { /* old engine */ }
    const langName = tag => { try { return names?.of(String(tag).replace('_', '-')) || tag } catch { return tag || 'Other' } }
    const pageBase = String(ctx.page?.lang || navigator.language || 'en').toLowerCase().split(/[-_]/)[0]
    const groups = new Map()
    for (const v of voices) {
      const key = langName(v.lang || 'und')
      if (!groups.has(key)) groups.set(key, { base: String(v.lang || '').toLowerCase().split(/[-_]/)[0], voices: [] })
      groups.get(key).voices.push(v)
    }
    const ordered = [...groups.entries()].sort(([a, ga], [b, gb]) => (ga.base === pageBase ? 0 : 1) - (gb.base === pageBase ? 0 : 1) || a.localeCompare(b))
    const opts = [new Option(voices.length ? 'Auto · best voice for the page language' : 'System default voice', '')]
    for (const [label, g] of ordered) {
      const og = document.createElement('optgroup')
      og.label = label
      for (const v of g.voices.sort((a, b) => a.name.localeCompare(b.name))) og.append(new Option(`${v.name}${v.localService ? '' : ' · online'}`, v.voiceURI))
      opts.push(og)
    }
    if (cur && !voices.some(v => v.voiceURI === cur)) opts.push(new Option('Saved voice (not available on this device)', cur))
    voiceSel.replaceChildren(...opts)
    voiceSel.value = cur
  }
  fillVoices()
  globalThis.speechSynthesis?.addEventListener?.('voiceschanged', () => fillVoices(voiceSel.value))

  // ───────── rendering ─────────
  const restricted = () => !ctx.tab?.id || !/^(https?|file):/i.test(ctx.tab.url || '')

  function render() {
    const blocked = restricted() || !S.reachable
    fields.disabled = blocked
    note.hidden = !blocked
    if (blocked) {
      note.replaceChildren(h('b', {}, 'Not available on this page'),
        restricted() ? 'Reading tools work on regular web pages. Chrome protects this one from extensions.' : S.why || 'Master Mind can’t reach this page. Reload the page and try again.')
    }
    badge.hidden = !S.open || blocked
    openLabel.textContent = S.open ? 'Close Focus Reader' : 'Open Focus Reader'
    openBtn.classList.toggle('primary', !S.open)
    openBtn.setAttribute('aria-pressed', String(S.open))
    bionic.checked = S.bionic

    const { state, index, total } = S.tts
    stateEl.dataset.state = state
    const where = index >= 0 && total ? ` · paragraph ${index + 1} of ${total}` : ''
    stateText.textContent = state === 'playing' ? `Reading${where}` : state === 'paused' ? `Paused${where}` : 'Stopped'
    playBtn.dataset.state = state
    playBtn.replaceChildren(icon(state === 'playing' ? 'pause' : 'play', state !== 'playing'), playLabel)
    playLabel.textContent = state === 'playing' ? 'Pause' : state === 'paused' ? 'Resume' : 'Play'
    playBtn.setAttribute('aria-label', state === 'playing' ? 'Pause reading aloud' : state === 'paused' ? 'Resume reading aloud' : 'Read this page aloud')
    stopBtn.disabled = state === 'stopped'
    if (!dragging) setRateUi(S.tts.rate ?? rate)
  }

  function setRateUi(r) {
    rate = clampRate(r)
    rateIn.value = String(rate)
    rateOut.textContent = fmtRate(rate)
    rateIn.setAttribute('aria-valuetext', fmtRate(rate))
  }

  function showMsg(text, { error = true } = {}) {
    msg.replaceChildren()
    if (!text) return
    const box = h('div', { class: error ? 'mm-error' : 'mm-muted mm-small' }, text)
    const x = h('button', { type: 'button', class: 'mm-btn ghost icon sm', 'aria-label': 'Dismiss message' }, icon('close'))
    x.addEventListener('click', () => msg.replaceChildren())
    msg.append(box, x)
  }

  function showError(err) {
    msg.replaceChildren()
    if (err?.code === 'NO_KEY') { msg.append(ctx.errorBox(err)); return }
    showMsg(friendly(err))
  }

  // ───────── talking to the tab ─────────
  async function act(btn, type, data) {
    const tabId = ctx.tab?.id
    if (btn) { btn.disabled = true; btn.setAttribute('aria-busy', 'true') }
    try {
      const r = await ctx.sendToTab(type, data)
      if (ctx.tab?.id !== tabId) return null // the panel moved to another tab meanwhile
      if (!r) throw new Error('No response from the page.')
      S.reachable = true
      if (r.ok === false && r.error) showMsg(r.error)
      else msg.replaceChildren()
      return r
    } catch (e) {
      showError(e)
      return null
    } finally {
      if (btn) { btn.removeAttribute('aria-busy'); btn.disabled = false }
      render()
    }
  }

  async function sync() {
    const seq = ++syncSeq
    if (restricted()) { render(); return }
    try {
      const r = await ctx.sendToTab('MM_READER_STATE')
      if (seq !== syncSeq) return
      if (r?.ok) {
        S.open = !!r.open
        S.bionic = !!r.bionic
        S.translate = r.translate || ''
        S.tts = { ...S.tts, ...r.tts }
      }
      S.reachable = true
      S.why = ''
    } catch (e) {
      if (seq !== syncSeq) return
      S.reachable = false
      S.why = friendly(e)
    }
    render()
  }

  // ───────── events ─────────
  openBtn.addEventListener('click', async () => {
    const r = await act(openBtn, 'MM_READER', { action: S.open ? 'close' : 'open' })
    if (r?.ok) { S.open = !!r.open; render() }
  })

  bionic.addEventListener('change', async () => {
    const want = bionic.checked
    bionic.disabled = true
    const r = await act(null, 'MM_BIONIC', { on: want })
    bionic.disabled = false
    S.bionic = r?.ok ? !!r.on : !want
    render()
  })

  playBtn.addEventListener('click', async () => {
    const st = S.tts.state
    const action = st === 'playing' ? 'pause' : st === 'paused' ? 'resume' : 'play'
    const r = await act(playBtn, 'MM_TTS', action === 'pause' ? { action } : { action, rate })
    if (r?.state) { S.tts = { ...S.tts, state: r.state }; render() }
  })

  stopBtn.addEventListener('click', async () => {
    const r = await act(stopBtn, 'MM_TTS', { action: 'stop' })
    if (r?.state) { S.tts = { ...S.tts, state: r.state, index: -1 }; render() }
  })

  // The content script applies a new rate live when settings.ttsRate changes, in every tab.
  rateIn.addEventListener('input', () => {
    dragging = true
    setRateUi(rateIn.value)
    clearTimeout(rateTimer)
    rateTimer = setTimeout(() => {
      dragging = false
      setSettings({ ttsRate: rate }).catch(e => showError(e))
    }, 300)
  })

  voiceSel.addEventListener('change', () => {
    setSettings({ ttsVoice: voiceSel.value }).catch(e => showError(e))
  })

  langSel.addEventListener('change', () => {
    setSettings({ translateTo: langSel.value }).catch(e => showError(e))
  })

  trBtn.addEventListener('click', async () => {
    const lang = langSel.value
    const r = await act(trBtn, 'MM_READER', { action: 'open', translate: lang })
    if (r?.ok) {
      S.open = !!r.open
      S.translate = lang
      render()
      ctx.toast(`Translating into ${lang} in the Focus Reader`)
    }
  })

  // Live state from the page this panel follows.
  chrome.runtime.onMessage.addListener((m, sender) => {
    if (!m || sender?.tab?.id == null || sender.tab.id !== ctx.tab?.id) return
    if (m.type === 'MM_TTS_EVENT') {
      S.tts = { state: m.state || 'stopped', rate: m.rate ?? S.tts.rate, index: m.index ?? -1, total: m.total ?? 0, error: m.error || null }
      if (m.error) showMsg(m.error)
      else if (m.state === 'playing') msg.replaceChildren()
      render()
    } else if (m.type === 'MM_READER_EVENT') {
      S.open = !!m.open
      S.bionic = !!m.bionic
      S.translate = m.translate || ''
      render()
    }
  })

  // A reload of the same URL doesn't trigger onPage; re-read the state once the new document is ready.
  chrome.tabs.onUpdated.addListener((tabId, info) => {
    if (tabId === ctx.tab?.id && info.status === 'complete') sync()
  })

  onSettings(s => {
    if (!dragging && clampRate(s.ttsRate ?? 1) !== rate) { S.tts = { ...S.tts, rate: clampRate(s.ttsRate ?? 1) }; render() }
    if ((s.ttsVoice || '') !== voiceSel.value) fillVoices(s.ttsVoice || '')
    if (s.translateTo && s.translateTo !== langSel.value) fillLangs(s.translateTo)
  })

  render()
  sync()
  return {
    onShow() { sync() },
    onPage() {
      S.tts = { ...S.tts, state: 'stopped', index: -1, total: 0, error: null }
      msg.replaceChildren()
      fillVoices(voiceSel.value)
      sync()
    },
  }
}
