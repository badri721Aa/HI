'use client'
/** Pieces shared by the Online screen, the pause menu and the in-game overlays. */
import { useEffect, useState } from 'react'
import type { NetStatus, RoomInfo } from '../engine/types'
import { Chip } from './controls'
import { CheckIcon, CopyIcon, SignalIcon } from './icons'
import type { PlayerView } from './netStore'
import { AMBER, cx, GOOD, HEART, LABEL } from './theme'

export type Tone = 'good' | 'warn' | 'bad' | 'idle'

export const TONE_COLOR: Record<Tone, string> = { good: GOOD, warn: AMBER, bad: HEART, idle: 'rgba(243,238,230,0.35)' }

/** Overall link health: amber while connecting or when anyone is only reachable through the relay. */
export function linkTone(status: NetStatus, players: PlayerView[]): Tone {
  if (status === 'error') return 'bad'
  if (status === 'connecting') return 'warn'
  if (status !== 'online') return 'idle'
  return players.some(p => !p.self && !p.direct) ? 'warn' : 'good'
}

export function StatusDot({ tone, pulse, className }: { tone: Tone; pulse?: boolean; className?: string }) {
  const color = TONE_COLOR[tone]
  return (
    <span aria-hidden className={cx('relative inline-block h-2 w-2 shrink-0', className)}>
      {pulse && <span className="absolute inset-0 animate-ping rounded-full opacity-60" style={{ background: color }} />}
      <span className="absolute inset-0 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}66` }} />
    </span>
  )
}

/** Shirt-colour dot for a player. */
export function ColorDot({ color, className }: { color: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cx('inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-[#F3EEE6]/35', className)}
      style={{ background: color }}
    />
  )
}

/** A player's name in their colour, lifted toward white so dark shirts stay readable on ink. */
export function nameColor(color: string): string {
  return `color-mix(in srgb, ${color} 62%, #F3EEE6)`
}

export function roomKind(room: Pick<RoomInfo, 'public'>): string {
  return room.public ? 'Public room' : 'Private room'
}

/** Ping → signal bars. */
function signalLevel(p: PlayerView): number {
  if (p.ping < 0) return p.direct ? 2 : 1
  if (p.ping < 90) return 3
  if (p.ping < 200) return 2
  return 1
}

/** Direct / relay badge with ping and bars. */
export function LinkInfo({ player, compact }: { player: PlayerView; compact?: boolean }) {
  const tone: Tone = player.direct ? (player.ping >= 200 ? 'warn' : 'good') : 'warn'
  return (
    <span className="flex items-center gap-2.5 text-[12px] tabular-nums">
      {!compact && (
        <span className={cx(LABEL, 'text-[9.5px] tracking-[0.18em]')} style={{ color: TONE_COLOR[tone] }}>
          {player.direct ? 'Direct' : 'Relay'}
        </span>
      )}
      <span className="w-[46px] text-right text-[#F3EEE6]/60">{player.ping >= 0 ? `${player.ping} ms` : '—'}</span>
      <SignalIcon level={signalLevel(player)} className="h-3.5 w-3.5" style={{ color: TONE_COLOR[tone] }} />
    </span>
  )
}

/** Rows of players: you first, then everyone else. */
export function PlayerRows({ players, status, compact }: { players: PlayerView[]; status: NetStatus; compact?: boolean }) {
  return (
    <ul className="flex flex-col">
      {players.map(p => (
        <li key={p.id} className="flex min-h-[40px] items-center gap-3 border-b border-[#F3EEE6]/[0.07] last:border-b-0">
          <ColorDot color={p.color} />
          <span className="min-w-0 truncate text-[14px] font-medium" style={{ color: nameColor(p.color) }}>
            {p.name}
          </span>
          {p.self && (
            <span className={cx(LABEL, 'rounded-[3px] border border-[#F3EEE6]/15 px-1.5 py-[2px] text-[9px] tracking-[0.16em] text-[#F3EEE6]/50')}>You</span>
          )}
          <span className="ml-auto pl-3">
            {p.self ? (
              <span className="text-[12px] text-[#F3EEE6]/45">{status === 'online' ? 'Connected' : status === 'connecting' ? 'Connecting…' : status === 'error' ? 'Connection problem' : 'Offline'}</span>
            ) : (
              <LinkInfo player={p} compact={compact} />
            )}
          </span>
        </li>
      ))}
    </ul>
  )
}

/** "3 / 8" with a tiny fill bar. */
export function Occupancy({ players, max, className }: { players: number; max: number; className?: string }) {
  const full = players >= max
  return (
    <span className={cx('flex items-center gap-2.5 text-[13px] tabular-nums', className)}>
      <span className="relative h-[3px] w-10 overflow-hidden rounded-full bg-[#F3EEE6]/12">
        <span className={cx('absolute inset-y-0 left-0 rounded-full', full ? 'bg-[#E8664F]' : 'bg-[#F5B455]')} style={{ width: `${Math.min(100, (players / Math.max(1, max)) * 100)}%` }} />
      </span>
      <span className={full ? 'text-[#F3B3A6]' : 'text-[#F3EEE6]/80'}>
        {players}
        <span className="text-[#F3EEE6]/40"> / {max}</span>
      </span>
    </span>
  )
}

/** Copies text, falling back to a hidden textarea where the async clipboard is unavailable (http, old browsers). */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* try the fallback */
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch {
    return false
  }
}

/** Copy button with a short "Copied" confirmation. */
export function CopyButton({ text, label = 'Copy', autofocus }: { text: string; label?: string; autofocus?: boolean }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  useEffect(() => {
    if (state === 'idle') return
    const t = setTimeout(() => setState('idle'), 1800)
    return () => clearTimeout(t)
  }, [state])
  return (
    <Chip nav autofocus={autofocus} tone={state === 'copied' ? 'good' : undefined} onClick={() => void copyText(text).then(ok => setState(ok ? 'copied' : 'failed'))}>
      {state === 'copied' ? <CheckIcon className="h-3.5 w-3.5" /> : <CopyIcon className="h-3.5 w-3.5" />}
      <span aria-live="polite">{state === 'copied' ? 'Copied' : state === 'failed' ? 'Select and copy' : label}</span>
    </Chip>
  )
}

/** The room code set large, for reading out or copying. */
export function BigCode({ code }: { code: string }) {
  return (
    <span className="select-text font-nacelle text-[clamp(38px,5vw,54px)] font-semibold uppercase leading-none tracking-[0.2em] text-[#F3EEE6] [text-shadow:0_0_24px_rgba(245,180,85,0.25)]">
      {code}
    </span>
  )
}
