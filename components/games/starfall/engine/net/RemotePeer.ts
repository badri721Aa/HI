/**
 * Another player as seen locally: presence info, the link to them and their
 * movement stream turned into a smooth position.
 *
 * Every state packet carries the sender's clock, so direct and relayed packets
 * share one snapshot buffer. Rendering runs `INTERP_DELAY` behind the newest
 * data (snapshot interpolation); when the buffer runs dry — typical for the
 * 4 Hz relay — it extrapolates with the last velocity (and gravity while
 * airborne). A final dead-reckoned smoothing step hides corrections and
 * relay ↔ direct switches. Jumps over `TELEPORT_DIST` snap.
 */
import * as THREE from 'three'
import type { MapId, NetPeer, PlayerState, WeaponId } from '../types'
import { mapFromCode } from '../worlds/defs'
import { heightAt } from '../world/heightfield'
import { EXTRAPOLATE_DIRECT, EXTRAPOLATE_RELAY, INTERP_DELAY, TELEPORT_DIST } from './config'
import type { PeerLink } from './p2p'
import {
  Bucket, FLAG_AWAY, FLAG_GROUNDED, FLAG_RAGDOLL, SeqWindow, copySnapshot, makeSnapshot, stateFromCode, weaponFromCode,
  type MemberInfo, type Snapshot,
} from './protocol'
import { RagdollBuffer } from './ragdollSync'

const BUFFER = 24
/** Gravity used when extrapolating an airborne peer (between the controller's up/down values). */
const GRAVITY = 32
/** Output smoothing rate (1/s): direct links track tightly, relayed motion eases in. */
const SMOOTH_DIRECT = 18
const SMOOTH_RELAY = 6

const lerpAngle = (a: number, b: number, t: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t

export class RemotePeer implements NetPeer {
  readonly id: string
  name: string
  color: string
  joinedAt: number
  readonly position = new THREE.Vector3()
  yaw = 0
  state: PlayerState = 'idle'
  ragdoll = false
  direct = false
  ping = -1

  /** Velocity at the render time (m/s). */
  readonly velocity = new THREE.Vector3()
  grounded = true
  /** In a menu (title / pause). */
  away = false
  wading = 0
  slope = 0
  weapon: WeaponId = 'fists'
  map: MapId = 'isle'
  /** Bow draw 0..1, or -1 when not drawing. */
  draw = -1
  /** Seconds since `state` changed. */
  stateTime = 0
  /** Downward speed at the last touchdown (m/s). */
  landImpact = 0
  /** At least one state packet arrived. */
  ready = false
  /** The rendered position jumped this frame (teleport / first placement). */
  snapped = false

  /* link bookkeeping (managed by the room) */
  /** Local time (s) this player appeared in presence. */
  knownAt = 0
  link: PeerLink | null = null
  linkAttempts = 0
  nextLinkAt = 0
  lastPingAt = 0
  readonly chat = new Bucket(4, 0.8)
  readonly emotes = new Bucket(3, 1)
  readonly rags = new Bucket(2, 0.5)
  /** Block edits and list parts (senders pace themselves at 4 a second). */
  readonly blocks = new Bucket(24, 6)
  /** Ragdoll frames (20 Hz direct plus 6 Hz relayed at most), move starts and hits on us. */
  readonly frames = new Bucket(30, 28)
  readonly actions = new Bucket(12, 8)
  readonly hits = new Bucket(3, 1.5)
  readonly actionSeqs = new SeqWindow()
  readonly hitSeqs = new SeqWindow()
  /** Their ragdolling body, while it lasts. */
  readonly body = new RagdollBuffer()

  private buf: Snapshot[] = Array.from({ length: BUFFER }, makeSnapshot)
  private head = 0
  private count = 0
  private offset = 0
  private hasOffset = false
  private lastRecv = -Infinity
  private target = new THREE.Vector3()
  private targetVel = new THREE.Vector3()
  private targetYaw = 0
  private airMinVy = 0
  private wasGrounded = true

  constructor(id: string, info: MemberInfo) {
    this.id = id
    this.name = info.name
    this.color = info.color
    this.joinedAt = info.joinedAt
  }

  /** Seconds since any state packet arrived (Infinity if none). */
  silence(now: number): number {
    return now - this.lastRecv
  }

  /** Their clock (s) at local time `now`, less the fastest delivery seen; -1 until anything arrived. */
  clock(now: number): number {
    return this.hasOffset ? now - this.offset : -1
  }

  /** How long ago (s) something happened at their time `t`: the measured delay plus the one-way latency. */
  age(t: number, now: number): number {
    const latency = this.ping > 0 ? this.ping / 2000 : 0.05
    return this.hasOffset ? Math.max(0, now - this.offset - t) + latency : latency
  }

  /** A packet stamped `t` by them arrived at `now`: refines the clock offset (the fastest packet wins; drifts up slowly). */
  observe(t: number, now: number): void {
    const sample = now - t
    if (!this.hasOffset || sample < this.offset) this.offset = sample
    else this.offset += (sample - this.offset) * 0.004
    this.hasOffset = true
  }

  setPing(rttMs: number): void {
    if (!(rttMs >= 0 && rttMs < 10000)) return
    this.ping = this.ping < 0 ? rttMs : this.ping + (rttMs - this.ping) * 0.3
  }

  /** Adds a validated snapshot received at local time `now` (s). */
  push(s: Snapshot, now: number): void {
    if (this.count) {
      const newest = this.buf[this.head]
      if (s.t <= newest.t) {
        // Late / duplicate packet — unless the sender's clock restarted.
        if (s.t > newest.t - 2) return
        this.count = 0
        this.hasOffset = false
      } else {
        const dx = s.x - newest.x
        const dy = s.y - newest.y
        const dz = s.z - newest.z
        if (s.t - newest.t > 1.5 || dx * dx + dy * dy + dz * dz > TELEPORT_DIST * TELEPORT_DIST) this.count = 0
      }
    }
    this.head = (this.head + 1) % BUFFER
    copySnapshot(this.buf[this.head], s)
    this.count = Math.min(this.count + 1, BUFFER)
    this.lastRecv = now
    this.observe(s.t, now)
  }

  /** Advances the rendered state to local time `now`. */
  update(dt: number, now: number): void {
    this.snapped = false
    this.direct = this.link !== null && this.link.open
    if (!this.count) return
    const buf = this.buf
    const newest = buf[this.head]
    const renderT = now - this.offset - INTERP_DELAY
    let a = newest
    let b: Snapshot | null = null
    if (renderT < newest.t) {
      for (let i = 1; i < this.count; i++) {
        const idx = (this.head - i + BUFFER) % BUFFER
        const s = buf[idx]
        a = s
        if (s.t <= renderT) {
          b = buf[(idx + 1) % BUFFER]
          break
        }
      }
    }

    const tgt = this.target
    const vel = this.targetVel
    if (b) {
      const u = (renderT - a.t) / Math.max(1e-4, b.t - a.t)
      tgt.set(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, a.z + (b.z - a.z) * u)
      vel.set(a.vx + (b.vx - a.vx) * u, a.vy + (b.vy - a.vy) * u, a.vz + (b.vz - a.vz) * u)
      this.targetYaw = lerpAngle(a.yaw, b.yaw, u)
    } else if (a === newest && renderT > newest.t) {
      const limit = this.direct ? EXTRAPOLATE_DIRECT : EXTRAPOLATE_RELAY
      const late = renderT - newest.t
      const tau = Math.min(late, limit)
      const air = (newest.flags & FLAG_GROUNDED) === 0
      const g = air ? GRAVITY : 0
      tgt.set(newest.x + newest.vx * tau, newest.y + newest.vy * tau - 0.5 * g * tau * tau, newest.z + newest.vz * tau)
      if (air) tgt.y = Math.max(tgt.y, Math.min(newest.y, heightAt(tgt.x, tgt.z)))
      // Out of data for a while: stop the legs rather than run on the spot.
      if (late > limit + 0.3) vel.set(0, 0, 0)
      else vel.set(newest.vx, newest.vy - g * tau, newest.vz)
      this.targetYaw = newest.yaw
    } else {
      tgt.set(a.x, a.y, a.z)
      vel.set(a.vx, a.vy, a.vz)
      this.targetYaw = a.yaw
    }

    // Discrete fields come from the snapshot at (or just before) the render time.
    const state = stateFromCode(a.state)
    if (state !== this.state) {
      this.state = state
      this.stateTime = 0
    } else this.stateTime += dt
    const grounded = (a.flags & FLAG_GROUNDED) !== 0
    if (!grounded) this.airMinVy = Math.min(this.airMinVy, vel.y)
    else if (!this.wasGrounded) {
      this.landImpact = Math.max(0, -this.airMinVy)
      this.airMinVy = 0
    }
    this.wasGrounded = this.grounded = grounded
    this.ragdoll = (a.flags & FLAG_RAGDOLL) !== 0 || state === 'ragdoll'
    this.away = (a.flags & FLAG_AWAY) !== 0
    this.wading = a.wading
    this.slope = a.slope
    this.weapon = weaponFromCode(a.weapon)
    this.map = mapFromCode(a.map)
    this.draw = a.draw

    const pos = this.position
    if (!this.ready || pos.distanceToSquared(tgt) > TELEPORT_DIST * TELEPORT_DIST) {
      pos.copy(tgt)
      this.yaw = this.targetYaw
      this.velocity.copy(vel)
      this.snapped = true
      this.ready = true
      return
    }
    const k = 1 - Math.exp(-(this.direct ? SMOOTH_DIRECT : SMOOTH_RELAY) * dt)
    pos.addScaledVector(vel, dt).lerp(tgt, k)
    this.yaw = lerpAngle(this.yaw, this.targetYaw, Math.min(1, k * 1.6))
    this.velocity.copy(vel)
  }
}
