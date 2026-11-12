'use client'
/**
 * The shared control family: menu rows, buttons, chips, and the settings controls (slider, toggle,
 * segmented, tabs). Every screen builds from these so sizes, states and sounds stay consistent.
 * Selection is focus: hovering a control focuses it (nav.ts hoverFocus), so mouse and keyboard
 * always agree on which single control is highlighted.
 */
import { useContext, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from 'react'
import type { SfxName } from '../engine/types'
import { GameContext, playUi, useGameUi } from './context'
import { ChevronIcon } from './icons'
import { hoverFocus, isQuietFocus } from './nav'
import styles from './ui.module.css'
import { cx, LABEL } from './theme'

/** Keeps focus where it is (mouse down on a control that shouldn't take the selection). */
const holdFocus = (e: MouseEvent) => e.preventDefault()

/* ── menu list ───────────────────────────────────────────────────── */

export interface MenuEntry {
  id: string
  label: string
  /** Quiet secondary text on the right (e.g. save summary). */
  meta?: string
  onSelect: () => void
  /** Draw a hairline gap above this item (groups destructive actions). */
  separated?: boolean
  /** Sound on activation; rows that flip a setting in place pass 'ui-toggle'. */
  sound?: SfxName
}

/**
 * Full-width menu rows. `current` is the row whose panel is open: it stays highlighted while focus
 * lives in the panel, and the other rows then stop taking the selection on hover (a click still
 * switches straight to them).
 */
export function MenuList({ items, current, size = 'lg' }: { items: MenuEntry[]; current?: string | null; size?: 'lg' | 'md' }) {
  const { game } = useGameUi()
  const locked = !!current
  return (
    <ul
      role="menu"
      data-locked={locked}
      className={cx(styles.menuList, 'flex flex-col gap-[3px]')}
      style={{ '--row-h': size === 'lg' ? 'clamp(40px, 5.8vh, 50px)' : 'clamp(40px, 5.4vh, 46px)' } as CSSProperties}
    >
      {items.map((it, i) => (
        <li
          key={it.id}
          role="none"
          className={cx(styles.rise, it.separated && 'mt-3 border-t border-[#F3EEE6]/10 pt-3')}
          style={{ '--d': `${120 + i * 45}ms` } as CSSProperties}
        >
          <button
            type="button"
            role="menuitem"
            data-nav
            data-id={it.id}
            data-current={current === it.id}
            className={cx(styles.menuRow, 'font-nacelle leading-tight', size === 'lg' ? 'text-[21px]' : 'text-[18px]')}
            {...(locked ? { onMouseDown: holdFocus } : hoverFocus)}
            onFocus={() => isQuietFocus() || playUi(game, 'ui-hover')}
            onClick={() => {
              playUi(game, it.sound ?? 'ui-click')
              it.onSelect()
            }}
          >
            <span className={cx(styles.rowLabel, 'shrink-0')}>{it.label}</span>
            {it.meta && <span className="min-w-0 truncate font-inter text-xs tracking-normal opacity-60">{it.meta}</span>}
            <ChevronIcon aria-hidden className={cx(styles.rowChevron, 'h-4 w-4 shrink-0 text-[#F5B455]')} />
          </button>
        </li>
      ))}
    </ul>
  )
}

/* ── buttons ─────────────────────────────────────────────────────── */

/**
 * Primary (filled amber), secondary (outlined) or danger. A disabled button stays focusable-by-click
 * but answers with an error blip and a shake instead of acting; a loading one shows a spinner and
 * ignores presses. Works outside the game context too (the loading screen's error state).
 */
export function Button({
  children,
  onClick,
  variant = 'secondary',
  className,
  autofocus,
  disabled,
  loading,
  size = 'md',
}: {
  children: ReactNode
  onClick: () => void
  variant?: 'primary' | 'secondary' | 'danger'
  className?: string
  /** Marks the button panels focus first. */
  autofocus?: boolean
  disabled?: boolean
  loading?: boolean
  size?: 'md' | 'sm'
}) {
  const game = useContext(GameContext)?.game
  const [nope, setNope] = useState(false)
  const off = disabled || loading
  return (
    <button
      type="button"
      data-nav
      data-variant={variant}
      data-size={size}
      data-autofocus={autofocus || undefined}
      data-loading={loading || undefined}
      aria-disabled={off || undefined}
      aria-busy={loading || undefined}
      onMouseDown={off ? holdFocus : undefined}
      onClick={() => {
        if (loading) return
        if (disabled) {
          playUi(game, 'ui-error')
          setNope(true)
          return
        }
        playUi(game, 'ui-click')
        onClick()
      }}
      onAnimationEnd={() => setNope(false)}
      {...hoverFocus}
      onFocus={() => isQuietFocus() || playUi(game, 'ui-hover')}
      className={cx(styles.btn, nope && styles.nope, className)}
    >
      {loading && <span aria-hidden className={styles.spinner} />}
      {children}
    </button>
  )
}

/**
 * Small utility button (Back, Refresh, Copy). Outside the arrow-key list unless `nav` is set.
 * Pass `sound={null}` when the handler plays its own.
 */
export function Chip({
  children,
  onClick,
  nav,
  autofocus,
  tone,
  sound = 'ui-click',
  className,
}: {
  children: ReactNode
  onClick: () => void
  nav?: boolean
  autofocus?: boolean
  tone?: 'good'
  sound?: SfxName | null
  className?: string
}) {
  const game = useContext(GameContext)?.game
  return (
    <button
      type="button"
      data-nav={nav || undefined}
      data-autofocus={autofocus || undefined}
      data-tone={tone}
      onClick={() => {
        if (sound) playUi(game, sound)
        onClick()
      }}
      {...(nav ? hoverFocus : null)}
      onFocus={nav ? () => isQuietFocus() || playUi(game, 'ui-hover') : undefined}
      className={cx(styles.chip, className)}
    >
      {children}
    </button>
  )
}

/**
 * Keyboard / pad glyph. `shape` replaces the default 22 px rounded-square sizing.
 * A span, not <kbd>: the site's global (unlayered) kbd rule would override these utilities.
 */
export function KeyCap({ children, shape, accent }: { children: ReactNode; shape?: string; accent?: boolean }) {
  return (
    <span
      className={cx(
        'inline-flex items-center justify-center border border-b-2 font-inter text-[11px] font-semibold leading-none tracking-normal',
        accent ? 'border-[#F5B455]/75 bg-[#F5B455]/15 text-[#F5B455]' : 'border-[#F3EEE6]/30 bg-[#F3EEE6]/[0.06] text-[#F3EEE6]/90',
        shape ?? 'h-[22px] min-w-[22px] rounded-[4px] px-1.5',
      )}
    >
      {children}
    </span>
  )
}

/* ── panel scaffolding ───────────────────────────────────────────── */

export function PanelHeader({ eyebrow, title, aside }: { eyebrow: string; title: string; aside?: ReactNode }) {
  return (
    <header className="mb-5 flex items-end justify-between gap-6 border-b border-[#F3EEE6]/10 pb-4">
      <div>
        <div className={cx(LABEL, 'text-[#F5B455]')}>{eyebrow}</div>
        <h2 className="mt-1.5 font-nacelle text-[28px] font-semibold leading-none tracking-[-0.01em] text-[#F3EEE6]">{title}</h2>
      </div>
      {aside}
    </header>
  )
}

export function SettingRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    // Narrow panels (phones): a control too wide to share the line drops below its label.
    <div className={cx(styles.settingRow, '-mx-3 flex min-h-[56px] flex-wrap items-center justify-between gap-x-6 gap-y-1 rounded-[6px] border-b border-[#F3EEE6]/[0.07] px-3 py-1.5 last:border-b-0')}>
      <div className="min-w-[min(100%,180px)] flex-1">
        <div className="text-[14px] text-[#F3EEE6]/90">{label}</div>
        {hint && <div className="mt-0.5 text-[12px] leading-snug text-[#F3EEE6]/40">{hint}</div>}
      </div>
      <div className="ml-auto flex shrink-0 items-center">{children}</div>
    </div>
  )
}

/* ── slider ──────────────────────────────────────────────────────── */

interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (v: number) => string
  /** Called continuously while dragging / stepping. */
  onChange: (v: number) => void
  /** Called when the user lets go (pointer up) — keyboard steps call it too, debounced by the parent. */
  onCommit: (v: number) => void
}

export function Slider({ label, value, min, max, step, format, onChange, onCommit }: SliderProps) {
  const { game } = useGameUi()
  const trackRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const lastTick = useRef(0)
  const t = (value - min) / (max - min)

  const snap = (v: number) => {
    const s = Math.round((v - min) / step) * step + min
    return Math.min(max, Math.max(min, +s.toFixed(4)))
  }
  const fromPointer = (clientX: number) => {
    const r = trackRef.current?.getBoundingClientRect()
    if (!r || r.width === 0) return value
    return snap(min + ((clientX - r.left) / r.width) * (max - min))
  }
  /** Moves the value; one tick per notch (rate-limited so a fast drag purrs rather than buzzes). */
  const move = (v: number) => {
    if (v === value) return
    const now = performance.now()
    if (now - lastTick.current > 45) {
      lastTick.current = now
      playUi(game, 'ui-tick')
    }
    onChange(v)
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.currentTarget.focus({ preventScroll: true })
    e.currentTarget.setPointerCapture(e.pointerId)
    dragging.current = true
    move(fromPointer(e.clientX))
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragging.current) move(fromPointer(e.clientX))
    else hoverFocus.onPointerMove(e)
  }
  const end = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return
    dragging.current = false
    const v = fromPointer(e.clientX)
    move(v)
    onCommit(v)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    let next: number | null = null
    const big = e.shiftKey ? 5 : 1
    if (e.key === 'ArrowRight') next = snap(value + step * big)
    else if (e.key === 'ArrowLeft') next = snap(value - step * big)
    else if (e.key === 'Home') next = min
    else if (e.key === 'End') next = max
    if (next === null) return
    e.preventDefault()
    if (next !== value) {
      move(next)
      onCommit(next)
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div
        role="slider"
        tabIndex={0}
        data-nav
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={format(value)}
        className={cx(styles.slider, 'relative flex h-11 w-[min(220px,38vw)] cursor-pointer touch-none items-center outline-none')}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={end}
        onPointerCancel={end}
        onKeyDown={onKeyDown}
        onFocus={() => isQuietFocus() || playUi(game, 'ui-hover')}
      >
        <div ref={trackRef} className="relative h-1 w-full rounded-full bg-[#F3EEE6]/15">
          <div className="absolute inset-y-0 left-0 rounded-full bg-[#F5B455]" style={{ width: `${t * 100}%` }} />
          <div
            className={cx(styles.sliderThumb, 'absolute top-1/2 h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#F5B455] bg-[#F3EEE6] shadow-[0_2px_6px_rgba(0,0,0,0.4)]')}
            style={{ left: `${t * 100}%` }}
          />
        </div>
      </div>
      <span className="w-12 text-right text-[13px] tabular-nums text-[#F3EEE6]/75">{format(value)}</span>
    </div>
  )
}

/* ── toggle ──────────────────────────────────────────────────────── */

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  const { game } = useGameUi()
  const set = (v: boolean) => {
    if (v === checked) return
    playUi(game, 'ui-toggle')
    onChange(v)
  }
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      data-nav
      onClick={() => set(!checked)}
      onKeyDown={e => {
        if (e.key === 'ArrowLeft') set(false)
        else if (e.key === 'ArrowRight') set(true)
        else return
        e.preventDefault()
      }}
      {...hoverFocus}
      onFocus={() => isQuietFocus() || playUi(game, 'ui-hover')}
      className={cx(styles.ring, 'group/tg -mr-2 flex h-11 cursor-pointer items-center gap-3 rounded-[8px] px-2 outline-none')}
    >
      <span className={cx('w-8 text-right text-[12px] font-semibold uppercase tracking-[0.14em] transition-colors duration-150', checked ? 'text-[#F5B455]' : 'text-[#F3EEE6]/50')}>
        {checked ? 'On' : 'Off'}
      </span>
      <span
        className={cx(
          'relative h-6 w-11 rounded-full border transition-[background-color,border-color] duration-150 ease-out',
          checked ? 'border-[#F5B455] bg-[#F5B455]' : 'border-[#F3EEE6]/30 bg-[#F3EEE6]/[0.06] group-focus/tg:border-[#F3EEE6]/70',
        )}
      >
        <span
          className={cx(
            'absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full shadow-[0_1px_3px_rgba(0,0,0,0.4)] transition-[left,background-color,transform] duration-150 ease-out group-active/tg:scale-x-125',
            checked ? 'left-[23px] bg-[#0B0F14]' : 'left-[3px] bg-[#F3EEE6]/80',
          )}
        />
      </span>
    </button>
  )
}

/* ── segmented / tabs ────────────────────────────────────────────── */

interface Option<T extends string> {
  value: T
  label: string
}

/** Mouse down on one option: the group keeps the selection ring, not the option. */
function focusGroup(e: MouseEvent<HTMLElement>): void {
  e.preventDefault()
  e.currentTarget.parentElement?.focus({ preventScroll: true })
}

/** One focus stop; ←/→ change the selection. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: Option<T>[]
  onChange: (v: NoInfer<T>) => void
}) {
  const { game } = useGameUi()
  const idx = Math.max(0, options.findIndex(o => o.value === value))
  const pick = (i: number) => {
    const o = options[i]
    if (o.value === value) return
    playUi(game, 'ui-toggle')
    onChange(o.value)
  }
  return (
    <div
      role="radiogroup"
      aria-label={label}
      tabIndex={0}
      data-nav
      onKeyDown={e => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
        e.preventDefault()
        const next = idx + (e.key === 'ArrowLeft' ? -1 : 1)
        if (next >= 0 && next < options.length) pick(next)
      }}
      {...hoverFocus}
      onFocus={() => isQuietFocus() || playUi(game, 'ui-hover')}
      className={cx(styles.ring, 'flex gap-[3px] rounded-[8px] border border-[#F3EEE6]/20 bg-[#F3EEE6]/[0.03] p-[3px] outline-none transition-colors duration-150 focus:border-[#F3EEE6]/50')}
    >
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          tabIndex={-1}
          onMouseDown={focusGroup}
          onClick={() => pick(i)}
          className={cx(
            'h-9 min-w-[46px] cursor-pointer rounded-[5px] px-3 text-[11px] font-semibold uppercase tracking-[0.14em] transition-[background-color,color,transform] duration-150 active:scale-95 [[data-touch=true]_&]:h-11',
            o.value === value ? 'bg-[#F5B455] text-[#0B0F14] shadow-[inset_0_-2px_0_rgba(11,15,20,0.2)]' : 'text-[#F3EEE6]/60 hover:bg-[#F3EEE6]/10 hover:text-[#F3EEE6]',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Tabs<T extends string>({ value, options, onChange, label }: { value: T; options: Option<T>[]; onChange: (v: NoInfer<T>) => void; label: string }) {
  const { game } = useGameUi()
  const idx = Math.max(0, options.findIndex(o => o.value === value))
  const listRef = useRef<HTMLDivElement>(null)

  // On narrow screens the strip scrolls sideways: keep the selected tab in view.
  useEffect(() => {
    const list = listRef.current
    const tab = list?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (!list || !tab) return
    const l = list.getBoundingClientRect()
    const t = tab.getBoundingClientRect()
    if (t.left < l.left) list.scrollLeft -= l.left - t.left
    else if (t.right > l.right) list.scrollLeft += t.right - l.right
  }, [value])
  const pick = (i: number) => {
    const o = options[(i + options.length) % options.length]
    if (o.value === value) return
    playUi(game, 'ui-click')
    onChange(o.value)
  }
  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      tabIndex={0}
      data-nav
      data-tabs
      onKeyDown={e => {
        if (e.key === 'ArrowLeft') pick(idx - 1)
        else if (e.key === 'ArrowRight') pick(idx + 1)
        else return
        e.preventDefault()
      }}
      {...hoverFocus}
      onFocus={() => isQuietFocus() || playUi(game, 'ui-hover')}
      className="group/tabs mb-2 flex gap-1 overflow-x-auto max-sm:gap-0 border-b border-[#F3EEE6]/10 outline-none [scrollbar-width:none] max-sm:[mask-image:linear-gradient(to_right,black_86%,transparent)]"
    >
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          tabIndex={-1}
          onMouseDown={focusGroup}
          onClick={() => pick(i)}
          className={cx(
            // Phones: tighter, so all four settings tabs fit without scrolling the strip.
            'relative h-10 shrink-0 cursor-pointer rounded-t-[6px] px-3 text-[12px] font-semibold uppercase tracking-[0.16em] transition-[background-color,color] duration-150 active:bg-[#F3EEE6]/15 max-sm:px-2 max-sm:text-[11px] max-sm:tracking-[0.08em] [[data-touch=true]_&]:h-11',
            o.value === value
              ? 'text-[#F3EEE6] group-focus/tabs:bg-[#F5B455]/15 group-focus/tabs:text-[#F5B455]'
              : 'text-[#F3EEE6]/50 hover:bg-[#F3EEE6]/[0.07] hover:text-[#F3EEE6]',
          )}
        >
          {o.label}
          <span
            className={cx(
              'absolute inset-x-0 -bottom-px h-[2px] origin-left bg-[#F5B455] transition-transform duration-200 ease-out',
              o.value === value ? 'scale-x-100' : 'scale-x-0',
            )}
          />
        </button>
      ))}
    </div>
  )
}
