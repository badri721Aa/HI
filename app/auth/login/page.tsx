'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import Link from 'next/link'

export default function LoginPage() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(false)
  const sb = createClient()

  function isSchoolEmail(e: string) {
    return e.endsWith('@alhekma.com') || e.endsWith('@alhekma.edu') || e.endsWith('@abdullahmasoud063@gmail.com')
  }

  function isValidEmail(e: string) {
    // allow school emails and gmail for now, filter on server
    return e.includes('@') && e.includes('.')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setMsg('')
    setLoading(true)

    const trimmedEmail = email.trim().toLowerCase()

    if (mode === 'signup') {
      if (!name.trim()) { setError('Display name required'); setLoading(false); return }
      const { error: err } = await sb.auth.signUp({
        email: trimmedEmail,
        password,
        options: { data: { display_name: name.trim() }, emailRedirectTo: window.location.origin + '/auth/callback' }
      })
      if (err) { setError(err.message); setLoading(false); return }
      setMsg('Check your email to confirm your account.')
    } else {
      const { error: err } = await sb.auth.signInWithPassword({ email: trimmedEmail, password })
      if (err) { setError(err.message); setLoading(false); return }
      window.location.href = '/'
    }
    setLoading(false)
  }

  async function oauthSignIn(provider: 'google' | 'discord') {
    await sb.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin + '/auth/callback' }
    })
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 pt-20">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="mono text-xs tracking-widest text-white/30 mb-2">NO_SIGNAL</div>
          <h1 className="text-2xl font-light text-white">
            {mode === 'signin' ? 'Welcome back' : 'Create account'}
          </h1>
          <p className="text-xs text-white/30 mt-1">School email required for access</p>
        </div>

        {/* Card */}
        <div className="glass-hi rounded-2xl p-6 space-y-4">
          {/* OAuth */}
          <button
            onClick={() => oauthSignIn('google')}
            className="w-full flex items-center justify-center gap-3 h-10 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 transition-all duration-200 text-sm text-white/70 hover:text-white"
          >
            <svg width="16" height="16" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>

          <button
            onClick={() => oauthSignIn('discord')}
            className="w-full flex items-center justify-center gap-3 h-10 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 transition-all duration-200 text-sm text-white/70 hover:text-white"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#5865F2">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.033.053a19.977 19.977 0 0 0 6.063 3.024.078.078 0 0 0 .084-.026 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.201 13.201 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.073-3.024.078.078 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
            </svg>
            Continue with Discord
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-xs text-white/20">or</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === 'signup' && (
              <div className="space-y-1.5">
                <Label htmlFor="name">Display name</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Your name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  autoComplete="name"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="email">School email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@alhekma.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              />
            </div>

            {error && (
              <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                {error}
              </div>
            )}
            {msg && (
              <div className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2">
                {msg}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? '...' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </Button>
          </form>

          {/* Toggle */}
          <div className="text-center text-xs text-white/30">
            {mode === 'signin' ? (
              <>No account?{' '}
                <button onClick={() => setMode('signup')} className="text-white/60 hover:text-white underline underline-offset-2">
                  Sign up
                </button>
              </>
            ) : (
              <>Already have one?{' '}
                <button onClick={() => setMode('signin')} className="text-white/60 hover:text-white underline underline-offset-2">
                  Sign in
                </button>
              </>
            )}
          </div>
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
