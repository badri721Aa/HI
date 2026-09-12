'use client'

import { BlackHoleHeroSection } from '@/components/ui/blackhole-hero-section'
import Link from 'next/link'

const features = [
  { href: '/tricks', icon: '◈', label: 'Exam Tricks', desc: 'Methods, patterns, shortcuts that work' },
  { href: '/hacks', icon: '◉', label: 'Game Hacks', desc: 'Memory readers, trainers, overlays' },
  { href: '/extensions', icon: '◫', label: 'Extensions', desc: 'Chrome tools: auto-type, AI, humanizer' },
  { href: '/chat', icon: '◌', label: 'Live Chat', desc: 'Real-time room. Broadcasted announcements' },
  { href: '/ai', icon: '◎', label: 'AI Tools', desc: 'Essay writers, answer gen, humanizer' },
  { href: '/news', icon: '◷', label: 'News Feed', desc: 'Pinned drops and updates' },
]

export default function Home() {
  return (
    <div className="relative min-h-screen flex flex-col">
      {/* Hero */}
      <BlackHoleHeroSection
        distance={24}
        elevation={-5.5}
        orbitSpeed={0}
        diskInner={3}
        diskOuter={15}
        steps={300}
        resolution={0.7}
        scrim="bottom"
        scrimStrength={0.85}
      >
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 pt-14">
          <div className="mono text-[10px] tracking-[0.4em] text-white/30 mb-6 uppercase">
            alhekma · secure · covert
          </div>
          <h1 className="text-5xl md:text-7xl font-light text-white mb-4 tracking-tight leading-none">
            NO_SIGNAL
          </h1>
          <p className="text-white/40 text-sm md:text-base max-w-md font-light leading-relaxed mb-10">
            Tools, tricks, and real-time comms. School-only access. Shift+Tab to vanish.
          </p>
          <div className="flex items-center gap-3">
            <Link
              href="/auth/login"
              className="glass-hi px-6 py-3 rounded-xl text-sm text-white hover:bg-white/10 transition-all duration-200 font-medium"
            >
              Sign in with school email
            </Link>
            <Link
              href="/chat"
              className="px-6 py-3 rounded-xl text-sm text-white/50 hover:text-white transition-colors duration-200"
            >
              Live chat →
            </Link>
          </div>

          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 mono text-[9px] text-white/20 tracking-widest">
            SHIFT+TAB — PANIC HIDE
          </div>
        </div>
      </BlackHoleHeroSection>

      {/* Features grid */}
      <div className="relative z-10 px-4 md:px-8 py-20 max-w-5xl mx-auto w-full">
        <div className="mono text-[10px] tracking-[0.4em] text-white/20 uppercase mb-10 text-center">
          modules
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map(f => (
            <Link
              key={f.href}
              href={f.href}
              className="glass rounded-2xl p-6 hover:bg-white/8 transition-all duration-300 group border border-white/8 hover:border-white/15"
            >
              <div className="text-2xl text-white/30 group-hover:text-white/60 transition-colors duration-300 mb-3 mono">
                {f.icon}
              </div>
              <div className="text-sm font-medium text-white/80 group-hover:text-white transition-colors duration-300 mb-1">
                {f.label}
              </div>
              <div className="text-xs text-white/30 group-hover:text-white/50 transition-colors duration-300 leading-relaxed">
                {f.desc}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
