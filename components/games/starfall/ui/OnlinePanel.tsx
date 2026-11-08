'use client'
/**
 * Title screen → Play Online. Before joining: your name and shirt colour,
 * Quick Join, a private room, the public room list and join-by-code. After
 * joining: the room (its code large for private rooms), who is in it, and
 * Start, which continues or begins the journey as usual.
 */
import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react'
import type { RoomInfo } from '../engine/types'
import { playUi, useGameUi, useNet } from './context'
import { Button, PanelHeader } from './controls'
import { RefreshIcon, UsersIcon } from './icons'
import { focusFirst, isQuietFocus } from './nav'
import { SHIRT_COLORS } from './netStore'
import { BigCode, CopyButton, linkTone, Occupancy, PlayerRows, roomKind, StatusDot } from './OnlineShared'
import { BackHint } from './Panel'
import { cx, LABEL } from './theme'

const NAME_MAX = 16
const CODE_LEN = 5
const ROOMS_REFRESH_MS = 12000

type Busy = 'quick' | 'create' | 'code' | `room:${string}` | 'leave' | null
interface InlineError {
  source: 'top' | 'code' | 'rooms' | 'room'
  message: string
}

export function OnlinePanel({ onBack, onStart, startHint }: { onBack: () => void; onStart: () => void; startHint: string }) {
  const room = useNet(s => s.room)
  return (
    <div>
      <PanelHeader eyebrow={room ? roomKind(room) : 'Online'} title={room ? room.name : 'Play online'} aside={<BackHint onBack={onBack} />} />
      {room ? <RoomLobby key={room.code} room={room} onStart={onStart} startHint={startHint} /> : <RoomBrowser />}
    </div>
  )
}

/* ── before joining ─────────────────────────────────────────────── */

function RoomBrowser() {
  const { net, game } = useGameUi()
  const [busy, setBusy] = useState<Busy>(null)
  const [error, setError] = useState<InlineError | null>(null)
  const [code, setCode] = useState('')

  const run = (kind: Exclude<Busy, null>, source: InlineError['source'], fn: () => Promise<unknown>) => {
    if (busy) return
    setBusy(kind)
    setError(null)
    fn()
      .then(() => playUi(game, 'ui-open'))
      .catch((err: unknown) => {
        playUi(game, 'ui-back')
        setError({ source, message: (err as Error)?.message || 'Could not join. Please try again.' })
      })
      .finally(() => setBusy(null))
  }

  const submitCode = () => {
    const c = code.trim()
    if (c.length !== CODE_LEN) {
      setError({ source: 'code', message: c ? `Room codes have ${CODE_LEN} characters — this one has ${c.length}.` : 'Type the code your friend shared.' })
      return
    }
    run('code', 'code', () => net.join(c.toLowerCase()))
  }

  return (
    <div>
      <p className="max-w-[520px] text-[14px] leading-relaxed text-[#F3EEE6]/65">
        Explore the island with friends or other islanders. Everyone keeps their own shards and progress; the island and the people on it are shared.
      </p>

      <Section label="You">
        <ProfileEditor />
      </Section>

      <div className="mt-7 flex flex-wrap gap-3">
        <Button variant="primary" autofocus disabled={!!busy} onClick={() => run('quick', 'top', () => net.quickJoin())}>
          {busy === 'quick' ? 'Joining…' : 'Quick join'}
        </Button>
        <Button disabled={!!busy} onClick={() => run('create', 'top', () => net.createPrivate())}>
          {busy === 'create' ? 'Creating…' : 'Create private room'}
        </Button>
      </div>
      {error?.source === 'top' && <ErrorLine message={error.message} />}

      <PublicRooms busy={busy} onJoin={r => run(`room:${r.code}`, 'rooms', () => net.join(r.code))} error={error?.source === 'rooms' ? error.message : null} />

      <Section label="Join with a code">
        <form
          className="flex flex-wrap items-center gap-3"
          onSubmit={e => {
            e.preventDefault()
            submitCode()
          }}
        >
          <input
            data-nav
            value={code}
            onChange={e => {
              setCode(e.target.value.replace(/[^a-z0-9]/gi, '').slice(0, CODE_LEN).toUpperCase())
              if (error?.source === 'code') setError(null)
            }}
            onKeyDown={e => {
              if (e.key !== 'Enter') return
              e.preventDefault()
              submitCode()
            }}
            maxLength={CODE_LEN}
            placeholder="ABCDE"
            aria-label="Room code"
            aria-invalid={error?.source === 'code'}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            enterKeyHint="go"
            className={cx(
              'h-11 w-[170px] rounded-[4px] border bg-[#F3EEE6]/[0.04] px-4 font-nacelle text-[20px] uppercase tracking-[0.32em] text-[#F3EEE6] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[#F3EEE6]/20',
              error?.source === 'code' ? 'border-[#E8664F]/70' : 'border-[#F3EEE6]/20 focus:border-[#F5B455]/80 focus:shadow-[0_0_0_3px_rgba(245,180,85,0.15)]',
            )}
          />
          <Button disabled={!!busy} onClick={submitCode}>
            {busy === 'code' ? 'Joining…' : 'Join'}
          </Button>
        </form>
        {error?.source === 'code' && <ErrorLine message={error.message} />}
      </Section>
    </div>
  )
}

function PublicRooms({ busy, onJoin, error }: { busy: Busy; onJoin: (r: RoomInfo) => void; error: string | null }) {
  const { net, game } = useGameUi()
  const [rooms, setRooms] = useState<RoomInfo[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const seq = useRef(0)

  const load = useEffectEvent(() => {
    const id = ++seq.current
    setLoading(true)
    net
      .listPublicRooms()
      .then(list => {
        if (id !== seq.current) return
        setRooms([...list].sort((a, b) => b.players - a.players || a.name.localeCompare(b.name)))
        setListError(null)
      })
      .catch((err: unknown) => {
        if (id === seq.current) setListError((err as Error)?.message || 'Could not reach the room list.')
      })
      .finally(() => {
        if (id === seq.current) setLoading(false)
      })
  })

  // Load on open, then keep the counts fresh while the panel is up.
  useEffect(() => {
    const first = setTimeout(() => load(), 0)
    const t = setInterval(() => load(), ROOMS_REFRESH_MS)
    return () => {
      clearTimeout(first)
      clearInterval(t)
      seq.current++
    }
  }, [])

  return (
    <Section
      label="Public rooms"
      aside={
        <button
          type="button"
          data-nav
          onMouseEnter={e => e.currentTarget.focus({ preventScroll: true })}
          onFocus={() => isQuietFocus() || playUi(game, 'ui-hover')}
          onClick={() => {
            playUi(game, 'ui-click')
            load()
          }}
          className="-my-1 inline-flex items-center gap-1.5 rounded-[3px] px-1.5 py-1 text-[11px] uppercase tracking-[0.16em] text-[#F3EEE6]/45 outline-none transition-colors hover:text-[#F3EEE6] focus:text-[#F5B455]"
        >
          <RefreshIcon className={cx('h-3.5 w-3.5', loading && 'animate-spin [animation-duration:900ms]')} />
          Refresh
        </button>
      }
    >
      {rooms === null && !listError ? (
        <ul aria-label="Loading rooms">
          {[0, 1, 2].map(i => (
            <li key={i} className="flex h-[52px] items-center gap-4 border-b border-[#F3EEE6]/[0.07] last:border-b-0">
              <span className="h-3 w-32 animate-pulse rounded-full bg-[#F3EEE6]/[0.07]" style={{ animationDelay: `${i * 120}ms` }} />
              <span className="ml-auto h-3 w-16 animate-pulse rounded-full bg-[#F3EEE6]/[0.07]" style={{ animationDelay: `${i * 120}ms` }} />
            </li>
          ))}
        </ul>
      ) : listError && !rooms?.length ? (
        <ErrorLine message={listError} />
      ) : rooms && rooms.length === 0 ? (
        <p className="py-3 text-[13px] leading-relaxed text-[#F3EEE6]/45">No public rooms are open right now. Quick join opens one for you.</p>
      ) : (
        <ul>
          {rooms!.map(r => {
            const full = r.players >= r.max
            const joining = busy === `room:${r.code}`
            return (
              <li key={r.code} className="flex min-h-[52px] items-center gap-4 border-b border-[#F3EEE6]/[0.07] last:border-b-0">
                <div className="min-w-0">
                  <div className="truncate text-[15px] text-[#F3EEE6]/90">{r.name}</div>
                  <div className="mt-0.5 text-[11px] uppercase tracking-[0.16em] text-[#F3EEE6]/35">{r.code}</div>
                </div>
                <Occupancy className="ml-auto" players={r.players} max={r.max} />
                <Button size="sm" className="w-[84px]" disabled={full || !!busy} onClick={() => onJoin(r)}>
                  {full ? 'Full' : joining ? 'Joining…' : 'Join'}
                </Button>
              </li>
            )
          })}
        </ul>
      )}
      {error && <ErrorLine message={error} />}
    </Section>
  )
}

/* ── profile ────────────────────────────────────────────────────── */

const cleanName = (s: string) => s.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, NAME_MAX)

function ProfileEditor() {
  const { net, game } = useGameUi()
  const stored = useNet(s => s.profile)
  const [draft, setDraft] = useState(stored.name)

  const commit = useEffectEvent(() => {
    const name = draft.trim()
    if (!name) {
      setDraft(stored.name)
      return
    }
    if (name !== stored.name) net.setProfile({ name })
  })

  // Debounced so typing doesn't send a presence update per keystroke.
  useEffect(() => {
    const t = setTimeout(() => commit(), 650)
    return () => clearTimeout(t)
  }, [draft])

  const colorIdx = SHIRT_COLORS.findIndex(c => c.toLowerCase() === stored.color.toLowerCase())
  const pick = (i: number) => {
    const c = SHIRT_COLORS[(i + SHIRT_COLORS.length) % SHIRT_COLORS.length]
    if (c === stored.color) return
    playUi(game, 'ui-hover')
    net.setProfile({ color: c })
  }

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
      <label className="relative block">
        <span className="sr-only">Your name</span>
        <input
          data-nav
          value={draft}
          onChange={e => setDraft(cleanName(e.target.value))}
          onBlur={() => commit()}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
            }
          }}
          maxLength={NAME_MAX}
          placeholder="Your name"
          autoComplete="nickname"
          spellCheck={false}
          enterKeyHint="done"
          className="h-11 w-[220px] rounded-[4px] border border-[#F3EEE6]/20 bg-[#F3EEE6]/[0.04] pl-4 pr-12 text-[15px] text-[#F3EEE6] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[#F3EEE6]/25 focus:border-[#F5B455]/80 focus:shadow-[0_0_0_3px_rgba(245,180,85,0.15)]"
        />
        <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] tabular-nums text-[#F3EEE6]/30">
          {NAME_MAX - draft.length}
        </span>
      </label>

      <div
        role="radiogroup"
        aria-label="Shirt colour"
        tabIndex={0}
        data-nav
        onKeyDown={e => {
          if (e.key === 'ArrowLeft') pick(colorIdx - 1)
          else if (e.key === 'ArrowRight') pick(colorIdx + 1)
          else return
          e.preventDefault()
        }}
        className="group/sw flex items-center gap-2 rounded-full p-1 outline-none focus-visible:shadow-[0_0_0_1px_rgba(245,180,85,0.7)]"
      >
        {SHIRT_COLORS.map((c, i) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={i === colorIdx}
            aria-label={`Shirt colour ${i + 1}`}
            tabIndex={-1}
            onClick={() => pick(i)}
            className={cx(
              'h-[26px] w-[26px] rounded-full transition-[transform,box-shadow] duration-150 ease-out hover:scale-110',
              i === colorIdx ? 'scale-110 shadow-[0_0_0_2px_#0B0F14,0_0_0_3.5px_#F3EEE6]' : 'shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)]',
            )}
            style={{ background: `radial-gradient(circle at 35% 30%, color-mix(in srgb, ${c} 75%, white), ${c} 60%)` }}
          />
        ))}
      </div>
    </div>
  )
}

/* ── after joining ──────────────────────────────────────────────── */

function RoomLobby({ room, onStart, startHint }: { room: RoomInfo; onStart: () => void; startHint: string }) {
  const { net, game } = useGameUi()
  const players = useNet(s => s.players)
  const status = useNet(s => s.status)
  const message = useNet(s => s.message)
  const ref = useRef<HTMLDivElement>(null)
  const [leaving, setLeaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const tone = linkTone(status, players)

  // Joining swaps the whole panel body; put focus on Start.
  useEffect(() => focusFirst(ref.current, '[data-autofocus]'), [])

  const leave = () => {
    if (leaving) return
    setLeaving(true)
    setError(null)
    net
      .leave()
      .catch((err: unknown) => setError((err as Error)?.message || 'Could not leave the room.'))
      .finally(() => setLeaving(false))
    playUi(game, 'ui-back')
  }

  return (
    <div ref={ref}>
      {room.public ? (
        <p className="max-w-[520px] text-[14px] leading-relaxed text-[#F3EEE6]/65">
          You are in a public room — anyone can drop in. Your shards and progress stay your own; the island is shared.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-4 rounded-[4px] border border-[#F5B455]/25 bg-[#F5B455]/[0.05] px-5 py-5">
          <div>
            <div className={cx(LABEL, 'text-[10px] text-[#F5B455]/90')}>Room code</div>
            <div className="mt-2.5">
              <BigCode code={room.code} />
            </div>
          </div>
          <div className="flex flex-col items-start gap-2.5">
            <CopyButton text={room.code.toUpperCase()} label="Copy code" />
            <span className="text-[12px] text-[#F3EEE6]/50">Share this code with friends</span>
          </div>
        </div>
      )}

      <Section label="Players" aside={<Occupancy players={Math.max(room.players, players.length)} max={room.max} />}>
        {players.length ? (
          <PlayerRows players={players} status={status} />
        ) : (
          <p className="py-2 text-[13px] text-[#F3EEE6]/45">Waiting for the room…</p>
        )}
        {players.length === 1 && (
          <p className="mt-3 flex items-center gap-2 text-[12px] text-[#F3EEE6]/40">
            <UsersIcon className="h-3.5 w-3.5" /> Nobody else is here yet{room.public ? '' : ' — send them the code'}.
          </p>
        )}
      </Section>

      {(status === 'connecting' || status === 'error') && (
        <div className="mt-4 flex items-center gap-2.5 text-[13px]" role="status">
          <StatusDot tone={tone} pulse={status === 'connecting'} />
          <span className={status === 'error' ? 'text-[#F3B3A6]' : 'text-[#F3EEE6]/60'}>
            {message || (status === 'error' ? 'Connection problem — trying again.' : 'Connecting…')}
          </span>
        </div>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Button variant="primary" autofocus onClick={onStart}>
          Start
        </Button>
        <Button variant="danger" disabled={leaving} onClick={leave}>
          {leaving ? 'Leaving…' : 'Leave room'}
        </Button>
        <span className="text-[12px] text-[#F3EEE6]/45">{startHint}</span>
      </div>
      {error && <ErrorLine message={error} />}
    </div>
  )
}

/* ── bits ───────────────────────────────────────────────────────── */

function Section({ label, aside, children }: { label: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex min-h-[20px] items-center justify-between gap-4 border-b border-[#F3EEE6]/10 pb-2.5">
        <h3 className={cx(LABEL, 'text-[10px] text-[#F3EEE6]/50')}>{label}</h3>
        {aside}
      </div>
      {children}
    </section>
  )
}

function ErrorLine({ message }: { message: string }) {
  return (
    <p role="alert" className="mt-3 flex items-start gap-2 text-[13px] leading-snug text-[#F3B3A6]">
      <span aria-hidden className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#E8664F]" />
      {message}
    </p>
  )
}
