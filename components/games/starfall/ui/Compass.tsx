'use client'
/**
 * Compass strip. Ticks and markers are positioned every frame straight from
 * the camera yaw (no React renders), so it stays smooth while the HUD store
 * only refreshes at 10 Hz. Markers arrive relative to the camera at sample
 * time; we convert them to world bearings and re-project each frame.
 */
import { useEffect, useRef } from 'react'
import { useGameUi } from './context'
import { BeaconIcon, ChevronIcon, CrownIcon, PortalIcon, StarIcon } from './icons'
import { cx } from './theme'
import styles from './ui.module.css'

/** Visible half-range of the strip. */
const RANGE = (100 * Math.PI) / 180
/** Markers behind the camera are pinned here (inside the faded edges) with a chevron. */
const PIN = RANGE * 0.8
const MAX_MARKERS = 8
/** Compass degrees (0 = north, clockwise), one tick every 15°. */
const TICKS = Array.from({ length: 24 }, (_, i) => i * 15)
const LABELS: Record<number, string> = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' }

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
/** Compass degrees → engine bearing (atan2(dx, dz) space, where +Z is south). */
const bearingOf = (deg: number) => Math.PI - (deg * Math.PI) / 180

export function Compass({ active, className }: { active: boolean; className?: string }) {
  const { game } = useGameUi()
  const stripRef = useRef<HTMLDivElement>(null)
  const ticks = useRef<Array<HTMLDivElement | null>>([])
  const markers = useRef<Array<HTMLDivElement | null>>([])

  useEffect(() => {
    if (!active) return
    const strip = stripRef.current
    if (!strip) return
    let width = strip.clientWidth
    const ro = new ResizeObserver(() => (width = strip.clientWidth))
    ro.observe(strip)

    const tickBearing = TICKS.map(bearingOf)
    const bearings = new Float64Array(MAX_MARKERS)
    let count = 0
    let lastHud: unknown = null
    let raf = 0

    const loop = () => {
      raf = requestAnimationFrame(loop)
      const hud = game.hud.get()
      const rigYaw = game.ctx.cameraRig?.yaw
      const yaw = typeof rigYaw === 'number' && Number.isFinite(rigYaw) ? rigYaw : hud.heading
      const half = width / 2
      const k = half / RANGE

      if (hud !== lastHud) {
        lastHud = hud
        count = Math.min(MAX_MARKERS, hud.compass.length)
        let nearest = -1
        let best = Infinity
        for (let i = 0; i < count; i++) {
          const m = hud.compass[i]
          bearings[i] = hud.heading - m.angle
          if (m.dist < best) {
            best = m.dist
            nearest = i
          }
        }
        for (let i = 0; i < MAX_MARKERS; i++) {
          const el = markers.current[i]
          if (!el) continue
          if (i >= count) {
            el.style.display = 'none'
            continue
          }
          const m = hud.compass[i]
          el.style.display = ''
          el.dataset.kind = m.kind
          el.dataset.near = i === nearest ? 'true' : 'false'
          const label = el.lastElementChild as HTMLElement | null
          if (label) label.textContent = i === nearest ? `${Math.round(m.dist)} m` : ''
        }
      }

      for (let i = 0; i < TICKS.length; i++) {
        const el = ticks.current[i]
        if (!el) continue
        const a = wrap(yaw - tickBearing[i])
        const vis = Math.abs(a) < RANGE
        el.style.opacity = vis ? '' : '0'
        if (vis) el.style.transform = `translate3d(${(half + a * k).toFixed(1)}px,0,0)`
      }
      for (let i = 0; i < count; i++) {
        const el = markers.current[i]
        if (!el) continue
        const a = wrap(yaw - bearings[i])
        const clamped = Math.max(-PIN, Math.min(PIN, a))
        const edge = a < -PIN ? 'left' : a > PIN ? 'right' : 'none'
        if (el.dataset.edge !== edge) el.dataset.edge = edge
        el.style.transform = `translate3d(${(half + clamped * k).toFixed(1)}px,0,0)`
      }
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [game, active])

  return (
    <div className={cx('relative h-[46px] select-none', className)} aria-hidden>
      <div
        ref={stripRef}
        className="absolute inset-0 overflow-hidden"
        style={{ maskImage: 'linear-gradient(90deg, transparent 0%, #000 16%, #000 84%, transparent 100%)', WebkitMaskImage: 'linear-gradient(90deg, transparent 0%, #000 16%, #000 84%, transparent 100%)' }}
      >
        <div className="absolute inset-x-0 top-[17px] h-px bg-[#F3EEE6]/22" />
        {TICKS.map((deg, i) => {
          const label = LABELS[deg]
          const cardinal = deg % 90 === 0
          return (
            <div key={deg} ref={el => { ticks.current[i] = el }} className="absolute left-0 top-0 will-change-transform" style={{ opacity: 0 }}>
              <div
                className={cx(
                  'absolute left-0 w-px -translate-x-1/2',
                  cardinal ? 'top-[11px] h-[13px] bg-[#F3EEE6]/80' : label ? 'top-[13px] h-[9px] bg-[#F3EEE6]/55' : 'top-[14px] h-[7px] bg-[#F3EEE6]/35',
                )}
              />
              {label && (
                <div
                  className={cx(
                    styles.hudText,
                    'absolute left-0 top-[25px] -translate-x-1/2 font-nacelle leading-none',
                    cardinal ? 'text-[13px] font-semibold' : 'text-[9.5px] tracking-[0.06em] text-[#F3EEE6]/55',
                    deg === 0 ? 'text-[#F5B455]' : cardinal && 'text-[#F3EEE6]/90',
                  )}
                >
                  {label}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div className="absolute inset-0">
        {Array.from({ length: MAX_MARKERS }, (_, i) => (
          <div
            key={i}
            ref={el => { markers.current[i] = el }}
            className="group/m absolute left-0 top-0 will-change-transform data-[near=true]:z-10"
            style={{ display: 'none' }}
            data-kind="shard"
            data-near="false"
            data-edge="none"
          >
            <div className="absolute left-0 top-[1px] flex -translate-x-1/2 items-center text-[#F5B455] opacity-60 transition-[opacity,transform] duration-200 group-data-[near=true]/m:scale-125 group-data-[near=true]/m:opacity-100">
              <ChevronIcon className="absolute right-full mr-px hidden h-2.5 w-2.5 rotate-180 group-data-[edge=left]/m:block" />
              <StarIcon className={cx(styles.hudIcon, 'hidden h-3 w-3 group-data-[kind=shard]/m:block')} />
              <BeaconIcon className={cx(styles.hudIcon, 'hidden h-3.5 w-3.5 group-data-[kind=beacon]/m:block')} />
              <PortalIcon className={cx(styles.hudIcon, 'hidden h-3.5 w-3.5 group-data-[kind=portal]/m:block')} />
              <CrownIcon className={cx(styles.hudIcon, 'hidden h-3.5 w-3.5 group-data-[kind=boss]/m:block')} />
              <ChevronIcon className="absolute left-full ml-px hidden h-2.5 w-2.5 group-data-[edge=right]/m:block" />
            </div>
            <div
              className={cx(
                styles.hudText,
                // A faint ink backing keeps the distance legible where markers bunch up.
                'absolute top-0 whitespace-nowrap rounded-[2px] bg-[#0B0F14]/45 px-1 text-[10px] font-semibold leading-[14px] tabular-nums tracking-[0.04em] text-[#F5B455] empty:hidden',
                'left-[9px] group-data-[edge=left]/m:left-[14px] group-data-[edge=right]/m:left-auto group-data-[edge=right]/m:right-[14px]',
              )}
            />
          </div>
        ))}
      </div>
      {/* heading caret */}
      <div className="absolute bottom-0 left-1/2 h-0 w-0 -translate-x-1/2 border-x-[4px] border-b-[5px] border-x-transparent border-b-[#F5B455]" />
    </div>
  )
}
