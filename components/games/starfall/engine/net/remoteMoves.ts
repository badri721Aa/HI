/**
 * Another player's moves, played on their avatar. Each announced move (protocol ACTIONS) starts
 * the same weapon clip their own Animator plays, with the same timing as Weapons, skipped ahead
 * by how old the news is; the effects match too — swing arcs, the slam's shockwave and debris,
 * the bow string pulled back and a cosmetic arrow, the fist spin's trail, the dash's afterimage —
 * and the sounds play where it happens ('net:action'). Allocation-free per frame.
 */
import * as THREE from 'three'
import type { GroundHit } from '../collision'
import type { NetFxAction, V3 } from '../events'
import type { Arrows } from '../gameplay/weapons/Arrows'
import { BOW, FROST_HAMMER, HAMMER, KIND, SWORD } from '../gameplay/weapons/defs'
import type { HeldWeapon, WeaponModel } from '../gameplay/weapons/models'
import { ARC_FROM, ARC_TO, SWING_ARC, SwingTrail } from '../gameplay/weapons/swing'
import { MOVE } from '../player/control/tuning'
import type { Ctx, WeaponId, WeaponMove, WeaponPose } from '../types'
import type { ActionMsg } from './protocol'
import type { RemotePeer } from './RemotePeer'

/**
 * A swing, slam, spin or dash heard of this late (s) is over: dropped (a draw or a shot still shows).
 * Younger news plays from where the move is by now, at most MAX_SKIP in.
 */
const STALE = 1.2
const MAX_SKIP = 0.3
/** A draw the state stream hasn't confirmed for this long (s) was called off. */
const DRAW_LOST = 0.5
const SLASHES: readonly WeaponMove[] = ['slash1', 'slash2', 'slash3']
const SPIN_COLOR = 0xfff1cf
/** Afterimage heights on the body (m), as the hero's own (fx/playerFx). */
const GHOST_HEIGHTS = [0.4, 0.9, 1.35]

/** What the moves need of the avatar. */
export interface MoveBody {
  /** Rendered feet position and heading. */
  readonly root: THREE.Object3D
  /** Right palm (the spin's trail), if rigged. */
  readonly palm: THREE.Object3D | null
  /** The copy of `id` in hand, if one was made. */
  heldModel(id: WeaponId): WeaponModel | null
}

export class RemoteMoves {
  /** The weapon layer for the avatar's Animator. */
  readonly pose: WeaponPose = { weapon: 'fists', move: 'none', t: 0, charge: 0 }
  /** Seconds into the fist spin, or -1. */
  spinT = -1
  private moveTime = 1
  private struck = false
  private noDraw = 0
  private dashT = -1
  private swing: SwingTrail
  private spinTrail: SwingTrail
  private ghostLive = false
  private readonly ghost = new THREE.Vector3()
  private readonly a = new THREE.Vector3()
  private readonly b = new THREE.Vector3()
  private readonly hit = {} as GroundHit

  constructor(
    private ctx: Ctx,
    /** Shared cosmetic arrows (made on first use). */
    private arrows: () => Arrows,
  ) {
    this.swing = new SwingTrail(ctx.fx)
    this.spinTrail = new SwingTrail(ctx.fx)
  }

  /** A move started `age` seconds ago on their screen. */
  start(m: ActionMsg, age: number, body: MoveBody): void {
    if (age > STALE && m.action !== 'draw' && m.action !== 'release') return
    const skip = Math.min(age, MAX_SKIP)
    const pose = this.pose
    const pos = body.root.position
    switch (m.action) {
      case 'slash':
      case 'slam':
        pose.weapon = m.weapon
        pose.move = m.action === 'slam' ? 'slam' : SLASHES[m.combo]
        this.moveTime = m.action === 'slam' ? HAMMER.time : SWORD.time[m.combo]
        pose.t = Math.min(1, skip / this.moveTime)
        this.struck = false
        this.swing.stop()
        this.emit('swing', m.weapon, pos, m.combo)
        break
      case 'draw':
        pose.weapon = m.weapon
        pose.move = 'draw'
        pose.charge = Math.min(1, skip / BOW.fullDraw)
        this.noDraw = 0
        this.emit('draw', m.weapon, pos)
        break
      case 'release':
        pose.weapon = m.weapon
        pose.move = 'release'
        pose.charge = 0
        this.moveTime = BOW.releaseTime
        pose.t = Math.min(1, skip / this.moveTime)
        this.a.set(m.x, m.y, m.z)
        this.b.set(m.vx, m.vy, m.vz)
        if (this.b.lengthSq() > 1) this.arrows().fire(this.a, this.b, 0, m.charge)
        this.emit('fire', m.weapon, this.a, 0, m.charge)
        break
      case 'spin':
        this.spinT = skip
        this.spinTrail.stop()
        this.emit('spin', m.weapon, pos)
        break
      case 'dash':
        this.dashT = skip
        this.ghostLive = false
        this.emit('dash', m.weapon, pos, 0, 0, this.a.set(m.vx, 0, m.vz))
        break
    }
  }

  /** Advances the moves and their effects; call after the avatar's root was placed. */
  update(dt: number, peer: RemotePeer, body: MoveBody): void {
    const pose = this.pose
    if (pose.move === 'draw') this.updateDraw(dt, peer)
    else if (pose.move === 'none') {
      // The draw announcement got lost, but the state stream shows the string coming back.
      if (peer.draw >= 0 && KIND[peer.weapon] === 'bow') {
        pose.weapon = peer.weapon
        pose.move = 'draw'
        pose.charge = peer.draw
        this.noDraw = 0
      }
    } else {
      pose.t += dt / this.moveTime
      if (pose.move === 'slam' && !this.struck && pose.t >= HAMMER.hitAt) {
        this.struck = true
        this.slam(body.root, pose.weapon)
      }
      if (pose.t >= 1) {
        pose.move = 'none'
        pose.t = 0
      }
    }

    // Swing arc.
    const arc = pose.weapon === 'fists' ? null : SWING_ARC[pose.weapon as HeldWeapon]
    const melee = pose.move !== 'none' && pose.move !== 'draw' && pose.move !== 'release'
    const model = arc && melee && pose.t >= ARC_FROM && pose.t <= ARC_TO ? body.heldModel(pose.weapon) : null
    if (arc && model) this.swing.weapon(model.group, arc)
    else this.swing.stop()

    // The bow string follows the draw.
    const bow = KIND[pose.weapon] === 'bow' ? body.heldModel(pose.weapon) : null
    if (bow) {
      const drawing = pose.move === 'draw'
      const c = pose.charge
      bow.setDraw?.(drawing ? c * c * (3 - 2 * c) : 0)
      if (bow.arrow) bow.arrow.visible = drawing
    }

    this.updateSpin(dt, body)
    this.updateDash(dt, peer, body)
  }

  private updateDraw(dt: number, peer: RemotePeer): void {
    const pose = this.pose
    if (peer.draw >= 0) {
      pose.charge = peer.draw
      this.noDraw = 0
      return
    }
    pose.charge = Math.min(1, pose.charge + dt / BOW.fullDraw)
    this.noDraw += dt
    if (this.noDraw > DRAW_LOST) {
      pose.move = 'none'
      pose.charge = 0
    }
  }

  /** The fist spin: the avatar's state is held at 'attack' by the caller; the hand leaves a ring of light. */
  private updateSpin(dt: number, body: MoveBody): void {
    if (this.spinT < 0) return
    this.spinT += dt
    if (this.spinT >= MOVE.attackTime) {
      this.spinT = -1
      this.spinTrail.stop()
    } else if (this.spinT > 0.04 && this.spinT < MOVE.attackTime * 0.85 && body.palm) this.spinTrail.point(body.palm, SPIN_COLOR)
  }

  /** The dash leaves glowing afterimages along the path it covers. */
  private updateDash(dt: number, peer: RemotePeer, body: MoveBody): void {
    const pos = body.root.position
    if (this.dashT >= 0) {
      this.dashT += dt
      if (this.dashT > MOVE.dashTime + 0.05) this.dashT = -1
    }
    if (this.dashT < 0 && peer.state !== 'dash') {
      this.ghostLive = false
      return
    }
    if (this.ghostLive) {
      for (let k = 0; k < GHOST_HEIGHTS.length; k++) {
        const h = GHOST_HEIGHTS[k]
        this.a.set(this.ghost.x, this.ghost.y + h, this.ghost.z)
        this.b.set(pos.x, pos.y + h, pos.z)
        this.ctx.fx.trail('ghost', this.a, this.b)
      }
    }
    this.ghost.copy(pos)
    this.ghostLive = true
  }

  /** The hammer comes down in front of them: shockwave, debris and the thud. */
  private slam(root: THREE.Object3D, weapon: WeaponId): void {
    const reach = weapon === 'frostHammer' ? FROST_HAMMER.reach : HAMMER.reach
    const yaw = root.rotation.y
    const p = root.position
    const x = p.x + Math.sin(yaw) * reach
    const z = p.z + Math.cos(yaw) * reach
    const y = this.ctx.collision.groundAt(x, z, p.y + 0.6, 0.2, 0.45, this.hit).y
    this.emit('slam', weapon, this.a.set(x, y, z))
  }

  private emit(action: NetFxAction, weapon: WeaponId, p: V3, combo = 0, charge = 0, dir?: V3): void {
    const pos = { x: p.x, y: p.y, z: p.z }
    this.ctx.bus.emit('net:action', dir ? { action, weapon, pos, combo, charge, dir: { x: dir.x, y: dir.y, z: dir.z } } : { action, weapon, pos, combo, charge })
  }

  /** Drops whatever was playing (the avatar went limp or vanished). */
  reset(): void {
    this.pose.move = 'none'
    this.pose.t = this.pose.charge = 0
    this.spinT = this.dashT = -1
    this.swing.stop()
    this.spinTrail.stop()
    this.ghostLive = false
  }
}
