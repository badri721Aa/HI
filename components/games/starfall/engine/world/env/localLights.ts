/**
 * Local warm light: lanterns, lit windows and fires cast real pools of light at dusk and night.
 *
 * Anything that glows registers an anchor (a point, a colour, a strength). A small fixed pool of
 * point lights is handed to the anchors nearest the view each frame, cross-fading when the set
 * changes, so there are never more real lights than the pool holds however many lanterns the
 * world has. The pool lives in the scene from the start and its size only follows the quality
 * preset (none on 'low'), so shaders never recompile during play. The lights cast no shadows.
 */
import * as THREE from 'three'
import type { LightAnchor, LightAnchorOpts } from '../../types'
import type { QualityLevel } from '../../settings'

/** Real lights by quality preset. */
const POOL: Record<QualityLevel, number> = { low: 0, medium: 3, high: 6, ultra: 6 }
const POOL_MAX = 6
/** Anchors further than this from the view (m) get no light; they fade in over the outer part. */
const RANGE = 46
/**
 * Brightness of a strength-1 anchor, the reach (m) of its light and its falloff exponent. The
 * falloff is gentler than a real lamp's inverse square: a wide, soft pool on the ground without
 * a burnt-out hot spot on the post the lantern hangs from.
 */
const INTENSITY = 5
const REACH = 14
const DECAY = 1
/** An anchor that already holds a light counts as this much nearer, so lights do not swap back and forth. */
const KEEP = 0.8
/** Cross-fade rates (1 / s). */
const FADE_IN = 2.5
const FADE_OUT = 3
const WARM = 0xffb15a

interface Anchor extends LightAnchor {
  x: number
  y: number
  z: number
  r: number
  g: number
  b: number
  /** Phase of this anchor's slow flicker. */
  seed: number
  /** Pool light it holds, or -1. */
  slot: number
}

interface Slot {
  light: THREE.PointLight
  anchor: Anchor | null
  level: number
}

const _color = new THREE.Color()

export class LocalLights {
  private anchors: Anchor[] = []
  private slots: Slot[] = []
  /** Scratch: the wanted anchors this frame, nearest first, and their scores. */
  private want: Array<Anchor | null> = []
  private score: number[] = []
  private count = 0

  constructor(private scene: THREE.Scene) {
    for (let i = 0; i < POOL_MAX; i++) {
      const light = new THREE.PointLight(WARM, 0, REACH, DECAY)
      light.name = `local-light-${i}`
      light.visible = false
      scene.add(light)
      this.slots.push({ light, anchor: null, level: 0 })
      this.want.push(null)
      this.score.push(0)
    }
  }

  add(x: number, y: number, z: number, opts?: LightAnchorOpts): LightAnchor {
    _color.set(opts?.color ?? WARM)
    const anchor: Anchor = {
      x, y, z,
      r: _color.r, g: _color.g, b: _color.b,
      strength: opts?.strength ?? 1,
      seed: (x * 12.9898 + z * 78.233) % 6.283,
      slot: -1,
    }
    this.anchors.push(anchor)
    return anchor
  }

  remove(anchor: LightAnchor): void {
    const i = this.anchors.indexOf(anchor as Anchor)
    if (i < 0) return
    const a = this.anchors[i]
    if (a.slot >= 0) {
      const s = this.slots[a.slot]
      s.anchor = null
      s.level = 0
      s.light.intensity = 0
    }
    this.anchors.splice(i, 1)
  }

  /** How many real lights the quality preset allows (changing it recompiles lit shaders once). */
  setQuality(level: QualityLevel): void {
    this.count = POOL[level]
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i]
      s.light.visible = i < this.count
      if (i >= this.count) this.release(s)
    }
  }

  /**
   * Hands the pool to the anchors nearest `focus`. `amount` (0..1) is how much local light the
   * time of day wants: none in full daylight.
   */
  update(dt: number, time: number, focus: THREE.Vector3, amount: number): void {
    const n = this.count
    if (n === 0) return
    if (amount <= 0.002) {
      for (let i = 0; i < n; i++) this.release(this.slots[i])
      return
    }

    // The n best anchors by distance (kept sorted by insertion; the lists are tiny).
    let found = 0
    for (let i = 0; i < this.anchors.length; i++) {
      const a = this.anchors[i]
      if (a.strength <= 0) continue
      const dx = a.x - focus.x
      const dy = a.y - focus.y
      const dz = a.z - focus.z
      const d2 = dx * dx + dy * dy + dz * dz
      if (d2 > RANGE * RANGE) continue
      const s = d2 * (a.slot >= 0 ? KEEP * KEEP : 1)
      let k = found
      if (found === n) {
        if (s >= this.score[n - 1]) continue
        k = n - 1
      } else found++
      while (k > 0 && this.score[k - 1] > s) {
        this.score[k] = this.score[k - 1]
        this.want[k] = this.want[k - 1]
        k--
      }
      this.score[k] = s
      this.want[k] = a
    }

    // Lights whose anchor is still wanted brighten; the others dim and are freed at zero.
    for (let i = 0; i < n; i++) {
      const s = this.slots[i]
      if (!s.anchor) continue
      let wanted = false
      for (let k = 0; k < found; k++) if (this.want[k] === s.anchor) wanted = true
      if (wanted) s.level = Math.min(1, s.level + dt * FADE_IN)
      else {
        s.level -= dt * FADE_OUT
        if (s.level <= 0) this.release(s)
      }
    }
    // Free lights go to the wanted anchors that have none yet, nearest first.
    for (let k = 0; k < found; k++) {
      const a = this.want[k]!
      if (a.slot >= 0) continue
      for (let i = 0; i < n; i++) {
        const s = this.slots[i]
        if (s.anchor) continue
        s.anchor = a
        s.level = 0
        a.slot = i
        s.light.position.set(a.x, a.y, a.z)
        s.light.color.setRGB(a.r, a.g, a.b)
        break
      }
    }
    for (let k = 0; k < found; k++) this.want[k] = null

    for (let i = 0; i < n; i++) {
      const s = this.slots[i]
      const a = s.anchor
      if (!a) continue
      const dx = a.x - focus.x
      const dy = a.y - focus.y
      const dz = a.z - focus.z
      const near = 1 - smooth(RANGE * 0.6, RANGE, Math.sqrt(dx * dx + dy * dy + dz * dz))
      // A slow, shallow flicker (two sines well under 3 Hz): a flame, never a strobe.
      const flicker = 0.94 + 0.04 * Math.sin(time * 5.1 + a.seed) + 0.02 * Math.sin(time * 8.3 + a.seed * 2.7)
      s.light.intensity = INTENSITY * a.strength * amount * s.level * near * flicker
    }
  }

  dispose(): void {
    for (const s of this.slots) {
      this.scene.remove(s.light)
      s.light.dispose()
    }
    this.slots.length = 0
    this.anchors.length = 0
    this.count = 0
  }

  private release(s: Slot): void {
    if (s.anchor) s.anchor.slot = -1
    s.anchor = null
    s.level = 0
    s.light.intensity = 0
  }
}

function smooth(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}
