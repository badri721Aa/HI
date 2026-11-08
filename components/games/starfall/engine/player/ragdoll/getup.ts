/**
 * Getting back up after the ragdoll settles. Two keyed tracks, chosen by which way the chest
 * faces: face down → push up onto hands and knees → kneel → stand; face up → sit up → knees in
 * → crouch → stand. Keys are layered over IDLE (like gestures) and played through the
 * Animator's override, so its IK plants the feet as soon as they carry weight.
 */
import type { Pose, PoseBuilder, PoseSpec } from '../anim/Pose'
import { CROUCH, KNEEL_DOWN, KNEES_UP, LIE, SIT } from '../anim/gestures'
import { smooth } from '../anim/math'
import { IDLE } from '../anim/poses'

export interface GetUpTrack {
  keys: Pose[]
  times: number[]
  /** The hero stands up this far ahead of where his pelvis lay, along the new heading (m). */
  shift: number
  /** Time he is standing again (s). */
  end: number
}

const k = (s: PoseSpec): PoseSpec => ({ ...IDLE, ...s })

/** Face down, head turned, hands by the shoulders ready to push. */
const PRONE = k({
  ik: 0,
  pos: [0, -0.615, 0],
  hips: [88, 0, 0],
  spine: [-4, 0, 0],
  chest: [-6, 0, 0],
  neck: [-22, 0, 0],
  head: [-10, 30, 0],
  arms: [-12, 90, 72],
  elbows: 105,
  hands: [-35, 0, 0],
  thighs: [2, 0, 6],
  knees: 6,
  feet: [55, 0, 0],
  curl: 0.25,
  stab: 0,
})

/** Hands and knees, looking ahead. */
const CRAWL = k({
  ik: 0,
  pos: [0, -0.42, -0.02],
  hips: [70, 0, 0],
  spine: [2, 0, 0],
  chest: [-2, 0, 0],
  neck: [-22, 0, 0],
  head: [-26, 0, 0],
  arms: [-72, 6, 8],
  elbows: 8,
  hands: [-70, 0, 0],
  thighs: [-72, 0, 6],
  knees: 92,
  feet: [40, 0, 0],
  curl: 0.15,
  stab: 0,
})

/** Up on one knee, the other foot planted, hand on the knee. */
const KNEEL = k({ ...KNEEL_DOWN, spine: [16, 0, 0], head: [-6, 0, 0], stab: 0.3 })

const PRONE_KEYS: Array<[number, PoseSpec]> = [[0, PRONE], [0.34, CRAWL], [0.66, KNEEL], [1.0, IDLE]]
const SUPINE_KEYS: Array<[number, PoseSpec]> = [[0, LIE], [0.3, SIT], [0.52, KNEES_UP], [0.76, CROUCH], [1.04, IDLE]]

export function buildGetUpTracks(b: PoseBuilder): { prone: GetUpTrack; supine: GetUpTrack } {
  const track = (keys: Array<[number, PoseSpec]>, shift: number): GetUpTrack => ({
    keys: keys.map(([, s]) => b.compile(s)),
    times: keys.map(([t]) => t),
    shift,
    end: keys[keys.length - 1][0],
  })
  // LIE has the pelvis half a metre behind the root: he stands up that far toward his feet.
  return { prone: track(PRONE_KEYS, 0), supine: track(SUPINE_KEYS, -LIE.pos![2]) }
}

/** Pose of `track` at time t (eased between keys). */
export function sampleTrack(track: GetUpTrack, t: number, out: Pose): Pose {
  const { keys, times } = track
  const n = times.length
  if (t <= times[0]) return out.copy(keys[0])
  if (t >= times[n - 1]) return out.copy(keys[n - 1])
  let i = 0
  while (i < n - 2 && t >= times[i + 1]) i++
  return out.copy(keys[i]).blend(keys[i + 1], smooth((t - times[i]) / (times[i + 1] - times[i])))
}
