"use client";

import { useEffect, type RefObject } from "react";
import dynamic from "next/dynamic";
import { SHOWCASE } from "@/content/showcase";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { usePrintState } from "@/lib/store/print";
import { cn } from "@/lib/utils";
import { useSceneDemand } from "./scene-demand";
import { ProductSilhouette } from "./silhouette";
import { ThreeBoundary } from "./scenes/three-boundary";
import { useWebGLSupport } from "./webgl-support";

/* The scene (three.js) loads only when WebGL is available. */
const HeroScene = dynamic(() => import("./scenes/hero-scene").then((m) => m.HeroScene), { ssr: false });

const PIECE = SHOWCASE.vase;
const DIMS = PIECE.sizes[0].dims;
const TOTAL_LAYERS = Math.round(DIMS.h / PIECE.layerHeight);

/**
 * The hero's live print: the Ripple vase printing on the build plate, drawn
 * by the shared canvas into this box. Fills its positioned parent. Writes
 * the print progress to usePrintState (~10 Hz) for the HUD.
 *
 * `avoid`: an element overlaid on the box's bottom-start corner (the HUD,
 * positioned in the box's container) that the composition keeps clear of.
 *
 * Without WebGL: the finished vase as a drawing, and a "complete" readout.
 */
export function HeroPrint({ className, avoid }: { className?: string; avoid?: RefObject<HTMLElement | null> }) {
  const supported = useWebGLSupport();
  const reduced = useReducedMotion();
  useSceneDemand(supported === true);

  if (supported === null) return <div className={className} />;
  if (!supported) return <HeroFallback className={className} />;
  return (
    <ThreeBoundary fallback={<HeroFallback className={className} />}>
      <HeroScene className={className} reduced={reduced} avoid={avoid} />
    </ThreeBoundary>
  );
}

function HeroFallback({ className }: { className?: string }) {
  useEffect(() => {
    usePrintState.getState().set({ progress: 1, layer: TOTAL_LAYERS, totalLayers: TOTAL_LAYERS, minutesLeft: 0 });
  }, []);
  return (
    <div className={cn("relative", className)}>
      {/* Roughly the 3D composition: beside the HUD on phones, above it on large screens. */}
      <div className="absolute bottom-[4%] end-[2%] start-[46%] top-[4%] lg:bottom-[32%] lg:end-[18%] lg:start-[18%] lg:top-[3%]">
        <ProductSilhouette kind={PIECE.model} color={PIECE.colors[0].hex} plate className="size-full" />
      </div>
    </div>
  );
}
