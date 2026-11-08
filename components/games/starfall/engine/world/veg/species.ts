/**
 * Procedural plant and rock geometry. Each builder returns merged geometry for
 * one species in object space (base at the origin, +Y up); the scatter adds
 * per-instance yaw, scale and tint. Seeds are fixed, so the island is identical
 * on every load.
 *
 * Unit sizes (before instance scale): oak ≈ 8.5 m, linden ≈ 10.5 m, pine ≈ 11.5 m,
 * palm ≈ 7.5 m, bush ≈ 1.1 m, boulder ≈ 2 m across.
 */
import * as THREE from 'three'
import { blade, card, dome, Geo, Leaf, tube, type LeafCell, type Vec3 } from './geo'
import { Rng } from './rng'

export interface TreeGeometry {
  trunk: THREE.BufferGeometry
  crown: THREE.BufferGeometry
  /** Trunk radius at chest height (collider radius at scale 1). */
  trunkRadius: number
  /** Height of the bare trunk the collider should cover. */
  trunkHeight: number
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}
const set = (o: Vec3, x: number, y: number, z: number) => {
  o.x = x
  o.y = y
  o.z = z
}

const _v = new THREE.Vector3()
const _w = new THREE.Vector3()
const _u = new THREE.Vector3()

function randomUnit(rng: Rng, out: THREE.Vector3): THREE.Vector3 {
  const y = rng.range(-1, 1)
  const a = rng.range(0, Math.PI * 2)
  const r = Math.sqrt(1 - y * y)
  return out.set(Math.cos(a) * r, y, Math.sin(a) * r)
}

/** Any unit vector perpendicular to `d`, randomly rolled. */
function randomSide(rng: Rng, d: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  randomUnit(rng, _u)
  out.crossVectors(d, _u)
  if (out.lengthSq() < 1e-4) out.set(1, 0, 0).cross(d)
  return out.normalize()
}

/* ────────────────────────────────────────────────────────────
   Broadleaf trees
   ──────────────────────────────────────────────────────────── */

interface BroadleafStyle {
  seed: number
  height: number
  /** Fraction of the trunk where the lowest branch leaves it. */
  split: number
  baseRadius: number
  branches: number
  /** Branch elevation above the horizon (rad). */
  elev: [number, number]
  branchLen: [number, number]
  clumpR: [number, number]
  cardsPerClump: number
  cardSize: [number, number]
  cell: LeafCell
  leaf: [number, number, number]
  bark: [number, number, number]
  /** Extra clumps around the crown centre so the canopy reads as one mass. */
  fill: number
}

/** Broad, spreading crown of oval leaves. */
export const OAK: BroadleafStyle = {
  seed: 11, height: 8.4, split: 0.42, baseRadius: 0.4, branches: 6, elev: [0.35, 0.75], branchLen: [2.6, 3.4],
  clumpR: [1.25, 1.7], cardsPerClump: 13, cardSize: [1.55, 2.0], cell: Leaf.Oval, leaf: [0.8, 0.9, 0.62],
  bark: [0.92, 0.86, 0.8], fill: 4,
}

/** Taller, rounder linden with small round leaves and a paler bark. */
export const LINDEN: BroadleafStyle = {
  seed: 23, height: 10.4, split: 0.5, baseRadius: 0.32, branches: 7, elev: [0.75, 1.1], branchLen: [2.0, 2.7],
  clumpR: [1.1, 1.5], cardsPerClump: 13, cardSize: [1.35, 1.75], cell: Leaf.Round, leaf: [0.93, 1.0, 0.6],
  bark: [1.05, 1.02, 1.0], fill: 4,
}

/** `lod` 1 = distant version: same crown layout with fewer, larger cards and coarser wood. */
export function buildBroadleaf(st: BroadleafStyle, lod: 0 | 1 = 0): TreeGeometry {
  const rng = new Rng(st.seed)
  const trunk = new Geo()
  const crown = new Geo()
  const H = st.height
  const phase = rng.range(0, Math.PI * 2)
  const trunkTop = H * 0.86
  const trunkLen = trunkTop + 0.6
  const yAt = (t: number) => -0.6 + trunkLen * t
  const bendAt = (y: number) => 0.32 * Math.pow(Math.max(0, y) / H, 2)
  const trunkPath = (t: number, out: THREE.Vector3) => {
    out.set(Math.sin(t * 2.3 + phase) * 0.25 * t, yAt(t), Math.cos(t * 1.9 + phase) * 0.2 * t)
  }
  const trunkRadius = (t: number, a: number) => {
    const y = yAt(t)
    const flare = Math.max(0, 1 - (y + 0.6) / 1.6)
    const lobes = 1 + 0.3 * flare * Math.max(0, Math.cos(a * 5 + phase))
    return st.baseRadius * (1 - 0.74 * t) * (1 + flare * flare * 1.1) * lobes
  }
  const barkCol = (y: number, out: Vec3) => {
    const ao = 0.6 + 0.4 * smooth(-0.3, 1.4, y)
    set(out, st.bark[0] * ao, st.bark[1] * ao, st.bark[2] * ao)
  }
  tube(trunk, {
    path: trunkPath, radius: trunkRadius, radial: lod ? 6 : 9, segments: lod ? 5 : 10, uRepeat: 2, vScale: 1.7,
    color: (t, _n, out) => barkCol(yAt(t), out), bend: t => bendAt(yAt(t)), tip: true,
  })

  // Branches, each ending in a leaf clump (plus one halfway along).
  const clumps: Array<{ c: THREE.Vector3; r: number }> = []
  const S = new THREE.Vector3()
  const d = new THREE.Vector3()
  for (let b = 0; b < st.branches; b++) {
    const f = b / (st.branches - 1)
    const tb = st.split + (0.84 - st.split) * f + rng.jitter(0.03)
    trunkPath(tb, S)
    const az = b * 2.39996 + rng.jitter(0.35)
    const el = rng.range(st.elev[0], st.elev[1]) + f * 0.25
    const L = rng.range(st.branchLen[0], st.branchLen[1]) * (1 - 0.35 * f)
    d.set(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el))
    const s0 = S.clone()
    const dir = d.clone()
    const path = (t: number, out: THREE.Vector3) => {
      out.copy(s0).addScaledVector(dir, L * t)
      out.y += L * 0.22 * t * t
    }
    const r0 = trunkRadius(tb, 0) * 0.62
    tube(trunk, {
      path, radius: t => r0 * (1 - 0.78 * t), radial: lod ? 4 : 6, segments: lod ? 2 : 4, uRepeat: 1, vScale: 1.2,
      color: (t, _n, out) => barkCol(s0.y + L * t, out), bend: t => bendAt(s0.y + dir.y * L * t) + 0.08 * t * t, tip: true,
    })
    const end = new THREE.Vector3()
    path(1, end)
    clumps.push({ c: end.addScaledVector(dir, 0.35), r: rng.range(st.clumpR[0], st.clumpR[1]) })
    const mid = new THREE.Vector3()
    path(0.5, mid)
    mid.y += 0.55
    clumps.push({ c: mid, r: rng.range(st.clumpR[0], st.clumpR[1]) * 0.85 })
  }
  const top = new THREE.Vector3()
  trunkPath(1, top)
  top.y += 0.5
  clumps.push({ c: top, r: st.clumpR[1] })

  // Crown centre and extent → spherical normals and depth-based shading.
  const C = new THREE.Vector3()
  for (const k of clumps) C.add(k.c)
  C.divideScalar(clumps.length)
  for (let i = 0; i < st.fill; i++) {
    const a = (i / st.fill) * Math.PI * 2 + rng.jitter(0.5)
    clumps.push({ c: new THREE.Vector3(C.x + Math.cos(a) * 1.3, C.y + rng.range(-0.6, 0.8), C.z + Math.sin(a) * 1.3), r: st.clumpR[1] })
  }
  let R = 0
  for (const k of clumps) R = Math.max(R, k.c.distanceTo(C) + k.r)

  const out = new THREE.Vector3()
  const dirV = new THREE.Vector3()
  const side = new THREE.Vector3()
  const base = new THREE.Vector3()
  for (const k of clumps) {
    const jitter = 1 + rng.jitter(0.07)
    const warm = rng.jitter(0.05)
    out.subVectors(k.c, C)
    if (out.lengthSq() > 1e-4) out.normalize()
    const cards = lod ? Math.ceil(st.cardsPerClump * 0.42) : st.cardsPerClump
    for (let i = 0; i < cards; i++) {
      const size = rng.range(st.cardSize[0], st.cardSize[1]) * (lod ? 1.3 : 1)
      randomUnit(rng, dirV)
      dirV.y = dirV.y * 0.75 + 0.3
      dirV.addScaledVector(out, 0.7).normalize()
      randomUnit(rng, _v)
      base.copy(k.c).addScaledVector(_v, k.r * rng.range(0.1, 0.55)).addScaledVector(dirV, -size * 0.38)
      randomSide(rng, dirV, side)
      card(crown, {
        base, dir: dirV, side, length: size, width: size, cell: st.cell, centre: C, normalBlend: 0.8,
        color: (x, y, z, along, c) => {
          _w.set(x - C.x, y - C.y, z - C.z)
          const depth = _w.length() / R
          const ao = clamp(0.3 + 0.62 * depth + 0.28 * (_w.y / R), 0.26, 1.1) * jitter * (0.88 + 0.12 * along)
          set(c, st.leaf[0] * ao * (1 + warm), st.leaf[1] * ao, st.leaf[2] * ao * (1 - warm))
        },
        bend: (_x, y) => bendAt(y) + 0.07, flutter: 1,
      })
    }
  }
  return { trunk: trunk.build(), crown: crown.build(), trunkRadius: st.baseRadius * 0.92, trunkHeight: H * st.split + 1 }
}

/* ────────────────────────────────────────────────────────────
   Pine
   ──────────────────────────────────────────────────────────── */

export function buildPine(lod: 0 | 1 = 0, seed = 37): TreeGeometry {
  const rng = new Rng(seed)
  const trunk = new Geo()
  const crown = new Geo()
  const H = 11.5
  const bendAt = (y: number) => 0.26 * Math.pow(Math.max(0, y) / H, 2)
  const yAt = (t: number) => -0.5 + (H + 0.3) * t
  tube(trunk, {
    path: (t, o) => o.set(Math.sin(t * 3.1) * 0.08, yAt(t), Math.cos(t * 2.3) * 0.06),
    radius: (t, a) => {
      const y = yAt(t)
      const flare = Math.max(0, 1 - (y + 0.5) / 1.2)
      return (0.03 + 0.29 * Math.pow(1 - t, 0.9)) * (1 + flare * flare * 0.9 * (1 + 0.25 * Math.max(0, Math.cos(a * 4))))
    },
    radial: lod ? 5 : 7, segments: lod ? 4 : 8, uRepeat: 2, vScale: 1.6,
    color: (t, _n, o) => {
      const ao = 0.62 + 0.38 * smooth(-0.3, 1.5, yAt(t))
      set(o, 0.95 * ao, 0.85 * ao, 0.78 * ao)
    },
    bend: t => bendAt(yAt(t)), tip: true,
  })

  const tiers = 10
  const dir = new THREE.Vector3()
  const side = new THREE.Vector3()
  const base = new THREE.Vector3()
  const centre = new THREE.Vector3()
  for (let k = 0; k < tiers; k++) {
    const s = k / (tiers - 1)
    const y = 1.6 + (H - 2.4) * Math.pow(s, 0.92)
    const R = 0.65 + 2.75 * Math.pow(1 - s, 1.15)
    const n = Math.max(3, Math.round(7 - 3 * s) - lod * 2)
    const shade = 0.66 + 0.34 * s
    centre.set(0, y + 0.6, 0)
    const color = (x: number, yy: number, z: number, along: number, c: Vec3) => {
      const ao = shade * (0.62 + 0.38 * along)
      set(c, 0.42 * ao, 0.56 * ao, 0.44 * ao)
    }
    for (let i = 0; i < (lod ? n : n * 2); i++) {
      const sprig = i >= n
      const a = ((i % n) + (sprig ? 0.5 : 0)) * ((Math.PI * 2) / n) + k * 0.9 + rng.jitter(0.25)
      const e = sprig ? 0.4 + rng.jitter(0.1) : -0.12 - 0.16 * (1 - s) + rng.jitter(0.06)
      const L = R * (sprig ? 0.62 : rng.range(0.88, 1.08))
      dir.set(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e))
      side.set(-Math.sin(a), 0, Math.cos(a))
      base.set(Math.cos(a) * 0.1, y - (sprig ? 0.25 : 0), Math.sin(a) * 0.1)
      card(crown, {
        base, dir, side, length: L, width: L * (sprig ? 0.7 : lod ? 0.95 : 0.82), cell: Leaf.Lance, segments: sprig || lod ? 1 : 2,
        droop: sprig ? 0 : L * 0.24, fold: sprig || lod ? 0 : 0.42, centre, normalBlend: 0.6, color,
        bend: (x, yy, z) => bendAt(yy) + 0.06 * Math.hypot(x, z) / 3, flutter: 0.25,
      })
    }
  }
  // Leader at the very top.
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI
    card(crown, {
      base: { x: 0, y: H - 1.2, z: 0 }, dir: { x: 0, y: 1, z: 0 }, side: { x: Math.cos(a), y: 0, z: Math.sin(a) },
      length: 1.5, width: 0.75, cell: Leaf.Lance, centre: { x: 0, y: H - 1.5, z: 0 }, normalBlend: 0.5,
      color: (_x, _y, _z, along, c) => set(c, 0.42 * (0.8 + 0.2 * along), 0.58 * (0.8 + 0.2 * along), 0.45),
      bend: () => bendAt(H), flutter: 0.2,
    })
  }
  return { trunk: trunk.build(), crown: crown.build(), trunkRadius: 0.3, trunkHeight: 4 }
}

/* ────────────────────────────────────────────────────────────
   Palm
   ──────────────────────────────────────────────────────────── */

function sphere(g: Geo, cx: number, cy: number, cz: number, r: number, c: Vec3, bend: number): void {
  const rings = 4
  const segs = 6
  const start = g.vertexCount
  for (let i = 0; i <= rings; i++) {
    const phi = (i / rings) * Math.PI
    for (let j = 0; j <= segs; j++) {
      const a = (j / segs) * Math.PI * 2
      const x = Math.sin(phi) * Math.cos(a)
      const y = Math.cos(phi)
      const z = Math.sin(phi) * Math.sin(a)
      g.vert(cx + x * r, cy + y * r, cz + z * r, x, y, z, j / segs, i / rings, c, bend, 0, 1)
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segs; j++) {
      const a = start + i * (segs + 1) + j
      const b = a + segs + 1
      g.quad(a, b, b + 1, a + 1)
    }
  }
}

export function buildPalm(lod: 0 | 1 = 0, seed = 53): TreeGeometry {
  const rng = new Rng(seed)
  const trunk = new Geo()
  const crown = new Geo()
  const H = 7
  const lean = 1.7
  const bendAt = (y: number) => 0.4 * Math.pow(Math.max(0, y) / H, 2)
  const path = (t: number, o: THREE.Vector3) => o.set(lean * Math.pow(t, 2.1) + Math.sin(t * 3.2) * 0.1, -0.4 + (H + 0.4) * t, Math.sin(t * 2.1) * 0.12)
  const segs = lod ? 10 : 28
  tube(trunk, {
    path,
    radius: (t, a) => {
      const flare = Math.max(0, 1 - t * 6)
      const ring = lod ? 1 : Math.round(t * segs) % 2 === 0 ? 1.06 : 0.97
      return (0.27 - 0.1 * t) * ring * (1 + flare * flare * 0.5 * (1 + 0.2 * Math.cos(a * 6)))
    },
    radial: lod ? 6 : 8, segments: segs, uRepeat: 2, vScale: 1.1,
    color: (t, _n, o) => {
      const ring = lod ? 0.9 : Math.round(t * segs) % 2 === 0 ? 1 : 0.8
      const ao = (0.7 + 0.3 * smooth(0, 0.2, t)) * ring
      set(o, 1.08 * ao, 0.98 * ao, 0.82 * ao)
    },
    bend: t => bendAt(-0.4 + (H + 0.4) * t),
  })
  const P = new THREE.Vector3()
  path(1, P)
  const topBend = bendAt(P.y)
  // Crown boot and coconuts.
  const dark: Vec3 = { x: 0.55, y: 0.45, z: 0.32 }
  dome(trunk, P.x, P.y - 0.35, P.z, 0.34, 0.55, 3, 8, (_t, o) => set(o, 0.7, 0.6, 0.45), topBend, 1, false)
  const nut: Vec3 = { x: 0.4, y: 0.36, z: 0.2 }
  for (let i = 0; i < (lod ? 0 : 4); i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4
    sphere(trunk, P.x + Math.cos(a) * 0.24, P.y - 0.42 - (i % 2) * 0.1, P.z + Math.sin(a) * 0.24, 0.13, i % 2 ? nut : dark, topBend)
  }

  const dir = new THREE.Vector3()
  const side = new THREE.Vector3()
  const centre = new THREE.Vector3(P.x, P.y - 1.1, P.z)
  const fronds = 11
  for (let i = 0; i < fronds + 3; i++) {
    const young = i >= fronds
    const a = young ? (i - fronds) * 2.1 + 0.5 : (i / fronds) * Math.PI * 2 + rng.jitter(0.22)
    const e = young ? rng.range(0.95, 1.2) : rng.range(0.18, 0.55)
    const L = young ? rng.range(1.8, 2.3) : rng.range(3.1, 3.9)
    dir.set(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e))
    side.set(-Math.sin(a), 0, Math.cos(a))
    const droop = young ? L * 0.25 : L * rng.range(0.5, 0.72)
    const tone = young ? 1.08 : rng.range(0.86, 1.02)
    card(crown, {
      base: { x: P.x + dir.x * 0.1, y: P.y - 0.05, z: P.z + dir.z * 0.1 }, dir, side, length: L, width: young ? 0.9 : 1.35,
      cell: Leaf.Lance, segments: lod ? 3 : 5, droop, fold: 0.5, centre, normalBlend: 0.45,
      color: (_x, _y, _z, along, c) => {
        const ao = tone * (0.72 + 0.28 * along)
        set(c, (0.95 - 0.12 * along) * ao, 0.98 * ao, (0.5 + 0.08 * along) * ao)
      },
      bend: (x, y, z) => topBend + 0.12 * Math.hypot(x - P.x, z - P.z) / 3.5, flutter: 0.7,
    })
  }
  return { trunk: trunk.build(), crown: crown.build(), trunkRadius: 0.27, trunkHeight: 3 }
}

/* ────────────────────────────────────────────────────────────
   Bushes, shrubs, ferns (leaf cards)
   ──────────────────────────────────────────────────────────── */

export function buildBush(seed = 71): THREE.BufferGeometry {
  const rng = new Rng(seed)
  const g = new Geo()
  const C = new THREE.Vector3(0, 0.5, 0)
  const centre = new THREE.Vector3(0, 0.25, 0)
  const dir = new THREE.Vector3()
  const side = new THREE.Vector3()
  const base = new THREE.Vector3()
  for (let i = 0; i < 34; i++) {
    randomUnit(rng, _v)
    _v.y = Math.abs(_v.y) * 0.9 - 0.05
    _v.normalize()
    const size = rng.range(0.72, 0.98)
    dir.copy(_v).setY(_v.y + 0.45).normalize()
    base.copy(C).addScaledVector(_v, rng.range(0.05, 0.42)).addScaledVector(dir, -size * 0.3)
    base.y = Math.max(base.y, -0.05)
    randomSide(rng, dir, side)
    const cell = i % 3 === 0 ? Leaf.Round : Leaf.Oval
    card(g, {
      base, dir, side, length: size, width: size, cell, centre, normalBlend: 0.88,
      color: (x, y, z, along, c) => {
        const ao = clamp(0.42 + 0.6 * (y / 1.1) + 0.12 * Math.hypot(x, z), 0.35, 1.05) * (0.9 + 0.1 * along)
        set(c, 0.76 * ao, 0.9 * ao, 0.6 * ao)
      },
      bend: (_x, y) => 0.05 * Math.max(0, y), flutter: 0.6,
    })
  }
  return g.build()
}

/** Wind-combed beach scrub: upright tufts of slender leaves. */
export function buildShrub(seed = 79): THREE.BufferGeometry {
  const rng = new Rng(seed)
  const g = new Geo()
  const centre = new THREE.Vector3(0, 0.3, 0)
  const dir = new THREE.Vector3()
  const side = new THREE.Vector3()
  for (let i = 0; i < 20; i++) {
    const a = rng.range(0, Math.PI * 2)
    const e = rng.range(0.6, 1.35)
    dir.set(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e))
    randomSide(rng, dir, side)
    const L = rng.range(0.75, 1.15)
    card(g, {
      base: { x: Math.cos(a) * 0.08, y: -0.05, z: Math.sin(a) * 0.08 }, dir, side, length: L, width: L * 0.8, cell: Leaf.Lance,
      segments: 2, droop: L * 0.12, centre, normalBlend: 0.6,
      color: (_x, y, _z, along, c) => {
        const ao = 0.55 + 0.45 * along
        set(c, 0.98 * ao, 0.94 * ao, 0.55 * ao)
      },
      bend: (_x, y) => 0.08 * Math.max(0, y), flutter: 0.5,
    })
  }
  return g.build()
}

export function buildFern(seed = 83): THREE.BufferGeometry {
  const rng = new Rng(seed)
  const g = new Geo()
  const centre = new THREE.Vector3(0, 0.05, 0)
  const dir = new THREE.Vector3()
  const side = new THREE.Vector3()
  const n = 9
  for (let i = 0; i < n + 3; i++) {
    const young = i >= n
    const a = young ? i * 2.3 : (i / n) * Math.PI * 2 + rng.jitter(0.25)
    const e = young ? rng.range(1.0, 1.25) : rng.range(0.45, 0.85)
    const L = young ? rng.range(0.45, 0.6) : rng.range(0.85, 1.15)
    dir.set(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e))
    side.set(-Math.sin(a), 0, Math.cos(a))
    card(g, {
      base: { x: 0, y: 0.02, z: 0 }, dir, side, length: L, width: L * 0.48, cell: Leaf.Lance, segments: 4,
      droop: young ? L * 0.1 : L * 0.55, fold: 0.35, centre, normalBlend: 0.4,
      color: (_x, _y, _z, along, c) => {
        const ao = 0.55 + 0.45 * along
        set(c, 0.62 * ao, 0.98 * ao, 0.5 * ao)
      },
      bend: (x, y, z) => 0.1 * Math.hypot(x, z), flutter: 0.5,
    })
  }
  return g.build()
}

/* ────────────────────────────────────────────────────────────
   Small plants (vertex-coloured blades, noise-textured)
   ──────────────────────────────────────────────────────────── */

const lerp3 = (out: Vec3, a: readonly number[], b: readonly number[], t: number) =>
  set(out, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t)

/** A patch of flowers; petals take the instance tint (white / yellow / pink / blue). */
export function buildFlowers(seed = 97): THREE.BufferGeometry {
  const rng = new Rng(seed)
  const g = new Geo()
  const stemA = [0.16, 0.26, 0.08]
  const stemB = [0.3, 0.46, 0.16]
  const petal: Vec3 = { x: 1, y: 1, z: 1 }
  const heart: Vec3 = { x: 1, y: 0.72, z: 0.2 }
  const n = 12
  for (let i = 0; i < n; i++) {
    const r = Math.sqrt((i + 0.5) / n) * 0.6
    const a = i * 2.39996 + rng.jitter(0.3)
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r
    const h = rng.range(0.2, 0.42)
    const la = rng.range(0, Math.PI * 2)
    const lx = Math.cos(la)
    const lz = Math.sin(la)
    const lean = rng.range(0.02, 0.07)
    blade(g, { x, y: -0.02, z, height: h, width: 0.016, lx, lz, lean, segments: 2, tipWidth: 1, color: (t, o) => lerp3(o, stemA, stemB, t), bend: 0.07, tint: 0, upNormal: 0.6 })
    for (let k = 0; k < 2; k++) {
      const ka = la + Math.PI * (k + 0.3)
      blade(g, { x, y: -0.02, z, height: rng.range(0.1, 0.16), width: 0.05, lx: Math.cos(ka), lz: Math.sin(ka), lean: 0.09, segments: 2, color: (t, o) => lerp3(o, stemA, stemB, t), bend: 0.02, tint: 0, upNormal: 0.6 })
    }
    // Blossom at the stem tip (matches blade()'s tip position).
    const cx = x + lx * lean
    const cz = z + lz * lean
    const cy = -0.02 + h - lean * 0.35
    const bend = 0.07
    const petals = 5
    const pr = rng.range(0.045, 0.065)
    const tilt = 0.35
    for (let p = 0; p < petals; p++) {
      const pa = (p / petals) * Math.PI * 2 + rng.jitter(0.2)
      const dx = Math.cos(pa)
      const dz = Math.sin(pa)
      const sx = -dz
      const sz = dx
      const w = pr * 0.42
      const tipY = cy + Math.sin(tilt) * pr
      const a0 = g.vert(cx, cy, cz, 0, 1, 0, 0.5, 0, petal, bend, 0.3, 1)
      const a1 = g.vert(cx + dx * pr * 0.5 + sx * w, cy + Math.sin(tilt) * pr * 0.5, cz + dz * pr * 0.5 + sz * w, dx * 0.3, 1, dz * 0.3, 0, 0.5, petal, bend, 0.3, 1)
      const a2 = g.vert(cx + dx * pr, tipY, cz + dz * pr, dx * 0.4, 1, dz * 0.4, 0.5, 1, petal, bend, 0.3, 1)
      const a3 = g.vert(cx + dx * pr * 0.5 - sx * w, cy + Math.sin(tilt) * pr * 0.5, cz + dz * pr * 0.5 - sz * w, dx * 0.3, 1, dz * 0.3, 1, 0.5, petal, bend, 0.3, 1)
      g.quad(a0, a1, a2, a3)
    }
    const hr = pr * 0.32
    const c0 = g.vert(cx - hr, cy + 0.008, cz, 0, 1, 0, 0, 0, heart, bend, 0.3, 0)
    const c1 = g.vert(cx, cy + 0.012, cz - hr, 0, 1, 0, 1, 0, heart, bend, 0.3, 0)
    const c2 = g.vert(cx + hr, cy + 0.008, cz, 0, 1, 0, 1, 1, heart, bend, 0.3, 0)
    const c3 = g.vert(cx, cy + 0.012, cz + hr, 0, 1, 0, 0, 1, heart, bend, 0.3, 0)
    g.quad(c0, c1, c2, c3)
  }
  return g.build()
}

/** Clump of long meadow grass with a few seed heads; fully tinted (meadow green or dune gold). */
export function buildTallGrass(seed = 101): THREE.BufferGeometry {
  const rng = new Rng(seed)
  const g = new Geo()
  const root = [0.2, 0.28, 0.09]
  const tip = [0.78, 0.74, 0.4]
  for (let i = 0; i < 18; i++) {
    const a = rng.range(0, Math.PI * 2)
    const r = rng.range(0, 0.14)
    const h = rng.range(0.5, 0.95)
    blade(g, {
      x: Math.cos(a) * r, y: -0.03, z: Math.sin(a) * r, height: h, width: rng.range(0.045, 0.07), lx: Math.cos(a), lz: Math.sin(a),
      lean: rng.range(0.12, 0.42) * h, segments: 3, color: (t, o) => lerp3(o, root, tip, Math.pow(t, 0.8)), bend: 0.16 * h, upNormal: 0.45,
    })
  }
  const head = [0.85, 0.72, 0.42]
  for (let i = 0; i < 4; i++) {
    const a = rng.range(0, Math.PI * 2)
    const h = rng.range(0.85, 1.1)
    const lx = Math.cos(a)
    const lz = Math.sin(a)
    const lean = rng.range(0.05, 0.14)
    blade(g, { x: lx * 0.04, y: -0.03, z: lz * 0.04, height: h, width: 0.012, lx, lz, lean, segments: 3, tipWidth: 1, color: (t, o) => lerp3(o, root, head, t), bend: 0.18, upNormal: 0.5 })
    blade(g, { x: lx * (0.04 + lean), y: h - 0.03 - lean * 0.35 - 0.02, z: lz * (0.04 + lean), height: 0.16, width: 0.035, lx, lz, lean: 0.02, segments: 2, tipWidth: 0.2, color: (_t, o) => set(o, head[0], head[1], head[2]), bend: 0.18, upNormal: 0.5 })
  }
  return g.build()
}

/** Reeds and cattails for lake shores. */
export function buildReeds(seed = 103): THREE.BufferGeometry {
  const rng = new Rng(seed)
  const g = new Geo()
  const root = [0.18, 0.26, 0.1]
  const tip = [0.62, 0.66, 0.3]
  for (let i = 0; i < 16; i++) {
    const a = rng.range(0, Math.PI * 2)
    const r = rng.range(0, 0.25)
    const h = rng.range(1.0, 1.7)
    blade(g, {
      x: Math.cos(a) * r, y: -0.1, z: Math.sin(a) * r, height: h, width: rng.range(0.035, 0.055), lx: Math.cos(a), lz: Math.sin(a),
      lean: rng.range(0.04, 0.22) * h, segments: 3, color: (t, o) => lerp3(o, root, tip, t), bend: 0.14 * h, upNormal: 0.35,
    })
  }
  const brown: Vec3 = { x: 0.3, y: 0.17, z: 0.08 }
  for (let i = 0; i < 5; i++) {
    const a = rng.range(0, Math.PI * 2)
    const x = Math.cos(a) * rng.range(0.03, 0.2)
    const z = Math.sin(a) * rng.range(0.03, 0.2)
    const h = rng.range(1.15, 1.6)
    blade(g, { x, y: -0.1, z, height: h + 0.2, width: 0.014, lx: 1, lz: 0, lean: 0, segments: 2, tipWidth: 0.6, color: (t, o) => lerp3(o, root, tip, t), bend: 0.2, upNormal: 0.4 })
    const y0 = -0.1 + h - 0.22
    tube(g, {
      path: (t, o) => o.set(x, y0 + t * 0.26, z), radius: t => 0.034 * (1 - 0.3 * Math.abs(t - 0.5) * 2), radial: 6, segments: 2,
      color: (_t, _n, o) => set(o, brown.x, brown.y, brown.z), bend: () => 0.2 * Math.pow((y0 + 0.4) / (h + 0.1), 2), tip: true, tint: 0,
    })
  }
  return g.build()
}

/** Low purple heather mound: green twigs below, tinted blossom spikes on top. */
export function buildHeather(seed = 107): THREE.BufferGeometry {
  const rng = new Rng(seed)
  const g = new Geo()
  const twig = [0.2, 0.22, 0.1]
  const leafy = [0.32, 0.38, 0.16]
  const bloom = [0.95, 0.92, 0.95]
  for (let i = 0; i < 34; i++) {
    const a = rng.range(0, Math.PI * 2)
    const d = Math.sqrt(rng.next()) * 0.42
    const h = (0.22 + rng.range(0, 0.2)) * (1 - 0.45 * (d / 0.42))
    blade(g, {
      x: Math.cos(a) * d, y: -0.03, z: Math.sin(a) * d, height: h, width: rng.range(0.06, 0.09), lx: Math.cos(a), lz: Math.sin(a),
      lean: 0.06 + d * 0.3, segments: 3, tipWidth: 0.55,
      color: (t, o) => (t < 0.45 ? lerp3(o, twig, leafy, t / 0.45) : lerp3(o, leafy, bloom, smooth(0.45, 0.75, t))),
      tint: t => smooth(0.45, 0.75, t), bend: 0.05, upNormal: 0.55,
    })
  }
  return g.build()
}

/** A cluster of small toadstools; caps take the instance tint. */
export function buildMushrooms(seed = 109): THREE.BufferGeometry {
  const rng = new Rng(seed)
  const g = new Geo()
  for (let i = 0; i < 5; i++) {
    const a = rng.range(0, Math.PI * 2)
    const d = i === 0 ? 0 : rng.range(0.08, 0.22)
    const x = Math.cos(a) * d
    const z = Math.sin(a) * d
    const s = i === 0 ? 1 : rng.range(0.5, 0.85)
    const h = 0.15 * s
    const lean = rng.jitter(0.02)
    tube(g, {
      path: (t, o) => o.set(x + lean * t, -0.02 + h * t, z), radius: t => 0.022 * s * (1.15 - 0.3 * t), radial: 5, segments: 1,
      color: (_t, _n, o) => set(o, 0.9, 0.86, 0.74), bend: () => 0, tint: 0,
    })
    dome(g, x + lean, -0.02 + h, z, 0.075 * s, 0.05 * s, 2, 7, (t, o) => (t < 0 ? set(o, 0.85, 0.8, 0.68) : set(o, 1 - 0.1 * t, 0.96 - 0.1 * t, 0.92)), 0, 1, true)
  }
  return g.build()
}

/* ────────────────────────────────────────────────────────────
   Dead wood
   ──────────────────────────────────────────────────────────── */

/** Fallen mossy log lying along X, centred on the origin (radius ≈ 0.34, length 4). */
export function buildLog(seed = 113): THREE.BufferGeometry {
  const rng = new Rng(seed)
  const g = new Geo()
  const L = 4
  const r0 = 0.34
  const ph = rng.range(0, 6)
  const radius = (t: number, a: number) => r0 * (1 - 0.15 * t) * (1 + 0.05 * Math.sin(a * 3 + ph + t * 4))
  const path = (t: number, o: THREE.Vector3) => o.set(-L / 2 + L * t, r0 * 0.85, Math.sin(t * 2.4 + ph) * 0.12)
  const color = (_t: number, n: THREE.Vector3, o: Vec3) => {
    const moss = smooth(0.25, 0.8, n.y)
    const ao = 0.62 + 0.38 * smooth(-0.6, 0.3, n.y)
    set(o, (0.95 - 0.35 * moss) * ao, (0.88 + 0.12 * moss) * ao, (0.8 - 0.35 * moss) * ao)
  }
  tube(g, { path, radius, radial: 10, segments: 7, uRepeat: 2, vScale: 1.4, color, bend: () => 0 })
  // Cut ends: pale wood with darker growth rings (UVs pinned to one bark texel).
  for (const end of [0, 1]) {
    path(end, _v)
    const nx = end ? 1 : -1
    const ring = g.vertexCount
    const rr = radius(end, 0)
    const cRing: Vec3 = { x: 1.4, y: 1.1, z: 0.8 }
    const cCore: Vec3 = { x: 2.1, y: 1.7, z: 1.2 }
    const c0 = g.vert(_v.x, _v.y, _v.z, nx, 0, 0, 0.5, 0.5, cCore, 0, 0, 1)
    for (let k = 0; k <= 10; k++) {
      const a = (k / 10) * Math.PI * 2
      g.vert(_v.x, _v.y + Math.cos(a) * rr * 0.97, _v.z + Math.sin(a) * rr * 0.97, nx, 0, 0, 0.5, 0.5, cRing, 0, 0, 1)
    }
    for (let k = 0; k < 10; k++) {
      if (end) g.tri(c0, ring + 1 + k, ring + 2 + k)
      else g.tri(c0, ring + 2 + k, ring + 1 + k)
    }
  }
  // Two broken branch stubs.
  for (const [t, a] of [[0.3, 0.6], [0.7, 2.3]] as const) {
    path(t, _w)
    const dx = 0.25
    const dy = Math.cos(a)
    const dz = Math.sin(a)
    tube(g, {
      path: (s, o) => o.set(_w.x + dx * s * 0.5, _w.y + dy * (r0 * 0.7 + s * 0.4), _w.z + dz * (r0 * 0.7 + s * 0.4)),
      radius: s => 0.08 * (1 - 0.5 * s), radial: 5, segments: 1, uRepeat: 1, vScale: 1, color: (s, n, o) => color(s, n, o), bend: () => 0, tip: true,
    })
  }
  return g.build()
}

/** Sun-bleached driftwood: a twisted forked branch lying on the sand. */
export function buildDriftwood(seed = 127): THREE.BufferGeometry {
  const rng = new Rng(seed)
  const g = new Geo()
  const pale = (_t: number, n: THREE.Vector3, o: Vec3) => {
    const ao = 0.7 + 0.3 * smooth(-0.6, 0.4, n.y)
    set(o, 2.3 * ao, 2.15 * ao, 1.95 * ao)
  }
  const L = 2.6
  const main = (t: number, o: THREE.Vector3) => o.set(-L / 2 + L * t, 0.1 + Math.sin(t * 3.1) * 0.05, Math.sin(t * 2.2 + 0.4) * 0.25)
  tube(g, { path: main, radius: (t, a) => (0.13 - 0.07 * t) * (1 + 0.12 * Math.sin(a * 2 + t * 9)), radial: 7, segments: 7, uRepeat: 1, vScale: 1.2, color: pale, bend: () => 0, tip: true })
  for (const [t, a, len] of [[0.35, 0.9, 1.0], [0.62, -1.1, 0.7], [0.02, 2.4, 0.45], [0.02, -2.5, 0.4]] as const) {
    main(t, _w)
    const s0 = _w.clone()
    const dx = Math.cos(a)
    const dz = Math.sin(a)
    const r = 0.06 + rng.range(0, 0.02)
    tube(g, {
      path: (s, o) => o.set(s0.x + dx * len * s, s0.y + 0.04 * s, s0.z + dz * len * s + Math.sin(s * 3) * 0.05),
      radius: s => r * (1 - 0.7 * s), radial: 5, segments: 3, uRepeat: 1, vScale: 1, color: pale, bend: () => 0, tip: true,
    })
  }
  return g.build()
}

/* ────────────────────────────────────────────────────────────
   Rocks
   ──────────────────────────────────────────────────────────── */

function vnoise3(x: number, y: number, z: number, seed: number): number {
  const h = (i: number, j: number, k: number) => {
    let n = Math.imul(i, 0x27d4eb2d) ^ Math.imul(j, 0x165667b1) ^ Math.imul(k, 0x1b873593) ^ seed
    n = Math.imul(n ^ (n >>> 15), 0x85ebca6b)
    n ^= n >>> 13
    return ((n >>> 0) / 4294967296) * 2 - 1
  }
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const zi = Math.floor(z)
  const fx = x - xi
  const fy = y - yi
  const fz = z - zi
  const u = fx * fx * (3 - 2 * fx)
  const v = fy * fy * (3 - 2 * fy)
  const w = fz * fz * (3 - 2 * fz)
  const l = (a: number, b: number, t: number) => a + (b - a) * t
  return l(
    l(l(h(xi, yi, zi), h(xi + 1, yi, zi), u), l(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), v),
    l(l(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), l(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u), v),
    w,
  )
}

export interface RockStyle {
  seed: number
  detail: number
  /** Lumpiness. */
  amp: number
  /** Vertical squash. */
  squash: number
  /** Planar top cut (slabs); 1 = none. */
  cut: number
}

export const BOULDER_A: RockStyle = { seed: 131, detail: 2, amp: 0.28, squash: 0.72, cut: 1 }
export const BOULDER_B: RockStyle = { seed: 137, detail: 1, amp: 0.22, squash: 0.62, cut: 0.42 }
export const PEBBLE: RockStyle = { seed: 139, detail: 1, amp: 0.3, squash: 0.65, cut: 1 }

/**
 * Faceted rock about 2 units across, with ~30 % of its height below y = 0
 * so it sits *in* the ground. Per-face planar UVs (no stretching).
 */
export function buildRock(st: RockStyle): THREE.BufferGeometry {
  const src = new THREE.IcosahedronGeometry(1, st.detail)
  const p = src.attributes.position as THREE.BufferAttribute
  const pts: number[] = []
  let minY = Infinity
  let maxY = -Infinity
  for (let i = 0; i < p.count; i++) {
    _v.fromBufferAttribute(p, i).normalize()
    const n = vnoise3(_v.x * 1.4 + 3, _v.y * 1.4, _v.z * 1.4, st.seed) * 0.7 + vnoise3(_v.x * 3.3, _v.y * 3.3 + 7, _v.z * 3.3, st.seed + 1) * 0.3
    const r = 1 + n * st.amp
    let x = _v.x * r
    let y = _v.y * r * st.squash
    let z = _v.z * r
    if (st.cut < 1 && y > st.cut) y = st.cut + (y - st.cut) * 0.15
    // Slightly elongated, flatter underside.
    x *= 1.12
    if (y < -0.25) y = -0.25 + (y + 0.25) * 0.4
    z *= 0.94
    pts.push(x, y, z)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  }
  src.dispose()
  const shift = minY + (maxY - minY) * 0.3
  const g = new Geo()
  const c: Vec3 = { x: 1, y: 1, z: 1 }
  const rng = new Rng(st.seed)
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const d = new THREE.Vector3()
  const n = new THREE.Vector3()
  for (let f = 0; f < pts.length / 9; f++) {
    a.set(pts[f * 9], pts[f * 9 + 1] - shift, pts[f * 9 + 2])
    b.set(pts[f * 9 + 3], pts[f * 9 + 4] - shift, pts[f * 9 + 5])
    d.set(pts[f * 9 + 6], pts[f * 9 + 7] - shift, pts[f * 9 + 8])
    n.subVectors(b, a).cross(_w.subVectors(d, a)).normalize()
    const ax = Math.abs(n.x)
    const ay = Math.abs(n.y)
    const az = Math.abs(n.z)
    const shade = 1 + rng.jitter(0.07)
    const tri = [a, b, d]
    const idx: number[] = []
    for (const q of tri) {
      const u = ax > ay && ax > az ? q.z : q.x
      const v = ay > ax && ay > az ? q.z : q.y
      const ao = (0.55 + 0.45 * smooth(-0.35, 0.55, q.y)) * shade
      set(c, ao, ao, ao)
      idx.push(g.vert(q.x, q.y, q.z, n.x, n.y, n.z, u * 0.55, v * 0.55, c, 0, 0, 1))
    }
    g.tri(idx[0], idx[1], idx[2])
  }
  return g.build()
}
