// STUB — replaced by the Audio builder.
import type { Ctx, IAudio, SfxName } from '../types'
import type { MusicMood } from '../events'

export class AudioEngine implements IAudio {
  constructor(private ctx: Ctx) {}
  init(): void {}
  update(): void {}
  unlock(): void {}
  applySettings(): void {}
  ui(_n: SfxName): void {}
  setMusic(_m: MusicMood): void {}
  setPaused(_p: boolean): void {}
  dispose(): void {}
}
