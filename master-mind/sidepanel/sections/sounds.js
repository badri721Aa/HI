// Side panel → Tools → "Ambient Soundscapes": a live mixer for the offscreen audio engine.
// Talks to bg/sounds.js through SOUND_SET / SOUND_STOP / SOUND_STATE and mirrors chrome.storage.local.soundMix,
// so every open panel shows the same mix.

const CHANNELS = [
  { id: 'rain', label: 'Rain', color: 'var(--mm-cyan)', icon: ['M7 15.5a4.5 4.5 0 0 1-.5-8.97A5.5 5.5 0 0 1 17.2 8a3.75 3.75 0 0 1 .3 7.48', 'M8.5 18.5l-1 2', 'M12.5 18.5l-1 2', 'M16.5 18.5l-1 2'] },
  { id: 'waves', label: 'Ocean waves', color: '#60A5FA', icon: ['M2.5 9.5c1.6 0 2.4-1.8 4.75-1.8S10.4 9.5 12 9.5s2.4-1.8 4.75-1.8 3.15 1.8 4.75 1.8', 'M2.5 15.5c1.6 0 2.4-1.8 4.75-1.8s3.15 1.8 4.75 1.8 2.4-1.8 4.75-1.8 3.15 1.8 4.75 1.8'] },
  { id: 'brown', label: 'Brown noise', color: 'var(--mm-amber)', icon: ['M3 12c2.2-5.5 4.3-5.5 6.5 0s4.3 5.5 6.5 0 3.3-4 5-2'] },
  { id: 'pink', label: 'Pink noise', color: 'var(--mm-pink)', icon: ['M3 12c1.1-3.2 2.2-3.2 3.3 0s2.2 3.2 3.3 0 2.2-3.2 3.3 0 2.2 3.2 3.3 0 2.2-3.2 3.3 0 1.4 2 2 1'] },
  { id: 'white', label: 'White noise', color: '#E2E8F0', icon: ['M3 12l1.6-4 1.8 8 1.8-10 1.8 9 1.8-6 1.8 8 1.8-9 1.8 7 1.8-4 1.5 1'] },
  { id: 'hum', label: 'Low hum', color: 'var(--mm-lime)', icon: ['M12 10a2 2 0 1 0 0 4a2 2 0 1 0 0-4z', 'M8.2 8.2a5.4 5.4 0 0 0 0 7.6', 'M15.8 8.2a5.4 5.4 0 0 1 0 7.6', 'M5.3 5.3a9.5 9.5 0 0 0 0 13.4', 'M18.7 5.3a9.5 9.5 0 0 1 0 13.4'] },
]
const PRESETS = [
  { id: 'focus', label: 'Deep Focus', mix: { brown: 0.6, hum: 0.35 } },
  { id: 'rainy', label: 'Rainy Window', mix: { rain: 0.7, pink: 0.25 } },
  { id: 'ocean', label: 'Ocean Calm', mix: { waves: 0.7, pink: 0.2 } },
  { id: 'library', label: 'Library', mix: { pink: 0.35 } },
]
const ICONS = {
  volume: ['M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z', 'M15.5 9a4.2 4.2 0 0 1 0 6', 'M18.2 6.5a8 8 0 0 1 0 11'],
  play: ['M8 5.5v13l10.5-6.5z'],
  stop: ['M7 7h10v10H7z'],
  spark: ['M12 3v4', 'M12 17v4', 'M3 12h4', 'M17 12h4', 'M6 6l2.5 2.5', 'M15.5 15.5L18 18', 'M18 6l-2.5 2.5', 'M8.5 15.5L6 18'],
}
const SVGNS = 'http://www.w3.org/2000/svg'
const zeroMix = () => Object.fromEntries(CHANNELS.map(c => [c.id, 0]))

const STYLE = `
.snd{display:flex;flex-direction:column;gap:13px}
.snd-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
.snd-head h2{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:var(--mm-fg-2)}
.snd-state{display:inline-flex;align-items:center;gap:7px}
.snd-state .bars{display:none;align-items:flex-end;gap:2px;height:10px}
.snd-state .bars i{width:2px;border-radius:2px;background:var(--mm-lime);box-shadow:0 0 6px var(--mm-lime);animation:snd-eq 1s ease-in-out infinite}
.snd-state .bars i:nth-child(1){height:5px;animation-delay:-.2s}.snd-state .bars i:nth-child(2){height:9px;animation-delay:-.6s}.snd-state .bars i:nth-child(3){height:6px;animation-delay:-.4s}
@keyframes snd-eq{50%{transform:scaleY(.35)}}
.snd[data-playing="true"] .snd-state .bars{display:inline-flex}
.snd[data-playing="true"] .snd-state .mm-badge{color:var(--mm-lime);background:color-mix(in srgb,var(--mm-lime) 12%,transparent)}
.snd-lead{margin:-5px 0 0;line-height:1.45}
.snd-presets{display:grid;grid-template-columns:repeat(auto-fit,minmax(138px,1fr));gap:7px}
.snd-presets .mm-chip{justify-content:center;padding:8px 10px}
.snd-presets .dots{display:inline-flex;gap:3px}
.snd-presets .dots i{width:6px;height:6px;border-radius:50%;background:var(--c);box-shadow:0 0 6px color-mix(in srgb,var(--c) 60%,transparent)}
.snd-presets .mm-chip[aria-pressed="true"] .dots i{box-shadow:0 0 0 1.5px rgba(6,8,13,.55)}
.snd fieldset{border:0;margin:0;padding:0;min-width:0;display:flex;flex-direction:column;gap:13px}
.snd fieldset:disabled{opacity:.55}
.snd-mixer{display:flex;flex-direction:column;gap:4px;padding:8px 10px;border-radius:12px;background:rgba(0,0,0,.22);border:1px solid var(--mm-border)}
.snd-row{display:grid;grid-template-columns:26px minmax(78px,96px) 1fr 38px;align-items:center;gap:9px;min-height:32px}
.snd-row .ico{width:26px;height:26px;border-radius:8px;display:grid;place-items:center;color:var(--c);background:color-mix(in srgb,var(--c) 10%,transparent);border:1px solid color-mix(in srgb,var(--c) 22%,transparent);transition:box-shadow .2s,background .2s}
.snd-row .ico .mm-icon{width:15px;height:15px}
.snd-row[data-on="true"] .ico{background:color-mix(in srgb,var(--c) 18%,transparent);box-shadow:0 0 12px color-mix(in srgb,var(--c) 30%,transparent)}
.snd-row label{font-size:12.5px;font-weight:600;color:var(--mm-fg-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.snd-row[data-on="true"] label{color:var(--mm-fg)}
.snd-row output{font:600 11.5px/1 var(--mm-mono);color:var(--mm-muted);text-align:right;font-variant-numeric:tabular-nums}
.snd-row[data-on="true"] output{color:var(--mm-fg)}
.snd-master{padding:2px 10px 0}
.snd-master .ico{--c:var(--mm-accent)}
.snd-range{-webkit-appearance:none;appearance:none;width:100%;height:20px;margin:0;background:transparent;cursor:pointer;--p:0%}
.snd-range::-webkit-slider-runnable-track{height:4px;border-radius:99px;background:linear-gradient(90deg,var(--c) 0,var(--c) var(--p),rgba(255,255,255,.1) var(--p))}
.snd-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:14px;height:14px;margin-top:-5px;border-radius:50%;background:#fff;border:0;box-shadow:0 0 0 3px color-mix(in srgb,var(--c) 35%,transparent),0 0 10px color-mix(in srgb,var(--c) 70%,transparent);transition:transform .12s}
.snd-range:active::-webkit-slider-thumb{transform:scale(1.15)}
.snd-range:focus-visible{outline:2px solid var(--mm-accent);outline-offset:2px;border-radius:6px}
.snd-play{width:100%;padding:10px 12px;font-size:13px}
.snd-play .mm-icon.fill{fill:currentColor;stroke:none}
.snd-note{display:flex;gap:8px;align-items:flex-start;margin:0;line-height:1.45}
.snd-note .mm-icon{width:14px;height:14px;margin-top:2px;color:var(--mm-accent)}
.snd-msg:empty{display:none}
`

function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue
    if (k === 'class') el.className = v
    else if (k === 'text') el.textContent = v
    else if (k === 'style') el.style.cssText = v
    else el.setAttribute(k, v === true ? '' : String(v))
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c)
  return el
}
function icon(paths, fill = false) {
  const s = document.createElementNS(SVGNS, 'svg')
  s.setAttribute('viewBox', '0 0 24 24')
  s.setAttribute('aria-hidden', 'true')
  s.setAttribute('class', fill ? 'mm-icon fill' : 'mm-icon')
  for (const d of paths) {
    const p = document.createElementNS(SVGNS, 'path')
    p.setAttribute('d', d)
    s.appendChild(p)
  }
  return s
}
const pct = v => Math.round(v * 100)

export function mount(root, ctx) {
  if (!document.getElementById('mm-snd-style')) document.head.appendChild(h('style', { id: 'mm-snd-style' }, STYLE))
  root.classList.add('snd')
  root.setAttribute('aria-labelledby', 'snd-title')

  const S = { mix: zeroMix(), master: 0.7, playing: false, loaded: false }
  let dragging = false
  let alive = true

  // ───────── DOM ─────────
  const badge = h('span', { class: 'mm-badge' }, 'Off')
  const stateEl = h('span', { class: 'snd-state', role: 'status', 'aria-live': 'polite' }, h('span', { class: 'bars', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')), badge)
  const colorOf = id => CHANNELS.find(c => c.id === id).color
  const presetBtns = PRESETS.map(p => h('button', { type: 'button', class: 'mm-chip', 'aria-pressed': 'false', 'data-preset': p.id, title: `${p.label}: ${Object.keys(p.mix).map(id => CHANNELS.find(c => c.id === id).label.toLowerCase()).join(' + ')}` },
    h('span', { class: 'dots', 'aria-hidden': 'true' }, Object.keys(p.mix).map(id => h('i', { style: `--c:${colorOf(id)}` }))), p.label))
  const rows = {}
  const mixer = h('div', { class: 'snd-mixer', role: 'group', 'aria-label': 'Sound channels' })
  for (const c of CHANNELS) {
    const id = `snd-${c.id}`
    const input = h('input', { type: 'range', class: 'snd-range', id, min: 0, max: 100, step: 1, value: 0, 'data-channel': c.id })
    const out = h('output', { for: id }, '0%')
    const row = h('div', { class: 'snd-row', 'data-on': 'false', style: `--c:${c.color}` },
      h('span', { class: 'ico' }, icon(c.icon)), h('label', { for: id }, c.label), input, out)
    rows[c.id] = { row, input, out }
    mixer.appendChild(row)
  }
  const masterIn = h('input', { type: 'range', class: 'snd-range', id: 'snd-master', min: 0, max: 100, step: 1, value: 70 })
  const masterOut = h('output', { for: 'snd-master' }, '70%')
  const masterRow = h('div', { class: 'snd-row snd-master', style: '--c:var(--mm-accent)', 'data-on': 'true' },
    h('span', { class: 'ico' }, icon(ICONS.volume)), h('label', { for: 'snd-master' }, 'Master volume'), masterIn, masterOut)
  const playLabel = h('span', {}, 'Play')
  const playIcon = h('span', { style: 'display:contents' }, icon(ICONS.play, true))
  const playBtn = h('button', { type: 'button', class: 'mm-btn primary snd-play', 'aria-pressed': 'false' }, playIcon, playLabel)
  const fieldset = h('fieldset', { disabled: true, 'aria-busy': 'true' },
    h('div', { class: 'snd-presets', role: 'group', 'aria-label': 'Presets' }, presetBtns),
    mixer, masterRow, playBtn)
  const msg = h('div', { class: 'snd-msg', 'aria-live': 'polite' })

  root.replaceChildren(
    h('div', { class: 'snd-head' }, h('h2', { id: 'snd-title' }, 'Ambient Soundscapes'), stateEl),
    h('p', { class: 'snd-lead mm-muted mm-small' }, 'Mix a soundscape that helps you focus. It keeps playing while you browse.'),
    fieldset,
    msg,
    h('p', { class: 'snd-note mm-muted mm-small' }, icon(ICONS.spark), 'Every sound is generated live on your device with the Web Audio API. No audio files, nothing streamed.'))

  // ───────── render ─────────
  function setRange(input, out, v) {
    input.value = String(pct(v))
    input.style.setProperty('--p', `${pct(v)}%`)
    input.setAttribute('aria-valuetext', `${pct(v)} percent`)
    out.textContent = `${pct(v)}%`
  }
  function activePreset() {
    return PRESETS.find(p => CHANNELS.every(c => Math.abs((p.mix[c.id] || 0) - S.mix[c.id]) < 0.005))?.id || null
  }
  function renderStatus() {
    const preset = activePreset()
    for (const b of presetBtns) b.setAttribute('aria-pressed', String(S.playing && b.dataset.preset === preset))
    root.dataset.playing = String(S.playing)
    badge.textContent = S.playing ? 'Playing' : 'Off'
    playLabel.textContent = S.playing ? 'Stop' : 'Play'
    playIcon.replaceChildren(icon(S.playing ? ICONS.stop : ICONS.play, true))
    playBtn.className = `mm-btn snd-play ${S.playing ? '' : 'primary'}`
    playBtn.setAttribute('aria-pressed', String(S.playing))
    playBtn.setAttribute('aria-label', S.playing ? 'Stop soundscape' : 'Play soundscape')
    fieldset.disabled = !S.loaded
    fieldset.setAttribute('aria-busy', String(!S.loaded))
  }
  function render() {
    for (const c of CHANNELS) {
      const r = rows[c.id]
      setRange(r.input, r.out, S.mix[c.id])
      r.row.dataset.on = String(S.mix[c.id] > 0)
    }
    setRange(masterIn, masterOut, S.master)
    renderStatus()
  }
  function showError(e) {
    msg.replaceChildren(ctx.errorBox({ message: `Sound engine: ${e?.message || e}` }))
  }
  function adopt(res) {
    for (const c of CHANNELS) S.mix[c.id] = Number(res.mix?.[c.id]) || 0
    if (Number.isFinite(Number(res.master))) S.master = Number(res.master)
    S.playing = !!res.playing
  }

  // ───────── actions ─────────
  /**
   * Message bg/sounds.js. Live slider pushes keep the local sliders as the source of truth and only take
   * `playing` from the answer, so a slow reply can't yank a slider back mid-drag.
   */
  async function send(type, data = {}, { live = false } = {}) {
    try {
      const res = await chrome.runtime.sendMessage({ type, ...data })
      if (!alive) return
      if (!res?.ok) throw new Error(res?.error || 'No response from Master Mind.')
      msg.replaceChildren()
      if (live) S.playing = !!res.playing
      else adopt(res)
    } catch (e) {
      if (!alive) return
      showError(e)
      S.playing = false
    }
    if (live) renderStatus()
    else render()
  }
  const apply = (live = false) => send('SOUND_SET', { mix: { ...S.mix }, master: S.master }, { live })

  // Leading + trailing throttle so dragging feels live without flooding the service worker.
  let pending = false
  let inflight = null
  async function pushLive() {
    if (inflight) { pending = true; return }
    inflight = apply(true)
    await inflight
    await new Promise(r => setTimeout(r, 70))
    inflight = null
    if (pending) { pending = false; pushLive() }
  }

  async function refresh() {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'SOUND_STATE' })
      if (!alive || dragging || inflight) return
      if (!res?.ok) throw new Error(res?.error || 'No response from Master Mind.')
      adopt(res)
      msg.replaceChildren()
    } catch (e) {
      if (alive) showError(e)
    }
    if (!alive) return
    S.loaded = true
    render()
  }

  for (const c of CHANNELS) {
    const { input, out, row } = rows[c.id]
    input.addEventListener('input', () => {
      S.mix[c.id] = Number(input.value) / 100
      setRange(input, out, S.mix[c.id])
      row.dataset.on = String(S.mix[c.id] > 0)
      // Moving a channel up starts the soundscape; with every channel at zero the engine stops itself.
      if (S.playing || S.mix[c.id] > 0) {
        S.playing = CHANNELS.some(x => S.mix[x.id] > 0)
        pushLive()
      }
      renderStatus()
    })
  }
  masterIn.addEventListener('input', () => {
    S.master = Number(masterIn.value) / 100
    setRange(masterIn, masterOut, S.master)
    if (S.playing) pushLive()
  })
  for (const input of [...Object.values(rows).map(r => r.input), masterIn]) {
    input.addEventListener('pointerdown', () => { dragging = true })
    input.addEventListener('change', () => { dragging = false })
  }
  const onPointerUp = () => { dragging = false }
  addEventListener('pointerup', onPointerUp)

  for (const b of presetBtns) {
    b.addEventListener('click', () => {
      const p = PRESETS.find(x => x.id === b.dataset.preset)
      if (S.playing && activePreset() === p.id) {
        S.playing = false
        renderStatus()
        return send('SOUND_STOP')
      }
      S.mix = { ...zeroMix(), ...p.mix }
      if (S.master <= 0) S.master = 0.5
      S.playing = true
      render()
      apply()
    })
  }

  playBtn.addEventListener('click', () => {
    if (S.playing) {
      S.playing = false
      renderStatus()
      return send('SOUND_STOP')
    }
    if (!CHANNELS.some(c => S.mix[c.id] > 0)) S.mix = { ...zeroMix(), ...PRESETS[0].mix }
    if (S.master <= 0) S.master = 0.5
    S.playing = true
    render()
    apply()
  })

  // Other panels (or windows) changing the mix. bg/sounds.js writes storage before it answers, so echoes of our
  // own live pushes arrive while `inflight` is set and are skipped; anything else is adopted.
  const onStorage = (changes, area) => {
    if (area !== 'local' || !changes.soundMix || dragging || inflight) return
    const v = changes.soundMix.newValue
    if (!v) return
    for (const c of CHANNELS) S.mix[c.id] = Number(v.mix?.[c.id]) || 0
    if (Number.isFinite(Number(v.master))) S.master = Number(v.master)
    S.playing = !!v.playing
    render()
  }
  chrome.storage.onChanged.addListener(onStorage)
  // Chrome closes an audio document that stays silent for 30 s (e.g. master at 0 %); re-check while playing
  // so the panel never claims to play when it doesn't. SOUND_STATE also repairs the stored state.
  const poll = setInterval(() => {
    if (S.playing && !document.hidden && !root.closest('[hidden]') && !dragging && !inflight) refresh()
  }, 10000)
  addEventListener('pagehide', () => {
    alive = false
    clearInterval(poll)
    chrome.storage.onChanged.removeListener(onStorage)
    removeEventListener('pointerup', onPointerUp)
  }, { once: true })

  render()
  refresh()

  return {
    onShow() { if (S.loaded && !dragging && !inflight) refresh() },
  }
}
