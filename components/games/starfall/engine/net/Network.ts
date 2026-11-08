/**
 * Online multiplayer: rooms, presence, chat, emotes and replicated players.
 *
 * - Supabase Realtime carries the low-rate traffic: room presence, the public
 *   room lobby, chat, emotes, ragdoll events, WebRTC signalling and a 4 Hz
 *   movement relay for peers without a direct link (see Room.ts).
 * - Movement goes peer-to-peer at 20 Hz (2 Hz idle) over unreliable WebRTC
 *   data channels (p2p.ts), as compact 40-byte binary packets (protocol.ts).
 * - Other players are smoothed (RemotePeer.ts) and drawn as tinted, animated
 *   copies of the hero with name tags (RemotePlayers.ts).
 *
 * Progress stays per player; only the world is shared. Nothing here throws
 * from update(); failures surface as `net:status` events.
 */
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js'
import type { Ctx, GestureName, ICharacter, INetwork, NetPeer, NetStatus, RoomInfo } from '../types'
import {
  CHAT_BURST, CHAT_REFILL, CODE_ALPHABET, CODE_LENGTH, LOBBY_CHANNEL, MAX_PLAYERS, P2P_RATE_ACTIVE, P2P_RATE_IDLE,
  PROFILE_KEY, PUBLIC_ROOMS, RELAY_RATE_ACTIVE, RELAY_RATE_IDLE, SUPABASE_KEY, SUPABASE_URL,
} from './config'
import {
  Bucket, FLAG_ACTIVE, FLAG_AWAY, FLAG_GROUNDED, FLAG_RAGDOLL, RAGDOLL, STATE_BYTES, defaultColor, defaultName,
  encodeState, isEmote, makeSnapshot, normalizeRoomCode, randomId, sanitizeChat, sanitizeColor, sanitizeName,
  stateCode, toRelay, type MemberInfo,
} from './protocol'
import { RemotePlayers } from './RemotePlayers'
import { Room, type RoomHost } from './Room'

/** Keep a lobby subscription opened for listing alive this long after the last request (s). */
const LOBBY_LINGER = 30
const LOBBY_TIMEOUT = 8000
const LOBBY_SYNC_WAIT = 1500

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

  // local state stream
  private snap = makeSnapshot()
  private packet = new DataView(new ArrayBuffer(STATE_BYTES))
  private lastDirect = -1
  private lastRelay = -1
  private lastChange = -1
  private lastState = -1
  private lastFlags = -1
  private lastYaw = 0
  private wasActive = false
  private wasRagdoll = false
  private lastRagSent = -10
  private chatBucket = new Bucket(CHAT_BURST, CHAT_REFILL)
  private emoteBucket = new Bucket(3, 2)
  private retrackTimer: ReturnType<typeof setTimeout> | null = null
  private failedUpdate = false

  private onOffline = () => {
    if (this.session) this.setStatus('connecting', 'Waiting for the network…')
  }
  private onPageHide = () => {
    // Leave right away so the others see us go (closing the socket drops presence).
    for (const p of this.session?.list ?? []) p.link?.close()
    this.client?.realtime.disconnect()
  }

  private host: RoomHost = {
    selfId: this.selfId,
    member: () => this.member(),
    now: () => this.now(),
    peerJoined: (peer, initial) => {
      this.peers.set(peer.id, peer)
      this.remotes.preload()
      this.ctx.bus.emit('net:peer', { id: peer.id, name: peer.name, joined: true })
      if (!initial) this.system(`${peer.name} joined`)
    },
    peerLeft: peer => {
      this.peers.delete(peer.id)
      this.remotes.remove(peer.id)
      this.ctx.bus.emit('net:peer', { id: peer.id, name: peer.name, joined: false })
      this.system(`${peer.name} left`)
    },
    peerChanged: peer => this.remotes.refresh(peer.id),
    chat: (peer, text) => {
      this.remotes.say(peer.id, text)
      this.ctx.bus.emit('net:chat', { id: peer.id, name: peer.name, color: peer.color, text })
    },
    emote: (peer, name) => this.remotes.gesture(peer.id, name),
    ragdoll: (peer, v) => this.remotes.flop(peer.id, v),
    count: players => this.setCount(players),
    connection: (state, message) => this.setStatus(state, message),
    evicted: () => {
      void this.leave().then(() => this.setStatus('error', 'Room is full'))
    },
  }

  constructor(private ctx: Ctx) {
    this.profile = loadProfile()
    this.remotes = new RemotePlayers(ctx)
  }

  init(): void {
    window.addEventListener('offline', this.onOffline)
    window.addEventListener('pagehide', this.onPageHide)
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
    try {
      await this.ensureLobby()
      this.lobbyUntil = Math.max(this.lobbyUntil, this.now() + LOBBY_LINGER)
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

  async join(code: string): Promise<void> {
    const c = normalizeRoomCode(code)
    if (!c) throw new Error('Room codes are 3 to 12 letters or digits')
    if (this.session?.code === c && this.status !== 'error') return
    await this.leave()
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.setStatus('offline', 'You appear to be offline')
      throw new Error('You appear to be offline')
    }
    const epoch = ++this.epoch
    const client = this.getClient()
    const room = new Room(client, c, this.host)
    this.session = room
    this.joinedAt = Date.now()
    this.setStatus('connecting', 'Joining room…')
    try {
      await room.connect()
    } catch (err) {
      if (epoch === this.epoch) {
        this.session = null
        void room.leave()
        this.clearPeers()
        const msg = (err as Error).message || 'Could not join the room'
        this.setStatus('error', msg)
      } else void room.leave()
      throw err instanceof Error ? err : new Error(String(err))
    }
    if (epoch !== this.epoch) {
      void room.leave()
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
    this.clearPeers()
    this.untrackLobby()
    this.setStatus('offline')
    if (wasIn) this.ctx.bus.emit('net:room', null)
    await room.leave()
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
      this.system('Slow down a little — one message per second')
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

  /* ── frame ───────────────────────────────────────────────── */

  update(dt: number): void {
    try {
      const now = this.now()
      const room = this.session
      if (room?.online) {
        room.update(now)
        this.stream(now, room)
      }
      if (room) {
        for (let i = 0; i < room.list.length; i++) room.list[i].update(dt, now)
        this.remotes.update(dt, room.list)
      }
      if (this.lobby && !this.lobbyRoom && now > this.lobbyUntil) this.closeLobby()
    } catch (err) {
      if (!this.failedUpdate) console.error('[starfall] network update failed', err)
      this.failedUpdate = true
    }
  }

  dispose(): void {
    window.removeEventListener('offline', this.onOffline)
    window.removeEventListener('pagehide', this.onPageHide)
    void this.leave()
    this.closeLobby()
    this.remotes.dispose()
    const client = this.client
    this.client = null
    if (client) void client.removeAllChannels().finally(() => client.realtime.disconnect())
  }

  /* ── internals ───────────────────────────────────────────── */

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
        realtime: { params: { eventsPerSecond: 20 } },
      })
    }
    return this.client
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
    const pos = p.position
    const v = p.velocity
    if (!Number.isFinite(pos.x + pos.y + pos.z + v.x + v.y + v.z + p.yaw)) return

    const ch = ctx.character as ICharacter & { ragdolling?: boolean }
    const ragdoll = ch?.ragdolling === true || p.state === RAGDOLL
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
    s.state = stateCode(ragdoll ? RAGDOLL : p.state)
    s.wading = p.motion?.wading ?? 0
    s.slope = p.motion?.slope ?? 0

    const moving = v.x * v.x + v.z * v.z > 0.01 || Math.abs(v.y) > 0.05 || !p.grounded
    const baseFlags = (p.grounded ? FLAG_GROUNDED : 0) | (ragdoll ? FLAG_RAGDOLL : 0) | (away ? FLAG_AWAY : 0)
    const turned = Math.abs(Math.atan2(Math.sin(s.yaw - this.lastYaw), Math.cos(s.yaw - this.lastYaw))) > 0.02
    if (moving || turned || s.state !== this.lastState || baseFlags !== this.lastFlags) this.lastChange = now
    this.lastState = s.state
    this.lastFlags = baseFlags
    this.lastYaw = s.yaw
    const active = now - this.lastChange < 0.3
    s.flags = baseFlags | (active ? FLAG_ACTIVE : 0)
    const burst = active && !this.wasActive
    this.wasActive = active

    if (burst || now - this.lastDirect >= 1 / (active ? P2P_RATE_ACTIVE : P2P_RATE_IDLE)) {
      this.lastDirect = now
      encodeState(this.packet, s)
      room.sendDirect(this.packet.buffer as ArrayBuffer)
    }
    if (room.relayNow || ((burst || now - this.lastRelay >= 1 / (active ? RELAY_RATE_ACTIVE : RELAY_RATE_IDLE)) && room.needsRelay(now))) {
      room.relayNow = false
      this.lastRelay = now
      room.send('pos', toRelay(this.selfId, s))
    }

    // Ragdoll replication: one event on entering, carrying our momentum.
    if (ragdoll && !this.wasRagdoll && now - this.lastRagSent > 1) {
      this.lastRagSent = now
      room.send('rag', { from: this.selfId, v: [Math.round(v.x * 100) / 100, Math.round(v.y * 100) / 100, Math.round(v.z * 100) / 100] })
    }
    this.wasRagdoll = ragdoll
  }

  /* ── lobby (public room counts) ─────────────────────────── */

  private ensureLobby(): Promise<void> {
    if (this.lobby && this.lobbyReady) return this.lobbyReady
    const ch = this.getClient().channel(LOBBY_CHANNEL, { config: { presence: { key: this.selfId } } })
    this.lobby = ch
    const ready = new Promise<void>((resolve, reject) => {
      let synced = false
      let subscribed = false
      const timeout = setTimeout(() => {
        if (this.lobby === ch) this.closeLobby()
        reject(new Error('Could not reach the game server. Check your connection and try again.'))
      }, LOBBY_TIMEOUT)
      const done = () => {
        clearTimeout(timeout)
        resolve()
      }
      ch.on('presence', { event: 'sync' }, () => {
        synced = true
        if (subscribed) done()
      })
      ch.subscribe(status => {
        if (status !== 'SUBSCRIBED') return
        subscribed = true
        if (synced) done()
        else setTimeout(done, LOBBY_SYNC_WAIT)
        if (this.lobbyRoom) void ch.track({ room: this.lobbyRoom }).catch(() => {})
      })
    })
    this.lobbyReady = ready
    ready.catch(() => {})
    return ready
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
    const ch = this.lobby
    this.lobby = null
    this.lobbyReady = null
    if (ch && this.client) void this.client.removeChannel(ch).catch(() => {})
  }
}
