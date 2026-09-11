/** Picks whichever AI provider has a key configured and streams a plain-text
 * reply from it. Checked in this order: Anthropic, then OpenAI, then Gemini —
 * first one with a key wins. Each provider function yields the same thing:
 * a ReadableStream of raw UTF-8 text chunks (no SSE framing), so the route
 * handler and the frontend don't need to know which provider answered. */

interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

export type ProviderName = "anthropic" | "openai" | "gemini"

export function getConfiguredProvider(): ProviderName | null {
  if (process.env.ANTHROPIC_API_KEY) return "anthropic"
  if (process.env.OPENAI_API_KEY) return "openai"
  if (process.env.GEMINI_API_KEY) return "gemini"
  return null
}

/** Reads an upstream SSE body and calls `onText` with each text delta,
 * extracted by `extract` from the parsed JSON of every `data: ` line. */
async function pumpSse(
  body: ReadableStream<Uint8Array>,
  extract: (parsed: unknown) => string | null,
  onText: (text: string) => void
) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const events = buffer.split("\n\n")
    buffer = events.pop() ?? ""

    for (const event of events) {
      const dataLine = event.split("\n").find((l) => l.startsWith("data: "))
      if (!dataLine) continue
      const raw = dataLine.slice(6)
      if (raw === "[DONE]") continue
      try {
        const text = extract(JSON.parse(raw))
        if (text) onText(text)
      } catch {
        // Skip malformed SSE frames rather than failing the whole stream.
      }
    }
  }
}

async function streamAnthropic(systemPrompt: string, messages: ChatMessage[], maxTokens: number) {
  const apiKey = process.env.ANTHROPIC_API_KEY!
  const model = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001"

  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
      stream: true,
    }),
  })

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "")
    throw new Error(`Anthropic request failed (${upstream.status}): ${detail.slice(0, 500)}`)
  }

  return sseBodyToTextStream(upstream.body, (parsed) => {
    const p = parsed as { type?: string; delta?: { type?: string; text?: string } }
    if (p.type === "content_block_delta" && p.delta?.type === "text_delta") {
      return p.delta.text ?? null
    }
    return null
  })
}

async function streamOpenAI(systemPrompt: string, messages: ChatMessage[], maxTokens: number) {
  const apiKey = process.env.OPENAI_API_KEY!
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini"

  const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      stream: true,
    }),
  })

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "")
    throw new Error(`OpenAI request failed (${upstream.status}): ${detail.slice(0, 500)}`)
  }

  return sseBodyToTextStream(upstream.body, (parsed) => {
    const p = parsed as { choices?: { delta?: { content?: string } }[] }
    return p.choices?.[0]?.delta?.content ?? null
  })
}

async function streamGemini(systemPrompt: string, messages: ChatMessage[], maxTokens: number) {
  const apiKey = process.env.GEMINI_API_KEY!
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash"

  const upstream = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: messages.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
        generationConfig: { maxOutputTokens: maxTokens },
      }),
    }
  )

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "")
    throw new Error(`Gemini request failed (${upstream.status}): ${detail.slice(0, 500)}`)
  }

  return sseBodyToTextStream(upstream.body, (parsed) => {
    const p = parsed as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
    return p.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") || null
  })
}

function sseBodyToTextStream(
  body: ReadableStream<Uint8Array>,
  extract: (parsed: unknown) => string | null
) {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        await pumpSse(body, extract, (text) => controller.enqueue(encoder.encode(text)))
      } finally {
        controller.close()
      }
    },
  })
}

/** Streams a reply from whichever provider is configured. Throws if none is. */
export async function streamChatReply(
  provider: ProviderName,
  systemPrompt: string,
  messages: ChatMessage[],
  maxTokens: number
): Promise<ReadableStream<Uint8Array>> {
  if (provider === "anthropic") return streamAnthropic(systemPrompt, messages, maxTokens)
  if (provider === "openai") return streamOpenAI(systemPrompt, messages, maxTokens)
  return streamGemini(systemPrompt, messages, maxTokens)
}
