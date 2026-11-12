/**
 * Player-vs-player hits, only while the room's `pvp` setting is on (off in free roam; game modes
 * turn it on). The attacker detects: a blow (swing, slam, arrow, fist spin) that overlaps another
 * player's body sends that player a hit. The victim decides: it checks the setting, where the
 * attacker is, where the blow landed and how often hits come, then applies a shove — fists and
 * swords nudge, hammers and well-drawn arrows throw the body into a real ragdoll. No damage.
 */
import * as THREE from 'three'
import type { V3 } from '../events'
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
const REACH: Record<WeaponKind, number> = { fists: 3.4, sword: 4.6, hammer: 7.5, bow: 110 }
/** Furthest the reported contact point may be from our body (m). */
const CONTACT_SLACK = 2.4
/** Shoves (m/s): horizontal and upward. Arrows drawn this far launch. */
const NUDGE: Record<WeaponKind, [number, number]> = { fists: [4.5, 2.5], sword: [6, 3], hammer: [0, 0], bow: [4, 2] }
const LAUNCH = { hammer: [9, 7.5], bow: [8, 5] } as const
const BOW_LAUNCH = 0.6
/** At most one launch per this many seconds. */
const LAUNCH_GAP = 1.2
/** The fist spin's reach about the chest (m). */
const SPIN_RADIUS = 1.3

const _c = new THREE.Vector3()

/** Closest point of a body standing at `feet` to `p` (into out). */
function bodyPoint(feet: THREE.Vector3, p: V3, out: THREE.Vector3): THREE.Vector3 {
  return out.set(feet.x, THREE.MathUtils.clamp(p.y, feet.y + BODY_LO, feet.y + BODY_HI), feet.z)
}

export class Pvp {
  on = false
  private seq = 0
  private msg: HitMsg = { seq: 0, weapon: 'fists', power: 0, x: 0, y: 0, z: 0 }
  private packet = new DataView(new ArrayBuffer(HIT_BYTES))
  /** Hits we send, overall. */
  private sendBucket = new Bucket(6, 4)
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
      const b = bodyPoint(peer.position, c, _c)
      const r = blow.radius + BODY_R
      if (b.distanceToSquared(c as THREE.Vector3) > r * r || !this.sendBucket.take(now)) continue
      const h = this.msg
      h.seq = this.seq = (this.seq + 1) & 0xffff
      h.weapon = blow.weapon
      h.power = power
      h.x = c.x
      h.y = c.y
      h.z = c.z
      encodeHit(this.packet, h)
      room.sendTo(peer.id, this.packet.buffer as ArrayBuffer, true)
      skip?.add(peer.id)
      this.ctx.bus.emit('net:action', { action: 'hit', weapon: blow.weapon, pos: { x: b.x, y: b.y, z: b.z } })
      n++
    }
    return n
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
    const me = p.position
    const from = peer.position
    if (from.distanceToSquared(me) > REACH[kind] * REACH[kind]) return
    const contact = bodyPoint(me, h, _c)
    if (contact.distanceToSquared(h as unknown as THREE.Vector3) > CONTACT_SLACK * CONTACT_SLACK) return

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
    const power = THREE.MathUtils.clamp(h.power, 0, 1)
    let launch = kind === 'hammer' || (kind === 'bow' && power >= BOW_LAUNCH)
    if (launch && now - this.lastLaunch < LAUNCH_GAP) launch = false
    let push: readonly number[]
    if (launch) {
      this.lastLaunch = now
      push = kind === 'hammer' ? LAUNCH.hammer : [LAUNCH.bow[0] * (0.6 + 0.4 * power), LAUNCH.bow[1]]
    } else {
      const nudge = NUDGE[kind === 'hammer' ? 'sword' : kind]
      push = [nudge[0] * (0.75 + 0.5 * power), nudge[1]]
    }
    p.knock({ x: dx * push[0], y: push[1], z: dz * push[0] }, launch)
    ctx.bus.emit('net:action', { action: 'hit', weapon: h.weapon, pos: { x: contact.x, y: contact.y, z: contact.z } })
    ctx.game.shake(launch ? 0.4 : 0.18, 0.25)
  }
}
