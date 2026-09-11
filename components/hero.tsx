"use client"

import Link from "next/link"
import { ArrowRight, BookOpen } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useTheme } from "@/components/theme-provider"
import { TUTORIALS } from "@/lib/tutorials"

const TOTAL_MINUTES = TUTORIALS.reduce((sum, t) => sum + t.minutes, 0)

const META = [
  "Frida + Python",
  "Reverse engineering",
  `${TUTORIALS.length} tutorials · ~${TOTAL_MINUTES} min`,
  "Zero fluff",
]

export function Hero() {
  const { theme } = useTheme()
  const isDark = theme === "dark"

  return (
    <section className="relative flex min-h-[92vh] flex-col items-center justify-center overflow-hidden px-5 pb-16 pt-24 text-center sm:px-10">
      <div className="nebula-glow opacity-40" />

      <div className="relative mt-6 flex items-center gap-3">
        <span aria-hidden className="h-px w-8 bg-[#c9a961] opacity-70" />
        <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.32em] text-[#c9a961]">
          nosignal
        </span>
      </div>

      <h1
        className="relative mt-6 max-w-3xl font-[family-name:var(--font-display)] text-6xl leading-[0.92] tracking-tight text-foreground text-balance transition-[text-shadow] duration-700 sm:text-8xl"
        style={{
          textShadow: isDark
            ? "0 0 50px rgba(180,195,225,0.3), 0 0 110px rgba(150,165,205,0.15)"
            : "0 0 40px rgba(255,190,90,0.26), 0 0 90px rgba(255,170,60,0.1)",
        }}
      >
        nosignal
      </h1>

      <p className="relative mx-auto mt-6 max-w-md text-[13px] leading-relaxed text-muted-foreground sm:text-[15px]">
        Learn game modding the right way: Frida internals, Python tooling,
        and reverse-engineering fundamentals — built for your own projects,
        not someone else&apos;s live server.
      </p>

      <div className="relative mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Button asChild size="lg" variant="glow" className="rounded-full px-7">
          <Link href="/tutorials">
            Start learning
            <ArrowRight className="size-4 transition-transform duration-200 group-hover/button:translate-x-1" />
          </Link>
        </Button>
        <Button asChild variant="glass" size="lg" className="rounded-full px-7">
          <Link href="/tutorials/frida-install">
            <BookOpen className="size-4" />
            Start with Frida
          </Link>
        </Button>
      </div>

      <div className="relative mt-14 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
        {META.map((m) => (
          <span
            key={m}
            className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.22em] text-muted-foreground"
          >
            {m}
          </span>
        ))}
      </div>
    </section>
  )
}
