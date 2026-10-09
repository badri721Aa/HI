import { describe, expect, it, vi } from "vitest";
import type { Product } from "@/types";

/*
 * None of the real products list dimensions, so the "(w×d×h mm)" branch of
 * the order message is exercised with a catalog that has one extra piece
 * with two measured sizes (the shape the catalog had before the photo
 * shoot, and may have again).
 */
const vase: Product = {
  slug: "test-ripple-vase",
  sku: "TEST-VASE-01",
  name: { en: "Ripple Vase", ar: "مزهرية متموجة" },
  tagline: { en: "", ar: "" },
  description: { en: "", ar: "" },
  category: "gifts",
  colors: [{ id: "bone", name: { en: "Bone", ar: "عظمي" }, hex: "#e6e0d4", finish: "matte" }],
  sizes: [
    { id: "s", name: { en: "Small", ar: "صغير" }, dims: { w: 120, d: 120, h: 160 }, price: { BHD: 6.5, AED: 65 } },
    { id: "m", name: { en: "Medium", ar: "وسط" }, dims: { w: 150, d: 150, h: 220 }, price: { BHD: 9.5, AED: 95 } },
  ],
  images: [],
  stock: null,
};

vi.mock("@/content/catalog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/content/catalog")>();
  return {
    ...actual,
    PRODUCTS: [...actual.PRODUCTS, vase],
    getProduct: (slug: string) => (slug === vase.slug ? vase : actual.getProduct(slug)),
  };
});

const { buildWhatsAppMessagePayload, priceOrder } = await import("@/lib/whatsapp");

const customer = { name: "Fatima", city: "manama" };

describe("order message with measured sizes", () => {
  it("prints the dimensions in mm after the size name", () => {
    const msg = buildWhatsAppMessagePayload({
      ref: "X-00000",
      region: "BH",
      locale: "en",
      lines: [{ slug: vase.slug, colorId: "bone", sizeId: "m", qty: 2 }],
      customer,
    });
    expect(msg).toContain("1. Ripple Vase — Medium (150×150×220 mm), Bone\n");
    expect(msg).toContain("   2 × 9.500 BHD = 19.000 BHD\n");
  });

  it("uses the Arabic unit on /ar", () => {
    const msg = buildWhatsAppMessagePayload({
      ref: "X-00000",
      region: "AE",
      locale: "ar",
      lines: [{ slug: vase.slug, colorId: "bone", sizeId: "s", qty: 1 }],
      customer: { name: "عمر", city: "dubai" },
    });
    expect(msg).toContain("1. مزهرية متموجة — صغير (120×120×160 مم)، عظمي\n");
    expect(msg).toContain("   65.00 د.إ\n");
  });

  it("keeps the size name but drops the dimensions in the compact receipt", () => {
    const msg = buildWhatsAppMessagePayload({
      ref: "X-00000",
      region: "BH",
      locale: "en",
      lines: [{ slug: vase.slug, colorId: "bone", sizeId: "m", qty: 2 }],
      customer,
      compact: true,
    });
    expect(msg).toContain("1. Ripple Vase — Medium, Bone\n");
    expect(msg).not.toContain("150×150×220");
    expect(msg).not.toContain(vase.sku);
    expect(msg).toContain("   2 × 9.500 BHD = 19.000 BHD\n");
  });

  it("passes the dims through priceOrder", () => {
    const [line] = priceOrder([{ slug: vase.slug, colorId: "bone", sizeId: "s", qty: 1 }], "BH", "en").lines;
    expect(line.dims).toEqual({ w: 120, d: 120, h: 160 });
  });
});
