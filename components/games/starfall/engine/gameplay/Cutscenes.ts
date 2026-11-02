// STUB — replaced by the Cutscene builder.
import type { Ctx, ICutscenes } from '../types'
import type { CutsceneName } from '../events'

export class Cutscenes implements ICutscenes {
  active = false
  current: CutsceneName | null = null
  constructor(private ctx: Ctx) {}
  init(): void {}
  update(): void {}
  play(_name: CutsceneName): Promise<void> { return Promise.resolve() }
  skip(): void {}
  dispose(): void {}
}
