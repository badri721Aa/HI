'use client'
/** Short, quiet credits. */
import { PanelHeader } from './controls'
import { StarIcon } from './icons'
import { BackHint } from './Panel'
import { cx, LABEL } from './theme'

const CREDITS: Array<[string, string]> = [
  ['Hero', '“Low Poly Boy” rigged character, re-lit and animated for the island'],
  ['Design & code', 'Alhekma Arcade'],
  ['Rendering', 'three.js on WebGL 2'],
  ['Music & sound', 'Composed and synthesised live with the Web Audio API'],
  ['Type', 'Nacelle and Inter'],
]

export function CreditsPanel({ onBack }: { onBack: () => void }) {
  return (
    <div>
      <PanelHeader eyebrow="Starfall Isle" title="Credits" aside={<BackHint onBack={onBack} />} />
      <p className="max-w-[440px] text-[15px] leading-relaxed text-[#F3EEE6]/70">
        A small island adventure about seven fallen stars, one dark lantern, and the boy who climbed every rooftop to set it right.
      </p>
      <dl className="mt-8 space-y-5">
        {CREDITS.map(([role, who]) => (
          <div key={role} className="grid grid-cols-[minmax(110px,150px)_1fr] gap-6">
            <dt className={cx(LABEL, 'pt-[3px] text-[10px] text-[#F3EEE6]/40')}>{role}</dt>
            <dd className="text-[14px] leading-relaxed text-[#F3EEE6]/85">{who}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-10 flex items-center gap-3 border-t border-[#F3EEE6]/10 pt-5 text-[13px] text-[#F3EEE6]/45">
        <StarIcon className="h-3 w-3 text-[#F5B455]" />
        Thank you for playing.
      </div>
    </div>
  )
}
