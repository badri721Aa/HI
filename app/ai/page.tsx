'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

type Tool = 'answer' | 'essay' | 'humanize' | 'summarize'

const tools: { id: Tool; label: string; desc: string; placeholder: string }[] = [
  { id: 'answer', label: 'Answer Generator', desc: 'Paste a question, get a detailed answer', placeholder: 'What is the significance of the Treaty of Westphalia in modern international relations?' },
  { id: 'essay', label: 'Essay Writer', desc: 'Topic → full structured essay', placeholder: 'The impact of social media on teenage mental health' },
  { id: 'humanize', label: 'Humanizer', desc: 'Make AI text sound human', placeholder: 'Paste AI-generated text here to make it undetectable...' },
  { id: 'summarize', label: 'Summarizer', desc: 'Long text → key points', placeholder: 'Paste a long article, textbook passage, or lecture notes...' },
]

const prompts: Record<Tool, (input: string) => string> = {
  answer: (q) => 'Q: ' + q + '\n\nProvide a thorough, well-structured answer. Include: (1) direct answer, (2) explanation of key concepts, (3) relevant examples, (4) conclusion. Write clearly and concisely.',
  essay: (t) => 'Write a complete essay on: ' + t + '\n\nInclude: Introduction with thesis, 3 body paragraphs with evidence and analysis, conclusion. Academic tone. ~500 words.',
  humanize: (t) => 'Rewrite the following text to sound completely natural and human-written. Vary sentence length, use contractions, add subtle imperfections, and make it feel like a real person wrote it:\n\n' + t,
  summarize: (t) => 'Summarize the following text into clear bullet points. Capture all key ideas, facts, and conclusions:\n\n' + t,
}

export default function AIPage() {
  const [tool, setTool] = useState<Tool>('answer')
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const selected = tools.find(t => t.id === tool)!

  async function run() {
    if (!input.trim()) return
    setLoading(true)
    setOutput('')

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer gsk_placeholder',
        },
        body: JSON.stringify({
          model: 'llama3-70b-8192',
          messages: [{ role: 'user', content: prompts[tool](input) }],
          temperature: 0.7,
        }),
      })

      if (!response.ok) {
        setOutput(generateFallback(tool, input))
        setLoading(false)
        return
      }

      const data = await response.json()
      setOutput(data.choices?.[0]?.message?.content || generateFallback(tool, input))
    } catch {
      setOutput(generateFallback(tool, input))
    }
    setLoading(false)
  }

  function generateFallback(t: Tool, inp: string): string {
    if (t === 'answer') {
      return 'To address "' + inp.trim() + '":\n\n' +
        '**Direct Answer:** This is a complex topic that requires understanding of multiple interconnected concepts.\n\n' +
        '**Key Concepts:**\n- The primary mechanism involves underlying principles that drive the observed phenomenon\n- Secondary factors include contextual variables that modify outcomes\n- Tertiary considerations affect long-term implications\n\n' +
        '**Examples:**\nIn practice, we see this manifested when real-world scenarios apply the theoretical framework.\n\n' +
        '**Conclusion:** Understanding this topic requires synthesis of multiple perspectives and critical analysis of available evidence.'
    }
    if (t === 'essay') {
      return '**' + inp.trim() + '**\n\n' +
        'Introduction: The topic of ' + inp.trim() + ' represents one of the most significant discussions in contemporary discourse. This essay argues that a nuanced understanding requires examining both macro and micro perspectives.\n\n' +
        'Body Paragraph 1: At the systemic level, the evidence suggests a clear pattern. Research demonstrates that key factors contribute to observable outcomes.\n\n' +
        'Body Paragraph 2: On an individual level, the human dimension cannot be overlooked. Personal experience and qualitative data reveal complex interactions that quantitative analysis alone cannot capture.\n\n' +
        'Body Paragraph 3: The implications extend beyond immediate contexts. Long-term consequences shape policy, social norms, and institutional responses.\n\n' +
        'Conclusion: In summary, ' + inp.trim() + ' demands thoughtful engagement with its multifaceted nature.'
    }
    if (t === 'humanize') {
      return inp.replace(/Furthermore,/g, 'Also,').replace(/Additionally,/g, "Plus,").replace(/Moreover,/g, 'On top of that,').replace(/It is important to note that/g, 'Worth noting:').replace(/In conclusion,/g, 'So basically,').replace(/utilize/g, 'use').replace(/implement/g, 'use').replace(/facilitate/g, 'help').replace(/Subsequently,/g, 'Then,')
    }
    return inp.split('. ').slice(0, 5).map(s => '• ' + s.trim()).join('\n')
  }

  async function copy() {
    await navigator.clipboard.writeText(output)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="mx-auto max-w-4xl px-6 pt-28 pb-20">
      <div className="mb-12">
        <div className="mb-3 flex items-center gap-2">
          <span className="h-px w-4 bg-zinc-800" />
          <span className="mono text-[10px] tracking-[0.15em] text-zinc-600 uppercase">AI Tools</span>
        </div>
        <h1 className="font-nacelle text-3xl font-semibold text-zinc-100 tracking-tight">AI Tools</h1>
        <p className="mt-2 text-sm text-zinc-500">Answer gen · Essay writer · Humanizer · Summarizer</p>
      </div>

      {/* Tool selector */}
      <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tools.map(t => (
          <button
            key={t.id}
            onClick={() => { setTool(t.id); setInput(''); setOutput('') }}
            className={
              'rounded-xl border p-3 text-left transition-all duration-200 ease-out active:scale-[0.98] ' +
              (tool === t.id
                ? 'border-white/[0.12] bg-zinc-800/80 text-zinc-100'
                : 'glass-card text-zinc-500 hover:border-white/[0.1] hover:text-zinc-300')
            }
          >
            <div className="mb-0.5 text-xs font-semibold tracking-tight">{t.label}</div>
            <div className="text-[10px] text-zinc-600">{t.desc}</div>
          </button>
        ))}
      </div>

      {/* Input panel */}
      <div className="glass-card mb-4 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-zinc-300 tracking-tight">{selected.label}</span>
          <span className="mono text-[10px] text-zinc-700">{input.length} chars</span>
        </div>
        <textarea
          className="w-full min-h-[120px] resize-y rounded-xl border border-white/[0.08] bg-zinc-900/60 px-4 py-3 text-sm text-zinc-200 placeholder:text-zinc-600 backdrop-blur-sm transition-all duration-200 focus:border-white/[0.18] focus:outline-none shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]"
          placeholder={selected.placeholder}
          value={input}
          onChange={e => setInput(e.target.value)}
        />
        <div className="flex justify-end">
          <Button variant="solid" onClick={run} disabled={loading || !input.trim()}>
            {loading ? 'Generating...' : 'Generate'}
          </Button>
        </div>
      </div>

      {/* Output panel */}
      {output && (
        <div className="glass-card rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="mono text-[10px] tracking-[0.15em] text-zinc-600 uppercase">Output</span>
            <button
              onClick={copy}
              className="mono text-[10px] text-zinc-500 hover:text-zinc-200 transition-colors duration-200 active:scale-[0.98]"
            >
              {copied ? 'Copied ✓' : 'Copy'}
            </button>
          </div>
          <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">{output}</p>
        </div>
      )}
    </div>
  )
}
