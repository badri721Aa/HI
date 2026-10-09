import * as THREE from "three";

/*
 * Camera framing for DOM-placed views: finds the camera distance at which a
 * set of key points fits a rectangle of the view box, and the lens shift
 * (view offset) that centres them in it. Lets one scene compose well in a
 * wide desktop box and a squat phone box, and keep clear of DOM overlays
 * (the hero's HUD) without moving anything in the 3D world.
 */

/** A rectangle of the view box, as fractions from its top-left (left-to-right layout). */
export interface FrameRect {
  l: number;
  r: number;
  t: number;
  b: number;
}

export interface Framing {
  distance: number;
  /** setViewOffset(1, 1, offsetX, offsetY, 1, 1) */
  offsetX: number;
  offsetY: number;
}

const _dir = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _eye = new THREE.Vector3();
const _rel = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** Unit vector from the target towards the camera. */
export function orbitDirection(azimuth: number, elevation: number, out: THREE.Vector3): THREE.Vector3 {
  const c = Math.cos(elevation);
  return out.set(c * Math.sin(azimuth), Math.sin(elevation), c * Math.cos(azimuth));
}

/** Mirrors a rectangle for right-to-left layouts. */
export function mirrorRect(r: FrameRect, rtl: boolean): FrameRect {
  return rtl ? { l: 1 - r.r, r: 1 - r.l, t: r.t, b: r.b } : r;
}

function extents(
  points: readonly THREE.Vector3[],
  target: THREE.Vector3,
  distance: number,
  tanX: number,
  tanY: number,
  out: number[],
): boolean {
  _eye.copy(_dir).multiplyScalar(distance).add(target);
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const p of points) {
    _rel.copy(p).sub(_eye);
    const z = _rel.dot(_fwd);
    if (z < 0.05) return false;
    const x = _rel.dot(_right) / (z * tanX);
    const y = _rel.dot(_up) / (z * tanY);
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  out[0] = x0;
  out[1] = x1;
  out[2] = y0;
  out[3] = y1;
  return true;
}

const _ext = [0, 0, 0, 0];

/**
 * Solves the framing for a camera orbiting `target` (looking at it) at the
 * given azimuth/elevation, so `points` fill `rect` of a box with `aspect`.
 * `minDistance` caps how close the camera may come (the points are then
 * centred in the rect, smaller than it).
 */
export function solveFraming(
  points: readonly THREE.Vector3[],
  target: THREE.Vector3,
  azimuth: number,
  elevation: number,
  fovDeg: number,
  aspect: number,
  rect: FrameRect,
  out: Framing,
  minDistance = 0,
): Framing {
  orbitDirection(azimuth, elevation, _dir);
  _fwd.copy(_dir).negate();
  _right.crossVectors(_fwd, UP).normalize();
  _up.crossVectors(_right, _fwd);
  const tanY = Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2);
  const tanX = tanY * aspect;
  const w = 2 * (rect.r - rect.l);
  const h = 2 * (rect.b - rect.t);

  let lo = 0.2;
  let hi = 60;
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2;
    if (extents(points, target, mid, tanX, tanY, _ext) && _ext[1] - _ext[0] <= w && _ext[3] - _ext[2] <= h) hi = mid;
    else lo = mid;
  }
  hi = Math.max(hi, minDistance);
  extents(points, target, hi, tanX, tanY, _ext);
  // Centre of the rectangle and of the points, in NDC; the lens shift moves one onto the other.
  const cx = rect.l + rect.r - 1;
  const cy = 1 - (rect.t + rect.b);
  const sx = cx - (_ext[0] + _ext[1]) / 2;
  const sy = cy - (_ext[2] + _ext[3]) / 2;
  out.distance = hi;
  out.offsetX = -sx / 2;
  out.offsetY = sy / 2;
  return out;
}

/** Points on a horizontal circle (rotation-invariant proxies for round parts). */
export function ring(radius: number, y: number, count = 16): THREE.Vector3[] {
  return Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2;
    return new THREE.Vector3(radius * Math.cos(a), y, radius * Math.sin(a));
  });
}
