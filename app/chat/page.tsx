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
      <div className="min-h-screen flex items-center justify-center pt-14">
        <div className="text-center">
          <div className="mono text-xs text-white/30 mb-4">chat requires sign in</div>
          <a href="/auth/login" className="glass px-5 py-2.5 rounded-xl text-sm text-white/70 hover:text-white">
            Sign in →
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen pt-14 flex flex-col max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <div className="mono text-[10px] tracking-widest text-white/20 uppercase mb-1">live chat</div>
        <h1 className="text-xl font-light text-white">Public Room</h1>
        <p className="text-xs text-white/30 mt-1">Real-time · {messages.length} messages</p>
      </div>

      {banned && (
        <div className="glass border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400 mb-4">
          You are banned from chat.
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 glass rounded-2xl p-4 overflow-y-auto space-y-3 mb-4" style={{ minHeight: 400, maxHeight: 500 }}>
        {messages.length === 0 && (
          <div className="text-center text-xs text-white/20 py-8 mono">no messages yet</div>
        )}
        {messages.map(m => (
          <div key={m.id} className="flex gap-3 items-start group">
            <div
              className={'w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-semibold flex-shrink-0 ' +
                (m.is_owner ? 'bg-amber-500/20 border border-amber-500/30 text-amber-400' : 'bg-white/8 border border-white/10 text-white/50')}
            >
              {(m.user_name || 'A')[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 mb-0.5">
                {m.is_owner ? (
                  <span className="mono text-xs font-semibold text-amber-400" style={{ textShadow: '0 0 12px rgba(245,158,11,0.6)' }}>
                    {m.user_name} <span className="text-amber-500/60">(Owner)</span>
                  </span>
                ) : (
                  <span className="mono text-xs font-medium text-white/60">{m.user_name}</span>
                )}
                <span className="mono text-[9px] text-white/20">{formatTime(m.created_at)}</span>
              </div>
              <p className={'text-sm leading-relaxed break-words ' + (m.is_owner ? 'text-amber-50/90' : 'text-white/75')}>
                {m.message}
              </p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
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
          <Button type="submit" disabled={loading || !input.trim()} className="flex-shrink-0">
            Send
          </Button>
        </form>
      )}

      {isOwner(user.email ?? '') && (
        <div className="mt-3 mono text-[10px] text-amber-500/40 text-center">
          Your messages appear in gold · (Owner) badge active
        </div>
      )}
    </div>
  )
}
