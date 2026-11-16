/**
 * The glowing arc a weapon leaves mid-swing, shared by the hero (Weapons) and other players'
 * avatars (net/remoteMoves): every frame of the swing hands the path the blade tip (or hammer
 * head) and a point further down covered to the particles. Allocation-free.
 */
import * as THREE from 'three'
import type { IParticles } from '../../types'
import type { HeldWeapon } from './models'

export interface SwingArc {
  /** How far up the grip the blade tip / hammer head is (m). */
  length: number
  color: number
}

export const SWING_ARC: Record<HeldWeapon, SwingArc | null> = {
  sword: { length: 0.8, color: 0xeaf4ff },
  starblade: { length: 0.96, color: 0xffe9a8 },
  hammer: { length: 0.6, color: 0xffd9a0 },
  frostHammer: { length: 0.6, color: 0xbfeaff },
  bow: null,
}

/** The part of a melee move (0..1) during which the weapon is really moving. */
export const ARC_FROM = 0.12
export const ARC_TO = 0.72

export class SwingTrail {
  private live = false
  private readonly tip = new THREE.Vector3()
  private readonly mid = new THREE.Vector3()
  private readonly tip0 = new THREE.Vector3()
  private readonly mid0 = new THREE.Vector3()

  constructor(private fx: IParticles) {}

  /** Continues the arc of a held weapon model this frame. */
  weapon(group: THREE.Object3D, arc: SwingArc): void {
    group.updateWorldMatrix(true, false)
    this.tip.set(0, arc.length, 0).applyMatrix4(group.matrixWorld)
    this.mid.set(0, arc.length * 0.6, 0).applyMatrix4(group.matrixWorld)
    if (this.live) {
      this.fx.trail('slash', this.tip0, this.tip, arc.color)
      this.fx.trail('slash', this.mid0, this.mid, arc.color)
    }
    this.tip0.copy(this.tip)
    this.mid0.copy(this.mid)
    this.live = true
  }

  /** Continues a trail through one moving object (a hand in the fist spin) this frame. */
  point(o: THREE.Object3D, color: number): void {
    o.getWorldPosition(this.tip)
    if (this.live) this.fx.trail('slash', this.tip0, this.tip, color)
    this.tip0.copy(this.tip)
    this.live = true
  }

  stop(): void {
    this.live = false
  }
}
