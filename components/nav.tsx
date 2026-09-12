'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import { isOwner } from '@/lib/utils'

const links = [
  { href: '/', label: 'Home' },
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
      if (data.user?.email) {
        checkAdmin(data.user.email)
      }
    })
    const { data: { subscription } } = sb.auth.onAuthStateChange((_ev, session) => {
      setUser(session?.user ?? null)
      if (session?.user?.email) {
        checkAdmin(session.user.email)
      } else {
        setIsAdmin(false)
      }
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
    <nav className="fixed top-0 left-0 right-0 z-50 h-14 glass border-b border-white/10 flex items-center px-4 md:px-8 gap-4">
      {/* Logo */}
      <Link href="/" className="mono text-sm font-semibold text-white tracking-wider mr-4 flex items-center gap-2">
        <span className="w-5 h-5 rounded bg-white/10 border border-white/20 flex items-center justify-center text-[10px]">◉</span>
        NO_SIGNAL
      </Link>

      {/* Links — desktop */}
      <div className="hidden md:flex items-center gap-1">
        {links.map(l => (
          <Link
            key={l.href}
            href={l.href}
            className={'px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ' +
              (path === l.href
                ? 'bg-white/10 text-white border border-white/15'
                : 'text-white/50 hover:text-white/80 hover:bg-white/5')}
          >
            {l.label}
          </Link>
        ))}
        {(isAdmin || isOwner(user?.email ?? '')) && (
          <Link
            href="/admin"
            className={'px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ' +
              (path === '/admin'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : 'text-amber-400/60 hover:text-amber-300 hover:bg-amber-500/10')}
          >
            Admin
          </Link>
        )}
      </div>

      <div className="flex-1" />

      {/* Auth */}
      {user ? (
        <div className="flex items-center gap-3">
          <span className="mono text-[10px] text-white/40 hidden sm:block truncate max-w-[160px]">
            {isOwner(user.email ?? '') ? (
              <span className="text-amber-400 font-semibold">[Owner] </span>
            ) : null}
            {user.email}
          </span>
          <button
            onClick={signOut}
            className="text-xs text-white/40 hover:text-white/70 transition-colors px-2 py-1"
          >
            Sign out
          </button>
        </div>
      ) : (
        <Link
          href="/auth/login"
          className="text-xs glass px-4 py-2 rounded-xl hover:bg-white/10 transition-all duration-200 text-white/70 hover:text-white"
        >
          Sign in
        </Link>
      )}

      {/* Mobile menu */}
      <button
        className="md:hidden text-white/50 hover:text-white transition-colors"
        onClick={() => setMenuOpen(o => !o)}
      >
        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" d="M3 6h18M3 12h18M3 18h18"/>
        </svg>
      </button>

      {menuOpen && (
        <div className="absolute top-14 left-0 right-0 glass border-b border-white/10 p-4 flex flex-col gap-1 md:hidden">
          {links.map(l => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setMenuOpen(false)}
              className={'px-3 py-2 rounded-lg text-sm ' +
                (path === l.href ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white')}
            >
              {l.label}
            </Link>
          ))}
          {(isAdmin || isOwner(user?.email ?? '')) && (
            <Link href="/admin" onClick={() => setMenuOpen(false)} className="px-3 py-2 rounded-lg text-sm text-amber-400/70 hover:text-amber-300">
              Admin Panel
            </Link>
          )}
        </div>
      )}
    </nav>
  )
}
