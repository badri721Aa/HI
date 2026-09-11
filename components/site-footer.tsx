import Link from "next/link"

import { Button } from "@/components/ui/button"
import { DiscordIcon } from "@/components/discord-icon"
import { Reveal } from "@/components/reveal"

const LINKS = [
  { label: "Tutorials", href: "/tutorials" },
  { label: "Tools", href: "/tools" },
  { label: "Glossary", href: "/glossary" },
  { label: "GitHub", href: "https://github.com/badri721aa/hi" },
]

const DISCORD_URL = "https://discord.gg/wMG8vsYdgU"

export function SiteFooter() {
  return (
    <footer className="border-t border-border px-5 py-10 sm:px-10">
      <div className="mx-auto max-w-5xl">
        <Reveal>
          <div className="glass mb-10 flex flex-col items-center gap-5 rounded-xl p-6 text-center sm:flex-row sm:justify-between sm:text-left">
            <div className="flex items-center gap-4">
              <DiscordIcon className="size-9 shrink-0 text-[#5865F2]" />
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Join the community
                </p>
                <p className="text-xs text-muted-foreground">
                  Built by <span className="font-medium text-foreground">ATVR_OLD</span>{" "}
                  — come hang out, ask questions, share what you&apos;re modding.
                </p>
              </div>
            </div>
            <Button asChild variant="glow" size="lg" className="shrink-0 rounded-full px-6">
              <a href={DISCORD_URL} target="_blank" rel="noreferrer">
                <DiscordIcon className="size-4" />
                Join the Discord
              </a>
            </Button>
          </div>
        </Reveal>

        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start sm:justify-between">
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
      </div>
    </footer>
  )
}
