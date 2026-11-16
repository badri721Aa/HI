/**
 * What the hero's eyes are on during play: the most relevant thing near him, handed to the
 * animator's look-at (which turns the head, neck and upper spine within their limits and smooths
 * the turn). In order of importance:
 *
 *   aim         the bow drawn: along the camera's line of sight
 *   enemy       the nearest enemy close enough to be a threat
 *   boss        a boss anywhere in its arena
 *   player      another player within talking distance
 *   thing       whatever the interact prompt is offering (a sign, a chest, a weapon stand)
 *
 * The choice is re-made a few times a second and kept for a moment, so he doesn't flick between
 * two things at the same distance. Cutscenes drive the look themselves (Character.lookAt).
 */
import * as THREE from 'three'
import type { V3 } from '../events'
import type { Ctx } from '../types'

type Kind = 'none' | 'aim' | 'enemy' | 'boss' | 'player' | 'thing'

/** Higher wins. */
const RANK: Record<Kind, number> = { none: 0, thing: 1, player: 2, boss: 3, enemy: 4, aim: 5 }

/** How often the surroundings are looked over (s), and how long a choice is kept against a lesser one (s). */
const SCAN_EVERY = 0.2
const KEEP = 0.7
/** Reach of each kind (m). */
const ENEMY_RANGE = 10
const BOSS_RANGE = 45
const PLAYER_RANGE = 7
const THING_RANGE = 6
/** How far along the line of sight the aim looks (m). */
const AIM_AHEAD = 14
/** Heights looked at, above a boss's feet (m) and another player's (m). */
const BOSS_EYE = 2.2
const PLAYER_EYE = 1.45
const HERO_EYE = 1.42

export class LookDirector {
  private kind: Kind = 'none'
  private readonly target = new THREE.Vector3()
  private readonly found = new THREE.Vector3()
  private readonly dir = new THREE.Vector3()
  private scanT = 0
  private keepT = 0
  /** Where the interact prompt's subject is, while one is offered. */
  private thing: V3 | null = null
  private off: () => void

  constructor(private ctx: Ctx) {
    this.off = ctx.bus.on('ui:prompt', p => {
      this.thing = p?.at ?? null
    })
  }

  /** What is being looked at (for tests and debugging). */
  get looking(): Kind {
    return this.kind
  }

  /** The point to look at this frame, or null to look ahead. */
  update(dt: number): V3 | null {
    const ctx = this.ctx
    const pl = ctx.player
    if (ctx.game.phase !== 'playing' || !pl.controlEnabled || pl.hp <= 0 || ctx.character.ragdolling) {
      this.kind = 'none'
      this.scanT = 0
      return null
    }
    this.keepT -= dt
    this.scanT -= dt
    // Aiming follows the camera every frame; everything else is re-chosen at a calmer pace.
    if (ctx.weapons.pose.move === 'draw') {
      ctx.camera.getWorldDirection(this.dir)
      const p = pl.position
      this.target.set(p.x + this.dir.x * AIM_AHEAD, p.y + HERO_EYE + this.dir.y * AIM_AHEAD, p.z + this.dir.z * AIM_AHEAD)
      this.kind = 'aim'
      this.keepT = 0
      return this.target
    }
    if (this.scanT <= 0) {
      this.scanT = SCAN_EVERY
      this.scan()
    }
    return this.kind === 'none' ? null : this.target
  }

  /** Looks over the surroundings and takes the best thing to look at, keeping the current one a moment against lesser ones. */
  private scan(): void {
    const kind = this.pick()
    if (RANK[kind] < RANK[this.kind] && this.keepT > 0 && this.kind !== 'aim') {
      // Still tracking the current one where it can be re-found; otherwise the last place it was seen.
      this.refresh()
      return
    }
    if (kind !== this.kind) this.keepT = KEEP
    this.kind = kind
    if (kind !== 'none') this.target.copy(this.found)
  }

  /** The best candidate → `found`. */
  private pick(): Kind {
    const ctx = this.ctx
    const p = ctx.player.position
    const f = this.found
    if (ctx.enemies.nearest(p, ENEMY_RANGE, f)) return 'enemy'
    if (this.boss()) return 'boss'
    if (this.player()) return 'player'
    const t = this.thing
    if (t && (t.x - p.x) ** 2 + (t.z - p.z) ** 2 < THING_RANGE * THING_RANGE) {
      f.set(t.x, t.y, t.z)
      return 'thing'
    }
    return 'none'
  }

  /** Follows the kept target as it moves. */
  private refresh(): void {
    const p = this.ctx.player.position
    const f = this.found
    let ok = false
    if (this.kind === 'enemy') ok = this.ctx.enemies.nearest(p, ENEMY_RANGE * 1.3, f)
    else if (this.kind === 'boss') ok = this.boss()
    else if (this.kind === 'player') ok = this.player()
    if (ok) this.target.copy(f)
  }

  /** A boss that is up: a factory boss in range, or whatever the map's fight has on the floor. */
  private boss(): boolean {
    const ctx = this.ctx
    const p = ctx.player.position
    const f = this.found
    let best = BOSS_RANGE * BOSS_RANGE
    let found = false
    const list = ctx.factory.list()
    for (let i = 0; i < list.length; i++) {
      const e = list[i]
      if (!e.boss || !e.alive) continue
      const d = (e.position.x - p.x) ** 2 + (e.position.z - p.z) ** 2
      if (d >= best) continue
      best = d
      found = true
      f.set(e.position.x, e.position.y + BOSS_EYE, e.position.z)
    }
    if (found) return true
    return ctx.worlds.fighting && ctx.enemies.nearest(p, BOSS_RANGE, f)
  }

  /** The nearest other player in this map. */
  private player(): boolean {
    const ctx = this.ctx
    const peers = ctx.net?.peers
    if (!peers || peers.size === 0) return false
    const p = ctx.player.position
    const f = this.found
    const here = ctx.worlds.current
    let best = PLAYER_RANGE * PLAYER_RANGE
    let found = false
    for (const peer of peers.values()) {
      if (peer.map !== here) continue
      const q = peer.position
      const d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2
      if (d >= best || Math.abs(q.y - p.y) > 4) continue
      best = d
      found = true
      f.set(q.x, q.y + PLAYER_EYE, q.z)
    }
    return found
  }

  dispose(): void {
    this.off()
    this.thing = null
    this.kind = 'none'
  }
}
