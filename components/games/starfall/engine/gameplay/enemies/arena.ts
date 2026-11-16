/**
 * The summoning circle: when a boss is called up somewhere that isn't an arena (the Creative
 * spawner), a round stone platform rises out of the ground first and the fight happens on it —
 * level footing for the telegraphs and shockwaves on any terrain, and a clear edge to the fight.
 * It carries the player up if he stands on it, and sinks away again when the fight is over.
 */
import * as THREE from 'three'
import type { Collider } from '../../collision'
import type { Ctx } from '../../types'
import { heightAt } from '../../world/heightfield'
import { sigilMaterial } from './materials'
import { supportHeight } from '../parts/util'

const RISE = 1.6
const SINK = 1.8
const THICK = 0.6
/**
 * Peak rise speed (m/s). The player is carried up when the top passes his feet by less than a
 * step per frame (0.45 m at the 20 fps floor), otherwise he'd be shoved off the edge like a wall.
 */
const MAX_RISE_SPEED = 5

export class SummonCircle {
  /** The fight floor (top of the platform). */
  readonly top: number
  private readonly group = new THREE.Group()
  private readonly collider: Collider
  private readonly rune: THREE.ShaderMaterial
  private readonly depth: number
  private readonly owned: Array<{ dispose(): void }> = []
  private t = 0
  private sinking = -1
  private done = false
  /** Rise time: smoothstep peaks at 1.5× the mean speed. */
  private readonly rise: number

  constructor(private ctx: Ctx, readonly x: number, y: number, readonly z: number, readonly r: number, color: string) {
    // Level with the highest ground under it; the skirt reaches down to the lowest.
    let hi = -Infinity
    let lo = Infinity
    for (let i = 0; i < 24; i++) {
      for (const k of [0.35, 0.7, 1]) {
        const a = (i / 24) * Math.PI * 2
        const sx = x + Math.cos(a) * r * k
        const sz = z + Math.sin(a) * r * k
        const g = supportHeight(ctx, sx, sz, y + 4, 0.3)
        hi = Math.max(hi, g)
        lo = Math.min(lo, g)
      }
    }
    const centre = supportHeight(ctx, x, z, y + 4, 0.3)
    hi = Math.max(hi, centre)
    lo = Math.min(lo, centre, heightAt(x, z))
    if (!Number.isFinite(hi)) hi = lo = y
    this.top = hi + 0.12
    this.depth = Math.max(THICK + 0.4, this.top - lo + 1.2)
    this.rise = Math.max(RISE, (this.depth * 1.5) / MAX_RISE_SPEED)

    const own = <T extends { dispose(): void }>(o: T): T => {
      this.owned.push(o)
      return o
    }
    const tex = ctx.textures
    const stone = own(new THREE.MeshStandardMaterial({ map: tex.get('stone_albedo'), normalMap: tex.get('stone_normal'), roughness: 0.9, color: 0x9a96a6 }))
    const rock = own(new THREE.MeshStandardMaterial({ map: tex.get('rock_albedo'), normalMap: tex.get('rock_normal'), roughness: 0.95, color: 0x6f6a78 }))
    // Slab: world-scaled UVs on the top so the paving texture doesn't stretch.
    const slab = own(new THREE.CylinderGeometry(r, r * 0.985, THICK, 72, 1))
    const uv = slab.attributes.uv as THREE.BufferAttribute
    const pos = slab.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < uv.count; i++) {
      if (Math.abs(pos.getY(i) - THICK / 2) < 1e-3) uv.setXY(i, pos.getX(i) / 3, pos.getZ(i) / 3)
    }
    const slabMesh = new THREE.Mesh(slab, stone)
    slabMesh.position.y = -THICK / 2
    slabMesh.receiveShadow = true
    slabMesh.castShadow = true
    const skirt = new THREE.Mesh(own(new THREE.CylinderGeometry(r * 0.985, r * 0.78, this.depth - THICK, 48, 3, true)), rock)
    skirt.position.y = -THICK - (this.depth - THICK) / 2
    skirt.receiveShadow = true
    // Rough the skirt up a little so it reads as rock torn out of the ground.
    const sp = skirt.geometry.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < sp.count; i++) {
      const a = Math.atan2(sp.getZ(i), sp.getX(i))
      const k = 1 + Math.sin(a * 7 + sp.getY(i) * 0.9) * 0.035 + Math.sin(a * 17) * 0.02
      sp.setXYZ(i, sp.getX(i) * k, sp.getY(i), sp.getZ(i) * k)
    }
    skirt.geometry.computeVertexNormals()
    // The rune ring inlaid on top, glowing in the boss's colour.
    this.rune = own(sigilMaterial(color, 0.25))
    const runeMesh = new THREE.Mesh(own(new THREE.PlaneGeometry(r * 2, r * 2).rotateX(-Math.PI / 2)), this.rune)
    runeMesh.position.y = 0.03
    runeMesh.renderOrder = 2
    this.group.add(slabMesh, skirt, runeMesh)
    this.group.name = 'summon-circle'
    this.group.position.set(x, this.top - this.depth, z)
    ctx.scene.add(this.group)
    // Starts sunk: its top level with the bottom of the skirt's reach, below every bit of ground.
    this.collider = ctx.collision.addCylinder({ x, y: this.top - this.depth * 2, z, r, h: this.depth, dynamic: true, surface: 'stone', tag: 'arena' })
    ctx.game.shake(0.3, this.rise)
  }

  /** Fully risen. */
  get ready(): boolean {
    return this.t >= this.rise
  }

  /** Sunk away and disposed. */
  get gone(): boolean {
    return this.done
  }

  sink(): void {
    if (this.sinking < 0) this.sinking = 0
  }

  update(dt: number): void {
    if (this.done) return
    this.t += dt
    const u = this.rune.uniforms
    u.uTime.value += dt
    let h: number
    if (this.sinking >= 0) {
      this.sinking += dt
      const k = Math.min(1, this.sinking / SINK)
      h = 1 - k * k
      u.uAlpha.value = 1 - k
      if (k >= 1) {
        this.dispose()
        return
      }
    } else {
      const k = Math.min(1, this.t / this.rise)
      h = k * k * (3 - 2 * k)
      u.uAlpha.value = k
      // Dust spills from the rim while it rises.
      if (k < 1 && Math.random() < dt * 14) {
        const a = Math.random() * Math.PI * 2
        this.ctx.fx.burst('dust', { x: this.x + Math.cos(a) * this.r, y: this.top - this.depth * (1 - h) - 0.3, z: this.z + Math.sin(a) * this.r }, { scale: 1.6, count: 3 })
      }
    }
    const y = this.top - this.depth * (1 - h) - this.depth
    this.group.position.y = y + this.depth
    this.ctx.collision.move(this.collider, this.x, y, this.z, 0, Math.max(dt, 1e-3))
  }

  dispose(): void {
    if (this.done) return
    this.done = true
    this.group.removeFromParent()
    this.ctx.collision.remove(this.collider)
    for (const o of this.owned) o.dispose()
    this.owned.length = 0
  }
}
