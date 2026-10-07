"use client";

import { Plus } from "lucide-react";
import { useI18n } from "@/components/providers/i18n-provider";
import { SectionHeader } from "@/components/ui/section-header";
import { ButtonLink } from "@/components/ui/button";
import { WhatsAppIcon } from "@/components/ui/icons";
import { Reveal } from "@/components/motion/reveal";
import { hasReviews } from "@/content/reviews";
import { useRegion } from "@/lib/hooks/use-region";
import { usePrefs } from "@/lib/store/prefs";
import { buildHelloMessage, generateWhatsAppLink, resolveLine } from "@/lib/whatsapp";

/** Numbering stays sequential whether or not the reviews section renders. */
const INDEX = hasReviews ? "07" : "06";

/*
 * Native <details>/<summary>: works without JavaScript and with every assistive
 * technology. Where the browser supports ::details-content and
 * interpolate-size, the answer also eases open; elsewhere it simply appears.
 */
const DETAILS =
  "group border-b border-line [interpolate-size:allow-keywords] " +
  "[&::details-content]:h-0 [&::details-content]:overflow-clip " +
  "[&::details-content]:transition-[height,content-visibility] [&::details-content]:duration-500 " +
  "[&::details-content]:ease-out-expo [&::details-content]:[transition-behavior:allow-discrete] " +
  "open:[&::details-content]:h-auto";

export function Faq() {
  const { t, locale } = useI18n();
  const copy = t.home.faq;
  const region = useRegion();
  const preferred = usePrefs((s) => s.lines[region]);
  const line = resolveLine(region, preferred);

  return (
    <section id="faq" aria-labelledby="faq-title" className="relative py-28 md:py-40">
      <div className="shell grid gap-12 lg:grid-cols-12 lg:gap-x-6">
        <div className="lg:col-span-5 lg:self-start lg:sticky lg:top-28">
          <Reveal>
            <SectionHeader index={INDEX} eyebrow={copy.eyebrow} title={copy.title} id="faq-title" />
            <div className="mt-8">
              <ButtonLink
                href={generateWhatsAppLink(line.e164, buildHelloMessage(locale))}
                variant="secondary"
                size="md"
              >
                <WhatsAppIcon className="size-4" />
                {t.common.actions.chatWhatsApp}
              </ButtonLink>
            </div>
          </Reveal>
        </div>

        <div className="lg:col-span-7 lg:col-start-6 xl:col-span-6 xl:col-start-7">
          <div className="border-t border-line">
            {copy.items.map((item, i) => (
              <Reveal key={i} delay={i * 0.05} y={12}>
                <details className={DETAILS}>
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-6 py-6 text-start text-lg font-medium leading-snug tracking-[-0.01em] text-fg md:py-7 [&::-webkit-details-marker]:hidden">
                    <span>{item.q}</span>
                    <span
                      aria-hidden
                      className="grid size-8 shrink-0 place-items-center rounded-full text-fg-muted ring-1 ring-line-strong transition-[rotate,color,background-color] duration-300 ease-out-expo group-open:rotate-45 group-open:bg-white/[0.04] group-open:text-fg group-hover:text-fg"
                    >
                      <Plus strokeWidth={1.5} className="size-4" />
                    </span>
                  </summary>
                  <div className="pb-7 pe-14">
                    <p className="max-w-prose text-base leading-relaxed text-fg-muted">{item.a}</p>
                  </div>
                </details>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
