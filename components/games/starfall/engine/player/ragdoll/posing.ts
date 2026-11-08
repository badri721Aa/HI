/**
 * Drives the skinned skeleton from the ragdoll. Segment frames (rest → current, from the
 * particles) become character-space joint rotations, then the Animator's Pose format
 * (parent-relative offsets + hips offset) — so a ragdoll frame can be written straight to the
 * rig or blended with animated poses (the get-up does that).
 *
 * The particles can't see a few things the animation had (forearm and thigh twist, head turn,
 * toe bend): capture() records those differences at the start, and pose() fades them out over
 * the first moments so going limp never pops.
 */
import * as THREE from 'three'
import { J, JOINT_COUNT, JOINT_PARENT, type Pose } from '../anim/Pose'
import type { Rig } from '../anim/Rig'
import { F, FRAME_COUNT, P, vec, type RagdollSkeleton } from './skeleton'

/** Segment frame driving each joint; the neck (-1) sits halfway between chest and head. */
const JOINT_FRAME: readonly number[] = [
  F.pelvis, F.pelvis, F.chest, -1, F.head,
  F.chest, F.upperArmL, F.forearmL, F.handL,
  F.chest, F.upperArmR, F.forearmR, F.handR,
  F.thighL, F.shinL, F.footL, F.footL,
  F.thighR, F.shinR, F.footR, F.footR,
]

/** Hands relax half-closed while limp. */
const LIMP_CURL = 0.5

const UP = new THREE.Vector3(0, 1, 0)
const _q = new THREE.Quaternion()
const _yaw = new THREE.Quaternion()
const _v = new THREE.Vector3()

export class RagdollPoser {
  /** World frames of the segments. */
  private Qw: THREE.Quaternion[] = []
  /** Character-space joint rotations (C in Rig terms). */
  private C: THREE.Quaternion[] = []
  /** Animated-minus-ragdoll offsets captured at the start (joint-local). */
  private O: THREE.Quaternion[] = []
  private W: THREE.Quaternion[] = []

  constructor(
    private skel: RagdollSkeleton,
    private rig: Rig,
  ) {
    for (let i = 0; i < FRAME_COUNT; i++) this.Qw.push(new THREE.Quaternion())
    for (let j = 0; j < JOINT_COUNT; j++) {
      this.C.push(new THREE.Quaternion())
      this.O.push(new THREE.Quaternion())
      this.W.push(new THREE.Quaternion())
    }
  }

  /** World rest → current frames of the last solve (valid after pose() / capture()). */
  get frames(): readonly THREE.Quaternion[] {
    return this.Qw
  }

  /**
   * Records how the animated bones differ from the ragdoll's reading of particles `src` (world).
   * `yaw` is the heading the bones' character space faces (root yaw plus any spin).
   */
  capture(src: Float64Array, yaw: number): void {
    this.solve(src, yaw)
    const rig = this.rig
    for (let j = 0; j < JOINT_COUNT; j++) {
      const p = JOINT_PARENT[j]
      const w = this.W[j]
      if (p < 0) w.copy(rig.bones[j].quaternion)
      else w.multiplyQuaternions(this.W[p], rig.bones[j].quaternion)
      // Animated C = W · Rest⁻¹;  offset = C_ragdoll⁻¹ · C_animated.
      _q.copy(rig.restWorld[j]).invert()
      this.O[j].copy(this.C[j]).invert().multiply(w).multiply(_q)
    }
  }

  /**
   * Writes the ragdoll (particles `src`, world) into `out` for a root at `rootPos` facing `yaw`.
   * `offsetW` blends in the captured animation offsets (1 right after capture → 0).
   */
  pose(src: Float64Array, rootPos: THREE.Vector3, yaw: number, offsetW: number, out: Pose): void {
    this.solve(src, yaw)
    const C = this.C
    if (offsetW > 0.001) {
      for (let j = 0; j < JOINT_COUNT; j++) C[j].multiply(_q.identity().slerp(this.O[j], Math.min(1, offsetW)))
    }
    for (let j = 0; j < JOINT_COUNT; j++) {
      const p = JOINT_PARENT[j]
      if (p < 0) out.q[j].copy(C[j])
      else out.q[j].copy(C[p]).invert().multiply(C[j])
    }
    // Hips: the pelvis particle, in character space.
    vec(src, P.pelvis, _v).sub(rootPos).applyQuaternion(_yaw.setFromAxisAngle(UP, -yaw))
    out.pos.copy(_v).sub(this.rig.hipsRest)
    out.curl[0] = out.curl[1] = LIMP_CURL
    out.point[0] = out.point[1] = 0
    out.ik = 0
    out.stab = 0
    out.footOff[0].set(0, 0, 0)
    out.footOff[1].set(0, 0, 0)
    out.footPitch[0] = out.footPitch[1] = 0
  }

  /** Frames from `src`, then character-space joint rotations for a root facing `yaw`. */
  private solve(src: Float64Array, yaw: number): void {
    const Qw = this.Qw
    this.skel.frames(src, Qw)
    _yaw.setFromAxisAngle(UP, -yaw)
    for (let j = 0; j < JOINT_COUNT; j++) {
      const f = JOINT_FRAME[j]
      if (f >= 0) this.C[j].multiplyQuaternions(_yaw, Qw[f])
    }
    this.C[J.neck].copy(this.C[J.chest]).slerp(this.C[J.head], 0.5)
  }
}
