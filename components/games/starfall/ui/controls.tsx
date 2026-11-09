'use client'
/** Menu items, buttons and the custom settings controls (slider, toggle, segmented, tabs). */
import { useEffect, useRef, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { playUi, useGameUi } from './context'
import { isQuietFocus } from './nav'
import styles from './ui.module.css'
import { cx, LABEL } from './theme'

/* ── menu list ───────────────────────────────────────────────────── */

export interface MenuEntry {
  id: string
  label: string
  /** Quiet secondary text on the right (e.g. save summary). */
  meta?: string
  onSelect: () => void
  /** Draw a hairline gap above this item (groups destructive actions). */
  separated?: boolean
}

export function MenuList({ items, current, size = 'lg' }: { items: MenuEntry[]; current?: string | null; size?: 'lg' | 'md' }) {
  const { game } = useGameUi()
  return (
    <ul className="flex flex-col" role="menu">
      {items.map((it, i) => (
        <li key={it.id} role="none" className={cx(it.separated && 'mt-4 border-t border-[#F3EEE6]/10 pt-4')}>
          <button
            type="button"
            role="menuitem"
            data-nav
            data-id={it.id}
            data-current={current === it.id}
            className={cx(
              styles.menuItem,
              styles.rise,
              'group flex w-full items-baseline gap-4 py-[7px] text-left font-nacelle outline-none',
              size === 'lg' ? 'text-[22px] leading-tight' : 'text-[18px] leading-tight',
              'text-[#F3EEE6]/55 hover:text-[#F3EEE6] focus:text-[#F3EEE6] data-[current=true]:text-[#F3EEE6]',
            )}
            style={{ '--d': `${120 + i * 45}ms` } as CSSProperties}
            onMouseEnter={e => e.currentTarget.focus({ preventScroll: true })}
            onFocus={() => isQuietFocus() || playUi(game, 'ui-hover')}
            onClick={() => {
              playUi(game, 'ui-click')
              it.onSelect()
            }}
          >
            <span>{it.label}</span>
            {it.meta && (
              <span className="truncate font-inter text-xs tracking-normal text-[#F3EEE6]/40 transition-colors group-focus:text-[#F3EEE6]/60">
                {it.meta}
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  )
}

/* ── buttons ─────────────────────────────────────────────────────── */

export function Button({
  children,
  onClick,
  variant = 'ghost',
  className,
  autofocus,
  disabled,
  size = 'md',
}: {
  children: ReactNode
  onClick: () => void
  variant?: 'primary' | 'ghost' | 'danger'
  className?: string
  /** Marks the button panels focus first. */
  autofocus?: boolean
  disabled?: boolean
  size?: 'md' | 'sm'
}) {
  const { game } = useGameUi()
  return (
    <button
      type="button"
      data-nav
      disabled={disabled}
      data-autofocus={autofocus || undefined}
      onClick={() => {
        playUi(game, 'ui-click')
        onClick()
      }}
      onMouseEnter={e => e.currentTarget.focus({ preventScroll: true })}
      onFocus={() => isQuietFocus() || playUi(game, 'ui-hover')}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-[4px] font-semibold uppercase outline-none transition-[background-color,color,border-color,box-shadow,opacity] duration-150 ease-out disabled:cursor-default disabled:opacity-40',
        size === 'md' ? 'h-11 px-6 text-[13px] tracking-[0.16em]' : 'h-8 px-3.5 text-[11px] tracking-[0.14em]',
        'focus-visible:ring-1 focus-visible:ring-[#F5B455]/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0F14]',
        variant === 'primary' && 'bg-[#F5B455] text-[#0B0F14] enabled:hover:bg-[#F8C677] enabled:focus:bg-[#F8C677]',
        variant === 'ghost' && 'border border-[#F3EEE6]/20 text-[#F3EEE6]/85 enabled:hover:border-[#F3EEE6]/45 enabled:hover:text-[#F3EEE6] enabled:focus:border-[#F3EEE6]/45 enabled:focus:text-[#F3EEE6]',
        variant === 'danger' && 'border border-[#E8664F]/50 text-[#F3B3A6] enabled:hover:bg-[#E8664F]/12 enabled:hover:text-[#FFD9D0] enabled:focus:bg-[#E8664F]/12 enabled:focus:text-[#FFD9D0]',
        className,
      )}
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
    <header className="mb-6 flex items-end justify-between gap-6 border-b border-[#F3EEE6]/10 pb-4">
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
    <div className="flex min-h-[58px] flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-[#F3EEE6]/[0.07] py-2.5 last:border-b-0">
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

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.currentTarget.focus({ preventScroll: true })
    e.currentTarget.setPointerCapture(e.pointerId)
    dragging.current = true
    onChange(fromPointer(e.clientX))
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragging.current) onChange(fromPointer(e.clientX))
  }
  const end = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return
    dragging.current = false
    const v = fromPointer(e.clientX)
    onChange(v)
    onCommit(v)
    playUi(game, 'ui-click')
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
      onChange(next)
      onCommit(next)
      playUi(game, 'ui-hover')
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
        className={cx(styles.slider, 'relative flex h-7 w-[min(220px,38vw)] cursor-pointer touch-none items-center outline-none')}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={end}
        onPointerCancel={end}
        onKeyDown={onKeyDown}
      >
        <div ref={trackRef} className="relative h-[2px] w-full rounded-full bg-[#F3EEE6]/15">
          <div className="absolute inset-y-0 left-0 rounded-full bg-[#F5B455]" style={{ width: `${t * 100}%` }} />
          <div
            className={cx(styles.sliderThumb, 'absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#F5B455] bg-[#F3EEE6]')}
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
    playUi(game, 'ui-click')
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
      }}
      className="group/tg flex items-center gap-3 rounded-full outline-none"
    >
      <span className="w-8 text-right text-[12px] uppercase tracking-[0.14em] text-[#F3EEE6]/50">{checked ? 'On' : 'Off'}</span>
      <span
        className={cx(
          'relative h-[22px] w-10 rounded-full border transition-[background-color,border-color,box-shadow] duration-200 ease-out group-focus-visible/tg:shadow-[0_0_0_3px_rgba(245,180,85,0.28)]',
          checked ? 'border-[#F5B455] bg-[#F5B455]/90' : 'border-[#F3EEE6]/25 bg-[#F3EEE6]/[0.06]',
        )}
      >
        <span
          className={cx(
            'absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full transition-[left,background-color] duration-200 ease-out',
            checked ? 'left-[21px] bg-[#0B0F14]' : 'left-[3px] bg-[#F3EEE6]/70',
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
    const o = options[(i + options.length) % options.length]
    if (o.value === value) return
    playUi(game, 'ui-click')
    onChange(o.value)
  }
  return (
    <div
      role="radiogroup"
      aria-label={label}
      tabIndex={0}
      data-nav
      onKeyDown={e => {
        if (e.key === 'ArrowLeft' && idx > 0) pick(idx - 1)
        else if (e.key === 'ArrowRight' && idx < options.length - 1) pick(idx + 1)
        else return
        e.preventDefault()
      }}
      className="flex rounded-[4px] border border-[#F3EEE6]/15 p-[3px] outline-none transition-colors duration-150 focus-visible:border-[#F5B455]/80 focus-visible:shadow-[0_0_0_3px_rgba(245,180,85,0.15)]"
    >
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          tabIndex={-1}
          onClick={() => pick(i)}
          className={cx(
            'h-7 rounded-[2px] px-3 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors duration-150',
            o.value === value ? 'bg-[#F5B455] text-[#0B0F14]' : 'text-[#F3EEE6]/50 hover:text-[#F3EEE6]',
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
    playUi(game, 'ui-hover')
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
      className="group/tabs mb-2 flex gap-6 overflow-x-auto border-b border-[#F3EEE6]/10 outline-none [scrollbar-width:none] max-sm:gap-5 max-sm:[mask-image:linear-gradient(to_right,black_82%,transparent)]"
    >
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          tabIndex={-1}
          onClick={() => pick(i)}
          className={cx(
            'relative shrink-0 pb-2 text-[12px] font-semibold uppercase tracking-[0.18em] transition-colors duration-150',
            o.value === value ? 'text-[#F3EEE6] group-focus-visible/tabs:text-[#F5B455]' : 'text-[#F3EEE6]/40 hover:text-[#F3EEE6]/75',
          )}
        >
          {o.label}
          <span
            className={cx(
              'absolute inset-x-0 -bottom-px h-px origin-left bg-[#F5B455] transition-transform duration-200 ease-out',
              o.value === value ? 'scale-x-100' : 'scale-x-0',
            )}
          />
        </button>
      ))}
    </div>
  )
}
