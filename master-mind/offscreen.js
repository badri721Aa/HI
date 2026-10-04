// Ambient Soundscapes engine (offscreen document, Web Audio only).
// Every sound is synthesized on the device: no audio files, nothing streamed.
//   white  flat-spectrum noise
//   pink   Paul Kellet's refined pink-noise filter (-3 dB/octave)
//   brown  integrated (leaky random-walk) noise (-6 dB/octave)
//   rain   band-limited noise bed + randomly scheduled droplet transients (ticks and plinks)
//   hum    55/110 Hz sines with gentle tanh saturation and a slow tremolo LFO
//   waves  brown noise swept by slow, asymmetric amplitude + lowpass LFOs, with foam hiss on the crest
// Each channel has its own gain (smooth ramps) into a master gain and a soft limiter.
// Only this document answers messages that carry target: 'offscreen' (sent by bg/sounds.js).

const CHANNELS = ['rain', 'waves', 'brown', 'pink', 'white', 'hum']
// Per-channel balance, measured with the K-weighted meter below at 70 % channel / 70 % master: noises sit around
// -23…-28 LU-ish; the hum reads hotter on purpose because the ear is far less sensitive at 55/110 Hz than K-weighting.
const TRIM = { white: 0.27, pink: 0.55, brown: 0.8, rain: 0.87, hum: 0.24, waves: 0.95 }
const RAMP = 0.12 // setTargetAtTime time constant (≈ 0.4 s to settle)
const MAKEUP = 2 // output gain into the limiter
const LOOP_SECONDS = { white: 7.3, pink: 9.1, brown: 11.7 }

let ac = null
let master = null
let meter = null
let dropBus = null
let dropTimer = 0
let nextDrop = 0
const buffers = {}
const channels = {} // name → { gain }
let mix = Object.fromEntries(CHANNELS.map(c => [c, 0]))
let masterVol = 0.7
let playing = false

const clamp01 = v => (Number.isFinite(Number(v)) ? Math.min(1, Math.max(0, Number(v))) : 0)
const curve = v => v * v // slider position → gain (closer to perceived loudness)
const rand = (a, b) => a + Math.random() * (b - a)
const sleep = ms => new Promise(r => setTimeout(r, ms))

function ramp(param, value, tc = RAMP) {
  const t = ac.currentTime
  param.cancelScheduledValues(t)
  param.setTargetAtTime(value, t, tc)
}

// ───────── noise generators (filled into long, seamlessly looping stereo buffers) ─────────
function fillWhite(out) {
  for (let i = 0; i < out.length; i++) out[i] = Math.random() * 2 - 1
}
function fillPink(out) {
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
  for (let i = 0; i < out.length; i++) {
    const w = Math.random() * 2 - 1
    b0 = 0.99886 * b0 + w * 0.0555179
    b1 = 0.99332 * b1 + w * 0.0750759
    b2 = 0.96900 * b2 + w * 0.1538520
    b3 = 0.86650 * b3 + w * 0.3104856
    b4 = 0.55000 * b4 + w * 0.5329522
    b5 = -0.7616 * b5 - w * 0.0168980
    out[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362
    b6 = w * 0.115926
  }
}
function fillBrown(out) {
  let last = 0
  for (let i = 0; i < out.length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02 // leaky integrator keeps it centered
    out[i] = last
  }
}
const FILL = { white: fillWhite, pink: fillPink, brown: fillBrown }

/** A stereo loop whose end crossfades into its start (equal power), normalized to the same RMS. */
function noiseBuffer(kind) {
  if (buffers[kind]) return buffers[kind]
  const sr = ac.sampleRate
  const n = Math.floor(sr * LOOP_SECONDS[kind])
  const fade = Math.floor(sr * 0.5)
  const buf = ac.createBuffer(2, n, sr)
  const raw = new Float32Array(n + fade)
  for (let ch = 0; ch < 2; ch++) {
    FILL[kind](raw)
    const data = buf.getChannelData(ch)
    data.set(raw.subarray(0, n))
    for (let i = 0; i < fade; i++) {
      const t = (i / fade) * Math.PI / 2
      data[i] = raw[i] * Math.sin(t) + raw[n + i] * Math.cos(t)
    }
    let sum = 0
    for (let i = 0; i < n; i++) sum += data[i] * data[i]
    const gain = 0.2 / (Math.sqrt(sum / n) || 1)
    for (let i = 0; i < n; i++) data[i] *= gain
  }
  buffers[kind] = buf
  return buf
}

function loop(kind) {
  const src = ac.createBufferSource()
  src.buffer = noiseBuffer(kind)
  src.loop = true
  src.start(0, Math.random() * src.buffer.duration) // random offset decorrelates layers sharing a buffer
  return src
}

function filter(type, frequency, Q = 0.707) {
  const f = ac.createBiquadFilter()
  f.type = type
  f.frequency.value = frequency
  f.Q.value = Q
  return f
}

function gainNode(value) {
  const g = ac.createGain()
  g.gain.value = value
  return g
}

function lfo(freq, depth, wave = 'sine') {
  const osc = ac.createOscillator()
  if (wave instanceof PeriodicWave) osc.setPeriodicWave(wave)
  else osc.type = wave
  osc.frequency.value = freq
  const amt = gainNode(depth)
  osc.connect(amt)
  osc.start()
  return amt
}

// ───────── channel graphs ─────────
const BUILD = {
  white(out) { loop('white').connect(out) },
  pink(out) { loop('pink').connect(out) },
  brown(out) { loop('brown').connect(out) },

  rain(out) {
    // Bed: the hiss of rain on a window, with a little low-end body and slow gusts.
    const bedGain = gainNode(0.55)
    loop('white').connect(filter('highpass', 650)).connect(filter('lowpass', 7200, 0.5)).connect(bedGain)
    lfo(0.045, 0.12).connect(bedGain.gain)
    lfo(0.11, 0.06).connect(bedGain.gain)
    loop('pink').connect(filter('lowpass', 420)).connect(gainNode(0.32)).connect(out)
    bedGain.connect(out)
    // Droplets are scheduled live (see scheduleDrops).
    dropBus = gainNode(1)
    dropBus.connect(out)
    buffers.tick ??= tickBuffer()
  },

  hum(out) {
    const sum = gainNode(1)
    const tones = [[55, 0.62, 0], [110, 0.34, 0.25], [165, 0.07, -0.35]] // Hz, level, detune (Hz)
    for (const [f, level, detune] of tones) {
      const osc = ac.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = f + detune
      osc.connect(gainNode(level)).connect(sum)
      osc.start()
    }
    // Gentle saturation: a soft tanh curve adds warm low harmonics.
    const shaper = ac.createWaveShaper()
    const n = 2048
    const c = new Float32Array(n)
    const drive = 1.8
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(drive * x) / Math.tanh(drive) }
    shaper.curve = c
    shaper.oversample = '2x'
    const trem = gainNode(0.8)
    lfo(0.13, 0.16).connect(trem.gain)
    lfo(0.031, 0.06).connect(trem.gain)
    sum.connect(gainNode(0.7)).connect(shaper).connect(filter('lowpass', 520)).connect(trem).connect(out)
  },

  waves(out) {
    // An asymmetric swell: slow rise, quicker fall (a few sawtooth harmonics, smoothed).
    const swell = ac.createPeriodicWave(new Float32Array([0, 0, 0, 0, 0]), new Float32Array([0, 1, -0.42, 0.18, -0.07]))
    const lp = filter('lowpass', 650, 0.4)
    const amp = gainNode(0.5)
    const pan = ac.createStereoPanner()
    loop('brown').connect(lp).connect(amp).connect(pan).connect(out)
    // Two incommensurate swells so no two waves are the same size.
    const s1 = lfo(0.083, 0.36, swell)
    const s2 = lfo(0.051, 0.14)
    s1.connect(amp.gain); s2.connect(amp.gain)
    const sweep = gainNode(900) // the same swells open the lowpass as each wave breaks
    s1.connect(sweep); s2.connect(sweep)
    sweep.connect(lp.frequency)
    lfo(0.019, 0.35).connect(pan.pan)
    // Foam: airy hiss that rises with the crest.
    const foam = gainNode(0.09)
    loop('white').connect(filter('highpass', 1800)).connect(filter('lowpass', 6500)).connect(foam).connect(pan)
    const foamMod = gainNode(0.1)
    s1.connect(foamMod)
    foamMod.connect(foam.gain)
  },
}

// ───────── rain droplets ─────────
function tickBuffer() {
  const sr = ac.sampleRate
  const n = Math.floor(sr * 0.045)
  const buf = ac.createBuffer(1, n, sr)
  const d = buf.getChannelData(0)
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.006))
  return buf
}

function drop(t) {
  const pan = ac.createStereoPanner()
  pan.pan.value = rand(-0.9, 0.9)
  pan.connect(dropBus)
  if (Math.random() < 0.86) {
    // Tick: a filtered noise burst, like a drop hitting glass or leaves.
    const src = ac.createBufferSource()
    src.buffer = buffers.tick
    src.playbackRate.value = rand(0.6, 1.5)
    const bp = filter('bandpass', rand(1400, 6500), rand(0.9, 3.5))
    const g = gainNode(rand(0.12, 0.6) ** 2 * 1.4)
    src.connect(bp).connect(g).connect(pan)
    src.onended = () => { src.disconnect(); pan.disconnect() }
    src.start(t)
  } else {
    // Plink: a tiny rising sine, the classic water-drop "bloop".
    const osc = ac.createOscillator()
    const f = rand(900, 2300)
    osc.frequency.setValueAtTime(f, t)
    osc.frequency.exponentialRampToValueAtTime(f * rand(1.4, 1.9), t + 0.035)
    const g = ac.createGain()
    const peak = rand(0.015, 0.05)
    const len = rand(0.05, 0.11)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(peak, t + 0.003)
    g.gain.exponentialRampToValueAtTime(0.0001, t + len)
    osc.connect(g).connect(pan)
    osc.onended = () => { osc.disconnect(); pan.disconnect() }
    osc.start(t)
    osc.stop(t + len + 0.02)
  }
}

function scheduleDrops() {
  if (!ac || !dropBus) return
  const now = ac.currentTime
  const horizon = now + 0.25
  if (nextDrop < now) nextDrop = now + 0.02
  const rate = 7 + 38 * mix.rain // drops per second grow with the rain level
  while (nextDrop < horizon) {
    drop(nextDrop)
    nextDrop += -Math.log(1 - Math.random()) / rate // Poisson arrivals sound natural
  }
}

function updateDropScheduler() {
  const want = playing && mix.rain > 0 && dropBus
  if (want && !dropTimer) { scheduleDrops(); dropTimer = setInterval(scheduleDrops, 90) }
  else if (!want && dropTimer) { clearInterval(dropTimer); dropTimer = 0 }
}

// ───────── engine ─────────
async function ensureContext() {
  if (!ac || ac.state === 'closed') {
    ac = new AudioContext({ latencyHint: 'playback' })
    const limiter = ac.createDynamicsCompressor()
    limiter.threshold.value = -9
    limiter.knee.value = 8
    limiter.ratio.value = 6
    limiter.attack.value = 0.01
    limiter.release.value = 0.3
    master = gainNode(0)
    master.connect(gainNode(MAKEUP)).connect(limiter).connect(ac.destination)
    // Loudness meter: rough K-weighting (high shelf + low cut) so `level` tracks what we hear, not raw RMS.
    meter = ac.createAnalyser()
    meter.fftSize = 2048
    const shelf = filter('highshelf', 1680)
    shelf.gain.value = 4
    limiter.connect(shelf).connect(filter('highpass', 38, 0.5)).connect(meter)
    for (const k of Object.keys(channels)) delete channels[k]
    for (const k of Object.keys(buffers)) delete buffers[k]
    dropBus = null
    nextDrop = 0
  }
  if (ac.state !== 'running') await Promise.race([ac.resume(), sleep(1500)])
  return ac
}

function channel(name) {
  if (channels[name]) return channels[name]
  const gain = gainNode(0)
  gain.connect(master)
  BUILD[name](gain)
  channels[name] = { gain }
  return channels[name]
}

async function apply(nextMix, nextMaster) {
  for (const c of CHANNELS) if (nextMix && c in nextMix) mix[c] = clamp01(nextMix[c])
  if (nextMaster != null) masterVol = clamp01(nextMaster)
  const audible = CHANNELS.some(c => mix[c] > 0)
  if (!audible) return stop()
  await ensureContext()
  playing = true
  for (const c of CHANNELS) {
    if (mix[c] > 0 || channels[c]) ramp(channel(c).gain.gain, curve(mix[c]) * TRIM[c])
  }
  ramp(master.gain, curve(masterVol))
  updateDropScheduler()
  return state()
}

async function stop() {
  playing = false
  updateDropScheduler()
  if (ac && ac.state !== 'closed') {
    ramp(master.gain, 0, 0.1)
    await sleep(420)
    if (!playing) {
      const old = ac
      ac = null
      master = null
      meter = null
      dropBus = null
      for (const k of Object.keys(channels)) delete channels[k]
      for (const k of Object.keys(buffers)) delete buffers[k]
      await old.close().catch(() => {})
    }
  }
  return state()
}

/** K-weighted RMS level of the output right now, in dB re full scale (-Infinity when silent or stopped). */
function level() {
  if (!meter || ac?.state !== 'running') return -Infinity
  const buf = new Float32Array(meter.fftSize)
  meter.getFloatTimeDomainData(buf)
  let sum = 0
  for (const v of buf) sum += v * v
  const rms = Math.sqrt(sum / buf.length)
  return rms > 0 ? Math.round(20 * Math.log10(rms) * 10) / 10 : -Infinity
}

function state() {
  const db = level()
  return { ok: true, playing, mix: { ...mix }, master: masterVol, audio: ac?.state || 'closed', level: Number.isFinite(db) ? db : null }
}

const HANDLERS = {
  SOUND_SET: msg => apply(msg.mix, msg.master),
  SOUND_STOP: () => stop(),
  SOUND_STATE: () => state(),
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.target !== 'offscreen') return false
  const fn = HANDLERS[msg.type]
  if (!fn) return false
  Promise.resolve()
    .then(() => fn(msg))
    .then(reply, e => reply({ ok: false, error: String(e?.message || e) }))
  return true
})
