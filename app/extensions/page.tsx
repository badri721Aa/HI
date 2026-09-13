'use client'

import { useState } from 'react'

const extensions = [
  {
    name: 'Write It',
    subtitle: 'Auto Typer',
    id: 'auto-typer',
    desc: 'Paste text and it types character-by-character with natural speed, realistic pauses, variable timing, and optional typos that self-correct.',
    features: ['Natural pauses & variable timing', 'Typos + self-correction', 'Pause / Resume mid-session', 'Adjustable WPM (20–300)'],
    size: '6 KB',
    badge: 'Hot',
    badgeColor: 'amber',
    icon: '⌨️',
    accent: 'rgba(251,191,36,0.08)',
    accentBorder: 'rgba(251,191,36,0.15)',
  },
  {
    name: 'AI Autofill',
    subtitle: 'Smart Answer Fill',
    id: 'ai-autofill',
    desc: 'Right-click any question on a webpage and auto-fill it with an AI-generated answer. Works on Google Forms and most LMS platforms.',
    features: ['Context-aware answers', 'Google Forms support', 'One-click fill', 'Custom API key'],
    size: '28 KB',
    badge: 'Hot',
    badgeColor: 'amber',
    icon: '🤖',
    accent: 'rgba(139,92,246,0.08)',
    accentBorder: 'rgba(139,92,246,0.15)',
  },
  {
    name: 'Humanizer',
    subtitle: 'AI Detector Bypass',
    id: 'humanizer',
    desc: 'Select any AI-generated text and replace it with a humanized version that bypasses AI detectors while preserving the original meaning.',
    features: ['GPTZero bypass', 'Turnitin bypass', 'Preserves meaning', 'Ctrl+Shift+H hotkey'],
    size: '18 KB',
    badge: 'Stable',
    badgeColor: 'emerald',
    icon: '✍️',
    accent: 'rgba(16,185,129,0.07)',
    accentBorder: 'rgba(16,185,129,0.13)',
  },
  {
    name: 'Screenshot Blocker',
    subtitle: 'Screen Guard',
    id: 'screenshot-blocker',
    desc: 'Blacks out the screen when Print Screen or browser screenshot tools are triggered. Also makes your screen invisible in screen recordings.',
    features: ['PrintScreen intercept', 'OBS & recording blind', 'Instant toggle', 'Zero disk artifacts'],
    size: '9 KB',
    badge: 'Beta',
    badgeColor: 'sky',
    icon: '🛡️',
    accent: 'rgba(14,165,233,0.07)',
    accentBorder: 'rgba(14,165,233,0.13)',
  },
  {
    name: 'Stealth Tab',
    subtitle: 'Tab Disguise',
    id: 'stealth-tab',
    desc: 'Disguises this page as Google Classroom when you hover over the tab — custom fake favicon and title per domain, auto-triggers on focus loss.',
    features: ['Fake tab title', 'Fake favicon', 'Domain spoofing', 'Focus-loss trigger'],
    size: '6 KB',
    badge: 'Stable',
    badgeColor: 'emerald',
    icon: '🎭',
    accent: 'rgba(16,185,129,0.07)',
    accentBorder: 'rgba(16,185,129,0.13)',
  },
  {
    name: 'Answer Finder',
    subtitle: 'Multi-Source Search',
    id: 'answer-finder',
    desc: 'Select any exam question text and instantly search it across Quizlet, Chegg, and Course Hero simultaneously in a side panel.',
    features: ['Quizlet search', 'Chegg lookup', 'Course Hero', 'Side panel results'],
    size: '22 KB',
    badge: 'Hot',
    badgeColor: 'amber',
    icon: '🔍',
    accent: 'rgba(251,191,36,0.08)',
    accentBorder: 'rgba(251,191,36,0.15)',
  },
]

const badgeStyles: Record<string, string> = {
  amber: 'text-amber-400 border-amber-500/20 bg-amber-500/[0.07]',
  emerald: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/[0.07]',
  sky: 'text-sky-400 border-sky-500/20 bg-sky-500/[0.07]',
  zinc: 'text-zinc-400 border-zinc-700 bg-zinc-800/60',
}

const INSTALL_STEPS = [
  { step: '01', text: 'Download the ZIP file' },
  { step: '02', text: 'Extract it to any folder' },
  { step: '03', text: 'Open chrome://extensions' },
  { step: '04', text: 'Enable Developer Mode' },
  { step: '05', text: 'Click "Load unpacked" and select the folder' },
  { step: '06', text: 'Extension appears in your toolbar' },
]

export default function ExtensionsPage() {
  const [downloading, setDownloading] = useState<string | null>(null)

  function handleDownload(id: string) {
    setDownloading(id)
    setTimeout(() => setDownloading(null), 1500)
  }

  const totalSize = extensions.reduce((acc, e) => acc + parseInt(e.size), 0)

  return (
    <div className="mx-auto max-w-5xl px-6 pt-28 pb-24">
      {/* Header */}
      <div className="mb-12 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
        <div>
          <div className="mb-3 flex items-center gap-2">
            <span className="font-mono text-[10px] tracking-[0.18em] text-zinc-600 uppercase">Chrome Extensions</span>
            <span className="h-px w-8 bg-zinc-800" />
            <span className="font-mono text-[10px] text-zinc-700">{extensions.length} tools</span>
          </div>
          <h1 className="font-nacelle text-3xl font-semibold text-zinc-100 tracking-tight">Extension Suite</h1>
          <p className="mt-2 text-sm text-zinc-500 max-w-md">
            Companion Chrome extensions for the Alhekma platform. Each one installs in under a minute.
          </p>
        </div>

        {/* Stats bar */}
        <div
          className="flex items-center gap-5 rounded-2xl px-5 py-3 flex-shrink-0"
          style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.06)',
            boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.04)',
          }}
        >
          <div className="text-center">
            <div className="font-mono text-lg font-semibold text-zinc-200 tabular-nums">{extensions.length}</div>
            <div className="font-mono text-[9px] text-zinc-700 uppercase tracking-wider">Extensions</div>
          </div>
          <div className="w-px h-8 bg-zinc-800" />
          <div className="text-center">
            <div className="font-mono text-lg font-semibold text-zinc-200 tabular-nums">{totalSize}</div>
            <div className="font-mono text-[9px] text-zinc-700 uppercase tracking-wider">Total KB</div>
          </div>
          <div className="w-px h-8 bg-zinc-800" />
          <div className="text-center">
            <div className="font-mono text-lg font-semibold text-emerald-400 tabular-nums">Free</div>
            <div className="font-mono text-[9px] text-zinc-700 uppercase tracking-wider">Always</div>
          </div>
        </div>
      </div>

      {/* Install guide */}
      <div
        className="rounded-2xl p-6 mb-10"
        style={{
          background: 'rgba(9,9,11,0.6)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderTopColor: 'rgba(255,255,255,0.09)',
          boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.05)',
        }}
      >
        <div className="flex items-center gap-3 mb-5">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-zinc-900 text-zinc-500 text-xs">
            📋
          </span>
          <span className="font-mono text-[10px] tracking-widest text-zinc-600 uppercase">Installation Guide</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {INSTALL_STEPS.map(({ step, text }) => (
            <div key={step} className="flex items-center gap-3">
              <span className="font-mono text-[11px] text-zinc-700 flex-shrink-0 w-6 tabular-nums">{step}</span>
              <span className="text-xs text-zinc-500">{text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Extension grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {extensions.map(ext => (
          <div
            key={ext.id}
            className="group relative flex flex-col rounded-2xl p-5 transition-all duration-250"
            style={{
              background: 'rgba(9,9,11,0.5)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderTopColor: 'rgba(255,255,255,0.09)',
              boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.04)',
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLElement
              el.style.background = ext.accent
              el.style.borderColor = ext.accentBorder
              el.style.borderTopColor = ext.accentBorder
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLElement
              el.style.background = 'rgba(9,9,11,0.5)'
              el.style.borderColor = 'rgba(255,255,255,0.06)'
              el.style.borderTopColor = 'rgba(255,255,255,0.09)'
            }}
          >
            {/* Header */}
            <div className="mb-4 flex items-start gap-3">
              <div
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-lg"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                {ext.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-semibold text-zinc-200 tracking-tight leading-none">
                    {ext.name}
                  </h3>
                  <span className={`font-mono text-[9px] border rounded-full px-1.5 py-0.5 flex-shrink-0 ${badgeStyles[ext.badgeColor]}`}>
                    {ext.badge}
                  </span>
                </div>
                <div className="mt-0.5 font-mono text-[10px] text-zinc-600">{ext.subtitle} · {ext.size}</div>
              </div>
            </div>

            {/* Description */}
            <p className="mb-4 text-xs text-zinc-500 leading-relaxed">
              {ext.desc}
            </p>

            {/* Features */}
            <ul className="mb-5 space-y-1.5">
              {ext.features.map(f => (
                <li key={f} className="flex items-center gap-2 text-[11px] text-zinc-600">
                  <span className="h-[3px] w-[3px] rounded-full bg-zinc-700 flex-shrink-0" />
                  {f}
                </li>
              ))}
            </ul>

            {/* Download button */}
            <div className="mt-auto">
              <a
                href={`/extensions/${ext.id}.zip`}
                download
                onClick={() => handleDownload(ext.id)}
                className="flex h-9 w-full items-center justify-center gap-2 rounded-xl text-xs font-medium transition-all duration-200 active:scale-[0.97]"
                style={{
                  background: downloading === ext.id ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: downloading === ext.id ? 'rgb(161,161,170)' : 'rgb(113,113,122)',
                  boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.03)',
                }}
              >
                {downloading === ext.id ? (
                  <>
                    <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="animate-bounce">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"/>
                    </svg>
                    Downloading…
                  </>
                ) : (
                  <>
                    <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"/>
                    </svg>
                    Download ZIP
                  </>
                )}
              </a>
            </div>
          </div>
        ))}
      </div>

      {/* Bottom note */}
      <div className="mt-10 flex items-center gap-3 rounded-xl px-4 py-3 text-xs text-zinc-600"
        style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.04)' }}
      >
        <span className="text-zinc-700">🔒</span>
        Extensions are unsigned. Chrome may warn on load — this is expected. Click <span className="text-zinc-400 font-mono text-[10px]">"Keep anyway"</span> to proceed.
      </div>
    </div>
  )
}
