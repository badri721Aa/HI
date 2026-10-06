'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User, RealtimeChannel } from '@supabase/supabase-js'
import { isOwner, canAdmin, formatTime } from '@/lib/utils'
import { useCall } from '@/components/call-provider'

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

const EMOJIS = ['👍','❤️','😂','😮','😢','🔥']

export default function ChatPage() {
  const [user, setUser] = useState<User | null>(null)
  const [userRole, setUserRole] = useState('user')
  const [messages, setMessages] = useState<Message[]>([])
  const [reactions, setReactions] = useState<Record<string, Reaction[]>>({})
  const [input, setInput] = useState('')
  const [authLoading, setAuthLoading] = useState(true)
  const [banned, setBanned] = useState(false)
  const [typing, setTyping] = useState<string[]>([])
  const [hover, setHover] = useState<string | null>(null)

  const bottomRef = useRef<HTMLDivElement>(null)
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dataCh = useRef<RealtimeChannel | null>(null)
  const sb = createClient()

  // Calls now live in the global CallProvider — chat only consumes
  // the online list and the `callUser` action.
  const { online, callUser, call } = useCall()

  // ─── Initialise ──────────────────────────────────────────────
  useEffect(() => {
    let uid = ''

    sb.auth.getUser().then(async ({ data }) => {
      const u = data.user
      setUser(u)
      setAuthLoading(false)
      if (!u) return
      uid = u.id

      // Fetch profile + messages + reactions + ban in parallel
      const [{ data: p }] = await Promise.all([
        sb.from('profiles').select('role').eq('id', u.id).single(),
        fetchMessages(),
        fetchReactions(),
        checkBanned(u.email ?? ''),
      ])
      if (p) setUserRole(p.role)

      // Data channel — messages + reactions + typing broadcast.
      // Separate from the call channels so presence/calls aren't blocked
      // behind message postgres_changes events.
      dataCh.current = sb.channel('chat-data')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, ({ new: row }) => {
          const msg = row as Message
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
          setTyping(prev => prev.includes(payload.name) ? prev : [...prev, payload.name])
          setTimeout(() => setTyping(prev => prev.filter(n => n !== payload.name)), 3000)
        })
        .subscribe()
    })

    return () => {
      if (dataCh.current) sb.removeChannel(dataCh.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ─── Data fetching ────────────────────────────────────────────
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

  // ─── Messaging ────────────────────────────────────────────────
  async function send() {
    if (!input.trim() || !user || banned) return
    const text = input.trim()
    const displayName = user.user_metadata?.display_name ?? user.email?.split('@')[0] ?? 'anon'

    setInput('')
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
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

    const { data, error } = await sb.from('chat_messages').insert({
      user_id: user.id,
      user_name: displayName,
      message: text,
      is_owner: isOwner(user.email ?? ''),
      deleted: false,
    }).select().single()

    if (error) {
      console.error('[chat] send failed', error)
      setMessages(prev => prev.filter(m => m.id !== tempId))
      setInput(text)
      return
    }

    if (data) {
      const real = data as Message
      setMessages(prev => {
        const alreadyReal = prev.some(m => m.id === real.id)
        if (alreadyReal) return prev.filter(m => m.id !== tempId)
        return prev.map(m => m.id === tempId ? real : m)
      })
    }
  }

  function broadcastTyping() {
    if (!dataCh.current || !user) return
    const name = user.user_metadata?.display_name ?? 'anon'
    dataCh.current.send({ type: 'broadcast', event: 'typing', payload: { name, uid: user.id } })
    if (typingTimer.current) clearTimeout(typingTimer.current)
    typingTimer.current = setTimeout(() => {}, 2500)
  }

  async function deleteMessage(msg: Message) {
    setMessages(prev => prev.filter(m => m.id !== msg.id))
    const { error } = await sb.from('chat_messages').update({ deleted: true }).eq('id', msg.id)
    if (error) {
      console.error('[chat] delete refused', error)
      setMessages(prev => [...prev, msg].sort((a, b) => a.created_at.localeCompare(b.created_at)))
    }
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

  // ─── Gate ─────────────────────────────────────────────────────
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
  const callBusy = call.status !== 'idle'

  return (
    <div className="mx-auto flex max-w-2xl flex-col px-6 pb-20 pt-28" style={{ minHeight: '100vh' }}>
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
          <a
            href="/call"
            className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 transition-all hover:brightness-110 active:scale-[0.98]"
            style={{
              background: 'rgba(16,185,129,0.08)',
              border: '1px solid rgba(16,185,129,0.3)',
              boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.04)',
            }}
            title="Dedicated calls page"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span className="mono text-[10px] text-emerald-300 uppercase tracking-widest">{online.length} online · Call page</span>
          </a>
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
          const canCall = !!m.user_id && m.user_id !== user.id && online.some(o => o.user_id === m.user_id) && !callBusy

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
                  {canCall && (
                    <button
                      onClick={() => callUser(m.user_id!, m.user_name)}
                      className="ml-0.5 rounded-lg px-1.5 py-0.5 mono text-[9px] text-zinc-600 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all"
                      title={`Video call ${m.user_name}`}
                    >
                      📹 call
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
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
