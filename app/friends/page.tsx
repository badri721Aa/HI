'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'

type Tab = 'friends' | 'dms' | 'calls'

interface Friend {
  id: string
  name: string
  status: 'online' | 'idle' | 'offline'
  activity: string
  avatar: string
}

const MOCK_FRIENDS: Friend[] = [
  { id: '1', name: 'Ahmad K.', status: 'online', activity: 'In Chat', avatar: 'A' },
  { id: '2', name: 'Sara M.', status: 'online', activity: 'Using Dev Tools', avatar: 'S' },
  { id: '3', name: 'Yousef R.', status: 'idle', activity: 'Last seen 12m ago', avatar: 'Y' },
  { id: '4', name: 'Mira L.', status: 'online', activity: 'Study Hub', avatar: 'M' },
  { id: '5', name: 'Hassan T.', status: 'offline', activity: 'Last seen 3h ago', avatar: 'H' },
]

const STATUS_DOT: Record<Friend['status'], string> = {
  online: 'bg-emerald-500',
  idle: 'bg-amber-500',
  offline: 'bg-zinc-600',
}

function Avatar({ letter, size = 'md', status }: { letter: string; size?: 'sm' | 'md' | 'lg'; status?: Friend['status'] }) {
  const sz = { sm: 'w-8 h-8 text-sm', md: 'w-10 h-10 text-base', lg: 'w-14 h-14 text-xl' }[size]
  const dot = { sm: 'w-2 h-2', md: 'w-2.5 h-2.5', lg: 'w-3 h-3' }[size]
  return (
    <div className="relative flex-shrink-0">
      <div className={`${sz} rounded-full bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center text-white font-semibold`}>
        {letter}
      </div>
      {status && <span className={`absolute -bottom-0.5 -right-0.5 ${dot} rounded-full ${STATUS_DOT[status]} ring-2 ring-zinc-950`} />}
    </div>
  )
}

export default function FriendsPage() {
  const [user, setUser] = useState<{ email?: string | null } | null>(null)
  const [tab, setTab] = useState<Tab>('friends')
  const [activeChat, setActiveChat] = useState<Friend | null>(null)
  const [dmsInput, setDmsInput] = useState('')
  const [dmMessages, setDmMessages] = useState<{ from: 'me' | 'them'; text: string; time: string }[]>([])
  const [callState, setCallState] = useState<'idle' | 'calling' | 'active'>('idle')
  const [callTarget, setCallTarget] = useState<Friend | null>(null)
  const [callDuration, setCallDuration] = useState(0)
  const sb = createClient()

  useEffect(() => {
    sb.auth.getUser().then(({ data }) => setUser(data.user ? { email: data.user.email } : null))
  }, [])

  useEffect(() => {
    if (callState !== 'active') { setCallDuration(0); return }
    const iv = setInterval(() => setCallDuration(s => s + 1), 1000)
    return () => clearInterval(iv)
  }, [callState])

  function sendDm() {
    const t = dmsInput.trim()
    if (!t || !activeChat) return
    setDmsInput('')
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    setDmMessages(m => [...m, { from: 'me', text: t, time: now }])
    setTimeout(() => {
      const replies = ['👍', 'Got it!', 'sure', 'lol ok', 'on it', 'makes sense', 'yeah definitely']
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      setDmMessages(m => [...m, { from: 'them', text: replies[Math.floor(Math.random() * replies.length)], time }])
    }, 1500 + Math.random() * 2000)
  }

  function startCall(friend: Friend) {
    setCallTarget(friend)
    setCallState('calling')
    setTimeout(() => setCallState('active'), 2500)
  }

  function endCall() {
    setCallState('idle')
    setCallTarget(null)
    setCallDuration(0)
  }

  function formatDur(s: number) {
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-zinc-400 mb-4">Sign in to use Friends & DMs</p>
          <a href="/auth/login" className="px-5 py-2.5 rounded-xl bg-white text-zinc-950 text-sm font-semibold">Sign in</a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      {/* Incoming call overlay */}
      <AnimatePresence>
        {callState !== 'idle' && callTarget && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 px-5 py-4 rounded-2xl border border-white/[0.08] bg-zinc-900/95 shadow-2xl"
            style={{ backdropFilter: 'blur(20px)', minWidth: 280 }}
          >
            <Avatar letter={callTarget.avatar} size="md" status="online" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-zinc-100">{callTarget.name}</p>
              <p className="text-xs text-zinc-500">
                {callState === 'calling' ? 'Calling…' : `Voice call · ${formatDur(callDuration)}`}
              </p>
            </div>
            {callState === 'calling' && (
              <div className="flex gap-2">
                <button onClick={endCall}
                  className="w-9 h-9 rounded-full bg-rose-600 hover:bg-rose-500 flex items-center justify-center transition-all">
                  <svg width="14" height="14" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                </button>
              </div>
            )}
            {callState === 'active' && (
              <button onClick={endCall}
                className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-medium text-white transition-all">
                End
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="border-b border-white/[0.04] px-6 py-5">
        <div className="mx-auto max-w-5xl flex items-center justify-between">
          <div>
            <h1 className="font-semibold text-zinc-100">Friends & DMs</h1>
            <p className="text-xs text-zinc-600 mt-0.5">
              {MOCK_FRIENDS.filter(f => f.status === 'online').length} online
            </p>
          </div>
          <button className="px-4 py-2 rounded-xl border border-white/[0.06] bg-zinc-900/60 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-all">
            + Add Friend
          </button>
        </div>
      </div>

      {/* Tab nav */}
      <div className="border-b border-white/[0.04]">
        <div className="mx-auto max-w-5xl px-6 flex">
          {([
            { id: 'friends' as Tab, label: 'Friends', count: MOCK_FRIENDS.filter(f => f.status === 'online').length },
            { id: 'dms' as Tab, label: 'Direct Messages' },
            { id: 'calls' as Tab, label: 'Calls' },
          ]).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-3.5 text-sm font-medium border-b-2 transition-colors ${tab === t.id ? 'border-violet-500 text-zinc-100' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>
              {t.label}
              {t.count != null && t.count > 0 && (
                <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-[10px] text-emerald-400 font-mono">{t.count}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 mx-auto w-full max-w-5xl px-6 py-6">

        {/* Friends list */}
        {tab === 'friends' && (
          <div className="space-y-2">
            {MOCK_FRIENDS.map(friend => (
              <motion.div key={friend.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-4 p-4 rounded-2xl border border-white/[0.06] bg-zinc-950/60 hover:border-white/[0.1] transition-all group"
                style={{ backdropFilter: 'blur(8px)' }}>
                <Avatar letter={friend.avatar} size="md" status={friend.status} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-200">{friend.name}</p>
                  <p className="text-xs text-zinc-600 truncate">{friend.activity}</p>
                </div>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => { setActiveChat(friend); setTab('dms') }}
                    className="px-3 py-1.5 rounded-lg text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-400 transition-all">
                    Message
                  </button>
                  {friend.status === 'online' && (
                    <button
                      onClick={() => startCall(friend)}
                      className="px-3 py-1.5 rounded-lg text-xs bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/20 transition-all">
                      Call
                    </button>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* DMs */}
        {tab === 'dms' && (
          <div className="flex gap-4 h-[600px]">
            {/* Sidebar */}
            <div className="w-52 flex-shrink-0 space-y-1">
              {MOCK_FRIENDS.map(f => (
                <button key={f.id}
                  onClick={() => { setActiveChat(f); setDmMessages([]) }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${activeChat?.id === f.id ? 'bg-violet-500/[0.12] border border-violet-500/20' : 'hover:bg-zinc-900'}`}>
                  <Avatar letter={f.avatar} size="sm" status={f.status} />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-zinc-300 truncate">{f.name}</p>
                    <p className={`text-[10px] truncate ${f.status === 'online' ? 'text-emerald-600' : 'text-zinc-600'}`}>{f.status}</p>
                  </div>
                </button>
              ))}
            </div>

            {/* Chat area */}
            <div className="flex-1 flex flex-col rounded-2xl border border-white/[0.06] bg-zinc-950/60 overflow-hidden" style={{ backdropFilter: 'blur(8px)' }}>
              {activeChat ? (
                <>
                  <div className="px-4 py-3 border-b border-white/[0.04] flex items-center gap-3">
                    <Avatar letter={activeChat.avatar} size="sm" status={activeChat.status} />
                    <div>
                      <p className="text-sm font-medium text-zinc-200">{activeChat.name}</p>
                      <p className="text-[10px] text-zinc-600">{activeChat.activity}</p>
                    </div>
                    <button onClick={() => startCall(activeChat)} className="ml-auto px-3 py-1.5 rounded-lg text-xs bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/20 transition-all">
                      📞 Call
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {dmMessages.length === 0 && (
                      <p className="text-xs text-zinc-700 text-center mt-10">No messages yet. Say something!</p>
                    )}
                    {dmMessages.map((m, i) => (
                      <div key={i} className={`flex flex-col ${m.from === 'me' ? 'items-end' : 'items-start'}`}>
                        <span className={`px-3 py-1.5 rounded-2xl text-sm max-w-[75%] ${m.from === 'me' ? 'bg-violet-600 text-white rounded-br-sm' : 'bg-zinc-800 text-zinc-300 rounded-bl-sm'}`}>
                          {m.text}
                        </span>
                        <span className="text-[10px] text-zinc-700 mt-0.5 px-1">{m.time}</span>
                      </div>
                    ))}
                  </div>
                  <div className="p-3 border-t border-white/[0.04] flex gap-2">
                    <input value={dmsInput} onChange={e => setDmsInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && sendDm()}
                      placeholder={`Message ${activeChat.name}…`}
                      className="flex-1 rounded-xl bg-zinc-900 border border-white/[0.06] px-3 py-2 text-sm text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/40" />
                    <button onClick={sendDm} disabled={!dmsInput.trim()}
                      className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-30 text-sm font-medium text-white transition-all">
                      →
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <p className="text-sm text-zinc-600">Select a conversation</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Calls tab */}
        {tab === 'calls' && (
          <div className="space-y-3">
            <p className="font-mono text-[10px] tracking-widest text-zinc-600 uppercase mb-4">Online friends</p>
            {MOCK_FRIENDS.filter(f => f.status === 'online').map(f => (
              <div key={f.id} className="flex items-center gap-4 p-4 rounded-2xl border border-white/[0.06] bg-zinc-950/60">
                <Avatar letter={f.avatar} size="md" status={f.status} />
                <div className="flex-1">
                  <p className="text-sm font-medium text-zinc-200">{f.name}</p>
                  <p className="text-xs text-zinc-600">{f.activity}</p>
                </div>
                <button onClick={() => startCall(f)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white transition-all active:scale-95"
                  style={{ boxShadow: '0 0 16px rgba(34,197,94,0.2)' }}>
                  <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z"/>
                  </svg>
                  Voice Call
                </button>
              </div>
            ))}
            <p className="text-xs text-zinc-700 text-center pt-4">Video calls and screen sharing coming soon · Push notifications via Web Push API</p>
          </div>
        )}
      </div>
    </div>
  )
}
