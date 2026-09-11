"use client"

import Link from "next/link"
import { RotateCcw, ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="relative mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center px-5 text-center sm:px-10">
      <div className="nebula-glow -z-10" />
      <p className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
        Error
      </p>
      <h1 className="mt-4 font-[family-name:var(--font-display)] text-4xl text-foreground sm:text-5xl">
        Something broke
      </h1>
      <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
        The page hit an unexpected error. It&apos;s been logged — try again,
        or head back and pick up somewhere else.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button variant="glow" className="rounded-full px-6" onClick={() => reset()}>
          <RotateCcw className="size-4" />
          Try again
        </Button>
        <Button asChild variant="glass" className="rounded-full px-6">
          <Link href="/">
            <ArrowLeft className="size-4" />
            Back home
          </Link>
        </Button>
      </div>
    </div>
  )
}
