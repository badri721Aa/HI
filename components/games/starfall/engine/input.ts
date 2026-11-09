/**
 * Unified input: keyboard + mouse (pointer lock), gamepad, and touch.
 * Systems read `input.state` once per frame; edge-triggered actions are
 * true for exactly one frame.
 */

export type Device = 'kbm' | 'pad' | 'touch'
export type Action = 'jump' | 'dash' | 'attack' | 'interact' | 'pause' | 'map' | 'sprint' | 'skip' | 'ragdoll' | 'build'

export interface InputState {
  /** Movement intent, x = right, y = forward. Length ≤ 1. */
  moveX: number
  moveY: number
  /** Camera look delta for this frame in radians (sensitivity applied, invert not applied). */
  lookX: number
  lookY: number
  /** Scroll / trigger zoom delta this frame (+ = zoom out). */
  zoom: number
  /** Hotbar slot picked this frame (keys 1–9, 0 → 0..9), or -1. */
  slot: number
  /** Weapon cycling this frame: +1 next, -1 previous, 0 none (wheel, d-pad left/right). */
  cycle: number
  /** Held states. */
  jumpHeld: boolean
  /** Attack held (bow draw): left mouse button, F, pad X or the touch button. */
  attackHeld: boolean
  sprint: boolean
  skipHeld: boolean
  /** Flying (Creative): sink (C, Shift, pad B) and fly fast (Q, pad sprint, stick at its edge). */
  descend: boolean
  boost: boolean
  /** Edge-triggered (one frame). */
  jump: boolean
  dash: boolean
  attack: boolean
  interact: boolean
  pause: boolean
  map: boolean
  /** Flop into a ragdoll (R / right stick click). */
  ragdoll: boolean
  /** Toggle build mode (B / pad LB). */
  build: boolean
  /** Build mode only: the attack button places, dash breaks, ragdoll turns (these then stay false). */
  place: boolean
  remove: boolean
  rotate: boolean
}

const KEYMAP: Record<string, Action> = {
  Space: 'jump',
  KeyQ: 'dash',
  KeyF: 'attack',
  KeyE: 'interact',
  Enter: 'interact',
  KeyP: 'pause',
  Escape: 'pause',
  KeyM: 'map',
  KeyR: 'ragdoll',
  KeyB: 'build',
  ShiftLeft: 'sprint',
  ShiftRight: 'sprint',
}

const SLOT_KEYS: Record<string, number> = {
  Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4, Digit6: 5, Digit7: 6, Digit8: 7, Digit9: 8, Digit0: 9,
  Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3, Numpad5: 4, Numpad6: 5, Numpad7: 6, Numpad8: 7, Numpad9: 8, Numpad0: 9,
}
const DESCEND_KEYS = ['KeyC', 'ShiftLeft', 'ShiftRight']
const ZOOM_IN = ['Equal', 'NumpadAdd']
const ZOOM_OUT = ['Minus', 'NumpadSubtract']

const PREVENT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'])

function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null
  if (!el || !el.tagName) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable
}

function emptyState(): InputState {
  return {
    moveX: 0, moveY: 0, lookX: 0, lookY: 0, zoom: 0, slot: -1, cycle: 0,
    jumpHeld: false, attackHeld: false, sprint: false, skipHeld: false, descend: false, boost: false,
    jump: false, dash: false, attack: false, interact: false, pause: false, map: false, ragdoll: false,
    build: false, place: false, remove: false, rotate: false,
  }
}

export class Input {
  readonly state: InputState = emptyState()
  device: Device = 'kbm'
  /** When false, gameplay keys are ignored (menus open). Look/move are zeroed. */
  enabled = true
  /** Swallow page-scrolling keys while the game has focus. */
  capture = true
  sensitivity = 1
  /** The plain mouse wheel cycles weapons (set while more than one is owned); otherwise, and with Alt, it zooms. */
  wheelCycles = false
  /** Build mode (set by Building): attack → place, dash → remove, ragdoll → rotate; the wheel picks blocks. */
  buildMode = false

  /** The interact control as the HUD prompt names it on the current device (the touch button reads "Use"). */
  get interactKey(): string {
    return this.device === 'pad' ? 'Y' : this.device === 'touch' ? 'Use' : 'E'
  }

  private keys = new Set<string>()
  private edges = new Set<Action>()
  private virtualHeld = new Set<Action>()
  private mouseDX = 0
  private mouseDY = 0
  private wheel = 0
  private wheelCycle = 0
  private slot = -1
  private mouseHeld = false
  private locked = false
  private dragging = false
  private padPrev: boolean[] = []
  private lookTouch = { id: -1, x: 0, y: 0 }
  private moveTouch = { id: -1, ox: 0, oy: 0, x: 0, y: 0 }
  private cleanup: Array<() => void> = []
  onPointerLockChange?: (locked: boolean) => void

  constructor(private el: HTMLElement) {
    const on = <E extends Event>(t: EventTarget, type: string, fn: (e: E) => void, opts?: AddEventListenerOptions) => {
      t.addEventListener(type, fn as EventListener, opts)
      this.cleanup.push(() => t.removeEventListener(type, fn as EventListener, opts))
    }

    on<KeyboardEvent>(window, 'keydown', e => {
      if (isTyping(e.target)) return
      // Swallow page-scrolling keys during play; in menus (input disabled) Tab must still move focus.
      if (this.capture && PREVENT.has(e.code) && (this.enabled || e.code !== 'Tab')) e.preventDefault()
      this.device = 'kbm'
      if (!e.repeat) {
        const a = KEYMAP[e.code]
        if (a) this.edges.add(a)
        const slot = SLOT_KEYS[e.code]
        if (slot !== undefined && !e.ctrlKey && !e.metaKey && !e.altKey) this.slot = slot
      }
      this.keys.add(e.code)
    })
    on<KeyboardEvent>(window, 'keyup', e => this.keys.delete(e.code))
    on(window, 'blur', () => {
      this.keys.clear()
      this.virtualHeld.clear()
      this.mouseHeld = false
    })

    on<MouseEvent>(window, 'mousemove', e => {
      // Without pointer lock (denied, or not yet granted) the camera follows a held-button drag.
      if (!this.locked && !(this.dragging && e.buttons)) return
      // Some browsers emit huge spikes right after locking; ignore them.
      if (Math.abs(e.movementX) > 300 || Math.abs(e.movementY) > 300) return
      this.mouseDX += e.movementX
      this.mouseDY += e.movementY
    })
    on<MouseEvent>(window, 'mouseup', e => {
      this.dragging = false
      if (e.button === 0) this.mouseHeld = false
    })
    on<MouseEvent>(el, 'mousedown', e => {
      this.device = 'kbm'
      if (!this.locked) {
        this.dragging = true
        return
      }
      if (e.button === 0) {
        this.edges.add('attack')
        this.mouseHeld = true
      }
      if (e.button === 2) this.edges.add('dash')
    })
    on<MouseEvent>(el, 'contextmenu', e => e.preventDefault())
    on<WheelEvent>(el, 'wheel', e => {
      if ((this.wheelCycles || this.buildMode) && !e.altKey) this.wheelCycle += Math.sign(e.deltaY)
      else this.wheel += Math.sign(e.deltaY) * 0.6
      e.preventDefault()
    }, { passive: false })
    on(document, 'pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.el
      this.onPointerLockChange?.(this.locked)
    })

    // Touch: left half = floating move stick, right half = camera drag.
    const opts: AddEventListenerOptions = { passive: false }
    on<TouchEvent>(el, 'touchstart', e => {
      e.preventDefault()
      this.device = 'touch'
      const r = el.getBoundingClientRect()
      for (const t of Array.from(e.changedTouches)) {
        const x = t.clientX - r.left
        const y = t.clientY - r.top
        if (x < r.width * 0.45 && this.moveTouch.id < 0) {
          this.moveTouch = { id: t.identifier, ox: x, oy: y, x, y }
        } else if (this.lookTouch.id < 0) {
          this.lookTouch = { id: t.identifier, x, y }
        }
      }
    }, opts)
    on<TouchEvent>(el, 'touchmove', e => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      for (const t of Array.from(e.changedTouches)) {
        const x = t.clientX - r.left
        const y = t.clientY - r.top
        if (t.identifier === this.moveTouch.id) {
          this.moveTouch.x = x
          this.moveTouch.y = y
          const dx = x - this.moveTouch.ox
          const dy = y - this.moveTouch.oy
          const len = Math.hypot(dx, dy)
          const R = 56
          if (len > R) {
            this.moveTouch.ox = x - (dx / len) * R
            this.moveTouch.oy = y - (dy / len) * R
          }
        } else if (t.identifier === this.lookTouch.id) {
          this.mouseDX += (x - this.lookTouch.x) * 1.6
          this.mouseDY += (y - this.lookTouch.y) * 1.6
          this.lookTouch.x = x
          this.lookTouch.y = y
        }
      }
    }, opts)
    const end = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.moveTouch.id) this.moveTouch.id = -1
        if (t.identifier === this.lookTouch.id) this.lookTouch.id = -1
      }
    }
    on<TouchEvent>(el, 'touchend', end)
    on<TouchEvent>(el, 'touchcancel', end)
  }

  /** Touch stick for the HUD to draw: origin and knob, or null. */
  get touchStick(): { ox: number; oy: number; x: number; y: number } | null {
    return this.moveTouch.id >= 0 ? this.moveTouch : null
  }

  get pointerLocked(): boolean {
    return this.locked
  }

  requestPointerLock(): void {
    if (this.device === 'touch' || this.locked) return
    try {
      const p = this.el.requestPointerLock?.() as unknown as Promise<void> | undefined
      p?.catch?.(() => {})
    } catch {
      /* not allowed without a gesture — the UI will ask for a click */
    }
  }

  exitPointerLock(): void {
    if (document.pointerLockElement === this.el) document.exitPointerLock()
  }

  /** On-screen touch buttons. */
  setVirtual(a: Action, down: boolean): void {
    if (down) {
      if (!this.virtualHeld.has(a)) this.edges.add(a)
      this.virtualHeld.add(a)
    } else {
      this.virtualHeld.delete(a)
    }
  }

  /** Call once at the start of each frame with the real frame time (seconds). */
  poll(dt: number): void {
    const s = this.state
    const k = this.keys
    let mx = 0
    let my = 0
    let lx = this.mouseDX * 0.0022 * this.sensitivity
    let ly = this.mouseDY * 0.0022 * this.sensitivity
    this.mouseDX = this.mouseDY = 0
    let zoom = this.wheel
    this.wheel = 0
    let cycle = Math.sign(this.wheelCycle)
    this.wheelCycle = 0
    if (ZOOM_IN.some(c => k.has(c))) zoom -= 4 * dt
    if (ZOOM_OUT.some(c => k.has(c))) zoom += 4 * dt

    if (k.has('KeyW') || k.has('ArrowUp')) my += 1
    if (k.has('KeyS') || k.has('ArrowDown')) my -= 1
    if (k.has('KeyD') || k.has('ArrowRight')) mx += 1
    if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1

    let sprint = k.has('ShiftLeft') || k.has('ShiftRight') || this.virtualHeld.has('sprint')
    let jumpHeld = k.has('Space') || this.virtualHeld.has('jump')
    let skipHeld = k.has('Space') || k.has('Enter') || this.virtualHeld.has('skip')
    let attackHeld = this.mouseHeld || k.has('KeyF') || this.virtualHeld.has('attack')
    let descend = DESCEND_KEYS.some(c => k.has(c)) || this.virtualHeld.has('dash')
    let boost = k.has('KeyQ') || this.virtualHeld.has('sprint')

    if (this.moveTouch.id >= 0) {
      const dx = this.moveTouch.x - this.moveTouch.ox
      const dy = this.moveTouch.y - this.moveTouch.oy
      const len = Math.hypot(dx, dy)
      if (len > 6) {
        const m = Math.min(1, len / 56)
        mx = (dx / len) * m
        my = (-dy / len) * m
        if (m > 0.92) sprint = boost = true
      }
    }

    // Gamepad (standard mapping)
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : []
    let pad: Gamepad | null = null
    for (const p of pads) if (p && p.connected) { pad = p; break }
    if (pad) {
      const dz = (v: number) => (Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82)
      const ax = dz(pad.axes[0] ?? 0)
      const ay = dz(pad.axes[1] ?? 0)
      const rx = dz(pad.axes[2] ?? 0)
      const ry = dz(pad.axes[3] ?? 0)
      const btn = (i: number) => !!pad!.buttons[i]?.pressed
      const edge = (i: number) => btn(i) && !this.padPrev[i]
      if (ax || ay || rx || ry || pad.buttons.some(b => b.pressed)) this.device = 'pad'
      if (ax || ay) {
        mx = ax
        my = -ay
      }
      // Stick look: up to ~190°/s horizontally, with a soft response curve.
      lx += Math.sign(rx) * rx * rx * 3.3 * this.sensitivity * dt
      ly += Math.sign(ry) * ry * ry * 2.4 * this.sensitivity * dt
      if (edge(0)) this.edges.add('jump')
      if (edge(1)) this.edges.add('dash')
      if (edge(2)) this.edges.add('attack')
      if (edge(3)) this.edges.add('interact')
      if (edge(9)) this.edges.add('pause')
      if (edge(8)) this.edges.add('map')
      if (edge(11)) this.edges.add('ragdoll')
      if (edge(4)) this.edges.add('build')
      if (edge(14)) cycle = -1
      if (edge(15)) cycle = 1
      if (btn(0)) { jumpHeld = true; skipHeld = true }
      if (btn(2)) attackHeld = true
      if (btn(5) || btn(10) || btn(7)) sprint = boost = true
      if (btn(1)) descend = true
      if (btn(12)) zoom -= 4 * dt
      if (btn(13)) zoom += 4 * dt
      this.padPrev = pad.buttons.map(b => b.pressed)
    }

    const len = Math.hypot(mx, my)
    if (len > 1) {
      mx /= len
      my /= len
    }

    const on = this.enabled
    s.moveX = on ? mx : 0
    s.moveY = on ? my : 0
    s.lookX = on ? lx : 0
    s.lookY = on ? ly : 0
    s.zoom = on ? zoom : 0
    s.slot = on ? this.slot : -1
    s.cycle = on ? cycle : 0
    this.slot = -1
    s.sprint = on && sprint
    s.jumpHeld = on && jumpHeld
    s.skipHeld = skipHeld
    s.descend = on && descend
    s.boost = on && boost
    const e = this.edges
    const play = on && !this.buildMode
    const build = on && this.buildMode
    s.attackHeld = play && attackHeld
    s.jump = on && e.has('jump')
    s.dash = play && e.has('dash')
    s.attack = play && e.has('attack')
    s.interact = on && e.has('interact')
    s.pause = e.has('pause')
    s.map = e.has('map')
    s.ragdoll = play && e.has('ragdoll')
    s.build = on && e.has('build')
    s.place = build && e.has('attack')
    s.remove = build && e.has('dash')
    s.rotate = build && e.has('ragdoll')
    e.clear()
  }

  /** Forget everything pressed (e.g. when closing a menu). */
  reset(): void {
    this.edges.clear()
    this.keys.clear()
    this.virtualHeld.clear()
    this.mouseDX = this.mouseDY = this.wheel = this.wheelCycle = 0
    this.slot = -1
    this.mouseHeld = false
    Object.assign(this.state, emptyState())
  }

  destroy(): void {
    for (const c of this.cleanup) c()
    this.cleanup = []
  }
}
