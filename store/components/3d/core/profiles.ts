/*
 * Profile math for the two showcase pieces, shared by the procedural
 * geometry (geometry.ts), the scenes (nozzle paths, slice contours) and the
 * SVG silhouettes. Pure math, no three.js: safe on the server and in OG images.
 *
 * Units: 1 unit = 100 mm. Angles θ are measured from +X towards +Z
 * (x = r·cos θ, z = r·sin θ). Dims are outer w/d/h in millimetres.
 */
import type { Dims } from "@/types";
import { TAU, clamp, monotoneSpline } from "./math";
import { LAMP_TILES_AROUND } from "./pattern";

export const MM = 0.01;

/* -------------------------------------------------------------------------- */
/* Ripple vase                                                                */
/* -------------------------------------------------------------------------- */

export const RIPPLE = {
  ridges: 12,
  /** Ridge amplitude as a fraction of the local radius. */
  amp: 0.045,
  /** A quarter turn from base to lip. */
  twist: Math.PI / 2,
  wall: 1.6 * MM,
  floor: 2 * MM,
};

// Foot → belly → waist → lip flare, as fractions of the outer radius.
const rippleProfile = monotoneSpline(
  [0, 0.1, 0.22, 0.35, 0.5, 0.66, 0.82, 0.92, 1],
  [0.7, 0.84, 0.93, 0.955, 0.9, 0.77, 0.66, 0.675, 0.735],
);
// The belly knot is the profile maximum (monotone spline: no overshoot), so
// with ridges on top the outer radius peaks at exactly w/2.
const RIPPLE_NORM = 1 / (0.955 * (1 + RIPPLE.amp));

/** Mean radius of the vase at height fraction t, as a fraction of w/2 (before ridges). */
export function rippleBase(t: number): number {
  return rippleProfile(clamp(t, 0, 1)) * RIPPLE_NORM;
}

/**
 * Outer radius (model units) of the ripple vase at height fraction t (0–1)
 * and angle theta. The ridges rotate by a quarter turn (−π/2 in θ) from base
 * to lip. Exact: this is the same function the mesh is built from.
 */
export function ripplePerimeterRadius(t: number, theta: number, dims: Dims): number {
  const tt = clamp(t, 0, 1);
  const R = Math.min(dims.w, dims.d) / 200;
  return R * rippleBase(tt) * (1 + RIPPLE.amp * Math.cos(RIPPLE.ridges * (theta + RIPPLE.twist * tt)));
}

/* -------------------------------------------------------------------------- */
/* Lattice lamp                                                               */
/* -------------------------------------------------------------------------- */

export interface LampLayout {
  /** Total height (model units). */
  H: number;
  /** Outer radius at the widest point of the shade. */
  R: number;
  /** Height of the base ring. */
  baseH: number;
  /** Outer radius of the shade at height y (model units). */
  shadeR: (y: number) => number;
  /** Lattice tile size (model units). */
  tile: number;
  /** Complete lattice rows. */
  rows: number;
  /** Lattice band as height fractions [start, end]. */
  range: [number, number];
  socketTop: number;
  bulbRadius: number;
  bulbY: number;
  /** Base ring: outer radius, chamfer, recess radius, socket plate height, socket radius. */
  ringR: number;
  chamfer: number;
  recessR: number;
  plateY: number;
  socketR: number;
  /** Shade wall thickness. */
  wall: number;
}

/**
 * Lamp layout. UVs are cylindrical everywhere on the lamp:
 *   u = θ / 2π, v = y / H (object-space height fraction of the whole lamp).
 * The lattice is cut by the material only for v inside `range`, which starts
 * above the base ring and stops below the top rim.
 */
export function lampLayout(dims: Dims): LampLayout {
  const H = dims.h * MM;
  const R = Math.min(dims.w, dims.d) / 200;
  const baseH = 0.1 * H;
  const shadeR = (y: number) => {
    const s = clamp((y - baseH) / (H - baseH), 0, 1);
    return R * (0.88 + 0.12 * Math.sin(Math.PI * s));
  };
  const tile = (TAU * R) / LAMP_TILES_AROUND;
  const shadeH = H - baseH;
  const rows = Math.max(1, Math.floor((shadeH - 2 * 8 * MM) / tile));
  const margin = (shadeH - rows * tile) / 2;
  const range: [number, number] = [(baseH + margin) / H, (H - margin) / H];
  const socketTop = 0.3 * H;
  const bulbRadius = 0.24 * R;
  const bulbY = socketTop + bulbRadius * 0.82;
  return {
    H,
    R,
    baseH,
    shadeR,
    tile,
    rows,
    range,
    socketTop,
    bulbRadius,
    bulbY,
    ringR: 0.92 * R,
    chamfer: 1.5 * MM,
    recessR: 0.6 * R,
    plateY: 0.55 * baseH,
    socketR: 0.11 * R,
    wall: 2 * MM,
  };
}

/** Outer radius of the lamp at height y (model units): base ring below baseH, shade above. */
export function lampOuterRadius(L: LampLayout, y: number): number {
  if (y < L.baseH - L.chamfer) return L.ringR;
  if (y < L.baseH) return L.ringR - (y - (L.baseH - L.chamfer));
  return L.shadeR(y);
}

/** Converts a height y (model units) on the shade to lattice tile rows (cy); outside 0…rows off the band. */
export function lampTileRow(L: LampLayout, y: number): number {
  const v = y / L.H;
  return ((v - L.range[0]) / (L.range[1] - L.range[0])) * L.rows;
}
