/**
 * Procedural geometry kit for plants: an append-only vertex builder plus the
 * three primitives every species is made of — tapered tubes (trunks, branches,
 * stems), leaf cards from the foliage atlas, and thin blades (grass, reeds, petals).
 *
 * Every vertex carries `aWind` = (bend, flutter, tintMask): how far it sways with
 * the trunk, how much it flutters like a leaf, and how much of the per-instance
 * tint it takes (see materials.ts).
 */
import * as THREE from 'three'

export interface Vec3 {
  x: number
  y: number
  z: number
}

export class Geo {
  readonly pos: number[] = []
  readonly nrm: number[] = []
  readonly uv: number[] = []
  readonly col: number[] = []
  readonly wind: number[] = []
  readonly idx: number[] = []

  get vertexCount(): number {
    return this.pos.length / 3
  }

  vert(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number, c: Vec3, bend: number, flutter = 0, tint = 1): number {
    this.pos.push(x, y, z)
    const l = Math.hypot(nx, ny, nz) || 1
    this.nrm.push(nx / l, ny / l, nz / l)
    this.uv.push(u, v)
    this.col.push(c.x, c.y, c.z)
    this.wind.push(bend, flutter, tint)
    return this.pos.length / 3 - 1
  }

  tri(a: number, b: number, c: number): void {
    this.idx.push(a, b, c)
  }

  /** Two triangles a-b-c, a-c-d. */
  quad(a: number, b: number, c: number, d: number): void {
    this.idx.push(a, b, c, a, c, d)
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2))
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3))
    g.setAttribute('aWind', new THREE.Float32BufferAttribute(this.wind, 3))
    g.setIndex(this.idx)
    g.computeBoundingSphere()
    g.computeBoundingBox()
    return g
  }
}

/* ────────────────────────────────────────────────────────────
   Tubes
   ──────────────────────────────────────────────────────────── */

export interface TubeOpts {
  /** Centreline at t ∈ [0, 1]. */
  path: (t: number, out: THREE.Vector3) => void
  radius: (t: number, angle: number) => number
  radial: number
  segments: number
  /** Texture repeats around the circumference. */
  uRepeat?: number
  /** Metres per texture repeat along the tube. */
  vScale?: number
  /** Vertex colour at (t, outward normal). */
  color: (t: number, n: THREE.Vector3, out: Vec3) => void
  /** Wind bend weight along the tube. */
  bend: (t: number) => number
  /** Close the end with a pointed tip. */
  tip?: boolean
  /** Tint mask (default 1 = takes the instance tint). */
  tint?: number
}

const _p = new THREE.Vector3()
const _q = new THREE.Vector3()
const _t = new THREE.Vector3()
const _n = new THREE.Vector3()
const _b = new THREE.Vector3()
const _o = new THREE.Vector3()
const _c: Vec3 = { x: 1, y: 1, z: 1 }

/** Generalised cylinder along a curve (parallel-transport frames, world-scaled UVs). */
export function tube(g: Geo, o: TubeOpts): void {
  const { radial, segments } = o
  const vScale = o.vScale ?? 1.5
  const uRepeat = o.uRepeat ?? 1
  const start = g.vertexCount
  let len = 0
  const prev = new THREE.Vector3()
  const normal = new THREE.Vector3()
  for (let s = 0; s <= segments; s++) {
    const t = s / segments
    o.path(t, _p)
    // Tangent by central difference.
    o.path(Math.min(1, t + 0.01), _q)
    o.path(Math.max(0, t - 0.01), _t)
    _q.sub(_t).normalize()
    if (s === 0) {
      normal.set(Math.abs(_q.y) < 0.9 ? 0 : 1, Math.abs(_q.y) < 0.9 ? 1 : 0, 0)
      normal.addScaledVector(_q, -normal.dot(_q)).normalize()
    } else {
      len += _p.distanceTo(prev)
      normal.addScaledVector(_q, -normal.dot(_q)).normalize()
    }
    prev.copy(_p)
    _b.crossVectors(_q, normal).normalize()
    const v = len / vScale
    for (let k = 0; k <= radial; k++) {
      const a = (k / radial) * Math.PI * 2
      const r = o.radius(t, a)
      _n.copy(normal).multiplyScalar(Math.cos(a)).addScaledVector(_b, Math.sin(a))
      _o.copy(_p).addScaledVector(_n, r)
      o.color(t, _n, _c)
      g.vert(_o.x, _o.y, _o.z, _n.x, _n.y, _n.z, (k / radial) * uRepeat, v, _c, o.bend(t), 0, o.tint ?? 1)
    }
  }
  const row = radial + 1
  for (let s = 0; s < segments; s++) {
    for (let k = 0; k < radial; k++) {
      const a = start + s * row + k
      const b = a + row
      g.quad(a, a + 1, b + 1, b)
    }
  }
  if (o.tip) {
    o.path(1, _p)
    o.path(0.99, _t)
    _q.subVectors(_p, _t).normalize()
    o.color(1, _q, _c)
    const r = o.radius(1, 0)
    _o.copy(_p).addScaledVector(_q, r * 2.5)
    const tipI = g.vert(_o.x, _o.y, _o.z, _q.x, _q.y, _q.z, 0.5, len / vScale + 0.2, _c, o.bend(1), 0, o.tint ?? 1)
    const last = start + segments * row
    for (let k = 0; k < radial; k++) g.tri(last + k, last + k + 1, tipI)
  }
}

/* ────────────────────────────────────────────────────────────
   Leaf cards (foliage atlas: 2×2 cells, twig base at the bottom centre)
   ──────────────────────────────────────────────────────────── */

/** Atlas cells: broad oval leaves, slender lance leaves, small round leaves, big heart leaves. */
export const Leaf = { Oval: 0, Lance: 1, Round: 2, Heart: 3 } as const
export type LeafCell = (typeof Leaf)[keyof typeof Leaf]

export interface CardOpts {
  /** Where the twig attaches. */
  base: Vec3
  /** Unit vector from the twig base toward the card's top. */
  dir: Vec3
  /** Unit vector across the card. */
  side: Vec3
  length: number
  width: number
  cell: LeafCell
  segments?: number
  /** Metres the tip sags downward (quadratic along the card). */
  droop?: number
  /** Radians each half folds up out of the card plane (palm fronds, fern leaves). */
  fold?: number
  /** Normals blend toward (vertex − centre): soft, volumetric canopy shading. */
  centre: Vec3
  normalBlend: number
  /** Vertex colour from the world-space point and the 0..1 position along the card. */
  color: (x: number, y: number, z: number, along: number, out: Vec3) => void
  bend: (x: number, y: number, z: number) => number
  flutter: number
  tint?: number
}

const _cn = new THREE.Vector3()
const _cd = new THREE.Vector3()
const _cs = new THREE.Vector3()
const _cp = new THREE.Vector3()
const _cs2 = new THREE.Vector3()

export function card(g: Geo, o: CardOpts): void {
  const seg = o.segments ?? 1
  const fold = o.fold ?? 0
  const droop = o.droop ?? 0
  const cols = fold > 0 ? 3 : 2
  _cd.set(o.dir.x, o.dir.y, o.dir.z)
  _cs.set(o.side.x, o.side.y, o.side.z)
  _cn.crossVectors(_cs, _cd).normalize()
  if (_cn.y < 0) {
    _cn.negate()
    _cs.negate()
  }
  const u0 = (o.cell % 2) * 0.5
  const v0 = o.cell < 2 ? 0.5 : 0
  const start = g.vertexCount
  const hw = o.width / 2
  for (let s = 0; s <= seg; s++) {
    const t = s / seg
    for (let k = 0; k < cols; k++) {
      const uLocal = cols === 3 ? k / 2 : k
      const across = (uLocal - 0.5) * 2 // -1..1
      _cp.set(o.base.x, o.base.y, o.base.z)
        .addScaledVector(_cd, o.length * t)
      _cp.y -= droop * t * t
      let nx = _cn.x
      let ny = _cn.y
      let nz = _cn.z
      if (cols === 3 && across !== 0) {
        _cp.addScaledVector(_cs, across * hw * Math.cos(fold)).addScaledVector(_cn, hw * Math.sin(fold))
        // Folded half: tilt its normal toward the fold.
        _cs2.copy(_cn).multiplyScalar(Math.cos(fold)).addScaledVector(_cs, -across * Math.sin(fold))
        nx = _cs2.x
        ny = _cs2.y
        nz = _cs2.z
      } else if (cols === 2) {
        _cp.addScaledVector(_cs, across * hw)
      }
      // Spherical normal from the crown centre.
      let sx = _cp.x - o.centre.x
      let sy = _cp.y - o.centre.y
      let sz = _cp.z - o.centre.z
      const sl = Math.hypot(sx, sy, sz) || 1
      sx /= sl
      sy /= sl
      sz /= sl
      const b = o.normalBlend
      o.color(_cp.x, _cp.y, _cp.z, t, _c)
      g.vert(
        _cp.x, _cp.y, _cp.z,
        nx * (1 - b) + sx * b, ny * (1 - b) + sy * b, nz * (1 - b) + sz * b,
        u0 + (0.02 + 0.96 * uLocal) * 0.5, v0 + (0.035 + 0.94 * t) * 0.5,
        _c, o.bend(_cp.x, _cp.y, _cp.z), o.flutter * (0.3 + 0.7 * t), o.tint ?? 1,
      )
    }
  }
  for (let s = 0; s < seg; s++) {
    for (let k = 0; k < cols - 1; k++) {
      const a = start + s * cols + k
      const b = a + cols
      g.quad(a, a + 1, b + 1, b)
    }
  }
}

/* ────────────────────────────────────────────────────────────
   Blades (grass, reeds, petals): tapered strips along a curve
   ──────────────────────────────────────────────────────────── */

export interface BladeOpts {
  x: number
  y: number
  z: number
  height: number
  width: number
  /** Horizontal lean direction (unit) and how far the tip leans out (m). */
  lx: number
  lz: number
  lean: number
  segments: number
  /** Colour along the blade (0 root … 1 tip). */
  color: (t: number, out: Vec3) => void
  /** Wind bend at the tip; scales with t². */
  bend: number
  /** Tint mask, constant or along the blade (0 root … 1 tip). */
  tint?: number | ((t: number) => number)
  /** 0 = taper to a point, else tip width as a fraction of the base. */
  tipWidth?: number
  /** Normals blend toward straight up (0..1) so thin blades shade like the ground. */
  upNormal?: number
}

export function blade(g: Geo, o: BladeOpts): void {
  // Blade faces perpendicular to its lean so it shows its width when seen side-on.
  const sx = -o.lz
  const sz = o.lx
  const start = g.vertexCount
  const tipW = o.tipWidth ?? 0
  const up = o.upNormal ?? 0.5
  for (let s = 0; s <= o.segments; s++) {
    const t = s / o.segments
    const lean = o.lean * t * t
    const cx = o.x + o.lx * lean
    const cz = o.z + o.lz * lean
    const cy = o.y + o.height * t - Math.abs(o.lean) * 0.35 * t * t
    const w = (o.width / 2) * (1 - t * (1 - tipW))
    // Face normal = cross(side, tangent); the tangent leans outward as t grows.
    const tx = o.lx * 2 * o.lean * t
    const tz = o.lz * 2 * o.lean * t
    const ty = o.height
    let nx = -sz * ty
    let ny = sz * tx - sx * tz
    let nz = sx * ty
    const nl = Math.hypot(nx, ny, nz) || 1
    nx = (nx / nl) * (1 - up)
    ny = (ny / nl) * (1 - up) + up
    nz = (nz / nl) * (1 - up)
    o.color(t, _c)
    const bend = o.bend * t * t
    const tint = o.tint === undefined ? 1 : typeof o.tint === 'number' ? o.tint : o.tint(t)
    if (s === o.segments && tipW === 0) {
      g.vert(cx, cy, cz, nx, ny, nz, 0.5, t, _c, bend, 0, tint)
    } else {
      g.vert(cx - sx * w, cy, cz - sz * w, nx, ny, nz, 0, t, _c, bend, 0, tint)
      g.vert(cx + sx * w, cy, cz + sz * w, nx, ny, nz, 1, t, _c, bend, 0, tint)
    }
  }
  for (let s = 0; s < o.segments; s++) {
    const a = start + s * 2
    if (s === o.segments - 1 && tipW === 0) g.tri(a, a + 1, a + 2)
    else g.quad(a, a + 1, a + 3, a + 2)
  }
}

/** Ellipsoid cap (dome) with rings × segments, from `y0` (rim) up to the crown. */
export function dome(g: Geo, cx: number, cy: number, cz: number, rx: number, ry: number, rings: number, segs: number, color: (t: number, out: Vec3) => void, bend: number, tint = 1, underside = true): void {
  const start = g.vertexCount
  for (let r = 0; r <= rings; r++) {
    const phi = (r / rings) * (Math.PI / 2)
    const y = Math.sin(phi)
    const rr = Math.cos(phi)
    color(r / rings, _c)
    for (let s = 0; s <= segs; s++) {
      const a = (s / segs) * Math.PI * 2
      const x = Math.cos(a) * rr
      const z = Math.sin(a) * rr
      g.vert(cx + x * rx, cy + y * ry, cz + z * rx, x / rx, y / ry, z / rx, s / segs, r / rings, _c, bend, 0, tint)
    }
  }
  const row = segs + 1
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segs; s++) {
      const a = start + r * row + s
      g.quad(a, a + row, a + row + 1, a + 1)
    }
  }
  if (underside) {
    color(-1, _c)
    const c0 = g.vert(cx, cy + ry * 0.15, cz, 0, -1, 0, 0.5, 0.5, _c, bend, 0, 0)
    const ring = g.vertexCount
    for (let s = 0; s <= segs; s++) {
      const a = (s / segs) * Math.PI * 2
      g.vert(cx + Math.cos(a) * rx, cy, cz + Math.sin(a) * rx, 0, -1, 0, 0, 0, _c, bend, 0, 0)
    }
    for (let s = 0; s < segs; s++) g.tri(c0, ring + s, ring + s + 1)
  }
}
