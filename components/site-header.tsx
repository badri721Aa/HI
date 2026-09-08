import Link from "next/link"
import { ExternalLink } from "lucide-react"

import { Button } from "@/components/ui/button"

const NAV = [
  { label: "Tutorials", href: "#tutorials" },
  { label: "Tools", href: "#tools" },
  { label: "Docs", href: "#docs" },
]

export function SiteHeader() {
  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-20 flex items-center justify-between px-5 py-5 sm:px-10 sm:py-7">
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
            className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.2em] text-[#EDE8DF]/60 transition-colors hover:text-[#EDE8DF]"
          >
            {item.label}
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
