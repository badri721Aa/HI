/**
 * Game modes for online rooms: what each mode is, where it is played and the
 * round state the room host broadcasts (with the validation every receiver runs).
 */
import { heightAt } from '../../world/heightfield'
import { isPeerId, sanitizeName } from '../protocol'

export type ModeId = 'tag' | 'knockout' | 'race' | 'koth' | 'hide'
export type RoundPhase = 'idle' | 'countdown' | 'live' | 'results'

export interface ModeDef {
  id: ModeId
  name: string
  blurb: string
  /** Round length (s). */
  duration: number
  minPlayers: number
  /** Players can knock each other about. */
  pvp: boolean
  /** How the scoreboard reads a player's score. */
  score: 'time' | 'kos' | 'rings' | 'points' | 'tags'
}

export const MODES: readonly ModeDef[] = [
  { id: 'tag', name: 'Tag', blurb: 'One player is It. Touch someone to pass it on — least time as It wins.', duration: 150, minPlayers: 2, pvp: true, score: 'time' },
  { id: 'knockout', name: 'Knockout', blurb: 'Hammers on a floating arena. Three lives each — last one standing wins.', duration: 180, minPlayers: 2, pvp: true, score: 'kos' },
  { id: 'race', name: 'Race', blurb: 'Through the glowing rings from the beach to the summit and back. Dash allowed.', duration: 180, minPlayers: 1, pvp: false, score: 'rings' },
  { id: 'koth', name: 'King of the Hill', blurb: 'Hold the glowing circle on the summit alone to score. It moves every 40 seconds.', duration: 160, minPlayers: 1, pvp: true, score: 'points' },
  { id: 'hide', name: 'Hide and Seek', blurb: 'The seeker counts to 20 while everyone hides. Caught hiders seek too.', duration: 180, minPlayers: 2, pvp: false, score: 'tags' },
]

export const MODE_BY_ID = Object.fromEntries(MODES.map(m => [m.id, m])) as Record<ModeId, ModeDef>

export const isModeId = (v: unknown): v is ModeId => typeof v === 'string' && v in MODE_BY_ID

/** Seconds of announcement before a round, and of results after it. */
export const COUNTDOWN = 5
export const RESULTS = 10

/** Touch distance for tagging (m, horizontal; feet within TOUCH_DY vertically). */
export const TOUCH = 1.4
export const TOUCH_DY = 1.8
/** After a pass, the new It can't tag the old one straight back (s). */
export const TAG_IMMUNITY = 3
/** The seeker's head start for the hiders (s). */
export const SEEK_HOLD = 20
export const LIVES = 3
/** King of the Hill: circle radius (m) and how long it stays put (s). */
export const HILL_R = 3.6
export const HILL_MOVE = 40
/** Race: a ring counts when the body passes this close to its centre (m). After the first finish the rest get this long (s). */
export const RING_R = 2.6
export const RING_HIT = 3.6
export const RACE_GRACE = 30

/** The Knockout arena: a stone disc floating over the sea south-west of the beach. `y` = floor. */
export const ARENA = { x: -100, y: 34, z: 100, r: 12 }
/** Below this the player has fallen off the arena. */
export const ARENA_FALL = ARENA.y - 6

export interface Spot {
  x: number
  y: number
  z: number
  yaw: number
}

const ground = (x: number, z: number, lift = 0): Spot => ({ x, y: heightAt(x, z) + lift, z, yaw: 0 })

/** Race rings in order (centres): beach → village → ruins ramp → lake → summit → back to the beach. */
export const RINGS: readonly Spot[] = (
  [[2, 90], [4, 62], [38, 38], [66, 18], [79, -10], [72, -36], [44, -50], [10, -52], [-2, -12], [2, 106]] as const
).map(([x, z], i, all) => {
  const next = all[(i + 1) % all.length]
  return { ...ground(x, z, 1.6), yaw: Math.atan2(next[0] - x, next[1] - z) }
})

/** King of the Hill circles around the Beacon, visited in turn. */
export const HILLS: readonly Spot[] = ([[10, -50], [-12, -66], [0, -46], [12, -68], [-10, -50], [0, -74]] as const).map(([x, z]) => ground(x, z))

/** Start points for participant slot `i` of `n` (feet on the ground; the arena floor for Knockout). */
export function startSpot(mode: ModeId, i: number, n: number): Spot {
  const a = (i / Math.max(1, n)) * Math.PI * 2
  const ring = (cx: number, cz: number, r: number, y?: number): Spot => {
    const x = cx + Math.sin(a) * r
    const z = cz + Math.cos(a) * r
    // Facing the middle.
    return { x, y: y ?? heightAt(x, z), z, yaw: a + Math.PI }
  }
  switch (mode) {
    case 'knockout':
      return ring(ARENA.x, ARENA.z, 8, ARENA.y)
    case 'race': {
      // A line across the beach path, facing the first ring.
      const x = (i - (n - 1) / 2) * 1.7
      return { x, y: heightAt(x, 114), z: 114, yaw: Math.PI }
    }
    case 'koth':
      return ring(0, -60, 13)
    case 'hide':
      return ring(2, 46, 3.5)
    default:
      return ring(0, 108, 8)
  }
}

/** Where Knockout players land back on the island after the round. */
export const ISLAND_RETURN = (i: number): Spot => startSpot('tag', i, 8)

/* ── round state (host → everyone) ───────────────────────────── */

/** Tag: It · Hide and Seek: seeker · Knockout: out of lives. */
export const ROLE_NONE = 0
export const ROLE_IT = 1
export const ROLE_OUT = 2

export interface Contestant {
  id: string
  name: string
  /** Start slot. */
  slot: number
  /** Tag: seconds as It · Knockout: KOs · Race: rings passed · KotH: points (s alone on the hill) · Hide: hiders caught. */
  score: number
  lives: number
  role: number
  /** Race: finish time · Hide: time caught (s into the round) · −1 = not yet. */
  done: number
}

export interface RoundState {
  /** Increments with every change the host makes. */
  seq: number
  /** Changes per round (start effects run once). */
  round: number
  mode: ModeId | null
  phase: RoundPhase
  /** Seconds left in this phase. */
  left: number
  /** Seconds since the round went live. */
  elapsed: number
  players: Contestant[]
  /** KotH: circle index and seconds until it moves. Hide: seeker's hold left. Tag: immune id and seconds left. */
  hill: number
  hillLeft: number
  hold: number
  immune: string
  immuneLeft: number
  /** Results: ids in final order (first = winner); `winners` how many of them won (hiders can share a win). */
  podium: string[]
  winners: number
}

/** The entry for `id`, or null (a plain loop: called every frame). */
export function contestant(s: RoundState, id: string): Contestant | null {
  for (let i = 0; i < s.players.length; i++) if (s.players[i].id === id) return s.players[i]
  return null
}

export function idleState(): RoundState {
  return { seq: 0, round: 0, mode: null, phase: 'idle', left: 0, elapsed: 0, players: [], hill: 0, hillLeft: 0, hold: 0, immune: '', immuneLeft: 0, podium: [], winners: 0 }
}

const PHASES: readonly RoundPhase[] = ['idle', 'countdown', 'live', 'results']
const MAX_CONTESTANTS = 12

const num = (v: unknown, lo: number, hi: number, dflt = 0): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt
const int = (v: unknown, lo: number, hi: number, dflt = 0): number => Math.round(num(v, lo, hi, dflt))

/** Parses a broadcast round state; null if it is malformed. Values are clamped to sane ranges. */
export function parseRound(raw: unknown): RoundState | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const phase = PHASES.find(p => p === o.phase)
  if (!phase || (o.mode !== null && !isModeId(o.mode)) || !Array.isArray(o.players) || o.players.length > MAX_CONTESTANTS) return null
  const players: Contestant[] = []
  const seen = new Set<string>()
  for (const p of o.players as unknown[]) {
    if (!p || typeof p !== 'object') return null
    const c = p as Record<string, unknown>
    if (!isPeerId(c.id) || seen.has(c.id)) return null
    seen.add(c.id)
    players.push({
      id: c.id,
      name: sanitizeName(c.name) || 'Player',
      slot: int(c.slot, 0, MAX_CONTESTANTS),
      score: num(c.score, 0, 9999),
      lives: int(c.lives, 0, LIVES),
      role: int(c.role, 0, 2),
      done: num(c.done, -1, 9999, -1),
    })
  }
  const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => isPeerId(x) && seen.has(x)).slice(0, MAX_CONTESTANTS) : [])
  return {
    seq: int(o.seq, 0, 2 ** 31),
    round: int(o.round, 0, 2 ** 31),
    mode: o.mode === null ? null : (o.mode as ModeId),
    phase: o.mode === null ? 'idle' : phase,
    left: num(o.left, 0, 600),
    elapsed: num(o.elapsed, 0, 600),
    players,
    hill: int(o.hill, 0, HILLS.length - 1),
    hillLeft: num(o.hillLeft, 0, HILL_MOVE),
    hold: num(o.hold, 0, SEEK_HOLD),
    immune: isPeerId(o.immune) ? o.immune : '',
    immuneLeft: num(o.immuneLeft, 0, TAG_IMMUNITY),
    podium: ids(o.podium),
    winners: int(o.winners, 0, MAX_CONTESTANTS),
  }
}

/** Copy for broadcasting (numbers rounded to keep the payload small). */
export function packRound(s: RoundState): Record<string, unknown> {
  const r = (v: number) => Math.round(v * 100) / 100
  return {
    ...s,
    left: r(s.left),
    elapsed: r(s.elapsed),
    hillLeft: r(s.hillLeft),
    hold: r(s.hold),
    immuneLeft: r(s.immuneLeft),
    players: s.players.map(p => ({ ...p, score: r(p.score), done: r(p.done) })),
  }
}
