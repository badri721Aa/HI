/**
 * The Enemy Factory: spawns any mob or boss from its definition (defs.ts) and runs them.
 *
 *   spawn(kind, position, options) → a LiveEnemy at once. Mobs rise out of the ground; a boss
 *   gets a summoning circle (unless it is given an arena), materialises once its model is ready
 *   and fights on it. Models load during the loading screen (mobs) or in the background (bosses);
 *   a model that can't be had falls back to its procedural stand-in, silently.
 *
 *   Shared by every enemy: one projectile pool, one beam pool, one set of mob telegraphs, the
 *   HP bars, contact shadows and heart drops. One boss at a time (the HUD has one boss bar).
 *
 * Weapons reach the enemies through IEnemies.addTarget (each enemy registers itself), so swings,
 * slams and arrows need no changes; the projectile pool also registers a target so blades can
 * knock bolts out of the air.
 */
import * as THREE from 'three'
import type { EnemyKind, FactoryBossKind, V3 } from '../../events'
import type { ArenaCircle, Ctx, IEnemyFactory, LiveEnemy, SpawnOptions } from '../../types'
import { BOSS_ENTRANCE, type ScriptedBoss } from '../../worlds/bosses/ScriptedBoss'
import { Hazards } from '../../worlds/bosses/hazards'
import { BOSS_NAMES } from '../../worlds/defs'
import { createBoss } from '../../worlds/bosses/factoryBosses'
import { supportHeight } from '../parts/util'
import { SummonCircle } from './arena'
import { Beams } from './Beams'
import { BOSSES, isBossKind, MOBS, type MobDef, type MobLikeKind, type ModelId } from './defs'
import type { Mob, MobHost } from './Mob'
import { MOB_CLASSES } from './mobs'
import { ModelLib } from './models'
import { BlobShadows, Drops, HpBars } from './overlays'
import { Projectiles } from './Projectiles'
import { mixSeed } from './rng'

const MOB_MODELS: readonly ModelId[] = ['legion-rogue', 'legion-warrior', 'legion-minion', 'legion-mage', 'sentry-turret']
const BOSS_MODELS: readonly ModelId[] = ['iron-titan', 'vortex-weaver', 'plasma-overlord', 'void-stalker']
/** The loading screen waits at most this long for the mob models (they keep loading after). */
const PRELOAD_CAP = 12000
/** A boss waits at most this long for its model before using the stand-in. */
const BOSS_MODEL_WAIT = 6
const MAX_MOBS = 40
const BOSS_DONE_LINGER = 3

type Stage = 'summon' | 'enter' | 'fight' | 'wait' | 'done'

/** A boss spawn: alive from the call, its body arrives when the summoning is done. */
class BossHandle implements LiveEnemy {
  readonly boss = true
  /** The boss itself once it has arrived (co-op snapshots, tests). */
  body: ScriptedBoss | null = null
  stage: Stage = 'summon'
  t = 0
  removed = false
  readonly position = new THREE.Vector3()

  constructor(
    readonly uid: number,
    readonly kind: FactoryBossKind,
    readonly hazards: Hazards,
    readonly circle: SummonCircle | null,
    readonly arena: ArenaCircle,
    readonly opts: SpawnOptions,
    readonly seed: number,
    private readonly onDespawn: (h: BossHandle) => void,
  ) {
    this.position.set(arena.x, arena.y, arena.z)
  }

  get hp(): number {
    return this.body ? this.body.hp : BOSSES[this.kind].hp
  }

  get maxHp(): number {
    return BOSSES[this.kind].hp
  }

  get phase(): number {
    return this.body ? this.body.phase : 1
  }

  get alive(): boolean {
    return !this.removed && (!this.body || this.body.alive)
  }

  despawn(): void {
    this.onDespawn(this)
  }

  damage(amount: number): void {
    this.body?.damage(amount)
  }
}

export class EnemyFactory implements IEnemyFactory {
  private lib: ModelLib
  private loading: Promise<void>
  private _ready = false
  private projectiles: Projectiles | null = null
  private beams: Beams | null = null
  private hazards: Hazards | null = null
  private bars: HpBars | null = null
  private shadows: BlobShadows | null = null
  private drops: Drops | null = null
  private mobs: Mob[] = []
  private live: Mob[] = []
  private bosses: BossHandle[] = []
  private nextUid = 1
  private dropSeed = 0
  private unsubs: Array<() => void> = []
  private untarget: (() => void) | null = null
  private prefetchTimer: ReturnType<typeof setTimeout> | null = null
  private host: MobHost | null = null

  constructor(private ctx: Ctx) {
    this.lib = new ModelLib(Math.min(8, ctx.renderer.capabilities.getMaxAnisotropy()))
    // Download while the island builds; init() only waits for whatever is left.
    this.loading = this.lib.preload(MOB_MODELS)
  }

  get ready(): boolean {
    return this._ready
  }

  async init(): Promise<void> {
    const ctx = this.ctx
    this.projectiles = new Projectiles(ctx, 384)
    this.beams = new Beams(ctx, 24)
    this.hazards = new Hazards(ctx, { ring: '#ffcf8a', warn: '#ff4a2e' })
    this.bars = new HpBars(ctx, MAX_MOBS)
    this.shadows = new BlobShadows(ctx, MAX_MOBS)
    this.drops = new Drops(ctx)
    this.host = {
      ctx,
      projectiles: this.projectiles,
      beams: this.beams,
      hazards: this.hazards,
      mobs: () => this.live,
      deploy: (owner, x, y, z) => this.deploy(owner, x, y, z),
      drop: (x, y, z, def) => this.drop(x, y, z, def),
    }
    // Blades and slams knock enemy bolts out of the air (never counts as a hit).
    this.untarget = ctx.enemies.addTarget({
      takeHit: h => {
        this.projectiles?.parry(h.center, h.radius * 0.9)
        return false
      },
      aimPoint: () => false,
    })
    const progress = setInterval(() => ctx.progress(this.lib.settledFraction()), 200)
    let capTimer: ReturnType<typeof setTimeout> | null = null
    const cap = new Promise<void>(r => (capTimer = setTimeout(r, PRELOAD_CAP)))
    await Promise.race([this.loading, cap])
    clearInterval(progress)
    if (capTimer) clearTimeout(capTimer)
    this._ready = true
    ctx.progress(1)
    // Boss models come down in the background once the game is up.
    this.prefetchTimer = setTimeout(() => this.lib.prefetch(BOSS_MODELS), 5000)
    this.unsubs.push(
      ctx.bus.on('player:respawn', () => this.onRespawn()),
      // Whatever was called up stays behind when the player goes through a portal (a map's own
      // guards are placed again by Worlds right after this).
      ctx.bus.on('world:travel', () => {
        this.clear()
        this.drops?.clear()
      }),
    )
  }

  spawn(kind: EnemyKind, pos: V3, opts: SpawnOptions = {}): LiveEnemy | null {
    if (!this.projectiles || !this.host) return null
    if (!Number.isFinite(pos.x + pos.y + pos.z)) return null
    if (isBossKind(kind)) return this.spawnBoss(kind, pos, opts)
    let alive = 0
    for (const m of this.live) if (m.alive) alive++
    if (alive >= MAX_MOBS) return null
    const def = MOBS[kind as MobLikeKind] as MobDef
    const y = supportHeight(this.ctx, pos.x, pos.z, pos.y + 1.5, def.stats.radius * 0.6, 0.45, 'enemy')
    const model = this.lib.create(def.model, def.color)
    const Cls = MOB_CLASSES[kind as MobLikeKind]
    const m = new Cls(this.nextUid++, kind as MobLikeKind, this.host, model, { x: pos.x, y, z: pos.z }, opts)
    this.mobs.push(m)
    this.live.push(m)
    return m
  }

  list(): readonly LiveEnemy[] {
    const out: LiveEnemy[] = []
    for (const m of this.mobs) if (m.state !== 'gone') out.push(m)
    for (const b of this.bosses) if (!b.removed) out.push(b)
    return out
  }

  clear(group?: string): void {
    for (const m of this.mobs) if (group === undefined || m.group === group) m.despawn()
    this.mobs = this.mobs.filter(m => m.state !== 'gone')
    this.live = this.live.filter(m => m.state !== 'gone')
    for (const b of [...this.bosses]) if (group === undefined || b.opts.group === group) this.removeBoss(b)
    if (group === undefined) {
      this.projectiles?.clear()
      this.hazards?.clear()
      this.beams?.clear()
    }
  }

  aliveNear(p: V3, radius: number): number {
    let n = 0
    const r2 = radius * radius
    for (const m of this.live) {
      if (m.alive && (m.position.x - p.x) ** 2 + (m.position.y - p.y) ** 2 + (m.position.z - p.z) ** 2 < r2) n++
    }
    return n
  }

  update(dt: number): void {
    const ctx = this.ctx
    if (!this.projectiles) return
    const playing = ctx.game.phase === 'playing'
    const live = playing && !ctx.enemies.frozen
    if (playing) this.hazards!.update(dt)
    // Alive list for this frame (healers, blasts, separation).
    this.live.length = 0
    for (const m of this.mobs) if (m.alive) this.live.push(m)
    for (const m of this.mobs) m.update(dt, live)
    if (this.mobs.some(m => m.state === 'gone')) this.mobs = this.mobs.filter(m => m.state !== 'gone')
    for (const b of [...this.bosses]) this.updateBoss(b, dt, live)
    if (playing) this.projectiles.update(dt)
    this.beams!.flush(dt)
    this.bars!.update(dt, this.mobs)
    this.shadows!.update(this.mobs, ctx.quality.shadows)
    if (playing) this.drops!.update(dt)
  }

  dispose(): void {
    if (this.prefetchTimer) clearTimeout(this.prefetchTimer)
    for (const u of this.unsubs) u()
    this.unsubs = []
    this.untarget?.()
    this.untarget = null
    for (const m of this.mobs) m.despawn()
    this.mobs = []
    this.live = []
    for (const b of [...this.bosses]) this.removeBoss(b)
    this.projectiles?.dispose()
    this.beams?.dispose()
    this.hazards?.dispose()
    this.bars?.dispose()
    this.shadows?.dispose()
    this.drops?.dispose()
    this.projectiles = this.beams = this.hazards = this.bars = this.shadows = this.drops = null
    this.lib.dispose()
  }

  /* ── mobs ────────────────────────────────────────────────── */

  private deploy(owner: Mob, x: number, y: number, z: number): Mob | null {
    const t = this.spawn('turret', { x, y, z }, { aggressive: true, group: owner.group, yaw: owner.yaw })
    return (t as Mob | null) ?? null
  }

  private drop(x: number, y: number, z: number, def: MobDef): void {
    this.dropSeed++
    if (def.drops.motes > 0) this.ctx.fx.burst('spark', { x, y: y + 1, z }, { count: def.drops.motes, color: def.color, scale: 0.8 })
    // Hearts only matter when they can heal: a little more generous when the player is low.
    const pl = this.ctx.player
    const need = pl.hp <= 2 ? 1.5 : 1
    if (Math.random() < def.drops.heal * need) this.drops!.heart(x, y, z, this.dropSeed)
  }

  /* ── bosses ──────────────────────────────────────────────── */

  private spawnBoss(kind: FactoryBossKind, pos: V3, opts: SpawnOptions): LiveEnemy {
    const def = BOSSES[kind]
    // One boss at a time: the HUD has one boss bar.
    for (const b of [...this.bosses]) this.removeBoss(b)
    this.lib.prefetch([def.model.id])
    let circle: SummonCircle | null = null
    let arena = opts.arena
    if (!arena) {
      circle = new SummonCircle(this.ctx, pos.x, pos.y, pos.z, def.arena, def.color)
      arena = { x: pos.x, y: circle.top, z: pos.z, r: def.arena - 0.6 }
    }
    const uid = this.nextUid++
    const hazards = new Hazards(this.ctx, { ring: def.ring, warn: def.warn })
    const seed = opts.seed ?? mixSeed(uid, kind.length * 977, Math.round(pos.x * 10), Math.round(pos.z * 10))
    const h = new BossHandle(uid, kind, hazards, circle, arena, opts, seed, b => this.removeBoss(b))
    this.bosses.push(h)
    this.ctx.bus.emit('enemy:spawn', { pos: { x: arena.x, y: arena.y, z: arena.z }, kind, id: uid })
    this.ctx.bus.emit('enemy:cue', { pos: { x: arena.x, y: arena.y + 1, z: arena.z }, cue: 'spawn', kind })
    if (opts.instant) this.arrive(h)
    return h
  }

  private updateBoss(h: BossHandle, dt: number, live: boolean): void {
    const ctx = this.ctx
    h.t += dt
    h.circle?.update(dt)
    const b = h.body
    if (b) {
      if (ctx.game.phase === 'playing') h.hazards.update(dt)
      b.update(dt, live)
      h.position.copy(b.pos)
    }
    switch (h.stage) {
      case 'summon': {
        const risen = !h.circle || h.circle.ready
        const model = this.lib.settled(BOSSES[h.kind].model.id) || h.t > BOSS_MODEL_WAIT
        // Sparks spiral up from the circle while the boss gathers.
        if (Math.random() < dt * 30) {
          const a = h.t * 5 + Math.random() * 0.5
          const r = 1.2 + Math.random() * 1.5
          ctx.fx.burst('spark', { x: h.arena.x + Math.cos(a) * r, y: h.arena.y + 0.3 + Math.random() * 2.5, z: h.arena.z + Math.sin(a) * r }, { count: 1, scale: 0.6, color: BOSSES[h.kind].color })
        }
        if (risen && model && h.t > 1.2) this.arrive(h)
        break
      }
      case 'enter':
        if (h.t > BOSS_ENTRANCE + 0.7 && b) {
          b.begin()
          h.stage = 'fight'
          this.startFight(h)
        }
        break
      case 'wait':
        if (b && b.mode === 'sleep' && this.playerInArena(h)) {
          b.wake()
          h.stage = 'enter'
          h.t = BOSS_ENTRANCE - 0.6
        }
        break
      case 'fight':
        if (b && b.mode === 'dead') {
          h.stage = 'done'
          h.t = 0
        }
        break
      case 'done':
        if (h.t > BOSS_DONE_LINGER) h.circle?.sink()
        if (!h.circle || h.circle.gone) this.removeBoss(h)
        break
    }
  }

  /** The summoning is over: the boss takes shape. */
  private arrive(h: BossHandle): void {
    if (h.body) return
    const ctx = this.ctx
    const b = createBoss(h.kind, ctx, h.hazards, h.arena, { lib: this.lib, projectiles: this.projectiles!, beams: this.beams! }, h.uid, h.seed)
    b.persist = h.opts.persist ?? false
    b.reset()
    if (h.opts.yaw !== undefined) b.yaw = h.opts.yaw
    else {
      const p = ctx.player.position
      b.yaw = Math.atan2(p.x - b.pos.x, p.z - b.pos.z)
    }
    b.onDefeated = () => this.bossDefeated(h)
    h.body = b
    h.stage = 'enter'
    h.t = 0
    b.enter()
    ctx.fx.burst('beacon', { x: h.arena.x, y: h.arena.y + 1.5, z: h.arena.z }, { color: BOSSES[h.kind].color, scale: 1.2 })
    ctx.game.shake(0.5, 0.6)
  }

  private startFight(h: BossHandle): void {
    const ctx = this.ctx
    ctx.game.setMusic('boss')
    ctx.bus.emit('ui:objective', { text: `Defeat the ${BOSS_NAMES[h.kind]}` })
  }

  private bossDefeated(h: BossHandle): void {
    const ctx = this.ctx
    const def = BOSSES[h.kind]
    const b = h.body
    const x = b ? b.pos.x : h.arena.x
    const z = b ? b.pos.z : h.arena.z
    for (let i = 0; i < def.drops.hearts; i++) this.drops!.heart(x, h.arena.y, z, ++this.dropSeed)
    ctx.fx.burst('shard', { x, y: h.arena.y + 2, z }, { color: def.color, scale: 1.4 })
    ctx.game.setMusic('explore')
    ctx.bus.emit('ui:toast', { kind: 'reward', title: `${BOSS_NAMES[h.kind]} defeated!`, body: def.title })
  }

  private removeBoss(h: BossHandle): void {
    if (h.removed) return
    h.removed = true
    const fighting = h.body && (h.body.mode === 'fight' || h.body.mode === 'dying')
    h.body?.dispose()
    h.body = null
    h.hazards.dispose()
    h.circle?.dispose()
    this.projectiles?.clear()
    const i = this.bosses.indexOf(h)
    if (i >= 0) this.bosses.splice(i, 1)
    if (fighting) this.ctx.game.setMusic('explore')
  }

  private playerInArena(h: BossHandle): boolean {
    const p = this.ctx.player.position
    return Math.hypot(p.x - h.arena.x, p.z - h.arena.z) < h.arena.r && p.y > h.arena.y - 1.5
  }

  /** The player died: a boss fight starts over when he comes back into the circle. */
  private onRespawn(): void {
    for (const h of this.bosses) {
      const b = h.body
      if (!b || h.stage === 'done' || !b.alive) continue
      b.reset()
      h.hazards.clear()
      h.stage = 'wait'
      h.t = 0
    }
    this.projectiles?.clear()
  }
}
