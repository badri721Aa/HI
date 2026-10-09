"use client";

import { useEffect, useState, type RefObject } from "react";
import dynamic from "next/dynamic";
import { SHOWCASE } from "@/content/showcase";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { usePrintState } from "@/lib/store/print";
import { cn } from "@/lib/utils";
import { useSceneDemand } from "./scene-demand";
import { ProductSilhouette } from "./silhouette";
import { ThreeBoundary } from "./scenes/three-boundary";
import { useWebGLSupport } from "./webgl-support";

/* The scene (three.js) loads only when WebGL is available. While it loads, the ghost under it shows. */
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
 * Three.js-free itself, so it renders on the server: the first paint
 * already shows a faint outline of the vase, which stays until the scene has
 * drawn its first frame (three.js loading, shaders compiling and the shared
 * canvas fading in can take a few seconds on a slow phone).
 *
 * Without WebGL: the finished vase as a drawing, and a "complete" readout.
 */
export function HeroPrint({ className, avoid }: { className?: string; avoid?: RefObject<HTMLElement | null> }) {
  const supported = useWebGLSupport();
  const reduced = useReducedMotion();
  const [ghost, setGhost] = useState(true);
  useSceneDemand(supported === true);

  if (supported === false) return <HeroFallback className={className} />;
  return (
    <div className={cn("relative", className)}>
      {/* Fades out with the canvas's own 900ms fade-in, so one hands over to the other (both instant with reduced motion). */}
      <HeroGhost className={cn("absolute inset-0 transition-opacity duration-900 ease-out-expo", !ghost && "opacity-0")} />
      {supported ? (
        <ThreeBoundary fallback={<HeroFallback className="absolute inset-0" />} onError={() => setGhost(false)}>
          <HeroScene className="absolute inset-0" reduced={reduced} avoid={avoid} onDrawn={() => setGhost(false)} />
        </ThreeBoundary>
      ) : null}
    </div>
  );
}

function HeroFallback({ className }: { className?: string }) {
  useEffect(() => {
    usePrintState.getState().set({ progress: 1, layer: TOTAL_LAYERS, totalLayers: TOTAL_LAYERS, minutesLeft: 0 });
  }, []);
  return <HeroSilhouette className={className} />;
}

/** A faint outline of the piece until the scene draws, so the box is never blank. */
function HeroGhost({ className }: { className?: string }) {
  return <HeroSilhouette className={cn("opacity-[0.12]", className)} />;
}

function HeroSilhouette({ className }: { className?: string }) {
  return (
    <div className={cn("relative", className)}>
      {/* Roughly the 3D composition, clear of the HUD: above its strip on phones, beside its card on tablets, above it on large screens. */}
      <div className="absolute bottom-[18%] end-[10%] start-[10%] top-[4%] sm:bottom-[4%] sm:end-[2%] sm:start-[42%] lg:bottom-[32%] lg:end-[18%] lg:start-[18%] lg:top-[3%]">
        <ProductSilhouette kind={PIECE.model} color={PIECE.colors[0].hex} plate className="size-full" />
      </div>
    </div>
  );
}
