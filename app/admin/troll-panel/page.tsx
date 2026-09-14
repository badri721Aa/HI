'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import { isRootOwner } from '@/lib/utils'
import Link from 'next/link'

interface OnlineUser { user_id: string; user_name: string; online_at: number }

// ── Effect injection (local) ──────────────────────────────
function injectStyle(id: string, css: string) {
  let el = document.getElementById(id) as HTMLStyleElement | null
  if (!el) {
    el = document.createElement('style')
    el.id = id
    document.head.appendChild(el)
  }
  el.textContent = css
}

function removeStyle(id: string) {
  document.getElementById(id)?.remove()
}

// ── Audio helpers ─────────────────────────────────────────
function playTone(freq: number, duration = 0.3, type: OscillatorType = 'sine', vol = 0.3) {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.value = freq
    gain.gain.setValueAtTime(vol, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + duration)
  } catch {}
}

function playAlarm() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sawtooth'
    gain.gain.value = 0.3
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    let up = true
    const int = setInterval(() => {
      osc.frequency.value = up ? 880 : 660
      up = !up
    }, 150)
    setTimeout(() => { clearInterval(int); osc.stop(); ctx.close() }, 2500)
  } catch {}
}

function playFart() {
  try {
    const ctx = new AudioContext()
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2)
    }
    const src = ctx.createBufferSource()
    const gain = ctx.createGain()
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 300
    src.buffer = buf
    src.connect(filter)
    filter.connect(gain)
    gain.connect(ctx.destination)
    gain.gain.value = 0.8
    src.start()
    setTimeout(() => ctx.close(), 500)
  } catch {}
}

// ── Local visual effects ──────────────────────────────────
const FX: Record<string, { on: () => void; off: () => void }> = {
  matrix: {
    on() {
      const canvas = document.createElement('canvas')
      canvas.id = '__troll_matrix'
      canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:99999;pointer-events:none;'
      document.body.appendChild(canvas)
      const ctx = canvas.getContext('2d')!
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      const cols = Math.floor(canvas.width / 14)
      const drops = Array(cols).fill(1)
      const chars = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉABCDEFGHIJKLM0123456789'
      const id = setInterval(() => {
        ctx.fillStyle = 'rgba(0,0,0,0.05)'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.fillStyle = '#00ff41'
        ctx.font = '14px monospace'
        drops.forEach((y, i) => {
          ctx.fillText(chars[Math.floor(Math.random() * chars.length)], i * 14, y * 14)
          if (y * 14 > canvas.height && Math.random() > 0.975) drops[i] = 0
          drops[i]++
        })
      }, 40)
      canvas.dataset.interval = String(id)
    },
    off() {
      const c = document.getElementById('__troll_matrix') as HTMLCanvasElement | null
      if (c) { clearInterval(Number(c.dataset.interval)); c.remove() }
    }
  },
  crt: {
    on() {
      injectStyle('__troll_crt', `
        body::after {
          content: '';
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          z-index: 99998;
          pointer-events: none;
          background: repeating-linear-gradient(
            0deg,
            rgba(0,0,0,0.15) 0px,
            rgba(0,0,0,0.15) 1px,
            transparent 1px,
            transparent 3px
          );
          animation: __crtFlicker 0.15s infinite;
        }
        @keyframes __crtFlicker {
          0%, 100% { opacity: 1 }
          50% { opacity: 0.85 }
        }
      `)
    },
    off() { removeStyle('__troll_crt') }
  },
  flip: {
    on() { injectStyle('__troll_flip', 'html { transform: rotate(180deg); transition: transform 0.4s; }') },
    off() { removeStyle('__troll_flip') }
  },
  glitch: {
    on() {
      injectStyle('__troll_glitch', `
        @keyframes __glitch {
          0%, 100% { transform: translate(0) skew(0deg); filter: none; }
          20% { transform: translate(-3px, 1px) skew(0.5deg); filter: hue-rotate(90deg); }
          40% { transform: translate(3px, -1px) skew(-0.5deg); filter: hue-rotate(180deg); }
          60% { transform: translate(-2px, 2px) skew(1deg); filter: hue-rotate(270deg) saturate(2); }
          80% { transform: translate(2px, -2px) skew(-1deg); filter: hue-rotate(0deg); }
        }
        html { animation: __glitch 0.3s infinite; }
      `)
    },
    off() { removeStyle('__troll_glitch') }
  },
  shake: {
    on() {
      injectStyle('__troll_shake', `
        @keyframes __shake {
          0%, 100% { transform: translate(0, 0) }
          10% { transform: translate(-5px, 4px) }
          20% { transform: translate(5px, -4px) }
          30% { transform: translate(-4px, 5px) }
          40% { transform: translate(4px, -5px) }
          50% { transform: translate(-6px, 3px) }
          60% { transform: translate(6px, -3px) }
          70% { transform: translate(-3px, 6px) }
          80% { transform: translate(3px, -6px) }
          90% { transform: translate(-5px, -4px) }
        }
        html { animation: __shake 0.2s infinite; }
      `)
    },
    off() { removeStyle('__troll_shake') }
  },
  invert: {
    on() { injectStyle('__troll_invert', 'html { filter: invert(1); }') },
    off() { removeStyle('__troll_invert') }
  },
  blur: {
    on() { injectStyle('__troll_blur', 'html { filter: blur(3px); }') },
    off() { removeStyle('__troll_blur') }
  },
  sepia: {
    on() { injectStyle('__troll_sepia', 'html { filter: sepia(1) saturate(2); }') },
    off() { removeStyle('__troll_sepia') }
  },
  rainbow: {
    on() {
      injectStyle('__troll_rainbow', `
        @keyframes __rainbow { from { filter: hue-rotate(0deg); } to { filter: hue-rotate(360deg); } }
        html { animation: __rainbow 1s linear infinite; }
      `)
    },
    off() { removeStyle('__troll_rainbow') }
  },
  cursor: {
    on() { injectStyle('__troll_cursor', '* { cursor: none !important; }') },
    off() { removeStyle('__troll_cursor') }
  },
  zoom: {
    on() { injectStyle('__troll_zoom', 'html { transform: scale(1.4); transform-origin: top left; overflow: hidden; }') },
    off() { removeStyle('__troll_zoom') }
  },
}

function showBSOD() {
  let el = document.getElementById('__troll_bsod')
  if (el) { el.remove(); return }
  el = document.createElement('div')
  el.id = '__troll_bsod'
  el.innerHTML = `
    <div style="background:#0078d4;color:white;font-family:monospace;position:fixed;inset:0;z-index:999999;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:10%;">
      <div style="font-size:8rem;margin-bottom:1rem;">:(</div>
      <div style="font-size:1.5rem;font-weight:bold;margin-bottom:1rem;">Your PC ran into a problem and needs to restart.</div>
      <div style="font-size:0.9rem;margin-bottom:2rem;opacity:0.8;">We're just collecting some error info, and then we'll restart for you.</div>
      <div id="__bsod_pct" style="font-size:1.1rem;margin-bottom:3rem;">0% complete</div>
      <div style="font-size:0.8rem;opacity:0.7;">Stop code: CRITICAL_PROCESS_DIED</div>
      <button onclick="document.getElementById('__troll_bsod').remove()" style="margin-top:2rem;padding:0.5rem 1.5rem;background:rgba(255,255,255,0.2);border:1px solid rgba(255,255,255,0.3);color:white;cursor:pointer;font-family:monospace;font-size:0.8rem;">Dismiss</button>
    </div>
  `
  document.body.appendChild(el)
  let pct = 0
  const int = setInterval(() => {
    pct += Math.random() * 3
    if (pct >= 100) { pct = 100; clearInterval(int) }
    const el2 = document.getElementById('__bsod_pct')
    if (el2) el2.textContent = `${Math.floor(pct)}% complete`
  }, 200)
}

function showFakeUpdate() {
  let el = document.getElementById('__troll_update')
  if (el) { el.remove(); return }
  el = document.createElement('div')
  el.id = '__troll_update'
  el.innerHTML = `
    <div style="background:#000;color:#fff;font-family:sans-serif;position:fixed;inset:0;z-index:999999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2rem;">
      <div style="display:flex;align-items:center;gap:1rem;">
        <div style="width:48px;height:48px;background:#0078d4;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:2rem;">⊞</div>
        <div style="font-size:2rem;font-weight:300;">Windows Update</div>
      </div>
      <div style="font-size:1rem;opacity:0.8;">Configuring update 3 of 3 — 94%</div>
      <div style="width:300px;height:4px;background:#333;border-radius:2px;">
        <div style="width:94%;height:100%;background:#0078d4;border-radius:2px;"></div>
      </div>
      <div style="font-size:0.8rem;opacity:0.6;">Please don't turn off your PC. This will take a while.</div>
      <button onclick="document.getElementById('__troll_update').remove()" style="margin-top:1rem;padding:0.4rem 1.2rem;background:#333;border:1px solid #555;color:#aaa;cursor:pointer;font-size:0.75rem;">Dismiss</button>
    </div>
  `
  document.body.appendChild(el)
}

function showFakeError(msg: string) {
  const toast = document.createElement('div')
  toast.style.cssText = 'position:fixed;top:1rem;right:1rem;z-index:999999;background:#1a0000;border:1px solid #dc2626;border-radius:12px;padding:1rem 1.25rem;max-width:360px;font-family:monospace;'
  toast.innerHTML = `
    <div style="color:#ef4444;font-weight:bold;font-size:0.85rem;margin-bottom:0.5rem;">⚠ SYSTEM ALERT</div>
    <div style="color:#fca5a5;font-size:0.75rem;line-height:1.5;">${msg}</div>
    <button onclick="this.parentElement.remove()" style="margin-top:0.75rem;font-size:0.7rem;color:#666;background:none;border:none;cursor:pointer;">Dismiss</button>
  `
  document.body.appendChild(toast)
  setTimeout(() => toast.remove(), 6000)
}

// ── Main component ────────────────────────────────────────
const FAKE_ERRORS = [
  'CRITICAL: Your session token has been invalidated. Security scan initiated.',
  'WARNING: Unauthorized access detected from IP 192.168.1.1. IT has been alerted.',
  'ALERT: Database corruption detected. Your recent work may be lost.',
  'ERROR: Memory overflow in Page Worker. Application state corrupted.',
  'NOTICE: Account flagged for suspicious activity. Login suspended in 60 seconds.',
]

const TROLL_MESSAGES = [
  'ALERT: The system is watching. Act normal.',
  'All hacks have been detected and logged. Back to zero.',
  'IT department monitoring chat in real-time today.',
  'Server maintenance in 2 minutes. Save your work NOW.',
  'Session timeout in 30 seconds — suspicious activity detected.',
  'Your screen has been recorded and sent to administration.',
  'New rule: all browser tabs are now visible to teachers.',
  'Extension block detected — accounts flagged for review.',
]

const SOUNDBOARD = [
  { label: 'Alarm', icon: '🚨', fn: playAlarm },
  { label: 'Fart', icon: '💨', fn: playFart },
  { label: 'Beep', icon: '📯', fn: () => playTone(880, 0.15, 'sine') },
  { label: 'Error', icon: '❌', fn: () => playTone(200, 0.5, 'sawtooth', 0.4) },
  { label: 'Ding', icon: '🔔', fn: () => playTone(1318, 0.4, 'sine') },
  { label: 'Low', icon: '🔈', fn: () => playTone(60, 1.5, 'sine', 0.5) },
  { label: 'Laser', icon: '🔫', fn: () => { const c = new AudioContext(); const o = c.createOscillator(); o.connect(c.destination); o.frequency.setValueAtTime(2000, c.currentTime); o.frequency.exponentialRampToValueAtTime(100, c.currentTime + 0.3); o.start(); o.stop(c.currentTime + 0.3); } },
  { label: 'Win', icon: '🏆', fn: () => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => playTone(f, 0.3), i * 150)) } },
]

const VISUAL_FX = [
  { id: 'matrix', label: 'Matrix Rain', icon: '🟩', color: 'emerald' },
  { id: 'crt', label: 'CRT Scanlines', icon: '📺', color: 'zinc' },
  { id: 'glitch', label: 'Glitch', icon: '⚡', color: 'violet' },
  { id: 'shake', label: 'Screen Shake', icon: '💥', color: 'amber' },
  { id: 'flip', label: 'Flip 180°', icon: '🙃', color: 'violet' },
  { id: 'invert', label: 'Invert Colors', icon: '🌓', color: 'zinc' },
  { id: 'blur', label: 'Blur Screen', icon: '🌫️', color: 'blue' },
  { id: 'sepia', label: 'Sepia', icon: '🍂', color: 'amber' },
  { id: 'rainbow', label: 'Rainbow', icon: '🌈', color: 'pink' },
  { id: 'cursor', label: 'Hide Cursor', icon: '👻', color: 'zinc' },
  { id: 'zoom', label: 'Zoom In', icon: '🔍', color: 'blue' },
]

const BROADCAST_TROLLS = [
  { label: 'Screen Shake', icon: '💥', event: 'shake', color: 'amber' },
  { label: 'Matrix Rain', icon: '🟩', event: 'matrix', color: 'emerald' },
  { label: 'Gravity Flip', icon: '🙃', event: 'gravity-flip', color: 'violet' },
  { label: 'Fake Error', icon: '🚨', event: 'fake-error', color: 'rose', payload: () => ({ msg: FAKE_ERRORS[Math.floor(Math.random() * FAKE_ERRORS.length)] }) },
  { label: 'Audio Alarm', icon: '🔊', event: 'audio', color: 'rose', payload: () => ({ type: 'alarm' }) },
  { label: 'CRT Mode', icon: '📺', event: 'crt', color: 'zinc' },
  { label: 'Glitch', icon: '⚡', event: 'glitch', color: 'violet' },
  { label: 'Invert Colors', icon: '🌓', event: 'invert', color: 'zinc' },
  { label: 'Blur Screen', icon: '🌫️', event: 'blur', color: 'blue' },
  { label: 'Rickroll Tab', icon: '🎵', event: 'rickroll', color: 'amber', payload: () => ({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }) },
]

type TrollTab = 'local' | 'broadcast' | 'sounds' | 'fake'

export default function TrollPanelPage() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<TrollTab>('local')
  const [online, setOnline] = useState<OnlineUser[]>([])
  const [target, setTarget] = useState<string>('all')
  const [lastAction, setLastAction] = useState('')
  const [activeFx, setActiveFx] = useState<Set<string>>(new Set())
  const [customMsg, setCustomMsg] = useState('')
  const sb = createClient()

  useEffect(() => {
    sb.auth.getUser().then(async ({ data }) => {
      const u = data.user
      setUser(u)
      if (!u || !isRootOwner(u.email)) { setLoading(false); return }

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
    const ch = sb.channel('troll-engine')
    await ch.subscribe()
    await ch.send({ type: 'broadcast', event, payload: { target, ...payload } })
    sb.removeChannel(ch)
    const who = target === 'all' ? 'everyone' : (online.find(o => o.user_id === target)?.user_name ?? target)
    setLastAction(`${event} → ${who}`)
    await sb.rpc('log_admin_action', { p_action: `troll_${event}`, p_target_email: null, p_payload: { target, ...payload } })
  }

  function toggleFx(id: string) {
    if (activeFx.has(id)) {
      FX[id]?.off()
      setActiveFx(s => { const n = new Set(s); n.delete(id); return n })
    } else {
      FX[id]?.on()
      setActiveFx(s => new Set([...s, id]))
    }
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
        <p className="text-sm text-zinc-600">Owner access only.</p>
        <Link href="/admin" className="block mt-3 text-xs text-zinc-500 hover:text-zinc-300 transition-colors">← Admin</Link>
      </div>
    </div>
  )

  const TABS: { id: TrollTab; label: string; icon: string }[] = [
    { id: 'local', label: 'Local FX', icon: '🎭' },
    { id: 'broadcast', label: 'Broadcast', icon: '📡' },
    { id: 'sounds', label: 'Soundboard', icon: '🎵' },
    { id: 'fake', label: 'Fake UI', icon: '💻' },
  ]

  const colorMap: Record<string, string> = {
    amber: 'border-amber-500/20 bg-amber-500/[0.06] hover:bg-amber-500/[0.12] text-amber-400',
    rose: 'border-rose-500/20 bg-rose-500/[0.06] hover:bg-rose-500/[0.12] text-rose-400',
    violet: 'border-violet-500/20 bg-violet-500/[0.06] hover:bg-violet-500/[0.12] text-violet-400',
    emerald: 'border-emerald-500/20 bg-emerald-500/[0.06] hover:bg-emerald-500/[0.12] text-emerald-400',
    blue: 'border-blue-500/20 bg-blue-500/[0.06] hover:bg-blue-500/[0.12] text-blue-400',
    zinc: 'border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.07] text-zinc-300',
    pink: 'border-pink-500/20 bg-pink-500/[0.06] hover:bg-pink-500/[0.12] text-pink-400',
  }

  return (
    <div className="mx-auto max-w-5xl px-6 pt-28 pb-20">
      <div className="mb-8">
        <div className="mb-3 flex items-center gap-2">
          <Link href="/admin" className="mono text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors">← Admin</Link>
          <span className="h-px w-4 bg-zinc-800" />
          <span className="mono text-[10px] tracking-[0.15em] text-rose-600/70 uppercase">Owner Only</span>
        </div>
        <h1 className="font-nacelle text-3xl font-semibold text-zinc-100 tracking-tight">Troll Engine</h1>
        <p className="mt-1 text-sm text-zinc-500">Local FX · Broadcast · Soundboard · Fake UI</p>
      </div>

      {/* Tab bar */}
      <div className="mb-6 flex items-center gap-1 rounded-xl glass-card p-1 w-fit">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`rounded-lg px-4 py-1.5 text-xs font-medium flex items-center gap-1.5 transition-all duration-200 active:scale-[0.98] ${
              tab === t.id ? 'bg-zinc-700/60 border border-white/[0.1] text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <span>{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      {/* ── Local FX ── */}
      {tab === 'local' && (
        <div className="space-y-4">
          <div className="glass-card rounded-2xl p-5">
            <p className="mono text-[10px] tracking-[0.15em] text-zinc-600 uppercase mb-4">
              Visual Effects — apply to YOUR screen
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {VISUAL_FX.map(fx => {
                const isOn = activeFx.has(fx.id)
                return (
                  <button
                    key={fx.id}
                    onClick={() => toggleFx(fx.id)}
                    className={`relative flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all duration-200 active:scale-[0.97] ${
                      isOn
                        ? 'border-white/[0.15] bg-white/[0.07] text-zinc-100'
                        : colorMap[fx.color] ?? colorMap.zinc
                    }`}
                  >
                    <span className="text-xl">{fx.icon}</span>
                    <div className="flex-1">
                      <p className="text-xs font-medium">{fx.label}</p>
                    </div>
                    <div className={`h-2 w-2 rounded-full flex-shrink-0 ${isOn ? 'bg-emerald-400' : 'bg-zinc-700'}`} />
                  </button>
                )
              })}
            </div>
            {activeFx.size > 0 && (
              <button
                onClick={() => { activeFx.forEach(id => FX[id]?.off()); setActiveFx(new Set()) }}
                className="mt-4 w-full flex h-9 items-center justify-center rounded-xl border border-rose-500/20 bg-rose-500/[0.07] text-xs text-rose-400 hover:bg-rose-500/[0.14] transition-all active:scale-[0.98]"
              >
                Stop all effects ({activeFx.size} active)
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Broadcast ── */}
      {tab === 'broadcast' && (
        <div className="space-y-4">
          {/* Target selector */}
          <div className="glass-card rounded-2xl p-5 space-y-3">
            <p className="mono text-[10px] tracking-[0.15em] text-zinc-600 uppercase">Target</p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setTarget('all')}
                className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition-all active:scale-[0.98] ${target === 'all' ? 'border-rose-500/30 bg-rose-500/[0.1] text-rose-400' : 'border-white/[0.08] bg-white/[0.03] text-zinc-500 hover:text-zinc-300'}`}>
                Everyone ({online.length} online)
              </button>
              {online.map(o => (
                <button key={o.user_id} onClick={() => setTarget(o.user_id)}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition-all active:scale-[0.98] ${target === o.user_id ? 'border-rose-500/30 bg-rose-500/[0.1] text-rose-400' : 'border-white/[0.08] bg-white/[0.03] text-zinc-500 hover:text-zinc-300'}`}>
                  {o.user_name}
                </button>
              ))}
            </div>
            {online.length === 0 && <p className="mono text-xs text-zinc-700">No other users online.</p>}
          </div>

          {/* Action grid */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {BROADCAST_TROLLS.map(t => (
              <button
                key={t.event}
                onClick={() => dispatch(t.event, t.payload?.() ?? {})}
                className={`flex flex-col gap-2 rounded-2xl border px-5 py-4 text-left transition-all duration-200 active:scale-[0.97] ${colorMap[t.color] ?? colorMap.zinc}`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xl">{t.icon}</span>
                  <p className="text-xs font-semibold">{t.label}</p>
                </div>
                <div className="h-px w-full bg-current opacity-10" />
                <p className="text-[10px] opacity-60 mono">Fire →</p>
              </button>
            ))}
          </div>

          {/* Custom news troll */}
          <div className="glass-card rounded-2xl p-5 space-y-3">
            <p className="text-sm font-semibold text-zinc-200">Custom Troll News Post</p>
            <div className="flex gap-2">
              <input
                className="flex-1 h-9 rounded-xl border border-white/[0.08] bg-zinc-900/60 px-3 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-white/[0.18] focus:outline-none transition-all"
                placeholder="Message to broadcast…"
                value={customMsg}
                onChange={e => setCustomMsg(e.target.value)}
              />
              <button
                onClick={async () => {
                  if (!customMsg.trim()) return
                  await sb.from('news').insert({ message: customMsg.trim(), pinned: false })
                  setLastAction(`news_drop: "${customMsg.slice(0, 40)}"`)
                  setCustomMsg('')
                }}
                disabled={!customMsg.trim()}
                className="flex h-9 items-center px-4 rounded-xl border border-rose-500/20 bg-rose-500/[0.08] text-xs text-rose-400 hover:bg-rose-500/[0.14] transition-all active:scale-[0.98] disabled:opacity-40"
              >
                Post
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {TROLL_MESSAGES.slice(0, 4).map(m => (
                <button key={m} onClick={() => setCustomMsg(m)}
                  className="rounded-lg border border-white/[0.06] bg-zinc-900/40 px-2 py-1 text-[10px] text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800/60 transition-all text-left">
                  {m.slice(0, 40)}…
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Soundboard ── */}
      {tab === 'sounds' && (
        <div className="space-y-4">
          <div className="glass-card rounded-2xl p-5">
            <p className="mono text-[10px] tracking-[0.15em] text-zinc-600 uppercase mb-4">Sound FX — plays locally via Web Audio</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {SOUNDBOARD.map(s => (
                <button
                  key={s.label}
                  onClick={s.fn}
                  className="flex flex-col items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.07] px-4 py-5 transition-all duration-200 active:scale-[0.95]"
                >
                  <span className="text-3xl">{s.icon}</span>
                  <span className="text-xs text-zinc-400">{s.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="glass-card rounded-2xl p-5 space-y-4">
            <p className="mono text-[10px] tracking-[0.15em] text-zinc-600 uppercase">Tone Generator</p>
            <ToneGenerator />
          </div>
        </div>
      )}

      {/* ── Fake UI ── */}
      {tab === 'fake' && (
        <div className="space-y-4">
          <div className="glass-card rounded-2xl p-5">
            <p className="mono text-[10px] tracking-[0.15em] text-zinc-600 uppercase mb-4">Fake UI Overlays — triggers on your screen</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <button onClick={showBSOD}
                className="flex items-center gap-3 rounded-2xl border border-blue-500/20 bg-blue-500/[0.06] hover:bg-blue-500/[0.12] px-5 py-4 text-left transition-all active:scale-[0.97]">
                <span className="text-2xl">💙</span>
                <div>
                  <p className="text-sm font-medium text-blue-400">Fake BSOD</p>
                  <p className="text-[10px] text-blue-400/60 mono mt-0.5">Windows Blue Screen of Death</p>
                </div>
              </button>
              <button onClick={showFakeUpdate}
                className="flex items-center gap-3 rounded-2xl border border-zinc-700/50 bg-white/[0.03] hover:bg-white/[0.07] px-5 py-4 text-left transition-all active:scale-[0.97]">
                <span className="text-2xl">⊞</span>
                <div>
                  <p className="text-sm font-medium text-zinc-200">Fake Windows Update</p>
                  <p className="text-[10px] text-zinc-600 mono mt-0.5">Full-screen update screen</p>
                </div>
              </button>
              {FAKE_ERRORS.map((msg, i) => (
                <button key={i} onClick={() => showFakeError(msg)}
                  className="flex items-start gap-3 rounded-2xl border border-rose-500/15 bg-rose-500/[0.04] hover:bg-rose-500/[0.08] px-5 py-4 text-left transition-all active:scale-[0.97]">
                  <span className="text-xl mt-0.5">🚨</span>
                  <div>
                    <p className="text-xs font-medium text-rose-400">Error Toast #{i + 1}</p>
                    <p className="text-[10px] text-rose-400/60 mono mt-0.5 leading-relaxed">{msg.slice(0, 60)}…</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="glass-card rounded-2xl p-5 space-y-3">
            <p className="mono text-[10px] tracking-[0.15em] text-zinc-600 uppercase">Custom Error Toast</p>
            <div className="flex gap-2">
              <input
                className="flex-1 h-9 rounded-xl border border-white/[0.08] bg-zinc-900/60 px-3 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-white/[0.18] focus:outline-none transition-all"
                placeholder="Custom error message…"
                value={customMsg}
                onChange={e => setCustomMsg(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && customMsg.trim()) { showFakeError(customMsg); setCustomMsg('') } }}
              />
              <button
                onClick={() => { if (customMsg.trim()) { showFakeError(customMsg); setCustomMsg('') } }}
                disabled={!customMsg.trim()}
                className="flex h-9 items-center px-4 rounded-xl border border-rose-500/20 bg-rose-500/[0.08] text-xs text-rose-400 hover:bg-rose-500/[0.14] transition-all active:scale-[0.98] disabled:opacity-40"
              >
                Show
              </button>
            </div>
          </div>
        </div>
      )}

      {lastAction && (
        <div className="mt-6 glass-card rounded-xl px-4 py-3 mono text-xs text-emerald-400">
          ✓ Fired: {lastAction}
        </div>
      )}
    </div>
  )
}

function ToneGenerator() {
  const [freq, setFreq] = useState(440)
  const [duration, setDuration] = useState(500)
  const [type, setType] = useState<OscillatorType>('sine')

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="mono text-[10px] text-zinc-600">Frequency</p>
            <p className="mono text-[10px] text-zinc-400">{freq}Hz</p>
          </div>
          <input type="range" min={20} max={4000} value={freq} onChange={e => setFreq(Number(e.target.value))} className="w-full accent-violet-500" />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="mono text-[10px] text-zinc-600">Duration</p>
            <p className="mono text-[10px] text-zinc-400">{duration}ms</p>
          </div>
          <input type="range" min={50} max={3000} step={50} value={duration} onChange={e => setDuration(Number(e.target.value))} className="w-full accent-violet-500" />
        </div>
      </div>
      <div className="flex gap-2">
        {(['sine', 'square', 'sawtooth', 'triangle'] as OscillatorType[]).map(t => (
          <button key={t} onClick={() => setType(t)}
            className={`flex-1 rounded-lg border py-1.5 text-[10px] mono transition-all ${type === t ? 'border-violet-500/40 bg-violet-500/[0.1] text-violet-400' : 'border-white/[0.06] text-zinc-600 hover:text-zinc-300'}`}>
            {t}
          </button>
        ))}
      </div>
      <button
        onClick={() => playTone(freq, duration / 1000, type)}
        className="w-full flex h-9 items-center justify-center rounded-xl border border-violet-500/25 bg-violet-500/[0.08] text-xs text-violet-400 hover:bg-violet-500/[0.14] transition-all active:scale-[0.98]"
      >
        ▶ Play tone
      </button>
    </div>
  )
}
