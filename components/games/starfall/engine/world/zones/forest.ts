// STUB — replaced by a zone builder.
import type { Ctx } from '../../types'
import { ZoneKit, type ZonePart } from './kit'

export function buildForest(ctx: Ctx): ZonePart {
  const kit = new ZoneKit(ctx, 'forest')
  kit.finalize()
  return { dispose: () => kit.dispose() }
}
