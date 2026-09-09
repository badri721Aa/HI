"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ExternalLink } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const NAV = [
  { label: "Tutorials", href: "/tutorials" },
  { label: "Tools", href: "/tools" },
]

export function SiteHeader() {
  const [scrolled, setScrolled] = React.useState(false)
  const pathname = usePathname()

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
        href="/"
        className="pointer-events-auto font-[family-name:var(--font-mono)] text-xs font-medium uppercase tracking-[0.3em] text-[#EDE8DF]"
      >
        nosignal
      </Link>

      <nav className="pointer-events-auto hidden items-center gap-8 sm:flex">
        {NAV.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`)
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group/nav relative font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.2em] transition-colors",
                active ? "text-[#EDE8DF]" : "text-[#EDE8DF]/60 hover:text-[#EDE8DF]"
              )}
            >
              {item.label}
              <span
                className={cn(
                  "absolute -bottom-1 left-0 h-px bg-[#C9A961] transition-all duration-300",
                  active ? "w-full" : "w-0 group-hover/nav:w-full"
                )}
              />
            </Link>
          )
        })}
      </nav>

      <Button
        asChild
        variant="outline"
        size="icon"
        className="pointer-events-auto rounded-full border-white/20 bg-transparent text-[#EDE8DF] hover:bg-white/5 hover:text-[#EDE8DF]"
      >
        <a
          href="https://github.com/badri721aa/hi"
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
