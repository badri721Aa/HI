'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type Tab = 'signin' | 'signup' | 'magic'

// ═════════════════════════════════════════════════════════════════
// Password strength — 4-segment glass bar
// ═════════════════════════════════════════════════════════════════

function PasswordStrength({ password }: { password: string }) {
  if (!password) return null
  let score = 0
  if (password.length >= 8) score++
  if (password.length >= 12) score++
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++
  const capped = Math.min(4, score)

  const label = capped <= 1 ? 'Weak' : capped === 2 ? 'Fair' : capped === 3 ? 'Good' : 'Strong'
  const color = capped <= 1 ? '#F43F5E' : capped === 2 ? '#F59E0B' : capped === 3 ? '#A78BFA' : '#10B981'

  return (
    <div className="flex items-center gap-2 mt-2">
      <div className="flex-1 flex gap-1">
        {[0, 1, 2, 3].map(i => (
          <div
            key={i}
            className="h-1 flex-1 rounded-full transition-all duration-300"
            style={{
              background: i < capped ? color : 'rgba(255,255,255,0.05)',
              boxShadow: i < capped ? `0 0 6px ${color}66` : 'none',
            }}
          />
        ))}
      </div>
      <span className="text-[9px] font-mono uppercase tracking-widest w-10 text-right" style={{ color }}>
        {label}
      </span>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════
// Spinner
// ═════════════════════════════════════════════════════════════════

function Spinner({ size = 14 }: { size?: number }) {
  return (
    <svg className="animate-spin" width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
    </svg>
  )
}

// ═════════════════════════════════════════════════════════════════
// Floating-label input
// ═════════════════════════════════════════════════════════════════

interface FloatingInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  label: string
  value: string
  onChange: (val: string) => void
  rightSlot?: React.ReactNode
  error?: boolean
}

function FloatingInput({ label, value, onChange, rightSlot, error, type = 'text', ...props }: FloatingInputProps) {
  const [focused, setFocused] = useState(false)
  const active = focused || value.length > 0

  return (
    <div className="relative">
      <input
        {...props}
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="peer h-12 w-full rounded-xl px-3.5 pt-4 pb-1 text-sm text-zinc-100 placeholder-transparent outline-none transition-all duration-200"
        placeholder={label}
        style={{
          background: 'rgba(10,10,12,0.6)',
          border: `1px solid ${error ? 'rgba(244,63,94,0.5)' : focused ? 'rgba(139,92,246,0.45)' : 'rgba(255,255,255,0.08)'}`,
          boxShadow: focused
            ? `inset 0 1px 0 0 rgba(255,255,255,0.04), 0 0 0 3px ${error ? 'rgba(244,63,94,0.1)' : 'rgba(139,92,246,0.12)'}, 0 0 20px ${error ? 'rgba(244,63,94,0.08)' : 'rgba(139,92,246,0.08)'}`
            : 'inset 0 1px 0 0 rgba(255,255,255,0.03)',
          paddingRight: rightSlot ? '2.5rem' : undefined,
        }}
      />
      <label
        className="pointer-events-none absolute left-3.5 font-mono uppercase transition-all duration-200"
        style={{
          top: active ? '6px' : '50%',
          transform: active ? 'translateY(0)' : 'translateY(-50%)',
          fontSize: active ? '9px' : '13px',
          letterSpacing: active ? '0.15em' : '0',
          color: active ? (error ? '#FDA4AF' : focused ? '#C4B5FD' : '#71717a') : '#52525b',
          fontWeight: active ? 500 : 400,
          textTransform: active ? 'uppercase' : 'none',
        }}
      >
        {label}
      </label>
      {rightSlot && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">{rightSlot}</div>
      )}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════
// Custom checkbox
// ═════════════════════════════════════════════════════════════════

function GlassCheckbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer group select-none">
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative flex h-4 w-4 items-center justify-center rounded transition-all duration-200 ${checked ? 'scale-100' : 'scale-100 hover:scale-105'}`}
        style={{
          background: checked ? 'linear-gradient(180deg, #A78BFA 0%, #8B5CF6 100%)' : 'rgba(10,10,12,0.6)',
          border: checked ? '1px solid rgba(167,139,250,0.5)' : '1px solid rgba(255,255,255,0.12)',
          boxShadow: checked
            ? 'inset 0 1px 0 0 rgba(255,255,255,0.25), 0 0 12px rgba(139,92,246,0.3)'
            : 'inset 0 1px 0 0 rgba(255,255,255,0.03)',
        }}
      >
        {checked && (
          <svg width="10" height="10" fill="none" stroke="white" strokeWidth="3" viewBox="0 0 12 12">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2 6l2.5 2.5L10 3"/>
          </svg>
        )}
      </button>
      <span className="text-xs text-zinc-400 group-hover:text-zinc-200 transition-colors">{label}</span>
    </label>
  )
}

// ═════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═════════════════════════════════════════════════════════════════

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
  const [mounted, setMounted] = useState(false)
  const formRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const sb = createClient()

  useEffect(() => {
    setMounted(true)
    const params = new URLSearchParams(window.location.search)
    const err = params.get('error')
    if (err) setError(decodeURIComponent(err).replace(/_/g, ' '))
    sb.auth.getUser().then(({ data }) => {
      if (data.user) router.replace('/')
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Trigger shake animation when error changes
  useEffect(() => {
    if (!error || !formRef.current) return
    const el = formRef.current
    el.style.animation = 'none'
    void el.offsetWidth
    el.style.animation = 'form-shake 0.5s cubic-bezier(0.36, 0.07, 0.19, 0.97) both'
  }, [error])

  function resetState() { setError(''); setInfo(''); setNeedsConfirm(false); setLoading(false) }
  function switchTab(t: Tab) { setTab(t); resetState(); setSent(false) }

  async function handleGoogle() {
    setGoogleLoading(true); setError('')
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
    e.preventDefault(); resetState(); setLoading(true)
    const trimmedEmail = email.trim().toLowerCase()
    if (!trimmedEmail || !password) { setError('Email and password are required.'); setLoading(false); return }
    try {
      const { error: err } = await sb.auth.signInWithPassword({ email: trimmedEmail, password })
      if (err) {
        const msg = err.message.toLowerCase()
        if (msg.includes('email not confirmed') || msg.includes('not confirmed')) {
          setNeedsConfirm(true)
          setError('Your email is not confirmed yet. Check your inbox or resend the confirmation link.')
        } else if (msg.includes('invalid login') || msg.includes('invalid credentials')) {
          setError('Wrong email or password.')
        } else setError(err.message)
        return
      }
      router.replace('/')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign in failed.')
    } finally { setLoading(false) }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault(); resetState()
    const trimmedEmail = email.trim().toLowerCase()
    if (!trimmedEmail || !password) { setError('Email and password required.'); return }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    setLoading(true)
    try {
      const { error: err } = await sb.auth.signUp({
        email: trimmedEmail, password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      })
      if (err) {
        if (err.message.toLowerCase().includes('already registered') || err.message.toLowerCase().includes('already exists')) {
          setError('An account with this email already exists. Try signing in.')
        } else setError(err.message)
        return
      }
      const { error: signInErr } = await sb.auth.signInWithPassword({ email: trimmedEmail, password })
      if (!signInErr) { router.replace('/'); return }
      setNeedsConfirm(true)
      setInfo(`We sent a confirmation link to ${trimmedEmail}. Click it to activate your account.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign up failed.')
    } finally { setLoading(false) }
  }

  async function handleResendConfirmation() {
    const trimmedEmail = email.trim().toLowerCase()
    if (!trimmedEmail) return
    setResendLoading(true)
    try {
      await sb.auth.resend({ type: 'signup', email: trimmedEmail })
      setInfo('Confirmation email resent. Check your inbox and spam folder.')
    } catch { setError('Failed to resend. Try the Magic Link tab instead.') }
    finally { setResendLoading(false) }
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault(); resetState()
    const trimmedEmail = email.trim().toLowerCase()
    if (!trimmedEmail) { setError('Enter an email address.'); return }
    setLoading(true)
    try {
      const { error: err } = await sb.auth.signInWithOtp({
        email: trimmedEmail,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback`, shouldCreateUser: true },
      })
      if (err) throw err
      setSent(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send link.')
    } finally { setLoading(false) }
  }

  // ─── Magic link sent screen ───
  if (sent) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black overflow-hidden">
        <div className="aurora" />
        <div className="relative w-full max-w-md px-4">
          <div
            className="rounded-3xl p-8 text-center"
            style={{
              background: 'rgba(8,8,10,0.85)',
              backdropFilter: 'blur(28px) saturate(180%)',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.08), 0 32px 80px rgba(0,0,0,0.7)',
            }}
          >
            <div
              className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl"
              style={{
                background: 'linear-gradient(180deg, rgba(16,185,129,0.2) 0%, rgba(16,185,129,0.08) 100%)',
                border: '1px solid rgba(16,185,129,0.35)',
                boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.1), 0 8px 24px rgba(16,185,129,0.2)',
              }}
            >
              <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="text-emerald-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"/>
              </svg>
            </div>
            <h2 className="mb-2 font-nacelle text-2xl font-semibold text-zinc-100 tracking-tight">Check your inbox</h2>
            <p className="text-sm text-zinc-500 leading-relaxed">
              Sign-in link sent to<br/>
              <span className="font-mono text-zinc-200 text-xs mt-1 inline-block">{email}</span>
            </p>
            <div className="mt-6 border-t border-white/[0.05] pt-5 text-xs text-zinc-600 leading-relaxed">
              Click the link — it signs you in instantly.<br/>Check spam if it doesn&apos;t arrive within 2 minutes.
            </div>
          </div>
          <button
            onClick={() => { setSent(false); setEmail('') }}
            className="mt-4 w-full text-center text-xs text-zinc-600 hover:text-zinc-300 transition-colors"
          >
            ← Use a different email
          </button>
        </div>
      </div>
    )
  }

  // ─── Main auth layout ───
  return (
    <>
      <style jsx global>{`
        @keyframes form-shake {
          10%, 90% { transform: translate3d(-1px, 0, 0); }
          20%, 80% { transform: translate3d(2px, 0, 0); }
          30%, 50%, 70% { transform: translate3d(-4px, 0, 0); }
          40%, 60% { transform: translate3d(4px, 0, 0); }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes form-shake { 0%, 100% { transform: none; } }
        }
      `}</style>

      <div className="fixed inset-0 flex flex-col lg:flex-row bg-black overflow-hidden">
        {/* ═══════════════════════════════════════════════════════ */}
        {/* LEFT — Form panel */}
        {/* ═══════════════════════════════════════════════════════ */}
        <div className="relative flex-1 flex items-center justify-center px-4 py-16 lg:py-8 lg:min-w-[480px] lg:max-w-[560px]">
          {/* Subtle aurora on left too */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute top-[20%] left-[30%] w-[400px] h-[400px] rounded-full opacity-30" style={{
              background: 'radial-gradient(circle, rgba(139,92,246,0.2) 0%, transparent 65%)',
              filter: 'blur(80px)',
            }} />
          </div>

          <div className="relative w-full max-w-sm" style={{ animation: mounted ? 'fade-in 0.5s ease-out' : 'none' }}>
            {/* Logo header */}
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-6">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-xl"
                  style={{
                    background: 'linear-gradient(180deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.03) 100%)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.15), 0 4px 12px rgba(0,0,0,0.4)',
                  }}
                >
                  <span className="font-nacelle font-bold text-sm text-zinc-100">AL</span>
                </div>
                <div>
                  <div className="font-nacelle text-base font-semibold text-zinc-100 leading-none">Alhekma</div>
                  <div className="mt-0.5 text-[9px] font-mono text-zinc-600 uppercase tracking-widest">Platform</div>
                </div>
              </div>

              <h1 className="font-nacelle text-3xl font-semibold text-zinc-100 tracking-tight leading-tight mb-1" style={{
                background: 'linear-gradient(180deg, #FAFAFA 0%, #A1A1AA 100%)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
              }}>
                {tab === 'signin' ? 'Welcome back' : tab === 'signup' ? 'Create account' : 'Sign in fast'}
              </h1>
              <p className="text-sm text-zinc-500">
                {tab === 'signin' ? 'Sign in to continue.' : tab === 'signup' ? 'Free forever, no strings.' : "We'll email you a one-tap link."}
              </p>
            </div>

            {/* Tabs */}
            <div className="mb-5 flex gap-1 rounded-xl p-1" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
              {(['signin', 'signup', 'magic'] as Tab[]).map(t => (
                <button
                  key={t}
                  onClick={() => switchTab(t)}
                  className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-all duration-200 ${
                    tab === t ? 'text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                  style={tab === t ? {
                    background: 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.04) 100%)',
                    boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.08), 0 2px 8px rgba(0,0,0,0.3)',
                  } : undefined}
                >
                  {t === 'signin' ? 'Sign in' : t === 'signup' ? 'Sign up' : 'Magic link'}
                </button>
              ))}
            </div>

            <div ref={formRef} className="space-y-4">
              {/* OAuth */}
              <button
                onClick={handleGoogle}
                disabled={googleLoading}
                className="group flex h-11 w-full items-center justify-center gap-2.5 rounded-xl text-sm font-medium text-zinc-100 transition-all duration-200 hover:brightness-125 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed relative overflow-hidden"
                style={{
                  background: 'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.08)',
                }}
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
                <div className="h-px flex-1 bg-gradient-to-r from-transparent to-white/[0.06]" />
                <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-700">or with email</span>
                <div className="h-px flex-1 bg-gradient-to-l from-transparent to-white/[0.06]" />
              </div>

              {/* ── SIGN IN ── */}
              {tab === 'signin' && (
                <form onSubmit={handleSignIn} className="space-y-3">
                  <FloatingInput
                    label="Email"
                    type="email"
                    value={email}
                    onChange={setEmail}
                    autoComplete="email"
                    autoFocus
                    required
                    error={!!error && error.toLowerCase().includes('email')}
                  />
                  <FloatingInput
                    label="Password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={setPassword}
                    autoComplete="current-password"
                    required
                    error={!!error && error.toLowerCase().includes('password')}
                    rightSlot={
                      <button type="button" onClick={() => setShowPassword(v => !v)}
                        className="text-zinc-600 hover:text-zinc-300 transition-colors"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}>
                        {showPassword
                          ? <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"/></svg>
                          : <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                        }
                      </button>
                    }
                  />

                  <div className="flex items-center justify-between pt-1">
                    <GlassCheckbox checked={rememberMe} onChange={setRememberMe} label="Remember me" />
                    <button type="button" onClick={() => switchTab('magic')}
                      className="text-[11px] text-zinc-500 hover:text-violet-300 transition-colors">
                      Forgot password?
                    </button>
                  </div>

                  <ErrorBlock error={error} needsConfirm={needsConfirm} resendLoading={resendLoading} onResend={handleResendConfirmation} />
                  <InfoBlock info={info} />

                  <ShinyCTA loading={loading} disabled={!email.trim() || !password}>
                    {loading ? 'Signing in…' : 'Sign in'}
                  </ShinyCTA>
                </form>
              )}

              {/* ── SIGN UP ── */}
              {tab === 'signup' && (
                <form onSubmit={handleSignUp} className="space-y-3">
                  <FloatingInput
                    label="Email"
                    type="email"
                    value={email}
                    onChange={setEmail}
                    autoComplete="email"
                    autoFocus
                    required
                  />
                  <div>
                    <FloatingInput
                      label="Password"
                      type="password"
                      value={password}
                      onChange={setPassword}
                      autoComplete="new-password"
                      required
                    />
                    <PasswordStrength password={password} />
                  </div>
                  <FloatingInput
                    label="Confirm password"
                    type="password"
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    autoComplete="new-password"
                    required
                    error={!!confirmPassword && password !== confirmPassword}
                  />

                  <ErrorBlock error={error} needsConfirm={needsConfirm} resendLoading={resendLoading} onResend={handleResendConfirmation} />
                  <InfoBlock info={info} onResend={needsConfirm ? handleResendConfirmation : undefined} resendLoading={resendLoading} />

                  <ShinyCTA loading={loading} disabled={!email.trim() || !password || !!info}>
                    {loading ? 'Creating account…' : 'Create account'}
                  </ShinyCTA>
                </form>
              )}

              {/* ── MAGIC LINK ── */}
              {tab === 'magic' && (
                <form onSubmit={handleMagicLink} className="space-y-3">
                  <FloatingInput
                    label="Email"
                    type="email"
                    value={email}
                    onChange={setEmail}
                    autoComplete="email"
                    autoFocus
                    required
                  />
                  <p className="text-xs text-zinc-500 leading-relaxed pl-1">
                    Works for new & existing accounts. One-click link, no password.
                  </p>

                  <ErrorBlock error={error} needsConfirm={false} resendLoading={false} onResend={() => {}} />

                  <ShinyCTA loading={loading} disabled={!email.trim()}>
                    {loading ? 'Sending link…' : 'Send sign-in link'}
                  </ShinyCTA>
                </form>
              )}
            </div>

            {/* Security badge */}
            <div className="mt-6 flex items-center justify-center gap-2 text-[9px] font-mono text-zinc-700 uppercase tracking-widest">
              <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" className="text-emerald-500/60">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z"/>
              </svg>
              TLS 1.3 · 256-bit encryption
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* RIGHT — Showcase panel (hidden on mobile) */}
        {/* ═══════════════════════════════════════════════════════ */}
        <div className="hidden lg:flex relative flex-1 overflow-hidden" style={{
          background: 'linear-gradient(135deg, rgba(8,8,10,1) 0%, rgba(15,10,25,1) 100%)',
          borderLeft: '1px solid rgba(255,255,255,0.05)',
        }}>
          {/* Aurora */}
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute top-[5%] left-[10%] w-[600px] h-[600px] rounded-full" style={{
              background: 'radial-gradient(circle, rgba(139,92,246,0.35) 0%, transparent 65%)',
              filter: 'blur(80px)',
              animation: 'aurora-drift-1 22s ease-in-out infinite',
            }} />
            <div className="absolute bottom-[10%] right-[10%] w-[500px] h-[500px] rounded-full" style={{
              background: 'radial-gradient(circle, rgba(59,130,246,0.28) 0%, transparent 65%)',
              filter: 'blur(80px)',
              animation: 'aurora-drift-2 26s ease-in-out infinite',
            }} />
            <div className="absolute inset-0 hero-grid" />
          </div>

          <div className="relative flex flex-col justify-between p-14 w-full">
            {/* Top: live badge */}
            <div className="flex items-center gap-2 rounded-full px-3 py-1 self-start" style={{
              background: 'rgba(139,92,246,0.08)',
              border: '1px solid rgba(139,92,246,0.22)',
              boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.04)',
            }}>
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" style={{ animation: 'pulse-slow 2s ease-in-out infinite' }} />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" style={{ boxShadow: '0 0 6px rgba(16,185,129,0.8)' }} />
              </span>
              <span className="font-mono text-[10px] text-violet-300 uppercase tracking-[0.2em]">System live · v3</span>
            </div>

            {/* Middle: hero */}
            <div className="max-w-md">
              <h2 className="font-nacelle text-5xl font-semibold tracking-tight leading-[1.05] mb-4" style={{
                background: 'linear-gradient(180deg, #FAFAFA 0%, #A1A1AA 100%)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
                textWrap: 'balance',
              }}>
                Everything one login.<br/>Every module free.
              </h2>
              <p className="text-sm text-zinc-500 leading-relaxed max-w-xs mb-8">
                Real-time chat, video calls, unblocked browsing, AI writing, and 600+ study tools — all yours the second you sign in.
              </p>

              {/* Feature tiles */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { icon: '💬', label: 'Live chat', desc: 'P2P video' },
                  { icon: '🌐', label: 'Proxy', desc: 'Unblocked' },
                  { icon: '🤖', label: 'AI writer', desc: 'Streaming' },
                  { icon: '🎮', label: 'Arcade', desc: '20+ games' },
                ].map(f => (
                  <div key={f.label} className="rounded-xl p-3 flex items-center gap-3" style={{
                    background: 'rgba(10,10,12,0.5)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.04)',
                  }}>
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg text-sm flex-shrink-0" style={{
                      background: 'rgba(139,92,246,0.1)',
                      border: '1px solid rgba(139,92,246,0.2)',
                    }}>
                      {f.icon}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs text-zinc-200 font-medium leading-tight">{f.label}</div>
                      <div className="text-[10px] text-zinc-600 font-mono">{f.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom: stats + footer */}
            <div>
              <div className="flex items-center gap-6 mb-4">
                {[
                  { v: '20+', l: 'Games' },
                  { v: '600+', l: 'Tricks' },
                  { v: 'P2P', l: 'Video' },
                  { v: '∞', l: 'Sites' },
                ].map(s => (
                  <div key={s.l}>
                    <div className="font-nacelle text-xl font-semibold text-zinc-100 tabular-nums leading-none">{s.v}</div>
                    <div className="mt-1 font-mono text-[9px] text-zinc-600 uppercase tracking-widest">{s.l}</div>
                  </div>
                ))}
              </div>
              <p className="text-[10px] font-mono text-zinc-700 uppercase tracking-widest">© Alhekma · No ads · No tracking</p>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

// ═════════════════════════════════════════════════════════════════
// Shared components
// ═════════════════════════════════════════════════════════════════

function ShinyCTA({ children, loading, disabled }: { children: React.ReactNode; loading?: boolean; disabled?: boolean }) {
  return (
    <button
      type="submit"
      disabled={loading || disabled}
      className="group relative flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-zinc-950 transition-all duration-200 hover:brightness-105 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:brightness-100 overflow-hidden"
      style={{
        background: 'linear-gradient(180deg, #FAFAFA 0%, #D4D4D8 100%)',
        boxShadow: '0 0 0 1px rgba(255,255,255,0.15), 0 8px 24px rgba(0,0,0,0.5), inset 0 1px 0 0 rgba(255,255,255,0.4)',
      }}
    >
      {/* Specular sweep */}
      <span
        className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{
          background: 'linear-gradient(125deg, transparent 40%, rgba(255,255,255,0.4) 50%, transparent 60%)',
          transform: 'translateX(-100%)',
          animation: 'shimmer 2s ease-in-out infinite',
        }}
      />
      <span className="relative flex items-center gap-2">
        {loading && <Spinner />}
        {children}
      </span>
    </button>
  )
}

function ErrorBlock({ error, needsConfirm, resendLoading, onResend }: {
  error: string; needsConfirm: boolean; resendLoading: boolean; onResend: () => void
}) {
  if (!error) return null
  return (
    <div
      className="rounded-xl px-3.5 py-3 text-xs space-y-2"
      style={{
        background: 'rgba(244,63,94,0.06)',
        border: '1px solid rgba(244,63,94,0.25)',
        boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.03)',
      }}
    >
      <div className="flex items-start gap-2 text-rose-300">
        <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="flex-shrink-0 mt-0.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
        </svg>
        <span className="leading-snug">{error}</span>
      </div>
      {needsConfirm && (
        <button type="button" onClick={onResend} disabled={resendLoading}
          className="flex items-center gap-1.5 text-rose-200 hover:text-rose-100 transition-colors font-medium disabled:opacity-50 pl-5">
          {resendLoading ? <><Spinner size={11} /> Sending…</> : '↺ Resend confirmation email'}
        </button>
      )}
    </div>
  )
}

function InfoBlock({ info, onResend, resendLoading }: {
  info: string; onResend?: () => void; resendLoading?: boolean
}) {
  if (!info) return null
  return (
    <div
      className="rounded-xl px-3.5 py-3 text-xs space-y-2"
      style={{
        background: 'rgba(139,92,246,0.07)',
        border: '1px solid rgba(139,92,246,0.25)',
        boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.03)',
      }}
    >
      <div className="flex items-start gap-2 text-violet-300">
        <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="flex-shrink-0 mt-0.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <span className="leading-snug">{info}</span>
      </div>
      {onResend && (
        <button type="button" onClick={onResend} disabled={resendLoading}
          className="flex items-center gap-1.5 text-violet-200 hover:text-violet-100 transition-colors font-medium disabled:opacity-50 pl-5">
          {resendLoading ? <><Spinner size={11} /> Sending…</> : '↺ Resend confirmation email'}
        </button>
      )}
    </div>
  )
}
