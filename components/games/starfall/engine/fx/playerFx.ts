/**
 * Effects that follow the hero's own motion, emitted a little every frame rather than
 * as one burst: wind streaks at a sprint, the glowing afterimage of a dash, a puff of
 * dust when he skids out of a sprint and the foam wake he drags through shallow water.
 * Everything goes through the shared particle pools (no objects of its own).
 */
import * as THREE from 'three'
import { surfaceAt, waterLevelAt } from '../world/heightfield'
import type { Ctx } from '../types'
import { SURFACE_DUST } from './dust'
import type { Particles } from './Particles'

/** Sprinting starts this far above the run speed (×). */
const SPRINT = 1.12
/** Wind streaks per second at a sprint ('high' quality; never thinned below half); a dash doubles it. */
const WIND_RATE = 36
/** Streaks rush back past the hero this much faster than he moves (×). */
const WIND_SPEED = 2.2
/** Dash afterimage: gap between ghosts along the path (m) and their heights on the body (m). */
const GHOST_GAP = 0.24
const GHOST_HEIGHTS = [0.4, 0.9, 1.35]
/** Dropping below this fraction of the run speed within SKID_WINDOW s of sprinting is a skid. */
const SKID_BELOW = 0.75
const SKID_WINDOW = 0.3
/** Foam puffs per metre waded, and the slowest wade that leaves a wake (m/s). */
const WAKE_RATE = 2.4
const WAKE_MIN_SPEED = 0.8

export class PlayerFx {
  private windAcc = 0
  private wakeAcc = 0
  private wakeSide = 1
  private sinceSprint = 1
  private skidded = true
  private dashing = false
  private last = new THREE.Vector3()

  constructor(
    private ctx: Ctx,
    private fx: Particles,
  ) {}

  update(dt: number): void {
    const p = this.ctx.player
    if (!p || this.ctx.game.phase !== 'playing') {
      this.dashing = false
      return
    }
    const m = p.motion
    const pos = p.position
    const vx = p.velocity.x
    const vz = p.velocity.z
    const speed = Math.hypot(vx, vz)
    const dash = m.state === 'dash'
    const sprint = m.grounded && speed > m.runSpeed * SPRINT

    if ((sprint || dash) && speed > 1) this.wind(dt, pos, vx / speed, vz / speed, speed, dash)
    if (dash) this.ghost(pos)
    this.dashing = dash
    this.last.copy(pos)

    if (sprint) {
      this.sinceSprint = 0
      this.skidded = false
    } else {
      this.sinceSprint += dt
      if (!this.skidded && m.grounded && this.sinceSprint < SKID_WINDOW && speed < m.runSpeed * SKID_BELOW) this.skid(pos, vx, vz)
    }

    if (m.wading > 0.08 && speed > WAKE_MIN_SPEED) this.wake(dt, pos, vx / speed, vz / speed, speed)
  }

  /** Thin streaks born ahead of the hero that rush back past him. */
  private wind(dt: number, pos: THREE.Vector3, dx: number, dz: number, speed: number, dash: boolean): void {
    this.windAcc += dt * WIND_RATE * Math.max(0.5, this.fx.density) * (dash ? 2 : 1)
    const back = -speed * WIND_SPEED
    while (this.windAcc >= 1) {
      this.windAcc -= 1
      const ahead = 1.5 + Math.random() * 2.5
      const side = (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.9)
      // Right of the heading (dx, dz) is (-dz, dx).
      const x = pos.x + dx * ahead - dz * side
      const z = pos.z + dz * ahead + dx * side
      this.fx.one('wind', x, pos.y + 0.25 + Math.random() * 1.5, z, dx * back, 0, dz * back)
    }
  }

  /** Soft glows left standing along the path covered this frame: the dash's afterimage. */
  private ghost(pos: THREE.Vector3): void {
    const from = this.dashing ? this.last : pos
    const dist = from.distanceTo(pos)
    const n = Math.min(8, Math.max(1, Math.ceil(dist / GHOST_GAP)))
    for (let i = 0; i < n; i++) {
      const f = (i + 1) / n
      const x = from.x + (pos.x - from.x) * f
      const y = from.y + (pos.y - from.y) * f
      const z = from.z + (pos.z - from.z) * f
      for (let k = 0; k < GHOST_HEIGHTS.length; k++) this.fx.one('ghost', x, y + GHOST_HEIGHTS[k], z, 0, 0, 0)
    }
  }

  /** Braking hard out of a sprint: the feet throw dust ahead. */
  private skid(pos: THREE.Vector3, vx: number, vz: number): void {
    this.skidded = true
    const color = SURFACE_DUST[surfaceAt(pos.x, pos.z)]
    if (!color) return
    this.fx.burst('dust', pos, { count: 5, scale: 0.85, color })
    this.fx.one('stepPuff', pos.x, pos.y + 0.06, pos.z, vx * 0.35, 0.3, vz * 0.35, 1.8)
  }

  /** Foam shed alternately left and right behind him, spreading outwards: a V-shaped wake. */
  private wake(dt: number, pos: THREE.Vector3, dx: number, dz: number, speed: number): void {
    this.wakeAcc += dt * speed * WAKE_RATE * Math.sqrt(this.fx.density)
    if (this.wakeAcc < 1) return
    this.wakeAcc -= Math.floor(this.wakeAcc)
    const side = (this.wakeSide = -this.wakeSide)
    const y = waterLevelAt(pos.x, pos.z) + 0.04
    const x = pos.x - dx * 0.25 - dz * side * 0.22
    const z = pos.z - dz * 0.25 + dx * side * 0.22
    this.fx.one('wake', x, y, z, -dz * side * 0.7 - dx * 0.15, 0, dx * side * 0.7 - dz * 0.15)
  }
}
