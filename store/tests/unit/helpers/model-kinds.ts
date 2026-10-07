import type { Dims, ModelKind } from "@/types";

/**
 * Every ModelKind with realistic outer dimensions in mm (the sizes these
 * pieces were sold in before the catalog moved to photographed products).
 * Typed as a Record so adding a ModelKind without dims fails the type check.
 */
export const MODEL_DIMS: Record<ModelKind, Dims[]> = {
  "ripple-vase": [
    { w: 120, d: 120, h: 160 },
    { w: 150, d: 150, h: 220 },
    { w: 180, d: 180, h: 300 },
  ],
  "lattice-lamp": [
    { w: 140, d: 140, h: 240 },
    { w: 180, d: 180, h: 320 },
  ],
  "facet-planter": [
    { w: 100, d: 100, h: 90 },
    { w: 140, d: 140, h: 125 },
    { w: 180, d: 180, h: 160 },
  ],
  "spiral-cup": [{ w: 85, d: 85, h: 110 }],
  "arc-stand": [{ w: 80, d: 90, h: 120 }],
  "hex-coaster": [{ w: 100, d: 87, h: 6 }],
  "knot-sculpture": [
    { w: 90, d: 90, h: 60 },
    { w: 140, d: 140, h: 90 },
  ],
  "wave-bowl": [
    { w: 200, d: 200, h: 70 },
    { w: 260, d: 260, h: 90 },
  ],
};

export const MODEL_KINDS = Object.keys(MODEL_DIMS) as ModelKind[];
