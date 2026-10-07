import { SHOWCASE } from "@/content/showcase";
import type { Vec3 } from "../core/math";
import { RIPPLE, ripplePerimeterRadius } from "../core/profiles";
import { tanglePoints } from "./spaghetti";

/*
 * Layout of the 404's failed print (model units, vase base at the origin),
 * shared by the 3D scene and its SVG fallback. Pure data, no three.js.
 */

const DIMS = SHOWCASE.vase.sizes[0].dims;
const H = DIMS.h / 100;

/** The print stopped here (fraction of the vase height). */
export const FAILED_CLIP = 0.42;

const cutY = FAILED_CLIP * H;
const rimTheta = 0.55;
const rimR = ripplePerimeterRadius(FAILED_CLIP, rimTheta, DIMS) - RIPPLE.wall / 2;
const tip: Vec3 = [0.46, cutY + 1.12, 0.1];
const centre: Vec3 = [0.02, cutY + 0.44, 0.04];
const radii: Vec3 = [0.74, 0.4, 0.62];
const rim: Vec3 = [rimR * Math.cos(rimTheta), cutY + 0.008, rimR * Math.sin(rimTheta)];

export const FAILED_TANGLE = { tip, centre, radii, rim, points: tanglePoints({ tip, rim, centre, radii }) };
