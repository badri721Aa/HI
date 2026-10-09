/**
 * Open Graph card rendered by ImageResponse (Satori), shared by the home and
 * product opengraph-image routes. Satori supports flexbox only, so every
 * element with more than one child is display:flex.
 */
import type { CSSProperties } from "react";
import type { Locale } from "@/types";
import { OG_COLORS as C, gridSvg, markSvg, printArtSvg, svgDataUri } from "./og-art";
import { OgText } from "./og-text";

export const OG_SIZE = { width: 1200, height: 630 } as const;

/**
 * Font files from assets/fonts (OFL; licences alongside). Each image route
 * reads them at module scope. JetBrains Mono is a Latin subset.
 */
export interface OgFontFiles {
  sansSemibold: Buffer;
  sansRegular: Buffer;
  mono: Buffer;
  arabicBold: Buffer;
  arabicMedium: Buffer;
}

export function ogFonts(f: OgFontFiles) {
  return [
    { name: "Instrument Sans", data: f.sansSemibold, weight: 600 as const, style: "normal" as const },
    { name: "Instrument Sans", data: f.sansRegular, weight: 400 as const, style: "normal" as const },
    { name: "JetBrains Mono", data: f.mono, weight: 400 as const, style: "normal" as const },
    { name: "Tajawal", data: f.arabicBold, weight: 700 as const, style: "normal" as const },
    { name: "Tajawal", data: f.arabicMedium, weight: 500 as const, style: "normal" as const },
  ];
}

export interface OgCardProps {
  locale: Locale;
  brand: string;
  /** Silhouette path data in a 0 0 100 100 box. */
  path: string;
  /** Fraction of the object already printed (0–1). */
  progress: number;
  /** Small label in the opposite top corner (SKU, regions). */
  tag: string;
  eyebrow: { index?: string; text: string };
  titleLines: string[];
  titleSize?: number;
  body?: string;
  /** Mono spec line along the bottom. */
  details: string[];
  /** Colour swatches shown under the part. */
  swatches?: string[];
  /** Readouts drawn next to the part. */
  heightLabel: string;
  layerLabel: string;
  /**
   * Product photo as a PNG/JPEG data URI (Satori cannot decode WebP). When
   * present it replaces the silhouette art.
   */
  photo?: string;
}

const PAD_X = 72;
const PAD_Y = 60;
const COPY_W = 566;
const ART_W = 1200 - PAD_X - COPY_W - 24;

const img = (src: string, w: number, h: number, style?: CSSProperties) => (
  // eslint-disable-next-line @next/next/no-img-element -- Satori draws <img>; next/image does not apply here
  <img src={src} width={w} height={h} alt="" style={style} />
);

/** Panel with the silhouette caught mid-print on the build plate. */
function PrintPanel({ p, rtl, label }: { p: OgCardProps; rtl: boolean; label: CSSProperties }) {
  const art = printArtSvg({
    path: p.path,
    width: ART_W,
    height: OG_SIZE.height,
    progress: p.progress,
    maxObjectWidth: 270,
    maxObjectHeight: 350,
    baseY: 486,
    centerX: 236,
  });
  const objCenter = (art.box.left + art.box.right) / 2;

  // Layer readout: beside the hot layer when there is room, else above the part.
  const labelW = rtl ? 24 + p.layerLabel.length * 8 : 22 + p.layerLabel.length * 9.2;
  const fitsBeside = art.box.right + 20 + labelW <= ART_W - 28;
  const layerPos = fitsBeside
    ? { left: art.box.right + 20, top: art.hotY - 30 }
    : { left: Math.max(art.box.right - labelW, 0), top: art.box.top - 40 };
  // Height callout, rotated along the dimension line drawn left of the part.
  const dimX = art.box.left - 34;

  return (
    <>
      {img(svgDataUri(art.svg), ART_W, OG_SIZE.height)}

      <div
        style={{
          position: "absolute",
          ...layerPos,
          width: labelW,
          display: "flex",
          justifyContent: fitsBeside ? "flex-start" : "flex-end",
          alignItems: "center",
          gap: 10,
          color: C.fgMuted,
          ...label,
        }}
      >
        <div style={{ width: 6, height: 6, borderRadius: 6, backgroundColor: C.glow, flexShrink: 0 }} />
        <OgText text={p.layerLabel} rtl={rtl} />
      </div>

      <div
        style={{
          position: "absolute",
          top: (art.box.top + art.box.bottom) / 2 - 10,
          left: dimX - 14 - 70,
          width: 140,
          height: 20,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          transform: "rotate(-90deg)",
          color: C.fgSubtle,
          ...label,
        }}
      >
        <OgText text={p.heightLabel} rtl={rtl} />
      </div>

      {p.swatches?.length ? (
        <div
          style={{
            position: "absolute",
            top: art.box.bottom + 38,
            left: objCenter - (p.swatches.length * 28 - 10) / 2,
            display: "flex",
            gap: 10,
          }}
        >
          {p.swatches.map((hex, i) => (
            <Swatch key={i} hex={hex} size={18} />
          ))}
        </div>
      ) : null}
    </>
  );
}

const PHOTO = { width: 312, height: 390 } as const;
const PHOTO_TOP = 112;
const PHOTO_LEFT = (ART_W - PHOTO.width) / 2;

/** Panel with the product photo framed like a print bed, one hot layer across it. */
function PhotoPanel({ p, photo }: { p: OgCardProps; photo: string }) {
  const lineY = PHOTO_TOP + Math.round(PHOTO.height * 0.8);
  return (
    <>
      <div
        style={{
          position: "absolute",
          top: PHOTO_TOP - 1,
          left: PHOTO_LEFT - 1,
          width: PHOTO.width + 2,
          height: PHOTO.height + 2,
          display: "flex",
          borderRadius: 24,
          border: "1px solid rgba(255,255,255,0.14)",
          backgroundColor: C.ink900,
          overflow: "hidden",
        }}
      >
        {img(photo, PHOTO.width, PHOTO.height, { objectFit: "cover" })}
      </div>
      {/* Slice plane across the panel, and the hot layer where it cuts the photo. */}
      <div
        style={{
          position: "absolute",
          top: lineY,
          left: PHOTO_LEFT - 28,
          width: PHOTO.width + 56,
          height: 1,
          backgroundColor: "rgba(125,227,238,0.3)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: lineY - 1,
          left: PHOTO_LEFT,
          width: PHOTO.width,
          height: 2,
          backgroundColor: "#C9F6FB",
          boxShadow: "0 0 14px 2px rgba(125,227,238,0.65)",
        }}
      />
      {p.swatches?.length ? (
        <div
          style={{
            position: "absolute",
            top: PHOTO_TOP + PHOTO.height + 26,
            left: 0,
            width: ART_W,
            display: "flex",
            justifyContent: "center",
            gap: 10,
          }}
        >
          {p.swatches.map((hex, i) => (
            <Swatch key={i} hex={hex} size={16} />
          ))}
        </div>
      ) : null}
    </>
  );
}

function Swatch({ hex, size }: { hex: string; size: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size,
        backgroundColor: hex,
        border: "1px solid rgba(255,255,255,0.22)",
      }}
    />
  );
}

export function OgCard(p: OgCardProps) {
  const rtl = p.locale === "ar";
  const W = OG_SIZE.width;
  const H = OG_SIZE.height;
  const artLeft = rtl ? 0 : W - ART_W;
  const grid = gridSvg({
    width: W,
    height: H,
    step: 42,
    focusX: artLeft + ART_W / 2,
    focusY: 430,
    radius: 620,
  });

  const mono: CSSProperties = rtl
    ? { fontFamily: "Tajawal", fontWeight: 500, fontSize: 20, letterSpacing: 0 }
    : { fontFamily: "JetBrains Mono", fontSize: 15, letterSpacing: 0.9, textTransform: "uppercase" };
  const label: CSSProperties = rtl
    ? { fontFamily: "Tajawal", fontWeight: 500, fontSize: 17, letterSpacing: 0 }
    : { fontFamily: "JetBrains Mono", fontSize: 13, letterSpacing: 1.3, textTransform: "uppercase" };
  const titleSize = p.titleSize ?? 84;
  const align = rtl ? "flex-end" : "flex-start";
  const row = rtl ? "row-reverse" : "row";

  return (
    <div
      style={{
        width: W,
        height: H,
        display: "flex",
        position: "relative",
        backgroundColor: C.ink950,
        color: C.fg,
        fontFamily: rtl ? "Tajawal" : "Instrument Sans",
      }}
    >
      {img(svgDataUri(grid), W, H, { position: "absolute", top: 0, left: 0 })}

      <div style={{ position: "absolute", top: 0, left: artLeft, width: ART_W, height: H, display: "flex" }}>
        {p.photo ? <PhotoPanel p={p} photo={p.photo} /> : <PrintPanel p={p} rtl={rtl} label={label} />}
      </div>

      {/* Corner tag, opposite the logo. */}
      <div
        style={{
          position: "absolute",
          top: PAD_Y + 8,
          ...(rtl ? { left: PAD_X } : { right: PAD_X }),
          display: "flex",
          color: C.fgSubtle,
          fontFamily: "JetBrains Mono",
          fontSize: 14,
          letterSpacing: 1.8,
          textTransform: "uppercase",
        }}
      >
        {p.tag}
      </div>

      {/* Copy column. */}
      <div
        style={{
          position: "absolute",
          top: PAD_Y,
          bottom: PAD_Y,
          ...(rtl ? { right: PAD_X } : { left: PAD_X }),
          width: COPY_W,
          display: "flex",
          flexDirection: "column",
          alignItems: align,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {img(svgDataUri(markSvg({ size: 36, background: "none", scale: 0.78 })), 36, 36)}
          <div
            style={{
              display: "flex",
              fontFamily: "Instrument Sans",
              fontWeight: 600,
              fontSize: 30,
              letterSpacing: -0.9,
            }}
          >
            {p.brand}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: align, justifyContent: "center", flexGrow: 1 }}>
          <div style={{ display: "flex", flexDirection: row, alignItems: "center", gap: 14, color: C.fgMuted, ...mono }}>
            {p.eyebrow.index ? (
              <div style={{ display: "flex", color: C.glow, fontFamily: "JetBrains Mono", fontSize: 15, letterSpacing: 1.6 }}>
                {p.eyebrow.index}
              </div>
            ) : null}
            <div style={{ width: 28, height: 1, backgroundColor: p.eyebrow.index ? C.lineStrong : C.glow }} />
            <OgText text={p.eyebrow.text} rtl={rtl} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: align, marginTop: rtl ? 22 : 28 }}>
            {p.titleLines.map((line, i) => (
              <OgText
                key={i}
                text={line}
                rtl={rtl}
                wordGap={0.25}
                style={{
                  maxWidth: COPY_W,
                  fontSize: titleSize,
                  fontWeight: rtl ? 700 : 600,
                  lineHeight: rtl ? 1.28 : 1.02,
                  letterSpacing: rtl ? 0 : -titleSize * 0.035,
                }}
              />
            ))}
          </div>

          {p.body ? (
            <OgText
              text={p.body}
              rtl={rtl}
              style={{
                marginTop: 26,
                maxWidth: 540,
                fontSize: rtl ? 25 : 24,
                fontWeight: rtl ? 500 : 400,
                lineHeight: rtl ? 1.62 : 1.42,
                color: C.fgMuted,
              }}
            />
          ) : null}
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: row,
            alignItems: "center",
            alignSelf: "stretch",
            gap: 22,
            paddingTop: 22,
            borderTop: `1px solid ${C.line}`,
            color: C.fgMuted,
            ...mono,
          }}
        >
          {p.details.map((d, i) => (
            <div key={i} style={{ display: "flex", flexDirection: row, alignItems: "center", gap: 22 }}>
              {i > 0 ? <div style={{ width: 1, height: 14, backgroundColor: C.lineStrong }} /> : null}
              <OgText text={d} rtl={rtl} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
