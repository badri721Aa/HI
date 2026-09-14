'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import { isRootOwner, isOwner } from '@/lib/utils'

interface Profile { id: string; email: string; display_name: string; role: string; created_at: string; muted_until: string | null }
interface BannedUser { id: string; name: string; email: string | null; banned_by: string | null; reason: string | null; unbanned_at: string | null; created_at: string }
interface FeatureFlag { key: string; enabled_for_roles: string[]; updated_by: string | null; updated_at: string }
interface SiteSetting { key: string; value: string | null; updated_by: string | null; updated_at: string }
interface IpBan { id: string; ip_address: string; reason: string | null; banned_by: string | null; created_at: string; expires_at: string | null }
interface WordFilter { id: string; pattern: string; action: string; created_by: string | null; created_at: string }

const TABS = [
  { id: 'roles', label: 'Role Manager' },
  { id: 'bans', label: 'Ban / Unban' },
  { id: 'ipbans', label: 'IP Bans' },
  { id: 'features', label: 'Feature Flags' },
  { id: 'settings', label: 'Site Settings' },
  { id: 'wordfilters', label: 'Word Filters' },
  { id: 'danger', label: '⚡ Danger Zone' },
] as const
type Tab = typeof TABS[number]['id']

const FEATURE_LABELS: Record<string, string> = {
  proxy: 'Proxy Browser',
  games: 'Game Arcade',
  ai: 'AI Assistant',
  notes: 'Encrypted Notes',
  chat: 'Live Chat',
}

const SETTING_LABELS: Record<string, string> = {
  maintenance_mode: 'Maintenance Mode',
  accent_theme: 'Accent Theme',
  custom_css: 'Custom Global CSS',
  site_name: 'Site Display Name',
  emergency_lock: 'Emergency Lock',
}

const ROLE_COLORS: Record<string, string> = {
  owner: 'text-amber-400 bg-amber-500/10 border-amber-500/25',
  admin: 'text-violet-400 bg-violet-500/10 border-violet-500/25',
  user: 'text-zinc-500 bg-zinc-800/40 border-zinc-700/40',
}

export default function OwnerSuitePage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('roles')
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [bans, setBans] = useState<BannedUser[]>([])
  const [ipbans, setIpBans] = useState<IpBan[]>([])
  const [flags, setFlags] = useState<FeatureFlag[]>([])
  const [settings, setSettings] = useState<SiteSetting[]>([])
  const [filters, setFilters] = useState<WordFilter[]>([])
  const [search, setSearch] = useState('')
  const [working, setWorking] = useState<string | null>(null)
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null)

  // forms
  const [roleTarget, setRoleTarget] = useState('')
  const [roleValue, setRoleValue] = useState<'user' | 'admin'>('admin')
  const [banTarget, setBanTarget] = useState('')
  const [banReason, setBanReason] = useState('')
  const [unbanTarget, setUnbanTarget] = useState('')
  const [ipTarget, setIpTarget] = useState('')
  const [ipReason, setIpReason] = useState('')
  const [filterPattern, setFilterPattern] = useState('')
  const [filterAction, setFilterAction] = useState<'flag' | 'mute' | 'ban'>('flag')
  const [settingEdits, setSettingEdits] = useState<Record<string, string>>({})
  const [customCss, setCustomCss] = useState('')

  const sb = createClient()

  const showToast = useCallback((ok: boolean, msg: string) => {
    setToast({ ok, msg })
    setTimeout(() => setToast(null), 3500)
  }, [])

  useEffect(() => {
    sb.auth.getUser().then(async ({ data }) => {
      const u = data.user
      if (!u || !isOwner(u.email ?? '')) {
        router.replace('/admin')
        return
      }
      setUser(u)
      await loadAll()
      setLoading(false)
    })
  }, [])

  async function loadAll() {
    const [{ data: p }, { data: b }, { data: ip }, { data: f }, { data: s }, { data: wf }] = await Promise.all([
      sb.from('profiles').select('*').order('role').order('created_at'),
      sb.from('banned_users').select('*').order('created_at', { ascending: false }),
      sb.from('ip_bans').select('*').order('created_at', { ascending: false }),
      sb.from('feature_flags').select('*').order('key'),
      sb.from('site_settings').select('*').order('key'),
      sb.from('word_filters').select('*').order('created_at', { ascending: false }),
    ])
    if (p) setProfiles(p)
    if (b) setBans(b)
    if (ip) setIpBans(ip)
    if (f) setFlags(f)
    if (s) {
      setSettings(s)
      const css = s.find(x => x.key === 'custom_css')?.value ?? ''
      setCustomCss(css)
      const edits: Record<string, string> = {}
      s.forEach(x => { edits[x.key] = x.value ?? '' })
      setSettingEdits(edits)
    }
    if (wf) setFilters(wf)
  }

  async function grantRole() {
    if (!roleTarget.trim()) return
    setWorking('role')
    const { data, error } = await sb.rpc('grant_role_by_email', { p_target_email: roleTarget.trim(), p_target_role: roleValue })
    setWorking(null)
    if (error) { showToast(false, error.message); return }
    showToast(data?.ok, data?.msg ?? 'Done')
    if (data?.ok) { setRoleTarget(''); await loadAll() }
  }

  async function banUser() {
    if (!banTarget.trim()) return
    setWorking('ban')
    const { data, error } = await sb.rpc('ban_user_by_email', { p_email: banTarget.trim(), p_reason: banReason.trim() || null })
    setWorking(null)
    if (error) { showToast(false, error.message); return }
    showToast(data?.ok, data?.msg ?? 'Done')
    if (data?.ok) { setBanTarget(''); setBanReason(''); await loadAll() }
  }

  async function unbanUser(email?: string) {
    const target = email ?? unbanTarget.trim()
    if (!target) return
    setWorking('unban-' + target)
    const { data, error } = await sb.rpc('unban_user_by_email', { p_email: target })
    setWorking(null)
    if (error) { showToast(false, error.message); return }
    showToast(data?.ok, data?.msg ?? 'Done')
    if (data?.ok) { setUnbanTarget(''); await loadAll() }
  }

  async function addIpBan() {
    if (!ipTarget.trim()) return
    setWorking('ipban')
    const { error } = await sb.from('ip_bans').insert({ ip_address: ipTarget.trim(), reason: ipReason.trim() || null, banned_by: user?.email })
    setWorking(null)
    if (error) { showToast(false, error.message); return }
    showToast(true, 'IP banned')
    setIpTarget(''); setIpReason('')
    await loadAll()
  }

  async function removeIpBan(id: string) {
    setWorking('ipban-del-' + id)
    await sb.from('ip_bans').delete().eq('id', id)
    setWorking(null)
    await loadAll()
  }

  async function toggleFeatureRole(flagKey: string, role: string) {
    const flag = flags.find(f => f.key === flagKey)
    if (!flag) return
    const cur = flag.enabled_for_roles
    const next = cur.includes(role) ? cur.filter(r => r !== role) : [...cur, role]
    setWorking('flag-' + flagKey + role)
    const { data, error } = await sb.rpc('set_feature_flag', { p_key: flagKey, p_roles: next })
    setWorking(null)
    if (error) { showToast(false, error.message); return }
    showToast(data?.ok, data?.ok ? 'Updated' : data?.msg)
    await loadAll()
  }

  async function saveSetting(key: string) {
    setWorking('setting-' + key)
    const { data, error } = await sb.rpc('set_site_setting', { p_key: key, p_value: settingEdits[key] ?? '' })
    setWorking(null)
    if (error) { showToast(false, error.message); return }
    showToast(data?.ok, data?.ok ? 'Saved' : data?.msg)
    await loadAll()
  }

  async function saveCustomCss() {
    setWorking('setting-custom_css')
    const { data, error } = await sb.rpc('set_site_setting', { p_key: 'custom_css', p_value: customCss })
    setWorking(null)
    if (error) { showToast(false, error.message); return }
    showToast(data?.ok, data?.ok ? 'CSS saved' : data?.msg)
  }

  async function addWordFilter() {
    if (!filterPattern.trim()) return
    setWorking('wf-add')
    const { data, error } = await sb.rpc('add_word_filter', { p_pattern: filterPattern.trim(), p_action: filterAction })
    setWorking(null)
    if (error) { showToast(false, error.message); return }
    showToast(data?.ok, data?.ok ? 'Filter added' : data?.msg)
    if (data?.ok) { setFilterPattern(''); await loadAll() }
  }

  async function removeWordFilter(pattern: string) {
    setWorking('wf-del-' + pattern)
    const { data, error } = await sb.rpc('remove_word_filter', { p_pattern: pattern })
    setWorking(null)
    if (error) { showToast(false, error.message); return }
    showToast(data?.ok, data?.ok ? 'Removed' : data?.msg)
    await loadAll()
  }

  async function forceLogoutAll() {
    if (!confirm('Force-log out ALL users? This will invalidate every session.')) return
    setWorking('logout-all')
    // Supabase doesn't expose admin.listUsers on client; we send a broadcast and the client handles it
    await sb.from('site_settings').upsert({ key: 'force_logout_token', value: Date.now().toString(), updated_by: user?.email, updated_at: new Date().toISOString() })
    setWorking(null)
    showToast(true, 'Force logout signal sent — active sessions will be terminated on next request')
  }

  async function toggleMaintenanceMode() {
    const cur = settings.find(s => s.key === 'maintenance_mode')?.value === 'true'
    const { data, error } = await sb.rpc('set_site_setting', { p_key: 'maintenance_mode', p_value: cur ? 'false' : 'true' })
    if (error) { showToast(false, error.message); return }
    showToast(true, cur ? 'Maintenance mode OFF' : 'Maintenance mode ON')
    await loadAll()
  }

  async function toggleEmergencyLock() {
    const cur = settings.find(s => s.key === 'emergency_lock')?.value === 'true'
    const { data, error } = await sb.rpc('set_site_setting', { p_key: 'emergency_lock', p_value: cur ? 'false' : 'true' })
    if (error) { showToast(false, error.message); return }
    showToast(true, cur ? 'Emergency lock DEACTIVATED' : 'Emergency lock ACTIVATED — all non-owner access blocked')
    await loadAll()
  }

  const filteredProfiles = profiles.filter(p =>
    !search || p.email?.toLowerCase().includes(search.toLowerCase()) || p.display_name?.toLowerCase().includes(search.toLowerCase())
  )

  const activeBans = bans.filter(b => !b.unbanned_at)
  const maintenanceMode = settings.find(s => s.key === 'maintenance_mode')?.value === 'true'
  const emergencyLock = settings.find(s => s.key === 'emergency_lock')?.value === 'true'

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="mono text-xs text-zinc-700 animate-pulse">Authenticating…</div>
    </div>
  )

  if (!user || !isOwner(user.email ?? '')) return null

  return (
    <div className="mx-auto max-w-5xl px-4 pb-24 pt-24">
      {/* Header */}
      <div className="mb-8 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl"
            style={{ background: 'linear-gradient(135deg, rgba(251,191,36,0.2) 0%, rgba(245,158,11,0.1) 100%)', border: '1px solid rgba(251,191,36,0.3)', boxShadow: '0 0 20px rgba(251,191,36,0.15)' }}
          >
            <span className="text-lg">👑</span>
          </div>
          <div>
            <h1 className="font-nacelle text-xl font-semibold text-zinc-100 tracking-tight">Owner Suite</h1>
            <p className="mono text-[10px] text-amber-500/60 tracking-widest uppercase">Root access — {user.email}</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {maintenanceMode && (
            <span className="mono text-[10px] border border-amber-500/30 bg-amber-500/10 text-amber-400 rounded-full px-2 py-0.5 animate-pulse">Maintenance</span>
          )}
          {emergencyLock && (
            <span className="mono text-[10px] border border-red-500/30 bg-red-500/10 text-red-400 rounded-full px-2 py-0.5 animate-pulse">LOCKED</span>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-[999] mono text-xs px-4 py-3 rounded-xl border shadow-2xl transition-all ${
          toast.ok ? 'bg-emerald-950/90 border-emerald-500/30 text-emerald-300' : 'bg-red-950/90 border-red-500/30 text-red-300'
        }`}>
          {toast.ok ? '✓ ' : '✗ '}{toast.msg}
        </div>
      )}

      {/* Tabs */}
      <div className="mb-6 flex flex-wrap gap-1">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`mono text-[11px] px-3 py-1.5 rounded-lg transition-all ${
              tab === t.id
                ? t.id === 'danger'
                  ? 'bg-red-500/15 text-red-300 border border-red-500/30'
                  : 'bg-amber-500/12 text-amber-300 border border-amber-500/25'
                : 'text-zinc-600 hover:text-zinc-300 border border-transparent hover:border-white/[0.06]'
            }`}
          >{t.label}</button>
        ))}
      </div>

      {/* ── ROLE MANAGER ── */}
      {tab === 'roles' && (
        <div className="space-y-6">
          <div className="neon-card p-5 space-y-4">
            <h3 className="text-sm font-semibold text-zinc-200">Grant / Revoke Role</h3>
            <p className="mono text-[10px] text-zinc-600">Only owner can promote to admin. Owner role is immutable here.</p>
            <div className="flex gap-2 flex-wrap">
              <input
                className="owner-input flex-1 min-w-[200px]"
                placeholder="user@example.com"
                value={roleTarget}
                onChange={e => setRoleTarget(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && grantRole()}
              />
              <select
                className="owner-input w-28"
                value={roleValue}
                onChange={e => setRoleValue(e.target.value as 'user' | 'admin')}
              >
                <option value="admin">admin</option>
                <option value="user">user</option>
              </select>
              <button onClick={grantRole} disabled={working === 'role'} className="owner-btn-amber">
                {working === 'role' ? '…' : 'Apply'}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-3 mb-3">
              <p className="mono text-xs text-zinc-600">{profiles.length} accounts</p>
              <input
                className="owner-input flex-1 max-w-xs text-[11px]"
                placeholder="Search email or name…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            {filteredProfiles.map(p => (
              <div key={p.id} className="neon-card flex items-center gap-3 px-4 py-3">
                <div className="h-7 w-7 flex-shrink-0 flex items-center justify-center rounded-lg bg-zinc-800/80 text-[10px] font-bold text-zinc-500 border border-white/[0.05]">
                  {(p.display_name || p.email || 'A')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-200 truncate">{p.display_name || 'Unnamed'}</p>
                  <p className="mono text-[10px] text-zinc-600 truncate">{p.email}</p>
                </div>
                <span className={`mono text-[9px] border rounded-full px-2 py-0.5 ${ROLE_COLORS[p.role] ?? ROLE_COLORS.user}`}>{p.role}</span>
                {p.role !== 'owner' && p.email !== user.email && (
                  <div className="flex gap-1">
                    {p.role === 'user' && (
                      <button
                        onClick={() => { setRoleTarget(p.email); setRoleValue('admin'); setTab('roles') }}
                        className="mono text-[9px] px-2 py-1 rounded-lg border border-violet-500/20 text-violet-400/70 hover:bg-violet-500/10 transition-colors"
                      >→ Admin</button>
                    )}
                    {p.role === 'admin' && (
                      <button
                        onClick={() => { setRoleTarget(p.email); setRoleValue('user') }}
                        className="mono text-[9px] px-2 py-1 rounded-lg border border-zinc-700/40 text-zinc-500 hover:bg-zinc-800/40 transition-colors"
                      >→ User</button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── BAN / UNBAN ── */}
      {tab === 'bans' && (
        <div className="space-y-6">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="neon-card p-5 space-y-3">
              <h3 className="text-sm font-semibold text-zinc-200">Ban User</h3>
              <input className="owner-input w-full" placeholder="Email to ban" value={banTarget} onChange={e => setBanTarget(e.target.value)} />
              <input className="owner-input w-full" placeholder="Reason (optional)" value={banReason} onChange={e => setBanReason(e.target.value)} onKeyDown={e => e.key === 'Enter' && banUser()} />
              <button onClick={banUser} disabled={working === 'ban'} className="owner-btn-red w-full">
                {working === 'ban' ? '…' : 'Ban User'}
              </button>
            </div>
            <div className="neon-card p-5 space-y-3">
              <h3 className="text-sm font-semibold text-zinc-200">Unban User</h3>
              <input className="owner-input w-full" placeholder="Email to unban" value={unbanTarget} onChange={e => setUnbanTarget(e.target.value)} onKeyDown={e => e.key === 'Enter' && unbanUser()} />
              <button onClick={() => unbanUser()} disabled={!!working?.startsWith('unban')} className="owner-btn-emerald w-full">
                {working?.startsWith('unban') ? '…' : 'Unban User'}
              </button>
            </div>
          </div>

          <div>
            <p className="mono text-[10px] text-zinc-600 mb-3 uppercase tracking-widest">Active Bans ({activeBans.length})</p>
            {activeBans.length === 0 && <p className="mono text-xs text-zinc-700 py-6 text-center">No active bans.</p>}
            {activeBans.map(b => (
              <div key={b.id} className="neon-card flex items-center gap-3 px-4 py-3 mb-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-200 truncate">{b.email || b.name}</p>
                  {b.reason && <p className="mono text-[10px] text-zinc-600 truncate">{b.reason}</p>}
                  <p className="mono text-[9px] text-zinc-700">by {b.banned_by ?? 'system'} · {new Date(b.created_at).toLocaleDateString()}</p>
                </div>
                <button
                  onClick={() => unbanUser(b.email ?? b.name)}
                  disabled={!!working?.startsWith('unban')}
                  className="owner-btn-emerald text-[10px] px-3 py-1.5 flex-shrink-0"
                >Unban</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── IP BANS ── */}
      {tab === 'ipbans' && (
        <div className="space-y-6">
          <div className="neon-card p-5 space-y-3">
            <h3 className="text-sm font-semibold text-zinc-200">Add IP Ban</h3>
            <div className="flex gap-2 flex-wrap">
              <input className="owner-input flex-1 min-w-[180px]" placeholder="IP address" value={ipTarget} onChange={e => setIpTarget(e.target.value)} />
              <input className="owner-input flex-1 min-w-[180px]" placeholder="Reason (optional)" value={ipReason} onChange={e => setIpReason(e.target.value)} onKeyDown={e => e.key === 'Enter' && addIpBan()} />
              <button onClick={addIpBan} disabled={working === 'ipban'} className="owner-btn-red">
                {working === 'ipban' ? '…' : 'Block IP'}
              </button>
            </div>
          </div>
          <div>
            <p className="mono text-[10px] text-zinc-600 mb-3 uppercase tracking-widest">Blocked IPs ({ipbans.length})</p>
            {ipbans.length === 0 && <p className="mono text-xs text-zinc-700 py-6 text-center">No IP bans.</p>}
            {ipbans.map(b => (
              <div key={b.id} className="neon-card flex items-center gap-3 px-4 py-3 mb-2">
                <div className="flex-1">
                  <p className="mono text-sm text-zinc-200">{b.ip_address}</p>
                  {b.reason && <p className="mono text-[10px] text-zinc-600">{b.reason}</p>}
                  <p className="mono text-[9px] text-zinc-700">by {b.banned_by ?? 'system'} · {new Date(b.created_at).toLocaleDateString()}</p>
                </div>
                <button
                  onClick={() => removeIpBan(b.id)}
                  disabled={working === 'ipban-del-' + b.id}
                  className="owner-btn-emerald text-[10px] px-3 py-1.5 flex-shrink-0"
                >Unblock</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── FEATURE FLAGS ── */}
      {tab === 'features' && (
        <div className="space-y-4">
          <p className="mono text-[10px] text-zinc-600 uppercase tracking-widest">Toggle which roles can access each module</p>
          {flags.map(flag => (
            <div key={flag.key} className="neon-card px-5 py-4 flex items-center gap-4">
              <div className="flex-1">
                <p className="text-sm font-medium text-zinc-200">{FEATURE_LABELS[flag.key] ?? flag.key}</p>
                <p className="mono text-[10px] text-zinc-700">key: {flag.key} · updated {new Date(flag.updated_at).toLocaleDateString()}</p>
              </div>
              <div className="flex gap-2">
                {['user','admin','owner'].map(role => {
                  const enabled = flag.enabled_for_roles.includes(role)
                  const busy = working === 'flag-' + flag.key + role
                  return (
                    <button
                      key={role}
                      onClick={() => toggleFeatureRole(flag.key, role)}
                      disabled={busy || role === 'owner'}
                      title={role === 'owner' ? 'Owner always has access' : (enabled ? `Disable for ${role}` : `Enable for ${role}`)}
                      className={`mono text-[9px] px-2 py-1 rounded-lg border transition-all ${
                        role === 'owner' ? 'border-amber-500/20 text-amber-500/50 opacity-60 cursor-default' :
                        enabled
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                          : 'border-zinc-700/40 text-zinc-600 hover:border-zinc-600'
                      }`}
                    >{busy ? '…' : role}</button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── SITE SETTINGS ── */}
      {tab === 'settings' && (
        <div className="space-y-4">
          {settings.filter(s => s.key !== 'custom_css' && s.key !== 'emergency_lock' && s.key !== 'force_logout_token').map(s => (
            <div key={s.key} className="neon-card px-5 py-4 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-200">{SETTING_LABELS[s.key] ?? s.key}</p>
                <p className="mono text-[10px] text-zinc-700">updated by {s.updated_by ?? 'system'}</p>
              </div>
              {s.key === 'maintenance_mode' ? (
                <button
                  onClick={toggleMaintenanceMode}
                  className={`mono text-[11px] px-3 py-1.5 rounded-lg border transition-all ${
                    s.value === 'true'
                      ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                      : 'border-zinc-700/40 text-zinc-500 hover:border-zinc-600'
                  }`}
                >{s.value === 'true' ? 'ON — click to disable' : 'OFF — click to enable'}</button>
              ) : s.key === 'accent_theme' ? (
                <div className="flex gap-2 items-center">
                  <select
                    className="owner-input text-[11px]"
                    value={settingEdits[s.key] ?? s.value ?? ''}
                    onChange={e => setSettingEdits(p => ({ ...p, [s.key]: e.target.value }))}
                  >
                    {['cyber','emerald','crimson','solar','dark'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <button onClick={() => saveSetting(s.key)} disabled={working === 'setting-' + s.key} className="owner-btn-amber">
                    {working === 'setting-' + s.key ? '…' : 'Save'}
                  </button>
                </div>
              ) : (
                <div className="flex gap-2 items-center">
                  <input
                    className="owner-input text-[11px] w-48"
                    value={settingEdits[s.key] ?? s.value ?? ''}
                    onChange={e => setSettingEdits(p => ({ ...p, [s.key]: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && saveSetting(s.key)}
                  />
                  <button onClick={() => saveSetting(s.key)} disabled={working === 'setting-' + s.key} className="owner-btn-amber">
                    {working === 'setting-' + s.key ? '…' : 'Save'}
                  </button>
                </div>
              )}
            </div>
          ))}

          {/* Custom CSS */}
          <div className="neon-card px-5 py-4 space-y-3">
            <p className="text-sm font-medium text-zinc-200">Custom Global CSS</p>
            <textarea
              className="owner-input w-full h-36 resize-y font-mono text-[11px]"
              placeholder="/* Injected into every page */ body { --accent: #a78bfa; }"
              value={customCss}
              onChange={e => setCustomCss(e.target.value)}
            />
            <button onClick={saveCustomCss} disabled={working === 'setting-custom_css'} className="owner-btn-amber">
              {working === 'setting-custom_css' ? '…' : 'Inject CSS'}
            </button>
          </div>
        </div>
      )}

      {/* ── WORD FILTERS ── */}
      {tab === 'wordfilters' && (
        <div className="space-y-6">
          <div className="neon-card p-5 space-y-3">
            <h3 className="text-sm font-semibold text-zinc-200">Add Word Filter</h3>
            <p className="mono text-[10px] text-zinc-600">Patterns are matched case-insensitively. Use regex syntax for flexibility.</p>
            <div className="flex gap-2 flex-wrap">
              <input
                className="owner-input flex-1 min-w-[180px]"
                placeholder="word or pattern"
                value={filterPattern}
                onChange={e => setFilterPattern(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addWordFilter()}
              />
              <select className="owner-input w-24" value={filterAction} onChange={e => setFilterAction(e.target.value as 'flag' | 'mute' | 'ban')}>
                <option value="flag">flag</option>
                <option value="mute">mute</option>
                <option value="ban">ban</option>
              </select>
              <button onClick={addWordFilter} disabled={working === 'wf-add'} className="owner-btn-amber">
                {working === 'wf-add' ? '…' : 'Add'}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            {filters.length === 0 && <p className="mono text-xs text-zinc-700 py-6 text-center">No filters yet.</p>}
            {filters.map(f => (
              <div key={f.id} className="neon-card flex items-center gap-3 px-4 py-3">
                <p className="mono text-sm text-zinc-200 flex-1 truncate">{f.pattern}</p>
                <span className={`mono text-[9px] border rounded-full px-2 py-0.5 ${
                  f.action === 'ban' ? 'border-red-500/25 text-red-400' :
                  f.action === 'mute' ? 'border-amber-500/25 text-amber-400' :
                  'border-zinc-700/40 text-zinc-500'
                }`}>{f.action}</span>
                <p className="mono text-[9px] text-zinc-700 hidden sm:block">{new Date(f.created_at).toLocaleDateString()}</p>
                <button
                  onClick={() => removeWordFilter(f.pattern)}
                  disabled={working === 'wf-del-' + f.pattern}
                  className="mono text-[9px] px-2 py-1 rounded-lg border border-red-500/20 text-red-500/60 hover:bg-red-500/10 transition-colors"
                >{working === 'wf-del-' + f.pattern ? '…' : 'Remove'}</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── DANGER ZONE ── */}
      {tab === 'danger' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-red-500/20 bg-red-500/[0.04] px-4 py-3 mono text-[10px] text-red-400/80">
            ⚠ These controls have immediate, site-wide effects. They cannot be undone except manually.
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {/* Emergency lock */}
            <div className="neon-card p-5 space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-zinc-200">Emergency Lock</h3>
                <p className="mono text-[10px] text-zinc-600 mt-1">Blocks all non-owner access to the platform instantly.</p>
              </div>
              <button
                onClick={toggleEmergencyLock}
                className={`w-full mono text-xs rounded-xl px-4 py-3 border transition-all font-semibold ${
                  emergencyLock
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
                    : 'bg-red-500/10 border-red-500/30 text-red-300 hover:bg-red-500/20'
                }`}
              >{emergencyLock ? '🔓 Deactivate Lock' : '🔒 Activate Emergency Lock'}</button>
            </div>

            {/* Force logout all */}
            <div className="neon-card p-5 space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-zinc-200">Force Logout All</h3>
                <p className="mono text-[10px] text-zinc-600 mt-1">Invalidates all active user sessions across the platform.</p>
              </div>
              <button
                onClick={forceLogoutAll}
                disabled={working === 'logout-all'}
                className="w-full mono text-xs rounded-xl px-4 py-3 border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20 transition-all font-semibold"
              >{working === 'logout-all' ? '…' : '⏏ Force Logout Everyone'}</button>
            </div>

            {/* Maintenance mode */}
            <div className="neon-card p-5 space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-zinc-200">Maintenance Mode</h3>
                <p className="mono text-[10px] text-zinc-600 mt-1">Shows a maintenance banner to regular users.</p>
              </div>
              <button
                onClick={toggleMaintenanceMode}
                className={`w-full mono text-xs rounded-xl px-4 py-3 border transition-all font-semibold ${
                  maintenanceMode
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                }`}
              >{maintenanceMode ? '✓ Disable Maintenance Mode' : '⚙ Enable Maintenance Mode'}</button>
            </div>

            {/* Database export placeholder */}
            <div className="neon-card p-5 space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-zinc-200">Data Export</h3>
                <p className="mono text-[10px] text-zinc-600 mt-1">Export profiles and ban list as JSON.</p>
              </div>
              <button
                onClick={() => {
                  const blob = new Blob([JSON.stringify({ profiles, bans, flags, settings }, null, 2)], { type: 'application/json' })
                  const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
                  a.download = `alhekma-export-${Date.now()}.json`; a.click()
                }}
                className="w-full mono text-xs rounded-xl px-4 py-3 border border-violet-500/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 transition-all font-semibold"
              >⬇ Export JSON</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .neon-card {
          background: rgba(9,9,11,0.85);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 1rem;
          box-shadow: 0 0 0 1px rgba(251,191,36,0.04), inset 0 1px 0 0 rgba(255,255,255,0.04);
        }
        .owner-input {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 0.625rem;
          padding: 0.4rem 0.75rem;
          font-size: 0.75rem;
          color: #e4e4e7;
          outline: none;
          transition: border-color 0.15s;
        }
        .owner-input:focus { border-color: rgba(251,191,36,0.35); }
        .owner-input::placeholder { color: #52525b; }
        .owner-btn-amber {
          background: rgba(251,191,36,0.1);
          border: 1px solid rgba(251,191,36,0.25);
          border-radius: 0.625rem;
          padding: 0.4rem 1rem;
          font-size: 0.7rem;
          font-family: monospace;
          color: #fcd34d;
          cursor: pointer;
          transition: all 0.15s;
          white-space: nowrap;
        }
        .owner-btn-amber:hover { background: rgba(251,191,36,0.18); }
        .owner-btn-amber:disabled { opacity: 0.4; cursor: default; }
        .owner-btn-red {
          background: rgba(239,68,68,0.1);
          border: 1px solid rgba(239,68,68,0.25);
          border-radius: 0.625rem;
          padding: 0.4rem 1rem;
          font-size: 0.7rem;
          font-family: monospace;
          color: #fca5a5;
          cursor: pointer;
          transition: all 0.15s;
          white-space: nowrap;
        }
        .owner-btn-red:hover { background: rgba(239,68,68,0.18); }
        .owner-btn-red:disabled { opacity: 0.4; cursor: default; }
        .owner-btn-emerald {
          background: rgba(16,185,129,0.1);
          border: 1px solid rgba(16,185,129,0.25);
          border-radius: 0.625rem;
          padding: 0.4rem 1rem;
          font-size: 0.7rem;
          font-family: monospace;
          color: #6ee7b7;
          cursor: pointer;
          transition: all 0.15s;
          white-space: nowrap;
        }
        .owner-btn-emerald:hover { background: rgba(16,185,129,0.18); }
        .owner-btn-emerald:disabled { opacity: 0.4; cursor: default; }
      `}</style>
    </div>
  )
}
