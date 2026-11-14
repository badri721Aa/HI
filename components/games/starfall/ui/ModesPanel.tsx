'use client'
/**
 * "Game modes" in the room lobby (pause menu → Online): the host starts a mode for
 * everyone, the others suggest one (the host gets a toast). Shows the round in progress
 * and lets the host end it early.
 */
import { MODES, MODE_BY_ID, type ModeDef } from '../engine/net/modes/defs'
import { useGameUi, useNet } from './context'
import { Button } from './controls'
import { useModeView } from './ModeHud'
import { cx, formatTime, LABEL } from './theme'

export function ModesSection() {
  const { game } = useGameUi()
  const view = useModeView()
  const players = useNet(s => s.players.length)
  const modes = game.ctx.net.modes
  const { round } = view
  const running = round.phase === 'countdown' || round.phase === 'live'

  const start = (m: ModeDef) => {
    if (modes.start(m.id)) game.resume()
    else game.bus.emit('ui:toast', { kind: 'warning', title: `Could not start ${m.name}`, body: 'Wait until everyone has arrived on the island.' })
  }
  const suggest = (m: ModeDef) => {
    const sent = modes.suggest(m.id)
    game.bus.emit('ui:toast', sent
      ? { kind: 'info', title: `${m.name} suggested`, body: `${view.hostName || 'The host'} picks the modes in this room.` }
      : { kind: 'warning', title: 'Please wait a moment', body: 'You can suggest again in a few seconds.' })
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

      <div className="grid gap-2 sm:grid-cols-2">
        {MODES.map(m => {
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
                    {enough ? 'Start' : `Needs ${m.minPlayers} players`}
                  </Button>
                ) : (
                  <Button size="sm" disabled={running} onClick={() => suggest(m)}>
                    Suggest
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
