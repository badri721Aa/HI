'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User, RealtimeChannel } from '@supabase/supabase-js'
import { isOwner, canAdmin, formatTime } from '@/lib/utils'

interface Message {
  id: string
  user_id: string | null
  user_name: string
  message: string
  is_owner: boolean
  deleted: boolean
  created_at: string
}

interface Reaction {
  id: string
  message_id: string
  user_id: string
  user_name: string
  emoji: string
}

interface PresenceState {
  user_id: string
  user_name: string
  online_at: number
}

interface CallState {
  type: 'incoming' | 'outgoing' | 'connected' | 'idle'
  peerId?: string
  peerName?: string
  localStream?: MediaStream
  remoteStream?: MediaStream
  pc?: RTCPeerConnection
}

const EMOJIS = ['👍','❤️','😂','😮','😢','🔥']
const STUN = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }

export default function ChatPage() {
  const [user, setUser] = useState<User | null>(null)
  const [userRole, setUserRole] = useState('user')
  const [messages, setMessages] = useState<Message[]>([])
  const [reactions, setReactions] = useState<Record<string, Reaction[]>>({})
  const [input, setInput] = useState('')
  const [authLoading, setAuthLoading] = useState(true)
  const [banned, setBanned] = useState(false)
  const [typing, setTyping] = useState<string[]>([])
  const [online, setOnline] = useState<PresenceState[]>([])
  const [hover, setHover] = useState<string | null>(null)
  const [call, setCall] = useState<CallState>({ type: 'idle' })

  const bottomRef = useRef<HTMLDivElement>(null)
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const presenceCh = useRef<RealtimeChannel | null>(null)
  const callCh = useRef<RealtimeChannel | null>(null)
  const sb = createClient()

  // ── Initialise ──────────────────────────────────────────────
  useEffect(() => {
    let uid = ''
    let uname = ''

    sb.auth.getUser().then(async ({ data }) => {
      const u = data.user
      setUser(u)
      setAuthLoading(false)
      if (!u) return
      uid = u.id
      uname = u.user_metadata?.display_name ?? u.email?.split('@')[0] ?? 'anon'

      // Fetch profile + messages + reactions in parallel
      const [{ data: p }] = await Promise.all([
        sb.from('profiles').select('role').eq('id', u.id).single(),
        fetchMessages(),
        fetchReactions(),
        checkBanned(u.email ?? ''),
      ])
      if (p) setUserRole(p.role)

      // ── Presence ──────────────────────────────────────────
      presenceCh.current = sb.channel('chat-presence', { config: { presence: { key: uid } } })
        .on('presence', { event: 'sync' }, () => {
          const state = presenceCh.current!.presenceState<PresenceState>()
          setOnline(Object.values(state).flat())
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, ({ new: row }) => {
          const msg = row as Message
          // Skip if already present (optimistic update replaced the temp entry)
          setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg])
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_messages' }, ({ new: row }) => {
          const msg = row as Message
          setMessages(prev => msg.deleted
            ? prev.filter(m => m.id !== msg.id)
            : prev.map(m => m.id === msg.id ? msg : m)
          )
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'message_reactions' }, ({ new: row }) => {
          const r = row as Reaction
          setReactions(prev => ({ ...prev, [r.message_id]: [...(prev[r.message_id] ?? []), r] }))
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'message_reactions' }, ({ old }) => {
          const o = old as Reaction
          setReactions(prev => ({
            ...prev,
            [o.message_id]: (prev[o.message_id] ?? []).filter(r => r.id !== o.id),
          }))
        })
        .on('broadcast', { event: 'typing' }, ({ payload }: { payload: { name: string; uid: string } }) => {
          if (payload.uid === uid) return
          setTyping(prev => {
            if (!prev.includes(payload.name)) return [...prev, payload.name]
            return prev
          })
          setTimeout(() => setTyping(prev => prev.filter(n => n !== payload.name)), 3000)
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await presenceCh.current!.track({ user_id: uid, user_name: uname, online_at: Date.now() })
          }
        })

      // ── WebRTC signaling channel ───────────────────────────
      callCh.current = sb.channel('webrtc-calls')
        .on('broadcast', { event: 'call-request' }, ({ payload }: { payload: { from: string; fromName: string; to: string } }) => {
          if (payload.to !== uid) return
          setCall({ type: 'incoming', peerId: payload.from, peerName: payload.fromName })
        })
        .on('broadcast', { event: 'call-accept' }, ({ payload }: { payload: { from: string; to: string } }) => {
          if (payload.to !== uid) return
          initiatePeerConnection(payload.from, true)
        })
        .on('broadcast', { event: 'call-reject' }, ({ payload }: { payload: { to: string } }) => {
          if (payload.to !== uid) return
          hangup()
        })
        .on('broadcast', { event: 'offer' }, async ({ payload }: { payload: { to: string; sdp: RTCSessionDescriptionInit } }) => {
          if (payload.to !== uid || !call.pc) return
          await call.pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
          const answer = await call.pc.createAnswer()
          await call.pc.setLocalDescription(answer)
          callCh.current!.send({ type: 'broadcast', event: 'answer', payload: { to: call.peerId!, sdp: answer } })
        })
        .on('broadcast', { event: 'answer' }, async ({ payload }: { payload: { to: string; sdp: RTCSessionDescriptionInit } }) => {
          if (payload.to !== uid || !call.pc) return
          await call.pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
        })
        .on('broadcast', { event: 'ice' }, async ({ payload }: { payload: { to: string; candidate: RTCIceCandidateInit } }) => {
          if (payload.to !== uid || !call.pc) return
          try { await call.pc.addIceCandidate(new RTCIceCandidate(payload.candidate)) } catch {}
        })
        .on('broadcast', { event: 'hangup' }, ({ payload }: { payload: { to: string } }) => {
          if (payload.to !== uid) return
          hangup()
        })
        .subscribe()
    })

    return () => {
      if (presenceCh.current) sb.removeChannel(presenceCh.current)
      if (callCh.current) sb.removeChannel(callCh.current)
      hangup()
    }
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Data fetching ────────────────────────────────────────────
  async function checkBanned(email: string) {
    const { data } = await sb.from('banned_users').select('id').eq('name', email).single()
    if (data) setBanned(true)
  }

  async function fetchMessages() {
    const { data } = await sb.from('chat_messages')
      .select('*').eq('deleted', false)
      .order('created_at', { ascending: true }).limit(100)
    if (data) setMessages(data)
  }

  async function fetchReactions() {
    const { data } = await sb.from('message_reactions').select('*')
    if (data) {
      const map: Record<string, Reaction[]> = {}
      for (const r of data) {
        if (!map[r.message_id]) map[r.message_id] = []
        map[r.message_id].push(r)
      }
      setReactions(map)
    }
  }

  // ── Messaging ────────────────────────────────────────────────
  async function send() {
    if (!input.trim() || !user || banned) return
    const text = input.trim()
    const displayName = user.user_metadata?.display_name ?? user.email?.split('@')[0] ?? 'anon'

    // Optimistic: clear input and show message immediately
    setInput('')
    const tempId = `temp-${Date.now()}`
    const tempMsg: Message = {
      id: tempId,
      user_id: user.id,
      user_name: displayName,
      message: text,
      is_owner: isOwner(user.email ?? ''),
      deleted: false,
      created_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, tempMsg])

    // Persist to DB and swap temp with real row
    const { data } = await sb.from('chat_messages').insert({
      user_id: user.id,
      user_name: displayName,
      message: text,
      is_owner: isOwner(user.email ?? ''),
      deleted: false,
    }).select().single()

    if (data) {
      setMessages(prev => prev.map(m => m.id === tempId ? (data as Message) : m))
    }
  }

  function broadcastTyping() {
    if (!presenceCh.current || !user) return
    const name = user.user_metadata?.display_name ?? 'anon'
    presenceCh.current.send({ type: 'broadcast', event: 'typing', payload: { name, uid: user.id } })
    if (typingTimer.current) clearTimeout(typingTimer.current)
    typingTimer.current = setTimeout(() => {}, 2500)
  }

  async function deleteMessage(msg: Message) {
    await sb.from('chat_messages').update({ deleted: true }).eq('id', msg.id)
  }

  async function toggleReaction(msgId: string, emoji: string) {
    if (!user) return
    const existing = (reactions[msgId] ?? []).find(r => r.user_id === user.id && r.emoji === emoji)
    if (existing) {
      await sb.from('message_reactions').delete().eq('id', existing.id)
    } else {
      const name = user.user_metadata?.display_name ?? 'anon'
      await sb.from('message_reactions').insert({ message_id: msgId, user_id: user.id, user_name: name, emoji })
    }
  }

  // ── WebRTC ───────────────────────────────────────────────────
  async function initiatePeerConnection(peerId: string, isCallee: boolean) {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    if (localVideoRef.current) localVideoRef.current.srcObject = stream

    const pc = new RTCPeerConnection(STUN)
    stream.getTracks().forEach(t => pc.addTrack(t, stream))

    pc.ontrack = (e) => {
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0]
    }

    pc.onicecandidate = (e) => {
      if (e.candidate && callCh.current) {
        callCh.current.send({ type: 'broadcast', event: 'ice', payload: { to: peerId, candidate: e.candidate.toJSON() } })
      }
    }

    setCall(prev => ({ ...prev, type: 'connected', pc, localStream: stream }))

    if (!isCallee) {
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      callCh.current!.send({ type: 'broadcast', event: 'offer', payload: { to: peerId, sdp: offer } })
    }
  }

  function callUser(peerId: string, peerName: string) {
    if (!user || !callCh.current) return
    setCall({ type: 'outgoing', peerId, peerName })
    callCh.current.send({
      type: 'broadcast', event: 'call-request',
      payload: { from: user.id, fromName: user.user_metadata?.display_name ?? 'anon', to: peerId },
    })
    initiatePeerConnection(peerId, false)
  }

  function acceptCall() {
    if (!user || !call.peerId || !callCh.current) return
    callCh.current.send({ type: 'broadcast', event: 'call-accept', payload: { from: user.id, to: call.peerId } })
    initiatePeerConnection(call.peerId, true)
  }

  const hangup = useCallback(() => {
    if (call.pc) { call.pc.close() }
    if (call.localStream) call.localStream.getTracks().forEach(t => t.stop())
    if (call.peerId && callCh.current && user) {
      callCh.current.send({ type: 'broadcast', event: 'hangup', payload: { to: call.peerId } })
    }
    setCall({ type: 'idle' })
    if (localVideoRef.current) localVideoRef.current.srcObject = null
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null
  }, [call, user])

  // ── Gate ─────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center pt-14">
        <p className="mono text-xs text-zinc-700">Loading...</p>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center pt-14">
        <div className="space-y-4 text-center">
          <p className="mono text-xs text-zinc-600">chat requires sign in</p>
          <a href="/auth/login" className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 text-sm text-zinc-400 transition-all duration-200 hover:bg-white/[0.07] hover:text-zinc-200">
            Sign in →
          </a>
        </div>
      </div>
    )
  }

  const isAdminUser = canAdmin(userRole)

  return (
    <div className="mx-auto flex max-w-2xl flex-col px-6 pb-20 pt-28" style={{ minHeight: '100vh' }}>

      {/* ── Video call overlay ───────────────────────────────── */}
      {call.type !== 'idle' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/90 backdrop-blur-md">
          <div className="glass-hi relative w-full max-w-xl rounded-3xl p-6 space-y-4">
            {call.type === 'incoming' && (
              <>
                <div className="text-center space-y-2">
                  <div className="mono text-[10px] tracking-widest text-zinc-500 uppercase">Incoming call</div>
                  <p className="text-lg font-semibold text-zinc-100">{call.peerName}</p>
                </div>
                <div className="flex justify-center gap-4">
                  <button onClick={acceptCall} className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg hover:bg-emerald-400 transition-all active:scale-95">
                    <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.68A2 2 0 012 1.07h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/>
                    </svg>
                  </button>
                  <button onClick={hangup} className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-500 text-white shadow-lg hover:bg-rose-400 transition-all active:scale-95">
                    <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <line x1="1" y1="1" x2="23" y2="23"/><path strokeLinecap="round" d="M16.72 11.06A10.94 10.94 0 0119 12.55M5 5a10.94 10.94 0 012.93 1.5m9.95 9.95a10.94 10.94 0 01-4.02 2.13M1.83 1.83l20.34 20.34"/>
                    </svg>
                  </button>
                </div>
              </>
            )}
            {call.type === 'outgoing' && (
              <div className="text-center space-y-4">
                <div className="mono text-[10px] tracking-widest text-zinc-500 uppercase animate-pulse">Calling...</div>
                <p className="text-lg font-semibold text-zinc-100">{call.peerName}</p>
                <button onClick={hangup} className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-500 text-white hover:bg-rose-400 transition-all">
                  <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <line x1="1" y1="1" x2="23" y2="23"/><path strokeLinecap="round" d="M16.72 11.06A10.94 10.94 0 0119 12.55"/>
                  </svg>
                </button>
              </div>
            )}
            {call.type === 'connected' && (
              <>
                <div className="relative aspect-video rounded-2xl overflow-hidden bg-zinc-900">
                  <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
                  <video ref={localVideoRef} autoPlay playsInline muted className="absolute bottom-3 right-3 w-28 rounded-xl border border-white/10 object-cover" />
                </div>
                <div className="flex justify-center gap-3">
                  <button
                    onClick={() => { if (call.localStream) call.localStream.getAudioTracks().forEach(t => { t.enabled = !t.enabled }) }}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-all"
                    title="Toggle mute"
                  >
                    <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path strokeLinecap="round" d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/>
                    </svg>
                  </button>
                  <button onClick={hangup} className="flex h-11 w-11 items-center justify-center rounded-full bg-rose-500 text-white hover:bg-rose-400 transition-all">
                    <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  </button>
                  <button
                    onClick={() => { if (call.localStream) call.localStream.getVideoTracks().forEach(t => { t.enabled = !t.enabled }) }}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-all"
                    title="Toggle camera"
                  >
                    <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                    </svg>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="mb-8">
        <div className="mb-3 flex items-center gap-2">
          <span className="h-px w-4 bg-zinc-800" />
          <span className="mono text-[10px] tracking-[0.15em] text-zinc-600 uppercase">Live Chat</span>
        </div>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-nacelle text-3xl font-semibold text-zinc-100 tracking-tight">Public Room</h1>
            <p className="mt-2 text-sm text-zinc-500">{messages.length} messages</p>
          </div>
          {/* Online count */}
          <div className="flex items-center gap-1.5 rounded-xl border border-white/[0.07] bg-zinc-900/40 px-3 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span className="mono text-[10px] text-zinc-500">{online.length} online</span>
          </div>
        </div>
      </div>

      {banned && (
        <div className="mb-4 rounded-xl border border-rose-500/20 bg-rose-500/[0.07] px-4 py-3 text-xs text-rose-400">
          You are banned from chat.
        </div>
      )}

      {/* ── Messages ─────────────────────────────────────────── */}
      <div
        className="glass-card mb-4 flex-1 overflow-y-auto rounded-2xl p-4 space-y-4"
        style={{ minHeight: 420, maxHeight: 540 }}
      >
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <p className="mono text-xs text-zinc-700">no messages yet</p>
          </div>
        )}
        {messages.map(m => {
          const msgReactions = reactions[m.id] ?? []
          const grouped = EMOJIS.reduce<Record<string, { count: number; mine: boolean }>>((acc, e) => {
            const rs = msgReactions.filter(r => r.emoji === e)
            if (rs.length > 0) acc[e] = { count: rs.length, mine: rs.some(r => r.user_id === user.id) }
            return acc
          }, {})

          const canDelete = m.user_id === user.id || isAdminUser

          return (
            <div
              key={m.id}
              className="group relative flex items-start gap-3"
              onMouseEnter={() => setHover(m.id)}
              onMouseLeave={() => setHover(null)}
            >
              <div className={
                'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-[10px] font-semibold ' +
                (m.is_owner
                  ? 'border border-amber-500/30 bg-amber-500/[0.12] text-amber-400'
                  : 'border border-white/[0.07] bg-zinc-800/60 text-zinc-500')
              }>
                {(m.user_name || 'A')[0].toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-0.5 flex items-baseline gap-2">
                  {m.is_owner ? (
                    <span className="mono text-xs font-semibold text-amber-400" style={{ textShadow: '0 0 10px rgba(245,158,11,0.4)' }}>
                      {m.user_name}<span className="ml-1.5 font-normal text-amber-500/50">(Owner)</span>
                    </span>
                  ) : (
                    <span className="mono text-xs font-medium text-zinc-400">{m.user_name}</span>
                  )}
                  <span className="mono text-[9px] text-zinc-700">{formatTime(m.created_at)}</span>
                </div>
                <p className={'text-sm leading-relaxed break-words ' + (m.is_owner ? 'text-amber-50/80' : 'text-zinc-300')}>
                  {m.message}
                </p>
                {/* Reactions row */}
                {Object.keys(grouped).length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {Object.entries(grouped).map(([emoji, { count, mine }]) => (
                      <button
                        key={emoji}
                        onClick={() => toggleReaction(m.id, emoji)}
                        className={
                          'flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] transition-all active:scale-95 ' +
                          (mine
                            ? 'border-zinc-600 bg-zinc-700/60 text-zinc-300'
                            : 'border-white/[0.07] bg-zinc-900/40 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300')
                        }
                      >
                        {emoji} {count}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {/* Hover actions */}
              {hover === m.id && (
                <div className="absolute -top-2 right-0 flex items-center gap-0.5 rounded-xl border border-white/[0.08] bg-zinc-900/90 backdrop-blur px-1.5 py-1 shadow-lg">
                  {EMOJIS.map(e => (
                    <button
                      key={e}
                      onClick={() => toggleReaction(m.id, e)}
                      className="rounded-lg px-1 py-0.5 text-xs hover:bg-white/[0.08] transition-all active:scale-95"
                    >
                      {e}
                    </button>
                  ))}
                  {canDelete && (
                    <button
                      onClick={() => deleteMessage(m)}
                      className="ml-1 rounded-lg px-1.5 py-0.5 mono text-[9px] text-zinc-600 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                    >
                      del
                    </button>
                  )}
                  {/* Call button — show if other user is online */}
                  {m.user_id && m.user_id !== user.id && online.some(o => o.user_id === m.user_id) && call.type === 'idle' && (
                    <button
                      onClick={() => callUser(m.user_id!, m.user_name)}
                      className="ml-0.5 rounded-lg px-1.5 py-0.5 mono text-[9px] text-zinc-600 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all"
                      title="Video call"
                    >
                      📹
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
        {/* Typing indicator */}
        {typing.length > 0 && (
          <div className="mono text-[10px] text-zinc-700">
            {typing.join(', ')} {typing.length === 1 ? 'is' : 'are'} typing...
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Input ────────────────────────────────────────────── */}
      {!banned && (
        <form
          onSubmit={e => { e.preventDefault(); send() }}
          className="flex gap-2"
        >
          <input
            type="text"
            placeholder="Message..."
            value={input}
            onChange={e => { setInput(e.target.value); broadcastTyping() }}
            maxLength={500}
            className="flex h-10 flex-1 rounded-xl border border-white/[0.08] bg-zinc-900/60 px-4 text-sm text-zinc-200 placeholder:text-zinc-600 transition-all duration-200 focus:border-white/[0.18] focus:outline-none shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="flex-shrink-0 flex h-10 items-center gap-2 rounded-xl bg-zinc-100 px-4 text-sm font-semibold text-zinc-950 transition-all duration-200 hover:bg-white active:scale-[0.98] disabled:opacity-40"
          >
            Send
          </button>
        </form>
      )}

      {isOwner(user.email ?? '') && (
        <p className="mt-3 text-center mono text-[10px] text-amber-500/40">
          Your messages appear in amber · (Owner) badge active
        </p>
      )}
    </div>
  )
}
