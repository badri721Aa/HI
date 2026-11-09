import type { WeaponId } from './events'
import { DEFAULT_SETTINGS, detectQuality, type Settings } from './settings'
import { TOTAL_SHARDS } from './world/level'

const SAVE_KEY = 'starfall:save:v1'
const PROFILE_KEY = 'starfall:profile:v1'

/** One playthrough in progress. */
export interface SaveGame {
  version: 1
  shards: boolean[]
  /** Indices into the generated spark list. */
  sparks: number[]
  /** Heart pickups already taken (indices into HEARTS). */
  hearts: number[]
  /** Enemy spawn indices defeated. */
  enemies: number[]
  checkpoint: string
  checkpoints: string[]
  playTime: number
  deaths: number
  introSeen: boolean
  completed: boolean
  /** Weapons picked up (fists are always owned) and the one in hand. */
  weapons: WeaponId[]
  weapon: WeaponId
}

/** Survives across playthroughs. */
export interface Profile {
  version: 1
  settings: Settings
  bestTime: number | null
  completions: number
  /** The first-launch "Choose your device" screen has been answered. */
  deviceSetup: boolean
}

const WEAPON_IDS: readonly WeaponId[] = ['fists', 'sword', 'hammer', 'bow']
const isWeapon = (w: unknown): w is WeaponId => WEAPON_IDS.includes(w as WeaponId)

export function newSave(): SaveGame {
  return {
    version: 1,
    shards: Array.from({ length: TOTAL_SHARDS }, () => false),
    sparks: [],
    hearts: [],
    enemies: [],
    checkpoint: 'beach',
    checkpoints: ['beach'],
    playTime: 0,
    deaths: 0,
    introSeen: false,
    completed: false,
    weapons: [],
    weapon: 'fists',
  }
}

function read<T>(key: string): Partial<T> | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as Partial<T>) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage full or blocked — progress just won't persist */
  }
}

export function loadSave(): SaveGame | null {
  const data = read<SaveGame>(SAVE_KEY)
  if (!data || data.version !== 1) return null
  const base = newSave()
  const shards = Array.isArray(data.shards) ? data.shards.slice(0, TOTAL_SHARDS) : base.shards
  while (shards.length < TOTAL_SHARDS) shards.push(false)
  return {
    ...base,
    ...data,
    shards,
    sparks: Array.isArray(data.sparks) ? data.sparks : [],
    hearts: Array.isArray(data.hearts) ? data.hearts : [],
    enemies: Array.isArray(data.enemies) ? data.enemies : [],
    checkpoints: Array.isArray(data.checkpoints) ? data.checkpoints : base.checkpoints,
    weapons: Array.isArray(data.weapons) ? data.weapons.filter(isWeapon) : [],
    weapon: isWeapon(data.weapon) ? data.weapon : 'fists',
  }
}

export function storeSave(save: SaveGame): void {
  write(SAVE_KEY, save)
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY)
  } catch {
    /* ignore */
  }
}

export function loadProfile(): Profile {
  const data = read<Profile>(PROFILE_KEY)
  const settings: Settings = { ...DEFAULT_SETTINGS, quality: detectQuality(), ...(data?.settings ?? {}) }
  return {
    version: 1,
    settings,
    bestTime: typeof data?.bestTime === 'number' ? data.bestTime : null,
    completions: typeof data?.completions === 'number' ? data.completions : 0,
    // Returning players (a profile saved before the device screen existed) skip it.
    deviceSetup: data ? data.deviceSetup !== false : false,
  }
}

export function storeProfile(p: Profile): void {
  write(PROFILE_KEY, p)
}
