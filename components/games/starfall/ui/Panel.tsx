'use client'
/** Frame for the right-hand sub-panels of the title and pause menus. */
import type { ReactNode, RefObject } from 'react'
import { useGameUi } from './context'
import { KeyCap } from './controls'
import { BackIcon } from './icons'
import { cx } from './theme'
import styles from './ui.module.css'

export function Panel({
  children,
  panelRef,
  wide,
  label,
}: {
  children: ReactNode
  panelRef?: RefObject<HTMLElement | null>
  wide?: boolean
  label: string
}) {
  return (
    <section
      ref={panelRef}
      aria-label={label}
      tabIndex={-1}
      className={cx(
        styles.slide,
        'outline-none',
        'relative flex max-h-full w-full flex-col overflow-hidden rounded-[4px] border border-[#F3EEE6]/10 bg-[#0B0F14]/[0.9] shadow-[0_24px_80px_-24px_rgba(0,0,0,0.7)]',
        wide ? 'max-w-[860px]' : 'max-w-[640px]',
      )}
    >
      <span aria-hidden className="absolute left-0 top-0 h-px w-16 bg-[#F5B455]" />
      <div className="min-h-0 flex-1 overflow-y-auto px-[clamp(18px,3vw,36px)] py-[clamp(18px,3.2vh,32px)] [scrollbar-color:rgba(243,238,230,0.2)_transparent] [scrollbar-width:thin]">
        {children}
      </div>
    </section>
  )
}

/** "Esc  Back" affordance in panel headers (a real button for mouse / touch). */
export function BackHint({ onBack }: { onBack: () => void }) {
  const { touch } = useGameUi()
  return (
    <button
      type="button"
      onClick={onBack}
      className="group inline-flex shrink-0 items-center gap-2 text-[12px] uppercase tracking-[0.16em] text-[#F3EEE6]/45 transition-colors hover:text-[#F3EEE6]"
    >
      {touch ? <BackIcon className="h-4 w-4" /> : <KeyCap>Esc</KeyCap>}
      Back
    </button>
  )
}
