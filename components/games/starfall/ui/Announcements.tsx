'use client'
/** Toasts (top-right) and the shard title card — shown through cutscenes and dialogs too. */
import type { CSSProperties } from 'react'
import type { ToastKind } from '../engine/events'
import { useUi } from './context'
import { HeartIcon, InfoIcon, LanternIcon, StarIcon, WarningIcon } from './icons'
import { cx, LABEL } from './theme'
import styles from './ui.module.css'

export function Announcements() {
  const phase = useUi(s => s.phase)
  const visible = phase === 'playing' || phase === 'cutscene' || phase === 'dialog'
  return (
    <div className={cx('pointer-events-none absolute inset-0 z-40 transition-opacity duration-200', visible ? 'opacity-100' : 'opacity-0')}>
      <Toasts />
      <ShardBanner />
    </div>
  )
}

const TOAST_ICON: Record<ToastKind, { Icon: typeof StarIcon; color: string }> = {
  shard: { Icon: StarIcon, color: 'text-[#F5B455]' },
  checkpoint: { Icon: LanternIcon, color: 'text-[#F5B455]' },
  heart: { Icon: HeartIcon, color: 'text-[#E8664F]' },
  info: { Icon: InfoIcon, color: 'text-[#F3EEE6]/80' },
  warning: { Icon: WarningIcon, color: 'text-[#E8664F]' },
  reward: { Icon: StarIcon, color: 'text-[#9FD8FF]' },
}

function Toasts() {
  const toasts = useUi(s => s.toasts)
  return (
    <div
      className="absolute right-[clamp(16px,2.4vw,32px)] top-[clamp(108px,15vh,132px)] flex w-[min(280px,70vw)] flex-col items-end gap-2 max-sm:top-[118px] max-sm:w-[calc(50vw-24px)]"
      aria-live="polite"
    >
      {toasts.map(t => {
        const { Icon, color } = TOAST_ICON[t.kind] ?? TOAST_ICON.info
        return (
          <div
            key={t.id}
            data-state={t.leaving ? 'closed' : 'open'}
            className={cx(styles.toast, 'relative flex w-full items-start gap-3 overflow-hidden rounded-[4px] border border-[#F3EEE6]/10 bg-[#0B0F14]/82 py-3 pl-3.5 pr-4 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.6)]')}
          >
            <span aria-hidden className="absolute inset-y-0 left-0 w-px bg-[#F5B455]/80" />
            <Icon className={cx('mt-px h-4 w-4 shrink-0', color)} />
            <div className="min-w-0">
              <div className="text-[13px] font-semibold leading-tight text-[#F3EEE6]">{t.title}</div>
              {t.body && <div className="mt-0.5 line-clamp-3 text-[12px] leading-snug text-[#F3EEE6]/55">{t.body}</div>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ShardBanner() {
  const banner = useUi(s => s.banner)
  if (!banner) return null
  return (
    <div
      key={banner.id}
      data-state={banner.leaving ? 'closed' : 'open'}
      className={cx(styles.banner, 'absolute inset-x-0 top-[26%] isolate flex flex-col items-center px-6 text-center')}
      role="status"
    >
      {/* soft shade so the card reads over a bright sky */}
      <div aria-hidden className="absolute left-1/2 top-1/2 -z-10 h-[260px] w-[min(900px,100vw)] -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(closest-side,rgba(11,15,20,0.42),rgba(11,15,20,0))]" />
      <div className={cx(styles.rise, LABEL, styles.hudText, 'flex items-center gap-4 font-semibold text-[#F5B455]')}>
        <span className="h-px w-12 bg-[#F5B455]" />
        Star shard recovered
        <span className="h-px w-12 bg-[#F5B455]" />
      </div>
      <div className={cx(styles.bannerTitle, styles.hudText, 'mt-3 font-nacelle text-[clamp(34px,5vw,60px)] font-semibold leading-none text-[#F3EEE6]')}>
        {banner.name}
      </div>
      <div className={cx(styles.rise, 'mt-5 flex items-center gap-4')} style={{ '--d': '380ms' } as CSSProperties}>
        <div className="flex gap-1.5">
          {Array.from({ length: banner.total }, (_, i) =>
            i < banner.collected ? (
              <StarIcon key={i} className={cx(styles.starFill, styles.starGlow, 'h-4 w-4 text-[#F5B455]')} style={{ '--d': `${500 + i * 70}ms` } as CSSProperties} />
            ) : (
              <StarIcon key={i} filled={false} className={cx(styles.hudIcon, 'h-4 w-4 text-[#F3EEE6]/45')} />
            ),
          )}
        </div>
        <span className={cx(styles.hudText, 'font-nacelle text-[17px] tabular-nums text-[#F3EEE6]/85')}>
          {banner.collected} <span className="text-[#F3EEE6]/45">/ {banner.total}</span>
        </span>
      </div>
    </div>
  )
}
