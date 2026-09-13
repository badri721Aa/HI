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
      if (data.user.user_metadata?.display_name) { router.replace('/'); return }
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
      await sb.from('profiles').upsert({ id: user.id, email: user.email, display_name: trimmed })
    }
    router.replace('/')
  }

  if (checking) return null

  return (
    <div className="flex min-h-screen items-center justify-center px-4 pt-16">
      <div className="w-full max-w-sm animate-[fade-in_0.3s_ease-out]">
        <div className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <span className="h-px w-4 bg-zinc-800" />
            <span className="mono text-[10px] tracking-[0.15em] text-zinc-600 uppercase">One last step</span>
          </div>
          <h1 className="font-nacelle text-3xl font-semibold text-zinc-100 tracking-tight">Set your name</h1>
          <p className="mt-2 text-sm text-zinc-500">This is how you'll appear in the live chat.</p>
        </div>

        <div className="glass-card rounded-2xl p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="name" className="mb-2 block mono text-[10px] tracking-widest text-zinc-600 uppercase">
                Display Name
              </label>
              <input
                id="name"
                type="text"
                placeholder="e.g. anon47"
                value={name}
                onChange={e => setName(e.target.value)}
                autoFocus
                maxLength={24}
                className="flex h-10 w-full rounded-xl border border-white/[0.08] bg-zinc-900/60 px-4 text-sm text-zinc-200 placeholder:text-zinc-600 transition-all duration-200 focus:border-white/[0.18] focus:outline-none shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]"
              />
              <p className="mt-1.5 mono text-[10px] text-zinc-700">Max 24 characters. Shows in chat.</p>
            </div>

            {error && (
              <div className="rounded-xl border border-rose-500/20 bg-rose-500/[0.07] px-4 py-3 text-xs text-rose-400">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-zinc-100 text-sm font-semibold text-zinc-950 transition-all duration-200 ease-out hover:bg-white active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_1px_2px_rgba(0,0,0,0.3)]"
            >
              {loading ? 'Saving...' : 'Enter →'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
