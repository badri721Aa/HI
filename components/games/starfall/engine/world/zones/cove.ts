// STUB — replaced by a zone builder.
import type { Ctx } from '../../types'
import { ZoneKit, type ZonePart } from './kit'

export function buildCove(ctx: Ctx): ZonePart {
  const kit = new ZoneKit(ctx, 'cove')
  kit.finalize()
  return { dispose: () => kit.dispose() }
}
