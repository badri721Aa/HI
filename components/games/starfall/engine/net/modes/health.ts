/**
 * Round health: the local player's health in the game modes that use it (Juggernaut Chaos, Gun
 * Game). It only exists while such a round is live; the story's hearts are untouched.
 *
 * Like every pvp hit, the victim decides: a blow that passed pvp.ts's checks (and the mode's own
 * ruling in Modes.ts) costs health by weapon. At zero the body is thrown down as a ragdoll and
 * the knockout — with who landed it — is reported for the host to validate. The usual death path
 * (Game.playerDied) then brings the player back at a mode spawn, protected for a moment. A fall
 * off the map counts as a knockout too, credited to whoever struck last, if that was recent.
 */
import type { V3, WeaponId } from '../../events'
import type { Ctx } from '../../types'
import { PROTECT, ROUND_HP } from './defs'

/** A fall is credited to the last attacker if they struck within this long (s). */
const FALL_CREDIT = 6
/** The knockout throw (m/s): away from the attacker, and up. */
const THROW = 7.5
const THROW_UP = 6.5
/** An unanswered knockout report is repeated this often (s), this many times (the host may be changing). */
const RESEND_GAP = 1.2
const RESENDS = 2

export class RoundHealth {
  /** A health round is live with us in it. */
  active = false
  hp = ROUND_HP
  max = ROUND_HP
  /** Seconds of spawn protection left (blows don't count). */
  shield = 0
  /** Knocked out, waiting to come back. */
  down = false
  /** Seconds since the last blow that cost health (the HUD flashes on it). */
  sinceHit = Infinity

  private lastBy = ''
  private lastWeapon: WeaponId = 'fists'
  private lastAt = -Infinity
  private pending: { by: string; weapon: WeaponId; at: number; left: number } | null = null
  private unsubs: Array<() => void>

  constructor(
    private ctx: Ctx,
    /** Tells the host we went down (`by` '' = on our own). */
    private report: (by: string, weapon: WeaponId) => void,
  ) {
    this.unsubs = [
      ctx.bus.on('player:died', () => this.fell()),
      ctx.bus.on('player:respawn', () => this.respawned()),
    ]
  }

  /** The round went live (or we took a new role): full health of `max`. */
  begin(max: number, protect = 0): void {
    this.active = true
    this.max = this.hp = max
    this.shield = protect
    this.down = false
    this.sinceHit = Infinity
    this.lastBy = ''
    this.pending = null
  }

  end(): void {
    this.active = false
    this.down = false
    this.shield = 0
    this.pending = null
  }

  /** The host's state shows our knockout: no need to say it again. */
  acknowledged(): void {
    this.pending = null
  }

  /**
   * A blow from `by` that counts: takes `damage`. True when it knocked us out — the body is thrown
   * away from `from` and the knockout is reported.
   */
  hit(by: string, weapon: WeaponId, damage: number, from: V3, now: number): boolean {
    if (!this.active || this.down || this.shield > 0 || !(damage > 0)) return false
    this.lastBy = by
    this.lastWeapon = weapon
    this.lastAt = now
    this.sinceHit = 0
    this.hp = Math.max(0, this.hp - damage)
    if (this.hp > 0) return false
    const ctx = this.ctx
    const p = ctx.player.position
    let dx = p.x - from.x
    let dz = p.z - from.z
    const l = Math.hypot(dx, dz)
    if (l < 1e-3) {
      dx = -Math.sin(ctx.player.yaw)
      dz = -Math.cos(ctx.player.yaw)
    } else {
      dx /= l
      dz /= l
    }
    this.goDown(by, weapon, now)
    ctx.player.knock({ x: dx * THROW, y: THROW_UP, z: dz * THROW }, true)
    // The usual death path: limp, fade, back at the mode's spawn point.
    ctx.game.playerDied('enemy')
    return true
  }

  update(dt: number, now: number): void {
    if (!this.active) return
    this.sinceHit += dt
    if (this.shield > 0 && !this.down) this.shield = Math.max(0, this.shield - dt)
    const p = this.pending
    if (p && now - p.at >= RESEND_GAP) {
      p.at = now
      this.report(p.by, p.weapon)
      if (--p.left <= 0) this.pending = null
    }
  }

  dispose(): void {
    for (const off of this.unsubs) off()
    this.unsubs = []
  }

  private goDown(by: string, weapon: WeaponId, now: number): void {
    this.down = true
    this.hp = 0
    this.pending = { by, weapon, at: now, left: RESENDS }
    this.report(by, weapon)
  }

  /** The hero died some other way mid-round (off the map, into the sea): a knockout all the same. */
  private fell(): void {
    if (!this.active || this.down) return
    const now = performance.now() / 1000
    const recent = now - this.lastAt < FALL_CREDIT
    this.goDown(recent ? this.lastBy : '', recent ? this.lastWeapon : 'fists', now)
  }

  private respawned(): void {
    if (!this.active) return
    this.down = false
    this.hp = this.max
    this.shield = PROTECT
    this.lastBy = ''
  }
}
