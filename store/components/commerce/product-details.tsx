"use client";
// STUB — owned by the collection builder.
import type { Product } from "@/types";

/** Variant picker, price, stock, add-to-order and specs. Shared by the quick view and the product page. */
export function ProductDetails({ product }: { product: Product; variant: "drawer" | "page" }) {
  return <div>{product.slug}</div>;
}
