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
    <div className="flex min-h-screen items-center justify-center px-4 pt-20">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mb-6 inline-flex items-center gap-3 before:h-px before:w-8 before:bg-linear-to-r before:from-transparent before:to-indigo-200/50 after:h-px after:w-8 after:bg-linear-to-l after:from-transparent after:to-indigo-200/50">
            <span className="inline-flex bg-linear-to-r from-indigo-500 to-indigo-200 bg-clip-text text-transparent text-xs font-nacelle uppercase tracking-widest">
              One last step
            </span>
          </div>
          <h1 className="animate-[gradient_6s_linear_infinite] bg-[linear-gradient(to_right,var(--color-gray-200),var(--color-indigo-200),var(--color-gray-50),var(--color-indigo-300),var(--color-gray-200))] bg-[length:200%_auto] bg-clip-text font-nacelle text-3xl font-semibold text-transparent">
            Set your name
          </h1>
          <p className="mt-2 text-sm text-indigo-200/65">This shows in the live chat.</p>
        </div>

        <div className="relative rounded-2xl border border-gray-800 bg-gray-900/50 p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="name" className="mb-1.5 block text-xs font-nacelle uppercase tracking-wider text-gray-500">
                Display Name
              </label>
              <input
                id="name"
                type="text"
                placeholder="e.g. anon47 or your name"
                value={name}
                onChange={e => setName(e.target.value)}
                autoFocus
                maxLength={24}
                className="form-input w-full"
              />
              <p className="mt-1 text-[10px] text-gray-600">Max 24 characters.</p>
            </div>

            {error && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/8 px-3 py-2.5 text-xs text-red-400">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="btn w-full bg-linear-to-t from-indigo-600 to-indigo-500 bg-[length:100%_100%] bg-[bottom] text-white shadow-[inset_0px_1px_0px_0px_--theme(--color-white/.16)] hover:bg-[length:100%_150%] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? 'Saving...' : 'Enter →'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
