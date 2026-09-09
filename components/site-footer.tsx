import Link from "next/link"

const LINKS = [
  { label: "Tutorials", href: "/tutorials" },
  { label: "Tools", href: "/tools" },
  { label: "Glossary", href: "/glossary" },
  { label: "GitHub", href: "https://github.com/badri721aa/hi" },
]

export function SiteFooter() {
  return (
    <footer className="border-t border-border px-5 py-10 sm:px-10">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col items-center gap-3 sm:items-start">
          <Link
            href="/"
            className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground"
          >
            nosignal
          </Link>
          <p className="max-w-xs text-center text-xs text-muted-foreground sm:text-left">
            For educational use. Mod responsibly — only games you own, only
            offline or private sessions.
          </p>
        </div>

        <nav className="flex gap-6">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              target={link.href.startsWith("http") ? "_blank" : undefined}
              rel={link.href.startsWith("http") ? "noreferrer" : undefined}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  )
}
