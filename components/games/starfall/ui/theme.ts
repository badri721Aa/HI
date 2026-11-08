/** Design tokens and small formatting helpers shared by every Starfall screen. */

export const INK = '#0B0F14'
export const AMBER = '#F5B455'
export const TEXT = '#F3EEE6'
export const HEART = '#E8664F'

/** Joins truthy class names. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

/** 75 → "1:15", 3725 → "1:02:05". */
export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  const ss = String(r).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/** Small tracked uppercase label. */
export const LABEL = 'text-[11px] font-medium uppercase tracking-[0.24em]'

/** Healthy connection. */
export const GOOD = '#8FCB7E'

/** True in the standalone static site (apps/starfall-web defines it), which has no arcade to link back to. */
export const STANDALONE = process.env.NEXT_PUBLIC_STARFALL_STANDALONE === '1'
