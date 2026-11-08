'use client'
/**
 * In-play multiplayer UI: the connection chip (lives in the HUD's left column),
 * the chat log + input (bottom-left), the player list (hold Tab) and the
 * keyboard shortcuts — Enter/T chat, Tab players, 1–4 emotes.
 */
import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react'
import type { GestureName } from '../engine/types'
import { playUi, useGameUi, useNet, useUi } from './context'
import { KeyCap } from './controls'
import { ChatIcon, UsersIcon, WaveIcon } from './icons'
import { isTextField } from './nav'
import { CHAT_MAX, type ChatLine } from './netStore'
import { linkTone, nameColor, Occupancy, PlayerRows, roomKind, StatusDot, TONE_COLOR } from './OnlineShared'
import { cx, LABEL } from './theme'
import styles from './ui.module.css'

export const EMOTES: Array<{ name: GestureName; label: string; key: string }> = [
  { name: 'wave', label: 'Wave', key: '1' },
  { name: 'cheer', label: 'Cheer', key: '2' },
  { name: 'point', label: 'Point', key: '3' },
  { name: 'shrug', label: 'Shrug', key: '4' },
]
const EMOTE_BY_CODE: Record<string, GestureName> = Object.fromEntries(
  EMOTES.flatMap(e => [[`Digit${e.key}`, e.name], [`Numpad${e.key}`, e.name]]),
)

/* ── connection chip ────────────────────────────────────────────── */

/** Room code, head count and link health. On touch it also carries the chat / emote / player-list buttons. */
export function NetChip() {
  const { touch } = useGameUi()
  const room = useNet(s => s.room)
  const lastRoom = useNet(s => s.lastRoom)
  const status = useNet(s => s.status)
  const players = useNet(s => s.players)
  // Between rooms (switching, rejoining) the last one stays up as "Connecting"; a join that failed
  // for good (evicted, refused) has nothing left to show.
  const shown = room ?? (status === 'connecting' ? lastRoom : null)
  if (!shown) return null

  const tone = room ? linkTone(status, players) : 'warn'
  const note =
    status === 'error' ? 'Offline' : status === 'connecting' ? 'Connecting' : tone === 'warn' ? 'Relay' : null
  const count = Math.max(players.length, room?.players ?? 0)

  return (
    // Phones: the compass drops to the second row, so the chip sits just below it (the objective moves down).
    <div className="mt-3 flex items-center gap-2 max-sm:absolute max-sm:left-0 max-sm:top-[92px] max-sm:mt-0">
      <ChipBody
        code={shown.code}
        count={room ? count : null}
        max={shown.max}
        tone={tone}
        note={note}
        pulse={status === 'connecting'}
        interactive={touch && !!room}
      />
      {touch && room && <TouchOnlineButtons />}
    </div>
  )
}

function ChipBody({
  code,
  count,
  max,
  tone,
  note,
  pulse,
  interactive,
}: {
  code: string
  count: number | null
  max: number
  tone: ReturnType<typeof linkTone>
  note: string | null
  pulse: boolean
  interactive: boolean
}) {
  const { net, game } = useGameUi()
  const listOpen = useNet(s => s.listOpen)
  const label = `Room ${code.toUpperCase()}${count !== null ? `, ${count} of ${max} players` : ''}${note ? `, ${note}` : ''}`
  const body = (
    <>
      <StatusDot tone={tone} pulse={pulse} />
      {/* On phones the touch chip drops the code (it's in the player list it opens) to leave room for its buttons. */}
      <span className={cx('font-semibold tracking-[0.18em] text-[#F3EEE6]/90', interactive && 'max-sm:hidden')}>{code.toUpperCase()}</span>
      {count !== null && (
        <>
          <span aria-hidden className={cx('h-3 w-px bg-[#F3EEE6]/20', interactive && 'max-sm:hidden')} />
          <span className="flex items-center gap-1.5 tabular-nums text-[#F3EEE6]/85">
            <UsersIcon className="h-3 w-3 text-[#F3EEE6]/55" />
            <span>
              {count}
              <span className="text-[#F3EEE6]/40"> / {max}</span>
            </span>
          </span>
        </>
      )}
      {note && (
        <span className="text-[10px] font-semibold tracking-[0.16em]" style={{ color: TONE_COLOR[tone] }}>
          {note}
        </span>
      )}
    </>
  )
  const cls = 'flex h-7 items-center gap-2 rounded-full border border-[#F3EEE6]/12 bg-[#0B0F14]/70 pl-2.5 pr-3 text-[11px] uppercase shadow-[0_4px_16px_-6px_rgba(0,0,0,0.5)]'
  if (!interactive) {
    return (
      <div role="status" aria-label={label} className={cls}>
        {body}
      </div>
    )
  }
  return (
    <button
      type="button"
      aria-label={`${label}. Show players`}
      aria-pressed={listOpen}
      onPointerDown={e => {
        e.preventDefault()
        playUi(game, 'ui-click')
        net.setPlayerList(!listOpen)
      }}
      className={cx(cls, 'pointer-events-auto touch-none', listOpen && 'border-[#F5B455]/60')}
    >
      {body}
    </button>
  )
}

/** Touch has no keyboard: chat and emotes get buttons beside the chip. */
function TouchOnlineButtons() {
  const { net, game } = useGameUi()
  const [emotesOpen, setEmotesOpen] = useState(false)
  const btn = 'pointer-events-auto grid h-8 w-8 touch-none place-items-center rounded-full border border-[#F3EEE6]/20 bg-[#0B0F14]/55 text-[#F3EEE6]/85 active:bg-[#F5B455] active:text-[#0B0F14]'
  return (
    <div className="relative flex items-center gap-2">
      <button
        type="button"
        aria-label="Chat"
        className={btn}
        onPointerDown={e => {
          e.preventDefault()
          playUi(game, 'ui-open')
          setEmotesOpen(false)
          net.openChat()
        }}
      >
        <ChatIcon className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label="Emotes"
        aria-expanded={emotesOpen}
        className={cx(btn, emotesOpen && 'border-[#F5B455]/70 text-[#F5B455]')}
        onPointerDown={e => {
          e.preventDefault()
          playUi(game, 'ui-click')
          setEmotesOpen(v => !v)
        }}
      >
        <WaveIcon className="h-4 w-4" />
      </button>
      {emotesOpen && (
        // A narrow solid column: stays in the left half, clear of the toasts, and cleanly covers the objective while open.
        <div className={cx(styles.prompt, 'absolute left-0 top-10 z-10 flex w-[112px] flex-col gap-0.5 rounded-[6px] border border-[#F3EEE6]/12 bg-[#0B0F14]/90 p-1 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.7)]')}>
          {EMOTES.map(e => (
            <button
              key={e.name}
              type="button"
              className="pointer-events-auto h-9 touch-none rounded-[4px] px-3 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-[#F3EEE6]/90 active:bg-[#F5B455] active:text-[#0B0F14]"
              onPointerDown={ev => {
                ev.preventDefault()
                net.emote(e.name)
                setEmotesOpen(false)
              }}
            >
              {e.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── chat, player list, shortcuts ───────────────────────────────── */

export function OnlineLayer() {
  const { net } = useGameUi()
  const phase = useUi(s => s.phase)
  const room = useNet(s => s.room)
  const chatOpen = useNet(s => s.chatOpen)
  const listOpen = useNet(s => s.listOpen)
  const playing = phase === 'playing'

  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    if (isTextField(e.target as Element | null) || phase !== 'playing') return
    const inRoom = !!net.get().room
    if (inRoom && !e.repeat && (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'KeyT')) {
      // Capture phase: the engine never sees this Enter (it would also count as "interact").
      e.preventDefault()
      e.stopPropagation()
      net.openChat()
      return
    }
    if (inRoom && e.code === 'Tab') {
      e.preventDefault()
      net.setPlayerList(true)
      return
    }
    const emote = EMOTE_BY_CODE[e.code]
    if (emote && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) net.emote(emote)
  })

  useEffect(() => {
    const down = (e: KeyboardEvent) => onKeyDown(e)
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Tab' && !isTextField(e.target as Element | null)) net.setPlayerList(false)
    }
    const blur = () => net.setPlayerList(false)
    window.addEventListener('keydown', down, true)
    window.addEventListener('keyup', up, true)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down, true)
      window.removeEventListener('keyup', up, true)
      window.removeEventListener('blur', blur)
    }
  }, [net])

  // Only in play: dialogs sit where the chat log does (bottom of the screen), so the log steps aside for them.
  return (
    <div className={cx('pointer-events-none absolute inset-0 z-[45] transition-opacity duration-300', playing ? 'opacity-100' : 'opacity-0')}>
      {room && <ChatPanel open={chatOpen && playing} />}
      {room && listOpen && playing && <PlayerListOverlay />}
    </div>
  )
}

/* ── chat ───────────────────────────────────────────────────────── */

const LOG_IDLE = 6
const LOG_OPEN = 12

function ChatPanel({ open }: { open: boolean }) {
  const { touch } = useGameUi()
  const lines = useNet(s => s.chat)
  const shown = open ? lines.slice(-LOG_OPEN) : lines.filter(l => !l.expired).slice(-LOG_IDLE)
  return (
    <div
      className={cx(
        'absolute flex w-[min(420px,calc(100vw-32px))] flex-col items-start',
        touch
          ? 'bottom-[calc(env(safe-area-inset-bottom)+196px)] left-[calc(env(safe-area-inset-left)+16px)]'
          : 'bottom-[clamp(20px,4vh,36px)] left-[clamp(16px,2.4vw,32px)]',
      )}
    >
      <ul className="flex w-full flex-col items-start gap-1" aria-live="polite" aria-label="Chat">
        {shown.map(l => (
          <ChatRow key={l.key} line={l} fading={!open && l.leaving} />
        ))}
        {open && shown.length === 0 && <li className={cx(styles.hudText, 'px-1 pb-1 text-[13px] text-[#F3EEE6]/50')}>Say hello to the room.</li>}
      </ul>
      {open && <ChatInput />}
    </div>
  )
}

function ChatRow({ line, fading }: { line: ChatLine; fading: boolean }) {
  return (
    <li
      className={cx(
        styles.chatLine,
        'max-w-full rounded-[3px] px-2.5 py-[5px] text-[13px] leading-snug transition-opacity duration-700 ease-in',
        line.self ? 'bg-[#2A2116]/70' : 'bg-[#0B0F14]/55',
        fading ? 'opacity-0' : 'opacity-100',
      )}
    >
      {line.system ? (
        <span className="flex items-center gap-2 text-[#F3EEE6]/60">
          <span aria-hidden className="h-1 w-1 shrink-0 rounded-full bg-[#F5B455]/80" />
          <span className="break-words">{line.text}</span>
        </span>
      ) : (
        <span className="break-words text-[#F3EEE6]/90">
          <span className="font-semibold" style={{ color: nameColor(line.color) }}>
            {line.name}
          </span>
          <span className="text-[#F3EEE6]/40">: </span>
          {line.text}
        </span>
      )}
    </li>
  )
}

function ChatInput() {
  const { net, touch } = useGameUi()
  const [text, setText] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  /** Set once Enter / Esc closed the chat, so the blur that follows isn't treated as "clicked away". */
  const closing = useRef(false)

  // Layout effect: on touch the focus must land inside the tap for the on-screen keyboard to open.
  useLayoutEffect(() => {
    ref.current?.focus({ preventScroll: true })
  }, [])

  const send = () => {
    closing.current = true
    net.sendChat(text)
    net.closeChat(true)
  }
  const left = CHAT_MAX - text.length

  return (
    <div className={cx(styles.prompt, 'pointer-events-auto mt-2 w-full')}>
      <div className="flex h-11 items-center gap-2.5 rounded-[4px] border border-[#F5B455]/55 bg-[#0B0F14]/88 pl-3 pr-2 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.7),0_0_0_3px_rgba(245,180,85,0.10)]">
        <ChatIcon className="h-4 w-4 shrink-0 text-[#F5B455]" />
        <input
          ref={ref}
          value={text}
          onChange={e => setText(e.target.value.slice(0, CHAT_MAX))}
          onKeyDown={e => {
            if (e.nativeEvent.isComposing) return
            if (e.key === 'Enter') {
              e.preventDefault()
              send()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              closing.current = true
              net.closeChat(true)
            } else if (e.key === 'Tab') {
              e.preventDefault()
            }
          }}
          onBlur={() => {
            // Clicked into the world: drop the draft; that click takes the mouse back itself.
            if (!closing.current) net.closeChat(false)
          }}
          maxLength={CHAT_MAX}
          placeholder="Say something to the room"
          aria-label="Chat message"
          autoComplete="off"
          enterKeyHint="send"
          className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-[14px] text-[#F3EEE6] shadow-none outline-none placeholder:text-[#F3EEE6]/30 focus:outline-none focus:ring-0"
        />
        {left <= 30 && <span className={cx('shrink-0 text-[11px] tabular-nums', left <= 10 ? 'text-[#F3B3A6]' : 'text-[#F3EEE6]/45')}>{left}</span>}
        {touch && (
          <button
            type="button"
            onPointerDown={e => e.preventDefault()}
            onClick={send}
            className="h-8 shrink-0 rounded-[3px] bg-[#F5B455] px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#0B0F14]"
          >
            Send
          </button>
        )}
      </div>
      {!touch && (
        <div className={cx(styles.hudText, 'mt-2 flex items-center gap-4 px-0.5 text-[10px] uppercase tracking-[0.16em] text-[#F3EEE6]/55')}>
          <span className="flex items-center gap-1.5"><KeyCap>Enter</KeyCap>Send</span>
          <span className="flex items-center gap-1.5"><KeyCap>Esc</KeyCap>Cancel</span>
        </div>
      )}
    </div>
  )
}

/* ── player list ────────────────────────────────────────────────── */

function PlayerListOverlay() {
  const { touch, net } = useGameUi()
  const room = useNet(s => s.room)
  const players = useNet(s => s.players)
  const status = useNet(s => s.status)
  if (!room) return null
  return (
    <div className="absolute inset-x-0 top-[clamp(64px,13vh,120px)] flex justify-center px-4">
      <section
        aria-label="Players in this room"
        onPointerDown={touch ? () => net.setPlayerList(false) : undefined}
        className={cx(styles.prompt, 'relative w-[min(460px,100%)] overflow-hidden rounded-[4px] border border-[#F3EEE6]/10 bg-[#0B0F14]/[0.88] shadow-[0_24px_80px_-24px_rgba(0,0,0,0.75)]', touch && 'pointer-events-auto')}
      >
        <span aria-hidden className="absolute left-0 top-0 h-px w-16 bg-[#F5B455]" />
        <header className="flex items-end justify-between gap-4 border-b border-[#F3EEE6]/10 px-5 pb-3.5 pt-4">
          <div className="min-w-0">
            <div className={cx(LABEL, 'text-[10px] text-[#F5B455]')}>{roomKind(room)}</div>
            <div className="mt-1 truncate font-nacelle text-[22px] font-semibold leading-none text-[#F3EEE6]">{room.name}</div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <Occupancy players={Math.max(players.length, room.players)} max={room.max} />
            <span className="text-[11px] uppercase tracking-[0.18em] text-[#F3EEE6]/40">Code {room.code.toUpperCase()}</span>
          </div>
        </header>
        <div className="max-h-[46vh] overflow-y-auto px-5 py-1 [scrollbar-width:thin]">
          <PlayerRows players={players} status={status} />
        </div>
        {!touch && (
          <footer className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[#F3EEE6]/10 px-5 py-3 text-[10px] uppercase tracking-[0.16em] text-[#F3EEE6]/45">
            <span className="text-[#F3EEE6]/35">Emotes</span>
            {EMOTES.map(e => (
              <span key={e.name} className="flex items-center gap-1.5">
                <KeyCap>{e.key}</KeyCap>
                {e.label}
              </span>
            ))}
          </footer>
        )}
      </section>
    </div>
  )
}
