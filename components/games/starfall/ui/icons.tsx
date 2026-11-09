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

/* ── online ─────────────────────────────────────────────────────── */

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

export function CopyIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2" {...stroke} />
      <path d="M15.5 5.5v-.5a1.5 1.5 0 0 0-1.5-1.5H6A2.5 2.5 0 0 0 3.5 6v8A1.5 1.5 0 0 0 5 15.5h.5" {...stroke} />
    </svg>
  )
}

export function CheckIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="m5 12.5 4.5 4.5L19 7.5" {...stroke} strokeWidth={2} />
    </svg>
  )
}

export function RefreshIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" {...stroke} />
      <path d="M19.8 4.2v4.3h-4.3" {...stroke} />
    </svg>
  )
}

/** Two figures — player counts. */
export function UsersIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <circle cx="9" cy="8.5" r="3.3" fill="currentColor" />
      <path d="M2.8 19.5c.5-3.4 3-5.4 6.2-5.4s5.7 2 6.2 5.4Z" fill="currentColor" />
      <circle cx="16.6" cy="9.3" r="2.6" fill="currentColor" fillOpacity={0.55} />
      <path d="M16.2 14.3c2.6.1 4.6 1.8 5 4.7h-4.3c-.2-1.8-.8-3.4-1.9-4.6Z" fill="currentColor" fillOpacity={0.55} />
    </svg>
  )
}

export function ChatIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 4v-4A2.5 2.5 0 0 1 4 13.5Z" {...stroke} />
      <path d="M8.5 9h7M8.5 12h4.5" {...stroke} />
    </svg>
  )
}

/** Raised open hand — emotes. */
export function WaveIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path
        d="M7.5 12.5V6.8a1.4 1.4 0 0 1 2.8 0v4.7M10.3 11V5a1.4 1.4 0 0 1 2.8 0v6M13.1 11V6a1.4 1.4 0 0 1 2.8 0v6.5M15.9 12.5V9.3a1.4 1.4 0 0 1 2.8 0V15a6.5 6.5 0 0 1-6.5 6.5h-.6a6 6 0 0 1-4.6-2.2l-3-3.8a1.4 1.4 0 0 1 2.1-1.8l1.4 1.5"
        {...stroke}
      />
    </svg>
  )
}

/** Three signal bars; `level` 0..3 fills that many. */
export function SignalIcon({ level, ...p }: IconProps & { level: number }) {
  return (
    <svg {...base(p)}>
      {[0, 1, 2].map(i => (
        <rect key={i} x={4 + i * 6} y={15 - i * 4.5} width="4" height={5 + i * 4.5} rx="1" fill="currentColor" fillOpacity={i < level ? 1 : 0.22} />
      ))}
    </svg>
  )
}

/* ── weapons (hotbar) ───────────────────────────────────────────── */

export function FistIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path
        d="M7 10.2V8.6a1.6 1.6 0 0 1 3.2 0v1M10.2 9.6V7.8a1.6 1.6 0 0 1 3.2 0v1.8M13.4 9.6V8.4a1.6 1.6 0 0 1 3.2 0v2.2M16.6 10.6a1.6 1.6 0 0 1 3.2 0v3.2a6.4 6.4 0 0 1-6.4 6.4h-1.6A5.8 5.8 0 0 1 6 14.4v-2.6a1.6 1.6 0 0 1 1.6-1.6h3.6a1.6 1.6 0 0 1 0 3.2H9.4"
        fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  )
}

export function SwordIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M19.8 4.2 9.6 14.4l-1.4-.6.4-1.6L18.6 3.6l1.6-.2Z" fill="currentColor" fillOpacity={0.18} stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" />
      <path d="m6.4 12.2 5.4 5.4M7.6 16.4l-3.4 3.4" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" />
      <circle cx="3.9" cy="20.1" r="1.1" fill="currentColor" />
    </svg>
  )
}

export function HammerIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M12.6 11.4 4.4 19.6" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" />
      <path d="m10.4 6.4 4.2-4.2 7.2 7.2-4.2 4.2Z" fill="currentColor" fillOpacity={0.18} stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" />
      <path d="m12.5 4.3 7.2 7.2" fill="none" stroke="currentColor" strokeWidth={1.2} strokeOpacity={0.6} />
    </svg>
  )
}

export function BowIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M6 3.2c7.6 1.4 13.4 7.2 14.8 14.8" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" />
      <path d="M6 3.2 20.8 18" fill="none" stroke="currentColor" strokeWidth={1} strokeOpacity={0.65} />
      <path d="M3.4 20.6 15 9M15 9h-3.2M15 9v3.2M5.6 18.4l-2.4.2.2-2.4" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/* ── devices (first-run setup) ──────────────────────────────────── */

export function LaptopIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <rect x="4.5" y="5" width="15" height="10" rx="1.4" fill="none" stroke="currentColor" strokeWidth={1.6} />
      <path d="M2.5 18.5h19" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
    </svg>
  )
}

export function DesktopIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <rect x="2.8" y="4" width="13.4" height="10" rx="1.4" fill="none" stroke="currentColor" strokeWidth={1.6} />
      <path d="M9.5 14v3.5M6.5 18.5h6" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
      <rect x="18" y="4" width="3.4" height="15" rx="1" fill="none" stroke="currentColor" strokeWidth={1.5} />
      <path d="M19.7 7.2v.1M19.7 9.4v.1" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
    </svg>
  )
}

export function PhoneIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <rect x="7" y="2.8" width="10" height="18.4" rx="2" fill="none" stroke="currentColor" strokeWidth={1.6} />
      <path d="M11 18h2" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
    </svg>
  )
}

export function SchoolLaptopIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <rect x="4.5" y="6.5" width="15" height="9" rx="1.4" fill="none" stroke="currentColor" strokeWidth={1.6} />
      <path d="M2.5 19h19M9.5 3.6 12 2.4l2.5 1.2L12 4.8Z" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
