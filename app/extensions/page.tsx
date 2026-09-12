const extensions = [
  {
    name: 'Write It — Auto Typer',
    id: 'auto-typer',
    desc: 'Paste text and it types character-by-character with natural speed, realistic pauses, variable timing, and optional typos that get self-corrected. Works in Google Docs, Slides, Word, and any text field.',
    features: ['Natural pauses & variable timing', 'Typos + self-correction', 'Pause / Resume mid-session', 'Google Docs & Word support', 'Adjustable WPM (20–300)', 'Accuracy control'],
    size: '6 KB',
    badge: 'Hot',
  },
  {
    name: 'AI Autofill',
    id: 'ai-autofill',
    desc: 'Right-click any question on a webpage → auto-fills with an AI-generated answer.',
    features: ['Context-aware answers', 'Works on Google Forms', 'One-click fill', 'Custom API key'],
    size: '28 KB',
    badge: 'Hot',
  },
  {
    name: 'Humanizer',
    id: 'humanizer',
    desc: 'Select any AI-generated text on the page → replace it with a humanized version that bypasses AI detectors.',
    features: ['GPTZero bypass', 'Turnitin bypass', 'Preserves meaning', 'Ctrl+Shift+H hotkey'],
    size: '18 KB',
    badge: 'Stable',
  },
  {
    name: 'Screenshot Blocker',
    id: 'screenshot-blocker',
    desc: 'Blanks the screen when Print Screen or browser screenshot tools are used. Makes your screen black in recordings.',
    features: ['PrintScreen intercept', 'OBS/recording detection', 'Instant toggle', 'Zero disk artifacts'],
    size: '9 KB',
    badge: 'Beta',
  },
  {
    name: 'Stealth Tab',
    id: 'stealth-tab',
    desc: 'Disguises this page as Google Classroom when you hover over the tab. Custom favicon and title per domain.',
    features: ['Fake tab title', 'Fake favicon', 'Domain spoofing', 'Auto-trigger on focus loss'],
    size: '6 KB',
    badge: 'Stable',
  },
  {
    name: 'Answer Finder',
    id: 'answer-finder',
    desc: 'Selects text on any exam page and searches it across multiple answer databases simultaneously.',
    features: ['Quizlet search', 'Chegg lookup', 'Course Hero', 'Side panel results'],
    size: '22 KB',
    badge: 'Hot',
  },
]

export default function ExtensionsPage() {
  return (
    <div className="min-h-screen pt-14 max-w-5xl mx-auto px-4 py-8">
      <div className="mb-8">
        <div className="mono text-[10px] tracking-widest text-white/20 uppercase mb-1">chrome extensions</div>
        <h1 className="text-2xl font-light text-white">Tools</h1>
        <p className="text-xs text-white/30 mt-1">Download → Chrome → Extensions → Developer mode → Load unpacked</p>
      </div>

      {/* Install guide */}
      <div className="glass rounded-2xl p-5 mb-8 border border-white/8">
        <div className="mono text-[10px] tracking-widest text-white/25 uppercase mb-3">install guide</div>
        <ol className="space-y-1.5">
          {[
            'Download the ZIP file',
            'Extract it to a folder (right-click → Extract All)',
            'Open Chrome → chrome://extensions',
            'Enable Developer Mode (top right toggle)',
            'Click "Load unpacked" → select the extracted folder',
            'Extension is now active',
          ].map((step, i) => (
            <li key={i} className="flex gap-3 text-xs text-white/50">
              <span className="mono text-white/20 flex-shrink-0 w-4">{i + 1}.</span>
              {step}
            </li>
          ))}
        </ol>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {extensions.map(ext => (
          <div key={ext.id} className="glass rounded-2xl p-5 border border-white/8 hover:border-white/15 transition-all duration-300 hover:bg-white/6 flex flex-col">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="text-sm font-medium text-white/85">{ext.name}</div>
                <div className="mono text-[9px] text-white/25 mt-0.5">{ext.size}</div>
              </div>
              <div className={'mono text-[9px] px-2 py-0.5 rounded-full border ' +
                (ext.badge === 'Hot' ? 'text-amber-400 border-amber-500/30 bg-amber-500/10' :
                  ext.badge === 'Beta' ? 'text-blue-400 border-blue-500/30 bg-blue-500/10' :
                    'text-emerald-400 border-emerald-500/30 bg-emerald-500/10')}>
                {ext.badge}
              </div>
            </div>

            <p className="text-xs text-white/40 leading-relaxed mb-4">{ext.desc}</p>

            <div className="space-y-1 mb-5">
              {ext.features.map(f => (
                <div key={f} className="flex items-center gap-2 text-xs text-white/35">
                  <span className="w-1 h-1 rounded-full bg-white/20 flex-shrink-0" />
                  {f}
                </div>
              ))}
            </div>

            <div className="mt-auto">
              <a
                href={'/extensions/' + ext.id + '.zip'}
                download
                className="w-full flex items-center justify-center gap-2 h-9 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 transition-all duration-200 text-xs text-white/60 hover:text-white"
              >
                <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
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
