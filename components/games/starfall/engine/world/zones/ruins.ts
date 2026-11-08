/**
 * Sky Ruins (Shard 3) — a broken temple on the eastern plateau.
 *
 * A colonnade and a rune-keyed arch lead from the ramp to a ruined round tower. The climb
 * to its open crown winds anticlockwise around it:
 *
 *   broken stairs → landing → floating lift → ledge → sliding stone → ledge →
 *   slowly turning disc → ledge → three corbel steps → crown (Shard 3 above it).
 *
 * Every mover is a floating stone with glowing blue rune edges (one draw call each) and a
 * dynamic collider moved with collision.move() — Zones update before the player each frame,
 * so the player rides them. Timings are slow with long dwell times to keep it forgiving.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Collider } from '../../collision'
import type { Ctx } from '../../types'
import { RUINS_TOWER } from '../level'
import { ZoneKit, worldBox, worldCylinder, type ZonePart } from './kit'

const TAU = Math.PI * 2
const DEG = Math.PI / 180
const RUNE = new THREE.Color(0x52b8ff)

function rng(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), s | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const smoother = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)

/** Tower wall radius and the ring the attached stairs/ledges occupy. */
const RT = 3.4
const RING_IN = 3.25
const RING_OUT = 6.0
const LEDGE_W = 2.2

/* Route (angles: atan2(z, x) around the tower; heights above the plateau). */
const STEPS = { from: 150, step: 15, count: 11, rise: 0.42, missing: [4, 8] }
const LANDING = { deg: 318, top: 5.04 }
const LIFT = { deg: 318, rho: 7.3, size: 2.4, low: 5.04, high: 11.2, dwell: 2.2, travel: 3.0 }
const L2 = { deg: 318, top: 11.2 }
const SLIDER = { a: 345, b: 18, rho: 5.1, size: 2.0, top: 11.2, dwell: 1.8, travel: 2.6 }
const L3 = { deg: 45, top: 11.8 }
const DISC = { deg: 75, rho: 4.75, r: 1.3, top: 12.4, spin: 0.5 }
const L4 = { deg: 105, top: 13.0 }
const CROWN_STEPS = [{ deg: 133, top: 13.8 }, { deg: 161, top: 14.6 }, { deg: 189, top: 15.4 }]
const CROWN_GAP = 189

interface Mover {
  col: Collider
  mesh: THREE.Mesh
  /** Writes the collider pose for game time t. */
  pose(t: number, out: THREE.Vector4): void
}

export function buildRuins(ctx: Ctx): ZonePart {
  const kit = new ZoneKit(ctx, 'ruins')
  const rand = rng(0x5ca1ab1e)
  const T = RUINS_TOWER
  const base = kit.ground(T.x, T.z)
  const top = base + T.height
  const at = (deg: number, rho: number) => ({ x: T.x + Math.cos(deg * DEG) * rho, z: T.z + Math.sin(deg * DEG) * rho })
  /** Yaw that points a box's local +z radially outward at `deg`. */
  const radial = (deg: number) => Math.PI / 2 - deg * DEG

  const runeMat = kit.mat('glow', { color: 0xc8ecff, emissive: RUNE.getHex(), emissiveIntensity: 1.7, key: 'rune' })
  const m4 = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const v = new THREE.Vector3()
  const one = new THREE.Vector3(1, 1, 1)

  /** A thin glowing inlay (visual only), centred at (x, y, z). */
  const rune = (x: number, y: number, z: number, w: number, h: number, d: number, yaw: number) => {
    q.setFromAxisAngle(v.set(0, 1, 0), yaw)
    kit.add(new THREE.BoxGeometry(w, h, d), runeMat, m4.compose(v.set(x, y, z), q, one), { castShadow: false })
  }
  /** A little glyph of 2–3 strokes lying on a horizontal surface. */
  const glyph = (x: number, y: number, z: number, yaw: number, size = 0.32) => {
    const strokes = 2 + Math.floor(rand() * 2)
    for (let i = 0; i < strokes; i++) {
      const a = yaw + (i === 0 ? 0 : (rand() - 0.5) * 2.2)
      const off = (i - 1) * size * 0.3
      rune(x + Math.cos(yaw) * off, y, z - Math.sin(yaw) * off, 0.045, 0.02, size * (0.6 + rand() * 0.5), a)
    }
  }

  /* ── tower ─────────────────────────────────────────────────── */
  {
    const course = 0.8
    const n = Math.ceil(T.height / course)
    for (let i = 0; i < n; i++) {
      const h = Math.min(course, T.height - i * course)
      const r = RT + (rand() - 0.5) * 0.06 + (i === 0 ? 0.12 : 0)
      const g = worldCylinder(r, r, h, 26, 2)
      g.rotateY(rand() * TAU)
      kit.add(g, i % 5 === 2 ? 'mossStone' : 'stone', m4.makeTranslation(T.x, base + i * course + h / 2, T.z))
    }
    kit.own(ctx.collision.addCylinder({ x: T.x, y: base - 0.5, z: T.z, r: RT, h: T.height + 0.5, surface: 'stone' }))
    // Plinth ring at the foot.
    kit.add(worldCylinder(RT + 0.45, RT + 0.6, 0.35, 28, 2), 'mossStone', m4.makeTranslation(T.x, base + 0.12, T.z))
    kit.own(ctx.collision.addCylinder({ x: T.x, y: base - 0.3, z: T.z, r: RT + 0.55, h: 0.6, surface: 'stone' }))
    // Crown floor, rune circle and broken merlons.
    kit.add(new THREE.CircleGeometry(RT - 0.05, 26).rotateX(-Math.PI / 2), 'stone', m4.makeTranslation(T.x, top + 0.01, T.z))
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU
      rune(T.x + Math.cos(a) * 1.6, top + 0.02, T.z + Math.sin(a) * 1.6, 0.06, 0.02, 0.36, Math.PI / 2 - a + Math.PI / 2)
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.3
      glyph(T.x + Math.cos(a) * 2.4, top + 0.02, T.z + Math.sin(a) * 2.4, a)
    }
    for (let k = 0; k < 12; k++) {
      const deg = 15 + k * 30
      if (Math.abs(((deg - CROWN_GAP + 540) % 360) - 180) < 30) continue
      const p = at(deg, RT - 0.35)
      const h = k % 3 === 1 ? 0.45 : 0.85 + rand() * 0.3
      kit.box({ x: p.x, y: top, z: p.z, w: 1.0, h, d: 0.6, yaw: radial(deg), mat: 'stone', uvScale: 1.2, collide: true })
    }
    // Vertical rune bands between the ledges.
    for (const deg of [0, 90, 200, 260]) {
      for (let k = 0; k < 6; k++) {
        const p = at(deg, RT + 0.02)
        const y = base + 1.6 + k * 2.4 + rand() * 0.4
        rune(p.x, y, p.z, 0.08, 0.7 + rand() * 0.5, 0.04, radial(deg))
      }
    }
  }

  /** Corbelled ledge attached to the tower (top at `topY` absolute), with a wedge bracket beneath. */
  const ledge = (deg: number, topY: number, w = LEDGE_W, thick = 0.9) => {
    const rho = (RING_IN + RING_OUT) / 2
    const d = RING_OUT - RING_IN
    const p = at(deg, rho)
    const yaw = radial(deg)
    kit.box({ x: p.x, y: topY - thick, z: p.z, w, h: thick, d, yaw, mat: 'stone', uvScale: 1.5, collide: true })
    // Bracket: a wedge that tapers back into the wall.
    const g = worldBox(w * 0.7, 1.4, d * 0.9, 1.5)
    const pos = g.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) if (pos.getY(i) < 0 && pos.getZ(i) > 0) pos.setZ(i, -d * 0.2)
    g.computeVertexNormals()
    const b = at(deg, RING_IN + (d * 0.9) / 2)
    q.setFromAxisAngle(v.set(0, 1, 0), yaw)
    kit.add(g, 'mossStone', m4.compose(v.set(b.x, topY - thick - 0.7, b.z), q, one))
    const e = at(deg, RING_OUT - 0.25)
    rune(e.x, topY + 0.012, e.z, w - 0.3, 0.02, 0.07, yaw)
  }

  /* ── broken spiral stairs ──────────────────────────────────── */
  for (let k = 0; k < STEPS.count; k++) {
    const deg = STEPS.from + k * STEPS.step
    const h = STEPS.rise * (k + 1)
    const rho = (RING_IN + 5.45) / 2
    const p = at(deg, rho)
    const yaw = radial(deg) + (rand() - 0.5) * 0.04
    if (STEPS.missing.includes(k)) {
      // Crumbled: a low stub and some rubble.
      kit.box({ x: p.x, y: base - 0.2, z: p.z, w: 1.0, h: 0.5, d: 1.5, yaw, mat: 'mossStone', collide: true })
      continue
    }
    kit.box({ x: p.x, y: base - 0.2, z: p.z, w: 1.22, h: h + 0.2, d: 5.45 - RING_IN, yaw, mat: k % 4 === 3 ? 'mossStone' : 'stone', uvScale: 1.5, collide: true })
  }
  {
    const p = at(LANDING.deg, (RING_IN + RING_OUT) / 2)
    kit.box({ x: p.x, y: base - 0.2, z: p.z, w: LEDGE_W + 0.2, h: LANDING.top + 0.2, d: RING_OUT - RING_IN, yaw: radial(LANDING.deg), mat: 'stone', uvScale: 1.5, collide: true })
    const e = at(LANDING.deg, RING_OUT - 0.25)
    rune(e.x, base + LANDING.top + 0.012, e.z, LEDGE_W - 0.3, 0.02, 0.07, radial(LANDING.deg))
  }
  ledge(L2.deg, base + L2.top)
  ledge(L3.deg, base + L3.top)
  ledge(L4.deg, base + L4.top)
  for (const s of CROWN_STEPS) ledge(s.deg, base + s.top, 2.0, 0.7)

  /* ── colonnade + gate arch from the ramp to the stairs ─────── */
  const ax = 78.6
  const az = 10.6
  const dirX = 0.83
  const dirZ = -0.557
  const nX = 0.557
  const nZ = 0.83
  const axisYaw = Math.atan2(dirX, dirZ)
  const column = (x: number, z: number, h: number, broken: boolean) => {
    const y = kit.ground(x, z)
    kit.box({ x, y: y - 0.1, z, w: 1.15, h: 0.45, d: 1.15, mat: 'mossStone', uvScale: 1.2 })
    const shaftH = broken ? h - 0.35 : h - 0.95
    const g = worldCylinder(0.38, 0.44, shaftH, 14, 1.5)
    if (broken) {
      const pos = g.attributes.position as THREE.BufferAttribute
      for (let i = 0; i < pos.count; i++) if (pos.getY(i) > shaftH / 2 - 0.01) pos.setY(i, pos.getY(i) - rand() * 0.45)
      g.computeVertexNormals()
    }
    kit.add(g, 'stone', m4.makeTranslation(x, y + 0.35 + shaftH / 2, z))
    if (!broken) {
      kit.add(worldCylinder(0.55, 0.4, 0.3, 14, 1.5), 'stone', m4.makeTranslation(x, y + 0.35 + shaftH + 0.15, z))
      kit.box({ x, y: y + 0.35 + shaftH + 0.3, z, w: 1.2, h: 0.3, d: 1.2, yaw: axisYaw, mat: 'stone', uvScale: 1.2 })
    }
    kit.own(ctx.collision.addCylinder({ x, y: y - 0.2, z, r: broken ? 0.45 : 0.6, h: (broken ? h - 0.45 : h) + 0.2, surface: 'stone' }))
    // Glyph on the plinth facing the path.
    rune(x, y + 0.36, z, 0.5, 0.02, 0.06, axisYaw)
  }
  const COL_H = 4.6
  const rows: Array<[number, boolean[]]> = [[2.5, [false, false, true]], [-2.5, [false, true, false]]]
  for (const [off, broken] of rows) {
    for (let i = 0; i < 3; i++) {
      const s = i * 3.2
      const x = ax + dirX * s + nX * off
      const z = az + dirZ * s + nZ * off
      column(x, z, broken[i] ? 1.6 + rand() * 1.6 : COL_H, broken[i])
    }
    // Architrave over the first two columns of each row (walkable).
    const s = 1.6
    const x = ax + dirX * s + nX * off
    const z = az + dirZ * s + nZ * off
    const y = kit.ground(x, z) + COL_H
    kit.box({ x, y, z, w: 1.0, h: 0.6, d: 4.4, yaw: axisYaw, mat: 'stone', uvScale: 1.5, collide: true })
  }
  // Gate arch.
  const arch = (cx: number, cz: number, yaw: number, span: number, pillarH: number, partial: boolean) => {
    const gy = kit.ground(cx, cz)
    const ux = Math.cos(yaw)
    const uz = -Math.sin(yaw)
    const half = span / 2
    for (const side of partial ? [-1] : [-1, 1]) {
      kit.box({ x: cx + ux * side * (half + 0.45), y: gy - 0.2, z: cz + uz * side * (half + 0.45), w: 0.9, h: pillarH + 0.2, d: 1.0, yaw, mat: side < 0 ? 'mossStone' : 'stone', uvScale: 1.5, collide: true })
    }
    const R = half + 0.45
    const pieces = 9
    for (let i = 0; i < pieces; i++) {
      if (partial && i > 3) break
      const a = Math.PI - ((i + 0.5) / pieces) * Math.PI
      const lx = Math.cos(a) * R
      const ly = Math.sin(a) * R
      const g = worldBox((Math.PI * R) / pieces + 0.04, 0.9, 1.0, 1.5)
      g.rotateZ(a - Math.PI / 2)
      q.setFromAxisAngle(v.set(0, 1, 0), yaw)
      kit.add(g, 'stone', m4.compose(v.set(cx + ux * lx, gy + pillarH + ly, cz + uz * lx), q, one))
      if (i === 4) rune(cx, gy + pillarH + R + 0.46, cz, 0.3, 0.02, 0.3, yaw)
    }
    if (!partial) {
      kit.solidBox(cx, gy + pillarH + R - 0.45, cz, 1.6, 0.9, 1.0, yaw)
      for (const side of [-1, 1]) kit.solidBox(cx + ux * side * (R * 0.72), gy + pillarH + 1.35, cz + uz * side * (R * 0.72), R * 0.55, 1.2, 1.0, yaw)
    }
  }
  arch(ax - dirX * 2.4, az - dirZ * 2.4, axisYaw, 5.0, 4.2, false)
  {
    const p = at(212, 10)
    arch(p.x, p.z, radial(212) + Math.PI / 2, 3.6, 3.6, true)
  }

  /* ── fallen drums, rubble ──────────────────────────────────── */
  for (const [x, z, yaw, len] of [[82.2, -1.2, 0.3, 2.2], [85.2, 13.2, 1.25, 1.6], [98.4, 9.6, -0.5, 2.4], [80.8, 3.6, 2.1, 1.3]] as const) {
    const y = kit.ground(x, z)
    q.setFromEuler(new THREE.Euler(0, yaw, Math.PI / 2, 'YXZ'))
    kit.add(worldCylinder(0.42, 0.42, len, 14, 1.5), 'stone', m4.compose(v.set(x, y + 0.38, z), q, one))
    kit.solidBox(x, y - 0.1, z, len, 0.9, 0.8, yaw)
  }
  for (let i = 0; i < 26; i++) {
    const deg = rand() * 360
    const rho = 4.2 + rand() * 7.5
    const p = at(deg, rho)
    if (kit.ground(p.x, p.z) < base - 0.1) continue
    const s = 0.25 + rand() * 0.45
    kit.box({ x: p.x, y: base - 0.08, z: p.z, w: s * 1.4, h: s, d: s, yaw: rand() * TAU, mat: rand() < 0.5 ? 'mossStone' : 'stone', uvScale: 1, collide: s > 0.45 })
  }

  /* ── cracked paving + rune ring around the tower ───────────── */
  for (let ring = 0; ring < 4; ring++) {
    const rho = 4.3 + ring * 1.3
    const n = Math.floor((TAU * rho) / 1.35)
    for (let i = 0; i < n; i++) {
      if (rand() < 0.13) continue
      const deg = ((i + (ring % 2) * 0.5) / n) * 360
      const p = at(deg, rho)
      const ok = [-0.6, 0.6].every(o => kit.ground(p.x + o, p.z + o) > base - 0.04 && kit.ground(p.x - o, p.z + o) > base - 0.04)
      if (!ok) continue
      const w = (TAU * rho) / n - 0.07
      const yaw = radial(deg) + (rand() - 0.5) * 0.06
      const yTop = base + 0.04 + (rand() - 0.5) * 0.03
      const mat = rand() < 0.3 ? 'mossStone' : 'stone'
      if (rand() < 0.22) {
        // Cracked in two, one half sunk a little.
        for (const side of [-1, 1]) {
          const o = side * (w / 4 + 0.02)
          kit.box({ x: p.x + Math.cos(yaw) * o, y: yTop - 0.2 - (side > 0 ? 0.03 : 0), z: p.z - Math.sin(yaw) * o, w: w / 2 - 0.04, h: 0.2, d: 1.2, yaw: yaw + side * 0.03, mat, uvScale: 1.2, castShadow: false })
        }
      } else {
        kit.box({ x: p.x, y: yTop - 0.2, z: p.z, w, h: 0.2, d: 1.2, yaw, mat, uvScale: 1.2, castShadow: false })
      }
    }
  }
  for (let i = 0; i < 20; i++) {
    const deg = 320 + i * 9.5
    const p = at(deg, 3.62)
    glyph(p.x, base + 0.305, p.z, radial(deg) + Math.PI / 2, 0.22)
  }
  // Rune circle on the ground under the lift.
  {
    const p = at(LIFT.deg, LIFT.rho)
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU
      rune(p.x + Math.cos(a) * 1.5, base + 0.07, p.z + Math.sin(a) * 1.5, 0.05, 0.02, 0.5, Math.PI - a)
    }
  }

  kit.finalize()

  /* ── movers ────────────────────────────────────────────────── */
  const moverMat = new THREE.MeshStandardMaterial({
    map: ctx.textures.get('stone_albedo'),
    normalMap: ctx.textures.get('stone_normal'),
    color: 0xe9e2d6,
    roughness: 0.88,
  })
  const uTime = { value: 0 }
  moverMat.onBeforeCompile = shader => {
    shader.uniforms.uRuneTime = uTime
    shader.uniforms.uRune = { value: RUNE }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aGlow;\nvarying float vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uRuneTime;\nuniform vec3 uRune;\nvarying float vGlow;')
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.75, 0.9, 1.0), vGlow * 0.8);')
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uRune * vGlow * (1.5 + 0.45 * sin(uRuneTime * 2.6));',
      )
  }
  moverMat.customProgramCacheKey = () => 'starfall-rune-mover'

  /** Merge parts, tagging each with a glow weight (0 = stone, 1 = rune). */
  const moverGeo = (parts: Array<[THREE.BufferGeometry, number]>) => {
    const geos = parts.map(([g, glow]) => {
      const ng = g.index ? g.toNonIndexed() : g
      if (ng !== g) g.dispose()
      ng.setAttribute('aGlow', new THREE.Float32BufferAttribute(new Float32Array(ng.attributes.position.count).fill(glow), 1))
      return ng
    })
    const merged = mergeGeometries(geos)
    for (const g of geos) g.dispose()
    merged.computeBoundingSphere()
    return merged
  }
  /** Jagged rock hanging under a floating platform. */
  const keel = (r: number, h: number, y: number) => {
    const g = new THREE.ConeGeometry(r, h, 7, 2)
    g.rotateX(Math.PI)
    const p = g.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) {
      const k = 0.85 + rand() * 0.3
      p.setXYZ(i, p.getX(i) * k, p.getY(i), p.getZ(i) * k)
    }
    g.translate(0, y - h / 2, 0)
    g.computeVertexNormals()
    return g
  }
  const slabGeo = (w: number, h: number, d: number) => {
    const parts: Array<[THREE.BufferGeometry, number]> = [[worldBox(w, h, d, 1.5), 0], [keel(Math.min(w, d) * 0.45, 1.3, -h / 2), 0]]
    const y = h / 2 + 0.012
    for (const s of [-1, 1]) {
      parts.push([new THREE.BoxGeometry(w - 0.3, 0.03, 0.07).translate(0, y, s * (d / 2 - 0.15)), 1])
      parts.push([new THREE.BoxGeometry(0.07, 0.03, d - 0.3).translate(s * (w / 2 - 0.15), y, 0), 1])
      // Glyph marks on the sides.
      parts.push([new THREE.BoxGeometry(0.5, 0.06, 0.03).translate(0, 0, s * (d / 2 + 0.01)), 1])
      parts.push([new THREE.BoxGeometry(0.03, 0.06, 0.5).translate(s * (w / 2 + 0.01), 0, 0), 1])
    }
    return moverGeo(parts)
  }
  const discGeo = (r: number, h: number) => {
    const parts: Array<[THREE.BufferGeometry, number]> = [[worldCylinder(r, r * 0.92, h, 28, 1.5).translate(0, h / 2, 0), 0], [keel(r * 0.7, 1.4, 0), 0]]
    parts.push([new THREE.RingGeometry(r - 0.2, r - 0.12, 28).rotateX(-Math.PI / 2).translate(0, h + 0.012, 0), 1])
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU
      parts.push([new THREE.BoxGeometry(0.07, 0.03, r - 0.5).translate(0, h + 0.012, (r - 0.5) / 2 + 0.15).rotateY(a), 1])
    }
    return moverGeo(parts)
  }

  const movers: Mover[] = []
  const tmp = new THREE.Vector4()
  const addMover = (mesh: THREE.Mesh, col: Collider, pose: Mover['pose']) => {
    mesh.castShadow = true
    mesh.receiveShadow = true
    kit.addObject(mesh)
    kit.own(col)
    const m: Mover = { col, mesh, pose }
    pose(0, tmp)
    col.x = tmp.x
    col.y = tmp.y
    col.z = tmp.z
    col.yaw = tmp.w
    col._c = Math.cos(tmp.w)
    col._s = Math.sin(tmp.w)
    movers.push(m)
  }

  // Lift: dwell at the landing, rise to L2, dwell, sink.
  {
    const p = at(LIFT.deg, LIFT.rho)
    const yaw = radial(LIFT.deg)
    const hh = 0.25
    const period = 2 * (LIFT.dwell + LIFT.travel)
    const col = ctx.collision.addBox({ x: p.x, y: base + LIFT.low - hh, z: p.z, hx: LIFT.size / 2, hy: hh, hz: LIFT.size / 2, yaw, dynamic: true, surface: 'stone', tag: 'platform' })
    addMover(new THREE.Mesh(slabGeo(LIFT.size, hh * 2, LIFT.size), moverMat), col, (t, out) => {
      const u = ((t % period) + period) % period
      let k: number
      if (u < LIFT.dwell) k = 0
      else if (u < LIFT.dwell + LIFT.travel) k = smoother((u - LIFT.dwell) / LIFT.travel)
      else if (u < 2 * LIFT.dwell + LIFT.travel) k = 1
      else k = 1 - smoother((u - 2 * LIFT.dwell - LIFT.travel) / LIFT.travel)
      out.set(p.x, base + LIFT.low + (LIFT.high - LIFT.low) * k - hh, p.z, yaw)
    })
  }
  // Slider: shuttles along a chord between L2 and L3.
  {
    const a = at(SLIDER.a, SLIDER.rho)
    const b = at(SLIDER.b, SLIDER.rho)
    const yaw = Math.atan2(b.x - a.x, b.z - a.z)
    const hh = 0.25
    const period = 2 * (SLIDER.dwell + SLIDER.travel)
    const col = ctx.collision.addBox({ x: a.x, y: base + SLIDER.top - hh, z: a.z, hx: SLIDER.size / 2, hy: hh, hz: SLIDER.size / 2, yaw, dynamic: true, surface: 'stone', tag: 'platform' })
    addMover(new THREE.Mesh(slabGeo(SLIDER.size, hh * 2, SLIDER.size), moverMat), col, (t, out) => {
      const u = (((t + 1.3) % period) + period) % period
      let k: number
      if (u < SLIDER.dwell) k = 0
      else if (u < SLIDER.dwell + SLIDER.travel) k = smoother((u - SLIDER.dwell) / SLIDER.travel)
      else if (u < 2 * SLIDER.dwell + SLIDER.travel) k = 1
      else k = 1 - smoother((u - 2 * SLIDER.dwell - SLIDER.travel) / SLIDER.travel)
      out.set(a.x + (b.x - a.x) * k, base + SLIDER.top - hh, a.z + (b.z - a.z) * k, yaw)
    })
  }
  // Turning disc between L3 and L4 (carries the player round with it).
  {
    const p = at(DISC.deg, DISC.rho)
    const h = 0.5
    const col = ctx.collision.addCylinder({ x: p.x, y: base + DISC.top - h, z: p.z, r: DISC.r, h, dynamic: true, surface: 'stone', tag: 'platform' })
    addMover(new THREE.Mesh(discGeo(DISC.r, h), moverMat), col, (t, out) => {
      out.set(p.x, base + DISC.top - h, p.z, t * DISC.spin)
    })
  }

  return {
    update(dt, t) {
      uTime.value = t
      for (const m of movers) {
        m.pose(t, tmp)
        ctx.collision.move(m.col, tmp.x, tmp.y, tmp.z, tmp.w, dt)
        m.mesh.position.set(tmp.x, tmp.y, tmp.z)
        m.mesh.rotation.y = tmp.w
      }
    },
    dispose: () => {
      kit.dispose()
      moverMat.dispose()
    },
  }
}
