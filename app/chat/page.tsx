'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import { isOwner } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface Message {
  id: string
  user_name: string
  message: string
  is_owner: boolean
  created_at: string
  user_email?: string
}

export default function ChatPage() {
  const [user, setUser] = useState<User | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [banned, setBanned] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const sb = createClient()

  useEffect(() => {
    sb.auth.getUser().then(({ data }) => {
      setUser(data.user)
      if (data.user?.email) checkBanned(data.user.email)
    })
    fetchMessages()

    const ch = sb
      .channel('chat-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, payload => {
        setMessages(prev => [...prev, payload.new as Message])
      })
      .subscribe()

    return () => { sb.removeChannel(ch) }
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function checkBanned(email: string) {
    const { data } = await sb.from('banned_users').select('id').eq('name', email).single()
    if (data) setBanned(true)
  }

  async function fetchMessages() {
    const { data } = await sb
      .from('chat_messages')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(100)
    if (data) setMessages(data)
  }

  async function send() {
    if (!input.trim() || !user || banned) return
    setLoading(true)
    const displayName = user.user_metadata?.display_name || user.email?.split('@')[0] || 'anon'
    await sb.from('chat_messages').insert({
      user_name: displayName,
      message: input.trim(),
      is_owner: isOwner(user.email ?? ''),
    })
    setInput('')
    setLoading(false)
  }

  function formatTime(ts: string) {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center pt-14">
        <div className="text-center space-y-4">
          <p className="mono text-xs text-zinc-600">chat requires sign in</p>
          <a
            href="/auth/login"
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 text-sm text-zinc-400 transition-all duration-200 hover:bg-white/[0.07] hover:text-zinc-200"
          >
            Sign in →
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col px-6 pb-20 pt-28" style={{ minHeight: '100vh' }}>
      {/* Header */}
      <div className="mb-8">
        <div className="mb-3 flex items-center gap-2">
          <span className="h-px w-4 bg-zinc-800" />
          <span className="mono text-[10px] tracking-[0.15em] text-zinc-600 uppercase">Live Chat</span>
        </div>
        <h1 className="font-nacelle text-3xl font-semibold text-zinc-100 tracking-tight">Public Room</h1>
        <p className="mt-2 text-sm text-zinc-500">Real-time · {messages.length} messages</p>
      </div>

      {banned && (
        <div className="mb-4 rounded-xl border border-rose-500/20 bg-rose-500/[0.07] px-4 py-3 text-xs text-rose-400">
          You are banned from chat.
        </div>
      )}

      {/* Message list */}
      <div
        className="glass-card mb-4 flex-1 overflow-y-auto rounded-2xl p-4 space-y-3"
        style={{ minHeight: 420, maxHeight: 520 }}
      >
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <p className="mono text-xs text-zinc-700">no messages yet</p>
          </div>
        )}
        {messages.map(m => (
          <div key={m.id} className="group flex items-start gap-3">
            <div
              className={
                'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-[10px] font-semibold ' +
                (m.is_owner
                  ? 'border border-amber-500/30 bg-amber-500/[0.12] text-amber-400'
                  : 'border border-white/[0.07] bg-zinc-800/60 text-zinc-500')
              }
            >
              {(m.user_name || 'A')[0].toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-0.5 flex items-baseline gap-2">
                {m.is_owner ? (
                  <span className="mono text-xs font-semibold text-amber-400" style={{ textShadow: '0 0 10px rgba(245,158,11,0.4)' }}>
                    {m.user_name}
                    <span className="ml-1.5 text-amber-500/50 font-normal">(Owner)</span>
                  </span>
                ) : (
                  <span className="mono text-xs font-medium text-zinc-400">{m.user_name}</span>
                )}
                <span className="mono text-[9px] text-zinc-700">{formatTime(m.created_at)}</span>
              </div>
              <p className={'text-sm leading-relaxed break-words ' + (m.is_owner ? 'text-amber-50/80' : 'text-zinc-300')}>
                {m.message}
              </p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input row */}
      {!banned && (
        <form
          onSubmit={e => { e.preventDefault(); send() }}
          className="flex gap-2"
        >
          <Input
            placeholder="Message..."
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={loading}
            maxLength={500}
          />
          <Button
            type="submit"
            variant="solid"
            disabled={loading || !input.trim()}
            className="flex-shrink-0"
          >
            Send
          </Button>
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
