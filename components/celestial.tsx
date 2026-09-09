"use client"

import * as React from "react"

import { useTheme } from "@/components/theme-provider"

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

  return (
    <div className="pointer-events-none relative mx-auto" style={{ width: size, height: size }}>
      <div ref={wrapRef} className="absolute inset-0">
        {/* Ambient halo — the light actually cast into the room */}
        <div
          aria-hidden
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-opacity duration-700 ease-out"
          style={{
            width: size * 4.2,
            height: size * 4.2,
            opacity: isDark ? 0 : 1,
            background:
              "radial-gradient(circle, rgba(255,214,140,0.5) 0%, rgba(255,180,90,0.22) 26%, rgba(255,160,70,0.08) 48%, transparent 70%)",
          }}
        />
        <div
          aria-hidden
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-opacity duration-700 ease-out"
          style={{
            width: size * 4.2,
            height: size * 4.2,
            opacity: isDark ? 1 : 0,
            background:
              "radial-gradient(circle, rgba(200,210,235,0.28) 0%, rgba(160,175,210,0.14) 26%, rgba(130,150,195,0.06) 48%, transparent 70%)",
          }}
        />

        {/* Sun */}
        <div
          aria-hidden
          className="absolute inset-0 rounded-full transition-all duration-700 ease-out"
          style={{
            opacity: isDark ? 0 : 1,
            transform: isDark ? "scale(0.7) rotate(60deg)" : "scale(1) rotate(0deg)",
            background:
              "radial-gradient(circle at 34% 30%, #fff8e4 0%, #ffe19c 16%, #ffc466 34%, #f2a13a 58%, #d9852a 78%, #b8681e 100%)",
            boxShadow:
              "0 0 40px 10px rgba(255,190,90,0.55), 0 0 90px 30px rgba(255,160,60,0.3), inset -14px -10px 30px rgba(160,80,10,0.35)",
          }}
        />

        {/* Moon */}
        <div
          aria-hidden
          className="absolute inset-0 rounded-full transition-all duration-700 ease-out"
          style={{
            opacity: isDark ? 1 : 0,
            transform: isDark ? "scale(1) rotate(0deg)" : "scale(0.7) rotate(-60deg)",
            background: [
              "radial-gradient(circle at 62% 68%, rgba(0,0,0,0.3) 0%, transparent 11%)",
              "radial-gradient(circle at 27% 58%, rgba(0,0,0,0.24) 0%, transparent 8%)",
              "radial-gradient(circle at 72% 32%, rgba(0,0,0,0.2) 0%, transparent 7%)",
              "radial-gradient(circle at 46% 78%, rgba(0,0,0,0.22) 0%, transparent 9%)",
              "radial-gradient(circle at 40% 22%, rgba(0,0,0,0.16) 0%, transparent 6%)",
              "radial-gradient(circle at 32% 30%, #f2efe8 0%, #dcd7cb 20%, #b9b4a7 44%, #8d897e 68%, #646056 88%, #4c493f 100%)",
            ].join(","),
            boxShadow:
              "inset -30px -18px 50px rgba(0,0,0,0.55), 0 0 30px 8px rgba(190,200,225,0.35), 0 0 70px 24px rgba(140,155,195,0.18)",
          }}
        />
      </div>
    </div>
  )
}
