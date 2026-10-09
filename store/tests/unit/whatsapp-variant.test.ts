import { describe, expect, it } from "vitest";
import type { OrderLine, Product } from "@/types";
import { getProduct } from "@/content/catalog";
import { variantLabel, variantParts } from "@/lib/whatsapp";

const phoneCase = getProduct("hex-phone-case")!;
const clicker = getProduct("keycap-clicker")!;
const line = (product: Product, overrides: Partial<OrderLine> = {}): OrderLine => ({
  slug: product.slug,
  colorId: product.colors[0].id,
  sizeId: product.sizes[0].id,
  qty: 1,
  ...overrides,
});

describe("variantParts", () => {
  it("keeps a sole size or colour that describes the piece", () => {
    expect(variantParts(phoneCase, line(phoneCase), "en")).toEqual(["Fitted to your iPhone", "Sky blue"]);
    expect(variantParts(phoneCase, line(phoneCase), "ar")).toEqual(["حسب موديل الآيفون", "أزرق سماوي"]);
  });

  it("drops a sole 'One size'", () => {
    expect(variantParts(clicker, line(clicker), "en")).toEqual(["Yellow"]);
  });

  it("skips a size or colour the product no longer has", () => {
    expect(variantParts(clicker, line(clicker, { colorId: "gone" }), "en")).toEqual([]);
  });

  it("returns separate parts, so the cart can keep the dot from dangling at a line end", () => {
    for (const part of variantParts(phoneCase, line(phoneCase), "en")) expect(part).not.toContain("·");
  });
});

describe("variantLabel", () => {
  it("joins the parts with a middle dot for plain text", () => {
    expect(variantLabel(phoneCase, line(phoneCase), "en")).toBe("Fitted to your iPhone · Sky blue");
    expect(variantLabel(clicker, line(clicker), "en")).toBe("Yellow");
    expect(variantLabel(clicker, line(clicker, { colorId: "gone" }), "en")).toBe("");
  });
});
