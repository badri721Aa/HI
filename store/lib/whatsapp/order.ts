import { z } from "zod";
import type { Currency, Customer, Locale, OrderLine, Product, Region } from "@/types";
import { REGIONS } from "@/types";
import { getProduct } from "@/content/catalog";
import { REGION_CONFIG } from "@/lib/site";
import { currencyForRegion, fromMinor, priceFor, toMinor } from "@/lib/currency";
import { isPlausiblePhone } from "./phone";

export const MAX_QTY = 20;
export const MAX_LINES = 20;
export const LIMITS = { name: 60, phone: 24, area: 80, notes: 400 } as const;

/**
 * Validation error keys. The UI maps each to a translated message via the
 * `errors` dictionary, so keep these in sync with lib/i18n/dictionaries.
 */
export type OrderErrorKey =
  | "cart_empty"
  | "too_many_lines"
  | "qty_invalid"
  | "unknown_product"
  | "unknown_variant"
  | "name_required"
  | "name_too_long"
  | "phone_invalid"
  | "city_required"
  | "area_too_long"
  | "notes_too_long"
  | "spam";

const err = (key: OrderErrorKey) => ({ message: key });

/** Strips control characters, trims, and collapses runs of blank lines. */
export function sanitizeText(input: string | undefined | null, max: number): string {
  if (!input) return "";
  return input
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F‎‏‪-‮]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

export const orderLineSchema = z
  .object({
    slug: z.string().min(1),
    colorId: z.string().min(1),
    sizeId: z.string().min(1),
    qty: z.number().int(err("qty_invalid")).min(1, err("qty_invalid")).max(MAX_QTY, err("qty_invalid")),
  })
  .superRefine((line, ctx) => {
    const product = getProduct(line.slug);
    if (!product) {
      ctx.addIssue({ code: "custom", message: "unknown_product", path: ["slug"] });
      return;
    }
    if (!product.colors.some((c) => c.id === line.colorId)) {
      ctx.addIssue({ code: "custom", message: "unknown_variant", path: ["colorId"] });
    }
    if (!product.sizes.some((s) => s.id === line.sizeId)) {
      ctx.addIssue({ code: "custom", message: "unknown_variant", path: ["sizeId"] });
    }
  });

export const customerSchema = z.object({
  name: z.string().trim().min(2, err("name_required")).max(LIMITS.name, err("name_too_long")),
  phone: z
    .string()
    .trim()
    .max(LIMITS.phone, err("phone_invalid"))
    .optional()
    .refine((v) => !v || isPlausiblePhone(v), err("phone_invalid")),
  city: z.string().trim().min(1, err("city_required")),
  area: z.string().trim().max(LIMITS.area, err("area_too_long")).optional(),
  notes: z.string().trim().max(LIMITS.notes, err("notes_too_long")).optional(),
});

export const orderSchema = z
  .object({
    region: z.enum(REGIONS),
    lines: z.array(orderLineSchema).min(1, err("cart_empty")).max(MAX_LINES, err("too_many_lines")),
    customer: customerSchema,
    /** Honeypot. Real people never see or fill this field. */
    website: z.string().max(0, err("spam")).optional(),
  })
  .superRefine((order, ctx) => {
    const cities = REGION_CONFIG[order.region].cities;
    if (order.customer.city && !cities.some((c) => c.id === order.customer.city)) {
      ctx.addIssue({ code: "custom", message: "city_required", path: ["customer", "city"] });
    }
  });

export type OrderInput = z.input<typeof orderSchema>;

export interface ValidationResult {
  ok: boolean;
  /** First error per field path, e.g. { "customer.name": "name_required" }. */
  errors: Record<string, OrderErrorKey>;
}

export function validateOrder(input: OrderInput): ValidationResult {
  const result = orderSchema.safeParse(input);
  if (result.success) return { ok: true, errors: {} };
  const errors: Record<string, OrderErrorKey> = {};
  for (const issue of result.error.issues) {
    const path = issue.path.join(".") || "_";
    if (!errors[path]) errors[path] = issue.message as OrderErrorKey;
  }
  return { ok: false, errors };
}

export interface PricedLine {
  line: OrderLine;
  product: Product;
  colorName: string;
  sizeName: string;
  dims: Product["sizes"][number]["dims"];
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
