/** Hand-drawn inline SVG icons for the Starfall UI (24×24 grid unless noted). */
import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

const base = (p: IconProps): IconProps => ({ viewBox: '0 0 24 24', 'aria-hidden': true, focusable: false, ...p })

/** Four-point star used for shards. Concave sides read well at small sizes. */
export const STAR_PATH = 'M12 1.6C12.8 7.4 16.6 11.2 22.4 12C16.6 12.8 12.8 16.6 12 22.4C11.2 16.6 7.4 12.8 1.6 12C7.4 11.2 11.2 7.4 12 1.6Z'

export function StarIcon({ filled = true, ...p }: IconProps & { filled?: boolean }) {
  return (
    <svg {...base(p)}>
      <path
        d={STAR_PATH}
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={filled ? 0 : 1.4}
        strokeLinejoin="round"
      />
    </svg>
  )
}

export const HEART_PATH =
  'M12 20.6c-.3 0-.6-.1-.8-.3C6.3 16.2 2.6 12.9 2.6 8.9 2.6 6 4.8 3.8 7.6 3.8c1.8 0 3.4.9 4.4 2.3 1-1.4 2.6-2.3 4.4-2.3 2.8 0 5 2.2 5 5.1 0 4-3.7 7.3-8.6 11.4-.2.2-.5.3-.8.3Z'

export function HeartIcon({ filled = true, ...p }: IconProps & { filled?: boolean }) {
  return (
    <svg {...base(p)}>
      <path
        d={HEART_PATH}
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={filled ? 0 : 1.5}
        strokeLinejoin="round"
      />
      {filled && <path d="M6.2 7.4c.5-1 1.4-1.6 2.4-1.7" stroke="white" strokeOpacity={0.45} strokeWidth={1.4} strokeLinecap="round" fill="none" />}
    </svg>
  )
}

/** Spark — a small faceted diamond. */
export function SparkIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M12 2.5 18.5 12 12 21.5 5.5 12Z" fill="currentColor" />
      <path d="M12 2.5 15 12 12 21.5" fill="black" fillOpacity={0.18} />
    </svg>
  )
}

export function BeaconIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="4.2" fill="currentColor" />
      <g stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
        <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1" />
      </g>
    </svg>
  )
}

export function LanternIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M9.5 4.5h5M12 2.5v2" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" fill="none" />
      <path d="M8 7.5c0-1.1.9-2 2-2h4c1.1 0 2 .9 2 2v9c0 1.1-.9 2-2 2h-4c-1.1 0-2-.9-2-2Z" fill="currentColor" fillOpacity={0.25} stroke="currentColor" strokeWidth={1.5} />
      <path d="M12 9.5c1.2 1.3 1.6 2.4 1.6 3.3a1.6 1.6 0 0 1-3.2 0c0-.9.4-2 1.6-3.3Z" fill="currentColor" />
      <path d="M9 21.5h6" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  )
}

/** Map player marker: a sharp arrowhead pointing up. */
export function ArrowIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M12 2.5 19.5 20.5 12 16.6 4.5 20.5Z" fill="currentColor" stroke="#0B0F14" strokeWidth={1.4} strokeLinejoin="round" />
    </svg>
  )
}

export function PauseIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <rect x="6.5" y="5" width="3.6" height="14" rx="1" fill="currentColor" />
      <rect x="13.9" y="5" width="3.6" height="14" rx="1" fill="currentColor" />
    </svg>
  )
}

export function JumpIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M6 13.5 12 7.5l6 6M6 18.5l6-6 6 6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function DashIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M5.5 6.5 11 12l-5.5 5.5M12.5 6.5 18 12l-5.5 5.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function SpinIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M19 12a7 7 0 1 1-2.05-4.95" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      <path d="M17.6 3.6v3.9h-3.9" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function InteractIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" strokeWidth={1.8} />
      <circle cx="12" cy="12" r="2.6" fill="currentColor" />
    </svg>
  )
}

export function MouseIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <rect x="6.5" y="3" width="11" height="18" rx="5.5" fill="none" stroke="currentColor" strokeWidth={1.6} />
      <path d="M12 6.5v3.5" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
    </svg>
  )
}

export function BackIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M19 12H5.5M11 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function ChevronIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M9 5.5 15.5 12 9 18.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function SkipIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M5 6.5 11 12l-6 5.5ZM12 6.5 18 12l-6 5.5Z" fill="currentColor" />
    </svg>
  )
}

export function InfoIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth={1.6} />
      <path d="M12 11v5.5" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
      <circle cx="12" cy="7.8" r="1.1" fill="currentColor" />
    </svg>
  )
}

export function WarningIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M12 3.5 21.5 20h-19Z" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" />
      <path d="M12 9.5v5" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
      <circle cx="12" cy="17.2" r="1.1" fill="currentColor" />
    </svg>
  )
}
