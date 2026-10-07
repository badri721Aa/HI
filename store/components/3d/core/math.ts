/*
 * Small pure-math helpers shared by the procedural geometry and the SVG
 * silhouettes. No three.js import here, so this module is safe anywhere.
 */

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];

export const TAU = Math.PI * 2;

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Deterministic PRNG (mulberry32). Same seed, same "hand-cut" facets on every load. */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Monotone cubic interpolation (Fritsch–Carlson) through (x, y) knots.
 * Smooth (C1) and never overshoots between knots, which keeps profile
 * curves inside their bounding box.
 */
export function monotoneSpline(xs: readonly number[], ys: readonly number[]) {
  const n = xs.length;
  const d: number[] = [];
  const m: number[] = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  return (x: number) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const t = (x - xs[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * ys[i] +
      (t3 - 2 * t2 + t) * h * m[i] +
      (-2 * t3 + 3 * t2) * ys[i + 1] +
      (t3 - t2) * h * m[i + 1]
    );
  };
}

/**
 * Point on a rounded regular polygon, used for the twisted hex cup and the
 * hex coasters. The outline is parametrised by a column index so that every
 * offset of the same outline shares columns (and therefore normals).
 *
 * - `sides`: number of sides; vertex k points at angle `rotation + k·2π/sides`.
 * - `apothem`: centre to flat side of the sharp polygon.
 * - `corner`: corner fillet radius.
 * - `inset`: distance the outline is moved inwards (wall thickness, bevels).
 *   Insets beyond the corner radius give sharp corners, exactly as a real
 *   offset of a rounded polygon would.
 * - Columns per side: `arc + flat` (arc includes its start point).
 * - `cornerAt` overrides the fillet radius of this particular outline
 *   (default: corner − inset, the exact offset). Used to keep inner coaster
 *   ridges softly rounded instead of collapsing to sharp corners.
 */
export function roundedPolygonPoint(
  sides: number,
  apothem: number,
  corner: number,
  inset: number,
  col: number,
  arc: number,
  flat: number,
  rotation = 0,
  cornerAt?: number,
): { x: number; z: number; nx: number; nz: number } {
  const per = arc + flat;
  const total = sides * per;
  const c = ((col % total) + total) % total;
  const k = Math.floor(c / per);
  const j = c - k * per;
  const half = Math.PI / sides;
  const gamma = rotation + k * 2 * half;
  const rc = Math.max(cornerAt ?? corner - inset, 0);
  // Arc centre sits on the vertex direction; for a plain offset it only moves once the inset eats the fillet.
  const centreDist = Math.max(apothem - inset - rc, 0) / Math.cos(half);
  const cx = centreDist * Math.cos(gamma);
  const cz = centreDist * Math.sin(gamma);
  if (j <= arc) {
    const beta = gamma - half + (j / arc) * 2 * half;
    return { x: cx + rc * Math.cos(beta), z: cz + rc * Math.sin(beta), nx: Math.cos(beta), nz: Math.sin(beta) };
  }
  // Straight part between this corner's arc end and the next corner's arc start.
  const beta = gamma + half;
  const g2 = gamma + 2 * half;
  const ax = cx + rc * Math.cos(beta);
  const az = cz + rc * Math.sin(beta);
  const bx = centreDist * Math.cos(g2) + rc * Math.cos(beta);
  const bz = centreDist * Math.sin(g2) + rc * Math.sin(beta);
  const f = (j - arc) / flat;
  return { x: lerp(ax, bx, f), z: lerp(az, bz, f), nx: Math.cos(beta), nz: Math.sin(beta) };
}
