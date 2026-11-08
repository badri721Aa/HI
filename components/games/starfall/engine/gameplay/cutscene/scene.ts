/**
 * Scene authoring: a scene is a list of camera shots, a list of timed cues and
 * an end state. SceneBuilder keeps the scripts in intro/shard/beacon.ts short
 * and readable; the director (Cutscenes.ts) only plays what it produces.
 */
import * as THREE from 'three'
import type { BurstKind, Ctx, ICharacter } from '../../types'
import type { CutsceneName, MusicMood, V3 } from '../../events'
import type { Shot } from './camera'

export interface Cue {
  t: number
  run: () => void
}

export interface Scene {
  readonly name: CutsceneName
  readonly duration: number
  /** Sorted by start time. */
  readonly shots: readonly Shot[]
  /** Sorted by time. */
  readonly cues: readonly Cue[]
  /**
   * Applies the scene's end state. On a skip it must also apply, instantly, every lasting
   * side effect the remaining cues would have had. Called exactly once.
   */
  finish(skipped: boolean): void
}

export const vec = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

/**
 * A hero-relative frame: `at(f, r, u)` is f metres forward, r metres to the right and
 * u metres up from `origin` for a hero facing `yaw` (0 = +Z).
 */
export function heroFrame(origin: V3, yaw: number) {
  const fx = Math.sin(yaw)
  const fz = Math.cos(yaw)
  return {
    yaw,
    at: (f: number, r: number, u: number) => vec(origin.x + fx * f - fz * r, origin.y + u, origin.z + fz * f + fx * r),
  }
}

/**
 * Ends whatever gesture is playing within ~0.25 s: starts a gesture that is almost back at the
 * idle pose and stops it at once, so the animator cross-fades out of lying/raised-arm poses
 * instead of playing their full outros. Used when a cutscene is skipped.
 */
export function settlePose(character: ICharacter): void {
  void character.playGesture('wakeUp', { speed: 12 })
  character.stopGesture()
}

/** Runs every step even if one throws (stub or half-built modules must never block an end state). */
export function runAll(label: string, steps: Array<() => void>): void {
  for (const step of steps) {
    try {
      step()
    } catch (err) {
      console.error(`[starfall] cutscene ${label} step failed`, err)
    }
  }
}

export class SceneBuilder {
  private readonly shots: Shot[] = []
  private readonly cues: Cue[] = []

  constructor(private readonly ctx: Ctx) {}

  shot(s: Shot): this {
    this.shots.push(s)
    return this
  }

  at(t: number, run: () => void): this {
    this.cues.push({ t, run })
    return this
  }

  say(t: number, text: string, speaker?: string): this {
    return this.at(t, () => this.ctx.bus.emit('ui:subtitle', speaker ? { speaker, text } : { text }))
  }

  hush(t: number): this {
    return this.at(t, () => this.ctx.bus.emit('ui:subtitle', null))
  }

  letterbox(t: number, on: boolean): this {
    return this.at(t, () => this.ctx.bus.emit('ui:letterbox', { on, skippable: on }))
  }

  /** 0 = clear, 1 = black. */
  fade(t: number, to: number, duration: number): this {
    return this.at(t, () => this.ctx.bus.emit('ui:fade', { to, duration }))
  }

  flash(t: number, color: string, duration: number): this {
    return this.at(t, () => this.ctx.bus.emit('ui:flash', { color, duration }))
  }

  music(t: number, mood: MusicMood): this {
    return this.at(t, () => this.ctx.game.setMusic(mood))
  }

  streak(t: number, from: V3, to: V3, duration: number, color?: string): this {
    return this.at(t, () => this.ctx.fx.streak(from, to, duration, color))
  }

  burst(t: number, kind: BurstKind, pos: V3, opts?: { count?: number; color?: string; scale?: number }): this {
    return this.at(t, () => this.ctx.fx.burst(kind, pos, opts))
  }

  /**
   * A light that travels along a polyline: one short streak per segment, chained so each
   * starts as the previous one arrives. Returns the arrival time.
   */
  trail(t: number, points: readonly V3[], segment: number, color?: string): number {
    for (let i = 0; i + 1 < points.length; i++) this.streak(t + i * segment, points[i], points[i + 1], segment * 1.15, color)
    return t + (points.length - 1) * segment
  }

  build(name: CutsceneName, duration: number, finish: (skipped: boolean) => void): Scene {
    return {
      name,
      duration,
      shots: this.shots.slice().sort((a, b) => a.at - b.at),
      cues: this.cues.slice().sort((a, b) => a.t - b.t),
      finish,
    }
  }
}
