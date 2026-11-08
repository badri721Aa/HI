/**
 * The procedural score: one small "song" per music mood, all in D so moods
 * cross-fade without clashing. Each song is driven one 16th-note step at a
 * time by the scheduler in music.ts and decides what to play from the step
 * index alone, plus a seeded random source for gentle variations.
 *
 * Melodies are written as compact strings: `F#5:2 A5 r:2` = F♯5 for two
 * eighths, A5 for one eighth, then a two-eighth rest. `|` marks bar lines.
 */
import type { MusicMood } from '../events'
import type { Instruments } from './instruments'

export interface TrackState {
  ins: Instruments
  /** Seeded random in [0, 1). */
  r: () => number
  /** Seconds per 16th note. */
  t16: number
}

export interface Song {
  bpm: number
  /** Delay applied to off-beat eighths, as a fraction of a 16th. */
  swing: number
  /** Restart from the top every time (otherwise resume at the next phrase). */
  restart: boolean
  /** Called once per 16th step; `i` counts steps since the song began. */
  step(p: TrackState, i: number, t: number): void
}

/* ── melody notation ───────────────────────────────────────── */

interface NoteEv {
  midi: number
  /** Length in 16ths. */
  len: number
}

const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

function noteToMidi(name: string): number {
  const m = /^([A-G])(#|b)?(\d)$/.exec(name)
  if (!m) throw new Error(`bad note ${name}`)
  return 12 * (Number(m[3]) + 1) + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0)
}

/** Parses a melody into a lookup table indexed by 16th step (null = nothing starts there). */
function melody(src: string): Array<NoteEv | null> {
  const out: Array<NoteEv | null> = []
  for (const tok of src.replace(/\|/g, ' ').split(/\s+/).filter(Boolean)) {
    const [name, d] = tok.split(':')
    const len = (d ? Number(d) : 1) * 2
    out.push(name === 'r' ? null : { midi: noteToMidi(name), len })
    for (let k = 1; k < len; k++) out.push(null)
  }
  return out
}

/* ── harmony ───────────────────────────────────────────────── */

interface Chord {
  pad: readonly number[]
  root: number
  /** Arpeggio pool (pentatonic chord tones, low → high). */
  arp: readonly number[]
}

const D: Chord = { pad: [50, 57, 64, 66], root: 38, arp: [62, 64, 66, 69, 74] }
const Bm: Chord = { pad: [57, 59, 62, 66], root: 47, arp: [59, 62, 64, 66, 71] }
const G: Chord = { pad: [55, 59, 62, 66], root: 43, arp: [62, 66, 67, 71, 74] }
const A: Chord = { pad: [52, 57, 61, 64], root: 45, arp: [61, 64, 69, 71, 76] }
const Asus: Chord = { pad: [52, 57, 62, 64], root: 45, arp: [62, 64, 69, 71, 76] }
const DF: Chord = { pad: [50, 57, 62, 66], root: 42, arp: [62, 66, 69, 74, 78] }
const Em: Chord = { pad: [55, 59, 62, 64], root: 40, arp: [59, 62, 64, 67, 71] }

/** Pitch classes of D major. */
const D_MAJOR = [1, 2, 4, 6, 7, 9, 11]
const inKey = (m: number) => D_MAJOR.includes(((m % 12) + 12) % 12)

/** A diatonic approach note leading into `target` from below. */
const approach = (target: number) => (inKey(target - 1) ? target - 1 : target - 2)

/* ── title: warm pads and a slow pentatonic arpeggio ───────── */

const TITLE_CHORDS = [D, Bm, G, Asus]
const TITLE_ARP = [
  [0, 2, 4, 3, 1, 3, 2, 4],
  [0, 1, 2, 4, 3, 2, 1, 2],
]

const title: Song = {
  bpm: 72,
  swing: 0,
  restart: true,
  step(p, i, t) {
    const bar = i >> 4
    const s = i & 15
    const b = bar % 8
    const ch = TITLE_CHORDS[b >> 1]
    const ins = p.ins
    if (s === 0 && (b & 1) === 0) {
      ins.pad(t, ch.pad, p.t16 * 32, 1.1, { attack: 1.8, release: 2.6, bright: 1250, wave: 'triangle' })
      ins.pad(t, ch.pad, p.t16 * 32, 0.6, { attack: 2.2, release: 2.6, bright: 900 })
      ins.sub(t, ch.root, p.t16 * 32, 0.7)
    }
    // Lighter on the very first bars so the theme fades in.
    if ((s & 1) === 0 && (bar >= 2 || s >= 8)) {
      const pat = TITLE_ARP[(b & 1) ^ (Math.floor(bar / 8) & 1)]
      const n = ch.arp[pat[s >> 1]]
      ins.bell(t, n, s === 0 ? 1 : 0.7, 1.6, 2)
    }
    // An answering high note now and then.
    if (s === 8 && (b & 1) === 1 && p.r() < 0.55) ins.bell(t, ch.arp[2 + Math.floor(p.r() * 3)] + 12, 0.45, 2.2, 2)
  },
}

/* ── explore: plucked melody, pads, walking bass, brushes ─── */

const EX_SECTIONS: Chord[][] = [
  [D, Bm, G, A],
  [D, Bm, G, A],
  [G, DF, Em, Asus],
  [D, Bm, G, A],
]

const EX_MELODY = [
  melody('F#5:2 A5 F#5 E5:2 D5 E5 | F#5:3 E5 D5:2 B4:2 | D5 E5 F#5:2 A5 B5 A5:2 | F#5:4 E5:2 r:2'),
  melody('F#5:2 A5 F#5 E5:2 D5 E5 | F#5:3 A5 B5:2 A5:2 | D6:2 B5 A5 F#5:2 E5 D5 | E5:4 r:4'),
  melody('B4:2 D5 E5 D5:2 B4 A4 | A4:3 B4 D5:4 | E5:2 D5 B4 D5:2 E5 F#5 | E5:3 D5 E5:4'),
  melody('F#5:2 A5 F#5 E5:2 D5 E5 | F#5:3 E5 D5:2 B4:2 | D5 E5 F#5:2 A5:2 B5 A5 | D5:6 r:2'),
]

/** D-major pentatonic, for ornaments. */
const PENTA = [57, 59, 62, 64, 66, 69, 71, 74, 76, 78, 81, 83, 86]
const pentaAbove = (m: number) => PENTA.find(n => n > m) ?? m + 2

const explore: Song = {
  bpm: 92,
  swing: 0.28,
  restart: false,
  step(p, i, t) {
    const ins = p.ins
    const bar = i >> 4
    const s = i & 15
    const b = bar % 16
    const cycle = Math.floor(bar / 16)
    const v = cycle % 4
    const sec = b >> 2
    const bi = b & 3
    const ch = EX_SECTIONS[sec][bi]
    const nextCh = EX_SECTIONS[((b + 1) % 16) >> 2][(b + 1) & 3]
    const sparse = v === 2 && b < 8

    if (s === 0) ins.pad(t, ch.pad, p.t16 * 16, sparse ? 0.85 : 0.65, { attack: 0.6, release: 1.4, bright: 1300 })

    // Walking bass on the beats (half-time in the breakdown).
    if ((s & 3) === 0 && (!sparse || (s & 7) === 0)) {
      const beat = s >> 2
      let n = ch.root
      if (beat === 1) n = ch.root + 7
      else if (beat === 2) n = p.r() < 0.5 ? ch.root + 12 : ch.root + 9
      else if (beat === 3) n = approach(nextCh.root)
      ins.bass(t, n, p.t16 * (sparse ? 7 : 3.5), beat === 0 ? 1 : 0.8)
    }

    // Melody: plucked on even cycles, ocarina on odd ones; resting in the breakdown.
    const ev = EX_MELODY[sec][bi * 16 + s]
    if (ev && !sparse) {
      const dur = ev.len * p.t16
      let at = t
      if (ev.len >= 4 && p.r() < 0.16) {
        ins.pluck(t, pentaAbove(ev.midi), p.t16, 0.45, false)
        at = t + p.t16 * 0.5
      }
      if (v === 1 || v === 3) ins.ocarina(at, ev.midi, dur, 0.95)
      else ins.pluck(at, ev.midi, dur, 0.95)
    }

    // Soft counter-arpeggio on the variation cycles.
    if ((v === 1 || v === 2) && (s & 1) === 0 && (s & 2) === 0) {
      const k = ((s >> 2) + bi) % ch.arp.length
      ins.pluck(t, ch.arp[k] + (v === 2 ? 0 : 12), p.t16 * 2, v === 2 ? 0.5 : 0.28)
    }

    // Brushed kit.
    if (sparse) {
      if (s === 12) ins.brush(t, 0.6, true)
      if ((s & 3) === 2) ins.shaker(t, 0.5)
      return
    }
    if (s === 0) ins.kick(t, 0.9)
    if (s === 8) ins.kick(t, 0.65)
    if (s === 14 && p.r() < 0.3) ins.kick(t, 0.4)
    if (s === 4 || s === 12) ins.brush(t, 0.9, s === 12 && bi === 3)
    if ((s & 1) === 0) ins.shaker(t, (s & 3) === 0 ? 0.55 : 0.85)
    if (bi === 3 && (sec & 1) === 1 && s >= 13) ins.brush(t, 0.35)
  },
}

/* ── danger: low ostinato, muted percussion (D minor) ──────── */

const DANGER = [
  { root: 38, pad: [50, 53, 57] },
  { root: 34, pad: [50, 53, 58] },
  { root: 43, pad: [50, 55, 58] },
  { root: 45, pad: [49, 52, 57] },
]
/** Ostinato offsets per 16th (null = rest). */
const OSTINATO = [0, null, 0, 12, 0, null, 0, 7, 0, null, 0, 12, 0, null, 8, 7]

const danger: Song = {
  bpm: 112,
  swing: 0,
  restart: false,
  step(p, i, t) {
    const ins = p.ins
    const bar = i >> 4
    const s = i & 15
    const b = bar % 4
    const ch = DANGER[b]
    if (s === 0) ins.pad(t, ch.pad, p.t16 * 16, 0.9, { attack: 0.35, release: 0.8, bright: 650 })
    const o = OSTINATO[s]
    if (o !== null) ins.pulse(t, ch.root + o, s === 0 || s === 8 ? 1 : 0.7)
    if (s === 0 || s === 6 || s === 10) ins.tom(t, s === 0 ? 40 : 43, s === 0 ? 1 : 0.7)
    if (s === 4 || s === 12) ins.rim(t, 0.6)
    ins.tick(t, (s & 1) === 0 ? 0.6 : 0.3)
    // A high, unresolved bell every other bar.
    if (b === 1 && s === 0) ins.bell(t, 86, 0.35, 2, 3.5)
    if (b === 3 && s === 0) ins.bell(t, 85, 0.35, 1.2, 3.5)
    if (b === 3 && s === 8) ins.bell(t, 81, 0.3, 1.6, 3.5)
  },
}

/* ── cutscene: swelling pads, shimmer ──────────────────────── */

const CUT_CHORDS = [G, Asus, Bm, D]

const cutscene: Song = {
  bpm: 64,
  swing: 0,
  restart: false,
  step(p, i, t) {
    const ins = p.ins
    const bar = i >> 4
    const s = i & 15
    const b = bar % 8
    const ch = CUT_CHORDS[b >> 1]
    if (s === 0 && (b & 1) === 0) {
      ins.pad(t, ch.pad, p.t16 * 32, 1, { attack: 2.4, release: 3, bright: 1700 })
      ins.pad(t, ch.arp, p.t16 * 32, 0.35, { attack: 3, release: 3, bright: 2400, wave: 'triangle' })
      ins.sub(t, ch.root, p.t16 * 32, 0.8)
    }
    if (s === 0 && (b & 3) === 0) ins.swell(t, p.t16 * 28, 0.8)
    if ((s & 1) === 0 && p.r() < 0.16) ins.bell(t, ch.arp[Math.floor(p.r() * ch.arp.length)] + 12, 0.3, 2.6, 2, 0.05)
  },
}

/* ── victory: fanfare into a bright loop of the theme ──────── */

const VIC_CHORDS = [
  { pad: [57, 62, 66, 69], root: 38 },
  { pad: [59, 62, 67, 71], root: 43 },
  { pad: [59, 62, 66, 71], root: 47 },
  { pad: [57, 61, 64, 69], root: 45 },
  { pad: [57, 62, 66, 69], root: 38 },
  { pad: [59, 62, 67, 71], root: 43 },
  { pad: [57, 61, 64, 69], root: 45 },
  { pad: [57, 62, 66, 69], root: 38 },
]
const VIC_MELODY = melody(
  'D5 F#5 A5:2 D6:3 A5 | B5:3 A5 G5:2 B5:2 | F#5:2 D5 F#5 B5:2 A5:2 | A5:4 E5 F#5 G5 A5 |' +
    'F#5:2 A5 F#5 E5:2 D5 E5 | B5:3 A5 G5 A5 B5:2 | A5:2 C#6:2 E6:2 C#6 A5 | D6:6 r:2',
)
const FANFARE: Array<[bar: number, step: number, len: number, notes: number[]]> = [
  [0, 0, 6, [62, 66, 69]],
  [0, 6, 2, [62, 66, 69]],
  [0, 8, 8, [62, 66, 69, 74]],
  [1, 0, 4, [62, 67, 71]],
  [1, 4, 4, [64, 69, 73]],
  [1, 8, 8, [66, 69, 74, 78]],
]

const victory: Song = {
  bpm: 104,
  swing: 0.12,
  restart: true,
  step(p, i, t) {
    const ins = p.ins
    const bar = i >> 4
    const s = i & 15
    if (bar < 2) {
      for (const [fb, fs, len, notes] of FANFARE) if (fb === bar && fs === s) ins.brass(t, notes, len * p.t16, 1)
      if (bar === 0 && s === 0) ins.sub(t, 38, p.t16 * 32, 0.9)
      if (bar === 1 && s >= 12) ins.tom(t, 45 + (s - 12) * 2, 0.5 + (s - 12) * 0.12)
      return
    }
    const b = (bar - 2) % 8
    const ch = VIC_CHORDS[b]
    if (s === 0) ins.pad(t, ch.pad, p.t16 * 16, 0.6, { attack: 0.25, release: 1.2, bright: 2200 })
    if (s === 0 || s === 6) ins.bass(t, ch.root, p.t16 * 5, s === 0 ? 1 : 0.8)
    if (s === 8 || s === 14) ins.bass(t, ch.root + (s === 8 ? 7 : 12), p.t16 * 4, 0.8)
    const ev = VIC_MELODY[b * 16 + s]
    if (ev) {
      ins.brass(t, [ev.midi], ev.len * p.t16, 0.8)
      ins.bell(t, ev.midi + 12, 0.22, 0.8, 2)
    }
    if (s === 0 || s === 8) ins.kick(t, 0.9)
    if (s === 4 || s === 12) ins.snare(t, 0.85)
    if ((s & 1) === 0) ins.shaker(t, (s & 3) === 0 ? 0.5 : 0.8)
    if (b === 0 && s === 0) ins.swell(t, p.t16 * 12, 0.6)
  },
}

export const SONGS: Record<MusicMood, Song> = { title, explore, danger, cutscene, victory }
