/**
 * Key poses and shapes for the dodge-roll, the sprint slide and the wall-run (see Pose.ts for the
 * angle convention). Animator.ts blends them in and turns the whole body about the pivots below:
 * the roll tumbles once about the middle of the tucked ball, the slide lies along the slope under
 * it, and the wall-run leans away from the wall with its feet on it.
 */
import * as THREE from 'three'
import { clamp01, smooth, TAU } from './math'
import type { PoseSpec } from './Pose'

/** Going down into the roll: crouched over planted feet, hands reaching for the ground ahead. */
export const ROLL_DIVE: PoseSpec = {
  pos: [0, -0.3, 0.05],
  spine: [28, 0, 0],
  chest: [22, 0, 0],
  neck: [10, 0, 0],
  head: [16, 0, 0],
  shoulders: [0, 6, 4],
  arms: [-104, 0, 12],
  elbows: 26,
  hands: [-24, 0, 0],
  curl: 0.1,
  stab: 0,
}

/** The tumble: a tight ball, chin on the chest, knees to the shoulders, hands on the shins. */
export const ROLL_TUCK: PoseSpec = {
  pos: [0, -0.62, -0.1],
  spine: [34, 0, 0],
  chest: [28, 0, 0],
  neck: [18, 0, 0],
  head: [26, 0, 0],
  shoulders: [0, 8, 2],
  arms: [-58, 4, 12],
  elbows: 104,
  twists: 20,
  thighL: [-124, 0, 10],
  thighR: [-116, 0, 10],
  kneeL: 142,
  kneeR: 134,
  feet: [26, 0, 0],
  curl: 0.8,
  ik: 0,
  stab: 0,
}

/**
 * The slide: sat back low on the left hip, right leg out in front, left knee up with its foot
 * under it, left hand trailing on the ground and the right arm out for balance.
 */
export const SLIDE: PoseSpec = {
  pos: [0, -0.585, -0.06],
  hips: [-36, 12, 5],
  spine: [13, -5, 0],
  chest: [12, -7, -2],
  neck: [6, 0, 0],
  head: [8, 0, 0],
  shoulderL: [0, 0, 4],
  armL: [44, 6, 30],
  elbowL: 16,
  handL: [-38, 0, 0],
  armR: [-52, 12, 46],
  elbowR: 58,
  handR: [0, 0, 6],
  thighL: [-92, -4, 15],
  kneeL: 124,
  footL: [4, 0, 0],
  thighR: [-50, 4, 2],
  kneeR: 13,
  footR: [-22, 0, 0],
  toes: -8,
  curlL: 0.05,
  curlR: 0.6,
  ik: 0,
  stab: 0.55,
}

/** Wall-run: the arm on the wall's side, reaching out to brush it (both arms authored; one is used). */
export const WALL_REACH: PoseSpec = {
  shoulders: [0, 0, 6],
  arms: [-16, 8, 56],
  elbows: 36,
  hands: [0, 0, 14],
  curl: 0.06,
}

/** Middle of the tucked ball, about which the roll turns (m, character space). */
export const ROLL_PIVOT = new THREE.Vector3(0, 0.4, 0.05)
/** The roll's turn (rad) at fraction `f` of its time: quick in the middle, finished a little early to land on the feet. */
export function rollTurn(f: number): number {
  const u = clamp01((f - 0.05) / 0.83)
  return TAU * (0.55 * u + 0.45 * smooth(u))
}
/** How far into the dive and the tuck the body is at fraction `f` of the roll (0..1 each). */
export const rollDive = (f: number): number => smooth(f / 0.14) * (1 - smooth((f - 0.16) / 0.2))
export const rollTuck = (f: number): number => smooth((f - 0.08) / 0.24) * (1 - smooth((f - 0.7) / 0.28))

/** The slide lies along the ground: it turns about the point under the hips. */
export const SLIDE_PIVOT = new THREE.Vector3(0, 0, 0)

/** Wall-run: lean away from the wall (rad), about a point on the body's axis that puts the feet on the wall. */
export const WALL_LEAN = 0.5
export const WALL_PIVOT = new THREE.Vector3(0, 0.62, 0)
