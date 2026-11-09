'use client'
/**
 * On-screen controls for touch: the floating move stick (drawn from
 * input.touchStick — the engine owns the touch itself), and the action
 * buttons, which drive game.setVirtualButton().
 */
import { useEffect, useEffectEvent, useRef, useState, type ComponentType, type SVGProps } from 'react'
import type { Action } from '../engine/input'
import { useGameUi, useHud, useUi } from './context'
import { BowIcon, DashIcon, HammerIcon, InteractIcon, JumpIcon, SpinIcon, SwordIcon } from './icons'

/** The attack button shows what it does: the fists' spin or the weapon in hand. */
const ATTACK = {
  fists: { label: 'Spin', Icon: SpinIcon },
  sword: { label: 'Slash', Icon: SwordIcon },
  hammer: { label: 'Slam', Icon: HammerIcon },
  bow: { label: 'Shoot', Icon: BowIcon },
}
import { cx } from './theme'

export function TouchControls() {
  const { touch } = useGameUi()
  const phase = useUi(s => s.phase)
  const hasPrompt = useUi(s => !!s.prompt)
  const attack = ATTACK[useHud(h => h.weapon)]
  if (!touch) return null
  const playing = phase === 'playing'

  return (
    <div
      className={cx('pointer-events-none absolute inset-0 z-[35] transition-opacity duration-200', playing ? 'opacity-100' : 'opacity-0')}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <Stick active={playing} />
      {playing && (
        <div className="absolute bottom-[env(safe-area-inset-bottom)] right-[env(safe-area-inset-right)] h-[230px] w-[230px]">
          <TouchButton action="jump" label="Jump" Icon={JumpIcon} className="bottom-[34px] right-[22px] h-[80px] w-[80px]" big />
          <TouchButton action="dash" label="Dash" Icon={DashIcon} className="bottom-[28px] right-[118px] h-[58px] w-[58px]" charge />
          <TouchButton action="attack" label={attack.label} Icon={attack.Icon} className="bottom-[104px] right-[112px] h-[58px] w-[58px]" />
          <TouchButton action="interact" label="Use" Icon={InteractIcon} className="bottom-[128px] right-[32px] h-[58px] w-[58px]" highlight={hasPrompt} />
        </div>
      )}
    </div>
  )
}

function TouchButton({
  action,
  label,
  Icon,
  className,
  big,
  highlight,
  charge,
}: {
  action: Action
  label: string
  Icon: ComponentType<SVGProps<SVGSVGElement>>
  className: string
  big?: boolean
  highlight?: boolean
  /** Show the dash cooldown as a ring around the button. */
  charge?: boolean
}) {
  const { game } = useGameUi()
  const [down, setDown] = useState(false)
  const held = useRef(false)

  const release = () => {
    if (!held.current) return
    held.current = false
    setDown(false)
    game.setVirtualButton(action, false)
  }
  // Never leave an action held when the buttons go away (pause, cutscene).
  const releaseOnUnmount = useEffectEvent(release)
  useEffect(() => () => releaseOnUnmount(), [])

  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={e => {
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        held.current = true
        setDown(true)
        game.setVirtualButton(action, true)
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onContextMenu={e => e.preventDefault()}
      className={cx(
        'pointer-events-auto absolute flex touch-none select-none flex-col items-center justify-center rounded-full border transition-[background-color,transform,border-color] duration-100',
        down
          ? 'scale-95 border-[#F5B455] bg-[#F5B455] text-[#0B0F14]'
          : highlight
            ? 'border-[#F5B455]/90 bg-[#0B0F14]/45 text-[#F5B455] shadow-[0_0_0_4px_rgba(245,180,85,0.18)]'
            : 'border-[#F3EEE6]/30 bg-[#0B0F14]/35 text-[#F3EEE6]/90',
        className,
      )}
    >
      {charge && <ChargeRing />}
      <Icon className={big ? 'h-7 w-7' : 'h-5 w-5'} />
      <span className={cx('mt-0.5 font-semibold uppercase tracking-[0.14em]', big ? 'text-[10px]' : 'text-[8.5px]', down ? 'text-[#0B0F14]/80' : 'opacity-70')}>{label}</span>
    </button>
  )
}

const RING_R = 31
const RING_C = 2 * Math.PI * RING_R

/** Dash readiness: an amber arc that fills while the dash recharges, gone once it is ready. */
function ChargeRing() {
  const dash = useHud(h => h.dash)
  const t = Math.min(1, Math.max(0, dash))
  if (t >= 1) return null
  return (
    <svg viewBox="0 0 66 66" aria-hidden className="pointer-events-none absolute -inset-[5px] -rotate-90">
      <circle cx="33" cy="33" r={RING_R} fill="none" stroke="#F5B455" strokeOpacity={0.9} strokeWidth={2} strokeLinecap="round" strokeDasharray={RING_C} strokeDashoffset={RING_C * (1 - t)} />
    </svg>
  )
}

function Stick({ active }: { active: boolean }) {
  const { game } = useGameUi()
  const baseRef = useRef<HTMLDivElement>(null)
  const knobRef = useRef<HTMLDivElement>(null)
  const hintRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!active) return
    let raf = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const s = game.ctx.input?.touchStick
      const base = baseRef.current
      const knob = knobRef.current
      const hint = hintRef.current
      if (!base || !knob || !hint) return
      if (s) {
        base.style.opacity = '1'
        base.style.transform = `translate3d(${s.ox}px,${s.oy}px,0)`
        knob.style.opacity = '1'
        knob.style.transform = `translate3d(${s.x}px,${s.y}px,0)`
        hint.style.opacity = '0'
      } else {
        base.style.opacity = '0'
        knob.style.opacity = '0'
        hint.style.opacity = ''
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [game, active])

  return (
    <>
      <div ref={hintRef} className="absolute bottom-[calc(env(safe-area-inset-bottom)+64px)] left-[calc(env(safe-area-inset-left)+36px)] grid h-[112px] w-[112px] place-items-center rounded-full border border-dashed border-[#F3EEE6]/20 transition-opacity duration-200">
        <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[#F3EEE6]/35">Move</span>
      </div>
      <div ref={baseRef} className="absolute left-0 top-0 opacity-0" aria-hidden>
        <div className="h-[112px] w-[112px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#F3EEE6]/30 bg-[#0B0F14]/25" />
      </div>
      <div ref={knobRef} className="absolute left-0 top-0 opacity-0" aria-hidden>
        <div className="h-[46px] w-[46px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#F3EEE6]/50 bg-[#F3EEE6]/25" />
      </div>
    </>
  )
}
