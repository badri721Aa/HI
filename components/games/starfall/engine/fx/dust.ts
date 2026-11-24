/** What the ground gives off when it is scuffed, landed on or struck: a dust tint per surface. */
import { surfaceAt, type Surface } from '../world/heightfield'
import type { V3 } from '../events'

export const DEFAULT_DUST = '#b7ae88'

/** Dust tint per ground surface (null = no dust). */
export const SURFACE_DUST: Record<Surface, string | null> = {
  grass: '#b7ae88', sand: '#e6d3a4', dirt: '#a9885f', rock: '#b3ab9e', stone: '#b9b2a5',
  wood: '#b49c78', leaves: '#8f8a5c', metal: '#a2a2a2', water: null, snow: '#f2f7ff', ice: '#d6ecf8',
}

/** Dust tint of the terrain at `p` (jump, dash and impact puffs). */
export function dustAt(p: V3): string {
  return SURFACE_DUST[surfaceAt(p.x, p.z)] ?? DEFAULT_DUST
}
