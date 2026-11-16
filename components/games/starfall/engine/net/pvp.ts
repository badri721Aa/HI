/**
 * Player-vs-player hits, only while the room's `pvp` setting is on (off in free roam; game modes
 * turn it on). The attacker detects: a blow (swing, slam, arrow, star bolt, comet burst, fist
 * spin) that overlaps another player's body sends that player a hit. The victim decides: it checks
 * the setting, where the attacker is, where the blow landed and how often hits come, then applies
 * a shove — fists, swords and bolts nudge; hammers, comets and well-drawn arrows throw the body
 * into a real ragdoll. No damage by itself: a game mode may rule on each blow first (`judge`:
 * round health, spawn protection, team-mates, armour).
 */
import * as THREE from 'three'
import type { V3, WeaponId } from '../events'
import { KIND, type WeaponKind } from '../gameplay/weapons/defs'
import type { Ctx, WeaponHit } from '../types'
import { Bucket, HIT_BYTES, encodeHit, type HitMsg } from './protocol'
import type { RemotePeer } from './RemotePeer'
import type { Room } from './Room'

/** A player's body as a vertical capsule: from this high above the feet to this high, this thick (m). */
const BODY_LO = 0.25
const BODY_HI = 1.35
const BODY_R = 0.4
/** Furthest the attacker's copy may stand from us for a blow of each kind to count (m, with lag slack). */
const REACH: Record<WeaponKind, number> = { fists: 3.4, sword: 4.6, hammer: 7.5, bow: 110, blaster: 80, launcher: 55 }
/** Furthest the reported contact point may be from our body (m). */
const CONTACT_SLACK = 2.4
/** Shoves (m/s): horizontal and upward. Arrows drawn this far launch. */
const NUDGE: Record<WeaponKind, [number, number]> = { fists: [4.5, 2.5], sword: [6, 3], hammer: [0, 0], bow: [4, 2], blaster: [2.6, 1.2], launcher: [0, 0] }
const LAUNCH = { hammer: [9, 7.5], bow: [8, 5], launcher: [8.5, 7] } as const
const BOW_LAUNCH = 0.6
/** The same attacker's next blow of a kind can't count sooner than this after their last (s): no weapon is faster. */
const HIT_GAP: Record<WeaponKind, number> = { fists: 0.3, sword: 0.2, hammer: 0.5, bow: 0.25, blaster: 0.1, launcher: 0.4 }
/** At most one launch per this many seconds. */
const LAUNCH_GAP = 1.2
/** The fist spin's reach about the chest (m). */
const SPIN_RADIUS = 1.3

const _c = new THREE.Vector3()

const dist2 = (a: V3, b: V3) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2

/** Closest point of a body standing at `feet` (`scale` times the usual size) to `p` (into out). */
function bodyPoint(feet: THREE.Vector3, p: V3, out: THREE.Vector3, scale = 1): THREE.Vector3 {
  return out.set(feet.x, THREE.MathUtils.clamp(p.y, feet.y + BODY_LO, feet.y + BODY_HI * scale), feet.z)
}

/**
 * A game mode's ruling on a blow that passed every check: 'ignore' — it doesn't count (spawn
 * protection, a team-mate, already knocked out); 'steady' — it shoves but can't throw the body
 * down (armour); 'normal' — the usual shove.
 */
export type HitRuling = 'ignore' | 'steady' | 'normal'

export class Pvp {
  on = false
  /** Set by the game modes: rules on each validated blow before the shove (and takes round health for it). */
  judge: ((peer: RemotePeer, weapon: WeaponId, power: number) => HitRuling) | null = null
  private seq = 0
  private msg: HitMsg = { seq: 0, weapon: 'fists', power: 0, x: 0, y: 0, z: 0 }
  private packet = new DataView(new ArrayBuffer(HIT_BYTES))
  /** Hits we send, overall (a star blaster lands a handful a second). */
  private sendBucket = new Bucket(10, 7)
  private lastLaunch = -Infinity
  /** Players already hit by the spin in progress. */
  private spun = new Set<string>()
  private spinBlow: WeaponHit = {
    weapon: 'fists', center: { x: 0, y: 0, z: 0 }, radius: SPIN_RADIUS, damage: 0, knock: 0, lift: 0, from: { x: 0, y: 0, z: 0 },
  }

  constructor(private ctx: Ctx) {}

  /** Sends a hit to every other player the blow overlaps; returns how many. */
  strike(room: Room, blow: WeaponHit, power: number, now: number, skip?: Set<string>): number {
    if (!this.on || !room.online) return 0
    const map = this.ctx.worlds?.current ?? 'isle'
    const c = blow.center
    let n = 0
    for (let i = 0; i < room.list.length; i++) {
      const peer = room.list[i]
      if (!peer.ready || peer.away || peer.map !== map || skip?.has(peer.id)) continue
      const b = bodyPoint(peer.position, c, _c, peer.scale)
      const r = blow.radius + BODY_R * peer.scale
      if (dist2(b, c) > r * r || !this.sendBucket.take(now)) continue
      const h = this.msg
      h.seq = this.seq = (this.seq + 1) & 0xffff
      h.weapon = blow.weapon
      h.power = power
      // Where it reached their body (as we see them).
      h.x = b.x
      h.y = b.y
      h.z = b.z
      encodeHit(this.packet, h)
      // A stream of bolts isn't worth a relay message each: the next one is a moment behind.
      room.sendTo(peer.id, this.packet.buffer as ArrayBuffer, KIND[blow.weapon] !== 'blaster')
      skip?.add(peer.id)
      this.ctx.bus.emit('net:action', { action: 'hit', weapon: blow.weapon, pos: { x: b.x, y: b.y, z: b.z } })
      n++
    }
    return n
  }

  /** With pvp on: is another player's body within `radius` of `p`? */
  near(room: Room, p: V3, radius: number): boolean {
    if (!this.on || !room.online) return false
    const map = this.ctx.worlds?.current ?? 'isle'
    for (let i = 0; i < room.list.length; i++) {
      const peer = room.list[i]
      if (!peer.ready || peer.away || peer.map !== map) continue
      const r = radius + BODY_R * peer.scale
      if (dist2(bodyPoint(peer.position, p, _c, peer.scale), p) <= r * r) return true
    }
    return false
  }

  /** The fist spin hits each player it sweeps through once. */
  updateSpin(room: Room, now: number): void {
    const p = this.ctx.player
    if (!this.on || p.state !== 'attack') {
      this.spun.clear()
      return
    }
    const b = this.spinBlow
    b.center.x = b.from.x = p.position.x
    b.center.y = b.from.y = p.position.y + 0.9
    b.center.z = b.from.z = p.position.z
    this.strike(room, b, 0.5, now, this.spun)
  }

  /** Another player says their blow reached us: judge it, then shove (or launch) the hero. */
  receive(peer: RemotePeer, h: HitMsg, now: number): void {
    const ctx = this.ctx
    const p = ctx.player
    if (!this.on || !p || ctx.game.phase !== 'playing' || !p.controlEnabled || p.hp <= 0) return
    if (!peer.ready || peer.away || peer.map !== (ctx.worlds?.current ?? 'isle') || !peer.hits.take(now)) return
    const kind = KIND[h.weapon]
    if (now - peer.lastHitAt < HIT_GAP[kind]) return
    const me = p.position
    const from = peer.position
    if (from.distanceToSquared(me) > REACH[kind] * REACH[kind]) return
    const contact = bodyPoint(me, h, _c)
    if (dist2(contact, h) > CONTACT_SLACK * CONTACT_SLACK) return
    peer.lastHitAt = now
    const power = THREE.MathUtils.clamp(h.power, 0, 1)
    const ruling = this.judge ? this.judge(peer, h.weapon, power) : 'normal'
    if (ruling === 'ignore') return

    let dx = me.x - from.x
    let dz = me.z - from.z
    const l = Math.hypot(dx, dz)
    if (l < 1e-3) {
      dx = -Math.sin(p.yaw)
      dz = -Math.cos(p.yaw)
    } else {
      dx /= l
      dz /= l
    }
    const heavy = kind === 'hammer' || kind === 'launcher'
    let launch = ruling !== 'steady' && (heavy || (kind === 'bow' && power >= BOW_LAUNCH))
    if (launch && now - this.lastLaunch < LAUNCH_GAP) launch = false
    let push: readonly number[]
    if (launch) {
      this.lastLaunch = now
      push = kind === 'hammer' ? LAUNCH.hammer : kind === 'launcher' ? LAUNCH.launcher : [LAUNCH.bow[0] * (0.6 + 0.4 * power), LAUNCH.bow[1]]
    } else {
      const nudge = NUDGE[heavy ? 'sword' : kind]
      push = [nudge[0] * (0.75 + 0.5 * power), nudge[1]]
    }
    p.knock({ x: dx * push[0], y: push[1], z: dz * push[0] }, launch)
    ctx.bus.emit('net:action', { action: 'hit', weapon: h.weapon, pos: { x: contact.x, y: contact.y, z: contact.z } })
    ctx.game.shake(launch ? 0.4 : 0.18, 0.25)
  }
}
