import { CHAT_SYSTEM_PROMPT } from "@/lib/chat-context"

export const runtime = "nodejs"

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001"
const MAX_HISTORY = 12
const MAX_MESSAGE_CHARS = 4000
const MAX_OUTPUT_TOKENS = 600

// Small in-memory rate limiter — resets whenever the serverless instance
// recycles. Good enough to blunt casual abuse of a public, paid-per-message
// endpoint; swap for Vercel KV/Upstash if this ever needs to hold up under
// real traffic across many instances.
const RATE_LIMIT = 20
const RATE_WINDOW_MS = 10 * 60 * 1000
const hits = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(ip: string) {
  const now = Date.now()
  const entry = hits.get(ip)
  if (!entry || now > entry.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return true
  }
  if (entry.count >= RATE_LIMIT) return false
  entry.count += 1
  return true
}

interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return Response.json(
      { error: "The AI assistant isn't configured yet — missing ANTHROPIC_API_KEY." },
      { status: 503 }
    )
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
  if (!checkRateLimit(ip)) {
    return Response.json(
      { error: "Too many messages — wait a bit before trying again." },
      { status: 429 }
    )
  }

  let body: { messages?: ChatMessage[] }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 })
  }

  const messages = Array.isArray(body.messages) ? body.messages : []

  let trimmed: ChatMessage[] = messages
    .slice(-MAX_HISTORY)
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_CHARS) }))

  // The API requires the transcript to open on a user turn — slicing to the
  // last N messages can leave an assistant message first, so drop it.
  while (trimmed.length > 0 && trimmed[0].role !== "user") {
    trimmed = trimmed.slice(1)
  }

  if (trimmed.length === 0) {
    return Response.json({ error: "No valid messages provided." }, { status: 400 })
  }

  const upstream = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: CHAT_SYSTEM_PROMPT,
      messages: trimmed,
      stream: true,
    }),
  })

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "")
    return Response.json(
      { error: `AI request failed (${upstream.status}).`, detail: detail.slice(0, 500) },
      { status: 502 }
    )
  }

  const encoder = new TextEncoder()
  const decoder = new TextDecoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.body!.getReader()
      let buffer = ""
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })

          const events = buffer.split("\n\n")
          buffer = events.pop() ?? ""

          for (const event of events) {
            const dataLine = event.split("\n").find((l) => l.startsWith("data: "))
            if (!dataLine) continue
            try {
              const parsed = JSON.parse(dataLine.slice(6))
              if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta") {
                controller.enqueue(encoder.encode(parsed.delta.text as string))
              }
            } catch {
              // Skip malformed SSE frames rather than failing the whole stream.
            }
          }
        }
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  })
}
