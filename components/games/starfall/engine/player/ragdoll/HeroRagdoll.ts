/**
 * The hero's ragdoll from start to finish: going limp from the animated pose, the Verlet body
 * (Ragdoll), the skin following it (RagdollPoser) and getting back up (getup.ts).
 *
 *   off ──start()──▶ limp ──settled, allowed──▶ getup ──▶ off
 *                    ▲  │                         │
 *                    │  └───── cancel() ──────────┴──▶ off
 *                    └── start() while getting up: knocked down again
 *
 * `pose` is what the body shows this frame, in character space relative to `rootPos` / `rootYaw`
 * (the Character puts its root there and hands the pose to the Animator as an override).
 * `anchor` is the point the player capsule follows: under the pelvis on the ground once the body
 * is down (feet level while it is still in the air), then the spot he stands up on.
 * While getting up, slerping limbs could sweep through the ground on their way to the next key:
 * a ground guard swings such a limb up about its shoulder or hip just enough.
 * Allocation-free per frame.
 */
import * as THREE from 'three'
import type { CollisionWorld, GroundHit, WallPush } from '../../collision'
import type { V3 } from '../../events'
import { heightAt, normalAt, surfaceAt, waterLevelAt, type Surface } from '../../world/heightfield'
import { smooth } from '../anim/math'
import { J, JOINT_COUNT, JOINT_PARENT, Pose, PoseBuilder } from '../anim/Pose'
import type { Rig } from '../anim/Rig'
import { buildGetUpTracks, sampleTrack, type GetUpTrack } from './getup'
import { RagdollPoser } from './posing'
import { Ragdoll } from './Ragdoll'
import { F, P, PARTICLE_COUNT, RagdollSkeleton, vec } from './skeleton'

/** Get up after this long calm (s), or after MAX_LIMP whatever the body is doing (once it rests on something). */
const SETTLE_TIME = 0.6
const MAX_LIMP = 3.5
const MIN_LIMP = 0.5
/** The animation details the particles can't see fade out over this long (s). */
const OFFSET_FADE = 0.35
/** Get-up: hold the first key this long, and cross-fade from the ragdoll pose over GETUP_BLEND (s). */
const GETUP_LEAD = 0.12
const GETUP_BLEND = 0.32
/** Limb motion relative to the root carried into the ragdoll is capped at this (m/s). */
const LIMB_SPEED = 5
/** Ragdoll impacts at least this hard (m/s) are reported, at most once per IMPACT_GAP (s). */
const IMPACT_EVENT = 4
const IMPACT_GAP = 0.25
/** Impacts right after going limp belong to whatever made him go limp (the controller reported it). */
const IMPACT_GRACE = 0.15
/** The stand-up spot may be at most this far above / below the ground under the pelvis (m). */
const STAND_DROP = 0.7
/** Airborne, a random hand or foot gets a flailing kick (m/s) every FLAIL_GAP seconds or so. */
const FLAIL_SPEED = 3.2
const FLAIL_GAP = 0.11
const FLAIL_LIMBS = [P.handL, P.handR, P.ankleL, P.ankleR, P.elbowL, P.elbowR]

export type RagdollEvent = 'none' | 'rise' | 'done' | 'failed'
export type RagdollPhase = 'off' | 'limp' | 'getup'

/** Ground guard: each limb's root joint, the joints it keeps above the ground and their clearance (m). */
const LIMB_ROOT = [J.upperArmL, J.upperArmR, J.thighL, J.thighR]
const LIMB_JOINTS = [[J.forearmL, J.handL], [J.forearmR, J.handR], [J.shinL, J.footL, J.toeL], [J.shinR, J.footR, J.toeR]]
const LIMB_CLEAR = [[0.04, 0.03], [0.04, 0.03], [0.05, 0.06, 0.02], [0.05, 0.06, 0.02]]
const ALL_JOINTS = Array.from({ length: JOINT_COUNT }, (_, j) => j)

const N3 = PARTICLE_COUNT * 3
const FWD = new THREE.Vector3(0, 0, 1)
const _a = new THREE.Vector3()
const _b = new THREE.Vector3()
const _f = new THREE.Vector3()
const _d = new THREE.Vector3()
const _q = new THREE.Quaternion()

export class HeroRagdoll {
  phase: RagdollPhase = 'off'
  /** Body pose for this frame (character space, relative to rootPos / rootYaw). */
  readonly pose = new Pose()
  readonly rootPos = new THREE.Vector3()
  rootYaw = 0
  readonly anchor = new THREE.Vector3()
  /** A hard hit this frame worth an event (m/s, 0 = none), where, and on what. */
  impact = 0
  readonly impactPos = new THREE.Vector3()
  impactSurface: Surface = 'grass'

  private skel: RagdollSkeleton
  private sim: Ragdoll
  private poser: RagdollPoser
  private tracks: { prone: GetUpTrack; supine: GetUpTrack }
  /** The get-up being played. */
  private getUp: GetUpTrack
  private rig: Rig
  private hipsY: number
  private t = 0
  private impactCd = 0
  private flailT = 0
  private wet = false
  private from = new Pose()
  private sample = new Pose()

  /** Particle positions relative to the root over the last two animated frames (start velocities). */
  private relA = new Float64Array(N3)
  private relB = new Float64Array(N3)
  private relDt = 0
  private relFrames = 0
  private src = new Float64Array(N3)
  private vel = new Float64Array(N3)

  private hit = { y: 0, nx: 0, ny: 1, nz: 0, surface: 'grass', collider: null, water: 0 } as GroundHit
  private push: WallPush = { x: 0, z: 0, hit: false, nx: 0, nz: 0 }

  constructor(
    rig: Rig,
    private collision: CollisionWorld,
    /** Player capsule (the stand-up spot must fit it). */
    private capsule: { radius: number; height: number },
  ) {
    this.skel = new RagdollSkeleton(rig)
    this.sim = new Ragdoll(this.skel, { heightAt, normalAt, waterLevelAt, collision })
    this.poser = new RagdollPoser(this.skel, rig)
    this.tracks = buildGetUpTracks(new PoseBuilder(rig.axes))
    this.getUp = this.tracks.supine
    this.rig = rig
    this.hipsY = rig.hipsRest.y
  }

  get active(): boolean {
    return this.phase !== 'off'
  }

  /**
   * Remembers where the animated particles are relative to the root (call after the bones were
   * written and their world matrices updated). `reset` after anything that moved the root alone.
   */
  track(root: THREE.Vector3, dt: number, reset: boolean): void {
    const t = this.relB
    this.relB = this.relA
    this.relA = t
    this.readBones(t)
    for (let i = 0; i < N3; i += 3) {
      t[i] -= root.x
      t[i + 1] -= root.y
      t[i + 2] -= root.z
    }
    this.relDt = dt
    this.relFrames = reset ? 1 : Math.min(2, this.relFrames + 1)
  }

  /**
   * Goes limp from the pose the bones show now (`yaw` = the heading they were posed for), moving
   * with `v` plus the animation's own limb motion, plus `impulse` (m/s, more on the upper body).
   * Already limp: just the impulse.
   */
  start(yaw: number, v: V3, impulse: V3): void {
    const sim = this.sim
    if (this.phase === 'limp') {
      sim.kick(impulse.x, impulse.y, impulse.z)
      return
    }
    const src = this.src
    const vel = this.vel
    this.readBones(src)
    const limbs = this.relFrames >= 2 && this.relDt > 0
    for (let i = 0; i < N3; i += 3) {
      for (let a = 0; a < 3; a++) {
        const lv = limbs ? (this.relA[i + a] - this.relB[i + a]) / this.relDt : 0
        vel[i + a] = (a === 0 ? v.x : a === 1 ? v.y : v.z) + (lv > LIMB_SPEED ? LIMB_SPEED : lv < -LIMB_SPEED ? -LIMB_SPEED : lv)
      }
    }
    sim.start(src, vel)
    sim.kick(impulse.x, impulse.y, impulse.z)
    this.poser.capture(src, yaw)
    this.phase = 'limp'
    this.t = 0
    this.impact = 0
    this.impactCd = IMPACT_GRACE
    this.relFrames = 0
    this.rootYaw = yaw
    this.updateAnchor(src)
    this.rootPos.copy(this.anchor)
    this.poser.pose(src, this.rootPos, yaw, 1, this.pose)
  }

  /** Ends it on the spot (the caller snaps the body back to the animation). */
  cancel(): void {
    this.phase = 'off'
    this.sim.stop()
    this.relFrames = 0
  }

  /**
   * Advances the body by `dt`. While `canGetUp` is false (dead, a dialog) he stays down.
   * 'rise' = the get-up began this frame (root moved), 'done' = he is standing again.
   */
  update(dt: number, canGetUp: boolean): RagdollEvent {
    this.impact = 0
    if (this.phase === 'limp') return this.updateLimp(dt, canGetUp)
    if (this.phase === 'getup') return this.updateGetUp(dt)
    return 'none'
  }

  /* ── limp ────────────────────────────────────────────────── */

  private updateLimp(dt: number, canGetUp: boolean): RagdollEvent {
    const sim = this.sim
    sim.step(dt)
    if (sim.failed) {
      this.cancel()
      return 'failed'
    }
    this.t += dt
    this.updateAnchor(sim.render)
    this.rootPos.copy(this.anchor)
    this.poser.pose(sim.render, this.rootPos, this.rootYaw, 1 - smooth(this.t / OFFSET_FADE), this.pose)

    this.flail(dt)
    this.impactCd -= dt
    if (sim.impact >= IMPACT_EVENT && this.impactCd <= 0) {
      this.impactCd = IMPACT_GAP
      this.impact = sim.impact
      const p = this.impactPos.copy(sim.impactPos)
      this.impactSurface = sim.impactCollider ? sim.impactCollider.surface : surfaceAt(p.x, p.z)
    }

    if (canGetUp && this.settled()) {
      this.beginGetUp()
      return 'rise'
    }
    return 'none'
  }

  /** Flying through the air, the limbs windmill: small random kicks to the hands and feet. */
  private flail(dt: number): void {
    this.flailT -= dt
    if (this.flailT > 0 || this.t < 0.08 || this.wet || this.sim.touching(0.12)) return
    this.flailT = FLAIL_GAP * (0.6 + Math.random() * 0.8)
    const i = FLAIL_LIMBS[Math.floor(Math.random() * FLAIL_LIMBS.length)]
    const a = Math.random() * Math.PI * 2
    const up = Math.random() * 2 - 0.6
    const s = FLAIL_SPEED * (0.7 + Math.random() * 0.6)
    this.sim.nudge(i, Math.cos(a) * s, up * s, Math.sin(a) * s)
  }

  /** Resting on something (or floating) and calm for a moment — or simply down for long enough. */
  private settled(): boolean {
    const sim = this.sim
    if (this.t < MIN_LIMP || !(sim.touching(0.3) || this.wet)) return false
    return sim.calm >= SETTLE_TIME || this.t >= MAX_LIMP
  }

  /** Ground under the pelvis, or feet level under it while the body is still up in the air. */
  private updateAnchor(src: Float64Array): void {
    const k = P.pelvis * 3
    const x = src[k]
    const y = src[k + 1]
    const z = src[k + 2]
    const g = this.collision.groundAt(x, z, y, 0.1, 0.3, this.hit)
    this.anchor.set(x, Math.max(g.y, y - this.hipsY), z)
    this.wet = g.water > y - 0.05
  }

  /* ── getting up ──────────────────────────────────────────── */

  /**
   * Face down → push up from the front; face up → sit up. The new heading lines the track's first
   * key up with the body (prone: head forward; supine: feet forward), and the root moves to where
   * he will stand: under the pelvis, or the track's shift toward the feet — on the ground and clear
   * of solids.
   */
  private beginGetUp(): void {
    const r = this.sim.render
    const fwd = _f.copy(FWD).applyQuaternion(this.poser.frames[F.chest])
    const prone = fwd.y < 0
    const track = (this.getUp = prone ? this.tracks.prone : this.tracks.supine)
    const pelvis = vec(r, P.pelvis, _a)
    const neck = vec(r, P.neck, _b)
    let hx = (neck.x - pelvis.x) * (prone ? 1 : -1)
    let hz = (neck.z - pelvis.z) * (prone ? 1 : -1)
    // Spine nearly upright (sitting, kneeling): the chest's facing says where he looks.
    if (hx * hx + hz * hz < 0.15 * 0.15) {
      hx = fwd.x
      hz = fwd.z
    }
    const yaw = hx * hx + hz * hz > 1e-8 ? Math.atan2(hx, hz) : this.rootYaw
    const ground = this.anchor.y
    const s = track.shift
    if (!this.standAt(pelvis.x + Math.sin(yaw) * s, pelvis.z + Math.cos(yaw) * s, ground) && s !== 0) {
      this.standAt(pelvis.x, pelvis.z, ground)
    }
    this.rootPos.copy(this.anchor)
    this.rootYaw = yaw
    this.poser.pose(r, this.rootPos, yaw, 0, this.from)
    this.pose.copy(this.from)
    this.sim.stop()
    this.phase = 'getup'
    this.t = 0
    this.relFrames = 0
  }

  /** Puts the anchor at (x, z) pushed clear of solids, on the ground; false if that is far off `nearY`. */
  private standAt(x: number, z: number, nearY: number): boolean {
    const a = this.anchor.set(x, nearY, z)
    const c = this.capsule
    for (let i = 0; i < 2; i++) this.collision.pushOut(a, c.radius, c.height, 0.45, this.push)
    const g = this.collision.groundAt(a.x, a.z, nearY + 0.3, c.radius, 0.45, this.hit)
    a.y = g.y
    return Math.abs(g.y - nearY) < STAND_DROP
  }

  private updateGetUp(dt: number): RagdollEvent {
    this.t += dt
    const track = this.getUp
    if (this.t >= GETUP_LEAD + track.end) {
      this.phase = 'off'
      return 'done'
    }
    sampleTrack(track, Math.max(0, this.t - GETUP_LEAD), this.sample)
    this.pose.copy(this.from).blend(this.sample, smooth(this.t / GETUP_BLEND))
    this.groundGuard()
    return 'none'
  }

  /**
   * Swings any limb whose elbow, hand, knee, ankle or toe would be under the ground up about its
   * shoulder / hip just enough (the legs' IK, when the pose asks for it, then plants the feet).
   */
  private groundGuard(): void {
    const rig = this.rig
    const pose = this.pose
    const C = rig.C
    const c = Math.cos(this.rootYaw)
    const s = Math.sin(this.rootYaw)
    const root = this.rootPos
    rig.hipsPos.copy(rig.hipsRest).add(pose.pos)
    rig.accumulate(pose, ALL_JOINTS)
    for (let l = 0; l < LIMB_ROOT.length; l++) {
      const upper = LIMB_ROOT[l]
      const joints = LIMB_JOINTS[l]
      let need = 0
      let worst = -1
      for (let i = 0; i < joints.length; i++) {
        const p = rig.jointPos(_a, joints[i])
        const g = this.collision.groundAt(root.x + c * p.x + s * p.z, root.z - s * p.x + c * p.z, root.y + p.y, 0.05, 0.3, this.hit)
        const n = g.y - root.y + LIMB_CLEAR[l][i] - p.y
        if (n > need) {
          need = n
          worst = joints[i]
        }
      }
      if (worst < 0) continue
      // Rotate the limb about its root joint so the worst point rises by `need` (same heading).
      const pivot = rig.jointPos(_b, upper)
      const d = rig.jointPos(_a, worst).sub(pivot)
      const len = d.length()
      if (len < 1e-4) continue
      const ty = Math.min(len, d.y + need)
      const h = Math.hypot(d.x, d.z)
      const k = h > 1e-6 ? Math.sqrt(Math.max(0, len * len - ty * ty)) / h : 0
      _d.set(d.x * k, ty, d.z * k).divideScalar(len)
      _q.setFromUnitVectors(d.divideScalar(len), _d)
      C[upper].premultiply(_q)
      pose.q[upper].copy(C[JOINT_PARENT[upper]]).invert().multiply(C[upper])
    }
  }

  /* ── helpers ─────────────────────────────────────────────── */

  /** World positions of the particles on the animated skeleton (bone world matrices must be current). */
  private readBones(out: Float64Array): void {
    const sk = this.skel
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = _a.copy(sk.local[i]).applyMatrix4(this.rig.bones[sk.joint[i]].matrixWorld)
      out[i * 3] = p.x
      out[i * 3 + 1] = p.y
      out[i * 3 + 2] = p.z
    }
  }
}
