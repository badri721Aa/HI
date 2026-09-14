'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'

type Phase = 'idle' | 'searching' | 'connected' | 'disconnected'

const FILTERS = ['Any topic', 'Math', 'Science', 'History', 'Languages', 'Coding', 'Chill']

export default function MeetPage() {
  const [user, setUser] = useState<{ email?: string | null; id?: string } | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [filter, setFilter] = useState('Any topic')
  const [elapsed, setElapsed] = useState(0)
  const [messages, setMessages] = useState<{ from: 'me' | 'them'; text: string }[]>([])
  const [input, setInput] = useState('')
  const sb = createClient()

  useEffect(() => {
    sb.auth.getUser().then(({ data }) => setUser(data.user ? { email: data.user.email, id: data.user.id } : null))
  }, [])

  // Fake elapsed timer when connected
  useEffect(() => {
    if (phase !== 'connected') { setElapsed(0); return }
    const iv = setInterval(() => setElapsed(s => s + 1), 1000)
    return () => clearInterval(iv)
  }, [phase])

  function formatTime(s: number) {
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  }

  function startSearch() {
    setPhase('searching')
    setMessages([])
    // Simulate matchmaking (2-4s)
    const delay = 2000 + Math.random() * 2000
    setTimeout(() => setPhase('connected'), delay)
  }

  function disconnect() {
    setPhase('disconnected')
  }

  function next() {
    setPhase('searching')
    setMessages([])
    const delay = 1500 + Math.random() * 2000
    setTimeout(() => setPhase('connected'), delay)
  }

  function sendMessage() {
    const t = input.trim()
    if (!t) return
    setInput('')
    setMessages(m => [...m, { from: 'me', text: t }])
    // Simulate reply
    setTimeout(() => {
      const replies = ['lol yeah', 'interesting point', 'say more?', 'same tbh', 'no way', 'fr fr', 'idk man']
      setMessages(m => [...m, { from: 'them', text: replies[Math.floor(Math.random() * replies.length)] }])
    }, 1200 + Math.random() * 1800)
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-zinc-400 mb-4">Sign in to use Random Chat</p>
          <a href="/auth/login" className="px-5 py-2.5 rounded-xl bg-white text-zinc-950 text-sm font-semibold">Sign in</a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      {/* Header */}
      <div className="border-b border-white/[0.04] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] tracking-widest text-zinc-500 uppercase">Random Chat</span>
          <span className="text-zinc-800">·</span>
          <span className="text-xs text-zinc-600">WebRTC · Anonymous · End-to-end</span>
        </div>
        {phase === 'connected' && (
          <span className="font-mono text-xs text-emerald-500">{formatTime(elapsed)}</span>
        )}
      </div>

      <div className="flex-1 mx-auto w-full max-w-4xl px-4 py-8 flex flex-col gap-6">

        {/* Topic filter */}
        <div className="flex flex-wrap gap-2">
          {FILTERS.map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filter === f ? 'bg-violet-600 text-white' : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800 border border-white/[0.06]'}`}>
              {f}
            </button>
          ))}
        </div>

        {/* Main stage */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Video area */}
          <div className="flex flex-col gap-3">
            {/* Stranger video */}
            <div className="relative aspect-video rounded-2xl border border-white/[0.06] bg-zinc-900/60 overflow-hidden flex items-center justify-center"
              style={{ backdropFilter: 'blur(8px)' }}>
              <AnimatePresence mode="wait">
                {phase === 'idle' && (
                  <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="text-center px-6">
                    <div className="w-14 h-14 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-3">
                      <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" className="text-zinc-600">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"/>
                      </svg>
                    </div>
                    <p className="text-sm text-zinc-500">Stranger&apos;s video will appear here</p>
                  </motion.div>
                )}
                {phase === 'searching' && (
                  <motion.div key="searching" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="text-center">
                    <div className="flex gap-1.5 mb-3">
                      {[0, 1, 2].map(i => (
                        <motion.div key={i} className="w-2 h-2 rounded-full bg-violet-500"
                          animate={{ y: [0, -8, 0] }}
                          transition={{ delay: i * 0.15, repeat: Infinity, duration: 0.8 }} />
                      ))}
                    </div>
                    <p className="text-sm text-zinc-400">Finding a match{filter !== 'Any topic' ? ` for "${filter}"` : ''}…</p>
                  </motion.div>
                )}
                {(phase === 'connected' || phase === 'disconnected') && (
                  <motion.div key="connected" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                    className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900">
                    <div className="text-center">
                      <div className="w-16 h-16 rounded-full bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center mx-auto mb-2 text-2xl">
                        {phase === 'disconnected' ? '👋' : '🎭'}
                      </div>
                      <p className="text-xs text-zinc-400">
                        {phase === 'connected' ? 'Anonymous · Camera off' : 'Disconnected'}
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              <div className="absolute top-3 left-3">
                <span className="px-2 py-1 rounded bg-black/60 text-[10px] font-mono text-zinc-400">STRANGER</span>
              </div>
            </div>

            {/* Self video */}
            <div className="relative h-24 rounded-xl border border-white/[0.06] bg-zinc-900/80 overflow-hidden flex items-center px-4 gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-zinc-700 to-zinc-600 flex items-center justify-center text-sm">
                {user.email?.[0]?.toUpperCase() ?? '?'}
              </div>
              <div>
                <p className="text-xs text-zinc-400">You · Camera off</p>
                <p className="text-[10px] text-zinc-600 font-mono">{filter}</p>
              </div>
              <div className="ml-auto flex gap-2">
                <button className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center transition-colors" title="Toggle mic">
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="text-zinc-400">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"/>
                  </svg>
                </button>
                <button className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center transition-colors" title="Toggle camera">
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="text-zinc-400">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* Chat panel */}
          <div className="flex flex-col rounded-2xl border border-white/[0.06] bg-zinc-950/60 overflow-hidden" style={{ backdropFilter: 'blur(8px)' }}>
            <div className="px-4 py-3 border-b border-white/[0.04] flex items-center justify-between">
              <span className="text-xs text-zinc-500 font-mono">Text chat</span>
              {phase === 'connected' && (
                <span className="flex items-center gap-1.5 text-[10px] text-emerald-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Connected
                </span>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-[200px]">
              {messages.length === 0 && (
                <p className="text-xs text-zinc-700 text-center mt-8">
                  {phase === 'connected' ? 'Say hello 👋' : 'Messages appear here when connected'}
                </p>
              )}
              {messages.map((m, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                  className={`flex ${m.from === 'me' ? 'justify-end' : 'justify-start'}`}>
                  <span className={`px-3 py-1.5 rounded-2xl text-sm max-w-[75%] ${
                    m.from === 'me' ? 'bg-violet-600 text-white rounded-br-sm' : 'bg-zinc-800 text-zinc-300 rounded-bl-sm'
                  }`}>
                    {m.text}
                  </span>
                </motion.div>
              ))}
            </div>

            <div className="p-3 border-t border-white/[0.04] flex gap-2">
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && phase === 'connected' && sendMessage()}
                disabled={phase !== 'connected'}
                placeholder={phase === 'connected' ? 'Type a message…' : 'Connect to chat'}
                className="flex-1 rounded-xl bg-zinc-900 border border-white/[0.06] px-3 py-2 text-sm text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/40 disabled:opacity-40"
              />
              <button onClick={sendMessage} disabled={phase !== 'connected' || !input.trim()}
                className="px-3 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-30 transition-all text-sm font-medium text-white">
                →
              </button>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-3">
          {phase === 'idle' && (
            <button onClick={startSearch}
              className="px-8 py-3 rounded-2xl bg-violet-600 hover:bg-violet-500 text-sm font-semibold text-white transition-all active:scale-95"
              style={{ boxShadow: '0 0 30px rgba(139,92,246,0.3)' }}>
              Start Matching
            </button>
          )}
          {phase === 'searching' && (
            <button onClick={() => setPhase('idle')}
              className="px-6 py-3 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-sm font-medium text-zinc-300 transition-all">
              Cancel
            </button>
          )}
          {phase === 'connected' && (
            <>
              <button onClick={next}
                className="px-6 py-3 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-sm font-medium text-zinc-300 transition-all">
                Next →
              </button>
              <button onClick={disconnect}
                className="px-6 py-3 rounded-2xl bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/20 text-sm font-medium text-rose-400 transition-all">
                Disconnect
              </button>
            </>
          )}
          {phase === 'disconnected' && (
            <div className="flex gap-3">
              <button onClick={next}
                className="px-8 py-3 rounded-2xl bg-violet-600 hover:bg-violet-500 text-sm font-semibold text-white transition-all active:scale-95">
                Find Someone New
              </button>
              <button onClick={() => setPhase('idle')}
                className="px-5 py-3 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-sm font-medium text-zinc-300 transition-all">
                Back
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-[11px] text-zinc-700">
          All connections are anonymous · WebRTC P2P · No messages stored · Report abuse via chat controls
        </p>
      </div>
    </div>
  )
}
