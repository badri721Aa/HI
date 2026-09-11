import { CHAT_SYSTEM_PROMPT } from "@/lib/chat-context"
import { getConfiguredProvider, streamChatReply } from "@/lib/ai-provider"

export const runtime = "nodejs"

const MAX_HISTORY = 12
const MAX_MESSAGE_CHARS = 4000
const MAX_OUTPUT_TOKENS = 1024

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
  const provider = getConfiguredProvider()
  if (!provider) {
    return Response.json(
      {
        error:
          "The AI assistant isn't configured yet — set one of ANTHROPIC_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY.",
      },
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

  // The upstream APIs require the transcript to open on a user turn —
  // slicing to the last N messages can leave an assistant message first,
  // so drop it.
  while (trimmed.length > 0 && trimmed[0].role !== "user") {
    trimmed = trimmed.slice(1)
  }

  if (trimmed.length === 0) {
    return Response.json({ error: "No valid messages provided." }, { status: 400 })
  }

  try {
    const stream = await streamChatReply(provider, CHAT_SYSTEM_PROMPT, trimmed, MAX_OUTPUT_TOKENS)
    return new Response(stream, {
      headers: { "content-type": "text/plain; charset=utf-8" },
    })
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "AI request failed." },
      { status: 502 }
    )
  }
}
