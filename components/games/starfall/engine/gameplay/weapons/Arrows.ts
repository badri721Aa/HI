/**
 * Arrows in flight and stuck in the world: one InstancedMesh, a fixed pool, ballistic flight in
 * short sub-steps (raycast against terrain and props, sphere test against the gloomlings and,
 * with pvp on, other players). A stuck arrow stays a while, then shrinks away. Cosmetic arrows
 * (other players' shots) fly and stick but hit no one. Allocation-free per frame.
 */
import * as THREE from 'three'
import type { V3 } from '../../events'
import type { Ctx, WeaponHit } from '../../types'
import { waterLevelAt } from '../../world/heightfield'
import { ARROW } from './defs'
import { ARROW_LEN } from './models'

interface Arrow {
  live: boolean
  flying: boolean
  /** Tip position and velocity. */
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  /** Unit direction it points. */
  dir: THREE.Vector3
  age: number
  damage: number
  /** The draw it was shot with, 0..1. */
  power: number
}

const STEP = 0.4
const SHRINK = 0.4
const FWD = new THREE.Vector3(0, 0, 1)

export class Arrows {
  readonly mesh: THREE.InstancedMesh
  private pool: Arrow[] = []
  private dirty = true
  private readonly hit: WeaponHit = {
    weapon: 'bow', center: { x: 0, y: 0, z: 0 }, radius: 0.3, damage: 0, knock: 0, lift: 3, from: { x: 0, y: 0, z: 0 }, max: 1,
  }
  private readonly m = new THREE.Matrix4()
  private readonly q = new THREE.Quaternion()
  private readonly p = new THREE.Vector3()
  private readonly s = new THREE.Vector3()
  /** Where a flying arrow was and is this frame (its trail). */
  private readonly from = new THREE.Vector3()
  private readonly to = new THREE.Vector3()

  constructor(
    private ctx: Ctx,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    private cosmetic = false,
  ) {
    this.mesh = new THREE.InstancedMesh(geometry, material, ARROW.max)
    this.mesh.name = 'arrows'
    this.mesh.frustumCulled = false
    this.mesh.castShadow = true
    for (let i = 0; i < ARROW.max; i++) {
      this.pool.push({ live: false, flying: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, dir: new THREE.Vector3(0, 0, 1), age: 0, damage: 0, power: 0 })
    }
    this.render()
  }

  fire(from: V3, vel: V3, damage: number, power = 0): void {
    // A free slot, else the stuck arrow that has been there longest.
    let a = this.pool.find(x => !x.live)
    if (!a) {
      for (const x of this.pool) if (!x.flying && (!a || x.age > a.age)) a = x
      a ??= this.pool[0]
    }
    a.live = a.flying = true
    a.x = from.x
    a.y = from.y
    a.z = from.z
    a.vx = vel.x
    a.vy = vel.y
    a.vz = vel.z
    a.dir.set(vel.x, vel.y, vel.z).normalize()
    a.age = 0
    a.damage = damage
    a.power = power
    this.dirty = true
  }

  clear(): void {
    for (const a of this.pool) a.live = false
    this.dirty = true
  }

  update(dt: number): void {
    for (const a of this.pool) {
      if (!a.live) continue
      a.age += dt
      this.dirty = true
      if (a.flying) {
        this.from.set(a.x, a.y, a.z)
        this.fly(a, dt)
        if (a.live) this.ctx.fx.trail('arrow', this.from, this.to.set(a.x, a.y, a.z))
      } else if (a.age > ARROW.stuckLife + SHRINK) a.live = false
    }
    if (this.dirty) this.render()
  }

  private fly(a: Arrow, dt: number): void {
    if (a.age > ARROW.flightLife) {
      a.live = false
      return
    }
    const ctx = this.ctx
    const speed = Math.hypot(a.vx, a.vy, a.vz)
    const n = Math.min(10, Math.max(1, Math.ceil((speed * dt) / STEP)))
    const h = dt / n
    for (let i = 0; i < n; i++) {
      a.vy -= ARROW.gravity * h
      const sx = a.vx * h
      const sy = a.vy * h
      const sz = a.vz * h
      const hit = ctx.collision.raycast(a.x, a.y, a.z, sx, sy, sz, 1)
      const t = hit ? hit.t : 1
      // Gloomlings along the way take the arrow (and fly off with it).
      const b = this.hit
      b.center.x = a.x + sx * t
      b.center.y = a.y + sy * t
      b.center.z = a.z + sz * t
      b.from.x = a.x - a.vx * 0.1
      b.from.y = a.y
      b.from.z = a.z - a.vz * 0.1
      b.damage = a.damage
      b.knock = 3 + speed * 0.18
      if (!this.cosmetic && (ctx.enemies.hit(b) > 0 || ctx.net.strike(b, a.power) > 0)) {
        a.live = false
        return
      }
      a.dir.set(a.vx, a.vy, a.vz).normalize()
      if (hit) {
        // Bury the tip a little; arrows on moving props just drop away.
        a.x = hit.x + a.dir.x * 0.08
        a.y = hit.y + a.dir.y * 0.08
        a.z = hit.z + a.dir.z * 0.08
        a.flying = false
        a.age = hit.collider?.dynamic ? ARROW.stuckLife : 0
        ctx.bus.emit('arrow:stick', { pos: { x: hit.x, y: hit.y, z: hit.z } })
        return
      }
      a.x += sx
      a.y += sy
      a.z += sz
      if (a.y < waterLevelAt(a.x, a.z)) {
        ctx.fx.burst('ripple', { x: a.x, y: a.y, z: a.z }, { scale: 0.5 })
        a.live = false
        return
      }
    }
  }

  private render(): void {
    const mesh = this.mesh
    for (let i = 0; i < this.pool.length; i++) {
      const a = this.pool[i]
      if (!a.live) {
        mesh.setMatrixAt(i, this.m.makeScale(0, 0, 0))
        continue
      }
      const k = a.flying ? 1 : 1 - Math.max(0, Math.min(1, (a.age - ARROW.stuckLife) / SHRINK))
      this.q.setFromUnitVectors(FWD, a.dir)
      this.p.set(a.x, a.y, a.z).addScaledVector(a.dir, -ARROW_LEN * k)
      mesh.setMatrixAt(i, this.m.compose(this.p, this.q, this.s.setScalar(k)))
    }
    mesh.instanceMatrix.needsUpdate = true
    this.dirty = false
  }

  dispose(): void {
    this.mesh.removeFromParent()
    this.mesh.dispose()
  }
}
