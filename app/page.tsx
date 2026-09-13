'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const modules = [
  { href: '/tricks', icon: '◈', label: 'Exam Tricks', desc: 'MC patterns, essay shortcuts, time exploits' },
  { href: '/hacks', icon: '◉', label: 'Game Hacks', desc: 'Memory, overlays, trainers — concepts & code' },
  { href: '/extensions', icon: '◫', label: 'Extensions', desc: 'Auto-typer, AI fill, humanizer, stealth tab' },
  { href: '/chat', icon: '◌', label: 'Live Chat', desc: 'Real-time room with owner broadcasts' },
  { href: '/ai', icon: '◎', label: 'AI Tools', desc: 'Essay gen, answer writer, AI→human converter' },
  { href: '/news', icon: '◷', label: 'News Feed', desc: 'Pinned drops, announcements, live updates' },
]

export default function Home() {
  const [user, setUser] = useState<{ email?: string | null } | null>(null)
  const sb = createClient()

  useEffect(() => {
    sb.auth.getUser().then(({ data }) => setUser(data.user))
    const { data: { subscription } } = sb.auth.onAuthStateChange((_ev, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  return (
    <div className="relative min-h-screen flex flex-col">
      {/* Hero */}
      <div
        className="relative flex flex-col items-center justify-center text-center px-6 pt-14"
        style={{
          minHeight: '100vh',
          background: 'radial-gradient(ellipse 80% 60% at 50% 40%, rgba(40,0,80,0.95) 0%, #000 70%)',
        }}
      >
        {/* Subtle grid */}
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }} />

        <div className="relative z-10 max-w-xl">
          <div className="mono text-[9px] tracking-[0.5em] text-white/20 uppercase mb-8">
            alhekma · covert · encrypted
          </div>

          <h1 className="text-6xl md:text-8xl font-light text-white mb-5 tracking-tight leading-none">
            NO_SIGNAL
          </h1>

          <p className="text-white/35 text-sm max-w-xs mx-auto leading-relaxed mb-10">
            Tools, tricks, and live comms.<br/>
            School-only access. No traces.
          </p>

          <div className="flex items-center gap-3 justify-center mb-16">
            {user ? (
              <>
                <Link
                  href="/chat"
                  className="glass-hi px-6 py-2.5 rounded-xl text-sm text-white hover:bg-white/10 transition-all duration-200 font-medium"
                >
                  Open Chat →
                </Link>
                <Link href="/extensions" className="text-sm text-white/30 hover:text-white/60 transition-colors">
                  Extensions
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/auth/login"
                  className="glass-hi px-6 py-2.5 rounded-xl text-sm text-white hover:bg-white/10 transition-all duration-200 font-medium"
                >
                  Sign in with email
                </Link>
                <Link href="/chat" className="text-sm text-white/30 hover:text-white/60 transition-colors">
                  Live chat →
                </Link>
              </>
            )}
          </div>

          {/* Status bar */}
          <div className="flex items-center justify-center gap-6 mono text-[9px] text-white/15 uppercase tracking-widest">
            <span className="flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-full bg-emerald-500/60 animate-pulse" />
              System live
            </span>
            <span>·</span>
            <span>Shift+Tab — panic hide</span>
            <span>·</span>
            <span>No logs kept</span>
          </div>
        </div>
      </div>

      {/* Modules */}
      <div className="relative z-10 px-4 md:px-8 py-20 max-w-5xl mx-auto w-full">
        <div className="mono text-[9px] tracking-[0.5em] text-white/15 uppercase mb-10 text-center">
          modules
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {modules.map(m => (
            <Link
              key={m.href}
              href={m.href}
              className="glass rounded-2xl p-6 hover:bg-white/8 transition-all duration-300 group border border-white/6 hover:border-white/15"
            >
              <div className="text-xl text-white/25 group-hover:text-white/50 transition-colors duration-300 mb-4 mono">{m.icon}</div>
              <div className="text-sm font-medium text-white/75 group-hover:text-white transition-colors duration-300 mb-1.5">{m.label}</div>
              <div className="text-xs text-white/25 group-hover:text-white/45 transition-colors duration-300 leading-relaxed">{m.desc}</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
