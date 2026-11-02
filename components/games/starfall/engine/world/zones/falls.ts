// STUB — replaced by a zone builder.
import type { Ctx } from '../../types'
import { ZoneKit, type ZonePart } from './kit'

export function buildFalls(ctx: Ctx): ZonePart {
  const kit = new ZoneKit(ctx, 'falls')
  kit.finalize()
  return { dispose: () => kit.dispose() }
}
