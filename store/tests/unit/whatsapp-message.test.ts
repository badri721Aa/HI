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
  buildOrderLink,
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
const RLM = "\u200F";
const LRI = "\u2066";
const PDI = "\u2069";

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
        "1. Keycap Clicker — Yellow",
        "   2 × 1.000 BHD = 2.000 BHD",
        `   ${sku("keycap-clicker")}`,
        "2. Hex Phone Case — Sky blue",
        "   iPhone model: iPhone 15 Pro",
        "   2.000 BHD",
        `   ${sku("hex-phone-case")}`,
        "",
        "Subtotal: 4.000 BHD",
        "Delivery fee: to be confirmed in this chat",
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

  it("numbers every line and shows the colour, leaving out a size there was no choice of", () => {
    const msg = message([clicker, cell, phoneCase]);
    expect(msg).toContain("1. Keycap Clicker — Yellow\n");
    expect(msg).toContain("2. Plant Cell Model — Multicolour\n");
    expect(msg).toContain("3. Hex Phone Case — Sky blue\n");
    expect(msg).not.toContain("One size");
    expect(msg).not.toContain("Fitted to your iPhone");
    expect(msg).not.toContain("()");
    expect(msg).not.toMatch(/\d+×\d+×\d+/);
  });

  it("leaves out any sole size, named or not (the shop knows its own piece)", () => {
    const dumpling: OrderLine = { slug: "dumpling-steamer", colorId: "pink-bamboo", sizeId: "small", qty: 1 };
    expect(message([dumpling])).toContain("\n1. Dumpling in a Steamer — Pink & bamboo\n");
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
    expect(lines).toContain("Delivery fee: to be confirmed in this chat");
    expect(lines.some((l) => l.startsWith("Total"))).toBe(false);
    expect(lines.some((l) => l.startsWith("VAT"))).toBe(false);
  });

  it("prints a phone typed in Arabic-Indic digits with Western digits", () => {
    const msg = message([clicker], { customer: { ...fatima, phone: "٣٩٨٥ ٨٨٨٥" } });
    expect(msg).toContain("\nPhone: 3985 8885\n");
  });

  it("adds no direction marks to English messages", () => {
    expect(message([clicker, phoneCase])).not.toMatch(/[\u200E\u200F\u2066-\u2069]/);
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
        "1. ميدالية الكيكاب — أصفر",
        "   2 × 10.00 د.إ = 20.00 د.إ",
        `${RLM}   ${sku("keycap-clicker")}`,
        "2. كفر الخلايا السداسية — أزرق سماوي",
        "   موديل الآيفون: iPhone 15 Pro",
        "   20.00 د.إ",
        `${RLM}   ${sku("hex-phone-case")}`,
        "",
        "المجموع الفرعي: 40.00 د.إ",
        "رسوم التوصيل: تُحدد في هذه المحادثة",
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
    expect(msg).toContain(`الهاتف: ${LRI}+973 3985 8885${PDI}`);
    expect(msg).toContain("التوصيل إلى: المنامة، البحرين — Block 338");
    expect(msg).toContain("ملاحظات: Ring twice");
    expect(msg).not.toContain("BHD");
    expect(msg).not.toMatch(/\b(Subtotal|Delivery|Name|Phone|Notes|Order)\b/);
  });
});

describe("Arabic text direction", () => {
  /** First strong directional character of a line: what WhatsApp uses to align it. */
  const firstStrong = (line: string) => /[A-Za-z\u0600-\u06FF\u200F]/.exec(line)?.[0];

  it("starts every line that would open with Latin (the SKU) with a right-to-left mark", () => {
    const msg = message([clicker, cell, phoneCase], { locale: "ar" });
    const lines = msg.split("\n");
    for (const slug of ["keycap-clicker", "plant-cell-model", "hex-phone-case"]) {
      expect(lines).toContain(`${RLM}   ${sku(slug)}`);
    }
    for (const line of lines) {
      const first = firstStrong(line);
      if (first) expect(first, line).not.toMatch(/[A-Za-z]/);
    }
  });

  it("does not mark lines that already start with Arabic", () => {
    const lines = message([clicker], { locale: "ar" }).split("\n");
    expect(lines.filter((l) => l.startsWith(RLM))).toHaveLength(1);
  });

  it("isolates the phone number so its digit groups keep their order", () => {
    const msg = message([clicker], { locale: "ar", customer: { ...fatima, phone: "3333 4444" } });
    expect(msg).toContain(`\nالهاتف: ${LRI}3333 4444${PDI}\n`);
  });

  it("isolates and normalises a phone typed in Arabic-Indic digits", () => {
    const msg = message([clicker], { locale: "ar", customer: { ...fatima, phone: "+٩٧٣ ٣٣٣٣ ٤٤٤٤" } });
    expect(msg).toContain(`\nالهاتف: ${LRI}+973 3333 4444${PDI}\n`);
  });

  it("never lets the customer's own bidi controls through, only the builder's", () => {
    const msg = message([clicker], { locale: "ar", customer: { ...fatima, phone: "\u2066\u202E3333 4444\u2069" } });
    expect(msg).toContain(`الهاتف: ${LRI}3333 4444${PDI}`);
    expect(msg.match(/\u2066/g)).toHaveLength(1);
  });

  it("keeps the custom request's lines right to left too", () => {
    const msg = buildCustomRequestMessage({
      ref: `${PREFIX}-AB12C`,
      region: "BH",
      locale: "ar",
      description: "A replacement knob",
      quantity: 1,
      customer: { name: "Fatima", city: "manama" },
    });
    for (const line of msg.split("\n")) {
      const first = firstStrong(line);
      if (first) expect(first, line).not.toMatch(/[A-Za-z]/);
    }
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

describe("buildOrderLink (compact receipt)", () => {
  const phone = resolveLine("BH").e164;
  const input = (lines: OrderLine[], customer: Customer, locale: Locale = "en") => ({
    ref: REF,
    region: "BH" as const,
    locale,
    lines,
    customer,
  });
  const textOf = (href: string) => decodeURIComponent(href.split("?text=")[1] ?? "");
  const isSkuLine = (line: string) => PRODUCTS.some((p) => line.replace(RLM, "") === `   ${p.sku}`);

  /** 20 phone cases with Arabic models, and Arabic notes grown until the full receipt is just past the limit. */
  function justPastTheLimit() {
    const lines = Array.from({ length: MAX_LINES }, (_, i) => ({ ...phoneCase, qty: 2, note: `آيفون ${i} برو ماكس` }));
    for (let n = 0; n <= LIMITS.notes; n += 5) {
      const customer: Customer = { name: "فاطمة علي", city: "riffa", area: "مجمع 939", notes: "ب".repeat(n) };
      const full = generateWhatsAppLink(phone, buildWhatsAppMessagePayload(input(lines, customer, "ar")));
      if (!isWithinUrlLimit(full)) return { lines, customer };
    }
    throw new Error("no order in range is past the limit");
  }

  it("sends the full receipt when it fits", () => {
    const link = buildOrderLink(phone, input([clicker, phoneCase], fatima));
    expect(link).toMatchObject({ compact: false, fits: true });
    expect(link.message).toBe(message([clicker, phoneCase]));
    expect(textOf(link.href)).toBe(link.message);
  });

  it("the compact receipt is the full one without its SKU lines", () => {
    const full = message([clicker, cell, phoneCase]);
    const compact = buildWhatsAppMessagePayload({ ...input([clicker, cell, phoneCase], fatima), compact: true });
    expect(compact.split("\n")).toEqual(full.split("\n").filter((line) => !isSkuLine(line)));
    for (const slug of ["keycap-clicker", "plant-cell-model", "hex-phone-case"]) expect(compact).not.toContain(sku(slug));
  });

  it("switches to the compact receipt past the limit, and the link carries exactly that text", () => {
    const { lines, customer } = justPastTheLimit();
    const link = buildOrderLink(phone, input(lines, customer, "ar"));
    expect(link).toMatchObject({ compact: true, fits: true });
    expect(link.href.length).toBeLessThanOrEqual(MAX_WHATSAPP_URL_LENGTH);
    expect(link.message).toBe(buildWhatsAppMessagePayload({ ...input(lines, customer, "ar"), compact: true }));
    expect(textOf(link.href)).toBe(link.message);
    expect(link.message).not.toContain(sku("hex-phone-case"));
    // Names, variants, notes, quantities and prices all stay.
    expect(link.message).toContain(`${MAX_LINES}. كفر الخلايا السداسية — أزرق سماوي`);
    expect(link.message).toContain(`آيفون ${MAX_LINES - 1} برو ماكس`);
    expect(link.message).toContain("   2 × 2.000 د.ب = 4.000 د.ب");
    expect(link.message).toContain("المجموع الفرعي: 80.000 د.ب");
    expect(link.message).toContain("فاطمة علي");
  });

  it("reports that it doesn't fit when even the compact receipt is too long", () => {
    const lines = Array.from({ length: MAX_LINES }, (_, i) => ({ ...phoneCase, note: `${i}${"ب".repeat(LIMITS.note)}`.slice(0, LIMITS.note) }));
    const customer: Customer = { name: "ب".repeat(LIMITS.name), city: "riffa", notes: "ب".repeat(LIMITS.notes) };
    const link = buildOrderLink(phone, input(lines, customer, "ar"));
    expect(link).toMatchObject({ compact: true, fits: false });
    expect(textOf(link.href)).toBe(link.message);
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
        "I can send photos or a 3D file here if needed.",
      ].join("\n"),
    );
  });

  it("asks for advice when the material is unsure or missing", () => {
    expect(buildCustomRequestMessage({ ...base, material: "unsure" })).toContain("\nMaterial: Not sure, please advise\n");
    expect(buildCustomRequestMessage({ ...base, material: undefined })).toContain("\nMaterial: Not sure, please advise\n");
  });

  it("leaves out the date when none was given, rather than saying there's no rush", () => {
    for (const neededBy of ["", "   ", undefined]) {
      const msg = buildCustomRequestMessage({ ...base, neededBy });
      expect(msg).not.toContain("Needed by");
      expect(msg).not.toContain("No rush");
      expect(msg).toContain("\nQuantity: 1\n\nName: Fatima\n");
    }
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
    expect(msg).not.toContain("مطلوب قبل");
    expect(msg).not.toContain("استعجال");
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
