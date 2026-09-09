"use client"

import Link from "next/link"
import { ArrowRight, BookOpen } from "lucide-react"

import { Button } from "@/components/ui/button"

const META = ["Frida + Python", "Reverse engineering", "Zero fluff"]

export function Hero() {
  return (
    <section className="relative flex min-h-[92vh] flex-col items-center justify-center overflow-hidden px-5 pb-16 pt-28 text-center sm:px-10">
      <div className="nebula-glow" />

      <div className="relative flex items-center gap-3">
        <span aria-hidden className="h-px w-8 bg-[#c9a961] opacity-70" />
        <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.32em] text-[#c9a961]">
          nosignal
        </span>
      </div>

      <h1 className="relative mt-8 max-w-3xl font-[family-name:var(--font-display)] text-5xl leading-[0.95] text-foreground text-balance sm:text-7xl">
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
