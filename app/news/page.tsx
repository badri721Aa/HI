'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import { canAdmin, relativeTime } from '@/lib/utils'

interface NewsItem {
  id: string
  message: string
  pinned: boolean
  deleted: boolean
  created_at: string
  edited_at: string | null
}

interface Profile { role: string }

export default function NewsPage() {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [items, setItems] = useState<NewsItem[]>([])
  const [compose, setCompose] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [sending, setSending] = useState(false)
  const sb = createClient()
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    sb.auth.getUser().then(async ({ data }) => {
      const u = data.user
      setUser(u)
      if (u) {
        const { data: p } = await sb.from('profiles').select('role').eq('id', u.id).single()
        if (p) setProfile(p)
      }
    })

    loadNews()

    const ch = sb.channel('news-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'news' }, ({ new: row }) => {
        setItems(prev => [row as NewsItem, ...prev])
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'news' }, ({ new: row }) => {
        setItems(prev => prev.map(i => i.id === (row as NewsItem).id ? row as NewsItem : i))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'news' }, ({ old }) => {
        setItems(prev => prev.filter(i => i.id !== (old as { id: string }).id))
      })
      .subscribe()

    return () => { sb.removeChannel(ch) }
  }, [])

  async function loadNews() {
    const { data } = await sb.from('news')
      .select('*')
      .eq('deleted', false)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(50)
    if (data) setItems(data)
  }

  const isAdmin = canAdmin(profile?.role ?? '')

  async function post() {
    if (!compose.trim() || !isAdmin) return
    setSending(true)
    await sb.from('news').insert({ message: compose.trim(), pinned: false })
    setCompose('')
    setSending(false)
  }

  async function pin(item: NewsItem) {
    await sb.from('news').update({ pinned: !item.pinned }).eq('id', item.id)
  }

  async function startEdit(item: NewsItem) {
    setEditId(item.id)
    setEditText(item.message)
  }

  async function saveEdit() {
    if (!editId || !editText.trim()) return
    await sb.from('news').update({ message: editText.trim(), edited_at: new Date().toISOString() }).eq('id', editId)
    setEditId(null)
  }

  async function remove(id: string) {
    await sb.from('news').delete().eq('id', id)
  }

  const visible = items.filter(i => !i.deleted)

  return (
    <div className="mx-auto max-w-2xl px-6 pt-28 pb-20">
      <div className="mb-12">
        <div className="mb-3 flex items-center gap-2">
          <span className="h-px w-4 bg-zinc-800" />
          <span className="mono text-[10px] tracking-[0.15em] text-zinc-600 uppercase">Live</span>
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </span>
        </div>
        <h1 className="font-nacelle text-3xl font-semibold text-zinc-100 tracking-tight">News Feed</h1>
        <p className="mt-2 text-sm text-zinc-500">Pinned drops · Admin broadcasts · Real-time</p>
      </div>

      {/* Admin compose box */}
      {isAdmin && (
        <div className="glass-card mb-8 rounded-2xl p-5 space-y-3">
          <div className="mono text-[10px] tracking-[0.15em] text-zinc-600 uppercase">Broadcast</div>
          <textarea
            ref={inputRef}
            value={compose}
            onChange={e => setCompose(e.target.value)}
            placeholder="Post an announcement..."
            rows={3}
            className="w-full resize-none rounded-xl border border-white/[0.08] px-4 py-3 text-sm text-zinc-200 placeholder:text-zinc-600 transition-all duration-200 focus:border-white/[0.18] focus:outline-none"
            style={{ background: '#0A0A0C', boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.04)' }}
            onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) post() }}
          />
          <div className="flex items-center justify-between">
            <span className="mono text-[10px] text-zinc-700">⌘↵ to send</span>
            <button
              onClick={post}
              disabled={sending || !compose.trim()}
              className="flex h-9 items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.08] px-4 text-xs font-medium text-amber-400 transition-all duration-200 hover:bg-amber-500/[0.14] active:scale-[0.98] disabled:opacity-40"
            >
              {sending ? 'Posting...' : 'Post'}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {visible.length === 0 && (
          <div className="py-20 text-center">
            <p className="mono text-xs text-zinc-700">No news yet.</p>
          </div>
        )}
        {visible.map(item => (
          <div
            key={item.id}
            className={
              'glass-card rounded-2xl px-5 py-4 transition-all duration-200 group ' +
              (item.pinned ? 'border-amber-500/20 bg-amber-500/[0.04]' : '')
            }
          >
            {editId === item.id ? (
              <div className="space-y-3">
                <textarea
                  className="w-full resize-none rounded-xl border border-white/[0.08] px-3 py-2 text-sm text-zinc-200 focus:border-white/[0.18] focus:outline-none"
                  style={{ background: '#0A0A0C', boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.04)' }}
                  value={editText}
                  onChange={e => setEditText(e.target.value)}
                  rows={3}
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    onClick={saveEdit}
                    className="rounded-lg border border-emerald-500/25 bg-emerald-500/[0.08] px-3 py-1.5 text-xs text-emerald-400 hover:bg-emerald-500/[0.14] transition-all active:scale-[0.98]"
                  >Save</button>
                  <button
                    onClick={() => setEditId(null)}
                    className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-all"
                  >Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <div className="mb-2 flex items-center gap-2">
                  {item.pinned && (
                    <span className="mono text-[9px] border border-amber-500/25 bg-amber-500/[0.08] text-amber-400 rounded-full px-1.5 py-0.5">
                      Pinned
                    </span>
                  )}
                  <span className="mono text-[9px] text-zinc-700">{relativeTime(item.created_at)}</span>
                  {item.edited_at && (
                    <span className="mono text-[9px] text-zinc-700">(edited)</span>
                  )}
                  {isAdmin && (
                    <div className="ml-auto hidden group-hover:flex items-center gap-1.5">
                      <button
                        onClick={() => pin(item)}
                        className="mono text-[9px] text-zinc-600 hover:text-amber-400 transition-colors"
                        title={item.pinned ? 'Unpin' : 'Pin'}
                      >
                        {item.pinned ? 'Unpin' : 'Pin'}
                      </button>
                      <button
                        onClick={() => startEdit(item)}
                        className="mono text-[9px] text-zinc-600 hover:text-zinc-200 transition-colors"
                      >Edit</button>
                      <button
                        onClick={() => remove(item.id)}
                        className="mono text-[9px] text-zinc-600 hover:text-rose-400 transition-colors"
                      >Delete</button>
                    </div>
                  )}
                </div>
                <p className={'text-sm leading-relaxed ' + (item.pinned ? 'text-amber-50/80' : 'text-zinc-300')}>
                  {item.message}
                </p>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
