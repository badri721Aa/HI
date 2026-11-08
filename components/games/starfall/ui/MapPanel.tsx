'use client'
/** Pause-menu island map: shards, lanterns, the Beacon and the player, with shard hints on hover / tap / focus. */
import { useEffect, useState, type CSSProperties } from 'react'
import type { Game } from '../engine/Game'
import { useGameUi } from './context'
import { PanelHeader } from './controls'
import { ArrowIcon, BeaconIcon, LanternIcon, StarIcon } from './icons'
import { BackHint } from './Panel'
import { cx, LABEL } from './theme'
import styles from './ui.module.css'

type MapInfo = ReturnType<Game['getMapInfo']>

const at = (u: number, v: number): CSSProperties => ({ left: `${u * 100}%`, top: `${v * 100}%` })

export function MapPanel({ onBack }: { onBack: () => void }) {
  const { game } = useGameUi()
  // The world is frozen while paused, so one snapshot is exact.
  const [info] = useState<MapInfo>(() => game.getMapInfo())
  const [image, setImage] = useState<string | null>(null)
  const [selected, setSelected] = useState<number | null>(null)

  useEffect(() => {
    // Generating the image takes a moment the first time; let the panel paint first.
    const t = setTimeout(() => {
      try {
        setImage(game.getMapImage())
      } catch {
        setImage('')
      }
    }, 16)
    return () => clearTimeout(t)
  }, [game])

  const found = info.shards.filter(s => s.collected).length
  const sel = selected !== null ? info.shards[selected] : null

  return (
    <div>
      <PanelHeader
        eyebrow="Island map"
        title={`${found} of ${info.shards.length} shards found`}
        aside={<BackHint onBack={onBack} />}
      />
      <div className="flex flex-col gap-6 md:flex-row md:items-start">
        <div
          className={cx(styles.mapFrame, 'relative aspect-square w-full max-w-[min(440px,58vh)] shrink-0 overflow-hidden rounded-[3px] border border-[#F3EEE6]/12 bg-[#16222b]')}
          onPointerLeave={e => e.pointerType === 'mouse' && setSelected(null)}
        >
          {image ? (
            <div className={cx(styles.mapImage, 'absolute inset-0 bg-cover bg-center')} style={{ backgroundImage: `url(${image})` }} />
          ) : (
            <div className="absolute inset-0 grid place-items-center text-[12px] uppercase tracking-[0.2em] text-[#F3EEE6]/35">
              {image === null ? 'Charting the island…' : 'Map unavailable'}
            </div>
          )}

          {/* survey grid */}
          <svg aria-hidden className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            {[25, 50, 75].map(p => (
              <g key={p} stroke="#F3EEE6" strokeOpacity={0.09} strokeWidth={0.25}>
                <line x1={p} y1={0} x2={p} y2={100} />
                <line x1={0} y1={p} x2={100} y2={p} />
              </g>
            ))}
          </svg>
          <div aria-hidden className="absolute left-1/2 top-2 -translate-x-1/2 font-nacelle text-[11px] font-semibold tracking-[0.2em] text-[#F3EEE6]/70">N</div>

          {info.checkpoints.map(c => (
            <div
              key={c.name}
              title={c.reached ? `${c.name} — lantern lit` : c.name}
              className={cx('absolute -translate-x-1/2 -translate-y-1/2', c.reached ? 'text-[#F5B455]/90' : 'text-[#F3EEE6]/45')}
              style={at(c.u, c.v)}
            >
              <LanternIcon className={cx(styles.hudIcon, 'h-4 w-4')} />
            </div>
          ))}

          <div title="The Beacon" className="absolute -translate-x-1/2 -translate-y-1/2 text-[#FFE2B0]" style={at(info.beacon.u, info.beacon.v)}>
            <BeaconIcon className={cx(styles.hudIcon, 'h-5 w-5')} />
          </div>

          {info.shards.map((s, i) => (
            <button
              key={s.name}
              type="button"
              aria-label={`${s.name}: ${s.collected ? 'found' : s.hint}`}
              className="absolute grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 place-items-center outline-none"
              style={at(s.u, s.v)}
              tabIndex={-1}
              onPointerEnter={e => e.pointerType === 'mouse' && setSelected(i)}
              onClick={() => setSelected(selected === i ? null : i)}
            >
              {!s.collected && <span className={cx(styles.markerPulse, 'absolute left-1/2 top-1/2 -ml-2 -mt-2 h-4 w-4 rounded-full border border-[#F5B455]/70')} />}
              <StarIcon
                filled={s.collected}
                className={cx(
                  'relative h-[18px] w-[18px] transition-transform duration-150',
                  s.collected ? cx(styles.starGlow, 'text-[#F5B455]') : 'text-[#F5B455] drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]',
                  selected === i && 'scale-125',
                )}
              />
            </button>
          ))}

          <div className="absolute -translate-x-1/2 -translate-y-1/2" style={at(info.player.u, info.player.v)}>
            <div style={{ transform: `rotate(${Math.PI - info.player.yaw}rad)` }}>
              <ArrowIcon className="h-[18px] w-[18px] text-[#F3EEE6] drop-shadow-[0_0_4px_rgba(0,0,0,0.7)]" />
            </div>
          </div>

          {sel && selected !== null && <MapTooltip u={sel.u} v={sel.v} name={sel.name} hint={sel.hint} collected={sel.collected} />}
        </div>

        <div className="min-w-0 flex-1">
          <ul className="space-y-px">
            {info.shards.map((s, i) => (
              <li key={s.name}>
                <button
                  type="button"
                  data-nav
                  onFocus={() => setSelected(i)}
                  onMouseEnter={() => setSelected(i)}
                  onClick={() => setSelected(i)}
                  className={cx(
                    'flex w-full items-start gap-3 rounded-[3px] px-2.5 py-2 text-left outline-none transition-colors duration-150',
                    selected === i ? 'bg-[#F3EEE6]/[0.07]' : 'hover:bg-[#F3EEE6]/[0.04]',
                  )}
                >
                  <StarIcon filled={s.collected} className={cx('mt-[3px] h-3.5 w-3.5 shrink-0', s.collected ? 'text-[#F5B455]' : 'text-[#F3EEE6]/45')} />
                  <span className="min-w-0">
                    <span className={cx('block text-[13px]', s.collected ? 'text-[#F3EEE6]' : 'text-[#F3EEE6]/75')}>{s.name}</span>
                    <span className="block truncate text-[12px] text-[#F3EEE6]/40">{s.collected ? 'Recovered' : s.hint}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <Legend />
        </div>
      </div>
    </div>
  )
}

function MapTooltip({ u, v, name, hint, collected }: { u: number; v: number; name: string; hint: string; collected: boolean }) {
  const right = u > 0.58
  const below = v < 0.3
  return (
    <div
      className="pointer-events-none absolute z-10 w-[200px] rounded-[3px] border border-[#F3EEE6]/12 bg-[#0B0F14]/95 px-3 py-2.5 shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
      style={{
        ...at(u, v),
        transform: `translate(${right ? 'calc(-100% - 14px)' : '14px'}, ${below ? '10px' : 'calc(-100% - 10px)'})`,
      }}
    >
      <div className={cx(LABEL, 'text-[9.5px]', collected ? 'text-[#F5B455]' : 'text-[#F3EEE6]/45')}>{collected ? 'Recovered' : 'Not yet found'}</div>
      <div className="mt-1 font-nacelle text-[15px] leading-tight text-[#F3EEE6]">{name}</div>
      <div className="mt-1 text-[12px] leading-snug text-[#F3EEE6]/60">{hint}</div>
    </div>
  )
}

function Legend() {
  const item = 'flex items-center gap-1.5'
  return (
    <div className="mt-5 flex flex-wrap gap-x-3.5 gap-y-2 border-t border-[#F3EEE6]/10 pt-4 text-[11px] text-[#F3EEE6]/45">
      <span className={item}><StarIcon filled={false} className="h-3 w-3 text-[#F5B455]" />Shard</span>
      <span className={item}><StarIcon className="h-3 w-3 text-[#F5B455]" />Found</span>
      <span className={item}><LanternIcon className="h-3.5 w-3.5 text-[#F5B455]/90" />Lantern</span>
      <span className={item}><BeaconIcon className="h-3.5 w-3.5 text-[#FFE2B0]" />Beacon</span>
      <span className={item}><ArrowIcon className="h-3 w-3 rotate-45 text-[#F3EEE6]" />You</span>
    </div>
  )
}
