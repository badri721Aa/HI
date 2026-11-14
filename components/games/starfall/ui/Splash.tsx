'use client'
/**
 * Boot ident: a short "made with" card on near-black that fades in, holds, and fades out over the
 * loading screen (loading carries on underneath, so it costs no time). Any click, tap or key skips
 * it, and that input goes no further.
 */
import { useEffect, useState } from 'react'
import { StarIcon } from './icons'
import { cx, LABEL } from './theme'
import styles from './ui.module.css'

/** When the card starts to leave on its own, and how long the fade takes (ms). */
const HOLD_MS = 2400
const OUT_MS = 650
const SKIP_OUT_MS = 280

type Stage = 'in' | 'out' | 'skip' | 'done'

export function Splash() {
  const [stage, setStage] = useState<Stage>('in')

  useEffect(() => {
    if (stage === 'done') return
    if (stage === 'in') {
      const t = setTimeout(() => setStage('out'), HOLD_MS)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setStage('done'), stage === 'skip' ? SKIP_OUT_MS : OUT_MS)
    return () => clearTimeout(t)
  }, [stage])

  useEffect(() => {
    if (stage === 'done') return
    // Capture on window runs before anything else hears the key, so a skip never presses a
    // button on the screen underneath.
    const onKey = (e: KeyboardEvent) => {
      // Browser shortcuts (reload, dev tools, …) still work.
      if (e.ctrlKey || e.metaKey || e.altKey || /^F\d+$/.test(e.key)) return
      e.preventDefault()
      e.stopPropagation()
      setStage(s => (s === 'in' ? 'skip' : s))
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [stage])

  if (stage === 'done') return null
  const leaving = stage !== 'in'
  return (
    <div
      aria-hidden
      data-stage={stage}
      className={cx(styles.splash, 'absolute inset-0 z-[100] flex cursor-pointer items-center justify-center bg-[#070709]')}
      style={leaving ? { animationDuration: `${stage === 'skip' ? SKIP_OUT_MS : OUT_MS}ms` } : undefined}
      onPointerDown={e => {
        e.preventDefault()
        e.stopPropagation()
        setStage(s => (s === 'in' ? 'skip' : s))
      }}
    >
      <div className={cx(styles.splashCard, 'flex flex-col items-center px-6 text-center')}>
        <StarIcon className={cx(styles.splashStar, 'mb-5 h-5 w-5 text-[#F5B455]')} />
        <div className={cx(LABEL, styles.splashLabel, 'text-[#F3EEE6]/55')}>Made with</div>
        <div className="mt-3 font-nacelle text-[clamp(2.4rem,5vw,3.6rem)] font-semibold leading-none tracking-[0.02em] text-[#F3EEE6]">
          three.js
        </div>
        <span className={cx(styles.splashRule, 'mt-5 h-px w-[clamp(48px,7vw,84px)] bg-[#F5B455]/80')} />
      </div>
      <div className={cx(LABEL, styles.splashHint, 'absolute inset-x-0 bottom-[max(28px,5vh)] text-center text-[10px] text-[#F3EEE6]/30')}>
        Click or press any key to skip
      </div>
    </div>
  )
}
