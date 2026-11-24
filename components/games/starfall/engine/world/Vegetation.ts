/**
 * Vegetation — every tree, palm, pine, bush, fern, flower, reed, rock and blade of
 * grass on the island.
 *
 * Init: scatter placements over the cached ground (veg/scatter.ts), build one
 * procedural geometry per species (veg/species.ts), and upload them as chunk-sorted
 * instanced batches (veg/batch.ts) with trunk/boulder/log colliders.
 *
 * First update: the zones are built by now, so anything planted through one of
 * their props (stumps, stones, docks, fences…) is retired, and the grass field
 * learns to grow around them too (veg/blockers.ts).
 *
 * Per frame: one wind clock, a frustum test of 64 chunk spheres, a cheap re-fill of
 * the instance buffers when the visible set changes, and the streaming grass field
 * around the player (veg/grass.ts). No per-frame allocations.
 */
import * as THREE from 'three'
import type { Collider } from '../collision'
import type { Ctx, IVegetation } from '../types'
import { CHUNKS_X, IN_SHADOW, IN_VIEW, chunkCentre, chunkIndex, SpeciesBatch, type BatchInstance, type BatchPart } from './veg/batch'
import { Blockers } from './veg/blockers'
import { GrassField } from './veg/grass'
import { GroundCache } from './veg/ground'
import { createVegMaterial, createVegUniforms, type VegMaterialOpts } from './veg/materials'
import { scatter, type Placement, type SpeciesId } from './veg/scatter'
import {
  BOULDER_A, BOULDER_B, buildBroadleaf, buildBush, buildDriftwood, buildFern, buildFlowers, buildHeather, buildLog,
  buildMushrooms, buildPalm, buildPine, buildReeds, buildRock, buildShrub, buildTallGrass, LINDEN, OAK, PEBBLE, type TreeGeometry,
} from './veg/species'

type MatKey = 'bark' | 'crown' | 'bush' | 'fern' | 'plant' | 'heather' | 'mushroom' | 'boulder' | 'pebble' | 'driftwood'

const MATERIALS: Record<MatKey, VegMaterialOpts> = {
  bark: { kind: 'bark', name: 'bark', roughness: 0.95 },
  crown: { kind: 'leaf', name: 'crown', translucency: 0.6, roughness: 0.8 },
  bush: { kind: 'leaf', name: 'bush', translucency: 0.5, fade: [125, 150], roughness: 0.82 },
  fern: { kind: 'leaf', name: 'fern', translucency: 0.5, fade: [62, 80], push: 0.25, roughness: 0.82 },
  plant: { kind: 'plant', name: 'plant', translucency: 0.45, fade: [58, 76], push: 0.3, roughness: 0.85 },
  heather: { kind: 'plant', name: 'heather', translucency: 0.35, fade: [80, 100], push: 0.15, roughness: 0.9 },
  mushroom: { kind: 'plant', name: 'mushroom', translucency: 0.15, fade: [34, 46], roughness: 0.7 },
  boulder: { kind: 'rock', name: 'boulder', moss: 1, roughness: 0.92 },
  pebble: { kind: 'rock', name: 'pebble', moss: 0.8, fade: [70, 90], roughness: 0.92 },
  driftwood: { kind: 'bark', name: 'driftwood', fade: [100, 125], roughness: 0.9 },
}

type ColliderKind = 'trunk' | 'boulder' | 'log' | null

interface SpeciesDef {
  parts: Array<{ geometry: THREE.BufferGeometry; lod?: THREE.BufferGeometry; mat: MatKey }>
  shadows: boolean
  maxDist: number
  density: 'foliage' | 'detail'
  collider: ColliderKind
  /** Trunk collider radius / height at scale 1 (trees). */
  trunk?: { r: number; h: number }
}

/** The space an instance occupies at scale 1 (local frame), for the landmark overlap test. */
interface Footprint {
  /** Solid core around the origin (trunk, rock, plant body): radius and height. */
  r: number
  h: number
  /** Elongated species (logs, driftwood): extra core discs along local ±X out to here. */
  along: number
  /** Tree canopy: centre offset, radius and height band. */
  crown: { x: number; z: number; r: number; y0: number; y1: number } | null
}

/** Core radius / half-length overrides for the elongated species. */
const ELONGATED: Partial<Record<SpeciesId, { r: number; along: number }>> = {
  log: { r: 0.36, along: 1.7 },
  driftwood: { r: 0.15, along: 1.1 },
}

function footprint(id: SpeciesId, def: SpeciesDef): Footprint {
  const box = new THREE.Box3()
  for (const p of def.parts) box.union(p.geometry.boundingBox!)
  const long = ELONGATED[id]
  if (long) return { r: long.r, h: box.max.y, along: long.along, crown: null }
  if (def.trunk) {
    const cb = def.parts[1].geometry.boundingBox!
    const crown = {
      x: (cb.min.x + cb.max.x) / 2, z: (cb.min.z + cb.max.z) / 2,
      r: ((cb.max.x - cb.min.x) + (cb.max.z - cb.min.z)) * 0.25 * 0.7, y0: cb.min.y, y1: cb.max.y,
    }
    return { r: def.trunk.r, h: box.max.y, along: 0, crown }
  }
  const half = ((box.max.x - box.min.x) + (box.max.z - box.min.z)) * 0.25
  return { r: half * (def.collider === 'boulder' ? 0.8 : 0.6), h: box.max.y, along: 0, crown: null }
}

/** Does the instance at `m[o … o + 15]` intersect any landmark solid? */
function blocked(b: Blockers, f: Footprint, m: Float32Array, o: number): boolean {
  const x = m[o + 12]
  const y = m[o + 13]
  const z = m[o + 14]
  const sx = Math.hypot(m[o], m[o + 1], m[o + 2])
  const sy = Math.hypot(m[o + 4], m[o + 5], m[o + 6])
  const c = f.crown
  const reach = Math.max(f.r + f.along, c ? Math.hypot(c.x, c.z) + c.r : 0) * sx + 0.5
  const top = y + Math.max(f.h, c ? c.y1 : 0) * sy
  if (b.gather(x, z, reach, y + 0.05, top) === 0) return false
  const r = f.r * sx
  const y0 = y + 0.05
  const y1 = y + f.h * sy
  if (b.hits(x, z, r, y0, y1)) return true
  // Local X axis in world space (column 0 carries the scale).
  for (let t = 0.5; t <= f.along + 1e-6; t += 0.5) {
    const ox = m[o] * t
    const oz = m[o + 2] * t
    if (b.hits(x + ox, z + oz, r, y0, y1) || b.hits(x - ox, z - oz, r, y0, y1)) return true
  }
  if (c) {
    const cx = x + m[o] * c.x + m[o + 8] * c.z
    const cz = z + m[o + 2] * c.x + m[o + 10] * c.z
    if (b.hits(cx, cz, c.r * sx, y + c.y0 * sy, y + c.y1 * sy)) return true
  }
  return false
}

/** Trees switch to their low-detail version beyond this camera distance (m). */
const TREE_LOD_DIST = 95

/** Chunk sphere padding: half a chunk diagonal plus the widest crown. */
const CHUNK_PAD = Math.SQRT2 * 24 + 5

export class Vegetation implements IVegetation {
  instanceCount = 0

  private root = new THREE.Group()
  private uniforms = createVegUniforms()
  private batches: SpeciesBatch[] = []
  /** Footprint of each batch's species (parallel to `batches`). */
  private footprints: Footprint[] = []
  private grass: GrassField | null = null
  private owned: Array<THREE.Material | THREE.BufferGeometry> = []
  private colliders: Collider[] = []
  private ready = false
  /** Set once instances have been checked against the zones' props (first update). */
  private settled = false
  private retired = 0

  private chunkSphere = Array.from({ length: CHUNKS_X * CHUNKS_X }, () => new THREE.Sphere())
  private chunkUsed = new Uint8Array(CHUNKS_X * CHUNKS_X)
  private vis = new Uint8Array(CHUNKS_X * CHUNKS_X)
  private frustum = new THREE.Frustum()
  private viewProj = new THREE.Matrix4()
  private lastPlayer = new THREE.Vector3(Infinity, 0, Infinity)
  private lastCam = new THREE.Vector3(Infinity, 0, Infinity)
  private foliage = -1
  private detail = -1
  private shadowDist = -1

  constructor(private ctx: Ctx) {
    this.root.name = 'vegetation'
    this.root.matrixAutoUpdate = false
  }

  async init(): Promise<void> {
    const ctx = this.ctx
    ctx.progress(0)
    const ground = new GroundCache()
    const placements = await scatter(ground, f => ctx.progress(f * 0.7))

    // Materials (shared between species).
    const mats = {} as Record<MatKey, { material: THREE.Material; depth: THREE.Material | null }>
    for (const key of Object.keys(MATERIALS) as MatKey[]) {
      const m = createVegMaterial(ctx.textures, this.uniforms, MATERIALS[key])
      mats[key] = m
      this.owned.push(m.material)
      if (m.depth) this.owned.push(m.depth)
    }

    const tree = (t: TreeGeometry, far: TreeGeometry): Pick<SpeciesDef, 'parts' | 'trunk'> => ({
      parts: [{ geometry: t.trunk, lod: far.trunk, mat: 'bark' }, { geometry: t.crown, lod: far.crown, mat: 'crown' }],
      trunk: { r: t.trunkRadius, h: t.trunkHeight },
    })
    const single = (geometry: THREE.BufferGeometry, mat: MatKey) => ({ parts: [{ geometry, mat }] })
    const defs: Record<SpeciesId, SpeciesDef> = {
      oak: { ...tree(buildBroadleaf(OAK), buildBroadleaf(OAK, 1)), shadows: true, maxDist: Infinity, density: 'foliage', collider: 'trunk' },
      linden: { ...tree(buildBroadleaf(LINDEN), buildBroadleaf(LINDEN, 1)), shadows: true, maxDist: Infinity, density: 'foliage', collider: 'trunk' },
      pine: { ...tree(buildPine(), buildPine(1)), shadows: true, maxDist: Infinity, density: 'foliage', collider: 'trunk' },
      palm: { ...tree(buildPalm(), buildPalm(1)), shadows: true, maxDist: Infinity, density: 'foliage', collider: 'trunk' },
      boulderA: { ...single(buildRock(BOULDER_A), 'boulder'), shadows: true, maxDist: Infinity, density: 'foliage', collider: 'boulder' },
      boulderB: { ...single(buildRock(BOULDER_B), 'boulder'), shadows: true, maxDist: Infinity, density: 'foliage', collider: 'boulder' },
      rock: { ...single(buildRock(PEBBLE), 'pebble'), shadows: false, maxDist: 92, density: 'detail', collider: null },
      bush: { ...single(buildBush(), 'bush'), shadows: false, maxDist: 152, density: 'foliage', collider: null },
      shrub: { ...single(buildShrub(), 'bush'), shadows: false, maxDist: 152, density: 'foliage', collider: null },
      fern: { ...single(buildFern(), 'fern'), shadows: false, maxDist: 82, density: 'detail', collider: null },
      mushroom: { ...single(buildMushrooms(), 'mushroom'), shadows: false, maxDist: 48, density: 'detail', collider: null },
      log: { ...single(buildLog(), 'bark'), shadows: false, maxDist: 170, density: 'foliage', collider: 'log' },
      driftwood: { ...single(buildDriftwood(), 'driftwood'), shadows: false, maxDist: 127, density: 'detail', collider: null },
      heather: { ...single(buildHeather(), 'heather'), shadows: false, maxDist: 102, density: 'detail', collider: null },
      reed: { ...single(buildReeds(), 'plant'), shadows: false, maxDist: 78, density: 'detail', collider: null },
      flower: { ...single(buildFlowers(), 'plant'), shadows: false, maxDist: 78, density: 'detail', collider: null },
      tallgrass: { ...single(buildTallGrass(), 'plant'), shadows: false, maxDist: 78, density: 'detail', collider: null },
    }
    ctx.progress(0.8)

    // Instances → batches (+ colliders), and per-chunk bounds for culling.
    const minY = new Float32Array(CHUNKS_X * CHUNKS_X).fill(Infinity)
    const maxY = new Float32Array(CHUNKS_X * CHUNKS_X).fill(-Infinity)
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const e = new THREE.Euler(0, 0, 0, 'YXZ')
    const pos = new THREE.Vector3()
    const scl = new THREE.Vector3()
    for (const [id, def] of Object.entries(defs) as Array<[SpeciesId, SpeciesDef]>) {
      for (const part of def.parts) this.owned.push(part.geometry, ...(part.lod ? [part.lod] : []))
      const list = placements.get(id) ?? []
      if (!list.length) continue
      const bbox = def.parts[def.parts.length - 1].geometry.boundingBox!
      const top = Math.max(...def.parts.map(p => p.geometry.boundingBox!.max.y))
      const instances: BatchInstance[] = list.map(p => {
        e.set(p.rx, p.yaw, p.rz)
        q.setFromEuler(e)
        m.compose(pos.set(p.x, p.y, p.z), q, scl.set(p.sx, p.sy, p.sz))
        const c = chunkIndex(p.x, p.z)
        minY[c] = Math.min(minY[c], p.y - 1)
        maxY[c] = Math.max(maxY[c], p.y + top * p.sy)
        return {
          matrix: m.clone(),
          tints: def.parts.length > 1 ? [p.tint2, p.tint] : [p.tint],
          rank: p.rank,
          collider: this.makeCollider(def, p, bbox),
        }
      })
      const parts: BatchPart[] = def.parts.map(p => ({ geometry: p.geometry, lod: p.lod, material: mats[p.mat].material, depth: mats[p.mat].depth }))
      const opts = { name: id, parts, shadows: def.shadows, maxDist: def.maxDist, lodDist: TREE_LOD_DIST, density: def.density }
      this.batches.push(new SpeciesBatch(opts, instances, this.root))
      this.footprints.push(footprint(id, def))
      this.instanceCount += list.length
    }
    for (let c = 0; c < CHUNKS_X * CHUNKS_X; c++) {
      if (minY[c] === Infinity) continue
      this.chunkUsed[c] = 1
      const [cx, cz] = chunkCentre(c)
      const half = (maxY[c] - minY[c]) / 2
      this.chunkSphere[c].set(new THREE.Vector3(cx, minY[c] + half, cz), Math.sqrt(CHUNK_PAD * CHUNK_PAD + half * half))
    }
    ctx.progress(0.9)

    this.grass = new GrassField(ground, ctx.textures, this.uniforms, this.root)
    // Visible (with nothing to draw yet) so Game's shader warm-up compiles every material.
    for (const b of this.batches) b.warm()

    ctx.scene.add(this.root)
    this.ready = true
    ctx.progress(1)
  }

  private makeCollider(def: SpeciesDef, p: Placement, bbox: THREE.Box3): Collider | null {
    const col = this.ctx.collision
    let c: Collider | null = null
    if (def.collider === 'trunk' && def.trunk) {
      const r = Math.min(0.5, Math.max(0.25, def.trunk.r * p.sx))
      c = col.addCylinder({ x: p.x, y: p.y - 0.3, z: p.z, r, h: def.trunk.h * p.sy + 0.3, surface: 'wood', tag: 'tree' })
    } else if (def.collider === 'boulder') {
      const top = bbox.max.y * p.sy
      if (top < 0.45) return null
      const r = Math.min(Math.abs(bbox.min.x), bbox.max.x, Math.abs(bbox.min.z), bbox.max.z) * Math.min(p.sx, p.sz) * 0.85
      c = col.addCylinder({ x: p.x, y: p.y - 0.3, z: p.z, r, h: top + 0.3, surface: 'rock', tag: 'boulder' })
    } else if (def.collider === 'log') {
      const hy = 0.34 * p.sy
      c = col.addBox({ x: p.x, y: p.y + hy * 0.85, z: p.z, hx: 2 * p.sx, hy, hz: 0.34 * p.sz, yaw: p.yaw, surface: 'wood', tag: 'log' })
    }
    if (c) this.colliders.push(c)
    return c
  }

  /**
   * Runs once, on the first update (after every zone is built): retires instances
   * planted through a landmark prop, removes their colliders, keeps grass out of the
   * props from now on, and grows the grass around the player.
   */
  private settle(): void {
    this.settled = true
    const ctx = this.ctx
    const blockers = new Blockers(ctx.collision, new Set(this.colliders))
    const dropped: Collider[] = []
    this.batches.forEach((b, i) => {
      const f = this.footprints[i]
      this.retired += b.retire((m, o) => blocked(blockers, f, m, o), dropped)
    })
    if (dropped.length) {
      const gone = new Set(dropped)
      for (const c of dropped) ctx.collision.remove(c)
      this.colliders = this.colliders.filter(c => !gone.has(c))
    }
    this.instanceCount -= this.retired
    if (this.grass) {
      this.grass.setBlockers(blockers)
      const p = ctx.player.position
      this.grass.prewarm(ctx.quality, p.x, p.z, 22)
    }
  }

  update(dt: number): void {
    if (!this.ready) return
    if (!this.settled) this.settle()
    const ctx = this.ctx
    const q = ctx.quality
    const u = this.uniforms
    u.uVegTime.value += dt
    const cam = ctx.camera
    cam.updateMatrixWorld()
    this.viewProj.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)
    this.frustum.setFromProjectionMatrix(this.viewProj)
    const cp = u.uVegCam.value.setFromMatrixPosition(cam.matrixWorld)
    const pp = u.uVegPlayer.value.copy(ctx.player.position)

    let force = false
    if (q.foliageDensity !== this.foliage || q.grassDensity !== this.detail) {
      this.foliage = q.foliageDensity
      this.detail = q.grassDensity
      // Small clutter follows the grass density (capped at the full scatter).
      for (const b of this.batches) b.setDensity(b.opts.density === 'foliage' ? q.foliageDensity : Math.min(1, q.grassDensity))
      force = true
    }
    const shadowDist = q.shadows ? q.shadowRadius + 14 : 0
    if (shadowDist !== this.shadowDist) {
      this.shadowDist = shadowDist
      force = true
    }

    // Chunk visibility: in the camera frustum, and/or inside the follow-shadow range.
    const reach = shadowDist + CHUNK_PAD
    let changed = force
    for (let c = 0; c < this.vis.length; c++) {
      let f = 0
      if (this.chunkUsed[c]) {
        const s = this.chunkSphere[c]
        if (this.frustum.intersectsSphere(s)) f |= IN_VIEW
        const dx = s.center.x - pp.x
        const dz = s.center.z - pp.z
        if (shadowDist > 0 && dx * dx + dz * dz < reach * reach) f |= IN_SHADOW
      }
      if (f !== this.vis[c]) {
        this.vis[c] = f
        changed = true
      }
    }
    const dp = (pp.x - this.lastPlayer.x) ** 2 + (pp.z - this.lastPlayer.z) ** 2
    const dc = (cp.x - this.lastCam.x) ** 2 + (cp.z - this.lastCam.z) ** 2
    if (changed || dp > 4 || dc > 16) {
      this.lastPlayer.copy(pp)
      this.lastCam.copy(cp)
      for (const b of this.batches) b.rebuild(this.vis, pp.x, pp.z, cp.x, cp.z, shadowDist)
    }
    this.grass?.update(q, pp.x, pp.z, cp, this.frustum)
  }

  /** Debug numbers (draw calls / triangles submitted this frame). */
  get stats(): { instances: number; retired: number; drawn: number; drawCalls: number; triangles: number; grassTufts: number; colliders: number } {
    let drawn = 0
    let triangles = 0
    let drawCalls = 0
    this.root.traverse(o => {
      if (o !== this.root && o.visible) drawCalls++
    })
    for (const b of this.batches) {
      drawn += b.drawn
      triangles += b.triangles
    }
    return {
      instances: this.instanceCount, retired: this.retired, drawn, drawCalls, triangles: triangles + (this.grass?.triangles ?? 0),
      grassTufts: this.grass?.tufts ?? 0, colliders: this.colliders.length,
    }
  }

  dispose(): void {
    this.ready = false
    this.settled = false
    this.retired = 0
    this.instanceCount = 0
    for (const c of this.colliders) this.ctx.collision.remove(c)
    this.colliders = []
    for (const b of this.batches) b.dispose()
    this.batches = []
    this.footprints = []
    this.grass?.dispose()
    this.grass = null
    for (const o of this.owned) o.dispose()
    this.owned = []
    this.root.removeFromParent()
  }
}
