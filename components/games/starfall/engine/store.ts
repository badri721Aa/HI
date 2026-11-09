import type { WeaponId } from './events'
import { TOTAL_SHARDS } from './world/level'

export interface CompassMarker {
  /** Bearing relative to the camera's forward, radians, -PI..PI (negative = left). */
  angle: number
  dist: number
  kind: 'shard' | 'beacon' | 'checkpoint'
}

/** Snapshot the HUD renders. Updated by the engine a few times per second. */
export interface HudState {
  hp: number
  maxHp: number
  shards: boolean[]
  sparks: number
  sparksTotal: number
  playTime: number
  deaths: number
  zone: string
  fps: number
  /** 0 = just used, 1 = ready. */
  dash: number
  compass: CompassMarker[]
  /** Camera yaw in radians, for the compass strip. */
  heading: number
  touch: boolean
  /** Hotbar: owned weapons (fists first) and the one in hand. */
  weapons: WeaponId[]
  weapon: WeaponId
  /** Drawing the bow: crosshair + draw meter (0..1), or -1 when not aiming. */
  aim: number
}

export function initialHud(): HudState {
  return {
    hp: 5,
    maxHp: 5,
    shards: Array.from({ length: TOTAL_SHARDS }, () => false),
    sparks: 0,
    sparksTotal: 0,
    playTime: 0,
    deaths: 0,
    zone: '',
    fps: 0,
    dash: 1,
    compass: [],
    heading: 0,
    touch: false,
    weapons: ['fists'],
    weapon: 'fists',
    aim: -1,
  }
}

/** Minimal external store for React's useSyncExternalStore. */
export class HudStore {
  private state: HudState = initialHud()
  private listeners = new Set<() => void>()

  get = (): HudState => this.state

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  /** Shallow-merges and notifies only when something actually changed. */
  set(patch: Partial<HudState>): void {
    let changed = false
    for (const k in patch) {
      const key = k as keyof HudState
      if (this.state[key] !== patch[key]) {
        changed = true
        break
      }
    }
    if (!changed) return
    this.state = { ...this.state, ...patch }
    for (const fn of this.listeners) fn()
  }
}
