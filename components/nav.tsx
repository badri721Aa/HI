'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import { isOwner } from '@/lib/utils'

const links = [
  { href: '/tricks', label: 'Tricks' },
  { href: '/hacks', label: 'Hacks' },
  { href: '/extensions', label: 'Extensions' },
  { href: '/chat', label: 'Chat' },
  { href: '/ai', label: 'AI' },
  { href: '/news', label: 'News' },
]

export function Nav() {
  const path = usePathname()
  const [user, setUser] = useState<User | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const sb = createClient()

  useEffect(() => {
    sb.auth.getUser().then(({ data }) => {
      setUser(data.user)
      if (data.user?.email) checkAdmin(data.user.email)
    })
    const { data: { subscription } } = sb.auth.onAuthStateChange((_ev, session) => {
      setUser(session?.user ?? null)
      if (session?.user?.email) checkAdmin(session.user.email)
      else setIsAdmin(false)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function checkAdmin(email: string) {
    if (isOwner(email)) { setIsAdmin(true); return }
    const { data } = await sb.from('admins').select('email').eq('email', email).single()
    setIsAdmin(!!data)
  }

  async function signOut() {
    await sb.auth.signOut()
    window.location.href = '/'
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex justify-center pt-4 px-4">
      <nav className="w-full max-w-5xl">
        {/* Main bar */}
        <div className="glass-hi flex h-12 items-center gap-1 rounded-2xl px-2">
          {/* Logo */}
          <Link
            href="/"
            className="mr-2 flex items-center gap-2 rounded-xl px-3 py-2 transition-all duration-200 hover:bg-white/[0.05]"
          >
            <div className="h-5 w-5 rounded-md bg-gradient-to-br from-zinc-300 to-zinc-500 flex items-center justify-center">
              <span className="text-[8px] font-bold text-zinc-950">AC</span>
            </div>
            <span className="font-nacelle text-sm font-semibold text-zinc-200 tracking-tight">
              Alhekma
            </span>
          </Link>

          {/* Separator */}
          <div className="h-4 w-px bg-zinc-800 mx-1" />

          {/* Nav links */}
          <div className="hidden md:flex items-center gap-0.5 flex-1">
            {links.map(l => {
              const active = path === l.href
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`relative px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${
                    active
                      ? 'text-zinc-100 bg-white/[0.07]'
                      : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.04]'
                  }`}
                >
                  {l.label}
                </Link>
              )
            })}
            {(isAdmin || isOwner(user?.email ?? '')) && (
              <Link
                href="/admin"
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${
                  path === '/admin'
                    ? 'text-amber-300 bg-amber-500/10'
                    : 'text-amber-500/50 hover:text-amber-300 hover:bg-amber-500/[0.06]'
                }`}
              >
                Admin
              </Link>
            )}
          </div>

          <div className="flex-1 md:hidden" />

          {/* Right side */}
          <div className="flex items-center gap-2 ml-1">
            {user ? (
              <>
                {isOwner(user.email ?? '') && (
                  <span className="hidden sm:flex items-center gap-1 mono text-[10px] text-amber-500/70 border border-amber-500/20 rounded-full px-2 py-0.5">
                    Owner
                  </span>
                )}
                <span className="hidden sm:block mono text-[11px] text-zinc-600 truncate max-w-[120px]">
                  {user.email}
                </span>
                <button
                  onClick={signOut}
                  className="rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-1.5 text-xs text-zinc-500 transition-all duration-200 hover:bg-white/[0.07] hover:text-zinc-300 active:scale-[0.97]"
                >
                  Sign out
                </button>
              </>
            ) : (
              <Link
                href="/auth/login"
                className="rounded-lg border border-white/[0.09] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-300 transition-all duration-200 hover:bg-white/[0.08] hover:border-white/15 active:scale-[0.97]"
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
          <div className="glass-card mt-1.5 rounded-2xl p-2 flex flex-col gap-0.5 md:hidden animate-[fade-in_0.15s_ease-out]">
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
            {(isAdmin || isOwner(user?.email ?? '')) && (
              <Link
                href="/admin"
                onClick={() => setMenuOpen(false)}
                className="px-3 py-2.5 rounded-xl text-sm font-medium text-amber-500/60 hover:text-amber-300 hover:bg-amber-500/[0.06] transition-all duration-150"
              >
                Admin Panel
              </Link>
            )}
          </div>
        )}
      </nav>
    </header>
  )
}
