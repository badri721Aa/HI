/**
 * Low-res maps of the island baked once for the ambient effects:
 *  - surface height (terrain or water surface, whichever is higher) so GPU-wrapped
 *    particles can hover over the ground without any CPU work,
 *  - density channels R = fireflies, G = falling leaves, B = meadow pollen,
 *  - coastline points (with a landward normal) where sea spray is emitted.
 */
import * as THREE from 'three'
import { LAKES, WORLD_HALF, ZONES, heightAt, smoothstep, waterLevelAt, type ZoneId } from '../world/heightfield'

/** Texels per side (≈4 m each). */
const N = 100
const CELL = (WORLD_HALF * 2) / N

export interface WorldMap {
  height: THREE.DataTexture
  density: THREE.DataTexture
  /** Packed [x, z, nx, nz] per coastline point; (nx, nz) points inland. */
  coast: Float32Array
  coastCount: number
  dispose(): void
}

function zoneWeight(id: ZoneId, x: number, z: number, inner = 0.55, outer = 1.05): number {
  const zn = ZONES.find(q => q.id === id)
  if (!zn) return 0
  return 1 - smoothstep(inner, outer, Math.hypot(x - zn.x, z - zn.z) / zn.r)
}

export function bakeWorldMap(): WorldMap {
  const h = new Float32Array(N * N)
  const surf = new Uint16Array(N * N)
  const dens = new Uint8Array(N * N * 4)

  for (let j = 0; j < N; j++) {
    const z = -WORLD_HALF + (j + 0.5) * CELL
    for (let i = 0; i < N; i++) {
      const x = -WORLD_HALF + (i + 0.5) * CELL
      const k = j * N + i
      const hh = heightAt(x, z)
      h[k] = hh
      surf[k] = THREE.DataUtils.toHalfFloat(Math.max(hh, waterLevelAt(x, z)))
    }
  }

  const at = (i: number, j: number) => h[Math.min(N - 1, Math.max(0, j)) * N + Math.min(N - 1, Math.max(0, i))]
  const coast: number[] = []
  for (let j = 0; j < N; j++) {
    const z = -WORLD_HALF + (j + 0.5) * CELL
    for (let i = 0; i < N; i++) {
      const x = -WORLD_HALF + (i + 0.5) * CELL
      const k = j * N + i
      const hh = h[k]
      const gx = (at(i + 1, j) - at(i - 1, j)) / (2 * CELL)
      const gz = (at(i, j + 1) - at(i, j - 1)) / (2 * CELL)
      const slope = Math.hypot(gx, gz)

      let lakeNear = 0
      let inLake = false
      for (const l of LAKES) {
        const d = Math.hypot(x - l.x, z - l.z)
        lakeNear = Math.max(lakeNear, 1 - smoothstep(l.r + 2, l.r + 16, d))
        if (d < l.r + 8) inLake = true
      }
      const land = smoothstep(-0.2, 0.6, hh)
      const forest = zoneWeight('forest', x, z)
      const village = zoneWeight('village', x, z)
      const falls = zoneWeight('falls', x, z, 0.3, 0.9)
      const lake = zoneWeight('lake', x, z, 0.5, 1)

      // Fireflies: woods, village gardens and the edges of fresh water (not over the open sea).
      const fire = Math.max(forest, village * 0.55, lakeNear * 0.85, falls * 0.8, lake * 0.6) * (inLake ? 1 : land)
      // Leaves: under the forest canopy.
      const leaves = forest * land
      // Pollen: open grassy ground above the beach, not too steep, thinner in the woods.
      const meadow = smoothstep(2.2, 3.5, hh) * (1 - smoothstep(0.25, 0.4, slope)) * (1 - forest * 0.75)

      dens[k * 4] = Math.round(THREE.MathUtils.clamp(fire, 0, 1) * 255)
      dens[k * 4 + 1] = Math.round(THREE.MathUtils.clamp(leaves, 0, 1) * 255)
      dens[k * 4 + 2] = Math.round(THREE.MathUtils.clamp(meadow, 0, 1) * 255)
      dens[k * 4 + 3] = 255

      // Coast: near sea level, next to open sea, away from the inland lakes.
      if (inLake || hh < -1.6 || hh > 1.2) continue
      if (Math.min(at(i + 1, j), at(i - 1, j), at(i, j + 1), at(i, j - 1)) > -0.8) continue
      if (slope < 1e-3) continue
      // One Newton step onto the h = 0 waterline, along the gradient.
      const step = THREE.MathUtils.clamp(-hh / slope, -CELL, CELL)
      coast.push(x + (gx / slope) * step, z + (gz / slope) * step, gx / slope, gz / slope)
    }
  }

  const height = new THREE.DataTexture(surf, N, N, THREE.RedFormat, THREE.HalfFloatType)
  const density = new THREE.DataTexture(dens, N, N, THREE.RGBAFormat, THREE.UnsignedByteType)
  for (const t of [height, density]) {
    t.magFilter = THREE.LinearFilter
    t.minFilter = THREE.LinearFilter
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping
    t.generateMipmaps = false
    t.colorSpace = THREE.NoColorSpace
    t.needsUpdate = true
  }

  return {
    height,
    density,
    coast: new Float32Array(coast),
    coastCount: coast.length / 4,
    dispose() {
      height.dispose()
      density.dispose()
    },
  }
}

/** World → map UV transform as a uniform-friendly vec2: uv = xz * s.x + s.y. */
export const MAP_XFORM = new THREE.Vector2(1 / (WORLD_HALF * 2), 0.5)
