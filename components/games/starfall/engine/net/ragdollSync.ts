/**
 * Ragdoll replication. While the hero is limp or getting up, the sender streams the body as
 * compact frames (the ragdoll particles relative to the pelvis, see protocol.ts) — 20 a second on
 * the data channels, at most 6 a second over the relay — and stops the moment he is up again.
 *
 * Receivers buffer the frames, render them a little in the past (interpolating the two around the
 * render time, holding the newest when the stream runs dry) and drive the avatar's skeleton with
 * the same RagdollPoser the local hero's skin uses.
 */
import * as THREE from 'three'
import type { ICharacter } from '../types'
import { Pose } from '../player/anim/Pose'
import type { Rig } from '../player/anim/Rig'
import { RagdollPoser } from '../player/ragdoll/posing'
import { PARTICLE_COUNT, RagdollSkeleton } from '../player/ragdoll/skeleton'
import { RAGDOLL_BYTES, copyRagdollFrame, encodeRagdoll, makeRagdollFrame, toBase64, type RagdollFrame } from './protocol'
import type { RemotePeer } from './RemotePeer'
import type { Room } from './Room'

const N3 = PARTICLE_COUNT * 3
const RATE_DIRECT = 20
const RATE_RELAY = 6
/** Frames are shown this far behind their sender's clock (s): over a direct link, over the relay. */
const DELAY_DIRECT = 0.09
const DELAY_RELAY = 0.26
/** A gap this long (s) between frames starts a new ragdoll. */
const NEW_GAP = 0.8
const BUFFER = 8

const lerpAngle = (a: number, b: number, t: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t

/** The local hero's side: samples the body and sends it while it lasts. */
export class RagdollSender {
  private frame = makeRagdollFrame()
  private packet = new DataView(new ArrayBuffer(RAGDOLL_BYTES))
  private body = new Float64Array(N3)
  private root = new THREE.Vector3()
  private seq = 0
  private lastDirect = -Infinity
  private lastRelay = -Infinity
  private impact = 0
  private active = false

  constructor(private selfId: string) {}

  /** The limp body hit something this hard (m/s): reported with the next frame. */
  noteImpact(v: number): void {
    if (this.active && v > this.impact) this.impact = v
  }

  /** Streams the body while the hero ragdolls (`t` = our clock, s). */
  update(ch: ICharacter, room: Room, now: number, t: number): void {
    const yaw = ch.ragdolling ? ch.getRagdollBody(this.body, this.root) : null
    const b = this.body
    if (yaw === null || !Number.isFinite(yaw + b[0] + b[1] + b[2] + this.root.x + this.root.y + this.root.z)) {
      this.active = false
      this.impact = 0
      this.lastDirect = this.lastRelay = -Infinity
      return
    }
    this.active = true
    const direct = now - this.lastDirect >= 1 / RATE_DIRECT
    const relay = now - this.lastRelay >= 1 / RATE_RELAY && room.needsRelay(now)
    if (!direct && !relay) return

    const f = this.frame
    f.seq = this.seq = (this.seq + 1) & 0xffff
    f.t = t
    f.phase = ch.ragdollRecovering ? 2 : 1
    f.impact = this.impact
    f.px = b[0]
    f.py = b[1]
    f.pz = b[2]
    f.rx = this.root.x
    f.ry = this.root.y
    f.rz = this.root.z
    f.yaw = yaw
    for (let i = 0; i < N3; i += 3) {
      f.rel[i] = b[i] - f.px
      f.rel[i + 1] = b[i + 1] - f.py
      f.rel[i + 2] = b[i + 2] - f.pz
    }
    this.impact = 0
    encodeRagdoll(this.packet, f)
    const data = this.packet.buffer as ArrayBuffer
    if (direct) {
      this.lastDirect = now
      room.sendDirect(data)
    }
    if (relay) {
      this.lastRelay = now
      room.send('bin', { from: this.selfId, d: toBase64(data) })
    }
  }
}

/** A peer's received frames (newest last), in their clock. */
export class RagdollBuffer {
  private buf = Array.from({ length: BUFFER }, makeRagdollFrame)
  private head = 0
  count = 0
  /** Hardest impact received and not yet shown (m/s), and where. */
  impact = 0
  readonly impactPos = new THREE.Vector3()

  get newestT(): number {
    return this.count ? this.buf[this.head].t : -Infinity
  }

  get oldestT(): number {
    return this.count ? this.buf[(this.head - this.count + 1 + BUFFER) % BUFFER].t : Infinity
  }

  push(f: RagdollFrame): void {
    if (this.count) {
      const newest = this.buf[this.head]
      // Late, or the relayed copy of a frame that came direct.
      if (f.t <= newest.t) return
      if (f.t - newest.t > NEW_GAP) this.count = 0
    }
    this.head = (this.head + 1) % BUFFER
    copyRagdollFrame(this.buf[this.head], f)
    this.count = Math.min(this.count + 1, BUFFER)
    if (f.impact > this.impact) {
      this.impact = f.impact
      this.impactPos.set(f.px, Math.min(f.py, f.ry + 0.1), f.pz)
    }
  }

  clear(): void {
    this.count = 0
    this.impact = 0
  }

  /**
   * World particle positions (`out`) and pose root at their time `t`, interpolated between the
   * frames around it (held at either end). Returns the root yaw.
   */
  sample(t: number, out: Float64Array, root: THREE.Vector3): number {
    let a = this.buf[this.head]
    let b = a
    for (let i = 1; i < this.count; i++) {
      const s = this.buf[(this.head - i + BUFFER) % BUFFER]
      b = a
      a = s
      if (s.t <= t) break
    }
    const u = b === a ? 0 : THREE.MathUtils.clamp((t - a.t) / Math.max(1e-4, b.t - a.t), 0, 1)
    const px = a.px + (b.px - a.px) * u
    const py = a.py + (b.py - a.py) * u
    const pz = a.pz + (b.pz - a.pz) * u
    const ra = a.rel
    const rb = b.rel
    for (let i = 0; i < N3; i += 3) {
      out[i] = px + ra[i] + (rb[i] - ra[i]) * u
      out[i + 1] = py + ra[i + 1] + (rb[i + 1] - ra[i + 1]) * u
      out[i + 2] = pz + ra[i + 2] + (rb[i + 2] - ra[i + 2]) * u
    }
    root.set(a.rx + (b.rx - a.rx) * u, a.ry + (b.ry - a.ry) * u, a.rz + (b.rz - a.rz) * u)
    return lerpAngle(a.yaw, b.yaw, u)
  }
}

/** Drives one avatar's skeleton from its peer's stream, with the local ragdoll's skinning. */
export class RagdollPuppet {
  /** Body pose (character space, relative to root / yaw). */
  readonly pose = new Pose()
  readonly root = new THREE.Vector3()
  readonly pelvis = new THREE.Vector3()
  yaw = 0
  /** Showing the streamed body this frame. */
  on = false
  private poser: RagdollPoser
  private body = new Float64Array(N3)

  constructor(rig: Rig) {
    this.poser = new RagdollPoser(new RagdollSkeleton(rig), rig)
  }

  /**
   * Follows the peer's frames at local time `now`: starts once the render time reaches the first
   * frame, ends when it has passed the last one and the state stream says they are up again (out
   * of frames while they are still down, the last one holds).
   */
  update(peer: RemotePeer, now: number): boolean {
    const buf = peer.body
    const clock = peer.clock(now)
    const renderT = clock - (peer.direct ? DELAY_DIRECT : DELAY_RELAY)
    const ended = renderT > buf.newestT && !peer.ragdoll
    if (!buf.count || clock < 0 || ended || !(this.on || renderT >= buf.oldestT)) {
      if (ended) buf.clear()
      return (this.on = false)
    }
    this.yaw = buf.sample(renderT, this.body, this.root)
    this.pelvis.set(this.body[0], this.body[1], this.body[2])
    this.poser.pose(this.body, this.root, this.yaw, 0, this.pose)
    return (this.on = true)
  }
}
