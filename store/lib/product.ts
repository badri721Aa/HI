import type { Currency, Product } from "@/types";
import { priceFor } from "@/lib/currency";

export type StockState =
  | { kind: "ready"; n: number }
  | { kind: "low"; n: number }
  | { kind: "made"; min?: number; max?: number };

/** In stock (≥4), low (1–3), or made to order (null / 0 stock; days only when known). */
export function stockState(product: Product): StockState {
  const { stock, leadTimeDays } = product;
  if (stock === null || stock <= 0) return { kind: "made", min: leadTimeDays?.[0], max: leadTimeDays?.[1] };
  if (stock <= 3) return { kind: "low", n: stock };
  return { kind: "ready", n: stock };
}

/** Lowest unit price across sizes, for "From 6.500 BHD". */
export function minPrice(product: Product, currency: Currency): number {
  return Math.min(...product.sizes.map((s) => priceFor(s, currency)));
}

export function defaultVariant(product: Product) {
  return { colorId: product.colors[0].id, sizeId: product.sizes[Math.min(1, product.sizes.length - 1)].id };
}
