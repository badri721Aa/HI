import { beforeEach, describe, expect, it } from "vitest";
import type { OrderLine } from "@/types";
import { MAX_LINES, MAX_QTY } from "@/lib/whatsapp";
import { selectCount, useCart } from "@/lib/store/cart";

const clicker: OrderLine = { slug: "keycap-clicker", colorId: "yellow", sizeId: "one", qty: 1 };
const shifter: OrderLine = { slug: "gear-shifter", colorId: "black-red", sizeId: "one", qty: 1 };
const phoneCase = (note: string, qty = 1): OrderLine => ({
  slug: "hex-phone-case",
  colorId: "sky-blue",
  sizeId: "fitted",
  qty,
  note,
});

const cart = () => useCart.getState();
const lines = () => cart().lines;

beforeEach(() => {
  useCart.setState({ lines: [] });
});

describe("cart add", () => {
  it("adds a new line", () => {
    cart().add(clicker);
    expect(lines()).toEqual([clicker]);
  });

  it("merges the same variant into one line and sums the quantity", () => {
    cart().add(clicker);
    cart().add({ ...clicker, qty: 2 });
    expect(lines()).toEqual([{ ...clicker, qty: 3 }]);
  });

  it("keeps different products and variants on separate lines", () => {
    cart().add(clicker);
    cart().add(shifter);
    cart().add({ ...clicker, colorId: "other" });
    cart().add({ ...clicker, sizeId: "other" });
    expect(lines()).toHaveLength(4);
  });

  it("merges notes that differ only in case and surrounding spaces, keeping the first spelling", () => {
    cart().add(phoneCase("iPhone 15 Pro"));
    cart().add(phoneCase("  IPHONE 15 PRO "));
    expect(lines()).toHaveLength(1);
    expect(lines()[0]).toMatchObject({ qty: 2, note: "iPhone 15 Pro" });
  });

  it("keeps different notes on separate lines", () => {
    cart().add(phoneCase("iPhone 15 Pro"));
    cart().add(phoneCase("iPhone 13"));
    expect(lines().map((l) => l.note)).toEqual(["iPhone 15 Pro", "iPhone 13"]);
  });

  it("treats a missing note and an empty note as the same", () => {
    cart().add(clicker);
    cart().add({ ...clicker, note: "" });
    cart().add({ ...clicker, note: "   " });
    expect(lines()).toHaveLength(1);
    expect(lines()[0].qty).toBe(3);
  });

  it("caps a merged line at MAX_QTY", () => {
    cart().add({ ...clicker, qty: MAX_QTY - 1 });
    cart().add({ ...clicker, qty: 5 });
    expect(lines()[0].qty).toBe(MAX_QTY);
    cart().add(clicker);
    expect(lines()[0].qty).toBe(MAX_QTY);
  });

  it("clamps the quantity of a new line to 1…MAX_QTY", () => {
    cart().add({ ...clicker, qty: MAX_QTY + 50 });
    cart().add({ ...shifter, qty: 0 });
    expect(lines().map((l) => l.qty)).toEqual([MAX_QTY, 1]);
  });

  it(`holds at most MAX_LINES (${MAX_LINES}) lines`, () => {
    for (let i = 0; i < MAX_LINES + 3; i++) cart().add(phoneCase(`iPhone ${i}`));
    expect(lines()).toHaveLength(MAX_LINES);
    expect(lines().at(-1)?.note).toBe(`iPhone ${MAX_LINES - 1}`);
  });

  it("still merges into an existing line when full", () => {
    for (let i = 0; i < MAX_LINES; i++) cart().add(phoneCase(`iPhone ${i}`));
    cart().add(phoneCase("iphone 0", 2));
    expect(lines()).toHaveLength(MAX_LINES);
    expect(lines()[0].qty).toBe(3);
  });

  it("does not mutate the previous state", () => {
    cart().add(clicker);
    const before = lines();
    const first = before[0];
    cart().add(clicker);
    expect(before).not.toBe(lines());
    expect(first.qty).toBe(1);
  });
});

describe("cart setQty", () => {
  beforeEach(() => {
    cart().add(clicker);
    cart().add(shifter);
  });

  it.each([
    [5, 5],
    [0, 1],
    [-3, 1],
    [MAX_QTY + 1, MAX_QTY],
    [2.7, 2],
    [Number.NaN, 1],
  ])("setQty(%s) → %s", (qty, expected) => {
    cart().setQty(1, qty);
    expect(lines()[1].qty).toBe(expected);
    expect(lines()[0].qty).toBe(1);
  });

  it("ignores an index that does not exist", () => {
    const before = lines();
    cart().setQty(7, 3);
    cart().setQty(-1, 3);
    expect(lines()).toBe(before);
  });
});

describe("cart remove and clear", () => {
  it("removes the line at an index", () => {
    cart().add(clicker);
    cart().add(shifter);
    cart().add(phoneCase("iPhone 15"));
    cart().remove(1);
    expect(lines().map((l) => l.slug)).toEqual(["keycap-clicker", "hex-phone-case"]);
  });

  it("ignores an index that does not exist", () => {
    cart().add(clicker);
    cart().remove(5);
    expect(lines()).toHaveLength(1);
  });

  it("clears every line", () => {
    cart().add(clicker);
    cart().add(shifter);
    cart().clear();
    expect(lines()).toEqual([]);
  });
});

describe("selectCount", () => {
  it("counts pieces, not lines", () => {
    expect(selectCount(cart())).toBe(0);
    cart().add({ ...clicker, qty: 3 });
    cart().add(shifter);
    expect(selectCount(cart())).toBe(4);
  });
});

describe("cart persistence", () => {
  const key = () => useCart.persist.getOptions().name as string;

  it("saves lines to localStorage", () => {
    cart().add({ ...clicker, qty: 2 });
    const saved = JSON.parse(localStorage.getItem(key()) ?? "null");
    expect(saved?.state?.lines).toEqual([{ ...clicker, qty: 2 }]);
  });

  it("drops lines whose product or variant left the catalog when restoring", async () => {
    localStorage.setItem(
      key(),
      JSON.stringify({
        version: useCart.persist.getOptions().version,
        state: {
          lines: [
            clicker,
            { ...clicker, slug: "retired-product" },
            { ...shifter, colorId: "retired-colour" },
            { ...shifter, sizeId: "retired-size" },
            phoneCase("iPhone 15", 2),
          ],
        },
      }),
    );
    await useCart.persist.rehydrate();
    expect(lines()).toEqual([clicker, phoneCase("iPhone 15", 2)]);
  });

  it("restores an empty cart from missing or empty storage", async () => {
    await useCart.persist.rehydrate();
    expect(lines()).toEqual([]);
  });
});
