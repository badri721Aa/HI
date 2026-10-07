import { describe, expect, it } from "vitest";
import type { OrderLine } from "@/types";
import { getDictionary } from "@/lib/i18n";
import {
  LIMITS,
  MAX_LINES,
  MAX_QTY,
  cityName,
  priceOrder,
  sanitizeText,
  validateOrder,
  type OrderErrorKey,
  type OrderInput,
} from "@/lib/whatsapp";

const clicker: OrderLine = { slug: "keycap-clicker", colorId: "yellow", sizeId: "one", qty: 1 };
const cell: OrderLine = { slug: "plant-cell-model", colorId: "multicolour", sizeId: "one", qty: 1 };
const phoneCase: OrderLine = {
  slug: "hex-phone-case",
  colorId: "sky-blue",
  sizeId: "fitted",
  qty: 1,
  note: "iPhone 15 Pro",
};

function order(overrides: Partial<OrderInput> = {}): OrderInput {
  return {
    region: "BH",
    lines: [clicker],
    customer: { name: "Fatima Ali", phone: "+973 3985 8885", city: "manama", area: "Block 338", notes: "" },
    ...overrides,
  };
}

const withCustomer = (customer: Partial<OrderInput["customer"]>) =>
  order({ customer: { ...order().customer, ...customer } });

/** Asserts the order fails with exactly this key at this path (other paths may fail too). */
function expectError(input: OrderInput, path: string, key: OrderErrorKey) {
  const result = validateOrder(input);
  expect(result.ok).toBe(false);
  expect(result.errors[path], JSON.stringify(result.errors)).toBe(key);
}

describe("validateOrder", () => {
  it("accepts a complete Bahrain order", () => {
    expect(validateOrder(order())).toEqual({ ok: true, errors: {} });
  });

  it("accepts a UAE order with a UAE city", () => {
    expect(validateOrder(order({ region: "AE", customer: { name: "Omar", city: "dubai" } }))).toEqual({
      ok: true,
      errors: {},
    });
  });

  it("treats phone, area and notes as optional", () => {
    expect(validateOrder(order({ customer: { name: "Fatima", city: "riffa" } })).ok).toBe(true);
    expect(validateOrder(withCustomer({ phone: "", area: "", notes: "" })).ok).toBe(true);
  });

  it("accepts the phone case once the iPhone model is given", () => {
    expect(validateOrder(order({ lines: [phoneCase] })).ok).toBe(true);
  });

  it("accepts the limits exactly", () => {
    const input = order({
      lines: Array.from({ length: MAX_LINES }, () => ({ ...clicker, qty: MAX_QTY })),
      customer: {
        name: "N".repeat(LIMITS.name),
        phone: "+973 3985 8885",
        city: "manama",
        area: "A".repeat(LIMITS.area),
        notes: "x".repeat(LIMITS.notes),
      },
    });
    expect(validateOrder(input)).toEqual({ ok: true, errors: {} });
  });

  it("cart_empty at lines", () => {
    expectError(order({ lines: [] }), "lines", "cart_empty");
  });

  it("too_many_lines at lines", () => {
    expectError(order({ lines: Array.from({ length: MAX_LINES + 1 }, () => clicker) }), "lines", "too_many_lines");
  });

  it.each([0, -1, MAX_QTY + 1, 1.5])("qty_invalid for qty %s", (qty) => {
    expectError(order({ lines: [{ ...clicker, qty }] }), "lines.0.qty", "qty_invalid");
  });

  it("qty_invalid points at the right line", () => {
    expectError(order({ lines: [clicker, { ...cell, qty: 0 }] }), "lines.1.qty", "qty_invalid");
  });

  it("unknown_product for a slug that is not in the catalog", () => {
    expectError(order({ lines: [{ ...clicker, slug: "ripple-vase" }] }), "lines.0.slug", "unknown_product");
  });

  it("unknown_variant for a missing colour or size", () => {
    expectError(order({ lines: [{ ...clicker, colorId: "purple" }] }), "lines.0.colorId", "unknown_variant");
    expectError(order({ lines: [{ ...clicker, sizeId: "xl" }] }), "lines.0.sizeId", "unknown_variant");
  });

  it("note_required at lines.0.note for the phone case without a model", () => {
    const { note: _omit, ...noNote } = phoneCase;
    void _omit;
    expectError(order({ lines: [noNote] }), "lines.0.note", "note_required");
    expectError(order({ lines: [{ ...phoneCase, note: "" }] }), "lines.0.note", "note_required");
    expectError(order({ lines: [{ ...phoneCase, note: "   " }] }), "lines.0.note", "note_required");
  });

  it("does not ask for a note on products without one", () => {
    expect(validateOrder(order({ lines: [{ ...clicker, note: undefined }] })).ok).toBe(true);
  });

  it("note_too_long past LIMITS.note characters", () => {
    expect(validateOrder(order({ lines: [{ ...phoneCase, note: "x".repeat(LIMITS.note) }] })).ok).toBe(true);
    expectError(order({ lines: [{ ...phoneCase, note: "x".repeat(LIMITS.note + 1) }] }), "lines.0.note", "note_too_long");
    expectError(order({ lines: [{ ...clicker, note: "x".repeat(LIMITS.note + 1) }] }), "lines.0.note", "note_too_long");
  });

  it("name_required at customer.name", () => {
    expectError(withCustomer({ name: "" }), "customer.name", "name_required");
    expectError(withCustomer({ name: "A" }), "customer.name", "name_required");
    expectError(withCustomer({ name: "     " }), "customer.name", "name_required");
  });

  it("name_too_long at customer.name", () => {
    expectError(withCustomer({ name: "N".repeat(LIMITS.name + 1) }), "customer.name", "name_too_long");
  });

  it.each(["123", "abc", "+973", "1".repeat(16), `+973 ${"1".repeat(LIMITS.phone)}`])(
    "phone_invalid for %s",
    (phone) => {
      expectError(withCustomer({ phone }), "customer.phone", "phone_invalid");
    },
  );

  it("city_required when the city is missing", () => {
    expectError(withCustomer({ city: "" }), "customer.city", "city_required");
    expectError(withCustomer({ city: "  " }), "customer.city", "city_required");
  });

  it("city_required when the city belongs to the other region", () => {
    expectError(withCustomer({ city: "dubai" }), "customer.city", "city_required");
    expectError(order({ region: "AE", customer: { name: "Omar", city: "manama" } }), "customer.city", "city_required");
    expectError(withCustomer({ city: "atlantis" }), "customer.city", "city_required");
  });

  it("area_too_long at customer.area", () => {
    expectError(withCustomer({ area: "a".repeat(LIMITS.area + 1) }), "customer.area", "area_too_long");
  });

  it("notes_too_long at customer.notes", () => {
    expectError(withCustomer({ notes: "n".repeat(LIMITS.notes + 1) }), "customer.notes", "notes_too_long");
  });

  it("spam when the honeypot is filled", () => {
    expectError(order({ website: "https://spam.example" }), "website", "spam");
    expect(validateOrder(order({ website: "" })).ok).toBe(true);
  });

  it("reports several fields at once, first error per path", () => {
    const result = validateOrder(order({ customer: { name: "", phone: "1", city: "" } }));
    expect(result.ok).toBe(false);
    expect(result.errors).toMatchObject({
      "customer.name": "name_required",
      "customer.phone": "phone_invalid",
      "customer.city": "city_required",
    });
  });

  it("only returns keys the UI can translate", () => {
    const keys = Object.keys(getDictionary("en").common.errors);
    const inputs: OrderInput[] = [
      order({ lines: [] }),
      order({ lines: [{ ...clicker, qty: 0 }, { ...clicker, slug: "x" }, { ...phoneCase, note: "" }] }),
      order({ customer: { name: "", phone: "1", city: "dubai", area: "a".repeat(99), notes: "n".repeat(999) } }),
      order({ website: "x" }),
    ];
    for (const input of inputs) {
      for (const key of Object.values(validateOrder(input).errors)) expect(keys).toContain(key);
    }
  });
});

describe("error dictionary", () => {
  // Typed so the compiler flags a new OrderErrorKey that is missing here.
  const ALL_KEYS: Record<OrderErrorKey, true> = {
    cart_empty: true,
    too_many_lines: true,
    qty_invalid: true,
    unknown_product: true,
    unknown_variant: true,
    note_required: true,
    note_too_long: true,
    name_required: true,
    name_too_long: true,
    phone_invalid: true,
    city_required: true,
    area_too_long: true,
    notes_too_long: true,
    spam: true,
  };

  it.each(["en", "ar"] as const)("has a non-empty %s message for every error key", (locale) => {
    const errors = getDictionary(locale).common.errors as Record<string, string>;
    for (const key of Object.keys(ALL_KEYS)) expect(errors[key]?.trim(), key).toBeTruthy();
  });
});

describe("priceOrder", () => {
  it("totals 2 × Keycap Clicker + 1 × Plant Cell Model = 5.000 BHD", () => {
    const priced = priceOrder([{ ...clicker, qty: 2 }, cell], "BH", "en");
    expect(priced.currency).toBe("BHD");
    expect(priced.subtotal).toBe(5);
    expect(priced.itemCount).toBe(3);
    expect(priced.lines).toHaveLength(2);
    expect(priced.lines[0]).toMatchObject({ unitPrice: 1, lineTotal: 2, colorName: "Yellow", sizeName: "One size" });
    expect(priced.lines[1]).toMatchObject({ unitPrice: 3, lineTotal: 3 });
  });

  it("prices the same order at 50.00 AED for the UAE", () => {
    const priced = priceOrder([{ ...clicker, qty: 2 }, cell], "AE", "en");
    expect(priced.currency).toBe("AED");
    expect(priced.subtotal).toBe(50);
    expect(priced.lines.map((l) => [l.unitPrice, l.lineTotal])).toEqual([
      [10, 20],
      [30, 30],
    ]);
  });

  it("sums fractional BHD prices without drift", () => {
    const dumpling: OrderLine = { slug: "dumpling-steamer", colorId: "pink-bamboo", sizeId: "small", qty: 3 };
    const priced = priceOrder([dumpling, { ...dumpling, note: "gift" }], "BH", "en");
    expect(priced.lines[0].lineTotal).toBe(4.5);
    expect(priced.subtotal).toBe(9);
  });

  it("returns localized colour and size names", () => {
    const [line] = priceOrder([clicker], "BH", "ar").lines;
    expect(line.colorName).toBe("أصفر");
    expect(line.sizeName).toBe("مقاس واحد");
  });

  it("skips lines whose product, colour or size no longer exists", () => {
    const priced = priceOrder(
      [
        { ...clicker, slug: "gone" },
        { ...clicker, colorId: "gone" },
        { ...clicker, sizeId: "gone" },
        cell,
      ],
      "BH",
      "en",
    );
    expect(priced.lines).toHaveLength(1);
    expect(priced.lines[0].product.slug).toBe("plant-cell-model");
    expect(priced.subtotal).toBe(3);
    expect(priced.itemCount).toBe(1);
  });

  it("returns an empty, zero order for no lines", () => {
    expect(priceOrder([], "AE", "en")).toEqual({ currency: "AED", lines: [], subtotal: 0, itemCount: 0 });
  });

  it("carries the phone case note with its localized label, cleaned", () => {
    const [en] = priceOrder([{ ...phoneCase, note: "  iPhone 15 Pro\u0007 " }], "BH", "en").lines;
    expect(en.note).toEqual({ label: "iPhone model", value: "iPhone 15 Pro" });
    expect(en.unitPrice).toBe(2);
    const [ar] = priceOrder([phoneCase], "BH", "ar").lines;
    expect(ar.note).toEqual({ label: "موديل الآيفون", value: "iPhone 15 Pro" });
  });

  it("drops empty notes and notes on products that don't ask for one", () => {
    expect(priceOrder([{ ...phoneCase, note: "   " }], "BH", "en").lines[0].note).toBeUndefined();
    expect(priceOrder([{ ...clicker, note: "anything" }], "BH", "en").lines[0].note).toBeUndefined();
  });

  it("leaves dims undefined for the real products", () => {
    for (const line of priceOrder([clicker, cell, phoneCase], "BH", "en").lines) expect(line.dims).toBeUndefined();
  });
});

describe("cityName", () => {
  it("translates city ids for the region", () => {
    expect(cityName("BH", "manama", "en")).toBe("Manama");
    expect(cityName("BH", "manama", "ar")).toBe("المنامة");
    expect(cityName("AE", "abu-dhabi", "en")).toBe("Abu Dhabi");
  });

  it("falls back to the raw value", () => {
    expect(cityName("BH", "dubai", "en")).toBe("dubai");
  });
});

describe("sanitizeText", () => {
  it("returns an empty string for empty input", () => {
    expect(sanitizeText(undefined, 10)).toBe("");
    expect(sanitizeText(null, 10)).toBe("");
    expect(sanitizeText("", 10)).toBe("");
    expect(sanitizeText("   ", 10)).toBe("");
  });

  it("trims and truncates to the limit", () => {
    expect(sanitizeText("  hello  ", 10)).toBe("hello");
    expect(sanitizeText("abcdefghij-overflow", 10)).toBe("abcdefghij");
  });

  it("strips control characters but keeps newlines", () => {
    expect(sanitizeText("a\u0000b\u0007c\td\re\u001Bf\u007Fg", 50)).toBe("abcdefg");
    expect(sanitizeText("line 1\nline 2", 50)).toBe("line 1\nline 2");
  });

  it("collapses runs of blank lines to one blank line", () => {
    expect(sanitizeText("a\n\n\n\n\nb", 50)).toBe("a\n\nb");
    expect(sanitizeText("a\n\nb", 50)).toBe("a\n\nb");
  });

  it("strips bidi marks and overrides that could reorder the message", () => {
    expect(sanitizeText("‎abc‏", 50)).toBe("abc");
    expect(sanitizeText("x‪y‫z‬‭‮", 50)).toBe("xyz");
  });

  it("keeps Arabic, Latin and punctuation intact", () => {
    const text = "شارع ١٢، مبنى 5 — Block 338, Flat #4 & *door*";
    expect(sanitizeText(text, 200)).toBe(text);
  });
});
