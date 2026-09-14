'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import { isOwner, isRootOwner, canAdmin } from '@/lib/utils'

const links = [
  { href: '/chat', label: 'Chat' },
  { href: '/news', label: 'News' },
  { href: '/proxy', label: 'Proxy' },
  { href: '/ai', label: 'AI' },
  { href: '/games', label: 'Games' },
  { href: '/tricks', label: 'Study' },
  { href: '/notes', label: 'Notes' },
  { href: '/extensions', label: 'Extensions' },
]

export function Nav() {
  const path = usePathname()
  const [user, setUser] = useState<User | null>(null)
  const [role, setRole] = useState('user')
  const [menuOpen, setMenuOpen] = useState(false)
  const sb = createClient()

  useEffect(() => {
    async function init(u: User | null) {
      setUser(u)
      if (!u) { setRole('user'); return }
      const { data } = await sb.from('profiles').select('role').eq('id', u.id).single()
      setRole(data?.role ?? 'user')
    }

    sb.auth.getUser().then(({ data }) => init(data.user))

    const { data: { subscription } } = sb.auth.onAuthStateChange((_ev, session) => {
      init(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function signOut() {
    await sb.auth.signOut()
    window.location.href = '/'
  }

  const showAdmin = canAdmin(role)  // driven by DB role only

  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex justify-center pt-4 px-4">
      <nav className="w-full max-w-5xl">
        <div className="glass-hi flex h-12 items-center gap-1 rounded-2xl px-2">
          {/* Logo */}
          <Link
            href="/"
            className="mr-2 flex items-center gap-2 rounded-xl px-3 py-2 transition-all duration-150 hover:bg-white/[0.05] active:scale-[0.97]"
          >
            <div className="h-5 w-5 rounded-md bg-gradient-to-br from-zinc-300 to-zinc-500 flex items-center justify-center">
              <span className="text-[8px] font-bold text-zinc-950">AL</span>
            </div>
            <span className="font-nacelle text-sm font-semibold text-zinc-200 tracking-tight">
              Alhekma
            </span>
          </Link>

          <div className="h-4 w-px bg-zinc-800 mx-1" />

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-0.5 flex-1">
            {links.map(l => {
              const active = path === l.href || path.startsWith(l.href + '/')
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`relative px-3 py-1.5 rounded-lg text-xs font-medium transition-colors duration-150 ${
                    active ? 'text-zinc-100' : 'text-zinc-500 hover:text-zinc-200'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="nav-active-pill"
                      className="absolute inset-0 rounded-lg bg-white/[0.08]"
                      style={{ boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.08)' }}
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  <span className="relative z-10">{l.label}</span>
                </Link>
              )
            })}
            {showAdmin && (
              <Link
                href="/admin"
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${
                  path.startsWith('/admin') && !path.startsWith('/admin/owner-suite')
                    ? 'text-amber-300 bg-amber-500/10'
                    : 'text-amber-500/50 hover:text-amber-300 hover:bg-amber-500/[0.06]'
                }`}
              >
                Admin
              </Link>
            )}
            {role === 'owner' && isRootOwner(user?.email) && (
              <Link
                href="/admin/owner-suite"
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 flex items-center gap-1 ${
                  path.startsWith('/admin/owner-suite')
                    ? 'text-amber-300 bg-amber-500/15 border border-amber-500/30'
                    : 'text-amber-600/60 hover:text-amber-300 hover:bg-amber-500/[0.08] border border-transparent hover:border-amber-500/20'
                }`}
                style={{ boxShadow: path.startsWith('/admin/owner-suite') ? '0 0 12px rgba(251,191,36,0.15)' : undefined }}
              >
                <span className="text-[10px]">👑</span> Suite
              </Link>
            )}
          </div>

          <div className="flex-1 md:hidden" />

          {/* Right side */}
          <div className="flex items-center gap-2 ml-1">
            {user ? (
              <>
                {role === 'owner' && (
                  <span className="hidden sm:flex items-center gap-1 font-mono text-[10px] text-amber-500/70 border border-amber-500/20 rounded-full px-2 py-0.5">
                    Owner
                  </span>
                )}
                <span className="hidden sm:block font-mono text-[11px] text-zinc-600 truncate max-w-[120px]">
                  {user.email}
                </span>
                <button
                  onClick={signOut}
                  className="rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-1.5 text-xs text-zinc-500 transition-all duration-150 hover:bg-white/[0.07] hover:text-zinc-300 active:scale-[0.97]"
                >
                  Sign out
                </button>
              </>
            ) : (
              <Link
                href="/auth/login"
                className="rounded-lg border border-white/[0.09] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-300 transition-all duration-150 hover:bg-white/[0.08] hover:border-white/[0.15] active:scale-[0.97]"
                style={{ boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.05)' }}
              >
                Sign in
              </Link>
            )}

            {/* Mobile toggle */}
            <button
              className="md:hidden rounded-lg p-1.5 text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.05] transition-all duration-150"
              onClick={() => setMenuOpen(o => !o)}
              aria-label="Toggle menu"
            >
              {menuOpen ? (
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              ) : (
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" d="M3 6h18M3 12h18M3 18h18"/>
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="glass-card mt-1.5 rounded-2xl p-2 flex flex-col gap-0.5 md:hidden">
            {links.map(l => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setMenuOpen(false)}
                className={`px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                  path === l.href ? 'bg-white/[0.07] text-zinc-100' : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.04]'
                }`}
              >
                {l.label}
              </Link>
            ))}
            {showAdmin && (
              <Link
                href="/admin"
                onClick={() => setMenuOpen(false)}
                className="px-3 py-2.5 rounded-xl text-sm font-medium text-amber-500/60 hover:text-amber-300 hover:bg-amber-500/[0.06] transition-all duration-150"
              >
                Admin Panel
              </Link>
            )}
            {role === 'owner' && isRootOwner(user?.email) && (
              <Link
                href="/admin/owner-suite"
                onClick={() => setMenuOpen(false)}
                className="px-3 py-2.5 rounded-xl text-sm font-medium text-amber-400/70 hover:text-amber-300 hover:bg-amber-500/[0.06] transition-all duration-150 flex items-center gap-2 border border-amber-500/15"
              >
                <span>👑</span> Owner Suite
              </Link>
            )}
          </div>
        )}
      </nav>
    </header>
  )
}
