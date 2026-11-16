/**
 * Glitch Grid: an abstract digital void where the Void Stalker hunts.
 *
 *   the way in   the golden arch stands on a high pad in the south; two stepping tiles lead down
 *                to the guards' deck, a bridge tile (the second checkpoint) on to the arena. Every
 *                hop is a 2 m gap and 0.6 m down
 *   the arena    a glossy black octagon traced with a glowing grid, ringed by lattice pylons whose
 *                light streaks across its polish; nothing stands inside the Stalker's circle
 *   phasing      two arcs of thin tiles east and west of the bridge (deck to arena) and two more
 *                north to the monolith's pad. Each tile is solid, flickers magenta at 2 Hz for a
 *                second and a half, dissolves to its outline and returns; along an arc the tiles
 *                follow one another like a wave (toward the arena in the east, away in the west)
 *   scenery      data cubes in slow orbit, half-loaded fragments, a glyph monolith, lattice
 *                towers far out in the fog, motes of light rising, a scanline horizon all round
 *                and the void's own faint grid far below (falling to it respawns)
 */
import * as THREE from 'three'
import type { Collider } from '../collision'
import type { Ctx } from '../types'
import type { ZoneKit } from '../world/zones/kit'
import type { MapDef } from './defs'
import { place, seeded, slab } from './geo'
import { octagon, octagonBoxes, rect, slabGeometry, WireBatch, type WireLook } from './glitchGeo'
import { CYAN, domeMaterial, floorMaterial, glitchUniforms, moteMaterial, SHARD, shardMaterial, TIME_WRAP, voidMaterial, wireMaterial } from './glitchShaders'
import type { MapBuild } from './registry'

/** The Void Stalker's circle (m); the arena's floor reaches 4 m further. */
export const GLITCH_RADIUS = 18
const FLOOR = GLITCH_RADIUS + 4

/** The solid pads besides the arena, from its centre: [x0, x1, z0, z1, top above the arena floor]. */
const PADS: ReadonlyArray<readonly [number, number, number, number, number]> = [
  [-6, 6, 54, 66, 3.0], // entrance: the golden arch
  [-4, 0, 48, 52, 2.4],
  [0, 4, 42, 46, 1.8],
  [-8, 8, 30, 40, 1.2], // the guards' deck
  [-2, 2, 24, 28, 0.6], // bridge: the second checkpoint
  [-6, 6, -48, -36, 1.2], // the monolith's pad
]
const PAD_THICK = 0.8
const ARENA_THICK = 1

/** Phasing tiles (4 m squares), from the arena's centre: [x, z, top, seconds into the cycle at which it appears]. */
const TILES: ReadonlyArray<readonly [number, number, number, number]> = [
  // East arc, deck to arena: the wave runs toward the arena.
  [12, 32, 0.9, 0], [18, 30, 0.6, 1.2], [20, 24, 0.3, 2.4], [20, 18, 0, 3.6],
  // West arc: the wave runs back toward the deck.
  [-12, 32, 0.9, 3.6], [-18, 30, 0.6, 2.4], [-20, 24, 0.3, 1.2], [-20, 18, 0, 0],
  // North, out to the monolith: both are solid together for four seconds of every cycle.
  [0, -26, 0.4, 0.6], [0, -32, 0.8, 3],
]
const TILE_SIZE = 4
const TILE_THICK = 0.4
/**
 * A tile's cycle (s): it materialises (solid from the first moment), stays, warns by pulsing
 * magenta, dissolves (no longer solid) and is gone but for its outline.
 */
const APPEAR = 0.55
const STAY = 4.4
const WARN = 1.5
const VANISH = 0.35
const GONE = 2.8
const WARN_AT = APPEAR + STAY
const VANISH_AT = WARN_AT + WARN
const GONE_AT = VANISH_AT + VANISH
const CYCLE = GONE_AT + GONE
/** Warning pulses per second (kept well under 3 Hz). */
const WARN_HZ = 2

/** Lattice towers far out in the fog: [bearing (rad, 0 = south, toward east), distance, width, top above the floor]. */
const TOWERS: ReadonlyArray<readonly [number, number, number, number]> = [
  [0.4, 112, 10, 62], [1.15, 132, 13, 84], [2.1, 98, 9, 48], [2.95, 138, 14, 92],
  [3.75, 106, 10, 58], [4.65, 126, 12, 76], [5.6, 100, 9, 44],
]

/** One drifting box: where its orbit is centred, how it turns, what it is. */
interface Drift {
  ox: number
  oz: number
  /** Orbit radius (m), start angle and angular speed (rad/s; 0: it hangs in place). */
  r: number
  a: number
  w: number
  y: number
  bob: number
  sx: number
  sy: number
  sz: number
  rx: number
  rz: number
  spin: number
  ph: number
  /** Seconds between its sideways skips (0: never). */
  skip: number
}

export function buildGlitch(ctx: Ctx, kit: ZoneKit, def: MapDef): MapBuild {
  const { x: cx, y: cy, z: cz } = def.center
  const low = ctx.quality.level === 'low'
  const rnd = seeded(91)
  const u = glitchUniforms(def.center)
  const owned: Array<{ dispose(): void }> = []
  const own = <T extends { dispose(): void }>(o: T): T => {
    owned.push(o)
    return o
  }

  // Pylons round the arena, one inside each corner; the pairs by the ways in and out are magenta.
  const corner = FLOOR / Math.cos(Math.PI / 8) - 1.5
  const pylons = Array.from({ length: 8 }, (_, i) => {
    const a = ((i + 0.5) / 8) * Math.PI * 2
    return new THREE.Vector4(Math.sin(a) * corner, Math.cos(a) * corner, 10.5, i === 0 || i === 3 || i === 4 || i === 7 ? 1 : 0)
  })

  const floor = own(floorMaterial(ctx, u, { pylons: low ? [] : pylons }))
  const tileMat = own(floorMaterial(ctx, u, { pylons: [], tile: { thick: TILE_THICK } }))
  // Dark plating under the slabs and for the pylons' feet.
  const shell = own(new THREE.MeshStandardMaterial({
    map: ctx.textures.get('stone_albedo'), normalMap: ctx.textures.get('stone_normal'), color: '#2a323e', roughness: 0.5, metalness: 0.6,
  }))
  const trim = kit.mat('glow', { color: '#c8fbff', emissive: CYAN, emissiveIntensity: 2, key: 'glitch-trim' })
  const wire = new WireBatch()
  const metal = { surface: 'metal' as const }

  /** A lattice mast with a light beam up its middle, on a solid foot. */
  const pylon = (x: number, y: number, z: number, height: number, width: number, tint: number) => {
    const foot = width + 0.4
    kit.box({ x, y, z, w: foot, h: 0.5, d: foot, mat: shell, collide: metal })
    kit.box({ x, y: y + 0.5, z, w: foot + 0.06, h: 0.05, d: foot + 0.06, mat: trim, castShadow: false })
    const look: WireLook = { tint, glow: 1.5, line: 0.028 * width }
    wire.mast(x, y + 0.5, z, width, height, width * 1.5, look)
    wire.beam(x, y + 0.5, z, height + 1.5, width * 0.7, { tint, glow: 1.6, line: 0 })
    kit.add(new THREE.OctahedronGeometry(width * 0.35, 0), trim, place(x, y + 0.5 + height + width * 0.35, z), { castShadow: false })
    // Thin enough that the camera looks past it.
    kit.own(ctx.collision.addCylinder({ x, y: y + 0.5, z, r: Math.min(0.55, width * 0.7), h: height, surface: 'metal' }))
  }

  // ── the arena: an octagonal slab on three stepped tiers narrowing into the void ──
  kit.add(slabGeometry(octagon(FLOOR), ARENA_THICK), floor, place(cx, cy, cz), { castShadow: false })
  for (const b of octagonBoxes(FLOOR)) kit.own(ctx.collision.addBox({ x: cx, y: cy - ARENA_THICK / 2, z: cz, hx: b.hx, hy: ARENA_THICK / 2, hz: b.hz, yaw: b.yaw, surface: 'metal' }))
  let under = cy - ARENA_THICK
  for (const r of [18.5, 13.5, 8]) {
    const h = 2.6
    const round = r / Math.cos(Math.PI / 8)
    kit.add(slab(round, round, h, 8, 3), shell, place(cx, under - h / 2, cz, 0, Math.PI / 8, 0), { castShadow: false })
    kit.add(slab(round + 0.08, round + 0.08, 0.12, 8, 3), trim, place(cx, under - 0.06, cz, 0, Math.PI / 8, 0), { castShadow: false })
    for (const b of octagonBoxes(r)) kit.own(ctx.collision.addBox({ x: cx, y: under - h / 2, z: cz, hx: b.hx, hy: h / 2, hz: b.hz, yaw: b.yaw, surface: 'metal' }))
    under -= h
  }
  wire.beam(cx, under, cz, -46, 3.2, { tint: 0, glow: 1.3, line: 0 })
  for (const p of pylons) pylon(cx + p.x, cy, cz + p.y, 10, 0.8, p.w)

  // ── the pads: a slab each, on an inverted ziggurat with a beam of light down from its tip ──
  for (const [x0, x1, z0, z1, top] of PADS) {
    const w = x1 - x0
    const d = z1 - z0
    const x = cx + (x0 + x1) / 2
    const z = cz + (z0 + z1) / 2
    const y = cy + top
    kit.add(slabGeometry(rect(-w / 2, w / 2, -d / 2, d / 2), PAD_THICK), floor, place(x, y, z), { castShadow: false })
    kit.own(ctx.collision.addBox({ x, y: y - PAD_THICK / 2, z, hx: w / 2, hy: PAD_THICK / 2, hz: d / 2, surface: 'metal' }))
    const h = Math.min(2.2, Math.max(1, Math.min(w, d) * 0.25))
    let below = y - PAD_THICK
    for (const [bw, bd, bh] of [[w - 1.6, d - 1.6, h], [w * 0.45, d * 0.45, h * 1.2]]) {
      kit.box({ x, y: below - bh, z, w: bw, h: bh, d: bd, mat: shell, collide: metal, castShadow: false })
      kit.box({ x, y: below - 0.1, z, w: bw + 0.12, h: 0.1, d: bd + 0.12, mat: trim, castShadow: false })
      below -= bh
    }
    wire.beam(x, below, z, -30, Math.min(w, d) * 0.2, { tint: 0, glow: 1.2, line: 0 })
  }
  // Tall pylons behind the arch, corner posts on the deck and the monolith's pad.
  const [entrance, , , deck, , node] = PADS
  for (const side of [-1, 1]) {
    pylon(cx + side * 4.7, cy + entrance[4], cz + 64.7, 7, 0.7, 0)
    for (const z of [deck[2] + 0.8, deck[3] - 0.8]) pylon(cx + side * 7.2, cy + deck[4], cz + z, 2.6, 0.45, 0)
    for (const z of [node[2] + 0.9, node[3] - 0.9]) pylon(cx + side * 5.1, cy + node[4], cz + z, 4, 0.5, 1)
  }

  // ── phasing tiles ──
  const tileGeo = slabGeometry(rect(-TILE_SIZE / 2, TILE_SIZE / 2, -TILE_SIZE / 2, TILE_SIZE / 2), TILE_THICK)
  const phase = new THREE.InstancedBufferAttribute(new Float32Array(TILES.length * 2), 2)
  phase.setUsage(THREE.DynamicDrawUsage)
  tileGeo.setAttribute('aPhase', phase)
  const tiles = kit.addObject(new THREE.InstancedMesh(tileGeo, tileMat, TILES.length))
  tiles.name = 'glitch:tiles'
  tiles.receiveShadow = true
  const m = new THREE.Matrix4()
  const solids: Collider[] = TILES.map(([x, z, top], i) => {
    tiles.setMatrixAt(i, m.makeTranslation(cx + x, cy + top, cz + z))
    return kit.own(ctx.collision.addBox({ x: cx + x, y: cy + top - TILE_THICK / 2, z: cz + z, hx: TILE_SIZE / 2, hy: TILE_THICK / 2, hz: TILE_SIZE / 2, surface: 'metal' }))
  })
  tiles.instanceMatrix.needsUpdate = true

  // ── data cubes, half-loaded fragments and the monolith: one instanced batch ──
  const drift: Drift[] = []
  const info: number[] = []
  const add = (kind: number, tint: number, glow: number, d: Partial<Drift> & Pick<Drift, 'y' | 'sx' | 'sy' | 'sz'>) => {
    drift.push({ ox: cx, oz: cz, r: 0, a: 0, w: 0, bob: 0, rx: 0, rz: 0, spin: 0, ph: rnd() * 40, skip: 0, ...d })
    info.push(tint, kind, rnd(), glow)
  }
  // The monolith: solid, facing the arena from the middle of its pad.
  const mono = { x: cx, y: cy + node[4], z: cz + (node[2] + node[3]) / 2, w: 2.6, h: 9, d: 0.8 }
  add(SHARD.monolith, 0, 1, { ox: mono.x, oz: mono.z, y: mono.y + mono.h / 2, sx: mono.w, sy: mono.h, sz: mono.d })
  kit.own(ctx.collision.addBox({ x: mono.x, y: mono.y + mono.h / 2, z: mono.z, hx: mono.w / 2, hy: mono.h / 2, hz: mono.d / 2, surface: 'metal' }))
  // Three small cubes circle its top.
  for (let i = 0; i < 3; i++) {
    const s = 0.45 + rnd() * 0.25
    add(SHARD.cube, i === 1 ? 1 : 0, 1.2, { ox: mono.x, oz: mono.z, r: 2.6 + i * 0.7, a: i * 2.1, w: 0.22 - i * 0.04, y: mono.y + mono.h + 2.6 + i * 0.9, bob: 0.25, sx: s, sy: s, sz: s, spin: 0.5 })
  }
  // Data cubes in slow orbit round the arena: a high ring over everyone's heads, a low one out beyond the pads.
  const high = low ? 8 : 14
  for (let i = 0; i < high; i++) {
    const s = 0.9 + rnd() * 1.3
    add(SHARD.cube, rnd() < 0.25 ? 1 : 0, 1, {
      r: 26 + rnd() * 10, a: (i / high) * Math.PI * 2 + rnd() * 0.3, w: (0.012 + rnd() * 0.018) * (i % 3 ? 1 : -1), y: cy + 8 + rnd() * 11,
      bob: 0.6, sx: s, sy: s, sz: s, rx: rnd() * 0.6, rz: rnd() * 0.6, spin: (rnd() - 0.5) * 0.5, skip: 16 + rnd() * 14,
    })
  }
  const deep = low ? 4 : 8
  for (let i = 0; i < deep; i++) {
    const s = 1.4 + rnd() * 1.8
    add(SHARD.cube, rnd() < 0.25 ? 1 : 0, 0.9, {
      r: 46 + rnd() * 20, a: (i / deep) * Math.PI * 2 + rnd() * 0.5, w: (0.008 + rnd() * 0.012) * (i % 2 ? 1 : -1), y: cy - 18 + rnd() * 10,
      bob: 0.8, sx: s, sy: s, sz: s, rx: rnd() * 0.6, rz: rnd() * 0.6, spin: (rnd() - 0.5) * 0.4,
    })
  }
  // Fragments of unloaded geometry hanging in the void: tilted slabs and beams, well out of reach
  // (alternately above head height and below the pads; none over the monolith in the north).
  const loose = low ? 7 : 12
  for (let i = 0; i < loose; i++) {
    const a = ((i + 0.5) / loose) * Math.PI * 2 + (rnd() - 0.5) * 0.25
    const up = i % 2 === 0 && Math.abs(a - Math.PI) > 0.4
    const beam = i % 3 === 2
    add(SHARD.fragment, i % 5 === 3 ? 1 : 0, 1, {
      r: 31 + rnd() * 20, a, y: up ? cy + 12 + rnd() * 6 : cy - 14 + rnd() * 7, bob: 0.5,
      sx: beam ? 0.6 : 2.6 + rnd() * 2.4, sy: beam ? 3.5 + rnd() * 2.5 : 0.32, sz: beam ? 0.6 : 2.2 + rnd() * 2.2,
      rx: (rnd() - 0.5) * 0.9, rz: (rnd() - 0.5) * 0.9, spin: (rnd() - 0.5) * 0.12,
    })
  }
  const shardGeo = new THREE.BoxGeometry(1, 1, 1)
  shardGeo.setAttribute('aShard', new THREE.InstancedBufferAttribute(new Float32Array(info), 4))
  const shards = kit.addObject(new THREE.InstancedMesh(shardGeo, own(shardMaterial(u)), drift.length))
  shards.name = 'glitch:shards'
  shards.frustumCulled = false

  // ── far scenery: lattice towers in the fog, the horizon dome, the void's grid, rising motes ──
  for (const [a, dist, w, top] of TOWERS) {
    wire.mast(cx + Math.sin(a) * dist, cy - 70, cz + Math.cos(a) * dist, w, top + 70, w, { tint: a > 2.5 && a < 4.2 ? 1 : 0, glow: 0.8, line: 0.2 })
  }
  const lines = kit.addObject(wire.build(own(wireMaterial(u))))
  lines.renderOrder = 1
  lines.frustumCulled = false

  const dome = kit.addObject(new THREE.Mesh(new THREE.SphereGeometry(380, 48, 24), own(domeMaterial(u))))
  dome.name = 'glitch:dome'
  dome.renderOrder = -1
  dome.frustumCulled = false

  const abyss = kit.addObject(new THREE.Mesh(new THREE.CircleGeometry(460, 64).rotateX(-Math.PI / 2), own(voidMaterial(u))))
  abyss.name = 'glitch:void'
  abyss.position.set(cx, def.killY + 2, cz)

  const count = Math.round(Math.min(900, Math.max(180, ctx.quality.particles * 0.35)))
  const seeds = new Float32Array(count * 3)
  for (let i = 0; i < seeds.length; i++) seeds[i] = rnd()
  const moteGeo = new THREE.BufferGeometry()
  moteGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
  moteGeo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3))
  const moteMat = own(moteMaterial(u))
  const motes = kit.addObject(new THREE.Points(moteGeo, moteMat))
  motes.name = 'glitch:motes'
  motes.frustumCulled = false
  motes.renderOrder = 5

  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  const p = new THREE.Vector3()
  const s = new THREE.Vector3()
  /** Places every drifting box for time t (the monolith, first, never moves after the first call). */
  const placeShards = (t: number, from: number) => {
    for (let i = from; i < drift.length; i++) {
      const d = drift[i]
      const a = d.a + t * d.w
      // A skip: a quarter of a second half a metre aside, a few times a minute at most.
      const aside = d.skip > 0 && (t + d.ph) % d.skip < 0.25 ? 0.6 : 0
      p.set(d.ox + Math.sin(a) * d.r + aside, d.y + Math.sin(t * 0.4 + d.ph) * d.bob, d.oz + Math.cos(a) * d.r)
      shards.setMatrixAt(i, m.compose(p, q.setFromEuler(e.set(d.rx, d.ph + t * d.spin, d.rz)), s.set(d.sx, d.sy, d.sz)))
    }
    shards.instanceMatrix.needsUpdate = true
  }
  drift[0].ph = 0
  placeShards(0, 0)

  return {
    update(_dt: number, t: number) {
      u.uTime.value = t % TIME_WRAP
      const cam = ctx.camera.position
      dome.position.copy(cam)
      moteMat.uniforms.uCenter.value.copy(cam)
      moteMat.uniforms.uSize.value = 60 * ctx.renderer.getPixelRatio()
      placeShards(t, 1)

      // Phasing tiles: where each is in its cycle decides its look and whether it is solid.
      const ph = phase.array
      let changed = false
      for (let i = 0; i < TILES.length; i++) {
        let c = (t - TILES[i][3]) % CYCLE
        if (c < 0) c += CYCLE
        let there = 1
        let warn = 0
        let solid = true
        if (c < APPEAR) {
          const k = c / APPEAR
          there = k * k * (3 - 2 * k)
        } else if (c >= GONE_AT) {
          there = 0
          solid = false
        } else if (c >= VANISH_AT) {
          const k = (c - VANISH_AT) / VANISH
          there = 1 - k
          warn = 0.3 + 0.7 * k
          solid = false
        } else if (c >= WARN_AT) {
          // Eases in, then swells and settles WARN_HZ times a second.
          const w = c - WARN_AT
          warn = Math.min(1, w / 0.2) * (0.3 + 0.35 * (1 - Math.cos(w * Math.PI * 2 * WARN_HZ)))
        }
        solids[i].enabled = solid
        if (ph[i * 2] !== there || ph[i * 2 + 1] !== warn) {
          ph[i * 2] = there
          ph[i * 2 + 1] = warn
          changed = true
        }
      }
      if (changed) phase.needsUpdate = true
    },
    dispose() {
      for (const o of owned) o.dispose()
      tiles.dispose()
      shards.dispose()
    },
  }
}
