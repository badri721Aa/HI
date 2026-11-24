/** Small geometry helpers shared by the maps, the portals and the bosses. */
import * as THREE from 'three'

const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _e = new THREE.Euler()
const _p = new THREE.Vector3()
const _s = new THREE.Vector3()

/** A placement matrix (position, Euler XYZ rotation, scale). The returned matrix is shared: use it at once. */
export function place(x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx): THREE.Matrix4 {
  return _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz))
}

/** Seeded random in [0, 1). */
export function seeded(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 4294967296
  }
}

/**
 * A lumpy rock: an icosphere whose vertices are pushed in and out (the same push for vertices
 * that share a position, so it stays closed) and squashed a little; faceted normals.
 */
export function rockGeometry(radius: number, seed: number, detail = 1): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(radius, detail)
  const pos = g.attributes.position as THREE.BufferAttribute
  const seen = new Map<string, number>()
  const rnd = seeded(seed + 1)
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`
    let k = seen.get(key)
    if (k === undefined) seen.set(key, (k = 0.78 + rnd() * 0.38))
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k * 0.86, pos.getZ(i) * k)
  }
  g.computeVertexNormals()
  return g
}

/** An upside-down rocky cone (top at y = 0) with lumpy sides; the top rim stays round. */
export function jaggedCone(rTop: number, rBot: number, h: number, seed: number): THREE.BufferGeometry {
  const seg = 40
  const rings = 6
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, rings, true)
  g.translate(0, -h / 2, 0)
  const pos = g.attributes.position as THREE.BufferAttribute
  const rnd = seeded(seed)
  const jitter = Array.from({ length: seg * (rings + 1) * 2 }, () => rnd())
  for (let i = 0; i < pos.count; i++) {
    // The seam column repeats the first one: same jitter so the surface stays closed.
    const key = ((i % (seg + 1)) % seg) + Math.floor(i / (seg + 1)) * seg
    const y = pos.getY(i)
    const depth = Math.min(1, -y / 2)
    const k = 1 + (jitter[key * 2] - 0.5) * 0.3 * depth
    pos.setXYZ(i, pos.getX(i) * k, y - jitter[key * 2 + 1] * 1.6 * (-y / h), pos.getZ(i) * k)
  }
  g.computeVertexNormals()
  return g
}

/**
 * A cylinder / frustum (centred on the origin) with world-scaled UVs everywhere: the caps are
 * mapped flat (x, z), so big round floors don't smear the texture the way radial cap UVs do.
 */
export function slab(rTop: number, rBot: number, h: number, seg: number, uvScale = 3): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1)
  const pos = g.attributes.position as THREE.BufferAttribute
  const nrm = g.attributes.normal as THREE.BufferAttribute
  const uv = g.attributes.uv as THREE.BufferAttribute
  const circ = Math.PI * 2 * Math.max(rTop, rBot)
  for (let i = 0; i < pos.count; i++) {
    if (Math.abs(nrm.getY(i)) > 0.9) uv.setXY(i, pos.getX(i) / uvScale, pos.getZ(i) / uvScale)
    else uv.setXY(i, (uv.getX(i) * circ) / uvScale, (pos.getY(i) + h / 2) / uvScale)
  }
  return g
}

/** Multiply a geometry's UVs (e.g. so one texture repeat isn't stretched over a whole mountain). */
export function scaleUv(g: THREE.BufferGeometry, su: number, sv: number): THREE.BufferGeometry {
  const uv = g.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv)
  return g
}
