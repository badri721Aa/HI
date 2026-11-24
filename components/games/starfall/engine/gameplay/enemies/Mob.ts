/**
 * A factory mob: everything the six archetypes (and the sentry turret) share.
 *
 *   lifecycle   spawn (rises out of the ground, untouchable) → guard / hunt → dying (falls apart,
 *               then burns away) → gone. Despawn removes it at once.
 *   body        feet position, steering velocity + knockback, gravity when launched, walls and
 *               ledges (it never walks off a cliff or into deep water), separation from the others.
 *               A dynamic collider so the hero can't walk through it and can stomp on its head.
 *   combat      a weapon target of its own (swings, slams and arrows), a guard hook (shields),
 *               flinches, frost, the Healer's ward, the spin attack and stomps; damage numbers
 *               and sparks through 'enemy:hit'.
 *   looks       the dressed model, its puppet (locomotion picked from the speed unless an action
 *               plays), body language over the clips (BodyMotion: lean, flinch, breath, wind-ups),
 *               hurt flash, tints, a dissolve for deaths, LOD'd animation updates.
 *
 * Archetypes override think() (what to do while hunting) and optionally guard(), onDeath(),
 * draw() and decorate(); the numbers they use come from MOBS in defs.ts.
 */
import * as THREE from 'three'
import type { Collider, WallPush } from '../../collision'
import type { EnemyCue, V3 } from '../../events'
import type { Ctx, LiveEnemy, SpawnOptions, WeaponHit } from '../../types'
import { heightAt, waterLevelAt } from '../../world/heightfield'
import { supportHeight } from '../parts/util'
import type { Hazards } from '../../worlds/bosses/hazards'
import type { Beams } from './Beams'
import { BodyMotion } from './BodyMotion'
import { MOBS, type AnimName, type MobDef, type MobLikeKind, type MobTunes } from './defs'
import type { EnemyModel, PlayOpts } from './models'
import type { Projectiles } from './Projectiles'

/** What the factory lends its mobs. */
export interface MobHost {
  readonly ctx: Ctx
  readonly projectiles: Projectiles
  readonly beams: Beams
  readonly hazards: Hazards
  /** Live mobs (not dying), for healers, blasts and separation. */
  mobs(): readonly Mob[]
  /** Deploy a turret (Turret-Spawner). */
  deploy(owner: Mob, x: number, y: number, z: number): Mob | null
  /** Hearts and motes when a mob falls. */
  drop(x: number, y: number, z: number, def: MobDef): void
}

export type MobState = 'spawn' | 'guard' | 'hunt' | 'dying' | 'gone'

const GRAVITY = 24
const FRICTION = 7
const SPAWN_TIME = 1.35
const DEATH_HOLD = 1.25
const DISSOLVE_TIME = 0.85
const STOMP_DAMAGE = 40
const STOMP_LAUNCH = 11
const SPIN_DAMAGE = 30
const HIT_INVULN = 0.2
/** Beyond this distance a guard dozes (no thinking, no ground queries). */
const SLEEP_RANGE = 80
/** Animation update rate drops with distance (s between updates) and off screen. */
const LOD: ReadonlyArray<readonly [number, number]> = [[22, 0], [40, 1 / 30], [70, 1 / 15], [Infinity, 1 / 8]]

const _sphere = new THREE.Sphere()
const _frustum = new THREE.Frustum()
const _pv = new THREE.Matrix4()
let _frustumFrame = -1

export abstract class Mob implements LiveEnemy {
  readonly boss = false
  readonly phase = 1
  readonly position = new THREE.Vector3()
  readonly def: MobDef
  yaw = 0
  hp: number
  readonly maxHp: number
  state: MobState = 'spawn'
  /** Spawner group label. */
  readonly group: string
  /** Seconds since the last hit (HP bar). */
  lastHit = Infinity
  /** Healer's ward: seconds left. */
  ward = 0

  protected stateT = 0
  protected readonly ctx: Ctx
  protected readonly tune: MobTunes[MobLikeKind]
  protected vx = 0
  protected vz = 0
  protected vy = 0
  protected airborne = false
  /** Steering target velocity (m/s), set by think(). */
  protected wantX = 0
  protected wantZ = 0
  /** Facing target and turn-rate override for this frame. */
  protected faceYaw = 0
  protected acting = false
  protected flash = 0
  protected frost = 0
  protected invuln = 0
  /** Extra damage taken (dazed rushers, broken guards). */
  protected exposed = 1
  /** No flinch while committed (charging, casting). */
  protected poise = false
  /** Flinching: no new decisions for this long. */
  protected stagger = 0
  /** Mid-act and won't stop for losing the player (a lit fuse). */
  protected committed = false
  /** Player relation, refreshed each frame. */
  protected dist = Infinity
  protected dx = 0
  protected dz = 0
  protected dy = 0
  protected readonly home = new THREE.Vector3()
  protected readonly patrol: number
  protected readonly leash: number
  protected aggressive: boolean
  private ignoreT = 0
  private wanderT = 0
  private readonly wander = new THREE.Vector3()
  private collider: Collider | null = null
  private untarget: (() => void) | null = null
  private readonly body: BodyMotion
  private animAcc = 0
  private tint = new THREE.Vector4(1, 1, 1, 0)
  private spinCd = 0
  private deathT = 0
  private wasFrozen = false
  private owned: Array<{ dispose(): void }> = []
  private readonly push = { x: 0, y: 0, z: 0 }
  private readonly pushed = {} as WallPush
  private readonly from: V3 = { x: 0, y: 0, z: 0 }
  private readonly hitPos: V3 = { x: 0, y: 0, z: 0 }

  constructor(
    readonly uid: number,
    readonly kind: MobLikeKind,
    protected readonly host: MobHost,
    readonly model: EnemyModel,
    pos: V3,
    opts: SpawnOptions,
  ) {
    this.ctx = host.ctx
    this.def = MOBS[kind] as MobDef
    this.tune = this.def.tune
    this.maxHp = this.hp = this.def.stats.hp
    this.group = opts.group ?? ''
    this.aggressive = opts.aggressive ?? true
    this.patrol = opts.patrol ?? 4
    this.leash = opts.leash ?? 22
    this.position.set(pos.x, pos.y, pos.z)
    this.home.copy(this.position)
    const p = this.ctx.player.position
    this.yaw = this.faceYaw = opts.yaw ?? Math.atan2(p.x - pos.x, p.z - pos.z)
    model.root.position.copy(this.position)
    model.root.rotation.y = this.yaw
    this.ctx.scene.add(model.root)
    const s = this.def.stats
    this.body = new BodyMotion(model.body, s.mass, uid, s.walk <= 0)
    this.collider = this.ctx.collision.addCylinder({
      x: pos.x, y: pos.y, z: pos.z, r: s.radius * 0.9, h: s.height * 0.92, dynamic: true, surface: 'stone', tag: 'enemy',
      onLand: impact => this.stomped(impact),
    })
    this.untarget = this.ctx.enemies.addTarget({
      takeHit: h => this.takeHit(h),
      aimPoint: out => {
        if (!this.alive || this.state === 'spawn') return false
        out.set(this.position.x, this.position.y + s.height * 0.5, this.position.z)
        return true
      },
      engaged: () => this.state === 'hunt',
    })
    if (opts.instant) {
      this.setState(this.aggressive ? 'hunt' : 'guard')
      this.model.puppet.play(this.restAnim(), { fade: 0 })
    } else {
      this.model.puppet.play('spawn', { once: true, fade: 0 })
      this.model.skin.uDissolve.value = 0.9
      this.ctx.bus.emit('enemy:spawn', { pos: { x: pos.x, y: pos.y, z: pos.z }, kind, id: uid })
      this.ctx.fx.burst('dust', { x: pos.x, y: pos.y + 0.1, z: pos.z }, { scale: 1.2 + s.radius })
    }
  }

  /* ── LiveEnemy ───────────────────────────────────────────── */

  get alive(): boolean {
    return this.state !== 'dying' && this.state !== 'gone'
  }

  get hpFraction(): number {
    return this.maxHp > 0 ? this.hp / this.maxHp : 0
  }

  get radius(): number {
    return this.def.stats.radius
  }

  get height(): number {
    return this.def.stats.height
  }

  /** Taking blows (not during the entrance). */
  get hittable(): boolean {
    return this.state === 'guard' || this.state === 'hunt'
  }

  despawn(): void {
    if (this.state === 'gone') return
    this.state = 'gone'
    this.cleanup()
  }

  damage(amount: number): void {
    if (!this.alive) return
    this.applyDamage(Math.max(1, Math.round(amount)), this.position.x - Math.sin(this.yaw), this.position.z - Math.cos(this.yaw), 'fists', 0, 0)
  }

  /** Mend (Healer tether). */
  heal(amount: number): void {
    if (!this.alive) return
    this.hp = Math.min(this.maxHp, this.hp + amount)
  }

  /** Ward and haste from a Healer. */
  empower(seconds: number): void {
    if (this.alive) this.ward = Math.max(this.ward, seconds)
  }

  /* ── frame ───────────────────────────────────────────────── */

  update(dt: number, live: boolean): void {
    if (this.state === 'gone') return
    this.stateT += dt
    this.lastHit += dt
    this.flash = Math.max(0, this.flash - dt * 5)
    this.invuln = Math.max(0, this.invuln - dt)
    this.ignoreT = Math.max(0, this.ignoreT - dt)
    this.spinCd = Math.max(0, this.spinCd - dt)
    this.frost = Math.max(0, this.frost - dt)
    this.ward = Math.max(0, this.ward - dt)
    this.stagger = Math.max(0, this.stagger - dt)
    const pl = this.ctx.player
    const pp = pl.position
    this.dx = pp.x - this.position.x
    this.dz = pp.z - this.position.z
    this.dy = pp.y - this.position.y
    this.dist = Math.hypot(this.dx, this.dz)
    this.wantX = this.wantZ = 0

    switch (this.state) {
      case 'spawn': {
        const u = Math.min(1, this.stateT / 0.5)
        this.model.skin.uDissolve.value = 0.9 * (1 - u)
        if (this.stateT >= SPAWN_TIME || (this.model.puppet.done && this.stateT > 0.6)) {
          this.model.skin.uDissolve.value = 0
          // Up and ready: a last stretch that settles.
          this.body.pop(0.8)
          this.setState(this.aggressive ? 'hunt' : 'guard')
          this.onReady?.()
        }
        break
      }
      case 'guard':
        if (live && this.dist < SLEEP_RANGE) this.guardTick(dt)
        break
      case 'hunt':
        if (live && this.frost <= 0) {
          if (!this.committed && !this.canHunt()) {
            this.setState('guard')
            this.ignoreT = 2.5
            this.acting = false
            this.onCalm?.()
          } else {
            if (this.stagger <= 0) this.think(dt)
            this.spinCheck()
          }
        }
        break
      case 'dying':
        this.dying(dt)
        break
    }
    // think() may have blown it up.
    if ((this.state as MobState) === 'gone') return
    this.move(dt, live)
    this.animate(dt)
    this.draw?.(dt)
  }

  /* ── for archetypes ──────────────────────────────────────── */

  /** Behaviour while hunting the player. */
  protected abstract think(dt: number): void

  /** Damage multiplier for a blow before wards (shields block here); 1 when absent. */
  protected guard?(h: WeaponHit): number

  /** Every frame after moving (beams, glows). */
  protected draw?(dt: number): void

  /** The entrance is over. */
  protected onReady?(): void

  /** Lost the player (back to guarding). */
  protected onCalm?(): void

  /** Defeated (before the fall): bombs drop, tethers break. */
  protected onDeath?(byWeapon: boolean): void

  /** Something this mob made (a decal, a material) that goes when it does. */
  protected own<T extends { dispose(): void }>(o: T): T {
    this.owned.push(o)
    return o
  }

  /** A flinch interrupted whatever it was doing. */
  protected onFlinch?(): void

  /** Blown up by its own bomb: no fall, no remains. */
  protected explodeSelf(): void {
    if (!this.alive) return
    this.setState('dying')
    if (this.collider) this.collider.enabled = false
    this.untarget?.()
    this.untarget = null
    const p = this.position
    this.ctx.bus.emit('enemy:defeat', { pos: { x: p.x, y: p.y + this.height * 0.5, z: p.z }, big: true, kind: this.kind })
    this.state = 'gone'
    this.cleanup()
  }

  /** The loop to play when not acting: picked from the speed. */
  protected restAnim(): AnimName {
    return this.state === 'hunt' ? 'combat' : 'idle'
  }

  protected setState(s: MobState): void {
    this.state = s
    this.stateT = 0
  }

  /** Play an action; `acting` stays true until a one-shot ends (or forever for loops, until stopAct). */
  protected act(name: AnimName, o: PlayOpts = {}): void {
    this.acting = true
    this.model.puppet.play(name, { fade: 0.12, ...o, restart: o.restart ?? true })
  }

  protected stopAct(): void {
    this.acting = false
  }

  /** Anticipation for this frame of a wind-up (0..1): the body sinks and leans back, then throws itself into the strike when this stops. */
  protected coil(amount: number): void {
    this.body.windup(amount)
  }

  /** A kick through the body along (dx, dz) (a shot's recoil, a shove). */
  protected jolt(dx: number, dz: number, strength: number): void {
    this.body.flinch(dx, dz, this.yaw, strength)
  }

  /** Steer toward (x, z) at `speed`, stopping within `stop` metres. */
  protected seek(x: number, z: number, speed: number, stop = 0.3): void {
    const dx = x - this.position.x
    const dz = z - this.position.z
    const d = Math.hypot(dx, dz)
    if (d <= stop || d < 1e-4) return
    const k = (Math.min(speed, (d - stop) * 4) * this.haste) / d
    this.wantX += dx * k
    this.wantZ += dz * k
  }

  /** Hold the player between `near` and `far`, circling a little; true when in the band. */
  protected keepRange(near: number, far: number, speed: number, circle = 0.4): boolean {
    const d = Math.max(this.dist, 1e-3)
    const ux = this.dx / d
    const uz = this.dz / d
    let along = 0
    if (d < near) along = -1
    else if (d > far) along = 1
    const side = Math.sin(this.uid * 1.7 + this.ctx.clock.t * 0.35) > 0 ? 1 : -1
    const s = speed * this.haste
    this.wantX += (ux * along + -uz * side * circle) * s
    this.wantZ += (uz * along + ux * side * circle) * s
    return along === 0
  }

  protected faceTo(x: number, z: number): void {
    this.faceYaw = Math.atan2(x - this.position.x, z - this.position.z)
  }

  protected facePlayer(): void {
    this.faceYaw = Math.atan2(this.dx, this.dz)
  }

  protected cue(c: EnemyCue): void {
    this.ctx.bus.emit('enemy:cue', { pos: { x: this.position.x, y: this.position.y + this.height * 0.6, z: this.position.z }, cue: c, kind: this.kind })
  }

  /** The player is reachable: alive, in control and not far above or below. */
  protected playerOk(): boolean {
    const pl = this.ctx.player
    return pl.hp > 0 && pl.controlEnabled && pl.state !== 'dead' && Math.abs(this.dy) < 4.5
  }

  /** Hurt the player (if he isn't blinking or dashing) with a shove away from (fx, fz). */
  protected hurtPlayer(n: number, fx = this.position.x, fz = this.position.z): boolean {
    const pl = this.ctx.player
    if (pl.invulnerable || pl.hp <= 0 || !pl.controlEnabled || pl.state === 'dash') return false
    this.from.x = fx
    this.from.y = this.position.y + this.height * 0.4
    this.from.z = fz
    pl.hurt(n, this.from)
    return true
  }

  /** Is the player in front (within `arc` radians of the facing) and within `range`? */
  protected inFront(range: number, arc: number): boolean {
    if (this.dist > range + this.ctx.player.radius || Math.abs(this.dy) > 2) return false
    const a = Math.atan2(this.dx, this.dz)
    return Math.abs(wrap(a - this.yaw)) <= arc
  }

  /** World position of a bone or gear node (falls back to chest height). */
  protected nodePos(name: string, out: THREE.Vector3): THREE.Vector3 {
    const n = this.model.bone(name)
    if (n) return n.getWorldPosition(out)
    return out.set(this.position.x, this.position.y + this.height * 0.7, this.position.z)
  }

  /** Ground height under (x, z) near this mob's feet. */
  protected groundAt(x: number, z: number, from = this.position.y): number {
    return supportHeight(this.ctx, x, z, from + 0.6, this.radius * 0.5, 0.45, 'enemy')
  }

  /** Can it stand at (x, z)? (No cliffs, no deep water, no voids.) */
  protected walkable(x: number, z: number): boolean {
    const g = this.groundAt(x, z)
    if (Math.abs(g - this.position.y) > 1.1) return false
    return waterLevelAt(x, z) - g < 0.35
  }

  protected get haste(): number {
    return this.ward > 0 && this.kind !== 'turret' ? 1.25 : 1
  }

  /* ── internals ───────────────────────────────────────────── */

  private canHunt(): boolean {
    if (!this.playerOk()) return false
    if (this.aggressive) return this.dist < Math.max(this.leash, 60)
    const homeD = Math.hypot(this.ctx.player.position.x - this.home.x, this.ctx.player.position.z - this.home.z)
    return homeD < this.leash && this.dist < this.leash + 4
  }

  private guardTick(dt: number): void {
    const s = this.def.stats
    if (this.ignoreT <= 0 && this.playerOk() && this.dist < s.sight) {
      const homeD = Math.hypot(this.ctx.player.position.x - this.home.x, this.ctx.player.position.z - this.home.z)
      if (this.aggressive || homeD < this.leash - 1) {
        this.setState('hunt')
        this.facePlayer()
        this.ctx.bus.emit('enemy:alert', { pos: { x: this.position.x, y: this.position.y + s.height, z: this.position.z } })
        this.cue(this.def.alert)
        return
      }
    }
    if (s.walk <= 0) return
    // Wander near home; walk back if pushed away.
    const away = Math.hypot(this.position.x - this.home.x, this.position.z - this.home.z)
    this.wanderT -= dt
    if (away > this.patrol + 1.5) {
      this.seek(this.home.x, this.home.z, s.walk)
      this.faceTo(this.home.x, this.home.z)
    } else if (this.wanderT <= 0) {
      this.wanderT = 2.5 + ((this.uid * 7919) % 100) / 40
      const a = (this.uid * 2.39996 + this.ctx.clock.t * 0.37) % (Math.PI * 2)
      const r = this.patrol * (0.3 + (((this.uid * 31) % 10) / 10) * 0.7)
      this.wander.set(this.home.x + Math.sin(a) * r, 0, this.home.z + Math.cos(a) * r)
    } else if (this.wanderT < 1.6) {
      this.seek(this.wander.x, this.wander.z, s.walk * 0.6, 0.5)
      this.faceTo(this.wander.x, this.wander.z)
    }
  }

  /** Steering, knockback, gravity, walls, ledges and the collider. */
  private move(dt: number, live: boolean): void {
    const s = this.def.stats
    const frozen = this.frost > 0
    const steer = this.state === 'guard' || this.state === 'hunt'
    if (steer && !frozen && live) {
      // Separation: don't stack on other mobs.
      for (const o of this.host.mobs()) {
        if (o === this) continue
        const ox = this.position.x - o.position.x
        const oz = this.position.z - o.position.z
        const min = this.radius + o.radius + 0.25
        const d2 = ox * ox + oz * oz
        if (d2 > min * min || d2 < 1e-6) continue
        const d = Math.sqrt(d2)
        const k = ((min - d) / min) * 3.5
        this.wantX += (ox / d) * k
        this.wantZ += (oz / d) * k
      }
      const a = 1 - Math.exp(-s.accel * dt)
      this.vx += (this.wantX - this.vx) * a
      this.vz += (this.wantZ - this.vz) * a
    } else {
      const f = Math.exp(-FRICTION * dt)
      this.vx *= f
      this.vz *= f
    }
    // Face the steering target (or the movement).
    if (!frozen && this.state !== 'dying') {
      const want = this.faceYaw
      const d = wrap(want - this.yaw)
      const step = s.turn * this.haste * dt
      this.yaw += Math.abs(d) <= step ? d : Math.sign(d) * step
    }
    const p = this.position
    if (s.walk <= 0 && !this.airborne) {
      this.vx = this.vz = 0
    }
    const nx = p.x + this.vx * dt
    const nz = p.z + this.vz * dt
    if (this.vx !== 0 || this.vz !== 0) {
      if (this.airborne || this.walkable(nx, nz)) {
        p.x = nx
        p.z = nz
      } else {
        this.vx *= 0.2
        this.vz *= 0.2
      }
      // Out of walls and props (not out of itself).
      if (this.collider) this.collider.enabled = false
      this.push.x = p.x
      this.push.y = p.y
      this.push.z = p.z
      this.ctx.collision.pushOut(this.push, this.radius * 0.85, this.height * 0.9, 0.45, this.pushed)
      p.x = this.push.x
      p.z = this.push.z
      if (this.collider) this.collider.enabled = this.alive
    }
    const ground = this.groundAt(p.x, p.z, p.y + (this.airborne ? 0.4 : 0))
    if (this.airborne) {
      this.vy -= GRAVITY * dt
      p.y += this.vy * dt
      if (p.y <= ground && this.vy <= 0) {
        p.y = ground
        this.vy = 0
        this.airborne = false
        if (this.state !== 'dying') this.ctx.fx.burst('dust', { x: p.x, y: ground, z: p.z }, { count: 4, scale: 0.7 })
      }
    } else if (ground < p.y - 1.4) {
      // Shoved off a ledge: fall.
      this.airborne = true
    } else {
      p.y += (ground - p.y) * Math.min(1, dt * 18)
    }
    // Fell into the void or the sea: gone.
    if (p.y < heightAt(p.x, p.z) - 6 || (this.airborne && p.y < this.home.y - 30) || p.y < waterLevelAt(p.x, p.z) - 1.2) {
      if (this.alive) this.die(false)
      else if (this.state === 'dying') this.deathT = DEATH_HOLD
    }
    this.model.root.position.copy(p)
    this.model.root.rotation.y = this.yaw
    if (this.collider) this.ctx.collision.move(this.collider, p.x, p.y, p.z, 0, Math.max(dt, 1e-3))
  }

  private animate(dt: number): void {
    const pup = this.model.puppet
    const st = this.def.stats
    if (this.state === 'guard' || this.state === 'hunt') {
      if (this.acting && pup.done) this.acting = false
      if (!this.acting) {
        const sp = Math.hypot(this.vx, this.vz)
        let anim: AnimName = this.restAnim()
        let speed = 1
        if (st.run > 0 && sp > st.walk * 1.15) {
          anim = 'run'
          speed = THREE.MathUtils.clamp(sp / (st.run * 0.9), 0.75, 1.5)
        } else if (sp > 0.35) {
          anim = 'walk'
          speed = THREE.MathUtils.clamp(sp / Math.max(0.5, st.walk), 0.6, 1.6)
        }
        pup.play(anim, { fade: 0.22, speed })
      }
    }
    this.body.update(dt, this.vx, this.vz, this.yaw, this.frost > 0 || this.state === 'dying')
    if (this.frost > 0) {
      pup.setSpeed(0)
      this.wasFrozen = true
    } else if (this.wasFrozen) {
      pup.setSpeed(1)
      this.wasFrozen = false
    }
    // Animation LOD: far and off-screen mobs update their skeletons less often.
    this.animAcc += dt
    const cam = this.ctx.camera
    const camD = cam.position.distanceTo(this.position)
    let every = 0
    for (const [d, e] of LOD) {
      if (camD < d) {
        every = e
        break
      }
    }
    if (!this.onScreen()) every = Math.max(every, 1 / 6)
    if (this.ctx.quality.level === 'low') every = every ? every * 1.5 : camD > 14 ? 1 / 30 : 0
    if (this.animAcc >= every) {
      pup.update(this.animAcc)
      this.animAcc = 0
    }
    // Shading: hurt flash, ward gold, frost blue, eyes brighten while hunting.
    const sk = this.model.skin
    sk.uFlash.value = this.flash
    if (this.frost > 0) this.tint.set(0.62, 0.86, 1, Math.min(0.75, this.frost * 2))
    else if (this.ward > 0) this.tint.set(1, 0.84, 0.35, 0.28 + 0.12 * Math.sin(this.ctx.clock.t * 6))
    else this.tint.w = Math.max(0, this.tint.w - dt * 3)
    this.decorate?.(this.tint)
    sk.uTint.value.copy(this.tint)
    const glow = this.state === 'hunt' ? 1.25 : this.state === 'dying' ? 0.2 : 0.9
    sk.uGlow.value += (glow - sk.uGlow.value) * Math.min(1, dt * 6)
    this.model.setShadows(this.ctx.quality.shadows && this.state !== 'dying')
  }

  /** Archetype tint override (fuses flashing red, charge glows). */
  protected decorate?(tint: THREE.Vector4): void

  private onScreen(): boolean {
    const frame = this.ctx.renderer.info.render.frame
    if (_frustumFrame !== frame) {
      _frustumFrame = frame
      const cam = this.ctx.camera
      _frustum.setFromProjectionMatrix(_pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse))
    }
    _sphere.center.set(this.position.x, this.position.y + this.height * 0.5, this.position.z)
    _sphere.radius = this.height
    return _frustum.intersectsSphere(_sphere)
  }

  private spinCheck(): void {
    const pl = this.ctx.player
    if (!pl.attacking || this.spinCd > 0 || this.dist > 1.9 + this.radius || Math.abs(this.dy) > 1.6) return
    this.spinCd = 0.5
    this.applyDamage(SPIN_DAMAGE, pl.position.x, pl.position.z, 'fists', 6, 3)
  }

  private stomped(impact: number): void {
    if (!this.hittable || impact < 2) return
    const p = this.ctx.player.position
    this.ctx.player.launch(STOMP_LAUNCH)
    this.ctx.bus.emit('enemy:stomp', { pos: { x: p.x, y: p.y, z: p.z } })
    this.applyDamage(STOMP_DAMAGE, p.x, p.z, 'fists', 0, 0)
    this.body.pop(-1.3)
  }

  /** A weapon blow (the IEnemies target). */
  private takeHit(h: WeaponHit): boolean {
    if (!this.hittable) return false
    const r = h.radius + this.radius
    const c = h.center
    const dx = c.x - this.position.x
    const dz = c.z - this.position.z
    const top = this.position.y + this.height
    if (dx * dx + dz * dz > r * r || c.y < this.position.y - h.radius || c.y > top + h.radius) return false
    if (this.invuln > 0) return true
    const mult = this.guard?.(h) ?? 1
    if (mult <= 0) return true
    const dmg = Math.max(1, Math.round(h.damage * mult * (0.92 + Math.random() * 0.16)))
    if (h.freeze && this.hp - dmg * this.exposed > 0) this.frost = Math.max(this.frost, h.freeze)
    this.applyDamage(dmg, h.from.x, h.from.z, h.weapon, h.knock * (mult < 0.5 ? 0.3 : 1), h.lift)
    return true
  }

  private applyDamage(raw: number, fromX: number, fromZ: number, weapon: WeaponHit['weapon'], knock: number, lift: number): void {
    const ward = this.ward > 0 ? 1 - (MOBS.healer.tune.ward) : 1
    const dmg = Math.max(1, Math.round(raw * this.exposed * ward))
    this.hp = Math.max(0, this.hp - dmg)
    this.flash = 1
    this.lastHit = 0
    this.invuln = HIT_INVULN
    const killed = this.hp <= 0
    this.hitPos.x = this.position.x
    this.hitPos.y = this.position.y + this.height * 0.75
    this.hitPos.z = this.position.z
    this.ctx.bus.emit('enemy:hit', { pos: { x: this.hitPos.x, y: this.hitPos.y, z: this.hitPos.z }, damage: dmg, killed, big: false, weapon })
    // Knockback along the blow, lighter on heavy bodies.
    let kx = this.position.x - fromX
    let kz = this.position.z - fromZ
    const l = Math.hypot(kx, kz)
    if (l > 1e-3) {
      kx /= l
      kz /= l
    } else {
      kx = -Math.sin(this.yaw)
      kz = -Math.cos(this.yaw)
    }
    const mass = this.def.stats.mass
    if (this.def.stats.walk > 0) {
      const k = (killed ? knock * 0.6 : Math.min(4, knock * 0.25)) / mass
      this.vx += kx * k
      this.vz += kz * k
      if (killed && lift > 0) {
        this.vy = Math.min(9, lift * 0.55) / Math.sqrt(mass)
        this.airborne = true
      }
    }
    // The blow rocks the body along it (less through a braced one).
    this.body.flinch(kx, kz, this.yaw, killed ? 1.5 : this.poise ? 0.45 : 1)
    if (killed) {
      this.die(true)
      return
    }
    if (this.state === 'guard') {
      this.setState('hunt')
      this.facePlayer()
    }
    if (!this.poise && this.frost <= 0) {
      this.act('hit', { once: true })
      this.stagger = 0.32
      this.onFlinch?.()
    }
  }

  private die(byWeapon: boolean): void {
    if (!this.alive) return
    this.onDeath?.(byWeapon)
    this.setState('dying')
    this.deathT = 0
    this.acting = false
    this.frost = 0
    this.ward = 0
    if (this.collider) this.collider.enabled = false
    this.untarget?.()
    this.untarget = null
    const p = this.position
    this.ctx.bus.emit('enemy:defeat', { pos: { x: p.x, y: p.y + this.height * 0.5, z: p.z }, big: this.def.stats.mass > 2, kind: this.kind })
    this.ctx.game.shake(0.18, 0.15)
    this.host.drop(p.x, p.y, p.z, this.def)
    this.model.puppet.play('death', { once: true, fade: 0.08, restart: true })
  }

  private dying(dt: number): void {
    this.deathT += dt
    if (this.deathT > DEATH_HOLD) {
      const u = (this.deathT - DEATH_HOLD) / DISSOLVE_TIME
      this.model.skin.uDissolve.value = Math.min(1.05, u * 1.05)
      if (u >= 1) {
        this.state = 'gone'
        this.cleanup()
      }
    }
  }

  private cleanup(): void {
    this.untarget?.()
    this.untarget = null
    if (this.collider) this.ctx.collision.remove(this.collider)
    this.collider = null
    this.model.dispose()
    for (const o of this.owned) o.dispose()
    this.owned = []
  }
}

export function wrap(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a))
}

