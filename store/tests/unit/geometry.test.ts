import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { Dims, ModelKind } from "@/types";
import {
  disposeGeometryCache,
  getGeometry,
  getModelInfo,
  getWireframeGeometry,
  ripplePerimeterRadius,
} from "@/components/3d/geometry";
import { SILHOUETTES } from "@/components/3d/silhouettes";
import { SHOWCASE } from "@/content/showcase";
import { PRODUCTS, getMaterial } from "@/content/catalog";
import { MODEL_DIMS, MODEL_KINDS } from "./helpers/model-kinds";

/** 1 unit = 100 mm. */
const MM = 0.01;
const TOLERANCE = 0.08;

const cases = MODEL_KINDS.flatMap((kind) => MODEL_DIMS[kind].map((dims) => [kind, dims] as [ModelKind, Dims]));
const label = (kind: ModelKind, d: Dims) => `${kind} ${d.w}×${d.d}×${d.h}`;

function box(geometry: THREE.BufferGeometry) {
  geometry.computeBoundingBox();
  const b = geometry.boundingBox as THREE.Box3;
  return {
    min: b.min.clone(),
    max: b.max.clone(),
    size: b.getSize(new THREE.Vector3()),
    centre: b.getCenter(new THREE.Vector3()),
  };
}

function allFinite(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): boolean {
  const array = (attribute as THREE.BufferAttribute).array as ArrayLike<number>;
  for (let i = 0; i < array.length; i++) if (!Number.isFinite(array[i])) return false;
  return true;
}

describe.each(cases)("getGeometry(%s, %o)", (kind, dims) => {
  const geometry = getGeometry(kind, dims);
  const name = label(kind, dims);

  it("has finite position, normal and uv attributes and a valid index", () => {
    const position = geometry.getAttribute("position");
    const normal = geometry.getAttribute("normal");
    const uv = geometry.getAttribute("uv");
    expect(position.count, name).toBeGreaterThan(0);
    expect(normal.count, name).toBe(position.count);
    expect(uv.count, name).toBe(position.count);
    expect(allFinite(position), `${name}: position has NaN/Infinity`).toBe(true);
    expect(allFinite(normal), `${name}: normal has NaN/Infinity`).toBe(true);
    expect(allFinite(uv), `${name}: uv has NaN/Infinity`).toBe(true);

    const index = geometry.getIndex();
    expect(index, name).not.toBeNull();
    expect(index!.count % 3, name).toBe(0);
    let max = 0;
    for (let i = 0; i < index!.count; i++) max = Math.max(max, index!.getX(i));
    expect(max, name).toBeLessThan(position.count);
  });

  it("has unit-length normals", () => {
    const normal = geometry.getAttribute("normal");
    const v = new THREE.Vector3();
    let worst = 0;
    for (let i = 0; i < normal.count; i++) {
      v.fromBufferAttribute(normal, i);
      worst = Math.max(worst, Math.abs(v.length() - 1));
    }
    expect(worst, name).toBeLessThan(1e-3);
  });

  it("sits on y = 0, centred on X and Z", () => {
    const b = box(geometry);
    expect(Math.abs(b.min.y), name).toBeLessThan(1e-4);
    expect(Math.abs(b.centre.x), name).toBeLessThan(1e-3);
    expect(Math.abs(b.centre.z), name).toBeLessThan(1e-3);
  });

  it("fills its dimensions (dims / 100 units, within 8%)", () => {
    const { size } = box(geometry);
    const ratio = { w: size.x / (dims.w * MM), h: size.y / (dims.h * MM), d: size.z / (dims.d * MM) };

    if (kind === "hex-coaster") {
      // A slightly fanned stack of three coasters: ≈ w × 3h × d, the fan adds up to ~6% on depth.
      expect(ratio.w, name).toBeCloseTo(1, 1);
      expect(Math.abs(ratio.h - 3), name).toBeLessThan(3 * TOLERANCE);
      expect(ratio.d, name).toBeGreaterThanOrEqual(1 - TOLERANCE);
      expect(ratio.d, name).toBeLessThanOrEqual(1 + TOLERANCE);
      return;
    }
    if (kind === "knot-sculpture") {
      // Fits inside w × h × d with its proportions kept; limited by the height.
      expect(Math.abs(ratio.h - 1), name).toBeLessThan(TOLERANCE);
      expect(ratio.w, name).toBeLessThanOrEqual(1 + 1e-3);
      expect(ratio.d, name).toBeLessThanOrEqual(1 + 1e-3);
      expect(ratio.w, name).toBeGreaterThan(0.3);
      expect(ratio.d, name).toBeGreaterThan(0.2);
      return;
    }
    for (const axis of ["w", "h", "d"] as const) {
      expect(Math.abs(ratio[axis] - 1), `${name}: ${axis} is ${(ratio[axis] * 100).toFixed(1)}% of dims`).toBeLessThan(
        TOLERANCE,
      );
    }
  });

  it("reports the same size in getModelInfo", () => {
    const { size } = box(geometry);
    const info = getModelInfo(kind, dims);
    expect(info.kind).toBe(kind);
    expect(info.size.w, name).toBeCloseTo(size.x, 2);
    expect(info.size.h, name).toBeCloseTo(size.y, 2);
    expect(info.size.d, name).toBeCloseTo(size.z, 2);
    expect(info.height, name).toBeCloseTo(info.size.h, 6);
  });

  it("builds wireframe lines with finite positions", () => {
    const wire = getWireframeGeometry(kind, dims);
    for (const part of ["major", "minor", "accent"] as const) {
      const position = wire[part].getAttribute("position");
      expect(position, `${name} ${part}`).toBeDefined();
      expect(allFinite(position), `${name} ${part}`).toBe(true);
    }
    expect(wire.major.getAttribute("position").count, name).toBeGreaterThan(0);
  });
});

describe("geometry cache", () => {
  const dims = MODEL_DIMS["ripple-vase"][0];

  it("returns the same geometry for the same kind and dims", () => {
    expect(getGeometry("ripple-vase", dims)).toBe(getGeometry("ripple-vase", { ...dims }));
  });

  it("builds a new geometry for other dims or kinds", () => {
    const a = getGeometry("ripple-vase", dims);
    expect(getGeometry("ripple-vase", { ...dims, h: dims.h + 10 })).not.toBe(a);
    expect(getGeometry("spiral-cup", dims)).not.toBe(a);
  });

  it("rebuilds after disposeGeometryCache()", () => {
    const a = getGeometry("ripple-vase", dims);
    disposeGeometryCache();
    const b = getGeometry("ripple-vase", dims);
    expect(b).not.toBe(a);
    expect(b.getAttribute("position").count).toBe(a.getAttribute("position").count);
  });
});

describe("ripplePerimeterRadius", () => {
  const dims = SHOWCASE.vase.sizes[0].dims;

  it("is finite and positive over the whole wall", () => {
    for (let t = 0; t <= 1; t += 0.05) {
      for (let theta = 0; theta < Math.PI * 2; theta += 0.1) {
        const r = ripplePerimeterRadius(t, theta, dims);
        expect(Number.isFinite(r) && r > 0, `t=${t} θ=${theta}`).toBe(true);
      }
    }
  });

  it("peaks at the vase's outer radius (w / 2)", () => {
    let max = 0;
    for (let t = 0; t <= 1; t += 0.005) {
      for (let theta = 0; theta < Math.PI * 2; theta += 0.01) max = Math.max(max, ripplePerimeterRadius(t, theta, dims));
    }
    expect(max).toBeLessThanOrEqual((dims.w / 2) * MM * 1.001);
    expect(max).toBeGreaterThan((dims.w / 2) * MM * 0.98);
  });

  it("agrees with the mesh's outer extent", () => {
    const { size } = box(getGeometry("ripple-vase", dims));
    let max = 0;
    for (let t = 0; t <= 1; t += 0.01) {
      for (let theta = 0; theta < Math.PI * 2; theta += 0.02) max = Math.max(max, ripplePerimeterRadius(t, theta, dims));
    }
    expect(max * 2).toBeCloseTo(size.x, 2);
  });
});

describe("SILHOUETTES", () => {
  it("has a path for every ModelKind and nothing else", () => {
    expect(Object.keys(SILHOUETTES).sort()).toEqual([...MODEL_KINDS].sort());
  });

  it.each(MODEL_KINDS)("%s is non-empty SVG path data inside the 0 0 100 100 box", (kind) => {
    const d = SILHOUETTES[kind];
    expect(typeof d).toBe("string");
    expect(d.trim().length).toBeGreaterThan(0);
    expect(d.trim()).toMatch(/^[Mm]/);
    expect(d).toMatch(/^[MmLlHhVvCcSsQqTtAaZz0-9.,\s+-]+$/);
    const numbers = (d.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number);
    expect(numbers.length).toBeGreaterThan(2);
    for (const n of numbers) expect(Number.isFinite(n)).toBe(true);
    // With absolute commands only, every coordinate must sit inside the box.
    if (!/[a-y]/.test(d)) {
      for (const n of numbers) {
        expect(n).toBeGreaterThanOrEqual(-0.5);
        expect(n).toBeLessThanOrEqual(100.5);
      }
    }
  });
});

describe("SHOWCASE pieces", () => {
  const pieces = Object.entries(SHOWCASE);

  it.each(pieces)("%s has a model, a material, a layer height and measured sizes", (_key, piece) => {
    expect(MODEL_KINDS).toContain(piece.model);
    expect(() => getMaterial(piece.material)).not.toThrow();
    expect(piece.layerHeight).toBeGreaterThan(0);
    expect(piece.layerHeight).toBeLessThanOrEqual(1);
    expect(piece.colors.length).toBeGreaterThan(0);
    for (const c of piece.colors) expect(c.hex).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(piece.sizes.length).toBeGreaterThan(0);
    for (const size of piece.sizes) {
      for (const axis of ["w", "d", "h"] as const) expect(size.dims[axis]).toBeGreaterThan(0);
      const geometry = getGeometry(piece.model, size.dims);
      expect(allFinite(geometry.getAttribute("position"))).toBe(true);
    }
  });

  it("are not for sale: never in the catalog", () => {
    const slugs = new Set(PRODUCTS.map((p) => p.slug));
    const skus = new Set(PRODUCTS.map((p) => p.sku));
    for (const [, piece] of pieces) {
      expect(slugs.has(piece.slug)).toBe(false);
      expect(skus.has(piece.sku)).toBe(false);
    }
  });

  it("use the hero vase and the process lamp", () => {
    expect(SHOWCASE.vase.model).toBe("ripple-vase");
    expect(SHOWCASE.lamp.model).toBe("lattice-lamp");
    const lamp = getModelInfo("lattice-lamp", SHOWCASE.lamp.sizes[0].dims);
    expect(lamp.lamp).toBeDefined();
    expect(lamp.lamp!.bulbY).toBeGreaterThan(0);
    expect(lamp.lamp!.bulbY).toBeLessThan(lamp.height);
    expect(lamp.lamp!.bulbRadius).toBeGreaterThan(0);
  });
});
