'use client'
/**
 * "Game modes" in the room lobby (pause menu → Online): the host starts a mode for
 * everyone — the arena modes on the map picked here — and the others suggest one (the
 * host gets a toast). Shows the round in progress and lets the host end it early.
 */
import { useState } from 'react'
import type { MapId } from '../engine/events'
import { arenaName, ARENAS, MODES, MODE_BY_ID, type ModeDef } from '../engine/net/modes/defs'
import { MAPS } from '../engine/worlds/defs'
import { playUi, useGameUi, useNet } from './context'
import { Button } from './controls'
import { useModeView } from './ModeHud'
import { AMBER, cx, formatTime, LABEL } from './theme'

/** Names short enough for the picker's pills. */
const ARENA_SHORT: Record<MapId, string> = {
  isle: 'The Isle', rift: 'Shadow Rift', frost: 'Frost Peak', volcanic: 'Volcanic Ruins', sky: 'Sky Isles', neon: 'Neon City', glitch: 'Glitch Grid',
}

const arenaColor = (map: MapId): string => (map === 'isle' ? AMBER : MAPS[map].swirl[1])

export function ModesSection() {
  const { game } = useGameUi()
  const view = useModeView()
  const players = useNet(s => s.players.length)
  const [arena, setArena] = useState<MapId>('isle')
  const modes = game.ctx.net.modes
  const { round } = view
  const running = round.phase === 'countdown' || round.phase === 'live'

  const start = (m: ModeDef) => {
    if (modes.start(m.id, m.arena ? arena : 'isle')) game.resume()
    else game.bus.emit('ui:toast', { kind: 'warning', title: `Could not start ${m.name}`, body: m.arena ? 'Wait until everyone has arrived in the room.' : 'Wait until everyone has arrived on the island.' })
  }
  const suggest = (m: ModeDef) => {
    const sent = modes.suggest(m.id)
    game.bus.emit('ui:toast', sent
      ? { kind: 'info', title: `${m.name} suggested`, body: `${view.hostName || 'The host'} picks the modes in this room.` }
      : { kind: 'warning', title: 'Please wait a moment', body: 'You can suggest again in a few seconds.' })
  }

  const card = (m: ModeDef) => {
    const enough = players >= m.minPlayers
    return (
      <div key={m.id} className="flex flex-col rounded-[4px] border border-[#F3EEE6]/10 bg-[#F3EEE6]/[0.03] px-4 py-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[14px] font-semibold text-[#F3EEE6]">{m.name}</span>
          <span className="shrink-0 text-[11px] text-[#F3EEE6]/40">
            {Math.round(m.duration / 60)} min · {m.minPlayers}+{m.pvp ? ' · PvP' : ''}
          </span>
        </div>
        <p className="mt-1 flex-1 text-[12px] leading-snug text-[#F3EEE6]/55">{m.blurb}</p>
        <div className="mt-2.5">
          {view.isHost ? (
            <Button size="sm" variant="primary" disabled={running || !enough} onClick={() => start(m)}>
              {!enough ? `Needs ${m.minPlayers} players` : m.arena ? `Start on ${ARENA_SHORT[arena]}` : 'Start'}
            </Button>
          ) : (
            <Button size="sm" disabled={running} onClick={() => suggest(m)}>
              Suggest
            </Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <section className="mt-7">
      <div className="mb-3 flex min-h-[20px] items-center justify-between gap-4 border-b border-[#F3EEE6]/10 pb-2.5">
        <h3 className={cx(LABEL, 'text-[10px] text-[#F3EEE6]/50')}>Game modes</h3>
        <span className="text-[12px] text-[#F3EEE6]/45">{view.isHost ? 'You are the host' : view.hostName ? `Host: ${view.hostName}` : ''}</span>
      </div>

      {running && round.mode && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-[4px] border border-[#F5B455]/25 bg-[#F5B455]/[0.06] px-4 py-3">
          <span className="text-[13px] text-[#F3EEE6]/85">
            Now playing <b className="font-semibold text-[#F5B455]">{MODE_BY_ID[round.mode].name}</b>
            {MODE_BY_ID[round.mode].arena ? ` on ${arenaName(round.map)}` : ''}
            {round.phase === 'live' ? ` · ${formatTime(view.left)} left` : ' · starting'}
            {view.me ? '' : ' · spectating'}
          </span>
          {view.isHost && (
            <Button size="sm" variant="danger" onClick={() => modes.stop()}>
              End round
            </Button>
          )}
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2">{MODES.filter(m => !m.arena).map(card)}</div>

      <div className="mb-2.5 mt-6 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h4 className={cx(LABEL, 'text-[10px] text-[#F3EEE6]/50')}>Arena modes</h4>
        <span className="text-[12px] text-[#F3EEE6]/45">
          {view.isHost ? 'Everyone travels to the arena you pick, and home again after the results.' : 'The host picks the arena. Everyone travels there for the round.'}
        </span>
      </div>
      {view.isHost && (
        <div role="radiogroup" aria-label="Arena" className="mb-3 flex flex-wrap gap-1.5">
          {ARENAS.map(map => {
            const on = map === arena
            return (
              <button
                key={map}
                type="button"
                role="radio"
                aria-checked={on}
                data-nav
                onClick={() => {
                  if (on) return
                  playUi(game, 'ui-toggle')
                  setArena(map)
                }}
                className={cx(
                  'flex h-8 cursor-pointer items-center gap-2 rounded-full border px-3 text-[12px] font-medium outline-none transition-[background-color,border-color,color,transform] duration-150 focus-visible:border-[#F3EEE6]/60 active:scale-95 [[data-touch=true]_&]:h-10',
                  on ? 'border-[#F5B455]/70 bg-[#F5B455]/15 text-[#F3EEE6]' : 'border-[#F3EEE6]/15 bg-[#F3EEE6]/[0.03] text-[#F3EEE6]/60 hover:border-[#F3EEE6]/35 hover:text-[#F3EEE6]',
                )}
              >
                <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: arenaColor(map), boxShadow: on ? `0 0 8px ${arenaColor(map)}` : undefined }} />
                {ARENA_SHORT[map]}
              </button>
            )
          })}
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-2">{MODES.filter(m => m.arena).map(card)}</div>
    </section>
  )
}
