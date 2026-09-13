const extensions = [
  {
    name: 'Write It — Auto Typer',
    id: 'auto-typer',
    desc: 'Paste text and it types character-by-character with natural speed, realistic pauses, variable timing, and optional typos that get self-corrected.',
    features: ['Natural pauses & variable timing', 'Typos + self-correction', 'Pause / Resume mid-session', 'Adjustable WPM (20–300)'],
    size: '6 KB',
    badge: 'Hot',
    badgeColor: 'amber',
  },
  {
    name: 'AI Autofill',
    id: 'ai-autofill',
    desc: 'Right-click any question on a webpage → auto-fills with an AI-generated answer. Works on Google Forms.',
    features: ['Context-aware answers', 'Works on Google Forms', 'One-click fill', 'Custom API key'],
    size: '28 KB',
    badge: 'Hot',
    badgeColor: 'amber',
  },
  {
    name: 'Humanizer',
    id: 'humanizer',
    desc: 'Select any AI-generated text → replace it with a humanized version that bypasses AI detectors.',
    features: ['GPTZero bypass', 'Turnitin bypass', 'Preserves meaning', 'Ctrl+Shift+H hotkey'],
    size: '18 KB',
    badge: 'Stable',
    badgeColor: 'emerald',
  },
  {
    name: 'Screenshot Blocker',
    id: 'screenshot-blocker',
    desc: 'Blanks the screen when Print Screen or browser screenshot tools are used. Makes your screen black in recordings.',
    features: ['PrintScreen intercept', 'OBS/recording detection', 'Instant toggle', 'Zero disk artifacts'],
    size: '9 KB',
    badge: 'Beta',
    badgeColor: 'zinc',
  },
  {
    name: 'Stealth Tab',
    id: 'stealth-tab',
    desc: 'Disguises this page as Google Classroom when you hover over the tab. Custom favicon and title per domain.',
    features: ['Fake tab title', 'Fake favicon', 'Domain spoofing', 'Auto-trigger on focus loss'],
    size: '6 KB',
    badge: 'Stable',
    badgeColor: 'emerald',
  },
  {
    name: 'Answer Finder',
    id: 'answer-finder',
    desc: 'Selects text on any exam page and searches it across multiple answer databases simultaneously.',
    features: ['Quizlet search', 'Chegg lookup', 'Course Hero', 'Side panel results'],
    size: '22 KB',
    badge: 'Hot',
    badgeColor: 'amber',
  },
]

const badgeStyles: Record<string, string> = {
  amber: 'text-amber-400 border-amber-500/25 bg-amber-500/[0.08]',
  emerald: 'text-emerald-400 border-emerald-500/25 bg-emerald-500/[0.08]',
  zinc: 'text-zinc-400 border-zinc-700 bg-zinc-800/60',
}

export default function ExtensionsPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 pt-28 pb-20">
      <div className="mb-12">
        <div className="mb-3 flex items-center gap-2">
          <span className="h-px w-4 bg-zinc-800" />
          <span className="mono text-[10px] tracking-[0.15em] text-zinc-600 uppercase">Chrome Extensions</span>
        </div>
        <h1 className="font-nacelle text-3xl font-semibold text-zinc-100 tracking-tight">Tools</h1>
        <p className="mt-2 text-sm text-zinc-500">Download · Unzip · Load into Chrome developer mode</p>
      </div>

      {/* Install guide */}
      <div className="glass-card rounded-2xl p-5 mb-10">
        <div className="mb-4 flex items-center gap-2">
          <span className="mono text-[10px] tracking-widest text-zinc-600 uppercase">Install Guide</span>
          <div className="h-px flex-1 bg-zinc-900" />
        </div>
        <ol className="grid gap-2 sm:grid-cols-2">
          {[
            'Download the ZIP file below',
            'Extract it to a folder (right-click → Extract All)',
            'Open Chrome → chrome://extensions',
            'Enable Developer Mode (top-right toggle)',
            'Click "Load unpacked" → select the extracted folder',
            'Extension is now active in the toolbar',
          ].map((step, i) => (
            <li key={i} className="flex gap-3 text-xs text-zinc-500">
              <span className="mono text-zinc-700 flex-shrink-0 w-4 tabular-nums">{i + 1}.</span>
              {step}
            </li>
          ))}
        </ol>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {extensions.map(ext => (
          <div
            key={ext.id}
            className="group glass-card flex flex-col rounded-2xl p-5 transition-all duration-200 ease-out hover:bg-zinc-800/60 hover:border-white/[0.1]"
          >
            {/* Top row */}
            <div className="mb-4 flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-zinc-200 tracking-tight leading-snug group-hover:text-zinc-100 transition-colors duration-200">
                  {ext.name}
                </h3>
                <span className="mono text-[10px] text-zinc-700">{ext.size}</span>
              </div>
              <span className={`mono flex-shrink-0 text-[10px] border rounded-full px-2 py-0.5 ${badgeStyles[ext.badgeColor]}`}>
                {ext.badge}
              </span>
            </div>

            <p className="mb-4 text-xs text-zinc-500 leading-relaxed group-hover:text-zinc-400 transition-colors duration-200">
              {ext.desc}
            </p>

            <ul className="mb-5 space-y-1.5">
              {ext.features.map(f => (
                <li key={f} className="flex items-center gap-2 text-[11px] text-zinc-600">
                  <span className="h-1 w-1 rounded-full bg-zinc-700 flex-shrink-0" />
                  {f}
                </li>
              ))}
            </ul>

            <div className="mt-auto">
              <a
                href={`/extensions/${ext.id}.zip`}
                download
                className="flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] text-xs text-zinc-500 transition-all duration-200 ease-out hover:bg-white/[0.07] hover:border-white/[0.12] hover:text-zinc-300 active:scale-[0.98]"
              >
                <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"/>
                </svg>
                Download ZIP
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
