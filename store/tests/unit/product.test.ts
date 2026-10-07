import { describe, expect, it } from "vitest";
import type { Product } from "@/types";
import { PRODUCTS, getProduct } from "@/content/catalog";
import { defaultVariant, minPrice, stockState } from "@/lib/product";
import { countryToRegion } from "@/lib/geo";

const clicker = getProduct("keycap-clicker") as Product;
const withStock = (stock: Product["stock"], leadTimeDays?: [number, number]): Product => ({
  ...clicker,
  stock,
  leadTimeDays,
});

describe("stockState", () => {
  it("is made to order without days when the lead time is unknown", () => {
    expect(stockState(withStock(null))).toEqual({ kind: "made", min: undefined, max: undefined });
    for (const p of PRODUCTS.filter((x) => x.stock === null && !x.leadTimeDays)) {
      expect(stockState(p), p.slug).toMatchObject({ kind: "made" });
      expect(stockState(p), p.slug).not.toHaveProperty("min", expect.any(Number));
    }
  });

  it("carries the lead time when known", () => {
    expect(stockState(withStock(null, [3, 5]))).toEqual({ kind: "made", min: 3, max: 5 });
    expect(stockState(withStock(0, [3, 5]))).toEqual({ kind: "made", min: 3, max: 5 });
  });

  it("is low for 1–3 pieces and ready from 4", () => {
    expect(stockState(withStock(1))).toEqual({ kind: "low", n: 1 });
    expect(stockState(withStock(3))).toEqual({ kind: "low", n: 3 });
    expect(stockState(withStock(4))).toEqual({ kind: "ready", n: 4 });
  });
});

describe("minPrice", () => {
  it("is the lowest size price in the currency", () => {
    expect(minPrice(clicker, "BHD")).toBe(1);
    expect(minPrice(clicker, "AED")).toBe(10);
    const twoSizes: Product = {
      ...clicker,
      sizes: [
        { id: "l", name: { en: "L", ar: "ك" }, price: { BHD: 4, AED: 40 } },
        { id: "s", name: { en: "S", ar: "ص" }, price: { BHD: 2.5, AED: 25 } },
      ],
    };
    expect(minPrice(twoSizes, "BHD")).toBe(2.5);
  });
});

describe("defaultVariant", () => {
  it("uses the first colour and the only size for single-size products", () => {
    for (const p of PRODUCTS.filter((x) => x.sizes.length === 1)) {
      expect(defaultVariant(p)).toEqual({ colorId: p.colors[0].id, sizeId: p.sizes[0].id });
    }
  });

  it("returns ids that exist on the product", () => {
    for (const p of PRODUCTS) {
      const v = defaultVariant(p);
      expect(p.colors.some((c) => c.id === v.colorId)).toBe(true);
      expect(p.sizes.some((s) => s.id === v.sizeId)).toBe(true);
    }
  });
});

describe("countryToRegion", () => {
  it("maps the UAE to AE and everything else to Bahrain", () => {
    expect(countryToRegion("AE")).toBe("AE");
    expect(countryToRegion("ae")).toBe("AE");
    expect(countryToRegion("BH")).toBe("BH");
    expect(countryToRegion("SA")).toBe("BH");
    expect(countryToRegion(null)).toBe("BH");
    expect(countryToRegion(undefined)).toBe("BH");
  });
});
