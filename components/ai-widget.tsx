'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

interface Message { role: 'user' | 'assistant'; content: string; ts: number }

const KB: Record<string, string[]> = {
  greet: ['hello', 'hi', 'hey', 'sup', 'yo', 'good morning', 'good evening'],
  bye: ['bye', 'goodbye', 'see you', 'cya', 'later', 'quit', 'exit'],
  thanks: ['thanks', 'thank you', 'thx', 'ty', 'appreciate'],
  who: ['who are you', 'what are you', 'your name', 'are you ai', 'are you a bot', 'are you human'],
  help: ['help', 'what can you do', 'commands', 'features', 'capabilities'],
  cheat: ['how to cheat', 'cheat', 'pass exam', 'answers', 'copy', 'cheat sheet'],
  math: ['math', 'calculate', 'formula', 'equation', 'algebra', 'calculus', 'geometry'],
  study: ['study', 'how to study', 'study tips', 'learn faster', 'memorize'],
  essay: ['essay', 'write essay', 'paragraph', 'thesis', 'introduction'],
  code: ['code', 'programming', 'python', 'javascript', 'html', 'css', 'debug'],
  chat: ['chat', 'messages', 'realtime', 'online users'],
  news: ['news', 'broadcast', 'announcements'],
  admin: ['admin', 'admin panel', 'control', 'moderate'],
}

const RESPONSES: Record<string, string[]> = {
  greet: [
    "Hey — what do you need?",
    "Yo. What's the move?",
    "What's up. Hit me.",
  ],
  bye: [
    "Later.",
    "Catch you.",
    "See ya.",
  ],
  thanks: [
    "Yeah.",
    "No sweat.",
    "Anytime.",
  ],
  who: [
    "I'm the built-in assistant. No external API — all local. I know this platform and I know school stuff. What do you need?",
    "Local AI widget. No cloud, no keys. Just pattern matching and a knowledge base. Ask me something useful.",
  ],
  help: [
    "I can help with:\n- **Study tips** and memorization techniques\n- **Math** formulas and problem-solving approaches\n- **Essay** structure and writing\n- **Code** debugging and explanations\n- **Platform** — chat, news, admin features\n\nWhat do you need?",
  ],
  cheat: [
    "On this platform you've already got the tools — real-time chat, news feed, shared docs. Use them.\n\nFor exams: **spaced repetition** beats cramming. 20 min sessions, 5 min breaks. Your brain consolidates during the gaps.",
    "Smarter move than cheating: actually knowing the material. Want study strategies instead?",
  ],
  math: [
    "Drop the equation or problem and I'll walk through the approach.\n\n**Quick references:**\n- Quadratic: x = (-b ± √(b²-4ac)) / 2a\n- Pythagorean: a² + b² = c²\n- Slope: m = (y₂-y₁)/(x₂-x₁)\n- Circle area: πr²",
    "Post the problem. I'll break down the steps.",
  ],
  study: [
    "**What actually works:**\n1. **Active recall** — test yourself, don't re-read\n2. **Spaced repetition** — review at increasing intervals\n3. **The Feynman method** — explain it like you're teaching a 10-year-old\n4. **Pomodoro** — 25 min focus, 5 min break\n\nWhich subject?",
    "Best bang for time: active recall over passive review. Stop highlighting, start quizzing yourself.",
  ],
  essay: [
    "**Essay structure:**\n- **Intro:** Hook → context → thesis (1 paragraph)\n- **Body:** 3 paragraphs. Each = claim → evidence → analysis\n- **Conclusion:** Restate thesis → synthesize → broader implication\n\nWhat's the topic?",
    "Drop the prompt and I'll help you build the thesis.",
  ],
  code: [
    "Paste the code and tell me what it's supposed to do vs what it actually does. I'll find the issue.",
    "**Common fixes:**\n- Off-by-one: check loop bounds\n- `undefined` errors: check if variable exists before accessing\n- Async bugs: make sure you're awaiting promises\n- Type errors: check what the function actually returns\n\nPaste the snippet.",
  ],
  chat: [
    "The chat page has real-time messaging, presence tracking (see who's online), typing indicators, emoji reactions, and P2P video calling via WebRTC.\n\nTo call someone: they need to be online (green dot). Hit the phone icon next to their name.",
  ],
  news: [
    "News feed shows announcements from admins. If you're admin or owner, you can post, pin, edit, and delete entries from the news page.",
  ],
  admin: [
    "Admin panel is at `/admin`. Admins can: broadcast messages, ban users, view audit logs.\n\nOwners get extra: Role Manager (`/admin/roles`), Troll Engine (`/admin/troll-panel`), Dev Tools (`/admin/devtools`).",
  ],
  default: [
    "Not sure what you're asking. Try rephrasing or ask about: studying, math, essays, code, or platform features.",
    "Can you be more specific? I'm good with school stuff, code, and platform questions.",
    "I didn't catch that. Ask me about study tips, a specific subject, or how something on the platform works.",
  ],
}

function classify(input: string): string {
  const lower = input.toLowerCase()
  for (const [key, patterns] of Object.entries(KB)) {
    if (patterns.some(p => lower.includes(p))) return key
  }
  return 'default'
}

function pick(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)]
}

function renderMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code style="background:#0A0A0C;border:1px solid rgba(255,255,255,0.07)" class="rounded px-1 py-0.5 text-[11px] text-emerald-400 font-mono">$1</code>')
    .replace(/\n/g, '<br/>')
}

const STORAGE_KEY = 'ai-widget-history'

export function AIWidget() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) setMessages(JSON.parse(stored))
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-40)))
    } catch { /* ignore */ }
  }, [messages])

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100)
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [open])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, typing])

  const send = useCallback(() => {
    const text = input.trim()
    if (!text || typing) return
    setInput('')

    const userMsg: Message = { role: 'user', content: text, ts: Date.now() }
    setMessages(prev => [...prev, userMsg])
    setTyping(true)

    const category = classify(text)
    const response = pick(RESPONSES[category] ?? RESPONSES.default)
    const delay = 400 + Math.min(response.length * 8, 1200)

    setTimeout(() => {
      setMessages(prev => [...prev, { role: 'assistant', content: response, ts: Date.now() }])
      setTyping(false)
    }, delay)
  }, [input, typing])

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.1] backdrop-blur-xl shadow-xl shadow-black/40 text-zinc-400 hover:text-zinc-100 transition-all duration-200 active:scale-[0.96]"
        style={{ background: 'rgba(5,5,5,0.92)' }}
        aria-label="Toggle AI assistant"
      >
        {open ? (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
        )}
      </button>

      {/* Drawer */}
      <div
        className={`fixed bottom-22 right-6 z-50 w-80 rounded-2xl border border-white/[0.08] backdrop-blur-2xl shadow-2xl shadow-black/60 flex flex-col transition-all duration-300 origin-bottom-right ${
          open ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-95 pointer-events-none'
        }`}
        style={{ maxHeight: '28rem', background: 'rgba(5,5,5,0.97)', boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.08)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 rounded-full bg-gradient-to-br from-violet-500/80 to-indigo-600/80 flex items-center justify-center">
              <svg className="h-2.5 w-2.5 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
              </svg>
            </div>
            <span className="text-xs font-semibold text-zinc-200">AI Assistant</span>
            <span className="mono text-[9px] text-zinc-700">local</span>
          </div>
          <button
            onClick={() => { setMessages([]); localStorage.removeItem(STORAGE_KEY) }}
            className="mono text-[9px] text-zinc-700 hover:text-zinc-400 transition-colors"
          >
            clear
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
          {messages.length === 0 && !typing && (
            <div className="text-center py-6">
              <p className="text-xs text-zinc-600">Ask me anything — study tips, math,<br/>code help, or platform questions.</p>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                  m.role === 'user'
                    ? 'text-zinc-200 rounded-br-sm'
                    : 'border border-white/[0.05] text-zinc-300 rounded-bl-sm'
                }`}
                style={{ background: m.role === 'user' ? '#121214' : '#050505' }}
                dangerouslySetInnerHTML={{ __html: m.role === 'assistant' ? renderMarkdown(m.content) : m.content.replace(/</g, '&lt;') }}
              />
            </div>
          ))}
          {typing && (
            <div className="flex justify-start">
              <div className="rounded-xl rounded-bl-sm border border-white/[0.05] px-3 py-2.5 flex gap-1 items-center" style={{ background: '#050505' }}>
                <span className="h-1.5 w-1.5 rounded-full bg-zinc-600 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="h-1.5 w-1.5 rounded-full bg-zinc-600 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="h-1.5 w-1.5 rounded-full bg-zinc-600 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-3 pb-3 pt-2 border-t border-white/[0.06]">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send()}
              placeholder="Ask anything..."
              className="flex-1 h-9 rounded-xl border border-white/[0.08] px-3 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-white/[0.18] focus:outline-none transition-all"
              style={{ background: '#0A0A0C', boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.04)' }}
            />
            <button
              onClick={send}
              disabled={!input.trim() || typing}
              className="h-9 px-3 rounded-xl border border-violet-500/25 bg-violet-500/[0.1] text-xs text-violet-400 hover:bg-violet-500/[0.18] transition-all disabled:opacity-40 active:scale-[0.97]"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
