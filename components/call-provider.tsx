'use client'

/**
 * Global call engine + context.
 *
 * Problem it solves: calling was previously embedded inside app/chat/page.tsx.
 * - Incoming calls only reached you if you were on /chat
 * - WebRTC handlers lived inside a useEffect closure that captured stale `call`
 *   state, so answers / ICE candidates silently referenced `call.pc === undefined`
 *   and the whole dance broke
 *
 * This mounts globally (via layout.tsx), subscribes once per session, and
 * exposes a React context any page can call. Refs mirror the state so
 * long-lived handlers always see the latest pc/peerId.
 */

import * as React from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User, RealtimeChannel } from '@supabase/supabase-js'

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

// ─── Provider ───

export function CallProvider({ children }: { children: React.ReactNode }) {
  const sb = React.useMemo(() => createClient(), [])

  const [me, setMe] = React.useState<User | null>(null)
  const [online, setOnline] = React.useState<OnlineUser[]>([])
  const [call, setCall] = React.useState<CallState>({ status: 'idle' })
  const [muted, setMuted] = React.useState(false)
  const [cameraOff, setCameraOff] = React.useState(false)
  const [durationSec, setDurationSec] = React.useState(0)

  // Refs so long-lived handlers always see the latest state
  const callRef = React.useRef<CallState>({ status: 'idle' })
  const pcRef = React.useRef<RTCPeerConnection | null>(null)
  const localStreamRef = React.useRef<MediaStream | null>(null)
  const remoteStreamRef = React.useRef<MediaStream | null>(null)
  const pendingIceRef = React.useRef<RTCIceCandidateInit[]>([])
  const remoteSetRef = React.useRef(false)
  const presenceChRef = React.useRef<RealtimeChannel | null>(null)
  const callsChRef = React.useRef<RealtimeChannel | null>(null)
  const myIdRef = React.useRef<string | null>(null)
  const myNameRef = React.useRef<string>('anon')

  const localVideoRef = React.useRef<HTMLVideoElement | null>(null)
  const remoteVideoRef = React.useRef<HTMLVideoElement | null>(null)

  // Keep callRef in sync
  React.useEffect(() => { callRef.current = call }, [call])

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
    setCall({ status: 'idle' })
  }, [cleanupMedia])

  const attachLocalStream = async () => {
    if (localStreamRef.current) return localStreamRef.current
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    localStreamRef.current = stream
    if (localVideoRef.current) localVideoRef.current.srcObject = stream
    return stream
  }

  const createPeerConnection = (peerId: string): RTCPeerConnection => {
    const pc = new RTCPeerConnection(STUN)
    pcRef.current = pc

    pc.ontrack = (ev) => {
      const [stream] = ev.streams
      remoteStreamRef.current = stream
      if (remoteVideoRef.current && remoteVideoRef.current.srcObject !== stream) {
        remoteVideoRef.current.srcObject = stream
      }
      // First remote track means the call is live
      setCall(c => c.status === 'connected' ? c : { ...c, status: 'connected', startedAt: c.startedAt ?? callStartTimestamp() })
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
        hangup()
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

    setCall({ status: 'outgoing', peerId, peerName })

    try {
      const stream = await attachLocalStream()
      const pc = createPeerConnection(peerId)
      stream.getTracks().forEach(t => pc.addTrack(t, stream))

      // Build offer
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      // Send ring + offer
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

      setCall(c => ({ ...c, status: 'connecting' }))
    } catch (err) {
      console.error('[call] callUser failed', err)
      cleanupMedia()
      setCall({ status: 'idle' })
    }
  }, [cleanupMedia])

  const acceptCall = React.useCallback(async () => {
    const current = callRef.current
    if (current.status !== 'incoming' || !current.peerId || !callsChRef.current || !myIdRef.current) return
    setCall(c => ({ ...c, status: 'connecting' }))
    try {
      const stream = await attachLocalStream()
      const pc = pcRef.current ?? createPeerConnection(current.peerId)
      stream.getTracks().forEach(t => {
        // Avoid double-adding if PC already has transceivers
        const existing = pc.getSenders().some(s => s.track === t)
        if (!existing) pc.addTrack(t, stream)
      })
      callsChRef.current.send({
        type: 'broadcast',
        event: 'call-accept',
        payload: { from: myIdRef.current, to: current.peerId },
      })
    } catch (err) {
      console.error('[call] acceptCall failed', err)
      hangup()
    }
  }, [hangup])

  const rejectCall = React.useCallback(() => {
    const current = callRef.current
    if (current.status !== 'incoming' || !current.peerId || !callsChRef.current || !myIdRef.current) return
    callsChRef.current.send({
      type: 'broadcast',
      event: 'call-reject',
      payload: { from: myIdRef.current, to: current.peerId },
    })
    cleanupMedia()
    setCall({ status: 'idle' })
  }, [cleanupMedia])

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
    let cancelled = false

    const init = async (user: User | null) => {
      // Tear down anything previous
      if (presenceChRef.current) { sb.removeChannel(presenceChRef.current); presenceChRef.current = null }
      if (callsChRef.current) { sb.removeChannel(callsChRef.current); callsChRef.current = null }
      cleanupMedia()
      setOnline([])
      setCall({ status: 'idle' })
      setMe(user)
      myIdRef.current = user?.id ?? null
      myNameRef.current = user?.user_metadata?.display_name ?? user?.email?.split('@')[0] ?? 'anon'

      if (!user || cancelled) return

      // Presence channel — shared with chat page's old channel name so
      // existing presence state stays visible everywhere.
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
          await presenceCh.track({
            user_id: user.id,
            user_name: myNameRef.current,
            online_at: callStartTimestamp(),
          })
        })
      presenceChRef.current = presenceCh

      // Calls channel — broadcast only
      const callsCh = sb.channel(CALLS_CHANNEL)

      callsCh.on('broadcast', { event: 'call-request' }, async ({ payload }: { payload: { from: string; fromName: string; to: string } }) => {
        if (payload.to !== myIdRef.current) return
        if (callRef.current.status !== 'idle') {
          // Auto-busy: tell them we can't take it
          callsCh.send({
            type: 'broadcast',
            event: 'call-reject',
            payload: { from: myIdRef.current, to: payload.from, reason: 'busy' },
          })
          return
        }
        setCall({ status: 'incoming', peerId: payload.from, peerName: payload.fromName })
      })

      callsCh.on('broadcast', { event: 'offer' }, async ({ payload }: { payload: { from: string; to: string; sdp: RTCSessionDescriptionInit } }) => {
        if (payload.to !== myIdRef.current) return
        // Ensure PC exists (for callee receiving an offer)
        const pc = pcRef.current ?? createPeerConnection(payload.from)
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
          remoteSetRef.current = true
          await flushPendingIce()
          // Only create an answer if we're receiving (not the one who sent the offer)
          if (pc.localDescription?.type !== 'offer') {
            const answer = await pc.createAnswer()
            await pc.setLocalDescription(answer)
            callsChRef.current?.send({
              type: 'broadcast',
              event: 'answer',
              payload: { from: myIdRef.current, to: payload.from, sdp: answer },
            })
          }
        } catch (err) {
          console.error('[call] offer handling failed', err)
        }
      })

      callsCh.on('broadcast', { event: 'answer' }, async ({ payload }: { payload: { from: string; to: string; sdp: RTCSessionDescriptionInit } }) => {
        if (payload.to !== myIdRef.current || !pcRef.current) return
        try {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(payload.sdp))
          remoteSetRef.current = true
          await flushPendingIce()
        } catch (err) {
          console.error('[call] answer handling failed', err)
        }
      })

      callsCh.on('broadcast', { event: 'ice' }, async ({ payload }: { payload: { to: string; candidate: RTCIceCandidateInit } }) => {
        if (payload.to !== myIdRef.current) return
        if (!pcRef.current || !remoteSetRef.current) {
          pendingIceRef.current.push(payload.candidate)
          return
        }
        try { await pcRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate)) } catch {}
      })

      callsCh.on('broadcast', { event: 'call-accept' }, async ({ payload }: { payload: { from: string; to: string } }) => {
        if (payload.to !== myIdRef.current) return
        // Caller side: ensure media + PC exist (callUser already created them,
        // this just moves UI state forward if the acceptee was fast)
        if (callRef.current.status === 'outgoing') {
          setCall(c => ({ ...c, status: 'connecting' }))
        }
      })

      callsCh.on('broadcast', { event: 'call-reject' }, ({ payload }: { payload: { from: string; to: string; reason?: string } }) => {
        if (payload.to !== myIdRef.current) return
        cleanupMedia()
        setCall({ status: 'idle' })
      })

      callsCh.on('broadcast', { event: 'hangup' }, ({ payload }: { payload: { to: string; from: string } }) => {
        if (payload.to !== myIdRef.current) return
        cleanupMedia()
        setCall({ status: 'idle' })
      })

      callsCh.subscribe()
      callsChRef.current = callsCh
    }

    sb.auth.getUser().then(({ data }) => init(data.user))
    const { data: { subscription } } = sb.auth.onAuthStateChange((_ev, session) => {
      init(session?.user ?? null)
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
      if (presenceChRef.current) sb.removeChannel(presenceChRef.current)
      if (callsChRef.current) sb.removeChannel(callsChRef.current)
      cleanupMedia()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sb])

  // Duration timer (updates once per second while connected)
  React.useEffect(() => {
    if (call.status !== 'connected' || !call.startedAt) return
    const start = call.startedAt
    const id = setInterval(() => {
      setDurationSec(Math.max(0, Math.floor((callStartTimestamp() - start) / 1000)))
    }, 1000)
    return () => clearInterval(id)
  }, [call.status, call.startedAt])

  // Ensure remote video element always has the current stream (handles
  // the race where the <video> mounts after ontrack fires)
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

  const value: CallContextValue = {
    me, online, call,
    callUser, acceptCall, rejectCall, hangup,
    toggleMute, toggleCamera, muted, cameraOff,
    localVideoRef, remoteVideoRef, callDurationSec: durationSec,
  }

  return (
    <CallContext.Provider value={value}>
      {children}
      <CallOverlay />
    </CallContext.Provider>
  )
}

// Date.now() is forbidden inside workflow scripts; here in app code it's fine.
// Centralised wrapper so the forbidden lookup is obvious if ever ported.
function callStartTimestamp(): number { return Date.now() }

// ═════════════════════════════════════════════════════════════════
// Global overlay — incoming / outgoing / connected
// ═════════════════════════════════════════════════════════════════

function CallOverlay() {
  const { call, acceptCall, rejectCall, hangup, muted, cameraOff, toggleMute, toggleCamera, localVideoRef, remoteVideoRef, callDurationSec } = useCall()

  if (call.status === 'idle') return null

  // Incoming — compact ringing card (top-right, non-blocking)
  if (call.status === 'incoming') {
    return (
      <div
        className="fixed top-20 right-4 z-[10000] w-[320px] rounded-2xl overflow-hidden"
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
          <button
            onClick={rejectCall}
            className="text-zinc-600 hover:text-zinc-300 transition-colors"
            aria-label="Dismiss"
          >
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

  // Outgoing — compact "ringing" card
  if (call.status === 'outgoing' || call.status === 'connecting') {
    return (
      <div
        className="fixed top-20 right-4 z-[10000] w-[320px] rounded-2xl overflow-hidden"
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
    <div className="fixed inset-0 z-[10000] bg-black/95 flex flex-col" style={{ animation: 'fade-in 0.2s ease-out' }}>
      <div className="relative flex-1">
        <video ref={remoteVideoRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover bg-black" />
        <video ref={localVideoRef} autoPlay playsInline muted className="absolute bottom-4 right-4 w-40 sm:w-56 aspect-video rounded-2xl border border-white/15 object-cover bg-zinc-900" style={{
          boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
        }} />

        {/* Top bar */}
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

      {/* Bottom controls */}
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
