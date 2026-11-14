/**
 * A seeded random stream whose whole state is one integer (mulberry32), so a boss's choices can
 * be replayed: a co-op host only needs to send the seed and the state at each decision.
 */
export class SeededRandom {
  private s: number

  constructor(seed: number) {
    this.s = seed >>> 0
  }

  /** The stream's state (serialisable). */
  get state(): number {
    return this.s
  }

  set state(v: number) {
    this.s = v >>> 0
  }

  /** 0 ≤ x < 1. */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) | 0
    let t = this.s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  range(a: number, b: number): number {
    return a + (b - a) * this.next()
  }

  /** An integer in [0, n). */
  int(n: number): number {
    return Math.min(n - 1, Math.floor(this.next() * n))
  }

  /** −1 or +1. */
  sign(): number {
    return this.next() < 0.5 ? -1 : 1
  }

  pick<T>(list: readonly T[]): T {
    return list[this.int(list.length)]
  }
}

/** A well-mixed 32-bit seed from a few integers (spawn id, kind salt…). */
export function mixSeed(...parts: number[]): number {
  let h = 0x9e3779b9
  for (const p of parts) {
    h ^= p >>> 0
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b)
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
    h ^= h >>> 16
  }
  return h >>> 0
}
