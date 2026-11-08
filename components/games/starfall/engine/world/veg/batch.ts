/**
 * One species = one InstancedMesh per part (e.g. trunk + crown), culled per chunk.
 *
 * Instances are stored sorted by 48 m chunk. Whenever the visible chunk set (or
 * the player / camera position) changes enough, `rebuild()` copies the instances
 * of the visible chunks into the GPU buffers — one draw call per part however
 * many chunks are on screen. Instances are routed to up to three targets:
 * `near` (around the player, inside the follow-shadow frustum: casts shadows),
 * `mid` (full detail, no shadows) and `far` (low-detail LOD beyond `lodDist`).
 */
import * as THREE from 'three'
import type { Collider } from '../../collision'

export const CHUNK = 48
export const CHUNKS_X = 8
const ORIGIN = -(CHUNK * CHUNKS_X) / 2

export function chunkIndex(x: number, z: number): number {
  const i = Math.min(CHUNKS_X - 1, Math.max(0, Math.floor((x - ORIGIN) / CHUNK)))
  const j = Math.min(CHUNKS_X - 1, Math.max(0, Math.floor((z - ORIGIN) / CHUNK)))
  return j * CHUNKS_X + i
}

export function chunkCentre(c: number): [number, number] {
  return [ORIGIN + ((c % CHUNKS_X) + 0.5) * CHUNK, ORIGIN + (Math.floor(c / CHUNKS_X) + 0.5) * CHUNK]
}

/** Chunk visibility flags. */
export const IN_VIEW = 1
export const IN_SHADOW = 2

export interface BatchInstance {
  matrix: THREE.Matrix4
  /** One RGB tint per part. */
  tints: Array<[number, number, number]>
  rank: number
  collider: Collider | null
}

export interface BatchPart {
  geometry: THREE.BufferGeometry
  /** Optional low-detail geometry drawn beyond `lodDist`. */
  lod?: THREE.BufferGeometry
  material: THREE.Material
  depth: THREE.Material | null
}

export interface BatchOptions {
  name: string
  parts: BatchPart[]
  /** Instances near the player (see rebuild's `shadowDist`) cast shadows. */
  shadows: boolean
  /** Cull beyond this distance from the camera. */
  maxDist: number
  /** Switch to the parts' `lod` geometry beyond this camera distance. */
  lodDist?: number
  /** Which quality knob thins the species. */
  density: 'foliage' | 'detail'
}

interface Target {
  meshes: THREE.InstancedMesh[]
  matrix: THREE.InstancedBufferAttribute
  colors: THREE.InstancedBufferAttribute[]
  count: number
}

export class SpeciesBatch {
  readonly count: number
  readonly opts: BatchOptions
  private mats: Float32Array
  private cols: Float32Array[]
  private px: Float32Array
  private pz: Float32Array
  private rank: Float32Array
  private colliders: Array<Collider | null>
  private start = new Int32Array(CHUNKS_X * CHUNKS_X + 1)
  private near: Target | null
  private mid: Target
  private far: Target | null
  private density = -1

  constructor(opts: BatchOptions, instances: BatchInstance[], parent: THREE.Object3D) {
    this.opts = opts
    const n = instances.length
    this.count = n
    // Counting sort by chunk.
    const chunkOf = instances.map(it => chunkIndex(it.matrix.elements[12], it.matrix.elements[14]))
    for (const c of chunkOf) this.start[c + 1]++
    for (let c = 0; c < CHUNKS_X * CHUNKS_X; c++) this.start[c + 1] += this.start[c]
    const fill = this.start.slice(0, CHUNKS_X * CHUNKS_X)
    this.mats = new Float32Array(n * 16)
    this.cols = opts.parts.map(() => new Float32Array(n * 3))
    this.px = new Float32Array(n)
    this.pz = new Float32Array(n)
    this.rank = new Float32Array(n)
    this.colliders = new Array(n)
    instances.forEach((it, k) => {
      const i = fill[chunkOf[k]]++
      this.mats.set(it.matrix.elements, i * 16)
      for (let p = 0; p < this.cols.length; p++) this.cols[p].set(it.tints[p], i * 3)
      this.px[i] = it.matrix.elements[12]
      this.pz[i] = it.matrix.elements[14]
      this.rank[i] = it.rank
      this.colliders[i] = it.collider
    })
    this.mid = this.target(n, 'mid', parent)
    this.near = opts.shadows ? this.target(n, 'near', parent) : null
    this.far = opts.parts.some(p => p.lod) ? this.target(n, 'far', parent) : null
  }

  private target(n: number, kind: 'near' | 'mid' | 'far', parent: THREE.Object3D): Target {
    const near = kind === 'near'
    const matrix = new THREE.InstancedBufferAttribute(new Float32Array(n * 16), 16)
    matrix.setUsage(THREE.DynamicDrawUsage)
    const colors: THREE.InstancedBufferAttribute[] = []
    const meshes = this.opts.parts.map((part, p) => {
      const mesh = new THREE.InstancedMesh(kind === 'far' ? part.lod ?? part.geometry : part.geometry, part.material, n)
      mesh.instanceMatrix = matrix
      const col = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3)
      col.setUsage(THREE.DynamicDrawUsage)
      mesh.instanceColor = col
      colors.push(col)
      mesh.name = `veg:${this.opts.name}:${p}:${kind}`
      mesh.count = 0
      mesh.visible = false
      mesh.frustumCulled = false
      mesh.matrixAutoUpdate = false
      mesh.castShadow = near
      mesh.receiveShadow = true
      if (near && part.depth) mesh.customDepthMaterial = part.depth
      parent.add(mesh)
      return mesh
    })
    return { meshes, matrix, colors, count: 0 }
  }

  /** Enables/disables colliders to match the density thinning. */
  setDensity(density: number): void {
    if (density === this.density) return
    this.density = density
    for (let i = 0; i < this.count; i++) {
      const c = this.colliders[i]
      if (c) c.enabled = this.rank[i] < density
    }
  }

  /**
   * Refill the GPU buffers from the visible chunks. Allocation-free.
   * `shadowDist`: radius around the player whose instances go to the shadow-casting set.
   */
  rebuild(vis: Uint8Array, playerX: number, playerZ: number, camX: number, camZ: number, shadowDist: number): void {
    const { mats, cols, px, pz, rank, start, near, mid, far } = this
    const density = this.density
    const near2 = shadowDist * shadowDist
    const max2 = this.opts.maxDist * this.opts.maxDist
    const lod2 = far ? (this.opts.lodDist ?? Infinity) ** 2 : Infinity
    let nNear = 0
    let nMid = 0
    let nFar = 0
    for (let c = 0; c < CHUNKS_X * CHUNKS_X; c++) {
      const flags = vis[c]
      if (!flags) continue
      for (let i = start[c], e = start[c + 1]; i < e; i++) {
        if (rank[i] >= density) continue
        let dst: Target
        let o: number
        const dx = px[i] - playerX
        const dz = pz[i] - playerZ
        if (near && dx * dx + dz * dz < near2) {
          dst = near
          o = nNear++
        } else {
          if (!(flags & IN_VIEW)) continue
          const ex = px[i] - camX
          const ez = pz[i] - camZ
          const d2 = ex * ex + ez * ez
          if (d2 > max2) continue
          if (far && d2 > lod2) {
            dst = far
            o = nFar++
          } else {
            dst = mid
            o = nMid++
          }
        }
        const m = dst.matrix.array as Float32Array
        const s16 = i * 16
        const d16 = o * 16
        for (let k = 0; k < 16; k++) m[d16 + k] = mats[s16 + k]
        for (let p = 0; p < cols.length; p++) {
          const a = dst.colors[p].array as Float32Array
          const src = cols[p]
          a[o * 3] = src[i * 3]
          a[o * 3 + 1] = src[i * 3 + 1]
          a[o * 3 + 2] = src[i * 3 + 2]
        }
      }
    }
    this.commit(mid, nMid)
    if (near) this.commit(near, nNear)
    if (far) this.commit(far, nFar)
  }

  private commit(t: Target, n: number): void {
    t.count = n
    if (n > 0) {
      t.matrix.clearUpdateRanges()
      t.matrix.addUpdateRange(0, n * 16)
      t.matrix.needsUpdate = true
      for (const c of t.colors) {
        c.clearUpdateRanges()
        c.addUpdateRange(0, n * 3)
        c.needsUpdate = true
      }
    }
    for (const m of t.meshes) {
      m.count = n
      m.visible = n > 0
    }
  }

  /** Instances currently submitted for drawing. */
  get drawn(): number {
    return this.mid.count + (this.near?.count ?? 0) + (this.far?.count ?? 0)
  }

  /** Triangles currently submitted to the main pass. */
  get triangles(): number {
    let t = 0
    for (const target of [this.near, this.mid, this.far]) {
      if (!target) continue
      for (const m of target.meshes) {
        const g = m.geometry
        t += ((g.index ? g.index.count : g.attributes.position.count) / 3) * target.count
      }
    }
    return t
  }

  dispose(): void {
    for (const t of [this.near, this.mid, this.far]) {
      if (!t) continue
      for (const m of t.meshes) {
        m.removeFromParent()
        m.dispose()
      }
    }
  }
}
