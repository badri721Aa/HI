'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// ─── Modules (bento layout: some tall, some wide) ───

const modules = [
  {
    href: '/chat', label: 'Live Chat', tag: 'Realtime',
    desc: 'P2P video calls, presence tracking, typing indicators, emoji reactions — a real messenger, not a form.',
    icon: '💬', hue: '#3B82F6', badge: 'Live', size: 'lg' as const,
    preview: [{ from: 'ayla', msg: 'ur muted' }, { from: 'you', msg: 'lol thx' }, { from: 'ayla', msg: 'call in 5' }],
  },
  {
    href: '/proxy', label: 'Proxy Browser', tag: 'Bypass',
    desc: '8 tabs, ad blocker, stealth mode, command palette, panic key.',
    icon: '🌐', hue: '#8B5CF6', badge: 'Unblocked', size: 'md' as const,
  },
  {
    href: '/ai', label: 'AI Assistant', tag: 'AI',
    desc: 'Streaming chat, essay writer, humanizer, summarizer.',
    icon: '🤖', hue: '#A78BFA', badge: 'Streaming', size: 'md' as const,
  },
  {
    href: '/games', label: 'Game Arcade', tag: 'Games',
    desc: '20+ HTML5 games, NES/GBA/SNES emulators, Flash via Ruffle.',
    icon: '🎮', hue: '#EC4899', badge: '20+', size: 'md' as const,
  },
  {
    href: '/notes', label: 'Encrypted Notes', tag: 'Vault',
    desc: 'PIN-protected local vault. XOR encrypted, color-coded, exportable.',
    icon: '🔒', hue: '#F59E0B', badge: null, size: 'sm' as const,
  },
  {
    href: '/tricks', label: 'Study Tools', tag: 'Study',
    desc: '600+ memorization tricks, exam strategies, speed-reading.',
    icon: '📚', hue: '#0EA5E9', badge: '600+', size: 'sm' as const,
  },
  {
    href: '/extensions', label: 'Extensions', tag: 'Chrome',
    desc: 'Auto Typer, AI Autofill, Humanizer, Stealth Tab, Answer Finder.',
    icon: '🧩', hue: '#10B981', badge: '6', size: 'sm' as const,
  },
  {
    href: '/news', label: 'News Feed', tag: 'Feed',
    desc: 'Pinned announcements, admin broadcasts.',
    icon: '📡', hue: '#FBBF24', badge: null, size: 'sm' as const,
  },
]

const STATS = [
  { value: '20+', label: 'Games' },
  { value: '600+', label: 'Study Tricks' },
  { value: 'P2P', label: 'Video Calls' },
  { value: '∞', label: 'Proxy Sites' },
]

const ROTATING_WORDS = ['study', 'game', 'chat', 'call', 'browse', 'unblock', 'learn', 'talk']

const TICKER_ITEMS = [
  'Real-time P2P video · WebRTC',
  '8-tab proxy browser · Ad blocker',
  '20+ HTML5 games · NES/GBA emulator',
  'AI essay writer · Streaming',
  '600+ study tricks · Memorization',
  'Chrome extensions · 6 tools',
  'Encrypted note vault · XOR + PIN',
  'Owner suite · Role manager · Troll engine',
  'Command palette · ⌘K everywhere',
  '13 stealth tab presets · Panic key',
]

export default function Home() {
  const [user, setUser] = useState<{ email?: string | null } | null>(null)
  const [wordIdx, setWordIdx] = useState(0)
  const [mounted, setMounted] = useState(false)
  const sb = createClient()

  useEffect(() => {
    setMounted(true)
    sb.auth.getUser().then(({ data }) => setUser(data.user))
    const { data: { subscription } } = sb.auth.onAuthStateChange((_ev, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Rotating word carousel
  useEffect(() => {
    const t = setInterval(() => setWordIdx(i => (i + 1) % ROTATING_WORDS.length), 2200)
    return () => clearInterval(t)
  }, [])

  const currentWord = ROTATING_WORDS[wordIdx]

  return (
    <div className="relative min-h-screen bg-black overflow-hidden">
      {/* ─── Ambient background (aurora + grid) ─── */}
      <div className="pointer-events-none fixed inset-0">
        <div className="aurora" />
        <div className="absolute inset-0 hero-grid" />
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* HERO */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <section className="relative mx-auto max-w-6xl px-6 pt-32 pb-16 sm:pt-36 sm:pb-20">
        <div className="flex flex-col items-center text-center gap-6">
          {/* Live badge */}
          <div
            className="inline-flex items-center gap-2 rounded-full px-3 py-1"
            style={{
              background: 'rgba(139,92,246,0.08)',
              border: '1px solid rgba(139,92,246,0.22)',
              boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.04)',
              animation: mounted ? 'fade-in 0.5s ease-out' : 'none',
            }}
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-60" style={{ animation: 'pulse-slow 2s ease-in-out infinite' }} />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-violet-400" style={{ boxShadow: '0 0 8px rgba(167,139,250,0.8)' }} />
            </span>
            <span className="font-mono text-[10px] text-violet-300 uppercase tracking-[0.2em]">Alhekma Platform · v3</span>
          </div>

          {/* Big display headline */}
          <h1
            className="font-nacelle text-5xl sm:text-6xl md:text-7xl font-semibold tracking-tight leading-[0.95] max-w-4xl"
            style={{ animation: mounted ? 'fade-in 0.6s ease-out 0.05s both' : 'none', textWrap: 'balance' }}
          >
            <span className="block text-zinc-100">
              A place to{' '}
              <span className="relative inline-block align-baseline">
                <span
                  key={currentWord}
                  className="inline-block"
                  style={{
                    background: 'linear-gradient(135deg, #A78BFA 0%, #60A5FA 50%, #A78BFA 100%)',
                    backgroundSize: '200% 100%',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    animation: 'fade-in 0.45s ease-out, gradient 4s linear infinite',
                  }}
                >
                  {currentWord}.
                </span>
              </span>
            </span>
            <span
              className="block mt-1"
              style={{
                background: 'linear-gradient(180deg, #71717A 0%, #3F3F46 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              Freely. Together. Always.
            </span>
          </h1>

          {/* Subtitle */}
          <p
            className="max-w-lg text-base text-zinc-500 leading-relaxed"
            style={{ animation: mounted ? 'fade-in 0.6s ease-out 0.15s both' : 'none' }}
          >
            Real-time video, unblocked browsing, AI writing, games, notes, and 600+ study tools.
            All built in. All free. All yours.
          </p>

          {/* CTAs */}
          <div
            className="flex items-center gap-2 flex-wrap justify-center mt-2"
            style={{ animation: mounted ? 'fade-in 0.6s ease-out 0.25s both' : 'none' }}
          >
            {user ? (
              <>
                <Link
                  href="/chat"
                  className="group relative inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-zinc-950 transition-all duration-200 hover:brightness-110 active:scale-[0.98] overflow-hidden"
                  style={{
                    background: 'linear-gradient(180deg, #FAFAFA 0%, #E4E4E7 100%)',
                    boxShadow: '0 0 0 1px rgba(255,255,255,0.15), 0 12px 32px rgba(0,0,0,0.5), inset 0 1px 0 0 rgba(255,255,255,0.4)',
                  }}
                >
                  <span className="relative z-10">Open Chat</span>
                  <svg className="relative z-10 transition-transform duration-200 group-hover:translate-x-0.5" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"/>
                  </svg>
                </Link>
                <Link
                  href="/proxy"
                  className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium text-zinc-200 transition-all duration-200 hover:brightness-125 active:scale-[0.98]"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.06)',
                  }}
                >
                  Proxy Browser
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/auth/login"
                  className="group relative inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-zinc-950 transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
                  style={{
                    background: 'linear-gradient(180deg, #FAFAFA 0%, #E4E4E7 100%)',
                    boxShadow: '0 0 0 1px rgba(255,255,255,0.15), 0 12px 32px rgba(0,0,0,0.5), inset 0 1px 0 0 rgba(255,255,255,0.4)',
                  }}
                >
                  Get started free
                  <svg className="transition-transform duration-200 group-hover:translate-x-0.5" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"/>
                  </svg>
                </Link>
                <Link
                  href="/chat"
                  className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium text-zinc-200 transition-all duration-200 hover:brightness-125 active:scale-[0.98]"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.06)',
                  }}
                >
                  See it live
                </Link>
              </>
            )}
          </div>

          {/* Status strip */}
          <div
            className="flex items-center gap-4 flex-wrap justify-center font-mono text-[10px] text-zinc-600 uppercase tracking-widest mt-3"
            style={{ animation: mounted ? 'fade-in 0.6s ease-out 0.35s both' : 'none' }}
          >
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" style={{ boxShadow: '0 0 6px rgba(16,185,129,0.6)', animation: 'pulse-slow 2s ease-in-out infinite' }} />
              System live
            </span>
            <span className="text-zinc-800">·</span>
            <span className="flex items-center gap-1.5">
              <kbd>⌘ K</kbd> Search
            </span>
            <span className="text-zinc-800">·</span>
            <span>No data sold</span>
            <span className="text-zinc-800">·</span>
            <span>Zero ads</span>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* MARQUEE — what runs on the platform */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <section
        className="relative border-y overflow-hidden"
        style={{ borderColor: 'rgba(255,255,255,0.05)', background: 'rgba(5,5,6,0.6)' }}
      >
        <div className="marquee-pause py-3 overflow-hidden" style={{ maskImage: 'linear-gradient(90deg, transparent, black 8%, black 92%, transparent)' }}>
          <div className="marquee-track">
            {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
              <span key={i} className="mx-6 font-mono text-[11px] text-zinc-500 tracking-wide flex items-center gap-6 whitespace-nowrap">
                {item}
                <span className="text-violet-400/40">◆</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* STATS */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <section className="relative mx-auto max-w-6xl px-6 py-12">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {STATS.map((s, i) => (
            <div
              key={s.label}
              className="relative rounded-2xl p-5 overflow-hidden"
              style={{
                background: 'linear-gradient(180deg, rgba(10,10,12,0.6) 0%, rgba(5,5,6,0.6) 100%)',
                border: '1px solid rgba(255,255,255,0.06)',
                boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.04)',
                animation: mounted ? `fade-in 0.5s ease-out ${0.1 + i * 0.05}s both` : 'none',
              }}
            >
              <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full opacity-30 blur-2xl" style={{ background: 'rgba(139,92,246,0.15)' }} />
              <div className="relative">
                <div className="font-nacelle text-3xl font-semibold text-zinc-100 tabular-nums" style={{
                  background: 'linear-gradient(180deg, #FAFAFA 0%, #A1A1AA 100%)',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
                }}>{s.value}</div>
                <div className="mt-1 font-mono text-[10px] text-zinc-500 uppercase tracking-widest">{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* MODULES — bento grid */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <section className="relative mx-auto max-w-6xl px-6 pb-20">
        <div className="mb-8 flex items-center gap-3">
          <span className="font-mono text-[10px] tracking-[0.2em] text-zinc-600 uppercase">Platform · Modules</span>
          <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0.08), transparent)' }} />
          <span className="font-mono text-[10px] text-zinc-700">{modules.length}</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 auto-rows-[minmax(180px,auto)]">
          {modules.map((m, i) => (
            <ModuleCard key={m.href} m={m} index={i} mounted={mounted} />
          ))}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* BOTTOM CTA */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <section className="relative mx-auto max-w-6xl px-6 pb-24">
        <div
          className="relative rounded-3xl px-8 py-14 sm:py-16 text-center overflow-hidden"
          style={{
            background: 'linear-gradient(180deg, rgba(10,10,12,0.7) 0%, rgba(5,5,6,0.7) 100%)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.06), 0 24px 60px rgba(0,0,0,0.4)',
          }}
        >
          {/* Ambient glow behind */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] rounded-full opacity-30 blur-3xl" style={{ background: 'radial-gradient(ellipse, rgba(139,92,246,0.4) 0%, transparent 70%)' }} />
          </div>

          <div className="relative">
            <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 mb-5" style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)' }}>
              <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
              <span className="font-mono text-[10px] text-violet-300 uppercase tracking-[0.2em]">Free forever</span>
            </div>
            <h2 className="font-nacelle text-3xl sm:text-4xl font-semibold text-zinc-100 tracking-tight mb-3" style={{
              background: 'linear-gradient(180deg, #FAFAFA 0%, #A1A1AA 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
            }}>
              {user ? "You're in. Now go build." : 'Ready to get in?'}
            </h2>
            <p className="text-sm text-zinc-500 mb-8 max-w-md mx-auto">
              {user
                ? 'Every module is unlocked. Open one and start.'
                : "Sign up in ten seconds. Every module unlocks the moment you're in."}
            </p>
            <Link
              href={user ? '/chat' : '/auth/login'}
              className="group inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-zinc-950 transition-all hover:brightness-110 active:scale-[0.98]"
              style={{
                background: 'linear-gradient(180deg, #FAFAFA 0%, #E4E4E7 100%)',
                boxShadow: '0 0 0 1px rgba(255,255,255,0.15), 0 16px 40px rgba(0,0,0,0.5), inset 0 1px 0 0 rgba(255,255,255,0.4)',
              }}
            >
              {user ? 'Open Chat' : 'Sign up free'}
              <svg className="transition-transform duration-200 group-hover:translate-x-0.5" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"/>
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Bottom watermark ─── */}
      <div className="relative mx-auto max-w-6xl px-6 pb-8 flex items-center justify-between text-[10px] font-mono text-zinc-700 uppercase tracking-widest">
        <span>© Alhekma · Built with care</span>
        <span className="flex items-center gap-2">
          <kbd>⌘ K</kbd> anywhere
        </span>
      </div>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════
// MODULE CARD — bento tile
// ═════════════════════════════════════════════════════════════════

function ModuleCard({ m, index, mounted }: { m: typeof modules[0]; index: number; mounted: boolean }) {
  const [mouse, setMouse] = useState({ x: '50%', y: '50%' })

  const sizeClass = m.size === 'lg' ? 'sm:col-span-2 sm:row-span-2 lg:col-span-2 lg:row-span-2' :
    m.size === 'md' ? 'lg:col-span-2 sm:row-span-1' :
    'lg:col-span-1'

  return (
    <Link
      href={m.href}
      className={`group relative flex flex-col rounded-2xl p-5 overflow-hidden transition-all duration-300 ${sizeClass}`}
      style={{
        background: 'linear-gradient(180deg, rgba(10,10,12,0.9) 0%, rgba(5,5,6,0.9) 100%)',
        border: '1px solid rgba(255,255,255,0.06)',
        boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.04)',
        animation: mounted ? `fade-in 0.5s ease-out ${0.15 + index * 0.04}s both` : 'none',
      }}
      onMouseMove={e => {
        const r = e.currentTarget.getBoundingClientRect()
        setMouse({ x: `${((e.clientX - r.left) / r.width) * 100}%`, y: `${((e.clientY - r.top) / r.height) * 100}%` })
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLElement
        el.style.borderColor = `${m.hue}55`
        el.style.boxShadow = `inset 0 1px 0 0 rgba(255,255,255,0.06), 0 0 0 1px ${m.hue}22, 0 16px 40px ${m.hue}14`
        el.style.transform = 'translateY(-2px)'
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLElement
        el.style.borderColor = 'rgba(255,255,255,0.06)'
        el.style.boxShadow = 'inset 0 1px 0 0 rgba(255,255,255,0.04)'
        el.style.transform = 'translateY(0)'
      }}
    >
      {/* Cursor spotlight */}
      <div
        className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{ background: `radial-gradient(360px circle at ${mouse.x} ${mouse.y}, ${m.hue}18 0%, transparent 55%)` }}
      />

      {/* Corner accent */}
      <div className="pointer-events-none absolute -top-16 -right-16 w-40 h-40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-3xl" style={{ background: `${m.hue}20` }} />

      <div className="relative flex-1 flex flex-col">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl text-lg flex-shrink-0 transition-all duration-300 group-hover:scale-110"
              style={{
                background: `linear-gradient(180deg, ${m.hue}18 0%, ${m.hue}0a 100%)`,
                border: `1px solid ${m.hue}30`,
                boxShadow: `inset 0 1px 0 0 rgba(255,255,255,0.08), 0 8px 20px ${m.hue}18`,
              }}
            >
              {m.icon}
            </div>
            <span className="font-mono text-[9px] tracking-widest text-zinc-600 uppercase">{m.tag}</span>
          </div>
          <div className="flex items-center gap-2">
            {m.badge && (
              <span
                className="font-mono text-[9px] rounded-full px-2 py-0.5 tracking-wider"
                style={{
                  background: `${m.hue}12`,
                  color: m.hue,
                  border: `1px solid ${m.hue}30`,
                }}
              >
                {m.badge}
              </span>
            )}
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"
              className="text-zinc-700 transition-all duration-300 group-hover:text-zinc-300 group-hover:translate-x-1 group-hover:-translate-y-1">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25"/>
            </svg>
          </div>
        </div>

        <h3 className="font-nacelle text-lg font-semibold text-zinc-100 tracking-tight mb-2 group-hover:text-white transition-colors">
          {m.label}
        </h3>
        <p className="text-xs text-zinc-500 leading-relaxed group-hover:text-zinc-400 transition-colors">
          {m.desc}
        </p>

        {/* Preview for the big card */}
        {m.size === 'lg' && m.preview && (
          <div
            className="mt-auto pt-5 space-y-1.5"
            style={{ animation: 'fade-in 0.4s ease-out 0.3s both' }}
          >
            {m.preview.map((p, i) => (
              <div
                key={i}
                className={`flex ${p.from === 'you' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[75%] px-3 py-1.5 rounded-xl text-xs ${p.from === 'you' ? 'text-zinc-950 rounded-br-sm' : 'text-zinc-300 rounded-bl-sm'}`}
                  style={{
                    background: p.from === 'you' ? '#FAFAFA' : 'rgba(255,255,255,0.05)',
                    border: p.from === 'you' ? 'none' : '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <span className="mono text-[9px] opacity-50 mr-1.5">{p.from}</span>
                  {p.msg}
                </div>
              </div>
            ))}
            <div className="flex items-center gap-1 pt-2">
              <span className="h-1 w-1 rounded-full bg-emerald-500 animate-pulse" />
              <span className="mono text-[9px] text-zinc-600">ayla is typing…</span>
            </div>
          </div>
        )}
      </div>
    </Link>
  )
}
