/**
 * Distant sea stacks and islets on the horizon — pure scenery for depth.
 * Built procedurally (noisy lathe columns), merged into one mesh and shaded
 * with the terrain material: triplanar rock walls, grassy crowns, a wet band
 * at the waterline. Well outside the playable radius, so no colliders.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { noise2, smoothstep } from '../heightfield'

interface StackDef {
  x: number
  z: number
  /** Base radius at the waterline. */
  r: number
  /** Crown height above the sea. */
  h: number
  /** 0 = tall column, 1 = low rounded islet. */
  islet: number
}

const STACKS: StackDef[] = [
  { x: -252, z: -150, r: 26, h: 15, islet: 1 },
  { x: -214, z: -206, r: 7, h: 27, islet: 0 },
  { x: -196, z: -222, r: 4, h: 13, islet: 0 },
  { x: -292, z: -36, r: 10, h: 21, islet: 0.3 },
  { x: -232, z: 156, r: 6.5, h: 15, islet: 0 },
  { x: -128, z: 272, r: 5, h: 11, islet: 0 },
  { x: 46, z: 292, r: 22, h: 9, islet: 1 },
  { x: 258, z: 176, r: 8, h: 23, islet: 0.2 },
  { x: 284, z: -62, r: 24, h: 12, islet: 1 },
  { x: 62, z: -276, r: 11, h: 31, islet: 0.2 },
  { x: 92, z: -262, r: 5, h: 14, islet: 0 },
]

const RADIAL = 22
const RINGS = 16
const BASE_Y = -14

function stackGeometry(s: StackDef, seed: number): THREE.BufferGeometry {
  const pos: number[] = []
  const idx: number[] = []
  const top = s.h
  for (let ring = 0; ring <= RINGS; ring++) {
    const t = ring / RINGS
    const y = BASE_Y + (top - BASE_Y) * t
    // Profile: flared base, then either a straight column or a broad dome.
    const crownStart = 0.62 + (1 - s.islet) * 0.26
    const crown = t > crownStart ? Math.sqrt(Math.max(0, 1 - ((t - crownStart) / (1 - crownStart)) ** 2)) : 1
    const flare = 1.28 - 0.3 * t - 0.12 * s.islet * t
    for (let k = 0; k < RADIAL; k++) {
      const a = (k / RADIAL) * Math.PI * 2
      const ca = Math.cos(a)
      const sa = Math.sin(a)
      const n1 = noise2(ca * 1.2 + y * 0.11 + seed, sa * 1.2 - y * 0.07 - seed)
      const n2 = noise2(ca * 3.1 + y * 0.35 + seed * 2, sa * 3.1 + seed)
      const strata = Math.sin(y * 1.4 + n1 * 3) * 0.04
      const rr = s.r * flare * (0.12 + 0.88 * crown) * (1 + n1 * 0.24 + n2 * 0.09 + strata)
      pos.push(s.x + ca * rr, y + (crown < 1 ? n2 * 0.6 : 0), s.z + sa * rr)
    }
  }
  // Crown cap vertex.
  const capY = top + 0.6 + s.islet * 1.2
  pos.push(s.x, capY, s.z)
  for (let ring = 0; ring < RINGS; ring++) {
    for (let k = 0; k < RADIAL; k++) {
      const k1 = (k + 1) % RADIAL
      const a = ring * RADIAL + k
      const b = ring * RADIAL + k1
      const c = (ring + 1) * RADIAL + k
      const d = (ring + 1) * RADIAL + k1
      idx.push(a, c, b, b, c, d)
    }
  }
  const cap = (RINGS + 1) * RADIAL
  const last = RINGS * RADIAL
  for (let k = 0; k < RADIAL; k++) idx.push(last + k, cap, last + ((k + 1) % RADIAL))

  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()

  // Splat: grass on the gentle crown, rock elsewhere; misc: AO, height above sea, lushness.
  const count = pos.length / 3
  const nrm = g.attributes.normal as THREE.BufferAttribute
  const splat = new Float32Array(count * 4)
  const misc = new Float32Array(count * 3)
  for (let v = 0; v < count; v++) {
    const y = pos[v * 3 + 1]
    const ny = nrm.getY(v)
    const grass = smoothstep(0.62, 0.82, ny) * smoothstep(top * 0.5, top * 0.8, y)
    splat[v * 4 + 2] = 1 - grass
    splat[v * 4 + 3] = 0.5
    misc[v * 3] = 0.6 + 0.4 * smoothstep(-1, top, y)
    misc[v * 3 + 1] = y
    misc[v * 3 + 2] = -0.4
  }
  g.setAttribute('aSplat', new THREE.BufferAttribute(splat, 4))
  g.setAttribute('aMisc', new THREE.BufferAttribute(misc, 3))
  return g
}

/** One merged mesh holding every stack. */
export function buildSeaStacks(material: THREE.Material): THREE.Mesh | null {
  const parts = STACKS.map((s, i) => stackGeometry(s, i * 7.31 + 2.2))
  const merged = mergeGeometries(parts)
  for (const p of parts) p.dispose()
  if (!merged) return null
  merged.computeBoundingSphere()
  const mesh = new THREE.Mesh(merged, material)
  mesh.name = 'sea-stacks'
  mesh.matrixAutoUpdate = false
  return mesh
}
