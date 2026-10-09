import { ArrowLeft } from "lucide-react";
import type { Locale } from "@/types";
import { getDictionary } from "@/lib/i18n";
import { ButtonLink } from "@/components/ui/button";
import { GridBackdrop, PrintedCode } from "@/components/seo/printed-code";
import { FailedPrint } from "@/components/3d/failed-print";

/** The localized 404 page body (inside the site layout): the failed print and a way back. */
export function NotFoundView({ locale }: { locale: Locale }) {
  const t = getDictionary(locale);
  const copy = t.site.notFound;

  return (
    <section aria-labelledby="not-found-title" className="relative isolate overflow-hidden">
      <GridBackdrop />
      <div className="shell grid min-h-[100svh] items-center gap-y-6 pt-28 pb-20 md:grid-cols-12 md:gap-x-8 md:pt-36 md:pb-28">
        <div className="md:col-span-6 lg:col-span-5">
          <p className="text-[clamp(6.5rem,24vw,12.5rem)] leading-none text-fg">
            <span className="sr-only">{copy.code}</span>
            <PrintedCode code={copy.code} progress={0.52} />
          </p>

          <p className="mt-8 flex items-center gap-3 font-mono text-xs uppercase tracking-[0.14em] text-fg-muted">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-danger" />
            <span>{t.home.hero.hud.layer}</span>
            <span className="tabular" dir="ltr">
              118 / 240
            </span>
          </p>

          <h1
            id="not-found-title"
            className="mt-6 max-w-[16ch] text-[clamp(2.125rem,4.6vw,3.5rem)] font-semibold leading-[1.02] tracking-[-0.035em] text-fg"
          >
            {copy.title}
          </h1>
          <p className="mt-5 max-w-md text-[1.0625rem] leading-relaxed text-fg-muted">{copy.body}</p>

          <ButtonLink href={`/${locale}#collection`} size="lg" className="mt-10">
            <ArrowLeft aria-hidden="true" strokeWidth={1.5} className="size-5 rtl:-scale-x-100" />
            {copy.cta}
          </ButtonLink>
        </div>

        <div
          aria-hidden="true"
          data-scene=""
          className="relative h-[40svh] min-h-72 md:col-span-6 md:h-[min(72svh,44rem)] lg:col-span-7"
        >
          <FailedPrint className="absolute inset-0" />
        </div>
      </div>
    </section>
  );
}
