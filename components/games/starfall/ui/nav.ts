'use client'
/**
 * Console-style menu navigation shared by every menu screen.
 *
 * Arrow keys and Tab move focus between the `[data-nav]` elements of the active scope,
 * the mouse moves it by hovering, Enter/Space activate, Esc/Backspace go back one level. Gamepads are translated into the
 * same key events (dispatched on the focused element), so sliders and tabs only
 * ever need keyboard handlers.
 */
import { useEffect, useEffectEvent, type MouseEvent, type PointerEvent, type RefObject } from 'react'

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

/**
 * Mouse hover selects, exactly like the arrow keys: spread onto a `[data-nav]` control. Moving the
 * mouse (not just entering) re-selects, so the pointer wins again after keyboard navigation —
 * and because the highlight is drawn from focus alone, two controls can never look selected at once.
 */
export const hoverFocus = {
  onPointerMove(e: PointerEvent<HTMLElement>): void {
    const el = e.currentTarget
    if (e.pointerType === 'mouse' && document.activeElement !== el && !el.matches('[aria-disabled="true"]')) el.focus({ preventScroll: true })
  },
}

/** Things a mouse press is meant for: controls, and text the player may select (a room code). */
const INTERACTIVE = 'button, a[href], input, textarea, select, [tabindex]:not([tabindex="-1"]), .select-text'

/** onMouseDown for a menu layer: a click on empty space must not drop the keyboard selection. */
export function keepFocus(e: MouseEvent<HTMLElement>): void {
  if (!(e.target as HTMLElement).closest(INTERACTIVE)) e.preventDefault()
}

/* ── back ────────────────────────────────────────────────────────── */

const backStack: Array<() => void> = []

/**
 * A view nested inside a panel (e.g. device setup inside Settings) takes over Esc / Back while it
 * is mounted, so "back" always means one level up — the same as its on-screen Back button.
 */
export function useBackHandler(handler: (() => void) | undefined): void {
  const run = useEffectEvent(() => handler?.())
  const active = !!handler
  useEffect(() => {
    if (!active) return
    const entry = () => run()
    backStack.push(entry)
    return () => {
      const i = backStack.indexOf(entry)
      if (i >= 0) backStack.splice(i, 1)
    }
  }, [active])
}

/** Runs the innermost back handler, else `fallback`. Returns false when there is nowhere to go back to. */
export function goBack(fallback?: () => void): boolean {
  const back = backStack[backStack.length - 1] ?? fallback
  back?.()
  return !!back
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
    // Text fields keep Enter, Space and Backspace for themselves; arrows still move between items.
    const typing = inside && isTextField(active!)

    // Buttons side by side (Quit / Keep playing, the device cards): ←/→ step like ↑/↓. Controls that
    // use the arrows themselves (sliders, toggles, segmented, tabs) have already claimed the event.
    const sideways = (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.defaultPrevented && inside && active!.matches('button:not([role]), button[role="radio"][data-nav]')

    switch (sideways ? (e.key === 'ArrowLeft' ? 'ArrowUp' : 'ArrowDown') : e.key) {
      // Tab walks the same list as the arrows, so focus can't wander onto a layer behind the menu.
      case 'Tab':
      case 'ArrowDown':
      case 'ArrowUp': {
        const list = navTargets(root)
        if (!list.length) return
        e.preventDefault()
        // Focus may sit on a child (one segment of a segmented control): step from its nav owner.
        const owner = inside ? active!.closest<HTMLElement>('[data-nav]') : null
        const i = owner ? list.indexOf(owner) : -1
        const down = e.key === 'Tab' ? !e.shiftKey : e.key === 'ArrowDown' || e.key === 'ArrowRight'
        const next = i < 0 ? (down ? 0 : list.length - 1) : (i + (down ? 1 : -1) + list.length) % list.length
        focusEl(list[next])
        return
      }
      case 'Enter':
      case ' ': {
        if (typing) return
        if (e.repeat) {
          e.preventDefault()
          return
        }
        if (!inside || !active!.matches('button, a[href], [role="switch"]')) {
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
        if (e.repeat || (typing && e.key === 'Backspace')) return
        if (goBack(onBack)) e.preventDefault()
        return
    }
  })

  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (e: KeyboardEvent) => handle(e)
    // Space already activated on keydown; some browsers click buttons again on keyup.
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ' && !isTextField(document.activeElement)) e.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    const stopPad = pollGamepadNav()
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      stopPad()
    }
  }, [enabled])
}

/** Inputs that take typed text (not buttons, checkboxes or ranges). */
export function isTextField(el: Element | null): boolean {
  if (!el) return false
  if (el instanceof HTMLTextAreaElement) return true
  if ((el as HTMLElement).isContentEditable) return true
  return el instanceof HTMLInputElement && !['button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'color'].includes(el.type)
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
