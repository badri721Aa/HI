'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

type Tool = 'chat' | 'answer' | 'essay' | 'humanize' | 'summarize'
type Role = 'user' | 'assistant'
interface Message { role: Role; content: string }

const tools: { id: Tool; label: string; icon: string; desc: string; placeholder: string; system: string }[] = [
  {
    id: 'chat',
    label: 'Chat',
    icon: '💬',
    desc: 'Multi-turn conversation',
    placeholder: 'Ask anything…',
    system: 'You are a helpful, knowledgeable AI assistant. Give clear, accurate answers.',
  },
  {
    id: 'answer',
    label: 'Answer',
    icon: '🎯',
    desc: 'Detailed question answers',
    placeholder: 'What is the significance of the Treaty of Westphalia?',
    system: 'You are an expert tutor. Answer questions thoroughly with: (1) direct answer, (2) key concepts, (3) examples, (4) conclusion. Be clear and academic.',
  },
  {
    id: 'essay',
    label: 'Essay',
    icon: '✍️',
    desc: 'Full structured essays',
    placeholder: 'The impact of social media on teenage mental health',
    system: 'You are an expert academic writer. Write complete, well-structured essays with introduction (thesis), 3+ body paragraphs with evidence and analysis, and conclusion. ~500 words, academic tone.',
  },
  {
    id: 'humanize',
    label: 'Humanize',
    icon: '🧬',
    desc: 'Make AI text sound human',
    placeholder: 'Paste AI-generated text here to make it undetectable…',
    system: 'You are a writing style expert. Rewrite AI-generated text to sound completely natural and human-written. Vary sentence structure, use contractions naturally, add subtle imperfections, colloquialisms where appropriate. Output only the rewritten text.',
  },
  {
    id: 'summarize',
    label: 'Summarize',
    icon: '📋',
    desc: 'Long text → key points',
    placeholder: 'Paste a long article, textbook passage, or lecture notes…',
    system: 'You are a summarization expert. Condense the provided text into clear bullet points capturing all key ideas, facts, arguments, and conclusions. Use markdown formatting.',
  },
]

function renderMarkdown(text: string): string {
  return text
    // Code blocks
    .replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) =>
      `<pre class="code-block" data-lang="${lang}"><code>${escHtml(code.trim())}</code></pre>`)
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Headers
    .replace(/^### (.+)$/gm, '<h3 class="md-h3">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="md-h2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="md-h1">$1</h1>')
    // Bullet lists
    .replace(/^[•\-\*] (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]+?<\/li>)+/g, m => `<ul class="md-ul">${m}</ul>`)
    // Numbered lists
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    // Line breaks
    .replace(/\n\n/g, '</p><p class="md-p">')
    .replace(/\n/g, '<br/>')
}

function escHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export default function AIPage() {
  const [activeTool, setActiveTool] = useState<Tool>('chat')
  const [histories, setHistories] = useState<Record<Tool, Message[]>>({
    chat: [], answer: [], essay: [], humanize: [], summarize: [],
  })
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [copied, setCopied] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const selected = tools.find(t => t.id === activeTool)!
  const messages = histories[activeTool]

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streaming])

  const send = useCallback(async () => {
    const trimmed = input.trim()
    if (!trimmed || streaming) return

    const userMsg: Message = { role: 'user', content: trimmed }
    const toolDef = tools.find(t => t.id === activeTool)!

    // Build message thread: system instruction is implicit in the API route
    const thread = [
      ...histories[activeTool],
      userMsg,
    ]

    setHistories(h => ({ ...h, [activeTool]: [...h[activeTool], userMsg] }))
    setInput('')
    setStreaming(true)

    // Add empty assistant message for streaming into
    setHistories(h => ({
      ...h,
      [activeTool]: [...h[activeTool], userMsg, { role: 'assistant', content: '' }],
    }))

    abortRef.current = new AbortController()

    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'user', content: `[SYSTEM: ${toolDef.system}]\n\n${thread[0].content}` },
            ...thread.slice(1),
          ],
        }),
        signal: abortRef.current.signal,
      })

      if (!res.body) throw new Error('No response body')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      let assistantText = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''

        for (const line of lines) {
          const trimLine = line.trim()
          if (trimLine === 'data: [DONE]') continue
          if (trimLine.startsWith('data: ')) {
            try {
              const { delta } = JSON.parse(trimLine.slice(6))
              if (delta) {
                assistantText += delta
                setHistories(h => {
                  const msgs = [...h[activeTool]]
                  msgs[msgs.length - 1] = { role: 'assistant', content: assistantText }
                  return { ...h, [activeTool]: msgs }
                })
              }
            } catch { /* skip */ }
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setHistories(h => {
          const msgs = [...h[activeTool]]
          if (msgs[msgs.length - 1]?.role === 'assistant' && !msgs[msgs.length - 1].content) {
            msgs[msgs.length - 1] = { role: 'assistant', content: '_Failed to get response. Please try again._' }
          }
          return { ...h, [activeTool]: msgs }
        })
      }
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }, [input, streaming, activeTool, histories])

  function stopStream() {
    abortRef.current?.abort()
  }

  function clearHistory() {
    setHistories(h => ({ ...h, [activeTool]: [] }))
  }

  async function copyLast() {
    const last = [...messages].reverse().find(m => m.role === 'assistant')
    if (!last) return
    await navigator.clipboard.writeText(last.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const isEmpty = messages.length === 0

  return (
    <div className="flex flex-col min-h-screen" style={{ background: 'rgb(9,9,11)' }}>
      <style>{`
        .code-block {
          background: rgba(0,0,0,0.5);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 10px;
          padding: 12px 16px;
          overflow-x: auto;
          font-family: 'JetBrains Mono', 'Fira Code', monospace;
          font-size: 12px;
          color: #a5f3fc;
          margin: 8px 0;
          position: relative;
        }
        .code-block::before {
          content: attr(data-lang);
          position: absolute;
          top: 8px;
          right: 12px;
          font-size: 9px;
          color: rgba(255,255,255,0.2);
          text-transform: uppercase;
          letter-spacing: 0.1em;
          font-family: monospace;
        }
        .inline-code {
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 4px;
          padding: 1px 5px;
          font-family: monospace;
          font-size: 11px;
          color: #86efac;
        }
        .md-h1 { font-size: 1.25rem; font-weight: 700; color: #f4f4f5; margin: 12px 0 6px; }
        .md-h2 { font-size: 1.1rem; font-weight: 600; color: #e4e4e7; margin: 10px 0 4px; }
        .md-h3 { font-size: 0.95rem; font-weight: 600; color: #d4d4d8; margin: 8px 0 4px; }
        .md-ul { list-style: disc; padding-left: 20px; margin: 4px 0; }
        .md-ul li { margin: 2px 0; }
        .md-p { margin: 6px 0; }
        .bubble-user { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.09); border-radius: 16px 16px 4px 16px; }
        .bubble-ai { background: rgba(99,59,218,0.07); border: 1px solid rgba(99,59,218,0.18); border-radius: 16px 16px 16px 4px; }
        .cursor-blink::after { content: '▋'; animation: blink 0.9s step-end infinite; color: rgba(167,139,250,0.7); font-size: 14px; }
        @keyframes blink { 0%,100% { opacity: 1 } 50% { opacity: 0 } }
      `}</style>

      {/* Header */}
      <div className="sticky top-[64px] z-10 border-b border-white/[0.05]" style={{ background: 'rgba(9,9,11,0.92)', backdropFilter: 'blur(20px)' }}>
        <div className="mx-auto max-w-4xl px-6 py-3 flex items-center justify-between gap-4">
          {/* Tool tabs */}
          <div className="flex items-center gap-1 overflow-x-auto">
            {tools.map(t => (
              <button
                key={t.id}
                onClick={() => { setActiveTool(t.id); setInput('') }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all duration-150 ${
                  activeTool === t.id
                    ? 'bg-white/[0.08] text-zinc-100 border border-white/[0.12]'
                    : 'text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.04]'
                }`}
              >
                <span>{t.icon}</span>
                <span>{t.label}</span>
              </button>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {messages.some(m => m.role === 'assistant') && (
              <button
                onClick={copyLast}
                className="text-[10px] font-mono text-zinc-600 hover:text-zinc-300 transition-colors px-2 py-1"
              >
                {copied ? 'Copied ✓' : 'Copy last'}
              </button>
            )}
            {messages.length > 0 && (
              <button
                onClick={clearHistory}
                className="text-[10px] font-mono text-zinc-700 hover:text-red-400 transition-colors px-2 py-1"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 mx-auto w-full max-w-4xl px-6 py-6">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center min-h-[40vh] text-center gap-4">
            <div className="text-4xl mb-2">{selected.icon}</div>
            <div className="font-nacelle text-xl font-semibold text-zinc-200">{selected.label}</div>
            <div className="text-sm text-zinc-600 max-w-xs">{selected.desc}</div>
            <div className="mt-4 text-[10px] font-mono text-zinc-800 uppercase tracking-widest">
              {activeTool === 'chat' ? 'Multi-turn conversation mode' : 'Single-turn generation mode'}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] px-4 py-3 text-sm leading-relaxed ${
                    msg.role === 'user' ? 'bubble-user text-zinc-200' : 'bubble-ai text-zinc-200'
                  } ${msg.role === 'assistant' && streaming && i === messages.length - 1 && !msg.content ? 'cursor-blink' : ''}`}
                >
                  {msg.role === 'user' ? (
                    <span className="whitespace-pre-wrap">{msg.content}</span>
                  ) : (
                    <div
                      className={streaming && i === messages.length - 1 && msg.content ? 'cursor-blink' : ''}
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                    />
                  )}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input bar */}
      <div className="sticky bottom-0 border-t border-white/[0.05]" style={{ background: 'rgba(9,9,11,0.95)', backdropFilter: 'blur(20px)' }}>
        <div className="mx-auto max-w-4xl px-6 py-4">
          <div
            className="flex items-end gap-3 rounded-2xl px-4 py-3"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => {
                setInput(e.target.value)
                e.target.style.height = 'auto'
                e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px'
              }}
              onKeyDown={handleKey}
              placeholder={selected.placeholder}
              rows={1}
              className="flex-1 bg-transparent text-sm text-zinc-200 placeholder:text-zinc-600 outline-none resize-none leading-relaxed"
              style={{ maxHeight: 200 }}
            />
            {streaming ? (
              <button
                onClick={stopStream}
                className="flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-xl transition-all duration-150 hover:bg-red-500/10"
                style={{ border: '1px solid rgba(239,68,68,0.3)' }}
                title="Stop generation"
              >
                <span className="w-3 h-3 rounded-sm bg-red-400" />
              </button>
            ) : (
              <button
                onClick={send}
                disabled={!input.trim()}
                className="flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-xl transition-all duration-150 active:scale-[0.95] disabled:opacity-30"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
                title="Send (Enter)"
              >
                <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="text-zinc-300">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"/>
                </svg>
              </button>
            )}
          </div>
          <div className="mt-2 flex items-center justify-between px-1">
            <span className="text-[10px] font-mono text-zinc-800">Enter to send · Shift+Enter for newline</span>
            <span className="text-[10px] font-mono text-zinc-800">{input.length > 0 ? `${input.length} chars` : ''}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
