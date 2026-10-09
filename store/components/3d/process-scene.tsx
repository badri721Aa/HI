"use client";

import dynamic from "next/dynamic";
import { SHOWCASE } from "@/content/showcase";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";
import { useSceneDemand } from "./scene-demand";
import { ProductSilhouette } from "./silhouette";
import { ThreeBoundary } from "./scenes/three-boundary";
import { useWebGLSupport } from "./webgl-support";

/* The scene (three.js) loads only when WebGL is available. */
const ProcessView = dynamic(() => import("./scenes/process-view").then((m) => m.ProcessView), { ssr: false });

const PIECE = SHOWCASE.lamp;

/**
 * "How it's made": the Lattice lamp going from CAD model to slices to print
 * to a finished, lit lamp as `progress` goes 0 → 1. `progress` is read every
 * frame (e.g. a motion value), never through React state. Fills its parent.
 *
 * Without WebGL: the finished lamp as a drawing.
 */
export function ProcessScene({ progress, className }: { progress: { get(): number }; className?: string }) {
  const supported = useWebGLSupport();
  const reduced = useReducedMotion();
  useSceneDemand(supported === true);

  if (supported === null) return <div className={className} />;
  const fallback = <ProcessFallback className={className} />;
  if (!supported) return fallback;
  return (
    <ThreeBoundary fallback={fallback}>
      <ProcessView progress={progress} reduced={reduced} className={className} />
    </ThreeBoundary>
  );
}

function ProcessFallback({ className }: { className?: string }) {
  return (
    <div className={cn("relative", className)}>
      <div className="absolute inset-[8%]">
        <ProductSilhouette kind={PIECE.model} color={PIECE.colors[0].hex} plate className="size-full" />
      </div>
    </div>
  );
}
