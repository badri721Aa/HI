"use client"

import * as React from "react"
import Link from "next/link"
import { ExternalLink } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const NAV = [
  { label: "Tutorials", href: "#tutorials" },
  { label: "Tools", href: "#tools" },
  { label: "Docs", href: "#docs" },
]

export function SiteHeader() {
  const [scrolled, setScrolled] = React.useState(false)

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <header
      className={cn(
        "pointer-events-none fixed inset-x-0 top-0 z-20 flex items-center justify-between px-5 py-5 transition-[background-color,border-color,backdrop-filter] duration-300 sm:px-10 sm:py-6",
        scrolled &&
          "border-b border-white/10 bg-[#08080B]/60 backdrop-blur-md sm:py-4"
      )}
    >
      <Link
        href="#"
        className="pointer-events-auto font-[family-name:var(--font-mono)] text-xs font-medium uppercase tracking-[0.3em] text-[#EDE8DF]"
      >
        nosignal
      </Link>

      <nav className="pointer-events-auto hidden items-center gap-8 sm:flex">
        {NAV.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="group/nav relative font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.2em] text-[#EDE8DF]/60 transition-colors hover:text-[#EDE8DF]"
          >
            {item.label}
            <span className="absolute -bottom-1 left-0 h-px w-0 bg-[#C9A961] transition-all duration-300 group-hover/nav:w-full" />
          </a>
        ))}
      </nav>

      <Button
        asChild
        variant="outline"
        size="icon"
        className="pointer-events-auto rounded-full border-white/20 bg-transparent text-[#EDE8DF] hover:bg-white/5 hover:text-[#EDE8DF]"
      >
        <a
          href="https://github.com"
          target="_blank"
          rel="noreferrer"
          aria-label="Source on GitHub"
        >
          <ExternalLink className="size-4" />
        </a>
      </Button>
    </header>
  )
}
