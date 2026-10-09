"use client";

import { useId } from "react";
import { motion } from "motion/react";
import { REGIONS, type Region } from "@/types";
import { useI18n } from "@/components/providers/i18n-provider";
import { usePrefs } from "@/lib/store/prefs";
import { useRegion } from "@/lib/hooks/use-region";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { CURRENCY_LABEL, currencyForRegion } from "@/lib/currency";
import { playSound } from "@/lib/sound";
import { cn } from "@/lib/utils";

/**
 * Bahrain / UAE segmented control; switching re-prices the whole site and
 * routes orders to that region's WhatsApp line. The compact header version
 * shows the currency codes (BHD, AED) in mono, with the region names in each
 * option's label and a hover tooltip spelling out the current choice. The
 * large menu version names the region next to its code ("Bahrain BHD").
 */
export function RegionSwitch({ size = "sm", className }: { size?: "sm" | "lg"; className?: string }) {
  const { t, locale } = useI18n();
  const region = useRegion();
  const setRegion = usePrefs((s) => s.setRegion);
  const reduced = useReducedMotion();
  const pillId = useId();
  const large = size === "lg";

  const choose = (r: Region) => {
    // Re-selecting the current region still marks it as the visitor's own choice (geo never overrides it).
    setRegion(r, true);
    if (r !== region) playSound("switch");
  };

  return (
    <div className={cn("group/region relative inline-flex", className)}>
      <div
        role="group"
        aria-label={t.common.region.label}
        data-testid="region-switch"
        className={cn(
          "relative inline-flex items-center rounded-full border border-line bg-ink-950/40 p-0.5",
          large && "p-1",
        )}
      >
        {REGIONS.map((r) => {
          const selected = r === region;
          const currency = currencyForRegion(r);
          return (
            <button
              key={r}
              type="button"
              data-testid={`region-${r}`}
              aria-pressed={selected}
              // The large variant names the region on screen; the compact one shows only the code.
              aria-label={large ? undefined : `${t.common.region[r]} · ${CURRENCY_LABEL[currency][locale]}`}
              onClick={() => choose(r)}
              className={cn(
                "relative isolate inline-flex items-center justify-center rounded-full transition-colors duration-300",
                large
                  ? "h-11 min-w-[4.75rem] gap-2 px-4 text-sm"
                  : "h-8 min-w-[3.25rem] px-3 font-mono text-[0.6875rem] uppercase tracking-[0.1em] tabular",
                // Grow the hit area to 44px tall without changing the compact look.
                !large && "before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-['']",
                selected ? "text-fg" : "text-fg-muted hover:text-fg",
              )}
            >
              {selected ? (
                <motion.span
                  aria-hidden
                  layoutId={`region-pill-${pillId}`}
                  transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 36 }}
                  className="absolute inset-0 -z-10 rounded-full bg-white/[0.07] shadow-[inset_0_1px_0_0_rgb(255_255_255/0.06)] ring-1 ring-line-strong"
                />
              ) : null}
              {large ? <span>{t.common.region[r]}</span> : null}
              <span
                dir="ltr"
                className={cn(large && "font-mono text-[0.6875rem] tracking-[0.1em] tabular", large && !selected && "text-fg-subtle")}
              >
                {currency}
              </span>
            </button>
          );
        })}
      </div>

      {large ? null : (
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-x-0 top-full mx-auto mt-2.5 w-max whitespace-nowrap rounded-md border border-line bg-ink-800/95 px-2.5 py-1.5 text-xs text-fg-muted shadow-[0_8px_24px_-12px_rgb(0_0_0/0.8)]",
            "translate-y-1 opacity-0 transition-[opacity,translate] delay-0 duration-200 ease-out-expo",
            "group-hover/region:translate-y-0 group-hover/region:opacity-100 group-hover/region:delay-300",
            "group-has-[:focus-visible]/region:translate-y-0 group-has-[:focus-visible]/region:opacity-100",
          )}
        >
          {t.common.region.label} <span className="text-fg">{t.common.region[region]}</span>
        </span>
      )}
    </div>
  );
}
