'use client'
/**
 * In-play HUD: hearts (or the Creative badge), dash, online chip, objective, compass, boss bar, shards & sparks,
 * zone card, prompt, weapon hotbar or build bar, crosshairs, pointer-lock hint.
 */
import { useEffect, useState, type ComponentType, type CSSProperties, type SVGProps } from 'react'
import { BLOCKS, type BlockDef } from '../engine/build/blocks'
import type { WeaponId } from '../engine/events'
import { HOTBAR, WEAPON_NAMES } from '../engine/gameplay/weapons/defs'
import { Compass } from './Compass'
import { playUi, useGameUi, useHud, useNet, useUi } from './context'
import { KeyCap } from './controls'
import { DamageNumbers } from './DamageNumbers'
import {
  BowIcon, DashIcon, FistIcon, FrostHammerIcon, HammerIcon, HeartIcon, InteractIcon, MouseIcon, PauseIcon, SparkIcon, StarbladeIcon, StarIcon, SwordIcon,
} from './icons'
import { NetChip } from './OnlineHud'
import { cx, LABEL } from './theme'
import styles from './ui.module.css'

/** Hotbar slot (weapons, blocks): clickable whenever the mouse is free, a 44 px target on touch. */
const SLOT = 'pointer-events-auto relative grid h-11 w-11 cursor-pointer touch-none place-items-center rounded-[6px] border transition-[background-color,border-color,transform] duration-100 active:scale-90'

const GUTTER = 'left-[clamp(16px,2.4vw,32px)] top-[clamp(14px,2.4vw,28px)]'
const GUTTER_R = 'right-[clamp(16px,2.4vw,32px)] top-[clamp(14px,2.4vw,28px)]'

export function Hud() {
  const { touch } = useGameUi()
  const phase = useUi(s => s.phase)
  const visible = phase === 'playing' || phase === 'dialog'
  const playing = phase === 'playing'
  const creative = useHud(h => h.creative)

  return (
    <div
      aria-hidden={!visible}
      // Faded out is also switched off: invisible hotbar slots must not catch taps meant for a cutscene or menu.
      inert={!visible}
      className={cx('pointer-events-none absolute inset-0 z-30 transition-opacity duration-300 ease-out', visible ? 'opacity-100' : 'opacity-0')}
    >
      <div className={cx(styles.topShade, 'absolute inset-x-0 top-0 h-32')} />

      <div className={cx('absolute flex flex-col items-start', GUTTER)}>
        <div className="flex items-center gap-3">
          {touch && <TouchPause enabled={playing} />}
          {creative ? <CreativeBadge /> : <Hearts />}
        </div>
        {/* On touch the Dash button carries its own charge ring. */}
        {!touch && <DashMeter />}
        <NetChip />
        <ObjectiveLine hidden={!playing} />
      </div>

      <Compass active={visible} className="absolute left-1/2 top-[clamp(10px,2vw,20px)] w-[min(380px,64vw)] -translate-x-1/2 max-sm:top-[62px]" />
      <BossBar />

      <div className={cx('absolute flex flex-col items-end gap-2', GUTTER_R)}>
        <ShardSlots />
        <SparkCount />
        <Fps />
      </div>

      <ZoneCard visible={visible} />
      <DamageNumbers />
      {playing && <Crosshair />}
      {playing && <BuildCrosshair />}
      {playing && <Prompt />}
      {/* Dialogs sit where the bars are: the bars step aside while one is open. */}
      {playing && <Hotbar />}
      {playing && <BuildBar />}
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
  // In a boss fight the boss bar says it all, and it needs the room (phones, narrow windows).
  const fighting = useHud(h => h.boss !== null)
  if (!objective || hidden || fighting) return null
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
      className="pointer-events-auto grid h-11 w-11 touch-none place-items-center rounded-full border border-[#F3EEE6]/30 bg-[#0B0F14]/50 text-[#F3EEE6]/90 transition-transform duration-100 active:scale-95 active:border-[#F5B455] active:bg-[#F5B455] active:text-[#0B0F14]"
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
  // Phones stack the weapon / block bar above the touch buttons: the prompt goes above that bar.
  const barUp = useHud(h => h.weapons.length > 1 || h.build !== null)
  if (!prompt) return null
  return (
    <div
      className={cx(
        'absolute inset-x-0 bottom-[clamp(96px,17vh,150px)] flex justify-center px-6',
        touch && (barUp ? 'max-sm:bottom-[calc(env(safe-area-inset-bottom)+326px)]' : 'max-sm:bottom-[calc(env(safe-area-inset-bottom)+252px)]'),
      )}
    >
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

/* ── boss ───────────────────────────────────────────────────────── */

const BOSS_FILL = 'linear-gradient(90deg, #8E3426, #E8664F)'

/** The boss's name and health across the top while a fight is on; amber while it is stunned (hit it now). */
function BossBar() {
  const boss = useHud(h => h.boss)
  if (!boss) return null
  const width = `${(Math.max(0, Math.min(1, boss.hp / boss.max)) * 100).toFixed(1)}%`
  return (
    <div
      role="status"
      aria-label={`${boss.name}: ${boss.hp} of ${boss.max}`}
      className={cx(styles.bossBar, 'absolute left-1/2 top-[clamp(58px,8vh,78px)] flex w-[min(560px,74vw)] -translate-x-1/2 flex-col items-center gap-1.5 max-sm:top-[112px]')}
    >
      <div className="flex items-center gap-3">
        <span className="h-px w-[clamp(18px,4vw,48px)] bg-[#F5B455]/70" />
        <span className={cx(styles.hudText, 'font-nacelle text-[clamp(14px,1.6vw,18px)] font-semibold uppercase tracking-[0.18em] text-[#F3EEE6]')}>{boss.name}</span>
        <span className="h-px w-[clamp(18px,4vw,48px)] bg-[#F5B455]/70" />
      </div>
      <div className="relative h-[10px] w-full overflow-hidden rounded-full bg-[#0B0F14]/60 shadow-[0_6px_20px_rgba(0,0,0,0.35)] ring-1 ring-[#F3EEE6]/20">
        {/* The chunk just lost lingers a moment before draining away. */}
        <div className="absolute inset-y-0 left-0 rounded-full bg-[#F3EEE6]/45 transition-[width] delay-300 duration-700 ease-out" style={{ width }} />
        <div
          className={cx('absolute inset-y-0 left-0 rounded-full transition-[width] duration-150 ease-out', boss.vulnerable && styles.bossStunned)}
          style={{ width, background: boss.vulnerable ? '#F5B455' : BOSS_FILL }}
        />
        {[1 / 3, 2 / 3].map(f => (
          <span key={f} className="absolute inset-y-0 w-px bg-[#0B0F14]/70" style={{ left: `${f * 100}%` }} />
        ))}
      </div>
      <div className={cx(LABEL, styles.hudText, 'flex h-4 items-center gap-2 text-[10px]')}>
        {[1, 2, 3].map(n => (
          <span key={n} className={cx('h-1.5 w-1.5 rotate-45', n <= boss.phase ? 'bg-[#E8664F]' : 'bg-[#F3EEE6]/25')} />
        ))}
        <span className={boss.vulnerable ? 'text-[#F5B455]' : 'text-[#F3EEE6]/60'}>{boss.vulnerable ? 'Stunned — strike now!' : `Phase ${boss.phase}`}</span>
      </div>
    </div>
  )
}

/* ── weapons ────────────────────────────────────────────────────── */

const WEAPON_ICON: Record<WeaponId, ComponentType<SVGProps<SVGSVGElement>>> = {
  fists: FistIcon, sword: SwordIcon, hammer: HammerIcon, bow: BowIcon, starblade: StarbladeIcon, frostHammer: FrostHammerIcon,
}

/** Owned weapons, bottom centre; the one in hand is lit. On touch the slots are the way to switch. */
function Hotbar() {
  const { game, touch } = useGameUi()
  const owned = useHud(h => h.weapons)
  const current = useHud(h => h.weapon)
  const building = useHud(h => h.build !== null)
  if (owned.length < 2 || building) return null
  return (
    <div
      className={cx(
        'absolute inset-x-0 flex flex-col items-center gap-1.5',
        touch ? 'bottom-[calc(env(safe-area-inset-bottom)+14px)] max-sm:bottom-[calc(env(safe-area-inset-bottom)+238px)]' : 'bottom-[clamp(14px,2.6vh,24px)]',
      )}
    >
      <span key={current} className={cx(LABEL, styles.hudText, styles.pop, 'text-[10px] text-[#F3EEE6]/75')}>{WEAPON_NAMES[current]}</span>
      <div role="toolbar" aria-label="Weapons" className="flex gap-1.5 rounded-[6px] border border-[#F3EEE6]/10 bg-[#0B0F14]/40 p-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.3)]">
        {owned.map(w => {
          const on = w === current
          const Icon = WEAPON_ICON[w]
          return (
            <button
              key={w}
              type="button"
              tabIndex={-1}
              aria-label={WEAPON_NAMES[w]}
              aria-pressed={on}
              onPointerDown={e => {
                e.preventDefault()
                game.ctx.weapons.equip(w)
              }}
              className={cx(
                SLOT,
                !touch && 'hover:border-[#F3EEE6]/45',
                on ? 'border-[#F5B455]/80 bg-[#F5B455]/15 text-[#F5B455]' : 'border-[#F3EEE6]/15 bg-[#0B0F14]/30 text-[#F3EEE6]/65',
              )}
            >
              <Icon className={cx(styles.hudIcon, 'h-6 w-6')} />
              {!touch && <span className="absolute left-1 top-0.5 text-[9px] font-semibold tabular-nums text-[#F3EEE6]/45">{HOTBAR.indexOf(w) + 1}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Bow drawn: a dot where the arrow goes and a ring that fills with the draw. */
function Crosshair() {
  const aim = useHud(h => h.aim)
  if (aim < 0) return null
  const r = 13
  const c = 2 * Math.PI * r
  return (
    <svg aria-hidden width="40" height="40" viewBox="0 0 40 40" className={cx(styles.hudIcon, 'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2')}>
      <circle cx="20" cy="20" r="2" fill="#F3EEE6" />
      <circle cx="20" cy="20" r={r} fill="none" stroke="#F3EEE6" strokeOpacity={0.22} strokeWidth="2" />
      <circle
        cx="20" cy="20" r={r} fill="none" strokeWidth="2" strokeLinecap="round" transform="rotate(-90 20 20)"
        stroke={aim >= 1 ? '#F5B455' : '#F3EEE6'} strokeDasharray={c} strokeDashoffset={c * (1 - aim)}
      />
    </svg>
  )
}

function LookHint() {
  const locked = useUi(s => s.pointerLocked)
  const typing = useNet(s => s.chatOpen)
  const raised = useHud(h => h.weapons.length > 1 || h.build !== null)
  if (locked || typing) return null
  return (
    <div className={cx('absolute inset-x-0 flex justify-center', raised ? 'bottom-[clamp(100px,14vh,112px)]' : 'bottom-[clamp(28px,6vh,56px)]')}>
      <div className={cx(styles.presence, 'flex items-center gap-2 text-[12px] uppercase tracking-[0.18em] text-[#F3EEE6]/75')} data-state="open" style={{ animationDelay: '700ms' }}>
        <MouseIcon className={cx(styles.hudIcon, styles.hintBreath, 'h-4 w-4')} />
        <span className={styles.hudText}>Click to look around</span>
      </div>
    </div>
  )
}

/* ── Creative & building ────────────────────────────────────────── */

/** Creative games say so where the hearts would be (nothing hurts here), with a tag while flying. */
function CreativeBadge() {
  const flying = useHud(h => h.flying)
  return (
    <div className="flex h-[22px] items-center gap-2 max-sm:h-5">
      <span className={cx(LABEL, styles.hudText, 'rounded-[4px] border border-[#F5B455]/60 bg-[#F5B455]/15 px-2.5 py-[3px] text-[10px] text-[#F5B455]')}>
        Creative
      </span>
      {flying && (
        <span className={cx(LABEL, styles.hudText, styles.pop, 'rounded-[4px] border border-[#A9D8F2]/45 bg-[#A9D8F2]/10 px-2 py-[3px] text-[10px] text-[#D4ECF8]')}>
          Flying
        </span>
      )}
    </div>
  )
}

/** Build mode: a plus where the block goes. */
function BuildCrosshair() {
  const building = useHud(h => h.build !== null)
  if (!building) return null
  return (
    <svg aria-hidden width="28" height="28" viewBox="0 0 28 28" className={cx(styles.hudIcon, 'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2')}>
      <path d="M14 7v14M7 14h14" stroke="#F3EEE6" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

/** Build mode: the block bar (icons from the block textures), our count against the cap, and the controls. */
function BuildBar() {
  const { game, touch } = useGameUi()
  const build = useHud(h => h.build)
  if (!build) return null
  const full = build.count >= build.max
  return (
    <div
      className={cx(
        'absolute inset-x-0 flex flex-col items-center gap-1.5',
        touch ? 'bottom-[calc(env(safe-area-inset-bottom)+14px)] max-sm:bottom-[calc(env(safe-area-inset-bottom)+238px)]' : 'bottom-[clamp(14px,2.6vh,24px)]',
      )}
    >
      <div className="flex items-baseline gap-3">
        <span key={build.slot} className={cx(LABEL, styles.hudText, styles.pop, 'text-[10px] text-[#F3EEE6]/80')}>{BLOCKS[build.slot].name}</span>
        <span className={cx(styles.hudText, 'text-[11px] tabular-nums', full ? 'text-[#E8664F]' : 'text-[#F3EEE6]/55')}>
          {build.count} / {build.max}
        </span>
      </div>
      {/* Phones: two rows of six, so every block keeps a 44 px target. */}
      <div role="toolbar" aria-label="Blocks" className={cx('gap-1 rounded-[6px] border border-[#F3EEE6]/10 bg-[#0B0F14]/40 p-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.3)]', touch ? 'flex max-sm:grid max-sm:grid-cols-6' : 'flex')}>
        {BLOCKS.map((def, i) => {
          const on = i === build.slot
          return (
            <button
              key={def.name}
              type="button"
              tabIndex={-1}
              aria-label={def.name}
              aria-pressed={on}
              onPointerDown={e => {
                e.preventDefault()
                game.ctx.build.select(i)
              }}
              className={cx(
                SLOT,
                !touch && 'hover:border-[#F3EEE6]/45',
                on ? 'border-[#F5B455]/80 bg-[#F5B455]/15' : 'border-[#F3EEE6]/15 bg-[#0B0F14]/30',
              )}
            >
              <BlockIcon def={def} />
              {!touch && i < 10 && <span className="absolute left-1 top-0.5 text-[9px] font-semibold tabular-nums text-[#F3EEE6]/45">{(i + 1) % 10}</span>}
            </button>
          )
        })}
      </div>
      {!touch && (
        <div className={cx(styles.hudText, 'flex items-center gap-3 text-[11px] uppercase tracking-[0.14em] text-[#F3EEE6]/60')}>
          <span className="flex items-center gap-1.5"><KeyCap>LMB</KeyCap>place</span>
          <span className="flex items-center gap-1.5"><KeyCap>RMB</KeyCap>break</span>
          <span className="flex items-center gap-1.5"><KeyCap>R</KeyCap>rotate</span>
          <span className="flex items-center gap-1.5"><KeyCap>B</KeyCap>exit</span>
        </div>
      )}
    </div>
  )
}

/** The folder TextureLib loads from (engine/textures.ts), spelled out so the HUD bundle doesn't pull in three.js. */
const texUrl = (name: string) => `url(/games/starfall/textures/${name}.webp)`

/** A little isometric cube painted with the block's own textures (stairs: their profile). */
function BlockIcon({ def }: { def: BlockDef }) {
  const vars = { '--top': texUrl(def.top), '--side': texUrl(def.side), '--tint': def.tint } as CSSProperties
  if (def.shape === 'stairs') return <span aria-hidden className={styles.blockStairs} style={vars} />
  return (
    <span aria-hidden className={styles.blockIcon} data-look={def.look} style={vars}>
      <i data-face="top" />
      <i data-face="front" />
      <i data-face="side" />
    </span>
  )
}
