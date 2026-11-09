'use client'
/**
 * Title screen over the live 3D scene: wordmark, menu (bottom-left), sub-panels on the right.
 * The very first launch asks for the device (graphics preset) before showing the menu.
 */
import Link from 'next/link'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { playUi, useGameUi, useNet, usePresence, useUi } from './context'
import { Button, KeyCap, MenuList, PanelHeader, type MenuEntry } from './controls'
import { ControlsPanel } from './ControlsPanel'
import { CreditsPanel } from './CreditsPanel'
import { DevicePicker } from './DevicePicker'
import { BackIcon } from './icons'
import { focusFirst, useMenuNav } from './nav'
import { OnlinePanel } from './OnlinePanel'
import { BackHint, Panel } from './Panel'
import { SettingsPanel } from './SettingsPanel'
import { cx, formatTime, LABEL, STANDALONE } from './theme'
import styles from './ui.module.css'
import { Wordmark } from './Wordmark'

type TitlePanel = 'online' | 'settings' | 'controls' | 'credits' | 'confirmNew'

interface SaveSummary {
  shards: number
  total: number
  place: string
  time: number
}

export function TitleScreen() {
  const phase = useUi(s => s.phase)
  const visible = phase === 'title'
  const mounted = usePresence(visible, 320)
  if (!mounted) return null
  return <TitleContent state={visible ? 'open' : 'closed'} />
}

function TitleContent({ state }: { state: 'open' | 'closed' }) {
  const { game, touch } = useGameUi()
  const [panel, setPanel] = useState<TitlePanel | null>(null)
  const [hasSave] = useState(() => game.hasSave())
  const [best] = useState(() => game.bestTime)
  const [summary, setSummary] = useState<SaveSummary | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const [opener, setOpener] = useState('')
  const [deviceSetup, setDeviceSetup] = useState(() => game.needsDeviceSetup)
  const room = useNet(s => s.room)
  const roomPlayers = useNet(s => s.players.length)

  useEffect(() => {
    if (!hasSave) return
    let live = true
    Promise.all([import('../engine/save'), import('../engine/world/level')])
      .then(([save, level]) => {
        const s = save.loadSave()
        if (!live || !s) return
        setSummary({
          shards: s.shards.filter(Boolean).length,
          total: level.TOTAL_SHARDS,
          place: level.CHECKPOINTS.find(c => c.id === s.checkpoint)?.name ?? '',
          time: s.playTime,
        })
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [hasSave])

  // Focus: first item on arrival, the panel when one opens, the opener when it closes.
  useEffect(() => {
    if (state !== 'open' || deviceSetup) return
    if (panel) focusFirst(panelRef.current, '[data-autofocus]')
    else focusFirst(menuRef.current, opener ? `[data-id="${opener}"]` : undefined)
  }, [panel, opener, state, deviceSetup])

  const open = (p: TitlePanel, from: string) => {
    setOpener(from)
    playUi(game, 'ui-open')
    setPanel(p)
  }
  const back = () => {
    playUi(game, 'ui-back')
    setPanel(null)
  }

  useMenuNav({
    scope: panel || deviceSetup ? panelRef : menuRef,
    enabled: state === 'open',
    onBack: panel && !deviceSetup ? back : undefined,
  })

  if (deviceSetup) {
    return (
      <div data-state={state} className={cx(styles.presence, 'absolute inset-0 z-50')}>
        <div aria-hidden className={cx(styles.titleScrim, 'absolute inset-0')} />
        <div aria-hidden className={cx(styles.panelScrim, 'absolute inset-0')} />
        <div className="absolute inset-0 flex items-center justify-center px-[clamp(16px,3vw,48px)] py-[clamp(16px,6vh,64px)]">
          <Panel panelRef={panelRef} label="Choose your device">
            <DevicePicker onDone={() => setDeviceSetup(false)} />
          </Panel>
        </div>
      </div>
    )
  }

  const start = () => game.newGame()
  const startHint = summary
    ? `Continues your journey · ${summary.shards} of ${summary.total} shards`
    : hasSave
      ? 'Continues your journey'
      : 'Begins a new journey'
  const items: MenuEntry[] = [
    ...(hasSave
      ? [{
          id: 'continue',
          label: 'Continue',
          meta: summary ? `${summary.place ? `${summary.place} · ` : ''}${summary.shards} of ${summary.total} shards` : undefined,
          onSelect: () => game.continueGame(),
        }]
      : []),
    { id: 'new', label: 'New Game', onSelect: () => (hasSave ? open('confirmNew', 'new') : start()) },
    { id: 'creative', label: 'Creative', meta: 'Build & fly · no enemies', onSelect: () => game.startCreative() },
    {
      id: 'online',
      label: 'Play Online',
      meta: room ? `${room.name} · ${Math.max(room.players, roomPlayers)} / ${room.max}` : undefined,
      onSelect: () => open('online', 'online'),
    },
    { id: 'settings', label: 'Settings', onSelect: () => open('settings', 'settings') },
    { id: 'controls', label: 'Controls', onSelect: () => open('controls', 'controls') },
    { id: 'credits', label: 'Credits', onSelect: () => open('credits', 'credits') },
  ]

  return (
    <div data-state={state} className={cx(styles.presence, 'absolute inset-0 z-50')}>
      <div aria-hidden className={cx(styles.titleScrim, 'absolute inset-0')} />
      <div aria-hidden className="absolute inset-0 bg-[#0B0F14]/25 md:hidden" />
      <div aria-hidden className={cx(styles.panelScrim, 'absolute inset-0 transition-opacity duration-300', panel ? 'opacity-100' : 'opacity-0')} />

      <div className="absolute inset-0 flex">
        <aside
          className={cx(
            'relative flex h-full w-full shrink-0 flex-col px-[clamp(20px,6vw,88px)] py-[clamp(24px,7vh,72px)] md:w-[min(46vw,600px)]',
            panel && 'max-md:hidden',
          )}
        >
          {!STANDALONE && (
            <Link
              href="/games"
              className="absolute left-[clamp(20px,6vw,88px)] top-[clamp(18px,4vh,36px)] inline-flex items-center gap-2 text-[12px] uppercase tracking-[0.18em] text-[#F3EEE6]/50 transition-colors duration-150 hover:text-[#F3EEE6]"
            >
              <BackIcon className="h-4 w-4" /> Arcade
            </Link>
          )}

          <div className={cx('mt-[18vh] transition-opacity duration-300 [@media(max-height:640px)]:mt-[9vh]', panel && 'opacity-30')}>
            <Wordmark />
            <p className={cx(styles.rise, 'mt-6 max-w-[380px] text-[15px] leading-relaxed text-[#F3EEE6]/65')} style={{ '--d': '80ms' } as CSSProperties}>
              Seven stars fell on the island. Bring them home and light the Beacon.
            </p>
          </div>

          <div ref={menuRef} className="mt-auto pt-8">
            <MenuList items={items} current={panel ? opener : null} />
          </div>

          <footer className={cx(styles.rise, 'mt-7 flex items-center gap-5 text-[12px] text-[#F3EEE6]/40')} style={{ '--d': '420ms' } as CSSProperties}>
            {best !== null ? (
              <span>
                <span className={cx(LABEL, 'mr-2 text-[10px] text-[#F5B455]/80')}>Best time</span>
                <span className="tabular-nums text-[#F3EEE6]/70">{formatTime(best)}</span>
              </span>
            ) : (
              <span>A third-person island adventure</span>
            )}
          </footer>
        </aside>

        {panel && (
          <div className="flex min-w-0 flex-1 items-start px-[clamp(16px,3vw,48px)] py-[clamp(16px,9vh,88px)] md:pl-0">
            <Panel panelRef={panelRef} label={panel}>
              {panel === 'online' && (
                <OnlinePanel onBack={back} primary={{ label: 'Start', hint: startHint, onClick: () => (hasSave ? game.continueGame() : start()) }} />
              )}
              {panel === 'settings' && <SettingsPanel onBack={back} />}
              {panel === 'controls' && <ControlsPanel onBack={back} />}
              {panel === 'credits' && <CreditsPanel onBack={back} />}
              {panel === 'confirmNew' && (
                <div>
                  <PanelHeader eyebrow="New game" title="Start a new journey?" aside={<BackHint onBack={back} />} />
                  <p className="max-w-[460px] text-[15px] leading-relaxed text-[#F3EEE6]/70">
                    {summary
                      ? `Your current journey — ${summary.shards} of ${summary.total} shards, ${formatTime(summary.time)} played — will be erased.`
                      : 'Your current journey will be erased.'}{' '}
                    Settings and your best time are kept.
                  </p>
                  <div className="mt-8 flex flex-wrap gap-3">
                    <Button variant="danger" onClick={start}>
                      Erase and start
                    </Button>
                    <Button onClick={back} autofocus>
                      Keep my save
                    </Button>
                  </div>
                </div>
              )}
            </Panel>
          </div>
        )}
      </div>

      {!touch && !panel && (
        <div aria-hidden className={cx(styles.rise, 'absolute bottom-[clamp(24px,7vh,72px)] right-[clamp(20px,6vw,88px)] hidden items-center gap-5 text-[11px] uppercase tracking-[0.16em] text-[#F3EEE6]/40 md:flex')} style={{ '--d': '600ms' } as CSSProperties}>
          <span className="flex items-center gap-2"><KeyCap>↑</KeyCap><KeyCap>↓</KeyCap>Select</span>
          <span className="flex items-center gap-2"><KeyCap>Enter</KeyCap>Confirm</span>
        </div>
      )}
    </div>
  )
}
