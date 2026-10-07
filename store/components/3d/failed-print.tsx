"use client";

import dynamic from "next/dynamic";
import { SHOWCASE } from "@/content/showcase";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";
import { ProductSilhouette } from "./silhouette";
import { ThreeBoundary } from "./scenes/three-boundary";
import { FAILED_CLIP, FAILED_TANGLE } from "./scenes/failed-tangle";
import { useWebGLSupport } from "./webgl-support";

/* The scene (three.js) loads only when WebGL is available. */
const FailedView = dynamic(() => import("./scenes/failed-view").then((m) => m.FailedView), { ssr: false });

const PIECE = SHOWCASE.vase;

/**
 * 404 illustration: a print that came loose, a tangle of "spaghetti"
 * filament floating over a half-printed vase, drifting gently (still with
 * reduced motion). Fills its positioned parent.
 *
 * Without WebGL: the same scene as a drawing.
 */
export function FailedPrint({ className }: { className?: string }) {
  const supported = useWebGLSupport();
  const reduced = useReducedMotion();

  if (supported === null) return <div className={className} />;
  const fallback = <FailedFallback className={className} />;
  if (!supported) return fallback;
  return (
    <ThreeBoundary fallback={fallback}>
      <FailedView reduced={reduced} className={className} />
    </ThreeBoundary>
  );
}

/*
 * The nest, projected onto the silhouette's 0 0 100 100 box (front view, 40
 * units per model unit). The drawing has no hotend, so the strand starts
 * where it reaches the nest.
 */
const STRAND = FAILED_TANGLE.points
  .slice(7)
  .map(([x, y], i) => `${i ? "L" : "M"}${(50 + x * 40).toFixed(2)} ${(94 - y * 40).toFixed(2)}`)
  .join("");

function FailedFallback({ className }: { className?: string }) {
  return (
    <div className={cn("relative", className)}>
      <div className="absolute inset-[6%]">
        <ProductSilhouette kind={PIECE.model} color={PIECE.colors[0].hex} progress={FAILED_CLIP} hot={false} plate className="absolute inset-0 size-full" />
        <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false" className="absolute inset-0 size-full" overflow="visible">
          <path d={STRAND} fill="none" stroke="black" strokeOpacity="0.5" strokeWidth="0.9" strokeLinejoin="round" transform="translate(0.3 0.4)" />
          <path d={STRAND} fill="none" stroke={PIECE.colors[0].hex} strokeWidth="0.4" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
}
