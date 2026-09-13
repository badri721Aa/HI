'use client'

import { useState, useRef, useEffect } from 'react'

const QUICK_LINKS = [
  { label: 'Google', url: 'https://www.google.com', icon: '🔍' },
  { label: 'YouTube', url: 'https://www.youtube.com', icon: '▶️' },
  { label: 'Wikipedia', url: 'https://www.wikipedia.org', icon: '📖' },
  { label: 'Cool Math', url: 'https://www.coolmathgames.com', icon: '🎮' },
  { label: 'Scratch', url: 'https://scratch.mit.edu', icon: '🐱' },
  { label: 'GitHub', url: 'https://github.com', icon: '⚡' },
]

const STEALTH_PRESETS = [
  { label: 'Google Docs', title: 'Document 1 - Google Docs', favicon: 'https://ssl.gstatic.com/docs/documents/images/kix-favicon7.ico' },
  { label: 'Khan Academy', title: 'Khan Academy | Free Online Courses', favicon: 'https://www.khanacademy.org/favicon.ico' },
  { label: 'Canvas LMS', title: 'Dashboard - Canvas', favicon: 'https://du11hjcvx0uqb.cloudfront.net/dist/images/favicon-e10d657a73.ico' },
]

export default function ProxyPage() {
  const [url, setUrl] = useState('')
  const [loadedUrl, setLoadedUrl] = useState('')
  const [stealth, setStealth] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  function navigate(target: string) {
    let finalUrl = target.trim()
    if (!finalUrl) return
    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      if (!finalUrl.includes('.') || finalUrl.includes(' ')) {
        finalUrl = `https://www.google.com/search?q=${encodeURIComponent(finalUrl)}`
      } else {
        finalUrl = `https://${finalUrl}`
      }
    }
    setLoadedUrl(finalUrl)
    setUrl(finalUrl)
  }

  function activateStealth(preset: typeof STEALTH_PRESETS[0]) {
    document.title = preset.title
    setStealth(preset.label)
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

  useEffect(() => {
    inputRef.current?.focus()
    return () => { document.title = 'Alhekma Platform' }
  }, [])

  const glassBar = {
    background: 'rgba(9,9,11,0.92)',
    backdropFilter: 'blur(20px)',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
  }

  return (
    <div className="fixed inset-0 pt-[64px] flex flex-col bg-zinc-950">
      {/* Top bar */}
      <div className="flex items-center gap-2 px-3 py-2" style={glassBar}>
        {/* Stealth presets */}
        <div className="hidden sm:flex items-center gap-1 mr-1">
          {STEALTH_PRESETS.map(p => (
            <button
              key={p.label}
              onClick={() => stealth === p.label ? deactivateStealth() : activateStealth(p)}
              title={`Disguise tab as ${p.label}`}
              className={`px-2 py-1 rounded-lg text-[10px] font-mono transition-all duration-150 ${
                stealth === p.label
                  ? 'text-violet-300 bg-violet-500/15 border border-violet-500/25'
                  : 'text-zinc-600 hover:text-zinc-300 border border-transparent hover:border-white/[0.06] hover:bg-white/[0.04]'
              }`}
            >
              {p.label}
            </button>
          ))}
          <div className="w-px h-4 bg-zinc-800 ml-1" />
        </div>

        {/* URL bar */}
        <form className="flex-1 flex items-center gap-2" onSubmit={e => { e.preventDefault(); navigate(url) }}>
          <div
            className="flex flex-1 items-center gap-2 rounded-xl px-3 h-9 transition-all duration-150"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.07)',
              boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.02)',
            }}
            onFocus={() => {}}
          >
            <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" className="text-zinc-600 flex-shrink-0">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418"/>
            </svg>
            <input
              ref={inputRef}
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="Enter URL or search Google…"
              className="flex-1 bg-transparent text-xs text-zinc-200 placeholder:text-zinc-600 outline-none"
            />
            {url && (
              <button type="button" onClick={() => { setUrl(''); setLoadedUrl('') }} className="text-zinc-700 hover:text-zinc-400 transition-colors">
                <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            )}
          </div>
          <button
            type="submit"
            className="flex h-9 items-center gap-1.5 rounded-xl px-4 text-xs font-semibold text-zinc-200 transition-all duration-150 hover:bg-white/[0.09] active:scale-[0.97]"
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.09)',
              boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.05)',
            }}
          >
            Go
          </button>
          {loadedUrl && (
            <button
              type="button"
              onClick={() => { setLoadedUrl(''); setUrl('') }}
              className="flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs text-zinc-600 hover:text-zinc-300 transition-all duration-150 border border-transparent hover:border-white/[0.06]"
            >
              ← Home
            </button>
          )}
        </form>
      </div>

      {/* Quick links or iframe */}
      {!loadedUrl ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-8 p-8 overflow-auto">
          {/* Ambient glow */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="w-[700px] h-[500px] rounded-full bg-[radial-gradient(ellipse,rgba(139,92,246,0.07)_0%,transparent_65%)]" />
          </div>

          <div className="relative text-center space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/[0.06] px-3 py-1 mb-2">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-pulse" />
              <span className="font-mono text-[10px] text-violet-400 uppercase tracking-widest">Proxy Browser</span>
            </div>
            <h2 className="font-nacelle text-2xl font-semibold text-zinc-100 tracking-tight">Browse Freely</h2>
            <p className="text-sm text-zinc-600 max-w-xs">
              Type any URL or search above. Use stealth presets to disguise this tab.
            </p>
          </div>

          {/* Quick links */}
          <div className="relative grid grid-cols-3 sm:grid-cols-6 gap-2 max-w-2xl w-full">
            {QUICK_LINKS.map(l => (
              <button
                key={l.url}
                onClick={() => navigate(l.url)}
                className="group flex flex-col items-center gap-2 p-4 rounded-2xl transition-all duration-200 hover:scale-[1.02]"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  boxShadow: '0 0 0 0 rgba(139,92,246,0)',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 0 20px rgba(139,92,246,0.12)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(139,92,246,0.2)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 0 0 0 rgba(139,92,246,0)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.06)' }}
              >
                <span className="text-2xl">{l.icon}</span>
                <span className="text-[10px] font-mono text-zinc-600 group-hover:text-zinc-300 transition-colors duration-200">{l.label}</span>
              </button>
            ))}
          </div>

          {/* Notice */}
          <div
            className="relative max-w-md w-full rounded-xl px-4 py-3 text-xs text-amber-400/70 leading-relaxed"
            style={{ background: 'rgba(251,191,36,0.04)', border: '1px solid rgba(251,191,36,0.12)' }}
          >
            <strong className="text-amber-400/90">Note:</strong> Sites that block embedding won&apos;t load in this frame. If a page stays blank, open it in a new tab instead.
          </div>
        </div>
      ) : (
        <iframe
          ref={iframeRef}
          src={loadedUrl}
          className="flex-1 w-full border-0"
          sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals"
          title="Proxy Browser"
          referrerPolicy="no-referrer"
        />
      )}
    </div>
  )
}
