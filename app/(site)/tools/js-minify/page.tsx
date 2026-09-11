"use client"

import * as React from "react"
import { Shrink, Copy, Check, Upload } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Callout } from "@/components/callout"

const PLACEHOLDER = `// Paste a Frida agent or any JS file here
function attachHook(moduleName, exportName) {
  const fn = Module.findExportByName(moduleName, exportName);
  if (!fn) {
    console.error("export not found:", exportName);
    return;
  }
  Interceptor.attach(fn, {
    onEnter(args) {
      console.log("called with", args[0]);
    },
  });
}`

export default function JsMinifyPage() {
  const [input, setInput] = React.useState("")
  const [output, setOutput] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [copied, setCopied] = React.useState(false)
  const fileRef = React.useRef<HTMLInputElement>(null)

  const run = async () => {
    const code = input.trim()
    if (!code) return
    setLoading(true)
    setError(null)
    setOutput("")
    try {
      const { minify } = await import("terser")
      const result = await minify(code, {
        compress: true,
        mangle: true,
        format: { comments: false },
      })
      if (!result.code) throw new Error("Minifier returned no output.")
      setOutput(result.code)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't minify that — check it's valid JS.")
    } finally {
      setLoading(false)
    }
  }

  const copyOutput = async () => {
    try {
      await navigator.clipboard.writeText(output)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard API can be unavailable — fail silently.
    }
  }

  const before = new TextEncoder().encode(input).length
  const after = new TextEncoder().encode(output).length
  const reduction = before > 0 && output ? Math.round((1 - after / before) * 100) : null

  return (
    <div className="relative mx-auto max-w-4xl px-5 pb-24 pt-32 sm:px-10 sm:pt-40">
      <div className="nebula-glow -z-10" />
      <p className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
        Browser tool
      </p>
      <h1 className="mt-4 font-[family-name:var(--font-display)] text-4xl text-foreground sm:text-5xl">
        JS Minifier
      </h1>
      <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
        Compact a JavaScript file — a Frida agent, a browser script,
        anything — with Terser. Runs entirely in your browser; nothing is
        uploaded anywhere.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
              Input
            </span>
            <Button type="button" variant="glass" size="sm" onClick={() => fileRef.current?.click()}>
              <Upload className="size-3.5" />
              Upload .js
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".js,.mjs,.cjs,text/javascript"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (file) setInput(await file.text())
              }}
            />
          </div>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={PLACEHOLDER}
            spellCheck={false}
            className="h-80 w-full resize-none rounded-lg border border-border bg-transparent p-3 font-[family-name:var(--font-mono)] text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground/60 focus-visible:border-ring"
          />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
              Output
            </span>
            {output && (
              <Button type="button" variant="glass" size="sm" onClick={copyOutput}>
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            )}
          </div>
          <textarea
            value={output}
            readOnly
            placeholder="Minified output appears here"
            spellCheck={false}
            className="h-80 w-full resize-none rounded-lg border border-border bg-white/[0.02] p-3 font-[family-name:var(--font-mono)] text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground/60"
          />
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <Button type="button" variant="glow" onClick={run} disabled={loading || !input.trim()}>
          <Shrink className="size-4" />
          {loading ? "Minifying…" : "Minify"}
        </Button>
        {reduction !== null && (
          <span className="text-[12px] text-muted-foreground">
            {before.toLocaleString()} → {after.toLocaleString()} bytes
            <span className="ml-1.5 text-[#00e5a0]">(-{reduction}%)</span>
          </span>
        )}
      </div>

      {error && (
        <div className="mt-6">
          <Callout variant="warn" title="Couldn't minify that">
            {error}
          </Callout>
        </div>
      )}
    </div>
  )
}
