import type { Metadata } from "next"

import { TutorialGrid } from "@/components/tutorial-grid"

export const metadata: Metadata = {
  title: "Tutorials",
  description:
    "Frida internals, Python tooling, and reverse-engineering fundamentals — the full tutorial library.",
}

export default function TutorialsPage() {
  return (
    <div className="relative mx-auto max-w-5xl px-5 pb-24 pt-32 sm:px-10 sm:pt-40">
      <div className="nebula-glow -z-10" />
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

      <TutorialGrid />
    </div>
  )
}
