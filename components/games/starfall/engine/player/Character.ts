// STUB — replaced by the Character/Animator builder.
import * as THREE from 'three'
import type { Ctx, GestureName, ICharacter, MotionState } from '../types'
import type { V3 } from '../events'

export class Character implements ICharacter {
  readonly root = new THREE.Group()
  constructor(private ctx: Ctx) {}
  init(): void {
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.9, 4, 12), new THREE.MeshStandardMaterial({ color: 0xc9432f }))
    m.position.y = 0.8
    m.castShadow = true
    this.root.add(m)
    this.ctx.scene.add(this.root)
  }
  update(): void {
    const p = this.ctx.player
    this.root.position.copy(p.position)
    this.root.rotation.y = p.yaw
  }
  getHandPosition(out: THREE.Vector3): THREE.Vector3 { return out.copy(this.root.position).add(new THREE.Vector3(0, 1.1, 0)) }
  getHeadPosition(out: THREE.Vector3): THREE.Vector3 { return out.copy(this.root.position).add(new THREE.Vector3(0, 1.5, 0)) }
  setMotion(_m: MotionState): void {}
  playGesture(_n: GestureName): Promise<void> { return Promise.resolve() }
  stopGesture(): void {}
  lookAt(_t: V3 | null): void {}
  setBlink(_on: boolean): void {}
  setVisible(v: boolean): void { this.root.visible = v }
  dispose(): void {}
}
