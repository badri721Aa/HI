/**
 * Pose representation for the procedural animator.
 *
 * A pose stores, for every driven joint, a rotation OFFSET expressed in
 * character space (+X = the hero's left, +Y up, +Z forward) and applied in the
 * frame of the parent's rest pose. Offsets therefore compose like forward
 * kinematics: the world (character-space) orientation of a joint is
 *   C_j = R_root · … · R_parent · R_j · Rest_j
 * which makes authoring independent of each bone's roll.
 *
 * Authoring convention (degrees, via PoseBuilder):
 *   x  pitch — positive tips the top of a joint forward. A spine bends forward,
 *      the head nods down, a hanging limb swings BACK, a foot points its toes down.
 *   y  yaw   — positive turns toward the hero's left. On limbs (mirrored per side)
 *      positive is an outward / external twist.
 *   z  roll  — centre joints: positive tilts the top toward the hero's right.
 *      On limbs (mirrored per side) positive moves the limb outward (abduction)
 *      and raises a shoulder.
 * Rotations are applied twist (y) first, then roll (z), then pitch (x).
 */
import * as THREE from 'three'
import { DEG } from './math'

export const J = {
  hips: 0, spine: 1, chest: 2, neck: 3, head: 4,
  shoulderL: 5, upperArmL: 6, forearmL: 7, handL: 8,
  shoulderR: 9, upperArmR: 10, forearmR: 11, handR: 12,
  thighL: 13, shinL: 14, footL: 15, toeL: 16,
  thighR: 17, shinR: 18, footR: 19, toeR: 20,
} as const

export const JOINT_COUNT = 21

/** Bone names as GLTFLoader exposes them (dots stripped). */
export const JOINT_BONES = [
  'hips', 'spine', 'chest', 'neck', 'head',
  'shoulderL', 'upper_armL', 'forearmL', 'handL',
  'shoulderR', 'upper_armR', 'forearmR', 'handR',
  'thighL', 'shinL', 'footL', 'toeL',
  'thighR', 'shinR', 'footR', 'toeR',
] as const

/** Parent joint index (-1 = the armature root). */
export const JOINT_PARENT = [-1, 0, 1, 2, 3, 2, 5, 6, 7, 2, 9, 10, 11, 0, 13, 14, 15, 0, 17, 18, 19] as const

/** 0 = centre line, 1 = left, -1 = right. */
export const JOINT_SIDE = [0, 0, 0, 0, 0, 1, 1, 1, 1, -1, -1, -1, -1, 1, 1, 1, 1, -1, -1, -1, -1] as const

export class Pose {
  readonly q: THREE.Quaternion[] = []
  /** Hips translation offset (metres, character space). */
  readonly pos = new THREE.Vector3()
  /** Finger curl per hand, 0 = open, 1 = fist. [left, right] */
  readonly curl = [0.3, 0.3]
  /** Index finger held straight (pointing), per hand. */
  readonly point = [0, 0]
  /** Weight of the IK (feet planted) leg solution vs. the authored FK legs. */
  ik = 1
  /** How strongly the head is kept level / pointed at the look target (0..1). */
  stab = 0.5
  /** Offsets added to the planted IK foot targets (m, character space) and extra foot pitch (rad). */
  readonly footOff = [new THREE.Vector3(), new THREE.Vector3()]
  readonly footPitch = [0, 0]

  constructor() {
    for (let i = 0; i < JOINT_COUNT; i++) this.q.push(new THREE.Quaternion())
  }

  reset(): this {
    for (const q of this.q) q.identity()
    this.pos.set(0, 0, 0)
    this.curl[0] = this.curl[1] = 0.3
    this.point[0] = this.point[1] = 0
    this.ik = 1
    this.stab = 0.5
    this.footOff[0].set(0, 0, 0)
    this.footOff[1].set(0, 0, 0)
    this.footPitch[0] = this.footPitch[1] = 0
    return this
  }

  copy(p: Pose): this {
    for (let i = 0; i < JOINT_COUNT; i++) this.q[i].copy(p.q[i])
    this.pos.copy(p.pos)
    this.curl[0] = p.curl[0]
    this.curl[1] = p.curl[1]
    this.point[0] = p.point[0]
    this.point[1] = p.point[1]
    this.ik = p.ik
    this.stab = p.stab
    this.footOff[0].copy(p.footOff[0])
    this.footOff[1].copy(p.footOff[1])
    this.footPitch[0] = p.footPitch[0]
    this.footPitch[1] = p.footPitch[1]
    return this
  }

  /** this ← slerp(this, b, t). */
  blend(b: Pose, t: number): this {
    if (t <= 0) return this
    if (t >= 1) return this.copy(b)
    for (let i = 0; i < JOINT_COUNT; i++) this.q[i].slerp(b.q[i], t)
    this.pos.lerp(b.pos, t)
    this.curl[0] += (b.curl[0] - this.curl[0]) * t
    this.curl[1] += (b.curl[1] - this.curl[1]) * t
    this.point[0] += (b.point[0] - this.point[0]) * t
    this.point[1] += (b.point[1] - this.point[1]) * t
    this.ik += (b.ik - this.ik) * t
    this.stab += (b.stab - this.stab) * t
    this.footOff[0].lerp(b.footOff[0], t)
    this.footOff[1].lerp(b.footOff[1], t)
    this.footPitch[0] += (b.footPitch[0] - this.footPitch[0]) * t
    this.footPitch[1] += (b.footPitch[1] - this.footPitch[1]) * t
    return this
  }

  /** Like blend() but only for the joints in `joints` (pos/curl/ik untouched). */
  blendJoints(b: Pose, t: number, joints: readonly number[]): this {
    if (t <= 0) return this
    for (const j of joints) this.q[j].slerp(b.q[j], Math.min(1, t))
    return this
  }
}

type V = readonly [number, number, number]

/** Declarative pose, compiled once into a Pose. Angles in degrees, positions in metres. */
export interface PoseSpec {
  pos?: V
  hips?: V
  spine?: V
  chest?: V
  neck?: V
  head?: V
  shoulders?: V
  shoulderL?: V
  shoulderR?: V
  arms?: V
  armL?: V
  armR?: V
  /** Elbow flexion (degrees, 0 = rest bend). */
  elbows?: number
  elbowL?: number
  elbowR?: number
  /** Forearm twist (degrees, positive = palm turns forward/up). */
  twists?: number
  twistL?: number
  twistR?: number
  hands?: V
  handL?: V
  handR?: V
  thighs?: V
  thighL?: V
  thighR?: V
  /** Knee flexion (degrees). */
  knees?: number
  kneeL?: number
  kneeR?: number
  feet?: V
  footL?: V
  footR?: V
  /** Toe pitch (degrees, negative = toes bent up). */
  toes?: number
  curl?: number
  curlL?: number
  curlR?: number
  pointL?: number
  pointR?: number
  ik?: number
  stab?: number
  /** IK foot target offsets (m) and pitch (degrees, positive = heel up). */
  footOffL?: V
  footOffR?: V
  pitchL?: number
  pitchR?: number
}

/** Rig-specific axes the builder needs (filled in from the loaded skeleton). */
export interface RigAxes {
  /** Elbow flexion hinge per side [left, right], character space. */
  elbow: [THREE.Vector3, THREE.Vector3]
  /** Forearm long axis per side, character space (twist axis). */
  forearm: [THREE.Vector3, THREE.Vector3]
}

const _e = new THREE.Euler(0, 0, 0, 'XZY')
const _q = new THREE.Quaternion()
const _q2 = new THREE.Quaternion()

/** Writes joint offsets using the authoring convention described at the top of this file. */
export class PoseBuilder {
  constructor(private axes: RigAxes) {}

  /** Quaternion for (x, y, z) degrees on joint j (mirrored for right-side joints). */
  euler(out: THREE.Quaternion, j: number, x: number, y: number, z: number): THREE.Quaternion {
    const m = JOINT_SIDE[j] === -1 ? -1 : 1
    _e.set(x * DEG, y * DEG * m, z * DEG * m, 'XZY')
    return out.setFromEuler(_e)
  }

  set(p: Pose, j: number, x: number, y: number, z: number): void {
    this.euler(p.q[j], j, x, y, z)
  }

  /** Applies an extra character-space rotation on top of the joint's current offset. */
  add(p: Pose, j: number, x: number, y: number, z: number): void {
    if (x === 0 && y === 0 && z === 0) return
    this.euler(_q, j, x, y, z)
    p.q[j].premultiply(_q)
  }

  /** Forearm: flexion about the elbow hinge, then twist about the forearm axis. */
  elbowQuat(out: THREE.Quaternion, side: 0 | 1, flex: number, twist: number): THREE.Quaternion {
    out.setFromAxisAngle(this.axes.elbow[side], flex * DEG)
    if (twist !== 0) {
      _q2.setFromAxisAngle(this.axes.forearm[side], (side === 0 ? twist : -twist) * DEG)
      out.multiply(_q2)
    }
    return out
  }

  /** side: 0 = left, 1 = right. */
  elbow(p: Pose, side: 0 | 1, flex: number, twist = 0): void {
    this.elbowQuat(p.q[side === 0 ? J.forearmL : J.forearmR], side, flex, twist)
  }

  addElbow(p: Pose, side: 0 | 1, flex: number, twist = 0): void {
    if (flex === 0 && twist === 0) return
    this.elbowQuat(_q, side, flex, twist)
    p.q[side === 0 ? J.forearmL : J.forearmR].premultiply(_q)
  }

  /** Resets `p` and writes the spec into it. */
  fromSpec(p: Pose, s: PoseSpec): Pose {
    p.reset()
    return this.applySpec(p, s)
  }

  /** Writes every field present in the spec (others untouched). */
  applySpec(p: Pose, s: PoseSpec): Pose {
    const v = (j: number, a?: V) => {
      if (a) this.set(p, j, a[0], a[1], a[2])
    }
    if (s.pos) p.pos.set(s.pos[0], s.pos[1], s.pos[2])
    v(J.hips, s.hips)
    v(J.spine, s.spine)
    v(J.chest, s.chest)
    v(J.neck, s.neck)
    v(J.head, s.head)
    v(J.shoulderL, s.shoulderL ?? s.shoulders)
    v(J.shoulderR, s.shoulderR ?? s.shoulders)
    v(J.upperArmL, s.armL ?? s.arms)
    v(J.upperArmR, s.armR ?? s.arms)
    const eL = s.elbowL ?? s.elbows
    const eR = s.elbowR ?? s.elbows
    const tL = s.twistL ?? s.twists ?? 0
    const tR = s.twistR ?? s.twists ?? 0
    if (eL !== undefined || tL) this.elbow(p, 0, eL ?? 0, tL)
    if (eR !== undefined || tR) this.elbow(p, 1, eR ?? 0, tR)
    v(J.handL, s.handL ?? s.hands)
    v(J.handR, s.handR ?? s.hands)
    v(J.thighL, s.thighL ?? s.thighs)
    v(J.thighR, s.thighR ?? s.thighs)
    const kL = s.kneeL ?? s.knees
    const kR = s.kneeR ?? s.knees
    if (kL !== undefined) this.set(p, J.shinL, kL, 0, 0)
    if (kR !== undefined) this.set(p, J.shinR, kR, 0, 0)
    v(J.footL, s.footL ?? s.feet)
    v(J.footR, s.footR ?? s.feet)
    if (s.toes !== undefined) {
      this.set(p, J.toeL, s.toes, 0, 0)
      this.set(p, J.toeR, s.toes, 0, 0)
    }
    const cL = s.curlL ?? s.curl
    const cR = s.curlR ?? s.curl
    if (cL !== undefined) p.curl[0] = cL
    if (cR !== undefined) p.curl[1] = cR
    if (s.pointL !== undefined) p.point[0] = s.pointL
    if (s.pointR !== undefined) p.point[1] = s.pointR
    if (s.ik !== undefined) p.ik = s.ik
    if (s.stab !== undefined) p.stab = s.stab
    if (s.footOffL) p.footOff[0].set(s.footOffL[0], s.footOffL[1], s.footOffL[2])
    if (s.footOffR) p.footOff[1].set(s.footOffR[0], s.footOffR[1], s.footOffR[2])
    if (s.pitchL !== undefined) p.footPitch[0] = s.pitchL * DEG
    if (s.pitchR !== undefined) p.footPitch[1] = s.pitchR * DEG
    return p
  }

  compile(s: PoseSpec): Pose {
    return this.fromSpec(new Pose(), s)
  }
}
