"use client"

import * as React from "react"
import { Check, Copy } from "lucide-react"

import { cn } from "@/lib/utils"

interface CodeBlockProps {
  code: string
  language?: string
  filename?: string
}

export function CodeBlock({ code, language = "bash", filename }: CodeBlockProps) {
  const [copied, setCopied] = React.useState(false)

  const onCopy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code.trim())
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard API can be unavailable (insecure context, permissions) — fail silently.
    }
  }, [code])

  return (
    <div className="my-5 overflow-hidden rounded-lg border border-border bg-[#060810]">
      <div className="flex items-center justify-between border-b border-border bg-white/[0.03] px-3.5 py-2">
        <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          {filename ?? language}
        </span>
        <button
          type="button"
          onClick={onCopy}
          aria-label={copied ? "Copied to clipboard" : "Copy code to clipboard"}
          className={cn(
            "inline-flex cursor-pointer items-center gap-1.5 rounded px-2 py-1 text-[11px] text-muted-foreground transition-colors duration-150 hover:bg-white/5 hover:text-foreground",
            copied && "text-[#00e5a0]"
          )}
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-4 text-[12.5px] leading-relaxed">
        <code className="font-[family-name:var(--font-mono)] text-[#dde4f0]">
          {code.trim()}
        </code>
      </pre>
    </div>
  )
}
