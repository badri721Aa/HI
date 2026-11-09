/**
 * The reward chest a boss leaves behind. It rises out of the floor with a burst; walk into it
 * or press E nearby: the lid swings open, the reward floats up in a glow, and it is yours.
 * A chest whose reward is already owned stands open and empty.
 */
import * as THREE from 'three'
import type { Collider } from '../collision'
import type { WeaponId } from '../events'
import type { WeaponKit } from '../gameplay/weapons/models'
import { glowTexture } from '../gameplay/parts/util'
import type { Ctx } from '../types'

const TOUCH = 1.25
const PROMPT = 2.4
const RISE = 0.9
const LID_OPEN = -1.9

export class Chest {
  private readonly root = new THREE.Group()
  private readonly lid = new THREE.Group()
  private readonly reward: THREE.Group
  private readonly glow: THREE.Sprite
  private readonly collider: Collider
  private readonly owned: Array<{ dispose(): void }> = []
  private state: 'hidden' | 'closed' | 'open' = 'hidden'
  private riseT = RISE
  private openT = 0
  private prompted = false

  constructor(
    private readonly ctx: Ctx,
    private readonly x: number,
    private readonly y: number,
    private readonly z: number,
    yaw: number,
    private readonly weapon: Exclude<WeaponId, 'fists'>,
    kit: WeaponKit,
  ) {
    const own = <T extends { dispose(): void }>(o: T): T => {
      this.owned.push(o)
      return o
    }
    const tex = ctx.textures
    const wood = own(new THREE.MeshStandardMaterial({ map: tex.get('planks_albedo'), normalMap: tex.get('planks_normal'), color: 0xc08a58, roughness: 0.75 }))
    const gold = own(new THREE.MeshStandardMaterial({ color: 0xe8b84a, metalness: 1, roughness: 0.3 }))
    const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rz = 0) => {
      const m = new THREE.Mesh(own(geo), mat)
      m.position.set(x, y, z)
      m.rotation.z = rz
      m.castShadow = m.receiveShadow = true
      parent.add(m)
      return m
    }
    // Body with gold corner bands and a lock plate.
    add(this.root, new THREE.BoxGeometry(1.3, 0.72, 0.85), wood, 0, 0.36, 0)
    for (const bx of [-0.58, 0.58]) add(this.root, new THREE.BoxGeometry(0.1, 0.74, 0.87), gold, bx, 0.37, 0)
    add(this.root, new THREE.BoxGeometry(0.22, 0.26, 0.05), gold, 0, 0.6, 0.44)
    // Lid: a half barrel hinged along the back edge.
    this.lid.position.set(0, 0.72, -0.425)
    add(this.lid, new THREE.CylinderGeometry(0.425, 0.425, 1.3, 16, 1, false, 0, Math.PI), wood, 0, 0, 0.425, Math.PI / 2)
    for (const bx of [-0.58, 0.58]) add(this.lid, new THREE.CylinderGeometry(0.44, 0.44, 0.1, 16, 1, false, 0, Math.PI), gold, bx, 0, 0.425, Math.PI / 2)
    this.root.add(this.lid)

    // The reward, waiting inside until the lid opens.
    this.reward = kit.make(weapon).group
    this.reward.visible = false
    this.root.add(this.reward)
    const glowTex = glowTexture(ctx)
    if (glowTex.owned) own(glowTex.texture)
    this.glow = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: glowTex.texture, color: 0xffe2a0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })))
    this.glow.scale.setScalar(2.6)
    this.glow.position.set(0, 1.2, 0)
    this.root.add(this.glow)

    this.root.position.set(x, y, z)
    this.root.rotation.y = yaw
    this.root.visible = false
    this.root.name = `chest-${weapon}`
    ctx.scene.add(this.root)
    this.collider = ctx.collision.addBox({ x, y: y + 0.4, z, hx: 0.65, hy: 0.4, hz: 0.45, yaw, surface: 'wood', tag: 'chest' })
    this.collider.enabled = false
  }

  /** Show it closed (rising from the floor when `appear`), or already open and empty. */
  show(open: boolean, appear = false): void {
    this.state = open ? 'open' : 'closed'
    this.root.visible = true
    this.collider.enabled = true
    this.riseT = appear ? 0 : RISE
    this.openT = open ? 10 : 0
    this.lid.rotation.x = open ? LID_OPEN : 0
    this.reward.visible = false
    if (appear) this.ctx.fx.burst('shard', { x: this.x, y: this.y + 0.6, z: this.z }, { scale: 1.4 })
  }

  hide(): void {
    this.state = 'hidden'
    this.root.visible = false
    this.collider.enabled = false
    this.setPrompt(false)
  }

  update(dt: number, live: boolean): void {
    if (this.state === 'hidden') return
    if (this.riseT < RISE) {
      this.riseT = Math.min(RISE, this.riseT + dt)
      const u = this.riseT / RISE
      this.root.position.y = this.y - 0.9 * (1 - u) * (1 - u)
    }
    if (this.state === 'open') {
      this.openT += dt
      const u = Math.min(1, this.openT / 0.5)
      this.lid.rotation.x = LID_OPEN * (1 - (1 - u) * (1 - u))
      // The reward rises, turns in the light and fades out after a moment.
      const r = this.openT
      this.reward.visible = r < 3
      this.reward.position.set(0, 0.5 + Math.min(1.3, r * 1.4), 0)
      this.reward.rotation.set(0, r * 2.5, 0.25)
      const m = this.glow.material as THREE.SpriteMaterial
      m.opacity = r < 3 ? Math.min(1, r * 2) * (1 - Math.max(0, r - 2.2) / 0.8) : 0
      return
    }
    const p = this.ctx.player.position
    const d = Math.hypot(p.x - this.x, p.z - this.z)
    const can = live && this.riseT >= RISE && Math.abs(p.y - this.y) < 1.5
    if (can && (d < TOUCH || (d < PROMPT && this.ctx.input.state.interact))) {
      this.open()
      return
    }
    this.setPrompt(can && d < PROMPT)
  }

  dispose(): void {
    this.setPrompt(false)
    this.ctx.collision.remove(this.collider)
    this.root.removeFromParent()
    for (const o of this.owned) o.dispose()
  }

  private open(): void {
    this.setPrompt(false)
    this.state = 'open'
    this.openT = 0
    const pos = { x: this.x, y: this.y + 1, z: this.z }
    // Granted first: chest:open listeners (the objective line) see the reward as owned.
    this.ctx.weapons.grant(this.weapon)
    this.ctx.bus.emit('chest:open', { pos })
    this.ctx.fx.burst('shard', pos, { scale: 1.6 })
  }

  private setPrompt(on: boolean): void {
    if (on === this.prompted) return
    this.prompted = on
    this.ctx.bus.emit('ui:prompt', on ? { key: this.ctx.input.interactKey, label: 'Open the chest' } : null)
  }
}
