/**
 * ZoneKit — shared helpers for building hand-made landmarks.
 *
 *  - Cached, textured materials (world-scaled UVs so textures never stretch).
 *  - Static batching: everything added with `add()` / `box()` / `cylinder()` is merged
 *    into one mesh per material at `finalize()` → very few draw calls.
 *  - Optional colliders created in the same call, so visuals and physics never drift apart.
 *
 * Coordinates: metres, +Y up. `y` passed to box() is the BOTTOM of the box (easier to stack);
 * the collider is created with the correct centre automatically.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Collider } from '../../collision'
import type { Ctx } from '../../types'
import type { TexName } from '../../textures'
import type { Surface } from '../heightfield'
import { heightAt } from '../heightfield'

export type MatName =
  | 'planks' | 'darkPlanks' | 'stone' | 'mossStone' | 'bark' | 'roof' | 'plaster' | 'cloth' | 'rock' | 'sand'
  | 'metal' | 'rope' | 'glow' | 'glass'

export interface ZonePart {
  update?(dt: number, t: number): void
  dispose?(): void
}

export interface CollideOpts {
  surface?: Surface
  bounce?: number
  tag?: string
  onLand?: (impact: number) => void
  onStand?: (dt: number) => void
}

export interface BoxOpts {
  x: number
  /** Bottom of the box. */
  y: number
  z: number
  w: number
  h: number
  d: number
  yaw?: number
  mat: MatName | THREE.Material
  /** Metres per texture repeat (default 2). */
  uvScale?: number
  /** true = solid with the material's default surface; object = custom; false/undefined = visual only. */
  collide?: boolean | CollideOpts
  castShadow?: boolean
  receiveShadow?: boolean
}

export interface CylOpts {
  x: number
  /** Bottom. */
  y: number
  z: number
  r: number
  /** Optional different top radius (cone/frustum). */
  rTop?: number
  h: number
  segments?: number
  mat: MatName | THREE.Material
  uvScale?: number
  collide?: boolean | CollideOpts
  castShadow?: boolean
}

const SURFACE_OF: Partial<Record<MatName, Surface>> = {
  planks: 'wood', darkPlanks: 'wood', bark: 'wood', stone: 'stone', mossStone: 'stone', rock: 'rock',
  roof: 'stone', plaster: 'stone', cloth: 'leaves', sand: 'sand', metal: 'metal', rope: 'wood',
}

/** Box geometry whose UVs are in world metres / uvScale (no stretching on long planks). */
export function worldBox(w: number, h: number, d: number, uvScale = 2): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d)
  const uv = g.attributes.uv as THREE.BufferAttribute
  const n = g.attributes.normal as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) {
    const ax = Math.abs(n.getX(i))
    const ay = Math.abs(n.getY(i))
    let su: number, sv: number
    if (ax > 0.5) { su = d; sv = h } else if (ay > 0.5) { su = w; sv = d } else { su = w; sv = h }
    uv.setXY(i, (uv.getX(i) * su) / uvScale, (uv.getY(i) * sv) / uvScale)
  }
  return g
}

export function worldCylinder(rTop: number, rBot: number, h: number, seg = 12, uvScale = 2): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1)
  const uv = g.attributes.uv as THREE.BufferAttribute
  const circ = Math.PI * 2 * Math.max(rTop, rBot)
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * circ) / uvScale, (uv.getY(i) * h) / uvScale)
  return g
}

export class ZoneKit {
  readonly root = new THREE.Group()
  private mats = new Map<string, THREE.MeshStandardMaterial>()
  private batches = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; cast: boolean; receive: boolean }>()
  private colliders: Collider[] = []
  private owned: Array<THREE.Material | THREE.BufferGeometry> = []
  private finalized = false

  constructor(readonly ctx: Ctx, readonly name: string) {
    this.root.name = `zone:${name}`
    ctx.scene.add(this.root)
  }

  ground(x: number, z: number): number {
    return heightAt(x, z)
  }

  /** Shared textured material. Tweak the returned material only via `variant` to keep caching sane. */
  mat(name: MatName, variant?: { color?: THREE.ColorRepresentation; emissive?: THREE.ColorRepresentation; emissiveIntensity?: number; roughness?: number; key?: string }): THREE.MeshStandardMaterial {
    const key = `${name}:${variant?.key ?? ''}:${variant?.color ?? ''}:${variant?.emissive ?? ''}`
    let m = this.mats.get(key)
    if (m) return m
    const T = (t: TexName) => this.ctx.textures.get(t)
    const base: Record<MatName, () => THREE.MeshStandardMaterial> = {
      planks: () => new THREE.MeshStandardMaterial({ map: T('planks_albedo'), normalMap: T('planks_normal'), roughness: 0.85 }),
      darkPlanks: () => new THREE.MeshStandardMaterial({ map: T('planks_albedo'), normalMap: T('planks_normal'), color: 0x6b5442, roughness: 0.9 }),
      stone: () => new THREE.MeshStandardMaterial({ map: T('stone_albedo'), normalMap: T('stone_normal'), roughness: 0.92 }),
      mossStone: () => new THREE.MeshStandardMaterial({ map: T('stone_albedo'), normalMap: T('stone_normal'), color: 0xa9c08a, roughness: 0.95 }),
      bark: () => new THREE.MeshStandardMaterial({ map: T('bark_albedo'), normalMap: T('bark_normal'), roughness: 0.95 }),
      roof: () => new THREE.MeshStandardMaterial({ map: T('roof_albedo'), normalMap: T('roof_normal'), roughness: 0.8 }),
      plaster: () => new THREE.MeshStandardMaterial({ map: T('plaster_albedo'), roughness: 0.95 }),
      cloth: () => new THREE.MeshStandardMaterial({ map: T('cloth_albedo'), roughness: 1, side: THREE.DoubleSide }),
      rock: () => new THREE.MeshStandardMaterial({ map: T('rock_albedo'), normalMap: T('rock_normal'), roughness: 0.95 }),
      sand: () => new THREE.MeshStandardMaterial({ map: T('sand_albedo'), normalMap: T('sand_normal'), roughness: 1 }),
      metal: () => new THREE.MeshStandardMaterial({ color: 0x4a4e55, metalness: 0.7, roughness: 0.45 }),
      rope: () => new THREE.MeshStandardMaterial({ color: 0xb59a6a, roughness: 1 }),
      glow: () => new THREE.MeshStandardMaterial({ color: 0xffd28a, emissive: 0xffb347, emissiveIntensity: 2.2, roughness: 0.6 }),
      glass: () => new THREE.MeshStandardMaterial({ color: 0xbfe6ff, roughness: 0.1, metalness: 0, transparent: true, opacity: 0.35 }),
    }
    m = base[name]()
    if (variant?.color !== undefined) m.color.set(variant.color)
    if (variant?.emissive !== undefined) m.emissive.set(variant.emissive)
    if (variant?.emissiveIntensity !== undefined) m.emissiveIntensity = variant.emissiveIntensity
    if (variant?.roughness !== undefined) m.roughness = variant.roughness
    m.name = `${this.name}:${key}`
    this.mats.set(key, m)
    this.owned.push(m)
    return m
  }

  private resolve(m: MatName | THREE.Material): THREE.Material {
    return typeof m === 'string' ? this.mat(m) : m
  }

  /** Queue a static geometry (already positioned via `matrix`) for batching. Takes ownership. */
  add(geo: THREE.BufferGeometry, mat: MatName | THREE.Material, matrix?: THREE.Matrix4, opts: { castShadow?: boolean; receiveShadow?: boolean } = {}): void {
    if (this.finalized) throw new Error(`ZoneKit(${this.name}): add() after finalize()`)
    const g = geo.index ? geo.toNonIndexed() : geo
    if (g !== geo) geo.dispose()
    if (matrix) g.applyMatrix4(matrix)
    // Keep attribute sets uniform so batches can merge.
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k)
    // One geometry without normals would make the whole material batch fail to merge (and vanish).
    if (!g.attributes.normal) g.computeVertexNormals()
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((g.attributes.position.count) * 2), 2))
    const m = this.resolve(mat)
    let b = this.batches.get(m)
    if (!b) this.batches.set(m, (b = { geos: [], cast: false, receive: true }))
    b.geos.push(g)
    b.cast ||= opts.castShadow ?? true
    b.receive &&= opts.receiveShadow ?? true
  }

  /** Static box (bottom at y), optionally solid. Returns the collider if any. */
  box(o: BoxOpts): Collider | null {
    const geo = worldBox(o.w, o.h, o.d, o.uvScale ?? 2)
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(o.x, o.y + o.h / 2, o.z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), o.yaw ?? 0),
      new THREE.Vector3(1, 1, 1),
    )
    this.add(geo, o.mat, m, { castShadow: o.castShadow ?? true, receiveShadow: o.receiveShadow ?? true })
    if (!o.collide) return null
    const c = typeof o.collide === 'object' ? o.collide : {}
    const col = this.ctx.collision.addBox({
      x: o.x, y: o.y + o.h / 2, z: o.z, hx: o.w / 2, hy: o.h / 2, hz: o.d / 2, yaw: o.yaw ?? 0,
      surface: c.surface ?? (typeof o.mat === 'string' ? SURFACE_OF[o.mat] : undefined) ?? 'stone',
      bounce: c.bounce, tag: c.tag, onLand: c.onLand, onStand: c.onStand,
    })
    this.colliders.push(col)
    return col
  }

  /** Static vertical cylinder / frustum (bottom at y), optionally solid. */
  cylinder(o: CylOpts): Collider | null {
    const geo = worldCylinder(o.rTop ?? o.r, o.r, o.h, o.segments ?? 12, o.uvScale ?? 2)
    const m = new THREE.Matrix4().makeTranslation(o.x, o.y + o.h / 2, o.z)
    this.add(geo, o.mat, m, { castShadow: o.castShadow ?? true })
    if (!o.collide) return null
    const c = typeof o.collide === 'object' ? o.collide : {}
    const col = this.ctx.collision.addCylinder({
      x: o.x, y: o.y, z: o.z, r: Math.max(o.r, o.rTop ?? o.r), h: o.h,
      surface: c.surface ?? (typeof o.mat === 'string' ? SURFACE_OF[o.mat] : undefined) ?? 'stone',
      bounce: c.bounce, tag: c.tag, onLand: c.onLand, onStand: c.onStand,
    })
    this.colliders.push(col)
    return col
  }

  /** Collider only (invisible), e.g. to approximate an irregular mesh. y = bottom. */
  solidBox(x: number, y: number, z: number, w: number, h: number, d: number, yaw = 0, opts: CollideOpts = {}): Collider {
    const col = this.ctx.collision.addBox({ x, y: y + h / 2, z, hx: w / 2, hy: h / 2, hz: d / 2, yaw, surface: opts.surface ?? 'stone', bounce: opts.bounce, tag: opts.tag, onLand: opts.onLand, onStand: opts.onStand })
    this.colliders.push(col)
    return col
  }

  /** Track a collider created elsewhere (e.g. dynamic platforms) so dispose() removes it. */
  own(c: Collider): Collider {
    this.colliders.push(c)
    return c
  }

  /** Dynamic object owned by this zone (not batched). Adds to the zone root. */
  addObject<T extends THREE.Object3D>(o: T): T {
    this.root.add(o)
    return o
  }

  /** Merge all queued geometry into one mesh per material and add them to the scene. */
  finalize(): void {
    if (this.finalized) return
    this.finalized = true
    for (const [mat, b] of this.batches) {
      if (!b.geos.length) continue
      const merged = b.geos.length === 1 ? b.geos[0] : mergeGeometries(b.geos, false)
      if (!merged) {
        console.warn(`[starfall] ${this.name}: merge failed for ${mat.name}`)
        continue
      }
      if (merged !== b.geos[0]) for (const g of b.geos) g.dispose()
      merged.computeBoundingSphere()
      const mesh = new THREE.Mesh(merged, mat)
      mesh.castShadow = b.cast
      mesh.receiveShadow = b.receive
      mesh.matrixAutoUpdate = false
      mesh.updateMatrix()
      mesh.name = `${this.name}:static`
      this.root.add(mesh)
      this.owned.push(merged)
    }
    this.batches.clear()
  }

  dispose(): void {
    for (const c of this.colliders) this.ctx.collision.remove(c)
    this.colliders = []
    const done = new Set<THREE.Material | THREE.BufferGeometry>(this.owned)
    for (const o of this.owned) o.dispose()
    this.root.traverse(o => {
      const mesh = o as THREE.Mesh
      if (mesh.geometry && !done.has(mesh.geometry)) {
        done.add(mesh.geometry)
        mesh.geometry.dispose()
      }
    })
    this.owned = []
    this.root.removeFromParent()
  }
}
