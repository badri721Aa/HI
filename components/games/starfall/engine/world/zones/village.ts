/**
 * Meadow Village — timber-framed plaster houses with terracotta roofs (solid, walkable roofs),
 * the well, fences along the paths, a market stall, hay, a cart, lamp posts and the windmill.
 *
 * Windmill climb (heights above the windmill's ground, every step ≤ 1.3 m):
 *   hay bale +1.0 → crates +2.2 → shed roof +3.4 → crate +4.5 → crates +5.7
 *   → stage (balcony ring) +7.0 → three steps on the tower +8.1 / +9.2 / +10.2 → cap +11.2 (shard 1).
 * The sails turn in their own small batch so they can rotate.
 */
import * as THREE from 'three'
import type { Ctx } from '../../types'
import { heightAt } from '../heightfield'
import { HOUSES, WELL, WINDMILL } from '../level'
import { ZoneKit, worldCylinder, type ZonePart } from './kit'
import {
  barrel, beam, crate, crateStack, frame, gableGeometry, hangingLantern, lanternPost, localXZ, openCylinder, place, rod,
  roofSteps, slab, solidCyl, tbox, type Mat,
} from './beach'

const WX = WINDMILL.x
const WZ = WINDMILL.z
/** Distance from the tower axis to the sail plane (clear of the stage railing). */
const HUB_OUT = 4.6
const HUB_Y = 9.4
const STAGE_R = 4.1
const CAP_R = 2.55
/** Timber tower: radius at the stone base top (+2.6) and at the cap (+11). */
const TOWER = { y0: 2.6, y1: 11, r0: 2.8, r1: 2.1 }
/** Climbing steps on the tower above the stage: [height above ground, angle (rad, atan2(z, x))]. */
const STEPS: Array<[number, number]> = [[8.1, 0.84], [9.2, 0.14], [10.2, -0.56]]
const STAGE_GAP: [number, number] = [1.15, 1.96]

export function buildVillage(ctx: Ctx): ZonePart {
  const kit = new ZoneKit(ctx, 'village')
  const hay = kit.mat('cloth', { color: 0xd8b25c, roughness: 1, key: 'hay' })
  HOUSES.forEach((h, i) => buildHouse(kit, h, i))
  buildWell(kit)
  buildWindmill(kit, hay)
  buildMarket(kit, hay)
  buildFences(kit)
  buildProps(kit, hay)

  const sailKit = new ZoneKit(ctx, 'village-sails')
  const sails = sailKit.root
  const g = heightAt(WX, WZ)
  sails.position.set(WX - HUB_OUT, g + HUB_Y, WZ)
  sails.rotation.order = 'YXZ'
  sails.rotation.y = -Math.PI / 2
  buildSails(sailKit, kit.mat('darkPlanks'), kit.mat('cloth'))
  sailKit.finalize()

  kit.finalize()
  return {
    update(_dt, t) {
      sails.rotation.z = (-t * 0.45) % (Math.PI * 2)
    },
    dispose() {
      sailKit.dispose()
      kit.dispose()
    },
  }
}

/* ── houses ─────────────────────────────────────────────── */

interface HouseDef {
  x: number
  z: number
  yaw: number
  w: number
  d: number
}

/**
 * Gable-fronted house: ridge along local x (w), front door on the +x gable end (the level data
 * yaws every house so +x faces the village centre or its path).
 */
function buildHouse(kit: ZoneKit, h: HouseDef, i: number): void {
  const { x, z, yaw, w, d } = h
  const wall = [2.9, 3.1, 2.8, 3.0][i % 4]
  const pitch = 0.64
  const tan = Math.tan(pitch)
  let gMin = Infinity
  let gMax = -Infinity
  for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]]) {
    const [px, pz] = localXZ(x, z, yaw, (lx * w) / 2, (lz * d) / 2)
    const g = heightAt(px, pz)
    gMin = Math.min(gMin, g)
    gMax = Math.max(gMax, g)
  }
  const F = gMax + 0.3
  const m = frame(x, 0, z, yaw)
  const top = F + wall
  const rise = (d / 2) * tan

  // Stone plinth, plaster walls and gables.
  tbox(kit, 'stone', 0, (gMin - 0.4 + F) / 2, 0, w + 0.3, F - gMin + 0.4, d + 0.3, 0, 0, 0, 1.6, m)
  tbox(kit, 'plaster', 0, F + wall / 2, 0, w, wall, d, 0, 0, 0, 2.5, m)
  for (const s of [-1, 1]) {
    const gg = gableGeometry(d, rise, 0.12, 2.5)
    gg.applyMatrix4(place(s * (w / 2 - 0.06), top, 0, 0, 0, 0, m))
    kit.add(gg, 'plaster')
  }

  // Roof: two tiled slabs with overhangs, barge boards and a ridge cap.
  const ov = 0.45
  const ovx = 0.3
  const half = d / 2 + ov
  const drop = ov * tan
  const slabLen = half / Math.cos(pitch)
  for (const s of [-1, 1]) {
    tbox(kit, 'roof', 0, top + (rise - drop) / 2 + 0.09, (s * half) / 2, w + ovx * 2, 0.16, slabLen, 0, s * pitch, 0, 1.8, m)
    for (const e of [-1, 1]) {
      beam(kit, 'darkPlanks', e * (w / 2 + ovx), top - drop + 0.1, s * half, e * (w / 2 + ovx), top + rise + 0.1, 0, 0.07, 0.22, 1, m)
    }
  }
  beam(kit, 'darkPlanks', -w / 2 - ovx - 0.05, top + rise + 0.2, 0, w / 2 + ovx + 0.05, top + rise + 0.2, 0, 0.26, 0.14, 1, m)

  // Timber framing on the long walls, with windows in the middle bays.
  const bays = Math.max(3, Math.round(w / 1.75))
  for (const s of [-1, 1]) {
    const fz = s * (d / 2 + 0.03)
    for (const y of [F + 0.08, F + 0.9, top - 0.08]) tbox(kit, 'darkPlanks', 0, y, fz, w + 0.04, 0.16, 0.08, 0, 0, 0, 1, m)
    for (let k = 0; k <= bays; k++) {
      const bx = -w / 2 + (k * w) / bays
      // Posts stand 2 cm proud of the rails: equal depths would put coplanar faces at every crossing (z-fighting).
      tbox(kit, 'darkPlanks', bx, F + wall / 2, s * (d / 2 + 0.04), 0.17, wall, 0.1, 0, 0, 0, 1, m)
    }
    const bw = w / bays
    beam(kit, 'darkPlanks', -w / 2 + 0.1, F + 0.95, fz, -w / 2 + bw - 0.1, top - 0.15, fz, 0.12, 0.06, 1, m)
    beam(kit, 'darkPlanks', w / 2 - 0.1, F + 0.95, fz, w / 2 - bw + 0.1, top - 0.15, fz, 0.12, 0.06, 1, m)
    for (let k = 1; k < bays - 1; k++) houseWindow(kit, m, -w / 2 + (k + 0.5) * bw, F + 1.5, fz, s > 0 ? 0 : Math.PI)
  }

  // Gable ends: tie beam, sill, posts either side of an attic window, collar beam; door + lantern on +x.
  for (const e of [-1, 1]) {
    const gx = e * (w / 2 + 0.03)
    tbox(kit, 'darkPlanks', gx, top - 0.08, 0, 0.08, 0.16, d + 0.04, 0, 0, 0, 1, m)
    tbox(kit, 'darkPlanks', gx, F + 0.08, 0, 0.08, 0.16, d + 0.04, 0, 0, 0, 1, m)
    for (const pz of [-0.9, 0.9]) {
      const py = top + rise * (1 - 0.9 / (d / 2)) - 0.05
      tbox(kit, 'darkPlanks', gx, (top + py) / 2, pz, 0.08, py - top, 0.15, 0, 0, 0, 1, m)
    }
    const cy = top + rise * 0.78
    const cw = d * 0.22
    tbox(kit, 'darkPlanks', gx, cy, 0, 0.08, 0.14, cw * 2, 0, 0, 0, 1, m)
    houseWindow(kit, m, gx, top + rise * 0.3, 0, e > 0 ? Math.PI / 2 : -Math.PI / 2, 0.5, 0.58)
  }
  const fx = w / 2 + 0.03
  for (const lz of [-0.75, 0.75]) tbox(kit, 'darkPlanks', fx + 0.02, F + wall / 2, lz, 0.12, wall, 0.17, 0, 0, 0, 1, m)
  tbox(kit, 'darkPlanks', fx + 0.02, F + 1.02, 0, 0.08, 2.04, 1.1, 0, 0, 0, 1, m)
  tbox(kit, 'planks', fx + 0.05, F + 1.0, 0, 0.06, 1.95, 0.98, 0, 0, 0, 0.8, m)
  tbox(kit, 'metal', fx + 0.1, F + 1.0, 0.33, 0.05, 0.08, 0.08, 0, 0, 0, 1, m)
  tbox(kit, 'darkPlanks', fx, F + 2.1, 0, 0.12, 0.14, 1.4, 0, 0, 0, 1, m)
  beam(kit, 'darkPlanks', fx, F + 2.5, 0.85, fx + 0.55, F + 2.5, 0.85, 0.06, 0.08, 1, m)
  const [lx0, lz0] = localXZ(x, z, yaw, fx + 0.48, 0.85)
  hangingLantern(kit, lx0, F + 2.46, lz0)
  houseWindow(kit, m, -fx, F + 1.5, 0.9, -Math.PI / 2)
  const [sx, sz] = localXZ(x, z, yaw, fx + 0.45, 0)
  const gs = heightAt(sx, sz)
  kit.box({ x: sx, y: gs - 0.3, z: sz, w: 1.5, h: F - 0.16 - gs + 0.3, d: 0.8, yaw: yaw + Math.PI / 2, mat: 'stone', uvScale: 1, collide: true })

  // Chimney through the back slope.
  const cxL = -w / 2 + 1.1
  const czL = -d / 4
  const chTop = top + rise + 0.9
  const chBot = top - 0.6
  tbox(kit, 'stone', cxL, (chTop + chBot) / 2, czL, 0.72, chTop - chBot, 0.72, 0, 0, 0, 1, m)
  tbox(kit, 'stone', cxL, chTop + 0.06, czL, 0.9, 0.12, 0.9, 0, 0, 0, 1, m)
  const [cx, cz] = localXZ(x, z, yaw, cxL, czL)
  kit.solidBox(cx, chBot, cz, 0.72, chTop + 0.12 - chBot, 0.72, yaw, { surface: 'stone' })

  // Solid body and walkable roof.
  kit.solidBox(x, gMin - 0.3, z, w + 0.3, top - gMin + 0.3, d + 0.3, yaw, { surface: 'stone' })
  const eave = top - drop
  const riseAll = rise + drop
  roofSteps(kit, x, z, yaw, eave, half, riseAll, w + ovx * 2)

  // Houses 0 and 2: crates against the back wall lead up onto the roof.
  if (i === 0 || i === 2) {
    const n = Math.max(2, Math.ceil(riseAll / 0.38))
    const firstStep = eave + riseAll * (0.6 / n) + 0.08
    const [ax, az] = localXZ(x, z, yaw, -0.6, -(d / 2 + 1.05))
    crateStack(kit, ax, az, firstStep - 1.15, 1.05, yaw)
    const [bx, bz] = localXZ(x, z, yaw, 0.7, -(d / 2 + 2.15))
    if (firstStep - 2.25 - heightAt(bx, bz) > 0.5) crateStack(kit, bx, bz, firstStep - 2.25, 1.0, yaw + 0.4)
    const [rx, rz] = localXZ(x, z, yaw, 1.9, -(d / 2 + 1.0))
    barrel(kit, rx, heightAt(rx, rz) - 0.05, rz, { collide: true })
  }

  // A barrel and a crate either side of the door.
  const [px, pz] = localXZ(x, z, yaw, w / 2 + 0.6, d / 2 - 0.45)
  barrel(kit, px, heightAt(px, pz) - 0.05, pz, { collide: true, yaw: i })
  const [qx, qz] = localXZ(x, z, yaw, w / 2 + 0.65, -(d / 2 - 0.55))
  crate(kit, qx, heightAt(qx, qz) - 0.05, qz, 0.8, yaw + 0.3 * i)
  if (i % 2 === 1) crate(kit, qx, heightAt(qx, qz) + 0.74, qz, 0.6, yaw - 0.4)
}

/** Glowing window with frame, sill and shutters, centred at local (x, y, z) facing `face` (yaw). */
function houseWindow(kit: ZoneKit, m: THREE.Matrix4, x: number, y: number, z: number, face: number, ww = 0.7, wh = 0.8): void {
  const c = Math.cos(face)
  const s = Math.sin(face)
  const at = (along: number, out: number): [number, number] => [x + along * c + out * s, z - along * s + out * c]
  const p = (along: number, yy: number, out: number, w: number, h: number, d: number, mat: Mat, uv = 1) => {
    const [px, pz] = at(along, out)
    tbox(kit, mat, px, yy, pz, w, h, d, face, 0, 0, uv, m)
  }
  p(0, y, 0.01, ww, wh, 0.04, 'glow')
  p(0, y, 0.05, 0.06, wh, 0.05, 'darkPlanks')
  p(0, y + wh / 2 + 0.05, 0.05, ww + 0.16, 0.1, 0.07, 'darkPlanks')
  p(0, y - wh / 2 - 0.05, 0.09, ww + 0.24, 0.08, 0.16, 'darkPlanks')
  for (const e of [-1, 1]) {
    p(e * (ww / 2 + 0.05), y, 0.05, 0.08, wh + 0.1, 0.07, 'darkPlanks')
    p(e * (ww / 2 + 0.26), y, 0.04, 0.36, wh, 0.04, 'planks', 0.6)
  }
}

/* ── well ───────────────────────────────────────────────── */

function buildWell(kit: ZoneKit): void {
  const { x, z } = WELL
  const g = heightAt(x, z)
  const rim = g + 0.85
  kit.add(openCylinder(1.05, 1.1, 1.15, 16, 1.5), 'stone', place(x, rim - 0.575, z))
  kit.add(openCylinder(0.8, 0.8, 0.9, 16, 1.5, true), 'stone', place(x, rim - 0.45, z))
  slab(kit, 'stone', x, rim + 0.06, z, 0.76, 1.12, 0.12, 16, 1)
  slab(kit, 'metal', x, g + 0.4, z, 0, 0.8, 0.02, 16, 2)
  solidCyl(kit, x, g - 0.3, z, 1.1, rim + 0.06 - (g - 0.3), 'stone')
  // Posts, windlass, little roof.
  const roofY = g + 2.35
  for (const s of [-1, 1]) {
    kit.box({ x: x + s * 0.92, y: rim, z, w: 0.14, h: roofY - rim, d: 0.14, mat: 'darkPlanks', uvScale: 1, collide: { surface: 'wood' } })
  }
  beam(kit, 'darkPlanks', x - 1.2, roofY, z, x + 1.2, roofY, z, 0.14, 0.16, 1)
  rod(kit, 'darkPlanks', x - 0.92, rim + 0.75, z, x + 0.92, rim + 0.75, z, 0.08, 8, 1)
  beam(kit, 'metal', x + 0.98, rim + 0.75, z, x + 1.15, rim + 0.75, z, 0.03, 0.03, 1)
  beam(kit, 'metal', x + 1.15, rim + 0.75, z, x + 1.15, rim + 0.5, z + 0.12, 0.03, 0.03, 1)
  rod(kit, 'rope', x + 0.1, rim + 0.7, z, x + 0.1, g + 1.25, z, 0.015, 4)
  barrel(kit, x + 0.1, g + 0.95, z, { r: 0.15, h: 0.28 })
  const pitch = 0.62
  const half = 0.85
  for (const s of [-1, 1]) {
    tbox(kit, 'roof', x, roofY + (half / 2) * Math.tan(pitch) + 0.08, z + (s * half) / 2, 2.7, 0.1, half / Math.cos(pitch), 0, s * pitch, 0, 1.6)
  }
  tbox(kit, 'darkPlanks', x, roofY + half * Math.tan(pitch) + 0.12, z, 2.8, 0.1, 0.16, 0, 0, 0, 1)
  for (const s of [-1, 1]) {
    const gg = gableGeometry(half * 2 - 0.2, (half - 0.1) * Math.tan(pitch), 0.06, 1)
    gg.applyMatrix4(place(x + s * 0.92, roofY + 0.08, z))
    kit.add(gg, 'darkPlanks')
  }
}

/* ── windmill ───────────────────────────────────────────── */

const towerR = (y: number) => TOWER.r0 + ((TOWER.r1 - TOWER.r0) * (y - TOWER.y0)) / (TOWER.y1 - TOWER.y0)

function buildWindmill(kit: ZoneKit, hay: THREE.Material): void {
  const g = heightAt(WX, WZ)
  const at = (r: number, a: number): [number, number] => [WX + Math.cos(a) * r, WZ + Math.sin(a) * r]

  // Stone base (octagonal), timber smock tower, corner posts.
  kit.cylinder({ x: WX, y: g - 1.2, z: WZ, r: 3.25, rTop: 3.05, h: TOWER.y0 + 1.2, segments: 8, mat: 'stone', uvScale: 1.8 })
  kit.cylinder({ x: WX, y: g + TOWER.y0 - 0.05, z: WZ, r: 3.12, h: 0.22, segments: 8, mat: 'darkPlanks', uvScale: 1 })
  kit.cylinder({ x: WX, y: g + TOWER.y0, z: WZ, r: TOWER.r0, rTop: TOWER.r1, h: TOWER.y1 - TOWER.y0, segments: 8, mat: 'planks', uvScale: 1.5 })
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2
    const sx = Math.sin(a)
    const cz = Math.cos(a)
    beam(kit, 'darkPlanks', WX + sx * (TOWER.r0 + 0.03), g + TOWER.y0, WZ + cz * (TOWER.r0 + 0.03), WX + sx * (TOWER.r1 + 0.03), g + TOWER.y1, WZ + cz * (TOWER.r1 + 0.03), 0.18, 0.18, 1)
  }
  // Colliders: the base, then the tapering tower in bands so the stage stays roomy.
  solidCyl(kit, WX, g - 1.2, WZ, 3.15, TOWER.y0 + 1.2, 'stone')
  for (const [y0, y1] of [[TOWER.y0, 5], [5, 7], [7, 9], [9, 10.95]]) solidCyl(kit, WX, g + y0, WZ, towerR((y0 + y1) / 2), y1 - y0, 'wood')

  // Door toward the path (north-north-east) and a few lit windows, all centred on octagon faces
  // (face centres sit at odd multiples of π/8 in atan2(z, x)).
  const P8 = Math.PI / 8
  {
    const a = -3 * P8
    const yaw = Math.atan2(Math.cos(a), Math.sin(a))
    const [dx0, dz0] = at(3.13 * Math.cos(P8) + 0.05, a)
    tbox(kit, 'darkPlanks', dx0, g + 0.95, dz0, 1.05, 2.1, 0.12, yaw, 0, 0, 1)
    const [lx0, lz0] = at(3.1 * Math.cos(P8) + 0.1, a)
    tbox(kit, 'stone', lx0, g + 2.08, lz0, 1.45, 0.22, 0.22, yaw, 0, 0, 1)
  }
  for (const [y, a] of [[4.3, -7 * P8], [5.6, 5 * P8], [8.4, -5 * P8], [6.0, -P8]] as Array<[number, number]>) {
    const r = towerR(y) * Math.cos(P8) + 0.02
    const [px, pz] = at(r, a)
    const yaw = Math.atan2(Math.cos(a), Math.sin(a))
    tbox(kit, 'glow', px, g + y, pz, 0.5, 0.65, 0.05, yaw, 0, 0, 1)
    tbox(kit, 'darkPlanks', px, g + y + 0.38, pz, 0.7, 0.1, 0.1, yaw, 0, 0, 1)
    tbox(kit, 'darkPlanks', px, g + y - 0.38, pz, 0.7, 0.1, 0.14, yaw, 0, 0, 1)
  }

  // Stage (balcony ring) with struts and a railing; opening to the south where the crates arrive.
  slab(kit, 'planks', WX, g + 7, WZ, 2.3, STAGE_R, 0.22, 16, 1.6, Math.PI / 16)
  solidCyl(kit, WX, g + 6.78, WZ, STAGE_R, 0.22, 'wood')
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8
    const [ix, iz] = at(towerR(5.5) - 0.05, a)
    const [ox, oz] = at(STAGE_R - 0.3, a)
    beam(kit, 'darkPlanks', ix, g + 5.5, iz, ox, g + 6.8, oz, 0.14, 0.14, 1)
  }
  ringRailing(kit, WX, WZ, STAGE_R - 0.12, g + 7, 16, a => a > STAGE_GAP[0] && a < STAGE_GAP[1])

  // Steps spiralling up the tower to the cap, each on a bracket.
  for (const [y, a] of STEPS) {
    const rIn = towerR(y) + 0.02
    const rOut = 3.75
    const [px, pz] = at((rIn + rOut) / 2, a)
    const yaw = Math.atan2(Math.cos(a), Math.sin(a))
    kit.box({ x: px, y: g + y - 0.14, z: pz, w: 1.3, h: 0.14, d: rOut - rIn, yaw, mat: 'planks', uvScale: 1, collide: { surface: 'wood' } })
    const [bx0, bz0] = at(towerR(y - 1) + 0.05, a)
    const [bx1, bz1] = at(rOut - 0.25, a)
    beam(kit, 'darkPlanks', bx0, g + y - 1.0, bz0, bx1, g + y - 0.16, bz1, 0.12, 0.12, 1)
  }

  // Flat cap platform with a low railing (open toward the last step).
  kit.cylinder({ x: WX, y: g + TOWER.y1 - 0.35, z: WZ, r: TOWER.r1 + 0.18, h: 0.35, segments: 8, mat: 'darkPlanks', uvScale: 1 })
  slab(kit, 'planks', WX, g + WINDMILL.capY, WZ, 0, CAP_R, 0.25, 8, 1.6)
  solidCyl(kit, WX, g + WINDMILL.capY - 0.25, WZ, CAP_R, 0.25, 'wood')
  const last = STEPS[STEPS.length - 1][1]
  ringRailing(kit, WX, WZ, CAP_R - 0.12, g + WINDMILL.capY, 8, a => Math.abs(angleDiff(a, last)) < 0.45, WINDMILL.towerHeight - WINDMILL.capY)

  // Sail housing (dormer) and windshaft on the west face.
  const dx = WX - towerR(HUB_Y) - 0.45
  tbox(kit, 'planks', dx, g + HUB_Y, WZ, 1.3, 1.5, 1.4, 0, 0, 0, 1.2)
  tbox(kit, 'roof', dx - 0.05, g + HUB_Y + 0.85, WZ, 1.6, 0.14, 1.7, 0, 0, 0.18, 1.5)
  rod(kit, 'darkPlanks', dx - 0.5, g + HUB_Y, WZ, WX - HUB_OUT + 0.3, g + HUB_Y, WZ, 0.17, 8, 1)

  // Store shed on the south side (plaster, timber frame, flat tiled roof falling gently away from
  // the tower); crates and hay lead up onto it and on to the stage.
  const shed = { x: WX + 0.8, z: WZ + 6.2, w: 4.0, d: 2.6 }
  const roofY = g + 3.4
  const sg = Math.min(heightAt(shed.x - 2, shed.z - 1.3), heightAt(shed.x + 2, shed.z + 1.3), heightAt(shed.x, shed.z))
  const wallTop = roofY - 0.22
  kit.box({ x: shed.x, y: sg - 0.3, z: shed.z, w: shed.w + 0.2, h: 0.65, d: shed.d + 0.2, mat: 'stone', uvScale: 1.2 })
  kit.box({ x: shed.x, y: sg + 0.35, z: shed.z, w: shed.w, h: wallTop - sg - 0.35, d: shed.d, mat: 'plaster', uvScale: 2 })
  kit.solidBox(shed.x, sg - 0.3, shed.z, shed.w + 0.2, roofY - sg + 0.3, shed.d + 0.2, 0, { surface: 'wood' })
  for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    tbox(kit, 'darkPlanks', shed.x + (ox * shed.w) / 2, (wallTop + sg + 0.35) / 2, shed.z + (oz * shed.d) / 2, 0.17, wallTop - sg - 0.35, 0.17, 0, 0, 0, 1)
  }
  for (const oz of [-1, 1]) tbox(kit, 'darkPlanks', shed.x, wallTop - 0.08, shed.z + (oz * shed.d) / 2 + oz * 0.03, shed.w + 0.04, 0.16, 0.08, 0, 0, 0, 1)
  for (const ox of [-1, 1]) tbox(kit, 'darkPlanks', shed.x + (ox * shed.w) / 2 + ox * 0.03, wallTop - 0.08, shed.z, 0.08, 0.16, shed.d + 0.04, 0, 0, 0, 1)
  beam(kit, 'darkPlanks', shed.x - shed.w / 2 + 0.1, sg + 0.45, shed.z + shed.d / 2 + 0.03, shed.x - shed.w / 2 + 1.3, wallTop - 0.15, shed.z + shed.d / 2 + 0.03, 0.12, 0.06, 1)
  tbox(kit, 'roof', shed.x, roofY - 0.1, shed.z + 0.05, shed.w + 0.5, 0.2, shed.d + 0.6, 0, 0.07, 0, 1.6)
  tbox(kit, 'darkPlanks', shed.x + shed.w / 2 + 0.04, sg + 1.0, shed.z + 0.2, 0.06, 1.9, 1.0, 0, 0, 0, 1)
  tbox(kit, 'darkPlanks', shed.x + shed.w / 2 + 0.06, sg + 2.0, shed.z + 0.2, 0.08, 0.12, 1.25, 0, 0, 0, 1)
  houseWindow(kit, new THREE.Matrix4(), shed.x + 0.6, sg + 1.7, shed.z + shed.d / 2 + 0.03, 0, 0.55, 0.5)
  hayBale(kit, hay, WX + 4.6, WZ + 8.1, 0.2, g + 1.0)
  crateStack(kit, WX + 3.9, WZ + 6.6, g + 2.2, 1.1, 0.15)
  crate(kit, WX + 2.0, roofY, WZ + 5.6, 1.05, 0.25, true, 1.1)
  crate(kit, WX + 0.2, roofY, WZ + 5.45, 1.1, -0.1, true, 1.15)
  crate(kit, WX + 0.2, roofY + 1.15, WZ + 5.45, 1.0, 0.2, true, 1.15)
  // Decorative hay and sacks around the shed.
  hayBale(kit, hay, WX + 5.4, WZ + 5.2, 1.4)
  hayBale(kit, hay, WX + 5.3, WZ + 3.9, 1.3)
  hayBale(kit, hay, WX + 5.35, WZ + 4.5, 1.35, heightAt(WX + 5.35, WZ + 4.5) + 1.7)
}

/** Shortest signed difference between two angles. */
function angleDiff(a: number, b: number): number {
  let d = a - b
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return d
}

/** Circular railing of `n` sections around (x, z) at radius r; `skip(angle)` leaves openings. */
function ringRailing(kit: ZoneKit, x: number, z: number, r: number, base: number, n: number, skip: (a: number) => boolean, h = 1.0): void {
  const open = (k: number) => skip(angleDiff((((k % n) + n + 0.5) / n) * Math.PI * 2, 0))
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * Math.PI * 2
    const a1 = ((k + 1) / n) * Math.PI * 2
    const x0 = x + Math.cos(a0) * r
    const z0 = z + Math.sin(a0) * r
    const x1 = x + Math.cos(a1) * r
    const z1 = z + Math.sin(a1) * r
    if (!open(k) || !open(k - 1)) kit.box({ x: x0, y: base, z: z0, w: 0.12, h, d: 0.12, mat: 'darkPlanks', uvScale: 1 })
    if (open(k)) continue
    beam(kit, 'darkPlanks', x0, base + h - 0.04, z0, x1, base + h - 0.04, z1, 0.09, 0.08, 1)
    beam(kit, 'darkPlanks', x0, base + h * 0.5, z0, x1, base + h * 0.5, z1, 0.05, 0.06, 1)
    kit.solidBox((x0 + x1) / 2, base, (z0 + z1) / 2, 0.14, h, Math.hypot(x1 - x0, z1 - z0), Math.atan2(x1 - x0, z1 - z0), { surface: 'wood' })
  }
}

/**
 * Four sails in the hub's local frame (axle = local z, sails sweep the xy plane).
 * Materials come from the main village kit so nothing is duplicated (two batches: timber + cloth).
 */
function buildSails(kit: ZoneKit, frameMat: THREE.Material, cloth: THREE.Material): void {
  const hub = worldCylinder(0.42, 0.42, 0.7, 10, 1)
  kit.add(hub, frameMat, place(0, 0, 0.05, 0, Math.PI / 2, 0))
  kit.add(worldCylinder(0.25, 0.3, 0.12, 10, 1), frameMat, place(0, 0, 0.45, 0, Math.PI / 2, 0))
  const L = 6.2
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2
    const ux = Math.cos(a)
    const uy = Math.sin(a)
    const px = -uy
    const py = ux
    const P = (r: number, o: number, zz: number): [number, number, number] => [ux * r + px * o, uy * r + py * o, zz]
    beam(kit, frameMat, ...P(0.2, 0, 0.28), ...P(L, 0, 0.28), 0.2, 0.2, 1)
    for (let r = 1.4; r <= L - 0.05; r += 0.47) beam(kit, frameMat, ...P(r, 0.08, 0.32), ...P(r, 1.4, 0.32), 0.06, 0.07, 1)
    beam(kit, frameMat, ...P(1.4, 1.4, 0.32), ...P(L - 0.1, 1.4, 0.32), 0.08, 0.08, 1)
    // Leading board and sail cloth lie in the sail plane: roll the box so its height runs along the whip.
    const [bx, by] = P((1.4 + L - 0.1) / 2, -0.28, 0)
    tbox(kit, frameMat, bx, by, 0.3, 0.4, L - 1.5, 0.04, 0, 0, a - Math.PI / 2, 1)
    const [cx, cy] = P((1.45 + L - 0.1) / 2, 0.74, 0)
    tbox(kit, cloth, cx, cy, 0.25, 1.28, L - 1.6, 0.02, 0, 0, a - Math.PI / 2, 1.5)
  }
}

/* ── market, fences, props ──────────────────────────────── */

function hayBale(kit: ZoneKit, hay: THREE.Material, x: number, z: number, yaw: number, top?: number): void {
  const g = heightAt(x, z) - 0.1
  const t = top ?? g + 0.95
  const bottom = top !== undefined && top > g + 1.3 ? t - 0.95 : g
  kit.box({ x, y: bottom, z, w: 1.35, h: t - bottom, d: 0.9, yaw, mat: hay, uvScale: 0.8, collide: { surface: 'leaves' } })
  for (const o of [-0.35, 0.35]) {
    const c = Math.cos(yaw)
    const s = Math.sin(yaw)
    tbox(kit, 'rope', x + o * c, (bottom + t) / 2, z - o * s, 0.04, t - bottom + 0.02, 0.92, yaw, 0, 0, 1)
  }
}

function buildMarket(kit: ZoneKit, hay: THREE.Material): void {
  const x = 7.7
  const z = 55.2
  const yaw = -Math.PI / 2 // front (local +z) faces the path to the west
  const g = heightAt(x, z)
  const m = frame(x, g, z, yaw)
  // Counter, posts, awning.
  tbox(kit, 'planks', 0, 0.5, 0.35, 2.9, 1.0, 0.8, 0, 0, 0, 1.2, m)
  tbox(kit, 'darkPlanks', 0, 1.03, 0.4, 3.05, 0.08, 0.95, 0, 0, 0, 1, m)
  tbox(kit, 'planks', 0, 0.45, -0.75, 2.9, 0.9, 0.5, 0, 0, 0, 1.2, m)
  for (const lx of [-1.45, 1.45]) {
    tbox(kit, 'darkPlanks', lx, 1.3, 0.8, 0.12, 2.6, 0.12, 0, 0, 0, 1, m)
    tbox(kit, 'darkPlanks', lx, 1.5, -1.0, 0.12, 3.0, 0.12, 0, 0, 0, 1, m)
  }
  const aw = 0.24
  tbox(kit, 'cloth', 0, 2.78, 0.0, 3.4, 0.04, 2.5, 0, aw, 0, 1.2, m)
  for (let k = 0; k < 8; k++) tbox(kit, 'cloth', -1.5 + k * 0.43, 2.36, 1.26, 0.4, 0.26, 0.02, 0, 0, 0, 1, m)
  beam(kit, 'darkPlanks', -1.6, 2.5, 1.2, 1.6, 2.5, 1.2, 0.08, 0.08, 1, m)
  // Wares: crates of fruit, sacks, a barrel.
  const [cx, cz] = localXZ(x, z, yaw, 0, 0.35)
  kit.solidBox(cx, g, cz, 2.9, 1.07, 0.95, yaw, { surface: 'wood' })
  const [bx, bz] = localXZ(x, z, yaw, 0, -0.75)
  kit.solidBox(bx, g, bz, 2.9, 0.9, 0.5, yaw, { surface: 'wood' })
  const [ax, az] = localXZ(x, z, yaw, 0, 0.1)
  kit.solidBox(ax, g + 2.55, az, 3.4, 0.22, 2.45, yaw, { surface: 'leaves' })
  for (let k = 0; k < 3; k++) {
    const lx = -0.95 + k * 0.95
    tbox(kit, 'planks', lx, 1.17, 0.4, 0.7, 0.2, 0.5, 0.05 * k, 0, 0, 0.6, m)
    for (let f = 0; f < 6; f++) {
      const fruit = new THREE.SphereGeometry(0.08, 6, 4)
      fruit.applyMatrix4(place(lx - 0.22 + (f % 3) * 0.22, 1.3, 0.3 + Math.floor(f / 3) * 0.2, 0, 0, 0, m))
      kit.add(fruit, k === 1 ? hay : 'roof')
    }
  }
  for (const [lx, lz] of [[1.9, 0.2], [2.05, -0.45]]) tbox(kit, hay, lx, 0.32, lz, 0.5, 0.64, 0.42, 0.3, 0, 0.08, 0.6, m)
  const [rx, rz] = localXZ(x, z, yaw, -2.0, 0.3)
  barrel(kit, rx, heightAt(rx, rz) - 0.05, rz, { collide: true })
}

/** Fences: [path segment start, end, side offset (m, + = right of travel), t0, t1]. */
const FENCES: Array<[[number, number], [number, number], number, number, number]> = [
  [[2, 76], [4, 56], 2.9, 0.1, 0.48],
  [[2, 76], [4, 56], -2.9, 0.1, 0.5],
  [[-6, 50], [-30, 42], -3.0, 0.2, 0.85],
  [[14, 46], [38, 38], -3.0, 0.36, 0.95],
  [[4, 56], [0, 34], -3.0, 0.5, 0.82],
]

function buildFences(kit: ZoneKit): void {
  for (const [[ax, az], [bx, bz], off, t0, t1] of FENCES) {
    const len = Math.hypot(bx - ax, bz - az)
    const dx = (bx - ax) / len
    const dz = (bz - az) / len
    // right of travel = (-dz, dx) in this +X east / +Z south world
    const ox = -dz * off
    const oz = dx * off
    const x0 = ax + dx * len * t0 + ox
    const z0 = az + dz * len * t0 + oz
    const x1 = ax + dx * len * t1 + ox
    const z1 = az + dz * len * t1 + oz
    const run = Math.hypot(x1 - x0, z1 - z0)
    const n = Math.max(1, Math.round(run / 2.2))
    let prev: [number, number, number] | null = null
    for (let i = 0; i <= n; i++) {
      const px = x0 + ((x1 - x0) * i) / n
      const pz = z0 + ((z1 - z0) * i) / n
      const g = heightAt(px, pz)
      const lean = Math.sin(i * 12.9898) * 0.05
      tbox(kit, 'darkPlanks', px, g + 0.45, pz, 0.12, 1.1, 0.12, Math.atan2(dx, dz), lean, 0, 1)
      if (prev) {
        for (const [y, hgt] of [[0.85, 0.1], [0.45, 0.08]]) beam(kit, 'planks', prev[0], prev[1] + y, prev[2], px, g + y, pz, 0.05, hgt, 1)
        const mx = (prev[0] + px) / 2
        const mz = (prev[2] + pz) / 2
        const mg = Math.min(prev[1], g)
        kit.solidBox(mx, mg - 0.2, mz, 0.16, Math.max(prev[1], g) + 0.95 - (mg - 0.2), Math.hypot(px - prev[0], pz - prev[2]), Math.atan2(dx, dz), { surface: 'wood' })
      }
      prev = [px, g, pz]
    }
  }
}

function buildProps(kit: ZoneKit, hay: THREE.Material): void {
  // Lamp posts along the paths (arms toward the path).
  const lamps: Array<[number, number, number]> = [[5.9, 61.0, -Math.PI / 2], [-0.6, 46.6, Math.PI / 2], [-9.6, 52.2, -2.8], [17.6, 48.4, -2.6], [3.6, 40.4, -Math.PI / 2], [6.0, 71.5, -Math.PI / 2]]
  for (const [x, z, a] of lamps) lanternPost(kit, x, heightAt(x, z) - 0.1, z, 2.7, a)

  // Hay cart beside the forest path.
  const cx = -12.6
  const cz = 45.4
  const cyaw = 1.25
  const cg = heightAt(cx, cz)
  const m = frame(cx, cg, cz, cyaw)
  tbox(kit, 'planks', 0, 0.82, 0, 1.5, 0.1, 2.6, 0, 0, 0, 1.2, m)
  for (const s of [-1, 1]) {
    tbox(kit, 'planks', s * 0.72, 1.07, 0, 0.06, 0.42, 2.6, 0, 0, 0, 1.2, m)
    const wheel = worldCylinder(0.48, 0.48, 0.1, 12, 1)
    wheel.applyMatrix4(place(s * 0.86, 0.48, -0.25, 0, 0, Math.PI / 2, m))
    kit.add(wheel, 'darkPlanks')
    const hubG = worldCylinder(0.1, 0.1, 0.18, 8, 1)
    hubG.applyMatrix4(place(s * 0.88, 0.48, -0.25, 0, 0, Math.PI / 2, m))
    kit.add(hubG, 'metal')
    beam(kit, 'darkPlanks', s * 0.45, 0.8, 1.2, s * 0.3, 0.06, 2.9, 0.07, 0.08, 1, m)
  }
  rod(kit, 'metal', -0.86, 0.48, -0.25, 0.86, 0.48, -0.25, 0.04, 6, 1, m)
  tbox(kit, hay, 0, 1.25, -0.15, 1.3, 0.6, 2.2, 0, 0, 0, 0.8, m)
  tbox(kit, hay, 0.05, 1.68, -0.35, 1.0, 0.4, 1.2, 0.15, 0, 0, 0.8, m)
  kit.solidBox(cx, cg, cz, 1.6, 1.55, 2.7, cyaw, { surface: 'leaves' })

  // A lying barrel and hay by the well-side lamp.
  barrel(kit, 0.2, heightAt(0.2, 53.6) + 0.02, 53.6, { pitch: Math.PI / 2, yaw: 0.4, collide: true })
  hayBale(kit, hay, -1.0, 48.6, 0.6)
}
