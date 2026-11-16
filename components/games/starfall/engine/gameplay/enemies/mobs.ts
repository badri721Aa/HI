/**
 * The six mob archetypes and the sentry turret. Each reads as one idea at a glance:
 *
 *   Rusher          sprints in, plants its feet (a chevron lane lights up), charges in a
 *                   straight line, then stumbles dazed — sidestep and punish.
 *   Shield-Bearer   a tower shield turns blows from the front; it turns slowly, so flank it,
 *                   or break the guard with a heavy blow (hammer slams, finishers).
 *   Bomber          runs at you and lights its fuse: a red circle fills, then it blows up —
 *                   hurting other enemies too. Killed early, it drops the bomb with a short fuse.
 *   Sniper          keeps its distance and paints you with a laser; the laser locks and
 *                   brightens just before the bolt — move then.
 *   Healer          tethers to hurt allies and mends them, or wards them (gold glow: tougher,
 *                   faster). Blinks away when cornered; alone, it lobs homing wisps.
 *   Turret-Spawner  throws sentry turrets down beside it; each glows before firing a burst.
 *                   Its turrets power down a few seconds after it falls.
 */
import * as THREE from 'three'
import type { WeaponHit } from '../../types'
import { KIND } from '../weapons/defs'
import { BEAM } from './Beams'
import type { AnimName, BomberTune, HealerTune, RusherTune, ShieldTune, SniperTune, SpawnerTune, TurretTune } from './defs'
import { sigilMaterial } from './materials'
import { Mob, wrap } from './Mob'

const _a = new THREE.Vector3()
const _b = new THREE.Vector3()
const _c = new THREE.Color()

/* ── Rusher ──────────────────────────────────────────────────── */

type RusherMode = 'approach' | 'windup' | 'charge' | 'recover' | 'slash'

export class Rusher extends Mob {
  private mode: RusherMode = 'approach'
  private t = 0
  private cd = 0.6
  private dirX = 0
  private dirZ = 1
  private lane = 0
  private struck = false

  private get tn(): RusherTune {
    return this.tune as RusherTune
  }

  protected think(dt: number): void {
    const tn = this.tn
    const st = this.def.stats
    this.t += dt
    this.cd -= dt
    switch (this.mode) {
      case 'approach':
        this.facePlayer()
        if (this.dist < tn.slashRange && this.cd <= 0) this.begin('slash')
        else if (this.dist < tn.engage && this.dist > 3.4 && this.cd <= 0) this.begin('windup')
        else this.seek(this.ctx.player.position.x, this.ctx.player.position.z, st.run, tn.slashRange * 0.8)
        break
      case 'windup': {
        this.poise = true
        // Tracks the player for most of the wind-up, then commits to the line.
        if (this.t < tn.windup * 0.72) {
          this.facePlayer()
          this.dirX = Math.sin(this.faceYaw)
          this.dirZ = Math.cos(this.faceYaw)
          this.lane = this.clearRun(tn.chargeSpeed * tn.chargeTime)
        }
        if (this.t >= tn.windup) {
          this.begin('charge')
          this.cue('charge')
          this.act('sprint', { speed: 1.4 })
        }
        break
      }
      case 'charge': {
        this.faceYaw = Math.atan2(this.dirX, this.dirZ)
        const sp = tn.chargeSpeed * this.haste
        this.wantX = this.dirX * sp
        this.wantZ = this.dirZ * sp
        this.vx = this.wantX
        this.vz = this.wantZ
        if (this.t > 0.05 && this.dist < this.radius + this.ctx.player.radius + 0.45 && Math.abs(this.dy) < 1.5) {
          this.hurtPlayer(tn.damage)
          this.begin('recover', 0.4)
          break
        }
        const ahead = this.position
        if (this.t > tn.chargeTime || !this.walkable(ahead.x + this.dirX * 0.9, ahead.z + this.dirZ * 0.9)) {
          if (this.t <= tn.chargeTime) {
            // Ran into a wall or an edge: a longer daze.
            this.ctx.fx.burst('stomp', { x: ahead.x, y: ahead.y + this.height, z: ahead.z }, { color: '#ffe08a', scale: 0.9 })
            this.ctx.game.shake(0.15, 0.15)
            this.begin('recover', -0.6)
          } else this.begin('recover')
        }
        break
      }
      case 'recover':
        this.exposed = 1.5
        if (this.t >= tn.recover) {
          this.exposed = 1
          this.cd = tn.cooldown
          this.begin('approach')
        }
        break
      case 'slash':
        this.facePlayer()
        if (!this.struck && this.t >= tn.slashWindup) {
          this.struck = true
          this.cue('slash')
          if (this.inFront(tn.slashRange + 0.4, 1.0)) this.hurtPlayer(tn.damage)
        }
        if (this.t >= tn.slashWindup + 0.5) {
          this.cd = tn.cooldown * 0.7
          this.begin('approach')
        }
        break
    }
  }

  /** `bias` shifts the recover timer (negative = longer). */
  private begin(m: RusherMode, bias = 0): void {
    this.mode = m
    this.t = m === 'recover' ? bias : 0
    this.poise = m === 'windup' || m === 'charge'
    this.struck = false
    switch (m) {
      case 'windup':
        this.act('combat', { speed: 0.6 })
        this.cue('windup')
        break
      case 'recover':
        this.wantX = this.wantZ = 0
        this.act('hit', { once: true, speed: 0.7 })
        this.ctx.fx.burst('stomp', { x: this.position.x, y: this.position.y + this.height + 0.2, z: this.position.z }, { color: '#ffd27a', scale: 0.6, count: 6 })
        break
      case 'slash':
        this.act('slash', { once: true, speed: 1.15 })
        break
      default:
        this.stopAct()
    }
  }

  /** How far the charge can run before a wall, an edge or deep water (for the lane). */
  private clearRun(max: number): number {
    const p = this.position
    for (let d = 1; d <= max; d += 1) {
      if (!this.walkable(p.x + this.dirX * d, p.z + this.dirZ * d)) return Math.max(1, d - 1)
    }
    return max
  }

  protected onCalm(): void {
    this.mode = 'approach'
    this.poise = false
    this.exposed = 1
  }

  protected onFlinch(): void {
    if (this.mode === 'slash' || this.mode === 'windup') {
      this.cd = this.tn.cooldown * 0.5
      this.mode = 'approach'
      this.poise = false
    }
  }

  protected draw(): void {
    if (this.mode !== 'windup' || this.state !== 'hunt') return
    const p = this.position
    const u = Math.min(1, this.t / this.tn.windup)
    _a.set(p.x + this.dirX * 0.6, p.y + 0.06, p.z + this.dirZ * 0.6)
    _b.set(p.x + this.dirX * this.lane, p.y + 0.06, p.z + this.dirZ * this.lane)
    this.host.beams.draw(_a, _b, 1.2, _c.set(this.def.color), 0.5 + u * 0.9, BEAM.lane)
  }

  protected decorate(tint: THREE.Vector4): void {
    if (this.mode === 'windup' && this.state === 'hunt') tint.set(1, 0.35, 0.15, 0.25 + 0.25 * Math.sin(this.t * 22))
    else if (this.mode === 'charge') tint.set(1, 0.55, 0.2, 0.3)
  }
}

/* ── Shield-Bearer ───────────────────────────────────────────── */

type ShieldMode = 'advance' | 'brace' | 'bash' | 'broken'

export class ShieldBearer extends Mob {
  private mode: ShieldMode = 'advance'
  private t = 0
  private cd = 1
  private struck = false
  private bashWarn = 0

  private get tn(): ShieldTune {
    return this.tune as ShieldTune
  }

  protected think(dt: number): void {
    const tn = this.tn
    const st = this.def.stats
    this.t += dt
    this.cd -= dt
    switch (this.mode) {
      case 'advance':
        this.facePlayer()
        if (this.dist < tn.bashRange && this.cd <= 0 && this.inFront(tn.bashRange, 0.9)) this.begin('bash')
        else if (this.t > 1.5 && this.dist < 7) this.begin('brace')
        else this.seek(this.ctx.player.position.x, this.ctx.player.position.z, this.dist > 8 ? st.run : st.walk, tn.bashRange * 0.8)
        break
      case 'brace':
        this.facePlayer()
        if (this.dist < tn.bashRange && this.cd <= 0 && this.inFront(tn.bashRange, 0.9)) this.begin('bash')
        else if (this.t > 1.0) this.begin('advance')
        break
      case 'bash':
        if (this.t < tn.bashWindup * 0.6) this.facePlayer()
        if (!this.struck && this.t >= tn.bashWindup) {
          this.struck = true
          this.cue('bash')
          this.ctx.game.shake(0.15, 0.12)
          if (this.inFront(tn.bashRange + 0.35, 0.95)) this.hurtPlayer(tn.bashDamage)
        }
        if (this.t >= tn.bashWindup + 0.55) {
          this.cd = tn.cooldown
          this.begin('advance')
        }
        break
      case 'broken':
        this.exposed = 1.3
        if (this.t >= tn.broken) {
          this.exposed = 1
          this.begin('advance')
        }
        break
    }
  }

  protected restAnim(): AnimName {
    return this.state === 'hunt' && this.mode !== 'broken' ? 'block' : 'idle'
  }

  /** Frontal blows clang off the shield unless they're heavy; flanks and backs land in full. */
  protected guard(h: WeaponHit): number {
    if (this.mode === 'broken' || this.state !== 'hunt') return 1
    const a = Math.atan2(h.from.x - this.position.x, h.from.z - this.position.z)
    if (Math.abs(wrap(a - this.yaw)) > this.tn.arc) return 1.15
    const heavy = KIND[h.weapon] === 'hammer' || h.damage >= this.tn.heavy
    const shield = this.model.gearOf('shield')[0]
    const at = shield ? shield.getWorldPosition(_a) : _a.set(this.position.x + Math.sin(this.yaw) * 0.6, this.position.y + 1.1, this.position.z + Math.cos(this.yaw) * 0.6)
    if (heavy) {
      this.begin('broken')
      this.cue('guardBreak')
      this.ctx.fx.burst('hit', at, { color: '#cfe4ff', scale: 1.6 })
      this.ctx.fx.burst('debris', at, { color: '#9aa6b8', scale: 1.1 })
      this.ctx.game.shake(0.25, 0.18)
      return 0.75
    }
    this.cue('block')
    this.ctx.fx.burst('hit', at, { color: '#cfe4ff', scale: 0.9 })
    if (!this.acting || this.model.puppet.current !== 'blockHit') this.act('blockHit', { once: true })
    this.lastHit = 0
    return this.tn.chip
  }

  private begin(m: ShieldMode): void {
    this.mode = m
    this.t = 0
    this.struck = false
    this.poise = m === 'bash'
    // A bash cut short (guard broken, flinch) takes its warning circle with it.
    this.host.hazards.cancelWarn(this.bashWarn)
    this.bashWarn = 0
    switch (m) {
      case 'bash': {
        this.act('bash', { once: true, speed: 0.9 })
        const p = this.position
        const r = 1.5
        this.bashWarn = this.host.hazards.warn(p.x + Math.sin(this.yaw) * 1.5, p.y, p.z + Math.cos(this.yaw) * 1.5, r, this.tn.bashWindup, null)
        break
      }
      case 'brace':
        this.act('block')
        break
      case 'broken':
        this.exposed = 1.3
        this.act('hit', { once: true, speed: 0.6 })
        break
      default:
        this.stopAct()
    }
  }

  protected onFlinch(): void {
    if (this.mode === 'bash') this.begin('advance')
  }

  protected onDeath(): void {
    this.host.hazards.cancelWarn(this.bashWarn)
    this.bashWarn = 0
  }

  protected onCalm(): void {
    this.mode = 'advance'
    this.t = 0
    this.poise = false
    this.exposed = 1
  }

  protected decorate(tint: THREE.Vector4): void {
    if (this.mode === 'broken') tint.set(1, 0.85, 0.5, 0.2 + 0.15 * Math.sin(this.t * 14))
  }
}

/* ── Bomber ──────────────────────────────────────────────────── */

export class Bomber extends Mob {
  private fuse = -1
  private exploded = false
  private fuseWarn = 0

  private get tn(): BomberTune {
    return this.tune as BomberTune
  }

  protected think(dt: number): void {
    const tn = this.tn
    if (this.fuse >= 0) {
      this.fuse += dt
      this.facePlayer()
      if (this.fuse >= tn.fuse) this.explode()
      return
    }
    this.facePlayer()
    const p = this.ctx.player.position
    this.seek(p.x, p.z, this.def.stats.run, 0.6)
    if (this.dist < tn.trigger && Math.abs(this.dy) < 2) this.light()
  }

  private light(): void {
    const tn = this.tn
    this.fuse = 0
    this.poise = true
    this.committed = true
    this.act('raise', { speed: 1.3 })
    this.cue('fuse')
    const p = this.position
    this.fuseWarn = this.host.hazards.warn(p.x, p.y, p.z, tn.radius, tn.fuse, null)
  }

  private explode(): void {
    if (this.exploded) return
    this.exploded = true
    const p = this.position
    this.blast(p.x, p.y, p.z, this.tn.radius, this.tn.damage, this.tn.enemyDamage)
    this.explodeSelf()
  }

  protected onDeath(byWeapon: boolean): void {
    // Its own fuse circle goes with it; a dropped bomb draws a smaller one below.
    this.host.hazards.cancelWarn(this.fuseWarn)
    this.fuseWarn = 0
    if (this.exploded || !byWeapon) return
    // The bomb drops and goes off a moment later — smaller, but still dangerous (to enemies too).
    const tn = this.tn
    const x = this.position.x
    const y = this.position.y
    const z = this.position.z
    const r = tn.radius * tn.dropScale
    this.host.hazards.warn(x, y, z, r, tn.dropFuse, () => this.blast(x, y, z, r, Math.max(1, tn.damage - 1), tn.enemyDamage))
    this.cue('fuse')
  }

  protected onFlinch(): void {
    // A lit fuse doesn't care about being hit.
    if (this.fuse >= 0) this.act('raise', { speed: 1.3 })
  }

  protected decorate(tint: THREE.Vector4): void {
    if (this.fuse < 0) return
    const u = this.fuse / this.tn.fuse
    const blink = Math.sin(this.fuse * (8 + u * 30)) > 0 ? 1 : 0
    tint.set(1, 0.15, 0.05, 0.15 + blink * 0.45 * (0.4 + u))
    const tip = this.model.bone('fuse-tip')
    if (tip) tip.scale.setScalar(1 + blink * 1.4)
  }

  /** A bomb going off: hurts the player and every mob in the radius (chain reactions welcome). */
  private blast(x: number, y: number, z: number, r: number, playerDamage: number, enemyDamage: number): void {
    const ctx = this.ctx
    const at = { x, y: y + 0.4, z }
    ctx.fx.burst('stomp', at, { scale: r * 0.55, color: '#ffb347' })
    ctx.fx.burst('land', { x, y: y + 0.05, z }, { scale: r * 0.7, color: '#5a4636' })
    ctx.fx.burst('hit', at, { scale: r * 0.6, color: '#ff7a2a' })
    ctx.fx.burst('debris', at, { scale: r * 0.5 })
    ctx.game.shake(0.45, 0.3)
    ctx.bus.emit('enemy:cue', { pos: at, cue: 'explode', kind: 'bomber' })
    const pl = ctx.player
    const p = pl.position
    if (Math.hypot(p.x - x, p.z - z) < r + pl.radius && p.y - y < 2.2 && p.y - y > -1.5 && !pl.invulnerable && pl.hp > 0) {
      pl.hurt(playerDamage, { x, y, z })
    }
    for (const m of this.host.mobs()) {
      if (m === this || !m.alive) continue
      if (Math.hypot(m.position.x - x, m.position.z - z) < r + m.radius && Math.abs(m.position.y - y) < 2.5) m.damage(enemyDamage)
    }
  }

  protected draw(): void {
    if (this.fuse < 0 || !this.alive) return
    const tip = this.model.bone('fuse-tip')
    if (!tip || this.ctx.clock.t % 0.08 > 0.04) return
    tip.getWorldPosition(_a)
    this.ctx.fx.burst('spark', _a, { count: 2, scale: 0.35, color: '#ffb347' })
  }
}

/* ── Sniper ──────────────────────────────────────────────────── */

type SniperMode = 'position' | 'aim' | 'fire' | 'reload'

export class Sniper extends Mob {
  private mode: SniperMode = 'position'
  private t = 0
  private cd = 1.2
  private dodgeCd = 0
  private locked = false
  private readonly aim = new THREE.Vector3()
  private readonly muzzle = new THREE.Vector3()

  private get tn(): SniperTune {
    return this.tune as SniperTune
  }

  protected think(dt: number): void {
    const tn = this.tn
    const st = this.def.stats
    this.t += dt
    this.cd -= dt
    this.dodgeCd -= dt
    if (this.mode !== 'fire' && this.dist < tn.near * 0.5 && this.dodgeCd <= 0) {
      // Too close: a quick hop back, then reposition.
      this.dodgeCd = 3
      const d = Math.max(this.dist, 1e-3)
      this.vx = (-this.dx / d) * 7.5
      this.vz = (-this.dz / d) * 7.5
      this.act('dodge', { once: true, speed: 1.3 })
      this.begin('position')
      return
    }
    switch (this.mode) {
      case 'position':
        this.keepRange(tn.near, tn.far, st.run, 0.55)
        this.facePlayer()
        if (this.cd <= 0 && this.dist < tn.far + 4 && this.lineOfSight()) this.begin('aim')
        break
      case 'aim': {
        this.facePlayer()
        const pl = this.ctx.player
        const lockAt = tn.aim - tn.lock
        if (this.t < lockAt) {
          // The laser drifts onto the target rather than snapping (readable, and fair).
          const k = 1 - Math.exp(-7 * dt)
          this.aim.x += (pl.position.x - this.aim.x) * k
          this.aim.y += (pl.position.y + pl.height * 0.55 - this.aim.y) * k
          this.aim.z += (pl.position.z - this.aim.z) * k
        } else if (!this.locked) {
          this.locked = true
          this.cue('aim')
        }
        if (this.t >= tn.aim) this.begin('fire')
        else if (!this.locked && this.t > 0.4 && !this.lineOfSight()) {
          this.cd = 0.6
          this.begin('position')
        }
        break
      }
      case 'fire':
        if (this.t >= 0.32) this.begin('reload')
        break
      case 'reload':
        if (this.t >= tn.reload) {
          this.cd = 0.5
          this.begin('position')
        }
        break
    }
  }

  private begin(m: SniperMode): void {
    this.mode = m
    this.t = 0
    this.poise = m === 'aim' || m === 'fire'
    switch (m) {
      case 'aim': {
        const pl = this.ctx.player
        this.locked = false
        // Start the laser low and short of the target so it visibly sweeps on.
        this.aim.set(this.position.x + this.dx * 0.6, this.position.y + 0.3, this.position.z + this.dz * 0.6)
        if (!Number.isFinite(this.aim.x)) this.aim.set(pl.position.x, pl.position.y, pl.position.z)
        this.act('aim')
        break
      }
      case 'fire': {
        this.muzzlePos(this.muzzle)
        this.host.projectiles.fire(this.tn.shot, this.muzzle.x, this.muzzle.y, this.muzzle.z, this.aim.x - this.muzzle.x, this.aim.y - this.muzzle.y, this.aim.z - this.muzzle.z)
        this.act('shoot', { once: true })
        this.cue('snipe')
        this.ctx.fx.burst('hit', this.muzzle, { color: '#ff6a5a', scale: 0.6 })
        break
      }
      case 'reload':
        this.act('reload', { once: true })
        break
      default:
        this.stopAct()
    }
  }

  protected onFlinch(): void {
    if (this.mode === 'aim') {
      this.cd = 0.8
      this.begin('position')
    }
  }

  protected onCalm(): void {
    this.mode = 'position'
    this.poise = false
  }

  private muzzlePos(out: THREE.Vector3): THREE.Vector3 {
    const bow = this.model.gearOf('crossbow')[0]
    if (bow) bow.getWorldPosition(out)
    else out.set(this.position.x, this.position.y + this.height * 0.7, this.position.z)
    out.x += Math.sin(this.yaw) * 0.45
    out.z += Math.cos(this.yaw) * 0.45
    return out
  }

  private lineOfSight(): boolean {
    const pl = this.ctx.player
    this.muzzlePos(_a)
    const tx = pl.position.x - _a.x
    const ty = pl.position.y + pl.height * 0.55 - _a.y
    const tz = pl.position.z - _a.z
    const hit = this.ctx.collision.raycast(_a.x, _a.y, _a.z, tx, ty, tz, 1)
    return !hit || hit.t > 0.97 || hit.collider?.tag === 'enemy'
  }

  protected draw(): void {
    if (this.mode !== 'aim' || this.state !== 'hunt') return
    const tn = this.tn
    this.muzzlePos(this.muzzle)
    // Run the laser on past the aim point so it reads as a line of fire.
    _b.subVectors(this.aim, this.muzzle)
    const len = _b.length()
    if (len < 0.5) return
    _b.multiplyScalar((len + 6) / len).add(this.muzzle)
    const u = Math.min(1, this.t / Math.max(0.01, tn.aim - tn.lock))
    const blink = this.locked ? (Math.sin(this.t * 48) > 0 ? 2.2 : 1.2) : 0.35 + u * 0.55
    this.host.beams.draw(this.muzzle, _b, this.locked ? 0.11 : 0.05, _c.set(this.def.color), blink, BEAM.laser)
  }
}

/* ── Healer ──────────────────────────────────────────────────── */

type HealerMode = 'support' | 'tether' | 'blink'

export class Healer extends Mob {
  private mode: HealerMode = 'support'
  private t = 0
  private cd = 1
  private blinkCd = 2
  private target: Mob | null = null
  private warding = false
  private moved = false
  private readonly sigil: THREE.Mesh
  private readonly blinkTo = new THREE.Vector3()

  constructor(...args: ConstructorParameters<typeof Mob>) {
    super(...args)
    // A rune circle at its feet: green, slowly turning — the healer is visible from afar.
    this.sigil = new THREE.Mesh(this.own(new THREE.PlaneGeometry(3.2, 3.2).rotateX(-Math.PI / 2)), this.own(sigilMaterial(this.def.color, 0.6)))
    this.sigil.position.y = 0.06
    this.sigil.renderOrder = 3
    this.model.root.add(this.sigil)
  }

  private get tn(): HealerTune {
    return this.tune as HealerTune
  }

  protected think(dt: number): void {
    const tn = this.tn
    const st = this.def.stats
    this.t += dt
    this.cd -= dt
    this.blinkCd -= dt
    if (this.mode !== 'blink' && this.dist < tn.flee && this.blinkCd <= 0) {
      this.startBlink()
      return
    }
    switch (this.mode) {
      case 'support': {
        this.facePlayer()
        const centre = this.allyCentre(_a)
        if (centre) {
          // Stand behind the allies, away from the player.
          const d = Math.max(1e-3, Math.hypot(this.dx, this.dz))
          this.seek(centre.x - (this.dx / d) * 4, centre.z - (this.dz / d) * 4, st.run, 1)
        } else this.keepRange(9, 14, st.run, 0.6)
        if (this.cd <= 0) this.choose()
        break
      }
      case 'tether': {
        const tg = this.target
        if (!tg || !tg.alive || tg.position.distanceTo(this.position) > tn.range + 3) {
          this.endTether()
          break
        }
        this.faceTo(tg.position.x, tg.position.z)
        if (this.warding) {
          if (this.t > 0.5) tg.empower(tn.buff)
        } else tg.heal(tn.heal * dt)
        if (this.t >= tn.tether) this.endTether()
        break
      }
      case 'blink': {
        const sk = this.model.skin
        if (this.t < 0.28) sk.uDissolve.value = Math.min(1, this.t / 0.28)
        else if (!this.moved) {
          this.moved = true
          this.position.copy(this.blinkTo)
          this.ctx.fx.burst('poof', { x: this.position.x, y: this.position.y + 1, z: this.position.z }, { color: this.def.color, scale: 1 })
        } else sk.uDissolve.value = Math.max(0, 1 - (this.t - 0.28) / 0.3)
        if (this.t >= 0.6) {
          sk.uDissolve.value = 0
          this.mode = 'support'
          this.t = 0
          this.stopAct()
        }
        break
      }
    }
  }

  private choose(): void {
    const tn = this.tn
    let best: Mob | null = null
    let bestHp = 0.86
    let ward: Mob | null = null
    for (const m of this.host.mobs()) {
      if (m === this || !m.alive || m.kind === 'turret' || m.kind === 'healer') continue
      if (m.position.distanceTo(this.position) > tn.range) continue
      if (m.hpFraction < bestHp) {
        bestHp = m.hpFraction
        best = m
      }
      if (!ward && m.ward <= 0 && m.state === 'hunt') ward = m
    }
    const target = best ?? ward
    if (target) {
      this.target = target
      this.warding = !best
      this.mode = 'tether'
      this.t = 0
      this.poise = true
      this.act('cast')
      this.cue(this.warding ? 'buff' : 'heal')
      return
    }
    // Nobody to mend: a homing wisp at the player.
    this.cd = 3.6
    if (this.dist < 22) {
      this.act('castShoot', { once: true })
      const staff = this.staffTip(_b)
      this.host.projectiles.aimed('wisp', staff.x, staff.y, staff.z, 0.2)
      this.cue('volley')
    }
  }

  private endTether(): void {
    this.target = null
    this.mode = 'support'
    this.t = 0
    this.cd = this.tn.cooldown
    this.poise = false
    this.stopAct()
  }

  private startBlink(): void {
    const tn = this.tn
    const d = Math.max(1e-3, this.dist)
    let found = false
    // Away from the player, trying a few angles for solid ground.
    for (let k = 0; k < 6 && !found; k++) {
      const a = Math.atan2(-this.dx, -this.dz) + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.55
      const x = this.position.x + Math.sin(a) * tn.blink
      const z = this.position.z + Math.cos(a) * tn.blink
      if (this.walkable(x, z)) {
        this.blinkTo.set(x, this.groundAt(x, z), z)
        found = true
      }
    }
    if (!found || d > tn.flee * 2) {
      // Cornered: carry on supporting and look for a way out again shortly.
      this.blinkCd = 0.6
      return
    }
    this.blinkCd = tn.blinkCooldown
    this.target = null
    this.mode = 'blink'
    this.t = 0
    this.moved = false
    this.poise = true
    this.act('dodge', { once: true })
    this.cue('blink')
    this.ctx.fx.burst('poof', { x: this.position.x, y: this.position.y + 1, z: this.position.z }, { color: this.def.color, scale: 1 })
  }

  private allyCentre(out: THREE.Vector3): THREE.Vector3 | null {
    let n = 0
    out.set(0, 0, 0)
    for (const m of this.host.mobs()) {
      if (m === this || !m.alive || m.kind === 'turret' || m.position.distanceTo(this.position) > this.tn.range * 1.5) continue
      out.add(m.position)
      n++
    }
    return n ? out.multiplyScalar(1 / n) : null
  }

  private staffTip(out: THREE.Vector3): THREE.Vector3 {
    const staff = this.model.gearOf('staff')[0]
    if (staff) {
      staff.getWorldPosition(out)
      out.y += 1.0 * this.model.body.scale.y
    } else out.set(this.position.x, this.position.y + this.height, this.position.z)
    return out
  }

  protected onDeath(): void {
    this.target = null
  }

  protected onFlinch(): void {
    // Hitting the healer cuts its tether.
    if (this.mode === 'tether') this.endTether()
  }

  protected onCalm(): void {
    if (this.mode === 'tether') this.endTether()
    if (this.mode === 'blink') {
      this.model.skin.uDissolve.value = 0
      if (!this.moved) this.position.copy(this.blinkTo)
      this.mode = 'support'
    }
  }

  protected draw(dt: number): void {
    const u = (this.sigil.material as THREE.ShaderMaterial).uniforms
    u.uTime.value += dt
    u.uAlpha.value += ((this.alive ? (this.mode === 'tether' ? 1 : 0.55) : 0) - u.uAlpha.value) * Math.min(1, dt * 4)
    const tg = this.target
    if (this.mode !== 'tether' || !tg || !tg.alive) return
    this.staffTip(_a)
    _b.set(tg.position.x, tg.position.y + tg.height * 0.6, tg.position.z)
    this.host.beams.draw(_a, _b, 0.32, _c.set(this.warding ? '#ffd76a' : this.def.color), 1.3, BEAM.tether)
    if (Math.random() < dt * 14) this.ctx.fx.burst('heart', _b, { count: 1, scale: 0.4, color: this.warding ? '#ffd76a' : '#7dffb6' })
  }

}

/* ── Turret-Spawner ──────────────────────────────────────────── */

export class TurretSpawner extends Mob {
  private mode: 'position' | 'throw' = 'position'
  private t = 0
  private cd = 1.5
  private thrown = false
  readonly turrets: Turret[] = []
  private readonly spot = new THREE.Vector3()

  private get tn(): SpawnerTune {
    return this.tune as SpawnerTune
  }

  protected think(dt: number): void {
    const tn = this.tn
    this.t += dt
    this.cd -= dt
    for (let i = this.turrets.length - 1; i >= 0; i--) if (!this.turrets[i].alive) this.turrets.splice(i, 1)
    if (this.mode === 'position') {
      this.keepRange(tn.near, tn.far, this.def.stats.run * 0.85, 0.45)
      this.facePlayer()
      if (this.cd <= 0 && this.turrets.length < tn.max && this.dist < tn.far + 8 && this.pickSpot()) {
        this.mode = 'throw'
        this.t = 0
        this.thrown = false
        this.poise = true
        this.act('throw', { once: true })
        this.cue('deploy')
      }
      return
    }
    this.faceTo(this.spot.x, this.spot.z)
    if (!this.thrown && this.t >= tn.throwTime * 0.45) {
      this.thrown = true
      const turret = this.host.deploy(this, this.spot.x, this.spot.y, this.spot.z)
      if (turret instanceof Turret) this.turrets.push(turret)
    }
    if (this.t >= tn.throwTime) {
      this.mode = 'position'
      this.poise = false
      this.cd = tn.every
      this.stopAct()
    }
  }

  /** A spot to the side, between it and the player, on solid ground and clear of others. */
  private pickSpot(): boolean {
    const d = Math.max(1e-3, this.dist)
    const ux = this.dx / d
    const uz = this.dz / d
    const side = this.turrets.length % 2 ? -1 : 1
    for (const s of [side, -side]) {
      const x = this.position.x + ux * 2.2 + -uz * s * 3.4
      const z = this.position.z + uz * 2.2 + ux * s * 3.4
      if (!this.walkable(x, z)) continue
      let clear = true
      for (const m of this.host.mobs()) if (Math.hypot(m.position.x - x, m.position.z - z) < 1.6) clear = false
      if (!clear) continue
      this.spot.set(x, this.groundAt(x, z), z)
      return true
    }
    return false
  }

  protected onDeath(): void {
    for (const t of this.turrets) t.orphan()
  }

  protected onCalm(): void {
    this.mode = 'position'
    this.poise = false
  }

  protected onFlinch(): void {
    if (this.mode === 'throw' && !this.thrown) {
      this.mode = 'position'
      this.cd = 1.2
      this.poise = false
    }
  }
}

/* ── Sentry turret ───────────────────────────────────────────── */

export class Turret extends Mob {
  private mode: 'rest' | 'charge' | 'burst' = 'rest'
  private t = 0
  private shots = 0
  private orphanT = -1
  private headYaw = 0
  private readonly muzzle = new THREE.Vector3()

  constructor(...args: ConstructorParameters<typeof Mob>) {
    super(...args)
    this.headYaw = this.yaw
    if (this.state === 'spawn') {
      // Thrown in: it drops onto its spot.
      this.position.y += 2.6
      this.airborne = true
      this.vy = -2
    }
  }

  private get tn(): TurretTune {
    return this.tune as TurretTune
  }

  /** Its spawner fell: it powers down shortly. */
  orphan(): void {
    if (this.orphanT < 0) this.orphanT = this.tn.orphan
  }

  protected restAnim(): AnimName {
    return 'idle'
  }

  protected think(dt: number): void {
    const tn = this.tn
    this.t += dt
    if (this.orphanT >= 0) {
      this.orphanT -= dt
      if (this.orphanT <= 0) {
        const p = this.position
        this.ctx.fx.burst('hit', { x: p.x, y: p.y + 0.8, z: p.z }, { color: this.def.color, scale: 1.1 })
        this.explodeSelf()
        return
      }
    }
    // The head tracks the player (the base stays put).
    const want = Math.atan2(this.dx, this.dz)
    const d = wrap(want - this.headYaw)
    const step = this.def.stats.turn * dt
    this.headYaw += Math.abs(d) <= step ? d : Math.sign(d) * step
    const facing = Math.abs(wrap(want - this.headYaw)) < 0.25
    switch (this.mode) {
      case 'rest':
        if (this.t >= tn.rest && this.dist < tn.range && facing && this.orphanT < 0) {
          this.mode = 'charge'
          this.t = 0
          this.cue('beamCharge')
        }
        break
      case 'charge':
        if (this.t >= tn.charge) {
          this.mode = 'burst'
          this.t = tn.gap
          this.shots = 0
        }
        break
      case 'burst':
        if (this.t >= tn.gap) {
          this.t = 0
          this.fire()
          if (++this.shots >= tn.burst) this.mode = 'rest'
        }
        break
    }
  }

  private fire(): void {
    const head = this.model.bone('turret')
    if (head) head.getWorldPosition(this.muzzle)
    else this.muzzle.set(this.position.x, this.position.y + 0.8, this.position.z)
    this.muzzle.x += Math.sin(this.headYaw) * 0.55
    this.muzzle.z += Math.cos(this.headYaw) * 0.55
    this.muzzle.y += 0.05
    this.host.projectiles.aimed(this.tn.shot, this.muzzle.x, this.muzzle.y, this.muzzle.z, 0.15)
    this.ctx.fx.burst('hit', this.muzzle, { color: this.def.color, scale: 0.4, count: 4 })
    this.cue('turretShot')
  }

  protected draw(): void {
    const head = this.model.bone('turret')
    if (head) head.rotation.y = wrap(this.headYaw - this.yaw)
  }

  protected decorate(tint: THREE.Vector4): void {
    const sk = this.model.skin
    if (this.mode === 'charge') {
      const u = this.t / this.tn.charge
      tint.set(0.35, 0.9, 1, 0.15 + u * 0.4)
      sk.uGlow.value = 1 + u * 2.5
    } else if (this.orphanT >= 0) {
      tint.set(1, 0.3, 0.2, Math.sin(this.orphanT * 18) > 0 ? 0.4 : 0.05)
    }
  }
}

export type MobClass = new (...args: ConstructorParameters<typeof Mob>) => Mob

export const MOB_CLASSES = {
  rusher: Rusher,
  shieldBearer: ShieldBearer,
  bomber: Bomber,
  sniper: Sniper,
  healer: Healer,
  turretSpawner: TurretSpawner,
  turret: Turret,
} satisfies Record<string, MobClass>

