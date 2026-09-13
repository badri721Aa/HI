'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type Slot = { slot: number; email: string | null; updated_at: string }

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
    </svg>
  )
}

const SLOT_LABELS = ['Primary Owner', 'Secondary Owner', 'Third Owner']

export default function OwnersPage() {
  const [slots, setSlots] = useState<Slot[]>([])
  const [drafts, setDrafts] = useState<Record<number, string>>({})
  const [saving, setSaving] = useState<Record<number, boolean>>({})
  const [feedback, setFeedback] = useState<Record<number, { ok: boolean; msg: string }>>({})
  const [loading, setLoading] = useState(true)
  const [unauthorized, setUnauthorized] = useState(false)
  const router = useRouter()
  const sb = createClient()

  useEffect(() => {
    async function init() {
      const { data: { user } } = await sb.auth.getUser()
      if (!user) { router.replace('/auth/login'); return }

      const { data: profile } = await sb.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'owner') { setUnauthorized(true); setLoading(false); return }

      const { data } = await sb.from('owners').select('*').order('slot')
      if (data) {
        setSlots(data)
        const d: Record<number, string> = {}
        data.forEach((s: Slot) => { d[s.slot] = s.email ?? '' })
        setDrafts(d)
      }
      setLoading(false)
    }
    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function save(slot: number) {
    const email = drafts[slot]?.trim().toLowerCase() ?? ''
    setSaving(s => ({ ...s, [slot]: true }))
    setFeedback(f => ({ ...f, [slot]: { ok: false, msg: '' } }))

    const { error } = await sb.rpc('set_owner_email', { p_slot: slot, p_email: email })

    if (error) {
      setFeedback(f => ({ ...f, [slot]: { ok: false, msg: error.message } }))
    } else {
      setSlots(prev => prev.map(s => s.slot === slot ? { ...s, email: email || null } : s))
      setFeedback(f => ({ ...f, [slot]: { ok: true, msg: email ? 'Saved — owner role assigned.' : 'Slot cleared.' } }))
      setTimeout(() => setFeedback(f => ({ ...f, [slot]: { ok: false, msg: '' } })), 3000)
    }
    setSaving(s => ({ ...s, [slot]: false }))
  }

  function clear(slot: number) {
    setDrafts(d => ({ ...d, [slot]: '' }))
  }

  const cardStyle = {
    background: 'rgba(9,9,11,0.6)',
    backdropFilter: 'blur(20px)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderTopColor: 'rgba(255,255,255,0.11)',
    boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.05), 0 8px 32px -8px rgba(0,0,0,0.5)',
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    )
  }

  if (unauthorized) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="text-center space-y-3">
          <div className="text-4xl">🔒</div>
          <h1 className="font-nacelle text-xl font-semibold text-zinc-100">Owner access only</h1>
          <p className="text-sm text-zinc-500">Only platform owners can manage this page.</p>
          <button onClick={() => router.push('/admin')}
            className="mt-4 text-xs text-zinc-600 hover:text-zinc-400 transition-colors font-mono">
            ← Back to admin
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen pt-24 pb-16 px-4">
      {/* Background */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_at_center,transparent_20%,black_80%)]" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-[radial-gradient(ellipse,rgba(251,191,36,0.05)_0%,transparent_70%)]" />
      </div>

      <div className="relative mx-auto max-w-xl space-y-8">
        {/* Header */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-amber-400 uppercase tracking-widest">Owner Management</span>
          </div>
          <h1 className="font-nacelle text-2xl font-semibold text-zinc-100 tracking-tight">Owner Slots</h1>
          <p className="text-sm text-zinc-500 leading-relaxed">
            Up to 3 owner emails. Any account signed in with a listed email automatically gets the Owner role.
            Clearing a slot revokes owner access immediately.
          </p>
        </div>

        {/* Warning banner */}
        <div
          className="flex items-start gap-3 rounded-xl px-4 py-3"
          style={{ background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.15)' }}
        >
          <span className="text-amber-400 mt-0.5 flex-shrink-0">⚠</span>
          <p className="text-xs text-amber-400/80 leading-relaxed">
            Owners have full platform control. Only assign to people you fully trust.
            You cannot remove yourself unless another owner slot is active.
          </p>
        </div>

        {/* 3 Slots */}
        <div className="space-y-4">
          {[1, 2, 3].map(slot => {
            const current = slots.find(s => s.slot === slot)
            const draft = drafts[slot] ?? ''
            const isBusy = saving[slot]
            const fb = feedback[slot]
            const isDirty = draft !== (current?.email ?? '')

            return (
              <div key={slot} className="rounded-2xl overflow-hidden" style={cardStyle}>
                {/* Slot header */}
                <div className="flex items-center justify-between border-b border-white/[0.05] px-5 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className={`flex h-6 w-6 items-center justify-center rounded-lg text-xs font-mono font-semibold ${
                      current?.email ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-zinc-800 text-zinc-600 border border-white/[0.05]'
                    }`}>
                      {slot}
                    </div>
                    <span className="text-xs font-medium text-zinc-400">{SLOT_LABELS[slot - 1]}</span>
                  </div>
                  {current?.email && (
                    <span className="rounded-full border border-amber-500/20 bg-amber-500/[0.07] px-2 py-0.5 text-[10px] font-mono text-amber-400 uppercase tracking-wide">
                      Active
                    </span>
                  )}
                  {!current?.email && (
                    <span className="rounded-full border border-zinc-800 bg-zinc-900/40 px-2 py-0.5 text-[10px] font-mono text-zinc-600 uppercase tracking-wide">
                      Empty
                    </span>
                  )}
                </div>

                {/* Email input */}
                <div className="px-5 py-4 space-y-3">
                  <div className="relative flex items-center gap-2">
                    <input
                      type="email"
                      value={draft}
                      onChange={e => setDrafts(d => ({ ...d, [slot]: e.target.value }))}
                      placeholder="email@example.com"
                      className="flex-1 h-10 rounded-xl px-4 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none transition-all"
                      style={{
                        background: 'rgba(9,9,11,0.5)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.03)',
                      }}
                      onFocus={e => (e.currentTarget.style.borderColor = 'rgba(251,191,36,0.35)')}
                      onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')}
                      onKeyDown={e => e.key === 'Enter' && isDirty && save(slot)}
                    />
                    {draft && (
                      <button
                        type="button"
                        onClick={() => clear(slot)}
                        className="flex-shrink-0 h-10 w-10 flex items-center justify-center rounded-xl text-zinc-600 hover:text-zinc-400 transition-colors"
                        style={{ border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}
                        title="Clear slot"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => save(slot)}
                      disabled={isBusy || !isDirty}
                      className="flex h-9 items-center justify-center gap-2 rounded-xl px-4 text-xs font-semibold transition-all duration-150 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{
                        background: isDirty && !isBusy ? 'rgba(251,191,36,0.12)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${isDirty && !isBusy ? 'rgba(251,191,36,0.3)' : 'rgba(255,255,255,0.06)'}`,
                        color: isDirty && !isBusy ? '#fbbf24' : '#71717a',
                      }}
                    >
                      {isBusy ? <><Spinner /> Saving…</> : 'Save slot'}
                    </button>

                    {fb?.msg && (
                      <span className={`text-xs font-mono ${fb.ok ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {fb.ok ? '✓' : '✗'} {fb.msg}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer note */}
        <p className="text-center text-[11px] font-mono text-zinc-700 leading-relaxed">
          Changes take effect immediately · Existing sessions update on next page load<br/>
          Role is assigned automatically when the matching email signs in
        </p>
      </div>
    </div>
  )
}
