/**
 * Static key poses for states (see Pose.ts for the angle convention).
 * Dynamic motion (breathing, flailing, swinging) is layered on top in Animator.ts.
 */
import type { PoseSpec } from './Pose'

/** Relaxed standing: arms hang at the sides with soft elbows, knees unlocked. */
export const IDLE: PoseSpec = {
  pos: [0, -0.012, 0],
  spine: [1, 0, 0],
  chest: [-1, 0, 0],
  neck: [2, 0, 0],
  head: [-2, 0, 0],
  shoulders: [0, 0, -2],
  arms: [-3, 4, -3],
  elbows: 8,
  hands: [4, 0, 0],
  curl: 0.32,
  stab: 0.25,
}

/** First frames of a jump: legs extending, toes pointed, arms driving up. */
export const JUMP_UP: PoseSpec = {
  pos: [0, 0.02, 0],
  spine: [-5, 0, 0],
  chest: [-4, 0, 0],
  head: [-6, 0, 0],
  arms: [-55, 6, 16],
  elbows: 30,
  thighL: [-14, 0, 3],
  thighR: [6, 0, 3],
  kneeL: 22,
  kneeR: 12,
  feet: [38, 0, 0],
  curl: 0.45,
  ik: 0,
  stab: 0.55,
}

/** Jump apex: knees tucked, arms up and out. */
export const JUMP_TUCK: PoseSpec = {
  pos: [0, 0.04, 0],
  spine: [6, 0, 0],
  chest: [3, 0, 0],
  head: [-6, 0, 0],
  armL: [-112, 8, 34],
  armR: [-100, 8, 30],
  elbows: 34,
  thighL: [-82, 4, 7],
  thighR: [-58, 4, 7],
  kneeL: 108,
  kneeR: 86,
  feet: [24, 0, 0],
  curl: 0.55,
  ik: 0,
  stab: 0.6,
}

/** Falling: arms out for balance, legs loose. */
export const FALL: PoseSpec = {
  spine: [-5, 0, 0],
  chest: [-6, 0, 0],
  head: [8, 0, 0],
  shoulders: [0, 0, 4],
  arms: [-22, 10, 62],
  elbows: 32,
  hands: [-8, 0, 6],
  thighL: [-26, 0, 6],
  thighR: [-12, 0, 6],
  kneeL: 42,
  kneeR: 30,
  feet: [18, 0, 0],
  curl: 0.18,
  ik: 0,
  stab: 0.6,
}

/** Double-jump somersault: tight ball, hands hugging the shins. */
export const FLIP_TUCK: PoseSpec = {
  pos: [0, 0.06, 0],
  spine: [24, 0, 0],
  chest: [18, 0, 0],
  neck: [12, 0, 0],
  head: [16, 0, 0],
  arms: [-78, 6, 18],
  elbows: 96,
  twists: 20,
  thighs: [-118, 0, 10],
  knees: 138,
  feet: [30, 0, 0],
  curl: 0.85,
  ik: 0,
  stab: 0,
}

/** Bounce-pad launch: starfish. */
export const STAR: PoseSpec = {
  spine: [-12, 0, 0],
  chest: [-8, 0, 0],
  head: [-14, 0, 0],
  shoulders: [0, 0, 8],
  arms: [-12, 0, 128],
  elbows: 12,
  hands: [0, 0, 8],
  thighs: [-6, 8, 26],
  knees: 10,
  feet: [26, 0, 0],
  curl: 0.02,
  ik: 0,
  stab: 0.3,
}

/** Dash: superman lean, arms swept back, legs trailing. */
export const DASH: PoseSpec = {
  pos: [0, 0.05, 0],
  hips: [48, 0, 0],
  spine: [8, 0, 0],
  chest: [6, 0, 0],
  head: [-8, 0, 0],
  shoulders: [0, 4, 2],
  arms: [64, -10, 16],
  elbows: 12,
  hands: [22, 0, 0],
  thighL: [-12, 0, 4],
  thighR: [2, 0, 4],
  kneeL: 24,
  kneeR: 40,
  feet: [42, 0, 0],
  curl: 0.6,
  ik: 0,
  stab: 0.9,
}

/** Spin attack: arms flung out, slight crouch. The spin itself rotates the whole body. */
export const ATTACK: PoseSpec = {
  pos: [0, -0.06, 0],
  spine: [7, 0, 0],
  chest: [2, 0, 0],
  head: [-4, 0, 0],
  shoulders: [0, 0, 4],
  arms: [-8, 0, 84],
  elbows: 10,
  hands: [0, 0, 6],
  curl: 0.95,
  stab: 0.2,
}

/** Additive flinch (hurt). */
export const HURT: PoseSpec = {
  pos: [0, -0.035, -0.05],
  spine: [-12, 0, 0],
  chest: [-10, 0, 0],
  neck: [-8, 0, 0],
  head: [-12, 0, 0],
  shoulders: [0, 0, 8],
  arms: [-34, 0, 22],
  elbows: 46,
  curl: 0.7,
}

/** Additive landing compression (scaled by impact). Hips drop is applied separately. */
export const LAND: PoseSpec = {
  spine: [12, 0, 0],
  chest: [6, 0, 0],
  head: [-10, 0, 0],
  arms: [-14, 0, 10],
  elbows: 22,
}

/** Defeated: drops to the knees and slumps. */
export const DEAD: PoseSpec = {
  pos: [0, -0.4, -0.06],
  spine: [26, 0, 0],
  chest: [14, 0, 0],
  neck: [10, 0, 0],
  head: [22, 0, 0],
  arms: [-6, 0, 4],
  elbows: 14,
  thighs: [-4, 0, 4],
  knees: 104,
  feet: [62, 0, 0],
  curl: 0.25,
  ik: 0,
  stab: 0,
}
