/**
 * Particles — pooled GPU particles for one-shot bursts and shooting-star streaks.
 *
 * Two pools (one draw call each, skipped while empty): additive for glows/sparks and
 * normal alpha for dust/smoke/water. Bursts are data-driven presets; gameplay events on
 * the bus fire them automatically, and cutscenes call burst()/streak() directly.
 */
import * as THREE from 'three'
import { surfaceAt, waterLevelAt, type Surface } from '../world/heightfield'
import type { V3 } from '../events'
import { QUALITY } from '../settings'
import type { BurstKind, Ctx, IParticles } from '../types'
import { MODE, ParticlePool, SHAPE, particleInit, rand, type ParticleInit } from './gpu'

/** How spawn velocities are distributed. */
type Dist = 'sphere' | 'hemi' | 'ring' | 'cone' | 'none'

interface SpecDef {
  add: boolean
  shape: number
  mode: number
  /** Base count at 'high' quality. */
  n: number
  life: [number, number]
  size: [number, number]
  /** End size = start size × grow. */
  grow: number
  speed: [number, number]
  dist: Dist
  /** Cone width (cone) or vertical jitter (ring). */
  spread?: number
  /** Extra upward velocity. */
  lift?: number
  /** Spawn position jitter radius. */
  jitter?: number
  yOff?: number
  gravity: number
  drag: number
  colors: [string, string]
  /** HDR multiplier on the colour (bloom picks up > 1). */
  intensity?: number
  alpha: number
  spin?: number
}

interface Spec extends SpecDef {
  c0: THREE.Color
  c1: THREE.Color
}

const GOLD: [string, string] = ['#fff3cf', '#ffc94a']

/** Every preset building block. Bursts combine one or more of these. */
const DEFS = {
  dust: { add: false, shape: SHAPE.smoke, mode: MODE.billboard, n: 6, life: [0.6, 1.1], size: [0.22, 0.38], grow: 2.6, speed: [0.5, 1.3], dist: 'ring', spread: 0.25, lift: 0.45, jitter: 0.2, yOff: 0.12, gravity: -0.4, drag: 3, colors: ['#cdbb94', '#e6d7b4'], alpha: 0.4, spin: 0.8 },
  landRing: { add: false, shape: SHAPE.smoke, mode: MODE.billboard, n: 16, life: [0.7, 1.25], size: [0.2, 0.32], grow: 2.3, speed: [2.2, 3.6], dist: 'ring', spread: 0.12, lift: 0.35, jitter: 0.25, yOff: 0.12, gravity: -0.3, drag: 4, colors: ['#cdbb94', '#e6d7b4'], alpha: 0.42, spin: 0.6 },
  jump: { add: false, shape: SHAPE.smoke, mode: MODE.billboard, n: 5, life: [0.45, 0.8], size: [0.18, 0.3], grow: 2.2, speed: [0.9, 1.6], dist: 'ring', spread: 0.1, lift: 0.2, jitter: 0.15, yOff: 0.08, gravity: -0.3, drag: 4, colors: ['#cdbb94', '#e6d7b4'], alpha: 0.38, spin: 0.6 },
  djSparks: { add: true, shape: SHAPE.star, mode: MODE.billboard, n: 18, life: [0.45, 0.8], size: [0.18, 0.28], grow: 0.3, speed: [2.4, 3.6], dist: 'ring', spread: 0.15, jitter: 0.15, yOff: 0.1, gravity: -1.5, drag: 3, colors: ['#ffffff', '#ffd98a'], intensity: 2.6, alpha: 1 },
  djRing: { add: true, shape: SHAPE.ring, mode: MODE.flat, n: 1, life: [0.42, 0.42], size: [0.35, 0.35], grow: 4.5, speed: [0, 0], dist: 'none', yOff: 0.05, gravity: 0, drag: 0, colors: ['#fff1c4', '#fff1c4'], intensity: 1.6, alpha: 0.6},
  dashGlow: { add: true, shape: SHAPE.glow, mode: MODE.stretch, n: 14, life: [0.25, 0.45], size: [0.08, 0.13], grow: 0.4, speed: [2, 4], dist: 'none', jitter: 0.35, gravity: 0, drag: 2.5, colors: ['#fff6dc', '#ffd27a'], intensity: 2.2, alpha: 0.85 },
  dashDust: { add: false, shape: SHAPE.smoke, mode: MODE.billboard, n: 5, life: [0.5, 0.9], size: [0.2, 0.32], grow: 2.4, speed: [0.4, 1], dist: 'hemi', jitter: 0.3, yOff: 0.15, gravity: -0.2, drag: 3, colors: ['#cdbb94', '#e6d7b4'], alpha: 0.36, spin: 0.6 },
  splashDrops: { add: false, shape: SHAPE.drop, mode: MODE.stretch, n: 26, life: [0.55, 0.95], size: [0.07, 0.12], grow: 0.6, speed: [3, 6], dist: 'cone', spread: 0.65, jitter: 0.25, yOff: 0.05, gravity: -14, drag: 0.5, colors: ['#eef7ff', '#cfe6f2'], intensity: 1.1, alpha: 0.85 },
  splashFoam: { add: false, shape: SHAPE.smoke, mode: MODE.billboard, n: 8, life: [0.6, 1.1], size: [0.32, 0.5], grow: 2.4, speed: [0.8, 1.8], dist: 'ring', spread: 0.3, lift: 0.6, jitter: 0.3, yOff: 0.1, gravity: -1, drag: 3, colors: ['#ffffff', '#e2f0f6'], alpha: 0.6, spin: 0.5 },
  ripple: { add: false, shape: SHAPE.ring, mode: MODE.flat, n: 1, life: [1.1, 1.5], size: [0.3, 0.4], grow: 6, speed: [0, 0], dist: 'none', gravity: 0, drag: 0, colors: ['#eef8ff', '#eef8ff'], intensity: 1.05, alpha: 0.8},
  sparkStars: { add: true, shape: SHAPE.star, mode: MODE.billboard, n: 12, life: [0.4, 0.75], size: [0.16, 0.28], grow: 0.25, speed: [1.2, 2.8], dist: 'sphere', jitter: 0.1, gravity: 0.6, drag: 2.5, colors: GOLD, intensity: 2.6, alpha: 1 },
  sparkFlash: { add: true, shape: SHAPE.glow, mode: MODE.billboard, n: 1, life: [0.28, 0.28], size: [0.7, 0.7], grow: 2.4, speed: [0, 0], dist: 'none', gravity: 0, drag: 0, colors: ['#ffe9a8', '#ffe9a8'], intensity: 1.6, alpha: 0.7 },
  shardFlash: { add: true, shape: SHAPE.glow, mode: MODE.billboard, n: 1, life: [0.7, 0.7], size: [1.6, 1.6], grow: 3.2, speed: [0, 0], dist: 'none', gravity: 0, drag: 0, colors: ['#fff2c2', '#fff2c2'], intensity: 2.4, alpha: 0.9 },
  shardRays: { add: true, shape: SHAPE.glow, mode: MODE.stretch, n: 26, life: [0.7, 1.2], size: [0.09, 0.15], grow: 0.3, speed: [9, 15], dist: 'sphere', gravity: -1, drag: 3.2, colors: ['#fffaf0', '#ffd36b'], intensity: 3, alpha: 1 },
  shardStars: { add: true, shape: SHAPE.star, mode: MODE.billboard, n: 40, life: [1.1, 2], size: [0.2, 0.38], grow: 0.2, speed: [2, 6], dist: 'sphere', jitter: 0.3, gravity: -0.6, drag: 2, colors: GOLD, intensity: 2.8, alpha: 1 },
  shardRing: { add: true, shape: SHAPE.ring, mode: MODE.billboard, n: 1, life: [0.55, 0.55], size: [0.4, 0.4], grow: 9, speed: [0, 0], dist: 'none', gravity: 0, drag: 0, colors: ['#ffe7a6', '#ffe7a6'], intensity: 1.8, alpha: 0.6 },
  heartShapes: { add: true, shape: SHAPE.heart, mode: MODE.billboard, n: 5, life: [0.9, 1.4], size: [0.28, 0.38], grow: 0.6, speed: [0.6, 1.4], dist: 'cone', spread: 0.8, jitter: 0.25, gravity: 0.8, drag: 1.6, colors: ['#ff6f9f', '#ff9cc0'], intensity: 1.7, alpha: 1 },
  heartSparks: { add: true, shape: SHAPE.star, mode: MODE.billboard, n: 14, life: [0.5, 0.9], size: [0.12, 0.22], grow: 0.3, speed: [1.2, 2.6], dist: 'sphere', jitter: 0.15, gravity: 0.5, drag: 2.5, colors: ['#ffd1e3', '#ff8fb8'], intensity: 2.2, alpha: 1 },
  poofSmoke: { add: false, shape: SHAPE.smoke, mode: MODE.billboard, n: 14, life: [0.8, 1.4], size: [0.32, 0.5], grow: 2.3, speed: [1, 2.6], dist: 'sphere', lift: 0.6, jitter: 0.3, yOff: 0.35, gravity: 0.4, drag: 3, colors: ['#4a3266', '#7d5aa6'], alpha: 0.72, spin: 1.2 },
  poofSparks: { add: true, shape: SHAPE.star, mode: MODE.billboard, n: 10, life: [0.5, 0.9], size: [0.12, 0.2], grow: 0.3, speed: [1.6, 3.2], dist: 'sphere', jitter: 0.2, yOff: 0.35, gravity: 0.3, drag: 2.5, colors: ['#e2c8ff', '#b07cff'], intensity: 2.2, alpha: 1 },
  stompStars: { add: true, shape: SHAPE.star, mode: MODE.billboard, n: 10, life: [0.4, 0.7], size: [0.18, 0.28], grow: 0.3, speed: [2.5, 4], dist: 'ring', spread: 0.35, lift: 1.2, yOff: 0.3, gravity: -4, drag: 2.5, colors: ['#ffffff', '#ffe08a'], intensity: 2.4, alpha: 1 },
  stompRing: { add: true, shape: SHAPE.ring, mode: MODE.flat, n: 1, life: [0.35, 0.35], size: [0.3, 0.3], grow: 4.5, speed: [0, 0], dist: 'none', yOff: 0.06, gravity: 0, drag: 0, colors: ['#fff4d6', '#fff4d6'], intensity: 1.4, alpha: 0.5 },
  hitSparks: { add: true, shape: SHAPE.glow, mode: MODE.stretch, n: 14, life: [0.25, 0.45], size: [0.07, 0.11], grow: 0.4, speed: [4, 7], dist: 'sphere', jitter: 0.1, gravity: -6, drag: 4, colors: ['#ffffff', '#ff7a5c'], intensity: 2.6, alpha: 1 },
  hitFlash: { add: true, shape: SHAPE.glow, mode: MODE.billboard, n: 1, life: [0.2, 0.2], size: [0.8, 0.8], grow: 1.8, speed: [0, 0], dist: 'none', gravity: 0, drag: 0, colors: ['#ff9a7a', '#ff9a7a'], intensity: 1.4, alpha: 0.6 },
  cpEmbers: { add: true, shape: SHAPE.glow, mode: MODE.billboard, n: 30, life: [1.4, 2.6], size: [0.07, 0.13], grow: 0.35, speed: [0.8, 2], dist: 'cone', spread: 0.45, jitter: 0.6, yOff: 0.4, gravity: 0.7, drag: 0.8, colors: ['#ffd27a', '#ff8a3d'], intensity: 3, alpha: 1 },
  cpFlash: { add: true, shape: SHAPE.glow, mode: MODE.billboard, n: 1, life: [0.6, 0.6], size: [0.9, 0.9], grow: 2.2, speed: [0, 0], dist: 'none', yOff: 1, gravity: 0, drag: 0, colors: ['#ffc47a', '#ffc47a'], intensity: 1.6, alpha: 0.7 },
  bounceRing: { add: true, shape: SHAPE.ring, mode: MODE.flat, n: 1, life: [0.4, 0.4], size: [0.4, 0.4], grow: 4, speed: [0, 0], dist: 'none', yOff: 0.08, gravity: 0, drag: 0, colors: ['#e9ffc4', '#e9ffc4'], intensity: 1.5, alpha: 0.7 },
  bounceSparks: { add: true, shape: SHAPE.star, mode: MODE.billboard, n: 12, life: [0.5, 0.85], size: [0.15, 0.24], grow: 0.3, speed: [2, 4], dist: 'cone', spread: 0.7, jitter: 0.3, yOff: 0.1, gravity: -3, drag: 2, colors: ['#f4ffd0', '#c8f07a'], intensity: 2.2, alpha: 1 },
  beaconFlash: { add: true, shape: SHAPE.glow, mode: MODE.billboard, n: 1, life: [1.1, 1.1], size: [3, 3], grow: 3, speed: [0, 0], dist: 'none', gravity: 0, drag: 0, colors: ['#fff0c8', '#fff0c8'], intensity: 2.2, alpha: 0.9 },
  beaconTrails: { add: true, shape: SHAPE.glow, mode: MODE.stretch, n: 90, life: [1.8, 3], size: [0.12, 0.2], grow: 0.3, speed: [9, 15], dist: 'sphere', gravity: -3.2, drag: 1.4, colors: ['#fff6e0', '#ffc65a'], intensity: 3.2, alpha: 1 },
  beaconStars: { add: true, shape: SHAPE.star, mode: MODE.billboard, n: 60, life: [2, 3.4], size: [0.22, 0.4], grow: 0.15, speed: [6, 12], dist: 'sphere', gravity: -2.4, drag: 1.6, colors: ['#ffffff', '#ffd98a'], intensity: 3, alpha: 1 },
  beaconRing: { add: true, shape: SHAPE.ring, mode: MODE.billboard, n: 1, life: [0.9, 0.9], size: [1, 1], grow: 14, speed: [0, 0], dist: 'none', gravity: 0, drag: 0, colors: ['#ffe2a0', '#ffe2a0'], intensity: 1.8, alpha: 0.55 },
  trail: { add: true, shape: SHAPE.glow, mode: MODE.billboard, n: 1, life: [0.45, 0.8], size: [1, 1], grow: 0.15, speed: [0, 0], dist: 'sphere', gravity: -0.4, drag: 1.5, colors: ['#ffffff', '#ffe2a0'], intensity: 2.4, alpha: 0.8 },
} satisfies Record<string, SpecDef>

type SpecName = keyof typeof DEFS

const DEFAULT_DUST = '#b7ae88'

/** Dust tint per ground surface (null = no dust). */
const SURFACE_DUST: Record<Surface, string | null> = {
  grass: '#b7ae88', sand: '#e6d3a4', dirt: '#a9885f', rock: '#b3ab9e', stone: '#b9b2a5',
  wood: '#b49c78', leaves: '#8f8a5c', metal: '#a2a2a2', water: null,
}

const MAX_STREAKS = 12
/** Ripple rings float this far above the still-water level so wave crests don't hide them. */
const RIPPLE_LIFT = 0.12

interface Streak {
  active: boolean
  t: number
  dur: number
  from: THREE.Vector3
  ctrl: THREE.Vector3
  to: THREE.Vector3
  head: THREE.Vector3
  last: THREE.Vector3
  color: THREE.Color
  size: number
  started: number
}

const _v = new THREE.Vector3()
const _d = new THREE.Vector3()
const _side = new THREE.Vector3()
const _dir = new THREE.Vector3()
const _col = new THREE.Color()
const _col2 = new THREE.Color()
const _white = new THREE.Color(1, 1, 1)
const _drawSize = new THREE.Vector2()
const UP = new THREE.Vector3(0, 1, 0)

export class Particles implements IParticles {
  private add: ParticlePool | null = null
  private alpha: ParticlePool | null = null
  private specs = {} as Record<SpecName, Spec>
  private p: ParticleInit = particleInit()
  private time = 0
  /** Count multiplier from ctx.quality.particles. */
  private qScale = 1
  private limitFor = -1
  private streaks: Streak[] = []
  private off: Array<() => void> = []

  constructor(private ctx: Ctx) {
    for (const [name, def] of Object.entries(DEFS) as Array<[SpecName, SpecDef]>) {
      this.specs[name] = { ...def, c0: new THREE.Color(def.colors[0]), c1: new THREE.Color(def.colors[1]) }
    }
    for (let i = 0; i < MAX_STREAKS; i++) {
      this.streaks.push({
        active: false, t: 0, dur: 1, from: new THREE.Vector3(), ctrl: new THREE.Vector3(), to: new THREE.Vector3(),
        head: new THREE.Vector3(), last: new THREE.Vector3(), color: new THREE.Color(), size: 1, started: 0,
      })
    }
  }

  init(): void {
    const ctx = this.ctx
    const noise = ctx.textures.get('noise')
    // Allocate for the richest profile once; quality changes only move the live limit.
    const maxParticles = QUALITY.ultra.particles
    // Normal-alpha first so additive glows draw over dust and smoke.
    this.alpha = new ParticlePool({ name: 'alpha', capacity: Math.round(maxParticles * 0.4), additive: false, noise, renderOrder: 20 })
    this.add = new ParticlePool({ name: 'add', capacity: Math.round(maxParticles * 0.6), additive: true, reserved: MAX_STREAKS * 2, noise, renderOrder: 21 })
    ctx.scene.add(this.alpha.mesh, this.add.mesh)
    this.applyLimits()
    this.subscribe()
  }

  update(dt: number): void {
    if (!this.add || !this.alpha) return
    this.time += dt
    if (this.limitFor !== this.ctx.quality.particles) this.applyLimits()
    this.updateStreaks(dt)
    const h = this.ctx.renderer.getDrawingBufferSize(_drawSize).y
    this.add.update(this.time, h)
    this.alpha.update(this.time, h)
  }

  burst(kind: BurstKind, pos: V3, opts: { dir?: V3; count?: number; color?: string; scale?: number } = {}): void {
    if (!this.add) return
    const s = opts.scale ?? 1
    const n = opts.count
    const color = opts.color
    switch (kind) {
      case 'dust':
        this.emit('dust', pos, s, n, color ?? DEFAULT_DUST)
        break
      case 'land':
        this.emit('landRing', pos, s, n, color ?? DEFAULT_DUST)
        if (s > 1.2) this.emit('dust', pos, s, undefined, color ?? DEFAULT_DUST)
        break
      case 'jump':
        this.emit('jump', pos, s, n, color ?? DEFAULT_DUST)
        break
      case 'doubleJump':
        this.emit('djSparks', pos, s, n, color)
        this.emit('djRing', pos, s, undefined, color)
        break
      case 'dash':
        this.dash(pos, opts.dir, s, n, color)
        break
      case 'splash': {
        const y = this.waterY(pos)
        _v.set(pos.x, y, pos.z)
        this.emit('splashDrops', _v, s, n, color)
        this.emit('splashFoam', _v, s, undefined, color)
        _v.y = y + RIPPLE_LIFT
        this.emit('ripple', _v, s * 1.2, undefined, color)
        break
      }
      case 'ripple':
        _v.set(pos.x, this.waterY(pos) + RIPPLE_LIFT, pos.z)
        this.emit('ripple', _v, s, n, color)
        break
      case 'spark':
        this.emit('sparkStars', pos, s, n, color)
        this.emit('sparkFlash', pos, s, undefined, color)
        break
      case 'shard':
        this.emit('shardFlash', pos, s, undefined, color)
        this.emit('shardRing', pos, s, undefined, color)
        this.emit('shardRays', pos, s, n, color)
        this.emit('shardStars', pos, s, n, color)
        break
      case 'heart':
        this.emit('heartShapes', pos, s, undefined, color)
        this.emit('heartSparks', pos, s, n, color)
        break
      case 'poof':
        this.emit('poofSmoke', pos, s, n, color)
        this.emit('poofSparks', pos, s, undefined)
        break
      case 'stomp':
        this.emit('stompRing', pos, s, undefined, color)
        this.emit('stompStars', pos, s, n, color)
        this.emit('dust', pos, s * 1.3, undefined, DEFAULT_DUST)
        break
      case 'hit':
        this.emit('hitFlash', pos, s, undefined, color)
        this.emit('hitSparks', pos, s, n, color)
        break
      case 'checkpoint':
        this.emit('cpFlash', pos, s, undefined, color)
        this.emit('cpEmbers', pos, s, n, color)
        break
      case 'bounce':
        this.emit('bounceRing', pos, s, undefined, color)
        this.emit('bounceSparks', pos, s, n, color)
        break
      case 'beacon':
        this.emit('beaconFlash', pos, s, undefined, color)
        this.emit('beaconRing', pos, s, undefined, color)
        this.emit('beaconTrails', pos, s, n, color)
        this.emit('beaconStars', pos, s, n ? Math.round(n * 0.6) : undefined, color)
        break
    }
  }

  streak(from: V3, to: V3, duration: number, color = '#ffe6a8'): void {
    if (!this.add) return
    // Reuse a free slot, or the oldest one.
    let st = this.streaks[0]
    let idx = 0
    for (let i = 0; i < this.streaks.length; i++) {
      const s = this.streaks[i]
      if (!s.active) {
        st = s
        idx = i
        break
      }
      if (s.started < st.started) {
        st = s
        idx = i
      }
    }
    if (st.active) this.endStreak(idx, false)
    st.active = true
    st.t = 0
    st.dur = Math.max(0.05, duration)
    st.started = this.time
    st.from.set(from.x, from.y, from.z)
    st.to.set(to.x, to.y, to.z)
    st.head.copy(st.from)
    st.last.copy(st.from)
    st.color.set(color)
    const len = st.from.distanceTo(st.to)
    st.size = THREE.MathUtils.clamp(len * 0.012, 0.35, 2.6)
    // Gentle arc: lift the midpoint and nudge it sideways.
    _d.subVectors(st.to, st.from)
    _side.crossVectors(_d, UP)
    if (_side.lengthSq() < 1e-6) _side.set(1, 0, 0)
    _side.normalize()
    st.ctrl
      .addVectors(st.from, st.to)
      .multiplyScalar(0.5)
      .addScaledVector(UP, len * 0.14)
      .addScaledVector(_side, len * rand(-0.08, 0.08))
  }

  dispose(): void {
    for (const off of this.off) off()
    this.off = []
    this.add?.dispose()
    this.alpha?.dispose()
    this.add = this.alpha = null
  }

  /* ── internals ─────────────────────────────────────────────── */

  private applyLimits(): void {
    const n = this.ctx.quality.particles
    this.limitFor = n
    this.qScale = THREE.MathUtils.clamp(n / 2500, 0.35, 1.3)
    this.add?.setLimit(n * 0.6 + MAX_STREAKS * 2)
    this.alpha?.setLimit(n * 0.4)
  }

  private subscribe(): void {
    const bus = this.ctx.bus
    const at = (p: V3, dy: number) => _v.set(p.x, p.y + dy, p.z)
    this.off.push(
      bus.on('player:land', e => {
        if (e.impact <= 3) return
        const dust = SURFACE_DUST[e.surface]
        const scale = THREE.MathUtils.clamp(0.55 + (e.impact - 3) / 10, 0.55, 1.6)
        if (dust) this.burst('land', e.pos, { scale, color: dust })
        else this.burst('ripple', e.pos, { scale })
      }),
      bus.on('player:footstep', e => {
        if (!e.sprint || (e.surface !== 'sand' && e.surface !== 'dirt')) return
        this.burst('dust', e.pos, { count: 3, scale: 0.65, color: SURFACE_DUST[e.surface] ?? DEFAULT_DUST })
      }),
      bus.on('player:jump', e => {
        if (e.double) this.burst('doubleJump', e.pos)
        else this.burst('jump', e.pos, { color: dustAt(e.pos) })
      }),
      bus.on('player:dash', e => this.burst('dash', e.pos, { dir: e.dir })),
      bus.on('player:splash', e => this.burst('splash', e.pos, { scale: e.big ? 1.6 : 1 })),
      bus.on('player:wade', e => this.burst('ripple', e.pos, { scale: 0.7 })),
      bus.on('player:bounce', e => this.burst('bounce', e.pos)),
      bus.on('player:hurt', e => this.burst('hit', at(e.pos, 0.9))),
      bus.on('collect:spark', e => this.burst('spark', at(e.pos, 1), { scale: 1 + Math.min(e.chain, 8) * 0.06 })),
      bus.on('collect:heart', e => this.burst('heart', at(e.pos, 1))),
      bus.on('collect:shard', e => this.burst('shard', e.pos)),
      bus.on('enemy:stomp', e => this.burst('stomp', e.pos)),
      bus.on('enemy:defeat', e => this.burst('poof', e.pos, { scale: e.big ? 1.5 : 1 })),
      bus.on('enemy:hit', e => this.burst('hit', e.pos, { color: '#e2c6ff', scale: e.weapon === 'hammer' ? 1.5 : 1 })),
      bus.on('weapon:slam', e => {
        this.burst('land', e.pos, { scale: 2.2, color: dustAt(e.pos) })
        this.burst('stomp', e.pos, { scale: 1.4 })
      }),
      bus.on('arrow:stick', e => this.burst('dust', e.pos, { count: 3, scale: 0.45, color: dustAt(e.pos) })),
      bus.on('checkpoint', e => this.burst('checkpoint', e.pos, { scale: e.first ? 1.2 : 0.8 })),
    )
  }

  /** Water surface under/around `p` (falls back to p.y away from water). */
  private waterY(p: V3): number {
    const w = waterLevelAt(p.x, p.z)
    return p.y > w - 2 && p.y < w + 1.5 ? w : p.y
  }

  /** Spawn one preset block. `scale` multiplies size, speed and spread. */
  private emit(name: SpecName, pos: V3, scale: number, count?: number, color?: string | THREE.Color): void {
    const spec = this.specs[name]
    const pool = spec.add ? this.add! : this.alpha!
    const n = count ?? Math.max(1, Math.round(spec.n * this.qScale * Math.sqrt(Math.max(0.25, scale))))
    let c0 = spec.c0
    let c1 = spec.c1
    if (color) {
      c0 = typeof color === 'string' ? _col.set(color) : _col.copy(color)
      c1 = _col2.copy(_col).lerp(_white, 0.3)
    }
    const k = spec.intensity ?? 1
    const p = this.p
    const jitter = (spec.jitter ?? 0) * scale
    for (let i = 0; i < n; i++) {
      randomDir(spec.dist, spec.spread ?? 0.3, _dir)
      const speed = rand(spec.speed[0], spec.speed[1]) * scale
      p.x = pos.x + (Math.random() * 2 - 1) * jitter
      p.y = pos.y + (spec.yOff ?? 0) * scale + (Math.random() * 2 - 1) * jitter * 0.3
      p.z = pos.z + (Math.random() * 2 - 1) * jitter
      p.vx = _dir.x * speed
      p.vy = _dir.y * speed + (spec.lift ?? 0) * scale
      p.vz = _dir.z * speed
      p.life = rand(spec.life[0], spec.life[1])
      p.size0 = rand(spec.size[0], spec.size[1]) * scale
      p.size1 = p.size0 * spec.grow
      p.gravity = spec.gravity
      p.drag = spec.drag
      const m = Math.random()
      p.r = (c0.r + (c1.r - c0.r) * m) * k
      p.g = (c0.g + (c1.g - c0.g) * m) * k
      p.b = (c0.b + (c1.b - c0.b) * m) * k
      p.a = spec.alpha
      p.rot = spec.shape === SHAPE.heart ? rand(-0.35, 0.35) : rand(0, Math.PI * 2)
      p.spin = (spec.spin ?? 0) * rand(-1, 1)
      p.shape = spec.shape
      p.mode = spec.mode
      pool.spawn(p, this.time)
    }
  }

  /** Dash: glowing wind streaks along the dash line plus a puff at the feet. */
  private dash(pos: V3, dir: V3 | undefined, scale: number, count: number | undefined, color: string | undefined): void {
    _d.set(dir?.x ?? 0, 0, dir?.z ?? 1)
    if (_d.lengthSq() < 1e-6) _d.set(0, 0, 1)
    _d.normalize()
    const spec = this.specs.dashGlow
    const n = count ?? Math.max(4, Math.round(spec.n * this.qScale))
    const c0 = color ? _col.set(color) : spec.c0
    const c1 = color ? _col2.copy(_col).lerp(_white, 0.4) : spec.c1
    const p = this.p
    for (let i = 0; i < n; i++) {
      const back = rand(0, 1.8) * scale
      p.x = pos.x - _d.x * back + rand(-0.35, 0.35)
      p.y = pos.y + rand(0.3, 1.4)
      p.z = pos.z - _d.z * back + rand(-0.35, 0.35)
      const speed = rand(spec.speed[0], spec.speed[1]) * scale
      p.vx = -_d.x * speed
      p.vy = rand(-0.2, 0.3)
      p.vz = -_d.z * speed
      p.life = rand(spec.life[0], spec.life[1])
      p.size0 = rand(spec.size[0], spec.size[1]) * scale
      p.size1 = p.size0 * spec.grow
      p.gravity = 0
      p.drag = spec.drag
      const m = Math.random()
      const k = spec.intensity ?? 1
      p.r = (c0.r + (c1.r - c0.r) * m) * k
      p.g = (c0.g + (c1.g - c0.g) * m) * k
      p.b = (c0.b + (c1.b - c0.b) * m) * k
      p.a = spec.alpha
      p.rot = 0
      p.spin = 0
      p.shape = spec.shape
      p.mode = spec.mode
      this.add!.spawn(p, this.time)
    }
    this.emit('dashDust', pos, scale, undefined, dustAt(pos))
  }

  private updateStreaks(dt: number): void {
    let live = 0
    for (let i = 0; i < this.streaks.length; i++) {
      const st = this.streaks[i]
      if (!st.active) continue
      st.t = Math.min(1, st.t + dt / st.dur)
      // Half linear, half ease-in-out: a confident start and a soft arrival.
      const u = st.t * 0.5 + st.t * st.t * (3 - 2 * st.t) * 0.5
      const a = 1 - u
      st.last.copy(st.head)
      st.head
        .copy(st.from)
        .multiplyScalar(a * a)
        .addScaledVector(st.ctrl, 2 * a * u)
        .addScaledVector(st.to, u * u)
      this.writeHead(i, st, dt)
      this.emitTrail(st)
      if (st.t >= 1) this.endStreak(i, true)
      else live++
    }
    this.add!.setPersistent(live)
  }

  /** The streak head lives in two reserved slots: a stretched comet glow and a sparkle. */
  private writeHead(i: number, st: Streak, dt: number): void {
    const p = this.p
    const inv = dt > 0 ? 1 / dt : 0
    p.x = st.head.x
    p.y = st.head.y
    p.z = st.head.z
    p.vx = (st.head.x - st.last.x) * inv
    p.vy = (st.head.y - st.last.y) * inv
    p.vz = (st.head.z - st.last.z) * inv
    p.life = 1e4
    p.gravity = 0
    p.drag = 0
    p.size0 = p.size1 = st.size * 0.55
    p.r = (st.color.r * 0.6 + 0.4) * 3
    p.g = (st.color.g * 0.6 + 0.4) * 3
    p.b = (st.color.b * 0.6 + 0.4) * 3
    p.a = 1
    p.rot = 0
    p.spin = 0
    p.shape = SHAPE.glow
    p.mode = MODE.stretch
    this.add!.spawn(p, this.time, i * 2)
    p.vx = p.vy = p.vz = 0
    p.size0 = p.size1 = st.size * 1.25
    p.r = st.color.r * 2.4
    p.g = st.color.g * 2.4
    p.b = st.color.b * 2.4
    p.rot = st.started * 7
    p.spin = 1.5
    p.shape = SHAPE.star
    p.mode = MODE.billboard
    this.add!.spawn(p, this.time, i * 2 + 1)
  }

  /** Fill the path travelled this frame with fading glow motes (and the odd falling sparkle). */
  private emitTrail(st: Streak): void {
    _d.subVectors(st.head, st.last)
    const dist = _d.length()
    if (dist < 1e-4) return
    // Dense enough that neighbouring motes overlap into a continuous ribbon.
    const spacing = (st.size * 0.14) / Math.sqrt(this.qScale)
    const n = Math.min(32, Math.ceil(dist / spacing))
    const spec = this.specs.trail
    const p = this.p
    for (let j = 0; j < n; j++) {
      const f = (j + Math.random()) / n
      const jit = st.size * 0.12
      p.x = st.last.x + _d.x * f + rand(-jit, jit)
      p.y = st.last.y + _d.y * f + rand(-jit, jit)
      p.z = st.last.z + _d.z * f + rand(-jit, jit)
      randomDir('sphere', 0, _dir)
      const drift = st.size * 0.25
      p.vx = _dir.x * drift
      p.vy = _dir.y * drift
      p.vz = _dir.z * drift
      const sparkle = Math.random() < 0.12
      const m = Math.random()
      if (sparkle) {
        p.life = rand(0.8, 1.4)
        p.size0 = st.size * rand(0.18, 0.3)
        p.size1 = p.size0 * 0.3
        p.gravity = -1.5
        p.shape = SHAPE.star
        p.rot = rand(0, 6.28)
      } else {
        p.life = rand(spec.life[0], spec.life[1])
        p.size0 = st.size * rand(0.4, 0.6)
        p.size1 = p.size0 * spec.grow
        p.gravity = spec.gravity
        p.shape = SHAPE.glow
        p.rot = 0
      }
      p.drag = spec.drag
      const k = spec.intensity ?? 1
      p.r = (1 + (st.color.r - 1) * m) * k
      p.g = (1 + (st.color.g - 1) * m) * k
      p.b = (1 + (st.color.b - 1) * m) * k
      p.a = spec.alpha
      p.spin = 0
      p.mode = MODE.billboard
      this.add!.spawn(p, this.time)
    }
  }

  private endStreak(i: number, arrived: boolean): void {
    const st = this.streaks[i]
    st.active = false
    this.add!.kill(i * 2)
    this.add!.kill(i * 2 + 1)
    if (arrived) this.emit('sparkStars', st.to, Math.max(1, st.size), undefined, st.color)
  }
}

/** Dust tint of the terrain at `p` (jump/dash puffs). */
function dustAt(p: V3): string {
  return SURFACE_DUST[surfaceAt(p.x, p.z)] ?? DEFAULT_DUST
}

/** Random direction for a distribution (unit length except `none`). */
function randomDir(dist: Dist, spread: number, out: THREE.Vector3): THREE.Vector3 {
  switch (dist) {
    case 'none':
      return out.set(0, 0, 0)
    case 'ring': {
      const a = Math.random() * Math.PI * 2
      return out.set(Math.cos(a), (Math.random() * 2 - 1) * spread, Math.sin(a)).normalize()
    }
    case 'cone': {
      sphere(out)
      return out.multiplyScalar(spread).add(UP).normalize()
    }
    case 'hemi':
      sphere(out)
      out.y = Math.abs(out.y)
      return out
    default:
      return sphere(out)
  }
}

function sphere(out: THREE.Vector3): THREE.Vector3 {
  const u = Math.random() * 2 - 1
  const a = Math.random() * Math.PI * 2
  const r = Math.sqrt(1 - u * u)
  return out.set(r * Math.cos(a), u, r * Math.sin(a))
}
