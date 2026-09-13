'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User, RealtimeChannel } from '@supabase/supabase-js'
import { isOwner, canAdmin, formatTime } from '@/lib/utils'

// ── Types ────────────────────────────────────────────────────────────────────

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

interface Peer {
  userId: string
  userName: string
  pc: RTCPeerConnection
  stream: MediaStream | null
  volume: number
  audioEnabled: boolean
}

interface CallMsg {
  id: string
  userId: string
  userName: string
  text: string
  type: 'chat' | 'question'
  pinned: boolean
  ts: number
}

// ── Constants ─────────────────────────────────────────────────────────────────

const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥']
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
}

function randomRoomId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ChatPage() {
  const sb = createClient()

  // Auth
  const [user, setUser] = useState<User | null>(null)
  const [userRole, setUserRole] = useState('user')
  const [banned, setBanned] = useState(false)

  // Main chat
  const [messages, setMessages] = useState<Message[]>([])
  const [reactions, setReactions] = useState<Record<string, Reaction[]>>({})
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [typing, setTyping] = useState<string[]>([])
  const [online, setOnline] = useState<PresenceState[]>([])
  const [hover, setHover] = useState<string | null>(null)
  const [chatTab, setChatTab] = useState<'chat' | 'qa'>('chat')

  // Call
  const [inCall, setInCall] = useState(false)
  const [callRoomId, setCallRoomId] = useState<string | null>(null)
  const [joinRoomInput, setJoinRoomInput] = useState('')
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [micMuted, setMicMuted] = useState(false)
  const [camOff, setCamOff] = useState(false)
  const [screenSharing, setScreenSharing] = useState(false)
  const [fullscreenPeer, setFullscreenPeer] = useState<string | null>(null)
  const [peerList, setPeerList] = useState<{ userId: string; userName: string; stream: MediaStream | null; volume: number; audioEnabled: boolean }[]>([])

  // In-call chat
  const [callMessages, setCallMessages] = useState<CallMsg[]>([])
  const [callInput, setCallInput] = useState('')
  const [handRaisers, setHandRaisers] = useState<Set<string>>(new Set())
  const [pinnedAnswers, setPinnedAnswers] = useState<Set<string>>(new Set())

  // Incoming call notification
  const [incomingCall, setIncomingCall] = useState<{ fromId: string; fromName: string; roomId: string } | null>(null)

  // Refs
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const peerVideoRefs = useRef<Map<string, HTMLVideoElement>>(new Map())
  const peersRef = useRef<Map<string, Peer>>(new Map())
  const presenceCh = useRef<RealtimeChannel | null>(null)
  const callCh = useRef<RealtimeChannel | null>(null)
  const notifCh = useRef<RealtimeChannel | null>(null)
  const callMsgBottom = useRef<HTMLDivElement>(null)
  const msgBottom = useRef<HTMLDivElement>(null)
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const screenTrackRef = useRef<MediaStreamTrack | null>(null)
  const userRef = useRef<User | null>(null)

  // ── Init ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    sb.auth.getUser().then(async ({ data }) => {
      const u = data.user
      setUser(u)
      userRef.current = u
      if (!u) return

      const uid = u.id
      const uname = u.user_metadata?.display_name ?? u.email?.split('@')[0] ?? 'anon'

      const { data: p } = await sb.from('profiles').select('role').eq('id', uid).single()
      if (p) setUserRole(p.role)

      const { data: ban } = await sb.from('banned_users').select('id').eq('name', u.email ?? '').single()
      if (ban) setBanned(true)

      fetchMessages()
      fetchReactions()

      // Presence + main chat changes
      presenceCh.current = sb.channel('chat-presence', { config: { presence: { key: uid } } })
        .on('presence', { event: 'sync' }, () => {
          const state = presenceCh.current!.presenceState<PresenceState>()
          setOnline(Object.values(state).flat())
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, ({ new: row }) => {
          setMessages(prev => [...prev, row as Message])
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_messages' }, ({ new: row }) => {
          const msg = row as Message
          setMessages(prev => msg.deleted
            ? prev.filter(m => m.id !== msg.id)
            : prev.map(m => m.id === msg.id ? msg : m))
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'message_reactions' }, ({ new: row }) => {
          const r = row as Reaction
          setReactions(prev => ({ ...prev, [r.message_id]: [...(prev[r.message_id] ?? []), r] }))
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'message_reactions' }, ({ old }) => {
          const o = old as Reaction
          setReactions(prev => ({ ...prev, [o.message_id]: (prev[o.message_id] ?? []).filter(r => r.id !== o.id) }))
        })
        .on('broadcast', { event: 'typing' }, ({ payload }: { payload: { name: string; uid: string } }) => {
          if (payload.uid === uid) return
          setTyping(prev => prev.includes(payload.name) ? prev : [...prev, payload.name])
          setTimeout(() => setTyping(prev => prev.filter(n => n !== payload.name)), 3000)
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await presenceCh.current!.track({ user_id: uid, user_name: uname, online_at: Date.now() })
          }
        })

      // Incoming call notifications
      notifCh.current = sb.channel(`call-notif-${uid}`)
        .on('broadcast', { event: 'incoming-call' }, ({ payload }: { payload: { fromId: string; fromName: string; roomId: string } }) => {
          setIncomingCall(payload)
        })
        .subscribe()
    })

    return () => {
      if (presenceCh.current) sb.removeChannel(presenceCh.current)
      if (callCh.current) sb.removeChannel(callCh.current)
      if (notifCh.current) sb.removeChannel(notifCh.current)
      leaveCallCleanup()
    }
  }, [])

  useEffect(() => { msgBottom.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])
  useEffect(() => { callMsgBottom.current?.scrollIntoView({ behavior: 'smooth' }) }, [callMessages])

  // ── Chat ──────────────────────────────────────────────────────────────────

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

  async function sendMessage() {
    if (!input.trim() || !user || banned) return
    setLoading(true)
    const displayName = user.user_metadata?.display_name ?? user.email?.split('@')[0] ?? 'anon'
    await sb.from('chat_messages').insert({
      user_id: user.id,
      user_name: displayName,
      message: input.trim(),
      is_owner: isOwner(user.email ?? ''),
      deleted: false,
    })
    setInput('')
    setLoading(false)
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

  // ── WebRTC ────────────────────────────────────────────────────────────────

  function syncPeerList() {
    setPeerList(Array.from(peersRef.current.values()).map(p => ({
      userId: p.userId,
      userName: p.userName,
      stream: p.stream,
      volume: p.volume,
      audioEnabled: p.audioEnabled,
    })))
  }

  async function createPeer(remoteUserId: string, remoteUserName: string, isInitiator: boolean) {
    const pc = new RTCPeerConnection(ICE_SERVERS)
    const peer: Peer = { userId: remoteUserId, userName: remoteUserName, pc, stream: null, volume: 1, audioEnabled: true }
    peersRef.current.set(remoteUserId, peer)

    // Add local tracks
    if (localStream) {
      localStream.getTracks().forEach(t => pc.addTrack(t, localStream!))
    }

    pc.ontrack = (e) => {
      peer.stream = e.streams[0]
      peersRef.current.set(remoteUserId, { ...peer, stream: e.streams[0] })
      syncPeerList()
      // Attach stream to video element if mounted
      const vid = peerVideoRefs.current.get(remoteUserId)
      if (vid) vid.srcObject = e.streams[0]
    }

    pc.onicecandidate = (e) => {
      if (e.candidate && callCh.current) {
        callCh.current.send({
          type: 'broadcast', event: 'ice',
          payload: { from: userRef.current!.id, to: remoteUserId, candidate: e.candidate.toJSON() },
        })
      }
    }

    pc.onconnectionstatechange = () => {
      if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
        peersRef.current.delete(remoteUserId)
        syncPeerList()
      }
    }

    if (isInitiator) {
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      callCh.current!.send({
        type: 'broadcast', event: 'offer',
        payload: { from: userRef.current!.id, to: remoteUserId, sdp: offer },
      })
    }

    syncPeerList()
    return pc
  }

  async function startCall(roomId: string) {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true }).catch(() =>
      navigator.mediaDevices.getUserMedia({ audio: true })
    )
    setLocalStream(stream)
    if (localVideoRef.current) localVideoRef.current.srcObject = stream

    const uid = userRef.current!.id
    const uname = userRef.current!.user_metadata?.display_name ?? userRef.current!.email?.split('@')[0] ?? 'anon'

    callCh.current = sb.channel(`call-room-${roomId}`, { config: { presence: { key: uid } } })
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        for (const p of newPresences as { user_id: string; user_name: string }[]) {
          if (p.user_id === uid) continue
          // New peer joined — I initiate the offer
          createPeer(p.user_id, p.user_name, true)
        }
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        for (const p of leftPresences as { user_id: string }[]) {
          const peer = peersRef.current.get(p.user_id)
          if (peer) { peer.pc.close(); peersRef.current.delete(p.user_id) }
        }
        syncPeerList()
      })
      .on('broadcast', { event: 'offer' }, async ({ payload }: { payload: { from: string; to: string; sdp: RTCSessionDescriptionInit } }) => {
        if (payload.to !== uid) return
        let peer = peersRef.current.get(payload.from)
        let pc: RTCPeerConnection
        if (!peer) {
          // Get name from presence
          const state = callCh.current!.presenceState<{ user_id: string; user_name: string }>()
          const entry = Object.values(state).flat().find(s => s.user_id === payload.from)
          pc = await createPeer(payload.from, entry?.user_name ?? 'User', false)
          peer = peersRef.current.get(payload.from)!
        } else {
          pc = peer.pc
        }
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        callCh.current!.send({
          type: 'broadcast', event: 'answer',
          payload: { from: uid, to: payload.from, sdp: answer },
        })
      })
      .on('broadcast', { event: 'answer' }, async ({ payload }: { payload: { from: string; to: string; sdp: RTCSessionDescriptionInit } }) => {
        if (payload.to !== uid) return
        const peer = peersRef.current.get(payload.from)
        if (peer) await peer.pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
      })
      .on('broadcast', { event: 'ice' }, async ({ payload }: { payload: { from: string; to: string; candidate: RTCIceCandidateInit } }) => {
        if (payload.to !== uid) return
        const peer = peersRef.current.get(payload.from)
        if (peer) { try { await peer.pc.addIceCandidate(new RTCIceCandidate(payload.candidate)) } catch {} }
      })
      .on('broadcast', { event: 'call-chat' }, ({ payload }: { payload: CallMsg }) => {
        setCallMessages(prev => [...prev, payload])
        if (payload.type === 'question') setChatTab('qa')
      })
      .on('broadcast', { event: 'hand-raise' }, ({ payload }: { payload: { userId: string } }) => {
        setHandRaisers(prev => new Set([...prev, payload.userId]))
      })
      .on('broadcast', { event: 'hand-lower' }, ({ payload }: { payload: { userId: string } }) => {
        setHandRaisers(prev => { const n = new Set(prev); n.delete(payload.userId); return n })
      })
      .on('broadcast', { event: 'pin-answer' }, ({ payload }: { payload: { messageId: string } }) => {
        setPinnedAnswers(prev => new Set([...prev, payload.messageId]))
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await callCh.current!.track({ user_id: uid, user_name: uname })
        }
      })

    setCallRoomId(roomId)
    setInCall(true)
  }

  function leaveCallCleanup() {
    peersRef.current.forEach(p => p.pc.close())
    peersRef.current.clear()
    setPeerList([])
    localStream?.getTracks().forEach(t => t.stop())
    screenTrackRef.current?.stop()
    setLocalStream(null)
    setCallRoomId(null)
    setInCall(false)
    setMicMuted(false)
    setCamOff(false)
    setScreenSharing(false)
    setCallMessages([])
    setHandRaisers(new Set())
    setPinnedAnswers(new Set())
    if (localVideoRef.current) localVideoRef.current.srcObject = null
    if (callCh.current) { sb.removeChannel(callCh.current); callCh.current = null }
  }

  async function leaveCall() {
    leaveCallCleanup()
  }

  async function createRoom() {
    const roomId = randomRoomId()
    await startCall(roomId)
  }

  async function joinRoom(roomId: string) {
    if (!roomId.trim()) return
    await startCall(roomId.trim().toUpperCase())
  }

  async function callOnlineUser(targetUserId: string, targetUserName: string) {
    if (!userRef.current || inCall) return
    const roomId = randomRoomId()
    // Notify target user
    await sb.channel(`call-notif-${targetUserId}`).send({
      type: 'broadcast', event: 'incoming-call',
      payload: {
        fromId: userRef.current.id,
        fromName: userRef.current.user_metadata?.display_name ?? 'User',
        roomId,
      },
    })
    await startCall(roomId)
  }

  // ── Call controls ─────────────────────────────────────────────────────────

  function toggleMic() {
    if (!localStream) return
    localStream.getAudioTracks().forEach(t => { t.enabled = !t.enabled })
    setMicMuted(m => !m)
  }

  function toggleCam() {
    if (!localStream) return
    localStream.getVideoTracks().forEach(t => { t.enabled = !t.enabled })
    setCamOff(c => !c)
  }

  async function toggleScreenShare() {
    if (screenSharing) {
      screenTrackRef.current?.stop()
      screenTrackRef.current = null
      // Restore camera track
      const camTrack = localStream?.getVideoTracks()[0]
      if (camTrack) {
        peersRef.current.forEach(({ pc }) => {
          const sender = pc.getSenders().find(s => s.track?.kind === 'video')
          if (sender) sender.replaceTrack(camTrack)
        })
      }
      setScreenSharing(false)
      return
    }
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
      const screenTrack = screenStream.getVideoTracks()[0]
      screenTrackRef.current = screenTrack
      peersRef.current.forEach(({ pc }) => {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video')
        if (sender) sender.replaceTrack(screenTrack)
      })
      screenTrack.onended = () => toggleScreenShare()
      // Show screen locally
      if (localVideoRef.current) {
        const mixed = new MediaStream()
        mixed.addTrack(screenTrack)
        localStream?.getAudioTracks().forEach(t => mixed.addTrack(t))
        localVideoRef.current.srcObject = mixed
      }
      setScreenSharing(true)
    } catch {}
  }

  function setPeerVolume(userId: string, vol: number) {
    const peer = peersRef.current.get(userId)
    if (peer) peer.volume = vol
    const vid = peerVideoRefs.current.get(userId)
    if (vid) vid.volume = vol
    syncPeerList()
  }

  // ── In-call chat ──────────────────────────────────────────────────────────

  function sendCallMessage(type: 'chat' | 'question' = 'chat') {
    if (!callInput.trim() || !userRef.current || !callCh.current) return
    const msg: CallMsg = {
      id: crypto.randomUUID(),
      userId: userRef.current.id,
      userName: userRef.current.user_metadata?.display_name ?? 'anon',
      text: callInput.trim(),
      type,
      pinned: false,
      ts: Date.now(),
    }
    callCh.current.send({ type: 'broadcast', event: 'call-chat', payload: msg })
    setCallMessages(prev => [...prev, msg])
    setCallInput('')
  }

  function raiseHand() {
    if (!userRef.current || !callCh.current) return
    const userId = userRef.current.id
    const isRaised = handRaisers.has(userId)
    callCh.current.send({
      type: 'broadcast',
      event: isRaised ? 'hand-lower' : 'hand-raise',
      payload: { userId },
    })
    setHandRaisers(prev => {
      const n = new Set(prev)
      if (isRaised) n.delete(userId); else n.add(userId)
      return n
    })
  }

  function pinAnswer(messageId: string) {
    if (!callCh.current) return
    callCh.current.send({ type: 'broadcast', event: 'pin-answer', payload: { messageId } })
    setPinnedAnswers(prev => new Set([...prev, messageId]))
  }

  // ── Guards ────────────────────────────────────────────────────────────────

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center pt-14">
        <div className="space-y-4 text-center">
          <p className="font-mono text-xs text-zinc-600">chat requires sign in</p>
          <a href="/auth/login" className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 text-sm text-zinc-400 transition-all duration-200 hover:bg-white/[0.07] hover:text-zinc-200">
            Sign in →
          </a>
        </div>
      </div>
    )
  }

  const isAdminUser = canAdmin(userRole)
  const myId = user.id
  const myHandRaised = handRaisers.has(myId)

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-screen flex-col pt-16" style={{ background: 'rgb(9,9,11)' }}>

      {/* ── Incoming call toast ─────────────────────────────────────────── */}
      {incomingCall && !inCall && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 rounded-2xl border border-white/10 px-5 py-3 shadow-2xl"
          style={{ background: 'rgba(9,9,11,0.95)', backdropFilter: 'blur(20px)' }}>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 text-xl">📹</div>
          <div>
            <div className="text-sm font-semibold text-zinc-200">{incomingCall.fromName} is calling</div>
            <div className="font-mono text-[10px] text-zinc-600">Room: {incomingCall.roomId}</div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { joinRoom(incomingCall.roomId); setIncomingCall(null) }}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-white hover:bg-emerald-400 transition-all"
            >✓</button>
            <button
              onClick={() => setIncomingCall(null)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 transition-all"
            >✕</button>
          </div>
        </div>
      )}

      <div className={`flex flex-1 gap-0 ${inCall ? 'flex-col lg:flex-row' : ''}`}>

        {/* ══ VIDEO PANEL (shown in call) ════════════════════════════════ */}
        {inCall && (
          <div className="flex flex-col lg:w-[60%] border-b lg:border-b-0 lg:border-r border-white/[0.06]" style={{ background: 'rgb(6,6,8)' }}>

            {/* Room header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.05]">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-mono text-xs text-zinc-400">Room {callRoomId}</span>
                <span className="font-mono text-[10px] text-zinc-700">{peerList.length + 1} participant{peerList.length !== 0 ? 's' : ''}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { navigator.clipboard.writeText(callRoomId ?? '') }}
                  className="font-mono text-[10px] text-zinc-600 hover:text-zinc-300 border border-white/[0.06] rounded-lg px-2 py-1 hover:border-white/10 transition-all"
                >
                  Copy ID
                </button>
              </div>
            </div>

            {/* Video grid */}
            <div className="flex-1 p-3 overflow-auto">
              {(() => {
                const totalParticipants = peerList.length + 1
                const cols = totalParticipants === 1 ? 1 : totalParticipants <= 4 ? 2 : 3
                return (
                  <div className={`grid gap-2 h-full`} style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
                    {/* Local video */}
                    <div
                      className="relative rounded-xl overflow-hidden bg-zinc-900 aspect-video cursor-pointer"
                      onClick={() => setFullscreenPeer(fullscreenPeer === 'local' ? null : 'local')}
                      style={fullscreenPeer === 'local' ? { gridColumn: '1 / -1', gridRow: '1 / -1' } : {}}
                    >
                      <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                      <div className="absolute bottom-2 left-2 flex items-center gap-1.5">
                        <span className="rounded-md bg-black/60 px-2 py-0.5 font-mono text-[10px] text-zinc-300">You</span>
                        {micMuted && <span className="rounded-md bg-rose-500/20 px-1.5 py-0.5 font-mono text-[9px] text-rose-400">muted</span>}
                        {screenSharing && <span className="rounded-md bg-blue-500/20 px-1.5 py-0.5 font-mono text-[9px] text-blue-400">screen</span>}
                        {handRaisers.has(myId) && <span className="text-xs">✋</span>}
                      </div>
                    </div>

                    {/* Remote peers */}
                    {peerList.map(peer => (
                      <div
                        key={peer.userId}
                        className="relative rounded-xl overflow-hidden bg-zinc-900 aspect-video group cursor-pointer"
                        onClick={() => setFullscreenPeer(fullscreenPeer === peer.userId ? null : peer.userId)}
                        style={fullscreenPeer === peer.userId ? { gridColumn: '1 / -1', gridRow: '1 / -1' } : {}}
                      >
                        <video
                          autoPlay playsInline
                          className="w-full h-full object-cover"
                          ref={el => {
                            if (el) {
                              peerVideoRefs.current.set(peer.userId, el)
                              if (peer.stream) el.srcObject = peer.stream
                              el.volume = peer.volume
                            }
                          }}
                        />
                        {!peer.stream && (
                          <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
                            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-800 text-2xl font-semibold text-zinc-400">
                              {peer.userName[0]?.toUpperCase()}
                            </div>
                          </div>
                        )}
                        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                          <div className="flex items-center gap-1">
                            <span className="rounded-md bg-black/60 px-2 py-0.5 font-mono text-[10px] text-zinc-300">{peer.userName}</span>
                            {handRaisers.has(peer.userId) && <span className="text-xs">✋</span>}
                          </div>
                        </div>
                        {/* Volume slider (shown on hover) */}
                        <div className="absolute bottom-8 left-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2 px-1">
                          <svg width="10" height="10" fill="currentColor" viewBox="0 0 24 24" className="text-zinc-500 flex-shrink-0">
                            <path d="M3 9v6h4l5 5V4L7 9H3z"/>
                          </svg>
                          <input
                            type="range" min={0} max={1} step={0.05}
                            defaultValue={1}
                            onChange={e => setPeerVolume(peer.userId, parseFloat(e.target.value))}
                            onClick={e => e.stopPropagation()}
                            className="flex-1 h-1 accent-zinc-400"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })()}
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-2 px-4 py-3 border-t border-white/[0.05]">
              <button
                onClick={toggleMic}
                title={micMuted ? 'Unmute' : 'Mute'}
                className={`flex h-10 w-10 items-center justify-center rounded-full border transition-all ${micMuted ? 'border-rose-500/40 bg-rose-500/20 text-rose-400' : 'border-white/10 bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}
              >
                {micMuted ? (
                  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <line x1="1" y1="1" x2="23" y2="23"/><path strokeLinecap="round" d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6M17 16.95A7 7 0 015 12v-2m14 0v2a7 7 0 01-.11 1.23M12 20v4M8 24h8"/>
                  </svg>
                ) : (
                  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path strokeLinecap="round" d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/>
                  </svg>
                )}
              </button>

              <button
                onClick={toggleCam}
                title={camOff ? 'Enable camera' : 'Disable camera'}
                className={`flex h-10 w-10 items-center justify-center rounded-full border transition-all ${camOff ? 'border-rose-500/40 bg-rose-500/20 text-rose-400' : 'border-white/10 bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}
              >
                {camOff ? (
                  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <line x1="1" y1="1" x2="23" y2="23"/>
                    <path strokeLinecap="round" d="M21 21l-6-6m-2-2H5a2 2 0 01-2-2V8m3-3h9a2 2 0 012 2v3.5l4-2.5v11.5"/>
                  </svg>
                ) : (
                  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                  </svg>
                )}
              </button>

              <button
                onClick={toggleScreenShare}
                title={screenSharing ? 'Stop sharing' : 'Share screen'}
                className={`flex h-10 w-10 items-center justify-center rounded-full border transition-all ${screenSharing ? 'border-blue-500/40 bg-blue-500/20 text-blue-400' : 'border-white/10 bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}
              >
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <rect x="2" y="3" width="20" height="14" rx="2"/><path strokeLinecap="round" d="M8 21h8M12 17v4"/>
                </svg>
              </button>

              <button
                onClick={raiseHand}
                title={myHandRaised ? 'Lower hand' : 'Raise hand'}
                className={`flex h-10 w-10 items-center justify-center rounded-full border text-base transition-all ${myHandRaised ? 'border-amber-500/40 bg-amber-500/20' : 'border-white/10 bg-zinc-800 hover:bg-zinc-700'}`}
              >
                ✋
              </button>

              <button
                onClick={leaveCall}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-500 text-white hover:bg-rose-400 transition-all"
                title="Leave call"
              >
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" d="M10.68 13.31a16 16 0 003.41 2.6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013 5.18 19.79 19.79 0 016.07 2a2 2 0 012-.18l.08.07a12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L7.12 8.08a16 16 0 003.41 3.41"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* ══ RIGHT PANEL: Chat + Q&A ════════════════════════════════════ */}
        <div className={`flex flex-col ${inCall ? 'flex-1 lg:w-[40%]' : 'flex-1 max-w-4xl mx-auto w-full px-4'}`}>

          {/* Header */}
          <div className={`flex items-center justify-between px-4 py-3 border-b border-white/[0.06] ${!inCall ? 'pt-8' : ''}`}>
            <div>
              {!inCall && (
                <div className="mb-1 flex items-center gap-2">
                  <span className="h-px w-4 bg-zinc-800" />
                  <span className="font-mono text-[10px] tracking-[0.15em] text-zinc-600 uppercase">Live Chat</span>
                </div>
              )}
              <h1 className={`font-nacelle font-semibold text-zinc-100 tracking-tight ${inCall ? 'text-lg' : 'text-2xl'}`}>
                {inCall ? 'Chat & Q&A' : 'Public Room'}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              {!inCall && (
                <div className="flex items-center gap-1.5 rounded-xl border border-white/[0.07] bg-zinc-900/40 px-3 py-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  <span className="font-mono text-[10px] text-zinc-500">{online.length} online</span>
                </div>
              )}
            </div>
          </div>

          {/* Tabs (in-call only) */}
          {inCall && (
            <div className="flex border-b border-white/[0.05] px-2 pt-1">
              {(['chat', 'qa'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setChatTab(tab)}
                  className={`px-4 py-2 font-mono text-[11px] uppercase tracking-wider transition-all border-b-2 ${chatTab === tab ? 'border-zinc-400 text-zinc-200' : 'border-transparent text-zinc-600 hover:text-zinc-400'}`}
                >
                  {tab === 'chat' ? 'Chat' : `Q&A${pinnedAnswers.size > 0 ? ` · ${pinnedAnswers.size}` : ''}`}
                </button>
              ))}
              {handRaisers.size > 0 && (
                <div className="ml-auto flex items-center gap-1 px-3 font-mono text-[10px] text-amber-400">
                  ✋ {handRaisers.size}
                </div>
              )}
            </div>
          )}

          {banned && (
            <div className="mx-4 mt-3 rounded-xl border border-rose-500/20 bg-rose-500/[0.07] px-4 py-2 text-xs text-rose-400">
              You are banned from chat.
            </div>
          )}

          {/* ── In-call chat / Q&A ───────────────────────────────────── */}
          {inCall ? (
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {chatTab === 'chat' ? (
                  <>
                    {callMessages.filter(m => m.type === 'chat').map(msg => (
                      <div key={msg.id} className="flex items-start gap-2">
                        <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-zinc-800 text-[10px] font-semibold text-zinc-500">
                          {msg.userName[0]?.toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-baseline gap-2">
                            <span className="font-mono text-[10px] text-zinc-500">{msg.userName}</span>
                            <span className="font-mono text-[9px] text-zinc-700">{new Date(msg.ts).toLocaleTimeString()}</span>
                          </div>
                          <p className="text-xs text-zinc-300 leading-relaxed">{msg.text}</p>
                        </div>
                      </div>
                    ))}
                    {callMessages.filter(m => m.type === 'chat').length === 0 && (
                      <p className="text-center font-mono text-[10px] text-zinc-700 pt-8">no messages yet</p>
                    )}
                    <div ref={callMsgBottom} />
                  </>
                ) : (
                  // Q&A tab
                  <>
                    {callMessages.filter(m => m.type === 'question').length === 0 && (
                      <p className="text-center font-mono text-[10px] text-zinc-700 pt-8">no questions yet · ask with the ? button</p>
                    )}
                    {callMessages.filter(m => m.type === 'question').map(msg => (
                      <div
                        key={msg.id}
                        className={`rounded-xl p-3 ${pinnedAnswers.has(msg.id) ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-zinc-900/60 border border-white/[0.05]'}`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="flex items-baseline gap-2">
                            <span className="font-mono text-[10px] text-zinc-500">{msg.userName}</span>
                            {pinnedAnswers.has(msg.id) && (
                              <span className="font-mono text-[9px] text-amber-400 border border-amber-500/20 rounded px-1">Best Answer</span>
                            )}
                          </div>
                          {!pinnedAnswers.has(msg.id) && (isAdminUser || msg.userId === myId) && (
                            <button
                              onClick={() => pinAnswer(msg.id)}
                              className="font-mono text-[9px] text-zinc-600 hover:text-amber-400 transition-colors"
                            >
                              pin ★
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-zinc-300">❓ {msg.text}</p>
                      </div>
                    ))}
                  </>
                )}
              </div>

              {/* Call chat input */}
              <div className="border-t border-white/[0.05] p-3 flex gap-2">
                <input
                  value={callInput}
                  onChange={e => setCallInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendCallMessage('chat') } }}
                  placeholder="Message…"
                  className="flex-1 h-8 rounded-lg border border-white/[0.07] bg-zinc-900 px-3 text-xs text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-white/[0.15] transition-colors"
                />
                <button
                  onClick={() => sendCallMessage('chat')}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-700 text-zinc-300 hover:bg-zinc-600 text-xs transition-all"
                  title="Send"
                >↵</button>
                <button
                  onClick={() => sendCallMessage('question')}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-500/20 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 text-xs transition-all"
                  title="Ask a question"
                >?</button>
              </div>
            </div>
          ) : (
            /* ── Main public chat ─────────────────────────────────────── */
            <div className="flex flex-1 gap-0">
              {/* Messages column */}
              <div className="flex flex-1 flex-col min-w-0">
                <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ maxHeight: 'calc(100vh - 280px)' }}>
                  {messages.length === 0 && (
                    <div className="flex h-32 items-center justify-center">
                      <p className="font-mono text-xs text-zinc-700">no messages yet</p>
                    </div>
                  )}
                  {messages.map(m => {
                    const msgReactions = reactions[m.id] ?? []
                    const grouped = EMOJIS.reduce<Record<string, { count: number; mine: boolean }>>((acc, e) => {
                      const rs = msgReactions.filter(r => r.emoji === e)
                      if (rs.length > 0) acc[e] = { count: rs.length, mine: rs.some(r => r.user_id === myId) }
                      return acc
                    }, {})
                    const canDelete = m.user_id === myId || isAdminUser
                    return (
                      <div
                        key={m.id}
                        className="group relative flex items-start gap-3"
                        onMouseEnter={() => setHover(m.id)}
                        onMouseLeave={() => setHover(null)}
                      >
                        <div className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-[10px] font-semibold ${m.is_owner ? 'border border-amber-500/30 bg-amber-500/[0.12] text-amber-400' : 'border border-white/[0.07] bg-zinc-800/60 text-zinc-500'}`}>
                          {(m.user_name || 'A')[0].toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="mb-0.5 flex items-baseline gap-2">
                            {m.is_owner ? (
                              <span className="font-mono text-xs font-semibold text-amber-400" style={{ textShadow: '0 0 10px rgba(245,158,11,0.4)' }}>
                                {m.user_name}<span className="ml-1.5 font-normal text-amber-500/50">(Owner)</span>
                              </span>
                            ) : (
                              <span className="font-mono text-xs font-medium text-zinc-400">{m.user_name}</span>
                            )}
                            <span className="font-mono text-[9px] text-zinc-700">{formatTime(m.created_at)}</span>
                          </div>
                          <p className={`text-sm leading-relaxed break-words ${m.is_owner ? 'text-amber-50/80' : 'text-zinc-300'}`}>{m.message}</p>
                          {Object.keys(grouped).length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {Object.entries(grouped).map(([emoji, { count, mine }]) => (
                                <button
                                  key={emoji}
                                  onClick={() => toggleReaction(m.id, emoji)}
                                  className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] transition-all active:scale-95 ${mine ? 'border-zinc-600 bg-zinc-700/60 text-zinc-300' : 'border-white/[0.07] bg-zinc-900/40 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300'}`}
                                >
                                  {emoji} {count}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        {hover === m.id && (
                          <div className="absolute -top-2 right-0 flex items-center gap-0.5 rounded-xl border border-white/[0.08] bg-zinc-900/90 backdrop-blur px-1.5 py-1 shadow-lg z-10">
                            {EMOJIS.map(e => (
                              <button key={e} onClick={() => toggleReaction(m.id, e)} className="rounded-lg px-1 py-0.5 text-xs hover:bg-white/[0.08] transition-all active:scale-95">{e}</button>
                            ))}
                            {canDelete && (
                              <button onClick={() => deleteMessage(m)} className="ml-1 rounded-lg px-1.5 py-0.5 font-mono text-[9px] text-zinc-600 hover:text-rose-400 hover:bg-rose-500/10 transition-all">del</button>
                            )}
                            {m.user_id && m.user_id !== myId && online.some(o => o.user_id === m.user_id) && (
                              <button onClick={() => callOnlineUser(m.user_id!, m.user_name)} className="ml-0.5 rounded-lg px-1.5 py-0.5 font-mono text-[9px] text-zinc-600 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all" title="Video call">📹</button>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {typing.length > 0 && (
                    <div className="font-mono text-[10px] text-zinc-700">{typing.join(', ')} {typing.length === 1 ? 'is' : 'are'} typing…</div>
                  )}
                  <div ref={msgBottom} />
                </div>

                {/* Message input */}
                {!banned && (
                  <form onSubmit={e => { e.preventDefault(); sendMessage() }} className="border-t border-white/[0.05] p-4 flex gap-2">
                    <input
                      type="text"
                      placeholder="Message..."
                      value={input}
                      onChange={e => { setInput(e.target.value); broadcastTyping() }}
                      disabled={loading}
                      maxLength={500}
                      className="flex h-10 flex-1 rounded-xl border border-white/[0.08] bg-zinc-900/60 px-4 text-sm text-zinc-200 placeholder:text-zinc-600 transition-all focus:border-white/[0.18] outline-none"
                    />
                    <button type="submit" disabled={loading || !input.trim()} className="flex-shrink-0 flex h-10 items-center gap-2 rounded-xl bg-zinc-100 px-4 text-sm font-semibold text-zinc-950 transition-all hover:bg-white active:scale-[0.98] disabled:opacity-40">
                      Send
                    </button>
                  </form>
                )}
              </div>

              {/* Online users + call sidebar */}
              <div className="hidden md:flex flex-col w-56 border-l border-white/[0.05] flex-shrink-0">
                {/* Call room controls */}
                <div className="p-3 border-b border-white/[0.05]">
                  <div className="font-mono text-[10px] text-zinc-600 uppercase tracking-wider mb-2">Video Room</div>
                  <div className="flex flex-col gap-1.5">
                    <button
                      onClick={createRoom}
                      className="flex h-8 items-center justify-center gap-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 text-xs font-medium hover:bg-emerald-500/25 transition-all"
                    >
                      + Create Room
                    </button>
                    <div className="flex gap-1">
                      <input
                        value={joinRoomInput}
                        onChange={e => setJoinRoomInput(e.target.value.toUpperCase())}
                        onKeyDown={e => { if (e.key === 'Enter') joinRoom(joinRoomInput) }}
                        placeholder="Room code"
                        maxLength={6}
                        className="flex-1 h-8 rounded-lg border border-white/[0.07] bg-zinc-900 px-2 font-mono text-xs text-zinc-300 placeholder:text-zinc-700 outline-none focus:border-white/[0.15] uppercase transition-colors"
                      />
                      <button
                        onClick={() => joinRoom(joinRoomInput)}
                        disabled={joinRoomInput.length < 3}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.07] bg-zinc-900 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 disabled:opacity-30 transition-all text-xs"
                      >→</button>
                    </div>
                  </div>
                </div>

                {/* Online users */}
                <div className="flex-1 overflow-y-auto p-3">
                  <div className="font-mono text-[10px] text-zinc-600 uppercase tracking-wider mb-2">Online · {online.length}</div>
                  <div className="space-y-1">
                    {online.map(u => (
                      <div key={u.user_id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-white/[0.03] group">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                          <span className="font-mono text-[11px] text-zinc-500 truncate">{u.user_name}</span>
                        </div>
                        {u.user_id !== myId && (
                          <button
                            onClick={() => callOnlineUser(u.user_id, u.user_name)}
                            className="opacity-0 group-hover:opacity-100 font-mono text-[9px] text-zinc-600 hover:text-emerald-400 transition-all"
                            title="Call"
                          >📹</button>
                        )}
                      </div>
                    ))}
                    {online.length === 0 && (
                      <p className="font-mono text-[10px] text-zinc-700">No one here yet</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
