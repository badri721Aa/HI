/**
 * Worlds — Starfall Isle (map 0) and the maps behind its portal arches.
 *
 *   arches    two ancient arches stand on the island (summit path, Sky Ruins). Each wakes when
 *             enough shards are found (sealed until then: a dark pane and a message) and leads
 *             to its map; a golden arch in each map leads home
 *   travel    walk in → fade to black → the map is built on its first visit (behind the fade)
 *             → the player arrives, the atmosphere switches → fade back in
 *   maps      built from ZoneKit geometry + colliders in their own regions far from the island;
 *             each has checkpoints (the entrance first), a boss arena and a reward chest
 *   bosses    the fight starts when the player walks into the arena (a short intro the first
 *             time); dying or leaving resets it; a defeated boss stays defeated (saved)
 */
import * as THREE from 'three'
import type { MapId, V3 } from '../events'
import { WeaponKit } from '../gameplay/weapons/models'
import { glowTexture } from '../gameplay/parts/util'
import type { CompassMarker } from '../store'
import type { BossIntro, Ctx, IWorlds } from '../types'
import { heightAt, PLAY_RADIUS, SEA_LEVEL } from '../world/heightfield'
import { ZoneKit } from '../world/zones/kit'
import type { Boss } from './bosses/Boss'
import { FrostGolem } from './bosses/FrostGolem'
import { GloomKing } from './bosses/GloomKing'
import { Hazards } from './bosses/hazards'
import { Chest } from './chest'
import { BOSS_IDS, BOSS_NAMES, MAPS, PORTAL_MAPS, type MapDef, type Spot } from './defs'
import { buildFrost, FROST_RADIUS } from './frost'
import { Arch } from './portal'
import { buildRift, RIFT_RADIUS, type MapBuild } from './rift'

type PortalMap = Exclude<MapId, 'isle'>

const FADE_OUT = 0.45
const FADE_IN = 0.6
/** Portals ignore the player for this long after a trip. */
const PORTAL_COOLDOWN = 1.2
const SEALED_TOAST_GAP = 5
const CHECKPOINT_RADIUS = 2.2
const HOME_COLORS: [string, string] = ['#fff1c8', '#d0862a']

const REWARD = { rift: 'starblade', frost: 'frostHammer' } as const
const HAZARD_COLORS = { rift: { ring: '#b46bff', warn: '#ff5ad1' }, frost: { ring: '#bfeaff', warn: '#6fd0ff' } }
const ARCH_HINT: Record<PortalMap, string> = {
  rift: 'The ancient arch beside the summit path hums with violet light.',
  frost: 'The arch on the meadow below the Sky Ruins glitters with frost.',
}

interface Rune {
  sprite: THREE.Sprite
  spot: Spot
}

interface Visit {
  def: MapDef
  kit: ZoneKit
  build: MapBuild
  exit: Arch
  hazards: Hazards
  boss: Boss
  chest: Chest
  runes: Rune[]
  /** Index into def.checkpoints of the furthest one reached this visit. */
  checkpoint: number
  introSeen: boolean
}

export class Worlds implements IWorlds {
  private _current: MapId = 'isle'
  private visits = new Map<PortalMap, Visit>()
  private arches = new Map<PortalMap, Arch>()
  private islandKit: ZoneKit | null = null
  private trip: { to: MapId; t: number; arrived: number } | null = null
  private cooldown = 0
  private sealedT = 0
  private announce: PortalMap[] = []
  private weaponKit: WeaponKit | null = null
  private runeDim: THREE.SpriteMaterial | null = null
  private runeLit: THREE.SpriteMaterial | null = null
  private glow: { texture: THREE.Texture; owned: boolean } | null = null
  private unsubs: Array<() => void> = []
  private readonly _bounds = { x: 0, z: 0, r: PLAY_RADIUS }
  private readonly head = new THREE.Vector3()

  constructor(private ctx: Ctx) {}

  get current(): MapId {
    return this._current
  }

  get travelling(): boolean {
    return this.trip !== null
  }

  get killY(): number {
    return this._current === 'isle' ? SEA_LEVEL - 25 : MAPS[this._current].killY
  }

  get bounds(): { x: number; z: number; r: number } {
    return this._bounds
  }

  get mapName(): string | null {
    return this._current === 'isle' ? null : MAPS[this._current].name
  }

  isUnlocked(id: MapId): boolean {
    return id === 'isle' || this.ctx.game.save.maps.includes(id)
  }

  spawnPoint(): Spot | null {
    const v = this.visit()
    return v ? v.def.checkpoints[v.checkpoint] : null
  }

  /* ── lifecycle ───────────────────────────────────────────── */

  init(): void {
    const ctx = this.ctx
    const kit = (this.islandKit = new ZoneKit(ctx, 'portals'))
    for (const def of PORTAL_MAPS) {
      const a = def.arch
      // Sit the plinth on the lowest ground under it so no corner floats.
      let y = Infinity
      for (let i = -2; i <= 2; i++) for (let j = -1; j <= 1; j++) y = Math.min(y, heightAt(a.x + i, a.z + j * 0.6))
      this.arches.set(def.id as PortalMap, new Arch(ctx, kit, { x: a.x, y, z: a.z, yaw: a.yaw }, def.swirl))
    }
    kit.finalize()
    this.glow = glowTexture(ctx)
    const rune = (opacity: number) => new THREE.SpriteMaterial({ map: this.glow!.texture, color: 0x9fe0ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity })
    this.runeDim = rune(0.25)
    this.runeLit = rune(0.9)

    const bus = ctx.bus
    this.unsubs.push(
      bus.on('collect:shard', e => this.unlockFor(e.collected, true)),
      bus.on('cutscene:end', () => this.announceUnlocks()),
      bus.on('player:respawn', () => this.restartFight()),
      bus.on('chest:open', () => {
        const v = this.visit()
        if (v) bus.emit('ui:objective', { text: this.objective(v) })
      }),
    )
    this.syncWithSave()
  }

  syncWithSave(): void {
    const ctx = this.ctx
    this.trip = null
    this.cooldown = 0
    this.announce = []
    if (this._current !== 'isle') {
      this.leave(this._current)
      this._current = 'isle'
      ctx.env.setAtmosphere('isle', 0)
    }
    this.setBounds()
    // Saves from before the portals existed: whatever the shard count already earns.
    this.unlockFor(ctx.game.shardCount(), false)
    for (const [id, arch] of this.arches) arch.setOpen(this.isUnlocked(id), true)
    for (const v of this.visits.values()) this.prepare(v)
  }

  travel(to: MapId): void {
    if (this.trip || to === this._current) return
    const ctx = this.ctx
    this.trip = { to, t: 0, arrived: -1 }
    ctx.player.controlEnabled = false
    ctx.bus.emit('portal:enter', { pos: { x: ctx.player.position.x, y: ctx.player.position.y + 1, z: ctx.player.position.z }, to })
    ctx.bus.emit('ui:prompt', null)
    ctx.bus.emit('ui:fade', { to: 1, duration: FADE_OUT })
  }

  update(dt: number): void {
    const ctx = this.ctx
    const playing = ctx.game.phase === 'playing'
    for (const a of this.arches.values()) a.update(dt)
    const v = this.visit()
    if (v) {
      const live = playing && !this.trip
      v.build.update(dt, ctx.clock.t)
      v.exit.update(dt)
      if (playing) v.hazards.update(dt)
      v.boss.update(dt, live)
      v.chest.update(dt, live)
    }
    if (this.trip) this.stepTrip(dt)
    if (!playing || this.trip || !ctx.player.controlEnabled) return
    this.cooldown = Math.max(0, this.cooldown - dt)
    this.sealedT = Math.max(0, this.sealedT - dt)
    this.checkPortals()
    if (v) {
      this.checkCheckpoints(v)
      this.checkArena(v)
    }
  }

  compass(p: V3, cameraYaw: number, out: CompassMarker[]): void {
    const save = this.ctx.game.save
    const mark = (x: number, z: number, kind: CompassMarker['kind']) => {
      const dx = x - p.x
      const dz = z - p.z
      out.push({ angle: wrap(cameraYaw - Math.atan2(dx, dz)), dist: Math.hypot(dx, dz), kind })
    }
    const v = this.visit()
    if (!v) {
      for (const [id, arch] of this.arches) {
        if (this.isUnlocked(id) && !save.bosses.includes(MAPS[id].boss)) mark(arch.x, arch.z, 'portal')
      }
      return
    }
    if (v.boss.mode !== 'dead') mark(v.boss.pos.x, v.boss.pos.z, 'boss')
    mark(v.exit.x, v.exit.z, 'portal')
  }

  bossIntro(): BossIntro | null {
    const v = this.visit()
    if (!v || v.boss.mode !== 'sleep') return null
    const boss = v.boss
    this.head.set(boss.pos.x, boss.pos.y + (v.def.id === 'rift' ? 4.2 : 4.6), boss.pos.z)
    return {
      name: boss.name,
      title: boss.title,
      focus: this.head,
      yaw: boss.yaw,
      roar: () => boss.wake(),
      begin: () => this.beginFight(v),
    }
  }

  dispose(): void {
    for (const u of this.unsubs) u()
    this.unsubs = []
    for (const id of [...this.visits.keys()]) this.disposeVisit(id)
    for (const a of this.arches.values()) a.dispose()
    this.arches.clear()
    this.islandKit?.dispose()
    this.islandKit = null
    this.weaponKit?.dispose()
    this.weaponKit = null
    this.runeDim?.dispose()
    this.runeLit?.dispose()
    if (this.glow?.owned) this.glow.texture.dispose()
    this.glow = null
  }

  /* ── travel ──────────────────────────────────────────────── */

  private stepTrip(dt: number): void {
    const trip = this.trip!
    const ctx = this.ctx
    trip.t += dt
    if (trip.arrived < 0 && trip.t >= FADE_OUT + 0.05) {
      this.arrive(trip.to)
      trip.arrived = trip.t
      ctx.bus.emit('ui:fade', { to: 0, duration: FADE_IN })
    }
    if (trip.arrived >= 0 && trip.t >= trip.arrived + FADE_IN * 0.5) {
      this.trip = null
      this.cooldown = PORTAL_COOLDOWN
      ctx.player.controlEnabled = ctx.game.phase === 'playing'
    }
  }

  private arrive(to: MapId): void {
    const ctx = this.ctx
    const from = this._current
    if (from !== 'isle') this.leave(from)
    let spot: Spot
    if (to === 'isle') {
      spot = this.arches.get(from as PortalMap)?.exitSpot() ?? ctx.checkpoints.spawnPoint(ctx.game.save.checkpoint)
    } else {
      const v = this.ensure(to)
      v.kit.root.visible = true
      v.checkpoint = 0
      this.prepare(v)
      spot = v.def.checkpoints[0]
    }
    this._current = to
    this.setBounds()
    ctx.character.cancelRagdoll()
    ctx.player.teleport(spot.x, spot.y, spot.z, spot.yaw)
    ctx.player.resetHealth()
    ctx.cameraRig.snapBehind()
    ctx.env.setAtmosphere(to, 0)
    ctx.enemies.clearMinions()
    ctx.game.setMusic('explore')
    ctx.bus.emit('world:travel', { from, to })
    if (to !== 'isle') ctx.bus.emit('ui:objective', { text: this.objective(this.visit()!) })
  }

  /** Leaving a map: its fight resets and it goes dark. */
  private leave(id: MapId): void {
    const v = this.visits.get(id as PortalMap)
    if (!v) return
    v.boss.reset()
    v.chest.hide()
    v.kit.root.visible = false
  }

  /** Builds a map on its first visit (behind the fade). */
  private ensure(id: PortalMap): Visit {
    const existing = this.visits.get(id)
    if (existing) return existing
    const ctx = this.ctx
    const def = MAPS[id]
    const kit = new ZoneKit(ctx, `map:${id}`)
    const build = id === 'rift' ? buildRift(ctx, kit, def) : buildFrost(ctx, kit, def)
    const exit = new Arch(ctx, kit, { x: def.exit.x, y: def.exit.y ?? def.center.y, z: def.exit.z, yaw: def.exit.yaw }, HOME_COLORS)
    const runes: Rune[] = def.checkpoints.slice(1).map(spot => {
      // A rune stone beside the spot; its glow brightens once reached.
      const sx = spot.x + Math.cos(spot.yaw) * 1.6
      const sz = spot.z - Math.sin(spot.yaw) * 1.6
      kit.box({ x: sx, y: spot.y - 0.1, z: sz, w: 0.55, h: 1.5, d: 0.4, yaw: spot.yaw, mat: kit.mat('stone', { color: '#a9b4c2' }), collide: { surface: 'stone' } })
      kit.box({ x: sx, y: spot.y + 0.5, z: sz, w: 0.18, h: 0.6, d: 0.42, yaw: spot.yaw, mat: kit.mat('glow', { color: '#bff0ff', emissive: '#4fc4ff', key: 'rune' }), castShadow: false })
      const sprite = kit.addObject(new THREE.Sprite(this.runeDim!))
      sprite.position.set(sx, spot.y + 1.0, sz)
      sprite.scale.setScalar(1.6)
      return { sprite, spot }
    })
    kit.finalize()
    const hazards = new Hazards(ctx, HAZARD_COLORS[id])
    const arena = { ...def.arena, r: id === 'rift' ? RIFT_RADIUS : FROST_RADIUS }
    const boss = id === 'rift' ? new GloomKing(ctx, hazards, arena, build.pillars) : new FrostGolem(ctx, hazards, arena)
    this.weaponKit ??= new WeaponKit(ctx.textures)
    const chest = new Chest(ctx, def.arena.x, def.arena.y, def.arena.z, 0, REWARD[id], this.weaponKit)
    const v: Visit = { def, kit, build, exit, hazards, boss, chest, runes, checkpoint: 0, introSeen: false }
    boss.onDefeated = () => this.bossDefeated(v)
    this.visits.set(id, v)
    try {
      ctx.renderer.compile(ctx.scene, ctx.camera)
    } catch {
      /* compiling up front only avoids a hitch */
    }
    return v
  }

  /** Boss and chest as the save says: beaten (chest open once the reward is owned) or waiting. */
  private prepare(v: Visit): void {
    const save = this.ctx.game.save
    if (save.bosses.includes(v.def.boss)) {
      v.boss.markDead()
      v.chest.show(save.weapons.includes(REWARD[v.def.id as PortalMap]))
    } else {
      if (v.boss.mode === 'dead') v.boss.mode = 'sleep'
      v.boss.reset()
      v.chest.hide()
    }
    v.hazards.clear()
    for (let i = 0; i < v.runes.length; i++) v.runes[i].sprite.material = i + 1 <= v.checkpoint ? this.runeLit! : this.runeDim!
  }

  private disposeVisit(id: PortalMap): void {
    const v = this.visits.get(id)
    if (!v) return
    v.boss.dispose()
    v.chest.dispose()
    v.hazards.dispose()
    v.exit.dispose()
    v.build.dispose()
    v.kit.dispose()
    this.visits.delete(id)
  }

  /* ── triggers ────────────────────────────────────────────── */

  private checkPortals(): void {
    if (this.cooldown > 0) return
    const p = this.ctx.player.position
    const v = this.visit()
    if (v) {
      if (v.exit.inside(p)) this.travel('isle')
      return
    }
    for (const [id, arch] of this.arches) {
      if (arch.isOpen) {
        if (arch.inside(p)) this.travel(id)
      } else if (arch.inside(p, 0.75) && this.sealedT <= 0) {
        this.sealedT = SEALED_TOAST_GAP
        const need = MAPS[id].shards
        const have = Math.min(need, this.ctx.game.shardCount())
        this.ctx.bus.emit('ui:toast', {
          kind: 'warning',
          title: 'The arch is sealed',
          body: `Its runes wake when ${need} star shards are found (${have} of ${need}).`,
        })
      }
    }
  }

  private checkCheckpoints(v: Visit): void {
    const p = this.ctx.player.position
    const list = v.def.checkpoints
    for (let i = v.checkpoint + 1; i < list.length; i++) {
      const c = list[i]
      if (Math.hypot(p.x - c.x, p.z - c.z) > CHECKPOINT_RADIUS || Math.abs(p.y - c.y) > 2) continue
      v.checkpoint = i
      v.runes[i - 1].sprite.material = this.runeLit!
      this.ctx.player.resetHealth()
      this.ctx.bus.emit('checkpoint', { id: `${v.def.id}:${i}`, pos: { x: c.x, y: c.y, z: c.z }, first: true })
      this.ctx.bus.emit('ui:toast', { kind: 'checkpoint', title: 'Checkpoint', body: v.def.name })
    }
  }

  private checkArena(v: Visit): void {
    if (v.boss.mode !== 'sleep') return
    const a = v.def.arena
    const p = this.ctx.player.position
    if (Math.hypot(p.x - a.x, p.z - a.z) > a.r || p.y < a.y - 1) return
    if (v.introSeen) {
      v.boss.wake()
      this.beginFight(v)
      return
    }
    v.introSeen = true
    void this.ctx.game.playCutscene('boss', BOSS_IDS.indexOf(v.def.boss))
  }

  /** The player died: the fight starts over from the boss's sleep (the entrance checkpoint holds). */
  private restartFight(): void {
    const v = this.visit()
    if (!v || (v.boss.mode !== 'fight' && v.boss.mode !== 'intro')) return
    v.boss.reset()
    this.ctx.game.setMusic('explore')
    this.ctx.bus.emit('ui:objective', { text: v.def.objective })
  }

  private beginFight(v: Visit): void {
    v.boss.begin()
    this.ctx.game.setMusic('boss')
    this.ctx.bus.emit('ui:objective', { text: `Defeat the ${v.boss.name}` })
  }

  private bossDefeated(v: Visit): void {
    const ctx = this.ctx
    ctx.game.setMusic('explore')
    v.chest.show(false, true)
    ctx.bus.emit('ui:toast', { kind: 'reward', title: `${BOSS_NAMES[v.def.boss]} defeated!`, body: 'A chest has appeared in the arena.' })
    ctx.bus.emit('ui:objective', { text: this.objective(v) })
  }

  private objective(v: Visit): string {
    if (!this.ctx.game.save.bosses.includes(v.def.boss)) return v.def.objective
    return this.ctx.game.save.weapons.includes(REWARD[v.def.id as PortalMap]) ? 'Return home through the golden arch' : 'Open the reward chest'
  }

  /* ── unlocking ───────────────────────────────────────────── */

  /** Unlock every map the shard count has earned; `tell` queues the announcement. */
  private unlockFor(shards: number, tell: boolean): void {
    for (const def of PORTAL_MAPS) {
      const id = def.id as PortalMap
      if (shards < def.shards || this.isUnlocked(id)) continue
      this.ctx.game.unlockMap(id)
      this.arches.get(id)?.setOpen(true)
      if (tell) this.announce.push(id)
    }
  }

  /** After the shard cutscene: tell the player which arch woke up. */
  private announceUnlocks(): void {
    for (const id of this.announce) {
      this.ctx.bus.emit('ui:toast', { kind: 'reward', title: `${MAPS[id].name} portal awakened`, body: ARCH_HINT[id] })
    }
    this.announce = []
  }

  private visit(): Visit | null {
    return this._current === 'isle' ? null : (this.visits.get(this._current) ?? null)
  }

  private setBounds(): void {
    const b = this._bounds
    if (this._current === 'isle') {
      b.x = b.z = 0
      b.r = PLAY_RADIUS
      return
    }
    const def = MAPS[this._current]
    b.x = def.center.x
    b.z = def.center.z
    b.r = def.radius
  }
}

function wrap(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a))
}
