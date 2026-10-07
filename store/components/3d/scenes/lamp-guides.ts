import * as THREE from "three";
import type { Dims } from "@/types";
import { TAU } from "../core/math";
import { LAMP_TILES_AROUND, latticeSdf } from "../core/pattern";
import { lampLayout, lampOuterRadius, lampTileRow, type LampLayout } from "../core/profiles";

/*
 * Construction geometry for the "How it's made" scene, from the lamp's own
 * profile math: slicer contours (with the lattice holes cut out of every
 * layer, exactly where the shader cuts them) and a CAD bounding box with
 * dimension ticks. Built once; draw ranges reveal them layer by layer.
 */

export interface SliceContours {
  geometry: THREE.BufferGeometry;
  /** Height (model units) of each slice, bottom to top. */
  heights: Float32Array;
  /** First vertex of each slice; starts[n] = vertex count. */
  starts: Uint32Array;
  layout: LampLayout;
}

/** Contours lie just outside the surface so they never z-fight with it. */
const LIFT = 0.0035;

export function buildSliceContours(dims: Dims, slices = 46, samples = LAMP_TILES_AROUND * 16): SliceContours {
  const L = lampLayout(dims);
  const pos: number[] = [];
  const heights = new Float32Array(slices);
  const starts = new Uint32Array(slices + 1);

  const arc = (r: number, y: number, a0: number, a1: number) => {
    const n = Math.max(2, Math.ceil(((a1 - a0) / TAU) * samples));
    for (let k = 0; k < n; k++) {
      const t0 = a0 + ((a1 - a0) * k) / n;
      const t1 = a0 + ((a1 - a0) * (k + 1)) / n;
      pos.push(r * Math.cos(t0), y, r * Math.sin(t0), r * Math.cos(t1), y, r * Math.sin(t1));
    }
  };
  const circle = (r: number, y: number) => arc(r, y, 0, TAU);

  for (let i = 0; i < slices; i++) {
    const y = ((i + 0.5) / slices) * L.H;
    heights[i] = y;
    starts[i] = pos.length / 3;
    const outer = lampOuterRadius(L, y) + LIFT;

    if (y < L.baseH) {
      // Base ring: a solid disc below the socket plate, an annulus with the socket above it.
      circle(outer, y);
      if (y > L.plateY) circle(L.recessR - LIFT, y);
    } else {
      const inner = L.shadeR(y) - L.wall - LIFT;
      const cy = lampTileRow(L, y);
      // Walk around the wall; solid runs become outer + inner arcs joined by
      // short radial edges where the lattice opens.
      const step = TAU / samples;
      const flags = Array.from({ length: samples }, (_, k) => latticeSdf((k / samples) * LAMP_TILES_AROUND, cy, L.rows) > 0);
      const k0 = flags.indexOf(false);
      if (k0 < 0) {
        circle(outer, y);
        circle(inner, y);
      } else {
        // Start from an open sample so no run wraps around the seam.
        let from = -1;
        for (let j = 1; j <= samples; j++) {
          const k = k0 + j;
          const s = j < samples && flags[k % samples];
          if (s && from < 0) from = k;
          if (!s && from >= 0) {
            const a0 = (from - 0.5) * step;
            const a1 = (k - 0.5) * step;
            arc(outer, y, a0, a1);
            arc(inner, y, a0, a1);
            for (const e of [a0, a1]) {
              pos.push(outer * Math.cos(e), y, outer * Math.sin(e), inner * Math.cos(e), y, inner * Math.sin(e));
            }
            from = -1;
          }
        }
      }
    }
    // The socket stands in the middle of the lower layers.
    if (y > L.plateY && y < L.socketTop) circle(L.socketR + LIFT, y);
  }
  starts[slices] = pos.length / 3;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geometry.computeBoundingSphere();
  return { geometry, heights, starts, layout: L };
}

/** Index of the first slice at or above height y (0…n). */
export function sliceIndexAt(c: SliceContours, y: number): number {
  const n = c.heights.length;
  const i = Math.ceil((y / c.layout.H) * n - 0.5);
  return i < 0 ? 0 : i > n ? n : i;
}

/**
 * CAD bounding box of the lamp (its widest diameter × height) with 10 mm
 * ticks (50 mm ticks twice as long) along three edges, like a dimensioned
 * drawing.
 */
export function buildBoundingBox(dims: Dims): THREE.BufferGeometry {
  const L = lampLayout(dims);
  const r = L.R;
  const H = L.H;
  const pos: number[] = [];
  const seg = (a: [number, number, number], b: [number, number, number]) => pos.push(...a, ...b);
  const xs = [-r, r];
  const ys = [0, H];
  for (const y of ys) {
    seg([-r, y, -r], [r, y, -r]);
    seg([-r, y, r], [r, y, r]);
    seg([-r, y, -r], [-r, y, r]);
    seg([r, y, -r], [r, y, r]);
  }
  for (const x of xs) for (const z of xs) seg([x, 0, z], [x, H, z]);

  const tick = (n: number) => (n % 5 === 0 ? 0.05 : 0.022);
  const step = 0.1; // 10 mm
  // Width: along the front bottom edge, ticks pointing out (+z).
  for (let i = 0, x = -r; x <= r + 1e-6; i++, x = -r + i * step) seg([x, 0, r], [x, 0, r + tick(i)]);
  // Depth: along the right bottom edge, ticks pointing out (+x).
  for (let i = 0, z = -r; z <= r + 1e-6; i++, z = -r + i * step) seg([r, 0, z], [r + tick(i), 0, z]);
  // Height: up the front-right edge, ticks pointing out (+x).
  for (let i = 0, y = 0; y <= H + 1e-6; i++, y = i * step) seg([r, y, r], [r + tick(i), y, r]);

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeBoundingSphere();
  return g;
}
