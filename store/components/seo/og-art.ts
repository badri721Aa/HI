/**
 * Pure SVG builders shared by the generated images (Open Graph cards and app
 * icons). Everything here returns plain strings so it works inside
 * ImageResponse (Satori + resvg) without a DOM, and never imports three.
 *
 * Colours mirror the tokens in app/globals.css. Generated images can't read
 * CSS variables, so they are repeated here once.
 */
import { MARK_BOX, MARK_RADIUS, MARK_STACK, MARK_TOP, type MarkBar } from "@/components/ui/logo-geometry";


export const OG_COLORS = {
  ink950: "#020203",
  ink900: "#09090C",
  ink800: "#121218",
  fg: "#EDEDF0",
  fgMuted: "#A1A1AC",
  fgSubtle: "#7A7A86",
  silver: "#C8CCD2",
  platinum: "#8F939C",
  glow: "#7DE3EE",
  line: "rgba(255,255,255,0.08)",
  lineStrong: "rgba(255,255,255,0.16)",
} as const;

export function svgDataUri(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

const r = (n: number) => Math.round(n * 100) / 100;

/* -------------------------------------------------------------------------- */
/* Path bounds                                                                */
/* -------------------------------------------------------------------------- */

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const PARAMS: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

/**
 * Approximate bounding box of SVG path data: every end point and control
 * point counts, which is exact for polylines and slightly generous for
 * curves. Handles absolute and relative commands.
 */
export function pathBounds(d: string): Bounds {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? [];
  const b: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const add = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    b.minX = Math.min(b.minX, x);
    b.maxX = Math.max(b.maxX, x);
    b.minY = Math.min(b.minY, y);
    b.maxY = Math.max(b.maxY, y);
  };

  let i = 0;
  let cmd = "";
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;

  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
    const upper = cmd.toUpperCase();
    const count = PARAMS[upper];
    if (count === undefined) break;
    if (upper === "Z") {
      cx = sx;
      cy = sy;
      continue;
    }
    const args = tokens.slice(i, i + count).map(Number);
    if (args.length < count || args.some((n) => Number.isNaN(n))) break;
    i += count;
    const rel = cmd !== upper;
    const ox = rel ? cx : 0;
    const oy = rel ? cy : 0;

    switch (upper) {
      case "H":
        cx = args[0] + ox;
        break;
      case "V":
        cy = args[0] + oy;
        break;
      case "A":
        cx = args[5] + ox;
        cy = args[6] + oy;
        // Arcs can bulge past their end points; include the radii as a margin.
        add(cx - args[0], cy - args[1]);
        add(cx + args[0], cy + args[1]);
        break;
      default:
        for (let k = 0; k < count - 2; k += 2) add(args[k] + ox, args[k + 1] + oy);
        cx = args[count - 2] + ox;
        cy = args[count - 1] + oy;
    }
    add(cx, cy);
    if (upper === "M") {
      sx = cx;
      sy = cy;
      // Extra pairs after M are implicit line-tos.
      cmd = rel ? "l" : "L";
    }
  }

  if (!Number.isFinite(b.minX)) return { minX: 0, minY: 0, maxX: 100, maxY: 100 };
  return b;
}

/* -------------------------------------------------------------------------- */
/* Print art: a silhouette caught mid-print                                   */
/* -------------------------------------------------------------------------- */

export interface PrintArtOptions {
  /** Silhouette path in a 0 0 100 100 box (components/3d/silhouettes.ts). */
  path: string;
  /** Size of the art panel in px. */
  width: number;
  height: number;
  /** Fraction of the object's height already printed (0–1). */
  progress: number;
  /** Largest size the object may take in the panel, in px. */
  maxObjectWidth: number;
  maxObjectHeight: number;
  /** Where the object's base sits, in px from the top of the panel. */
  baseY: number;
  /** Horizontal centre of the object, in px from the left of the panel. */
  centerX: number;
}

export interface PrintArt {
  svg: string;
  /** Object box in panel px, for placing labels around it. */
  box: { left: number; right: number; top: number; bottom: number };
  /** y of the hot layer in panel px. */
  hotY: number;
}

/**
 * Side elevation of a part on the build plate: the printed lower part in
 * brushed silver with visible layer lines, the unprinted top as a dashed
 * toolpath ghost, and one glowing cyan "hot" layer between them.
 */
export function printArtSvg(o: PrintArtOptions): PrintArt {
  const { minX, minY, maxX, maxY } = pathBounds(o.path);
  const bw = Math.max(maxX - minX, 1);
  const bh = Math.max(maxY - minY, 1);
  const s = Math.min(o.maxObjectWidth / bw, o.maxObjectHeight / bh);
  const tx = o.centerX - ((minX + maxX) / 2) * s;
  const ty = o.baseY - maxY * s;

  const left = minX * s + tx;
  const right = maxX * s + tx;
  const top = minY * s + ty;
  const bottom = maxY * s + ty;
  const objH = bottom - top;
  const hotY = bottom - objH * Math.min(Math.max(o.progress, 0.05), 0.98);

  const W = o.width;
  const H = o.height;
  const C = OG_COLORS;
  const transform = `matrix(${r(s)} 0 0 ${r(s)} ${r(tx)} ${r(ty)})`;

  // Layer lines every 4px across the printed part.
  const layers: string[] = [];
  for (let y = bottom - 2; y > hotY + 3; y -= 4) {
    layers.push(`<rect x="${r(left - 2)}" y="${r(y)}" width="${r(right - left + 4)}" height="1.1" />`);
  }

  // Build-plate ruler under the part.
  const ticks: string[] = [];
  const plateY = r(bottom + 0.5);
  for (let x = 0, n = 0; x <= W; x += 12, n++) {
    const long = n % 5 === 0;
    ticks.push(`<line x1="${x}" y1="${plateY}" x2="${x}" y2="${r(bottom + (long ? 12 : 6))}" />`);
  }

  // Height callout on the left of the part.
  const dimX = r(left - 34);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
  <clipPath id="sil"><path d="${o.path}" transform="${transform}"/></clipPath>
  <clipPath id="printed"><rect x="0" y="${r(hotY)}" width="${W}" height="${r(H - hotY)}"/></clipPath>
  <clipPath id="ghost"><rect x="0" y="0" width="${W}" height="${r(hotY)}"/></clipPath>
  <linearGradient id="metal" x1="0" y1="${r(top)}" x2="0" y2="${r(bottom)}" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#EEF0F3"/>
    <stop offset="0.45" stop-color="${C.silver}"/>
    <stop offset="1" stop-color="#5E626B"/>
  </linearGradient>
  <linearGradient id="turn" x1="${r(left)}" y1="0" x2="${r(right)}" y2="0" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#000" stop-opacity="0.55"/>
    <stop offset="0.3" stop-color="#fff" stop-opacity="0.16"/>
    <stop offset="0.48" stop-color="#fff" stop-opacity="0"/>
    <stop offset="0.82" stop-color="#000" stop-opacity="0.32"/>
    <stop offset="1" stop-color="#000" stop-opacity="0.6"/>
  </linearGradient>
  <radialGradient id="pool" cx="${r((left + right) / 2)}" cy="${plateY}" r="${r(Math.max(right - left, 120))}" gradientUnits="userSpaceOnUse" gradientTransform="translate(0 ${plateY}) scale(1 0.18) translate(0 ${-plateY})">
    <stop offset="0" stop-color="#fff" stop-opacity="0.09"/>
    <stop offset="1" stop-color="#fff" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="plate" x1="0" y1="0" x2="${W}" y2="0" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#fff" stop-opacity="0"/>
    <stop offset="0.25" stop-color="#fff" stop-opacity="0.2"/>
    <stop offset="0.75" stop-color="#fff" stop-opacity="0.2"/>
    <stop offset="1" stop-color="#fff" stop-opacity="0"/>
  </linearGradient>
  <filter id="bloom" x="-20%" y="-400%" width="140%" height="900%"><feGaussianBlur stdDeviation="5"/></filter>
</defs>
<rect x="0" y="${plateY}" width="${W}" height="${r(H - plateY)}" fill="url(#pool)"/>
<g stroke="url(#plate)" stroke-width="1">${ticks.join("")}</g>
<rect x="0" y="${plateY}" width="${W}" height="1" fill="url(#plate)"/>
<g clip-path="url(#printed)">
  <g clip-path="url(#sil)">
    <rect x="${r(left - 2)}" y="${r(top - 2)}" width="${r(right - left + 4)}" height="${r(objH + 4)}" fill="url(#metal)"/>
    <rect x="${r(left - 2)}" y="${r(top - 2)}" width="${r(right - left + 4)}" height="${r(objH + 4)}" fill="url(#turn)"/>
    <g fill="${C.ink950}" fill-opacity="0.34">${layers.join("")}</g>
  </g>
</g>
<g clip-path="url(#ghost)">
  <path d="${o.path}" transform="${transform}" fill="${C.silver}" fill-opacity="0.035" stroke="${C.silver}" stroke-opacity="0.42" stroke-width="${r(1.2 / s)}" stroke-dasharray="${r(3 / s)} ${r(4.5 / s)}" stroke-linejoin="round"/>
</g>
<rect x="0" y="${r(hotY - 0.5)}" width="${r(right + 14)}" height="1" fill="${C.glow}" fill-opacity="0.22"/>
<g clip-path="url(#sil)">
  <rect x="${r(left - 4)}" y="${r(hotY - 5)}" width="${r(right - left + 8)}" height="10" fill="${C.glow}" fill-opacity="0.7" filter="url(#bloom)"/>
  <rect x="${r(left - 4)}" y="${r(hotY - 1.4)}" width="${r(right - left + 8)}" height="2.8" fill="#C9F6FB"/>
</g>
<g stroke="#fff" stroke-opacity="0.24" stroke-width="1">
  <line x1="${dimX}" y1="${r(top)}" x2="${dimX}" y2="${r(bottom)}"/>
  <line x1="${r(dimX - 5)}" y1="${r(top)}" x2="${r(dimX + 5)}" y2="${r(top)}"/>
  <line x1="${r(dimX - 5)}" y1="${r(bottom)}" x2="${r(dimX + 5)}" y2="${r(bottom)}"/>
</g>
</svg>`;

  return { svg, box: { left, right, top, bottom }, hotY };
}

/** Faint build-plate grid that fades out from a focal point. */
export function gridSvg(o: { width: number; height: number; step: number; focusX: number; focusY: number; radius: number }): string {
  const lines: string[] = [];
  for (let x = o.step; x < o.width; x += o.step) lines.push(`<rect x="${x}" y="0" width="1" height="${o.height}"/>`);
  for (let y = o.step; y < o.height; y += o.step) lines.push(`<rect x="0" y="${y}" width="${o.width}" height="1"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${o.width}" height="${o.height}" viewBox="0 0 ${o.width} ${o.height}">
<defs>
  <radialGradient id="fade" cx="${o.focusX}" cy="${o.focusY}" r="${o.radius}" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#fff" stop-opacity="1"/>
    <stop offset="0.55" stop-color="#fff" stop-opacity="0.45"/>
    <stop offset="1" stop-color="#fff" stop-opacity="0"/>
  </radialGradient>
  <mask id="m"><rect width="${o.width}" height="${o.height}" fill="url(#fade)"/></mask>
</defs>
<g mask="url(#m)" fill="#fff" fill-opacity="0.055">${lines.join("")}</g>
</svg>`;
}

/* -------------------------------------------------------------------------- */
/* Logo mark                                                                  */
/* -------------------------------------------------------------------------- */

export interface MarkOptions {
  /** Canvas size in px (square). */
  size: number;
  /**
   * rounded: dark rounded square with a hairline edge (favicons, "any" icons).
   * full: full-bleed dark square (apple-touch and maskable icons; the OS masks it).
   * none: transparent, mark only (inline use on dark backgrounds).
   */
  background: "rounded" | "full" | "none";
  /** Side of the mark's square as a fraction of the canvas. */
  scale: number;
  /** Outline weight relative to the 24px original; large icons read better a little lighter. */
  weight?: number;
}

/**
 * The Layer Up mark (components/ui/logo-geometry.ts): three stacked layers and
 * a fourth arriving in the accent colour. `scale` is the side of the mark's
 * 24-unit box as a fraction of the canvas.
 */
export function markSvg({ size: S, background, scale, weight = 1 }: MarkOptions): string {
  const C = OG_COLORS;
  const m = S * scale;
  const u = m / MARK_BOX;
  const x0 = (S - m) / 2;
  // Heavier icons read better with slightly thinner bars.
  const shrink = (1 - weight) * 0.6;
  const bar = (b: MarkBar, fill: string, opacity = 1) =>
    `<rect x="${r(x0 + b.x * u)}" y="${r(x0 + (b.y + shrink / 2) * u)}" width="${r(b.w * u)}" height="${r((b.h - shrink) * u)}" rx="${r(MARK_RADIUS * u)}" fill="${fill}" fill-opacity="${opacity}"/>`;

  const bg =
    background === "rounded"
      ? `<rect width="${S}" height="${S}" rx="${r(S * 0.225)}" fill="${C.ink950}"/>
<rect x="0.5" y="0.5" width="${S - 1}" height="${S - 1}" rx="${r(S * 0.225 - 0.5)}" fill="none" stroke="#fff" stroke-opacity="0.1"/>`
      : background === "full"
        ? `<rect width="${S}" height="${S}" fill="${C.ink950}"/>`
        : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
${bg}
${MARK_STACK.map((b, i) => bar(b, C.fg, 0.62 + i * 0.19)).join("\n")}
${bar(MARK_TOP, C.glow)}
</svg>`;
}
