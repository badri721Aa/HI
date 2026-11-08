/**
 * Everything the React layer shows that arrives as `ui:*` events.
 *
 * The store subscribes once, as soon as the Game exists, so no event is lost
 * while a component is between mounts (e.g. an objective emitted in the same
 * tick the phase flips to 'playing'). Timed things — toasts, the objective
 * line, the shard banner — expire here, so components only render state.
 */
import type { Game } from '../engine/Game'
import type { GameEventMap, GamePhase, ToastKind, VictoryStats } from '../engine/events'
import { DEFAULT_SETTINGS, type Settings } from '../engine/settings'
import { isTextField } from './nav'

export interface Toast {
  id: number
  kind: ToastKind
  title: string
  body?: string
  leaving: boolean
}

export interface Banner {
  id: number
  index: number
  name: string
  collected: number
  total: number
  leaving: boolean
}

export interface Objective {
  id: number
  text: string
  leaving: boolean
}

export type PausePanel = 'root' | 'map' | 'settings' | 'controls' | 'online' | 'quit'

export interface UiState {
  phase: GamePhase
  load: { progress: number; label: string }
  error: string | null
  objective: Objective | null
  prompt: GameEventMap['ui:prompt']
  dialog: GameEventMap['ui:dialog']
  subtitle: GameEventMap['ui:subtitle']
  letterbox: GameEventMap['ui:letterbox']
  toasts: Toast[]
  banner: Banner | null
  victory: VictoryStats | null
  settings: Settings
  pointerLocked: boolean
  pausePanel: PausePanel
  /** performance.now() when the pause menu last opened. */
  pausedAt: number
}

const OBJECTIVE_MS = 6000
const TOAST_MS = 3400
const BANNER_MS = 4300
const MAX_TOASTS = 3

function initialUi(): UiState {
  return {
    phase: 'loading',
    load: { progress: 0, label: 'Starting' },
    error: null,
    objective: null,
    prompt: null,
    dialog: null,
    subtitle: null,
    letterbox: { on: false, skippable: false },
    toasts: [],
    banner: null,
    victory: null,
    settings: DEFAULT_SETTINGS,
    pointerLocked: false,
    pausePanel: 'root',
    pausedAt: 0,
  }
}

export class UiStore {
  private state: UiState = initialUi()
  private listeners = new Set<() => void>()
  private timers = new Set<ReturnType<typeof setTimeout>>()
  private seq = 0
  private game: Game | null = null
  private mapKeyAt = -1e9

  get = (): UiState => this.state

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  /** Wire the store to a game. Returns the detach function. */
  attach(game: Game): () => void {
    this.game = game
    const bus = game.bus
    const offs = [
      bus.on('ui:phase', e => this.onPhase(e.phase)),
      bus.on('ui:load', e => this.set({ load: { progress: e.progress, label: e.label } })),
      bus.on('ui:error', e => this.set({ error: e.message })),
      bus.on('ui:objective', e => this.showObjective(e.text)),
      bus.on('ui:prompt', e => {
        const p = this.state.prompt
        if (p === e || (p && e && p.key === e.key && p.label === e.label)) return
        this.set({ prompt: e })
      }),
      bus.on('ui:dialog', e => this.set({ dialog: e })),
      bus.on('ui:subtitle', e => {
        const s = this.state.subtitle
        if (s === e || (s && e && s.text === e.text && s.speaker === e.speaker)) return
        this.set({ subtitle: e })
      }),
      bus.on('ui:letterbox', e => this.set({ letterbox: { on: e.on, skippable: e.skippable } })),
      bus.on('ui:toast', e => this.pushToast(e)),
      bus.on('ui:shardBanner', e => this.showBanner(e)),
      bus.on('ui:victory', e => this.set({ victory: e })),
    ]

    const onLock = () => this.set({ pointerLocked: document.pointerLockElement === game.canvas })
    // Remember a recent M press so the pause menu can open straight onto the map.
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyM' && this.state.phase === 'playing' && !isTextField(e.target as Element | null)) this.mapKeyAt = performance.now()
    }
    document.addEventListener('pointerlockchange', onLock)
    window.addEventListener('keydown', onKey)

    this.set({ settings: { ...game.settings }, phase: game.phase })

    return () => {
      for (const off of offs) off()
      document.removeEventListener('pointerlockchange', onLock)
      window.removeEventListener('keydown', onKey)
      for (const t of this.timers) clearTimeout(t)
      this.timers.clear()
      this.game = null
    }
  }

  /** Persist + apply a settings change and mirror it for the UI. */
  updateSettings(patch: Partial<Settings>): void {
    const g = this.game
    if (!g) return
    g.updateSettings(patch)
    this.set({ settings: { ...g.settings } })
  }

  setPausePanel(panel: PausePanel): void {
    if (this.state.pausePanel !== panel) this.set({ pausePanel: panel })
  }

  /* ── internals ─────────────────────────────────────────────── */

  private set(patch: Partial<UiState>): void {
    this.state = { ...this.state, ...patch }
    for (const fn of this.listeners) fn()
  }

  private later(ms: number, fn: () => void): void {
    const t = setTimeout(() => {
      this.timers.delete(t)
      fn()
    }, ms)
    this.timers.add(t)
  }

  private onPhase(phase: GamePhase): void {
    // Re-read settings too, in case something other than this store changed them.
    const patch: Partial<UiState> = { phase, ...(this.game ? { settings: { ...this.game.settings } } : {}) }
    if (phase === 'paused') {
      patch.pausePanel = performance.now() - this.mapKeyAt < 600 || padMapHeld() ? 'map' : 'root'
      patch.pausedAt = performance.now()
    }
    if (phase === 'title') {
      // A fresh slate for the next run.
      Object.assign(patch, {
        objective: null,
        prompt: null,
        dialog: null,
        subtitle: null,
        letterbox: { on: false, skippable: false },
        toasts: [],
        banner: null,
        victory: null,
      } satisfies Partial<UiState>)
    }
    if (phase === 'playing') patch.subtitle = null
    this.set(patch)
  }

  private showObjective(text: string): void {
    const id = ++this.seq
    this.set({ objective: { id, text, leaving: false } })
    this.later(OBJECTIVE_MS, () => {
      const o = this.state.objective
      if (o?.id === id) this.set({ objective: { ...o, leaving: true } })
    })
    this.later(OBJECTIVE_MS + 750, () => {
      if (this.state.objective?.id === id) this.set({ objective: null })
    })
  }

  private pushToast(e: { kind: ToastKind; title: string; body?: string }): void {
    const id = ++this.seq
    const toasts = [...this.state.toasts, { id, kind: e.kind, title: e.title, body: e.body, leaving: false }]
    this.set({ toasts: toasts.slice(-MAX_TOASTS) })
    this.later(TOAST_MS, () => {
      this.set({ toasts: this.state.toasts.map(t => (t.id === id ? { ...t, leaving: true } : t)) })
    })
    this.later(TOAST_MS + 380, () => {
      this.set({ toasts: this.state.toasts.filter(t => t.id !== id) })
    })
  }

  private showBanner(e: GameEventMap['ui:shardBanner']): void {
    const id = ++this.seq
    this.set({ banner: { id, index: e.index, name: e.name, collected: e.collected, total: e.total, leaving: false } })
    this.later(BANNER_MS, () => {
      const b = this.state.banner
      if (b?.id === id) this.set({ banner: { ...b, leaving: true } })
    })
    this.later(BANNER_MS + 650, () => {
      if (this.state.banner?.id === id) this.set({ banner: null })
    })
  }
}

/** True while a gamepad's View/Back button (the map binding) is held. */
function padMapHeld(): boolean {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return false
  for (const p of navigator.getGamepads()) if (p?.connected && p.buttons[8]?.pressed) return true
  return false
}
