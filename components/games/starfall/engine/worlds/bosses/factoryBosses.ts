/** The Enemy Factory's boss classes by kind. */
import type { FactoryBossKind } from '../../events'
import type { ArenaCircle, Ctx } from '../../types'
import type { Hazards } from './hazards'
import { IronTitan } from './IronTitan'
import { PlasmaOverlord } from './PlasmaOverlord'
import type { BossKit, ScriptedBoss } from './ScriptedBoss'
import { VoidStalker } from './VoidStalker'
import { VortexWeaver } from './VortexWeaver'

type BossClass = new (ctx: Ctx, hazards: Hazards, arena: ArenaCircle, kit: BossKit, uid: number, seed: number) => ScriptedBoss

const CLASSES: Record<FactoryBossKind, BossClass> = {
  ironTitan: IronTitan,
  vortexWeaver: VortexWeaver,
  plasmaOverlord: PlasmaOverlord,
  voidStalker: VoidStalker,
}

/** A boss of `kind` on `arena`; call reset() before use (the factory does). */
export function createBoss(kind: FactoryBossKind, ctx: Ctx, hazards: Hazards, arena: ArenaCircle, kit: BossKit, uid: number, seed: number): ScriptedBoss {
  return new CLASSES[kind](ctx, hazards, arena, kit, uid, seed)
}
