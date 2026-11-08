/**
 * Island ambience: continuous beds (ocean, wind, forest rustle, crickets,
 * the waterfall roar) built once and steered a few times per second, plus
 * occasional one-shots (breaking waves, birdsong). Movement inside the beds
 * comes from LFO oscillators, so nothing is automated per frame.
 */
import type { V3 } from '../events'
import { heightAt, smoothstep, ZONES, type Zone, type ZoneId } from '../world/heightfield'
import { FALLS } from '../world/level'
import type { Bus } from './mixer'
import { rand, type Synth } from './synth'

/** What the ambience needs to know each tick (filled in place by the engine). */
export interface AmbienceInput {
  /** Where the player (or title camera focus) is — drives habitat. */
  x: number
  y: number
  z: number
  /** Listener's horizontal right vector — for panning the sea and birds. */
  rx: number
  rz: number
  /** 0 = night, 1 = full daylight. */
  daylight: number
  /** Seconds since the previous tick. */
  dt: number
}

/** Coast estimate samples: 8 bearings × 3 radii (nearer rings count more). */
const BEARINGS = 8
const BX = Array.from({ length: BEARINGS }, (_, k) => Math.sin((k / BEARINGS) * Math.PI * 2))
const BZ = Array.from({ length: BEARINGS }, (_, k) => Math.cos((k / BEARINGS) * Math.PI * 2))
const RINGS: ReadonlyArray<[radius: number, weight: number]> = [[12, 1.5], [32, 1], [65, 0.5]]
const RING_TOTAL = BEARINGS * (1.5 + 1 + 0.5)
/** Waterfall audio position: the middle of the falling curtain. */
const FALLS_POS: V3 = { x: FALLS.x, y: FALLS.topY * 0.6, z: FALLS.curtainZ }

const zone = (id: ZoneId) => ZONES.find(q => q.id === id) ?? null
const FOREST = zone('forest')
const SUMMIT = zone('summit')
const RUINS = zone('ruins')

/** 1 inside the core of a zone, fading out a little beyond its radius. */
function zoneWeight(zn: Zone | null, x: number, z: number): number {
  if (!zn) return 0
  return 1 - smoothstep(zn.r * 0.5, zn.r * 1.4, Math.hypot(x - zn.x, z - zn.z))
}

export class Ambience {
  /** Current bed targets, for tests and tuning. */
  readonly levels = { ocean: 0, wind: 0, rustle: 0, crickets: 0, birds: 0, falls: 0 }

  private ocean: GainNode
  private oceanPan: StereoPannerNode
  private wind: GainNode
  private rustle: GainNode
  private crickets: GainNode
  private falls: GainNode
  private beaconHum: GainNode | null = null
  private sources: AudioScheduledSourceNode[] = []
  private coastT = 0
  private seaFrac = 0
  private seaPan = 0
  private waveT = 3
  private birdT = 2

  constructor(
    private s: Synth,
    private bus: Bus,
  ) {
    const t = s.now
    const out = bus.input

    // Ocean: a deep brown-noise wash and a lighter foam hiss, both breathing on slow LFOs.
    this.oceanPan = s.stereo(0, out)
    this.ocean = s.gain(0, this.oceanPan)
    const wash = s.gain(0.55, this.ocean)
    this.lfo(0.083, 0.28, wash.gain)
    this.lfo(0.131, 0.16, wash.gain)
    this.loop(s.brown, s.filter('lowpass', 520, 0.6, wash), 1)
    const foam = s.gain(0.2, this.ocean)
    this.lfo(0.083, 0.14, foam.gain)
    this.loop(s.pink, s.filter('bandpass', 1500, 0.6, foam), 0.9)

    // Wind: band-passed noise whose centre and level gust on slow LFOs.
    this.wind = s.gain(0, out)
    const gust = s.gain(0.6, this.wind)
    this.lfo(0.11, 0.35, gust.gain)
    this.lfo(0.047, 0.2, gust.gain)
    const wbp = s.filter('bandpass', 520, 0.9, gust)
    this.lfo(0.07, 220, wbp.frequency)
    this.loop(s.pink, wbp, 1)

    // Forest rustle: airy high band, gusting faster.
    this.rustle = s.gain(0, out)
    const rg = s.gain(0.55, this.rustle)
    this.lfo(0.21, 0.3, rg.gain)
    this.lfo(0.37, 0.15, rg.gain)
    this.loop(s.white, s.filter('highpass', 3600, 0.6, s.filter('lowpass', 8500, 0.5, rg)), 1)

    // Crickets: two amplitude-modulated tones gated into chirps.
    this.crickets = s.gain(0, out)
    this.cricket(4420, 31, 1.45, -0.5)
    this.cricket(4710, 27, 1.1, 0.55)

    // Waterfall roar, positioned at the falls.
    this.falls = s.gain(0, s.panner(FALLS_POS, out, 9, 1.3, 220))
    this.loop(s.brown, s.filter('lowpass', 1100, 0.6, this.falls), 1.2)
    this.loop(s.white, s.filter('bandpass', 2600, 0.5, s.gain(0.18, this.falls)), 1)

    for (const g of [this.ocean, this.wind, this.rustle, this.crickets, this.falls]) g.gain.setValueAtTime(0, t)
  }

  /** Steer the beds toward the current surroundings (call ~4×/s). */
  tick(i: AmbienceInput): void {
    const s = this.s
    const now = s.now

    // Coast estimate: how much open sea surrounds us, and which side it's on.
    this.coastT -= i.dt
    if (this.coastT <= 0) {
      this.coastT = 0.5
      let sea = 0
      let px = 0
      let pz = 0
      for (let ring = 0; ring < RINGS.length; ring++) {
        const [r, w] = RINGS[ring]
        for (let k = 0; k < BEARINGS; k++) {
          if (heightAt(i.x + BX[k] * r, i.z + BZ[k] * r) < -0.25) {
            sea += w
            px += BX[k] * w
            pz += BZ[k] * w
          }
        }
      }
      this.seaFrac = sea / RING_TOTAL
      const len = Math.hypot(px, pz)
      this.seaPan = len > 0 ? ((px * i.rx + pz * i.rz) / len) * 0.6 : 0
    }

    const altitude = smoothstep(6, 34, i.y)
    const forest = zoneWeight(FOREST, i.x, i.z)
    const summit = zoneWeight(SUMMIT, i.x, i.z)
    const cliffs = zoneWeight(RUINS, i.x, i.z)
    const inland = 1 - Math.min(1, this.seaFrac * 2.2)
    const night = 1 - i.daylight

    const L = this.levels
    L.ocean = Math.min(1, 0.08 + this.seaFrac * 2.6) * (1 - altitude * 0.5)
    L.wind = Math.min(1, 0.16 + altitude * 0.5 + summit * 0.25 + cliffs * 0.18)
    L.rustle = Math.min(1, 0.06 + forest * 0.6 + inland * 0.08)
    L.crickets = night * Math.min(1, 0.25 + inland * 0.5 + forest * 0.5)
    L.birds = i.daylight * Math.min(1, 0.15 + inland * 0.45 + forest * 0.6) * (1 - altitude * 0.6)
    const fd = Math.hypot(i.x - FALLS_POS.x, i.z - FALLS_POS.z)
    L.falls = 1 - smoothstep(60, 115, fd)

    this.ocean.gain.setTargetAtTime(L.ocean * 0.5, now, 1.2)
    this.oceanPan.pan.setTargetAtTime(this.seaPan, now, 0.8)
    this.wind.gain.setTargetAtTime(L.wind * 0.22, now, 1.5)
    this.rustle.gain.setTargetAtTime(L.rustle * 0.07, now, 1.2)
    this.crickets.gain.setTargetAtTime(L.crickets * 0.018, now, 2)
    this.falls.gain.setTargetAtTime(L.falls * 1.3, now, 1)

    // Breaking waves near the shore.
    this.waveT -= i.dt
    if (this.waveT <= 0) {
      this.waveT = rand(4.5, 9)
      if (L.ocean > 0.25) this.wave(L.ocean)
    }

    // Birdsong.
    this.birdT -= i.dt
    if (this.birdT <= 0) {
      this.birdT = rand(1.4, 4.5) / (0.4 + L.birds)
      if (L.birds > 0.08 && Math.random() < 0.4 + L.birds) this.bird(L.birds)
    }
  }

  /** Warm hum and crackle from the lit Beacon (positional). */
  igniteBeacon(pos: V3): void {
    if (this.beaconHum) return
    const s = this.s
    const t = s.now
    this.beaconHum = s.gain(0, s.panner(pos, this.bus.input, 8, 1.2, 160))
    this.beaconHum.gain.setValueAtTime(0, t)
    this.beaconHum.gain.linearRampToValueAtTime(0.5, t + 5)
    const hum = s.gain(0.05, this.beaconHum)
    this.lfo(0.3, 0.02, hum.gain)
    for (const f of [110, 165, 220.5]) this.track(s.osc('sine', f, hum, t, t + 1e6))
    const fire = s.gain(0.12, this.beaconHum)
    this.lfo(2.3, 0.06, fire.gain)
    this.loop(s.pink, s.filter('bandpass', 900, 0.5, fire), 1)
  }

  get beaconLit(): boolean {
    return this.beaconHum !== null
  }

  dispose(): void {
    for (const src of this.sources) {
      try {
        src.stop()
      } catch {
        /* already stopped */
      }
    }
    this.sources.length = 0
  }

  /* ── helpers ─────────────────────────────────────────────── */

  private track<T extends AudioScheduledSourceNode>(src: T): T {
    this.sources.push(src)
    return src
  }

  private loop(buf: AudioBuffer, dest: AudioNode, rate: number): void {
    this.track(this.s.noise(dest, this.s.now, this.s.now + 1e6, buf, rate))
  }

  /** Sine LFO adding ±depth to `param`; rates are jittered so layers drift apart. */
  private lfo(freq: number, depth: number, param: AudioParam): void {
    const s = this.s
    this.track(s.osc('sine', freq * rand(0.92, 1.08), s.gain(depth, param), s.now, s.now + 1e6))
  }

  private cricket(freq: number, am: number, chirp: number, pan: number): void {
    const s = this.s
    const t = s.now
    const gate = s.gain(0.5, s.stereo(pan, this.crickets))
    // Square gate rounded by a low-pass so chirps start and stop without clicks.
    const shaped = s.filter('lowpass', 30, 0.7, s.gain(0.5, gate.gain))
    this.track(s.osc('square', chirp, shaped, t, t + 1e6))
    const amp = s.gain(0.5, gate)
    this.track(s.osc('sine', am, s.gain(0.5, amp.gain), t, t + 1e6))
    this.track(s.osc('sine', freq, amp, t, t + 1e6))
  }

  private wave(level: number): void {
    const s = this.s
    const t = s.now + 0.02
    const dur = rand(2.8, 4.2)
    const env = s.gain(0, s.stereo(this.seaPan + rand(-0.25, 0.25), this.bus.input))
    const lp = s.filter('lowpass', 400, 0.7, env)
    lp.frequency.setValueAtTime(380, t)
    lp.frequency.linearRampToValueAtTime(rand(1300, 1900), t + dur * 0.4)
    lp.frequency.linearRampToValueAtTime(500, t + dur)
    const end = s.ahr(env.gain, t, 0.16 * level, dur * 0.38, dur * 0.06, dur * 0.56)
    s.noise(lp, t, end, s.pink)
  }

  private bird(level: number): void {
    const s = this.s
    const t = s.now + 0.02
    const v = s.gain(rand(0.5, 1) * level * 0.05, s.stereo(rand(-0.8, 0.8), this.bus.input))
    v.connect(s.gain(0.4, this.bus.wet))
    const base = rand(0.85, 1.2)
    const kind = Math.floor(Math.random() * 3)
    const chirp = (t0: number, f0: number, f1: number, len: number, pk = 1) => {
      const env = s.gain(0, v)
      const end = s.ahr(env.gain, t0, pk, 0.008, len * 0.4, len * 0.6)
      const o = s.osc('sine', f0, env, t0, end)
      s.glide(o.frequency, t0, f0, f1, len)
    }
    if (kind === 0) {
      // rising whistles
      const n = 2 + Math.floor(Math.random() * 3)
      for (let k = 0; k < n; k++) chirp(t + k * 0.16, 2700 * base, 3700 * base, 0.11, 0.8 + Math.random() * 0.2)
    } else if (kind === 1) {
      // trill
      const n = 6 + Math.floor(Math.random() * 5)
      for (let k = 0; k < n; k++) chirp(t + k * 0.05, 4300 * base, 3900 * base, 0.035, 0.6)
    } else {
      // "tee-oo"
      chirp(t, 3300 * base, 3400 * base, 0.18, 0.9)
      chirp(t + 0.24, 3000 * base, 2300 * base, 0.26, 0.8)
    }
  }
}
