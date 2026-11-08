/**
 * The static part of the audio graph, built once on unlock:
 *
 *   bus.input → volume → duck ─┬→ master → glue compressor → limiter → out → destination
 *                              └→ reverb send ─→ reverb ─→ master
 *   bus.wet (per-voice extra reverb) → volume → duck → reverb
 *   music echo (tempo delay with filtered feedback) → music bus
 */
import { makeImpulse, type Synth } from './synth'

/** Time constant (s) for volume / duck changes. */
const SMOOTH = 0.08

export class Bus {
  /** Dry input; voices connect here. */
  readonly input: GainNode
  /** Extra reverb input for voices that want more space (bells, swells). */
  readonly wet: GainNode
  private vol: GainNode
  private wetVol: GainNode
  private duckN: GainNode
  private wetDuck: GainNode

  constructor(syn: Synth, master: AudioNode, reverb: AudioNode, send: number) {
    this.duckN = syn.gain(1, master)
    this.duckN.connect(syn.gain(send, reverb))
    this.vol = syn.gain(0, this.duckN)
    this.input = syn.gain(1, this.vol)
    this.wetDuck = syn.gain(1, reverb)
    this.wetVol = syn.gain(0, this.wetDuck)
    this.wet = syn.gain(1, this.wetVol)
  }

  setVolume(v: number, t: number): void {
    this.vol.gain.setTargetAtTime(v, t, SMOOTH)
    this.wetVol.gain.setTargetAtTime(v, t, SMOOTH)
  }

  /** Smoothly scale the bus (pause menu, dialogs). `tc` is the time constant in seconds. */
  setDuck(v: number, t: number, tc = 0.25): void {
    this.duckN.gain.setTargetAtTime(v, t, tc)
    this.wetDuck.gain.setTargetAtTime(v, t, tc)
  }
}

export class Mixer {
  readonly master: GainNode
  readonly music: Bus
  readonly sfx: Bus
  readonly ambience: Bus
  readonly ui: Bus
  /** Input of the tempo-synced music echo. */
  readonly echo: GainNode
  /** Development-only tap on the final output (null in production). */
  readonly analyser: AnalyserNode | null
  private delay: DelayNode

  constructor(syn: Synth, debug: boolean) {
    const ac = syn.ac
    const t = ac.currentTime

    // Output stage: gentle glue compression, then a fast limiter so peaks never clip.
    const glue = ac.createDynamicsCompressor()
    glue.threshold.value = -14
    glue.knee.value = 10
    glue.ratio.value = 2.5
    glue.attack.value = 0.006
    glue.release.value = 0.25
    const limiter = ac.createDynamicsCompressor()
    limiter.threshold.value = -4
    limiter.knee.value = 0
    limiter.ratio.value = 20
    limiter.attack.value = 0.002
    limiter.release.value = 0.12
    const out = syn.gain(0.9)
    glue.connect(limiter)
    limiter.connect(out)
    if (debug) {
      this.analyser = ac.createAnalyser()
      this.analyser.fftSize = 2048
      out.connect(this.analyser)
      this.analyser.connect(ac.destination)
    } else {
      this.analyser = null
      out.connect(ac.destination)
    }
    // Head-room trim before the compressor (the compressor adds make-up gain).
    this.master = syn.gain(0, syn.gain(0.95, glue))

    // Shared reverb.
    const reverb = ac.createConvolver()
    reverb.buffer = makeImpulse(ac, 2.6, 3.4)
    const tone = syn.filter('lowpass', 5200, 0.5, syn.gain(0.75, this.master))
    reverb.connect(tone)

    this.music = new Bus(syn, this.master, reverb, 0.32)
    this.sfx = new Bus(syn, this.master, reverb, 0.14)
    this.ambience = new Bus(syn, this.master, reverb, 0.05)
    this.ui = new Bus(syn, this.master, reverb, 0.06)

    // Music echo: delay → darkening filter → feedback; returns into the music bus.
    this.echo = syn.gain(1)
    this.delay = ac.createDelay(2)
    this.delay.delayTime.value = 0.49
    const echoTone = syn.filter('lowpass', 2600, 0.5)
    const fb = syn.gain(0.34, this.delay)
    this.echo.connect(this.delay)
    this.delay.connect(echoTone)
    echoTone.connect(fb)
    echoTone.connect(syn.gain(0.55, this.music.input))
    this.master.gain.setValueAtTime(0, t)
  }

  /** Re-time the echo to the current tempo (a dotted eighth). */
  setEchoTime(seconds: number, t: number): void {
    this.delay.delayTime.setTargetAtTime(Math.min(1.5, seconds), t, 0.2)
  }

  /** Volumes are 0..1 sliders; a squared taper feels even across the range. */
  setVolumes(master: number, music: number, sfx: number, ambience: number, t: number): void {
    const taper = (v: number) => Math.max(0, Math.min(1, v)) ** 2
    this.master.gain.setTargetAtTime(taper(master), t, SMOOTH)
    this.music.setVolume(taper(music), t)
    this.sfx.setVolume(taper(sfx), t)
    this.ambience.setVolume(taper(ambience), t)
    this.ui.setVolume(taper(sfx), t)
  }
}
