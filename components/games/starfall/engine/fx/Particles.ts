// STUB — replaced by the FX builder.
import type { BurstKind, Ctx, IParticles } from '../types'
import type { V3 } from '../events'

export class Particles implements IParticles {
  constructor(private ctx: Ctx) {}
  init(): void {}
  update(): void {}
  burst(_k: BurstKind, _p: V3): void {}
  streak(_a: V3, _b: V3, _d: number): void {}
  dispose(): void {}
}
