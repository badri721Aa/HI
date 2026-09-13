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
    <header className="z-30 mt-2 w-full md:mt-5 fixed top-0 left-0 right-0">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="relative flex h-14 items-center justify-between gap-3 rounded-2xl bg-gray-900/90 px-3 before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:border before:border-transparent before:[background:linear-gradient(to_right,var(--color-gray-800),var(--color-gray-700),var(--color-gray-800))_border-box] before:[mask-composite:exclude_!important] before:[mask:linear-gradient(white_0_0)_padding-box,_linear-gradient(white_0_0)] after:absolute after:inset-0 after:-z-10 after:backdrop-blur-xs">

          {/* Logo */}
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2">
              <span className="font-nacelle text-sm font-semibold text-gray-200 tracking-wide">
                Alhekma<span className="text-indigo-400"> Cheating</span>
              </span>
            </Link>
          </div>

          {/* Desktop nav links */}
          <nav className="hidden md:flex items-center gap-1">
            {links.map(l => (
              <Link
                key={l.href}
                href={l.href}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${
                  path === l.href
                    ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                }`}
              >
                {l.label}
              </Link>
            ))}
            {(isAdmin || isOwner(user?.email ?? '')) && (
              <Link
                href="/admin"
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${
                  path === '/admin'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'text-amber-400/60 hover:text-amber-300 hover:bg-amber-500/10'
                }`}
              >
                Admin
              </Link>
            )}
          </nav>

          {/* Auth */}
          <div className="flex items-center gap-3">
            {user ? (
              <>
                <span className="hidden sm:block font-nacelle text-[10px] text-gray-500 truncate max-w-[140px]">
                  {isOwner(user.email ?? '') && (
                    <span className="text-amber-400 font-semibold">[Owner] </span>
                  )}
                  {user.email}
                </span>
                <button
                  onClick={signOut}
                  className="btn-sm relative bg-linear-to-b from-gray-800 to-gray-800/60 bg-[length:100%_100%] bg-[bottom] py-[5px] text-gray-300 before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:border before:border-transparent before:[background:linear-gradient(to_right,var(--color-gray-800),var(--color-gray-700),var(--color-gray-800))_border-box] before:[mask-composite:exclude_!important] before:[mask:linear-gradient(white_0_0)_padding-box,_linear-gradient(white_0_0)] hover:bg-[length:100%_150%]"
                >
                  Sign out
                </button>
              </>
            ) : (
              <Link
                href="/auth/login"
                className="btn-sm bg-linear-to-t from-indigo-600 to-indigo-500 bg-[length:100%_100%] bg-[bottom] py-[5px] text-white shadow-[inset_0px_1px_0px_0px_--theme(--color-white/.16)] hover:bg-[length:100%_150%]"
              >
                Sign In
              </Link>
            )}

            {/* Mobile menu toggle */}
            <button
              className="md:hidden text-gray-400 hover:text-gray-200 transition-colors"
              onClick={() => setMenuOpen(o => !o)}
              aria-label="Menu"
            >
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" d="M3 6h18M3 12h18M3 18h18"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="mt-1 rounded-2xl bg-gray-900/95 border border-gray-800 p-4 flex flex-col gap-1 md:hidden backdrop-blur-sm">
            {links.map(l => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setMenuOpen(false)}
                className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                  path === l.href ? 'bg-indigo-500/20 text-indigo-300' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {l.label}
              </Link>
            ))}
            {(isAdmin || isOwner(user?.email ?? '')) && (
              <Link
                href="/admin"
                onClick={() => setMenuOpen(false)}
                className="px-3 py-2 rounded-lg text-sm text-amber-400/70 hover:text-amber-300"
              >
                Admin Panel
              </Link>
            )}
          </div>
        )}
      </div>
    </header>
  )
}
