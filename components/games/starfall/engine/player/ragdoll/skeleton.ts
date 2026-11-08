/**
 * The hero's ragdoll body plan, derived once from the rig's rest pose (character space,
 * metres; +X = the hero's left, +Y up, +Z forward):
 *
 *   20 particles  pelvis · chest · neck · head, and per side shoulder · elbow · wrist · hand
 *                 (finger middle) · hip · knee · ankle · toe (ball of the foot)
 *   links         rigid bones, plus braces that keep the pelvis and rib cage solid
 *   joints        elliptical cone limits measured in the parent segment's frame; knees and
 *                 elbows are flat cones (hinges), so they only bend one way
 *   frames        rest → current rotation of every segment: the pelvis and the chest come from
 *                 their particles, every limb segment is swung from its parent's frame
 *
 * Shared by the solver (Ragdoll) and the skin driver (RagdollPoser); allocation-free per frame.
 */
import * as THREE from 'three'
import { DEG } from '../anim/math'
import { J } from '../anim/Pose'
import type { Rig } from '../anim/Rig'

/** Particle indices. */
export const P = {
  pelvis: 0, chest: 1, neck: 2, head: 3,
  shoulderL: 4, elbowL: 5, wristL: 6, handL: 7,
  shoulderR: 8, elbowR: 9, wristR: 10, handR: 11,
  hipL: 12, kneeL: 13, ankleL: 14, toeL: 15,
  hipR: 16, kneeR: 17, ankleR: 18, toeR: 19,
} as const
export const PARTICLE_COUNT = 20

/** Segment frame indices. */
export const F = {
  pelvis: 0, chest: 1, head: 2,
  upperArmL: 3, forearmL: 4, handL: 5,
  upperArmR: 6, forearmR: 7, handR: 8,
  thighL: 9, shinL: 10, footL: 11,
  thighR: 12, shinR: 13, footR: 14,
} as const
export const FRAME_COUNT = 15


/**
 * Cone limit of `child` around `pivot`, measured in the frame of segment `parent`. Optionally
 * produces the frame of the pivot→child segment (`frame`), swung from the parent's frame.
 */
export interface JointLimit {
  pivot: number
  child: number
  parent: number
  frame: number
  /** Rest direction pivot → child. */
  dir: THREE.Vector3
  /** Cone centre and the two ellipse axes (rest space). */
  axis: THREE.Vector3
  u: THREE.Vector3
  v: THREE.Vector3
  /** Half-angles along u and v (rad), and cos of the smaller one (quick inside test). */
  hu: number
  hv: number
  cosInner: number
  /** Rest-space swing taking `dir` onto `axis` (keeps the frame swing away from its singularity). */
  p0: THREE.Quaternion
}

interface ParticleSpec {
  joint: number
  radius: number
  mass: number
  /** Share of a start impulse (upper body > legs). */
  push: number
  /** Extra offset from the joint origin, character space (m) — or metres along the bone's own axis. */
  offset?: readonly [number, number, number]
  along?: number
}

/** Index order matches P. */
const SPECS: ParticleSpec[] = [
  { joint: J.hips, radius: 0.125, mass: 9, push: 1 },
  { joint: J.chest, radius: 0.125, mass: 8, push: 1.2 },
  { joint: J.neck, radius: 0.1, mass: 4, push: 1.3 },
  { joint: J.head, radius: 0.14, mass: 4, push: 1.35, offset: [0, 0.097, 0.028] },
  ...arm(J.upperArmL, J.forearmL, J.handL),
  ...arm(J.upperArmR, J.forearmR, J.handR),
  ...leg(J.thighL, J.shinL, J.footL, J.toeL),
  ...leg(J.thighR, J.shinR, J.footR, J.toeR),
]

function arm(upper: number, fore: number, hand: number): ParticleSpec[] {
  return [
    { joint: upper, radius: 0.07, mass: 2.2, push: 1.25 },
    { joint: fore, radius: 0.05, mass: 1.4, push: 1.15 },
    { joint: hand, radius: 0.045, mass: 0.6, push: 1.1 },
    { joint: hand, radius: 0.04, mass: 0.3, push: 1.1, along: 0.1 },
  ]
}

function leg(thigh: number, shin: number, foot: number, toe: number): ParticleSpec[] {
  return [
    { joint: thigh, radius: 0.09, mass: 5, push: 0.85 },
    { joint: shin, radius: 0.065, mass: 3, push: 0.75 },
    { joint: foot, radius: 0.055, mass: 1.2, push: 0.7 },
    { joint: toe, radius: 0.035, mass: 0.4, push: 0.7 },
  ]
}

/** Self-collision pairs (flattened): arms against the torso and head, legs against each other. */
const SELF_PAIRS = (() => {
  const out: number[] = []
  for (const s of [0, 4]) {
    for (const limb of [P.elbowL + s, P.wristL + s, P.handL + s]) {
      for (const body of [P.pelvis, P.chest, P.head]) out.push(limb, body)
    }
  }
  out.push(P.kneeL, P.kneeR, P.ankleL, P.ankleR, P.toeL, P.toeR, P.kneeL, P.ankleR, P.kneeR, P.ankleL)
  out.push(P.handL, P.handR, P.wristL, P.wristR)
  return Uint8Array.from(out)
})()

const X = new THREE.Vector3(1, 0, 0)
const Z = new THREE.Vector3(0, 0, 1)
const _q = new THREE.Quaternion()
const _m = new THREE.Matrix4()
const _a = new THREE.Vector3()
const _b = new THREE.Vector3()
const _c = new THREE.Vector3()
const _d = new THREE.Vector3()

export class RagdollSkeleton {
  readonly count = PARTICLE_COUNT
  /** Rest particle positions (character space, m), xyz interleaved. */
  readonly rest = new Float64Array(PARTICLE_COUNT * 3)
  readonly radius = new Float64Array(PARTICLE_COUNT)
  readonly invMass = new Float64Array(PARTICLE_COUNT)
  readonly push = new Float64Array(PARTICLE_COUNT)
  /** Rig joint each particle rides on and its offset in that bone's local frame (model units). */
  readonly joint: number[] = []
  readonly local: THREE.Vector3[] = []
  /** Links: rigid bones (min = max) and braces (a length range), as parallel arrays. */
  readonly linkA: Uint8Array
  readonly linkB: Uint8Array
  readonly linkMin: Float64Array
  readonly linkMax: Float64Array
  readonly joints: JointLimit[] = []
  /** Self-collision pairs, flattened (a0, b0, a1, b1, …). */
  readonly selfPairs = SELF_PAIRS
  /** Inverse rest bases of the particle-defined frames (pelvis, chest). */
  private restInv = [new THREE.Matrix4(), new THREE.Matrix4()]

  constructor(rig: Rig) {
    const rest = this.rest
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const s = SPECS[i]
      const p = _a.copy(rig.restPos[s.joint])
      const off = _b.set(0, 0, 0)
      if (s.offset) off.set(s.offset[0], s.offset[1], s.offset[2])
      if (s.along) off.set(0, s.along, 0).applyQuaternion(rig.restWorld[s.joint])
      p.add(off)
      rest[i * 3] = p.x
      rest[i * 3 + 1] = p.y
      rest[i * 3 + 2] = p.z
      this.radius[i] = s.radius
      this.invMass[i] = 1 / s.mass
      this.push[i] = s.push
      this.joint.push(s.joint)
      this.local.push(off.applyQuaternion(_q.copy(rig.restWorld[s.joint]).invert()).divideScalar(rig.scale).clone())
    }

    // Bones.
    const links: number[][] = []
    const link = (a: number, b: number, min: number, max: number) => {
      const d = this.p(a, _a).distanceTo(this.p(b, _b))
      links.push([a, b, d * min, d * max])
    }
    const rigid = (a: number, b: number) => link(a, b, 1, 1)
    rigid(P.pelvis, P.hipL)
    rigid(P.pelvis, P.hipR)
    rigid(P.hipL, P.hipR)
    rigid(P.pelvis, P.chest)
    rigid(P.chest, P.neck)
    rigid(P.neck, P.head)
    for (const s of [0, 4]) {
      rigid(P.shoulderL + s, P.elbowL + s)
      rigid(P.elbowL + s, P.wristL + s)
      rigid(P.wristL + s, P.handL + s)
      rigid(P.hipL + s, P.kneeL + s)
      rigid(P.kneeL + s, P.ankleL + s)
      rigid(P.ankleL + s, P.toeL + s)
    }
    // Rib cage: chest, neck and both shoulders form a rigid tetrahedron.
    rigid(P.chest, P.shoulderL)
    rigid(P.chest, P.shoulderR)
    rigid(P.neck, P.shoulderL)
    rigid(P.neck, P.shoulderR)
    rigid(P.shoulderL, P.shoulderR)
    // Lower spine: keeps the chest roughly square over the hip line (a little side bend).
    link(P.hipL, P.chest, 0.96, 1.04)
    link(P.hipR, P.chest, 0.96, 1.04)
    this.linkA = Uint8Array.from(links, l => l[0])
    this.linkB = Uint8Array.from(links, l => l[1])
    this.linkMin = Float64Array.from(links, l => l[2])
    this.linkMax = Float64Array.from(links, l => l[3])

    // Particle-defined frames.
    this.restBasis(P.pelvis, P.chest, P.hipL, P.hipR, this.restInv[0])
    this.restBasis(P.chest, P.neck, P.shoulderL, P.shoulderR, this.restInv[1])

    // Joint limits, parents before children (the solver walks them in this order).
    const up = (deg: number) => (d: THREE.Vector3, out: THREE.Vector3) => out.copy(d).applyAxisAngle(X, deg * DEG)
    this.cone(P.chest, P.neck, F.pelvis, -1, up(15), 40, 25)
    this.cone(P.neck, P.head, F.chest, F.head, up(5), 45, 35)
    for (let side = 0; side < 2; side++) {
      const s = side * 4
      const out = side === 0 ? 1 : -1
      const hinge = rig.axes.elbow[side]
      this.cone(P.shoulderL + s, P.elbowL + s, F.chest, side ? F.upperArmR : F.upperArmL, (_, o) => o.set(0.6 * out, -0.25, 0.75).normalize(), 105, 105)
      this.cone(P.elbowL + s, P.wristL + s, side ? F.upperArmR : F.upperArmL, side ? F.forearmR : F.forearmL, (d, o) => o.copy(d).applyAxisAngle(hinge, 45 * DEG), 72, 6)
      this.cone(P.wristL + s, P.handL + s, side ? F.forearmR : F.forearmL, side ? F.handR : F.handL, (d, o) => o.copy(d), 50, 50)
    }
    for (let side = 0; side < 2; side++) {
      const s = side * 4
      const out = side === 0 ? 1 : -1
      // Hip: flexion −20…120°, abduction −25…45° → cone centred 50° forward, 10° out.
      this.cone(P.hipL + s, P.kneeL + s, F.pelvis, side ? F.thighR : F.thighL,
        (d, o) => o.copy(d).applyAxisAngle(X, -50 * DEG).applyAxisAngle(Z, 10 * DEG * out), 70, 35)
      // Knee: 0…150° flexion (rest is ~8°), barely any sideways play.
      this.cone(P.kneeL + s, P.ankleL + s, side ? F.thighR : F.thighL, side ? F.shinR : F.shinL, up(67), 75, 8)
      // Ankle: 20° up, 50° down.
      this.cone(P.ankleL + s, P.toeL + s, side ? F.shinR : F.shinL, side ? F.footR : F.footL, up(15), 35, 15)
    }
  }

  private p(i: number, out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.rest[i * 3], this.rest[i * 3 + 1], this.rest[i * 3 + 2])
  }

  private restBasis(a: number, b: number, c: number, d: number, out: THREE.Matrix4): void {
    basisOf(this.p(a, _a), this.p(b, _b), this.p(c, _c), this.p(d, _d), out)
    out.transpose()
  }

  /**
   * `centre(dir, out)` maps the rest direction to the cone axis; the major axis u follows the
   * direction the centre moved in (so hu is the range along the main bend).
   */
  private cone(
    pivot: number, child: number, parent: number, frame: number,
    centre: (dir: THREE.Vector3, out: THREE.Vector3) => THREE.Vector3, huDeg: number, hvDeg: number,
  ): void {
    const dir = this.p(child, new THREE.Vector3()).sub(this.p(pivot, _a)).normalize()
    const axis = centre(dir, new THREE.Vector3()).normalize()
    // Major axis: from the rest direction toward the centre, or "up the bend" when they coincide.
    const u = dir.clone().addScaledVector(axis, -dir.dot(axis)).negate()
    if (u.lengthSq() < 1e-6) u.set(0, 1, 0).addScaledVector(axis, -axis.y)
    if (u.lengthSq() < 1e-6) u.set(0, 0, 1).addScaledVector(axis, -axis.z)
    u.normalize()
    const v = new THREE.Vector3().crossVectors(axis, u)
    const hu = huDeg * DEG
    const hv = hvDeg * DEG
    this.joints.push({
      pivot, child, parent, frame, dir, axis, u, v, hu, hv,
      cosInner: Math.cos(Math.min(hu, hv)),
      p0: new THREE.Quaternion().setFromUnitVectors(dir, axis),
    })
  }

  /**
   * Rest → current rotations of every segment from particle positions `src` (world or any
   * frame — the rotations come out in that frame). Same construction the solver limits in.
   */
  frames(src: Float64Array, out: THREE.Quaternion[]): void {
    this.basisFrame(src, P.pelvis, P.chest, P.hipL, P.hipR, 0, out[F.pelvis])
    this.basisFrame(src, P.chest, P.neck, P.shoulderL, P.shoulderR, 1, out[F.chest])
    for (const j of this.joints) if (j.frame >= 0) this.swing(src, j, out)
  }

  /** Frame of a particle-defined segment: up = a→b, left = d→c. Keeps `out` when degenerate. */
  basisFrame(src: Float64Array, a: number, b: number, c: number, d: number, which: 0 | 1, out: THREE.Quaternion): void {
    vec(src, a, _a)
    vec(src, b, _b)
    vec(src, c, _c)
    vec(src, d, _d)
    if (!basisOf(_a, _b, _c, _d, _m)) return
    out.setFromRotationMatrix(_m.multiply(this.restInv[which]))
  }

  /** Frame of the pivot→child segment of `j`, swung from its parent's frame via the cone axis. */
  swing(src: Float64Array, j: JointLimit, out: THREE.Quaternion[]): void {
    const parent = out[j.parent]
    const a = _a.copy(j.axis).applyQuaternion(parent)
    const d = vec(src, j.child, _b).sub(vec(src, j.pivot, _c))
    const l = d.length()
    if (l < 1e-6) return
    d.divideScalar(l)
    _q.setFromUnitVectors(a, d)
    out[j.frame].multiplyQuaternions(_q, parent).multiply(j.p0)
  }
}

/** Reads particle i of an interleaved array. */
export function vec(src: Float64Array, i: number, out: THREE.Vector3): THREE.Vector3 {
  return out.set(src[i * 3], src[i * 3 + 1], src[i * 3 + 2])
}

const _bu = new THREE.Vector3()
const _bl = new THREE.Vector3()
const _bf = new THREE.Vector3()

/** Basis with columns (left, up, forward): up = a→b, left = d→c orthogonalised. False if degenerate. */
function basisOf(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, out: THREE.Matrix4): boolean {
  const up = _bu.subVectors(b, a)
  const ul = up.length()
  if (ul < 1e-6) return false
  up.divideScalar(ul)
  const left = _bl.subVectors(c, d)
  left.addScaledVector(up, -left.dot(up))
  const ll = left.length()
  if (ll < 1e-6) return false
  left.divideScalar(ll)
  _bf.crossVectors(left, up)
  out.makeBasis(left, up, _bf)
  return true
}
