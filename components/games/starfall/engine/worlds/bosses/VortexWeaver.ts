/**
 * The Vortex Weaver — a pale storm drake that hangs in the air on churning wings and spins the
 * wind into blades.
 *
 *   phase 1  Gale Spiral: from the arena's heart, arms of wind blades wheel outward (walk the
 *            gaps). Downdrafts: circles chase the player, then slam down as wind columns.
 *            Wing Gust: a blast that shoves the player back while blades ride it.
 *            Then it lands, winded (vulnerable).
 *   phase 2  + The Vortex: a funnel at the centre drags the player in toward its eye while rings
 *            of blades spin out; homing feather darts.
 *   phase 3  Tempest: two spirals turning against each other; stronger pull.
 */
import * as THREE from 'three'
import type { Ctx } from '../../types'
import type { Arena } from './Boss'
import type { Hazards } from './hazards'
import { ScriptedBoss, type BossKit } from './ScriptedBoss'

type Move = 'spiral' | 'downdraft' | 'gust' | 'vortex' | 'feathers' | 'tempest' | 'perch'

const CYCLES: readonly (readonly Move[])[] = [
  ['spiral', 'downdraft', 'gust', 'perch'],
  ['spiral', 'vortex', 'feathers', 'downdraft', 'perch'],
  ['tempest', 'downdraft', 'vortex', 'feathers', 'gust', 'perch'],
]

const TUNE = [
  { gap: 1.0, arms: 3, spiral: 3.6, pull: 0, perch: 2.9, orbit: 0.32 },
  { gap: 0.8, arms: 4, spiral: 4.0, pull: 3.0, perch: 2.6, orbit: 0.4 },
  { gap: 0.6, arms: 3, spiral: 4.6, pull: 3.9, perch: 2.3, orbit: 0.48 },
]

const PERCH_LIFT = 0.35
const EYE_R = 2.8
const DRAFT_R = 2.6

const FUNNEL_VS = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`
const FUNNEL_FS = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uAlpha;
varying vec2 vUv;
void main() {
  float s = fract(vUv.x * 5.0 + vUv.y * 2.2 - uTime * 1.6);
  float band = smoothstep(0.0, 0.25, s) * (1.0 - smoothstep(0.45, 0.8, s));
  float s2 = fract(vUv.x * 9.0 - vUv.y * 1.3 - uTime * 2.4);
  float band2 = smoothstep(0.0, 0.2, s2) * (1.0 - smoothstep(0.3, 0.6, s2));
  float fade = smoothstep(0.0, 0.18, vUv.y) * (1.0 - smoothstep(0.75, 1.0, vUv.y));
  float a = (band * 0.55 + band2 * 0.3) * fade * uAlpha;
  gl_FragColor = vec4(uColor * (1.3 + band), a);
}`

export class VortexWeaver extends ScriptedBoss {
  private move: Move = 'spiral'
  private phaseAng = 0
  private shotT = 0
  private count = 0
  private orbitA = 0
  private liftTo: number
  private readonly v = new THREE.Vector3()
  private readonly funnel: THREE.Mesh
  private readonly funnelU: { uColor: { value: THREE.Color }; uTime: { value: number }; uAlpha: { value: number } }
  private funnelOn = 0

  constructor(ctx: Ctx, hazards: Hazards, arena: Arena, kit: BossKit, uid: number, seed: number) {
    super(ctx, hazards, arena, kit, 'vortexWeaver', uid, seed)
    this.liftTo = this.def.hover
    this.funnelU = { uColor: { value: new THREE.Color(this.def.color) }, uTime: { value: 0 }, uAlpha: { value: 0 } }
    const mat = this.own(new THREE.ShaderMaterial({
      vertexShader: FUNNEL_VS, fragmentShader: FUNNEL_FS, uniforms: this.funnelU,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }))
    this.funnel = new THREE.Mesh(this.own(new THREE.CylinderGeometry(4.6, 0.7, 7, 40, 8, true).translate(0, 3.5, 0)), mat)
    this.funnel.visible = false
    this.funnel.renderOrder = 5
    ctx.scene.add(this.funnel)
  }

  override dispose(): void {
    this.funnel.removeFromParent()
    super.dispose()
  }

  /* ── fight ───────────────────────────────────────────────── */

  protected choose(): void {
    this.move = this.next(CYCLES)
    this.count = 0
    this.shotT = 0
    this.phaseAng = this.rng.range(0, Math.PI * 2)
    const p = this.ctx.player.position
    switch (this.move) {
      case 'spiral':
      case 'tempest':
        this.play('flyFast')
        this.flare = 1.2
        this.cue('gust')
        break
      case 'downdraft':
        this.play('fly')
        break
      case 'gust':
        this.play('headbutt', { once: true, speed: 0.7 })
        this.flare = 1.3
        this.cue('windup')
        break
      case 'vortex':
        this.hazards.warn(this.arena.x, this.arena.y, this.arena.z, EYE_R, 1.4, null)
        this.play('flyFast')
        this.flare = 1.5
        this.cue('vortex')
        break
      case 'feathers':
        this.play('punch', { once: true })
        this.cue('volley')
        break
      case 'perch': {
        // Lands somewhere between the centre and the player: reachable with a blade.
        this.v.set((this.arena.x + p.x) / 2, this.arena.y, (this.arena.z + p.z) / 2)
        this.inArena(this.v, 3)
        this.play('fly', { speed: 0.6 })
        break
      }
    }
    this.setAct(this.move)
  }

  protected step(dt: number): void {
    const tune = TUNE[this.phase - 1]
    const t = this.actT
    const p = this.ctx.player.position
    this.turnToward(p.x, p.z, 3, dt)
    switch (this.move) {
      case 'spiral':
      case 'tempest': {
        this.glide(this.arena.x, this.arena.z, 9, dt, 0.4)
        const dur = tune.spiral + (this.move === 'tempest' ? 0.6 : 0)
        this.shotT -= dt
        if (t > 0.7 && t < 0.7 + dur && this.shotT <= 0) {
          this.shotT = 0.13
          this.phaseAng += 0.31
          const y = this.arena.y + 1.0
          this.projectiles.ring('gale', this.pos.x, y, this.pos.z, tune.arms, this.phaseAng, 0, undefined, this.floor)
          if (this.move === 'tempest') this.projectiles.ring('galeR', this.pos.x, y, this.pos.z, 3, -this.phaseAng * 1.1, 0, undefined, this.floor)
          this.ctx.fx.burst('dust', { x: this.pos.x, y: this.arena.y + 0.1, z: this.pos.z }, { count: 2, scale: 1.4, color: '#e8fbff' })
        }
        if (t >= 0.7 + dur + 0.4) this.done()
        break
      }
      case 'downdraft': {
        this.orbit(dt, tune.orbit)
        const n = 3
        if (this.count < n && t >= this.count * 0.55) {
          const x = p.x
          const z = p.z
          this.count++
          this.hazards.warn(x, this.arena.y, z, DRAFT_R, 1.0, () => this.draft(x, z))
          this.cue('gust')
        }
        if (t >= n * 0.55 + 1.3) this.done()
        break
      }
      case 'gust': {
        this.orbit(dt, tune.orbit * 0.3)
        if (t > 0.9 && t < 2.6) {
          // A steady blast pushing the player away, blades riding it.
          const dx = p.x - this.pos.x
          const dz = p.z - this.pos.z
          const d = Math.hypot(dx, dz)
          if (d > 0.5 && d < 18) {
            const k = (7 - this.phase * 0.2) * Math.min(1, (18 - d) / 6)
            this.ctx.player.drift((dx / d) * k, (dz / d) * k)
          }
          this.shotT -= dt
          if (this.shotT <= 0) {
            this.shotT = 0.42
            this.v.set(this.pos.x, this.arena.y + 1.1, this.pos.z)
            this.fanAt('gale', this.v, 5, 0.9)
          }
          if (Math.random() < dt * 20) {
            const a = this.yaw + (Math.random() - 0.5) * 0.9
            const r = Math.random() * 10
            this.ctx.fx.burst('dash', { x: this.pos.x + Math.sin(a) * r, y: this.arena.y + 0.6 + Math.random() * 1.5, z: this.pos.z + Math.cos(a) * r }, { dir: { x: Math.sin(a), y: 0, z: Math.cos(a) }, count: 2, color: '#e8fbff' })
          }
        }
        if (t >= 3) this.done()
        break
      }
      case 'vortex': {
        this.glide(this.arena.x, this.arena.z, 8, dt, 0.3)
        const on = t > 1.4 && t < 6.6
        this.funnelOn += ((on ? 1 : 0) - this.funnelOn) * Math.min(1, dt * 3)
        if (on) {
          // Dragged toward the eye; the eye itself hurts.
          const dx = this.arena.x - p.x
          const dz = this.arena.z - p.z
          const d = Math.hypot(dx, dz)
          if (d > 0.3) {
            const k = tune.pull * Math.min(1, d / 4) * (d < 12 ? 1 : 0.6)
            this.ctx.player.drift((dx / d) * k, (dz / d) * k)
          }
          if (this.playerIn(this.arena.x, this.arena.z, EYE_R, 2.2)) this.hurtPlayer(1, { x: this.arena.x, y: this.arena.y, z: this.arena.z })
          this.shotT -= dt
          if (this.shotT <= 0) {
            this.shotT = 0.95
            this.phaseAng += 0.4
            this.projectiles.ring('gale', this.arena.x, this.arena.y + 0.9, this.arena.z, 10, this.phaseAng, 0, 7, this.floor)
          }
        }
        if (t >= 7.1) this.done()
        break
      }
      case 'feathers': {
        this.orbit(dt, tune.orbit * 0.5)
        const waves = 3
        if (this.count < waves && t >= 0.4 + this.count * 0.6) {
          this.count++
          this.core(this.v, 0.6)
          this.fanAt('feather', this.v, 5, 0.75)
        }
        if (t >= 0.4 + waves * 0.6 + 0.6) this.done()
        break
      }
      case 'perch': {
        const landed = t > 0.9
        this.glide(this.v.x, this.v.z, 7, dt, 0.3)
        this.liftTo = landed ? PERCH_LIFT : this.def.hover
        if (landed && this.count === 0) {
          this.count = 1
          this.liftTo = PERCH_LIFT
          this.stun(tune.perch)
          this.play('hit', { once: true, speed: 0.6 })
          this.ctx.bus.emit('boss:slam', { pos: { x: this.pos.x, y: this.arena.y, z: this.pos.z }, boss: this.id })
          this.ctx.fx.burst('land', { x: this.pos.x, y: this.arena.y, z: this.pos.z }, { scale: 2.2, color: '#d9eef2' })
          if (this.playerIn(this.pos.x, this.pos.z, this.def.radius + 0.4, 1.5)) this.hurtPlayer(1)
        }
        if (this.count === 1 && !this.vulnerable && t > 1.2) {
          this.count = 2
          this.play('flyFast')
          this.liftTo = this.def.hover
        }
        if (this.count === 2 && this.lift > this.def.hover - 0.2) this.done()
        break
      }
    }
  }

  protected idle(dt: number): void {
    this.orbit(dt, TUNE[this.phase - 1].orbit)
    const p = this.ctx.player.position
    this.turnToward(p.x, p.z, 3, dt)
    this.play('fly')
  }

  protected pose(dt: number): void {
    // Ease the hover height toward its target (landing, taking off, falling when defeated).
    if (this.mode === 'dying') this.liftTo = 0
    this.lift += (this.liftTo - this.lift) * Math.min(1, dt * 2.6)
    const on = this.move === 'vortex' && this.act === 'vortex' ? this.funnelOn : Math.max(0, this.funnelOn - dt)
    this.funnelOn = on
    this.funnel.visible = on > 0.02
    if (this.funnel.visible) {
      this.funnel.position.set(this.arena.x, this.arena.y, this.arena.z)
      this.funnel.rotation.y -= dt * 2.4
      this.funnelU.uTime.value = this.ctx.clock.t
      this.funnelU.uAlpha.value = on
      this.funnel.scale.set(0.6 + on * 0.4, 0.4 + on * 0.6, 0.6 + on * 0.4)
    }
  }

  protected resetMoves(): void {
    this.liftTo = this.def.hover
    this.funnelOn = 0
    this.orbitA = 0
  }

  /* ── moves ───────────────────────────────────────────────── */

  private done(): void {
    this.setAct('idle', -TUNE[this.phase - 1].gap)
  }

  /** Circle the arena at a fixed radius. */
  private orbit(dt: number, speed: number): void {
    this.orbitA += speed * dt
    const r = Math.min(9, this.arena.r - 4)
    this.v.set(this.arena.x + Math.sin(this.orbitA) * r, 0, this.arena.z + Math.cos(this.orbitA) * r)
    this.glide(this.v.x, this.v.z, 6, dt, 0.2)
  }

  /** A wind column slams down where a downdraft circle filled. */
  private draft(x: number, z: number): void {
    const y = this.arena.y
    this.ctx.fx.burst('stomp', { x, y: y + 0.2, z }, { scale: 1.6, color: '#bffcff' })
    this.ctx.fx.burst('dust', { x, y: y + 0.2, z }, { scale: 2, color: '#e8fbff' })
    this.ctx.bus.emit('boss:impact', { pos: { x, y, z }, kind: 'orb' })
    if (this.playerIn(x, z, DRAFT_R, 1.6) && this.hurtPlayer(1, { x, y: y - 1, z })) this.ctx.player.launch(9)
  }

  private cue(c: 'gust' | 'windup' | 'vortex' | 'volley'): void {
    this.ctx.bus.emit('enemy:cue', { pos: { x: this.pos.x, y: this.pos.y + this.lift + 2, z: this.pos.z }, cue: c, kind: this.kind })
  }
}
