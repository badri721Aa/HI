/**
 * Body language layered over an enemy's clips: the weight and the reactions no clip gives.
 * It tilts and squashes the model's scaled holder about its feet with a few springs (no
 * allocation, a handful of multiplications per frame); whatever else hangs on the model's root
 * (a rune circle on the floor) stays level:
 *
 *   lean      into its own acceleration, rocking back past upright when it stops
 *   flinch    a blow rocks the body along it and squashes it for a moment
 *   breath    a slow swell, so a standing enemy is never frozen
 *   wind-up   anticipation: it sinks and leans back, coiled, then throws itself into the strike
 *   pop       a stretch that settles: the end of an entrance, a recoil
 */
import * as THREE from 'three'
import { Spring, clamp, damp } from '../../player/anim/math'

/** Lean per m/s² of acceleration (rad), and its limit. */
const LEAN_PER_ACCEL = 0.011
const LEAN_MAX = 0.2
/** How far back a full wind-up leans (rad) and how much it squashes. */
const COIL_LEAN = 0.13
const COIL_SQUASH = 0.07
const TILT_MAX = 0.42

const _e = new THREE.Euler()
const _q = new THREE.Quaternion()

export class BodyMotion {
  private readonly base = new THREE.Vector3()
  private readonly baseQ = new THREE.Quaternion()
  private readonly pitch = new Spring()
  private readonly roll = new Spring()
  private readonly squash = new Spring()
  private coil = 0
  private coilTarget = 0
  private t: number
  private pvx = 0
  private pvz = 0
  private ax = 0
  private az = 0
  private moved = false

  /**
   * `body` is the model's scaled holder (feet at its origin, under the root that carries the
   * heading). Heavy bodies (`mass`) react less; `rigid` ones (turrets) never tilt or breathe, they
   * only recoil.
   */
  constructor(private readonly body: THREE.Object3D, private readonly mass: number, seed: number, private readonly rigid = false) {
    this.base.copy(body.scale)
    this.baseQ.copy(body.quaternion)
    this.t = (seed * 1.37) % 6.283
  }

  /** A blow travelling along (dx, dz) (world, any length) on a body facing `yaw`: it rocks that way and squashes. */
  flinch(dx: number, dz: number, yaw: number, strength = 1): void {
    const l = Math.hypot(dx, dz)
    const k = strength / Math.sqrt(Math.max(0.5, this.mass))
    this.squash.v += 3 * k
    if (this.rigid || !(l > 1e-4)) return
    const s = Math.sin(yaw)
    const c = Math.cos(yaw)
    this.pitch.v += ((dx * s + dz * c) / l) * 5.5 * k
    this.roll.v -= ((dx * c - dz * s) / l) * 5.5 * k
  }

  /** A stretch upward that settles (the end of an entrance); a negative strength squashes instead (stomped on). */
  pop(strength = 1): void {
    this.squash.v -= 3.2 * strength
  }

  /** Anticipation for this frame (0..1); call every frame of a wind-up. Letting go throws the body forward. */
  windup(amount: number): void {
    this.coilTarget = clamp(amount, 0, 1)
  }

  /** `vx, vz`: the body's velocity (m/s); `yaw`: its heading; `still`: frozen solid or dead (springs settle, no breath). */
  update(dt: number, vx: number, vz: number, yaw: number, still: boolean): void {
    if (!(dt > 0)) return
    this.t += dt

    // Wind-up: sinks in slowly, lets go at once (and the release kicks the lean forward).
    const coilTo = still ? 0 : this.coilTarget
    if (coilTo < this.coil - 0.3 && !this.rigid) this.pitch.v += 2.2 * (this.coil - coilTo) / Math.sqrt(Math.max(0.5, this.mass))
    this.coil = coilTo > this.coil ? damp(this.coil, coilTo, 9, dt) : damp(this.coil, coilTo, 24, dt)
    this.coilTarget = 0

    let leanX = 0
    let leanZ = 0
    if (!this.rigid && !still) {
      // Acceleration in the body's own frame (smoothed: velocities come in steps).
      const s = Math.sin(yaw)
      const c = Math.cos(yaw)
      const rax = this.moved ? clamp((vx - this.pvx) / dt, -30, 30) : 0
      const raz = this.moved ? clamp((vz - this.pvz) / dt, -30, 30) : 0
      this.ax = damp(this.ax, rax, 10, dt)
      this.az = damp(this.az, raz, 10, dt)
      leanX = clamp((this.ax * s + this.az * c) * LEAN_PER_ACCEL, -LEAN_MAX, LEAN_MAX) - COIL_LEAN * this.coil
      leanZ = clamp(-(this.ax * c - this.az * s) * LEAN_PER_ACCEL, -LEAN_MAX, LEAN_MAX)
    }
    this.pvx = vx
    this.pvz = vz
    this.moved = true

    const px = clamp(this.pitch.step(leanX, 9, 0.45, dt), -TILT_MAX, TILT_MAX)
    const pz = clamp(this.roll.step(leanZ, 9, 0.45, dt), -TILT_MAX, TILT_MAX)
    const breath = this.rigid || still ? 0 : 0.012 * Math.sin(this.t * 1.9)
    const sq = clamp(this.squash.step(COIL_SQUASH * this.coil, 15, 0.38, dt) + breath, -0.14, 0.18)

    // The tilt is in the heading's frame, on top of whatever turn the model came with.
    this.body.quaternion.copy(this.baseQ).premultiply(_q.setFromEuler(_e.set(px, 0, pz)))
    const wide = 1 + sq * 0.5
    this.body.scale.set(this.base.x * wide, this.base.y * (1 - sq), this.base.z * wide)
  }

  /** Back to rest at once (pooled or reset bodies). */
  reset(): void {
    this.pitch.reset()
    this.roll.reset()
    this.squash.reset()
    this.coil = this.coilTarget = this.ax = this.az = 0
    this.moved = false
    this.body.quaternion.copy(this.baseQ)
    this.body.scale.copy(this.base)
  }
}
