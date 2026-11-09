/**
 * Starfall Isle — where everything goes.
 *
 * Landmark anchors are the contract between zone builders and gameplay:
 * a builder constructs geometry around its anchor so the shard placed here
 * is reachable, and gameplay spawns collectibles exactly at these points.
 * All y values marked `abs` are absolute metres; others are relative to ground.
 */
import { heightAt, LAKES, type ZoneId } from './heightfield'

export const TOTAL_SHARDS = 7

/** Where a fresh game starts (facing north, toward the island). */
export const SPAWN = { x: 0, z: 118, yaw: Math.PI }

/* ────────────────────────────────────────────────────────────
   Landmarks (zone builders build around these)
   ──────────────────────────────────────────────────────────── */

/** Wooden pier running south into the sea. Deck top at `deckY`. */
export const PIER = { x: 14, z0: 124, z1: 152, width: 3.2, deckY: 1.7 }

/** Village windmill; climbable via crates → shed roof → balcony → cap. */
export const WINDMILL = { x: 26, z: 44, towerHeight: 12, balconyY: 7, capY: 11.2 }

/** Village houses (footprint centre, yaw, size). */
export const HOUSES: Array<{ x: number; z: number; yaw: number; w: number; d: number }> = [
  { x: -12, z: 60, yaw: 0.3, w: 7, d: 6 },
  { x: -16, z: 40, yaw: -0.4, w: 6, d: 6 },
  { x: 16, z: 66, yaw: 2.6, w: 7, d: 5.5 },
  { x: 8, z: 30, yaw: 3.4, w: 6, d: 5 },
]
export const WELL = { x: 2, z: 50 }

/** Giant mushroom grove in the forest: bounce pad + spiral of caps up to the shard. */
export const GROVE = { x: -94, z: 30, padX: -86, padZ: 30, topY: 14 }

/** Ruins tower on the plateau; moving platforms climb to its crown. */
export const RUINS_TOWER = { x: 92, z: 2, height: 16 }

const lakeLevel = (id: string) => LAKES.find(l => l.id === id)!.level

/**
 * Silver Falls. The mesa's south cliff runs roughly z = -52 (foot, y≈4) to z = -56 (lip, y≈16).
 * An overhanging rock shelf juts out from the lip to `curtainZ`; the water curtain falls from its
 * front edge into the pool. A stone ledge (top at `ledgeY`) hides between the curtain and the cliff.
 */
export const FALLS = { x: -66, topY: 16.2, curtainZ: -49.5, ledgeZ: -51.2, ledgeY: 4.4, poolX: -64, poolZ: -42, poolLevel: lakeLevel('pool') }

/** Tiny rocky islet in the middle of Mirror Lake, reached by lily pads. `topY` is absolute. */
export const ISLET = { x: 62, z: -66, r: 3.2, lakeLevel: lakeLevel('mirror'), topY: lakeLevel('mirror') + 0.9 }

/** Beached shipwreck in the cove; its crow's nest platform top is at absolute `nestY`. */
export const WRECK = { x: 98, z: 84, yaw: -0.7, deckY: 3.2, nestY: 12 }

/** The Beacon at the summit. */
export const BEACON = { x: 0, z: -60, towerHeight: 11 }

/** Weapons waiting on their stands: the sword in a stone by the spawn, the hammer by the well, the bow at the ruins gate. */
export const WEAPON_STANDS: Array<{ weapon: 'sword' | 'hammer' | 'bow'; x: number; z: number; yaw: number }> = [
  { weapon: 'sword', x: -2.4, z: 112.4, yaw: 0.35 },
  { weapon: 'hammer', x: 4.1, z: 50.6, yaw: -0.6 },
  { weapon: 'bow', x: 75.2, z: 15.8, yaw: -2.2 },
]

/* ────────────────────────────────────────────────────────────
   Star shards
   ──────────────────────────────────────────────────────────── */

export interface ShardDef {
  index: number
  name: string
  zone: ZoneId
  x: number
  /** absolute */
  y: number
  z: number
  hint: string
}

const g = (x: number, z: number) => heightAt(x, z)

export const SHARDS: ShardDef[] = [
  { index: 0, name: 'Tideglass Shard', zone: 'beach', x: PIER.x, y: PIER.deckY + 1.3, z: PIER.z1 - 1.5, hint: 'At the end of the old pier.' },
  { index: 1, name: 'Windcaller Shard', zone: 'village', x: WINDMILL.x, y: g(WINDMILL.x, WINDMILL.z) + WINDMILL.capY + 1.4, z: WINDMILL.z, hint: 'Caught on top of the village windmill.' },
  { index: 2, name: 'Sporelight Shard', zone: 'forest', x: GROVE.x, y: g(GROVE.x, GROVE.z) + GROVE.topY + 1.4, z: GROVE.z, hint: 'High in the giant mushroom grove.' },
  { index: 3, name: 'Skystone Shard', zone: 'ruins', x: RUINS_TOWER.x, y: g(RUINS_TOWER.x, RUINS_TOWER.z) + RUINS_TOWER.height + 1.4, z: RUINS_TOWER.z, hint: 'Crowning the tower of the Sky Ruins.' },
  { index: 4, name: 'Veilwater Shard', zone: 'falls', x: FALLS.x, y: FALLS.ledgeY + 1.3, z: FALLS.ledgeZ, hint: 'Hidden behind Silver Falls.' },
  { index: 5, name: 'Mirror Shard', zone: 'lake', x: ISLET.x, y: ISLET.topY + 1.3, z: ISLET.z, hint: 'On the islet in Mirror Lake.' },
  { index: 6, name: 'Driftwood Shard', zone: 'cove', x: WRECK.x, y: WRECK.nestY + 1.3, z: WRECK.z, hint: "In the shipwreck's crow's nest." },
]

/* ────────────────────────────────────────────────────────────
   Checkpoints (lantern posts) — y is ground
   ──────────────────────────────────────────────────────────── */

export interface CheckpointDef {
  id: string
  name: string
  x: number
  z: number
  /** Respawn facing. */
  yaw: number
}

export const CHECKPOINTS: CheckpointDef[] = [
  { id: 'beach', name: 'Sunset Beach', x: 5, z: 113, yaw: Math.PI },
  { id: 'village', name: 'Meadow Village', x: -3, z: 52, yaw: Math.PI },
  { id: 'forest', name: 'Whispering Wood', x: -66, z: 31, yaw: -Math.PI / 2 },
  { id: 'ruins', name: 'Sky Ruins', x: 70, z: 18, yaw: Math.PI / 2 },
  { id: 'lake', name: 'Mirror Lake', x: 70, z: -42, yaw: Math.PI },
  { id: 'falls', name: 'Silver Falls', x: -50, z: -32, yaw: -Math.PI / 2 },
  { id: 'summit', name: 'Beacon Summit', x: -4, z: -28, yaw: Math.PI },
  { id: 'cove', name: 'Wreck Cove', x: 84, z: 72, yaw: 0.8 },
]

/* ────────────────────────────────────────────────────────────
   Enemies — Gloomlings (y is ground)
   ──────────────────────────────────────────────────────────── */

export interface EnemySpawn {
  x: number
  z: number
  /** Wander radius around the spawn point. */
  patrol: number
  big?: boolean
}

export const ENEMIES: EnemySpawn[] = [
  { x: -76, z: 18, patrol: 7 },
  { x: -88, z: 12, patrol: 6 },
  { x: -98, z: 40, patrol: 6 },
  { x: -72, z: 40, patrol: 8, big: true },
  { x: 82, z: 12, patrol: 6 },
  { x: 96, z: 12, patrol: 5 },
  { x: 86, z: -6, patrol: 6, big: true },
  { x: 58, z: -46, patrol: 6 },
  { x: 74, z: -52, patrol: 5 },
  { x: 92, z: 76, patrol: 6 },
  { x: 106, z: 70, patrol: 5 },
  { x: 86, z: 88, patrol: 5, big: true },
  { x: -10, z: -40, patrol: 6 },
  { x: 8, z: -44, patrol: 6 },
  { x: -56, z: -30, patrol: 5 },
  { x: -40, z: -42, patrol: 5 },
]

/* ────────────────────────────────────────────────────────────
   Signposts
   ──────────────────────────────────────────────────────────── */

/** A sign line that names controls, worded for each input device. */
export interface ControlLine {
  kbm: string
  pad: string
  touch: string
}

export interface SignDef {
  x: number
  z: number
  yaw: number
  title: string
  /** One dialog page per line. */
  lines: Array<string | ControlLine>
}

export const SIGNS: SignDef[] = [
  {
    x: -3, z: 116, yaw: Math.PI, title: 'Sunset Beach',
    lines: [
      'Seven shards of a fallen star lie scattered across the isle.',
      'Carry them to the Beacon on the summit and light it once more.',
      { kbm: 'Move with W A S D and jump with Space.', pad: 'Move with the left stick and jump with A.', touch: 'Drag on the left of the screen to move, and tap Jump to leap.' },
    ],
  },
  {
    x: 11, z: 124, yaw: Math.PI, title: 'Old Pier',
    lines: [
      'Mind the gaps between the planks.',
      { kbm: 'Press Space again in mid-air to double jump.', pad: 'Press A again in mid-air to double jump.', touch: 'Tap Jump again in mid-air to double jump.' },
    ],
  },
  {
    x: 2, z: 64, yaw: Math.PI, title: 'Meadow Village',
    lines: [
      { kbm: 'Hold Shift to sprint.', pad: 'Hold RB or RT to sprint.', touch: 'Push the stick to its edge to sprint.' },
      { kbm: 'Dash with Q or a right-click. It works in mid-air, too.', pad: 'Dash with B. It works in mid-air, too.', touch: 'Tap Dash to surge ahead. It works in mid-air, too.' },
      'Something bright is caught at the top of the windmill.',
    ],
  },
  {
    x: -64, z: 26, yaw: -Math.PI / 2, title: 'Whispering Wood',
    lines: [
      'Gloomlings lurk in the shade.',
      { kbm: 'Land on one to stomp it, or strike with F or a left-click.', pad: 'Land on one to stomp it, or strike with X.', touch: 'Land on one to stomp it, or tap the attack button to strike.' },
      'Land on the violet mushroom to bounce up into the grove.',
    ],
  },
  { x: 72, z: 14, yaw: Math.PI / 2, title: 'Sky Ruins', lines: ['The old stones still drift with the rhythm of the stars.', 'Time your jumps between the moving platforms.'] },
  { x: -48, z: -36, yaw: -Math.PI / 2, title: 'Silver Falls', lines: ['Fishermen say a light shines behind the falling water.'] },
  { x: 66, z: -46, yaw: Math.PI, title: 'Mirror Lake', lines: ['The lily pads are sturdier than they look.'] },
  { x: 86, z: 68, yaw: 0.8, title: 'Wreck Cove', lines: ['The Driftwood ran aground here long ago.', "Her crow's nest still keeps watch."] },
  {
    x: 4, z: -34, yaw: Math.PI, title: 'Beacon Summit',
    lines: [
      'The Beacon has guided ships home for a thousand years.',
      { kbm: 'Bring all seven shards here, then press E at the altar.', pad: 'Bring all seven shards here, then press Y at the altar.', touch: 'Bring all seven shards here, then tap Use at the altar.' },
    ],
  },
]

/* ────────────────────────────────────────────────────────────
   Sparks (small collectibles) — trails guide the player
   ──────────────────────────────────────────────────────────── */

/** A trail: points [x, yOffsetAboveGround, z]; sparks are spaced along it. */
export interface SparkTrail {
  points: Array<[number, number, number]>
  spacing: number
  /** If true, y values are absolute instead of above-ground. */
  abs?: boolean
}

export const SPARK_TRAILS: SparkTrail[] = [
  { points: [[1, 1, 112], [3, 1, 96], [2, 1, 80], [4, 1, 64]], spacing: 5 },
  { points: [[PIER.x, PIER.deckY + 1, PIER.z0 + 2], [PIER.x, PIER.deckY + 1, PIER.z1 - 5]], spacing: 4, abs: true },
  { points: [[-8, 1, 50], [-30, 1, 42], [-52, 1, 34], [-66, 1, 29]], spacing: 6 },
  { points: [[14, 1, 46], [38, 1, 38], [58, 1, 26], [68, 1, 17]], spacing: 6 },
  { points: [[80, 1, -8], [76, 1, -30], [68, 1, -44]], spacing: 6 },
  { points: [[-6, 1, -30], [-28, 1, -34], [-48, 1, -34]], spacing: 6 },
  { points: [[0, 1, 30], [-2, 1, 10], [0, 1, -12], [-3, 1, -26]], spacing: 6 },
  { points: [[20, 1, 116], [50, 1, 108], [78, 1, 98]], spacing: 6 },
  { points: [[-100, 1, -44], [-92, 1, -56], [-86, 1, -66]], spacing: 4 },
]

/** Single sparks placed by hand (absolute positions) — on top of things, hidden corners. */
export const SPARK_SINGLES: Array<[number, number, number]> = []

/** Heart pickups (y is ground + 1). */
export const HEARTS: Array<[number, number]> = [
  [4, 47], [-80, 30], [84, 18], [-56, -38], [90, 72], [6, -52],
]

/** Places vegetation and clutter must stay clear of: [x, z, radius]. */
export const CLEARINGS: Array<[number, number, number]> = [
  [SPAWN.x, SPAWN.z, 6],
  [PIER.x, (PIER.z0 + PIER.z1) / 2, 16],
  [WINDMILL.x, WINDMILL.z, 9],
  ...HOUSES.map(h => [h.x, h.z, Math.max(h.w, h.d) * 0.85] as [number, number, number]),
  [WELL.x, WELL.z, 3],
  [GROVE.x, GROVE.z, 14],
  [RUINS_TOWER.x, RUINS_TOWER.z, 18],
  [FALLS.x, FALLS.curtainZ, 10],
  [FALLS.poolX, FALLS.poolZ, 12],
  [WRECK.x, WRECK.z, 16],
  [BEACON.x, BEACON.z, 14],
  ...CHECKPOINTS.map(c => [c.x, c.z, 3] as [number, number, number]),
  ...SIGNS.map(s => [s.x, s.z, 1.5] as [number, number, number]),
]
