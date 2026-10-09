"use client";

import { useSyncExternalStore, type MouseEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGroup, motion } from "motion/react";
import { useI18n } from "@/components/providers/i18n-provider";
import { scrollToTop } from "@/components/providers/smooth-scroll";
import { Logo } from "@/components/ui/logo";
import { useUI } from "@/lib/store/ui";
import { useActiveSection } from "@/lib/hooks/use-active-section";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { playSound } from "@/lib/sound";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, SECTION_IDS, isHomePath, sectionHref } from "./nav-items";
import { RegionSwitch } from "./region-switch";
import { LangSwitch } from "./lang-switch";
import { SoundToggle } from "./sound-toggle";
import { CartButton } from "./cart-button";
import { MobileNav, MOBILE_NAV_ID } from "./mobile-nav";

/** Scroll distance (px) after which the header gets its blurred ink bar and compacts. */
const SCROLLED_AT = 8;

function subscribeScroll(cb: () => void) {
  window.addEventListener("scroll", cb, { passive: true });
  return () => window.removeEventListener("scroll", cb);
}

function useScrolled() {
  return useSyncExternalStore(
    subscribeScroll,
    () => window.scrollY > SCROLLED_AT,
    () => false,
  );
}

/** Two hairlines, the lower one shorter (and on the start side in either direction). */
function MenuIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M4 9h16" />
      <path d="M4 15h10" />
    </svg>
  );
}

/**
 * Fixed site header. Transparent over the top of the page, a blurred ink bar
 * with a hairline once scrolled (and 72 → 60px tall). Section links in the middle
 * on large screens with an underline that follows the section in view; region,
 * language, sound and the order button at the end. Small screens get the
 * logo, the order button and a menu.
 */
export function SiteHeader() {
  const { locale, t } = useI18n();
  const pathname = usePathname();
  const isHome = isHomePath(pathname, locale);
  const scrolled = useScrolled();
  const active = useActiveSection(SECTION_IDS, isHome);
  const reduced = useReducedMotion();
  const navOpen = useUI((s) => s.navOpen);
  const setNavOpen = useUI((s) => s.setNavOpen);

  // Switching language keeps the reader on the same home section.
  const langHash = isHome && active && active !== "top" ? active : undefined;
  const ease = "duration-500 ease-out-expo";

  const onLogoClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (!isHome || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (window.location.hash) {
      window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    }
    scrollToTop();
  };

  return (
    // layoutRoot: the underline's layout animation is measured relative to this fixed bar, not the scrolling page.
    // Padded below the status bar when the page runs edge to edge (viewport-fit=cover, home-screen app).
    <motion.header
      layoutRoot
      data-scrolled={scrolled ? "" : undefined}
      className="fixed inset-x-0 top-0 z-40 pt-[env(safe-area-inset-top)]"
    >
      {/* Soft scrim keeps the controls legible over the hero before the bar appears. */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-[calc(6rem+env(safe-area-inset-top))] bg-linear-to-b from-ink-950/45 to-transparent transition-opacity",
          ease,
          scrolled ? "opacity-0" : "opacity-100",
        )}
      />
      {/* Its own near-opaque ink with a plain blur (no saturation boost, so photos scrolling under it don't
          smear colour into the bar). Faded in rather than transitioning the blur itself. */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 border-b border-line bg-ink-950/85 backdrop-blur-xl transition-opacity",
          ease,
          scrolled ? "opacity-100" : "opacity-0",
        )}
      />

      <div
        className={cn(
          "shell relative flex items-center justify-between gap-4 transition-[height] lg:grid lg:grid-cols-[1fr_auto_1fr] lg:gap-6",
          ease,
          scrolled ? "h-15" : "h-18",
        )}
      >
        <Link
          href={`/${locale}`}
          onClick={onLogoClick}
          className="-ms-2 inline-flex h-11 items-center rounded-full px-2 lg:justify-self-start"
        >
          <Logo />
        </Link>

        <nav aria-label={t.common.menu.sections} className="hidden lg:block">
          <LayoutGroup id="site-header-nav">
            <ul className="flex items-center">
              {NAV_ITEMS.map((item) => {
                const current = active === item.id;
                return (
                  <li key={item.id}>
                    <Link
                      href={sectionHref(locale, item.id)}
                      aria-current={current ? "true" : undefined}
                      className={cn(
                        "relative inline-flex h-10 items-center whitespace-nowrap px-3 text-[0.8125rem] font-medium tracking-[-0.005em] transition-colors duration-300 xl:px-3.5",
                        current ? "text-fg" : "text-fg-muted hover:text-fg",
                      )}
                    >
                      {t.common.nav[item.key]}
                      {current ? (
                        <motion.span
                          aria-hidden
                          layoutId="site-header-active"
                          initial={reduced ? false : { opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={
                            reduced
                              ? { duration: 0 }
                              : { layout: { type: "spring", stiffness: 380, damping: 34 }, opacity: { duration: 0.3 } }
                          }
                          className="absolute inset-x-3 bottom-1 h-px bg-glow xl:inset-x-3.5"
                        />
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </LayoutGroup>
        </nav>

        <div className="flex items-center justify-end gap-1 lg:justify-self-end">
          {/* Unmounted while the menu is open so its own copies are the only ones in the DOM. */}
          {navOpen ? null : (
            <>
              <RegionSwitch className="me-1 hidden lg:inline-flex" />
              <LangSwitch hash={langHash} className="hidden lg:inline-flex" />
            </>
          )}
          <SoundToggle className="hidden lg:inline-flex" />
          <span aria-hidden className="mx-1.5 hidden h-4 w-px bg-line-strong lg:block" />
          <CartButton className="lg:-me-2" />
          <button
            type="button"
            data-testid="menu-button"
            aria-label={t.common.actions.openMenu}
            aria-expanded={navOpen}
            aria-controls={MOBILE_NAV_ID}
            aria-haspopup="dialog"
            onClick={() => {
              setNavOpen(true);
              playSound("open");
            }}
            className="-me-2 inline-flex size-11 items-center justify-center rounded-full text-fg transition-colors duration-300 hover:bg-white/[0.05] lg:hidden"
          >
            <MenuIcon className="size-5 rtl:-scale-x-100" />
          </button>
        </div>
      </div>

      <MobileNav activeId={active} langHash={langHash} />
    </motion.header>
  );
}
