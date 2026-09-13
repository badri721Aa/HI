'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function SetupPage() {
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(true)
  const router = useRouter()
  const sb = createClient()

  useEffect(() => {
    sb.auth.getUser().then(({ data }) => {
      if (!data.user) { router.replace('/auth/login'); return }
      const existing = data.user.user_metadata?.display_name
      if (existing) { router.replace('/'); return }
      setChecking(false)
    })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || trimmed.length < 2) { setError('Name must be at least 2 characters.'); return }
    setLoading(true)
    const { error: err } = await sb.auth.updateUser({ data: { display_name: trimmed } })
    if (err) { setError(err.message); setLoading(false); return }
    const { data: { user } } = await sb.auth.getUser()
    if (user) {
      await sb.from('profiles').upsert({
        id: user.id,
        email: user.email,
        display_name: trimmed,
      })
    }
    router.replace('/')
  }

  if (checking) return null

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <div className="mono text-[10px] tracking-[0.4em] text-white/20 uppercase mb-4">NO_SIGNAL</div>
          <h1 className="text-2xl font-light text-white mb-1">One last step</h1>
          <p className="text-xs text-white/30">Set your display name for chat</p>
        </div>

        <div className="glass rounded-2xl p-6 border border-white/8 space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="name" className="text-xs text-white/40 mono uppercase tracking-wider">Display Name</label>
              <input
                id="name"
                type="text"
                placeholder="e.g. anon47 or your name"
                value={name}
                onChange={e => setName(e.target.value)}
                autoFocus
                maxLength={24}
                className="w-full h-11 rounded-xl border border-white/12 bg-white/4 px-4 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/25 focus:bg-white/6 transition-all duration-200"
              />
              <p className="text-[10px] text-white/20">This shows in chat. Max 24 characters.</p>
            </div>

            {error && (
              <div className="text-xs text-red-400/90 bg-red-500/8 border border-red-500/20 rounded-xl px-3 py-2.5">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="w-full h-11 rounded-xl bg-white/8 border border-white/15 hover:bg-white/12 hover:border-white/25 transition-all duration-200 text-sm text-white font-medium disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {loading ? 'Saving...' : 'Enter →'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
