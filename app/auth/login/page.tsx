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

    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }
    setSent(true)
    setLoading(false)
  }

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center space-y-6">
          <div className="mono text-[10px] tracking-[0.4em] text-white/20 uppercase">NO_SIGNAL</div>
          <div className="glass rounded-2xl p-8 border border-white/8 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto">
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" className="text-emerald-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"/>
              </svg>
            </div>
            <div>
              <h2 className="text-white font-light text-lg mb-1">Check your inbox</h2>
              <p className="text-xs text-white/40 leading-relaxed">
                Sign-in link sent to<br/>
                <span className="text-white/70 mono">{email}</span>
              </p>
            </div>
            <div className="pt-2 border-t border-white/8">
              <p className="text-[11px] text-white/25 leading-relaxed">
                Click the link in the email. No password needed.<br/>
                Check your spam folder if it doesn't arrive.
              </p>
            </div>
          </div>
          <button
            onClick={() => { setSent(false); setEmail('') }}
            className="text-xs text-white/20 hover:text-white/40 transition-colors"
          >
            ← Use a different email
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <div className="mono text-[10px] tracking-[0.4em] text-white/20 uppercase mb-4">NO_SIGNAL</div>
          <h1 className="text-2xl font-light text-white mb-1">Sign in</h1>
          <p className="text-xs text-white/30">Enter your email. We'll send a link — no password.</p>
        </div>

        <div className="glass rounded-2xl p-6 border border-white/8 space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-xs text-white/40 mono uppercase tracking-wider">Email</label>
              <input
                id="email"
                type="email"
                placeholder="you@school.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
                autoFocus
                required
                className="w-full h-11 rounded-xl border border-white/12 bg-white/4 px-4 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/25 focus:bg-white/6 transition-all duration-200"
              />
            </div>

            {error && (
              <div className="text-xs text-red-400/90 bg-red-500/8 border border-red-500/20 rounded-xl px-3 py-2.5">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="w-full h-11 rounded-xl bg-white/8 border border-white/15 hover:bg-white/12 hover:border-white/25 transition-all duration-200 text-sm text-white font-medium disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Sending...
                </span>
              ) : 'Send sign-in link'}
            </button>
          </form>
        </div>

        <p className="text-center text-[10px] text-white/15 leading-relaxed">
          School access only · Your session is private<br/>
          Shift+Tab to hide this page instantly
        </p>
      </div>
    </div>
  )
}
