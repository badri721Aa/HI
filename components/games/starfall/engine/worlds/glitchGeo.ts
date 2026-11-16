/**
 * Geometry for the Glitch Grid: flat-topped slabs whose uvs tell the grid shader how far each
 * point is from the slab's rim, and the batch of flat strips its line art (lattice masts, light
 * beams) is drawn on. The shaders that read these layouts are in glitchShaders.ts.
 */
import * as THREE from 'three'

/** A convex outline on the ground: [x, z] corners in order (either way round). */
export type Outline = ReadonlyArray<readonly [number, number]>

export function rect(x0: number, x1: number, z0: number, z1: number): Outline {
  return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]
}

/** A regular octagon whose flat sides face the axes, `inradius` from the centre to each side. */
export function octagon(inradius: number): Outline {
  const r = inradius / Math.cos(Math.PI / 8)
  return Array.from({ length: 8 }, (_, i) => {
    const a = ((i + 0.5) / 8) * Math.PI * 2
    return [Math.sin(a) * r, Math.cos(a) * r] as const
  })
}

/**
 * The four boxes that together fill a regular octagon exactly: each spans two opposite sides.
 * Returned as half-extents and yaw for collision boxes centred on the octagon.
 */
export function octagonBoxes(inradius: number): Array<{ hx: number; hz: number; yaw: number }> {
  const hz = inradius * Math.tan(Math.PI / 8)
  return [0, 1, 2, 3].map(i => ({ hx: inradius, hz, yaw: (i * Math.PI) / 4 }))
}

/** How far in from the rim the slab's top is cut into a border ring (m): the rim distance is exact inside it. */
export const RIM = 0.6

/**
 * A slab over a convex outline: flat top at y = 0, `thick` deep.
 *
 * uv, in metres: on the top and bottom faces (distance to the rim, capped at RIM; distance round
 * the rim); on the sides (distance round the rim, depth below the top).
 */
export function slabGeometry(outline: Outline, thick: number): THREE.BufferGeometry {
  const n = outline.length
  const cx = outline.reduce((s, p) => s + p[0], 0) / n
  const cz = outline.reduce((s, p) => s + p[1], 0) / n
  // Inward normal of each edge i → i + 1, and the distance round the rim at each corner.
  const nx: number[] = []
  const nz: number[] = []
  const along: number[] = [0]
  for (let i = 0; i < n; i++) {
    const a = outline[i]
    const b = outline[(i + 1) % n]
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    let px = -(b[1] - a[1]) / len
    let pz = (b[0] - a[0]) / len
    if (px * (cx - a[0]) + pz * (cz - a[1]) < 0) {
      px = -px
      pz = -pz
    }
    nx.push(px)
    nz.push(pz)
    along.push(along[i] + len)
  }
  // Each corner moved RIM metres in from both of its edges (a mitre).
  const inner = outline.map((p, i) => {
    const j = (i + n - 1) % n
    const k = RIM / (1 + nx[i] * nx[j] + nz[i] * nz[j])
    return [p[0] + (nx[i] + nx[j]) * k, p[1] + (nz[i] + nz[j]) * k] as const
  })

  const pos: number[] = []
  const nrm: number[] = []
  const uv: number[] = []
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const face = new THREE.Vector3()
  type Corner = readonly [x: number, y: number, z: number, u: number, v: number]
  /** One triangle facing along (fx, fy, fz), whichever way its corners were listed. */
  const tri = (p: Corner, q: Corner, r: Corner, fx: number, fy: number, fz: number) => {
    a.set(p[0], p[1], p[2])
    b.set(q[0], q[1], q[2]).sub(a)
    c.set(r[0], r[1], r[2]).sub(a)
    const flip = b.cross(c).dot(face.set(fx, fy, fz)) < 0
    for (const v of flip ? [p, r, q] : [p, q, r]) {
      pos.push(v[0], v[1], v[2])
      nrm.push(fx, fy, fz)
      uv.push(v[3], v[4])
    }
  }
  const quad = (p: Corner, q: Corner, r: Corner, s: Corner, fx: number, fy: number, fz: number) => {
    tri(p, q, r, fx, fy, fz)
    tri(p, r, s, fx, fy, fz)
  }

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const o0 = outline[i]
    const o1 = outline[j]
    const i0 = inner[i]
    const i1 = inner[j]
    const s0 = along[i]
    const s1 = along[i + 1]
    for (const [y, up] of [[0, 1], [-thick, -1]] as const) {
      // The border ring, then the middle (a fan round the centre).
      quad([o0[0], y, o0[1], 0, s0], [o1[0], y, o1[1], 0, s1], [i1[0], y, i1[1], RIM, s1], [i0[0], y, i0[1], RIM, s0], 0, up, 0)
      tri([cx, y, cz, RIM, 0], [i0[0], y, i0[1], RIM, 0], [i1[0], y, i1[1], RIM, 0], 0, up, 0)
    }
    quad([o0[0], 0, o0[1], s0, 0], [o1[0], 0, o1[1], s1, 0], [o1[0], -thick, o1[1], s1, thick], [o0[0], -thick, o0[1], s0, thick], -nx[i], 0, -nz[i])
  }

  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  return g
}

/** What a strip of line art shows (read by the wire shader). */
export interface WireLook {
  /** 0 = cyan … 1 = magenta. */
  tint: number
  /** Brightness (1 = a plain line; kept ≤ 3). */
  glow: number
  /** Line half-width (m). */
  line: number
}

/**
 * Collects flat strips and builds one mesh from them. Each strip carries uv (0…1 across,
 * metres along) and aWire (width in metres; rung spacing in metres for a lattice, or minus the
 * length for a light beam; tint; glow), plus the line width in aLine.
 */
export class WireBatch {
  private pos: number[] = []
  private uv: number[] = []
  private wire: number[] = []
  private line: number[] = []
  private index: number[] = []

  /**
   * A strip from (ax, ay, az) to (bx, by, bz), `width` wide along the unit vector (sx, sy, sz).
   * `rung` > 0: a lattice with a rung every `rung` metres; otherwise a beam that fades toward b.
   */
  private strip(ax: number, ay: number, az: number, bx: number, by: number, bz: number, sx: number, sy: number, sz: number, width: number, rung: number, look: WireLook): void {
    const len = Math.hypot(bx - ax, by - ay, bz - az)
    const h = width / 2
    const first = this.pos.length / 3
    this.pos.push(
      ax - sx * h, ay - sy * h, az - sz * h, ax + sx * h, ay + sy * h, az + sz * h,
      bx + sx * h, by + sy * h, bz + sz * h, bx - sx * h, by - sy * h, bz - sz * h,
    )
    this.uv.push(0, 0, 1, 0, 1, len, 0, len)
    for (let i = 0; i < 4; i++) {
      this.wire.push(width, rung > 0 ? rung : -len, look.tint, look.glow)
      this.line.push(look.line)
    }
    this.index.push(first, first + 1, first + 2, first, first + 2, first + 3)
  }

  /** A square lattice mast standing on (x, y, z): four faces, `width` across, `height` tall. */
  mast(x: number, y: number, z: number, width: number, height: number, rung: number, look: WireLook): void {
    const h = width / 2
    this.strip(x, y, z - h, x, y + height, z - h, 1, 0, 0, width, rung, look)
    this.strip(x, y, z + h, x, y + height, z + h, 1, 0, 0, width, rung, look)
    this.strip(x - h, y, z, x - h, y + height, z, 0, 0, 1, width, rung, look)
    this.strip(x + h, y, z, x + h, y + height, z, 0, 0, 1, width, rung, look)
  }

  /** A vertical light beam from (x, y, z), `length` up (or down, if negative): two crossed strips, brightest at its foot. */
  beam(x: number, y: number, z: number, length: number, width: number, look: WireLook): void {
    this.strip(x, y, z, x, y + length, z, 1, 0, 0, width, 0, look)
    this.strip(x, y, z, x, y + length, z, 0, 0, 1, width, 0, look)
  }

  build(material: THREE.Material): THREE.Mesh {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2))
    g.setAttribute('aWire', new THREE.Float32BufferAttribute(this.wire, 4))
    g.setAttribute('aLine', new THREE.Float32BufferAttribute(this.line, 1))
    g.setIndex(this.index)
    const mesh = new THREE.Mesh(g, material)
    mesh.name = 'glitch:wire'
    mesh.matrixAutoUpdate = false
    return mesh
  }
}
