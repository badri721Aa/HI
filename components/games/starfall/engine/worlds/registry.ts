/**
 * The Map Manager's registry: the code half of every portal map, keyed by its id. The data half
 * (where everything stands: arches, checkpoints, arena, guards, unlock rule, mode spawns) is its
 * MapDef in defs.ts. Worlds reads nothing else, so a map is: a MapDef, an entry here, its builder
 * file, and an atmosphere preset (world/env/atmosphere.ts MAP_DEFS).
 */
import type { FactoryBossKind, WeaponId } from '../events'
import { BOSSES } from '../gameplay/enemies/defs'
import type { Ctx } from '../types'
import type { ZoneKit } from '../world/zones/kit'
import type { Arena, Boss } from './bosses/Boss'
import { FrostGolem } from './bosses/FrostGolem'
import { GloomKing, type Pillar } from './bosses/GloomKing'
import type { HazardColors, Hazards } from './bosses/hazards'
import type { MapDef, PortalMapId } from './defs'
import { buildFrost, FROST_RADIUS } from './frost'
import { buildGlitch, GLITCH_RADIUS } from './glitch'
import { buildNeon, NEON_RADIUS } from './neon'
import { buildRift, RIFT_RADIUS } from './rift'
import { buildSky, SKY_RADIUS } from './sky'
import { buildVolcanic, VOLCANIC_RADIUS } from './volcanic'

/** What a map's builder hands back. Static scenery and colliders go into the kit (Worlds disposes it). */
export interface MapBuild {
  /** Pillars a charging boss crashes into (only the Gloom King charges). */
  pillars?: readonly Pillar[]
  /** Animate the scenery, every frame while the map is current (`t`: the game clock, s). */
  update(dt: number, t: number): void
  /** Free what the builder made outside the kit: its own materials, geometries, textures, colliders. */
  dispose(): void
}

/** Builds a map's scenery into `kit` (on arrival, behind the travel fade); everything stands where its MapDef says. */
export type MapBuilder = (ctx: Ctx, kit: ZoneKit, def: MapDef) => MapBuild

export interface MapSpec {
  build: MapBuilder
  /** The boss's own circle (m): it moves and aims inside it. The fight trigger is the MapDef's (smaller) arena circle. */
  arenaRadius: number
  /** The boss, asleep in its arena (`arena.y` is the floor it stands on). */
  boss(ctx: Ctx, hazards: Hazards, arena: Arena, build: MapBuild): Boss
  /** The boss's face above its feet (m): the intro cutscene frames it. */
  head: number
  /** Telegraph colours for the boss's hazards. */
  hazards: HazardColors
  /** The weapon in the arena's reward chest; null: no chest (the boss drops hearts instead). */
  reward: Exclude<WeaponId, 'fists'> | null
  /** Set when the boss is one of the Enemy Factory's: its drops fall where it dies, and a stand-in built before its model arrived is swapped for the model while it sleeps. */
  factoryBoss?: FactoryBossKind
  /** Toast line when its island arch wakes: where to find it. */
  archHint: string
}

/** A map guarded by one of the Enemy Factory's scripted bosses. */
function scripted(kind: FactoryBossKind, build: MapBuilder, arenaRadius: number, archHint: string): MapSpec {
  const def = BOSSES[kind]
  return {
    build,
    arenaRadius,
    boss: (ctx, hazards, arena) => ctx.factory.mapBoss(kind, hazards, arena),
    head: def.hover + def.height * 0.85,
    hazards: { ring: def.ring, warn: def.warn },
    reward: null,
    factoryBoss: kind,
    archHint,
  }
}

export const MAP_SPECS: Record<PortalMapId, MapSpec> = {
  rift: {
    build: buildRift,
    arenaRadius: RIFT_RADIUS,
    boss: (ctx, hazards, arena, build) => new GloomKing(ctx, hazards, arena, build.pillars ?? []),
    head: 4.2,
    hazards: { ring: '#b46bff', warn: '#ff5ad1' },
    reward: 'starblade',
    archHint: 'The ancient arch beside the summit path hums with violet light.',
  },
  frost: {
    build: buildFrost,
    arenaRadius: FROST_RADIUS,
    boss: (ctx, hazards, arena) => new FrostGolem(ctx, hazards, arena),
    head: 4.6,
    hazards: { ring: '#bfeaff', warn: '#6fd0ff' },
    reward: 'frostHammer',
    archHint: 'The arch on the meadow below the Sky Ruins glitters with frost.',
  },
  volcanic: scripted('ironTitan', buildVolcanic, VOLCANIC_RADIUS, 'The arch in the clearing below Silver Falls glows like embers.'),
  sky: scripted('vortexWeaver', buildSky, SKY_RADIUS, 'Up the valley west of Beacon Summit, an arch on the high meadows stirs with wind.'),
  neon: scripted('plasmaOverlord', buildNeon, NEON_RADIUS, 'The arch in the fields east of Meadow Village hums with neon light.'),
  glitch: scripted('voidStalker', buildGlitch, GLITCH_RADIUS, 'The arch south of Whispering Wood flickers strangely.'),
}
