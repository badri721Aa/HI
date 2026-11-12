/**
 * Synthesised sound effects. Every effect is a short recipe of oscillators
 * and filtered noise with click-free envelopes (the blocks in sfxKit.ts),
 * randomised a little so repeats never sound mechanical. Positional effects go
 * through a PannerNode at their world position; the player's own sounds stay centred.
 */
import type { BossId, V3, WeaponId } from '../events'
import { KIND } from '../gameplay/weapons/defs'
import type { SfxName } from '../types'
import type { Surface } from '../world/heightfield'
import { SfxKit } from './sfxKit'
import { mtof, rand } from './synth'

/** D-major pentatonic ladder for spark chains. */
const SPARK_LADDER = [81, 83, 86, 88, 90, 93, 95, 98, 100, 102]
const HIGH_PENTA = [86, 88, 90, 93, 95, 98, 100, 102]

export class Sfx extends SfxKit {
  /** Which foot lands next: −1 left, +1 right. */
  private foot = 1

  /* ── player ──────────────────────────────────────────────── */

  footstep(surface: Surface, sprint: boolean): void {
    if (!this.gate('step', 0.07)) return
    // Feet alternate a little left and right of centre, one pitched a touch above the other.
    const foot = (this.foot = -this.foot)
    const t = this.t
    const v = this.voice(this.mix.sfx, (sprint ? 1.6 : 1.2) * rand(0.82, 1.05), { pan: foot * rand(0.06, 0.14) })
    this.surfaceLayer(v, t, surface, rand(0.92, 1.08) * (1 + foot * 0.03), sprint)
    // One step in four drags: a short scuff after the contact.
    if (surface !== 'water' && Math.random() < 0.25) this.noiseHit(v, t + rand(0.04, 0.07), 'bandpass', rand(1400, 2200), 0.8, 0.05, 0.02, 0.07)
    // At a sprint the clothes swish with every stride.
    if (sprint) this.noiseHit(v, t + 0.02, 'highpass', 3800, 0.6, 0.022, 0.03, 0.08, 0, this.s.pink)
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
      case 'snow':
        // Packed snow: a soft, grainy squeak-crunch with a muffled body.
        for (let k = 0; k < 4; k++) this.noiseHit(v, t + k * rand(0.008, 0.02), 'bandpass', 1500 * p * b, 2.2, 0.1, 0.004, 0.035)
        this.noiseHit(v, t, 'lowpass', 520 * p, 0.7, 0.2, 0.008, 0.1)
        this.tone(v, t, 'sine', 95 * p, 60, 0.08, 0.006, 0.06)
        break
      case 'ice':
        // Hard and glassy: a sharp click with a short crystalline ring.
        this.noiseHit(v, t, 'highpass', 4200 * p * b, 1.2, 0.14, 0.001, 0.02)
        this.tone(v, t, 'sine', 2400 * p, 2350 * p, 0.03, 0.002, 0.12)
        this.tone(v, t, 'sine', 3720 * p, 3700 * p, 0.018, 0.002, 0.09)
        this.tone(v, t, 'sine', 150 * p, 90, 0.08, 0.003, 0.04)
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
      // Cloth: a quick flutter as he leaves the ground.
      for (let k = 0; k < 2; k++) this.noiseHit(v, t + 0.02 + k * rand(0.05, 0.08), 'highpass', rand(2600, 3600), 0.6, 0.035, 0.02, 0.07, 0, this.s.pink)
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
    // Feet rarely touch down together: half the landings are a quick one-two.
    if (Math.random() < 0.5) this.surfaceLayer(this.s.gain(0.6, v), t + rand(0.025, 0.05), surface, rand(0.95, 1.1))
    if (impact < 2.5) return
    const body = rand(0.88, 1.12)
    this.tone(v, t, 'sine', 140 * body, 42, 0.14 + 0.36 * k, 0.004, 0.12 + 0.2 * k)
    this.noiseHit(v, t, 'lowpass', 500 * body, 0.7, 0.08 + 0.22 * k, 0.004, 0.1 + 0.12 * k)
    // Clothes and gear settle after a real drop.
    if (k > 0.25) this.noiseHit(v, t + 0.05, 'highpass', 3200, 0.6, 0.03 + 0.04 * k, 0.03, 0.14, 0, this.s.pink)
  }

  /** Down to the last heart: a soft double thump. */
  heartbeat(): void {
    const t = this.t
    const v = this.voice(this.mix.sfx, 1)
    this.tone(v, t, 'sine', 78, 44, 0.21, 0.008, 0.13)
    this.tone(v, t + 0.17, 'sine', 66, 40, 0.14, 0.008, 0.15)
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

  /* ── weapons ─────────────────────────────────────────────── */

  /** Blade through the air (pitch rises along the combo), or the hammer's heavy lift. */
  swing(weapon: WeaponId, combo: number): void {
    if (!this.gate('swing', 0.06)) return
    const t = this.t
    const v = this.voice(this.mix.sfx, 1.6, { wet: 0.25 })
    if (KIND[weapon] === 'hammer') {
      this.whoosh(v, t + 0.1, 260 * rand(0.92, 1.08), 820, 0.42, 0.22, 0.8)
      // The ice head sings faintly as it comes round.
      if (weapon === 'frostHammer') this.chime(v, t + 0.22, rand(2300, 2700), 0.02, 0.6, 3.5, 1)
      return
    }
    if (weapon === 'starblade') this.chime(v, t + 0.06, 1760 * (1 + combo * 0.12), 0.03, 0.5, 2, 0.8)
    const p = rand(0.94, 1.08) * (1 + combo * 0.1)
    this.whoosh(v, t + 0.04, 900 * p, 3800 * p, 0.1, 0.34, 1.6)
    this.whoosh(v, t + 0.12, 3800 * p, 1200 * p, 0.16, 0.2, 1.6)
    this.chime(v, t + 0.05, 2300 * p, 0.01, 0.25, 3.5, 0.6)
  }

  /** The hammer meets the ground: a deep thud, crunching earth and a short metallic boom. */
  slam(pos: V3): void {
    const t = this.t
    const v = this.voice(this.mix.sfx, 1.5, { pos, ref: 8, wet: 0.5 })
    this.tone(v, t, 'sine', 120, 32, 0.6, 0.003, 0.5)
    this.noiseHit(v, t, 'lowpass', 1600, 0.8, 0.4, 0.003, 0.34, 140, this.s.brown)
    this.noiseHit(v, t + 0.01, 'bandpass', 2600, 1.4, 0.12, 0.002, 0.12, 900)
    this.chime(v, t, 170, 0.05, 1.1, 1.41, 2)
  }

  /** The bow limbs creak as the string comes back. */
  bowDraw(): void {
    if (!this.gate('draw', 0.2)) return
    const t = this.t
    const s = this.s
    const v = this.voice(this.mix.sfx, 0.9)
    const env = s.gain(0, v)
    const bp = s.filter('bandpass', 500, 7, env)
    s.glide(bp.frequency, t, 480, 1250, 0.6)
    s.noise(bp, t, s.ahr(env.gain, t, 0.16, 0.3, 0.2, 0.2), s.pink)
  }

  /** String twang and the arrow's whip; a fuller draw sounds stronger. */
  bowFire(charge: number): void {
    const t = this.t
    const v = this.voice(this.mix.sfx, 1.2, { wet: 0.2 })
    this.tone(v, t, 'triangle', 230 + 90 * charge, 150, 0.3, 0.002, 0.24)
    this.tone(v, t, 'sine', 110, 68, 0.22, 0.002, 0.16)
    this.whoosh(v, t + 0.01, 2400, 6200, 0.14, 0.1 + 0.14 * charge, 2)
  }

  /** An arrow thunks into the ground and its shaft quivers. */
  arrowStick(pos: V3): void {
    if (!this.gate('thunk', 0.04)) return
    const t = this.t
    const v = this.voice(this.mix.sfx, 1, { pos, ref: 5 })
    this.noiseHit(v, t, 'bandpass', 900, 2, 0.25, 0.002, 0.06)
    this.tone(v, t, 'sine', 320, 140, 0.18, 0.002, 0.08)
    this.tone(v, t + 0.01, 'triangle', 190, 176, 0.05, 0.004, 0.24)
  }

  /** A blow lands on a gloomling: a squelchy smack (heavier for the hammer); a launch adds a cartoon "fwip". */
  weaponHit(pos: V3, weapon: WeaponId, killed: boolean): void {
    if (!this.gate('whit', 0.03)) return
    const t = this.t
    const kind = KIND[weapon]
    const heavy = kind === 'hammer'
    const p = rand(0.9, 1.1)
    const v = this.voice(this.mix.sfx, 1.3, { pos, ref: 6, wet: 0.3 })
    this.noiseHit(v, t, 'lowpass', (heavy ? 1200 : 2600) * p, 3, 0.4, 0.002, heavy ? 0.22 : 0.12, heavy ? 150 : 400)
    this.tone(v, t, 'sine', (heavy ? 160 : 300) * p, heavy ? 50 : 110, heavy ? 0.45 : 0.3, 0.002, heavy ? 0.25 : 0.12)
    if (kind === 'sword') this.noiseHit(v, t, 'highpass', 5000, 0.7, 0.08, 0.001, 0.05)
    // An arrow goes in with a dry thwack.
    if (kind === 'bow') this.tone(v, t, 'triangle', 620 * p, 190, 0.14, 0.001, 0.07)
    if (weapon === 'frostHammer') this.chime(v, t + 0.02, 2600, 0.04, 0.5, 3.5, 1.2)
    if (killed) this.tone(v, t + 0.05, 'triangle', 380, 1500, 0.08, 0.01, 0.28)
  }

  /** Drawing a weapon: a steel "shing", a heavy clunk, a wooden tap — or just a cloth rustle for fists. */
  equip(weapon: WeaponId): void {
    if (!this.gate('equip', 0.08)) return
    const t = this.t
    const v = this.voice(this.mix.sfx, 1, { wet: 0.25 })
    const kind = KIND[weapon]
    if (kind === 'sword') {
      this.noiseHit(v, t, 'bandpass', 5200, 3, 0.12, 0.01, 0.3, 7600)
      this.chime(v, t + 0.04, 1850, 0.025, 0.7, 3.5, 0.8)
      if (weapon === 'starblade') this.chime(v, t + 0.1, 2793, 0.02, 1.1, 2, 0.6)
    } else if (kind === 'hammer') {
      this.tone(v, t, 'sine', 180, 90, 0.25, 0.003, 0.14)
      this.chime(v, t, 420, 0.03, 0.4, 1.41, 1.5)
    } else if (weapon === 'bow') {
      this.noiseHit(v, t, 'bandpass', 1200, 4, 0.12, 0.002, 0.05)
      this.tone(v, t + 0.02, 'triangle', 196, 192, 0.06, 0.003, 0.3)
    } else {
      this.whoosh(v, t, 600, 1400, 0.14, 0.08, 1)
    }
  }

  pickup(): void {
    const t = this.t
    const v = this.voice(this.mix.sfx, 1, { wet: 0.55 })
    ;[74, 78, 81, 86].forEach((n, i) => this.chime(v, t + i * 0.07, mtof(n), 0.05, 1.2, 2, 0.9))
  }

  /** A hard limp landing: a springy cartoon "boing" or a little "oof". */
  flop(impact: number): void {
    if (!this.gate('flop', 0.35)) return
    const t = this.t
    const s = this.s
    const v = this.voice(this.mix.sfx, 1.2, { wet: 0.2 })
    if (Math.random() < 0.5) {
      const env = s.gain(0, v)
      const end = s.perc(env.gain, t, 0.2, 0.005, 0.6)
      const o = s.osc('triangle', 150, env, t, end)
      o.frequency.setValueAtTime(150, t)
      o.frequency.exponentialRampToValueAtTime(620, t + 0.08)
      o.frequency.exponentialRampToValueAtTime(330, t + 0.6)
      const wob = s.gain(0, o.frequency)
      wob.gain.setValueAtTime(70, t)
      wob.gain.linearRampToValueAtTime(0, t + 0.6)
      s.osc('sine', 19, wob, t, end)
      return
    }
    // "Oof": a buzzy voice through two "oo" formants, falling in pitch, with a breathy tail.
    const p = rand(0.9, 1.15) * (impact > 20 ? 0.9 : 1)
    const env = s.gain(0, v)
    const end = s.ahr(env.gain, t, 0.5, 0.012, 0.07, 0.16)
    const f1 = s.filter('bandpass', 330, 5, env)
    const f2 = s.filter('bandpass', 900, 7, env)
    const o = s.osc('sawtooth', 200 * p, f1, t, end)
    o.connect(f2)
    s.glide(o.frequency, t, 210 * p, 120 * p, 0.25)
    this.noiseHit(v, t + 0.14, 'highpass', 2500, 0.7, 0.03, 0.02, 0.12)
  }

  /* ── world ───────────────────────────────────────────────── */

  /** A block set down: a firm tap of its material over a short, low body. */
  blockPlace(pos: V3, surface: Surface): void {
    if (!this.gate('bplace', 0.05)) return
    const t = this.t
    const v = this.voice(this.mix.sfx, 1.1, { pos, ref: 6 })
    this.surfaceLayer(v, t, surface, rand(0.75, 0.9))
    this.tone(v, t, 'sine', 170, 75, 0.2, 0.003, 0.09)
  }

  /** A block broken: its material cracks, then a few pieces of it scatter. */
  blockBreak(pos: V3, surface: Surface): void {
    if (!this.gate('bbreak', 0.05)) return
    const t = this.t
    const v = this.voice(this.mix.sfx, 1.2, { pos, ref: 6, wet: 0.2 })
    this.surfaceLayer(v, t, surface, rand(1, 1.15), true)
    this.tone(v, t, 'sine', 130, 48, 0.3, 0.003, 0.16)
    this.noiseHit(v, t, 'lowpass', 1800, 0.8, 0.2, 0.003, 0.18, 300)
    for (let k = 0; k < 4; k++) this.surfaceLayer(this.s.gain(rand(0.25, 0.45), v), t + 0.05 + k * rand(0.035, 0.07), surface, rand(1.1, 1.5))
  }

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
    const light = name === 'ui-hover' || name === 'ui-tick'
    if (!this.gate(name, light ? 0.035 : 0.05)) return
    const t = this.t
    const v = this.voice(this.mix.ui, 1, { wet: light ? 0 : 0.3 })
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
      case 'ui-toggle':
        // A switch: a low tick answered by a brighter one.
        this.tone(v, t, 'triangle', 980, 940, 0.05, 0.003, 0.04)
        this.tone(v, t + 0.045, 'triangle', 1470, 1470, 0.05, 0.003, 0.07)
        break
      case 'ui-tick':
        this.tone(v, t, 'sine', 1900, 1840, 0.032, 0.002, 0.025)
        break
      case 'ui-error':
        // Two dull, falling notes: "no".
        this.tone(v, t, 'triangle', 330, 300, 0.07, 0.004, 0.1)
        this.tone(v, t + 0.1, 'triangle', 262, 236, 0.07, 0.004, 0.15)
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

  /* ── worlds & bosses ─────────────────────────────────────── */

  /** Stepping into a portal: a rising, swirling rush. */
  portal(): void {
    if (!this.gate('portal', 0.5)) return
    const t = this.t
    const v = this.voice(this.mix.sfx, 1.1, { wet: 0.8 })
    this.whoosh(v, t, 300, 3200, 0.9, 0.16, 2.5)
    this.whoosh(v, t + 0.15, 1800, 400, 0.7, 0.08, 3)
    for (let k = 0; k < 5; k++) this.chime(v, t + 0.05 + k * 0.07, mtof(HIGH_PENTA[(k * 2) % HIGH_PENTA.length]), 0.03, 0.9, 2, 0.7)
  }

  /** Arriving on the far side: the rush falls away into a soft shimmer. */
  travel(): void {
    if (!this.gate('travel', 0.5)) return
    const t = this.t
    const v = this.voice(this.mix.sfx, 1, { wet: 0.9 })
    this.whoosh(v, t, 4200, 350, 1.1, 0.14, 1.6)
    this.tone(v, t, 'sine', 90, 45, 0.2, 0.02, 0.7)
    for (let k = 0; k < 4; k++) this.chime(v, t + 0.25 + k * 0.09, mtof(HIGH_PENTA[6 - k * 2]), 0.028, 1.1, 2, 0.6)
  }

  /** A boss hazard is charging: a rising, wavering warning tone that lasts until it goes off. */
  telegraph(pos: V3, delay: number): void {
    if (!this.gate('tele', 0.18)) return
    const t = this.t
    const s = this.s
    const dur = Math.min(1.6, Math.max(0.35, delay || 0.7))
    const v = this.voice(this.mix.sfx, 0.9, { pos, ref: 12, wet: 0.4 })
    const env = s.gain(0, v)
    const end = s.ahr(env.gain, t, 0.09, dur * 0.7, 0, dur * 0.3)
    const o = s.osc('triangle', 300, env, t, end)
    s.glide(o.frequency, t, 300, 720, dur)
    s.osc('sine', 11, s.gain(0.04, env.gain), t, end)
    this.noiseHit(v, t, 'bandpass', 1800, 3, 0.04, dur * 0.8, dur * 0.2, 3600, s.pink)
  }

  /** A boss roar: a growling low sweep with a breathy rasp (the Golem's is stonier). */
  roar(pos: V3, boss: BossId): void {
    if (!this.gate('roar', 0.6)) return
    const t = this.t
    const s = this.s
    const v = this.voice(this.mix.sfx, 2.2, { pos, ref: 14, wet: 0.6 })
    const stone = boss === 'frostGolem'
    const env = s.gain(0, v)
    const lp = s.filter('lowpass', stone ? 500 : 900, 2, env)
    s.glide(lp.frequency, t, stone ? 300 : 500, stone ? 900 : 1500, 0.5)
    const end = s.ahr(env.gain, t, 0.35, 0.18, 0.6, 0.7)
    s.osc('sawtooth', stone ? 55 : 82, lp, t, end, -12)
    s.osc('sawtooth', stone ? 56 : 84, lp, t, end, 14)
    s.osc('square', stone ? 41 : 61, lp, t, end)
    this.noiseHit(v, t, 'bandpass', stone ? 600 : 1100, 1.2, 0.25, 0.15, 1.2, stone ? 300 : 500, stone ? s.brown : s.pink)
  }

  /** A boss lands, stomps or crashes: a huge thud and a rumble. */
  bossSlam(pos: V3): void {
    if (!this.gate('bslam', 0.12)) return
    const t = this.t
    const v = this.voice(this.mix.sfx, 2, { pos, ref: 14, wet: 0.5 })
    this.tone(v, t, 'sine', 90, 26, 0.8, 0.004, 0.8)
    this.noiseHit(v, t, 'lowpass', 900, 0.8, 0.5, 0.004, 0.6, 80, this.s.brown)
    this.noiseHit(v, t + 0.02, 'bandpass', 1800, 1.1, 0.12, 0.003, 0.2, 500)
  }

  /** A telegraphed hazard goes off. */
  bossImpact(pos: V3, kind: 'orb' | 'boulder' | 'spike'): void {
    if (!this.gate(`imp-${kind}`, kind === 'spike' ? 0.05 : 0.08)) return
    const t = this.t
    const v = this.voice(this.mix.sfx, 1.4, { pos, ref: 8, wet: 0.4 })
    if (kind === 'spike') {
      this.noiseHit(v, t, 'highpass', 3000, 1, 0.2, 0.002, 0.08)
      this.chime(v, t, rand(1900, 2600), 0.05, 0.4, 3.5, 1.5)
      this.tone(v, t, 'sine', 220, 120, 0.12, 0.002, 0.08)
    } else if (kind === 'boulder') {
      this.tone(v, t, 'sine', 110, 34, 0.6, 0.003, 0.5)
      this.noiseHit(v, t, 'lowpass', 1400, 0.8, 0.4, 0.003, 0.4, 120, this.s.brown)
    } else {
      this.tone(v, t, 'sine', 180, 45, 0.4, 0.003, 0.35)
      this.noiseHit(v, t, 'bandpass', 700, 1.5, 0.3, 0.004, 0.4, 2400, this.s.pink)
      this.tone(v, t, 'triangle', 640, 160, 0.06, 0.004, 0.3)
    }
  }

  /** The boss is beaten: a bright victory sting. */
  bossVictory(): void {
    const t = this.t
    const v = this.voice(this.mix.sfx, 1.3, { wet: 0.8 })
    this.swellChord(v, t, [50, 57, 62, 66, 69], 0.08, 0.5, 1.6, 0.07, 800, 4800)
    const notes = [74, 78, 81, 86]
    for (let k = 0; k < notes.length; k++) this.chime(v, t + k * 0.11, mtof(notes[k]), 0.06, 1.6, 2, 0.8)
    this.swellChord(v, t + 0.5, [50, 57, 62, 66, 69, 74], 0.05, 1.2, 2.4, 0.08, 1200, 5200)
    this.tone(v, t + 0.5, 'sine', 73, 36, 0.4, 0.01, 1.4)
  }

  /** A chest creaks open onto something shiny. */
  chest(): void {
    const t = this.t
    const v = this.voice(this.mix.sfx, 1.2, { wet: 0.6 })
    this.noiseHit(v, t, 'bandpass', 700, 6, 0.2, 0.02, 0.3, 1100)
    this.tone(v, t + 0.25, 'sine', 140, 90, 0.18, 0.004, 0.12)
    for (let k = 0; k < 6; k++) this.chime(v, t + 0.3 + k * 0.08, mtof(HIGH_PENTA[k % HIGH_PENTA.length] + 12), 0.035, 1.2, 2, 0.6)
  }
}
