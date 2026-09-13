'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const modules = [
  {
    href: '/chat',
    label: 'Live Chat',
    desc: 'Real-time messaging with reactions, presence tracking, and multi-user P2P video calls',
    tag: 'Realtime',
    icon: '💬',
    accent: 'rgba(59,130,246,0.08)',
    accentBorder: 'rgba(59,130,246,0.18)',
    badge: 'Live',
    badgeColor: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  },
  {
    href: '/news',
    label: 'News Feed',
    desc: 'Pinned announcements, broadcasts, and admin alerts in a clean scrollable feed',
    tag: 'Feed',
    icon: '📡',
    accent: 'rgba(251,191,36,0.07)',
    accentBorder: 'rgba(251,191,36,0.18)',
    badge: null,
    badgeColor: '',
  },
  {
    href: '/proxy',
    label: 'Proxy Browser',
    desc: 'Browse any site with server-side request masking, stealth tab presets, and smart URL bar',
    tag: 'Proxy',
    icon: '🌐',
    accent: 'rgba(139,92,246,0.08)',
    accentBorder: 'rgba(139,92,246,0.18)',
    badge: 'Unblocked',
    badgeColor: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
  },
  {
    href: '/ai',
    label: 'AI Assistant',
    desc: 'Built-in local AI — no API keys required, runs entirely in your browser via WebLLM',
    tag: 'AI',
    icon: '🤖',
    accent: 'rgba(139,92,246,0.07)',
    accentBorder: 'rgba(139,92,246,0.15)',
    badge: null,
    badgeColor: '',
  },
  {
    href: '/extensions',
    label: 'Extensions',
    desc: '6 Chrome extensions: Auto Typer, AI Autofill, Humanizer, Stealth Tab, Answer Finder, Screen Guard',
    tag: 'Chrome',
    icon: '🧩',
    accent: 'rgba(16,185,129,0.07)',
    accentBorder: 'rgba(16,185,129,0.15)',
    badge: '6 tools',
    badgeColor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  },
  {
    href: '/tricks',
    label: 'Study Tools',
    desc: 'Memorization techniques, exam strategies, speed-reading methods, and 600+ tricks',
    tag: 'Study',
    icon: '📚',
    accent: 'rgba(14,165,233,0.07)',
    accentBorder: 'rgba(14,165,233,0.15)',
    badge: '600+',
    badgeColor: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
  },
]

const STATS = [
  { value: '6', label: 'Extensions' },
  { value: '600+', label: 'Study Tricks' },
  { value: 'P2P', label: 'Video Calls' },
  { value: '∞', label: 'Proxy Sites' },
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
    <div className="relative min-h-screen" style={{ background: 'rgb(9,9,11)' }}>
      {/* Ambient background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-60 left-1/2 -translate-x-1/2 w-[1000px] h-[700px] rounded-full"
          style={{ background: 'radial-gradient(ellipse, rgba(99,59,218,0.08) 0%, transparent 65%)' }} />
        <div className="absolute top-1/3 -right-60 w-[600px] h-[600px] rounded-full"
          style={{ background: 'radial-gradient(ellipse, rgba(59,130,246,0.04) 0%, transparent 65%)' }} />
        <div className="absolute bottom-0 left-1/4 w-[500px] h-[400px] rounded-full"
          style={{ background: 'radial-gradient(ellipse, rgba(16,185,129,0.03) 0%, transparent 65%)' }} />
      </div>

      {/* Hero */}
      <section className="relative mx-auto max-w-5xl px-6 pt-40 pb-20">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-xl">
            {/* Pill badge */}
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/[0.06] px-3 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-pulse" />
              <span className="font-mono text-[10px] text-violet-400 uppercase tracking-widest">Alhekma Platform</span>
            </div>

            <h1 className="mb-5 font-nacelle text-5xl font-semibold tracking-tight text-zinc-100 md:text-6xl leading-[1.1]">
              Everything you<br />
              <span style={{ background: 'linear-gradient(135deg, #e4e4e7 0%, #71717a 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                need. One place.
              </span>
            </h1>

            <p className="mb-8 max-w-md text-base text-zinc-400 leading-relaxed">
              Real-time P2P video calls, server-side proxy browser, AI assistant, 6 Chrome extensions, and 600+ study tools — all built for you.
            </p>

            <div className="flex items-center gap-3 flex-wrap">
              {user ? (
                <>
                  <Link
                    href="/chat"
                    className="inline-flex items-center gap-2 rounded-xl bg-white text-zinc-950 px-5 py-2.5 text-sm font-semibold transition-all duration-150 hover:bg-zinc-100 active:scale-[0.98]"
                    style={{ boxShadow: '0 0 0 1px rgba(255,255,255,0.1), 0 4px 20px rgba(0,0,0,0.4)' }}
                  >
                    Open Chat
                    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"/>
                    </svg>
                  </Link>
                  <Link href="/proxy" className="inline-flex items-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.04] px-5 py-2.5 text-sm font-medium text-zinc-300 transition-all hover:bg-white/[0.08] hover:border-white/[0.15] active:scale-[0.98]"
                    style={{ boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.05)' }}>
                    Proxy Browser
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    href="/auth/login"
                    className="inline-flex items-center gap-2 rounded-xl bg-white text-zinc-950 px-5 py-2.5 text-sm font-semibold transition-all duration-150 hover:bg-zinc-100 active:scale-[0.98]"
                    style={{ boxShadow: '0 0 0 1px rgba(255,255,255,0.1), 0 4px 20px rgba(0,0,0,0.4)' }}
                  >
                    Get started
                    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"/>
                    </svg>
                  </Link>
                  <Link href="/chat" className="inline-flex items-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.04] px-5 py-2.5 text-sm font-medium text-zinc-300 transition-all hover:bg-white/[0.08] hover:border-white/[0.15] active:scale-[0.98]"
                    style={{ boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.05)' }}>
                    Live Chat
                  </Link>
                </>
              )}
            </div>

            {/* Status bar */}
            <div className="mt-8 flex items-center gap-5 font-mono text-[10px] text-zinc-600 uppercase tracking-widest flex-wrap">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                System live
              </span>
              <span className="text-zinc-800">·</span>
              <span>⌘K — search</span>
              <span className="text-zinc-800">·</span>
              <span>No data sold</span>
            </div>
          </div>

          {/* Stats panel */}
          <div
            className="flex-shrink-0 rounded-2xl p-6 w-full lg:w-56"
            style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.07)',
              boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.05)',
            }}
          >
            <div className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest mb-4">Platform stats</div>
            <div className="grid grid-cols-2 gap-4">
              {STATS.map(s => (
                <div key={s.label}>
                  <div className="font-nacelle text-2xl font-semibold text-zinc-200 tabular-nums">{s.value}</div>
                  <div className="font-mono text-[10px] text-zinc-600 mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-6">
        <div className="h-px bg-gradient-to-r from-transparent via-zinc-800/60 to-transparent" />
      </div>

      {/* Modules */}
      <section className="mx-auto max-w-5xl px-6 py-20">
        <div className="mb-10 flex items-center gap-3">
          <span className="font-mono text-[10px] tracking-[0.2em] text-zinc-600 uppercase">Platform Modules</span>
          <div className="h-px flex-1 bg-zinc-800/60" />
          <span className="font-mono text-[10px] text-zinc-700">{modules.length} modules</span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map(m => (
            <Link
              key={m.href}
              href={m.href}
              className="group relative flex flex-col rounded-2xl p-5 transition-all duration-200"
              style={{
                background: 'rgba(9,9,11,0.5)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderTopColor: 'rgba(255,255,255,0.09)',
                boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.04)',
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLElement
                el.style.background = m.accent
                el.style.borderColor = m.accentBorder
                el.style.borderTopColor = m.accentBorder
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLElement
                el.style.background = 'rgba(9,9,11,0.5)'
                el.style.borderColor = 'rgba(255,255,255,0.06)'
                el.style.borderTopColor = 'rgba(255,255,255,0.09)'
              }}
            >
              <div className="mb-4 flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-9 w-9 items-center justify-center rounded-xl text-lg flex-shrink-0"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
                  >
                    {m.icon}
                  </div>
                  <span className="font-mono text-[10px] tracking-widest text-zinc-600 uppercase">{m.tag}</span>
                </div>
                <div className="flex items-center gap-2">
                  {m.badge && (
                    <span className={`font-mono text-[9px] border rounded-full px-1.5 py-0.5 ${m.badgeColor}`}>
                      {m.badge}
                    </span>
                  )}
                  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"
                    className="text-zinc-700 transition-all duration-200 group-hover:text-zinc-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25"/>
                  </svg>
                </div>
              </div>
              <h3 className="mb-2 font-nacelle text-base font-semibold text-zinc-200 tracking-tight group-hover:text-zinc-100 transition-colors">
                {m.label}
              </h3>
              <p className="text-sm text-zinc-500 leading-relaxed group-hover:text-zinc-400 transition-colors">
                {m.desc}
              </p>
            </Link>
          ))}
        </div>
      </section>

      {/* Bottom CTA */}
      {!user && (
        <section className="mx-auto max-w-5xl px-6 pb-24">
          <div
            className="rounded-2xl px-8 py-10 text-center"
            style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.07)',
              boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.04)',
            }}
          >
            <h2 className="font-nacelle text-2xl font-semibold text-zinc-100 tracking-tight mb-3">
              Ready to get in?
            </h2>
            <p className="text-sm text-zinc-500 mb-6 max-w-sm mx-auto">
              Create an account and you get full access to every module — all free, always.
            </p>
            <Link
              href="/auth/login"
              className="inline-flex items-center gap-2 rounded-xl bg-white text-zinc-950 px-6 py-2.5 text-sm font-semibold transition-all hover:bg-zinc-100 active:scale-[0.98]"
              style={{ boxShadow: '0 0 0 1px rgba(255,255,255,0.1), 0 4px 20px rgba(0,0,0,0.4)' }}
            >
              Sign up free
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"/>
              </svg>
            </Link>
          </div>
        </section>
      )}
    </div>
  )
}
