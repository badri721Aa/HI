/**
 * The Frost Golem — rock and ice, slow to turn, with a glowing ice core in its back.
 *
 *   phase 1  plods toward the player; throws boulders (a shadow circle marks where each lands)
 *            and stomps when the player is close (a shockwave ring to jump over)
 *   phase 2  + punches the ground: a line of ice spikes runs at the player, then its fists are
 *            stuck in the ice for a moment (vulnerable)
 *   phase 3  boulder volleys and spike fans, turns faster
 *
 * Its rock armour shrugs off blows from the front; hits from behind — and above all on the core,
 * by arrow or blade — do big damage. Defeat: it crumbles into tumbling pieces.
 */
import * as THREE from 'three'
import type { V3 } from '../../events'
import { KIND } from '../../gameplay/weapons/defs'
import type { Ctx, WeaponHit } from '../../types'
import { Boss, type Arena } from './Boss'
import { rockGeometry } from '../geo'
import type { Hazards } from './hazards'

const MAX_HP = 1000
const RADIUS = 1.7
const HEIGHT = 5.6
const CORE_RADIUS = 0.8
/** Damage multiplier for weak-point hits. */
export const CORE_BONUS = 2.5

type Act = 'walk' | 'stomp' | 'throw' | 'volley' | 'spikes' | 'fan' | 'stuck' | 'recover' | 'roar'

const TUNE = [
  { turn: 1.0, speed: 1.4, rest: 2.3, windup: 1.05 },
  { turn: 1.3, speed: 1.7, rest: 1.8, windup: 0.95 },
  { turn: 1.65, speed: 2.0, rest: 1.35, windup: 0.85 },
]

interface Piece {
  mesh: THREE.Mesh
  v: THREE.Vector3
  w: THREE.Vector3
}

export class FrostGolem extends Boss {
  readonly id = 'frostGolem' as const
  readonly title = 'Warden of Frost Peak'

  private act: Act = 'walk'
  private actT = 0
  private restT = 0
  private turn = 0
  private walkPhase = 0
  private struck = false
  private readonly hips = new THREE.Group()
  private readonly torso = new THREE.Group()
  private readonly armL = new THREE.Group()
  private readonly armR = new THREE.Group()
  private readonly legL = new THREE.Group()
  private readonly legR = new THREE.Group()
  private readonly core: THREE.Mesh
  private readonly coreMat: THREE.MeshStandardMaterial
  private readonly rockMat: THREE.MeshStandardMaterial
  private readonly held: THREE.Mesh
  private readonly debris = new THREE.Group()
  private pieces: Piece[] = []
  /** Every part's place in the body, to put it back together after crumbling (new game). */
  private readonly parts: Array<{ mesh: THREE.Mesh; parent: THREE.Object3D; pos: THREE.Vector3; rot: THREE.Euler; scale: THREE.Vector3 }> = []
  private crumbled = false
  private coreHit = 0
  private readonly v = new THREE.Vector3()
  private readonly w = new THREE.Vector3()
  private readonly owned: Array<{ dispose(): void }> = []

  constructor(ctx: Ctx, hazards: Hazards, arena: Arena) {
    super(ctx, hazards, arena, MAX_HP, [0.6, 0.3])
    this.home.set(arena.x, arena.y, arena.z - 6)
    const own = <T extends { dispose(): void }>(o: T): T => {
      this.owned.push(o)
      return o
    }
    const tex = ctx.textures
    this.rockMat = own(new THREE.MeshStandardMaterial({ map: tex.get('rock_albedo'), normalMap: tex.get('rock_normal'), roughness: 0.92 }))
    this.rockMat.color.setRGB(1.25, 1.35, 1.5)
    const iceMat = own(new THREE.MeshStandardMaterial({ color: 0xc2ecff, emissive: 0x2a8fd0, emissiveIntensity: 0.55, roughness: 0.1, metalness: 0.05 }))
    const snowMat = own(new THREE.MeshStandardMaterial({ map: tex.get('plaster_albedo'), roughness: 0.9 }))
    snowMat.color.setRGB(1.25, 1.32, 1.42)
    this.coreMat = own(new THREE.MeshStandardMaterial({ color: 0xd8f6ff, emissive: 0x52d6ff, emissiveIntensity: 2.4, roughness: 0.1 }))
    const eyeMat = own(new THREE.MeshStandardMaterial({ color: 0xeaffff, emissive: 0x7fe8ff, emissiveIntensity: 3 }))

    const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) => {
      const m = new THREE.Mesh(own(geo), mat)
      m.position.set(x, y, z)
      m.scale.set(sx, sy, sz)
      m.rotation.set(rx, ry, rz)
      m.castShadow = true
      m.receiveShadow = true
      parent.add(m)
      return m
    }

    // Hips and legs: stubby rock pillars.
    this.hips.position.y = 2.1
    mesh(rockGeometry(0.9, 11), this.rockMat, this.hips, 0, 0, 0, 1.2, 0.7, 0.9)
    for (const [leg, side] of [[this.legL, -1], [this.legR, 1]] as const) {
      leg.position.set(0.65 * side, -0.1, 0)
      mesh(rockGeometry(0.62, 20 + side), this.rockMat, leg, 0, -0.75, 0, 0.9, 1.3, 0.9)
      mesh(rockGeometry(0.7, 30 + side), this.rockMat, leg, 0, -1.65, 0.12, 1.05, 0.7, 1.2)
      this.hips.add(leg)
    }

    // Torso: a big boulder chest with ice growing from the shoulders and the core set in its back.
    this.torso.position.y = 0.5
    mesh(rockGeometry(1.25, 3, 2), this.rockMat, this.torso, 0, 0.9, 0, 1.35, 1.15, 1.0)
    mesh(rockGeometry(0.75, 5), snowMat, this.torso, 0, 1.75, 0.05, 1.5, 0.45, 1.05)
    mesh(new THREE.ConeGeometry(0.28, 1.4, 5), iceMat, this.torso, -1.05, 1.85, -0.2, 1, 1, 1, -0.3, 0, 0.5)
    mesh(new THREE.ConeGeometry(0.22, 1.0, 5), iceMat, this.torso, -0.75, 2.0, -0.45, 1, 1, 1, -0.6, 0, 0.2)
    mesh(new THREE.ConeGeometry(0.3, 1.6, 5), iceMat, this.torso, 1.05, 1.9, -0.25, 1, 1, 1, -0.35, 0, -0.45)
    mesh(new THREE.ConeGeometry(0.2, 0.9, 5), iceMat, this.torso, 0.4, 2.0, -0.6, 1, 1, 1, -0.8, 0, -0.1)
    // The weak point: a ring of rock around a glowing crystal.
    mesh(new THREE.TorusGeometry(0.62, 0.2, 6, 12), this.rockMat, this.torso, 0, 1.0, -1.08, 1, 1, 0.8)
    this.core = mesh(new THREE.OctahedronGeometry(0.55, 1), this.coreMat, this.torso, 0, 1.0, -1.12, 1, 1.2, 0.7)
    // Head: a small rock with two cold eyes.
    mesh(rockGeometry(0.55, 7), this.rockMat, this.torso, 0, 2.35, 0.35, 1.1, 0.85, 1)
    mesh(new THREE.BoxGeometry(0.18, 0.08, 0.05), eyeMat, this.torso, -0.2, 2.42, 0.86)
    mesh(new THREE.BoxGeometry(0.18, 0.08, 0.05), eyeMat, this.torso, 0.2, 2.42, 0.86)
    this.hips.add(this.torso)

    // Arms hang from the shoulders (pivot), rock fists at the ends.
    for (const [arm, side] of [[this.armL, -1], [this.armR, 1]] as const) {
      arm.position.set(1.55 * side, 1.65, 0.1)
      mesh(rockGeometry(0.62, 40 + side), this.rockMat, arm, 0, 0, 0, 1, 0.9, 1)
      mesh(rockGeometry(0.48, 50 + side), this.rockMat, arm, 0, -0.95, 0.05, 0.9, 1.4, 0.9)
      mesh(rockGeometry(0.62, 60 + side), this.rockMat, arm, 0, -1.95, 0.1, 1.05, 1, 1.05)
      mesh(new THREE.ConeGeometry(0.16, 0.7, 5), iceMat, arm, 0.25 * side, -1.9, -0.35, 1, 1, 1, -1.2, 0, 0)
      this.torso.add(arm)
    }
    this.held = mesh(rockGeometry(0.75, 77), this.rockMat, this.armR, 0, -2.6, 0.1)
    this.held.visible = false

    this.root.add(this.hips)
    this.root.traverse(o => {
      const m = o as THREE.Mesh
      if (m.isMesh) this.parts.push({ mesh: m, parent: m.parent!, pos: m.position.clone(), rot: m.rotation.clone(), scale: m.scale.clone() })
    })
    this.debris.name = 'golem-debris'
    ctx.scene.add(this.debris)

    this.collider = ctx.collision.addCylinder({
      x: this.home.x, y: this.home.y, z: this.home.z, r: RADIUS * 0.85, h: HEIGHT * 0.85,
      dynamic: true, surface: 'rock', tag: 'boss', onLand: impact => this.stomped(impact),
    })
    this.attach()
    this.reset()
  }

  override dispose(): void {
    super.dispose()
    this.debris.removeFromParent()
    for (const o of this.owned) o.dispose()
  }

  /* ── Boss hooks ──────────────────────────────────────────── */

  protected onReset(): void {
    if (this.crumbled) this.assemble()
    this.setAct('walk')
    this.restT = 1.5
    this.turn = 0
    this.held.visible = false
  }

  protected onWake(): void {
    this.setAct('roar')
    this.roar()
  }

  protected onBegin(): void {
    this.setAct('walk')
    this.restT = 1.2
  }

  protected onPhase(): void {
    this.held.visible = false
    this.setAct('roar')
    this.ctx.fx.burst('stomp', this.feet(), { scale: 3, color: '#cdefff' })
  }

  protected stompDamage(): number {
    return 15
  }

  protected touches(c: V3, r: number): boolean {
    const dx = c.x - this.pos.x
    const dz = c.z - this.pos.z
    const reach = RADIUS + r
    return dx * dx + dz * dz < reach * reach && c.y > this.pos.y - r && c.y < this.pos.y + HEIGHT + r
  }

  /**
   * The core is the weak point: an arrow into it, or any melee blow from behind (the core sits
   * in its back), does big damage. Arrows elsewhere in the back do normal damage; the
   * rock-armoured front shrugs most of it off.
   */
  protected multiplier(h: WeaponHit): number {
    this.core.getWorldPosition(this.v)
    const d = Math.hypot(h.center.x - this.v.x, h.center.y - this.v.y, h.center.z - this.v.z)
    const behind = Math.sin(this.yaw) * (h.from.x - this.pos.x) + Math.cos(this.yaw) * (h.from.z - this.pos.z) < 0
    if (d < h.radius + CORE_RADIUS || (behind && KIND[h.weapon] !== 'bow')) {
      this.coreHit = 1
      this.ctx.fx.burst('shard', this.v, { color: '#9fe6ff', scale: 0.8 })
      return CORE_BONUS
    }
    return behind ? 1 : 0.35
  }

  /* ── the fight ───────────────────────────────────────────── */

  protected fight(dt: number): void {
    const tune = TUNE[this.phase - 1]
    const p = this.ctx.player.position
    const ready = this.playerReady()
    const dist = Math.hypot(p.x - this.pos.x, p.z - this.pos.z)
    this.actT += dt
    this.coreHit = Math.max(0, this.coreHit - dt * 3)

    switch (this.act) {
      case 'roar':
        if (this.actT > 1.6) this.setAct('walk')
        break
      case 'walk':
        this.turnToward(p.x, p.z, tune.turn, dt)
        if (dist > 4.5) {
          const step = tune.speed * dt
          this.pos.x += Math.sin(this.yaw) * step
          this.pos.z += Math.cos(this.yaw) * step
          this.clampToArena(this.pos, RADIUS + 1)
          this.walkPhase += dt * tune.speed * 1.6
        }
        this.restT -= dt
        if (this.restT <= 0 && ready) this.choose(dist)
        break
      case 'stomp':
        if (!this.struck && this.actT > tune.windup * 0.8) {
          this.struck = true
          const f = this.feet()
          this.slam(f, 1)
          this.hazards.ring(f.x, f.y, f.z, { speed: 8, maxR: 13, height: 0.8 })
        }
        if (this.actT > tune.windup * 0.8 + 0.9) this.rest(tune.rest * 0.6)
        break
      case 'throw':
      case 'volley':
        this.turnToward(p.x, p.z, tune.turn * 1.5, dt)
        if (!this.struck && this.actT > tune.windup) {
          this.struck = true
          this.held.visible = false
          this.throwAt(this.act === 'volley' ? 3 : 1)
        }
        if (this.actT > tune.windup + 0.7) this.rest(tune.rest)
        break
      case 'spikes':
      case 'fan':
        if (this.actT < tune.windup * 0.6) this.turnToward(p.x, p.z, tune.turn * 1.5, dt)
        if (!this.struck && this.actT > tune.windup) {
          this.struck = true
          this.punch(this.act === 'fan')
          this.setAct('stuck')
          this.stun(1.9)
        }
        break
      case 'stuck':
        if (!this.vulnerable) this.rest(tune.rest * 0.5)
        break
      case 'recover':
        this.restT -= dt
        if (this.restT <= 0) this.setAct('walk')
        break
    }
  }

  private choose(dist: number): void {
    if (dist < 5.5) {
      this.setAct('stomp')
      return
    }
    const cycles: Act[][] = [['throw'], ['throw', 'spikes'], ['volley', 'fan', 'throw', 'fan']]
    const list = cycles[this.phase - 1]
    const a = list[this.turn++ % list.length]
    this.setAct(a)
    if (a === 'throw' || a === 'volley') this.held.visible = true
  }

  private rest(seconds: number): void {
    this.setAct('walk')
    this.restT = seconds
  }

  /** Boulders at the player (leading their run); a volley adds two to the sides. */
  private throwAt(n: number): void {
    const p = this.ctx.player.position
    const v = this.ctx.player.velocity
    const hand = this.held.getWorldPosition(this.w)
    const y = this.arena.y
    for (let i = 0; i < n; i++) {
      const lead = 0.5 + i * 0.15
      const side = i === 0 ? 0 : i === 1 ? 3 : -3
      const fx = Math.cos(this.yaw)
      const fz = -Math.sin(this.yaw)
      this.v.set(p.x + v.x * lead + fx * side, y, p.z + v.z * lead + fz * side)
      this.clampToArena(this.v, 1)
      this.hazards.lob('boulder', hand, this.v, 1.3 + i * 0.2, 4.5, 2.1)
    }
    this.ctx.bus.emit('boss:roar', { pos: hand, boss: this.id })
  }

  /** Fists into the ground: a line (or a fan of three) of ice spikes runs at the player. */
  private punch(fan: boolean): void {
    const f = this.feet()
    this.slam(f, 0.7)
    const p = this.ctx.player.position
    const base = Math.atan2(p.x - this.pos.x, p.z - this.pos.z)
    const angles = fan ? [base - 0.45, base, base + 0.45] : [base]
    for (const a of angles) {
      const dx = Math.sin(a)
      const dz = Math.cos(a)
      this.hazards.spikes(this.pos.x + dx * 2.4, this.arena.y, this.pos.z + dz * 2.4, dx, dz, 11, 1.3, 0.5, 0.075)
    }
  }

  private slam(f: V3, shake: number): void {
    this.ctx.bus.emit('boss:slam', { pos: f, boss: this.id })
    this.ctx.fx.burst('land', f, { scale: 3, color: '#e3f1ff' })
    this.ctx.game.shake(0.5 * shake, 0.35)
  }

  private feet(): V3 {
    return { x: this.pos.x, y: this.arena.y, z: this.pos.z }
  }

  private setAct(a: Act): void {
    this.act = a
    this.actT = 0
    this.struck = false
  }

  /* ── defeat: crumble into tumbling pieces ────────────────── */

  protected onDefeat(): void {
    this.crumbled = true
    this.held.visible = false
    this.root.updateMatrixWorld(true)
    const meshes: THREE.Mesh[] = []
    this.root.traverse(o => {
      if ((o as THREE.Mesh).isMesh && o.visible) meshes.push(o as THREE.Mesh)
    })
    const c = this.v.set(this.pos.x, this.pos.y + 2.5, this.pos.z)
    for (const m of meshes) {
      m.getWorldPosition(this.w)
      this.debris.attach(m)
      const out = this.w.clone().sub(c)
      out.y = Math.max(0.2, out.y)
      out.normalize().multiplyScalar(2.5 + Math.random() * 3)
      out.y += 3 + Math.random() * 4
      const spin = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(8)
      this.pieces.push({ mesh: m, v: out, w: spin })
    }
    this.ctx.fx.burst('beacon', c, { color: '#bfeaff', scale: 1.3 })
  }

  protected dying(dt: number, t: number): void {
    this.stepDebris(dt, t)
  }

  protected place(dt: number): void {
    if (this.mode === 'dead' || this.mode === 'dying') {
      // The rubble keeps settling after the defeat hand-off.
      if (this.mode === 'dead' && this.pieces.length) this.stepDebris(dt, (this.deathT += dt))
      return
    }
    const t = this.ctx.clock.t
    const tune = TUNE[this.phase - 1]
    const k = Math.min(1, this.actT / Math.max(0.01, tune.windup))
    let armL = 0.15
    let armR = 0.15
    let legR = 0
    let lean = 0
    const stride = Math.sin(this.walkPhase)
    switch (this.act) {
      case 'walk':
        armL = 0.15 + stride * 0.35
        armR = 0.15 - stride * 0.35
        break
      case 'throw':
      case 'volley':
        armR = this.struck ? -1.0 : -2.8 * k
        lean = this.struck ? 0.2 : -0.15 * k
        break
      case 'spikes':
      case 'fan':
        armL = armR = this.struck ? -1.2 : -2.6 * k
        lean = this.struck ? 0.35 : -0.2 * k
        break
      case 'stuck':
        armL = armR = -1.25
        lean = 0.38
        break
      case 'stomp':
        legR = this.struck ? 0 : -0.9 * Math.min(1, this.actT / (tune.windup * 0.8))
        lean = this.struck ? 0.1 : -0.12
        break
      case 'roar':
        armL = armR = -0.6 - 0.25 * Math.sin(t * 20)
        lean = -0.25
        break
    }
    const sleep = this.mode === 'sleep'
    const legSwing = this.act === 'walk' ? stride * 0.35 : 0
    const d = Math.min(1, dt * 10)
    this.armL.rotation.x += (armL - this.armL.rotation.x) * d
    this.armR.rotation.x += (armR - this.armR.rotation.x) * d
    this.legL.rotation.x += (-legSwing - this.legL.rotation.x) * d
    this.legR.rotation.x += (legSwing + legR - this.legR.rotation.x) * d
    this.torso.rotation.x += ((sleep ? 0.45 : lean) - this.torso.rotation.x) * d
    this.hips.position.y = 2.1 - (sleep ? 0.35 : 0) + (this.act === 'walk' ? Math.abs(stride) * 0.08 : 0)
    this.root.position.set(this.pos.x, this.pos.y, this.pos.z)
    this.root.rotation.y = this.yaw

    // The core pulses; brighter when struck or exposed (fists stuck), dark while asleep.
    const pulse = 0.5 + 0.5 * Math.sin(t * 4)
    this.coreMat.emissiveIntensity = sleep ? 0.5 : 1.8 + pulse * 0.8 + this.coreHit * 4 + (this.vulnerable ? 1.2 : 0)
    this.rockMat.emissive.setScalar(this.flash * 0.35)

    if (this.collider) this.ctx.collision.move(this.collider, this.pos.x, this.pos.y, this.pos.z, 0, Math.max(dt, 1e-3))
  }

  private assemble(): void {
    for (const p of this.parts) {
      p.parent.add(p.mesh)
      p.mesh.position.copy(p.pos)
      p.mesh.rotation.copy(p.rot)
      p.mesh.scale.copy(p.scale)
      p.mesh.visible = true
    }
    this.held.visible = false
    this.pieces = []
    this.crumbled = false
  }

  private stepDebris(dt: number, t: number): void {
    const floor = this.arena.y
    for (const p of this.pieces) {
      const m = p.mesh
      p.v.y -= 22 * dt
      m.position.addScaledVector(p.v, dt)
      m.rotation.x += p.w.x * dt
      m.rotation.y += p.w.y * dt
      m.rotation.z += p.w.z * dt
      const r = 0.4 * m.scale.y
      if (m.position.y < floor + r && p.v.y < 0) {
        m.position.y = floor + r
        p.v.y = -p.v.y * 0.3
        p.v.x *= 0.6
        p.v.z *= 0.6
        p.w.multiplyScalar(0.6)
      }
      // After a few seconds the rubble sinks into the snow.
      if (t > 4) m.position.y -= dt * 0.6
    }
    if (t > 6.5) {
      for (const p of this.pieces) p.mesh.visible = false
      this.pieces = []
    }
  }
}
