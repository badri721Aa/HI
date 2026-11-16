/** Small, allocation-free helpers shared by the player controller and the camera rig. */

const TAU = Math.PI * 2

/** Wraps an angle to (-π, π]. */
export function wrapAngle(a: number): number {
  a = (a + Math.PI) % TAU
  if (a < 0) a += TAU
  return a - Math.PI
}

/** Frame-rate independent exponential approach of `current` toward `target` (`rate` in 1/s). */
export function damp(current: number, target: number, rate: number, dt: number): number {
  return target + (current - target) * Math.exp(-rate * dt)
}

/** Moves `current` toward `target` by at most `maxDelta`. */
export function approach(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(current + maxDelta, target)
  return Math.max(current - maxDelta, target)
}
