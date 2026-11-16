'use client'
/**
 * Floating damage numbers over gloomlings hit by a weapon. A small pool of spans is moved by one
 * requestAnimationFrame loop that runs only while numbers are alive — no React renders per frame.
 */
import { useEffect, useRef } from 'react'
import { useGameUi } from './context'
import { cx } from './theme'
import styles from './ui.module.css'

const POOL = 14
const LIFE = 0.9
/** Metres the number rises over its life. */
const RISE = 1.1

interface FloatNum {
  el: HTMLSpanElement
  x: number
  y: number
  z: number
  t0: number
  /** Sideways drift (px over the life) so overlapping numbers fan out. */
  drift: number
  size: number
  active: boolean
}

export function DamageNumbers() {
  const { game } = useGameUi()
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const pool: FloatNum[] = Array.from({ length: POOL }, () => {
      const el = document.createElement('span')
      el.className = cx(styles.hudText, 'absolute left-0 top-0 font-nacelle font-semibold tabular-nums leading-none will-change-transform')
      el.style.opacity = '0'
      host.appendChild(el)
      return { el, x: 0, y: 0, z: 0, t0: 0, drift: 0, size: 1, active: false }
    })
    // A vector of the engine's own three.js build (the UI never imports three itself).
    const v = game.ctx.camera.position.clone()
    let raf = 0

    const frame = () => {
      const now = performance.now() / 1000
      const cam = game.ctx.camera
      const w = host.clientWidth
      const h = host.clientHeight
      let alive = 0
      for (const n of pool) {
        if (!n.active) continue
        const u = (now - n.t0) / LIFE
        if (u >= 1) {
          n.active = false
          n.el.style.opacity = '0'
          continue
        }
        alive++
        v.set(n.x, n.y + 0.35 + RISE * (1 - (1 - u) * (1 - u)), n.z).project(cam)
        if (v.z > 1) {
          n.el.style.opacity = '0'
          continue
        }
        const sx = (v.x * 0.5 + 0.5) * w + n.drift * u
        const sy = (-v.y * 0.5 + 0.5) * h
        const pop = u < 0.12 ? 0.5 + (u / 0.12) * 0.7 : 1.2 - Math.min(0.2, (u - 0.12) * 0.8)
        n.el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -50%) scale(${(pop * n.size).toFixed(3)})`
        n.el.style.opacity = u < 0.7 ? '1' : String(1 - (u - 0.7) / 0.3)
      }
      raf = alive ? requestAnimationFrame(frame) : 0
    }

    const off = game.bus.on('enemy:hit', e => {
      let n = pool.find(x => !x.active)
      if (!n) n = pool.reduce((a, b) => (b.t0 < a.t0 ? b : a))
      n.active = true
      n.x = e.pos.x
      n.y = e.pos.y
      n.z = e.pos.z
      n.t0 = performance.now() / 1000
      n.drift = (Math.random() - 0.5) * 60
      n.size = e.killed ? 1.25 : 1
      n.el.textContent = String(e.damage)
      n.el.style.fontSize = e.damage >= 60 ? '26px' : '21px'
      n.el.style.color = e.killed ? '#F5B455' : '#F3EEE6'
      if (!raf) raf = requestAnimationFrame(frame)
    })

    return () => {
      off()
      cancelAnimationFrame(raf)
      host.replaceChildren()
    }
  }, [game])

  return <div ref={hostRef} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" />
}
