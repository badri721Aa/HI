import { NextRequest, NextResponse } from 'next/server'

const GROQ_API_KEY = process.env.GROQ_API_KEY ?? ''
const GROQ_MODEL = 'llama3-70b-8192'

export const runtime = 'edge'

export async function POST(req: NextRequest) {
  const { messages } = await req.json()

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'Invalid messages' }, { status: 400 })
  }

  // Sanitize messages — only allow role/content
  const safe = messages.map((m: { role: string; content: string }) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: String(m.content).slice(0, 8000),
  }))

  if (!GROQ_API_KEY) {
    // Return a streaming fallback when no API key is configured
    const fallbackText = generateFallback(safe[safe.length - 1]?.content ?? '')
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        for (const char of fallbackText) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: char })}\n\n`))
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      },
    })
    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } })
  }

  const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: safe,
      temperature: 0.7,
      stream: true,
    }),
  })

  if (!groqRes.ok || !groqRes.body) {
    const fallbackText = generateFallback(safe[safe.length - 1]?.content ?? '')
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        for (const char of fallbackText) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: char })}\n\n`))
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      },
    })
    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } })
  }

  // Transform Groq SSE stream → our simplified SSE format
  const encoder = new TextEncoder()
  const transformedStream = new ReadableStream({
    async start(controller) {
      const reader = groqRes.body!.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buf += decoder.decode(value, { stream: true })
          const lines = buf.split('\n')
          buf = lines.pop() ?? ''

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed || trimmed === 'data: [DONE]') {
              if (trimmed === 'data: [DONE]') {
                controller.enqueue(encoder.encode('data: [DONE]\n\n'))
              }
              continue
            }
            if (trimmed.startsWith('data: ')) {
              try {
                const json = JSON.parse(trimmed.slice(6))
                const delta = json.choices?.[0]?.delta?.content
                if (delta) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta })}\n\n`))
                }
              } catch { /* skip malformed chunks */ }
            }
          }
        }
      } finally {
        controller.close()
        reader.releaseLock()
      }
    },
  })

  return new Response(transformedStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  })
}

function generateFallback(content: string): string {
  const q = content.replace(/^(Q:|Question:)\s*/i, '').trim()
  return `Here's a response to: "${q.slice(0, 80)}${q.length > 80 ? '...' : ''}"\n\n` +
    `This is a placeholder response — the AI backend isn't configured yet. ` +
    `Set the GROQ_API_KEY environment variable to enable real AI responses.\n\n` +
    `**Key points to explore:**\n` +
    `- Consider the primary mechanisms at work\n` +
    `- Examine the historical and contextual factors\n` +
    `- Evaluate competing perspectives\n` +
    `- Draw evidence-based conclusions`
}
