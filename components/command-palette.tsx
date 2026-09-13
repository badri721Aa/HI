'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'

type Item = { label: string; desc: string; href: string; tag: string; icon: string }

const NAV_ITEMS: Item[] = [
  { label: 'Home', desc: 'Platform dashboard', href: '/', tag: 'Page', icon: '⌂' },
  { label: 'Live Chat', desc: 'Real-time messaging and P2P video', href: '/chat', tag: 'Chat', icon: '💬' },
  { label: 'News Feed', desc: 'Pinned announcements and broadcasts', href: '/news', tag: 'Feed', icon: '📡' },
  { label: 'AI Assistant', desc: 'Local AI, no API keys', href: '/ai', tag: 'AI', icon: '🤖' },
  { label: 'Extensions', desc: 'Chrome companion extension', href: '/extensions', tag: 'Chrome', icon: '🧩' },
  { label: 'Study Tools', desc: '600 exam tricks and strategies', href: '/tricks', tag: 'Study', icon: '📚' },
  { label: 'Admin Panel', desc: 'Roles, users, and platform settings', href: '/admin', tag: 'Admin', icon: '⚙️' },
  { label: 'Troll Panel', desc: 'Broadcast effects to online users', href: '/admin/troll-panel', tag: 'Admin', icon: '🎭' },
  { label: 'Dev Tools', desc: 'Platform developer utilities', href: '/admin/devtools', tag: 'Admin', icon: '🛠️' },
  { label: 'Role Manager', desc: 'Grant and revoke user roles', href: '/admin/roles', tag: 'Admin', icon: '👑' },
  { label: 'Owner Slots', desc: 'Manage the 3 owner email slots', href: '/admin/owners', tag: 'Owner', icon: '🔑' },
  { label: 'Sign In', desc: 'Log in to the platform', href: '/auth/login', tag: 'Auth', icon: '🔑' },
]

const TAG_COLORS: Record<string, string> = {
  Page: 'text-zinc-500 bg-zinc-800/60',
  Chat: 'text-blue-400 bg-blue-500/10',
  Feed: 'text-amber-400 bg-amber-500/10',
  AI: 'text-violet-400 bg-violet-500/10',
  Chrome: 'text-emerald-400 bg-emerald-500/10',
  Study: 'text-sky-400 bg-sky-500/10',
  Admin: 'text-rose-400 bg-rose-500/10',
  Owner: 'text-amber-400 bg-amber-500/10',
  Auth: 'text-zinc-400 bg-zinc-800/60',
}

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const filtered = query.trim()
    ? NAV_ITEMS.filter(
        i =>
          i.label.toLowerCase().includes(query.toLowerCase()) ||
          i.desc.toLowerCase().includes(query.toLowerCase()) ||
          i.tag.toLowerCase().includes(query.toLowerCase())
      )
    : NAV_ITEMS

  const navigate = useCallback(
    (item: Item) => {
      setOpen(false)
      setQuery('')
      setCursor(0)
      router.push(item.href)
    },
    [router]
  )

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(o => {
          if (!o) { setQuery(''); setCursor(0) }
          return !o
        })
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

  useEffect(() => { setCursor(0) }, [query])

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, filtered.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)) }
    if (e.key === 'Enter' && filtered[cursor]) navigate(filtered[cursor])
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[999] flex items-start justify-center pt-[15vh] px-4"
      onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}
    >
      {/* Scrim */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Panel */}
      <div
        className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-t-white/[0.15] border-x-white/[0.06] border-b-white/[0.04] shadow-2xl shadow-black/80"
        style={{
          background: 'rgba(9,9,11,0.92)',
          backdropFilter: 'blur(32px) saturate(1.8)',
          boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.08), 0 40px 80px -20px rgba(0,0,0,0.9)',
        }}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3.5">
          <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="flex-shrink-0 text-zinc-500">
            <circle cx="11" cy="11" r="8"/><path strokeLinecap="round" d="m21 21-4.35-4.35"/>
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search pages, tools, admin…"
            className="flex-1 bg-transparent text-sm text-zinc-100 placeholder-zinc-600 outline-none"
          />
          <kbd className="hidden sm:flex items-center gap-1 font-mono text-[10px] text-zinc-700 border border-white/[0.06] rounded px-1.5 py-0.5">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-72 overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-zinc-600">No results for &ldquo;{query}&rdquo;</div>
          ) : (
            filtered.map((item, i) => (
              <button
                key={item.href}
                onClick={() => navigate(item)}
                onMouseEnter={() => setCursor(i)}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  i === cursor ? 'bg-white/[0.05]' : 'hover:bg-white/[0.03]'
                }`}
              >
                <span className="text-base w-5 text-center flex-shrink-0">{item.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-zinc-200 truncate">{item.label}</div>
                  <div className="text-xs text-zinc-600 truncate">{item.desc}</div>
                </div>
                <span className={`flex-shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide ${TAG_COLORS[item.tag] ?? 'text-zinc-500 bg-zinc-800/60'}`}>
                  {item.tag}
                </span>
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-white/[0.04] px-4 py-2 flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-[10px] text-zinc-700">
            <kbd className="font-mono border border-white/[0.06] rounded px-1 py-0.5">↑↓</kbd> navigate
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-zinc-700">
            <kbd className="font-mono border border-white/[0.06] rounded px-1 py-0.5">↵</kbd> open
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-zinc-700 ml-auto">
            <kbd className="font-mono border border-white/[0.06] rounded px-1.5 py-0.5">⌘K</kbd> toggle
          </div>
        </div>
      </div>
    </div>
  )
}
