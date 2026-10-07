import * as THREE from "three";
import type { Dims, ModelKind } from "@/types";
import {
  TAU,
  clamp,
  lerp,
  roundedPolygonPoint,
  seeded,
  smoothstep,
  type Vec2,
  type Vec3,
} from "./core/math";
import { CORNER_HALF, LAMP_TILES_AROUND, STAR_HALF } from "./core/pattern";
import { RIPPLE, lampLayout, rippleBase, ripplePerimeterRadius } from "./core/profiles";

/*
 * Procedural geometry for every ModelKind. No downloaded meshes: each piece is
 * built from the same profile math a slicer would see.
 *
 * Conventions (shared with the scenes and the shaders):
 * - Units: 1 unit = 100 mm (MM = 0.01).
 * - The base sits on y = 0; the piece is centred on X/Z.
 * - Angles θ are measured from +X towards +Z: x = r·cos θ, z = r·sin θ.
 * - Every geometry has position, normal and uv attributes and an index.
 * - Everything is cached per kind + dims. Never dispose a geometry returned
 *   from here; call disposeGeometryCache() if the whole 3D layer goes away.
 */


const MM = 0.01;

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

export interface LampInfo {
  /** Centre of the bulb in model units (object space). */
  bulbY: number;
  bulbRadius: number;
  /**
   * Lattice placement for the material (see materials.ts):
   * tiles around (integer) × complete rows, inside v ∈ [range[0], range[1]].
   */
  pattern: { repeat: [number, number]; range: [number, number] };
}

export interface ModelInfo {
  kind: ModelKind;
  /** Bounding box size in model units. */
  size: { w: number; h: number; d: number };
  /** Same as size.h: the height the clip plane sweeps over (0 → height). */
  height: number;
  lamp?: LampInfo;
}

export interface WireframeGeometry {
  /** Silhouette and feature edges (rims, outlines, lattice). */
  major: THREE.BufferGeometry;
  /** Construction lines: iso-rings, ridge crests, facet edges. */
  minor: THREE.BufferGeometry;
  /** The footprint on the build plate (draw sparingly, in the accent colour). */
  accent: THREE.BufferGeometry;
}

interface CacheEntry {
  mesh: THREE.BufferGeometry;
  wire: WireframeGeometry;
  info: ModelInfo;
}

const cache = new Map<string, CacheEntry>();

const keyFor = (kind: ModelKind, d: Dims) => `${kind}:${d.w}x${d.d}x${d.h}`;

function entry(kind: ModelKind, dims: Dims): CacheEntry {
  const key = keyFor(kind, dims);
  let e = cache.get(key);
  if (!e) {
    e = build(kind, dims);
    cache.set(key, e);
  }
  return e;
}

/**
 * Procedural geometry for a model kind at the given outer dimensions.
 * Units: 1 unit = 100 mm. Base sits on y = 0, centred on X/Z. Cached per kind + dims.
 *
 * Notes per kind:
 * - hex-coaster renders a slightly fanned stack of three coasters, so its
 *   bounding box is ≈ w × 3h × d (the fan adds up to ~6% on depth).
 * - knot-sculpture fits inside w × h × d with its proportions kept (it is
 *   limited by the height, so it is narrower than w).
 * - facet-planter includes the saucer; lattice-lamp includes base ring and
 *   socket (the glowing bulb itself is added by ProductMesh).
 */
export function getGeometry(kind: ModelKind, dims: Dims): THREE.BufferGeometry {
  return entry(kind, dims).mesh;
}

/** CAD-style line geometry for the "model" stage (LineSegments). Cached; do not dispose. */
export function getWireframeGeometry(kind: ModelKind, dims: Dims): WireframeGeometry {
  return entry(kind, dims).wire;
}

/** Bounding size, sweep height and kind-specific extras (lamp bulb + lattice). */
export function getModelInfo(kind: ModelKind, dims: Dims): ModelInfo {
  return entry(kind, dims).info;
}

export function disposeGeometryCache(): void {
  for (const e of cache.values()) {
    e.mesh.dispose();
    e.wire.major.dispose();
    e.wire.minor.dispose();
    e.wire.accent.dispose();
  }
  cache.clear();
}

/* -------------------------------------------------------------------------- */
/* Ripple vase profile (shared with the hero nozzle): see core/profiles.ts     */
/* -------------------------------------------------------------------------- */

export { ripplePerimeterRadius };

/* -------------------------------------------------------------------------- */
/* Mesh builder                                                               */
/* -------------------------------------------------------------------------- */

type WireTier = "major" | "minor" | "accent";

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: Vec3) => Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
const normalize = (a: Vec3): Vec3 => {
  const l = len(a);
  return l > 1e-20 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0];
};

class MeshBuilder {
  pos: number[] = [];
  nrm: number[] = [];
  uv: number[] = [];
  idx: number[] = [];
  wires: Record<WireTier, number[]> = { major: [], minor: [], accent: [] };

  vert(p: Vec3, n: Vec3, uv: Vec2): number {
    this.pos.push(p[0], p[1], p[2]);
    this.nrm.push(n[0], n[1], n[2]);
    this.uv.push(uv[0], uv[1]);
    return this.pos.length / 3 - 1;
  }

  /** One flat-shaded triangle, wound so its face normal points along `towards`. */
  flatTri(a: Vec3, b: Vec3, c: Vec3, towards: Vec3, uvOf: (p: Vec3) => Vec2) {
    let n = cross(sub(b, a), sub(c, a));
    if (len(n) < 1e-14) return;
    if (dot(n, towards) < 0) {
      const t = b;
      b = c;
      c = t;
      n = [-n[0], -n[1], -n[2]];
    }
    n = normalize(n);
    const i = this.vert(a, n, uvOf(a));
    this.vert(b, n, uvOf(b));
    this.vert(c, n, uvOf(c));
    this.idx.push(i, i + 1, i + 2);
  }

  line(tier: WireTier, pts: Vec3[], closed = false) {
    const w = this.wires[tier];
    const n = pts.length;
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      w.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    }
  }

  /** Appends another indexed geometry (position/normal/uv). */
  append(g: THREE.BufferGeometry) {
    const base = this.pos.length / 3;
    const p = g.getAttribute("position");
    const n = g.getAttribute("normal");
    const uv = g.getAttribute("uv");
    for (let i = 0; i < p.count; i++) {
      this.pos.push(p.getX(i), p.getY(i), p.getZ(i));
      this.nrm.push(n.getX(i), n.getY(i), n.getZ(i));
      this.uv.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
    }
    const index = g.getIndex();
    if (index) for (let i = 0; i < index.count; i++) this.idx.push(base + index.getX(i));
    else for (let i = 0; i < p.count; i++) this.idx.push(base + i);
  }

  /** Applies an affine map to positions and wires; normals use the inverse-transpose. */
  transform(m: THREE.Matrix4) {
    const v = new THREE.Vector3();
    const nm = new THREE.Matrix3().getNormalMatrix(m);
    for (let i = 0; i < this.pos.length; i += 3) {
      v.set(this.pos[i], this.pos[i + 1], this.pos[i + 2]).applyMatrix4(m);
      this.pos[i] = v.x;
      this.pos[i + 1] = v.y;
      this.pos[i + 2] = v.z;
      v.set(this.nrm[i], this.nrm[i + 1], this.nrm[i + 2]).applyMatrix3(nm).normalize();
      this.nrm[i] = v.x;
      this.nrm[i + 1] = v.y;
      this.nrm[i + 2] = v.z;
    }
    for (const tier of ["major", "minor", "accent"] as const) {
      const w = this.wires[tier];
      for (let i = 0; i < w.length; i += 3) {
        v.set(w[i], w[i + 1], w[i + 2]).applyMatrix4(m);
        w[i] = v.x;
        w[i + 1] = v.y;
        w[i + 2] = v.z;
      }
    }
  }

  bounds() {
    const min: Vec3 = [Infinity, Infinity, Infinity];
    const max: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < this.pos.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        const c = this.pos[i + k];
        if (c < min[k]) min[k] = c;
        if (c > max[k]) max[k] = c;
      }
    }
    return { min, max };
  }

  toGeometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }

  wireGeometry(): WireframeGeometry {
    const make = (arr: number[]) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(arr, 3));
      g.computeBoundingSphere();
      return g;
    };
    return { major: make(this.wires.major), minor: make(this.wires.minor), accent: make(this.wires.accent) };
  }
}

interface GridOptions {
  /** Columns wrap around (closed loop). The seam column is duplicated for UVs. */
  wrap: boolean;
  /** Flip normals and winding. */
  flip?: boolean;
  /** UV per grid point (column index may equal the column count on wrapped grids). */
  uv?: (col: number, row: number, p: Vec3) => Vec2;
}

/**
 * Smooth surface through a grid of points P[row][col]. Normals come from
 * central differences across the grid (so the same code shades lathes,
 * twisted prisms and extrusions), oriented as cross(dCol, dRow).
 * Degenerate points (poles) borrow the average normal of the next row.
 */
function addGrid(b: MeshBuilder, P: Vec3[][], opts: GridOptions) {
  const rows = P.length;
  const cols = P[0].length;
  const N: Vec3[][] = [];
  const sign = opts.flip ? -1 : 1;
  for (let j = 0; j < rows; j++) {
    const row: Vec3[] = [];
    for (let i = 0; i < cols; i++) {
      let du: Vec3;
      if (opts.wrap) du = sub(P[j][(i + 1) % cols], P[j][(i - 1 + cols) % cols]);
      else du = sub(P[j][Math.min(i + 1, cols - 1)], P[j][Math.max(i - 1, 0)]);
      const dv = sub(P[Math.min(j + 1, rows - 1)][i], P[Math.max(j - 1, 0)][i]);
      const n = cross(du, dv);
      const l = len(n);
      row.push(l > 1e-12 ? [(sign * n[0]) / l, (sign * n[1]) / l, (sign * n[2]) / l] : [0, 0, 0]);
    }
    N.push(row);
  }
  // Poles: average the neighbouring row.
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      if (N[j][i][0] !== 0 || N[j][i][1] !== 0 || N[j][i][2] !== 0) continue;
      const nb = N[j + 1 < rows ? j + 1 : j - 1];
      const acc: Vec3 = [0, 0, 0];
      for (const n of nb) {
        acc[0] += n[0];
        acc[1] += n[1];
        acc[2] += n[2];
      }
      N[j][i] = normalize(acc);
    }
  }

  const outCols = opts.wrap ? cols + 1 : cols;
  const base = b.pos.length / 3;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < outCols; i++) {
      const src = i % cols;
      const p = P[j][src];
      const uv: Vec2 = opts.uv ? opts.uv(i, j, p) : [i / (outCols - 1), rows > 1 ? j / (rows - 1) : 0];
      b.vert(p, N[j][src], uv);
    }
  }
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < outCols - 1; i++) {
      const a = base + j * outCols + i;
      const bb = a + 1;
      const c = a + outCols + 1;
      const d = a + outCols;
      if (opts.flip) b.idx.push(a, c, bb, a, d, c);
      else b.idx.push(a, bb, c, a, c, d);
    }
  }
}

/** Revolves profile stations (radius, y) into rows of `cols` points. */
function lathe(cols: number, stations: Vec2[], rFn?: (col: number, r: number, y: number) => number): Vec3[][] {
  return stations.map(([r, y]) => {
    const row: Vec3[] = [];
    for (let i = 0; i < cols; i++) {
      const th = (i / cols) * TAU;
      const rr = rFn ? rFn(i, r, y) : r;
      row.push([rr * Math.cos(th), y, rr * Math.sin(th)]);
    }
    return row;
  });
}

const ringOf = (P: Vec3[][], j: number) => P[j].slice();
const columnOf = (P: Vec3[][], i: number, from = 0, to = P.length - 1) => {
  const out: Vec3[] = [];
  for (let j = from; j <= to; j++) out.push(P[j][i]);
  return out;
};

function finish(b: MeshBuilder, kind: ModelKind, recentre: boolean, extra?: Partial<ModelInfo>): CacheEntry {
  if (recentre) {
    const { min, max } = b.bounds();
    b.transform(new THREE.Matrix4().makeTranslation(-(min[0] + max[0]) / 2, -min[1], -(min[2] + max[2]) / 2));
  }
  const mesh = b.toGeometry();
  const bb = mesh.boundingBox as THREE.Box3;
  const size = { w: bb.max.x - bb.min.x, h: bb.max.y - bb.min.y, d: bb.max.z - bb.min.z };
  const info: ModelInfo = { kind, size, height: bb.max.y, ...extra };
  mesh.userData = { kind, height: info.height };
  return { mesh, wire: b.wireGeometry(), info };
}

/** Scales the piece to fill w × h × d per axis (normals follow). */
function fitAxes(b: MeshBuilder, dims: Dims) {
  const { min, max } = b.bounds();
  const sx = dims.w * MM / (max[0] - min[0]);
  const sy = dims.h * MM / (max[1] - min[1]);
  const sz = dims.d * MM / (max[2] - min[2]);
  b.transform(
    new THREE.Matrix4()
      .makeScale(sx, sy, sz)
      .multiply(new THREE.Matrix4().makeTranslation(-(min[0] + max[0]) / 2, -min[1], -(min[2] + max[2]) / 2)),
  );
}

/** Uniform scale so the piece fits inside w × h × d with its proportions kept. */
function fitUniform(b: MeshBuilder, dims: Dims) {
  const { min, max } = b.bounds();
  const s = Math.min(
    (dims.w * MM) / (max[0] - min[0]),
    (dims.h * MM) / (max[1] - min[1]),
    (dims.d * MM) / (max[2] - min[2]),
  );
  b.transform(
    new THREE.Matrix4()
      .makeScale(s, s, s)
      .multiply(new THREE.Matrix4().makeTranslation(-(min[0] + max[0]) / 2, -min[1], -(min[2] + max[2]) / 2)),
  );
}

/* -------------------------------------------------------------------------- */
/* Builders                                                                   */
/* -------------------------------------------------------------------------- */

function build(kind: ModelKind, dims: Dims): CacheEntry {
  switch (kind) {
    case "ripple-vase":
      return buildRippleVase(dims);
    case "lattice-lamp":
      return buildLatticeLamp(dims);
    case "facet-planter":
      return buildFacetPlanter(dims);
    case "spiral-cup":
      return buildSpiralCup(dims);
    case "arc-stand":
      return buildArcStand(dims);
    case "hex-coaster":
      return buildCoasterStack(dims);
    case "knot-sculpture":
      return buildKnot(dims);
    case "wave-bowl":
      return buildWaveBowl(dims);
  }
}

/* ---------------------------------- Vase ---------------------------------- */

function buildRippleVase(dims: Dims): CacheEntry {
  const b = new MeshBuilder();
  const H = dims.h * MM;
  const R = Math.min(dims.w, dims.d) / 200;
  const { ridges, amp, twist, wall, floor } = RIPPLE;
  const cols = ridges * 10;
  const yTop = H - wall / 2;

  // Columns follow the twist, so every column runs along one ridge phase and
  // the ridges stay crisp instead of zig-zagging across the triangle grid.
  const point = (i: number, y: number, inset: number): Vec3 => {
    const t = y / H;
    const thI = (i / cols) * TAU;
    const th = thI - twist * t;
    const r = R * rippleBase(t) * (1 + amp * Math.cos(ridges * thI)) - inset;
    return [r * Math.cos(th), y, r * Math.sin(th)];
  };
  const row = (y: number, inset: number) => Array.from({ length: cols }, (_, i) => point(i, y, inset));

  // Outer wall → rounded lip → inner wall: one smooth surface.
  const P: Vec3[][] = [];
  const outerRows = 52;
  for (let j = 0; j <= outerRows; j++) P.push(row((j / outerRows) * yTop, 0));
  const lipSteps = 6;
  for (let k = 1; k < lipSteps; k++) {
    const phi = (k / lipSteps) * Math.PI;
    P.push(row(yTop + (wall / 2) * Math.sin(phi), (wall / 2) * (1 - Math.cos(phi))));
  }
  const innerRows = 26;
  for (let j = 0; j <= innerRows; j++) P.push(row(lerp(yTop, floor, j / innerRows), wall));
  const uv = (i: number, _j: number, p: Vec3): Vec2 => [i / cols, p[1] / H];
  addGrid(b, P, { wrap: true, flip: true, uv });

  // Bottom disc (faces down) and the raised inner floor (faces up).
  const disc = (y: number, inset: number, down: boolean) => {
    const edge = row(y, inset);
    const D: Vec3[][] = [1, 0.7, 0.4, 0.15, 0].map((s) => edge.map((p) => [p[0] * s, y, p[2] * s] as Vec3));
    addGrid(b, D, { wrap: true, flip: !down, uv });
  };
  disc(0, 0, true);
  disc(floor, wall, false);

  // Wire: ridge crests (twisted), a few iso-rings, lip and footprint.
  for (let k = 0; k < ridges; k++) b.line("minor", columnOf(P, k * 10, 0, outerRows));
  for (let j = 8; j < outerRows; j += 9) b.line("minor", ringOf(P, j), true);
  b.line("major", ringOf(P, outerRows + lipSteps / 2), true);
  b.line("major", ringOf(P, P.length - 1), true);
  b.line("accent", ringOf(P, 0), true);

  return finish(b, "ripple-vase", false);
}

/* ---------------------------------- Lamp ---------------------------------- */

function buildLatticeLamp(dims: Dims): CacheEntry {
  const b = new MeshBuilder();
  const L = lampLayout(dims);
  const { H, R, baseH, shadeR } = L;
  const wall = 2 * MM;
  const cols = LAMP_TILES_AROUND * 8;
  const uv = (i: number, _j: number, p: Vec3): Vec2 => [i / cols, p[1] / H];
  const pinned = (i: number): Vec2 => [i / cols, 0];

  // Shade: outer wall (y up), then inner wall (y down). Rim between them.
  const shadeRows = 44;
  const ys = Array.from({ length: shadeRows + 1 }, (_, j) => lerp(baseH, H, j / shadeRows));
  const outer = lathe(cols, ys.map((y) => [shadeR(y), y] as Vec2));
  const inner = lathe(cols, [...ys].reverse().map((y) => [shadeR(y) - wall, y] as Vec2));
  addGrid(b, outer, { wrap: true, flip: true, uv });
  addGrid(b, inner, { wrap: true, flip: true, uv });
  const rim = lathe(cols, [
    [shadeR(H), H],
    [shadeR(H) - wall, H],
  ]);
  addGrid(b, rim, { wrap: true, flip: true, uv });

  // Base ring: bottom, outer wall, chamfer, top, recess, socket plate.
  const ringR = 0.92 * R;
  const ch = 1.5 * MM;
  const recessR = 0.6 * R;
  const plateY = 0.55 * baseH;
  const socketR = 0.11 * R;
  const segs: { st: Vec2[]; flip: boolean; pin?: boolean }[] = [
    { st: [[0, 0], [recessR * 0.5, 0], [recessR, 0], [ringR, 0]], flip: true },
    { st: [[ringR, 0], [ringR, baseH - ch]], flip: true },
    { st: [[ringR, baseH - ch], [ringR - ch, baseH]], flip: true },
    { st: [[ringR - ch, baseH], [recessR, baseH]], flip: true },
    { st: [[recessR, baseH], [recessR, plateY]], flip: true },
    { st: [[recessR, plateY], [socketR, plateY]], flip: true },
    { st: [[socketR, plateY], [socketR, L.socketTop]], flip: true, pin: true },
    { st: [[socketR, L.socketTop], [socketR * 0.5, L.socketTop], [0, L.socketTop]], flip: true, pin: true },
  ];
  for (const s of segs) {
    addGrid(b, lathe(cols, s.st), { wrap: true, flip: s.flip, uv: s.pin ? pinned : uv });
  }

  // Wire: lattice outlines on the outer surface, band edges, rims, base ring.
  const lift = 0.4 * MM;
  const onShade = (cx: number, cy: number): Vec3 => {
    const th = (cx / LAMP_TILES_AROUND) * TAU;
    const y = (L.range[0] + (cy / L.rows) * (L.range[1] - L.range[0])) * H;
    const r = shadeR(y) + lift;
    return [r * Math.cos(th), y, r * Math.sin(th)];
  };
  const a = STAR_HALF;
  const inner8 = a * Math.hypot(1, Math.SQRT2 - 1);
  for (let tx = 0; tx < LAMP_TILES_AROUND; tx++) {
    for (let ty = 0; ty < L.rows; ty++) {
      const star: Vec3[] = [];
      for (let k = 0; k < 16; k++) {
        const ang = (k * Math.PI) / 8;
        const rr = k % 2 === 0 ? a * Math.SQRT2 : inner8;
        // Two samples per edge so the outline hugs the barrel.
        star.push(onShade(tx + 0.5 + rr * Math.cos(ang), ty + 0.5 + rr * Math.sin(ang)));
      }
      const dense: Vec3[] = [];
      for (let k = 0; k < 16; k++) {
        const p = star[k];
        const q = star[(k + 1) % 16];
        dense.push(p, [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2]);
      }
      b.line("major", dense, true);
      if (ty > 0) {
        const c = CORNER_HALF;
        b.line(
          "minor",
          [
            onShade(tx - c, ty - c),
            onShade(tx + c, ty - c),
            onShade(tx + c, ty + c),
            onShade(tx - c, ty + c),
          ],
          true,
        );
      }
    }
  }
  const ring = (r: number, y: number) =>
    Array.from({ length: cols }, (_, i) => [r * Math.cos((i / cols) * TAU), y, r * Math.sin((i / cols) * TAU)] as Vec3);
  b.line("minor", ring(shadeR(L.range[0] * H) + lift, L.range[0] * H), true);
  b.line("minor", ring(shadeR(L.range[1] * H) + lift, L.range[1] * H), true);
  b.line("major", ring(shadeR(H), H), true);
  b.line("major", ring(ringR, baseH - ch), true);
  b.line("major", ring(shadeR(baseH) + lift, baseH + lift), true);
  b.line("accent", ring(ringR, 0), true);

  return finish(b, "lattice-lamp", false, {
    lamp: {
      bulbY: L.bulbY,
      bulbRadius: L.bulbRadius,
      pattern: { repeat: [LAMP_TILES_AROUND, L.rows], range: L.range },
    },
  });
}

/* --------------------------------- Planter -------------------------------- */

interface RingPt {
  p: Vec3;
  a: number;
}

/** Triangulates the band between two closed rings by walking both in angle order. */
function ringStrip(
  b: MeshBuilder,
  lo: RingPt[],
  hi: RingPt[],
  outward: boolean,
  uvOf: (p: Vec3) => Vec2,
  edges?: Map<string, [Vec3, Vec3]>,
) {
  const nA = lo.length;
  const nB = hi.length;
  // Unwrapped, increasing angles. The upper ring starts at its vertex just before lo[0].
  const a0 = lo[0].a;
  const angA: number[] = [a0];
  for (let k = 1; k <= nA; k++) {
    let a = lo[k % nA].a;
    while (a <= angA[k - 1]) a += TAU;
    angA.push(a);
  }
  let start = 0;
  let best = Infinity;
  for (let k = 0; k < nB; k++) {
    let d = a0 - hi[k].a;
    d = ((d % TAU) + TAU) % TAU;
    if (d < best) {
      best = d;
      start = k;
    }
  }
  const hiAt = (k: number) => hi[(start + k) % nB];
  const angB: number[] = [a0 - best];
  for (let k = 1; k <= nB; k++) {
    let a = hiAt(k).a;
    while (a <= angB[k - 1]) a += TAU;
    angB.push(a);
  }
  const towards = (p: Vec3, q: Vec3, r: Vec3): Vec3 => {
    const cx = (p[0] + q[0] + r[0]) / 3;
    const cz = (p[2] + q[2] + r[2]) / 3;
    return outward ? [cx, 0, cz] : [-cx, 0, -cz];
  };
  const edge = (p: Vec3, q: Vec3) => {
    if (!edges) return;
    const k1 = p.map((c) => c.toFixed(5)).join(",");
    const k2 = q.map((c) => c.toFixed(5)).join(",");
    edges.set(k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`, [p, q]);
  };
  let i = 0;
  let j = 0;
  while (i < nA || j < nB) {
    const p0 = lo[i % nA].p;
    const q0 = hiAt(j).p;
    if (j >= nB || (i < nA && angA[i + 1] <= angB[j + 1])) {
      const p1 = lo[(i + 1) % nA].p;
      b.flatTri(p0, p1, q0, towards(p0, p1, q0), uvOf);
      edge(p0, p1);
      edge(p1, q0);
      i++;
    } else {
      const q1 = hiAt(j + 1).p;
      b.flatTri(p0, q1, q0, towards(p0, q1, q0), uvOf);
      edge(q0, q1);
      edge(p0, q1);
      j++;
    }
  }
}

/** Flat band between two rings with the same vertex count (rims, floors). */
function ringQuads(b: MeshBuilder, A: Vec3[], B: Vec3[], towards: Vec3, uvOf: (p: Vec3) => Vec2) {
  const n = A.length;
  for (let i = 0; i < n; i++) {
    const a0 = A[i];
    const a1 = A[(i + 1) % n];
    const b0 = B[i];
    const b1 = B[(i + 1) % n];
    b.flatTri(a0, a1, b1, towards, uvOf);
    b.flatTri(a0, b1, b0, towards, uvOf);
  }
}

function buildFacetPlanter(dims: Dims): CacheEntry {
  const b = new MeshBuilder();
  const H = dims.h * MM;
  const R = Math.min(dims.w, dims.d) / 200;
  const rnd = seeded(0x51a7e5);
  const jit = (amt: number) => (rnd() * 2 - 1) * amt;
  const uvOf = (p: Vec3): Vec2 => [(Math.atan2(p[2], p[0]) / TAU + 1) % 1, p[1] / H];
  const seg = 8;
  const step = TAU / seg;

  // Saucer: a shallow octagonal tray, wider than the pot's foot.
  const saucerH = Math.max(0.08 * H, 6 * MM);
  const saucerFloor = 2.5 * MM;
  const saucerTop = 0.84 * R;
  const saucerBottom = 0.8 * R;
  const saucerWall = 2.5 * MM;
  const potWall = 2.4 * MM;
  const potFloor = 5 * MM;
  const potBase = saucerFloor + 0.3 * MM;

  // Pot rings: 4 bands, alternate rings turned by half a facet (anti-prism),
  // radius / angle / height jitter from a fixed seed for the hand-cut look.
  const levels = [0, 0.26, 0.52, 0.77, 1];
  const rings: RingPt[][] = levels.map((t, k) => {
    const y = lerp(potBase, H, k > 0 && k < levels.length - 1 ? t + jit(0.035) : t);
    const r = R * lerp(0.64, 1, Math.pow(t, 0.82));
    const off = (k % 2) * (step / 2);
    return Array.from({ length: seg }, (_, i) => {
      const a = off + i * step + (k === 0 ? 0 : jit(0.05));
      const rr = r * (1 + (k === 0 ? jit(0.015) : jit(0.035)));
      const yy = k > 0 && k < levels.length - 1 ? y + jit(0.012 * H) : y;
      return { p: [rr * Math.cos(a), yy, rr * Math.sin(a)] as Vec3, a };
    });
  });
  const facetEdges = new Map<string, [Vec3, Vec3]>();
  for (let k = 0; k < rings.length - 1; k++) ringStrip(b, rings[k], rings[k + 1], true, uvOf, facetEdges);

  // Inner wall: the same rings pulled in by the wall thickness, from the floor up.
  const shrink = (ring: RingPt[], y?: number): RingPt[] =>
    ring.map(({ p, a }) => {
      const r = Math.hypot(p[0], p[2]);
      const s = (r - potWall / Math.cos(step / 2)) / r;
      return { p: [p[0] * s, y ?? p[1], p[2] * s], a };
    });
  const floorY = potBase + potFloor;
  // Floor ring: ring 0 lifted to the floor height and blended towards ring 1.
  const lift = (floorY - potBase) / (rings[1][0].p[1] - potBase);
  const floorRing: RingPt[] = rings[0].map(({ p, a }) => {
    const r = Math.hypot(p[0], p[2]);
    const r1 = R * lerp(0.64, 1, Math.pow(levels[1], 0.82));
    const rr = lerp(r, r1, lift);
    return { p: [rr * Math.cos(a), floorY, rr * Math.sin(a)], a };
  });
  const innerRings = [shrink(floorRing), ...rings.slice(1).map((r) => shrink(r))];
  for (let k = 0; k < innerRings.length - 1; k++) ringStrip(b, innerRings[k], innerRings[k + 1], false, uvOf);

  // Rim, floor with a drainage hole, the hole's tube and the pot bottom.
  const top = rings[rings.length - 1].map((r) => r.p);
  const topIn = innerRings[innerRings.length - 1].map((r) => r.p);
  ringQuads(b, top, topIn, [0, 1, 0], uvOf);
  const holeR = 0.11 * R;
  const hole = (y: number) => rings[0].map(({ a }) => [holeR * Math.cos(a), y, holeR * Math.sin(a)] as Vec3);
  ringQuads(b, innerRings[0].map((r) => r.p), hole(floorY), [0, 1, 0], uvOf);
  const hTop = hole(floorY);
  const hBot = hole(potBase);
  for (let i = 0; i < seg; i++) {
    const n = (i + 1) % seg;
    const c: Vec3 = [-(hTop[i][0] + hTop[n][0]) / 2, 0, -(hTop[i][2] + hTop[n][2]) / 2];
    b.flatTri(hBot[i], hBot[n], hTop[n], c, uvOf);
    b.flatTri(hBot[i], hTop[n], hTop[i], c, uvOf);
  }
  ringQuads(b, rings[0].map((r) => r.p), hBot, [0, -1, 0], uvOf);

  // Saucer.
  const sOff = step / 2;
  const sRing = (r: number, y: number) =>
    Array.from({ length: seg }, (_, i) => {
      const a = sOff + i * step;
      return [r * Math.cos(a), y, r * Math.sin(a)] as Vec3;
    });
  const sBot = sRing(saucerBottom, 0);
  const sTop = sRing(saucerTop, saucerH);
  const sTopIn = sRing(saucerTop - saucerWall / Math.cos(step / 2), saucerH);
  const sFloor = sRing(saucerBottom - saucerWall / Math.cos(step / 2) - 1 * MM, saucerFloor);
  for (let i = 0; i < seg; i++) {
    const n = (i + 1) % seg;
    const out: Vec3 = [(sBot[i][0] + sBot[n][0]) / 2, 0, (sBot[i][2] + sBot[n][2]) / 2];
    b.flatTri(sBot[i], sBot[n], sTop[n], out, uvOf);
    b.flatTri(sBot[i], sTop[n], sTop[i], out, uvOf);
    const inw: Vec3 = [-out[0], 0, -out[2]];
    b.flatTri(sFloor[i], sFloor[n], sTopIn[n], inw, uvOf);
    b.flatTri(sFloor[i], sTopIn[n], sTopIn[i], inw, uvOf);
    b.flatTri([0, saucerFloor, 0], sFloor[i], sFloor[n], [0, 1, 0], uvOf);
    b.flatTri([0, 0, 0], sBot[i], sBot[n], [0, -1, 0], uvOf);
  }
  ringQuads(b, sTop, sTopIn, [0, 1, 0], uvOf);

  // Wire: every facet edge of the pot, rims and the saucer outline.
  for (const [p, q] of facetEdges.values()) b.line("minor", [p, q]);
  b.line("major", top, true);
  b.line("major", topIn, true);
  b.line("major", sTop, true);
  for (let i = 0; i < seg; i++) b.line("minor", [sBot[i], sTop[i]]);
  b.line("accent", sBot, true);

  fitAxes(b, dims);
  return finish(b, "facet-planter", true);
}

/* ----------------------------------- Cup ---------------------------------- */

function buildSpiralCup(dims: Dims): CacheEntry {
  const b = new MeshBuilder();
  const H = dims.h * MM;
  const halfW = Math.min(dims.w, dims.d) / 200;
  const corner = 6 * MM;
  const wall = 2 * MM;
  const floor = 8 * MM; // weighted base
  // Max extent = (apothem − corner)/cos30° + corner = w/2; the 60° twist sweeps it all round.
  const apothem = (halfW - corner) * Math.cos(Math.PI / 6) + corner;
  const ARC = 6;
  const FLAT = 4;
  const cols = 6 * (ARC + FLAT);
  const twist = Math.PI / 3;
  const yTop = H - wall / 2;

  const point = (i: number, y: number, inset: number): Vec3 => {
    const p = roundedPolygonPoint(6, apothem, corner, inset, i, ARC, FLAT, twist * (y / H));
    return [p.x, y, p.z];
  };
  const row = (y: number, inset: number) => Array.from({ length: cols }, (_, i) => point(i, y, inset));
  const uv = (i: number, _j: number, p: Vec3): Vec2 => [i / cols, p[1] / H];

  const P: Vec3[][] = [];
  const outerRows = 44;
  for (let j = 0; j <= outerRows; j++) P.push(row((j / outerRows) * yTop, 0));
  const lipSteps = 6;
  for (let k = 1; k < lipSteps; k++) {
    const phi = (k / lipSteps) * Math.PI;
    P.push(row(yTop + (wall / 2) * Math.sin(phi), (wall / 2) * (1 - Math.cos(phi))));
  }
  const innerRows = 32;
  for (let j = 0; j <= innerRows; j++) P.push(row(lerp(yTop, floor, j / innerRows), wall));
  addGrid(b, P, { wrap: true, flip: true, uv });

  const disc = (y: number, inset: number, down: boolean) => {
    const D = [inset, inset + 0.04 * apothem, inset + 0.15 * apothem, 0.4 * apothem, 0.75 * apothem, apothem].map((o) =>
      row(y, Math.min(o, apothem)),
    );
    addGrid(b, D, { wrap: true, flip: !down, uv });
  };
  disc(0, 0, true);
  disc(floor, wall, false);

  // Wire: the six twisting corners, a few rings, lip and footprint.
  for (let k = 0; k < 6; k++) b.line("major", columnOf(P, k * (ARC + FLAT) + ARC / 2, 0, outerRows));
  for (let j = 11; j < outerRows; j += 11) b.line("minor", ringOf(P, j), true);
  for (let k = 0; k < 6; k++) b.line("minor", columnOf(P, k * (ARC + FLAT) + ARC + FLAT / 2, 0, outerRows));
  b.line("major", ringOf(P, outerRows + lipSteps / 2), true);
  b.line("accent", ringOf(P, 0), true);

  return finish(b, "spiral-cup", false);
}

/* ------------------------------- Phone stand ------------------------------ */

type Loop = Vec2[]; // closed polyline in (z, y)

/** A profile loop with outward unit normals taken from the SDF gradient. */
interface ProfileLoop {
  pts: Vec2[];
  nrm: Vec2[];
}

function profileLoops(sdf: (z: number, y: number) => number, loops: Loop[]): ProfileLoop[] {
  const h = 0.02;
  return loops
    .sort((a, c) => Math.abs(loopArea(c)) - Math.abs(loopArea(a)))
    .map((pts) => ({
      pts,
      nrm: pts.map(([z, y]) => {
        const gz = sdf(z + h, y) - sdf(z - h, y);
        const gy = sdf(z, y + h) - sdf(z, y - h);
        const m = Math.sqrt(gz * gz + gy * gy) || 1;
        return [gz / m, gy / m] as Vec2;
      }),
    }));
}

const sdRoundBox = (px: number, py: number, cx: number, cy: number, hx: number, hy: number, r: number) => {
  const qx = Math.abs(px - cx) - hx + r;
  const qy = Math.abs(py - cy) - hy + r;
  const mx = Math.max(qx, 0);
  const my = Math.max(qy, 0);
  return Math.sqrt(mx * mx + my * my) + Math.min(Math.max(qx, qy), 0) - r;
};
const sdSegment = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
  const pax = px - ax;
  const pay = py - ay;
  const bax = bx - ax;
  const bay = by - ay;
  const h = clamp((pax * bax + pay * bay) / (bax * bax + bay * bay), 0, 1);
  const dx = pax - bax * h;
  const dy = pay - bay * h;
  return Math.sqrt(dx * dx + dy * dy);
};
const smin = (a: number, b: number, k: number) => {
  const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
  return lerp(b, a, h) - k * h * (1 - h);
};
const bezier = (p0: Vec2, c: Vec2, p1: Vec2, n: number): Vec2[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const u = 1 - t;
    return [u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]];
  });
const sdPolyline = (px: number, py: number, pts: Vec2[]) => {
  let d = Infinity;
  for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, sdSegment(px, py, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
  return d;
};

/**
 * Side profile of the Arc stand in millimetres (z = towards the viewer,
 * y = up), designed for 90 mm deep × 120 mm tall:
 * - a 6 mm foot along the desk,
 * - a backrest bowed slightly backwards, leaning 65° (its chord),
 * - a rear arc brace that turns the space under the backrest into a window,
 * - fillets everywhere (smooth union), like a well-tuned print.
 * The front lip is a separate profile (teeth) so the cable notch can cut it.
 */
const STAND = (() => {
  const back0: Vec2 = [20, 4];
  const back1: Vec2 = [-31, 116];
  const dz = back1[0] - back0[0];
  const dy = back1[1] - back0[1];
  const l = Math.hypot(dz, dy);
  const nb: Vec2 = [-dy / l, dz / l]; // points backwards/down
  const mid: Vec2 = [(back0[0] + back1[0]) / 2 + nb[0] * 10, (back0[1] + back1[1]) / 2 + nb[1] * 10];
  const backrest = bezier(back0, mid, back1, 16);
  const join = backrest[10];
  const brace = bezier([-40.5, 4], [-44, 58], join, 16);
  return { backrest, brace };
})();

function standBodySdf(z: number, y: number) {
  const foot = sdRoundBox(z, y, (-45 + 44.7) / 2, 3, (45 + 44.7) / 2, 3, 2.2);
  const back = sdPolyline(z, y, STAND.backrest) - 3;
  const brace = sdPolyline(z, y, STAND.brace) - 2.25;
  return smin(smin(foot, back, 3.5), brace, 3.5);
}

function standToothSdf(z: number, y: number) {
  // The lip alone forms the front face; a short low foot behind it only adds
  // the fillet into the ledge (everything below y = 5.6 is buried in the body).
  const lip = sdRoundBox(z, y, 41, 9.5, 4, 9.5, 2.6);
  const foot = sdRoundBox(z, y, 35, 2.8, 4, 2.8, 1.5);
  return smin(lip, foot, 3);
}

/** Marching squares on an SDF → closed loops (solid on the left, outer CCW, holes CW). */
function contourLoops(sdf: (z: number, y: number) => number, z0: number, z1: number, y0: number, y1: number, step: number): Loop[] {
  const nx = Math.ceil((z1 - z0) / step);
  const ny = Math.ceil((y1 - y0) / step);
  const f = new Float64Array((nx + 1) * (ny + 1));
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) f[j * (nx + 1) + i] = sdf(z0 + i * step, y0 + j * step);
  const at = (i: number, j: number) => f[j * (nx + 1) + i];
  // Edge points keyed by edge id so segments can be chained.
  const point = (i0: number, j0: number, i1: number, j1: number): { k: string; p: Vec2 } => {
    const a = at(i0, j0);
    const c = at(i1, j1);
    const t = a / (a - c);
    const key = i0 === i1 ? `v${i0},${Math.min(j0, j1)}` : `h${Math.min(i0, i1)},${j0}`;
    return { k: key, p: [z0 + lerp(i0, i1, t) * step, y0 + lerp(j0, j1, t) * step] };
  };
  const next = new Map<string, string>();
  const pts = new Map<string, Vec2>();
  const seg = (a: { k: string; p: Vec2 }, c: { k: string; p: Vec2 }) => {
    // Inside (negative) stays on the left of a → c.
    next.set(a.k, c.k);
    pts.set(a.k, a.p);
    pts.set(c.k, c.p);
  };
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const v0 = at(i, j) < 0 ? 1 : 0; // bottom-left
      const v1 = at(i + 1, j) < 0 ? 1 : 0; // bottom-right
      const v2 = at(i + 1, j + 1) < 0 ? 1 : 0; // top-right
      const v3 = at(i, j + 1) < 0 ? 1 : 0; // top-left
      const c = v0 | (v1 << 1) | (v2 << 2) | (v3 << 3);
      if (c === 0 || c === 15) continue;
      const B = () => point(i, j, i + 1, j);
      const Rt = () => point(i + 1, j, i + 1, j + 1);
      const T = () => point(i, j + 1, i + 1, j + 1);
      const Lf = () => point(i, j, i, j + 1);
      // Each case lists segments with the inside on the right of travel.
      switch (c) {
        case 1: seg(Lf(), B()); break;
        case 2: seg(B(), Rt()); break;
        case 3: seg(Lf(), Rt()); break;
        case 4: seg(Rt(), T()); break;
        case 5: seg(Lf(), T()); seg(Rt(), B()); break;
        case 6: seg(B(), T()); break;
        case 7: seg(Lf(), T()); break;
        case 8: seg(T(), Lf()); break;
        case 9: seg(T(), B()); break;
        case 10: seg(T(), Rt()); seg(B(), Lf()); break;
        case 11: seg(T(), Rt()); break;
        case 12: seg(Rt(), Lf()); break;
        case 13: seg(Rt(), B()); break;
        case 14: seg(B(), Lf()); break;
      }
    }
  }
  const loops: Loop[] = [];
  const seen = new Set<string>();
  for (const startKey of next.keys()) {
    if (seen.has(startKey)) continue;
    const loop: Vec2[] = [];
    let k: string | undefined = startKey;
    while (k !== undefined && !seen.has(k)) {
      seen.add(k);
      loop.push(pts.get(k) as Vec2);
      k = next.get(k);
    }
    if (loop.length > 8) loops.push(loop);
  }
  // Segments above keep the inside on the right; reverse so solid is on the left (outer CCW).
  return loops.map((l) => simplifyLoop(l.reverse(), 0.02));
}

/** Ramer–Douglas–Peucker on a closed loop. */
function simplifyLoop(loop: Loop, tol: number): Loop {
  const rdp = (pts: Vec2[]): Vec2[] => {
    if (pts.length < 3) return pts;
    const [a, c] = [pts[0], pts[pts.length - 1]];
    let worst = -1;
    let wi = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = sdSegment(pts[i][0], pts[i][1], a[0], a[1], c[0], c[1]);
      if (d > worst) {
        worst = d;
        wi = i;
      }
    }
    if (worst <= tol) return [a, c];
    const left = rdp(pts.slice(0, wi + 1));
    const right = rdp(pts.slice(wi));
    return [...left.slice(0, -1), ...right];
  };
  const half = Math.floor(loop.length / 2);
  const a = rdp(loop.slice(0, half + 1));
  const c = rdp([...loop.slice(half), loop[0]]);
  const out = [...a.slice(0, -1), ...c.slice(0, -1)];
  return out.filter((p, i) => {
    const q = out[(i + 1) % out.length];
    return Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) > 1e-6;
  });
}

const loopArea = (l: Loop) => {
  let s = 0;
  for (let i = 0; i < l.length; i++) {
    const p = l[i];
    const q = l[(i + 1) % l.length];
    s += p[0] * q[1] - q[0] * p[1];
  }
  return s / 2;
};

/**
 * Extrudes a profile (outer loop + holes, in model units, (z, y)) across
 * x ∈ [x0, x1] with quarter-round bevels on both ends. Normals are analytic.
 */
function extrudeBevelled(b: MeshBuilder, loops: ProfileLoop[], x0: number, x1: number, bevel: number, steps: number, wireTier: WireTier | null) {
  const stations: { x: number; inset: number; nx: number; ns: number }[] = [];
  for (let k = 0; k <= steps; k++) {
    const phi = (k / steps) * (Math.PI / 2);
    stations.push({ x: x0 + bevel * (1 - Math.cos(phi)), inset: bevel * (1 - Math.sin(phi)), nx: -Math.cos(phi), ns: Math.sin(phi) });
  }
  for (let k = steps; k >= 0; k--) {
    const phi = (k / steps) * (Math.PI / 2);
    stations.push({ x: x1 - bevel * (1 - Math.cos(phi)), inset: bevel * (1 - Math.sin(phi)), nx: Math.cos(phi), ns: Math.sin(phi) });
  }
  const capContours: Vec2[][] = [];
  for (const { pts: loop, nrm: N } of loops) {
    const cols = loop.length;
    const base = b.pos.length / 3;
    for (const st of stations) {
      for (let i = 0; i <= cols; i++) {
        const c = i % cols;
        const [z, y] = loop[c];
        const [nz, ny] = N[c];
        const p: Vec3 = [st.x, y - ny * st.inset, z - nz * st.inset];
        const n = normalize([st.nx, ny * st.ns, nz * st.ns]);
        b.vert(p, n, [i / cols, p[1]]);
      }
    }
    const w = cols + 1;
    for (let s = 0; s < stations.length - 1; s++) {
      for (let i = 0; i < cols; i++) {
        const a = base + s * w + i;
        const bb = a + 1;
        const c = a + w + 1;
        const d = a + w;
        // Orientation is checked against the analytic normal below.
        const pa = b.pos.slice(a * 3, a * 3 + 3) as Vec3;
        const pb = b.pos.slice(bb * 3, bb * 3 + 3) as Vec3;
        const pd = b.pos.slice(d * 3, d * 3 + 3) as Vec3;
        const na = b.nrm.slice(a * 3, a * 3 + 3) as Vec3;
        const fn = cross(sub(pb, pa), sub(pd, pa));
        if (dot(fn, na) >= 0) b.idx.push(a, bb, c, a, c, d);
        else b.idx.push(a, c, bb, a, d, c);
      }
    }
    capContours.push(loop.map(([z, y], i) => [z - N[i][0] * bevel, y - N[i][1] * bevel] as Vec2));
    if (wireTier) {
      for (const xx of [x0, x1]) b.line(wireTier, capContours[capContours.length - 1].map(([z, y]) => [xx, y, z] as Vec3), true);
    }
  }
  // Caps: earcut on the inset outline (outer + holes).
  const [outer, ...holes] = capContours;
  const tris = THREE.ShapeUtils.triangulateShape(
    outer.map(([z, y]) => new THREE.Vector2(z, y)),
    holes.map((h) => h.map(([z, y]) => new THREE.Vector2(z, y))),
  );
  const flat = [outer, ...holes].flat();
  for (const [x, nx] of [
    [x0, -1],
    [x1, 1],
  ] as const) {
    for (const t of tris) {
      const [a, c, d] = t.map((k) => [x, flat[k][1], flat[k][0]] as Vec3);
      b.flatTri(a, c, d, [nx, 0, 0], (p) => [p[2], p[1]]);
    }
  }
}

function buildArcStand(dims: Dims): CacheEntry {
  const b = new MeshBuilder();
  const sz = dims.d / 90;
  const sy = dims.h / 120;
  const toModel = (loops: ProfileLoop[]): ProfileLoop[] =>
    loops.map(({ pts, nrm }) => ({
      pts: pts.map(([z, y]) => [z * sz * MM, y * sy * MM] as Vec2),
      nrm: nrm.map(([z, y]) => {
        const nz = z / sz;
        const ny = y / sy;
        const m = Math.sqrt(nz * nz + ny * ny) || 1;
        return [nz / m, ny / m] as Vec2;
      }),
    }));
  const body = toModel(profileLoops(standBodySdf, contourLoops(standBodySdf, -50, 50, -4, 126, 0.5)));
  const tooth = toModel(profileLoops(standToothSdf, contourLoops(standToothSdf, 28, 50, -4, 26, 0.35)));
  const halfW = dims.w / 200;
  const notch = 8 * MM;
  const inset = 0.4 * MM;
  const bevel = 1.2 * MM;
  extrudeBevelled(b, body, -halfW, halfW, bevel, 3, "major");
  extrudeBevelled(b, tooth, -halfW + inset, -notch, bevel, 3, "major");
  extrudeBevelled(b, tooth, notch, halfW - inset, bevel, 3, "major");

  // Construction lines along the width at evenly spaced profile points.
  const outer = body[0].pts;
  const stride = Math.max(1, Math.floor(outer.length / 18));
  for (let i = 0; i < outer.length; i += stride) {
    const [z, y] = outer[i];
    b.line("minor", [
      [-halfW + bevel, y, z],
      [halfW - bevel, y, z],
    ]);
  }
  const zf = 45 * sz * MM;
  b.line("accent", [
    [-halfW, 0, -zf],
    [halfW, 0, -zf],
    [halfW, 0, zf],
    [-halfW, 0, zf],
  ], true);

  return finish(b, "arc-stand", true);
}

/* --------------------------------- Coasters ------------------------------- */

function buildCoasterStack(dims: Dims): CacheEntry {
  const all = new MeshBuilder();
  const H = dims.h * MM;
  const apothem = dims.d / 200;
  const corner = 5 * MM;
  const ARC = 4;
  const FLAT = 3;
  const cols = 6 * (ARC + FLAT);
  const valley = H - 1.8 * MM;
  const round = 1.6 * MM;
  const chamfer = 0.6 * MM;
  // Ridge centres as insets from the edge (model units). The border ridge runs into the edge.
  const ridges = [0.095, 0.165, 0.235];
  const hw = 1.2 * MM;
  const soft = 0.6 * MM;
  const borderIn = round + 3.6 * MM;
  const height = (o: number) => {
    let r = 1 - smoothstep(borderIn - soft, borderIn + soft, o);
    for (const c of ridges) r = Math.max(r, smoothstep(c - hw - soft, c - hw + soft, o) - smoothstep(c + hw - soft, c + hw + soft, o));
    return lerp(valley, H, r);
  };
  const insets = new Set<number>([apothem, 0.32, 0.29, 0.27, round, round + 1 * MM]);
  const edgesAt = [borderIn, ...ridges.flatMap((c) => [c - hw, c + hw])];
  for (const e of edgesAt) for (const d of [-1, -0.5, 0, 0.5, 1]) insets.add(e + d * soft);
  for (let k = 0; k < edgesAt.length - 1; k++) insets.add((edgesAt[k] + edgesAt[k + 1]) / 2);
  const topInsets = [...insets].filter((o) => o >= round && o <= apothem).sort((a, c) => c - a);

  // Offset outline near the edge; inner ridges keep a small fillet that shrinks to the centre.
  const cornerFor = (o: number) => Math.max(corner - o, 2.2 * MM * Math.max(apothem - o, 0) / apothem);
  const point = (i: number, o: number, y: number): Vec3 => {
    const p = roundedPolygonPoint(6, apothem, corner, o, i, ARC, FLAT, 0, cornerFor(o));
    return [p.x, y, p.z];
  };
  const row = (o: number, y: number) => Array.from({ length: cols }, (_, i) => point(i, o, y));

  const one = new MeshBuilder();
  // Top (centre → border) → edge round → side wall: one smooth surface.
  const P: Vec3[][] = topInsets.map((o) => row(o, height(o)));
  const roundSteps = 5;
  for (let k = 1; k <= roundSteps; k++) {
    const phi = (k / roundSteps) * (Math.PI / 2);
    P.push(row(round * (1 - Math.sin(phi)), H - round * (1 - Math.cos(phi))));
  }
  P.push(row(0, chamfer));
  addGrid(one, P, { wrap: true, flip: false });
  addGrid(one, [row(0, chamfer), row(chamfer, 0)], { wrap: true, flip: false });
  addGrid(one, [row(chamfer, 0), row(0.3 * apothem, 0), row(apothem, 0)], { wrap: true, flip: false });

  // Fan the stack slightly so it reads as a set.
  const fan = [
    { rot: 0, x: 0, z: 0 },
    { rot: (7 * Math.PI) / 180, x: 1.2 * MM, z: -0.8 * MM },
    { rot: (-5 * Math.PI) / 180, x: -0.6 * MM, z: 1 * MM },
  ];
  const ringAt = (j: number) => ringOf(P, j);
  fan.forEach((f, k) => {
    const m = new THREE.Matrix4().makeTranslation(f.x, k * H, f.z).multiply(new THREE.Matrix4().makeRotationY(f.rot));
    const g = one.toGeometry();
    g.applyMatrix4(m);
    all.append(g);
    g.dispose();
    const tf = (pts: Vec3[]) => pts.map((p) => new THREE.Vector3(...p).applyMatrix4(m).toArray() as Vec3);
    all.line("major", tf(ringAt(P.length - 1)), true);
    all.line("major", tf(ringAt(topInsets.length + 2)), true);
    if (k === fan.length - 1) {
      topInsets.forEach((o, j) => {
        if (edgesAt.some((e) => Math.abs(e - o) < 1e-9)) all.line("minor", tf(ringAt(j)), true);
      });
    }
    if (k === 0) all.line("accent", tf(row(chamfer, 0)), true);
  });
  // Bring the uv.y in line with the other kinds (height fraction of the stack).
  const stackH = fan.length * H;
  for (let i = 1; i < all.uv.length; i += 2) all.uv[i] = all.pos[((i - 1) / 2) * 3 + 1] / stackH;

  return finish(all, "hex-coaster", true);
}

/* ---------------------------------- Knot ---------------------------------- */

function buildKnot(dims: Dims): CacheEntry {
  const b = new MeshBuilder();
  const TUBULAR = 320;
  const RADIAL = 24;
  const knot = new THREE.TorusKnotGeometry(1, 0.36, TUBULAR, RADIAL, 2, 3);
  // One lobe up, two lobes standing on the plinth, reclined ~15° for depth.
  knot.rotateZ(Math.PI / 2);
  knot.rotateX(-0.26);
  knot.computeBoundingBox();
  const kb = knot.boundingBox as THREE.Box3;
  const kp = knot.getAttribute("position");
  // Contact points: everything within a hair of the lowest point.
  let cx0 = Infinity;
  let cx1 = -Infinity;
  let cz = 0;
  let cn = 0;
  for (let i = 0; i < kp.count; i++) {
    if (kp.getY(i) < kb.min.y + 0.03) {
      cx0 = Math.min(cx0, kp.getX(i));
      cx1 = Math.max(cx1, kp.getX(i));
      cz += kp.getZ(i);
      cn++;
    }
  }
  cz /= Math.max(cn, 1);
  const knotH = kb.max.y - kb.min.y;
  const plinthH = knotH * 0.085;
  const plinthR = Math.max(Math.abs(cx0), Math.abs(cx1)) + 0.42;
  const embed = 0.07;
  knot.translate(0, plinthH - kb.min.y - embed, -cz);
  b.append(knot);

  // Wire: tube rings and two longitudinal lines.
  const ringPts = (i: number) => {
    const out: Vec3[] = [];
    for (let j = 0; j <= RADIAL; j++) {
      const k = i * (RADIAL + 1) + j;
      out.push([kp.getX(k), kp.getY(k), kp.getZ(k)]);
    }
    return out;
  };
  for (let i = 0; i < TUBULAR; i += 16) b.line("minor", ringPts(i));
  for (const j of [0, RADIAL / 2]) {
    const pts: Vec3[] = [];
    for (let i = 0; i <= TUBULAR; i++) {
      const k = i * (RADIAL + 1) + j;
      pts.push([kp.getX(k), kp.getY(k), kp.getZ(k)]);
    }
    b.line("major", pts);
  }
  knot.dispose();

  // Plinth: a low disc with a chamfered foot and a softly rounded top edge.
  const cols = 72;
  const r = plinthR;
  const h = plinthH;
  const e = h * 0.32;
  const c = h * 0.12;
  const side: Vec2[] = [[r - c, 0], [r, c]];
  const rounded: Vec2[] = [[r, c], [r, h - e]];
  for (let k = 1; k <= 6; k++) {
    const phi = (k / 6) * (Math.PI / 2);
    rounded.push([r - e + e * Math.cos(phi), h - e + e * Math.sin(phi)]);
  }
  rounded.push([r * 0.6, h], [0, h]);
  addGrid(b, lathe(cols, [[0, 0], [r * 0.6, 0], [r - c, 0]]), { wrap: true, flip: true });
  addGrid(b, lathe(cols, side), { wrap: true, flip: true });
  addGrid(b, lathe(cols, rounded), { wrap: true, flip: true });
  const ring = (rr: number, y: number) =>
    Array.from({ length: cols }, (_, i) => [rr * Math.cos((i / cols) * TAU), y, rr * Math.sin((i / cols) * TAU)] as Vec3);
  b.line("major", ring(r - e * 0.3, h - e * 0.05), true);
  b.line("minor", ring(r, c), true);
  b.line("accent", ring(r - c, 0), true);

  fitUniform(b, dims);
  return finish(b, "knot-sculpture", true);
}

/* ---------------------------------- Bowl ---------------------------------- */

function buildWaveBowl(dims: Dims): CacheEntry {
  const b = new MeshBuilder();
  const H = dims.h * MM;
  const R = Math.min(dims.w, dims.d) / 200;
  const wall = 2.5 * MM;
  const waves = 14;
  const cols = waves * 8;
  const ampR = 0.03 * R;
  const ampY = 1.6 * MM;
  const footH = 0.05 * H;
  const rimR = R - ampR;
  const bodyH = H - footH - wall / 2 - ampY;
  const k = 2.35;
  // Asymmetric "wind over sand" ripple, normalised to ±1.
  const ripple = (phi: number) => (Math.sin(phi) + 0.25 * Math.sin(2 * phi)) / 1.1009;
  const base = (s: number): Vec2 => [rimR * s, footH + bodyH * Math.pow(s, k)];
  const tangent = (s: number): Vec2 => {
    const dr = rimR;
    const dy = bodyH * k * Math.pow(Math.max(s, 1e-6), k - 1);
    const l = Math.hypot(dr, dy);
    return [dr / l, dy / l];
  };
  // Outward normal of the outer surface in the (r, y) plane.
  const n2 = (s: number): Vec2 => {
    const [tr, ty] = tangent(s);
    return [ty, -tr];
  };
  const point = (i: number, s: number, r: number, y: number): Vec3 => {
    const th = (i / cols) * TAU;
    const w = ripple(waves * th + 2.4 * s);
    const rr = r + ampR * Math.pow(s, 2.2) * w;
    const yy = y + ampY * Math.pow(s, 3) * w;
    return [rr * Math.cos(th), yy, rr * Math.sin(th)];
  };
  const row = (s: number, r: number, y: number) => Array.from({ length: cols }, (_, i) => point(i, s, r, y));

  const P: Vec3[][] = [];
  const outerRows = 44;
  const sOf = (j: number) => Math.pow(j / outerRows, 0.8);
  for (let j = 0; j <= outerRows; j++) {
    const s = sOf(j);
    const [r, y] = base(s);
    P.push(row(s, r, y));
  }
  // Rounded rim: half circle from the outer to the inner surface.
  const [rr1, ry1] = base(1);
  const [nr1, ny1] = n2(1);
  const [tr1, ty1] = tangent(1);
  const rimSteps = 6;
  for (let q = 1; q < rimSteps; q++) {
    const phi = (q / rimSteps) * Math.PI;
    const inward = (wall / 2) * (1 - Math.cos(phi));
    const along = (wall / 2) * Math.sin(phi);
    P.push(row(1, rr1 - nr1 * inward + tr1 * along, ry1 - ny1 * inward + ty1 * along));
  }
  for (let j = outerRows; j >= 0; j--) {
    const s = sOf(j);
    const [r, y] = base(s);
    const [nr, ny] = n2(s);
    P.push(row(s, Math.max(r - nr * wall, 0), y - ny * wall));
  }
  addGrid(b, P, { wrap: true, flip: true, uv: (i, _j, p) => [i / cols, p[1] / H] });

  // Foot ring, embedded into the underside.
  const footR = 0.36 * R;
  const fw = 2 * MM;
  const fc = 0.6 * MM;
  const under = (r: number) => footH + bodyH * Math.pow(r / rimR, k) + 1.5 * MM;
  const rOut = footR + fw;
  const rIn = footR - fw;
  addGrid(b, lathe(cols, [[rOut, under(rOut)], [rOut, fc]]), { wrap: true, flip: false });
  addGrid(b, lathe(cols, [[rOut, fc], [rOut - fc, 0]]), { wrap: true, flip: false });
  addGrid(b, lathe(cols, [[rOut - fc, 0], [rIn + fc, 0]]), { wrap: true, flip: false });
  addGrid(b, lathe(cols, [[rIn + fc, 0], [rIn, fc]]), { wrap: true, flip: false });
  addGrid(b, lathe(cols, [[rIn, fc], [rIn, under(rIn)]]), { wrap: true, flip: false });

  // Wire: wave crests sweeping out to the rim, iso-rings, rim and foot.
  for (let q = 0; q < waves; q++) {
    const i = q * 8 + 2;
    b.line("minor", columnOf(P, i, Math.floor(outerRows * 0.35), outerRows));
  }
  for (const j of [Math.floor(outerRows * 0.55), Math.floor(outerRows * 0.8)]) b.line("minor", ringOf(P, j), true);
  b.line("major", ringOf(P, outerRows + rimSteps / 2), true);
  const fRing = (rr: number, y: number) =>
    Array.from({ length: cols }, (_, i) => [rr * Math.cos((i / cols) * TAU), y, rr * Math.sin((i / cols) * TAU)] as Vec3);
  b.line("major", fRing(rOut, under(rOut) - 1.5 * MM), true);
  b.line("accent", fRing(rOut - fc, 0), true);

  fitAxes(b, dims);
  return finish(b, "wave-bowl", true);
}
