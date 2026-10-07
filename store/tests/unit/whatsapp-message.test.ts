import { describe, expect, it } from "vitest";
import type { Customer, Locale, OrderLine, Region } from "@/types";
import { PRODUCTS } from "@/content/catalog";
import { site } from "@/lib/site";
import {
  LIMITS,
  MAX_LINES,
  MAX_QTY,
  MAX_WHATSAPP_URL_LENGTH,
  buildCustomRequestMessage,
  buildHelloMessage,
  buildWhatsAppMessagePayload,
  createOrderRef,
  generateWhatsAppLink,
  isWithinUrlLimit,
  resolveLine,
  type CustomRequestInput,
} from "@/lib/whatsapp";

/* Brand-agnostic: the shop name and order prefix come from lib/site.ts. */
const BRAND = site.name;
const PREFIX = site.orderPrefix;
const REF = `${PREFIX}-7K3Q2`;
const escapeRegExp = (text: string) => text.replace(/[.*+?^$|()[\]{}\\]/g, "\\$&");
const REF_PATTERN = new RegExp(`^${escapeRegExp(PREFIX)}-[0-9A-HJKMNP-TV-Z]{5}$`);
const sku = (slug: string) => PRODUCTS.find((p) => p.slug === slug)!.sku;

const clicker: OrderLine = { slug: "keycap-clicker", colorId: "yellow", sizeId: "one", qty: 1 };
const cell: OrderLine = { slug: "plant-cell-model", colorId: "multicolour", sizeId: "one", qty: 1 };
const phoneCase: OrderLine = {
  slug: "hex-phone-case",
  colorId: "sky-blue",
  sizeId: "fitted",
  qty: 1,
  note: "iPhone 15 Pro",
};
const fatima: Customer = { name: "Fatima Ali", phone: "+973 3985 8885", city: "manama", area: "Block 338", notes: "Ring twice" };

function message(lines: OrderLine[], opts: { region?: Region; locale?: Locale; customer?: Customer } = {}) {
  return buildWhatsAppMessagePayload({
    ref: REF,
    region: opts.region ?? "BH",
    locale: opts.locale ?? "en",
    lines,
    customer: opts.customer ?? fatima,
  });
}

/** Counter-based fake for Math.random: yields the given values in order, then repeats the last. */
function sequence(...values: number[]) {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

describe("buildWhatsAppMessagePayload (English)", () => {
  it("produces the exact receipt for a typical Bahrain order", () => {
    expect(message([{ ...clicker, qty: 2 }, phoneCase])).toBe(
      [
        `Hi ${BRAND}, I'd like to place an order.`,
        "",
        `*Order ${REF}*`,
        "",
        "1. Keycap Clicker — One size, Yellow",
        "   2 × 1.000 BHD = 2.000 BHD",
        `   ${sku("keycap-clicker")}`,
        "2. Hex Phone Case — Fitted to your iPhone, Sky blue",
        "   iPhone model: iPhone 15 Pro",
        "   2.000 BHD",
        `   ${sku("hex-phone-case")}`,
        "",
        "Subtotal: 4.000 BHD",
        "Delivery: to be confirmed in this chat",
        "",
        "Name: Fatima Ali",
        "Phone: +973 3985 8885",
        "Deliver to: Manama, Bahrain — Block 338",
        "Notes: Ring twice",
      ].join("\n"),
    );
  });

  it("opens with a greeting to the shop by name and a bold order reference", () => {
    const lines = message([clicker]).split("\n");
    expect(lines[0]).toContain(BRAND);
    expect(lines).toContain(`*Order ${REF}*`);
  });

  it("numbers every line and shows size and colour without empty brackets", () => {
    const msg = message([clicker, cell, phoneCase]);
    expect(msg).toContain("1. Keycap Clicker — One size, Yellow\n");
    expect(msg).toContain("2. Plant Cell Model — One size, Multicolour\n");
    expect(msg).toContain("3. Hex Phone Case — Fitted to your iPhone, Sky blue\n");
    expect(msg).not.toContain("()");
    expect(msg).not.toMatch(/\d+×\d+×\d+/);
  });

  it("prints the iPhone model under the phone case, cleaned", () => {
    const msg = message([{ ...phoneCase, note: "  iPhone\u0000 15 Pro\u202E " }]);
    expect(msg).toContain("\n   iPhone model: iPhone 15 Pro\n");
  });

  it("shows qty × unit = total only when qty > 1", () => {
    expect(message([clicker])).toContain("\n   1.000 BHD\n");
    expect(message([clicker])).not.toContain(" × ");
    expect(message([{ ...clicker, qty: 3 }])).toContain("\n   3 × 1.000 BHD = 3.000 BHD\n");
  });

  it("lists each line's SKU", () => {
    const msg = message([clicker, cell]);
    expect(msg).toContain(`\n   ${sku("keycap-clicker")}\n`);
    expect(msg).toContain(`\n   ${sku("plant-cell-model")}\n`);
  });

  it("totals 2 × Keycap Clicker + 1 × Plant Cell Model as 5.000 BHD", () => {
    expect(message([{ ...clicker, qty: 2 }, cell])).toContain("\nSubtotal: 5.000 BHD\n");
  });

  it("says delivery is confirmed in the chat and shows no total while the fee is unknown", () => {
    const lines = message([clicker]).split("\n");
    expect(lines).toContain("Delivery: to be confirmed in this chat");
    expect(lines.some((l) => l.startsWith("Total"))).toBe(false);
    expect(lines.some((l) => l.startsWith("VAT"))).toBe(false);
  });

  it("leaves out optional customer fields that are empty", () => {
    const msg = message([clicker], { customer: { name: "Fatima", city: "riffa" } });
    expect(msg).not.toContain("Phone:");
    expect(msg).not.toContain("Notes:");
    expect(msg.split("\n").at(-1)).toBe("Deliver to: Riffa, Bahrain");
  });

  it("sanitizes customer free text", () => {
    const msg = message([clicker], {
      customer: { name: "  Fatima\u0007 ", city: "manama", area: "\u202EBlock 1", notes: "a\n\n\n\nb\t" },
    });
    expect(msg).toContain("\nName: Fatima\n");
    expect(msg).toContain("\nDeliver to: Manama, Bahrain — Block 1\n");
    expect(msg.endsWith("\nNotes: a\n\nb")).toBe(true);
  });

  it("uses AED for the UAE", () => {
    const msg = message([{ ...clicker, qty: 2 }, cell], { region: "AE", customer: { name: "Omar", city: "dubai" } });
    expect(msg).toContain("   2 × 10.00 AED = 20.00 AED");
    expect(msg).toContain("   30.00 AED");
    expect(msg).toContain("Subtotal: 50.00 AED");
    expect(msg).toContain("Deliver to: Dubai, UAE");
    expect(msg).not.toContain("BHD");
  });

  it("skips products that have left the catalog", () => {
    const msg = message([{ ...clicker, slug: "retired" }, cell]);
    expect(msg).toContain("1. Plant Cell Model");
    expect(msg).not.toContain("2. ");
    expect(msg).toContain("Subtotal: 3.000 BHD");
  });
});

describe("buildWhatsAppMessagePayload (Arabic)", () => {
  it("produces the exact receipt for a UAE order", () => {
    expect(
      message([{ ...clicker, qty: 2 }, phoneCase], { region: "AE", locale: "ar", customer: { name: "فاطمة", city: "dubai" } }),
    ).toBe(
      [
        `مرحباً ${BRAND}، أرغب في تقديم طلب.`,
        "",
        `*طلب رقم ${REF}*`,
        "",
        "1. ميدالية الكيكاب — مقاس واحد، أصفر",
        "   2 × 10.00 د.إ = 20.00 د.إ",
        `   ${sku("keycap-clicker")}`,
        "2. كفر الخلايا السداسية — حسب موديل الآيفون، أزرق سماوي",
        "   موديل الآيفون: iPhone 15 Pro",
        "   20.00 د.إ",
        `   ${sku("hex-phone-case")}`,
        "",
        "المجموع الفرعي: 40.00 د.إ",
        "التوصيل: يُؤكد في هذه المحادثة",
        "",
        "الاسم: فاطمة",
        "التوصيل إلى: دبي، الإمارات",
      ].join("\n"),
    );
  });

  it("uses Arabic labels and د.ب in Bahrain", () => {
    const msg = message([{ ...clicker, qty: 2 }, cell], { locale: "ar" });
    expect(msg).toContain(BRAND);
    expect(msg).toContain(`*طلب رقم ${REF}*`);
    expect(msg).toContain("   2 × 1.000 د.ب = 2.000 د.ب");
    expect(msg).toContain("المجموع الفرعي: 5.000 د.ب");
    expect(msg).toContain("الاسم: Fatima Ali");
    expect(msg).toContain("الهاتف: +973 3985 8885");
    expect(msg).toContain("التوصيل إلى: المنامة، البحرين — Block 338");
    expect(msg).toContain("ملاحظات: Ring twice");
    expect(msg).not.toContain("BHD");
    expect(msg).not.toMatch(/\b(Subtotal|Delivery|Name|Phone|Notes|Order)\b/);
  });
});

describe("message hygiene", () => {
  const customers: Customer[] = [
    fatima,
    { name: "Fa", city: "manama" },
    { name: "Fa", city: "other-bh", phone: "", area: "", notes: "" },
  ];

  it("never prints undefined, NaN or null, in any locale or region", () => {
    for (const locale of ["en", "ar"] as const) {
      for (const region of ["BH", "AE"] as const) {
        for (const customer of customers) {
          const city = region === "AE" ? "sharjah" : customer.city;
          const msg = message([clicker, { ...cell, qty: 4 }, phoneCase, { ...phoneCase, note: undefined }], {
            locale,
            region,
            customer: { ...customer, city },
          });
          expect(msg).not.toMatch(/undefined|NaN|null|\[object Object\]/);
          expect(msg).not.toMatch(/[\t\r]/);
          expect(msg).not.toMatch(/\n{3,}/);
        }
      }
    }
  });

  it("formats every catalog product in both currencies", () => {
    for (const product of PRODUCTS) {
      const line: OrderLine = {
        slug: product.slug,
        colorId: product.colors[0].id,
        sizeId: product.sizes[0].id,
        qty: 2,
        note: product.variantNote ? "iPhone 15" : undefined,
      };
      expect(message([line])).toMatch(/\d+\.\d{3} BHD = \d+\.\d{3} BHD/);
      expect(message([line], { region: "AE", customer: { name: "Omar", city: "dubai" } })).toMatch(
        /\d+\.\d{2} AED = \d+\.\d{2} AED/,
      );
      expect(message([line])).toContain(product.sku);
    }
  });
});

describe("maximal order", () => {
  /** 20 phone cases (each with a distinct 40-character model note, so the cart keeps them apart) at qty 20, with every free-text field at its limit. */
  function maximalLink(locale: Locale, char: string) {
    const lines: OrderLine[] = Array.from({ length: MAX_LINES }, (_, i) => ({
      ...phoneCase,
      qty: MAX_QTY,
      note: `${i}${char.repeat(LIMITS.note)}`.slice(0, LIMITS.note),
    }));
    const customer: Customer = {
      name: char.repeat(LIMITS.name),
      phone: "+973 3985 8885 000000000".slice(0, LIMITS.phone),
      city: "other-bh",
      area: char.repeat(LIMITS.area),
      notes: char.repeat(LIMITS.notes),
    };
    const msg = buildWhatsAppMessagePayload({ ref: REF, region: "BH", locale, lines, customer });
    return generateWhatsAppLink(resolveLine("BH").e164, msg);
  }

  it("stays under MAX_WHATSAPP_URL_LENGTH in English", () => {
    const link = maximalLink("en", "x");
    expect(link.length, `maximal English order link is ${link.length} characters`).toBeLessThanOrEqual(
      MAX_WHATSAPP_URL_LENGTH,
    );
  });

  it("is detected as too long in Arabic, so checkout can block it with a clear error", () => {
    // 20 lines × 40 Arabic note characters plus 400 Arabic notes is far past any real order.
    const link = maximalLink("ar", "ب");
    expect(isWithinUrlLimit(link)).toBe(false);
  });

  it("fits a large but realistic Arabic order", () => {
    // Every product, two of each, Arabic name/area and 200 characters of Arabic notes.
    const lines: OrderLine[] = PRODUCTS.map((p) => ({
      slug: p.slug,
      colorId: p.colors[0].id,
      sizeId: p.sizes[0].id,
      qty: 2,
      note: p.variantNote ? "iPhone 15 Pro Max" : undefined,
    }));
    const customer: Customer = {
      name: "عبدالله محمد الهاشمي",
      phone: "+973 3985 8885",
      city: "riffa",
      area: "مجمع 939، طريق 3905، مبنى 12",
      notes: "ب".repeat(200),
    };
    const msg = buildWhatsAppMessagePayload({ ref: REF, region: "BH", locale: "ar", lines, customer });
    const link = generateWhatsAppLink(resolveLine("BH").e164, msg);
    expect(link.length, `realistic Arabic order link is ${link.length} characters`).toBeLessThanOrEqual(
      MAX_WHATSAPP_URL_LENGTH,
    );
  });
});

describe("createOrderRef", () => {
  it("is the order prefix plus five Crockford base32 characters", () => {
    for (let i = 0; i < 500; i++) expect(createOrderRef()).toMatch(REF_PATTERN);
  });

  it("is deterministic with an injected random source", () => {
    expect(createOrderRef(() => 0)).toBe(`${PREFIX}-00000`);
    expect(createOrderRef(() => 0.999999)).toBe(`${PREFIX}-ZZZZZ`);
    // 32 symbols: index = floor(r × 32).
    expect(createOrderRef(sequence(7 / 32, 20 / 32, 3 / 32, 23 / 32, 2 / 32))).toBe(`${PREFIX}-7M3Q2`);
  });

  it("never uses the ambiguous letters I, L, O or U", () => {
    const seen = new Set<string>();
    for (let k = 0; k < 32; k++) seen.add(createOrderRef(() => k / 32).slice(PREFIX.length + 1, PREFIX.length + 2));
    expect(seen.size).toBe(32);
    for (const letter of ["I", "L", "O", "U"]) expect(seen.has(letter)).toBe(false);
    for (const ch of seen) expect(`${PREFIX}-${ch.repeat(5)}`).toMatch(REF_PATTERN);
  });
});

describe("buildCustomRequestMessage", () => {
  const base: CustomRequestInput = {
    ref: `${PREFIX}-AB12C`,
    region: "BH",
    locale: "en",
    description: "A replacement knob for my desk lamp",
    quantity: 1,
    customer: { name: "Fatima", city: "manama" },
  };

  it("produces the exact request", () => {
    expect(
      buildCustomRequestMessage({ ...base, size: "about 4 cm", material: "petg", colour: "Black", quantity: 2, neededBy: "Next week" }),
    ).toBe(
      [
        `Hi ${BRAND}, I'd like a quote for a custom print.`,
        "",
        `*Custom request ${PREFIX}-AB12C*`,
        "",
        "What: A replacement knob for my desk lamp",
        "Approx. size: about 4 cm",
        "Material: PETG",
        "Colour: Black",
        "Quantity: 2",
        "Needed by: Next week",
        "",
        "Name: Fatima",
        "Deliver to: Manama, Bahrain",
        "",
        "I'll send reference photos or a 3D file in this chat.",
      ].join("\n"),
    );
  });

  it("asks for advice when the material is unsure or missing", () => {
    expect(buildCustomRequestMessage({ ...base, material: "unsure" })).toContain("\nMaterial: Not sure, please advise\n");
    expect(buildCustomRequestMessage({ ...base, material: undefined })).toContain("\nMaterial: Not sure, please advise\n");
  });

  it("says no rush when there is no date", () => {
    expect(buildCustomRequestMessage({ ...base, neededBy: "" })).toContain("\nNeeded by: No rush\n");
    expect(buildCustomRequestMessage({ ...base, neededBy: "   " })).toContain("\nNeeded by: No rush\n");
    expect(buildCustomRequestMessage(base)).toContain("\nNeeded by: No rush\n");
  });

  it.each([
    [2.9, 2],
    [1, 1],
    [0, 1],
    [-4, 1],
    [Number.NaN, 1],
  ])("floors quantity %s to %s (minimum 1)", (quantity, expected) => {
    expect(buildCustomRequestMessage({ ...base, quantity })).toContain(`\nQuantity: ${expected}\n`);
  });

  it("leaves out size and colour when empty", () => {
    const msg = buildCustomRequestMessage({ ...base, size: "", colour: "  " });
    expect(msg).not.toContain("Approx. size:");
    expect(msg).not.toContain("Colour:");
  });

  it("caps and cleans the description", () => {
    const msg = buildCustomRequestMessage({ ...base, description: `\u202E${"d".repeat(900)}` });
    expect(msg).toContain(`\nWhat: ${"d".repeat(500)}\n`);
    expect(msg).not.toContain("d".repeat(501));
  });

  it("writes Arabic requests with Arabic labels and material names", () => {
    const msg = buildCustomRequestMessage({
      ...base,
      locale: "ar",
      region: "AE",
      material: "pla-silk",
      customer: { name: "عمر", city: "abu-dhabi" },
    });
    expect(msg).toContain(`*طلب مخصص رقم ${PREFIX}-AB12C*`);
    expect(msg).toContain("الخامة: PLA حريري");
    expect(msg).toContain("مطلوب قبل: لا يوجد استعجال");
    expect(msg).toContain("التوصيل إلى: أبوظبي، الإمارات");
    expect(buildCustomRequestMessage({ ...base, locale: "ar" })).toContain("الخامة: غير متأكد، أرجو الاقتراح");
  });

  it("never prints undefined, NaN or null", () => {
    const msg = buildCustomRequestMessage({ ...base, quantity: Number.NaN, size: undefined, colour: undefined });
    expect(msg).not.toMatch(/undefined|NaN|null/);
  });
});

describe("buildHelloMessage", () => {
  it("greets the shop by name in both languages", () => {
    expect(buildHelloMessage("en")).toBe(`Hi ${BRAND}, I have a question.`);
    expect(buildHelloMessage("ar")).toBe(`مرحباً ${BRAND}، لدي استفسار.`);
  });
});
