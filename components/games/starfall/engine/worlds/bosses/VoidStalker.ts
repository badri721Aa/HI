/**
 * The Void Stalker — a horned shadow with a skull for a face and claws like scythes. It doesn't
 * walk; it is simply somewhere else.
 *
 *   phase 1  Blink: it melts away and a circle marks the ground behind the player — it
 *            reappears there and rakes. Shadow Needles: fans of violet needles.
 *            Rend: a lane lights up, it lunges along it, then hangs exposed.
 *   phase 2  + Shadow Clones: it splits into three that circle the player and throw needles.
 *            Clones burst at one touch; the real one casts a shadow (and keeps its rune).
 *            Strike the real one to shatter the illusion and stagger it.
 *   phase 3  Eclipse: darkness closes in around the player — only its eyes and needles show.
 */
import * as THREE from 'three'
import { BEAM } from '../../gameplay/enemies/Beams'
import type { EnemyModel } from '../../gameplay/enemies/models'
import type { Ctx, WeaponHit } from '../../types'
import { glowTexture } from '../../gameplay/parts/util'
import type { Arena } from './Boss'
import type { Hazards } from './hazards'
import { ScriptedBoss, type BossKit } from './ScriptedBoss'

type Move = 'blink' | 'needles' | 'rend' | 'clones'

const CYCLES: readonly (readonly Move[])[] = [
  ['blink', 'needles', 'blink', 'rend'],
  ['clones', 'blink', 'needles', 'blink', 'rend'],
  ['clones', 'blink', 'needles', 'rend', 'blink', 'needles'],
]

const TUNE = [
  { gap: 1.0, waves: 3, fan: 7, tell: 0.9, exposed: 1.6, clones: 0 },
  { gap: 0.8, waves: 3, fan: 9, tell: 0.8, exposed: 1.4, clones: 2 },
  { gap: 0.6, waves: 4, fan: 9, tell: 0.7, exposed: 1.3, clones: 2 },
]

const FADE = 0.32
const RAKE_R = 2.4
const DARK_R = 10

interface Clone {
  model: EnemyModel
  on: boolean
  a: number
  shotT: number
  untarget: (() => void) | null
  readonly pos: THREE.Vector3
}

export class VoidStalker extends ScriptedBoss {
  private move: Move = 'blink'
  private count = 0
  private hidden = false
  private shotT = 0
  private orbitA = 0
  private readonly spot = new THREE.Vector3()
  private readonly v = new THREE.Vector3()
  /** Rend's lunge heading; its own vector because pose() reuses `v` between frames. */
  private readonly rendDir = new THREE.Vector3()
  private readonly clones: Clone[] = []
  private readonly dark: THREE.Mesh
  private darkness = 0
  private readonly eyes: THREE.Sprite[] = []
  private readonly tint = new THREE.Color()

  constructor(ctx: Ctx, hazards: Hazards, arena: Arena, kit: BossKit, uid: number, seed: number) {
    super(ctx, hazards, arena, kit, 'voidStalker', uid, seed)
    // Two shadow copies, made once and reused.
    for (let i = 0; i < 2; i++) {
      const model = kit.lib.create(this.def.model, '#3a1466')
      model.skin.uTint.value.set(0.05, 0.02, 0.1, 0.55)
      model.root.visible = false
      model.setShadows(false)
      ctx.scene.add(model.root)
      const clone: Clone = { model, on: false, a: 0, shotT: 0, untarget: null, pos: new THREE.Vector3() }
      this.clones.push(clone)
    }
    // Eclipse: a dark shell around the player; anything beyond it sinks into shadow.
    const darkMat = this.own(new THREE.MeshBasicMaterial({ color: 0x07030d, transparent: true, opacity: 0, side: THREE.BackSide, depthWrite: false, fog: false }))
    this.dark = new THREE.Mesh(this.own(new THREE.SphereGeometry(DARK_R, 32, 16)), darkMat)
    this.dark.renderOrder = 10
    this.dark.visible = false
    this.dark.frustumCulled = false
    ctx.scene.add(this.dark)
    // Eyes that burn through the dark.
    const glow = glowTexture(ctx)
    if (glow.owned) this.own(glow.texture)
    const eyeMat = this.own(new THREE.SpriteMaterial({ map: glow.texture, color: 0xd6a8ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))
    for (let i = 0; i < 2; i++) {
      const s = new THREE.Sprite(eyeMat)
      s.renderOrder = 12
      s.scale.setScalar(0.55)
      this.eyes.push(s)
      ctx.scene.add(s)
    }
  }

  override dispose(): void {
    for (const c of this.clones) {
      c.untarget?.()
      c.model.dispose()
    }
    this.clones.length = 0
    this.dark.removeFromParent()
    for (const e of this.eyes) e.removeFromParent()
    super.dispose()
  }

  /* ── fight ───────────────────────────────────────────────── */

  protected choose(): void {
    this.move = this.next(CYCLES)
    if (this.move === 'clones' && TUNE[this.phase - 1].clones === 0) this.move = 'needles'
    this.count = 0
    this.shotT = 0
    switch (this.move) {
      case 'blink':
      case 'clones':
        this.play('flyFast')
        this.cue('teleport')
        break
      case 'needles':
        this.play('headbutt', { once: true, speed: 0.8 })
        this.cue('volley')
        break
      case 'rend': {
        const p = this.ctx.player.position
        this.spot.set(p.x, this.arena.y, p.z)
        this.play('punch', { once: true, speed: 0.6 })
        this.flare = 1.2
        this.cue('windup')
        break
      }
    }
    this.setAct(this.move)
  }

  protected step(dt: number): void {
    const tune = TUNE[this.phase - 1]
    const t = this.actT
    const p = this.ctx.player.position
    switch (this.move) {
      case 'blink': {
        const tell = tune.tell
        if (t < FADE) this.fade(t / FADE)
        else if (this.count === 0) {
          this.count = 1
          this.hide(true)
          // Behind the player, where he isn't looking.
          const yaw = this.ctx.player.yaw
          this.spot.set(p.x - Math.sin(yaw) * 2.3, this.arena.y, p.z - Math.cos(yaw) * 2.3)
          this.inArena(this.spot, 1.5)
          this.hazards.warn(this.spot.x, this.arena.y, this.spot.z, RAKE_R, tell, null)
        } else if (this.count === 1 && t >= FADE + tell - 0.25) {
          this.count = 2
          this.pos.set(this.spot.x, this.arena.y, this.spot.z)
          this.yaw = Math.atan2(p.x - this.pos.x, p.z - this.pos.z)
          this.hide(false)
          this.play('punch', { once: true, speed: 1.2 })
          this.cue('teleport')
        } else if (this.count === 2) {
          this.fade(1 - Math.min(1, (t - (FADE + tell - 0.25)) / 0.2))
          if (t >= FADE + tell) {
            this.count = 3
            this.rake(this.spot.x, this.spot.z)
            if (this.phase === 1 || this.rng.next() < 0.4) this.stun(tune.exposed)
          }
        }
        if (this.count === 3 && t >= FADE + tell + Math.max(0.7, this.vulnerable ? tune.exposed : 0)) this.done()
        break
      }
      case 'needles': {
        this.turnToward(p.x, p.z, 4, dt)
        if (this.count < tune.waves && t >= 0.45 + this.count * 0.45) {
          this.count++
          this.core(this.v, 0.55)
          this.fanAt('needle', this.v, tune.fan, 0.95)
          this.ctx.fx.burst('hit', this.v, { color: '#b26bff', scale: 0.9 })
        }
        if (this.phase >= 2 && this.count === tune.waves && t >= 0.45 + tune.waves * 0.45 + 0.2) {
          this.count++
          this.core(this.v, 0.4)
          this.projectiles.ring('needle', this.v.x, this.v.y, this.v.z, 14, this.rng.range(0, Math.PI), 0, 11, this.floor)
        }
        if (t >= 0.45 + tune.waves * 0.45 + 0.8) this.done()
        break
      }
      case 'rend': {
        const windup = 0.8
        if (t < windup) {
          // A lane from the claws to the player (it tracks for a moment, then commits).
          if (t < windup * 0.7) this.spot.set(p.x, this.arena.y, p.z)
          this.turnToward(this.spot.x, this.spot.z, 6, dt)
          this.v.set(this.pos.x, this.arena.y + 0.06, this.pos.z)
          const dx = this.spot.x - this.pos.x
          const dz = this.spot.z - this.pos.z
          const d = Math.max(0.5, Math.hypot(dx, dz))
          const len = Math.min(16, d + 3)
          this.beams.draw(this.v, { x: this.pos.x + (dx / d) * len, y: this.arena.y + 0.06, z: this.pos.z + (dz / d) * len }, 2, this.colorOf(), 0.6 + t, BEAM.lane)
        } else if (t < windup + 0.55) {
          if (this.count === 0) {
            this.count = 1
            this.cue('charge')
            const dx = this.spot.x - this.pos.x
            const dz = this.spot.z - this.pos.z
            const d = Math.max(0.5, Math.hypot(dx, dz))
            this.rendDir.set(dx / d, 0, dz / d)
          }
          this.pos.x += this.rendDir.x * 17 * dt
          this.pos.z += this.rendDir.z * 17 * dt
          this.clampToArena(this.pos, this.def.radius + 0.5)
          this.contact(1, 0.9)
          this.ctx.fx.trail('ghost', { x: this.pos.x, y: this.arena.y + 1.5, z: this.pos.z }, { x: this.pos.x - this.rendDir.x, y: this.arena.y + 1.5, z: this.pos.z - this.rendDir.z }, 0xb26bff)
        } else if (this.count === 1) {
          this.count = 2
          this.stun(tune.exposed + 0.4)
          this.play('hit', { once: true, speed: 0.6 })
        }
        if (this.count === 2 && t >= windup + 0.55 + tune.exposed + 0.4) this.done()
        break
      }
      case 'clones':
        this.stepClones(dt, t)
        break
    }
  }

  protected idle(dt: number): void {
    const p = this.ctx.player.position
    this.orbitA += dt * 0.45
    this.v.set(p.x + Math.sin(this.orbitA) * 7, 0, p.z + Math.cos(this.orbitA) * 7)
    this.inArena(this.v, 2)
    this.glide(this.v.x, this.v.z, 4.5, dt, 0.3)
    this.turnToward(p.x, p.z, 4, dt)
    this.play('fly')
  }

  protected touches(c: { x: number; y: number; z: number }, r: number): boolean {
    return !this.hidden && super.touches(c, r)
  }

  protected multiplier(h: WeaponHit): number {
    // Hitting the real one while its clones are out shatters the illusion.
    if (this.move === 'clones' && this.count === 1) this.shatter(true)
    return super.multiplier(h)
  }

  protected phaseChanged(phase: number): void {
    this.endClones(false)
    this.hide(false)
    this.fade(0)
    if (phase >= 3) this.cue('darkness')
  }

  protected resetMoves(): void {
    this.endClones(false)
    this.hidden = false
    this.darkness = 0
    this.dark.visible = false
  }

  protected pose(dt: number): void {
    // Eclipse darkness: phase 3 only, eased in.
    const want = this.phase >= 3 && this.mode === 'fight' ? 0.86 : 0
    this.darkness += (want - this.darkness) * Math.min(1, dt * 0.8)
    const mat = this.dark.material as THREE.MeshBasicMaterial
    mat.opacity = this.darkness
    this.dark.visible = this.darkness > 0.01
    if (this.dark.visible) {
      const p = this.ctx.player.position
      this.dark.position.set(p.x, p.y + 1, p.z)
    }
    // Eyes ride the head bone.
    const head = this.model.bone('Head')
    const show = !this.hidden && this.mode !== 'dead' && this.mode !== 'sleep'
    for (let i = 0; i < this.eyes.length; i++) {
      const e = this.eyes[i]
      e.visible = show && this.model.skin.uDissolve.value < 0.5
      if (!e.visible) continue
      if (head) head.getWorldPosition(this.v)
      else this.core(this.v, 0.8)
      const side = i === 0 ? 1 : -1
      const s = this.def.model.scale
      // In the skull's eye sockets (level with the head bone, half a metre ahead of it).
      e.position.set(this.v.x + Math.cos(this.yaw) * 0.19 * side * s + Math.sin(this.yaw) * 0.48 * s, this.v.y, this.v.z - Math.sin(this.yaw) * 0.19 * side * s + Math.cos(this.yaw) * 0.48 * s)
      e.material.opacity = 0.75 + 0.25 * Math.sin(this.ctx.clock.t * 5 + i)
    }
    // Clones: same animation, flickering.
    for (const c of this.clones) {
      if (!c.on) continue
      c.model.puppet.update(dt)
      c.model.root.position.set(c.pos.x, this.arena.y + this.def.hover + Math.sin(this.ctx.clock.t * 1.7 + c.a) * 0.18, c.pos.z)
      c.model.skin.uDissolve.value = 0.12 + 0.1 * Math.sin(this.ctx.clock.t * 11 + c.a * 3)
    }
    if (this.mode === 'dying') this.endClones(false)
  }

  /* ── moves ───────────────────────────────────────────────── */

  private done(): void {
    this.hide(false)
    this.fade(0)
    this.setAct('idle', -TUNE[this.phase - 1].gap)
  }

  private fade(u: number): void {
    this.model.skin.uDissolve.value = Math.max(0, Math.min(1, u))
  }

  /** Untouchable and invisible (between a vanish and a return). */
  private hide(on: boolean): void {
    this.hidden = on
    this.root.visible = !on
    if (this.collider) this.collider.enabled = !on
  }

  private rake(x: number, z: number): void {
    const y = this.arena.y
    this.ctx.fx.burst('hit', { x, y: y + 1, z }, { color: '#b26bff', scale: 2 })
    this.ctx.fx.burst('stomp', { x, y: y + 0.1, z }, { color: '#9b5cff', scale: 1.4 })
    this.ctx.game.shake(0.3, 0.2)
    if (this.playerIn(x, z, RAKE_R, 1.8)) this.hurtPlayer(1, { x: this.pos.x, y, z: this.pos.z })
  }

  private stepClones(dt: number, t: number): void {
    const p = this.ctx.player.position
    const tune = TUNE[this.phase - 1]
    if (t < FADE) {
      this.fade(t / FADE)
      return
    }
    if (this.count === 0) {
      // Reappear as three, a third of a circle apart around the player.
      this.count = 1
      this.cue('clone')
      this.orbitA = this.rng.range(0, Math.PI * 2)
      for (let i = 0; i < tune.clones; i++) {
        const c = this.clones[i]
        c.on = true
        c.a = this.orbitA + ((i + 1) * Math.PI * 2) / 3
        c.shotT = 0.5 + i * 0.35
        c.model.root.visible = true
        c.model.puppet.play('fly', { fade: 0 })
        c.untarget = this.ctx.enemies.addTarget({
          takeHit: h => this.hitClone(c, h.center, h.radius),
          aimPoint: out => {
            if (!c.on) return false
            out.copy(c.pos)
            out.y = this.arena.y + 1.5
            return true
          },
        })
      }
      this.fade(0)
    }
    if (this.count !== 1) {
      if (t > 1.2 + FADE) this.done()
      return
    }
    // All three circle the player; each throws needles in turn.
    this.orbitA += dt * 0.6
    const r = 7
    this.v.set(p.x + Math.sin(this.orbitA) * r, 0, p.z + Math.cos(this.orbitA) * r)
    this.inArena(this.v, 2)
    this.pos.x = this.v.x
    this.pos.z = this.v.z
    this.yaw = Math.atan2(p.x - this.pos.x, p.z - this.pos.z)
    this.shotT -= dt
    if (this.shotT <= 0) {
      this.shotT = 1.15
      this.core(this.v, 0.55)
      this.fanAt('needle', this.v, 3, 0.4)
    }
    for (const c of this.clones) {
      if (!c.on) continue
      c.a += dt * 0.6
      c.pos.set(p.x + Math.sin(c.a) * r, this.arena.y, p.z + Math.cos(c.a) * r)
      this.inArena(c.pos, 2)
      c.model.root.rotation.y = Math.atan2(p.x - c.pos.x, p.z - c.pos.z)
      c.shotT -= dt
      if (c.shotT <= 0) {
        c.shotT = 1.15
        this.v.set(c.pos.x, this.arena.y + this.def.hover + this.def.height * 0.55, c.pos.z)
        this.fanAt('shade', this.v, 3, 0.45)
      }
    }
    if (t > FADE + 4.6) this.shatter(false)
  }

  /** A clone takes one touch and bursts. */
  private hitClone(c: Clone, at: THREE.Vector3 | { x: number; y: number; z: number }, r: number): boolean {
    if (!c.on) return false
    const dx = at.x - c.pos.x
    const dz = at.z - c.pos.z
    const reach = this.def.radius + r
    if (dx * dx + dz * dz > reach * reach) return false
    this.popClone(c)
    return true
  }

  private popClone(c: Clone): void {
    c.on = false
    c.model.root.visible = false
    c.untarget?.()
    c.untarget = null
    this.ctx.fx.burst('poof', { x: c.pos.x, y: this.arena.y + 1.5, z: c.pos.z }, { color: '#6a3aa8', scale: 1.6 })
  }

  /** The illusion ends: clones burst; struck for real, it reels. */
  private shatter(struck: boolean): void {
    if (this.move !== 'clones' || this.count !== 1) return
    this.count = 2
    this.endClones(true)
    if (struck) {
      this.stun(2.2)
      this.play('hit', { once: true, speed: 0.6 })
      this.cue('guardBreak')
    }
    this.setAct('clones', FADE + 0.2)
  }

  private endClones(burst: boolean): void {
    for (const c of this.clones) {
      if (!c.on) continue
      if (burst) this.popClone(c)
      else {
        c.on = false
        c.model.root.visible = false
        c.untarget?.()
        c.untarget = null
      }
    }
  }

  private colorOf(): THREE.Color {
    return this.tint.set(this.def.color)
  }

  private cue(c: 'teleport' | 'volley' | 'windup' | 'charge' | 'clone' | 'darkness' | 'guardBreak'): void {
    this.ctx.bus.emit('enemy:cue', { pos: { x: this.pos.x, y: this.pos.y + 2, z: this.pos.z }, cue: c, kind: this.kind })
  }
}
