"use client"

import * as React from "react"

import { useTheme } from "@/components/theme-provider"

interface Star {
  x: number
  y: number
  r: number
  baseAlpha: number
  twinkleSpeed: number
  twinklePhase: number
  drift: number
  hue: "warm" | "cool" | "neutral"
}

const STAR_COUNT_PER_MEGAPIXEL = 140

function makeStars(width: number, height: number, seedOffset: number): Star[] {
  const area = (width * height) / 1_000_000
  const count = Math.max(60, Math.min(320, Math.round(area * STAR_COUNT_PER_MEGAPIXEL)))
  const stars: Star[] = []
  // mulberry32 — deterministic so server/client agree on the first paint.
  let seed = 1337 + seedOffset
  const rand = () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  for (let i = 0; i < count; i++) {
    const hueRoll = rand()
    stars.push({
      x: rand() * width,
      y: rand() * height,
      r: 0.4 + rand() * 1.3,
      baseAlpha: 0.25 + rand() * 0.55,
      twinkleSpeed: 0.4 + rand() * 1.1,
      twinklePhase: rand() * Math.PI * 2,
      drift: 0.4 + rand() * 1.2,
      hue: hueRoll < 0.12 ? "warm" : hueRoll < 0.22 ? "cool" : "neutral",
    })
  }
  return stars
}

// Dark mode: bright specks on near-black. Light mode: soft ink-violet dots
// on off-white — same hue split, tuned so both read as "stars", not noise.
const STAR_COLOR = {
  dark: { warm: "201,169,97", cool: "138,163,255", neutral: "237,232,223" },
  light: { warm: "180,140,60", cool: "90,110,200", neutral: "70,65,90" },
} as const

const ALPHA_SCALE = { dark: 1, light: 0.55 } as const

/**
 * Fixed full-viewport canvas starfield. Sits behind every page via the root
 * layout. Deterministic star layout avoids a hydration mismatch; the canvas
 * itself only ever renders client-side (no SSR paint to match).
 */
export function Starfield() {
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const { theme } = useTheme()

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const colors = STAR_COLOR[theme]
    const alphaScale = ALPHA_SCALE[theme]

    let stars: Star[] = []
    let dpr = Math.min(window.devicePixelRatio || 1, 2)
    let width = 0
    let height = 0

    const resize = () => {
      width = window.innerWidth
      height = window.innerHeight
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      stars = makeStars(width, height, 0)
    }

    resize()
    window.addEventListener("resize", resize)

    let raf = 0
    let last = performance.now()

    const draw = (t: number) => {
      const dt = Math.min((t - last) / 1000, 0.05)
      last = t

      ctx.clearRect(0, 0, width, height)
      for (const s of stars) {
        if (!reduceMotion) {
          s.twinklePhase += dt * s.twinkleSpeed
          s.y += dt * s.drift * 1.5
          if (s.y > height + 2) s.y = -2
        }
        const twinkle = reduceMotion ? 1 : 0.55 + 0.45 * Math.sin(s.twinklePhase)
        ctx.beginPath()
        ctx.fillStyle = `rgba(${colors[s.hue]},${s.baseAlpha * twinkle * alphaScale})`
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
        ctx.fill()
      }

      raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", resize)
    }
  }, [theme])

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-background transition-colors duration-300"
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            theme === "dark"
              ? "radial-gradient(120% 60% at 15% -10%, rgba(138,163,255,0.10) 0%, transparent 55%), radial-gradient(100% 55% at 85% 110%, rgba(201,169,97,0.09) 0%, transparent 55%)"
              : "radial-gradient(120% 60% at 15% -10%, rgba(138,109,255,0.10) 0%, transparent 55%), radial-gradient(100% 55% at 85% 110%, rgba(201,169,97,0.10) 0%, transparent 55%)",
        }}
      />
      <canvas ref={canvasRef} className="absolute inset-0" />
    </div>
  )
}
