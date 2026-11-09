/**
 * What every boss shares: health and phases, weapon hits (it registers as an IEnemies target,
 * so swings, slams and arrows reach it), stomps on its head (through its collider's onLand),
 * vulnerable windows, the HUD bar, resets and the defeat hand-off.
 *
 * Lifecycle: 'sleep' (waiting in its arena) → 'intro' (the cutscene: wakes and roars) →
 * 'fight' → 'dying' (its own defeat animation) → 'dead'. reset() returns to 'sleep' at full
 * health from anywhere — the player died, or left through the portal.
 */
import * as THREE from 'three'
import type { Collider } from '../../collision'
import type { BossId, V3, WeaponId } from '../../events'
import type { Ctx, WeaponHit } from '../../types'
import { BOSS_NAMES } from '../defs'
import type { Hazards } from './hazards'

/** Hits during a vulnerable window do this much more damage. */
export const VULNERABLE_BONUS = 2
const STOMP_LAUNCH = 12
const DEATH_TIME = 1.9

export interface Arena {
  x: number
  y: number
  z: number
  r: number
}

export abstract class Boss {
  abstract readonly id: BossId
  /** Subtitle under the name in the intro. */
  abstract readonly title: string
  readonly root = new THREE.Group()
  readonly pos = new THREE.Vector3()
  yaw = 0
  hp: number
  phase = 1
  mode: 'sleep' | 'intro' | 'fight' | 'dying' | 'dead' = 'sleep'
  /** Called once when the defeat animation has finished (the chest appears). */
  onDefeated: (() => void) | null = null

  /** Seconds left of the current vulnerable window. */
  protected stunT = 0
  /** Roaring between phases: no damage taken. */
  protected shieldT = 0
  protected flash = 0
  protected deathT = 0
  protected collider: Collider | null = null
  protected readonly home = new THREE.Vector3()
  private hudKey = ''
  private untarget: (() => void) | null = null

  constructor(
    protected readonly ctx: Ctx,
    protected readonly hazards: Hazards,
    protected readonly arena: Arena,
    readonly maxHp: number,
    /** HP fractions at which phases 2, 3… begin (descending). */
    private readonly phaseAt: readonly number[],
  ) {
    this.hp = maxHp
    this.root.name = 'boss'
  }

  get name(): string {
    return BOSS_NAMES[this.id]
  }

  get vulnerable(): boolean {
    return this.stunT > 0
  }

  /** Start listening for weapon hits; the subclass has built its mesh and collider. */
  protected attach(): void {
    this.ctx.scene.add(this.root)
    this.untarget = this.ctx.enemies.addTarget({
      takeHit: h => this.takeHit(h),
      aimPoint: out => {
        if (this.mode !== 'fight') return false
        out.copy(this.pos)
        return true
      },
    })
  }

  /** Back to sleep in its arena at full health. */
  reset(): void {
    this.mode = this.mode === 'dead' || this.mode === 'dying' ? 'dead' : 'sleep'
    this.hp = this.maxHp
    this.phase = 1
    this.stunT = this.shieldT = this.flash = this.deathT = 0
    this.pos.copy(this.home)
    this.yaw = Math.atan2(this.arena.x - this.home.x, this.arena.z - this.home.z + 1e-6)
    this.hazards.clear()
    this.ctx.enemies.clearMinions()
    this.root.visible = this.mode !== 'dead'
    if (this.collider) this.collider.enabled = this.mode !== 'dead'
    this.onReset()
    this.place(0)
    this.syncHud()
  }

  /** Already beaten on an earlier visit: gone. */
  markDead(): void {
    this.mode = 'dead'
    this.reset()
  }

  wake(): void {
    if (this.mode !== 'sleep') return
    this.mode = 'intro'
    this.onWake()
    this.syncHud()
  }

  begin(): void {
    if (this.mode !== 'intro' && this.mode !== 'sleep') return
    this.mode = 'fight'
    this.onBegin()
    this.syncHud()
  }

  /** `live`: gameplay is running and the player can act (otherwise the boss only animates). */
  update(dt: number, live: boolean): void {
    this.flash = Math.max(0, this.flash - dt * 4)
    this.stunT = Math.max(0, this.stunT - dt)
    this.shieldT = Math.max(0, this.shieldT - dt)
    if (this.mode === 'fight' && live) this.fight(dt)
    if (this.mode === 'dying') {
      this.deathT += dt
      this.dying(dt, this.deathT)
      if (this.deathT >= DEATH_TIME) this.finishDeath()
    }
    this.place(dt)
    this.syncHud()
  }

  dispose(): void {
    this.untarget?.()
    this.untarget = null
    if (this.collider) this.ctx.collision.remove(this.collider)
    this.collider = null
    this.root.removeFromParent()
    if (this.hudKey) this.ctx.hud.set({ boss: null })
  }

  /* ── for subclasses ──────────────────────────────────────── */

  protected abstract fight(dt: number): void
  /** Pose the mesh (and move the collider) for the current state. */
  protected abstract place(dt: number): void
  /** Does a blow sphere touch the body? */
  protected abstract touches(c: V3, r: number): boolean
  /** Damage multiplier for a blow (weak points, armour); the vulnerable bonus is applied on top. */
  protected abstract multiplier(h: WeaponHit): number
  protected abstract onReset(): void
  protected abstract onWake(): void
  protected abstract onBegin(): void
  protected abstract onPhase(phase: number): void
  /** Start of the defeat animation. */
  protected abstract onDefeat(): void
  /** Defeat animation, `t` seconds in (DEATH_TIME long). */
  protected abstract dying(dt: number, t: number): void
  protected abstract stompDamage(): number

  protected stun(seconds: number): void {
    this.stunT = Math.max(this.stunT, seconds)
  }

  /** The collider's onLand: the player came down on the boss's head. */
  protected stomped(impact: number): void {
    if (this.mode !== 'fight' || impact < 2 || this.shieldT > 0) return
    const p = this.ctx.player.position
    this.ctx.player.launch(STOMP_LAUNCH)
    this.ctx.bus.emit('enemy:stomp', { pos: { x: p.x, y: p.y, z: p.z } })
    this.damage(this.stompDamage() * (this.vulnerable ? VULNERABLE_BONUS : 1), p, 'fists')
  }

  /** Face toward a point, turning at most `rate` rad/s (Infinity = at once). */
  protected turnToward(x: number, z: number, rate: number, dt: number): void {
    const want = Math.atan2(x - this.pos.x, z - this.pos.z)
    const d = Math.atan2(Math.sin(want - this.yaw), Math.cos(want - this.yaw))
    const step = rate * dt
    this.yaw += Math.abs(d) <= step ? d : Math.sign(d) * step
  }

  /** Keep a point inside the arena (minus a margin). */
  protected clampToArena(v: THREE.Vector3, margin: number): THREE.Vector3 {
    const dx = v.x - this.arena.x
    const dz = v.z - this.arena.z
    const d = Math.hypot(dx, dz)
    const max = this.arena.r - margin
    if (d > max) {
      v.x = this.arena.x + (dx / d) * max
      v.z = this.arena.z + (dz / d) * max
    }
    return v
  }

  protected playerReady(): boolean {
    const pl = this.ctx.player
    return pl.hp > 0 && pl.controlEnabled
  }

  protected roar(): void {
    this.ctx.bus.emit('boss:roar', { pos: { x: this.pos.x, y: this.pos.y + 3, z: this.pos.z }, boss: this.id })
    this.ctx.game.shake(0.45, 0.9)
  }

  /* ── internals ───────────────────────────────────────────── */

  private takeHit(h: WeaponHit): boolean {
    if (this.mode !== 'fight' || !this.touches(h.center, h.radius)) return false
    if (this.shieldT > 0) {
      this.ctx.fx.burst('hit', h.center, { color: '#b0b8c8', scale: 0.7 })
      return true
    }
    this.damage(h.damage * this.multiplier(h) * (this.vulnerable ? VULNERABLE_BONUS : 1), h.center, h.weapon)
    return true
  }

  private damage(amount: number, at: V3, weapon: WeaponId): void {
    const dmg = Math.max(1, Math.round(amount))
    this.hp = Math.max(0, this.hp - dmg)
    this.flash = 1
    const killed = this.hp <= 0
    this.ctx.bus.emit('enemy:hit', { pos: { x: at.x, y: at.y, z: at.z }, damage: dmg, killed, big: true, weapon })
    if (killed) {
      this.defeat()
      return
    }
    let phase = 1
    for (const f of this.phaseAt) if (this.hp <= this.maxHp * f) phase++
    if (phase > this.phase) {
      this.phase = phase
      this.stunT = 0
      this.shieldT = 1.6
      this.hazards.clear()
      this.roar()
      this.onPhase(phase)
    }
  }

  private defeat(): void {
    this.mode = 'dying'
    this.deathT = 0
    this.stunT = this.shieldT = 0
    this.hazards.clear()
    this.ctx.enemies.clearMinions()
    if (this.collider) this.collider.enabled = false
    this.ctx.game.defeatBoss(this.id)
    this.ctx.game.timeWarp(0.25, 0.6)
    this.ctx.game.shake(0.7, 0.5)
    this.roar()
    this.onDefeat()
  }

  private finishDeath(): void {
    this.mode = 'dead'
    this.root.visible = false
    const c = { x: this.pos.x, y: this.pos.y + 2, z: this.pos.z }
    this.ctx.bus.emit('boss:defeat', { pos: c, boss: this.id })
    this.ctx.bus.emit('ui:flash', { color: '#ffffff', duration: 0.5 })
    this.ctx.game.shake(0.9, 0.6)
    this.onDefeated?.()
  }

  private syncHud(): void {
    const show = this.mode === 'fight' || this.mode === 'dying'
    const key = show ? `${this.hp}|${this.phase}|${this.vulnerable}` : ''
    if (key === this.hudKey) return
    this.hudKey = key
    this.ctx.hud.set({ boss: show ? { name: this.name, hp: this.hp, max: this.maxHp, phase: this.phase, vulnerable: this.vulnerable } : null })
  }
}
