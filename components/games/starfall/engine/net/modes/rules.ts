/**
 * The referee: round logic, run only by the room host. It reads where everyone is
 * (the latest replicated positions — never a client's own claim about anyone) and
 * updates the shared round state; Modes.ts broadcasts it.
 */
import * as THREE from 'three'
import {
  ARENA, ARENA_FALL, COUNTDOWN, HILL_MOVE, HILL_R, HILLS, LIVES, MODE_BY_ID, RACE_GRACE, RESULTS, RING_HIT, RINGS,
  ROLE_IT, ROLE_NONE, ROLE_OUT, SEEK_HOLD, TAG_IMMUNITY, TOUCH, TOUCH_DY, type Contestant, type ModeId, type RoundState,
} from './defs'

/** Feet position of a player, or null when unknown (not streaming yet). */
export type Locate = (id: string) => THREE.Vector3 | null

/** Knockout: a fall within this long of being close to someone counts as their KO (s), and how close (m). */
const KO_CREDIT = 6
const KO_NEAR = 3.5
/** Race: position jumps longer than this (m) are teleports (respawns), not runs through rings. */
const MAX_STEP = 25
/** Chest height above the feet (m). */
const CHEST = 0.9

const _a = new THREE.Vector3()
const _b = new THREE.Vector3()
const _c = new THREE.Vector3()
const _seg = new THREE.Line3()

function touching(a: THREE.Vector3, b: THREE.Vector3): boolean {
  return Math.abs(a.y - b.y) < TOUCH_DY && (a.x - b.x) ** 2 + (a.z - b.z) ** 2 < TOUCH * TOUCH
}

function pick<T>(list: readonly T[]): T | undefined {
  return list[Math.floor(Math.random() * list.length)]
}

export class Referee {
  /** Race: last known chest position per player (sweeps through rings between samples). */
  private prev = new Map<string, THREE.Vector3>()
  /** Knockout: players who fell and haven't been seen back on the arena yet. */
  private down = new Set<string>()
  /** Knockout: who was last close to each player, and when (s into the round). */
  private near = new Map<string, { by: string; at: number }>()

  /** A new round of `mode` with these players: announcement and countdown first. */
  start(s: RoundState, mode: ModeId, entrants: ReadonlyArray<{ id: string; name: string }>): void {
    const order = entrants.slice().sort(() => Math.random() - 0.5)
    s.seq++
    s.round = 1 + Math.floor(Math.random() * 2 ** 30)
    s.mode = mode
    s.phase = 'countdown'
    s.left = COUNTDOWN
    s.elapsed = 0
    s.players = order.map((e, slot) => ({ id: e.id, name: e.name, slot, score: 0, lives: mode === 'knockout' ? LIVES : 0, role: ROLE_NONE, done: -1 }))
    if (mode === 'tag' || mode === 'hide') {
      const first = pick(s.players)
      if (first) first.role = ROLE_IT
    }
    s.hill = Math.floor(Math.random() * HILLS.length)
    s.hillLeft = HILL_MOVE
    s.hold = SEEK_HOLD
    s.immune = ''
    s.immuneLeft = 0
    s.podium = []
    s.winners = 0
    this.forget(s)
  }

  /** Taking over a round from a host who left: start judging from what we see now. */
  adopt(s: RoundState): void {
    this.forget(s)
  }

  /** Ends the live round now and fills in the results. */
  finish(s: RoundState): void {
    if (s.phase !== 'live' && s.phase !== 'countdown') return
    s.seq++
    s.phase = 'results'
    s.left = RESULTS
    const ps = s.players.slice()
    const by = (f: (a: Contestant, b: Contestant) => number) => ps.sort(f)
    let winners = ps.length ? 1 : 0
    switch (s.mode) {
      case 'tag':
        by((a, b) => a.score - b.score)
        break
      case 'knockout':
        by((a, b) => b.lives - a.lives || b.score - a.score)
        break
      case 'race':
        by((a, b) => (a.done >= 0 ? a.done : 1e6 - a.score) - (b.done >= 0 ? b.done : 1e6 - b.score))
        if (ps[0] && ps[0].done < 0) winners = 0
        break
      case 'koth':
        by((a, b) => b.score - a.score)
        if (ps[0] && ps[0].score < 1) winners = 0
        break
      case 'hide': {
        // Survivors share the win; otherwise the best seeker takes it.
        const hiders = ps.filter(p => p.role !== ROLE_IT)
        by((a, b) => Number(a.role === ROLE_IT) - Number(b.role === ROLE_IT) || b.score - a.score)
        if (hiders.length) winners = hiders.length
        break
      }
    }
    s.podium = ps.map(p => p.id)
    s.winners = winners
  }

  /** Advances the round by dt. True when something discrete changed (broadcast at once). */
  tick(s: RoundState, dt: number, present: (id: string) => boolean, locate: Locate): boolean {
    if (s.phase === 'idle' || !s.mode) return false
    s.left = Math.max(0, s.left - dt)
    if (s.phase === 'results') {
      if (s.left > 0) return false
      this.toIdle(s)
      return true
    }
    let changed = false
    // Players who left the room leave the round.
    if (!s.players.every(p => present(p.id))) {
      s.players = s.players.filter(p => present(p.id))
      changed = true
    }

    if (s.phase === 'countdown') {
      if (s.left > 0) return changed
      s.seq++
      s.phase = 'live'
      s.left = MODE_BY_ID[s.mode].duration
      this.forget(s)
      return true
    }

    s.elapsed += dt
    if (s.players.length < MODE_BY_ID[s.mode].minPlayers) {
      this.finish(s)
      return true
    }
    switch (s.mode) {
      case 'tag':
        changed = this.tag(s, dt, locate) || changed
        break
      case 'knockout':
        changed = this.knockout(s, locate) || changed
        break
      case 'race':
        changed = this.race(s, locate) || changed
        break
      case 'koth':
        changed = this.koth(s, dt, locate) || changed
        break
      case 'hide':
        changed = this.hide(s, dt, locate) || changed
        break
    }
    if (s.phase === 'live' && s.left <= 0) this.finish(s)
    if (s.phase !== 'live') return true
    if (changed) s.seq++
    return changed
  }

  /* ── modes ───────────────────────────────────────────────── */

  private tag(s: RoundState, dt: number, locate: Locate): boolean {
    let it = s.players.find(p => p.role === ROLE_IT)
    if (!it) {
      it = pick(s.players)
      if (!it) return false
      it.role = ROLE_IT
      return true
    }
    it.score += dt
    s.immuneLeft = Math.max(0, s.immuneLeft - dt)
    if (s.immuneLeft <= 0) s.immune = ''
    const at = locate(it.id)
    if (!at) return false
    for (const p of s.players) {
      if (p === it || p.id === s.immune) continue
      const pos = locate(p.id)
      if (!pos || !touching(at, pos)) continue
      it.role = ROLE_NONE
      p.role = ROLE_IT
      s.immune = it.id
      s.immuneLeft = TAG_IMMUNITY
      return true
    }
    return false
  }

  private knockout(s: RoundState, locate: Locate): boolean {
    let changed = false
    const alive = s.players.filter(p => p.role !== ROLE_OUT)
    for (const p of alive) {
      const pos = locate(p.id)
      if (!pos) continue
      for (const q of alive) {
        if (q === p) continue
        const qp = locate(q.id)
        if (qp && qp.distanceToSquared(pos) < KO_NEAR * KO_NEAR) this.near.set(p.id, { by: q.id, at: s.elapsed })
      }
      if (pos.y < ARENA_FALL) {
        if (this.down.has(p.id)) continue
        this.down.add(p.id)
        p.lives = Math.max(0, p.lives - 1)
        if (p.lives === 0) p.role = ROLE_OUT
        const n = this.near.get(p.id)
        const by = n && s.elapsed - n.at < KO_CREDIT ? s.players.find(x => x.id === n.by) : undefined
        if (by) by.score++
        this.near.delete(p.id)
        changed = true
      } else if (this.down.has(p.id) && pos.y > ARENA.y - 1.5 && (pos.x - ARENA.x) ** 2 + (pos.z - ARENA.z) ** 2 < (ARENA.r + 1) ** 2) {
        this.down.delete(p.id)
      }
    }
    if (s.players.filter(p => p.role !== ROLE_OUT).length <= 1) this.finish(s)
    return changed
  }

  private race(s: RoundState, locate: Locate): boolean {
    let changed = false
    for (const p of s.players) {
      const pos = locate(p.id)
      if (!pos || p.done >= 0) continue
      const chest = _b.set(pos.x, pos.y + CHEST, pos.z)
      const prev = this.prev.get(p.id)
      const ring = RINGS[p.score]
      const target = _c.set(ring.x, ring.y, ring.z)
      // Sweep from the last sample so fast runners can't skip through a ring between packets.
      const sweep = prev && prev.distanceToSquared(chest) < MAX_STEP * MAX_STEP
      const d = sweep ? _seg.set(prev, chest).closestPointToPoint(target, true, _a).distanceTo(target) : chest.distanceTo(target)
      if (prev) prev.copy(chest)
      else this.prev.set(p.id, chest.clone())
      if (d > RING_HIT) continue
      p.score++
      changed = true
      if (p.score < RINGS.length) continue
      p.done = s.elapsed
      // The first finisher starts the clock for everyone else.
      if (s.players.filter(x => x.done >= 0).length === 1) s.left = Math.min(s.left, RACE_GRACE)
    }
    if (s.players.every(p => p.done >= 0)) this.finish(s)
    return changed
  }

  private koth(s: RoundState, dt: number, locate: Locate): boolean {
    let changed = false
    s.hillLeft -= dt
    if (s.hillLeft <= 0) {
      s.hill = (s.hill + 1 + Math.floor(Math.random() * (HILLS.length - 1))) % HILLS.length
      s.hillLeft = HILL_MOVE
      changed = true
    }
    const h = HILLS[s.hill]
    let king: Contestant | null = null
    let inside = 0
    for (const p of s.players) {
      const pos = locate(p.id)
      if (!pos || Math.abs(pos.y - h.y) > 2.5 || (pos.x - h.x) ** 2 + (pos.z - h.z) ** 2 > HILL_R * HILL_R) continue
      inside++
      king = p
    }
    if (inside === 1 && king) king.score += dt
    return changed
  }

  private hide(s: RoundState, dt: number, locate: Locate): boolean {
    s.hold = Math.max(0, s.hold - dt)
    const seekers = s.players.filter(p => p.role === ROLE_IT)
    const hiders = s.players.filter(p => p.role !== ROLE_IT)
    if (!seekers.length) {
      // The seeker left: a hider takes over after a short count.
      const next = pick(hiders)
      if (next) next.role = ROLE_IT
      s.hold = Math.max(s.hold, 5)
      return true
    }
    if (!hiders.length) {
      this.finish(s)
      return true
    }
    if (s.hold > 0) return false
    let changed = false
    for (const seeker of seekers) {
      const at = locate(seeker.id)
      if (!at) continue
      for (const h of hiders) {
        if (h.role === ROLE_IT) continue
        const pos = locate(h.id)
        if (!pos || !touching(at, pos)) continue
        h.role = ROLE_IT
        h.done = s.elapsed
        seeker.score++
        changed = true
      }
    }
    if (s.players.every(p => p.role === ROLE_IT)) this.finish(s)
    return changed
  }

  /* ── internals ───────────────────────────────────────────── */

  private toIdle(s: RoundState): void {
    s.seq++
    s.mode = null
    s.phase = 'idle'
    s.left = 0
    s.players = []
    s.podium = []
    s.winners = 0
  }

  private forget(s: RoundState): void {
    this.prev.clear()
    this.near.clear()
    this.down.clear()
    // Knockout: nobody counts as fallen until seen standing on the arena (they are still being moved there).
    if (s.mode === 'knockout') for (const p of s.players) this.down.add(p.id)
  }
}
