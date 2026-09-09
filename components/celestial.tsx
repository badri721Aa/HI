"use client"

import * as React from "react"

import { useTheme } from "@/components/theme-provider"

/** Crater positions as % of the disc, hand-placed so they read as a real
 * surface instead of a random scatter — denser toward the terminator
 * where raking light would actually reveal relief. */
const CRATERS = [
  { x: 60, y: 66, r: 10 },
  { x: 26, y: 56, r: 7 },
  { x: 72, y: 32, r: 6 },
  { x: 46, y: 79, r: 7.5 },
  { x: 40, y: 20, r: 4.5 },
  { x: 79, y: 57, r: 4 },
  { x: 18, y: 34, r: 3.5 },
  { x: 56, y: 46, r: 3 },
  { x: 33, y: 71, r: 5.5 },
  { x: 65, y: 16, r: 3.5 },
  { x: 15, y: 62, r: 3 },
  { x: 50, y: 58, r: 2.5 },
]

function craterLayers() {
  return CRATERS.flatMap(({ x, y, r }) => [
    `radial-gradient(circle at ${(x - r * 0.16).toFixed(1)}% ${(y - r * 0.16).toFixed(1)}%, rgba(255,255,255,0.22) 0%, transparent ${(r * 0.32).toFixed(1)}%)`,
    `radial-gradient(circle at ${x}% ${y}%, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.16) ${(r * 0.55).toFixed(1)}%, transparent ${r}%)`,
  ])
}

/** Broad dark "seas" (maria) — the big soft patches that make the moon
 * recognizable at a glance, not just a grey ball. */
const MARIA = [
  "radial-gradient(ellipse 30% 22% at 42% 42%, rgba(20,18,14,0.28) 0%, transparent 70%)",
  "radial-gradient(ellipse 22% 26% at 62% 60%, rgba(20,18,14,0.22) 0%, transparent 70%)",
  "radial-gradient(ellipse 18% 14% at 28% 26%, rgba(20,18,14,0.16) 0%, transparent 70%)",
]

const NOISE_URL =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)'/%3E%3C/svg%3E\")"

/**
 * An actual Sun (light mode) and Moon (dark mode) — not an abstract blur.
 * Both are always mounted and cross-fade/scale into each other on theme
 * change, and the whole thing drifts a few px toward the pointer like a
 * real light source in the room, not something painted flat on the page.
 */
export function Celestial({ size = 176 }: { size?: number }) {
  const { theme } = useTheme()
  const isDark = theme === "dark"
  const wrapRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const mq = window.matchMedia("(pointer: fine)")
    if (!mq.matches) return

    let raf = 0
    let tx = 0
    let ty = 0
    let cx = 0
    let cy = 0

    const onMove = (e: PointerEvent) => {
      tx = (e.clientX / window.innerWidth - 0.5) * 2 * 18
      ty = (e.clientY / window.innerHeight - 0.5) * 2 * 12
    }
    const tick = () => {
      cx += (tx - cx) * 0.05
      cy += (ty - cy) * 0.05
      if (wrapRef.current) {
        wrapRef.current.style.transform = `translate3d(${cx}px, ${cy}px, 0)`
      }
      raf = requestAnimationFrame(tick)
    }

    window.addEventListener("pointermove", onMove, { passive: true })
    raf = requestAnimationFrame(tick)
    return () => {
      window.removeEventListener("pointermove", onMove)
      cancelAnimationFrame(raf)
    }
  }, [])

  const moonBackground = [
    ...craterLayers(),
    ...MARIA,
    "radial-gradient(circle at 30% 26%, #ece7dc 0%, #d3cec0 16%, #b4ae9e 34%, #928c7c 54%, #6f6a5b 76%, #4c483c 100%)",
  ].join(",")

  return (
    <div className="pointer-events-none relative mx-auto" style={{ width: size, height: size }}>
      <div ref={wrapRef} className="absolute inset-0">
        {/* Ambient halo — the light actually cast into the room. Kept
            restrained so it reads as "lit" without washing out the page. */}
        <div
          aria-hidden
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-opacity duration-700 ease-out"
          style={{
            width: size * 3.4,
            height: size * 3.4,
            opacity: isDark ? 0 : 1,
            background:
              "radial-gradient(circle, rgba(255,200,120,0.26) 0%, rgba(255,175,90,0.12) 30%, rgba(255,160,70,0.04) 52%, transparent 70%)",
          }}
        />
        <div
          aria-hidden
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-opacity duration-700 ease-out"
          style={{
            width: size * 3.4,
            height: size * 3.4,
            opacity: isDark ? 1 : 0,
            background:
              "radial-gradient(circle, rgba(200,210,235,0.22) 0%, rgba(160,175,210,0.1) 30%, rgba(130,150,195,0.04) 52%, transparent 70%)",
          }}
        />

        {/* Sun */}
        <div
          aria-hidden
          className="absolute inset-0 overflow-hidden rounded-full transition-all duration-700 ease-out"
          style={{
            opacity: isDark ? 0 : 1,
            transform: isDark ? "scale(0.7) rotate(60deg)" : "scale(1) rotate(0deg)",
            background:
              "radial-gradient(circle at 36% 32%, #fff6dc 0%, #ffdd8f 14%, #ffb95c 32%, #f0973a 54%, #d67a28 74%, #a85d1c 100%)",
            boxShadow:
              "0 0 26px 6px rgba(255,180,90,0.4), 0 0 60px 20px rgba(255,150,60,0.2), inset -16px -12px 34px rgba(140,65,10,0.4)",
          }}
        >
          <div
            aria-hidden
            className="absolute inset-0 mix-blend-soft-light"
            style={{ backgroundImage: NOISE_URL, backgroundSize: "60% 60%", opacity: 0.55 }}
          />
        </div>

        {/* Moon */}
        <div
          aria-hidden
          className="absolute inset-0 overflow-hidden rounded-full transition-all duration-700 ease-out"
          style={{
            opacity: isDark ? 1 : 0,
            transform: isDark ? "scale(1) rotate(0deg)" : "scale(0.7) rotate(-60deg)",
            background: moonBackground,
            boxShadow:
              "inset -34px -20px 56px rgba(0,0,0,0.6), inset 10px 8px 20px rgba(255,255,255,0.06), 0 0 22px 5px rgba(190,200,225,0.3), 0 0 54px 18px rgba(140,155,195,0.14)",
          }}
        >
          <div
            aria-hidden
            className="absolute inset-0 mix-blend-overlay"
            style={{ backgroundImage: NOISE_URL, backgroundSize: "45% 45%", opacity: 0.3 }}
          />
        </div>
      </div>
    </div>
  )
}
