'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'

const QUICK_LINKS = [
  { label: 'Google', url: 'https://www.google.com', icon: '🔍', hue: '#4285F4' },
  { label: 'YouTube', url: 'https://www.youtube.com', icon: '▶', hue: '#FF0000' },
  { label: 'Wikipedia', url: 'https://www.wikipedia.org', icon: '📖', hue: '#FFFFFF' },
  { label: 'Reddit', url: 'https://www.reddit.com', icon: '🟠', hue: '#FF4500' },
  { label: 'GitHub', url: 'https://github.com', icon: '⚡', hue: '#FFFFFF' },
  { label: 'Cool Math', url: 'https://www.coolmathgames.com', icon: '🎮', hue: '#F59E0B' },
  { label: 'Scratch', url: 'https://scratch.mit.edu', icon: '🐱', hue: '#FCB925' },
  { label: 'Spotify', url: 'https://open.spotify.com', icon: '🎵', hue: '#1DB954' },
]

const STEALTH_PRESETS = [
  { label: 'Google Docs', title: 'Document 1 - Google Docs', favicon: 'https://ssl.gstatic.com/docs/documents/images/kix-favicon7.ico' },
  { label: 'Khan Academy', title: 'Khan Academy | Free Online Courses', favicon: 'https://www.khanacademy.org/favicon.ico' },
  { label: 'Canvas LMS', title: 'Dashboard - Canvas', favicon: 'https://du11hjcvx0uqb.cloudfront.net/dist/images/favicon-e10d657a73.ico' },
  { label: 'Edpuzzle', title: 'Edpuzzle | Make Any Video Your Lesson', favicon: 'https://edpuzzle.com/favicon.ico' },
  { label: 'Schoology', title: 'Schoology | Sign In', favicon: 'https://asset-cdn.schoology.com/sites/all/themes/schoology_theme/favicon.ico' },
  { label: 'Quizlet', title: 'Quizlet: Learn with Flashcards', favicon: 'https://quizlet.com/favicon.ico' },
]

const HISTORY_KEY = 'proxy-history-v2'
const MAX_HISTORY = 12

function resolveUrl(input: string): string {
  const t = input.trim()
  if (!t) return ''
  try {
    const u = new URL(t)
    if (u.protocol === 'http:' || u.protocol === 'https:') return t
  } catch {}
  if (t.includes('.') && !t.includes(' ') && !t.startsWith('http')) {
    return `https://${t}`
  }
  return `https://www.google.com/search?q=${encodeURIComponent(t)}`
}

function faviconFor(url: string): string {
  try {
    const u = new URL(url)
    return `/api/proxy?url=${encodeURIComponent(`https://www.google.com/s2/favicons?domain=${u.hostname}&sz=64`)}`
  } catch {
    return ''
  }
}

interface UrlParts {
  scheme: string
  host: string
  rest: string
  isSecure: boolean
}

function parseUrl(url: string): UrlParts | null {
  try {
    const u = new URL(url)
    return {
      scheme: u.protocol.replace(':', ''),
      host: u.host,
      rest: u.pathname + u.search + u.hash,
      isSecure: u.protocol === 'https:',
    }
  } catch {
    return null
  }
}

export default function ProxyPage() {
  const [inputVal, setInputVal] = useState('')
  const [loadedUrl, setLoadedUrl] = useState('')
  const [currentSiteUrl, setCurrentSiteUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [stealth, setStealth] = useState<string | null>(null)
  const [stealthOpen, setStealthOpen] = useState(false)
  const [base64Mode, setBase64Mode] = useState(false)
  const [history, setHistory] = useState<string[]>([])
  const [histIdx, setHistIdx] = useState(-1)
  const [recent, setRecent] = useState<string[]>([])
  const [urlFocused, setUrlFocused] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const homeInputRef = useRef<HTMLInputElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const stealthRef = useRef<HTMLDivElement>(null)

  const canBack = histIdx > 0
  const canForward = histIdx < history.length - 1

  const urlParts = useMemo(() => parseUrl(currentSiteUrl), [currentSiteUrl])

  // Load recent from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(HISTORY_KEY)
      if (stored) setRecent(JSON.parse(stored))
    } catch {}
  }, [])

  function pushRecent(url: string) {
    setRecent(prev => {
      const filtered = prev.filter(u => u !== url)
      const next = [url, ...filtered].slice(0, MAX_HISTORY)
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }

  function clearRecent() {
    setRecent([])
    try { localStorage.removeItem(HISTORY_KEY) } catch {}
  }

  const goToUrl = useCallback((rawUrl: string, pushHistory = true) => {
    if (!rawUrl) return
    let val = rawUrl.trim()
    if (base64Mode) {
      try { val = atob(val) } catch {}
    }
    const final = resolveUrl(val)
    if (!final) return
    const display = base64Mode ? btoa(final) : final
    setInputVal(display)
    setCurrentSiteUrl(final)
    setLoading(true)
    setLoadedUrl(`/api/proxy?url=${encodeURIComponent(final)}`)
    pushRecent(final)
    if (pushHistory) {
      setHistory(prev => {
        const trimmed = prev.slice(0, histIdx + 1)
        return [...trimmed, final]
      })
      setHistIdx(prev => prev + 1)
    }
  }, [base64Mode, histIdx])

  const goBack = useCallback(() => {
    if (!canBack) return
    const prev = history[histIdx - 1]
    setHistIdx(i => i - 1)
    goToUrl(prev, false)
  }, [canBack, history, histIdx, goToUrl])

  const goForward = useCallback(() => {
    if (!canForward) return
    const next = history[histIdx + 1]
    setHistIdx(i => i + 1)
    goToUrl(next, false)
  }, [canForward, history, histIdx, goToUrl])

  const reload = useCallback(() => {
    if (!loadedUrl) return
    setLoading(true)
    const iframe = iframeRef.current
    if (iframe) {
      const base = loadedUrl.split('&_=')[0]
      iframe.src = `${base}&_=${Date.now()}`
    }
  }, [loadedUrl])

  const focusUrlBar = useCallback(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  function openPopup() {
    const urlParam = currentSiteUrl || new URLSearchParams(loadedUrl.split('?')[1] ?? '').get('url')
    if (!urlParam) return
    const popup = window.open('about:blank', '_blank', 'width=1280,height=800,menubar=no,toolbar=no,location=no,status=no,scrollbars=yes')
    if (!popup) return
    popup.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Browser</title>
<style>*{margin:0;padding:0}html,body,iframe{width:100%;height:100%;border:none;background:#000;overflow:hidden}</style>
</head><body><iframe src="/api/proxy?url=${encodeURIComponent(urlParam)}"
  sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-pointer-lock allow-downloads allow-modals allow-top-navigation-by-user-activation"
  allow="accelerometer;autoplay;clipboard-write;encrypted-media;fullscreen;gamepad;gyroscope;microphone;camera"
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
    setStealthOpen(false)
    const link = document.querySelector<HTMLLinkElement>("link[rel*='icon']")
    if (link) link.href = '/favicon.ico'
  }

  function clearAll() {
    setLoadedUrl('')
    setCurrentSiteUrl('')
    setInputVal('')
    setLoading(false)
    setHistory([])
    setHistIdx(-1)
    setTimeout(() => homeInputRef.current?.focus(), 50)
  }

  // Listen for iframe navigation
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data?.type === 'proxy-nav' && typeof e.data.url === 'string') {
        const navUrl = e.data.url as string
        const display = base64Mode ? btoa(navUrl) : navUrl
        setInputVal(display)
        setCurrentSiteUrl(navUrl)
        setLoading(false)
        pushRecent(navUrl)
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

  // Close dropdowns on outside click
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (stealthRef.current && !stealthRef.current.contains(e.target as Node)) {
        setStealthOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey
      // Cmd/Ctrl+L — focus URL bar
      if (meta && e.key === 'l') {
        e.preventDefault()
        focusUrlBar()
      }
      // Cmd/Ctrl+R — reload
      if (meta && e.key === 'r' && loadedUrl) {
        e.preventDefault()
        reload()
      }
      // Alt+Left / Alt+Right — history
      if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault()
        goBack()
      }
      if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault()
        goForward()
      }
      // Cmd/Ctrl+K — focus home search (only on home)
      if (meta && e.key === 'k') {
        e.preventDefault()
        if (loadedUrl) focusUrlBar()
        else homeInputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [focusUrlBar, reload, goBack, goForward, loadedUrl])

  useEffect(() => {
    homeInputRef.current?.focus()
    return () => { document.title = 'Alhekma Platform' }
  }, [])

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    goToUrl(inputVal)
  }, [inputVal, goToUrl])

  return (
    <>
      <style jsx global>{`
        @keyframes proxy-load-bar {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(30%); }
          100% { transform: translateX(250%); }
        }
        @keyframes proxy-aurora-1 {
          0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.6; }
          33% { transform: translate(60px, -40px) scale(1.1); opacity: 0.8; }
          66% { transform: translate(-40px, 40px) scale(0.95); opacity: 0.5; }
        }
        @keyframes proxy-aurora-2 {
          0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.5; }
          50% { transform: translate(-80px, 60px) scale(1.15); opacity: 0.7; }
        }
        @keyframes proxy-fade-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes proxy-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        .proxy-grid-bg {
          background-image:
            linear-gradient(rgba(139,92,246,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(139,92,246,0.03) 1px, transparent 1px);
          background-size: 48px 48px;
          mask-image: radial-gradient(ellipse 800px 500px at center, black, transparent 70%);
        }
      `}</style>

      <div className="fixed inset-0 pt-[64px] flex flex-col bg-black overflow-hidden">
        {/* Loading progress bar */}
        {loading && loadedUrl && (
          <div className="absolute top-[64px] left-0 right-0 h-[2px] z-[60] overflow-hidden pointer-events-none">
            <div
              className="h-full rounded-r-full"
              style={{
                background: 'linear-gradient(90deg, transparent, #8B5CF6 20%, #A78BFA 50%, #8B5CF6 80%, transparent)',
                animation: 'proxy-load-bar 1.4s ease-in-out infinite',
                width: '40%',
                boxShadow: '0 0 12px rgba(139,92,246,0.5)',
              }}
            />
          </div>
        )}

        {/* Browser chrome */}
        <div
          className="flex items-center gap-2 px-3 py-2 flex-shrink-0 relative z-40"
          style={{
            background: 'rgba(3,3,4,0.94)',
            backdropFilter: 'blur(24px) saturate(180%)',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            boxShadow: 'inset 0 -1px 0 0 rgba(255,255,255,0.02), 0 1px 0 0 rgba(0,0,0,0.4)',
          }}
        >
          {/* Nav pill */}
          <div className="flex items-center gap-0.5 p-0.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <button
              onClick={goBack}
              disabled={!canBack}
              title="Back (Alt+←)"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-100 hover:bg-white/[0.06] disabled:opacity-20 disabled:cursor-not-allowed transition-all duration-150 active:scale-90"
            >
              <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
              </svg>
            </button>
            <button
              onClick={goForward}
              disabled={!canForward}
              title="Forward (Alt+→)"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-100 hover:bg-white/[0.06] disabled:opacity-20 disabled:cursor-not-allowed transition-all duration-150 active:scale-90"
            >
              <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
              </svg>
            </button>
            <button
              onClick={reload}
              disabled={!loadedUrl}
              title="Reload (⌘R)"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-100 hover:bg-white/[0.06] disabled:opacity-20 disabled:cursor-not-allowed transition-all duration-150 active:scale-90"
            >
              <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className={loading ? 'animate-spin' : ''}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
              </svg>
            </button>
          </div>

          {/* URL bar */}
          <form className="flex-1 flex items-center gap-2 min-w-0" onSubmit={handleSubmit}>
            <div
              className="relative flex flex-1 items-center gap-2.5 rounded-xl px-3 h-9 transition-all duration-200 min-w-0"
              style={{
                background: urlFocused ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.03)',
                border: urlFocused ? '1px solid rgba(139,92,246,0.35)' : '1px solid rgba(255,255,255,0.07)',
                boxShadow: urlFocused
                  ? 'inset 0 1px 0 0 rgba(255,255,255,0.04), 0 0 0 3px rgba(139,92,246,0.1), 0 0 24px rgba(139,92,246,0.08)'
                  : 'inset 0 1px 0 0 rgba(255,255,255,0.02)',
              }}
            >
              {/* Security / favicon indicator */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {loading && loadedUrl ? (
                  <span
                    className="h-2 w-2 rounded-full bg-violet-400"
                    style={{ animation: 'proxy-pulse 1s ease-in-out infinite', boxShadow: '0 0 6px rgba(139,92,246,0.6)' }}
                  />
                ) : urlParts?.isSecure ? (
                  <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" className="text-emerald-500/70 flex-shrink-0">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
                  </svg>
                ) : (
                  <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" className="text-zinc-600 flex-shrink-0">
                    <circle cx="11" cy="11" r="8"/><path strokeLinecap="round" d="M21 21l-4.35-4.35"/>
                  </svg>
                )}
              </div>

              {/* Domain-emphasized display when not focused */}
              {!urlFocused && urlParts && !base64Mode && (
                <div className="absolute left-[38px] right-8 pointer-events-none flex items-center h-full text-xs truncate" style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                  <span className="text-zinc-600">{urlParts.scheme}://</span>
                  <span className="text-zinc-100 font-medium">{urlParts.host}</span>
                  <span className="text-zinc-600 truncate">{urlParts.rest}</span>
                </div>
              )}

              <input
                ref={inputRef}
                value={inputVal}
                onChange={e => setInputVal(e.target.value)}
                onFocus={e => { setUrlFocused(true); e.target.select() }}
                onBlur={() => setUrlFocused(false)}
                placeholder="Search or enter URL…"
                className={`flex-1 bg-transparent text-xs text-zinc-100 placeholder:text-zinc-600 outline-none min-w-0 font-mono ${!urlFocused && urlParts && !base64Mode ? 'text-transparent selection:text-zinc-100' : ''}`}
                spellCheck={false}
                autoComplete="off"
                autoCorrect="off"
              />

              {inputVal && urlFocused && (
                <button
                  type="button"
                  onMouseDown={e => { e.preventDefault(); setInputVal('') }}
                  className="text-zinc-600 hover:text-zinc-300 transition-colors flex-shrink-0"
                >
                  <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                </button>
              )}

              {/* Keyboard hint */}
              {!urlFocused && !loadedUrl && (
                <kbd className="hidden md:flex items-center gap-1 flex-shrink-0 h-5 px-1.5 rounded-md text-[9px] font-mono text-zinc-600" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  ⌘K
                </kbd>
              )}
            </div>
          </form>

          {/* Right controls */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {loadedUrl && (
              <button
                onClick={openPopup}
                title="Open in popup"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-100 hover:bg-white/[0.05] transition-all active:scale-90"
              >
                <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                </svg>
              </button>
            )}

            <button
              onClick={() => setBase64Mode(m => !m)}
              title="Base64 URL encoding"
              className={`hidden sm:flex h-8 px-2 items-center rounded-lg text-[10px] font-mono transition-all active:scale-95 ${
                base64Mode
                  ? 'text-violet-300'
                  : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.05]'
              }`}
              style={base64Mode ? { background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.28)', boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.04)' } : { border: '1px solid transparent' }}
            >B64</button>

            {/* Stealth dropdown */}
            <div className="relative hidden sm:block" ref={stealthRef}>
              <button
                onClick={() => setStealthOpen(o => !o)}
                title="Stealth mode"
                className={`flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[10px] font-mono transition-all active:scale-95 ${
                  stealth
                    ? 'text-violet-300'
                    : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.05]'
                }`}
                style={stealth ? { background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.28)', boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.04)' } : { border: '1px solid transparent' }}
              >
                <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                </svg>
                {stealth ?? 'Stealth'}
                <svg width="8" height="8" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className={`transition-transform ${stealthOpen ? 'rotate-180' : ''}`}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
                </svg>
              </button>
              {stealthOpen && (
                <div
                  className="absolute right-0 top-full mt-1.5 z-50 rounded-xl overflow-hidden min-w-[180px]"
                  style={{
                    background: 'rgba(5,5,6,0.98)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.7), inset 0 1px 0 0 rgba(255,255,255,0.06)',
                    backdropFilter: 'blur(20px)',
                    animation: 'proxy-fade-in 0.15s ease-out',
                  }}
                >
                  <div className="px-3 py-2 border-b border-white/[0.05]">
                    <p className="text-[9px] uppercase tracking-widest font-mono text-zinc-600">Disguise Tab</p>
                  </div>
                  {stealth && (
                    <button
                      onClick={deactivateStealth}
                      className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-mono text-rose-400/80 hover:text-rose-300 hover:bg-rose-500/[0.06] transition-colors border-b border-white/[0.05]"
                    >
                      <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12"/>
                      </svg>
                      Turn off
                    </button>
                  )}
                  {STEALTH_PRESETS.map(p => (
                    <button
                      key={p.label}
                      onClick={() => activateStealth(p)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-[11px] font-mono transition-colors hover:bg-white/[0.04] ${
                        stealth === p.label ? 'text-violet-300' : 'text-zinc-400 hover:text-zinc-100'
                      }`}
                    >
                      <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ background: stealth === p.label ? '#A78BFA' : 'rgba(255,255,255,0.12)' }} />
                      {p.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {loadedUrl && (
              <button
                onClick={clearAll}
                title="Home"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-100 hover:bg-white/[0.05] transition-all active:scale-90"
              >
                <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Home or iframe */}
        {!loadedUrl ? (
          <div className="relative flex-1 overflow-auto">
            {/* Aurora background */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <div
                className="absolute top-[10%] left-[20%] w-[500px] h-[500px] rounded-full"
                style={{
                  background: 'radial-gradient(circle, rgba(139,92,246,0.15) 0%, transparent 70%)',
                  filter: 'blur(60px)',
                  animation: 'proxy-aurora-1 18s ease-in-out infinite',
                }}
              />
              <div
                className="absolute bottom-[15%] right-[15%] w-[400px] h-[400px] rounded-full"
                style={{
                  background: 'radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)',
                  filter: 'blur(80px)',
                  animation: 'proxy-aurora-2 22s ease-in-out infinite',
                }}
              />
              <div className="absolute inset-0 proxy-grid-bg" />
            </div>

            <div className="relative min-h-full flex flex-col items-center justify-center px-6 py-12 gap-10">
              {/* Hero */}
              <div className="text-center space-y-4" style={{ animation: 'proxy-fade-in 0.6s ease-out' }}>
                <div className="inline-flex items-center gap-2 rounded-full px-3 py-1" style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.18)' }}>
                  <span className="h-1.5 w-1.5 rounded-full bg-violet-400" style={{ animation: 'proxy-pulse 2s ease-in-out infinite', boxShadow: '0 0 6px rgba(139,92,246,0.6)' }} />
                  <span className="font-mono text-[10px] text-violet-300 uppercase tracking-[0.2em]">Proxy Browser</span>
                </div>
                <h2
                  className="text-4xl sm:text-5xl font-semibold text-zinc-50 tracking-tight leading-none"
                  style={{
                    fontFamily: 'var(--font-nacelle), ui-sans-serif, system-ui, sans-serif',
                    textWrap: 'balance',
                    backgroundImage: 'linear-gradient(180deg, #FAFAFA 0%, #A1A1AA 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  Browse anywhere
                </h2>
                <p className="text-sm text-zinc-500 max-w-md mx-auto">
                  Search the web, open any URL, land on any site. Nothing filtered, nothing blocked.
                </p>
              </div>

              {/* Big search */}
              <form
                className="relative w-full max-w-2xl"
                onSubmit={e => { e.preventDefault(); goToUrl(inputVal) }}
                style={{ animation: 'proxy-fade-in 0.7s ease-out 0.1s both' }}
              >
                <div
                  className="group flex items-center gap-3 rounded-2xl px-5 h-14 w-full transition-all duration-200 focus-within:scale-[1.01]"
                  style={{
                    background: 'rgba(10,10,12,0.6)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.04), 0 8px 32px rgba(0,0,0,0.4)',
                    backdropFilter: 'blur(20px)',
                  }}
                >
                  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" className="text-zinc-600 group-focus-within:text-violet-400 transition-colors flex-shrink-0">
                    <circle cx="11" cy="11" r="8"/><path strokeLinecap="round" d="M21 21l-4.35-4.35"/>
                  </svg>
                  <input
                    ref={homeInputRef}
                    value={inputVal}
                    onChange={e => setInputVal(e.target.value)}
                    placeholder="Type a URL or search anything…"
                    className="flex-1 bg-transparent text-[15px] text-zinc-100 placeholder:text-zinc-600 outline-none"
                    spellCheck={false}
                    autoComplete="off"
                    autoCorrect="off"
                  />
                  {inputVal ? (
                    <button
                      type="submit"
                      className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold text-violet-100 transition-all active:scale-95 hover:brightness-110"
                      style={{
                        background: 'linear-gradient(180deg, rgba(139,92,246,0.4) 0%, rgba(124,58,237,0.5) 100%)',
                        border: '1px solid rgba(167,139,250,0.4)',
                        boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.15), 0 4px 12px rgba(139,92,246,0.25)',
                      }}
                    >
                      Enter
                      <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                      </svg>
                    </button>
                  ) : (
                    <kbd className="hidden sm:flex items-center gap-1 flex-shrink-0 h-6 px-2 rounded-md text-[10px] font-mono text-zinc-600" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      ⌘ K
                    </kbd>
                  )}
                </div>
              </form>

              {/* Quick access */}
              <div className="w-full max-w-2xl" style={{ animation: 'proxy-fade-in 0.7s ease-out 0.2s both' }}>
                <div className="flex items-center justify-between mb-3 px-1">
                  <p className="text-[10px] uppercase tracking-[0.2em] font-mono text-zinc-600">Quick access</p>
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                  {QUICK_LINKS.map(l => (
                    <button
                      key={l.url}
                      onClick={() => goToUrl(l.url)}
                      className="group relative flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl transition-all duration-200 hover:-translate-y-0.5 overflow-hidden"
                      style={{
                        background: 'rgba(10,10,12,0.5)',
                        border: '1px solid rgba(255,255,255,0.05)',
                        boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.02)',
                      }}
                      onMouseEnter={e => {
                        const el = e.currentTarget as HTMLElement
                        el.style.boxShadow = `inset 0 1px 0 0 rgba(255,255,255,0.06), 0 8px 24px ${l.hue}22, 0 0 0 1px ${l.hue}33`
                        el.style.borderColor = 'transparent'
                      }}
                      onMouseLeave={e => {
                        const el = e.currentTarget as HTMLElement
                        el.style.boxShadow = 'inset 0 1px 0 0 rgba(255,255,255,0.02)'
                        el.style.borderColor = 'rgba(255,255,255,0.05)'
                      }}
                    >
                      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" style={{ background: `radial-gradient(ellipse at top, ${l.hue}12 0%, transparent 60%)` }} />
                      <span className="relative text-xl">{l.icon}</span>
                      <span className="relative text-[9px] font-mono text-zinc-500 group-hover:text-zinc-200 transition-colors tracking-wide">{l.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Recent */}
              {recent.length > 0 && (
                <div className="w-full max-w-2xl" style={{ animation: 'proxy-fade-in 0.7s ease-out 0.3s both' }}>
                  <div className="flex items-center justify-between mb-3 px-1">
                    <p className="text-[10px] uppercase tracking-[0.2em] font-mono text-zinc-600">Recent</p>
                    <button
                      onClick={clearRecent}
                      className="text-[10px] font-mono text-zinc-700 hover:text-zinc-400 transition-colors"
                    >
                      Clear
                    </button>
                  </div>
                  <div
                    className="rounded-xl overflow-hidden"
                    style={{
                      background: 'rgba(10,10,12,0.5)',
                      border: '1px solid rgba(255,255,255,0.05)',
                      boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.02)',
                    }}
                  >
                    {recent.slice(0, 5).map((u, i) => {
                      const p = parseUrl(u)
                      return (
                        <button
                          key={u + i}
                          onClick={() => goToUrl(u)}
                          className="group w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.03] transition-colors border-b border-white/[0.03] last:border-b-0 text-left"
                        >
                          <div className="h-6 w-6 rounded-md flex items-center justify-center flex-shrink-0 overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                            <img
                              src={faviconFor(u)}
                              alt=""
                              className="h-4 w-4"
                              onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                            />
                          </div>
                          <div className="flex-1 min-w-0 flex items-baseline gap-2">
                            <span className="text-xs text-zinc-200 font-medium truncate">{p?.host ?? u}</span>
                            <span className="text-[10px] text-zinc-600 font-mono truncate">{p?.rest ?? ''}</span>
                          </div>
                          <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="text-zinc-700 group-hover:text-zinc-400 transition-colors flex-shrink-0">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                          </svg>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Shortcuts footer */}
              <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[10px] font-mono text-zinc-700 mt-4">
                <span className="flex items-center gap-1.5">
                  <kbd className="h-5 px-1.5 rounded-md" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>⌘ K</kbd>
                  search
                </span>
                <span className="flex items-center gap-1.5">
                  <kbd className="h-5 px-1.5 rounded-md" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>⌘ L</kbd>
                  focus url
                </span>
                <span className="flex items-center gap-1.5">
                  <kbd className="h-5 px-1.5 rounded-md" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>⌘ R</kbd>
                  reload
                </span>
                <span className="flex items-center gap-1.5">
                  <kbd className="h-5 px-1.5 rounded-md" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>Alt ← →</kbd>
                  history
                </span>
              </div>
            </div>
          </div>
        ) : (
          <iframe
            ref={iframeRef}
            src={loadedUrl}
            className="flex-1 w-full border-0 block bg-white"
            sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals allow-top-navigation-by-user-activation allow-pointer-lock"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; gamepad; gyroscope; microphone; camera"
            title="Proxy Browser"
            referrerPolicy="no-referrer"
            onLoad={() => setLoading(false)}
          />
        )}
      </div>
    </>
  )
}
