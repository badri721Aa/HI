import type { MetadataRoute } from "next";
import { PRODUCTS } from "@/content/catalog";
import { LOCALES } from "@/lib/i18n";
import { CONTENT_UPDATED_AT, absoluteUrl, languageAlternates } from "@/lib/seo";

interface Page {
  /** Path below the locale segment: "" for home. */
  path: string;
  priority: number;
  changeFrequency: "weekly" | "monthly";
  /** Image paths on the site; products list their real photos. */
  images?: string[];
}

/** Home and every product, in English and Arabic, each listing its translations and images. */
export default function sitemap(): MetadataRoute.Sitemap {
  const pages: Page[] = [
    { path: "", priority: 1, changeFrequency: "weekly" },
    ...PRODUCTS.map(
      (p): Page => ({
        path: `/products/${p.slug}`,
        priority: 0.8,
        changeFrequency: "monthly",
        images: p.images.map((i) => i.src),
      }),
    ),
  ];

  return pages.flatMap((page) => {
    const languages = Object.fromEntries(
      Object.entries(languageAlternates(page.path)).map(([lang, path]) => [lang, absoluteUrl(path)]),
    );
    return LOCALES.map((locale) => ({
      url: absoluteUrl(`/${locale}${page.path}`),
      lastModified: CONTENT_UPDATED_AT,
      changeFrequency: page.changeFrequency,
      priority: page.priority,
      alternates: { languages },
      images: (page.images ?? [`/${locale}${page.path}/opengraph-image`]).map((src) => absoluteUrl(src)),
    }));
  });
}
