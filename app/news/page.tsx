'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface NewsItem {
  id: string
  message: string
  pinned: boolean
  created_at: string
}

export default function NewsPage() {
  const [items, setItems] = useState<NewsItem[]>([])
  const sb = createClient()

  useEffect(() => {
    loadNews()
    const ch = sb
      .channel('news-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'news' }, payload => {
        setItems(prev => [payload.new as NewsItem, ...prev])
      })
      .subscribe()
    return () => { sb.removeChannel(ch) }
  }, [])

  async function loadNews() {
    const { data } = await sb.from('news').select('*').order('created_at', { ascending: false }).limit(50)
    if (data) setItems(data)
  }

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

      <div className="space-y-3">
        {items.length === 0 && (
          <div className="py-20 text-center">
            <p className="mono text-xs text-zinc-700">No news yet</p>
          </div>
        )}
        {items.map(item => (
          <div
            key={item.id}
            className={
              'glass-card rounded-2xl px-5 py-4 transition-all duration-200 ' +
              (item.pinned
                ? 'border-amber-500/20 bg-amber-500/[0.04]'
                : '')
            }
          >
            <div className="mb-2 flex items-center gap-2">
              {item.pinned && (
                <span className="mono text-[9px] border border-amber-500/25 bg-amber-500/[0.08] text-amber-400 rounded-full px-1.5 py-0.5">
                  Pinned
                </span>
              )}
              <span className="mono text-[9px] text-zinc-700">
                {new Date(item.created_at).toLocaleString()}
              </span>
            </div>
            <p className={'text-sm leading-relaxed ' + (item.pinned ? 'text-amber-50/80' : 'text-zinc-300')}>
              {item.message}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
