'use client'
/** React glue: the game context plus the hooks every screen uses. */
import { createContext, useContext, useEffect, useEffectEvent, useState, useSyncExternalStore } from 'react'
import type { Game } from '../engine/Game'
import type { GameEventMap } from '../engine/events'
import type { HudState } from '../engine/store'
import type { SfxName } from '../engine/types'
import type { NetState, NetStore } from './netStore'
import type { UiState, UiStore } from './uiStore'

export interface GameUi {
  game: Game
  store: UiStore
  /** Multiplayer state (room, players, chat). */
  net: NetStore
  /** Touch layout (coarse pointer, or forced with ?touch=1). */
  touch: boolean
}

export const GameContext = createContext<GameUi | null>(null)

export function useGameUi(): GameUi {
  const v = useContext(GameContext)
  if (!v) throw new Error('Starfall UI used outside its GameContext')
  return v
}

/** Select a slice of the UI store. The selector must return stable values (fields, primitives). */
export function useUi<T>(select: (s: UiState) => T): T {
  const { store } = useGameUi()
  const get = () => select(store.get())
  return useSyncExternalStore(store.subscribe, get, get)
}

/** Select a slice of the multiplayer store. Same stability rule as useUi. */
export function useNet<T>(select: (s: NetState) => T): T {
  const { net } = useGameUi()
  const get = () => select(net.get())
  return useSyncExternalStore(net.subscribe, get, get)
}

/** Select a slice of the engine's HUD snapshot. */
export function useHud<T>(select: (s: HudState) => T): T {
  const { game } = useGameUi()
  const get = () => select(game.hud.get())
  return useSyncExternalStore(game.hud.subscribe, get, get)
}

/** Subscribe to a bus event for the component's lifetime. */
export function useBus<K extends keyof GameEventMap>(type: K, handler: (payload: GameEventMap[K]) => void): void {
  const { game } = useGameUi()
  const onEvent = useEffectEvent(handler)
  useEffect(() => game.bus.on(type, p => onEvent(p)), [game, type])
}

/** UI sound helper — never throws (audio may still be a stub or locked). */
export function playUi(game: Game, name: SfxName): void {
  try {
    game.ctx.audio?.ui(name)
  } catch {
    /* sound is decoration */
  }
}

/**
 * Keeps an element mounted for `exitMs` after `visible` turns false so it can
 * play its exit animation. Returns whether to render it.
 */
export function usePresence(visible: boolean, exitMs = 240): boolean {
  const [mounted, setMounted] = useState(visible)
  if (visible && !mounted) setMounted(true)
  useEffect(() => {
    if (visible || !mounted) return
    const t = setTimeout(() => setMounted(false), exitMs)
    return () => clearTimeout(t)
  }, [visible, mounted, exitMs])
  return visible || mounted
}
