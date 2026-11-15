/**
 * The Enemy Factory's bosses build on Boss (health, phases, weapon hits, stomps, vulnerable
 * windows, the HUD bar, resets and the defeat hand-off) and add what the four of them share:
 *
 *   model       a dressed glTF model (or its procedural stand-in) with its puppet
 *   aura        a dynamic fresnel-flame shell over the body, coloured per phase, flaring on
 *               wind-ups and flickering gold while the boss is open to hits
 *   sigil       a rune circle under it on the floor
 *   timeline    a deterministic attack cycle per phase driven by a seeded random stream: the
 *               whole fight state is small serialisable data (see snapshot()), so a co-op host
 *               could broadcast it
 *   helpers     projectile patterns, telegraphs (Hazards), beams, contact damage, hover
 *
 * Each boss implements choose(), which starts the next act, and step(), which runs it.
 */
import * as THREE from 'three'
import type { FactoryBossKind, V3, WeaponId } from '../../events'
import type { Beams } from '../../gameplay/enemies/Beams'
import { BOSSES, type AnimName, type BossDef, type ShotId } from '../../gameplay/enemies/defs'
import { auraMaterial, sigilMaterial, type AuraUniforms } from '../../gameplay/enemies/materials'
import type { EnemyModel, ModelLib, PlayOpts } from '../../gameplay/enemies/models'
import type { Projectiles } from '../../gameplay/enemies/Projectiles'
import { SeededRandom } from '../../gameplay/enemies/rng'
import type { Ctx, LiveEnemy, WeaponHit } from '../../types'
import { Boss, type Arena } from './Boss'
import type { Hazards } from './hazards'

export interface BossKit {
  lib: ModelLib
  projectiles: Projectiles
  beams: Beams
}

/** Everything needed to replay a boss's fight from this moment (co-op hosts broadcast this). */
export interface BossSnapshot {
  kind: FactoryBossKind
  seed: number
  rng: number
  phase: number
  hp: number
  act: string
  actT: number
  cycle: number
  x: number
  y: number
  z: number
  yaw: number
}

const ENTRANCE = 1.6

export abstract class ScriptedBoss extends Boss implements LiveEnemy {
  readonly boss = true
  readonly id: FactoryBossKind
  readonly title: string
  readonly def: BossDef
  readonly model: EnemyModel
  /** Feet position (LiveEnemy). */
  readonly position: THREE.Vector3
  protected readonly rng: SeededRandom
  protected readonly projectiles: Projectiles
  protected readonly beams: Beams
  /** The current act and seconds into it. */
  protected act = 'idle'
  protected actT = 0
  /** Index into the phase's attack cycle. */
  protected cycle = 0
  /** Height of the feet above the floor (hover, leaps). */
  protected lift = 0
  /** Extra aura flare (wind-ups), eased back to 0. */
  protected flare = 0
  private readonly aura: THREE.Mesh[] = []
  private readonly auraU: AuraUniforms
  private readonly sigil: THREE.Mesh
  private readonly owned: Array<{ dispose(): void }> = []
  private entranceT = -1
  private readonly startSeed: number
  private contactCd = 0
  private readonly hit: V3 = { x: 0, y: 0, z: 0 }

  /** Call reset() once constructed (subclass fields must exist first). */
  constructor(ctx: Ctx, hazards: Hazards, arena: Arena, kit: BossKit, readonly kind: FactoryBossKind, readonly uid: number, seed: number) {
    const def = BOSSES[kind] as BossDef
    super(ctx, hazards, arena, def.hp, def.phases)
    this.id = kind
    this.title = def.title
    this.def = def
    this.position = this.pos
    this.rng = new SeededRandom(seed)
    this.startSeed = seed
    this.projectiles = kit.projectiles
    this.beams = kit.beams
    this.model = kit.lib.create(def.model, def.aura[0][1])
    this.root.add(this.model.root)
    // Aura: an inflated additive copy of every body mesh, sharing its skeleton.
    this.auraU = this.buildAura()
    this.sigil = new THREE.Mesh(this.own(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)), this.own(sigilMaterial(def.color, 0.35)))
    this.sigil.renderOrder = 3
    this.sigil.scale.setScalar(def.radius * 3.4)
    ctx.scene.add(this.sigil)
    this.home.set(arena.x, arena.y, arena.z)
    this.collider = ctx.collision.addCylinder({
      x: arena.x, y: arena.y, z: arena.z, r: def.radius * 0.8, h: def.height * 0.85,
      dynamic: true, surface: 'stone', tag: 'boss', onLand: impact => this.stomped(impact),
    })
    this.attach()
  }

  /* ── LiveEnemy ───────────────────────────────────────────── */

  get alive(): boolean {
    return this.mode !== 'dying' && this.mode !== 'dead'
  }

  /** Still in the scene (not yet disposed). */
  get inScene(): boolean {
    return this.root.parent !== null
  }

  despawn(): void {
    this.dispose()
  }

  /** Direct damage (dev hook, scripted events): ignores the phase shield. */
  // LiveEnemy.damage(amount) — the Boss base's damage(amount, at, weapon) handles both shapes.
  override damage(amount: number, at?: V3, weapon: WeaponId = 'fists'): void {
    const p = at ?? { x: this.pos.x, y: this.pos.y + this.def.height * 0.6, z: this.pos.z }
    super.damage(amount, p, weapon)
  }

  /** Fight state for a co-op host. */
  snapshot(): BossSnapshot {
    return {
      kind: this.kind, seed: this.startSeed, rng: this.rng.state, phase: this.phase, hp: this.hp,
      act: this.act, actT: this.actT, cycle: this.cycle, x: this.pos.x, y: this.pos.y, z: this.pos.z, yaw: this.yaw,
    }
  }

  /** The materialise-in entrance (the factory calls this once the model is ready). */
  enter(): void {
    this.entranceT = 0
    this.model.skin.uDissolve.value = 1
    this.wake()
  }

  override dispose(): void {
    super.dispose()
    this.sigil.removeFromParent()
    for (const m of this.aura) m.removeFromParent()
    this.model.dispose()
    for (const o of this.owned) o.dispose()
    this.owned.length = 0
  }

  /* ── Boss hooks ──────────────────────────────────────────── */

  protected onReset(): void {
    this.act = 'idle'
    this.actT = 0
    this.cycle = 0
    this.lift = this.def.hover
    this.flare = 0
    this.rng.state = this.startSeed
    this.projectiles.clear()
    this.model.skin.uDissolve.value = 0
    this.model.root.scale.setScalar(1)
    this.play('idle', { fade: 0 })
    this.resetMoves?.()
  }

  protected onWake(): void {
    this.play('taunt', { once: true })
    this.roar()
  }

  protected onBegin(): void {
    this.setAct('idle', -0.5)
  }

  protected onPhase(phase: number): void {
    this.projectiles.clear()
    this.cycle = 0
    this.flare = 1.5
    this.setAct('roar')
    this.play('taunt', { once: true })
    this.phaseChanged?.(phase)
  }

  protected onDefeat(): void {
    this.projectiles.clear()
    this.play('death', { once: true, fade: 0.1 })
    this.flare = 2
  }

  protected dying(dt: number, t: number): void {
    this.lift = Math.max(0, this.lift - dt * 2)
    if (t > 0.9) this.model.skin.uDissolve.value = Math.min(1.05, (t - 0.9) / 0.9)
  }

  protected stompDamage(): number {
    return 35
  }

  protected touches(c: V3, r: number): boolean {
    const dx = c.x - this.pos.x
    const dz = c.z - this.pos.z
    const reach = this.def.radius + r
    const bottom = this.pos.y + this.liftNow()
    return dx * dx + dz * dz < reach * reach && c.y > bottom - r && c.y < bottom + this.def.height + r
  }

  /** Arrows bite a little less than blades and hammers (they're safe from range). */
  protected multiplier(h: WeaponHit): number {
    return h.weapon === 'bow' ? 0.85 : 1
  }

  protected fight(dt: number): void {
    this.actT += dt
    this.contactCd = Math.max(0, this.contactCd - dt)
    if (this.act === 'roar') {
      if (this.actT > 1.5) this.setAct('idle')
      return
    }
    if (this.act === 'idle') {
      this.idle(dt)
      if (this.actT > 0 && this.playerReady()) {
        this.choose()
      }
      return
    }
    this.step(dt)
  }

  protected place(dt: number): void {
    const t = this.ctx.clock.t
    // Entrance: rise out of the sigil, burning in.
    if (this.entranceT >= 0) {
      this.entranceT += dt
      const u = Math.min(1, this.entranceT / ENTRANCE)
      this.model.skin.uDissolve.value = 1 - u
      this.model.root.scale.setScalar(0.65 + 0.35 * (1 - (1 - u) ** 3))
      if (u >= 1) this.entranceT = -1
    }
    const hoverBob = this.def.hover > 0 && this.mode !== 'dying' ? Math.sin(t * 1.7) * 0.18 : 0
    this.root.position.set(this.pos.x, this.pos.y + this.liftNow() + hoverBob, this.pos.z)
    this.root.rotation.y = this.yaw
    this.model.puppet.update(dt)
    this.pose?.(dt)
    // Shading: hurt flash, gold flicker while vulnerable, white while the phase shield is up.
    const sk = this.model.skin
    sk.uFlash.value = this.flash
    const tint = sk.uTint.value
    if (this.vulnerable) tint.set(1, 0.8, 0.35, 0.18 + 0.14 * Math.sin(t * 16))
    else if (this.shieldT > 0) tint.set(0.9, 0.95, 1, 0.35)
    else tint.w = Math.max(0, tint.w - dt * 3)
    // Aura: phase colours; wind-ups flare it; vulnerable windows make it stutter.
    this.flare = Math.max(0, this.flare - dt * 1.6)
    const colors = this.def.aura[Math.min(this.def.aura.length - 1, this.phase - 1)]
    const u = this.auraU
    u.uA.value.set(colors[0])
    u.uB.value.set(colors[1])
    u.uTime.value = t
    const base = this.mode === 'sleep' ? 0.25 : this.mode === 'dying' ? 1.4 : 0.5 + (this.phase - 1) * 0.22
    const strength = this.def.auraStrength ?? 1
    u.uIntensity.value = (base + this.flare) * strength * (this.vulnerable ? 0.55 + 0.45 * Math.abs(Math.sin(t * 9)) : 1) * (1 - sk.uDissolve.value)
    u.uFlow.value = 0.45 + this.phase * 0.2 + this.flare * 0.3
    // Sigil under the boss.
    const sm = this.sigil.material as THREE.ShaderMaterial
    sm.uniforms.uTime.value = t
    sm.uniforms.uAlpha.value = this.mode === 'dead' ? 0 : this.mode === 'sleep' ? 0.3 : 0.65 + this.flare * 0.2
    this.sigil.position.set(this.pos.x, this.arena.y + 0.05, this.pos.z)
    this.sigil.visible = this.mode !== 'dead'
    for (const m of this.aura) m.visible = this.mode !== 'dead' && this.ctx.quality.level !== 'low'
    this.model.setShadows(this.ctx.quality.shadows && this.mode !== 'dying')
    if (this.collider) this.ctx.collision.move(this.collider, this.pos.x, this.pos.y + this.liftNow(), this.pos.z, 0, Math.max(dt, 1e-3))
  }

  /* ── for the four bosses ─────────────────────────────────── */

  /** Pick and start the next act (setAct + telegraphs). */
  protected abstract choose(): void
  /** Run the current act; return to 'idle' when it ends. */
  protected abstract step(dt: number): void
  /** Between acts (drift, face the player). */
  protected abstract idle(dt: number): void
  /** Per-frame pose tweaks after the animation (bone scaling, procedural parts). */
  protected pose?(dt: number): void
  /** A new phase began (after the roar). */
  protected phaseChanged?(phase: number): void
  /** Reset per-move state (clones, darkness). */
  protected resetMoves?(): void

  protected setAct(name: string, t = 0): void {
    this.act = name
    this.actT = t
  }

  /** The next attack from this phase's cycle. */
  protected next<T extends string>(cycles: readonly (readonly T[])[]): T {
    const list = cycles[Math.min(cycles.length - 1, this.phase - 1)]
    return list[this.cycle++ % list.length]
  }

  protected play(name: AnimName, o: PlayOpts = {}): void {
    this.model.puppet.play(name, { fade: 0.2, ...o })
  }

  protected own<T extends { dispose(): void }>(o: T): T {
    this.owned.push(o)
    return o
  }

  /** Height of the feet above the floor right now. */
  protected liftNow(): number {
    return this.lift
  }

  /** Chest-height point of the boss. */
  protected core(out: THREE.Vector3, up = 0.55): THREE.Vector3 {
    return out.set(this.pos.x, this.pos.y + this.liftNow() + this.def.height * up, this.pos.z)
  }

  /** Floor height of the arena (shots die below it). */
  protected get floor(): number {
    return this.arena.y - 0.1
  }

  /** Horizontal distance to the player. */
  protected playerDist(): number {
    const p = this.ctx.player.position
    return Math.hypot(p.x - this.pos.x, p.z - this.pos.z)
  }

  /** Heading to the player. */
  protected playerYaw(): number {
    const p = this.ctx.player.position
    return Math.atan2(p.x - this.pos.x, p.z - this.pos.z)
  }

  /** Glide toward (x, z) at `speed`, staying inside the arena. */
  protected glide(x: number, z: number, speed: number, dt: number, stop = 0.5): void {
    const dx = x - this.pos.x
    const dz = z - this.pos.z
    const d = Math.hypot(dx, dz)
    if (d <= stop) return
    const s = Math.min(speed * dt, d - stop)
    this.pos.x += (dx / d) * s
    this.pos.z += (dz / d) * s
    this.clampToArena(this.pos, this.def.radius + 0.5)
  }

  /** Hurt the player (blinking, dashing and Creative are immune). */
  protected hurtPlayer(n: number, from: V3 = this.pos): boolean {
    const pl = this.ctx.player
    if (pl.invulnerable || pl.hp <= 0 || !pl.controlEnabled || pl.state === 'dash') return false
    pl.hurt(n, from)
    return true
  }

  /** Touching the body hurts (charges, spins), at most once a second. */
  protected contact(n: number, extra = 0.4): void {
    if (this.contactCd > 0) return
    const p = this.ctx.player.position
    const bottom = this.pos.y + this.liftNow()
    if (this.playerDist() < this.def.radius + extra + 0.35 && p.y < bottom + this.def.height && p.y + 1.6 > bottom) {
      this.hit.x = this.pos.x
      this.hit.y = this.pos.y + 1
      this.hit.z = this.pos.z
      if (this.hurtPlayer(n, this.hit)) this.contactCd = 1
    }
  }

  /** A fan of shots from `o` toward the player's chest (aimed in pitch too). */
  protected fanAt(id: ShotId, o: V3, count: number, spread: number, speed?: number): void {
    const pl = this.ctx.player
    const tx = pl.position.x - o.x
    const tz = pl.position.z - o.z
    const ty = pl.position.y + pl.height * 0.55 - o.y
    const yaw = Math.atan2(tx, tz)
    const pitch = Math.atan2(ty, Math.max(0.5, Math.hypot(tx, tz)))
    this.projectiles.fan(id, o.x, o.y, o.z, yaw, count, spread, pitch, speed, this.floor)
  }

  /** Is the player within `r` of (x, z) on the floor (and not jumping clear)? */
  protected playerIn(x: number, z: number, r: number, clear = 1.4): boolean {
    const p = this.ctx.player.position
    return Math.hypot(p.x - x, p.z - z) < r + this.ctx.player.radius && p.y - this.arena.y < clear && p.y - this.arena.y > -1.5
  }

  /** A point inside the arena near (x, z). */
  protected inArena(v: THREE.Vector3, margin = 1.5): THREE.Vector3 {
    return this.clampToArena(v, margin)
  }

  /* ── internals ───────────────────────────────────────────── */

  private buildAura(): AuraUniforms {
    const colors = this.def.aura[0]
    const mat = this.own(auraMaterial(this.ctx.textures.get('noise'), colors[0], colors[1], 0.06 / this.def.model.scale))
    mat.uniforms.uThick.value = 0.055 * Math.max(1, this.def.height / 4)
    // A rim, not a coat: only the silhouette burns.
    mat.uniforms.uPower.value = 3
    for (const mesh of this.model.meshes) {
      let shell: THREE.Mesh
      const sk = mesh as THREE.SkinnedMesh
      if (sk.isSkinnedMesh) {
        const s = new THREE.SkinnedMesh(sk.geometry, mat)
        s.bind(sk.skeleton, sk.bindMatrix)
        s.bindMode = sk.bindMode
        shell = s
      } else {
        shell = new THREE.Mesh(mesh.geometry, mat)
      }
      shell.name = `${mesh.name}-aura`
      shell.castShadow = shell.receiveShadow = false
      shell.renderOrder = 4
      shell.frustumCulled = false
      // Same parent and transform as the body part, so it follows every bone.
      shell.position.copy(mesh.position)
      shell.quaternion.copy(mesh.quaternion)
      shell.scale.copy(mesh.scale)
      mesh.parent?.add(shell)
      this.aura.push(shell)
    }
    return mat.uniforms
  }
}

export { ENTRANCE as BOSS_ENTRANCE }
