import { ImageResponse } from "next/og";
import { markSvg, svgDataUri } from "@/components/seo/og-art";

/**
 * PNG app icons for the web manifest ("any" purpose), served at /icon/192 and
 * /icon/512. The browser-tab favicon is the vector app/icon.svg.
 */
const SIZES = [192, 512] as const;

export function generateImageMetadata() {
  return SIZES.map((px) => ({
    id: String(px),
    size: { width: px, height: px },
    contentType: "image/png",
  }));
}

export default async function Icon({ id }: { id: Promise<string | number> }) {
  const px = Number(await id) === 192 ? 192 : 512;
  const svg = markSvg({ size: px, background: "rounded", scale: 0.56, weight: 0.85 });
  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%" }}>
        <img src={svgDataUri(svg)} width={px} height={px} alt="" />
      </div>
    ),
    { width: px, height: px },
  );
}
