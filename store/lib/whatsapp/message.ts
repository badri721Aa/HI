import type { Customer, Locale, MaterialId, OrderLine, Region } from "@/types";
import { REGION_CONFIG, site, vat } from "@/lib/site";
import { formatCurrency, fromMinor, toMinor } from "@/lib/currency";
import { getMaterial } from "@/content/catalog";
import { LIMITS, cityName, priceOrder, sanitizeText } from "./order";

/* Crockford base32 without I, L, O, U: easy to read out over the phone. */
const REF_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Short human-friendly order reference, e.g. INF-7K3Q2. */
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
    delivery: "Delivery",
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
    noRush: "No rush",
    attachLater: "I'll send reference photos or a 3D file in this chat.",
    hello: (brand: string) => `Hi ${brand}, I have a question.`,
  },
  ar: {
    greeting: (brand: string) => `مرحباً ${brand}، أرغب في تقديم طلب.`,
    order: "طلب رقم",
    subtotal: "المجموع الفرعي",
    vat: (pct: number) => `ضريبة القيمة المضافة ${pct}%`,
    total: "الإجمالي",
    delivery: "التوصيل",
    deliveryChat: "يُؤكد في هذه المحادثة",
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
    noRush: "لا يوجد استعجال",
    attachLater: "سأرسل صوراً مرجعية أو ملفاً ثلاثي الأبعاد في هذه المحادثة.",
    hello: (brand: string) => `مرحباً ${brand}، لدي استفسار.`,
  },
} as const;

function addressLine(region: Region, customer: Pick<Customer, "city" | "area">, locale: Locale): string {
  const parts = [cityName(region, customer.city, locale), REGION_CONFIG[region].name[locale]];
  const area = sanitizeText(customer.area, LIMITS.area);
  return area ? `${parts.join(locale === "ar" ? "، " : ", ")} — ${area}` : parts.join(locale === "ar" ? "، " : ", ");
}

export interface OrderMessageInput {
  ref: string;
  region: Region;
  locale: Locale;
  lines: OrderLine[];
  customer: Customer;
}

/** Plain-text order receipt, formatted to read well in a WhatsApp chat bubble. */
export function buildWhatsAppMessagePayload({ ref, region, locale, lines, customer }: OrderMessageInput): string {
  const t = T[locale];
  const priced = priceOrder(lines, region, locale);
  const { currency } = priced;
  const fmt = (n: number) => formatCurrency(n, currency, locale);
  const sep = locale === "ar" ? "، " : ", ";
  const out: string[] = [t.greeting(site.name), "", `*${t.order} ${ref}*`, ""];

  priced.lines.forEach((p, i) => {
    const dims = `${p.dims.w}×${p.dims.d}×${p.dims.h} ${t.mm}`;
    out.push(`${i + 1}. ${p.product.name[locale]} — ${p.sizeName} (${dims})${sep}${p.colorName}`);
    out.push(
      p.line.qty > 1
        ? `   ${p.line.qty} × ${fmt(p.unitPrice)} = ${fmt(p.lineTotal)}`
        : `   ${fmt(p.unitPrice)}`,
    );
    out.push(`   ${p.product.sku}`);
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
  const phone = sanitizeText(customer.phone, LIMITS.phone);
  if (phone) out.push(`${t.phone}: ${phone}`);
  out.push(`${t.deliverTo}: ${addressLine(region, customer, locale)}`);
  const notes = sanitizeText(customer.notes, LIMITS.notes);
  if (notes) out.push(`${t.notes}: ${notes}`);

  return out.join("\n");
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
  out.push(`${t.neededBy}: ${sanitizeText(input.neededBy, CUSTOM_LIMITS.neededBy) || t.noRush}`);
  out.push("", `${t.name}: ${sanitizeText(input.customer.name, LIMITS.name)}`);
  out.push(`${t.deliverTo}: ${addressLine(input.region, input.customer, loc)}`);
  out.push("", t.attachLater);
  return out.join("\n");
}

/** Opening line for a general enquiry ("Chat on WhatsApp" buttons). */
export function buildHelloMessage(locale: Locale): string {
  return T[locale].hello(site.name);
}
