/**
 * Floating Sky Isles: grassy islands adrift above a sea of clouds in the late morning, their
 * rock undersides tapering to points, vines and roots trailing in the wind, springs spilling
 * over their edges into the clouds.
 *
 * The way in, south to north (+z is the entrance side; heights are from the arena's lawn):
 *
 *   arrival isle  +4    the golden arch on a paved landing, looking out over the whole chain
 *   rope bridge         down to the falls isle
 *   falls isle    +2.5  where the guards wait; its spring pours off the west rim
 *   stepping stones     three floating rocks across to the gate isle
 *   gate isle     +1.2  the checkpoint; two more stones lead east to the lone tree's isle (+2.2)
 *   rope bridge         down through the shrine's gate
 *   main isle     0     a meadow ringed by the standing stones of an old wind shrine: the
 *                       Vortex Weaver's arena (lawn radius 25 for its 19 m circle, open sky above)
 *
 * Falling off anywhere drops into the cloud sea (the kill floor). Grass, flowers, trees and vines
 * are the island's own plants (same geometry and shaders), bent by a stronger wind.
 */
import * as THREE from 'three'
import type { Collider } from '../collision'
import type { Ctx } from '../types'
import { card, Geo, Leaf, tube, type Vec3 } from '../world/veg/geo'
import { createVegMaterial, createVegUniforms } from '../world/veg/materials'
import { buildBroadleaf, buildBush, buildFlowers, buildPine, buildTallGrass, OAK, type TreeGeometry } from '../world/veg/species'
import type { ZoneKit } from '../world/zones/kit'
import type { MapDef } from './defs'
import { place, rockGeometry, seeded, slab } from './geo'
import {
  cloudSea, isleChunk, isleMaterial, isleTop, isleUnder, mergeParts, puffMaterial, waterDisc, waterMaterial, waterRibbon,
  windMaterial, windRibbon, type CloudLook, type PathPoint, type TimeUniform,
} from './isle'
import type { MapBuild } from './registry'
import { annulus, lathe } from './sculpt'

/** The Vortex Weaver's circle (m); the lawn reaches 6 m further. */
export const SKY_RADIUS = 19

/** The cloud sea's mean height and how far its billows rise and fall around it. */
const CLOUD_Y = -43
const CLOUD_AMP = 4.5
/** The wind's heading (unit, xz): trees lean and vines trail this way. */
const WIND_X = 0.864
const WIND_Z = 0.503
/** Toward the sun: the map's light in world/env/atmosphere.ts. */
const SUN = new THREE.Vector3(0.35, 0.72, 0.6).normalize()

/** Walkable ground, as discs: [x, top, z, radius, depth of rock below, seed]. Lobes share their isle's top. */
type Disc = readonly [number, number, number, number, number, number]
const ISLES: readonly Disc[] = [
  // the main isle and its lobes
  [0, 0, 0, 25, 33, 1], [-21, 0, -14, 8, 15, 2], [19, 0, -17, 9, 17, 3], [22, 0, 9, 6.5, 12, 4], [-20, 0, 14, 7, 13, 5],
  // the gate isle
  [10, 1.2, 38, 7, 12, 6], [14.5, 1.2, 42, 4, 7, 7],
  // the falls isle
  [-13, 2.5, 56, 9.5, 16, 8], [-20, 2.5, 60, 5, 9, 9], [-9, 2.5, 49.5, 5, 9, 10],
  // the arrival isle
  [0, 4, 82, 7.5, 13, 11], [-5, 4, 77, 4.2, 7.5, 12],
  // the lone tree's isle
  [29, 2.2, 52, 5.5, 10, 13],
]

/** Stepping stones: [x, top, z, radius, seed]. */
const STONES: ReadonlyArray<readonly [number, number, number, number, number]> = [
  // falls isle → gate isle
  [-2.81, 2.15, 46.34, 1.25, 21], [-0.66, 1.8, 43.75, 1.25, 22], [2.59, 1.5, 42.96, 1.25, 23],
  // gate isle → the lone tree
  [19.66, 1.55, 45.56, 1.3, 24], [22.6, 1.9, 47.59, 1.3, 25],
]

/** Rope bridges: from (x, y, z) to (x, y, z), each end just inside an isle's rim. */
const BRIDGES: ReadonlyArray<readonly [number, number, number, number, number, number]> = [
  [-6.39, 4, 73.35, -9.72, 2.5, 64.6],
  [8.3, 1.2, 31.52, 6.27, 0, 23.88],
]
const BRIDGE_W = 2

/** Isles out of reach, for the view: [x, top, z, radius, depth, seed]. */
const FAR: readonly Disc[] = [
  [-64, 9, -26, 11, 19, 31], [60, -8, -46, 13, 22, 32], [72, 13, 34, 8, 14, 33], [-78, -11, 48, 10, 17, 34],
  [-34, 17, -88, 9, 15, 35], [40, 5, -98, 14, 24, 36], [98, -5, -8, 9, 15, 37], [-104, 4, -22, 12, 20, 38],
  [-50, -16, 96, 8, 13, 39], [52, 10, 104, 10, 16, 40],
]

/** Springs: [pond x, z, isle top, rim x, z], the water running from the pond over that point of the rim. */
const SPRINGS: ReadonlyArray<readonly [number, number, number, number, number]> = [
  [-19.5, 53, 2.5, -22.2, 52.7],
  [22, -19, 0, 27.7, -19.6],
  [-23.5, -16.5, 0, -28.3, -17.6],
]
const POND_R = 1.7

/** The shrine: its gate stands where the bridge lands; nine more places follow round the ring. */
const GATE_ANGLE = 0.257
const RING_R = 21.9
type Stone = { kind: 'mono' | 'tri' | 'stump'; h: number }
const RING: readonly Stone[] = [
  { kind: 'mono', h: 3.6 }, { kind: 'tri', h: 3.8 }, { kind: 'stump', h: 1.4 }, { kind: 'mono', h: 4.4 }, { kind: 'tri', h: 4.6 },
  { kind: 'mono', h: 3.2 }, { kind: 'stump', h: 1.9 }, { kind: 'tri', h: 3.8 }, { kind: 'mono', h: 4 },
]

/** Trees: [variant (0, 1: oaks; 2, 3: pines), x, top, z, scale, solid]. */
const TREES: ReadonlyArray<readonly [number, number, number, number, number, boolean]> = [
  [0, -22, 0, -11, 0.75, true], [2, 23, 0, -12, 0.7, true], [1, 22.5, 0, 10.5, 0.6, true], [3, -21.5, 0, 16, 0.65, true],
  [1, -8.5, 2.5, 59.5, 0.7, true], [2, 4.6, 4, 84.6, 0.6, true], [0, 29.6, 2.2, 52.4, 1, true], [3, 13.6, 1.2, 35.4, 0.5, true],
  [0, -66, 9, -27, 0.9, false], [2, -60, 9, -22, 0.8, false], [1, 62, -8, -44, 1, false], [3, 74, 13, 35, 0.75, false],
  [1, -80, -11, 46, 0.85, false], [2, 42, 5, -96, 1, false], [0, 36, 5, -102, 0.8, false], [3, -106, 4, -20, 0.9, false],
]

const FLOWER_TINTS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 1, 1], [1, 0.86, 0.3], [1, 0.62, 0.78], [0.62, 0.74, 1], [0.86, 0.66, 1],
]

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** A copy of a tree turned by `yaw` and bent downwind: it leans, and its crown streams out like a flag. */
function windBent(tree: TreeGeometry, yaw: number, lean: number): TreeGeometry {
  const bend = (g: THREE.BufferGeometry) => {
    g.rotateY(yaw)
    const pos = g.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i)
      if (y <= 0) continue
      const d = pos.getX(i) * WIND_X + pos.getZ(i) * WIND_Z
      const w = smooth(tree.trunkHeight - 1, tree.trunkHeight + 1.5, y)
      const push = lean * y * y + w * (d > 0 ? 0.4 * d : -0.3 * d)
      pos.setXYZ(i, pos.getX(i) + WIND_X * push, y - w * 0.1 * Math.max(0, d), pos.getZ(i) + WIND_Z * push)
    }
    g.computeBoundingSphere()
    g.computeBoundingBox()
    return g
  }
  return { trunk: bend(tree.trunk), crown: bend(tree.crown), trunkRadius: tree.trunkRadius, trunkHeight: tree.trunkHeight }
}

/** Flat facets (weathered stone reads better without smoothed edges). */
function faceted(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const flat = g.index ? g.toNonIndexed() : g
  if (flat !== g) g.dispose()
  flat.computeVertexNormals()
  return flat
}

export function buildSky(ctx: Ctx, kit: ZoneKit, def: MapDef): MapBuild {
  const { x: cx, y: cy, z: cz } = def.center
  const owned: Array<{ dispose(): void }> = []
  const own = <T extends { dispose(): void }>(o: T): T => {
    owned.push(o)
    return o
  }
  const rnd = seeded(29)
  const uTime: TimeUniform = { value: 0 }
  const low = ctx.quality.level === 'low'
  const solid = (c: Collider) => kit.own(c)
  /** Local (relative to the arena centre) to a placement matrix. */
  const at = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => place(cx + x, cy + y, cz + z, rx, ry, rz, sx, sy, sz)
  /** The same with the turn applied before the tilt (planks pitching along a bridge). */
  const euler = new THREE.Euler(0, 0, 0, 'YXZ')
  const pose = new THREE.Matrix4()
  const quat = new THREE.Quaternion()
  const vec = new THREE.Vector3()
  const one = new THREE.Vector3(1, 1, 1)
  const scale = new THREE.Vector3()
  /** Every InstancedMesh made here (their instance buffers are freed on leaving). */
  const instanced: THREE.InstancedMesh[] = []
  const instances = (geo: THREE.BufferGeometry, mat: THREE.Material, count: number) => {
    const mesh = kit.addObject(new THREE.InstancedMesh(geo, mat, count))
    mesh.frustumCulled = false
    instanced.push(mesh)
    return mesh
  }
  const turned = (x: number, y: number, z: number, pitch: number, yaw: number, roll: number) =>
    pose.compose(vec.set(cx + x, cy + y, cz + z), quat.setFromEuler(euler.set(pitch, yaw, roll)), one)

  /* ── materials ─────────────────────────────────────────── */

  const ground = own(isleMaterial(ctx))
  const paving = kit.mat('stone', { color: '#d8d2c4', key: 'sky-paving' })
  const monolithMat = kit.mat('stone', { color: '#c9c3b6', roughness: 0.96, key: 'sky-monolith' })
  const mossy = kit.mat('mossStone', { color: '#a7b98c', key: 'sky-mossy' })
  const rune = kit.mat('glow', { color: '#e8fbff', emissive: '#7fe8ff', emissiveIntensity: 1.3, key: 'sky-rune' })
  const pondBed = kit.mat('rock', { color: '#5c6f78', key: 'sky-pond' })
  const planks = kit.mat('planks', { color: '#c9b89a', key: 'sky-planks' })
  const rope = kit.mat('rope')
  const post = kit.mat('bark', { color: '#b9a892', key: 'sky-post' })

  /* ── the isles ─────────────────────────────────────────── */

  const isle = ([x, top, z, r, depth, seed]: Disc, walkable: boolean) => {
    kit.add(isleTop(r, seed), ground, at(x, top, z), { castShadow: false })
    kit.add(isleUnder(r, depth, seed + 100), ground, at(x, top, z), { castShadow: false })
    const h = Math.min(5, depth * 0.8)
    if (walkable) solid(ctx.collision.addCylinder({ x: cx + x, y: cy + top - h, z: cz + z, r, h, surface: 'grass' }))
  }
  for (const d of ISLES) isle(d, true)
  for (const d of FAR) isle(d, false)
  for (const [x, top, z, r, seed] of STONES) isle([x, top, z, r, r * 2.4, seed], true)

  /** Height of the walkable ground at a local point (−Infinity off the isles), `margin` in from every rim. */
  const lawn = (x: number, z: number, margin: number) => {
    let top = -Infinity
    for (const [ix, itop, iz, r] of ISLES) if ((x - ix) ** 2 + (z - iz) ** 2 < (r - margin) ** 2) top = Math.max(top, itop)
    return top
  }
  /** Places plants keep clear of: [x, z, radius]. */
  const clear: Array<[number, number, number]> = [[0, 0, 4.9], [0, 85.4, 3.2]]

  /* ── rope bridges ──────────────────────────────────────── */

  for (const [ax, ay, az, bx, by, bz] of BRIDGES) {
    const dx = bx - ax
    const dz = bz - az
    const len = Math.hypot(dx, dz)
    const yaw = Math.atan2(dx, dz)
    const ux = dx / len
    const uz = dz / len
    const n = Math.round(len / 0.56)
    const sag = len * 0.035
    const deck = (t: number) => ay + (by - ay) * t - sag * 4 * t * (1 - t)
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n
      const y = deck(t)
      const slope = (deck(t + 0.02) - deck(t - 0.02)) / (len * 0.04)
      const w = BRIDGE_W - rnd() * 0.16
      kit.add(new THREE.BoxGeometry(w, 0.08, 0.44), planks, turned(ax + dx * t, y - 0.04, az + dz * t, -Math.atan(slope), yaw + (rnd() - 0.5) * 0.07, (rnd() - 0.5) * 0.05))
      solid(ctx.collision.addBox({ x: cx + ax + dx * t, y: cy + y - 0.2, z: cz + az + dz * t, hx: BRIDGE_W / 2, hy: 0.2, hz: len / n / 2 + 0.04, yaw, surface: 'wood' }))
    }
    for (const side of [-1, 1]) {
      const ox = uz * side
      const oz = -ux * side
      const line = (off: number, lift: number, radius: number) => {
        const pts: THREE.Vector3[] = []
        for (let i = 0; i <= 12; i++) {
          const t = i / 12
          pts.push(new THREE.Vector3(cx + ax + dx * t + ox * off, cy + deck(t) + lift, cz + az + dz * t + oz * off))
        }
        kit.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, radius, 5), rope, undefined, { castShadow: false })
      }
      line(BRIDGE_W / 2 + 0.06, 0.95, 0.035)
      line(BRIDGE_W / 2 - 0.14, -0.1, 0.045)
      // Hangers from the hand rope down to the deck.
      for (let i = 1; i < n; i += 2) {
        const t = i / n
        kit.cylinder({ x: cx + ax + dx * t + ox * (BRIDGE_W / 2 + 0.06), y: cy + deck(t) - 0.06, z: cz + az + dz * t + oz * (BRIDGE_W / 2 + 0.06), r: 0.016, h: 1.01, segments: 4, mat: rope, castShadow: false })
      }
      // A post at each end.
      for (const [px, py, pz] of [[ax, ay, az], [bx, by, bz]]) {
        const x = cx + px + ox * (BRIDGE_W / 2 + 0.06)
        const z = cz + pz + oz * (BRIDGE_W / 2 + 0.06)
        kit.cylinder({ x, y: cy + py - 0.4, z, r: 0.13, rTop: 0.1, h: 1.5, segments: 8, mat: post, collide: { surface: 'wood' } })
        kit.cylinder({ x, y: cy + py + 1.1, z, r: 0.15, h: 0.08, segments: 8, mat: rope })
      }
    }
    clear.push([ax, az, 1.9], [bx, bz, 1.9])
  }

  /* ── the wind shrine on the main isle ──────────────────── */

  // The dais at its heart, a rune ring set in it, and the worn ring that marks the Weaver's circle.
  kit.add(slab(4.4, 4.4, 0.3, 48, 2), paving, at(0, -0.11, 0), { castShadow: false })
  kit.add(annulus(3.0, 3.22, 0, Math.PI * 2, 0, 0.055, 64), rune, at(0, 0, 0), { castShadow: false })
  for (let i = 0; i < 8; i++) {
    const a0 = (i / 8) * Math.PI * 2 + 0.06 + rnd() * 0.1
    const a1 = ((i + 1) / 8) * Math.PI * 2 - 0.06 - rnd() * 0.16
    kit.add(annulus(SKY_RADIUS - 0.9, SKY_RADIUS, a0, a1, -0.2, 0.035, 12), paving, at(0, 0, 0), { castShadow: false })
  }
  // Flagstones from the gate to the dais.
  for (let d = 6; d < 22.5; d += 1.45) {
    const a = GATE_ANGLE + (rnd() - 0.5) * 0.05
    kit.add(slab(0.55 + rnd() * 0.2, 0.6, 0.2, 7, 1.5), paving, at(Math.sin(a) * d, -0.065, Math.cos(a) * d, 0, rnd() * 6, 0), { castShadow: false })
  }

  /** A standing stone: tapered, a little twisted, its top either worn flat or snapped off. */
  const monolith = (x: number, top: number, z: number, h: number, w: number, yaw: number, seed: number, jag: number) => {
    const g = lathe([[w, -0.3], [w * 1.05, h * 0.1], [w * 0.92, h * 0.6], [w * 0.76, h]], 6, {
      uvScale: 1.7, jag, seed,
      warp: p => {
        p.z *= 0.6
        p.x += Math.sin(p.y * 0.8 + seed) * 0.07
      },
    })
    kit.add(faceted(g), monolithMat, at(x, top, z, 0, yaw, 0))
    solid(ctx.collision.addCylinder({ x: cx + x, y: cy + top - 0.3, z: cz + z, r: w * 0.8, h: h + 0.3 - jag * 0.5, surface: 'stone' }))
    clear.push([x, z, w + 0.5])
  }
  /** Two stones carrying a lintel, facing the middle. */
  const trilithon = (a: number, r: number, h: number, half: number, seed: number) => {
    const mx = Math.sin(a) * r
    const mz = Math.cos(a) * r
    for (const s of [-1, 1]) monolith(mx + Math.cos(a) * half * s, 0, mz - Math.sin(a) * half * s, h, 0.72, a, seed + s, 0.1)
    kit.box({ x: cx + mx, y: cy + h - 0.06, z: cz + mz, w: half * 2 + 1.7, h: 0.72, d: 1.05, yaw: a, mat: monolithMat, uvScale: 1.7 })
  }
  trilithon(GATE_ANGLE, 23.3, 4.7, 1.95, 300)
  RING.forEach((st, i) => {
    const a = GATE_ANGLE + ((i + 1) / (RING.length + 1)) * Math.PI * 2
    const x = Math.sin(a) * RING_R
    const z = Math.cos(a) * RING_R
    if (st.kind === 'tri') trilithon(a, RING_R, st.h, 1.7, 310 + i * 3)
    else monolith(x, 0, z, st.h, st.kind === 'mono' ? 0.8 : 0.85, a + (rnd() - 0.5) * 0.3, 310 + i * 3, st.kind === 'mono' ? 0.25 : 0.7)
    if (st.kind !== 'stump') return
    // What broke off lies in the grass beside it.
    const fa = a + 0.16
    const fx = Math.sin(fa) * (RING_R + 1)
    const fz = Math.cos(fa) * (RING_R + 1)
    const yaw = a + 1.1
    kit.add(faceted(new THREE.BoxGeometry(2.6, 0.7, 1)), mossy, at(fx, 0.28, fz, 0.05, yaw, 0.06))
    solid(ctx.collision.addBox({ x: cx + fx, y: cy + 0.3, z: cz + fz, hx: 1.3, hy: 0.33, hz: 0.5, yaw, surface: 'stone' }))
    clear.push([fx, fz, 1.6])
  })

  // The arrival isle: paving under the golden arch and stones leading to the bridge.
  const exitX = def.exit.x - cx
  const exitY = (def.exit.y ?? cy) - cy
  const exitZ = def.exit.z - cz
  kit.add(slab(3, 3, 0.3, 28, 2), paving, at(exitX, exitY - 0.11, exitZ - 0.6), { castShadow: false })
  for (let i = 1; i <= 6; i++) {
    const t = i / 7
    kit.add(slab(0.5 + rnd() * 0.2, 0.55, 0.2, 7, 1.5), paving, at(exitX + (BRIDGES[0][0] - exitX) * t + (rnd() - 0.5) * 0.4, exitY - 0.065, exitZ - 3.4 + (BRIDGES[0][2] - exitZ + 3.4) * t, 0, rnd() * 6, 0), { castShadow: false })
  }
  for (const s of [-1, 1]) monolith(exitX + s * 3.3, exitY, exitZ + 0.4, 2.1 + rnd() * 0.8, 0.5, 0.2 * s, 340 + s, 0.4)
  // The shrine's marker on the gate isle, and a cairn by the lone tree.
  monolith(12.8, 1.2, 39.6, 2.4, 0.55, 0.9, 350, 0.3)
  monolith(26.6, 2.2, 53.9, 1.5, 0.5, 2.2, 352, 0.5)

  /* ── springs and waterfalls ────────────────────────────── */

  const water: THREE.BufferGeometry[] = []
  const fall = (x: number, y: number, z: number, ox: number, oz: number, width: number) => {
    const bottom = CLOUD_Y - 2
    const path: PathPoint[] = [[x - ox * 0.5, y, z - oz * 0.5], [x + ox * 0.35, y - 0.05, z + oz * 0.35], [x + ox * 0.9, y - 0.9, z + oz * 0.9]]
    for (let k = 1; k <= 5; k++) {
      const f = k / 5
      path.push([x + ox * (0.9 + f * 0.9), y - 0.9 + (bottom - y + 0.9) * f, z + oz * (0.9 + f * 0.9)])
    }
    water.push(waterRibbon(path, [width, width, width * 1.05, width * 1.2, width * 1.5, width * 1.9, width * 2.3, width * 2.6], 0.8))
  }
  for (const [px, pz, top, rx, rz] of SPRINGS) {
    const len = Math.hypot(rx - px, rz - pz)
    const ox = (rx - px) / len
    const oz = (rz - pz) / len
    kit.add(slab(POND_R + 0.1, POND_R - 0.2, 0.2, 18, 2), pondBed, at(px, top - 0.07, pz), { castShadow: false })
    water.push(waterDisc(cx + px, cy + top + 0.06, cz + pz, POND_R))
    water.push(waterRibbon([[cx + px + ox * (POND_R - 0.5), cy + top + 0.055, cz + pz + oz * (POND_R - 0.5)], [cx + rx - ox * 0.3, cy + top + 0.05, cz + rz - oz * 0.3]], [1.1, 1.1], 0.5))
    fall(cx + rx, cy + top + 0.05, cz + rz, ox, oz, 1.1)
    // Mossy stones round the pond, open where the water leaves.
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2 + rnd() * 0.2
      if (Math.sin(a) * ox + Math.cos(a) * oz > 0.8) continue
      const s = 0.26 + rnd() * 0.2
      kit.add(rockGeometry(s, 400 + i), mossy, at(px + Math.sin(a) * (POND_R + 0.15), top + s * 0.25, pz + Math.cos(a) * (POND_R + 0.15), rnd(), rnd() * 6, 0))
    }
    clear.push([px, pz, POND_R + 0.8], [(px + rx) / 2, (pz + rz) / 2, 1.2], [rx, rz, 1.2])
  }
  // Far isles shed water too.
  for (const k of [0, 1, 5, 7]) {
    const [x, top, z, r] = FAR[k]
    const a = k * 1.9 + 0.6
    fall(cx + x + Math.sin(a) * (r - 0.2), cy + top + 0.05, cz + z + Math.cos(a) * (r - 0.2), Math.sin(a), Math.cos(a), 1.6)
  }
  const waterGeo = own(mergeParts(water))
  const waterMat = own(waterMaterial(ctx, uTime, cy + CLOUD_Y + 1, '#5fb4d6'))
  const waterMesh = kit.addObject(new THREE.Mesh(waterGeo, waterMat))
  waterMesh.renderOrder = 2
  waterMesh.name = 'sky:water'

  /* ── the cloud sea and the cumulus rising from it ──────── */

  const cloudLook: CloudLook = { lit: '#ffffff', shade: '#a9bcd8', deep: '#7f97bd', sun: SUN }
  const sea = own(cloudSea(ctx, uTime, cx, cy + CLOUD_Y, cz, CLOUD_AMP, cloudLook))
  kit.addObject(sea.mesh)
  const puffGeo = own(new THREE.IcosahedronGeometry(1, low ? 2 : 3))
  const puffMat = own(puffMaterial(ctx, uTime, cloudLook, ctx.env.fogColor))
  const puffs: Array<[number, number, number, number, number, number]> = []
  const towers = low ? 7 : 12
  for (let i = 0; i < towers; i++) {
    const a = ((i + rnd() * 0.6) / towers) * Math.PI * 2
    const d = 120 + rnd() * 190
    const r0 = 17 + rnd() * 13
    let x = Math.sin(a) * d
    let z = Math.cos(a) * d + 20
    let y = CLOUD_Y + r0 * 0.15
    puffs.push([x, y, z, r0 * 1.35, r0 * 0.6, r0 * 1.35])
    const stack = 4 + Math.floor(rnd() * 4)
    for (let k = 0; k < stack; k++) {
      const r = r0 * (0.8 - (k / stack) * 0.45) * (0.8 + rnd() * 0.4)
      x += (rnd() - 0.5) * r0 * 0.8
      z += (rnd() - 0.5) * r0 * 0.8
      y += r * (0.45 + rnd() * 0.3)
      puffs.push([x, y, z, r, r * 0.82, r])
    }
  }
  // Low billows nearer by break up the sheet.
  for (let i = 0; i < (low ? 6 : 12); i++) {
    const a = rnd() * Math.PI * 2
    const d = 62 + rnd() * 70
    const r = 6 + rnd() * 7
    puffs.push([Math.sin(a) * d, CLOUD_Y + r * 0.1, Math.cos(a) * d + 25, r * 1.5, r * 0.6, r * 1.5])
  }
  const puffMesh = instances(puffGeo, puffMat, puffs.length)
  puffs.forEach(([x, y, z, sx, sy, sz], i) => puffMesh.setMatrixAt(i, at(x, y, z, 0, rnd() * 6, 0, sx, sy, sz)))
  puffMesh.name = 'sky:cumulus'

  /* ── plants ────────────────────────────────────────────── */

  const veg = createVegUniforms()
  veg.uVegWind.value.set(WIND_X, 1.5, WIND_Z)
  const bark = createVegMaterial(ctx.textures, veg, { kind: 'bark', name: 'sky-bark', roughness: 0.95 })
  const leaf = createVegMaterial(ctx.textures, veg, { kind: 'leaf', name: 'sky-leaf', translucency: 0.6, roughness: 0.8 })
  const plant = createVegMaterial(ctx.textures, veg, { kind: 'plant', name: 'sky-plant', translucency: 0.45, push: 0.3, roughness: 0.85 })
  for (const m of [bark, leaf, plant]) {
    own(m.material)
    if (m.depth) own(m.depth)
  }
  const tint = new THREE.Color()
  /** An instanced batch of one plant geometry; `fill` places instance i and returns its tint. */
  const batch = (geo: THREE.BufferGeometry, mat: typeof bark, count: number, shadows: boolean, fill: (i: number) => THREE.Color) => {
    const mesh = instances(own(geo), mat.material, count)
    for (let i = 0; i < count; i++) {
      const c = fill(i)
      mesh.setMatrixAt(i, pose)
      mesh.setColorAt(i, c)
    }
    mesh.castShadow = shadows
    mesh.receiveShadow = true
    if (shadows && mat.depth) mesh.customDepthMaterial = mat.depth
    return mesh
  }
  /** Fills `pose` for a plant standing at a local point. */
  const stand = (x: number, y: number, z: number, yaw: number, s: number) => pose.compose(vec.set(cx + x, cy + y, cz + z), quat.setFromEuler(euler.set(0, yaw, 0)), scale.setScalar(s))

  // Wind-bent trees: two oaks and two pines, each bent from a different side.
  const lod = low ? 1 : 0
  const variants = [windBent(buildBroadleaf(OAK, lod), 0.4, 0.04), windBent(buildBroadleaf(OAK, lod), 2.9, 0.05), windBent(buildPine(lod), 1.2, 0.022), windBent(buildPine(lod), 4.1, 0.028)]
  variants.forEach((tree, v) => {
    const list = TREES.filter(t => t[0] === v)
    const fill = (i: number) => {
      const [, x, top, z, s] = list[i]
      stand(x, top - 0.05, z, 0, s)
      return tint.setRGB(0.96 + rnd() * 0.1, 0.98 + rnd() * 0.06, 0.94 + rnd() * 0.08)
    }
    batch(tree.trunk, bark, list.length, true, fill)
    batch(tree.crown, leaf, list.length, true, fill)
    for (const [, x, top, z, s, hard] of list) {
      if (!hard) continue
      solid(ctx.collision.addCylinder({ x: cx + x, y: cy + top - 0.3, z: cz + z, r: Math.max(0.25, tree.trunkRadius * s), h: tree.trunkHeight * s + 0.3, surface: 'wood', tag: 'tree' }))
      clear.push([x, z, 0.9])
    }
  })

  /** `count` random spots on the lawns (denser on bigger isles), clear of stones, paths and ponds. */
  const spots = (count: number, margin: number, accept: (x: number, z: number) => boolean) => {
    const out: Array<[number, number, number]> = []
    const total = ISLES.reduce((s, d) => s + d[3] * d[3], 0)
    for (let tries = 0; out.length < count && tries < count * 12; tries++) {
      let pick = rnd() * total
      let d = ISLES[0]
      for (const k of ISLES) {
        d = k
        pick -= k[3] * k[3]
        if (pick <= 0) break
      }
      const a = rnd() * Math.PI * 2
      const r = Math.sqrt(rnd()) * (d[3] - margin)
      const x = d[0] + Math.sin(a) * r
      const z = d[2] + Math.cos(a) * r
      if (lawn(x, z, margin * 0.5) !== d[1] || !accept(x, z)) continue
      if (clear.some(([qx, qz, qr]) => (x - qx) ** 2 + (z - qz) ** 2 < qr * qr)) continue
      out.push([x, d[1], z])
    }
    return out
  }
  // Long grass keeps to the rims and the small isles, so the arena's telegraphs stay readable.
  const inRing = (x: number, z: number) => x * x + z * z < (SKY_RADIUS + 0.6) ** 2
  const tufts = spots(low ? 260 : ctx.quality.level === 'medium' ? 640 : 900, 0.5, (x, z) => !inRing(x, z))
  batch(buildTallGrass(), plant, tufts.length, false, i => {
    const [x, y, z] = tufts[i]
    stand(x, y, z, rnd() * 6.28, 0.55 + rnd() * 0.5)
    return tint.setRGB(0.8 + rnd() * 0.2, 0.98 + rnd() * 0.1, 0.72 + rnd() * 0.2)
  })
  const blooms = spots(low ? 90 : 210, 0.6, (x, z) => !inRing(x, z) || rnd() < 0.3)
  batch(buildFlowers(), plant, blooms.length, false, i => {
    const [x, y, z] = blooms[i]
    stand(x, y, z, rnd() * 6.28, 0.9 + rnd() * 0.5)
    const c = FLOWER_TINTS[Math.floor(rnd() * FLOWER_TINTS.length)]
    return tint.setRGB(c[0], c[1], c[2])
  })
  const shrubs = spots(low ? 10 : 18, 1.1, (x, z) => x * x + z * z > 22.5 * 22.5)
  batch(buildBush(), leaf, shrubs.length, true, i => {
    const [x, y, z] = shrubs[i]
    stand(x, y - 0.05, z, rnd() * 6.28, 0.7 + rnd() * 0.5)
    return tint.setRGB(0.92 + rnd() * 0.12, 1, 0.9 + rnd() * 0.1)
  })

  // Vines trailing from the rims and roots poking out of the earth below them.
  const vines = new Geo()
  const stems = new Geo()
  const p0 = new THREE.Vector3()
  const leafCol = (g: number) => (_x: number, _y: number, _z: number, along: number, out: Vec3) => {
    out.x = 0.62 * g
    out.y = (0.86 + along * 0.14) * g
    out.z = 0.5 * g
  }
  const hang = ([ix, top, iz, r]: Disc, a: number, len: number, root: boolean) => {
    const sx = Math.sin(a)
    const sz = Math.cos(a)
    const bx = ix + sx * (r + (root ? -0.25 : 0.14))
    const by = top - (root ? 0.5 + rnd() * 0.5 : 0.16)
    const bz = iz + sz * (r + (root ? -0.25 : 0.14))
    const wob = rnd() * 6
    const out = root ? 0.5 + rnd() * 0.5 : 0.25
    const path = (t: number, o: THREE.Vector3) =>
      o.set(bx + sx * out * Math.sin(Math.PI * Math.min(1, t * 1.15)) + sz * Math.sin(t * 4 + wob) * 0.14 * t, by - len * Math.pow(t, root ? 1.3 : 1), bz + sz * out * Math.sin(Math.PI * Math.min(1, t * 1.15)) - sx * Math.sin(t * 4 + wob) * 0.14 * t)
    const sway = (t: number) => (root ? 0.01 : 0.08) * len * Math.pow(t, 1.5)
    const r0 = root ? 0.09 + rnd() * 0.07 : 0.028
    tube(stems, {
      path, radial: root ? 5 : 4, segments: root ? 7 : 6, tip: root, bend: sway,
      radius: t => r0 * (1 - t * 0.8),
      color: (_t, _n, o) => {
        o.x = root ? 0.95 : 0.5
        o.y = root ? 0.86 : 0.62
        o.z = root ? 0.74 : 0.36
      },
    })
    if (root) return
    const shade = 0.85 + rnd() * 0.3
    for (let d = 0.2; d < len; d += 0.3 + rnd() * 0.12) {
      const t = d / len
      path(t, p0)
      const turn = rnd() * 6.28
      const size = 0.42 + rnd() * 0.3
      card(vines, {
        base: p0, dir: new THREE.Vector3(Math.sin(turn) * 0.6, -0.75, Math.cos(turn) * 0.6).normalize(), side: { x: Math.cos(turn), y: 0, z: -Math.sin(turn) },
        length: size, width: size * 0.9, cell: rnd() < 0.5 ? Leaf.Heart : Leaf.Oval, centre: { x: p0.x - sx * 0.4, y: p0.y, z: p0.z - sz * 0.4 }, normalBlend: 0.6,
        color: leafCol(shade), bend: () => sway(t), flutter: 0.7,
      })
    }
  }
  for (const d of [...ISLES, ...STONES.map(([x, top, z, r, seed]): Disc => [x, top, z, r, r * 2.4, seed])]) {
    const [ix, top, iz, r, depth] = d
    const n = Math.round(r * (low ? 0.7 : 1.2))
    for (let i = 0; i < n; i++) {
      const a = ((i + rnd()) / n) * Math.PI * 2
      // Not where the rim is buried in a neighbouring lobe, a bridge lands or water falls.
      const ex = ix + Math.sin(a) * (r + 0.4)
      const ez = iz + Math.cos(a) * (r + 0.4)
      if (lawn(ex, ez, 0) === top || clear.some(([qx, qz, qr]) => (ex - qx) ** 2 + (ez - qz) ** 2 < qr * qr)) continue
      hang(d, a, 1.2 + rnd() * Math.min(5.5, depth * 0.4), false)
      if (rnd() < 0.45) hang(d, a + 0.2, 1 + rnd() * Math.min(3.5, depth * 0.3), true)
    }
  }
  const vineFill = () => {
    stand(0, 0, 0, 0, 1)
    return tint.setRGB(1, 1, 1)
  }
  batch(vines.build(), leaf, 1, false, vineFill)
  batch(stems.build(), bark, 1, false, vineFill)

  /* ── drifting rocks and wind ───────────────────────────── */

  // Each circles slowly round a point well clear of the walkable isles, bobbing as it goes.
  const rocks = low ? 10 : 18
  const drift = Array.from({ length: rocks }, (_, i) => {
    const a = (i / rocks) * Math.PI * 2 + rnd() * 0.5
    const d = 34 + rnd() * 16
    return { x: Math.sin(a) * d, y: cy - 9 + rnd() * 20, z: 30 + (rnd() - 0.5) * 50 + Math.cos(a) * d * 0.7, orbit: 1.5 + rnd() * 2.5, s: 0.9 + rnd() * 1.7, ph: rnd() * 6.28, w: (rnd() < 0.5 ? -1 : 1) * (0.03 + rnd() * 0.04) }
  }).filter(f => lawn(f.x, f.z, -8) === -Infinity)
  const chunks = [isleChunk(1, 2.1, 71), isleChunk(1, 1.5, 73)].map((g, k) => {
    const mesh = instances(own(g), ground, Math.max(1, (drift.length + 1 - k) >> 1))
    mesh.count = (drift.length + 1 - k) >> 1
    mesh.receiveShadow = true
    return mesh
  })

  const streaks: THREE.BufferGeometry[] = []
  const streak = (x: number, y: number, z: number, len: number, rise: number, phase: number) => {
    const pts: PathPoint[] = []
    const curl = (rnd() - 0.5) * 9
    for (let i = 0; i <= 5; i++) {
      const t = i / 5
      pts.push([cx + x + WIND_X * len * (t - 0.5) - WIND_Z * curl * Math.sin(t * Math.PI), cy + y + rise * Math.sin(t * Math.PI * 1.3), cz + z + WIND_Z * len * (t - 0.5) + WIND_X * curl * Math.sin(t * Math.PI)])
    }
    streaks.push(windRibbon(pts, 0.5 + rnd() * 0.5, phase))
  }
  const gusts = low ? 9 : 16
  for (let i = 0; i < gusts; i++) {
    const a = rnd() * Math.PI * 2
    const d = 14 + rnd() * 34
    streak(Math.sin(a) * d, 2.5 + rnd() * 9, 24 + Math.cos(a) * d * 1.5, 22 + rnd() * 18, (rnd() - 0.3) * 4, i / gusts + rnd() * 0.04)
  }
  const windGeo = own(mergeParts(streaks))
  const windMat = own(windMaterial(uTime))
  const windMesh = kit.addObject(new THREE.Mesh(windGeo, windMat))
  windMesh.renderOrder = 3
  windMesh.name = 'sky:wind'

  const up = new THREE.Vector3(0, 1, 0)
  return {
    update(dt: number, t: number) {
      uTime.value = t
      veg.uVegTime.value += dt
      veg.uVegCam.value.setFromMatrixPosition(ctx.camera.matrixWorld)
      veg.uVegPlayer.value.copy(ctx.player.position)
      for (let i = 0; i < drift.length; i++) {
        const f = drift[i]
        const a = f.ph + t * f.w
        quat.setFromAxisAngle(up, a * 0.6)
        vec.set(cx + f.x + Math.sin(a) * f.orbit, f.y + Math.sin(t * 0.3 + f.ph) * 0.6, cz + f.z + Math.cos(a) * f.orbit)
        chunks[i % 2].setMatrixAt(i >> 1, pose.compose(vec, quat, scale.setScalar(f.s)))
      }
      for (const c of chunks) c.instanceMatrix.needsUpdate = true
    },
    dispose() {
      for (const o of owned) o.dispose()
      for (const m of instanced) m.dispose()
    },
  }
}
