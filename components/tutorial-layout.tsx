import Link from "next/link"
import { ArrowLeft, ArrowRight, Clock } from "lucide-react"

import { LEVEL_LABEL, type Level, getAdjacentTutorials } from "@/lib/tutorials"
import { cn } from "@/lib/utils"

const LEVEL_STYLE: Record<Level, string> = {
  beginner: "bg-[#00e5a0]/10 text-[#00e5a0]",
  intermediate: "bg-[#5b9eff]/10 text-[#5b9eff]",
  advanced: "bg-[#ff5f72]/10 text-[#ff5f72]",
}

interface TocItem {
  id: string
  label: string
}

interface TutorialLayoutProps {
  slug: string
  title: string
  level: Level
  minutes: number
  tags?: string[]
  toc: TocItem[]
  children: React.ReactNode
}

export function TutorialLayout({
  slug,
  title,
  level,
  minutes,
  tags = [],
  toc,
  children,
}: TutorialLayoutProps) {
  const { prev, next } = getAdjacentTutorials(slug)

  return (
    <div className="mx-auto grid max-w-5xl gap-14 px-5 pb-24 pt-32 sm:px-10 sm:pt-40 md:grid-cols-[1fr_200px]">
      <div className="min-w-0">
        <Link
          href="/tutorials"
          className="mb-8 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors duration-150 hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          All tutorials
        </Link>

        <h1 className="font-[family-name:var(--font-display)] text-4xl leading-[0.95] font-semibold text-foreground text-balance sm:text-5xl">
          {title}
        </h1>

        <div className="mt-6 flex flex-wrap items-center gap-2 border-b border-border pb-7">
          <span
            className={cn(
              "rounded px-2 py-0.5 text-[10px] font-semibold tracking-[0.06em] uppercase",
              LEVEL_STYLE[level]
            )}
          >
            {LEVEL_LABEL[level]}
          </span>
          {tags.map((tag) => (
            <span
              key={tag}
              className="rounded bg-white/5 px-2 py-0.5 text-[10px] tracking-[0.06em] text-muted-foreground uppercase"
            >
              {tag}
            </span>
          ))}
          <span className="ml-auto inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <Clock className="size-3.5" />
            {minutes} min read
          </span>
        </div>

        <div
          className={cn(
            "prose-tut mt-9",
            "[&_h2]:mt-11 [&_h2]:mb-3.5 [&_h2]:font-[family-name:var(--font-display)] [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:text-foreground [&_h2]:scroll-mt-28",
            "[&_h3]:mt-7 [&_h3]:mb-2.5 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-foreground [&_h3]:scroll-mt-28",
            "[&_p]:mb-4 [&_p]:max-w-[660px] [&_p]:text-[14px] [&_p]:leading-relaxed [&_p]:text-muted-foreground",
            "[&_ul]:mb-4 [&_ul]:max-w-[640px] [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5 [&_ul]:text-[14px] [&_ul]:text-muted-foreground",
            "[&_a]:text-foreground [&_a]:underline [&_a]:decoration-white/30 [&_a]:underline-offset-2 hover:[&_a]:decoration-white/70",
            "[&_strong]:text-foreground [&_strong]:font-semibold",
            "[&_code]:rounded [&_code]:border [&_code]:border-border [&_code]:bg-white/5 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-[family-name:var(--font-mono)] [&_code]:text-[12px] [&_code]:text-[#00e5a0]"
          )}
        >
          {children}
        </div>

        <div className="mt-16 grid gap-3 border-t border-border pt-8 sm:grid-cols-2">
          {prev ? (
            <Link
              href={`/tutorials/${prev.slug}`}
              className="group flex flex-col rounded-lg border border-border p-4 transition-colors duration-150 hover:border-white/25"
            >
              <span className="mb-1 inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <ArrowLeft className="size-3.5" />
                Previous
              </span>
              <span className="text-sm font-medium text-foreground">
                {prev.title}
              </span>
            </Link>
          ) : (
            <div />
          )}
          {next ? (
            <Link
              href={`/tutorials/${next.slug}`}
              className="group flex flex-col rounded-lg border border-border p-4 text-right transition-colors duration-150 hover:border-white/25"
            >
              <span className="mb-1 inline-flex items-center justify-end gap-1.5 text-[11px] text-muted-foreground">
                Next
                <ArrowRight className="size-3.5" />
              </span>
              <span className="text-sm font-medium text-foreground">
                {next.title}
              </span>
            </Link>
          ) : (
            <div />
          )}
        </div>
      </div>

      {toc.length > 0 && (
        <aside className="hidden md:block">
          <div className="sticky top-28">
            <p className="mb-3 text-[10px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
              On this page
            </p>
            <nav className="flex flex-col gap-0.5">
              {toc.map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className="border-l-2 border-border py-1 pl-3.5 text-[12px] text-muted-foreground transition-colors duration-150 hover:border-white/40 hover:text-foreground"
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </div>
        </aside>
      )}
    </div>
  )
}
