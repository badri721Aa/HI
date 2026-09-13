'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type Tab = 'signin' | 'signup' | 'magic'

function PasswordStrength({ password }: { password: string }) {
  if (!password) return null
  let score = 0
  if (password.length >= 8) score++
  if (password.length >= 12) score++
  if (/[A-Z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++

  const label = score <= 1 ? 'Weak' : score <= 3 ? 'Fair' : 'Strong'
  const color = score <= 1 ? 'bg-rose-500' : score <= 3 ? 'bg-amber-400' : 'bg-emerald-400'
  const width = `${Math.min(100, (score / 5) * 100)}%`

  return (
    <div className="space-y-1">
      <div className="h-0.5 w-full rounded-full bg-zinc-800 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-300 ${color}`} style={{ width }} />
      </div>
      <span className={`text-[10px] font-mono ${score <= 1 ? 'text-rose-500' : score <= 3 ? 'text-amber-400' : 'text-emerald-400'}`}>
        {label}
      </span>
    </div>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
    </svg>
  )
}

const inputStyle = {
  background: 'rgba(9,9,11,0.5)',
  border: '1px solid rgba(255,255,255,0.08)',
  boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.03)',
}
const inputClass = 'flex h-10 w-full rounded-xl px-4 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none transition-all duration-150'
function focusBorder(e: React.FocusEvent<HTMLInputElement>) { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.22)' }
function blurBorder(e: React.FocusEvent<HTMLInputElement>) { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }

export default function LoginPage() {
  const [tab, setTab] = useState<Tab>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(true)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [needsConfirm, setNeedsConfirm] = useState(false)
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [resendLoading, setResendLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const router = useRouter()
  const sb = createClient()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const err = params.get('error')
    if (err) setError(decodeURIComponent(err).replace(/_/g, ' '))
    sb.auth.getUser().then(({ data }) => {
      if (data.user) router.replace('/')
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function resetState() {
    setError('')
    setInfo('')
    setNeedsConfirm(false)
    setLoading(false)
  }

  function switchTab(t: Tab) {
    setTab(t)
    resetState()
    setSent(false)
  }

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
      setError(e instanceof Error ? e.message : 'Google sign-in failed.')
      setGoogleLoading(false)
    }
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    resetState()
    setLoading(true)
    const trimmedEmail = email.trim().toLowerCase()
    if (!trimmedEmail || !password) {
      setError('Email and password are required.')
      setLoading(false)
      return
    }
    try {
      const { error: err } = await sb.auth.signInWithPassword({ email: trimmedEmail, password })
      if (err) {
        const msg = err.message.toLowerCase()
        if (msg.includes('email not confirmed') || msg.includes('not confirmed')) {
          setNeedsConfirm(true)
          setError('Your email address is not confirmed yet. Check your inbox or resend the confirmation link.')
        } else if (msg.includes('invalid login') || msg.includes('invalid credentials')) {
          setError('Wrong email or password.')
        } else {
          setError(err.message)
        }
        return
      }
      router.replace('/')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign in failed.')
    } finally {
      setLoading(false)
    }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault()
    resetState()
    const trimmedEmail = email.trim().toLowerCase()
    if (!trimmedEmail || !password) { setError('Email and password required.'); return }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    setLoading(true)
    try {
      const { error: err } = await sb.auth.signUp({
        email: trimmedEmail,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      })
      if (err) {
        if (err.message.toLowerCase().includes('already registered') || err.message.toLowerCase().includes('already exists')) {
          setError('An account with this email already exists. Try signing in.')
        } else {
          setError(err.message)
        }
        return
      }

      // Try immediate sign-in (works when email confirmation is disabled)
      const { error: signInErr } = await sb.auth.signInWithPassword({ email: trimmedEmail, password })
      if (!signInErr) {
        router.replace('/')
        return
      }

      // Email confirmation required
      setNeedsConfirm(true)
      setInfo(`We sent a confirmation link to ${trimmedEmail}. Click it to activate your account, then come back to sign in.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign up failed.')
    } finally {
      setLoading(false)
    }
  }

  async function handleResendConfirmation() {
    const trimmedEmail = email.trim().toLowerCase()
    if (!trimmedEmail) return
    setResendLoading(true)
    try {
      await sb.auth.resend({ type: 'signup', email: trimmedEmail })
      setInfo('Confirmation email resent. Check your inbox (and spam folder).')
    } catch {
      setError('Failed to resend. Try the Magic Link tab instead.')
    } finally {
      setResendLoading(false)
    }
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault()
    resetState()
    const trimmedEmail = email.trim().toLowerCase()
    if (!trimmedEmail) { setError('Enter an email address.'); return }
    setLoading(true)
    try {
      const { error: err } = await sb.auth.signInWithOtp({
        email: trimmedEmail,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          shouldCreateUser: true,
        },
      })
      if (err) throw err
      setSent(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send link.')
    } finally {
      setLoading(false)
    }
  }

  // Magic link sent confirmation screen
  if (sent) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="pointer-events-none fixed inset-0">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_at_center,transparent_20%,black_80%)]" />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-[radial-gradient(ellipse,rgba(99,59,218,0.08)_0%,transparent_70%)]" />
        </div>
        <div className="relative w-full max-w-sm">
          <div
            className="rounded-2xl p-8 text-center"
            style={{
              background: 'rgba(9,9,11,0.72)',
              backdropFilter: 'blur(24px)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderTopColor: 'rgba(255,255,255,0.14)',
              boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.07), 0 32px 64px -16px rgba(0,0,0,0.7)',
            }}
          >
            <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.07]">
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" className="text-emerald-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"/>
              </svg>
            </div>
            <h2 className="mb-2 font-nacelle text-xl font-semibold text-zinc-100 tracking-tight">Check your inbox</h2>
            <p className="text-sm text-zinc-500 leading-relaxed">
              Sign-in link sent to<br/>
              <span className="font-mono text-zinc-300 text-xs">{email}</span>
            </p>
            <div className="mt-5 border-t border-white/[0.05] pt-5 text-xs text-zinc-600">
              Click the link in the email — it signs you in instantly.<br/>Check spam if it doesn&apos;t arrive within 2 minutes.
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
    <div className="flex min-h-screen items-center justify-center px-4 pb-12 pt-20">
      {/* Background */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_at_center,transparent_20%,black_80%)]" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[500px] bg-[radial-gradient(ellipse,rgba(99,59,218,0.07)_0%,transparent_70%)]" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[300px] bg-[radial-gradient(ellipse,rgba(59,130,246,0.04)_0%,transparent_70%)]" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div
            className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.1] bg-white/[0.04]"
            style={{ boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.07)' }}
          >
            <span className="font-nacelle font-semibold text-sm text-zinc-200">AL</span>
          </div>
          <h1 className="font-nacelle text-2xl font-semibold text-zinc-100 tracking-tight">Alhekma</h1>
          <p className="mt-1 text-xs text-zinc-600 font-mono tracking-widest uppercase">alhekmacheating.solar</p>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: 'rgba(9,9,11,0.72)',
            backdropFilter: 'blur(28px) saturate(1.6)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderTopColor: 'rgba(255,255,255,0.13)',
            boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.07), 0 40px 80px -20px rgba(0,0,0,0.8)',
          }}
        >
          {/* Tabs */}
          <div className="flex border-b border-white/[0.05] p-1.5 gap-1">
            {(['signin', 'signup', 'magic'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => switchTab(t)}
                className={`flex-1 rounded-lg py-2 text-xs font-medium transition-all duration-150 ${
                  tab === t ? 'bg-white/[0.07] text-zinc-200' : 'text-zinc-600 hover:text-zinc-400'
                }`}
                style={tab === t ? { boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.06)' } : {}}
              >
                {t === 'signin' ? 'Sign In' : t === 'signup' ? 'Sign Up' : 'Magic Link'}
              </button>
            ))}
          </div>

          <div className="p-5 space-y-4">
            {/* Google */}
            <button
              onClick={handleGoogle}
              disabled={googleLoading}
              className="flex h-10 w-full items-center justify-center gap-2.5 rounded-xl text-sm font-medium text-zinc-200 transition-all duration-150 hover:bg-white/[0.07] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ border: '1px solid rgba(255,255,255,0.09)', background: 'rgba(255,255,255,0.03)', boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.05)' }}
            >
              {googleLoading ? <Spinner /> : (
                <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden>
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
              )}
              Continue with Google
            </button>

            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-zinc-800/80" />
              <span className="font-mono text-[10px] text-zinc-700">or</span>
              <div className="h-px flex-1 bg-zinc-800/80" />
            </div>

            {/* ── SIGN IN ── */}
            {tab === 'signin' && (
              <form onSubmit={handleSignIn} className="space-y-3">
                <div>
                  <label className="mb-1.5 block font-mono text-[10px] tracking-widest text-zinc-600 uppercase">Email</label>
                  <input
                    type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com" autoComplete="email" autoFocus required
                    className={inputClass} style={inputStyle}
                    onFocus={focusBorder} onBlur={blurBorder}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block font-mono text-[10px] tracking-widest text-zinc-600 uppercase">Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'} value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••" autoComplete="current-password" required
                      className={`${inputClass} pr-10`} style={inputStyle}
                      onFocus={focusBorder} onBlur={blurBorder}
                    />
                    <button type="button" onClick={() => setShowPassword(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 transition-colors">
                      {showPassword
                        ? <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"/></svg>
                        : <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                      }
                    </button>
                  </div>
                </div>

                <label className="flex items-center gap-2.5 cursor-pointer group">
                  <div
                    onClick={() => setRememberMe(v => !v)}
                    className={`w-4 h-4 rounded flex items-center justify-center transition-all duration-150 border ${rememberMe ? 'bg-violet-500 border-violet-400' : 'bg-zinc-900 border-zinc-700'}`}
                  >
                    {rememberMe && (
                      <svg width="9" height="9" fill="none" stroke="white" strokeWidth="2.5" viewBox="0 0 12 12">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2 6l2.5 2.5L10 3"/>
                      </svg>
                    )}
                  </div>
                  <span className="text-xs text-zinc-500 group-hover:text-zinc-400 transition-colors select-none">Remember me</span>
                </label>

                {error && (
                  <div className="rounded-xl border border-rose-500/25 bg-rose-500/[0.07] px-4 py-3 text-xs text-rose-400 space-y-2">
                    <div>{error}</div>
                    {needsConfirm && (
                      <button type="button" onClick={handleResendConfirmation} disabled={resendLoading}
                        className="flex items-center gap-1.5 text-rose-300 hover:text-rose-200 transition-colors font-medium disabled:opacity-50">
                        {resendLoading ? <><Spinner /> Sending…</> : '↺ Resend confirmation email'}
                      </button>
                    )}
                  </div>
                )}
                {info && <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.07] px-4 py-3 text-xs text-emerald-400">{info}</div>}

                <button type="submit" disabled={loading || !email.trim() || !password}
                  className="flex h-10 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-zinc-950 transition-all duration-150 hover:bg-white active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: '#e4e4e7', boxShadow: '0 1px 2px rgba(0,0,0,0.3), inset 0 1px 0 0 rgba(255,255,255,0.2)' }}
                >
                  {loading ? <><Spinner /> Signing in…</> : 'Sign in'}
                </button>

                <div className="flex items-center justify-between">
                  <button type="button" onClick={() => switchTab('signup')}
                    className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors font-mono">
                    Create account →
                  </button>
                  <button type="button" onClick={() => switchTab('magic')}
                    className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors font-mono">
                    Magic link →
                  </button>
                </div>
              </form>
            )}

            {/* ── SIGN UP ── */}
            {tab === 'signup' && (
              <form onSubmit={handleSignUp} className="space-y-3">
                <div>
                  <label className="mb-1.5 block font-mono text-[10px] tracking-widest text-zinc-600 uppercase">Email</label>
                  <input
                    type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com" autoComplete="email" autoFocus required
                    className={inputClass} style={inputStyle}
                    onFocus={focusBorder} onBlur={blurBorder}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block font-mono text-[10px] tracking-widest text-zinc-600 uppercase">Password</label>
                  <input
                    type="password" value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="Min 8 characters" autoComplete="new-password" required
                    className={inputClass} style={inputStyle}
                    onFocus={focusBorder} onBlur={blurBorder}
                  />
                  <div className="mt-2"><PasswordStrength password={password} /></div>
                </div>
                <div>
                  <label className="mb-1.5 block font-mono text-[10px] tracking-widest text-zinc-600 uppercase">Confirm Password</label>
                  <input
                    type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="••••••••" autoComplete="new-password" required
                    className={inputClass} style={inputStyle}
                    onFocus={focusBorder} onBlur={blurBorder}
                  />
                </div>

                {error && (
                  <div className="rounded-xl border border-rose-500/25 bg-rose-500/[0.07] px-4 py-3 text-xs text-rose-400 space-y-2">
                    <div>{error}</div>
                    {needsConfirm && (
                      <button type="button" onClick={handleResendConfirmation} disabled={resendLoading}
                        className="flex items-center gap-1.5 text-rose-300 hover:text-rose-200 transition-colors font-medium disabled:opacity-50">
                        {resendLoading ? <><Spinner /> Sending…</> : '↺ Resend confirmation email'}
                      </button>
                    )}
                  </div>
                )}
                {info && (
                  <div className="rounded-xl border border-violet-500/25 bg-violet-500/[0.07] px-4 py-3 text-xs text-violet-300 space-y-2">
                    <div>{info}</div>
                    {needsConfirm && (
                      <button type="button" onClick={handleResendConfirmation} disabled={resendLoading}
                        className="flex items-center gap-1.5 text-violet-200 hover:text-white transition-colors font-medium disabled:opacity-50">
                        {resendLoading ? <><Spinner /> Sending…</> : '↺ Resend confirmation email'}
                      </button>
                    )}
                  </div>
                )}

                <button type="submit" disabled={loading || !email.trim() || !password || !!info}
                  className="flex h-10 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-zinc-950 transition-all duration-150 hover:bg-white active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: '#e4e4e7', boxShadow: '0 1px 2px rgba(0,0,0,0.3), inset 0 1px 0 0 rgba(255,255,255,0.2)' }}
                >
                  {loading ? <><Spinner /> Creating account…</> : 'Create account'}
                </button>

                <div className="text-center">
                  <button type="button" onClick={() => switchTab('signin')}
                    className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors font-mono">
                    Already have an account? Sign in →
                  </button>
                </div>
              </form>
            )}

            {/* ── MAGIC LINK ── */}
            {tab === 'magic' && (
              <form onSubmit={handleMagicLink} className="space-y-3">
                <div>
                  <label className="mb-1.5 block font-mono text-[10px] tracking-widest text-zinc-600 uppercase">Email</label>
                  <input
                    type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com" autoComplete="email" autoFocus required
                    className={inputClass} style={inputStyle}
                    onFocus={focusBorder} onBlur={blurBorder}
                  />
                </div>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  Works for both new and existing accounts — we&apos;ll email you a one-click sign-in link. No password needed.
                </p>

                {error && <div className="rounded-xl border border-rose-500/25 bg-rose-500/[0.07] px-4 py-3 text-xs text-rose-400">{error}</div>}

                <button type="submit" disabled={loading || !email.trim()}
                  className="flex h-10 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-zinc-950 transition-all duration-150 hover:bg-white active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: '#e4e4e7', boxShadow: '0 1px 2px rgba(0,0,0,0.3), inset 0 1px 0 0 rgba(255,255,255,0.2)' }}
                >
                  {loading ? <><Spinner /> Sending…</> : 'Send sign-in link'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
