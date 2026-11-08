'use client'
/** In-play HUD: hearts, dash, online chip, objective, compass, shards & sparks, zone card, prompt, pointer-lock hint. */
import { useEffect, useState, type CSSProperties } from 'react'
import { Compass } from './Compass'
import { playUi, useGameUi, useHud, useNet, useUi } from './context'
import { KeyCap } from './controls'
import { DashIcon, HeartIcon, InteractIcon, MouseIcon, PauseIcon, SparkIcon, StarIcon } from './icons'
import { NetChip } from './OnlineHud'
import { cx, LABEL } from './theme'
import styles from './ui.module.css'

const GUTTER = 'left-[clamp(16px,2.4vw,32px)] top-[clamp(14px,2.4vw,28px)]'
const GUTTER_R = 'right-[clamp(16px,2.4vw,32px)] top-[clamp(14px,2.4vw,28px)]'

export function Hud() {
  const { touch } = useGameUi()
  const phase = useUi(s => s.phase)
  const visible = phase === 'playing' || phase === 'dialog'
  const playing = phase === 'playing'

  return (
    <div
      aria-hidden={!visible}
      className={cx('pointer-events-none absolute inset-0 z-30 transition-opacity duration-300 ease-out', visible ? 'opacity-100' : 'opacity-0')}
    >
      <div className={cx(styles.topShade, 'absolute inset-x-0 top-0 h-32')} />

      <div className={cx('absolute flex flex-col items-start', GUTTER)}>
        <div className="flex items-center gap-3">
          {touch && <TouchPause enabled={playing} />}
          <Hearts />
        </div>
        {/* On touch the Dash button carries its own charge ring. */}
        {!touch && <DashMeter />}
        <NetChip />
        <ObjectiveLine hidden={!playing} />
      </div>

      <Compass active={visible} className="absolute left-1/2 top-[clamp(10px,2vw,20px)] w-[min(380px,64vw)] -translate-x-1/2 max-sm:top-[62px]" />

      <div className={cx('absolute flex flex-col items-end gap-2', GUTTER_R)}>
        <ShardSlots />
        <SparkCount />
        <Fps />
      </div>

      <ZoneCard visible={visible} />
      {playing && <Prompt />}
      {playing && !touch && <LookHint />}
    </div>
  )
}

/* ── hearts ─────────────────────────────────────────────────────── */

interface Pulse {
  id: number
  from: number
  to: number
  kind: 'lost' | 'gained'
}

function Hearts() {
  const hp = useHud(h => h.hp)
  const max = useHud(h => h.maxHp)
  const [prev, setPrev] = useState(hp)
  const [pulse, setPulse] = useState<Pulse | null>(null)
  if (hp !== prev) {
    setPrev(hp)
    setPulse({ id: (pulse?.id ?? 0) + 1, from: Math.min(hp, prev), to: Math.max(hp, prev), kind: hp < prev ? 'lost' : 'gained' })
  }
  const hits = pulse?.kind === 'lost' ? pulse.id : 0

  return (
    <div key={hits} className={cx('flex items-center gap-[5px]', hits > 0 && styles.heartsHit)} role="img" aria-label={`Health ${hp} of ${max}`}>
      {Array.from({ length: max }, (_, i) => {
        const full = i < hp
        const pulsing = pulse && i >= pulse.from && i < pulse.to
        return (
          <span
            key={pulsing ? `${i}-${pulse.id}` : i}
            className={cx(
              'relative block h-[22px] w-[22px] max-sm:h-5 max-sm:w-5',
              pulsing && (pulse.kind === 'lost' ? styles.heartLost : styles.heartGained),
              full && hp === 1 && styles.heartLow,
            )}
          >
            {full ? (
              <HeartIcon className={cx(styles.hudIcon, 'absolute inset-0 h-full w-full text-[#E8664F]')} />
            ) : (
              <>
                <HeartIcon className="absolute inset-0 h-full w-full text-[#0B0F14]/40" />
                <HeartIcon filled={false} className={cx(styles.hudIcon, 'absolute inset-0 h-full w-full text-[#F3EEE6]/45')} />
              </>
            )}
          </span>
        )
      })}
    </div>
  )
}

function DashMeter() {
  const dash = useHud(h => h.dash)
  const ready = dash >= 1
  return (
    <div className="mt-2.5 flex items-center gap-2" aria-label={ready ? 'Dash ready' : 'Dash recharging'}>
      <DashIcon className={cx(styles.hudIcon, 'h-3.5 w-3.5 transition-colors duration-200', ready ? 'text-[#F5B455]' : 'text-[#F3EEE6]/40')} />
      <div className="relative h-[3px] w-[52px] overflow-hidden rounded-full bg-[#0B0F14]/35 ring-1 ring-[#F3EEE6]/15">
        <div
          className={cx('absolute inset-y-0 left-0 rounded-full transition-[width,background-color] duration-100 ease-linear', ready ? 'bg-[#F5B455]' : 'bg-[#F3EEE6]/55')}
          style={{ width: `${Math.round(Math.min(1, Math.max(0, dash)) * 100)}%` }}
        />
      </div>
    </div>
  )
}

function ObjectiveLine({ hidden }: { hidden: boolean }) {
  const objective = useUi(s => s.objective)
  const online = useNet(s => !!s.room)
  if (!objective || hidden) return null
  return (
    <div
      key={objective.id}
      data-state={objective.leaving ? 'closed' : 'open'}
      // Phones: below the compass (and the online chip), sharing that row with the toasts (left half / right half).
      className={cx(
        styles.objective,
        'mt-5 max-w-[min(340px,60vw)] max-sm:absolute max-sm:left-0 max-sm:mt-0 max-sm:w-[calc(50vw-24px)]',
        online ? 'max-sm:top-[136px]' : 'max-sm:top-[104px]',
      )}
    >
      <div className={cx(LABEL, styles.hudText, 'text-[10px] text-[#F5B455]')}>Objective</div>
      <div className={cx(styles.hudText, 'mt-1 text-[15px] leading-snug text-[#F3EEE6]')}>{objective.text}</div>
    </div>
  )
}

function TouchPause({ enabled }: { enabled: boolean }) {
  const { game } = useGameUi()
  return (
    <button
      type="button"
      aria-label="Pause"
      disabled={!enabled}
      onPointerDown={e => {
        e.preventDefault()
        playUi(game, 'ui-click')
        game.pause()
      }}
      className="pointer-events-auto grid h-10 w-10 touch-none place-items-center rounded-full border border-[#F3EEE6]/25 bg-[#0B0F14]/45 text-[#F3EEE6]/90 active:bg-[#F5B455] active:text-[#0B0F14]"
    >
      <PauseIcon className="h-4 w-4" />
    </button>
  )
}

/* ── shards & sparks ────────────────────────────────────────────── */

function ShardSlots() {
  const shards = useHud(h => h.shards)
  const found = shards.filter(Boolean).length
  return (
    <div className="flex items-center gap-[5px]" role="img" aria-label={`${found} of ${shards.length} star shards`}>
      {shards.map((got, i) =>
        got ? (
          <StarIcon key={`f${i}`} className={cx(styles.starFill, styles.starGlow, 'h-[19px] w-[19px] text-[#F5B455] max-sm:h-4 max-sm:w-4')} style={{ '--d': `${i * 40}ms` } as CSSProperties} />
        ) : (
          <StarIcon key={`e${i}`} filled={false} className={cx(styles.hudIcon, 'h-[19px] w-[19px] text-[#F3EEE6]/45 max-sm:h-4 max-sm:w-4')} />
        ),
      )}
    </div>
  )
}

function SparkCount() {
  const sparks = useHud(h => h.sparks)
  const total = useHud(h => h.sparksTotal)
  return (
    <div className={cx(styles.hudText, 'flex items-center gap-1.5 text-[13px] tabular-nums')} aria-label={`${sparks} sparks`}>
      <SparkIcon className={cx(styles.hudIcon, 'h-3 w-3 text-[#F5B455]')} />
      <span key={sparks} className={cx('font-semibold text-[#F3EEE6]', sparks > 0 && styles.pop)}>{sparks}</span>
      {total > 0 && <span className="text-[#F3EEE6]/45">/ {total}</span>}
    </div>
  )
}

function Fps() {
  const show = useUi(s => s.settings.showFps)
  if (!show) return null
  return <FpsValue />
}

function FpsValue() {
  const fps = useHud(h => h.fps)
  return <div className={cx(styles.hudText, 'font-mono text-[11px] tabular-nums text-[#F3EEE6]/60')}>{fps} FPS</div>
}

/* ── centre-screen cards ────────────────────────────────────────── */

function ZoneCard({ visible }: { visible: boolean }) {
  const zone = useHud(h => h.zone)
  const phase = useUi(s => s.phase)
  const [announced, setAnnounced] = useState('')
  const [card, setCard] = useState<{ id: number; name: string } | null>(null)

  // A new run announces its starting zone again.
  if (phase === 'title' && announced) setAnnounced('')
  if (visible && zone && zone !== announced) {
    setAnnounced(zone)
    setCard({ id: (card?.id ?? 0) + 1, name: zone })
  }

  useEffect(() => {
    if (!card) return
    const t = setTimeout(() => setCard(null), 4700)
    return () => clearTimeout(t)
  }, [card])

  if (!card) return null
  return (
    <div key={card.id} className="absolute inset-x-0 top-[21%] flex items-center justify-center gap-5 px-6 max-sm:top-[30%] max-sm:gap-3">
      <span className={cx(styles.zoneRuleL, 'h-px w-[clamp(24px,5vw,64px)] bg-[#F5B455]/80')} />
      <span className={cx(styles.zoneCard, styles.hudText, 'font-nacelle text-[clamp(20px,2.6vw,30px)] font-semibold uppercase text-[#F3EEE6]')}>{card.name}</span>
      <span className={cx(styles.zoneRuleR, 'h-px w-[clamp(24px,5vw,64px)] bg-[#F5B455]/80')} />
    </div>
  )
}

function Prompt() {
  const { touch } = useGameUi()
  const prompt = useUi(s => s.prompt)
  if (!prompt) return null
  return (
    <div className={cx('absolute inset-x-0 bottom-[clamp(96px,17vh,150px)] flex justify-center px-6', touch && 'max-sm:bottom-[calc(env(safe-area-inset-bottom)+252px)]')}>
      <div
        key={`${prompt.key}|${prompt.label}`}
        className={cx(styles.prompt, 'flex items-center gap-3 rounded-full border border-[#F3EEE6]/12 bg-[#0B0F14]/72 py-1.5 pl-1.5 pr-4 shadow-[0_8px_30px_rgba(0,0,0,0.35)]')}
      >
        {touch ? (
          <span className="grid h-7 w-7 place-items-center rounded-full bg-[#F5B455] text-[#0B0F14]">
            <InteractIcon className="h-4 w-4" />
          </span>
        ) : (
          <KeyCap accent shape="h-7 min-w-7 rounded-full px-2">{prompt.key}</KeyCap>
        )}
        <span className="text-[14px] text-[#F3EEE6]">{prompt.label}</span>
      </div>
    </div>
  )
}

function LookHint() {
  const locked = useUi(s => s.pointerLocked)
  const typing = useNet(s => s.chatOpen)
  if (locked || typing) return null
  return (
    <div className="absolute inset-x-0 bottom-[clamp(28px,6vh,56px)] flex justify-center">
      <div className={cx(styles.presence, 'flex items-center gap-2 text-[12px] uppercase tracking-[0.18em] text-[#F3EEE6]/75')} data-state="open" style={{ animationDelay: '700ms' }}>
        <MouseIcon className={cx(styles.hudIcon, styles.hintBreath, 'h-4 w-4')} />
        <span className={styles.hudText}>Click to look around</span>
      </div>
    </div>
  )
}
