"use client";

import { useEffect, type ReactNode } from "react";
import type { Locale } from "@/types";
import { I18nProvider } from "@/components/providers/i18n-provider";
import { SmoothScroll } from "@/components/providers/smooth-scroll";
import { useCart } from "@/lib/store/cart";
import { usePrefs } from "@/lib/store/prefs";
import { countryToRegion } from "@/lib/geo";

function readGeoCookie(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)geo_country=([A-Za-z]{2})/);
  return match ? match[1] : null;
}

/**
 * Client-side app state: translations, smooth scroll, persisted stores, and a
 * one-time region guess (from the geo cookie set by proxy.ts, or /api/region)
 * for visitors who haven't picked Bahrain or the UAE themselves.
 */
export function AppProviders({ locale, children }: { locale: Locale; children: ReactNode }) {
  useEffect(() => {
    let cancelled = false;
    void useCart.persist.rehydrate();
    void Promise.resolve(usePrefs.persist.rehydrate()).then(async () => {
      if (cancelled || usePrefs.getState().region) return;
      let country = readGeoCookie();
      if (!country) {
        try {
          const res = await fetch("/api/region", { cache: "no-store" });
          if (res.ok) country = ((await res.json()) as { country: string | null }).country;
        } catch {
          // Offline or blocked: Bahrain stays the default.
        }
      }
      if (!cancelled && !usePrefs.getState().region) usePrefs.getState().setRegion(countryToRegion(country), false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <I18nProvider locale={locale}>
      <SmoothScroll>{children}</SmoothScroll>
    </I18nProvider>
  );
}
