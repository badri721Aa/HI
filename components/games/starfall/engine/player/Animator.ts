/**
 * Procedural animator for the hero — there are no animation clips; every pose
 * is generated per frame from the MotionState:
 *
 *   ground layer   idle (breathing, weight shift, glances) ↔ walk/run/sprint gait by speed
 *   air layer      jump / somersault / fall / bounce, cross-faded on change
 *   actions        dash, spin attack, death (blended) · hurt, landing (additive)
 *   gestures       keyframed overlays for gameplay & cutscenes
 *   override       a pose from outside (ragdoll, getting up) replaces all of the above
 *   solve         feet planted by IK on the real ground, hips height limiter,
 *                  head stabilisation + look-at, then written to the bones.
 *
 * Feet are IK targets: during a stride they travel back exactly as fast as the
 * body moves; when standing they stay put in the world and take small
 * corrective steps (after stopping or turning on the spot).
 */
import * as THREE from 'three'
import type { V3 } from '../events'
import type { GestureName, MotionState, PlayerState } from '../types'
import { applyWade, footAt, gaitFor, swingSignal, WALK, type FootSample, type GaitParams } from './anim/Gait'
import { GESTURES, type GestureDef } from './anim/gestures'
import { DEG, TAU, clamp, clamp01, damp, easeOut, envelope, lerp, noise1, ramp, smooth, wrap01, wrapAngle } from './anim/math'
import { J, Pose, PoseBuilder } from './anim/Pose'
import * as POSES from './anim/poses'
import type { Rig } from './anim/Rig'

export interface GroundSample {
  y: number
  nx: number
  ny: number
  nz: number
}

/** Walkable ground at (x, z) near height `nearY`; false when nothing is close below. */
export type GroundProbe = (x: number, z: number, nearY: number, out: GroundSample) => boolean

type AirKind = 'jump' | 'flip' | 'fall' | 'bounce'

const AIR_STATES = new Set<PlayerState>(['jump', 'doubleJump', 'fall', 'bounce'])
const UPPER = [J.spine, J.chest, J.neck, J.head, J.shoulderL, J.upperArmL, J.forearmL, J.handL, J.shoulderR, J.upperArmR, J.forearmR, J.handR]
const SPINE_CHAIN = [J.hips, J.spine, J.chest, J.neck, J.head]
const NECK_HEAD = [J.neck, J.head]
const HEAD_ONLY = [J.head]
const LEG_JOINTS = [
  [J.thighL, J.shinL, J.footL, J.toeL],
  [J.thighR, J.shinR, J.footR, J.toeR],
] as const

/** Sole points of the feet when standing (m, character space). */
const IDLE_FEET = [new THREE.Vector3(0.122, 0, 0.014), new THREE.Vector3(-0.122, 0, -0.024)]
const IDLE_FOOT_YAW = -7 * DEG
const FLIP_PIVOT = new THREE.Vector3(0, 0.84, 0.02)
const FLIP_TIME = 0.46
const SPIN_TIME = 0.42
const STEP_TIME = 0.26
const KNEE_OUT = 7 * DEG

const UP = new THREE.Vector3(0, 1, 0)
const AX_X = new THREE.Vector3(1, 0, 0)

interface Plant {
  /** World position of the planted sole point (y unused — the ground decides). */
  pos: THREE.Vector3
  /** Root yaw at the time the foot was planted. */
  yaw: number
  stepT: number
  from: THREE.Vector3
  to: THREE.Vector3
  fromYaw: number
  toYaw: number
}

interface FootTarget {
  sole: THREE.Vector3
  pitch: number
  /** Raw (unmirrored) yaw of the foot in character space. */
  yaw: number
  /** 1 = toes on the ground. */
  contact: number
  normal: THREE.Vector3
  ankle: THREE.Vector3
  footQ: THREE.Quaternion
  toeQ: THREE.Quaternion
}

interface ActiveGesture {
  name: GestureName
  def: GestureDef
  keys: Pose[]
  times: number[]
  t: number
  speed: number
  loop: boolean
  stopping: boolean
  resolve: (() => void) | null
}

const _q1 = new THREE.Quaternion()
const _q2 = new THREE.Quaternion()
const _q3 = new THREE.Quaternion()
const _q4 = new THREE.Quaternion()
const _v1 = new THREE.Vector3()
const _v2 = new THREE.Vector3()
const _v3 = new THREE.Vector3()
const _v4 = new THREE.Vector3()
const _e = new THREE.Euler()

export class Animator {
  /** Extra yaw of the whole body for the spin attack (the Character applies it). */
  spin = 0

  private b: PoseBuilder
  private m: MotionState = {
    state: 'idle', stateTime: 0, speed: 0, walkSpeed: 2.2, runSpeed: 5.6, sprintSpeed: 8.6, vy: 0,
    grounded: true, turnRate: 0, landImpact: 0, wading: 0, slope: 0,
  }

  // compiled poses
  private pIdle: Pose
  private pJumpUp: Pose
  private pJumpTuck: Pose
  private pFall: Pose
  private pFlip: Pose
  private pStar: Pose
  private pDash: Pose
  private pAttack: Pose
  private pHurt: Pose
  private pLand: Pose
  private pDead: Pose
  private gestureKeys = new Map<GestureName, { keys: Pose[]; times: number[] }>()

  // working poses (re-filled every frame)
  private out = new Pose()
  private idle = new Pose()
  private loco = new Pose()
  private air = new Pose()
  private airPrev = new Pose()
  private airFrom = new Pose()
  private gpose = new Pose()
  private snap = new Pose()
  private tmp = new Pose()

  // time & state
  private t = 0
  private state: PlayerState = 'idle'
  private stateT = 0
  private root = new THREE.Vector3()
  private prevRoot = new THREE.Vector3()
  private yaw = 0
  private prevYaw = 0
  private fresh = true

  // continuous signals
  private speed = 0
  private prevSpeed = 0
  private seenSpeed = 0
  private accel = 0
  private moveW = 0
  private groundW = 1
  private yawRate = 0
  private bank = 0
  private wadeW = 0
  private slope = 0
  private phase = 0
  private g: GaitParams = { ...WALK }
  private foot: FootSample = { x: 0, y: 0, z: 0, pitch: 0, swing: 0 }

  // air
  private airKind: AirKind = 'fall'
  private airT = 0
  private airFade = 1
  private flipT = -1
  private wasGrounded = true
  private airTime = 0
  private minVy = 0

  // actions
  private spinT = -1
  private dashW = 0
  private hurtT = -1
  private landT = -1
  private landAmp = 0
  private deadW = 0

  // feet
  private plants: Plant[] = [0, 1].map(() => ({
    pos: new THREE.Vector3(), yaw: 0, stepT: -1, from: new THREE.Vector3(), to: new THREE.Vector3(), fromYaw: 0, toYaw: 0,
  }))
  private targets: FootTarget[] = [0, 1].map(() => ({
    sole: new THREE.Vector3(), pitch: 0, yaw: 0, contact: 1, normal: new THREE.Vector3(0, 1, 0),
    ankle: new THREE.Vector3(), footQ: new THREE.Quaternion(), toeQ: new THREE.Quaternion(),
  }))
  private footRel = [0, 0]
  private hipsGround = 0
  private stepWait = 0
  private hit: GroundSample = { y: 0, nx: 0, ny: 1, nz: 0 }

  // head
  private lookTarget = new THREE.Vector3()
  private hasLook = false
  private lookW = 0
  private lookYaw = 0
  private lookPitch = 0
  private idleT = 0
  private glanceT = -1
  private glanceNext = 5
  private glanceYaw = 0
  private glancePitch = 0
  private seed = 1

  // gestures
  private gesture: ActiveGesture | null = null
  private snapT = 1
  private snapDur = 0.25

  /** Pose that replaces the animation entirely (ragdoll, getting up), or null. */
  private ovr: Pose | null = null

  private qThigh = new THREE.Quaternion()
  private qShin = new THREE.Quaternion()

  constructor(
    private rig: Rig,
    private probe: GroundProbe,
  ) {
    const b = (this.b = new PoseBuilder(rig.axes))
    this.pIdle = b.compile(POSES.IDLE)
    this.pJumpUp = b.compile(POSES.JUMP_UP)
    this.pJumpTuck = b.compile(POSES.JUMP_TUCK)
    this.pFall = b.compile(POSES.FALL)
    this.pFlip = b.compile(POSES.FLIP_TUCK)
    this.pStar = b.compile(POSES.STAR)
    this.pDash = b.compile(POSES.DASH)
    this.pAttack = b.compile(POSES.ATTACK)
    this.pHurt = b.compile(POSES.HURT)
    this.pLand = b.compile(POSES.LAND)
    this.pDead = b.compile(POSES.DEAD)
    for (const name of Object.keys(GESTURES) as GestureName[]) {
      const def = GESTURES[name]
      this.gestureKeys.set(name, { keys: def.keys.map(([, s]) => b.compile(s)), times: def.keys.map(([t]) => t) })
    }
    this.out.copy(this.pIdle)
    this.airPrev.copy(this.pFall)
  }

  /* ── inputs ──────────────────────────────────────────────── */

  setMotion(m: MotionState): void {
    Object.assign(this.m, m)
  }

  lookAt(target: V3 | null): void {
    if (target) {
      this.lookTarget.set(target.x, target.y, target.z)
      this.hasLook = true
    } else this.hasLook = false
  }

  playGesture(name: GestureName, opts: { loop?: boolean; speed?: number } = {}): Promise<void> {
    const def = GESTURES[name]
    const compiled = this.gestureKeys.get(name)
    if (!def || !compiled) return Promise.resolve()
    if (this.gesture) {
      this.finishGesture()
      this.beginSnap(0.25)
    }
    return new Promise<void>(resolve => {
      this.gesture = {
        name, def, keys: compiled.keys, times: compiled.times, t: 0,
        speed: Math.max(0.05, opts.speed ?? 1), loop: !!opts.loop, stopping: false, resolve,
      }
      if (def.fadeIn <= 0) this.snapT = 1
    })
  }

  /** Ends the gesture through its outro; `instant` drops it on the spot (cutscene cuts). */
  stopGesture(opts?: { instant?: boolean }): void {
    const g = this.gesture
    if (!g) return
    if (opts?.instant) {
      this.finishGesture()
      this.snapT = 1
      return
    }
    if (g.loop && !g.stopping) {
      // Play the outro from the end of the loop section, cross-fading from the current pose.
      g.stopping = true
      if (g.t < g.def.loop[1]) {
        g.t = g.def.loop[1]
        this.beginSnap(0.3)
      }
    } else if (!g.stopping) {
      // A one-shot interrupted: cross-fade into its fade-out.
      g.stopping = true
      if (g.t < g.def.duration - g.def.fadeOut) {
        g.t = g.def.duration - g.def.fadeOut
        this.beginSnap(0.25)
      }
    }
    g.resolve?.()
    g.resolve = null
  }

  /** A gesture (or its outro) is playing. */
  get gesturing(): boolean {
    return this.gesture !== null
  }

  /** Ends the gesture at once with a short cross-fade (the hero set off running mid-gesture). */
  interruptGesture(fade = 0.2): void {
    if (!this.gesture) return
    this.beginSnap(fade)
    this.finishGesture()
  }

  /** Re-plant the feet under the body (after a teleport). */
  resetFeet(): void {
    this.fresh = true
  }

  /**
   * Shows `pose` instead of the animation until released (the ragdoll and its get-up drive the
   * body this way). Feet IK and head steadying still apply as far as the pose asks (ik, stab).
   * The caller may keep refilling the same Pose object every frame.
   */
  setOverride(pose: Pose): void {
    this.ovr = pose
  }

  /** Hands the body back to the animation, cross-fading over `fade` seconds (0 = at once). */
  releaseOverride(fade = 0.25): void {
    if (!this.ovr) return
    this.ovr = null
    if (fade > 0) this.beginSnap(fade)
    else this.snapT = 1
  }

  /* ── frame ───────────────────────────────────────────────── */

  update(dtIn: number, root: THREE.Vector3, yaw: number): void {
    const dt = clamp(dtIn, 0, 0.05)
    if (!(dt > 0)) return
    this.t += dt
    const teleported = this.fresh || root.distanceToSquared(this.root) > 2.25
    this.prevRoot.copy(teleported ? root : this.root)
    this.root.copy(root)
    this.prevYaw = teleported ? yaw : this.yaw
    this.yaw = yaw

    this.updateState(dt)
    this.updateSignals(dt, teleported)

    const out = this.out
    if (this.ovr) {
      this.dropActions()
      out.copy(this.ovr)
    } else {
      this.buildIdle(dt)
      this.buildLoco()
      out.copy(this.idle).blend(this.loco, smooth(this.moveW))
      this.buildAir(dt)
      out.blend(this.air, 1 - this.groundW)
      this.applyActions(dt, out)
      this.applyGesture(dt, out)
      this.breathe(out)
      if (this.snapT < 1) {
        this.snapT = Math.min(1, this.snapT + dt / this.snapDur)
        this.tmp.copy(this.snap).blend(out, smooth(this.snapT))
        out.copy(this.tmp)
      }
    }

    this.updateFeet(dt, out, teleported)
    this.solve(dt, out)
    this.fresh = false
  }

  /* ── state machine ───────────────────────────────────────── */

  private updateState(dt: number): void {
    const m = this.m
    if (m.state !== this.state) this.enter(m.state)
    this.stateT += dt

    if (!m.grounded) {
      this.airTime += dt
      this.minVy = Math.min(this.minVy, m.vy)
    } else {
      if (!this.wasGrounded && this.airTime > 0.15) this.triggerLand(Math.max(m.landImpact, -this.minVy))
      this.airTime = 0
      this.minVy = 0
    }
    this.wasGrounded = m.grounded

    // Air pose selection follows the state; other states keep whatever we were doing.
    let kind = this.airKind
    if (this.flipT >= 0) kind = 'flip'
    else if (m.state === 'jump' || m.state === 'doubleJump') kind = 'jump'
    else if (m.state === 'bounce') kind = 'bounce'
    else if (m.state === 'fall') kind = 'fall'
    else if (m.grounded) kind = 'fall'
    if (kind !== this.airKind) {
      // Leaving the ground is blended by groundW; only cross-fade changes made in the air.
      this.airFrom.copy(this.airPrev)
      this.airFade = this.groundW > 0.5 ? 1 : 0
      if (kind !== 'flip' && !(this.airKind === 'flip' && kind === 'jump')) this.airT = 0
      this.airKind = kind
    }
    this.airT += dt
  }

  private enter(s: PlayerState): void {
    this.state = s
    this.stateT = 0
    switch (s) {
      case 'jump':
      case 'bounce':
        this.airT = 0
        break
      case 'doubleJump':
        this.flipT = 0
        break
      case 'land':
        this.triggerLand(this.m.landImpact)
        break
      case 'attack':
        this.spinT = 0
        break
      case 'hurt':
        this.hurtT = 0
        break
    }
  }

  private triggerLand(impact: number): void {
    if (this.landT >= 0 && this.landT < 0.2) return
    this.landT = 0
    this.landAmp = clamp((impact - 1.5) / 11, 0.12, 1)
  }

  private updateSignals(dt: number, teleported: boolean): void {
    const m = this.m
    // Scripted moves (cutscenes) may move the root without reporting speed.
    const moved = teleported ? 0 : Math.hypot(this.root.x - this.prevRoot.x, this.root.z - this.prevRoot.z) / dt
    this.seenSpeed = damp(this.seenSpeed, Math.min(moved, 12), 10, dt)
    const target = Number.isFinite(m.speed) ? (m.state === 'cutscene' ? Math.max(m.speed, this.seenSpeed) : m.speed) : 0
    this.prevSpeed = this.speed
    this.speed = damp(this.speed, Math.max(0, target), 14, dt)
    this.accel = damp(this.accel, clamp((this.speed - this.prevSpeed) / dt, -25, 25), 6, dt)

    const moveTarget = clamp01((target - 0.12) / 0.55)
    // Starting from a standstill: left foot planted under the body, right foot passing it —
    // closest to the standing pose, and its contact lands half a step in, like the controller's
    // footstep counter.
    if (this.moveW < 0.02 && moveTarget > 0) this.phase = 0.25
    this.moveW = damp(this.moveW, moveTarget, moveTarget > this.moveW ? 9 : 12, dt)

    const yr = teleported ? 0 : wrapAngle(this.yaw - this.prevYaw) / dt
    this.yawRate = damp(this.yawRate, clamp(yr, -10, 10), 10, dt)
    const bankTarget = clamp(-this.yawRate * this.speed * 0.03, -0.3, 0.3) * this.groundW * smooth(this.moveW)
    this.bank = damp(this.bank, bankTarget, 7, dt)

    const groundTarget = m.grounded && !AIR_STATES.has(m.state) ? 1 : 0
    this.groundW = damp(this.groundW, groundTarget, groundTarget > this.groundW ? 18 : 24, dt)
    if (teleported) this.groundW = groundTarget

    this.wadeW = damp(this.wadeW, Math.max(clamp01(m.wading * 1.4), m.state === 'wade' ? 0.8 : 0), 4, dt)
    this.slope = damp(this.slope, clamp(m.slope || 0, -1, 1), 5, dt)

    const walk = m.walkSpeed || 2.2
    const run = m.runSpeed || 5.6
    const sprint = m.sprintSpeed || 8.6
    // Cadence follows the raw speed so steps stay in time with the controller's footstep sounds.
    if (this.groundW > 0.3) {
      gaitFor(this.g, target, walk, run, sprint)
      applyWade(this.g, this.wadeW)
      this.phase = wrap01(this.phase + (target * dt) / (2 * this.g.step))
    }
    gaitFor(this.g, this.speed, walk, run, sprint)
    applyWade(this.g, this.wadeW)
  }

  /* ── ground layer ────────────────────────────────────────── */

  private buildIdle(dt: number): void {
    const p = this.idle.copy(this.pIdle)
    const b = this.b
    const t = this.t
    const calm = this.state === 'cutscene' ? 0.6 : 1
    const sway = Math.sin((t * TAU) / 7.5) * calm
    const sway2 = Math.sin((t * TAU) / 3.3 + 1.3)

    // Weight shift: hips drift over one foot, pelvis hikes on that side, spine counters.
    p.pos.x += 0.016 * sway
    b.add(p, J.hips, 0, 1.2 * sway, 1.6 * sway)
    b.add(p, J.spine, 0, -0.6 * sway, -1.1 * sway)
    b.add(p, J.chest, 0.5 * sway2, 0, -0.5 * sway)
    b.add(p, J.upperArmL, 1.2 * sway2, 0, 0.6 * sway)
    b.add(p, J.upperArmR, -1.0 * sway2, 0, -0.6 * sway)

    // Head micro-motion and the occasional glance around.
    this.updateGlance(dt)
    const gw = this.glanceT >= 0 ? envelope(this.glanceT, 0.55, 1.9, 0.7) : 0
    b.add(p, J.neck, 0, this.glanceYaw * 0.35 * gw, 0)
    b.add(p, J.head, 1.6 * noise1(t * 0.4, 2) + this.glancePitch * gw, 3 * noise1(t * 0.33, 1) + this.glanceYaw * 0.65 * gw, 1.2 * noise1(t * 0.27, 3))

    if (this.wadeW > 0.01) this.wadeArms(p, this.wadeW)
  }

  private updateGlance(dt: number): void {
    const still = this.moveW < 0.05 && !this.gesture && !this.hasLook && this.groundW > 0.9 && this.state !== 'cutscene'
    if (!still) {
      this.idleT = 0
      this.glanceT = -1
      return
    }
    this.idleT += dt
    if (this.glanceT >= 0) {
      this.glanceT += dt
      if (this.glanceT > 3.2) this.glanceT = -1
    } else if (this.idleT > this.glanceNext) {
      this.glanceT = 0
      this.idleT = 0
      this.glanceNext = 5.5 + this.rand() * 5
      this.glanceYaw = (this.rand() > 0.5 ? 1 : -1) * (22 + this.rand() * 22)
      this.glancePitch = -6 + this.rand() * 12
    }
  }

  private rand(): number {
    this.seed = (this.seed * 16807) % 2147483647
    return (this.seed - 1) / 2147483646
  }

  private wadeArms(p: Pose, w: number): void {
    const b = this.b
    b.add(p, J.upperArmL, -10 * w, 0, 26 * w)
    b.add(p, J.upperArmR, -10 * w, 0, 26 * w)
    b.addElbow(p, 0, 40 * w)
    b.addElbow(p, 1, 40 * w)
    b.add(p, J.handL, -16 * w, 0, 0)
    b.add(p, J.handR, -16 * w, 0, 0)
  }

  private buildLoco(): void {
    const p = this.loco.copy(this.pIdle)
    const b = this.b
    const g = this.g
    const ph = this.phase
    const run = clamp01((this.speed - (this.m.walkSpeed || 2)) / Math.max(0.1, (this.m.runSpeed || 5.6) - (this.m.walkSpeed || 2)))
    const arms = swingSignal(ph, 0.04) // +1 when the left foot is furthest forward
    const roll = Math.cos(TAU * (ph - g.stance / 2)) // +1 at left mid-stance
    const bob = Math.cos(2 * TAU * (ph - g.stance / 2))

    const accelLean = clamp(this.accel * 1.1, -9, 9)
    const slopeLean = this.slope * 14
    const lean = g.lean + accelLean + slopeLean
    const bankDeg = this.bank / DEG

    p.pos.set(0.014 * roll * (1 - run) - Math.sin(this.bank) * 0.5, g.drop + g.bob * bob, -0.01 * accelLean / 9)
    b.set(p, J.hips, lean * 0.25, -g.pelvisYaw * arms, g.pelvisRoll * roll + bankDeg)
    b.set(p, J.spine, lean * 0.4, g.chestYaw * 0.35 * arms, -g.pelvisRoll * 0.6 * roll)
    b.set(p, J.chest, lean * 0.35, g.chestYaw * 0.65 * arms, -g.pelvisRoll * 0.3 * roll)

    b.set(p, J.shoulderL, 0, 5 * arms * (g.arm / 40), -1)
    b.set(p, J.shoulderR, 0, -5 * arms * (g.arm / 40), -1)
    const fwdL = Math.max(0, -arms)
    const fwdR = Math.max(0, arms)
    b.set(p, J.upperArmL, g.arm * arms - 4 * run, 8, g.armOut - 6 * fwdL)
    b.set(p, J.upperArmR, -g.arm * arms - 4 * run, 8, g.armOut - 6 * fwdR)
    b.elbow(p, 0, g.elbow + g.elbowSwing * (0.5 - 0.5 * arms), 12 * run)
    b.elbow(p, 1, g.elbow + g.elbowSwing * (0.5 + 0.5 * arms), 12 * run)
    b.set(p, J.handL, -6, 0, 0)
    b.set(p, J.handR, -6, 0, 0)
    p.curl[0] = p.curl[1] = g.fist
    p.stab = 0.75
    if (this.wadeW > 0.01) this.wadeArms(p, this.wadeW * 0.6)
  }

  /* ── air layer ───────────────────────────────────────────── */

  private buildAir(dt: number): void {
    const a = this.air
    const m = this.m
    const t = this.airT
    const falling = ramp(-0.5, -6, m.vy)
    switch (this.airKind) {
      case 'jump':
        a.copy(this.pJumpUp).blend(this.pJumpTuck, ramp(0.05, 0.32, t))
        if (falling > 0) a.blend(this.fallPose(this.tmp), falling * 0.85)
        break
      case 'bounce':
        a.copy(this.pStar).blend(this.pJumpTuck, ramp(0.22, 0.55, t))
        if (falling > 0) a.blend(this.fallPose(this.tmp), falling * 0.85)
        break
      case 'flip': {
        a.copy(this.pJumpTuck)
        if (falling > 0) a.blend(this.fallPose(this.tmp), falling * 0.7)
        a.blend(this.pFlip, envelope(this.flipT, 0.07, FLIP_TIME * 0.72, 0.2))
        break
      }
      default:
        this.fallPose(a)
    }
    if (this.airFade < 1) {
      this.airFade = Math.min(1, this.airFade + dt / 0.16)
      this.tmp.copy(this.airFrom).blend(a, smooth(this.airFade))
      a.copy(this.tmp)
    }
    this.airPrev.copy(a)

    if (this.flipT >= 0) {
      // Land early → finish the turn quickly rather than snapping.
      this.flipT += dt * (this.groundW > 0.5 ? 4 : 1)
      if (this.flipT >= FLIP_TIME + 0.25) this.flipT = -1
    }
  }

  /** Falling: arms out for balance, legs bicycling slowly; grows with time in the air. */
  private fallPose(p: Pose): Pose {
    p.copy(this.pFall)
    const b = this.b
    const amp = ramp(0.1, 0.9, this.airKind === 'fall' ? this.airT : this.airT - 0.4) * (0.6 + 0.4 * ramp(-2, -12, this.m.vy))
    const w = this.t * TAU * 1.15
    b.add(p, J.thighL, -16 * amp * Math.sin(w), 0, 0)
    b.add(p, J.thighR, -16 * amp * Math.sin(w + Math.PI), 0, 0)
    b.add(p, J.shinL, 16 * amp * (0.5 + 0.5 * Math.sin(w + 1.6)), 0, 0)
    b.add(p, J.shinR, 16 * amp * (0.5 + 0.5 * Math.sin(w + 1.6 + Math.PI)), 0, 0)
    b.add(p, J.upperArmL, 7 * amp * Math.cos(w * 1.3), 0, 11 * amp * Math.sin(w * 1.3))
    b.add(p, J.upperArmR, 7 * amp * Math.cos(w * 1.3 + 2), 0, 11 * amp * Math.sin(w * 1.3 + 2))
    b.addElbow(p, 0, 10 * amp * Math.sin(w * 1.3 + 0.5))
    b.addElbow(p, 1, 10 * amp * Math.sin(w * 1.3 + 2.5))
    return p
  }

  /* ── actions ─────────────────────────────────────────────── */

  private applyActions(dt: number, out: Pose): void {
    const s = this.state

    const dashTarget = s === 'dash' ? 1 : 0
    this.dashW = damp(this.dashW, dashTarget, dashTarget ? 30 : 9, dt)
    if (this.dashW > 0.002) out.blend(this.pDash, this.dashW)

    this.spin = 0
    if (this.spinT >= 0) {
      this.spinT += dt
      const f = this.spinT / SPIN_TIME
      const w = envelope(this.spinT, 0.05, SPIN_TIME * 0.8, 0.16)
      out.blendJoints(this.pAttack, w, UPPER)
      out.curl[0] = lerp(out.curl[0], this.pAttack.curl[0], w)
      out.curl[1] = lerp(out.curl[1], this.pAttack.curl[1], w)
      out.pos.y += this.pAttack.pos.y * w * this.groundW
      if (f < 1) this.spin = TAU * easeOut(f)
      if (this.spinT > SPIN_TIME + 0.2) this.spinT = -1
    }

    const deadTarget = s === 'dead' ? 1 : 0
    this.deadW = damp(this.deadW, deadTarget, deadTarget ? 5 : 8, dt)
    if (this.deadW > 0.002) out.blend(this.pDead, smooth(this.deadW))

    if (this.hurtT >= 0) {
      this.hurtT += dt
      const w = envelope(this.hurtT, 0.05, 0.14, 0.34)
      this.addPose(out, this.pHurt, w)
      out.curl[0] = lerp(out.curl[0], this.pHurt.curl[0], w)
      out.curl[1] = lerp(out.curl[1], this.pHurt.curl[1], w)
      if (this.hurtT > 0.55) this.hurtT = -1
    }

    if (this.landT >= 0) {
      this.landT += dt
      const down = 0.07
      const up = 0.2 + 0.22 * this.landAmp
      const c = this.landT < down ? easeOut(this.landT / down) : 1 - smooth((this.landT - down) / up)
      const w = c * this.landAmp * this.groundW
      out.pos.y -= 0.17 * w
      this.addPose(out, this.pLand, w)
      if (this.landT > down + up) this.landT = -1
    }
  }

  /** Overridden: whatever the body was in the middle of (flips, spins, gestures, looks) is dropped. */
  private dropActions(): void {
    this.flipT = this.spinT = this.hurtT = this.landT = -1
    this.spin = 0
    this.dashW = this.deadW = this.lookW = 0
    if (this.gesture) this.finishGesture()
    this.snapT = 1
  }

  /** out ← (identity → add, by w) applied on top of out. */
  private addPose(out: Pose, add: Pose, w: number): void {
    if (w <= 0.001) return
    for (let j = 0; j < add.q.length; j++) {
      _q1.identity().slerp(add.q[j], w)
      out.q[j].premultiply(_q1)
    }
    out.pos.addScaledVector(add.pos, w)
  }

  /** Subtle breathing on top of everything (slower and smaller when moving). */
  private breathe(out: Pose): void {
    const k = 1 - 0.6 * this.moveW
    const br = Math.sin(this.t * TAU * 0.24) * k
    this.b.add(out, J.chest, -1.1 * br, 0, 0)
    this.b.add(out, J.shoulderL, 0, 0, 1.1 * br)
    this.b.add(out, J.shoulderR, 0, 0, 1.1 * br)
  }

  /* ── gestures ────────────────────────────────────────────── */

  private beginSnap(duration: number): void {
    this.snap.copy(this.out)
    this.snapT = 0
    this.snapDur = duration
  }

  private finishGesture(): void {
    const g = this.gesture
    if (!g) return
    g.resolve?.()
    this.gesture = null
  }

  private applyGesture(dt: number, out: Pose): void {
    const g = this.gesture
    if (!g) return
    const def = g.def
    g.t += dt * g.speed
    if (g.loop && !g.stopping && g.t > def.loop[1]) {
      const len = Math.max(0.01, def.loop[1] - def.loop[0])
      g.t = def.loop[0] + ((g.t - def.loop[1]) % len)
    }
    const p = this.gpose
    const times = g.times
    const n = times.length
    if (g.t <= times[0]) p.copy(g.keys[0])
    else if (g.t >= times[n - 1]) p.copy(g.keys[n - 1])
    else {
      let i = 0
      while (i < n - 2 && g.t >= times[i + 1]) i++
      p.copy(g.keys[i]).blend(g.keys[i + 1], smooth((g.t - times[i]) / (times[i + 1] - times[i])))
    }
    def.extra?.(g.t, p, this.b)

    const fadeIn = def.fadeIn > 0 ? smooth(g.t / def.fadeIn) : 1
    const fadeOut = 1 - smooth((g.t - (def.duration - def.fadeOut)) / Math.max(0.01, def.fadeOut))
    out.blend(p, fadeIn * fadeOut)
    if (g.t >= def.duration) this.finishGesture()
  }

  /* ── feet ────────────────────────────────────────────────── */

  private updateFeet(dt: number, out: Pose, teleported: boolean): void {
    const c = Math.cos(this.yaw)
    const s = Math.sin(this.yaw)
    const root = this.root
    const wGait = ramp(0, 0.5, this.moveW)
    const g = this.g

    // Plants: follow the stride while moving, stay put when standing, re-plant when airborne.
    const standing = this.moveW < 0.25 && this.groundW > 0.95
    if (teleported || this.groundW < 0.5) {
      for (let i = 0; i < 2; i++) this.plantAt(i, this.yaw, c, s)
    } else if (!standing) {
      this.stepWait = 0.03
      if (wGait >= 1) {
        for (let i = 0; i < 2; i++) {
          footAt(this.foot, g, wrap01(this.phase + i * 0.5), i as 0 | 1)
          this.toWorld(this.plants[i].pos, this.foot.x, this.foot.z, c, s)
          this.plants[i].yaw = this.yaw
          this.plants[i].stepT = -1
        }
      }
    } else {
      this.settleSteps(dt, c, s, !!this.gesture)
    }

    for (let i = 0; i < 2; i++) {
      const side = i as 0 | 1
      const pl = this.plants[i]
      const tg = this.targets[i]
      footAt(this.foot, g, wrap01(this.phase + i * 0.5), side)

      // Planted (or stepping) foot in character space.
      const dx = pl.pos.x - root.x
      const dz = pl.pos.z - root.z
      let px = c * dx - s * dz
      let pz = s * dx + c * dz
      let py = 0
      let pPitch = 0
      if (pl.stepT >= 0) {
        const u = smooth(pl.stepT)
        _v1.copy(pl.from).lerp(pl.to, u)
        const ddx = _v1.x - root.x
        const ddz = _v1.z - root.z
        px = c * ddx - s * ddz
        pz = s * ddx + c * ddz
        py = 0.06 * Math.sin(Math.PI * pl.stepT)
        pPitch = 0.22 * Math.sin(Math.PI * pl.stepT) - 0.12 * Math.sin(TAU * pl.stepT)
      }
      const plantYaw = pl.stepT >= 0 ? lerp(pl.fromYaw, pl.toYaw, smooth(pl.stepT)) : pl.yaw
      const sideSign = side === 0 ? 1 : -1
      const idleYaw = IDLE_FOOT_YAW * sideSign + wrapAngle(plantYaw - this.yaw)
      const gaitYaw = g.footYaw * DEG * sideSign

      const off = out.footOff[i]
      const x = lerp(px, this.foot.x, wGait) + off.x * sideSign
      const z = lerp(pz, this.foot.z, wGait) + off.z
      const lift = lerp(py, this.foot.y, wGait) + off.y
      tg.pitch = lerp(pPitch, this.foot.pitch, wGait) + out.footPitch[i]
      tg.yaw = lerp(idleYaw, gaitYaw, wGait)
      tg.contact = 1 - lerp(pl.stepT >= 0 ? 1 : 0, this.foot.swing, wGait) * ramp(0, 0.03, lift)

      // Ground under the foot.
      let rel = 0
      _v2.set(0, 1, 0)
      if (this.probe(root.x + c * x + s * z, root.z - s * x + c * z, root.y, this.hit)) {
        rel = clamp(this.hit.y - root.y, -0.32, 0.32)
        _v2.set(c * this.hit.nx - s * this.hit.nz, this.hit.ny, s * this.hit.nx + c * this.hit.nz)
        // Limit the tilt to something an ankle can do.
        if (_v2.y < 0.9) _v2.lerp(UP, (0.9 - _v2.y) / 0.9).normalize()
      }
      this.footRel[i] = teleported ? rel : damp(this.footRel[i], rel, 28, dt)
      tg.normal.lerp(_v2, teleported ? 1 : 1 - Math.exp(-20 * dt)).normalize()
      tg.sole.set(x, this.footRel[i] + lift, z)
    }
    const drop = Math.min(0, this.footRel[0], this.footRel[1])
    this.hipsGround = teleported ? drop : damp(this.hipsGround, drop, 14, dt)
  }

  private toWorld(out: THREE.Vector3, x: number, z: number, c: number, s: number): void {
    out.set(this.root.x + c * x + s * z, this.root.y, this.root.z - s * x + c * z)
  }

  private plantAt(i: number, yaw: number, c: number, s: number): void {
    const f = IDLE_FEET[i]
    this.toWorld(this.plants[i].pos, f.x, f.z, c, s)
    this.plants[i].yaw = yaw
    this.plants[i].stepT = -1
  }

  /** Standing still: move a foot back under the body when it ended up far away or twisted. */
  private settleSteps(dt: number, c: number, s: number, locked: boolean): void {
    let stepping = 0
    for (const pl of this.plants) {
      // A planted foot pivots on the ball rather than letting the leg twist past ~45°.
      const twist = wrapAngle(pl.yaw - this.yaw)
      if (Math.abs(twist) > 0.8) pl.yaw = this.yaw + Math.sign(twist) * 0.8
      if (pl.stepT < 0) continue
      pl.stepT += dt / (pl.stepT < 1 && pl.toYaw !== pl.fromYaw && Math.abs(wrapAngle(pl.toYaw - pl.fromYaw)) > 0.6 ? STEP_TIME * 0.75 : STEP_TIME)
      if (pl.stepT >= 1) {
        pl.pos.copy(pl.to)
        pl.yaw = pl.toYaw
        pl.stepT = -1
        this.stepWait = 0.04
      } else if (pl.stepT < 0.55) stepping++
      else stepping += 0.5
    }
    this.stepWait -= dt
    // One foot at a time; the next may lift once the current one is coming down.
    if (stepping >= 1 || locked || this.stepWait > 0) return
    let worst = -1
    let worstErr = 0
    for (let i = 0; i < 2; i++) {
      const pl = this.plants[i]
      if (pl.stepT >= 0) continue
      this.toWorld(_v1, IDLE_FEET[i].x, IDLE_FEET[i].z, c, s)
      const err = Math.hypot(_v1.x - pl.pos.x, _v1.z - pl.pos.z) + Math.abs(wrapAngle(pl.yaw - this.yaw)) * 0.25
      if (err > worstErr) {
        worstErr = err
        worst = i
      }
    }
    if (worst < 0 || worstErr < 0.1) return
    const pl = this.plants[worst]
    pl.from.copy(pl.pos)
    this.toWorld(pl.to, IDLE_FEET[worst].x, IDLE_FEET[worst].z, c, s)
    pl.fromYaw = pl.yaw
    pl.toYaw = this.yaw
    pl.stepT = 0
  }

  /** Ankle position + foot/toe orientation for a target (foot rolls over the ball or the heel). */
  private footPose(side: 0 | 1, tg: FootTarget): void {
    const leg = this.rig.legs[side]
    const qBase = _q1.setFromUnitVectors(UP, tg.normal).multiply(_q2.setFromAxisAngle(UP, tg.yaw))
    const qPitch = _q3.setFromAxisAngle(leg.pitchAxis, tg.pitch)
    const pivot = tg.pitch >= 0 ? leg.ballRel : leg.heelRel
    _v1.copy(leg.ankleRel).sub(pivot).applyQuaternion(qPitch).add(pivot).applyQuaternion(qBase)
    tg.ankle.copy(tg.sole).add(_v1)
    tg.footQ.copy(qBase).multiply(qPitch)
    // Toes stay flat on the ground while the heel is up and the foot is in contact.
    if (tg.pitch > 0) tg.toeQ.copy(qBase).multiply(_q2.identity().slerp(qPitch, 1 - tg.contact))
    else tg.toeQ.copy(tg.footQ)
  }

  /* ── solve & write ───────────────────────────────────────── */

  private solve(dt: number, out: Pose): void {
    const rig = this.rig
    const C = rig.C

    if (this.flipT >= 0) {
      const f = clamp01(this.flipT / FLIP_TIME)
      _q1.setFromAxisAngle(AX_X, TAU * (f * f * (3 - 2 * f)))
      rig.pivotHips(out, _q1, FLIP_PIVOT)
    }
    const ik = clamp01(out.ik)
    rig.hipsPos.copy(rig.hipsRest).add(out.pos)
    rig.hipsPos.y += this.hipsGround * ik
    rig.accumulate(out, SPINE_CHAIN)

    for (let i = 0; i < 2; i++) this.footPose(i as 0 | 1, this.targets[i])

    // Hips height limiter: never ask a leg to reach further than it can.
    if (ik > 0.01) {
      let need = 0
      for (let i = 0; i < 2; i++) {
        const leg = rig.legs[i]
        const a = this.targets[i].ankle
        _v1.copy(rig.offset[leg.hip]).applyQuaternion(C[J.hips]).add(rig.hipsPos)
        const r = rig.maxReach(i as 0 | 1)
        const h2 = (_v1.x - a.x) ** 2 + (_v1.z - a.z) ** 2
        if (h2 >= r * r) continue
        const dy = _v1.y - a.y - Math.sqrt(r * r - h2)
        if (dy > need) need = dy
      }
      rig.hipsPos.y -= Math.min(need, 0.16) * ik
    }

    this.updateLook(dt)
    this.stabilizeHead(out)

    if (ik > 0.001) {
      for (let i = 0; i < 2; i++) {
        const side = i as 0 | 1
        const [thigh, shin, foot, toe] = LEG_JOINTS[i]
        const leg = rig.legs[i]
        const tg = this.targets[i]
        // Knee direction: the bend of the authored FK leg (relative to its own hip→ankle line),
        // carried over to the target line and biased forward over the toes.
        const hip = _v1.copy(rig.offset[leg.hip]).applyQuaternion(C[J.hips]).add(rig.hipsPos)
        _q1.multiplyQuaternions(C[J.hips], out.q[thigh])
        const pole = _v2.copy(rig.offset[leg.knee]).applyQuaternion(_q1)
        _q1.multiply(out.q[shin])
        _v3.copy(rig.offset[leg.ankle]).applyQuaternion(_q1).add(pole).normalize()
        pole.addScaledVector(_v3, -pole.dot(_v3))
        _v4.subVectors(tg.ankle, hip).normalize()
        pole.applyQuaternion(_q1.setFromUnitVectors(_v3, _v4))
        _v3.set(Math.sin(KNEE_OUT) * (side === 0 ? 1 : -1), 0, Math.cos(KNEE_OUT)).applyQuaternion(C[J.hips])
        pole.addScaledVector(_v3, 0.04)

        rig.solveLeg(side, tg.ankle, pole, this.qThigh, this.qShin)
        // character-space → parent-relative offsets, blended with the authored FK legs.
        _q1.copy(C[J.hips]).invert().multiply(this.qThigh)
        out.q[thigh].slerp(_q1, ik)
        _q1.copy(this.qThigh).invert().multiply(this.qShin)
        out.q[shin].slerp(_q1, ik)
        _q1.copy(this.qShin).invert().multiply(tg.footQ)
        out.q[foot].slerp(_q1, ik)
        _q1.copy(tg.footQ).invert().multiply(tg.toeQ)
        out.q[toe].slerp(_q1, ik)
      }
    }
    rig.write(out)
  }

  private updateLook(dt: number): void {
    let wTarget = 0
    if (this.hasLook && !this.ovr) {
      const c = Math.cos(this.yaw)
      const s = Math.sin(this.yaw)
      const dx = this.lookTarget.x - this.root.x
      const dz = this.lookTarget.z - this.root.z
      const dy = this.lookTarget.y - (this.root.y + 1.42)
      const cx = c * dx - s * dz
      const cz = s * dx + c * dz
      const yaw = Math.atan2(cx, cz)
      const pitch = Math.atan2(dy, Math.hypot(cx, cz))
      // Fade out for targets far behind rather than breaking the neck.
      wTarget = 1 - ramp(115 * DEG, 160 * DEG, Math.abs(yaw))
      this.lookYaw = lerp(this.lookYaw, clamp(yaw, -1.25, 1.25), 1 - Math.exp(-8 * dt))
      this.lookPitch = lerp(this.lookPitch, clamp(pitch, -0.6, 0.7), 1 - Math.exp(-8 * dt))
    }
    this.lookW = damp(this.lookW, wTarget, 5, dt)
  }

  /** Keeps the head steady against spine motion and turns it toward the look target. */
  private stabilizeHead(out: Pose): void {
    const rig = this.rig
    const C = rig.C
    const lw = this.lookW
    const w = Math.max(clamp01(out.stab), lw)
    if (w < 0.001) return
    if (lw > 0.001) {
      // The chest takes a share of big look turns.
      _q1.setFromAxisAngle(UP, this.lookYaw * 0.22 * lw).multiply(C[J.chest])
      rig.setWorld(out, J.chest, _q1)
      rig.accumulate(out, NECK_HEAD)
    }
    // Desired head orientation: its own authored offset (neck · head) in character space…
    const desired = _q2.multiplyQuaternions(out.q[J.neck], out.q[J.head])
    if (lw > 0.001) {
      // …turned toward the look target.
      _e.set(-this.lookPitch * lw, this.lookYaw * lw * 0.78, 0, 'YXZ')
      desired.premultiply(_q1.setFromEuler(_e))
    }
    const target = _q3.copy(C[J.head]).slerp(desired, w)
    // The neck takes 40 % of the correction, the head the rest.
    _q1.copy(C[J.head]).invert().premultiply(target)
    _q4.identity().slerp(_q1, 0.4).multiply(C[J.neck])
    rig.setWorld(out, J.neck, _q4)
    rig.accumulate(out, HEAD_ONLY)
    rig.setWorld(out, J.head, target)
  }
}
