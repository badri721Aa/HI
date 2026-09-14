'use client'

import { useState, useRef } from 'react'

interface Game {
  id: string
  title: string
  description: string
  category: string
  icon: string
  url: string
  tags?: string[]
}

const GAMES: Game[] = [
  { id: 'tetris', title: 'Tetris', description: 'Classic block puzzle game', category: 'Puzzle', icon: '🟦', url: 'https://tetris.com/play-tetris/', tags: ['classic', 'puzzle'] },
  { id: '2048', title: '2048', description: 'Merge tiles to reach 2048', category: 'Puzzle', icon: '🔢', url: 'https://play2048.co/', tags: ['puzzle', 'math'] },
  { id: 'snake', title: 'Snake', description: 'Classic Nokia snake game', category: 'Arcade', icon: '🐍', url: 'https://playsnake.org/', tags: ['classic', 'arcade'] },
  { id: 'cookie', title: 'Cookie Clicker', description: 'Idle clicking game', category: 'Idle', icon: '🍪', url: 'https://orteil.dashnet.org/cookieclicker/', tags: ['idle', 'clicker'] },
  { id: 'chess', title: 'Chess', description: 'Play chess vs AI or online', category: 'Strategy', icon: '♟️', url: 'https://lichess.org/', tags: ['strategy', 'classic'] },
  { id: 'sudoku', title: 'Sudoku', description: 'Number logic puzzle', category: 'Puzzle', icon: '🔲', url: 'https://sudoku.com/', tags: ['puzzle', 'numbers'] },
  { id: 'wordle', title: 'Wordle', description: 'Guess the 5-letter word', category: 'Word', icon: '🟩', url: 'https://www.nytimes.com/games/wordle/index.html', tags: ['word', 'daily'] },
  { id: 'minesweeper', title: 'Minesweeper', description: 'Classic mine-finding game', category: 'Puzzle', icon: '💣', url: 'https://minesweeper.online/', tags: ['classic', 'puzzle'] },
  { id: 'pacman', title: 'Pac-Man', description: 'The arcade legend', category: 'Arcade', icon: '👻', url: 'https://freepacman.org/', tags: ['classic', 'arcade'] },
  { id: 'dino', title: 'Chrome Dino', description: 'Jump over cacti', category: 'Arcade', icon: '🦕', url: 'https://chromedino.com/', tags: ['arcade', 'endless'] },
  { id: 'basketball', title: 'Basketball Stars', description: 'Multiplayer basketball', category: 'Sports', icon: '🏀', url: 'https://www.basketball-stars.io/', tags: ['sports', 'multiplayer'] },
  { id: 'slope', title: 'Slope', description: 'Roll down an endless slope', category: 'Arcade', icon: '⬇️', url: 'https://slope-game.com/', tags: ['endless', '3d'] },
  { id: 'ballsort', title: 'Ball Sort', description: 'Sort colored balls into tubes', category: 'Puzzle', icon: '🎱', url: 'https://ballsortpuzzle.com/', tags: ['puzzle', 'color'] },
  { id: 'agar', title: 'Agar.io', description: 'Grow by eating smaller cells', category: 'Multiplayer', icon: '🔵', url: 'https://agar.io/', tags: ['multiplayer', 'io'] },
  { id: 'slither', title: 'Slither.io', description: 'Multiplayer snake game', category: 'Multiplayer', icon: '🐛', url: 'https://slither.io/', tags: ['multiplayer', 'io'] },
  { id: 'run3', title: 'Run 3', description: 'Infinite tunnel runner', category: 'Arcade', icon: '🏃', url: 'https://www.coolmathgames.com/0-run-3', tags: ['endless', 'arcade'] },
  { id: 'papergames', title: 'Paper Minecraft', description: '2D Minecraft in your browser', category: 'Sandbox', icon: '⛏️', url: 'https://scratch.mit.edu/projects/10128407/', tags: ['sandbox', 'craft'] },
  { id: 'drift', title: 'Drift Boss', description: 'Car drifting arcade game', category: 'Racing', icon: '🚗', url: 'https://driftboss.io/', tags: ['racing', 'arcade'] },
  { id: 'hearts', title: 'Hearts', description: 'Classic card game', category: 'Card', icon: '♥️', url: 'https://www.247hearts.com/', tags: ['cards', 'classic'] },
  { id: 'mahjong', title: 'Mahjong', description: 'Match tile pairs to clear the board', category: 'Puzzle', icon: '🀄', url: 'https://www.247mahjong.com/', tags: ['puzzle', 'classic'] },
]

const NES_ROMS = [
  { title: 'Super Mario Bros', system: 'NES', rom: 'Super Mario Bros (Japan, USA).nes' },
  { title: 'Tetris (NES)', system: 'NES', rom: 'Tetris (Japan) (En).nes' },
  { title: 'Contra', system: 'NES', rom: 'Contra (USA).nes' },
  { title: 'Mega Man 2', system: 'NES', rom: 'Mega Man 2 (USA).nes' },
]

const CATEGORIES = ['All', 'Arcade', 'Puzzle', 'Strategy', 'Multiplayer', 'Sports', 'Racing', 'Word', 'Idle', 'Sandbox', 'Card']

export default function GamesPage() {
  const [activeGame, setActiveGame] = useState<Game | null>(null)
  const [category, setCategory] = useState('All')
  const [search, setSearch] = useState('')
  const [loadingGame, setLoadingGame] = useState<string | null>(null)
  const [romFile, setRomFile] = useState<File | null>(null)
  const [activeTab, setActiveTab] = useState<'html5' | 'retro' | 'flash'>('html5')
  const romInputRef = useRef<HTMLInputElement>(null)

  const filtered = GAMES.filter(g => {
    const matchCat = category === 'All' || g.category === category
    const matchSearch = !search || g.title.toLowerCase().includes(search.toLowerCase()) ||
      g.tags?.some(t => t.includes(search.toLowerCase()))
    return matchCat && matchSearch
  })

  function openInProxy(url: string) {
    window.open(`/proxy?url=${encodeURIComponent(url)}`, '_blank')
  }

  function openAboutBlank(url: string) {
    const popup = window.open('about:blank', '_blank', 'width=1200,height=800,menubar=no,toolbar=no,location=no,status=no')
    if (!popup) return
    popup.document.write(`<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>Game</title>
<style>*{margin:0;padding:0;box-sizing:border-box}html,body,iframe{width:100%;height:100%;border:none}</style>
</head><body>
<iframe src="${url}" allow="accelerometer;autoplay;fullscreen;gamepad;gyroscope;pointer-lock" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-pointer-lock allow-downloads allow-modals"></iframe>
</body></html>`)
    popup.document.close()
  }

  function launchEmulator(romUrl?: string) {
    const popup = window.open('about:blank', '_blank', 'width=900,height=700,menubar=no,toolbar=no,location=no')
    if (!popup) return
    const romSrc = romUrl ? `EJS_gameUrl = "${romUrl}";` : ''
    popup.document.write(`<!DOCTYPE html>
<html><head>
<title>Emulator</title>
<style>*{margin:0;padding:0;background:#000}canvas{display:block;margin:auto}</style>
<script src="https://cdn.emulatorjs.org/stable/data/loader.js"></script>
</head><body>
<div id="game"></div>
<script>
  EJS_player = "#game";
  EJS_core = "nes";
  EJS_color = "#6441a5";
  EJS_startOnLoaded = true;
  ${romSrc}
</script>
</body></html>`)
    popup.document.close()
  }

  async function handleRomFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setRomFile(file)
    const url = URL.createObjectURL(file)
    launchEmulator(url)
  }

  function openRuffleFlash(swfUrl: string) {
    const popup = window.open('about:blank', '_blank', 'width=900,height=700,menubar=no,toolbar=no')
    if (!popup) return
    popup.document.write(`<!DOCTYPE html>
<html><head>
<title>Flash Game</title>
<style>*{margin:0;padding:0;background:#111}ruffle-embed{width:100%;height:100vh;display:block}</style>
<script src="https://unpkg.com/@ruffle-rs/ruffle"></script>
</head><body>
<ruffle-embed src="${swfUrl}" allowfullscreen scale="showAll"></ruffle-embed>
</body></html>`)
    popup.document.close()
  }

  return (
    <div className="min-h-screen" style={{ background: 'rgb(9,9,11)' }}>
      {/* Header */}
      <div className="border-b border-white/[0.05]" style={{ paddingTop: '80px' }}>
        <div className="mx-auto max-w-6xl px-6 pb-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">Unblocked Gaming</span>
              </div>
              <h1 className="font-nacelle text-3xl font-semibold text-zinc-100 tracking-tight">Game Arcade</h1>
              <p className="mt-1 text-sm text-zinc-500">All games load through the proxy — fully unblocked</p>
            </div>

            {/* Search */}
            <div className="flex items-center gap-2">
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search games…"
                className="h-9 w-48 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 text-xs text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-white/[0.15]"
              />
            </div>
          </div>

          {/* Tabs */}
          <div className="mt-5 flex items-center gap-1">
            {(['html5', 'retro', 'flash'] as const).map(t => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${
                  activeTab === t ? 'bg-white/[0.08] text-zinc-100 border border-white/[0.1]' : 'text-zinc-600 hover:text-zinc-300'
                }`}
              >
                {t === 'html5' ? 'HTML5 Games' : t === 'retro' ? 'Retro Emulator' : 'Flash Games'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-8">

        {/* HTML5 Games tab */}
        {activeTab === 'html5' && (
          <>
            {/* Category filter */}
            <div className="mb-6 flex items-center gap-1.5 flex-wrap">
              {CATEGORIES.map(c => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`px-3 py-1 rounded-full text-[10px] font-mono transition-all duration-150 ${
                    category === c
                      ? 'bg-violet-500/15 border border-violet-500/30 text-violet-300'
                      : 'border border-white/[0.06] text-zinc-600 hover:text-zinc-300 hover:border-white/[0.12]'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>

            {/* Active game iframe */}
            {activeGame && (
              <div className="mb-6 rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="flex items-center justify-between px-4 py-2.5" style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <span className="text-sm font-medium text-zinc-200">{activeGame.icon} {activeGame.title}</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openAboutBlank(activeGame.url)}
                      className="text-[10px] font-mono text-zinc-500 hover:text-zinc-200 transition-colors px-2 py-1 rounded"
                    >
                      Pop out ↗
                    </button>
                    <button
                      onClick={() => setActiveGame(null)}
                      className="text-[10px] font-mono text-zinc-600 hover:text-red-400 transition-colors px-2 py-1 rounded"
                    >
                      Close ✕
                    </button>
                  </div>
                </div>
                <iframe
                  src={`/api/proxy?url=${encodeURIComponent(activeGame.url)}`}
                  className="w-full"
                  style={{ height: '600px', border: 'none' }}
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-pointer-lock allow-downloads allow-modals"
                  allow="accelerometer; autoplay; fullscreen; gamepad; gyroscope"
                  title={activeGame.title}
                />
              </div>
            )}

            {/* Games grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {filtered.map(g => (
                <div
                  key={g.id}
                  className="group flex flex-col rounded-2xl p-4 cursor-pointer transition-all duration-200 hover:scale-[1.02]"
                  style={{
                    background: activeGame?.id === g.id ? 'rgba(99,59,218,0.1)' : 'rgba(255,255,255,0.02)',
                    border: activeGame?.id === g.id ? '1px solid rgba(99,59,218,0.3)' : '1px solid rgba(255,255,255,0.06)',
                  }}
                  onClick={() => {
                    setLoadingGame(g.id)
                    setActiveGame(g)
                    setTimeout(() => setLoadingGame(null), 1000)
                  }}
                >
                  <div className="text-3xl mb-3">{g.icon}</div>
                  <div className="text-sm font-semibold text-zinc-200 mb-1">{g.title}</div>
                  <div className="text-[10px] text-zinc-600 leading-relaxed flex-1">{g.description}</div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="font-mono text-[9px] text-zinc-700">{g.category}</span>
                    {loadingGame === g.id ? (
                      <span className="font-mono text-[9px] text-violet-400 animate-pulse">Loading…</span>
                    ) : (
                      <div className="flex gap-1">
                        <button
                          onClick={ev => { ev.stopPropagation(); openAboutBlank(g.url) }}
                          className="font-mono text-[9px] text-zinc-700 hover:text-zinc-300 transition-colors px-1"
                          title="Open in popup"
                        >↗</button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {filtered.length === 0 && (
                <div className="col-span-full py-16 text-center font-mono text-xs text-zinc-700">No games match your filter.</div>
              )}
            </div>
          </>
        )}

        {/* Retro Emulator tab */}
        {activeTab === 'retro' && (
          <div className="space-y-6">
            <div
              className="rounded-2xl p-6"
              style={{ background: 'rgba(99,59,218,0.05)', border: '1px solid rgba(99,59,218,0.15)' }}
            >
              <h2 className="font-nacelle text-xl font-semibold text-zinc-100 mb-2">Retro Emulator</h2>
              <p className="text-sm text-zinc-500 mb-5">Load your own ROM files or browse the pre-configured library. Opens in a pop-out window.</p>

              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={() => romInputRef.current?.click()}
                  className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-zinc-100 transition-all hover:scale-[1.02]"
                  style={{ background: 'rgba(99,59,218,0.2)', border: '1px solid rgba(99,59,218,0.35)' }}
                >
                  📁 Load ROM File
                </button>
                <button
                  onClick={() => launchEmulator()}
                  className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-5 py-2.5 text-sm text-zinc-300 transition-all hover:bg-white/[0.08]"
                >
                  ▶ Open Emulator
                </button>
                <input
                  ref={romInputRef}
                  type="file"
                  accept=".nes,.smc,.snes,.gb,.gbc,.gba,.n64,.z64,.rom"
                  onChange={handleRomFile}
                  className="hidden"
                />
              </div>
              {romFile && (
                <p className="mt-3 font-mono text-[10px] text-violet-400">Loaded: {romFile.name}</p>
              )}
            </div>

            <div>
              <div className="mb-4 font-mono text-[10px] text-zinc-600 uppercase tracking-widest">Suggested ROMs</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {NES_ROMS.map(r => (
                  <div
                    key={r.rom}
                    className="flex items-center gap-3 rounded-xl px-4 py-3 cursor-pointer transition-all hover:bg-white/[0.04]"
                    style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
                  >
                    <span className="text-lg">🎮</span>
                    <div className="flex-1">
                      <div className="text-sm text-zinc-200">{r.title}</div>
                      <div className="font-mono text-[10px] text-zinc-600">{r.system}</div>
                    </div>
                    <div className="font-mono text-[10px] text-zinc-700">Load own ROM →</div>
                  </div>
                ))}
              </div>
              <p className="mt-4 font-mono text-[10px] text-zinc-700">
                Note: ROM files are not hosted here for legal reasons. Load your own .nes/.gba/.smc files.
              </p>
            </div>
          </div>
        )}

        {/* Flash Games tab */}
        {activeTab === 'flash' && (
          <div className="space-y-6">
            <div
              className="rounded-2xl p-6"
              style={{ background: 'rgba(255,165,0,0.04)', border: '1px solid rgba(255,165,0,0.15)' }}
            >
              <h2 className="font-nacelle text-xl font-semibold text-zinc-100 mb-2">Flash Game Player</h2>
              <p className="text-sm text-zinc-500 mb-1">Powered by Ruffle — the open-source Flash emulator. Load .swf files directly from disk.</p>
              <p className="font-mono text-[10px] text-amber-400/70 mb-5">No Adobe Flash required. Runs entirely in your browser.</p>

              <div className="flex items-center gap-3 flex-wrap">
                <label className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-zinc-100 cursor-pointer transition-all hover:scale-[1.02]"
                  style={{ background: 'rgba(255,165,0,0.15)', border: '1px solid rgba(255,165,0,0.3)' }}>
                  📂 Load .SWF File
                  <input
                    type="file"
                    accept=".swf"
                    className="hidden"
                    onChange={e => {
                      const f = e.target.files?.[0]
                      if (!f) return
                      openRuffleFlash(URL.createObjectURL(f))
                    }}
                  />
                </label>
              </div>
            </div>

            <div
              className="rounded-xl px-5 py-4 text-sm text-zinc-500 leading-relaxed"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <strong className="text-zinc-400">How to get Flash games:</strong>
              <ul className="mt-2 space-y-1 font-mono text-[11px] text-zinc-600 list-disc pl-4">
                <li>flashgamearchive.com — thousands of archived .swf files</li>
                <li>bluemaxima.org/flashpoint — offline Flash game archive</li>
                <li>archive.org/details/flash_games — Internet Archive collection</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
