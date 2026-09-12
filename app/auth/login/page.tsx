'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const sb = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const trimmed = email.trim().toLowerCase()
    if (!trimmed.includes('@')) {
      setError('Enter a valid email.')
      setLoading(false)
      return
    }
    const { error: err } = await sb.auth.signInWithOtp({
      email: trimmed,
      options: { emailRedirectTo: window.location.origin + '/auth/callback' },
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
      <div className="min-h-screen flex items-center justify-center p-6 pt-20">
        <div className="w-full max-w-sm text-center">
          <div className="mono text-[10px] tracking-widest text-white/20 uppercase mb-6">NO_SIGNAL</div>
          <div className="glass-hi rounded-2xl p-8">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto mb-4">
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" className="text-emerald-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"/>
              </svg>
            </div>
            <h2 className="text-lg font-light text-white mb-2">Check your email</h2>
            <p className="text-xs text-white/40 leading-relaxed mb-1">
              Link sent to
            </p>
            <p className="mono text-xs text-white/70 mb-6">{email}</p>
            <p className="text-xs text-white/30 leading-relaxed">
              Click the link in the email to sign in. No password needed.
            </p>
          </div>
          <button
            onClick={() => { setSent(false); setEmail('') }}
            className="mt-6 text-xs text-white/20 hover:text-white/40 transition-colors"
          >
            Use a different email
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 pt-20">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="mono text-[10px] tracking-widest text-white/20 uppercase mb-2">NO_SIGNAL</div>
          <h1 className="text-2xl font-light text-white">Sign in</h1>
          <p className="text-xs text-white/30 mt-1">We'll send a link — no password needed</p>
        </div>

        <div className="glass-hi rounded-2xl p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-xs text-white/50">Email</label>
              <input
                id="email"
                type="email"
                placeholder="you@alhekma.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
                autoFocus
                required
                className="w-full h-10 rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/30 focus:bg-white/8 transition-all duration-200"
              />
            </div>

            {error && (
              <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-10 rounded-xl bg-white/10 border border-white/20 hover:bg-white/15 hover:border-white/30 transition-all duration-200 text-sm text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? 'Sending...' : 'Send sign-in link'}
            </button>
          </form>
        </div>

        <div className="text-center mt-6">
          <Link href="/" className="text-xs text-white/20 hover:text-white/40 transition-colors">
            ← Back
          </Link>
        </div>
      </div>
    </div>
  )
}
