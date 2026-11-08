/**
 * One WebRTC link to one peer: an unordered, unreliable data channel for
 * movement, negotiated with the "perfect negotiation" pattern.
 *
 * The peer with the lower id is impolite: it creates the data channel (which
 * starts the negotiation), picks the link session id and retries failed links.
 * The polite peer answers, and yields (rolls back) on offer collisions.
 * Signalling travels over the room channel; ICE candidates are batched to keep
 * the message count low.
 */
import { ICE_SERVERS } from './config'
import { randomId, type SignalMsg } from './protocol'

export interface LinkHost {
  /** Deliver a signalling message to the peer. */
  signal(msg: Pick<SignalMsg, 'sid' | 'd' | 'c'>): void
  /** A binary message arrived on the data channel. */
  message(data: ArrayBuffer): void
  /** The link opened or closed. */
  change(): void
}

/** Max bytes accepted per data-channel message (state packets are 40). */
const MAX_MESSAGE = 64
/** Candidates gathered within this window travel in one message (ms). */
const ICE_BATCH_MS = 300
const ICE_PER_MESSAGE = 20
/** Drop state packets instead of queueing when the channel is congested. */
const MAX_BUFFERED = 16 * 1024

export function rtcSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.RTCPeerConnection === 'function'
}

export class PeerLink {
  /** Link session id (the impolite peer's choice). */
  readonly sid: string
  /** Local time (s) the link was created. */
  readonly startedAt: number
  /** Opened at least once. */
  wasOpen = false
  closed = false

  private pc: RTCPeerConnection
  private dc: RTCDataChannel | null = null
  private makingOffer = false
  private ignoreOffer = false
  private answerPending = false
  private outIce: RTCIceCandidateInit[] = []
  private inIce: RTCIceCandidateInit[] = []
  private iceTimer: ReturnType<typeof setTimeout> | null = null
  /** Incoming signals are processed strictly in order. */
  private queue: Promise<void> = Promise.resolve()

  constructor(
    readonly polite: boolean,
    sid: string | null,
    now: number,
    private host: LinkHost,
  ) {
    this.sid = sid ?? randomId(10)
    this.startedAt = now
    const pc = (this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS }))
    pc.onicecandidate = e => this.queueIce(e.candidate)
    pc.onnegotiationneeded = () => void this.negotiate()
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState
      if (s === 'failed' || s === 'closed') this.fail()
      else this.host.change()
    }
    pc.ondatachannel = e => this.bind(e.channel)
    if (!polite) this.bind(pc.createDataChannel('state', { ordered: false, maxRetransmits: 0 }))
  }

  /** Usable for sending. A 'disconnected' ICE state counts as down (the relay covers it until it recovers or fails). */
  get open(): boolean {
    return !this.closed && this.dc !== null && this.dc.readyState === 'open' && this.pc.connectionState !== 'disconnected'
  }

  /** Feed a signalling message from the peer (already validated and addressed to us). */
  handle(msg: SignalMsg): Promise<void> {
    this.queue = this.queue.then(() => this.process(msg))
    return this.queue
  }

  send(data: ArrayBuffer): boolean {
    const dc = this.dc
    if (this.closed || !dc || dc.readyState !== 'open' || dc.bufferedAmount > MAX_BUFFERED) return false
    try {
      dc.send(data)
      return true
    } catch {
      return false
    }
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    if (this.iceTimer) clearTimeout(this.iceTimer)
    this.iceTimer = null
    const pc = this.pc
    pc.onicecandidate = pc.onnegotiationneeded = pc.onconnectionstatechange = pc.ondatachannel = null
    const dc = this.dc
    if (dc) {
      dc.onopen = dc.onclose = dc.onerror = dc.onmessage = null
      try {
        dc.close()
      } catch {
        /* already closed */
      }
    }
    try {
      pc.close()
    } catch {
      /* already closed */
    }
  }

  /* ── internals ───────────────────────────────────────────── */

  private fail(): void {
    if (this.closed) return
    this.close()
    this.host.change()
  }

  private bind(dc: RTCDataChannel): void {
    if (this.closed) return
    if (this.dc && this.dc !== dc) {
      // Only one channel per link; a second one is a misbehaving peer.
      dc.close()
      return
    }
    this.dc = dc
    dc.binaryType = 'arraybuffer'
    dc.onopen = () => {
      this.wasOpen = true
      this.host.change()
    }
    dc.onclose = () => this.fail()
    dc.onmessage = e => {
      const data = e.data as unknown
      if (data instanceof ArrayBuffer && data.byteLength > 0 && data.byteLength <= MAX_MESSAGE) this.host.message(data)
    }
  }

  private async negotiate(): Promise<void> {
    if (this.closed) return
    try {
      this.makingOffer = true
      await this.pc.setLocalDescription()
      this.sendDescription()
    } catch {
      this.fail()
    } finally {
      this.makingOffer = false
    }
  }

  private sendDescription(): void {
    const d = this.pc.localDescription
    if (this.closed || !d || (d.type !== 'offer' && d.type !== 'answer')) return
    this.host.signal({ sid: this.sid, d: { type: d.type, sdp: d.sdp } })
  }

  private async process(msg: SignalMsg): Promise<void> {
    if (this.closed) return
    const pc = this.pc
    try {
      const d = msg.d
      if (d) {
        const readyForOffer = !this.makingOffer && (pc.signalingState === 'stable' || this.answerPending)
        const collision = d.type === 'offer' && !readyForOffer
        this.ignoreOffer = !this.polite && collision
        if (this.ignoreOffer) return
        this.answerPending = d.type === 'answer'
        await pc.setRemoteDescription(d)
        this.answerPending = false
        if (d.type === 'offer') {
          await pc.setLocalDescription()
          this.sendDescription()
        }
        const early = this.inIce.splice(0)
        for (const c of early) await this.addIce(c)
      }
      if (msg.c) {
        for (const c of msg.c) {
          if (!pc.remoteDescription) {
            if (this.inIce.length < 48) this.inIce.push(c)
          } else await this.addIce(c)
        }
      }
    } catch {
      // A description we cannot apply leaves the link unusable; the impolite side retries.
      if (!this.ignoreOffer) this.fail()
    }
  }

  private async addIce(c: RTCIceCandidateInit): Promise<void> {
    if (this.closed) return
    try {
      await this.pc.addIceCandidate(c)
    } catch {
      /* a single bad or stale candidate is harmless */
    }
  }

  private queueIce(c: RTCIceCandidate | null): void {
    if (this.closed) return
    if (c && c.candidate) {
      this.outIce.push({ candidate: c.candidate, sdpMid: c.sdpMid ?? null, sdpMLineIndex: c.sdpMLineIndex ?? null })
      if (!this.iceTimer) this.iceTimer = setTimeout(() => this.flushIce(), ICE_BATCH_MS)
    } else if (!c) {
      this.flushIce()
    }
  }

  private flushIce(): void {
    if (this.iceTimer) clearTimeout(this.iceTimer)
    this.iceTimer = null
    if (this.closed) return
    while (this.outIce.length) this.host.signal({ sid: this.sid, c: this.outIce.splice(0, ICE_PER_MESSAGE) })
  }
}
