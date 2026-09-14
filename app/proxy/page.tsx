'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

const QUICK_LINKS = [
  { label: 'Google', url: 'https://www.google.com', icon: '🔍' },
  { label: 'YouTube', url: 'https://www.youtube.com', icon: '▶️' },
  { label: 'Wikipedia', url: 'https://www.wikipedia.org', icon: '📖' },
  { label: 'Cool Math', url: 'https://www.coolmathgames.com', icon: '🎮' },
  { label: 'Scratch', url: 'https://scratch.mit.edu', icon: '🐱' },
  { label: 'Reddit', url: 'https://www.reddit.com', icon: '🟠' },
  { label: 'GitHub', url: 'https://github.com', icon: '⚡' },
  { label: 'Spotify', url: 'https://open.spotify.com', icon: '🎵' },
]

const STEALTH_PRESETS = [
  { label: 'Google Docs', title: 'Document 1 - Google Docs', favicon: 'https://ssl.gstatic.com/docs/documents/images/kix-favicon7.ico' },
  { label: 'Khan Academy', title: 'Khan Academy | Free Online Courses', favicon: 'https://www.khanacademy.org/favicon.ico' },
  { label: 'Canvas LMS', title: 'Dashboard - Canvas', favicon: 'https://du11hjcvx0uqb.cloudfront.net/dist/images/favicon-e10d657a73.ico' },
  { label: 'Edpuzzle', title: 'Edpuzzle | Make Any Video Your Lesson', favicon: 'https://edpuzzle.com/favicon.ico' },
  { label: 'Schoology', title: 'Schoology | Sign In', favicon: 'https://asset-cdn.schoology.com/sites/all/themes/schoology_theme/favicon.ico' },
  { label: 'Quizlet', title: 'Quizlet: Learn with Flashcards', favicon: 'https://quizlet.com/favicon.ico' },
]

function resolveUrl(input: string): string {
  const t = input.trim()
  if (!t) return ''
  try {
    // Already a valid URL
    const u = new URL(t)
    if (u.protocol === 'http:' || u.protocol === 'https:') return t
  } catch {}
  // Has a dot and no spaces — treat as domain
  if (t.includes('.') && !t.includes(' ') && !t.startsWith('http')) {
    return `https://${t}`
  }
  // Fallback: Google search
  return `https://www.google.com/search?q=${encodeURIComponent(t)}`
}

export default function ProxyPage() {
  const [inputVal, setInputVal] = useState('')
  const [loadedUrl, setLoadedUrl] = useState('')       // /api/proxy?url=...
  const [displayUrl, setDisplayUrl] = useState('')     // shown in bar
  const [loading, setLoading] = useState(false)
  const [stealth, setStealth] = useState<string | null>(null)
  const [stealthOpen, setStealthOpen] = useState(false)
  const [base64Mode, setBase64Mode] = useState(false)
  const [history, setHistory] = useState<string[]>([])
  const [histIdx, setHistIdx] = useState(-1)

  const inputRef = useRef<HTMLInputElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const stealthRef = useRef<HTMLDivElement>(null)

  const canBack = histIdx > 0
  const canForward = histIdx < history.length - 1

  function goToUrl(rawUrl: string, pushHistory = true) {
    if (!rawUrl) return
    const final = resolveUrl(rawUrl)
    if (!final) return
    const display = base64Mode ? btoa(final) : final
    setDisplayUrl(display)
    setInputVal(display)
    setLoading(true)
    setLoadedUrl(`/api/proxy?url=${encodeURIComponent(final)}`)
    if (pushHistory) {
      setHistory(prev => {
        const trimmed = prev.slice(0, histIdx + 1)
        return [...trimmed, final]
      })
      setHistIdx(prev => prev + 1)
    }
  }

  function goBack() {
    if (!canBack) return
    const prev = history[histIdx - 1]
    setHistIdx(i => i - 1)
    goToUrl(prev, false)
  }

  function goForward() {
    if (!canForward) return
    const next = history[histIdx + 1]
    setHistIdx(i => i + 1)
    goToUrl(next, false)
  }

  function reload() {
    if (!loadedUrl) return
    setLoading(true)
    const iframe = iframeRef.current
    if (iframe) {
      const base = loadedUrl.split('&_=')[0]
      iframe.src = `${base}&_=${Date.now()}`
    }
  }

  function openPopup() {
    const urlParam = new URLSearchParams(loadedUrl.split('?')[1] ?? '').get('url')
    if (!urlParam) return
    const popup = window.open('about:blank', '_blank', 'width=1280,height=800,menubar=no,toolbar=no,location=no,status=no,scrollbars=yes')
    if (!popup) return
    popup.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Browser</title>
<style>*{margin:0;padding:0}html,body,iframe{width:100%;height:100%;border:none;background:#000;overflow:hidden}</style>
</head><body><iframe src="/api/proxy?url=${encodeURIComponent(urlParam)}"
  sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-pointer-lock allow-downloads allow-modals allow-top-navigation-by-user-activation"
  allow="accelerometer;autoplay;clipboard-write;fullscreen;gamepad;gyroscope;microphone;camera"
  style="width:100%;height:100%;border:none"></iframe></body></html>`)
    popup.document.close()
  }

  function activateStealth(preset: typeof STEALTH_PRESETS[0]) {
    document.title = preset.title
    setStealth(preset.label)
    setStealthOpen(false)
    let link = document.querySelector<HTMLLinkElement>("link[rel*='icon']")
    if (!link) {
      link = document.createElement('link')
      link.rel = 'shortcut icon'
      document.head.appendChild(link)
    }
    link.href = preset.favicon
  }

  function deactivateStealth() {
    document.title = 'Alhekma Platform'
    setStealth(null)
    const link = document.querySelector<HTMLLinkElement>("link[rel*='icon']")
    if (link) link.href = '/favicon.ico'
  }

  function clearAll() {
    setLoadedUrl('')
    setDisplayUrl('')
    setInputVal('')
    setLoading(false)
    setHistory([])
    setHistIdx(-1)
  }

  // Handle iframe navigation messages
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data?.type === 'proxy-nav' && typeof e.data.url === 'string') {
        const navUrl = e.data.url as string
        const display = base64Mode ? btoa(navUrl) : navUrl
        setDisplayUrl(display)
        setInputVal(display)
        setLoading(false)
        // Push to history if it's a new URL
        setHistory(prev => {
          if (prev[prev.length - 1] === navUrl) return prev
          const trimmed = prev.slice(0, histIdx + 1)
          const next = [...trimmed, navUrl]
          setHistIdx(next.length - 1)
          return next
        })
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [base64Mode, histIdx])

  // Close stealth dropdown on outside click
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (stealthRef.current && !stealthRef.current.contains(e.target as Node)) {
        setStealthOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  useEffect(() => {
    inputRef.current?.focus()
    return () => { document.title = 'Alhekma Platform' }
  }, [])

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    let val = inputVal.trim()
    // Decode base64 if mode is active
    if (base64Mode) {
      try { val = atob(val) } catch {}
    }
    goToUrl(val)
  }, [inputVal, base64Mode])

  const barBg = {
    background: 'rgba(5,5,5,0.97)',
    backdropFilter: 'blur(24px)',
    borderBottom: '1px solid rgba(255,255,255,0.07)',
  }

  return (
    <div className="fixed inset-0 pt-[64px] flex flex-col bg-black">
      {/* Loading bar */}
      {loading && loadedUrl && (
        <div className="absolute top-[64px] left-0 right-0 h-[2px] z-50 overflow-hidden">
          <div
            className="h-full bg-violet-500"
            style={{ animation: 'proxy-load 2s ease-in-out infinite', width: '60%' }}
          />
          <style>{`@keyframes proxy-load{0%{transform:translateX(-100%)}100%{transform:translateX(250%)}}`}</style>
        </div>
      )}

      {/* Browser bar */}
      <div className="flex items-center gap-2 px-3 py-2 flex-shrink-0" style={barBg}>
        {/* Nav controls */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={goBack}
            disabled={!canBack}
            title="Back"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.05] disabled:opacity-25 disabled:cursor-not-allowed transition-all"
          >
            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
            </svg>
          </button>
          <button
            onClick={goForward}
            disabled={!canForward}
            title="Forward"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.05] disabled:opacity-25 disabled:cursor-not-allowed transition-all"
          >
            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
            </svg>
          </button>
          <button
            onClick={reload}
            disabled={!loadedUrl}
            title="Reload"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.05] disabled:opacity-25 disabled:cursor-not-allowed transition-all text-sm"
          >
            ↺
          </button>
        </div>

        {/* URL bar */}
        <form className="flex-1 flex items-center gap-2" onSubmit={handleSubmit}>
          <div
            className="flex flex-1 items-center gap-2 rounded-xl px-3 h-9 transition-all duration-150 focus-within:border-white/[0.14]"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.02)',
            }}
          >
            {loading && loadedUrl ? (
              <span className="h-2 w-2 rounded-full bg-violet-400 animate-pulse flex-shrink-0" />
            ) : (
              <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" className="text-zinc-600 flex-shrink-0 shrink-0">
                <circle cx="11" cy="11" r="8"/><path strokeLinecap="round" d="M21 21l-4.35-4.35"/>
              </svg>
            )}
            <input
              ref={inputRef}
              value={inputVal}
              onChange={e => setInputVal(e.target.value)}
              onFocus={e => e.target.select()}
              placeholder="Search anything or enter a URL…"
              className="flex-1 bg-transparent text-xs text-zinc-200 placeholder:text-zinc-600 outline-none min-w-0"
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
            />
            {inputVal && (
              <button type="button" onClick={() => setInputVal('')} className="text-zinc-700 hover:text-zinc-400 transition-colors flex-shrink-0">
                <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            )}
          </div>
          <button
            type="submit"
            className="flex h-9 items-center gap-1.5 rounded-xl px-4 text-xs font-semibold text-zinc-200 transition-all duration-150 hover:bg-white/[0.09] active:scale-[0.97] flex-shrink-0"
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.09)',
              boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.05)',
            }}
          >
            Go
          </button>
        </form>

        {/* Right controls */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {loadedUrl && (
            <button
              onClick={openPopup}
              title="Open in popup window"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.05] transition-all text-sm"
            >↗</button>
          )}

          {/* B64 toggle */}
          <button
            onClick={() => setBase64Mode(m => !m)}
            title="Base64 URL encoding"
            className={`hidden sm:flex h-8 px-2 items-center rounded-lg text-[10px] font-mono transition-all ${
              base64Mode
                ? 'text-violet-300 bg-violet-500/15 border border-violet-500/25'
                : 'text-zinc-600 border border-transparent hover:text-zinc-300 hover:bg-white/[0.05]'
            }`}
          >B64</button>

          {/* Stealth dropdown */}
          <div className="relative hidden sm:block" ref={stealthRef}>
            <button
              onClick={() => setStealthOpen(o => !o)}
              title="Stealth mode"
              className={`flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[10px] font-mono transition-all ${
                stealth
                  ? 'text-violet-300 bg-violet-500/15 border border-violet-500/25'
                  : 'text-zinc-600 border border-transparent hover:text-zinc-300 hover:bg-white/[0.05]'
              }`}
            >
              <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
              </svg>
              {stealth ?? 'Stealth'}
            </button>
            {stealthOpen && (
              <div
                className="absolute right-0 top-full mt-1.5 z-50 rounded-xl overflow-hidden min-w-[160px]"
                style={{ background: 'rgba(5,5,5,0.98)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 16px 48px rgba(0,0,0,0.6), inset 0 1px 0 0 rgba(255,255,255,0.06)' }}
              >
                {stealth && (
                  <button
                    onClick={deactivateStealth}
                    className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-mono text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] transition-colors border-b border-white/[0.06]"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
                    Deactivate
                  </button>
                )}
                {STEALTH_PRESETS.map(p => (
                  <button
                    key={p.label}
                    onClick={() => activateStealth(p)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-[11px] font-mono transition-colors hover:bg-white/[0.04] ${
                      stealth === p.label ? 'text-violet-300' : 'text-zinc-500 hover:text-zinc-200'
                    }`}
                  >
                    {stealth === p.label && <span className="h-1.5 w-1.5 rounded-full bg-violet-400 flex-shrink-0" />}
                    <span className={stealth === p.label ? '' : 'ml-3.5'}>{p.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {loadedUrl && (
            <button
              onClick={clearAll}
              title="Home"
              className="flex h-8 items-center gap-1 rounded-lg px-2 text-[10px] font-mono text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.05] transition-all border border-transparent"
            >
              <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Home screen */}
      {!loadedUrl ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-10 p-8 overflow-auto">
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="w-[600px] h-[400px] rounded-full" style={{ background: 'radial-gradient(ellipse, rgba(139,92,246,0.07) 0%, transparent 65%)' }} />
          </div>

          <div className="relative text-center space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/[0.06] px-3 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-pulse" />
              <span className="font-mono text-[10px] text-violet-400 uppercase tracking-widest">Proxy Browser</span>
            </div>
            <h2 className="text-3xl font-semibold text-zinc-100 tracking-tight">Browse Freely</h2>
            <p className="text-sm text-zinc-500">Search anything or enter a URL above.</p>
          </div>

          {/* Big search input on home */}
          <form
            className="relative w-full max-w-xl"
            onSubmit={e => { e.preventDefault(); goToUrl(inputVal) }}
          >
            <div
              className="flex items-center gap-3 rounded-2xl px-4 h-12 w-full focus-within:border-violet-500/30 transition-all duration-200"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.09)',
                boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.03)',
              }}
            >
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" className="text-zinc-600 flex-shrink-0">
                <circle cx="11" cy="11" r="8"/><path strokeLinecap="round" d="M21 21l-4.35-4.35"/>
              </svg>
              <input
                value={inputVal}
                onChange={e => setInputVal(e.target.value)}
                placeholder="google.com, YouTube, search terms…"
                className="flex-1 bg-transparent text-sm text-zinc-200 placeholder:text-zinc-600 outline-none"
                spellCheck={false}
                autoComplete="off"
              />
              {inputVal && (
                <button type="submit" className="text-[10px] font-mono text-zinc-500 hover:text-zinc-200 transition-colors">
                  Go →
                </button>
              )}
            </div>
          </form>

          {/* Quick links */}
          <div className="relative grid grid-cols-4 sm:grid-cols-8 gap-2 max-w-2xl w-full">
            {QUICK_LINKS.map(l => (
              <button
                key={l.url}
                onClick={() => goToUrl(l.url)}
                className="group flex flex-col items-center gap-2 p-3 rounded-xl transition-all duration-200 hover:scale-[1.03]"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLElement
                  el.style.boxShadow = '0 0 20px rgba(139,92,246,0.1)'
                  el.style.borderColor = 'rgba(139,92,246,0.18)'
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLElement
                  el.style.boxShadow = ''
                  el.style.borderColor = 'rgba(255,255,255,0.06)'
                }}
              >
                <span className="text-xl">{l.icon}</span>
                <span className="text-[9px] font-mono text-zinc-600 group-hover:text-zinc-400 transition-colors">{l.label}</span>
              </button>
            ))}
          </div>

          <p className="text-[11px] text-zinc-700 text-center max-w-sm leading-relaxed">
            If a site stays blank, click ↗ to open it in a popup — some sites block embedding.
          </p>
        </div>
      ) : (
        <iframe
          ref={iframeRef}
          src={loadedUrl}
          className="flex-1 w-full border-0 block"
          sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals allow-top-navigation-by-user-activation allow-pointer-lock"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; gamepad; gyroscope; microphone; camera"
          title="Proxy Browser"
          referrerPolicy="no-referrer"
          onLoad={() => setLoading(false)}
        />
      )}
    </div>
  )
}
