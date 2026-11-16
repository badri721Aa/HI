'use client'
/**
 * Letterbox bars, subtitles and the "hold to skip" ring. The engine skips once
 * Space/Enter has been held ~0.7 s (input.skipHeld); we only draw the ring, so
 * we track the keys ourselves. On touch the ring is a tap target instead.
 */
import { useEffect, useRef, useState } from 'react'
import { playUi, useGameUi, useUi } from './context'
import { KeyCap } from './controls'
import { SkipIcon } from './icons'
import { cx } from './theme'
import styles from './ui.module.css'

const HOLD_MS = 700
const RING_R = 9
const RING_C = 2 * Math.PI * RING_R

export function CutsceneOverlay() {
  const letterbox = useUi(s => s.letterbox)
  const subtitle = useUi(s => s.subtitle)
  const subtitlesOn = useUi(s => s.settings.subtitles)
  const phase = useUi(s => s.phase)
  const on = letterbox.on && phase !== 'title'
  const canSkip = on && letterbox.skippable && phase === 'cutscene'

  return (
    <div className="pointer-events-none absolute inset-0 z-20" aria-hidden={!on}>
      <div className={cx(styles.letterbox, 'absolute inset-x-0 top-0 h-[11.5vh] bg-[#050608]', on ? 'translate-y-0' : '-translate-y-full')} />
      <div className={cx(styles.letterbox, 'absolute inset-x-0 bottom-0 h-[11.5vh] bg-[#050608]', on ? 'translate-y-0' : 'translate-y-full')}>
        {canSkip && <SkipControl />}
      </div>

      {subtitle && subtitlesOn && phase !== 'title' && (
        <div className="absolute inset-x-0 bottom-[calc(11.5vh+clamp(14px,3vh,28px))] flex justify-center px-6">
          <p key={subtitle.text} className={cx(styles.subtitle, styles.hudText, 'max-w-[760px] text-center text-[clamp(15px,1.7vw,19px)] leading-snug text-[#F3EEE6]')}>
            {subtitle.speaker && <span className="mr-2 text-[0.72em] font-semibold uppercase tracking-[0.2em] text-[#F5B455]">{subtitle.speaker}</span>}
            {subtitle.text}
          </p>
        </div>
      )}
    </div>
  )
}

function SkipControl() {
  const { game, touch } = useGameUi()
  const ringRef = useRef<SVGCircleElement>(null)
  const [holding, setHolding] = useState(false)

  useEffect(() => {
    if (touch) return
    let start = -1
    let raf = 0
    const draw = () => {
      const p = start < 0 ? 0 : Math.min(1, (performance.now() - start) / HOLD_MS)
      ringRef.current?.setAttribute('stroke-dashoffset', String(RING_C * (1 - p)))
      if (start >= 0) raf = requestAnimationFrame(draw)
    }
    const down = (e: KeyboardEvent) => {
      if ((e.code !== 'Space' && e.code !== 'Enter') || e.repeat || start >= 0) return
      start = performance.now()
      setHolding(true)
      raf = requestAnimationFrame(draw)
    }
    const up = (e: KeyboardEvent) => {
      if (e.code !== 'Space' && e.code !== 'Enter') return
      start = -1
      cancelAnimationFrame(raf)
      draw()
      setHolding(false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [touch])

  if (touch) {
    return (
      <button
        type="button"
        onPointerDown={e => {
          e.preventDefault()
          playUi(game, 'ui-click')
          game.skipCutscene()
        }}
        className="pointer-events-auto absolute right-[clamp(16px,3vw,40px)] top-1/2 flex h-11 -translate-y-1/2 touch-none items-center gap-2 rounded-full border border-[#F3EEE6]/35 bg-[#0B0F14]/40 px-5 text-[12px] font-semibold uppercase tracking-[0.18em] text-[#F3EEE6]/90 transition-transform duration-100 active:scale-95 active:border-[#F5B455] active:bg-[#F5B455] active:text-[#0B0F14]"
      >
        Skip <SkipIcon className="h-3.5 w-3.5" />
      </button>
    )
  }

  return (
    <div className={cx('absolute right-[clamp(16px,3vw,40px)] top-1/2 flex -translate-y-1/2 items-center gap-3 text-[11px] uppercase tracking-[0.18em] transition-colors duration-150', holding ? 'text-[#F3EEE6]' : 'text-[#F3EEE6]/50')}>
      <svg viewBox="0 0 24 24" className="h-6 w-6 -rotate-90" aria-hidden>
        <circle cx="12" cy="12" r={RING_R} fill="none" stroke="#F3EEE6" strokeOpacity={0.18} strokeWidth={2} />
        <circle ref={ringRef} cx="12" cy="12" r={RING_R} fill="none" stroke="#F5B455" strokeWidth={2} strokeLinecap="round" strokeDasharray={RING_C} strokeDashoffset={RING_C} />
      </svg>
      <span className="flex items-center gap-2">
        Hold <KeyCap>Space</KeyCap> to skip
      </span>
    </div>
  )
}
