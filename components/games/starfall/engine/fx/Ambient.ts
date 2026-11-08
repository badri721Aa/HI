/**
 * Ambient — the life in the air around the player.
 *
 *  - fireflies (woods, village, fresh water), meadow pollen catching the sun and falling
 *    forest leaves: GPU wrap-around layers driven by baked density maps (ambientLayers.ts),
 *  - sea spray along the nearby coastline and mist at the foot of Silver Falls: CPU-spawned
 *    puffs in a small GPU particle pool,
 *  - an occasional distant flock of birds.
 * Everything scales with ctx.quality and dims or brightens with the time of day.
 */
import * as THREE from 'three'
import { FALLS } from '../world/level'
import { smoothstep } from '../world/heightfield'
import type { Ctx, IAmbient } from '../types'
import type { QualityLevel } from '../settings'
import { AmbientLayer, createLayerUniforms, type LayerUniforms } from './ambientLayers'
import { Birds } from './Birds'
import { MODE, ParticlePool, SHAPE, particleInit, rand } from './gpu'
import { bakeWorldMap, type WorldMap } from './worldMap'

const LEVELS: QualityLevel[] = ['low', 'medium', 'high', 'ultra']
/** Spray/mist pool size and emission multiplier per quality level. */
const POOL_LIMIT = [140, 260, 380, 480]
const EMIT_SCALE = [0.45, 0.7, 1, 1.25]
/** Coast points within this radius of the player emit spray. */
const COAST_RADIUS = 60
/** Mist only runs while the player is this close to the falls. */
const MIST_RADIUS = 110

const _size = new THREE.Vector2()

export class Ambient implements IAmbient {
  private map: WorldMap | null = null
  private shared: LayerUniforms | null = null
  private fireflies: AmbientLayer | null = null
  private pollen: AmbientLayer | null = null
  private leaves: AmbientLayer | null = null
  private birds: Birds | null = null
  private pool: ParticlePool | null = null
  private p = particleInit()
  private time = 0
  private level = -1
  private center = new THREE.Vector3()
  private nearCoast = new Int32Array(0)
  private nearCount = 0
  private coastT = 0
  private sprayAcc = 0
  private mistAcc = 0
  private dark = 0

  constructor(private ctx: Ctx) {}

  init(): void {
    const ctx = this.ctx
    this.map = bakeWorldMap()
    this.nearCoast = new Int32Array(this.map.coastCount)
    this.shared = createLayerUniforms(this.map)
    this.fireflies = new AmbientLayer('fireflies', this.shared, null)
    this.pollen = new AmbientLayer('pollen', this.shared, null)
    this.leaves = new AmbientLayer('leaves', this.shared, ctx.textures.get('leaves_albedo'))
    this.birds = new Birds()
    this.pool = new ParticlePool({ name: 'ambient', capacity: POOL_LIMIT[3], additive: false, noise: ctx.textures.get('noise'), renderOrder: 19 })
    ctx.scene.add(this.fireflies.mesh, this.pollen.mesh, this.leaves.mesh, this.birds.mesh, this.pool.mesh)
    this.applyQuality()
    this.updateCenter()
  }

  update(dt: number): void {
    const shared = this.shared
    if (!shared) return
    const ctx = this.ctx
    this.time += dt
    if (LEVELS[this.level] !== ctx.quality.level) this.applyQuality()
    this.updateCenter()

    const sun = ctx.env?.sun
    this.dark = 1 - smoothstep(0.9, 2.8, sun ? sun.intensity : 3)
    shared.uTime.value = this.time
    shared.uDark.value = this.dark
    shared.uCenter.value.copy(this.center)
    if (ctx.env) shared.uSunDir.value.copy(ctx.env.sunDirection)
    shared.uViewHeight.value = ctx.renderer.getDrawingBufferSize(_size).y

    this.fireflies!.uniforms.uIntensity.value = 0.8 + 0.45 * this.dark
    this.pollen!.uniforms.uIntensity.value = 1 - 0.6 * this.dark
    this.leaves!.uniforms.uLight!.value.setRGB(1, 0.92, 0.8).multiplyScalar(1 - 0.7 * this.dark)

    this.birds!.update(dt, this.time, this.center, this.dark < 0.5)
    this.emitSpray(dt)
    this.emitMist(dt)
    this.pool!.update(this.time, shared.uViewHeight.value)
  }

  dispose(): void {
    for (const o of [this.fireflies, this.pollen, this.leaves, this.birds, this.pool]) o?.dispose()
    this.map?.dispose()
    this.fireflies = this.pollen = this.leaves = null
    this.birds = null
    this.pool = null
    this.map = null
    this.shared = null
  }

  /* ── internals ─────────────────────────────────────────────── */

  private applyQuality(): void {
    this.level = Math.max(0, LEVELS.indexOf(this.ctx.quality.level))
    for (const l of [this.fireflies, this.pollen, this.leaves]) l?.setQuality(this.level)
    this.birds?.setQuality(this.level)
    this.pool?.setLimit(POOL_LIMIT[this.level])
  }

  /** Effects follow the player, or the camera when a cutscene flies it far away. */
  private updateCenter(): void {
    const cam = this.ctx.camera.position
    const pl = this.ctx.player?.position
    this.center.copy(pl && pl.distanceToSquared(cam) < 40 * 40 ? pl : cam)
  }

  /** Light colour for spray/mist puffs (warm golden hour, greyer at night). */
  private puffColor(base: number): void {
    const k = base * (1 - 0.65 * this.dark)
    this.p.r = k
    this.p.g = k * 0.97
    this.p.b = k * 0.93 + 0.05 * this.dark
  }

  private emitSpray(dt: number): void {
    const map = this.map!
    this.coastT -= dt
    if (this.coastT <= 0) {
      this.coastT = 0.5
      const c = map.coast
      const r2 = COAST_RADIUS * COAST_RADIUS
      let n = 0
      for (let k = 0; k < map.coastCount; k++) {
        const dx = c[k * 4] - this.center.x
        const dz = c[k * 4 + 1] - this.center.z
        if (dx * dx + dz * dz < r2) this.nearCoast[n++] = k
      }
      this.nearCount = n
    }
    if (this.nearCount === 0) return
    const rate = Math.min(this.nearCount * 0.3, 14) * EMIT_SCALE[this.level]
    this.sprayAcc = Math.min(this.sprayAcc + rate * dt, 6)
    const p = this.p
    while (this.sprayAcc >= 1) {
      this.sprayAcc -= 1
      const k = this.nearCoast[Math.floor(Math.random() * this.nearCount)] * 4
      const x = map.coast[k]
      const z = map.coast[k + 1]
      const nx = map.coast[k + 2]
      const nz = map.coast[k + 3]
      const along = rand(-2.2, 2.2)
      const across = rand(-1.6, 0.4)
      p.x = x - nz * along + nx * across
      p.z = z + nx * along + nz * across
      p.y = rand(0.1, 0.4)
      const drift = rand(0.3, 0.8)
      p.vx = nx * drift
      p.vz = nz * drift
      p.vy = rand(0.45, 1.1)
      p.life = rand(1.8, 3)
      p.size0 = rand(0.35, 0.6)
      p.size1 = p.size0 * rand(3.2, 4.2)
      p.gravity = -0.1
      p.drag = 0.6
      this.puffColor(1)
      p.a = 0.26
      p.rot = rand(0, 6.28)
      p.spin = rand(-0.4, 0.4)
      p.shape = SHAPE.smoke
      p.mode = MODE.billboard
      this.pool!.spawn(p, this.time)

      // Now and then a few droplets flick up out of the wash.
      if (Math.random() < 0.3) {
        for (let d = 0; d < 3; d++) {
          p.vx = nx * rand(0.4, 1.4) + rand(-0.5, 0.5)
          p.vz = nz * rand(0.4, 1.4) + rand(-0.5, 0.5)
          p.vy = rand(2, 3.6)
          p.life = rand(0.5, 0.8)
          p.size0 = rand(0.03, 0.05)
          p.size1 = p.size0 * 0.6
          p.gravity = -9.8
          p.drag = 0.3
          this.puffColor(1.15)
          p.a = 0.7
          p.spin = 0
          p.shape = SHAPE.drop
          p.mode = MODE.stretch
          this.pool!.spawn(p, this.time)
        }
      }
    }
  }

  private emitMist(dt: number): void {
    const dx = this.center.x - FALLS.x
    const dz = this.center.z - FALLS.curtainZ
    if (dx * dx + dz * dz > MIST_RADIUS * MIST_RADIUS) return
    this.mistAcc = Math.min(this.mistAcc + 6 * EMIT_SCALE[this.level] * dt, 4)
    const p = this.p
    while (this.mistAcc >= 1) {
      this.mistAcc -= 1
      p.x = FALLS.x + rand(-3.5, 3.5)
      p.y = FALLS.poolLevel + rand(0.1, 0.8)
      p.z = FALLS.curtainZ + rand(0.3, 2.5)
      p.vx = rand(-0.3, 0.3)
      p.vy = rand(0.35, 0.9)
      p.vz = rand(0.5, 1.4)
      p.life = rand(3, 5)
      p.size0 = rand(0.8, 1.3)
      p.size1 = p.size0 * rand(2.8, 3.6)
      p.gravity = 0.05
      p.drag = 0.35
      this.puffColor(1)
      p.a = 0.2
      p.rot = rand(0, 6.28)
      p.spin = rand(-0.25, 0.25)
      p.shape = SHAPE.smoke
      p.mode = MODE.billboard
      this.pool!.spawn(p, this.time)
    }
  }
}
