// STUB — replaced by the Player/Camera builder.
import type { Ctx, ICameraRig } from '../types'

export class CameraRig implements ICameraRig {
  yaw = Math.PI
  pitch = 0.3
  mode: 'follow' | 'scripted' | 'title' = 'title'
  constructor(private ctx: Ctx) {}
  init(): void {}
  update(dt: number): void {
    const { camera, input, player } = this.ctx
    if (this.mode === 'scripted') return
    if (this.mode === 'title') {
      this.yaw += dt * 0.05
    } else {
      this.yaw -= input.state.lookX
      this.pitch = Math.max(-0.4, Math.min(1.2, this.pitch + input.state.lookY))
    }
    const p = player.position
    const d = 6
    camera.position.set(p.x - Math.sin(this.yaw) * Math.cos(this.pitch) * d, p.y + 1.5 + Math.sin(this.pitch) * d, p.z - Math.cos(this.yaw) * Math.cos(this.pitch) * d)
    camera.lookAt(p.x, p.y + 1.4, p.z)
  }
  snapBehind(): void { this.yaw = this.ctx.player.yaw }
  shake(): void {}
  kickFov(): void {}
  dispose(): void {}
}
