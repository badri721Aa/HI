'use client'
/** Boot screen: wordmark, hairline progress bar, rotating tips, and the error state. */
import Link from 'next/link'
import { useEffect, useState, type CSSProperties } from 'react'
import { BackIcon } from './icons'
import { cx, LABEL, STANDALONE } from './theme'
import styles from './ui.module.css'
import { Wordmark } from './Wordmark'

const TIPS = [
  'Jump again in mid-air for a double jump — it carries you onto rooftops and ledges.',
  'Dash with Q or right-click. It crosses gaps a jump alone cannot.',
  'Land on a gloomling to stomp it, or spin with F to send it packing.',
  'Lanterns are checkpoints. Touch one and you will wake there after a fall.',
  'Golden sparks are scattered everywhere. Grab them in quick succession to build a chain.',
  'Lost? Press M to open the map — every shard has a hint pinned to it.',
  'The sea is cold and deep. Fall in and you will wake at the last lantern you lit.',
]

/** Deterministic star field (identical on server and client — no hydration drift). */
const STARS = (() => {
  let s = 7
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  return Array.from({ length: 46 }, () => ({
    x: rnd() * 100,
    y: rnd() * 62,
    r: rnd() < 0.15 ? 1.6 : 1,
    o: 0.18 + rnd() * 0.5,
    t: 3 + rnd() * 5,
    d: rnd() * 6,
  }))
})()

export function LoadingScreen({ progress, label, error, state }: { progress: number; label: string; error: string | null; state: 'open' | 'closed' }) {
  const [tip, setTip] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTip(i => (i + 1) % TIPS.length), 5200)
    return () => clearInterval(t)
  }, [])
  const pct = Math.round(Math.min(1, Math.max(0, progress)) * 100)

  return (
    <div
      data-state={state}
      className={cx(styles.presence, styles.loadingBg, 'absolute inset-0 z-[80] overflow-hidden')}
      style={{ animationDuration: state === 'closed' ? '700ms' : '0ms' }}
      aria-busy={!error && state === 'open'}
    >
      <div aria-hidden className="absolute inset-0">
        {STARS.map((s, i) => (
          <span
            key={i}
            className={cx(styles.twinkle, 'absolute rounded-full bg-[#F3EEE6]')}
            style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.r, height: s.r, '--o': s.o, '--t': `${s.t}s`, '--d': `${s.d}s` } as CSSProperties}
          />
        ))}
        <span className={styles.shootingStar} style={{ left: '58%', top: '14%', '--a': '154deg', '--dx': '-260px', '--dy': '128px' } as CSSProperties} />
      </div>

      <div className="absolute inset-0 flex flex-col px-[clamp(20px,6vw,88px)] py-[clamp(24px,7vh,72px)]">
        <div className="mt-[18vh] [@media(max-height:640px)]:mt-[9vh]">
          <Wordmark />
        </div>

        <div className="mt-[clamp(36px,7vh,64px)] w-[min(340px,100%)]" role="status" aria-live="polite">
          {error ? (
            <div className={styles.rise}>
              <div className={cx(LABEL, 'text-[#E8664F]')}>The island could not load</div>
              <p className="mt-3 max-w-[460px] text-[14px] leading-relaxed text-[#F3EEE6]/70">{friendlyError(error)}</p>
              <p className="mt-2 max-w-[460px] break-words font-mono text-[11px] leading-relaxed text-[#F3EEE6]/35">{error}</p>
              <div className="mt-6 flex flex-wrap items-center gap-5">
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="h-10 rounded-[4px] bg-[#F5B455] px-5 text-[12px] font-semibold uppercase tracking-[0.16em] text-[#0B0F14] transition-colors hover:bg-[#F8C677]"
                >
                  Try again
                </button>
                {!STANDALONE && (
                  <Link href="/games" className="inline-flex items-center gap-2 text-[13px] text-[#F3EEE6]/60 transition-colors hover:text-[#F3EEE6]">
                    <BackIcon className="h-4 w-4" /> Back to the Arcade
                  </Link>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="relative h-px w-full bg-[#F3EEE6]/12">
                <div className="absolute inset-y-0 left-0 bg-[#F5B455] transition-[width] duration-300 ease-out" style={{ width: `${pct}%` }} />
                <div
                  className="absolute -top-[2px] h-[5px] w-[5px] -translate-x-1/2 rounded-full bg-[#FFE2B0] shadow-[0_0_10px_2px_rgba(245,180,85,0.55)] transition-[left] duration-300 ease-out"
                  style={{ left: `${pct}%` }}
                />
              </div>
              <div className="mt-3 flex items-baseline justify-between gap-4 text-[12px]">
                <span className="truncate text-[#F3EEE6]/55">{label}…</span>
                <span className="tabular-nums text-[#F3EEE6]/80">{pct}%</span>
              </div>
            </>
          )}
        </div>

        {!error && (
          <div className="mt-auto max-w-[520px]">
            <div className={cx(LABEL, 'text-[#F5B455]/80')}>Tip</div>
            <p key={tip} className={cx(styles.tip, 'mt-2 text-[14px] leading-relaxed text-[#F3EEE6]/65')}>
              {TIPS[tip]}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function friendlyError(msg: string): string {
  if (/webgl|context/i.test(msg)) return 'Your browser could not start WebGL. Try enabling hardware acceleration, or open the game in another browser.'
  return 'Something went wrong while building the island. Reloading usually fixes it.'
}
