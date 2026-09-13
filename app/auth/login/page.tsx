'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const router = useRouter()
  const sb = createClient()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const err = params.get('error')
    if (err) setError(decodeURIComponent(err).replace(/_/g, ' '))
    sb.auth.getUser().then(({ data }) => {
      if (data.user) router.replace('/')
    })
  }, [])

  async function handleGoogle() {
    setGoogleLoading(true)
    setError('')
    try {
      const { error: err } = await sb.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: { access_type: 'offline', prompt: 'consent' },
        },
      })
      if (err) throw err
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Google sign-in failed. Try again.'
      setError(msg)
      setGoogleLoading(false)
    }
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const trimmed = email.trim().toLowerCase()
    if (!trimmed) { setError('Enter an email address.'); setLoading(false); return }
    try {
      const { error: err } = await sb.auth.signInWithOtp({
        email: trimmed,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          shouldCreateUser: true,
        },
      })
      if (err) throw err
      setSent(true)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to send link. Check your email and try again.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 pt-16">
        <div className="w-full max-w-sm">
          <div className="rounded-2xl border border-t-white/[0.12] border-x-white/[0.06] border-b-white/[0.06] bg-zinc-900/60 backdrop-blur-xl p-8 text-center shadow-2xl shadow-black/60" style={{ boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.07), 0 25px 50px -12px rgba(0,0,0,0.6)' }}>
            <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.07]">
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" className="text-emerald-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"/>
              </svg>
            </div>
            <h2 className="mb-2 font-nacelle text-xl font-semibold text-zinc-100 tracking-tight">Check your inbox</h2>
            <p className="text-sm text-zinc-500 leading-relaxed">
              Link sent to<br />
              <span className="font-mono text-zinc-300 text-xs">{email}</span>
            </p>
            <div className="mt-5 border-t border-white/[0.06] pt-5 text-xs text-zinc-600">
              Click the link to sign in — no password needed.<br />Check spam if it doesn't arrive within 2 minutes.
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
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <span className="h-px w-4 bg-zinc-800" />
            <span className="font-mono text-[10px] tracking-[0.15em] text-zinc-600 uppercase">Platform Access</span>
          </div>
          <h1 className="font-nacelle text-3xl font-semibold text-zinc-100 tracking-tight">Sign in</h1>
          <p className="mt-2 text-sm text-zinc-500">Google or magic link — no password required.</p>
        </div>

        <div className="rounded-2xl border border-t-white/[0.12] border-x-white/[0.06] border-b-white/[0.06] bg-zinc-900/60 backdrop-blur-xl p-6 space-y-4 shadow-2xl shadow-black/60" style={{ boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.07), 0 25px 50px -12px rgba(0,0,0,0.6)' }}>
          {/* Google OAuth */}
          <button
            onClick={handleGoogle}
            disabled={googleLoading}
            className="flex h-10 w-full items-center justify-center gap-2.5 rounded-xl border border-white/[0.1] bg-white/[0.04] text-sm font-medium text-zinc-200 transition-all duration-150 ease-out hover:bg-white/[0.08] hover:border-white/[0.16] hover:shadow-[0_0_15px_rgba(255,255,255,0.05)] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.05)' }}
          >
            {googleLoading ? (
              <svg className="animate-spin w-4 h-4 text-zinc-400" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
            )}
            Continue with Google
          </button>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-zinc-800" />
            <span className="font-mono text-[10px] text-zinc-700">or</span>
            <div className="h-px flex-1 bg-zinc-800" />
          </div>

          {/* Magic link */}
          <form onSubmit={handleMagicLink} className="space-y-3">
            <div>
              <label htmlFor="email" className="mb-1.5 block font-mono text-[10px] tracking-widest text-zinc-600 uppercase">
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
                className="flex h-10 w-full rounded-xl border border-white/[0.08] bg-zinc-900/60 px-4 text-sm text-zinc-200 placeholder:text-zinc-600 transition-all duration-150 focus:border-white/[0.18] focus:outline-none focus:bg-zinc-900/80"
                style={{ boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.03)' }}
              />
            </div>

            {error && (
              <div className="rounded-xl border border-rose-500/25 bg-rose-500/[0.07] px-4 py-3 text-xs text-rose-400 leading-relaxed">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-zinc-100 text-sm font-semibold text-zinc-950 transition-all duration-150 ease-out hover:bg-white active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.3), inset 0 1px 0 0 rgba(255,255,255,0.15)' }}
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

        <p className="mt-5 text-center font-mono text-[10px] text-zinc-700">
          Authorized access only · Shift+Tab to dismiss
        </p>
      </div>
    </div>
  )
}
