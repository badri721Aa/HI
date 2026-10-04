// Ambient Soundscapes, service-worker side.
// The audio graph lives in an offscreen document (offscreen.html/js): the service worker has no Web Audio.
//   SOUND_SET   {mix: {rain, pink, brown, white, hum, waves} (0..1), master: 0..1} → creates the document if needed
//               and applies the mix → {ok, playing, mix, master}
//   SOUND_STOP  → fades out and closes the document → {ok}
//   SOUND_STATE → {ok, playing, mix, master, level?} (level = K-weighted output level in dB while playing)
// Messages forwarded to the document carry target: 'offscreen' so every other listener ignores them.
// The mix persists in chrome.storage.local.soundMix = {mix, master, playing, updated}; panels watch it to stay in sync.

export const CHANNELS = ['rain', 'waves', 'brown', 'pink', 'white', 'hum']
const DOC = 'offscreen.html'
const DEFAULT = { mix: Object.fromEntries(CHANNELS.map(c => [c, 0])), master: 0.7, playing: false }

const clamp01 = v => (Number.isFinite(Number(v)) ? Math.min(1, Math.max(0, Number(v))) : null)
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function loadMix() {
  const { soundMix } = await chrome.storage.local.get('soundMix')
  const mix = { ...DEFAULT.mix }
  for (const c of CHANNELS) mix[c] = clamp01(soundMix?.mix?.[c]) ?? 0
  return { mix, master: clamp01(soundMix?.master) ?? DEFAULT.master, playing: !!soundMix?.playing }
}

async function saveMix({ mix, master, playing }) {
  await chrome.storage.local.set({ soundMix: { mix, master, playing, updated: Date.now() } })
}

async function hasDocument() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(DOC)],
  })
  return contexts.length > 0
}

let creating = null
async function ensureDocument() {
  if (await hasDocument()) return
  creating ??= chrome.offscreen.createDocument({
    url: DOC,
    reasons: ['AUDIO_PLAYBACK'],
    justification: 'Plays the ambient focus soundscapes (rain, noise, hum, waves) that Master Mind synthesizes live with the Web Audio API.',
  }).catch(e => {
    if (!/single offscreen document|already exists/i.test(String(e?.message))) throw e
  }).finally(() => { creating = null })
  await creating
}

/** Send to the offscreen document, retrying while its script is still starting. */
async function toDocument(type, data = {}) {
  for (let i = 0; ; i++) {
    try {
      const res = await chrome.runtime.sendMessage({ target: 'offscreen', type, ...data })
      if (res) return res
      throw new Error('No response from the audio engine.')
    } catch (e) {
      if (i >= 8 || !/Receiving end does not exist|No response|message port closed/i.test(String(e?.message))) throw e
      await sleep(60 * (i + 1))
    }
  }
}

// Serialize operations so a STOP never races a SET (e.g. while a slider is being dragged).
let chain = Promise.resolve()
const serial = fn => {
  const run = chain.then(fn, fn)
  chain = run.catch(() => {})
  return run
}

async function closeDocument() {
  if (await hasDocument()) await chrome.offscreen.closeDocument().catch(() => {})
}

async function set(msg) {
  const prev = await loadMix()
  const mix = { ...prev.mix }
  for (const c of CHANNELS) {
    const v = clamp01(msg?.mix?.[c])
    if (v != null) mix[c] = v
  }
  const master = clamp01(msg?.master) ?? prev.master
  if (!CHANNELS.some(c => mix[c] > 0)) {
    // Nothing audible: stop and remember the (silent) mix.
    if (await hasDocument()) await toDocument('SOUND_STOP').catch(() => {})
    await closeDocument()
    await saveMix({ mix, master, playing: false })
    return { ok: true, playing: false, mix, master }
  }
  await ensureDocument()
  const res = await toDocument('SOUND_SET', { mix, master })
  if (!res?.ok) throw new Error(res?.error || 'The audio engine failed to start.')
  await saveMix({ mix, master, playing: true })
  return { ok: true, playing: true, mix, master, audio: res.audio }
}

async function stop() {
  const prev = await loadMix()
  if (await hasDocument()) await toDocument('SOUND_STOP').catch(() => {})
  await closeDocument()
  await saveMix({ ...prev, playing: false })
  return { ok: true, playing: false, mix: prev.mix, master: prev.master }
}

async function state() {
  const saved = await loadMix()
  if (await hasDocument()) {
    const res = await toDocument('SOUND_STATE').catch(() => null)
    if (res?.ok) return { ok: true, playing: !!res.playing, mix: res.mix, master: res.master, audio: res.audio, level: res.level }
  }
  // The document is gone (stopped, browser restart, or Chrome closed it after silence).
  if (saved.playing) await saveMix({ ...saved, playing: false })
  return { ok: true, playing: false, mix: saved.mix, master: saved.master }
}

export const handlers = {
  SOUND_SET: msg => serial(() => set(msg)),
  SOUND_STOP: () => serial(stop),
  SOUND_STATE: () => serial(state),
}

export function init() {
  // After a browser restart there is no audio document; make the stored state say so.
  serial(async () => {
    const saved = await loadMix()
    if (saved.playing && !(await hasDocument())) await saveMix({ ...saved, playing: false })
  }).catch(() => {})
}
