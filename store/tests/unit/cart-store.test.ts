import { beforeEach, describe, expect, it } from "vitest";
import type { OrderLine } from "@/types";
import { MAX_LINES, MAX_QTY } from "@/lib/whatsapp";
import { selectCount, useCart } from "@/lib/store/cart";
import { useUI } from "@/lib/store/ui";

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

describe("cart add result", () => {
  it("is added when everything asked for went in", () => {
    expect(cart().add(clicker)).toBe("added");
    expect(cart().add({ ...clicker, qty: 3 })).toBe("added");
    expect(lines()[0].qty).toBe(4);
  });

  it("is capped when a merge hits MAX_QTY", () => {
    cart().add({ ...clicker, qty: MAX_QTY - 2 });
    expect(cart().add({ ...clicker, qty: 5 })).toBe("capped");
    expect(lines()[0].qty).toBe(MAX_QTY);
    // Already at the cap: nothing more goes in, and it still says so.
    expect(cart().add(clicker)).toBe("capped");
    expect(lines()[0].qty).toBe(MAX_QTY);
  });

  it("is added when a merge lands exactly on MAX_QTY", () => {
    cart().add({ ...clicker, qty: MAX_QTY - 2 });
    expect(cart().add({ ...clicker, qty: 2 })).toBe("added");
    expect(lines()[0].qty).toBe(MAX_QTY);
  });

  it("is capped when a new line asks for more than MAX_QTY", () => {
    expect(cart().add({ ...clicker, qty: MAX_QTY + 1 })).toBe("capped");
    expect(lines()[0].qty).toBe(MAX_QTY);
  });

  it("is full when the order already has MAX_LINES lines, and nothing changes", () => {
    for (let i = 0; i < MAX_LINES; i++) expect(cart().add(phoneCase(`iPhone ${i}`))).toBe("added");
    const before = lines();
    expect(cart().add(phoneCase("iPhone 99"))).toBe("full");
    expect(lines()).toBe(before);
    // A merge into an existing line still works when full.
    expect(cart().add(phoneCase("iPhone 3"))).toBe("added");
  });
});

describe("cart setNote", () => {
  it("changes the note of one line", () => {
    cart().add(phoneCase("iPhone 13"));
    cart().add(clicker);
    cart().setNote(0, "  iPhone 13 mini ");
    expect(lines()).toEqual([phoneCase("iPhone 13 mini"), clicker]);
  });

  it("folds the line into an identical one, summing (and capping) the quantity", () => {
    cart().add(phoneCase("iPhone 15", 2));
    cart().add(clicker);
    cart().add(phoneCase("iPhone 51", 3));
    cart().setNote(2, "iphone 15");
    expect(lines()).toEqual([phoneCase("iPhone 15", 5), clicker]);

    cart().add(phoneCase("iPhone 16", MAX_QTY));
    cart().setNote(2, "iPhone 15");
    expect(lines()).toEqual([phoneCase("iPhone 15", MAX_QTY), clicker]);
  });

  it("drops an empty note and ignores a missing index", () => {
    cart().add(phoneCase("iPhone 13"));
    cart().setNote(0, "   ");
    expect(lines()[0]).not.toHaveProperty("note");
    const before = lines();
    cart().setNote(4, "x");
    expect(lines()).toBe(before);
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

  const restore = async (saved: unknown) => {
    localStorage.setItem(key(), JSON.stringify({ version: useCart.persist.getOptions().version, state: { lines: saved } }));
    await useCart.persist.rehydrate();
    return lines();
  };

  it("clamps restored quantities to 1…MAX_QTY", async () => {
    expect(
      await restore([
        { ...clicker, qty: 35 },
        { ...shifter, qty: 0 },
        { ...phoneCase("iPhone 15"), qty: 2.7 },
        { ...phoneCase("iPhone 13"), qty: "lots" },
      ]),
    ).toEqual([
      { ...clicker, qty: MAX_QTY },
      { ...shifter, qty: 1 },
      phoneCase("iPhone 15", 2),
      phoneCase("iPhone 13", 1),
    ]);
  });

  it("folds duplicate lines (same variant and note, any case) into one", async () => {
    expect(
      await restore([
        phoneCase("iPhone 15", 2),
        clicker,
        phoneCase(" IPHONE 15 ", 3),
        { ...clicker, qty: 19 },
        { ...clicker, note: "" },
      ]),
    ).toEqual([phoneCase("iPhone 15", 5), { ...clicker, qty: MAX_QTY }]);
  });

  it("drops malformed entries and keeps at most MAX_LINES lines", async () => {
    const many = Array.from({ length: MAX_LINES + 5 }, (_, i) => phoneCase(`iPhone ${i}`));
    const restored = await restore([null, 42, "x", { slug: 7 }, { ...clicker, colorId: undefined }, ...many]);
    expect(restored).toHaveLength(MAX_LINES);
    expect(restored[0]).toEqual(phoneCase("iPhone 0"));
    expect(await restore("not an array")).toEqual([]);
  });

  it("keeps this tab's lines when a re-sync finds nothing stored", async () => {
    cart().add(clicker);
    localStorage.clear();
    await useCart.persist.rehydrate();
    expect(lines()).toEqual([clicker]);
  });

  it("picks up what another tab saved", async () => {
    cart().add(clicker);
    // Another tab adds a piece and saves the whole cart.
    localStorage.setItem(
      key(),
      JSON.stringify({ version: useCart.persist.getOptions().version, state: { lines: [clicker, shifter] } }),
    );
    await useCart.persist.rehydrate();
    cart().add(phoneCase("iPhone 15"));
    expect(lines()).toEqual([clicker, shifter, phoneCase("iPhone 15")]);
  });

  it("restores an empty cart from missing or empty storage", async () => {
    await useCart.persist.rehydrate();
    expect(lines()).toEqual([]);
  });
});

describe("opening the cart", () => {
  it("clears pending toasts, so an 'Added' toast doesn't cover the first line", () => {
    useUI.getState().toast({ title: "Added to your order" });
    expect(useUI.getState().toasts).toHaveLength(1);
    useUI.getState().setCartOpen(true);
    expect(useUI.getState()).toMatchObject({ cartOpen: true, toasts: [] });
    useUI.getState().toast({ title: "WhatsApp is open" });
    useUI.getState().setCartOpen(false);
    expect(useUI.getState().toasts).toHaveLength(1);
  });
});
