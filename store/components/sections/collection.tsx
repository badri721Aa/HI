"use client";

import Link from "next/link";
import { AnimatePresence, motion, type Transition } from "motion/react";
import { ArrowRight } from "lucide-react";
import { PRODUCTS } from "@/content/catalog";
import { useI18n } from "@/components/providers/i18n-provider";
import { SectionHeader } from "@/components/ui/section-header";
import { Reveal } from "@/components/motion/reveal";
import { ProductCard } from "@/components/commerce/product-card";
import { FilterBar, useCollectionFilter } from "@/components/commerce/filter-bar";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { fmt, type Dictionary } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** The large editorial card under "All": the catalog's featured piece (it needs a photo). */
const FEATURED = PRODUCTS.find((p) => p.featured && p.images.length > 0);
const ALL = FEATURED ? [FEATURED, ...PRODUCTS.filter((p) => p !== FEATURED)] : PRODUCTS;

/** "1 piece", "2 pieces", "5 pieces" (Arabic: واحدة / قطعتان / 3–10 قطع / 11+ قطعة). */
function piecesLabel(n: number, copy: Dictionary["home"]["collection"]) {
  if (n === 1) return copy.countOne;
  if (n === 2) return copy.countTwo;
  return fmt(n > 10 ? copy.countMany : copy.count, { n });
}

/* Static class maps so Tailwind sees every span the custom tile can take. */
const SPAN_2COL = { 1: "col-span-1", 2: "col-span-2" } as const;
const SPAN_3COL = { 1: "lg:col-span-1", 2: "lg:col-span-2", 3: "lg:col-span-3" } as const;

const LAYOUT: Transition = { type: "spring", stiffness: 300, damping: 34, mass: 0.9 };
const EXIT: Transition = { duration: 0.2, ease: [0.4, 0, 1, 1] };

/**
 * 01 — Collection. Category toggles with a live count, then the grid.
 *
 * "All" on large screens is an editorial 3-column grid: the featured piece
 * is a large card over 2×2 cells, the rest fill around it, and the last cell
 * is a "custom print" tile. Phones and tablets use 2 columns with the feature
 * card full width. With a category selected the grid is plain. The custom
 * tile always comes last and stretches to close the final row.
 *
 * Filtering: cards that stay glide to their new cells (layout position),
 * cards that leave fade out of the flow (popLayout), new ones reveal in.
 */
export function Collection() {
  const { t } = useI18n();
  const copy = t.home.collection;
  const filter = useCollectionFilter((s) => s.filter);
  const setFilter = useCollectionFilter((s) => s.setFilter);
  const reduced = useReducedMotion();

  const editorial = filter === "all" && FEATURED !== undefined;
  const products = filter === "all" ? ALL : PRODUCTS.filter((p) => p.category === filter);
  const n = products.length;

  // Cells taken before the custom tile: the feature card counts 2 cells on 2 columns, 4 on 3 columns.
  const used2 = editorial ? n + 1 : n;
  const used3 = editorial ? n + 3 : n;
  const tile2 = used2 % 2 === 0 ? 2 : 1;
  const tile3 = (3 - (used3 % 3)) as 1 | 2 | 3;

  const motionProps = {
    layout: reduced ? false : ("position" as const),
    initial: false as const,
    animate: { opacity: 1, scale: 1 },
    exit: reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, scale: 0.97, transition: EXIT },
    transition: { layout: LAYOUT },
  };

  return (
    <section id="collection" aria-labelledby="collection-title" className="relative py-28 md:py-40">
      <div className="shell">
        <Reveal>
          <SectionHeader index="01" eyebrow={copy.eyebrow} title={copy.title} body={copy.body} id="collection-title" />
        </Reveal>

        <Reveal delay={0.08} className="mt-12 flex items-center gap-3 border-b border-line pb-4 md:mt-16">
          <FilterBar
            value={filter}
            onChange={setFilter}
            className={cn(
              // Phones: bleed to the screen edge and fade out before the count.
              "-ms-4 min-w-0 flex-1 ps-4 pe-8 md:-ms-1.5 md:ps-1.5 md:pe-1.5",
              "max-md:[mask-image:linear-gradient(to_right,black_calc(100%-2.5rem),transparent)]",
              "max-md:rtl:[mask-image:linear-gradient(to_left,black_calc(100%-2.5rem),transparent)]",
            )}
          />
          <p aria-live="polite" className="shrink-0 font-mono text-xs text-fg-muted tabular">
            {piecesLabel(n, copy)}
          </p>
        </Reveal>

        {n === 0 ? <p className="mt-10 text-fg-muted">{copy.empty}</p> : null}

        <ul className="relative mt-10 grid grid-cols-2 gap-x-3 gap-y-10 sm:gap-x-5 md:mt-12 lg:grid-cols-3 lg:gap-x-6 lg:gap-y-14">
          <AnimatePresence mode="popLayout" initial={false}>
            {products.map((product, i) => {
              const feature = editorial && i === 0;
              return (
                <motion.li
                  // The feature card swaps to a new element (fade) instead of morphing between sizes.
                  key={feature ? `${product.slug}:feature` : product.slug}
                  {...motionProps}
                  className={feature ? "col-span-2 lg:row-span-2" : "col-span-1"}
                >
                  <Reveal delay={Math.min(i, 5) * 0.06} className="h-full">
                    <ProductCard product={product} variant={feature ? "feature" : "default"} />
                  </Reveal>
                </motion.li>
              );
            })}
            <motion.li key="custom-tile" {...motionProps} className={cn(SPAN_2COL[tile2 as 1 | 2], SPAN_3COL[tile3])}>
              <Reveal delay={Math.min(n, 5) * 0.06} className="h-full">
                <CustomTile />
              </Reveal>
            </motion.li>
          </AnimatePresence>
        </ul>
      </div>
    </section>
  );
}

/*
 * The tile's drawing: a dome being printed, as slicer layer lines. The lower
 * layers are done (solid), the current one is the hot cyan layer, the rest
 * are still to print (dashed, faint). Computed once.
 */
const ART_LAYERS = 22;
const ART_DONE = 11;
const ART_LINES = Array.from({ length: ART_LAYERS }, (_, i) => {
  const t = i / ART_LAYERS;
  const half = 44 * Math.sqrt(Math.max(0, 1 - t ** 2.4));
  return {
    x1: Number((50 - half).toFixed(2)),
    x2: Number((50 + half).toFixed(2)),
    y: Number((94 - t * 88).toFixed(2)),
    state: i < ART_DONE ? "done" : i === ART_DONE ? "hot" : "todo",
  } as const;
});

function PrintArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" aria-hidden className={className}>
      {/* Build plate */}
      <line x1="2" x2="98" y1="98" y2="98" stroke="currentColor" strokeOpacity={0.25} strokeWidth={1} vectorEffect="non-scaling-stroke" />
      {ART_LINES.map((l, i) => (
        <line
          key={i}
          x1={l.x1}
          x2={l.x2}
          y1={l.y}
          y2={l.y}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          className={cn(
            "transition-[stroke-opacity] duration-500 ease-out-expo",
            l.state === "hot" && "stroke-glow",
            l.state === "done" && "stroke-current",
            l.state === "todo" && "stroke-current [stroke-dasharray:1.5_3] group-hover/tile:[stroke-opacity:0.42]",
          )}
          strokeOpacity={l.state === "done" ? 0.62 : l.state === "hot" ? 1 : 0.22}
        />
      ))}
    </svg>
  );
}

/**
 * "Don't see it? We'll print it." An empty slot on the build plate: dashed
 * outline over infill hatching, the half-printed dome, and a link to the
 * custom print form. Narrow (phone grid cell): title and link only. Wide
 * (a full row): text and drawing side by side.
 */
function CustomTile() {
  const { t, locale } = useI18n();
  const copy = t.home.collection.customTile;

  return (
    <div
      className="group/tile @container/tile relative h-full min-h-60 overflow-hidden rounded-2xl bg-ink-900"
      style={{
        // Diagonal infill hatching, the same motif as the logo mark and the materials heat note.
        backgroundImage: "repeating-linear-gradient(135deg, rgb(255 255 255 / 0.028) 0 1px, transparent 1px 11px)",
      }}
    >
      {/* Dashed outline, inset half a pixel so the stroke isn't clipped. */}
      <svg aria-hidden className="pointer-events-none absolute inset-[0.5px] size-[calc(100%-1px)] overflow-visible">
        <rect
          width="100%"
          height="100%"
          rx="15.5"
          fill="none"
          stroke="currentColor"
          strokeWidth={1}
          strokeDasharray="5 6"
          className="text-line-strong transition-colors duration-500 ease-out-expo group-hover/tile:text-platinum/60"
        />
      </svg>

      <div className="relative grid h-full grid-rows-[auto_minmax(0,1fr)_auto] p-5 @xs/tile:p-7 @lg/tile:grid-cols-[minmax(0,1fr)_11rem] @lg/tile:grid-rows-[auto_minmax(0,1fr)] @lg/tile:gap-x-8">
        <p className="eyebrow">{t.commerce.custom.eyebrow}</p>

        <div className="relative my-6 hidden min-h-28 text-silver @3xs/tile:block @lg/tile:col-start-2 @lg/tile:row-span-2 @lg/tile:row-start-1 @lg/tile:my-0">
          <PrintArt className="absolute inset-0 size-full" />
        </div>

        <div className="mt-6 self-end @3xs/tile:mt-0 @lg/tile:col-start-1 @lg/tile:row-start-2 @lg/tile:pt-8">
          <h3 className="max-w-[18ch] text-lg font-semibold leading-tight tracking-[-0.025em] text-fg @xs/tile:text-2xl">
            {copy.title}
          </h3>
          <p className="mt-2.5 hidden max-w-sm text-[0.9375rem] leading-relaxed text-fg-muted @3xs/tile:block">{copy.body}</p>
          <Link
            href={`/${locale}#custom`}
            className={cn(
              "mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-fg outline-none",
              "after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus-visible:after:outline-2 focus-visible:after:outline-offset-4 focus-visible:after:outline-glow",
            )}
          >
            {copy.cta}
            <ArrowRight
              aria-hidden
              strokeWidth={1.5}
              className="size-4 transition-transform duration-300 ease-out-expo group-hover/tile:translate-x-0.5 rtl:-scale-x-100 rtl:group-hover/tile:-translate-x-0.5"
            />
          </Link>
        </div>
      </div>
    </div>
  );
}
