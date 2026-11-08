'use client'
/** Pause menu: resume / map / settings / controls / restart / quit, with run stats. */
import { useEffect, useRef, type CSSProperties } from 'react'
import { playUi, useGameUi, useHud, usePresence, useUi } from './context'
import { Button, KeyCap, MenuList, PanelHeader, type MenuEntry } from './controls'
import { ControlsPanel } from './ControlsPanel'
import { StarIcon } from './icons'
import { MapPanel } from './MapPanel'
import { focusEl, focusFirst, useMenuNav } from './nav'
import { BackHint, Panel } from './Panel'
import { SettingsPanel } from './SettingsPanel'
import { cx, formatTime, LABEL } from './theme'
import styles from './ui.module.css'
import type { PausePanel } from './uiStore'

/** Ignore Esc/P this long after opening, so the key that paused can't instantly resume. */
const REOPEN_GUARD_MS = 350

export function PauseMenu() {
  const phase = useUi(s => s.phase)
  const visible = phase === 'paused'
  const mounted = usePresence(visible, 240)
  if (!mounted) return null
  return <PauseContent state={visible ? 'open' : 'closed'} />
}

function PauseContent({ state }: { state: 'open' | 'closed' }) {
  const { game, store, touch } = useGameUi()
  const panel = useUi(s => s.pausePanel)
  const zone = useHud(h => h.zone)
  const menuRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const lastOpener = useRef<PausePanel>('root')

  useEffect(() => {
    if (state !== 'open') return
    if (panel === 'map') focusEl(panelRef.current, true)
    else if (panel !== 'root') focusFirst(panelRef.current, '[data-autofocus]')
    else focusFirst(menuRef.current, `[data-id="${lastOpener.current === 'root' ? 'resume' : lastOpener.current}"]`)
  }, [panel, state])

  const go = (p: PausePanel) => {
    if (p !== 'root') lastOpener.current = p
    playUi(game, p === 'root' ? 'ui-back' : 'ui-open')
    store.setPausePanel(p)
  }
  const resume = () => game.resume()

  useMenuNav({
    scope: panel === 'root' ? menuRef : panelRef,
    enabled: state === 'open',
    onBack: panel !== 'root' ? () => go('root') : undefined,
    onKey: e => {
      const isEsc = e.key === 'Escape'
      if (isEsc || e.code === 'KeyP') {
        if (e.repeat || performance.now() - store.get().pausedAt < REOPEN_GUARD_MS) return true
        if (panel !== 'root') go('root')
        else resume()
        return true
      }
      if (e.code === 'KeyM' && !e.repeat) {
        go(panel === 'map' ? 'root' : 'map')
        return true
      }
      return false
    },
  })

  const items: MenuEntry[] = [
    { id: 'resume', label: 'Resume', onSelect: resume },
    { id: 'map', label: 'Map', onSelect: () => go('map') },
    { id: 'settings', label: 'Settings', onSelect: () => go('settings') },
    { id: 'controls', label: 'Controls', onSelect: () => go('controls') },
    { id: 'restart', label: 'Restart from checkpoint', onSelect: () => game.restartFromCheckpoint(), separated: true },
    { id: 'quit', label: 'Quit to title', onSelect: () => go('quit') },
  ]
  const open = panel !== 'root'

  return (
    <div data-state={state} className={cx(styles.presence, 'absolute inset-0 z-50')}>
      <div aria-hidden className={cx(styles.pauseScrim, 'absolute inset-0')} />

      <div className="absolute inset-0 flex">
        <aside
          className={cx(
            'relative flex h-full w-full shrink-0 flex-col px-[clamp(20px,6vw,88px)] py-[clamp(24px,7vh,72px)] md:w-[min(40vw,460px)]',
            open && 'max-md:hidden',
          )}
        >
          <div className={styles.rise}>
            <div className={cx(LABEL, 'text-[#F5B455]')}>Paused</div>
            <h1 className="mt-2 font-nacelle text-[clamp(30px,3.6vw,44px)] font-semibold leading-none tracking-[-0.01em] text-[#F3EEE6]">
              {zone || 'Starfall Isle'}
            </h1>
          </div>
          <RunLine className="mt-4 md:hidden" />

          <div ref={menuRef} className="mt-auto pt-8">
            <MenuList items={items} current={open ? panel : null} size="md" />
          </div>

          {!touch && !open && (
            <div aria-hidden className={cx(styles.rise, 'mt-8 flex items-center gap-4 text-[11px] uppercase tracking-[0.16em] text-[#F3EEE6]/35')} style={{ '--d': '420ms' } as CSSProperties}>
              <span className="flex items-center gap-2"><KeyCap>Esc</KeyCap>Resume</span>
              <span className="flex items-center gap-2"><KeyCap>M</KeyCap>Map</span>
            </div>
          )}
        </aside>

        {open && (
          <div className="flex min-w-0 flex-1 items-start px-[clamp(16px,3vw,48px)] py-[clamp(16px,9vh,88px)] md:pl-0">
            <Panel panelRef={panelRef} label={panel} wide={panel === 'map'}>
              {panel === 'map' && <MapPanel onBack={() => go('root')} />}
              {panel === 'settings' && <SettingsPanel onBack={() => go('root')} />}
              {panel === 'controls' && <ControlsPanel onBack={() => go('root')} />}
              {panel === 'quit' && (
                <div>
                  <PanelHeader eyebrow="Quit" title="Return to the title screen?" aside={<BackHint onBack={() => go('root')} />} />
                  <p className="max-w-[440px] text-[15px] leading-relaxed text-[#F3EEE6]/70">
                    Your shards and sparks are saved. You will continue from the last lantern you lit.
                  </p>
                  <div className="mt-8 flex flex-wrap gap-3">
                    <Button variant="danger" onClick={() => game.quitToTitle()}>
                      Quit to title
                    </Button>
                    <Button onClick={() => go('root')} autofocus>
                      Keep playing
                    </Button>
                  </div>
                </div>
              )}
            </Panel>
          </div>
        )}
      </div>

      {!open && <RunStats />}
    </div>
  )
}

function useRun() {
  const playTime = useHud(h => h.playTime)
  const shards = useHud(h => h.shards)
  const sparks = useHud(h => h.sparks)
  const sparksTotal = useHud(h => h.sparksTotal)
  const deaths = useHud(h => h.deaths)
  return { playTime, shards, found: shards.filter(Boolean).length, sparks, sparksTotal, deaths }
}

/** Compact one-liner for narrow screens. */
function RunLine({ className }: { className?: string }) {
  const r = useRun()
  return (
    <div className={cx('text-[13px] text-[#F3EEE6]/55', className)}>
      {formatTime(r.playTime)} · {r.found} of {r.shards.length} shards · {r.sparks} sparks
    </div>
  )
}

function RunStats() {
  const r = useRun()
  const cell = 'min-w-[96px] border-l border-[#F3EEE6]/12 pl-5 first:border-l-0 first:pl-0'
  return (
    <div className={cx(styles.rise, 'absolute bottom-[clamp(24px,7vh,72px)] right-[clamp(20px,6vw,88px)] hidden md:block')} style={{ '--d': '200ms' } as CSSProperties}>
      <div className={cx(LABEL, 'mb-4 text-right text-[10px] text-[#F3EEE6]/40')}>This journey</div>
      <div className="flex items-end">
        <Stat className={cell} label="Time" value={formatTime(r.playTime)} />
        <div className={cell}>
          <div className={cx(LABEL, 'text-[10px] text-[#F3EEE6]/40')}>Shards</div>
          <div className="mt-1.5 font-nacelle text-[26px] leading-none text-[#F3EEE6]">
            {r.found}
            <span className="text-[#F3EEE6]/35"> / {r.shards.length}</span>
          </div>
          <div className="mt-2 flex gap-[3px]">
            {r.shards.map((got, i) => (
              <StarIcon key={i} filled={got} className={cx('h-2.5 w-2.5', got ? 'text-[#F5B455]' : 'text-[#F3EEE6]/30')} />
            ))}
          </div>
        </div>
        <Stat className={cell} label="Sparks" value={String(r.sparks)} sub={r.sparksTotal ? `/ ${r.sparksTotal}` : undefined} />
        <Stat className={cell} label="Falls" value={String(r.deaths)} />
      </div>
    </div>
  )
}

function Stat({ label, value, sub, className }: { label: string; value: string; sub?: string; className?: string }) {
  return (
    <div className={className}>
      <div className={cx(LABEL, 'text-[10px] text-[#F3EEE6]/40')}>{label}</div>
      <div className="mt-1.5 font-nacelle text-[26px] leading-none text-[#F3EEE6]">
        {value}
        {sub && <span className="text-[#F3EEE6]/35"> {sub}</span>}
      </div>
      <div className="mt-2 h-2.5" />
    </div>
  )
}
