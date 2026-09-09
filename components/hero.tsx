"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowRight, BookOpen } from "lucide-react"

import { Button } from "@/components/ui/button"

const META = ["Frida + Python", "Reverse engineering", "Zero fluff"]

/**
 * A literal light source behind the wordmark — this is nosignal.solar, so
 * the hero gets an actual sun: a layered corona that drifts a few px
 * toward the pointer, like it's being cast from somewhere in the room
 * rather than painted flat on the background.
 */
function Corona() {
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const mq = window.matchMedia("(pointer: fine)")
    if (!mq.matches) return

    let raf = 0
    let tx = 0
    let ty = 0
    let cx = 0
    let cy = 0

    const onMove = (e: PointerEvent) => {
      const nx = (e.clientX / window.innerWidth - 0.5) * 2
      const ny = (e.clientY / window.innerHeight - 0.5) * 2
      tx = nx * 22
      ty = ny * 14
    }

    const tick = () => {
      cx += (tx - cx) * 0.06
      cy += (ty - cy) * 0.06
      if (ref.current) {
        ref.current.style.transform = `translate3d(calc(-50% + ${cx}px), calc(-50% + ${cy}px), 0)`
      }
      raf = requestAnimationFrame(tick)
    }

    window.addEventListener("pointermove", onMove, { passive: true })
    raf = requestAnimationFrame(tick)

    return () => {
      window.removeEventListener("pointermove", onMove)
      cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        ref={ref}
        className="absolute left-1/2 top-[38%] size-[900px] -translate-x-1/2 -translate-y-1/2"
        style={{
          background:
            "radial-gradient(circle, rgba(201,169,97,0.5) 0%, rgba(201,169,97,0.22) 22%, rgba(201,169,97,0.08) 42%, transparent 68%)",
          filter: "blur(2px)",
        }}
      />
      <div
        className="absolute left-1/2 top-[38%] size-[280px] -translate-x-1/2 -translate-y-1/2 animate-pulse"
        style={{
          background:
            "radial-gradient(circle, rgba(255,241,214,0.55) 0%, rgba(201,169,97,0.3) 45%, transparent 75%)",
          filter: "blur(8px)",
          animationDuration: "6s",
        }}
      />
    </div>
  )
}

export function Hero() {
  return (
    <section className="relative flex min-h-[92vh] flex-col items-center justify-center overflow-hidden px-5 pb-16 pt-28 text-center sm:px-10">
      <div className="nebula-glow opacity-40" />
      <Corona />

      <div className="relative flex items-center gap-3">
        <span aria-hidden className="h-px w-8 bg-[#c9a961] opacity-70" />
        <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.32em] text-[#c9a961]">
          nosignal
        </span>
      </div>

      <h1
        className="relative mt-8 max-w-3xl font-[family-name:var(--font-display)] text-6xl leading-[0.92] tracking-tight text-foreground text-balance sm:text-8xl"
        style={{
          textShadow:
            "0 0 60px rgba(201,169,97,0.35), 0 0 120px rgba(201,169,97,0.15)",
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
