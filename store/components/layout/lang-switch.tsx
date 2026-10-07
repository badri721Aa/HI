"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Locale } from "@/types";
import { useI18n } from "@/components/providers/i18n-provider";
import { LOCALES } from "@/lib/i18n";
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
 * Link to the current page in the other language. Remembers the choice in
 * the `lang` cookie (read by proxy.ts for `/`). Pass `hash` to land on the
 * same home-page section after switching.
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
  const other: Locale = locale === "en" ? "ar" : "en";
  const href = localizedPath(pathname, other) + (hash ? `#${hash}` : "");

  return (
    <Link
      href={href}
      hrefLang={other}
      aria-label={t.common.actions.switchLanguageLabel}
      data-testid="lang-switch"
      onClick={() => {
        document.cookie = `lang=${other}; path=/; max-age=31536000; samesite=lax`;
        playSound("switch");
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
        // English pages don't carry the Arabic face in their font stack.
        className={other === "ar" ? "font-[family-name:var(--font-tajawal)] text-[1.08em] font-medium" : undefined}
      >
        {t.common.actions.switchLanguage}
      </span>
    </Link>
  );
}
