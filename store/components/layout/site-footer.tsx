"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore, type MouseEvent, type ReactNode } from "react";
import { ArrowUp, ArrowUpRight } from "lucide-react";
import type { Locale } from "@/types";
import { useI18n } from "@/components/providers/i18n-provider";
import { Button, ButtonLink } from "@/components/ui/button";
import { WhatsAppIcon } from "@/components/ui/icons";
import { Logo } from "@/components/ui/logo";
import { useRegion } from "@/lib/hooks/use-region";
import { usePrefs } from "@/lib/store/prefs";
import { scrollToTop } from "@/components/providers/smooth-scroll";
import { WHATSAPP_LINES, site } from "@/lib/site";
import { buildHelloMessage, generateWhatsAppLink, resolveLine } from "@/lib/whatsapp";
import { fmt } from "@/lib/i18n";

/* The year is read in the browser only: no clock access while prerendering. */
const subscribeNever = () => () => {};
const getYear = () => new Date().getFullYear();
const getServerYear = () => null;

const LINES = Object.values(WHATSAPP_LINES);

/**
 * Smooth scroll to the top of the page (the hero on the home page, plain top
 * elsewhere), then move focus to the main content so keyboard users continue
 * from there instead of from the footer.
 */
function backToTop() {
  scrollToTop();
  // Drop a section hash left by in-page navigation, keeping Next's history state.
  if (window.location.hash) {
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
  }
  document.getElementById("main")?.focus({ preventScroll: true });
}

export function SiteFooter() {
  const { t, locale } = useI18n();
  const f = t.site.footer;
  const nav = t.common.nav;

  const pathname = usePathname();
  const home = `/${locale}`;
  const onHome = pathname === home || pathname === `${home}/`;

  const region = useRegion();
  const preferred = usePrefs((s) => s.lines[region]);
  const notifyLine = resolveLine(region, preferred);
  const hello = buildHelloMessage(locale);

  const year = useSyncExternalStore(subscribeNever, getYear, getServerYear);

  const shop = [
    { id: "collection", label: nav.collection },
    { id: "custom", label: nav.custom },
    { id: "materials", label: nav.materials },
  ];
  const help = [
    { id: "delivery", label: nav.delivery },
    { id: "faq", label: nav.faq },
  ];

  return (
    <footer className="relative overflow-hidden">
      <div className="shell">
        {/* Notify card */}
        <div className="rounded-2xl bg-ink-900 p-6 edge-light md:p-10 lg:p-12">
          <div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-end md:gap-12">
            <div>
              <h2 className="text-[clamp(1.75rem,3.2vw,2.75rem)] font-semibold leading-[1.04] tracking-[-0.035em] text-fg">
                {f.notify.title}
              </h2>
              <p className="mt-4 max-w-lg text-[1.0625rem] leading-relaxed text-fg-muted">{f.notify.body}</p>
            </div>
            <ButtonLink
              href={generateWhatsAppLink(notifyLine.e164, f.notify.message)}
              variant="secondary"
              size="lg"
              className="justify-self-start"
            >
              <WhatsAppIcon className="size-4" />
              {f.notify.button}
            </ButtonLink>
          </div>
        </div>

        {/* Columns */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-12 pb-16 pt-16 md:grid-cols-12 md:pt-24 lg:pb-24">
          <div className="col-span-2 md:col-span-12 lg:col-span-4">
            <Link
              href={home}
              onClick={
                onHome
                  ? (e: MouseEvent<HTMLAnchorElement>) => {
                      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                      // Already home: a same-URL navigation would not scroll, so do it here.
                      e.preventDefault();
                      backToTop();
                    }
                  : undefined
              }
              className="-mt-3.5 inline-flex min-h-11 items-center"
            >
              <Logo />
            </Link>
            <p className="mt-4 max-w-xs text-[0.9375rem] leading-relaxed text-fg-muted">{f.tagline}</p>
            <p className="mt-6 max-w-xs text-sm leading-relaxed text-fg-subtle">{f.privacy}</p>
          </div>

          <FooterColumn title={f.shop} className="col-span-1 md:col-span-3 lg:col-span-2 lg:col-start-6">
            {shop.map((item) => (
              <SectionLink key={item.id} id={item.id} locale={locale}>
                {item.label}
              </SectionLink>
            ))}
          </FooterColumn>

          <FooterColumn title={f.help} className="col-span-1 md:col-span-3 lg:col-span-2">
            {help.map((item) => (
              <SectionLink key={item.id} id={item.id} locale={locale}>
                {item.label}
              </SectionLink>
            ))}
          </FooterColumn>

          <FooterColumn as="div" title={f.contact} className="col-span-2 md:col-span-6 lg:col-span-3 lg:col-start-10">
            {LINES.map((line) => (
              <li key={line.id}>
                <a
                  href={generateWhatsAppLink(line.e164, hello)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group/line flex min-h-11 items-center gap-3 py-1.5"
                >
                  <WhatsAppIcon className="size-4 shrink-0 text-fg-muted transition-colors group-hover/line:text-fg" />
                  <span className="flex flex-col items-start">
                    <span className="text-sm text-fg-muted transition-colors group-hover/line:text-fg">
                      {line.label[locale]}
                    </span>
                    <span className="tabular font-mono text-sm text-fg" dir="ltr">
                      {line.display}
                    </span>
                  </span>
                </a>
              </li>
            ))}
            {site.instagram ? (
              <li>
                <a
                  href={site.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group/line flex min-h-11 items-center gap-2 text-[0.9375rem] text-fg-muted transition-colors hover:text-fg"
                >
                  Instagram
                  <ArrowUpRight aria-hidden strokeWidth={1.5} className="size-4 rtl:-scale-x-100" />
                </a>
              </li>
            ) : null}
            {site.email ? (
              <li>
                <a
                  href={`mailto:${site.email}`}
                  className="flex min-h-11 items-center font-mono text-sm text-fg-muted transition-colors hover:text-fg"
                  dir="ltr"
                >
                  {site.email}
                </a>
              </li>
            ) : null}
          </FooterColumn>
        </div>

        {/* Bottom bar */}
        <div className="flex flex-col-reverse items-start justify-between gap-4 border-t border-line py-6 sm:flex-row sm:items-center">
          <p className="text-sm text-fg-subtle">
            <Rights template={f.rights} year={year} brand={site.name} />
          </p>
          <Button variant="ghost" size="sm" onClick={backToTop} className="-ms-4 h-11 sm:ms-0 sm:-me-4 sm:h-9">
            {t.common.actions.backToTop}
            <ArrowUp aria-hidden strokeWidth={1.5} className="size-4" />
          </Button>
        </div>
      </div>

      {/* The one decorative flourish: a barely-there wordmark set edge to edge across the page container.
          "3D BH" in Instrument Sans semibold is 2.6em wide at -0.06em tracking, and 2.9em on /ar, where
          globals.css resets letter-spacing. */}
      <div aria-hidden className="pointer-events-none select-none overflow-hidden">
        <div className="shell @container">
          <p
            dir="ltr"
            className="whitespace-nowrap pb-[2cqi] text-[38.5cqi] font-semibold leading-[0.8] tracking-[-0.06em] text-white/[0.03] rtl:text-[34.5cqi]"
          >
            {site.name}
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  className,
  children,
  as: Tag = "nav",
}: {
  title: string;
  className?: string;
  children: ReactNode;
  /** Shop and Help are navigation; Contact is a plain group. */
  as?: "nav" | "div";
}) {
  return (
    <Tag aria-label={Tag === "nav" ? title : undefined} className={className}>
      <h2 className="eyebrow">{title}</h2>
      <ul className="mt-4 grid">{children}</ul>
    </Tag>
  );
}

/**
 * A real link to a home-page section. On the home page SmoothScroll intercepts
 * it and scrolls with scrollToId (moving focus for keyboard users); elsewhere
 * it navigates home and lands on the section.
 */
function SectionLink({ id, locale, children }: { id: string; locale: Locale; children: ReactNode }) {
  return (
    <li>
      <Link
        href={`/${locale}#${id}`}
        className="inline-flex min-h-11 items-center text-[0.9375rem] text-fg-muted transition-colors duration-200 hover:text-fg"
      >
        {children}
      </Link>
    </li>
  );
}

/** "© {year} {brand}…" with a same-width blank where the year goes until the browser fills it in. */
function Rights({ template, year, brand }: { template: string; year: number | null; brand: string }) {
  const [before, after = ""] = template.split("{year}");
  return (
    <>
      {fmt(before, { brand })}
      {year === null ? <span className="inline-block w-[4ch]" /> : <span className="tabular">{year}</span>}
      {fmt(after, { brand })}
    </>
  );
}
