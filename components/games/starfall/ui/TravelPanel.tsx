'use client'
/**
 * Pause menu → Travel: the Map Manager. Every map with its boss and how it stands (awake, sealed
 * and what wakes it, or its boss beaten); an awake one is a click away, reached exactly as through
 * its arch. Travel waits while a boss fight, a cutscene or a game mode round is on, and says why.
 */
import { useState } from 'react'
import type { TravelEntry } from '../engine/Game'
import { playUi, useGameUi } from './context'
import { Button, PanelHeader } from './controls'
import { CrownIcon, LockIcon, PortalIcon, WarningIcon } from './icons'
import { BackHint } from './Panel'
import { cx, LABEL } from './theme'

export function TravelPanel({ onBack }: { onBack: () => void }) {
  const { game } = useGameUi()
  // The world is frozen while paused, so one snapshot is exact.
  const [info] = useState(() => game.getTravelInfo())
  const first = info.maps.find(m => m.open && !m.here)?.id

  const go = (m: TravelEntry) => {
    // Back into the game (this click is the gesture pointer lock needs), then through the arch.
    if (!game.travelTo(m.id)) playUi(game, 'ui-error')
  }

  return (
    <div>
      <PanelHeader eyebrow="Travel" title="Where to?" aside={<BackHint onBack={onBack} />} />
      <p className="max-w-[520px] text-[14px] leading-relaxed text-[#F3EEE6]/65">
        Step through any awakened arch from here. You arrive at the map’s entrance, just as if you had walked in.
      </p>

      {info.blocked && (
        <div role="status" className="mt-5 flex items-start gap-3 rounded-[4px] border border-[#F5B455]/30 bg-[#F5B455]/[0.07] px-4 py-3">
          <WarningIcon className="mt-px h-4 w-4 shrink-0 text-[#F5B455]" />
          <span className="text-[13px] leading-snug text-[#F3EEE6]/85">{info.blocked}</span>
        </div>
      )}

      <ul className="mt-5 flex flex-col gap-2">
        {info.maps.map(m => (
          <li
            key={m.id}
            className={cx(
              'flex min-h-[66px] items-center gap-4 rounded-[4px] border px-4 py-3',
              m.here ? 'border-[#F5B455]/35 bg-[#F5B455]/[0.06]' : 'border-[#F3EEE6]/10 bg-[#F3EEE6]/[0.03]',
            )}
          >
            <span
              aria-hidden
              className="h-3 w-3 shrink-0 rotate-45 rounded-[2px] border"
              style={m.open ? { background: m.color, borderColor: m.color, boxShadow: `0 0 12px ${m.color}88` } : { borderColor: `${m.color}99` }}
            />
            <span className="min-w-0 flex-1">
              <span className={cx('block text-[15px] font-medium leading-tight', m.open ? 'text-[#F3EEE6]' : 'text-[#F3EEE6]/60')}>{m.name}</span>
              <Status m={m} />
            </span>
            {m.here ? (
              <span className={cx(LABEL, 'shrink-0 text-[10px] text-[#F5B455]')}>You are here</span>
            ) : m.open ? (
              <Button size="sm" disabled={!!info.blocked} autofocus={m.id === first} onClick={() => go(m)}>
                Travel
              </Button>
            ) : (
              <span className={cx(LABEL, 'flex shrink-0 items-center gap-1.5 text-[10px] text-[#F3EEE6]/40')}>
                <LockIcon className="h-3.5 w-3.5" />
                Sealed
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** The second line: the island's role, a map's boss, or what wakes a sealed arch. */
function Status({ m }: { m: TravelEntry }) {
  const line = 'mt-1 flex items-start gap-1.5 text-[12px] leading-snug'
  if (!m.boss) return <span className={cx(line, 'text-[#F3EEE6]/50')}>Home: the shards, the lanterns and the Beacon</span>
  if (!m.open) return <span className={cx(line, 'text-[#F3EEE6]/45')}>{m.requirement}</span>
  if (m.defeated) {
    return (
      <span className={cx(line, 'text-[#F3EEE6]/55')}>
        <CrownIcon className="mt-px h-3.5 w-3.5 shrink-0 text-[#F5B455]" />
        {m.boss} defeated
      </span>
    )
  }
  return (
    <span className={cx(line, 'text-[#F3EEE6]/55')}>
      <PortalIcon className="mt-px h-3.5 w-3.5 shrink-0" style={{ color: m.color }} />
      The {m.boss} waits here
    </span>
  )
}
