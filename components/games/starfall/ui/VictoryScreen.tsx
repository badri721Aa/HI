'use client'
/** End card after the Beacon is lit. */
import { useEffect, useRef, type CSSProperties } from 'react'
import { useGameUi, usePresence, useUi } from './context'
import { Button } from './controls'
import { StarIcon } from './icons'
import { focusFirst, useMenuNav } from './nav'
import { cx, formatTime, LABEL } from './theme'
import styles from './ui.module.css'

export function VictoryScreen() {
  const phase = useUi(s => s.phase)
  const stats = useUi(s => s.victory)
  const visible = phase === 'victory' && !!stats
  const mounted = usePresence(visible, 260)
  if (!mounted || !stats) return null
  return <VictoryContent state={visible ? 'open' : 'closed'} />
}

function VictoryContent({ state }: { state: 'open' | 'closed' }) {
  const { game } = useGameUi()
  const s = useUi(st => st.victory)!
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (state === 'open') focusFirst(rootRef.current, '[data-autofocus]')
  }, [state])
  useMenuNav({ scope: rootRef, enabled: state === 'open' })

  const rows: Array<{ label: string; value: string; sub?: string; badge?: boolean }> = [
    { label: 'Time', value: formatTime(s.time), badge: s.newBest },
    ...(s.bestTime !== null && !s.newBest ? [{ label: 'Best time', value: formatTime(s.bestTime) }] : []),
    { label: 'Star sparks', value: String(s.sparks), sub: s.sparksTotal ? `/ ${s.sparksTotal}` : undefined },
    { label: 'Gloomlings defeated', value: String(s.enemies) },
    { label: 'Falls', value: String(s.deaths) },
  ]

  return (
    <div ref={rootRef} data-state={state} className={cx(styles.presence, 'absolute inset-0 z-50')}>
      <div aria-hidden className={cx(styles.titleScrim, 'absolute inset-0')} />
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(80%_60%_at_80%_20%,rgba(245,180,85,0.12),transparent_70%)]" />

      <div className="absolute inset-0 flex flex-col justify-center overflow-y-auto px-[clamp(20px,6vw,88px)] py-[clamp(24px,7vh,72px)]">
        <div className={styles.rise}>
          <div className={cx(LABEL, 'flex items-center gap-3 text-[#F5B455]')}>
            <StarIcon className="h-3 w-3" /> Journey complete
          </div>
          <h1 className="mt-3 max-w-[760px] text-balance font-nacelle text-[clamp(38px,5.6vw,72px)] font-semibold leading-[0.95] tracking-[-0.015em] text-[#F3EEE6]">
            The Beacon burns again
          </h1>
          <p className="mt-4 max-w-[440px] text-[15px] leading-relaxed text-[#F3EEE6]/65">
            All seven shards are home. Tonight, every ship at sea can find its way back to the island.
          </p>
        </div>

        <dl className="mt-10 w-full max-w-[420px]">
          {rows.map((r, i) => (
            <div
              key={r.label}
              className={cx(styles.rise, 'flex items-baseline justify-between gap-6 border-b border-[#F3EEE6]/10 py-3 first:border-t')}
              style={{ '--d': `${260 + i * 90}ms` } as CSSProperties}
            >
              <dt className="text-[14px] text-[#F3EEE6]/60">{r.label}</dt>
              <dd className="flex items-baseline gap-3">
                {r.badge && (
                  <span className={cx(styles.badge, 'rounded-[3px] bg-[#F5B455] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[#0B0F14]')}>
                    New best
                  </span>
                )}
                <span className="font-nacelle text-[22px] tabular-nums leading-none text-[#F3EEE6]">
                  {r.value}
                  {r.sub && <span className="text-[#F3EEE6]/40"> {r.sub}</span>}
                </span>
              </dd>
            </div>
          ))}
        </dl>

        <div className={cx(styles.rise, 'mt-10 flex flex-wrap gap-3')} style={{ '--d': '760ms' } as CSSProperties}>
          <Button variant="primary" onClick={() => game.resume()} autofocus>
            Keep exploring
          </Button>
          <Button onClick={() => game.quitToTitle()}>Title screen</Button>
        </div>
      </div>
    </div>
  )
}
