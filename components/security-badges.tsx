import { Lock, ShieldCheck, EyeOff, GitBranch } from "lucide-react"

import { Reveal } from "@/components/reveal"

const BADGES = [
  {
    icon: Lock,
    title: "Strict CSP + SRI",
    body: "A locked-down Content-Security-Policy plus Subresource Integrity on every script — a tampered bundle simply refuses to run.",
  },
  {
    icon: ShieldCheck,
    title: "Isolation headers",
    body: "COOP, CORP, HSTS, and a full Permissions-Policy lockout on camera/mic/location/sensors — enforced on every response, not just the homepage.",
  },
  {
    icon: EyeOff,
    title: "No tracking",
    body: "No analytics, no ad pixels, no third-party scripts of any kind. The AI assistant calls Claude server-side — your key never reaches a browser.",
  },
  {
    icon: GitBranch,
    title: "Open source",
    body: "Every line of this site — headers included — is public on GitHub. Nothing about how it's hardened is a secret.",
  },
]

/** Honest, verifiable hardening facts — not a security-theater claim.
 * A public site with a public GitHub repo and a normal domain can't be
 * hidden from DNS, TLS certificate transparency, or WHOIS; this documents
 * what actually is locked down at the application layer. */
export function SecurityBadges() {
  return (
    <section className="relative border-t border-border px-5 py-16 sm:px-10 sm:py-20">
      <div className="mx-auto max-w-5xl">
        <Reveal>
          <p className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
            Under the hood
          </p>
          <h2 className="mt-4 max-w-xl font-[family-name:var(--font-display)] text-3xl text-foreground sm:text-4xl">
            Hardened, honestly
          </h2>
          <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground">
            A public site on a public domain can&apos;t hide from DNS
            lookups or certificate transparency logs — nothing legitimately
            can. What&apos;s real, and checkable in the response headers
            right now:
          </p>
        </Reveal>

        <div className="mt-10 grid gap-8 sm:grid-cols-2 sm:gap-6">
          {BADGES.map(({ icon: Icon, title, body }, i) => (
            <Reveal key={title} delay={i * 80}>
              <div className="flex gap-4">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border">
                  <Icon className="size-4 text-[#00e5a0]" />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-foreground">{title}</h3>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                    {body}
                  </p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
