import { seeded } from "../core/math";
import type { Vec3 } from "../core/math";

/*
 * The 404's failed print: one strand of filament, as a printer leaves it when
 * a part comes loose. It hangs from the parked nozzle, balls up into a nest
 * over the half-printed vase and ends draped on its rim. A seeded random
 * walk, so it is the same tangle on every load (and in the SVG fallback).
 * Pure math (model units, base of the vase at the origin); no three.js.
 */

export interface TangleSpec {
  /** Nozzle tip the strand hangs from. */
  tip: Vec3;
  /** Point on the vase rim where the strand ends. */
  rim: Vec3;
  /** Centre and radii of the nest. */
  centre: Vec3;
  radii: Vec3;
  seed?: number;
  steps?: number;
}

const add = (a: Vec3, b: Vec3, k = 1): Vec3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: Vec3): Vec3 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** Rotates v about the unit axis k by angle a (Rodrigues). */
function rotate(v: Vec3, k: Vec3, a: number): Vec3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const kv = cross(k, v);
  const d = k[0] * v[0] + k[1] * v[1] + k[2] * v[2];
  return [
    v[0] * c + kv[0] * s + k[0] * d * (1 - c),
    v[1] * c + kv[1] * s + k[1] * d * (1 - c),
    v[2] * c + kv[2] * s + k[2] * d * (1 - c),
  ];
}

/** Control points of the strand, from the nozzle tip to the rim. */
export function tanglePoints({ tip, rim, centre, radii, seed = 404, steps = 560 }: TangleSpec): Vec3[] {
  const rnd = seeded(seed);
  const unit = (): Vec3 => norm([rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1]);
  const pts: Vec3[] = [];

  // Hanging from the nozzle: a short, slightly bowed drop towards the nest's top.
  const top: Vec3 = [centre[0] * 0.6 + tip[0] * 0.4, centre[1] + radii[1] * 0.8, centre[2] * 0.6 + tip[2] * 0.4];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    const sag = Math.sin(Math.PI * t) * 0.06;
    pts.push([tip[0] + (top[0] - tip[0]) * t + sag, tip[1] + (top[1] - tip[1]) * t, tip[2] + (top[2] - tip[2]) * t]);
  }

  // The nest: a curling walk that turns about a slowly wandering axis and is
  // steered back whenever it leaves the ellipsoid.
  let p = pts[pts.length - 1];
  let v = norm(sub(centre, p));
  let axis = unit();
  const stepLen = 0.042;
  for (let i = 0; i < steps; i++) {
    axis = norm(add(axis, unit(), 0.3));
    v = rotate(v, axis, 0.16 + rnd() * 0.22);
    const q: Vec3 = [(p[0] - centre[0]) / radii[0], (p[1] - centre[1]) / radii[1], (p[2] - centre[2]) / radii[2]];
    const out = len(q);
    if (out > 0.8) v = norm(add(v, norm([-q[0], -q[1], -q[2]]), (out - 0.8) * 1.6));
    p = add(p, v, stepLen * (0.8 + rnd() * 0.4));
    pts.push(p);
  }

  // Down onto the rim, with one lazy loop on the way.
  const last = pts[pts.length - 1];
  for (let i = 1; i <= 8; i++) {
    const t = i / 8;
    const loop = Math.sin(Math.PI * t) * 0.08;
    pts.push([last[0] + (rim[0] - last[0]) * t + loop, last[1] + (rim[1] - last[1]) * t, last[2] + (rim[2] - last[2]) * t - loop]);
  }
  return pts;
}
