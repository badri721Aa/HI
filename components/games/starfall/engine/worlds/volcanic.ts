/**
 * Ancient Volcanic Ruins: a temple of the old fire-kings on a basalt spur above a sea of lava,
 * at dusk under an ash-red, smoke-banded sky.
 *
 * The way in, south to north (+z is the entrance side; heights are from the arena floor):
 *
 *   gate plaza   −4   paving round the golden arch, framed by a ruined gate of two pylons
 *   bridge       −4   an old stone bridge over the Lava River, its middle span fallen (a jump)
 *   riverside    −4   a podium landing where the guards wait; the river pours off the west
 *                     cliff as a lavafall; a lava cascade runs down the terraces on the east
 *                     from a spout in the temple's retaining wall
 *   two flights  −4 → −1.2 → +1.6, between basalt terraces of hexagonal columns
 *   precinct     +1.6 the temple's forecourt (checkpoint) between two braziers
 *   courtyard    0    sunk 1.6 m in a ring of stepped masonry crowned by broken columns: the
 *                     Iron Titan's arena (floor radius 23 for its 20 m circle and shockwaves);
 *                     a toppled colossal head and fallen drums give a little cover
 *   colossus     +1.65 north of the courtyard, the trunkless legs the head fell from
 *
 * Lava hurts (one heart) and throws the player back out toward safe ground; falling off the
 * spur drops into the lava sea (the kill floor). The lava's light on the rock is a HeatField
 * (no real lights, so no shader recompiles on arrival).
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { BoxOptions, Collider } from '../collision'
import type { Ctx } from '../types'
import type { ZoneKit } from '../world/zones/kit'
import type { MapDef } from './defs'
import { jaggedCone, place, rockGeometry, seeded, slab } from './geo'
import { embers, heatField, heatMaterial, lavaMaterial, lavaPool, lavaRibbon, mergeLava, setHeat, type HeatField, type PathPoint, type TimeUniform } from './lava'
import type { MapBuild } from './registry'
import { annulus, colossusFoot, flutedShaft, hexPrism, lathe, statueHead } from './sculpt'

/** The Iron Titan's circle (m). */
export const VOLCANIC_RADIUS = 20

/** Courtyard floor radius, the stepped ring around it, and the colonnade's radius. */
const FLOOR_R = 23
const TIER_A = 24.4
const TIER_B = 26.05
const COLONNADE_R = 25.2
/** Half-width of the stairs down into the courtyard and the angle the ring opens for them. */
const STAIR_HALF = 2.4
const STAIR_GAP = 0.108
/** The lava: river surface, the sea below, and how far the player sinks in before it bites. */
const RIVER_Y = -5.3
const SEA_Y = -27
const SINK = 0.3
/**
 * The throw out of lava: sideways and up (m/s), then carried on toward the bank for a moment
 * (m/s, s) so a wall of rock in the way can't drop the player straight back in.
 */
const THROW_SIDE = 7
const THROW_UP = 11.5
const THROW_CARRY = 3.5
const THROW_TIME = 0.6

/** The Lava River's centre line, east (its cave) to west (the lip of the lavafall). */
const RIVER: PathPoint[] = [[20, RIVER_Y, 50.6], [12, RIVER_Y, 51], [6, RIVER_Y, 51.6], [0, RIVER_Y, 52], [-6, RIVER_Y, 52.3], [-12, RIVER_Y, 52.8], [-15.2, RIVER_Y, 53]]
/**
 * Its width at each point: it fills its bed from bank to bank (the shelves stand over its edges),
 * narrowing in the cave and at the lip of the fall.
 */
const RIVER_W = [7, 10.4, 10.4, 10.4, 10.4, 9.4, 6.4]
/** The cascade: from the temple's lava spout down the east terraces into the river. */
const CASCADE: PathPoint[] = [[12.7, 0.55, 24.1], [12.7, 0.1, 27.5], [12.5, -0.8, 31], [12.8, -1.7, 35], [12.6, -3.1, 39.5], [12.2, -4.3, 44], [11.6, -5.05, 48], [10.6, RIVER_Y, 50.6]]
const CASCADE_W = [2.6, 3.6, 4.6, 5.4, 5.4, 5.4, 5.6, 5.6]
/** The lavafall: over the west lip and down the cliff into the sea, thinning as it drops. */
const FALL: PathPoint[] = [[-15, RIVER_Y, 53], [-15.9, RIVER_Y - 0.25, 53.05], [-16.8, RIVER_Y - 1.4, 53.1], [-17.4, -9.5, 53.2], [-17.9, -15, 53.3], [-18.3, -21, 53.4], [-18.6, SEA_Y - 0.5, 53.5]]
const FALL_W = [6.4, 6, 5, 4.4]

/** Basalt shelves: [x, z, radius, top, seed]. Tops sit 5 cm under the paving they meet. */
const SHELVES: ReadonlyArray<readonly [number, number, number, number, number]> = [
  // the gate's spur
  [0, 64, 8.5, -4.1, 1], [-7.5, 59, 4.5, -4.12, 2], [7.5, 59.5, 5, -4.12, 3], [0, 57.5, 3, -4.12, 4],
  [-13, 58.5, 4, -4.45, 5], [-12.5, 66.5, 3.6, -4.3, 6], [11.5, 67, 3.4, -3.2, 7],
  // the riverside and the terraces climbing beside the stairs
  [-7, 45, 4.5, -4.1, 10], [7, 45, 4.5, -4.1, 11], [-12.5, 46.5, 3, -4.4, 12],
  [-7, 39.5, 3.6, -2.6, 13], [7, 39.5, 3.6, -2.8, 14],
  [-7, 33.5, 4.2, -1.25, 15], [7, 33.5, 4.2, -1.25, 16], [-12, 36.5, 3, -2.1, 17],
  [-8, 27.5, 3.5, 0.2, 18], [8, 27.5, 3.5, 0.2, 19],
  // rock packed in beside the stairs, by the temple's lava spout and at the river's east bank
  [-3.9, 42.5, 1.5, -4.15, 21], [3.9, 42.5, 1.5, -4.15, 22], [-4.5, 37, 1.5, -2, 23], [4.5, 37, 1.5, -2.2, 24],
  [-4.7, 30.2, 1.6, -0.5, 25], [4.7, 30.2, 1.6, -0.5, 26], [15.3, 22.4, 2, 1.3, 27], [16.3, 25.3, 1.7, 0.9, 28],
  [13.4, 58.2, 2.7, -4.2, 29],
  // the colossus's platform north of the courtyard
  [0, -31, 6.5, 1.6, 20],
]

/** The east crag: tall basalt walls the river leaves and the cascade runs beside. */
const CRAGS: ReadonlyArray<readonly [number, number, number, number, number]> = [
  [20.5, 51.5, 4.6, 6.5, 30], [19, 40.5, 5.4, 5, 31], [18.5, 30.5, 5, 5.5, 32], [20, 22.5, 4.2, 4, 33], [17, 61, 4.5, 3.6, 34],
  [16, 45.8, 2.1, 2.4, 35], [17.7, 56.3, 1.8, 1.6, 36],
]

/**
 * The colonnade: one slot every 18° round the ring (0 = the stairs, 10 = the colossus gap).
 * h: shaft height (0 = none); full columns carry capitals, lintels join neighbours marked so.
 */
const COLUMNS: ReadonlyArray<{ k: number; h: number; lintel?: boolean }> = [
  { k: 1, h: 5.6, lintel: true }, { k: 2, h: 5.6 }, { k: 3, h: 2.6 }, { k: 4, h: 1.1 }, { k: 5, h: 3.8 },
  { k: 6, h: 0.8 }, { k: 7, h: 5.6 }, { k: 8, h: 2.1 }, { k: 9, h: 5.6 }, { k: 11, h: 5.6 }, { k: 12, h: 3.2 },
  { k: 13, h: 1.4 }, { k: 14, h: 5.6 }, { k: 15, h: 2.4 }, { k: 16, h: 0.9 }, { k: 17, h: 4.4 }, { k: 18, h: 5.6, lintel: true }, { k: 19, h: 5.6 },
]

/** Lava shapes the player can stand in, each throwing him toward safe ground. */
interface Burn {
  /** Unit push away from the lava (filled per frame). */
  dir(px: number, pz: number, out: { x: number; z: number }): void
}

export function buildVolcanic(ctx: Ctx, kit: ZoneKit, def: MapDef): MapBuild {
  const { x: cx, y: cy, z: cz } = def.center
  const owned: Array<{ dispose(): void }> = []
  const own = <T extends { dispose(): void }>(o: T): T => {
    owned.push(o)
    return o
  }
  const rnd = seeded(53)
  const uTime: TimeUniform = { value: 0 }
  const low = ctx.quality.level === 'low'
  const solid = (c: Collider) => kit.own(c)
  /** Local (relative to the arena centre) to a placement matrix. */
  const at = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => place(cx + x, cy + y, cz + z, rx, ry, rz, sx, sy, sz)

  /* ── materials ─────────────────────────────────────────── */

  const heat = heatField('#ff7030')
  heat.plane.set(cy + SEA_Y, 12)
  const basalt = own(heatMaterial(ctx, heat, {
    map: 'rock_albedo', color: '#5f5955', roughness: 0.74, gain: 9, saturation: 0.22, fissures: 1,
    triplanar: { scale: 0.21, top: 'dirt_albedo', topScale: 0.28, topColor: '#77706a' },
  }, 'volcanic-basalt'))
  const masonry = own(heatMaterial(ctx, heat, {
    map: 'stone_albedo', normal: 'stone_normal', color: '#ad9c8e', roughness: 0.86, gain: 1.4, saturation: 0.45, ash: 0.55, ashColor: '#5e5853',
  }, 'volcanic-masonry'))
  const carved = own(heatMaterial(ctx, heat, {
    map: 'plaster_albedo', color: '#b3aa9f', roughness: 0.8, gain: 1.6, saturation: 0.3,
    triplanar: { scale: 0.32, top: 'dirt_albedo', topScale: 0.35, topColor: '#6a625b' },
  }, 'volcanic-carved'))
  const floor = own(courtyardFloor(ctx, heat, cx, cz))
  const obsidian = own(new THREE.MeshStandardMaterial({ color: 0x0d0b10, roughness: 0.14, metalness: 0.35, envMapIntensity: 1.6 }))
  const bronze = own(new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.38, metalness: 0.85 }))
  const lava = own(lavaMaterial(ctx, 'flow', uTime))
  const lavaFall = own(lavaMaterial(ctx, 'fall', uTime))
  const lavaSea = own(lavaMaterial(ctx, 'sea', uTime, { origin: { x: cx, z: cz }, crust: '#1e110d', glow: 0.75 }))

  /* ── basalt: shelves, crags, spires ────────────────────── */

  /** Walkable footprints (local x, z, radius): fringes stay flush where ground carries on. */
  const ground: Array<[number, number, number]> = [...SHELVES, ...CRAGS].map(([x, z, r]) => [x, z, r])
  ground.push([0, 0, TIER_B], [0, 64, 7], [-6, 27.5, 2.6], [6, 27.5, 2.6], [-10, 26.2, 2], [10, 26.2, 2])
  for (let z = 30; z <= 57; z += 1.5) ground.push([0, z, 3.4])
  const covered = (x: number, z: number, skip: number) => ground.some(([gx, gz, gr], i) => i !== skip && (x - gx) ** 2 + (z - gz) ** 2 < (gr + 0.3) ** 2)
  const shelf = (x: number, z: number, r: number, top: number, seed: number, idx: number, crag = false) => {
    const thick = 1.4
    kit.add(slab(r, r, thick, Math.max(20, Math.round(r * 6)), 3), basalt, at(x, top - thick / 2, z))
    const depth = top - thick - SEA_Y + 3
    kit.add(jaggedCone(r * 0.97, Math.max(0.8, r * 0.22), depth, seed), basalt, at(x, top - thick, z, 0, seed, 0), { castShadow: false })
    solid(ctx.collision.addCylinder({ x: cx + x, y: cy + top - 14, z: cz + z, r, h: 14, surface: 'rock' }))
    // A fringe of hexagonal columns round the rim: flush where it meets other ground, and taller
    // (a natural parapet, solid) along open cliff edges.
    const n = Math.max(10, Math.round((Math.PI * 2 * r) / 0.82))
    for (let i = 0; i < n; i++) {
      const a = ((i + rnd() * 0.3) / n) * Math.PI * 2
      const rr = r - 0.18
      const px = x + Math.sin(a) * rr
      const pz = z + Math.cos(a) * rr
      const outside = !covered(x + Math.sin(a) * (r + 0.9), z + Math.cos(a) * (r + 0.9), idx)
      const hr = 0.4 + rnd() * 0.12
      const raise = crag ? rnd() * 1.6 - 0.4 : outside && rnd() < 0.3 ? 0.35 + rnd() * 0.75 : -0.04 - rnd() * 0.3
      const len = 3 + rnd() * 5 + (crag ? 6 : 0)
      kit.add(hexPrism(hr, len, (rnd() - 0.5) * 0.1, rnd() * 6), basalt, at(px, top + raise - len, pz, 0, rnd(), 0))
      if (raise > 0.3) solid(ctx.collision.addCylinder({ x: cx + px, y: cy + top - 1, z: cz + pz, r: hr * 0.9, h: raise + 1, surface: 'rock' }))
    }
  }
  SHELVES.forEach(([x, z, r, top, seed], i) => shelf(x, z, r, top, seed, i))
  // The east crag: column clusters standing tall over the cascade and the river's cave.
  CRAGS.forEach(([x, z, r, top, seed], i) => {
    shelf(x, z, r, top, seed, SHELVES.length + i, true)
    for (let k = 0; k < 9; k++) {
      const a = rnd() * Math.PI * 2
      const d = rnd() * (r - 1)
      const h = 2 + rnd() * 4
      const hr = 0.6 + rnd() * 0.25
      const px = x + Math.sin(a) * d
      const pz = z + Math.cos(a) * d
      kit.add(hexPrism(hr, h + 3, (rnd() - 0.5) * 0.12, rnd() * 6), basalt, at(px, top - 3, pz, 0, rnd(), 0))
      solid(ctx.collision.addCylinder({ x: cx + px, y: cy + top - 1, z: cz + pz, r: hr * 0.9, h: h + 1, surface: 'rock' }))
    }
  })
  // Rock spires standing in the lava sea, and far mesas fading into the haze.
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rnd() * 0.4
    const d = 48 + rnd() * 55
    const top = SEA_Y + 14 + rnd() * 26
    const r = 4 + rnd() * 5
    kit.add(jaggedCone(r * 0.35, r, top - SEA_Y + 4, 60 + i), basalt, at(Math.sin(a) * d, top, 20 + Math.cos(a) * d, 0, rnd() * 6, 0), { castShadow: false })
  }
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + rnd() * 0.5
    const d = 135 + rnd() * 40
    const h = 30 + rnd() * 40
    kit.add(jaggedCone(12 + rnd() * 10, 30 + rnd() * 15, h + 10, 80 + i), basalt, at(Math.sin(a) * d, SEA_Y + h, 15 + Math.cos(a) * d, 0, rnd() * 6, 0), { castShadow: false })
  }

  /* ── the gate plaza and the ruined gate ────────────────── */

  const exitZ = def.exit.z - cz
  const plazaY = -4
  kit.add(slab(7, 7, 0.5, 56, 3), masonry, at(0, plazaY - 0.25, 64))
  solid(ctx.collision.addCylinder({ x: cx, y: cy + plazaY - 1, z: cz + 64, r: 7, h: 1, surface: 'stone' }))
  // Pylons either side of the golden arch: the west one whole with a stub of lintel, the east
  // one snapped off; the fallen lintel lies across the plaza's east side.
  const pylon = (x: number, h: number, broken: boolean) => {
    kit.box({ x: cx + x, y: cy + plazaY - 0.2, z: cz + exitZ, w: 2.6, h: 0.8, d: 3, mat: masonry, collide: { surface: 'stone' } })
    kit.box({ x: cx + x, y: cy + plazaY + 0.6, z: cz + exitZ, w: 2.1, h, d: 2.5, mat: masonry, uvScale: 2.5, collide: { surface: 'stone' } })
    // Carved bands.
    for (const y of [1.6, h - 0.6]) {
      if (y < h - 0.3) kit.box({ x: cx + x, y: cy + plazaY + 0.6 + y, z: cz + exitZ, w: 2.3, h: 0.3, d: 2.7, mat: masonry })
    }
    if (broken) {
      for (let i = 0; i < 4; i++) kit.add(rockGeometry(0.45 + rnd() * 0.3, 900 + i), masonry, at(x + (rnd() - 0.5) * 1.4, plazaY + 0.6 + h + 0.1, exitZ + (rnd() - 0.5) * 1.6, rnd(), rnd() * 6, 0, 1, 0.7, 1))
    } else {
      kit.box({ x: cx + x, y: cy + plazaY + 0.6 + h, z: cz + exitZ, w: 2.6, h: 0.55, d: 3, mat: masonry })
    }
  }
  pylon(-4.7, 7.4, false)
  pylon(4.7, 4.6, true)
  kit.box({ x: cx - 3.2, y: cy + plazaY + 8.55, z: cz + exitZ, w: 4.6, h: 1.1, d: 2.2, mat: masonry, uvScale: 2.5 })
  kit.add(rockGeometry(0.6, 910), masonry, at(-0.9, plazaY + 9, exitZ, 0.3, 0.2, 0, 1.2, 1.1, 1.6))
  {
    const yaw = 0.42
    const len = 6.4
    const fx = 6.6
    const fz = 62
    kit.add(new THREE.BoxGeometry(len, 1.1, 2.1), masonry, at(fx, plazaY + 0.75, fz, 0, yaw, 0.18))
    solid(ctx.collision.addBox({ x: cx + fx, y: cy + plazaY + 0.6, z: cz + fz, hx: len / 2, hy: 0.6, hz: 1.05, yaw, surface: 'stone' }))
    for (let i = 0; i < 5; i++) kit.add(rockGeometry(0.3 + rnd() * 0.3, 920 + i), masonry, at(fx - 2 + rnd() * 4, plazaY + 0.15, fz + 1.4 + rnd() * 0.8, rnd(), rnd() * 6, 0))
  }
  // Broken kerb stones round the plaza's rim.
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2
    if (Math.abs(Math.atan2(Math.sin(a - Math.PI), Math.cos(a - Math.PI))) < 0.5) continue // the way north
    if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.55) continue // behind the arch
    if (rnd() < 0.3) continue
    const h = 0.35 + rnd() * 0.5
    kit.box({ x: cx + Math.sin(a) * 6.6, y: cy + plazaY, z: cz + 64 + Math.cos(a) * 6.6, w: 1.5, h, d: 0.6, yaw: a, mat: masonry, collide: { surface: 'stone' } })
  }

  /* ── the bridge, the riverside podium and the stairs ───── */

  const WAY = 2.6
  const block = (x: number, z0: number, z1: number, top: number, w: number, base = top - 5) =>
    kit.box({ x: cx + x, y: cy + base, z: cz + (z0 + z1) / 2, w, h: top - base, d: Math.abs(z1 - z0), mat: masonry, uvScale: 2.5, collide: { surface: 'stone' } })
  // Bridge halves (the middle span lies broken in the river) on piers standing in the lava.
  block(0, 49.3, 51.6, plazaY, 3.4, plazaY - 0.8)
  block(0, 53.4, 57.2, plazaY, 3.4, plazaY - 0.8)
  for (const z of [50.5, 54.6]) kit.box({ x: cx, y: cy + RIVER_Y - 1.5, z: cz + z, w: 2.6, h: plazaY - 0.8 - RIVER_Y + 1.5, d: 1.4, mat: masonry, uvScale: 2.5 })
  for (const [z0, z1] of [[49.6, 51.3], [53.7, 56.4]]) {
    for (const side of [-1, 1]) {
      if (rnd() < 0.2) continue
      kit.box({ x: cx + side * 1.55, y: cy + plazaY, z: cz + (z0 + z1) / 2, w: 0.32, h: 0.45 + rnd() * 0.2, d: z1 - z0 - rnd() * 0.5, mat: masonry, collide: { surface: 'stone' } })
    }
  }
  // The fallen span: blocks half sunk in the lava.
  kit.add(new THREE.BoxGeometry(2.6, 0.8, 1.6), masonry, at(0.6, RIVER_Y + 0.05, 52.4, 0.25, 0.4, 0.15))
  kit.add(new THREE.BoxGeometry(1.4, 0.7, 1.2), masonry, at(-1.6, RIVER_Y, 51.6, -0.3, 0.9, 0.4))
  // The podium landing where the river path begins.
  block(0, 41.7, 49.3, plazaY, WAY * 2)
  // Flight A (−4 → −1.2), the mid landing, flight B (−1.2 → +1.6); cheek walls along both flights.
  const flight = (z0: number, from: number, steps: number) => {
    for (let i = 1; i <= steps; i++) block(0, z0 - (i - 1) * 0.6, z0 - i * 0.6, from + i * 0.4, WAY * 2)
    for (const side of [-1, 1]) {
      for (let i = 1; i <= steps; i += 2) {
        const top = from + Math.min(steps, i + 1) * 0.4 + 0.75
        block(side * (WAY + 0.32), z0 - (i - 1) * 0.6 + 0.02, z0 - Math.min(steps, i + 1) * 0.6, top, 0.64)
      }
    }
    return z0 - steps * 0.6
  }
  const midZ = flight(41.7, plazaY, 7)
  block(0, midZ, 33.7, -1.2, 6.8)
  const precinctZ = flight(33.7, -1.2, 7)

  /* ── the courtyard ─────────────────────────────────────── */

  kit.add(slab(TIER_B, TIER_B, 1.2, 120, 3), floor, at(0, -0.6, 0))
  solid(ctx.collision.addCylinder({ x: cx, y: cy - 6, z: cz, r: TIER_B, h: 6, surface: 'stone' }))
  kit.add(jaggedCone(TIER_B + 0.3, 5, -SEA_Y + 2, 7), basalt, at(0, -1.2, 0), { castShadow: false })
  // The stepped ring (a gap at the south for the stairs) and the precinct sector outside it.
  const ringGap = STAIR_GAP
  kit.add(annulus(FLOOR_R, TIER_A, ringGap, Math.PI * 2 - ringGap, 0, 0.8, 128, 2.5), masonry, at(0, 0, 0))
  kit.add(annulus(TIER_A, TIER_B, ringGap, Math.PI * 2 - ringGap, -1.6, 1.6, 128, 2.5), masonry, at(0, 0, 0))
  const sector = 0.4363
  kit.add(annulus(TIER_B - 0.02, precinctZ, -sector, sector, -4, 1.6, 24, 2.5), masonry, at(0, 0, 0))
  const ringBox = (a: number, r0: number, r1: number, top: number, bottom: number, span: number) => {
    const rm = (r0 + r1) / 2
    const w = 2 * r1 * Math.tan(span / 2) + 0.06
    solid(ctx.collision.addBox({ x: cx + Math.sin(a) * rm, y: cy + (top + bottom) / 2, z: cz + Math.cos(a) * rm, hx: w / 2, hy: (top - bottom) / 2, hz: (r1 - r0) / 2, yaw: a, surface: 'stone' }))
  }
  for (let k = 1; k < 36; k++) {
    const a = (k / 36) * Math.PI * 2
    ringBox(a, FLOOR_R, TIER_A, 0.8, -0.5, Math.PI / 18)
    ringBox(a, TIER_A, TIER_B, 1.6, -0.5, Math.PI / 18)
  }
  for (let k = -2; k <= 2; k++) ringBox(k * 0.1745, TIER_B, precinctZ, 1.6, -4, 0.1745)
  // Stairs down into the courtyard, between cheek walls.
  for (let i = 0; i < 3; i++) {
    const z1 = TIER_B - i * 0.8
    block(0, z1, z1 - 0.8, 1.2 - i * 0.4, STAIR_HALF * 2, -0.5)
  }
  for (const side of [-1, 1]) block(side * (STAIR_HALF + 0.3), FLOOR_R - 0.05, TIER_B + 0.1, 1.6, 0.6, -0.5)

  // The colonnade.
  const shaftGeo = (h: number, broken: number, seed: number) => flutedShaft(0.62, 0.55, h, { flutes: 16, broken, seed, uvScale: 2.2 })
  for (const c of COLUMNS) {
    const a = (c.k / 20) * Math.PI * 2
    const x = Math.sin(a) * COLONNADE_R
    const z = Math.cos(a) * COLONNADE_R
    const full = c.h >= 5.5
    kit.box({ x: cx + x, y: cy + 1.6, z: cz + z, w: 1.45, h: 0.38, d: 1.45, yaw: a, mat: masonry, collide: { surface: 'stone' } })
    kit.add(lathe([[0.74, 0], [0.74, 0.12], [0.64, 0.24], [0.66, 0.3]], 24, { uvScale: 2 }), carved, at(x, 1.98, z))
    kit.add(shaftGeo(c.h, full ? 0 : 0.5, c.k), carved, at(x, 2.26, z, 0, rnd() * 6, 0))
    solid(ctx.collision.addCylinder({ x: cx + x, y: cy + 1.98, z: cz + z, r: 0.66, h: c.h + 0.28, surface: 'stone' }))
    if (full) {
      const top = 2.26 + c.h
      kit.add(lathe([[0.55, 0], [0.62, 0.12], [0.82, 0.38], [0.86, 0.46]], 24, { uvScale: 2 }), carved, at(x, top, z))
      kit.box({ x: cx + x, y: cy + top + 0.46, z: cz + z, w: 1.75, h: 0.36, d: 1.75, yaw: a, mat: masonry })
    } else if (c.h > 1.5) {
      // Its fallen drums lie in front of it, on the tiers.
      for (let i = 0; i < 2; i++) {
        const ra = a + (rnd() - 0.5) * 0.12
        const rr = COLONNADE_R - 1.3 - i * 1.25
        const tier = rr > TIER_A ? 1.6 : rr > FLOOR_R ? 0.8 : 0
        const dx = Math.sin(ra) * rr
        const dz = Math.cos(ra) * rr
        kit.add(flutedShaft(0.6, 0.6, 1.1, { flutes: 16, uvScale: 2.2 }).translate(0, -0.55, 0), carved, at(dx, tier + 0.6, dz, Math.PI / 2, ra + Math.PI / 2 + (rnd() - 0.5) * 0.6, 0))
        solid(ctx.collision.addCylinder({ x: cx + dx, y: cy + tier, z: cz + dz, r: 0.62, h: 1.2, surface: 'stone' }))
      }
    }
  }
  // Lintels across the two pairs flanking the stairs.
  for (const c of COLUMNS) {
    if (!c.lintel) continue
    const a0 = (c.k / 20) * Math.PI * 2
    const a1 = ((c.k + 1) / 20) * Math.PI * 2
    const am = (a0 + a1) / 2
    const r = COLONNADE_R * Math.cos((a1 - a0) / 2)
    const len = 2 * COLONNADE_R * Math.sin((a1 - a0) / 2) + 1.6
    kit.box({ x: cx + Math.sin(am) * r, y: cy + 2.26 + 5.6 + 0.82, z: cz + Math.cos(am) * r, w: len, h: 0.85, d: 1.2, yaw: am, mat: masonry, uvScale: 2.5 })
  }

  // The temple's lava spout: a culvert through the east retaining wall, feeding the cascade.
  {
    const x = cx + 12.7
    kit.box({ x, y: cy - 3, z: cz + 23.4, w: 3.6, h: 4.9, d: 1.6, mat: masonry, uvScale: 2.5, collide: { surface: 'stone' } })
    kit.box({ x, y: cy + 1.9, z: cz + 23.4, w: 4, h: 0.3, d: 1.9, mat: masonry })
    kit.box({ x, y: cy + 0.3, z: cz + 24.2, w: 2.5, h: 1.05, d: 0.08, mat: obsidian })
    kit.box({ x, y: cy + 1.35, z: cz + 24.3, w: 3.1, h: 0.3, d: 0.3, mat: masonry })
    for (const side of [-1, 1]) kit.box({ x: x + side * 1.5, y: cy - 0.6, z: cz + 25, w: 0.4, h: 1.55, d: 1.6, mat: masonry, collide: { surface: 'stone' } })
  }

  // Cover on the floor: a fallen column, two stumps, a capital, and the toppled head.
  {
    const a = Math.atan2(16.5, -3)
    for (let i = 0; i < 3; i++) {
      const d = (i - 1) * 1.35
      const x = 16.5 + Math.cos(a) * d
      const z = -3 - Math.sin(a) * d
      kit.add(flutedShaft(0.62, 0.62, 1.25, { flutes: 16, uvScale: 2.2 }).translate(0, -0.62, 0), carved, at(x, 0.6, z, Math.PI / 2, a + Math.PI / 2 + (rnd() - 0.5) * 0.1, 0))
    }
    solid(ctx.collision.addBox({ x: cx + 16.5, y: cy + 0.6, z: cz - 3, hx: 2.05, hy: 0.6, hz: 0.6, yaw: a + Math.PI / 2, surface: 'stone' }))
  }
  for (const [x, z, h] of [[-12, 11, 1.6], [-11, -12.5, 2.2]] as const) {
    kit.box({ x: cx + x, y: cy, z: cz + z, w: 1.45, h: 0.38, d: 1.45, yaw: x, mat: masonry, collide: { surface: 'stone' } })
    kit.add(shaftGeo(h, 0.45, 40 + x), carved, at(x, 0.38, z, 0, rnd() * 6, 0))
    solid(ctx.collision.addCylinder({ x: cx + x, y: cy, z: cz + z, r: 0.66, h: h + 0.38, surface: 'stone' }))
  }
  kit.add(new THREE.BoxGeometry(1.75, 0.36, 1.75), masonry, at(-17, 0.62, -2, 0.12, 0.6, 0.35))
  kit.add(lathe([[0.55, 0], [0.62, 0.12], [0.82, 0.38], [0.86, 0.46]], 24, { uvScale: 2 }), carved, at(-17.2, 0.1, -1.6, 0.4, 0.6, 1.9))
  solid(ctx.collision.addBox({ x: cx - 17, y: cy + 0.45, z: cz - 2, hx: 0.95, hy: 0.45, hz: 0.95, yaw: 0.6, surface: 'stone' }))
  {
    // The head stands where it fell, its broken neck sunk in the paving, tipped back a little and
    // gazing at whoever comes down the stairs, the setting sun raking across its face.
    const hx = 13.6
    const hz = -16.4
    const s = 1.9
    const head = statueHead(5).applyMatrix4(new THREE.Matrix4().compose(
      new THREE.Vector3(),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.2, Math.atan2(-hx, FLOOR_R - hz), 0.2, 'YXZ')),
      new THREE.Vector3(s, s, s),
    ))
    head.computeBoundingBox()
    const box = head.boundingBox!
    const sink = 0.9
    kit.add(head, carved, at(hx, -box.min.y - sink, hz))
    const top = box.max.y - box.min.y - sink
    solid(ctx.collision.addCylinder({ x: cx + hx, y: cy, z: cz + hz, r: 1.45, h: top * 0.8, surface: 'stone' }))
    for (let i = 0; i < 7; i++) {
      const a = rnd() * Math.PI * 2
      const d = 1.9 + rnd() * 1.6
      kit.add(rockGeometry(0.22 + rnd() * 0.3, 940 + i), carved, at(hx + Math.sin(a) * d, 0.08, hz + Math.cos(a) * d, rnd(), rnd() * 6, 0))
    }
  }

  /* ── the colossus ──────────────────────────────────────── */

  {
    const pz = -32.4
    const top = 1.6
    kit.add(slab(6.5, 6.5, 0.4, 56, 3), masonry, at(0, top - 0.15, -31))
    kit.box({ x: cx, y: cy + top + 0.05, z: cz + pz, w: 8.4, h: 2.3, d: 6, mat: masonry, uvScale: 2.5, collide: { surface: 'stone' } })
    kit.box({ x: cx, y: cy + top + 0.05, z: cz + pz, w: 8.9, h: 0.5, d: 6.5, mat: masonry })
    kit.box({ x: cx, y: cy + top + 2.05, z: cz + pz, w: 8.8, h: 0.35, d: 6.4, mat: masonry })
    const base = top + 2.4
    const s = 1.3
    for (const side of [-1, 1] as const) {
      const x = side * 2.1
      kit.add(colossusFoot(side), carved, at(x, base, pz - 0.3, 0, side * 0.06, 0, s))
      const leg = lathe(
        [[0.74, 0.7], [0.68, 1.3], [0.64, 1.8], [0.72, 2.6], [0.88, 3.5], [0.95, 4.2], [0.88, 5.0], [0.76, 5.8], [0.8, 6.4], [0.88, 7.0], [0.94, 7.6]],
        28,
        {
          uvScale: 2,
          jag: 0.7,
          seed: 70 + side,
          // The calf bulges at the back, the shin is a ridge at the front.
          warp: (p, dx, dz) => {
            const calf = Math.exp(-(((p.y - 3.9) / 0.9) ** 2))
            const back = Math.max(0, -dz)
            p.x += dx * calf * back * 0.12
            p.z -= calf * back * back * 0.2
            p.z += Math.max(0, dz) ** 4 * 0.06
          },
        },
      )
      kit.add(leg, carved, at(x, base, pz - 0.6, 0, 0, side * -0.02, s))
      solid(ctx.collision.addCylinder({ x: cx + x, y: cy + base, z: cz + pz - 0.6, r: 1.05 * s, h: 9.6 * s, surface: 'stone' }))
      solid(ctx.collision.addBox({ x: cx + x, y: cy + base + 0.65, z: cz + pz + 0.9, hx: 0.9 * s, hy: 0.7, hz: 1.7 * s, surface: 'stone' }))
    }
    for (let i = 0; i < 7; i++) kit.add(rockGeometry(0.3 + rnd() * 0.45, 960 + i), carved, at((rnd() - 0.5) * 9, top + 0.15, pz + 3.5 + rnd() * 2.5, rnd(), rnd() * 6, 0))
  }

  /* ── obsidian, rubble and braziers ─────────────────────── */

  const spikes = (x: number, z: number, y: number, n: number, size: number, collide: boolean) => {
    for (let i = 0; i < n; i++) {
      const h = size * (0.6 + rnd() * 0.9)
      const a = rnd() * Math.PI * 2
      const d = rnd() * size * 0.5
      kit.add(facet(new THREE.ConeGeometry(h * 0.16, h, 5).translate(0, h / 2, 0)), obsidian, at(x + Math.sin(a) * d, y - 0.15, z + Math.cos(a) * d, (rnd() - 0.5) * 0.5, rnd() * 6, (rnd() - 0.5) * 0.5))
    }
    if (collide) solid(ctx.collision.addCylinder({ x: cx + x, y: cy + y - 0.2, z: cz + z, r: size * 0.45, h: size * 0.9, surface: 'rock' }))
  }
  spikes(-10.5, 61.5, -4.1, 6, 1.8, true)
  spikes(9.8, 62.8, -4.12, 5, 1.5, true)
  spikes(-9.6, 47, -4.1, 5, 1.6, true)
  spikes(9.8, 44.2, -4.1, 4, 1.4, true)
  spikes(-9.5, 31.8, -1.25, 6, 2, true)
  spikes(-13.4, 36.8, -2.1, 5, 1.7, true)
  spikes(-11, 26.5, 0.2, 4, 1.5, true)
  spikes(10.5, 57.5, -4.12, 4, 1.5, true)
  spikes(-14, 48.3, -4.4, 3, 1.4, true)
  // Rocks and ash on the terraces.
  for (let i = 0; i < 26; i++) {
    const [x, z, r, top] = SHELVES[i % (SHELVES.length - 1)]
    const a = rnd() * Math.PI * 2
    const d = r * (0.45 + rnd() * 0.45)
    kit.add(rockGeometry(0.2 + rnd() * 0.35, 980 + i), basalt, at(x + Math.sin(a) * d, top + 0.05, z + Math.cos(a) * d, rnd(), rnd() * 6, 0, 1, 0.7, 1))
  }
  // Braziers: bronze bowls on tripods, two at the plaza and two at the precinct.
  const fires: Array<[number, number, number]> = [[-2.9, -4.12, 57.8], [2.9, -4.12, 57.8], [-5.2, 1.6, 27], [5.2, 1.6, 27]]
  for (const [x, y, z] of fires) {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2
      kit.add(new THREE.CylinderGeometry(0.05, 0.06, 1.15, 5).translate(0, 0.55, 0), bronze, at(x + Math.sin(a) * 0.32, y, z + Math.cos(a) * 0.32, Math.cos(a) * 0.22, 0, -Math.sin(a) * 0.22))
    }
    kit.add(lathe([[0.18, 0], [0.5, 0.18], [0.64, 0.4], [0.66, 0.46], [0.6, 0.47]], 18), bronze, at(x, y + 0.98, z))
    kit.add(rockGeometry(0.5, 990), basalt, at(x, y + 1.32, z, 0, 0, 0, 1, 0.35, 1))
    solid(ctx.collision.addCylinder({ x: cx + x, y: cy + y, z: cz + z, r: 0.6, h: 1.45, surface: 'metal' }))
  }

  /* ── lava ──────────────────────────────────────────────── */

  const flows = [
    lavaRibbon(RIVER, RIVER_W, 0.55),
    lavaRibbon(CASCADE, CASCADE_W, 1.1, 0.6),
    lavaPool(-7.6, -1.24, 32.6, 1.35),
  ]
  const flowGeo = own(mergeLava(flows))
  const flowMesh = kit.addObject(new THREE.Mesh(flowGeo, lava))
  flowMesh.position.set(cx, cy, cz)
  flowMesh.name = 'lava-flows'
  const fallGeo = own(lavaRibbon(FALL, FALL_W, 4, 0.6, 0.15))
  const fallMesh = kit.addObject(new THREE.Mesh(fallGeo, lavaFall))
  fallMesh.position.set(cx, cy, cz)
  fallMesh.name = 'lavafall'
  const seaGeo = own(new THREE.CircleGeometry(460, 64).rotateX(-Math.PI / 2))
  const sea = kit.addObject(new THREE.Mesh(seaGeo, lavaSea))
  sea.position.set(cx, cy + SEA_Y, cz)
  sea.name = 'lava-sea'
  // The river's bed (piers of rock under the lava), the rocks the lavafall slides over, and the
  // river's cave in the crag.
  for (const [x, seed] of [[-9, 43], [-1.5, 44], [6, 45], [13, 46]]) {
    kit.add(jaggedCone(5.8, 2.2, RIVER_Y - SEA_Y + 2, seed), basalt, at(x, RIVER_Y - 0.3, 52, 0, seed, 0), { castShadow: false })
  }
  kit.add(jaggedCone(3.2, 1.2, 22, 41), basalt, at(-14.2, RIVER_Y - 0.4, 53, 0, 0, 0, 1, 1, 1.4), { castShadow: false })
  kit.add(rockGeometry(3.4, 42, 1), basalt, at(17.8, RIVER_Y + 2.8, 50.6, 0, 0.3, 0, 0.8, 1.2, 1.1))

  // The heat the lava throws on the rock (slots 0–9).
  setHeat(heat, 0, cx - 7, cy + RIVER_Y + 0.4, cz + 52.4, 8.5)
  setHeat(heat, 1, cx + 6, cy + RIVER_Y + 0.4, cz + 51.6, 8.5)
  setHeat(heat, 2, cx - 16.5, cy + RIVER_Y - 2, cz + 53, 9)
  setHeat(heat, 3, cx + 12.6, cy - 0.2, cz + 29, 7)
  setHeat(heat, 4, cx + 12.3, cy - 3.6, cz + 41.5, 7)
  setHeat(heat, 5, cx - 7.6, cy - 0.6, cz + 32.6, 4.5)
  fires.forEach(([x, y, z], i) => setHeat(heat, 6 + i, cx + x, cy + y + 1.8, cz + z, 6))

  // Burning: the river, the cascade and the pool, each throwing the player toward its banks.
  const river: Burn = {
    dir(px, pz, out) {
      const n = nearestOnPath(RIVER, px - cx, pz - cz)
      out.x = n.side * n.nx
      out.z = n.side * n.nz
    },
  }
  const cascade: Burn = {
    dir(_px, _pz, out) {
      out.x = -1
      out.z = 0
    },
  }
  // The pool sits near the west cliff: always toward the stairs.
  const pool: Burn = {
    dir(_px, _pz, out) {
      out.x = 1
      out.z = 0
    },
  }
  const hot = (o: BoxOptions, b: Burn) => solid(ctx.collision.addBox({ ...o, surface: 'rock', tag: 'lava', onStand: () => burn(b) }))
  for (let i = 0; i < RIVER.length - 1; i++) {
    const [ax, , az] = RIVER[i]
    const [bx, , bz] = RIVER[i + 1]
    const len = Math.hypot(bx - ax, bz - az)
    hot({ x: cx + (ax + bx) / 2, y: cy + RIVER_Y - SINK - 0.5, z: cz + (az + bz) / 2, hx: len / 2 + 0.6, hy: 0.5, hz: Math.max(RIVER_W[i], RIVER_W[i + 1]) / 2, yaw: Math.atan2(bx - ax, bz - az) - Math.PI / 2 }, river)
  }
  for (let i = 0; i < CASCADE.length - 1; i++) {
    const [ax, ay, az] = CASCADE[i]
    const [bx, by, bz] = CASCADE[i + 1]
    const len = Math.hypot(bx - ax, bz - az)
    const y = (ay + by) / 2 - SINK
    hot({ x: cx + (ax + bx) / 2, y: cy + y - 0.5, z: cz + (az + bz) / 2, hx: Math.max(CASCADE_W[i], CASCADE_W[i + 1]) / 2, hy: 0.5, hz: len / 2 + 0.2, yaw: Math.atan2(bx - ax, bz - az) }, cascade)
  }
  hot({ x: cx - 7.6, y: cy - 1.25 - 0.45, z: cz + 32.6, hx: 1.1, hy: 0.5, hz: 1.1 }, pool)

  const push = { x: 0, z: 0 }
  const from = { x: 0, y: 0, z: 0 }
  const impulse = { x: 0, y: 0, z: 0 }
  const spark = { x: 0, y: 0, z: 0 }
  let burnCd = 0
  let carry = 0
  /** Lava under the player's feet: one heart, and a throw back toward safe ground. */
  function burn(b: Burn): void {
    const pl = ctx.player
    if (burnCd > 0 || ctx.game.creative || pl.hp <= 0 || !pl.controlEnabled || pl.state === 'dash') return
    burnCd = 0.25
    carry = THROW_TIME
    const p = pl.position
    b.dir(p.x, p.z, push)
    spark.x = p.x
    spark.y = p.y + 0.3
    spark.z = p.z
    ctx.fx.burst('hit', spark, SIZZLE)
    ctx.fx.burst('dust', spark, SMOKE)
    const fresh = !pl.invulnerable
    if (fresh) {
      from.x = p.x - push.x
      from.y = p.y
      from.z = p.z - push.z
      pl.hurt(1, from)
      if (pl.hp <= 0) return
    }
    if (fresh && !ctx.character.ragdolling) pl.launch(THROW_UP)
    else {
      impulse.x = push.x * THROW_SIDE
      impulse.y = THROW_UP
      impulse.z = push.z * THROW_SIDE
      pl.knock(impulse, false)
    }
  }

  /* ── sky and air ───────────────────────────────────────── */

  const dome = own(backdrop(ctx, uTime))
  kit.addObject(dome.mesh).position.set(cx, cy, cz)
  const sparks = own(embers(ctx, Math.round(ctx.quality.particles * (low ? 0.2 : 0.28))))
  kit.addObject(sparks.points)
  const flames = own(brazierFlames(ctx, uTime, fires.map(([x, y, z]) => [cx + x, cy + y + 1.3, cz + z] as const)))
  kit.addObject(flames.mesh)

  return {
    update(dt: number, t: number) {
      uTime.value = t
      heat.time.value = t
      burnCd = Math.max(0, burnCd - dt)
      if (carry > 0) {
        carry -= dt
        // Landed already: the throw is over.
        if (ctx.player.grounded && carry < THROW_TIME - 0.15) carry = 0
        else ctx.player.drift(push.x * THROW_CARRY, push.z * THROW_CARRY)
      }
      sparks.update(t)
      dome.update()
    },
    dispose() {
      for (const o of owned) o.dispose()
    },
  }
}

/* ── helpers ──────────────────────────────────────────────── */

/** Bursts when lava bites (shared option objects: nothing allocated per hit). */
const SIZZLE = { color: '#ff8a2a', scale: 1.3 }
const SMOKE = { color: '#3a2a22', scale: 1.2, count: 5 }

const _near = { nx: 0, nz: 0, side: 1 }

/** The unit normal (in x, z) of the closest segment of a path, and which side of it (x, z) lies on. */
function nearestOnPath(path: readonly PathPoint[], x: number, z: number): { nx: number; nz: number; side: number } {
  let best = Infinity
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, , az] = path[i]
    const [bx, , bz] = path[i + 1]
    const dx = bx - ax
    const dz = bz - az
    const l2 = dx * dx + dz * dz || 1
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2))
    const qx = ax + dx * t - x
    const qz = az + dz * t - z
    const d = qx * qx + qz * qz
    if (d >= best) continue
    best = d
    const l = Math.sqrt(l2)
    _near.nx = -dz / l
    _near.nz = dx / l
    _near.side = (x - ax) * _near.nx + (z - az) * _near.nz >= 0 ? 1 : -1
  }
  return _near
}

/**
 * The courtyard's paving: flagstones laid in rings round a carved sun medallion, with dark
 * grout, stone-to-stone tint, ash drifted against the walls and lava glowing through a few
 * cracks and joints.
 */
function courtyardFloor(ctx: Ctx, heat: HeatField, x: number, z: number): THREE.MeshStandardMaterial {
  const mat = heatMaterial(ctx, heat, {
    map: 'rock_albedo', normal: 'rock_normal', normalScale: 0.6, color: '#d2c3b2', roughness: 0.8, gain: 2.2, saturation: 0.3, ash: 0.35, ashColor: '#5e5853',
  }, 'volcanic-floor')
  const base = mat.onBeforeCompile
  mat.onBeforeCompile = (sh, r) => {
    base(sh, r)
    sh.uniforms.uFloorC = { value: new THREE.Vector2(x, z) }
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec2 uFloorC;\nfloat floorHash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 fp = vHeatW.xz - uFloorC;
        float fr = length(fp);
        float fa = atan(fp.x, abs(fp.x) + abs(fp.y) < 1e-4 ? 1.0 : fp.y);
        float faa = max(fwidth(fr), 1e-3);
        // Rings of flagstones round the medallion, joints staggered ring to ring.
        float rr = max(fr - 4.6, 0.0) / 1.9;
        float ring = floor(rr);
        float rMid = 4.6 + (ring + 0.5) * 1.9;
        float count = max(8.0, floor(6.2831853 * rMid / 2.3));
        float sa = (fa / 6.2831853 + 0.5) * count + ring * 0.37;
        float seg = mod(floor(sa), count);
        float dr = min(fract(rr), 1.0 - fract(rr)) * 1.9;
        float ds = min(fract(sa), 1.0 - fract(sa)) * 6.2831853 * fr / count;
        float joint = fr > 4.6 ? 1.0 - smoothstep(0.035, 0.035 + faa * 1.5, min(dr, ds)) : 0.0;
        // The medallion: carved rings and twelve rays.
        float groove = 0.0;
        if (fr < 4.75) {
          groove = max(groove, 1.0 - smoothstep(0.05, 0.05 + faa * 1.5, abs(fr - 4.6)));
          groove = max(groove, 1.0 - smoothstep(0.045, 0.045 + faa * 1.5, abs(fr - 3.3)));
          groove = max(groove, 1.0 - smoothstep(0.045, 0.045 + faa * 1.5, abs(fr - 1.25)));
          float ray = min(fract(fa / 6.2831853 * 12.0), 1.0 - fract(fa / 6.2831853 * 12.0)) * 6.2831853 * fr / 12.0;
          groove = max(groove, (1.0 - smoothstep(0.05, 0.05 + faa * 1.5, ray)) * step(1.25, fr) * step(fr, 3.3));
        }
        float stone = floorHash(vec2(ring + 3.0, seg + 7.0));
        float tint = fr > 4.6 ? 0.82 + 0.3 * stone : 1.05;
        float scorch = fr > 4.6 ? smoothstep(0.86, 0.97, stone) : 0.0;
        diffuseColor.rgb *= tint * (1.0 - 0.55 * scorch);
        diffuseColor.rgb *= 1.0 - 0.6 * max(joint, groove);
        // Ash drifted against the ring wall.
        diffuseColor.rgb = mix(diffuseColor.rgb, uAshColor, smoothstep(20.5, 22.8, fr) * 0.55);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        // Lava glowing up through some joints and a few cracks (more toward the rim).
        float seep = smoothstep(0.72, 0.84, texture2D(tHeatNoise, vHeatW.xz * 0.021 + 0.4).r) * smoothstep(10.0, 18.0, fr);
        float cn = texture2D(tHeatNoise, vHeatW.xz * 0.022 + 0.7, 2.5).r;
        float cw = max(fwidth(cn) * 1.4, 0.012);
        float crack = (1.0 - smoothstep(0.0, cw, abs(cn - 0.5))) * (0.012 / cw) * smoothstep(0.66, 0.78, texture2D(tHeatNoise, vHeatW.xz * 0.011 + 0.2).r);
        float glow = (joint * seep * 0.8 + crack * smoothstep(7.0, 11.0, fr)) * (0.85 + 0.15 * sin(uHeatTime * 0.8 + cn * 9.0));
        totalEmissiveRadiance += uHeatColor * glow * 1.2;`,
      )
  }
  mat.customProgramCacheKey = () => 'starfall-heat-volcanic-floor'
  return mat
}

const DOME_VS = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

/**
 * The far distance painted on a dome: ridges of hazy mountains all round, two volcanoes (the
 * great one due north, behind the colossus) with glowing craters, lava rivulets and smoke
 * plumes leaning in the wind, and slow bands of ash smoke across the sky.
 */
const DOME_FS = /* glsl */ `
uniform float uTime;
uniform sampler2D tNoise;
uniform vec3 uFog;
varying vec3 vDir;
float dn(vec2 p) { return texture2D(tNoise, p).r; }
// One volcano (base half-width w in azimuth radians, peak height h in sin elevation): x = its
// glow (crater lip, a few lava rivulets snaking down), y = how much of this pixel it covers.
vec2 volcano(float az, float el, float az0, float w, float h, float seed) {
  float x = az - az0;
  x = atan(sin(x), cos(x)) / w;
  float ax = abs(x);
  float y = (el + 0.03) / h;
  if (ax >= 1.0 || y > 1.0) return vec2(0.0);
  float top = (1.0 - pow(min(ax, 1.0), 0.6)) * 0.97 + (dn(vec2(x * 0.9 + seed, 0.37)) - 0.5) * 0.05;
  top = min(top, 0.88 + smoothstep(0.05, 0.14, ax) * 0.06);
  float inside = 1.0 - smoothstep(top - 0.01, top + 0.01, y);
  float drop = clamp(1.0 - y / 0.9, 0.0, 1.0);
  float riv = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float x0 = (fi - 1.0) * 0.06 + (seed - 0.5) * 0.04;
    float xi = x0 * (1.0 + drop * 3.5) + 0.035 * sin(drop * 9.0 + fi * 2.1 + seed * 5.0) * drop;
    float wid = 0.01 + drop * 0.012;
    float len = 0.35 + 0.3 * fract(seed * 7.0 + fi * 0.37);
    riv += (1.0 - smoothstep(wid * 0.35, wid, abs(x - xi))) * (1.0 - smoothstep(len * 0.6, len, drop));
  }
  float lip = (1.0 - smoothstep(0.0, 0.14, ax)) * smoothstep(0.8, 0.88, y);
  return vec2((min(riv, 1.0) * 0.75 + lip * 1.4) * inside, inside);
}
void main() {
  vec3 d = normalize(vDir);
  float az = atan(d.x, abs(d.x) + abs(d.z) < 1e-5 ? 1.0 : d.z);
  float el = d.y;
  // Below the horizon nothing (the lava sea is there).
  if (el < -0.07) discard;
  float u = az / 6.2831853;
  float t = uTime;
  vec3 col = vec3(0.0);
  float a = 0.0;
  // Smoke bands drifting across the sky.
  if (el > 0.02 && el < 0.75) {
    float band = dn(vec2(u * 2.0 + t * 0.0012, el * 1.3 + 0.2)) * 0.6 + dn(vec2(u * 5.0 - t * 0.002, el * 3.0)) * 0.4;
    float smoke = smoothstep(0.48, 0.78, band) * smoothstep(0.02, 0.12, el) * (1.0 - smoothstep(0.35, 0.75, el));
    col = mix(vec3(0.22, 0.06, 0.03), vec3(0.06, 0.03, 0.03), smoothstep(0.05, 0.4, el));
    a = smoke * 0.75;
  }
  // Far ridges, then nearer ones, darker (none reach above 0.14).
  float far = 0.0;
  float near = 0.0;
  if (el < 0.14) {
    float r1 = 0.03 + 0.07 * dn(vec2(u * 3.0, 0.11)) + 0.03 * dn(vec2(u * 11.0, 0.53));
    float r2 = 0.005 + 0.05 * dn(vec2(u * 5.0 + 0.5, 0.71)) + 0.02 * dn(vec2(u * 17.0, 0.29));
    far = 1.0 - smoothstep(r1 - 0.004, r1 + 0.004, el);
    near = 1.0 - smoothstep(r2 - 0.003, r2 + 0.003, el);
  }
  vec3 farCol = uFog * 0.62;
  vec3 nearCol = uFog * 0.36;
  col = mix(col, farCol, far);
  a = max(a, far);
  // The volcanoes, in front of the far ridge: the great one due north, two lesser ones.
  vec2 v1 = volcano(az, el, 3.14159, 0.3, 0.21, 0.2);
  vec2 v2 = volcano(az, el, 2.3, 0.2, 0.13, 0.7);
  vec2 v3 = volcano(az, el, -2.05, 0.16, 0.1, 0.45);
  float vin = max(max(v1.y, v2.y), v3.y);
  col = mix(col, uFog * 0.34, vin);
  a = max(a, vin);
  col += vec3(1.0, 0.3, 0.05) * (v1.x + v2.x * 0.8 + v3.x * 0.7) * 1.6;
  col = mix(col, nearCol, near);
  a = max(a, near);
  // Plumes leaning east from the two big craters, lit from below by the glow in them.
  for (int i = 0; i < 2; i++) {
    float az0 = i == 0 ? 3.14159 : 2.3;
    float base = i == 0 ? 0.155 : 0.085;
    float hgt = max(el - base, 0.0);
    float x = az - az0;
    x = atan(sin(x), cos(x)) + hgt * 1.3;
    float wdt = 0.03 + hgt * 0.8;
    float p = 0.0;
    if (abs(x) < wdt && el > base - 0.004 && hgt < 0.5) {
      float body = 1.0 - smoothstep(0.35, 1.0, abs(x) / wdt);
      float puff = dn(vec2(x * 3.0 + float(i) * 0.4, hgt * 2.0 - t * 0.01));
      p = body * smoothstep(0.32, 0.62, puff) * (1.0 - smoothstep(0.22, 0.5, hgt));
    }
    vec3 pc = mix(vec3(0.85, 0.24, 0.05), vec3(0.08, 0.045, 0.045), smoothstep(0.0, 0.06, hgt));
    col = mix(col, pc, p * 0.92);
    a = max(a, p * 0.92);
    float halo = exp(-(x * x) / (0.004 + hgt * 0.02)) * exp(-hgt * 14.0) * (1.0 - p);
    halo *= smoothstep(base - 0.03, base, el);
    col += vec3(0.9, 0.25, 0.05) * halo * 0.5;
    a = max(a, halo * 0.4);
  }
  // A dull glow along the horizon where the lava sea meets the haze.
  float horizon = exp(-abs(el + 0.01) * 40.0);
  col += vec3(0.5, 0.12, 0.03) * horizon * 0.5;
  a = max(a, horizon * 0.35);
  a *= smoothstep(-0.06, -0.035, el);
  gl_FragColor = vec4(clamp(col, 0.0, 3.0), clamp(a, 0.0, 1.0));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

/** The painted distance (see DOME_FS); `update` keeps its haze matched to the live fog colour. */
function backdrop(ctx: Ctx, uTime: TimeUniform): { mesh: THREE.Mesh; update(): void; dispose(): void } {
  const geo = new THREE.SphereGeometry(430, 64, 32)
  // Its own plain bilinear sampler on the noise image: every lookup here is a band along one
  // axis, which the shared texture's anisotropic mip filtering would make many times dearer
  // (and would draw a seam where the azimuth wraps, due north).
  const noise = ctx.textures.get('noise').clone()
  noise.anisotropy = 1
  noise.generateMipmaps = false
  noise.minFilter = THREE.LinearFilter
  noise.needsUpdate = true
  const mat = new THREE.ShaderMaterial({
    vertexShader: DOME_VS,
    fragmentShader: DOME_FS,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    fog: false,
    uniforms: { uTime, tNoise: { value: noise }, uFog: { value: new THREE.Color('#5a2414') } },
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.name = 'volcanic-dome'
  mesh.renderOrder = -1
  mesh.frustumCulled = false
  const fogColor = mat.uniforms.uFog.value as THREE.Color
  return {
    mesh,
    update() {
      const fog = ctx.scene.fog as THREE.Fog | null
      if (fog) fogColor.copy(fog.color)
    },
    dispose() {
      geo.dispose()
      mat.dispose()
      noise.dispose()
    },
  }
}

const FLAME_VS = /* glsl */ `
varying vec2 vUv;
varying float vSeed;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vSeed = fract((wp.x + wp.z) * 0.137);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`

/** A soft tongue of fire on a quad (uv.y up), licking upward; no strobing, just moving shapes. */
const FLAME_FS = /* glsl */ `
uniform float uTime;
uniform sampler2D tNoise;
varying vec2 vUv;
varying float vSeed;
void main() {
  float t = mod(uTime, 100.0);
  float n = texture2D(tNoise, vec2(vUv.x * 0.5 + vSeed, vUv.y * 0.45 - t * 0.6)).r;
  float n2 = texture2D(tNoise, vec2(vUv.x * 0.9 - vSeed, vUv.y * 0.8 - t * 1.1)).r;
  float y = vUv.y;
  float x = (vUv.x - 0.5) * 2.0 + (n - 0.5) * 0.5 * y;
  float width = (1.0 - y) * (0.85 - 0.25 * y) + 0.05;
  float body = 1.0 - smoothstep(width * 0.55, width, abs(x));
  body *= smoothstep(0.0, 0.08, y) * (1.0 - smoothstep(0.55 + n2 * 0.35, 1.0, y));
  float core = (1.0 - smoothstep(0.0, width * 0.6, abs(x))) * (1.0 - smoothstep(0.1, 0.55, y));
  vec3 c = mix(vec3(1.0, 0.3, 0.05), vec3(1.0, 0.68, 0.26), core) * (0.95 + core * 1.0);
  float a = clamp(body, 0.0, 1.0);
  if (a < 0.01) discard;
  gl_FragColor = vec4(c * a, a);
}`

/** Fires on the braziers: two crossed quads each, one draw for all. */
function brazierFlames(ctx: Ctx, uTime: TimeUniform, spots: ReadonlyArray<readonly [number, number, number]>): { mesh: THREE.Mesh; dispose(): void } {
  const parts: THREE.BufferGeometry[] = []
  for (const [x, y, z] of spots) {
    for (let i = 0; i < 2; i++) {
      const q = new THREE.PlaneGeometry(0.8, 1.25).translate(0, 0.62, 0).rotateY(i * (Math.PI / 2) + 0.4).translate(x, y, z)
      parts.push(q)
    }
  }
  const geo = mergeGeometries(parts, false)
  for (const q of parts) q.dispose()
  if (!geo) throw new Error('volcanic: flame merge failed')
  const mat = new THREE.ShaderMaterial({
    vertexShader: FLAME_VS,
    fragmentShader: FLAME_FS,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime, tNoise: { value: ctx.textures.get('noise') } },
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.name = 'brazier-flames'
  mesh.renderOrder = 4
  return {
    mesh,
    dispose() {
      geo.dispose()
      mat.dispose()
    },
  }
}

/** Flat facets (a crystal look) for a smooth primitive. */
function facet(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const flat = g.toNonIndexed()
  g.dispose()
  flat.computeVertexNormals()
  return flat
}
