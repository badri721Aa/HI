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
 * Locally every player applies what the state says about them: teleport to a start
 * point, a frozen countdown, pvp on during play, the borrowed hammer in Knockout, the
 * seeker's blindfold, respawning on the arena or at the last ring, and the sounds.
 */
import * as THREE from 'three'
import type { Ctx } from '../../types'
import type { ZoneKit } from '../../world/zones/kit'
import type { RemotePeer } from '../RemotePeer'
import { buildArena } from './arena'
import {
  ARENA_FALL, contestant, idleState, isModeId, ISLAND_RETURN, MODE_BY_ID, packRound, parseRound, RINGS, ROLE_IT, ROLE_OUT, startSpot,
  type Contestant, type ModeId, type RoundState, type Spot,
} from './defs'
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
}

export type ModeCue = 'count' | 'go' | 'end' | 'win' | 'tag' | 'ko' | 'ring' | 'point' | 'move' | 'suggest'

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
}

/** Players who joined less than this long ago (ms) can't be elected host yet. */
const SETTLE_MS = 4000
const HEARTBEAT = 1
/** Suggestions accepted per player at most this often (s). */
const SUGGEST_GAP = 8

const _self = new THREE.Vector3()

export class Modes {
  view: ModeView
  private state = idleState()
  private referee = new Referee()
  private markers: ModeMarkers
  private arena: ZoneKit | null = null
  private hostId = ''
  private wasHost = false
  private lastSent = -Infinity
  private viewKey = ''
  private suggestedAt = new Map<string, number>()
  private mySuggestAt = -Infinity
  /** What has been applied locally (diffed against the state every frame). */
  private applied = { round: 0, phase: 'idle', role: 0, lives: 0, score: 0, hill: -1, count: 0 }
  private effects = { frozen: false, pvp: false, hammer: false }

  constructor(
    private ctx: Ctx,
    private link: ModeLink,
  ) {
    this.markers = new ModeMarkers(ctx)
    this.view = this.makeView()
  }

  /** We are playing in a round (its countdown or live part). */
  get active(): boolean {
    const s = this.state
    return (s.phase === 'countdown' || s.phase === 'live') && this.me() !== null
  }

  /** Host: start a round (false when not the host, a round is running or too few players). */
  start(mode: ModeId): boolean {
    if (!this.isHost() || !isModeId(mode)) return false
    if (this.state.phase === 'countdown' || this.state.phase === 'live') return false
    const entrants = this.entrants()
    if (entrants.length < MODE_BY_ID[mode].minPlayers) return false
    this.referee.start(this.state, mode, entrants)
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
    }
  }

  /** Where to respawn during a round (Knockout: the arena or, when out, the island; Race: the last ring), else null. */
  spawnPoint(): Spot | null {
    const s = this.state
    const me = this.me()
    if (!me || (s.phase !== 'live' && s.phase !== 'countdown')) return null
    if (s.mode === 'knockout') return me.role === ROLE_OUT ? ISLAND_RETURN(me.slot) : startSpot('knockout', me.slot, s.players.length)
    if (s.mode === 'race') {
      if (me.score === 0) return startSpot('race', me.slot, s.players.length)
      const r = RINGS[Math.min(me.score, RINGS.length) - 1]
      return { x: r.x, y: r.y - 1.6, z: r.z, yaw: r.yaw }
    }
    return null
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
    this.applyLocal()
    this.markers.update(dt, this.state, this.link.selfId, this.locate)
    this.publish(false)
  }

  /** Left the room: back to free roam. */
  reset(): void {
    this.state = idleState()
    this.hostId = ''
    this.wasHost = false
    this.suggestedAt.clear()
    this.applyLocal()
    this.publish(true)
  }

  dispose(): void {
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

  /** Everyone on the island right now (players in a portal world sit the round out). */
  private entrants(): Array<{ id: string; name: string }> {
    const list: Array<{ id: string; name: string }> = []
    if ((this.ctx.worlds?.current ?? 'isle') === 'isle') list.push({ id: this.link.selfId, name: this.link.selfName() })
    for (const p of this.link.peers()) if (p.ready && p.map === 'isle') list.push({ id: p.id, name: p.name })
    return list
  }

  private present = (id: string): boolean => id === this.link.selfId || this.link.peers().some(p => p.id === id)

  /** Feet position of a player as we see it (ours: the ragdoll's body while limp). */
  private locate = (id: string): THREE.Vector3 | null => {
    if (id === this.link.selfId) {
      if ((this.ctx.worlds?.current ?? 'isle') !== 'isle') return null
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
      if (p.id === id) return p.ready && !p.away && p.map === 'isle' ? p.position : null
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

  /* ── local effects ───────────────────────────────────────── */

  private me(): Contestant | null {
    return contestant(this.state, this.link.selfId)
  }

  private cue(cue: ModeCue): void {
    this.ctx.bus.emit('mode:cue', { cue })
  }

  private applyLocal(): void {
    const ctx = this.ctx
    const s = this.state
    const me = this.me()
    const a = this.applied
    const running = s.phase === 'countdown' || s.phase === 'live'

    if (s.mode === 'knockout' && s.phase !== 'idle' && !this.arena) this.arena = buildArena(ctx)

    if (me && running && s.round !== a.round) {
      // A round with us in it: to the start line (unless we arrive while it's already on).
      a.round = s.round
      a.role = me.role
      a.lives = me.lives
      a.score = me.score
      a.count = 0
      if (s.phase === 'countdown' && s.mode) this.place(startSpot(s.mode, me.slot, s.players.length))
    }
    if (me && s.round === a.round) {
      if (s.phase === 'countdown') {
        const c = Math.ceil(s.left)
        if (c !== a.count && c >= 1) this.cue('count')
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
      }
      if (s.phase === 'results' && (a.phase === 'live' || a.phase === 'countdown')) {
        const rank = s.podium.indexOf(me.id)
        this.cue(rank >= 0 && rank < s.winners ? 'win' : 'end')
        if (s.mode === 'knockout') this.place(ISLAND_RETURN(me.slot))
      }
      a.role = me.role
      a.lives = me.lives
      a.score = me.score
    }
    a.phase = me ? s.phase : 'idle'
    a.hill = running && s.mode === 'koth' ? s.hill : -1

    // Lasting effects follow the state.
    const live = !!me && s.phase === 'live'
    const def = s.mode ? MODE_BY_ID[s.mode] : null
    this.setFrozen(!!me && (s.phase === 'countdown' || (live && s.mode === 'hide' && me.role === ROLE_IT && s.hold > 0)))
    const pvp = live && !!def?.pvp && me.role !== ROLE_OUT
    if (pvp !== this.effects.pvp) {
      this.effects.pvp = pvp
      this.link.setPvp(pvp)
    }
    const hammer = !!me && running && s.mode === 'knockout' && me.role !== ROLE_OUT
    if (hammer !== this.effects.hammer) {
      this.effects.hammer = hammer
      ctx.weapons.lend(hammer ? 'hammer' : null)
    }
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
    const host = this.hostId === this.link.selfId ? null : this.link.peers().find(p => p.id === this.hostId)
    return {
      round: { ...s, players: s.players.map(p => ({ ...p })), podium: s.podium.slice() },
      left: Math.ceil(s.left),
      hold: Math.ceil(s.hold),
      isHost: this.isHost(),
      hostName: host?.name ?? (this.hostId ? this.link.selfName() : ''),
      selfId: this.link.selfId,
      me: me ? { ...me } : null,
    }
  }

  /** Emits a new view when something the UI shows changed (scores at most once a second). */
  private publish(force: boolean): void {
    const s = this.state
    const key = `${s.seq}|${s.round}|${s.phase}|${Math.ceil(s.left)}|${Math.ceil(s.hold)}|${this.hostId}|${this.isHost()}`
    if (!force && key === this.viewKey) return
    this.viewKey = key
    this.view = this.makeView()
    this.ctx.bus.emit('mode:view', this.view)
  }
}
