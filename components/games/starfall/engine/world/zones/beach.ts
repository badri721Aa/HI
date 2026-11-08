/**
 * Sunset Beach — the old pier (two broken gaps to jump, a boat landing to climb back
 * out of the water), lantern posts, a fishing hut on stilts joined to the pier by a
 * gangway, nets drying on poles, crates and barrels, a moored rowboat bobbing on the
 * swell and another hauled up on the sand.
 *
 * The first half of this file holds the small prop helpers shared by every
 * Landmarks-A zone (village, cove, beacon): tilted boxes, beams, rods, barrels,
 * crates, lantern posts, gables, stepped roof colliders and boat hulls.
 */
import * as THREE from 'three'
import type { Ctx } from '../../types'
import { heightAt, type Surface } from '../heightfield'
import { PIER } from '../level'
import { ZoneKit, worldBox, worldCylinder, type MatName, type ZonePart } from './kit'

/* ────────────────────────────────────────────────────────────
   Shared prop helpers
   ──────────────────────────────────────────────────────────── */

export type Mat = MatName | THREE.Material

const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _e = new THREE.Euler()
const _p = new THREE.Vector3()
const _d = new THREE.Vector3()
const _one = new THREE.Vector3(1, 1, 1)
const _up = new THREE.Vector3(0, 1, 0)

/**
 * Transform for a part centred at (x, y, z), rotated yaw → pitch → roll (Euler 'YXZ'),
 * optionally inside `parent`. Returns a shared matrix: consume it immediately.
 */
export function place(x: number, y: number, z: number, yaw = 0, pitch = 0, roll = 0, parent?: THREE.Matrix4): THREE.Matrix4 {
  _e.set(pitch, yaw, roll, 'YXZ')
  _q.setFromEuler(_e)
  _m.compose(_p.set(x, y, z), _q, _one)
  if (parent) _m.premultiply(parent)
  return _m
}

/** A reusable frame (position + yaw/pitch/roll) for building a structure in local coordinates. */
export function frame(x: number, y: number, z: number, yaw = 0, pitch = 0, roll = 0): THREE.Matrix4 {
  return place(x, y, z, yaw, pitch, roll).clone()
}

/** Visual-only box centred at (x, y, z) with a full rotation. */
export function tbox(kit: ZoneKit, mat: Mat, x: number, y: number, z: number, w: number, h: number, d: number, yaw = 0, pitch = 0, roll = 0, uv = 2, parent?: THREE.Matrix4): void {
  kit.add(worldBox(w, h, d, uv), mat, place(x, y, z, yaw, pitch, roll, parent))
}

/** Visual-only plank/beam from a to b; cross-section w (sideways) × h (up when level). */
export function beam(kit: ZoneKit, mat: Mat, ax: number, ay: number, az: number, bx: number, by: number, bz: number, w: number, h = w, uv = 2, parent?: THREE.Matrix4): void {
  const dx = bx - ax
  const dy = by - ay
  const dz = bz - az
  const len = Math.hypot(dx, dy, dz)
  if (len < 1e-4) return
  const yaw = Math.atan2(dx, dz)
  const pitch = -Math.atan2(dy, Math.hypot(dx, dz))
  tbox(kit, mat, (ax + bx) / 2, (ay + by) / 2, (az + bz) / 2, w, h, len, yaw, pitch, 0, uv, parent)
}

/** Visual-only round pole / rope from a to b. */
export function rod(kit: ZoneKit, mat: Mat, ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number, seg = 6, uv = 2, parent?: THREE.Matrix4): void {
  _d.set(bx - ax, by - ay, bz - az)
  const len = _d.length()
  if (len < 1e-4) return
  _q.setFromUnitVectors(_up, _d.divideScalar(len))
  _m.compose(_p.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), _q, _one)
  if (parent) _m.premultiply(parent)
  kit.add(worldCylinder(r, r, len, seg, uv), mat, _m)
}

/** A rope hanging between two points with a little sag. */
export function rope(kit: ZoneKit, ax: number, ay: number, az: number, bx: number, by: number, bz: number, sag = 0.3, r = 0.025, parent?: THREE.Matrix4): void {
  const n = 5
  let px = ax
  let py = ay
  let pz = az
  for (let i = 1; i <= n; i++) {
    const t = i / n
    const x = ax + (bx - ax) * t
    const z = az + (bz - az) * t
    const y = ay + (by - ay) * t - sag * 4 * t * (1 - t)
    rod(kit, 'rope', px, py, pz, x, y, z, r, 4, 2, parent)
    px = x
    py = y
    pz = z
  }
}

/** Bulging barrel body with vertical staves (UVs swapped so plank grain runs up the barrel). */
function barrelGeometry(r: number, h: number): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [new THREE.Vector2(0, 0)]
  for (let i = 0; i <= 6; i++) {
    const t = i / 6
    pts.push(new THREE.Vector2(r * (0.84 + 0.16 * Math.sin(Math.PI * t)), t * h))
  }
  pts.push(new THREE.Vector2(0, h))
  const g = new THREE.LatheGeometry(pts, 12)
  const uv = g.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getY(i) * h) / 0.8, (uv.getX(i) * Math.PI * 2 * r) / 0.8)
  g.translate(0, -h / 2, 0)
  return g
}

export interface BarrelOpts {
  r?: number
  h?: number
  yaw?: number
  /** π/2 lays the barrel on its side. */
  pitch?: number
  roll?: number
  collide?: boolean
}

/** Barrel standing (or lying) with its base centre at (x, y, z). */
export function barrel(kit: ZoneKit, x: number, y: number, z: number, o: BarrelOpts = {}): void {
  const r = o.r ?? 0.36
  const h = o.h ?? 0.95
  const lying = Math.abs(o.pitch ?? 0) > 0.7
  const cy = lying ? y + r * 0.95 : y + h / 2
  kit.add(barrelGeometry(r, h), 'planks', place(x, cy, z, o.yaw ?? 0, o.pitch ?? 0, o.roll ?? 0))
  for (const f of [-0.3, 0.3]) {
    const hoop = worldCylinder(r * 0.99, r * 0.99, 0.05, 12, 1).translate(0, f * h, 0)
    kit.add(hoop, 'metal', place(x, cy, z, o.yaw ?? 0, o.pitch ?? 0, o.roll ?? 0))
  }
  if (!o.collide) return
  if (lying) kit.solidBox(x, y, z, r * 2, r * 1.9, h, o.yaw ?? 0, { surface: 'wood' })
  else solidCyl(kit, x, y, z, r * 0.95, h)
}

/** Solid cylinder collider owned by the kit (y = bottom). */
export function solidCyl(kit: ZoneKit, x: number, y: number, z: number, r: number, h: number, surface: Surface = 'wood'): void {
  kit.own(kit.ctx.collision.addCylinder({ x, y, z, r, h, surface }))
}

/** Wooden crate with dark edge battens; (x, y, z) = bottom centre. */
export function crate(kit: ZoneKit, x: number, y: number, z: number, s: number, yaw = 0, collide = true, h = s): void {
  kit.box({ x, y, z, w: s, h, d: s, yaw, mat: 'planks', uvScale: 1, collide: collide ? { surface: 'wood' } : false })
  kit.box({ x, y, z, w: s + 0.04, h: 0.09, d: s + 0.04, yaw, mat: 'darkPlanks', uvScale: 1 })
  kit.box({ x, y: y + h - 0.09, z, w: s + 0.04, h: 0.09, d: s + 0.04, yaw, mat: 'darkPlanks', uvScale: 1 })
  const c = Math.cos(yaw)
  const sn = Math.sin(yaw)
  const o = s / 2 - 0.03
  for (const [lx, lz] of [[o, o], [-o, o], [o, -o], [-o, -o]]) {
    kit.box({ x: x + lx * c + lz * sn, y, z: z - lx * sn + lz * c, w: 0.1, h, d: 0.1, yaw, mat: 'darkPlanks', uvScale: 1 })
  }
}

/** Crates stacked from the ground at (x, z) so the top lands exactly at absolute `top`. */
export function crateStack(kit: ZoneKit, x: number, z: number, top: number, size = 1.1, yaw = 0): void {
  const g = heightAt(x, z) - 0.15
  const n = Math.max(1, Math.round((top - g) / size))
  const h = (top - g) / n
  for (let i = 0; i < n; i++) crate(kit, x, g + i * h, z, size - i * 0.06, yaw + i * 0.22, true, h)
}

/**
 * Wooden post with an arm and a hanging lantern (warm emissive glass).
 * (x, y, z) = foot of the post; the arm points along `armYaw`.
 */
export function lanternPost(kit: ZoneKit, x: number, y: number, z: number, h: number, armYaw: number, collide = true): void {
  kit.box({ x, y, z, w: 0.16, h, d: 0.16, yaw: armYaw, mat: 'darkPlanks', uvScale: 1, collide: collide ? { surface: 'wood' } : false })
  const s = Math.sin(armYaw)
  const c = Math.cos(armYaw)
  const top = y + h
  beam(kit, 'darkPlanks', x, top - 0.12, z, x + s * 0.62, top - 0.12, z + c * 0.62, 0.08, 0.1, 1)
  beam(kit, 'darkPlanks', x + s * 0.06, top - 0.5, z + c * 0.06, x + s * 0.4, top - 0.14, z + c * 0.4, 0.05, 0.06, 1)
  hangingLantern(kit, x + s * 0.5, top - 0.17, z + c * 0.5)
}

/** A lantern hanging from the point (x, y, z). */
export function hangingLantern(kit: ZoneKit, x: number, y: number, z: number, scale = 1): void {
  const k = scale
  rod(kit, 'metal', x, y, z, x, y - 0.12 * k, z, 0.012 * k, 4)
  const top = y - 0.12 * k
  const cap = worldCylinder(0.03 * k, 0.17 * k, 0.12 * k, 4, 1)
  kit.add(cap, 'metal', place(x, top - 0.06 * k, z, Math.PI / 4))
  kit.add(worldBox(0.17 * k, 0.24 * k, 0.17 * k, 1), 'glow', place(x, top - 0.24 * k, z))
  kit.add(worldBox(0.22 * k, 0.04 * k, 0.22 * k, 1), 'metal', place(x, top - 0.38 * k, z))
  for (const [ox, oz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    kit.add(worldBox(0.025 * k, 0.26 * k, 0.025 * k, 1), 'metal', place(x + ox * 0.09 * k, top - 0.24 * k, z + oz * 0.09 * k))
  }
}

/** Triangular gable prism: base `span` along local z, apex `rise` above y = 0, extruded `t` along x. */
export function gableGeometry(span: number, rise: number, t: number, uv = 2): THREE.BufferGeometry {
  const h = span / 2
  const x0 = -t / 2
  const x1 = t / 2
  // prettier-ignore
  const p = [
    // +x face, -x face
    x1, 0, h, x1, 0, -h, x1, rise, 0,
    x0, 0, -h, x0, 0, h, x0, rise, 0,
    // slopes (-z, +z)
    x0, 0, -h, x1, rise, 0, x1, 0, -h, x0, 0, -h, x0, rise, 0, x1, rise, 0,
    x1, 0, h, x0, rise, 0, x0, 0, h, x1, 0, h, x1, rise, 0, x0, rise, 0,
  ]
  const uvs: number[] = []
  for (let i = 0; i < p.length; i += 3) {
    const onEnd = i < 18
    uvs.push((onEnd ? p[i + 2] : p[i]) / uv, (onEnd ? p[i + 1] : p[i + 1] + Math.abs(p[i + 2])) / uv)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  g.computeVertexNormals()
  return g
}

/**
 * Stepped colliders approximating a gable roof (collision boxes can't pitch), so the player
 * can walk up a roof. Ridge along local x (`length`), slopes falling to ±z over `halfSpan`.
 * `eaveY` is the absolute height at the eave edge; each step rises less than the step-up height.
 */
export function roofSteps(kit: ZoneKit, cx: number, cz: number, yaw: number, eaveY: number, halfSpan: number, rise: number, length: number, surface: Surface = 'stone'): void {
  const n = Math.max(2, Math.ceil(rise / 0.38))
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  for (const side of [-1, 1]) {
    for (let k = 0; k < n; k++) {
      const z0 = halfSpan * (1 - (k + 1) / n)
      const z1 = halfSpan * (1 - k / n)
      const top = eaveY + rise * ((k + 0.6) / n) + 0.08
      const bottom = eaveY - 0.35
      const lz = side * (z0 + z1) / 2
      kit.solidBox(cx + lz * s, bottom, cz + lz * c, length, top - bottom, z1 - z0, yaw, { surface })
    }
  }
}

/**
 * Flat ring (rIn > 0) or disc (rIn = 0) whose TOP is at y, `t` thick, with planar world UVs on
 * the faces (cylinder caps would stretch textures) and an outer rim. Visual only.
 */
export function slab(kit: ZoneKit, mat: Mat, x: number, y: number, z: number, rIn: number, rOut: number, t: number, seg = 24, uv = 2, rot = 0): void {
  for (const up of [true, false]) {
    const g = new THREE.RingGeometry(rIn, rOut, seg, 1, rot)
    g.rotateX(up ? -Math.PI / 2 : Math.PI / 2)
    g.translate(x, up ? y : y - t, z)
    const p = g.attributes.position as THREE.BufferAttribute
    const a = g.attributes.uv as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) a.setXY(i, p.getX(i) / uv, p.getZ(i) / uv)
    kit.add(g, mat)
  }
  kit.add(openCylinder(rOut, rOut, t, seg, uv, false, rot), mat, place(x, y - t / 2, z))
  if (rIn > 0) kit.add(openCylinder(rIn, rIn, t, seg, uv, true, rot), mat, place(x, y - t / 2, z))
}

/** Open-ended cylinder with world-scaled UVs; `inward` flips it so its faces look at the axis. */
export function openCylinder(rTop: number, rBot: number, h: number, seg = 16, uv = 2, inward = false, rot = 0): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, true, rot)
  const a = g.attributes.uv as THREE.BufferAttribute
  const circ = Math.PI * 2 * Math.max(rTop, rBot)
  for (let i = 0; i < a.count; i++) a.setXY(i, (a.getX(i) * circ) / uv, (a.getY(i) * h) / uv)
  if (inward) {
    const n = g.attributes.normal as THREE.BufferAttribute
    for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i))
    const idx = g.index!
    for (let i = 0; i < idx.count; i += 3) {
      const b = idx.getX(i + 1)
      idx.setX(i + 1, idx.getX(i + 2))
      idx.setX(i + 2, b)
    }
  }
  return g
}

/** Converts local (lx, lz) of a frame at (cx, cz) with `yaw` to world XZ. */
export function localXZ(cx: number, cz: number, yaw: number, lx: number, lz: number): [number, number] {
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  return [cx + lx * c + lz * s, cz - lx * s + lz * c]
}

/* ── boat hulls ─────────────────────────────────────────── */

export interface HullOpts {
  length: number
  beam: number
  /** Keel to gunwale amidships. */
  depth: number
  /** Extra gunwale height at bow and stern. */
  sheer?: number
  /** Keel rise toward the ends. */
  rocker?: number
  thickness?: number
  /** 0 = pointed stern … ~0.25 = broad transom. */
  transom?: number
  /** Portion of the length to build (0 = stern, 1 = bow), for broken hulls. */
  u0?: number
  u1?: number
  /** Build only part of the section: v from -1 (port gunwale, +x) … 1 (starboard gunwale, -x). */
  v0?: number
  v1?: number
  segU?: number
  segV?: number
  uvScale?: number
  /** Close the stern with a flat transom (only when u0 = 0). */
  cap?: boolean
}

/** Half-beam of the hull at length fraction u (0 = stern, 1 = bow). */
export function hullHalfBeam(o: HullOpts, u: number): number {
  const tr = o.transom ?? 0.14
  return (o.beam / 2) * Math.pow(Math.max(0, Math.sin(Math.PI * (tr + (1 - tr) * u))), 0.6)
}

/** Point on the outer skin. Hull is centred on z = 0 (bow at +z), keel at y = 0 amidships. */
export function hullPoint(o: HullOpts, u: number, v: number, out: THREE.Vector3): THREE.Vector3 {
  const e = 2 * u - 1
  const yk = (o.rocker ?? 0.15) * e * e
  const yg = o.depth + (o.sheer ?? 0.2) * e * e
  const a = (v * Math.PI) / 2
  const sa = Math.sin(a)
  return out.set(hullHalfBeam(o, u) * Math.sign(sa) * Math.pow(Math.abs(sa), 0.6), yk + (yg - yk) * (1 - Math.cos(a)), (u - 0.5) * o.length)
}

/** Half-width of the hull's inside at height y (for thwarts and decks). */
export function hullHalfWidthAt(o: HullOpts, u: number, y: number): number {
  const e = 2 * u - 1
  const yk = (o.rocker ?? 0.15) * e * e
  const yg = o.depth + (o.sheer ?? 0.2) * e * e
  const f = THREE.MathUtils.clamp((y - yk) / (yg - yk), 0, 1)
  const a = Math.acos(1 - f)
  return hullHalfBeam(o, u) * Math.pow(Math.sin(a), 0.6) - (o.thickness ?? 0.06)
}

/** Open hull (outer + inner skin + gunwale cap, optional transom) with plank UVs along its length. */
export function hullGeometry(o: HullOpts): THREE.BufferGeometry {
  const nu = o.segU ?? 14
  const nv = o.segV ?? 12
  const u0 = o.u0 ?? 0
  const u1 = o.u1 ?? 1
  const v0 = o.v0 ?? -1
  const v1 = o.v1 ?? 1
  const t = o.thickness ?? 0.06
  const uvs = o.uvScale ?? 1.2
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  const P = new THREE.Vector3()
  const outer: number[][] = []
  const inner: number[][] = []
  for (let i = 0; i <= nu; i++) {
    const u = u0 + ((u1 - u0) * i) / nu
    const b = Math.max(hullHalfBeam(o, u), 1e-3)
    const k = Math.max(0, 1 - t / b)
    const rowO: number[] = []
    const rowI: number[] = []
    let arc = 0
    let lx = 0
    let ly = 0
    for (let j = 0; j <= nv; j++) {
      const v = v0 + ((v1 - v0) * j) / nv
      hullPoint(o, u, v, P)
      if (j > 0) arc += Math.hypot(P.x - lx, P.y - ly)
      lx = P.x
      ly = P.y
      rowO.push(pos.length / 3)
      pos.push(P.x, P.y, P.z)
      uv.push(P.z / uvs, arc / uvs)
      rowI.push(pos.length / 3)
      const ca = Math.cos((v * Math.PI) / 2)
      pos.push(P.x * k, P.y + t * ca, P.z)
      uv.push(P.z / uvs, arc / uvs)
    }
    outer.push(rowO)
    inner.push(rowI)
  }
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const a = outer[i][j], b = outer[i][j + 1], c = outer[i + 1][j + 1], d = outer[i + 1][j]
      idx.push(a, b, c, a, c, d)
      const ai = inner[i][j], bi = inner[i][j + 1], ci = inner[i + 1][j + 1], di = inner[i + 1][j]
      idx.push(ai, ci, bi, ai, di, ci)
    }
  }
  // Gunwale caps join the skins along the top edges (separate vertices → crisp normals).
  const cap = (j: number, flip: boolean) => {
    for (let i = 0; i < nu; i++) {
      const base = pos.length / 3
      for (const [r, ii] of [[outer, i], [inner, i], [inner, i + 1], [outer, i + 1]] as const) {
        const vi = r[ii][j] * 3
        pos.push(pos[vi], pos[vi + 1], pos[vi + 2])
        uv.push(pos[vi + 2] / uvs, pos[vi] / uvs)
      }
      if (flip) idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
      else idx.push(base, base + 2, base + 1, base, base + 3, base + 2)
    }
  }
  if (v0 <= -0.999) cap(0, false)
  if (v1 >= 0.999) cap(nv, true)
  if (o.cap && u0 <= 0) {
    // Flat transom: fan from the top centre, both faces.
    for (const [ring, off, flip] of [[outer[0], 0, false], [inner[0], t, true]] as const) {
      const top = pos.length / 3
      const yTop = pos[ring[0] * 3 + 1]
      pos.push(0, yTop, pos[ring[0] * 3 + 2] + off)
      uv.push(0, yTop / uvs)
      const first = pos.length / 3
      for (const vi of ring) {
        pos.push(pos[vi * 3], pos[vi * 3 + 1], pos[vi * 3 + 2] + off)
        uv.push(pos[vi * 3] / uvs, pos[vi * 3 + 1] / uvs)
      }
      for (let j = 0; j < ring.length - 1; j++) {
        if (flip) idx.push(top, first + j, first + j + 1)
        else idx.push(top, first + j + 1, first + j)
      }
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/** A small rowboat (hull, two thwarts, a pair of oars) built in the frame `m` (keel amidships at its origin, bow at +z). */
export function rowboat(kit: ZoneKit, m: THREE.Matrix4, length = 4.2, width = 1.5, depth = 0.62, mat: Mat = 'planks', trim: Mat = 'darkPlanks'): void {
  const o: HullOpts = { length, beam: width, depth, sheer: 0.22, rocker: 0.12, thickness: 0.05, transom: 0.2, cap: true, uvScale: 0.9 }
  const g = hullGeometry(o)
  g.applyMatrix4(m)
  kit.add(g, mat)
  for (const u of [0.36, 0.64]) {
    const y = depth * 0.62
    const w = hullHalfWidthAt(o, u, y) * 2
    tbox(kit, trim, 0, y, (u - 0.5) * length, w, 0.05, 0.24, 0, 0, 0, 1, m)
  }
  for (const side of [-1, 1]) {
    const x = side * 0.22
    beam(kit, trim, x, depth * 0.7, -length * 0.38, x * 1.3, depth * 0.72, length * 0.3, 0.05, 0.05, 1, m)
    tbox(kit, trim, x * 1.3, depth * 0.72, length * 0.36, 0.16, 0.025, 0.55, 0, 0, 0, 1, m)
  }
}

/* ────────────────────────────────────────────────────────────
   Sunset Beach
   ──────────────────────────────────────────────────────────── */

const X = PIER.x
const Y = PIER.deckY
const HW = PIER.width / 2
/** Deck thickness. */
const T = 0.22
/** Boardwalk starts on the sand, where the beach is level with the deck. */
const START_Z = 119.4
/** Broken stretches the player has to jump. */
const GAPS: Array<[number, number]> = [[133.4, 135.6], [141.2, 143.8]]
/** The wide platform at the far end (shard 0 floats above it). */
const END_Z = 147.6
const END_HW = 3
/** Fishing hut on stilts east of the pier start; its porch is level with the deck. */
const HUT = { x: 20.9, z: 127.2, yaw: -Math.PI / 2, w: 4.2, d: 3.2, wall: 2.3 }

export function buildBeach(ctx: Ctx): ZonePart {
  const kit = new ZoneKit(ctx, 'beach')
  buildPier(kit)
  buildHut(kit)
  buildNets(kit)
  buildProps(kit)

  // The moored rowboat lives in its own little batch so it can bob on the swell.
  const boatKit = new ZoneKit(ctx, 'beach-boat')
  const boat = boatKit.root
  boat.position.set(X + END_HW + 1.55, -0.18, 149.4)
  boat.rotation.order = 'YXZ'
  boat.rotation.y = Math.PI + 0.06
  rowboat(boatKit, new THREE.Matrix4(), 4.3, 1.55, 0.64, kit.mat('planks'), kit.mat('darkPlanks'))
  boatKit.finalize()
  // Mooring line from the bollard to the bow ring.
  rope(kit, X + END_HW - 0.35, Y + 0.42, 148.2, X + END_HW + 1.45, 0.5, 147.4, 0.45)

  kit.finalize()
  return {
    update(_dt, t) {
      boat.position.y = -0.18 + Math.sin(t * 1.1) * 0.05
      boat.rotation.z = Math.sin(t * 0.83 + 1) * 0.035
      boat.rotation.x = Math.sin(t * 0.61) * 0.02
    },
    dispose() {
      boatKit.dispose()
      kit.dispose()
    },
  }
}

function buildPier(kit: ZoneKit): void {
  // Deck: one slab per unbroken stretch (planks run across the pier), wood colliders.
  const segs: Array<[number, number, number]> = []
  let z = START_Z
  for (const [g0, g1] of GAPS) {
    segs.push([z, g0, HW])
    z = g1
  }
  segs.push([z, END_Z, HW], [END_Z, PIER.z1, END_HW])
  for (const [a, b, hw] of segs) {
    kit.box({ x: X, y: Y - T, z: (a + b) / 2, w: hw * 2, h: T, d: b - a, mat: 'planks', uvScale: 1.6, collide: { surface: 'wood' } })
  }
  // Splintered planks at the gap edges (one dangles into the water).
  for (const [g0, g1] of GAPS) {
    tbox(kit, 'planks', X - 0.55, Y - 0.12, g0 + 0.22, 2.0, 0.08, 0.36, 0.08, 0.05, 0, 1.6)
    tbox(kit, 'planks', X + 0.7, Y - 0.11, g1 - 0.2, 1.6, 0.08, 0.34, -0.12, -0.04, 0, 1.6)
  }
  beam(kit, 'planks', X + 0.9, Y - 0.15, GAPS[1][0] + 0.1, X + 1.3, -0.25, GAPS[1][0] + 1.1, 0.34, 0.07, 1.6)

  // Stringers under the deck (the east one survives across the first gap).
  const sy = Y - T - 0.1
  const stringer = (x: number, z0: number, z1: number) => kit.box({ x, y: sy - 0.1, z: (z0 + z1) / 2, w: 0.18, h: 0.2, d: z1 - z0, mat: 'darkPlanks', uvScale: 2 })
  for (const side of [-1, 1]) {
    stringer(X + side * 1.2, START_Z + 0.4, GAPS[0][0] + (side > 0 ? 0 : 0.3))
    stringer(X + side * 1.2, GAPS[0][1] - 0.2, GAPS[1][0] + 0.3)
    stringer(X + side * 1.2, GAPS[1][1] - 0.2, PIER.z1 - 0.1)
  }
  stringer(X + 1.2, GAPS[0][0] - 0.2, GAPS[0][1] + 0.2)
  beam(kit, 'darkPlanks', X - 1.2, sy, GAPS[1][0] + 0.3, X - 1.05, -0.4, GAPS[1][0] + 1.9, 0.18, 0.2)

  // Bents: post pairs (wider on the end platform), caps and cross bracing; posts are solid.
  for (const zz of [121.8, 125.0, 128.4, 131.8, 135.0, 138.4, 142.0, 145.4, 148.4, 151.8]) {
    const wide = zz > END_Z
    const xs = wide ? [-END_HW + 0.2, -1.45, 1.45, END_HW - 0.2] : [-1.45, 1.45]
    const capW = wide ? END_HW * 2 : 3.3
    kit.box({ x: X, y: sy - 0.32, z: zz, w: capW, h: 0.22, d: 0.24, mat: 'darkPlanks', uvScale: 2 })
    let gMin = Infinity
    for (const ox of xs) {
      const g = heightAt(X + ox, zz)
      gMin = Math.min(gMin, g)
      const broken = Math.abs(zz - 141.8) < 0.5 && ox < 0
      const top = broken ? 0.9 : sy - 0.2
      kit.cylinder({ x: X + ox, y: g - 0.6, z: zz, r: 0.15, h: top - g + 0.6, mat: 'darkPlanks', segments: 8, uvScale: 1.5, collide: { surface: 'wood' } })
    }
    if (gMin < Y - 1.4) {
      const lo = Math.max(gMin + 0.3, -0.6)
      beam(kit, 'darkPlanks', X - 1.4, sy - 0.5, zz + 0.12, X + 1.4, lo, zz + 0.12, 0.07, 0.16)
      beam(kit, 'darkPlanks', X + 1.4, sy - 0.5, zz - 0.12, X - 1.4, lo, zz - 0.12, 0.07, 0.16)
    }
  }

  // Railings (partial: some sections were lost to storms).
  const E = X + HW - 0.07
  const W = X - HW + 0.07
  railing(kit, E, 124.6, E, 126.4)
  railing(kit, E, 128.1, E, GAPS[0][0] - 0.15)
  railing(kit, E, GAPS[0][1] + 0.15, E, 139.4)
  railing(kit, W, 125.6, W, 131.0)
  beam(kit, 'darkPlanks', W, Y + 0.95, 131.0, W - 0.25, Y + 0.1, 133.1, 0.08, 0.09)
  railing(kit, W, GAPS[1][1] + 0.15, W, END_Z - 0.1)
  const zEnd = PIER.z1 - 0.07
  railing(kit, X - END_HW + 0.1, zEnd, X + END_HW - 0.1, zEnd)
  railing(kit, X - END_HW + 0.07, END_Z + 0.1, X - END_HW + 0.07, zEnd)
  railing(kit, X + END_HW - 0.07, 150.1, X + END_HW - 0.07, zEnd)
  railing(kit, X - END_HW + 0.07, END_Z + 0.07, X - HW, END_Z + 0.07)
  railing(kit, X + HW, END_Z + 0.07, X + END_HW - 0.07, END_Z + 0.07)

  // Lantern posts along the pier (arms over the deck).
  const L = 2.5
  lanternPost(kit, E - 0.05, Y, 124.2, L, -Math.PI / 2)
  lanternPost(kit, W + 0.05, Y, 124.2, L, Math.PI / 2)
  lanternPost(kit, W + 0.05, Y, 132.8, L, Math.PI / 2)
  lanternPost(kit, E - 0.05, Y, 139.6, L, -Math.PI / 2)
  lanternPost(kit, W + 0.05, Y, 146.9, L, Math.PI / 2)
  lanternPost(kit, X - END_HW + 0.12, Y, PIER.z1 - 0.12, L, Math.PI * 0.75)
  lanternPost(kit, X + END_HW - 0.12, Y, PIER.z1 - 0.12, L, -Math.PI * 0.75)

  // Bollards for the mooring lines.
  for (const side of [-1, 1]) {
    const bx = X + side * (END_HW - 0.35)
    kit.cylinder({ x: bx, y: Y, z: 148.2, r: 0.15, rTop: 0.13, h: 0.42, mat: 'darkPlanks', segments: 8, uvScale: 1, collide: { surface: 'wood' } })
    kit.cylinder({ x: bx, y: Y + 0.42, z: 148.2, r: 0.2, h: 0.07, mat: 'metal', segments: 8 })
  }

  // Boat landing beside the second gap: a way back up for anyone who falls in.
  const LT = 0.45
  const lx = X - HW - 0.95
  const lz = GAPS[1][0] + 1.6
  const lg = heightAt(lx, lz)
  kit.box({ x: lx, y: LT - 0.16, z: lz, w: 1.7, h: 0.16, d: 3.0, mat: 'planks', uvScale: 1.6 })
  kit.solidBox(lx, lg - 0.2, lz, 1.7, LT - (lg - 0.2), 3.0, 0, { surface: 'wood' })
  for (const [ox, oz] of [[-0.7, -1.35], [0.7, -1.35], [-0.7, 1.35], [0.7, 1.35]]) {
    kit.cylinder({ x: lx + ox, y: lg - 0.5, z: lz + oz, r: 0.11, h: LT + 0.3 - lg, mat: 'darkPlanks', segments: 6, uvScale: 1 })
  }
  // Ladder from the landing up to the deck edge.
  const ladZ = GAPS[1][1] + 0.3
  for (const dz of [-0.24, 0.24]) beam(kit, 'darkPlanks', X - HW - 0.06, LT, ladZ + dz, X - HW - 0.06, Y + 0.6, ladZ + dz, 0.07, 0.07)
  for (let y = LT + 0.25; y < Y + 0.4; y += 0.32) tbox(kit, 'darkPlanks', X - HW - 0.06, y, ladZ, 0.06, 0.05, 0.5, 0, 0, 0, 1)

  // Old pilings of an earlier pier, poking out of the shallows west of this one.
  const pilings: Array<[number, number, number]> = [[6.6, 137.5, 0.9], [7.2, 140.9, 0.45], [7.9, 144.6, 1.2], [8.8, 148.2, 0.7]]
  for (const [px, pz, top] of pilings) {
    const g = heightAt(px, pz)
    kit.cylinder({ x: px, y: g - 0.5, z: pz, r: 0.2, rTop: 0.16, h: top - g + 0.5, mat: 'bark', segments: 8, uvScale: 1.5, collide: { surface: 'wood' } })
  }
}

/** Two-rail wooden railing from (x0, z0) to (x1, z1) on the deck, with a thin collider. */
function railing(kit: ZoneKit, x0: number, z0: number, x1: number, z1: number, base = Y): void {
  const len = Math.hypot(x1 - x0, z1 - z0)
  const n = Math.max(1, Math.ceil(len / 2.1))
  for (let i = 0; i <= n; i++) {
    const t = i / n
    kit.box({ x: x0 + (x1 - x0) * t, y: base, z: z0 + (z1 - z0) * t, w: 0.12, h: 1.05, d: 0.12, mat: 'darkPlanks', uvScale: 1 })
  }
  beam(kit, 'darkPlanks', x0, base + 1.0, z0, x1, base + 1.0, z1, 0.1, 0.08)
  beam(kit, 'darkPlanks', x0, base + 0.55, z0, x1, base + 0.55, z1, 0.06, 0.07)
  kit.solidBox((x0 + x1) / 2, base, (z0 + z1) / 2, 0.14, 1.05, len, Math.atan2(x1 - x0, z1 - z0), { surface: 'wood' })
}

/** Fishing hut on stilts: plank walls, tiled gable roof, porch + gangway level with the deck. */
function buildHut(kit: ZoneKit): void {
  const { x, z, yaw, w, d, wall } = HUT
  const F = Y
  const m = frame(x, 0, z, yaw)
  const porch = 1.3
  // Floor & porch (local +z faces the pier).
  tbox(kit, 'planks', 0, F - 0.08, porch / 2, w + 0.3, 0.16, d + porch, 0, 0, 0, 1.6, m)
  const [px, pz] = localXZ(x, z, yaw, 0, porch / 2)
  kit.solidBox(px, F - 0.6, pz, w + 0.3, 0.6, d + porch, yaw, { surface: 'wood' })
  // Stilts.
  for (const lx of [-w / 2, 0, w / 2]) {
    for (const lz of [-d / 2, d / 2, d / 2 + porch]) {
      const [sx, sz] = localXZ(x, z, yaw, lx, lz)
      const g = heightAt(sx, sz)
      kit.cylinder({ x: sx, y: g - 0.4, z: sz, r: 0.12, h: F - g + 0.25, mat: 'darkPlanks', segments: 6, uvScale: 1 })
    }
  }
  // Walls with dark corner posts.
  tbox(kit, 'planks', 0, F + wall / 2, 0, w, wall, d, 0, 0, 0, 1.4, m)
  for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) tbox(kit, 'darkPlanks', lx * (w / 2), F + wall / 2, lz * (d / 2), 0.18, wall, 0.18, 0, 0, 0, 1, m)
  const [bx, bz] = localXZ(x, z, yaw, 0, 0)
  kit.solidBox(bx, F, bz, w, wall, d, yaw, { surface: 'wood' })
  // Gable ends + roof (ridge along local x).
  const half = d / 2 + 0.35
  const rise = 1.25
  const pitch = Math.atan2(rise, d / 2)
  const slab = Math.hypot(half, half * Math.tan(pitch))
  for (const s of [-1, 1]) {
    const g = gableGeometry(d, (d / 2) * Math.tan(pitch), 0.12, 1.4)
    g.applyMatrix4(place(s * (w / 2 - 0.06), F + wall, 0, 0, 0, 0, m))
    kit.add(g, 'planks')
    const eaveDrop = 0.35 * Math.tan(pitch)
    tbox(kit, 'roof', 0, F + wall + (rise - eaveDrop) / 2 + 0.06, (s * half) / 2, w + 0.5, 0.12, slab, 0, s * pitch, 0, 1.6, m)
  }
  tbox(kit, 'darkPlanks', 0, F + wall + rise + 0.12, 0, w + 0.6, 0.14, 0.2, 0, 0, 0, 1, m)
  roofSteps(kit, x, z, yaw, F + wall - 0.35 * Math.tan(pitch), half, rise + 0.35 * Math.tan(pitch), w + 0.5)
  // Door, window, stovepipe.
  tbox(kit, 'darkPlanks', -0.6, F + 0.95, d / 2 + 0.04, 0.85, 1.85, 0.08, 0, 0, 0, 1, m)
  tbox(kit, 'glow', 0.9, F + 1.45, d / 2 + 0.03, 0.6, 0.5, 0.05, 0, 0, 0, 1, m)
  tbox(kit, 'darkPlanks', 0.9, F + 1.45, d / 2 + 0.06, 0.72, 0.08, 0.06, 0, 0, 0, 1, m)
  tbox(kit, 'darkPlanks', 0.9, F + 1.45, d / 2 + 0.06, 0.08, 0.62, 0.06, 0, 0, 0, 1, m)
  tbox(kit, 'darkPlanks', 0.9, F + 1.16, d / 2 + 0.1, 0.8, 0.06, 0.14, 0, 0, 0, 1, m)
  tbox(kit, 'glow', -w / 2 - 0.01, F + 1.45, 0.3, 0.05, 0.45, 0.55, 0, 0, 0, 1, m)
  kit.add(worldCylinder(0.09, 0.09, 1.6, 8, 1), 'metal', place(1.1, F + wall + 1.2, -0.7, 0, 0, 0, m))
  // Porch rail and lantern, and the gangway across to the pier.
  const corner = (lx: number, lz: number) => localXZ(x, z, yaw, lx, lz)
  const [lpx, lpz] = corner(-w / 2 + 0.12, d / 2 + porch - 0.12)
  lanternPost(kit, lpx, F, lpz, 2.3, 0)
  const [r0x, r0z] = corner(w / 2 + 0.1, d / 2 + 0.1)
  const [r1x, r1z] = corner(w / 2 + 0.1, d / 2 + porch)
  railing(kit, r0x, r0z, r1x, r1z, F)
  const [gx0, gz0] = corner(-0.2, d / 2 + porch)
  kit.box({ x: (gx0 + X + HW) / 2, y: F - 0.14, z: gz0, w: gx0 - (X + HW) + 0.1, h: 0.14, d: 1.1, mat: 'planks', uvScale: 1.6, collide: { surface: 'wood' } })
  for (const s of [-1, 1]) beam(kit, 'rope', X + HW, F + 0.75, gz0 + s * 0.55, gx0, F + 0.75, gz0 + s * 0.55, 0.03, 0.03)
  // Barrel → crates behind the hut (eave side): a way up onto its roof.
  const [b0x, b0z] = corner(1.5, -d / 2 - 1.45)
  barrel(kit, b0x, heightAt(b0x, b0z) - 0.05, b0z, { collide: true })
  const [c0x, c0z] = corner(0.4, -d / 2 - 0.7)
  crateStack(kit, c0x, c0z, F + 1.15, 1.0, 0.3)
  const [c1x, c1z] = corner(-0.8, -d / 2 - 0.75)
  crateStack(kit, c1x, c1z, F + 0.3, 0.9, -0.2)
}

/** Fishing nets sagging between poles, west of the pier start. */
function buildNets(kit: ZoneKit): void {
  const poles: Array<[number, number]> = [[8.3, 124.4], [7.7, 128.1], [7.2, 131.8]]
  const H = 2.3
  for (const [px, pz] of poles) {
    const g = heightAt(px, pz)
    kit.cylinder({ x: px, y: g - 0.3, z: pz, r: 0.07, rTop: 0.055, h: H + 0.3, mat: 'bark', segments: 6, uvScale: 1, collide: { surface: 'wood' } })
  }
  for (let i = 0; i < poles.length - 1; i++) {
    const [ax, az] = poles[i]
    const [bx, bz] = poles[i + 1]
    const ay = heightAt(ax, az) + H - 0.12
    const by = heightAt(bx, bz) + H - 0.12
    net(kit, ax, ay, az, bx, by, bz, 1.35, 0.32)
  }
  // A net and floats piled on the sand, and a coil of rope.
  const [nx, nz] = [9.6, 129.4]
  const ng = heightAt(nx, nz)
  tbox(kit, 'rope', nx, ng + 0.06, nz, 1.3, 0.16, 0.9, 0.4, 0, 0.05, 1)
  tbox(kit, 'rope', nx + 0.25, ng + 0.16, nz - 0.1, 0.8, 0.12, 0.6, 0.9, 0, -0.05, 1)
  ropeCoil(kit, 10.6, ng + 0.02, 127.4)
}

/** Rope coil lying flat at (x, y, z). */
export function ropeCoil(kit: ZoneKit, x: number, y: number, z: number, r = 0.32): void {
  for (let i = 0; i < 3; i++) {
    const g = new THREE.TorusGeometry(r - i * 0.06, 0.04, 5, 14)
    g.applyMatrix4(place(x, y + 0.04 + i * 0.07, z, 0, Math.PI / 2, 0))
    kit.add(g, 'rope')
  }
}

/** A drying net: knotted rope mesh hanging from a sagging top line between a and b. */
function net(kit: ZoneKit, ax: number, ay: number, az: number, bx: number, by: number, bz: number, drop: number, sag: number): void {
  const span = Math.hypot(bx - ax, bz - az)
  const cols = Math.max(2, Math.round(span / 0.26))
  const rows = Math.max(2, Math.round(drop / 0.26))
  const pt = (t: number, r: number): [number, number, number] => {
    const s = 4 * t * (1 - t)
    return [ax + (bx - ax) * t, ay + (by - ay) * t - sag * s - r * (drop - 0.25 * s), az + (bz - az) * t]
  }
  for (let c = 0; c <= cols; c++) {
    const [x0, y0, z0] = pt(c / cols, 0)
    const [x1, y1, z1] = pt(c / cols, 1)
    beam(kit, 'rope', x0, y0, z0, x1, y1, z1, 0.022, 0.022, 1)
  }
  for (let r = 0; r <= rows; r++) {
    const w = r === 0 ? 0.04 : 0.022
    for (let c = 0; c < cols; c++) {
      const [x0, y0, z0] = pt(c / cols, r / rows)
      const [x1, y1, z1] = pt((c + 1) / cols, r / rows)
      beam(kit, 'rope', x0, y0, z0, x1, y1, z1, w, w, 1)
    }
  }
}

/** Crates, barrels, the hauled-up rowboat and driftwood. */
function buildProps(kit: ZoneKit): void {
  // At the pier start.
  crateStack(kit, 11.1, 122.6, heightAt(11.1, 122.6) + 0.9, 0.95, 0.4)
  crate(kit, 11.6, heightAt(11.6, 121.4) - 0.1, 121.4, 0.75, -0.3)
  barrel(kit, 10.4, heightAt(10.4, 123.9) - 0.05, 123.9, { collide: true })
  barrel(kit, 9.9, heightAt(9.9, 125.3) + 0.02, 125.3, { pitch: Math.PI / 2, yaw: 1.2, collide: true })
  // On the deck by the east rail, and on the end platform (clear of the shard spot).
  barrel(kit, X + 1.12, Y, 129.4, { r: 0.3, h: 0.8, collide: true })
  barrel(kit, X + 1.05, Y, 131.9, { r: 0.3, h: 0.8, collide: true })
  crate(kit, X - 2.25, Y, 151.1, 0.85, 0.2)
  crate(kit, X - 2.3, Y, 150.1, 0.7, -0.35)
  crate(kit, X - 2.25, Y + 0.85, 151.05, 0.6, 0.5)
  barrel(kit, X + 2.3, Y, 151.3, { r: 0.3, h: 0.8, collide: true })
  ropeCoil(kit, X + 2.15, Y, 148.9)

  // Rowboat hauled up on the sand, listing on its keel, oars beside it.
  const bx = 24.2
  const bz = 131.3
  const g = heightAt(bx, bz)
  rowboat(kit, frame(bx, g - 0.12, bz, 0.95, 0.04, 0.22), 4.0, 1.5, 0.6)
  kit.solidBox(bx, g - 0.2, bz, 1.4, 0.95, 3.8, 0.95, { surface: 'wood' })
  beam(kit, 'darkPlanks', bx - 1.5, g + 0.06, bz + 1.0, bx - 0.4, g + 0.05, bz + 2.6, 0.05, 0.05, 1)
  tbox(kit, 'darkPlanks', bx - 0.3, g + 0.05, bz + 2.75, 0.14, 0.025, 0.5, 0.6, 0, 0, 1)

  // Driftwood logs above the tide line.
  const logs: Array<[number, number, number, number]> = [[-3.2, 121.4, 0.7, 2.6], [21.6, 132.6, -0.3, 2.1], [2.6, 122.2, 1.9, 1.7]]
  for (const [lx, lz, yaw, len] of logs) {
    const ly = heightAt(lx, lz)
    const dx = Math.sin(yaw) * len * 0.5
    const dz = Math.cos(yaw) * len * 0.5
    rod(kit, 'bark', lx - dx, ly + 0.1, lz - dz, lx + dx, ly + 0.16, lz + dz, 0.16, 7, 1.5)
  }
}
