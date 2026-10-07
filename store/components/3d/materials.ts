// STUB — owned by the 3D core builder.
import * as THREE from "three";
import type { Finish } from "@/types";

export interface PrintMaterialOptions {
  color: string;
  finish: Finish;
  /** Real layer height in mm; the shader exaggerates it so lines stay visible but never alias. */
  layerHeight: number;
}

export interface PrintUniforms {
  /** World-space Y above which fragments are discarded (print progress). Infinity = no clip. */
  uClipY: { value: number };
  /** Colour of the glowing "hot" band just under the clip plane. */
  uHotColor: { value: THREE.Color };
  /** Visual layer spacing in model units. */
  uLayer: { value: number };
  /** 0–1 strength of the layer-line shading. */
  uLayerStrength: { value: number };
  uTime: { value: number };
}

export type PrintMaterial = THREE.MeshPhysicalMaterial & { userData: { uniforms: PrintUniforms } };

export function createPrintMaterial(opts: PrintMaterialOptions): PrintMaterial {
  const m = new THREE.MeshPhysicalMaterial({ color: opts.color, roughness: 0.6 }) as PrintMaterial;
  m.userData.uniforms = {
    uClipY: { value: Infinity },
    uHotColor: { value: new THREE.Color("#7de3ee") },
    uLayer: { value: 0.01 },
    uLayerStrength: { value: 0.5 },
    uTime: { value: 0 },
  };
  return m;
}
