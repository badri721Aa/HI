/**
 * Starfall Isle — the orchestrator.
 *
 * Owns the renderer, the frame loop, the phase machine and the game rules
 * (progress, saving, death/respawn, victory). Every other system is built
 * here in a fixed order and updated in a fixed order:
 *
 *   input.poll → zones (moving platforms) → player → character → enemies →
 *   collectibles → checkpoints → signs → cutscenes → cameraRig → env →
 *   vegetation → fx → ambient → audio → HUD → post.render
 */
import * as THREE from 'three'
import { CollisionWorld } from './collision'
import { EventBus, v3, type GamePhase, type MusicMood } from './events'
import { Input } from './input'
import { clearSave, loadProfile, loadSave, newSave, storeProfile, storeSave, type Profile, type SaveGame } from './save'
import { QUALITY, type Settings } from './settings'
import { HudStore } from './store'
import { TextureLib } from './textures'
import type { Ctx, GameApi } from './types'
import { heightAt, zoneAt, WORLD_HALF, waterLevelAt, SEA_LEVEL } from './world/heightfield'
import { BEACON, CHECKPOINTS, SHARDS, SPAWN, TOTAL_SHARDS } from './world/level'

import { Environment } from './world/Environment'
import { Vegetation } from './world/Vegetation'
import { Zones } from './world/zones'
import { Character } from './player/Character'
import { PlayerController } from './player/PlayerController'
import { CameraRig } from './player/CameraRig'
import { Collectibles } from './gameplay/Collectibles'
import { Enemies } from './gameplay/Enemies'
import { Checkpoints } from './gameplay/Checkpoints'
import { Signs } from './gameplay/Signs'
import { Cutscenes } from './gameplay/Cutscenes'
import { Particles } from './fx/Particles'
import { Ambient } from './fx/Ambient'
import { PostFX } from './fx/PostFX'
import { AudioEngine } from './audio/AudioEngine'
import { Network } from './net/Network'

interface Timer {
  at: number
  fn: () => void
}

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

export class Game implements GameApi {
  readonly ctx: Ctx
  readonly bus = new EventBus()
  readonly hud = new HudStore()
  readonly canvas: HTMLCanvasElement
  readonly isTouch: boolean

  phase: GamePhase = 'loading'
  save: SaveGame = newSave()
  profile: Profile

  private renderer: THREE.WebGLRenderer
  private raf = 0
  private last = 0
  private timers: Timer[] = []
  private dying = false
  private saveDirty = false
  private saveFlushT = 0
  private hudT = 0
  private sparkChain = 0
  private sparkChainT = 0
  private dialog: { title: string; lines: string[]; page: number; resolve: () => void } | null = null
  private resumePhase: GamePhase = 'playing'
  private fpsFrames = 0
  private fpsT = 0
  private fps = 60
  private dynScale = 1
  private slowT = 0
  private fastT = 0
  private pausedFrame = 0
  private disposed = false
  private resizeObs: ResizeObserver | null = null
  private mapImage: string | null = null
  private enemiesDefeatedRun = 0
  private onVisibility = () => {
    if (document.hidden) {
      if (this.phase === 'playing') this.pause()
      this.ctx.audio?.setPaused(true)
    } else {
      this.ctx.audio?.setPaused(false)
    }
  }

  constructor(private container: HTMLElement) {
    this.profile = loadProfile()
    this.isTouch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

    this.canvas = document.createElement('canvas')
    this.canvas.className = 'block h-full w-full touch-none select-none outline-none'
    this.canvas.tabIndex = 0
    container.appendChild(this.canvas)

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
    })
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.0
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap

    const settings = this.profile.settings
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(settings.fov, 1, 0.1, 900)
    camera.position.set(0, 20, 160)

    const input = new Input(this.canvas)
    input.sensitivity = settings.mouseSensitivity
    let lockedAt = 0
    input.onPointerLockChange = locked => {
      if (locked) {
        lockedAt = performance.now()
        return
      }
      // Only treat it as "the player pressed Esc" if the lock was really held;
      // some browsers grant and immediately drop it.
      if (this.phase === 'playing' && performance.now() - lockedAt > 300) this.pause()
    }

    const self = this
    const ctx = {
      renderer: this.renderer,
      scene,
      camera,
      bus: this.bus,
      hud: this.hud,
      input,
      collision: new CollisionWorld(),
      textures: new TextureLib(this.renderer),
      settings,
      quality: QUALITY[settings.quality],
      clock: { t: 0, real: 0 },
      progress: () => {},
      get game() {
        return self as GameApi
      },
    } as unknown as Ctx
    this.ctx = ctx

    // Build every system up front so they can reference each other in init().
    ctx.env = new Environment(ctx)
    ctx.vegetation = new Vegetation(ctx)
    ctx.zones = new Zones(ctx)
    ctx.character = new Character(ctx)
    ctx.player = new PlayerController(ctx)
    ctx.cameraRig = new CameraRig(ctx)
    ctx.collectibles = new Collectibles(ctx)
    ctx.enemies = new Enemies(ctx)
    ctx.checkpoints = new Checkpoints(ctx)
    ctx.signs = new Signs(ctx)
    ctx.cutscenes = new Cutscenes(ctx)
    ctx.fx = new Particles(ctx)
    ctx.ambient = new Ambient(ctx)
    ctx.post = new PostFX(ctx)
    ctx.audio = new AudioEngine(ctx)
    ctx.net = new Network(ctx)

    this.resize()
    this.resizeObs = new ResizeObserver(() => this.resize())
    this.resizeObs.observe(container)
    document.addEventListener('visibilitychange', this.onVisibility)
    this.hud.set({ touch: this.isTouch })
  }

  /* ── loading ─────────────────────────────────────────────── */

  async load(): Promise<void> {
    const ctx = this.ctx
    const steps: Array<[string, number, () => Promise<void> | void]> = [
      ['Loading textures', 3, () => ctx.textures.preload(f => ctx.progress(f))],
      ['Raising the island', 3, () => ctx.env.init()],
      ['Growing the forest', 3, () => ctx.vegetation.init()],
      ['Building the village', 3, () => ctx.zones.init()],
      ['Waking the hero', 2, () => ctx.character.init()],
      ['Teaching him to run', 1, () => ctx.player.init()],
      ['Placing the camera', 0.5, () => ctx.cameraRig.init()],
      ['Scattering star shards', 1, () => ctx.collectibles.init()],
      ['Summoning gloomlings', 1, () => ctx.enemies.init()],
      ['Lighting lanterns', 0.5, () => ctx.checkpoints.init()],
      ['Painting signposts', 0.5, () => ctx.signs.init()],
      ['Writing the story', 0.5, () => ctx.cutscenes.init()],
      ['Stirring the air', 1, () => ctx.fx.init()],
      ['Releasing fireflies', 0.5, () => ctx.ambient.init()],
      ['Tuning the lens', 1, () => ctx.post.init()],
      ['Composing music', 0.5, () => ctx.audio.init()],
      ['Tuning the radio', 0.5, () => ctx.net.init()],
    ]
    const total = steps.reduce((s, x) => s + x[1], 0) + 1
    let done = 0
    for (const [label, weight, fn] of steps) {
      if (this.disposed) return
      ctx.progress = (f: number, sub?: string) =>
        this.bus.emit('ui:load', { progress: (done + weight * Math.min(1, Math.max(0, f))) / total, label: sub ?? label })
      ctx.progress(0)
      try {
        await fn()
      } catch (err) {
        console.error(`[starfall] ${label} failed`, err)
        this.bus.emit('ui:error', { message: `${label} failed: ${(err as Error).message}` })
        throw err
      }
      done += weight
      // Let the browser paint the progress bar between heavy steps.
      await new Promise(r => setTimeout(r, 0))
    }

    // Compile every shader now so the first frames don't hitch.
    this.bus.emit('ui:load', { progress: done / total, label: 'Warming up shaders' })
    await new Promise(r => setTimeout(r, 0))
    const p = SPAWN
    ctx.player.teleport(p.x, heightAt(p.x, p.z), p.z, p.yaw)
    try {
      const r = this.renderer as THREE.WebGLRenderer & { compileAsync?: (s: THREE.Object3D, c: THREE.Camera) => Promise<void> }
      if (r.compileAsync) await r.compileAsync(ctx.scene, ctx.camera)
      else r.compile(ctx.scene, ctx.camera)
    } catch {
      /* compile is an optimisation only */
    }
    this.bus.emit('ui:load', { progress: 1, label: 'Ready' })
    this.setPhase('title')
    ctx.cameraRig.mode = 'title'
    this.applySettings(ctx.settings)
    this.last = performance.now()
    this.raf = requestAnimationFrame(this.frame)
  }

  /* ── public API for the React layer ──────────────────────── */

  hasSave(): boolean {
    const s = loadSave()
    return !!s && s.introSeen && !s.completed
  }

  get bestTime(): number | null {
    return this.profile.bestTime
  }

  /** Must be called from a click/tap so audio and pointer lock can start. */
  newGame(): void {
    this.ctx.audio.unlock()
    clearSave()
    this.save = newSave()
    this.enemiesDefeatedRun = 0
    this.syncAll()
    const ctx = this.ctx
    ctx.player.resetHealth()
    ctx.player.teleport(SPAWN.x, heightAt(SPAWN.x, SPAWN.z), SPAWN.z, SPAWN.yaw)
    ctx.cameraRig.mode = 'follow'
    ctx.cameraRig.snapBehind()
    ctx.input.requestPointerLock()
    this.runCutscene('intro').then(() => {
      this.save.introSeen = true
      storeSave(this.save)
      this.bus.emit('ui:objective', { text: 'Find the seven star shards' })
    })
  }

  continueGame(): void {
    this.ctx.audio.unlock()
    const s = loadSave()
    if (!s) return this.newGame()
    this.save = s
    this.syncAll()
    const sp = this.ctx.checkpoints.spawnPoint(s.checkpoint)
    this.ctx.player.resetHealth()
    this.ctx.player.teleport(sp.x, sp.y, sp.z, sp.yaw)
    this.ctx.cameraRig.mode = 'follow'
    this.ctx.cameraRig.snapBehind()
    this.ctx.input.requestPointerLock()
    this.setPhase('playing')
    this.setMusic('explore')
    const n = this.shardCount()
    this.bus.emit('ui:objective', {
      text: n >= TOTAL_SHARDS ? 'Return the shards to the Beacon' : `Find the star shards — ${n} of ${TOTAL_SHARDS}`,
    })
  }

  pause(): void {
    if (this.phase !== 'playing') return
    this.setPhase('paused')
    this.ctx.input.exitPointerLock()
    this.ctx.audio.ui('pause')
    this.flushSave()
  }

  /** Call from a click so pointer lock can be re-acquired. */
  resume(): void {
    if (this.phase !== 'paused' && this.phase !== 'victory') return
    this.ctx.input.reset()
    this.ctx.input.requestPointerLock()
    this.ctx.audio.ui('resume')
    this.setPhase('playing')
    this.last = performance.now()
  }

  restartFromCheckpoint(): void {
    if (this.phase === 'paused') this.resume()
    this.respawn()
  }

  quitToTitle(): void {
    this.flushSave()
    this.ctx.input.exitPointerLock()
    if (this.ctx.cutscenes.active) this.ctx.cutscenes.skip()
    this.closeDialogInternal()
    this.ctx.cameraRig.mode = 'title'
    this.setPhase('title')
    this.setMusic('title')
    this.bus.emit('ui:prompt', null)
  }

  /** Lets the player click back into the game after the browser dropped pointer lock. */
  requestPointerLock(): void {
    this.ctx.input.requestPointerLock()
  }

  skipCutscene(): void {
    if (this.ctx.cutscenes.active) this.ctx.cutscenes.skip()
  }

  advanceDialog(): void {
    const d = this.dialog
    if (!d) return
    d.page++
    if (d.page >= d.lines.length) {
      this.closeDialogInternal()
      return
    }
    this.ctx.audio.ui('ui-click')
    this.bus.emit('ui:dialog', { title: d.title, text: d.lines[d.page], page: d.page, pages: d.lines.length })
  }

  updateSettings(patch: Partial<Settings>): void {
    const next = { ...this.ctx.settings, ...patch }
    this.profile.settings = next
    storeProfile(this.profile)
    this.applySettings(next)
  }

  get settings(): Settings {
    return this.ctx.settings
  }

  setVirtualButton(action: Parameters<Input['setVirtual']>[0], down: boolean): void {
    this.ctx.input.setVirtual(action, down)
  }

  /** Top-down map image of the island (data URL), generated once. */
  getMapImage(size = 384): string {
    if (this.mapImage) return this.mapImage
    const c = document.createElement('canvas')
    c.width = c.height = size
    const g = c.getContext('2d')!
    const img = g.createImageData(size, size)
    const half = WORLD_HALF * 0.86
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        const x = -half + ((i + 0.5) / size) * half * 2
        const z = -half + ((j + 0.5) / size) * half * 2
        const h = heightAt(x, z)
        const hx = heightAt(x + 1, z) - h
        const hz = heightAt(x, z + 1) - h
        const shade = Math.max(0.55, Math.min(1.25, 1 - hx * 0.35 - hz * 0.25))
        const wl = waterLevelAt(x, z)
        let r: number, gg: number, b: number
        if (h < wl) {
          const d = Math.min(1, (wl - h) / 8)
          r = 30 - d * 14; gg = 64 - d * 26; b = 78 - d * 22
        } else if (h < 1.9) {
          r = 196; gg = 182; b = 140
        } else if (h > 14) {
          r = 128; gg = 136; b = 108
        } else {
          r = 98 + h * 1.5; gg = 128 + h; b = 82
        }
        const k = (j * size + i) * 4
        img.data[k] = r * (h < wl ? 1 : shade)
        img.data[k + 1] = gg * (h < wl ? 1 : shade)
        img.data[k + 2] = b * (h < wl ? 1 : shade)
        img.data[k + 3] = 255
      }
    }
    g.putImageData(img, 0, 0)
    this.mapImage = c.toDataURL('image/png')
    return this.mapImage
  }

  /** Everything the pause-menu map needs, in map-normalised coords (0..1). */
  getMapInfo() {
    const half = WORLD_HALF * 0.86
    const n = (x: number, z: number) => ({ u: (x + half) / (half * 2), v: (z + half) / (half * 2) })
    const p = this.ctx.player.position
    return {
      player: { ...n(p.x, p.z), yaw: this.ctx.player.yaw },
      shards: SHARDS.map(s => ({ ...n(s.x, s.z), name: s.name, hint: s.hint, collected: !!this.save.shards[s.index] })),
      checkpoints: CHECKPOINTS.map(c => ({ ...n(c.x, c.z), name: c.name, reached: this.save.checkpoints.includes(c.id) })),
      beacon: n(BEACON.x, BEACON.z),
    }
  }

  dispose(): void {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.resizeObs?.disconnect()
    document.removeEventListener('visibilitychange', this.onVisibility)
    const ctx = this.ctx
    for (const s of [ctx.net, ctx.audio, ctx.post, ctx.ambient, ctx.fx, ctx.cutscenes, ctx.signs, ctx.checkpoints, ctx.enemies, ctx.collectibles, ctx.cameraRig, ctx.player, ctx.character, ctx.zones, ctx.vegetation, ctx.env]) {
      try {
        s?.dispose()
      } catch (err) {
        console.warn('[starfall] dispose failed', err)
      }
    }
    ctx.input.destroy()
    ctx.textures.dispose()
    ctx.scene.traverse(o => {
      const m = o as THREE.Mesh
      if (m.geometry) m.geometry.dispose()
      const mat = m.material as THREE.Material | THREE.Material[] | undefined
      if (Array.isArray(mat)) mat.forEach(x => x.dispose())
      else mat?.dispose()
    })
    this.renderer.dispose()
    this.renderer.forceContextLoss()
    this.bus.clear()
    this.canvas.remove()
  }

  /* ── GameApi (used by systems) ───────────────────────────── */

  shardCount(): number {
    return this.save.shards.filter(Boolean).length
  }

  collectShard(index: number): void {
    if (this.save.shards[index]) return
    this.save.shards[index] = true
    storeSave(this.save)
    const def = SHARDS[index]
    const collected = this.shardCount()
    this.bus.emit('collect:shard', { pos: v3(this.ctx.collectibles.shardPosition(index)), index, collected })
    this.bus.emit('ui:shardBanner', { index, name: def.name, collected, total: TOTAL_SHARDS })
    this.hud.set({ shards: this.save.shards.slice() })
    this.runCutscene('shard', index).then(() => {
      if (collected >= TOTAL_SHARDS) {
        this.bus.emit('ui:objective', { text: 'All shards found — return to the Beacon on the summit' })
      } else {
        this.bus.emit('ui:objective', { text: `Find the star shards — ${collected} of ${TOTAL_SHARDS}` })
      }
    })
  }

  collectSpark(index: number): void {
    if (this.save.sparks.includes(index)) return
    this.save.sparks.push(index)
    this.saveDirty = true
    this.sparkChain = this.sparkChainT > 0 ? this.sparkChain + 1 : 0
    this.sparkChainT = 1.4
    this.hud.set({ sparks: this.save.sparks.length })
    this.bus.emit('collect:spark', { pos: v3(this.ctx.player.position), total: this.save.sparks.length, chain: this.sparkChain })
  }

  collectHeart(index: number): void {
    if (this.save.hearts.includes(index)) return
    this.save.hearts.push(index)
    this.saveDirty = true
    this.ctx.player.heal(2)
    this.bus.emit('collect:heart', { pos: v3(this.ctx.player.position) })
    this.bus.emit('ui:toast', { kind: 'heart', title: 'Health restored' })
  }

  defeatEnemy(index: number): void {
    if (this.save.enemies.includes(index)) return
    this.save.enemies.push(index)
    this.enemiesDefeatedRun++
    this.saveDirty = true
  }

  reachCheckpoint(id: string): void {
    if (this.save.checkpoint === id) return
    const first = !this.save.checkpoints.includes(id)
    this.save.checkpoint = id
    if (first) this.save.checkpoints.push(id)
    this.ctx.player.resetHealth()
    storeSave(this.save)
    const cp = CHECKPOINTS.find(c => c.id === id)
    const sp = this.ctx.checkpoints.spawnPoint(id)
    this.bus.emit('checkpoint', { id, pos: { x: sp.x, y: sp.y, z: sp.z }, first })
    this.bus.emit('ui:toast', { kind: 'checkpoint', title: 'Checkpoint', body: cp?.name })
  }

  playerDied(cause: 'water' | 'fall' | 'enemy'): void {
    if (this.dying || this.phase !== 'playing') return
    this.dying = true
    this.save.deaths++
    this.saveDirty = true
    this.bus.emit('player:died', { pos: v3(this.ctx.player.position), cause })
    this.hud.set({ deaths: this.save.deaths })
    if (cause === 'water') {
      this.respawn()
      return
    }
    // Go limp first, then fade out and respawn.
    const v = this.ctx.player.velocity
    this.ctx.character.startRagdoll({ x: v.x * 0.15, y: 2.5, z: v.z * 0.15 })
    this.ctx.player.controlEnabled = false
    this.after(1.4, () => this.respawn())
  }

  tryActivateBeacon(): void {
    const n = this.shardCount()
    if (n < TOTAL_SHARDS) {
      void this.showDialog('The Beacon', [
        `The great lantern is cold and dark. Its seven sockets wait for light — ${n} of ${TOTAL_SHARDS} are filled.`,
        'Find the rest of the star shards and return.',
      ])
      return
    }
    if (this.save.completed) {
      void this.showDialog('The Beacon', ['The Beacon burns bright. Ships will find their way home again.'])
      return
    }
    this.bus.emit('beacon:activate', { pos: v3(this.ctx.zones.beaconAltar) })
    this.runCutscene('beacon').then(() => this.victory())
  }

  showDialog(title: string, lines: string[]): Promise<void> {
    return new Promise(resolve => {
      this.closeDialogInternal()
      if (!lines.length) return resolve()
      this.dialog = { title, lines, page: 0, resolve }
      this.resumePhase = this.phase === 'dialog' ? 'playing' : this.phase
      this.ctx.player.controlEnabled = false
      this.setPhase('dialog')
      this.ctx.audio.ui('ui-open')
      this.bus.emit('ui:prompt', null)
      this.bus.emit('ui:dialog', { title, text: lines[0], page: 0, pages: lines.length })
    })
  }

  setMusic(mood: MusicMood): void {
    this.ctx.audio.setMusic(mood)
    this.bus.emit('audio:music', { mood })
  }

  shake(intensity: number, duration: number): void {
    if (!this.ctx.settings.cameraShake) return
    this.ctx.cameraRig.shake(intensity, duration)
  }

  /* ── internals ───────────────────────────────────────────── */

  private setPhase(p: GamePhase): void {
    if (this.phase === p) return
    this.phase = p
    const live = p === 'playing'
    this.ctx.input.enabled = live || p === 'dialog'
    this.ctx.input.capture = p !== 'title' && p !== 'loading'
    if (p === 'playing') this.ctx.player.controlEnabled = true
    this.ctx.enemies.frozen = p !== 'playing'
    this.bus.emit('ui:phase', { phase: p })
  }

  private after(seconds: number, fn: () => void): void {
    this.timers.push({ at: this.ctx.clock.real + seconds, fn })
  }

  private async runCutscene(name: 'intro' | 'shard' | 'beacon', arg?: number): Promise<void> {
    const prev = this.phase === 'title' ? 'playing' : this.phase === 'cutscene' ? 'playing' : this.phase
    this.setPhase('cutscene')
    this.ctx.player.controlEnabled = false
    this.bus.emit('ui:prompt', null)
    try {
      await this.ctx.cutscenes.play(name, arg)
    } catch (err) {
      console.error('[starfall] cutscene failed', err)
    }
    if (this.phase !== 'cutscene') return
    this.ctx.cameraRig.mode = 'follow'
    if (name !== 'beacon') {
      this.setPhase(prev === 'paused' ? 'playing' : prev)
      this.setMusic('explore')
      this.ctx.input.requestPointerLock()
    }
  }

  private closeDialogInternal(): void {
    const d = this.dialog
    if (!d) return
    this.dialog = null
    this.bus.emit('ui:dialog', null)
    this.ctx.player.controlEnabled = true
    if (this.phase === 'dialog') this.setPhase(this.resumePhase === 'dialog' ? 'playing' : this.resumePhase)
    this.ctx.input.reset()
    d.resolve()
  }

  private respawn(): void {
    const ctx = this.ctx
    this.dying = true
    ctx.player.controlEnabled = false
    this.bus.emit('ui:fade', { to: 1, duration: 0.45 })
    this.after(0.55, () => {
      const sp = ctx.checkpoints.spawnPoint(this.save.checkpoint)
      ctx.player.resetHealth()
      ctx.player.teleport(sp.x, sp.y, sp.z, sp.yaw)
      ctx.cameraRig.snapBehind()
      this.bus.emit('player:respawn', { pos: { x: sp.x, y: sp.y, z: sp.z } })
      this.bus.emit('ui:fade', { to: 0, duration: 0.6 })
      this.after(0.3, () => {
        ctx.player.controlEnabled = this.phase === 'playing'
        this.dying = false
      })
    })
  }

  private victory(): void {
    const t = this.save.playTime
    const prevBest = this.profile.bestTime
    const newBest = prevBest === null || t < prevBest
    if (newBest) this.profile.bestTime = t
    this.profile.completions++
    storeProfile(this.profile)
    this.save.completed = true
    storeSave(this.save)
    this.ctx.input.exitPointerLock()
    this.setPhase('victory')
    this.setMusic('victory')
    this.bus.emit('ui:victory', {
      time: t,
      bestTime: this.profile.bestTime,
      newBest,
      sparks: this.save.sparks.length,
      sparksTotal: this.ctx.collectibles.sparkTotal,
      deaths: this.save.deaths,
      enemies: this.save.enemies.length,
    })
  }

  private syncAll(): void {
    const ctx = this.ctx
    ctx.collectibles.syncWithSave()
    ctx.enemies.syncWithSave()
    ctx.checkpoints.syncWithSave()
    this.hud.set({
      shards: this.save.shards.slice(),
      sparks: this.save.sparks.length,
      sparksTotal: ctx.collectibles.sparkTotal,
      deaths: this.save.deaths,
      playTime: this.save.playTime,
    })
  }

  private flushSave(): void {
    if (this.phase === 'title' || this.phase === 'loading') return
    storeSave(this.save)
    this.saveDirty = false
  }

  private applySettings(s: Settings): void {
    const ctx = this.ctx
    const qualityChanged = ctx.quality.level !== s.quality
    ctx.settings = s
    ctx.quality = QUALITY[s.quality]
    ctx.camera.fov = s.fov
    ctx.camera.updateProjectionMatrix()
    ctx.input.sensitivity = s.mouseSensitivity
    this.renderer.shadowMap.enabled = ctx.quality.shadows
    ctx.env.sun.castShadow = ctx.quality.shadows
    if (qualityChanged) this.dynScale = 1
    this.resize()
    ctx.post.applyQuality()
    ctx.audio.applySettings()
  }

  private resize(): void {
    const w = Math.max(1, this.container.clientWidth)
    const h = Math.max(1, this.container.clientHeight)
    const ctx = this.ctx
    const pr = Math.min(window.devicePixelRatio || 1, ctx.quality.pixelRatio) * ctx.settings.renderScale * this.dynScale
    this.renderer.setPixelRatio(pr)
    this.renderer.setSize(w, h, false)
    ctx.camera.aspect = w / h
    ctx.camera.updateProjectionMatrix()
    ctx.post?.setSize(w, h, pr)
  }

  private handleGlobalInput(): void {
    const s = this.ctx.input.state
    if (this.phase === 'playing' && (s.pause || s.map)) {
      this.pause()
      return
    }
    if (this.phase === 'dialog' && (s.interact || s.jump || s.attack)) {
      this.advanceDialog()
    }
  }

  private updateHud(dt: number): void {
    this.hudT -= dt
    if (this.hudT > 0) return
    this.hudT = 0.1
    const ctx = this.ctx
    const p = ctx.player.position
    const yaw = ctx.cameraRig.yaw
    const markers: Array<{ angle: number; dist: number; kind: 'shard' | 'beacon' | 'checkpoint' }> = []
    const all = this.shardCount() >= TOTAL_SHARDS
    if (all) {
      const dx = BEACON.x - p.x
      const dz = BEACON.z - p.z
      markers.push({ angle: wrapAngle(yaw - Math.atan2(dx, dz)), dist: Math.hypot(dx, dz), kind: 'beacon' })
    } else {
      for (const sh of SHARDS) {
        if (this.save.shards[sh.index]) continue
        const dx = sh.x - p.x
        const dz = sh.z - p.z
        markers.push({ angle: wrapAngle(yaw - Math.atan2(dx, dz)), dist: Math.hypot(dx, dz), kind: 'shard' })
      }
    }
    const zone = zoneAt(p.x, p.z)
    this.hud.set({
      hp: ctx.player.hp,
      maxHp: ctx.player.maxHp,
      playTime: Math.floor(this.save.playTime),
      zone: zone?.name ?? '',
      fps: Math.round(this.fps),
      dash: Math.round(ctx.player.dashReady * 20) / 20,
      compass: markers,
      heading: Math.round(yaw * 100) / 100,
    })
  }

  private autoQuality(realDt: number): void {
    this.fpsFrames++
    this.fpsT += realDt
    if (this.fpsT < 1) return
    this.fps = this.fpsFrames / this.fpsT
    this.fpsFrames = 0
    this.fpsT = 0
    if (!this.ctx.settings.autoQuality || this.phase === 'paused' || this.phase === 'title') return
    if (this.fps < 48) {
      this.slowT++
      this.fastT = 0
    } else if (this.fps > 58) {
      this.fastT++
      this.slowT = 0
    } else {
      this.slowT = this.fastT = 0
    }
    if (this.slowT >= 2 && this.dynScale > 0.55) {
      this.dynScale = Math.max(0.55, this.dynScale - 0.12)
      this.slowT = 0
      this.resize()
    } else if (this.fastT >= 6 && this.dynScale < 1) {
      this.dynScale = Math.min(1, this.dynScale + 0.08)
      this.fastT = 0
      this.resize()
    }
  }

  private frame = (now: number): void => {
    if (this.disposed) return
    this.raf = requestAnimationFrame(this.frame)
    const realDt = Math.min(0.1, Math.max(0, (now - this.last) / 1000))
    this.last = now
    const dt = Math.min(1 / 20, realDt)
    const ctx = this.ctx
    ctx.clock.real += realDt

    // timers (real time)
    if (this.timers.length) {
      const due = this.timers.filter(t => t.at <= ctx.clock.real)
      if (due.length) {
        this.timers = this.timers.filter(t => t.at > ctx.clock.real)
        for (const t of due) t.fn()
      }
    }

    ctx.input.poll(realDt)
    this.handleGlobalInput()
    this.autoQuality(realDt)

    const phase = this.phase
    const sim = phase === 'playing' || phase === 'cutscene' || phase === 'dialog'
    try {
      if (sim) {
        ctx.clock.t += dt
        if (phase === 'playing') this.save.playTime += dt
        ctx.zones.update(dt)
        ctx.player.update(dt)
        ctx.character.setMotion(ctx.player.motion)
        ctx.character.update(dt)
        ctx.net.update(dt)
        ctx.enemies.update(dt)
        ctx.collectibles.update(dt)
        ctx.checkpoints.update(dt)
        ctx.signs.update(dt)
        ctx.cutscenes.update(dt)
        ctx.cameraRig.update(dt)
        ctx.env.setShadowFocus(ctx.player.position)
        ctx.env.update(dt)
        ctx.vegetation.update(dt)
        ctx.fx.update(dt)
        ctx.ambient.update(dt)
        ctx.audio.update(dt)
        this.sparkChainT -= dt
        this.updateHud(dt)
        this.saveFlushT -= dt
        if (this.saveDirty && this.saveFlushT <= 0) {
          this.saveFlushT = 5
          this.flushSave()
        }
        // Safety net: anything that ends up far below the world respawns.
        const p = ctx.player.position
        if (phase === 'playing' && !this.dying && (p.y < SEA_LEVEL - 25 || !Number.isFinite(p.y))) this.playerDied('fall')
      } else if (phase === 'title') {
        ctx.clock.t += dt
        ctx.zones.update(dt)
        ctx.character.setMotion(ctx.player.motion)
        ctx.character.update(dt)
        ctx.net.update(dt)
        ctx.collectibles.update(dt)
        ctx.cameraRig.update(dt)
        ctx.env.setShadowFocus(ctx.player.position)
        ctx.env.update(dt)
        ctx.vegetation.update(dt)
        ctx.fx.update(dt)
        ctx.ambient.update(dt)
        ctx.audio.update(dt)
      } else {
        // paused / victory: keep the last frame, redraw occasionally for the UI backdrop.
        // The network keeps running so other players keep moving and the link stays alive.
        ctx.audio.update(dt)
        ctx.net.update(dt)
        if (++this.pausedFrame % 4 !== 0) return
      }
      ctx.post.render(dt)
    } catch (err) {
      console.error('[starfall] frame failed', err)
      this.bus.emit('ui:error', { message: (err as Error).message })
      cancelAnimationFrame(this.raf)
    }
  }
}
