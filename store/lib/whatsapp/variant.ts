import type { ColorOption, Locale, OrderLine, Product, SizeOption } from "@/types";

/** "One size" style names carry no information when they're the only option. */
export const silentSize = (size: SizeOption) => /^(one|one-size|default)$/.test(size.id) || /^one size$/i.test(size.name.en);
export const silentColour = (colour: ColorOption) => /^(one|default)$/.test(colour.id);

/**
 * The parts that describe a line's variant: ["Fitted to your iPhone", "Sky
 * blue"]. A part is left out when the product offers only that one option
 * and it says nothing ("One size"); a sole option that does describe the
 * piece ("Fitted to your iPhone", "Yellow") stays.
 */
export function variantParts(product: Product, line: OrderLine, locale: Locale): string[] {
  const size = product.sizes.find((s) => s.id === line.sizeId);
  const colour = product.colors.find((c) => c.id === line.colorId);
  const parts: string[] = [];
  if (size && !(product.sizes.length === 1 && silentSize(size))) parts.push(size.name[locale]);
  if (colour && !(product.colors.length === 1 && silentColour(colour))) parts.push(colour.name[locale]);
  return parts;
}

/** "Fitted to your iPhone · Sky blue", for plain text. On screen, render variantParts so the dot can't dangle. */
export function variantLabel(product: Product, line: OrderLine, locale: Locale): string {
  return variantParts(product, line, locale).join(" · ");
}
