// STUB — replaced by the Player/Camera builder. Walks on terrain only.
import * as THREE from 'three'
import type { Ctx, IPlayerController, MotionState, PlayerState } from '../types'
import type { V3 } from '../events'
import { heightAt } from '../world/heightfield'

export class PlayerController implements IPlayerController {
  readonly position = new THREE.Vector3()
  readonly velocity = new THREE.Vector3()
  yaw = 0
  state: PlayerState = 'idle'
  hp = 5
  readonly maxHp = 5
  grounded = true
  dashReady = 1
  invulnerable = false
  readonly radius = 0.35
  readonly height = 1.6
  controlEnabled = true
  attacking = false
  stompSpeed = 0
  readonly motion: MotionState = { state: 'idle', stateTime: 0, speed: 0, walkSpeed: 2, runSpeed: 5.5, sprintSpeed: 8.5, vy: 0, grounded: true, turnRate: 0, landImpact: 0, wading: 0, slope: 0 }
  constructor(private ctx: Ctx) {}
  init(): void {}
  update(dt: number): void {
    const s = this.ctx.input.state
    const yaw = this.ctx.cameraRig.yaw
    const fx = Math.sin(yaw), fz = Math.cos(yaw)
    const rx = -Math.cos(yaw), rz = Math.sin(yaw)
    const mx = this.controlEnabled ? fx * s.moveY + rx * s.moveX : 0
    const mz = this.controlEnabled ? fz * s.moveY + rz * s.moveX : 0
    const speed = s.sprint ? 8.5 : 5.5
    this.position.x += mx * speed * dt
    this.position.z += mz * speed * dt
    this.position.y = heightAt(this.position.x, this.position.z)
    if (mx || mz) this.yaw = Math.atan2(mx, mz)
    this.motion.speed = Math.hypot(mx, mz) * speed
    this.motion.state = this.motion.speed > 0.1 ? 'move' : 'idle'
  }
  teleport(x: number, y: number, z: number, yaw: number): void { this.position.set(x, y, z); this.yaw = yaw }
  hurt(_a: number, _f: V3): void {}
  heal(a: number): void { this.hp = Math.min(this.maxHp, this.hp + a) }
  resetHealth(): void { this.hp = this.maxHp }
  launch(vy: number): void { this.velocity.y = vy }
  dispose(): void {}
}
