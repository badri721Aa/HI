'use client'
/**
 * Dialog panel with a typewriter reveal. The first press (click / E / Space /
 * Enter) completes the line, the next advances via game.advanceDialog(). We
 * intercept those inputs in the capture phase so the engine doesn't also
 * advance on the same press.
 */
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { useGameUi, usePresence, useUi } from './context'
import { KeyCap } from './controls'
import { ChevronIcon } from './icons'
import { cx, LABEL } from './theme'
import styles from './ui.module.css'

const CHARS_PER_SEC = 45
const ADVANCE_KEYS = new Set(['Space', 'Enter', 'NumpadEnter', 'KeyE'])

export function DialogBox() {
  const dialog = useUi(s => s.dialog)
  const visible = !!dialog
  const mounted = usePresence(visible, 200)
  // Keep the last page on screen while the panel fades out.
  const [last, setLast] = useState(dialog)
  if (dialog && dialog !== last) setLast(dialog)
  const page = dialog ?? last
  if (!mounted || !page) return null

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[clamp(20px,6vh,56px)] z-[45] flex justify-center px-4">
      <div
        data-state={visible ? 'open' : 'closed'}
        className={cx(styles.dialog, 'pointer-events-auto relative w-full max-w-[720px] rounded-[4px] border border-[#F3EEE6]/12 bg-[#0B0F14]/90 shadow-[0_24px_70px_-20px_rgba(0,0,0,0.75)]')}
        role="dialog"
        aria-label={page.title}
      >
        <span aria-hidden className="absolute left-0 top-0 h-px w-16 bg-[#F5B455]" />
        <DialogPage key={`${page.page}|${page.text}`} title={page.title} text={page.text} page={page.page} pages={page.pages} live={visible} />
      </div>
    </div>
  )
}

function DialogPage({ title, text, page, pages, live }: { title: string; text: string; page: number; pages: number; live: boolean }) {
  const { game, touch } = useGameUi()
  const [shown, setShown] = useState(0)
  const done = shown >= text.length
  const shownRef = useRef(0)

  useEffect(() => {
    let raf = 0
    const t0 = performance.now()
    const tick = (now: number) => {
      const n = Math.min(text.length, Math.floor(((now - t0) / 1000) * CHARS_PER_SEC))
      if (n !== shownRef.current && shownRef.current < text.length) {
        shownRef.current = n
        setShown(n)
      }
      if (shownRef.current < text.length) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [text])

  const press = useEffectEvent(() => {
    if (shownRef.current < text.length) {
      shownRef.current = text.length
      setShown(text.length)
    } else {
      game.advanceDialog()
    }
  })

  useEffect(() => {
    if (!live) return
    const onKey = (e: KeyboardEvent) => {
      if (!ADVANCE_KEYS.has(e.code)) return
      e.stopPropagation()
      e.preventDefault()
      if (!e.repeat) press()
    }
    // Keep the engine's mouse handler from treating the click as an attack / advance.
    const onMouseDown = (e: MouseEvent) => e.stopPropagation()
    const onPointerDown = (e: PointerEvent) => {
      if (e.button === 0) press()
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('mousedown', onMouseDown, true)
    window.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('mousedown', onMouseDown, true)
      window.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [live])

  const lastPage = page >= pages - 1
  return (
    <div className="px-[clamp(18px,3vw,32px)] pb-5 pt-[18px]">
      <div className={cx(LABEL, 'text-[#F5B455]')}>{title}</div>
      <p className="mt-2.5 min-h-[3.4em] text-[clamp(15px,1.5vw,17px)] leading-[1.65] text-[#F3EEE6]" aria-live="polite">
        {text.slice(0, shown)}
        <span className="text-transparent" aria-hidden>
          {text.slice(shown)}
        </span>
      </p>
      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5" aria-label={`Page ${page + 1} of ${pages}`}>
          {pages > 1 &&
            Array.from({ length: pages }, (_, i) => (
              <span
                key={i}
                className={cx('h-1.5 rounded-full transition-all duration-200', i === page ? 'w-4 bg-[#F5B455]' : i < page ? 'w-1.5 bg-[#F3EEE6]/45' : 'w-1.5 bg-[#F3EEE6]/18')}
              />
            ))}
        </div>
        <div className={cx('flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[#F3EEE6]/55 transition-opacity duration-200', done ? 'opacity-100' : 'opacity-0')}>
          {touch ? 'Tap' : <KeyCap>E</KeyCap>}
          {lastPage ? 'Close' : 'Continue'}
          <ChevronIcon className={cx(styles.caret, 'h-3.5 w-3.5 text-[#F5B455]', lastPage ? '' : 'rotate-90')} />
        </div>
      </div>
    </div>
  )
}
