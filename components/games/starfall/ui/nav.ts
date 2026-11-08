'use client'
/**
 * Console-style menu navigation shared by every menu screen.
 *
 * Arrow keys move focus between the `[data-nav]` elements of the active scope,
 * Enter/Space activate, Esc/Backspace go back. Gamepads are translated into the
 * same key events (dispatched on the focused element), so sliders and tabs only
 * ever need keyboard handlers.
 */
import { useEffect, useEffectEvent, type RefObject } from 'react'

const NAV_SELECTOR = '[data-nav]:not([disabled]):not([aria-disabled="true"])'

export function navTargets(scope: HTMLElement | null): HTMLElement[] {
  if (!scope) return []
  return Array.from(scope.querySelectorAll<HTMLElement>(NAV_SELECTOR)).filter(el => el.offsetParent !== null)
}

let silent = false

/** Focus without scrolling. `quiet` skips the hover sound (used when focus is restored, not moved by the player). */
export function focusEl(el: HTMLElement | null | undefined, quiet = false): void {
  if (!el) return
  silent = quiet
  el.focus({ preventScroll: true })
  silent = false
}

/** True while a quiet focusEl() is dispatching its focus event. */
export function isQuietFocus(): boolean {
  return silent
}

/** Focuses `selector`, else the first nav target, else the scope itself (panels are tabIndex -1), so focus never lingers behind. */
export function focusFirst(scope: HTMLElement | null, selector?: string): void {
  if (!scope) return
  const preferred = selector ? scope.querySelector<HTMLElement>(selector) : null
  focusEl(preferred ?? navTargets(scope)[0] ?? scope, true)
}

interface NavOptions {
  scope: RefObject<HTMLElement | null>
  enabled: boolean
  onBack?: () => void
  /** Extra shortcuts; return true when handled. */
  onKey?: (e: KeyboardEvent) => boolean | void
}

export function useMenuNav({ scope, enabled, onBack, onKey }: NavOptions): void {
  const handle = useEffectEvent((e: KeyboardEvent) => {
    if (onKey?.(e)) {
      e.preventDefault()
      return
    }
    const root = scope.current
    if (!root) return
    const active = document.activeElement as HTMLElement | null
    const inside = !!active && root.contains(active)

    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        const list = navTargets(root)
        if (!list.length) return
        e.preventDefault()
        const i = inside ? list.indexOf(active!) : -1
        const down = e.key === 'ArrowDown'
        const next = i < 0 ? (down ? 0 : list.length - 1) : (i + (down ? 1 : -1) + list.length) % list.length
        focusEl(list[next])
        return
      }
      case 'Enter':
      case ' ': {
        if (e.repeat) {
          e.preventDefault()
          return
        }
        if (!inside || !active!.matches('button, [role="switch"]')) {
          // Nothing focused yet: Enter focuses the first item instead of doing nothing.
          if (!inside && e.key === 'Enter') {
            e.preventDefault()
            focusFirst(root)
          }
          return
        }
        e.preventDefault()
        active!.click()
        return
      }
      case 'Escape':
      case 'Backspace':
        if (e.repeat || !onBack) return
        e.preventDefault()
        onBack()
        return
    }
  })

  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (e: KeyboardEvent) => handle(e)
    window.addEventListener('keydown', onKeyDown)
    const stopPad = pollGamepadNav()
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      stopPad()
    }
  }, [enabled])
}

/* ── gamepad → key events ───────────────────────────────────────── */

const PAD_BUTTONS: Array<[number, string]> = [
  [12, 'ArrowUp'],
  [13, 'ArrowDown'],
  [14, 'ArrowLeft'],
  [15, 'ArrowRight'],
  [0, 'Enter'],
  [1, 'Escape'],
  [9, 'Escape'],
]
const REPEATS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])

function sendKey(key: string, repeat: boolean): void {
  const target = document.activeElement && document.activeElement !== document.body ? document.activeElement : window
  target.dispatchEvent(new KeyboardEvent('keydown', { key, repeat, bubbles: true, cancelable: true }))
}

/** Polls the first connected gamepad while a menu is open. */
function pollGamepadNav(): () => void {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return () => {}
  let raf = 0
  // Buttons already held when the menu opened (e.g. the Start press that paused) must be released first.
  let primed = false
  const held = new Map<string, number>()
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop)
    let pad: Gamepad | null = null
    for (const p of navigator.getGamepads()) if (p?.connected) { pad = p; break }
    if (!pad) return
    const down = new Set<string>()
    for (const [b, key] of PAD_BUTTONS) if (pad.buttons[b]?.pressed) down.add(key)
    const ax = pad.axes[0] ?? 0
    const ay = pad.axes[1] ?? 0
    if (ay < -0.55) down.add('ArrowUp')
    if (ay > 0.55) down.add('ArrowDown')
    if (ax < -0.55) down.add('ArrowLeft')
    if (ax > 0.55) down.add('ArrowRight')
    if (!primed) {
      for (const k of down) held.set(k, Infinity)
      primed = true
    }
    for (const key of Array.from(held.keys())) if (!down.has(key)) held.delete(key)
    for (const key of down) {
      const t = held.get(key)
      if (t === undefined) {
        held.set(key, now + 380)
        sendKey(key, false)
      } else if (REPEATS.has(key) && now >= t) {
        held.set(key, now + 110)
        sendKey(key, true)
      }
    }
  }
  raf = requestAnimationFrame(loop)
  return () => cancelAnimationFrame(raf)
}
