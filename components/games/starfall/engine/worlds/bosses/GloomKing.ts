/**
 * The Gloom King — a gloomling six times over, crowned with dark crystal.
 *
 *   phase 1  hop slams: crouch (telegraph) → leap at the player → land with a shockwave ring
 *            to jump over; after a series of slams it sits dazed (vulnerable)
 *   phase 2  + charges: paws the ground while a lane lights up, then runs straight along it;
 *            a charge into a pillar stuns it for a long while. Summons gloomling minions.
 *   phase 3  faster; every slam sends two rings; rains dark orbs onto marked circles
 *
 * Everything dangerous is telegraphed; stomping on its head hurts it too.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { V3 } from '../../events'
import type { Ctx, WeaponHit } from '../../types'
import { gloomMaterial } from '../../gameplay/Enemies'
import { GLOOM_HEIGHT, gloomlingGeometry } from '../../gameplay/parts/shapes'
import { glowTexture } from '../../gameplay/parts/util'
import { Boss, type Arena } from './Boss'
import type { Hazards } from './hazards'

const SCALE = 6
const HEIGHT = GLOOM_HEIGHT * SCALE
/** Body radius for hits, pillars and the arena edge (m). */
const RADIUS = 2.6
const MAX_HP = 900

type Act = 'idle' | 'crouch' | 'air' | 'land' | 'dazed' | 'windup' | 'charge' | 'skid' | 'roar' | 'raise'

/** Per phase: idle time, crouch, air time, slams per series, daze after slams, charge speed. */
const TUNE = [
  { idle: 1.2, crouch: 0.6, air: 0.9, slams: 3, daze: 2.8, windup: 1.1, speed: 15 },
  { idle: 0.95, crouch: 0.55, air: 0.85, slams: 2, daze: 2.4, windup: 1.0, speed: 16 },
  { idle: 0.7, crouch: 0.42, air: 0.72, slams: 2, daze: 2.1, windup: 0.8, speed: 18.5 },
]

export interface Pillar {
  x: number
  z: number
  r: number
}

export class GloomKing extends Boss {
  readonly id = 'gloomKing' as const
  readonly title = 'Sovereign of the Shadow Rift'

  private act: Act = 'idle'
  private actT = 0
  private slamsLeft = 0
  /** Alternates attacks in phases 2–3. */
  private turn = 0
  private summonT = 0
  /** Minions come with phase 2 (also when a big hit skips straight to phase 3). */
  private summoned = false
  private readonly from = new THREE.Vector3()
  private readonly to = new THREE.Vector3()
  private readonly dir = new THREE.Vector3()
  private vy = 0
  private spinX = 0
  private spinZ = 0
  // squash spring
  private sq = 0
  private sqv = 0
  private contactCd = 0
  private readonly state = { value: new THREE.Vector4(1, 0, 0, 0) }
  private readonly body: THREE.Mesh
  private readonly crown: THREE.Mesh
  private readonly stars: THREE.Sprite[] = []
  private readonly owned: Array<{ dispose(): void }> = []

  constructor(ctx: Ctx, hazards: Hazards, arena: Arena, private readonly pillars: readonly Pillar[]) {
    super(ctx, hazards, arena, MAX_HP, [0.66, 0.33])
    this.home.set(arena.x, arena.y, arena.z - 7)

    const geo = gloomlingGeometry()
    const mat = gloomMaterial(this.state)
    this.owned.push(geo, mat)
    this.body = new THREE.Mesh(geo, mat)
    this.body.scale.setScalar(SCALE)
    this.body.castShadow = true
    this.body.receiveShadow = true

    // A ring of dark crystal spikes riding on the head.
    const crownGeo = crownGeometry()
    const crownMat = new THREE.MeshStandardMaterial({ color: 0x2a1240, emissive: 0xb04cff, emissiveIntensity: 0.9, roughness: 0.15, metalness: 0.3 })
    this.owned.push(crownGeo, crownMat)
    this.crown = new THREE.Mesh(crownGeo, crownMat)
    this.crown.castShadow = true

    const glow = glowTexture(ctx)
    if (glow.owned) this.owned.push(glow.texture)
    const starMat = new THREE.SpriteMaterial({ map: glow.texture, color: 0xffe08a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
    this.owned.push(starMat)
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Sprite(starMat)
      s.scale.setScalar(0.9)
      s.visible = false
      this.stars.push(s)
      this.root.add(s)
    }
    this.root.add(this.body, this.crown)

    this.collider = ctx.collision.addCylinder({
      x: this.home.x, y: this.home.y, z: this.home.z, r: RADIUS * 0.85, h: HEIGHT * 0.9,
      dynamic: true, surface: 'leaves', tag: 'boss', onLand: impact => this.stomped(impact),
    })
    this.attach()
    this.reset()
  }

  override dispose(): void {
    super.dispose()
    for (const o of this.owned) o.dispose()
  }

  /* ── Boss hooks ──────────────────────────────────────────── */

  protected onReset(): void {
    this.setAct('idle')
    this.sq = this.sqv = this.vy = 0
    this.turn = 0
    this.summonT = 0
    this.summoned = false
    this.hazards.hideLane()
  }

  protected onWake(): void {
    this.setAct('roar')
    this.sqv = 6
    this.roar()
  }

  protected onBegin(): void {
    this.setAct('idle')
    this.actT = -0.4
  }

  protected onPhase(): void {
    this.hazards.hideLane()
    this.vy = 0
    this.pos.y = this.arena.y
    this.setAct('roar')
    this.sqv = 7
    if (!this.summoned) {
      this.summoned = true
      this.summon(3)
    }
  }

  protected stompDamage(): number {
    return 30
  }

  protected touches(c: V3, r: number): boolean {
    const dx = c.x - this.pos.x
    const dz = c.z - this.pos.z
    const dy = c.y - (this.pos.y + HEIGHT * 0.45)
    const reach = RADIUS + r
    return dx * dx + dz * dz < reach * reach && Math.abs(dy) < HEIGHT * 0.6 + r
  }

  protected multiplier(h: WeaponHit): number {
    return h.weapon === 'bow' ? 0.8 : 1
  }

  /* ── the fight ───────────────────────────────────────────── */

  protected fight(dt: number): void {
    const tune = TUNE[this.phase - 1]
    const p = this.ctx.player.position
    const ready = this.playerReady()
    this.actT += dt
    this.contactCd = Math.max(0, this.contactCd - dt)
    if (this.phase >= 2 && this.act !== 'roar') {
      this.summonT += dt
      if (this.summonT > 11 && this.ctx.enemies.minionCount < 2) this.summon(2)
    }

    switch (this.act) {
      case 'roar':
        if (this.actT > 1.5) this.setAct('idle')
        break
      case 'idle':
        this.turnToward(p.x, p.z, 4, dt)
        if (this.actT > tune.idle && ready) this.choose()
        break
      case 'crouch':
        this.turnToward(this.to.x, this.to.z, 8, dt)
        if (this.actT > tune.crouch) {
          this.from.copy(this.pos)
          this.setAct('air')
          this.sqv = 9
        }
        break
      case 'air': {
        const u = Math.min(1, this.actT / tune.air)
        this.pos.lerpVectors(this.from, this.to, u)
        this.pos.y = this.arena.y + 4 * 5.5 * u * (1 - u)
        if (u >= 1) this.land()
        break
      }
      case 'land':
        if (this.actT > 0.35) {
          if (this.slamsLeft > 0) this.hop()
          else {
            this.setAct('dazed')
            this.stun(tune.daze)
          }
        }
        break
      case 'dazed':
        if (!this.vulnerable) this.setAct('idle')
        break
      case 'windup': {
        // The lane follows the player for most of the wind-up, then locks.
        if (this.actT < tune.windup * 0.7) {
          this.turnToward(p.x, p.z, 3, dt)
          this.dir.set(Math.sin(this.yaw), 0, Math.cos(this.yaw))
          this.hazards.showLane(this.pos.x, this.arena.y, this.pos.z, this.yaw, this.laneLength(), RADIUS * 1.6)
        }
        if (this.actT > tune.windup) {
          this.hazards.hideLane()
          this.setAct('charge')
          this.ctx.bus.emit('boss:slam', { pos: this.feet(), boss: this.id })
        }
        break
      }
      case 'charge':
        this.charge(dt, tune.speed)
        break
      case 'skid': {
        const k = Math.max(0, 1 - this.actT / 0.5)
        this.pos.addScaledVector(this.dir, tune.speed * 0.5 * k * dt)
        this.clampToArena(this.pos, RADIUS + 0.2)
        if (this.actT > 0.9) this.setAct('idle')
        break
      }
      case 'raise':
        if (this.actT > 1.0) this.setAct('idle')
        break
    }
    if (ready) this.contact()
  }

  private choose(): void {
    if (this.phase === 1) {
      this.series(TUNE[0].slams)
      return
    }
    const cycle = this.phase === 2 ? ['slam', 'charge'] : ['slam', 'charge', 'rain', 'charge']
    const pick = cycle[this.turn++ % cycle.length]
    if (pick === 'slam') this.series(TUNE[this.phase - 1].slams)
    else if (pick === 'charge') this.setAct('windup')
    else this.rain()
  }

  private series(n: number): void {
    this.slamsLeft = n
    this.hop()
  }

  private hop(): void {
    const p = this.ctx.player.position
    const v = this.ctx.player.velocity
    // Lead the player a little, but never land outside the arena.
    this.to.set(p.x + v.x * 0.25, this.arena.y, p.z + v.z * 0.25)
    this.clampToArena(this.to, RADIUS + 0.8)
    this.slamsLeft--
    this.setAct('crouch')
    // Mark where it will come down.
    const tune = TUNE[this.phase - 1]
    this.hazards.warn(this.to.x, this.arena.y, this.to.z, RADIUS, tune.crouch + tune.air, null)
  }

  private land(): void {
    const f = this.feet()
    this.pos.y = this.arena.y
    this.setAct('land')
    this.sqv = -14
    this.ctx.bus.emit('boss:slam', { pos: f, boss: this.id })
    this.ctx.fx.burst('land', f, { scale: 3.2, color: '#8b6bb8' })
    this.ctx.fx.burst('stomp', f, { scale: 2.4, color: '#c79bff' })
    this.ctx.game.shake(0.6, 0.35)
    const wave = { speed: this.phase === 3 ? 10.5 : 9, maxR: this.arena.r + 4, height: 0.7 }
    this.hazards.ring(f.x, f.y, f.z, wave)
    // Phase 3: a second ring close behind — jump, land, jump again.
    if (this.phase === 3) this.hazards.after(0.5, () => this.hazards.ring(f.x, f.y, f.z, wave))
    // Landing right on the player.
    const p = this.ctx.player.position
    if (Math.hypot(p.x - f.x, p.z - f.z) < RADIUS + 0.4 && p.y - f.y < HEIGHT * 0.6) this.hurtPlayer(1)
  }

  private charge(dt: number, speed: number): void {
    this.pos.addScaledVector(this.dir, speed * dt)
    for (const pl of this.pillars) {
      if (Math.hypot(this.pos.x - pl.x, this.pos.z - pl.z) > RADIUS + pl.r) continue
      // Crashed into a pillar: knocked silly for a long while.
      const f = this.feet()
      this.pos.addScaledVector(this.dir, -0.6)
      this.ctx.bus.emit('boss:slam', { pos: f, boss: this.id })
      this.ctx.fx.burst('stomp', { x: f.x, y: f.y + 2, z: f.z }, { scale: 2.6, color: '#ffe08a' })
      this.ctx.fx.burst('dust', { x: pl.x, y: f.y + 1, z: pl.z }, { scale: 2.5, color: '#6d5a80' })
      this.ctx.game.shake(0.8, 0.45)
      this.sqv = -10
      this.setAct('dazed')
      this.stun(TUNE[this.phase - 1].daze + 1.4)
      return
    }
    const dx = this.pos.x - this.arena.x
    const dz = this.pos.z - this.arena.z
    if (Math.hypot(dx, dz) > this.arena.r - RADIUS - 0.3) {
      this.clampToArena(this.pos, RADIUS + 0.3)
      this.setAct('skid')
    }
  }

  private rain(): void {
    const p = this.ctx.player.position
    const y = this.arena.y
    const at = this.to
    for (let i = 0; i < 7; i++) {
      if (i < 3) {
        const a = Math.random() * Math.PI * 2
        const r = i === 0 ? 0 : 1.5 + Math.random() * 2
        at.set(p.x + Math.cos(a) * r, y, p.z + Math.sin(a) * r)
      } else {
        const a = Math.random() * Math.PI * 2
        const r = Math.sqrt(Math.random()) * (this.arena.r - 2)
        at.set(this.arena.x + Math.cos(a) * r, y, this.arena.z + Math.sin(a) * r)
      }
      this.clampToArena(at, 1)
      const delay = 1.25 + i * 0.12
      this.hazards.lob('orb', { x: at.x, y: y + 16, z: at.z }, at, delay, 0, 1.7)
    }
    this.setAct('raise')
    this.sqv = 8
    this.roar()
  }

  private summon(n: number): void {
    this.summonT = 0
    for (let i = 0; i < n; i++) {
      const a = this.yaw + (i - (n - 1) / 2) * 0.9
      this.to.set(this.pos.x + Math.sin(a) * (RADIUS + 2), this.arena.y, this.pos.z + Math.cos(a) * (RADIUS + 2))
      this.clampToArena(this.to, 2)
      this.ctx.enemies.spawnMinion(this.to.x, this.arena.y, this.to.z)
    }
  }

  /** Touching it hurts while it lands or charges. */
  private contact(): void {
    if (this.contactCd > 0 || (this.act !== 'charge' && this.act !== 'land')) return
    const p = this.ctx.player.position
    if (Math.hypot(p.x - this.pos.x, p.z - this.pos.z) < RADIUS + 0.55 && p.y < this.pos.y + HEIGHT * 0.8) this.hurtPlayer(1)
  }

  private hurtPlayer(n: number): void {
    const pl = this.ctx.player
    if (pl.invulnerable) return
    this.contactCd = 1
    pl.hurt(n, { x: this.pos.x, y: this.pos.y + 1, z: this.pos.z })
  }

  private laneLength(): number {
    // From the boss to the arena edge along its heading.
    const dx = this.pos.x - this.arena.x
    const dz = this.pos.z - this.arena.z
    const b = dx * this.dir.x + dz * this.dir.z
    const c = dx * dx + dz * dz - this.arena.r * this.arena.r
    return Math.max(2, -b + Math.sqrt(Math.max(0, b * b - c)))
  }

  private feet(): V3 {
    return { x: this.pos.x, y: this.arena.y, z: this.pos.z }
  }

  private setAct(a: Act): void {
    this.act = a
    this.actT = 0
  }

  /* ── defeat & looks ──────────────────────────────────────── */

  /** Launched away from the player into a tumble. */
  protected onDefeat(): void {
    const p = this.ctx.player.position
    this.dir.set(this.pos.x - p.x, 0, this.pos.z - p.z)
    if (this.dir.lengthSq() < 1e-4) this.dir.set(0, 0, -1)
    this.dir.normalize()
    this.hazards.hideLane()
    this.act = 'idle'
    this.vy = 11
    this.spinX = 3.5
    this.spinZ = (Math.random() - 0.5) * 4
  }

  protected dying(dt: number, t: number): void {
    this.vy -= 22 * dt
    this.pos.addScaledVector(this.dir, 4 * dt)
    this.pos.y += this.vy * dt
    if (this.pos.y < this.arena.y && this.vy < 0) {
      this.pos.y = this.arena.y
      this.vy = -this.vy * 0.4
      this.sqv = -12
      this.ctx.fx.burst('land', this.feet(), { scale: 3, color: '#8b6bb8' })
    }
    this.clampToArena(this.pos, RADIUS)
    this.body.rotation.x += this.spinX * dt
    this.body.rotation.z += this.spinZ * dt
    if (t > 1.5) this.root.scale.setScalar(Math.max(0.05, 1 - (t - 1.5) * 2.2))
  }

  protected place(dt: number): void {
    // Squash & stretch spring with anticipation while crouching.
    const target = this.act === 'crouch' || this.act === 'windup' ? -0.22 : this.act === 'dazed' ? -0.08 : 0
    this.sqv += (-(this.sq - target) * 120 - this.sqv * 9) * dt
    this.sq = THREE.MathUtils.clamp(this.sq + this.sqv * dt, -0.45, 0.45)
    const t = this.ctx.clock.t
    const breathe = this.mode === 'sleep' ? Math.sin(t * 1.4) * 0.03 : this.act === 'idle' ? Math.sin(t * 2.6) * 0.03 : 0
    const shake = this.act === 'windup' ? Math.sin(t * 60) * 0.08 : 0
    const sy = 1 + this.sq + breathe
    const sxz = 1 - (this.sq + breathe) * 0.55
    this.root.position.set(this.pos.x + shake, this.pos.y, this.pos.z)
    this.root.rotation.y = this.yaw
    if (this.mode !== 'dying') {
      this.root.scale.set(1, 1, 1)
      this.body.rotation.set(this.act === 'dazed' ? -0.18 : this.act === 'charge' ? 0.22 : 0, 0, this.act === 'dazed' ? Math.sin(t * 3) * 0.08 : 0)
    }
    this.body.scale.set(SCALE * sxz, SCALE * sy, SCALE * sxz)
    this.crown.position.set(0, HEIGHT * sy * 0.97, 0)
    this.crown.rotation.copy(this.body.rotation)
    this.crown.rotation.y += Math.sin(t * 0.8) * 0.05

    // Eyes: asleep dim, dazed flickering, angry while attacking; hurt flash.
    const asleep = this.mode === 'sleep'
    const dazed = this.act === 'dazed'
    const angry = this.act === 'charge' || this.act === 'windup' || this.act === 'roar' || this.phase === 3 ? 1 : 0.3
    this.state.value.set(asleep ? 0.15 : dazed ? 0.4 + 0.3 * Math.sin(t * 9) : 1.3, this.flash, angry, 0)

    // Dizzy stars circle the crown while it is vulnerable.
    for (let i = 0; i < this.stars.length; i++) {
      const s = this.stars[i]
      s.visible = this.vulnerable && this.mode === 'fight'
      if (!s.visible) continue
      const a = t * 3 + (i / this.stars.length) * Math.PI * 2
      s.position.set(Math.cos(a) * 2.2, HEIGHT * sy + 1.1 + Math.sin(a * 2) * 0.2, Math.sin(a) * 2.2)
    }

    if (this.collider) this.ctx.collision.move(this.collider, this.pos.x, this.pos.y, this.pos.z, 0, Math.max(dt, 1e-3))
  }
}

function crownGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const n = 7
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const h = i % 2 ? 1.3 : 2.0
    const g = new THREE.ConeGeometry(0.32, h, 5)
    g.translate(0, h / 2, 0)
    g.rotateZ(-0.22)
    g.rotateY(-a)
    g.translate(Math.cos(a) * 1.15, -0.35, Math.sin(a) * 1.15)
    parts.push(g)
  }
  parts.push(new THREE.TorusGeometry(1.2, 0.16, 6, 20).rotateX(Math.PI / 2).translate(0, -0.3, 0))
  const merged = mergeGeometries(parts)!
  parts.forEach(p => p.dispose())
  return merged
}
