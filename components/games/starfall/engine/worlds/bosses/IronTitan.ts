/**
 * The Iron Titan — a foundry colossus: a furnace burns in its chest, two exhaust stacks smoke on
 * its back, and its arms end in fists the size of a cart.
 *
 *   phase 1  Hammerfall: lunges and brings a fist down on a marked circle; a shockwave ring runs
 *            out from it (jump it). Rivet Spray: fans of glowing rivets from the furnace.
 *            Quake: a ring telegraph around it — the only safe place is close in.
 *            After a few attacks it vents steam and stands open (strike the furnace).
 *   phase 2  double Hammerfall; Furnace Mortar lobs molten shells onto marked circles.
 *   phase 3  white-hot: Iron Cyclone — it spins toward you spraying a rivet spiral, then
 *            overheats and vents for a long while. Quakes follow with an inner blast.
 */
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { Ctx, WeaponHit } from '../../types'
import { patchSkin } from '../../gameplay/enemies/materials'
import type { Arena } from './Boss'
import type { Hazards } from './hazards'
import { ScriptedBoss, type BossKit } from './ScriptedBoss'

type Move = 'hammer' | 'rivets' | 'quake' | 'mortar' | 'cyclone' | 'vent'

const CYCLES: readonly (readonly Move[])[] = [
  ['hammer', 'rivets', 'quake', 'hammer', 'vent'],
  ['hammer', 'mortar', 'quake', 'rivets', 'hammer', 'vent'],
  ['cyclone', 'mortar', 'hammer', 'quake', 'mortar', 'rivets'],
]

const TUNE = [
  { gap: 1.2, windup: 1.0, walk: 2.0, rivets: 7, spread: 1.0, mortars: 0, vent: 3.2 },
  { gap: 0.9, windup: 0.85, walk: 2.4, rivets: 9, spread: 1.2, mortars: 5, vent: 2.8 },
  { gap: 0.65, windup: 0.72, walk: 2.8, rivets: 11, spread: 1.4, mortars: 7, vent: 3.4 },
]

const SLAM_R = 3
const QUAKE_IN = 4.2
const QUAKE_OUT = 11

/** Bone proportions: a smaller head, massive arms, heavier legs (the source rig is a cartoon robot). */
const BONE_SCALE: ReadonlyArray<readonly [string, number, number, number]> = [
  ['Head', 0.62, 0.62, 0.62],
  ['UpperArmL', 1.3, 1.3, 1.3],
  ['UpperArmR', 1.3, 1.3, 1.3],
  ['Torso', 1.12, 1.05, 1.12],
  ['UpperLegL', 1.15, 1.05, 1.15],
  ['UpperLegR', 1.15, 1.05, 1.15],
]

export class IronTitan extends ScriptedBoss {
  private move: Move = 'hammer'
  private struck = 0
  private readonly target = new THREE.Vector3()
  private readonly v = new THREE.Vector3()
  private stepT = 0
  private spin = 0
  private shotT = 0
  private readonly bones: Array<[THREE.Object3D, number, number, number]> = []
  private readonly furnace: THREE.MeshStandardMaterial | null = null

  constructor(ctx: Ctx, hazards: Hazards, arena: Arena, kit: BossKit, uid: number, seed: number) {
    super(ctx, hazards, arena, kit, 'ironTitan', uid, seed)
    for (const [name, x, y, z] of BONE_SCALE) {
      const b = this.model.bone(name)
      if (b) this.bones.push([b, x, y, z])
    }
    if (!this.model.fallback) this.furnace = this.armour()
  }

  /* ── fight ───────────────────────────────────────────────── */

  protected choose(): void {
    this.move = this.next(CYCLES)
    this.struck = 0
    this.shotT = 0
    const tune = TUNE[this.phase - 1]
    const p = this.ctx.player.position
    switch (this.move) {
      case 'hammer':
        this.pickTarget()
        this.hazards.warn(this.target.x, this.arena.y, this.target.z, SLAM_R, tune.windup, null)
        this.play('punch', { once: true, speed: 0.75 })
        this.flare = 1
        this.cue('windup')
        break
      case 'rivets':
        this.flare = 1.2
        this.play('idle')
        this.cue('volley')
        break
      case 'quake':
        this.hazards.warn(this.pos.x, this.arena.y, this.pos.z, QUAKE_OUT, 1.3, null, { inner: QUAKE_IN })
        this.play('jump', { once: true, speed: 0.8 })
        this.flare = 1.4
        this.cue('quake')
        break
      case 'mortar': {
        const n = tune.mortars || 5
        for (let i = 0; i < n; i++) {
          const a = this.rng.range(0, Math.PI * 2)
          const r = i === 0 ? 0 : this.rng.range(1.5, 4.5)
          this.v.set(p.x + Math.cos(a) * r, this.arena.y, p.z + Math.sin(a) * r)
          this.inArena(this.v, 1.5)
          const x = this.v.x
          const z = this.v.z
          const delay = 0.3 + i * 0.22
          this.hazards.after(delay, () => this.lobShell(x, z))
        }
        this.play('punch', { once: true, speed: 0.6 })
        this.flare = 1
        this.cue('volley')
        break
      }
      case 'cyclone':
        this.spin = this.yaw
        this.play('run', { speed: 1.4 })
        this.flare = 1.6
        this.cue('charge')
        break
      case 'vent':
        this.stun(tune.vent)
        this.play('idle', { speed: 0.35 })
        this.cue('vent')
        break
    }
    this.setAct(this.move)
  }

  protected step(dt: number): void {
    const tune = TUNE[this.phase - 1]
    const t = this.actT
    switch (this.move) {
      case 'hammer': {
        // Lunge toward the mark, stop short and bring the fist down on it.
        const strikes = this.phase >= 2 ? 2 : 1
        const strikeAt = (k: number) => tune.windup + k * 0.9
        if (this.struck < strikes && t < strikeAt(this.struck)) {
          this.glide(this.target.x, this.target.z, 4.2, dt, 2.6)
          this.turnToward(this.target.x, this.target.z, 5, dt)
        }
        if (this.struck < strikes && t >= strikeAt(this.struck)) {
          this.slam(this.target.x, this.target.z)
          this.struck++
          if (this.struck < strikes) {
            this.pickTarget()
            this.hazards.warn(this.target.x, this.arena.y, this.target.z, SLAM_R, 0.85, null)
            this.play('punch', { once: true, speed: 0.85, restart: true })
          }
        }
        if (t >= strikeAt(strikes - 1) + 0.9) this.done()
        break
      }
      case 'rivets': {
        this.turnToward(this.ctx.player.position.x, this.ctx.player.position.z, 1.4, dt)
        const waves = 3
        if (t > 0.6 && this.struck < waves && t >= 0.6 + this.struck * 0.5) {
          this.struck++
          this.core(this.v, 0.45)
          this.v.x += Math.sin(this.yaw) * 0.9
          this.v.z += Math.cos(this.yaw) * 0.9
          this.fanAt('rivet', this.v, tune.rivets, tune.spread)
          this.ctx.fx.burst('hit', this.v, { color: '#ffb35a', scale: 1 })
        }
        if (t > 0.6 + waves * 0.5 + 0.5) this.done()
        break
      }
      case 'quake':
        if (this.struck === 0 && t >= 1.3) {
          this.struck = 1
          this.quake(QUAKE_IN, QUAKE_OUT)
          if (this.phase >= 3) this.hazards.warn(this.pos.x, this.arena.y, this.pos.z, QUAKE_IN, 0.9, null)
        }
        if (this.phase >= 3 && this.struck === 1 && t >= 2.2) {
          this.struck = 2
          this.quake(0, QUAKE_IN)
        }
        if (t >= (this.phase >= 3 ? 3.2 : 2.4)) this.done()
        break
      case 'mortar':
        this.turnToward(this.ctx.player.position.x, this.ctx.player.position.z, 1.4, dt)
        if (t >= 0.3 + (tune.mortars || 5) * 0.22 + 1.7) this.done()
        break
      case 'cyclone': {
        const p = this.ctx.player.position
        this.spin += dt * 9
        this.yaw = this.spin
        this.glide(p.x, p.z, 3.2, dt, 0.5)
        this.contact(1, 1.3)
        this.shotT -= dt
        if (t > 0.5 && this.shotT <= 0) {
          this.shotT = 0.1
          this.core(this.v, 0.42)
          this.projectiles.ring('rivet', this.v.x, this.v.y, this.v.z, 2, this.spin, 0, 8.5, this.floor)
        }
        if (Math.random() < dt * 10) this.ctx.fx.burst('dust', { x: this.pos.x, y: this.arena.y + 0.1, z: this.pos.z }, { scale: 1.8, count: 3 })
        if (t >= 4.4) {
          // Overheated: it vents for a long while.
          this.move = 'vent'
          this.stun(tune.vent)
          this.play('idle', { speed: 0.35 })
          this.cue('vent')
          this.setAct('vent')
        }
        break
      }
      case 'vent':
        if (Math.random() < dt * 9) {
          // Steam from the stacks and the furnace.
          this.core(this.v, 0.75)
          this.v.x -= Math.sin(this.yaw) * 1.1
          this.v.z -= Math.cos(this.yaw) * 1.1
          this.ctx.fx.burst('dust', this.v, { scale: 1.6, count: 3, color: '#f2efe8' })
        }
        if (!this.vulnerable) this.done()
        break
    }
  }

  protected idle(dt: number): void {
    const p = this.ctx.player.position
    const d = this.playerDist()
    this.turnToward(p.x, p.z, 1.6, dt)
    const tune = TUNE[this.phase - 1]
    if (d > 6.5) {
      this.glide(p.x, p.z, tune.walk, dt, 6)
      this.play('walk', { speed: 0.8 + this.phase * 0.1 })
      this.stepT -= dt
      if (this.stepT <= 0) {
        this.stepT = 0.62
        this.ctx.fx.burst('dust', { x: this.pos.x, y: this.arena.y + 0.05, z: this.pos.z }, { scale: 1.4, count: 4 })
        this.ctx.game.shake(0.06, 0.12)
      }
    } else this.play('idle')
  }

  protected multiplier(h: WeaponHit): number {
    // The open furnace takes extra punishment while it vents.
    const base = super.multiplier(h)
    if (!this.vulnerable) return base
    this.core(this.v, 0.5)
    return h.center.y > this.v.y - 1.2 ? base * 1.25 : base
  }

  protected phaseChanged(): void {
    if (this.furnace) this.furnace.emissiveIntensity = 3 + this.phase * 1.4
  }

  protected resetMoves(): void {
    this.spin = 0
    this.struck = 0
    if (this.furnace) this.furnace.emissiveIntensity = 3
  }

  protected pose(): void {
    for (const [b, x, y, z] of this.bones) b.scale.set(x, y, z)
    if (this.furnace) {
      const t = this.ctx.clock.t
      const vent = this.vulnerable ? 2.2 : 0
      this.furnace.emissiveIntensity = 3 + this.phase * 1.2 + vent + Math.sin(t * 7) * 0.4 + this.flare * 1.5
    }
  }

  /* ── moves ───────────────────────────────────────────────── */

  private done(): void {
    this.setAct('idle', -TUNE[this.phase - 1].gap)
  }

  private pickTarget(): void {
    const p = this.ctx.player.position
    const v = this.ctx.player.velocity
    this.target.set(p.x + v.x * 0.25, this.arena.y, p.z + v.z * 0.25)
    // Within a lunge of the Titan.
    const dx = this.target.x - this.pos.x
    const dz = this.target.z - this.pos.z
    const d = Math.hypot(dx, dz)
    if (d > 7.5) {
      this.target.x = this.pos.x + (dx / d) * 7.5
      this.target.z = this.pos.z + (dz / d) * 7.5
    }
    this.inArena(this.target, SLAM_R * 0.6)
  }

  private slam(x: number, z: number): void {
    const y = this.arena.y
    const ctx = this.ctx
    ctx.bus.emit('boss:slam', { pos: { x, y, z }, boss: this.id })
    ctx.fx.burst('land', { x, y, z }, { scale: 3.2, color: '#7a6a5a' })
    ctx.fx.burst('stomp', { x, y: y + 0.2, z }, { scale: 2.2, color: '#ffb35a' })
    ctx.fx.burst('debris', { x, y: y + 0.2, z }, { scale: 1.8, color: '#8a7a6a' })
    ctx.game.shake(0.65, 0.35)
    this.hazards.ring(x, y, z, { speed: this.phase >= 3 ? 11 : 9.5, maxR: this.arena.r + 3, height: 0.7 })
    if (this.playerIn(x, z, SLAM_R, 2)) this.hurtPlayer(1, { x, y, z })
  }

  private quake(inner: number, outer: number): void {
    const ctx = this.ctx
    const y = this.arena.y
    ctx.bus.emit('boss:slam', { pos: { x: this.pos.x, y, z: this.pos.z }, boss: this.id })
    ctx.game.shake(0.75, 0.5)
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + this.rng.range(0, 0.4)
      const r = inner + (outer - inner) * this.rng.range(0.25, 0.9)
      const at = { x: this.pos.x + Math.cos(a) * r, y: y + 0.1, z: this.pos.z + Math.sin(a) * r }
      ctx.fx.burst('debris', at, { scale: 1.4, color: '#8a7a6a' })
      if (i % 2 === 0) ctx.fx.burst('land', at, { scale: 1.6, color: '#7a6a5a' })
    }
    const p = this.ctx.player.position
    const d = Math.hypot(p.x - this.pos.x, p.z - this.pos.z)
    if (d >= inner - 0.2 && d <= outer + 0.3 && p.y - y < 1.0) this.hurtPlayer(1, { x: this.pos.x, y, z: this.pos.z })
  }

  private lobShell(x: number, z: number): void {
    const y = this.arena.y
    this.core(this.v, 0.8)
    this.v.x -= Math.sin(this.yaw) * 0.9
    this.v.z -= Math.cos(this.yaw) * 0.9
    this.hazards.warn(x, y, z, 1.9, 1.35, null)
    this.projectiles.lob('mortar', this.v.x, this.v.y, this.v.z, x, y, z, 1.35, 1.9)
    this.ctx.fx.burst('dust', this.v, { scale: 1.2, count: 3, color: '#3a332e' })
  }

  private cue(c: 'windup' | 'volley' | 'quake' | 'charge' | 'vent'): void {
    this.ctx.bus.emit('enemy:cue', { pos: { x: this.pos.x, y: this.pos.y + 4, z: this.pos.z }, cue: c, kind: this.kind })
  }

  /**
   * Re-armour the rig: pauldrons, a chest furnace and exhaust stacks, placed in the model's own
   * space at its rest pose and re-parented to the bones they ride on. Returns the furnace glow.
   */
  private armour(): THREE.MeshStandardMaterial | null {
    const body = this.model.body
    const skin = this.model.skin
    const iron = this.own(patchSkin(new THREE.MeshStandardMaterial({ color: 0x2b2f36, metalness: 0.9, roughness: 0.34 }), skin))
    const steel = this.own(patchSkin(new THREE.MeshStandardMaterial({ color: 0x8a909a, metalness: 0.95, roughness: 0.26 }), skin))
    const hot = this.own(patchSkin(new THREE.MeshStandardMaterial({ color: 0x2a1408, emissive: 0xff7a1a, emissiveIntensity: 3, roughness: 0.4 }), skin))
    const core = this.own(patchSkin(new THREE.MeshStandardMaterial({ color: 0xfff1d6, emissive: 0xffa04a, emissiveIntensity: 3, roughness: 0.2 }), skin))
    const piece = (geo: THREE.BufferGeometry, mat: THREE.Material, bone: string, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
      const m = new THREE.Mesh(this.own(geo), mat)
      m.position.set(x, y, z)
      m.rotation.set(rx, ry, rz)
      m.castShadow = true
      m.receiveShadow = true
      body.add(m)
      this.model.meshes.push(m)
      const b = this.model.bone(bone)
      if (b) {
        body.updateMatrixWorld(true)
        b.attach(m)
      }
      return m
    }
    for (const side of [1, -1]) {
      const bone = side === 1 ? 'ShoulderL' : 'ShoulderR'
      piece(new RoundedBoxGeometry(0.62, 0.34, 0.74, 3, 0.1), iron, bone, side * 0.68, 2.52, -0.02, 0, 0, -side * 0.38)
      piece(new RoundedBoxGeometry(0.66, 0.08, 0.78, 2, 0.03), steel, bone, side * 0.66, 2.38, -0.02, 0, 0, -side * 0.38)
      piece(new THREE.BoxGeometry(0.34, 0.04, 0.5), hot, bone, side * 0.74, 2.71, -0.02, 0, 0, -side * 0.38)
      piece(new THREE.CylinderGeometry(0.1, 0.13, 0.78, 10), iron, 'Torso', side * 0.27, 2.78, -0.42, -0.32, 0, side * 0.08)
      piece(new THREE.TorusGeometry(0.11, 0.025, 6, 12).rotateX(Math.PI / 2), hot, 'Torso', side * 0.27, 3.16, -0.55, -0.32, 0, side * 0.08)
    }
    piece(new THREE.TorusGeometry(0.27, 0.07, 8, 22), iron, 'Torso', 0, 2.12, 0.5)
    piece(new THREE.SphereGeometry(0.22, 18, 12).scale(1, 1, 0.45), core, 'Torso', 0, 2.12, 0.5)
    for (let i = -1; i <= 1; i++) piece(new THREE.BoxGeometry(0.42, 0.035, 0.05), iron, 'Torso', 0, 2.12 + i * 0.11, 0.6)
    return core
  }
}
