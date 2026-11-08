'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

/* eslint-disable @typescript-eslint/no-explicit-any */

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? ''
const SCOPES = [
  'https://www.googleapis.com/auth/classroom.courses.readonly',
  'https://www.googleapis.com/auth/classroom.coursework.me.readonly',
  'https://www.googleapis.com/auth/classroom.announcements.readonly',
].join(' ')

interface Course { id: string; name: string; section?: string; descriptionHeading?: string }
interface Work {
  id: string
  title: string
  description?: string
  dueDate?: { year: number; month: number; day: number }
  maxPoints?: number
  workType?: string
  alternateLink?: string
}

function escHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function md(text: string): string {
  return text
    .replace(/```(\w*)\n?([\s\S]*?)```/g, (_, l, c) => `<pre class="cb"><code>${escHtml(c.trim())}</code></pre>`)
    .replace(/`([^`]+)`/g, '<code class="ic">$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^[•\-*] (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]+?<\/li>)+/g, m => `<ul>${m}</ul>`)
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br/>')
}

function dueLabel(w: Work): string {
  if (!w.dueDate) return 'No due date'
  const { year, month, day } = w.dueDate
  return `Due ${month}/${day}/${year}`
}

export default function ClassroomPage() {
  const [ready, setReady] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [courses, setCourses] = useState<Course[]>([])
  const [activeCourse, setActiveCourse] = useState<Course | null>(null)
  const [work, setWork] = useState<Work[]>([])
  const [activeWork, setActiveWork] = useState<Work | null>(null)
  const [loading, setLoading] = useState('')
  const [error, setError] = useState('')

  const [answer, setAnswer] = useState('')
  const [solving, setSolving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [manual, setManual] = useState('')
  const tokenClient = useRef<any>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Load Google Identity Services
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return
    if ((window as any).google?.accounts?.oauth2) { setReady(true); return }
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.defer = true
    s.onload = () => setReady(true)
    document.head.appendChild(s)
  }, [])

  function connect() {
    setError('')
    const g = (window as any).google
    if (!g?.accounts?.oauth2) { setError('Google script not loaded yet — try again in a moment.'); return }
    if (!tokenClient.current) {
      tokenClient.current = g.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: SCOPES,
        callback: (resp: any) => {
          if (resp.error) { setError(`Google auth failed: ${resp.error}`); return }
          setToken(resp.access_token)
          loadCourses(resp.access_token)
        },
      })
    }
    tokenClient.current.requestAccessToken({ prompt: '' })
  }

  const call = useCallback(async (accessToken: string, action: string, extra: Record<string, string> = {}) => {
    const res = await fetch('/api/classroom', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken, action, ...extra }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'Request failed')
    return data
  }, [])

  async function loadCourses(accessToken: string) {
    setLoading('Loading courses…'); setError('')
    try {
      const data = await call(accessToken, 'courses')
      setCourses(data.courses ?? [])
      if (!data.courses?.length) setError('No active courses found on this account.')
    } catch (e: any) { setError(e.message) } finally { setLoading('') }
  }

  async function openCourse(c: Course) {
    if (!token) return
    setActiveCourse(c); setActiveWork(null); setAnswer(''); setWork([])
    setLoading('Loading assignments…'); setError('')
    try {
      const data = await call(token, 'coursework', { courseId: c.id })
      setWork(data.courseWork ?? [])
      if (!data.courseWork?.length) setError('No assignments in this course.')
    } catch (e: any) { setError(e.message) } finally { setLoading('') }
  }

  function buildPrompt(w: Work): string {
    const parts = [`Assignment: ${w.title}`]
    if (w.description) parts.push(`\nInstructions:\n${w.description}`)
    if (w.maxPoints) parts.push(`\n(Worth ${w.maxPoints} points.)`)
    parts.push('\n\nComplete this assignment fully.')
    return parts.join('\n')
  }

  async function solve(text: string) {
    if (!text.trim() || solving) return
    setSolving(true); setAnswer(''); setCopied(false)
    abortRef.current = new AbortController()
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'homework', messages: [{ role: 'user', content: text }] }),
        signal: abortRef.current.signal,
      })
      if (!res.body) throw new Error('No response body')
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = '', acc = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          const t = line.trim()
          if (t === 'data: [DONE]') continue
          if (t.startsWith('data: ')) {
            try { const { delta } = JSON.parse(t.slice(6)); if (delta) { acc += delta; setAnswer(acc) } } catch {}
          }
        }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') setAnswer(a => a || `_Failed: ${e.message}_`)
    } finally { setSolving(false); abortRef.current = null }
  }

  async function copyAnswer() {
    await navigator.clipboard.writeText(answer)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="mx-auto max-w-5xl px-6 pt-28 pb-24 text-zinc-200">
      <style>{`
        .cb{background:rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:12px 16px;overflow-x:auto;font-family:monospace;font-size:12px;color:#a5f3fc;margin:8px 0}
        .ic{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:4px;padding:1px 5px;font-family:monospace;font-size:12px;color:#86efac}
        .ans h1{font-size:1.2rem;font-weight:700;margin:12px 0 6px}
        .ans h2{font-size:1.05rem;font-weight:600;margin:10px 0 4px}
        .ans h3{font-size:.95rem;font-weight:600;margin:8px 0 4px}
        .ans ul{list-style:disc;padding-left:20px;margin:6px 0}
        .ans p{margin:6px 0}
      `}</style>

      {/* Header */}
      <div className="mb-8">
        <div className="mb-3 flex items-center gap-2">
          <span className="font-mono text-[10px] tracking-[0.18em] text-zinc-600 uppercase">Google Classroom</span>
          <span className="h-px w-8 bg-zinc-800" />
          <span className="font-mono text-[10px] text-zinc-700">Claude-powered</span>
        </div>
        <h1 className="font-nacelle text-3xl font-semibold text-zinc-100 tracking-tight">Homework Autopilot</h1>
        <p className="mt-2 text-sm text-zinc-500 max-w-xl">
          Pull your real assignments and solve each one with Claude. Then open Classroom, Docs, or Forms
          with the extension to auto-type the answer in.
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-500/20 bg-red-500/[0.06] px-4 py-3 text-xs text-red-300">
          {error}
        </div>
      )}

      {/* Connect / setup */}
      {!token && (
        <div className="mb-8 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6">
          {GOOGLE_CLIENT_ID ? (
            <>
              <h2 className="text-sm font-semibold text-zinc-200">Connect your Classroom</h2>
              <p className="mt-1 mb-4 text-xs text-zinc-500">Read-only access to your courses and assignments. Nothing is stored.</p>
              <button
                onClick={connect}
                disabled={!ready}
                className="rounded-xl border border-white/[0.12] bg-white/[0.06] px-4 py-2 text-xs font-medium text-zinc-200 transition-all hover:bg-white/[0.1] active:scale-[0.97] disabled:opacity-40"
              >
                {ready ? 'Connect Google Classroom' : 'Loading Google…'}
              </button>
            </>
          ) : (
            <>
              <h2 className="text-sm font-semibold text-amber-300">Google Classroom not configured</h2>
              <p className="mt-1 text-xs text-zinc-500 leading-relaxed">
                To pull assignments automatically, set <code className="ic">NEXT_PUBLIC_GOOGLE_CLIENT_ID</code> in your
                environment (a Google Cloud OAuth client ID with the Classroom API enabled). See <code className="ic">HOMEWORK_SETUP.md</code>.
                Until then, the manual solver below still works.
              </p>
            </>
          )}
        </div>
      )}

      {loading && <div className="mb-6 text-xs text-zinc-500 animate-pulse">{loading}</div>}

      {/* Courses + work */}
      {token && (
        <div className="mb-10 grid gap-4 md:grid-cols-[260px_1fr]">
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.015] p-3">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-zinc-600">Courses</div>
            <div className="flex flex-col gap-1">
              {courses.map(c => (
                <button
                  key={c.id}
                  onClick={() => openCourse(c)}
                  className={`rounded-lg px-3 py-2 text-left text-xs transition-colors ${
                    activeCourse?.id === c.id ? 'bg-white/[0.08] text-zinc-100' : 'text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300'
                  }`}
                >
                  {c.name}
                  {c.section && <span className="block text-[10px] text-zinc-600">{c.section}</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.015] p-3">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-zinc-600">
              {activeCourse ? activeCourse.name : 'Select a course'}
            </div>
            <div className="flex flex-col gap-1.5">
              {work.map(w => (
                <div key={w.id} className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm text-zinc-200">{w.title}</div>
                      <div className="mt-0.5 font-mono text-[10px] text-zinc-600">{dueLabel(w)}{w.maxPoints ? ` · ${w.maxPoints} pts` : ''}</div>
                    </div>
                    <button
                      onClick={() => { setActiveWork(w); solve(buildPrompt(w)) }}
                      className="flex-shrink-0 rounded-lg border border-violet-500/25 bg-violet-500/[0.08] px-3 py-1.5 text-[11px] font-medium text-violet-300 transition-all hover:bg-violet-500/[0.15] active:scale-[0.97]"
                    >
                      Solve
                    </button>
                  </div>
                  {w.description && <p className="mt-2 line-clamp-2 text-[11px] text-zinc-600">{w.description}</p>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Answer panel */}
      {(activeWork || answer || solving) && (
        <div className="mb-10 rounded-2xl border border-violet-500/15 bg-violet-500/[0.03] p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold text-zinc-200">{activeWork ? activeWork.title : 'Answer'}</div>
            <div className="flex items-center gap-2">
              {solving && <button onClick={() => abortRef.current?.abort()} className="text-[10px] font-mono text-red-400">Stop</button>}
              {answer && !solving && (
                <button onClick={copyAnswer} className="text-[10px] font-mono text-zinc-500 hover:text-zinc-200">{copied ? 'Copied ✓' : 'Copy'}</button>
              )}
            </div>
          </div>
          {answer
            ? <div className="ans text-sm leading-relaxed text-zinc-200" dangerouslySetInnerHTML={{ __html: `<p>${md(answer)}</p>` }} />
            : <div className="text-xs text-zinc-600 animate-pulse">Claude is working…</div>}
        </div>
      )}

      {/* Manual solver */}
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.015] p-5">
        <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-zinc-600">Manual solver</div>
        <p className="mb-3 text-xs text-zinc-500">Paste any question, prompt, or assignment — Claude solves it. Works without Google.</p>
        <textarea
          value={manual}
          onChange={e => setManual(e.target.value)}
          placeholder="Paste a question or assignment here…"
          rows={4}
          className="w-full resize-none rounded-xl border border-white/[0.08] bg-[#0A0A0C] px-4 py-3 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none"
        />
        <button
          onClick={() => { setActiveWork(null); solve(manual) }}
          disabled={!manual.trim() || solving}
          className="mt-3 rounded-xl border border-white/[0.12] bg-white/[0.06] px-4 py-2 text-xs font-medium text-zinc-200 transition-all hover:bg-white/[0.1] active:scale-[0.97] disabled:opacity-40"
        >
          {solving ? 'Solving…' : 'Solve with Claude'}
        </button>
      </div>
    </div>
  )
}
