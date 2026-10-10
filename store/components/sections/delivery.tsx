"use client";

import { ArrowUpRight, Receipt, Truck } from "lucide-react";
import type { Region } from "@/types";
import { useI18n } from "@/components/providers/i18n-provider";
import { SectionHeader } from "@/components/ui/section-header";
import { WhatsAppIcon } from "@/components/ui/icons";
import { Reveal } from "@/components/motion/reveal";
import { Spotlight } from "@/components/motion/spotlight";
import { OwnerNotice } from "@/components/commerce/owner-notice";
import { useRegion } from "@/lib/hooks/use-region";
import { HOURS, HOURS_CONFIRMED, REGION_CONFIG, WHATSAPP_LINES } from "@/lib/site";
import { CURRENCY_LABEL, formatCurrency } from "@/lib/currency";
import { buildHelloMessage, generateWhatsAppLink } from "@/lib/whatsapp";
import { fmt } from "@/lib/i18n";
import { OpenStatus } from "./open-status";

const REGIONS: Region[] = ["BH", "AE"];
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Opening hours grouped into runs of days with the same slot, longest run
 * first: { from: 6, to: 4, open: "10:00", close: "22:00" } reads
 * "Saturday–Thursday 10:00–22:00". Closed days are left out.
 */
function scheduleGroups(hours: typeof HOURS) {
  const key = (d: number) => {
    const slot = hours[d];
    return slot ? slot.join("-") : "closed";
  };
  // Start at the first day whose slot differs from the day before, so a run never wraps mid-way.
  let start = 0;
  for (let d = 0; d < 7; d++) {
    if (key(d) !== key((d + 6) % 7)) {
      start = d;
      break;
    }
  }
  const runs: { from: number; to: number; length: number; slot: [string, string] | null }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = (start + i) % 7;
    const last = runs[runs.length - 1];
    if (last && key(last.to) === key(d)) {
      last.to = d;
      last.length += 1;
    } else {
      runs.push({ from: d, to: d, length: 1, slot: hours[d] ?? null });
    }
  }
  return runs
    .filter((r): r is typeof r & { slot: [string, string] } => r.slot !== null)
    .sort((a, b) => b.length - a.length);
}

const SCHEDULE = scheduleGroups(HOURS);

export function Delivery() {
  const { t, locale } = useI18n();
  const copy = t.home.delivery;
  const region = useRegion();

  return (
    <section id="delivery" aria-labelledby="delivery-title" className="relative py-28 md:py-40">
      <div className="shell">
        <SectionHeader
          index="05"
          eyebrow={copy.eyebrow}
          title={copy.title}
          id="delivery-title"
          aside={
            HOURS_CONFIRMED ? (
              // Whether the visitor's own region is answering right now; both regions are detailed below.
              <div className="border-s border-line ps-5">
                <p className="eyebrow">
                  {/* A no-break space keeps the dot with the word before it on a narrow phone. */}
                  {copy.hours}&nbsp;· {REGION_CONFIG[region].name[locale]}
                </p>
                <OpenStatus region={region} className="mt-3 text-base" />
              </div>
            ) : (
              <RegionLine region={region} />
            )
          }
        />

        <OwnerNotice className="mt-10 max-w-2xl" />

        {/* Three steps in a row, divided by hairlines. */}
        <ol className="mt-14 grid border-y border-line md:mt-20 md:grid-cols-3">
          {copy.steps.map((step, i) => (
            <li
              key={i}
              className="border-line py-8 not-first:border-t md:py-10 md:not-first:border-t-0 md:not-first:border-s md:not-first:ps-8 md:not-last:pe-8 lg:not-first:ps-10 lg:not-last:pe-10"
            >
              <Reveal delay={i * 0.06} y={14}>
                <div className="flex items-center gap-3">
                  <span dir="ltr" className="tabular font-mono text-sm text-fg-subtle">
                    {pad(i + 1)}
                  </span>
                  <span aria-hidden className="h-px w-6 bg-line-strong" />
                </div>
                <h3 className="mt-6 text-xl font-semibold tracking-[-0.02em] text-fg md:text-[1.375rem]">{step.title}</h3>
                <p className="mt-2 max-w-xs text-[0.9375rem] leading-relaxed text-fg-muted">{step.body}</p>
              </Reveal>
            </li>
          ))}
        </ol>

        <div className="mt-10 grid gap-3 md:mt-14 md:grid-cols-2 md:gap-4">
          {REGIONS.map((region, i) => (
            <Reveal key={region} delay={i * 0.08} className="h-full">
              <RegionCard region={region} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function RegionCard({ region }: { region: Region }) {
  const { t, locale } = useI18n();
  const copy = t.home.delivery;
  const config = REGION_CONFIG[region];
  const hello = buildHelloMessage(locale);
  const [minDays, maxDays] = config.deliveryDays;
  const fee =
    config.deliveryFee === null
      ? copy.fee
      : fmt(copy.feeFlat, { amount: formatCurrency(config.deliveryFee, config.currency, locale) });

  return (
    <Spotlight className="relative flex h-full flex-col overflow-hidden rounded-2xl bg-ink-900 p-6 edge-light transition-shadow duration-300 hover:shadow-[inset_0_1px_0_0_rgb(255_255_255/0.08),0_0_0_1px_var(--color-line-strong)] md:p-8">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="text-[1.75rem] font-semibold leading-tight tracking-[-0.03em] text-fg md:text-[2rem]">
          {config.name[locale]}
        </h3>
        {/* The currency prices are shown in for this region: "BHD", or "د.ب" in Arabic. */}
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-fg-muted rtl:text-xs">
          {CURRENCY_LABEL[config.currency][locale]}
        </span>
      </div>
      <p className="mt-3 max-w-sm text-[0.9375rem] leading-relaxed text-fg-muted">{copy.coverage[region]}</p>

      <ul className="mt-6 grid gap-2.5 text-[0.9375rem] text-fg">
        <li className="flex items-start gap-3">
          <Truck aria-hidden strokeWidth={1.5} className="mt-0.5 size-4 shrink-0 text-fg-muted" />
          <span className="tabular">{fmt(copy.days, { min: minDays, max: maxDays })}</span>
        </li>
        <li className="flex items-start gap-3">
          <Receipt aria-hidden strokeWidth={1.5} className="mt-0.5 size-4 shrink-0 text-fg-muted" />
          <span>{fee}</span>
        </li>
      </ul>

      <div className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <p className="eyebrow">{copy.lines}</p>
          {HOURS_CONFIRMED ? <OpenStatus region={region} /> : null}
        </div>
        <ul className="mt-3 border-t border-line">
          {config.lines.map((id) => {
            const line = WHATSAPP_LINES[id];
            return (
              <li key={id} className="border-b border-line">
                <a
                  href={generateWhatsAppLink(line.e164, hello)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group/line -mx-2 flex min-h-14 items-center gap-3 rounded-lg px-2 py-3 transition-colors duration-200 hover:bg-white/[0.03]"
                >
                  <WhatsAppIcon className="size-4 shrink-0 text-fg-muted transition-colors group-hover/line:text-fg" />
                  <span className="truncate text-sm text-fg-muted transition-colors group-hover/line:text-fg">
                    {line.label[locale]}
                  </span>
                  {/* ms-auto resolves against the element's own direction, so the number's LTR isolation lives inside it. */}
                  <span className="ms-auto shrink-0 font-mono text-sm tabular text-fg">
                    <bdi dir="ltr">{line.display}</bdi>
                  </span>
                  <ArrowUpRight
                    aria-hidden
                    strokeWidth={1.5}
                    className="size-4 shrink-0 text-fg-muted transition-[color,translate] duration-300 ease-out-expo group-hover/line:-translate-y-0.5 group-hover/line:text-fg rtl:-scale-x-100"
                  />
                </a>
              </li>
            );
          })}
        </ul>
      </div>

      {HOURS_CONFIRMED ? (
        <div className="mt-auto pt-8">
          <p className="eyebrow">{copy.hours}</p>
          <dl className="mt-3 grid gap-1.5 text-sm">
            {SCHEDULE.map((g) => (
              <div key={g.from} className="flex items-baseline justify-between gap-4">
                <dt className="text-fg-muted">
                  {g.from === g.to ? t.common.weekdays[g.from] : `${t.common.weekdays[g.from]}–${t.common.weekdays[g.to]}`}
                </dt>
                <dd className="tabular font-mono text-fg" dir="ltr">
                  {g.slot[0]}–{g.slot[1]}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </Spotlight>
  );
}

/** The visitor's region and its first WhatsApp line: shown instead of opening hours until they are confirmed. */
function RegionLine({ region }: { region: Region }) {
  const { t, locale } = useI18n();
  const line = WHATSAPP_LINES[REGION_CONFIG[region].lines[0]];
  return (
    <div className="border-s border-line ps-5">
      <p className="eyebrow">
        {t.home.delivery.lines}&nbsp;· {REGION_CONFIG[region].name[locale]}
      </p>
      <a
        href={generateWhatsAppLink(line.e164, buildHelloMessage(locale))}
        target="_blank"
        rel="noopener noreferrer"
        dir="ltr"
        className="mt-3 inline-flex min-h-11 items-center font-mono text-base tabular text-fg transition-colors hover:text-platinum"
      >
        {line.display}
      </a>
    </div>
  );
}
