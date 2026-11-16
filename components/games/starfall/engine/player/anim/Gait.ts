/**
 * Parametric locomotion: walk → run → sprint presets blended by speed, and the
 * foot trajectory for a given stride phase. Feet are IK targets, and during
 * stance a foot moves backward exactly as fast as the body moves forward, so
 * planted feet never slide.
 */
import { DEG, TAU, clamp01, lerp, ramp, smooth } from './math'

export interface GaitParams {
  /** Distance covered per step (m). A full cycle is two steps. */
  step: number
  /** Fraction of the cycle each foot spends on the ground. */
  stance: number
  /** Forward offset of the stance window relative to the hips (m). */
  reach: number
  /** Swing-foot clearance (m) and extra heel kick behind the body (m). */
  lift: number
  kick: number
  /** Half the lateral distance between the feet (m). */
  width: number
  /** Mean hips height offset (m) and vertical bob (m; + peaks at mid-stance, − dips). */
  drop: number
  bob: number
  /** Degrees. */
  lean: number
  arm: number
  armOut: number
  elbow: number
  elbowSwing: number
  pelvisYaw: number
  chestYaw: number
  pelvisRoll: number
  /** Foot pitch at heel strike (negative = toes up) and at toe-off (heel up). */
  heel: number
  toeOff: number
  footYaw: number
  /** Finger curl 0..1. */
  fist: number
}

const KEYS: Array<keyof GaitParams> = [
  'step', 'stance', 'reach', 'lift', 'kick', 'width', 'drop', 'bob', 'lean', 'arm', 'armOut', 'elbow', 'elbowSwing',
  'pelvisYaw', 'chestYaw', 'pelvisRoll', 'heel', 'toeOff', 'footYaw', 'fist',
]

/** Step lengths match the controller's footstep events (walk 0.75, run 1.25, sprint 1.6 m). */
export const WALK: GaitParams = {
  step: 0.75, stance: 0.6, reach: 0.0, lift: 0.075, kick: 0.03, width: 0.095,
  drop: -0.022, bob: 0.018, lean: 3, arm: 24, armOut: 4, elbow: 20, elbowSwing: 16,
  pelvisYaw: 6, chestYaw: 8, pelvisRoll: 3.5, heel: -16, toeOff: 32, footYaw: -10, fist: 0.42,
}

export const RUN: GaitParams = {
  step: 1.25, stance: 0.31, reach: -0.05, lift: 0.12, kick: 0.2, width: 0.07,
  drop: -0.055, bob: -0.03, lean: 11, arm: 40, armOut: 9, elbow: 78, elbowSwing: 16,
  pelvisYaw: 9, chestYaw: 12, pelvisRoll: 2.5, heel: -4, toeOff: 46, footYaw: -12, fist: 0.88,
}

export const SPRINT: GaitParams = {
  step: 1.6, stance: 0.28, reach: -0.07, lift: 0.15, kick: 0.3, width: 0.06,
  drop: -0.075, bob: -0.035, lean: 17, arm: 50, armOut: 10, elbow: 80, elbowSwing: 10,
  pelvisYaw: 11, chestYaw: 14, pelvisRoll: 2, heel: 2, toeOff: 52, footYaw: -12, fist: 1,
}

export function blendGait(out: GaitParams, a: GaitParams, b: GaitParams, t: number): GaitParams {
  for (const k of KEYS) out[k] = lerp(a[k], b[k], t)
  return out
}

/**
 * Gait parameters for a speed. Below walking speed the stride shortens
 * (small shuffling steps) instead of slowing the cadence to a crawl.
 */
export function gaitFor(out: GaitParams, speed: number, walk: number, run: number, sprint: number): GaitParams {
  if (speed <= walk) {
    blendGait(out, WALK, WALK, 0)
    const k = clamp01(speed / Math.max(0.1, walk))
    out.step = lerp(0.45, WALK.step, k)
    out.lift *= lerp(0.6, 1, k)
    out.arm *= lerp(0.5, 1, k)
    out.bob *= k
    return out
  }
  if (speed <= run) {
    const k = clamp01((speed - walk) / Math.max(0.1, run - walk))
    blendGait(out, WALK, RUN, smooth(k))
    // Stride length is linear in speed, exactly like the controller's footstep events.
    out.step = lerp(WALK.step, RUN.step, k)
    return out
  }
  return blendGait(out, RUN, SPRINT, clamp01((speed - run) / Math.max(0.1, sprint - run)))
}

/** Wading: shorter, high-kneed steps with the arms held up. */
export function applyWade(g: GaitParams, w: number): void {
  if (w <= 0) return
  g.step *= 1 - 0.25 * w
  g.lift += 0.14 * w
  g.kick *= 1 - 0.8 * w
  g.stance = lerp(g.stance, 0.55, w)
  g.lean = lerp(g.lean, 6, w)
  g.arm *= 1 - 0.45 * w
  g.armOut += 22 * w
  g.elbow = lerp(g.elbow, 70, w)
  g.bob = lerp(g.bob, 0.025, w)
  g.width += 0.02 * w
}

export interface FootSample {
  /** Sole position in character space relative to the ground under the hips (m). */
  x: number
  y: number
  z: number
  /** Foot pitch (rad, + = heel up). */
  pitch: number
  /** 1 while the foot is in the air. */
  swing: number
}

/**
 * Foot target for one foot at its own phase `u` (0 = heel strike).
 * `side` is 0 for left, 1 for right.
 */
export function footAt(out: FootSample, g: GaitParams, u: number, side: 0 | 1): FootSample {
  const S = g.stance * 2 * g.step
  const half = S / 2
  out.x = side === 0 ? g.width : -g.width
  if (u < g.stance) {
    // Planted: travels back at body speed. Heel → flat → heel rising toward toe-off.
    const a = u / g.stance
    out.z = half - S * a + g.reach
    out.y = 0
    out.pitch = (g.heel * (1 - smooth(a / 0.22)) + g.toeOff * Math.pow(ramp(0.5, 1, a), 1.6)) * DEG
    out.swing = 0
  } else {
    // Swing: the foot lifts (kicking back when running), comes through and reaches for the next contact.
    const b = (u - g.stance) / (1 - g.stance)
    const kickDelay = clamp01(g.kick / 0.3) * 0.14
    const travel = smooth((b - kickDelay) / (1 - kickDelay))
    out.z = -half + S * travel + g.reach
    const kick = g.kick * Math.pow(Math.sin(Math.PI * clamp01(b * 1.35)), 2)
    out.y = g.lift * Math.pow(Math.sin(Math.PI * b), 0.9) + kick
    const toes = -14 * Math.sin(Math.PI * b)
    out.pitch = (g.toeOff * (1 - smooth(b / 0.4)) + toes + g.heel * ramp(0.7, 1, b)) * DEG
    out.swing = 1
  }
  return out
}

/** Cosine that is +1 when the left foot is furthest forward (heel strike), lagged by `lag` of a cycle. */
export const swingSignal = (phase: number, lag: number): number => Math.cos(TAU * (phase - lag))
