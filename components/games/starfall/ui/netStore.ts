/**
 * Multiplayer state for the React layer.
 *
 * Mirrors ctx.net (status, room, profile), keeps the chat log and a snapshot
 * of the players in the room. Everything arrives through the net:* events;
 * the only polling is a 1 Hz refresh of the player snapshot while in a room,
 * because ping and the direct/relay link change without events.
 *
 * UI actions go through here (not straight to ctx.net) so the store knows
 * the difference between "the player left" and "the link dropped".
 */
import type { Game } from '../engine/Game'
import type { GameEventMap } from '../engine/events'
import type { INetwork, NetStatus, RoomInfo } from '../engine/types'

export interface PlayerView {
  id: string
  name: string
  color: string
  self: boolean
  direct: boolean
  /** Round trip in ms, -1 = unknown. */
  ping: number
}

export interface ChatLine {
  key: number
  name: string
  color: string
  text: string
  system: boolean
  self: boolean
  /** Starts fading out of the in-game log. */
  leaving: boolean
  /** Gone from the in-game log (still listed while the chat is open). */
  expired: boolean
}

export interface NetState {
  status: NetStatus
  /** Detail for 'error' / 'connecting' (from net:status). */
  message: string
  room: RoomInfo | null
  /** Room we were in when the link dropped; null once the player leaves on purpose. */
  lastRoom: RoomInfo | null
  /** You first, then everyone else by name. */
  players: PlayerView[]
  chat: ChatLine[]
  profile: { name: string; color: string }
  chatOpen: boolean
}

export const CHAT_MAX = 140
const CHAT_HOLD_MS = 8000
const CHAT_FADE_MS = 700
const CHAT_KEEP = 40

/** Shirt colours offered on the Online screen — warm, saturated enough to read at distance, never neon. */
export const SHIRT_COLORS = ['#C9432F', '#E07B2F', '#E2B33A', '#5C9B47', '#2E8C86', '#3D6DB3', '#7B5CB0', '#C95A86']

function initialNet(): NetState {
  return {
    status: 'offline',
    message: '',
    room: null,
    lastRoom: null,
    players: [],
    chat: [],
    profile: { name: 'Player', color: SHIRT_COLORS[0] },
    chatOpen: false,
  }
}

const sameRoom = (a: RoomInfo | null, b: RoomInfo | null) =>
  a === b || (!!a && !!b && a.code === b.code && a.name === b.name && a.public === b.public && a.players === b.players && a.max === b.max)

export class NetStore {
  private state: NetState = initialNet()
  private listeners = new Set<() => void>()
  private timers = new Set<ReturnType<typeof setTimeout>>()
  private poll: ReturnType<typeof setInterval> | null = null
  private game: Game | null = null
  private seq = 0
  private playersSig = ''

  get = (): NetState => this.state

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  attach(game: Game): () => void {
    this.game = game
    const bus = game.bus
    const offs = [
      bus.on('net:status', e => {
        if (e.status !== this.state.status || (e.message ?? '') !== this.state.message) this.set({ status: e.status, message: e.message ?? '' })
      }),
      bus.on('net:room', e => this.onRoom(e ? { ...e } : null)),
      bus.on('net:peer', () => this.refreshPlayers()),
      bus.on('net:chat', e => this.pushChat(e)),
    ]
    this.syncFromNet()
    return () => {
      for (const off of offs) off()
      this.stopPolling()
      for (const t of this.timers) clearTimeout(t)
      this.timers.clear()
      this.game = null
    }
  }

  /* ── actions (UI → network) ─────────────────────────────────── */

  setProfile(p: Partial<{ name: string; color: string }>): void {
    const net = this.net
    if (!net) return
    try {
      net.setProfile(p)
    } catch {
      /* the stored profile below still reflects the choice */
    }
    this.set({ profile: { ...this.state.profile, ...readProfile(net), ...p } })
    this.refreshPlayers()
  }

  listPublicRooms(): Promise<RoomInfo[]> {
    const net = this.net
    if (!net) return Promise.resolve([])
    return this.call(() => net.listPublicRooms())
  }

  join(code: string): Promise<void> {
    return this.enter(net => net.join(code))
  }

  quickJoin(): Promise<void> {
    return this.enter(net => net.quickJoin())
  }

  async createPrivate(): Promise<string> {
    let code = ''
    await this.enter(async net => {
      code = await net.createPrivate()
    })
    return code
  }

  async leave(): Promise<void> {
    const net = this.net
    this.set({ lastRoom: null })
    if (!net) return
    try {
      await net.leave()
    } finally {
      this.syncFromNet()
    }
  }

  sendChat(text: string): void {
    const t = text.trim().slice(0, CHAT_MAX)
    if (!t) return
    try {
      this.net?.sendChat(t)
    } catch {
      /* a dropped message is not worth an error */
    }
  }

  setChatOpen(open: boolean): void {
    if (this.state.chatOpen !== open) this.set({ chatOpen: open })
  }

  /* ── internals ──────────────────────────────────────────────── */

  private get net(): INetwork | null {
    return this.game?.ctx.net ?? null
  }

  private set(patch: Partial<NetState>): void {
    this.state = { ...this.state, ...patch }
    for (const fn of this.listeners) fn()
  }

  private later(ms: number, fn: () => void): void {
    const t = setTimeout(() => {
      this.timers.delete(t)
      fn()
    }, ms)
    this.timers.add(t)
  }

  /** Runs a network call, turning synchronous throws into rejections with a readable message. */
  private async call<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn()
    } catch (err) {
      throw new Error(readableError(err))
    }
  }

  private async enter(fn: (net: INetwork) => Promise<void>): Promise<void> {
    const net = this.net
    if (!net) throw new Error('The game is still starting')
    try {
      await this.call(() => fn(net))
    } finally {
      this.syncFromNet()
    }
  }

  private syncFromNet(): void {
    const net = this.net
    if (!net) return
    let status: NetStatus = 'offline'
    let room: RoomInfo | null = null
    try {
      status = net.status
      room = net.room ? { ...net.room } : null
    } catch {
      /* keep the defaults */
    }
    const patch: Partial<NetState> = { profile: { ...this.state.profile, ...readProfile(net) } }
    if (status !== this.state.status) patch.status = status
    this.set(patch)
    this.onRoom(room)
  }

  private onRoom(room: RoomInfo | null): void {
    const prev = this.state.room
    if (sameRoom(prev, room)) {
      this.refreshPlayers()
      return
    }
    const patch: Partial<NetState> = { room }
    if (room) {
      patch.lastRoom = room
      // A different room starts with a clean log.
      if (!prev || prev.code !== room.code) patch.chat = []
    }
    this.set(patch)
    if (room) this.startPolling()
    else this.stopPolling()
    this.refreshPlayers()
  }

  private startPolling(): void {
    if (this.poll) return
    this.poll = setInterval(() => this.refreshPlayers(), 1000)
  }

  private stopPolling(): void {
    if (this.poll) clearInterval(this.poll)
    this.poll = null
  }

  /** Rebuilds the player snapshot; only notifies when something visible changed. */
  private refreshPlayers(): void {
    const net = this.net
    if (!net) return
    const players: PlayerView[] = []
    try {
      if (this.state.room) {
        const me = readProfile(net)
        players.push({ id: net.selfId || 'self', name: me.name, color: me.color, self: true, direct: true, ping: 0 })
        const others: PlayerView[] = []
        for (const p of net.peers.values()) {
          others.push({
            id: p.id,
            name: p.name || 'Islander',
            color: p.color,
            self: false,
            direct: !!p.direct,
            ping: Number.isFinite(p.ping) && p.ping >= 0 ? Math.round(p.ping) : -1,
          })
        }
        others.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
        players.push(...others)
      }
    } catch {
      return
    }
    // Ping is shown in 5 ms steps so jitter doesn't re-render the list every second.
    const sig = players.map(p => `${p.id}|${p.name}|${p.color}|${p.direct}|${p.ping < 0 ? -1 : Math.round(p.ping / 5)}`).join(';')
    if (sig === this.playersSig) return
    this.playersSig = sig
    this.set({ players })
  }

  private pushChat(e: GameEventMap['net:chat']): void {
    const net = this.net
    const key = ++this.seq
    const line: ChatLine = {
      key,
      name: String(e.name ?? '').slice(0, 24),
      color: e.color || '#F3EEE6',
      text: String(e.text ?? '').slice(0, CHAT_MAX),
      system: !!e.system,
      self: !e.system && !!net && !!net.selfId && e.id === net.selfId,
      leaving: false,
      expired: false,
    }
    if (!line.text) return
    this.set({ chat: [...this.state.chat, line].slice(-CHAT_KEEP) })
    const mark = (field: 'leaving' | 'expired') => {
      if (this.state.chat.some(l => l.key === key)) this.set({ chat: this.state.chat.map(l => (l.key === key ? { ...l, [field]: true } : l)) })
    }
    this.later(CHAT_HOLD_MS, () => mark('leaving'))
    this.later(CHAT_HOLD_MS + CHAT_FADE_MS, () => mark('expired'))
  }
}

function readProfile(net: INetwork): { name: string; color: string } {
  try {
    const p = net.profile
    return { name: p?.name || 'Player', color: p?.color || SHIRT_COLORS[0] }
  } catch {
    return { name: 'Player', color: SHIRT_COLORS[0] }
  }
}

/** Errors from the network are meant to be shown; anything else gets a generic line. */
export function readableError(err: unknown): string {
  const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  return msg.trim() || 'Something went wrong. Please try again.'
}
