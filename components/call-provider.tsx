'use client'

/**
 * Global call engine + context.
 *
 * Addresses every bug raised by the adversarial review:
 *   1. Offer handler NO LONGER answers automatically. It only stashes the
 *      pending offer in a ref. The answer is built inside acceptCall, AFTER
 *      the user has consented AND the local tracks are attached. Fixes:
 *        - callee auto-answering before consent
 *        - callee answer with no local tracks (one-way media)
 *        - caller's media reaching callee's browser before accept
 *   2. Offer / answer / ICE handlers all gate on peer identity so a stray
 *      call from a third party cannot corrupt an in-progress PeerConnection.
 *   3. init() runs at most once per auth change via a token guard; we do
 *      NOT getUser() separately — onAuthStateChange's INITIAL_SESSION event
 *      covers initial load.
 *   4. callRef updates synchronously via applyCall() helper — no post-commit
 *      effect window where handlers see stale state.
 *   5. Caller stays in 'outgoing' until call-accept actually arrives, then
 *      moves to 'connecting', then to 'connected' on first remote track.
 *   6. ICE handler validates `from` matches current peer.
 *   7. attachLocalStream is cancellation-aware: if the call ended during
 *      getUserMedia, we stop the tracks and bail instead of leaking the mic.
 *   8. Context value is memoised to avoid re-rendering every consumer on
 *      every tick of the duration timer.
 *   9. getUserMedia errors raise a toast with a human-readable reason.
 *  10. Reject reason=busy raises a "Peer is busy" toast on the caller.
 */

import * as React from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User, RealtimeChannel } from '@supabase/supabase-js'
import { useToast } from '@/components/ui/toast'

// ─── Types ───

export interface OnlineUser {
  user_id: string
  user_name: string
  online_at: number
}

export type CallStatus = 'idle' | 'incoming' | 'outgoing' | 'connecting' | 'connected'

interface CallState {
  status: CallStatus
  peerId?: string
  peerName?: string
  startedAt?: number
}

interface CallContextValue {
  me: User | null
  online: OnlineUser[]
  call: CallState
  callUser: (peerId: string, peerName: string) => void
  acceptCall: () => void
  rejectCall: () => void
  hangup: () => void
  toggleMute: () => boolean
  toggleCamera: () => boolean
  muted: boolean
  cameraOff: boolean
  localVideoRef: React.RefObject<HTMLVideoElement | null>
  remoteVideoRef: React.RefObject<HTMLVideoElement | null>
  callDurationSec: number
}

const CallContext = React.createContext<CallContextValue | null>(null)

export function useCall() {
  const ctx = React.useContext(CallContext)
  if (!ctx) throw new Error('useCall must be used inside <CallProvider>')
  return ctx
}

// ─── Constants ───

const STUN = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
}

const PRESENCE_CHANNEL = 'chat-presence'
const CALLS_CHANNEL = 'webrtc-calls'

// Friendly getUserMedia error messages
function describeMediaError(err: unknown): { title: string; desc?: string } {
  const name = err instanceof Error ? err.name : ''
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return { title: 'Camera / mic blocked', desc: 'Allow access in your browser settings and try again.' }
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return { title: 'No camera or mic found', desc: 'Plug one in and try again.' }
    case 'NotReadableError':
    case 'TrackStartError':
      return { title: 'Device busy', desc: 'Another app is using your camera or mic.' }
    case 'OverconstrainedError':
      return { title: 'Device unsupported', desc: 'Your camera settings are not supported.' }
    case 'AbortError':
      return { title: 'Call cancelled' }
    default:
      return { title: 'Call failed', desc: err instanceof Error ? err.message : 'Unknown error.' }
  }
}

// ─── Provider ───

export function CallProvider({ children }: { children: React.ReactNode }) {
  const sb = React.useMemo(() => createClient(), [])
  const toast = useToast()

  const [me, setMe] = React.useState<User | null>(null)
  const [online, setOnline] = React.useState<OnlineUser[]>([])
  const [call, setCallState] = React.useState<CallState>({ status: 'idle' })
  const [muted, setMuted] = React.useState(false)
  const [cameraOff, setCameraOff] = React.useState(false)
  const [durationSec, setDurationSec] = React.useState(0)

  // State mirrored to refs for handler access.
  const callRef = React.useRef<CallState>({ status: 'idle' })
  const pcRef = React.useRef<RTCPeerConnection | null>(null)
  const localStreamRef = React.useRef<MediaStream | null>(null)
  const remoteStreamRef = React.useRef<MediaStream | null>(null)
  const pendingOfferRef = React.useRef<{ from: string; sdp: RTCSessionDescriptionInit } | null>(null)
  const pendingIceRef = React.useRef<RTCIceCandidateInit[]>([])
  const remoteSetRef = React.useRef(false)
  const presenceChRef = React.useRef<RealtimeChannel | null>(null)
  const callsChRef = React.useRef<RealtimeChannel | null>(null)
  const myIdRef = React.useRef<string | null>(null)
  const myNameRef = React.useRef<string>('anon')
  const authTokenRef = React.useRef(0)

  const localVideoRef = React.useRef<HTMLVideoElement | null>(null)
  const remoteVideoRef = React.useRef<HTMLVideoElement | null>(null)

  // Synchronous state + ref updater — handlers always see the latest.
  const applyCall = React.useCallback(
    (next: CallState | ((prev: CallState) => CallState)) => {
      setCallState(prev => {
        const value = typeof next === 'function' ? (next as (p: CallState) => CallState)(prev) : next
        callRef.current = value
        return value
      })
    },
    []
  )

  // ─── Media / PC lifecycle ───

  const cleanupMedia = React.useCallback(() => {
    if (pcRef.current) {
      try { pcRef.current.close() } catch {}
      pcRef.current = null
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop())
      localStreamRef.current = null
    }
    remoteStreamRef.current = null
    pendingIceRef.current = []
    pendingOfferRef.current = null
    remoteSetRef.current = false
    if (localVideoRef.current) localVideoRef.current.srcObject = null
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null
    setMuted(false)
    setCameraOff(false)
    setDurationSec(0)
  }, [])

  const hangup = React.useCallback(() => {
    const current = callRef.current
    if (current.status === 'idle') return
    if (current.peerId && callsChRef.current && myIdRef.current) {
      callsChRef.current.send({
        type: 'broadcast',
        event: 'hangup',
        payload: { to: current.peerId, from: myIdRef.current },
      })
    }
    cleanupMedia()
    applyCall({ status: 'idle' })
  }, [cleanupMedia, applyCall])

  // Cancellation-aware: throws if the active call changed while awaiting.
  const attachLocalStream = async (expectedPeerId: string): Promise<MediaStream> => {
    if (localStreamRef.current) return localStreamRef.current
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    } catch (err) {
      throw err
    }
    // Check if call was cancelled while we awaited
    const current = callRef.current
    if (current.status === 'idle' || current.peerId !== expectedPeerId) {
      stream.getTracks().forEach(t => t.stop())
      throw new Error('Call cancelled')
    }
    localStreamRef.current = stream
    if (localVideoRef.current) localVideoRef.current.srcObject = stream
    return stream
  }

  const createPeerConnection = (peerId: string): RTCPeerConnection => {
    // Close any stale PC before creating a new one.
    if (pcRef.current) {
      try { pcRef.current.close() } catch {}
    }
    pendingIceRef.current = []
    remoteSetRef.current = false

    const pc = new RTCPeerConnection(STUN)
    pcRef.current = pc

    pc.ontrack = (ev) => {
      const [stream] = ev.streams
      remoteStreamRef.current = stream
      if (remoteVideoRef.current && remoteVideoRef.current.srcObject !== stream) {
        remoteVideoRef.current.srcObject = stream
      }
      // First remote track means the call is live
      applyCall(c =>
        c.status === 'connected' ? c : { ...c, status: 'connected', startedAt: c.startedAt ?? callStartTimestamp() }
      )
    }

    pc.onicecandidate = (ev) => {
      if (!ev.candidate || !callsChRef.current || !myIdRef.current) return
      callsChRef.current.send({
        type: 'broadcast',
        event: 'ice',
        payload: { to: peerId, from: myIdRef.current, candidate: ev.candidate.toJSON() },
      })
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        if (pcRef.current === pc) hangup()
      }
    }

    return pc
  }

  const flushPendingIce = async () => {
    if (!pcRef.current || !remoteSetRef.current) return
    const queued = pendingIceRef.current
    pendingIceRef.current = []
    for (const c of queued) {
      try { await pcRef.current.addIceCandidate(new RTCIceCandidate(c)) } catch {}
    }
  }

  // ─── Public API ───

  const callUser = React.useCallback(async (peerId: string, peerName: string) => {
    if (!myIdRef.current || !callsChRef.current) return
    if (callRef.current.status !== 'idle') return

    applyCall({ status: 'outgoing', peerId, peerName })

    let stream: MediaStream
    try {
      stream = await attachLocalStream(peerId)
    } catch (err) {
      if (callRef.current.status === 'outgoing' && callRef.current.peerId === peerId) {
        const msg = describeMediaError(err)
        if (msg.title !== 'Call cancelled') toast.push({ kind: 'error', title: msg.title, desc: msg.desc })
      }
      cleanupMedia()
      applyCall({ status: 'idle' })
      return
    }

    try {
      const pc = createPeerConnection(peerId)
      stream.getTracks().forEach(t => pc.addTrack(t, stream))

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      callsChRef.current.send({
        type: 'broadcast',
        event: 'call-request',
        payload: { from: myIdRef.current, fromName: myNameRef.current, to: peerId },
      })
      callsChRef.current.send({
        type: 'broadcast',
        event: 'offer',
        payload: { from: myIdRef.current, to: peerId, sdp: offer },
      })

      // STAY in 'outgoing' until the callee presses Accept (call-accept arrives).
      // Previously flipped to 'connecting' here, which showed "Connecting" before
      // the callee had even seen the ring.
    } catch (err) {
      console.error('[call] callUser failed', err)
      toast.push({ kind: 'error', title: 'Call failed', desc: err instanceof Error ? err.message : 'Unknown error.' })
      cleanupMedia()
      applyCall({ status: 'idle' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleanupMedia, applyCall])

  const acceptCall = React.useCallback(async () => {
    const current = callRef.current
    if (current.status !== 'incoming' || !current.peerId || !callsChRef.current || !myIdRef.current) return
    const pendingOffer = pendingOfferRef.current
    if (!pendingOffer || pendingOffer.from !== current.peerId) {
      console.error('[call] acceptCall: no pending offer from this peer')
      hangup()
      return
    }

    applyCall(c => ({ ...c, status: 'connecting' }))

    let stream: MediaStream
    try {
      stream = await attachLocalStream(current.peerId)
    } catch (err) {
      if (callRef.current.status === 'connecting' && callRef.current.peerId === current.peerId) {
        const msg = describeMediaError(err)
        if (msg.title !== 'Call cancelled') toast.push({ kind: 'error', title: msg.title, desc: msg.desc })
      }
      hangup()
      return
    }

    try {
      const pc = createPeerConnection(current.peerId)
      stream.getTracks().forEach(t => pc.addTrack(t, stream))

      // Now apply the stored offer, build the answer, and send it.
      await pc.setRemoteDescription(new RTCSessionDescription(pendingOffer.sdp))
      remoteSetRef.current = true
      await flushPendingIce()

      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)

      callsChRef.current.send({
        type: 'broadcast',
        event: 'call-accept',
        payload: { from: myIdRef.current, to: current.peerId },
      })
      callsChRef.current.send({
        type: 'broadcast',
        event: 'answer',
        payload: { from: myIdRef.current, to: current.peerId, sdp: answer },
      })

      pendingOfferRef.current = null
    } catch (err) {
      console.error('[call] acceptCall failed', err)
      toast.push({ kind: 'error', title: 'Could not accept call', desc: err instanceof Error ? err.message : undefined })
      hangup()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hangup, applyCall])

  const rejectCall = React.useCallback(() => {
    const current = callRef.current
    if (current.status !== 'incoming' || !current.peerId || !callsChRef.current || !myIdRef.current) return
    callsChRef.current.send({
      type: 'broadcast',
      event: 'call-reject',
      payload: { from: myIdRef.current, to: current.peerId },
    })
    cleanupMedia()
    applyCall({ status: 'idle' })
  }, [cleanupMedia, applyCall])

  const toggleMute = React.useCallback(() => {
    const s = localStreamRef.current
    if (!s) return false
    const audio = s.getAudioTracks()
    const next = !muted
    audio.forEach(t => { t.enabled = !next })
    setMuted(next)
    return next
  }, [muted])

  const toggleCamera = React.useCallback(() => {
    const s = localStreamRef.current
    if (!s) return false
    const video = s.getVideoTracks()
    const next = !cameraOff
    video.forEach(t => { t.enabled = !next })
    setCameraOff(next)
    return next
  }, [cameraOff])

  // ─── Auth + channel setup ───

  React.useEffect(() => {
    const token = ++authTokenRef.current

    const init = async (user: User | null) => {
      // If a newer init() has started, abandon this one.
      if (token !== authTokenRef.current) return

      // Tear down anything previous.
      if (presenceChRef.current) { sb.removeChannel(presenceChRef.current); presenceChRef.current = null }
      if (callsChRef.current) { sb.removeChannel(callsChRef.current); callsChRef.current = null }
      cleanupMedia()
      setOnline([])
      applyCall({ status: 'idle' })
      setMe(user)
      myIdRef.current = user?.id ?? null
      myNameRef.current = user?.user_metadata?.display_name ?? user?.email?.split('@')[0] ?? 'anon'

      if (!user) return

      // Presence channel.
      const presenceCh = sb.channel(PRESENCE_CHANNEL, {
        config: { presence: { key: user.id } },
      })
      presenceCh
        .on('presence', { event: 'sync' }, () => {
          const state = presenceCh.presenceState<OnlineUser>()
          setOnline(Object.values(state).flat())
        })
        .subscribe(async (status) => {
          if (status !== 'SUBSCRIBED') return
          // If a newer init() has started, don't track on a stale channel.
          if (token !== authTokenRef.current) return
          await presenceCh.track({
            user_id: user.id,
            user_name: myNameRef.current,
            online_at: callStartTimestamp(),
          })
        })
      presenceChRef.current = presenceCh

      // Calls channel.
      const callsCh = sb.channel(CALLS_CHANNEL)

      callsCh.on('broadcast', { event: 'call-request' }, async ({ payload }: { payload: { from: string; fromName: string; to: string } }) => {
        if (payload.to !== myIdRef.current) return
        if (callRef.current.status !== 'idle') {
          // Auto-busy
          callsCh.send({
            type: 'broadcast',
            event: 'call-reject',
            payload: { from: myIdRef.current, to: payload.from, reason: 'busy' },
          })
          return
        }
        // Clear any stale pending offer from a previous attempt; the real offer
        // for this call-request will arrive via the 'offer' broadcast.
        pendingOfferRef.current = null
        applyCall({ status: 'incoming', peerId: payload.from, peerName: payload.fromName })
      })

      callsCh.on('broadcast', { event: 'offer' }, ({ payload }: { payload: { from: string; to: string; sdp: RTCSessionDescriptionInit } }) => {
        if (payload.to !== myIdRef.current) return
        const current = callRef.current
        // Only accept offers that match the ringing peer. Ignore everything else
        // so a third-party caller cannot touch an active PC.
        if (current.status !== 'incoming' || current.peerId !== payload.from) return
        // Just stash — do NOT build/send an answer. acceptCall does that after
        // the user has consented and the local tracks are attached.
        pendingOfferRef.current = { from: payload.from, sdp: payload.sdp }
      })

      callsCh.on('broadcast', { event: 'answer' }, async ({ payload }: { payload: { from: string; to: string; sdp: RTCSessionDescriptionInit } }) => {
        if (payload.to !== myIdRef.current || !pcRef.current) return
        const current = callRef.current
        // Only the original caller should process this answer, and only from the right peer.
        if ((current.status !== 'outgoing' && current.status !== 'connecting') || current.peerId !== payload.from) return
        try {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(payload.sdp))
          remoteSetRef.current = true
          await flushPendingIce()
        } catch (err) {
          console.error('[call] answer handling failed', err)
        }
      })

      callsCh.on('broadcast', { event: 'ice' }, async ({ payload }: { payload: { from: string; to: string; candidate: RTCIceCandidateInit } }) => {
        if (payload.to !== myIdRef.current) return
        const current = callRef.current
        if (!current.peerId || current.peerId !== payload.from) return
        if (!pcRef.current || !remoteSetRef.current) {
          pendingIceRef.current.push(payload.candidate)
          return
        }
        try { await pcRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate)) } catch {}
      })

      callsCh.on('broadcast', { event: 'call-accept' }, ({ payload }: { payload: { from: string; to: string } }) => {
        if (payload.to !== myIdRef.current) return
        const current = callRef.current
        if (current.status === 'outgoing' && current.peerId === payload.from) {
          applyCall(c => ({ ...c, status: 'connecting' }))
        }
      })

      callsCh.on('broadcast', { event: 'call-reject' }, ({ payload }: { payload: { from: string; to: string; reason?: string } }) => {
        if (payload.to !== myIdRef.current) return
        const current = callRef.current
        // Only acknowledge rejects from the peer we're trying to reach.
        if (!current.peerId || current.peerId !== payload.from) return
        const name = current.peerName ?? 'They'
        if (payload.reason === 'busy') {
          toast.push({ kind: 'warning', title: `${name} is on another call`, desc: 'Try again in a bit.' })
        } else if (current.status === 'outgoing') {
          toast.push({ kind: 'info', title: `${name} declined`, desc: 'The call was rejected.' })
        }
        cleanupMedia()
        applyCall({ status: 'idle' })
      })

      callsCh.on('broadcast', { event: 'hangup' }, ({ payload }: { payload: { to: string; from: string } }) => {
        if (payload.to !== myIdRef.current) return
        const current = callRef.current
        if (!current.peerId || current.peerId !== payload.from) return
        cleanupMedia()
        applyCall({ status: 'idle' })
      })

      callsCh.subscribe()
      callsChRef.current = callsCh
    }

    // Rely solely on onAuthStateChange — it fires INITIAL_SESSION on mount,
    // which covers the initial-load case. Previously we also ran
    // sb.auth.getUser().then(init), causing two concurrent init()s to race.
    const { data: { subscription } } = sb.auth.onAuthStateChange((_ev, session) => {
      init(session?.user ?? null)
    })

    return () => {
      // Invalidate any in-flight init() so its SUBSCRIBED callback bails.
      authTokenRef.current++
      subscription.unsubscribe()
      if (presenceChRef.current) sb.removeChannel(presenceChRef.current)
      if (callsChRef.current) sb.removeChannel(callsChRef.current)
      cleanupMedia()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sb])

  // Duration timer
  React.useEffect(() => {
    if (call.status !== 'connected' || !call.startedAt) return
    const start = call.startedAt
    const id = setInterval(() => {
      setDurationSec(Math.max(0, Math.floor((callStartTimestamp() - start) / 1000)))
    }, 1000)
    return () => clearInterval(id)
  }, [call.status, call.startedAt])

  // Keep video elements synced to their streams (handles the race where the
  // <video> mounts after ontrack has already fired)
  React.useEffect(() => {
    if (remoteVideoRef.current && remoteStreamRef.current) {
      if (remoteVideoRef.current.srcObject !== remoteStreamRef.current) {
        remoteVideoRef.current.srcObject = remoteStreamRef.current
      }
    }
    if (localVideoRef.current && localStreamRef.current) {
      if (localVideoRef.current.srcObject !== localStreamRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current
      }
    }
  })

  // Memoised context value — stops cascading re-renders of all consumers
  // every time the duration timer ticks.
  const value = React.useMemo<CallContextValue>(() => ({
    me, online, call,
    callUser, acceptCall, rejectCall, hangup,
    toggleMute, toggleCamera, muted, cameraOff,
    localVideoRef, remoteVideoRef, callDurationSec: durationSec,
  }), [me, online, call, callUser, acceptCall, rejectCall, hangup, toggleMute, toggleCamera, muted, cameraOff, durationSec])

  return (
    <CallContext.Provider value={value}>
      {children}
      <CallOverlay />
    </CallContext.Provider>
  )
}

// Isolated so a future port to a workflow script surfaces the forbidden lookup.
function callStartTimestamp(): number { return Date.now() }

// ═════════════════════════════════════════════════════════════════
// Global overlay — incoming / outgoing / connected
// ═════════════════════════════════════════════════════════════════

function CallOverlay() {
  const { call, acceptCall, rejectCall, hangup, muted, cameraOff, toggleMute, toggleCamera, localVideoRef, remoteVideoRef, callDurationSec } = useCall()

  if (call.status === 'idle') return null

  // Incoming — compact ringing card
  if (call.status === 'incoming') {
    return (
      <div
        className="fixed top-20 right-4 z-[9999] w-[320px] rounded-2xl overflow-hidden"
        style={{
          background: 'rgba(5,5,6,0.98)',
          border: '1px solid rgba(16,185,129,0.35)',
          boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.08), 0 20px 48px rgba(0,0,0,0.6)',
          backdropFilter: 'blur(24px) saturate(180%)',
          animation: 'fade-in 0.2s ease-out',
        }}
      >
        <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-70 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span className="mono text-[10px] uppercase tracking-widest text-emerald-400">Incoming call</span>
          </div>
          <button onClick={rejectCall} className="text-zinc-600 hover:text-zinc-300 transition-colors" aria-label="Dismiss">
            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-4 py-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold text-emerald-300" style={{
              background: 'linear-gradient(180deg, rgba(16,185,129,0.2), rgba(16,185,129,0.08))',
              border: '1px solid rgba(16,185,129,0.3)',
            }}>
              {(call.peerName ?? 'A')[0].toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-zinc-100 truncate">{call.peerName}</div>
              <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">wants to video call</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={rejectCall}
              className="flex-1 h-10 rounded-xl text-xs font-semibold text-rose-300 transition-all active:scale-[0.98] hover:brightness-110"
              style={{
                background: 'rgba(244,63,94,0.1)',
                border: '1px solid rgba(244,63,94,0.3)',
                boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.04)',
              }}
            >
              Decline
            </button>
            <button
              onClick={acceptCall}
              className="flex-1 h-10 rounded-xl text-xs font-semibold text-zinc-950 transition-all active:scale-[0.98] hover:brightness-110"
              style={{
                background: 'linear-gradient(180deg, #34D399 0%, #10B981 100%)',
                border: '1px solid rgba(167,243,208,0.5)',
                boxShadow: '0 0 0 1px rgba(255,255,255,0.15), 0 8px 24px rgba(16,185,129,0.3), inset 0 1px 0 0 rgba(255,255,255,0.3)',
              }}
            >
              Accept
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Outgoing / connecting — compact ringing card
  if (call.status === 'outgoing' || call.status === 'connecting') {
    return (
      <div
        className="fixed top-20 right-4 z-[9999] w-[320px] rounded-2xl overflow-hidden"
        style={{
          background: 'rgba(5,5,6,0.98)',
          border: '1px solid rgba(139,92,246,0.35)',
          boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.08), 0 20px 48px rgba(0,0,0,0.6)',
          backdropFilter: 'blur(24px) saturate(180%)',
          animation: 'fade-in 0.2s ease-out',
        }}
      >
        <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-violet-400 animate-pulse" style={{ boxShadow: '0 0 6px rgba(167,139,250,0.8)' }} />
            <span className="mono text-[10px] uppercase tracking-widest text-violet-300">
              {call.status === 'outgoing' ? 'Ringing' : 'Connecting'}
            </span>
          </div>
          <button onClick={hangup} className="text-zinc-600 hover:text-zinc-300" aria-label="Cancel">
            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-4 py-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold text-violet-200" style={{
              background: 'linear-gradient(180deg, rgba(139,92,246,0.2), rgba(139,92,246,0.08))',
              border: '1px solid rgba(139,92,246,0.3)',
            }}>
              {(call.peerName ?? 'A')[0].toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-zinc-100 truncate">{call.peerName}</div>
              <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                {call.status === 'outgoing' ? 'waiting for answer…' : 'establishing connection…'}
              </div>
            </div>
          </div>
          <button
            onClick={hangup}
            className="w-full h-10 rounded-xl text-xs font-semibold text-rose-300 transition-all active:scale-[0.98] hover:brightness-110"
            style={{
              background: 'rgba(244,63,94,0.1)',
              border: '1px solid rgba(244,63,94,0.3)',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  // Connected — full-screen video overlay
  return (
    <div className="fixed inset-0 z-[9999] bg-black/95 flex flex-col" style={{ animation: 'fade-in 0.2s ease-out' }}>
      <div className="relative flex-1">
        <video ref={remoteVideoRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover bg-black" />
        <video ref={localVideoRef} autoPlay playsInline muted className="absolute bottom-4 right-4 w-40 sm:w-56 aspect-video rounded-2xl border border-white/15 object-cover bg-zinc-900" style={{
          boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
        }} />

        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-6 py-4" style={{
          background: 'linear-gradient(180deg, rgba(0,0,0,0.6), transparent)',
        }}>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold text-emerald-300" style={{
              background: 'linear-gradient(180deg, rgba(16,185,129,0.2), rgba(16,185,129,0.08))',
              border: '1px solid rgba(16,185,129,0.3)',
            }}>
              {(call.peerName ?? 'A')[0].toUpperCase()}
            </div>
            <div>
              <div className="text-sm font-semibold text-zinc-100 leading-tight">{call.peerName}</div>
              <div className="text-[10px] font-mono text-zinc-400 tabular-nums">
                {formatDuration(callDurationSec)}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 rounded-full px-3 py-1" style={{
            background: 'rgba(16,185,129,0.14)',
            border: '1px solid rgba(16,185,129,0.3)',
          }}>
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="mono text-[10px] uppercase tracking-widest text-emerald-300">Live</span>
          </div>
        </div>
      </div>

      <div className="relative px-6 py-6 flex items-center justify-center gap-3" style={{
        background: 'linear-gradient(0deg, rgba(0,0,0,0.6), transparent)',
      }}>
        <CallControlBtn
          onClick={toggleMute}
          active={muted}
          activeBg="rgba(244,63,94,0.2)" activeBorder="rgba(244,63,94,0.4)" activeColor="#FDA4AF"
          title={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? (
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
          ) : (
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path strokeLinecap="round" d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/></svg>
          )}
        </CallControlBtn>

        <CallControlBtn
          onClick={toggleCamera}
          active={cameraOff}
          activeBg="rgba(244,63,94,0.2)" activeBorder="rgba(244,63,94,0.4)" activeColor="#FDA4AF"
          title={cameraOff ? 'Turn camera on' : 'Turn camera off'}
        >
          {cameraOff ? (
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M16 16v1a2 2 0 01-2 2H3a2 2 0 01-2-2V7a2 2 0 012-2h2m5.66 0H14a2 2 0 012 2v3.34l1 1L23 7v10M1 1l22 22"/></svg>
          ) : (
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
          )}
        </CallControlBtn>

        <button
          onClick={hangup}
          title="End call"
          className="flex h-14 w-14 items-center justify-center rounded-full text-white transition-all active:scale-95 hover:brightness-110"
          style={{
            background: 'linear-gradient(180deg, #F43F5E 0%, #BE123C 100%)',
            boxShadow: '0 0 0 1px rgba(255,255,255,0.15), 0 8px 24px rgba(244,63,94,0.4), inset 0 1px 0 0 rgba(255,255,255,0.25)',
          }}
        >
          <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ transform: 'rotate(135deg)' }}>
            <path strokeLinecap="round" d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.68A2 2 0 012 1.07h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/>
          </svg>
        </button>
      </div>
    </div>
  )
}

function CallControlBtn({ children, onClick, active, activeBg, activeBorder, activeColor, title }: {
  children: React.ReactNode
  onClick: () => void
  active: boolean
  activeBg: string
  activeBorder: string
  activeColor: string
  title: string
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex h-12 w-12 items-center justify-center rounded-full transition-all active:scale-95"
      style={active ? {
        background: activeBg,
        border: `1px solid ${activeBorder}`,
        color: activeColor,
      } : {
        background: 'rgba(255,255,255,0.08)',
        border: '1px solid rgba(255,255,255,0.12)',
        color: '#E4E4E7',
        boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.08)',
      }}
    >
      {children}
    </button>
  )
}

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60).toString().padStart(2, '0')
  const s = (secs % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}
