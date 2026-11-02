// STUB — replaced by the Gameplay builder.
import type { Ctx, IEnemies } from '../types'

export class Enemies implements IEnemies {
  frozen = false
  constructor(private ctx: Ctx) {}
  init(): void {}
  update(): void {}
  syncWithSave(): void {}
  aliveNear(): number { return 0 }
  dispose(): void {}
}
