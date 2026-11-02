// STUB — replaced by a zone builder.
import type { Ctx } from '../../types'
import { ZoneKit, type ZonePart } from './kit'

export function buildRuins(ctx: Ctx): ZonePart {
  const kit = new ZoneKit(ctx, 'ruins')
  kit.finalize()
  return { dispose: () => kit.dispose() }
}
