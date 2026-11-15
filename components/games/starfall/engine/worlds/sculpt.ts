/**
 * Carved and natural stone shapes, generated (no models to load), for ruins of any map:
 *
 *   hexPrism      a faceted basalt column (bottom at y = 0), its top a little tilted
 *   flutedShaft   a classical column shaft with flutes, optionally snapped off in a jagged break
 *   annulus       a ring (or ring sector) of masonry: top, inner and outer walls, end faces
 *   lathe         a turned shape from a profile, with an optional jagged broken top and a warp
 *   statueHead    a colossal carved head wearing a crown of flames, its neck broken off
 *   colossusFoot  a sandalled stone foot with toes (left or right)
 *
 * Angles follow the engine: θ = 0 points to +z, x = sin θ · r, z = cos θ · r.
 * All return non-shared geometry the caller owns (e.g. hands to ZoneKit.add).
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { seeded } from './geo'

/** A flat-shaded hexagonal column of circumradius r and height h, bottom at y = 0. */
export function hexPrism(r: number, h: number, tilt = 0, tiltYaw = 0): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, h, 6, 1).translate(0, h / 2, 0).toNonIndexed()
  const pos = g.attributes.position as THREE.BufferAttribute
  const tx = Math.sin(tiltYaw) * tilt
  const tz = Math.cos(tiltYaw) * tilt
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) > h - 1e-3) pos.setY(i, h + pos.getX(i) * tx + pos.getZ(i) * tz)
  }
  g.computeVertexNormals()
  return g
}

export interface ShaftOpts {
  flutes?: number
  /** Radial segments (a multiple of flutes reads best). */
  segments?: number
  /** Metres per texture repeat. */
  uvScale?: number
  /** A snapped-off top: up to this much is bitten out of the rim (m). */
  broken?: number
  seed?: number
}

/** A fluted column shaft (bottom at y = 0) tapering from rBot to rTop. */
export function flutedShaft(rBot: number, rTop: number, h: number, o: ShaftOpts = {}): THREE.BufferGeometry {
  const flutes = o.flutes ?? 16
  const seg = o.segments ?? flutes * 3
  const uvScale = o.uvScale ?? 2
  const rnd = seeded(o.seed ?? 1)
  const rings = 4
  const bite = Array.from({ length: seg }, () => rnd())
  const pos: number[] = []
  const uv: number[] = []
  const index: number[] = []
  const flute = (phi: number) => 1 - 0.07 * Math.pow(0.5 + 0.5 * Math.cos(phi * flutes), 2)
  for (let j = 0; j <= rings; j++) {
    const v = j / rings
    const r0 = rBot + (rTop - rBot) * v
    for (let i = 0; i <= seg; i++) {
      const phi = (i / seg) * Math.PI * 2
      const r = r0 * flute(phi)
      let y = h * v
      if (j === rings && o.broken) y -= bite[i % seg] * o.broken
      pos.push(Math.sin(phi) * r, y, Math.cos(phi) * r)
      uv.push(((i / seg) * Math.PI * 2 * rBot) / uvScale, y / uvScale)
    }
  }
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < seg; i++) {
      const a = j * (seg + 1) + i
      const b = a + seg + 1
      index.push(a, b, a + 1, a + 1, b, b + 1)
    }
  }
  const sides = new THREE.BufferGeometry()
  sides.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  sides.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  sides.setIndex(index)
  sides.computeVertexNormals()
  // Top: a fan from the middle (lower than the rim when broken, so the break reads as rough).
  const rim = pos.slice(rings * (seg + 1) * 3)
  return mergeParts([sides.toNonIndexed(), fanCap(rim, seg, h - (o.broken ? o.broken * 0.55 : 0), uvScale)], [sides])
}

/** A fan over a ring of seg + 1 points (xyz flattened) to a middle point at height y; flat normals. */
function fanCap(ring: number[], seg: number, y: number, uvScale: number): THREE.BufferGeometry {
  let cx = 0
  let cz = 0
  for (let i = 0; i < seg; i++) {
    cx += ring[i * 3]
    cz += ring[i * 3 + 2]
  }
  cx /= seg
  cz /= seg
  const pos: number[] = []
  for (let i = 0; i < seg; i++) pos.push(cx, y, cz, ring[i * 3], ring[i * 3 + 1], ring[i * 3 + 2], ring[i * 3 + 3], ring[i * 3 + 4], ring[i * 3 + 5])
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  const uv: number[] = []
  for (let i = 0; i < pos.length; i += 3) uv.push(pos[i] / uvScale, pos[i + 2] / uvScale)
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.computeVertexNormals()
  return g
}

/**
 * A ring of masonry between radii rIn and rOut from height y0 to y1, over the angles a0 → a1
 * (a full circle when a1 − a0 ≥ 2π). Flat normals per face; UVs in metres / uvScale.
 */
export function annulus(rIn: number, rOut: number, a0: number, a1: number, y0: number, y1: number, seg: number, uvScale = 2): THREE.BufferGeometry {
  const full = a1 - a0 >= Math.PI * 2 - 1e-6
  const pos: number[] = []
  const uv: number[] = []
  const nrm: number[] = []
  const quad = (p: number[][], n: number[][], t: number[][]) => {
    for (const k of [0, 1, 2, 0, 2, 3]) {
      pos.push(...p[k])
      nrm.push(...n[k])
      uv.push(...t[k])
    }
  }
  const at = (r: number, a: number, y: number) => [Math.sin(a) * r, y, Math.cos(a) * r]
  for (let i = 0; i < seg; i++) {
    const a = a0 + ((a1 - a0) * i) / seg
    const b = a0 + ((a1 - a0) * (i + 1)) / seg
    const up = [0, 1, 0]
    // Top (UVs flat in x, z).
    const tp = [at(rIn, a, y1), at(rOut, a, y1), at(rOut, b, y1), at(rIn, b, y1)]
    quad(tp, [up, up, up, up], tp.map(p => [p[0] / uvScale, p[2] / uvScale]))
    // Outer wall, facing out.
    const no = (x: number) => [Math.sin(x), 0, Math.cos(x)]
    const ua = (a * rOut) / uvScale
    const ub = (b * rOut) / uvScale
    quad([at(rOut, a, y0), at(rOut, b, y0), at(rOut, b, y1), at(rOut, a, y1)], [no(a), no(b), no(b), no(a)], [[ua, y0 / uvScale], [ub, y0 / uvScale], [ub, y1 / uvScale], [ua, y1 / uvScale]])
    // Inner wall, facing the middle.
    const ni = (x: number) => [-Math.sin(x), 0, -Math.cos(x)]
    const va = (a * rIn) / uvScale
    const vb = (b * rIn) / uvScale
    quad([at(rIn, b, y0), at(rIn, a, y0), at(rIn, a, y1), at(rIn, b, y1)], [ni(b), ni(a), ni(a), ni(b)], [[vb, y0 / uvScale], [va, y0 / uvScale], [va, y1 / uvScale], [vb, y1 / uvScale]])
  }
  if (!full) {
    // End faces.
    for (const [a, s] of [[a0, -1], [a1, 1]] as const) {
      const n = [Math.cos(a) * s, 0, -Math.sin(a) * s]
      const p = s < 0 ? [at(rIn, a, y0), at(rOut, a, y0), at(rOut, a, y1), at(rIn, a, y1)] : [at(rOut, a, y0), at(rIn, a, y0), at(rIn, a, y1), at(rOut, a, y1)]
      quad(p, [n, n, n, n], p.map(q => [(Math.hypot(q[0], q[2]) - rIn) / uvScale, q[1] / uvScale]))
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  return g
}

export interface LatheOpts {
  /** Metres per texture repeat. */
  uvScale?: number
  /** A jagged broken top: up to this much bitten out of the last ring (m); adds a rough cap. */
  jag?: number
  seed?: number
  /** Reshape each vertex (p: position to edit in place; dx, dz: its outward direction). */
  warp?: (p: THREE.Vector3, dx: number, dz: number) => void
}

/** A turned shape: `profile` is [radius, y] from bottom to top, swept round `seg` times. */
export function lathe(profile: ReadonlyArray<readonly [number, number]>, seg: number, o: LatheOpts = {}): THREE.BufferGeometry {
  const uvScale = o.uvScale ?? 2
  const rnd = seeded(o.seed ?? 3)
  const bite = Array.from({ length: seg }, () => rnd())
  const pos: number[] = []
  const uv: number[] = []
  const index: number[] = []
  const p = new THREE.Vector3()
  const last = profile.length - 1
  for (let j = 0; j <= last; j++) {
    const [r, y] = profile[j]
    for (let i = 0; i <= seg; i++) {
      const phi = (i / seg) * Math.PI * 2
      const dx = Math.sin(phi)
      const dz = Math.cos(phi)
      p.set(dx * r, y, dz * r)
      if (j === last && o.jag) p.y -= bite[i % seg] * o.jag
      o.warp?.(p, dx, dz)
      pos.push(p.x, p.y, p.z)
      uv.push(((i / seg) * Math.PI * 2 * r) / uvScale, y / uvScale)
    }
  }
  for (let j = 0; j < last; j++) {
    for (let i = 0; i < seg; i++) {
      const a = j * (seg + 1) + i
      const b = a + seg + 1
      index.push(a, b, a + 1, a + 1, b, b + 1)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(index)
  g.computeVertexNormals()
  // The seam duplicates the first column: share their normals so it doesn't show.
  const n = g.attributes.normal as THREE.BufferAttribute
  for (let j = 0; j <= last; j++) {
    const a = j * (seg + 1)
    const b = a + seg
    const x = n.getX(a) + n.getX(b)
    const y = n.getY(a) + n.getY(b)
    const z = n.getZ(a) + n.getZ(b)
    const l = Math.hypot(x, y, z) || 1
    n.setXYZ(a, x / l, y / l, z / l)
    n.setXYZ(b, x / l, y / l, z / l)
  }
  if (!o.jag) return g
  // A rough cap over the broken top.
  const rim = pos.slice(last * (seg + 1) * 3)
  let my = 0
  for (let i = 0; i < seg; i++) my += rim[i * 3 + 1]
  return mergeParts([g.toNonIndexed(), fanCap(rim, seg, my / seg - o.jag * 0.25, uvScale)], [g])
}

/** exp(−(a² + b²)): a soft round bump. */
function bump(a: number, b: number): number {
  return Math.exp(-(a * a + b * b))
}

function smooth(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

/**
 * A colossal head (about 2 units tall, 1.6 wide, facing +z, crown up) with a calm carved face,
 * a band crowned with flames and a broken neck. Scale it to size when placing.
 */
export function statueHead(seed = 11): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 96, 64)
  const pos = g.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const ux = pos.getX(i)
    const uy = pos.getY(i)
    const uz = pos.getZ(i)
    // An egg: narrower jaw, flatter face, a fuller back of the skull.
    const jaw = smooth(-0.15, -0.95, uy)
    let x = ux * 0.78 * (1 - 0.24 * jaw)
    let y = uy
    let z = uz * (uz > 0 ? 0.8 : 0.9) * (1 - 0.18 * jaw * (uz < 0 ? 1 : 0.2))
    if (uy > 0.55) y += (uy - 0.55) * 0.08
    // The face: features pushed out along +z on the front.
    const front = smooth(0.25, 0.7, uz)
    const ax = Math.abs(x)
    let f = 0
    f += 0.2 * bump(x / 0.1, (y + 0.24) / 0.13) + 0.1 * bump(x / 0.075, (y + 0.02) / 0.2) // nose tip and bridge
    f += 0.05 * bump((ax - 0.1) / 0.055, (y + 0.3) / 0.05) // nostril wings
    f += 0.06 * bump(x / 0.42, (y - 0.2) / 0.07) // brow
    f -= 0.085 * bump((ax - 0.26) / 0.12, (y - 0.05) / 0.085) // eye sockets
    f += 0.045 * bump((ax - 0.26) / 0.075, (y - 0.04) / 0.045) // closed lids
    f += 0.045 * bump((ax - 0.36) / 0.13, (y + 0.14) / 0.12) // cheekbones
    f += 0.06 * bump(x / 0.17, (y + 0.47) / 0.045) + 0.055 * bump(x / 0.14, (y + 0.57) / 0.045) // lips
    f -= 0.03 * bump(x / 0.16, (y + 0.52) / 0.02) // the line between them
    f += 0.07 * bump(x / 0.16, (y + 0.8) / 0.09) // chin
    z += f * front
    // Ears on the sides.
    const side = smooth(0.75, 0.95, Math.abs(ux))
    x += Math.sign(ux) * 0.12 * bump((y + 0.05) / 0.2, (uz + 0.05) / 0.11) * side
    pos.setXYZ(i, x, y, z)
  }
  g.computeVertexNormals()
  const parts: THREE.BufferGeometry[] = [g.toNonIndexed()]
  g.dispose()
  // Crown: a band round the brow with flames rising from it, a sun disc on the forehead.
  const rnd = seeded(seed)
  const band = new THREE.CylinderGeometry(0.83, 0.86, 0.26, 40, 1, true).translate(0, 0.52, -0.02)
  band.scale(0.95, 1, 1.0)
  parts.push(band.toNonIndexed())
  band.dispose()
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2
    const tall = 0.32 + (i % 2 ? 0.12 : 0.26) + rnd() * 0.06
    const flame = new THREE.ConeGeometry(0.15, tall, 4).translate(0, tall / 2, 0)
    flame.rotateX(-0.15)
    flame.rotateY(a)
    flame.translate(Math.sin(a) * 0.76, 0.62, Math.cos(a) * 0.79 - 0.02)
    parts.push(flame.toNonIndexed())
    flame.dispose()
  }
  const disc = new THREE.CylinderGeometry(0.13, 0.13, 0.06, 18).rotateX(Math.PI / 2).translate(0, 0.53, 0.84)
  parts.push(disc.toNonIndexed())
  disc.dispose()
  // The broken neck under the jaw.
  const neck = lathe([[0.44, 0.6], [0.42, 0.95], [0.4, 1.22]], 20, { jag: 0.14, seed })
  parts.push(neck.rotateX(Math.PI).translate(0, 0, -0.12))
  const merged = mergeParts(parts)
  return merged
}

/** A colossal sandalled foot standing at y = 0, toes toward +z (side −1: left, 1: right). */
export function colossusFoot(side: 1 | -1): THREE.BufferGeometry {
  // Footprint (x across, z along): heel round at the back, widest across the ball.
  const outline: Array<[number, number]> = [
    [0, -0.95], [0.4, -0.85], [0.58, -0.5], [0.6, 0.2], [0.7, 1.0], [0.78, 1.6], [0.7, 2.0],
    [0.3, 2.15], [-0.2, 2.25], [-0.62, 2.1], [-0.75, 1.6], [-0.66, 0.9], [-0.55, 0.2], [-0.56, -0.5], [-0.4, -0.85],
  ]
  const shape = new THREE.Shape()
  outline.forEach(([x, z], i) => {
    const px = x * side
    if (i === 0) shape.moveTo(px, -z)
    else shape.lineTo(px, -z)
  })
  shape.closePath()
  const body = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: true, bevelThickness: 0.16, bevelSize: 0.14, bevelSegments: 3, curveSegments: 4 })
  body.rotateX(-Math.PI / 2)
  // Shape the top: tall at the heel and ankle, sloping down the instep to the toes.
  const pos = body.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const hgt = 1.15 - 0.62 * smooth(-0.1, 1.9, z)
    pos.setY(i, y < 0.05 ? y : y * hgt)
  }
  body.computeVertexNormals()
  const parts: THREE.BufferGeometry[] = [body]
  // Toes, the big one on the inner side.
  const toes: Array<[number, number, number]> = [[-0.48, 0.22, 2.25], [-0.17, 0.165, 2.3], [0.08, 0.15, 2.22], [0.3, 0.14, 2.1], [0.5, 0.125, 1.95]]
  for (const [x, r, z] of toes) {
    const toe = new THREE.CapsuleGeometry(r, 0.34, 4, 10).rotateX(Math.PI / 2).translate(x * side, r * 0.95, z)
    parts.push(toe.toNonIndexed())
    toe.dispose()
  }
  // Sandal strap across the instep.
  const strap = new THREE.TorusGeometry(0.66, 0.07, 6, 20, Math.PI).scale(1.05, 1.15, 1).translate(0, 0.22, 0.95)
  parts.push(strap.toNonIndexed())
  strap.dispose()
  return mergeParts(parts)
}

/** Merge non-indexed parts that may differ in attributes (keeps position, normal, uv). */
function mergeParts(parts: THREE.BufferGeometry[], free: THREE.BufferGeometry[] = []): THREE.BufferGeometry {
  for (const p of parts) {
    for (const k of Object.keys(p.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') p.deleteAttribute(k)
    if (!p.attributes.normal) p.computeVertexNormals()
    if (!p.attributes.uv) p.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(p.attributes.position.count * 2), 2))
  }
  const merged = mergeGeometries(parts, false)
  for (const p of parts) p.dispose()
  for (const p of free) p.dispose()
  if (!merged) throw new Error('sculpt: merge failed')
  return merged
}
