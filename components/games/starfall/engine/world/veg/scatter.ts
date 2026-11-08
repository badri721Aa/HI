/**
 * Placement rules: decides which species grows where across the whole island.
 *
 * Two jittered-grid passes (large: trees & boulders every ~3.4 m, medium:
 * shrubs, ferns, flowers… every ~1.7 m) roll a species per cell from biome
 * weights (see site.ts). Large solids are recorded in a spatial hash so
 * smaller plants keep clear of trunks and rocks. Everything is seeded.
 */
import { fbm, LAKES, smoothstep } from '../heightfield'
import { CLEARINGS, FALLS } from '../level'
import { clearance, type GroundCache } from './ground'
import { hash2, Rng } from './rng'
import { evalSite, newSite, type Site } from './site'

export type SpeciesId =
  | 'oak' | 'linden' | 'pine' | 'palm'
  | 'boulderA' | 'boulderB' | 'rock'
  | 'bush' | 'shrub' | 'fern' | 'mushroom' | 'log' | 'driftwood'
  | 'heather' | 'reed' | 'flower' | 'tallgrass'

export interface Placement {
  x: number
  /** Base height (instance origin). */
  y: number
  z: number
  yaw: number
  /** Local tilts (rad), applied before yaw. */
  rx: number
  rz: number
  sx: number
  sy: number
  sz: number
  /** Primary tint (crown / petals / rock) and secondary tint (trunk). */
  tint: [number, number, number]
  tint2: [number, number, number]
  /** 0..1 — thinned away when rank ≥ the quality density. */
  rank: number
}

export type ScatterResult = Map<SpeciesId, Placement[]>

const LARGE = 3.4
const MEDIUM = 1.7
const HALF = 166
const POOL_CLEARING = CLEARINGS.find(c => c[0] === FALLS.poolX && c[1] === FALLS.poolZ)

/** Cheap spatial hash of solid discs (trunks, boulders, logs). */
class Solids {
  private cells = new Map<number, number[]>()
  private key(i: number, j: number) {
    return (i + 128) * 256 + (j + 128)
  }
  add(x: number, z: number, r: number): void {
    const k = this.key(Math.floor(x / 4), Math.floor(z / 4))
    let list = this.cells.get(k)
    if (!list) this.cells.set(k, (list = []))
    list.push(x, z, r)
  }
  /** True if a disc (x, z, r) comes within `gap` of any recorded solid. */
  hits(x: number, z: number, r: number, gap = 0): boolean {
    const ci = Math.floor(x / 4)
    const cj = Math.floor(z / 4)
    for (let i = ci - 1; i <= ci + 1; i++) {
      for (let j = cj - 1; j <= cj + 1; j++) {
        const list = this.cells.get(this.key(i, j))
        if (!list) continue
        for (let k = 0; k < list.length; k += 3) {
          const dx = list[k] - x
          const dz = list[k + 1] - z
          const m = list[k + 2] + r + gap
          if (dx * dx + dz * dz < m * m) return true
        }
      }
    }
    return false
  }
}

const tint = (r: number, g: number, b: number): [number, number, number] => [r, g, b]

const FLOWER_TINTS: Array<[number, number, number]> = [
  [1, 1, 0.96], // white
  [1, 0.82, 0.28], // buttercup yellow
  [1, 0.58, 0.72], // pink
  [0.52, 0.66, 1], // cornflower blue
  [0.82, 0.62, 1], // lavender
]
const HEATHER_TINTS: Array<[number, number, number]> = [
  [0.78, 0.42, 0.8], [0.86, 0.5, 0.78], [0.66, 0.4, 0.78], [0.92, 0.82, 0.9],
]
const MUSHROOM_TINTS: Array<[number, number, number]> = [
  [0.86, 0.2, 0.13], [0.62, 0.4, 0.25], [0.92, 0.78, 0.58], [0.8, 0.45, 0.2],
]

export async function scatter(g: GroundCache, progress: (f: number) => void): Promise<ScatterResult> {
  const out: ScatterResult = new Map()
  const push = (id: SpeciesId, p: Placement) => {
    let list = out.get(id)
    if (!list) out.set(id, (list = []))
    list.push(p)
  }
  const solids = new Solids()
  const s: Site = newSite()
  const rng = new Rng(2024)
  const yieldNow = () => new Promise<void>(r => setTimeout(r, 0))

  const place = (x: number, y: number, z: number, scale: number, tA: [number, number, number], tB?: [number, number, number]): Placement => ({
    x, y, z, yaw: rng.range(0, Math.PI * 2), rx: 0, rz: 0, sx: scale, sy: scale, sz: scale, tint: tA, tint2: tB ?? tA, rank: rng.next(),
  })

  /* ── large pass: trees and boulders ─────────────────────── */
  const nL = Math.ceil((HALF * 2) / LARGE)
  for (let j = 0; j < nL; j++) {
    for (let i = 0; i < nL; i++) {
      const x = -HALF + (i + 0.1 + rng.next() * 0.8) * LARGE
      const z = -HALF + (j + 0.1 + rng.next() * 0.8) * LARGE
      const roll = rng.next()
      if (x * x + z * z > 160 * 160) continue
      evalSite(g, x, z, s)
      if (s.hw < 0.05 || s.clear < 1.5 || s.trail < 2) continue

      // Boulders: sparse everywhere, more on rock, high ground and the coast.
      const pBoulder = s.path > 3.6 ? 0.006 + 0.1 * s.rock + 0.03 * s.high + 0.05 * s.coast + 0.012 * s.forest : 0
      if (roll < pBoulder) {
        const sc = rng.range(0.55, 1.5) * (1 + s.rock * 0.4)
        const r = 1.1 * sc
        if (s.clear < r + 1 || solids.hits(x, z, r, 0.4)) continue
        const p = place(x, g.minHeight(x, z, r * 0.6), z, sc, rockTint(s, rng))
        p.sx = sc * rng.range(0.85, 1.25)
        p.sz = sc * rng.range(0.85, 1.2)
        p.sy = sc * rng.range(0.8, 1.15)
        p.rx = rng.jitter(0.2)
        p.rz = rng.jitter(0.2)
        push(rng.next() < 0.55 ? 'boulderA' : 'boulderB', p)
        solids.add(x, z, r * 0.85)
        continue
      }
      if (s.slope > 0.26 || s.rock > 0.45) continue

      const beach = s.sand > 0.45 || (s.coast > 0.3 && s.h < 3.8)
      let id: SpeciesId | null = null
      if (beach) {
        if (s.hw > 0.6 && s.h > 0.9 && s.h < 3.9 && s.path > 3.6 && s.clear > 2.5) {
          const pPalm = 0.07 + 0.3 * smoothstep(0.05, 0.45, fbm(x * 0.03 - 4.1, z * 0.03 + 2.6, 2))
          if (roll - pBoulder < pPalm) id = 'palm'
        }
      } else {
        const groves = smoothstep(0.08, 0.32, s.clump)
        let p = 0
        let wPine = 0.1
        if (s.forest > 0) {
          p = 0.06 + s.forest * 0.66
          wPine = 0.22 + 0.3 * smoothstep(24, -6, z)
        } else if (s.high > 0.3) {
          p = s.high * (0.08 + 0.34 * smoothstep(0.02, 0.3, s.clump))
          wPine = 0.9
        } else {
          p = 0.026 + 0.48 * groves
          if (s.zone === 'village') p *= 0.3
          if (s.lake > 0) p += 0.06
          if (s.zone === 'ruins' || s.zone === 'summit') wPine = 0.5
        }
        if (s.grass < 0.35 && s.forest < 0.3) p *= 0.3
        if (roll - pBoulder < p) {
          const r2 = rng.next()
          id = r2 < wPine ? 'pine' : r2 < wPine + (1 - wPine) * 0.58 ? 'oak' : 'linden'
        }
      }
      if (!id) continue
      const crown = id === 'oak' ? 3.4 : id === 'linden' ? 2.8 : 2.4
      if (s.clear < crown || s.path < (id === 'oak' ? 5 : 4.2) || s.trail < 2.5) continue
      const sc = rng.range(0.78, 1.22) * (id === 'pine' && s.high > 0.5 ? rng.range(0.85, 1.15) : 1)
      const trunkR = id === 'palm' ? 0.3 : id === 'pine' ? 0.32 : 0.42
      if (solids.hits(x, z, trunkR * sc, id === 'palm' ? 1.4 : 1.1)) continue
      const p = place(x, g.minHeight(x, z, trunkR * sc * 1.4) - 0.05, z, sc, treeTint(id, s, rng), tint(1 + rng.jitter(0.06), 1 + rng.jitter(0.06), 1 + rng.jitter(0.06)))
      p.sy = sc * rng.range(0.9, 1.12)
      if (id === 'palm') {
        // Palms lean out toward the sea.
        p.yaw = Math.atan2(-z, x) + rng.jitter(0.7)
        p.sy = sc * rng.range(0.85, 1.2)
      }
      push(id, p)
      solids.add(x, z, trunkR * sc)
    }
    if (j % 12 === 11) {
      progress((j / nL) * 0.45)
      await yieldNow()
    }
  }

  /* ── medium pass: undergrowth, flowers, dead wood ───────── */
  const nM = Math.ceil((HALF * 2) / MEDIUM)
  for (let j = 0; j < nM; j++) {
    for (let i = 0; i < nM; i++) {
      const x = -HALF + (i + 0.05 + rng.next() * 0.9) * MEDIUM
      const z = -HALF + (j + 0.05 + rng.next() * 0.9) * MEDIUM
      let roll = rng.next()
      if (x * x + z * z > 160 * 160) continue
      evalSite(g, x, z, s)

      // Reeds ring the lakes, standing in the shallows and on the muddy bank.
      if (s.lake > 0.2 && s.hw > -0.4 && s.hw < 0.55 && s.slope < 0.3 && s.path > 2.8) {
        const inLake = LAKES.some(l => l.level === s.water)
        const patchy = smoothstep(-0.2, 0.3, fbm(x * 0.12 + 1.7, z * 0.12 - 3.3, 2))
        if (inLake && roll < 0.65 * patchy && clearance(x, z, POOL_CLEARING) > 0.5 && s.trail > 1.2) {
          const p = place(x, s.h, z, rng.range(0.8, 1.3), tint(1 + rng.jitter(0.08), 1 + rng.jitter(0.06), 1))
          push('reed', p)
        }
        continue
      }
      if (s.hw < 0.3 || s.clear < 0.6 || s.path < 2.7) continue

      const forest = s.forest
      const meadow = s.grass > 0.55 && forest < 0.5 && s.high < 0.6 ? 1 : 0
      const flowerField = smoothstep(0.05, 0.45, fbm(x * 0.045 - 8.2, z * 0.045 + 5.5, 2))
      const heatherField = smoothstep(-0.1, 0.35, fbm(x * 0.06 + 3.3, z * 0.06 + 9.1, 2))
      const edge = forest * (1 - forest) * 4
      const dunes = s.sand > 0.2 && s.sand < 0.95 && s.h > 1.15 && s.coast < 0.9 ? 1 : 0

      const pReedless: Array<[SpeciesId, number]> = [
        ['fern', forest > 0.25 ? 0.38 * forest : s.zone === 'falls' && s.grass > 0.5 ? 0.12 : 0],
        ['mushroom', forest > 0.4 ? 0.035 : 0],
        ['log', forest > 0.45 ? 0.014 : 0],
        ['bush', s.grass > 0.45 || forest > 0.3 ? 0.016 + 0.05 * forest + 0.03 * s.lake + 0.04 * smoothstep(0.08, 0.35, s.clump) + (s.zone === 'village' ? 0.02 : 0) : 0],
        ['flower', meadow ? 0.012 + 0.1 * flowerField + (s.zone === 'village' ? 0.05 : 0) : 0],
        ['tallgrass', (s.grass > 0.5 ? 0.04 + 0.08 * edge + 0.03 * meadow : 0) + dunes * 0.13],
        ['heather', s.high > 0.3 && s.grass > 0.35 ? 0.3 * s.high * heatherField : 0],
        ['shrub', s.sand > 0.3 && s.h > 1.25 && s.h < 3.6 ? 0.045 : 0],
        ['driftwood', s.sand > 0.6 && s.hw > 0.3 && s.hw < 1.3 && s.water <= 0.001 ? 0.03 : 0],
        ['rock', 0.006 + 0.06 * s.rock + 0.025 * s.coast + 0.02 * s.high + 0.01 * forest],
      ]
      let id: SpeciesId | null = null
      for (const [sid, p] of pReedless) {
        if (roll < p) {
          id = sid
          break
        }
        roll -= p
      }
      if (!id) continue
      if (s.slope > (id === 'rock' ? 0.6 : 0.3)) continue
      const big = id === 'bush' || id === 'log' || id === 'shrub'
      if (big && (s.clear < 1.4 || s.trail < 1.6 || s.path < 3)) continue
      const footprint = id === 'log' ? 0.8 : id === 'bush' ? 0.7 : id === 'driftwood' ? 1.2 : 0.3
      if (solids.hits(x, z, footprint, 0.1)) continue

      let p: Placement
      switch (id) {
        case 'fern':
          p = place(x, s.h, z, rng.range(0.75, 1.35), tint(1 + rng.jitter(0.1), 1 + rng.jitter(0.06), 1 + rng.jitter(0.1)))
          break
        case 'mushroom':
          p = place(x, s.h, z, rng.range(0.8, 1.5), rng.pick(MUSHROOM_TINTS))
          break
        case 'bush': {
          const sc = rng.range(0.75, 1.5)
          p = place(x, g.minHeight(x, z, 0.4 * sc) - 0.04, z, sc, tint(1 + rng.jitter(0.1), 1 + rng.jitter(0.08), 1 + rng.jitter(0.12)))
          p.sy = sc * rng.range(0.8, 1.1)
          break
        }
        case 'shrub':
          p = place(x, s.h, z, rng.range(0.7, 1.2), tint(1 + rng.jitter(0.08), 1, 1))
          break
        case 'flower': {
          const field = hash2(Math.floor(x / 9 + fbm(x * 0.02, z * 0.02, 2) * 3), Math.floor(z / 9), 17)
          const tintIdx = rng.next() < 0.75 ? Math.floor(field * FLOWER_TINTS.length) : rng.int(FLOWER_TINTS.length)
          p = place(x, s.h, z, rng.range(0.8, 1.3), FLOWER_TINTS[tintIdx])
          break
        }
        case 'tallgrass': {
          const dune = dunes && s.grass < 0.5
          p = place(x, s.h, z, rng.range(0.75, 1.3), dune ? tint(1.25, 1.12, 0.75) : tint(0.92 + rng.jitter(0.06), 1 + rng.jitter(0.05), 0.95))
          p.sy *= rng.range(0.85, 1.2)
          break
        }
        case 'heather':
          p = place(x, s.h, z, rng.range(0.8, 1.5), rng.pick(HEATHER_TINTS))
          p.sy *= rng.range(0.8, 1.1)
          break
        case 'driftwood':
          p = place(x, s.h - 0.03, z, rng.range(0.7, 1.2), tint(1, 1, 1))
          break
        case 'log': {
          const sc = rng.range(0.8, 1.15)
          p = place(x, 0, z, sc, tint(1 + rng.jitter(0.08), 1 + rng.jitter(0.06), 1))
          // Lie along the slope: compare the ground under both ends.
          const ax = Math.cos(p.yaw)
          const az = -Math.sin(p.yaw)
          const half = 2 * sc
          const h0 = g.height(x - ax * half, z - az * half)
          const h1 = g.height(x + ax * half, z + az * half)
          p.rz = Math.atan2(h1 - h0, half * 2)
          p.y = Math.min((h0 + h1) / 2, s.h) - 0.08
          if (solids.hits(x - ax * half, z - az * half, 0.45, 0.1) || solids.hits(x + ax * half, z + az * half, 0.45, 0.1)) continue
          break
        }
        default: {
          const sc = rng.range(0.18, 0.5) * (1 + s.rock)
          p = place(x, s.h, z, sc, rockTint(s, rng))
          p.sx = sc * rng.range(0.8, 1.3)
          p.sz = sc * rng.range(0.8, 1.2)
          p.rx = rng.jitter(0.5)
          p.rz = rng.jitter(0.5)
        }
      }
      push(id, p)
      if (id === 'log') solids.add(x, z, 1.8)
      else if (id === 'bush') solids.add(x, z, 0.5 * p.sx)
    }
    if (j % 24 === 23) {
      progress(0.45 + (j / nM) * 0.55)
      await yieldNow()
    }
  }
  progress(1)
  return out
}

function rockTint(s: Site, rng: Rng): [number, number, number] {
  const v = 1 + rng.jitter(0.08)
  // Sandy on the beach, cooler grey up high.
  if (s.coast > 0.5 || s.sand > 0.5) return [1.08 * v, 1.0 * v, 0.9 * v]
  if (s.high > 0.5) return [0.92 * v, 0.95 * v, 0.98 * v]
  return [v, v * 0.98, v * 0.94]
}

function treeTint(id: SpeciesId, s: Site, rng: Rng): [number, number, number] {
  const v = 1 + rng.jitter(0.08)
  const warm = rng.jitter(0.08) + (s.high > 0.4 ? 0.04 : 0)
  switch (id) {
    case 'pine':
      return [0.95 * v + warm * 0.5, v, (1 + rng.jitter(0.08)) * v]
    case 'palm':
      return [v * (1 + warm), v, v * (1 - warm)]
    default: {
      // A few trees in the meadow turn golden.
      const gold = s.forest < 0.4 && rng.next() < 0.08 ? 0.25 : 0
      return [v * (1 + warm + gold), v * (1 + gold * 0.2), v * (1 - warm - gold * 1.4)]
    }
  }
}
