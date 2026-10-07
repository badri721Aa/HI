// STUB — owned by the platform builder.
import type { Metadata, Viewport } from "next";
import type { Locale, Product } from "@/types";
import { site } from "@/lib/site";

export const siteViewport: Viewport = { themeColor: "#020203", colorScheme: "dark" };

export function layoutMetadata(locale: Locale): Metadata {
  return { metadataBase: new URL(site.url), title: site.name, other: { locale } };
}

export function productMetadata(product: Product, locale: Locale): Metadata {
  return { title: product.name[locale] };
}

export function organizationJsonLd(locale: Locale): Record<string, unknown> {
  return { "@context": "https://schema.org", "@type": "Store", name: site.name, inLanguage: locale };
}

export function productJsonLd(product: Product, locale: Locale): Record<string, unknown> {
  return { "@context": "https://schema.org", "@type": "Product", name: product.name[locale] };
}
