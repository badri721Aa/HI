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

/** The push itself (the first instant off the ground): legs driving straight down, arms still low and behind, about to swing. */
export const JUMP_PUSH: PoseSpec = {
  pos: [0, -0.02, 0],
  spine: [8, 0, 0],
  chest: [6, 0, 0],
  head: [-8, 0, 0],
  shoulders: [0, 0, 3],
  arms: [18, 4, 14],
  elbows: 30,
  thighL: [-6, 0, 3],
  thighR: [8, 0, 3],
  kneeL: 10,
  kneeR: 6,
  feet: [46, 0, 0],
  curl: 0.5,
  ik: 0,
  stab: 0.5,
}

/** Rising: a long stretch, one arm thrown high, the lead knee driving up and the other leg trailing. */
export const JUMP_UP: PoseSpec = {
  pos: [0, 0.03, 0],
  spine: [-6, 4, 0],
  chest: [-5, 6, 0],
  head: [-8, 0, 0],
  shoulderR: [0, 0, 8],
  armR: [-150, 0, 16],
  armL: [-46, 6, 30],
  elbowR: 20,
  elbowL: 52,
  thighL: [-44, 0, 3],
  thighR: [16, 0, 3],
  kneeL: 70,
  kneeR: 10,
  feet: [42, 0, 0],
  curl: 0.45,
  ik: 0,
  stab: 0.55,
}

/** Over the top: knees drawn up, arms out to the sides for balance. */
export const JUMP_TUCK: PoseSpec = {
  pos: [0, 0.04, 0],
  spine: [9, 0, 0],
  chest: [5, 0, 0],
  head: [-8, 0, 0],
  shoulders: [0, 0, 5],
  armL: [-64, 8, 52],
  armR: [-52, 8, 48],
  elbows: 44,
  thighL: [-88, 4, 7],
  thighR: [-66, 4, 7],
  kneeL: 112,
  kneeR: 96,
  feet: [22, 0, 0],
  curl: 0.5,
  ik: 0,
  stab: 0.6,
}

/** Falling: arms out and a little up for balance, legs loose under the body. */
export const FALL: PoseSpec = {
  spine: [-4, 0, 0],
  chest: [-5, 0, 0],
  head: [8, 0, 0],
  shoulders: [0, 0, 5],
  arms: [-26, 10, 66],
  elbows: 34,
  hands: [-8, 0, 6],
  thighL: [-28, 0, 6],
  thighR: [-12, 0, 6],
  kneeL: 44,
  kneeR: 30,
  feet: [18, 0, 0],
  curl: 0.18,
  ik: 0,
  stab: 0.6,
}

/** The ground is coming: legs reach down for it, feet flat and ready, arms lifted. */
export const REACH: PoseSpec = {
  spine: [3, 0, 0],
  chest: [-2, 0, 0],
  head: [10, 0, 0],
  shoulders: [0, 0, 7],
  arms: [-38, 8, 58],
  elbows: 38,
  hands: [-8, 0, 6],
  thighL: [-20, 0, 7],
  thighR: [-9, 0, 7],
  kneeL: 24,
  kneeR: 14,
  feet: [-4, 0, 0],
  curl: 0.25,
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

/** Additive flinch (hurt), first beat: the blow snaps the head and chest back and the shoulders up. */
export const HURT: PoseSpec = {
  pos: [0, -0.03, -0.04],
  spine: [-9, 0, 0],
  chest: [-8, 0, 0],
  neck: [-6, 0, 0],
  head: [-12, 0, 0],
  shoulders: [0, 0, 10],
  arms: [-12, 0, 12],
  elbows: 22,
  curl: 0.7,
}

/** Additive flinch, second beat: he folds forward around the hit before straightening up. */
export const HURT_FOLD: PoseSpec = {
  pos: [0, -0.05, -0.02],
  hips: [6, 0, 0],
  spine: [13, 0, 0],
  chest: [9, 0, 0],
  neck: [6, 0, 0],
  head: [8, 0, 0],
  shoulders: [0, 6, 4],
  arms: [-16, -6, 4],
  elbows: 38,
  curl: 0.8,
}

/** Knocked off his feet by a blow: thrown back, curled around it, arms and legs trailing in front. */
export const HURT_AIR: PoseSpec = {
  hips: [-16, 0, 0],
  spine: [14, 0, 0],
  chest: [12, 0, 0],
  neck: [4, 0, 0],
  head: [6, 0, 0],
  shoulders: [0, 6, 6],
  armL: [-58, 0, 30],
  armR: [-46, 0, 36],
  elbows: 36,
  hands: [-10, 0, 0],
  thighL: [-46, 0, 8],
  thighR: [-30, 0, 8],
  kneeL: 52,
  kneeR: 38,
  feet: [8, 0, 0],
  curl: 0.3,
  ik: 0,
  stab: 0.3,
}

/** Additive landing compression (scaled by impact): folds over the knees, arms carried down and out by the fall. The hips drop separately. */
export const LAND: PoseSpec = {
  hips: [7, 0, 0],
  spine: [14, 0, 0],
  chest: [8, 0, 0],
  head: [-12, 0, 0],
  shoulders: [0, 0, -3],
  arms: [14, 0, 18],
  elbows: 28,
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

const SIDES: ReadonlyArray<readonly [keyof PoseSpec, keyof PoseSpec]> = [
  ['shoulderL', 'shoulderR'], ['armL', 'armR'], ['elbowL', 'elbowR'], ['twistL', 'twistR'], ['handL', 'handR'],
  ['thighL', 'thighR'], ['kneeL', 'kneeR'], ['footL', 'footR'], ['curlL', 'curlR'], ['pointL', 'pointR'],
  ['footOffL', 'footOffR'], ['pitchL', 'pitchR'],
]
const CENTRE: ReadonlyArray<'hips' | 'spine' | 'chest' | 'neck' | 'head'> = ['hips', 'spine', 'chest', 'neck', 'head']

/** The same pose with left and right swapped (limb angles are mirrored per side, so swapping the fields is enough). */
export function mirror(s: PoseSpec): PoseSpec {
  const m: Record<string, unknown> = { ...s }
  for (const [l, r] of SIDES) {
    m[l] = s[r]
    m[r] = s[l]
    if (m[l] === undefined) delete m[l]
    if (m[r] === undefined) delete m[r]
  }
  for (const c of CENTRE) {
    const v = s[c]
    if (v) m[c] = [v[0], -v[1], -v[2]]
  }
  if (s.pos) m.pos = [-s.pos[0], s.pos[1], s.pos[2]]
  return m as PoseSpec
}
