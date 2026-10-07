"use client";

import { LayoutGroup, motion } from "motion/react";
import { create } from "zustand";
import type { CategoryId } from "@/types";
import { CATEGORIES, PRODUCTS } from "@/content/catalog";
import { useI18n } from "@/components/providers/i18n-provider";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { playSound } from "@/lib/sound";
import { cn } from "@/lib/utils";

export type CollectionFilter = "all" | CategoryId;

/**
 * The collection's active category. A tiny store rather than local state so
 * links elsewhere (the product page breadcrumb) can pre-select a category
 * before navigating home, and the choice survives a round trip to a product
 * page. Never written during render, so server and first client render both
 * read "all".
 */
export const useCollectionFilter = create<{ filter: CollectionFilter; setFilter: (filter: CollectionFilter) => void }>()(
  (set) => ({
    filter: "all",
    setFilter: (filter) => set({ filter }),
  }),
);

/** Categories that have at least one product, with their counts. */
const OPTIONS: { id: CollectionFilter; count: number }[] = [
  { id: "all", count: PRODUCTS.length },
  ...CATEGORIES.map((c) => ({ id: c.id, count: PRODUCTS.filter((p) => p.category === c.id).length })).filter(
    (c) => c.count > 0,
  ),
];

/**
 * Category toggles: "All" plus every category in the catalog. Toggle buttons
 * (aria-pressed) with a pill that glides to the active one. Scrolls
 * sideways on phones without a visible scrollbar.
 */
export function FilterBar({
  value,
  onChange,
  className,
}: {
  value: CollectionFilter;
  onChange: (filter: CollectionFilter) => void;
  className?: string;
}) {
  const { t, locale } = useI18n();
  const reduced = useReducedMotion();

  const label = (id: CollectionFilter) =>
    id === "all" ? t.home.collection.all : (CATEGORIES.find((c) => c.id === id)?.name[locale] ?? id);

  return (
    <LayoutGroup id="collection-filter">
      <div
        role="group"
        aria-label={t.home.collection.filterLabel}
        className={cn(
          // Vertical padding keeps the 44px hit areas and focus rings inside the scroll box (it clips both).
          "-my-1.5 flex items-center gap-1 overflow-x-auto py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          className,
        )}
      >
        {OPTIONS.map((option) => {
          const selected = option.id === value;
          return (
            <button
              key={option.id}
              type="button"
              data-testid={`filter-${option.id}`}
              aria-pressed={selected}
              onClick={(e) => {
                if (selected) return;
                onChange(option.id);
                playSound("tap");
                // On phones the row scrolls: bring the chosen pill toward the middle (it is already in view vertically).
                e.currentTarget.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "nearest", inline: "center" });
              }}
              className={cn(
                "relative isolate inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-4 text-sm font-medium transition-colors duration-300",
                // 44px tall hit area without the visual bulk.
                "before:absolute before:inset-x-0 before:-inset-y-0.5 before:content-['']",
                selected ? "text-fg" : "text-fg-muted hover:text-fg",
              )}
            >
              {selected ? (
                <motion.span
                  aria-hidden
                  layoutId="collection-filter-pill"
                  transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 36 }}
                  className="absolute inset-0 -z-10 rounded-full bg-white/[0.07] shadow-[inset_0_1px_0_0_rgb(255_255_255/0.06)] ring-1 ring-line-strong"
                />
              ) : null}
              <span>{label(option.id)}</span>
              <span
                aria-hidden
                className={cn(
                  "font-mono text-[0.625rem] tabular transition-colors duration-300",
                  selected ? "text-fg-muted" : "text-fg-muted/70",
                )}
              >
                {option.count}
              </span>
            </button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}
