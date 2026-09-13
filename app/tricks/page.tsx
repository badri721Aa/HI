const tricks = [
  {
    category: 'Multiple Choice',
    items: [
      { title: 'Process of Elimination', desc: 'Remove answers that are clearly wrong first. With 4 options, eliminating 2 gives you 50% odds. Look for absolute words (always, never) — they\'re usually wrong.' },
      { title: 'Longest Answer Rule', desc: 'On most standardized tests, the longest, most detailed answer tends to be correct. Instructors write correct answers carefully.' },
      { title: 'Pattern Reading', desc: 'If you see A,A,B,C,D distributed evenly and you\'re stuck — go with whatever breaks the run. Tests are designed to spread answers.' },
    ],
  },
  {
    category: 'Essay & Written',
    items: [
      { title: 'Keyword Mirroring', desc: 'Use the exact words from the question prompt in your answer. Markers are looking for signal words — reflect them back.' },
      { title: 'Structure First', desc: 'Intro sentence → 3 body points → conclusion. Even half-finished, this structure gets partial marks. Never skip the intro.' },
      { title: 'Cite Without Citing', desc: 'Say "Research suggests..." or "Studies have shown..." without a real reference. It signals critical thinking without needing sources.' },
    ],
  },
  {
    category: 'Math & Science',
    items: [
      { title: 'Unit Checks', desc: 'Write your units at every step. If the final unit doesn\'t match what\'s asked, you made an error. This catches 80% of calculation mistakes.' },
      { title: 'Estimate First', desc: 'Before solving, estimate the answer. If your result is wildly off the estimate, you missed a decimal or sign.' },
      { title: 'Show Work Strategically', desc: 'Even wrong answers get partial credit if working is shown. Write every step, even if guessing.' },
    ],
  },
  {
    category: 'Time Management',
    items: [
      { title: 'Hard Skip Protocol', desc: 'Mark hard questions and skip immediately. Come back after finishing easy ones. You gain ~20% more time on what you know.' },
      { title: 'Two-Pass System', desc: 'Pass 1: answer everything you\'re confident on. Pass 2: everything else. Never spend more than 2 minutes on any question in pass 1.' },
    ],
  },
]

export default function TricksPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 pt-28 pb-20">
      {/* Header */}
      <div className="mb-12">
        <div className="mb-3 flex items-center gap-2">
          <span className="h-px w-4 bg-zinc-800" />
          <span className="mono text-[10px] tracking-[0.15em] text-zinc-600 uppercase">Knowledge Base</span>
        </div>
        <h1 className="font-nacelle text-3xl font-semibold text-zinc-100 tracking-tight">Exam Tricks</h1>
        <p className="mt-2 text-sm text-zinc-500">Tested strategies. Real results.</p>
      </div>

      <div className="space-y-12">
        {tricks.map(cat => (
          <div key={cat.category}>
            {/* Category label */}
            <div className="mb-5 flex items-center gap-3">
              <span className="mono text-[10px] tracking-[0.15em] text-zinc-600 uppercase">{cat.category}</span>
              <div className="h-px flex-1 bg-zinc-900" />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {cat.items.map(item => (
                <div
                  key={item.title}
                  className="group glass-card rounded-2xl p-5 transition-all duration-200 ease-out hover:bg-zinc-800/60 hover:border-white/[0.1]"
                >
                  <h3 className="mb-2.5 text-sm font-semibold text-zinc-200 tracking-tight group-hover:text-zinc-100 transition-colors duration-200">
                    {item.title}
                  </h3>
                  <p className="text-xs text-zinc-500 leading-relaxed group-hover:text-zinc-400 transition-colors duration-200">
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
