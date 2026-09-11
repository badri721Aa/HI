"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { BookOpen, Search, Sparkles, Wrench } from "lucide-react"

import { TUTORIALS } from "@/lib/tutorials"
import { TOOLS } from "@/lib/tools"
import { BROWSER_TOOLS } from "@/lib/browser-tools"
import { TERMS } from "@/lib/glossary"
import { cn, slugify } from "@/lib/utils"

interface Result {
  type: "Tutorial" | "Tool" | "Glossary"
  title: string
  subtitle: string
  href: string
}

const ALL_RESULTS: Result[] = [
  ...TUTORIALS.map((t) => ({
    type: "Tutorial" as const,
    title: t.title,
    subtitle: t.description,
    href: `/tutorials/${t.slug}`,
  })),
  ...TOOLS.map((t) => ({
    type: "Tool" as const,
    title: t.name,
    subtitle: t.desc,
    href: t.tutorial ?? "/tools",
  })),
  ...BROWSER_TOOLS.map((t) => ({
    type: "Tool" as const,
    title: t.name,
    subtitle: t.desc,
    href: t.href,
  })),
  ...TERMS.map((t) => ({
    type: "Glossary" as const,
    title: t.term,
    subtitle: t.definition,
    href: `/glossary#${slugify(t.term)}`,
  })),
]

const TYPE_ICON = { Tutorial: BookOpen, Tool: Wrench, Glossary: Sparkles } as const

function search(query: string): Result[] {
  const q = query.trim().toLowerCase()
  if (!q) return ALL_RESULTS.slice(0, 8)
  return ALL_RESULTS.filter(
    (r) => r.title.toLowerCase().includes(q) || r.subtitle.toLowerCase().includes(q)
  ).slice(0, 8)
}

/** Site-wide Cmd/Ctrl+K search over tutorials, tools, and glossary terms —
 * pure client-side substring match, no backend involved. */
export function CommandSearch() {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [activeIndex, setActiveIndex] = React.useState(0)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const router = useRouter()

  const results = React.useMemo(() => search(query), [query])

  const openPalette = React.useCallback(() => {
    setQuery("")
    setActiveIndex(0)
    setOpen(true)
  }, [])

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setOpen((v) => {
          if (v) return false
          setQuery("")
          setActiveIndex(0)
          return true
        })
      } else if (e.key === "Escape") {
        setOpen(false)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  // Focusing the input is a DOM side effect, not a state sync — legitimate
  // use of an effect, unlike the query/activeIndex resets above which now
  // happen at the point open is triggered instead.
  React.useEffect(() => {
    if (!open) return
    const id = window.setTimeout(() => inputRef.current?.focus(), 10)
    return () => window.clearTimeout(id)
  }, [open])

  const onQueryChange = (value: string) => {
    setQuery(value)
    setActiveIndex(0)
  }

  const go = React.useCallback(
    (href: string) => {
      setOpen(false)
      router.push(href)
    },
    [router]
  )

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === "Enter" && results[activeIndex]) {
      e.preventDefault()
      go(results[activeIndex].href)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openPalette}
        aria-label="Search"
        className="pointer-events-auto inline-flex h-8 items-center gap-2 rounded-full border border-border bg-transparent px-3 text-[11px] text-muted-foreground transition-colors duration-150 hover:border-white/25 hover:text-foreground"
      >
        <Search className="size-3.5" />
        <span className="hidden sm:inline">Search</span>
        <kbd className="hidden rounded border border-border px-1 font-[family-name:var(--font-mono)] text-[9px] sm:inline">
          ⌘K
        </kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-start justify-center bg-black/50 px-4 pt-[12vh] backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="glass w-full max-w-lg overflow-hidden rounded-xl border border-border"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search tutorials, tools, glossary…"
                className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
              <kbd className="shrink-0 rounded border border-border px-1.5 py-0.5 font-[family-name:var(--font-mono)] text-[10px] text-muted-foreground">
                esc
              </kbd>
            </div>

            <div className="max-h-[60vh] overflow-y-auto py-2">
              {results.length === 0 ? (
                <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">
                  No results for &ldquo;{query}&rdquo;.
                </p>
              ) : (
                results.map((r, i) => {
                  const Icon = TYPE_ICON[r.type]
                  return (
                    <button
                      key={`${r.type}-${r.title}`}
                      type="button"
                      onClick={() => go(r.href)}
                      onMouseEnter={() => setActiveIndex(i)}
                      className={cn(
                        "flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors duration-100",
                        i === activeIndex ? "bg-white/[0.06]" : ""
                      )}
                    >
                      <Icon className="mt-0.5 size-4 shrink-0 text-[#00e5a0]" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-[13px] font-medium text-foreground">
                            {r.title}
                          </span>
                          <span className="shrink-0 text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
                            {r.type}
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate text-[11.5px] text-muted-foreground">
                          {r.subtitle}
                        </span>
                      </span>
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
