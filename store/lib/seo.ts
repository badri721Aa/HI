import type { Metadata, Viewport } from "next";
import type { Locale, Product } from "@/types";
import { LOCALES } from "@/types";
import { CATEGORIES, getMaterial } from "@/content/catalog";
import { CURRENCY_DECIMALS, priceFor } from "@/lib/currency";
import { fmt, getDictionary } from "@/lib/i18n";
import { HOURS, HOURS_CONFIRMED, REGION_CONFIG, WHATSAPP_LINES, site, type RegionConfig } from "@/lib/site";

/**
 * Date the catalogue or copy last changed, used as the sitemap's lastModified.
 * A fixed value keeps the sitemap static; bump it when products change.
 */
export const CONTENT_UPDATED_AT = "2026-10-07";

const OG_LOCALE: Record<Locale, string> = { en: "en_US", ar: "ar_BH" };
const STORE_ID = `${site.url}/#store`;
const WEBSITE_ID = `${site.url}/#website`;
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const COUNTRY_NAME = { BH: "Bahrain", AE: "United Arab Emirates" } as const;

/** Absolute URL on the production origin: absoluteUrl("/en") → https://…/en */
export function absoluteUrl(path = "/"): string {
  return path === "/" ? `${site.url}/` : `${site.url}${path.startsWith("/") ? path : `/${path}`}`;
}

/** hreflang map for a path below the locale segment ("" for home, "/products/x"). */
export function languageAlternates(path = "") {
  return {
    en: `/en${path}`,
    ar: `/ar${path}`,
    "x-default": `/en${path}`,
  };
}

/** Size of the generated share cards (the opengraph-image routes). */
const OG_SIZE = { width: 1200, height: 630 } as const;

/**
 * The share card of a page, with alt text in the page's language. Setting it
 * here (rather than through the image file's static `alt` export, which has
 * one language) wins over the file convention; twitter:image inherits it.
 */
function ogImages(path: string, alt: string) {
  return [{ url: path, ...OG_SIZE, alt, type: "image/png" }];
}

function openGraphBase(locale: Locale) {
  return {
    type: "website" as const,
    siteName: site.name,
    locale: OG_LOCALE[locale],
    alternateLocale: LOCALES.filter((l) => l !== locale).map((l) => OG_LOCALE[l]),
  };
}

export const siteViewport: Viewport = {
  themeColor: "#020203",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/** Root-layout metadata. OG/Twitter images come from the opengraph-image files. */
export function layoutMetadata(locale: Locale): Metadata {
  const meta = getDictionary(locale).site.meta;
  const title = `${site.name} — ${meta.title}`;
  return {
    metadataBase: new URL(site.url),
    title: { default: title, template: `%s · ${site.name}` },
    description: meta.description,
    applicationName: site.name,
    alternates: { canonical: `/${locale}`, languages: languageAlternates() },
    openGraph: {
      ...openGraphBase(locale),
      url: `/${locale}`,
      title,
      description: meta.description,
      images: ogImages(`/${locale}/opengraph-image`, meta.ogAlt),
    },
    twitter: { card: "summary_large_image" },
    appleWebApp: { capable: true, title: site.name, statusBarStyle: "black-translucent" },
    formatDetection: { telephone: false },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
    },
    category: "shopping",
  };
}

/**
 * Product page metadata. The description is the short tagline (the full copy
 * runs past what results show); the image is the product's share card.
 */
export function productMetadata(product: Product, locale: Locale): Metadata {
  const name = product.name[locale];
  const path = `/products/${product.slug}`;
  const meta = getDictionary(locale).site.meta;
  return {
    title: name,
    description: product.tagline[locale],
    alternates: { canonical: `/${locale}${path}`, languages: languageAlternates(path) },
    openGraph: {
      ...openGraphBase(locale),
      url: `/${locale}${path}`,
      title: `${name} · ${site.name}`,
      description: product.tagline[locale],
      images: ogImages(`/${locale}${path}/opengraph-image`, fmt(meta.productOgAlt, { name })),
    },
  };
}

/**
 * 404 metadata: its own title, no canonical or hreflang (the layout's point
 * at the home page), and noindex (Next adds one for the 404 status as well).
 */
export function notFoundMetadata(locale: Locale): Metadata {
  const copy = getDictionary(locale).site;
  return {
    title: copy.notFound.metaTitle,
    robots: { index: false, follow: true },
    alternates: { canonical: null },
    openGraph: {
      ...openGraphBase(locale),
      title: `${copy.notFound.metaTitle} · ${site.name}`,
      images: ogImages(`/${locale}/opengraph-image`, copy.meta.ogAlt),
    },
  };
}

/** Hours the WhatsApp lines are answered, grouped into schema.org specs. */
export function openingHours(hoursByDay: typeof HOURS = HOURS) {
  const groups = new Map<string, string[]>();
  for (let day = 0; day < 7; day++) {
    const hours = hoursByDay[day];
    if (!hours) continue;
    const key = hours.join("|");
    groups.set(key, [...(groups.get(key) ?? []), DAYS[day]]);
  }
  return [...groups].map(([key, dayOfWeek]) => {
    const [opens, closes] = key.split("|");
    return { "@type": "OpeningHoursSpecification", dayOfWeek, opens, closes };
  });
}

/**
 * The shop as a schema.org OnlineStore (an Organization: there is no walk-in
 * address, which a Store/LocalBusiness would need), plus the WebSite node.
 * Opening hours belong to the WhatsApp contact points, which is what they
 * describe; currencies are stated on each product Offer.
 */
export function organizationJsonLd(locale: Locale): Record<string, unknown> {
  const t = getDictionary(locale);
  // Unconfirmed hours are never published (see HOURS_CONFIRMED).
  const hours = HOURS_CONFIRMED ? openingHours() : undefined;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "OnlineStore",
        "@id": STORE_ID,
        name: site.name,
        url: absoluteUrl(`/${locale}`),
        description: t.site.meta.description,
        slogan: t.common.brandLine,
        logo: { "@type": "ImageObject", url: absoluteUrl("/icon/512"), width: 512, height: 512 },
        image: absoluteUrl(`/${locale}/opengraph-image`),
        areaServed: (Object.keys(COUNTRY_NAME) as (keyof typeof COUNTRY_NAME)[]).map((code) => ({
          "@type": "Country",
          name: COUNTRY_NAME[code],
          identifier: code,
        })),
        knowsLanguage: ["en", "ar"],
        contactPoint: Object.values(WHATSAPP_LINES).map((line) => ({
          "@type": "ContactPoint",
          name: line.label[locale],
          telephone: line.e164,
          url: `https://wa.me/${line.e164.replace(/\D/g, "")}`,
          contactType: "sales",
          areaServed: line.region,
          availableLanguage: ["en", "ar"],
          hoursAvailable: hours,
        })),
      },
      {
        "@type": "WebSite",
        "@id": WEBSITE_ID,
        url: absoluteUrl("/"),
        name: site.name,
        inLanguage: locale,
        publisher: { "@id": STORE_ID },
      },
    ],
  };
}

const days = (range: readonly [number, number]) => ({
  "@type": "QuantitativeValue",
  minValue: range[0],
  maxValue: range[1],
  unitCode: "DAY",
});

/**
 * Delivery inside one country: how long making takes (when the catalog says)
 * and the courier's transit time. The fee is quoted in the WhatsApp chat
 * unless the region sets a flat one, so the rate is left out otherwise.
 */
function shippingDetails(region: RegionConfig, leadTime: readonly [number, number] | undefined) {
  return {
    "@type": "OfferShippingDetails",
    shippingDestination: { "@type": "DefinedRegion", addressCountry: region.id },
    deliveryTime: {
      "@type": "ShippingDeliveryTime",
      ...(leadTime ? { handlingTime: days(leadTime) } : {}),
      transitTime: days(region.deliveryDays),
    },
    ...(region.deliveryFee !== null
      ? {
          shippingRate: {
            "@type": "MonetaryAmount",
            value: region.deliveryFee.toFixed(CURRENCY_DECIMALS[region.currency]),
            currency: region.currency,
          },
        }
      : {}),
  };
}

/** Product with one Offer per size and currency (BHD for Bahrain, AED for the UAE). */
export function productJsonLd(product: Product, locale: Locale): Record<string, unknown> {
  const url = absoluteUrl(`/${locale}/products/${product.slug}`);
  const inStock = (product.stock ?? 0) > 0;
  const leadTime = product.leadTimeDays;
  const regions = Object.values(REGION_CONFIG);

  const offers = product.sizes.flatMap((size) =>
    regions.map((region) => ({
      "@type": "Offer",
      name: size.name[locale],
      sku: `${product.sku}-${size.id.toUpperCase()}`,
      price: priceFor(size, region.currency).toFixed(CURRENCY_DECIMALS[region.currency]),
      priceCurrency: region.currency,
      availability: inStock ? "https://schema.org/InStock" : "https://schema.org/MadeToOrder",
      itemCondition: "https://schema.org/NewCondition",
      eligibleRegion: { "@type": "Country", name: COUNTRY_NAME[region.id], identifier: region.id },
      url,
      seller: { "@type": "OnlineStore", "@id": STORE_ID, name: site.name },
      shippingDetails: shippingDetails(region, inStock ? undefined : leadTime),
      ...(inStock || !leadTime
        ? {}
        : {
            deliveryLeadTime: {
              "@type": "QuantitativeValue",
              minValue: leadTime[0],
              maxValue: leadTime[1],
              unitCode: "DAY",
            },
          }),
    })),
  );

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${url}#product`,
    name: product.name[locale],
    description: `${product.tagline[locale]} ${product.description[locale]}`,
    sku: product.sku,
    brand: { "@type": "Brand", name: site.name },
    ...(product.material ? { material: getMaterial(product.material).name[locale] } : {}),
    category: CATEGORIES.find((c) => c.id === product.category)?.name[locale],
    image: [
      ...product.images.map((i) => absoluteUrl(i.src)),
      absoluteUrl(`/${locale}/products/${product.slug}/opengraph-image`),
    ],
    url,
    offers,
  };
}

/** Mirrors the visible breadcrumb on product pages: Collection › category › product. */
export function breadcrumbJsonLd(product: Product, locale: Locale): Record<string, unknown> {
  const t = getDictionary(locale);
  const collection = absoluteUrl(`/${locale}#collection`);
  const category = CATEGORIES.find((c) => c.id === product.category);
  const trail = [
    { name: t.common.nav.collection, item: collection },
    ...(category ? [{ name: category.name[locale], item: collection }] : []),
    { name: product.name[locale], item: absoluteUrl(`/${locale}/products/${product.slug}`) },
  ];
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((step, i) => ({ "@type": "ListItem", position: i + 1, ...step })),
  };
}
