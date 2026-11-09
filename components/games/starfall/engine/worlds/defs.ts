/**
 * The worlds: Starfall Isle (map 0) and the maps behind its portal arches.
 *
 * Each portal map is built in its own region far from the island (beyond the camera's far
 * plane) and high above the sea, from ZoneKit geometry and colliders. No three.js here, so
 * the HUD and the network can share it.
 */
import type { BossId, MapId } from '../events'

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

export interface MapDef {
  id: MapId
  name: string
  /** Shards needed to wake its island arch. */
  shards: number
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
  /** Fight trigger: the player inside this circle (and above `arenaY - 1`). */
  arena: { x: number; y: number; z: number; r: number }
  objective: string
  /** Portal swirl colours (inner, outer). */
  swirl: [string, string]
}

const RIFT = { x: 2400, y: 120, z: 0 }
const FROST = { x: -2400, y: 100, z: 0 }

export const MAPS: Record<Exclude<MapId, 'isle'>, MapDef> = {
  rift: {
    id: 'rift',
    name: 'Shadow Rift',
    shards: 3,
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
  },
  frost: {
    id: 'frost',
    name: 'Frost Peak',
    shards: 5,
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
  },
}

export const PORTAL_MAPS = [MAPS.rift, MAPS.frost] as const

export const BOSS_IDS: readonly BossId[] = ['gloomKing', 'frostGolem']

export const BOSS_NAMES: Record<BossId, string> = { gloomKing: 'Gloom King', frostGolem: 'Frost Golem' }

export const MAP_NAMES: Record<MapId, string> = { isle: 'Starfall Isle', rift: MAPS.rift.name, frost: MAPS.frost.name }

/** Wire codes for the network (append new maps at the end). */
const MAP_CODES: readonly MapId[] = ['isle', 'rift', 'frost']

export function mapCode(m: MapId): number {
  return Math.max(0, MAP_CODES.indexOf(m))
}

export function mapFromCode(code: number): MapId {
  return MAP_CODES[code] ?? 'isle'
}
