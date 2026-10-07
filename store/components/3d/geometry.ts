// STUB — owned by the 3D core builder.
import * as THREE from "three";
import type { ModelKind, SizeOption } from "@/types";

/**
 * Procedural geometry for a model kind at the given outer dimensions.
 * Units: 1 unit = 100 mm. Base sits on y = 0, centred on X/Z. Cached per kind + dims.
 */
export function getGeometry(kind: ModelKind, dims: SizeOption["dims"]): THREE.BufferGeometry {
  void kind;
  return new THREE.BoxGeometry(dims.w / 100, dims.h / 100, dims.d / 100).translate(0, dims.h / 200, 0);
}

export function disposeGeometryCache(): void {}

/**
 * Outer radius (model units) of the ripple vase at height fraction t (0–1)
 * and angle theta. The hero scene uses it to drive the nozzle around the wall.
 */
export function ripplePerimeterRadius(t: number, theta: number, dims: SizeOption["dims"]): number {
  void t;
  void theta;
  return dims.w / 200;
}
