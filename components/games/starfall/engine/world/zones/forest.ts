/**
 * Whispering Wood — the giant mushroom grove (Shard 2).
 *
 * A violet bounce mushroom launches the player onto a rising spiral of five giant caps
 * that wind around the grove; the tallest, central mushroom carries the shard. Around it:
 * clusters of softly glowing mushrooms, a hollow fallen log to walk through, old stumps
 * and a ring of mossy standing stones. Everything static is batched by the ZoneKit; only
 * the bounce cap is a live mesh (it squashes when landed on).
 */
import * as THREE from 'three'
import type { Ctx } from '../../types'
import { GROVE } from '../level'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { ZoneKit, type ZonePart } from './kit'

const TAU = Math.PI * 2
const DEG = Math.PI / 180
const UP = new THREE.Vector3(0, 1, 0)

/** Deterministic PRNG so the grove is the same on every visit. */
function rng(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), s | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** LatheGeometry with UVs in world metres (u around, v along the profile). */
function lathe(points: THREE.Vector2[], segments: number, uvScale = 1.5): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(points, segments)
  let rMax = 0
  let len = 0
  for (let i = 0; i < points.length; i++) {
    rMax = Math.max(rMax, points[i].x)
    if (i) len += points[i].distanceTo(points[i - 1])
  }
  const uv = g.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * TAU * rMax) / uvScale, (uv.getY(i) * len) / uvScale)
  return g
}

/* ────────────────────────────────────────────────────────────
   Mushroom shapes
   ──────────────────────────────────────────────────────────── */

/** Cap silhouette: a superellipse (flat top, rounded rim). The collider top sits at 95% of its height. */
const CAP_N = 3
const CAP_TOP = 0.95

/** Height of the cap surface above the rim at radial fraction s (0 = centre, 1 = rim). */
function capY(s: number, h: number): number {
  return h * Math.pow(Math.max(0, 1 - Math.pow(s, CAP_N)), 1 / CAP_N)
}

/** Upper cap surface, rim → centre (so LatheGeometry's normals face up/out). y = 0 at the rim. */
function capTopGeo(r: number, h: number, segs: number): THREE.BufferGeometry {
  const pts = [new THREE.Vector2(r * 0.93, -h * 0.08)]
  const steps = 9
  for (let k = 0; k <= steps; k++) {
    const phi = (k / steps) * (Math.PI / 2)
    pts.push(new THREE.Vector2(r * Math.pow(Math.cos(phi), 2 / CAP_N), h * Math.pow(Math.sin(phi), 2 / CAP_N)))
  }
  pts[pts.length - 1].x = 0
  return lathe(pts, segs, 1.6)
}

/** Gills: from the stem out to the curled lip, facing down. */
function capUnderGeo(r: number, h: number, stemR: number, segs: number): THREE.BufferGeometry {
  return lathe([new THREE.Vector2(stemR * 0.9, h * 0.32), new THREE.Vector2(r * 0.55, h * 0.1), new THREE.Vector2(r * 0.93, -h * 0.08)], segs, 0.8)
}

/** Slightly bulbous, tapering stem from y0 to y1 (bottom → top so normals face out). */
function stemGeo(stemR: number, y0: number, y1: number, segs: number): THREE.BufferGeometry {
  const h = y1 - y0
  const prof: Array<[number, number]> = [[1.75, 0], [1.4, 0.06], [1.12, 0.16], [1, 0.32], [0.9, 0.62], [0.94, 0.86], [1.06, 1]]
  return lathe(prof.map(([r, t]) => new THREE.Vector2(stemR * r, y0 + h * t)), segs, 1.4)
}

/* ────────────────────────────────────────────────────────────
   Layout (angles: atan2(z, x) around the grove centre)
   ──────────────────────────────────────────────────────────── */

/** The climbing spiral: angle (deg), cap top above the grove centre's ground, cap radius. */
const SPIRAL: Array<[number, number, number]> = [
  [35, 3.0, 2.3],
  [95, 5.2, 2.2],
  [155, 7.4, 2.1],
  [215, 9.6, 2.0],
  [275, 11.8, 2.0],
]
const SPIRAL_RHO = 6.5

/** Decorative giants: angle, distance, height above local ground, cap radius, lean. */
const GIANTS: Array<[number, number, number, number, number]> = [
  [40, 13, 6.2, 2.2, 0.35],
  [128, 11.5, 8.4, 2.6, -0.3],
  [192, 12.5, 5.0, 1.9, 0.25],
  [248, 11.8, 7.0, 2.4, -0.4],
  [318, 12.2, 4.4, 1.8, 0.3],
]

/** Small jumpable mushrooms near the approach: angle, distance, height, cap radius. */
const SMALL: Array<[number, number, number, number]> = [
  [-28, 10.5, 1.3, 1.1],
  [22, 11.5, 2.1, 1.25],
  [-62, 9.5, 1.9, 1.0],
]

interface ShroomMats {
  stem: THREE.Material
  cap: THREE.Material
}

export function buildForest(ctx: Ctx): ZonePart {
  const kit = new ZoneKit(ctx, 'forest')
  const rand = rng(0x5eed2)
  const gx = GROVE.x
  const gz = GROVE.z
  const g0 = kit.ground(gx, gz)
  const at = (deg: number, rho: number) => ({ x: gx + Math.cos(deg * DEG) * rho, z: gz + Math.sin(deg * DEG) * rho })

  const mats: ShroomMats = {
    stem: kit.mat('plaster', { color: 0xf1e3c6, roughness: 0.9, key: 'stem' }),
    cap: kit.mat('plaster', { color: 0xc4482d, roughness: 0.62, key: 'cap' }),
  }
  const glow = kit.mat('glow', { color: 0xb8f5e4, emissive: 0x3fd2b0, emissiveIntensity: 0.85, key: 'spore' })
  const m4 = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const v = new THREE.Vector3()
  const sc = new THREE.Vector3()
  const spot = new THREE.IcosahedronGeometry(1, 0)

  /** Cream spots sitting on the cap surface (cap rim at height yRim). */
  const spots = (x: number, yRim: number, z: number, r: number, h: number, n: number, mat: THREE.Material) => {
    for (let i = 0; i < n; i++) {
      const s = 0.18 + rand() * 0.66
      const a = rand() * TAU
      const yy = capY(s, h)
      // Superellipse gradient → surface normal (radial, up).
      const nr = Math.pow(s, CAP_N - 1) / r
      const ny = Math.pow(yy / h, CAP_N - 1) / h
      v.set(Math.cos(a) * nr, ny, Math.sin(a) * nr).normalize()
      q.setFromUnitVectors(UP, v)
      const size = r * (0.08 + rand() * 0.07)
      sc.set(size, size * 0.32, size * (0.8 + rand() * 0.4))
      m4.compose(new THREE.Vector3(x + Math.cos(a) * s * r, yRim + yy - size * 0.08, z + Math.sin(a) * s * r), q, sc)
      kit.add(spot.clone(), mat, m4, { castShadow: false })
    }
  }

  /**
   * A giant mushroom whose cap collider top is at `top` (absolute). Stem and cap are solid.
   * `lean` shifts the cap sideways (towards +x of `leanDir`) for a more organic silhouette.
   */
  const giant = (x: number, z: number, top: number, r: number, stemR: number, lean = 0, leanDir = 0, capMat = mats.cap) => {
    const ground = kit.ground(x, z)
    const h = Math.max(0.7, r * 0.42)
    const rim = top - h * CAP_TOP
    const cx = x + Math.cos(leanDir) * lean
    const cz = z + Math.sin(leanDir) * lean
    const segs = r > 1.5 ? 28 : 18
    const stem = stemGeo(stemR, ground - 0.4, rim + h * 0.32, r > 1.5 ? 16 : 12)
    if (lean) {
      // Shear the stem so its top meets the displaced cap (quadratic curve).
      const p = stem.attributes.position as THREE.BufferAttribute
      const span = rim - ground
      for (let i = 0; i < p.count; i++) {
        const t = Math.max(0, (p.getY(i) - ground) / span)
        p.setX(i, p.getX(i) + Math.cos(leanDir) * lean * t * t)
        p.setZ(i, p.getZ(i) + Math.sin(leanDir) * lean * t * t)
      }
      stem.computeVertexNormals()
    }
    kit.add(stem, mats.stem, m4.makeTranslation(x, 0, z))
    kit.add(capTopGeo(r, h, segs), capMat, m4.makeTranslation(cx, rim, cz))
    kit.add(capUnderGeo(r, h, stemR, segs), mats.stem, m4.makeTranslation(cx, rim, cz))
    spots(cx, rim, cz, r, h, Math.round(4 + r * 4), mats.stem)
    kit.own(ctx.collision.addCylinder({ x, y: ground - 0.5, z, r: stemR * 1.2, h: rim - ground + 0.5, surface: 'wood', tag: 'mushroom' }))
    kit.own(ctx.collision.addCylinder({ x: cx, y: rim - h * 0.08, z: cz, r: r * 0.96, h: h * (CAP_TOP + 0.08), surface: 'leaves', tag: 'mushroom' }))
  }

  /* ── the climb ─────────────────────────────────────────────── */
  for (const [deg, up, r] of SPIRAL) {
    const p = at(deg, SPIRAL_RHO)
    giant(p.x, p.z, g0 + up, r, 0.34 + r * 0.12)
  }
  giant(gx, gz, g0 + GROVE.topY, 3.2, 0.95)
  for (const [deg, rho, up, r, lean] of GIANTS) {
    const p = at(deg, rho)
    giant(p.x, p.z, kit.ground(p.x, p.z) + up, r, 0.3 + r * 0.13, Math.abs(lean), lean > 0 ? deg * DEG : deg * DEG + Math.PI)
  }
  for (const [deg, rho, up, r] of SMALL) {
    const p = at(deg, rho)
    giant(p.x, p.z, kit.ground(p.x, p.z) + up, r, 0.22 + r * 0.1)
  }

  /* ── bounce mushroom (live mesh, squashes on landing) ──────── */
  const padMat = kit.mat('plaster', { color: 0x8f62c9, roughness: 0.55, key: 'pad' })
  const px = GROVE.padX
  const pz = GROVE.padZ
  const pg = kit.ground(px, pz)
  const padR = 1.5
  const padH = 0.75
  const padTop = pg + 1.0
  const padRim = padTop - padH * CAP_TOP
  kit.add(stemGeo(0.5, pg - 0.4, padRim + padH * 0.32, 14), mats.stem, m4.makeTranslation(px, 0, pz))
  const pad = new THREE.Group()
  pad.position.set(px, padRim, pz)
  const padCap = new THREE.Mesh(capTopGeo(padR, padH, 28), padMat)
  padCap.castShadow = true
  const padUnder = capUnderGeo(padR, padH, 0.5, 28)
  const padUnderMesh = new THREE.Mesh(padUnder, mats.stem)
  const padSpots: THREE.BufferGeometry[] = []
  for (let i = 0; i < 9; i++) {
    const s = i === 0 ? 0 : 0.35 + (i % 2) * 0.3
    const a = (i / 8) * TAU + rand() * 0.3
    const yy = capY(s, padH)
    const size = i === 0 ? 0.26 : 0.16 + rand() * 0.06
    const g = new THREE.IcosahedronGeometry(1, 1)
    g.scale(size, size * 0.35, size)
    g.translate(Math.cos(a) * s * padR, yy - 0.01, Math.sin(a) * s * padR)
    padSpots.push(g)
  }
  const padSpotGeo = mergeGeometries(padSpots)
  for (const g of padSpots) g.dispose()
  const padSpotMesh = new THREE.Mesh(padSpotGeo, glow)
  pad.add(padCap, padUnderMesh, padSpotMesh)
  kit.addObject(pad)
  let squash = 0
  let squashV = 0
  kit.own(ctx.collision.addCylinder({ x: px, y: pg - 0.4, z: pz, r: 0.55, h: padRim - pg + 0.4, surface: 'wood', tag: 'mushroom' }))
  kit.own(ctx.collision.addCylinder({
    x: px, y: padRim - padH * 0.08, z: pz, r: padR * 0.98, h: padH * (CAP_TOP + 0.08), surface: 'leaves', bounce: 14, tag: 'mushroom',
    onLand: impact => { squashV += 3 + impact * 0.35 },
  }))

  /* ── glowing spore mushrooms ───────────────────────────────── */
  const sporeCap = (r: number) => {
    const pts: THREE.Vector2[] = []
    for (let k = 0; k <= 5; k++) {
      const phi = (k / 5) * (Math.PI / 2)
      pts.push(new THREE.Vector2(r * Math.cos(phi), r * 0.75 * Math.sin(phi)))
    }
    pts[pts.length - 1].x = 0
    return lathe(pts, 9, 0.5)
  }
  const cluster = (x: number, z: number, n: number, spread: number) => {
    for (let i = 0; i < n; i++) {
      const a = rand() * TAU
      const d = spread * Math.sqrt(rand())
      const mx = x + Math.cos(a) * d
      const mz = z + Math.sin(a) * d
      const y = kit.ground(mx, mz)
      const h = 0.14 + rand() * 0.36
      const r = 0.07 + h * 0.32
      const tilt = (rand() - 0.5) * 0.35
      q.setFromAxisAngle(v.set(Math.cos(a + 1.57), 0, Math.sin(a + 1.57)), tilt)
      m4.compose(sc.set(mx, y - 0.05, mz), q, new THREE.Vector3(1, 1, 1))
      kit.add(new THREE.CylinderGeometry(r * 0.32, r * 0.42, h + 0.05, 6, 1, true).translate(0, (h + 0.05) / 2, 0), mats.stem, m4, { castShadow: false })
      kit.add(sporeCap(r).translate(0, h + 0.03, 0), glow, m4, { castShadow: false })
    }
  }
  for (const [deg, up] of SPIRAL) {
    if (up > 8) continue
    const p = at(deg + 14, SPIRAL_RHO + 0.9)
    cluster(p.x, p.z, 5, 0.9)
  }
  for (const [deg, rho] of GIANTS) {
    const p = at(deg - 8, rho - 1.1)
    cluster(p.x, p.z, 6, 1.1)
  }
  cluster(gx + 1.6, gz - 1.2, 7, 1.2)
  cluster(px - 1.8, pz + 1.6, 5, 0.8)

  /* ── hollow fallen log (walk through it, or over it) ───────── */
  {
    const lx = -90.6
    const lz = 39.6
    const yaw = 30 * DEG
    const len = 7.2
    const ro = 1.35
    const ri = 1.1
    const floor = Math.max(kit.ground(lx, lz), kit.ground(lx + Math.sin(yaw) * 3.4, lz + Math.cos(yaw) * 3.4), kit.ground(lx - Math.sin(yaw) * 3.4, lz - Math.cos(yaw) * 3.4)) - 0.08
    const yc = floor + ri
    const rot = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, yaw, 0, 'YXZ'))
    const place = m4.compose(new THREE.Vector3(lx, yc, lz), rot, new THREE.Vector3(1, 1, 1))
    const tube = (r: number, inside: boolean) => {
      const g = new THREE.CylinderGeometry(r, r * 1.02, len, 22, 4, true)
      const uv = g.attributes.uv as THREE.BufferAttribute
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * TAU * r) / 2, (uv.getY(i) * len) / 2)
      const p = g.attributes.position as THREE.BufferAttribute
      for (let i = 0; i < p.count; i++) {
        // Gnarled, slightly uneven bark.
        const k = 1 + Math.sin(p.getY(i) * 2.1 + Math.atan2(p.getZ(i), p.getX(i)) * 3) * 0.025
        p.setX(i, p.getX(i) * k)
        p.setZ(i, p.getZ(i) * k)
      }
      if (inside) flip(g)
      g.computeVertexNormals()
      return g
    }
    kit.add(tube(ro, false), 'bark', place)
    kit.add(tube(ri, true), 'bark', place, { castShadow: false })
    for (const end of [-1, 1]) {
      const ring = new THREE.RingGeometry(ri, ro, 22, 1)
      ring.rotateX(end > 0 ? -Math.PI / 2 : Math.PI / 2)
      ring.translate(0, (end * len) / 2, 0)
      kit.add(ring, 'darkPlanks', place)
    }
    // Moss along the top.
    // Theta π is the log's top once it is laid on its side.
    const moss = new THREE.CylinderGeometry(ro + 0.04, ro + 0.04, len * 0.8, 12, 1, true, Math.PI - 0.9, 1.8)
    kit.add(moss, 'mossStone', place, { castShadow: false })
    // Colliders: two walls and a walkable roof, open in the middle so you can walk through.
    const sx = Math.cos(yaw)
    const sz = -Math.sin(yaw)
    for (const side of [-1, 1]) {
      kit.solidBox(lx + sx * side * 1.08, floor - 0.4, lz + sz * side * 1.08, 0.55, ri + 0.4 + 0.9, len, yaw, { surface: 'wood' })
    }
    kit.solidBox(lx, yc + 0.95, lz, 1.9, ro - 0.95, len, yaw, { surface: 'wood' })
    kit.solidBox(lx, floor - 0.3, lz, 1.6, 0.38, len, yaw, { surface: 'wood' })
  }

  /* ── stumps ────────────────────────────────────────────────── */
  for (const [deg, rho, r, h] of [[-12, 14.5, 0.75, 0.8], [168, 9.6, 0.6, 0.55], [295, 14.5, 0.9, 1.0], [80, 15.5, 0.55, 0.45]] as const) {
    const p = at(deg, rho)
    const y = kit.ground(p.x, p.z)
    kit.cylinder({ x: p.x, y: y - 0.3, z: p.z, r: r * 1.25, rTop: r, h: h + 0.3, segments: 14, mat: 'bark', collide: { surface: 'wood' } })
    kit.add(new THREE.CircleGeometry(r * 0.92, 14).rotateX(-Math.PI / 2), 'planks', m4.makeTranslation(p.x, y + h + 0.005, p.z), { castShadow: false })
    cluster(p.x + r * 1.3, p.z, 3, 0.4)
  }

  /* ── mossy standing stones ─────────────────────────────────── */
  {
    const sx0 = -94
    const sz0 = 11
    const n = 6
    const stone = new THREE.BoxGeometry(1, 1, 1, 2, 4, 2)
    for (let i = 0; i < n; i++) {
      if (i === 4) continue // fallen gap
      const a = (i / n) * TAU + 0.3
      const x = sx0 + Math.cos(a) * 3.6
      const z = sz0 + Math.sin(a) * 3.6
      const y = kit.ground(x, z)
      const w = 0.8 + rand() * 0.35
      const d = 0.5 + rand() * 0.25
      const h = 1.8 + rand() * 1.3
      const g = stone.clone()
      const p = g.attributes.position as THREE.BufferAttribute
      for (let k = 0; k < p.count; k++) {
        const t = p.getY(k) + 0.5
        const taper = 1 - t * 0.28
        p.setXYZ(k, p.getX(k) * taper + (rand() - 0.5) * 0.06, p.getY(k), p.getZ(k) * taper + (rand() - 0.5) * 0.06)
      }
      g.scale(w, h, d)
      g.computeVertexNormals()
      const yaw = -a + Math.PI / 2 + (rand() - 0.5) * 0.4
      q.setFromEuler(new THREE.Euler((rand() - 0.5) * 0.12, yaw, (rand() - 0.5) * 0.12, 'YXZ'))
      kit.add(g, 'mossStone', m4.compose(v.set(x, y + h / 2 - 0.25, z), q, sc.set(1, 1, 1)))
      kit.solidBox(x, y - 0.3, z, w * 0.9, h + 0.05, d * 0.9, yaw, { surface: 'stone' })
    }
    // The fallen one, lying across the ring.
    const fx = sx0 + Math.cos((4 / n) * TAU + 0.3) * 2.6
    const fz = sz0 + Math.sin((4 / n) * TAU + 0.3) * 2.6
    const fy = kit.ground(fx, fz)
    kit.box({ x: fx, y: fy - 0.15, z: fz, w: 0.95, h: 0.6, d: 2.6, yaw: 0.9, mat: 'mossStone', collide: true })
    cluster(sx0, sz0, 6, 1.4)
  }

  kit.finalize()
  spot.dispose()

  return {
    update(dt) {
      if (squash === 0 && squashV === 0) return
      // Critically-damped-ish spring back to rest.
      squashV += (-squash * 160 - squashV * 9) * dt
      squash += squashV * dt
      if (Math.abs(squash) < 1e-3 && Math.abs(squashV) < 1e-2) squash = squashV = 0
      const s = Math.max(-0.4, Math.min(0.5, squash * 0.18))
      pad.scale.set(1 + s * 0.6, 1 - s, 1 + s * 0.6)
    },
    dispose: () => kit.dispose(),
  }
}

/** Reverse triangle winding (for surfaces seen from inside). */
function flip(g: THREE.BufferGeometry): void {
  const idx = g.index
  if (!idx) return
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i + 1)
    idx.setX(i + 1, idx.getX(i + 2))
    idx.setX(i + 2, a)
  }
}
