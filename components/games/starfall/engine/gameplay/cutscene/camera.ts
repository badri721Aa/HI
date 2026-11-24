/**
 * Camera shots for the cutscene director.
 *
 * A shot writes a camera pose (position + look target + vertical FOV) for a
 * time inside it. PathShot glides along authored CatmullRom curves; OrbitShot
 * circles a live focus point (the hero, who may still be landing). Both are
 * allocation-free per frame: curves are built once, samples go into the
 * caller's vectors.
 */
import * as THREE from 'three'
import type { V3 } from '../../events'

export type Ease = (u: number) => number

export const ease = {
  linear: (u: number) => u,
  inOutSine: (u: number) => 0.5 - 0.5 * Math.cos(Math.PI * u),
  inOutCubic: (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(2 - 2 * u, 3) / 2),
  outCubic: (u: number) => 1 - Math.pow(1 - u, 3),
  inCubic: (u: number) => u * u * u,
} satisfies Record<string, Ease>

const clamp01 = (u: number) => (u < 0 ? 0 : u > 1 ? 1 : u)

export interface Shot {
  /** Scene time the shot starts (s). */
  readonly at: number
  readonly duration: number
  /** Writes the pose `t` seconds into the shot; returns the vertical FOV in degrees. */
  sample(t: number, dt: number, pos: THREE.Vector3, target: THREE.Vector3): number
  /**
   * Point the camera must keep a clear line of sight to (walls pull the camera in).
   * Returns false when the shot is authored clear of geometry.
   */
  anchor(out: THREE.Vector3): boolean
}

/** A fixed point or a smooth curve through points, sampled by arc length. */
class Track {
  private readonly curve: THREE.CatmullRomCurve3 | null
  private readonly fixed = new THREE.Vector3()

  constructor(points: V3 | readonly V3[]) {
    const list = Array.isArray(points) ? (points as readonly V3[]) : [points as V3]
    if (list.length >= 2) {
      this.curve = new THREE.CatmullRomCurve3(list.map(p => new THREE.Vector3(p.x, p.y, p.z)), false, 'centripetal')
      this.curve.arcLengthDivisions = 120
      this.curve.getLengths() // cache arc lengths now, not on the first frame
    } else {
      this.curve = null
      this.fixed.set(list[0].x, list[0].y, list[0].z)
    }
  }

  at(u: number, out: THREE.Vector3): THREE.Vector3 {
    return this.curve ? this.curve.getPointAt(clamp01(u), out) : out.copy(this.fixed)
  }
}

export interface PathShotOptions {
  at: number
  duration: number
  /** Camera position: one point (static) or a curve through several. */
  pos: V3 | V3[]
  /** Look target: one point or a curve. Keep far targets far, near targets near. */
  target: V3 | V3[]
  /** Constant FOV or [start, end]. */
  fov: number | [number, number]
  ease?: Ease
  /** Keep the line of sight from this point to the camera clear of colliders. */
  anchor?: V3
}

export class PathShot implements Shot {
  readonly at: number
  readonly duration: number
  private readonly pos: Track
  private readonly target: Track
  private readonly fov0: number
  private readonly fov1: number
  private readonly ease: Ease
  private readonly anchorPoint: THREE.Vector3 | null

  constructor(o: PathShotOptions) {
    this.at = o.at
    this.duration = Math.max(1e-3, o.duration)
    this.pos = new Track(o.pos)
    this.target = new Track(o.target)
    this.fov0 = Array.isArray(o.fov) ? o.fov[0] : o.fov
    this.fov1 = Array.isArray(o.fov) ? o.fov[1] : o.fov
    this.ease = o.ease ?? ease.inOutSine
    this.anchorPoint = o.anchor ? new THREE.Vector3(o.anchor.x, o.anchor.y, o.anchor.z) : null
  }

  sample(t: number, _dt: number, pos: THREE.Vector3, target: THREE.Vector3): number {
    const u = this.ease(clamp01(t / this.duration))
    this.pos.at(u, pos)
    this.target.at(u, target)
    return this.fov0 + (this.fov1 - this.fov0) * u
  }

  anchor(out: THREE.Vector3): boolean {
    if (!this.anchorPoint) return false
    out.copy(this.anchorPoint)
    return true
  }
}

export interface OrbitShotOptions {
  at: number
  duration: number
  /** Writes the live focus (e.g. the hero's feet) into `out`. */
  focus: (out: THREE.Vector3) => void
  /** Direction from focus to camera as an angle: offset = (sin a, cos a) · radius. */
  azimuth: [number, number]
  radius: [number, number]
  /** Camera height above the focus. */
  height: [number, number]
  /** Look-target height above the focus. */
  lookY: [number, number]
  fov: [number, number]
  ease?: Ease
}

export class OrbitShot implements Shot {
  readonly at: number
  readonly duration: number
  private readonly o: OrbitShotOptions
  private readonly ease: Ease
  private readonly raw = new THREE.Vector3()
  private readonly focus = new THREE.Vector3()
  private primed = false
  private lookY = 0

  constructor(o: OrbitShotOptions) {
    this.o = o
    this.at = o.at
    this.duration = Math.max(1e-3, o.duration)
    this.ease = o.ease ?? ease.inOutSine
  }

  sample(t: number, dt: number, pos: THREE.Vector3, target: THREE.Vector3): number {
    const o = this.o
    o.focus(this.raw)
    // Follow the focus softly so a landing or a last step doesn't jolt the frame.
    if (!this.primed || !Number.isFinite(this.focus.x)) {
      this.focus.copy(this.raw)
      this.primed = true
    } else {
      this.focus.lerp(this.raw, 1 - Math.exp(-7 * dt))
    }
    const u = this.ease(clamp01(t / this.duration))
    const mix = (r: [number, number]) => r[0] + (r[1] - r[0]) * u
    const a = mix(o.azimuth)
    const r = mix(o.radius)
    const f = this.focus
    this.lookY = mix(o.lookY)
    pos.set(f.x + Math.sin(a) * r, f.y + mix(o.height), f.z + Math.cos(a) * r)
    target.set(f.x, f.y + this.lookY, f.z)
    return mix(o.fov)
  }

  anchor(out: THREE.Vector3): boolean {
    out.set(this.focus.x, this.focus.y + this.lookY, this.focus.z)
    return true
  }
}

/** Approximate gameplay-camera pose behind a hero standing at `feet` facing `yaw` (the rig's default boom). */
export function followPose(feet: V3, yaw: number, lookDistance: number, pos: THREE.Vector3, farTarget: THREE.Vector3): void {
  const pitch = 0.3
  const boom = 6.2
  const pivotY = feet.y + 1.45
  const back = Math.cos(pitch) * boom
  pos.set(feet.x - Math.sin(yaw) * back, pivotY + Math.sin(pitch) * boom, feet.z - Math.cos(yaw) * back)
  // The rig looks at the pivot (+0.3 lift); extend that ray so the target stays far away.
  farTarget.set(feet.x, pivotY + 0.3, feet.z).sub(pos).setLength(lookDistance).add(pos)
}
