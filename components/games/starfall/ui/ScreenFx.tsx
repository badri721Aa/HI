'use client'
/** Full-screen fade / flash (ui:fade, ui:flash), the damage tint and the low-health pulse. */
import { useRef, useState } from 'react'
import { useBus, useHud, useUi } from './context'
import { cx } from './theme'
import styles from './ui.module.css'

export function ScreenFx() {
  const fadeRef = useRef<HTMLDivElement>(null)
  const flashRef = useRef<HTMLDivElement>(null)

  useBus('ui:fade', e => {
    const el = fadeRef.current
    if (!el) return
    el.style.transitionDuration = `${Math.max(0, e.duration)}s`
    el.style.opacity = String(Math.min(1, Math.max(0, e.to)))
  })
  useBus('ui:flash', e => {
    const el = flashRef.current
    if (!el) return
    el.style.transition = 'none'
    el.style.backgroundColor = e.color
    el.style.opacity = '0.85'
    void el.offsetWidth // commit the jump before transitioning out
    el.style.transition = `opacity ${Math.max(0.05, e.duration)}s ease-out`
    el.style.opacity = '0'
  })
  useBus('ui:phase', e => {
    // Never leave the screen black behind a menu.
    if (e.phase === 'title' && fadeRef.current) {
      fadeRef.current.style.transitionDuration = '0.4s'
      fadeRef.current.style.opacity = '0'
    }
  })

  return (
    <>
      <DamageTint />
      <div ref={flashRef} aria-hidden className="pointer-events-none absolute inset-0 z-[12] opacity-0" />
      <div ref={fadeRef} aria-hidden className="pointer-events-none absolute inset-0 z-[15] bg-black opacity-0 transition-opacity ease-in-out" />
    </>
  )
}

function DamageTint() {
  const hp = useHud(h => h.hp)
  const phase = useUi(s => s.phase)
  const [prev, setPrev] = useState(hp)
  const [hits, setHits] = useState(0)
  if (hp !== prev) {
    setPrev(hp)
    if (hp < prev && hp >= 0) setHits(hits + 1)
  }
  const low = hp === 1 && phase === 'playing'
  return (
    <>
      {hits > 0 && <div key={hits} aria-hidden className={cx(styles.damage, 'pointer-events-none absolute inset-0 z-[11]')} />}
      {low && <div aria-hidden className={cx(styles.lowHp, 'pointer-events-none absolute inset-0 z-[10]')} />}
    </>
  )
}
