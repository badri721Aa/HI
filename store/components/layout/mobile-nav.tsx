"use client";

import { useEffect } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { useI18n } from "@/components/providers/i18n-provider";
import { Drawer } from "@/components/ui/drawer";
import { WhatsAppIcon } from "@/components/ui/icons";
import { useUI } from "@/lib/store/ui";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { WHATSAPP_LINES } from "@/lib/site";
import { buildHelloMessage, generateWhatsAppLink } from "@/lib/whatsapp";
import { playSound } from "@/lib/sound";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, sectionHref } from "./nav-items";
import { RegionSwitch } from "./region-switch";
import { LangSwitch } from "./lang-switch";

export const MOBILE_NAV_ID = "mobile-nav";

const EASE = [0.16, 1, 0.3, 1] as const;
const LINES = Object.values(WHATSAPP_LINES);

/**
 * Full-height menu for small screens, built on the shared Drawer: large
 * section links, region and language, and the three WhatsApp lines.
 * Section links close the menu; SmoothScroll then scrolls once the drawer
 * has released the page.
 */
export function MobileNav({ activeId, langHash }: { activeId?: string | null; langHash?: string }) {
  const { locale, t } = useI18n();
  const open = useUI((s) => s.navOpen);
  const setNavOpen = useUI((s) => s.setNavOpen);
  const reduced = useReducedMotion();

  const close = () => {
    setNavOpen(false);
    playSound("close");
  };

  // The menu only exists below lg; close it if the window grows past that, or on back/forward.
  useEffect(() => {
    if (!open) return;
    const mq = window.matchMedia("(min-width: 64rem)");
    const onChange = () => {
      if (mq.matches) setNavOpen(false);
    };
    const onPop = () => setNavOpen(false);
    mq.addEventListener("change", onChange);
    window.addEventListener("popstate", onPop);
    return () => {
      mq.removeEventListener("change", onChange);
      window.removeEventListener("popstate", onPop);
    };
  }, [open, setNavOpen]);

  const enter = (i: number) =>
    reduced
      ? {}
      : {
          initial: { opacity: 0, y: 14, filter: "blur(4px)" },
          animate: { opacity: 1, y: 0, filter: "blur(0px)", transitionEnd: { filter: "none" } },
          transition: { duration: 0.6, delay: 0.1 + i * 0.05, ease: EASE },
        };

  const hello = buildHelloMessage(locale);

  return (
    <Drawer
      open={open}
      onClose={close}
      title={t.common.menu.title}
      description={t.common.brandLine}
      side="end"
      testId="mobile-nav"
    >
      <div id={MOBILE_NAV_ID} className="flex min-h-full flex-col px-5 pb-10 pt-3 sm:px-6">
        <nav aria-label={t.common.menu.sections}>
          <ul className="border-b border-line">
            {NAV_ITEMS.map((item, i) => {
              const active = activeId === item.id;
              return (
                <motion.li key={item.id} className="border-t border-line first:border-t-0" {...enter(i)}>
                  <Link
                    href={sectionHref(locale, item.id)}
                    aria-current={active ? "true" : undefined}
                    onClick={close}
                    className="flex min-h-16 items-center justify-between gap-4 py-3 text-3xl font-semibold leading-[1.05] tracking-[-0.035em] text-fg transition-opacity duration-200 active:opacity-60"
                  >
                    <span>{t.common.nav[item.key]}</span>
                    <span
                      aria-hidden
                      className={cn(
                        "size-1.5 shrink-0 rounded-full transition-[background-color,box-shadow] duration-300",
                        active ? "bg-glow shadow-[0_0_10px_rgb(125_227_238/0.6)]" : "bg-line-strong",
                      )}
                    />
                  </Link>
                </motion.li>
              );
            })}
          </ul>
        </nav>

        <motion.div className="mt-8 flex flex-wrap gap-x-10 gap-y-6" {...enter(NAV_ITEMS.length)}>
          <div>
            <p className="eyebrow">{t.common.region.label}</p>
            <RegionSwitch size="lg" className="mt-3" />
          </div>
          <div>
            <p className="eyebrow">{t.common.menu.language}</p>
            <LangSwitch variant="pill" hash={langHash} className="mt-3" />
          </div>
        </motion.div>

        <motion.div className="mt-10" {...enter(NAV_ITEMS.length + 1)}>
          <p className="eyebrow">{t.common.actions.chatWhatsApp}</p>
          <ul className="mt-3 border-y border-line">
            {LINES.map((line) => (
              <li key={line.id} className="border-t border-line first:border-t-0">
                <a
                  href={generateWhatsAppLink(line.e164, hello)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => playSound("tap")}
                  className="group flex min-h-14 items-center justify-between gap-4 py-3"
                >
                  <span className="flex items-center gap-3 text-[0.9375rem] text-fg">
                    <WhatsAppIcon className="size-4 shrink-0 text-fg-muted transition-colors group-hover:text-fg" />
                    {line.label[locale]}
                    <span className="sr-only">, {t.common.menu.opensWhatsApp}</span>
                  </span>
                  <span dir="ltr" className="font-mono text-[0.8125rem] tabular text-fg-muted transition-colors group-hover:text-fg">
                    {line.display}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </motion.div>
      </div>
    </Drawer>
  );
}
