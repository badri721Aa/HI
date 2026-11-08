import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

/* ──────────────────────────────────────────────────────────────────────────
   AI brain — primary: Anthropic Claude (real model).  Fallback: Groq.  Final
   fallback: a static placeholder so the UI never dies.

   Env:
     ANTHROPIC_API_KEY   – required for the real Claude brain
     ANTHROPIC_MODEL     – default 'claude-opus-5-5' (set 'claude-sonnet-5-5'
                           or 'claude-haiku-5-5' to cut cost)
     ANTHROPIC_EFFORT    – 'low' | 'medium' | 'high' | 'xhigh' | 'max' (def 'low')
     ANTHROPIC_MAX_TOKENS– default 4096
     GROQ_API_KEY        – optional fallback brain
   ──────────────────────────────────────────────────────────────────────── */

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? ''
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-opus-5-5'
const ANTHROPIC_EFFORT = process.env.ANTHROPIC_EFFORT ?? 'low'
const _maxTokens = Number(process.env.ANTHROPIC_MAX_TOKENS)
const ANTHROPIC_MAX_TOKENS = Number.isFinite(_maxTokens) && _maxTokens > 0 ? _maxTokens : 4096

const GROQ_API_KEY = process.env.GROQ_API_KEY ?? ''
const GROQ_MODEL = 'llama3-70b-8192'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'X-Accel-Buffering': 'no',
  ...CORS,
}

const HOMEWORK_SYSTEM =
  'You are an expert homework assistant for a student. Produce the complete, ' +
  'correct, final answer that can be submitted as-is. For short questions: give ' +
  'the direct answer first, then a tight explanation. For essays or written ' +
  'responses: write the entire finished piece at the requested length and tone. ' +
  'For math and science: show the key steps and state the final answer clearly. ' +
  'For code: output complete, working code. Match the subject, format, and the ' +
  "grade level implied by the prompt. Write naturally so it reads as the student's " +
  'own work. Output only what should be submitted — no preamble, no meta-commentary, ' +
  'no disclaimers, no "as an AI".'

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const messages = body?.messages
  const mode: string | undefined = body?.mode
  let system: string | undefined = typeof body?.system === 'string' ? body.system : undefined

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'Invalid messages' }, { status: 400, headers: CORS })
  }

  // Sanitize — only role/content, and only user/assistant roles.
  const safe: { role: 'user' | 'assistant'; content: string }[] = messages.map(
    (m: { role: string; content: string }) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content ?? '').slice(0, 12000),
    }),
  )

  // The web UI embeds the system prompt as "[SYSTEM: ...]\n\n<text>" in the
  // first user message. Pull it out into a real system param.
  const first = safe[0]
  if (first && first.role === 'user') {
    const match = first.content.match(/^\[SYSTEM:\s*([\s\S]*?)\]\s*\n+/)
    if (match) {
      if (!system) system = match[1].trim()
      first.content = first.content.slice(match[0].length)
    }
  }

  if (mode === 'homework') {
    system = system ? `${HOMEWORK_SYSTEM}\n\n${system}` : HOMEWORK_SYSTEM
  }

  // The Messages API must start with a user turn.
  while (safe.length && safe[0].role !== 'user') safe.shift()
  if (safe.length === 0) {
    return NextResponse.json({ error: 'No user message' }, { status: 400, headers: CORS })
  }

  // ── Primary: Claude ──────────────────────────────────────────────────────
  if (ANTHROPIC_API_KEY) {
    try {
      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: ANTHROPIC_MODEL,
          max_tokens: ANTHROPIC_MAX_TOKENS,
          ...(system ? { system } : {}),
          output_config: { effort: ANTHROPIC_EFFORT },
          messages: safe,
          stream: true,
        }),
      })

      if (claudeRes.ok && claudeRes.body) {
        return new Response(transformAnthropic(claudeRes.body), { headers: SSE_HEADERS })
      }
      // fall through to Groq / static on non-OK
    } catch {
      /* network error — fall through */
    }
  }

  // ── Fallback: Groq ───────────────────────────────────────────────────────
  if (GROQ_API_KEY) {
    try {
      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: system ? [{ role: 'system', content: system }, ...safe] : safe,
          temperature: 0.7,
          stream: true,
        }),
      })
      if (groqRes.ok && groqRes.body) {
        return new Response(transformOpenAI(groqRes.body), { headers: SSE_HEADERS })
      }
    } catch {
      /* fall through */
    }
  }

  // ── Final fallback: static ───────────────────────────────────────────────
  return new Response(sseFromText(staticFallback(safe[safe.length - 1]?.content ?? '')), {
    headers: SSE_HEADERS,
  })
}

/* ── Anthropic SSE → {delta} SSE ─────────────────────────────────────────── */
function transformAnthropic(src: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  return new ReadableStream({
    async start(controller) {
      const reader = src.getReader()
      let buf = ''
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          const lines = buf.split('\n')
          buf = lines.pop() ?? ''
          for (const line of lines) {
            const t = line.trim()
            if (!t.startsWith('data:')) continue
            const payload = t.slice(5).trim()
            if (!payload || payload === '[DONE]') continue
            try {
              const json = JSON.parse(payload)
              if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
                const text = json.delta.text
                if (text) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: text })}\n\n`))
              } else if (json.type === 'message_stop') {
                controller.enqueue(encoder.encode('data: [DONE]\n\n'))
              } else if (json.type === 'error') {
                const msg = json.error?.message ?? 'Model error'
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: `\n\n_${msg}_` })}\n\n`))
              }
            } catch {
              /* skip malformed */
            }
          }
        }
      } finally {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
        reader.releaseLock()
      }
    },
  })
}

/* ── OpenAI-style SSE (Groq) → {delta} SSE ──────────────────────────────── */
function transformOpenAI(src: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  return new ReadableStream({
    async start(controller) {
      const reader = src.getReader()
      let buf = ''
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          const lines = buf.split('\n')
          buf = lines.pop() ?? ''
          for (const line of lines) {
            const t = line.trim()
            if (!t || t === 'data: [DONE]') {
              if (t === 'data: [DONE]') controller.enqueue(encoder.encode('data: [DONE]\n\n'))
              continue
            }
            if (t.startsWith('data: ')) {
              try {
                const json = JSON.parse(t.slice(6))
                const delta = json.choices?.[0]?.delta?.content
                if (delta) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta })}\n\n`))
              } catch {
                /* skip */
              }
            }
          }
        }
      } finally {
        controller.close()
        reader.releaseLock()
      }
    },
  })
}

/* ── Static text → {delta} SSE ──────────────────────────────────────────── */
function sseFromText(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const ch of text) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: ch })}\n\n`))
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    },
  })
}

function staticFallback(content: string): string {
  const q = content.replace(/^(Q:|Question:)\s*/i, '').trim()
  return (
    `Here's a response to: "${q.slice(0, 80)}${q.length > 80 ? '…' : ''}"\n\n` +
    `The AI backend isn't configured yet. Set **ANTHROPIC_API_KEY** in your ` +
    `environment to enable the real Claude brain.\n\n` +
    `**Key points to explore:**\n` +
    `- Consider the primary mechanisms at work\n` +
    `- Examine the historical and contextual factors\n` +
    `- Evaluate competing perspectives\n` +
    `- Draw evidence-based conclusions`
  )
}
