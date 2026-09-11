import Link from "next/link"
import { ArrowLeft, Search } from "lucide-react"

import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="relative mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center px-5 text-center sm:px-10">
      <div className="nebula-glow -z-10" />
      <p className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
        404
      </p>
      <h1 className="mt-4 font-[family-name:var(--font-display)] text-4xl text-foreground sm:text-5xl">
        Signal lost
      </h1>
      <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
        Nothing&apos;s hooked at this address. It may have moved, or never
        existed in the first place.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button asChild variant="glow" className="rounded-full px-6">
          <Link href="/">
            <ArrowLeft className="size-4" />
            Back home
          </Link>
        </Button>
        <Button asChild variant="glass" className="rounded-full px-6">
          <Link href="/tutorials">
            <Search className="size-4" />
            Browse tutorials
          </Link>
        </Button>
      </div>
    </div>
  )
}
