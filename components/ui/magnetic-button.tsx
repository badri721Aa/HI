'use client'

import * as React from 'react'
import { useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface MagneticButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** How strongly the button pulls toward the cursor (0.1 subtle → 0.5 strong). Default 0.25 */
  strength?: number
  /** Radius in px where the pull starts. Default 80 */
  radius?: number
  asChild?: boolean
}

/**
 * A button that subtly translates toward the cursor when the pointer enters
 * its magnetic radius. Uses hardware-accelerated transform, no layout thrash.
 * Respects prefers-reduced-motion (falls back to a static button).
 */
export const MagneticButton = React.forwardRef<HTMLButtonElement, MagneticButtonProps>(
  function MagneticButton({ children, className, strength = 0.25, radius = 80, ...props }, ref) {
    const localRef = React.useRef<HTMLButtonElement | null>(null)
    const reduce = useReducedMotion()

    React.useImperativeHandle(ref, () => localRef.current!, [])

    React.useEffect(() => {
      const el = localRef.current
      if (!el || reduce) return

      let raf = 0
      const handle = (e: PointerEvent) => {
        cancelAnimationFrame(raf)
        raf = requestAnimationFrame(() => {
          const r = el.getBoundingClientRect()
          const cx = r.left + r.width / 2
          const cy = r.top + r.height / 2
          const dx = e.clientX - cx
          const dy = e.clientY - cy
          const dist = Math.hypot(dx, dy)
          const pullRadius = radius + Math.max(r.width, r.height) / 2

          if (dist < pullRadius) {
            const pull = Math.min(1, 1 - dist / pullRadius) * strength
            el.style.transform = `translate3d(${dx * pull}px, ${dy * pull}px, 0)`
          } else {
            el.style.transform = 'translate3d(0, 0, 0)'
          }
        })
      }

      const reset = () => {
        cancelAnimationFrame(raf)
        el.style.transform = 'translate3d(0, 0, 0)'
      }

      window.addEventListener('pointermove', handle, { passive: true })
      window.addEventListener('pointerleave', reset, { passive: true })
      el.addEventListener('pointerleave', reset, { passive: true })

      return () => {
        cancelAnimationFrame(raf)
        window.removeEventListener('pointermove', handle)
        window.removeEventListener('pointerleave', reset)
        el.removeEventListener('pointerleave', reset)
      }
    }, [strength, radius, reduce])

    return (
      <button
        ref={localRef}
        className={cn('will-change-transform transition-transform duration-200 ease-out active:scale-[0.98]', className)}
        style={{ transform: 'translate3d(0, 0, 0)' }}
        {...props}
      >
        {children}
      </button>
    )
  }
)
