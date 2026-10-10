import type { Customer, Locale, MaterialId, OrderLine, Region } from "@/types";
import { REGION_CONFIG, site, vat } from "@/lib/site";
import { formatCurrency, fromMinor, toMinor } from "@/lib/currency";
import { getMaterial } from "@/content/catalog";
import { LIMITS, cityName, priceOrder, sanitizeText } from "./order";
import { generateWhatsAppLink, isWithinUrlLimit } from "./link";
import { normalizeDigits } from "./phone";
import { silentColour } from "./variant";

/* Crockford base32 without I, L, O, U: easy to read out over the phone. */
const REF_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Short human-friendly order reference, e.g. 3DBH-7K3Q2. */
export function createOrderRef(random: () => number = Math.random): string {
  let id = "";
  for (let i = 0; i < 5; i++) id += REF_ALPHABET[Math.floor(random() * REF_ALPHABET.length)];
  return `${site.orderPrefix}-${id}`;
}

const T = {
  en: {
    greeting: (brand: string) => `Hi ${brand}, I'd like to place an order.`,
    order: "Order",
    subtotal: "Subtotal",
    vat: (pct: number) => `VAT ${pct}%`,
    total: "Total",
    delivery: "Delivery fee",
    deliveryChat: "to be confirmed in this chat",
    name: "Name",
    phone: "Phone",
    deliverTo: "Deliver to",
    notes: "Notes",
    mm: "mm",
    customGreeting: (brand: string) => `Hi ${brand}, I'd like a quote for a custom print.`,
    customRequest: "Custom request",
    what: "What",
    size: "Approx. size",
    material: "Material",
    colour: "Colour",
    quantity: "Quantity",
    neededBy: "Needed by",
    notSure: "Not sure, please advise",
    attachLater: "I can send photos or a 3D file here if needed.",
    hello: (brand: string) => `Hi ${brand}, I have a question.`,
  },
  ar: {
    greeting: (brand: string) => `مرحباً ${brand}، أرغب في تقديم طلب.`,
    order: "طلب رقم",
    subtotal: "المجموع الفرعي",
    vat: (pct: number) => `ضريبة القيمة المضافة ${pct}%`,
    total: "الإجمالي",
    delivery: "رسوم التوصيل",
    deliveryChat: "تُحدد في هذه المحادثة",
    name: "الاسم",
    phone: "الهاتف",
    deliverTo: "التوصيل إلى",
    notes: "ملاحظات",
    mm: "مم",
    customGreeting: (brand: string) => `مرحباً ${brand}، أرغب في عرض سعر لطباعة مخصصة.`,
    customRequest: "طلب مخصص رقم",
    what: "القطعة",
    size: "المقاس التقريبي",
    material: "الخامة",
    colour: "اللون",
    quantity: "الكمية",
    neededBy: "مطلوب قبل",
    notSure: "غير متأكد، أرجو الاقتراح",
    attachLater: "يمكنني إرسال صور أو ملف ثلاثي الأبعاد هنا عند الحاجة.",
    hello: (brand: string) => `مرحباً ${brand}، لدي استفسار.`,
  },
} as const;

/*
 * WhatsApp sets each line's direction from its first strong character. In
 * an Arabic message, a line that opens with Latin (a SKU) would flip to the
 * left, so it gets a right-to-left mark; a phone number is isolated so its
 * digit groups keep their order.
 */
const RLM = "\u200F";
const LRI = "\u2066";
const PDI = "\u2069";
const LATIN = /[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u024F]/;
const FIRST_STRONG = /[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u024F\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFC]/;

function rtlLine(line: string): string {
  const first = FIRST_STRONG.exec(line)?.[0];
  return first && LATIN.test(first) ? `${RLM}${line}` : line;
}

const finish = (out: string[], locale: Locale) => (locale === "ar" ? out.map(rtlLine) : out).join("\n");

function addressLine(region: Region, customer: Pick<Customer, "city" | "area">, locale: Locale): string {
  // No city yet (live preview before one is picked): print just the region, not ", Bahrain".
  const parts = [cityName(region, customer.city, locale), REGION_CONFIG[region].name[locale]].filter(Boolean);
  const area = sanitizeText(customer.area, LIMITS.area);
  return area ? `${parts.join(locale === "ar" ? "، " : ", ")} — ${area}` : parts.join(locale === "ar" ? "، " : ", ");
}

export interface OrderMessageInput {
  ref: string;
  region: Region;
  locale: Locale;
  lines: OrderLine[];
  customer: Customer;
  /** Leaves out SKUs and dimensions, for orders whose full receipt is past the link limit. */
  compact?: boolean;
}

/** Plain-text order receipt, formatted to read well in a WhatsApp chat bubble. */
export function buildWhatsAppMessagePayload({ ref, region, locale, lines, customer, compact = false }: OrderMessageInput): string {
  const t = T[locale];
  const priced = priceOrder(lines, region, locale);
  const { currency } = priced;
  const fmt = (n: number) => formatCurrency(n, currency, locale);
  const sep = locale === "ar" ? "، " : ", ";
  const out: string[] = [t.greeting(site.name), "", `*${t.order} ${ref}*`, ""];

  priced.lines.forEach((p, i) => {
    const dims = p.dims && !compact ? ` (${p.dims.w}×${p.dims.d}×${p.dims.h} ${t.mm})` : "";
    // A sole size tells the shop nothing ("One size", "Fitted to your iPhone") unless it carries measurements.
    const variant: string[] = [];
    if (p.product.sizes.length > 1 || dims) variant.push(`${p.sizeName}${dims}`);
    const colour = p.product.colors.find((c) => c.id === p.line.colorId);
    if (!(p.product.colors.length === 1 && colour && silentColour(colour))) variant.push(p.colorName);
    out.push(`${i + 1}. ${p.product.name[locale]}${variant.length ? ` — ${variant.join(sep)}` : ""}`);
    if (p.note) out.push(`   ${p.note.label}: ${p.note.value}`);
    out.push(
      p.line.qty > 1
        ? `   ${p.line.qty} × ${fmt(p.unitPrice)} = ${fmt(p.lineTotal)}`
        : `   ${fmt(p.unitPrice)}`,
    );
    if (!compact) out.push(`   ${p.product.sku}`);
  });

  out.push("", `${t.subtotal}: ${fmt(priced.subtotal)}`);

  const regionConfig = REGION_CONFIG[region];
  const fee = regionConfig.deliveryFee;
  out.push(`${t.delivery}: ${fee === null ? t.deliveryChat : fmt(fee)}`);

  if (vat.enabled) {
    const base = toMinor(priced.subtotal + (fee ?? 0), currency);
    const vatMinor = Math.round(base * regionConfig.vatRate);
    out.push(`${t.vat(Math.round(regionConfig.vatRate * 100))}: ${fmt(fromMinor(vatMinor, currency))}`);
    out.push(`${t.total}: ${fmt(fromMinor(base + vatMinor, currency))}`);
  } else if (fee !== null) {
    out.push(`${t.total}: ${fmt(priced.subtotal + fee)}`);
  }

  out.push("", `${t.name}: ${sanitizeText(customer.name, LIMITS.name)}`);
  const phone = normalizeDigits(sanitizeText(customer.phone, LIMITS.phone));
  if (phone) out.push(`${t.phone}: ${locale === "ar" ? `${LRI}${phone}${PDI}` : phone}`);
  out.push(`${t.deliverTo}: ${addressLine(region, customer, locale)}`);
  const notes = sanitizeText(customer.notes, LIMITS.notes);
  if (notes) out.push(`${t.notes}: ${notes}`);

  return finish(out, locale);
}

export interface OrderLink {
  /** The exact text the link carries: show this in the preview. */
  message: string;
  href: string;
  /** True when the full receipt was too long and the compact one is used. */
  compact: boolean;
  /** False when even the compact receipt is past MAX_WHATSAPP_URL_LENGTH. */
  fits: boolean;
}

/**
 * The order's wa.me link. Uses the full receipt when it fits the URL limit,
 * otherwise the compact one (no SKUs or dimensions; names, variants, notes,
 * quantities and prices stay).
 */
export function buildOrderLink(phone: string, input: Omit<OrderMessageInput, "compact">): OrderLink {
  const full = buildWhatsAppMessagePayload(input);
  const fullHref = generateWhatsAppLink(phone, full);
  if (isWithinUrlLimit(fullHref)) return { message: full, href: fullHref, compact: false, fits: true };
  const message = buildWhatsAppMessagePayload({ ...input, compact: true });
  const href = generateWhatsAppLink(phone, message);
  return { message, href, compact: true, fits: isWithinUrlLimit(href) };
}

/**
 * Why an order's link is past the URL limit, or null when it fits:
 * - "notes": the same order with shorter notes would fit;
 * - "details": it would fit without the customer's details, so shorter ones (or fewer pieces) may do;
 * - "pieces": the pieces alone are too long, whatever is typed: only splitting the order helps.
 */
export type OrderLinkOverflow = "notes" | "details" | "pieces";

/**
 * The shortest details a valid order can carry: a two-letter name in the
 * page's script and the region's shortest named city ("other" cities need an
 * address, so they are never shorter). If the pieces don't fit even with
 * these, no details the customer could type would make the order sendable.
 */
function minimalDetails(region: Region, locale: Locale): Customer {
  const encoded = (id: string) => encodeURIComponent(cityName(region, id, locale)).length;
  const cities = REGION_CONFIG[region].cities.filter((c) => !c.id.startsWith("other"));
  const city = cities.reduce((a, b) => (encoded(b.id) < encoded(a.id) ? b : a)).id;
  return { name: locale === "ar" ? "أب" : "Al", phone: "", city, area: "", notes: "" };
}

export function orderLinkOverflow(phone: string, input: Omit<OrderMessageInput, "compact">): OrderLinkOverflow | null {
  const fits = (customer: Customer) => buildOrderLink(phone, { ...input, customer }).fits;
  const piecesFit = () => fits(minimalDetails(input.region, input.locale));
  const { name, city, notes } = input.customer;
  // Details not filled in yet (the items step): judge the pieces with the shortest details that could be valid.
  if ((name?.trim().length ?? 0) < 2 || !city) return piecesFit() ? null : "pieces";
  if (fits(input.customer)) return null;
  if (notes?.trim() && fits({ ...input.customer, notes: "" })) return "notes";
  return piecesFit() ? "details" : "pieces";
}

export interface CustomRequestInput {
  ref: string;
  region: Region;
  locale: Locale;
  description: string;
  size?: string;
  material?: MaterialId | "unsure";
  colour?: string;
  quantity: number;
  neededBy?: string;
  customer: Pick<Customer, "name" | "city">;
}

export const CUSTOM_LIMITS = { description: 500, size: 60, colour: 40, neededBy: 40 } as const;

export function buildCustomRequestMessage(input: CustomRequestInput): string {
  const t = T[input.locale];
  const loc = input.locale;
  const material =
    !input.material || input.material === "unsure" ? t.notSure : getMaterial(input.material).name[loc];
  const out = [
    t.customGreeting(site.name),
    "",
    `*${t.customRequest} ${input.ref}*`,
    "",
    `${t.what}: ${sanitizeText(input.description, CUSTOM_LIMITS.description)}`,
  ];
  const size = sanitizeText(input.size, CUSTOM_LIMITS.size);
  if (size) out.push(`${t.size}: ${size}`);
  out.push(`${t.material}: ${material}`);
  const colour = sanitizeText(input.colour, CUSTOM_LIMITS.colour);
  if (colour) out.push(`${t.colour}: ${colour}`);
  out.push(`${t.quantity}: ${Math.max(1, Math.floor(input.quantity) || 1)}`);
  const neededBy = sanitizeText(input.neededBy, CUSTOM_LIMITS.neededBy);
  if (neededBy) out.push(`${t.neededBy}: ${neededBy}`);
  out.push("", `${t.name}: ${sanitizeText(input.customer.name, LIMITS.name)}`);
  out.push(`${t.deliverTo}: ${addressLine(input.region, input.customer, loc)}`);
  out.push("", t.attachLater);
  return finish(out, loc);
}

/** Opening line for a general enquiry ("Chat on WhatsApp" buttons). */
export function buildHelloMessage(locale: Locale): string {
  return T[locale].hello(site.name);
}
