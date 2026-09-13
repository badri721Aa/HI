'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import { isOwner } from '@/lib/utils'
import Link from 'next/link'

interface OnlineUser { user_id: string; user_name: string; online_at: number }

const FAKE_ERRORS = [
  'SYSTEM ERROR: Network breach detected — your session has been flagged.',
  'WARNING: Unauthorized access detected. Security team has been notified.',
  'CRITICAL: Database corruption detected. All data may be lost.',
  'ALERT: Your account has been temporarily suspended for suspicious activity.',
  'PANIC: Memory overflow. Page state is corrupted. Please reload immediately.',
]

const TROLL_MESSAGES = [
  'ALERT: The system is watching. Act normal.',
  'All hacks have been reset. Back to zero.',
  'IT department is monitoring chat in real-time.',
  'Server maintenance in 2 minutes. Save your work NOW.',
  'Session timeout in 30 seconds due to suspicious activity.',
]

export default function TrollPanelPage() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [online, setOnline] = useState<OnlineUser[]>([])
  const [target, setTarget] = useState<string>('all')
  const [lastAction, setLastAction] = useState('')
  const sb = createClient()

  useEffect(() => {
    sb.auth.getUser().then(async ({ data }) => {
      const u = data.user
      setUser(u)
      if (!u || !isOwner(u.email ?? '')) { setLoading(false); return }

      // Track online users via presence
      const ch = sb.channel('chat-presence', { config: { presence: { key: u.id } } })
        .on('presence', { event: 'sync' }, () => {
          const state = ch.presenceState<OnlineUser>()
          setOnline(Object.values(state).flat().filter(o => o.user_id !== u.id))
        })
        .subscribe(async (s) => {
          if (s === 'SUBSCRIBED') await ch.track({ user_id: u.id, user_name: 'owner', online_at: Date.now() })
        })

      setLoading(false)
      return () => { sb.removeChannel(ch) }
    })
  }, [])

  async function dispatch(event: string, payload: Record<string, unknown> = {}) {
    const trollCh = sb.channel('troll-engine')
    await trollCh.subscribe()
    await trollCh.send({
      type: 'broadcast',
      event,
      payload: { target, ...payload },
    })
    sb.removeChannel(trollCh)
    setLastAction(`${event} → ${target === 'all' ? 'everyone' : online.find(o => o.user_id === target)?.user_name ?? target}`)
    await sb.rpc('log_admin_action', {
      p_action: `troll_${event}`,
      p_payload: { target, ...payload },
    })
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

  return (
    <div className="mx-auto max-w-4xl px-6 pt-28 pb-20">
      <div className="mb-10">
        <div className="mb-3 flex items-center gap-2">
          <Link href="/admin" className="mono text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors">← Admin</Link>
          <span className="h-px w-4 bg-zinc-800" />
          <span className="mono text-[10px] tracking-[0.15em] text-rose-600/70 uppercase">Owner Only</span>
        </div>
        <h1 className="font-nacelle text-3xl font-semibold text-zinc-100 tracking-tight">Troll Engine</h1>
        <p className="mt-2 text-sm text-zinc-500">Real-time targeted effects via Supabase Broadcast.</p>
      </div>

      {/* Target selector */}
      <div className="glass-card rounded-2xl p-5 mb-6 space-y-3">
        <div className="mono text-[10px] tracking-[0.15em] text-zinc-600 uppercase">Target</div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setTarget('all')}
            className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition-all active:scale-[0.98] ${
              target === 'all'
                ? 'border-rose-500/30 bg-rose-500/[0.1] text-rose-400'
                : 'border-white/[0.08] bg-white/[0.03] text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Everyone ({online.length} online)
          </button>
          {online.map(o => (
            <button
              key={o.user_id}
              onClick={() => setTarget(o.user_id)}
              className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition-all active:scale-[0.98] ${
                target === o.user_id
                  ? 'border-rose-500/30 bg-rose-500/[0.1] text-rose-400'
                  : 'border-white/[0.08] bg-white/[0.03] text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {o.user_name}
            </button>
          ))}
        </div>
        {online.length === 0 && (
          <p className="mono text-xs text-zinc-700">No users online right now (other than you).</p>
        )}
      </div>

      {/* Action grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <TrollCard
          title="Screen Shake"
          desc="Applies a violent CSS shake animation to the target's page."
          color="amber"
          icon="💥"
          onFire={() => dispatch('shake')}
        />
        <TrollCard
          title="Fake Error Toast"
          desc="Displays a hyper-realistic system panic banner."
          color="rose"
          icon="🚨"
          onFire={() => dispatch('fake-error', { msg: FAKE_ERRORS[Math.floor(Math.random() * FAKE_ERRORS.length)] })}
        />
        <TrollCard
          title="Gravity Flip"
          desc="Flips the entire page upside down for 5 seconds."
          color="violet"
          icon="🙃"
          onFire={() => dispatch('gravity-flip')}
        />
        <TrollCard
          title="Rickroll"
          desc="Opens a new browser tab to an unexpected destination."
          color="amber"
          icon="🎵"
          onFire={() => dispatch('rickroll', { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' })}
        />
        <TrollCard
          title="Audio Jumpscare"
          desc="Plays a synthetic alarm sound via WebAudio API."
          color="rose"
          icon="🔊"
          onFire={() => dispatch('audio', { type: 'alarm' })}
        />
        <TrollCard
          title="News Troll Drop"
          desc="Posts a mysterious panic announcement to the news feed."
          color="zinc"
          icon="📢"
          onFire={async () => {
            const m = TROLL_MESSAGES[Math.floor(Math.random() * TROLL_MESSAGES.length)]
            await sb.from('news').insert({ message: m, pinned: false })
            setLastAction(`news_drop → public feed`)
          }}
        />
        <TrollCard
          title="Cursor Chaos"
          desc="Makes cursor movement inverted and jittery for 8 seconds."
          color="violet"
          icon="🖱️"
          onFire={() => dispatch('cursor-chaos')}
        />
        <TrollCard
          title="Matrix Rain"
          desc="Overlays a full-screen Matrix-style rain animation for 6s."
          color="emerald"
          icon="🟩"
          onFire={() => dispatch('matrix')}
        />
        <TrollCard
          title="Clear All Chat"
          desc="Permanently wipes every message in the public chat."
          color="rose"
          icon="🗑️"
          onFire={async () => {
            if (!confirm('Clear ALL chat messages permanently?')) return
            await sb.from('chat_messages').delete().neq('id', '00000000-0000-0000-0000-000000000000')
            setLastAction('clear_chat → all messages deleted')
          }}
        />
      </div>

      {lastAction && (
        <div className="mt-6 glass-card rounded-xl px-4 py-3 mono text-xs text-emerald-400">
          ✓ Fired: {lastAction}
        </div>
      )}
    </div>
  )
}

function TrollCard({
  title, desc, color, icon, onFire,
}: { title: string; desc: string; color: string; icon: string; onFire: () => void }) {
  const colors: Record<string, string> = {
    amber: 'border-amber-500/20 bg-amber-500/[0.04] hover:bg-amber-500/[0.08]',
    rose: 'border-rose-500/20 bg-rose-500/[0.04] hover:bg-rose-500/[0.08]',
    violet: 'border-violet-500/20 bg-violet-500/[0.04] hover:bg-violet-500/[0.08]',
    emerald: 'border-emerald-500/20 bg-emerald-500/[0.04] hover:bg-emerald-500/[0.08]',
    zinc: 'border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.06]',
  }
  const btnColors: Record<string, string> = {
    amber: 'border-amber-500/25 bg-amber-500/[0.08] text-amber-400 hover:bg-amber-500/[0.14]',
    rose: 'border-rose-500/20 bg-rose-500/[0.07] text-rose-400 hover:bg-rose-500/[0.12]',
    violet: 'border-violet-500/20 bg-violet-500/[0.07] text-violet-400 hover:bg-violet-500/[0.12]',
    emerald: 'border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-400 hover:bg-emerald-500/[0.14]',
    zinc: 'border-white/[0.09] bg-white/[0.05] text-zinc-200 hover:bg-white/[0.09]',
  }

  return (
    <div className={`glass-card rounded-2xl p-5 space-y-3 border transition-all duration-200 ${colors[color]}`}>
      <div className="flex items-center gap-2">
        <span className="text-xl">{icon}</span>
        <p className="text-sm font-semibold text-zinc-200 tracking-tight">{title}</p>
      </div>
      <p className="text-xs text-zinc-500 leading-relaxed">{desc}</p>
      <button
        onClick={onFire}
        className={`flex h-8 w-full items-center justify-center rounded-xl border text-xs font-medium transition-all duration-200 active:scale-[0.98] ${btnColors[color]}`}
      >
        Fire
      </button>
    </div>
  )
}
