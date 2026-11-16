/**
 * Lookahead music scheduler. A ~25 ms timer schedules every 16th-note step
 * that falls within the next ~120 ms at exact AudioContext times, so timing
 * never depends on frame rate. Mood changes cross-fade over two seconds; a
 * mood that comes back (explore after danger) resumes at its next phrase.
 */
import type { MusicMood } from '../events'
import { Instruments } from './instruments'
import type { Mixer } from './mixer'
import { SONGS, type Song, type TrackState } from './songs'
import { rng, type Synth } from './synth'

const TICK_MS = 25
const LOOKAHEAD = 0.12
const FADE = 2
/** Steps per phrase (4 bars of 16ths) — where returning moods pick up. */
const PHRASE = 64
/** Make-up gain on the score (unity for duck()). */
const LEVEL = 1.25

interface Track extends TrackState {
  mood: MusicMood
  song: Song
  i: number
  next: number
  stopAt: number
  gains: GainNode[]
}

export class Music {
  mood: MusicMood | null = null
  private tracks: Track[] = []
  private resume: Partial<Record<MusicMood, number>> = {}
  private timer: ReturnType<typeof setInterval> | null = null
  private out: GainNode
  private wetOut: GainNode
  private echoOut: GainNode
  private seed = 1

  constructor(
    private syn: Synth,
    private mix: Mixer,
  ) {
    this.out = syn.gain(LEVEL, mix.music.input)
    this.wetOut = syn.gain(1, mix.music.wet)
    this.echoOut = syn.gain(1, mix.echo)
  }

  start(): void {
    if (this.timer === null) this.timer = setInterval(this.tick, TICK_MS)
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer)
    this.timer = null
  }

  setMood(mood: MusicMood): void {
    if (mood === this.mood) return
    this.mood = mood
    const now = this.syn.now
    for (const tr of this.tracks) {
      if (tr.stopAt !== Infinity) continue
      tr.stopAt = now + FADE
      if (!tr.song.restart) this.resume[tr.mood] = Math.ceil(tr.i / PHRASE) * PHRASE
      for (const g of tr.gains) {
        g.gain.cancelScheduledValues(now)
        g.gain.setValueAtTime(g.gain.value, now)
        g.gain.linearRampToValueAtTime(0, now + FADE)
      }
    }
    const song = SONGS[mood]
    const start = now + 0.06
    const gains = [this.syn.gain(0, this.out), this.syn.gain(0, this.wetOut), this.syn.gain(0, this.echoOut)]
    for (const g of gains) {
      g.gain.setValueAtTime(0, now)
      g.gain.linearRampToValueAtTime(1, now + FADE)
    }
    const t16 = 60 / song.bpm / 4
    this.tracks.push({
      mood,
      song,
      ins: new Instruments(this.syn, { dry: gains[0], wet: gains[1], echo: gains[2] }),
      r: rng(this.seed++ * 7919),
      t16,
      i: song.restart ? 0 : (this.resume[mood] ?? 0),
      next: start,
      stopAt: Infinity,
      gains,
    })
    this.mix.setEchoTime(t16 * 3, now)
  }

  /** Dip the score under a big sound effect for `hold` seconds. */
  duck(amount: number, hold: number): void {
    const g = this.out.gain
    const now = this.syn.now
    g.cancelScheduledValues(now)
    g.setTargetAtTime(amount * LEVEL, now, 0.12)
    g.setTargetAtTime(LEVEL, now + hold, 0.8)
  }

  dispose(): void {
    this.stop()
    this.tracks.length = 0
  }

  private tick = (): void => {
    const now = this.syn.now
    const horizon = now + LOOKAHEAD
    for (let k = this.tracks.length - 1; k >= 0; k--) {
      const tr = this.tracks[k]
      if (now > tr.stopAt + 0.5) {
        for (const g of tr.gains) g.disconnect()
        this.tracks.splice(k, 1)
        continue
      }
      // After a stall (busy main thread, throttled timer) skip the missed steps
      // instead of firing them all at once, keeping the grid aligned.
      if (tr.next < now - 0.05) {
        const missed = Math.ceil((now - tr.next) / tr.t16)
        tr.i += missed
        tr.next += missed * tr.t16
      }
      while (tr.next < horizon && tr.next < tr.stopAt) {
        const t = tr.next + ((tr.i & 3) === 2 ? tr.song.swing * tr.t16 : 0)
        try {
          tr.song.step(tr, tr.i, t)
        } catch (err) {
          console.warn('[starfall] music step failed', err)
          tr.stopAt = now
        }
        tr.i++
        tr.next += tr.t16
      }
    }
  }
}
