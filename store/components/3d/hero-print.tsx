"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { SHOWCASE } from "@/content/showcase";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { usePrintState } from "@/lib/store/print";
import { cn } from "@/lib/utils";
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
 * Without WebGL: the finished vase as a drawing, and a "complete" readout.
 */
export function HeroPrint({ className }: { className?: string }) {
  const supported = useWebGLSupport();
  const reduced = useReducedMotion();

  if (supported === null) return <div className={className} />;
  if (!supported) return <HeroFallback className={className} />;
  return (
    <ThreeBoundary fallback={<HeroFallback className={className} />}>
      <HeroScene className={className} reduced={reduced} />
    </ThreeBoundary>
  );
}

function HeroFallback({ className }: { className?: string }) {
  useEffect(() => {
    usePrintState.getState().set({ progress: 1, layer: TOTAL_LAYERS, totalLayers: TOTAL_LAYERS, minutesLeft: 0 });
  }, []);
  return (
    <div className={cn("relative", className)}>
      {/* Same composition as the 3D scene: clear of the HUD in the box's bottom-start corner. */}
      <div className="absolute bottom-[31%] end-[2%] start-[24%] top-[3%] sm:bottom-[8%] sm:start-[36%] sm:top-[4%]">
        <ProductSilhouette kind={PIECE.model} color={PIECE.colors[0].hex} plate className="size-full" />
      </div>
    </div>
  );
}
