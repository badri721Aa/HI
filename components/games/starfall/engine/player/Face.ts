/**
 * The hero's painted face. The 'HeroFace' material samples a 2×2 atlas holding the same face
 * with four expressions; the mesh UVs point at the neutral cell, so showing another one is
 * just a texture offset. Each character owns a clone of the texture (same image, own offset).
 *
 * Blinks happen on their own; gameplay asks for 'happy' or 'hurt' either for a moment
 * (show) or for as long as something lasts (hold). Changes of expression pass through a
 * frame of closed eyes, which reads as a soft transition instead of a pop.
 */
import * as THREE from 'three'

export type Expression = 'neutral' | 'happy' | 'hurt'
type Cell = Expression | 'blink'

/** Atlas cell → texture offset (see tools/starfall/build_hero.py, step 9b). */
const OFFSET: Record<Cell, readonly [number, number]> = {
  neutral: [0, 0],
  blink: [0.5, 0],
  happy: [0, 0.5],
  hurt: [0.5, 0.5],
}
const BLINK_TIME = 0.12
const BLINK_GAP: readonly [number, number] = [2.5, 6]
/** One blink in five is followed by a second one after this pause. */
const DOUBLE_CHANCE = 0.2
const DOUBLE_GAP = 0.13
/** Eyes close this long when the expression changes (not on the way into 'hurt': pain is instant). */
const CROSS_TIME = 0.07

export class Face {
  readonly texture: THREE.Texture
  private held: Expression = 'neutral'
  private timed: Expression = 'neutral'
  private timedT = 0
  private shown: Expression = 'neutral'
  private cell: Cell = 'neutral'
  private crossT = 0
  private blinkT = 0
  private nextBlink = BLINK_GAP[0] + Math.random() * (BLINK_GAP[1] - BLINK_GAP[0])

  constructor(atlas: THREE.Texture) {
    this.texture = atlas.clone()
    this.texture.needsUpdate = true
  }

  /** Wear `e` for `seconds`, then return to neutral. */
  show(e: Expression, seconds = 1.5): void {
    this.timed = e
    this.timedT = seconds
  }

  /** Wear `e` until told otherwise ('neutral' releases it). Wins over show(). */
  hold(e: Expression): void {
    this.held = e
  }

  update(dt: number): void {
    if (this.timedT > 0) this.timedT -= dt
    const want = this.held !== 'neutral' ? this.held : this.timedT > 0 ? this.timed : 'neutral'
    if (want !== this.shown) {
      this.shown = want
      this.crossT = want === 'hurt' ? 0 : CROSS_TIME
      this.blinkT = 0
    }

    let cell: Cell = this.shown
    if (this.crossT > 0) {
      this.crossT -= dt
      cell = 'blink'
    } else if (this.shown === 'neutral') {
      this.nextBlink -= dt
      if (this.nextBlink <= 0) {
        this.blinkT = BLINK_TIME
        this.nextBlink =
          BLINK_TIME + (Math.random() < DOUBLE_CHANCE ? DOUBLE_GAP : BLINK_GAP[0] + Math.random() * (BLINK_GAP[1] - BLINK_GAP[0]))
      }
      if (this.blinkT > 0) {
        this.blinkT -= dt
        cell = 'blink'
      }
    }
    if (cell !== this.cell) {
      this.cell = cell
      this.texture.offset.set(OFFSET[cell][0], OFFSET[cell][1])
    }
  }

  dispose(): void {
    this.texture.dispose()
  }
}

/** Painted-face UVs start at u = 0.02; every other head-skin vertex shares one plain texel at u = 0.01. */
const PAINTED_U = 0.015
const _box = new THREE.Box3()
const _v = new THREE.Vector3()

/**
 * The eye line of the painted face on a 'HeroFace' mesh, in world space (rest pose): measured
 * from the vertices whose UVs are projected into the atlas. False if the mesh has none.
 */
export function faceCentre(mesh: THREE.Mesh, out: THREE.Vector3): boolean {
  const pos = mesh.geometry.getAttribute('position')
  const uv = mesh.geometry.getAttribute('uv')
  if (!pos || !uv) return false
  _box.makeEmpty()
  for (let i = 0; i < uv.count; i++) if (uv.getX(i) > PAINTED_U) _box.expandByPoint(_v.fromBufferAttribute(pos, i))
  if (_box.isEmpty()) return false
  // A little above the middle of the painted area, just inside its front.
  const { min, max } = _box
  out.set((min.x + max.x) / 2, min.y + (max.y - min.y) * 0.56, min.z + (max.z - min.z) * 0.75)
  out.applyMatrix4(mesh.matrixWorld)
  return true
}
