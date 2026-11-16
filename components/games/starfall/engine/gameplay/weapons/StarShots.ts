/**
 * Star-tech shots in flight: the Star Blaster's bolts (fast, dead straight) and the Comet
 * Launcher's comets (slow, arcing, bursting where they land and throwing whatever is near).
 *
 * Two fixed pools, one InstancedMesh each, plus a glow sprite per comet. Flight runs in short
 * sub-steps: a raycast against terrain and props, a sphere test against enemies and, with pvp on,
 * other players. Trails and bursts come from the shared particles. Cosmetic shots (other
 * players') fly, trail and burst the same way but hit no one. Allocation-free per frame.
 */
import * as THREE from 'three'
import type { V3 } from '../../events'
import { dustAt } from '../../fx/dust'
import type { Ctx, WeaponHit } from '../../types'
import { waterLevelAt } from '../../world/heightfield'
import { glowTexture } from '../parts/util'
import { COMET_LAUNCHER as COMET, STAR_BLASTER as BOLT, type StarWeapon } from './defs'

const BOLTS = 40
const COMETS = 8
/** Longest sub-step (m) and the most of them per frame. */
const STEP = 0.4
const MAX_STEPS = 12
/** A fresh shot grows to full size over this long (s). */
const GROW = 0.06
const BOLT_TRAIL = 0x9fd2ff
const COMET_TRAIL = 0xffb24d
const BOLT_SPARK = '#a8d8ff'
const COMET_SPARK = '#ffc46b'
/** A comet bursting this close shakes the camera (m). */
const SHAKE_RANGE = 14
/** Cosmetic bolts leave trails only where the particle budget allows (ctx.quality.particles). */
const COSMETIC_TRAIL_BUDGET = 1200
const FWD = new THREE.Vector3(0, 0, 1)

interface Pool {
  n: number
  live: Uint8Array
  x: Float32Array
  y: Float32Array
  z: Float32Array
  vx: Float32Array
  vy: Float32Array
  vz: Float32Array
  age: Float32Array
  mesh: THREE.InstancedMesh
}

function pool(n: number, geo: THREE.BufferGeometry, mat: THREE.Material, name: string): Pool {
  const f = () => new Float32Array(n)
  const mesh = new THREE.InstancedMesh(geo, mat, n)
  mesh.name = name
  mesh.frustumCulled = false
  mesh.count = 0
  return { n, live: new Uint8Array(n), x: f(), y: f(), z: f(), vx: f(), vy: f(), vz: f(), age: f(), mesh }
}

/** A six-sided streak along +Z: a short nose, the widest ring just behind it and a long tail. */
function boltGeometry(): THREE.BufferGeometry {
  const profile = [new THREE.Vector2(0, -0.78), new THREE.Vector2(0.02, -0.3), new THREE.Vector2(0.046, 0), new THREE.Vector2(0, 0.11)]
  return new THREE.LatheGeometry(profile, 6).rotateX(Math.PI / 2)
}

export class StarShots {
  readonly group = new THREE.Group()
  private bolts: Pool
  private comets: Pool
  private halos: THREE.Sprite[] = []
  private owned: Array<{ dispose(): void }> = []
  private frame = 0
  private readonly blow: WeaponHit = {
    weapon: 'starBlaster', center: { x: 0, y: 0, z: 0 }, radius: 0.3, damage: 0, knock: 0, lift: 0, from: { x: 0, y: 0, z: 0 }, max: 1,
  }
  private readonly m = new THREE.Matrix4()
  private readonly q = new THREE.Quaternion()
  private readonly p = new THREE.Vector3()
  private readonly s = new THREE.Vector3()
  private readonly dir = new THREE.Vector3()
  private readonly from = new THREE.Vector3()
  private readonly to = new THREE.Vector3()
  private readonly at: V3 = { x: 0, y: 0, z: 0 }

  constructor(
    private ctx: Ctx,
    private cosmetic = false,
  ) {
    const own = <T extends { dispose(): void }>(o: T): T => {
      this.owned.push(o)
      return o
    }
    // Brighter than white where it matters, so the bloom picks the shots up.
    const boltMat = own(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.8, 1.3, 2.2), fog: false }))
    const cometMat = own(new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.45, 0.6), fog: false }))
    this.bolts = pool(BOLTS, own(boltGeometry()), boltMat, 'star-bolts')
    this.comets = pool(COMETS, own(new THREE.IcosahedronGeometry(0.15, 1)), cometMat, 'comets')
    const glow = glowTexture(ctx)
    if (glow.owned) own(glow.texture)
    const haloMat = own(new THREE.SpriteMaterial({ map: glow.texture, color: 0xffa040, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }))
    for (let i = 0; i < COMETS; i++) {
      const halo = new THREE.Sprite(haloMat)
      halo.visible = false
      halo.scale.setScalar(1.1)
      this.halos.push(halo)
      this.group.add(halo)
    }
    this.group.name = 'star-shots'
    this.group.add(this.bolts.mesh, this.comets.mesh)
  }

  /** A shot leaves `weapon` at `from` with velocity `vel` (m/s). */
  fire(weapon: StarWeapon, from: V3, vel: V3): void {
    if (!Number.isFinite(from.x + from.y + from.z + vel.x + vel.y + vel.z)) return
    const pl = weapon === 'starBlaster' ? this.bolts : this.comets
    // A free slot, else the shot that has flown longest.
    let i = -1
    let oldest = 0
    for (let k = 0; k < pl.n; k++) {
      if (!pl.live[k]) {
        i = k
        break
      }
      if (pl.age[k] >= pl.age[oldest]) oldest = k
    }
    if (i < 0) i = oldest
    pl.live[i] = 1
    pl.x[i] = from.x
    pl.y[i] = from.y
    pl.z[i] = from.z
    pl.vx[i] = vel.x
    pl.vy[i] = vel.y
    pl.vz[i] = vel.z
    pl.age[i] = 0
  }

  clear(): void {
    this.bolts.live.fill(0)
    this.comets.live.fill(0)
    this.render()
  }

  update(dt: number): void {
    this.frame++
    const fx = this.ctx.fx
    const b = this.bolts
    // Our own bolts always trail (every other frame on the lightest preset); other players' only where the budget allows.
    const budget = this.ctx.quality.particles
    const trails = this.cosmetic ? budget >= COSMETIC_TRAIL_BUDGET : budget >= COSMETIC_TRAIL_BUDGET || this.frame % 2 === 0
    let any = false
    for (let i = 0; i < b.n; i++) {
      if (!b.live[i]) continue
      any = true
      this.from.set(b.x[i], b.y[i], b.z[i])
      this.fly(b, i, dt, false)
      if (b.live[i] && trails) fx.trail('arrow', this.from, this.to.set(b.x[i], b.y[i], b.z[i]), BOLT_TRAIL)
    }
    const c = this.comets
    for (let i = 0; i < c.n; i++) {
      if (!c.live[i]) continue
      any = true
      this.from.set(c.x[i], c.y[i], c.z[i])
      this.fly(c, i, dt, true)
      if (c.live[i]) fx.trail('spark', this.from, this.to.set(c.x[i], c.y[i], c.z[i]), COMET_TRAIL)
    }
    if (any || b.mesh.count || c.mesh.count) this.render()
  }

  dispose(): void {
    this.group.removeFromParent()
    this.bolts.mesh.dispose()
    this.comets.mesh.dispose()
    for (const o of this.owned) o.dispose()
    this.owned = []
  }

  /* ── flight ──────────────────────────────────────────────── */

  private fly(pl: Pool, i: number, dt: number, comet: boolean): void {
    pl.age[i] += dt
    if (pl.age[i] > (comet ? COMET.life : BOLT.life)) {
      pl.live[i] = 0
      return
    }
    const ctx = this.ctx
    const speed = Math.hypot(pl.vx[i], pl.vy[i], pl.vz[i])
    const n = Math.min(MAX_STEPS, Math.max(1, Math.ceil((speed * dt) / STEP)))
    const h = dt / n
    const radius = comet ? COMET.radius : BOLT.radius
    for (let k = 0; k < n; k++) {
      if (comet) pl.vy[i] -= COMET.gravity * h
      const x = pl.x[i]
      const y = pl.y[i]
      const z = pl.z[i]
      const sx = pl.vx[i] * h
      const sy = pl.vy[i] * h
      const sz = pl.vz[i] * h
      const hit = ctx.collision.raycast(x, y, z, sx, sy, sz, 1)
      const t = hit ? hit.t : 1
      const ex = x + sx * t
      const ey = y + sy * t
      const ez = z + sz * t
      if (this.cosmetic) {
        // It stops at the hero (their own copy decides whether it hit).
        const p = ctx.player.position
        if ((ex - p.x) ** 2 + (ez - p.z) ** 2 < (radius + 0.4) ** 2 && ey > p.y - radius && ey < p.y + 1.7 + radius) {
          pl.live[i] = 0
          if (comet) this.burst(ex, ey, ez)
          return
        }
      } else if (this.touch(comet, ex, ey, ez, x - pl.vx[i] * 0.1, y, z - pl.vz[i] * 0.1)) {
        pl.live[i] = 0
        if (comet) this.burst(ex, ey, ez)
        return
      }
      if (hit) {
        pl.live[i] = 0
        if (comet) this.burst(hit.x, hit.y, hit.z)
        else this.fizzle(hit.x, hit.y, hit.z)
        return
      }
      pl.x[i] = ex
      pl.y[i] = ey
      pl.z[i] = ez
      if (ey < waterLevelAt(ex, ez)) {
        pl.live[i] = 0
        ctx.fx.burst('splash', this.point(ex, ey, ez), { scale: comet ? 1.3 : 0.5 })
        return
      }
    }
  }

  /** Does the shot at (x, y, z) reach an enemy or (with pvp on) another player? A bolt deals its blow here. */
  private touch(comet: boolean, x: number, y: number, z: number, fx: number, fy: number, fz: number): boolean {
    const ctx = this.ctx
    const b = this.blow
    b.weapon = comet ? 'cometLauncher' : 'starBlaster'
    b.center.x = x
    b.center.y = y
    b.center.z = z
    b.from.x = fx
    b.from.y = fy
    b.from.z = fz
    b.radius = comet ? COMET.radius : BOLT.radius
    b.damage = comet ? COMET.damage : BOLT.damage
    b.knock = comet ? 4 : BOLT.knock
    b.lift = comet ? 2 : BOLT.lift
    b.max = 1
    if (ctx.enemies.hit(b) > 0) return true
    // A bolt is its own blow; a comet only needs to meet a player — its burst is what reaches them.
    return comet ? ctx.net.near(b.center, b.radius) : ctx.net.strike(b, 0.5) > 0
  }

  /** A bolt spends itself on something solid. */
  private fizzle(x: number, y: number, z: number): void {
    const p = this.point(x, y, z)
    this.ctx.fx.burst('hit', p, { color: BOLT_SPARK, scale: 0.5, count: 5 })
    this.ctx.bus.emit('weapon:blast', { pos: { x, y, z }, weapon: 'starBlaster' })
  }

  /** The comet bursts: a ring of light, sparks and flying grit — and (ours) a blow to everything in reach. */
  private burst(x: number, y: number, z: number): void {
    const ctx = this.ctx
    const p = this.point(x, y, z)
    ctx.fx.burst('stomp', p, { color: COMET_SPARK, scale: 2.2 })
    ctx.fx.burst('spark', p, { color: COMET_SPARK, scale: 2.2 })
    ctx.fx.burst('debris', p, { color: dustAt(p), scale: 1.2 })
    ctx.bus.emit('weapon:blast', { pos: { x, y, z }, weapon: 'cometLauncher' })
    const hero = ctx.player.position
    const d = Math.hypot(hero.x - x, hero.y - y, hero.z - z)
    if (d < SHAKE_RANGE) ctx.game.shake(0.4 * (1 - d / SHAKE_RANGE), 0.25)
    if (this.cosmetic) return
    const b = this.blow
    b.weapon = 'cometLauncher'
    b.center.x = b.from.x = x
    b.center.y = y + 0.2
    b.from.y = y - 0.4
    b.center.z = b.from.z = z
    b.radius = COMET.blast.radius
    b.damage = COMET.blast.damage
    b.knock = COMET.blast.knock
    b.lift = COMET.blast.lift
    b.max = undefined
    const n = ctx.enemies.hit(b) + ctx.net.strike(b, 1)
    if (n) ctx.game.timeWarp(0.05, 0.06)
  }

  private point(x: number, y: number, z: number): V3 {
    const p = this.at
    p.x = x
    p.y = y
    p.z = z
    return p
  }

  /* ── drawing ─────────────────────────────────────────────── */

  /** Packs the live shots to the front of each instance buffer, so only what flies is drawn. */
  private render(): void {
    const b = this.bolts
    let n = 0
    for (let i = 0; i < b.n; i++) {
      if (!b.live[i]) continue
      const k = Math.min(1, 0.35 + b.age[i] / GROW)
      this.dir.set(b.vx[i], b.vy[i], b.vz[i])
      if (this.dir.lengthSq() < 1e-6) this.dir.copy(FWD)
      this.q.setFromUnitVectors(FWD, this.dir.normalize())
      b.mesh.setMatrixAt(n++, this.m.compose(this.p.set(b.x[i], b.y[i], b.z[i]), this.q, this.s.set(1, 1, k)))
    }
    b.mesh.count = n
    b.mesh.instanceMatrix.needsUpdate = true

    const c = this.comets
    n = 0
    this.q.identity()
    for (let i = 0; i < c.n; i++) {
      const halo = this.halos[i]
      halo.visible = !!c.live[i]
      if (!c.live[i]) continue
      const k = Math.min(1, 0.4 + c.age[i] / GROW) * (1 + 0.08 * Math.sin(c.age[i] * 30))
      this.p.set(c.x[i], c.y[i], c.z[i])
      halo.position.copy(this.p)
      c.mesh.setMatrixAt(n++, this.m.compose(this.p, this.q, this.s.setScalar(k)))
    }
    c.mesh.count = n
    c.mesh.instanceMatrix.needsUpdate = true
  }
}
