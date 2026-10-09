import type { Metadata } from "next";
import { lang } from "next/root-params";
import type { Locale } from "@/types";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n";
import { notFoundMetadata } from "@/lib/seo";
import { NotFoundView } from "./not-found-view";

async function currentLocale(): Promise<Locale> {
  const value = await lang();
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/** Replaces the layout's home title, canonical and og:url, which would otherwise apply to the 404. */
export async function generateMetadata(): Promise<Metadata> {
  return notFoundMetadata(await currentLocale());
}

/**
 * Shown for notFound() inside a [lang] page. proxy.ts sends every unknown
 * path under /en and /ar here (through an unknown product slug), with a 404.
 */
export default async function NotFound() {
  return <NotFoundView locale={await currentLocale()} />;
}
