"use client"

import * as React from "react"
import { Fingerprint, Upload, Copy, Check, Download } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Callout } from "@/components/callout"
import { parseBinarySymbols, type ParsedBinary } from "@/lib/binary-symbols"

export default function SymbolGetterPage() {
  const [result, setResult] = React.useState<ParsedBinary | null>(null)
  const [fileName, setFileName] = React.useState("")
  const [query, setQuery] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [copied, setCopied] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const onFile = async (file: File) => {
    setError(null)
    setResult(null)
    setFileName(file.name)
    try {
      const buf = await file.arrayBuffer()
      const parsed = parseBinarySymbols(buf)
      if (parsed.symbols.length === 0) {
        setError("Parsed the file but found no named exports — is this the right binary?")
      }
      setResult(parsed)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't parse this file.")
    }
  }

  const filtered = React.useMemo(() => {
    if (!result) return []
    const q = query.trim().toLowerCase()
    if (!q) return result.symbols
    return result.symbols.filter((s) => s.name.toLowerCase().includes(q))
  }, [result, query])

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(filtered.map((s) => s.name).join("\n"))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard API can be unavailable — fail silently, download still works.
    }
  }

  const downloadAll = () => {
    const blob = new Blob([filtered.map((s) => s.name).join("\n")], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${fileName.replace(/\.(dll|so)$/i, "") || "symbols"}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="relative mx-auto max-w-3xl px-5 pb-24 pt-32 sm:px-10 sm:pt-40">
      <div className="nebula-glow -z-10" />
      <p className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
        Browser tool
      </p>
      <h1 className="mt-4 font-[family-name:var(--font-display)] text-4xl text-foreground sm:text-5xl">
        Symbol Getter
      </h1>
      <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
        Drop in a <code>GameAssembly.dll</code> or <code>libil2cpp.so</code>{" "}
        and list its exported symbol names — the same ones{" "}
        <code>Module.enumerateExports()</code> would give you from Frida,
        read statically instead. Runs entirely in your browser; the file
        never leaves this tab.
      </p>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const file = e.dataTransfer.files[0]
          if (file) onFile(file)
        }}
        className="glass mt-8 flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border p-10 text-center"
      >
        <Fingerprint className="size-8 text-[#00e5a0]" />
        <p className="text-sm text-foreground">Drop a .dll or .so file here</p>
        <p className="text-xs text-muted-foreground">or</p>
        <Button type="button" variant="glass" size="sm" onClick={() => inputRef.current?.click()}>
          <Upload className="size-3.5" />
          Choose file
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".dll,.so"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onFile(file)
          }}
        />
      </div>

      {error && (
        <div className="mt-6">
          <Callout variant="warn" title="Couldn't read that file">
            {error}
          </Callout>
        </div>
      )}

      {result && result.symbols.length > 0 && (
        <div className="mt-8">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span className="rounded bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.06em] text-foreground">
                {result.format}
              </span>
              {result.arch}
              <span>·</span>
              {result.symbols.length} exports
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="glass" size="sm" onClick={copyAll}>
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                {copied ? "Copied" : "Copy"}
              </Button>
              <Button type="button" variant="glass" size="sm" onClick={downloadAll}>
                <Download className="size-3.5" />
                Download .txt
              </Button>
            </div>
          </div>

          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter symbols…"
            className="mb-3 h-10 w-full rounded-md border border-border bg-transparent px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring"
          />

          <div className="glass max-h-[420px] overflow-y-auto rounded-lg border border-border">
            {filtered.slice(0, 2000).map((s) => (
              <div
                key={`${s.name}-${s.address}`}
                className="flex items-center justify-between gap-4 border-b border-border px-4 py-2 text-[12.5px] last:border-b-0"
              >
                <span className="truncate font-[family-name:var(--font-mono)] text-foreground">
                  {s.name}
                </span>
                <span className="shrink-0 font-[family-name:var(--font-mono)] text-muted-foreground">
                  {s.address}
                </span>
              </div>
            ))}
          </div>
          {filtered.length > 2000 && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Showing the first 2,000 of {filtered.length} — use the filter
              above or download the full list.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
