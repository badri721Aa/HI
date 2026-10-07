// STUB — owned by the 3D core builder.
import type { ModelKind } from "@/types";

/**
 * Side-view outline of each model as SVG path data in a 0 0 100 100 box,
 * generated from the same profiles as the 3D geometry. Used for the
 * no-WebGL fallback, cart thumbnails and OG images.
 */
export const SILHOUETTES: Record<ModelKind, string> = {
  "ripple-vase": "M38 95 L62 95 L66 60 L58 15 L42 15 L34 60 Z",
  "lattice-lamp": "M30 90 L70 90 L72 20 L28 20 Z",
  "facet-planter": "M32 90 L68 90 L76 30 L24 30 Z",
  "spiral-cup": "M30 90 L70 90 L70 20 L30 20 Z",
  "arc-stand": "M25 90 L75 90 L60 20 L50 20 Z",
  "hex-coaster": "M15 80 L85 80 L85 70 L15 70 Z",
  "knot-sculpture": "M50 15 A30 30 0 1 1 49 15 Z",
  "wave-bowl": "M15 50 L85 50 L70 80 L30 80 Z",
};
