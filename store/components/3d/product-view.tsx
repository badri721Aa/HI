"use client";
// STUB — owned by the 3D scenes builder.
import type { Product } from "@/types";

/** Live 3D thumbnail drawn into the shared canvas over this element's box. */
export function ProductView({ className }: {
  product: Product;
  colorId: string;
  sizeId?: string;
  className?: string;
  /** Hovered or focused: spin a little faster / tilt toward the viewer. */
  active?: boolean;
}) {
  return <div className={className} />;
}
