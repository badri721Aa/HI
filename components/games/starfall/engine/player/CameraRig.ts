/**
 * Third-person camera.
 *
 *  follow   — orbits a pivot at the hero's upper chest. Mouse / right stick drive yaw and
 *             pitch, the wheel zooms. A raycast shortens the boom so walls never hide the
 *             hero; vertical follow is damped in the air so jumps don't bob the view; after a
 *             while without look input the view drifts gently to look where you're running.
 *  title    — a slow, low cinematic drift around the hero for the menus.
 *  scripted — hands-off: cutscenes drive ctx.camera (shake still layers on top, safely).
 *
 * Sprint FOV, FOV kicks and noise shake are applied last. Switching into follow/title glides
 * from wherever the camera was; snapBehind() cuts instantly.
 */
import * as THREE from 'three'
import type { Ctx, ICameraRig } from '../types'
import { clamp, heightAt, lerp, noise2, smoothstep, waterLevelAt } from '../world/heightfield'
import { damp, wrapAngle } from './control/math'
import { CAM as C, MOVE } from './control/tuning'

type Mode = 'follow' | 'scripted' | 'title'

const TAU = Math.PI * 2
/** Angles sampled around the hero when planning the title orbit. */
const TITLE_SAMPLES = 72

interface FovKick {
  amp: number
  dur: number
  t: number
}

export class CameraRig implements ICameraRig {
  yaw = Math.PI
  pitch: number = C.defaultPitch

  private _mode: Mode = 'title'
  private readonly pivot = new THREE.Vector3()
  /** Height the pivot follows (holds at take-off height during jumps). */
  private refY = 0
  /** Zoom target and smoothed boom length. */
  private zoom: number = C.distance
  private boom: number = C.distance
  /** How far obstacles currently pull the camera in from `boom` (jumps up, eases back down). */
  private pull = 0
  private lookIdle = 0
  /** Seconds the hero has been running (assist waits for both). */
  private moveT = 0

  private sprintFov = 0
  private readonly kicks: FovKick[] = [0, 1, 2, 3].map(() => ({ amp: 0, dur: 1, t: 1 }))
  private shakeAmp = 0
  private shakeDur = 0
  private shakeT = 0

  private titleT = 0
  private titlePlanned = false
  /** Title orbit angle a(t) = mid + amp·sin(phase + ω·t); amp < 0 means a slow full circle from mid. */
  private titleMid = 0
  private titleAmp = -1
  private titlePhase = 0
  private readonly titleBlocked = new Uint8Array(TITLE_SAMPLES)

  /** Hand-over glide from the previous camera transform (0 → 1). */
  private blend = 1
  private blendK = 1
  private blendDur: number = C.handover
  private readonly fromPos = new THREE.Vector3()
  private readonly fromQuat = new THREE.Quaternion()
  private fromFov = 60

  // Scripted-mode shake bookkeeping, so offsets never accumulate on a static cutscene camera.
  private shaken = false
  private readonly basePos = new THREE.Vector3()
  private readonly baseQuat = new THREE.Quaternion()
  private readonly shakenPos = new THREE.Vector3()
  private readonly shakenQuat = new THREE.Quaternion()

  private readonly target = new THREE.Vector3()
  private readonly tmpQuat = new THREE.Quaternion()
  private failed = false

  constructor(private ctx: Ctx) {}

  get mode(): Mode {
    return this._mode
  }

  set mode(m: Mode) {
    if (m === this._mode) return
    this._mode = m
    this.shaken = false
    if (m === 'scripted') return
    const cam = this.ctx.camera
    this.fromPos.copy(cam.position)
    this.fromQuat.copy(cam.quaternion)
    this.fromFov = cam.fov
    this.blend = 0
    this.blendK = 0
    this.blendDur = m === 'follow' ? C.handover : C.handover * 1.6
    if (m === 'follow') {
      this.resetPivot()
      this.pull = 0
    } else {
      this.titleT = 0
      this.titlePlanned = false
    }
  }

  init(): void {
    this.resetPivot()
  }

  update(dt: number): void {
    try {
      if (this._mode === 'scripted') {
        this.shakeScripted(dt)
        return
      }
      if (this._mode === 'title') this.updateTitle(dt)
      else this.updateFollow(dt)
      this.applyBlend(dt)
      this.applyFov(dt)
      this.applyShake(dt)
    } catch (err) {
      if (!this.failed) console.error('[starfall] camera update failed', err)
      this.failed = true
    }
  }

  snapBehind(): void {
    this.yaw = this.ctx.player.yaw
    this.pitch = C.defaultPitch
    this.boom = this.zoom
    this.pull = 0
    this.lookIdle = 0
    this.sprintFov = 0
    this.blend = this.blendK = 1
    this.resetPivot()
    if (this._mode !== 'follow') return
    this.placeOrbit(0, true)
    this.applyFov(0)
  }

  shake(intensity: number, duration: number): void {
    if (!this.ctx.settings.cameraShake || !(intensity > 0) || !(duration > 0)) return
    this.shakeAmp = Math.max(this.shakeStrength(), intensity)
    this.shakeDur = duration
    this.shakeT = 0
  }

  kickFov(deg: number, duration: number): void {
    if (!deg || !(duration > 0)) return
    let slot = this.kicks[0]
    for (const k of this.kicks) {
      if (k.t >= k.dur) {
        slot = k
        break
      }
      if (k.t / k.dur > slot.t / slot.dur) slot = k
    }
    slot.amp = deg
    slot.dur = duration
    slot.t = 0
  }

  dispose(): void {
    this.shaken = false
  }

  /* ── follow ──────────────────────────────────────────────── */

  private updateFollow(dt: number): void {
    const s = this.ctx.input.state
    const lx = s.lookX
    const ly = this.ctx.settings.invertY ? -s.lookY : s.lookY
    if (lx !== 0 || ly !== 0) this.lookIdle = 0
    else this.lookIdle += dt
    this.yaw = wrapAngle(this.yaw - lx)
    this.pitch = clamp(this.pitch + ly, C.pitchMin, C.pitchMax)
    if (s.zoom) this.zoom = clamp(this.zoom + s.zoom * C.zoomStep, C.zoomMin, C.zoomMax)
    this.boom = damp(this.boom, this.zoom, 10, dt)
    this.assist(dt)
    this.followPivot(dt)
    this.placeOrbit(dt, false)
  }

  /** After a while without look input, ease the view toward the running direction. */
  private assist(dt: number): void {
    const pl = this.ctx.player
    const v = pl.velocity
    const sp = Math.hypot(v.x, v.z)
    this.moveT = sp > 1.5 ? this.moveT + dt : 0
    const idle = Math.min(this.lookIdle, this.moveT)
    if (idle < C.assistDelay || pl.state === 'dash' || pl.state === 'hurt') return
    const d = wrapAngle(Math.atan2(v.x, v.z) - this.yaw)
    // Only when running roughly away from the camera: strafing or running at it keeps the view still.
    const w =
      smoothstep(C.assistDelay, C.assistDelay + 1, idle) *
      clamp(sp / MOVE.runSpeed, 0, 1.2) *
      (1 - smoothstep(0.7, 1.4, Math.abs(d)))
    if (w <= 0) return
    this.yaw = wrapAngle(this.yaw + d * (1 - Math.exp(-C.assistRate * w * dt)))
    this.pitch = damp(this.pitch, C.defaultPitch, C.pitchRelax * w, dt)
  }

  private followPivot(dt: number): void {
    const pl = this.ctx.player
    const p = pl.position
    if (Math.abs(this.pivot.x - p.x) + Math.abs(this.pivot.z - p.z) > 12) this.resetPivot()

    // Hold the take-off height in the air; follow drops at once and big rises past airRise.
    if (pl.grounded || p.y < this.refY) this.refY = p.y
    else if (p.y > this.refY + C.airRise) this.refY = p.y - C.airRise

    const kH = 1 - Math.exp(-C.followRate * dt)
    this.pivot.x += (p.x - this.pivot.x) * kH
    this.pivot.z += (p.z - this.pivot.z) * kH
    const falling = !pl.grounded && pl.velocity.y < -6
    const rate = pl.grounded ? C.vFollowGround : falling ? C.vFollowFall : C.vFollowAir
    const hy = p.y + C.pivotHeight
    this.pivot.y = clamp(damp(this.pivot.y, this.refY + C.pivotHeight, rate, dt), hy - C.maxVLag, hy + C.maxVLag)
  }

  /** Positions the camera on its boom around the pivot, pulled in by obstacles. */
  private placeOrbit(dt: number, instant: boolean): void {
    const cp = Math.cos(this.pitch)
    const dx = -Math.sin(this.yaw) * cp
    const dy = Math.sin(this.pitch)
    const dz = -Math.cos(this.yaw) * cp
    const pv = this.pivot
    const need = this.boom - this.castBoom(pv.x, pv.y, pv.z, dx, dy, dz, this.boom)
    // Pull in at once (never see through a wall), ease back out once it clears.
    if (instant || need > this.pull) this.pull = need
    else this.pull = damp(this.pull, need, C.boomOutRate, dt)
    const reach = this.boom - this.pull
    const cam = this.ctx.camera
    cam.position.set(pv.x + dx * reach, pv.y + dy * reach, pv.z + dz * reach)
    this.keepAboveGround(cam.position)
    this.target.set(pv.x, pv.y + C.lookLift, pv.z)
    cam.lookAt(this.target)
  }

  /**
   * Free boom length from the pivot along (dx, dy, dz), unit length. Thin things (trunks, posts)
   * are looked past instead of yanking the camera in for a split second.
   */
  private castBoom(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, len: number): number {
    const col = this.ctx.collision
    let travelled = 0
    for (let i = 0; i < 3; i++) {
      const remain = len + C.margin - travelled
      if (remain <= 0) break
      const hit = col.raycast(ox + dx * travelled, oy + dy * travelled, oz + dz * travelled, dx, dy, dz, remain)
      if (!hit) break
      const c = hit.collider
      const thin = c && (c.shape === 'cylinder' ? c.r < 0.6 : Math.max(c.hx, c.hz) < 0.35)
      if (!thin) return Math.max(C.minDist, Math.min(len, travelled + hit.t - C.margin))
      travelled += hit.t + (c.shape === 'cylinder' ? c.r * 2 : Math.max(c.hx, c.hz) * 2) + 0.05
    }
    return len
  }

  private keepAboveGround(pos: THREE.Vector3): void {
    const floor = Math.max(heightAt(pos.x, pos.z) + C.groundClear, waterLevelAt(pos.x, pos.z) + C.waterClear)
    if (pos.y < floor) pos.y = floor
  }

  private resetPivot(): void {
    const p = this.ctx.player.position
    this.pivot.set(p.x, p.y + C.pivotHeight, p.z)
    this.refY = p.y
  }

  /* ── title ───────────────────────────────────────────────── */

  private updateTitle(dt: number): void {
    const p = this.ctx.player.position
    if (!this.titlePlanned) this.planTitleOrbit()
    this.titleT += dt
    const t = this.titleT
    const a =
      this.titleAmp < 0
        ? this.titleMid + t * C.titleSpin
        : this.titleMid + this.titleAmp * Math.sin(this.titlePhase + (t * C.titleSpin) / Math.max(0.35, this.titleAmp))
    const r = C.titleRadius + Math.sin(t * 0.21) * 0.5
    const cam = this.ctx.camera
    cam.position.set(p.x + Math.sin(a) * r, p.y + C.titleHeight + Math.sin(t * 0.17) * 0.18, p.z + Math.cos(a) * r)
    this.keepAboveGround(cam.position)
    // Aim a little to the side so the hero sits on the right third, clear of the menu.
    const fx = (p.x - cam.position.x) / r
    const fz = (p.z - cam.position.z) / r
    this.target.set(p.x + fz * C.titleSide, p.y + C.titleLookY, p.z - fx * C.titleSide)
    cam.lookAt(this.target)
    this.yaw = Math.atan2(fx, fz)
    this.pitch = C.defaultPitch
  }

  /**
   * Finds where the title camera can circle without props (signs, lanterns, rocks) hiding the
   * hero: rays from the hero's chest and head to each candidate position. If something blocks
   * part of the circle, the camera swings slowly back and forth across the widest clear arc,
   * preferring a three-quarter front view.
   */
  private planTitleOrbit(): void {
    const pl = this.ctx.player
    const p = pl.position
    const col = this.ctx.collision
    const blocked = this.titleBlocked
    const prefer = pl.yaw + C.titleAngle
    const camY = p.y + C.titleHeight
    let any = false
    blocked.fill(0)
    for (let k = 0; k < TITLE_SAMPLES; k++) {
      const a = (k / TITLE_SAMPLES) * TAU
      const cx = p.x + Math.sin(a) * C.titleRadius
      const cz = p.z + Math.cos(a) * C.titleRadius
      for (const h of [1.0, 1.55]) {
        const oy = p.y + h
        if (col.raycast(p.x, oy, p.z, cx - p.x, camY - oy, cz - p.z, 1)) {
          blocked[k] = 1
          any = true
          break
        }
      }
    }
    this.titlePlanned = true
    this.titleT = 0
    if (!any || blocked.every(b => b === 1)) {
      this.titleMid = prefer
      this.titleAmp = -1
      return
    }
    // Widen every obstruction by two samples (≈10°): colliders are slimmer than the props they belong to.
    const pad = 2
    const wide = new Uint8Array(TITLE_SAMPLES)
    for (let k = 0; k < TITLE_SAMPLES; k++) {
      if (!blocked[k]) continue
      for (let j = -pad; j <= pad; j++) wide[(k + j + TITLE_SAMPLES) % TITLE_SAMPLES] = 1
    }
    // Clear runs around the circle (start index, length), starting the scan just after a blocked sample.
    const step = TAU / TITLE_SAMPLES
    const first = wide.indexOf(1)
    let best = { start: 0, len: 0, score: -Infinity }
    let runStart = -1
    for (let i = 1; i <= TITLE_SAMPLES; i++) {
      const k = (first + i) % TITLE_SAMPLES
      if (!wide[k]) {
        if (runStart < 0) runStart = first + i
        continue
      }
      if (runStart >= 0) {
        const len = first + i - runStart
        const start = runStart * step
        const rel = (((prefer - start) % TAU) + TAU) % TAU
        // Prefer the arc that contains the preferred angle, then the widest.
        const score = len + (rel <= len * step ? TITLE_SAMPLES : 0)
        if (score > best.score) best = { start, len, score }
        runStart = -1
      }
    }
    const lo = best.start
    const span = Math.max(0, (best.len - 1) * step)
    this.titleMid = lo + span / 2
    this.titleAmp = span / 2
    const rel = (((prefer - lo) % TAU) + TAU) % TAU
    const at = rel <= span ? lo + rel : rel - span < TAU - rel ? lo + span : lo
    this.titlePhase = this.titleAmp > 1e-3 ? Math.asin(clamp((at - this.titleMid) / this.titleAmp, -1, 1)) : 0
  }

  /* ── effects ─────────────────────────────────────────────── */

  private applyBlend(dt: number): void {
    if (this.blend >= 1) return
    this.blend = Math.min(1, this.blend + dt / this.blendDur)
    const k = (this.blendK = smoothstep(0, 1, this.blend))
    const cam = this.ctx.camera
    cam.position.lerpVectors(this.fromPos, cam.position, k)
    this.tmpQuat.copy(cam.quaternion)
    cam.quaternion.copy(this.fromQuat).slerp(this.tmpQuat, k)
  }

  private applyFov(dt: number): void {
    const cam = this.ctx.camera
    let fov = this.ctx.settings.fov
    if (this._mode === 'follow') {
      const sp = this.ctx.player.motion.speed
      this.sprintFov = damp(this.sprintFov, smoothstep(MOVE.runSpeed + 0.4, MOVE.sprintSpeed, sp) * C.sprintFov, 2.5, dt)
      fov += this.sprintFov
    } else {
      fov += C.titleFovOffset
    }
    for (const k of this.kicks) {
      if (k.t >= k.dur) continue
      k.t += dt
      const u = Math.min(1, k.t / k.dur)
      // Fast rise, smooth fall.
      fov += k.amp * Math.sin(Math.min(1, u / 0.18) * Math.PI * 0.5) * (1 - smoothstep(0.18, 1, u))
    }
    if (this.blend < 1) fov = lerp(this.fromFov, fov, this.blendK)
    if (Math.abs(cam.fov - fov) > 1e-3) {
      cam.fov = fov
      cam.updateProjectionMatrix()
    }
  }

  private shakeStrength(): number {
    if (this.shakeT >= this.shakeDur) return 0
    const u = this.shakeT / this.shakeDur
    return this.shakeAmp * (1 - u) * (1 - u)
  }

  /** Smooth-noise shake as a small rotation + offset on the final camera transform. */
  private applyShake(dt: number): void {
    if (this.shakeT >= this.shakeDur) return
    this.shakeT += dt
    const a = this.shakeStrength()
    if (a <= 1e-4) return
    const t = this.ctx.clock.real * C.shakeFreq
    const cam = this.ctx.camera
    const rot = a * C.shakeRot
    const mov = a * C.shakeMove
    cam.rotateY(noise2(t, 1.7) * rot)
    cam.rotateX(noise2(t, 9.3) * rot)
    cam.rotateZ(noise2(t, 23.1) * rot * 0.6)
    cam.translateX(noise2(t, 41.9) * mov)
    cam.translateY(noise2(t, 57.3) * mov)
  }

  /**
   * In scripted mode the director owns the camera. Shake is layered on top; if the director
   * didn't touch the camera since our last offset, that offset is removed first.
   */
  private shakeScripted(dt: number): void {
    const cam = this.ctx.camera
    if (this.shaken) {
      if (cam.position.equals(this.shakenPos) && cam.quaternion.equals(this.shakenQuat)) {
        cam.position.copy(this.basePos)
        cam.quaternion.copy(this.baseQuat)
      }
      this.shaken = false
    }
    if (this.shakeT >= this.shakeDur) return
    this.basePos.copy(cam.position)
    this.baseQuat.copy(cam.quaternion)
    this.applyShake(dt)
    this.shakenPos.copy(cam.position)
    this.shakenQuat.copy(cam.quaternion)
    this.shaken = true
  }
}
