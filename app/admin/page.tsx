'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import { isOwner, canAdmin } from '@/lib/utils'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface Profile { id: string; email: string; display_name: string; created_at: string; role: string }
interface AuditLog { id: string; actor_email: string; action: string; target_email: string | null; payload: Record<string, unknown> | null; created_at: string }

export default function AdminPage() {
  const [user, setUser] = useState<User | null>(null)
  const [role, setRole] = useState('user')
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<Profile[]>([])
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [banTarget, setBanTarget] = useState('')
  const [broadcast, setBroadcast] = useState('')
  const [broadcastSent, setBroadcastSent] = useState(false)
  const [tab, setTab] = useState<'overview' | 'users' | 'broadcast' | 'ban' | 'logs'>('overview')
  const sb = createClient()

  useEffect(() => {
    sb.auth.getUser().then(async ({ data }) => {
      const u = data.user
      setUser(u)
      if (!u) { setLoading(false); return }
      const { data: p } = await sb.from('profiles').select('role').eq('id', u.id).single()
      const r = p?.role ?? 'user'
      setRole(r)
      if (canAdmin(r)) fetchData()
      setLoading(false)
    })
  }, [])

  async function fetchData() {
    const [{ data: u }, { data: l }] = await Promise.all([
      sb.from('profiles').select('*').order('created_at', { ascending: false }),
      sb.from('admin_audit_logs').select('*').order('created_at', { ascending: false }).limit(30),
    ])
    if (u) setUsers(u)
    if (l) setLogs(l)
  }

  async function banUser() {
    if (!banTarget.trim()) return
    await sb.from('banned_users').insert({ name: banTarget.trim().toLowerCase() })
    await sb.rpc('log_admin_action', { p_action: 'ban', p_target_email: banTarget.trim().toLowerCase(), p_payload: {} })
    setBanTarget('')
  }

  async function sendBroadcast() {
    if (!broadcast.trim()) return
    await sb.from('news').insert({ message: broadcast.trim(), pinned: true })
    await sb.rpc('log_admin_action', { p_action: 'broadcast', p_payload: { preview: broadcast.slice(0, 80) } })
    setBroadcast('')
    setBroadcastSent(true)
    setTimeout(() => setBroadcastSent(false), 3000)
  }

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center pt-14">
      <p className="mono text-xs text-zinc-600">Loading...</p>
    </div>
  )

  if (!user || !canAdmin(role)) return (
    <div className="flex min-h-screen items-center justify-center pt-14">
      <div className="space-y-2 text-center">
        <p className="font-nacelle text-5xl font-semibold text-zinc-800">403</p>
        <p className="text-sm text-zinc-600">Admins only.</p>
        {!user && <a href="/auth/login" className="block mt-3 text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Sign in →</a>}
      </div>
    </div>
  )

  const tabs: { id: typeof tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'users', label: 'Users' },
    { id: 'broadcast', label: 'Broadcast' },
    { id: 'ban', label: 'Ban' },
    { id: 'logs', label: 'Audit Log' },
  ]

  return (
    <div className="mx-auto max-w-5xl px-6 pt-28 pb-20">
      <div className="mb-10">
        <div className="mb-3 flex items-center gap-2">
          <span className="h-px w-4 bg-zinc-800" />
          <span className="mono text-[10px] tracking-[0.15em] text-zinc-600 uppercase">Control Panel</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="font-nacelle text-3xl font-semibold text-zinc-100 tracking-tight">Admin Panel</h1>
            <span className={`mono text-[10px] border rounded-full px-2 py-0.5 ${
              role === 'owner'
                ? 'border-amber-500/25 bg-amber-500/[0.08] text-amber-400'
                : 'border-zinc-700 bg-zinc-800/60 text-zinc-500'
            }`}>{role}</span>
          </div>
          {isOwner(user.email ?? '') && (
            <div className="flex items-center gap-2">
              <Link href="/admin/roles" className="flex h-9 items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.08] px-3 text-xs text-amber-400 hover:bg-amber-500/[0.14] transition-all duration-200 active:scale-[0.98]">
                Role Manager
              </Link>
              <Link href="/admin/troll-panel" className="flex h-9 items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/[0.07] px-3 text-xs text-rose-400 hover:bg-rose-500/[0.12] transition-all duration-200 active:scale-[0.98]">
                Troll Engine
              </Link>
              <Link href="/admin/devtools" className="flex h-9 items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 text-xs text-zinc-400 hover:bg-white/[0.07] hover:text-zinc-200 transition-all duration-200 active:scale-[0.98]">
                Dev Tools
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="mb-8 flex items-center gap-1 rounded-xl glass-card p-1 w-fit">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`rounded-lg px-4 py-1.5 text-xs font-medium transition-all duration-200 ease-out active:scale-[0.98] ${
              tab === t.id ? 'bg-zinc-700/60 border border-white/[0.1] text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >{t.label}</button>
        ))}
      </div>

      {/* Overview */}
      {tab === 'overview' && (
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { label: 'Users', value: users.length, color: 'zinc' },
            { label: 'Admins', value: users.filter(u => u.role === 'admin').length, color: 'amber' },
            { label: 'Audit entries', value: logs.length, color: 'emerald' },
          ].map(s => (
            <div key={s.label} className="glass-card rounded-2xl p-5">
              <p className="mono text-[10px] tracking-[0.15em] text-zinc-600 uppercase mb-2">{s.label}</p>
              <p className="font-nacelle text-4xl font-semibold text-zinc-100">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Users */}
      {tab === 'users' && (
        <div className="space-y-4">
          <p className="mono text-xs text-zinc-600">{users.length} registered users</p>
          <div className="space-y-2">
            {users.map(u => (
              <div key={u.id} className="glass-card flex items-center gap-3 rounded-xl px-4 py-3">
                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-white/[0.07] bg-zinc-800/60 text-[10px] font-semibold text-zinc-500">
                  {(u.display_name || u.email || 'A')[0].toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-zinc-200 truncate">{u.display_name || 'Unnamed'}</p>
                  <p className="mono text-[10px] text-zinc-600 truncate">{u.email}</p>
                </div>
                <span className={`mono text-[9px] border rounded-full px-1.5 py-0.5 ${
                  u.role === 'owner' ? 'border-amber-500/25 text-amber-400' :
                  u.role === 'admin' ? 'border-zinc-600 text-zinc-400' :
                  'border-zinc-800 text-zinc-700'
                }`}>{u.role}</span>
                <span className="mono text-[9px] text-zinc-700">{new Date(u.created_at).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Broadcast */}
      {tab === 'broadcast' && (
        <div className="glass-card rounded-2xl p-5 space-y-4">
          <div>
            <p className="text-sm font-semibold text-zinc-200 tracking-tight">Broadcast to everyone</p>
            <p className="mt-1 text-xs text-zinc-600">Posted as pinned news — visible in real-time</p>
          </div>
          <textarea
            className="w-full h-32 resize-none rounded-xl border border-white/[0.08] bg-zinc-900/60 px-4 py-3 text-sm text-zinc-200 placeholder:text-zinc-600 transition-all duration-200 focus:border-white/[0.18] focus:outline-none shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]"
            placeholder="Your message to everyone..."
            value={broadcast}
            onChange={e => setBroadcast(e.target.value)}
            maxLength={500}
          />
          <div className="flex items-center gap-3">
            <Button variant="gold" onClick={sendBroadcast} disabled={!broadcast.trim()}>Broadcast</Button>
            {broadcastSent && <span className="mono text-xs text-emerald-400">Sent!</span>}
          </div>
        </div>
      )}

      {/* Ban */}
      {tab === 'ban' && (
        <div className="glass-card rounded-2xl p-5 space-y-4">
          <p className="text-sm font-semibold text-zinc-200 tracking-tight">Ban a user by email</p>
          <div className="flex gap-2">
            <Input placeholder="user@school.com" value={banTarget} onChange={e => setBanTarget(e.target.value)} onKeyDown={e => e.key === 'Enter' && banUser()} />
            <Button variant="danger" onClick={banUser} className="flex-shrink-0">Ban</Button>
          </div>
          <p className="mono text-xs text-zinc-700">Banned users cannot send chat messages.</p>
        </div>
      )}

      {/* Audit logs */}
      {tab === 'logs' && (
        <div className="space-y-2">
          {logs.length === 0 && <p className="mono text-xs text-zinc-700 py-8 text-center">No entries yet.</p>}
          {logs.map(l => (
            <div key={l.id} className="glass-card rounded-xl px-4 py-3 flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="mono text-xs text-zinc-300 font-medium">{l.action}</span>
                  {l.target_email && <span className="mono text-[10px] text-zinc-600">→ {l.target_email}</span>}
                </div>
                <p className="mono text-[10px] text-zinc-700">{l.actor_email}</p>
              </div>
              <span className="mono text-[9px] text-zinc-700 flex-shrink-0">{new Date(l.created_at).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
