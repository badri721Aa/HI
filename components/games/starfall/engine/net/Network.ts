/**
 * Online multiplayer: rooms, presence, chat, emotes and replicated players.
 *
 * - Supabase Realtime carries the low-rate traffic: room presence, the public
 *   room lobby, chat, emotes, ragdoll events, block edits (paced by Building),
 *   WebRTC signalling and a ≤ 4 Hz movement relay for peers without a direct
 *   link (see Room.ts).
 * - Movement goes peer-to-peer at 20 Hz (2 Hz idle) over unreliable WebRTC
 *   data channels (p2p.ts), as compact 40-byte binary packets (protocol.ts).
 * - A ragdolling body streams its pose while it lasts (ragdollSync.ts); every
 *   move (swing, slam, bow draw and release, fist spin, dash) is announced as it
 *   starts, on the data channels and once over the relay.
 * - Other players are smoothed (RemotePeer.ts) and drawn as tinted, animated
 *   copies of the hero with name tags, playing the same moves and effects
 *   (RemotePlayers.ts, remoteMoves.ts). With pvp on, blows shove them (pvp.ts).
 *
 * Progress stays per player; only the world is shared. Nothing here throws
 * from update(); failures surface as `net:status` events.
 */
import * as THREE from 'three'
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js'
import type { BlockMsg } from '../build/blocks'
import type { V3, WeaponId } from '../events'
import { KIND } from '../gameplay/weapons/defs'
import type { Ctx, GestureName, ICharacter, INetwork, NetPeer, NetStatus, RoomInfo, WeaponHit } from '../types'
import {
  CHAT_BURST, CHAT_REFILL, CODE_ALPHABET, CODE_LENGTH, LOBBY_CHANNEL, MAX_PLAYERS, P2P_RATE_ACTIVE, P2P_RATE_IDLE,
  PROFILE_KEY, PUBLIC_ROOMS, RELAY_DELIVERIES, RELAY_RATE_ACTIVE, RELAY_RATE_IDLE, SUPABASE_KEY, SUPABASE_URL,
} from './config'
import {
  ACTION_BYTES, Bucket, FLAG_ACTIVE, FLAG_AWAY, FLAG_GROUNDED, FLAG_RAGDOLL, STATE_BYTES, defaultColor, defaultName,
  encodeAction, encodeState, isEmote, makeAction, makeSnapshot, normalizeRoomCode, randomId, sanitizeChat,
  sanitizeColor, sanitizeName, stateCode, toBase64, toRelay, weaponCode, type ActionName, type MemberInfo,
} from './protocol'
import { Pvp } from './pvp'
import { RagdollSender } from './ragdollSync'
import { RemotePlayers } from './RemotePlayers'
import { JoinError, Room, type RoomHost } from './Room'
import { mapCode } from '../worlds/defs'

/** Keep a lobby subscription opened for listing alive this long after the last request (s). */
const LOBBY_LINGER = 30
const LOBBY_TIMEOUT = 12000
/** The lobby's first presence snapshot is often empty and fills in a moment later: wait this long (ms) unless people show up sooner. */
const LOBBY_SYNC_WAIT = 3000

type Profile = { name: string; color: string }

const PUBLIC_BY_CODE = new Map(PUBLIC_ROOMS.map(r => [r.code, r]))

function loadProfile(): Profile {
  let name = ''
  let color: string | null = null
  try {
    const raw = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null') as Partial<Profile> | null
    name = sanitizeName(raw?.name)
    color = sanitizeColor(raw?.color)
  } catch {
    /* storage blocked or corrupt */
  }
  const p = { name: name || defaultName(), color: color ?? defaultColor() }
  if (!name || !color) storeProfile(p)
  return p
}

function storeProfile(p: Profile): void {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p))
  } catch {
    /* storage blocked */
  }
}

function roomInfo(code: string, players: number): RoomInfo {
  const pub = PUBLIC_BY_CODE.get(code)
  return pub
    ? { code: pub.code, name: pub.name, public: true, players, max: MAX_PLAYERS }
    : { code: code.toUpperCase(), name: `Room ${code.toUpperCase()}`, public: false, players, max: MAX_PLAYERS }
}

function privateCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH)
  crypto.getRandomValues(bytes)
  let s = ''
  for (const b of bytes) s += CODE_ALPHABET[b % CODE_ALPHABET.length]
  return s
}

export class Network implements INetwork {
  status: NetStatus = 'offline'
  room: RoomInfo | null = null
  readonly selfId = randomId(12)
  readonly peers = new Map<string, NetPeer>()
  profile: Profile

  private client: SupabaseClient | null = null
  private session: Room | null = null
  /** The join in progress (a second identical join() shares it). */
  private pending: { code: string; create: boolean; promise: Promise<void> } | null = null
  /** Increments on every join/leave so stale async continuations can bail out. */
  private epoch = 0
  private joinedAt = 0
  private remotes: RemotePlayers
  private t0 = performance.now() / 1000

  // lobby (public room counts)
  private lobby: RealtimeChannel | null = null
  private lobbyReady: Promise<void> | null = null
  private lobbyUntil = 0
  private lobbyRoom: string | null = null
  private lobbyEpoch = 0
  /** Rejects the lobby subscription still in progress (when the lobby is closed meanwhile). */
  private lobbyAbort: ((err: Error) => void) | null = null

  // local state stream
  private snap = makeSnapshot()
  private anchor = new THREE.Vector3()
  private still = new THREE.Vector3()
  private packet = new DataView(new ArrayBuffer(STATE_BYTES))
  private lastDirect = -1
  private lastRelay = -1
  private lastChange = -1
  private lastState = -1
  private lastFlags = -1
  private lastWeapon = -1
  private lastMap = -1
  private lastYaw = 0
  private lastX = 0
  private lastY = 0
  private lastZ = 0
  private wasActive = false
  private wasRagdoll = false
  private lastRagSent = -10
  private ragdoll: RagdollSender
  private action = makeAction()
  private actionPacket = new DataView(new ArrayBuffer(ACTION_BYTES))
  private actionSeq = 0
  private pvpRules: Pvp
  private unsubs: Array<() => void> = []
  private chatBucket = new Bucket(CHAT_BURST, CHAT_REFILL)
  private emoteBucket = new Bucket(3, 2)
  private retrackTimer: ReturnType<typeof setTimeout> | null = null
  private failedUpdate = false
  private lastUpdate = 0
  private disposed = false
  /**
   * Channel removals still in flight. realtime-js hands back the existing channel for a topic until
   * its removal completes, so new channels are only created once these have settled.
   */
  private draining: Promise<unknown> = Promise.resolve()

  private onOffline = () => {
    if (this.session) this.setStatus('connecting', 'Waiting for the network…')
  }
  private onPageHide = () => {
    // Leave right away so the others see us go (closing the socket drops presence).
    for (const p of this.session?.list ?? []) p.link?.close()
    this.client?.realtime.disconnect()
  }
  /** Tab hidden: frames stop, so tell the others now that we are away (Game pauses first). */
  private onVisibility = () => {
    const room = this.session
    if (!document.hidden || !room?.online) return
    this.lastDirect = this.lastRelay = -1
    this.stream(this.now(), room)
  }
  /** Back from the back/forward cache: the socket was closed on pagehide, so join again. */
  private onPageShow = (e: PageTransitionEvent) => {
    const code = this.session?.code
    if (!e.persisted || !code) return
    void this.leave()
      .then(() => this.join(code))
      .catch(() => {})
  }

  constructor(private ctx: Ctx) {
    this.profile = loadProfile()
    this.remotes = new RemotePlayers(ctx)
    this.ragdoll = new RagdollSender(this.selfId)
    this.pvpRules = new Pvp(ctx)
  }

  init(): void {
    // Our moves, announced to the others as they start.
    const bus = this.ctx.bus
    const held = (): WeaponId => this.ctx.weapons?.equipped ?? 'fists'
    this.unsubs.push(
      bus.on('weapon:swing', e => this.sendAction(KIND[e.weapon] === 'hammer' ? 'slam' : 'slash', e.weapon, e.pos, e.combo)),
      bus.on('weapon:draw', e => this.sendAction('draw', held(), e.pos)),
      bus.on('weapon:fire', e => this.sendAction('release', held(), e.pos, 0, e.charge, e.vel)),
      bus.on('player:attack', e => this.sendAction('spin', held(), e.pos)),
      bus.on('player:dash', e => this.sendAction('dash', held(), e.pos, 0, 0, e.dir)),
      bus.on('player:land', e => this.ragdoll.noteImpact(e.impact)),
    )
    window.addEventListener('offline', this.onOffline)
    window.addEventListener('pagehide', this.onPageHide)
    window.addEventListener('pageshow', this.onPageShow)
    document.addEventListener('visibilitychange', this.onVisibility)
  }

  /* ── public API ──────────────────────────────────────────── */

  setProfile(p: Partial<{ name: string; color: string }>): void {
    const name = p.name !== undefined ? sanitizeName(p.name) : ''
    const color = p.color !== undefined ? sanitizeColor(p.color) : null
    const next = { name: name || this.profile.name, color: color ?? this.profile.color }
    if (next.name === this.profile.name && next.color === this.profile.color) return
    this.profile = next
    storeProfile(next)
    // Debounced: typing a name shouldn't flood presence updates.
    if (this.retrackTimer) clearTimeout(this.retrackTimer)
    this.retrackTimer = setTimeout(() => {
      this.retrackTimer = null
      this.session?.retrack()
    }, 600)
  }

  async listPublicRooms(): Promise<RoomInfo[]> {
    const counts = new Map<string, number>()
    // Set before subscribing: update() closes an idle lobby once this has passed.
    this.lobbyUntil = Math.max(this.lobbyUntil, this.now() + LOBBY_LINGER)
    try {
      await this.ensureLobby()
      const state = this.lobby?.presenceState() as Record<string, Array<{ room?: unknown }>> | undefined
      for (const metas of Object.values(state ?? {})) {
        const room = Array.isArray(metas) ? metas[metas.length - 1]?.room : undefined
        if (typeof room === 'string' && PUBLIC_BY_CODE.has(room)) counts.set(room, (counts.get(room) ?? 0) + 1)
      }
    } catch (err) {
      if (!this.session) throw err
    }
    // Our own room's presence is exact; the lobby may lag behind it.
    if (this.session && PUBLIC_BY_CODE.has(this.session.code)) {
      counts.set(this.session.code, Math.max(counts.get(this.session.code) ?? 0, this.session.players))
    }
    return PUBLIC_ROOMS.map(r => roomInfo(r.code, Math.min(MAX_PLAYERS, counts.get(r.code) ?? 0)))
  }

  join(code: string, opts?: { create?: boolean }): Promise<void> {
    const c = normalizeRoomCode(code)
    if (!c) return Promise.reject(new Error('Room codes are 3 to 12 letters or digits'))
    const create = opts?.create !== false
    if (this.pending?.code === c && this.pending.create === create) return this.pending.promise
    if (this.session?.code === c && this.status === 'online') return Promise.resolve()
    const promise = this.connect(c, create).finally(() => {
      if (this.pending?.promise === promise) this.pending = null
    })
    this.pending = { code: c, create, promise }
    return promise
  }

  private async connect(c: string, create: boolean): Promise<void> {
    // leave() bumps the epoch synchronously: any later join/leave makes this one stale.
    const left = this.leave()
    const epoch = this.epoch
    await left
    await this.draining
    if (epoch !== this.epoch) throw new Error('Join cancelled')
    if (this.disposed) throw new Error('Online play has shut down')
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.setStatus('offline', 'You appear to be offline')
      throw new Error('You appear to be offline')
    }
    const client = this.getClient()
    const room: Room = new Room(client, c, this.roomHost(() => this.session === room))
    this.session = room
    this.joinedAt = Date.now()
    this.setStatus('connecting', 'Joining room…')
    try {
      await room.connect(!create)
    } catch (err) {
      this.retire(room.leave())
      if (epoch === this.epoch) {
        this.session = null
        this.clearPeers()
        // A mistyped code is not a connection problem.
        if (err instanceof JoinError && err.reason === 'missing') this.setStatus('offline')
        else this.setStatus('error', (err as Error).message || 'Could not join the room')
      }
      throw err instanceof Error ? err : new Error(String(err))
    }
    if (epoch !== this.epoch) {
      this.retire(room.leave())
      throw new Error('Join cancelled')
    }
    this.room = roomInfo(c, room.players)
    this.lastDirect = this.lastRelay = -1
    this.setStatus('online')
    this.ctx.bus.emit('net:room', { ...this.room })
    this.system(`You joined ${this.room.name}${room.list.length ? ` — ${room.players} players here` : ''}`)
    if (this.room.public) void this.trackLobby(c)
  }

  async quickJoin(): Promise<void> {
    let target = PUBLIC_ROOMS[0].code
    try {
      const rooms = await this.listPublicRooms()
      let best = -1
      for (const r of rooms) {
        if (r.players < r.max && r.players > best) {
          best = r.players
          target = r.code
        }
      }
    } catch {
      /* the join below reports the connection problem */
    }
    await this.join(target)
  }

  async createPrivate(): Promise<string> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const code = privateCode()
      await this.join(code)
      if (this.session && this.session.list.length === 0) return code
      // Someone is already using this code — pick another.
      await this.leave()
    }
    throw new Error('Could not create a room. Try again.')
  }

  async leave(): Promise<void> {
    this.epoch++
    this.pending = null
    const room = this.session
    if (this.retrackTimer) clearTimeout(this.retrackTimer)
    this.retrackTimer = null
    if (!room) {
      if (this.status !== 'offline') this.setStatus('offline')
      return
    }
    this.session = null
    const wasIn = this.room !== null
    this.room = null
    this.pvpRules.on = false
    this.clearPeers()
    this.untrackLobby()
    this.setStatus('offline')
    if (wasIn) this.ctx.bus.emit('net:room', null)
    const done = room.leave()
    this.retire(done)
    await done
  }

  sendChat(text: string): void {
    const clean = sanitizeChat(text)
    if (!clean) return
    const room = this.session
    if (!room || !room.online) {
      this.system('You are not connected to a room')
      return
    }
    if (!this.chatBucket.take(this.now())) {
      this.system('Please wait a moment between messages')
      return
    }
    room.send('chat', { from: this.selfId, text: clean })
    this.ctx.bus.emit('net:chat', { id: this.selfId, name: this.profile.name, color: this.profile.color, text: clean })
  }

  sendEmote(name: GestureName): void {
    const room = this.session
    if (!room?.online || !isEmote(name) || !this.emoteBucket.take(this.now())) return
    room.send('emote', { from: this.selfId, name })
  }

  sendBlocks(msg: BlockMsg, to?: string): boolean {
    const room = this.session
    if (!room?.online) return false
    return room.send('blk', to ? { from: this.selfId, op: msg.op, b: msg.cells, to } : { from: this.selfId, op: msg.op, b: msg.cells })
  }

  get pvp(): boolean {
    return this.pvpRules.on
  }

  setPvp(on: boolean): void {
    this.pvpRules.on = on
  }

  strike(blow: WeaponHit, power: number): number {
    const room = this.session
    return room ? this.pvpRules.strike(room, blow, power, this.now()) : 0
  }

  /* ── frame ───────────────────────────────────────────────── */

  update(dt: number): void {
    try {
      const now = this.now()
      // Other players live in wall-clock time (they keep moving while we are paused or slow),
      // so smoothing uses real elapsed time rather than the clamped game step.
      const realDt = this.lastUpdate > 0 ? Math.min(0.25, Math.max(0, now - this.lastUpdate)) : dt
      this.lastUpdate = now
      const room = this.session
      if (room?.online) {
        room.update(now)
        this.stream(now, room)
      }
      if (room) {
        for (let i = 0; i < room.list.length; i++) room.list[i].update(realDt, now)
        this.remotes.update(realDt, room.list)
      }
      if (this.lobby && !this.lobbyRoom && now > this.lobbyUntil) this.closeLobby()
    } catch (err) {
      if (!this.failedUpdate) console.error('[starfall] network update failed', err)
      this.failedUpdate = true
    }
  }

  dispose(): void {
    this.disposed = true
    for (const off of this.unsubs) off()
    this.unsubs = []
    window.removeEventListener('offline', this.onOffline)
    window.removeEventListener('pagehide', this.onPageHide)
    window.removeEventListener('pageshow', this.onPageShow)
    document.removeEventListener('visibilitychange', this.onVisibility)
    void this.leave()
    this.closeLobby()
    this.remotes.dispose()
    const client = this.client
    this.client = null
    if (client) void client.removeAllChannels().finally(() => client.realtime.disconnect())
  }

  /* ── internals ───────────────────────────────────────────── */

  /** Callbacks for one room; they go quiet once that room is no longer the current session. */
  private roomHost(isCurrent: () => boolean): RoomHost {
    return {
      selfId: this.selfId,
      member: () => this.member(),
      now: () => this.now(),
      peerJoined: (peer, initial) => {
        if (!isCurrent()) return
        this.peers.set(peer.id, peer)
        this.remotes.preload()
        this.ctx.bus.emit('net:peer', { id: peer.id, name: peer.name, joined: true })
        // Presence is eventually consistent: someone already here may only show up after our join.
        if (!initial) this.system(peer.joinedAt < this.joinedAt ? `${peer.name} is here` : `${peer.name} joined`)
      },
      peerLeft: peer => {
        if (!isCurrent()) return
        this.peers.delete(peer.id)
        this.remotes.remove(peer.id)
        this.ctx.bus.emit('net:peer', { id: peer.id, name: peer.name, joined: false })
        this.system(`${peer.name} left`)
      },
      peerChanged: peer => {
        if (isCurrent()) this.remotes.refresh(peer.id)
      },
      chat: (peer, text) => {
        if (!isCurrent()) return
        this.remotes.say(peer.id, text)
        this.ctx.bus.emit('net:chat', { id: peer.id, name: peer.name, color: peer.color, text })
      },
      emote: (peer, name) => {
        if (isCurrent()) this.remotes.gesture(peer.id, name)
      },
      ragdoll: (peer, v) => {
        if (isCurrent()) this.remotes.flop(peer.id, v)
      },
      ragdollFrame: (peer, f) => {
        if (isCurrent()) peer.body.push(f)
      },
      action: (peer, a) => {
        if (isCurrent()) this.remotes.action(peer.id, a, peer.age(a.t, this.now()))
      },
      hit: (peer, h) => {
        if (isCurrent()) this.pvpRules.receive(peer, h, this.now())
      },
      blocks: (peer, msg) => {
        if (isCurrent()) this.ctx.bus.emit('net:blocks', { id: peer.id, ...msg })
      },
      count: players => {
        if (isCurrent()) this.setCount(players)
      },
      connection: (state, message) => {
        if (isCurrent()) this.setStatus(state, message)
      },
      evicted: () => {
        if (!isCurrent()) return
        void this.leave().then(() => this.setStatus('error', 'Room is full'))
        this.ctx.bus.emit('ui:toast', { kind: 'warning', title: 'Room is full', body: 'The last place was taken, so you are playing solo.' })
      },
    }
  }

  private now(): number {
    return performance.now() / 1000
  }

  private member(): MemberInfo {
    return { name: this.profile.name, color: this.profile.color, joinedAt: this.joinedAt }
  }

  private getClient(): SupabaseClient {
    if (!this.client) {
      this.client = createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'starfall-net-auth' },
      })
    }
    return this.client
  }

  /** Remembers a channel removal so the next channel on that topic waits for it. */
  private retire(removal: Promise<unknown>): void {
    const settled = removal.catch(() => {})
    this.draining = Promise.all([this.draining, settled])
  }

  private setStatus(status: NetStatus, message?: string): void {
    this.status = status
    this.ctx.bus.emit('net:status', message ? { status, message } : { status })
  }

  private setCount(players: number): void {
    if (!this.room || this.room.players === players) return
    this.room = { ...this.room, players }
    this.ctx.bus.emit('net:room', { ...this.room })
  }

  private system(text: string): void {
    this.ctx.bus.emit('net:chat', { id: 'system', name: '', color: '', text, system: true })
  }

  private clearPeers(): void {
    this.peers.clear()
    this.remotes.clear()
  }

  /** Samples the local player and sends it: P2P at 20/2 Hz, relay at 4/0.5 Hz when someone needs it. */
  private stream(now: number, room: Room): void {
    const ctx = this.ctx
    const p = ctx.player
    if (!p || !room.list.length) {
      this.wasRagdoll = false
      return
    }
    let pos: THREE.Vector3 = p.position
    let v: THREE.Vector3 = p.velocity
    // The character may still be gaining ragdoll support: probe its members defensively.
    const ch = ctx.character as Partial<ICharacter> | undefined
    const ragdoll = ch?.ragdolling === true || p.state === 'ragdoll'
    if (ragdoll && typeof ch?.getRagdollAnchor === 'function') {
      // While limp, the body (not the capsule) is what others should see.
      const a = ch.getRagdollAnchor(this.anchor)
      if (Number.isFinite(a.x + a.y + a.z)) {
        pos = a
        v = this.still
      }
    }
    if (!Number.isFinite(pos.x + pos.y + pos.z + v.x + v.y + v.z + p.yaw)) return
    const phase = ctx.game.phase
    const away = phase === 'title' || phase === 'paused' || phase === 'victory'
    const s = this.snap
    s.t = now - this.t0
    s.x = pos.x
    s.y = pos.y
    s.z = pos.z
    s.yaw = p.yaw
    s.vx = v.x
    s.vy = v.y
    s.vz = v.z
    s.state = stateCode(ragdoll ? 'ragdoll' : p.state)
    s.wading = p.motion?.wading ?? 0
    s.slope = p.motion?.slope ?? 0
    s.weapon = weaponCode(ctx.weapons?.equipped ?? 'fists')
    s.map = mapCode(ctx.worlds?.current ?? 'isle')
    const wp = ctx.weapons?.pose
    s.draw = wp?.move === 'draw' ? wp.charge : -1

    // Moving platforms carry the player with zero velocity, so position changes count too.
    const dx = pos.x - this.lastX
    const dy = pos.y - this.lastY
    const dz = pos.z - this.lastZ
    this.lastX = pos.x
    this.lastY = pos.y
    this.lastZ = pos.z
    const moving = v.x * v.x + v.z * v.z > 0.01 || Math.abs(v.y) > 0.05 || !p.grounded || dx * dx + dy * dy + dz * dz > 1e-6
    const baseFlags = (p.grounded || ragdoll ? FLAG_GROUNDED : 0) | (ragdoll ? FLAG_RAGDOLL : 0) | (away ? FLAG_AWAY : 0)
    const turned = Math.abs(Math.atan2(Math.sin(s.yaw - this.lastYaw), Math.cos(s.yaw - this.lastYaw))) > 0.02
    if (moving || turned || s.draw >= 0 || s.state !== this.lastState || baseFlags !== this.lastFlags || s.weapon !== this.lastWeapon || s.map !== this.lastMap) this.lastChange = now
    this.lastWeapon = s.weapon
    this.lastMap = s.map
    this.lastState = s.state
    this.lastFlags = baseFlags
    this.lastYaw = s.yaw
    const active = now - this.lastChange < 0.3
    s.flags = baseFlags | (active ? FLAG_ACTIVE : 0)
    // Starting and stopping go out at once (the idle rates are slow, and the last moving packet may be stale).
    const burst = active !== this.wasActive
    this.wasActive = active

    if (burst || now - this.lastDirect >= 1 / (active ? P2P_RATE_ACTIVE : P2P_RATE_IDLE)) {
      this.lastDirect = now
      encodeState(this.packet, s)
      room.sendDirect(this.packet.buffer as ArrayBuffer)
    }
    const relayRate = active ? Math.min(RELAY_RATE_ACTIVE, RELAY_DELIVERIES / room.players) : RELAY_RATE_IDLE
    if (room.relayNow || ((burst || now - this.lastRelay >= 1 / relayRate) && room.needsRelay(now))) {
      room.relayNow = false
      this.lastRelay = now
      room.send('pos', toRelay(this.selfId, s))
    }

    // Ragdoll replication: one event on entering, carrying our momentum.
    if (ragdoll && !this.wasRagdoll && now - this.lastRagSent > 1) {
      this.lastRagSent = now
      const m = p.velocity
      const r2 = (x: number) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : 0)
      room.send('rag', { from: this.selfId, v: [r2(m.x), r2(m.y), r2(m.z)] })
    }
    this.wasRagdoll = ragdoll
    if (ch?.getRagdollBody) this.ragdoll.update(ch as ICharacter, room, now, s.t)
    this.pvpRules.updateSpin(room, now)
  }

  /** Announces a move we just started: on the data channels, and once over the relay as a backup. */
  private sendAction(action: ActionName, weapon: WeaponId, pos: V3, combo = 0, charge = 0, v?: V3): void {
    const room = this.session
    if (!room?.online || !room.list.length) return
    const a = this.action
    a.seq = this.actionSeq = (this.actionSeq + 1) & 0xffff
    a.t = this.now() - this.t0
    a.action = action
    a.weapon = weapon
    a.combo = combo
    a.charge = charge
    a.x = pos.x
    a.y = pos.y
    a.z = pos.z
    a.vx = v?.x ?? 0
    a.vy = v?.y ?? 0
    a.vz = v?.z ?? 0
    a.yaw = this.ctx.player?.yaw ?? 0
    if (!Number.isFinite(a.x + a.y + a.z + a.vx + a.vy + a.vz + a.yaw)) return
    encodeAction(this.actionPacket, a)
    const data = this.actionPacket.buffer as ArrayBuffer
    room.sendDirect(data)
    room.send('bin', { from: this.selfId, d: toBase64(data) })
  }

  /* ── lobby (public room counts) ─────────────────────────── */

  private ensureLobby(): Promise<void> {
    if (this.lobbyReady) return this.lobbyReady
    if (this.disposed) return Promise.reject(new Error('Online play has shut down'))
    const epoch = this.lobbyEpoch
    const ready = this.draining.then(() => {
      if (epoch !== this.lobbyEpoch || this.disposed) throw new Error('Lobby closed')
      return this.openLobby(epoch)
    })
    this.lobbyReady = ready
    ready.catch(() => {
      if (this.lobbyReady === ready) this.closeLobby()
    })
    return ready
  }

  /** Subscribes to the lobby; resolves once its presence is known (or after a short grace). */
  private openLobby(epoch: number): Promise<void> {
    const ch = this.getClient().channel(LOBBY_CHANNEL, { config: { presence: { key: this.selfId } } })
    this.lobby = ch
    return new Promise<void>((resolve, reject) => {
      let subscribed = false
      let settled = false
      const finish = (err?: Error) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        if (this.lobbyAbort === finish) this.lobbyAbort = null
        if (err) reject(err)
        else resolve()
      }
      const timeout = setTimeout(
        () => finish(new Error('Could not reach the game server. Check your connection and try again.')),
        LOBBY_TIMEOUT,
      )
      this.lobbyAbort = finish
      const occupied = () => Object.keys(ch.presenceState()).length > 0
      ch.on('presence', { event: 'sync' }, () => {
        if (subscribed && occupied()) finish()
      })
      ch.subscribe(status => {
        if (status !== 'SUBSCRIBED' || epoch !== this.lobbyEpoch) return
        subscribed = true
        if (occupied()) finish()
        else setTimeout(() => finish(), LOBBY_SYNC_WAIT)
        // (Re)announce our public room — also after the socket reconnects.
        if (this.lobbyRoom) void ch.track({ room: this.lobbyRoom }).catch(() => {})
      })
    })
  }

  /** While in a public room we keep the room's lobby count current. */
  private async trackLobby(code: string): Promise<void> {
    this.lobbyRoom = code
    try {
      await this.ensureLobby()
      if (this.lobbyRoom === code) await this.lobby?.track({ room: code })
    } catch {
      /* counts are cosmetic */
    }
  }

  private untrackLobby(): void {
    if (!this.lobbyRoom) return
    this.lobbyRoom = null
    void this.lobby?.untrack().catch(() => {})
    this.lobbyUntil = this.now() + 5
  }

  private closeLobby(): void {
    this.lobbyEpoch++
    const abort = this.lobbyAbort
    this.lobbyAbort = null
    abort?.(new Error('Lobby closed'))
    const ch = this.lobby
    this.lobby = null
    this.lobbyReady = null
    if (ch && this.client) this.retire(this.client.removeChannel(ch))
  }
}
