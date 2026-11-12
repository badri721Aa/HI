'use client'
/**
 * Starfall Isle — React host.
 *
 * Loads the engine with a dynamic import (three.js never reaches the server
 * bundle), creates exactly one Game per mount (StrictMode-safe), and layers
 * the UI over its canvas. All UI state flows from the engine's bus through a
 * UiStore and from the HUD store; nothing here polls the engine.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { Game } from './engine/Game'
import { Announcements } from './ui/Announcements'
import { GameContext, type GameUi } from './ui/context'
import { Button } from './ui/controls'
import { CutsceneOverlay } from './ui/CutsceneOverlay'
import { DialogBox } from './ui/DialogBox'
import { Hud } from './ui/Hud'
import { LoadingScreen } from './ui/LoadingScreen'
import { NetStore } from './ui/netStore'
import { OnlineLayer } from './ui/OnlineHud'
import { PauseMenu } from './ui/PauseMenu'
import { ScreenFx } from './ui/ScreenFx'
import { TitleScreen } from './ui/TitleScreen'
import { TouchControls } from './ui/TouchControls'
import styles from './ui/ui.module.css'
import { UiStore } from './ui/uiStore'
import { VictoryScreen } from './ui/VictoryScreen'

declare global {
  interface Window {
    __starfall?: Game
  }
}

export default function StarfallGame() {
  const hostRef = useRef<HTMLDivElement>(null)
  const [store] = useState(() => new UiStore())
  const [net] = useState(() => new NetStore())
  const [game, setGame] = useState<Game | null>(null)
  const [forceTouch, setForceTouch] = useState(false)
  const [bootError, setBootError] = useState<string | null>(null)
  const phase = useSyncExternalStore(store.subscribe, () => store.get().phase, () => store.get().phase)
  const load = useSyncExternalStore(store.subscribe, () => store.get().load, () => store.get().load)
  const engineError = useSyncExternalStore(store.subscribe, () => store.get().error, () => store.get().error)

  // Cover the site chrome: no page scroll behind the game.
  useEffect(() => {
    const html = document.documentElement
    const prev = [html.style.overflow, document.body.style.overflow, document.body.style.overscrollBehavior]
    html.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    document.body.style.overscrollBehavior = 'none'
    return () => {
      ;[html.style.overflow, document.body.style.overflow, document.body.style.overscrollBehavior] = prev
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    let instance: Game | null = null
    let detach: (() => void) | null = null
    let detachNet: (() => void) | null = null

    import('./engine/Game')
      .then(({ Game }) => {
        if (cancelled || !hostRef.current) return
        try {
          instance = new Game(hostRef.current)
        } catch (err) {
          setBootError(`WebGL could not start: ${(err as Error).message}`)
          return
        }
        detach = store.attach(instance)
        detachNet = net.attach(instance)
        window.__starfall = instance
        setForceTouch(new URLSearchParams(window.location.search).get('touch') === '1')
        setGame(instance)
        instance.load().catch((err: unknown) => {
          if (!cancelled) setBootError((err as Error)?.message ?? String(err))
        })
      })
      .catch((err: unknown) => {
        if (!cancelled) setBootError(`The game failed to download: ${(err as Error)?.message ?? err}`)
      })

    return () => {
      cancelled = true
      detach?.()
      detachNet?.()
      if (instance) {
        if (window.__starfall === instance) delete window.__starfall
        instance.dispose()
      }
    }
  }, [store, net])

  // Audio may only start after a user gesture.
  useEffect(() => {
    if (!game) return
    const unlock = () => {
      try {
        game.ctx.audio?.unlock()
      } catch {
        /* audio is optional */
      }
      window.removeEventListener('pointerdown', unlock, true)
      window.removeEventListener('keydown', unlock, true)
    }
    window.addEventListener('pointerdown', unlock, true)
    window.addEventListener('keydown', unlock, true)
    return () => {
      window.removeEventListener('pointerdown', unlock, true)
      window.removeEventListener('keydown', unlock, true)
    }
  }, [game])

  // The pause-menu map image costs a noticeable moment to generate; do it while the
  // loading screen is still up so it never hitches gameplay or the menus.
  const [mapReady, setMapReady] = useState(false)
  useEffect(() => {
    if (!game || mapReady || phase === 'loading') return
    const t = setTimeout(() => {
      try {
        game.getMapImage()
      } catch {
        /* the map panel shows its own fallback */
      }
      setMapReady(true)
    }, 60)
    return () => clearTimeout(t)
  }, [game, phase, mapReady])

  const value = useMemo<GameUi | null>(() => (game ? { game, store, net, touch: game.isTouch || forceTouch } : null), [game, store, net, forceTouch])

  const error = bootError ?? (phase === 'loading' ? engineError : null)
  const loading = phase === 'loading' || (phase === 'title' && !mapReady) || !!error
  const runtimeError = !loading && engineError

  return (
    <div
      // Touch layout: the shared controls grow to 44 px targets (see ui.module.css).
      data-touch={value?.touch ?? false}
      className={`${styles.root} fixed inset-0 z-[60] isolate touch-none select-none overflow-hidden bg-[#0B0F14] font-inter text-[#F3EEE6]`}
    >
      <div
        ref={hostRef}
        className="absolute inset-0"
        onClick={() => {
          // Clicking the world takes the mouse back (pointer lock is lost on Esc / alt-tab).
          if (game && phase === 'playing' && !store.get().pointerLocked && !value?.touch) game.requestPointerLock()
        }}
      />

      {value && (
        <GameContext.Provider value={value}>
          <ScreenFx />
          <CutsceneOverlay />
          <Hud />
          <TouchControls />
          <OnlineLayer />
          <Announcements />
          <DialogBox />
          <TitleScreen />
          <PauseMenu />
          <VictoryScreen />
        </GameContext.Provider>
      )}

      <LoadingGate loading={loading} progress={load.progress} label={phase === 'loading' ? load.label : 'Charting the island'} error={error} />
      {runtimeError && <RuntimeError message={runtimeError} />}
    </div>
  )
}

/** Keeps the loading screen up for its fade-out after the title appears. */
function LoadingGate({ loading, progress, label, error }: { loading: boolean; progress: number; label: string; error: string | null }) {
  const [gone, setGone] = useState(false)
  useEffect(() => {
    if (loading) return
    const t = setTimeout(() => setGone(true), 720)
    return () => clearTimeout(t)
  }, [loading])
  if (gone && !loading) return null
  return <LoadingScreen progress={loading ? progress : 1} label={label} error={error} state={loading ? 'open' : 'closed'} />
}

function RuntimeError({ message }: { message: string }) {
  return (
    <div className="absolute inset-x-0 bottom-6 z-[90] flex justify-center px-4">
      <div className="flex max-w-[560px] items-center gap-4 rounded-[6px] border border-[#E8664F]/40 bg-[#0B0F14]/95 px-4 py-3 text-[13px] text-[#F3EEE6]/80">
        <span className="min-w-0 truncate">Something went wrong: {message}</span>
        <Button variant="primary" size="sm" onClick={() => window.location.reload()}>
          Reload
        </Button>
      </div>
    </div>
  )
}
