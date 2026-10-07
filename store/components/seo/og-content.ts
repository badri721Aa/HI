/**
 * Copy and data for the Open Graph cards. Kept apart from the route files so
 * the cards can be rendered and checked outside Next (no module-scope I/O).
 */
import type { Locale, Product } from "@/types";
import { CATEGORIES, PRODUCTS, getMaterial, getProduct } from "@/content/catalog";
import { SILHOUETTES } from "@/components/3d/silhouettes";
import { formatCurrency, priceFor } from "@/lib/currency";
import { getDictionary } from "@/lib/i18n";
import { WHATSAPP_LINES, site } from "@/lib/site";
import type { OgCardProps } from "./og-card";

/** Height of the default size and the layer readout for a part caught mid-print. */
function printReadout(product: Product | undefined, progress: number, locale: Locale) {
  const t = getDictionary(locale);
  const size = product?.sizes[0];
  const h = size?.dims.h ?? 220;
  const total = Math.max(1, Math.round(h / (product?.layerHeight ?? 0.2)));
  const layer = Math.round(total * progress);
  return {
    heightLabel: `${h} ${t.common.units.mm}`,
    layerLabel: `${t.home.hero.hud.layer} ${layer} / ${total}`,
  };
}

export function homeCard(locale: Locale): OgCardProps {
  const t = getDictionary(locale);
  const progress = 0.58;
  return {
    locale,
    brand: site.name,
    path: SILHOUETTES["ripple-vase"],
    progress,
    tag: "BH / AE",
    eyebrow: { text: t.common.brandLine },
    titleLines: t.home.hero.titleLines,
    titleSize: 80,
    details: [t.common.actions.orderWhatsApp, WHATSAPP_LINES["bh-primary"].display, WHATSAPP_LINES.ae.display],
    ...printReadout(getProduct("ripple-vase"), progress, locale),
  };
}

export function productCard(product: Product, locale: Locale): OgCardProps {
  const t = getDictionary(locale);
  const progress = 0.7;
  const index = PRODUCTS.findIndex((p) => p.slug === product.slug);
  const category = CATEGORIES.find((c) => c.id === product.category);

  const minPrice = (currency: "BHD" | "AED") => Math.min(...product.sizes.map((s) => priceFor(s, currency)));
  const price = `${t.home.collection.from} ${formatCurrency(minPrice("BHD"), "BHD", locale)} · ${formatCurrency(minPrice("AED"), "AED", locale)}`;

  const heights = product.sizes.map((s) => s.dims.h);
  const first = product.sizes[0].dims;
  const minH = Math.min(...heights);
  const maxH = Math.max(...heights);
  const size =
    product.sizes.length > 1 && minH !== maxH
      ? `${minH}–${maxH} ${t.common.units.mm}`
      : `${first.w}×${first.d}×${first.h} ${t.common.units.mm}`;

  const name = product.name[locale];
  return {
    locale,
    brand: site.name,
    path: SILHOUETTES[product.model],
    progress,
    tag: product.sku,
    eyebrow: { index: String(index + 1).padStart(2, "0"), text: category?.name[locale] ?? "" },
    titleLines: [name],
    titleSize: name.length > 14 ? 74 : 84,
    body: product.tagline[locale],
    details: [price, getMaterial(product.material).name[locale], size],
    swatches: product.colors.map((c) => c.hex),
    ...printReadout(product, progress, locale),
  };
}
