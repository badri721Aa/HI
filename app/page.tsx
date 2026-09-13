'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const modules = [
  { href: '/chat', label: 'Live Chat', desc: 'Real-time messaging, presence tracking, P2P video calls', tag: 'Realtime' },
  { href: '/news', label: 'News Feed', desc: 'Pinned announcements and admin broadcasts', tag: 'Feed' },
  { href: '/ai', label: 'AI Assistant', desc: 'Built-in local AI — no API keys, runs in-browser', tag: 'AI' },
  { href: '/extensions', label: 'Extensions', desc: 'Platform companion Chrome extension with live data', tag: 'Chrome' },
  { href: '/tricks', label: 'Study Tools', desc: 'Memorization techniques and exam strategy guides', tag: 'Study' },
  { href: '/admin', label: 'Admin Panel', desc: 'Platform management, roles, and developer tools', tag: 'Admin' },
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
    <div className="relative">
      {/* Ambient background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[600px] rounded-full bg-[radial-gradient(ellipse,rgba(99,59,218,0.06)_0%,transparent_70%)]" />
        <div className="absolute top-1/2 -right-40 w-[500px] h-[500px] rounded-full bg-[radial-gradient(ellipse,rgba(59,130,246,0.03)_0%,transparent_70%)]" />
      </div>

      {/* Hero */}
      <section className="relative mx-auto max-w-5xl px-6 pt-40 pb-24">
        <div className="max-w-2xl">
          <div className="mb-5 flex items-center gap-2">
            <span className="h-px w-5 bg-zinc-700" />
            <span className="font-mono text-[10px] tracking-[0.2em] text-zinc-500 uppercase">Alhekma · Platform</span>
          </div>

          <h1 className="mb-5 font-nacelle text-5xl font-semibold tracking-tight text-zinc-100 md:text-6xl">
            The platform<br className="hidden sm:block" /> built for you.
          </h1>

          <p className="mb-10 max-w-md text-lg text-zinc-400 leading-relaxed">
            Real-time chat with P2P video, live news broadcasts, a local AI assistant, and admin tools — all in one platform.
          </p>

          <div className="flex items-center gap-3 flex-wrap">
            {user ? (
              <>
                <Link
                  href="/chat"
                  className="inline-flex items-center gap-2 rounded-xl bg-white text-zinc-950 px-5 py-2.5 text-sm font-semibold transition-all duration-150 ease-out hover:bg-zinc-100 active:scale-[0.98]"
                  style={{ boxShadow: '0 0 0 1px rgba(255,255,255,0.1), 0 4px 15px rgba(0,0,0,0.3)' }}
                >
                  Open Chat
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"/>
                  </svg>
                </Link>
                <Link
                  href="/news"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.04] px-5 py-2.5 text-sm font-medium text-zinc-300 transition-all duration-150 ease-out hover:bg-white/[0.08] hover:border-white/[0.15] active:scale-[0.98]"
                  style={{ boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.05)' }}
                >
                  News Feed
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/auth/login"
                  className="inline-flex items-center gap-2 rounded-xl bg-white text-zinc-950 px-5 py-2.5 text-sm font-semibold transition-all duration-150 ease-out hover:bg-zinc-100 active:scale-[0.98]"
                  style={{ boxShadow: '0 0 0 1px rgba(255,255,255,0.1), 0 4px 15px rgba(0,0,0,0.3)' }}
                >
                  Sign in
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"/>
                  </svg>
                </Link>
                <Link
                  href="/chat"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.04] px-5 py-2.5 text-sm font-medium text-zinc-300 transition-all duration-150 ease-out hover:bg-white/[0.08] hover:border-white/[0.15] active:scale-[0.98]"
                  style={{ boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.05)' }}
                >
                  Live chat
                </Link>
              </>
            )}
          </div>

          <div className="mt-10 flex items-center gap-5 font-mono text-[10px] text-zinc-600 uppercase tracking-widest">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-[pulse-slow_3s_ease-in-out_infinite]" />
              System live
            </span>
            <span className="text-zinc-800">·</span>
            <span>Shift+Tab — dismiss view</span>
            <span className="text-zinc-800">·</span>
            <span>No logs kept</span>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-6">
        <div className="h-px bg-gradient-to-r from-transparent via-zinc-800 to-transparent" />
      </div>

      {/* Modules */}
      <section className="mx-auto max-w-5xl px-6 py-20">
        <div className="mb-10 flex items-center gap-3">
          <span className="font-mono text-[10px] tracking-[0.2em] text-zinc-500 uppercase">Platform Modules</span>
          <div className="h-px flex-1 bg-zinc-800/60" />
        </div>

        <div className="grid grid-cols-1 gap-px sm:grid-cols-2 lg:grid-cols-3">
          {modules.map(m => (
            <Link
              key={m.href}
              href={m.href}
              className="group relative flex flex-col p-6 transition-all duration-200 ease-out hover:bg-white/[0.025] rounded-2xl"
            >
              <div className="absolute inset-0 rounded-2xl border border-white/0 transition-all duration-200 group-hover:border-white/[0.08]" />
              <div className="mb-3 flex items-start justify-between">
                <span className="font-mono text-[10px] tracking-widest text-zinc-600 uppercase">{m.tag}</span>
                <svg
                  width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5"
                  viewBox="0 0 24 24"
                  className="text-zinc-700 transition-all duration-200 group-hover:text-zinc-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25"/>
                </svg>
              </div>
              <h3 className="mb-2 font-nacelle text-base font-semibold text-zinc-200 tracking-tight group-hover:text-zinc-100 transition-colors duration-200">
                {m.label}
              </h3>
              <p className="text-sm text-zinc-500 leading-relaxed group-hover:text-zinc-400 transition-colors duration-200">
                {m.desc}
              </p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
