'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import { isOwner } from '@/lib/utils'
import Link from 'next/link'

interface Profile { id: string; email: string; display_name: string; role: string; created_at: string }

export default function RolesPage() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [targetEmail, setTargetEmail] = useState('')
  const [targetRole, setTargetRole] = useState<'user' | 'admin' | 'owner'>('admin')
  const [working, setWorking] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const sb = createClient()

  useEffect(() => {
    sb.auth.getUser().then(async ({ data }) => {
      const u = data.user
      setUser(u)
      if (!u || !isOwner(u.email ?? '')) { setLoading(false); return }
      const { data: p } = await sb.from('profiles').select('*').order('role').order('created_at')
      if (p) setProfiles(p)
      setLoading(false)
    })
  }, [])

  async function grantRole() {
    if (!targetEmail.trim()) return
    setWorking(true)
    setResult(null)
    const { data, error } = await sb.rpc('grant_role_by_email', {
      p_target_email: targetEmail.trim().toLowerCase(),
      p_target_role: targetRole,
    })
    if (error) {
      setResult({ ok: false, msg: error.message })
    } else if ((data as { error?: string })?.error) {
      setResult({ ok: false, msg: (data as { error: string }).error })
    } else {
      setResult({ ok: true, msg: `${targetEmail} is now ${targetRole}` })
      setTargetEmail('')
      // Refresh list
      const { data: p } = await sb.from('profiles').select('*').order('role').order('created_at')
      if (p) setProfiles(p)
    }
    setWorking(false)
  }

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center pt-14">
      <p className="mono text-xs text-zinc-600">Loading...</p>
    </div>
  )

  if (!user || !isOwner(user.email ?? '')) return (
    <div className="flex min-h-screen items-center justify-center pt-14">
      <div className="space-y-2 text-center">
        <p className="font-nacelle text-5xl font-semibold text-zinc-800">403</p>
        <p className="text-sm text-zinc-600">Owner access only.</p>
      </div>
    </div>
  )

  const byRole = {
    owner: profiles.filter(p => p.role === 'owner'),
    admin: profiles.filter(p => p.role === 'admin'),
    user: profiles.filter(p => p.role === 'user'),
  }

  return (
    <div className="mx-auto max-w-3xl px-6 pt-28 pb-20">
      <div className="mb-10">
        <div className="mb-3 flex items-center gap-2">
          <Link href="/admin" className="mono text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors">← Admin</Link>
          <span className="h-px w-4 bg-zinc-800" />
          <span className="mono text-[10px] tracking-[0.15em] text-zinc-600 uppercase">Owner Only</span>
        </div>
        <h1 className="font-nacelle text-3xl font-semibold text-zinc-100 tracking-tight">Role Manager</h1>
        <p className="mt-2 text-sm text-zinc-500">Grant or revoke admin and owner privileges by email.</p>
      </div>

      {/* Grant form */}
      <div className="glass-card rounded-2xl p-6 mb-8 space-y-4">
        <div className="mono text-[10px] tracking-[0.15em] text-zinc-600 uppercase">Grant Role</div>
        <div className="flex gap-2">
          <input
            type="email"
            placeholder="user@school.com"
            value={targetEmail}
            onChange={e => setTargetEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && grantRole()}
            className="flex h-10 flex-1 rounded-xl border border-white/[0.08] bg-zinc-900/60 px-4 text-sm text-zinc-200 placeholder:text-zinc-600 transition-all duration-200 focus:border-white/[0.18] focus:outline-none shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]"
          />
          <select
            value={targetRole}
            onChange={e => setTargetRole(e.target.value as 'user' | 'admin' | 'owner')}
            className="h-10 rounded-xl border border-white/[0.08] bg-zinc-900/60 px-3 text-sm text-zinc-300 focus:outline-none focus:border-white/[0.18] transition-all"
          >
            <option value="user">user</option>
            <option value="admin">admin</option>
            <option value="owner">owner</option>
          </select>
          <button
            onClick={grantRole}
            disabled={working || !targetEmail.trim()}
            className="flex h-10 items-center gap-2 rounded-xl bg-zinc-100 px-4 text-sm font-semibold text-zinc-950 transition-all duration-200 hover:bg-white active:scale-[0.98] disabled:opacity-40"
          >
            {working ? 'Applying...' : 'Apply'}
          </button>
        </div>

        {result && (
          <div className={`rounded-xl border px-4 py-3 text-xs ${
            result.ok
              ? 'border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-400'
              : 'border-rose-500/20 bg-rose-500/[0.07] text-rose-400'
          }`}>
            {result.msg}
          </div>
        )}
      </div>

      {/* Role groups */}
      {(['owner', 'admin', 'user'] as const).map(r => (
        <div key={r} className="mb-8">
          <div className="mb-4 flex items-center gap-3">
            <span className={`mono text-[10px] border rounded-full px-2 py-0.5 ${
              r === 'owner' ? 'border-amber-500/25 text-amber-400' :
              r === 'admin' ? 'border-zinc-600 text-zinc-400' :
              'border-zinc-800 text-zinc-700'
            }`}>{r}</span>
            <span className="mono text-[10px] text-zinc-700">{byRole[r].length}</span>
            <div className="h-px flex-1 bg-zinc-900" />
          </div>
          <div className="space-y-2">
            {byRole[r].map(p => (
              <div key={p.id} className="glass-card flex items-center gap-3 rounded-xl px-4 py-3">
                <div className="h-7 w-7 flex-shrink-0 flex items-center justify-center rounded-lg border border-white/[0.07] bg-zinc-800/60 text-[10px] font-semibold text-zinc-500">
                  {(p.display_name || p.email || 'A')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-200 truncate">{p.display_name || 'Unnamed'}</p>
                  <p className="mono text-[10px] text-zinc-600 truncate">{p.email}</p>
                </div>
                {r !== 'owner' && !isOwner(p.email) && (
                  <button
                    onClick={async () => {
                      await sb.rpc('grant_role_by_email', {
                        p_target_email: p.email,
                        p_target_role: r === 'admin' ? 'user' : 'admin',
                      })
                      const { data: np } = await sb.from('profiles').select('*').order('role').order('created_at')
                      if (np) setProfiles(np)
                    }}
                    className="mono text-[9px] text-zinc-600 hover:text-zinc-200 transition-colors"
                  >
                    → {r === 'admin' ? 'demote' : 'promote'}
                  </button>
                )}
              </div>
            ))}
            {byRole[r].length === 0 && (
              <p className="mono text-xs text-zinc-700 py-4 text-center">None</p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
