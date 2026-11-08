/** Small scalar helpers shared by the procedural animation code. All allocation-free. */

export const DEG = Math.PI / 180
export const TAU = Math.PI * 2

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v)
export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
export const wrap01 = (x: number): number => x - Math.floor(x)

/** Cubic ease (smoothstep) on a clamped 0..1 input. */
export const smooth = (t: number): number => {
  const x = clamp01(t)
  return x * x * (3 - 2 * x)
}

/** Smoothstep between two edges. */
export const ramp = (e0: number, e1: number, x: number): number => smooth((x - e0) / (e1 - e0))

export const easeOut = (t: number): number => {
  const x = 1 - clamp01(t)
  return 1 - x * x * x
}

export const easeIn = (t: number): number => {
  const x = clamp01(t)
  return x * x * x
}

/** Frame-rate independent exponential approach of `cur` toward `target`. */
export const damp = (cur: number, target: number, rate: number, dt: number): number =>
  target + (cur - target) * Math.exp(-rate * dt)

export const wrapAngle = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a))

/** Exponential approach for angles (takes the short way round). */
export const dampAngle = (cur: number, target: number, rate: number, dt: number): number =>
  cur + wrapAngle(target - cur) * (1 - Math.exp(-rate * dt))

/**
 * Attack/release envelope: 0 → 1 over `rise` seconds, holds until `hold`, then 1 → 0 over `fall`.
 * Smoothstepped on both ends.
 */
export const envelope = (t: number, rise: number, hold: number, fall: number): number => {
  if (t <= 0) return 0
  if (t < rise) return smooth(t / rise)
  if (t < hold) return 1
  return 1 - smooth((t - hold) / fall)
}

/** Smooth 1D value noise in [-1, 1] — for idle micro-motion. Deterministic per `seed`. */
export const noise1 = (t: number, seed: number): number => {
  const i = Math.floor(t)
  const f = t - i
  const h = (n: number) => {
    const s = Math.sin((n + seed * 57.13) * 127.1) * 43758.5453
    return (s - Math.floor(s)) * 2 - 1
  }
  const u = f * f * (3 - 2 * f)
  return h(i) * (1 - u) + h(i + 1) * u
}
