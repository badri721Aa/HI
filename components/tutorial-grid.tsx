"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowRight, CheckCircle2, Clock } from "lucide-react"

import { Reveal } from "@/components/reveal"
import { LEVEL_LABEL, TUTORIALS, type Level } from "@/lib/tutorials"
import { useProgress } from "@/lib/progress"
import { cn, trackSpot } from "@/lib/utils"

const LEVEL_STYLE: Record<Level, string> = {
  beginner: "bg-[#00e5a0]/10 text-[#00e5a0]",
  intermediate: "bg-[#5b9eff]/10 text-[#5b9eff]",
  advanced: "bg-[#ff5f72]/10 text-[#ff5f72]",
}

const FILTERS: Array<{ label: string; value: Level | "all" }> = [
  { label: "All", value: "all" },
  { label: "Beginner", value: "beginner" },
  { label: "Intermediate", value: "intermediate" },
  { label: "Advanced", value: "advanced" },
]

export function TutorialGrid() {
  const [filter, setFilter] = React.useState<Level | "all">("all")
  const { completed } = useProgress()

  const filtered = React.useMemo(
    () => (filter === "all" ? TUTORIALS : TUTORIALS.filter((t) => t.level === filter)),
    [filter]
  )

  const featured =
    filter === "all"
      ? TUTORIALS.find((t) => t.featured) ?? TUTORIALS[0]
      : undefined
  const rest = featured ? filtered.filter((t) => t.slug !== featured.slug) : filtered

  return (
    <>
      <div className="mt-10 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by level">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              aria-pressed={filter === f.value}
              className={cn(
                "cursor-pointer rounded-full border px-3.5 py-1.5 text-[11px] font-medium tracking-[0.04em] uppercase transition-colors duration-150",
                filter === f.value
                  ? "border-[#00e5a0]/60 bg-[#00e5a0]/10 text-[#00e5a0]"
                  : "border-border text-muted-foreground hover:border-white/25 hover:text-foreground"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        {completed.size > 0 && (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <CheckCircle2 className="size-3.5 text-[#00e5a0]" />
            {completed.size} / {TUTORIALS.length} complete
          </span>
        )}
      </div>

      {featured && (
        <Reveal>
          <Link
            href={`/tutorials/${featured.slug}`}
            onMouseMove={trackSpot}
            className="glass spot-card group mt-8 flex flex-col gap-6 rounded-xl p-8 transition-all duration-200 hover:border-[#00e5a0]/50 hover:shadow-[0_0_0_1px_rgba(0,229,160,0.5),0_8px_40px_rgba(0,229,160,0.08)] sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <div className="mb-4 flex gap-2">
                <span
                  className={cn(
                    "rounded px-2 py-0.5 text-[10px] font-semibold tracking-[0.06em] uppercase",
                    LEVEL_STYLE[featured.level]
                  )}
                >
                  {LEVEL_LABEL[featured.level]}
                </span>
                <span className="rounded bg-white/5 px-2 py-0.5 text-[10px] tracking-[0.06em] text-muted-foreground uppercase">
                  Featured
                </span>
              </div>
              <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-foreground sm:text-3xl">
                {featured.title}
              </h2>
              <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">
                {featured.description}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3 font-[family-name:var(--font-mono)] text-sm text-[#00e5a0]">
              {completed.has(featured.slug) && <CheckCircle2 className="size-4" />}
              {featured.minutes} min
              <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" />
            </div>
          </Link>
        </Reveal>
      )}

      {rest.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">
          No tutorials at this level yet — try another filter.
        </p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rest.map((t, i) => {
            const Icon = t.icon
            return (
              <Reveal key={t.slug} delay={(i % 3) * 80}>
                <Link
                  href={`/tutorials/${t.slug}`}
                  onMouseMove={trackSpot}
                  className="glass spot-card group flex h-full flex-col rounded-lg p-6 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/25 hover:shadow-lg"
                >
                  <div className="mb-4 flex items-center justify-between">
                    <span className="font-[family-name:var(--font-mono)] text-[11px] text-muted-foreground/60">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {completed.has(t.slug) ? (
                      <CheckCircle2 className="size-4 text-[#00e5a0]" />
                    ) : (
                      <Icon className="size-4 text-muted-foreground transition-colors duration-200 group-hover:text-[#00e5a0]" />
                    )}
                  </div>
                  <span
                    className={cn(
                      "mb-3 w-fit rounded px-2 py-0.5 text-[10px] font-semibold tracking-[0.06em] uppercase",
                      LEVEL_STYLE[t.level]
                    )}
                  >
                    {LEVEL_LABEL[t.level]}
                  </span>
                  <h3 className="mb-2 font-[family-name:var(--font-display)] text-xl font-semibold text-foreground">
                    {t.title}
                  </h3>
                  <p className="mb-5 flex-1 text-[13px] leading-relaxed text-muted-foreground">
                    {t.description}
                  </p>
                  <div className="flex items-center justify-between border-t border-border pt-3.5 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="size-3.5" />
                      {t.minutes} min
                    </span>
                    <ArrowRight className="size-4 text-[#00e5a0] transition-transform duration-200 group-hover:translate-x-1" />
                  </div>
                </Link>
              </Reveal>
            )
          })}
        </div>
      )}
    </>
  )
}
