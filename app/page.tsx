'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const modules = [
  { href: '/tricks', label: 'Exam Tricks', desc: 'MC patterns, essay shortcuts, time exploits', tag: 'Strategy' },
  { href: '/hacks', label: 'Game Hacks', desc: 'Memory, overlays, trainers — concepts & code', tag: 'Engineering' },
  { href: '/extensions', label: 'Extensions', desc: 'Auto-typer, AI fill, humanizer, stealth tab', tag: 'Chrome' },
  { href: '/chat', label: 'Live Chat', desc: 'Real-time room with owner broadcasts', tag: 'Live' },
  { href: '/ai', label: 'AI Tools', desc: 'Essay gen, answer writer, humanizer', tag: 'AI' },
  { href: '/news', label: 'News Feed', desc: 'Pinned drops, announcements, updates', tag: 'Feed' },
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
          {/* Eyebrow */}
          <div className="mb-5 flex items-center gap-2">
            <span className="h-px w-5 bg-zinc-700" />
            <span className="mono text-[10px] tracking-[0.2em] text-zinc-500 uppercase">Alhekma · Covert · Encrypted</span>
          </div>

          <h1 className="mb-5 font-nacelle text-5xl font-semibold tracking-tight text-zinc-100 md:text-6xl">
            The tools you<br className="hidden sm:block" /> actually need.
          </h1>

          <p className="mb-10 max-w-md text-lg text-zinc-400 leading-relaxed">
            Exam tricks, live chat, game hacks, AI writing tools, and covert Chrome extensions. School-only. No traces.
          </p>

          <div className="flex items-center gap-3 flex-wrap">
            {user ? (
              <>
                <Link
                  href="/chat"
                  className="inline-flex items-center gap-2 rounded-xl bg-white text-zinc-950 px-5 py-2.5 text-sm font-semibold transition-all duration-200 ease-out hover:bg-zinc-100 active:scale-[0.98] shadow-[0_0_0_1px_rgba(255,255,255,0.1)]"
                >
                  Open Chat
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"/>
                  </svg>
                </Link>
                <Link
                  href="/extensions"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-5 py-2.5 text-sm font-medium text-zinc-300 transition-all duration-200 ease-out hover:bg-white/[0.08] hover:border-white/15 active:scale-[0.98]"
                >
                  Extensions
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/auth/login"
                  className="inline-flex items-center gap-2 rounded-xl bg-white text-zinc-950 px-5 py-2.5 text-sm font-semibold transition-all duration-200 ease-out hover:bg-zinc-100 active:scale-[0.98] shadow-[0_0_0_1px_rgba(255,255,255,0.1)]"
                >
                  Sign in
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"/>
                  </svg>
                </Link>
                <Link
                  href="/chat"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-5 py-2.5 text-sm font-medium text-zinc-300 transition-all duration-200 ease-out hover:bg-white/[0.08] hover:border-white/15 active:scale-[0.98]"
                >
                  Live chat
                </Link>
              </>
            )}
          </div>

          {/* Status */}
          <div className="mt-10 flex items-center gap-5 mono text-[10px] text-zinc-600 uppercase tracking-widest">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-[pulse-slow_3s_ease-in-out_infinite]" />
              System live
            </span>
            <span className="text-zinc-800">·</span>
            <span>Shift+Tab — panic hide</span>
            <span className="text-zinc-800">·</span>
            <span>No logs kept</span>
          </div>
        </div>
      </section>

      {/* Divider */}
      <div className="mx-auto max-w-5xl px-6">
        <div className="h-px bg-gradient-to-r from-transparent via-zinc-800 to-transparent" />
      </div>

      {/* Modules */}
      <section className="mx-auto max-w-5xl px-6 py-20">
        <div className="mb-10 flex items-center gap-3">
          <span className="mono text-[10px] tracking-[0.2em] text-zinc-500 uppercase">Modules</span>
          <div className="h-px flex-1 bg-zinc-800/60" />
        </div>

        <div className="grid grid-cols-1 gap-px sm:grid-cols-2 lg:grid-cols-3">
          {modules.map((m, i) => (
            <Link
              key={m.href}
              href={m.href}
              className="group relative flex flex-col p-6 transition-all duration-200 ease-out hover:bg-white/[0.025] rounded-2xl"
            >
              {/* Corner accent on hover */}
              <div className="absolute inset-0 rounded-2xl border border-white/0 transition-all duration-200 group-hover:border-white/[0.08]" />

              <div className="mb-3 flex items-start justify-between">
                <span className="mono text-[10px] tracking-widest text-zinc-600 uppercase">{m.tag}</span>
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
