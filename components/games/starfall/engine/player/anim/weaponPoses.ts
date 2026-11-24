/**
 * Weapon arm work for the animator (angles per Pose.ts): how each weapon is carried, and the
 * keyed moves — a three-slash sword combo, the hammer's wind-up and overhead slam, the bow's draw
 * and release, the star blaster's levelled arm and kick, the comet launcher's two-handed shot.
 * Keys are at normalised times (0..1 through the move) and, like gestures, list only what differs
 * from standing; the animator blends them over the upper body.
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
  // Low ready: elbow bent, the barrel pointing ahead and down.
  blaster: k({ armR: [-6, 0, 9], elbowR: 52, handR: [6, 0, 0], curlR: 1 }),
  // Heavy: the tube hangs level beside the hip.
  launcher: k({ armR: [8, 0, 11], elbowR: 66, handR: [14, 0, 0], curlR: 1 }),
}

export interface WeaponClip {
  /** [normalised time, pose] keys. */
  keys: Array<[number, PoseSpec]>
}

/** Star blaster levelled at arm's length, the body turned a little behind it. */
const BLASTER_AIM = k({ chest: [0, 12, 0], neck: [0, -6, 0], head: [-2, -6, 0], armR: [-84, 0, 14], elbowR: 8, handR: [0, 0, 0], armL: [-8, 0, 16], elbowL: 34, curlR: 1 })
/** Comet launcher shouldered low: the trigger hand at the ribs, the other under the fore-grip. */
const LAUNCHER_AIM = k({
  spine: [3, -6, 0], chest: [2, -12, 0], neck: [0, 8, 0], head: [-2, 8, 0],
  armR: [-14, 0, -4], elbowR: 82, handR: [4, 0, 0], armL: [-58, 0, -30], elbowL: 46, handL: [10, 0, 0], curlR: 1, curlL: 0.8,
})

/**
 * The body drives every blow: the hips wind up and turn, the chest follows, the arm arrives last;
 * standing, the feet step into it (footOff / pitch only show when he is not running).
 * A slash ends relaxed with the blade where the swing left it, not back at the carry: a chained
 * slash winds up from there, and otherwise the arm drifts home as the move fades out.
 */
export const WEAPON_CLIPS: Record<Exclude<WeaponMove, 'none'>, WeaponClip> = {
  /** Forehand: high on the right, down across to the left hip, stepping in with the left foot. */
  slash1: {
    keys: [
      [0, k({
        hips: [-2, -12, 0], spine: [0, -10, 0], chest: [-4, -26, 0], pos: [0, -0.02, -0.03],
        armR: [-128, 0, 58], elbowR: 84, handR: [16, 0, 0], armL: [-14, 0, 20], curlR: 1, footOffR: [0, 0, -0.06], pitchR: 8,
      })],
      [0.36, k({
        hips: [5, 16, 0], spine: [8, 12, 0], chest: [6, 30, 0], pos: [0, -0.08, 0.07],
        armR: [-48, 0, -30], elbowR: 6, handR: [28, 0, 0], armL: [-6, 0, 30], curlR: 1,
        footOffL: [0.02, 0, 0.15], footOffR: [0, 0, -0.1], pitchR: 22,
      })],
      [0.62, k({
        hips: [5, 20, 0], spine: [8, 14, 0], chest: [6, 36, 0], pos: [0, -0.08, 0.08],
        armR: [-26, 0, -40], elbowR: 18, handR: [30, 0, 0], armL: [-4, 0, 30], curlR: 1,
        footOffL: [0.02, 0, 0.15], footOffR: [0, 0, -0.1], pitchR: 22,
      })],
      [1, k({
        hips: [2, 10, 0], spine: [4, 7, 0], chest: [3, 18, 0], pos: [0, -0.04, 0.05],
        armR: [-22, 0, -20], elbowR: 42, handR: [12, 0, 0], armL: [-4, 0, 16], curlR: 1,
        footOffL: [0.02, 0, 0.12], footOffR: [0, 0, -0.08], pitchR: 12,
      })],
    ],
  },
  /** Backhand: from the left hip up and out to the right, the weight rolling across onto the right foot. */
  slash2: {
    keys: [
      [0, k({
        hips: [3, 14, 0], spine: [4, 12, 0], chest: [4, 32, 0], pos: [0, -0.05, 0.03],
        armR: [-44, 0, -36], elbowR: 46, handR: [10, 0, 0], armL: [-8, 0, 26], curlR: 1,
        footOffL: [0.02, 0, 0.12], footOffR: [0, 0, -0.08], pitchR: 10,
      })],
      [0.36, k({
        hips: [2, -16, 0], spine: [2, -12, 0], chest: [0, -30, 0], pos: [0, -0.07, 0.07],
        armR: [-96, 0, 62], elbowR: 6, handR: [34, 0, 0], armL: [-20, 0, 22], curlR: 1,
        footOffL: [0.01, 0, 0.04], footOffR: [0.03, 0, 0.12], pitchL: 16,
      })],
      [0.62, k({
        hips: [0, -20, 0], spine: [0, -14, 0], chest: [-2, -36, 0], pos: [0, -0.05, 0.08],
        armR: [-108, 0, 78], elbowR: 20, handR: [26, 0, 0], armL: [-20, 0, 22], curlR: 1,
        footOffL: [0.01, 0, 0.04], footOffR: [0.03, 0, 0.12], pitchL: 18,
      })],
      [1, k({
        hips: [0, -10, 0], spine: [0, -7, 0], chest: [-1, -18, 0], pos: [0, -0.03, 0.05],
        armR: [-70, 0, 46], elbowR: 44, handR: [10, 0, 0], armL: [-14, 0, 18], curlR: 1,
        footOffL: [0.01, 0, 0.03], footOffR: [0.03, 0, 0.1], pitchL: 8,
      })],
    ],
  },
  /** Finisher: up onto the toes, then an overhead chop straight down with a long step in. */
  slash3: {
    keys: [
      [0, k({
        hips: [-7, -4, 0], spine: [-8, -6, 0], chest: [-8, -8, 0], head: [-6, 0, 0], pos: [0, 0.03, -0.03],
        armR: [-165, 0, 14], elbowR: 22, handR: [20, 0, 0], armL: [-40, 0, 30], curlR: 1, pitchL: 14, pitchR: 16,
      })],
      [0.4, k({
        hips: [13, 4, 0], spine: [16, 4, 0], chest: [10, 6, 0], head: [-10, 0, 0], pos: [0, -0.15, 0.09],
        armR: [-62, 0, -4], elbowR: 4, handR: [52, 0, 0], armL: [-10, 0, 34], curlR: 1,
        footOffL: [0.03, 0, 0.2], footOffR: [0, 0, -0.12], pitchR: 26,
      })],
      [0.66, k({
        hips: [14, 4, 0], spine: [18, 4, 0], chest: [10, 6, 0], head: [-12, 0, 0], pos: [0, -0.16, 0.1],
        armR: [-40, 0, -8], elbowR: 10, handR: [45, 0, 0], armL: [-8, 0, 32], curlR: 1,
        footOffL: [0.03, 0, 0.2], footOffR: [0, 0, -0.12], pitchR: 26,
      })],
      [1, k({
        hips: [6, 2, 0], spine: [9, 2, 0], chest: [5, 3, 0], head: [-6, 0, 0], pos: [0, -0.07, 0.06],
        armR: [-28, 0, 2], elbowR: 36, handR: [16, 0, 0], armL: [-6, 0, 20], curlR: 1,
        footOffL: [0.03, 0, 0.14], footOffR: [0, 0, -0.08], pitchR: 12,
      })],
    ],
  },
  /** Hammer: a dip to gather it, the lift back over the head onto the toes, then down hard with a step and a deep crouch into the blow. */
  slam: {
    keys: [
      [0, CARRY.hammer],
      [0.16, k({
        hips: [4, -6, 0], spine: [6, -4, 0], chest: [4, -6, 0], pos: [0, -0.06, -0.02],
        armR: [22, 0, 14], elbowR: 22, handR: [60, 0, 0], armL: [-20, 0, 16], elbowL: 30, curlR: 1,
      })],
      [0.42, k({
        hips: [-8, 0, 0], spine: [-12, 0, 0], chest: [-10, 0, 0], head: [-8, 0, 0], pos: [0, 0.035, -0.05],
        armR: [-170, 0, 12], elbowR: 30, handR: [30, 0, 0], armL: [-70, 0, 34], elbowL: 30, curlR: 1, pitchL: 16, pitchR: 18,
      })],
      [0.56, k({
        hips: [16, 0, 0], spine: [30, 0, 0], chest: [14, 0, 0], head: [-16, 0, 0], pos: [0, -0.25, 0.1],
        armR: [-34, 0, -4], elbowR: 0, handR: [62, 0, 0], armL: [-30, 0, 40], elbowL: 20, curlR: 1,
        footOffL: [0.04, 0, 0.2], footOffR: [0.02, 0, -0.1], pitchR: 22,
      })],
      [0.78, k({
        hips: [14, 0, 0], spine: [26, 0, 0], chest: [12, 0, 0], head: [-14, 0, 0], pos: [0, -0.2, 0.1],
        armR: [-28, 0, -4], elbowR: 4, handR: [60, 0, 0], armL: [-24, 0, 36], curlR: 1,
        footOffL: [0.04, 0, 0.2], footOffR: [0.02, 0, -0.1], pitchR: 22,
      })],
      [1, k({ ...CARRY.hammer, hips: [4, 0, 0], spine: [8, 0, 0], pos: [0, -0.07, 0.06], footOffL: [0.04, 0, 0.14], footOffR: [0.02, 0, -0.06] })],
    ],
  },
  /** Bow draw, keyed by the draw (0 = nocked, 1 = full): bow arm out, string hand back to the cheek. */
  draw: {
    keys: [
      [0, k({ hips: [0, 4, 0], chest: [0, 14, 0], neck: [0, -8, 0], head: [-2, -8, 0], armL: [-82, 0, -14], elbowL: 12, armR: [-74, 0, -22], elbowR: 70, curlL: 1, curlR: 0.7, footOffL: [0, 0, 0.06] })],
      [1, k({ hips: [-3, 9, 0], spine: [-3, 0, 0], chest: [0, 24, 0], neck: [0, -12, 0], head: [-2, -12, 0], pos: [0, -0.03, -0.03], armL: [-88, 0, -20], elbowL: 2, armR: [-46, 0, 72], elbowR: 138, curlL: 1, curlR: 0.7, footOffL: [0.02, 0, 0.12], footOffR: [0.02, 0, -0.1] })],
    ],
  },
  /** The string hand flies back open, then everything settles. */
  release: {
    keys: [
      [0, k({ hips: [-3, 9, 0], chest: [0, 26, 0], neck: [0, -12, 0], head: [-2, -12, 0], pos: [0, -0.03, -0.03], armL: [-86, 0, -20], elbowL: 2, armR: [-34, 0, 92], elbowR: 104, curlL: 1, curlR: 0.1, footOffL: [0.02, 0, 0.12], footOffR: [0.02, 0, -0.1] })],
      [0.45, k({ chest: [0, 22, 0], neck: [0, -10, 0], head: [-2, -10, 0], armL: [-80, 0, -16], elbowL: 6, armR: [-28, 0, 70], elbowR: 60, curlL: 1, curlR: 0.2 })],
      [1, CARRY.bow],
    ],
  },
  /** Star blaster, restarted by every bolt: the kick, then the arm settles level and holds its aim. */
  blast: {
    keys: [
      [0, k({ chest: [-3, 13, 0], neck: [0, -6, 0], head: [-3, -6, 0], armR: [-95, 0, 14], elbowR: 26, handR: [-12, 0, 0], armL: [-8, 0, 18], elbowL: 36, curlR: 1 })],
      [0.28, BLASTER_AIM],
      [1, BLASTER_AIM],
    ],
  },
  /** Comet launcher: up to the aim, the shot (0.16) rocks the body back, then it settles and lowers. */
  lob: {
    keys: [
      [0, LAUNCHER_AIM],
      [0.16, LAUNCHER_AIM],
      [0.3, k({
        spine: [-9, -6, 0], chest: [-6, -12, 0], neck: [0, 8, 0], head: [4, 8, 0], pos: [0, -0.03, 0],
        armR: [-26, 0, -4], elbowR: 94, handR: [-6, 0, 0], armL: [-70, 0, -30], elbowL: 56, handL: [10, 0, 0], curlR: 1, curlL: 0.8,
      })],
      [0.62, LAUNCHER_AIM],
      [1, CARRY.launcher],
    ],
  },
}
