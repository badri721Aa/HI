/**
 * Low-level WebAudio building blocks shared by the SFX, music and ambience
 * layers: noise buffers, click-free envelopes and small node factories.
 * Nodes are only ever created when a sound is triggered — never per frame.
 */
import type { V3 } from '../events'

/** MIDI note → frequency (Hz). */
export const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12)

/** Shortest fade we ever use (s); anything faster clicks. */
export const MIN_FADE = 0.004
/** "Silence" for exponential ramps (which cannot reach zero). */
const SILENT = 0.0001

/** Small deterministic PRNG (mulberry32) so musical variations are repeatable. */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Uniform random in [a, b). */
export const rand = (a: number, b: number): number => a + Math.random() * (b - a)

type NoiseColour = 'white' | 'pink' | 'brown'

function makeNoise(ac: BaseAudioContext, seconds: number, colour: NoiseColour): AudioBuffer {
  const len = Math.floor(ac.sampleRate * seconds)
  const seam = Math.floor(ac.sampleRate * 0.05)
  // Generate a little extra and cross-fade it into the head so the loop point is seamless.
  const raw = new Float32Array(len + seam)
  let b0 = 0, b1 = 0, b2 = 0, last = 0, peak = 0
  for (let i = 0; i < raw.length; i++) {
    const w = Math.random() * 2 - 1
    let v: number
    if (colour === 'white') {
      v = w
    } else if (colour === 'pink') {
      // Paul Kellet's economy pink filter.
      b0 = 0.99765 * b0 + w * 0.099046
      b1 = 0.963 * b1 + w * 0.2965164
      b2 = 0.57 * b2 + w * 1.0526913
      v = b0 + b1 + b2 + w * 0.1848
    } else {
      last = (last + 0.02 * w) / 1.02
      v = last
    }
    raw[i] = v
    peak = Math.max(peak, Math.abs(v))
  }
  const k = 0.9 / (peak || 1)
  const buf = ac.createBuffer(1, len, ac.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) {
    const t = i < seam ? i / seam : 1
    d[i] = (raw[i] * t + (i < seam ? raw[len + i] * (1 - t) : 0)) * k
  }
  return buf
}

/** Stereo impulse response for a soft, airy outdoor-ish reverb. */
export function makeImpulse(ac: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = ac.sampleRate
  const len = Math.floor(rate * seconds)
  const pre = Math.floor(rate * 0.012)
  const buf = ac.createBuffer(2, len, rate)
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    let lp = 0
    for (let i = pre; i < len; i++) {
      const t = i / len
      // A one-pole low-pass that closes as the tail decays: bright early, dark late.
      lp += (Math.random() * 2 - 1 - lp) * (0.62 - 0.5 * t)
      d[i] = lp * Math.pow(1 - t, decay)
    }
  }
  return buf
}

export class Synth {
  readonly white: AudioBuffer
  readonly pink: AudioBuffer
  readonly brown: AudioBuffer

  constructor(readonly ac: AudioContext) {
    this.white = makeNoise(ac, 2, 'white')
    this.pink = makeNoise(ac, 4, 'pink')
    this.brown = makeNoise(ac, 4, 'brown')
  }

  get now(): number {
    return this.ac.currentTime
  }

  /** Gain node, optionally connected to a node or (for modulation) an AudioParam. */
  gain(value: number, dest?: AudioNode | AudioParam): GainNode {
    const g = this.ac.createGain()
    g.gain.value = value
    if (dest instanceof AudioNode) g.connect(dest)
    else if (dest) g.connect(dest)
    return g
  }

  filter(type: BiquadFilterType, freq: number, q = 0.707, dest?: AudioNode): BiquadFilterNode {
    const f = this.ac.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    f.Q.value = q
    if (dest) f.connect(dest)
    return f
  }

  /** Oscillator running from `t` to `end`. */
  osc(type: OscillatorType, freq: number, dest: AudioNode, t: number, end: number, detune = 0): OscillatorNode {
    const o = this.ac.createOscillator()
    o.type = type
    o.frequency.value = freq
    if (detune) o.detune.value = detune
    o.connect(dest)
    o.start(t)
    o.stop(end)
    return o
  }

  /** Looping noise from a random point in the buffer, running from `t` to `end`. */
  noise(dest: AudioNode, t: number, end: number, buf: AudioBuffer = this.white, rate = 1): AudioBufferSourceNode {
    const s = this.ac.createBufferSource()
    s.buffer = buf
    s.loop = true
    s.playbackRate.value = rate
    s.connect(dest)
    s.start(t, Math.random() * buf.duration * 0.9)
    s.stop(end)
    return s
  }

  /** Percussive envelope: linear attack to `peak`, exponential decay to silence. Returns the end time. */
  perc(p: AudioParam, t: number, peak: number, attack: number, decay: number): number {
    const a = Math.max(MIN_FADE, attack)
    const end = t + a + Math.max(MIN_FADE, decay)
    p.setValueAtTime(0, t)
    p.linearRampToValueAtTime(Math.max(SILENT * 2, peak), t + a)
    p.exponentialRampToValueAtTime(SILENT, end)
    p.linearRampToValueAtTime(0, end + MIN_FADE)
    return end + MIN_FADE
  }

  /** Attack–hold–release envelope (release is exponential). Returns the end time. */
  ahr(p: AudioParam, t: number, peak: number, attack: number, hold: number, release: number): number {
    const a = Math.max(MIN_FADE, attack)
    const pk = Math.max(SILENT * 2, peak)
    const end = t + a + hold + Math.max(MIN_FADE, release)
    p.setValueAtTime(0, t)
    p.linearRampToValueAtTime(pk, t + a)
    p.setValueAtTime(pk, t + a + hold)
    p.exponentialRampToValueAtTime(SILENT, end)
    p.linearRampToValueAtTime(0, end + MIN_FADE)
    return end + MIN_FADE
  }

  /** Exponential glide of a frequency-like parameter. */
  glide(p: AudioParam, t: number, from: number, to: number, dur: number): void {
    p.setValueAtTime(Math.max(1, from), t)
    p.exponentialRampToValueAtTime(Math.max(1, to), t + Math.max(MIN_FADE, dur))
  }

  stereo(pan: number, dest: AudioNode): StereoPannerNode {
    const p = this.ac.createStereoPanner()
    p.pan.value = Math.max(-1, Math.min(1, pan))
    p.connect(dest)
    return p
  }

  /** 3D panner at a fixed world position. */
  panner(pos: V3, dest: AudioNode, refDistance = 4, rolloff = 1, maxDistance = 150): PannerNode {
    const p = this.ac.createPanner()
    p.panningModel = 'equalpower'
    p.distanceModel = 'inverse'
    p.refDistance = refDistance
    p.rolloffFactor = rolloff
    p.maxDistance = maxDistance
    if (p.positionX) {
      p.positionX.value = pos.x
      p.positionY.value = pos.y
      p.positionZ.value = pos.z
    } else {
      p.setPosition(pos.x, pos.y, pos.z)
    }
    p.connect(dest)
    return p
  }
}
