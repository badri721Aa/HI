'use client'
// STUB host — replaced by the UI builder.
import { useEffect, useRef, useState } from 'react'
import type { Game } from './engine/Game'
import type { GamePhase } from './engine/events'

export default function StarfallGame() {
  const hostRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<Game | null>(null)
  const [phase, setPhase] = useState<GamePhase>('loading')
  const [load, setLoad] = useState({ progress: 0, label: 'Starting' })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let game: Game | null = null
    let cancelled = false
    import('./engine/Game').then(({ Game }) => {
      if (cancelled || !hostRef.current) return
      game = new Game(hostRef.current)
      gameRef.current = game
      ;(window as unknown as { __starfall?: Game }).__starfall = game
      game.bus.on('ui:phase', e => setPhase(e.phase))
      game.bus.on('ui:load', e => setLoad(e))
      game.bus.on('ui:error', e => setError(e.message))
      game.load().catch(err => setError(String(err)))
    })
    return () => {
      cancelled = true
      game?.dispose()
    }
  }, [])

  return (
    <div className="fixed inset-0 z-[60] bg-black">
      <div ref={hostRef} className="absolute inset-0" />
      {phase === 'loading' && <div className="absolute inset-0 grid place-items-center text-white">{Math.round(load.progress * 100)}% — {load.label}</div>}
      {phase === 'title' && <button className="absolute inset-0 text-3xl text-white" onClick={() => gameRef.current?.newGame()}>Click to start</button>}
      {phase === 'paused' && <button className="absolute inset-0 bg-black/50 text-3xl text-white" onClick={() => gameRef.current?.resume()}>Paused — click to resume</button>}
      {error && <div className="absolute bottom-4 left-4 text-red-400">{error}</div>}
    </div>
  )
}
