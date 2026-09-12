import Link from 'next/link'

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
    <div className="min-h-screen pt-14 max-w-4xl mx-auto px-4 py-8">
      <div className="mb-8">
        <div className="mono text-[10px] tracking-widest text-white/20 uppercase mb-1">knowledge base</div>
        <h1 className="text-2xl font-light text-white">Exam Tricks</h1>
        <p className="text-xs text-white/30 mt-1">Tested strategies. Real results.</p>
      </div>

      <div className="space-y-8">
        {tricks.map(cat => (
          <div key={cat.category}>
            <div className="mono text-[10px] tracking-widest text-white/25 uppercase mb-3">{cat.category}</div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {cat.items.map(item => (
                <div key={item.title} className="glass rounded-2xl p-5 border border-white/8 hover:border-white/15 transition-all duration-300 hover:bg-white/6">
                  <div className="text-sm font-medium text-white/85 mb-2">{item.title}</div>
                  <div className="text-xs text-white/45 leading-relaxed">{item.desc}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
