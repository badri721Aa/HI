/**
 * Starfall Isle — the island's shape, as pure math.
 *
 * Everything that needs the ground (terrain mesh, collision, vegetation scatter,
 * prop placement, camera) reads it from here, so the world can never disagree
 * with itself. Units are metres, +Y up, +X east, +Z south (north is -Z).
 *
 * This file is dependency-free on purpose (no three.js) so it can also run in
 * Node for offline previews.
 */

/* ────────────────────────────────────────────────────────────
   Noise (seeded gradient noise + fbm)
   ──────────────────────────────────────────────────────────── */

const PERM = new Uint8Array(512)
const GRAD_X = new Float32Array(256)
const GRAD_Y = new Float32Array(256)
;(() => {
  let s = 0x5f3759df
  const rnd = () => {
    s = (s + 0x6d2b79f5) | 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const p = new Uint8Array(256)
  for (let i = 0; i < 256; i++) p[i] = i
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    const t = p[i]
    p[i] = p[j]
    p[j] = t
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255]
  for (let i = 0; i < 256; i++) {
    const a = rnd() * Math.PI * 2
    GRAD_X[i] = Math.cos(a)
    GRAD_Y[i] = Math.sin(a)
  }
})()

/** 2D gradient noise in roughly [-1, 1]. */
export function noise2(x: number, y: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const X = xi & 255
  const Y = yi & 255
  const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10)
  const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10)
  const g = (ix: number, iy: number, dx: number, dy: number) => {
    const h = PERM[PERM[ix] + iy]
    return GRAD_X[h] * dx + GRAD_Y[h] * dy
  }
  const n00 = g(X, Y, xf, yf)
  const n10 = g(X + 1, Y, xf - 1, yf)
  const n01 = g(X, Y + 1, xf, yf - 1)
  const n11 = g(X + 1, Y + 1, xf - 1, yf - 1)
  const nx0 = n00 + u * (n10 - n00)
  const nx1 = n01 + u * (n11 - n01)
  return (nx0 + v * (nx1 - nx0)) * 1.42
}

export function fbm(x: number, y: number, octaves = 4, lacunarity = 2.03, gain = 0.5): number {
  let sum = 0
  let amp = 0.5
  let freq = 1
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise2(x * freq + i * 17.13, y * freq - i * 9.71)
    norm += amp
    amp *= gain
    freq *= lacunarity
  }
  return sum / norm
}

/** Ridged multifractal — sharp crests for rocky ground. */
export function ridged(x: number, y: number, octaves = 4): number {
  let sum = 0
  let amp = 0.5
  let freq = 1
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(noise2(x * freq + i * 31.7, y * freq + i * 11.3))
    sum += amp * n * n
    norm += amp
    amp *= 0.5
    freq *= 2.1
  }
  return sum / norm
}

/* ────────────────────────────────────────────────────────────
   Small math helpers
   ──────────────────────────────────────────────────────────── */

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}
export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1)
  return t * t * (3 - 2 * t)
}
function smin(a: number, b: number, k: number): number {
  const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1)
  return lerp(b, a, h) - k * h * (1 - h)
}
function smax(a: number, b: number, k: number): number {
  return -smin(-a, -b, k)
}
/** Distance from P to segment AB in the XZ plane. */
export function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const abx = bx - ax
  const abz = bz - az
  const l2 = abx * abx + abz * abz
  const t = l2 > 0 ? clamp(((px - ax) * abx + (pz - az) * abz) / l2, 0, 1) : 0
  const dx = ax + abx * t - px
  const dz = az + abz * t - pz
  return Math.sqrt(dx * dx + dz * dz)
}
/** Signed distance to an axis-aligned rectangle (negative inside). */
function rectSdf(px: number, pz: number, cx: number, cz: number, hx: number, hz: number): number {
  const dx = Math.abs(px - cx) - hx
  const dz = Math.abs(pz - cz) - hz
  const ox = Math.max(dx, 0)
  const oz = Math.max(dz, 0)
  return Math.sqrt(ox * ox + oz * oz) + Math.min(Math.max(dx, dz), 0)
}

/* ────────────────────────────────────────────────────────────
   World constants & map layout
   ──────────────────────────────────────────────────────────── */

/** Sea level. Falling below SEA_LEVEL - 0.6 in open sea means a respawn. */
export const SEA_LEVEL = 0
/** Terrain mesh covers [-WORLD_HALF, WORLD_HALF] on X and Z. */
export const WORLD_HALF = 200
/** The island's playable radius; an invisible wall stops the player beyond it. */
export const PLAY_RADIUS = 168

export type ZoneId = 'beach' | 'village' | 'forest' | 'ruins' | 'lake' | 'falls' | 'summit' | 'cove'

export interface Zone {
  id: ZoneId
  name: string
  x: number
  z: number
  r: number
}

/** Named areas, used for the HUD zone label, music moods and scatter density. */
export const ZONES: Zone[] = [
  { id: 'beach', name: 'Sunset Beach', x: 0, z: 124, r: 32 },
  { id: 'village', name: 'Meadow Village', x: 4, z: 52, r: 30 },
  { id: 'forest', name: 'Whispering Wood', x: -84, z: 24, r: 40 },
  { id: 'ruins', name: 'Sky Ruins', x: 86, z: 8, r: 30 },
  { id: 'lake', name: 'Mirror Lake', x: 62, z: -66, r: 30 },
  { id: 'falls', name: 'Silver Falls', x: -64, z: -56, r: 32 },
  { id: 'summit', name: 'Beacon Summit', x: 0, z: -60, r: 34 },
  { id: 'cove', name: 'Wreck Cove', x: 98, z: 80, r: 28 },
]

export function zoneAt(x: number, z: number): Zone | null {
  let best: Zone | null = null
  let bestD = Infinity
  for (const zn of ZONES) {
    const d = Math.hypot(x - zn.x, z - zn.z) / zn.r
    if (d < 1 && d < bestD) {
      bestD = d
      best = zn
    }
  }
  return best
}

/** Inland water bodies with their own surface height. */
export interface Lake {
  id: string
  x: number
  z: number
  r: number
  level: number
}

export const LAKES: Lake[] = [
  { id: 'mirror', x: 62, z: -66, r: 19, level: 0 },
  { id: 'pool', x: -64, z: -42, r: 9, level: 0 },
]

/** Dirt paths as polylines [x, z][]. Terrain is gently levelled under them. */
export const PATHS: Array<Array<[number, number]>> = [
  // beach → village → summit
  [[2, 116], [4, 96], [2, 76], [4, 56], [0, 34], [-2, 10], [0, -12], [-4, -30]],
  // village → forest
  [[-6, 50], [-30, 42], [-52, 34], [-70, 28]],
  // village → ruins
  [[14, 46], [38, 38], [58, 26], [70, 16]],
  // ruins → lake
  [[80, -8], [76, -30], [68, -46]],
  // summit foot → falls
  [[-6, -30], [-28, -34], [-50, -34]],
  // beach → cove along the shore
  [[18, 118], [50, 110], [78, 100], [96, 90]],
]

/** The north-west mesa the waterfall drops from. */
const MESA = { x: -66, z: -68, hx: 20, hz: 14, top: 16 }
/** Ruins plateau. */
const RUINS = { x: 88, z: 6, r: 17, top: 8 }
/** Village flat. */
const VILLAGE = { x: 4, z: 52, r: 24, h: 3.4 }
/** Summit cone. */
const SUMMIT = { x: 0, z: -60, r: 52, top: 22.5, plateau: 9 }

/* ────────────────────────────────────────────────────────────
   Height
   ──────────────────────────────────────────────────────────── */

function pathInfluence(x: number, z: number): number {
  let d = Infinity
  for (const p of PATHS) {
    for (let i = 0; i < p.length - 1; i++) {
      const s = segDist(x, z, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1])
      if (s < d) d = s
    }
  }
  return d
}

/** Raw height before path/lake carving — exported for tools only. */
function baseHeight(x: number, z: number): number {
  const r = Math.hypot(x, z)
  const warp = fbm(x * 0.008 + 3.1, z * 0.008 - 1.7, 3) * 20 + fbm(x * 0.03, z * 0.03, 2) * 5
  const d = r + warp
  // The north coast is a wall of sea cliffs; the south is all beach.
  const north = smoothstep(-50, -125, z)
  const island = smoothstep(158, lerp(122, 150, north), d)
  let h = lerp(-10, 1.2, island)
  // Rolling interior, rising toward the northern cliffs
  const interior = smoothstep(lerp(132, 152, north), lerp(88, 118, north), d)
  h += interior * (2.4 + fbm(x * 0.016, z * 0.016, 4) * 3.4 + north * 9)
  // Wide sandy beaches: keep the outer band low and flat (not under the cliffs)
  const shore = smoothstep(108, 130, d) * (1 - north)
  h = lerp(h, Math.min(h, 1.1 + fbm(x * 0.05, z * 0.05, 2) * 0.4), shore * 0.85)

  // Summit: a broad grassy cone with a flat crown and a rocky ridge
  {
    const ds = Math.hypot(x - SUMMIT.x, z - SUMMIT.z)
    const t = 1 - smoothstep(SUMMIT.plateau, SUMMIT.r, ds)
    const cone = SUMMIT.top * Math.pow(t, 1.35)
    const rock = ridged(x * 0.05, z * 0.05, 3) * 3.2 * t * (1 - t) * 4
    const feature = lerp(-30, cone + rock * 0.6 + 1.5, smoothstep(0, 0.35, t))
    h = smax(h, feature, 4)
  }

  // Mesa with steep walls (falls)
  {
    const sd = rectSdf(x, z, MESA.x, MESA.z, MESA.hx, MESA.hz) + fbm(x * 0.06, z * 0.06, 3) * 3
    const wall = 1 - smoothstep(-2, 3.5, sd)
    const top = MESA.top + fbm(x * 0.04, z * 0.04, 3) * 1.6
    h = smax(h, lerp(h, top, wall), 2)
    // Western ramp up onto the mesa
    const ramp = segDist(x, z, -104, -44, -88, -66)
    const rampT = 1 - smoothstep(4, 9, ramp)
    const along = clamp((-44 - z) / 22, 0, 1)
    h = lerp(h, Math.max(h, 2 + along * (MESA.top - 2)), rampT)
  }

  // Ruins plateau with terraced edges
  {
    const dr = Math.hypot(x - RUINS.x, z - RUINS.z) + fbm(x * 0.07, z * 0.07, 2) * 2.5
    const t = 1 - smoothstep(RUINS.r - 4, RUINS.r + 6, dr)
    const feature = lerp(-30, RUINS.top + 1.2, t)
    h = smax(h, feature, 3)
    // Ramp from the village path up onto the plateau (west side)
    const ramp = segDist(x, z, 62, 19, 84, 7)
    const rampT = 1 - smoothstep(4, 8, ramp)
    const along = smoothstep(61, 76, x)
    h = lerp(h, Math.max(h, 3 + along * (RUINS.top + 1.2 - 3)), rampT)
  }

  // Village: levelled meadow
  {
    const dv = Math.hypot(x - VILLAGE.x, z - VILLAGE.z)
    const t = 1 - smoothstep(VILLAGE.r * 0.55, VILLAGE.r, dv)
    h = lerp(h, VILLAGE.h + fbm(x * 0.05, z * 0.05, 2) * 0.35, t)
  }

  // Forest: soft mounds
  {
    const df = Math.hypot(x + 84, z - 24)
    const t = 1 - smoothstep(20, 46, df)
    h += t * (ridged(x * 0.03, z * 0.03, 3) * 3.5)
  }

  // Wreck cove: a sheltered sandy bay
  {
    const dc = Math.hypot(x - 104, z - 86)
    const t = 1 - smoothstep(10, 30, dc)
    h = lerp(h, Math.min(h, -1.4 + dc * 0.09), t)
  }

  // Sunset Beach: a long, gentle sand slope into the sea
  {
    const t = (1 - smoothstep(30, 52, Math.abs(x))) * smoothstep(98, 114, z)
    const target = lerp(2.1, -1.2, smoothstep(110, 150, z)) + fbm(x * 0.04, z * 0.04, 2) * 0.25
    h = lerp(h, target, t)
  }
  return h
}

// Lake surfaces sit a little below the ground they're carved into.
for (const l of LAKES) {
  let lowest = Infinity
  for (let a = 0; a < 32; a++) {
    const ang = (a / 32) * Math.PI * 2
    lowest = Math.min(lowest, baseHeight(l.x + Math.cos(ang) * (l.r + 5), l.z + Math.sin(ang) * (l.r + 5)))
  }
  l.level = Math.round((lowest - 0.45) * 10) / 10
}

/** Terrain height at (x, z). Fast enough to call thousands of times per frame. */
export function heightAt(x: number, z: number): number {
  let h = baseHeight(x, z)

  // Lakes: carve smooth bowls below their surface level
  for (const l of LAKES) {
    const d = Math.hypot(x - l.x, z - l.z) + fbm(x * 0.09, z * 0.09, 2) * 2
    if (d < l.r + 10) {
      const bowl = l.level - 2.4 * (1 - smoothstep(0, l.r, d)) - 0.3
      const t = 1 - smoothstep(l.r - 2, l.r + 8, d)
      h = lerp(h, Math.min(h, bowl), t)
    }
  }

  // Paths: slight levelling and wear
  const pd = pathInfluence(x, z)
  if (pd < 3.5) {
    const t = 1 - smoothstep(1.2, 3.5, pd)
    h -= t * 0.12
  }
  return h
}

/** Surface normal by central differences. Writes into `out` ([x, y, z]). */
export function normalAt(x: number, z: number, out: [number, number, number] = [0, 1, 0]): [number, number, number] {
  const e = 0.5
  const hl = heightAt(x - e, z)
  const hr = heightAt(x + e, z)
  const hd = heightAt(x, z - e)
  const hu = heightAt(x, z + e)
  let nx = hl - hr
  let ny = 2 * e
  let nz = hd - hu
  const len = Math.hypot(nx, ny, nz)
  nx /= len
  ny /= len
  nz /= len
  out[0] = nx
  out[1] = ny
  out[2] = nz
  return out
}

/** 0 = flat, 1 = vertical. */
export function slopeAt(x: number, z: number): number {
  const n = normalAt(x, z)
  return 1 - n[1]
}

/** 1 on the centre of a path, fading to 0 by ~3 m away. */
export function pathWeight(x: number, z: number): number {
  return 1 - smoothstep(1.0, 3.2, pathInfluence(x, z))
}

/** Highest water surface at (x, z), or -Infinity if none. */
export function waterLevelAt(x: number, z: number): number {
  let lvl = SEA_LEVEL
  for (const l of LAKES) {
    if (Math.hypot(x - l.x, z - l.z) < l.r + 6) lvl = Math.max(lvl, l.level)
  }
  return lvl
}

export type Surface = 'grass' | 'sand' | 'dirt' | 'rock' | 'stone' | 'wood' | 'water' | 'leaves' | 'metal' | 'snow' | 'ice'

/** What the ground is made of at (x, z) — drives splat textures and footstep sounds. */
export function surfaceAt(x: number, z: number): Surface {
  const h = heightAt(x, z)
  if (h < waterLevelAt(x, z) - 0.05) return 'water'
  if (slopeAt(x, z) > 0.32) return 'rock'
  if (pathWeight(x, z) > 0.5) return 'dirt'
  if (h < 1.9 + fbm(x * 0.05, z * 0.05, 2) * 0.6) return 'sand'
  return 'grass'
}
