'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
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
      <div className="flex min-h-screen items-center justify-center px-4 pt-20">
        <div className="w-full max-w-sm text-center">
          <div className="mb-6 inline-flex items-center gap-3 before:h-px before:w-8 before:bg-linear-to-r before:from-transparent before:to-indigo-200/50 after:h-px after:w-8 after:bg-linear-to-l after:from-transparent after:to-indigo-200/50">
            <span className="inline-flex bg-linear-to-r from-indigo-500 to-indigo-200 bg-clip-text text-transparent text-xs font-nacelle uppercase tracking-widest">
              Alhekma Cheating
            </span>
          </div>

          <div className="relative rounded-2xl border border-gray-800 bg-gray-900/50 p-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10">
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" className="text-emerald-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"/>
              </svg>
            </div>
            <h2 className="mb-2 font-nacelle text-xl font-semibold text-gray-200">Check your inbox</h2>
            <p className="text-sm text-indigo-200/65">
              Sign-in link sent to<br />
              <span className="font-nacelle text-gray-300">{email}</span>
            </p>
            <p className="mt-4 border-t border-gray-800 pt-4 text-xs text-gray-600">
              Click the link in the email. No password needed.<br />
              Check spam if it doesn't arrive.
            </p>
          </div>

          <button
            onClick={() => { setSent(false); setEmail('') }}
            className="mt-6 text-xs text-gray-600 hover:text-gray-400 transition-colors"
          >
            ← Use a different email
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 pt-20">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mb-6 inline-flex items-center gap-3 before:h-px before:w-8 before:bg-linear-to-r before:from-transparent before:to-indigo-200/50 after:h-px after:w-8 after:bg-linear-to-l after:from-transparent after:to-indigo-200/50">
            <span className="inline-flex bg-linear-to-r from-indigo-500 to-indigo-200 bg-clip-text text-transparent text-xs font-nacelle uppercase tracking-widest">
              Alhekma Cheating
            </span>
          </div>
          <h1 className="animate-[gradient_6s_linear_infinite] bg-[linear-gradient(to_right,var(--color-gray-200),var(--color-indigo-200),var(--color-gray-50),var(--color-indigo-300),var(--color-gray-200))] bg-[length:200%_auto] bg-clip-text font-nacelle text-3xl font-semibold text-transparent">
            Sign in
          </h1>
          <p className="mt-2 text-sm text-indigo-200/65">Enter your email. We'll send a magic link — no password.</p>
        </div>

        {/* Form card */}
        <div className="relative rounded-2xl border border-gray-800 bg-gray-900/50 p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-xs font-nacelle uppercase tracking-wider text-gray-500">
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
                className="form-input w-full"
              />
            </div>

            {error && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/8 px-3 py-2.5 text-xs text-red-400">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="btn w-full bg-linear-to-t from-indigo-600 to-indigo-500 bg-[length:100%_100%] bg-[bottom] text-white shadow-[inset_0px_1px_0px_0px_--theme(--color-white/.16)] hover:bg-[length:100%_150%] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Sending...
                </span>
              ) : 'Send sign-in link →'}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-gray-700">
          School access only · Shift+Tab to panic hide
        </p>
      </div>
    </div>
  )
}
