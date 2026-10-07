import "./globals.css";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { fontVariables } from "./fonts";
import { getDictionary } from "@/lib/i18n";
import { siteViewport } from "@/lib/seo";
import { site } from "@/lib/site";
import { GridBackdrop, PrintedCode } from "@/components/seo/printed-code";
import { Logo } from "@/components/ui/logo";
import { buttonStyles } from "@/components/ui/button";

// Next adds the noindex robots tag to 404 responses itself.
export const metadata: Metadata = {
  title: `Not found · ${site.name}`,
};

export const viewport: Viewport = siteViewport;

/**
 * 404 for URLs that match no route (e.g. /fr or /en/unknown). It renders
 * outside the [lang] layout, so it carries both languages and links to each.
 */
export default function GlobalNotFound() {
  const en = getDictionary("en");
  const ar = getDictionary("ar");

  return (
    <html lang="en" dir="ltr" className={fontVariables}>
      <body className="bg-ink-950 text-fg">
        <main className="relative isolate flex min-h-[100svh] items-center overflow-hidden">
          <GridBackdrop />
          <div className="shell py-24">
            <Link href="/" className="inline-flex rounded-full">
              <Logo />
            </Link>

            <p className="mt-14 text-[clamp(6rem,22vw,11rem)] leading-none">
              <span className="sr-only">{en.site.notFound.code}</span>
              <PrintedCode code={en.site.notFound.code} progress={0.52} />
            </p>

            <div className="mt-12 grid max-w-4xl gap-10 md:grid-cols-2 md:gap-14">
              <div>
                <h1 className="text-[clamp(2rem,4vw,3rem)] font-semibold leading-[1.02] tracking-[-0.035em]">
                  {en.site.notFound.title}
                </h1>
                <p className="mt-4 max-w-sm text-[1.0625rem] leading-relaxed text-fg-muted">{en.site.notFound.body}</p>
                <Link href="/en" hrefLang="en" className={buttonStyles({ className: "mt-8" })}>
                  {en.site.notFound.cta}
                </Link>
              </div>
              <div lang="ar" dir="rtl" style={{ fontFamily: "var(--font-tajawal), var(--font-instrument), sans-serif" }}>
                <p className="text-[clamp(2rem,4vw,3rem)] font-bold leading-[1.15]">{ar.site.notFound.title}</p>
                <p className="mt-4 max-w-sm text-[1.0625rem] leading-relaxed text-fg-muted">{ar.site.notFound.body}</p>
                <Link href="/ar" hrefLang="ar" className={buttonStyles({ variant: "secondary", className: "mt-8" })}>
                  {ar.site.notFound.cta}
                </Link>
              </div>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
