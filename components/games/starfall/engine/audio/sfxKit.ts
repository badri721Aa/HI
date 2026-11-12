/**
 * The building blocks every sound effect is made of: a rate-limit gate, an output voice
 * (level → pan or 3D panner → bus, with a reverb send) and a few click-free generators.
 */
import type { V3 } from '../events'
import type { Bus, Mixer } from './mixer'
import { mtof, type Synth } from './synth'

export interface VoiceOpts {
  pan?: number
  pos?: V3
  /** Reverb send (0..1). */
  wet?: number
  /** Panner reference distance (m). */
  ref?: number
}

export class SfxKit {
  private last = new Map<string, number>()

  constructor(
    protected s: Synth,
    protected mix: Mixer,
  ) {}

  /** False if `key` fired less than `gap` seconds ago (protects against event storms). */
  protected gate(key: string, gap: number): boolean {
    const now = this.s.now
    if (now - (this.last.get(key) ?? -1) < gap) return false
    this.last.set(key, now)
    return true
  }

  /** Output node for one effect: level → [pan | 3D panner] → bus, plus an optional reverb send. */
  protected voice(bus: Bus, level: number, o: VoiceOpts = {}): GainNode {
    const s = this.s
    let dest: AudioNode = bus.input
    if (o.pos) dest = s.panner(o.pos, bus.input, o.ref ?? 5, 1.1, 120)
    else if (o.pan) dest = s.stereo(o.pan, bus.input)
    const v = s.gain(level, dest)
    if (o.wet) v.connect(s.gain(o.wet, bus.wet))
    return v
  }

  /** Filtered noise hit; `toFreq` sweeps the filter. */
  protected noiseHit(
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
  protected tone(dest: AudioNode, t: number, type: OscillatorType, f0: number, f1: number, peak: number, attack: number, decay: number): OscillatorNode {
    const s = this.s
    const env = s.gain(0, dest)
    const end = s.perc(env.gain, t, peak, attack, decay)
    const o = s.osc(type, f0, env, t, end)
    if (f1 !== f0) s.glide(o.frequency, t, f0, f1, attack + decay)
    return o
  }

  /** Band-passed noise sweep: the basis of every whoosh. */
  protected whoosh(dest: AudioNode, t: number, f0: number, f1: number, dur: number, peak: number, q = 1): void {
    const s = this.s
    const env = s.gain(0, dest)
    const bp = s.filter('bandpass', f0, q, env)
    s.glide(bp.frequency, t, f0, f1, dur)
    const end = s.ahr(env.gain, t, peak, dur * 0.35, 0, dur * 0.65)
    s.noise(bp, t, end, s.pink)
  }

  /** FM chime (ratio 2 = sweet pling, 3.5 = bell). */
  protected chime(dest: AudioNode, t: number, freq: number, peak: number, decay: number, ratio = 2, index = 1.2): void {
    const s = this.s
    const env = s.gain(0, dest)
    const end = s.perc(env.gain, t, peak, 0.004, decay)
    const car = s.osc('sine', freq, env, t, end)
    const mod = s.gain(0, car.frequency)
    mod.gain.setValueAtTime(freq * index, t)
    mod.gain.exponentialRampToValueAtTime(freq * 0.02, t + decay * 0.7)
    s.osc('sine', freq * ratio, mod, t, end)
  }

  protected bubble(dest: AudioNode, t: number, f: number, peak = 0.05): void {
    this.tone(dest, t, 'sine', f, f * 1.9, peak, 0.004, 0.06)
  }

  /** Detuned-saw chord swelling through an opening low-pass. */
  protected swellChord(dest: AudioNode, t: number, notes: readonly number[], attack: number, hold: number, release: number, peak: number, f0: number, f1: number): void {
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

  protected get t(): number {
    return this.s.now + 0.01
  }
}
