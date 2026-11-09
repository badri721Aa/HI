/**
 * Block rendering: one InstancedMesh per block type and 32 m chunk (so far-away chunks are
 * frustum-culled), grown by doubling. Materials use the shared scanned textures; the grass
 * lip, glass pane, lamp lantern and bounce-pad target are composited from them once on a canvas.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { TEXTURES, type TexName, type TextureLib } from '../textures'
import { BLOCKS, type BlockDef } from './blocks'

/** What the renderer tracks for each block (a slot in one batch). */
export interface Placed {
  x: number
  y: number
  z: number
  type: number
  rot: number
  batch: Batch | null
  slot: number
}

interface Batch {
  type: number
  mesh: THREE.InstancedMesh
  blocks: Placed[]
  dirty: boolean
}

const CHUNK = 32
const HALF_PI = Math.PI / 2
/** Stairs: quarter-height steps rising toward local -Z. */
export const STAIR_STEPS = 4
const CANVAS = 256

export class BlockMeshes {
  private batches = new Map<number, Batch>()
  private warm: THREE.InstancedMesh[] = []
  private geos: THREE.BufferGeometry[] = []
  private mats: Array<THREE.Material | THREE.Material[]> = []
  private owned: Array<THREE.Texture | THREE.Material | THREE.BufferGeometry> = []
  private readonly m = new THREE.Matrix4()
  private readonly root = new THREE.Group()

  constructor(scene: THREE.Scene, textures: TextureLib) {
    this.root.name = 'blocks'
    scene.add(this.root)
    const cube = this.keep(cubeGeometry(false))
    const split = this.keep(cubeGeometry(true))
    const stairs = this.keep(stairGeometry())
    for (const def of BLOCKS) {
      this.geos.push(def.shape === 'stairs' ? stairs : def.look === 'grass' || def.look === 'bouncy' ? split : cube)
      this.mats.push(this.material(def, textures))
    }
    // One empty mesh per type for the loading screen's shader warm-up (dropped on the first frame),
    // so the first block of each type placed later doesn't hitch.
    for (let t = 0; t < BLOCKS.length; t++) this.warm.push(this.mesh(t, 1, true))
  }

  /** Geometry of a block type (for the build ghost). */
  geometry(type: number): THREE.BufferGeometry {
    return this.geos[type]
  }

  add(b: Placed): void {
    const key = b.type * 65536 + ((Math.floor(b.x / CHUNK) + 128) & 255) * 256 + ((Math.floor(b.z / CHUNK) + 128) & 255)
    let batch = this.batches.get(key)
    if (!batch) {
      batch = { type: b.type, mesh: this.mesh(b.type, 16), blocks: [], dirty: true }
      this.batches.set(key, batch)
    }
    if (batch.blocks.length >= batch.mesh.instanceMatrix.count) this.grow(batch)
    b.batch = batch
    b.slot = batch.blocks.length
    batch.blocks.push(b)
    this.write(batch, b)
  }

  remove(b: Placed): void {
    const batch = b.batch
    if (!batch) return
    const last = batch.blocks.pop()!
    if (last !== b) {
      last.slot = b.slot
      batch.blocks[b.slot] = last
      this.write(batch, last)
    }
    batch.dirty = true
    b.batch = null
  }

  /** Upload the frame's changes (once per frame, however many blocks changed). */
  update(): void {
    if (this.warm.length) this.dropWarm()
    for (const batch of this.batches.values()) {
      if (!batch.dirty) continue
      batch.dirty = false
      const mesh = batch.mesh
      mesh.count = batch.blocks.length
      mesh.visible = mesh.count > 0
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.count) mesh.computeBoundingSphere()
    }
  }

  dispose(): void {
    for (const b of this.batches.values()) b.mesh.dispose()
    this.batches.clear()
    this.dropWarm()
    this.root.removeFromParent()
    for (const o of this.owned) o.dispose()
    this.owned = []
  }

  private dropWarm(): void {
    for (const m of this.warm) {
      m.removeFromParent()
      m.dispose()
    }
    this.warm = []
  }

  private write(batch: Batch, b: Placed): void {
    this.m.makeRotationY(b.rot * HALF_PI).setPosition(b.x + 0.5, b.y + 0.5, b.z + 0.5)
    batch.mesh.setMatrixAt(b.slot, this.m)
    batch.dirty = true
  }

  private mesh(type: number, capacity: number, visible = false): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(this.geos[type], this.mats[type], capacity)
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    mesh.count = 0
    mesh.visible = visible
    const glass = BLOCKS[type].look === 'glass'
    mesh.castShadow = !glass
    mesh.receiveShadow = true
    if (glass) mesh.renderOrder = 2
    this.root.add(mesh)
    return mesh
  }

  private grow(batch: Batch): void {
    const old = batch.mesh
    const next = this.mesh(batch.type, old.instanceMatrix.count * 2)
    ;(next.instanceMatrix.array as Float32Array).set(old.instanceMatrix.array as Float32Array)
    old.removeFromParent()
    old.dispose()
    batch.mesh = next
  }

  private keep<T extends THREE.Texture | THREE.Material | THREE.BufferGeometry>(o: T): T {
    this.owned.push(o)
    return o
  }

  /* ── materials ─────────────────────────────────────────── */

  private material(def: BlockDef, tex: TextureLib): THREE.Material | THREE.Material[] {
    const std = (map: THREE.Texture, normal: TexName | null, opts: THREE.MeshStandardMaterialParameters = {}) =>
      this.keep(new THREE.MeshStandardMaterial({
        map, normalMap: normal ? tex.get(normal) : null, color: def.tint, roughness: 0.9, metalness: 0, ...opts,
      }))
    const normalOf = (name: TexName): TexName | null => {
      const n = name.replace('_albedo', '_normal') as TexName
      return TEXTURES.includes(n) ? n : null
    }
    switch (def.look) {
      case 'grass':
        return [
          std(this.canvas(tex, grassSide), 'dirt_normal'),
          std(tex.get('grass_albedo'), 'grass_normal'),
        ]
      case 'bouncy':
        return [
          std(tex.get('cloth_albedo'), null, { roughness: 0.75, emissive: '#3a0f08', emissiveIntensity: 0.4 }),
          std(this.canvas(tex, bounceTop), null, { color: '#ffffff', roughness: 0.7, emissive: '#3a0f08', emissiveIntensity: 0.4 }),
        ]
      case 'glass':
        return std(this.canvas(tex, glassPane), null, {
          color: '#ffffff', transparent: true, depthWrite: false, roughness: 0.08, metalness: 0.1, envMapIntensity: 1.5,
        })
      case 'lamp':
        return std(this.canvas(tex, lanternFace), 'stone_normal', {
          color: '#ffffff', emissiveMap: this.canvas(tex, lanternGlow), emissive: '#ffb050', emissiveIntensity: 2.4,
        })
      default:
        return std(tex.get(def.side), normalOf(def.side))
    }
  }

  /** A canvas texture painted by `draw` (which may sample the loaded textures). */
  private canvas(tex: TextureLib, draw: (g: CanvasRenderingContext2D, img: (name: TexName) => CanvasImageSource | null) => void): THREE.CanvasTexture {
    const c = document.createElement('canvas')
    c.width = c.height = CANVAS
    const g = c.getContext('2d')!
    draw(g, name => {
      const image = tex.get(name).image as { width?: number; data?: unknown } | undefined
      // Placeholders (missing files) are 1×1 data textures: nothing to draw.
      return image && !image.data && (image.width ?? 0) > 1 ? (image as CanvasImageSource) : null
    })
    const t = this.keep(new THREE.CanvasTexture(c))
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 4
    return t
  }
}

/* ── canvas painters ───────────────────────────────────────── */

type Img = (name: TexName) => CanvasImageSource | null

function paint(g: CanvasRenderingContext2D, img: Img, name: TexName, fallback: string): void {
  const src = img(name)
  if (src) g.drawImage(src, 0, 0, CANVAS, CANVAS)
  else {
    g.fillStyle = fallback
    g.fillRect(0, 0, CANVAS, CANVAS)
  }
}

/** Dirt with a ragged band of turf along the top edge. */
function grassSide(g: CanvasRenderingContext2D, img: Img): void {
  paint(g, img, 'dirt_albedo', '#6b4e33')
  g.save()
  g.beginPath()
  g.moveTo(0, 0)
  g.lineTo(CANVAS, 0)
  for (let x = CANVAS; x >= 0; x -= 8) {
    const y = 46 + Math.sin(x * 0.21) * 7 + Math.sin(x * 0.07 + 1.3) * 9
    g.lineTo(x, y)
  }
  g.closePath()
  g.clip()
  paint(g, img, 'grass_albedo', '#5f7a3a')
  g.restore()
  // A soft shadow under the turf.
  const grad = g.createLinearGradient(0, 40, 0, 76)
  grad.addColorStop(0, 'rgba(20,14,8,0)')
  grad.addColorStop(0.5, 'rgba(20,14,8,0.22)')
  grad.addColorStop(1, 'rgba(20,14,8,0)')
  g.fillStyle = grad
  g.fillRect(0, 40, CANVAS, 36)
}

/** Clear pane with a pale plaster frame and two glints (alpha carries the transparency). */
function glassPane(g: CanvasRenderingContext2D, img: Img): void {
  g.fillStyle = 'rgba(190,225,236,0.16)'
  g.fillRect(0, 0, CANVAS, CANVAS)
  const f = 14
  g.save()
  g.beginPath()
  g.rect(0, 0, CANVAS, CANVAS)
  g.rect(f, f, CANVAS - f * 2, CANVAS - f * 2)
  g.clip('evenodd')
  paint(g, img, 'plaster_albedo', '#e8e2d6')
  g.fillStyle = 'rgba(255,255,255,0.25)'
  g.fillRect(0, 0, CANVAS, CANVAS)
  g.restore()
  g.strokeStyle = 'rgba(255,255,255,0.32)'
  g.lineCap = 'round'
  g.lineWidth = 10
  g.beginPath()
  g.moveTo(52, 150)
  g.lineTo(150, 52)
  g.stroke()
  g.lineWidth = 5
  g.beginPath()
  g.moveTo(84, 176)
  g.lineTo(176, 84)
  g.stroke()
}

const LANTERN_INSET = 44

/** Stone frame around a cream paper panel crossed by dark bars. */
function lanternFace(g: CanvasRenderingContext2D, img: Img): void {
  paint(g, img, 'stone_albedo', '#8d8678')
  const i = LANTERN_INSET
  g.fillStyle = '#f7dfae'
  g.fillRect(i, i, CANVAS - i * 2, CANVAS - i * 2)
  lanternBars(g, '#4a3424')
}

/** Emissive mask: the panel glows (brightest in the middle); the frame and bars catch a faint warm spill. */
function lanternGlow(g: CanvasRenderingContext2D): void {
  g.fillStyle = '#1a1a1a'
  g.fillRect(0, 0, CANVAS, CANVAS)
  const i = LANTERN_INSET
  const r = g.createRadialGradient(CANVAS / 2, CANVAS / 2, 8, CANVAS / 2, CANVAS / 2, CANVAS / 2 - i)
  r.addColorStop(0, '#ffffff')
  r.addColorStop(1, '#8a8a8a')
  g.fillStyle = r
  g.fillRect(i, i, CANVAS - i * 2, CANVAS - i * 2)
  lanternBars(g, '#101010')
}

function lanternBars(g: CanvasRenderingContext2D, color: string): void {
  const i = LANTERN_INSET
  g.fillStyle = color
  g.fillRect(CANVAS / 2 - 5, i, 10, CANVAS - i * 2)
  g.fillRect(i, CANVAS / 2 - 5, CANVAS - i * 2, 10)
  g.strokeStyle = color
  g.lineWidth = 8
  g.strokeRect(i, i, CANVAS - i * 2, CANVAS - i * 2)
}

/** Coral cloth with a cream target ring. */
function bounceTop(g: CanvasRenderingContext2D, img: Img): void {
  paint(g, img, 'cloth_albedo', '#b9b2a6')
  g.globalCompositeOperation = 'multiply'
  g.fillStyle = '#e0705a'
  g.fillRect(0, 0, CANVAS, CANVAS)
  g.globalCompositeOperation = 'source-over'
  g.strokeStyle = 'rgba(255,240,214,0.85)'
  g.lineWidth = 16
  g.beginPath()
  g.arc(CANVAS / 2, CANVAS / 2, 78, 0, Math.PI * 2)
  g.stroke()
  g.fillStyle = 'rgba(255,240,214,0.85)'
  g.beginPath()
  g.arc(CANVAS / 2, CANVAS / 2, 26, 0, Math.PI * 2)
  g.fill()
}

/* ── geometry ──────────────────────────────────────────────── */

/** Unit cube centred on the origin; `splitTop` puts the top face in its own group (material 1). */
function cubeGeometry(splitTop: boolean): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(1, 1, 1)
  g.clearGroups()
  if (!splitTop) return g
  // Box faces come in the order +x, -x, +y, -y, +z, -z (6 indices each): move +y to the end.
  const idx = g.index!.array as ArrayLike<number>
  const order = [0, 1, 3, 4, 5, 2]
  const next: number[] = []
  for (const f of order) for (let k = 0; k < 6; k++) next.push(idx[f * 6 + k])
  g.setIndex(next)
  g.addGroup(0, 30, 0)
  g.addGroup(30, 6, 1)
  return g
}

/** Four quarter-height columns rising toward -Z, with planar UVs so the texture keeps its scale. */
function stairGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  for (let j = 0; j < STAIR_STEPS; j++) {
    const h = (j + 1) / STAIR_STEPS
    const d = 1 / STAIR_STEPS
    const box = new THREE.BoxGeometry(1, h, d)
    box.translate(0, -0.5 + h / 2, 0.5 - d * (j + 0.5))
    parts.push(box)
  }
  const g = mergeGeometries(parts)!
  for (const p of parts) p.dispose()
  const pos = g.attributes.position
  const nrm = g.attributes.normal
  const uv = g.attributes.uv
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + 0.5
    const y = pos.getY(i) + 0.5
    const z = pos.getZ(i) + 0.5
    const ax = Math.abs(nrm.getX(i))
    const ay = Math.abs(nrm.getY(i))
    if (ay > 0.5) uv.setXY(i, x, z)
    else if (ax > 0.5) uv.setXY(i, z, y)
    else uv.setXY(i, x, y)
  }
  g.clearGroups()
  return g
}
