import { z } from "zod";
import { REGIONS } from "@/types";
import { getProduct } from "@/content/catalog";
import { REGION_CONFIG } from "@/lib/site";
import { LIMITS, MAX_LINES, MAX_QTY, isOtherCity, type OrderErrorKey, type OrderInput, type ValidationResult } from "./order";
import { isPlausiblePhone } from "./phone";

/*
 * Order validation. zod is ~27 KB gzipped, so this module is deliberately
 * not part of the `@/lib/whatsapp` barrel: the checkout imports it on
 * demand when the order drawer opens.
 */

const err = (key: OrderErrorKey) => ({ message: key });

export const orderLineSchema = z
  .object({
    slug: z.string().min(1),
    colorId: z.string().min(1),
    sizeId: z.string().min(1),
    qty: z.number().int(err("qty_invalid")).min(1, err("qty_invalid")).max(MAX_QTY, err("qty_invalid")),
    note: z.string().trim().max(LIMITS.note, err("note_too_long")).optional(),
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
    if (product.variantNote?.required && !line.note?.trim()) {
      ctx.addIssue({ code: "custom", message: "note_required", path: ["note"] });
    }
  });

export const customerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, err("name_required"))
    .min(2, err("name_too_short"))
    .max(LIMITS.name, err("name_too_long")),
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
    } else if (isOtherCity(order.customer.city) && !order.customer.area?.trim()) {
      // "Other area" on its own gives the shop nothing to deliver to.
      ctx.addIssue({ code: "custom", message: "area_required", path: ["customer", "area"] });
    }
  });

// Keeps the hand-written OrderInput (zod-free, in ./order) in step with the schema.
type Assignable<T, U extends T> = U;
export type OrderInputMatchesSchema = Assignable<z.input<typeof orderSchema>, OrderInput>;

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
