/**
 * What grows where: per-point ground cover and biome weights.
 *
 * The cover weights mirror the terrain splat rules (sand line, rock slope,
 * path wear, muddy lake banks, forest leaf litter) so plants only grow on
 * ground that actually *looks* like grass, and nothing sprouts from a path.
 */
import { fbm, LAKES, PLAY_RADIUS, smoothstep, waterLevelAt, zoneAt, ZONES, type ZoneId } from '../heightfield'
import { clearance, type GroundCache } from './ground'

const FOREST = ZONES.find(z => z.id === 'forest')!
const SUMMIT = ZONES.find(z => z.id === 'summit')!
/** Mesa top the falls drop from (see heightfield MESA). */
const MESA = { x: -66, z: -68, hx: 20, hz: 14 }

export interface Site {
  x: number
  z: number
  /** Rendered ground height. */
  h: number
  /** 0 flat … 1 vertical. */
  slope: number
  /** Water surface here (sea or lake) and height above it. */
  water: number
  hw: number
  /** Distance to a path centreline / spark trail (m, saturates at 10). */
  path: number
  trail: number
  /** Signed distance outside the nearest clearing (negative = inside). */
  clear: number
  /** Ground cover, summing to 1. */
  sand: number
  rock: number
  dirt: number
  grass: number
  /** Biome weights 0..1. */
  forest: number
  high: number
  /** Near a lake (bank / shallows). */
  lake: number
  /** Low sea shore. */
  coast: number
  zone: ZoneId | null
  /** Distance from the island centre. */
  r: number
  /** Large-scale clumping noise in -1..1 (groves, flower fields). */
  clump: number
}

export function newSite(): Site {
  return {
    x: 0, z: 0, h: 0, slope: 0, water: 0, hw: 0, path: 10, trail: 10, clear: Infinity, sand: 0, rock: 0, dirt: 0,
    grass: 1, forest: 0, high: 0, lake: 0, coast: 0, zone: null, r: 0, clump: 0,
  }
}

const dist = (ax: number, az: number, bx: number, bz: number) => {
  const dx = ax - bx
  const dz = az - bz
  return Math.sqrt(dx * dx + dz * dz)
}

/** Ground-cover weights only (cheap enough for every grass tuft). Returns the grass weight. */
export function coverAt(g: GroundCache, x: number, z: number, s: Site): number {
  const h = g.height(x, z)
  const water = waterLevelAt(x, z)
  const hw = h - water
  s.x = x
  s.z = z
  s.h = h
  s.water = water
  s.hw = hw
  if (hw < -0.6) {
    // Open water: nothing grows, skip the rest.
    s.slope = 0
    s.path = 10
    s.rock = s.dirt = s.sand = s.grass = s.lake = 0
    return 0
  }
  const slope = g.slope(x, z)
  const path = g.pathDist(x, z)
  const nMid = fbm(x * 0.05, z * 0.05, 2)

  let rock = smoothstep(0.25, 0.35, slope + nMid * 0.03)
  const highland = smoothstep(9, 18, h)
  if (highland > 0) rock = Math.max(rock, highland * smoothstep(0.25, 0.45, fbm(x * 0.07 + 5.3, z * 0.07 - 2.1, 3)) * 0.85)

  let dirt = h > water - 0.3 ? smoothstep(0.3, 0.62, 1 - smoothstep(1.0, 3.2, path)) : 0
  let lakeT = 0
  for (const l of LAKES) lakeT = Math.max(lakeT, 1 - smoothstep(l.r + 4, l.r + 10, dist(x, z, l.x, l.z)))
  if (lakeT > 0) dirt = Math.max(dirt, lakeT * (1 - smoothstep(0.25, 0.9, hw)) * 0.85)
  const forestT = 1 - smoothstep(FOREST.r * 0.6, FOREST.r * 1.15, dist(x, z, FOREST.x, FOREST.z))
  if (forestT > 0) dirt = Math.max(dirt, forestT * smoothstep(0.08, 0.32, fbm(x * 0.09 - 7.7, z * 0.09 + 3.1, 3)) * 0.7)

  const sandLine = 1.9 + nMid * 0.6 + fbm(x * 0.21 + 4.4, z * 0.21 - 1.9, 2) * 0.35
  const sand = hw < 0 ? 0 : (1 - smoothstep(sandLine - 0.45, sandLine + 0.3, h)) * (1 - lakeT)

  s.slope = slope
  s.path = path
  s.rock = rock
  s.dirt = (1 - rock) * dirt
  s.sand = (1 - rock) * (1 - dirt) * sand
  s.grass = hw < 0 ? 0 : Math.max(0, 1 - s.rock - s.dirt - s.sand)
  s.lake = lakeT
  return s.grass
}

/** Full evaluation used by the scatter. */
export function evalSite(g: GroundCache, x: number, z: number, s: Site): Site {
  coverAt(g, x, z, s)
  const h = s.h
  s.r = Math.sqrt(x * x + z * z)
  if (s.hw < -0.6) {
    s.forest = s.high = s.coast = s.clump = 0
    s.zone = null
    s.trail = 10
    s.clear = Infinity
    return s
  }
  s.trail = g.trailDist(x, z)
  s.clear = clearance(x, z)
  s.zone = zoneAt(x, z)?.id ?? null

  // Whispering Wood with a ragged edge.
  const fd = dist(x, z, FOREST.x, FOREST.z) + fbm(x * 0.03 + 2.2, z * 0.03 - 5.1, 2) * 9
  s.forest = 1 - smoothstep(FOREST.r * 0.72, FOREST.r * 1.08, fd)

  // Northern highlands, the summit's flanks and the mesa top.
  const north = smoothstep(-66, -92, z) * smoothstep(5, 8, h)
  const sd = dist(x, z, SUMMIT.x, SUMMIT.z)
  const summit = smoothstep(6, 10, h) * (1 - smoothstep(44, 54, sd))
  const mx = Math.abs(x - MESA.x) - MESA.hx
  const mz = Math.abs(z - MESA.z) - MESA.hz
  const mesa = smoothstep(12, 14.5, h) * (1 - smoothstep(-2, 4, Math.max(mx, mz)))
  s.high = Math.max(north, summit, mesa, smoothstep(10, 15, h))

  s.coast = s.water <= 0.001 ? 1 - smoothstep(1.4, 3.2, s.hw) : 0
  s.clump = fbm(x * 0.021 + 7.3, z * 0.021 - 3.9, 3)
  return s
}

/** Ground that nothing should be planted on at all. */
export function offLimits(s: Site, margin: number): boolean {
  return s.r > PLAY_RADIUS - 8 || s.clear < margin
}
