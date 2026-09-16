'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'

// ============ CONSTANTS ============

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
  { label: 'Google Drive', title: 'My Drive - Google Drive', favicon: 'https://ssl.gstatic.com/docs/doclist/images/drive_2022q3_32dp.png' },
  { label: 'Google Classroom', title: 'Classes', favicon: 'https://ssl.gstatic.com/classroom/favicon.png' },
  { label: 'Khan Academy', title: 'Khan Academy | Free Online Courses', favicon: 'https://www.khanacademy.org/favicon.ico' },
  { label: 'Canvas LMS', title: 'Dashboard - Canvas', favicon: 'https://du11hjcvx0uqb.cloudfront.net/dist/images/favicon-e10d657a73.ico' },
  { label: 'Edpuzzle', title: 'Edpuzzle | Make Any Video Your Lesson', favicon: 'https://edpuzzle.com/favicon.ico' },
  { label: 'Schoology', title: 'Schoology | Sign In', favicon: 'https://asset-cdn.schoology.com/sites/all/themes/schoology_theme/favicon.ico' },
  { label: 'Quizlet', title: 'Quizlet: Learn with Flashcards', favicon: 'https://quizlet.com/favicon.ico' },
  { label: 'Zoom', title: 'Zoom Meeting', favicon: 'https://st1.zoom.us/static/6.3.11289/image/new/favicon.ico' },
  { label: 'Microsoft Teams', title: 'Microsoft Teams', favicon: 'https://statics.teams.cdn.office.net/hashedassets-launcher/launcher-icon-192.6a084c37e5a3af73dcf6.png' },
  { label: 'Outlook', title: 'Mail - Outlook', favicon: 'https://res-1.cdn.office.net/assets/mail/pwa/v1/pngs/favicon-light.png' },
  { label: 'Notion', title: 'Notion – The all-in-one workspace', favicon: 'https://www.notion.so/images/favicon.ico' },
  { label: 'Slack', title: 'Slack', favicon: 'https://a.slack-edge.com/80588/marketing/img/meta/favicon-32.png' },
]

const UA_OPTIONS = [
  { id: 'chrome', label: 'Chrome (Desktop)', icon: '🖥️' },
  { id: 'safari', label: 'Safari (Mac)', icon: '🍎' },
  { id: 'firefox', label: 'Firefox', icon: '🦊' },
  { id: 'mobile-ios', label: 'iPhone', icon: '📱' },
  { id: 'mobile-android', label: 'Android', icon: '🤖' },
]

const PANIC_URL = 'https://classroom.google.com'
const BOOKMARKS_KEY = 'proxy-bookmarks-v1'
const HISTORY_KEY = 'proxy-history-v2'
const SETTINGS_KEY = 'proxy-settings-v1'
const MAX_HISTORY = 20
const MAX_TABS = 8

// ============ TYPES ============

interface Tab {
  id: string
  currentUrl: string
  loadedUrl: string
  loading: boolean
  title: string
  favicon: string
  history: string[]
  histIdx: number
}

interface Bookmark {
  url: string
  title: string
}

interface Settings {
  adblock: boolean
  ua: string
  base64: boolean
  panicKey: boolean
}

// ============ UTILS ============

function makeId(): string {
  return Math.random().toString(36).slice(2, 10)
}

function resolveUrl(input: string): string {
  const t = input.trim()
  if (!t) return ''
  try {
    const u = new URL(t)
    if (u.protocol === 'http:' || u.protocol === 'https:') return t
  } catch {}
  if (t.includes('.') && !t.includes(' ') && !t.startsWith('http')) return `https://${t}`
  return `https://www.google.com/search?q=${encodeURIComponent(t)}`
}

function faviconFor(url: string): string {
  try {
    const u = new URL(url)
    return `/api/proxy?url=${encodeURIComponent(`https://www.google.com/s2/favicons?domain=${u.hostname}&sz=64`)}`
  } catch { return '' }
}

function buildProxyUrl(finalUrl: string, s: Settings): string {
  const parts: string[] = [`url=${encodeURIComponent(finalUrl)}`]
  if (s.adblock) parts.push('adblock=1')
  if (s.ua !== 'chrome') parts.push(`ua=${encodeURIComponent(s.ua)}`)
  return `/api/proxy?${parts.join('&')}`
}

interface UrlParts { scheme: string; host: string; rest: string; isSecure: boolean }
function parseUrl(url: string): UrlParts | null {
  try {
    const u = new URL(url)
    return { scheme: u.protocol.replace(':', ''), host: u.host, rest: u.pathname + u.search + u.hash, isSecure: u.protocol === 'https:' }
  } catch { return null }
}

function newTab(url = ''): Tab {
  return { id: makeId(), currentUrl: '', loadedUrl: '', loading: false, title: 'New Tab', favicon: '', history: [], histIdx: -1 }
}

// ============ MAIN ============

export default function ProxyPage() {
  const [tabs, setTabs] = useState<Tab[]>([newTab()])
  const [activeId, setActiveId] = useState<string>('')
  const [inputVal, setInputVal] = useState('')
  const [urlFocused, setUrlFocused] = useState(false)

  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [recent, setRecent] = useState<string[]>([])

  const [settings, setSettings] = useState<Settings>({ adblock: false, ua: 'chrome', base64: false, panicKey: true })

  const [stealth, setStealth] = useState<string | null>(null)
  const [stealthOpen, setStealthOpen] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(false)
  const [cmdOpen, setCmdOpen] = useState(false)
  const [cmdQuery, setCmdQuery] = useState('')
  const [qrOpen, setQrOpen] = useState(false)
  const [splitMode, setSplitMode] = useState(false)
  const [splitTabId, setSplitTabId] = useState<string | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const homeInputRef = useRef<HTMLInputElement>(null)
  const cmdInputRef = useRef<HTMLInputElement>(null)
  const iframeRefs = useRef<Record<string, HTMLIFrameElement | null>>({})
  const stealthRef = useRef<HTMLDivElement>(null)
  const toolsRef = useRef<HTMLDivElement>(null)
  const escTapRef = useRef<number>(0)

  const activeTab = useMemo(() => tabs.find(t => t.id === activeId) ?? tabs[0], [tabs, activeId])
  const splitTab = useMemo(() => tabs.find(t => t.id === splitTabId), [tabs, splitTabId])
  const canBack = (activeTab?.histIdx ?? 0) > 0
  const canForward = activeTab ? activeTab.histIdx < activeTab.history.length - 1 : false
  const urlParts = useMemo(() => parseUrl(activeTab?.currentUrl ?? ''), [activeTab?.currentUrl])
  const isBookmarked = useMemo(() => activeTab?.currentUrl ? bookmarks.some(b => b.url === activeTab.currentUrl) : false, [activeTab, bookmarks])

  // Set active tab on mount
  useEffect(() => { if (!activeId && tabs[0]) setActiveId(tabs[0].id) }, [])

  // Load persisted state
  useEffect(() => {
    try {
      const b = localStorage.getItem(BOOKMARKS_KEY)
      if (b) setBookmarks(JSON.parse(b))
      const r = localStorage.getItem(HISTORY_KEY)
      if (r) setRecent(JSON.parse(r))
      const s = localStorage.getItem(SETTINGS_KEY)
      if (s) setSettings(prev => ({ ...prev, ...JSON.parse(s) }))
    } catch {}
  }, [])

  useEffect(() => {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)) } catch {}
  }, [settings])

  function updateTab(id: string, updater: (t: Tab) => Partial<Tab>) {
    setTabs(prev => prev.map(t => t.id === id ? { ...t, ...updater(t) } : t))
  }

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

  // ============ TAB ACTIONS ============

  function openTab(url = '') {
    if (tabs.length >= MAX_TABS) return
    const t = newTab()
    setTabs(prev => [...prev, t])
    setActiveId(t.id)
    setInputVal('')
    if (url) setTimeout(() => goToUrl(url, t.id), 30)
    else setTimeout(() => homeInputRef.current?.focus(), 50)
  }

  function closeTab(id: string) {
    setTabs(prev => {
      if (prev.length === 1) {
        // Reset the last tab instead of closing
        const fresh = newTab()
        setActiveId(fresh.id)
        setInputVal('')
        return [fresh]
      }
      const idx = prev.findIndex(t => t.id === id)
      const filtered = prev.filter(t => t.id !== id)
      if (id === activeId) {
        const next = filtered[Math.max(0, idx - 1)] ?? filtered[0]
        setActiveId(next.id)
        setInputVal(next.currentUrl ? (settings.base64 ? btoa(next.currentUrl) : next.currentUrl) : '')
      }
      if (id === splitTabId) setSplitTabId(null)
      return filtered
    })
  }

  const goToUrl = useCallback((rawUrl: string, tabId?: string, pushHistory = true) => {
    const targetId = tabId ?? activeId
    if (!rawUrl || !targetId) return
    let val = rawUrl.trim()
    if (settings.base64) { try { val = atob(val) } catch {} }
    const final = resolveUrl(val)
    if (!final) return
    const display = settings.base64 ? btoa(final) : final
    setInputVal(display)
    updateTab(targetId, t => {
      const nextHistory = pushHistory ? [...t.history.slice(0, t.histIdx + 1), final] : t.history
      const nextIdx = pushHistory ? nextHistory.length - 1 : t.histIdx
      return { currentUrl: final, loadedUrl: buildProxyUrl(final, settings), loading: true, history: nextHistory, histIdx: nextIdx }
    })
    pushRecent(final)
  }, [activeId, settings])

  const goBack = useCallback(() => {
    if (!activeTab || !canBack) return
    const prev = activeTab.history[activeTab.histIdx - 1]
    updateTab(activeTab.id, () => ({ histIdx: activeTab.histIdx - 1 }))
    goToUrl(prev, activeTab.id, false)
  }, [activeTab, canBack, goToUrl])

  const goForward = useCallback(() => {
    if (!activeTab || !canForward) return
    const next = activeTab.history[activeTab.histIdx + 1]
    updateTab(activeTab.id, () => ({ histIdx: activeTab.histIdx + 1 }))
    goToUrl(next, activeTab.id, false)
  }, [activeTab, canForward, goToUrl])

  const reload = useCallback(() => {
    if (!activeTab?.loadedUrl) return
    updateTab(activeTab.id, () => ({ loading: true }))
    const iframe = iframeRefs.current[activeTab.id]
    if (iframe) {
      const base = activeTab.loadedUrl.split('&_=')[0]
      iframe.src = `${base}&_=${Date.now()}`
    }
  }, [activeTab])

  const focusUrlBar = useCallback(() => { inputRef.current?.focus(); inputRef.current?.select() }, [])

  function openPopup() {
    if (!activeTab?.currentUrl) return
    const popup = window.open('about:blank', '_blank', 'width=1280,height=800')
    if (!popup) return
    popup.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Browser</title>
<style>*{margin:0;padding:0}html,body,iframe{width:100%;height:100%;border:none;background:#000;overflow:hidden}</style>
</head><body><iframe src="${buildProxyUrl(activeTab.currentUrl, settings)}"
  sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-pointer-lock allow-downloads allow-modals allow-top-navigation-by-user-activation"
  allow="accelerometer;autoplay;clipboard-write;encrypted-media;fullscreen;gamepad;gyroscope;microphone;camera;picture-in-picture"
  style="width:100%;height:100%;border:none"></iframe></body></html>`)
    popup.document.close()
  }

  function activateStealth(preset: typeof STEALTH_PRESETS[0]) {
    document.title = preset.title
    setStealth(preset.label)
    setStealthOpen(false)
    let link = document.querySelector<HTMLLinkElement>("link[rel*='icon']")
    if (!link) { link = document.createElement('link'); link.rel = 'shortcut icon'; document.head.appendChild(link) }
    link.href = preset.favicon
  }

  function deactivateStealth() {
    document.title = 'Alhekma Platform'; setStealth(null); setStealthOpen(false)
    const link = document.querySelector<HTMLLinkElement>("link[rel*='icon']")
    if (link) link.href = '/favicon.ico'
  }

  function panic() {
    window.location.replace(PANIC_URL)
  }

  function toggleBookmark() {
    if (!activeTab?.currentUrl) return
    const url = activeTab.currentUrl
    setBookmarks(prev => {
      const next = prev.some(b => b.url === url)
        ? prev.filter(b => b.url !== url)
        : [...prev, { url, title: activeTab.title || parseUrl(url)?.host || url }]
      try { localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }

  function removeBookmark(url: string) {
    setBookmarks(prev => {
      const next = prev.filter(b => b.url !== url)
      try { localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }

  function toggleSplitScreen() {
    if (splitMode) { setSplitMode(false); setSplitTabId(null); return }
    // Pick another tab or open a new one
    const other = tabs.find(t => t.id !== activeId && t.currentUrl)
    if (other) { setSplitTabId(other.id); setSplitMode(true) }
    else {
      const t = newTab()
      setTabs(prev => [...prev, t])
      setSplitTabId(t.id); setSplitMode(true)
    }
  }

  // ============ EFFECTS ============

  // iframe navigation messages
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data?.type !== 'proxy-nav' || typeof e.data.url !== 'string') return
      const navUrl = e.data.url as string
      const title = (e.data.title as string) || parseUrl(navUrl)?.host || 'Untitled'
      // Match source to a tab
      const sourceWindow = e.source as Window
      const tabId = Object.entries(iframeRefs.current).find(([, iframe]) =>
        iframe && iframe.contentWindow === sourceWindow
      )?.[0]
      if (!tabId) return
      updateTab(tabId, t => {
        const nextHistory = t.history[t.histIdx] === navUrl
          ? t.history
          : [...t.history.slice(0, t.histIdx + 1), navUrl]
        return {
          currentUrl: navUrl, title, favicon: faviconFor(navUrl), loading: false,
          history: nextHistory,
          histIdx: nextHistory.length - 1,
        }
      })
      if (tabId === activeId) {
        setInputVal(settings.base64 ? btoa(navUrl) : navUrl)
      }
      pushRecent(navUrl)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [settings.base64, activeId])

  // Close dropdowns on outside click
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (stealthRef.current && !stealthRef.current.contains(e.target as Node)) setStealthOpen(false)
      if (toolsRef.current && !toolsRef.current.contains(e.target as Node)) setToolsOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  // Keyboard shortcuts + panic key
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey

      // Panic: double-Esc
      if (e.key === 'Escape' && settings.panicKey && !cmdOpen && !qrOpen && !stealthOpen) {
        const now = Date.now()
        if (now - escTapRef.current < 500) { panic(); return }
        escTapRef.current = now
      }
      // Escape closes overlays
      if (e.key === 'Escape') {
        if (cmdOpen) { setCmdOpen(false); return }
        if (qrOpen) { setQrOpen(false); return }
        if (stealthOpen) { setStealthOpen(false); return }
        if (toolsOpen) { setToolsOpen(false); return }
      }

      // ⌘K — command palette
      if (meta && e.key === 'k') { e.preventDefault(); setCmdOpen(o => !o); setCmdQuery('') }
      // ⌘L — focus URL
      if (meta && e.key === 'l') { e.preventDefault(); focusUrlBar() }
      // ⌘R — reload
      if (meta && e.key === 'r' && activeTab?.loadedUrl) { e.preventDefault(); reload() }
      // ⌘T — new tab
      if (meta && e.key === 't') { e.preventDefault(); openTab() }
      // ⌘W — close tab
      if (meta && e.key === 'w' && activeId) { e.preventDefault(); closeTab(activeId) }
      // ⌘D — bookmark
      if (meta && e.key === 'd' && activeTab?.currentUrl) { e.preventDefault(); toggleBookmark() }
      // Alt+←/→
      if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); goBack() }
      if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); goForward() }
      // ⌘1-8 — switch tab
      if (meta && /^[1-8]$/.test(e.key)) {
        const idx = parseInt(e.key) - 1
        if (tabs[idx]) { e.preventDefault(); setActiveId(tabs[idx].id) }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeTab, activeId, tabs, settings.panicKey, cmdOpen, qrOpen, stealthOpen, toolsOpen, focusUrlBar, reload, goBack, goForward])

  // Sync input to active tab
  useEffect(() => {
    if (activeTab) setInputVal(activeTab.currentUrl ? (settings.base64 ? btoa(activeTab.currentUrl) : activeTab.currentUrl) : '')
  }, [activeId, settings.base64])

  useEffect(() => {
    homeInputRef.current?.focus()
    return () => { document.title = 'Alhekma Platform' }
  }, [])

  useEffect(() => {
    if (cmdOpen) setTimeout(() => cmdInputRef.current?.focus(), 30)
  }, [cmdOpen])

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault(); goToUrl(inputVal)
  }, [inputVal, goToUrl])

  const cmdActions = useMemo(() => {
    const list: { label: string; hint?: string; action: () => void; icon: string; group: string }[] = [
      { label: 'New tab', hint: '⌘T', action: () => openTab(), icon: '＋', group: 'Tabs' },
      { label: 'Close tab', hint: '⌘W', action: () => activeId && closeTab(activeId), icon: '✕', group: 'Tabs' },
      { label: 'Reload', hint: '⌘R', action: reload, icon: '↺', group: 'Nav' },
      { label: 'Back', hint: 'Alt+←', action: goBack, icon: '←', group: 'Nav' },
      { label: 'Forward', hint: 'Alt+→', action: goForward, icon: '→', group: 'Nav' },
      { label: 'Bookmark this page', hint: '⌘D', action: toggleBookmark, icon: '★', group: 'Actions' },
      { label: 'Show QR code', action: () => setQrOpen(true), icon: '▦', group: 'Actions' },
      { label: 'Open in popup', action: openPopup, icon: '↗', group: 'Actions' },
      { label: `${splitMode ? 'Exit' : 'Enter'} split-screen`, action: toggleSplitScreen, icon: '⧉', group: 'View' },
      { label: `Ad blocker ${settings.adblock ? 'off' : 'on'}`, action: () => setSettings(s => ({ ...s, adblock: !s.adblock })), icon: '⊘', group: 'Privacy' },
      { label: `Panic key ${settings.panicKey ? 'off' : 'on'}`, action: () => setSettings(s => ({ ...s, panicKey: !s.panicKey })), icon: '⚠', group: 'Privacy' },
      { label: `Base64 URLs ${settings.base64 ? 'off' : 'on'}`, action: () => setSettings(s => ({ ...s, base64: !s.base64 })), icon: '⋯', group: 'Privacy' },
      { label: 'Panic → Google Classroom', action: panic, icon: '⚡', group: 'Privacy' },
      ...STEALTH_PRESETS.map(p => ({ label: `Disguise as ${p.label}`, action: () => activateStealth(p), icon: '👤', group: 'Stealth' })),
      ...UA_OPTIONS.map(u => ({ label: `User-agent: ${u.label}`, action: () => setSettings(s => ({ ...s, ua: u.id })), icon: u.icon, group: 'Network' })),
    ]
    if (!cmdQuery.trim()) return list
    const q = cmdQuery.toLowerCase()
    return list.filter(a => a.label.toLowerCase().includes(q) || a.group.toLowerCase().includes(q))
  }, [cmdQuery, splitMode, settings, activeId, reload, goBack, goForward])

  // ============ RENDER ============

  return (
    <>
      <style jsx global>{`
        @keyframes proxy-load-bar { 0%{transform:translateX(-100%)}50%{transform:translateX(30%)}100%{transform:translateX(250%)} }
        @keyframes proxy-aurora-1 { 0%,100%{transform:translate(0,0) scale(1);opacity:.6}33%{transform:translate(60px,-40px) scale(1.1);opacity:.8}66%{transform:translate(-40px,40px) scale(.95);opacity:.5} }
        @keyframes proxy-aurora-2 { 0%,100%{transform:translate(0,0) scale(1);opacity:.5}50%{transform:translate(-80px,60px) scale(1.15);opacity:.7} }
        @keyframes proxy-fade-in { from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)} }
        @keyframes proxy-scale-in { from{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)} }
        @keyframes proxy-pulse { 0%,100%{opacity:1}50%{opacity:.4} }
        .proxy-grid-bg {
          background-image:
            linear-gradient(rgba(139,92,246,.03) 1px,transparent 1px),
            linear-gradient(90deg,rgba(139,92,246,.03) 1px,transparent 1px);
          background-size: 48px 48px;
          mask-image: radial-gradient(ellipse 800px 500px at center,black,transparent 70%);
        }
        .proxy-scroll::-webkit-scrollbar{ width:6px;height:6px }
        .proxy-scroll::-webkit-scrollbar-thumb{ background:rgba(255,255,255,.08);border-radius:3px }
        .proxy-scroll::-webkit-scrollbar-thumb:hover{ background:rgba(255,255,255,.14) }
      `}</style>

      <div className="fixed inset-0 pt-[64px] flex flex-col bg-black overflow-hidden">
        {/* Loading bar */}
        {activeTab?.loading && activeTab.loadedUrl && (
          <div className="absolute top-[64px] left-0 right-0 h-[2px] z-[60] overflow-hidden pointer-events-none">
            <div className="h-full rounded-r-full" style={{
              background: 'linear-gradient(90deg,transparent,#8B5CF6 20%,#A78BFA 50%,#8B5CF6 80%,transparent)',
              animation: 'proxy-load-bar 1.4s ease-in-out infinite', width: '40%', boxShadow: '0 0 12px rgba(139,92,246,.5)',
            }} />
          </div>
        )}

        {/* Tab strip */}
        <div className="flex items-center gap-1 px-2 pt-1.5 pb-0 flex-shrink-0 relative z-40" style={{ background: 'rgba(2,2,3,.94)', backdropFilter: 'blur(24px)' }}>
          <div className="flex-1 flex items-center gap-1 overflow-x-auto proxy-scroll">
            {tabs.map((t, i) => {
              const isActive = t.id === activeId
              const isSplit = t.id === splitTabId
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveId(t.id)}
                  className={`group flex items-center gap-2 px-3 h-8 rounded-t-lg text-xs transition-all min-w-[100px] max-w-[200px] flex-shrink-0 ${
                    isActive ? 'text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                  style={isActive ? {
                    background: 'rgba(5,5,6,.98)', borderTop: '1px solid rgba(255,255,255,.08)',
                    borderLeft: '1px solid rgba(255,255,255,.08)', borderRight: '1px solid rgba(255,255,255,.08)',
                    boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,.05)',
                  } : { background: 'rgba(255,255,255,.02)', border: '1px solid transparent' }}
                >
                  {t.favicon ? (
                    <img src={t.favicon} alt="" className="h-3.5 w-3.5 flex-shrink-0" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                  ) : t.loading ? (
                    <span className="h-2 w-2 rounded-full bg-violet-400 flex-shrink-0" style={{ animation: 'proxy-pulse 1s ease-in-out infinite' }} />
                  ) : (
                    <span className="h-3.5 w-3.5 rounded-sm flex-shrink-0" style={{ background: 'rgba(255,255,255,.05)' }} />
                  )}
                  <span className="flex-1 truncate text-left">{t.title}</span>
                  {isSplit && <span className="text-[9px] font-mono text-violet-400 flex-shrink-0">◧</span>}
                  <span
                    role="button"
                    tabIndex={-1}
                    onClick={e => { e.stopPropagation(); closeTab(t.id) }}
                    className={`h-4 w-4 rounded flex items-center justify-center hover:bg-white/[.1] transition-opacity ${isActive ? 'opacity-60 hover:opacity-100' : 'opacity-0 group-hover:opacity-60'}`}
                  >
                    <svg width="8" height="8" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                  </span>
                </button>
              )
            })}
            {tabs.length < MAX_TABS && (
              <button
                onClick={() => openTab()}
                title="New tab (⌘T)"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-100 hover:bg-white/[.05] transition-all flex-shrink-0"
              >
                <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/>
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Browser chrome */}
        <div className="flex items-center gap-2 px-3 py-2 flex-shrink-0 relative z-40" style={{
          background: 'rgba(5,5,6,.98)', backdropFilter: 'blur(24px) saturate(180%)',
          borderBottom: '1px solid rgba(255,255,255,.06)',
        }}>
          {/* Nav pill */}
          <div className="flex items-center gap-0.5 p-0.5 rounded-xl" style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.05)' }}>
            <IconBtn onClick={goBack} disabled={!canBack} title="Back (Alt+←)">
              <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
            </IconBtn>
            <IconBtn onClick={goForward} disabled={!canForward} title="Forward (Alt+→)">
              <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
            </IconBtn>
            <IconBtn onClick={reload} disabled={!activeTab?.loadedUrl} title="Reload (⌘R)">
              <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className={activeTab?.loading ? 'animate-spin' : ''}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
              </svg>
            </IconBtn>
          </div>

          {/* URL bar */}
          <form className="flex-1 flex items-center gap-2 min-w-0" onSubmit={handleSubmit}>
            <div className="relative flex flex-1 items-center gap-2.5 rounded-xl px-3 h-9 transition-all duration-200 min-w-0" style={{
              background: urlFocused ? 'rgba(255,255,255,.05)' : 'rgba(255,255,255,.03)',
              border: urlFocused ? '1px solid rgba(139,92,246,.35)' : '1px solid rgba(255,255,255,.07)',
              boxShadow: urlFocused
                ? 'inset 0 1px 0 0 rgba(255,255,255,.04),0 0 0 3px rgba(139,92,246,.1),0 0 24px rgba(139,92,246,.08)'
                : 'inset 0 1px 0 0 rgba(255,255,255,.02)',
            }}>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {activeTab?.loading ? (
                  <span className="h-2 w-2 rounded-full bg-violet-400" style={{ animation: 'proxy-pulse 1s ease-in-out infinite', boxShadow: '0 0 6px rgba(139,92,246,.6)' }} />
                ) : urlParts?.isSecure ? (
                  <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" className="text-emerald-500/70">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
                  </svg>
                ) : (
                  <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" className="text-zinc-600">
                    <circle cx="11" cy="11" r="8"/><path strokeLinecap="round" d="M21 21l-4.35-4.35"/>
                  </svg>
                )}
              </div>

              {!urlFocused && urlParts && !settings.base64 && (
                <div className="absolute left-[38px] right-8 pointer-events-none flex items-center h-full text-xs truncate" style={{ fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace' }}>
                  <span className="text-zinc-600">{urlParts.scheme}://</span>
                  <span className="text-zinc-100 font-medium">{urlParts.host}</span>
                  <span className="text-zinc-600 truncate">{urlParts.rest}</span>
                </div>
              )}

              <input
                ref={inputRef} value={inputVal}
                onChange={e => setInputVal(e.target.value)}
                onFocus={e => { setUrlFocused(true); e.target.select() }}
                onBlur={() => setUrlFocused(false)}
                placeholder="Search or enter URL…"
                className={`flex-1 bg-transparent text-xs text-zinc-100 placeholder:text-zinc-600 outline-none min-w-0 font-mono ${!urlFocused && urlParts && !settings.base64 ? 'text-transparent selection:text-zinc-100 caret-transparent' : ''}`}
                spellCheck={false} autoComplete="off" autoCorrect="off"
              />

              {activeTab?.currentUrl && (
                <button
                  type="button"
                  onClick={toggleBookmark}
                  title={isBookmarked ? 'Remove bookmark (⌘D)' : 'Bookmark (⌘D)'}
                  className={`flex-shrink-0 transition-colors ${isBookmarked ? 'text-amber-400' : 'text-zinc-600 hover:text-zinc-300'}`}
                >
                  <svg width="12" height="12" fill={isBookmarked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/>
                  </svg>
                </button>
              )}
            </div>
          </form>

          {/* Right controls */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {activeTab?.currentUrl && (
              <IconBtn onClick={openPopup} title="Open in popup">
                <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                </svg>
              </IconBtn>
            )}

            {/* Tools menu */}
            <div className="relative hidden sm:block" ref={toolsRef}>
              <button
                onClick={() => setToolsOpen(o => !o)}
                title="Tools"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-100 hover:bg-white/[.05] transition-all"
                style={toolsOpen ? { background: 'rgba(255,255,255,.05)' } : undefined}
              >
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                </svg>
              </button>
              {toolsOpen && (
                <div className="absolute right-0 top-full mt-1.5 z-50 rounded-xl overflow-hidden min-w-[240px]" style={{
                  background: 'rgba(5,5,6,.99)', border: '1px solid rgba(255,255,255,.08)',
                  boxShadow: '0 20px 60px rgba(0,0,0,.7),inset 0 1px 0 0 rgba(255,255,255,.06)',
                  backdropFilter: 'blur(20px)', animation: 'proxy-fade-in .15s ease-out',
                }}>
                  <MenuHeader>Privacy</MenuHeader>
                  <MenuToggle active={settings.adblock} onClick={() => setSettings(s => ({ ...s, adblock: !s.adblock }))} label="Ad blocker" hint="Block trackers & ads" />
                  <MenuToggle active={settings.panicKey} onClick={() => setSettings(s => ({ ...s, panicKey: !s.panicKey }))} label="Panic key" hint="Double-tap Esc" />
                  <MenuToggle active={settings.base64} onClick={() => setSettings(s => ({ ...s, base64: !s.base64 }))} label="Base64 URLs" hint="Mask URLs in bar" />

                  <MenuHeader>User agent</MenuHeader>
                  {UA_OPTIONS.map(u => (
                    <MenuItem key={u.id} active={settings.ua === u.id} onClick={() => setSettings(s => ({ ...s, ua: u.id }))}>
                      <span className="mr-2">{u.icon}</span>{u.label}
                    </MenuItem>
                  ))}

                  <MenuHeader>Actions</MenuHeader>
                  <MenuItem onClick={() => { setToolsOpen(false); setQrOpen(true) }} disabled={!activeTab?.currentUrl}>▦ Share via QR</MenuItem>
                  <MenuItem onClick={() => { setToolsOpen(false); toggleSplitScreen() }}>⧉ {splitMode ? 'Exit' : 'Enter'} split-screen</MenuItem>
                  <MenuItem onClick={() => { setToolsOpen(false); panic() }}>⚡ Panic → Classroom</MenuItem>
                  <MenuItem onClick={() => { setToolsOpen(false); setCmdOpen(true) }}>⌘ Command palette</MenuItem>
                </div>
              )}
            </div>

            {/* Stealth */}
            <div className="relative hidden sm:block" ref={stealthRef}>
              <button
                onClick={() => setStealthOpen(o => !o)}
                title="Stealth"
                className={`flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[10px] font-mono transition-all ${
                  stealth ? 'text-violet-300' : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/[.05]'
                }`}
                style={stealth ? {
                  background: 'rgba(139,92,246,.12)', border: '1px solid rgba(139,92,246,.28)',
                  boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,.04)',
                } : { border: '1px solid transparent' }}
              >
                <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                </svg>
                {stealth ?? 'Stealth'}
              </button>
              {stealthOpen && (
                <div className="absolute right-0 top-full mt-1.5 z-50 rounded-xl overflow-hidden min-w-[200px] max-h-[400px] overflow-y-auto proxy-scroll" style={{
                  background: 'rgba(5,5,6,.99)', border: '1px solid rgba(255,255,255,.08)',
                  boxShadow: '0 20px 60px rgba(0,0,0,.7),inset 0 1px 0 0 rgba(255,255,255,.06)',
                  backdropFilter: 'blur(20px)', animation: 'proxy-fade-in .15s ease-out',
                }}>
                  <MenuHeader>Disguise tab</MenuHeader>
                  {stealth && (
                    <button onClick={deactivateStealth} className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-mono text-rose-400/80 hover:text-rose-300 hover:bg-rose-500/[.06] transition-colors border-b border-white/[.05]">
                      <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12"/></svg>
                      Turn off
                    </button>
                  )}
                  {STEALTH_PRESETS.map(p => (
                    <button key={p.label} onClick={() => activateStealth(p)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-[11px] font-mono transition-colors hover:bg-white/[.04] ${stealth === p.label ? 'text-violet-300' : 'text-zinc-400 hover:text-zinc-100'}`}>
                      <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ background: stealth === p.label ? '#A78BFA' : 'rgba(255,255,255,.12)' }} />
                      {p.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bookmarks bar */}
        {bookmarks.length > 0 && (
          <div className="flex items-center gap-1 px-2 py-1 flex-shrink-0 overflow-x-auto proxy-scroll" style={{
            background: 'rgba(5,5,6,.85)', borderBottom: '1px solid rgba(255,255,255,.04)',
          }}>
            {bookmarks.map(b => (
              <div key={b.url} className="group relative flex items-center flex-shrink-0">
                <button
                  onClick={() => goToUrl(b.url)}
                  title={b.url}
                  className="flex items-center gap-1.5 h-6 px-2 rounded-md text-[10px] text-zinc-400 hover:text-zinc-100 hover:bg-white/[.05] transition-all"
                >
                  <img src={faviconFor(b.url)} alt="" className="h-3 w-3" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                  <span className="truncate max-w-[120px]">{b.title}</span>
                </button>
                <button
                  onClick={() => removeBookmark(b.url)}
                  className="opacity-0 group-hover:opacity-100 h-4 w-4 flex items-center justify-center rounded text-zinc-600 hover:text-rose-400 transition-opacity"
                  title="Remove bookmark"
                >
                  <svg width="8" height="8" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Content: home, iframe, or split */}
        <div className={`flex-1 min-h-0 ${splitMode && splitTab ? 'grid grid-cols-2 gap-px bg-white/[.05]' : ''}`}>
          {tabs.map(t => {
            const isVisible = t.id === activeId || (splitMode && t.id === splitTabId)
            if (!isVisible) return null
            if (!t.loadedUrl) {
              return <HomeScreen key={t.id} tabId={t.id} onGo={url => goToUrl(url, t.id)} recent={recent} clearRecent={clearRecent} homeInputRef={t.id === activeId ? homeInputRef : undefined} />
            }
            return (
              <iframe
                key={t.id}
                ref={el => { iframeRefs.current[t.id] = el }}
                src={t.loadedUrl}
                className="w-full h-full border-0 block bg-white"
                sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals allow-top-navigation-by-user-activation allow-pointer-lock"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; gamepad; gyroscope; microphone; camera; picture-in-picture"
                title={t.title}
                referrerPolicy="no-referrer"
                onLoad={() => updateTab(t.id, () => ({ loading: false }))}
              />
            )
          })}
        </div>

        {/* Command palette */}
        {cmdOpen && (
          <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4" style={{ background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(6px)', animation: 'proxy-fade-in .12s ease-out' }} onClick={() => setCmdOpen(false)}>
            <div
              className="w-full max-w-xl rounded-2xl overflow-hidden"
              style={{
                background: 'rgba(8,8,10,.98)', border: '1px solid rgba(255,255,255,.1)',
                boxShadow: '0 40px 100px rgba(0,0,0,.8),inset 0 1px 0 0 rgba(255,255,255,.08)',
                animation: 'proxy-scale-in .15s ease-out',
              }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 px-4 h-12 border-b border-white/[.06]">
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" className="text-zinc-600">
                  <circle cx="11" cy="11" r="8"/><path strokeLinecap="round" d="M21 21l-4.35-4.35"/>
                </svg>
                <input
                  ref={cmdInputRef}
                  value={cmdQuery}
                  onChange={e => setCmdQuery(e.target.value)}
                  placeholder="Search commands, sites, bookmarks…"
                  className="flex-1 bg-transparent text-sm text-zinc-100 placeholder:text-zinc-600 outline-none"
                  onKeyDown={e => {
                    if (e.key === 'Enter' && cmdActions[0]) {
                      cmdActions[0].action()
                      setCmdOpen(false)
                    }
                  }}
                />
                <kbd className="h-5 px-1.5 rounded-md text-[9px] font-mono text-zinc-600" style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.06)' }}>Esc</kbd>
              </div>
              <div className="max-h-[400px] overflow-y-auto proxy-scroll">
                {cmdActions.length === 0 ? (
                  <div className="px-4 py-8 text-center text-xs text-zinc-600">No matches</div>
                ) : (
                  cmdActions.slice(0, 40).map((a, i) => (
                    <button
                      key={i}
                      onClick={() => { a.action(); setCmdOpen(false) }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-xs text-zinc-300 hover:text-zinc-100 hover:bg-white/[.04] transition-colors group"
                    >
                      <span className="w-6 text-center text-zinc-500 group-hover:text-violet-300 transition-colors">{a.icon}</span>
                      <span className="flex-1 text-left">{a.label}</span>
                      <span className="text-[9px] font-mono text-zinc-700 uppercase tracking-widest">{a.group}</span>
                      {a.hint && <kbd className="h-5 px-1.5 rounded-md text-[9px] font-mono text-zinc-500" style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.06)' }}>{a.hint}</kbd>}
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* QR modal */}
        {qrOpen && activeTab?.currentUrl && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(8px)', animation: 'proxy-fade-in .12s ease-out' }} onClick={() => setQrOpen(false)}>
            <div className="rounded-2xl overflow-hidden p-6 max-w-sm w-full" style={{
              background: 'rgba(8,8,10,.99)', border: '1px solid rgba(255,255,255,.1)',
              boxShadow: '0 40px 100px rgba(0,0,0,.8),inset 0 1px 0 0 rgba(255,255,255,.08)',
              animation: 'proxy-scale-in .15s ease-out',
            }} onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-zinc-100">Scan to open on phone</h3>
                <button onClick={() => setQrOpen(false)} className="text-zinc-500 hover:text-zinc-100">
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
              <div className="rounded-xl p-4 flex items-center justify-center" style={{ background: '#ffffff' }}>
                <img
                  src={`/api/proxy?url=${encodeURIComponent(`https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=0&data=${encodeURIComponent(activeTab.currentUrl)}`)}`}
                  alt="QR code" width={280} height={280}
                />
              </div>
              <p className="mt-3 text-[10px] font-mono text-zinc-500 truncate text-center">{activeTab.currentUrl}</p>
            </div>
          </div>
        )}

        {/* Bottom-right status: split-screen exit + panic hint */}
        {splitMode && (
          <button
            onClick={toggleSplitScreen}
            className="absolute bottom-4 right-4 z-40 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-mono text-zinc-300"
            style={{ background: 'rgba(5,5,6,.95)', border: '1px solid rgba(255,255,255,.1)', boxShadow: '0 8px 24px rgba(0,0,0,.5)' }}
          >
            <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12"/></svg>
            Exit split-screen
          </button>
        )}
      </div>
    </>
  )
}

// ============ SUB-COMPONENTS ============

function IconBtn({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...props} className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-100 hover:bg-white/[.06] disabled:opacity-20 disabled:cursor-not-allowed transition-all duration-150 active:scale-90">
      {children}
    </button>
  )
}

function MenuHeader({ children }: { children: React.ReactNode }) {
  return <div className="px-3 py-1.5 text-[9px] uppercase tracking-widest font-mono text-zinc-600 border-b border-white/[.04]">{children}</div>
}

function MenuItem({ children, active, onClick, disabled }: { children: React.ReactNode; active?: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center px-3 py-2 text-[11px] font-mono transition-colors hover:bg-white/[.04] disabled:opacity-30 disabled:cursor-not-allowed ${active ? 'text-violet-300' : 'text-zinc-400 hover:text-zinc-100'}`}
    >
      {children}
    </button>
  )
}

function MenuToggle({ label, hint, active, onClick }: { label: string; hint?: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center justify-between px-3 py-2 text-[11px] font-mono transition-colors hover:bg-white/[.04] text-zinc-300 hover:text-zinc-100">
      <span className="flex flex-col items-start">
        <span>{label}</span>
        {hint && <span className="text-[9px] text-zinc-600">{hint}</span>}
      </span>
      <span className={`flex-shrink-0 h-4 w-7 rounded-full transition-all ${active ? 'bg-violet-500' : 'bg-zinc-800'}`}>
        <span className={`block h-3 w-3 rounded-full bg-white mt-0.5 transition-transform ${active ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
      </span>
    </button>
  )
}

function HomeScreen({ tabId, onGo, recent, clearRecent, homeInputRef }: {
  tabId: string
  onGo: (url: string) => void
  recent: string[]
  clearRecent: () => void
  homeInputRef?: React.RefObject<HTMLInputElement | null>
}) {
  const [val, setVal] = useState('')
  return (
    <div className="relative w-full h-full overflow-auto proxy-scroll">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-[10%] left-[20%] w-[500px] h-[500px] rounded-full" style={{
          background: 'radial-gradient(circle,rgba(139,92,246,.15) 0%,transparent 70%)',
          filter: 'blur(60px)', animation: 'proxy-aurora-1 18s ease-in-out infinite',
        }} />
        <div className="absolute bottom-[15%] right-[15%] w-[400px] h-[400px] rounded-full" style={{
          background: 'radial-gradient(circle,rgba(99,102,241,.12) 0%,transparent 70%)',
          filter: 'blur(80px)', animation: 'proxy-aurora-2 22s ease-in-out infinite',
        }} />
        <div className="absolute inset-0 proxy-grid-bg" />
      </div>

      <div className="relative min-h-full flex flex-col items-center justify-center px-6 py-12 gap-10">
        {/* Hero */}
        <div className="text-center space-y-4" style={{ animation: 'proxy-fade-in .6s ease-out' }}>
          <div className="inline-flex items-center gap-2 rounded-full px-3 py-1" style={{ background: 'rgba(139,92,246,.06)', border: '1px solid rgba(139,92,246,.18)' }}>
            <span className="h-1.5 w-1.5 rounded-full bg-violet-400" style={{ animation: 'proxy-pulse 2s ease-in-out infinite', boxShadow: '0 0 6px rgba(139,92,246,.6)' }} />
            <span className="font-mono text-[10px] text-violet-300 uppercase tracking-[.2em]">Proxy Browser</span>
          </div>
          <h2 className="text-4xl sm:text-5xl font-semibold tracking-tight leading-none" style={{
            fontFamily: 'var(--font-nacelle),ui-sans-serif,system-ui,sans-serif',
            backgroundImage: 'linear-gradient(180deg,#FAFAFA 0%,#A1A1AA 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          }}>
            Browse anywhere
          </h2>
          <p className="text-sm text-zinc-500 max-w-md mx-auto">
            Search the web, open any URL, land on any site. Multi-tab, ad-block, disguised, panic-ready.
          </p>
        </div>

        {/* Big search */}
        <form className="relative w-full max-w-2xl" onSubmit={e => { e.preventDefault(); onGo(val) }} style={{ animation: 'proxy-fade-in .7s ease-out .1s both' }}>
          <div className="group flex items-center gap-3 rounded-2xl px-5 h-14 w-full transition-all duration-200 focus-within:scale-[1.01]" style={{
            background: 'rgba(10,10,12,.6)', border: '1px solid rgba(255,255,255,.08)',
            boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,.04),0 8px 32px rgba(0,0,0,.4)',
            backdropFilter: 'blur(20px)',
          }}>
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" className="text-zinc-600 group-focus-within:text-violet-400 transition-colors flex-shrink-0">
              <circle cx="11" cy="11" r="8"/><path strokeLinecap="round" d="M21 21l-4.35-4.35"/>
            </svg>
            <input ref={homeInputRef} value={val} onChange={e => setVal(e.target.value)}
              placeholder="Type a URL or search anything…"
              className="flex-1 bg-transparent text-[15px] text-zinc-100 placeholder:text-zinc-600 outline-none"
              spellCheck={false} autoComplete="off" autoCorrect="off"
            />
            {val ? (
              <button type="submit" className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold text-violet-100 transition-all active:scale-95 hover:brightness-110" style={{
                background: 'linear-gradient(180deg,rgba(139,92,246,.4) 0%,rgba(124,58,237,.5) 100%)',
                border: '1px solid rgba(167,139,250,.4)', boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,.15),0 4px 12px rgba(139,92,246,.25)',
              }}>
                Enter <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
              </button>
            ) : (
              <kbd className="hidden sm:flex items-center gap-1 flex-shrink-0 h-6 px-2 rounded-md text-[10px] font-mono text-zinc-600" style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.06)' }}>⌘ K</kbd>
            )}
          </div>
        </form>

        {/* Quick access */}
        <div className="w-full max-w-2xl" style={{ animation: 'proxy-fade-in .7s ease-out .2s both' }}>
          <p className="mb-3 px-1 text-[10px] uppercase tracking-[.2em] font-mono text-zinc-600">Quick access</p>
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
            {QUICK_LINKS.map(l => (
              <button key={l.url} onClick={() => onGo(l.url)}
                className="group relative flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl transition-all duration-200 hover:-translate-y-0.5 overflow-hidden"
                style={{ background: 'rgba(10,10,12,.5)', border: '1px solid rgba(255,255,255,.05)', boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,.02)' }}
                onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.boxShadow = `inset 0 1px 0 0 rgba(255,255,255,.06),0 8px 24px ${l.hue}22,0 0 0 1px ${l.hue}33`; el.style.borderColor = 'transparent' }}
                onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.boxShadow = 'inset 0 1px 0 0 rgba(255,255,255,.02)'; el.style.borderColor = 'rgba(255,255,255,.05)' }}
              >
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" style={{ background: `radial-gradient(ellipse at top,${l.hue}12 0%,transparent 60%)` }} />
                <span className="relative text-xl">{l.icon}</span>
                <span className="relative text-[9px] font-mono text-zinc-500 group-hover:text-zinc-200 transition-colors tracking-wide">{l.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Recent */}
        {recent.length > 0 && (
          <div className="w-full max-w-2xl" style={{ animation: 'proxy-fade-in .7s ease-out .3s both' }}>
            <div className="flex items-center justify-between mb-3 px-1">
              <p className="text-[10px] uppercase tracking-[.2em] font-mono text-zinc-600">Recent</p>
              <button onClick={clearRecent} className="text-[10px] font-mono text-zinc-700 hover:text-zinc-400 transition-colors">Clear</button>
            </div>
            <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(10,10,12,.5)', border: '1px solid rgba(255,255,255,.05)', boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,.02)' }}>
              {recent.slice(0, 5).map((u, i) => {
                const p = parseUrl(u)
                return (
                  <button key={u + i} onClick={() => onGo(u)}
                    className="group w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/[.03] transition-colors border-b border-white/[.03] last:border-b-0 text-left"
                  >
                    <div className="h-6 w-6 rounded-md flex items-center justify-center flex-shrink-0 overflow-hidden" style={{ background: 'rgba(255,255,255,.05)' }}>
                      <img src={faviconFor(u)} alt="" className="h-4 w-4" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
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

        {/* Shortcut hints */}
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[10px] font-mono text-zinc-700 mt-4">
          {[
            ['⌘ K', 'commands'], ['⌘ T', 'new tab'], ['⌘ W', 'close tab'],
            ['⌘ L', 'focus url'], ['⌘ D', 'bookmark'], ['⌘ R', 'reload'],
            ['Alt ← →', 'history'], ['Esc Esc', 'panic'],
          ].map(([key, label]) => (
            <span key={key} className="flex items-center gap-1.5">
              <kbd className="h-5 px-1.5 rounded-md" style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.06)' }}>{key}</kbd>
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
