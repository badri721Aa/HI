'use client'
/**
 * "Updating — please wait": covers everything while the server is in maintenance,
 * with a calm animation and a live count of the players waiting. Input is swallowed
 * so nothing starts behind it. When maintenance ends the page reloads itself
 * (net/service.ts); until then the notice says so.
 */
import { useEffect, useState, type CSSProperties } from 'react'
import { useBus } from './context'
import { StarIcon } from './icons'
import { cx, LABEL } from './theme'
import styles from './ui.module.css'

type Notice = { on: boolean; message: string; waiting: number }

export function MaintenanceOverlay() {
  const [notice, setNotice] = useState<Notice | null>(null)
  useBus('net:maintenance', setNotice)
  const shown = !!notice
  const on = !!notice?.on

  // Swallow keys while it is up (capture phase, before the game and the menus).
  useEffect(() => {
    if (!shown) return
    const block = (e: KeyboardEvent) => {
      e.stopPropagation()
      e.preventDefault()
    }
    window.addEventListener('keydown', block, true)
    window.addEventListener('keyup', block, true)
    return () => {
      window.removeEventListener('keydown', block, true)
      window.removeEventListener('keyup', block, true)
    }
  }, [shown])

  if (!notice) return null
  const n = notice.waiting
  return (
    <div role="alertdialog" aria-live="polite" aria-label={notice.message} className={cx('pointer-events-auto absolute inset-0 z-[95] flex flex-col items-center justify-center bg-[#0B0F14]/[0.97] px-6 text-center backdrop-blur-md')}>
      <div aria-hidden className="relative flex h-[160px] w-[160px] items-center justify-center">
        {[0, 1600, 3200].map(d => (
          <span key={d} className={cx(styles.ripple, 'absolute inset-0 rounded-full border border-[#F5B455]/60')} style={{ '--d': `${d}ms` } as CSSProperties} />
        ))}
        <StarIcon className="h-9 w-9 text-[#F5B455] [filter:drop-shadow(0_0_14px_rgba(245,180,85,0.6))]" />
      </div>
      <div className={cx(LABEL, 'mt-8 text-[#F5B455]')}>{on ? 'Starfall Isle' : 'Back online'}</div>
      <h2 className="mt-3 font-nacelle text-[clamp(28px,4.4vw,44px)] font-semibold leading-tight text-[#F3EEE6]">
        {on ? notice.message : 'Loading the new version…'}
      </h2>
      {on && (
        <p className="mt-4 text-[15px] text-[#F3EEE6]/70">
          <span className="font-semibold tabular-nums text-[#F3EEE6]">{n}</span> {n === 1 ? 'player' : 'players'} waiting
        </p>
      )}
      <p className="mt-2 max-w-[420px] text-[13px] leading-relaxed text-[#F3EEE6]/45">
        {on ? 'Your progress is saved. The game reloads by itself as soon as the update is done.' : 'Just a moment.'}
      </p>
    </div>
  )
}
