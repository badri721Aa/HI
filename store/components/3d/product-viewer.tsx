"use client";
// STUB — owned by the 3D scenes builder.
import type { Product } from "@/types";

/** Standalone orbitable viewer for the quick view and product page. */
export function ProductViewer({ className }: { product: Product; colorId: string; sizeId: string; className?: string }) {
  return <div className={className} />;
}
