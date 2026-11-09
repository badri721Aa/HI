/**
 * Cutscene director.
 *
 * Plays one scripted Scene at a time (see cutscene/): fires its timed cues,
 * drives ctx.camera from its shots while the camera rig is in 'scripted' mode,
 * and applies the scene's end state when it finishes or is skipped. Scene time
 * advances with game dt, so gestures, sky blends and cues stay in sync.
 *
 * Skipping: hold Space/Enter (input.skipHeld) ~0.7 s, or call skip(). A key
 * that was already held when the scene started must be released first, so a
 * jump into a shard can't skip its cutscene by accident.
 */
import * as THREE from 'three'
import type { Ctx, ICutscenes } from '../types'
import type { CutsceneName } from '../events'
import { heightAt, waterLevelAt } from '../world/heightfield'
import { buildBeacon } from './cutscene/beacon'
import { buildBoss } from './cutscene/boss'
import { buildIntro } from './cutscene/intro'
import { buildShard } from './cutscene/shard'
import { runAll, type Scene } from './cutscene/scene'
import type { Shot } from './cutscene/camera'

/** Real seconds the skip button must be held. */
const SKIP_HOLD = 0.7
/** Camera clearance from walls and from the ground / water surface (m). */
const WALL_MARGIN = 0.3
const GROUND_MARGIN = 0.35
const MIN_REACH = 1.0

export class Cutscenes implements ICutscenes {
  private scene: Scene | null = null
  private resolve: (() => void) | null = null
  private time = 0
  private nextCue = 0
  private shotIndex = -1
  private pull = 0
  private skipArmed = false
  private skipHold = 0
  private lastReal = 0
  private loggedFailure = false

  private readonly pos = new THREE.Vector3()
  private readonly target = new THREE.Vector3()
  private readonly anchor = new THREE.Vector3()

  constructor(private readonly ctx: Ctx) {}

  get active(): boolean {
    return this.scene !== null
  }

  get current(): CutsceneName | null {
    return this.scene?.name ?? null
  }

  init(): void {}

  play(name: CutsceneName, arg?: number): Promise<void> {
    if (this.scene) this.complete(true)
    let scene: Scene
    try {
      scene =
        name === 'intro' ? buildIntro(this.ctx)
        : name === 'shard' ? buildShard(this.ctx, arg ?? 0)
        : name === 'boss' ? buildBoss(this.ctx)
        : buildBeacon(this.ctx)
    } catch (err) {
      console.error(`[starfall] cutscene ${name} failed to build`, err)
      return Promise.resolve()
    }

    const done = new Promise<void>(res => (this.resolve = res))
    this.scene = scene
    this.time = 0
    this.nextCue = 0
    this.shotIndex = -1
    this.pull = 0
    this.skipHold = 0
    this.skipArmed = !this.ctx.input.state.skipHeld
    this.lastReal = this.ctx.clock.real
    this.ctx.cameraRig.mode = 'scripted'
    this.ctx.bus.emit('cutscene:start', { name })
    // Apply t = 0 now so the very next rendered frame is already the first shot.
    this.step(0)
    return done
  }

  skip(): void {
    if (this.scene) this.complete(true)
  }

  update(dt: number): void {
    if (!this.scene) return
    try {
      const real = this.ctx.clock.real
      const realDt = Math.max(0, real - this.lastReal)
      this.lastReal = real
      if (this.wantsSkip(realDt)) {
        this.complete(true)
        return
      }
      this.step(dt)
    } catch (err) {
      // Never leave the game stuck in a broken cutscene: log once and jump to its end state.
      if (!this.loggedFailure) console.error('[starfall] cutscene update failed', err)
      this.loggedFailure = true
      if (this.scene) this.complete(true)
    }
  }

  dispose(): void {
    const resolve = this.resolve
    this.scene = null
    this.resolve = null
    resolve?.()
  }

  /* ── internals ───────────────────────────────────────────── */

  private wantsSkip(realDt: number): boolean {
    if (!this.ctx.input.state.skipHeld) {
      this.skipArmed = true
      this.skipHold = 0
      return false
    }
    if (!this.skipArmed) return false
    this.skipHold += realDt
    return this.skipHold >= SKIP_HOLD
  }

  /** Advances scene time, fires due cues, frames the camera and finishes at the end. */
  private step(dt: number): void {
    const scene = this.scene!
    this.time += dt
    const cues = scene.cues
    while (this.nextCue < cues.length && cues[this.nextCue].t <= this.time) {
      const cue = cues[this.nextCue++]
      try {
        cue.run()
      } catch (err) {
        console.error(`[starfall] cutscene ${scene.name} cue at ${cue.t}s failed`, err)
      }
      if (this.scene !== scene) return // a cue ended or replaced the scene
    }
    this.frameCamera(scene, dt)
    if (this.time >= scene.duration) this.complete(false)
  }

  private frameCamera(scene: Scene, dt: number): void {
    const shots = scene.shots
    let i = this.shotIndex
    while (i + 1 < shots.length && shots[i + 1].at <= this.time) i++
    if (i < 0) return
    if (i !== this.shotIndex) {
      this.shotIndex = i
      this.pull = 0
    }
    const shot = shots[i]
    const pos = this.pos
    const fov = shot.sample(Math.min(this.time - shot.at, shot.duration), dt, pos, this.target)
    if (!Number.isFinite(pos.x + pos.y + pos.z + this.target.x + this.target.y + this.target.z)) return
    this.keepClear(shot, dt)
    const floor = Math.max(heightAt(pos.x, pos.z), waterLevelAt(pos.x, pos.z)) + GROUND_MARGIN
    if (pos.y < floor) pos.y = floor

    const cam = this.ctx.camera
    cam.position.copy(pos)
    cam.lookAt(this.target)
    if (Number.isFinite(fov) && Math.abs(cam.fov - fov) > 1e-3) {
      cam.fov = fov
      cam.updateProjectionMatrix()
    }
  }

  /**
   * Pulls the camera toward the shot's anchor when a wall or the terrain blocks the view
   * (at once going in, easing back out). Thin posts and trunks are looked past.
   */
  private keepClear(shot: Shot, dt: number): void {
    const a = this.anchor
    if (!shot.anchor(a)) return
    const pos = this.pos
    let dx = pos.x - a.x
    let dy = pos.y - a.y
    let dz = pos.z - a.z
    const len = Math.hypot(dx, dy, dz)
    if (len < 1e-3) return
    dx /= len
    dy /= len
    dz /= len
    const col = this.ctx.collision
    let free = len
    let travelled = 0
    for (let k = 0; k < 3; k++) {
      const remain = len + WALL_MARGIN - travelled
      if (remain <= 0) break
      const hit = col.raycast(a.x + dx * travelled, a.y + dy * travelled, a.z + dz * travelled, dx, dy, dz, remain)
      if (!hit) break
      const c = hit.collider
      const thin = c && (c.shape === 'cylinder' ? c.r < 0.6 : Math.max(c.hx, c.hz) < 0.35)
      if (!thin) {
        free = Math.max(MIN_REACH, Math.min(len, travelled + hit.t - WALL_MARGIN))
        break
      }
      travelled += hit.t + (c.shape === 'cylinder' ? c.r * 2 : Math.max(c.hx, c.hz) * 2) + 0.05
    }
    const need = len - free
    this.pull = need > this.pull ? need : this.pull + (need - this.pull) * (1 - Math.exp(-3 * dt))
    if (this.pull <= 1e-3) return
    const reach = Math.max(MIN_REACH, len - this.pull)
    pos.set(a.x + dx * reach, a.y + dy * reach, a.z + dz * reach)
  }

  /** Ends the scene: shared cleanup, then the scene's own end state, then events. */
  private complete(skipped: boolean): void {
    const scene = this.scene
    if (!scene) return
    this.scene = null
    const resolve = this.resolve
    this.resolve = null
    const { bus, character } = this.ctx
    runAll(scene.name, [
      () => bus.emit('ui:subtitle', null),
      () => bus.emit('ui:letterbox', { on: false, skippable: false }),
      () => character.lookAt(null),
      () => {
        if (skipped) bus.emit('ui:fade', { to: 0, duration: 0.35 })
      },
      () => scene.finish(skipped),
      () => bus.emit('cutscene:end', { name: scene.name, skipped }),
    ])
    resolve?.()
  }
}
