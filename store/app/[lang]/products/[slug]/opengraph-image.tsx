import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { PRODUCTS, getProduct } from "@/content/catalog";
import { LOCALES, isLocale } from "@/lib/i18n";
import { siteCopy } from "@/lib/i18n/messages/site";
import { OgCard, ogFonts } from "@/components/seo/og-card";
import { productCard } from "@/components/seo/og-content";

export const alt = siteCopy.en.meta.productOgAlt;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Read at module scope so the images prerender at build time.
const fontDir = join(process.cwd(), "assets/fonts");
const [sansSemibold, sansRegular, mono, arabicBold, arabicMedium] = await Promise.all([
  readFile(join(fontDir, "InstrumentSans-SemiBold.ttf")),
  readFile(join(fontDir, "InstrumentSans-Regular.ttf")),
  readFile(join(fontDir, "JetBrainsMono-Regular.ttf")),
  readFile(join(fontDir, "Tajawal-Bold.ttf")),
  readFile(join(fontDir, "Tajawal-Medium.ttf")),
]);
const fonts = ogFonts({ sansSemibold, sansRegular, mono, arabicBold, arabicMedium });

/**
 * Product photos for the cards: assets/og-photos/<slug>.png, 312×390 (the
 * photo well) and at most 256 colours, which keeps each card well under the
 * ~300 KB that WhatsApp link previews tolerate. Satori cannot decode WebP.
 * Products without a photo get the silhouette art.
 */
const photoDir = join(process.cwd(), "assets/og-photos");
const photoFiles = (await readdir(photoDir).catch(() => [] as string[])).filter((f) => /\.(png|jpe?g)$/.test(f));
const photos = new Map(
  await Promise.all(
    photoFiles.map(async (f) => {
      const type = f.endsWith(".png") ? "png" : "jpeg";
      const data = await readFile(join(photoDir, f));
      return [f.replace(/\.[^.]+$/, ""), `data:image/${type};base64,${data.toString("base64")}`] as const;
    }),
  ),
);

/** Image routes only see their own params, so this lists every locale × product. */
export function generateStaticParams() {
  return LOCALES.flatMap((lang) => PRODUCTS.map((p) => ({ lang, slug: p.slug })));
}

export default async function Image({ params }: { params: Promise<{ lang: string; slug: string }> }) {
  const { lang, slug } = await params;
  const product = getProduct(slug);
  if (!isLocale(lang) || !product) return new Response("Not found", { status: 404 });
  return new ImageResponse(<OgCard {...productCard(product, lang, photos.get(slug))} />, { ...size, fonts });
}
