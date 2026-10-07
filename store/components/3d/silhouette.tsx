import { useId } from "react";
import type { ModelKind } from "@/types";
import { SILHOUETTES, SILHOUETTE_BOUNDS, SILHOUETTE_DETAILS, silhouetteY } from "./silhouettes";

/**
 * 2D elevation of a model, used when WebGL is unavailable: the piece in its
 * colour with a cylindrical shading wash, faint layer lines and its
 * construction lines, standing in a soft contact shadow. With `progress`
 * it is caught mid-print: the printed part solid, the rest a dashed
 * toolpath ghost, one cyan hot layer at the cut.
 *
 * Server-safe (no client hooks) and purely decorative (aria-hidden).
 */
export function ProductSilhouette({
  kind,
  color,
  className,
  progress,
  hot = true,
  plate = false,
}: {
  kind: ModelKind;
  /** Body colour (a product colour hex). Default: the silver token. */
  color?: string;
  className?: string;
  /** 0–1 fraction already printed. Omit for a finished piece. */
  progress?: number;
  /** With `progress`: the glowing hot layer at the cut. Default true; false for a stopped print. */
  hot?: boolean;
  /** Draws the build plate as a hairline that fades out to both sides. */
  plate?: boolean;
}) {
  const id = `sil${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const d = SILHOUETTES[kind];
  const detail = SILHOUETTE_DETAILS[kind];
  const b = SILHOUETTE_BOUNDS[kind];
  const printing = progress !== undefined && progress < 1;
  const cut = printing ? silhouetteY(kind, progress) : b.y0;
  const w = b.x1 - b.x0;
  const url = (name: string) => `url(#${id}-${name})`;

  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true" focusable="false" overflow="visible">
      <defs>
        {/* Turned-object shading: shadowed flanks, a soft highlight left of centre. */}
        <linearGradient id={`${id}-turn`} x1={b.x0} x2={b.x1} y1="0" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="black" stopOpacity="0.55" />
          <stop offset="0.3" stopColor="white" stopOpacity="0.14" />
          <stop offset="0.46" stopColor="white" stopOpacity="0" />
          <stop offset="0.78" stopColor="black" stopOpacity="0.36" />
          <stop offset="1" stopColor="black" stopOpacity="0.66" />
        </linearGradient>
        {/* Ambient occlusion towards the plate. */}
        <linearGradient id={`${id}-ao`} x1="0" x2="0" y1={b.y0} y2={b.y1} gradientUnits="userSpaceOnUse">
          <stop offset="0.7" stopColor="black" stopOpacity="0" />
          <stop offset="1" stopColor="black" stopOpacity="0.35" />
        </linearGradient>
        <linearGradient id={`${id}-plate`} x1="0" x2="100" y1="0" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="white" stopOpacity="0" />
          <stop offset="0.5" stopColor="white" stopOpacity="0.22" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`${id}-shadow`}>
          <stop offset="0" stopColor="black" stopOpacity="0.7" />
          <stop offset="1" stopColor="black" stopOpacity="0" />
        </radialGradient>
        {/* Layer lines, exaggerated so they read at this size. */}
        <pattern id={`${id}-layers`} width="4" height="0.9" patternUnits="userSpaceOnUse">
          <rect width="4" height="0.22" fill="black" fillOpacity="0.09" />
        </pattern>
        <clipPath id={`${id}-shape`}>
          <path d={d} />
        </clipPath>
        <clipPath id={`${id}-printed`}>
          <rect x="0" y={cut} width="100" height={100 - cut} />
        </clipPath>
        <clipPath id={`${id}-ghost`}>
          <rect x="0" y="0" width="100" height={cut} />
        </clipPath>
      </defs>

      {plate ? <rect x="0" y={b.y1} width="100" height="0.3" fill={url("plate")} /> : null}
      <ellipse cx={(b.x0 + b.x1) / 2} cy={b.y1} rx={w * 0.66} ry={2.4} fill={url("shadow")} />

      <g clipPath={printing ? url("printed") : undefined}>
        <path d={d} fill={color ?? "var(--color-silver)"} />
        <g clipPath={url("shape")}>
          <rect x={b.x0} y={b.y0} width={w} height={b.y1 - b.y0} fill={url("layers")} />
          <rect x={b.x0} y={b.y0} width={w} height={b.y1 - b.y0} fill={url("turn")} />
          <rect x={b.x0} y={b.y0} width={w} height={b.y1 - b.y0} fill={url("ao")} />
        </g>
        {detail ? (
          <path d={detail} fill="none" stroke="black" strokeOpacity="0.16" strokeWidth="0.3" strokeLinecap="round" />
        ) : null}
      </g>

      {printing ? (
        <>
          <path
            d={d}
            clipPath={url("ghost")}
            fill="none"
            stroke="var(--color-line-strong)"
            strokeWidth="1"
            strokeDasharray="3 4"
            vectorEffect="non-scaling-stroke"
          />
          {hot ? (
            <g clipPath={url("shape")}>
              <rect x={b.x0} y={cut - 0.45} width={w} height="0.9" fill="var(--color-glow)" />
            </g>
          ) : null}
        </>
      ) : null}
    </svg>
  );
}
