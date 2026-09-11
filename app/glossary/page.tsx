import type { Metadata } from "next"

import { TERMS } from "@/lib/glossary"
import { slugify } from "@/lib/utils"

export const metadata: Metadata = {
  title: "Glossary",
  description:
    "Reverse-engineering and game-modding terms used across the tutorials — IL2CPP, ASLR, hooking, pointer chains, and more.",
}

export default function GlossaryPage() {
  return (
    <div className="relative mx-auto max-w-3xl px-5 pb-24 pt-32 sm:px-10 sm:pt-40">
      <div className="nebula-glow -z-10" />
      <p className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
        Reference
      </p>
      <h1 className="mt-4 font-[family-name:var(--font-display)] text-4xl text-foreground sm:text-5xl">
        Glossary
      </h1>
      <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
        Terms used across the tutorials, in plain language. Skim it once
        before you start, or come back whenever a script uses a word you
        don&apos;t recognize.
      </p>

      <dl className="mt-14 divide-y divide-border border-t border-border">
        {TERMS.map((t) => (
          <div
            key={t.term}
            id={slugify(t.term)}
            className="grid scroll-mt-28 gap-2 py-6 sm:grid-cols-[200px_1fr] sm:gap-8"
          >
            <dt className="font-[family-name:var(--font-display)] text-lg font-semibold text-foreground">
              {t.term}
            </dt>
            <dd className="text-[13.5px] leading-relaxed text-muted-foreground">
              {t.definition}
              {t.related && t.related.length > 0 && (
                <span className="mt-2 block text-[11px] text-muted-foreground/70">
                  See also: {t.related.join(", ")}
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
