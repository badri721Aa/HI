'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

// ── Theme definitions ────────────────────────────────────────
interface Theme {
  id: string
  name: string
  description: string
  dot: string
  preview: { bg: string; surface: string; border: string; accent: string; text: string; subtext: string }
  css: Record<string, string>
}

const THEMES: Theme[] = [
  {
    id: 'default',
    name: 'Obsidian Dark',
    description: 'Deep zinc surfaces, refined violet accents.',
    dot: '#a78bfa',
    preview: { bg: '#09090b', surface: '#18181b', border: 'rgba(255,255,255,0.06)', accent: '#7c3aed', text: '#f4f4f5', subtext: '#71717a' },
    css: {
      '--bg': '#09090b', '--surface': '#18181b', '--surface-2': '#27272a',
      '--border': 'rgba(255,255,255,0.06)', '--accent': '#7c3aed', '--accent-glow': 'rgba(124,58,237,0.25)',
      '--text': '#f4f4f5', '--text-2': '#a1a1aa', '--text-3': '#71717a',
    },
  },
  {
    id: 'cyberpunk',
    name: 'Neon Cyberpunk',
    description: 'Cyan and magenta on near-black — maximum contrast.',
    dot: '#22d3ee',
    preview: { bg: '#050510', surface: '#0a0a1a', border: 'rgba(34,211,238,0.15)', accent: '#22d3ee', text: '#e0f7ff', subtext: '#67e8f9' },
    css: {
      '--bg': '#050510', '--surface': '#0a0a1a', '--surface-2': '#12123a',
      '--border': 'rgba(34,211,238,0.15)', '--accent': '#22d3ee', '--accent-glow': 'rgba(34,211,238,0.3)',
      '--text': '#e0f7ff', '--text-2': '#67e8f9', '--text-3': '#0891b2',
    },
  },
  {
    id: 'glassmorphism',
    name: 'OLED Glass',
    description: 'True black with heavy blur — optimized for OLED displays.',
    dot: '#c084fc',
    preview: { bg: '#000000', surface: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.1)', accent: '#c084fc', text: '#ffffff', subtext: 'rgba(255,255,255,0.5)' },
    css: {
      '--bg': '#000000', '--surface': 'rgba(255,255,255,0.04)', '--surface-2': 'rgba(255,255,255,0.08)',
      '--border': 'rgba(255,255,255,0.1)', '--accent': '#c084fc', '--accent-glow': 'rgba(192,132,252,0.25)',
      '--text': '#ffffff', '--text-2': 'rgba(255,255,255,0.7)', '--text-3': 'rgba(255,255,255,0.4)',
    },
  },
  {
    id: 'crt',
    name: 'Retro CRT',
    description: 'Green phosphor on dark — terminal nostalgia.',
    dot: '#4ade80',
    preview: { bg: '#030a03', surface: '#071207', border: 'rgba(74,222,128,0.2)', accent: '#4ade80', text: '#86efac', subtext: '#166534' },
    css: {
      '--bg': '#030a03', '--surface': '#071207', '--surface-2': '#0f1f0f',
      '--border': 'rgba(74,222,128,0.2)', '--accent': '#4ade80', '--accent-glow': 'rgba(74,222,128,0.25)',
      '--text': '#86efac', '--text-2': '#4ade80', '--text-3': '#166534',
    },
  },
  {
    id: 'solar',
    name: 'Solar Amber',
    description: 'Warm amber tones on deep brown — easy on the eyes.',
    dot: '#f59e0b',
    preview: { bg: '#0c0900', surface: '#1a1200', border: 'rgba(245,158,11,0.15)', accent: '#f59e0b', text: '#fde68a', subtext: '#92400e' },
    css: {
      '--bg': '#0c0900', '--surface': '#1a1200', '--surface-2': '#261a00',
      '--border': 'rgba(245,158,11,0.15)', '--accent': '#f59e0b', '--accent-glow': 'rgba(245,158,11,0.25)',
      '--text': '#fde68a', '--text-2': '#fbbf24', '--text-3': '#92400e',
    },
  },
  {
    id: 'midnight',
    name: 'Midnight Blue',
    description: 'Indigo and deep blue — calm, focused work environment.',
    dot: '#818cf8',
    preview: { bg: '#020618', surface: '#050d2d', border: 'rgba(129,140,248,0.12)', accent: '#818cf8', text: '#e0e7ff', subtext: '#475569' },
    css: {
      '--bg': '#020618', '--surface': '#050d2d', '--surface-2': '#0d1a4a',
      '--border': 'rgba(129,140,248,0.12)', '--accent': '#818cf8', '--accent-glow': 'rgba(129,140,248,0.25)',
      '--text': '#e0e7ff', '--text-2': '#a5b4fc', '--text-3': '#475569',
    },
  },
]

const STORAGE_KEY = 'hi-platform-theme'

function applyTheme(theme: Theme) {
  const root = document.documentElement
  Object.entries(theme.css).forEach(([k, v]) => root.style.setProperty(k, v))
  try { localStorage.setItem(STORAGE_KEY, theme.id) } catch {}
}

// ── Preview card ──────────────────────────────────────────────
function ThemePreview({ theme }: { theme: Theme }) {
  const p = theme.preview
  return (
    <div className="rounded-xl overflow-hidden border" style={{ background: p.bg, borderColor: p.border }}>
      <div className="p-4 space-y-2.5" style={{ background: p.bg }}>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: p.accent }} />
          <div className="h-2 rounded w-16" style={{ background: p.subtext, opacity: 0.4 }} />
          <div className="ml-auto h-2 rounded w-8" style={{ background: p.subtext, opacity: 0.2 }} />
        </div>
        <div className="h-3 rounded w-3/4" style={{ background: p.text, opacity: 0.8 }} />
        <div className="h-2 rounded w-full" style={{ background: p.text, opacity: 0.2 }} />
        <div className="h-2 rounded w-5/6" style={{ background: p.text, opacity: 0.15 }} />
        <div className="flex gap-2 mt-3">
          <div className="px-3 py-1.5 rounded-lg text-[10px] font-semibold" style={{ background: p.accent, color: '#000' }}>
            Action
          </div>
          <div className="px-3 py-1.5 rounded-lg text-[10px]" style={{ background: p.surface, border: `1px solid ${p.border}`, color: p.text }}>
            Secondary
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Custom builder ─────────────────────────────────────────────
function CustomBuilder({ onApply }: { onApply: (vars: Record<string, string>) => void }) {
  const [bg, setBg] = useState('#09090b')
  const [accent, setAccent] = useState('#7c3aed')
  const [text, setText] = useState('#f4f4f5')

  function apply() {
    onApply({
      '--bg': bg, '--surface': bg + 'cc', '--surface-2': bg + '99',
      '--border': accent + '30', '--accent': accent, '--accent-glow': accent + '40',
      '--text': text, '--text-2': text + 'aa', '--text-3': text + '55',
    })
  }

  return (
    <div className="p-5 rounded-2xl border border-white/[0.06] bg-zinc-950/60 space-y-4" style={{ backdropFilter: 'blur(8px)' }}>
      <p className="font-mono text-[10px] tracking-widest text-zinc-500 uppercase">Custom Theme Builder</p>
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Background', value: bg, set: setBg },
          { label: 'Accent', value: accent, set: setAccent },
          { label: 'Text', value: text, set: setText },
        ].map(c => (
          <div key={c.label} className="space-y-1.5">
            <label className="text-[10px] text-zinc-600 font-mono uppercase tracking-wider">{c.label}</label>
            <div className="flex items-center gap-2">
              <input type="color" value={c.value} onChange={e => c.set(e.target.value)}
                className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent p-0" />
              <span className="text-xs text-zinc-500 font-mono">{c.value}</span>
            </div>
          </div>
        ))}
      </div>
      <button onClick={apply}
        className="w-full py-2.5 rounded-xl text-sm font-semibold bg-white/[0.06] hover:bg-white/[0.1] text-zinc-300 transition-all border border-white/[0.08] active:scale-[0.98]">
        Apply Custom Theme
      </button>
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────
export default function ThemesPage() {
  const [active, setActive] = useState('default')
  const [preview, setPreview] = useState<string | null>(null)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const t = THEMES.find(t => t.id === saved)
        if (t) { setActive(t.id); applyTheme(t) }
      }
    } catch {}
  }, [])

  function select(theme: Theme) {
    setActive(theme.id)
    applyTheme(theme)
  }

  function handleCustom(vars: Record<string, string>) {
    const root = document.documentElement
    Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v))
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <div className="border-b border-white/[0.04]">
        <div className="mx-auto max-w-5xl px-6 pt-16 pb-12">
          <div className="mb-4 flex items-center gap-2">
            <span className="h-px w-5 bg-zinc-700" />
            <span className="font-mono text-[10px] tracking-[0.2em] text-zinc-500 uppercase">Theme Engine</span>
          </div>
          <h1 className="text-4xl font-semibold tracking-tight text-zinc-100 mb-3">UI Themes</h1>
          <p className="text-zinc-400 max-w-md">Live CSS variable switching — select a preset or build your own. Persists across sessions.</p>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 py-12 space-y-10">
        {/* Theme grid */}
        <div>
          <p className="font-mono text-[10px] tracking-widest text-zinc-600 uppercase mb-4">Presets</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {THEMES.map(theme => (
              <motion.button
                key={theme.id}
                onClick={() => select(theme)}
                onMouseEnter={() => setPreview(theme.id)}
                onMouseLeave={() => setPreview(null)}
                whileHover={{ y: -2 }}
                className={`text-left p-5 rounded-2xl border transition-all duration-200 ${
                  active === theme.id
                    ? 'border-violet-500/50 bg-violet-500/[0.06]'
                    : 'border-white/[0.06] bg-zinc-950/60 hover:border-white/[0.12]'
                }`}
                style={{ backdropFilter: 'blur(8px)' }}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full" style={{ background: theme.dot, boxShadow: `0 0 8px ${theme.dot}` }} />
                    <span className="font-semibold text-sm text-zinc-200">{theme.name}</span>
                  </div>
                  {active === theme.id && (
                    <span className="w-4 h-4 rounded-full bg-violet-500 flex items-center justify-center">
                      <svg width="8" height="8" fill="white" viewBox="0 0 12 12">
                        <path d="M1 6l3.5 3.5L11 2" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round"/>
                      </svg>
                    </span>
                  )}
                </div>
                <ThemePreview theme={theme} />
                <p className="mt-3 text-xs text-zinc-500 leading-relaxed">{theme.description}</p>
              </motion.button>
            ))}
          </div>
        </div>

        {/* Custom builder */}
        <CustomBuilder onApply={handleCustom} />

        {/* Export */}
        <div className="p-5 rounded-2xl border border-white/[0.06] bg-zinc-900/40">
          <p className="font-mono text-[10px] tracking-widest text-zinc-600 uppercase mb-3">CSS Export</p>
          <p className="text-xs text-zinc-500 mb-3">Copy these CSS variables to embed the active theme in any project.</p>
          <pre className="text-[11px] text-zinc-400 font-mono leading-relaxed overflow-x-auto p-4 rounded-xl bg-zinc-950/60 border border-white/[0.04]">
{`:root {
${(() => {
  const t = THEMES.find(t => t.id === active) ?? THEMES[0]
  return Object.entries(t.css).map(([k, v]) => `  ${k}: ${v};`).join('\n')
})()}
}`}
          </pre>
          <button
            onClick={() => {
              const t = THEMES.find(t => t.id === active) ?? THEMES[0]
              const css = `:root {\n${Object.entries(t.css).map(([k, v]) => `  ${k}: ${v};`).join('\n')}\n}`
              navigator.clipboard.writeText(css).catch(() => {})
            }}
            className="mt-3 px-4 py-2 rounded-lg text-xs font-medium bg-white/[0.06] hover:bg-white/[0.1] text-zinc-400 transition-all border border-white/[0.06]"
          >
            Copy CSS
          </button>
        </div>
      </div>
    </div>
  )
}
