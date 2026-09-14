'use client'

import Link from 'next/link'
import { useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { isRootOwner } from '@/lib/utils'
import { motion } from 'framer-motion'

// ── Particle canvas ──────────────────────────────────────────
function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouse = useRef({ x: -9999, y: -9999 })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    const PARTICLE_COUNT = 90
    const MAX_DIST = 120
    const MOUSE_DIST = 160

    type P = { x: number; y: number; vx: number; vy: number; r: number }
    let particles: P[] = []

    function resize() {
      canvas!.width = window.innerWidth
      canvas!.height = window.innerHeight
    }

    function init() {
      resize()
      particles = Array.from({ length: PARTICLE_COUNT }, () => ({
        x: Math.random() * canvas!.width,
        y: Math.random() * canvas!.height,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        r: Math.random() * 1.5 + 0.5,
      }))
    }

    function draw() {
      ctx!.clearRect(0, 0, canvas!.width, canvas!.height)

      for (const p of particles) {
        p.x += p.vx
        p.y += p.vy
        if (p.x < 0 || p.x > canvas!.width) p.vx *= -1
        if (p.y < 0 || p.y > canvas!.height) p.vy *= -1

        // Mouse repulsion
        const mdx = p.x - mouse.current.x
        const mdy = p.y - mouse.current.y
        const md = Math.sqrt(mdx * mdx + mdy * mdy)
        if (md < MOUSE_DIST) {
          const force = (MOUSE_DIST - md) / MOUSE_DIST * 0.6
          p.vx += (mdx / md) * force * 0.12
          p.vy += (mdy / md) * force * 0.12
        }
        // Speed cap
        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy)
        if (speed > 1.2) { p.vx = (p.vx / speed) * 1.2; p.vy = (p.vy / speed) * 1.2 }

        ctx!.beginPath()
        ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx!.fillStyle = 'rgba(161,161,170,0.4)'
        ctx!.fill()
      }

      // Lines between nearby particles
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x
          const dy = particles[i].y - particles[j].y
          const d = Math.sqrt(dx * dx + dy * dy)
          if (d < MAX_DIST) {
            const alpha = (1 - d / MAX_DIST) * 0.18
            ctx!.strokeStyle = `rgba(161,161,170,${alpha})`
            ctx!.lineWidth = 0.6
            ctx!.beginPath()
            ctx!.moveTo(particles[i].x, particles[i].y)
            ctx!.lineTo(particles[j].x, particles[j].y)
            ctx!.stroke()
          }
        }
        // Line to mouse
        const mdx = particles[i].x - mouse.current.x
        const mdy = particles[i].y - mouse.current.y
        const md = Math.sqrt(mdx * mdx + mdy * mdy)
        if (md < MOUSE_DIST) {
          const alpha = (1 - md / MOUSE_DIST) * 0.35
          ctx!.strokeStyle = `rgba(139,92,246,${alpha})`
          ctx!.lineWidth = 0.8
          ctx!.beginPath()
          ctx!.moveTo(particles[i].x, particles[i].y)
          ctx!.lineTo(mouse.current.x, mouse.current.y)
          ctx!.stroke()
        }
      }

      raf = requestAnimationFrame(draw)
    }

    init()
    draw()
    window.addEventListener('resize', init)

    const onMove = (e: MouseEvent) => { mouse.current = { x: e.clientX, y: e.clientY } }
    const onLeave = () => { mouse.current = { x: -9999, y: -9999 } }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseleave', onLeave)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', init)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseleave', onLeave)
    }
  }, [])

  return <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-0" />
}

// ── Tilt card ────────────────────────────────────────────────
function TiltCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)

  const onMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const cx = rect.width / 2
    const cy = rect.height / 2
    const rotX = ((y - cy) / cy) * -6
    const rotY = ((x - cx) / cx) * 6
    el.style.transform = `perspective(700px) rotateX(${rotX}deg) rotateY(${rotY}deg) translateZ(4px)`
  }, [])

  const onLeave = useCallback(() => {
    if (ref.current) ref.current.style.transform = ''
  }, [])

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className={className}
      style={{ transition: 'transform 0.15s ease', willChange: 'transform' }}
    >
      {children}
    </div>
  )
}

// ── Stat counter ─────────────────────────────────────────────
function CountUp({ to, suffix = '' }: { to: number; suffix?: string }) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    let start = 0
    const step = Math.ceil(to / 40)
    const t = setInterval(() => {
      start = Math.min(start + step, to)
      setVal(start)
      if (start >= to) clearInterval(t)
    }, 30)
    return () => clearInterval(t)
  }, [to])
  return <>{val.toLocaleString()}{suffix}</>
}

// ── Modules ───────────────────────────────────────────────────
const MODULES = [
  {
    href: '/chat', label: 'Live Chat', desc: 'Real-time messaging, emoji reactions, presence tracking and broadcast announcements.',
    tag: 'Realtime', glow: 'rgba(59,130,246,0.12)', dot: 'bg-blue-500',
  },
  {
    href: '/news', label: 'News Feed', desc: 'Pinned announcements and admin broadcasts visible to everyone instantly.',
    tag: 'Feed', glow: 'rgba(245,158,11,0.10)', dot: 'bg-amber-500',
  },
  {
    href: '/ai', label: 'AI Assistant', desc: 'In-browser AI — no API keys, no data leaves your device.',
    tag: 'AI', glow: 'rgba(139,92,246,0.12)', dot: 'bg-violet-500',
  },
  {
    href: '/tricks', label: 'Study Tools', desc: 'Memorisation techniques, exam strategies, and quick-reference guides.',
    tag: 'Study', glow: 'rgba(14,165,233,0.10)', dot: 'bg-sky-500',
  },
  {
    href: '/proxy', label: 'Proxy Browser', desc: 'Dynamic mirror domains, WSS obfuscation, and service-worker routing — bypass any filter.',
    tag: 'Proxy', glow: 'rgba(139,92,246,0.10)', dot: 'bg-violet-400',
  },
  {
    href: '/meet', label: 'Random Chat', desc: 'Anonymous WebRTC video/text pairing — Omegle-style matchmaking with live WebGL filters.',
    tag: 'WebRTC', glow: 'rgba(236,72,153,0.10)', dot: 'bg-pink-500',
  },
  {
    href: '/friends', label: 'Friends & DMs', desc: 'Friend lists, online presence, 1-on-1 audio/video calls, push notifications and custom statuses.',
    tag: 'Social', glow: 'rgba(34,197,94,0.10)', dot: 'bg-emerald-500',
  },
  {
    href: '/themes', label: 'Themes', desc: 'Neon Cyberpunk, OLED Glassmorphism, Retro CRT — live CSS variable engine with custom backgrounds.',
    tag: 'UI', glow: 'rgba(251,191,36,0.10)', dot: 'bg-yellow-400',
  },
  {
    href: '/extensions', label: 'Extensions', desc: 'Chrome companion extension with live platform data and hotkeys.',
    tag: 'Chrome', glow: 'rgba(59,130,246,0.08)', dot: 'bg-blue-400',
  },
  // Owner-only
  {
    href: '/admin', label: 'Admin Panel', desc: 'Roles, users, broadcasts, audit log and ban management.',
    tag: 'Admin', glow: 'rgba(239,68,68,0.08)', dot: 'bg-rose-500', ownerOnly: true,
  },
  {
    href: '/admin/devtools', label: 'Dev Tools', desc: 'REST tester, JWT decoder, hash generator, regex inspector, JS sandbox and more.',
    tag: 'Dev', glow: 'rgba(20,184,166,0.10)', dot: 'bg-teal-500', ownerOnly: true,
  },
  {
    href: '/admin/troll-panel', label: 'Troll Engine', desc: 'Broadcast 10+ visual effects, soundboard, fake UI overlays to any online user.',
    tag: 'Fun', glow: 'rgba(239,68,68,0.10)', dot: 'bg-rose-400', ownerOnly: true,
  },
]

const STATS = [
  { label: 'Platform features', value: 1000, suffix: '+' },
  { label: 'Modules', value: 12, suffix: '' },
  { label: 'Troll effects', value: 21, suffix: '+' },
  { label: 'Uptime', value: 100, suffix: '%' },
]

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
}
const cardVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
}

export default function Home() {
  const [user, setUser] = useState<{ email?: string | null } | null>(null)
  const [owner, setOwner] = useState(false)
  const sb = createClient()

  useEffect(() => {
    async function load() {
      const { data } = await sb.auth.getUser()
      const u = data.user ?? null
      setUser(u)
      setOwner(isRootOwner(u?.email))
    }
    load()
    const { data: { subscription } } = sb.auth.onAuthStateChange((_ev, s) => {
      const u = s?.user ?? null
      setUser(u)
      setOwner(isRootOwner(u?.email))
    })
    return () => subscription.unsubscribe()
  }, [])

  const visibleModules = MODULES.filter(m => !('ownerOnly' in m && m.ownerOnly) || owner)

  return (
    <div className="relative min-h-screen">
      <ParticleCanvas />

      {/* Glow blobs */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute -top-60 left-1/2 -translate-x-1/2 w-[1000px] h-[700px] rounded-full"
          style={{ background: 'radial-gradient(ellipse, rgba(99,59,218,0.07) 0%, transparent 65%)' }} />
        <div className="absolute top-[55%] -right-60 w-[600px] h-[600px] rounded-full"
          style={{ background: 'radial-gradient(ellipse, rgba(59,130,246,0.04) 0%, transparent 65%)' }} />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] rounded-full"
          style={{ background: 'radial-gradient(ellipse, rgba(139,92,246,0.04) 0%, transparent 65%)' }} />
      </div>

      {/* Hero */}
      <section className="relative z-10 mx-auto max-w-5xl px-6 pt-40 pb-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-2xl"
        >
          <div className="mb-5 flex items-center gap-2">
            <span className="h-px w-5 bg-zinc-700" />
            <span className="font-mono text-[10px] tracking-[0.2em] text-zinc-500 uppercase">Alhekma · Platform</span>
          </div>

          <h1 className="mb-5 font-nacelle text-5xl font-semibold tracking-tight text-zinc-100 md:text-6xl leading-[1.08]">
            The platform<br className="hidden sm:block" />
            <span className="relative inline-block">
              built for you.
              <span className="absolute -bottom-1 left-0 h-px w-full bg-gradient-to-r from-violet-500/60 to-transparent" />
            </span>
          </h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15, duration: 0.5 }}
            className="mb-10 max-w-md text-lg text-zinc-400 leading-relaxed"
          >
            Real-time chat, live news, 600+ dev & troll tools, local AI, proxy, and a full admin suite — one unified platform.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.22, duration: 0.45 }}
            className="flex items-center gap-3 flex-wrap"
          >
            {user ? (
              <>
                <Link href="/chat"
                  className="inline-flex items-center gap-2 rounded-xl bg-white text-zinc-950 px-5 py-2.5 text-sm font-semibold transition-all duration-150 hover:bg-zinc-100 active:scale-[0.97]"
                  style={{ boxShadow: '0 0 0 1px rgba(255,255,255,0.1), 0 4px 20px rgba(0,0,0,0.35)' }}
                >
                  Open Chat
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"/></svg>
                </Link>
                <Link href="/news"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.04] px-5 py-2.5 text-sm font-medium text-zinc-300 transition-all duration-150 hover:bg-white/[0.08] hover:border-white/[0.15] active:scale-[0.97]"
                  style={{ boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.05)' }}
                >
                  News Feed
                </Link>
                {owner && (
                  <Link href="/admin/troll-panel"
                    className="inline-flex items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/[0.07] px-5 py-2.5 text-sm font-medium text-rose-400 transition-all duration-150 hover:bg-rose-500/[0.12] active:scale-[0.97]"
                  >
                    Troll Engine
                  </Link>
                )}
              </>
            ) : (
              <>
                <Link href="/auth/login"
                  className="inline-flex items-center gap-2 rounded-xl bg-white text-zinc-950 px-5 py-2.5 text-sm font-semibold transition-all duration-150 hover:bg-zinc-100 active:scale-[0.97]"
                  style={{ boxShadow: '0 0 0 1px rgba(255,255,255,0.1), 0 4px 20px rgba(0,0,0,0.35)' }}
                >
                  Sign in →
                </Link>
                <Link href="/chat"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.04] px-5 py-2.5 text-sm font-medium text-zinc-300 transition-all duration-150 hover:bg-white/[0.08] active:scale-[0.97]"
                >
                  Live chat
                </Link>
              </>
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35, duration: 0.5 }}
            className="mt-10 flex items-center gap-5 font-mono text-[10px] text-zinc-600 uppercase tracking-widest flex-wrap"
          >
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              System live
            </span>
            <span className="text-zinc-800">·</span>
            <span>Ctrl+K — command palette</span>
            <span className="text-zinc-800">·</span>
            <span>No logs kept</span>
          </motion.div>
        </motion.div>
      </section>

      {/* Stats row */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        className="relative z-10 mx-auto max-w-5xl px-6 pb-16"
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px rounded-2xl overflow-hidden border border-white/[0.06] bg-white/[0.03]" style={{ backdropFilter: 'blur(12px)' }}>
          {STATS.map(s => (
            <div key={s.label} className="p-5 bg-zinc-950/40">
              <p className="font-nacelle text-3xl font-semibold text-zinc-100">
                <CountUp to={s.value} suffix={s.suffix} />
              </p>
              <p className="mono text-[10px] text-zinc-600 uppercase tracking-widest mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </motion.section>

      <div className="relative z-10 mx-auto max-w-5xl px-6">
        <div className="h-px bg-gradient-to-r from-transparent via-zinc-800 to-transparent" />
      </div>

      {/* Module grid */}
      <section className="relative z-10 mx-auto max-w-5xl px-6 py-20">
        <div className="mb-10 flex items-center gap-3">
          <span className="font-mono text-[10px] tracking-[0.2em] text-zinc-500 uppercase">Platform Modules</span>
          <div className="h-px flex-1 bg-zinc-800/60" />
          <span className="mono text-[10px] text-zinc-700">{visibleModules.length} modules</span>
        </div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
        >
          {visibleModules.map(m => (
            <motion.div key={m.href} variants={cardVariants}>
              <TiltCard>
                <Link
                  href={m.href}
                  className="group relative flex flex-col p-5 rounded-2xl border border-white/[0.06] bg-zinc-950/60 overflow-hidden transition-all duration-200 hover:border-white/[0.12]"
                  style={{ backdropFilter: 'blur(8px)' }}
                >
                  {/* Glow on hover */}
                  <div
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                    style={{ background: `radial-gradient(ellipse at 50% 0%, ${m.glow}, transparent 70%)` }}
                  />
                  <div className="relative flex items-start justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
                      <span className="font-mono text-[9px] tracking-widest text-zinc-600 uppercase">{m.tag}</span>
                    </div>
                    <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"
                      className="text-zinc-700 group-hover:text-zinc-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-200">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25"/>
                    </svg>
                  </div>
                  <h3 className="relative mb-1.5 font-nacelle text-base font-semibold text-zinc-200 tracking-tight group-hover:text-zinc-100 transition-colors duration-200">
                    {m.label}
                  </h3>
                  <p className="relative text-xs text-zinc-500 leading-relaxed group-hover:text-zinc-400 transition-colors duration-200">
                    {m.desc}
                  </p>
                </Link>
              </TiltCard>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* Footer hint */}
      <div className="relative z-10 mx-auto max-w-5xl px-6 pb-20 text-center">
        <p className="mono text-[10px] text-zinc-700">Press <kbd className="border border-white/[0.07] rounded px-1 py-0.5 text-zinc-600">Ctrl+K</kbd> to search everything</p>
      </div>
    </div>
  )
}
