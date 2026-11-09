/**
 * Weapons — the sword, hammer and bow.
 *
 *   stands   each weapon waits on a stand in the world; walk into it or press E nearby to take it
 *   hand     the equipped weapon rides in the hero's hand grip (bow in the left), so it follows the
 *            animation and the ragdoll
 *   hotbar   keys 1–4, the mouse wheel or the d-pad switch between owned weapons
 *   moves    sword: three-slash combo · hammer: wind-up and overhead slam with a shockwave ·
 *            bow: hold to draw, release to shoot toward the camera's aim point
 *   hits     damage by weapon, knockback, ~60 ms hit-stop and a little shake; impact sparks,
 *            sounds and damage numbers react to 'enemy:hit' on the bus
 *
 * The animator reads `pose`; the controller reads `moveScale` and `aimYaw`.
 */
import * as THREE from 'three'
import { v3, type WeaponId } from '../events'
import type { Ctx, IWeapons, WeaponHit, WeaponMove, WeaponPose } from '../types'
import { WEAPON_STANDS } from '../world/level'
import { Arrows } from './weapons/Arrows'
import { ARROW, BOW, HAMMER, HOTBAR, SWORD, WEAPON_NAMES } from './weapons/defs'
import { WeaponKit, type HeldWeapon, type WeaponModel } from './weapons/models'
import { standMaterials, standShape } from './weapons/stands'
import { glowTexture } from './parts/util'

/** Take a weapon by walking into its stand, or with E from this close (m). */
const TOUCH_RADIUS = 1.0
const PROMPT_RADIUS = 2.4
/** Melee moves turn toward the nearest gloomling within this range (m). */
const LOCK_RANGE = 3.6
const HIT_STOP = 0.06

const NEXT_SLASH: Partial<Record<WeaponMove, WeaponMove>> = { slash1: 'slash2', slash2: 'slash3' }

interface Stand {
  weapon: HeldWeapon
  x: number
  y: number
  z: number
  /** Height of the weapon's middle (prompt / glow). */
  midY: number
  model: WeaponModel
  base: THREE.Mesh
  glow: THREE.Sprite
  taken: boolean
}

export class Weapons implements IWeapons {
  readonly pose: WeaponPose = { weapon: 'fists', move: 'none', t: 0, charge: 0 }

  private _owned: WeaponId[] = ['fists']
  private _equipped: WeaponId = 'fists'
  private _aimYaw: number | null = null
  private kit: WeaponKit | null = null
  private held = new Map<HeldWeapon, WeaponModel>()
  private stands: Stand[] = []
  private glowMat: THREE.SpriteMaterial | null = null
  private arrows: Arrows | null = null
  private colliders: Array<{ dispose(): void }> = []
  private owned3D: Array<{ dispose(): void }> = []
  private prompted: Stand | null = null

  // move state
  private move: WeaponMove = 'none'
  /** Progress through the move, 0..1. */
  private moveT = 0
  private moveTime = 1
  private combo = 0
  private queued = false
  private struck = false
  private charge = 0
  private rest = 0

  // scratch
  private readonly v = new THREE.Vector3()
  private readonly w = new THREE.Vector3()
  private readonly blow: WeaponHit = {
    weapon: 'sword', center: { x: 0, y: 0, z: 0 }, radius: 1, damage: 0, knock: 0, lift: 0, from: { x: 0, y: 0, z: 0 },
  }

  constructor(private ctx: Ctx) {}

  get owned(): readonly WeaponId[] {
    return this._owned
  }

  get equipped(): WeaponId {
    return this._equipped
  }

  get armed(): boolean {
    return this._equipped !== 'fists'
  }

  get aimYaw(): number | null {
    return this._aimYaw
  }

  get moveScale(): number {
    switch (this.move) {
      case 'none':
        return 1
      case 'slam':
        return HAMMER.moveScale
      case 'draw':
        return BOW.drawScale
      case 'release':
        return BOW.releaseScale
      default:
        return SWORD.moveScale
    }
  }

  /* ── lifecycle ───────────────────────────────────────────── */

  init(): void {
    const ctx = this.ctx
    const kit = (this.kit = new WeaponKit(ctx.textures))
    for (const id of ['sword', 'hammer', 'bow'] as const) {
      const m = kit.make(id)
      m.group.visible = false
      ctx.character.holdInHand(id === 'bow' ? 'left' : 'right', m.group)
      this.held.set(id, m)
    }

    const mats = standMaterials(ctx.textures)
    this.owned3D.push(mats.stone, mats.wood, ...mats.maps)
    const glow = glowTexture(ctx)
    if (glow.owned) this.owned3D.push(glow.texture)
    const glowMat = (this.glowMat = new THREE.SpriteMaterial({
      map: glow.texture, color: 0xffc56b, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5,
    }))
    this.owned3D.push(glowMat)
    for (const def of WEAPON_STANDS) {
      const shape = standShape(def.weapon)
      const y = ctx.collision.groundAt(def.x, def.z, 999, 0.3).y
      const [mat, geo] = shape.parts[0]
      this.owned3D.push(geo)
      const base = new THREE.Mesh(geo, mat === 'stone' ? mats.stone : mats.wood)
      base.position.set(def.x, y, def.z)
      base.rotation.y = def.yaw
      base.castShadow = base.receiveShadow = true
      const model = kit.make(def.weapon)
      model.group.position.y = shape.weapon.y
      model.group.rotation.set(shape.weapon.rx, 0, shape.weapon.rz)
      base.add(model.group)
      const midY = y + shape.weapon.y + (def.weapon === 'bow' ? 0 : -0.3)
      const sprite = new THREE.Sprite(glowMat)
      sprite.position.set(def.x, midY, def.z)
      sprite.scale.setScalar(1.7)
      ctx.scene.add(base, sprite)
      const c = shape.collider
      const col = c.r > 0
        ? ctx.collision.addCylinder({ x: def.x, y, z: def.z, r: c.r, h: c.h, surface: 'rock' })
        : ctx.collision.addBox({ x: def.x, y: y + c.h / 2, z: def.z, hx: c.hx, hy: c.h / 2, hz: c.hz, yaw: def.yaw, surface: 'wood' })
      this.colliders.push({ dispose: () => ctx.collision.remove(col) })
      this.stands.push({ weapon: def.weapon, x: def.x, y, z: def.z, midY, model, base, glow: sprite, taken: false })
    }

    this.arrows = new Arrows(ctx, kit.arrowGeometry, kit.arrowMaterial)
    ctx.scene.add(this.arrows.mesh)
    this.syncWithSave()
  }

  syncWithSave(): void {
    const save = this.ctx.game.save
    this._owned = HOTBAR.filter(w => w === 'fists' || save.weapons.includes(w))
    for (const st of this.stands) {
      st.taken = this._owned.includes(st.weapon)
      st.base.children.forEach(c => (c.visible = !st.taken))
      st.glow.visible = !st.taken
    }
    this.cancelMove()
    this.arrows?.clear()
    this.setEquipped(this._owned.includes(save.weapon) ? save.weapon : 'fists')
    this.ctx.input.wheelCycles = this._owned.length > 1
    this.ctx.hud.set({ weapons: this._owned.slice() })
  }

  equip(id: WeaponId): void {
    if (id === this._equipped || !this._owned.includes(id)) return
    this.cancelMove()
    this.setEquipped(id)
    this.ctx.game.setWeapons(this._owned, id)
    this.ctx.bus.emit('weapon:equip', { weapon: id })
  }

  dispose(): void {
    this.setPrompt(null)
    for (const m of this.held.values()) m.group.removeFromParent()
    this.held.clear()
    for (const st of this.stands) {
      st.base.removeFromParent()
      st.glow.removeFromParent()
    }
    this.stands = []
    for (const c of this.colliders) c.dispose()
    this.colliders = []
    for (const d of this.owned3D) d.dispose()
    this.owned3D = []
    this.glowMat = null
    this.arrows?.dispose()
    this.arrows = null
    this.kit?.dispose()
    this.kit = null
  }

  /* ── frame ───────────────────────────────────────────────── */

  update(dt: number): void {
    if (!this.kit) return
    const ctx = this.ctx
    const p = ctx.player
    const playing = ctx.game.phase === 'playing'
    this.updateStands(playing)
    this.arrows?.update(dt)

    const s = ctx.input.state
    if (playing) {
      if (s.slot >= 0 && s.slot < HOTBAR.length) this.equip(HOTBAR[s.slot])
      else if (s.cycle) this.cycle(s.cycle)
    }
    const able = playing && p.controlEnabled && p.hp > 0 && !ctx.character.ragdolling && p.state !== 'dash' && p.state !== 'hurt'
    if (able) this.updateMove(dt)
    else if (this.move !== 'none') this.cancelMove()

    const pose = this.pose
    pose.weapon = this._equipped
    pose.move = this.move
    pose.t = this.moveT
    pose.charge = this.charge
    const bow = this.held.get('bow')!
    const drawing = this.move === 'draw'
    bow.setDraw?.(drawing ? this.charge * this.charge * (3 - 2 * this.charge) : 0)
    if (bow.arrow) bow.arrow.visible = drawing
    ctx.hud.set({ aim: drawing ? Math.round(this.charge * 20) / 20 : -1 })
  }

  private cycle(dir: number): void {
    const list = this._owned
    if (list.length < 2) return
    const i = list.indexOf(this._equipped)
    this.equip(list[(i + dir + list.length) % list.length])
  }

  private setEquipped(id: WeaponId): void {
    this._equipped = id
    for (const [w, m] of this.held) m.group.visible = w === id
    this.ctx.hud.set({ weapon: id })
  }

  private cancelMove(): void {
    this.move = 'none'
    this.moveT = this.charge = 0
    this.queued = false
    this._aimYaw = null
  }

  /* ── stands ──────────────────────────────────────────────── */

  private updateStands(playing: boolean): void {
    const ctx = this.ctx
    const p = ctx.player.position
    if (this.glowMat) this.glowMat.opacity = 0.4 + 0.14 * Math.sin(ctx.clock.t * 2.2)
    const can = playing && ctx.player.controlEnabled && !ctx.character.ragdolling
    let near: Stand | null = null
    let nearD = PROMPT_RADIUS
    for (const st of this.stands) {
      if (st.taken || !can || Math.abs(p.y - st.y) > 2) continue
      const d = Math.hypot(p.x - st.x, p.z - st.z)
      if (d < TOUCH_RADIUS || (d < PROMPT_RADIUS && ctx.input.state.interact)) {
        this.take(st)
        continue
      }
      if (d < nearD) {
        nearD = d
        near = st
      }
    }
    this.setPrompt(near)
  }

  private setPrompt(st: Stand | null): void {
    if (st === this.prompted) return
    this.prompted = st
    const device = this.ctx.input.device
    const key = device === 'pad' ? 'Y' : device === 'touch' ? 'Tap' : 'E'
    this.ctx.bus.emit('ui:prompt', st ? { key, label: `Take the ${WEAPON_NAMES[st.weapon].toLowerCase()}` } : null)
  }

  private take(st: Stand): void {
    const ctx = this.ctx
    st.taken = true
    st.base.children.forEach(c => (c.visible = false))
    st.glow.visible = false
    if (this.prompted === st) this.setPrompt(null)
    this._owned = HOTBAR.filter(w => w === st.weapon || this._owned.includes(w))
    ctx.input.wheelCycles = true
    ctx.hud.set({ weapons: this._owned.slice() })
    const pos = { x: st.x, y: st.midY, z: st.z }
    ctx.bus.emit('weapon:pickup', { weapon: st.weapon, pos })
    ctx.fx.burst('spark', pos, { scale: 1.3 })
    const slot = HOTBAR.indexOf(st.weapon) + 1
    const how = ctx.game.isTouch ? 'Tap its slot on the hotbar to switch.' : `Press ${slot} or scroll the mouse wheel to switch.`
    ctx.bus.emit('ui:toast', { kind: 'info', title: `${WEAPON_NAMES[st.weapon]} found`, body: how })
    this.cancelMove()
    this.setEquipped(st.weapon)
    ctx.game.setWeapons(this._owned, st.weapon)
    ctx.bus.emit('weapon:equip', { weapon: st.weapon })
  }

  /* ── moves ───────────────────────────────────────────────── */

  private updateMove(dt: number): void {
    const s = this.ctx.input.state
    this.rest -= dt
    const eq = this._equipped
    if (eq === 'fists') return
    if (eq === 'bow') {
      this.updateBow(dt)
      return
    }
    if (this.move === 'none') {
      if (s.attack && this.rest <= 0) this.startMelee(eq === 'sword' ? 'slash1' : 'slam')
      return
    }
    this.moveT += dt / this.moveTime
    if (s.attack && NEXT_SLASH[this.move]) this.queued = true
    if (!this.struck && this.moveT >= (this.move === 'slam' ? HAMMER.hitAt : SWORD.hitAt)) {
      this.struck = true
      if (this.move === 'slam') this.slam()
      else this.slash()
    }
    if (this.moveT < 1) return
    const next = this.queued ? NEXT_SLASH[this.move] : undefined
    if (next) this.startMelee(next)
    else {
      this.cancelMove()
      this.rest = eq === 'sword' ? SWORD.rest : HAMMER.rest
    }
  }

  private startMelee(move: WeaponMove): void {
    const ctx = this.ctx
    const p = ctx.player.position
    this.move = move
    this.moveT = 0
    this.struck = this.queued = false
    this.combo = move === 'slash2' ? 1 : move === 'slash3' ? 2 : 0
    this.moveTime = move === 'slam' ? HAMMER.time : SWORD.time[this.combo]
    this._aimYaw = ctx.enemies.nearest(p, LOCK_RANGE, this.v) ? Math.atan2(this.v.x - p.x, this.v.z - p.z) : null
    ctx.bus.emit('weapon:swing', { weapon: this._equipped, pos: v3(p), combo: this.combo })
  }

  private slash(): void {
    const p = this.ctx.player
    const yaw = p.yaw
    const b = this.blow
    const i = this.combo
    b.weapon = 'sword'
    b.center.x = p.position.x + Math.sin(yaw) * SWORD.reach
    b.center.y = p.position.y + 0.9
    b.center.z = p.position.z + Math.cos(yaw) * SWORD.reach
    b.radius = SWORD.radius
    b.damage = SWORD.damage[i]
    b.knock = SWORD.knock[i]
    b.lift = SWORD.lift[i]
    b.max = undefined
    this.setFrom(p.position)
    this.landed(this.ctx.enemies.hit(b), i === 2 ? 0.3 : 0.18)
  }

  private slam(): void {
    const ctx = this.ctx
    const p = ctx.player
    const yaw = p.yaw
    const x = p.position.x + Math.sin(yaw) * HAMMER.reach
    const z = p.position.z + Math.cos(yaw) * HAMMER.reach
    const y = ctx.collision.groundAt(x, z, p.position.y + 0.6, 0.2).y
    ctx.bus.emit('weapon:slam', { pos: { x, y, z } })
    ctx.game.shake(0.5, 0.32)
    const b = this.blow
    b.weapon = 'hammer'
    b.center.x = x
    b.center.y = y + 0.4
    b.center.z = z
    b.max = undefined
    this.setFrom(p.position)
    // The head itself, then the shockwave ring for everything else nearby.
    b.radius = HAMMER.radius
    b.damage = HAMMER.damage
    b.knock = HAMMER.knock
    b.lift = HAMMER.lift
    let n = ctx.enemies.hit(b)
    b.radius = HAMMER.wave.radius
    b.damage = HAMMER.wave.damage
    b.knock = HAMMER.wave.knock
    b.lift = HAMMER.wave.lift
    n += ctx.enemies.hit(b)
    this.landed(n, 0)
  }

  private setFrom(p: THREE.Vector3): void {
    this.blow.from.x = p.x
    this.blow.from.y = p.y
    this.blow.from.z = p.z
  }

  /** Hit feedback: a beat of hit-stop and a little shake. */
  private landed(hits: number, shake: number): void {
    if (!hits) return
    this.ctx.game.timeWarp(0.05, HIT_STOP)
    if (shake) this.ctx.game.shake(shake, 0.12)
  }

  private updateBow(dt: number): void {
    const s = this.ctx.input.state
    if (this.move === 'release') {
      this.moveT += dt / BOW.releaseTime
      this._aimYaw = this.cameraYaw()
      if (this.moveT >= 1) {
        this.cancelMove()
        this.rest = BOW.rest
      }
      return
    }
    if (this.move === 'none') {
      if (!s.attackHeld || this.rest > 0) return
      this.move = 'draw'
      this.charge = 0
      this.ctx.bus.emit('weapon:draw', { pos: v3(this.ctx.player.position) })
    }
    this._aimYaw = this.cameraYaw()
    this.charge = Math.min(1, this.charge + dt / BOW.fullDraw)
    if (!s.attackHeld) this.shoot()
  }

  /** Looses the arrow from the bow toward whatever is under the screen centre. */
  private shoot(): void {
    const ctx = this.ctx
    const c = this.charge
    const from = this.held.get('bow')!.group.getWorldPosition(this.v)
    const cam = ctx.camera
    const dir = cam.getWorldDirection(this.w)
    const o = cam.position
    const hit = ctx.collision.raycast(o.x, o.y, o.z, dir.x, dir.y, dir.z, 120)
    const tx = hit ? hit.x : o.x + dir.x * 120
    const ty = hit ? hit.y : o.y + dir.y * 120
    const tz = hit ? hit.z : o.z + dir.z * 120
    const speed = BOW.speed[0] + (BOW.speed[1] - BOW.speed[0]) * c
    aimArc(from, tx, ty, tz, speed, ARROW.gravity, this.w)
    this.arrows?.fire(from, this.w, BOW.damage[0] + (BOW.damage[1] - BOW.damage[0]) * c)
    ctx.bus.emit('weapon:fire', { pos: v3(from), charge: c })
    this.move = 'release'
    this.moveT = 0
    this.charge = 0
  }

  private cameraYaw(): number {
    const d = this.ctx.camera.getWorldDirection(this.w)
    return Math.atan2(d.x, d.z)
  }
}

/** Launch velocity (into `out`) that reaches the target on the low ballistic arc, or 45° if out of range. */
function aimArc(from: THREE.Vector3, tx: number, ty: number, tz: number, speed: number, g: number, out: THREE.Vector3): void {
  const dx = tx - from.x
  const dz = tz - from.z
  const dy = ty - from.y
  const d = Math.hypot(dx, dz)
  if (d < 0.05) {
    out.set(0, dy >= 0 ? speed : -speed, 0)
    return
  }
  const v2 = speed * speed
  const disc = v2 * v2 - g * (g * d * d + 2 * dy * v2)
  const angle = disc >= 0 ? Math.atan((v2 - Math.sqrt(disc)) / (g * d)) : Math.PI / 4
  const h = Math.cos(angle) * speed
  out.set((dx / d) * h, Math.sin(angle) * speed, (dz / d) * h)
}
