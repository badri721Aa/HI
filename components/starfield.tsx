"use client"

import * as React from "react"

import { useTheme } from "@/components/theme-provider"

interface ShootingStar {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
}

interface Star {
  x: number
  y: number
  r: number
  baseAlpha: number
  twinkleSpeed: number
  twinklePhase: number
  drift: number
  hue: "warm" | "cool" | "neutral"
  bright: boolean
}

const STAR_COUNT_PER_MEGAPIXEL = 260

function makeStars(width: number, height: number, seedOffset: number): Star[] {
  const area = (width * height) / 1_000_000
  const count = Math.max(90, Math.min(560, Math.round(area * STAR_COUNT_PER_MEGAPIXEL)))
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
    const bright = rand() < 0.06
    stars.push({
      x: rand() * width,
      y: rand() * height,
      r: bright ? 1.6 + rand() * 1.4 : 0.5 + rand() * 1.3,
      baseAlpha: bright ? 0.75 + rand() * 0.25 : 0.35 + rand() * 0.5,
      twinkleSpeed: 0.4 + rand() * 1.1,
      twinklePhase: rand() * Math.PI * 2,
      drift: 0.4 + rand() * 1.2,
      hue: hueRoll < 0.14 ? "warm" : hueRoll < 0.26 ? "cool" : "neutral",
      bright,
    })
  }
  return stars
}

// Dark mode: bright specks on near-black. Light mode: soft ink-violet dots
// on off-white — same hue split, tuned so both read as "stars", not noise.
const STAR_COLOR = {
  dark: { warm: "201,169,97", cool: "150,175,255", neutral: "240,236,230" },
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

    // Rare shooting star — dark mode only, and never when motion is reduced.
    let shootingStar: ShootingStar | null = null
    let nextShootingStarAt = last + 3000 + Math.random() * 6000

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
        const alpha = s.baseAlpha * twinkle * alphaScale

        if (s.bright) {
          // Soft halo behind the brighter stars so they read as actual
          // light sources instead of just bigger dots.
          const halo = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 5)
          halo.addColorStop(0, `rgba(${colors[s.hue]},${alpha * 0.35})`)
          halo.addColorStop(1, `rgba(${colors[s.hue]},0)`)
          ctx.beginPath()
          ctx.fillStyle = halo
          ctx.arc(s.x, s.y, s.r * 5, 0, Math.PI * 2)
          ctx.fill()
        }

        ctx.beginPath()
        ctx.fillStyle = `rgba(${colors[s.hue]},${alpha})`
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
        ctx.fill()
      }

      if (theme === "dark" && !reduceMotion) {
        if (!shootingStar && t > nextShootingStarAt) {
          shootingStar = {
            x: width * 0.2 + Math.random() * width * 0.6,
            y: -20,
            vx: -220 - Math.random() * 120,
            vy: 260 + Math.random() * 140,
            life: 0,
            maxLife: 0.9 + Math.random() * 0.4,
          }
        }
        if (shootingStar) {
          shootingStar.life += dt
          shootingStar.x += shootingStar.vx * dt
          shootingStar.y += shootingStar.vy * dt
          const p = shootingStar.life / shootingStar.maxLife
          if (p >= 1 || shootingStar.y > height + 50 || shootingStar.x < -50) {
            shootingStar = null
            nextShootingStarAt = t + 7000 + Math.random() * 11000
          } else {
            const fade = Math.sin(p * Math.PI)
            const tailX = shootingStar.x - shootingStar.vx * 0.12
            const tailY = shootingStar.y - shootingStar.vy * 0.12
            const trail = ctx.createLinearGradient(tailX, tailY, shootingStar.x, shootingStar.y)
            trail.addColorStop(0, "rgba(255,255,255,0)")
            trail.addColorStop(1, `rgba(255,255,255,${fade})`)
            ctx.strokeStyle = trail
            ctx.lineWidth = 1.6
            ctx.lineCap = "round"
            ctx.beginPath()
            ctx.moveTo(tailX, tailY)
            ctx.lineTo(shootingStar.x, shootingStar.y)
            ctx.stroke()
          }
        }
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
              ? "radial-gradient(90% 50% at 78% 12%, rgba(0,229,160,0.05) 0%, transparent 55%), radial-gradient(85% 65% at 8% 65%, rgba(120,60,200,0.09) 0%, transparent 60%), radial-gradient(130% 70% at 20% -10%, rgba(140,165,255,0.16) 0%, transparent 58%), radial-gradient(110% 60% at 85% 105%, rgba(201,169,97,0.13) 0%, transparent 58%), radial-gradient(160% 90% at 50% 50%, rgba(30,25,50,0.4) 0%, transparent 75%)"
              : "radial-gradient(120% 60% at 15% -10%, rgba(138,109,255,0.10) 0%, transparent 55%), radial-gradient(100% 55% at 85% 110%, rgba(201,169,97,0.10) 0%, transparent 55%)",
        }}
      />
      <canvas ref={canvasRef} className="absolute inset-0" />
    </div>
  )
}
