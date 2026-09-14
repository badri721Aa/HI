'use client'

import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'

type ItemKind = 'nav' | 'action' | 'tool' | 'troll' | 'admin' | 'dev'

interface Item {
  label: string
  desc: string
  href?: string
  action?: () => void | Promise<void>
  tag: string
  kind: ItemKind
  icon: string
  shortcut?: string
}

// ── Tag colours ──────────────────────────────────────────────
const TAG_COLORS: Record<string, string> = {
  Page: 'text-zinc-500 bg-zinc-800/60',
  Chat: 'text-blue-400 bg-blue-500/10',
  Feed: 'text-amber-400 bg-amber-500/10',
  Proxy: 'text-violet-400 bg-violet-500/10',
  AI: 'text-violet-400 bg-violet-500/10',
  Chrome: 'text-emerald-400 bg-emerald-500/10',
  Study: 'text-sky-400 bg-sky-500/10',
  Admin: 'text-rose-400 bg-rose-500/10',
  Owner: 'text-amber-400 bg-amber-500/10',
  Auth: 'text-zinc-400 bg-zinc-800/60',
  Action: 'text-emerald-400 bg-emerald-500/10',
  Tool: 'text-teal-400 bg-teal-500/10',
  Troll: 'text-rose-400 bg-rose-500/10',
  Dev: 'text-teal-400 bg-teal-500/10',
  FX: 'text-purple-400 bg-purple-500/10',
  Util: 'text-zinc-400 bg-zinc-800/60',
}

// ── Helpers ──────────────────────────────────────────────────
function copy(text: string) {
  navigator.clipboard.writeText(text).catch(() => {})
}

function injectCSS(id: string, css: string) {
  let el = document.getElementById(id) as HTMLStyleElement | null
  if (!el) { el = document.createElement('style'); el.id = id; document.head.appendChild(el) }
  el.textContent = css
}
function removeCSS(id: string) { document.getElementById(id)?.remove() }

function playTone(freq: number, dur = 0.3, type: OscillatorType = 'sine') {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.connect(g); g.connect(ctx.destination)
    osc.type = type; osc.frequency.value = freq
    g.gain.setValueAtTime(0.25, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur)
    osc.start(); osc.stop(ctx.currentTime + dur)
  } catch {}
}

function shakeScreen() {
  injectCSS('cmd-shake', `@keyframes cmd-sk{0%,100%{transform:translate(0)}15%,45%,75%{transform:translate(-8px,4px)}30%,60%,90%{transform:translate(8px,-4px)}} body{animation:cmd-sk .5s ease-in-out 3}`)
  setTimeout(() => removeCSS('cmd-shake'), 1600)
}

// ── All commands ─────────────────────────────────────────────
function buildItems(): Item[] {
  const nav: Item[] = [
    { label: 'Home', desc: 'Platform dashboard and module overview', href: '/', tag: 'Page', kind: 'nav', icon: '⌂' },
    { label: 'Live Chat', desc: 'Real-time messaging, reactions, P2P video', href: '/chat', tag: 'Chat', kind: 'nav', icon: '💬', shortcut: 'G C' },
    { label: 'News Feed', desc: 'Pinned announcements and admin broadcasts', href: '/news', tag: 'Feed', kind: 'nav', icon: '📡' },
    { label: 'Proxy Browser', desc: 'Bypass content filters, browse freely', href: '/proxy', tag: 'Proxy', kind: 'nav', icon: '🌐' },
    { label: 'AI Assistant', desc: 'In-browser AI, no API keys required', href: '/ai', tag: 'AI', kind: 'nav', icon: '🤖' },
    { label: 'Extensions', desc: 'Chrome companion extension', href: '/extensions', tag: 'Chrome', kind: 'nav', icon: '🧩' },
    { label: 'Study Tools', desc: '600+ exam tricks and strategies', href: '/tricks', tag: 'Study', kind: 'nav', icon: '📚' },
    { label: 'Admin Panel', desc: 'Users, roles, broadcasts, audit log', href: '/admin', tag: 'Admin', kind: 'admin', icon: '⚙️' },
    { label: 'Troll Engine', desc: 'Broadcast effects to online users', href: '/admin/troll-panel', tag: 'Troll', kind: 'troll', icon: '🎭' },
    { label: 'Dev Tools', desc: 'REST, JWT, hash, regex, JS sandbox', href: '/admin/devtools', tag: 'Dev', kind: 'dev', icon: '🛠️' },
    { label: 'Role Manager', desc: 'Grant and revoke user roles', href: '/admin/roles', tag: 'Admin', kind: 'admin', icon: '👑' },
    { label: 'Owner Suite', desc: 'Full owner control panel', href: '/admin/owner-suite', tag: 'Owner', kind: 'admin', icon: '🔑' },
    { label: 'Sign In', desc: 'Log in to the platform', href: '/auth/login', tag: 'Auth', kind: 'nav', icon: '🔓' },
  ]

  const actions: Item[] = [
    {
      label: 'Copy page URL',
      desc: 'Copy current page URL to clipboard',
      tag: 'Action', kind: 'action', icon: '📋',
      action: () => copy(window.location.href),
    },
    {
      label: 'Toggle dark / light',
      desc: 'Switch color scheme preference',
      tag: 'Action', kind: 'action', icon: '🌗',
      action: () => {
        const root = document.documentElement
        root.dataset.theme = root.dataset.theme === 'light' ? 'dark' : 'light'
      },
    },
    {
      label: 'Scroll to top',
      desc: 'Jump to the top of the page',
      tag: 'Action', kind: 'action', icon: '⬆️',
      action: () => window.scrollTo({ top: 0, behavior: 'smooth' }),
    },
    {
      label: 'Scroll to bottom',
      desc: 'Jump to the bottom of the page',
      tag: 'Action', kind: 'action', icon: '⬇️',
      action: () => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }),
    },
    {
      label: 'Full screen',
      desc: 'Toggle browser fullscreen mode',
      tag: 'Action', kind: 'action', icon: '⛶',
      action: () => {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen?.()
        else document.exitFullscreen?.()
      },
    },
    {
      label: 'Print page',
      desc: 'Open the browser print dialog',
      tag: 'Action', kind: 'action', icon: '🖨️',
      action: () => window.print(),
    },
    {
      label: 'Hard reload',
      desc: 'Force reload bypassing cache',
      tag: 'Action', kind: 'action', icon: '🔄',
      action: () => window.location.reload(),
    },
    {
      label: 'Copy user agent',
      desc: 'Copy browser user-agent string',
      tag: 'Action', kind: 'action', icon: '📋',
      action: () => copy(navigator.userAgent),
    },
    {
      label: 'Focus search',
      desc: 'Focus this search input',
      tag: 'Action', kind: 'action', icon: '🔍',
      action: () => {},
    },
    {
      label: 'Go back',
      desc: 'Browser back navigation',
      tag: 'Action', kind: 'action', icon: '←',
      action: () => window.history.back(),
    },
    {
      label: 'Go forward',
      desc: 'Browser forward navigation',
      tag: 'Action', kind: 'action', icon: '→',
      action: () => window.history.forward(),
    },
  ]

  const devTools: Item[] = [
    {
      label: 'Open REST Tester',
      desc: 'Make HTTP requests in-browser',
      href: '/admin/devtools#rest', tag: 'Dev', kind: 'dev', icon: '🌐',
    },
    {
      label: 'Open JWT Decoder',
      desc: 'Decode and inspect JWT tokens',
      href: '/admin/devtools#jwt', tag: 'Dev', kind: 'dev', icon: '🔐',
    },
    {
      label: 'Open Hash Generator',
      desc: 'SHA-1, SHA-256, SHA-512 hashing',
      href: '/admin/devtools#hash', tag: 'Dev', kind: 'dev', icon: '#️⃣',
    },
    {
      label: 'Open Base64 Tool',
      desc: 'Encode and decode Base64',
      href: '/admin/devtools#base64', tag: 'Dev', kind: 'dev', icon: '🔤',
    },
    {
      label: 'Open JSON Formatter',
      desc: 'Format, minify, validate JSON',
      href: '/admin/devtools#json', tag: 'Dev', kind: 'dev', icon: '{}',
    },
    {
      label: 'Open Regex Tester',
      desc: 'Test regex patterns live',
      href: '/admin/devtools#regex', tag: 'Dev', kind: 'dev', icon: '.*',
    },
    {
      label: 'Open JS Console',
      desc: 'Execute JavaScript in-browser',
      href: '/admin/devtools#console', tag: 'Dev', kind: 'dev', icon: '>_',
    },
    {
      label: 'Open CSS Generator',
      desc: 'Generate glass, gradient and shadow CSS',
      href: '/admin/devtools#css', tag: 'Dev', kind: 'dev', icon: '🎨',
    },
    {
      label: 'Open Performance Monitor',
      desc: 'FPS, heap, DOM count, ping',
      href: '/admin/devtools#monitor', tag: 'Dev', kind: 'dev', icon: '📊',
    },
    {
      label: 'Copy timestamp (ISO)',
      desc: 'Copy current UTC ISO timestamp',
      tag: 'Dev', kind: 'dev', icon: '⏰',
      action: () => copy(new Date().toISOString()),
    },
    {
      label: 'Copy timestamp (Unix)',
      desc: 'Copy current Unix epoch (seconds)',
      tag: 'Dev', kind: 'dev', icon: '⏱️',
      action: () => copy(String(Math.floor(Date.now() / 1000))),
    },
    {
      label: 'Generate UUID v4',
      desc: 'Create and copy a random UUID',
      tag: 'Dev', kind: 'dev', icon: '🆔',
      action: () => copy(crypto.randomUUID()),
    },
    {
      label: 'Copy local storage dump',
      desc: 'Serialise and copy all localStorage keys',
      tag: 'Dev', kind: 'dev', icon: '💾',
      action: () => {
        const obj: Record<string, string> = {}
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i)!
          obj[k] = localStorage.getItem(k) ?? ''
        }
        copy(JSON.stringify(obj, null, 2))
      },
    },
    {
      label: 'Log cookie string',
      desc: 'Print document.cookie to console',
      tag: 'Dev', kind: 'dev', icon: '🍪',
      action: () => console.log(document.cookie),
    },
    {
      label: 'Count DOM nodes',
      desc: 'Print total element count to console',
      tag: 'Dev', kind: 'dev', icon: '🌳',
      action: () => console.log('DOM nodes:', document.querySelectorAll('*').length),
    },
    {
      label: 'Log window size',
      desc: 'Print viewport dimensions to console',
      tag: 'Dev', kind: 'dev', icon: '📐',
      action: () => console.log(`${window.innerWidth} × ${window.innerHeight}`),
    },
    {
      label: 'Inspect performance',
      desc: 'Log navigation timing to console',
      tag: 'Dev', kind: 'dev', icon: '⚡',
      action: () => console.log(performance.getEntriesByType('navigation')[0]),
    },
    {
      label: 'Clear local storage',
      desc: 'Wipe all localStorage for this origin',
      tag: 'Dev', kind: 'dev', icon: '🗑️',
      action: () => { localStorage.clear(); console.log('localStorage cleared') },
    },
    {
      label: 'Clear session storage',
      desc: 'Wipe sessionStorage for this tab',
      tag: 'Dev', kind: 'dev', icon: '🗑️',
      action: () => { sessionStorage.clear(); console.log('sessionStorage cleared') },
    },
    {
      label: 'Log all errors',
      desc: 'Attach global onerror listener to console',
      tag: 'Dev', kind: 'dev', icon: '🚨',
      action: () => { window.onerror = (...a) => console.error('[CMD] Error:', a); console.log('Error listener attached') },
    },
  ]

  const fx: Item[] = [
    {
      label: 'Screen shake',
      desc: 'Shake this page for 1.5 seconds',
      tag: 'FX', kind: 'troll', icon: '💥',
      action: shakeScreen,
    },
    {
      label: 'Invert colours',
      desc: 'Toggle CSS invert on the page',
      tag: 'FX', kind: 'troll', icon: '🔄',
      action: () => {
        const id = 'cmd-invert'
        if (document.getElementById(id)) removeCSS(id)
        else injectCSS(id, 'html{filter:invert(1) hue-rotate(180deg)}')
      },
    },
    {
      label: 'Blur everything',
      desc: 'Apply heavy blur to the entire page',
      tag: 'FX', kind: 'troll', icon: '🌫️',
      action: () => {
        const id = 'cmd-blur'
        if (document.getElementById(id)) removeCSS(id)
        else injectCSS(id, 'html{filter:blur(6px)}')
      },
    },
    {
      label: 'Flip upside down',
      desc: 'Rotate the whole page 180°',
      tag: 'FX', kind: 'troll', icon: '🙃',
      action: () => {
        const id = 'cmd-flip'
        if (document.getElementById(id)) removeCSS(id)
        else injectCSS(id, 'html{transform:rotate(180deg);transform-origin:center center}')
      },
    },
    {
      label: 'Rainbow mode',
      desc: 'Cycle hue-rotate continuously',
      tag: 'FX', kind: 'troll', icon: '🌈',
      action: () => {
        const id = 'cmd-rainbow'
        if (document.getElementById(id)) removeCSS(id)
        else injectCSS(id, '@keyframes cmd-hue{to{filter:hue-rotate(360deg)}}html{animation:cmd-hue 2s linear infinite}')
      },
    },
    {
      label: 'CRT scanlines',
      desc: 'Add retro CRT overlay to the page',
      tag: 'FX', kind: 'troll', icon: '📺',
      action: () => {
        const id = 'cmd-crt'
        if (document.getElementById(id)) removeCSS(id)
        else injectCSS(id, `body::after{content:'';position:fixed;inset:0;z-index:99999;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(0,0,0,0.07) 0px,rgba(0,0,0,0.07) 1px,transparent 1px,transparent 2px)}`)
      },
    },
    {
      label: 'Sepia filter',
      desc: 'Apply warm sepia tone to everything',
      tag: 'FX', kind: 'troll', icon: '🟤',
      action: () => {
        const id = 'cmd-sepia'
        if (document.getElementById(id)) removeCSS(id)
        else injectCSS(id, 'html{filter:sepia(0.85)}')
      },
    },
    {
      label: 'Glitch effect',
      desc: 'Add RGB-shift glitch animation',
      tag: 'FX', kind: 'troll', icon: '⚡',
      action: () => {
        const id = 'cmd-glitch'
        if (document.getElementById(id)) removeCSS(id)
        else injectCSS(id, '@keyframes cmd-glitch{0%,100%{filter:none}33%{filter:drop-shadow(2px 0 red)}66%{filter:drop-shadow(-2px 0 cyan)}}html{animation:cmd-glitch 0.15s infinite}')
      },
    },
    {
      label: 'Zoom 125%',
      desc: 'Scale the page content up',
      tag: 'FX', kind: 'troll', icon: '🔍',
      action: () => {
        const id = 'cmd-zoom'
        if (document.getElementById(id)) removeCSS(id)
        else injectCSS(id, 'html{transform:scale(1.25);transform-origin:top left;width:80%}')
      },
    },
    {
      label: 'Hide cursor',
      desc: 'Make the mouse cursor invisible',
      tag: 'FX', kind: 'troll', icon: '👻',
      action: () => {
        const id = 'cmd-cursor'
        if (document.getElementById(id)) removeCSS(id)
        else injectCSS(id, '*{cursor:none !important}')
      },
    },
    {
      label: 'Clear all FX',
      desc: 'Remove all active visual effects',
      tag: 'FX', kind: 'troll', icon: '✨',
      action: () => {
        for (const id of ['cmd-invert','cmd-blur','cmd-flip','cmd-rainbow','cmd-crt','cmd-sepia','cmd-glitch','cmd-zoom','cmd-cursor','cmd-shake']) {
          removeCSS(id)
        }
        document.body.style.transform = ''
      },
    },
    {
      label: 'Play alarm',
      desc: 'Synthesise an alert alarm sound',
      tag: 'FX', kind: 'troll', icon: '🔔',
      action: () => {
        try {
          const ctx = new AudioContext()
          const osc = ctx.createOscillator()
          const g = ctx.createGain()
          osc.connect(g); g.connect(ctx.destination)
          osc.type = 'square'; osc.frequency.setValueAtTime(880, ctx.currentTime)
          osc.frequency.setValueAtTime(440, ctx.currentTime + 0.2)
          osc.frequency.setValueAtTime(880, ctx.currentTime + 0.4)
          g.gain.setValueAtTime(0.3, ctx.currentTime)
          g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8)
          osc.start(); osc.stop(ctx.currentTime + 0.8)
        } catch {}
      },
    },
    {
      label: 'Play beep',
      desc: 'Single 440 Hz sine tone',
      tag: 'FX', kind: 'troll', icon: '🎵',
      action: () => playTone(440, 0.4, 'sine'),
    },
    {
      label: 'Play laser',
      desc: 'Descending sawtooth laser sound',
      tag: 'FX', kind: 'troll', icon: '⚡',
      action: () => {
        try {
          const ctx = new AudioContext()
          const osc = ctx.createOscillator()
          const g = ctx.createGain()
          osc.connect(g); g.connect(ctx.destination)
          osc.type = 'sawtooth'
          osc.frequency.setValueAtTime(1200, ctx.currentTime)
          osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.4)
          g.gain.setValueAtTime(0.3, ctx.currentTime)
          g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
          osc.start(); osc.stop(ctx.currentTime + 0.4)
        } catch {}
      },
    },
    {
      label: 'Fake BSOD',
      desc: 'Display a fake Windows blue screen',
      tag: 'FX', kind: 'troll', icon: '💻',
      action: () => {
        const id = 'cmd-bsod'
        if (document.getElementById(id)) { document.getElementById(id)?.remove(); return }
        const el = document.createElement('div')
        el.id = id
        el.style.cssText = 'position:fixed;inset:0;z-index:999999;background:#0000aa;color:white;font-family:monospace;padding:3rem;display:flex;flex-direction:column;justify-content:center;cursor:pointer'
        let pct = 0
        el.innerHTML = `<div style="font-size:2.5rem;margin-bottom:1.5rem">:(</div><h1 style="font-size:1.4rem;margin-bottom:2rem">Your PC ran into a problem and needs to restart.</h1><p style="margin-bottom:2rem;opacity:0.7;line-height:1.8">If you'd like to know more, you can search online later for this error: <strong>CRITICAL_PLATFORM_FAILURE</strong></p><div style="margin-bottom:0.5rem;opacity:0.7">Collecting error info (0%)</div><div id="bsod-bar" style="width:200px;height:3px;background:rgba(255,255,255,0.3)"><div id="bsod-fill" style="height:100%;background:white;width:0%;transition:width 0.1s"></div></div><p style="margin-top:2rem;font-size:0.8rem;opacity:0.5">Click to dismiss</p>`
        document.body.appendChild(el)
        el.onclick = () => el.remove()
        const iv = setInterval(() => {
          pct = Math.min(pct + 1, 100)
          const fill = document.getElementById('bsod-fill')
          const bar = el.querySelector('div[style*="Collecting"]') as HTMLDivElement
          if (fill) fill.style.width = `${pct}%`
          if (bar) bar.textContent = `Collecting error info (${pct}%)`
          if (pct >= 100) clearInterval(iv)
        }, 60)
      },
    },
    {
      label: 'Fake Windows update',
      desc: 'Full-screen Windows Update overlay',
      tag: 'FX', kind: 'troll', icon: '🪟',
      action: () => {
        const el = document.createElement('div')
        el.style.cssText = 'position:fixed;inset:0;z-index:999999;background:#0078d4;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer'
        el.innerHTML = `<div style="color:white;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"><div style="font-size:4rem;margin-bottom:1rem">⊞</div><h1 style="font-size:2.5rem;font-weight:300;margin-bottom:1rem">Working on updates</h1><p style="font-size:1.1rem;opacity:0.8;margin-bottom:2rem">94% complete — Don't turn off your PC</p><div style="width:300px;height:4px;background:rgba(255,255,255,0.3);border-radius:2px;margin:0 auto"><div style="width:94%;height:100%;background:white;border-radius:2px"></div></div><p style="margin-top:3rem;font-size:0.8rem;opacity:0.5">Click to dismiss</p></div>`
        document.body.appendChild(el)
        el.onclick = () => el.remove()
      },
    },
  ]

  const utils: Item[] = [
    {
      label: 'Copy Lorem ipsum',
      desc: 'Classic Lorem ipsum placeholder text',
      tag: 'Util', kind: 'action', icon: '📝',
      action: () => copy('Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.'),
    },
    {
      label: 'Random hex colour',
      desc: 'Generate and copy a random hex color',
      tag: 'Util', kind: 'action', icon: '🎨',
      action: () => copy('#' + Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0')),
    },
    {
      label: 'Random number',
      desc: 'Copy a random number 1–1000',
      tag: 'Util', kind: 'action', icon: '🎲',
      action: () => copy(String(Math.floor(Math.random() * 1000) + 1)),
    },
    {
      label: 'Today\'s date (ISO)',
      desc: 'Copy current date as YYYY-MM-DD',
      tag: 'Util', kind: 'action', icon: '📅',
      action: () => copy(new Date().toISOString().split('T')[0]),
    },
    {
      label: 'Empty div snippet',
      desc: 'Copy a basic HTML div template',
      tag: 'Util', kind: 'action', icon: '📋',
      action: () => copy('<div class="">\n  \n</div>'),
    },
    {
      label: 'Arrow function snippet',
      desc: 'Copy a basic JS arrow function',
      tag: 'Util', kind: 'action', icon: '📋',
      action: () => copy('const fn = () => {\n  \n}'),
    },
    {
      label: 'Flexbox CSS snippet',
      desc: 'Copy a flex container CSS block',
      tag: 'Util', kind: 'action', icon: '📋',
      action: () => copy('display: flex;\nalign-items: center;\njustify-content: space-between;\ngap: 1rem;'),
    },
    {
      label: 'Grid CSS snippet',
      desc: 'Copy a CSS grid layout starter',
      tag: 'Util', kind: 'action', icon: '📋',
      action: () => copy('display: grid;\ngrid-template-columns: repeat(auto-fill, minmax(280px, 1fr));\ngap: 1rem;'),
    },
    {
      label: 'CORS headers snippet',
      desc: 'Copy common CORS response headers',
      tag: 'Util', kind: 'action', icon: '📋',
      action: () => copy('Access-Control-Allow-Origin: *\nAccess-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS\nAccess-Control-Allow-Headers: Content-Type, Authorization'),
    },
    {
      label: 'Copy page title',
      desc: 'Copy the current document title',
      tag: 'Util', kind: 'action', icon: '📋',
      action: () => copy(document.title),
    },
  ]

  return [...nav, ...actions, ...devTools, ...fx, ...utils]
}

const ALL_ITEMS = buildItems()

const CATEGORY_ORDER: ItemKind[] = ['nav', 'action', 'dev', 'troll', 'admin']
const CATEGORY_LABELS: Record<ItemKind, string> = {
  nav: 'Navigation',
  action: 'Actions',
  dev: 'Dev Tools',
  troll: 'FX & Troll',
  admin: 'Admin',
  tool: 'Tools',
}

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const [feedback, setFeedback] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  const filtered = useMemo(() => {
    if (!query.trim()) return ALL_ITEMS
    const q = query.toLowerCase()
    return ALL_ITEMS.filter(i =>
      i.label.toLowerCase().includes(q) ||
      i.desc.toLowerCase().includes(q) ||
      i.tag.toLowerCase().includes(q)
    )
  }, [query])

  // Group by kind
  const grouped = useMemo(() => {
    const map = new Map<ItemKind, Item[]>()
    for (const item of filtered) {
      const list = map.get(item.kind) ?? []
      list.push(item)
      map.set(item.kind, list)
    }
    return map
  }, [filtered])

  const flatList = useMemo(() => filtered, [filtered])

  const execute = useCallback(async (item: Item) => {
    setOpen(false)
    setQuery('')
    setCursor(0)
    if (item.href) {
      router.push(item.href)
    } else if (item.action) {
      await item.action()
      setFeedback(`✓ ${item.label}`)
      setTimeout(() => setFeedback(null), 2000)
    }
  }, [router])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(o => { if (!o) { setQuery(''); setCursor(0) } return !o })
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 40) }, [open])
  useEffect(() => { setCursor(0) }, [query])

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-cursor="true"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, flatList.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)) }
    if (e.key === 'Enter' && flatList[cursor]) execute(flatList[cursor])
  }

  const renderItems = (items: Item[], kindOffset: number) =>
    items.map((item, i) => {
      const globalIdx = kindOffset + i
      return (
        <button
          key={`${item.label}-${globalIdx}`}
          data-cursor={globalIdx === cursor}
          onClick={() => execute(item)}
          onMouseEnter={() => setCursor(globalIdx)}
          className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
            globalIdx === cursor ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'
          }`}
        >
          <span className="text-sm w-5 text-center flex-shrink-0 opacity-80">{item.icon}</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-zinc-200 truncate">{item.label}</div>
            <div className="text-xs text-zinc-600 truncate">{item.desc}</div>
          </div>
          {item.shortcut && (
            <div className="hidden sm:flex items-center gap-0.5 flex-shrink-0">
              {item.shortcut.split(' ').map(k => (
                <kbd key={k} className="font-mono text-[9px] text-zinc-700 border border-white/[0.06] rounded px-1 py-0.5">{k}</kbd>
              ))}
            </div>
          )}
          <span className={`flex-shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide ${TAG_COLORS[item.tag] ?? 'text-zinc-500 bg-zinc-800/60'}`}>
            {item.tag}
          </span>
        </button>
      )
    })

  return (
    <>
      {/* Feedback toast */}
      <AnimatePresence>
        {feedback && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className="fixed top-6 left-1/2 -translate-x-1/2 z-[9999] rounded-xl border border-emerald-500/20 bg-zinc-950/95 px-4 py-2 text-xs text-emerald-400 font-mono shadow-xl backdrop-blur-xl"
          >
            {feedback}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[999] flex items-start justify-center pt-[12vh] px-4"
            onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}
          >
            {/* Scrim */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

            {/* Panel */}
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: -8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: -8 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="relative w-full max-w-xl overflow-hidden rounded-2xl"
              style={{
                background: 'rgba(9,9,11,0.94)',
                backdropFilter: 'blur(40px) saturate(1.8)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderTop: '1px solid rgba(255,255,255,0.14)',
                boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.07), 0 50px 100px -30px rgba(0,0,0,0.95)',
              }}
            >
              {/* Search */}
              <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3.5">
                <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="flex-shrink-0 text-zinc-500">
                  <circle cx="11" cy="11" r="8"/><path strokeLinecap="round" d="m21 21-4.35-4.35"/>
                </svg>
                <input
                  ref={inputRef}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder={`Search ${ALL_ITEMS.length}+ commands, tools, pages…`}
                  className="flex-1 bg-transparent text-sm text-zinc-100 placeholder-zinc-600 outline-none"
                />
                <div className="flex items-center gap-2">
                  {query && (
                    <button onClick={() => setQuery('')} className="text-zinc-600 hover:text-zinc-400 transition-colors">
                      <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  )}
                  <kbd className="hidden sm:flex items-center font-mono text-[10px] text-zinc-700 border border-white/[0.06] rounded px-1.5 py-0.5">ESC</kbd>
                </div>
              </div>

              {/* Results */}
              <div ref={listRef} className="max-h-[380px] overflow-y-auto py-1">
                {filtered.length === 0 ? (
                  <div className="px-4 py-10 text-center text-xs text-zinc-600">No results for &ldquo;{query}&rdquo;</div>
                ) : query.trim() ? (
                  // Flat results when searching
                  renderItems(filtered, 0)
                ) : (
                  // Grouped when idle
                  CATEGORY_ORDER.filter(k => grouped.has(k)).map(kind => {
                    const items = grouped.get(kind)!
                    const offset = CATEGORY_ORDER.filter(k2 => CATEGORY_ORDER.indexOf(k2) < CATEGORY_ORDER.indexOf(kind)).reduce((acc, k2) => acc + (grouped.get(k2)?.length ?? 0), 0)
                    return (
                      <div key={kind}>
                        <div className="px-4 py-1.5">
                          <span className="mono text-[9px] tracking-[0.15em] text-zinc-700 uppercase">{CATEGORY_LABELS[kind]}</span>
                        </div>
                        {renderItems(items, offset)}
                      </div>
                    )
                  })
                )}
              </div>

              {/* Footer */}
              <div className="border-t border-white/[0.04] px-4 py-2 flex items-center gap-4">
                <div className="flex items-center gap-1.5 text-[10px] text-zinc-700">
                  <kbd className="font-mono border border-white/[0.06] rounded px-1 py-0.5">↑↓</kbd> navigate
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-zinc-700">
                  <kbd className="font-mono border border-white/[0.06] rounded px-1 py-0.5">↵</kbd> select
                </div>
                <span className="text-[10px] text-zinc-800 ml-auto mono">{filtered.length} / {ALL_ITEMS.length}</span>
                <kbd className="font-mono text-[10px] text-zinc-700 border border-white/[0.06] rounded px-1.5 py-0.5">⌘K</kbd>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
