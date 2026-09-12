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
    fetch()
    const ch = sb
      .channel('news-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'news' }, payload => {
        setItems(prev => [payload.new as NewsItem, ...prev])
      })
      .subscribe()
    return () => { sb.removeChannel(ch) }
  }, [])

  async function fetch() {
    const { data } = await sb.from('news').select('*').order('created_at', { ascending: false }).limit(50)
    if (data) setItems(data)
  }

  return (
    <div className="min-h-screen pt-14 max-w-2xl mx-auto px-4 py-8">
      <div className="mb-8">
        <div className="mono text-[10px] tracking-widest text-white/20 uppercase mb-1">live</div>
        <h1 className="text-2xl font-light text-white">News Feed</h1>
        <p className="text-xs text-white/30 mt-1">Pinned drops · Admin broadcasts · Real-time</p>
      </div>

      <div className="space-y-3">
        {items.length === 0 && (
          <div className="text-center py-20">
            <div className="mono text-xs text-white/20">No news yet</div>
          </div>
        )}
        {items.map(item => (
          <div
            key={item.id}
            className={'glass rounded-2xl px-5 py-4 border transition-all duration-300 ' +
              (item.pinned ? 'border-amber-500/25 bg-amber-500/5' : 'border-white/8')}
          >
            <div className="flex items-center gap-2 mb-2">
              {item.pinned && (
                <div className="mono text-[9px] text-amber-400 border border-amber-500/25 rounded-full px-1.5 py-0.5">
                  Pinned
                </div>
              )}
              <div className="mono text-[9px] text-white/25">
                {new Date(item.created_at).toLocaleString()}
              </div>
            </div>
            <p className={'text-sm leading-relaxed ' + (item.pinned ? 'text-amber-50/80' : 'text-white/70')}>
              {item.message}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
