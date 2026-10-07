"use client";
// STUB — owned by the 3D core builder. Must be rendered inside an R3F <Canvas> / <View>.
import type { Product } from "@/types";

export function ProductMesh(props: {
  product: Product;
  colorId: string;
  sizeId?: string;
  /** 0–1 fraction of the model height that is "printed". Omit for a finished piece. */
  clipHeight?: number;
  wireframe?: boolean;
  castShadow?: boolean;
  /** "low" for thumbnails (cheap materials), "high" for the standalone viewer. Default "low". */
  quality?: "low" | "high";
  /** 0–1 brightness of a lamp's bulb (lattice-lamp only). Default 1. */
  glow?: number;
}) {
  void props;
  return null;
}
