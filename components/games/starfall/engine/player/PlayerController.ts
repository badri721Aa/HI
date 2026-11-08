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
import { MOVE as M } from './control/tuning'

const GROUND_STATES: ReadonlySet<PlayerState> = new Set<PlayerState>(['idle', 'move', 'wade', 'land', 'cutscene'])

export class PlayerController implements IPlayerController {
  readonly position = new THREE.Vector3()
  readonly velocity = new THREE.Vector3()
  readonly radius = M.radius
  readonly height = M.height
  readonly maxHp = M.maxHp
  controlEnabled = true

  readonly motion: MotionState = {
    state: 'idle', stateTime: 0, speed: 0,
    walkSpeed: M.walkSpeed, runSpeed: M.runSpeed, sprintSpeed: M.sprintSpeed,
    vy: 0, grounded: true, turnRate: 0, landImpact: 0, wading: 0, slope: 0,
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
  /** Measured velocity of the support (inherited when leaving it). */
  private platVX = 0
  private platVY = 0
  private platVZ = 0

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

  private hurtT = 0
  private invulnT = 0
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

  private failed = false

  constructor(private ctx: Ctx) {}

  /* ── IPlayerController getters ───────────────────────────── */

  get yaw(): number {
    return this._yaw
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
    return this.invulnT > 0
  }
  get attacking(): boolean {
    return this.attackT > 0
  }
  get stompSpeed(): number {
    return this._stompSpeed
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
    this.position.set(x, y, z)
    this.velocity.set(0, 0, 0)
    this._yaw = wrapAngle(yaw)
    this.dead = false
    this.ragPlaced = false
    this.resetMotion()
    if (this.invulnT > 0) {
      this.invulnT = 0
      this.ctx.character?.setBlink(false)
    }
    this.settle()
    this._state = 'idle'
    this.stateTime = 0
    this.writeMotion()
  }

  /** Clears every move in progress (jumps, dashes, attacks, landings, slides). */
  private resetMotion(): void {
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
    if (!(amount > 0) || this.invulnT > 0 || this.dashT > 0 || this.dead || !this.controlEnabled) return
    const p = this.position
    const v = this.velocity
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
    if (this._hp > 0) this.ctx.character.setBlink(true)
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
    this.bounce(vy)
    this.writeMotion()
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
    this.landT -= dt
    if (this.hurtT > 0) this.hurtT -= dt
    if (this.attackT > 0) this.attackT -= dt
    if (this.invulnT > 0) {
      this.invulnT -= dt
      if (this.invulnT <= 0) ctx.character.setBlink(false)
    }
    if (!this._grounded && !this.sliding) this.airTime += dt

    if (ctx.character.ragdolling) {
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
    this.readInput(live, dt)

    // Ride whatever we stand on before anything else moves us.
    this.carry(dt)
    const yawBefore = this._yaw

    if (this.dashT > 0) {
      this.dashT -= dt
      if (this.dashT <= 0) this.endDash(false)
    }

    if (live) {
      if (s.jump) this.pressJump()
      if (s.dash) this.dashBufT = M.actionBuffer
      if (s.attack) this.attackBufT = M.actionBuffer
    } else {
      this.jumpBufT = this.dashBufT = this.attackBufT = 0
    }
    if (this.jumpBufT > 0 && (this._grounded || this.coyoteT > 0)) this.jump(false)
    if (this.dashBufT > 0) this.tryDash()
    if (this.attackBufT > 0) this.tryAttack()

    this.steer(dt)
    this.gravity(dt, live && s.jumpHeld)

    // Integrate in sub-steps short enough that nothing tunnels.
    const travel = Math.max(Math.hypot(v.x, v.z), Math.abs(v.y)) * dt
    const n = Math.min(24, Math.max(1, Math.ceil(travel / M.maxSubstep)))
    const h = dt / n
    for (let i = 0; i < n && !this.limp; i++) this.subStep(h)
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
    // Walking uphill costs a little speed (feels weighty, and reads on the steep paths).
    if (this._grounded && !this.hit.collider) {
      const g = this.hit
      const rise = -(g.nx * this.wishX + g.nz * this.wishZ) / Math.max(0.2, g.ny)
      speed *= 1 - M.uphillSlow * smoothstep(0.15, 0.9, rise)
    }
    this.wishSpeed = speed
  }

  /* ── abilities ───────────────────────────────────────────── */

  private pressJump(): void {
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
      v.y = M.jumpSpeed + lift
    }
    this.airMax = Math.max(M.runSpeed, Math.hypot(v.x, v.z))
    this.jumpCut = true
    this.setState(double ? 'doubleJump' : 'jump')
    this.ctx.bus.emit('player:jump', { pos: v3(this.position), double })
  }

  private tryDash(): void {
    if (this.dashT > 0 || this.dashCd > 0) return
    const air = !this._grounded
    if (air && !this.airDash) return
    this.dashBufT = 0
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
    if (this.attackT > 0 || this.attackCd > 0 || this.dashT > 0) return
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
    this.jumpCut = false
    this.coyoteT = 0
    this.airTime = 0
    this._stompSpeed = 0
    this.airMax = Math.max(this.airMax, M.runSpeed, Math.hypot(v.x, v.z))
    this.setState('bounce')
  }

  /* ── velocity ────────────────────────────────────────────── */

  private steer(dt: number): void {
    const v = this.velocity
    if (this.dashT > 0) {
      v.x = this.dashX * M.dashSpeed
      v.z = this.dashZ * M.dashSpeed
      return
    }
    if (this.sliding) return this.slide(dt)
    const sp = Math.hypot(v.x, v.z)

    if (this._grounded) {
      if (this.wishMag > 0) {
        // Split velocity along / across the wish direction: accelerate along it, kill drift across it.
        const wx = this.wishX
        const wz = this.wishZ
        const par = v.x * wx + v.z * wz
        const px = v.x - wx * par
        const pz = v.z - wz * par
        const target = this.wishSpeed
        const rate = par < 0 ? M.turnAccel : par < target ? M.accel : M.decel
        const npar = approach(par, target, rate * dt)
        const perp = Math.hypot(px, pz)
        const k = perp > 1e-6 ? approach(perp, 0, M.grip * dt) / perp : 0
        v.x = wx * npar + px * k
        v.z = wz * npar + pz * k
      } else if (sp > 0) {
        const k = approach(sp, 0, M.decel * dt) / sp
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

  /** Soft invisible wall at PLAY_RADIUS. */
  private keepInBounds(): void {
    const p = this.position
    const v = this.velocity
    const r = Math.hypot(p.x, p.z)
    const inner = PLAY_RADIUS - 4
    if (r <= inner) return
    const nx = p.x / r
    const nz = p.z / r
    const out = v.x * nx + v.z * nz
    if (out > 0) {
      const k = smoothstep(inner, PLAY_RADIUS, r)
      v.x -= nx * out * k
      v.z -= nz * out * k
    }
    if (r > PLAY_RADIUS) {
      p.x = nx * PLAY_RADIUS
      p.z = nz * PLAY_RADIUS
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
    let target: number
    if (this.dashT > 0) target = Math.atan2(this.dashX, this.dashZ)
    else if (this.dead || this.hurtT > 0) return
    else if (this.sliding) {
      if (Math.hypot(v.x, v.z) < 1.5) return
      target = Math.atan2(v.x, v.z)
    } else if (this.wishMag > 0) target = Math.atan2(this.wishX, this.wishZ)
    else return
    const diff = wrapAngle(target - this._yaw)
    const air = !this._grounded
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
    const v = this.velocity
    const sp = Math.hypot(v.x, v.z)
    if (!this._grounded || this.dashT > 0 || sp < 0.5) {
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
    else if (this.attackT > 0) next = 'attack'
    else if (this.sliding) next = 'fall'
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
  }
}
