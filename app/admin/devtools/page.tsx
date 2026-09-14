'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import { canAdmin } from '@/lib/utils'
import Link from 'next/link'

type DevTab = 'rest' | 'json' | 'jwt' | 'hash' | 'base64' | 'regex' | 'css' | 'console' | 'monitor'

// ── Crypto helpers ───────────────────────────────────────
async function sha(text: string, algo: string) {
  const buf = await crypto.subtle.digest(algo, new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}
function b64e(s: string) { try { return btoa(unescape(encodeURIComponent(s))) } catch { return 'Error' } }
function b64d(s: string) { try { return decodeURIComponent(escape(atob(s))) } catch { return 'Invalid base64' } }

export default function DevToolsPage() {
  const [user, setUser] = useState<User | null>(null)
  const [role, setRole] = useState('user')
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<DevTab>('rest')
  const sb = createClient()

  useEffect(() => {
    sb.auth.getUser().then(async ({ data }) => {
      const u = data.user
      setUser(u)
      if (!u) { setLoading(false); return }
      const { data: p } = await sb.from('profiles').select('role').eq('id', u.id).single()
      const r = p?.role ?? 'user'
      setRole(r)
      setLoading(false)
    })
  }, [])

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center pt-14">
      <p className="mono text-xs text-zinc-600">Loading…</p>
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

  const TABS: { id: DevTab; label: string; icon: string }[] = [
    { id: 'rest', label: 'REST', icon: '🌐' },
    { id: 'json', label: 'JSON', icon: '{ }' },
    { id: 'jwt', label: 'JWT', icon: '🔑' },
    { id: 'hash', label: 'Hash', icon: '#' },
    { id: 'base64', label: 'Base64', icon: '64' },
    { id: 'regex', label: 'Regex', icon: '.*' },
    { id: 'css', label: 'CSS Gen', icon: '🎨' },
    { id: 'console', label: 'Console', icon: '>' },
    { id: 'monitor', label: 'Monitor', icon: '📊' },
  ]

  return (
    <div className="mx-auto max-w-6xl px-6 pt-28 pb-20">
      <div className="mb-8">
        <div className="mb-3 flex items-center gap-2">
          <Link href="/admin" className="mono text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors">← Admin</Link>
          <span className="h-px w-4 bg-zinc-800" />
          <span className="mono text-[10px] tracking-[0.15em] text-zinc-600 uppercase">Dev Studio</span>
        </div>
        <h1 className="font-nacelle text-3xl font-semibold text-zinc-100 tracking-tight">Developer Tools</h1>
        <p className="mt-1 text-sm text-zinc-500">REST tester · JSON · JWT · Hash · Base64 · Regex · CSS · Console · Monitor</p>
      </div>

      {/* Tab bar — scrollable */}
      <div className="mb-8 flex items-center gap-1 rounded-xl glass-card p-1 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200 flex items-center gap-1.5 active:scale-[0.98] ${
              tab === t.id ? 'bg-zinc-700/60 border border-white/[0.1] text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <span className="mono">{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      {tab === 'rest' && <RestTester />}
      {tab === 'json' && <JsonTool />}
      {tab === 'jwt' && <JwtDecoder />}
      {tab === 'hash' && <HashTool />}
      {tab === 'base64' && <Base64Tool />}
      {tab === 'regex' && <RegexTool />}
      {tab === 'css' && <CssTool />}
      {tab === 'console' && <ConsoleSandbox />}
      {tab === 'monitor' && <PerformanceMonitor />}
    </div>
  )
}

// ── REST Tester ──────────────────────────────────────────
function RestTester() {
  const [method, setMethod] = useState<'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'>('GET')
  const [url, setUrl] = useState('')
  const [headers, setHeaders] = useState('{\n  "Content-Type": "application/json"\n}')
  const [body, setBody] = useState('')
  const [res, setRes] = useState<{ status: number; time: number; body: string; headers: Record<string, string> } | null>(null)
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<Array<{ method: string; url: string; status: number }>>([])

  async function send() {
    if (!url.trim()) return
    setLoading(true)
    const t0 = Date.now()
    try {
      let parsedHeaders: Record<string, string> = {}
      try { parsedHeaders = JSON.parse(headers) } catch {}
      const opts: RequestInit = { method, headers: parsedHeaders }
      if (method !== 'GET' && body.trim()) opts.body = body
      const r = await fetch(url, opts)
      const resHeaders: Record<string, string> = {}
      r.headers.forEach((v, k) => { resHeaders[k] = v })
      const text = await r.text()
      let pretty = text
      try { pretty = JSON.stringify(JSON.parse(text), null, 2) } catch {}
      setRes({ status: r.status, time: Date.now() - t0, body: pretty, headers: resHeaders })
      setHistory(h => [{ method, url, status: r.status }, ...h].slice(0, 10))
    } catch (e) {
      setRes({ status: 0, time: Date.now() - t0, body: String(e), headers: {} })
    }
    setLoading(false)
  }

  const statusColor = res
    ? res.status >= 200 && res.status < 300 ? 'text-emerald-400'
      : res.status >= 400 ? 'text-rose-400'
      : 'text-amber-400'
    : ''

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-2xl p-5 space-y-3">
        <p className="mono text-[10px] tracking-[0.15em] text-zinc-600 uppercase">Request</p>
        <div className="flex gap-2">
          {(['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] as const).map(m => (
            <button key={m} onClick={() => setMethod(m)}
              className={`rounded-lg px-3 py-1.5 text-xs font-mono font-medium transition-all active:scale-[0.97] ${method === m ? 'bg-zinc-700 border border-white/[0.12] text-zinc-100' : 'border border-white/[0.06] text-zinc-600 hover:text-zinc-300'}`}>
              {m}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            className="flex-1 h-9 rounded-xl border border-white/[0.08] bg-zinc-900/60 px-3 text-xs font-mono text-zinc-200 placeholder:text-zinc-600 focus:border-white/[0.18] focus:outline-none transition-all"
            placeholder="https://api.example.com/endpoint"
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send()}
          />
          <button onClick={send} disabled={loading || !url.trim()}
            className="flex h-9 items-center px-5 rounded-xl border border-blue-500/25 bg-blue-500/[0.1] text-xs text-blue-400 hover:bg-blue-500/[0.18] transition-all active:scale-[0.98] disabled:opacity-40">
            {loading ? '…' : 'Send'}
          </button>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <div>
            <p className="mono text-[10px] text-zinc-600 mb-1.5">Headers (JSON)</p>
            <textarea className="w-full h-28 resize-none rounded-xl border border-white/[0.07] bg-zinc-950/50 px-3 py-2 text-xs font-mono text-zinc-300 focus:border-white/[0.15] focus:outline-none transition-all"
              value={headers} onChange={e => setHeaders(e.target.value)} />
          </div>
          {method !== 'GET' && (
            <div>
              <p className="mono text-[10px] text-zinc-600 mb-1.5">Body</p>
              <textarea className="w-full h-28 resize-none rounded-xl border border-white/[0.07] bg-zinc-950/50 px-3 py-2 text-xs font-mono text-zinc-300 focus:border-white/[0.15] focus:outline-none transition-all"
                value={body} onChange={e => setBody(e.target.value)} placeholder='{"key": "value"}' />
            </div>
          )}
        </div>
      </div>

      {res && (
        <div className="glass-card rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-4">
            <span className={`mono text-sm font-bold ${statusColor}`}>{res.status || 'ERR'}</span>
            <span className="mono text-xs text-zinc-600">{res.time}ms</span>
          </div>
          <pre className="max-h-64 overflow-auto rounded-xl bg-zinc-950/60 p-4 text-xs font-mono text-zinc-300 leading-relaxed">{res.body}</pre>
          {Object.keys(res.headers).length > 0 && (
            <details className="text-xs">
              <summary className="mono text-[10px] text-zinc-600 cursor-pointer hover:text-zinc-400">Response headers</summary>
              <pre className="mt-2 rounded-xl bg-zinc-950/40 p-3 font-mono text-zinc-500">
                {Object.entries(res.headers).map(([k, v]) => `${k}: ${v}`).join('\n')}
              </pre>
            </details>
          )}
        </div>
      )}

      {history.length > 0 && (
        <div className="glass-card rounded-2xl p-5 space-y-2">
          <p className="mono text-[10px] tracking-[0.15em] text-zinc-600 uppercase">History</p>
          {history.map((h, i) => (
            <button key={i} onClick={() => setUrl(h.url)}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 hover:bg-white/[0.04] transition-all text-left">
              <span className="mono text-[10px] text-zinc-600">{h.method}</span>
              <span className="mono text-xs text-zinc-400 flex-1 truncate">{h.url}</span>
              <span className={`mono text-[10px] ${h.status >= 200 && h.status < 300 ? 'text-emerald-500' : 'text-rose-500'}`}>{h.status}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── JSON Tool ────────────────────────────────────────────
function JsonTool() {
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [err, setErr] = useState('')

  function process(action: 'format' | 'minify' | 'validate') {
    try {
      const parsed = JSON.parse(input)
      setErr('')
      if (action === 'format') setOutput(JSON.stringify(parsed, null, 2))
      else if (action === 'minify') setOutput(JSON.stringify(parsed))
      else setOutput('✓ Valid JSON — ' + JSON.stringify(parsed).length + ' chars when minified')
    } catch (e) {
      setErr(String(e))
      setOutput('')
    }
  }

  return (
    <div className="glass-card rounded-2xl p-5 space-y-4">
      <p className="mono text-[10px] tracking-[0.15em] text-zinc-600 uppercase">JSON Formatter / Validator</p>
      <textarea
        className="w-full h-48 resize-none rounded-xl border border-white/[0.07] bg-zinc-950/50 px-4 py-3 text-xs font-mono text-zinc-200 focus:border-white/[0.15] focus:outline-none transition-all"
        placeholder='Paste JSON here…'
        value={input}
        onChange={e => setInput(e.target.value)}
      />
      {err && <p className="mono text-xs text-rose-400">{err}</p>}
      <div className="flex gap-2">
        <button onClick={() => process('format')} className="flex-1 h-8 rounded-xl border border-blue-500/20 bg-blue-500/[0.07] text-xs text-blue-400 hover:bg-blue-500/[0.14] transition-all active:scale-[0.98]">Format</button>
        <button onClick={() => process('minify')} className="flex-1 h-8 rounded-xl border border-violet-500/20 bg-violet-500/[0.07] text-xs text-violet-400 hover:bg-violet-500/[0.14] transition-all active:scale-[0.98]">Minify</button>
        <button onClick={() => process('validate')} className="flex-1 h-8 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.07] text-xs text-emerald-400 hover:bg-emerald-500/[0.14] transition-all active:scale-[0.98]">Validate</button>
        <button onClick={() => { setInput(''); setOutput(''); setErr('') }} className="h-8 px-3 rounded-xl border border-white/[0.06] text-xs text-zinc-600 hover:text-zinc-300 transition-all">Clear</button>
      </div>
      {output && (
        <pre className="max-h-64 overflow-auto rounded-xl bg-zinc-950/60 p-4 text-xs font-mono text-zinc-300 leading-relaxed">{output}</pre>
      )}
    </div>
  )
}

// ── JWT Decoder ──────────────────────────────────────────
function JwtDecoder() {
  const [token, setToken] = useState('')

  function decode() {
    const parts = token.trim().split('.')
    if (parts.length !== 3) return null
    try {
      const header = JSON.parse(atob(parts[0].replace(/-/g, '+').replace(/_/g, '/')))
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
      return { header, payload, signature: parts[2] }
    } catch { return null }
  }

  const decoded = token.trim() ? decode() : null
  const exp = decoded?.payload?.exp ? new Date(decoded.payload.exp * 1000) : null
  const expired = exp ? exp < new Date() : false

  return (
    <div className="glass-card rounded-2xl p-5 space-y-4">
      <p className="mono text-[10px] tracking-[0.15em] text-zinc-600 uppercase">JWT Decoder</p>
      <textarea
        className="w-full h-24 resize-none rounded-xl border border-white/[0.07] bg-zinc-950/50 px-4 py-3 text-xs font-mono text-zinc-200 focus:border-white/[0.15] focus:outline-none transition-all break-all"
        placeholder="Paste JWT token here…"
        value={token}
        onChange={e => setToken(e.target.value)}
      />
      {token && !decoded && <p className="mono text-xs text-rose-400">Invalid JWT format</p>}
      {decoded && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <p className="mono text-[10px] text-zinc-600">Header</p>
            <pre className="rounded-xl bg-zinc-950/60 p-3 text-xs font-mono text-blue-300 overflow-auto">{JSON.stringify(decoded.header, null, 2)}</pre>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <p className="mono text-[10px] text-zinc-600">Payload</p>
              {exp && (
                <span className={`mono text-[9px] rounded-full px-1.5 py-0.5 border ${expired ? 'text-rose-400 border-rose-500/20 bg-rose-500/[0.07]' : 'text-emerald-400 border-emerald-500/20 bg-emerald-500/[0.07]'}`}>
                  {expired ? 'EXPIRED' : 'VALID'} · {exp.toLocaleString()}
                </span>
              )}
            </div>
            <pre className="rounded-xl bg-zinc-950/60 p-3 text-xs font-mono text-emerald-300 overflow-auto">{JSON.stringify(decoded.payload, null, 2)}</pre>
          </div>
          <div className="lg:col-span-2 space-y-2">
            <p className="mono text-[10px] text-zinc-600">Signature</p>
            <p className="mono text-xs text-zinc-500 break-all">{decoded.signature}</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Hash Generator ───────────────────────────────────────
function HashTool() {
  const [input, setInput] = useState('')
  const [hashes, setHashes] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  async function compute() {
    if (!input) return
    setBusy(true)
    const [h1, h256, h512] = await Promise.all([
      sha(input, 'SHA-1'),
      sha(input, 'SHA-256'),
      sha(input, 'SHA-512'),
    ])
    setHashes({ 'SHA-1': h1, 'SHA-256': h256, 'SHA-512': h512, 'Base64': b64e(input) })
    setBusy(false)
  }

  return (
    <div className="glass-card rounded-2xl p-5 space-y-4">
      <p className="mono text-[10px] tracking-[0.15em] text-zinc-600 uppercase">Hash Generator</p>
      <div className="flex gap-2">
        <input
          className="flex-1 h-9 rounded-xl border border-white/[0.08] bg-zinc-900/60 px-3 text-xs font-mono text-zinc-200 placeholder:text-zinc-600 focus:border-white/[0.18] focus:outline-none transition-all"
          placeholder="Text to hash…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && compute()}
        />
        <button onClick={compute} disabled={busy || !input}
          className="flex h-9 items-center px-4 rounded-xl border border-violet-500/20 bg-violet-500/[0.08] text-xs text-violet-400 hover:bg-violet-500/[0.14] transition-all active:scale-[0.98] disabled:opacity-40">
          {busy ? '…' : 'Hash'}
        </button>
      </div>
      {Object.entries(hashes).map(([algo, hash]) => (
        <div key={algo} className="rounded-xl border border-white/[0.06] bg-zinc-950/40 px-4 py-3">
          <p className="mono text-[10px] text-zinc-600 mb-1">{algo}</p>
          <p className="mono text-xs text-zinc-300 break-all select-all">{hash}</p>
        </div>
      ))}
    </div>
  )
}

// ── Base64 Tool ──────────────────────────────────────────
function Base64Tool() {
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')

  return (
    <div className="glass-card rounded-2xl p-5 space-y-4">
      <p className="mono text-[10px] tracking-[0.15em] text-zinc-600 uppercase">Base64 Encoder / Decoder</p>
      <textarea
        className="w-full h-32 resize-none rounded-xl border border-white/[0.07] bg-zinc-950/50 px-4 py-3 text-xs font-mono text-zinc-200 focus:border-white/[0.15] focus:outline-none transition-all"
        placeholder="Text or base64 string…"
        value={input}
        onChange={e => setInput(e.target.value)}
      />
      <div className="flex gap-2">
        <button onClick={() => setOutput(b64e(input))} className="flex-1 h-8 rounded-xl border border-blue-500/20 bg-blue-500/[0.07] text-xs text-blue-400 hover:bg-blue-500/[0.14] transition-all active:scale-[0.98]">Encode</button>
        <button onClick={() => setOutput(b64d(input))} className="flex-1 h-8 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.07] text-xs text-emerald-400 hover:bg-emerald-500/[0.14] transition-all active:scale-[0.98]">Decode</button>
        <button onClick={() => { setOutput(''); setInput('') }} className="h-8 px-3 rounded-xl border border-white/[0.06] text-xs text-zinc-600 hover:text-zinc-300 transition-all">Clear</button>
      </div>
      {output && (
        <div className="rounded-xl border border-white/[0.06] bg-zinc-950/40 px-4 py-3">
          <p className="mono text-xs text-zinc-300 break-all select-all">{output}</p>
        </div>
      )}
    </div>
  )
}

// ── Regex Tester ─────────────────────────────────────────
function RegexTool() {
  const [pattern, setPattern] = useState('')
  const [flags, setFlags] = useState('g')
  const [text, setText] = useState('')

  function getMatches() {
    if (!pattern || !text) return []
    try {
      const re = new RegExp(pattern, flags)
      const matches: Array<{ match: string; index: number }> = []
      let m
      const re2 = new RegExp(pattern, flags.includes('g') ? flags : flags + 'g')
      while ((m = re2.exec(text)) !== null) {
        matches.push({ match: m[0], index: m.index })
        if (!flags.includes('g')) break
      }
      return matches
    } catch { return [] }
  }

  function getHighlighted() {
    if (!pattern || !text) return text
    try {
      return text.replace(new RegExp(pattern, flags.includes('g') ? flags : flags + 'g'), '<mark class="bg-amber-400/30 text-amber-200 rounded px-0.5">$&</mark>')
    } catch { return text }
  }

  const matches = getMatches()

  const CHEATSHEET = [
    ['.', 'Any char'], ['\\d', 'Digit'], ['\\w', 'Word char'], ['\\s', 'Whitespace'],
    ['^', 'Start'], ['$', 'End'], ['*', '0 or more'], ['+', '1 or more'],
    ['?', '0 or 1'], ['{n}', 'Exactly n'], ['[abc]', 'Char class'], ['(x|y)', 'Or'],
  ]

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-2xl p-5 space-y-4">
        <p className="mono text-[10px] tracking-[0.15em] text-zinc-600 uppercase">Regex Tester</p>
        <div className="flex gap-2 items-center">
          <span className="mono text-zinc-600">/</span>
          <input
            className="flex-1 h-9 rounded-xl border border-white/[0.08] bg-zinc-900/60 px-3 text-xs font-mono text-zinc-200 placeholder:text-zinc-600 focus:border-white/[0.18] focus:outline-none transition-all"
            placeholder="pattern"
            value={pattern}
            onChange={e => setPattern(e.target.value)}
          />
          <span className="mono text-zinc-600">/</span>
          <input
            className="w-16 h-9 rounded-xl border border-white/[0.08] bg-zinc-900/60 px-3 text-xs font-mono text-zinc-200 focus:border-white/[0.18] focus:outline-none transition-all"
            value={flags}
            onChange={e => setFlags(e.target.value)}
            maxLength={6}
          />
          <span className={`mono text-xs ${matches.length > 0 ? 'text-emerald-400' : pattern ? 'text-zinc-600' : 'text-zinc-700'}`}>
            {pattern ? `${matches.length} match${matches.length !== 1 ? 'es' : ''}` : ''}
          </span>
        </div>
        <textarea
          className="w-full h-32 resize-none rounded-xl border border-white/[0.07] bg-zinc-950/50 px-4 py-3 text-xs font-mono text-zinc-200 focus:border-white/[0.15] focus:outline-none transition-all"
          placeholder="Test string here…"
          value={text}
          onChange={e => setText(e.target.value)}
        />
        {text && pattern && (
          <div className="rounded-xl border border-white/[0.06] bg-zinc-950/40 px-4 py-3">
            <p className="mono text-[10px] text-zinc-600 mb-1.5">Highlighted matches</p>
            <p className="text-xs text-zinc-400 leading-relaxed" dangerouslySetInnerHTML={{ __html: getHighlighted() }} />
          </div>
        )}
      </div>

      <div className="glass-card rounded-2xl p-5">
        <p className="mono text-[10px] tracking-[0.15em] text-zinc-600 uppercase mb-3">Cheat Sheet</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {CHEATSHEET.map(([token, desc]) => (
            <button key={token} onClick={() => setPattern(p => p + token)}
              className="flex items-center gap-2 rounded-lg border border-white/[0.05] bg-zinc-900/40 px-3 py-2 hover:bg-zinc-800/60 transition-all text-left">
              <span className="mono text-xs text-violet-400">{token}</span>
              <span className="text-[10px] text-zinc-600">{desc}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── CSS Generator ────────────────────────────────────────
function CssTool() {
  const [mode, setMode] = useState<'gradient' | 'shadow' | 'glass'>('glass')
  const [blur, setBlur] = useState(16)
  const [opacity, setOpacity] = useState(20)
  const [gradFrom, setGradFrom] = useState('#6366f1')
  const [gradTo, setGradTo] = useState('#8b5cf6')
  const [gradAngle, setGradAngle] = useState(135)
  const [shadowX, setShadowX] = useState(0)
  const [shadowY, setShadowY] = useState(8)
  const [shadowBlur, setShadowBlur] = useState(32)
  const [shadowColor, setShadowColor] = useState('#000000')
  const [shadowOpacity, setShadowOpacity] = useState(40)

  const glassCss = `backdrop-filter: blur(${blur}px) saturate(1.8);
background: rgba(255, 255, 255, ${opacity / 100});
border: 1px solid rgba(255, 255, 255, 0.12);
border-radius: 16px;`

  const gradCss = `background: linear-gradient(${gradAngle}deg, ${gradFrom}, ${gradTo});`

  const r = parseInt(shadowColor.slice(1, 3), 16)
  const g = parseInt(shadowColor.slice(3, 5), 16)
  const b = parseInt(shadowColor.slice(5, 7), 16)
  const shadowCss = `box-shadow: ${shadowX}px ${shadowY}px ${shadowBlur}px rgba(${r}, ${g}, ${b}, ${shadowOpacity / 100});`

  const css = mode === 'glass' ? glassCss : mode === 'gradient' ? gradCss : shadowCss

  return (
    <div className="glass-card rounded-2xl p-5 space-y-5">
      <div className="flex items-center justify-between">
        <p className="mono text-[10px] tracking-[0.15em] text-zinc-600 uppercase">CSS Generator</p>
        <div className="flex gap-1">
          {(['glass', 'gradient', 'shadow'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`rounded-lg px-3 py-1 text-xs transition-all ${mode === m ? 'bg-zinc-700 text-zinc-100 border border-white/[0.1]' : 'text-zinc-600 hover:text-zinc-300'}`}>
              {m}
            </button>
          ))}
        </div>
      </div>

      {mode === 'glass' && (
        <div className="space-y-4">
          <Slider label="Blur" value={blur} min={0} max={60} onChange={setBlur} unit="px" />
          <Slider label="Opacity" value={opacity} min={0} max={100} onChange={setOpacity} unit="%" />
          <div
            className="h-24 rounded-2xl flex items-center justify-center text-xs text-white/60"
            style={{ backdropFilter: `blur(${blur}px)`, background: `rgba(255,255,255,${opacity / 100})`, border: '1px solid rgba(255,255,255,0.12)' }}
          >
            Glass preview
          </div>
        </div>
      )}

      {mode === 'gradient' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="mono text-[10px] text-zinc-600 mb-1">From</p>
              <input type="color" value={gradFrom} onChange={e => setGradFrom(e.target.value)} className="h-9 w-full rounded-xl cursor-pointer bg-transparent border border-white/[0.08]" />
            </div>
            <div>
              <p className="mono text-[10px] text-zinc-600 mb-1">To</p>
              <input type="color" value={gradTo} onChange={e => setGradTo(e.target.value)} className="h-9 w-full rounded-xl cursor-pointer bg-transparent border border-white/[0.08]" />
            </div>
          </div>
          <Slider label="Angle" value={gradAngle} min={0} max={360} onChange={setGradAngle} unit="°" />
          <div className="h-24 rounded-2xl" style={{ background: `linear-gradient(${gradAngle}deg, ${gradFrom}, ${gradTo})` }} />
        </div>
      )}

      {mode === 'shadow' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Slider label="X offset" value={shadowX} min={-40} max={40} onChange={setShadowX} unit="px" />
            <Slider label="Y offset" value={shadowY} min={-40} max={40} onChange={setShadowY} unit="px" />
            <Slider label="Blur" value={shadowBlur} min={0} max={100} onChange={setShadowBlur} unit="px" />
            <Slider label="Opacity" value={shadowOpacity} min={0} max={100} onChange={setShadowOpacity} unit="%" />
          </div>
          <div className="flex items-center gap-2">
            <p className="mono text-[10px] text-zinc-600">Color</p>
            <input type="color" value={shadowColor} onChange={e => setShadowColor(e.target.value)} className="h-7 w-14 rounded-lg cursor-pointer bg-transparent border border-white/[0.08]" />
          </div>
          <div className="h-24 rounded-2xl bg-zinc-800/60 flex items-center justify-center">
            <div className="h-12 w-32 rounded-xl bg-zinc-600/80" style={{ boxShadow: `${shadowX}px ${shadowY}px ${shadowBlur}px rgba(${r},${g},${b},${shadowOpacity / 100})` }} />
          </div>
        </div>
      )}

      <div className="rounded-xl border border-white/[0.06] bg-zinc-950/50 px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <p className="mono text-[10px] text-zinc-600">Generated CSS</p>
          <button onClick={() => navigator.clipboard.writeText(css)} className="mono text-[10px] text-zinc-600 hover:text-zinc-300 transition-colors">Copy</button>
        </div>
        <pre className="text-xs font-mono text-emerald-300 whitespace-pre-wrap">{css}</pre>
      </div>
    </div>
  )
}

function Slider({ label, value, min, max, onChange, unit }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void; unit: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="mono text-[10px] text-zinc-600">{label}</p>
        <p className="mono text-[10px] text-zinc-400">{value}{unit}</p>
      </div>
      <input type="range" min={min} max={max} value={value} onChange={e => onChange(Number(e.target.value))} className="w-full accent-violet-500" />
    </div>
  )
}

// ── Console Sandbox ──────────────────────────────────────
function ConsoleSandbox() {
  const [code, setCode] = useState('// Write JavaScript here\nconst nums = [1, 2, 3, 4, 5]\nconsole.log("Sum:", nums.reduce((a,b) => a+b, 0))\nconsole.log("Array:", nums.map(x => x * x))')
  const [logs, setLogs] = useState<Array<{ type: string; args: string[] }>>([])
  const [error, setError] = useState('')
  const [saved, setSaved] = useState<Array<{ name: string; code: string }>>(() => {
    try { return JSON.parse(localStorage.getItem('devtools_snippets') || '[]') } catch { return [] }
  })
  const [snippetName, setSnippetName] = useState('')

  function run() {
    setLogs([])
    setError('')
    const captured: Array<{ type: string; args: string[] }> = []
    const proxy = new Proxy(console, {
      get(target, prop) {
        if (['log', 'warn', 'error', 'info'].includes(String(prop))) {
          return (...args: unknown[]) => {
            captured.push({ type: String(prop), args: args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)) })
          }
        }
        return (target as Record<string, unknown>)[String(prop)]
      }
    })
    try {
      // eslint-disable-next-line no-new-func
      new Function('console', code)(proxy)
      setLogs(captured)
    } catch (e) {
      setError(String(e))
      setLogs(captured)
    }
  }

  function saveSnippet() {
    if (!snippetName.trim()) return
    const s = [...saved, { name: snippetName.trim(), code }]
    setSaved(s)
    localStorage.setItem('devtools_snippets', JSON.stringify(s))
    setSnippetName('')
  }

  const logColors: Record<string, string> = {
    log: 'text-zinc-300', warn: 'text-amber-400', error: 'text-rose-400', info: 'text-blue-400'
  }

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="mono text-[10px] tracking-[0.15em] text-zinc-600 uppercase">JS Sandbox</p>
          <button onClick={run} className="flex h-8 items-center gap-1.5 px-4 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.08] text-xs text-emerald-400 hover:bg-emerald-500/[0.14] transition-all active:scale-[0.98]">
            ▶ Run
          </button>
        </div>
        <textarea
          className="w-full h-48 resize-none rounded-xl border border-white/[0.07] bg-zinc-950/50 px-4 py-3 text-xs font-mono text-zinc-200 focus:border-white/[0.15] focus:outline-none transition-all leading-relaxed"
          value={code}
          onChange={e => setCode(e.target.value)}
          spellCheck={false}
        />
        <div className="flex gap-2">
          <input
            className="flex-1 h-8 rounded-xl border border-white/[0.07] bg-zinc-900/40 px-3 text-xs font-mono text-zinc-400 placeholder:text-zinc-700 focus:border-white/[0.14] focus:outline-none transition-all"
            placeholder="Snippet name…"
            value={snippetName}
            onChange={e => setSnippetName(e.target.value)}
          />
          <button onClick={saveSnippet} className="flex h-8 items-center px-3 rounded-xl border border-zinc-700 text-xs text-zinc-500 hover:text-zinc-300 transition-all">Save</button>
        </div>
      </div>

      {/* Output console */}
      <div className="glass-card rounded-2xl p-5 space-y-2">
        <div className="flex items-center justify-between">
          <p className="mono text-[10px] tracking-[0.15em] text-zinc-600 uppercase">Output</p>
          <button onClick={() => { setLogs([]); setError('') }} className="mono text-[10px] text-zinc-700 hover:text-zinc-400 transition-colors">Clear</button>
        </div>
        <div className="min-h-24 max-h-64 overflow-auto rounded-xl bg-zinc-950/60 p-4 space-y-1">
          {logs.length === 0 && !error && <span className="mono text-xs text-zinc-700">— run code to see output —</span>}
          {logs.map((l, i) => (
            <div key={i} className={`mono text-xs flex gap-2 ${logColors[l.type] ?? 'text-zinc-300'}`}>
              <span className="text-zinc-700">&gt;</span>
              <pre className="whitespace-pre-wrap">{l.args.join(' ')}</pre>
            </div>
          ))}
          {error && <div className="mono text-xs text-rose-400">✗ {error}</div>}
        </div>
      </div>

      {/* Saved snippets */}
      {saved.length > 0 && (
        <div className="glass-card rounded-2xl p-5 space-y-2">
          <p className="mono text-[10px] tracking-[0.15em] text-zinc-600 uppercase">Saved Snippets</p>
          {saved.map((s, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg border border-white/[0.05] px-3 py-2">
              <button onClick={() => setCode(s.code)} className="flex-1 text-xs text-zinc-400 hover:text-zinc-200 text-left transition-colors">{s.name}</button>
              <button onClick={() => { const n = saved.filter((_, j) => j !== i); setSaved(n); localStorage.setItem('devtools_snippets', JSON.stringify(n)) }}
                className="mono text-[10px] text-zinc-700 hover:text-rose-400 transition-colors">✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Performance Monitor ──────────────────────────────────
function PerformanceMonitor() {
  const [fps, setFps] = useState(0)
  const [memory, setMemory] = useState<{ used: number; total: number } | null>(null)
  const [ping, setPing] = useState<number | null>(null)
  const [domCount, setDomCount] = useState(0)
  const [active, setActive] = useState(false)
  const rafRef = useRef<number>(0)
  const framesRef = useRef(0)
  const lastRef = useRef(performance.now())

  const tick = useCallback(() => {
    framesRef.current++
    const now = performance.now()
    if (now - lastRef.current >= 1000) {
      setFps(framesRef.current)
      framesRef.current = 0
      lastRef.current = now
      setDomCount(document.querySelectorAll('*').length)
      const mem = (performance as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }).memory
      if (mem) setMemory({ used: mem.usedJSHeapSize, total: mem.totalJSHeapSize })
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [])

  useEffect(() => {
    if (active) {
      rafRef.current = requestAnimationFrame(tick)
    } else {
      cancelAnimationFrame(rafRef.current)
    }
    return () => cancelAnimationFrame(rafRef.current)
  }, [active, tick])

  async function measurePing() {
    const t0 = performance.now()
    try {
      await fetch(location.origin + '/', { method: 'HEAD', cache: 'no-store' })
      setPing(Math.round(performance.now() - t0))
    } catch {
      setPing(-1)
    }
  }

  function fmtBytes(b: number) {
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB'
    return (b / (1024 * 1024)).toFixed(1) + ' MB'
  }

  const stats = [
    { label: 'FPS', value: active ? fps : '—', color: fps >= 50 ? 'text-emerald-400' : fps >= 30 ? 'text-amber-400' : 'text-rose-400' },
    { label: 'DOM nodes', value: active ? domCount : '—', color: 'text-zinc-300' },
    { label: 'JS Heap', value: memory ? fmtBytes(memory.used) : '—', color: 'text-zinc-300' },
    { label: 'Heap total', value: memory ? fmtBytes(memory.total) : '—', color: 'text-zinc-500' },
    { label: 'Page ping', value: ping !== null ? (ping === -1 ? 'err' : ping + 'ms') : '—', color: ping !== null && ping >= 0 && ping < 100 ? 'text-emerald-400' : 'text-amber-400' },
  ]

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <p className="mono text-[10px] tracking-[0.15em] text-zinc-600 uppercase">Performance Monitor</p>
          <div className="flex gap-2">
            <button onClick={measurePing} className="flex h-8 items-center px-3 rounded-xl border border-blue-500/20 text-xs text-blue-400 hover:bg-blue-500/[0.08] transition-all active:scale-[0.98]">Ping</button>
            <button onClick={() => setActive(a => !a)}
              className={`flex h-8 items-center px-4 rounded-xl border text-xs transition-all active:scale-[0.98] ${active ? 'border-rose-500/25 bg-rose-500/[0.08] text-rose-400 hover:bg-rose-500/[0.14]' : 'border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-400 hover:bg-emerald-500/[0.14]'}`}>
              {active ? '■ Stop' : '▶ Start'}
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {stats.map(s => (
            <div key={s.label} className="rounded-xl border border-white/[0.06] bg-zinc-950/40 px-4 py-3">
              <p className="mono text-[10px] text-zinc-600 mb-1">{s.label}</p>
              <p className={`mono text-xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
        <p className="mono text-[10px] text-zinc-700">JS Heap requires Chrome/Edge. FPS counter uses requestAnimationFrame.</p>
      </div>
    </div>
  )
}
