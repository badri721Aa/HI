/**
 * Server status, watched from load to unload:
 *
 * - Maintenance: one row (`id = 1`) of the Supabase table `starfall_status`, read on
 *   load and followed live (postgres_changes). While `maintenance` is on, everyone
 *   leaves their room, gameplay stops and the UI shows the message with a live count of
 *   the players waiting (presence on `starfall:waiting`). When it turns off, each page
 *   reloads after a random 1–4 s so the new version loads without a stampede.
 * - New versions (standalone build only): /version.json is checked every two minutes.
 *   A newer build reloads the page at once on the title screen; mid-game a toast says
 *   it will load on the next return to the title.
 *
 * Everything fails open: if Supabase or the version file can't be reached, play goes on.
 */
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import type { Ctx } from '../types'

const TABLE = 'starfall_status'
const STATUS_CHANNEL = 'starfall:status'
const WAITING_CHANNEL = 'starfall:waiting'
const DEFAULT_MESSAGE = 'Updating — please wait'
const VERSION_URL = '/version.json'
const VERSION_EVERY = 120_000
/** This build's id (set by the standalone build; undefined in the site's dev server). */
const BUILD = process.env.NEXT_PUBLIC_STARFALL_BUILD

export class ServiceWatch {
  /** Maintenance is on. */
  maintenance = false
  private message = DEFAULT_MESSAGE
  private waitingCount = 0
  private status: RealtimeChannel | null = null
  private waiting: RealtimeChannel | null = null
  private versionTimer: ReturnType<typeof setInterval> | null = null
  private reloadTimer: ReturnType<typeof setTimeout> | null = null
  private newBuild = false
  private offPhase: (() => void) | null = null
  private disposed = false

  constructor(
    private ctx: Ctx,
    private client: () => SupabaseClient,
    private leaveRoom: () => Promise<void>,
  ) {}

  start(): void {
    try {
      const ch = this.client().channel(STATUS_CHANNEL)
      ch.on('postgres_changes', { event: '*', schema: 'public', table: TABLE, filter: 'id=eq.1' }, change => this.apply(change.new))
      // Read the row on every (re)subscribe: a change made while the socket was down still arrives.
      ch.subscribe(status => {
        if (status === 'SUBSCRIBED') void this.fetch()
      })
      this.status = ch
    } catch {
      /* fail open */
    }
    if (BUILD) {
      this.versionTimer = setInterval(() => void this.checkVersion(), VERSION_EVERY)
      this.offPhase = this.ctx.bus.on('ui:phase', e => {
        if (this.newBuild && e.phase === 'title') this.reload(300)
      })
    }
  }

  /** Applies a status row (the initial read or a live change). */
  apply(row: unknown): void {
    if (this.disposed || !row || typeof row !== 'object') return
    const r = row as { maintenance?: unknown; message?: unknown }
    const on = r.maintenance === true
    const message = typeof r.message === 'string' && r.message.trim() ? r.message.trim().slice(0, 160) : DEFAULT_MESSAGE
    const was = this.maintenance
    // Nothing to show unless maintenance is (or was) on.
    if (!on && !was) return
    if (on === was && message === this.message) return
    this.maintenance = on
    this.message = message
    if (on && !was) {
      void this.leaveRoom().catch(() => {})
      this.joinWaiting()
    } else if (!on && was) {
      this.leaveWaiting()
      this.reload(1000 + Math.random() * 3000)
    }
    this.emit()
  }

  dispose(): void {
    this.disposed = true
    if (this.versionTimer) clearInterval(this.versionTimer)
    if (this.reloadTimer) clearTimeout(this.reloadTimer)
    this.offPhase?.()
    this.leaveWaiting()
    const ch = this.status
    this.status = null
    if (ch) void this.client().removeChannel(ch).catch(() => {})
  }

  /* ── internals ───────────────────────────────────────────── */

  private emit(): void {
    this.ctx.bus.emit('net:maintenance', { on: this.maintenance, message: this.message, waiting: Math.max(1, this.waitingCount) })
  }

  private async fetch(): Promise<void> {
    try {
      const { data, error } = await this.client().from(TABLE).select('maintenance, message').eq('id', 1).maybeSingle()
      if (!error && data) this.apply(data)
    } catch {
      /* fail open */
    }
  }

  private joinWaiting(): void {
    if (this.waiting) return
    try {
      const key = this.ctx.net.selfId
      const ch = this.client().channel(WAITING_CHANNEL, { config: { presence: { key } } })
      ch.on('presence', { event: 'sync' }, () => {
        this.waitingCount = Object.keys(ch.presenceState()).length
        if (this.maintenance) this.emit()
      })
      ch.subscribe(status => {
        if (status === 'SUBSCRIBED') void ch.track({ at: Date.now() }).catch(() => {})
      })
      this.waiting = ch
    } catch {
      /* the count is cosmetic */
    }
  }

  private leaveWaiting(): void {
    const ch = this.waiting
    this.waiting = null
    this.waitingCount = 0
    if (ch) void this.client().removeChannel(ch).catch(() => {})
  }

  private reload(delayMs: number): void {
    if (this.reloadTimer || this.disposed) return
    this.reloadTimer = setTimeout(() => window.location.reload(), delayMs)
  }

  private async checkVersion(): Promise<void> {
    if (this.newBuild || this.disposed) return
    try {
      const res = await fetch(`${VERSION_URL}?t=${Date.now()}`, { cache: 'no-store' })
      if (!res.ok) return
      const build = ((await res.json()) as { build?: unknown }).build
      if (typeof build !== 'string' || !build || build === BUILD) return
    } catch {
      return
    }
    this.newBuild = true
    if (this.ctx.game.phase === 'title') this.reload(300)
    else this.ctx.bus.emit('ui:toast', { kind: 'info', title: 'New version ready', body: 'It will load next time you return to the title.' })
  }
}
