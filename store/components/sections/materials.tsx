"use client";

import { Thermometer } from "lucide-react";
import type { ColorOption, MaterialId, MaterialInfo } from "@/types";
import { MATERIALS, PRODUCTS } from "@/content/catalog";
import { useI18n } from "@/components/providers/i18n-provider";
import { SectionHeader } from "@/components/ui/section-header";
import { Reveal } from "@/components/motion/reveal";
import { Spotlight } from "@/components/motion/spotlight";
import { Tilt } from "@/components/motion/tilt";
import { fmt } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type ScoreKey = keyof MaterialInfo["scores"];
const SCORE_KEYS: ScoreKey[] = ["strength", "detail", "heat", "flex"];
const SCORE_MAX = 5;

/** Colours the catalog actually prints in each material, de-duplicated by hex. */
const SWATCHES = MATERIALS.reduce(
  (acc, m) => {
    const seen = new Set<string>();
    acc[m.id] = PRODUCTS.filter((p) => p.material === m.id)
      .flatMap((p) => p.colors)
      .filter((c) => {
        const key = c.hex.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    return acc;
  },
  {} as Record<MaterialId, ColorOption[]>,
);

const LEAD: MaterialId = "pla-matte";
/** Lead card first, whatever the catalog order. */
const ORDERED = [...MATERIALS].sort((a, b) => Number(b.id === LEAD) - Number(a.id === LEAD));

/* Static class maps so Tailwind sees every span. */
const MD_SPAN = { 3: "md:col-span-3", 6: "md:col-span-6" } as const;
const LG_SPAN = { 2: "lg:col-span-2", 3: "lg:col-span-3", 6: "lg:col-span-6" } as const;

/**
 * Bento placement on a 6-column grid, derived from the number of cells (the
 * materials plus the heat note) so it can never leave a hole.
 * md: the lead card spans the row, the rest pair up (an odd one out spans the row).
 * lg: the lead card takes the first half over two rows with two cards stacked
 * beside it; whatever is left shares the last rows, up to three per row.
 */
function bento(cells: number): string[] {
  const rest = cells - 1;
  const beside = rest >= 2 ? 2 : 0;
  const md = (i: number) => (i === 0 || (i === cells - 1 && rest % 2 === 1) ? MD_SPAN[6] : MD_SPAN[3]);

  // Leftovers after the lead and its two neighbours, in rows of at most three (4 → 2 + 2, 5 → 3 + 2).
  const left = rest - beside;
  const rows = Math.ceil(left / 3);
  const lg: string[] = [beside ? "lg:col-span-3 lg:row-span-2" : LG_SPAN[6], ...Array<string>(beside).fill(LG_SPAN[3])];
  for (let r = 0, placed = 0; r < rows; r++) {
    const inRow = Math.ceil((left - placed) / (rows - r));
    lg.push(...Array<string>(inRow).fill(LG_SPAN[(6 / inRow) as 2 | 3 | 6]));
    placed += inRow;
  }
  return lg.map((span, i) => cn(md(i), span));
}

/** The materials then the heat note. */
const PLACEMENT = bento(ORDERED.length + 1);

/** Card surface: hairline ring with a lit top edge; the ring strengthens on hover and the spotlight follows the cursor. */
const CARD =
  "relative h-full overflow-hidden rounded-2xl bg-ink-900 edge-light transition-shadow duration-300 " +
  "hover:shadow-[inset_0_1px_0_0_rgb(255_255_255/0.08),0_0_0_1px_var(--color-line-strong)]";

export function Materials() {
  const { t } = useI18n();
  const copy = t.home.materials;

  return (
    <section id="materials" aria-labelledby="materials-title" className="relative py-28 md:py-40">
      <div className="shell">
        <SectionHeader
          index="03"
          eyebrow={copy.eyebrow}
          title={copy.title}
          id="materials-title"
          aside={<p className="max-w-md text-[1.0625rem] leading-relaxed text-fg-muted">{copy.body}</p>}
        />

        <div className="mt-14 grid grid-cols-1 gap-3 md:mt-20 md:grid-cols-6 md:gap-4">
          {ORDERED.map((material, i) => (
            <Reveal key={material.id} delay={i * 0.06} className={cn("h-full", PLACEMENT[i])}>
              {material.id === LEAD ? (
                <Tilt max={4} className="h-full">
                  <MaterialCard material={material} lead />
                </Tilt>
              ) : (
                <MaterialCard material={material} />
              )}
            </Reveal>
          ))}

          <Reveal delay={ORDERED.length * 0.06} className={cn("@container/note h-full", PLACEMENT[ORDERED.length])}>
            {/* Wide (a full row): icon and text side by side; otherwise stacked, icon on top. */}
            <div
              className="relative flex h-full flex-col justify-between gap-5 overflow-hidden rounded-2xl p-6 edge-light md:p-7 @xl/note:flex-row @xl/note:items-center @xl/note:justify-start @xl/note:gap-6"
              style={{
                // Diagonal infill hatching, the way a slicer fills the inside of a part.
                backgroundImage:
                  "repeating-linear-gradient(135deg, rgb(255 255 255 / 0.028) 0 1px, transparent 1px 11px)",
              }}
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-ink-900 text-silver ring-1 ring-line-strong">
                <Thermometer aria-hidden strokeWidth={1.5} className="size-5" />
              </span>
              <p className="max-w-md text-base leading-relaxed text-fg">{copy.heatNote}</p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function MaterialCard({ material, lead = false }: { material: MaterialInfo; lead?: boolean }) {
  const { t, locale } = useI18n();
  const copy = t.home.materials;
  const swatches = SWATCHES[material.id];

  return (
    <Spotlight className={cn(CARD, lead ? "p-6 md:p-8 lg:p-10" : "p-6 md:p-7")}>
      {/*
        Lead card layout. Small: stacked. md (full-width card): copy and meters on the
        start side, layer preview on the end side. lg (tall card): copy, preview, meters.
      */}
      <div
        className={cn(
          "flex h-full flex-col",
          lead &&
            "md:grid md:grid-cols-2 md:grid-rows-[auto_minmax(0,1fr)] md:gap-x-10 lg:grid-cols-1 lg:grid-rows-[auto_minmax(0,1fr)_auto]",
        )}
      >
        <div className={cn("flex flex-col", lead && "md:col-start-1 md:row-start-1")}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h3
              className={cn(
                "font-semibold tracking-[-0.025em] text-fg",
                lead ? "text-[1.75rem] leading-tight md:text-[2.125rem]" : "text-xl md:text-[1.375rem]",
              )}
            >
              {material.name[locale]}
            </h3>
            <p className="shrink-0 font-mono text-xs text-fg-muted rtl:font-sans rtl:text-sm">
              {fmt(copy.softens, { n: material.heatC })}
            </p>
          </div>
          <p
            className={cn(
              "mt-3 leading-relaxed text-fg-muted",
              lead ? "max-w-md text-base md:text-[1.0625rem]" : "text-[0.9375rem]",
            )}
          >
            {material.summary[locale]}
          </p>
        </div>

        {lead ? (
          // The preview is absolutely positioned so it never inflates the bento rows; it fills whatever space the grid gives it.
          <div className="relative hidden min-h-52 text-silver md:col-start-2 md:row-span-2 md:row-start-1 md:block lg:col-start-1 lg:row-span-1 lg:row-start-2 lg:my-8 lg:min-h-40">
            <LayerPreview className="absolute inset-0 size-full" />
          </div>
        ) : null}

        <div
          className={cn(
            "flex flex-col",
            lead ? "mt-8 md:col-start-1 md:row-start-2 md:self-end lg:row-start-3 lg:mt-0" : "mt-auto pt-7",
          )}
        >
          <div className="grid gap-2.5">
            {SCORE_KEYS.map((key) => (
              <Meter key={key} label={copy.scores[key]} value={material.scores[key]} />
            ))}
          </div>

          {swatches.length ? (
            <div className="mt-5 flex justify-end border-t border-line pt-4">
              <ul aria-label={fmt(t.home.collection.colours, { n: swatches.length })} className="flex -space-x-1">
                {swatches.map((c) => (
                  <li
                    key={c.id}
                    title={c.name[locale]}
                    className="size-3.5 rounded-full ring-2 ring-ink-900"
                    style={{ backgroundColor: c.hex }}
                  >
                    <span className="sr-only">{c.name[locale]}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </Spotlight>
  );
}

/** Five segments like a slicer setting: filled in silver, empty in ink. */
function Meter({ label, value }: { label: string; value: number }) {
  const filled = Math.max(0, Math.min(SCORE_MAX, Math.round(value)));
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={SCORE_MAX}
      aria-valuenow={filled}
      aria-valuetext={`${filled} / ${SCORE_MAX}`}
      className="flex items-center justify-between gap-4"
    >
      <span className="text-sm text-fg-muted">{label}</span>
      {/* Fills from the start edge, so it mirrors in Arabic like the rest of the layout. */}
      <span className="flex gap-1">
        {Array.from({ length: SCORE_MAX }, (_, i) => (
          <span key={i} className={cn("h-1.5 w-5 rounded-[2px]", i < filled ? "bg-silver" : "bg-ink-600")} />
        ))}
      </span>
    </div>
  );
}

/*
 * A slicer-style preview: horizontal layer lines tracing a vase profile.
 * Pure decoration, computed once.
 */
const LAYERS = 30;
/** Vase profile as (height fraction, radius fraction) control points: foot, belly, neck, flared lip. */
const PROFILE: [number, number][] = [
  [0, 0.42],
  [0.08, 0.52],
  [0.38, 0.8],
  [0.72, 0.5],
  [0.86, 0.44],
  [1, 0.56],
];
function radiusAt(t: number) {
  for (let k = 1; k < PROFILE.length; k++) {
    const [t1, r1] = PROFILE[k];
    if (t <= t1) {
      const [t0, r0] = PROFILE[k - 1];
      const u = (t - t0) / (t1 - t0);
      return r0 + (r1 - r0) * (1 - Math.cos(Math.PI * u)) * 0.5;
    }
  }
  return PROFILE[PROFILE.length - 1][1];
}
const PREVIEW_LINES = Array.from({ length: LAYERS }, (_, i) => {
  const t = i / (LAYERS - 1);
  const half = radiusAt(t) * 46;
  return {
    x1: Number((50 - half).toFixed(2)),
    x2: Number((50 + half).toFixed(2)),
    y: Number((96 - t * 92).toFixed(2)),
    major: i % 5 === 0,
  };
});

function LayerPreview({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" aria-hidden className={className}>
      {PREVIEW_LINES.map((l, i) => (
        <line
          key={i}
          x1={l.x1}
          x2={l.x2}
          y1={l.y}
          y2={l.y}
          stroke="currentColor"
          strokeOpacity={l.major ? 0.7 : 0.3}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}
