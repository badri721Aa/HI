"use client";

import { useEffect, type ReactNode } from "react";
import { MotionConfig } from "motion/react";
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

const persisted = [useCart, usePrefs] as const;

/**
 * Client-side app state: translations, smooth scroll, persisted stores, and a
 * one-time region guess (from the geo cookie set by proxy.ts, or /api/region)
 * for visitors who haven't picked Bahrain or the UAE themselves.
 *
 * The stores follow other tabs: a product opened in a new tab and added
 * there must not be wiped by the next add in this one.
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

    const onStorage = (e: StorageEvent) => {
      for (const store of persisted) {
        if (e.key === null || e.key === store.persist.getOptions().name) void store.persist.rehydrate();
      }
    };
    // Belt and braces for browsers that throttle storage events in background tabs.
    const onVisible = () => {
      if (document.visibilityState === "visible") for (const store of persisted) void store.persist.rehydrate();
    };
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return (
    // Under prefers-reduced-motion, motion skips transform and layout animations everywhere (drawers, toasts, pills).
    <MotionConfig reducedMotion="user">
      <I18nProvider locale={locale}>
        <SmoothScroll>{children}</SmoothScroll>
      </I18nProvider>
    </MotionConfig>
  );
}
