/**
 * Gloomlings — squashy dark-purple jelly blobs with glowing eyes.
 *
 * Movement is a chain of discrete hops (crouch → airborne arc → land) driven by
 * a small state machine: idle → wander within the patrol radius → notice the
 * player (alert hop) → chase → give up and return home. A damped spring on top
 * of the hop gives the jelly its squash & stretch wobble.
 *
 * Weapon kills launch the body instead: a cheap rigid tumble (spin, bounce, squash on each
 * impact) before it pops.
 *
 * Rendering: one InstancedMesh for every body (eyes, horns and grin are part of
 * the merged geometry; per-instance eye glow / hurt flash via an instanced
 * attribute), one batch of eye glows and one of soft blob shadows.
 */
import * as THREE from 'three'
import type { MusicMood, V3 } from '../events'
import type { Ctx, IEnemies, WeaponHit } from '../types'
import { ENEMIES } from '../world/level'
import { heightAt, waterLevelAt } from '../world/heightfield'
import { Billboards } from './parts/Billboards'
import { GLOOM_HEIGHT, gloomlingGeometry } from './parts/shapes'
import { glowTexture, rng, supportHeight } from './parts/util'

const IDLE = 0
const WANDER = 1
const ALERT = 2
const CHASE = 3
const RETURN = 4
const STUN = 5
const DYING = 6
const DEAD = 7
/** Launched by a weapon: tumbling through the air, then pops. */
const TUMBLE = 8

const REST = 0
const CROUCH = 1
const AIR = 2

const NOTICE_RANGE = 9
const NOTICE_DY = 3
const LEASH = 14
const CHASE_SPEED = 3.2
const CHASE_SPEED_BIG = 2.6
const WANDER_SPEED = 1.5
const RETURN_SPEED = 2.2
const MAX_WADE = 0.3
const CONTACT_COOLDOWN = 1
const DEATH_TIME = 0.34
/** Hit points; a stomp or a spin takes STOMP_DAMAGE (small ones pop, big ones survive the first). */
const HP_SMALL = 30
const HP_BIG = 60
const STOMP_DAMAGE = 30
/** Body radius for weapon hits (m, scale 1). */
const BODY_RADIUS = 0.45
const TUMBLE_GRAVITY = 20
const TUMBLE_BOUNCE = 0.45
/** A launched gloomling pops after this long, or once it has bounced itself out. */
const TUMBLE_TIME = 2.4
const CALM_DELAY = 4
/** Beyond this distance from the player gloomlings doze (no AI, no ground queries). */
const SLEEP_RANGE = 90

const EYE_LOCAL = [
  new THREE.Vector3(-0.165, 0.5, 0.47),
  new THREE.Vector3(0.165, 0.5, 0.47),
]

interface Gloom {
  index: number
  big: boolean
  scale: number
  hp: number
  maxHp: number
  homeX: number
  homeZ: number
  patrol: number
  x: number
  y: number
  z: number
  yaw: number
  targetYaw: number
  state: number
  stateT: number
  idleFor: number
  tx: number
  tz: number
  hop: number
  hopT: number
  hopDur: number
  restFor: number
  hopH: number
  sx: number
  sy: number
  sz: number
  lx: number
  ly: number
  lz: number
  /** Spring: squash (−) / stretch (+). */
  sq: number
  sqv: number
  hitCd: number
  invuln: number
  flash: number
  eye: number
  anger: number
  blinkIn: number
  blinkT: number
  ignoreT: number
  deathT: number
  /** The alert hop has started (landing from it begins the chase). */
  alertHop: boolean
  /** Tumble: velocity (m/s), body pitch/roll (rad) and their spin rates, bounces so far. */
  vx: number
  vy: number
  vz: number
  rx: number
  rz: number
  wx: number
  wz: number
  bounces: number
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

export class Enemies implements IEnemies {
  frozen = false

  private list: Gloom[] = []
  private body: THREE.InstancedMesh | null = null
  private shadows: THREE.InstancedMesh | null = null
  private stateAttr: THREE.InstancedBufferAttribute | null = null
  private eyes: Billboards | null = null
  private glowTex: { texture: THREE.Texture; owned: boolean } | null = null
  private unsubs: Array<() => void> = []
  private random = rng(0x6100b)
  /** The mood actually playing (tracked from the bus, whoever set it). */
  private mood: MusicMood = 'title'
  private calmT = 0
  private prevFeet = 0

  // scratch
  private readonly m = new THREE.Matrix4()
  private readonly q = new THREE.Quaternion()
  private readonly e = new THREE.Euler(0, 0, 0, 'YXZ')
  private readonly p = new THREE.Vector3()
  private readonly s = new THREE.Vector3()
  private readonly v = new THREE.Vector3()
  private readonly push = { x: 0, y: 0, z: 0 }
  private readonly from: V3 = { x: 0, y: 0, z: 0 }

  constructor(private ctx: Ctx) {}

  init(): void {
    const ctx = this.ctx
    this.list = ENEMIES.map((sp, index) => {
      const scale = sp.big ? 1.6 : 1
      const y = supportHeight(ctx, sp.x, sp.z, heightAt(sp.x, sp.z) + 0.3, 0.5 * scale)
      const yaw = this.random() * Math.PI * 2
      return {
        index, big: !!sp.big, scale, hp: sp.big ? HP_BIG : HP_SMALL, maxHp: sp.big ? HP_BIG : HP_SMALL,
        homeX: sp.x, homeZ: sp.z, patrol: sp.patrol,
        x: sp.x, y, z: sp.z, yaw, targetYaw: yaw,
        state: IDLE, stateT: 0, idleFor: 0.5 + this.random() * 2, tx: sp.x, tz: sp.z,
        hop: REST, hopT: 0, hopDur: 0, restFor: 0, hopH: 0,
        sx: sp.x, sy: y, sz: sp.z, lx: sp.x, ly: y, lz: sp.z,
        sq: 0, sqv: 0, hitCd: 0, invuln: 0, flash: 0, eye: 1, anger: 0,
        blinkIn: 1 + this.random() * 4, blinkT: 0, ignoreT: 0, deathT: 0, alertHop: false,
        vx: 0, vy: 0, vz: 0, rx: 0, rz: 0, wx: 0, wz: 0, bounces: 0,
      }
    })

    const geo = gloomlingGeometry()
    this.stateAttr = new THREE.InstancedBufferAttribute(new Float32Array(this.list.length * 3), 3).setUsage(THREE.DynamicDrawUsage)
    geo.setAttribute('aState', this.stateAttr)
    const body = new THREE.InstancedMesh(geo, gloomMaterial(), this.list.length)
    body.name = 'gloomlings'
    body.castShadow = true
    body.receiveShadow = true
    body.frustumCulled = false
    this.body = body

    const shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
    const shadows = new THREE.InstancedMesh(shadowGeo, blobShadowMaterial(), this.list.length)
    shadows.name = 'gloomling-shadows'
    shadows.frustumCulled = false
    shadows.renderOrder = 1
    this.shadows = shadows

    this.glowTex = glowTexture(ctx)
    this.eyes = new Billboards(this.list.length * 2, this.glowTex.texture, { bias: 0.5, name: 'gloomling-eyes' })
    this.eyes.alloc(this.list.length * 2)
    const eye = new THREE.Color('#ffc93c')
    for (let i = 0; i < this.list.length * 2; i++) this.eyes.set(i, 0, 0, 0, 0, eye.r, eye.g, eye.b, 0.5)

    ctx.scene.add(shadows, body, this.eyes.mesh)

    const calm = () => {
      for (const g of this.list) {
        if (g.state === CHASE || g.state === ALERT || g.state === STUN) this.setState(g, RETURN)
        g.ignoreT = 2.5
      }
    }
    this.unsubs.push(
      ctx.bus.on('player:died', calm),
      ctx.bus.on('player:respawn', calm),
      ctx.bus.on('audio:music', e => {
        this.mood = e.mood
        this.calmT = 0
      }),
    )
    this.prevFeet = ctx.player.position.y
    this.render()
  }

  /* ── API ─────────────────────────────────────────────────── */

  syncWithSave(): void {
    const defeated = new Set(this.ctx.game.save.enemies)
    for (const g of this.list) {
      g.hp = g.maxHp
      g.x = g.sx = g.lx = g.tx = g.homeX
      g.z = g.sz = g.lz = g.tz = g.homeZ
      g.y = g.sy = g.ly = supportHeight(this.ctx, g.x, g.z, heightAt(g.x, g.z) + 0.3, 0.5 * g.scale)
      g.hop = REST
      g.sq = g.sqv = g.flash = g.hitCd = g.invuln = g.ignoreT = 0
      g.anger = 0
      g.eye = 1
      this.setState(g, defeated.has(g.index) ? DEAD : IDLE)
    }
    this.calmT = 0
    this.prevFeet = this.ctx.player.position.y
    this.render()
  }

  aliveNear(p: V3, radius: number): number {
    let n = 0
    const r2 = radius * radius
    for (const g of this.list) {
      if (!this.alive(g)) continue
      const dx = g.x - p.x
      const dy = g.y - p.y
      const dz = g.z - p.z
      if (dx * dx + dy * dy + dz * dz < r2) n++
    }
    return n
  }

  hit(h: WeaponHit): number {
    const max = h.max ?? Infinity
    const c = h.center
    let n = 0
    for (const g of this.list) {
      if (n >= max) break
      if (!this.alive(g) || g.invuln > 0) continue
      const r = h.radius + BODY_RADIUS * g.scale
      const dx = g.x - c.x
      const dy = g.y + 0.5 * GLOOM_HEIGHT * g.scale - c.y
      const dz = g.z - c.z
      if (dx * dx + dy * dy + dz * dz > r * r) continue
      n++
      this.weaponHit(g, h)
    }
    return n
  }

  nearest(p: V3, radius: number, out: THREE.Vector3): boolean {
    let best = radius * radius
    let found: Gloom | null = null
    for (const g of this.list) {
      if (!this.alive(g) || Math.abs(g.y - p.y) > 2.5) continue
      const d = (g.x - p.x) ** 2 + (g.z - p.z) ** 2
      if (d < best) {
        best = d
        found = g
      }
    }
    if (found) out.set(found.x, found.y, found.z)
    return !!found
  }

  /* ── frame ───────────────────────────────────────────────── */

  update(dt: number): void {
    if (!this.body) return
    const ctx = this.ctx
    const player = ctx.player
    const pp = player.position
    const playing = ctx.game.phase === 'playing'
    const active = playing && !this.frozen
    // Dead, drowning or respawning (the body may still be tumbling as a ragdoll): nothing to chase.
    const playerAlive = player.hp > 0 && player.controlEnabled && player.state !== 'dead'
    let feetPrev = this.prevFeet
    if (Math.abs(pp.y - feetPrev) > 3) feetPrev = pp.y
    let chasing = 0

    for (const g of this.list) {
      if (g.state === DEAD) continue
      g.stateT += dt
      g.hitCd = Math.max(0, g.hitCd - dt)
      g.invuln = Math.max(0, g.invuln - dt)
      g.ignoreT = Math.max(0, g.ignoreT - dt)
      g.flash = Math.max(0, g.flash - dt * 5)

      if (g.state === DYING) {
        g.deathT += dt
        if (g.deathT >= DEATH_TIME) this.setState(g, DEAD)
        continue
      }
      if (g.state === TUMBLE) {
        this.tumble(g, dt)
        continue
      }

      const dx = pp.x - g.x
      const dz = pp.z - g.z
      const pd = Math.hypot(dx, dz)
      const asleep = pd > SLEEP_RANGE && g.hop === REST && (g.state === IDLE || g.state === WANDER)

      if (active && !asleep) {
        this.think(g, pd, playerAlive)
        if (this.interact(g, pd, feetPrev)) continue
      }
      if (!asleep) this.move(g, dt, active)
      if (g.state === CHASE || g.state === ALERT) chasing++

      // facing
      g.yaw += wrap(g.targetYaw - g.yaw) * Math.min(1, dt * 9)
      // eyes: blink + anger
      g.blinkIn -= dt
      if (g.blinkIn <= 0) {
        g.blinkT = 0.13
        g.blinkIn = 2.2 + this.random() * 3.5
      }
      g.blinkT = Math.max(0, g.blinkT - dt)
      const angry = g.state === CHASE || g.state === ALERT ? 1 : 0
      g.anger += (angry - g.anger) * Math.min(1, dt * 4)
      const eyeTarget = g.state === STUN ? 0.35 : 1 + g.anger * 0.6
      g.eye += (eyeTarget - g.eye) * Math.min(1, dt * 6)
    }

    this.updateMusic(dt, chasing, playing)
    this.prevFeet = pp.y
    this.render()
  }

  /** Decide what to do next (state transitions that don't depend on the hop cycle). */
  private think(g: Gloom, pd: number, playerAlive: boolean): void {
    const pp = this.ctx.player.position
    const homeD = Math.hypot(pp.x - g.homeX, pp.z - g.homeZ)
    const selfHome = Math.hypot(g.x - g.homeX, g.z - g.homeZ)
    switch (g.state) {
      case IDLE:
      case WANDER:
        if (playerAlive && g.ignoreT <= 0 && pd < NOTICE_RANGE && Math.abs(pp.y - g.y) < NOTICE_DY && homeD < LEASH - 1) {
          this.setState(g, ALERT)
          g.targetYaw = Math.atan2(pp.x - g.x, pp.z - g.z)
          g.alertHop = false
          if (g.hop === REST) g.restFor = 0
          this.ctx.bus.emit('enemy:alert', { pos: { x: g.x, y: g.y + GLOOM_HEIGHT * g.scale, z: g.z } })
        }
        break
      case CHASE:
        if (!playerAlive || selfHome > LEASH || homeD > LEASH + 2 || pd > LEASH + 2) {
          this.setState(g, RETURN)
          g.ignoreT = 2
        }
        break
      case RETURN:
        if (selfHome < 1) this.setState(g, IDLE)
        break
    }
  }

  /** Stomps, spin hits and contact damage. Returns true when the gloomling was defeated. */
  private interact(g: Gloom, pd: number, feetPrev: number): boolean {
    const player = this.ctx.player
    const pp = player.position
    const sc = g.scale
    const top = g.y + GLOOM_HEIGHT * sc
    if (pd > 2.5 * sc) return false

    if (player.stompSpeed > 1.5 && pd < 0.9 * sc && pp.y <= top + 0.4 && feetPrev >= top - 0.35 && g.invuln <= 0) {
      player.launch(11)
      this.ctx.bus.emit('enemy:stomp', { pos: { x: g.x, y: top, z: g.z } })
      g.sqv -= 9
      return this.damage(g, STOMP_DAMAGE, pp.x, pp.z, false)
    }
    if (player.attacking && pd < 1.9 + (sc - 1) * 0.5 && Math.abs(pp.y - g.y) < 1.6 && g.invuln <= 0) {
      return this.damage(g, STOMP_DAMAGE, pp.x, pp.z, true)
    }
    const dashing = player.state === 'dash'
    if (pd < 0.9 * sc && pp.y < top - 0.25 && pp.y + player.height > g.y && g.hitCd <= 0 && !player.invulnerable && !player.attacking && !dashing) {
      this.from.x = g.x
      this.from.y = g.y + 0.4 * sc
      this.from.z = g.z
      player.hurt(1, this.from)
      g.hitCd = CONTACT_COOLDOWN
      g.sqv -= 4
      // Recoil: a short pause so the player can get away.
      if (g.hop === REST) g.restFor = Math.max(g.restFor, g.hopT + 0.6)
    }
    return false
  }

  /** Apply a stomp or spin hit: flattens and pops when defeated. Returns true when defeated. */
  private damage(g: Gloom, amount: number, fromX: number, fromZ: number, knock: boolean): boolean {
    g.hp -= amount
    g.flash = 1
    if (g.hp <= 0) {
      this.setState(g, DYING)
      g.deathT = 0
      const pos = { x: g.x, y: g.y + 0.45 * g.scale, z: g.z }
      this.ctx.bus.emit('enemy:defeat', { pos, big: g.big })
      this.ctx.game.defeatEnemy(g.index)
      this.ctx.game.shake(g.big ? 0.35 : 0.2, 0.18)
      return true
    }
    g.invuln = 0.6
    this.setState(g, STUN)
    if (!knock) {
      if (g.hop === REST) g.restFor = g.hopT + 0.5
    } else {
      let kx = g.x - fromX
      let kz = g.z - fromZ
      const l = Math.hypot(kx, kz) || 1
      kx /= l
      kz /= l
      this.startHop(g, g.x + kx * 2.2, g.z + kz * 2.2, 0.36, 0.5, true)
    }
    return false
  }

  /** A weapon blow: damage numbers, then either a knockback hop or a launch into a tumble. */
  private weaponHit(g: Gloom, h: WeaponHit): void {
    const dmg = Math.max(1, Math.round(h.damage * (0.9 + this.random() * 0.2)))
    g.hp -= dmg
    g.flash = 1
    let kx = g.x - h.from.x
    let kz = g.z - h.from.z
    const l = Math.hypot(kx, kz)
    if (l > 1e-3) {
      kx /= l
      kz /= l
    } else {
      kx = Math.sin(g.yaw)
      kz = Math.cos(g.yaw)
    }
    const killed = g.hp <= 0
    const pos = { x: g.x, y: g.y + 0.7 * GLOOM_HEIGHT * g.scale, z: g.z }
    this.ctx.bus.emit('enemy:hit', { pos, damage: dmg, killed, big: g.big, weapon: h.weapon })
    if (!killed) {
      g.invuln = 0.3
      this.setState(g, STUN)
      // A short shove, so a sword combo can keep connecting.
      const push = Math.min(3, h.knock * 0.15)
      this.startHop(g, g.x + kx * push, g.z + kz * push, 0.36, 0.5, true)
      return
    }
    this.ctx.game.defeatEnemy(g.index)
    // Heavier bodies fly less far.
    const k = 1 / Math.sqrt(g.scale)
    g.vx = kx * h.knock * k
    g.vz = kz * h.knock * k
    g.vy = h.lift * k
    const spin = 5 + h.knock * 0.6
    g.wx = spin * (0.6 + this.random() * 0.6)
    g.wz = spin * (this.random() - 0.5) * 1.4
    g.rx = g.rz = 0
    g.bounces = 0
    g.deathT = 0
    g.hop = REST
    g.sqv += 6
    this.setState(g, TUMBLE)
  }

  /** Ballistic tumble: spins, bounces with a squash on each landing, then pops. */
  private tumble(g: Gloom, dt: number): void {
    g.deathT += dt
    g.vy -= TUMBLE_GRAVITY * dt
    g.x += g.vx * dt
    g.y += g.vy * dt
    g.z += g.vz * dt
    g.rx += g.wx * dt
    g.rz += g.wz * dt
    g.sqv += (-g.sq * 200 - g.sqv * 9) * dt
    g.sq = THREE.MathUtils.clamp(g.sq + g.sqv * dt, -0.6, 0.6)
    const ground = supportHeight(this.ctx, g.x, g.z, g.y + 0.5, 0.3 * g.scale)
    if (g.y < ground && g.vy < 0) {
      const impact = -g.vy
      g.y = ground
      g.vy = impact * TUMBLE_BOUNCE
      g.vx *= 0.62
      g.vz *= 0.62
      g.wx *= 0.55
      g.wz *= 0.55
      g.sq = -Math.min(0.55, 0.12 + impact * 0.04)
      g.sqv = 0
      g.bounces++
      if (impact > 4) this.ctx.fx.burst('dust', { x: g.x, y: ground, z: g.z }, { count: 4, scale: 0.8 * g.scale })
    }
    const wet = g.y < waterLevelAt(g.x, g.z) - 0.2
    const spent = g.bounces >= 4 || (g.bounces >= 2 && g.vy < 1.2)
    if (wet || spent || g.deathT >= TUMBLE_TIME) {
      this.ctx.bus.emit('enemy:defeat', { pos: { x: g.x, y: g.y + 0.45 * g.scale, z: g.z }, big: g.big })
      this.setState(g, DEAD)
    }
  }

  private alive(g: Gloom): boolean {
    return g.state !== DYING && g.state !== DEAD && g.state !== TUMBLE
  }

  /** Advance the hop cycle and pick new hops when resting. */
  private move(g: Gloom, dt: number, active: boolean): void {
    g.hopT += dt
    // squash spring (+ anticipation while crouching)
    const target = g.hop === CROUCH ? -0.24 : 0
    g.sqv += (-(g.sq - target) * 230 - g.sqv * 11) * dt
    g.sq = THREE.MathUtils.clamp(g.sq + g.sqv * dt, -0.6, 0.6)

    if (g.hop === AIR) {
      const u = Math.min(1, g.hopT / g.hopDur)
      let x = g.sx + (g.lx - g.sx) * u
      let z = g.sz + (g.lz - g.sz) * u
      // keep out of trees, walls and props
      const r = 0.42 * g.scale
      this.push.x = x
      this.push.y = g.y
      this.push.z = z
      this.ctx.collision.pushOut(this.push, r, GLOOM_HEIGHT * g.scale, 0.45)
      x = this.push.x
      z = this.push.z
      const ground = supportHeight(this.ctx, x, z, g.y, r)
      const arc = g.sy + (g.ly - g.sy) * u + 4 * g.hopH * u * (1 - u)
      g.x = x
      g.z = z
      g.y = Math.max(ground, arc)
      if (u >= 1) {
        g.y = ground
        g.hop = REST
        g.hopT = 0
        g.sqv -= 3 + g.hopH * 9
        if ((g.state === ALERT && g.alertHop) || g.state === STUN) this.setState(g, CHASE)
      }
      return
    }

    if (g.hop === CROUCH) {
      if (g.hopT >= 0.09 * (g.big ? 1.3 : 1)) {
        g.hop = AIR
        g.hopT = 0
        g.sx = g.x
        g.sy = g.y
        g.sz = g.z
        g.sqv += 3.5 + g.hopH * 4
      }
      return
    }

    // resting
    if (!active || g.hopT < g.restFor) return
    this.decideHop(g)
  }

  private decideHop(g: Gloom): void {
    const pp = this.ctx.player.position
    const big = g.big ? 1.25 : 1
    switch (g.state) {
      case IDLE:
        if (g.stateT >= g.idleFor) {
          if (this.pickWanderTarget(g)) this.setState(g, WANDER)
          else g.idleFor = g.stateT + 1
        }
        return
      case WANDER: {
        const d = Math.hypot(g.tx - g.x, g.tz - g.z)
        if (d < 0.5) {
          this.setState(g, IDLE)
          g.idleFor = 1 + this.random() * 2.4
          return
        }
        const step = Math.min(d, WANDER_SPEED * 0.75 * big)
        if (!this.hopToward(g, g.tx, g.tz, step, 0.42 * big, 0.3)) {
          this.setState(g, IDLE)
          g.idleFor = 0.6 + this.random()
        }
        g.restFor = 0.2 + this.random() * 0.45
        return
      }
      case ALERT:
        g.targetYaw = Math.atan2(pp.x - g.x, pp.z - g.z)
        g.alertHop = true
        this.startHop(g, g.x, g.z, 0.42 * big, 0.75, false)
        return
      case CHASE: {
        const speed = g.big ? CHASE_SPEED_BIG : CHASE_SPEED
        const air = 0.34 * big
        const crouch = 0.09 * big
        const rest = 0.05
        const step = speed * (air + crouch + rest)
        const d = Math.hypot(pp.x - g.x, pp.z - g.z)
        g.targetYaw = Math.atan2(pp.x - g.x, pp.z - g.z)
        // Don't hop onto the player's head: stop just short of contact range.
        const reach = Math.max(0, Math.min(step, d - 0.4 * g.scale))
        if (reach < 0.15 || !this.hopToward(g, pp.x, pp.z, reach, air, 0.38)) this.startHop(g, g.x, g.z, air, 0.25, false)
        g.restFor = rest
        return
      }
      case RETURN: {
        const d = Math.hypot(g.homeX - g.x, g.homeZ - g.z)
        const step = Math.min(d, RETURN_SPEED * 0.6 * big)
        if (!this.hopToward(g, g.homeX, g.homeZ, step, 0.36 * big, 0.3)) {
          // Can't get back cleanly (cornered by water): settle here.
          g.homeX = g.x
          g.homeZ = g.z
          this.setState(g, IDLE)
        }
        g.restFor = 0.12
        return
      }
      case STUN:
        this.setState(g, CHASE)
        return
    }
  }

  /** Start a hop of `step` metres toward (tx, tz) if the landing spot is dry and not a cliff. */
  private hopToward(g: Gloom, tx: number, tz: number, step: number, air: number, height: number): boolean {
    const dx = tx - g.x
    const dz = tz - g.z
    const d = Math.hypot(dx, dz)
    if (d < 1e-3) return false
    const lx = g.x + (dx / d) * step
    const lz = g.z + (dz / d) * step
    if (!this.walkable(g, lx, lz)) return false
    g.targetYaw = Math.atan2(dx, dz)
    this.startHop(g, lx, lz, air, height, false)
    return true
  }

  private walkable(g: Gloom, x: number, z: number): boolean {
    const h = heightAt(x, z)
    if (waterLevelAt(x, z) - h > MAX_WADE) return false
    // Too steep to hop up or down (cliffs, mesa walls).
    return Math.abs(h - g.y) < 1.1 * g.scale
  }

  private startHop(g: Gloom, lx: number, lz: number, air: number, height: number, skipCrouch: boolean): void {
    if (!this.walkable(g, lx, lz)) {
      lx = g.x
      lz = g.z
    }
    g.lx = lx
    g.lz = lz
    g.ly = supportHeight(this.ctx, lx, lz, g.y + 0.3, 0.42 * g.scale)
    g.hopDur = air
    g.hopH = height * (g.big ? 1.15 : 1)
    g.hopT = 0
    g.restFor = 0
    if (skipCrouch) {
      g.hop = AIR
      g.sx = g.x
      g.sy = g.y
      g.sz = g.z
    } else {
      g.hop = CROUCH
    }
  }

  private pickWanderTarget(g: Gloom): boolean {
    for (let k = 0; k < 6; k++) {
      const a = this.random() * Math.PI * 2
      const r = g.patrol * Math.sqrt(0.15 + this.random() * 0.85)
      const x = g.homeX + Math.cos(a) * r
      const z = g.homeZ + Math.sin(a) * r
      const h = heightAt(x, z)
      if (waterLevelAt(x, z) - h > MAX_WADE) continue
      g.tx = x
      g.tz = z
      return true
    }
    return false
  }

  private setState(g: Gloom, s: number): void {
    g.state = s
    g.stateT = 0
  }

  /**
   * Danger music while anything chases the player, back to explore a few seconds after the last
   * chase ends. Works from the mood actually playing, so a dialog or cutscene in the middle of a
   * chase (which may or may not change the music) never leaves the danger theme stuck on.
   */
  private updateMusic(dt: number, chasing: number, playing: boolean): void {
    if (!playing) return
    if (chasing > 0) {
      this.calmT = 0
      if (this.mood === 'explore') this.ctx.game.setMusic('danger')
    } else if (this.mood === 'danger') {
      this.calmT += dt
      if (this.calmT >= CALM_DELAY) this.ctx.game.setMusic('explore')
    }
  }

  /* ── rendering ───────────────────────────────────────────── */

  private render(): void {
    const body = this.body
    const shadows = this.shadows
    const eyes = this.eyes
    if (!body || !shadows || !eyes || !this.stateAttr) return
    const st = this.stateAttr.array as Float32Array
    const t = this.ctx.clock.t
    for (let i = 0; i < this.list.length; i++) {
      const g = this.list[i]
      if (g.state === DEAD) {
        this.m.makeScale(0, 0, 0)
        body.setMatrixAt(i, this.m)
        shadows.setMatrixAt(i, this.m)
        eyes.hide(i * 2)
        eyes.hide(i * 2 + 1)
        continue
      }
      let sy: number
      let sxz: number
      let lean = 0
      let roll = 0
      if (g.state === TUMBLE) {
        sy = 1 + g.sq
        sxz = 1 - g.sq * 0.55
        lean = g.rx
        roll = g.rz
      } else if (g.state === DYING) {
        // Flatten into a puddle, then pop.
        const u = g.deathT / DEATH_TIME
        if (u < 0.55) {
          const k = u / 0.55
          sy = 1 - 0.82 * k
          sxz = 1 + 0.55 * k
        } else {
          const k = (u - 0.55) / 0.45
          sy = 0.18 * (1 - k)
          sxz = 1.55 * (1 - k * k)
        }
      } else {
        const breathe = g.hop === REST ? Math.sin(t * 2.6 + i * 1.7) * 0.035 : 0
        sy = 1 + g.sq + breathe
        sxz = 1 - (g.sq + breathe) * 0.55
        if (g.hop === AIR) lean = 0.16 * Math.sin(Math.PI * Math.min(1, g.hopT / g.hopDur))
        if (g.state === STUN) lean = -0.25
      }
      const sc = g.scale
      this.e.set(lean, g.yaw, roll)
      this.q.setFromEuler(this.e)
      this.m.compose(this.p.set(g.x, g.y, g.z), this.q, this.s.set(sxz * sc, sy * sc, sxz * sc))
      body.setMatrixAt(i, this.m)

      // per-instance shading: eye glow (blink), hurt flash, anger
      const blink = g.blinkT > 0 ? 0.05 : 1
      st[i * 3] = g.state === DYING ? 0 : g.eye * blink
      st[i * 3 + 1] = g.state === DYING ? 1 : g.flash
      st[i * 3 + 2] = g.anger

      // eye glows follow the body transform
      for (let k = 0; k < 2; k++) {
        this.v.copy(EYE_LOCAL[k]).applyMatrix4(this.m)
        if (g.state === DYING) eyes.hide(i * 2 + k)
        else {
          eyes.move(i * 2 + k, this.v.x, this.v.y, this.v.z, 0.42 * sc)
          eyes.intensity(i * 2 + k, 0.32 * g.eye * blink * (1 + g.anger * 0.5))
        }
      }

      // blob shadow on the ground under the body
      const ground =
        g.state === TUMBLE ? heightAt(g.x, g.z) : g.hop === AIR ? Math.min(g.y, g.sy + (g.ly - g.sy) * Math.min(1, g.hopT / g.hopDur)) : g.y
      const above = Math.max(0, g.y - ground)
      const k = Math.max(0.35, 1 - above * 0.6) * sxz * sc * 1.15
      this.m.compose(this.p.set(g.x, ground + 0.06, g.z), this.q.identity(), this.s.set(k, 1, k))
      shadows.setMatrixAt(i, this.m)
    }
    body.instanceMatrix.needsUpdate = true
    shadows.instanceMatrix.needsUpdate = true
    this.stateAttr.needsUpdate = true
    eyes.commit()
  }

  dispose(): void {
    for (const u of this.unsubs) u()
    this.unsubs = []
    for (const mesh of [this.body, this.shadows]) {
      if (!mesh) continue
      mesh.removeFromParent()
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
      mesh.dispose()
    }
    this.body = this.shadows = null
    this.eyes?.dispose()
    this.eyes = null
    if (this.glowTex?.owned) this.glowTex.texture.dispose()
    this.glowTex = null
  }
}

/** Vertex-coloured jelly with a violet rim light and instanced eye glow / hurt flash. */
function gloomMaterial(): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0 })
  const eye = new THREE.Color('#ffc42e').multiplyScalar(2.4)
  const angry = new THREE.Color('#ff6a1f').multiplyScalar(3)
  const rim = new THREE.Color('#9c6bff').multiplyScalar(0.85)
  mat.onBeforeCompile = shader => {
    shader.uniforms.uEye = { value: eye }
    shader.uniforms.uEyeAngry = { value: angry }
    shader.uniforms.uRim = { value: rim }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aGlow;\nattribute vec3 aState;\nvarying float vGlow;\nvarying vec3 vState;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;\nvState = aState;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uEye;\nuniform vec3 uEyeAngry;\nuniform vec3 uRim;\nvarying float vGlow;\nvarying vec3 vState;')
      .replace(
        '#include <color_fragment>',
        '#include <color_fragment>\ndiffuseColor.rgb *= mix(1.0, 0.25 + 0.75 * min(vState.x, 1.0), vGlow);\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), vState.y * 0.8);',
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += vGlow * mix(uEye, uEyeAngry, vState.z) * vState.x;
        float rimF = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0);
        totalEmissiveRadiance += (1.0 - vGlow) * uRim * rimF;
        totalEmissiveRadiance += vState.y * vec3(0.55, 0.45, 0.7);`,
      )
  }
  mat.customProgramCacheKey = () => 'starfall-gloomling'
  return mat
}

/** Soft dark disc used as a contact shadow under each hopping gloomling. */
function blobShadowMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float a = (1.0 - smoothstep(0.25, 1.0, d)) * 0.38;
        gl_FragColor = vec4(0.05, 0.02, 0.08, a);
      }`,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  })
}
