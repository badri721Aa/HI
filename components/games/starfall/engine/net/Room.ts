/**
 * One joined room: the Supabase channel `starfall:room:<code>` with presence
 * (who is here), broadcast events (chat, emotes, ragdolls, signalling and the
 * movement relay) and one WebRTC link per other player.
 *
 * Joining waits for the first presence snapshot so a full room can be refused
 * before we show up in it; if two players race for the last slot, the later
 * joiner (by joinedAt, then id) is asked to leave.
 */
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import type { GestureName } from '../types'
import { DIRECT_GRACE, LINK_RETRY, LINK_TIMEOUT, MAX_PLAYERS, PING_INTERVAL, ROOM_CHANNEL_PREFIX } from './config'
import { PeerLink, rtcSupported } from './p2p'
import {
  KIND_PING, KIND_PONG, KIND_STATE, PING_BYTES, decodeState, fromRelay, isEmote, isPeerId, makeSnapshot,
  parseMember, parseSignal, parseVec, sanitizeChat, type MemberInfo, type RelayPacket, type SignalMsg, type Snapshot,
} from './protocol'
import { RemotePeer } from './RemotePeer'

export interface RoomHost {
  readonly selfId: string
  /** Our presence payload. */
  member(): MemberInfo
  /** Local clock (s). */
  now(): number
  peerJoined(peer: RemotePeer, initial: boolean): void
  peerLeft(peer: RemotePeer): void
  peerChanged(peer: RemotePeer): void
  chat(peer: RemotePeer, text: string): void
  emote(peer: RemotePeer, name: GestureName): void
  ragdoll(peer: RemotePeer, v: [number, number, number]): void
  count(players: number): void
  /** Connection to the server changed after the join completed. */
  connection(state: 'online' | 'connecting' | 'error', message?: string): void
  /** We lost a race for the last slot and must leave. */
  evicted(): void
}

const JOIN_TIMEOUT = 12000
/** How long to wait for the first presence snapshot after subscribing (ms). */
const SYNC_WAIT = 1800
/** After this long without the server, report an error (the client keeps retrying). */
const LOST_AFTER = 20000
/** Signals from ids not (yet) in presence are held this long (s). */
const ORPHAN_TTL = 4
/** Ignore presence entries beyond this many (flood guard). */
const MAX_SEEN = 24

interface Orphan {
  msg: SignalMsg
  at: number
}

export class Room {
  readonly peers = new Map<string, RemotePeer>()
  /** Same peers as an array (iterated every frame without allocating). */
  readonly list: RemotePeer[] = []
  /** Set when a relay packet should go out right away (a new player arrived). */
  relayNow = false

  private channel: RealtimeChannel
  private subscribed = false
  private tracked = false
  private synced = false
  private closed = false
  private joining: { resolve: () => void; reject: (e: Error) => void } | null = null
  private timers: ReturnType<typeof setTimeout>[] = []
  private lostTimer: ReturnType<typeof setTimeout> | null = null
  private orphans: Orphan[] = []
  private rtc = rtcSupported()
  private ping = new DataView(new ArrayBuffer(PING_BYTES))
  private scratch: Snapshot = makeSnapshot()

  constructor(
    private client: SupabaseClient,
    readonly code: string,
    private host: RoomHost,
  ) {
    const ch = (this.channel = client.channel(ROOM_CHANNEL_PREFIX + code, {
      config: { presence: { key: host.selfId }, broadcast: { self: false, ack: false } },
    }))
    ch.on('presence', { event: 'sync' }, () => this.onSync())
    ch.on('broadcast', { event: 'sig' }, ({ payload }) => this.onSignal(payload))
    ch.on('broadcast', { event: 'pos' }, ({ payload }) => this.onRelay(payload))
    ch.on('broadcast', { event: 'chat' }, ({ payload }) => this.onChat(payload))
    ch.on('broadcast', { event: 'emote' }, ({ payload }) => this.onEmote(payload))
    ch.on('broadcast', { event: 'rag' }, ({ payload }) => this.onRag(payload))
  }

  get online(): boolean {
    return this.subscribed && this.tracked && !this.closed
  }

  /** Players in the room including us. */
  get players(): number {
    return this.list.length + 1
  }

  /** Subscribes, refuses full rooms, then announces us. */
  connect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.joining = { resolve, reject }
      this.later(JOIN_TIMEOUT, () => this.failJoin(new Error('Could not reach the game server. Check your connection and try again.')))
      this.channel.subscribe((status, err) => this.onChannelStatus(status, err))
    })
  }

  async leave(): Promise<void> {
    if (this.closed) return
    this.closed = true
    for (const t of this.timers) clearTimeout(t)
    this.timers = []
    if (this.lostTimer) clearTimeout(this.lostTimer)
    for (const p of this.list) p.link?.close()
    this.peers.clear()
    this.list.length = 0
    this.joining?.reject(new Error('Left the room'))
    this.joining = null
    try {
      await this.client.removeChannel(this.channel)
    } catch {
      /* the socket may already be gone */
    }
  }

  /** Re-announces our presence payload (name / colour changed). */
  retrack(): void {
    if (this.online) void this.channel.track(this.host.member()).catch(() => {})
  }

  send(event: 'pos' | 'chat' | 'emote' | 'rag' | 'sig', payload: object): void {
    if (!this.subscribed || this.closed) return
    this.channel.send({ type: 'broadcast', event, payload }).catch(() => {})
  }

  /**
   * True if some peer needs the relay: no open direct link, and either WebRTC is unavailable here
   * or the peer has been around longer than the grace period (so the link failed, dropped or is retrying).
   */
  needsRelay(now: number): boolean {
    for (let i = 0; i < this.list.length; i++) {
      const p = this.list[i]
      if (p.link?.open) continue
      if (!this.rtc || now - p.knownAt > DIRECT_GRACE) return true
    }
    return false
  }

  /** Sends a state packet to every peer with an open data channel. */
  sendDirect(data: ArrayBuffer): void {
    for (let i = 0; i < this.list.length; i++) this.list[i].link?.send(data)
  }

  /** Link upkeep: create / retry / time out links, pings. */
  update(now: number): void {
    if (!this.online) return
    const self = this.host.selfId
    for (let i = 0; i < this.list.length; i++) {
      const p = this.list[i]
      const link = p.link
      if (link?.closed) {
        p.link = null
        p.nextLinkAt = now + LINK_RETRY[Math.min(Math.max(0, p.linkAttempts - 1), LINK_RETRY.length - 1)]
      } else if (link && !link.wasOpen && now - link.startedAt > LINK_TIMEOUT * (link.polite ? 1.6 : 1)) {
        link.close()
        p.link = null
        p.nextLinkAt = now + LINK_RETRY[Math.min(Math.max(0, p.linkAttempts - 1), LINK_RETRY.length - 1)]
      }
      // The impolite (lower id) side starts links; the polite side follows its offers.
      if (!p.link && this.rtc && self < p.id && p.linkAttempts <= LINK_RETRY.length && now >= p.nextLinkAt) {
        p.linkAttempts++
        p.link = this.makeLink(p, false, null)
      }
      if (p.link?.open && now - p.lastPingAt > PING_INTERVAL) {
        p.lastPingAt = now
        this.ping.setUint8(0, KIND_PING)
        this.ping.setFloat64(8, performance.now(), true)
        p.link.send(this.ping.buffer as ArrayBuffer)
      }
    }
    if (this.orphans.length) this.orphans = this.orphans.filter(o => now - o.at < ORPHAN_TTL)
  }

  /* ── channel ─────────────────────────────────────────────── */

  private later(ms: number, fn: () => void): void {
    this.timers.push(setTimeout(fn, ms))
  }

  private failJoin(err: Error): void {
    const j = this.joining
    if (!j) return
    this.joining = null
    j.reject(err)
  }

  private onChannelStatus(status: string, err?: Error): void {
    if (this.closed) return
    if (status === 'SUBSCRIBED') {
      this.subscribed = true
      if (this.lostTimer) clearTimeout(this.lostTimer)
      this.lostTimer = null
      if (this.joining) {
        // The server pushes the current presence right after the join; give it a moment.
        if (this.synced) void this.announce()
        else this.later(SYNC_WAIT, () => void this.announce())
      } else {
        // Rejoined after a connection drop: presence must be tracked again.
        this.tracked = false
        void this.announce()
      }
      return
    }
    // CHANNEL_ERROR / TIMED_OUT / CLOSED — realtime-js keeps retrying on its own.
    this.subscribed = false
    this.synced = false
    if (this.joining) {
      if (status === 'CHANNEL_ERROR' && err?.message) console.warn('[starfall] room channel error', err.message)
      return
    }
    this.host.connection('connecting', 'Reconnecting to the server…')
    if (!this.lostTimer) {
      this.lostTimer = setTimeout(() => {
        this.lostTimer = null
        if (!this.subscribed && !this.closed) this.host.connection('error', 'Lost connection to the server — retrying')
      }, LOST_AFTER)
    }
  }

  /** Room-full check, then track our presence. */
  private async announce(): Promise<void> {
    if (this.closed || !this.subscribed || this.tracked) return
    if (this.joining) {
      const others = Object.keys(this.channel.presenceState()).filter(k => k !== this.host.selfId).length
      if (others >= MAX_PLAYERS) {
        this.failJoin(new Error('Room is full'))
        return
      }
    }
    this.tracked = true
    let res: string
    try {
      res = await this.channel.track(this.host.member())
    } catch {
      res = 'error'
    }
    if (this.closed) return
    if (res !== 'ok') {
      this.tracked = false
      this.failJoin(new Error('The server refused the connection. Try again in a moment.'))
      return
    }
    const j = this.joining
    this.joining = null
    if (!j) {
      // Back after a drop: the next presence sync reconciles the player list.
      this.host.connection('online')
      if (this.synced && !this.reconcile(false)) this.host.evicted()
      return
    }
    if (this.reconcile(true)) j.resolve()
    else j.reject(new Error('Room is full'))
  }

  private onSync(): void {
    this.synced = true
    if (this.closed) return
    if (this.joining) {
      if (this.subscribed && !this.tracked) void this.announce()
      return
    }
    if (this.tracked && !this.reconcile(false)) this.host.evicted()
  }

  /** Diffs presence against our peer list; false if we lost a race for the last slot and must leave. */
  private reconcile(initial: boolean): boolean {
    const self = this.host.selfId
    const state = this.channel.presenceState() as Record<string, unknown[]>
    const entries: Array<[string, MemberInfo]> = []
    for (const key of Object.keys(state)) {
      if (key === self || !isPeerId(key)) continue
      const metas = state[key]
      if (!Array.isArray(metas) || !metas.length) continue
      entries.push([key, parseMember(metas[metas.length - 1])])
    }
    entries.sort((a, b) => a[1].joinedAt - b[1].joinedAt || (a[0] < b[0] ? -1 : 1))
    if (entries.length > MAX_SEEN) entries.length = MAX_SEEN

    // Over capacity: the latest joiners (by joinedAt, then id) leave.
    const myJoin = this.host.member().joinedAt
    if (entries.length + 1 > MAX_PLAYERS) {
      const ahead = entries.filter(([id, info]) => info.joinedAt < myJoin || (info.joinedAt === myJoin && id < self)).length
      if (ahead >= MAX_PLAYERS) return false
    }

    const seen = new Set<string>()
    for (const [id, info] of entries) {
      seen.add(id)
      const existing = this.peers.get(id)
      if (existing) {
        if (existing.name !== info.name || existing.color !== info.color) {
          existing.name = info.name
          existing.color = info.color
          this.host.peerChanged(existing)
        }
        continue
      }
      const peer = new RemotePeer(id, info)
      peer.knownAt = this.host.now()
      this.peers.set(id, peer)
      this.list.push(peer)
      this.relayNow = true
      this.host.peerJoined(peer, initial)
      this.replayOrphans(peer)
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i]
      if (seen.has(p.id)) continue
      p.link?.close()
      p.link = null
      this.list.splice(i, 1)
      this.peers.delete(p.id)
      this.host.peerLeft(p)
    }
    this.host.count(this.players)
    return true
  }

  /* ── links ───────────────────────────────────────────────── */

  private makeLink(peer: RemotePeer, polite: boolean, sid: string | null): PeerLink {
    const now = this.host.now()
    return new PeerLink(polite, sid, now, {
      signal: m => this.send('sig', { from: this.host.selfId, to: peer.id, ...m }),
      message: data => this.onData(peer, data),
      change: () => {
        const open = !!peer.link?.open
        if (open && peer.link) peer.linkAttempts = Math.min(peer.linkAttempts, 1)
        peer.direct = open
      },
    })
  }

  private onSignal(raw: unknown): void {
    const msg = parseSignal(raw)
    if (!msg || msg.to !== this.host.selfId || this.closed) return
    const peer = this.peers.get(msg.from)
    if (!peer) {
      // Offers can overtake the sender's presence; hold them briefly.
      if (this.orphans.length < 16) this.orphans.push({ msg, at: this.host.now() })
      return
    }
    this.routeSignal(peer, msg)
  }

  private replayOrphans(peer: RemotePeer): void {
    if (!this.orphans.length) return
    const mine = this.orphans.filter(o => o.msg.from === peer.id)
    if (!mine.length) return
    this.orphans = this.orphans.filter(o => o.msg.from !== peer.id)
    for (const o of mine) this.routeSignal(peer, o.msg)
  }

  private routeSignal(peer: RemotePeer, msg: SignalMsg): void {
    if (!this.rtc) return
    let link = peer.link
    const polite = this.host.selfId > peer.id
    if (polite) {
      if (!link || link.sid !== msg.sid) {
        // Only a fresh offer may (re)start a link; stray candidates of old sessions are dropped.
        if (msg.d?.type !== 'offer') return
        link?.close()
        link = peer.link = this.makeLink(peer, true, msg.sid)
      }
    } else if (!link || link.sid !== msg.sid) return
    void link.handle(msg)
  }

  private onData(peer: RemotePeer, data: ArrayBuffer): void {
    const view = new DataView(data)
    const kind = view.getUint8(0)
    if (kind === KIND_STATE) {
      if (decodeState(view, this.scratch)) peer.push(this.scratch, this.host.now())
    } else if (kind === KIND_PING && data.byteLength === PING_BYTES) {
      view.setUint8(0, KIND_PONG)
      peer.link?.send(data)
    } else if (kind === KIND_PONG && data.byteLength === PING_BYTES) {
      peer.setPing(performance.now() - view.getFloat64(8, true))
    }
  }

  /* ── broadcast events ────────────────────────────────────── */

  private sender(raw: unknown): { peer: RemotePeer; o: Record<string, unknown> } | null {
    if (!raw || typeof raw !== 'object' || this.closed) return null
    const o = raw as Record<string, unknown>
    const peer = isPeerId(o.from) ? this.peers.get(o.from) : undefined
    return peer ? { peer, o } : null
  }

  private onRelay(raw: unknown): void {
    const s = this.sender(raw)
    // A direct link carries this player already; the relay copy is redundant.
    if (!s || s.peer.link?.open) return
    if (fromRelay(raw as RelayPacket, this.scratch)) s.peer.push(this.scratch, this.host.now())
  }

  private onChat(raw: unknown): void {
    const s = this.sender(raw)
    if (!s || !s.peer.chat.take(this.host.now())) return
    const text = sanitizeChat(s.o.text)
    if (text) this.host.chat(s.peer, text)
  }

  private onEmote(raw: unknown): void {
    const s = this.sender(raw)
    if (!s || !isEmote(s.o.name) || !s.peer.emotes.take(this.host.now())) return
    this.host.emote(s.peer, s.o.name)
  }

  private onRag(raw: unknown): void {
    const s = this.sender(raw)
    if (!s || !s.peer.rags.take(this.host.now())) return
    const v = parseVec(s.o.v, 60)
    if (v) this.host.ragdoll(s.peer, v)
  }
}
