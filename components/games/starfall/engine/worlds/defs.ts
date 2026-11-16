/**
 * The worlds: Starfall Isle (map 0) and the maps behind its portal arches.
 *
 * Each portal map is built in its own region far from the island and from every other map
 * (≥ 2400 m apart, far beyond the camera's 900 m far plane) and high above the sea, from ZoneKit
 * geometry and colliders. This file is the data half of a map (where it is, its arches,
 * checkpoints, arena, guards, unlock rule, mode spawns); worlds/registry.ts is the code half
 * (builder, boss, reward). No three.js here, so the HUD and the network can share it.
 */
import type { BossId, MapId, MobKind } from '../events'

export interface Spot {
  x: number
  y: number
  z: number
  yaw: number
}

/** A portal arch: the side the player walks in from faces `yaw` (forward = (sin yaw, cos yaw)). */
export interface ArchDef {
  x: number
  z: number
  yaw: number
  /** Ground height under the arch (island arches: read from the terrain at build time). */
  y?: number
}

/** A factory mob guarding part of a map (offsets from the map's centre; it stands on whatever floor is there). */
export interface MobPlacement {
  kind: MobKind
  dx: number
  dz: number
  /** Floor height offset from the centre's y. */
  dy?: number
  yaw?: number
  /** Wander radius and how far it follows the player from home. */
  patrol?: number
  leash?: number
}

/** What wakes a map's island arch: enough star shards, or a boss beaten. */
export type UnlockRule = { shards: number } | { boss: BossId }

export interface MapDef {
  id: PortalMapId
  name: string
  /** The name inside a sentence: 'in the Shadow Rift', 'on Frost Peak'. */
  where: string
  /** What wakes its island arch (Creative: always awake). */
  unlock: UnlockRule
  /** Centre of the map's region; its main floor is at `center.y`. */
  center: { x: number; y: number; z: number }
  /** Soft wall radius around the centre. */
  radius: number
  /** Falling below this respawns the player. */
  killY: number
  /** The island arch leading here. */
  arch: ArchDef
  /** The return arch inside the map. */
  exit: ArchDef
  /** Respawn points in order along the map; the first is the entrance. */
  checkpoints: Spot[]
  boss: BossId
  /** Fight trigger: the player inside this circle (and above `arenaY - 1`). The boss itself moves within the registry's arenaRadius. */
  arena: { x: number; y: number; z: number; r: number }
  objective: string
  /** Portal swirl colours (inner, outer); the Travel menu uses the outer one as the map's accent. */
  swirl: [string, string]
  /** Factory mobs placed on every visit. */
  mobs?: MobPlacement[]
  /** Eight well-spread standing points on the main floor for online game modes (see modeSpawns). */
  spawns?: Spot[]
}

/** Every map but the island. */
export type PortalMapId = Exclude<MapId, 'isle'>

/**
 * Eight mode spawns on a floor around (x, z): alternating between an inner and an outer ring,
 * spread evenly, each facing the middle.
 */
function ringSpawns(c: { x: number; y: number; z: number }, inner: number, outer: number): Spot[] {
  return Array.from({ length: 8 }, (_, i) => {
    const a = ((i + 0.5) / 8) * Math.PI * 2
    const r = i % 2 ? outer : inner
    const x = Math.round((c.x + Math.sin(a) * r) * 100) / 100
    const z = Math.round((c.z + Math.cos(a) * r) * 100) / 100
    return { x, y: c.y, z, yaw: Math.atan2(c.x - x, c.z - z) }
  })
}

const RIFT = { x: 2400, y: 120, z: 0 }
const FROST = { x: -2400, y: 100, z: 0 }
/*
 * The four newer maps share one layout (placeholder scenery until each gets its full map): the
 * entrance ledge with the golden arch lies south (+z) of the arena, a terrace where the guards
 * stand leads north to it, and the boss waits in the middle facing the way in.
 */
const VOLCANIC = { x: 0, y: 110, z: 2400 }
const SKY = { x: 0, y: 160, z: -2400 }
const NEON = { x: 2400, y: 140, z: 2400 }
const GLITCH = { x: -2400, y: 100, z: -2400 }

export const MAPS: Record<PortalMapId, MapDef> = {
  rift: {
    id: 'rift',
    name: 'Shadow Rift',
    where: 'in the Shadow Rift',
    unlock: { shards: 3 },
    center: RIFT,
    radius: 60,
    killY: RIFT.y - 28,
    // Just east of the summit path.
    arch: { x: 10, z: -18, yaw: -Math.PI / 2 },
    exit: { x: RIFT.x, y: RIFT.y, z: RIFT.z + 34.5, yaw: Math.PI },
    checkpoints: [{ x: RIFT.x, y: RIFT.y, z: RIFT.z + 30.5, yaw: Math.PI }],
    boss: 'gloomKing',
    arena: { x: RIFT.x, y: RIFT.y, z: RIFT.z, r: 17 },
    objective: 'Defeat the Gloom King',
    swirl: ['#f0b8ff', '#5a1d9c'],
    // Two guards where the causeway meets the arena, outside the Gloom King's circle.
    mobs: [
      { kind: 'shieldBearer', dx: -3.5, dz: 19.5, yaw: 0, patrol: 2, leash: 7 },
      { kind: 'bomber', dx: 4, dz: 19, yaw: 0, patrol: 2, leash: 8 },
    ],
    // Inside and outside the ring of pillars (radius 13), clear of the rim crystals.
    spawns: ringSpawns(RIFT, 8, 17),
  },
  frost: {
    id: 'frost',
    name: 'Frost Peak',
    where: 'on Frost Peak',
    unlock: { shards: 5 },
    center: FROST,
    radius: 70,
    killY: FROST.y - 26,
    // On the meadow below the Sky Ruins, facing their lantern.
    arch: { x: 80, z: 24, yaw: Math.atan2(-10, -6) },
    exit: { x: FROST.x, y: FROST.y, z: FROST.z + 43, yaw: Math.PI },
    checkpoints: [
      { x: FROST.x, y: FROST.y, z: FROST.z + 38.5, yaw: Math.PI },
      { x: FROST.x + 4, y: FROST.y + 6.5, z: FROST.z - 6, yaw: Math.PI * 1.25 },
    ],
    boss: 'frostGolem',
    arena: { x: FROST.x, y: FROST.y + 14, z: FROST.z - 30, r: 14.5 },
    objective: 'Climb Frost Peak and defeat the Frost Golem',
    swirl: ['#e6fbff', '#2a7fc0'],
    // A patrol on the plateau below the climb: a shield wall with a rusher, mended from behind.
    mobs: [
      { kind: 'shieldBearer', dx: -2.5, dz: 17, yaw: 0, patrol: 3, leash: 16 },
      { kind: 'rusher', dx: 5, dz: 15, yaw: 0, patrol: 4, leash: 16 },
      { kind: 'healer', dx: 0.5, dz: 9, yaw: 0, patrol: 2, leash: 16 },
    ],
    // On the Frost Golem's summit arena (radius 16), inside its rim of rocks and crystals.
    spawns: ringSpawns({ x: FROST.x, y: FROST.y + 14, z: FROST.z - 30 }, 6, 11.5),
  },
  volcanic: {
    id: 'volcanic',
    name: 'Ancient Volcanic Ruins',
    where: 'in the Ancient Volcanic Ruins',
    unlock: { boss: 'gloomKing' },
    center: VOLCANIC,
    radius: 76,
    // The lava sea lies 27 m below the courtyard.
    killY: VOLCANIC.y - 30,
    // In the clearing below Silver Falls, facing east down the path to Beacon Summit.
    arch: { x: -62, z: -20, yaw: 1.8 },
    // The gate plaza, 4 m below the courtyard, south of the Lava River.
    exit: { x: VOLCANIC.x, y: VOLCANIC.y - 4, z: VOLCANIC.z + 67.6, yaw: Math.PI },
    checkpoints: [
      { x: VOLCANIC.x, y: VOLCANIC.y - 4, z: VOLCANIC.z + 63.5, yaw: Math.PI },
      // The temple's forecourt at the top of the stairs, above the courtyard.
      { x: VOLCANIC.x - 1.8, y: VOLCANIC.y + 1.6, z: VOLCANIC.z + 28.3, yaw: Math.PI },
    ],
    boss: 'ironTitan',
    // The Titan's shockwaves run out to its circle + 3 m and its quake ring is 11 m wide: a 20 m
    // circle (registry) in a sunken courtyard 23 m across to its stepped ring, entered from the south.
    arena: { x: VOLCANIC.x, y: VOLCANIC.y, z: VOLCANIC.z, r: 16 },
    objective: 'Cross the ruins and defeat the Iron Titan',
    swirl: ['#ffd9a0', '#d23c0e'],
    // A shield wall and a rusher on the riverside landing past the broken bridge, a bomber
    // lobbing from the landing above.
    mobs: [
      { kind: 'rusher', dx: 1.5, dz: 44.5, dy: -4, yaw: 0, patrol: 2, leash: 12 },
      { kind: 'shieldBearer', dx: -1.6, dz: 43, dy: -4, yaw: 0, patrol: 1.5, leash: 12 },
      { kind: 'bomber', dx: 2.2, dz: 35.6, dy: -1.2, yaw: 0, patrol: 1.5, leash: 10 },
    ],
    // On the courtyard floor, clear of the fallen column, the stumps and the toppled head.
    spawns: ringSpawns(VOLCANIC, 10, 17),
  },
  sky: {
    id: 'sky',
    name: 'Floating Sky Isles',
    where: 'on the Floating Sky Isles',
    unlock: { boss: 'gloomKing' },
    center: SKY,
    radius: 98,
    // The cloud sea rolls 43 m below the main isle's lawn.
    killY: SKY.y - 41,
    // On the high meadows north of Beacon Summit, at the head of the valley that climbs to them
    // between the summit and the falls' mesa (facing down it).
    arch: { x: -42, z: -112, yaw: 0.33 },
    // The arrival isle, 4 m above the main isle and 82 m south of it.
    exit: { x: SKY.x, y: SKY.y + 4, z: SKY.z + 86, yaw: Math.PI },
    checkpoints: [
      { x: SKY.x, y: SKY.y + 4, z: SKY.z + 82, yaw: Math.PI },
      // The gate isle, facing down its bridge to the shrine's gate.
      { x: SKY.x + 10, y: SKY.y + 1.2, z: SKY.z + 38, yaw: Math.PI + 0.257 },
    ],
    boss: 'vortexWeaver',
    // The Weaver flies a 9 m orbit and drags the player toward the middle with its vortex: a 19 m
    // circle (registry) on a 25 m lawn inside a ring of standing stones, so gusts near the rim
    // don't throw anyone off.
    arena: { x: SKY.x, y: SKY.y, z: SKY.z, r: 15 },
    objective: 'Cross the isles and defeat the Vortex Weaver',
    swirl: ['#f2ffe8', '#47b86a'],
    // On the falls isle past the first bridge: a rusher and a healer, a sniper behind them.
    mobs: [
      { kind: 'rusher', dx: -13, dz: 55, dy: 2.5, yaw: 0, patrol: 2.5, leash: 11 },
      { kind: 'healer', dx: -16.5, dz: 58.5, dy: 2.5, yaw: 0, patrol: 1.5, leash: 10 },
      { kind: 'sniper', dx: -20.5, dz: 61, dy: 2.5, yaw: 0, patrol: 1, leash: 8 },
    ],
    // On the main isle's lawn, inside the shrine's ring.
    spawns: ringSpawns(SKY, 9.5, 16.5),
  },
  neon: {
    id: 'neon',
    name: 'Cyberpunk Neon Metropolis',
    where: 'in the Neon Metropolis',
    unlock: { boss: 'frostGolem' },
    center: NEON,
    radius: 80,
    killY: NEON.y - 30,
    // In the fields east of Meadow Village, facing the village.
    arch: { x: 50, z: 68, yaw: Math.atan2(-36, -16) },
    // On the arrival roof, 5 m below the helipad and south of the megatower.
    exit: { x: NEON.x, y: NEON.y - 5, z: NEON.z + 66.5, yaw: Math.PI },
    checkpoints: [
      { x: NEON.x, y: NEON.y - 5, z: NEON.z + 62.5, yaw: Math.PI },
      // On the megatower's apron, across the bridge.
      { x: NEON.x - 5, y: NEON.y, z: NEON.z + 23.5, yaw: Math.PI },
    ],
    boss: 'plasmaOverlord',
    // The Overlord's sweeping beams reach 1.35 × its circle: an 18 m circle (registry) on a 22 m
    // helipad keeps every beam over the floor or just past its rim.
    arena: { x: NEON.x, y: NEON.y, z: NEON.z, r: 14.5 },
    objective: 'Defeat the Plasma Overlord on the helipad',
    swirl: ['#ffd6fb', '#d02ad6'],
    // On the apron: a turret thrower behind a shield, and a sniper painting the way in.
    mobs: [
      { kind: 'shieldBearer', dx: -2.5, dz: 28.5, yaw: 0, patrol: 2, leash: 12 },
      { kind: 'turretSpawner', dx: -3, dz: 32, yaw: 0, patrol: 2, leash: 12 },
      { kind: 'sniper', dx: 3.5, dz: 32.5, yaw: 0, patrol: 1.5, leash: 10 },
    ],
    spawns: ringSpawns(NEON, 9, 16),
  },
  glitch: {
    id: 'glitch',
    name: 'Glitch Grid',
    where: 'in the Glitch Grid',
    unlock: { boss: 'frostGolem' },
    center: GLITCH,
    // Out to the entrance pad, 66 m south of the arena's centre (the layout is in worlds/glitch.ts).
    radius: 74,
    killY: GLITCH.y - 30,
    // In the meadow south of Whispering Wood, facing the village.
    arch: { x: -54, z: 78, yaw: 1.4 },
    // On the entrance pad, 3 m above the arena floor.
    exit: { x: GLITCH.x, y: GLITCH.y + 3, z: GLITCH.z + 63.4, yaw: Math.PI },
    // The entrance, and the bridge tile before the arena.
    checkpoints: [
      { x: GLITCH.x, y: GLITCH.y + 3, z: GLITCH.z + 59.3, yaw: Math.PI },
      { x: GLITCH.x, y: GLITCH.y + 0.6, z: GLITCH.z + 26, yaw: Math.PI },
    ],
    boss: 'voidStalker',
    // The Stalker blinks to 2.3 m behind the player and circles clones around them: an 18 m circle
    // (registry) on an octagonal floor 22 m to each side leaves room for a blink behind someone
    // standing at the edge.
    arena: { x: GLITCH.x, y: GLITCH.y, z: GLITCH.z, r: 14.5 },
    objective: 'Defeat the Void Stalker in the Glitch Grid',
    swirl: ['#e6fffb', '#0fb8b0'],
    // On the guards' deck (1.2 m above the arena floor; the gaps round it keep them there): a
    // rusher and a bomber in front, a turret thrower behind them.
    mobs: [
      { kind: 'rusher', dx: -3.5, dz: 33.5, dy: 1.2, yaw: 0, patrol: 2.5, leash: 8 },
      { kind: 'bomber', dx: 3.5, dz: 34, dy: 1.2, yaw: 0, patrol: 2, leash: 8 },
      { kind: 'turretSpawner', dx: 0, dz: 37.5, dy: 1.2, yaw: 0, patrol: 1.5, leash: 8 },
    ],
    // On the arena floor, inside its ring of pylons (22.3 m out).
    spawns: ringSpawns(GLITCH, 9, 16),
  },
}

/** Every portal map, in the order the menus list them (the Travel menu puts the island first). */
export const PORTAL_MAPS: readonly MapDef[] = [MAPS.rift, MAPS.frost, MAPS.volcanic, MAPS.sky, MAPS.neon, MAPS.glitch]

/** The 'boss' cutscene's argument is an index into this list (append only). */
export const BOSS_IDS: readonly BossId[] = ['gloomKing', 'frostGolem', 'ironTitan', 'vortexWeaver', 'plasmaOverlord', 'voidStalker']

export const BOSS_NAMES: Record<BossId, string> = {
  gloomKing: 'Gloom King',
  frostGolem: 'Frost Golem',
  ironTitan: 'Iron Titan',
  vortexWeaver: 'Vortex Weaver',
  plasmaOverlord: 'Plasma Overlord',
  voidStalker: 'Void Stalker',
}

export const MAP_NAMES: Record<MapId, string> = {
  isle: 'Starfall Isle',
  rift: MAPS.rift.name,
  frost: MAPS.frost.name,
  volcanic: MAPS.volcanic.name,
  sky: MAPS.sky.name,
  neon: MAPS.neon.name,
  glitch: MAPS.glitch.name,
}

/** Has this progress met the rule? */
export function unlockMet(rule: UnlockRule, shards: number, bosses: readonly BossId[]): boolean {
  return 'shards' in rule ? shards >= rule.shards : bosses.includes(rule.boss)
}

/** The map a boss guards. */
export function lairOf(boss: BossId): MapDef | undefined {
  return PORTAL_MAPS.find(m => m.boss === boss)
}

/** What still opens a sealed arch, as a menu line: "Find 3 star shards (1 of 3)", "Defeat the Gloom King in the Shadow Rift". */
export function unlockText(rule: UnlockRule, shards: number): string {
  if ('shards' in rule) return `Find ${rule.shards} star shards (${Math.min(shards, rule.shards)} of ${rule.shards})`
  return `Defeat the ${BOSS_NAMES[rule.boss]} ${lairOf(rule.boss)?.where ?? ''}`.trimEnd()
}

const NO_SPAWNS: readonly Spot[] = []

/**
 * Where players stand at the start of an online game mode hosted on a map (Infection,
 * Juggernaut, Gun Game, Boss Raid): eight well-spread points on its main floor, each facing the
 * middle (yaw as everywhere: 0 faces +z). Empty for the island, which has its own mode spawns
 * (net/modes).
 */
export function modeSpawns(map: MapId): readonly Spot[] {
  return map === 'isle' ? NO_SPAWNS : (MAPS[map].spawns ?? NO_SPAWNS)
}

/** Wire codes for the network (append new maps at the end; older clients read unknown codes as the island). */
const MAP_CODES: readonly MapId[] = ['isle', 'rift', 'frost', 'volcanic', 'sky', 'neon', 'glitch']

/** How many map wire codes exist (net/protocol rejects anything beyond). */
export const MAP_CODE_COUNT = MAP_CODES.length

export function mapCode(m: MapId): number {
  return Math.max(0, MAP_CODES.indexOf(m))
}

export function mapFromCode(code: number): MapId {
  return MAP_CODES[code] ?? 'isle'
}
