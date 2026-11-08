/**
 * Starfall's sound: synthesised SFX, a procedural score and island ambience,
 * all generated live with WebAudio (no audio files).
 *
 * Nothing exists until `unlock()` is called from a user gesture; before that
 * every method is a silent no-op. Gameplay sounds come from bus events, the
 * listener follows the camera every frame, and the ambience is re-steered a
 * few times per second.
 */
import type { GamePhase, MusicMood } from '../events'
import type { Ctx, IAudio, SfxName } from '../types'
import { Ambience, type AmbienceInput } from './ambience'
import { Mixer } from './mixer'
import { Music } from './music'
import { Sfx } from './sfx'
import { Synth } from './synth'

const DEV = process.env.NODE_ENV !== 'production'
/** How often the ambience is re-steered (s). */
const AMBIENCE_TICK = 0.25

/** Music / ambience duck per game phase. */
const DUCK: Record<GamePhase, [music: number, ambience: number]> = {
  loading: [1, 1],
  title: [1, 0.8],
  playing: [1, 1],
  paused: [0.3, 0.45],
  cutscene: [1, 0.75],
  dialog: [0.7, 0.85],
  victory: [1, 0.55],
}

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext }

export class AudioEngine implements IAudio {
  private ac: AudioContext | null = null
  private mix: Mixer | null = null
  private sfx: Sfx | null = null
  private music: Music | null = null
  private amb: Ambience | null = null
  private mood: MusicMood = 'title'
  private hidden = false
  private disposed = false
  private phase: GamePhase | null = null
  private ambT = 0
  private unsubs: Array<() => void> = []
  private ambIn: AmbienceInput = { x: 0, y: 0, z: 0, rx: 1, rz: 0, daylight: 1, dt: 0 }

  constructor(private ctx: Ctx) {}

  init(): void {
    const bus = this.ctx.bus
    const on = this.unsubs
    on.push(
      bus.on('player:footstep', e => this.sfx?.footstep(e.surface, e.sprint)),
      bus.on('player:jump', e => this.sfx?.jump(e.double)),
      bus.on('player:land', e => this.sfx?.land(e.impact, e.surface)),
      bus.on('player:dash', () => this.sfx?.dash()),
      bus.on('player:attack', () => this.sfx?.attack()),
      bus.on('player:hurt', () => this.sfx?.hurt()),
      bus.on('player:died', () => this.sfx?.died()),
      bus.on('player:respawn', () => this.sfx?.respawn()),
      bus.on('player:splash', e => this.sfx?.splash(e.big)),
      bus.on('player:wade', () => this.sfx?.wade()),
      bus.on('player:bounce', () => this.sfx?.bounce()),
      bus.on('collect:spark', e => this.sfx?.spark(e.chain)),
      bus.on('collect:heart', () => this.sfx?.heart()),
      bus.on('collect:shard', () => {
        if (!this.sfx) return
        this.sfx.shard()
        this.music?.duck(0.3, 2.6)
      }),
      bus.on('enemy:alert', e => this.sfx?.enemyAlert(e.pos)),
      bus.on('enemy:stomp', e => this.sfx?.enemyStomp(e.pos)),
      bus.on('enemy:defeat', e => this.sfx?.enemyDefeat(e.pos, e.big)),
      bus.on('checkpoint', e => this.sfx?.checkpoint(e.first)),
      bus.on('beacon:activate', () => {
        if (!this.sfx) return
        this.sfx.beacon()
        this.music?.duck(0.15, 6.5)
        this.amb?.igniteBeacon(this.ctx.zones.beaconLantern)
      }),
      bus.on('cutscene:start', () => this.sfx?.cutscene(true)),
      bus.on('cutscene:end', e => this.sfx?.cutscene(false, e.skipped)),
    )
  }

  unlock(): void {
    if (this.disposed) return
    if (!this.ac) this.build()
    const ac = this.ac
    if (ac && ac.state !== 'running' && !this.hidden) ac.resume().catch(() => {})
  }

  applySettings(): void {
    if (!this.mix || !this.ac) return
    const s = this.ctx.settings
    this.mix.setVolumes(s.masterVolume, s.musicVolume, s.sfxVolume, s.ambienceVolume, this.ac.currentTime)
  }

  ui(name: SfxName): void {
    if (this.ac?.state === 'running') this.sfx?.ui(name)
  }

  setMusic(mood: MusicMood): void {
    this.mood = mood
    this.music?.setMood(mood)
  }

  setPaused(paused: boolean): void {
    this.hidden = paused
    const ac = this.ac
    if (!ac || ac.state === 'closed') return
    if (paused) {
      this.music?.stop()
      ac.suspend().catch(() => {})
    } else {
      ac.resume().catch(() => {})
      this.music?.start()
    }
  }

  update(dt: number): void {
    const ac = this.ac
    if (!ac || ac.state !== 'running') return
    try {
      this.syncListener(ac)
      const phase = this.ctx.game.phase
      if (phase !== this.phase) {
        this.phase = phase
        const [m, a] = DUCK[phase] ?? DUCK.playing
        const t = ac.currentTime
        this.mix!.music.setDuck(m, t, phase === 'paused' ? 0.15 : 0.4)
        this.mix!.ambience.setDuck(a, t, 0.5)
      }
      this.ambT -= dt
      if (this.ambT <= 0) {
        this.steerAmbience(AMBIENCE_TICK - this.ambT)
        this.ambT = AMBIENCE_TICK
      }
    } catch (err) {
      // Sound is decoration: never let it break the frame.
      if (DEV) console.warn('[starfall] audio update failed', err)
    }
  }

  dispose(): void {
    this.disposed = true
    for (const off of this.unsubs) off()
    this.unsubs.length = 0
    this.music?.dispose()
    this.amb?.dispose()
    this.ac?.close().catch(() => {})
    this.ac = null
    this.mix = this.sfx = this.music = this.amb = null
  }

  /**
   * Development-only hooks for automated tests: the output analyser, the
   * context and the current ambience targets. Null in production builds.
   */
  get debug(): { analyser: AnalyserNode | null; context: AudioContext | null; mood: MusicMood; ambience: Ambience['levels'] | null } | null {
    if (!DEV) return null
    return { analyser: this.mix?.analyser ?? null, context: this.ac, mood: this.mood, ambience: this.amb?.levels ?? null }
  }

  /* ── internals ───────────────────────────────────────────── */

  private build(): void {
    if (typeof window === 'undefined') return
    const Ctor = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext
    if (!Ctor) return
    let ac: AudioContext | null = null
    try {
      ac = new Ctor({ latencyHint: 'interactive' })
      const syn = new Synth(ac)
      this.mix = new Mixer(syn, DEV)
      this.sfx = new Sfx(syn, this.mix)
      this.amb = new Ambience(syn, this.mix.ambience)
      this.music = new Music(syn, this.mix)
      this.ac = ac
      this.applySettings()
      this.music.setMood(this.mood)
      if (!this.hidden) this.music.start()
      if (this.ctx.game?.save?.completed && this.ctx.zones) this.amb.igniteBeacon(this.ctx.zones.beaconLantern)
    } catch (err) {
      console.warn('[starfall] audio unavailable', err)
      ac?.close().catch(() => {})
      this.ac = null
      this.mix = this.sfx = this.music = this.amb = null
    }
  }

  /** Listener = camera; reads the world matrix directly so nothing is allocated. */
  private syncListener(ac: AudioContext): void {
    const m = this.ctx.camera.matrixWorld.elements
    const L = ac.listener
    if (L.positionX) {
      L.positionX.value = m[12]
      L.positionY.value = m[13]
      L.positionZ.value = m[14]
      L.forwardX.value = -m[8]
      L.forwardY.value = -m[9]
      L.forwardZ.value = -m[10]
      L.upX.value = m[4]
      L.upY.value = m[5]
      L.upZ.value = m[6]
    } else {
      L.setPosition(m[12], m[13], m[14])
      L.setOrientation(-m[8], -m[9], -m[10], m[4], m[5], m[6])
    }
  }

  private steerAmbience(dt: number): void {
    const amb = this.amb
    if (!amb) return
    const ctx = this.ctx
    const i = this.ambIn
    // Habitat follows the player while playing; on the title screen, the camera's focus area.
    const p = ctx.player?.position
    const m = ctx.camera.matrixWorld.elements
    if (p && this.phase !== 'title') {
      i.x = p.x
      i.y = p.y
      i.z = p.z
    } else {
      i.x = m[12]
      i.y = Math.min(m[13], 12)
      i.z = m[14]
    }
    const rl = Math.hypot(m[0], m[2]) || 1
    i.rx = m[0] / rl
    i.rz = m[2] / rl
    const fog = ctx.env?.fogColor
    const lum = fog ? 0.2126 * fog.r + 0.7152 * fog.g + 0.0722 * fog.b : 0.6
    i.daylight = Math.max(0, Math.min(1, (lum - 0.05) / 0.25))
    i.dt = dt
    amb.tick(i)
  }
}
