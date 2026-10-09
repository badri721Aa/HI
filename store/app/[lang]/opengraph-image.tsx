import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { LOCALES, isLocale } from "@/lib/i18n";
import { OgCard, ogFonts } from "@/components/seo/og-card";
import { homeCard } from "@/components/seo/og-content";

// Alt text is set per language with the page metadata (ogImages in lib/seo.ts).
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Read at module scope so the image prerenders at build time.
const fontDir = join(process.cwd(), "assets/fonts");
const [sansSemibold, sansRegular, mono, arabicBold, arabicMedium] = await Promise.all([
  readFile(join(fontDir, "InstrumentSans-SemiBold.ttf")),
  readFile(join(fontDir, "InstrumentSans-Regular.ttf")),
  readFile(join(fontDir, "JetBrainsMono-Regular.ttf")),
  readFile(join(fontDir, "Tajawal-Bold.ttf")),
  readFile(join(fontDir, "Tajawal-Medium.ttf")),
]);
const fonts = ogFonts({ sansSemibold, sansRegular, mono, arabicBold, arabicMedium });

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export default async function Image({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) return new Response("Not found", { status: 404 });
  return new ImageResponse(<OgCard {...homeCard(lang)} />, { ...size, fonts });
}
