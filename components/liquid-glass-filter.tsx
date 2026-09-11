/** Shared SVG displacement filter that LiquidButton references via
 * `backdrop-filter: url(#nosignal-liquid-glass)`. Mounted once, globally,
 * in the root layout — an actual per-element <filter> def isn't needed. */
export function LiquidGlassFilter() {
  return (
    <svg aria-hidden className="pointer-events-none absolute h-0 w-0 overflow-hidden">
      <filter id="nosignal-liquid-glass" colorInterpolationFilters="sRGB">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.008 0.012"
          numOctaves="1"
          seed="7"
          result="noise"
        />
        <feGaussianBlur in="noise" stdDeviation="2" result="blurred" />
        <feDisplacementMap
          in="SourceGraphic"
          in2="blurred"
          scale="18"
          xChannelSelector="R"
          yChannelSelector="G"
        />
      </filter>
    </svg>
  )
}
