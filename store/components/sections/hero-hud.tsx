"use client";

import type { ReactNode } from "react";
import { useI18n } from "@/components/providers/i18n-provider";
import { MATERIALS } from "@/content/catalog";
import { SHOWCASE } from "@/content/showcase";
import { fmt } from "@/lib/i18n";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { usePrintState } from "@/lib/store/print";
import { cn } from "@/lib/utils";

/*
 * The hero prints the Ripple Vase; the readout uses its catalog print settings
 * when that product exists, and falls back to PLA Matte at 0.20 mm otherwise,
 * so editing the catalog can never break the hero.
 */
const PIECE = SHOWCASE.vase;
const MATERIAL =
  MATERIALS.find((m) => m.id === PIECE?.material) ?? MATERIALS.find((m) => m.id === "pla-matte") ?? MATERIALS[0] ?? null;
const LAYER_HEIGHT_MM = PIECE?.layerHeight ?? 0.2;
const NOZZLE_C = 210;

const selectProgress = (s: { progress: number }) => s.progress;
const selectLayer = (s: { layer: number }) => s.layer;
const selectTotalLayers = (s: { totalLayers: number }) => s.totalLayers;
const selectMinutesLeft = (s: { minutesLeft: number }) => s.minutesLeft;

/**
 * Slicer-style readout for the hero print. Values come from usePrintState,
 * which the 3D scene writes at ~10 Hz; only this component re-renders.
 * With reduced motion the scene shows the finished piece, so does this.
 * The whole readout is a simulation, so it is hidden from assistive tech.
 *
 * Phones get a one-line strip across the bottom of the print box (the scene
 * then frames the piece above it); larger screens get the full card. Sizes
 * are in px, not rem: the Arabic root font is larger, and the scene frames
 * itself around this element's footprint.
 */
export function HeroHud({ className }: { className?: string }) {
  const { t, locale } = useI18n();
  const hud = t.home.hero.hud;
  const units = t.common.units;

  const reduced = useReducedMotion();
  const liveProgress = usePrintState(selectProgress);
  const liveLayer = usePrintState(selectLayer);
  const totalLayers = usePrintState(selectTotalLayers);
  const liveMinutesLeft = usePrintState(selectMinutesLeft);
  const progress = reduced ? 1 : liveProgress;
  const layer = reduced ? totalLayers : liveLayer;
  const minutesLeft = reduced ? 0 : liveMinutesLeft;

  const complete = progress >= 0.999;
  const total = Math.max(1, Math.round(totalLayers));
  const digits = String(total).length;
  const currentLayer = Math.min(total, Math.max(0, Math.round(layer)));
  const mins = Math.max(0, Math.round(minutesLeft));
  const timeLeft = fmt(hud.time, { h: Math.floor(mins / 60), m: String(mins % 60).padStart(2, "0") });
  const fill = Math.min(1, Math.max(0, progress));

  const status = (
    <span className="flex shrink-0 items-center gap-2 text-fg rtl:font-sans">
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-full transition-colors duration-300",
          complete ? "bg-ok" : "bg-glow shadow-[0_0_6px_1px_var(--color-glow)]",
        )}
      />
      {complete ? hud.complete : hud.printing}
    </span>
  );
  const percent = (
    <span className="tabular shrink-0 text-fg-muted" dir="ltr">
      {Math.round(fill * 100)}%
    </span>
  );
  const layerCount = (
    <span dir="ltr">
      {String(currentLayer).padStart(digits, "0")}
      <span className="text-fg-muted">/{total}</span>
    </span>
  );

  return (
    <div
      aria-hidden="true"
      className={cn(
        "glass rounded-xl px-3 py-2.5 font-mono text-[11px] leading-4 text-fg-muted shadow-[0_18px_40px_-24px_rgb(0_0_0/0.9)] sm:w-[248px] sm:p-3.5 sm:text-xs",
        className,
      )}
    >
      {/* Phones: status, progress bar and layer count on one line. */}
      <div className="flex items-center gap-3 sm:hidden">
        {status}
        {percent}
        <Bar fill={fill} className="min-w-6 flex-1" />
        <span className="tabular shrink-0 text-fg">{layerCount}</span>
      </div>

      <div className="hidden sm:block">
        <div className="flex items-center justify-between gap-3">
          {status}
          {percent}
        </div>

        <dl className="mt-2.5 grid gap-1 border-t border-line pt-2.5">
          <Row label={hud.layer}>{layerCount}</Row>
          {/* Values with Arabic units follow the page direction, like the rest of the Arabic copy. */}
          <Row label={hud.layerHeight}>
            {LAYER_HEIGHT_MM.toFixed(2)} {units.mm}
          </Row>
          <Row label={hud.nozzle}>
            {NOZZLE_C}
            {units.celsius}
          </Row>
          {MATERIAL ? <Row label={hud.material}>{MATERIAL.name[locale]}</Row> : null}
          <Row label={hud.timeLeft}>{timeLeft}</Row>
        </dl>

        <Bar fill={fill} className="mt-3" />
      </div>
    </div>
  );
}

function Bar({ fill, className }: { fill: number; className?: string }) {
  return (
    <div className={cn("h-0.5 overflow-hidden rounded-full bg-line", className)}>
      <div
        className="h-full origin-left rounded-full bg-glow transition-transform duration-150 ease-linear rtl:origin-right motion-reduce:transition-none"
        style={{ transform: `scaleX(${fill})` }}
      />
    </div>
  );
}

function Row({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3", className)}>
      {/* Arabic labels use the sans face: the mono face's wide spaces break up Arabic words. */}
      <dt className="truncate rtl:font-sans">{label}</dt>
      <dd className="tabular shrink-0 text-fg">{children}</dd>
    </div>
  );
}
