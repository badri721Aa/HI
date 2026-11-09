import type { BlockMsg } from './build/blocks'
import type { Surface } from './world/heightfield'

export interface V3 {
  x: number
  y: number
  z: number
}

export type GamePhase =
  | 'loading'
  | 'title'
  | 'playing'
  | 'paused'
  | 'cutscene'
  | 'dialog'
  | 'victory'

export type ToastKind = 'shard' | 'checkpoint' | 'heart' | 'info' | 'warning' | 'reward'

/** 'boss': the short boss introduction (arg = the boss's index in BOSS_IDS). */
export type CutsceneName = 'intro' | 'shard' | 'beacon' | 'boss'

export type MusicMood = 'title' | 'explore' | 'danger' | 'cutscene' | 'victory' | 'boss'

/**
 * Hotbar order: fists are always owned; sword, hammer and bow are found on the island,
 * the starblade and the frost hammer are boss rewards.
 */
export type WeaponId = 'fists' | 'sword' | 'hammer' | 'bow' | 'starblade' | 'frostHammer'

/** The worlds: Starfall Isle plus the maps behind its portal arches. */
export type MapId = 'isle' | 'rift' | 'frost'

export type BossId = 'gloomKing' | 'frostGolem'

export interface VictoryStats {
  time: number
  bestTime: number | null
  newBest: boolean
  sparks: number
  sparksTotal: number
  deaths: number
  enemies: number
}

/**
 * Every event in the game. `ui:*` events drive the React layer;
 * the rest let gameplay, audio and effects stay decoupled.
 */
export interface GameEventMap {
  // ── engine → UI ─────────────────────────────────────────
  'ui:load': { progress: number; label: string }
  'ui:phase': { phase: GamePhase }
  'ui:toast': { kind: ToastKind; title: string; body?: string }
  /** One page of a dialog; null closes it. */
  'ui:dialog': { title: string; text: string; page: number; pages: number } | null
  'ui:subtitle': { speaker?: string; text: string } | null
  'ui:letterbox': { on: boolean; skippable: boolean }
  'ui:prompt': { key: string; label: string } | null
  'ui:objective': { text: string }
  /** 0 = clear, 1 = black. */
  'ui:fade': { to: number; duration: number }
  'ui:flash': { color: string; duration: number }
  'ui:shardBanner': { index: number; name: string; collected: number; total: number }
  'ui:victory': VictoryStats
  'ui:error': { message: string }

  // ── player ──────────────────────────────────────────────
  'player:footstep': { pos: V3; surface: Surface; sprint: boolean }
  'player:jump': { pos: V3; double: boolean }
  /** impact = downward speed in m/s at touchdown. */
  'player:land': { pos: V3; impact: number; surface: Surface }
  'player:dash': { pos: V3; dir: V3 }
  'player:attack': { pos: V3 }
  'player:hurt': { pos: V3; hp: number }
  'player:died': { pos: V3; cause: 'water' | 'fall' | 'enemy' }
  'player:respawn': { pos: V3 }
  'player:splash': { pos: V3; big: boolean }
  'player:bounce': { pos: V3 }
  'player:wade': { pos: V3 }
  /** The limp body slammed into something hard enough for a cartoon "boing" / "oof". */
  'player:flop': { pos: V3; impact: number }

  // ── world & gameplay ───────────────────────────────────
  'collect:spark': { pos: V3; total: number; chain: number }
  'collect:heart': { pos: V3 }
  'collect:shard': { pos: V3; index: number; collected: number }
  'enemy:alert': { pos: V3 }
  'enemy:stomp': { pos: V3 }
  'enemy:defeat': { pos: V3; big: boolean }
  /** A weapon blow landed (damage numbers, impact sound and sparks). */
  'enemy:hit': { pos: V3; damage: number; killed: boolean; big: boolean; weapon: WeaponId }
  'checkpoint': { id: string; pos: V3; first: boolean }
  'beacon:activate': { pos: V3 }
  'cutscene:start': { name: CutsceneName }
  'cutscene:end': { name: CutsceneName; skipped: boolean }
  'audio:music': { mood: MusicMood }

  // ── worlds & bosses ────────────────────────────────────
  /** The player stepped into a portal (the fade starts). */
  'portal:enter': { pos: V3; to: MapId }
  /** Arrived in another map (after the fade, before it clears). */
  'world:travel': { from: MapId; to: MapId }
  'boss:roar': { pos: V3; boss: BossId }
  /** A boss slam / landing / stomp: a heavy thud and a shockwave. */
  'boss:slam': { pos: V3; boss: BossId }
  /** A telegraphed hazard went off (orb, boulder, ice spike). */
  'boss:impact': { pos: V3; kind: 'orb' | 'boulder' | 'spike' }
  'boss:defeat': { pos: V3; boss: BossId }
  'chest:open': { pos: V3 }

  // ── building ───────────────────────────────────────────
  'block:place': { pos: V3; surface: Surface }
  'block:break': { pos: V3; surface: Surface }

  // ── weapons ────────────────────────────────────────────
  'weapon:pickup': { weapon: WeaponId; pos: V3 }
  'weapon:equip': { weapon: WeaponId }
  /** A sword slash (combo 0..2) or the hammer's wind-up. */
  'weapon:swing': { weapon: WeaponId; pos: V3; combo: number }
  /** The hammer hits the ground: shockwave. */
  'weapon:slam': { pos: V3 }
  'weapon:draw': { pos: V3 }
  /** An arrow leaves the bow; charge 0..1. */
  'weapon:fire': { pos: V3; charge: number }
  /** An arrow stuck in the ground or a prop. */
  'arrow:stick': { pos: V3 }

  // ── multiplayer ────────────────────────────────────────
  'net:status': { status: 'offline' | 'connecting' | 'online' | 'error'; message?: string }
  /** Room joined/left (null) or its player count changed. */
  'net:room': { code: string; name: string; public: boolean; players: number; max: number } | null
  'net:chat': { id: string; name: string; color: string; text: string; system?: boolean }
  'net:peer': { id: string; name: string; joined: boolean }
  /** Block edits from another player (validated). */
  'net:blocks': { id: string } & BlockMsg
}

type Handler<T> = (payload: T) => void

export class EventBus {
  private map = new Map<keyof GameEventMap, Set<Handler<never>>>()

  on<K extends keyof GameEventMap>(type: K, fn: Handler<GameEventMap[K]>): () => void {
    let set = this.map.get(type)
    if (!set) this.map.set(type, (set = new Set()))
    set.add(fn as Handler<never>)
    return () => set!.delete(fn as Handler<never>)
  }

  emit<K extends keyof GameEventMap>(type: K, payload: GameEventMap[K]): void {
    const set = this.map.get(type)
    if (!set) return
    for (const fn of set) {
      try {
        ;(fn as Handler<GameEventMap[K]>)(payload)
      } catch (err) {
        console.error(`[starfall] handler for ${String(type)} failed`, err)
      }
    }
  }

  clear(): void {
    this.map.clear()
  }
}

/** Copies a vector-like into a plain object (event payloads must not alias live vectors). */
export function v3(p: V3): V3 {
  return { x: p.x, y: p.y, z: p.z }
}
