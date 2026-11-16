/**
 * Landmark solids that plants must not grow through.
 *
 * The scatter runs before the zones are built, so their props (stumps, standing
 * stones, docks, fences, stepping stones…) are only known once the world is
 * complete. This collects the static, non-vegetation colliders around a point so
 * instances and grass tufts that would poke through them can be dropped.
 * Allocation-free after warm-up.
 */
import type { Collider, CollisionWorld } from '../../collision'

export class Blockers {
  private near: Collider[] = []
  private cos: number[] = []
  private sin: number[] = []
  private n = 0

  /** `own` = the vegetation's own colliders (never block themselves). */
  constructor(private world: CollisionWorld, private own: ReadonlySet<Collider>) {}

  /** Collects the solids within `r` of (x, z) that reach into heights [y0, y1]. Returns how many. */
  gather(x: number, z: number, r: number, y0 = -Infinity, y1 = Infinity): number {
    let n = 0
    for (const c of this.world.query(x, z, r)) {
      if (c.dynamic || this.own.has(c)) continue
      const bot = c.shape === 'box' ? c.y - c.hy : c.y
      const top = c.shape === 'box' ? c.y + c.hy : c.y + c.h
      if (top <= y0 || bot >= y1) continue
      this.near[n] = c
      this.cos[n] = Math.cos(c.yaw)
      this.sin[n] = Math.sin(c.yaw)
      n++
    }
    this.n = n
    return n
  }

  /** Does a disc (x, z, r) spanning heights [y0, y1] touch any of the gathered solids? */
  hits(x: number, z: number, r: number, y0: number, y1: number): boolean {
    for (let k = 0; k < this.n; k++) {
      const c = this.near[k]
      if (c.shape === 'cylinder') {
        if (c.y + c.h <= y0 || c.y >= y1) continue
        const dx = x - c.x
        const dz = z - c.z
        const m = c.r + r
        if (dx * dx + dz * dz < m * m) return true
      } else {
        if (c.y + c.hy <= y0 || c.y - c.hy >= y1) continue
        // World → box-local XZ (inverse of three's Y rotation).
        const dx = x - c.x
        const dz = z - c.z
        const lx = dx * this.cos[k] - dz * this.sin[k]
        const lz = dx * this.sin[k] + dz * this.cos[k]
        if (Math.abs(lx) < c.hx + r && Math.abs(lz) < c.hz + r) return true
      }
    }
    return false
  }
}
