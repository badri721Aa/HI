import type { Currency, Customer, Locale, OrderLine, Product, Region } from "@/types";
import { getProduct } from "@/content/catalog";
import { REGION_CONFIG } from "@/lib/site";
import { currencyForRegion, fromMinor, priceFor, toMinor } from "@/lib/currency";

export const MAX_QTY = 20;
export const MAX_LINES = 20;
export const LIMITS = { name: 60, phone: 24, area: 80, notes: 400, note: 40 } as const;

/**
 * Validation error keys. The UI maps each to a translated message via the
 * `errors` dictionary (lib/i18n/messages/common.ts), so keep the two in sync.
 */
export type OrderErrorKey =
  | "cart_empty"
  | "too_many_lines"
  | "qty_invalid"
  | "unknown_product"
  | "unknown_variant"
  | "note_required"
  | "note_too_long"
  | "name_required"
  | "name_too_short"
  | "name_too_long"
  | "phone_invalid"
  | "city_required"
  | "area_required"
  | "area_too_long"
  | "notes_too_long"
  | "spam";

/** Strips control characters, trims, and collapses runs of blank lines. */
export function sanitizeText(input: string | undefined | null, max: number): string {
  if (!input) return "";
  return input
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

/** "Other area" style choices: the city alone doesn't say where to deliver. */
export function isOtherCity(cityId: string | undefined | null): boolean {
  return !!cityId && cityId.startsWith("other-");
}

/** What validateOrder() checks (lib/whatsapp/schema.ts, loaded on demand so zod stays off first load). */
export interface OrderInput {
  region: Region;
  lines: OrderLine[];
  customer: Customer;
  /** Honeypot. Real people never see or fill this field. */
  website?: string;
}

export interface ValidationResult {
  ok: boolean;
  /** First error per field path, e.g. { "customer.name": "name_required" }. */
  errors: Record<string, OrderErrorKey>;
}

export interface PricedLine {
  line: OrderLine;
  product: Product;
  colorName: string;
  sizeName: string;
  dims?: Product["sizes"][number]["dims"];
  /** Cleaned answer to the product's variantNote, with its label. */
  note?: { label: string; value: string };
  unitPrice: number;
  lineTotal: number;
}

export interface PricedOrder {
  currency: Currency;
  lines: PricedLine[];
  subtotal: number;
  itemCount: number;
}

/** Prices order lines in the region's currency, skipping lines that no longer exist in the catalog. */
export function priceOrder(lines: OrderLine[], region: Region, locale: Locale): PricedOrder {
  const currency = currencyForRegion(region);
  let subtotalMinor = 0;
  let itemCount = 0;
  const priced: PricedLine[] = [];
  for (const line of lines) {
    const product = getProduct(line.slug);
    const color = product?.colors.find((c) => c.id === line.colorId);
    const size = product?.sizes.find((s) => s.id === line.sizeId);
    if (!product || !color || !size) continue;
    const unitMinor = toMinor(priceFor(size, currency), currency);
    const totalMinor = unitMinor * line.qty;
    subtotalMinor += totalMinor;
    itemCount += line.qty;
    priced.push({
      line,
      product,
      colorName: color.name[locale],
      sizeName: size.name[locale],
      dims: size.dims,
      note:
        product.variantNote && line.note?.trim()
          ? { label: product.variantNote.label[locale], value: sanitizeText(line.note, LIMITS.note) }
          : undefined,
      unitPrice: fromMinor(unitMinor, currency),
      lineTotal: fromMinor(totalMinor, currency),
    });
  }
  return { currency, lines: priced, subtotal: fromMinor(subtotalMinor, currency), itemCount };
}

/** Customer-facing city name for an id in a region, falling back to the raw value. */
export function cityName(region: Region, cityId: string, locale: Locale): string {
  return REGION_CONFIG[region].cities.find((c) => c.id === cityId)?.name[locale] ?? cityId;
}

export type { Customer };
