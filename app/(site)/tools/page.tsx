import type { Metadata } from "next"

import { ToolsGrid } from "@/components/tools-grid"
import { BrowserToolsGrid } from "@/components/browser-tools-grid"

export const metadata: Metadata = {
  title: "Tools",
  description:
    "Every tool used across the tutorials — what each does and where to get it — plus a few browser-based utilities that run right on this site.",
}

export default function ToolsPage() {
  return (
    <div className="relative mx-auto max-w-5xl px-5 pb-24 pt-32 sm:px-10 sm:pt-40">
      <div className="nebula-glow -z-10" />
      <p className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
        Toolkit
      </p>
      <h1 className="mt-4 font-[family-name:var(--font-display)] text-4xl text-foreground sm:text-5xl">
        Essential tools
      </h1>
      <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
        Every tool used across the tutorials — what each does and where to
        get it.
      </p>

      <ToolsGrid />

      <div className="mt-20 border-t border-border pt-14">
        <p className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
          No install
        </p>
        <h2 className="mt-4 font-[family-name:var(--font-display)] text-3xl text-foreground sm:text-4xl">
          Browser utilities
        </h2>
        <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
          A few small tools that run entirely client-side — nothing you
          upload ever leaves your browser.
        </p>

        <BrowserToolsGrid />
      </div>
    </div>
  )
}
