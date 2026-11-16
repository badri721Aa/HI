/**
 * Worlds — the Map Manager: Starfall Isle (map 0) and the maps behind its portal arches.
 *
 *   arches    an ancient arch on the island for every map. Each wakes when its unlock rule is met
 *             (enough shards, or a boss beaten; sealed until then: a dark pane and a message
 *             saying what it needs) and leads to its map; a golden arch in each map leads home.
 *             Creative opens them all.
 *   travel    walk in (or pick a map in the Travel menu) → fade to black → the map is built behind
 *             the fade and the one being left is freed → the player arrives, the atmosphere
 *             switches → fade back in
 *   maps      a MapDef (defs.ts: where everything stands) and a MapSpec (registry.ts: builder,
 *             boss, reward), built from ZoneKit geometry + colliders in their own region far from
 *             the island; each has checkpoints (the entrance first), a boss arena and guards
 *   bosses    the fight starts when the player walks into the arena (a short intro the first
 *             time); dying or leaving resets it; a defeated boss stays defeated (saved), leaves
 *             its reward chest or its drops, and may wake other arches
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
import { Hazards } from './bosses/hazards'
import { Chest } from './chest'
import { BOSS_IDS, BOSS_NAMES, lairOf, MAPS, PORTAL_MAPS, unlockMet, type MapDef, type PortalMapId, type Spot } from './defs'
import { Arch } from './portal'
import { MAP_SPECS, type MapBuild, type MapSpec } from './registry'

const FADE_OUT = 0.45
const FADE_IN = 0.6
/** Portals ignore the player for this long after a trip. */
const PORTAL_COOLDOWN = 1.2
const SEALED_TOAST_GAP = 5
const CHECKPOINT_RADIUS = 2.2
const HOME_COLORS: [string, string] = ['#fff1c8', '#d0862a']
/** Factory spawn group of a map's guards (cleared when leaving). */
const MAP_GROUP = 'map'

interface Rune {
  sprite: THREE.Sprite
  spot: Spot
}

/** The map the player is in: everything built for this visit, freed on leaving. */
interface Visit {
  def: MapDef
  spec: MapSpec
  kit: ZoneKit
  build: MapBuild
  exit: Arch
  hazards: Hazards
  boss: Boss
  /** The reward chest (maps whose boss guards a weapon). */
  chest: Chest | null
  weaponKit: WeaponKit | null
  runes: Rune[]
  /** Index into def.checkpoints of the furthest one reached this visit. */
  checkpoint: number
  /** The boss was made before its model arrived and wears the stand-in until it is swapped. */
  standIn: boolean
}

export class Worlds implements IWorlds {
  private _current: MapId = 'isle'
  private here: Visit | null = null
  private arches = new Map<PortalMapId, Arch>()
  private islandKit: ZoneKit | null = null
  private trip: { to: MapId; t: number; arrived: number } | null = null
  private cooldown = 0
  private sealedT = 0
  private announce: PortalMapId[] = []
  /** Maps whose boss intro has played (later fights start at once). */
  private introSeen = new Set<PortalMapId>()
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

  get fighting(): boolean {
    const mode = this.here?.boss.mode
    return mode === 'intro' || mode === 'fight' || mode === 'dying'
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
    return id === 'isle' || this.ctx.game.creative || this.ctx.game.save.maps.includes(id)
  }

  spawnPoint(): Spot | null {
    const v = this.here
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
      this.arches.set(def.id, new Arch(ctx, kit, { x: a.x, y, z: a.z, yaw: a.yaw }, def.swirl))
    }
    kit.finalize()
    this.glow = glowTexture(ctx)
    const rune = (opacity: number) => new THREE.SpriteMaterial({ map: this.glow!.texture, color: 0x9fe0ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity })
    this.runeDim = rune(0.25)
    this.runeLit = rune(0.9)

    const bus = ctx.bus
    this.unsubs.push(
      bus.on('collect:shard', () => this.unlockEarned(true)),
      bus.on('cutscene:end', () => this.announceUnlocks()),
      bus.on('player:respawn', () => this.restartFight()),
      bus.on('chest:open', () => {
        const v = this.here
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
      this.leave()
      this._current = 'isle'
      ctx.env.setAtmosphere('isle', 0)
    }
    this.setBounds()
    // Older saves: whatever their shards and bosses already earn.
    this.unlockEarned(false)
    for (const [id, arch] of this.arches) arch.setOpen(this.isUnlocked(id), true)
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
    const v = this.here
    if (v) {
      const live = playing && !this.trip
      const kind = v.spec.factoryBoss
      if (v.standIn && kind && v.boss.mode === 'sleep' && ctx.factory.bossModelReady(kind)) this.swapStandIn(v)
      v.build.update(dt, ctx.clock.t)
      v.exit.update(dt)
      if (playing) v.hazards.update(dt)
      v.boss.update(dt, live)
      v.chest?.update(dt, live)
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

  nearestPortal(p: V3, out: V3): boolean {
    const v = this.here
    let best: Arch | null = v ? v.exit : null
    if (!v) {
      let bestD = Infinity
      for (const a of this.arches.values()) {
        const d = (a.x - p.x) ** 2 + (a.z - p.z) ** 2
        if (a.isOpen && d < bestD) {
          bestD = d
          best = a
        }
      }
    }
    if (!best) return false
    out.x = best.x
    out.y = best.y + 1.4
    out.z = best.z
    return true
  }

  compass(p: V3, cameraYaw: number, out: CompassMarker[]): void {
    const save = this.ctx.game.save
    const mark = (x: number, z: number, kind: CompassMarker['kind']) => {
      const dx = x - p.x
      const dz = z - p.z
      out.push({ angle: wrap(cameraYaw - Math.atan2(dx, dz)), dist: Math.hypot(dx, dz), kind })
    }
    const v = this.here
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
    const v = this.here
    if (!v || v.boss.mode !== 'sleep') return null
    const boss = v.boss
    this.head.set(boss.pos.x, boss.pos.y + v.spec.head, boss.pos.z)
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
    if (this.here) this.disposeVisit(this.here)
    this.here = null
    for (const a of this.arches.values()) a.dispose()
    this.arches.clear()
    this.islandKit?.dispose()
    this.islandKit = null
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
    this.leave()
    let v: Visit | null = null
    if (to !== 'isle') {
      try {
        v = this.open(to)
      } catch (err) {
        // A map that fails to build must not stop the game: the player steps back out of its arch.
        console.error(`[starfall] building ${to} failed`, err)
        ctx.bus.emit('ui:toast', { kind: 'warning', title: 'The portal flickered out', body: 'Its magic faltered. Try the arch again.' })
      }
    }
    const dest: MapId = v ? to : 'isle'
    let spot: Spot
    if (v) {
      this.prepare(v)
      spot = v.def.checkpoints[0]
    } else {
      // Out of the island arch of the map just left (or of the one that failed to open).
      const arch = to !== 'isle' ? this.arches.get(to) : from !== 'isle' ? this.arches.get(from) : undefined
      spot = arch?.exitSpot() ?? ctx.checkpoints.spawnPoint(ctx.game.save.checkpoint)
    }
    this.here = v
    this._current = dest
    this.setBounds()
    ctx.character.cancelRagdoll()
    ctx.player.teleport(spot.x, spot.y, spot.z, spot.yaw)
    ctx.player.resetHealth()
    ctx.cameraRig.snapBehind()
    ctx.env.setAtmosphere(dest, 0)
    ctx.enemies.clearMinions()
    ctx.game.setMusic('explore')
    ctx.bus.emit('world:travel', { from, to: dest })
    if (!v) {
      this.announceUnlocks()
      return
    }
    ctx.bus.emit('ui:objective', { text: this.objective(v) })
    this.placeGuards(v.def)
  }

  /** The map's factory mobs, fresh on every visit (Creative: only with its enemies switched on). */
  private placeGuards(def: MapDef): void {
    const ctx = this.ctx
    if (!def.mobs || !ctx.game.creativeEnemies) return
    for (const m of def.mobs) {
      const x = def.center.x + m.dx
      const z = def.center.z + m.dz
      ctx.factory.spawn(m.kind, { x, y: def.center.y + (m.dy ?? 0), z }, { aggressive: false, patrol: m.patrol, leash: m.leash, yaw: m.yaw, instant: true, group: MAP_GROUP })
    }
  }

  /** Leaving the current map: its guards go, its fight ends, and everything built for it is freed. */
  private leave(): void {
    this.ctx.factory.clear(MAP_GROUP)
    if (this.here) this.disposeVisit(this.here)
    this.here = null
  }

  /** Builds a map (on arrival, behind the fade). If anything throws, what was built so far is freed. */
  private open(id: PortalMapId): Visit {
    const made: Array<{ dispose(): void }> = []
    const keep = <T extends { dispose(): void }>(o: T): T => {
      made.push(o)
      return o
    }
    try {
      return this.assemble(id, keep)
    } catch (err) {
      for (const o of made.reverse()) {
        try {
          o.dispose()
        } catch {
          /* already broken: free the rest */
        }
      }
      throw err
    }
  }

  private assemble(id: PortalMapId, keep: <T extends { dispose(): void }>(o: T) => T): Visit {
    const ctx = this.ctx
    const def = MAPS[id]
    const spec = MAP_SPECS[id]
    const kit = keep(new ZoneKit(ctx, `map:${id}`))
    const build = keep(spec.build(ctx, kit, def))
    const exit = keep(new Arch(ctx, kit, { x: def.exit.x, y: def.exit.y ?? def.center.y, z: def.exit.z, yaw: def.exit.yaw }, HOME_COLORS))
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
    const weaponKit = spec.reward ? keep(new WeaponKit(ctx.textures)) : null
    const chest = spec.reward && weaponKit ? keep(new Chest(ctx, def.arena.x, def.arena.y, def.arena.z, 0, spec.reward, weaponKit)) : null
    const hazards = keep(new Hazards(ctx, spec.hazards))
    const { boss, standIn } = this.makeBoss(def, spec, hazards, build)
    keep(boss)
    const v: Visit = { def, spec, kit, build, exit, hazards, boss, chest, weaponKit, runes, checkpoint: 0, standIn }
    boss.onDefeated = () => this.bossDefeated(v)
    try {
      ctx.renderer.compile(ctx.scene, ctx.camera)
    } catch {
      /* compiling up front only avoids a hitch */
    }
    return v
  }

  /** The map's boss asleep in its arena; `standIn`: made before its model arrived. */
  private makeBoss(def: MapDef, spec: MapSpec, hazards: Hazards, build: MapBuild): { boss: Boss; standIn: boolean } {
    const kind = spec.factoryBoss
    const standIn = !!kind && !this.ctx.factory.bossModelReady(kind)
    return { boss: spec.boss(this.ctx, hazards, { ...def.arena, r: spec.arenaRadius }, build), standIn }
  }

  /** The boss's model arrived while it slept in its stand-in: swap in the real one. */
  private swapStandIn(v: Visit): void {
    v.boss.dispose()
    const next = this.makeBoss(v.def, v.spec, v.hazards, v.build)
    v.boss = next.boss
    v.standIn = next.standIn
    v.boss.onDefeated = () => this.bossDefeated(v)
  }

  /** Boss and chest as the save says: beaten (chest open once the reward is owned) or waiting. */
  private prepare(v: Visit): void {
    const save = this.ctx.game.save
    const reward = v.spec.reward
    if (save.bosses.includes(v.def.boss)) {
      v.boss.markDead()
      if (reward) v.chest?.show(save.weapons.includes(reward))
    } else {
      if (v.boss.mode === 'dead') v.boss.mode = 'sleep'
      v.boss.reset()
      v.chest?.hide()
    }
    v.hazards.clear()
    for (let i = 0; i < v.runes.length; i++) v.runes[i].sprite.material = i + 1 <= v.checkpoint ? this.runeLit! : this.runeDim!
  }

  private disposeVisit(v: Visit): void {
    v.boss.dispose()
    v.chest?.dispose()
    v.weaponKit?.dispose()
    v.hazards.dispose()
    v.exit.dispose()
    v.build.dispose()
    v.kit.dispose()
  }

  /* ── triggers ────────────────────────────────────────────── */

  private checkPortals(): void {
    if (this.cooldown > 0) return
    const p = this.ctx.player.position
    const v = this.here
    if (v) {
      if (v.exit.inside(p)) this.travel('isle')
      return
    }
    for (const [id, arch] of this.arches) {
      if (arch.isOpen) {
        if (arch.inside(p)) this.travel(id)
      } else if (arch.inside(p, 0.75) && this.sealedT <= 0) {
        this.sealedT = SEALED_TOAST_GAP
        this.ctx.bus.emit('ui:toast', { kind: 'warning', title: 'The arch is sealed', body: this.sealedText(MAPS[id]) })
      }
    }
  }

  private sealedText(def: MapDef): string {
    const rule = def.unlock
    if ('shards' in rule) {
      const have = Math.min(rule.shards, this.ctx.game.shardCount())
      return `Its runes wake when ${rule.shards} star shards are found (${have} of ${rule.shards}).`
    }
    const lair = lairOf(rule.boss)
    return `Its runes wake once the ${BOSS_NAMES[rule.boss]}${lair ? ` ${lair.where}` : ''} is defeated.`
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
    if (this.introSeen.has(v.def.id)) {
      v.boss.wake()
      this.beginFight(v)
      return
    }
    this.introSeen.add(v.def.id)
    void this.ctx.game.playCutscene('boss', BOSS_IDS.indexOf(v.def.boss))
  }

  /** The player died: the fight starts over from the boss's sleep (the entrance checkpoint holds). */
  private restartFight(): void {
    const v = this.here
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
    const kind = v.spec.factoryBoss
    if (kind) ctx.factory.bossDrops(kind, v.boss.pos.x, v.def.arena.y, v.boss.pos.z)
    v.chest?.show(false, true)
    ctx.bus.emit('ui:toast', {
      kind: 'reward',
      title: `${BOSS_NAMES[v.def.boss]} defeated!`,
      body: v.chest ? 'A chest has appeared in the arena.' : 'It left hearts behind. The golden arch leads home.',
    })
    ctx.bus.emit('ui:objective', { text: this.objective(v) })
    // Arches this boss guarded wake now; the island hears about it on the way back.
    this.unlockEarned(true)
  }

  private objective(v: Visit): string {
    const save = this.ctx.game.save
    if (!save.bosses.includes(v.def.boss)) return v.def.objective
    const reward = v.spec.reward
    return reward && !save.weapons.includes(reward) ? 'Open the reward chest' : 'Return home through the golden arch'
  }

  /* ── unlocking ───────────────────────────────────────────── */

  /** Wake every arch whose rule the progress now meets; `tell` queues the announcement. */
  private unlockEarned(tell: boolean): void {
    const game = this.ctx.game
    const shards = game.shardCount()
    for (const def of PORTAL_MAPS) {
      if (this.isUnlocked(def.id) || !unlockMet(def.unlock, shards, game.save.bosses)) continue
      game.unlockMap(def.id)
      this.arches.get(def.id)?.setOpen(true)
      if (tell) this.announce.push(def.id)
    }
  }

  /** On the island (after the shard cutscene, or back from a map): say which arches woke up. */
  private announceUnlocks(): void {
    if (this._current !== 'isle') return
    for (const id of this.announce) {
      this.ctx.bus.emit('ui:toast', { kind: 'reward', title: `${MAPS[id].name} portal awakened`, body: MAP_SPECS[id].archHint })
    }
    this.announce = []
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
