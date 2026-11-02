// STUB — replaced by the FX builder. Plain forward render.
import type { Ctx, IPostFX } from '../types'

export class PostFX implements IPostFX {
  constructor(private ctx: Ctx) {}
  init(): void {}
  update(): void {}
  render(): void { this.ctx.renderer.render(this.ctx.scene, this.ctx.camera) }
  setSize(): void {}
  applyQuality(): void {}
  dispose(): void {}
}
