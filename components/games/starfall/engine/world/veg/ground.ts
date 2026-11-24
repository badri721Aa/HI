/**
 * Ground queries for the scatter and the grass field.
 *
 * Heights are cached lazily on the terrain mesh's own grid and interpolated over
 * the same triangles the terrain renders (alternating diagonals), so anything
 * planted here sits exactly on the visible ground — not on the smoother analytic
 * surface between mesh vertices. Distances to paths and spark trails are
 * rasterised once into distance fields so placement rules stay cheap.
 */
import { heightAt, PATHS, segDist, WORLD_HALF } from '../heightfield'
import { CLEARINGS, HEARTS, SPARK_SINGLES, SPARK_TRAILS } from '../level'

/** Samples per side — identical to the terrain mesh grid (8 chunks × 48 cells + 1). */
const N = 385
const CELL = (WORLD_HALF * 2) / (N - 1)
/** Distance fields saturate here (m). */
const MAX_DIST = 10

export class GroundCache {
  private h = new Float32Array(N * N).fill(Number.NaN)
  private path = new Float32Array(N * N).fill(MAX_DIST)
  private trail = new Float32Array(N * N).fill(MAX_DIST)

  constructor() {
    for (const p of PATHS) {
      for (let i = 0; i < p.length - 1; i++) this.rasterSegment(this.path, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1])
    }
    for (const t of SPARK_TRAILS) {
      if (t.abs) continue
      for (let i = 0; i < t.points.length - 1; i++) {
        const a = t.points[i]
        const b = t.points[i + 1]
        this.rasterSegment(this.trail, a[0], a[2], b[0], b[2])
      }
    }
    for (const [x, z] of HEARTS) this.rasterSegment(this.trail, x, z, x, z)
    for (const [x, , z] of SPARK_SINGLES) this.rasterSegment(this.trail, x, z, x, z)
  }

  private rasterSegment(field: Float32Array, ax: number, az: number, bx: number, bz: number): void {
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - MAX_DIST + WORLD_HALF) / CELL))
    const i1 = Math.min(N - 1, Math.ceil((Math.max(ax, bx) + MAX_DIST + WORLD_HALF) / CELL))
    const j0 = Math.max(0, Math.floor((Math.min(az, bz) - MAX_DIST + WORLD_HALF) / CELL))
    const j1 = Math.min(N - 1, Math.ceil((Math.max(az, bz) + MAX_DIST + WORLD_HALF) / CELL))
    for (let j = j0; j <= j1; j++) {
      const z = -WORLD_HALF + j * CELL
      for (let i = i0; i <= i1; i++) {
        const d = segDist(-WORLD_HALF + i * CELL, z, ax, az, bx, bz)
        const k = j * N + i
        if (d < field[k]) field[k] = d
      }
    }
  }

  /** Cached analytic height at grid point (i, j), clamped to the grid. */
  private at(i: number, j: number): number {
    i = i < 0 ? 0 : i >= N ? N - 1 : i
    j = j < 0 ? 0 : j >= N ? N - 1 : j
    const k = j * N + i
    let v = this.h[k]
    if (v !== v) {
      v = heightAt(-WORLD_HALF + i * CELL, -WORLD_HALF + j * CELL)
      this.h[k] = v
    }
    return v
  }

  /** Height of the rendered terrain surface at (x, z). */
  height(x: number, z: number): number {
    const gx = (x + WORLD_HALF) / CELL
    const gz = (z + WORLD_HALF) / CELL
    const i = Math.floor(gx)
    const j = Math.floor(gz)
    const fx = gx - i
    const fz = gz - j
    const h00 = this.at(i, j)
    const h10 = this.at(i + 1, j)
    const h01 = this.at(i, j + 1)
    const h11 = this.at(i + 1, j + 1)
    if ((i + j) & 1) {
      // Diagonal from (i+1, j) to (i, j+1).
      if (fx + fz <= 1) return h00 + (h10 - h00) * fx + (h01 - h00) * fz
      return h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz)
    }
    // Diagonal from (i, j) to (i+1, j+1).
    if (fz >= fx) return h00 + (h01 - h00) * fz + (h11 - h01) * fx
    return h00 + (h10 - h00) * fx + (h11 - h10) * fz
  }

  /** 0 = flat, 1 = vertical (central differences over ~2 m, like the terrain's normals). */
  slope(x: number, z: number): number {
    const e = CELL
    const nx = this.height(x - e, z) - this.height(x + e, z)
    const nz = this.height(x, z - e) - this.height(x, z + e)
    return 1 - (2 * e) / Math.sqrt(nx * nx + 4 * e * e + nz * nz)
  }

  /** Unit ground normal written into `out`. */
  normal(x: number, z: number, out: { x: number; y: number; z: number }): void {
    const e = CELL
    const nx = this.height(x - e, z) - this.height(x + e, z)
    const nz = this.height(x, z - e) - this.height(x, z + e)
    const ny = 2 * e
    const l = Math.sqrt(nx * nx + ny * ny + nz * nz)
    out.x = nx / l
    out.y = ny / l
    out.z = nz / l
  }

  /** Lowest ground under a disc of radius r (keeps trunks and rocks from floating on slopes). */
  minHeight(x: number, z: number, r: number): number {
    let m = this.height(x, z)
    for (let a = 0; a < 6; a++) {
      const ang = (a / 6) * Math.PI * 2
      m = Math.min(m, this.height(x + Math.cos(ang) * r, z + Math.sin(ang) * r))
    }
    return m
  }

  private sample(field: Float32Array, x: number, z: number): number {
    let gx = (x + WORLD_HALF) / CELL
    let gz = (z + WORLD_HALF) / CELL
    const lim = N - 1.001
    gx = gx < 0 ? 0 : gx > lim ? lim : gx
    gz = gz < 0 ? 0 : gz > lim ? lim : gz
    const i = gx | 0
    const j = gz | 0
    const fx = gx - i
    const fz = gz - j
    const k = j * N + i
    const a = field[k] + (field[k + 1] - field[k]) * fx
    const b = field[k + N] + (field[k + N + 1] - field[k + N]) * fx
    return a + (b - a) * fz
  }

  /** Distance to the nearest dirt path centreline (saturates at 10 m). */
  pathDist(x: number, z: number): number {
    return this.sample(this.path, x, z)
  }

  /** Distance to the nearest spark trail or heart pickup (saturates at 10 m). */
  trailDist(x: number, z: number): number {
    return this.sample(this.trail, x, z)
  }
}

/**
 * Signed distance to the nearest clearing edge (negative inside one).
 * `skip` optionally exempts one clearing (e.g. reeds may ring the falls pool).
 */
export function clearance(x: number, z: number, skip?: readonly [number, number, number]): number {
  let best = Infinity
  for (const c of CLEARINGS) {
    if (c === skip) continue
    const dx = x - c[0]
    const dz = z - c[1]
    const d = Math.sqrt(dx * dx + dz * dz) - c[2]
    if (d < best) best = d
  }
  return best
}
