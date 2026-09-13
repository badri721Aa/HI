'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Status = 'checking' | 'ok' | 'degraded' | 'error'

export function TelemetryBar() {
  const [dbStatus, setDbStatus] = useState<Status>('checking')
  const [pingMs, setPingMs] = useState<number | null>(null)
  const [onlineCount, setOnlineCount] = useState<number>(0)
  const [realtimeStatus, setRealtimeStatus] = useState<Status>('checking')
  const [role, setRole] = useState<string | null>(null)

  useEffect(() => {
    const sb = createClient()

    // Get current user role
    sb.auth.getUser().then(async ({ data }) => {
      if (!data.user) return
      const { data: profile } = await sb.from('profiles').select('role').eq('id', data.user.id).single()
      setRole(profile?.role ?? 'user')
    })

    // Ping health endpoint
    async function ping() {
      try {
        const t = Date.now()
        const res = await fetch('/api/health')
        const ms = Date.now() - t
        setPingMs(ms)
        setDbStatus(res.ok ? 'ok' : 'degraded')
      } catch {
        setDbStatus('error')
      }
    }
    ping()
    const pingInterval = setInterval(ping, 30_000)

    // Realtime presence for online count
    const channel = sb.channel('telemetry-presence', {
      config: { presence: { key: 'anon' } },
    })
    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        setOnlineCount(Object.keys(state).length)
        setRealtimeStatus('ok')
      })
      .subscribe(status => {
        if (status === 'SUBSCRIBED') {
          channel.track({ at: Date.now() })
          setRealtimeStatus('ok')
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setRealtimeStatus('error')
        }
      })

    return () => {
      clearInterval(pingInterval)
      sb.removeChannel(channel)
    }
  }, [])

  const statusDot = (s: Status) => {
    if (s === 'ok') return <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.6)]" />
    if (s === 'degraded') return <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_4px_rgba(251,191,36,0.6)]" />
    if (s === 'error') return <span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-400 shadow-[0_0_4px_rgba(251,113,133,0.6)]" />
    return <span className="inline-block w-1.5 h-1.5 rounded-full bg-zinc-600 animate-pulse" />
  }

  const roleColor = role === 'owner' ? 'text-amber-400' : role === 'admin' ? 'text-violet-400' : 'text-zinc-600'

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-between px-4 py-1.5 border-t border-white/[0.04]"
      style={{
        background: 'rgba(9,9,11,0.85)',
        backdropFilter: 'blur(20px)',
        boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.04)',
      }}
    >
      {/* Left: system status */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-600">
          {statusDot(dbStatus)}
          <span>DB</span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-600">
          {statusDot(realtimeStatus)}
          <span>RT</span>
        </div>
        {pingMs !== null && (
          <span className="text-[10px] font-mono text-zinc-700">{pingMs}ms</span>
        )}
      </div>

      {/* Center: online count */}
      <div className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-700">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        <span>{onlineCount} online</span>
      </div>

      {/* Right: role badge + cmd+k hint */}
      <div className="flex items-center gap-3">
        {role && (
          <span className={`text-[10px] font-mono uppercase tracking-wider ${roleColor}`}>
            {role}
          </span>
        )}
        <kbd className="hidden sm:flex items-center gap-0.5 font-mono text-[9px] text-zinc-700 border border-white/[0.05] rounded px-1.5 py-0.5">
          ⌘K
        </kbd>
      </div>
    </div>
  )
}
