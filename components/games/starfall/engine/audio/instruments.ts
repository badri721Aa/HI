/**
 * Synthesised instruments for the procedural score. Each call schedules one
 * note at an exact AudioContext time and builds only the handful of nodes
 * that note needs; sources stop themselves when their envelope ends.
 */
import { mtof, type Synth } from './synth'

/** Where a music track's voices go: dry mix, reverb send, tempo echo send. */
export interface MusicDest {
  dry: AudioNode
  wet: AudioNode
  echo: AudioNode
}

export interface PadOpts {
  attack?: number
  release?: number
  /** Low-pass cutoff (Hz) at the top of the swell. */
  bright?: number
  wave?: OscillatorType
}

export class Instruments {
  constructor(
    private s: Synth,
    private d: MusicDest,
  ) {}

  /** Warm pad: two detuned oscillators per note through a swelling low-pass. */
  pad(t: number, notes: readonly number[], dur: number, vel = 1, o: PadOpts = {}): void {
    const s = this.s
    const attack = o.attack ?? 0.8
    const release = o.release ?? 1.6
    const bright = o.bright ?? 1400
    const env = s.gain(0, this.d.dry)
    env.connect(this.d.wet)
    const lp = s.filter('lowpass', bright, 0.6, env)
    lp.frequency.setValueAtTime(bright * 0.35, t)
    lp.frequency.linearRampToValueAtTime(bright, t + attack * 1.3)
    lp.frequency.setTargetAtTime(bright * 0.7, t + attack * 1.3 + dur * 0.4, dur * 0.5 + 0.1)
    const end = s.ahr(env.gain, t, (0.28 * vel) / notes.length, attack, Math.max(0, dur - attack), release)
    const wave = o.wave ?? 'sawtooth'
    for (const n of notes) {
      const f = mtof(n)
      s.osc(wave, f, lp, t, end, -7)
      s.osc(wave, f, lp, t, end, 6)
    }
  }

  /** Plucked kalimba/harp-like note with a closing filter. */
  pluck(t: number, midi: number, dur: number, vel = 1, echo = true): void {
    const s = this.s
    const f = mtof(midi)
    const env = s.gain(0, this.d.dry)
    env.connect(this.d.wet)
    if (echo) env.connect(this.d.echo)
    const lp = s.filter('lowpass', f * 6, 0.9, env)
    s.glide(lp.frequency, t, Math.min(9000, f * 7), f * 1.6, 0.35)
    const end = s.perc(env.gain, t, 0.2 * vel, 0.004, Math.min(1.8, 0.45 + dur * 0.6))
    s.osc('triangle', f, lp, t, end)
    s.osc('sine', f * 2, s.gain(0.25, lp), t, end)
  }

  /** Soft breathy ocarina lead with delayed vibrato. */
  ocarina(t: number, midi: number, dur: number, vel = 1): void {
    const s = this.s
    const f = mtof(midi)
    const env = s.gain(0, this.d.dry)
    env.connect(this.d.wet)
    env.connect(this.d.echo)
    const end = s.ahr(env.gain, t, 0.15 * vel, 0.045, Math.max(0.02, dur * 0.82 - 0.045), 0.22)
    const o = s.osc('sine', f, env, t, end)
    s.osc('triangle', f, s.gain(0.18, env), t, end)
    if (dur > 0.25) {
      const depth = s.gain(0)
      depth.gain.setValueAtTime(0, t)
      depth.gain.linearRampToValueAtTime(f * 0.006, t + Math.min(0.4, dur * 0.6))
      depth.connect(o.frequency)
      s.osc('sine', 5.2, depth, t, end)
    }
    // A breath of air at the attack.
    const chiff = s.gain(0, env)
    s.noise(s.filter('bandpass', f * 2, 2, chiff), t, t + 0.12)
    s.perc(chiff.gain, t, 0.12, 0.006, 0.06)
  }

  /** FM bell / glockenspiel. `ratio` 2 = sweet, 3.5 = church-bell. */
  bell(t: number, midi: number, vel = 1, decay = 1.4, ratio = 3.5, attack = 0.004): void {
    const s = this.s
    const f = mtof(midi)
    const env = s.gain(0, this.d.dry)
    env.connect(this.d.wet)
    env.connect(this.d.echo)
    const end = s.perc(env.gain, t, 0.12 * vel, attack, decay)
    const car = s.osc('sine', f, env, t, end)
    const idx = s.gain(0, car.frequency)
    idx.gain.setValueAtTime(f * 1.6, t)
    idx.gain.exponentialRampToValueAtTime(f * 0.05, t + decay * 0.6)
    s.osc('sine', f * ratio, idx, t, end)
  }

  /** Round upright-ish bass. */
  bass(t: number, midi: number, dur: number, vel = 1): void {
    const s = this.s
    const f = mtof(midi)
    const env = s.gain(0, this.d.dry)
    const lp = s.filter('lowpass', 900, 1.2, env)
    s.glide(lp.frequency, t, 1500, 420, 0.25)
    const end = s.ahr(env.gain, t, 0.36 * vel, 0.008, Math.max(0.02, dur * 0.55), 0.2)
    s.osc('triangle', f, lp, t, end)
    s.osc('square', f, s.gain(0.1, lp), t, end)
  }

  /** Deep sine swell under long chords. */
  sub(t: number, midi: number, dur: number, vel = 1): void {
    const s = this.s
    const env = s.gain(0, this.d.dry)
    const end = s.ahr(env.gain, t, 0.2 * vel, Math.min(1.2, dur * 0.3), dur * 0.5, dur * 0.4)
    s.osc('sine', mtof(midi), env, t, end)
    s.osc('triangle', mtof(midi + 12), s.gain(0.12, env), t, end)
  }

  /** Soft felt kick. */
  kick(t: number, vel = 1): void {
    const s = this.s
    const env = s.gain(0, this.d.dry)
    const end = s.perc(env.gain, t, 0.42 * vel, 0.003, 0.26)
    const o = s.osc('sine', 120, env, t, end)
    s.glide(o.frequency, t, 125, 46, 0.12)
  }

  /** Brush swish on a snare. `long` = a slower sweep. */
  brush(t: number, vel = 1, long = false): void {
    const s = this.s
    const env = s.gain(0, this.d.dry)
    env.connect(this.d.wet)
    const end = s.perc(env.gain, t, 0.1 * vel, long ? 0.05 : 0.008, long ? 0.26 : 0.15)
    s.noise(s.filter('bandpass', 3000, 0.7, env), t, end)
  }

  shaker(t: number, vel = 1): void {
    const s = this.s
    const env = s.gain(0, this.d.dry)
    const end = s.perc(env.gain, t, 0.045 * vel, 0.005, 0.05)
    s.noise(s.filter('highpass', 6500, 0.7, env), t, end)
  }

  /** Muted low tom. */
  tom(t: number, midi: number, vel = 1): void {
    const s = this.s
    const f = mtof(midi)
    const env = s.gain(0, this.d.dry)
    const end = s.perc(env.gain, t, 0.4 * vel, 0.004, 0.3)
    const o = s.osc('sine', f, env, t, end)
    s.glide(o.frequency, t, f * 1.6, f, 0.07)
    const n = s.gain(0, env)
    s.noise(s.filter('lowpass', 500, 0.7, n), t, t + 0.08)
    s.perc(n.gain, t, 0.35, 0.003, 0.05)
  }

  tick(t: number, vel = 1): void {
    const s = this.s
    const env = s.gain(0, this.d.dry)
    const end = s.perc(env.gain, t, 0.045 * vel, 0.003, 0.025)
    s.noise(s.filter('highpass', 8500, 0.7, env), t, end)
  }

  rim(t: number, vel = 1): void {
    const s = this.s
    const env = s.gain(0, this.d.dry)
    env.connect(this.d.wet)
    const end = s.perc(env.gain, t, 0.09 * vel, 0.003, 0.05)
    s.noise(s.filter('bandpass', 1900, 3, env), t, end)
  }

  /** Bright, soft snare for the victory groove. */
  snare(t: number, vel = 1): void {
    const s = this.s
    const env = s.gain(0, this.d.dry)
    env.connect(this.d.wet)
    const end = s.perc(env.gain, t, 0.1 * vel, 0.003, 0.16)
    s.noise(s.filter('bandpass', 1800, 0.8, env), t, end)
    const body = s.gain(0, env)
    s.perc(body.gain, t, 0.6, 0.003, 0.08)
    const o = s.osc('triangle', 200, body, t, t + 0.12)
    s.glide(o.frequency, t, 210, 165, 0.08)
  }

  /** Brassy chord or lead: detuned saws with a filter that blooms then settles. */
  brass(t: number, notes: readonly number[], dur: number, vel = 1): void {
    const s = this.s
    const env = s.gain(0, this.d.dry)
    env.connect(this.d.wet)
    const lp = s.filter('lowpass', 600, 1.1, env)
    lp.frequency.setValueAtTime(500, t)
    lp.frequency.linearRampToValueAtTime(2800, t + 0.07)
    lp.frequency.setTargetAtTime(1500, t + 0.07, 0.15)
    const end = s.ahr(env.gain, t, (0.17 * vel) / Math.sqrt(notes.length), 0.03, Math.max(0.03, dur * 0.85 - 0.03), 0.22)
    for (const n of notes) {
      const f = mtof(n)
      s.osc('sawtooth', f, lp, t, end, -6)
      s.osc('sawtooth', f, lp, t, end, 7)
    }
  }

  /** Tense filtered-saw ostinato pulse. */
  pulse(t: number, midi: number, vel = 1): void {
    const s = this.s
    const env = s.gain(0, this.d.dry)
    const lp = s.filter('lowpass', 900, 5, env)
    s.glide(lp.frequency, t, 1100, 260, 0.12)
    const end = s.perc(env.gain, t, 0.45 * vel, 0.004, 0.16)
    s.osc('sawtooth', mtof(midi), lp, t, end)
  }

  /** Filtered-noise swell, like wind through strings. */
  swell(t: number, dur: number, vel = 1): void {
    const s = this.s
    const env = s.gain(0, this.d.dry)
    env.connect(this.d.wet)
    const bp = s.filter('bandpass', 400, 1.2, env)
    s.glide(bp.frequency, t, 300, 2400, dur * 0.75)
    const end = s.ahr(env.gain, t, 0.06 * vel, dur * 0.7, 0, dur * 0.3)
    s.noise(bp, t, end, s.pink)
  }
}
