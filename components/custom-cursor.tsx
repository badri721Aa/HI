"use client"

import * as React from "react"

/**
 * Fine-pointer only: touch devices have no cursor to replace, and
 * `(pointer: fine)` keeps this off trackpads-as-touch and stylus setups
 * where a custom cursor would just be visual noise.
 */
function useFinePointer() {
  const [fine, setFine] = React.useState(false)
  React.useEffect(() => {
    const mq = window.matchMedia("(pointer: fine) and (hover: hover)")
    const apply = () => setFine(mq.matches)
    apply()
    mq.addEventListener("change", apply)
    return () => mq.removeEventListener("change", apply)
  }, [])
  return fine
}

const INTERACTIVE_SELECTOR = "a, button, [role='button'], input, textarea, select"

export function CustomCursor() {
  const fine = useFinePointer()
  const dotRef = React.useRef<HTMLDivElement>(null)
  const ringRef = React.useRef<HTMLDivElement>(null)
  const glowRef = React.useRef<HTMLDivElement>(null)
  const [hovering, setHovering] = React.useState(false)
  const [pressed, setPressed] = React.useState(false)
  const [visible, setVisible] = React.useState(false)

  React.useEffect(() => {
    if (!fine) return

    document.documentElement.classList.add("custom-cursor-active")

    // Dot snaps to the pointer immediately; the ring and glow ease toward
    // it at different rates, which is what reads as "cursor with weight"
    // instead of a second pointer.
    const dot = { x: 0, y: 0 }
    const ring = { x: 0, y: 0 }
    let raf = 0

    const onMove = (e: PointerEvent) => {
      dot.x = e.clientX
      dot.y = e.clientY
      setVisible(true)
      const target = e.target as Element | null
      setHovering(!!target?.closest(INTERACTIVE_SELECTOR))
    }

    const onLeave = () => setVisible(false)
    const onDown = () => setPressed(true)
    const onUp = () => setPressed(false)

    const tick = () => {
      ring.x += (dot.x - ring.x) * 0.22
      ring.y += (dot.y - ring.y) * 0.22
      if (dotRef.current) {
        dotRef.current.style.transform = `translate3d(${dot.x}px, ${dot.y}px, 0) translate(-50%, -50%)`
      }
      if (ringRef.current) {
        ringRef.current.style.transform = `translate3d(${ring.x}px, ${ring.y}px, 0) translate(-50%, -50%)`
      }
      if (glowRef.current) {
        glowRef.current.style.transform = `translate3d(${ring.x}px, ${ring.y}px, 0) translate(-50%, -50%)`
      }
      raf = requestAnimationFrame(tick)
    }

    window.addEventListener("pointermove", onMove, { passive: true })
    document.addEventListener("mouseleave", onLeave)
    window.addEventListener("pointerdown", onDown)
    window.addEventListener("pointerup", onUp)
    raf = requestAnimationFrame(tick)

    return () => {
      document.documentElement.classList.remove("custom-cursor-active")
      window.removeEventListener("pointermove", onMove)
      document.removeEventListener("mouseleave", onLeave)
      window.removeEventListener("pointerdown", onDown)
      window.removeEventListener("pointerup", onUp)
      cancelAnimationFrame(raf)
    }
  }, [fine])

  if (!fine) return null

  const ringSize = hovering ? 52 : pressed ? 22 : 28

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[100]"
      style={{ opacity: visible ? 1 : 0, transition: "opacity 200ms ease" }}
    >
      {/* Soft accent glow, only on hover — gives interactive elements a
          "charged" feel without adding noise everywhere else. */}
      <div
        ref={glowRef}
        className="fixed left-0 top-0 rounded-full blur-xl transition-[width,height,opacity] duration-300 ease-out"
        style={{
          width: hovering ? 96 : 0,
          height: hovering ? 96 : 0,
          opacity: hovering ? 0.35 : 0,
          background:
            "radial-gradient(circle, var(--cosmic-violet) 0%, var(--cosmic-gold) 60%, transparent 75%)",
        }}
      />
      <div
        ref={dotRef}
        className="fixed left-0 top-0 size-1.5 rounded-full bg-[#EDE8DF] mix-blend-difference"
      />
      <div
        ref={ringRef}
        className="fixed left-0 top-0 rounded-full border border-[#EDE8DF] mix-blend-difference transition-[width,height] duration-200 ease-out"
        style={{ width: ringSize, height: ringSize }}
      />
    </div>
  )
}
