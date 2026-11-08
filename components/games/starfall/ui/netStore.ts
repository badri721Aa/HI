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
import type { Input } from '../engine/input'
import type { GestureName, INetwork, NetStatus, RoomInfo } from '../engine/types'

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
  /** Player list overlay (held Tab, or toggled from the chip on touch). */
  listOpen: boolean
}

export const CHAT_MAX = 140
const CHAT_HOLD_MS = 8000
const CHAT_FADE_MS = 700
const CHAT_KEEP = 40

/** Shirt colours offered on the Online screen — warm, saturated enough to read at distance, never neon. */
export const SHIRT_COLORS = ['#c9432f', '#d9822b', '#d8b43c', '#5c9a45', '#2f8c86', '#3c6fb8', '#7a5ab8', '#cc5a82']

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
    listOpen: false,
  }
}

const sameRoom = (a: RoomInfo | null, b: RoomInfo | null) =>
  a === b || (!!a && !!b && a.code === b.code && a.name === b.name && a.public === b.public && a.players === b.players && a.max === b.max)

/** Temporarily replaces Input.onPointerLockChange (see NetStore.openChat). */
interface LockSwap {
  saved: Input['onPointerLockChange']
  wrapper: (locked: boolean) => void
  timer: ReturnType<typeof setTimeout> | null
}

const EMOTE_COOLDOWN_MS = 700

export class NetStore {
  private state: NetState = initialNet()
  private listeners = new Set<() => void>()
  private timers = new Set<ReturnType<typeof setTimeout>>()
  private poll: ReturnType<typeof setInterval> | null = null
  private game: Game | null = null
  private seq = 0
  private playersSig = ''
  private lock: LockSwap | null = null
  private emoteAt = -1e9

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
      // Menus, cutscenes and dialogs take over: drop the chat input and the player list.
      bus.on('ui:phase', e => {
        // The network finishes init() during loading; pick up its stored profile then.
        this.syncFromNet()
        if (e.phase === 'playing') return
        this.closeChat(false)
        if (this.state.listOpen) this.set({ listOpen: false })
      }),
    ]
    this.syncFromNet()
    return () => {
      for (const off of offs) off()
      this.restoreLock()
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
    // The network's copy wins: it sanitises names.
    this.set({ profile: { ...this.state.profile, ...p, ...readProfile(net) } })
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

  /**
   * Opens the chat input (online, in play). Typing needs the mouse back, but
   * the game pauses whenever pointer lock is lost — so for the time the input
   * is open, lock losses are swallowed (lock gains still pass through) and the
   * original handler is put back shortly after the chat closes.
   */
  openChat(): void {
    const game = this.game
    if (!game || this.state.chatOpen || !this.state.room || game.phase !== 'playing') return
    const input = game.ctx.input
    if (this.lock) {
      if (this.lock.timer) clearTimeout(this.lock.timer)
      this.lock.timer = null
    } else {
      const saved = input.onPointerLockChange
      const wrapper = (locked: boolean) => {
        if (!locked) return
        saved?.(locked)
        // Back in the game after the chat closed: from now on a lost lock pauses again.
        if (!this.state.chatOpen) this.restoreLock()
      }
      input.onPointerLockChange = wrapper
      this.lock = { saved, wrapper, timer: null }
    }
    // Let go of anything held (W, Shift…) so the hero stops while you type.
    input.reset()
    input.exitPointerLock()
    this.set({ chatOpen: true, listOpen: false })
  }

  /** Closes the chat input; `relock` takes the mouse back (call it from the key/click that closed it). */
  closeChat(relock: boolean): void {
    if (!this.state.chatOpen) return
    this.set({ chatOpen: false })
    const game = this.game
    if (relock && game?.phase === 'playing') game.requestPointerLock()
    // Hand the handler back once the re-lock lands (see openChat), or shortly after if it never does.
    const l = this.lock
    if (l && !l.timer) l.timer = setTimeout(() => this.restoreLock(), 600)
  }

  setPlayerList(open: boolean): void {
    const v = open && !!this.state.room && this.game?.phase === 'playing'
    if (this.state.listOpen !== v) this.set({ listOpen: v })
  }

  /** Plays an emote on your hero and, when in a room, on everyone else's screen. */
  emote(name: GestureName): void {
    const game = this.game
    if (!game || game.phase !== 'playing') return
    const now = performance.now()
    if (now - this.emoteAt < EMOTE_COOLDOWN_MS) return
    this.emoteAt = now
    try {
      void game.ctx.character.playGesture(name).catch(() => {})
    } catch {
      /* the character may still be loading */
    }
    if (!this.state.room) return
    try {
      game.ctx.net.sendEmote(name)
    } catch {
      /* best effort */
    }
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
    if (!room) patch.listOpen = false
    this.set(patch)
    if (room) this.startPolling()
    else {
      this.stopPolling()
      this.closeChat(false)
    }
    this.refreshPlayers()
  }

  private restoreLock(): void {
    const l = this.lock
    if (!l) return
    if (l.timer) clearTimeout(l.timer)
    this.lock = null
    const input = this.game?.ctx.input
    if (input && input.onPointerLockChange === l.wrapper) input.onPointerLockChange = l.saved
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
