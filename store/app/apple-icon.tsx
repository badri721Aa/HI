import { ImageResponse } from "next/og";
import { markSvg, svgDataUri } from "@/components/seo/og-art";

/**
 * Full-bleed icons: the dark square fills the canvas and the mark sits well
 * inside the central safe circle (80% of the width). iOS rounds the corners of
 * apple-touch icons itself, and Android masks "maskable" manifest icons the
 * same way, so one design serves both:
 *   /apple-icon/180      → <link rel="apple-touch-icon">
 *   /apple-icon/maskable → manifest icon with purpose "maskable" (512px)
 */
const VARIANTS = { "180": 180, maskable: 512 } as const;

export function generateImageMetadata() {
  return Object.entries(VARIANTS).map(([id, px]) => ({
    id,
    size: { width: px, height: px },
    contentType: "image/png",
  }));
}

export default async function AppleIcon({ id }: { id: Promise<string | number> }) {
  const px = String(await id) === "maskable" ? VARIANTS.maskable : VARIANTS["180"];
  const svg = markSvg({ size: px, background: "full", scale: 0.5, weight: 0.85 });
  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", backgroundColor: "#020203" }}>
        <img src={svgDataUri(svg)} width={px} height={px} alt="" />
      </div>
    ),
    { width: px, height: px },
  );
}
