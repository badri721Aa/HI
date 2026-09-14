'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import { isRootOwner } from '@/lib/utils'
import Link from 'next/link'

interface Profile { id: string; email: string; display_name: string; role: string; created_at: string }
interface BannedUser { id: string; name: string; reason?: string; created_at: string }
interface AuditLog { id: string; actor_email: string; action: string; target_email: string | null; payload: Record<string, unknown> | null; created_at: string }

type Tab = 'roles' | 'bans' | 'danger' | 'logs'

export default function OwnerSuitePage() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('bans')
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [bans, setBans] = useState<BannedUser[]>([])
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [roleTarget, setRoleTarget] = useState('')
  const [roleValue, setRoleValue] = useState<'user' | 'admin' | 'owner'>('user')
  const [banTarget, setBanTarget] = useState('')
  const [banReason, setBanReason] = useState('')
  const [unbanSearch, setUnbanSearch] = useState('')
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const sb = createClient()

  useEffect(() => {
    sb.auth.getUser().then(async ({ data }) => {
      const u = data.user
      setUser(u)
      if (!u || !isRootOwner(u.email)) { setLoading(false); return }
      await fetchAll()
      setLoading(false)
    })
  }, [])

  async function fetchAll() {
    const [{ data: p }, { data: b }, { data: l }] = await Promise.all([
      sb.from('profiles').select('*').order('created_at', { ascending: false }),
      sb.from('banned_users').select('*').order('created_at', { ascending: false }),
      sb.from('admin_audit_logs').select('*').order('created_at', { ascending: false }).limit(50),
    ])
    if (p) setProfiles(p)
    if (b) setBans(b)
    if (l) setLogs(l)
  }

  function flash(text: string, ok = true) {
    setMsg({ text, ok })
    setTimeout(() => setMsg(null), 3500)
  }

  async function grantRole() {
    if (!roleTarget.trim()) return
    const email = roleTarget.trim().toLowerCase()
    const { error } = await sb.rpc('grant_role_by_email', { p_email: email, p_role: roleValue })
    if (error) { flash(error.message, false); return }
    await sb.rpc('log_admin_action', { p_action: `grant_role_${roleValue}`, p_target_email: email, p_payload: {} })
    flash(`${email} → ${roleValue}`)
    setRoleTarget('')
    fetchAll()
  }

  async function banUser() {
    if (!banTarget.trim()) return
    const email = banTarget.trim().toLowerCase()
    if (email === 'abdulla.mjasim@alhekma.com') { flash('Cannot ban root owner.', false); return }
    const { error } = await sb.from('banned_users').insert({ name: email, reason: banReason.trim() || null })
    if (error) { flash(error.message, false); return }
    await sb.rpc('log_admin_action', { p_action: 'ban', p_target_email: email, p_payload: { reason: banReason } })
    flash(`Banned: ${email}`)
    setBanTarget('')
    setBanReason('')
    fetchAll()
  }

  async function unbanUser(nameOrEmail: string) {
    const { error } = await sb.from('banned_users').delete().eq('name', nameOrEmail.toLowerCase())
    if (error) { flash(error.message, false); return }
    await sb.rpc('log_admin_action', { p_action: 'unban', p_target_email: nameOrEmail, p_payload: {} })
    flash(`Unbanned: ${nameOrEmail}`)
    fetchAll()
  }

  async function unbanBySearch() {
    if (!unbanSearch.trim()) return
    await unbanUser(unbanSearch.trim().toLowerCase())
    setUnbanSearch('')
  }

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center pt-14">
      <p className="mono text-xs text-zinc-600">Loading…</p>
    </div>
  )

  if (!user || !isRootOwner(user.email)) return (
    <div className="flex min-h-screen items-center justify-center pt-14">
      <div className="space-y-2 text-center">
        <p className="font-nacelle text-5xl font-semibold text-zinc-800">403</p>
        <p className="text-sm text-zinc-600">Root owner only.</p>
        <Link href="/admin" className="block mt-3 text-xs text-zinc-500 hover:text-zinc-300 transition-colors">← Admin Panel</Link>
      </div>
    </div>
  )

  const tabDefs: { id: Tab; label: string; icon: string }[] = [
    { id: 'bans', label: 'Bans', icon: '🚫' },
    { id: 'roles', label: 'Roles', icon: '👑' },
    { id: 'logs', label: 'Audit', icon: '📋' },
    { id: 'danger', label: 'Danger', icon: '⚠️' },
  ]

  const filteredBans = unbanSearch.trim()
    ? bans.filter(b => b.name.includes(unbanSearch.toLowerCase()))
    : bans

  return (
    <div className="mx-auto max-w-5xl px-6 pt-28 pb-20">
      {/* Header */}
      <div className="mb-10">
        <div className="mb-3 flex items-center gap-2">
          <Link href="/admin" className="mono text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors">← Admin</Link>
          <span className="h-px w-4 bg-zinc-800" />
          <span className="mono text-[10px] tracking-[0.15em] text-amber-600/70 uppercase">Owner Suite</span>
        </div>
        <div className="flex items-center gap-3">
          <h1 className="font-nacelle text-3xl font-semibold text-zinc-100 tracking-tight">Owner Suite</h1>
          <span className="mono text-[10px] border border-amber-500/25 bg-amber-500/[0.08] text-amber-400 rounded-full px-2 py-0.5">👑 Root</span>
        </div>
        <p className="mt-2 text-sm text-zinc-500">
          {profiles.length} users · {bans.length} banned
        </p>
      </div>

      {/* Flash */}
      {msg && (
        <div className={`mb-6 rounded-xl px-4 py-3 mono text-xs ${msg.ok ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>
          {msg.ok ? '✓' : '✗'} {msg.text}
        </div>
      )}

      {/* Tabs */}
      <div className="mb-8 flex items-center gap-1 rounded-xl glass-card p-1 w-fit">
        {tabDefs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`rounded-lg px-4 py-1.5 text-xs font-medium transition-all duration-200 flex items-center gap-1.5 active:scale-[0.98] ${
              tab === t.id ? 'bg-zinc-700/60 border border-white/[0.1] text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <span className="text-[11px]">{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      {/* ── Bans Tab ── */}
      {tab === 'bans' && (
        <div className="space-y-6">
          {/* Ban a user */}
          <div className="glass-card rounded-2xl p-5 space-y-4">
            <div>
              <p className="text-sm font-semibold text-zinc-200 tracking-tight">Ban a user</p>
              <p className="mt-0.5 text-xs text-zinc-600">Prevents login and chat for the target account.</p>
            </div>
            <div className="flex gap-2">
              <input
                className="flex-1 h-9 rounded-xl border border-white/[0.08] bg-zinc-900/60 px-3 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-white/[0.18] focus:outline-none transition-all"
                placeholder="email@example.com"
                value={banTarget}
                onChange={e => setBanTarget(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && banUser()}
              />
              <button
                onClick={banUser}
                disabled={!banTarget.trim()}
                className="flex h-9 items-center px-4 rounded-xl border border-rose-500/20 bg-rose-500/[0.08] text-xs text-rose-400 hover:bg-rose-500/[0.14] transition-all active:scale-[0.98] disabled:opacity-40"
              >
                Ban
              </button>
            </div>
            <input
              className="w-full h-9 rounded-xl border border-white/[0.08] bg-zinc-900/60 px-3 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-white/[0.18] focus:outline-none transition-all"
              placeholder="Reason (optional)"
              value={banReason}
              onChange={e => setBanReason(e.target.value)}
            />
          </div>

          {/* Unban by search */}
          <div className="glass-card rounded-2xl p-5 space-y-4">
            <div>
              <p className="text-sm font-semibold text-zinc-200 tracking-tight">Unban by email</p>
              <p className="mt-0.5 text-xs text-zinc-600">Immediately restores access.</p>
            </div>
            <div className="flex gap-2">
              <input
                className="flex-1 h-9 rounded-xl border border-white/[0.08] bg-zinc-900/60 px-3 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-white/[0.18] focus:outline-none transition-all"
                placeholder="Search banned email…"
                value={unbanSearch}
                onChange={e => setUnbanSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && unbanBySearch()}
              />
              <button
                onClick={unbanBySearch}
                disabled={!unbanSearch.trim()}
                className="flex h-9 items-center px-4 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.08] text-xs text-emerald-400 hover:bg-emerald-500/[0.14] transition-all active:scale-[0.98] disabled:opacity-40"
              >
                Unban
              </button>
            </div>
          </div>

          {/* Banned users table */}
          <div className="glass-card rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="mono text-[10px] tracking-[0.15em] text-zinc-600 uppercase">
                Banned accounts ({bans.length})
              </p>
              <button onClick={fetchAll} className="mono text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors">↻ Refresh</button>
            </div>
            {bans.length === 0 && (
              <p className="mono text-xs text-zinc-700 py-4 text-center">No banned users.</p>
            )}
            <div className="space-y-2">
              {filteredBans.map(b => (
                <div key={b.id} className="flex items-center gap-3 rounded-xl border border-white/[0.04] bg-rose-500/[0.03] px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="mono text-xs text-zinc-200 truncate">{b.name}</p>
                    {b.reason && <p className="mono text-[10px] text-zinc-600 truncate mt-0.5">Reason: {b.reason}</p>}
                    <p className="mono text-[10px] text-zinc-700">{new Date(b.created_at).toLocaleString()}</p>
                  </div>
                  <button
                    onClick={() => unbanUser(b.name)}
                    className="flex-shrink-0 flex h-7 items-center px-3 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.07] text-[10px] text-emerald-400 hover:bg-emerald-500/[0.14] transition-all active:scale-[0.97]"
                  >
                    Unban
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Roles Tab ── */}
      {tab === 'roles' && (
        <div className="space-y-6">
          <div className="glass-card rounded-2xl p-5 space-y-4">
            <div>
              <p className="text-sm font-semibold text-zinc-200 tracking-tight">Grant role</p>
              <p className="mt-0.5 text-xs text-zinc-600">Sets any user to user / admin / owner.</p>
            </div>
            <input
              className="w-full h-9 rounded-xl border border-white/[0.08] bg-zinc-900/60 px-3 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-white/[0.18] focus:outline-none transition-all"
              placeholder="email@example.com"
              value={roleTarget}
              onChange={e => setRoleTarget(e.target.value)}
            />
            <div className="flex gap-2">
              {(['user', 'admin', 'owner'] as const).map(r => (
                <button key={r} onClick={() => setRoleValue(r)}
                  className={`flex-1 rounded-xl border py-2 text-xs font-medium transition-all active:scale-[0.98] ${
                    roleValue === r
                      ? r === 'owner' ? 'border-amber-500/40 bg-amber-500/[0.12] text-amber-400'
                        : r === 'admin' ? 'border-blue-500/30 bg-blue-500/[0.1] text-blue-400'
                        : 'border-white/[0.12] bg-zinc-800/80 text-zinc-200'
                      : 'border-white/[0.07] bg-white/[0.02] text-zinc-600 hover:text-zinc-300'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <button
              onClick={grantRole}
              disabled={!roleTarget.trim()}
              className="w-full flex h-9 items-center justify-center rounded-xl border border-amber-500/25 bg-amber-500/[0.08] text-xs text-amber-400 hover:bg-amber-500/[0.14] transition-all active:scale-[0.98] disabled:opacity-40"
            >
              Apply role
            </button>
          </div>

          {/* All users */}
          <div className="glass-card rounded-2xl p-5 space-y-3">
            <p className="mono text-[10px] tracking-[0.15em] text-zinc-600 uppercase">All users ({profiles.length})</p>
            {profiles.map(p => (
              <div key={p.id} className="flex items-center gap-3 rounded-xl border border-white/[0.04] px-4 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-zinc-200 truncate">{p.email}</p>
                  <p className="mono text-[10px] text-zinc-700">{new Date(p.created_at).toLocaleDateString()}</p>
                </div>
                <span className={`mono text-[9px] border rounded-full px-1.5 py-0.5 ${
                  p.role === 'owner' ? 'border-amber-500/25 text-amber-400' :
                  p.role === 'admin' ? 'border-blue-500/25 text-blue-400' :
                  'border-zinc-800 text-zinc-700'
                }`}>{p.role}</span>
                <div className="flex gap-1">
                  {p.email !== 'abdulla.mjasim@alhekma.com' && (
                    <>
                      {p.role !== 'owner' && (
                        <button onClick={() => { setRoleTarget(p.email); setRoleValue('owner'); setTab('roles') }}
                          className="mono text-[9px] px-2 py-1 rounded-lg border border-amber-500/15 text-amber-600/70 hover:text-amber-400 hover:bg-amber-500/[0.08] transition-all active:scale-[0.97]">
                          → owner
                        </button>
                      )}
                      {p.role !== 'admin' && (
                        <button onClick={() => { setRoleTarget(p.email); setRoleValue('admin'); setTab('roles') }}
                          className="mono text-[9px] px-2 py-1 rounded-lg border border-blue-500/15 text-blue-600/70 hover:text-blue-400 hover:bg-blue-500/[0.08] transition-all active:scale-[0.97]">
                          → admin
                        </button>
                      )}
                      {p.role !== 'user' && (
                        <button onClick={() => { setRoleTarget(p.email); setRoleValue('user'); setTab('roles') }}
                          className="mono text-[9px] px-2 py-1 rounded-lg border border-zinc-700/50 text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800/60 transition-all active:scale-[0.97]">
                          → user
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Audit Log Tab ── */}
      {tab === 'logs' && (
        <div className="space-y-2">
          <p className="mono text-xs text-zinc-600 mb-4">Last 50 admin actions</p>
          {logs.length === 0 && <p className="mono text-xs text-zinc-700 py-8 text-center">No entries yet.</p>}
          {logs.map(l => (
            <div key={l.id} className="glass-card rounded-xl px-4 py-3 flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`mono text-xs font-medium ${
                    l.action.includes('ban') ? 'text-rose-400' :
                    l.action.includes('unban') ? 'text-emerald-400' :
                    l.action.includes('grant') ? 'text-amber-400' :
                    'text-zinc-300'
                  }`}>{l.action}</span>
                  {l.target_email && <span className="mono text-[10px] text-zinc-600">→ {l.target_email}</span>}
                </div>
                <p className="mono text-[10px] text-zinc-700">{l.actor_email}</p>
              </div>
              <span className="mono text-[9px] text-zinc-700 flex-shrink-0">{new Date(l.created_at).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Danger Zone ── */}
      {tab === 'danger' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/[0.04] px-5 py-4">
            <p className="text-xs text-rose-400/80 font-medium mb-1">⚠️ Danger Zone</p>
            <p className="text-xs text-zinc-600">These actions are irreversible or affect all users.</p>
          </div>
          <DangerAction
            label="Clear all chat messages"
            desc="Permanently deletes every message in public chat."
            onConfirm={async () => {
              await sb.from('chat_messages').delete().neq('id', '00000000-0000-0000-0000-000000000000')
              await sb.rpc('log_admin_action', { p_action: 'danger_clear_chat', p_payload: {} })
              flash('All chat cleared.')
            }}
          />
          <DangerAction
            label="Revoke all admin roles"
            desc="Sets every non-owner profile to role=user."
            onConfirm={async () => {
              await sb.from('profiles').update({ role: 'user' }).neq('email', 'abdulla.mjasim@alhekma.com').eq('role', 'admin')
              await sb.rpc('log_admin_action', { p_action: 'danger_revoke_all_admins', p_payload: {} })
              flash('All admin roles revoked.')
              fetchAll()
            }}
          />
          <DangerAction
            label="Wipe all bans"
            desc="Removes every entry from banned_users."
            onConfirm={async () => {
              await sb.from('banned_users').delete().neq('id', '00000000-0000-0000-0000-000000000000')
              await sb.rpc('log_admin_action', { p_action: 'danger_wipe_bans', p_payload: {} })
              flash('All bans cleared.')
              fetchAll()
            }}
          />
        </div>
      )}
    </div>
  )
}

function DangerAction({ label, desc, onConfirm }: { label: string; desc: string; onConfirm: () => Promise<void> }) {
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  return (
    <div className="glass-card rounded-2xl p-5 flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-semibold text-zinc-200">{label}</p>
        <p className="mono text-[10px] text-zinc-600 mt-0.5">{desc}</p>
      </div>
      {!confirm ? (
        <button onClick={() => setConfirm(true)}
          className="flex-shrink-0 flex h-8 items-center px-4 rounded-xl border border-rose-500/20 bg-rose-500/[0.07] text-xs text-rose-400 hover:bg-rose-500/[0.14] transition-all active:scale-[0.98]">
          Run
        </button>
      ) : (
        <div className="flex-shrink-0 flex items-center gap-2">
          <button onClick={() => setConfirm(false)} className="flex h-8 items-center px-3 rounded-xl border border-white/[0.08] text-xs text-zinc-500 hover:text-zinc-300 transition-all">Cancel</button>
          <button
            onClick={async () => { setBusy(true); await onConfirm(); setBusy(false); setConfirm(false) }}
            disabled={busy}
            className="flex h-8 items-center px-4 rounded-xl border border-rose-400/30 bg-rose-500/20 text-xs text-rose-300 hover:bg-rose-500/30 transition-all active:scale-[0.98] disabled:opacity-50">
            {busy ? '…' : 'Confirm'}
          </button>
        </div>
      )}
    </div>
  )
}
