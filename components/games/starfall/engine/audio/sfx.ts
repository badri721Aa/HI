/**
 * Synthesised sound effects. Every effect is a short recipe of oscillators
 * and filtered noise with click-free envelopes, randomised a little so
 * repeats never sound mechanical. Positional effects go through a PannerNode
 * at their world position; the player's own sounds stay centred.
 */
import type { V3 } from '../events'
import type { SfxName } from '../types'
import type { Surface } from '../world/heightfield'
import type { Bus, Mixer } from './mixer'
import { mtof, rand, type Synth } from './synth'

interface VoiceOpts {
  pan?: number
  pos?: V3
  /** Reverb send (0..1). */
  wet?: number
  /** Panner reference distance (m). */
  ref?: number
}

/** D-major pentatonic ladder for spark chains. */
const SPARK_LADDER = [81, 83, 86, 88, 90, 93, 95, 98, 100, 102]
const HIGH_PENTA = [86, 88, 90, 93, 95, 98, 100, 102]

export class Sfx {
  private last = new Map<string, number>()

  constructor(
    private s: Synth,
    private mix: Mixer,
  ) {}

  /* ── building blocks ─────────────────────────────────────── */

  /** False if `key` fired less than `gap` seconds ago (protects against event storms). */
  private gate(key: string, gap: number): boolean {
    const now = this.s.now
    if (now - (this.last.get(key) ?? -1) < gap) return false
    this.last.set(key, now)
    return true
  }

  /** Output node for one effect: level → [pan | 3D panner] → bus, plus an optional reverb send. */
  private voice(bus: Bus, level: number, o: VoiceOpts = {}): GainNode {
    const s = this.s
    let dest: AudioNode = bus.input
    if (o.pos) dest = s.panner(o.pos, bus.input, o.ref ?? 5, 1.1, 120)
    else if (o.pan) dest = s.stereo(o.pan, bus.input)
    const v = s.gain(level, dest)
    if (o.wet) v.connect(s.gain(o.wet, bus.wet))
    return v
  }

  /** Filtered noise hit; `toFreq` sweeps the filter. */
  private noiseHit(
    dest: AudioNode, t: number, type: BiquadFilterType, freq: number, q: number,
    peak: number, attack: number, decay: number, toFreq = 0, buf?: AudioBuffer,
  ): void {
    const s = this.s
    const env = s.gain(0, dest)
    const f = s.filter(type, freq, q, env)
    const end = s.perc(env.gain, t, peak, attack, decay)
    if (toFreq) s.glide(f.frequency, t, freq, toFreq, attack + decay)
    s.noise(f, t, end, buf ?? s.white)
  }

  /** Oscillator blip with a pitch glide. */
  private tone(dest: AudioNode, t: number, type: OscillatorType, f0: number, f1: number, peak: number, attack: number, decay: number): OscillatorNode {
    const s = this.s
    const env = s.gain(0, dest)
    const end = s.perc(env.gain, t, peak, attack, decay)
    const o = s.osc(type, f0, env, t, end)
    if (f1 !== f0) s.glide(o.frequency, t, f0, f1, attack + decay)
    return o
  }

  /** Band-passed noise sweep: the basis of every whoosh. */
  private whoosh(dest: AudioNode, t: number, f0: number, f1: number, dur: number, peak: number, q = 1): void {
    const s = this.s
    const env = s.gain(0, dest)
    const bp = s.filter('bandpass', f0, q, env)
    s.glide(bp.frequency, t, f0, f1, dur)
    const end = s.ahr(env.gain, t, peak, dur * 0.35, 0, dur * 0.65)
    s.noise(bp, t, end, s.pink)
  }

  /** FM chime (ratio 2 = sweet pling, 3.5 = bell). */
  private chime(dest: AudioNode, t: number, freq: number, peak: number, decay: number, ratio = 2, index = 1.2): void {
    const s = this.s
    const env = s.gain(0, dest)
    const end = s.perc(env.gain, t, peak, 0.004, decay)
    const car = s.osc('sine', freq, env, t, end)
    const mod = s.gain(0, car.frequency)
    mod.gain.setValueAtTime(freq * index, t)
    mod.gain.exponentialRampToValueAtTime(freq * 0.02, t + decay * 0.7)
    s.osc('sine', freq * ratio, mod, t, end)
  }

  private bubble(dest: AudioNode, t: number, f: number, peak = 0.05): void {
    this.tone(dest, t, 'sine', f, f * 1.9, peak, 0.004, 0.06)
  }

  /** Detuned-saw chord swelling through an opening low-pass. */
  private swellChord(dest: AudioNode, t: number, notes: readonly number[], attack: number, hold: number, release: number, peak: number, f0: number, f1: number): void {
    const s = this.s
    const env = s.gain(0, dest)
    const lp = s.filter('lowpass', f0, 0.8, env)
    s.glide(lp.frequency, t, f0, f1, attack)
    const end = s.ahr(env.gain, t, peak, attack, hold, release)
    for (const n of notes) {
      s.osc('sawtooth', mtof(n), lp, t, end, -8)
      s.osc('sawtooth', mtof(n), lp, t, end, 8)
    }
  }

  private get t(): number {
    return this.s.now + 0.01
  }

  /* ── player ──────────────────────────────────────────────── */

  footstep(surface: Surface, sprint: boolean): void {
    if (!this.gate('step', 0.07)) return
    const v = this.voice(this.mix.sfx, (sprint ? 1.6 : 1.2) * rand(0.82, 1.05), { pan: rand(-0.08, 0.08) })
    this.surfaceLayer(v, this.t, surface, rand(0.9, 1.12), sprint)
  }

  /** The material part of a footstep / landing. */
  private surfaceLayer(v: AudioNode, t: number, surface: Surface, p: number, bright = false): void {
    const b = bright ? 1.15 : 1
    switch (surface) {
      case 'sand':
        this.noiseHit(v, t, 'highpass', 2300 * p * b, 0.6, 0.09, 0.016, 0.12)
        this.tone(v, t, 'sine', 90 * p, 60, 0.06, 0.004, 0.05)
        break
      case 'dirt':
        this.noiseHit(v, t, 'lowpass', 650 * p * b, 0.8, 0.28, 0.004, 0.06)
        this.tone(v, t, 'sine', 120 * p, 70, 0.16, 0.004, 0.06)
        break
      case 'rock':
      case 'stone':
        this.noiseHit(v, t, 'bandpass', (surface === 'rock' ? 3300 : 4300) * p * b, 2.5, 0.16, 0.003, 0.03)
        this.noiseHit(v, t, 'lowpass', 900, 0.7, 0.12, 0.003, 0.04)
        this.tone(v, t, 'sine', (surface === 'rock' ? 1250 : 1650) * p, 1200 * p, 0.022, 0.003, 0.045)
        break
      case 'wood':
        this.tone(v, t, 'triangle', 240 * p, 185 * p, 0.2, 0.003, 0.1)
        this.noiseHit(v, t, 'bandpass', 900 * p * b, 5, 0.14, 0.003, 0.07)
        break
      case 'metal':
        this.tone(v, t, 'sine', 1180 * p, 1170 * p, 0.05, 0.003, 0.2)
        this.tone(v, t, 'sine', 1873 * p, 1860 * p, 0.035, 0.003, 0.15)
        this.noiseHit(v, t, 'highpass', 5000, 0.7, 0.05, 0.003, 0.02)
        break
      case 'water':
        this.noiseHit(v, t, 'bandpass', 1900 * p, 1.2, 0.2, 0.01, 0.16, 650)
        this.bubble(v, t + rand(0.02, 0.06), rand(500, 800))
        break
      case 'leaves':
        for (let k = 0; k < 3; k++) this.noiseHit(v, t + k * rand(0.012, 0.03), 'highpass', 3400 * p * b, 0.7, 0.07, 0.003, 0.03)
        this.noiseHit(v, t, 'bandpass', 1700 * p, 0.8, 0.08, 0.006, 0.07)
        break
      default:
        // grass: a soft, brushy crunch
        this.noiseHit(v, t, 'bandpass', 2600 * p * b, 0.9, 0.16, 0.006, 0.075)
        this.noiseHit(v, t + rand(0.015, 0.03), 'bandpass', 4200 * p * b, 1.2, 0.08, 0.004, 0.05)
        this.tone(v, t, 'sine', 100 * p, 65, 0.1, 0.004, 0.05)
    }
  }

  jump(double: boolean): void {
    if (!this.gate('jump', 0.05)) return
    const t = this.t
    const v = this.voice(this.mix.sfx, double ? 1.5 : 2.3, { wet: double ? 0.5 : 0 })
    if (!double) {
      this.whoosh(v, t, 500, 1900, 0.24, 0.24, 1.1)
      this.tone(v, t, 'sine', 260, 430, 0.05, 0.008, 0.07)
      return
    }
    this.whoosh(v, t, 900, 3400, 0.3, 0.22, 1.4)
    const notes = [86, 90, 93, 98]
    for (let k = 0; k < notes.length; k++) this.chime(v, t + 0.03 + k * 0.035, mtof(notes[k]), 0.045, 0.3, 2, 0.6)
  }

  land(impact: number, surface: Surface): void {
    if (!this.gate('land', 0.08)) return
    const t = this.t
    const k = Math.max(0, Math.min(1, (impact - 2) / 14))
    const v = this.voice(this.mix.sfx, 1)
    this.surfaceLayer(v, t, surface, rand(0.85, 1), k > 0.4)
    if (impact < 2.5) return
    this.tone(v, t, 'sine', 140, 42, 0.14 + 0.36 * k, 0.004, 0.12 + 0.2 * k)
    this.noiseHit(v, t, 'lowpass', 500, 0.7, 0.08 + 0.22 * k, 0.004, 0.1 + 0.12 * k)
  }

  dash(): void {
    if (!this.gate('dash', 0.1)) return
    const t = this.t
    const s = this.s
    const pan = s.ac.createStereoPanner()
    pan.connect(this.mix.sfx.input)
    pan.pan.setValueAtTime(-0.45, t)
    pan.pan.linearRampToValueAtTime(0.45, t + 0.3)
    const v = s.gain(1.5, pan)
    this.whoosh(v, t, 2600, 420, 0.32, 0.3, 0.9)
    this.tone(v, t, 'sine', 190, 85, 0.1, 0.01, 0.16)
  }

  attack(): void {
    if (!this.gate('attack', 0.1)) return
    const t = this.t
    const v = this.voice(this.mix.sfx, 2, { wet: 0.4 })
    this.whoosh(v, t, 700, 2400, 0.16, 0.2, 1.3)
    this.whoosh(v, t + 0.12, 2400, 800, 0.22, 0.16, 1.3)
    this.chime(v, t + 0.02, mtof(93), 0.035, 0.45, 2, 0.8)
    this.chime(v, t + 0.07, mtof(88), 0.03, 0.4, 2, 0.8)
  }

  hurt(): void {
    if (!this.gate('hurt', 0.2)) return
    const t = this.t
    const v = this.voice(this.mix.sfx, 1)
    this.tone(v, t, 'sine', 160, 55, 0.34, 0.004, 0.2)
    const lp = this.s.filter('lowpass', 2200, 0.7, v)
    this.tone(lp, t + 0.02, 'triangle', 466, 440, 0.07, 0.005, 0.14)
    this.tone(lp, t + 0.02, 'triangle', 659, 622, 0.06, 0.005, 0.14)
  }

  died(): void {
    const t = this.t
    const s = this.s
    const v = this.voice(this.mix.sfx, 1, { wet: 0.5 })
    const lp = s.filter('lowpass', 3000, 0.7, v)
    s.glide(lp.frequency, t, 3000, 500, 1.2)
    for (const [f0, f1, pk] of [[660, 150, 0.12], [555, 126, 0.07]]) {
      const env = s.gain(0, lp)
      const end = s.ahr(env.gain, t, pk, 0.02, 0.45, 0.8)
      const o = s.osc('triangle', f0, env, t, end)
      s.glide(o.frequency, t, f0, f1, 1.2)
    }
    this.whoosh(v, t, 1200, 300, 0.9, 0.06, 0.8)
  }

  respawn(): void {
    const t = this.t
    const v = this.voice(this.mix.sfx, 1.5, { wet: 0.8 })
    this.whoosh(v, t, 400, 3200, 0.8, 0.07, 1)
    for (let k = 0; k < 6; k++) {
      const n = HIGH_PENTA[Math.floor(Math.random() * 5)]
      this.chime(v, t + 0.1 + k * 0.07 + rand(0, 0.03), mtof(n), 0.03, 0.9, 2, 0.5)
    }
  }

  splash(big: boolean): void {
    if (!this.gate('splash', 0.15)) return
    const t = this.t
    const v = this.voice(this.mix.sfx, 1, { wet: 0.25 })
    if (big) {
      this.noiseHit(v, t, 'lowpass', 4000, 0.8, 0.34, 0.006, 0.55, 500)
      this.tone(v, t, 'sine', 110, 40, 0.24, 0.005, 0.25)
      for (let k = 0; k < 5; k++) this.bubble(v, t + rand(0.08, 0.45), rand(380, 900), 0.05)
    } else {
      this.noiseHit(v, t, 'bandpass', 2500, 1, 0.2, 0.006, 0.22, 900)
      for (let k = 0; k < 2; k++) this.bubble(v, t + rand(0.04, 0.18), rand(500, 900), 0.04)
    }
  }

  wade(): void {
    if (!this.gate('wade', 0.18)) return
    const t = this.t
    const s = this.s
    const v = this.voice(this.mix.sfx, rand(0.8, 1), { pan: rand(-0.1, 0.1) })
    for (let k = 0; k < 2; k++) {
      const env = s.gain(0, v)
      const bp = s.filter('bandpass', 700, 1.4, env)
      const t0 = t + k * 0.12
      s.glide(bp.frequency, t0, 650, 1150, 0.2)
      const end = s.ahr(env.gain, t0, k ? 0.07 : 0.12, 0.05, 0.02, 0.2)
      s.noise(bp, t0, end)
    }
  }

  bounce(): void {
    if (!this.gate('bounce', 0.12)) return
    const t = this.t
    const s = this.s
    const v = this.voice(this.mix.sfx, 1, { wet: 0.2 })
    const env = s.gain(0, v)
    const end = s.perc(env.gain, t, 0.22, 0.005, 0.5)
    const o = s.osc('triangle', 160, env, t, end)
    o.frequency.setValueAtTime(160, t)
    o.frequency.exponentialRampToValueAtTime(540, t + 0.07)
    o.frequency.exponentialRampToValueAtTime(320, t + 0.5)
    const wob = s.gain(0, o.frequency)
    wob.gain.setValueAtTime(40, t)
    wob.gain.linearRampToValueAtTime(0, t + 0.5)
    s.osc('sine', 17, wob, t, end)
    this.tone(v, t, 'sine', 90, 140, 0.12, 0.005, 0.12)
  }

  /* ── collectibles ────────────────────────────────────────── */

  spark(chain: number): void {
    if (!this.gate('spark', 0.03)) return
    const t = this.t
    const n = SPARK_LADDER[Math.min(Math.max(0, chain), SPARK_LADDER.length - 1)]
    const v = this.voice(this.mix.sfx, 1.8, { pan: rand(-0.15, 0.15), wet: 0.45 })
    this.chime(v, t, mtof(n), 0.085, 0.45, 2, 0.9)
    this.chime(v, t + 0.035, mtof(n + 12), 0.02, 0.25, 2, 0.4)
  }

  heart(): void {
    const t = this.t
    const s = this.s
    const v = this.voice(this.mix.sfx, 1, { wet: 0.5 })
    const lp = s.filter('lowpass', 2600, 0.6, v)
    const chord = [50, 62, 66, 69, 76]
    for (let k = 0; k < chord.length; k++) {
      const t0 = t + k * 0.035
      const env = s.gain(0, lp)
      const end = s.ahr(env.gain, t0, k === 0 ? 0.08 : 0.055, 0.02, 0.15, 1.1)
      s.osc('triangle', mtof(chord[k]), env, t0, end)
      s.osc('sine', mtof(chord[k] + 12), s.gain(0.3, env), t0, end)
    }
  }

  shard(): void {
    const t = this.t
    const v = this.voice(this.mix.sfx, 1, { wet: 0.8 })
    this.swellChord(v, t, [62, 69, 74, 78, 81], 1.2, 0.5, 1.8, 0.045, 300, 3200)
    this.whoosh(v, t, 600, 5000, 1.5, 0.08, 0.9)
    this.tone(v, t + 1.15, 'sine', 90, 60, 0.22, 0.01, 1.2)
    const arp = [74, 78, 81, 86, 90, 93, 98, 102]
    for (let k = 0; k < arp.length; k++) this.chime(v, t + 1.1 + k * 0.075, mtof(arp[k]), 0.055, 1.2, 2, 0.8)
  }

  /* ── enemies (positional) ────────────────────────────────── */

  enemyAlert(pos: V3): void {
    if (!this.gate('alert', 0.12)) return
    const t = this.t
    const v = this.voice(this.mix.sfx, 1.3, { pos, ref: 5 })
    const p = rand(0.92, 1.1)
    this.tone(v, t, 'triangle', 820 * p, 1500 * p, 0.12, 0.005, 0.07)
    this.tone(v, t + 0.09, 'triangle', 1100 * p, 1950 * p, 0.1, 0.005, 0.08)
  }

  enemyStomp(pos: V3): void {
    if (!this.gate('stomp', 0.08)) return
    const t = this.t
    const v = this.voice(this.mix.sfx, 1, { pos, ref: 6 })
    this.noiseHit(v, t, 'lowpass', 1400, 6, 0.3, 0.004, 0.16, 180)
    this.tone(v, t + 0.01, 'sine', 700, 180, 0.24, 0.003, 0.07)
  }

  enemyDefeat(pos: V3, big: boolean): void {
    if (!this.gate('defeat', 0.06)) return
    const t = this.t
    const s = this.s
    const v = this.voice(this.mix.sfx, 1, { pos, ref: 6, wet: 0.4 })
    const env = s.gain(0, v)
    const lp = s.filter('lowpass', big ? 1800 : 2500, 0.8, env)
    s.glide(lp.frequency, t, big ? 1800 : 2500, big ? 200 : 300, big ? 0.7 : 0.45)
    const end = s.ahr(env.gain, t, big ? 0.38 : 0.3, 0.01, 0.02, big ? 0.7 : 0.45)
    s.noise(lp, t, end, s.pink)
    this.tone(v, t, 'sine', big ? 380 : 520, big ? 180 : 260, 0.06, 0.005, 0.2)
    // The gloom dissolves into a little light.
    this.chime(v, t + 0.14, mtof(93), 0.03, 0.6, 2, 0.5)
    this.chime(v, t + 0.2, mtof(98), 0.025, 0.6, 2, 0.5)
  }

  /* ── world ───────────────────────────────────────────────── */

  checkpoint(first: boolean): void {
    const t = this.t
    const s = this.s
    const v = this.voice(this.mix.sfx, 1, { wet: 0.6 })
    this.chime(v, t, mtof(74), 0.1, 2.4, 3.5, 1.1)
    this.chime(v, t + 0.06, mtof(81), 0.05, 1.8, 3.5, 0.9)
    if (first) this.chime(v, t + 0.2, mtof(78), 0.05, 2, 3.5, 0.9)
    // Soft flame whoosh as the lantern catches.
    const env = s.gain(0, v)
    const lp = s.filter('lowpass', 300, 0.7, env)
    s.glide(lp.frequency, t, 300, 1800, 0.5)
    const end = s.ahr(env.gain, t, 0.12, 0.25, 0.1, 0.6)
    s.noise(lp, t, end, s.pink)
    for (let k = 0; k < 4; k++) this.noiseHit(v, t + rand(0.15, 0.7), 'highpass', 3500, 0.7, 0.03, 0.003, 0.012)
  }

  /** A huge rising swell, then a boom and a shower of sparkles. */
  beacon(): void {
    const t = this.t
    const v = this.voice(this.mix.sfx, 1, { wet: 0.9 })
    this.swellChord(v, t, [38, 50, 57, 62, 66, 69, 74, 81], 3.8, 0.8, 3.5, 0.06, 200, 4200)
    this.whoosh(v, t, 300, 6000, 4.6, 0.1, 0.8)
    this.tone(v, t + 3.9, 'sine', 70, 34, 0.42, 0.01, 2.2)
    this.noiseHit(v, t + 3.9, 'lowpass', 400, 0.7, 0.24, 0.006, 1.2, 120, this.s.brown)
    for (let k = 0; k < 10; k++) {
      this.chime(v, t + 3.95 + k * 0.13 + rand(0, 0.05), mtof(HIGH_PENTA[k % HIGH_PENTA.length]), 0.045, 1.4, 2, 0.6)
    }
  }

  /** Cutscene bookends: an airy rise in, a gentle fall out. */
  cutscene(start: boolean, skipped = false): void {
    if (!this.gate('cut', 0.3)) return
    const t = this.t
    const s = this.s
    const v = this.voice(this.mix.sfx, skipped ? 0.6 : 1.2, { wet: 0.8 })
    if (start) this.whoosh(v, t, 400, 2400, 2.2, 0.06, 1.2)
    else this.whoosh(v, t, 2400, 500, 1.6, 0.05, 1.2)
    const notes = start ? [62, 69, 76] : [69, 74, 78]
    for (const n of notes) {
      const env = s.gain(0, v)
      const end = s.ahr(env.gain, t, 0.025, start ? 1 : 0.15, 0.3, 1.4)
      s.osc('triangle', mtof(n), env, t, end)
    }
  }

  /* ── interface ───────────────────────────────────────────── */

  ui(name: SfxName): void {
    if (!this.gate(name, name === 'ui-hover' ? 0.04 : 0.05)) return
    const t = this.t
    const v = this.voice(this.mix.ui, 1, { wet: name === 'ui-hover' ? 0 : 0.3 })
    switch (name) {
      case 'ui-hover':
        this.tone(v, t, 'sine', 2400, 2350, 0.022, 0.003, 0.03)
        break
      case 'ui-click':
        this.tone(v, t, 'triangle', 1300, 1080, 0.07, 0.003, 0.05)
        this.tone(v, t, 'sine', 2600, 2600, 0.022, 0.003, 0.03)
        break
      case 'ui-back':
        this.tone(v, t, 'triangle', 900, 600, 0.07, 0.004, 0.09)
        break
      case 'ui-open':
        this.tone(v, t, 'sine', 880, 880, 0.05, 0.005, 0.12)
        this.tone(v, t + 0.06, 'sine', 1320, 1320, 0.05, 0.005, 0.14)
        break
      case 'pause':
        this.tone(v, t, 'triangle', 1175, 1175, 0.055, 0.006, 0.18)
        this.tone(v, t + 0.08, 'triangle', 880, 880, 0.055, 0.006, 0.24)
        break
      case 'resume':
        this.tone(v, t, 'triangle', 880, 880, 0.05, 0.006, 0.14)
        this.tone(v, t + 0.06, 'triangle', 1175, 1175, 0.05, 0.006, 0.14)
        this.tone(v, t + 0.12, 'sine', 1760, 1760, 0.04, 0.006, 0.2)
        break
    }
  }
}
