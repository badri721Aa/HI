'use client'
/**
 * "Choose your device": picks the graphics preset for the hardware, with an auto-detected
 * recommendation pre-selected. Shown before the title menu on the very first launch, and again
 * from Settings › Graphics.
 */
import { useEffect, useRef, useState, type ComponentType, type ReactNode, type SVGProps } from 'react'
import { DEVICE_QUALITY, type DeviceKind } from '../engine/settings'
import { playUi, useGameUi } from './context'
import { Button, PanelHeader } from './controls'
import { DesktopIcon, LaptopIcon, PhoneIcon, SchoolLaptopIcon } from './icons'
import { focusFirst, isQuietFocus } from './nav'
import { cx, LABEL } from './theme'

const DEVICES: Array<{ kind: DeviceKind; label: string; hint: string; Icon: ComponentType<SVGProps<SVGSVGElement>> }> = [
  { kind: 'chromebook', label: 'Chromebook or school laptop', hint: 'Light graphics that keep it smooth', Icon: SchoolLaptopIcon },
  { kind: 'laptop', label: 'Laptop or PC', hint: 'Soft shadows and glow', Icon: LaptopIcon },
  { kind: 'gaming', label: 'Gaming PC', hint: 'Full foliage and crisp shadows', Icon: DesktopIcon },
  { kind: 'phone', label: 'Phone or tablet', hint: 'Light graphics and touch controls', Icon: PhoneIcon },
]

const QUALITY_LABEL = { low: 'Low', medium: 'Medium', high: 'High', ultra: 'Ultra' } as const

export function DevicePicker({ onDone, aside }: { onDone: () => void; aside?: ReactNode }) {
  const { game, store } = useGameUi()
  const [recommended] = useState(() => game.recommendDevice().kind)
  const [pick, setPick] = useState<DeviceKind>(recommended)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => focusFirst(rootRef.current, '[data-autofocus]'), [])

  const confirm = () => {
    store.updateSettings({ quality: DEVICE_QUALITY[pick] })
    game.completeDeviceSetup()
    onDone()
  }

  return (
    <div ref={rootRef}>
      <PanelHeader eyebrow="Setup" title="Choose your device" aside={aside} />
      <p className="mb-5 max-w-[480px] text-[14px] leading-relaxed text-[#F3EEE6]/65">
        Starfall picks graphics to match, so it runs smoothly. You can change this any time in Settings.
      </p>
      <div role="radiogroup" aria-label="Device" className="grid gap-2 sm:grid-cols-2">
        {DEVICES.map(({ kind, label, hint, Icon }) => {
          const on = pick === kind
          return (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={on}
              data-nav
              data-autofocus={kind === recommended || undefined}
              onClick={() => {
                playUi(game, 'ui-click')
                setPick(kind)
              }}
              onMouseEnter={e => e.currentTarget.focus({ preventScroll: true })}
              onFocus={() => isQuietFocus() || playUi(game, 'ui-hover')}
              className={cx(
                'flex min-h-[72px] items-center gap-4 rounded-[4px] border px-4 py-3 text-left outline-none transition-colors duration-150',
                'focus-visible:ring-1 focus-visible:ring-[#F5B455]/80',
                on ? 'border-[#F5B455]/70 bg-[#F5B455]/10' : 'border-[#F3EEE6]/12 bg-[#F3EEE6]/[0.03] hover:border-[#F3EEE6]/30 focus:border-[#F3EEE6]/35',
              )}
            >
              <Icon className={cx('h-7 w-7 shrink-0 transition-colors', on ? 'text-[#F5B455]' : 'text-[#F3EEE6]/65')} />
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] font-medium leading-tight text-[#F3EEE6]">
                  {label}
                  {kind === recommended && (
                    <span className={cx(LABEL, 'rounded-full border border-[#F5B455]/50 px-2 py-[3px] text-[9px] tracking-[0.18em] text-[#F5B455]')}>Recommended</span>
                  )}
                </span>
                <span className="mt-1 block text-[12px] text-[#F3EEE6]/50">{hint}</span>
              </span>
            </button>
          )
        })}
      </div>
      <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3">
        <Button variant="primary" onClick={confirm}>
          Continue
        </Button>
        <span className="text-[12px] text-[#F3EEE6]/45">Graphics: {QUALITY_LABEL[DEVICE_QUALITY[pick]]}</span>
      </div>
    </div>
  )
}
