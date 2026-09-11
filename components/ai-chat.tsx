"use client"

import * as React from "react"
import { Sparkles, X, Send, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

const SUGGESTIONS = [
  "How do I find a function's export name?",
  "Frida vs BepInEx — when do I use which?",
  "Explain something unrelated to modding",
]

/** Floating "Ask nosignal" assistant — streams from /api/chat, which
 * proxies to whichever of Anthropic/OpenAI/Gemini has a key configured
 * (see lib/ai-provider.ts) server-side so no key ever reaches the client.
 * General-purpose, not limited to site topics — see lib/chat-context.ts
 * for the one modding-specific rule it keeps (offline/solo only, no
 * live-cheat or anti-detection help). */
export function AiChat() {
  const [open, setOpen] = React.useState(false)
  const [messages, setMessages] = React.useState<ChatMessage[]>([])
  const [input, setInput] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const listRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, loading])

  const send = React.useCallback(
    async (text: string) => {
      const content = text.trim()
      if (!content || loading) return

      setError(null)
      const next: ChatMessage[] = [...messages, { role: "user", content }]
      setMessages(next)
      setInput("")
      setLoading(true)

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ messages: next }),
        })

        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => null)
          throw new Error(data?.error || `Request failed (${res.status}).`)
        }

        setMessages((cur) => [...cur, { role: "assistant", content: "" }])

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value, { stream: true })
          if (!chunk) continue
          setMessages((cur) => {
            const copy = [...cur]
            const last = copy[copy.length - 1]
            copy[copy.length - 1] = { role: "assistant", content: last.content + chunk }
            return copy
          })
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.")
      } finally {
        setLoading(false)
      }
    },
    [messages, loading]
  )

  return (
    <>
      <Button
        type="button"
        variant="glow"
        size="icon"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close AI assistant" : "Open AI assistant"}
        className="fixed bottom-5 right-5 z-40 size-12 rounded-full sm:bottom-8 sm:right-8"
      >
        {open ? <X className="size-5" /> : <Sparkles className="size-5" />}
      </Button>

      {open && (
        <div className="glass fixed bottom-[4.75rem] right-5 z-40 flex h-[min(32rem,70vh)] w-[min(23rem,92vw)] flex-col rounded-2xl border border-border sm:right-8">
          <div className="border-b border-border px-4 py-3">
            <p className="font-[family-name:var(--font-display)] text-sm font-semibold text-foreground">
              Ask nosignal
            </p>
            <p className="text-[11px] text-muted-foreground">
              Ask about anything — modding or not
            </p>
          </div>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  A general assistant — ask about Frida, Python, memory
                  hooking, or anything else entirely.
                </p>
                <div className="flex flex-col gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => send(s)}
                      className="rounded-lg border border-border px-3 py-2 text-left text-[12px] text-muted-foreground transition-colors hover:border-white/25 hover:text-foreground"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "max-w-[85%] rounded-lg px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap",
                  m.role === "user"
                    ? "ml-auto bg-[#c9a961]/15 text-foreground"
                    : "bg-white/5 text-foreground"
                )}
              >
                {m.content || (loading && i === messages.length - 1 ? "…" : "")}
              </div>
            ))}

            {error && (
              <div className="rounded-lg border border-[#ff5f72]/40 bg-[#ff5f72]/10 px-3 py-2 text-[12px] text-[#ff5f72]">
                {error}
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              send(input)
            }}
            className="flex items-center gap-2 border-t border-border p-3"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask something…"
              disabled={loading}
              className="h-9 flex-1 rounded-md border border-border bg-transparent px-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring"
            />
            <Button
              type="submit"
              size="icon"
              variant="glow"
              disabled={loading || !input.trim()}
              aria-label="Send"
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </Button>
          </form>
        </div>
      )}
    </>
  )
}
