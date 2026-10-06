'use client'

import * as React from 'react'
import Link from 'next/link'
import { useCall, type OnlineUser } from '@/components/call-provider'

/**
 * Dedicated calling page.
 *
 * Lists everyone currently online on the platform and offers a 1-click
 * video call button for each. Uses the shared CallProvider so an incoming
 * call reaches you here (and anywhere else on the site) via the global
 * overlay.
 */

export default function CallPage() {
  const { me, online, call, callUser, hangup } = useCall()

  const [query, setQuery] = React.useState('')
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => { setMounted(true) }, [])

  // Signed-out gate
  if (mounted && !me) {
    return (
      <div className="fixed inset-0 flex items-center justify-center px-6 pt-20">
        <div className="aurora" />
        <div className="relative text-center space-y-4" style={{ animation: 'fade-in .4s ease-out' }}>
          <div className="inline-flex items-center gap-2 rounded-full px-3 py-1" style={{
            background: 'rgba(16,185,129,0.08)',
            border: '1px solid rgba(16,185,129,0.22)',
          }}>
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <span className="font-mono text-[10px] text-emerald-300 uppercase tracking-[0.2em]">Calls</span>
          </div>
          <h1 className="font-nacelle text-3xl font-semibold text-zinc-100 tracking-tight">Sign in to call</h1>
          <p className="text-sm text-zinc-500 max-w-sm">
            Peer-to-peer video calls require an account so other users know who&apos;s ringing them.
          </p>
          <Link href="/auth/login" className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-zinc-950 transition-all hover:brightness-110 active:scale-[0.98]" style={{
            background: 'linear-gradient(180deg, #FAFAFA 0%, #E4E4E7 100%)',
            boxShadow: '0 0 0 1px rgba(255,255,255,0.15), 0 12px 32px rgba(0,0,0,0.5), inset 0 1px 0 0 rgba(255,255,255,0.4)',
          }}>
            Sign in →
          </Link>
        </div>
      </div>
    )
  }

  // Exclude self + apply filter
  const others = online
    .filter(u => u.user_id !== me?.id)
    .filter(u => !query.trim() || u.user_name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => a.user_name.localeCompare(b.user_name))

  const inCall = call.status !== 'idle'

  return (
    <div className="relative mx-auto max-w-3xl px-6 pt-28 pb-20 min-h-screen">
      {/* Aurora backdrop */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute top-[8%] left-[18%] w-[520px] h-[520px] rounded-full opacity-50" style={{
          background: 'radial-gradient(circle, rgba(16,185,129,0.18) 0%, transparent 65%)',
          filter: 'blur(90px)',
        }} />
        <div className="absolute bottom-[8%] right-[14%] w-[420px] h-[420px] rounded-full opacity-40" style={{
          background: 'radial-gradient(circle, rgba(139,92,246,0.14) 0%, transparent 65%)',
          filter: 'blur(90px)',
        }} />
      </div>

      {/* Header */}
      <div className="relative mb-10" style={{ animation: 'fade-in .5s ease-out' }}>
        <div className="mb-4 flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" style={{ boxShadow: '0 0 8px rgba(16,185,129,0.8)' }} />
          </span>
          <span className="mono text-[10px] uppercase tracking-[0.2em] text-emerald-400">Live · WebRTC P2P</span>
        </div>
        <h1 className="font-nacelle text-4xl font-semibold tracking-tight mb-2" style={{
          background: 'linear-gradient(180deg, #FAFAFA 0%, #A1A1AA 100%)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
        }}>
          Calls
        </h1>
        <p className="text-sm text-zinc-500">
          Direct peer-to-peer video. No server in the middle. Click anyone online.
        </p>
      </div>

      {/* In-call banner */}
      {inCall && (
        <div
          className="relative mb-6 rounded-2xl px-4 py-3 flex items-center justify-between"
          style={{
            background: 'rgba(16,185,129,0.08)',
            border: '1px solid rgba(16,185,129,0.3)',
            boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.04)',
          }}
        >
          <div className="flex items-center gap-3">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs text-emerald-300">
              {call.status === 'connected' ? 'Connected with' : call.status === 'incoming' ? 'Incoming from' : call.status === 'outgoing' ? 'Ringing' : 'Connecting to'}{' '}
              <span className="font-semibold">{call.peerName ?? 'peer'}</span>
            </span>
          </div>
          <button
            onClick={hangup}
            className="text-[10px] font-mono text-rose-300 hover:text-rose-200 transition-colors px-2 py-1 rounded-md"
            style={{ background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.3)' }}
          >
            End call
          </button>
        </div>
      )}

      {/* Search */}
      <div
        className="relative mb-6 flex items-center gap-3 rounded-xl px-4 h-11"
        style={{
          background: 'rgba(10,10,12,0.6)',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.03)',
        }}
      >
        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" className="text-zinc-600 flex-shrink-0">
          <circle cx="11" cy="11" r="8"/><path strokeLinecap="round" d="M21 21l-4.35-4.35"/>
        </svg>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={`Search ${others.length} online user${others.length === 1 ? '' : 's'}…`}
          className="flex-1 bg-transparent text-sm text-zinc-200 placeholder:text-zinc-600 outline-none"
          spellCheck={false}
          autoComplete="off"
        />
        {query && (
          <button type="button" onClick={() => setQuery('')} className="text-zinc-600 hover:text-zinc-300">
            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        )}
      </div>

      {/* Counters */}
      <div className="relative mb-5 flex items-center gap-3 text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          {others.length} available
        </span>
        <span className="text-zinc-800">·</span>
        <span>{online.length} total online (you included)</span>
      </div>

      {/* Online user list */}
      <div className="relative space-y-2">
        {others.length === 0 && (
          <div
            className="rounded-2xl px-5 py-10 text-center"
            style={{ background: 'rgba(10,10,12,0.5)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div className="text-sm text-zinc-500 mb-1">No one else is online right now.</div>
            <div className="text-[11px] text-zinc-700">Open the platform in another browser or share the link.</div>
          </div>
        )}
        {others.map((u, i) => (
          <OnlineRow
            key={u.user_id}
            user={u}
            disabled={inCall}
            onCall={() => callUser(u.user_id, u.user_name)}
            index={i}
          />
        ))}
      </div>

      {/* Footer hints */}
      <div className="relative mt-10 text-center">
        <p className="text-[10px] font-mono text-zinc-700 uppercase tracking-widest">
          First call? Allow camera + microphone when your browser asks.
        </p>
      </div>
    </div>
  )
}

function OnlineRow({ user, disabled, onCall, index }: {
  user: OnlineUser
  disabled: boolean
  onCall: () => void
  index: number
}) {
  const initial = (user.user_name || 'A')[0].toUpperCase()
  return (
    <div
      className="group relative flex items-center gap-4 rounded-2xl px-4 py-3 transition-all duration-200 hover:-translate-y-0.5"
      style={{
        background: 'linear-gradient(180deg, rgba(10,10,12,0.8) 0%, rgba(5,5,6,0.8) 100%)',
        border: '1px solid rgba(255,255,255,0.06)',
        boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.04)',
        animation: `fade-in .5s ease-out ${0.05 + index * 0.03}s both`,
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLElement
        el.style.boxShadow = 'inset 0 1px 0 0 rgba(255,255,255,0.06), 0 0 0 1px rgba(16,185,129,0.25), 0 12px 32px rgba(16,185,129,0.12)'
        el.style.borderColor = 'transparent'
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLElement
        el.style.boxShadow = 'inset 0 1px 0 0 rgba(255,255,255,0.04)'
        el.style.borderColor = 'rgba(255,255,255,0.06)'
      }}
    >
      <div className="relative flex-shrink-0">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl text-sm font-semibold text-emerald-200" style={{
          background: 'linear-gradient(180deg, rgba(16,185,129,0.22), rgba(16,185,129,0.08))',
          border: '1px solid rgba(16,185,129,0.3)',
          boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.1)',
        }}>
          {initial}
        </div>
        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500" style={{
          boxShadow: '0 0 0 2px #050506, 0 0 8px rgba(16,185,129,0.6)',
        }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-zinc-100 font-medium truncate">{user.user_name}</div>
        <div className="mono text-[10px] text-zinc-600 uppercase tracking-widest">online</div>
      </div>
      <button
        onClick={onCall}
        disabled={disabled}
        className="flex items-center gap-2 h-10 px-4 rounded-xl text-xs font-semibold text-zinc-950 transition-all active:scale-[0.98] hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:brightness-100"
        style={{
          background: 'linear-gradient(180deg, #34D399 0%, #10B981 100%)',
          border: '1px solid rgba(167,243,208,0.5)',
          boxShadow: '0 0 0 1px rgba(255,255,255,0.1), 0 8px 20px rgba(16,185,129,0.25), inset 0 1px 0 0 rgba(255,255,255,0.3)',
        }}
      >
        <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.25" viewBox="0 0 24 24">
          <path strokeLinecap="round" d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.68A2 2 0 012 1.07h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/>
        </svg>
        Call
      </button>
    </div>
  )
}
