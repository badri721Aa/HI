'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const sb = createClient()

  useEffect(() => {
    sb.auth.getUser().then(({ data }) => {
      if (data.user) router.replace('/')
    })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const trimmed = email.trim().toLowerCase()
    const { error: err } = await sb.auth.signInWithOtp({
      email: trimmed,
      options: {
        emailRedirectTo: window.location.origin + '/auth/callback',
        shouldCreateUser: true,
      },
    })
    if (err) { setError(err.message); setLoading(false); return }
    setSent(true)
    setLoading(false)
  }

  if (sent) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 pt-16">
        <div className="w-full max-w-sm animate-[fade-in_0.3s_ease-out]">
          <div className="glass-card rounded-2xl p-8 text-center">
            <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.07]">
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" className="text-emerald-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"/>
              </svg>
            </div>
            <h2 className="mb-2 font-nacelle text-xl font-semibold text-zinc-100 tracking-tight">Check your inbox</h2>
            <p className="text-sm text-zinc-500 leading-relaxed">
              Link sent to<br />
              <span className="mono text-zinc-300 text-xs">{email}</span>
            </p>
            <div className="mt-5 border-t border-white/[0.06] pt-5 text-xs text-zinc-600">
              Click the link to sign in. No password required.<br />Check spam if it doesn't arrive.
            </div>
          </div>
          <button
            onClick={() => { setSent(false); setEmail('') }}
            className="mt-4 w-full text-center text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            ← Use a different email
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 pt-16">
      <div className="w-full max-w-sm animate-[fade-in_0.3s_ease-out]">
        {/* Header */}
        <div className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <span className="h-px w-4 bg-zinc-800" />
            <span className="mono text-[10px] tracking-[0.15em] text-zinc-600 uppercase">Alhekma Cheating</span>
          </div>
          <h1 className="font-nacelle text-3xl font-semibold text-zinc-100 tracking-tight">Sign in</h1>
          <p className="mt-2 text-sm text-zinc-500">Enter your email — we'll send a magic link. No password.</p>
        </div>

        {/* Card */}
        <div className="glass-card rounded-2xl p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-2 block mono text-[10px] tracking-widest text-zinc-600 uppercase">
                Email
              </label>
              <input
                id="email"
                type="email"
                placeholder="you@school.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
                autoFocus
                required
                className="flex h-10 w-full rounded-xl border border-white/[0.08] bg-zinc-900/60 px-4 text-sm text-zinc-200 placeholder:text-zinc-600 transition-all duration-200 focus:border-white/[0.18] focus:outline-none shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]"
              />
            </div>

            {error && (
              <div className="rounded-xl border border-rose-500/20 bg-rose-500/[0.07] px-4 py-3 text-xs text-rose-400">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-zinc-100 text-sm font-semibold text-zinc-950 transition-all duration-200 ease-out hover:bg-white active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_1px_2px_rgba(0,0,0,0.3)]"
            >
              {loading ? (
                <>
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Sending...
                </>
              ) : 'Send sign-in link'}
            </button>
          </form>
        </div>

        <p className="mt-5 text-center mono text-[10px] text-zinc-700">
          School access only · Shift+Tab to panic hide
        </p>
      </div>
    </div>
  )
}
