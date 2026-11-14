/**
 * The Plasma Overlord — a floating sovereign with a burning core in its chest and horns that
 * crackle with charge.
 *
 *   phase 1  Orb Barrage: homing plasma orbs that burst into sparks when they fade.
 *            Nova: a ring of sparks rolls out low across the floor (jump it, or slip a gap).
 *            Sweep: a beam at ankle height swings across the arena (jump it as it passes).
 *            Then it overloads and slumps, open to hits.
 *   phase 2  + Plasma Rain: marked circles, then columns of plasma from the sky.
 *   phase 3  The Cross: four low beams turning together; jump each one as it comes round.
 */
import * as THREE from 'three'
import { BEAM } from '../../gameplay/enemies/Beams'
import type { Ctx } from '../../types'
import type { Arena } from './Boss'
import type { Hazards } from './hazards'
import { ScriptedBoss, type BossKit } from './ScriptedBoss'

type Move = 'orbs' | 'nova' | 'sweep' | 'rain' | 'cross' | 'overload'

const CYCLES: readonly (readonly Move[])[] = [
  ['orbs', 'nova', 'sweep', 'orbs', 'overload'],
  ['orbs', 'rain', 'sweep', 'nova', 'overload'],
  ['cross', 'orbs', 'rain', 'nova', 'overload'],
]

const TUNE = [
  { gap: 1.0, volleys: 3, sweep: 2.7, rings: 1, rain: 0, slump: 3 },
  { gap: 0.8, volleys: 3, sweep: 2.3, rings: 2, rain: 6, slump: 2.7 },
  { gap: 0.6, volleys: 4, sweep: 2.1, rings: 2, rain: 7, slump: 2.5 },
]

/** Low beams: the top edge the player must clear (m above the floor). */
const BEAM_Y = 0.55
const BEAM_TOP = 0.95
const BEAM_W = 0.9
const RAIN_R = 2.0

interface Column {
  x: number
  z: number
  t: number
}

const _a = new THREE.Vector3()
const _b = new THREE.Vector3()
const _c = new THREE.Color()

export class PlasmaOverlord extends ScriptedBoss {
  private move: Move = 'orbs'
  private count = 0
  private beamA = 0
  private beamDir = 1
  private beamLen = 20
  private readonly v = new THREE.Vector3()
  private readonly drift = new THREE.Vector3()
  private columns: Column[] = []
  private readonly beamColor = new THREE.Color('#ff7ae6')

  constructor(ctx: Ctx, hazards: Hazards, arena: Arena, kit: BossKit, uid: number, seed: number) {
    super(ctx, hazards, arena, kit, 'plasmaOverlord', uid, seed)
  }

  protected choose(): void {
    this.move = this.next(CYCLES)
    this.count = 0
    const tune = TUNE[this.phase - 1]
    switch (this.move) {
      case 'orbs':
        this.play('cast', { speed: 0.9 })
        this.flare = 0.8
        this.cue('volley')
        break
      case 'nova':
        this.hazards.warn(this.pos.x, this.arena.y, this.pos.z, 3.4, 0.9, null)
        this.play('raise', { once: true })
        this.flare = 1.4
        this.cue('beamCharge')
        break
      case 'sweep':
      case 'cross': {
        // The sweep starts beside the player and swings through him.
        this.beamDir = this.rng.sign()
        this.beamA = this.playerYaw() - this.beamDir * (this.move === 'sweep' ? 1.15 : 0.6)
        this.beamLen = this.arena.r * 1.35
        this.play('cast', { speed: 0.7 })
        this.flare = 1.6
        this.cue('beamCharge')
        break
      }
      case 'rain':
        this.play('raise', { once: true, speed: 0.8 })
        this.flare = 1.2
        this.cue('volley')
        for (let i = 0; i < tune.rain; i++) {
          const p = this.ctx.player.position
          const a = this.rng.range(0, Math.PI * 2)
          const r = i === 0 ? 0 : this.rng.range(1.8, 4.5)
          this.v.set(p.x + Math.cos(a) * r, this.arena.y, p.z + Math.sin(a) * r)
          this.inArena(this.v, 1.5)
          const x = this.v.x
          const z = this.v.z
          this.hazards.after(i * 0.26, () => this.hazards.warn(x, this.arena.y, z, RAIN_R, 1.1, () => this.strike(x, z)))
        }
        break
      case 'overload':
        this.stun(tune.slump)
        this.play('slump', { once: true, speed: 0.8 })
        this.cue('vent')
        break
    }
    this.setAct(this.move)
  }

  protected step(dt: number): void {
    const tune = TUNE[this.phase - 1]
    const t = this.actT
    const p = this.ctx.player.position
    switch (this.move) {
      case 'orbs':
        this.turnToward(p.x, p.z, 2.5, dt)
        if (this.count < tune.volleys && t >= 0.5 + this.count * 0.75) {
          this.count++
          this.core(this.v, 0.5)
          this.v.x += Math.sin(this.yaw) * 1.1
          this.v.z += Math.cos(this.yaw) * 1.1
          this.fanAt('plasma', this.v, 3, 0.65)
          this.ctx.fx.burst('hit', this.v, { color: '#ff7ae6', scale: 1.2 })
        }
        if (t >= 0.5 + tune.volleys * 0.75 + 0.6) this.done()
        break
      case 'nova': {
        const rings = tune.rings
        if (this.count < rings && t >= 0.9 + this.count * 0.75) {
          this.count++
          this.nova()
        }
        if (t >= 0.9 + rings * 0.75 + 0.6) this.done()
        break
      }
      case 'sweep':
      case 'cross': {
        const charge = 1.2
        const dur = this.move === 'sweep' ? tune.sweep : 5.4
        const span = this.move === 'sweep' ? 2.3 : 2.9
        const beams = this.move === 'sweep' ? 1 : 4
        if (t < charge) {
          // Telegraph: thin aim lines where the beams will start.
          for (let k = 0; k < beams; k++) this.drawBeam(this.beamA + (k * Math.PI) / 2, 0.08, 0.45 + (t / charge) * 1.1, BEAM.laser)
          break
        }
        if (this.count === 0) {
          this.count = 1
          this.cue('beam')
          this.ctx.game.shake(0.3, 0.3)
        }
        const u = Math.min(1, (t - charge) / dur)
        const a0 = this.beamA + this.beamDir * span * u
        for (let k = 0; k < beams; k++) {
          const a = a0 + (k * Math.PI) / 2
          this.drawBeam(a, BEAM_W, 1.4, BEAM.plasma)
          this.beamHit(a)
        }
        this.yaw = a0
        if (Math.random() < dt * 25) {
          const r = this.rng.range(2, this.beamLen)
          this.ctx.fx.burst('spark', { x: this.pos.x + Math.sin(a0) * r, y: this.arena.y + BEAM_Y, z: this.pos.z + Math.cos(a0) * r }, { count: 2, scale: 0.6, color: '#ff9af0' })
        }
        if (u >= 1) this.done()
        break
      }
      case 'rain':
        this.turnToward(p.x, p.z, 2, dt)
        if (t >= tune.rain * 0.26 + 1.6) this.done()
        break
      case 'overload':
        this.lift += (0.25 - this.lift) * Math.min(1, dt * 3)
        if (Math.random() < dt * 8) {
          this.core(this.v, 0.5)
          this.ctx.fx.burst('spark', this.v, { count: 3, scale: 0.8, color: '#7fe3ff' })
        }
        if (!this.vulnerable) this.done()
        break
    }
  }

  protected idle(dt: number): void {
    const p = this.ctx.player.position
    this.turnToward(p.x, p.z, 2.2, dt)
    // Hold a middle distance, drifting slowly sideways.
    const d = Math.max(0.5, this.playerDist())
    const ux = (this.pos.x - p.x) / d
    const uz = (this.pos.z - p.z) / d
    const side = Math.sin(this.ctx.clock.t * 0.4) > 0 ? 1 : -1
    this.drift.set(p.x + ux * 9 + -uz * side * 3, 0, p.z + uz * 9 + ux * side * 3)
    this.inArena(this.drift, this.def.radius + 2)
    this.glide(this.drift.x, this.drift.z, 2.4, dt, 0.4)
    this.lift += (this.def.hover - this.lift) * Math.min(1, dt * 2)
    this.play('idle')
  }

  protected pose(dt: number): void {
    // Rain columns burn for a moment after they strike.
    for (let i = this.columns.length - 1; i >= 0; i--) {
      const c = this.columns[i]
      c.t += dt
      if (c.t > 0.45) {
        this.columns.splice(i, 1)
        continue
      }
      _a.set(c.x, this.arena.y + 16, c.z)
      _b.set(c.x, this.arena.y, c.z)
      this.beams.draw(_a, _b, 1.6 * (1 - c.t / 0.45) + 0.3, this.beamColor, 1.6, BEAM.plasma)
    }
    if (this.mode === 'dying') this.lift = Math.max(0, this.lift - dt)
  }

  protected resetMoves(): void {
    this.columns = []
    this.count = 0
  }

  /* ── moves ───────────────────────────────────────────────── */

  private done(): void {
    this.setAct('idle', -TUNE[this.phase - 1].gap)
  }

  /** A ring of sparks rolling out low, with a few gaps. */
  private nova(): void {
    const n = 28
    const gap = this.rng.int(n)
    const y = this.arena.y + BEAM_Y + 0.05
    const phase = this.rng.range(0, Math.PI * 2)
    for (let k = 0; k < n; k++) {
      // Three neighbours left out: the gap to slip through.
      if ((k - gap + n) % n < 3) continue
      const a = phase + (k / n) * Math.PI * 2
      this.projectiles.fire('spark', this.pos.x, y, this.pos.z, Math.sin(a), 0, Math.cos(a), 7.5, this.floor)
    }
    this.ctx.fx.burst('hit', { x: this.pos.x, y: y + 0.4, z: this.pos.z }, { color: '#7fe3ff', scale: 2 })
    this.ctx.bus.emit('boss:slam', { pos: { x: this.pos.x, y: this.arena.y, z: this.pos.z }, boss: this.id })
  }

  private drawBeam(a: number, width: number, intensity: number, style: 0 | 2): void {
    this.core(_a, 0.5)
    _a.x += Math.sin(a) * 0.8
    _a.z += Math.cos(a) * 0.8
    const y = this.arena.y + BEAM_Y
    // From the core down to ankle height, then along the floor to the rim.
    _b.set(this.pos.x + Math.sin(a) * 2.2, y, this.pos.z + Math.cos(a) * 2.2)
    this.beams.draw(_a, _b, width * 0.8, _c.copy(this.beamColor), intensity, style)
    _a.set(this.pos.x + Math.sin(a) * this.beamLen, y, this.pos.z + Math.cos(a) * this.beamLen)
    this.beams.draw(_b, _a, width, _c, intensity, style)
  }

  /** The player is caught by a low beam at angle `a` unless his feet are above it. */
  private beamHit(a: number): void {
    const pl = this.ctx.player
    const p = pl.position
    const dx = p.x - this.pos.x
    const dz = p.z - this.pos.z
    const along = dx * Math.sin(a) + dz * Math.cos(a)
    if (along < 0 || along > this.beamLen) return
    const across = Math.abs(dx * Math.cos(a) - dz * Math.sin(a))
    if (across > BEAM_W * 0.5 + pl.radius) return
    if (p.y - this.arena.y > BEAM_TOP) return
    this.hurtPlayer(1, { x: p.x - Math.cos(a) * this.beamDir, y: p.y, z: p.z + Math.sin(a) * this.beamDir })
  }

  private strike(x: number, z: number): void {
    this.columns.push({ x, z, t: 0 })
    this.ctx.fx.burst('hit', { x, y: this.arena.y + 0.5, z }, { color: '#ff7ae6', scale: 1.8 })
    this.ctx.fx.burst('land', { x, y: this.arena.y, z }, { scale: 1.4, color: '#6a3a6a' })
    this.ctx.bus.emit('boss:impact', { pos: { x, y: this.arena.y, z }, kind: 'orb' })
    if (this.playerIn(x, z, RAIN_R, 2.5)) this.hurtPlayer(1, { x, y: this.arena.y, z })
  }

  private cue(c: 'volley' | 'beamCharge' | 'beam' | 'vent'): void {
    this.ctx.bus.emit('enemy:cue', { pos: { x: this.pos.x, y: this.pos.y + 3, z: this.pos.z }, cue: c, kind: this.kind })
  }
}
