/**
 * Weapon arm work for the animator (angles per Pose.ts): how each weapon is carried, and the
 * keyed moves — a three-slash sword combo, the hammer's wind-up and overhead slam, the bow's draw
 * and release. Keys are at normalised times (0..1 through the move) and, like gestures, list only
 * what differs from standing; the animator blends them over the upper body.
 */
import type { WeaponKind } from '../../gameplay/weapons/defs'
import type { WeaponMove } from '../../types'
import type { PoseSpec } from './Pose'
import { IDLE } from './poses'

const k = (s: PoseSpec): PoseSpec => ({ ...IDLE, ...s })

/** Holding pose of the weapon arm (blended partly over the gait's arm swing). */
export const CARRY: Record<Exclude<WeaponKind, 'fists'>, PoseSpec> = {
  // Blade up and forward, ready.
  sword: k({ armR: [-14, 0, 12], elbowR: 62, handR: [-12, 0, 0], curlR: 1 }),
  // Heavy: hanging at the side, head down by the feet.
  hammer: k({ armR: [6, 0, 12], elbowR: 14, handR: [68, 0, 0], curlR: 1 }),
  // Held low at the side.
  bow: k({ armL: [-6, 0, 10], elbowL: 24, handL: [-8, 0, 0], curlL: 1 }),
}

export interface WeaponClip {
  /** [normalised time, pose] keys. */
  keys: Array<[number, PoseSpec]>
}

const SWORD_DONE = CARRY.sword

export const WEAPON_CLIPS: Record<Exclude<WeaponMove, 'none'>, WeaponClip> = {
  /** Forehand: high on the right, down across to the left hip. */
  slash1: {
    keys: [
      [0, k({ chest: [-4, -26, 0], spine: [0, -10, 0], armR: [-128, 0, 58], elbowR: 84, handR: [16, 0, 0], armL: [-14, 0, 20], curlR: 1 })],
      [0.36, k({ chest: [6, 30, 0], spine: [8, 12, 0], armR: [-48, 0, -30], elbowR: 6, handR: [28, 0, 0], armL: [-6, 0, 30], curlR: 1, pos: [0, -0.04, 0] })],
      [0.62, k({ chest: [6, 36, 0], spine: [8, 14, 0], armR: [-26, 0, -40], elbowR: 18, handR: [30, 0, 0], armL: [-4, 0, 30], curlR: 1, pos: [0, -0.04, 0] })],
      [1, SWORD_DONE],
    ],
  },
  /** Backhand: from the left hip up and out to the right. */
  slash2: {
    keys: [
      [0, k({ chest: [4, 32, 0], spine: [4, 12, 0], armR: [-44, 0, -36], elbowR: 46, handR: [10, 0, 0], armL: [-8, 0, 26], curlR: 1 })],
      [0.36, k({ chest: [0, -30, 0], spine: [2, -12, 0], armR: [-96, 0, 62], elbowR: 6, handR: [34, 0, 0], armL: [-20, 0, 22], curlR: 1, pos: [0, -0.03, 0] })],
      [0.62, k({ chest: [-2, -36, 0], spine: [0, -14, 0], armR: [-108, 0, 78], elbowR: 20, handR: [26, 0, 0], armL: [-20, 0, 22], curlR: 1 })],
      [1, SWORD_DONE],
    ],
  },
  /** Finisher: an overhead chop straight down. */
  slash3: {
    keys: [
      [0, k({ spine: [-8, -6, 0], chest: [-8, -8, 0], head: [-6, 0, 0], armR: [-165, 0, 14], elbowR: 22, handR: [20, 0, 0], armL: [-40, 0, 30], curlR: 1, pos: [0, 0.02, 0] })],
      [0.4, k({ spine: [16, 4, 0], chest: [10, 6, 0], head: [-10, 0, 0], armR: [-62, 0, -4], elbowR: 4, handR: [52, 0, 0], armL: [-10, 0, 34], curlR: 1, pos: [0, -0.08, 0] })],
      [0.66, k({ spine: [18, 4, 0], chest: [10, 6, 0], head: [-12, 0, 0], armR: [-40, 0, -8], elbowR: 10, handR: [45, 0, 0], armL: [-8, 0, 32], curlR: 1, pos: [0, -0.08, 0] })],
      [1, SWORD_DONE],
    ],
  },
  /** Hammer: lift it back over the head, then bring it down hard and crouch into the blow. */
  slam: {
    keys: [
      [0, CARRY.hammer],
      [0.42, k({ spine: [-12, 0, 0], chest: [-10, 0, 0], head: [-8, 0, 0], armR: [-170, 0, 12], elbowR: 30, handR: [30, 0, 0], armL: [-70, 0, 34], elbowL: 30, curlR: 1, pos: [0, 0.03, 0] })],
      [0.56, k({ spine: [30, 0, 0], chest: [14, 0, 0], head: [-16, 0, 0], armR: [-34, 0, -4], elbowR: 0, handR: [62, 0, 0], armL: [-30, 0, 40], elbowL: 20, curlR: 1, pos: [0, -0.2, 0] })],
      [0.78, k({ spine: [26, 0, 0], chest: [12, 0, 0], head: [-14, 0, 0], armR: [-28, 0, -4], elbowR: 4, handR: [60, 0, 0], armL: [-24, 0, 36], curlR: 1, pos: [0, -0.16, 0] })],
      [1, CARRY.hammer],
    ],
  },
  /** Bow draw, keyed by the draw (0 = nocked, 1 = full): bow arm out, string hand back to the cheek. */
  draw: {
    keys: [
      [0, k({ chest: [0, 14, 0], neck: [0, -8, 0], head: [-2, -8, 0], armL: [-82, 0, -14], elbowL: 12, armR: [-74, 0, -22], elbowR: 70, curlL: 1, curlR: 0.7 })],
      [1, k({ chest: [0, 24, 0], neck: [0, -12, 0], head: [-2, -12, 0], armL: [-88, 0, -20], elbowL: 2, armR: [-46, 0, 72], elbowR: 138, curlL: 1, curlR: 0.7 })],
    ],
  },
  /** The string hand flies back open, then everything settles. */
  release: {
    keys: [
      [0, k({ chest: [0, 26, 0], neck: [0, -12, 0], head: [-2, -12, 0], armL: [-86, 0, -20], elbowL: 2, armR: [-34, 0, 92], elbowR: 104, curlL: 1, curlR: 0.1 })],
      [0.45, k({ chest: [0, 22, 0], neck: [0, -10, 0], head: [-2, -10, 0], armL: [-80, 0, -16], elbowL: 6, armR: [-28, 0, 70], elbowR: 60, curlL: 1, curlR: 0.2 })],
      [1, CARRY.bow],
    ],
  },
}
