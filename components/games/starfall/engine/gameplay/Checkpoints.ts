// STUB — replaced by the Gameplay builder.
import type { Ctx, ICheckpoints } from '../types'
import { CHECKPOINTS } from '../world/level'
import { heightAt } from '../world/heightfield'

export class Checkpoints implements ICheckpoints {
  constructor(private ctx: Ctx) {}
  init(): void {}
  update(): void {}
  syncWithSave(): void {}
  spawnPoint(id: string) {
    const c = CHECKPOINTS.find(x => x.id === id) ?? CHECKPOINTS[0]
    return { x: c.x, y: heightAt(c.x, c.z), z: c.z, yaw: c.yaw }
  }
  dispose(): void {}
}
