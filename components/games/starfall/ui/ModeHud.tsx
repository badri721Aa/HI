'use client'
/**
 * Game-mode HUD for online rounds: the round bar (mode, clock, what to do), the
 * scoreboard, the announcement + countdown, the seeker's blindfold, the results
 * (winner, podium, stats) and the O key that opens Game modes. Everything renders
 * the host's round state as relayed by ctx.net.modes (the `mode:view` event).
 */
import { useEffect, useEffectEvent, useState, type CSSProperties } from 'react'
import { ARENA, LIVES, MODE_BY_ID, RINGS, ROLE_IT, ROLE_OUT, type Contestant, type ModeDef } from '../engine/net/modes/defs'
import type { ModeView } from '../engine/net/modes/Modes'
import { useBus, useGameUi, useNet, useUi, type GameUi } from './context'
import { KeyCap } from './controls'
import { isTextField } from './nav'
import { cx, formatTime, LABEL } from './theme'
import styles from './ui.module.css'

/** The round as last published by the engine. */
export function useModeView(): ModeView {
  const { game } = useGameUi()
  const [view, setView] = useState(() => game.ctx.net.modes.view)
  useBus('mode:view', setView)
  return view
}

/** Opens Game modes (pause menu → Online) from play. */
export function openModes({ game, store }: Pick<GameUi, 'game' | 'store'>): void {
  if (game.phase !== 'playing') return
  game.pause()
  store.setPausePanel('online')
}

const MODES_KEY = 'KeyO'

export function ModeLayer() {
  const { game, store } = useGameUi()
  const view = useModeView()
  const phase = useUi(s => s.phase)
  const inRoom = useNet(s => !!s.room)
  const playing = phase === 'playing'
  const { round, me } = view
  const running = round.phase === 'countdown' || round.phase === 'live'

  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.code !== MODES_KEY || e.repeat || e.ctrlKey || e.metaKey || e.altKey || isTextField(e.target as Element | null)) return
    if (!inRoom || game.phase !== 'playing') return
    e.preventDefault()
    openModes({ game, store })
  })
  useEffect(() => {
    const down = (e: KeyboardEvent) => onKey(e)
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [])

  if (!round.mode) return null
  const def = MODE_BY_ID[round.mode]
  return (
    <div className={cx('pointer-events-none absolute inset-0 z-[44] transition-opacity duration-300', playing ? 'opacity-100' : 'opacity-0')}>
      {running && <RoundBar view={view} def={def} />}
      {running && <Scoreboard view={view} def={def} />}
      {round.phase === 'countdown' && <Announcement view={view} def={def} />}
      {round.phase === 'live' && round.elapsed < 1.1 && me && <GoFlash />}
      {round.phase === 'live' && round.mode === 'hide' && me?.role === ROLE_IT && round.hold > 0 && <Blindfold view={view} />}
      {round.phase === 'results' && <Results view={view} def={def} />}
    </div>
  )
}

/* ── during the round ───────────────────────────────────────────── */

function RoundBar({ view, def }: { view: ModeView; def: ModeDef }) {
  const { round, me } = view
  const status = statusLine(view)
  const urgent = round.phase === 'live' && view.left <= 10
  return (
    <div className="absolute left-1/2 top-[clamp(70px,10vh,92px)] flex w-[min(520px,86vw)] -translate-x-1/2 flex-col items-center gap-1 text-center max-sm:top-[112px]">
      <div className="flex items-baseline gap-3">
        <span className={cx(LABEL, 'text-[10px] text-[#F5B455]')}>{def.name}</span>
        <span className={cx('font-nacelle text-[26px] font-semibold tabular-nums leading-none', urgent ? 'text-[#E8664F]' : 'text-[#F3EEE6]')}>
          {round.phase === 'countdown' ? formatTime(def.duration) : formatTime(view.left)}
        </span>
      </div>
      <div
        className={cx(
          'rounded-full border px-3 py-1 text-[12px] font-medium leading-tight backdrop-blur-[2px]',
          status.tone === 'hot' ? 'border-[#E8664F]/50 bg-[#E8664F]/20 text-[#FFD9CF]' : 'border-[#F3EEE6]/12 bg-[#0B0F14]/70 text-[#F3EEE6]/85',
        )}
      >
        {status.text}
      </div>
      {!me && <div className="text-[11px] text-[#F3EEE6]/55">Spectating — you will join the next round</div>}
    </div>
  )
}

function statusLine({ round, me }: ModeView): { text: string; tone?: 'hot' } {
  const it = round.players.find(p => p.role === ROLE_IT)
  const live = round.phase === 'live'
  if (!me) return { text: `${round.players.length} playing` }
  switch (round.mode) {
    case 'tag':
      if (me.role === ROLE_IT) return { text: 'You are It — tag someone!', tone: 'hot' }
      return { text: it ? `Run! ${it.name} is It` : 'Get ready' }
    case 'knockout':
      if (me.role === ROLE_OUT) return { text: 'Knocked out — watch the rest' }
      return { text: `Lives ${'●'.repeat(me.lives)}${'○'.repeat(Math.max(0, LIVES - me.lives))} · ${me.score} KO` }
    case 'race':
      if (me.done >= 0) return { text: `Finished in ${clock(me.done)}` }
      return { text: `Ring ${Math.min(me.score + 1, RINGS.length)} of ${RINGS.length}${me.score === RINGS.length - 1 ? ' — the finish!' : ''}` }
    case 'koth':
      return { text: live ? `Hold the circle alone · it moves in ${Math.ceil(round.hillLeft)}s` : 'Head for the glowing circle on the summit' }
    case 'hide': {
      const hiders = round.players.filter(p => p.role !== ROLE_IT).length
      if (me.role === ROLE_IT) return { text: round.hold > 0 ? 'Counting…' : `Find them — ${hiders} still hidden`, tone: 'hot' }
      return { text: live && round.hold <= 0 ? `Stay hidden — ${round.players.length - hiders} seeking` : 'Hide! The seeker is counting' }
    }
    default:
      return { text: '' }
  }
}

/** 83.4 → "1:23.4". */
function clock(s: number): string {
  return `${formatTime(s)}.${Math.floor((s % 1) * 10)}`
}

/** A player's score as the mode reads it. */
function scoreText(mode: ModeDef, p: Contestant): string {
  switch (mode.score) {
    case 'time':
      return formatTime(p.score)
    case 'kos':
      return p.role === ROLE_OUT ? `out · ${p.score} KO` : `${'●'.repeat(p.lives)} · ${p.score} KO`
    case 'rings':
      return p.done >= 0 ? clock(p.done) : `${p.score}/${RINGS.length}`
    case 'points':
      return String(Math.floor(p.score))
    case 'tags':
      return p.role === ROLE_IT ? (p.score ? `seeker · ${p.score}` : 'seeker') : 'hidden'
  }
}

/** Standings while the round runs (best first). */
function standings(def: ModeDef, players: Contestant[]): Contestant[] {
  const list = players.slice()
  switch (def.score) {
    case 'time':
      return list.sort((a, b) => a.score - b.score)
    case 'kos':
      return list.sort((a, b) => b.lives - a.lives || b.score - a.score)
    case 'rings':
      return list.sort((a, b) => (a.done >= 0 ? a.done : 1e6 - a.score) - (b.done >= 0 ? b.done : 1e6 - b.score))
    case 'tags':
      return list.sort((a, b) => Number(a.role === ROLE_IT) - Number(b.role === ROLE_IT) || b.score - a.score)
    default:
      return list.sort((a, b) => b.score - a.score)
  }
}

function Scoreboard({ view, def }: { view: ModeView; def: ModeDef }) {
  const rows = standings(def, view.round.players)
  return (
    <div className="absolute right-[clamp(16px,2.4vw,32px)] top-[clamp(200px,32vh,280px)] w-[min(230px,44vw)] overflow-hidden rounded-[4px] border border-[#F3EEE6]/10 bg-[#0B0F14]/72 py-1.5 max-sm:top-[170px]">
      {rows.map((p, i) => (
        <div
          key={p.id}
          className={cx(
            'flex items-center gap-2 px-3 py-1 text-[12px] leading-tight max-sm:[&:nth-child(n+4)]:hidden',
            p.id === view.selfId ? 'text-[#F5B455]' : 'text-[#F3EEE6]/85',
            p.role === ROLE_OUT && 'opacity-45',
          )}
        >
          <span className="w-4 shrink-0 tabular-nums text-[#F3EEE6]/40">{i + 1}</span>
          {p.role === ROLE_IT && <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-[#E8664F] shadow-[0_0_8px_#E8664F]" />}
          <span className="min-w-0 flex-1 truncate font-medium">{p.id === view.selfId ? 'You' : p.name}</span>
          <span className="shrink-0 tabular-nums text-[#F3EEE6]/70">{scoreText(def, p)}</span>
        </div>
      ))}
    </div>
  )
}

function Announcement({ view, def }: { view: ModeView; def: ModeDef }) {
  const n = Math.max(1, view.left)
  const count = view.round.players.length
  const where = view.round.mode === 'knockout' ? `On the floating arena, ${Math.round(ARENA.y)} m up` : `${count} ${count === 1 ? 'player' : 'players'}`
  return (
    <div className="absolute inset-x-0 top-[24%] flex flex-col items-center px-6 text-center">
      <div className={cx(LABEL, 'text-[#F5B455]')}>Game mode · {where}</div>
      <h2 className="mt-2 font-nacelle text-[clamp(40px,7vw,72px)] font-semibold leading-none tracking-[-0.01em] text-[#F3EEE6] [text-shadow:0_4px_30px_rgba(0,0,0,0.6)]">
        {def.name}
      </h2>
      <p className="mt-3 max-w-[460px] text-[15px] leading-relaxed text-[#F3EEE6]/80 [text-shadow:0_2px_12px_rgba(0,0,0,0.8)]">{def.blurb}</p>
      <div className={cx('mt-6 font-nacelle text-[64px] font-semibold tabular-nums leading-none text-[#F5B455] [text-shadow:0_0_40px_rgba(245,180,85,0.45)]')}>
        {n}
      </div>
      {!view.me && <p className="mt-4 text-[13px] text-[#F3EEE6]/60">This round started without you — you are spectating.</p>}
    </div>
  )
}

function GoFlash() {
  return (
    <div className="absolute inset-x-0 top-[30%] flex justify-center">
      <div className={cx(styles.rise, 'font-nacelle text-[clamp(56px,9vw,96px)] font-semibold leading-none text-[#F5B455] [text-shadow:0_0_50px_rgba(245,180,85,0.5)]')}>Go!</div>
    </div>
  )
}

/** The seeker sees nothing while the hiders scatter. */
function Blindfold({ view }: { view: ModeView }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0B0F14]/[0.97] px-6 text-center">
      <div className={cx(LABEL, 'text-[#E8664F]')}>You are the seeker</div>
      <div className="mt-4 font-nacelle text-[88px] font-semibold tabular-nums leading-none text-[#F3EEE6]">{view.hold}</div>
      <p className="mt-4 max-w-[380px] text-[14px] leading-relaxed text-[#F3EEE6]/65">Eyes shut while the others hide. Then find them — every hider you touch seeks with you.</p>
    </div>
  )
}

/* ── results ────────────────────────────────────────────────────── */

function Results({ view, def }: { view: ModeView; def: ModeDef }) {
  const { round, selfId } = view
  const byId = new Map(round.players.map(p => [p.id, p]))
  const order = round.podium.map(id => byId.get(id)).filter((p): p is Contestant => !!p)
  const winners = order.slice(0, round.winners)
  const name = (p: Contestant) => (p.id === selfId ? 'You' : p.name)
  const iWon = winners.some(p => p.id === selfId)
  const headline =
    !winners.length
      ? 'No winner this time'
      : round.mode === 'hide' && winners[0].role !== ROLE_IT
        ? iWon ? 'You survived — the hiders win!' : 'The hiders win!'
        : iWon ? 'You win!' : `${winners[0].name} wins!`
  const podium = order.slice(0, 3)
  // 2nd, 1st, 3rd from left to right.
  const steps = [podium[1], podium[0], podium[2]]
  const heights = ['h-[46px]', 'h-[70px]', 'h-[30px]']
  const places = [2, 1, 3]

  return (
    <div className="absolute inset-x-0 top-[clamp(70px,13vh,130px)] flex justify-center px-4">
      <div className={cx(styles.rise, 'relative w-[min(520px,100%)] rounded-[4px] border border-[#F3EEE6]/10 bg-[#0B0F14]/[0.9] px-6 pb-5 pt-5 shadow-[0_24px_80px_-24px_rgba(0,0,0,0.7)]')}>
        <span aria-hidden className="absolute left-0 top-0 h-px w-16 bg-[#F5B455]" />
        <div className={cx(LABEL, 'text-[10px] text-[#F5B455]')}>Results · {def.name}</div>
        <h2 className="mt-2 font-nacelle text-[30px] font-semibold leading-tight text-[#F3EEE6]">{headline}</h2>
        {round.mode === 'hide' && winners.length > 1 && <p className="mt-1 text-[13px] text-[#F3EEE6]/60">{winners.map(name).join(', ')}</p>}

        <div className="mt-5 flex items-end justify-center gap-3">
          {steps.map((p, i) =>
            p ? (
              <div key={p.id} className="flex w-[30%] flex-col items-center" style={{ '--d': `${120 + i * 90}ms` } as CSSProperties}>
                <span className={cx('max-w-full truncate text-[13px] font-semibold', p.id === selfId ? 'text-[#F5B455]' : 'text-[#F3EEE6]')}>{name(p)}</span>
                <span className="mb-1.5 text-[11px] tabular-nums text-[#F3EEE6]/55">{scoreText(def, p)}</span>
                <div className={cx('flex w-full items-start justify-center rounded-t-[3px] border border-b-0 pt-1.5 font-nacelle text-[18px] font-semibold', heights[i], places[i] === 1 ? 'border-[#F5B455]/50 bg-[#F5B455]/20 text-[#F5B455]' : 'border-[#F3EEE6]/15 bg-[#F3EEE6]/[0.06] text-[#F3EEE6]/70')}>
                  {places[i]}
                </div>
              </div>
            ) : (
              <div key={`empty-${i}`} className="w-[30%]" />
            ),
          )}
        </div>
        <div className="border-t border-[#F3EEE6]/12" />

        {order.length > 3 && (
          <div className="mt-3 flex flex-col gap-1">
            {order.slice(3).map((p, i) => (
              <div key={p.id} className="flex items-center gap-3 text-[12px] text-[#F3EEE6]/70">
                <span className="w-4 tabular-nums text-[#F3EEE6]/40">{i + 4}</span>
                <span className="min-w-0 flex-1 truncate">{name(p)}</span>
                <span className="tabular-nums">{scoreText(def, p)}</span>
              </div>
            ))}
          </div>
        )}
        <p className="mt-4 text-[12px] text-[#F3EEE6]/45">Back to free roam in {view.left}s{view.isHost ? ' · press O to pick the next mode' : ''}</p>
      </div>
    </div>
  )
}

/** Small HUD button beside the room chip: opens Game modes. */
export function ModesChip() {
  const { game, store, touch } = useGameUi()
  const view = useModeView()
  const live = view.round.phase === 'countdown' || view.round.phase === 'live'
  if (live) return null
  return (
    <button
      type="button"
      onClick={() => openModes({ game, store })}
      className="pointer-events-auto flex h-[30px] items-center gap-2 rounded-full border border-[#F3EEE6]/15 bg-[#0B0F14]/70 pl-3 pr-1.5 text-[12px] font-medium text-[#F3EEE6]/85 transition-colors hover:border-[#F5B455]/50 hover:text-[#F3EEE6]"
    >
      Game modes
      {!touch && <KeyCap>O</KeyCap>}
    </button>
  )
}
