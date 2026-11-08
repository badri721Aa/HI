/** The STARFALL ISLE wordmark, shared by the loading and title screens so the hand-off is seamless. */
import { StarIcon } from './icons'
import { cx } from './theme'

export function Wordmark({ className }: { className?: string }) {
  return (
    <div className={cx('select-none', className)} aria-label="Starfall Isle" role="heading" aria-level={1}>
      <div aria-hidden className="relative inline-block">
        <StarIcon className="absolute -right-[0.34em] -top-[0.3em] h-[0.36em] w-[0.36em] text-[#F5B455] [font-size:clamp(3rem,6.2vw,5.6rem)]" />
        <div className="font-nacelle text-[clamp(3rem,6.2vw,5.6rem)] font-semibold leading-[0.88] tracking-[0.06em] text-[#F3EEE6]">STARFALL</div>
      </div>
      <div aria-hidden className="mt-[clamp(10px,1.6vh,16px)] flex items-center gap-4">
        <span className="h-px w-[clamp(28px,4vw,56px)] bg-[#F5B455]" />
        <span className="font-nacelle text-[clamp(0.95rem,1.6vw,1.35rem)] font-semibold leading-none tracking-[0.68em] text-[#F3EEE6]/85">ISLE</span>
      </div>
    </div>
  )
}
