/**
 * Player controller — movement, collision, abilities and health.
 *
 * The hero is a kinematic capsule (feet at `position`) moved in sub-steps of at most
 * 0.25 m against ctx.collision: walls through pushOut, floors through groundAt (step-up,
 * snap-down), heads through ceilingAt. Terrain steeper than normal.y 0.68 can't be walked
 * up and makes the hero slide. On top of that: a variable-height jump with coyote time and
 * buffering, a double jump, a dash, a spin attack, moving-platform riding, bounce pads,
 * wading and drowning. Every frame `motion` is filled for the animator.
 *
 * Three more moves sit on top (tuning: ROLL, SLIDE, WALLRUN): a dodge-roll, committed along the
 * stick's direction, that nothing can hurt in its middle; a slide out of a sprint that keeps the
 * momentum, gains on a downhill, loses on the flat and leaps long and low when jumped out of; and
 * a wall-run, caught by jumping into a wall at a glancing angle (control/wall.ts feels for it),
 * that arcs along it until it is kicked off, let go of or runs out. Each wall once per airtime.
 *
 * Creative: nothing hurts, and a double-tapped jump toggles flight (no gravity; jump rises,
 * descend sinks, boost speeds up; touching down ends it).
 *
 * Ragdoll: R (or a landing far too hard, or death) makes the Character go limp. The capsule then
 * stops colliding and rides along with the body (so the camera follows it); when the get-up
 * starts it moves to where the hero stands up, and control returns once he is on his feet.
 */
import * as THREE from 'three'
import type { Collider, GroundHit, WallPush } from '../collision'
import { v3, type V3 } from '../events'
import type { Ctx, IPlayerController, MotionState, PlayerState } from '../types'
import { clamp, lerp, PLAY_RADIUS, smoothstep, type Surface } from '../world/heightfield'
import { approach, damp, wrapAngle } from './control/math'
import { MOVE as M, ROLL, SLIDE, WALLRUN as W } from './control/tuning'
import { WallSensor, makeWallContact, type WallContact } from './control/wall'

const ISLE_BOUNDS = { x: 0, z: 0, r: PLAY_RADIUS }

const GROUND_STATES: ReadonlySet<PlayerState> = new Set<PlayerState>(['idle', 'move', 'wade', 'land', 'cutscene'])

export class PlayerController implements IPlayerController {
  readonly position = new THREE.Vector3()
  readonly velocity = new THREE.Vector3()
  readonly radius = M.radius
  readonly maxHp = M.maxHp
  controlEnabled = true

  readonly motion: MotionState = {
    state: 'idle', stateTime: 0, speed: 0,
    walkSpeed: M.walkSpeed, runSpeed: M.runSpeed, sprintSpeed: M.sprintSpeed,
    vy: 0, grounded: true, turnRate: 0, landImpact: 0, wading: 0, slope: 0, wallSide: 0,
  }

  private _yaw = 0
  private _state: PlayerState = 'idle'
  private _hp: number = M.maxHp
  private _grounded = true
  private stateTime = 0

  /** Ground under the feet (rewritten by every groundAt query). */
  private readonly hit: GroundHit = { y: 0, nx: 0, ny: 1, nz: 0, surface: 'grass', collider: null, water: 0 }
  private readonly probe: GroundHit = { y: 0, nx: 0, ny: 1, nz: 0, surface: 'grass', collider: null, water: 0 }
  private readonly push: WallPush = { x: 0, z: 0, hit: false, nx: 0, nz: 0 }

  /** Collider we stand on, and where it was last frame (we ride its actual displacement). */
  private support: Collider | null = null
  private supX = 0
  private supY = 0
  private supZ = 0
  private supYaw = 0
  /** External push for this frame (m/s), from drift(); consumed by the next tick. */
  private driftX = 0
  private driftZ = 0
  /** Measured velocity of the support (inherited when leaving it). */
  private platVX = 0
  private platVY = 0
  private platVZ = 0

  /** Sliding down ground too steep to stand on (the sprint slide is `slideT`). */
  private sliding = false
  /** Vertical speed used to move this frame: the average of before/after gravity (frame-rate independent arcs). */
  private vyMove = 0
  /** Time spent standing on too-steep ground without it dropping away (debounces slides at cliff bases). */
  private steepT = 0
  private airTime = 0
  private airMax: number = M.runSpeed
  private coyoteT = 0
  private jumpBufT = 0
  private jumpCut = false
  private canDouble = true
  private airDash = true
  private airSpin = true

  private dashT = 0
  private dashCd = 0
  private dashBufT = 0
  private dashX = 0
  private dashZ = 1
  private attackT = 0
  private attackCd = 0
  private attackBufT = 0

  /** Seconds into the dodge-roll (-1: not rolling), its heading, and the wait before the next. */
  private rollT = -1
  private rollX = 0
  private rollZ = 1
  private rollCd = 0
  private rollBufT = 0
  /** Seconds into the sprint slide (-1: not sliding), the wait before the next, and the buffered low press. */
  private slideT = -1
  private slideCd = 0
  private lowBufT = 0
  /** Seconds into the wall-run (-1: not on a wall), the wall, the way along it and the speed held. */
  private wallT = -1
  private wallCd = 0
  private readonly wall = makeWallContact()
  private readonly wallFound = makeWallContact()
  private readonly wallNrm: V3 = { x: 0, y: 0, z: 1 }
  private wallTX = 0
  private wallTZ = 0
  private wallSpeed = 0
  /** -1 with the wall on the hero's left, 1 on his right, 0 off the wall. */
  private wallSide = 0
  /** How long the stick has pointed away from the wall. */
  private wallAwayT = 0
  /** Normals (x, z pairs) of the walls run along since the last landing: each wall once per airtime. */
  private readonly wallsUsed = new Float32Array(8)
  private wallsUsedN = 0
  private readonly sensor: WallSensor

  private hurtT = 0
  private invulnT = 0
  /** Whether the Character is currently told to blink (only while invulnerable outside cutscenes). */
  private blinking = false
  private dead = false
  private landT = 0
  private landImpact = 0

  private depth = -1
  private wadeT = 0
  private stepPhase = 0.5
  private turnRate = 0
  private slope = 0
  private _stompSpeed = 0

  /** Movement intent this frame: world-space unit direction, stick magnitude, target speed. */
  private wishX = 0
  private wishZ = 0
  private wishMag = 0
  private wishSpeed = 0
  /** Time the stick has been pushed (nearly) all the way — on a pad that builds into a sprint. */
  private fullTiltT = 0

  /** Ragdoll: capsule already moved to the stand-up spot; seconds spent floating in deep water. */
  private ragPlaced = false
  private drownT = 0
  private readonly anchor = new THREE.Vector3()

  /** Creative flight, and when jump was last pressed (real clock) for the double-tap toggle. */
  private _flying = false
  private lastJumpTap = -1

  private failed = false

  constructor(private ctx: Ctx) {
    this.sensor = new WallSensor(ctx.collision)
  }

  /* ── IPlayerController getters ───────────────────────────── */

  get yaw(): number {
    return this._yaw
  }
  get height(): number {
    return this.rollT >= 0 || this.slideT >= 0 ? ROLL.height : M.height
  }
  get state(): PlayerState {
    return this._state
  }
  get hp(): number {
    return this._hp
  }
  get grounded(): boolean {
    return this._grounded
  }
  get invulnerable(): boolean {
    return this.invulnT > 0 || this.rollSafe
  }
  get wallNormal(): V3 | null {
    return this.wallT >= 0 ? this.wallNrm : null
  }
  get attacking(): boolean {
    return this.attackT > 0
  }
  get stompSpeed(): number {
    return this._stompSpeed
  }
  get flying(): boolean {
    return this._flying
  }
  get dashReady(): number {
    if (this.dashT > 0) return 0
    if (!this._grounded && !this.airDash) return 0
    return clamp(1 - this.dashCd / (M.dashTime + M.dashCooldown), 0, 1)
  }

  /* ── lifecycle ───────────────────────────────────────────── */

  init(): void {
    this.writeMotion()
  }

  update(dt: number): void {
    if (!(dt > 0)) return
    try {
      this.tick(dt)
    } catch (err) {
      if (!this.failed) console.error('[starfall] player update failed', err)
      this.failed = true
    }
  }

  dispose(): void {
    this.support = null
  }

  /* ── public actions ──────────────────────────────────────── */

  teleport(x: number, y: number, z: number, yaw: number): void {
    this.ctx.character?.cancelRagdoll()
    this._flying = false
    this.position.set(x, y, z)
    this.velocity.set(0, 0, 0)
    this._yaw = wrapAngle(yaw)
    this.dead = false
    this.ragPlaced = false
    this.resetMotion()
    this.invulnT = 0
    this.setBlink(false)
    this.settle()
    this._state = 'idle'
    this.stateTime = 0
    this.writeMotion()
  }

  /** Clears every move in progress (jumps, dashes, attacks, landings, rolls, slides, wall-runs). */
  private resetMotion(): void {
    this.cancelMoves()
    this.rollCd = this.slideCd = this.wallCd = this.rollBufT = this.lowBufT = 0
    this.wallsUsedN = 0
    this.hurtT = this.dashT = this.dashCd = this.attackT = this.attackCd = 0
    this.coyoteT = this.jumpBufT = this.dashBufT = this.attackBufT = 0
    this.landT = this.landImpact = this.airTime = this.turnRate = this.slope = this.wadeT = this.vyMove = 0
    this.jumpCut = false
    this.canDouble = this.airDash = this.airSpin = true
    this.airMax = M.runSpeed
    this.stepPhase = 0.5
    this._stompSpeed = 0
    this.sliding = false
    this.drownT = 0
  }

  /** Stands on the ground just below the feet (or lets go of it), refreshing support and water depth. */
  private settle(): void {
    const p = this.position
    const g = this.ctx.collision.groundAt(p.x, p.z, p.y + 0.05, M.radius, M.stepUp, this.hit)
    if (p.y - g.y <= M.snapDown) {
      p.y = g.y
      this._grounded = true
      this.setSupport(g.collider)
    } else {
      this._grounded = false
      this.setSupport(null)
    }
    this.depth = g.water - p.y
  }

  hurt(amount: number, from: V3): void {
    if (this.ctx.game.creative) return
    if (!(amount > 0) || this.invulnT > 0 || this.dashT > 0 || this.rollSafe || this.dead || !this.controlEnabled) return
    const p = this.position
    const v = this.velocity
    this.cancelMoves()
    this._hp = Math.max(0, this._hp - amount)
    let dx = p.x - from.x
    let dz = p.z - from.z
    let l = Math.hypot(dx, dz)
    if (l < 1e-3) {
      dx = -Math.sin(this._yaw)
      dz = -Math.cos(this._yaw)
      l = 1
    }
    dx /= l
    dz /= l
    const limp = this.ctx.character.ragdolling
    if (limp) {
      // Down (or getting up): the blow knocks the body about instead.
      const k = M.ragdollHitKick
      this.ctx.character.startRagdoll({ x: dx * M.knockback * k, y: M.knockbackUp * k, z: dz * M.knockback * k })
    } else {
      v.set(dx * M.knockback, M.knockbackUp, dz * M.knockback)
      // Flinch facing the thing that hit us.
      this._yaw = Math.atan2(-dx, -dz)
      this.leaveGround(false)
      this.attackT = 0
      this.jumpCut = false
      this.hurtT = M.hurtTime
    }
    this.invulnT = M.invulnTime
    // A fatal blow goes limp without the hit blink.
    this.setBlink(this._hp > 0)
    this.ctx.bus.emit('player:hurt', { pos: v3(p), hp: this._hp })
    this.ctx.game.shake(0.35, 0.3)
    if (this._hp <= 0) {
      this.dead = true
      if (!limp) this.setState('dead')
      this.ctx.game.playerDied('enemy')
    } else if (!limp) {
      this.setState('hurt')
    }
    this.writeMotion()
  }

  knock(impulse: V3, ragdoll: boolean): void {
    if (this.dead || !this.controlEnabled || !Number.isFinite(impulse.x + impulse.y + impulse.z)) return
    const ch = this.ctx.character
    if (ragdoll || ch.ragdolling) {
      ch.startRagdoll(impulse)
      if (ch.ragdolling && !this.limp) this.enterRagdoll()
      return
    }
    const v = this.velocity
    this.cancelMoves()
    v.x += impulse.x
    v.z += impulse.z
    v.y = Math.max(v.y, impulse.y)
    this.leaveGround(false)
    this.dashT = 0
    this.attackT = 0
    this.jumpCut = false
    this.writeMotion()
  }

  heal(amount: number): void {
    if (!(amount > 0) || this.dead) return
    this._hp = Math.min(this.maxHp, this._hp + amount)
  }

  resetHealth(): void {
    this._hp = this.maxHp
  }

  launch(vy: number): void {
    if (this.dead || this.ctx.character.ragdolling) return
    this.dashT = 0
    this.cancelMoves()
    this.bounce(vy)
    this.writeMotion()
  }

  drift(x: number, z: number): void {
    if (!Number.isFinite(x + z)) return
    this.driftX += x
    this.driftZ += z
  }

  /* ── frame ───────────────────────────────────────────────── */

  private tick(dt: number): void {
    const ctx = this.ctx
    const s = ctx.input.state
    const v = this.velocity

    this.stateTime += dt
    this.coyoteT -= dt
    this.jumpBufT -= dt
    this.dashBufT -= dt
    this.attackBufT -= dt
    this.dashCd -= dt
    this.attackCd -= dt
    this.rollBufT -= dt
    this.lowBufT -= dt
    this.rollCd -= dt
    this.slideCd -= dt
    this.wallCd -= dt
    this.landT -= dt
    if (this.hurtT > 0) this.hurtT -= dt
    if (this.attackT > 0) this.attackT -= dt
    if (this.invulnT > 0) this.invulnT -= dt
    // No hit blink in a cinematic (a shard grabbed right after a hit), or once he is down for good.
    this.setBlink(this.invulnT > 0 && this._hp > 0 && ctx.game.phase !== 'cutscene')
    if (!this._grounded && !this.sliding) this.airTime += dt

    if (this._flying && (ctx.character.ragdolling || !ctx.game.creative)) this._flying = false
    if (ctx.character.ragdolling) {
      this.driftX = this.driftZ = 0
      this.ragdollTick(dt)
      this.writeMotion()
      return
    }
    if (this._state === 'ragdoll') this.endRagdoll()

    const live = this.controlEnabled && !this.dead && this.hurtT <= 0
    if (live && s.ragdoll && this.flop()) {
      this.writeMotion()
      return
    }
    // A roll, slide or wall-run doesn't outlast control (a dialog opening, a cutscene, a fall).
    if (!live) this.cancelMoves()
    this.readInput(live, dt)

    // Ride whatever we stand on before anything else moves us.
    this.carry(dt)
    const yawBefore = this._yaw

    if (this.dashT > 0) {
      this.dashT -= dt
      if (this.dashT <= 0) this.endDash(false)
    }
    this.tickMoves(dt)

    // Creative: a quick second jump press toggles flight instead of jumping.
    const toggled = live && s.jump && this.flyTap()
    if (this._flying) {
      this.flySteer(dt, live)
    } else {
      if (live) {
        if (s.jump && !toggled) this.pressJump()
        if (s.dash) this.dashBufT = M.actionBuffer
        if (s.roll) this.rollBufT = M.actionBuffer
        if (s.low) this.pressLow()
        // With a weapon in hand the Weapons system owns the attack button.
        if (s.attack && !ctx.weapons.armed) this.attackBufT = M.actionBuffer
      } else {
        this.jumpBufT = this.dashBufT = this.attackBufT = this.rollBufT = this.lowBufT = 0
      }
      // A roll is committed: a jump only cuts its recovery short.
      const rollLocked = this.rollT >= 0 && this.rollT < ROLL.jumpFrom
      if (this.jumpBufT > 0 && (this._grounded || this.coyoteT > 0) && !rollLocked) this.jump(false)
      if (this.dashBufT > 0) this.tryDash()
      if (this.rollBufT > 0) this.tryRoll()
      if (this.lowBufT > 0) this.trySlide()
      if (this.attackBufT > 0) this.tryAttack()
      if (live && this.wallT < 0) this.tryWallRun()

      this.steer(dt)
      this.gravity(dt, live && s.jumpHeld)
    }

    // Integrate in sub-steps short enough that nothing tunnels.
    const travel = Math.max(Math.hypot(v.x, v.z), Math.abs(v.y)) * dt
    const n = Math.min(24, Math.max(1, Math.ceil(travel / M.maxSubstep)))
    const h = dt / n
    for (let i = 0; i < n && !this.limp; i++) {
      if (this.wallT >= 0) this.wallStep(h)
      else this.subStep(h)
    }
    this.applyDrift(dt)
    if (this.limp) {
      // Knocked flat by the landing: the ragdoll has taken over.
      this.writeMotion()
      return
    }

    this.keepInBounds()
    this.water(dt)
    this.face(dt)

    const raw = wrapAngle(this._yaw - yawBefore) / dt
    this.turnRate = damp(this.turnRate, raw, 14, dt)
    this.updateSlope(dt)
    this.footsteps(dt)
    this.resolveState()

    this._stompSpeed = !this._grounded && !this.sliding && v.y < 0 ? -v.y : 0
    if (this._grounded) this.support?.onStand?.(dt)
    this.writeMotion()
  }

  /** Wind and pulls (drift()): moved along the ground and out of walls, velocity untouched. */
  private applyDrift(dt: number): void {
    const dx = this.driftX * dt
    const dz = this.driftZ * dt
    this.driftX = this.driftZ = 0
    if (this.limp || this._flying || (dx === 0 && dz === 0)) return
    const p = this.position
    p.x += dx
    p.z += dz
    this.ctx.collision.pushOut(p, M.radius, M.height, this._grounded ? M.stepUp : M.airStepUp, this.push)
  }

  /** Converts the stick into a world-space direction (camera relative) and a target speed. */
  private readInput(live: boolean, dt: number): void {
    const s = this.ctx.input.state
    const mx = live ? s.moveX : 0
    const my = live ? s.moveY : 0
    const mag = Math.min(1, Math.hypot(mx, my))
    if (mag < M.deadzone) {
      this.wishX = this.wishZ = this.wishMag = this.wishSpeed = this.fullTiltT = 0
      return
    }
    const cy = this.ctx.cameraRig.yaw
    const fx = Math.sin(cy)
    const fz = Math.cos(cy)
    // forward(yaw) · moveY + right(yaw) · moveX, with right(yaw) = (-cos yaw, sin yaw)
    const wx = fx * my - fz * mx
    const wz = fz * my + fx * mx
    const l = Math.hypot(wx, wz) || 1
    this.wishX = wx / l
    this.wishZ = wz / l
    this.wishMag = mag

    const tilt = clamp((mag - 0.5) / 0.4, 0, 1)
    this.fullTiltT = this.ctx.input.device === 'pad' && mag > M.padSprintTilt ? this.fullTiltT + dt : 0
    let speed = mag < 0.5 ? M.walkSpeed * (mag / 0.5) : lerp(M.walkSpeed, M.runSpeed, tilt)
    if ((s.sprint || this.fullTiltT > M.padSprintDelay) && mag >= 0.5) speed = lerp(M.runSpeed, M.sprintSpeed, tilt)
    if (this.depth > M.wadeMin) speed *= M.wadeSlow
    if (this.attackT > 0) speed *= M.attackMove
    speed *= this.ctx.weapons.moveScale
    // Walking uphill costs a little speed (feels weighty, and reads on the steep paths).
    if (this._grounded && !this.hit.collider) {
      const g = this.hit
      const rise = -(g.nx * this.wishX + g.nz * this.wishZ) / Math.max(0.2, g.ny)
      speed *= 1 - M.uphillSlow * smoothstep(0.15, 0.9, rise)
    }
    this.wishSpeed = speed
  }

  /* ── abilities ───────────────────────────────────────────── */

  /** Creative: true when this jump press came soon enough after the last one to toggle flight. */
  private flyTap(): boolean {
    if (!this.ctx.game.creative) return false
    const now = this.ctx.clock.real
    if (now - this.lastJumpTap > M.flyTapWindow) {
      this.lastJumpTap = now
      return false
    }
    this.lastJumpTap = -1
    this._flying = !this._flying
    if (this._flying) {
      this.cancelMoves()
      this.leaveGround(false)
      this.dashT = this.attackT = this.jumpBufT = 0
      this.jumpCut = false
    }
    return true
  }

  /** Flight: glide toward the stick's direction; jump rises, descend sinks, boost goes faster. */
  private flySteer(dt: number, live: boolean): void {
    const s = this.ctx.input.state
    const v = this.velocity
    const fast = live && s.boost
    const speed = (fast ? M.flyFastSpeed : M.flySpeed) * this.wishMag
    v.x = damp(v.x, this.wishX * speed, M.flyAccel, dt)
    v.z = damp(v.z, this.wishZ * speed, M.flyAccel, dt)
    let rise = live ? (s.jumpHeld ? 1 : 0) - (s.descend ? 1 : 0) : 0
    if (rise > 0 && this.position.y > M.flyCeiling) rise = 0
    v.y = damp(v.y, rise * (fast ? M.flyFastClimb : M.flyClimb), M.flyAccel, dt)
    this.vyMove = v.y
  }

  private pressJump(): void {
    if (this.wallT >= 0) {
      this.wallJump()
      return
    }
    // About to touch down? Keep the press for a proper ground jump instead of wasting the double.
    if (!this._grounded && this.coyoteT <= 0 && this.canDouble && (this.dashT > 0 || !this.nearLanding())) {
      this.jump(true)
      return
    }
    this.jumpBufT = M.jumpBuffer
  }

  private nearLanding(): boolean {
    const p = this.position
    const v = this.velocity
    if (v.y >= 0 || this.sliding) return false
    const g = this.ctx.collision.groundAt(p.x, p.z, p.y, M.radius, M.airStepUp, this.probe)
    return p.y - g.y < Math.max(0.12, -v.y * 0.07) && (!!g.collider || g.ny >= M.walkableNy)
  }

  private jump(double: boolean): void {
    const v = this.velocity
    this.jumpBufT = 0
    this.coyoteT = 0
    this.attackT = 0
    if (this.dashT > 0) this.endDash(true)
    if (this.rollT >= 0) this.endRoll()
    const fromSlide = !double && this.slideT >= 0
    if (double) {
      this.canDouble = false
      v.y = Math.max(v.y, M.doubleJumpSpeed)
      // The double jump lets you redirect: keep your speed, take the stick's direction.
      if (this.wishMag > 0) {
        const sp = Math.min(Math.max(Math.hypot(v.x, v.z), this.wishSpeed * 0.85), Math.max(this.airMax, M.runSpeed))
        v.x = this.wishX * sp
        v.z = this.wishZ * sp
      }
    } else {
      // Jumping off a mover keeps its momentum (and its lift, if it was rising).
      const onPlatform = this._grounded && !!this.support?.dynamic
      const lift = onPlatform ? Math.max(0, this.platVY) : 0
      this.leaveGround(onPlatform)
      v.y = (fromSlide ? SLIDE.jumpSpeed : M.jumpSpeed) + lift
      if (fromSlide) {
        // Out of a slide the leap is long and low: less lift, more speed.
        const sp = Math.hypot(v.x, v.z)
        const k = sp > 1e-3 ? clamp(sp * SLIDE.jumpBoost, SLIDE.jumpMin, SLIDE.jumpMax) / sp : 1
        v.x *= k
        v.z *= k
      }
    }
    if (this.slideT >= 0) this.endSlide(fromSlide)
    this.airMax = Math.max(M.runSpeed, Math.hypot(v.x, v.z))
    this.jumpCut = true
    this.setState(double ? 'doubleJump' : 'jump')
    this.ctx.bus.emit('player:jump', fromSlide ? { pos: v3(this.position), double, from: 'slide' } : { pos: v3(this.position), double })
  }

  private tryDash(): void {
    if (this.dashT > 0 || this.dashCd > 0 || this.rollT >= 0) return
    const air = !this._grounded
    if (air && !this.airDash) return
    this.dashBufT = 0
    if (this.slideT >= 0) this.endSlide(false)
    if (this.wallT >= 0) this.endWallRun(false)
    let dx = this.wishX
    let dz = this.wishZ
    if (this.wishMag === 0) {
      dx = Math.sin(this._yaw)
      dz = Math.cos(this._yaw)
    }
    this.dashX = dx
    this.dashZ = dz
    this.dashT = M.dashTime
    this.dashCd = M.dashTime + M.dashCooldown
    this.attackT = 0
    const v = this.velocity
    if (air) {
      this.airDash = false
      this.jumpCut = false
      v.y = Math.max(v.y * M.dashAirKeep, M.dashAirLift)
    }
    this._yaw = Math.atan2(dx, dz)
    this.setState('dash')
    this.ctx.bus.emit('player:dash', { pos: v3(this.position), dir: { x: dx, y: 0, z: dz } })
    this.ctx.cameraRig.kickFov(M.dashFovKick, 0.25)
  }

  private endDash(jumped: boolean): void {
    this.dashT = 0
    const v = this.velocity
    const exit = jumped ? M.dashJump : this.wishMag > 0 ? Math.max(this.wishSpeed, M.dashExit) : M.dashExitIdle
    v.x = this.dashX * exit
    v.z = this.dashZ * exit
    if (!this._grounded) this.airMax = Math.max(this.airMax, exit)
  }

  private tryAttack(): void {
    if (this.attackT > 0 || this.attackCd > 0 || this.dashT > 0 || this.rollT >= 0 || this.slideT >= 0 || this.wallT >= 0) return
    this.attackBufT = 0
    this.attackT = M.attackTime
    this.attackCd = M.attackTime + M.attackCooldown
    if (!this._grounded && !this.sliding && this.airSpin) {
      this.airSpin = false
      this.jumpCut = false
      this.velocity.y = Math.max(this.velocity.y, M.attackAirLift)
    }
    this.setState('attack')
    this.ctx.bus.emit('player:attack', { pos: v3(this.position) })
  }

  /** Vertical launch from a pad, a stomp or a rebound: re-arms the air moves. */
  private bounce(vy: number): void {
    const v = this.velocity
    this.leaveGround(false)
    v.y = this.vyMove = vy
    this.canDouble = this.airDash = this.airSpin = true
    this.wallsUsedN = 0
    this.jumpCut = false
    this.coyoteT = 0
    this.airTime = 0
    this._stompSpeed = 0
    this.airMax = Math.max(this.airMax, M.runSpeed, Math.hypot(v.x, v.z))
    this.setState('bounce')
  }

  /* ── roll, slide, wall-run ───────────────────────────────── */

  /** In the middle of a roll, where nothing can hurt. */
  private get rollSafe(): boolean {
    return this.rollT >= ROLL.invulnFrom && this.rollT < ROLL.invulnTo
  }

  /** Ends a roll, slide or wall-run in progress (a hit, a launch, a ragdoll, losing control). */
  private cancelMoves(): void {
    if (this.rollT >= 0) this.endRoll()
    if (this.slideT >= 0) this.endSlide(false)
    if (this.wallT >= 0) this.endWallRun(false)
  }

  /** Advances the roll, the slide and the wall-run, and ends each when its time or its footing runs out. */
  private tickMoves(dt: number): void {
    const v = this.velocity
    if (this.rollT >= 0) {
      this.rollT += dt
      if (this.rollT >= ROLL.time || !this._grounded) this.endRoll()
    }
    if (this.slideT >= 0) {
      this.slideT += dt
      const slow = this.slideT >= SLIDE.minTime && Math.hypot(v.x, v.z) < SLIDE.endSpeed
      const airborne = !this._grounded && this.coyoteT <= 0
      if (slow || airborne || this.sliding || this.depth > M.wadeMin) this.endSlide(false)
    }
    if (this.wallT >= 0) {
      this.wallT += dt
      const c = this.wall
      const away = (this.wishX * c.nx + this.wishZ * c.nz) * this.wishMag
      this.wallAwayT = away > 0.5 ? this.wallAwayT + dt : 0
      if (this.wallT >= W.time || this.wallAwayT > W.letGo) this.endWallRun(false)
    }
  }

  private tryRoll(): void {
    if (this.rollT >= 0 || this.rollCd > 0 || this.dashT > 0 || !this._grounded || this.depth > M.wadeMin) return
    this.rollBufT = 0
    let dx = this.wishX
    let dz = this.wishZ
    if (this.wishMag === 0) {
      dx = Math.sin(this._yaw)
      dz = Math.cos(this._yaw)
    }
    if (this.slideT >= 0) this.endSlide(false)
    this.rollX = dx
    this.rollZ = dz
    this.rollT = 0
    this.attackT = 0
    this.landT = 0
    this._yaw = Math.atan2(dx, dz)
    this.setState('roll')
    this.ctx.bus.emit('player:roll', { pos: v3(this.position), dir: { x: dx, y: 0, z: dz } })
  }

  /** Out of the roll at the speed it ends on; the stick takes over from there. */
  private endRoll(): void {
    this.rollT = -1
    this.rollCd = ROLL.cooldown
  }

  /** The low button: stands up out of a slide, else asks for one (remembered briefly: it can land into it). */
  private pressLow(): void {
    if (this.slideT > 0.2) {
      this.endSlide(false)
      this.lowBufT = 0
    } else this.lowBufT = SLIDE.buffer
  }

  private trySlide(): void {
    if (this.slideT >= 0 || this.slideCd > 0 || this.rollT >= 0 || this.dashT > 0 || this.attackT > 0) return
    if (!this._grounded || this.depth > M.wadeMin) return
    const v = this.velocity
    const sp = Math.hypot(v.x, v.z)
    if (sp < SLIDE.enterSpeed) return
    this.lowBufT = 0
    this.slideT = 0
    this.landT = 0
    // Dropping into it gives a little push (never past boostMax, never a loss).
    const k = Math.max(sp, Math.min(sp + SLIDE.boost, SLIDE.boostMax)) / sp
    v.x *= k
    v.z *= k
    this.setState('slide')
    this.ctx.bus.emit('player:slide', { pos: v3(this.position), dir: { x: v.x / (sp * k), y: 0, z: v.z / (sp * k) }, surface: this.surface() })
  }

  private endSlide(jumped: boolean): void {
    this.slideT = -1
    this.slideCd = SLIDE.cooldown
    this.ctx.bus.emit('player:slideEnd', { pos: v3(this.position), jumped })
  }

  /** The sprint slide: momentum carried along the ground. Slopes pull, the flat brakes, the stick nudges the heading. */
  private slideAlong(dt: number): void {
    const v = this.velocity
    const g = this.hit
    let sp = Math.hypot(v.x, v.z)
    if (sp < 1e-3) return
    let yaw = Math.atan2(v.x, v.z)
    let brake = SLIDE.friction * (g.surface === 'ice' ? M.iceGrip : 1)
    if (this.wishMag > 0) {
      const want = wrapAngle(Math.atan2(this.wishX, this.wishZ) - yaw)
      // Pulling back brakes; anything else turns the slide a little.
      if (Math.abs(want) > 2.2) brake += SLIDE.brake * this.wishMag
      else yaw += clamp(want, -1, 1) * SLIDE.steer * this.wishMag * dt
    }
    // Gravity along the slope (for a unit normal: g · ny · the normal's horizontal part).
    const pull = g.collider ? 0 : SLIDE.gravity * g.ny * dt
    v.x = Math.sin(yaw) * sp + g.nx * pull
    v.z = Math.cos(yaw) * sp + g.nz * pull
    sp = Math.hypot(v.x, v.z)
    if (sp < 1e-3) return
    const k = Math.min(Math.max(0, sp - brake * dt), SLIDE.maxSpeed) / sp
    v.x *= k
    v.z *= k
  }

  /** Airborne at speed and brushing a wall at a glancing angle: start running along it. */
  private tryWallRun(): void {
    if (this._grounded || this.sliding || this.dashT > 0 || this.wallCd > 0 || this.airTime < 0.06) return
    const v = this.velocity
    const p = this.position
    const sp = Math.hypot(v.x, v.z)
    if (sp < W.minSpeed || v.y < -W.maxFall) return
    const hx = v.x / sp
    const hz = v.z / sp
    const c = this.wallFound
    if (!this.sensor.find(p.x, p.y, p.z, hx, hz, c) || c.dist > M.radius + 0.3) return
    // Glancing, and meant: the heading or the stick leans into the wall.
    const into = -(hx * c.nx + hz * c.nz)
    const push = -(this.wishX * c.nx + this.wishZ * c.nz) * this.wishMag
    if (into > W.maxInto || into < -0.2 || Math.max(into, push) < 0.12) return
    const along = sp * Math.sqrt(Math.max(0, 1 - into * into))
    if (along < W.minSpeed * 0.9) return
    const used = this.wallsUsed
    for (let i = 0; i < this.wallsUsedN; i++) {
      if (c.nx * used[i * 2] + c.nz * used[i * 2 + 1] > W.sameWall) return
    }
    // Clear of the floor (a cliff's own foot under the feet doesn't count as one).
    const g = this.ctx.collision.groundAt(p.x, p.z, p.y, M.radius, M.airStepUp, this.probe)
    if ((g.collider || g.ny >= M.walkableNy) && p.y - g.y < W.minHeight) return
    this.startWallRun(c, hx, hz, along)
  }

  private startWallRun(c: WallContact, hx: number, hz: number, speed: number): void {
    const v = this.velocity
    // The way along the wall that keeps the heading; it also tells the side the wall is on.
    const side = -c.nz * hx + c.nx * hz >= 0 ? 1 : -1
    this.wallSide = side
    this.wallSpeed = clamp(speed, W.speed, W.maxSpeed)
    this.wallT = 0
    this.wallAwayT = 0
    this.setWall(c)
    const used = this.wallsUsed
    const slot = this.wallsUsedN < used.length / 2 ? this.wallsUsedN++ : 0
    used[slot * 2] = c.nx
    used[slot * 2 + 1] = c.nz
    // A slight arc: up a little, then back down. A fall is caught, not reversed.
    v.y = this.vyMove = v.y >= 0 ? W.rise : Math.max(W.rise + v.y * 0.5, -1.5)
    this.attackT = 0
    this.jumpCut = false
    this.stepPhase = 0.5
    this.setState('wallRun')
    this.ctx.bus.emit('player:wallRun', { pos: this.wallPoint(), normal: { x: c.nx, y: 0, z: c.nz }, side, surface: c.surface })
  }

  /** Takes `c` as the wall being run along: its normal and the direction along it. */
  private setWall(c: WallContact): void {
    const w = this.wall
    w.nx = this.wallNrm.x = c.nx
    w.nz = this.wallNrm.z = c.nz
    w.dist = c.dist
    w.lean = c.lean
    w.surface = c.surface
    this.wallTX = -c.nz * this.wallSide
    this.wallTZ = c.nx * this.wallSide
  }

  /** Where the feet meet the wall. */
  private wallPoint(): V3 {
    const p = this.position
    const c = this.wall
    return { x: p.x - c.nx * c.dist, y: p.y + 0.1, z: p.z - c.nz * c.dist }
  }

  /** Jump on a wall: kick off away from it, keeping part of the run's speed. */
  private wallJump(): void {
    const v = this.velocity
    const c = this.wall
    const keep = this.wallSpeed * W.kickKeep
    v.x = c.nx * W.kickOut + this.wallTX * keep
    v.z = c.nz * W.kickOut + this.wallTZ * keep
    v.y = this.vyMove = W.kickUp
    this.jumpBufT = 0
    this.endWallRun(true)
    this.jumpCut = true
    this.setState('jump')
    this.ctx.bus.emit('player:jump', { pos: v3(this.position), double: false, from: 'wall' })
  }

  private endWallRun(jumped: boolean): void {
    const v = this.velocity
    this.wallT = -1
    this.wallCd = W.cooldown
    this.wallSide = 0
    this.airMax = Math.max(M.runSpeed, Math.hypot(v.x, v.z))
    this.ctx.bus.emit('player:wallRunEnd', { pos: v3(this.position), jumped })
  }

  /** One sub-step of the wall-run: along the wall on its arc, held to it by the feelers. */
  private wallStep(h: number): void {
    const col = this.ctx.collision
    const p = this.position
    const v = this.velocity
    const y0 = p.y
    p.x += v.x * h
    p.z += v.z * h
    p.y += this.vyMove * h
    if (this.vyMove > 0) {
      const ceil = col.ceilingAt(p.x, p.z, y0 + M.height, M.radius)
      if (p.y + M.height > ceil) {
        p.y = Math.max(y0, ceil - M.height)
        v.y = this.vyMove = 0
      }
    }

    // Feel for the wall again: it may have ended, or turned a corner too sharp to follow.
    const c = this.wall
    const f = this.wallFound
    if (!this.sensor.feel(p.x, p.y, p.z, -c.nx, -c.nz, M.radius + W.reach + 0.15, f) || f.nx * c.nx + f.nz * c.nz < W.sameWall) {
      this.endWallRun(false)
      return
    }
    // Close (or open) the gap to it and take its new direction.
    const off = clamp(f.dist - (M.radius + W.gap), -0.25, 0.25)
    p.x -= f.nx * off
    p.z -= f.nz * off
    f.dist -= off
    this.setWall(f)
    v.x = this.wallTX * this.wallSpeed
    v.z = this.wallTZ * this.wallSpeed

    // Something solid in the way ends the run.
    const w = col.pushOut(p, M.radius, M.height, M.airStepUp, this.push)
    if (w.hit && w.nx * this.wallTX + w.nz * this.wallTZ < -0.5) {
      this.endWallRun(false)
      return
    }
    // So does the ground: floors are landed on; a cliff's foot is left to the steep-ground slide.
    const g = col.groundAt(p.x, p.z, p.y, M.radius, M.airStepUp, this.hit)
    if (p.y > g.y) return
    const floor = !!g.collider || g.ny >= M.walkableNy
    this.endWallRun(false)
    if (!floor) return
    p.y = g.y
    this.land(g, false)
  }

  /** Footfalls on the wall, at a run's cadence. */
  private wallSteps(dt: number): void {
    this.stepPhase += (this.wallSpeed * dt) / M.stepRun
    if (this.stepPhase < 1) return
    this.stepPhase -= Math.floor(this.stepPhase)
    this.ctx.bus.emit('player:footstep', { pos: this.wallPoint(), surface: this.wall.surface, sprint: true, wall: true })
  }

  /* ── velocity ────────────────────────────────────────────── */

  private steer(dt: number): void {
    const v = this.velocity
    if (this.dashT > 0) {
      v.x = this.dashX * M.dashSpeed
      v.z = this.dashZ * M.dashSpeed
      return
    }
    if (this.rollT >= 0) {
      // Fast out of the gate, easing down to a speed a run can pick up from.
      const speed = lerp(ROLL.speed, ROLL.endSpeed, smoothstep(0.25, 1, this.rollT / ROLL.time))
      v.x = this.rollX * speed
      v.z = this.rollZ * speed
      return
    }
    if (this.wallT >= 0) {
      v.x = this.wallTX * this.wallSpeed
      v.z = this.wallTZ * this.wallSpeed
      return
    }
    if (this.sliding) return this.slide(dt)
    if (this.slideT >= 0) return this.slideAlong(dt)
    const sp = Math.hypot(v.x, v.z)

    if (this._grounded) {
      // Ice: little grip — slow to get going, slow to stop, slides through turns.
      const grip = this.hit.surface === 'ice' ? M.iceGrip : 1
      if (this.wishMag > 0) {
        // Split velocity along / across the wish direction: accelerate along it, kill drift across it.
        const wx = this.wishX
        const wz = this.wishZ
        const par = v.x * wx + v.z * wz
        const px = v.x - wx * par
        const pz = v.z - wz * par
        const target = this.wishSpeed
        const rate = (par < 0 ? M.turnAccel : par < target ? M.accel : M.decel) * grip
        const npar = approach(par, target, rate * dt)
        const perp = Math.hypot(px, pz)
        const k = perp > 1e-6 ? approach(perp, 0, M.grip * grip * dt) / perp : 0
        v.x = wx * npar + px * k
        v.z = wz * npar + pz * k
      } else if (sp > 0) {
        const k = approach(sp, 0, M.decel * grip * dt) / sp
        v.x *= k
        v.z *= k
      }
      return
    }

    // Air: weaker control, speed capped at what we took off with (or run speed).
    if (this.wishMag > 0 && this.hurtT <= 0) {
      const a = M.accel * M.airControl * this.wishMag * dt
      v.x += this.wishX * a
      v.z += this.wishZ * a
      const limit = Math.min(this.airMax, Math.max(this.wishSpeed, sp))
      const ns = Math.hypot(v.x, v.z)
      if (ns > limit && ns > 1e-6) {
        v.x *= limit / ns
        v.z *= limit / ns
      }
    } else if (sp > 0) {
      const k = approach(sp, 0, M.airDrag * dt) / sp
      v.x *= k
      v.z *= k
    }
  }

  /** Sliding down ground too steep to stand on. */
  private slide(dt: number): void {
    const v = this.velocity
    const g = this.hit
    const hl = Math.hypot(g.nx, g.nz)
    if (hl < 1e-4) return
    const dx = g.nx / hl
    const dz = g.nz / hl
    const steep = clamp((M.walkableNy - g.ny) / 0.25, 0, 1)
    const a = M.slideAccel * (0.6 + steep) * dt
    v.x += dx * a
    v.z += dz * a
    if (this.wishMag > 0) {
      v.x += this.wishX * M.slideSteer * dt
      v.z += this.wishZ * M.slideSteer * dt
    }
    const sp = Math.hypot(v.x, v.z)
    if (sp > M.slideMax) {
      v.x *= M.slideMax / sp
      v.z *= M.slideMax / sp
    }
    // Follow the surface vertically so leaving it carries a sensible vy.
    v.y = -Math.max(0, v.x * dx + v.z * dz) * (hl / Math.max(0.2, g.ny))
  }

  private gravity(dt: number, jumpHeld: boolean): void {
    const v = this.velocity
    if (this._grounded || this.sliding) {
      this.vyMove = v.y
      return
    }
    if (this.wallT >= 0) {
      // The wall carries most of his weight: a gentle arc.
      const vy = v.y
      v.y -= W.gravity * dt
      this.vyMove = (vy + v.y) * 0.5
      return
    }
    if (this.jumpCut) {
      if (v.y <= 0) this.jumpCut = false
      else if (!jumpHeld) {
        v.y *= M.jumpCut
        this.jumpCut = false
      }
    }
    const vy0 = v.y
    let g = v.y > 0 ? M.gravityUp : M.gravityDown
    if (this.dashT > 0) g *= M.dashGravity
    else if (jumpHeld && Math.abs(v.y) < M.apexBand && (this._state === 'jump' || this._state === 'doubleJump')) g *= M.apexGravity
    v.y = Math.max(v.y - g * dt, -M.terminal)
    // Trapezoidal step: jump height and airtime come out the same at 30, 60 or 144 fps.
    this.vyMove = (vy0 + v.y) * 0.5
  }

  /* ── collision ───────────────────────────────────────────── */

  private subStep(h: number): void {
    const col = this.ctx.collision
    const p = this.position
    const v = this.velocity
    const x0 = p.x
    const y0 = p.y
    const z0 = p.z
    const onGround = this._grounded || this.sliding
    const stepUp = onGround ? M.stepUp : M.airStepUp

    // Horizontal move, then slide along walls.
    p.x += v.x * h
    p.z += v.z * h
    const w = col.pushOut(p, M.radius, M.height, stepUp, this.push)
    if (w.hit) {
      const into = v.x * w.nx + v.z * w.nz
      if (into < 0) {
        v.x -= w.nx * into
        v.z -= w.nz * into
      }
    }

    // Vertical move with head bumps.
    if (!onGround) {
      p.y += this.vyMove * h
      if (this.vyMove > 0) {
        const ceil = col.ceilingAt(p.x, p.z, y0 + M.height, M.radius)
        if (p.y + M.height > ceil) {
          p.y = Math.max(y0, ceil - M.height)
          v.y = this.vyMove = 0
          this.jumpCut = false
        }
      }
    }

    let g = col.groundAt(p.x, p.z, p.y, M.radius, stepUp, this.hit)

    // Ground too steep to stand on can't be climbed: drop the uphill part of this step.
    if (!g.collider && g.ny < M.walkableNy && (onGround || p.y < g.y + 0.1)) {
      const l = Math.hypot(g.nx, g.nz)
      if (l > 1e-4) {
        const ux = -g.nx / l
        const uz = -g.nz / l
        const along = (p.x - x0) * ux + (p.z - z0) * uz
        if (along > 0) {
          p.x -= ux * along
          p.z -= uz * along
          const vu = v.x * ux + v.z * uz
          if (vu > 0) {
            v.x -= ux * vu
            v.z -= uz * vu
          }
          g = col.groundAt(p.x, p.z, p.y, M.radius, stepUp, this.hit)
        }
      }
    }

    const steep = !g.collider && g.ny < (this.sliding ? M.slideExitNy : M.walkableNy)
    if (onGround) {
      if (p.y - g.y <= M.snapDown) {
        const drops = g.y < y0 - 0.02
        p.y = g.y
        this.steepT = steep && this._grounded ? this.steepT + h : 0
        if (steep && this._grounded && (drops || this.steepT > 0.25)) {
          // Walked down onto (or stood too long on) a slope too steep to stand on.
          this.coyoteT = M.coyote
          this._grounded = false
          this.sliding = true
          this.steepT = 0
          this.setSupport(null)
        } else if (!steep && this.sliding) {
          this.land(g, false)
        } else if (this._grounded && g.collider !== this.support) {
          this.setSupport(g.collider)
        }
      } else {
        // Walked off a ledge.
        const wasGrounded = this._grounded
        this.leaveGround(true)
        this.coyoteT = wasGrounded ? M.coyote : 0
      }
    } else if (p.y <= g.y) {
      p.y = g.y
      if (v.y <= 0) this.land(g, steep)
    }
  }

  private land(g: GroundHit, steep: boolean): void {
    // Touching down ends a flight.
    this._flying = false
    const v = this.velocity
    const c = g.collider
    const impact = Math.max(0, -v.y)
    const airborne = !this.sliding && this.airTime > 0.05
    c?.onLand?.(impact)
    if (c && c.bounce > 0) {
      this.bounce(c.bounce)
      this.ctx.bus.emit('player:bounce', { pos: v3(this.position) })
      return
    }
    this.landImpact = impact
    if (airborne || impact > 2.5) {
      this.ctx.bus.emit('player:land', { pos: v3(this.position), impact, surface: this.surface() })
    }
    if (airborne && impact > M.ragdollImpact && this.controlEnabled && !this.dead) {
      // Far too hard to land on your feet: the body carries the fall into the ground and goes down.
      this.ctx.character.startRagdoll({ x: Math.sin(this._yaw), y: 0, z: Math.cos(this._yaw) })
      if (this.ctx.character.ragdolling) {
        this.enterRagdoll()
        return
      }
    }
    this.airTime = 0
    if (steep) {
      this.sliding = true
      this._grounded = false
      this.setSupport(null)
      return
    }
    this.sliding = false
    this._grounded = true
    this.setSupport(c)
    v.y = 0
    this.canDouble = this.airDash = this.airSpin = true
    this.wallsUsedN = 0
    this.jumpCut = false
    this.stepPhase = 0.5
    if (impact > M.landStateImpact) {
      const moving = this.wishMag > 0.5
      this.landT = moving ? 0.1 : clamp(0.1 + impact * 0.008, 0.12, 0.26)
    }
  }

  /** Become airborne. `inherit` adds the support's velocity (walking/jumping off a mover). */
  private leaveGround(inherit: boolean): void {
    const v = this.velocity
    if (inherit && this.support?.dynamic) {
      v.x += this.platVX
      v.y += this.platVY
      v.z += this.platVZ
    }
    if (this._grounded || this.sliding) this.airTime = 0
    this._grounded = false
    this.sliding = false
    this.vyMove = v.y
    this.setSupport(null)
    this.airMax = Math.max(M.runSpeed, Math.hypot(v.x, v.z))
  }

  private setSupport(c: Collider | null): void {
    if (c === this.support) return
    this.support = c
    this.platVX = this.platVY = this.platVZ = 0
    if (c) this.markSupport(c)
  }

  private markSupport(c: Collider): void {
    this.supX = c.x
    this.supY = c.y
    this.supZ = c.z
    this.supYaw = c.yaw
  }

  /** Moves the hero with the (dynamic) collider under the feet by its real displacement since last frame. */
  private carry(dt: number): void {
    const c = this.support
    if (!this._grounded || !c) return
    if (!c.dynamic || !c.enabled) {
      if (!c.enabled) this.setSupport(null)
      return
    }
    const p = this.position
    const dx = c.x - this.supX
    const dy = c.y - this.supY
    const dz = c.z - this.supZ
    const da = wrapAngle(c.yaw - this.supYaw)
    p.x += dx
    p.y += dy
    p.z += dz
    if (da !== 0) {
      const cs = Math.cos(da)
      const sn = Math.sin(da)
      const ox = p.x - c.x
      const oz = p.z - c.z
      p.x = c.x + ox * cs + oz * sn
      p.z = c.z - ox * sn + oz * cs
      this._yaw = wrapAngle(this._yaw + da)
    }
    this.platVX = dx / dt
    this.platVY = dy / dt
    this.platVZ = dz / dt
    this.markSupport(c)
  }

  /** Soft invisible wall around the current map (the island: PLAY_RADIUS around its centre). */
  private keepInBounds(): void {
    const p = this.position
    const v = this.velocity
    const b = this.ctx.worlds?.bounds ?? ISLE_BOUNDS
    const dx = p.x - b.x
    const dz = p.z - b.z
    const r = Math.hypot(dx, dz)
    const inner = b.r - 4
    if (r <= inner) return
    const nx = dx / r
    const nz = dz / r
    const out = v.x * nx + v.z * nz
    if (out > 0) {
      const k = smoothstep(inner, b.r, r)
      v.x -= nx * out * k
      v.z -= nz * out * k
    }
    if (r > b.r) {
      p.x = b.x + nx * b.r
      p.z = b.z + nz * b.r
    }
  }

  /* ── ragdoll ─────────────────────────────────────────────── */

  private get limp(): boolean {
    return this._state === 'ragdoll'
  }

  /** R: go limp on purpose, keeping the momentum, with a shove forward and a little hop. */
  private flop(): boolean {
    const f = M.ragdollPush
    this.ctx.character.startRagdoll({ x: Math.sin(this._yaw) * f, y: M.ragdollHop, z: Math.cos(this._yaw) * f })
    if (!this.ctx.character.ragdolling) return false
    this.enterRagdoll()
    return true
  }

  /** The Character went limp (on our request or the game's): drop every move in progress. */
  private enterRagdoll(): void {
    this.resetMotion()
    this.setSupport(null)
    this.velocity.set(0, 0, 0)
    this.ragPlaced = false
    this.setState('ragdoll')
  }

  /**
   * While limp the capsule rides along with the body (the camera follows it) without colliding;
   * once the get-up starts it moves to the stand-up spot and waits there.
   */
  private ragdollTick(dt: number): void {
    const ch = this.ctx.character
    if (!this.limp) this.enterRagdoll()
    if (ch.ragdollRecovering) {
      if (!this.ragPlaced) {
        this.ragPlaced = true
        this.standUp()
      }
      this.velocity.set(0, 0, 0)
      return
    }
    this.ragPlaced = false
    const p = this.position
    const v = this.velocity
    const a = ch.getRagdollAnchor(this.anchor)
    if (!Number.isFinite(a.x + a.y + a.z)) return
    v.subVectors(a, p).divideScalar(dt)
    if (v.lengthSq() > M.terminal * M.terminal) v.setLength(M.terminal)
    p.copy(a)
    const g = this.ctx.collision.groundAt(p.x, p.z, p.y + 0.05, M.radius, M.airStepUp, this.hit)
    this._grounded = p.y - g.y < 0.05
    const prev = this.depth
    this.depth = g.water - p.y
    if (this.depth > M.splashDepth && prev <= M.splashDepth) {
      this.ctx.bus.emit('player:splash', { pos: { x: p.x, y: g.water, z: p.z }, big: v.y < -6 })
    }
    // Floating in water too deep to stand up in: drowned, as on foot.
    this.drownT = g.water - g.y > M.drownDepth && this.depth > 0 ? this.drownT + dt : 0
    if (this.drownT > 0.5 && !this.dead && this.ctx.game.phase === 'playing') {
      this.dead = true
      this.ctx.game.playerDied('water')
    }
  }

  /** Puts the capsule where the body stands up, facing the way it rises, clear of solids. */
  private standUp(): void {
    const ch = this.ctx.character
    const p = ch.getRagdollAnchor(this.position)
    this.velocity.set(0, 0, 0)
    this._yaw = wrapAngle(ch.root.rotation.y)
    for (let i = 0; i < 2; i++) this.ctx.collision.pushOut(p, M.radius, M.height, M.stepUp, this.push)
    this.settle()
    this.resetMotion()
  }

  /** On his feet again (or the ragdoll was dropped): back to normal control. */
  private endRagdoll(): void {
    if (!this.ragPlaced) this.standUp()
    this.ragPlaced = false
    this.setState('idle')
  }

  /* ── water, facing, feedback ─────────────────────────────── */

  private water(dt: number): void {
    const p = this.position
    const v = this.velocity
    const level = this.hit.water
    const prev = this.depth
    const d = level - p.y
    this.depth = d
    if (d > 0.5) {
      // Water drags you; drowning sinks slowly while the screen fades.
      const k = Math.exp(-3 * dt)
      v.x *= k
      v.z *= k
      if (v.y < -2.5) v.y = -2.5
    }
    if (this.dead) return
    if (d > M.drownDepth) {
      if (this.ctx.game.phase !== 'playing') return
      this.ctx.bus.emit('player:splash', { pos: { x: p.x, y: level, z: p.z }, big: true })
      this.dead = true
      this.attackT = this.dashT = 0
      this.cancelMoves()
      this.setState('dead')
      this.ctx.game.playerDied('water')
      return
    }
    if (d > M.splashDepth && prev <= M.splashDepth) {
      this.ctx.bus.emit('player:splash', { pos: { x: p.x, y: level, z: p.z }, big: false })
    }
    const speed = Math.hypot(v.x, v.z)
    if (d > M.wadeMin && this._grounded && speed > 0.6) {
      this.wadeT -= dt
      if (this.wadeT <= 0) {
        this.wadeT = M.wadeInterval
        this.ctx.bus.emit('player:wade', { pos: { x: p.x, y: level, z: p.z } })
      }
    } else {
      this.wadeT = Math.min(this.wadeT, 0.15)
    }
  }

  /** Turns the facing smoothly toward where we're going. */
  private face(dt: number): void {
    const v = this.velocity
    const aim = this.ctx.weapons.aimYaw
    let target: number
    if (this.dashT > 0) target = Math.atan2(this.dashX, this.dashZ)
    else if (this.rollT >= 0) target = Math.atan2(this.rollX, this.rollZ)
    else if (this.wallT >= 0) target = Math.atan2(this.wallTX, this.wallTZ)
    else if (this.dead || this.hurtT > 0) return
    else if (this.sliding || this.slideT >= 0) {
      if (Math.hypot(v.x, v.z) < 1.5) return
      target = Math.atan2(v.x, v.z)
    } else if (aim !== null) target = aim
    else if (this.wishMag > 0) target = Math.atan2(this.wishX, this.wishZ)
    else return
    const diff = wrapAngle(target - this._yaw)
    const air = !this._grounded && this.wallT < 0
    const k = 1 - Math.exp(-M.turnSharp * (air ? M.airTurnScale : 1) * dt)
    const max = M.turnRate * (air ? M.airTurnScale : 1) * dt
    this._yaw = wrapAngle(this._yaw + clamp(diff * k, -max, max))
  }

  /** Ground slope along the facing (-1..1, + = uphill), smoothed. */
  private updateSlope(dt: number): void {
    let target = 0
    if (this._grounded || this.sliding) {
      const g = this.hit
      const rise = -(g.nx * Math.sin(this._yaw) + g.nz * Math.cos(this._yaw)) / Math.max(0.05, g.ny)
      target = rise / Math.sqrt(1 + rise * rise)
    }
    this.slope = damp(this.slope, target, 10, dt)
  }

  private surface(): Surface {
    return this.depth > 0.1 ? 'water' : this.hit.surface
  }

  /** One footstep event per stride, with the same stride lengths the animator uses. */
  private footsteps(dt: number): void {
    if (this.wallT >= 0) return this.wallSteps(dt)
    const v = this.velocity
    const sp = Math.hypot(v.x, v.z)
    if (!this._grounded || this.dashT > 0 || this.rollT >= 0 || this.slideT >= 0 || sp < 0.5) {
      if (this._grounded) this.stepPhase = 0.5
      return
    }
    let len: number
    if (sp <= M.walkSpeed) len = lerp(M.stepMin, M.stepWalk, sp / M.walkSpeed)
    else if (sp <= M.runSpeed) len = lerp(M.stepWalk, M.stepRun, (sp - M.walkSpeed) / (M.runSpeed - M.walkSpeed))
    else len = lerp(M.stepRun, M.stepSprint, clamp((sp - M.runSpeed) / (M.sprintSpeed - M.runSpeed), 0, 1))
    if (this.depth > 0) {
      // Same wade weight as the animator's high-kneed wading stride.
      const w = Math.max(clamp((this.depth / M.wadeMax) * 1.4, 0, 1), this._state === 'wade' ? 0.8 : 0)
      len *= 1 - M.stepWadeShorten * w
    }
    this.stepPhase += (sp * dt) / len
    if (this.stepPhase < 1) return
    this.stepPhase -= Math.floor(this.stepPhase)
    this.ctx.bus.emit('player:footstep', {
      pos: v3(this.position),
      surface: this.surface(),
      sprint: sp > (M.runSpeed + M.sprintSpeed) * 0.5,
    })
  }

  private resolveState(): void {
    const v = this.velocity
    const cur = this._state
    let next: PlayerState
    if (this.dead) next = 'dead'
    else if (this.hurtT > 0) next = 'hurt'
    else if (this.dashT > 0) next = 'dash'
    else if (this.rollT >= 0) next = 'roll'
    else if (this.wallT >= 0) next = 'wallRun'
    else if (this.slideT >= 0) next = 'slide'
    else if (this.attackT > 0) next = 'attack'
    else if (this.sliding) next = 'fall'
    else if (this._flying) next = v.y < M.fallAfterVy ? 'fall' : 'jump'
    else if (!this._grounded) {
      if (cur === 'jump' || cur === 'bounce') next = v.y < M.fallAfterVy ? 'fall' : cur
      else if (cur === 'doubleJump') next = v.y < M.fallAfterVy && this.stateTime > 0.45 ? 'fall' : cur
      else if (GROUND_STATES.has(cur) && this.airTime <= M.fallDelay && v.y > -4) next = cur
      else next = 'fall'
    } else if (this.landT > 0) next = 'land'
    else {
      // Hysteresis + a short debounce keep the pose steady while pushing into a wall or creeping along it.
      const moving = cur === 'move' || cur === 'wade'
      const sp = Math.hypot(v.x, v.z)
      next = sp > (moving ? 0.15 : 0.4) ? (this.depth > M.wadeMin ? 'wade' : 'move') : this.ctx.game.phase === 'cutscene' ? 'cutscene' : 'idle'
      if (next !== cur && GROUND_STATES.has(cur) && cur !== 'land' && this.stateTime < 0.12) next = cur
    }
    this.setState(next)
  }

  private setBlink(on: boolean): void {
    if (on === this.blinking) return
    this.blinking = on
    this.ctx.character?.setBlink(on)
  }

  private setState(s: PlayerState): void {
    if (s === this._state) return
    this._state = s
    this.stateTime = 0
  }

  private writeMotion(): void {
    const m = this.motion
    const v = this.velocity
    m.state = this._state
    m.stateTime = this.stateTime
    // A limp body isn't walking (and shouldn't widen the camera's sprint FOV).
    m.speed = this._state === 'ragdoll' ? 0 : Math.hypot(v.x, v.z)
    m.vy = v.y
    m.grounded = this._grounded
    m.turnRate = this.turnRate
    m.landImpact = this.landImpact
    m.wading = clamp(this.depth / M.wadeMax, 0, 1)
    m.slope = this.slope
    m.wallSide = this.wallSide
  }
}
