/**
 * Skeleton adapter: caches the hero's rest pose in character space, turns Pose
 * offsets into bone-local quaternions, and solves two-bone leg IK.
 *
 * Character space is the armature's own frame converted to metres
 * (+X left, +Y up, +Z forward, feet at y = 0).
 */
import * as THREE from 'three'
import { JOINT_BONES, JOINT_COUNT, JOINT_PARENT, J, type Pose, type RigAxes } from './Pose'

const FINGERS = ['f_index', 'f_middle', 'f_ring', 'f_pinky'] as const
/** Max curl per phalanx (radians) for a full fist. */
const CURL = [1.25, 1.55, 1.05]

export interface LegInfo {
  hip: number
  knee: number
  ankle: number
  toe: number
  /** Thigh and shin lengths (m). */
  l1: number
  l2: number
  /** Rest bone directions and their rest frames (inverse basis). */
  d1: THREE.Vector3
  d2: THREE.Vector3
  frame1Inv: THREE.Matrix4
  frame2Inv: THREE.Matrix4
  /** Rest geometry relative to the sole point (ankle projected to the ground). */
  sole: THREE.Vector3
  ankleRel: THREE.Vector3
  ballRel: THREE.Vector3
  heelRel: THREE.Vector3
  /** Horizontal unit direction the rest foot points along, and its pitch axis. */
  footDir: THREE.Vector3
  pitchAxis: THREE.Vector3
}

interface Finger {
  bone: THREE.Bone
  rest: THREE.Quaternion
  max: number
  index: boolean
}

const _m1 = new THREE.Matrix4()
const _m2 = new THREE.Matrix4()
const _v1 = new THREE.Vector3()
const _v2 = new THREE.Vector3()
const _v3 = new THREE.Vector3()
const _v4 = new THREE.Vector3()
const _qx = new THREE.Quaternion()
const _bv = new THREE.Vector3()
const _bw = new THREE.Vector3()
const _x = new THREE.Vector3(1, 0, 0)
const _z = new THREE.Vector3(0, 0, 1)

/** Builds a rotation matrix whose columns are (a, b, a×b) after orthonormalising b against a. */
function basis(out: THREE.Matrix4, a: THREE.Vector3, b: THREE.Vector3): THREE.Matrix4 {
  _bv.copy(b).addScaledVector(a, -b.dot(a)).normalize()
  _bw.crossVectors(a, _bv)
  return out.makeBasis(a, _bv, _bw)
}

export class Rig {
  readonly bones: THREE.Bone[] = []
  /** Model units → metres. */
  readonly scale: number
  /** Rest orientation of every joint in character space. */
  readonly restWorld: THREE.Quaternion[] = []
  /** Rest joint positions (m, character space). */
  readonly restPos: THREE.Vector3[] = []
  /** Rest offset of each joint from its parent joint (m, character space). */
  readonly offset: THREE.Vector3[] = []
  readonly axes: RigAxes
  readonly legs: [LegInfo, LegInfo]
  /** Accumulated character-space rotation of each joint for the pose being solved. */
  readonly C: THREE.Quaternion[] = []
  /** Current hips position (m, character space). */
  readonly hipsPos = new THREE.Vector3()
  readonly palmR: THREE.Object3D
  readonly headBone: THREE.Bone

  private invParentRest: THREE.Quaternion[] = []
  private fingers: [Finger[], Finger[]] = [[], []]
  private thumbs: [Finger[], Finger[]] = [[], []]

  constructor(root: THREE.Object3D, scale: number) {
    this.scale = scale
    for (const name of JOINT_BONES) {
      const b = root.getObjectByName(name) as THREE.Bone | undefined
      if (!b) throw new Error(`hero rig is missing bone "${name}"`)
      this.bones.push(b)
    }

    // Rest orientations / positions in character space, walking down from the hips.
    for (let j = 0; j < JOINT_COUNT; j++) {
      const b = this.bones[j]
      const p = JOINT_PARENT[j]
      const w = new THREE.Quaternion()
      const pos = new THREE.Vector3()
      if (p < 0) {
        w.copy(b.quaternion)
        pos.copy(b.position).multiplyScalar(scale)
        this.invParentRest.push(new THREE.Quaternion())
      } else {
        w.multiplyQuaternions(this.restWorld[p], b.quaternion)
        pos.copy(b.position).applyQuaternion(this.restWorld[p]).multiplyScalar(scale).add(this.restPos[p])
        this.invParentRest.push(this.restWorld[p].clone().invert())
      }
      this.restWorld.push(w)
      this.restPos.push(pos)
      this.offset.push(p < 0 ? pos.clone() : pos.clone().sub(this.restPos[p]))
      this.C.push(new THREE.Quaternion())
    }

    // Elbow hinge = upper-arm direction × forearm direction (positive angle = more flexion).
    const elbowAxis = (upper: number, fore: number, hand: number) => {
      const u = this.offset[fore].clone().normalize()
      const f = this.offset[hand].clone().normalize()
      return { hinge: new THREE.Vector3().crossVectors(u, f).normalize(), dir: f }
    }
    const eL = elbowAxis(J.upperArmL, J.forearmL, J.handL)
    const eR = elbowAxis(J.upperArmR, J.forearmR, J.handR)
    this.axes = { elbow: [eL.hinge, eR.hinge], forearm: [eL.dir, eR.dir] }

    this.legs = [this.makeLeg(J.thighL, J.shinL, J.footL, J.toeL), this.makeLeg(J.thighR, J.shinR, J.footR, J.toeR)]

    for (let s = 0; s < 2; s++) {
      const sfx = s === 0 ? 'L' : 'R'
      for (const f of FINGERS) {
        for (let k = 1; k <= 3; k++) {
          const b = root.getObjectByName(`${f}0${k}${sfx}`) as THREE.Bone | undefined
          if (b) this.fingers[s].push({ bone: b, rest: b.quaternion.clone(), max: CURL[k - 1] * (f === 'f_index' ? 0.9 : 1), index: f === 'f_index' })
        }
      }
      for (let k = 1; k <= 3; k++) {
        const b = root.getObjectByName(`thumb0${k}${sfx}`) as THREE.Bone | undefined
        if (b) this.thumbs[s].push({ bone: b, rest: b.quaternion.clone(), max: k === 1 ? 0.25 : 0.55, index: false })
      }
    }

    this.palmR = root.getObjectByName('palm02R') ?? this.bones[J.handR]
    this.headBone = this.bones[J.head]
  }

  private makeLeg(hip: number, knee: number, ankle: number, toe: number): LegInfo {
    const d1 = this.offset[knee].clone().normalize()
    const d2 = this.offset[ankle].clone().normalize()
    const a = this.restPos[ankle]
    const sole = new THREE.Vector3(a.x, 0, a.z)
    const ball = new THREE.Vector3(this.restPos[toe].x, 0, this.restPos[toe].z)
    const footDir = ball.clone().sub(sole).normalize()
    const heel = sole.clone().addScaledVector(footDir, -0.045)
    return {
      hip, knee, ankle, toe,
      l1: this.offset[knee].length(),
      l2: this.offset[ankle].length(),
      d1, d2,
      frame1Inv: basis(new THREE.Matrix4(), d1, _z).transpose(),
      frame2Inv: basis(new THREE.Matrix4(), d2, _z).transpose(),
      sole,
      ankleRel: new THREE.Vector3(0, a.y, 0),
      ballRel: ball.clone().sub(sole),
      heelRel: heel.sub(sole),
      footDir,
      pitchAxis: new THREE.Vector3(footDir.z, 0, -footDir.x),
    }
  }

  /** Hip-joint-to-ankle reach limit (m). */
  maxReach(side: 0 | 1): number {
    const l = this.legs[side]
    return (l.l1 + l.l2) * 0.992
  }

  /** Accumulates C for joints [from..to] in hierarchy order (parents must already be valid). */
  accumulate(pose: Pose, joints: readonly number[]): void {
    for (const j of joints) {
      const p = JOINT_PARENT[j]
      if (p < 0) this.C[j].copy(pose.q[j])
      else this.C[j].multiplyQuaternions(this.C[p], pose.q[j])
    }
  }

  /** Position of joint j given parent rotations in C (m, character space). */
  jointPos(out: THREE.Vector3, j: number): THREE.Vector3 {
    out.copy(this.hipsPos)
    const chain = CHAIN[j]
    for (let k = 1; k < chain.length; k++) {
      _v1.copy(this.offset[chain[k]]).applyQuaternion(this.C[chain[k - 1]])
      out.add(_v1)
    }
    return out
  }

  /**
   * Replaces `pose`'s rotation of `j` so that its character-space rotation becomes `target`
   * (C of the parent must be valid). Updates C[j].
   */
  setWorld(pose: Pose, j: number, target: THREE.Quaternion): void {
    const p = JOINT_PARENT[j]
    if (p < 0) pose.q[j].copy(target)
    else pose.q[j].copy(this.C[p]).invert().multiply(target)
    this.C[j].copy(target)
  }

  /**
   * Two-bone IK. Writes the character-space rotations of thigh and shin so the ankle reaches
   * `ankle` with the knee bending toward `pole` (a direction). Uses C[hips] and hipsPos.
   */
  solveLeg(side: 0 | 1, ankle: THREE.Vector3, pole: THREE.Vector3, outThigh: THREE.Quaternion, outShin: THREE.Quaternion): void {
    const leg = this.legs[side]
    const hip = _v1.copy(this.offset[leg.hip]).applyQuaternion(this.C[J.hips]).add(this.hipsPos)
    const dir = _v2.subVectors(ankle, hip)
    let dist = dir.length()
    if (dist < 1e-5) dir.set(0, -1, 0)
    else dir.divideScalar(dist)
    const lo = Math.abs(leg.l1 - leg.l2) + 0.01
    const hi = (leg.l1 + leg.l2) * 0.9995
    dist = Math.min(hi, Math.max(lo, dist))
    const cosA = (leg.l1 * leg.l1 + dist * dist - leg.l2 * leg.l2) / (2 * leg.l1 * dist)
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA))
    // Bend direction: the pole, made perpendicular to the hip→ankle line.
    const bend = _v3.copy(pole).addScaledVector(dir, -pole.dot(dir))
    if (bend.lengthSq() < 1e-8) {
      bend.set(0, 0, 1).applyQuaternion(this.C[J.hips])
      bend.addScaledVector(dir, -bend.dot(dir))
    }
    bend.normalize()
    // Thigh direction and knee position.
    const t = _v4.copy(dir).multiplyScalar(cosA).addScaledVector(bend, sinA)
    const kneeX = hip.x + t.x * leg.l1
    const kneeY = hip.y + t.y * leg.l1
    const kneeZ = hip.z + t.z * leg.l1
    // Shin direction = (ankle' − knee) / l2, with ankle' clamped onto the reachable sphere.
    const sx = hip.x + dir.x * dist - kneeX
    const sy = hip.y + dir.y * dist - kneeY
    const sz = hip.z + dir.z * dist - kneeZ
    // Rotation taking each bone's rest (direction, knee-forward) frame to the solved one;
    // "knee forward" is the bend direction made perpendicular to the bone.
    basis(_m1, t, bend)
    outThigh.setFromRotationMatrix(_m2.multiplyMatrices(_m1, leg.frame1Inv))
    _v1.set(sx, sy, sz).divideScalar(leg.l2)
    basis(_m1, _v1, bend)
    outShin.setFromRotationMatrix(_m2.multiplyMatrices(_m1, leg.frame2Inv))
  }

  /** Writes pose rotations (and the hips offset) to the bones, plus finger curls. */
  write(pose: Pose): void {
    for (let j = 0; j < JOINT_COUNT; j++) {
      // local = parentRest⁻¹ · R · rest
      this.bones[j].quaternion.multiplyQuaternions(this.invParentRest[j], pose.q[j]).multiply(this.restWorld[j])
    }
    this.bones[J.hips].position.copy(this.hipsPos).divideScalar(this.scale)
    for (let s = 0; s < 2; s++) {
      const c = Math.max(0, Math.min(1, pose.curl[s]))
      const ci = c * (1 - Math.max(0, Math.min(1, pose.point[s])))
      for (const f of this.fingers[s]) f.bone.quaternion.copy(f.rest).multiply(_qx.setFromAxisAngle(_x, f.max * (f.index ? ci : c)))
      for (const f of this.thumbs[s]) f.bone.quaternion.copy(f.rest).multiply(_qx.setFromAxisAngle(_x, f.max * c))
    }
  }

  /** Rest hips position in metres (character space). */
  get hipsRest(): THREE.Vector3 {
    return this.restPos[J.hips]
  }

  /** Rotates `pose` hips about a pivot (m, character space) — used for somersaults. */
  pivotHips(pose: Pose, rot: THREE.Quaternion, pivot: THREE.Vector3): void {
    _v1.copy(this.hipsRest).add(pose.pos).sub(pivot).applyQuaternion(rot).add(pivot).sub(this.hipsRest)
    pose.pos.copy(_v1)
    pose.q[J.hips].premultiply(rot)
  }
}

/** Chain of joints from the hips to each joint (inclusive). */
const CHAIN: number[][] = (() => {
  const out: number[][] = []
  for (let j = 0; j < JOINT_COUNT; j++) {
    const c: number[] = []
    for (let k: number = j; k >= 0; k = JOINT_PARENT[k]) c.unshift(k)
    out.push(c)
  }
  return out
})()
