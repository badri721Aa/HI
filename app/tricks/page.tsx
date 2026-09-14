'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

// ── Types ────────────────────────────────────────────────────
interface Technique {
  id: string
  title: string
  tagline: string
  description: string
  steps: string[]
  science: string
  youtubeId: string
  color: string
  dot: string
  glow: string
}

interface Flashcard {
  q: string
  a: string
  id: string
}

// ── Technique data ───────────────────────────────────────────
const TECHNIQUES: Technique[] = [
  {
    id: 'active-recall',
    title: 'Active Recall',
    tagline: 'Test yourself instead of re-reading',
    description: 'The most effective study method proven by cognitive science. Close your notes, then retrieve information from memory. The effort of retrieval strengthens the memory trace far more than passive review.',
    steps: [
      'Read a section once with full attention',
      'Close the material completely',
      'Write or say everything you remember, in your own words',
      'Open your notes, check gaps, add corrections in a different colour',
      'Repeat with next section, then revisit yesterday\'s material',
    ],
    science: 'Roediger & Karpicke (2006): test-based study produced 50% better long-term retention than re-studying.',
    youtubeId: 'ukLnPbIffxE',
    color: 'from-blue-500/20 to-transparent',
    dot: 'bg-blue-500',
    glow: 'rgba(59,130,246,0.15)',
  },
  {
    id: 'spaced-repetition',
    title: 'Spaced Repetition',
    tagline: 'Review at the exact moment you\'re about to forget',
    description: 'Spacing reviews across increasing intervals exploits the "forgetting curve" — each retrieval at the brink of forgetting produces a stronger memory. Anki implements this algorithmically (SM-2).',
    steps: [
      'Create a flashcard the day you first learn something',
      'Review after 1 day — if correct, next review in 3 days',
      'Correct again → 7 days. Again → 16 days. And so on',
      'Failed card resets to 1 day interval',
      'Use Anki or similar to automate the scheduling',
    ],
    science: 'Ebbinghaus (1885) forgetting curve: without review, 70% of new information is lost within 24 hours.',
    youtubeId: 'Z-zNHHpXoMM',
    color: 'from-violet-500/20 to-transparent',
    dot: 'bg-violet-500',
    glow: 'rgba(139,92,246,0.15)',
  },
  {
    id: 'pomodoro',
    title: 'Pomodoro Technique',
    tagline: '25-minute sprints with enforced breaks',
    description: 'Structured focus sessions prevent decision fatigue and maintain consistent output. The break is not optional — it is when consolidation happens. Resist extending sessions when "in flow".',
    steps: [
      'Pick exactly one task before starting the timer',
      'Set timer to 25 minutes. Work on nothing else',
      'When it rings, log one checkmark and take 5-minute break',
      'After 4 checkmarks, take a 20–30 minute break',
      'Start next session with a fresh task',
    ],
    science: 'Cognitive load research shows sustained attention degrades after 20-30 minutes; micro-breaks restore vigilance.',
    youtubeId: 'mNBmG24djoY',
    color: 'from-amber-500/20 to-transparent',
    dot: 'bg-amber-500',
    glow: 'rgba(245,158,11,0.15)',
  },
  {
    id: 'time-management',
    title: 'Time-Management Hacks',
    tagline: 'Schedule smarter, not longer',
    description: 'High-performers don\'t study more hours — they eliminate wasted time within hours. Time-blocking, the 2-minute rule, and MIT (Most Important Task) prioritization compound small efficiency gains.',
    steps: [
      'Each morning, identify your single MIT — the one task that matters most today',
      'Block deep work in your biological peak hours (usually morning)',
      'Any task under 2 minutes: do it immediately, never schedule it',
      'Schedule buffer blocks (15 min after every 90 min) to handle overruns',
      'Review your week on Sunday: what consumed time without producing output?',
    ],
    science: 'Parkinson\'s Law: work expands to fill the time allotted. Fixed deadlines produce better output than open-ended sessions.',
    youtubeId: 'n3kNlFMXslo',
    color: 'from-emerald-500/20 to-transparent',
    dot: 'bg-emerald-500',
    glow: 'rgba(34,197,94,0.15)',
  },
  {
    id: 'answer-elimination',
    title: 'Answer Elimination',
    tagline: 'Win multiple-choice by shrinking the problem',
    description: 'For any multiple-choice question, your goal is not to find the right answer — it is to eliminate the three wrong ones. This reframe reduces anxiety and exposes the correct choice through contrast.',
    steps: [
      'Read the question stem and predict the answer before looking at options',
      'Cross out any option using vocabulary outside the course scope',
      'Eliminate extreme absolutes ("always", "never") unless the course teaches laws',
      'For pairs of opposites (e.g., increases/decreases), the answer is almost always one of them',
      'Between two remaining: re-read the question stem once. Trust your first instinct.',
    ],
    science: 'Test-taking strategy research shows process-of-elimination increases correct answer rate by 15-22% on ambiguous MCQ.',
    youtubeId: '5fg6FtFl2UQ',
    color: 'from-rose-500/20 to-transparent',
    dot: 'bg-rose-500',
    glow: 'rgba(239,68,68,0.15)',
  },
  {
    id: 'feynman',
    title: 'Feynman Technique',
    tagline: 'If you can\'t explain it simply, you don\'t know it',
    description: 'Exposing gaps in understanding is the whole point. Explaining a concept as if teaching a 12-year-old forces you to replace jargon with first principles — and reveals exactly where your knowledge breaks down.',
    steps: [
      'Write the concept title at the top of a blank page',
      'Explain it in plain language as if teaching someone with no background',
      'When you get stuck or use jargon you can\'t explain: that\'s a gap. Mark it.',
      'Go back to source material and fill only the marked gaps',
      'Repeat the explanation using an analogy from everyday life',
    ],
    science: 'Named after physicist Richard Feynman who claimed he could derive any result from first principles by refusing to accept unexplained jargon.',
    youtubeId: 'q-16DPh_VE8',
    color: 'from-sky-500/20 to-transparent',
    dot: 'bg-sky-500',
    glow: 'rgba(14,165,233,0.15)',
  },
]

// ── Flashcard generator ──────────────────────────────────────
function extractFlashcards(text: string): Flashcard[] {
  const cards: Flashcard[] = []
  const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean)

  for (const line of lines) {
    // "X is Y" / "X are Y" / "X means Y"
    const isMatch = line.match(/^(.+?)\s+(?:is|are|means|refers to|defined as)\s+(.+)$/i)
    if (isMatch && isMatch[1].split(' ').length <= 6) {
      cards.push({ id: crypto.randomUUID(), q: `What ${isMatch[2].length < 80 ? 'is' : 'describes'} ${isMatch[1]}?`, a: isMatch[2] })
      continue
    }
    // "X: Y"
    const colonMatch = line.match(/^([^:]{2,40}):\s+(.{10,})$/)
    if (colonMatch) {
      cards.push({ id: crypto.randomUUID(), q: colonMatch[1].trim() + '?', a: colonMatch[2].trim() })
      continue
    }
    // Long sentence as a definition → Q: What does this describe? A: sentence
    if (line.length > 60 && line.length < 300 && /[.!]$/.test(line)) {
      const subject = line.split(' ').slice(0, 4).join(' ')
      cards.push({ id: crypto.randomUUID(), q: `What is described by: "${subject}…"?`, a: line })
    }
  }
  return cards.slice(0, 20)
}

// ── Pomodoro timer ────────────────────────────────────────────
function PomodoroWidget() {
  const [minutes, setMinutes] = useState(25)
  const [seconds, setSeconds] = useState(0)
  const [running, setRunning] = useState(false)
  const [phase, setPhase] = useState<'work' | 'break'>('work')
  const [rounds, setRounds] = useState(0)
  const ivRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const tick = useCallback(() => {
    setSeconds(s => {
      if (s > 0) return s - 1
      setMinutes(m => {
        if (m > 0) return m - 1
        // Time's up
        setRunning(false)
        if (ivRef.current) clearInterval(ivRef.current)
        setPhase(p => {
          const next = p === 'work' ? 'break' : 'work'
          const newRounds = p === 'work' ? rounds + 1 : rounds
          setRounds(newRounds)
          const dur = next === 'work' ? 25 : (newRounds % 4 === 0 ? 20 : 5)
          setMinutes(dur)
          return next
        })
        try {
          const ctx = new AudioContext()
          const osc = ctx.createOscillator()
          const g = ctx.createGain()
          osc.connect(g); g.connect(ctx.destination)
          osc.frequency.value = 880; g.gain.setValueAtTime(0.2, ctx.currentTime)
          g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)
          osc.start(); osc.stop(ctx.currentTime + 0.6)
        } catch {}
        return 0
      })
      return 0
    })
  }, [rounds])

  const toggle = () => {
    if (running) {
      if (ivRef.current) clearInterval(ivRef.current)
      setRunning(false)
    } else {
      ivRef.current = setInterval(tick, 1000)
      setRunning(true)
    }
  }

  const reset = () => {
    if (ivRef.current) clearInterval(ivRef.current)
    setRunning(false)
    setPhase('work')
    setMinutes(25)
    setSeconds(0)
    setRounds(0)
  }

  useEffect(() => {
    if (running && ivRef.current) {
      clearInterval(ivRef.current)
      ivRef.current = setInterval(tick, 1000)
    }
  }, [tick, running])

  useEffect(() => () => { if (ivRef.current) clearInterval(ivRef.current) }, [])

  const total = phase === 'work' ? 25 * 60 : (rounds % 4 === 0 ? 20 * 60 : 5 * 60)
  const elapsed = total - (minutes * 60 + seconds)
  const pct = (elapsed / total) * 100
  const r = 44
  const circ = 2 * Math.PI * r

  return (
    <div className="flex flex-col items-center gap-4 p-6 rounded-2xl border border-white/[0.06] bg-zinc-950/60" style={{ backdropFilter: 'blur(12px)' }}>
      <div className="flex items-center gap-2 mb-1">
        <span className={`w-1.5 h-1.5 rounded-full ${phase === 'work' ? 'bg-amber-500' : 'bg-emerald-500'} animate-pulse`} />
        <span className="font-mono text-[10px] tracking-widest text-zinc-500 uppercase">{phase === 'work' ? 'Focus session' : 'Break'} · Round {rounds + 1}</span>
      </div>
      <svg width={120} height={120} viewBox="0 0 120 120">
        <circle cx={60} cy={60} r={r} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={6} />
        <circle
          cx={60} cy={60} r={r} fill="none"
          stroke={phase === 'work' ? '#f59e0b' : '#22c55e'}
          strokeWidth={6} strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ - (pct / 100) * circ}
          transform="rotate(-90 60 60)"
          style={{ transition: 'stroke-dashoffset 1s linear' }}
        />
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle"
          fill="white" fontSize={22} fontFamily="monospace" fontWeight={600}>
          {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
        </text>
      </svg>
      <div className="flex items-center gap-2">
        <button onClick={toggle}
          className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95 ${running ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700' : 'bg-amber-500 text-black hover:bg-amber-400'}`}>
          {running ? 'Pause' : 'Start'}
        </button>
        <button onClick={reset} className="px-4 py-2 rounded-xl text-sm text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.05] transition-all">
          Reset
        </button>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────
export default function StudyHub() {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [videoId, setVideoId] = useState<string | null>(null)
  const [tab, setTab] = useState<'techniques' | 'flashcards' | 'extractor'>('techniques')
  const [input, setInput] = useState('')
  const [cards, setCards] = useState<Flashcard[]>([])
  const [flipped, setFlipped] = useState<Set<string>>(new Set())
  const [extracted, setExtracted] = useState(false)

  function generateCards() {
    if (!input.trim()) return
    const c = extractFlashcards(input)
    setCards(c)
    setFlipped(new Set())
    setExtracted(true)
  }

  function flipCard(id: string) {
    setFlipped(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  const active = TECHNIQUES.find(t => t.id === activeId)

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* YouTube modal */}
      <AnimatePresence>
        {videoId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.85)' }}
            onClick={() => setVideoId(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 16 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-3xl rounded-2xl overflow-hidden border border-white/[0.08] shadow-2xl"
            >
              <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
                <iframe
                  className="absolute inset-0 w-full h-full"
                  src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
              <div className="bg-zinc-900 px-4 py-3 flex items-center justify-between">
                <span className="text-xs text-zinc-500">Click outside to close</span>
                <button onClick={() => setVideoId(null)} className="text-xs text-zinc-400 hover:text-white transition-colors">✕ Close</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hero */}
      <div className="relative overflow-hidden border-b border-white/[0.04]">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] rounded-full"
            style={{ background: 'radial-gradient(ellipse, rgba(99,59,218,0.06) 0%, transparent 70%)' }} />
        </div>
        <div className="relative mx-auto max-w-5xl px-6 pt-20 pb-14">
          <div className="mb-4 flex items-center gap-2">
            <span className="h-px w-5 bg-zinc-700" />
            <span className="font-mono text-[10px] tracking-[0.2em] text-zinc-500 uppercase">Study Hub · Techniques</span>
          </div>
          <h1 className="mb-4 text-4xl font-semibold tracking-tight text-zinc-100 md:text-5xl" style={{ fontFamily: 'var(--font-nacelle, system-ui)' }}>
            Exam Mastery<br />
            <span className="text-zinc-500">Toolkit</span>
          </h1>
          <p className="max-w-lg text-zinc-400 leading-relaxed">
            Evidence-backed study techniques, embedded video walkthroughs, an AI flashcard generator, and a built-in Pomodoro timer. Everything in one place.
          </p>
        </div>
      </div>

      {/* Tab nav */}
      <div className="sticky top-0 z-30 border-b border-white/[0.04] bg-zinc-950/90" style={{ backdropFilter: 'blur(12px)' }}>
        <div className="mx-auto max-w-5xl px-6">
          <div className="flex">
            {([
              { id: 'techniques', label: 'Techniques' },
              { id: 'flashcards', label: 'AI Flashcards' },
              { id: 'extractor', label: 'Content Extractor' },
            ] as const).map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-4 py-4 text-sm font-medium border-b-2 transition-colors ${tab === t.id ? 'border-violet-500 text-zinc-100' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 py-12">

        {/* ── Techniques tab ── */}
        {tab === 'techniques' && (
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-3">
              {TECHNIQUES.map(t => (
                <div key={t.id}>
                  <button
                    onClick={() => setActiveId(activeId === t.id ? null : t.id)}
                    className="w-full text-left group flex items-start gap-4 p-5 rounded-2xl border border-white/[0.06] bg-zinc-950/60 hover:border-white/[0.12] transition-all duration-200"
                    style={{ backdropFilter: 'blur(8px)' }}
                  >
                    <span className={`mt-1 flex-shrink-0 w-2 h-2 rounded-full ${t.dot}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-semibold text-zinc-200 group-hover:text-zinc-100 transition-colors">{t.title}</h3>
                        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
                          className={`flex-shrink-0 text-zinc-600 transition-transform duration-200 ${activeId === t.id ? 'rotate-180' : ''}`}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                      <p className="text-xs text-zinc-500 mt-0.5">{t.tagline}</p>
                    </div>
                  </button>

                  <AnimatePresence>
                    {activeId === t.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                        className="overflow-hidden"
                      >
                        <div className="mt-1 p-5 rounded-2xl border border-white/[0.06] bg-zinc-900/40 space-y-5">
                          <p className="text-sm text-zinc-400 leading-relaxed">{t.description}</p>

                          <div>
                            <p className="font-mono text-[10px] tracking-widest text-zinc-600 uppercase mb-3">Step-by-step</p>
                            <ol className="space-y-2">
                              {t.steps.map((step, i) => (
                                <li key={i} className="flex items-start gap-3 text-sm text-zinc-400">
                                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center font-mono text-[10px] text-zinc-500 mt-px">{i + 1}</span>
                                  {step}
                                </li>
                              ))}
                            </ol>
                          </div>

                          <div className="rounded-xl bg-zinc-800/40 border border-white/[0.04] p-4">
                            <p className="font-mono text-[10px] tracking-widest text-zinc-600 uppercase mb-1.5">Research basis</p>
                            <p className="text-xs text-zinc-400 italic">{t.science}</p>
                          </div>

                          <button
                            onClick={() => setVideoId(t.youtubeId)}
                            className="flex items-center gap-3 w-full p-4 rounded-xl border border-white/[0.06] bg-zinc-800/40 hover:bg-zinc-800/70 hover:border-white/[0.12] transition-all group/video"
                          >
                            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-red-600/90 flex items-center justify-center">
                              <svg width="12" height="14" fill="white" viewBox="0 0 12 14">
                                <path d="M1 1l10 6-10 6V1z" />
                              </svg>
                            </div>
                            <div className="text-left">
                              <p className="text-sm font-medium text-zinc-300 group-hover/video:text-zinc-100 transition-colors">Watch: {t.title} walkthrough</p>
                              <p className="text-xs text-zinc-600">YouTube · timestamped guide</p>
                            </div>
                            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"
                              className="ml-auto text-zinc-700 group-hover/video:text-zinc-400 transition-colors">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25"/>
                            </svg>
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>

            {/* Sidebar */}
            <div className="space-y-4">
              <PomodoroWidget />

              <div className="p-5 rounded-2xl border border-white/[0.06] bg-zinc-950/60" style={{ backdropFilter: 'blur(8px)' }}>
                <p className="font-mono text-[10px] tracking-widest text-zinc-600 uppercase mb-3">Quick video guides</p>
                <div className="space-y-2">
                  {TECHNIQUES.map(t => (
                    <button key={t.id} onClick={() => setVideoId(t.youtubeId)}
                      className="flex items-center gap-3 w-full text-left px-3 py-2.5 rounded-xl hover:bg-white/[0.04] transition-colors group/q">
                      <span className={`w-1.5 h-1.5 rounded-full ${t.dot} flex-shrink-0`} />
                      <span className="text-xs text-zinc-400 group-hover/q:text-zinc-200 transition-colors truncate">{t.title}</span>
                      <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
                        className="ml-auto text-zinc-700 flex-shrink-0">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25"/>
                      </svg>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── AI Flashcards tab ── */}
        {tab === 'flashcards' && (
          <div className="max-w-3xl space-y-8">
            <div>
              <h2 className="text-xl font-semibold text-zinc-200 mb-1">AI Flashcard Generator</h2>
              <p className="text-sm text-zinc-500">Paste notes or textbook content. The engine extracts concept pairs and builds study cards automatically.</p>
            </div>

            <div className="space-y-3">
              <textarea
                value={input}
                onChange={e => { setInput(e.target.value); setExtracted(false) }}
                rows={7}
                placeholder="Paste your notes, definitions, or study material here…&#10;&#10;Example: Photosynthesis is the process by which plants convert light into energy.&#10;ATP: The primary energy currency of the cell.&#10;Mitochondria are the powerhouse of the cell."
                className="w-full rounded-xl border border-white/[0.08] bg-zinc-900/60 px-4 py-3 text-sm text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/50 resize-none"
                style={{ backdropFilter: 'blur(8px)' }}
              />
              <button
                onClick={generateCards}
                disabled={!input.trim()}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold text-white transition-all active:scale-95"
                style={{ boxShadow: '0 0 20px rgba(139,92,246,0.3)' }}
              >
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/>
                </svg>
                Generate Flashcards
              </button>
            </div>

            {cards.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
              >
                <div className="flex items-center justify-between mb-4">
                  <p className="font-mono text-[10px] tracking-widest text-zinc-500 uppercase">{cards.length} cards generated</p>
                  <button onClick={() => { setCards([]); setInput(''); setExtracted(false) }}
                    className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">Clear all</button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {cards.map(card => (
                    <button
                      key={card.id}
                      onClick={() => flipCard(card.id)}
                      className="text-left p-5 rounded-xl border border-white/[0.06] bg-zinc-900/60 hover:border-white/[0.12] transition-all min-h-[100px] flex flex-col justify-between"
                      style={{ backdropFilter: 'blur(8px)' }}
                    >
                      <p className="font-mono text-[9px] tracking-widest text-zinc-600 uppercase mb-2">
                        {flipped.has(card.id) ? 'Answer' : 'Question'}
                      </p>
                      <AnimatePresence mode="wait">
                        <motion.p
                          key={flipped.has(card.id) ? 'a' : 'q'}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.15 }}
                          className={`text-sm leading-relaxed ${flipped.has(card.id) ? 'text-violet-300' : 'text-zinc-300'}`}
                        >
                          {flipped.has(card.id) ? card.a : card.q}
                        </motion.p>
                      </AnimatePresence>
                      <p className="mt-3 text-[10px] text-zinc-700">Tap to {flipped.has(card.id) ? 'see question' : 'reveal answer'}</p>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {extracted && cards.length === 0 && (
              <div className="text-center py-10 text-zinc-600 text-sm">
                No clear concept pairs found. Try pasting definitions like &quot;X is Y&quot; or &quot;Term: definition&quot; format.
              </div>
            )}
          </div>
        )}

        {/* ── Content Extractor tab ── */}
        {tab === 'extractor' && (
          <div className="max-w-3xl space-y-8">
            <div>
              <h2 className="text-xl font-semibold text-zinc-200 mb-1">Smart Content Extractor</h2>
              <p className="text-sm text-zinc-500">Paste any study text. Get back a structured cheat sheet with key terms, definitions, and a quick summary.</p>
            </div>

            <ExtractorPanel />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Extractor panel ───────────────────────────────────────────
function ExtractorPanel() {
  const [text, setText] = useState('')
  const [result, setResult] = useState<{ summary: string; keyTerms: {term: string; def: string}[]; bullets: string[] } | null>(null)

  function extract() {
    if (!text.trim()) return
    const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean)
    const sentences = text.match(/[^.!?]+[.!?]+/g) ?? lines

    // Key terms: "X is Y" / "X: Y"
    const keyTerms: {term: string; def: string}[] = []
    for (const line of lines) {
      const m = line.match(/^(.{2,40}?)\s+(?:is|are|means|defined as)\s+(.+)$/i)
      if (m && m[1].split(' ').length <= 5) { keyTerms.push({ term: m[1], def: m[2] }); continue }
      const cm = line.match(/^([^:]{2,30}):\s+(.{10,})$/)
      if (cm) keyTerms.push({ term: cm[1].trim(), def: cm[2].trim() })
    }

    // Key bullets: sentences with important-sounding words
    const importantWords = /\b(important|key|critical|major|primary|main|essential|significant|note|remember|always|never)\b/i
    const bullets = sentences
      .filter(s => s.trim().length > 30 && (importantWords.test(s) || keyTerms.some(k => s.toLowerCase().includes(k.term.toLowerCase()))))
      .slice(0, 8)
      .map(s => s.trim())

    // Summary: first 2 sentences
    const summary = sentences.slice(0, 2).join(' ').trim()

    setResult({ summary, keyTerms: keyTerms.slice(0, 12), bullets })
  }

  return (
    <div className="space-y-4">
      <textarea
        value={text}
        onChange={e => { setText(e.target.value); setResult(null) }}
        rows={8}
        placeholder="Paste lecture notes, textbook chapter, or any study content…"
        className="w-full rounded-xl border border-white/[0.08] bg-zinc-900/60 px-4 py-3 text-sm text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-sky-500/50 resize-none"
        style={{ backdropFilter: 'blur(8px)' }}
      />
      <button
        onClick={extract}
        disabled={!text.trim()}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-sm font-semibold text-white transition-all active:scale-95"
        style={{ boxShadow: '0 0 20px rgba(14,165,233,0.25)' }}
      >
        Extract Cheat Sheet
      </button>

      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            {result.summary && (
              <div className="p-4 rounded-xl border border-sky-500/20 bg-sky-500/[0.05]">
                <p className="font-mono text-[9px] tracking-widest text-sky-600 uppercase mb-2">Summary</p>
                <p className="text-sm text-zinc-300 leading-relaxed">{result.summary}</p>
              </div>
            )}

            {result.keyTerms.length > 0 && (
              <div className="p-4 rounded-xl border border-white/[0.06] bg-zinc-900/60">
                <p className="font-mono text-[9px] tracking-widest text-zinc-600 uppercase mb-3">Key Terms ({result.keyTerms.length})</p>
                <dl className="space-y-2">
                  {result.keyTerms.map((k, i) => (
                    <div key={i} className="flex gap-2 text-sm">
                      <dt className="font-medium text-zinc-300 flex-shrink-0 min-w-[100px]">{k.term}</dt>
                      <dd className="text-zinc-500 leading-relaxed">— {k.def}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            {result.bullets.length > 0 && (
              <div className="p-4 rounded-xl border border-white/[0.06] bg-zinc-900/60">
                <p className="font-mono text-[9px] tracking-widest text-zinc-600 uppercase mb-3">Key Points</p>
                <ul className="space-y-2">
                  {result.bullets.map((b, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-zinc-400">
                      <span className="mt-1.5 w-1 h-1 rounded-full bg-sky-500 flex-shrink-0" />
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.keyTerms.length === 0 && result.bullets.length === 0 && (
              <p className="text-sm text-zinc-600 text-center py-4">Structure not detected. Try text with &quot;Term: definition&quot; or &quot;X is Y&quot; patterns.</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
