import type { ModelKind } from "@/types";
import { TAU, clamp } from "./core/math";
import { CORNER_HALF, LAMP_TILES_AROUND, STAR_HALF } from "./core/pattern";
import { RIPPLE, lampLayout, lampOuterRadius, ripplePerimeterRadius, rippleBase } from "./core/profiles";

/*
 * Side elevations of every model as SVG path data in a 0 0 100 100 box: the
 * piece stands on y = 94, centred on x = 50, its larger side 88 units long.
 * The ripple vase and the lattice lamp are computed from the same profile
 * math as the 3D geometry (core/profiles.ts): the vase outline is the exact
 * projected envelope of its twisted ridges, and the lamp's outline carries
 * the front-facing lattice holes (wound against the outline, so both the
 * nonzero and evenodd fill rules cut them). Plain data: no three.js, safe in
 * OG images and server components. Computed once at module load (< 1 ms).
 */

type Pt = [number, number];

export interface SilhouetteBounds {
  x0: number;
  x1: number;
  /** Top of the piece. */
  y0: number;
  /** Base line. */
  y1: number;
}

const BASE_Y = 94;
const SPAN = 88;
const CX = 50;

const n = (v: number) => {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? "0" : String(r);
};

function polyline(pts: Pt[], closed: boolean): string {
  if (!pts.length) return "";
  let d = `M${n(pts[0][0])} ${n(pts[0][1])}`;
  for (let i = 1; i < pts.length; i++) d += `L${n(pts[i][0])} ${n(pts[i][1])}`;
  return closed ? `${d}Z` : d;
}

/** Signed area in SVG coordinates (y down): > 0 is clockwise on screen. */
function area(pts: Pt[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

/** Winds `pts` with the given sign of area. */
function wind(pts: Pt[], sign: 1 | -1): Pt[] {
  return Math.sign(area(pts)) === sign ? pts : [...pts].reverse();
}

function boundsOf(pts: Pt[]): SilhouetteBounds {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const [x, y] of pts) {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  return { x0, x1, y0, y1 };
}

/** Maps model units (x right, y up, base on y = 0) into the box, for a piece of size w × h. */
function frame(w: number, h: number) {
  const s = SPAN / Math.max(w, h);
  return (x: number, y: number): Pt => [CX + x * s, BASE_Y - y * s];
}

interface Silhouette {
  path: string;
  detail?: string;
  bounds: SilhouetteBounds;
}

/* ---------------------------------- Vase ---------------------------------- */

function rippleVase(): Silhouette {
  const dims = { w: 150, d: 150, h: 220 };
  const H = dims.h / 100;
  const R = dims.w / 200;
  const to = frame(dims.w / 100, H);
  const rows = 120;
  const steps = 120;

  // Envelope of the projected wall: the widest x over all angles at each
  // height. It always lies within ±30° of the view's side (beyond that cos θ
  // loses more than the ±4.5 % ridges can add), so only that arc is sampled.
  const right: Pt[] = [];
  for (let j = 0; j <= rows; j++) {
    const t = j / rows;
    let best = 0;
    for (let k = 0; k <= steps; k++) {
      const th = (k / steps - 0.5) * (Math.PI / 3);
      best = Math.max(best, ripplePerimeterRadius(t, th, dims) * Math.cos(th));
    }
    right.push(to(best, t * H));
  }
  // 12 ridges: rotating by π maps the ridge pattern onto itself, so the outline is symmetric.
  const left = right.map(([x, y]) => [2 * CX - x, y] as Pt).reverse();
  const outline = wind([...right, ...left], 1);

  // Ridge crests facing the viewer (z > 0), as thin construction lines.
  const crests: string[] = [];
  for (let k = 0; k < RIPPLE.ridges; k++) {
    let run: Pt[] = [];
    const flush = () => {
      if (run.length > 1) crests.push(polyline(run, false));
      run = [];
    };
    for (let j = 0; j <= rows; j++) {
      const t = j / rows;
      const th = (k / RIPPLE.ridges) * TAU - RIPPLE.twist * t;
      const s = Math.sin(th);
      // Skip the grazing ends near the outline, where crests bunch up.
      if (s < 0.22) {
        flush();
        continue;
      }
      const r = R * rippleBase(t) * (1 + RIPPLE.amp);
      run.push(to(r * Math.cos(th), t * H));
    }
    flush();
  }
  return { path: polyline(outline, true), detail: crests.join(""), bounds: boundsOf(outline) };
}

/* ---------------------------------- Lamp ---------------------------------- */

function latticeLamp(): Silhouette {
  const dims = { w: 140, d: 140, h: 240 };
  const L = lampLayout(dims);
  const to = frame((2 * L.R), L.H);

  // Outline: base ring with its chamfer, the small step in to the shade, the barrel, the rim.
  const right: Pt[] = [];
  right.push(to(L.ringR, 0));
  right.push(to(L.ringR, L.baseH - L.chamfer));
  right.push(to(lampOuterRadius(L, L.baseH - 1e-6), L.baseH));
  const rows = 80;
  for (let j = 0; j <= rows; j++) {
    const y = L.baseH + (j / rows) * (L.H - L.baseH);
    right.push(to(L.shadeR(y), y));
  }
  const left = right.map(([x, y]) => [2 * CX - x, y] as Pt).reverse();
  const outline = wind([...right, ...left], 1);

  // Lattice holes on the front half, projected onto the barrel. Holes that
  // would be foreshortened into slivers near the outline are left out.
  const onShade = (cx: number, cy: number): Pt => {
    const th = (cx / LAMP_TILES_AROUND) * TAU;
    const y = (L.range[0] + (cy / L.rows) * (L.range[1] - L.range[0])) * L.H;
    return to(L.shadeR(y) * Math.cos(th), y);
  };
  const front = (cx: number) => {
    const th = (cx / LAMP_TILES_AROUND) * TAU;
    return Math.sin(th) > 0 && Math.abs(Math.cos(th)) < 0.8;
  };
  const holes: Pt[][] = [];
  const a = STAR_HALF;
  const inner8 = a * Math.hypot(1, Math.SQRT2 - 1);
  for (let tx = 0; tx < LAMP_TILES_AROUND; tx++) {
    if (!front(tx + 0.5)) continue;
    for (let ty = 0; ty < L.rows; ty++) {
      const star: Pt[] = [];
      for (let k = 0; k < 16; k++) {
        const ang = (k * Math.PI) / 8;
        const rr = k % 2 === 0 ? a * Math.SQRT2 : inner8;
        star.push(onShade(tx + 0.5 + rr * Math.cos(ang), ty + 0.5 + rr * Math.sin(ang)));
      }
      holes.push(wind(star, -1));
    }
  }
  const c = CORNER_HALF;
  for (let tx = 0; tx < LAMP_TILES_AROUND; tx++) {
    if (!front(tx)) continue;
    for (let ty = 1; ty < L.rows; ty++) {
      holes.push(
        wind([onShade(tx - c, ty - c), onShade(tx + c, ty - c), onShade(tx + c, ty + c), onShade(tx - c, ty + c)], -1),
      );
    }
  }

  // Detail: band edges and the base ring's top edge.
  const ring = (y: number, r: number) => polyline([to(-r, y), to(r, y)], false);
  const detail = [
    ring(L.range[0] * L.H, L.shadeR(L.range[0] * L.H)),
    ring(L.range[1] * L.H, L.shadeR(L.range[1] * L.H)),
    ring(L.baseH - L.chamfer, L.ringR),
  ].join("");

  return {
    path: polyline(outline, true) + holes.map((h) => polyline(h, true)).join(""),
    detail,
    bounds: boundsOf(outline),
  };
}

/* --------------------------------- Others --------------------------------- */
/* Simple elevations; these kinds have no showcase scene.                     */

function simple(pts: Pt[], detail?: string): Silhouette {
  const outline = wind(pts, 1);
  return { path: polyline(outline, true), detail, bounds: boundsOf(outline) };
}

function lathed(profile: Pt[]): Pt[] {
  // profile: [radius, height] in a 0–1 box from base to top; mirrored about the axis.
  const right = profile.map(([r, h]) => [CX + r * 44, BASE_Y - h * SPAN] as Pt);
  const left = right.map(([x, y]) => [2 * CX - x, y] as Pt).reverse();
  return [...right, ...left];
}

function others(): Record<Exclude<ModelKind, "ripple-vase" | "lattice-lamp">, Silhouette> {
  return {
    // Faceted planter on its saucer.
    "facet-planter": simple([
      [14, 94], [86, 94], [88, 91], [80, 89], [84, 30], [86, 26], [14, 26], [16, 30], [20, 89], [12, 91],
    ]),
    // Twisted hex cup.
    "spiral-cup": simple(lathed([[0.62, 0], [0.66, 0.03], [0.7, 0.5], [0.74, 0.98], [0.74, 1]])),
    // Phone stand: back plate leaning on a foot with a lip.
    "arc-stand": simple([
      [12, 94], [88, 94], [88, 86], [80, 86], [80, 80], [74, 80], [74, 88], [58, 88], [40, 22], [30, 6], [22, 6], [24, 14], [34, 88], [20, 88], [20, 82], [12, 82],
    ]),
    // A short stack of hex coasters.
    "hex-coaster": simple([
      [8, 94], [92, 94], [92, 86], [90, 84], [92, 82], [92, 74], [90, 72], [92, 70], [92, 64], [8, 64], [8, 70], [10, 72], [8, 74], [8, 82], [10, 84], [8, 86],
    ]),
    // Knot: a rounded mass on a disc.
    "knot-sculpture": simple(
      (() => {
        const pts: Pt[] = [[22, 94], [78, 94], [78, 88], [66, 86]];
        for (let i = 0; i <= 24; i++) {
          const a = -0.25 * Math.PI + (i / 24) * 1.5 * Math.PI;
          pts.push([50 + 36 * Math.cos(a), 50 - 38 * Math.sin(a) + 4]);
        }
        pts.push([34, 86], [22, 88]);
        return pts;
      })(),
    ),
    // Shallow wave bowl on a foot ring.
    "wave-bowl": simple(lathed([[0.34, 0], [0.36, 0.06], [0.5, 0.12], [0.8, 0.28], [1, 0.42], [0.98, 0.44]])),
  };
}

const BUILT: Record<ModelKind, Silhouette> = {
  "ripple-vase": rippleVase(),
  "lattice-lamp": latticeLamp(),
  ...others(),
};

const pick = <T,>(f: (s: Silhouette) => T) =>
  Object.fromEntries(Object.entries(BUILT).map(([k, v]) => [k, f(v)])) as Record<ModelKind, T>;

/**
 * Side-view outline of each model as SVG path data in a 0 0 100 100 box
 * (base on y = 94), generated from the same profiles as the 3D geometry.
 * Used for the no-WebGL fallback and the OG images.
 */
export const SILHOUETTES: Record<ModelKind, string> = pick((s) => s.path);

/** Optional construction lines (ridge crests, band edges) to stroke over the silhouette. */
export const SILHOUETTE_DETAILS: Record<ModelKind, string | undefined> = pick((s) => s.detail);

/** Bounding box of each outline in the 0 0 100 100 box. */
export const SILHOUETTE_BOUNDS: Record<ModelKind, SilhouetteBounds> = pick((s) => s.bounds);

/** Height (0–1 of the piece) → y in the box. */
export function silhouetteY(kind: ModelKind, fraction: number): number {
  const b = SILHOUETTE_BOUNDS[kind];
  return b.y1 - (b.y1 - b.y0) * clamp(fraction, 0, 1);
}
