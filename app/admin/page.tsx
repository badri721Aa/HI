'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import { isOwner } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface Profile {
  id: string
  email: string
  display_name: string
  created_at: string
}

interface Admin {
  id: string
  email: string
  created_at: string
}

export default function AdminPage() {
  const [user, setUser] = useState<User | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<Profile[]>([])
  const [admins, setAdmins] = useState<Admin[]>([])
  const [newAdmin, setNewAdmin] = useState('')
  const [banTarget, setBanTarget] = useState('')
  const [broadcast, setBroadcast] = useState('')
  const [broadcastSent, setBroadcastSent] = useState(false)
  const [tab, setTab] = useState<'users' | 'admins' | 'broadcast' | 'troll' | 'ban'>('users')
  const sb = createClient()

  useEffect(() => {
    sb.auth.getUser().then(async ({ data }) => {
      const u = data.user
      setUser(u)
      if (!u) { setLoading(false); return }

      const owner = isOwner(u.email ?? '')
      let admin = owner
      if (!owner) {
        const { data: ad } = await sb.from('admins').select('email').eq('email', u.email).single()
        admin = !!ad
      }
      setIsAdmin(admin)
      if (admin) fetchData()
      setLoading(false)
    })
  }, [])

  async function fetchData() {
    const [{ data: u }, { data: a }] = await Promise.all([
      sb.from('profiles').select('*').order('created_at', { ascending: false }),
      sb.from('admins').select('*').order('created_at', { ascending: false }),
    ])
    if (u) setUsers(u)
    if (a) setAdmins(a)
  }

  async function addAdmin() {
    if (!newAdmin.trim()) return
    await sb.from('admins').insert({ email: newAdmin.trim().toLowerCase(), added_by: user?.email ?? 'owner' })
    setNewAdmin('')
    fetchData()
  }

  async function removeAdmin(email: string) {
    await sb.from('admins').delete().eq('email', email)
    fetchData()
  }

  async function banUser() {
    if (!banTarget.trim()) return
    await sb.from('banned_users').insert({ name: banTarget.trim().toLowerCase() })
    setBanTarget('')
  }

  async function sendBroadcast() {
    if (!broadcast.trim()) return
    await sb.from('news').insert({ message: broadcast.trim(), pinned: true })
    setBroadcast('')
    setBroadcastSent(true)
    setTimeout(() => setBroadcastSent(false), 3000)
  }

  async function deleteUserMessages(userId: string) {
    const profile = users.find(u => u.id === userId)
    if (!profile) return
    await sb.from('chat_messages').delete().eq('user_name', profile.display_name)
    alert('Messages deleted.')
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center pt-14">
        <p className="mono text-xs text-zinc-600">Loading...</p>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center pt-14">
        <div className="space-y-3 text-center">
          <p className="mono text-xs text-zinc-600">Not signed in</p>
          <a
            href="/auth/login"
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 text-sm text-zinc-400 transition-all duration-200 hover:bg-white/[0.07] hover:text-zinc-200"
          >
            Sign in →
          </a>
        </div>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center pt-14">
        <div className="space-y-2 text-center">
          <p className="font-nacelle text-5xl font-semibold text-zinc-800">403</p>
          <p className="text-sm text-zinc-600">Admins only.</p>
        </div>
      </div>
    )
  }

  const tabs = [
    { id: 'users', label: 'Users' },
    { id: 'admins', label: 'Admins' },
    { id: 'broadcast', label: 'Broadcast' },
    { id: 'ban', label: 'Ban' },
    ...(isOwner(user.email ?? '') ? [{ id: 'troll', label: 'Troll' }] : []),
  ] as const

  return (
    <div className="mx-auto max-w-4xl px-6 pt-28 pb-20">
      {/* Header */}
      <div className="mb-10">
        <div className="mb-3 flex items-center gap-2">
          <span className="h-px w-4 bg-zinc-800" />
          <span className="mono text-[10px] tracking-[0.15em] text-zinc-600 uppercase">Control Panel</span>
        </div>
        <div className="flex items-center gap-3">
          <h1 className="font-nacelle text-3xl font-semibold text-zinc-100 tracking-tight">Admin Panel</h1>
          {isOwner(user.email ?? '') && (
            <span className="mono text-[10px] border border-amber-500/25 bg-amber-500/[0.08] text-amber-400 rounded-full px-2 py-0.5">
              Owner
            </span>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="mb-8 flex items-center gap-1 rounded-xl glass-card p-1 w-fit">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as typeof tab)}
            className={
              'rounded-lg px-4 py-1.5 text-xs font-medium transition-all duration-200 ease-out active:scale-[0.98] ' +
              (tab === t.id
                ? 'bg-zinc-700/60 border border-white/[0.1] text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-300')
            }
          >
            {t.label}
          </button>
        ))}
      </div>

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
                <span className="mono text-[9px] text-zinc-700">
                  {new Date(u.created_at).toLocaleDateString()}
                </span>
              </div>
            ))}
            {users.length === 0 && (
              <p className="py-8 text-center mono text-xs text-zinc-700">No users yet</p>
            )}
          </div>
        </div>
      )}

      {/* Admins */}
      {tab === 'admins' && (
        <div className="space-y-6">
          {isOwner(user.email ?? '') && (
            <div className="glass-card rounded-2xl p-5 space-y-3">
              <p className="text-sm font-semibold text-zinc-200 tracking-tight">Add admin by email</p>
              <div className="flex gap-2">
                <Input
                  placeholder="user@alhekma.com"
                  value={newAdmin}
                  onChange={e => setNewAdmin(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addAdmin()}
                />
                <Button variant="solid" onClick={addAdmin} className="flex-shrink-0">Add</Button>
              </div>
            </div>
          )}
          <div className="space-y-2">
            {admins.map(a => (
              <div key={a.id} className="glass-card flex items-center gap-3 rounded-xl px-4 py-3">
                <p className="mono flex-1 text-sm text-zinc-300">{a.email}</p>
                <span className="mono text-[9px] text-zinc-700">{new Date(a.created_at).toLocaleDateString()}</span>
                {isOwner(user.email ?? '') && (
                  <button
                    onClick={() => removeAdmin(a.email)}
                    className="text-xs text-rose-500/60 hover:text-rose-400 transition-colors duration-200"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
            {admins.length === 0 && (
              <p className="py-8 text-center mono text-xs text-zinc-700">No admins added</p>
            )}
          </div>
        </div>
      )}

      {/* Broadcast */}
      {tab === 'broadcast' && (
        <div className="glass-card rounded-2xl p-5 space-y-4">
          <div>
            <p className="text-sm font-semibold text-zinc-200 tracking-tight">Broadcast to everyone</p>
            <p className="mt-1 text-xs text-zinc-600">Posted as pinned news — visible to all users in real-time</p>
          </div>
          <textarea
            className="w-full h-32 resize-none rounded-xl border border-white/[0.08] bg-zinc-900/60 px-4 py-3 text-sm text-zinc-200 placeholder:text-zinc-600 transition-all duration-200 focus:border-white/[0.18] focus:outline-none shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]"
            placeholder="Your message to everyone..."
            value={broadcast}
            onChange={e => setBroadcast(e.target.value)}
            maxLength={500}
          />
          <div className="flex items-center gap-3">
            <Button variant="gold" onClick={sendBroadcast} disabled={!broadcast.trim()}>
              Broadcast
            </Button>
            {broadcastSent && <span className="mono text-xs text-emerald-400">Sent!</span>}
          </div>
        </div>
      )}

      {/* Ban */}
      {tab === 'ban' && (
        <div className="glass-card rounded-2xl p-5 space-y-4">
          <p className="text-sm font-semibold text-zinc-200 tracking-tight">Ban a user by email</p>
          <div className="flex gap-2">
            <Input
              placeholder="user@alhekma.com"
              value={banTarget}
              onChange={e => setBanTarget(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && banUser()}
            />
            <Button variant="danger" onClick={banUser} className="flex-shrink-0">Ban</Button>
          </div>
          <p className="mono text-xs text-zinc-700">Banned users cannot send chat messages.</p>
        </div>
      )}

      {/* Troll — owner only */}
      {tab === 'troll' && isOwner(user.email ?? '') && (
        <div className="space-y-4">
          <p className="mono text-[10px] tracking-[0.15em] text-zinc-600 uppercase mb-2">Owner tools</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="glass-card rounded-2xl p-5 space-y-3">
              <p className="text-sm font-semibold text-zinc-200 tracking-tight">Delete user chat history</p>
              <select
                className="w-full h-10 rounded-xl border border-white/[0.08] bg-zinc-900/60 px-3 text-sm text-zinc-300 focus:outline-none focus:border-white/[0.18] transition-all duration-200"
                onChange={e => e.target.value && deleteUserMessages(e.target.value)}
                defaultValue=""
              >
                <option value="">Select user...</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.display_name || u.email}</option>
                ))}
              </select>
            </div>
            <div className="glass-card rounded-2xl p-5 space-y-3">
              <p className="text-sm font-semibold text-zinc-200 tracking-tight">Clear all chat</p>
              <p className="text-xs text-zinc-600">Wipes every message in the public chat</p>
              <Button
                variant="danger"
                onClick={async () => {
                  if (confirm('Clear ALL chat messages?')) {
                    await sb.from('chat_messages').delete().neq('id', '00000000-0000-0000-0000-000000000000')
                  }
                }}
              >
                Clear chat
              </Button>
            </div>
            <div className="glass-card rounded-2xl p-5 space-y-3">
              <p className="text-sm font-semibold text-zinc-200 tracking-tight">Broadcast fake announcement</p>
              <p className="text-xs text-zinc-600">Post a mystery message to news feed</p>
              <Button
                variant="gold"
                onClick={async () => {
                  const msgs = [
                    'ALERT: The system is watching. Act normal.',
                    'All hacks have been reset. Back to zero.',
                    'IT department is monitoring chat. Stay safe.',
                    'Server maintenance in 5 minutes. Save your work.',
                  ]
                  const m = msgs[Math.floor(Math.random() * msgs.length)]
                  await sb.from('news').insert({ message: m, pinned: false })
                }}
              >
                Random troll drop
              </Button>
            </div>
            <div className="glass-card rounded-2xl p-5 space-y-3">
              <p className="text-sm font-semibold text-zinc-200 tracking-tight">Database stats</p>
              <div className="space-y-1.5">
                <p className="mono text-xs text-zinc-500">{users.length} users registered</p>
                <p className="mono text-xs text-zinc-500">{admins.length} admins assigned</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
