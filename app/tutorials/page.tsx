import Link from "next/link"
import type { Metadata } from "next"
import { ArrowRight, Clock } from "lucide-react"

import { LEVEL_LABEL, TUTORIALS } from "@/lib/tutorials"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: "Tutorials",
  description:
    "Frida internals, Python tooling, and reverse-engineering fundamentals — the full tutorial library.",
}

const LEVEL_STYLE = {
  beginner: "bg-[#00e5a0]/10 text-[#00e5a0]",
  intermediate: "bg-[#5b9eff]/10 text-[#5b9eff]",
  advanced: "bg-[#ff5f72]/10 text-[#ff5f72]",
} as const

export default function TutorialsPage() {
  const featured = TUTORIALS.find((t) => t.featured) ?? TUTORIALS[0]
  const rest = TUTORIALS.filter((t) => t.slug !== featured.slug)

  return (
    <div className="mx-auto max-w-5xl px-5 pb-24 pt-32 sm:px-10 sm:pt-40">
      <p className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
        All tutorials
      </p>
      <h1 className="mt-4 font-[family-name:var(--font-display)] text-4xl text-foreground sm:text-5xl">
        The full library
      </h1>
      <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
        Work through them in order, or jump straight to what you need. Every
        script here is written for offline, singleplayer, or private-lobby
        use against games you own.
      </p>

      <Link
        href={`/tutorials/${featured.slug}`}
        className="group mt-14 flex flex-col gap-6 rounded-xl border border-border bg-card p-8 transition-all duration-200 hover:border-[#00e5a0]/50 hover:shadow-[0_0_0_1px_rgba(0,229,160,0.5),0_8px_40px_rgba(0,229,160,0.08)] sm:flex-row sm:items-center sm:justify-between"
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
        <div className="flex shrink-0 items-center gap-2 font-[family-name:var(--font-mono)] text-sm text-[#00e5a0]">
          {featured.minutes} min
          <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" />
        </div>
      </Link>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rest.map((t, i) => {
          const Icon = t.icon
          return (
            <Link
              key={t.slug}
              href={`/tutorials/${t.slug}`}
              className="group flex flex-col rounded-lg border border-border bg-card p-6 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/25 hover:shadow-lg"
            >
              <div className="mb-4 flex items-center justify-between">
                <span className="font-[family-name:var(--font-mono)] text-[11px] text-muted-foreground/60">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <Icon className="size-4 text-muted-foreground transition-colors duration-200 group-hover:text-[#00e5a0]" />
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
          )
        })}
      </div>
    </div>
  )
}
