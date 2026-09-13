'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import { isOwner, canAdmin } from '@/lib/utils'
import Link from 'next/link'

interface TableStat { name: string; count: number | null }
interface LogEntry { ts: number; msg: string; type: 'info' | 'warn' | 'error' }

export default function DevToolsPage() {
  const [user, setUser] = useState<User | null>(null)
  const [role, setRole] = useState('user')
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<TableStat[]>([])
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [wsCount, setWsCount] = useState(0)
  const [impersonateRole, setImpersonateRole] = useState<'user' | 'admin' | 'owner'>('user')
  const [rtcState, setRtcState] = useState<string>('idle')
  const [rtcStats, setRtcStats] = useState<string>('')
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const sb = createClient()

  function log(msg: string, type: LogEntry['type'] = 'info') {
    setLogs(prev => [{ ts: Date.now(), msg, type }, ...prev].slice(0, 100))
  }

  useEffect(() => {
    sb.auth.getUser().then(async ({ data }) => {
      const u = data.user
      setUser(u)
      if (!u) { setLoading(false); return }
      const { data: p } = await sb.from('profiles').select('role').eq('id', u.id).single()
      const r = p?.role ?? 'user'
      setRole(r)
      if (!canAdmin(r)) { setLoading(false); return }

      fetchStats()
      log('DevTools initialised')
      setLoading(false)
    })
  }, [])

  async function fetchStats() {
    const tables = ['profiles', 'chat_messages', 'news', 'banned_users', 'admin_audit_logs', 'message_reactions']
    const results = await Promise.all(
      tables.map(async (t) => {
        const { count } = await sb.from(t).select('*', { count: 'exact', head: true })
        return { name: t, count }
      })
    )
    setStats(results)
    log(`Table stats refreshed: ${results.map(r => `${r.name}=${r.count}`).join(', ')}`)
  }

  async function stressTestRealtime() {
    log('Starting realtime stress test...', 'warn')
    const start = Date.now()
    let connected = 0
    const channels: ReturnType<typeof sb.channel>[] = []

    for (let i = 0; i < 5; i++) {
      const ch = sb.channel(`stress-test-${i}`)
      ch.subscribe((s) => {
        if (s === 'SUBSCRIBED') {
          connected++
          log(`Channel ${i} connected (${Date.now() - start}ms)`)
          setWsCount(c => c + 1)
        }
      })
      channels.push(ch)
    }

    setTimeout(async () => {
      for (const ch of channels) await sb.removeChannel(ch)
      log(`Stress test done. ${connected}/5 channels connected in ${Date.now() - start}ms`, 'info')
      setWsCount(0)
    }, 4000)
  }

  async function testRtcConnection() {
    setRtcState('testing')
    log('Testing RTCPeerConnection...', 'info')
    try {
      const pc1 = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })
      const pc2 = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })
      pcRef.current = pc1

      pc1.onicecandidate = e => { if (e.candidate) pc2.addIceCandidate(e.candidate) }
      pc2.onicecandidate = e => { if (e.candidate) pc1.addIceCandidate(e.candidate) }

      const dc = pc1.createDataChannel('test')
      dc.onopen = () => {
        setRtcState('connected')
        log('WebRTC data channel opened — P2P working ✓', 'info')
        dc.send('ping')
      }
      pc2.ondatachannel = e => {
        e.channel.onmessage = msg => {
          log(`Received via data channel: "${msg.data}"`, 'info')
          // Get stats
          pc1.getStats().then(report => {
            const lines: string[] = []
            report.forEach(s => {
              if (s.type === 'candidate-pair' && (s as RTCIceCandidatePairStats).state === 'succeeded') {
                lines.push(`RTT: ${(s as RTCIceCandidatePairStats).currentRoundTripTime ?? '?'}s`)
              }
            })
            setRtcStats(lines.join(' · ') || 'Connected (no stats available)')
          })
          setTimeout(() => {
            pc1.close(); pc2.close()
            setRtcState('idle')
            log('RTCPeerConnection test complete, connections closed.', 'info')
          }, 1500)
        }
      }

      const offer = await pc1.createOffer()
      await pc1.setLocalDescription(offer)
      await pc2.setRemoteDescription(offer)
      const answer = await pc2.createAnswer()
      await pc2.setLocalDescription(answer)
      await pc1.setRemoteDescription(answer)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log(`RTCPeerConnection failed: ${msg}`, 'error')
      setRtcState('error')
    }
  }

  async function clearCache() {
    log('Flushing Supabase client cache...', 'warn')
    await sb.auth.refreshSession()
    log('Session refreshed. Auth cache cleared.', 'info')
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
        <p className="text-sm text-zinc-600">Admin access required.</p>
      </div>
    </div>
  )

  return (
    <div className="mx-auto max-w-5xl px-6 pt-28 pb-20">
      <div className="mb-10">
        <div className="mb-3 flex items-center gap-2">
          <Link href="/admin" className="mono text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors">← Admin</Link>
          <span className="h-px w-4 bg-zinc-800" />
          <span className="mono text-[10px] tracking-[0.15em] text-zinc-600 uppercase">Admin</span>
        </div>
        <h1 className="font-nacelle text-3xl font-semibold text-zinc-100 tracking-tight">Developer Tools</h1>
        <p className="mt-2 text-sm text-zinc-500">Database inspector · Realtime tracker · WebRTC debugger</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Database stats */}
        <div className="glass-card rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="mono text-[10px] tracking-[0.15em] text-zinc-600 uppercase">Database Tables</span>
            <button onClick={fetchStats} className="mono text-[10px] text-zinc-600 hover:text-zinc-200 transition-colors active:scale-[0.98]">
              Refresh
            </button>
          </div>
          <div className="space-y-2">
            {stats.map(s => (
              <div key={s.name} className="flex items-center justify-between py-1 border-b border-white/[0.04] last:border-0">
                <span className="mono text-xs text-zinc-400">{s.name}</span>
                <span className="mono text-xs text-zinc-200 tabular-nums">{s.count ?? '—'}</span>
              </div>
            ))}
          </div>
          <button
            onClick={clearCache}
            className="w-full flex h-9 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-xs text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.07] transition-all active:scale-[0.98]"
          >
            Flush auth cache
          </button>
        </div>

        {/* WebRTC debugger */}
        <div className="glass-card rounded-2xl p-5 space-y-4">
          <span className="mono text-[10px] tracking-[0.15em] text-zinc-600 uppercase">WebRTC Debugger</span>
          <div className="space-y-2">
            <div className="flex items-center justify-between py-1.5 border-b border-white/[0.04]">
              <span className="mono text-xs text-zinc-500">Connection state</span>
              <span className={`mono text-xs ${rtcState === 'connected' ? 'text-emerald-400' : rtcState === 'error' ? 'text-rose-400' : rtcState === 'testing' ? 'text-amber-400' : 'text-zinc-600'}`}>
                {rtcState}
              </span>
            </div>
            {rtcStats && (
              <div className="flex items-start justify-between py-1.5 border-b border-white/[0.04]">
                <span className="mono text-xs text-zinc-500">Stats</span>
                <span className="mono text-xs text-zinc-300 text-right">{rtcStats}</span>
              </div>
            )}
            <div className="flex items-center justify-between py-1.5">
              <span className="mono text-xs text-zinc-500">STUN server</span>
              <span className="mono text-xs text-zinc-400">stun.l.google.com:19302</span>
            </div>
          </div>
          <button
            onClick={testRtcConnection}
            disabled={rtcState === 'testing'}
            className="w-full flex h-9 items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-500/[0.08] text-xs text-emerald-400 hover:bg-emerald-500/[0.14] transition-all active:scale-[0.98] disabled:opacity-40"
          >
            {rtcState === 'testing' ? 'Testing...' : 'Run P2P self-test'}
          </button>
        </div>

        {/* Realtime stress test */}
        <div className="glass-card rounded-2xl p-5 space-y-4">
          <span className="mono text-[10px] tracking-[0.15em] text-zinc-600 uppercase">Realtime Socket Tracker</span>
          <div className="space-y-2">
            <div className="flex items-center justify-between py-1.5 border-b border-white/[0.04]">
              <span className="mono text-xs text-zinc-500">Active channels (stress)</span>
              <span className="mono text-xs text-zinc-200 tabular-nums">{wsCount}</span>
            </div>
          </div>
          <button
            onClick={stressTestRealtime}
            className="w-full flex h-9 items-center justify-center rounded-xl border border-amber-500/25 bg-amber-500/[0.08] text-xs text-amber-400 hover:bg-amber-500/[0.14] transition-all active:scale-[0.98]"
          >
            Stress test (5 channels, 4s)
          </button>
        </div>

        {/* Session impersonator */}
        <div className="glass-card rounded-2xl p-5 space-y-4">
          <span className="mono text-[10px] tracking-[0.15em] text-zinc-600 uppercase">Session Impersonator</span>
          <p className="text-xs text-zinc-600">Preview how the UI renders under a different role.</p>
          <div className="flex gap-2">
            {(['user', 'admin', 'owner'] as const).map(r => (
              <button
                key={r}
                onClick={() => setImpersonateRole(r)}
                className={`flex-1 rounded-xl border py-2 text-xs font-medium transition-all active:scale-[0.98] ${
                  impersonateRole === r
                    ? 'border-white/[0.12] bg-zinc-800/80 text-zinc-100'
                    : 'border-white/[0.07] bg-white/[0.02] text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-zinc-900/40 p-4">
            <p className="mono text-[10px] text-zinc-600 uppercase mb-2">UI preview as: {impersonateRole}</p>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <span className="text-xs text-zinc-400">Can read public content</span>
              </div>
              {impersonateRole !== 'user' && (
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  <span className="text-xs text-zinc-400">Can moderate chat, post news</span>
                </div>
              )}
              {impersonateRole === 'owner' && (
                <>
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                    <span className="text-xs text-zinc-400">Can manage roles</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                    <span className="text-xs text-zinc-400">Troll panel access</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Live log console */}
      <div className="mt-6 glass-card rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="mono text-[10px] tracking-[0.15em] text-zinc-600 uppercase">Dev Console</span>
          <button onClick={() => setLogs([])} className="mono text-[10px] text-zinc-700 hover:text-zinc-400 transition-colors">
            Clear
          </button>
        </div>
        <div className="font-mono text-[11px] bg-zinc-950/60 rounded-xl p-4 overflow-y-auto space-y-1 max-h-48">
          {logs.length === 0 && <span className="text-zinc-700">— waiting for events —</span>}
          {logs.map((l, i) => (
            <div key={i} className={`flex gap-3 ${l.type === 'error' ? 'text-rose-400' : l.type === 'warn' ? 'text-amber-400' : 'text-zinc-400'}`}>
              <span className="text-zinc-700 flex-shrink-0">{new Date(l.ts).toLocaleTimeString()}</span>
              <span>{l.msg}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
