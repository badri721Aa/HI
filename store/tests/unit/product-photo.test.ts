import { describe, expect, it } from "vitest";
import { getProduct } from "@/content/catalog";
import { lineSummary } from "@/components/commerce/product-details";
import { zoomHeadroom } from "@/components/commerce/product-gallery";

const phoneCase = getProduct("hex-phone-case")!;
const clicker = getProduct("keycap-clicker")!;

describe("lineSummary (the 'Added to your order' toast)", () => {
  it("names the variant the way the cart does, without a lone 'One size'", () => {
    const line = { slug: clicker.slug, colorId: clicker.colors[0].id, sizeId: clicker.sizes[0].id, qty: 1 };
    expect(lineSummary(clicker, line, "en")).toBe("Keycap Clicker — Yellow");
    expect(lineSummary(clicker, line, "ar")).not.toContain("مقاس واحد");
  });

  it("keeps a describing sole size and adds the note", () => {
    const line = { slug: phoneCase.slug, colorId: "sky-blue", sizeId: "fitted", qty: 1, note: "iPhone 15 Pro" };
    expect(lineSummary(phoneCase, line, "en")).toBe("Hex Phone Case — Fitted to your iPhone · Sky blue · iPhone 15 Pro");
  });

  it("drops the dash when nothing describes the variant", () => {
    const line = { slug: clicker.slug, colorId: "gone", sizeId: clicker.sizes[0].id, qty: 1 };
    expect(lineSummary(clicker, line, "en")).toBe("Keycap Clicker");
  });
});

describe("zoomHeadroom", () => {
  const img = (naturalWidth: number, naturalHeight: number, offsetWidth: number, offsetHeight: number) => ({
    naturalWidth,
    naturalHeight,
    offsetWidth,
    offsetHeight,
  });

  it("is the file's width over the drawn width in device pixels", () => {
    expect(zoomHeadroom(img(1000, 1250, 500, 625), 1)).toBe(2);
    expect(zoomHeadroom(img(1000, 1250, 500, 625), 2)).toBe(1);
  });

  it("measures a cover crop by the side that overflows", () => {
    // A 4:5 photo covering a square box is drawn 500 wide by 625 tall: the box's width is what counts.
    expect(zoomHeadroom(img(1000, 1250, 500, 500), 1)).toBe(2);
    // A box narrower than 4:5 is covered by height: 625 tall means 500 wide, overflowing the 400px box.
    expect(zoomHeadroom(img(1000, 1250, 400, 625), 1)).toBe(2);
  });

  it("leaves no headroom for a photo already shown at its own size", () => {
    expect(zoomHeadroom(img(440, 550, 440, 550), 1)).toBe(1);
  });

  it("is 1 until the photo has loaded or been laid out", () => {
    expect(zoomHeadroom(null, 1)).toBe(1);
    expect(zoomHeadroom(img(0, 0, 500, 625), 1)).toBe(1);
    expect(zoomHeadroom(img(1000, 1250, 0, 0), 1)).toBe(1);
  });
});
