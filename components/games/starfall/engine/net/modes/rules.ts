/**
 * The referee: round logic, run only by the room host. It reads where everyone is
 * (the latest replicated positions — never a client's own claim about anyone) and
 * updates the shared round state; Modes.ts broadcasts it.
 */
import * as THREE from 'three'
import type { MapId, WeaponId } from '../../events'
import { KIND } from '../../gameplay/weapons/defs'
import { REACH } from '../pvp'
import {
  ARENA, ARENA_FALL, COUNTDOWN, COUNTDOWN_TRAVEL, HILL_MOVE, HILL_R, HILLS, JUGGERNAUT, JUGGERNAUT_KIT, LADDER, LIVES, MODE_BY_ID, PROTECT,
  RACE_GRACE, RESPAWN, RESULTS, RING_HIT, RINGS, ROLE_IT, ROLE_NONE, ROLE_OUT, SEEK_HOLD, STAGGER, TAG_IMMUNITY, TOUCH, TOUCH_DY,
  TWO_INFECTED, type Contestant, type ModeId, type RoundState,
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
/** Infection: the infected hold still this long after "Go!" so the others can scatter (s). */
export const INFECT_HOLD = 4
/**
 * Knockout and bite claims: the host's own view of the two players may differ from the victim's by
 * this much (m; lag, and a body already flying) on top of the weapon's reach.
 */
const CLAIM_SLACK = 5
/** One player can't be credited with knockouts or bites faster than this (s). */
const CREDIT_GAP = 0.35
/** A blow already in the air still counts for this long after its owner went down (s). */
const DOWN_GRACE = 1.5

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
  /** Arena modes: when each player was last credited with a knockout or a bite (s into the round). */
  private credited = new Map<string, number>()

  /** A new round of `mode` with these players: announcement and countdown first. */
  start(s: RoundState, mode: ModeId, entrants: ReadonlyArray<{ id: string; name: string }>, map: MapId = 'isle'): void {
    const order = entrants.slice().sort(() => Math.random() - 0.5)
    s.seq++
    s.round = 1 + Math.floor(Math.random() * 2 ** 30)
    s.mode = mode
    s.map = MODE_BY_ID[mode].arena ? map : 'isle'
    s.phase = 'countdown'
    s.left = s.map === 'isle' ? COUNTDOWN : COUNTDOWN_TRAVEL
    s.elapsed = 0
    s.players = order.map((e, slot) => ({
      id: e.id, name: e.name, slot, score: 0, lives: mode === 'knockout' ? LIVES : 0, role: ROLE_NONE, done: -1, kos: 0, down: -1,
    }))
    if (mode === 'tag' || mode === 'hide' || mode === 'juggernaut') {
      const first = pick(s.players)
      if (first) first.role = ROLE_IT
    }
    if (mode === 'infection') {
      // The first infected (two in a big round): `done` 0 marks them as the source.
      const sick = s.players.slice().sort(() => Math.random() - 0.5).slice(0, s.players.length >= TWO_INFECTED ? 2 : 1)
      for (const p of sick) {
        p.role = ROLE_IT
        p.done = 0
      }
    }
    s.hill = Math.floor(Math.random() * HILLS.length)
    s.hillLeft = HILL_MOVE
    s.hold = mode === 'infection' ? INFECT_HOLD : SEEK_HOLD
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
      case 'infection': {
        // Anyone left untouched: the survivors share the win (the longest-lived of the rest follow).
        // Otherwise the horde wins and its best spreader heads the list.
        const survivors = ps.filter(p => p.role !== ROLE_IT)
        for (const p of survivors) p.score = s.elapsed
        if (survivors.length) {
          by((a, b) => Number(a.role === ROLE_IT) - Number(b.role === ROLE_IT) || b.score - a.score)
          winners = survivors.length
        } else by((a, b) => b.kos - a.kos || a.done - b.done)
        break
      }
      case 'juggernaut':
        by((a, b) => b.score - a.score)
        if (ps[0] && ps[0].score < 1) winners = 0
        break
      case 'gungame':
        // A fists knockout on the last rung wins outright; otherwise the highest rung (then the most knockouts).
        by((a, b) => Number(b.done >= 0) - Number(a.done >= 0) || b.score - a.score || b.kos - a.kos)
        if (ps[0] && ps[0].done < 0 && ps[0].score === 0 && ps[0].kos === 0) winners = 0
        break
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
      case 'infection':
        changed = this.infection(s, dt, locate) || changed
        break
      case 'juggernaut':
        changed = this.juggernaut(s, dt) || changed
        break
      case 'gungame':
        // Nothing runs on the clock: the ladder moves on knockout claims (knockedOut).
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

  private infection(s: RoundState, dt: number, locate: Locate): boolean {
    s.hold = Math.max(0, s.hold - dt)
    const infected = s.players.filter(p => p.role === ROLE_IT)
    const survivors = s.players.filter(p => p.role !== ROLE_IT)
    if (!survivors.length) {
      this.finish(s)
      return true
    }
    if (!infected.length) {
      // Every infected player left: it breaks out again in one of the survivors.
      const next = pick(survivors)
      if (next) this.infect(s, next, null)
      return true
    }
    for (const p of survivors) p.score = s.elapsed
    if (s.hold > 0) return false
    let changed = false
    for (const z of infected) {
      const at = this.canSpread(s, z) ? locate(z.id) : null
      if (!at) continue
      for (const p of survivors) {
        if (p.role === ROLE_IT) continue
        const pos = locate(p.id)
        if (!pos || !touching(at, pos)) continue
        this.infect(s, p, z)
        changed = true
      }
    }
    if (s.players.every(p => p.role === ROLE_IT)) this.finish(s)
    return changed
  }

  /** Infected, and past the stagger that follows catching it. */
  private canSpread(s: RoundState, p: Contestant): boolean {
    return p.role === ROLE_IT && (p.done <= 0 || s.elapsed >= p.done + STAGGER)
  }

  private infect(s: RoundState, p: Contestant, by: Contestant | null): void {
    p.role = ROLE_IT
    p.done = Math.max(0.01, s.elapsed)
    p.score = s.elapsed
    if (by) by.kos++
  }

  private juggernaut(s: RoundState, dt: number): boolean {
    s.immuneLeft = Math.max(0, s.immuneLeft - dt)
    if (s.immuneLeft <= 0) s.immune = ''
    const jug = s.players.find(p => p.role === ROLE_IT)
    if (jug) {
      jug.score += dt
      return false
    }
    // The Juggernaut left the room: the crown falls to someone at random.
    const next = pick(s.players)
    if (!next) return false
    this.crown(s, next)
    return true
  }

  /** `p` becomes the Juggernaut, untouchable for a moment while they grow into it. */
  private crown(s: RoundState, p: Contestant): void {
    for (const q of s.players) if (q.role === ROLE_IT) q.role = ROLE_NONE
    p.role = ROLE_IT
    s.immune = p.id
    s.immuneLeft = PROTECT
  }

  /* ── claims from the players (validated here) ────────────── */

  /**
   * Infection: survivor `victim` says a blow from infected `by` landed on them (their own client
   * already checked it as a pvp hit). Counts if the host sees the two close enough and `by` may
   * spread it right now. True when the state changed.
   */
  bitten(s: RoundState, victim: string, by: string, locate: Locate): boolean {
    if (s.phase !== 'live' || s.mode !== 'infection' || s.hold > 0) return false
    const v = s.players.find(p => p.id === victim)
    const z = s.players.find(p => p.id === by)
    if (!v || !z || v.role === ROLE_IT || !this.canSpread(s, z) || !this.plausible(s, z, v, 'fists', locate)) return false
    this.credited.set(z.id, s.elapsed)
    this.infect(s, v, z)
    if (s.players.every(p => p.role === ROLE_IT)) this.finish(s)
    else s.seq++
    return true
  }

  /**
   * Health modes: `victim` says they were knocked out — by `by` with `weapon`, or on their own
   * ('': a fall). Their going down always stands (it is their own body); the credit only counts
   * if `by` could have done it: in the round, on their feet a moment ago, close enough for that
   * weapon as the host sees them, holding a weapon the mode gave them, and not scoring implausibly
   * fast. True when the state changed.
   */
  knockedOut(s: RoundState, victim: string, by: string, weapon: WeaponId, locate: Locate): boolean {
    const def = s.mode ? MODE_BY_ID[s.mode] : null
    if (s.phase !== 'live' || !def?.health) return false
    const v = s.players.find(p => p.id === victim)
    // One knockout per life: down, back up and protected takes this long at the very least.
    if (!v || (v.down >= 0 && s.elapsed - v.down < RESPAWN + PROTECT - 1)) return false
    const a = by && by !== victim ? s.players.find(p => p.id === by) : undefined
    const credit = a && this.allowed(s, a, weapon) && this.plausible(s, a, v, weapon, locate) ? a : null
    if (credit) this.credited.set(credit.id, s.elapsed)
    v.down = s.elapsed
    if (s.mode === 'juggernaut') {
      if (v.role === ROLE_IT) {
        // The crown passes to whoever landed the blow; a Juggernaut who fell alone hands it to chance.
        v.role = ROLE_NONE
        const next = credit ?? pick(s.players.filter(p => p !== v))
        if (next) this.crown(s, next)
      } else if (credit?.role === ROLE_IT) {
        credit.kos++
        credit.score += JUGGERNAUT.bonus
      }
    } else if (credit) {
      // Fists humble: the victim drops a rung.
      if (weapon === 'fists') v.score = Math.max(0, v.score - 1)
      credit.kos++
      if (credit.score >= LADDER.length - 1) {
        credit.done = s.elapsed
        this.finish(s)
        return true
      }
      credit.score++
    }
    s.seq++
    return true
  }

  /** May `a` be holding `weapon` in this mode right now? */
  private allowed(s: RoundState, a: Contestant, weapon: WeaponId): boolean {
    if (weapon === 'fists') return true
    if (s.mode === 'juggernaut') return JUGGERNAUT_KIT.includes(weapon)
    // Gun Game: the rung's weapon — or the one before it, for a shot still in the air at the last knockout.
    return weapon === LADDER[a.score] || (a.score > 0 && weapon === LADDER[a.score - 1])
  }

  /** Could `a` have just struck `v` with `weapon`, as far as the host can tell? */
  private plausible(s: RoundState, a: Contestant, v: Contestant, weapon: WeaponId, locate: Locate): boolean {
    if (a.down >= 0 && s.elapsed - a.down > DOWN_GRACE && s.elapsed - a.down < RESPAWN) return false
    if (s.elapsed - (this.credited.get(a.id) ?? -Infinity) < CREDIT_GAP) return false
    const from = locate(a.id)
    const at = locate(v.id)
    if (!from || !at) return false
    const reach = REACH[KIND[weapon]] + CLAIM_SLACK
    return from.distanceToSquared(at) <= reach * reach
  }

  /* ── internals ───────────────────────────────────────────── */

  private toIdle(s: RoundState): void {
    s.seq++
    s.mode = null
    s.map = 'isle'
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
    this.credited.clear()
    // Knockout: nobody counts as fallen until seen standing on the arena (they are still being moved there).
    if (s.mode === 'knockout') for (const p of s.players) this.down.add(p.id)
  }
}
