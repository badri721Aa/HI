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

      if (admin) {
        fetchData()
      }
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
    await sb.from('admins').insert({ email: newAdmin.trim().toLowerCase() })
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

  async function unbanUser(name: string) {
    await sb.from('banned_users').delete().eq('name', name)
  }

  async function sendBroadcast() {
    if (!broadcast.trim()) return
    await sb.from('news').insert({ message: broadcast.trim(), pinned: true })
    setBroadcast('')
    setBroadcastSent(true)
    setTimeout(() => setBroadcastSent(false), 3000)
  }

  async function deleteUserMessages(userId: string) {
    // Delete by user lookup — this is a troll action
    const profile = users.find(u => u.id === userId)
    if (!profile) return
    await sb.from('chat_messages').delete().eq('user_name', profile.display_name)
    alert('Messages deleted.')
  }

  if (loading) return <div className="min-h-screen pt-14 flex items-center justify-center"><div className="mono text-xs text-white/30">Loading...</div></div>

  if (!user) {
    return (
      <div className="min-h-screen pt-14 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="mono text-xs text-white/30">Not signed in</div>
          <a href="/auth/login" className="glass px-4 py-2 rounded-xl text-sm text-white/60 hover:text-white">Sign in →</a>
        </div>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen pt-14 flex items-center justify-center">
        <div className="text-center space-y-2">
          <div className="mono text-3xl text-white/10">403</div>
          <div className="text-sm text-white/30">Admins only.</div>
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
    <div className="min-h-screen pt-14 max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="mono text-[10px] tracking-widest text-white/20 uppercase mb-1">control panel</div>
        <h1 className="text-2xl font-light text-white flex items-center gap-3">
          Admin Panel
          {isOwner(user.email ?? '') && (
            <span className="mono text-xs text-amber-400/70 border border-amber-500/20 rounded-full px-2 py-0.5">Owner</span>
          )}
        </h1>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 p-1 glass rounded-xl w-fit">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as typeof tab)}
            className={'px-4 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ' +
              (tab === t.id
                ? 'bg-white/12 text-white border border-white/15'
                : 'text-white/40 hover:text-white/70')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Users tab */}
      {tab === 'users' && (
        <div className="space-y-4">
          <div className="mono text-xs text-white/30">{users.length} registered users</div>
          <div className="space-y-2">
            {users.map(u => (
              <div key={u.id} className="glass rounded-xl px-4 py-3 flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-white/8 border border-white/10 flex items-center justify-center text-[10px] font-semibold text-white/50 flex-shrink-0">
                  {(u.display_name || u.email || 'A')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white/80 truncate">{u.display_name || 'Unnamed'}</div>
                  <div className="mono text-[10px] text-white/30 truncate">{u.email}</div>
                </div>
                <div className="mono text-[9px] text-white/20">
                  {new Date(u.created_at).toLocaleDateString()}
                </div>
              </div>
            ))}
            {users.length === 0 && (
              <div className="mono text-xs text-white/20 text-center py-8">No users yet</div>
            )}
          </div>
        </div>
      )}

      {/* Admins tab — owner only */}
      {tab === 'admins' && (
        <div className="space-y-6">
          {isOwner(user.email ?? '') && (
            <div className="glass rounded-2xl p-5 space-y-3">
              <div className="text-sm font-medium text-white/80">Add admin by email</div>
              <div className="flex gap-2">
                <Input
                  placeholder="user@alhekma.com"
                  value={newAdmin}
                  onChange={e => setNewAdmin(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addAdmin()}
                />
                <Button onClick={addAdmin} className="flex-shrink-0">Add</Button>
              </div>
            </div>
          )}
          <div className="space-y-2">
            {admins.map(a => (
              <div key={a.id} className="glass rounded-xl px-4 py-3 flex items-center gap-3">
                <div className="flex-1 mono text-sm text-white/70">{a.email}</div>
                <div className="mono text-[9px] text-white/20">{new Date(a.created_at).toLocaleDateString()}</div>
                {isOwner(user.email ?? '') && (
                  <button
                    onClick={() => removeAdmin(a.email)}
                    className="text-xs text-red-400/60 hover:text-red-400 transition-colors"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
            {admins.length === 0 && <div className="mono text-xs text-white/20 text-center py-8">No admins added</div>}
          </div>
        </div>
      )}

      {/* Broadcast tab */}
      {tab === 'broadcast' && (
        <div className="glass rounded-2xl p-5 space-y-4">
          <div>
            <div className="text-sm font-medium text-white/80 mb-1">Broadcast to everyone</div>
            <div className="text-xs text-white/30">Posted as pinned news — visible to all users in real-time</div>
          </div>
          <textarea
            className="w-full h-32 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/30 backdrop-blur-sm transition-all duration-200 focus:border-white/30 focus:bg-white/10 focus:outline-none resize-none"
            placeholder="Your message to everyone..."
            value={broadcast}
            onChange={e => setBroadcast(e.target.value)}
            maxLength={500}
          />
          <div className="flex items-center gap-3">
            <Button onClick={sendBroadcast} variant="gold" disabled={!broadcast.trim()}>
              Broadcast
            </Button>
            {broadcastSent && <span className="text-xs text-emerald-400 mono">Sent!</span>}
          </div>
        </div>
      )}

      {/* Ban tab */}
      {tab === 'ban' && (
        <div className="glass rounded-2xl p-5 space-y-4">
          <div className="text-sm font-medium text-white/80">Ban a user by email</div>
          <div className="flex gap-2">
            <Input
              placeholder="user@alhekma.com"
              value={banTarget}
              onChange={e => setBanTarget(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && banUser()}
            />
            <Button onClick={banUser} variant="danger" className="flex-shrink-0">Ban</Button>
          </div>
          <div className="mono text-xs text-white/20">Banned users cannot send chat messages.</div>
        </div>
      )}

      {/* Troll tab — owner only */}
      {tab === 'troll' && isOwner(user.email ?? '') && (
        <div className="space-y-4">
          <div className="mono text-[10px] text-white/20 uppercase tracking-widest mb-2">Owner tools</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="glass rounded-2xl p-5 space-y-3">
              <div className="text-sm font-medium text-white/80">Delete user chat history</div>
              <select
                className="w-full h-10 rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white/70 focus:outline-none"
                onChange={e => e.target.value && deleteUserMessages(e.target.value)}
                defaultValue=""
              >
                <option value="">Select user...</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.display_name || u.email}</option>
                ))}
              </select>
            </div>
            <div className="glass rounded-2xl p-5 space-y-3">
              <div className="text-sm font-medium text-white/80">Clear all chat</div>
              <div className="text-xs text-white/30">Wipes every message in the public chat</div>
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
            <div className="glass rounded-2xl p-5 space-y-3">
              <div className="text-sm font-medium text-white/80">Broadcast fake announcement</div>
              <div className="text-xs text-white/30">Post a mystery message to news feed</div>
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
            <div className="glass rounded-2xl p-5 space-y-3">
              <div className="text-sm font-medium text-white/80">Database stats</div>
              <div className="space-y-1">
                <div className="mono text-xs text-white/40">{users.length} users registered</div>
                <div className="mono text-xs text-white/40">{admins.length} admins assigned</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
