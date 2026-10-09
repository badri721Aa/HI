"use client";

import { usePathname } from "next/navigation";
import type { Locale } from "@/types";
import { useI18n } from "@/components/providers/i18n-provider";
import { LOCALES } from "@/lib/i18n";
import { useUI } from "@/lib/store/ui";
import { playSound } from "@/lib/sound";
import { cn } from "@/lib/utils";

/** Same page in another locale: `/en/products/x` → `/ar/products/x`. */
export function localizedPath(pathname: string | null, to: Locale): string {
  const parts = (pathname ?? "/").split("/");
  if ((LOCALES as readonly string[]).includes(parts[1] ?? "")) {
    parts[1] = to;
    const path = parts.join("/");
    return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  }
  return `/${to}`;
}

/**
 * Link to the current page in the other language. A plain link on purpose:
 * the switch loads a fresh document, so <html lang/dir>, fonts and client
 * state start over, and the old language's tree (with its WebGL canvas)
 * isn't kept alive in a hidden Activity as a client navigation would.
 * Remembers the choice in the `lang` cookie (read by proxy.ts for `/`).
 * Pass `hash` to land on the same home-page section after switching.
 */
export function LangSwitch({
  className,
  hash,
  variant = "inline",
}: {
  className?: string;
  /** Section id to keep in view, e.g. the active one on the home page. */
  hash?: string;
  variant?: "inline" | "pill";
}) {
  const { locale, t } = useI18n();
  const pathname = usePathname();
  const setNavOpen = useUI((s) => s.setNavOpen);
  const other: Locale = locale === "en" ? "ar" : "en";
  const href = localizedPath(pathname, other) + (hash ? `#${hash}` : "");

  return (
    <a
      href={href}
      hrefLang={other}
      data-testid="lang-switch"
      onClick={() => {
        document.cookie = `lang=${other}; path=/; max-age=31536000; samesite=lax`;
        playSound("switch");
        // A page restored from the back/forward cache shouldn't come back with the menu open.
        setNavOpen(false);
      }}
      className={cn(
        "inline-flex items-center justify-center rounded-full transition-colors duration-300",
        variant === "pill"
          ? "h-11 border border-line px-5 text-[0.9375rem] text-fg hover:border-line-strong hover:bg-white/[0.04]"
          : "relative h-9 px-3 text-[0.8125rem] text-fg-muted hover:text-fg before:absolute before:inset-x-0 before:-inset-y-1 before:content-['']",
        className,
      )}
    >
      <span
        lang={other}
        dir={other === "ar" ? "rtl" : "ltr"}
        className={cn(
          // English pages don't carry the Arabic face in their font stack. Tajawal's tall ascent lifts its
          // letters above the centre line of the neighbouring Latin controls, so it is set a little lower.
          other === "ar" && "translate-y-px font-[family-name:var(--font-tajawal)] text-[1.08em] font-medium leading-none",
        )}
      >
        {t.common.actions.switchLanguage}
      </span>
      {/* The accessible name starts with the visible label (voice control), then says what it does. */}
      <span className="sr-only"> ({t.common.actions.switchLanguageLabel})</span>
    </a>
  );
}
