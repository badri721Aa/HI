/**
 * Cyberpunk Neon Metropolis: a rainy night high over the city. The player steps out of the arch
 * on a lower roof among air-conditioning units, steam vents and cables, climbs the service stairs
 * (or rides the updraft of the big exhaust fan) to a catwalk, and crosses a bridge over the
 * street canyon to the megatower's apron. Beyond the guards lies the helipad, the Plasma
 * Overlord's arena, under the tower's sign-covered crown.
 *
 * All around: skyscrapers with lit window grids (one instanced draw), neon signs in a made-up
 * script, a holographic billboard that changes its picture every eight seconds, sky-car trails
 * and the glow of the streets in the smog far below. Falling off any roof respawns the player.
 *
 * Measures in this file are relative to the helipad's centre (the MapDef's centre): +z is the
 * entrance side, y = 0 the helipad's floor.
 */
import * as THREE from 'three'
import type { Ctx } from '../types'
import type { ZoneKit } from '../world/zones/kit'
import type { MapDef } from './defs'
import { place, scaleUv, seeded, slab } from './geo'
import { GlowBatch, HOLO_ADS, HOLO_PERIOD, holoMaterial, MODE, type GlowMode, type HoloAd } from './neon/glow'
import { litMaterial, NeonLights, towerMaterial, type TimeUniform } from './neon/materials'
import { buildNeonTextures, glyphCell, iconCell, SHAPE, wordCell, type Cell, type WordId } from './neon/textures'
import { buildRain, buildSmog, buildSteam, buildTraffic, jetPhase, type Beat, type Lane, type Vent } from './neon/weather'
import type { MapBuild } from './registry'
import { abyss } from './stage'

/** The Plasma Overlord's circle (m): the yellow ring painted on the helipad. */
export const NEON_RADIUS = 18

/** The helipad disc. */
const PAD = 22
/** The arrival roof, below the helipad. */
const LOW = -5
/** The streets, this far below the helipad. */
const STREETS = 90
/**
 * Height of everything low on the helipad level (railings, lockers). The Overlord's sweeping
 * beams catch anyone whose feet are less than 0.95 m above the arena floor, so nothing near the
 * arena may offer a perch between that and 3.5 m (out of a double jump's reach).
 */
const LOW_TOP = 0.9
/** The moonlight's direction (the map's atmosphere preset). */
const LIGHT_DIR = new THREE.Vector3(-0.3, 0.8, 0.5)

const MAGENTA = '#ff3fd2'
const CYAN = '#29d8ff'
const AMBER = '#ffb347'
const VIOLET = '#9a6bff'
const RED = '#ff3048'

/** The apron in front of the helipad (5 cm lower, so the two floors never share a plane). */
const APRON = { x: 13, z0: 14, z1: 37, y: -0.05 }
/** The megatower's body under the helipad and the apron. */
const SHAFT = { x: 14, z0: -38, z1: 37.5, y: -1.2 }
/** The megatower's crown behind the helipad. */
const CROWN = { x: 12, z0: -38, z1: -24, top: 34 }
/** The arrival roof. */
const ROOF = { x: 13, z0: 41, z1: 70 }
/** The catwalk bridge and the landing it starts from, at helipad level. */
const BRIDGE = { x: 1.6, z0: 37, z1: 45 }
const LANDING = { x0: -2, x1: 8.5, z0: 45, z1: 48.5 }
/** The service stairs up to the landing: steps low enough to walk up. */
const STAIRS = { x: 7, w: 3, foot: 57.3, steps: 16, run: 0.55 }
/** The exhaust fan that throws the player up to the landing. */
const FAN = { x: -1, z: 51.4, r: 1.5, h: 0.4, launch: 18 }
/** The holographic billboard. */
const HOLO = { x: -46, z: -30, y: 15, w: 18, h: 11.25 }

/** Steam jets across the bridge: where they blow and when (they scald once they have built up). */
const JETS: ReadonlyArray<{ z: number; beat: Beat }> = [
  { z: 39.3, beat: { period: 6, offset: 0, open: 2.2 } },
  { z: 42.7, beat: { period: 6, offset: 3, open: 2.2 } },
]
const JET_RADIUS = 0.85
const JET_BUILD_UP = 0.5

/** A skyscraper: a box from the streets up to `top`, turned by `yaw`; its +z face carries its sign. */
interface Tower {
  x: number
  z: number
  w: number
  d: number
  top: number
  yaw: number
  /** Metres per window pane, window brightness. */
  pane: number
  lit: number
  /** Window light and roof-band colours (linear rgb, may exceed 1). */
  tint: readonly [number, number, number]
  accent: readonly [number, number, number]
}

interface Mats {
  deck: THREE.MeshStandardMaterial
  clad: THREE.MeshStandardMaterial
  steel: THREE.MeshStandardMaterial
  grate: THREE.MeshStandardMaterial
  stripes: THREE.MeshStandardMaterial
}

/** What the parts of the map share while it is built. */
interface Site {
  ctx: Ctx
  kit: ZoneKit
  cx: number
  cy: number
  cz: number
  mats: Mats
  glow: GlowBatch
  lights: NeonLights
  towers: Tower[]
  vents: Vent[]
  rnd: () => number
}

export function buildNeon(ctx: Ctx, kit: ZoneKit, def: MapDef): MapBuild {
  const { x: cx, y: cy, z: cz } = def.center
  const owned: Array<{ dispose(): void }> = []
  const own = <T extends { dispose(): void }>(o: T): T => {
    owned.push(o)
    return o
  }
  const low = ctx.quality.level === 'low'
  const uTime: TimeUniform = { value: 0 }
  const tex = own(buildNeonTextures(ctx.renderer))
  const lights = new NeonLights()
  const lit = <T extends THREE.MeshStandardMaterial>(m: T, deck = false): T => own(litMaterial(ctx, m, lights, uTime, def.center, { deck, ripples: !low }))
  const mats: Mats = {
    deck: lit(new THREE.MeshStandardMaterial({ map: ctx.textures.get('stone_albedo'), normalMap: ctx.textures.get('stone_normal'), color: '#5d6276', roughness: 0.62, metalness: 0.1 }), true),
    clad: lit(new THREE.MeshStandardMaterial({ map: tex.panel, normalMap: tex.panelNormal, color: '#737a90', roughness: 0.5, metalness: 0.55 })),
    steel: lit(new THREE.MeshStandardMaterial({ color: '#2d313e', roughness: 0.45, metalness: 0.75 })),
    grate: lit(new THREE.MeshStandardMaterial({ map: tex.grate, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.7 })),
    stripes: lit(new THREE.MeshStandardMaterial({ map: tex.hazard, roughness: 0.7, metalness: 0.2 })),
  }
  const site: Site = { ctx, kit, cx, cy, cz, mats, glow: new GlowBatch(), lights, towers: [], vents: [], rnd: seeded(17) }

  helipad(site)
  megatower(site)
  approach(site)
  arrivalRoof(site)
  const holoTower = skyline(site, low ? 56 : 84)

  // ── the skyline: one instanced draw ──
  const towerGeo = own(new THREE.BoxGeometry(1, 1, 1))
  const towerMat = own(towerMaterial(tex.windows, LIGHT_DIR, cy - STREETS))
  const towers = kit.addObject(new THREE.InstancedMesh(towerGeo, towerMat, site.towers.length))
  fillTowers(towers, site)
  owned.push(towers)

  // ── the holographic billboard over the tower north-west of the helipad ──
  const ads: HoloAd[] = [
    { icon: iconCell(0), word: wordCell(0), top: CYAN, bottom: VIOLET },
    { icon: iconCell(1), word: wordCell(1), top: MAGENTA, bottom: AMBER },
    { icon: iconCell(2), word: wordCell(2), top: AMBER, bottom: MAGENTA },
    { icon: iconCell(3), word: wordCell(3), top: '#7dffb4', bottom: CYAN },
  ]
  const holoYaw = Math.atan2(-HOLO.x, 18 - HOLO.z)
  const holoGeo = own(new THREE.PlaneGeometry(HOLO.w, HOLO.h))
  const holo = kit.addObject(new THREE.Mesh(holoGeo, own(holoMaterial(tex.signs, uTime, HOLO.w / HOLO.h, ads, 1.5))))
  holo.position.set(cx + HOLO.x, cy + HOLO.y, cz + HOLO.z)
  holo.rotation.y = holoYaw
  holo.renderOrder = 3
  // Its two projector masts on the roof below.
  for (const side of [-1, 1]) {
    const px = cx + HOLO.x + Math.cos(holoYaw) * side * (HOLO.w / 2 + 0.6)
    const pz = cz + HOLO.z - Math.sin(holoYaw) * side * (HOLO.w / 2 + 0.6)
    kit.box({ x: px, y: cy + holoTower.top, z: pz, w: 0.7, h: HOLO.y - holoTower.top - HOLO.h / 2 + 1, d: 0.7, yaw: holoYaw, mat: mats.steel, castShadow: false })
    site.glow.wall(px, cy + HOLO.y - HOLO.h / 2 + 1.3, pz, holoYaw, 1.4, 1.4, SHAPE.disc, CYAN, 2.4, MODE.breathe, side * 0.25)
  }
  // The light it throws changes with its picture.
  const holoTints = ads.map(a => new THREE.Color(a.top).lerp(new THREE.Color(a.bottom), 0.4))
  const holoTint = new THREE.Color()
  const holoBar = lights.bar(cx + HOLO.x, cz + HOLO.z, cy + HOLO.y - HOLO.h / 2, cy + HOLO.y + HOLO.h / 2, CYAN, 1.5, HOLO.w * 0.4)
  const holoPool = lights.pool(cx + HOLO.x * 0.62, cy + 9, cz + HOLO.z * 0.62, 20, CYAN, 0.5)

  // ── everything that glows, the weather, the streets ──
  const glowMesh = site.glow.build(tex.signs, uTime)
  if (glowMesh) {
    kit.addObject(glowMesh)
    owned.push(glowMesh.geometry, glowMesh.material as THREE.Material)
  }
  const rain = own(buildRain(Math.round(Math.min(1600, Math.max(420, ctx.quality.particles * 0.7))), uTime))
  const fx = [rain, own(buildSteam(site.vents, low ? 4 : 7, uTime)), own(buildTraffic(trafficLanes(site, low ? 3 : 6), uTime)), own(buildSmog(ctx, cx, cy - STREETS + 30, cz, 420, uTime))]
  for (const f of fx) kit.addObject(f.object)
  abyss(ctx, kit, owned, def, 'city', ['#07040f', '#e23ad0'], uTime, cy - STREETS)

  const jets = JETS.map(j => ({ x: cx, z: cz + j.z, beat: j.beat }))
  const scald = { x: 0, y: 0, z: 0 }

  return {
    update(_dt: number, t: number) {
      uTime.value = t
      rain.center.copy(ctx.camera.position)

      // The billboard's light follows its picture (the wipe takes the last fifth of each one).
      const cyc = Math.max(0, t) / HOLO_PERIOD
      const ad = Math.floor(cyc) % HOLO_ADS
      const wipe = Math.min(1, Math.max(0, (cyc - Math.floor(cyc) - 0.8) / 0.2))
      holoTint.copy(holoTints[ad]).lerp(holoTints[(ad + 1) % HOLO_ADS], wipe)
      lights.tintBar(holoBar, holoTint, 1.5)
      lights.tintPool(holoPool, holoTint, 0.5)

      // Steam jets on the bridge scald once they have built up.
      const pl = ctx.player
      const p = pl.position
      if (pl.invulnerable || pl.hp <= 0 || !pl.controlEnabled || pl.state === 'dash') return
      if (p.y < cy - 0.5 || p.y > cy + 2.8) return
      for (const j of jets) {
        const since = jetPhase(j.beat, t)
        if (since < JET_BUILD_UP || since > j.beat.open) continue
        if (Math.hypot(p.x - j.x, p.z - j.z) > JET_RADIUS + pl.radius) continue
        scald.x = j.x
        scald.y = p.y
        scald.z = j.z
        pl.hurt(1, scald)
      }
    },
    dispose() {
      for (const o of owned) o.dispose()
    },
  }
}

/* ── the megatower ───────────────────────────────────────── */

/** The arena: the helipad disc on its cantilever, its edge lamps, light pylons and lockers. */
function helipad(s: Site): void {
  const { ctx, kit, cx, cy, cz, mats, glow, lights } = s
  kit.add(slab(PAD, PAD, 0.8, 72, 4), mats.deck, place(cx, cy - 0.4, cz))
  kit.add(slab(PAD + 0.3, PAD + 0.3, 0.5, 72, 4), mats.steel, place(cx, cy - 0.3, cz), { castShadow: false })
  kit.add(slab(PAD - 0.4, 14.5, 3.4, 48, 3), mats.clad, place(cx, cy - 2.5, cz), { castShadow: false })
  kit.own(ctx.collision.addCylinder({ x: cx, y: cy - 0.8, z: cz, r: PAD + 0.3, h: 0.8, surface: 'stone' }))

  // Edge lamps set into the deck: a slow wave runs round them.
  const lamps = 40
  for (let i = 0; i < lamps; i++) {
    const a = (i / lamps) * Math.PI * 2
    glow.flat(cx + Math.sin(a) * (PAD - 0.4), cy + 0.03, cz + Math.cos(a) * (PAD - 0.4), 0.5, 0.5, SHAPE.disc, CYAN, 2.2, MODE.chase, i / lamps)
  }

  // Four light pylons outside the Overlord's circle: tall, solid cover from its orbs.
  const pylons: ReadonlyArray<readonly [number, string]> = [[55, CYAN], [305, MAGENTA], [140, MAGENTA], [220, CYAN]]
  for (const [deg, color] of pylons) {
    const a = (deg * Math.PI) / 180
    const x = cx + Math.sin(a) * 19.6
    const z = cz + Math.cos(a) * 19.6
    kit.box({ x, y: cy, z, w: 1.1, h: 4.4, d: 1.1, yaw: a, mat: mats.clad, uvScale: 2.2, collide: { surface: 'metal' } })
    kit.box({ x, y: cy, z, w: 1.4, h: 0.3, d: 1.4, yaw: a, mat: mats.stripes, uvScale: 1 })
    kit.box({ x, y: cy + 4.4, z, w: 1.35, h: 0.18, d: 1.35, yaw: a, mat: mats.steel })
    for (let k = 0; k < 4; k++) {
      const face = a + (k * Math.PI) / 2
      glow.wall(x + Math.sin(face) * 0.57, cy + 2.35, z + Math.cos(face) * 0.57, face, 0.2, 3.5, SHAPE.solid, color, 2.2, MODE.breathe, k * 0.25)
    }
    lights.bar(x, z, cy + 0.6, cy + 4.1, color, 1.7, 0.3)
    lights.pool(x - Math.sin(a) * 1.6, cy + 2.4, z - Math.cos(a) * 1.6, 6.5, color, 1.5)
  }

  // Low equipment lockers: they stop sparks, never a beam.
  for (const deg of [100, 180, 260]) {
    const a = (deg * Math.PI) / 180
    const x = cx + Math.sin(a) * 19.5
    const z = cz + Math.cos(a) * 19.5
    kit.box({ x, y: cy, z, w: 2.4, h: LOW_TOP, d: 1, yaw: a, mat: mats.clad, uvScale: 1.6, collide: { surface: 'metal' } })
    kit.box({ x, y: cy, z, w: 2.5, h: 0.12, d: 1.1, yaw: a, mat: mats.steel })
    glow.wall(x - Math.sin(a) * 0.52, cy + 0.62, z - Math.cos(a) * 0.52, a + Math.PI, 1.8, 0.07, SHAPE.solid, AMBER, 1.8)
  }
}

/** The tower under the helipad: its roof ledge, the apron where the guards wait, and the crown with its signs. */
function megatower(s: Site): void {
  const { kit, cx, cy, cz, mats, glow, lights } = s
  const depth = SHAFT.z1 - SHAFT.z0
  const midZ = (SHAFT.z0 + SHAFT.z1) / 2
  kit.box({ x: cx, y: cy + SHAFT.y - 1, z: cz + midZ, w: SHAFT.x * 2, h: 1, d: depth, mat: mats.deck, uvScale: 4, collide: { surface: 'stone' } })
  s.towers.push({ x: 0, z: midZ, w: SHAFT.x * 2 - 0.6, d: depth - 0.6, top: SHAFT.y - 1, yaw: 0, pane: 2.6, lit: 1.1, tint: [1, 1, 1], accent: [0, 0, 0] })

  // The apron.
  const az = (APRON.z0 + APRON.z1) / 2
  kit.box({ x: cx, y: cy + SHAFT.y, z: cz + az, w: APRON.x * 2, h: APRON.y - SHAFT.y, d: APRON.z1 - APRON.z0, mat: mats.deck, uvScale: 4, collide: { surface: 'stone' } })
  for (const side of [-1, 1]) {
    railing(s, side * (APRON.x - 0.1), 19.6, side * (APRON.x - 0.1), APRON.z1, APRON.y, side > 0 ? CYAN : MAGENTA)
    railing(s, side * (APRON.x - 0.1), APRON.z1 - 0.05, side * (BRIDGE.x + 0.05), APRON.z1 - 0.05, APRON.y)
    lamp(s, side * (APRON.x - 0.9), APRON.y, 33.5, AMBER, true)
  }

  // The crown: a wall of windows over a clad base with the hangar door.
  const cd = CROWN.z1 - CROWN.z0
  s.towers.push({ x: 0, z: (CROWN.z0 + CROWN.z1) / 2, w: CROWN.x * 2, d: cd, top: CROWN.top, yaw: 0, pane: 2.4, lit: 1.25, tint: [1, 0.95, 1.1], accent: [2.2, 0.35, 1.8] })
  kit.solidBox(cx, cy + SHAFT.y, cz + (CROWN.z0 + CROWN.z1) / 2 + 0.25, CROWN.x * 2 + 0.6, CROWN.top - SHAFT.y, cd + 0.5, 0, { surface: 'metal' })
  const face = cz + CROWN.z1
  kit.box({ x: cx, y: cy + SHAFT.y, z: face + 0.25, w: CROWN.x * 2 + 0.6, h: 6.4, d: 0.5, mat: mats.clad, uvScale: 3 })
  kit.box({ x: cx, y: cy + SHAFT.y, z: face + 0.52, w: CROWN.x * 2 + 0.6, h: 0.6, d: 0.06, mat: mats.stripes, uvScale: 1.2, castShadow: false })
  kit.box({ x: cx, y: cy + SHAFT.y, z: face + 0.54, w: 6.4, h: 4.6, d: 0.1, mat: mats.steel, castShadow: false })
  for (const side of [-1, 1]) glow.wall(cx + side * 3.35, cy + SHAFT.y + 2.3, face + 0.62, 0, 0.1, 4.6, SHAPE.solid, CYAN, 1.8)
  glow.wall(cx, cy + SHAFT.y + 4.72, face + 0.62, 0, 6.8, 0.1, SHAPE.solid, CYAN, 1.8)
  for (let i = 0; i < 4; i++) glow.wall(cx - 1.8 + i * 1.2, cy + SHAFT.y + 5.5, face + 0.56, 0, 1, 1, glyphCell(40 + i * 5), AMBER, 1.6)
  lights.pool(cx, cy + 3, face + 3.5, 8, CYAN, 0.9)

  // Its signs: two columns of glyphs and the tower's name, mirrored in the wet helipad.
  const columns: ReadonlyArray<readonly [number, string, GlowMode]> = [[-8.6, MAGENTA, MODE.breathe], [8.6, CYAN, MODE.faulty]]
  for (const [x, color, mode] of columns) {
    kit.box({ x: cx + x, y: cy + 7.2, z: face + 0.1, w: 3.2, h: 19.6, d: 0.2, mat: mats.steel, castShadow: false })
    glow.column(cx + x, cy + 17, face + 0.26, 0, 2.6, 19, glyphs(x > 0 ? 3 : 11, 7), color, 2.4, mode, 0.3)
    lights.bar(cx + x, face, cy + 7.5, cy + 26.5, color, 2, 0.9)
    lights.pool(cx + x * 0.8, cy + 9, face + 5, 12, color, 0.8)
  }
  kit.box({ x: cx, y: cy + 27.6, z: face + 0.1, w: 14.6, h: 4.2, d: 0.2, mat: mats.steel, castShadow: false })
  glow.wall(cx, cy + 29.7, face + 0.26, 0, 14, 3.5, wordCell(2), AMBER, 2.6, MODE.breathe)
  lights.bar(cx, face, cy + 28.2, cy + 31.2, AMBER, 1.6, 5)

  // Masts on its roof, and cables down to the helipad's rear pylons.
  mast(s, 6, CROWN.top, -33, 13, 0)
  mast(s, -7.5, CROWN.top, -30, 8, 0.45)
  for (const side of [-1, 1]) cable(s, [side * 11, 15, CROWN.z1 + 0.3], [side * Math.sin((140 * Math.PI) / 180) * 19.6, 4.5, Math.cos((140 * Math.PI) / 180) * 19.6], 1.6)
}

/* ── the way in ──────────────────────────────────────────── */

/** The catwalk bridge with its steam jets, the landing, and the stairs down to the arrival roof. */
function approach(s: Site): void {
  const { kit, cx, cy, cz, mats, glow, lights } = s

  // The bridge: grating on two beams, braced underneath.
  const bz = (BRIDGE.z0 + BRIDGE.z1) / 2
  const span = BRIDGE.z1 - BRIDGE.z0
  kit.box({ x: cx, y: cy - 0.1, z: cz + bz, w: BRIDGE.x * 2, h: 0.1, d: span, mat: mats.grate, uvScale: 1, collide: { surface: 'metal' } })
  for (const side of [-1, 1]) {
    kit.box({ x: cx + side * BRIDGE.x, y: cy - 0.55, z: cz + bz, w: 0.16, h: 0.5, d: span, mat: mats.steel })
    railing(s, side * (BRIDGE.x - 0.05), BRIDGE.z0, side * (BRIDGE.x - 0.05), BRIDGE.z1, 0, MAGENTA)
  }
  for (let z = BRIDGE.z0 + 1; z < BRIDGE.z1; z += 2) kit.box({ x: cx, y: cy - 0.42, z: cz + z, w: BRIDGE.x * 2, h: 0.12, d: 0.12, mat: mats.steel, castShadow: false })
  // Steam jets: a nozzle ring in the floor for each, fed by a pipe under the bridge.
  for (const j of JETS) {
    kit.cylinder({ x: cx, y: cy - 0.34, z: cz + j.z, r: 0.5, h: 0.22, segments: 12, mat: mats.stripes, uvScale: 0.8, castShadow: false })
    glow.flat(cx, cy + 0.02, cz + j.z, 1.5, 1.5, SHAPE.ring, AMBER, 1.6, MODE.breathe, j.beat.offset / j.beat.period)
    s.vents.push({ x: cx, y: cy + 0.1, z: cz + j.z, rise: 3.2, spread: 0.85, life: 0.9, beat: j.beat })
  }
  kit.add(new THREE.CylinderGeometry(0.11, 0.11, span, 8).rotateX(Math.PI / 2), mats.steel, place(cx + 0.9, cy - 0.34, cz + bz), { castShadow: false })

  // The landing on its four legs.
  const lw = LANDING.x1 - LANDING.x0
  const ld = LANDING.z1 - LANDING.z0
  const lx = (LANDING.x0 + LANDING.x1) / 2
  const lz = (LANDING.z0 + LANDING.z1) / 2
  kit.box({ x: cx + lx, y: cy - 0.1, z: cz + lz, w: lw, h: 0.1, d: ld, mat: mats.grate, uvScale: 1, collide: { surface: 'metal' } })
  kit.box({ x: cx + lx, y: cy - 0.3, z: cz + lz, w: lw, h: 0.2, d: 0.16, mat: mats.steel, castShadow: false })
  for (const x of [LANDING.x0 + 0.1, LANDING.x1 - 0.1]) {
    kit.box({ x: cx + x, y: cy - 0.3, z: cz + lz, w: 0.16, h: 0.2, d: ld, mat: mats.steel, castShadow: false })
    for (const z of [LANDING.z0 + 0.15, LANDING.z1 - 0.15]) kit.box({ x: cx + x, y: cy + LOW, z: cz + z, w: 0.2, h: -LOW - 0.1, d: 0.2, mat: mats.steel, collide: { surface: 'metal' } })
  }
  railing(s, LANDING.x0 + 0.05, LANDING.z0, LANDING.x0 + 0.05, LANDING.z1, 0)
  railing(s, LANDING.x1 - 0.05, LANDING.z0, LANDING.x1 - 0.05, LANDING.z1, 0)
  railing(s, LANDING.x0, LANDING.z0 + 0.05, -BRIDGE.x, LANDING.z0 + 0.05, 0)
  railing(s, BRIDGE.x, LANDING.z0 + 0.05, LANDING.x1, LANDING.z0 + 0.05, 0, CYAN)
  lamp(s, LANDING.x1 - 0.5, 0, LANDING.z0 + 0.5, CYAN, true)

  // The stairs: grating treads with warning-striped noses between two closed sides.
  const rise = -LOW / STAIRS.steps
  const length = STAIRS.steps * STAIRS.run
  const sx = cx + STAIRS.x
  for (let i = 0; i < STAIRS.steps; i++) {
    const top = LOW + (i + 1) * rise
    const z = cz + STAIRS.foot - STAIRS.run * (i + 0.5)
    kit.box({ x: sx, y: cy + top - 0.07, z, w: STAIRS.w, h: 0.07, d: STAIRS.run, mat: mats.grate, uvScale: 1 })
    kit.box({ x: sx, y: cy + top - 0.09, z: z + STAIRS.run / 2 - 0.04, w: STAIRS.w, h: 0.1, d: 0.08, mat: mats.stripes, uvScale: 0.6, castShadow: false })
    kit.solidBox(sx, cy + LOW, z, STAIRS.w, top - LOW, STAIRS.run, 0, { surface: 'metal' })
  }
  const pitch = Math.atan2(-LOW, length)
  for (const side of [-1, 1]) {
    const x = sx + side * (STAIRS.w / 2)
    const skirt = new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(length, 0), new THREE.Vector2(length, -LOW)]), { depth: 0.08, bevelEnabled: false })
    kit.add(scaleUv(skirt.rotateY(Math.PI / 2), 1 / 3, 1 / 3), mats.clad, place(x - 0.04, cy + LOW, cz + STAIRS.foot))
    // The handrail and its light, parallel to the flight; a stepped wall stands in for it.
    const midY = cy + LOW / 2 + 0.95
    const midZ = cz + STAIRS.foot - length / 2
    kit.add(new THREE.BoxGeometry(0.07, 0.07, Math.hypot(length, LOW)), mats.steel, place(x, midY, midZ, pitch, 0, 0), { castShadow: false })
    glow.quad(x - side * 0.05, midY - 0.2, midZ, 0, (-LOW / 2) * 0.98, (-length / 2) * 0.98, 0, 0.03, 0, SHAPE.solid, CYAN, 1.6)
    for (let k = 0; k <= 4; k++) {
      const u = k / 4
      kit.box({ x, y: cy + LOW + u * -LOW, z: cz + STAIRS.foot - u * length, w: 0.07, h: 0.95, d: 0.07, mat: mats.steel, castShadow: false })
    }
    for (let k = 0; k < 4; k++) {
      const top = LOW + (k + 1) * 4 * rise + LOW_TOP
      kit.solidBox(x, cy + LOW, cz + STAIRS.foot - STAIRS.run * (4 * k + 2), 0.1, top - LOW, STAIRS.run * 4, 0, { surface: 'metal' })
    }
  }
  kit.box({ x: sx, y: cy + LOW, z: cz + STAIRS.foot - length + 0.04, w: STAIRS.w, h: -LOW - 0.1, d: 0.08, mat: mats.clad, uvScale: 3 })
  lights.pool(sx - 2.2, cy + LOW + 2.2, cz + STAIRS.foot + 0.5, 6, CYAN, 1.1)
}

/** Where the player arrives: the lower roof with its plant, the exhaust fan and the sign. */
function arrivalRoof(s: Site): void {
  const { kit, cx, cy, cz, mats, glow, lights } = s
  const y = cy + LOW
  const rz = (ROOF.z0 + ROOF.z1) / 2
  const rd = ROOF.z1 - ROOF.z0
  kit.box({ x: cx, y: y - 0.8, z: cz + rz, w: ROOF.x * 2, h: 0.8, d: rd, mat: mats.deck, uvScale: 4, collide: { surface: 'stone' } })
  s.towers.push({ x: 0, z: rz, w: ROOF.x * 2 + 0.8, d: rd + 0.8, top: LOW - 0.8, yaw: 0, pane: 2.8, lit: 1, tint: [1, 1, 1], accent: [0.2, 1.4, 1.8] })
  // Parapet.
  for (const side of [-1, 1]) {
    kit.box({ x: cx + side * (ROOF.x - 0.25), y, z: cz + rz, w: 0.5, h: 0.7, d: rd, mat: mats.clad, collide: { surface: 'metal' } })
    kit.box({ x: cx, y, z: cz + rz + side * (rd / 2 - 0.25), w: ROOF.x * 2 - 1, h: 0.7, d: 0.5, mat: mats.clad, collide: { surface: 'metal' } })
  }

  // The stair house beside the arch, with its door lamp, a water tank and an aerial.
  const hx = cx - 8.6
  const hz = cz + 65.6
  kit.box({ x: hx, y, z: hz, w: 6, h: 3.2, d: 6, mat: mats.clad, uvScale: 3, collide: { surface: 'metal' } })
  kit.box({ x: hx, y: y + 3.2, z: hz, w: 6.4, h: 0.18, d: 6.4, mat: mats.steel })
  kit.box({ x: hx + 3.02, y, z: hz, w: 0.08, h: 2.2, d: 1.2, mat: mats.steel, castShadow: false })
  kit.box({ x: hx + 3.05, y: y + 2.3, z: hz, w: 0.3, h: 0.14, d: 0.6, mat: mats.steel, castShadow: false })
  glow.wall(hx + 3.22, y + 2.28, hz, Math.PI / 2, 0.5, 0.14, SHAPE.solid, AMBER, 2.6)
  lights.pool(hx + 4, y + 2.3, hz, 5.5, AMBER, 1.4)
  kit.cylinder({ x: hx - 0.6, y: y + 3.38, z: hz + 0.8, r: 1.5, h: 2.2, segments: 16, mat: mats.clad, uvScale: 3, collide: { surface: 'metal' } })
  kit.cylinder({ x: hx - 0.6, y: y + 5.58, z: hz + 0.8, r: 1.6, rTop: 0.2, h: 0.6, segments: 16, mat: mats.steel })
  mast(s, -6.6, LOW + 3.38, 63.4, 6.5, 0.2)

  // Air-conditioning units along the west side, piped together.
  for (const z of [51.2, 54.8, 58.4]) acUnit(s, -10.2, z, Math.PI / 2)
  acUnit(s, 10.4, 64.5, -Math.PI / 2)
  kit.add(new THREE.CylinderGeometry(0.13, 0.13, 12.6, 8).rotateX(Math.PI / 2), mats.steel, place(cx - 11.9, y + 0.5, cz + 56.2), { castShadow: false })
  kit.add(new THREE.CylinderGeometry(0.09, 0.09, 11, 8).rotateX(Math.PI / 2), mats.steel, place(cx - 11.9, y + 0.85, cz + 55.4), { castShadow: false })

  // Steam vents.
  for (const [x, z] of [[-6, 44], [10.8, 43.6], [-6.8, 61.2]] as const) {
    kit.cylinder({ x: cx + x, y, z: cz + z, r: 0.34, h: 0.9, segments: 10, mat: mats.steel, collide: { surface: 'metal' } })
    kit.cylinder({ x: cx + x, y: y + 0.9, z: cz + z, r: 0.44, rTop: 0.3, h: 0.16, segments: 10, mat: mats.stripes, uvScale: 0.8 })
    s.vents.push({ x: cx + x, y: y + 1.1, z: cz + z, rise: 4.2, spread: 1.1, life: 3.4 })
  }

  // The exhaust fan: stepping onto it throws the player up to the landing.
  const fx = cx + FAN.x
  const fz = cz + FAN.z
  kit.cylinder({ x: fx, y, z: fz, r: FAN.r, h: FAN.h, segments: 24, mat: mats.stripes, uvScale: 1.2, collide: { surface: 'metal', bounce: FAN.launch } })
  kit.cylinder({ x: fx, y: y + FAN.h, z: fz, r: FAN.r - 0.22, h: 0.02, segments: 24, mat: mats.steel, castShadow: false })
  kit.box({ x: fx, y: y + FAN.h + 0.02, z: fz, w: 1.75, h: 0.02, d: 1.75, mat: mats.grate, uvScale: 0.6, castShadow: false })
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2
    glow.flat(fx + Math.sin(a) * (FAN.r + 0.7), y + 0.03, fz + Math.cos(a) * (FAN.r + 0.7), 0.9, 0.9, SHAPE.chevron, CYAN, 2, MODE.breathe, k * 0.25, a)
  }
  s.vents.push({ x: fx, y: y + FAN.h + 0.2, z: fz, rise: 6, spread: 1.3, life: 1.5 })
  lights.pool(fx, y + 1.6, fz, 4.5, CYAN, 1)

  // The neon sign on its frame at the roof's north-west corner, and a lamp by the stairs.
  const sgx = cx - 8
  const sgz = cz + ROOF.z0 + 1.2
  for (const dx of [-3.6, 3.6]) kit.box({ x: sgx + dx, y, z: sgz - 0.12, w: 0.2, h: 6.2, d: 0.2, mat: mats.steel, collide: { surface: 'metal' } })
  kit.box({ x: sgx, y: y + 3.7, z: sgz - 0.05, w: 8.4, h: 2.6, d: 0.1, mat: mats.steel })
  glow.wall(sgx, y + 5, sgz + 0.06, 0, 8, 2, wordCell(0), MAGENTA, 2.6, MODE.faulty, 0.6)
  lights.bar(sgx, sgz, y + 4.1, y + 5.9, MAGENTA, 1.7, 3.2)
  lights.pool(sgx, y + 4, sgz + 3.5, 8, MAGENTA, 1.2)
  lamp(s, 11.3, LOW, 58.2, AMBER, false)

  // Cables with work lights strung from the stair house to the landing and across to the sign.
  cable(s, [-6.6, LOW + 9.4, 63.4], [LANDING.x0 + 0.05, LOW_TOP, LANDING.z1], 2.2, AMBER)
  cable(s, [-6.6, LOW + 9.2, 63.4], [-11.6, LOW + 6.2, ROOF.z0 + 1.1], 2.6)
  cable(s, [-4.4, LOW + 6.2, ROOF.z0 + 1.1], [-APRON.x + 0.9, APRON.y + 3.9, 33.5], 1.2)
}

/* ── props ───────────────────────────────────────────────── */

/** `count` glyphs of the made-up script, starting at `first`. */
function glyphs(first: number, count: number): Cell[] {
  return Array.from({ length: count }, (_, i) => glyphCell(first + i * 5))
}

/** A two-bar railing from (x0, z0) to (x1, z1) on a floor at height `y`, optionally with a light strip. */
function railing(s: Site, x0: number, z0: number, x1: number, z1: number, y: number, color?: string): void {
  const { kit, cx, cy, cz, mats } = s
  const len = Math.hypot(x1 - x0, z1 - z0)
  const yaw = Math.atan2(z0 - z1, x1 - x0)
  const mx = cx + (x0 + x1) / 2
  const mz = cz + (z0 + z1) / 2
  for (const h of [0.42, LOW_TOP - 0.06]) kit.box({ x: mx, y: cy + y + h, z: mz, w: len, h: 0.06, d: 0.06, yaw, mat: mats.steel, castShadow: false })
  const posts = Math.max(1, Math.round(len / 2.2))
  for (let i = 0; i <= posts; i++) {
    const k = i / posts
    kit.box({ x: cx + x0 + (x1 - x0) * k, y: cy + y, z: cz + z0 + (z1 - z0) * k, w: 0.07, h: LOW_TOP, d: 0.07, yaw, mat: mats.steel, castShadow: false })
  }
  kit.solidBox(mx, cy + y, mz, len, LOW_TOP, 0.1, yaw, { surface: 'metal' })
  if (color) s.glow.wall(mx, cy + y + 0.66, mz, yaw, len, 0.05, SHAPE.solid, color, 1.7)
}

/** A lamp post on a floor at height `y`; `mirrored`: bright enough to streak the wet floor. */
function lamp(s: Site, x: number, y: number, z: number, color: string, mirrored: boolean): void {
  const { kit, cx, cy, cz, mats, glow } = s
  const h = 3.9
  const px = cx + x
  const py = cy + y
  const pz = cz + z
  kit.cylinder({ x: px, y: py, z: pz, r: 0.08, h, segments: 6, mat: mats.steel, collide: { surface: 'metal' } })
  kit.box({ x: px, y: py + h, z: pz, w: 0.55, h: 0.1, d: 0.55, mat: mats.steel, castShadow: false })
  glow.flat(px, py + h - 0.02, pz, 0.5, 0.5, SHAPE.disc, color, 2.6)
  for (const yaw of [0, Math.PI / 2]) glow.wall(px, py + h - 0.16, pz, yaw, 0.7, 0.36, SHAPE.disc, color, 1.8)
  s.lights.pool(px, py + h - 0.5, pz, 6.5, color, 1.5)
  if (mirrored) s.lights.bar(px, pz, py + h - 0.5, py + h, color, 1.6, 0.3)
}

/** An aerial with a warning beacon on top, standing on a roof at height `y`. */
function mast(s: Site, x: number, y: number, z: number, h: number, phase: number): void {
  const { kit, cx, cy, cz, mats, glow } = s
  kit.cylinder({ x: cx + x, y: cy + y, z: cz + z, r: 0.1, rTop: 0.05, h, segments: 6, mat: mats.steel, castShadow: false })
  for (const k of [0.45, 0.7]) kit.box({ x: cx + x, y: cy + y + h * k, z: cz + z, w: 1.1, h: 0.05, d: 0.05, yaw: k * 5, mat: mats.steel, castShadow: false })
  for (const yaw of [0, Math.PI / 2]) glow.wall(cx + x, cy + y + h + 0.1, cz + z, yaw, 0.9, 0.9, SHAPE.disc, RED, 3, MODE.beacon, phase)
}

/** An air-conditioning unit on the arrival roof, its fan on top and a status light on the face toward `yaw`. */
function acUnit(s: Site, x: number, z: number, yaw: number): void {
  const { kit, cx, cy, cz, mats, glow } = s
  const px = cx + x
  const py = cy + LOW
  const pz = cz + z
  kit.box({ x: px, y: py, z: pz, w: 2.3, h: 0.14, d: 1.4, yaw, mat: mats.steel })
  kit.box({ x: px, y: py + 0.14, z: pz, w: 2.4, h: 1.2, d: 1.5, yaw, mat: mats.clad, uvScale: 1.5, collide: { surface: 'metal' } })
  kit.cylinder({ x: px, y: py + 1.34, z: pz, r: 0.56, h: 0.1, segments: 14, mat: mats.steel, castShadow: false })
  kit.box({ x: px, y: py + 1.44, z: pz, w: 0.8, h: 0.02, d: 0.8, yaw, mat: mats.grate, uvScale: 0.5, castShadow: false })
  const fx = Math.sin(yaw)
  const fz = Math.cos(yaw)
  glow.wall(px + fx * 0.77 + fz * 0.9, py + 1.1, pz + fz * 0.77 - fx * 0.9, yaw, 0.12, 0.12, SHAPE.disc, '#7dffb4', 2.2)
  glow.wall(px + fx * 0.77 - fz * 0.2, py + 0.7, pz + fz * 0.77 + fx * 0.2, yaw, 1.3, 0.7, SHAPE.louvre, VIOLET, 0.22)
}

/** A cable sagging between two points; `bulbs`: work lights strung along it. */
function cable(s: Site, a: readonly [number, number, number], b: readonly [number, number, number], sag: number, bulbs?: string): void {
  const { kit, cx, cy, cz } = s
  const n = 10
  const pts: THREE.Vector3[] = []
  for (let i = 0; i <= n; i++) {
    const k = i / n
    pts.push(new THREE.Vector3(cx + a[0] + (b[0] - a[0]) * k, cy + a[1] + (b[1] - a[1]) * k - sag * 4 * k * (1 - k), cz + a[2] + (b[2] - a[2]) * k))
  }
  kit.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.035, 4), s.mats.steel, undefined, { castShadow: false })
  if (!bulbs) return
  for (let i = 1; i < n; i++) {
    for (const yaw of [0, Math.PI / 2]) s.glow.wall(pts[i].x, pts[i].y - 0.14, pts[i].z, yaw, 0.3, 0.3, SHAPE.disc, bulbs, 2, MODE.breathe, i / n)
  }
}

/* ── the city ────────────────────────────────────────────── */

/** Window and roof-band colours a tower may have (linear rgb). */
const TINTS: ReadonlyArray<readonly [number, number, number]> = [[1, 1, 1], [1, 1, 1], [0.75, 0.9, 1.25], [1.25, 0.8, 1.05], [1.2, 1, 0.75]]
const ACCENTS: ReadonlyArray<readonly [number, number, number]> = [[2.2, 0.3, 1.7], [0.2, 1.6, 2.2], [2.2, 1.2, 0.3], [0.9, 0.5, 2.2], [0, 0, 0], [0, 0, 0]]

/** The towers close enough to matter: [x, z, width, depth, top, what its face carries]. */
const NEAR: ReadonlyArray<readonly [number, number, number, number, number, 'holo' | 'column' | 'word' | 'none', string]> = [
  [HOLO.x, HOLO.z, 20, 20, 2, 'holo', CYAN],
  [42, -46, 22, 22, 58, 'column', AMBER],
  [47, 4, 18, 20, 17, 'word', CYAN],
  [41, 55, 16, 18, 5, 'column', MAGENTA],
  [-49, 27, 18, 16, -9, 'none', CYAN],
  [-41, 65, 16, 20, 9, 'word', VIOLET],
]

/**
 * The skyline: the near towers (solid, each facing the helipad, some with signs) and `count`
 * more scattered into the haze. Returns the tower the holographic billboard floats over.
 */
function skyline(s: Site, count: number): Tower {
  const { kit, cx, cy, cz, rnd, glow } = s
  const pick = <T>(list: readonly T[]): T => list[Math.floor(rnd() * list.length)]
  const first = s.towers.length
  let word: WordId = 1
  for (const [x, z, w, d, top, sign, color] of NEAR) {
    const yaw = Math.atan2(-x, -z)
    const t: Tower = { x, z, w, d, top, yaw, pane: 2.6 + rnd() * 0.6, lit: 1.1 + rnd() * 0.3, tint: pick(TINTS), accent: pick(ACCENTS) }
    s.towers.push(t)
    kit.solidBox(cx + x, cy - 45, cz + z, w, top + 45, d, yaw, { surface: 'metal' })
    if (sign === 'column') columnSign(s, t, color, 0.5)
    if (sign === 'word') {
      const fx = cx + x + Math.sin(yaw) * (d / 2 + 0.3)
      const fz = cz + z + Math.cos(yaw) * (d / 2 + 0.3)
      glow.wall(fx, cy + top - 4, fz, yaw, 12, 3, wordCell(word), color, 2.6, MODE.breathe, rnd())
      word = 3
    }
  }
  const holoTower = s.towers[first]

  // The rest: anywhere that keeps a wide canyon round the roofs the player walks on.
  const placed: Tower[] = s.towers.slice(first)
  for (let tries = 0; placed.length < NEAR.length + count && tries < count * 12; tries++) {
    const a = rnd() * Math.PI * 2
    const dist = 62 + Math.pow(rnd(), 1.4) * 160
    const w = 13 + rnd() * 15
    const d = w * (0.7 + rnd() * 0.6)
    const x = Math.sin(a) * dist
    const z = Math.cos(a) * dist
    const reach = Math.max(w, d) * 0.75
    if (Math.abs(x) < SHAFT.x + 20 + reach && z > SHAFT.z0 - 20 - reach && z < ROOF.z1 + 20 + reach) continue
    if (placed.some(o => Math.hypot(o.x - x, o.z - z) < (Math.max(o.w, o.d) + Math.max(w, d)) * 0.72)) continue
    const top = -42 + rnd() * 62 + (rnd() < 0.22 ? rnd() * 55 : 0) + dist * 0.08
    const t: Tower = { x, z, w, d, top, yaw: Math.atan2(-x, -z) + (rnd() - 0.5) * 0.7, pane: 2.6 + rnd() * 1.6, lit: 0.8 + rnd() * 0.7, tint: pick(TINTS), accent: pick(ACCENTS) }
    placed.push(t)
    s.towers.push(t)
    if (dist < 150 && top > -12 && rnd() < 0.45) columnSign(s, t, pick([MAGENTA, CYAN, AMBER, VIOLET]), rnd())
    if (top > 26) {
      const bx = cx + x
      const bz = cz + z
      kit.box({ x: bx, y: cy + top, z: bz, w: 0.5, h: 9, d: 0.5, mat: s.mats.steel, castShadow: false })
      for (const yaw of [0, Math.PI / 2]) glow.wall(bx, cy + top + 9.4, bz, yaw, 2.4, 2.4, SHAPE.disc, RED, 2.6, MODE.beacon, rnd())
    }
  }
  return holoTower
}

/** A tall column of glyphs on a tower's face. */
function columnSign(s: Site, t: Tower, color: string, phase: number): void {
  const { cx, cy, cz, rnd } = s
  const h = Math.min(26, Math.max(10, (t.top + 40) * 0.4))
  const w = h / 6
  const side = (rnd() - 0.5) * (t.w - w - 2)
  const fx = cx + t.x + Math.sin(t.yaw) * (t.d / 2 + 0.3) + Math.cos(t.yaw) * side
  const fz = cz + t.z + Math.cos(t.yaw) * (t.d / 2 + 0.3) - Math.sin(t.yaw) * side
  s.glow.column(fx, cy + t.top - 3 - h / 2, fz, t.yaw, w, h, glyphs(Math.floor(rnd() * 60), 6), color, 2.4, rnd() < 0.3 ? MODE.faulty : MODE.breathe, phase)
}

/** Writes the towers into their instanced mesh. */
function fillTowers(mesh: THREE.InstancedMesh, s: Site): void {
  const n = s.towers.length
  const tint = new Float32Array(n * 3)
  const accent = new Float32Array(n * 3)
  const win = new Float32Array(n * 4)
  const bottom = -STREETS - 4
  const up = new THREE.Vector3(0, 1, 0)
  const q = new THREE.Quaternion()
  const m = new THREE.Matrix4()
  const pos = new THREE.Vector3()
  const scale = new THREE.Vector3()
  s.towers.forEach((t, i) => {
    m.compose(pos.set(s.cx + t.x, s.cy + (t.top + bottom) / 2, s.cz + t.z), q.setFromAxisAngle(up, t.yaw), scale.set(t.w, t.top - bottom, t.d))
    mesh.setMatrixAt(i, m)
    tint.set(t.tint, i * 3)
    accent.set(t.accent, i * 3)
    win.set([s.rnd(), s.rnd(), t.pane, t.lit], i * 4)
  })
  mesh.geometry.setAttribute('aTint', new THREE.InstancedBufferAttribute(tint, 3))
  mesh.geometry.setAttribute('aAccent', new THREE.InstancedBufferAttribute(accent, 3))
  mesh.geometry.setAttribute('aWin', new THREE.InstancedBufferAttribute(win, 4))
  mesh.instanceMatrix.needsUpdate = true
  mesh.name = 'neon-towers'
  mesh.frustumCulled = false
}

/** Sky-car lanes passing the roofs at a distance: [bearing (deg), distance, height, colour]. */
const LANES: ReadonlyArray<readonly [number, number, number, string]> = [
  [180, 118, 8, RED],
  [232, 84, -26, '#ffe2b0'],
  [95, 132, 22, CYAN],
  [318, 96, -12, RED],
  [20, 140, 30, '#ffe2b0'],
  [140, 100, -34, MAGENTA],
]

function trafficLanes(s: Site, count: number): Lane[] {
  return LANES.slice(0, count).map(([deg, dist, y, color], i) => {
    const a = (deg * Math.PI) / 180
    const mx = s.cx + Math.sin(a) * dist
    const mz = s.cz + Math.cos(a) * dist
    // Along the tangent, alternate lanes flying opposite ways.
    const dir = i % 2 ? -1 : 1
    const tx = Math.cos(a) * 170 * dir
    const tz = -Math.sin(a) * 170 * dir
    return { a: new THREE.Vector3(mx - tx, s.cy + y, mz - tz), b: new THREE.Vector3(mx + tx, s.cy + y, mz + tz), cars: 7, time: 22 + i * 3, color }
  })
}
