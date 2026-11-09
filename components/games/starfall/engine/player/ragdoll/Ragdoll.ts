/**
 * Position-based (Verlet) ragdoll solver for the hero's particle skeleton (see skeleton.ts).
 *
 * Fixed 120 Hz sub-steps with render interpolation. Each sub-step integrates gravity, air and
 * water drag and buoyancy, then runs a few Gauss–Seidel passes over the rigid links and braces,
 * the joint limits, a waist twist limit, limb self-collision and the world (terrain plane from
 * heightAt + normalAt, the collision world's boxes and cylinders, moving ones included), and
 * finishes with Coulomb friction against whatever each particle touched. Allocation-free.
 */
import * as THREE from 'three'
import type { Collider, CollisionWorld } from '../../collision'
import { DEG } from '../anim/math'
import { F, FRAME_COUNT, P, PARTICLE_COUNT, type JointLimit, type RagdollSkeleton } from './skeleton'

/** What the solver needs from the world (the island's terrain functions in the game). */
export interface RagdollWorld {
  heightAt(x: number, z: number): number
  normalAt(x: number, z: number, out: [number, number, number]): [number, number, number]
  waterLevelAt(x: number, z: number): number
  readonly collision: CollisionWorld
}

/** Sub-step (s), solver passes per sub-step, and the most sub-steps one frame may take. */
const H = 1 / 120
const ITERATIONS = 10
const SETTLE_PASSES = 2
const MAX_STEPS = 8
/** A touch heavier than real gravity, like the rest of the game's physics (m/s²). */
const GRAVITY = 25
/** Air drag (1/s) and a hard cap on particle speed (m/s). */
const AIR_DRAG = 0.3
const MAX_SPEED = 38
/** Coulomb friction against the ground and solids (a limp body grips: it stops on slopes up to ~40°). */
const MU_STATIC = 1.1
const MU_KINETIC = 0.9
/** Fraction of a joint-limit violation corrected per pass, and how much lighter a touching particle acts. */
const LIMIT_STIFF = 0.85
const CONTACT_WEIGHT = 0.25
/** Share of the relative velocity across an engaged joint limit removed per pass. */
const JOINT_FRICTION = 0.02
/** Damping of motion relative to the body's centre of mass (1/s) — a little muscle tone. */
const LIMB_DAMP = 1.5
/** Pull of the rib cage toward its rest shape per pass. */
const SHAPE_STIFF = 0.5
const RIB_CAGE = [P.chest, P.neck, P.shoulderL, P.shoulderR]
/** Upper body twist relative to the pelvis (rad). */
const TWIST_LIMIT = 35 * DEG
/** Buoyancy relative to gravity (torso floats, limbs hang) and water drag (1/s). */
const BUOY_TORSO = 1.25
const BUOY_LIMB = 0.85
const WATER_DRAG = 3.2
/** Self-collision spheres are a little smaller than the world ones. */
const SELF_SCALE = 0.9
/** New contacts faster than this count as impacts (m/s). */
const IMPACT_MIN = 2.5
/** "Calm" thresholds on the body's RMS and peak particle speed (m/s). */
const CALM_RMS = 0.3
const CALM_PEAK = 0.9
const MAX_COLLIDERS = 32
/** Re-sample the terrain under a particle once it has moved this far (m, L1); between samples it collides with the tangent plane. */
const GROUND_RESAMPLE = 0.15

const _a = new THREE.Vector3()
const _b = new THREE.Vector3()
const _c = new THREE.Vector3()
const _d = new THREE.Vector3()
const _e = new THREE.Vector3()
const _n: [number, number, number] = [0, 1, 0]

export class Ragdoll {
  /** Current, previous (Verlet velocity) and start-of-sub-step positions, xyz interleaved. */
  readonly pos = new Float64Array(PARTICLE_COUNT * 3)
  readonly prev = new Float64Array(PARTICLE_COUNT * 3)
  readonly last = new Float64Array(PARTICLE_COUNT * 3)
  /** Interpolated positions for this frame (what the skin shows). */
  readonly render = new Float64Array(PARTICLE_COUNT * 3)

  active = false
  /** Seconds since start(). */
  time = 0
  /** Seconds the body has been calm while touching something. */
  calm = 0
  /** RMS particle speed after the last sub-step (m/s). */
  speed = 0
  /** Hardest new contact this frame (m/s, 0 = none), where it happened and on what. */
  impact = 0
  readonly impactPos = new THREE.Vector3()
  impactCollider: Collider | null = null
  /** A bouncy collider the body bounced off this frame. */
  bounced: Collider | null = null
  /** Set when the solver produced non-finite numbers (the body was reset and stopped). */
  failed = false

  /** Segment frames used while solving joint limits (rest → current, world). */
  private Q: THREE.Quaternion[] = []
  private acc = 0
  private bounceCd = 0
  private seed = 1

  // contacts (per sub-step)
  private hit = new Uint8Array(PARTICLE_COUNT)
  private wasHit = new Uint8Array(PARTICLE_COUNT)
  private depth = new Float64Array(PARTICLE_COUNT)
  private cn = new Float64Array(PARTICLE_COUNT * 3)
  private cv = new Float64Array(PARTICLE_COUNT * 3)
  /** Seconds since each particle last touched something. */
  private touchT = new Float64Array(PARTICLE_COUNT)

  // terrain sample under each particle: point, normal, water level
  private gx = new Float64Array(PARTICLE_COUNT)
  private gz = new Float64Array(PARTICLE_COUNT)
  private gy = new Float64Array(PARTICLE_COUNT)
  private gn = new Float64Array(PARTICLE_COUNT * 3)
  private gw = new Float64Array(PARTICLE_COUNT)
  private gValid = new Uint8Array(PARTICLE_COUNT)
  private gNormal = new Uint8Array(PARTICLE_COUNT)

  // solids near the body this frame
  private cols: Array<Collider | null> = new Array(MAX_COLLIDERS).fill(null)
  private colCos = new Float64Array(MAX_COLLIDERS)
  private colSin = new Float64Array(MAX_COLLIDERS)
  private colN = 0

  constructor(
    private skel: RagdollSkeleton,
    private world: RagdollWorld,
  ) {
    for (let i = 0; i < FRAME_COUNT; i++) this.Q.push(new THREE.Quaternion())
  }

  /** Starts from world positions `src` with per-particle velocities `vel` (m/s). */
  start(src: Float64Array, vel: Float64Array): void {
    const n = PARTICLE_COUNT * 3
    for (let k = 0; k < n; k++) {
      const v = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, vel[k]))
      this.pos[k] = this.last[k] = this.render[k] = src[k]
      this.prev[k] = src[k] - v * H
    }
    this.hit.fill(0)
    this.wasHit.fill(0)
    this.touchT.fill(1)
    this.gValid.fill(0)
    this.acc = this.time = this.calm = this.impact = this.bounceCd = 0
    this.speed = 1
    this.bounced = this.impactCollider = null
    this.failed = false
    this.active = true
  }

  /** Adds a velocity change (m/s) to the whole body, a little uneven so it tumbles. */
  kick(vx: number, vy: number, vz: number): void {
    const push = this.skel.push
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const w = push[i] * (0.85 + 0.3 * this.rand())
      const k = i * 3
      this.prev[k] -= vx * w * H
      this.prev[k + 1] -= vy * w * H
      this.prev[k + 2] -= vz * w * H
    }
    this.calm = 0
  }

  /** Adds velocity (m/s) to one particle — a flailing limb. */
  nudge(i: number, vx: number, vy: number, vz: number): void {
    const k = i * 3
    this.prev[k] -= vx * H
    this.prev[k + 1] -= vy * H
    this.prev[k + 2] -= vz * H
  }

  stop(): void {
    this.active = false
  }

  /** Did any particle touch the ground or a solid within the last `age` seconds? */
  touching(age = 0.2): boolean {
    for (let i = 0; i < PARTICLE_COUNT; i++) if (this.touchT[i] <= age) return true
    return false
  }

  /** Interpolated (rendered) position of particle i. */
  particle(i: number, out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.render[i * 3], this.render[i * 3 + 1], this.render[i * 3 + 2])
  }

  /** Advances by `dt` in fixed sub-steps and refreshes `render`. */
  step(dt: number): void {
    this.impact = 0
    this.impactCollider = null
    this.bounced = null
    if (!this.active || !(dt > 0)) return
    this.time += dt
    this.bounceCd -= dt
    this.gatherColliders(dt)
    this.acc = Math.min(this.acc + dt, MAX_STEPS * H)
    let steps = 0
    while (this.acc >= H) {
      this.substep(H)
      this.acc -= H
      steps++
    }
    if (!this.finite()) {
      this.fail()
      return
    }
    if (steps > 0) this.measure(dt)
    else if (this.calm > 0) this.calm += dt
    const t = this.acc / H
    const r = this.render
    for (let k = 0; k < PARTICLE_COUNT * 3; k++) r[k] = this.last[k] + (this.pos[k] - this.last[k]) * t
  }

  /* ── sub-step ────────────────────────────────────────────── */

  private substep(h: number): void {
    const pos = this.pos
    const prev = this.prev
    const last = this.last
    const radius = this.skel.radius
    const damp = 1 - AIR_DRAG * h
    const g = GRAVITY * h * h
    const cap = MAX_SPEED * h
    const w = this.skel.invMass
    // Centre-of-mass step, for damping the limbs' motion relative to the body.
    let mx = 0
    let my = 0
    let mz = 0
    let m = 0
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const k = i * 3
      const mi = 1 / w[i]
      mx += (pos[k] - prev[k]) * mi
      my += (pos[k + 1] - prev[k + 1]) * mi
      mz += (pos[k + 2] - prev[k + 2]) * mi
      m += mi
    }
    mx /= m
    my /= m
    mz /= m
    const rel = LIMB_DAMP * h
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const k = i * 3
      this.sampleGround(i)
      let vx = pos[k] - prev[k]
      let vy = pos[k + 1] - prev[k + 1]
      let vz = pos[k + 2] - prev[k + 2]
      vx = (vx - (vx - mx) * rel) * damp
      vy = (vy - (vy - my) * rel) * damp
      vz = (vz - (vz - mz) * rel) * damp
      let ay = -g
      const r = radius[i]
      const wet = (this.gw[i] - pos[k + 1] + r) / (2 * r)
      if (wet > 0) {
        const s = wet > 1 ? 1 : wet
        ay += g * (i <= P.head ? BUOY_TORSO : BUOY_LIMB) * s
        const drag = Math.exp(-WATER_DRAG * s * h)
        vx *= drag
        vy *= drag
        vz *= drag
      }
      const sp = Math.sqrt(vx * vx + vy * vy + vz * vz)
      if (sp > cap) {
        vx *= cap / sp
        vy *= cap / sp
        vz *= cap / sp
      }
      last[k] = prev[k] = pos[k]
      last[k + 1] = prev[k + 1] = pos[k + 1]
      last[k + 2] = prev[k + 2] = pos[k + 2]
      pos[k] += vx
      pos[k + 1] += vy + ay
      pos[k + 2] += vz
      this.wasHit[i] = this.hit[i]
      this.hit[i] = 0
      this.depth[i] = 0
    }

    for (let it = 0; it < ITERATIONS; it++) {
      this.solveLinks()
      this.solveLimits()
      this.solveSelf()
      this.collide(it === 0)
    }
    // Friction, then a couple of limit + link passes: a light hand or toe can't pin the whole body
    // (or wrench its joint), while the heavy parts (and a body at rest) keep their grip.
    this.friction(h)
    for (let it = 0; it < SETTLE_PASSES; it++) {
      this.solveLimits()
      this.solveLinks()
      this.collide(false)
    }

    for (let i = 0; i < PARTICLE_COUNT; i++) this.touchT[i] = this.hit[i] ? 0 : this.touchT[i] + h
    if (this.bounced) this.applyBounce(this.bounced)
  }

  /* ── constraints ─────────────────────────────────────────── */

  private solveLinks(): void {
    const pos = this.pos
    const sk = this.skel
    const w = sk.invMass
    const A = sk.linkA
    const B = sk.linkB
    for (let l = 0; l < A.length; l++) {
      const i = A[l]
      const j = B[l]
      const a = i * 3
      const b = j * 3
      const dx = pos[b] - pos[a]
      const dy = pos[b + 1] - pos[a + 1]
      const dz = pos[b + 2] - pos[a + 2]
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (d < 1e-9) continue
      const min = sk.linkMin[l]
      const max = sk.linkMax[l]
      const target = d < min ? min : d > max ? max : d
      if (target === d) continue
      const wa = w[i]
      const wb = w[j]
      const k = (d - target) / (d * (wa + wb))
      pos[a] += dx * wa * k
      pos[a + 1] += dy * wa * k
      pos[a + 2] += dz * wa * k
      pos[b] -= dx * wb * k
      pos[b + 1] -= dy * wb * k
      pos[b + 2] -= dz * wb * k
    }
  }

  private solveLimits(): void {
    const sk = this.skel
    const pos = this.pos
    const Q = this.Q
    const joints = sk.joints
    sk.basisFrame(pos, P.pelvis, P.chest, P.hipL, P.hipR, 0, Q[F.pelvis])
    this.limit(joints[0])
    this.twist()
    sk.basisFrame(pos, P.pelvis, P.chest, P.hipL, P.hipR, 0, Q[F.pelvis])
    sk.basisFrame(pos, P.chest, P.neck, P.shoulderL, P.shoulderR, 1, Q[F.chest])
    this.shapeChest()
    for (let k = 1; k < joints.length; k++) {
      const j = joints[k]
      this.limit(j)
      if (j.frame >= 0) sk.swing(pos, j, Q)
    }
  }

  /**
   * Shape matching for the rib cage. Distance links can't tell a chest from its mirror image
   * (shoulders flipped round to the front), so chest, neck and shoulders are also pulled toward
   * the rest shape in the current chest frame, about their centre of mass.
   */
  private shapeChest(): void {
    const pos = this.pos
    const sk = this.skel
    const rest = sk.rest
    const q = this.Q[F.chest]
    let m = 0
    let cx = 0
    let cy = 0
    let cz = 0
    let rx = 0
    let ry = 0
    let rz = 0
    for (let n = 0; n < RIB_CAGE.length; n++) {
      const k = RIB_CAGE[n] * 3
      const mi = 1 / sk.invMass[RIB_CAGE[n]]
      cx += pos[k] * mi
      cy += pos[k + 1] * mi
      cz += pos[k + 2] * mi
      rx += rest[k] * mi
      ry += rest[k + 1] * mi
      rz += rest[k + 2] * mi
      m += mi
    }
    cx /= m
    cy /= m
    cz /= m
    for (let n = 0; n < RIB_CAGE.length; n++) {
      const k = RIB_CAGE[n] * 3
      const t = _e.set(rest[k] - rx / m, rest[k + 1] - ry / m, rest[k + 2] - rz / m).applyQuaternion(q)
      pos[k] += (cx + t.x - pos[k]) * SHAPE_STIFF
      pos[k + 1] += (cy + t.y - pos[k + 1]) * SHAPE_STIFF
      pos[k + 2] += (cz + t.z - pos[k + 2]) * SHAPE_STIFF
    }
  }

  /**
   * Keeps `child` inside the joint's elliptical cone, moving child and pivot by inverse mass.
   * Particles touching something act heavier, so a foot on the ground bends the leg above it
   * rather than digging in.
   */
  private limit(j: JointLimit): void {
    const pos = this.pos
    const q = this.Q[j.parent]
    const pk = j.pivot * 3
    const ck = j.child * 3
    let dx = pos[ck] - pos[pk]
    let dy = pos[ck + 1] - pos[pk + 1]
    let dz = pos[ck + 2] - pos[pk + 2]
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz)
    if (len < 1e-6) return
    dx /= len
    dy /= len
    dz /= len
    const A = _a.copy(j.axis).applyQuaternion(q)
    const cosT = dx * A.x + dy * A.y + dz * A.z
    if (cosT >= j.cosInner) return
    const U = _b.copy(j.u).applyQuaternion(q)
    const V = _c.copy(j.v).applyQuaternion(q)
    let tu = dx * U.x + dy * U.y + dz * U.z
    let tv = dx * V.x + dy * V.y + dz * V.z
    let tx: number
    let ty: number
    let tz: number
    if (j.hinge) {
      // Hinge: clamp the bend (in the axis–u plane) and the sideways angle separately — the
      // nearest allowed direction, where an ellipse this flat would yank the bend toward its axis.
      const bend = Math.atan2(tu, cosT)
      const side = Math.asin(tv < -1 ? -1 : tv > 1 ? 1 : tv)
      if (bend >= -j.hu && bend <= j.hu && side >= -j.hv && side <= j.hv) return
      const b = bend < -j.hu ? -j.hu : bend > j.hu ? j.hu : bend
      const sd = side < -j.hv ? -j.hv : side > j.hv ? j.hv : side
      const cb = Math.cos(b) * Math.cos(sd)
      const sb = Math.sin(b) * Math.cos(sd)
      const ss = Math.sin(sd)
      tx = A.x * cb + U.x * sb + V.x * ss
      ty = A.y * cb + U.y * sb + V.y * ss
      tz = A.z * cb + U.z * sb + V.z * ss
    } else {
      let tl = Math.sqrt(tu * tu + tv * tv)
      if (tl < 1e-6) {
        tu = 1
        tv = 0
        tl = 1
      }
      tu /= tl
      tv /= tl
      const theta = Math.acos(cosT < -1 ? -1 : cosT)
      const lim = (j.hu * j.hv) / Math.sqrt((j.hv * tu) ** 2 + (j.hu * tv) ** 2)
      if (theta <= lim) return
      // Closest allowed direction (near enough for a roundish cone): the rim in the same azimuth.
      const cs = Math.cos(lim)
      const sn = Math.sin(lim)
      tx = A.x * cs + (U.x * tu + V.x * tv) * sn
      ty = A.y * cs + (U.y * tu + V.y * tv) * sn
      tz = A.z * cs + (U.z * tu + V.z * tv) * sn
    }
    const w = this.skel.invMass
    const wc = w[j.child] * this.contactScale(j.child)
    const ex = pos[pk] + tx * len - pos[ck]
    const ey = pos[pk + 1] + ty * len - pos[ck + 1]
    const ez = pos[pk + 2] + tz * len - pos[ck + 2]
    const wp = w[j.pivot] * this.contactScale(j.pivot)
    const k = LIMIT_STIFF / (wc + wp)
    pos[ck] += ex * wc * k
    pos[ck + 1] += ey * wc * k
    pos[ck + 2] += ez * wc * k
    pos[pk] -= ex * wp * k
    pos[pk + 1] -= ey * wp * k
    pos[pk + 2] -= ez * wp * k
    // Joint friction while the limit holds: damp the child's motion relative to the pivot, so a
    // limb resting against its stop doesn't keep sliding round the rim.
    const prev = this.prev
    const f = JOINT_FRICTION / (wc + wp)
    for (let a = 0; a < 3; a++) {
      const rv = pos[ck + a] - prev[ck + a] - (pos[pk + a] - prev[pk + a])
      prev[ck + a] += rv * wc * f
      prev[pk + a] -= rv * wp * f
    }
  }

  /** Inverse-mass factor for constraint solving: grounded particles act heavier. */
  private contactScale(i: number): number {
    return this.hit[i] || this.wasHit[i] ? CONTACT_WEIGHT : 1
  }

  /** Limits how far the rib cage twists against the pelvis (shoulders vs. hip line). */
  private twist(): void {
    const upP = this.dir(P.pelvis, P.chest, _a)
    const upC = this.dir(P.chest, P.neck, _b)
    // Hip line and shoulder line, both flattened onto the plane across the upper spine.
    const lp = this.dir(P.hipR, P.hipL, _c)
    const lc = this.dir(P.shoulderR, P.shoulderL, _d)
    lp.addScaledVector(upC, -lp.dot(upC))
    lc.addScaledVector(upC, -lc.dot(upC))
    const ang = Math.atan2(_e.crossVectors(lp, lc).dot(upC), lp.dot(lc))
    if (!(Math.abs(ang) > TWIST_LIMIT)) return
    const ex = (ang - Math.sign(ang) * TWIST_LIMIT) * 0.5
    this.rotate(P.shoulderL, P.chest, upC, -ex)
    this.rotate(P.shoulderR, P.chest, upC, -ex)
    this.rotate(P.hipL, P.pelvis, upP, ex)
    this.rotate(P.hipR, P.pelvis, upP, ex)
  }

  private solveSelf(): void {
    const pos = this.pos
    const r = this.skel.radius
    const w = this.skel.invMass
    const pairs = this.skel.selfPairs
    for (let p = 0; p < pairs.length; p += 2) {
      const i = pairs[p]
      const j = pairs[p + 1]
      const a = i * 3
      const b = j * 3
      const dx = pos[b] - pos[a]
      const dy = pos[b + 1] - pos[a + 1]
      const dz = pos[b + 2] - pos[a + 2]
      const min = (r[i] + r[j]) * SELF_SCALE
      const d2 = dx * dx + dy * dy + dz * dz
      if (d2 >= min * min || d2 < 1e-12) continue
      const d = Math.sqrt(d2)
      const wi = w[i] * this.contactScale(i)
      const wj = w[j] * this.contactScale(j)
      const k = (d - min) / (d * (wi + wj))
      pos[a] += dx * wi * k
      pos[a + 1] += dy * wi * k
      pos[a + 2] += dz * wi * k
      pos[b] -= dx * wj * k
      pos[b + 1] -= dy * wj * k
      pos[b + 2] -= dz * wj * k
    }
  }

  /* ── world ───────────────────────────────────────────────── */

  /** Re-samples the terrain under particle i when it moved, unless it is clearly far above it. */
  private sampleGround(i: number): void {
    const k = i * 3
    const x = this.pos[k]
    const y = this.pos[k + 1]
    const z = this.pos[k + 2]
    const r = this.skel.radius[i]
    if (this.gValid[i]) {
      const moved = Math.abs(x - this.gx[i]) + Math.abs(z - this.gz[i])
      const high = y - this.gy[i] - r
      // Terrain slopes stay below ~63°, so the ground can't have risen more than 2× the distance moved.
      if (high > 1 + moved * 2) return
      if (moved < GROUND_RESAMPLE && (this.gNormal[i] || high > 0.8)) return
    }
    const w = this.world
    const gy = w.heightAt(x, z)
    this.gx[i] = x
    this.gz[i] = z
    this.gy[i] = gy
    this.gw[i] = w.waterLevelAt(x, z)
    this.gValid[i] = 1
    if (y - gy - r < 0.8) {
      w.normalAt(x, z, _n)
      this.gn[k] = _n[0]
      this.gn[k + 1] = _n[1]
      this.gn[k + 2] = _n[2]
      this.gNormal[i] = 1
    } else {
      this.gn[k] = this.gn[k + 2] = 0
      this.gn[k + 1] = 1
      this.gNormal[i] = 0
    }
  }

  /** Solids around the body for this frame (moving ones are where the zones just put them). */
  private gatherColliders(dt: number): void {
    const pos = this.pos
    const cx = pos[P.pelvis * 3]
    const cy = pos[P.pelvis * 3 + 1]
    const cz = pos[P.pelvis * 3 + 2]
    let reach = 0
    let fast = 0
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const k = i * 3
      const dx = pos[k] - this.prev[k]
      const dy = pos[k + 1] - this.prev[k + 1]
      const dz = pos[k + 2] - this.prev[k + 2]
      reach = Math.max(reach, Math.sqrt((pos[k] - cx) ** 2 + (pos[k + 2] - cz) ** 2))
      fast = Math.max(fast, Math.sqrt(dx * dx + dy * dy + dz * dz) / H)
    }
    const margin = reach + fast * dt + 0.5
    const list = this.world.collision.query(cx, cz, margin)
    let n = 0
    for (let i = 0; i < list.length && n < MAX_COLLIDERS; i++) {
      const c = list[i]
      const bottom = c.shape === 'box' ? c.y - c.hy : c.y
      const top = c.shape === 'box' ? c.y + c.hy : c.y + c.h
      if (top < cy - margin || bottom > cy + margin) continue
      if (Math.hypot(c.x - cx, c.z - cz) > margin + c.r) continue
      this.cols[n] = c
      this.colCos[n] = Math.cos(c.yaw)
      this.colSin[n] = Math.sin(c.yaw)
      n++
    }
    for (let i = n; i < this.colN; i++) this.cols[i] = null
    this.colN = n
  }

  private collide(first: boolean): void {
    const pos = this.pos
    const radius = this.skel.radius
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const k = i * 3
      const r = radius[i]
      // Terrain: sphere against the tangent plane at the last sample.
      const nx = this.gn[k]
      const ny = this.gn[k + 1]
      const nz = this.gn[k + 2]
      const d = (pos[k] - this.gx[i]) * nx + (pos[k + 1] - this.gy[i]) * ny + (pos[k + 2] - this.gz[i]) * nz
      if (d < r) this.contact(i, nx, ny, nz, r - d, null, first)
      for (let c = 0; c < this.colN; c++) {
        const col = this.cols[c]!
        if (col.shape === 'box') this.box(i, r, col, this.colCos[c], this.colSin[c], first)
        else this.cylinder(i, r, col, first)
      }
    }
  }

  private box(i: number, r: number, c: Collider, cs: number, sn: number, first: boolean): void {
    const pos = this.pos
    const k = i * 3
    const dx = pos[k] - c.x
    const dz = pos[k + 2] - c.z
    // World → box-local (inverse of the three.js Y rotation), as in collision.ts.
    const lx = dx * cs - dz * sn
    const ly = pos[k + 1] - c.y
    const lz = dx * sn + dz * cs
    const hx = c.hx
    const hy = c.hy
    const hz = c.hz
    if (lx > hx + r || lx < -hx - r || ly > hy + r || ly < -hy - r || lz > hz + r || lz < -hz - r) return
    const ex = lx - (lx < -hx ? -hx : lx > hx ? hx : lx)
    const ey = ly - (ly < -hy ? -hy : ly > hy ? hy : ly)
    const ez = lz - (lz < -hz ? -hz : lz > hz ? hz : lz)
    const d2 = ex * ex + ey * ey + ez * ez
    let nx: number
    let ny: number
    let nz: number
    let depth: number
    if (d2 > 1e-12) {
      if (d2 >= r * r) return
      const d = Math.sqrt(d2)
      nx = ex / d
      ny = ey / d
      nz = ez / d
      depth = r - d
    } else {
      // Centre inside: leave through the nearest face.
      const px = hx - Math.abs(lx)
      const py = hy - Math.abs(ly)
      const pz = hz - Math.abs(lz)
      nx = ny = nz = 0
      if (py <= px && py <= pz) {
        ny = ly < 0 ? -1 : 1
        depth = py + r
      } else if (px <= pz) {
        nx = lx < 0 ? -1 : 1
        depth = px + r
      } else {
        nz = lz < 0 ? -1 : 1
        depth = pz + r
      }
    }
    this.contact(i, nx * cs + nz * sn, ny, -nx * sn + nz * cs, depth, c, first)
  }

  private cylinder(i: number, r: number, c: Collider, first: boolean): void {
    const pos = this.pos
    const k = i * 3
    const dx = pos[k] - c.x
    const dz = pos[k + 2] - c.z
    const y = pos[k + 1]
    const R = c.r
    const top = c.y + c.h
    if (y > top + r || y < c.y - r) return
    const rho2 = dx * dx + dz * dz
    if (rho2 > (R + r) * (R + r)) return
    const rho = Math.sqrt(rho2)
    // Closest point on the solid cylinder.
    const s = rho > R ? R / rho : 1
    const ex = dx - dx * s
    const ey = y - (y < c.y ? c.y : y > top ? top : y)
    const ez = dz - dz * s
    const d2 = ex * ex + ey * ey + ez * ez
    if (d2 > 1e-12) {
      if (d2 >= r * r) return
      const d = Math.sqrt(d2)
      this.contact(i, ex / d, ey / d, ez / d, r - d, c, first)
      return
    }
    // Centre inside: out through the side, the top or the bottom, whichever is nearest.
    const side = R - rho
    const up = top - y
    const down = y - c.y
    if (up <= side && up <= down) this.contact(i, 0, 1, 0, up + r, c, first)
    else if (down <= side) this.contact(i, 0, -1, 0, down + r, c, first)
    else if (rho > 1e-6) this.contact(i, dx / rho, 0, dz / rho, side + r, c, first)
    else this.contact(i, 1, 0, 0, side + r, c, first)
  }

  /** Pushes particle i out along n by `depth` and records the contact. */
  private contact(i: number, nx: number, ny: number, nz: number, depth: number, c: Collider | null, first: boolean): void {
    const pos = this.pos
    const k = i * 3
    if (first && !this.wasHit[i] && !this.hit[i]) {
      // Approach speed of a fresh contact (relative to a moving solid).
      let vn = -((pos[k] - this.prev[k]) * nx + (pos[k + 1] - this.prev[k + 1]) * ny + (pos[k + 2] - this.prev[k + 2]) * nz) / H
      if (c) vn += c.vx * nx + c.vy * ny + c.vz * nz
      const heavy = this.skel.invMass[i] < 1
      if (heavy && vn > IMPACT_MIN && vn > this.impact) {
        this.impact = vn
        this.impactPos.set(pos[k] - nx * this.skel.radius[i], pos[k + 1] - ny * this.skel.radius[i], pos[k + 2] - nz * this.skel.radius[i])
        this.impactCollider = c
      }
      if (c && c.bounce > 0 && ny > 0.6 && vn > 1 && this.bounceCd <= 0) this.bounced = c
    }
    pos[k] += nx * depth
    pos[k + 1] += ny * depth
    pos[k + 2] += nz * depth
    this.hit[i] = 1
    this.depth[i] += depth
    this.cn[k] = nx
    this.cn[k + 1] = ny
    this.cn[k + 2] = nz
    this.cv[k] = c ? c.vx : 0
    this.cv[k + 1] = c ? c.vy : 0
    this.cv[k + 2] = c ? c.vz : 0
  }

  /** Coulomb friction from this sub-step's tangential slip (relative to the surface) and push-out depth. */
  private friction(h: number): void {
    const pos = this.pos
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      if (!this.hit[i]) continue
      const k = i * 3
      const nx = this.cn[k]
      const ny = this.cn[k + 1]
      const nz = this.cn[k + 2]
      const dx = pos[k] - this.last[k] - this.cv[k] * h
      const dy = pos[k + 1] - this.last[k + 1] - this.cv[k + 1] * h
      const dz = pos[k + 2] - this.last[k + 2] - this.cv[k + 2] * h
      const dn = dx * nx + dy * ny + dz * nz
      const tx = dx - nx * dn
      const ty = dy - ny * dn
      const tz = dz - nz * dn
      const tl = Math.sqrt(tx * tx + ty * ty + tz * tz)
      if (tl < 1e-9) continue
      const depth = this.depth[i]
      const f = tl < MU_STATIC * depth ? 1 : Math.min(1, (MU_KINETIC * depth) / tl)
      pos[k] -= tx * f
      pos[k + 1] -= ty * f
      pos[k + 2] -= tz * f
    }
  }

  private applyBounce(c: Collider): void {
    const v = c.bounce * 0.8
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const k = i * 3 + 1
      if (this.pos[k] - this.prev[k] < v * H) this.prev[k] = this.pos[k] - v * H
    }
    this.bounceCd = 0.3
  }

  /* ── bookkeeping ─────────────────────────────────────────── */

  /** Body speed and calm time from the last sub-step. */
  private measure(dt: number): void {
    const pos = this.pos
    const last = this.last
    const w = this.skel.invMass
    let e = 0
    let m = 0
    let peak = 0
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const k = i * 3
      const v2 = ((pos[k] - last[k]) ** 2 + (pos[k + 1] - last[k + 1]) ** 2 + (pos[k + 2] - last[k + 2]) ** 2) / (H * H)
      e += v2 / w[i]
      m += 1 / w[i]
      if (v2 > peak) peak = v2
    }
    this.speed = Math.sqrt(e / m)
    const calm = this.speed < CALM_RMS && peak < CALM_PEAK * CALM_PEAK && this.touching(0.25)
    this.calm = calm ? this.calm + dt : 0
  }

  private finite(): boolean {
    for (let k = 0; k < PARTICLE_COUNT * 3; k++) if (!Number.isFinite(this.pos[k])) return false
    return true
  }

  /** Non-finite state (should never happen): freeze on the last good frame and stop. */
  private fail(): void {
    this.pos.set(this.render)
    this.prev.set(this.render)
    this.last.set(this.render)
    this.failed = true
    this.active = false
  }

  private dir(a: number, b: number, out: THREE.Vector3): THREE.Vector3 {
    const pos = this.pos
    return out.set(pos[b * 3] - pos[a * 3], pos[b * 3 + 1] - pos[a * 3 + 1], pos[b * 3 + 2] - pos[a * 3 + 2]).normalize()
  }

  /** Rotates particle i about the line through particle c along unit `axis` by `angle`. */
  private rotate(i: number, c: number, axis: THREE.Vector3, angle: number): void {
    const pos = this.pos
    const k = i * 3
    const o = c * 3
    const v = _e.set(pos[k] - pos[o], pos[k + 1] - pos[o + 1], pos[k + 2] - pos[o + 2]).applyAxisAngle(axis, angle)
    pos[k] = pos[o] + v.x
    pos[k + 1] = pos[o + 1] + v.y
    pos[k + 2] = pos[o + 2] + v.z
  }

  private rand(): number {
    this.seed = (this.seed * 16807) % 2147483647
    return (this.seed - 1) / 2147483646
  }
}
