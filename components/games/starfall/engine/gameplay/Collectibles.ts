// STUB — replaced by the Gameplay builder.
import * as THREE from 'three'
import type { Ctx, ICollectibles } from '../types'
import { SHARDS } from '../world/level'

export class Collectibles implements ICollectibles {
  readonly sparkTotal = 0
  constructor(private ctx: Ctx) {}
  init(): void {}
  update(): void {}
  syncWithSave(): void {}
  shardPosition(i: number): THREE.Vector3 { const s = SHARDS[i]; return new THREE.Vector3(s.x, s.y, s.z) }
  hideShard(): void {}
  dispose(): void {}
}
