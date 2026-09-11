"use client"

import * as React from "react"
import { FileCode2, Copy, Check, Upload } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Callout } from "@/components/callout"

const PLACEHOLDER = `// Paste TypeScript here
interface HookOptions {
  moduleName: string;
  exportName: string;
}

function attachHook({ moduleName, exportName }: HookOptions): void {
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

export default function TsToJsPage() {
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
      const ts = await import("typescript")
      const result = ts.transpileModule(code, {
        compilerOptions: {
          target: ts.ScriptTarget.ES2020,
          module: ts.ModuleKind.ESNext,
        },
        reportDiagnostics: true,
      })

      const errors = (result.diagnostics ?? []).filter(
        (d) => d.category === ts.DiagnosticCategory.Error
      )
      if (errors.length > 0) {
        const messages = errors
          .slice(0, 3)
          .map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"))
        setError(messages.join(" · "))
      }

      setOutput(result.outputText)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't transpile that.")
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

  return (
    <div className="relative mx-auto max-w-4xl px-5 pb-24 pt-32 sm:px-10 sm:pt-40">
      <div className="nebula-glow -z-10" />
      <p className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
        Browser tool
      </p>
      <h1 className="mt-4 font-[family-name:var(--font-display)] text-4xl text-foreground sm:text-5xl">
        TypeScript → JavaScript
      </h1>
      <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
        Convert a .ts file to plain JavaScript using the real TypeScript
        compiler, entirely in your browser. Useful since Frida agents run
        as plain JS — write them in TS locally, ship the compiled output.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
              TypeScript
            </span>
            <Button type="button" variant="glass" size="sm" onClick={() => fileRef.current?.click()}>
              <Upload className="size-3.5" />
              Upload .ts
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".ts,.tsx,text/typescript"
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
              JavaScript
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
            placeholder="Compiled output appears here"
            spellCheck={false}
            className="h-80 w-full resize-none rounded-lg border border-border bg-white/[0.02] p-3 font-[family-name:var(--font-mono)] text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground/60"
          />
        </div>
      </div>

      <div className="mt-5">
        <Button type="button" variant="glow" onClick={run} disabled={loading || !input.trim()}>
          <FileCode2 className="size-4" />
          {loading ? "Converting…" : "Convert"}
        </Button>
      </div>

      {error && (
        <div className="mt-6">
          <Callout variant="warn" title="Compiler diagnostics">
            {error}
          </Callout>
        </div>
      )}
    </div>
  )
}
