'use client'

import { useEffect, useState, useCallback } from 'react'

const PRESETS = [
  { id: 'classroom', label: 'Google Classroom', title: 'Google Classroom', url: 'https://classroom.google.com/h', favicon: 'https://www.google.com/images/branding/googleg/1x/googleg_standard_color_128dp.png' },
  { id: 'canvas', label: 'Canvas LMS', title: 'Dashboard - Canvas', url: 'https://canvas.instructure.com/', favicon: 'https://du11hjcvx0uqb.cloudfront.net/dist/images/favicon-e10d657a73.ico' },
  { id: 'wikipedia', label: 'Wikipedia', title: 'Wikipedia', url: 'https://www.wikipedia.org/', favicon: 'https://www.wikipedia.org/static/favicon/wikipedia.ico' },
  { id: 'khan', label: 'Khan Academy', title: 'Khan Academy | Free Online Courses', url: 'https://www.khanacademy.org/', favicon: 'https://www.khanacademy.org/favicon.ico' },
  { id: 'edpuzzle', label: 'Edpuzzle', title: 'Edpuzzle | Make Any Video Your Lesson', url: 'https://edpuzzle.com/', favicon: 'https://edpuzzle.com/favicon.ico' },
]

interface PanicConfig {
  enabled: boolean
  redirectUrl: string
  preset: string
  customUrl: string
}

function loadConfig(): PanicConfig {
  try {
    const s = localStorage.getItem('panic-config')
    if (s) return JSON.parse(s)
  } catch { /* ignore */ }
  return { enabled: true, redirectUrl: 'https://classroom.google.com/h', preset: 'classroom', customUrl: '' }
}

function saveConfig(cfg: PanicConfig) {
  try { localStorage.setItem('panic-config', JSON.stringify(cfg)) } catch { /* ignore */ }
}

export function PanicHandler() {
  const [showSettings, setShowSettings] = useState(false)
  const [config, setConfig] = useState<PanicConfig>(loadConfig)

  const updateConfig = useCallback((patch: Partial<PanicConfig>) => {
    setConfig(prev => {
      const next = { ...prev, ...patch }
      saveConfig(next)
      return next
    })
  }, [])

  const triggerPanic = useCallback(() => {
    // Mute all audio
    document.querySelectorAll<HTMLMediaElement>('audio, video').forEach(el => { el.muted = true })

    const target = config.customUrl.trim() || config.redirectUrl
    window.location.replace(target)
  }, [config])

  useEffect(() => {
    let shiftDown = false
    let tabPressed = false
    let lastShift = 0

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Shift') { shiftDown = true; lastShift = Date.now() }
      if (e.key === 'Tab' && shiftDown && config.enabled) {
        e.preventDefault()
        triggerPanic()
      }
      // Double-escape as alternate panic
      if (e.key === 'Escape') {
        if (tabPressed && config.enabled) {
          e.preventDefault()
          triggerPanic()
        }
        tabPressed = true
        setTimeout(() => { tabPressed = false }, 400)
      }
    }

    function handleKeyUp(e: KeyboardEvent) {
      if (e.key === 'Shift') shiftDown = false
    }

    window.addEventListener('keydown', handleKeyDown, { capture: true })
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true })
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [config, triggerPanic])

  // Expose settings toggle globally
  useEffect(() => {
    // @ts-ignore
    window.__panicSettings = () => setShowSettings(s => !s)
  }, [])

  if (!showSettings) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-md mx-4 rounded-2xl p-6 space-y-5"
        style={{ background: 'rgba(15,15,17,0.98)', border: '1px solid rgba(255,255,255,0.1)' }}>
        <div className="flex items-center justify-between">
          <h2 className="font-nacelle text-lg font-semibold text-zinc-100">Stealth Settings</h2>
          <button onClick={() => setShowSettings(false)} className="text-zinc-600 hover:text-zinc-300">✕</button>
        </div>

        {/* Toggle */}
        <label className="flex items-center gap-3 cursor-pointer">
          <div
            className={`relative w-10 h-5 rounded-full transition-colors ${config.enabled ? 'bg-violet-500' : 'bg-zinc-700'}`}
            onClick={() => updateConfig({ enabled: !config.enabled })}
          >
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${config.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </div>
          <span className="text-sm text-zinc-300">Panic hotkeys enabled</span>
        </label>

        {/* Hotkey info */}
        <div className="rounded-xl px-4 py-3 font-mono text-[10px] text-zinc-600 leading-relaxed"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="mb-1 text-zinc-500">Active hotkeys:</div>
          <div><kbd className="text-violet-400">Shift + Tab</kbd> — instant redirect</div>
          <div><kbd className="text-violet-400">Esc Esc</kbd> — double-tap escape redirect</div>
        </div>

        {/* Preset picker */}
        <div className="space-y-2">
          <div className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">Redirect to</div>
          <div className="grid grid-cols-1 gap-1.5">
            {PRESETS.map(p => (
              <button
                key={p.id}
                onClick={() => updateConfig({ preset: p.id, redirectUrl: p.url })}
                className={`text-left rounded-xl px-4 py-2.5 text-sm transition-all ${
                  config.preset === p.id
                    ? 'text-violet-300 border-violet-500/30 bg-violet-500/10'
                    : 'text-zinc-500 border-white/[0.06] bg-white/[0.02] hover:text-zinc-300 hover:border-white/[0.1]'
                } border`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom URL */}
        <div className="space-y-1.5">
          <div className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">Or custom URL</div>
          <input
            value={config.customUrl}
            onChange={e => updateConfig({ customUrl: e.target.value })}
            placeholder="https://your-school-site.edu"
            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-700 outline-none focus:border-white/[0.15]"
          />
        </div>

        {/* Test */}
        <button
          onClick={triggerPanic}
          className="w-full rounded-xl py-2.5 text-sm font-semibold text-red-400 transition-all hover:bg-red-500/10"
          style={{ border: '1px solid rgba(239,68,68,0.2)' }}
        >
          Test Panic Redirect
        </button>
      </div>
    </div>
  )
}
