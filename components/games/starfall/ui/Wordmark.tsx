/**
 * The STARFALL ISLE wordmark, shared by the loading and title screens so the hand-off is seamless.
 * `animate` plays the entrance (letters rise, the rule draws, the star lands); the markup is the
 * same either way, so both screens set it to exactly the same size.
 */
import type { CSSProperties } from 'react'
import { StarIcon } from './icons'
import { cx } from './theme'
import styles from './ui.module.css'

const LETTERS = [...'STARFALL']

export function Wordmark({ className, animate }: { className?: string; animate?: boolean }) {
  return (
    <div className={cx('select-none', animate && styles.wordIn, className)} aria-label="Starfall Isle" role="heading" aria-level={1}>
      <div aria-hidden className="relative inline-block">
        <StarIcon className={cx(styles.wordStar, 'absolute -right-[0.34em] -top-[0.3em] h-[0.36em] w-[0.36em] text-[#F5B455] [font-size:clamp(3rem,6.2vw,5.6rem)]')} />
        <div className="font-nacelle text-[clamp(3rem,6.2vw,5.6rem)] font-semibold leading-[0.88] tracking-[0.06em] whitespace-nowrap text-[#F3EEE6]">
          {LETTERS.map((c, i) => (
            <span key={i} className={styles.letter} style={{ '--i': i } as CSSProperties}>
              {c}
            </span>
          ))}
        </div>
      </div>
      <div aria-hidden className="mt-[clamp(10px,1.6vh,16px)] flex items-center gap-4">
        <span className={cx(styles.wordRule, 'h-px w-[clamp(28px,4vw,56px)] bg-[#F5B455]')} />
        <span className={cx(styles.wordSub, 'font-nacelle text-[clamp(0.95rem,1.6vw,1.35rem)] font-semibold leading-none tracking-[0.68em] text-[#F3EEE6]/85')}>ISLE</span>
      </div>
    </div>
  )
}
