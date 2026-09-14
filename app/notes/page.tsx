'use client'

import { useState, useEffect, useCallback } from 'react'

interface Note {
  id: string
  title: string
  content: string
  updatedAt: number
  color: string
}

const COLORS = ['zinc', 'violet', 'emerald', 'amber', 'rose', 'sky']
const COLOR_MAP: Record<string, { bg: string; border: string; dot: string }> = {
  zinc:    { bg: 'rgba(255,255,255,0.02)', border: 'rgba(255,255,255,0.08)', dot: '#71717a' },
  violet:  { bg: 'rgba(99,59,218,0.06)',  border: 'rgba(99,59,218,0.2)',    dot: '#8b5cf6' },
  emerald: { bg: 'rgba(16,185,129,0.05)', border: 'rgba(16,185,129,0.18)',  dot: '#10b981' },
  amber:   { bg: 'rgba(245,158,11,0.05)', border: 'rgba(245,158,11,0.18)',  dot: '#f59e0b' },
  rose:    { bg: 'rgba(225,29,72,0.05)',  border: 'rgba(225,29,72,0.18)',   dot: '#f43f5e' },
  sky:     { bg: 'rgba(14,165,233,0.05)', border: 'rgba(14,165,233,0.18)',  dot: '#0ea5e9' },
}

// Simple XOR encryption — adequate for localStorage obfuscation
function xorEncode(text: string, key: string): string {
  const k = key || 'alhekma'
  return btoa(text.split('').map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ k.charCodeAt(i % k.length))).join(''))
}

function xorDecode(encoded: string, key: string): string {
  try {
    const k = key || 'alhekma'
    const text = atob(encoded)
    return text.split('').map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ k.charCodeAt(i % k.length))).join('')
  } catch { return '' }
}

function loadNotes(pin: string): Note[] {
  try {
    const raw = localStorage.getItem('vault-notes')
    if (!raw) return []
    const decoded = xorDecode(raw, pin)
    return JSON.parse(decoded)
  } catch { return [] }
}

function saveNotes(notes: Note[], pin: string) {
  try {
    const encoded = xorEncode(JSON.stringify(notes), pin)
    localStorage.setItem('vault-notes', encoded)
  } catch { /* ignore */ }
}

function newNote(color = 'zinc'): Note {
  return { id: Math.random().toString(36).slice(2), title: 'Untitled', content: '', updatedAt: Date.now(), color }
}

export default function NotesPage() {
  const [unlocked, setUnlocked] = useState(false)
  const [pin, setPin] = useState('')
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState('')
  const [notes, setNotes] = useState<Note[]>([])
  const [activeNote, setActiveNote] = useState<Note | null>(null)
  const [search, setSearch] = useState('')

  // Check if vault has been set up
  const hasVault = typeof window !== 'undefined' && !!localStorage.getItem('vault-pin-hash')

  function hashPin(p: string): string {
    // Simple hash — not crypto-grade, but obscures the PIN in storage
    let h = 0
    for (let i = 0; i < p.length; i++) h = Math.imul(31, h) + p.charCodeAt(i) | 0
    return h.toString(36)
  }

  function setupVault() {
    if (pinInput.length < 4) { setPinError('PIN must be at least 4 characters'); return }
    localStorage.setItem('vault-pin-hash', hashPin(pinInput))
    setPin(pinInput)
    setNotes([])
    setUnlocked(true)
    setPinInput('')
  }

  function unlock() {
    const stored = localStorage.getItem('vault-pin-hash')
    if (!stored || hashPin(pinInput) !== stored) {
      setPinError('Incorrect PIN')
      setPinInput('')
      return
    }
    setPin(pinInput)
    const loaded = loadNotes(pinInput)
    setNotes(loaded.length ? loaded : [newNote()])
    setActiveNote(loaded.length ? loaded[0] : null)
    setUnlocked(true)
    setPinInput('')
    setPinError('')
  }

  function lock() {
    setUnlocked(false)
    setPin('')
    setNotes([])
    setActiveNote(null)
  }

  function resetVault() {
    localStorage.removeItem('vault-notes')
    localStorage.removeItem('vault-pin-hash')
    setUnlocked(false)
    setPin('')
    setNotes([])
    setPinInput('')
  }

  const persistNotes = useCallback((updated: Note[], currentPin: string) => {
    saveNotes(updated, currentPin)
  }, [])

  function updateActiveContent(content: string) {
    if (!activeNote) return
    const updatedNote = { ...activeNote, content, updatedAt: Date.now() }
    setActiveNote(updatedNote)
    setNotes(prev => {
      const updated = prev.map(n => n.id === updatedNote.id ? updatedNote : n)
      persistNotes(updated, pin)
      return updated
    })
  }

  function updateActiveTitle(title: string) {
    if (!activeNote) return
    const updatedNote = { ...activeNote, title, updatedAt: Date.now() }
    setActiveNote(updatedNote)
    setNotes(prev => {
      const updated = prev.map(n => n.id === updatedNote.id ? updatedNote : n)
      persistNotes(updated, pin)
      return updated
    })
  }

  function createNote(color = 'zinc') {
    const n = newNote(color)
    const updated = [n, ...notes]
    setNotes(updated)
    setActiveNote(n)
    persistNotes(updated, pin)
  }

  function deleteNote(id: string) {
    const updated = notes.filter(n => n.id !== id)
    setNotes(updated)
    persistNotes(updated, pin)
    if (activeNote?.id === id) setActiveNote(updated[0] ?? null)
  }

  function exportNotes() {
    const blob = new Blob([JSON.stringify(notes, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'notes-export.json'
    a.click()
  }

  const filteredNotes = notes.filter(n =>
    !search || n.title.toLowerCase().includes(search.toLowerCase()) ||
    n.content.toLowerCase().includes(search.toLowerCase())
  )

  if (!unlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'rgb(9,9,11)' }}>
        <div className="w-full max-w-sm mx-6 space-y-5">
          <div className="text-center">
            <div className="text-4xl mb-3">🔒</div>
            <h1 className="font-nacelle text-2xl font-semibold text-zinc-100">Encrypted Vault</h1>
            <p className="mt-1 text-sm text-zinc-600">{hasVault ? 'Enter your PIN to unlock' : 'Set a PIN to protect your notes'}</p>
          </div>

          <div
            className="rounded-2xl p-5 space-y-4"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <input
              type="password"
              value={pinInput}
              onChange={e => { setPinInput(e.target.value); setPinError('') }}
              onKeyDown={e => e.key === 'Enter' && (hasVault ? unlock() : setupVault())}
              placeholder={hasVault ? 'Enter PIN' : 'Create PIN (min 4 chars)'}
              maxLength={20}
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-700 outline-none focus:border-white/[0.18] text-center tracking-widest"
            />
            {pinError && <p className="text-[10px] font-mono text-red-400 text-center">{pinError}</p>}

            <button
              onClick={hasVault ? unlock : setupVault}
              className="w-full rounded-xl py-2.5 text-sm font-semibold text-zinc-100 transition-all hover:brightness-110"
              style={{ background: 'rgba(99,59,218,0.2)', border: '1px solid rgba(99,59,218,0.3)' }}
            >
              {hasVault ? 'Unlock Vault' : 'Create Vault'}
            </button>

            {hasVault && (
              <button onClick={resetVault} className="w-full text-[10px] font-mono text-zinc-700 hover:text-red-400 transition-colors py-1">
                Reset vault (deletes all notes)
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen" style={{ background: 'rgb(9,9,11)', paddingTop: '64px' }}>
      {/* Sidebar */}
      <div className="w-64 flex-shrink-0 border-r border-white/[0.05] flex flex-col">
        <div className="p-3 border-b border-white/[0.05] space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-zinc-300 flex-1">Notes</span>
            <button onClick={lock} className="text-[10px] font-mono text-zinc-700 hover:text-zinc-400" title="Lock vault">🔒</button>
            <button onClick={exportNotes} className="text-[10px] font-mono text-zinc-700 hover:text-zinc-400" title="Export">⬇</button>
          </div>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search notes…"
            className="w-full rounded-lg border border-white/[0.07] bg-white/[0.02] px-2.5 py-1.5 text-[11px] text-zinc-300 placeholder:text-zinc-700 outline-none"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredNotes.map(n => {
            const c = COLOR_MAP[n.color] ?? COLOR_MAP.zinc
            return (
              <div
                key={n.id}
                onClick={() => setActiveNote(n)}
                className="group relative rounded-xl px-3 py-2.5 cursor-pointer transition-all duration-150"
                style={{
                  background: activeNote?.id === n.id ? c.bg : 'transparent',
                  border: `1px solid ${activeNote?.id === n.id ? c.border : 'transparent'}`,
                }}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: c.dot }} />
                  <span className="text-xs font-medium text-zinc-300 truncate flex-1">{n.title || 'Untitled'}</span>
                </div>
                <p className="font-mono text-[10px] text-zinc-700 truncate pl-3.5">{n.content.slice(0, 50) || 'Empty note'}</p>
                <button
                  onClick={ev => { ev.stopPropagation(); deleteNote(n.id) }}
                  className="absolute right-2 top-2 hidden group-hover:block text-zinc-700 hover:text-red-400 text-[10px]"
                >✕</button>
              </div>
            )
          })}
          {filteredNotes.length === 0 && (
            <p className="font-mono text-[10px] text-zinc-800 text-center py-8">No notes</p>
          )}
        </div>

        {/* New note */}
        <div className="p-3 border-t border-white/[0.05] space-y-2">
          <div className="flex items-center gap-1.5">
            {COLORS.map(c => (
              <button
                key={c}
                onClick={() => createNote(c)}
                className="w-5 h-5 rounded-full transition-transform hover:scale-125"
                style={{ background: COLOR_MAP[c].dot }}
                title={`New ${c} note`}
              />
            ))}
          </div>
          <button
            onClick={() => createNote()}
            className="w-full rounded-lg py-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-200 transition-colors text-center"
            style={{ border: '1px solid rgba(255,255,255,0.06)' }}
          >
            + New Note
          </button>
        </div>
      </div>

      {/* Editor */}
      {activeNote ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-8 pt-6 pb-3 border-b border-white/[0.04]">
            <input
              value={activeNote.title}
              onChange={e => updateActiveTitle(e.target.value)}
              placeholder="Note title"
              className="w-full bg-transparent font-nacelle text-xl font-semibold text-zinc-100 outline-none placeholder:text-zinc-700"
            />
            <p className="mt-1 font-mono text-[10px] text-zinc-700">
              {new Date(activeNote.updatedAt).toLocaleString()} · {activeNote.content.length} chars
            </p>
          </div>
          <textarea
            value={activeNote.content}
            onChange={e => updateActiveContent(e.target.value)}
            placeholder="Start writing… Markdown supported"
            className="flex-1 bg-transparent px-8 py-5 text-sm text-zinc-300 leading-relaxed outline-none resize-none placeholder:text-zinc-800"
          />
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-3xl mb-3">📝</div>
            <p className="text-sm text-zinc-600">Select a note or create one</p>
          </div>
        </div>
      )}
    </div>
  )
}
