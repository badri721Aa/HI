'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import { isOwner, canAdmin } from '@/lib/utils'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface Profile { id: string; email: string; display_name: string; created_at: string; role: string; muted_until: string | null }
interface AuditLog { id: string; actor_email: string; action: string; target_email: string | null; payload: Record<string, unknown> | null; created_at: string }
interface ChatMessage { id: string; user_id: string; content: string; created_at: string; profiles?: { email: string; display_name: string } | null }
interface WordFilter { id: string; pattern: string; action: string }
interface BannedUser { id: string; name: string; email: string | null; banned_by: string | null; reason: string | null; unbanned_at: string | null; created_at: string }

const HARDCODED_TOXIC = [
  /\bfuck\b/i, /\bshit\b/i, /\bbitch\b/i, /\bkill yourself\b/i, /\bkys\b/i,
  /\bnigger\b/i, /\bnigga\b/i, /\bretard\b/i, /\bfaggot\b/i, /\bcunt\b/i,
  /\bwhore\b/i, /\bslut\b/i,
]

function isToxic(text: string, dynamicFilters: WordFilter[]) {
  if (HARDCODED_TOXIC.some(p => p.test(text))) return true
  return dynamicFilters.some(f => {
    try { return new RegExp(f.pattern, 'i').test(text) } catch { return text.toLowerCase().includes(f.pattern.toLowerCase()) }
  })
}

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'users', label: 'Users' },
  { id: 'moderation', label: 'Moderation' },
  { id: 'bans', label: 'Bans' },
  { id: 'broadcast', label: 'Broadcast' },
  { id: 'system', label: 'System' },
  { id: 'logs', label: 'Audit Logs' },
] as const
type Tab = typeof TABS[number]['id']

export default function AdminPage() {
  const [user, setUser] = useState<User | null>(null)
  const [role, setRole] = useState('user')
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<Profile[]>([])
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [bans, setBans] = useState<BannedUser[]>([])
  const [chatMsgs, setChatMsgs] = useState<ChatMessage[]>([])
  const [wordFilters, setWordFilters] = useState<WordFilter[]>([])
  const [broadcast, setBroadcast] = useState('')
  const [broadcastSent, setBroadcastSent] = useState(false)
  const [banTarget, setBanTarget] = useState('')
  const [banReason, setBanReason] = useState('')
  const [unbanTarget, setUnbanTarget] = useState('')
  const [muteTarget, setMuteTarget] = useState('')
  const [muteMins, setMuteMins] = useState(30)
  const [userSearch, setUserSearch] = useState('')
  const [tab, setTab] = useState<Tab>('overview')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null)
  const [ping, setPing] = useState<number | null>(null)
  const [wsStatus, setWsStatus] = useState<'connected' | 'disconnected'>('disconnected')
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const sb = createClient()

  const showToast = useCallback((ok: boolean, msg: string) => {
    setToast({ ok, msg })
    setTimeout(() => setToast(null), 3000)
  }, [])

  useEffect(() => {
    sb.auth.getUser().then(async ({ data }) => {
      const u = data.user
      setUser(u)
      if (!u) { setLoading(false); return }
      const { data: p } = await sb.from('profiles').select('role').eq('id', u.id).single()
      const r = p?.role ?? 'user'
      setRole(r)
      if (canAdmin(r) || isOwner(u.email ?? '')) fetchData()
      setLoading(false)
    })

    // Measure ping
    const measurePing = async () => {
      const t = Date.now()
      try {
        await sb.from('profiles').select('id').limit(1)
        setPing(Date.now() - t)
        setWsStatus('connected')
      } catch { setWsStatus('disconnected') }
    }
    measurePing()
    pingRef.current = setInterval(measurePing, 10000)
    return () => { if (pingRef.current) clearInterval(pingRef.current) }
  }, [])

  async function fetchData() {
    const [{ data: u }, { data: l }, { data: c }, { data: b }, { data: wf }] = await Promise.all([
      sb.from('profiles').select('*').order('created_at', { ascending: false }),
      sb.from('admin_audit_logs').select('*').order('created_at', { ascending: false }).limit(50),
      sb.from('chat_messages').select('id, user_id, content, created_at, profiles(email, display_name)').order('created_at', { ascending: false }).limit(200),
      sb.from('banned_users').select('*').order('created_at', { ascending: false }),
      sb.from('word_filters').select('*'),
    ])
    if (u) setUsers(u)
    if (l) setLogs(l)
    if (c) setChatMsgs(c as ChatMessage[])
    if (b) setBans(b)
    if (wf) setWordFilters(wf)
  }

  async function quickBan(email: string, reason?: string) {
    if (!email) return
    setActionLoading('ban-' + email)
    const { data, error } = await sb.rpc('ban_user_by_email', { p_email: email, p_reason: reason ?? null })
    setActionLoading(null)
    if (error) { showToast(false, error.message); return }
    showToast(data?.ok ?? false, data?.msg ?? 'Done')
    if (data?.ok) await fetchData()
  }

  async function quickUnban(email: string) {
    setActionLoading('unban-' + email)
    const { data, error } = await sb.rpc('unban_user_by_email', { p_email: email })
    setActionLoading(null)
    if (error) { showToast(false, error.message); return }
    showToast(data?.ok ?? false, data?.msg ?? 'Done')
    if (data?.ok) await fetchData()
  }

  async function quickMute(email: string, minutes: number) {
    if (!email) return
    setActionLoading('mute-' + email)
    const { data, error } = await sb.rpc('mute_user_by_email', { p_email: email, p_minutes: minutes })
    setActionLoading(null)
    if (error) { showToast(false, error.message); return }
    showToast(data?.ok ?? true, data?.msg ?? 'Muted')
    await fetchData()
  }

  async function deleteMessage(id: string) {
    setActionLoading('del-' + id)
    await sb.from('chat_messages').delete().eq('id', id)
    setActionLoading(null)
    setChatMsgs(m => m.filter(x => x.id !== id))
    showToast(true, 'Message deleted')
  }

  async function sendBroadcast() {
    if (!broadcast.trim()) return
    const { error } = await sb.from('news').insert({ message: broadcast.trim(), pinned: true })
    if (error) { showToast(false, error.message); return }
    setBroadcast('')
    setBroadcastSent(true)
    showToast(true, 'Broadcast sent')
    setTimeout(() => setBroadcastSent(false), 2000)
  }

  async function banUser() {
    if (!banTarget.trim()) return
    await quickBan(banTarget.trim(), banReason.trim() || undefined)
    setBanTarget(''); setBanReason('')
  }

  async function unbanUser() {
    if (!unbanTarget.trim()) return
    await quickUnban(unbanTarget.trim())
    setUnbanTarget('')
  }

  async function muteUser() {
    if (!muteTarget.trim()) return
    await quickMute(muteTarget.trim(), muteMins)
    setMuteTarget('')
  }

  const flaggedMsgs = chatMsgs.filter(m => isToxic(m.content, wordFilters))
  const activeBans = bans.filter(b => !b.unbanned_at)
  const filteredUsers = users.filter(u =>
    !userSearch || u.email?.toLowerCase().includes(userSearch.toLowerCase()) || u.display_name?.toLowerCase().includes(userSearch.toLowerCase())
  )

  const tabBadges: Partial<Record<Tab, number>> = {
    moderation: flaggedMsgs.length || undefined,
    bans: activeBans.length || undefined,
  } as Partial<Record<Tab, number>>

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="mono text-xs text-zinc-700 animate-pulse">Loading…</div>
    </div>
  )

  if (!user || (!canAdmin(role) && !isOwner(user.email ?? ''))) return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center space-y-3">
        <p className="text-sm text-zinc-500">Admin access required.</p>
        <Link href="/" className="mono text-xs text-zinc-700 hover:text-zinc-400 underline">← Home</Link>
      </div>
    </div>
  )

  return (
    <div className="mx-auto max-w-5xl px-4 pb-24 pt-24">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-[999] mono text-xs px-4 py-3 rounded-xl border shadow-2xl transition-all ${
          toast.ok ? 'bg-emerald-950/90 border-emerald-500/30 text-emerald-300' : 'bg-red-950/90 border-red-500/30 text-red-300'
        }`}>
          {toast.ok ? '✓ ' : '✗ '}{toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="mb-8 flex flex-wrap items-center gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-nacelle text-xl font-semibold text-zinc-100 tracking-tight">Admin Panel</span>
            <span className={`mono text-[9px] border rounded-full px-2 py-0.5 ${
              role === 'owner' ? 'border-amber-500/30 text-amber-400' : 'border-zinc-700 text-zinc-500'
            }`}>{role}</span>
          </div>
          <p className="mono text-[10px] text-zinc-600">{user.email}</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {/* System pulse */}
          <div className="flex items-center gap-2">
            <span className={`h-1.5 w-1.5 rounded-full ${wsStatus === 'connected' ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
            <span className="mono text-[10px] text-zinc-600">{wsStatus === 'connected' ? `${ping ?? '…'}ms` : 'offline'}</span>
          </div>
          {isOwner(user.email ?? '') && (
            <Link
              href="/admin/owner-suite"
              className="mono text-[10px] px-3 py-1.5 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] text-amber-400 hover:bg-amber-500/12 transition-all"
            >👑 Owner Suite</Link>
          )}
          <button onClick={fetchData} className="mono text-[10px] text-zinc-700 hover:text-zinc-400 transition-colors border border-white/[0.05] px-2 py-1 rounded-lg">Refresh</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex flex-wrap gap-1">
        {TABS.map(t => {
          const badge = tabBadges[t.id as Tab]
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative mono text-[11px] px-3 py-1.5 rounded-lg transition-all ${
                tab === t.id
                  ? 'bg-white/[0.07] text-zinc-100 border border-white/[0.1]'
                  : 'text-zinc-600 hover:text-zinc-300 border border-transparent hover:border-white/[0.05]'
              }`}
            >
              {t.label}
              {badge ? (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-mono text-white">
                  {badge > 9 ? '9+' : badge}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>

      {/* ── OVERVIEW ── */}
      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-4">
            {[
              { label: 'Total Users', value: users.length, color: 'zinc' },
              { label: 'Admins', value: users.filter(u => u.role === 'admin').length, color: 'violet' },
              { label: 'Active Bans', value: activeBans.length, color: 'red' },
              { label: 'Flagged Msgs', value: flaggedMsgs.length, color: 'amber' },
            ].map(s => (
              <div key={s.label} className="glass-card rounded-2xl p-5">
                <p className="mono text-[10px] tracking-[0.15em] text-zinc-600 uppercase mb-2">{s.label}</p>
                <p className="font-nacelle text-3xl font-semibold text-zinc-100">{s.value}</p>
              </div>
            ))}
          </div>
          <div className="glass-card rounded-2xl p-5 space-y-3">
            <p className="mono text-[10px] text-zinc-600 uppercase tracking-widest">Quick Actions</p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setTab('broadcast')} className="admin-quick-btn">📢 Broadcast</button>
              <button onClick={() => setTab('bans')} className="admin-quick-btn">🚫 Manage Bans</button>
              <button onClick={() => setTab('moderation')} className="admin-quick-btn">🛡 Moderation</button>
              <button onClick={() => setTab('users')} className="admin-quick-btn">👥 Users</button>
              {isOwner(user.email ?? '') && (
                <Link href="/admin/owner-suite" className="admin-quick-btn">👑 Owner Suite</Link>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── USERS ── */}
      {tab === 'users' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <p className="mono text-xs text-zinc-600">{users.length} registered users</p>
            <input
              className="flex-1 max-w-xs bg-zinc-900/60 border border-white/[0.07] rounded-xl px-3 py-1.5 mono text-[11px] text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-white/[0.15] transition-colors"
              placeholder="Search email or name…"
              value={userSearch}
              onChange={e => setUserSearch(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            {filteredUsers.map(u => {
              const isMuted = u.muted_until && new Date(u.muted_until) > new Date()
              const isBanned = activeBans.some(b => b.email === u.email || b.name === u.email)
              const canAct = u.role !== 'owner' && u.email !== user.email
              return (
                <div key={u.id} className="glass-card flex flex-wrap items-center gap-3 rounded-xl px-4 py-3">
                  <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-white/[0.07] bg-zinc-800/60 text-[10px] font-semibold text-zinc-500">
                    {(u.display_name || u.email || 'A')[0].toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-zinc-200 truncate">{u.display_name || 'Unnamed'}</p>
                    <p className="mono text-[10px] text-zinc-600 truncate">{u.email}</p>
                    {isMuted && <p className="mono text-[9px] text-amber-500/70">Muted until {new Date(u.muted_until!).toLocaleTimeString()}</p>}
                    {isBanned && <p className="mono text-[9px] text-red-400/70">Banned</p>}
                  </div>
                  <span className={`mono text-[9px] border rounded-full px-2 py-0.5 flex-shrink-0 ${
                    u.role === 'owner' ? 'border-amber-500/25 text-amber-400' :
                    u.role === 'admin' ? 'border-violet-500/25 text-violet-400' :
                    'border-zinc-800 text-zinc-700'
                  }`}>{u.role}</span>
                  {canAct && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => quickMute(u.email, 30)} disabled={actionLoading === 'mute-' + u.email} className="admin-act-btn amber">
                        {actionLoading === 'mute-' + u.email ? '…' : 'Mute 30m'}
                      </button>
                      {isBanned ? (
                        <button onClick={() => quickUnban(u.email)} disabled={!!actionLoading?.startsWith('unban-' + u.email)} className="admin-act-btn emerald">
                          Unban
                        </button>
                      ) : (
                        <button onClick={() => quickBan(u.email)} disabled={actionLoading === 'ban-' + u.email} className="admin-act-btn red">
                          {actionLoading === 'ban-' + u.email ? '…' : 'Ban'}
                        </button>
                      )}
                    </div>
                  )}
                  <span className="mono text-[9px] text-zinc-700 hidden sm:block flex-shrink-0">{new Date(u.created_at).toLocaleDateString()}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── MODERATION ── */}
      {tab === 'moderation' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <p className="mono text-xs text-zinc-600">{chatMsgs.length} recent messages</p>
            {flaggedMsgs.length > 0 && (
              <span className="mono text-[10px] border border-red-500/25 bg-red-500/[0.06] text-red-400 rounded-full px-2 py-0.5">
                {flaggedMsgs.length} auto-flagged
              </span>
            )}
            <span className="mono text-[10px] text-zinc-700">{wordFilters.length} active word filters</span>
          </div>

          {chatMsgs.length === 0 && (
            <p className="mono text-xs text-zinc-700 py-8 text-center">No messages yet.</p>
          )}

          <div className="space-y-2">
            {chatMsgs.map(m => {
              const flagged = isToxic(m.content, wordFilters)
              const senderEmail = m.profiles?.email ?? 'Unknown'
              const senderName = m.profiles?.display_name ?? 'Unknown'
              return (
                <div key={m.id} className={`glass-card rounded-xl px-4 py-3 flex items-start gap-3 ${flagged ? 'border-red-500/20 bg-red-500/[0.04]' : ''}`}>
                  {flagged && <span className="flex-shrink-0 mt-0.5 text-red-400" title="Auto-flagged">⚑</span>}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="mono text-[10px] text-zinc-400">{senderName}</span>
                      <span className="mono text-[10px] text-zinc-700">{senderEmail}</span>
                      <span className="mono text-[9px] text-zinc-800 ml-auto">{new Date(m.created_at).toLocaleTimeString()}</span>
                    </div>
                    <p className={`text-sm break-words ${flagged ? 'text-red-300' : 'text-zinc-400'}`}>{m.content}</p>
                  </div>
                  <div className="flex flex-col gap-1 flex-shrink-0">
                    <button onClick={() => deleteMessage(m.id)} disabled={actionLoading === 'del-' + m.id} className="admin-act-btn red">
                      {actionLoading === 'del-' + m.id ? '…' : 'Del'}
                    </button>
                    {senderEmail !== 'Unknown' && (
                      <button onClick={() => quickBan(senderEmail)} disabled={actionLoading === 'ban-' + senderEmail} className="admin-act-btn red">
                        Ban
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── BANS ── */}
      {tab === 'bans' && (
        <div className="space-y-6">
          <div className="grid sm:grid-cols-2 gap-4">
            {/* Ban form */}
            <div className="glass-card rounded-2xl p-5 space-y-3">
              <p className="text-sm font-semibold text-zinc-200">Ban User</p>
              <input
                className="w-full bg-zinc-900/60 border border-white/[0.07] rounded-xl px-3 py-2 mono text-xs text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-white/[0.15]"
                placeholder="Email to ban"
                value={banTarget}
                onChange={e => setBanTarget(e.target.value)}
              />
              <input
                className="w-full bg-zinc-900/60 border border-white/[0.07] rounded-xl px-3 py-2 mono text-xs text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-white/[0.15]"
                placeholder="Reason (optional)"
                value={banReason}
                onChange={e => setBanReason(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && banUser()}
              />
              <Button variant="danger" onClick={banUser} className="w-full" disabled={actionLoading === 'ban-' + banTarget}>Ban</Button>
            </div>

            {/* Unban form */}
            <div className="glass-card rounded-2xl p-5 space-y-3">
              <p className="text-sm font-semibold text-zinc-200">Unban User</p>
              <input
                className="w-full bg-zinc-900/60 border border-white/[0.07] rounded-xl px-3 py-2 mono text-xs text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-white/[0.15]"
                placeholder="Email to unban"
                value={unbanTarget}
                onChange={e => setUnbanTarget(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && unbanUser()}
              />
              <Button variant="default" onClick={unbanUser} className="w-full">Unban</Button>
            </div>
          </div>

          {/* Mute form */}
          <div className="glass-card rounded-2xl p-5 space-y-3">
            <p className="text-sm font-semibold text-zinc-200">Mute User</p>
            <div className="flex gap-2 flex-wrap">
              <input
                className="flex-1 min-w-[180px] bg-zinc-900/60 border border-white/[0.07] rounded-xl px-3 py-2 mono text-xs text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-white/[0.15]"
                placeholder="Email to mute"
                value={muteTarget}
                onChange={e => setMuteTarget(e.target.value)}
              />
              <select
                className="bg-zinc-900/60 border border-white/[0.07] rounded-xl px-3 py-2 mono text-xs text-zinc-400 outline-none"
                value={muteMins}
                onChange={e => setMuteMins(Number(e.target.value))}
              >
                <option value={15}>15 min</option>
                <option value={30}>30 min</option>
                <option value={60}>1 hour</option>
                <option value={1440}>1 day</option>
                <option value={10080}>1 week</option>
              </select>
              <button onClick={muteUser} className="mono text-[10px] px-4 py-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] text-amber-400 hover:bg-amber-500/12 transition-all">Mute</button>
            </div>
          </div>

          {/* Active bans list */}
          <div>
            <p className="mono text-[10px] text-zinc-600 uppercase tracking-widest mb-3">Active Bans ({activeBans.length})</p>
            {activeBans.length === 0 && <p className="mono text-xs text-zinc-700 py-6 text-center">No active bans.</p>}
            {activeBans.map(b => (
              <div key={b.id} className="glass-card flex items-center gap-3 rounded-xl px-4 py-3 mb-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-200 truncate">{b.email || b.name}</p>
                  {b.reason && <p className="mono text-[10px] text-zinc-600 truncate">{b.reason}</p>}
                  <p className="mono text-[9px] text-zinc-700">by {b.banned_by ?? 'system'} · {new Date(b.created_at).toLocaleDateString()}</p>
                </div>
                <button
                  onClick={() => quickUnban(b.email ?? b.name)}
                  disabled={!!actionLoading?.startsWith('unban-')}
                  className="admin-act-btn emerald flex-shrink-0"
                >Unban</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── BROADCAST ── */}
      {tab === 'broadcast' && (
        <div className="glass-card rounded-2xl p-5 space-y-4">
          <div>
            <p className="text-sm font-semibold text-zinc-200 tracking-tight">Broadcast to All Users</p>
            <p className="mt-1 text-xs text-zinc-600">Posted as pinned news — visible site-wide in real-time</p>
          </div>
          <textarea
            className="w-full h-32 resize-none rounded-xl border border-white/[0.08] bg-zinc-900/60 px-4 py-3 text-sm text-zinc-200 placeholder:text-zinc-600 transition-all duration-200 focus:border-white/[0.18] focus:outline-none"
            placeholder="Your message to everyone…"
            value={broadcast}
            onChange={e => setBroadcast(e.target.value)}
            maxLength={500}
          />
          <div className="flex items-center gap-3">
            <Button variant="gold" onClick={sendBroadcast} disabled={!broadcast.trim()}>Send Broadcast</Button>
            {broadcastSent && <span className="mono text-xs text-emerald-400">✓ Sent!</span>}
            <span className="mono text-[10px] text-zinc-700 ml-auto">{broadcast.length}/500</span>
          </div>
        </div>
      )}

      {/* ── SYSTEM ── */}
      {tab === 'system' && (
        <div className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="glass-card rounded-2xl p-5 space-y-2">
              <p className="mono text-[10px] text-zinc-600 uppercase tracking-widest">DB Latency</p>
              <p className="font-nacelle text-3xl font-semibold text-zinc-100">{ping ?? '…'}<span className="text-base text-zinc-600 ml-1">ms</span></p>
              <div className="flex items-center gap-2">
                <span className={`h-1.5 w-1.5 rounded-full ${ping && ping < 200 ? 'bg-emerald-400' : ping && ping < 500 ? 'bg-amber-400' : 'bg-red-400'}`} />
                <span className="mono text-[10px] text-zinc-600">{wsStatus}</span>
              </div>
            </div>
            <div className="glass-card rounded-2xl p-5 space-y-2">
              <p className="mono text-[10px] text-zinc-600 uppercase tracking-widest">Users Online</p>
              <p className="font-nacelle text-3xl font-semibold text-zinc-100">{users.length}</p>
              <p className="mono text-[10px] text-zinc-700">registered accounts</p>
            </div>
            <div className="glass-card rounded-2xl p-5 space-y-2">
              <p className="mono text-[10px] text-zinc-600 uppercase tracking-widest">Active Bans</p>
              <p className="font-nacelle text-3xl font-semibold text-zinc-100">{activeBans.length}</p>
              <p className="mono text-[10px] text-zinc-700">blocked accounts</p>
            </div>
          </div>

          <div className="glass-card rounded-2xl p-5 space-y-4">
            <p className="mono text-[10px] text-zinc-600 uppercase tracking-widest">Admin Sub-Pages</p>
            <div className="grid sm:grid-cols-2 gap-2">
              {[
                { href: '/admin/roles', label: '👑 Role Manager', desc: 'Grant / revoke admin roles' },
                { href: '/admin/owners', label: '🔑 Owner Slots', desc: 'Manage the 3 owner email slots' },
                { href: '/admin/devtools', label: '🛠 Dev Tools', desc: 'Platform developer utilities' },
                { href: '/admin/troll-panel', label: '🎭 Troll Panel', desc: 'Broadcast effects to online users' },
                ...(isOwner(user.email ?? '') ? [{ href: '/admin/owner-suite', label: '👑 Owner Suite', desc: 'Root-level controls and overrides' }] : []),
              ].map(l => (
                <Link key={l.href} href={l.href} className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 hover:bg-white/[0.05] hover:border-white/[0.1] transition-all">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-200">{l.label}</p>
                    <p className="mono text-[10px] text-zinc-600">{l.desc}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Connectivity test */}
          <div className="glass-card rounded-2xl p-5 space-y-3">
            <p className="mono text-[10px] text-zinc-600 uppercase tracking-widest">Connectivity</p>
            <div className="space-y-2">
              {[
                { label: 'Supabase DB', ok: wsStatus === 'connected' },
                { label: 'Auth Service', ok: !!user },
                { label: 'Realtime', ok: wsStatus === 'connected' },
              ].map(c => (
                <div key={c.label} className="flex items-center gap-3">
                  <span className={`h-2 w-2 rounded-full ${c.ok ? 'bg-emerald-400' : 'bg-red-400'}`} />
                  <span className="mono text-xs text-zinc-400">{c.label}</span>
                  <span className="mono text-[10px] text-zinc-700 ml-auto">{c.ok ? 'OK' : 'Error'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── AUDIT LOGS ── */}
      {tab === 'logs' && (
        <div className="space-y-2">
          {logs.length === 0 && <p className="mono text-xs text-zinc-700 py-8 text-center">No audit entries yet.</p>}
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

      <style>{`
        .admin-quick-btn {
          font-family: monospace;
          font-size: 0.7rem;
          padding: 0.4rem 0.9rem;
          border-radius: 0.625rem;
          border: 1px solid rgba(255,255,255,0.07);
          background: rgba(255,255,255,0.03);
          color: #a1a1aa;
          cursor: pointer;
          transition: all 0.15s;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
        }
        .admin-quick-btn:hover { background: rgba(255,255,255,0.07); color: #e4e4e7; border-color: rgba(255,255,255,0.12); }
        .admin-act-btn {
          font-family: monospace;
          font-size: 0.65rem;
          padding: 0.25rem 0.6rem;
          border-radius: 0.5rem;
          border: 1px solid;
          cursor: pointer;
          transition: all 0.15s;
          white-space: nowrap;
        }
        .admin-act-btn:disabled { opacity: 0.4; cursor: default; }
        .admin-act-btn.red { border-color: rgba(239,68,68,0.2); color: rgba(252,165,165,0.7); }
        .admin-act-btn.red:hover { background: rgba(239,68,68,0.1); }
        .admin-act-btn.amber { border-color: rgba(251,191,36,0.2); color: rgba(251,191,36,0.7); }
        .admin-act-btn.amber:hover { background: rgba(251,191,36,0.08); }
        .admin-act-btn.emerald { border-color: rgba(16,185,129,0.2); color: rgba(110,231,183,0.7); }
        .admin-act-btn.emerald:hover { background: rgba(16,185,129,0.1); }
      `}</style>
    </div>
  )
}
