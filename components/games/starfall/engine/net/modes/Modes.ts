/**
 * Game modes in online rooms.
 *
 * Authority: the room host — the present player with the lowest id among those who
 * have been in the room a few seconds (so a newcomer never takes over before it has
 * heard the round). The host runs the referee (rules.ts) on the latest replicated
 * positions and broadcasts the round state on the room channel: at once on every
 * change, and once a second while a round runs. Everyone else only renders it. When
 * the host leaves, the next one carries on from the last state it heard.
 *
 * Locally every player applies what the state says about them: the trip to the arena
 * and the start point, a frozen countdown, pvp on during play, the weapons the mode
 * hands out, the seeker's blindfold, the Juggernaut's size, respawning on the arena or
 * at the last ring, and the sounds.
 *
 * Messages on the room's `mode` event (all validated by whoever acts on them):
 *   { k: 'state', s }        host → all      the round state
 *   { k: 'suggest', mode }   player → host   "let's play this"
 *   { k: 'ko', by, w }       victim → host   knocked out (health modes): by whom, with what
 *   { k: 'bit', by }         victim → host   Infection: an infected player's blow landed on me
 *   { k: 'hp', v }           Juggernaut → all  their round health, for everyone's bar
 */
import * as THREE from 'three'
import type { MapId, WeaponId } from '../../events'
import { HOTBAR, KIND } from '../../gameplay/weapons/defs'
import type { Ctx } from '../../types'
import type { WallPush } from '../../collision'
import { MOVE } from '../../player/control/tuning'
import type { ZoneKit } from '../../world/zones/kit'
import { isPeerId } from '../protocol'
import type { HitRuling } from '../pvp'
import type { RemotePeer } from '../RemotePeer'
import { buildArena } from './arena'
import {
  ARENA_FALL, ARENA_SLOTS, arenaSpot, blowDamage, contestant, idleState, isArena, isModeId, ISLAND_RETURN, JUGGERNAUT, JUGGERNAUT_KIT,
  juggernautHp, LADDER, MODE_BY_ID, packRound, parseRound, PROTECT, RESPAWN, RINGS, ROLE_IT, ROLE_OUT, ROUND_HP, STAGGER, startSpot,
  type Contestant, type ModeId, type RoundState, type Spot,
} from './defs'
import { RoundHealth } from './health'
import { ModeMarkers } from './markers'
import { Referee } from './rules'

/** What Modes needs from the network layer. */
export interface ModeLink {
  readonly selfId: string
  /** Connected to a room. */
  online(): boolean
  /** The other players in the room. */
  peers(): readonly RemotePeer[]
  /** When we joined the room (ms since the epoch, as in presence). */
  joinedAt(): number
  selfName(): string
  /** Broadcast a mode message to the room. */
  send(payload: object): void
  setPvp(on: boolean): void
  /** Rule on every pvp blow that reaches us before it shoves (null: the plain shove). */
  setJudge(judge: ((peer: RemotePeer, weapon: WeaponId, power: number) => HitRuling) | null): void
}

export type ModeCue =
  | 'count' | 'go' | 'end' | 'win' | 'tag' | 'ko' | 'ring' | 'point' | 'move' | 'suggest'
  /** Infection spreads · a Juggernaut is crowned · up a rung · someone reaches the last rung · one survivor left. */
  | 'infect' | 'crown' | 'rung' | 'final' | 'last'

/** The round as the UI shows it (a fresh object whenever something visible changes). */
export interface ModeView {
  round: RoundState
  /** Whole seconds left in the phase; the seeker's count. */
  left: number
  hold: number
  isHost: boolean
  hostName: string
  selfId: string
  /** Our entry, or null while spectating (or between rounds). */
  me: Contestant | null
  /** Health modes, while we play: our round health, spawn protection (s left) and whether we are knocked out. */
  health: { hp: number; max: number; shield: number; down: boolean } | null
  /** Juggernaut Chaos: the Juggernaut's round health as last heard. */
  jug: { hp: number; max: number } | null
}

/** Players who joined less than this long ago (ms) can't be elected host yet. */
const SETTLE_MS = 4000
const HEARTBEAT = 1
/** Suggestions accepted per player at most this often (s). */
const SUGGEST_GAP = 8
/** Infection: one bite claim per this long (s). */
const BITE_GAP = 0.5
/** The Juggernaut tells the room its health at most this often (s). */
const HP_GAP = 0.45
/** The hero grows into (and out of) the Juggernaut at this rate (1/s). */
const GROW_RATE = 5
/** The death path's own wait before the fade (s): normally, and when knocked out in a health round (≈ RESPAWN in all). */
const DEATH_WAIT = 1.4
const KNOCKOUT_WAIT = RESPAWN - 0.85

const _self = new THREE.Vector3()
const _push = {} as WallPush

const isWeapon = (v: unknown): v is WeaponId => typeof v === 'string' && (HOTBAR as readonly string[]).includes(v)

export class Modes {
  view: ModeView
  private state = idleState()
  private referee = new Referee()
  private markers: ModeMarkers
  private health: RoundHealth
  private arena: ZoneKit | null = null
  private hostId = ''
  private wasHost = false
  private lastSent = -Infinity
  private viewKey = ''
  private suggestedAt = new Map<string, number>()
  private mySuggestAt = -Infinity
  private biteAt = -Infinity
  /** Juggernaut Chaos: the Juggernaut's health as they last told it, and when we last told ours. */
  private jugHp = 0
  private hpSent = -1
  private hpSentAt = -Infinity
  /** What has been applied locally (diffed against the state every frame). */
  private applied = {
    round: 0, phase: 'idle', role: 0, lives: 0, score: 0, hill: -1, count: 0,
    /** The round we have been put on our start point for. */
    placed: 0,
    /** Infection: how many were infected · Juggernaut: who wore the crown · Gun Game: how many were on the last rung. */
    sick: 0, jug: '', finalists: 0, down: -1, kos: 0,
  }
  private effects = {
    frozen: false, pvp: false, kit: '', judged: false,
    /** Portals and the map's own boss and guards are switched off for the round. */
    arena: false,
    /** A round took us to a portal map: back to the island when it is over. */
    away: false,
    /** Infection: we stagger until then (local clock, s). */
    staggerUntil: 0,
    scale: 1,
  }

  constructor(
    private ctx: Ctx,
    private link: ModeLink,
  ) {
    this.markers = new ModeMarkers(ctx)
    this.health = new RoundHealth(ctx, (by, weapon) => this.claim({ k: 'ko', by, w: weapon }))
    this.view = this.makeView()
  }

  /** We are playing in a round (its countdown or live part). */
  get active(): boolean {
    const s = this.state
    return (s.phase === 'countdown' || s.phase === 'live') && this.me() !== null
  }

  /** How long the hero lies limp before the respawn fade (s): longer when knocked out of a health round. */
  get respawnDelay(): number {
    return this.health.active ? KNOCKOUT_WAIT : DEATH_WAIT
  }

  /** Host: start a round (false when not the host, a round is running or too few players). Arena modes are played on `map`. */
  start(mode: ModeId, map: MapId = 'isle'): boolean {
    if (!this.isHost() || !isModeId(mode)) return false
    if (this.state.phase === 'countdown' || this.state.phase === 'live') return false
    const def = MODE_BY_ID[mode]
    const entrants = this.entrants(!!def.arena)
    if (entrants.length < def.minPlayers) return false
    this.referee.start(this.state, mode, entrants, isArena(map) ? map : 'isle')
    this.broadcast()
    this.publish(true)
    return true
  }

  /** Host: end the running round now (straight to the results). */
  stop(): void {
    if (!this.isHost()) return
    this.referee.finish(this.state)
    this.broadcast()
    this.publish(true)
  }

  /** Not the host: ask for a mode (the host gets a toast). */
  suggest(mode: ModeId): boolean {
    const now = this.now()
    if (this.isHost() || !this.link.online() || !isModeId(mode) || now - this.mySuggestAt < SUGGEST_GAP) return false
    this.mySuggestAt = now
    this.link.send({ k: 'suggest', mode })
    return true
  }

  /** A mode message from another player (sender already checked by the room). */
  receive(peer: RemotePeer, raw: unknown): void {
    if (!raw || typeof raw !== 'object') return
    const o = raw as Record<string, unknown>
    if (o.k === 'state') {
      // Only the host's word counts; we ignore it while we are the host ourselves.
      if (peer.id !== this.hostId || this.isHost()) return
      const s = parseRound(o.s)
      if (!s) return
      this.state = s
      this.publish(true)
    } else if (o.k === 'suggest' && isModeId(o.mode) && this.isHost()) {
      const now = this.now()
      if (now - (this.suggestedAt.get(peer.id) ?? -Infinity) < SUGGEST_GAP) return
      this.suggestedAt.set(peer.id, now)
      this.ctx.bus.emit('mode:cue', { cue: 'suggest' })
      this.ctx.bus.emit('ui:toast', { kind: 'info', title: `${peer.name} suggests ${MODE_BY_ID[o.mode].name}`, body: 'Press O (or open Game modes) to start it.' })
    } else if (o.k === 'ko' || o.k === 'bit') {
      this.rule(peer.id, o)
    } else if (o.k === 'hp' && typeof o.v === 'number' && Number.isFinite(o.v)) {
      // Only the Juggernaut's own word about their health counts.
      const s = this.state
      if (s.mode === 'juggernaut' && contestant(s, peer.id)?.role === ROLE_IT) this.jugHp = Math.min(this.jugMax(), Math.max(0, o.v))
    }
  }

  /** Where to respawn during a round (the arena, the island when out, the last ring, the spawn furthest from the others), else null. */
  spawnPoint(): Spot | null {
    const s = this.state
    const me = this.me()
    if (!me || !s.mode || (s.phase !== 'live' && s.phase !== 'countdown')) return null
    if (s.mode === 'knockout') return me.role === ROLE_OUT ? ISLAND_RETURN(me.slot) : startSpot('knockout', me.slot, s.players.length)
    if (s.mode === 'race') {
      if (me.score === 0) return startSpot('race', me.slot, s.players.length)
      const r = RINGS[Math.min(me.score, RINGS.length) - 1]
      return { x: r.x, y: r.y - 1.6, z: r.z, yaw: r.yaw }
    }
    if (!MODE_BY_ID[s.mode].arena || (this.ctx.worlds?.current ?? 'isle') !== s.map) return null
    let best = arenaSpot(s.mode, s.map, me.slot)
    let bestD = -1
    for (let i = 0; i < ARENA_SLOTS; i++) {
      const spot = arenaSpot(s.mode, s.map, i)
      let d = Infinity
      for (const p of s.players) {
        const at = p.id === me.id ? null : this.locate(p.id)
        if (at) d = Math.min(d, (at.x - spot.x) ** 2 + (at.z - spot.z) ** 2)
      }
      if (d > bestD && d < Infinity) {
        bestD = d
        best = spot
      }
    }
    return best
  }

  update(dt: number): void {
    if (!this.link.online()) {
      if (this.state.phase !== 'idle' || this.hostId) this.reset()
    } else {
      const now = this.now()
      this.hostId = this.elect()
      if (this.isHost()) {
        if (!this.wasHost) {
          this.wasHost = true
          this.referee.adopt(this.state)
          this.lastSent = -Infinity
        }
        const changed = this.referee.tick(this.state, dt, this.present, this.locate)
        if (changed || (this.state.phase !== 'idle' && now - this.lastSent >= HEARTBEAT)) this.broadcast()
      } else {
        this.wasHost = false
        this.extrapolate(dt)
      }
    }
    this.applyLocal(dt)
    this.markers.update(dt, this.state, this.link.selfId, this.locate, this.health.active && this.health.shield > 0 && !this.health.down)
    this.publish(false)
  }

  /** Left the room: back to free roam. */
  reset(): void {
    this.state = idleState()
    this.hostId = ''
    this.wasHost = false
    this.suggestedAt.clear()
    this.applyLocal(0)
    this.publish(true)
  }

  dispose(): void {
    this.link.setJudge(null)
    this.health.dispose()
    this.markers.dispose()
    this.arena?.dispose()
    this.arena = null
  }

  /* ── host ────────────────────────────────────────────────── */

  private now(): number {
    return performance.now() / 1000
  }

  private isHost(): boolean {
    return this.hostId === this.link.selfId && this.link.online()
  }

  /** Lowest id among the settled players (everyone, if nobody has settled yet). */
  private elect(): string {
    const settled = Date.now() - SETTLE_MS
    const self = this.link.selfId
    let any = self
    let best = this.link.joinedAt() <= settled ? self : ''
    const peers = this.link.peers()
    for (let i = 0; i < peers.length; i++) {
      const p = peers[i]
      if (p.id < any) any = p.id
      if (p.joinedAt <= settled && (!best || p.id < best)) best = p.id
    }
    return best || any
  }

  /**
   * Who plays: everyone on the island right now (players in a portal world sit the round out) —
   * or, for an arena mode, everyone in the room: the round takes them all to its map.
   */
  private entrants(everywhere: boolean): Array<{ id: string; name: string }> {
    const list: Array<{ id: string; name: string }> = []
    if (everywhere || (this.ctx.worlds?.current ?? 'isle') === 'isle') list.push({ id: this.link.selfId, name: this.link.selfName() })
    for (const p of this.link.peers()) if (p.ready && (everywhere || p.map === 'isle')) list.push({ id: p.id, name: p.name })
    return list
  }

  private present = (id: string): boolean => id === this.link.selfId || this.link.peers().some(p => p.id === id)

  /** Feet position of a player on the round's map as we see it (ours: the ragdoll's body while limp). */
  private locate = (id: string): THREE.Vector3 | null => {
    const map = this.state.map
    if (id === this.link.selfId) {
      if ((this.ctx.worlds?.current ?? 'isle') !== map) return null
      const ch = this.ctx.character
      if (ch.ragdolling) {
        const a = ch.getRagdollAnchor(_self)
        if (Number.isFinite(a.x + a.y + a.z)) return a
      }
      return this.ctx.player.position
    }
    const peers = this.link.peers()
    for (let i = 0; i < peers.length; i++) {
      const p = peers[i]
      if (p.id === id) return p.ready && !p.away && p.map === map ? p.position : null
    }
    return null
  }

  private broadcast(): void {
    this.lastSent = this.now()
    this.link.send({ k: 'state', s: packRound(this.state) })
  }

  /** Between host messages the clocks keep running here. */
  private extrapolate(dt: number): void {
    const s = this.state
    if (s.phase === 'idle') return
    s.left = Math.max(0, s.left - dt)
    if (s.phase !== 'live') return
    s.elapsed += dt
    s.hillLeft = Math.max(0, s.hillLeft - dt)
    s.hold = Math.max(0, s.hold - dt)
    s.immuneLeft = Math.max(0, s.immuneLeft - dt)
  }

  /** Our own claim (a knockout, a bite): ruled on here when we are the host, else sent to it. */
  private claim(payload: { k: 'ko'; by: string; w: WeaponId } | { k: 'bit'; by: string }): void {
    if (this.isHost()) this.rule(this.link.selfId, payload)
    else this.link.send(payload)
  }

  /** Host: a player's claim about what happened to them. */
  private rule(from: string, o: Record<string, unknown>): void {
    if (!this.isHost()) return
    const by = isPeerId(o.by) ? o.by : ''
    const changed =
      o.k === 'ko'
        ? this.referee.knockedOut(this.state, from, by, isWeapon(o.w) ? o.w : 'fists', this.locate)
        : by !== '' && this.referee.bitten(this.state, from, by, this.locate)
    if (!changed) return
    this.broadcast()
    this.publish(true)
  }

  /* ── pvp ─────────────────────────────────────────────────── */

  /** Juggernaut Chaos: what the Juggernaut's health starts at in this round. */
  private jugMax(): number {
    return juggernautHp(this.state.players.length - 1)
  }

  /**
   * A blow from `peer` passed the pvp checks: what does the round make of it? Spectators and
   * team-mates can't touch us; in a health round it costs health (and may knock us out); in
   * Infection a landed blow from the infected is how it spreads.
   */
  private judge = (peer: RemotePeer, weapon: WeaponId, power: number): HitRuling => {
    const s = this.state
    const me = this.me()
    if (!me || s.phase !== 'live' || !s.mode) return 'normal'
    const a = contestant(s, peer.id)
    if (!a) return 'ignore'
    const now = this.now()
    if (s.mode === 'infection') {
      const sick = a.role === ROLE_IT
      if (sick === (me.role === ROLE_IT) || KIND[weapon] !== 'fists') return 'ignore'
      if (sick && s.hold <= 0 && now - this.biteAt >= BITE_GAP) {
        this.biteAt = now
        this.claim({ k: 'bit', by: a.id })
      }
      return 'normal'
    }
    if (!MODE_BY_ID[s.mode].health) return 'normal'
    const h = this.health
    if (h.down || h.shield > 0) return 'ignore'
    const jug = s.mode === 'juggernaut'
    if (jug) {
      // Hunters are on one side; only the kit the round hands out counts.
      if (a.role !== ROLE_IT && me.role !== ROLE_IT) return 'ignore'
      if (weapon !== 'fists' && !JUGGERNAUT_KIT.includes(weapon)) return 'ignore'
    } else if (weapon !== 'fists' && weapon !== LADDER[a.score] && weapon !== LADDER[a.score - 1]) return 'ignore'
    const hard = jug && a.role === ROLE_IT ? JUGGERNAUT.damage : 1
    h.hit(a.id, weapon, blowDamage(weapon, power) * hard, peer.position, now)
    // The Juggernaut's armour: shoved, never thrown down (until the knockout).
    return jug && me.role === ROLE_IT ? 'steady' : 'normal'
  }

  /* ── local effects ───────────────────────────────────────── */

  private me(): Contestant | null {
    return contestant(this.state, this.link.selfId)
  }

  private cue(cue: ModeCue): void {
    this.ctx.bus.emit('mode:cue', { cue })
  }

  private toast(title: string, body?: string): void {
    this.ctx.bus.emit('ui:toast', { kind: 'info', title, body })
  }

  private applyLocal(dt: number): void {
    const ctx = this.ctx
    const s = this.state
    const me = this.me()
    const a = this.applied
    const running = s.phase === 'countdown' || s.phase === 'live'
    const def = s.mode ? MODE_BY_ID[s.mode] : null

    if (s.mode === 'knockout' && s.phase !== 'idle' && !this.arena) this.arena = buildArena(ctx)

    this.travel(!!me && !!def?.arena)

    if (me && running && s.round !== a.round) {
      // A round with us in it: to the start line (unless we arrive while it's already on).
      a.round = s.round
      a.role = me.role
      a.lives = me.lives
      a.score = me.score
      a.kos = me.kos
      a.down = me.down
      a.count = 0
      a.sick = -1
      a.jug = ''
      a.finalists = -1
      if (s.phase === 'countdown' && s.mode && !def?.arena) this.place(startSpot(s.mode, me.slot, s.players.length))
    }
    // Arena rounds start where the round is played — once we are there (also when joining it late).
    if (me && running && s.mode && def?.arena && a.placed !== s.round && !ctx.worlds.travelling && ctx.worlds.current === s.map) {
      a.placed = s.round
      this.place(startSpot(s.mode, me.slot, s.players.length, s.map))
    }
    if (me && s.round === a.round) {
      if (s.phase === 'countdown') {
        const c = Math.ceil(s.left)
        if (c !== a.count && c >= 1 && c <= 5) this.cue('count')
        a.count = c
      }
      if (s.phase === 'live' && a.phase === 'countdown') this.cue('go')
      if (s.phase === 'live') {
        if (me.role === ROLE_IT && a.role !== ROLE_IT && (s.mode === 'tag' || s.mode === 'hide')) this.cue('tag')
        if (me.lives < a.lives) this.cue('ko')
        if (me.score > a.score) {
          if (s.mode === 'race') this.cue('ring')
          else if (s.mode === 'knockout') this.cue('ko')
          else if (s.mode === 'hide') this.cue('tag')
          else if (s.mode === 'koth' && Math.floor(me.score) > Math.floor(a.score)) this.cue('point')
        }
        if (s.mode === 'koth' && a.hill >= 0 && s.hill !== a.hill) this.cue('move')
        // Knocked off the arena: down to the sea, then back up (or out to the island).
        if (s.mode === 'knockout' && me.role !== ROLE_OUT && ctx.game.phase === 'playing' && ctx.player.position.y < ARENA_FALL - 4) {
          ctx.game.playerDied('fall')
        }
        if (s.mode === 'infection') this.infectionEvents(s, me)
        else if (s.mode === 'juggernaut') this.juggernautEvents(s, me)
        else if (s.mode === 'gungame') this.gunGameEvents(s, me)
      }
      if (s.phase === 'results' && (a.phase === 'live' || a.phase === 'countdown')) {
        const rank = s.podium.indexOf(me.id)
        this.cue(rank >= 0 && rank < s.winners ? 'win' : 'end')
        if (s.mode === 'knockout') this.place(ISLAND_RETURN(me.slot))
      }
      a.role = me.role
      a.lives = me.lives
      a.score = me.score
      a.kos = me.kos
    }
    a.phase = me ? s.phase : 'idle'
    a.hill = running && s.mode === 'koth' ? s.hill : -1

    // Lasting effects follow the state.
    const live = !!me && s.phase === 'live'
    const now = this.now()
    this.setFrozen(
      !!me && (s.phase === 'countdown' || (live && s.mode === 'hide' && me.role === ROLE_IT && s.hold > 0) || (live && now < this.effects.staggerUntil)),
    )
    const pvp = live && !!def?.pvp && me.role !== ROLE_OUT
    if (pvp !== this.effects.pvp) {
      this.effects.pvp = pvp
      this.link.setPvp(pvp)
    }
    if (live !== this.effects.judged) {
      this.effects.judged = live
      this.link.setJudge(live ? this.judge : null)
    }
    this.lendKit(me && running ? s : null, me)
    this.updateHealth(dt, live && !!def?.health ? me : null, now)
    this.updateSize(dt, s, live && s.mode === 'juggernaut')
  }

  /* ── arenas ──────────────────────────────────────────────── */

  /**
   * Arena rounds are played where the host chose: everyone in the round is taken there through
   * the usual portal trip, and home to the island once the results are over. While a round has us,
   * portals are shut and the map's own boss and guards stay out of it.
   */
  private travel(arenaRound: boolean): void {
    const ctx = this.ctx
    const s = this.state
    const w = ctx.worlds
    if (!w) return
    const fx = this.effects
    const inRound = this.me() !== null && s.phase !== 'idle'
    if (inRound !== fx.arena) {
      fx.arena = inRound
      w.setArena(inRound)
    }
    // A cutscene or a dialog finishes first; the trip starts when the game is back.
    const free = !w.travelling && (ctx.game.phase === 'playing' || ctx.game.phase === 'paused')
    if (arenaRound && (s.phase === 'countdown' || s.phase === 'live')) {
      if (s.map !== 'isle') fx.away = true
      if (w.current !== s.map && free) w.travel(s.map)
    } else if (!inRound && fx.away && free) {
      fx.away = false
      if (w.current !== 'isle') w.travel('isle')
    }
  }

  /* ── what the modes hand out ─────────────────────────────── */

  /** The weapons the round lends (the first in hand); the saved loadout comes back when it ends. */
  private lendKit(s: RoundState | null, me: Contestant | null): void {
    let kit: readonly WeaponId[] | null = null
    if (s && me) {
      if (s.mode === 'knockout') kit = me.role === ROLE_OUT ? null : ['hammer']
      else if (s.mode === 'infection') kit = ['fists']
      else if (s.mode === 'juggernaut') kit = JUGGERNAUT_KIT
      else if (s.mode === 'gungame') {
        const rung = LADDER[Math.min(me.score, LADDER.length - 1)]
        kit = rung === 'fists' ? ['fists'] : [rung, 'fists']
      }
    }
    const key = kit ? kit.join() : ''
    if (key === this.effects.kit) return
    this.effects.kit = key
    this.ctx.weapons.lend(kit)
  }

  private updateHealth(dt: number, me: Contestant | null, now: number): void {
    const h = this.health
    const s = this.state
    if (!me) {
      if (h.active) h.end()
      this.hpSent = -1
      return
    }
    const jug = s.mode === 'juggernaut' && me.role === ROLE_IT
    const max = jug ? this.jugMax() : ROUND_HP
    if (!h.active) h.begin(max)
    else if (max > h.max) {
      // Crowned: the Juggernaut's full health, and a moment to grow into it.
      h.begin(max, PROTECT)
    } else if (max < h.max) {
      h.max = max
      h.hp = Math.min(h.hp, max)
    }
    if (me.down !== this.applied.down) {
      this.applied.down = me.down
      h.acknowledged()
    }
    h.update(dt, now)
    // Everyone watches the Juggernaut's bar.
    const hp = Math.round(h.hp)
    if (jug && hp !== this.hpSent && now - this.hpSentAt >= HP_GAP) {
      this.hpSent = hp
      this.hpSentAt = now
      this.link.send({ k: 'hp', v: hp })
    } else if (!jug) this.hpSent = -1
  }

  /** The Juggernaut is bigger and heavier: on our hero, on everyone's copy of the others, in collisions and for the camera. */
  private updateSize(dt: number, s: RoundState, on: boolean): void {
    const ctx = this.ctx
    const fx = this.effects
    const selfId = this.link.selfId
    let mine = 1
    const peers = this.link.peers()
    for (let i = 0; i < peers.length; i++) peers[i].scale = on && contestant(s, peers[i].id)?.role === ROLE_IT ? JUGGERNAUT.scale : 1
    // A limp body keeps its natural size (the ragdoll is built for it).
    if (on && contestant(s, selfId)?.role === ROLE_IT && !ctx.character.ragdolling) mine = JUGGERNAUT.scale
    ctx.weapons.handicap = mine > 1 ? JUGGERNAUT.speed : 1
    if (fx.scale !== mine) {
      const near = Math.abs(mine - fx.scale) < 0.004 || ctx.character.ragdolling
      fx.scale = near ? mine : fx.scale + (mine - fx.scale) * (1 - Math.exp(-GROW_RATE * dt))
      ctx.character.root.scale.setScalar(fx.scale)
      ctx.cameraRig.bodyScale = fx.scale
    }
    // The wider, taller body is kept out of walls (the controller only knows the usual capsule).
    const p = ctx.player
    if (fx.scale > 1 && p.controlEnabled) ctx.collision.pushOut(p.position, p.radius * fx.scale, p.height * fx.scale, p.grounded ? MOVE.stepUp : MOVE.airStepUp, _push)
  }

  /* ── mode moments ────────────────────────────────────────── */

  private infectionEvents(s: RoundState, me: Contestant): void {
    const a = this.applied
    let sick = 0
    for (const p of s.players) if (p.role === ROLE_IT) sick++
    const left = s.players.length - sick
    if (a.sick >= 0 && sick > a.sick) {
      this.cue('infect')
      if (me.role === ROLE_IT && a.role !== ROLE_IT) this.stagger()
      if (left === 1 && s.players.length > 2) {
        const last = s.players.find(p => p.role !== ROLE_IT)
        this.cue('last')
        if (last) this.toast(last.id === me.id ? 'You are the last survivor!' : `${last.name} is the last survivor`, last.id === me.id ? 'Hold out until the clock runs down.' : 'Hunt them down.')
      }
    }
    a.sick = sick
  }

  /** Just infected: a jolt, a green puff and a moment unable to act before joining the horde. */
  private stagger(): void {
    const ctx = this.ctx
    const p = ctx.player.position
    this.effects.staggerUntil = this.now() + STAGGER
    ctx.player.knock({ x: 0, y: 3.2, z: 0 }, false)
    ctx.fx.burst('poof', { x: p.x, y: p.y + 1, z: p.z }, { color: '#8cff4a', scale: 1.5 })
    ctx.game.shake(0.3, 0.3)
    this.toast('You are infected', 'Touch or strike the survivors to spread it.')
  }

  private juggernautEvents(s: RoundState, me: Contestant): void {
    const a = this.applied
    const jug = s.players.find(p => p.role === ROLE_IT)
    const id = jug?.id ?? ''
    if (id !== a.jug) {
      this.jugHp = this.jugMax()
      if (a.jug && jug) {
        this.cue('crown')
        this.toast(id === me.id ? 'You are the Juggernaut!' : `${jug.name} is the Juggernaut`, id === me.id ? 'Everyone is after you. Hit back hard.' : 'Bring them down to take the crown.')
      }
      a.jug = id
    }
    if (me.kos > a.kos) this.cue('ko')
  }

  private gunGameEvents(s: RoundState, me: Contestant): void {
    const a = this.applied
    const last = LADDER.length - 1
    let finalists = 0
    for (const p of s.players) if (p.score >= last) finalists++
    if (me.score > a.score) this.cue(me.score >= last ? 'final' : 'rung')
    else if (me.score < a.score) {
      this.cue('ko')
      this.toast('Knocked down a rung', 'Fists humble whoever they knock out.')
    }
    if (a.finalists >= 0 && finalists > a.finalists && me.score < last) {
      const first = s.players.find(p => p.score >= last)
      this.cue('final')
      if (first) this.toast(`${first.name} is on the last rung`, 'One knockout with their fists wins it. Stop them!')
    }
    a.finalists = finalists
  }

  private setFrozen(on: boolean): void {
    const ctx = this.ctx
    if (on) ctx.player.controlEnabled = false
    else if (this.effects.frozen && ctx.game.phase === 'playing') ctx.player.controlEnabled = true
    this.effects.frozen = on
  }

  private place(spot: Spot): void {
    const ctx = this.ctx
    if (ctx.character.ragdolling) ctx.character.cancelRagdoll()
    const y = ctx.collision.groundAt(spot.x, spot.z, spot.y + 2, ctx.player.radius).y
    ctx.player.teleport(spot.x, Number.isFinite(y) ? y : spot.y, spot.z, spot.yaw)
    ctx.cameraRig.snapBehind()
  }

  /* ── UI ──────────────────────────────────────────────────── */

  private makeView(): ModeView {
    const s = this.state
    const me = this.me()
    const h = this.health
    const host = this.hostId === this.link.selfId ? null : this.link.peers().find(p => p.id === this.hostId)
    const jugOn = s.mode === 'juggernaut' && s.phase === 'live'
    return {
      round: { ...s, players: s.players.map(p => ({ ...p })), podium: s.podium.slice() },
      left: Math.ceil(s.left),
      hold: Math.ceil(s.hold),
      isHost: this.isHost(),
      hostName: host?.name ?? (this.hostId ? this.link.selfName() : ''),
      selfId: this.link.selfId,
      me: me ? { ...me } : null,
      health: h.active ? { hp: Math.ceil(h.hp), max: h.max, shield: h.shield, down: h.down } : null,
      jug: jugOn ? { hp: me?.role === ROLE_IT && h.active ? Math.ceil(h.hp) : Math.ceil(this.jugHp), max: this.jugMax() } : null,
    }
  }

  /** Emits a new view when something the UI shows changed (scores at most once a second). */
  private publish(force: boolean): void {
    const s = this.state
    const h = this.health
    const vitals = h.active ? `${Math.ceil(h.hp)}|${h.max}|${Math.ceil(h.shield * 2)}|${h.down}` : ''
    const key = `${s.seq}|${s.round}|${s.phase}|${Math.ceil(s.left)}|${Math.ceil(s.hold)}|${this.hostId}|${this.isHost()}|${vitals}|${Math.ceil(this.jugHp)}`
    if (!force && key === this.viewKey) return
    this.viewKey = key
    this.view = this.makeView()
    this.ctx.bus.emit('mode:view', this.view)
  }
}
