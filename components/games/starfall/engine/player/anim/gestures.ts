/**
 * Gesture library: keyframed poses (eased between keys) plus optional
 * procedural detail. Every key is layered over the relaxed IDLE pose, so a key
 * only lists what differs from standing.
 */
import type { GestureName } from '../../types'
import type { Pose, PoseBuilder, PoseSpec } from './Pose'
import { IDLE } from './poses'
import { TAU, ramp } from './math'
import { J } from './Pose'

export interface GestureDef {
  /** Length in seconds at speed 1. */
  duration: number
  /** Section [start, end] repeated while looping; stopGesture() then plays from `end`. */
  loop: [number, number]
  /** Blend in from / out to the underlying pose (s). */
  fadeIn: number
  fadeOut: number
  keys: Array<[number, PoseSpec]>
  /** Procedural detail on top of the keyed pose. */
  extra?: (t: number, p: Pose, b: PoseBuilder) => void
}

const k = (s: PoseSpec): PoseSpec => ({ ...IDLE, ...s })

const WAVE_UP = k({
  chest: [-2, -6, -2],
  head: [-3, 9, 4],
  shoulderR: [0, 0, 4],
  armR: [-45, 70, 62],
  elbowR: 78,
  handR: [0, 0, 0],
  curlR: 0.04,
  stab: 0.2,
})

const CHEER_UP = k({
  pos: [0, -0.03, 0],
  chest: [-8, 0, 0],
  neck: [-4, 0, 0],
  head: [-12, 0, 0],
  shoulders: [0, 0, 10],
  arms: [-160, 0, 34],
  elbows: 22,
  curl: 1,
  stab: 0.1,
})

const LOOK_UP = k({
  spine: [-3, 0, 0],
  chest: [-8, 0, 0],
  neck: [-16, 0, 0],
  head: [-32, 0, 0],
  arms: [-1, 4, -2],
  stab: 0,
})

const SHARD_HIGH = k({
  spine: [-3, 0, 0],
  chest: [-9, -4, 0],
  neck: [-10, 0, 0],
  head: [-28, 6, 0],
  shoulderR: [0, 0, 10],
  armR: [-170, 4, 14],
  elbowR: 10,
  twistR: 30,
  handR: [-10, 0, 0],
  curlR: 0.62,
  armL: [-6, 4, 12],
  elbowL: 20,
  curlL: 0.55,
  stab: 0.1,
})

const KNEEL_DOWN = k({
  pos: [0, -0.4, -0.02],
  spine: [10, 0, 0],
  chest: [6, 0, 0],
  neck: [6, 0, 0],
  head: [14, 0, 0],
  armL: [-28, 8, 6],
  elbowL: 78,
  handL: [12, 0, 0],
  armR: [-6, 0, 3],
  elbowR: 16,
  thighL: [-88, 0, 4],
  kneeL: 90,
  thighR: [6, 0, 3],
  kneeR: 100,
  footOffL: [0.01, 0, 0.27],
  footOffR: [0, 0, -0.4],
  pitchR: 72,
  stab: 0.1,
})

const LIE = k({
  ik: 0,
  pos: [0, -0.637, -0.5],
  hips: [-88, 0, 0],
  spine: [2, 0, 0],
  chest: [-2, 0, 0],
  neck: [-4, 0, 0],
  head: [-8, 24, 0],
  armL: [-4, 0, 22],
  armR: [-10, 0, 14],
  elbowL: 12,
  elbowR: 32,
  hands: [0, 0, 0],
  thighs: [2, 18, 7],
  knees: 6,
  feet: [18, 0, 0],
  curl: 0.4,
  stab: 0,
})

const SIT = k({
  ik: 0,
  pos: [0, -0.628, -0.5],
  hips: [-16, 0, 0],
  spine: [12, 0, 0],
  chest: [8, 0, 0],
  neck: [4, 0, 0],
  head: [4, -6, 0],
  arms: [38, 6, 16],
  elbows: 6,
  hands: [-40, 0, 0],
  thighs: [-74, 8, 6],
  knees: 8,
  feet: [10, 0, 0],
  curl: 0.2,
  stab: 0.2,
})

const KNEES_UP = k({
  ik: 1,
  pos: [0, -0.62, -0.46],
  hips: [-12, 0, 0],
  spine: [20, 0, 0],
  chest: [10, 0, 0],
  head: [2, 0, 0],
  arms: [-46, 4, 12],
  elbows: 40,
  thighs: [-126, 0, 8],
  knees: 118,
  stab: 0.3,
})

const CROUCH = k({
  ik: 1,
  pos: [0, -0.34, -0.12],
  hips: [26, 0, 0],
  spine: [22, 0, 0],
  chest: [8, 0, 0],
  head: [-24, 0, 0],
  arms: [-40, 4, 14],
  elbows: 36,
  thighs: [-90, 0, 6],
  knees: 110,
  stab: 0.5,
})

const SHRUG = k({
  chest: [-2, 0, 0],
  head: [4, 0, 9],
  shoulders: [0, 0, 15],
  arms: [-10, 20, 12],
  elbows: 86,
  twists: 70,
  hands: [-18, 0, 0],
  curl: 0.08,
  stab: 0.1,
})

const POINT = k({
  chest: [0, 6, 0],
  shoulderR: [0, -4, 2],
  armR: [-86, 4, 4],
  elbowR: 4,
  twistR: -20,
  handR: [0, 0, 0],
  curlR: 0.92,
  pointR: 1,
  stab: 0.6,
})

export const GESTURES: Record<GestureName, GestureDef> = {
  wave: {
    duration: 2.3,
    loop: [0.45, 1.65],
    fadeIn: 0.15,
    fadeOut: 0.25,
    keys: [[0, IDLE], [0.38, WAVE_UP], [1.8, WAVE_UP], [2.25, IDLE]],
    extra: (t, p, b) => {
      const w = ramp(0.25, 0.45, t) * (1 - ramp(1.7, 1.95, t))
      const s = Math.sin(TAU * 2.3 * t)
      b.addElbow(p, 1, 17 * s * w)
      b.add(p, J.handR, 0, 0, 10 * Math.sin(TAU * 2.3 * t - 0.8) * w)
    },
  },
  cheer: {
    duration: 2.1,
    loop: [0.7, 1.45],
    fadeIn: 0.1,
    fadeOut: 0.3,
    keys: [
      [0, IDLE],
      [0.22, k({ pos: [0, -0.09, 0], spine: [10, 0, 0], chest: [4, 0, 0], arms: [18, 0, 8], elbows: 30, curl: 0.8 })],
      [0.42, k({
        ...CHEER_UP, pos: [0, 0.13, 0], ik: 0, spine: [-6, 0, 0],
        thighL: [-20, 0, 4], thighR: [-8, 0, 4], kneeL: 34, kneeR: 20, feet: [32, 0, 0],
      })],
      [0.62, CHEER_UP],
      [1.5, CHEER_UP],
      [1.95, IDLE],
    ],
    extra: (t, p, b) => {
      const w = ramp(0.6, 0.75, t) * (1 - ramp(1.4, 1.6, t))
      const s = Math.sin(TAU * 2.6 * (t - 0.6))
      b.add(p, J.upperArmL, 8 * s * w, 0, 0)
      b.add(p, J.upperArmR, 8 * s * w, 0, 0)
      b.addElbow(p, 0, 16 * Math.max(0, s) * w)
      b.addElbow(p, 1, 16 * Math.max(0, s) * w)
    },
  },
  lookUp: {
    duration: 2.8,
    loop: [0.7, 2.0],
    fadeIn: 0.15,
    fadeOut: 0.3,
    keys: [[0, IDLE], [0.7, LOOK_UP], [2.1, LOOK_UP], [2.75, IDLE]],
    extra: (t, p, b) => b.add(p, J.head, 0, 5 * Math.sin(t * 0.9) * ramp(0.4, 1, t), 0),
  },
  raiseShard: {
    duration: 3.2,
    loop: [0.95, 2.6],
    fadeIn: 0.12,
    fadeOut: 0.3,
    keys: [
      [0, IDLE],
      [0.4, k({ armR: [-70, 10, 6], elbowR: 104, curlR: 0.6, chest: [2, 0, 0], head: [12, -4, 0], stab: 0.2 })],
      [0.95, SHARD_HIGH],
      [2.7, SHARD_HIGH],
      [3.15, IDLE],
    ],
    extra: (t, p, b) => b.add(p, J.chest, 0, 0, 1.5 * Math.sin(t * 1.7) * ramp(0.9, 1.2, t)),
  },
  kneel: {
    duration: 3.1,
    loop: [0.8, 2.2],
    fadeIn: 0.1,
    fadeOut: 0.25,
    keys: [
      [0, IDLE],
      [0.32, k({ pos: [0, -0.13, 0], spine: [6, 0, 0], footOffL: [0, 0.08, 0.15], thighL: [-40, 0, 4], kneeL: 50 })],
      [0.8, KNEEL_DOWN],
      [2.25, KNEEL_DOWN],
      [2.65, k({ pos: [0, -0.13, 0], spine: [6, 0, 0], footOffL: [0, 0.06, 0.14], thighL: [-40, 0, 4], kneeL: 50 })],
      [3.05, IDLE],
    ],
  },
  wakeUp: {
    duration: 2.85,
    loop: [0, 0.5],
    fadeIn: 0,
    fadeOut: 0.3,
    keys: [
      [0, LIE],
      [0.5, k({ ...LIE, head: [-6, 8, 0] })],
      [1.15, SIT],
      [1.55, KNEES_UP],
      [2.08, CROUCH],
      [2.7, IDLE],
    ],
    extra: (t, p, b) => b.add(p, J.chest, -2 * Math.sin(t * 2.4) * (1 - ramp(0.4, 0.8, t)), 0, 0),
  },
  shrug: {
    duration: 1.5,
    loop: [0.35, 1.0],
    fadeIn: 0.1,
    fadeOut: 0.2,
    keys: [[0, IDLE], [0.32, SHRUG], [1.05, SHRUG], [1.45, IDLE]],
  },
  point: {
    duration: 1.9,
    loop: [0.4, 1.35],
    fadeIn: 0.1,
    fadeOut: 0.25,
    keys: [[0, IDLE], [0.35, POINT], [1.45, POINT], [1.85, IDLE]],
  },
}
