"use client";

import "./globals.css";
import { useEffect } from "react";
import { fontVariables } from "./fonts";
import { siteCopy } from "@/lib/i18n/messages/site";
import { site } from "@/lib/site";
import { GridBackdrop, PrintedCode } from "@/components/seo/printed-code";
import { buttonStyles } from "@/components/ui/button";

/**
 * Last-resort boundary for errors in the root layout itself. It replaces the
 * whole document, so there are no providers and no known locale: the copy is
 * shown in both languages.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const en = siteCopy.en.error;
  const ar = siteCopy.ar.error;

  useEffect(() => {
    console.error("[layer-up] root error", error.digest ?? "", error);
  }, [error]);

  return (
    <html lang="en" dir="ltr" className={fontVariables}>
      <body className="bg-ink-950 text-fg">
        <title>{`${en.title} · ${site.name}`}</title>
        <main className="relative isolate flex min-h-[100svh] items-center overflow-hidden">
          <GridBackdrop />
          <div className="shell py-24">
            <p aria-hidden="true" className="text-[clamp(5rem,16vw,9rem)] leading-none">
              <PrintedCode code="500" progress={0.34} />
            </p>

            <div className="mt-12 grid max-w-4xl gap-10 md:grid-cols-2 md:gap-14">
              <div>
                <h1 className="text-[clamp(2rem,4vw,3rem)] font-semibold leading-[1.02] tracking-[-0.035em]">{en.title}</h1>
                <p className="mt-4 max-w-sm text-[1.0625rem] leading-relaxed text-fg-muted">{en.body}</p>
              </div>
              <div lang="ar" dir="rtl" style={{ fontFamily: "var(--font-tajawal), var(--font-instrument), sans-serif" }}>
                <p className="text-[clamp(2rem,4vw,3rem)] font-bold leading-[1.15]">{ar.title}</p>
                <p className="mt-4 max-w-sm text-[1.0625rem] leading-relaxed text-fg-muted">{ar.body}</p>
              </div>
            </div>

            <div className="mt-12 flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => retry()} className={buttonStyles({ size: "lg" })}>
                {en.retry}
                <span aria-hidden="true" className="text-ink-600">
                  ·
                </span>
                <span lang="ar" style={{ fontFamily: "var(--font-tajawal), sans-serif" }}>
                  {ar.retry}
                </span>
              </button>
              {error.digest ? <span className="font-mono text-sm text-fg-subtle">{error.digest}</span> : null}
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
