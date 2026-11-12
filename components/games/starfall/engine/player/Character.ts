/**
 * The hero: loads /games/starfall/hero.glb (one skinned mesh, baked albedo),
 * places it on the player every frame and drives it with the procedural
 * Animator. Also owns the soft blob shadow under the feet, the face's expressions and the
 * ragdoll: while it is limp or getting up, the root sits where the ragdoll says and its pose
 * overrides the animation.
 *
 *   root (player position, smoothed yaw) → pivot (spin attack) → model (unit scale) → glTF armature
 */
import * as THREE from 'three'
import { GLTFLoader, type GLTFParser } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { Ctx, GestureName, ICharacter, MotionState, PlayerState } from '../types'
import type { V3 } from '../events'
import type { GroundHit } from '../collision'
import { Animator, type GroundSample } from './Animator'
import { createGrip } from './anim/grip'
import { Face, faceCentre } from './Face'
import { Rig } from './anim/Rig'
import { dampAngle, wrapAngle } from './anim/math'
import { HeroRagdoll } from './ragdoll/HeroRagdoll'

const HERO_URL = '/games/starfall/hero.glb'

/** A file's bytes; a failure comes back as an Error rather than a rejection nobody is listening to yet. */
async function loadBytes(url: string): Promise<ArrayBuffer | Error> {
  try {
    const r = await fetch(url)
    return r.ok ? await r.arrayBuffer() : new Error(`HTTP ${r.status} for ${url}`)
  } catch (err) {
    return err instanceof Error ? err : new Error(String(err))
  }
}
const HERO_HEIGHT = 1.62
/**
 * Visual yaw follows physics this fast (1/s), and never trails it by more than this (rad).
 * The controller already rate-limits turning, so this only rounds off the corners.
 */
const YAW_RATE = 30
const MAX_YAW_LAG = 0.6
/** Ragdoll impacts this hard (m/s) shake the camera a little. */
const RAGDOLL_SHAKE = 9
/** Limp impacts this hard (m/s) get a cartoon "boing" / "oof". */
const FLOP_IMPACT = 10
/** Going limp this fast (m/s) is a big launch: a beat of slow motion. */
const BIG_LAUNCH = 12
/** Landings harder than this (m/s — more than a double jump's worth of fall) make him wince. */
const HARD_LANDING = 17
/** How long a smile lasts after something good (s). */
const HAPPY_TIME = 1.5
const ACTIVE_STATES: ReadonlySet<PlayerState> = new Set<PlayerState>(['jump', 'doubleJump', 'fall', 'bounce', 'dash', 'attack', 'hurt'])

/** Is the hero doing something a gesture can't be layered over (moving, airborne, attacking…)? */
function busy(m: MotionState): boolean {
  return m.speed > 0.8 || !m.grounded || ACTIVE_STATES.has(m.state)
}

/**
 * GLTFLoader decodes embedded images by fetch()-ing a blob: URL, which the site's CSP
 * (connect-src) forbids. Images may come from blob: though, so decode them through <img>.
 */
function embeddedImagesViaImg(parser: GLTFParser) {
  const imgLoader = new THREE.TextureLoader(parser.options.manager)
  return {
    name: 'starfall_embedded_images',
    loadTexture(index: number) {
      const def = parser.json.textures?.[index]
      const src = def && parser.json.images?.[def.source]
      if (!src || src.bufferView === undefined) return null
      return parser.loadTextureImage(index, def.source, imgLoader)
    },
  }
}

export class Character implements ICharacter {
  readonly root = new THREE.Group()
  private pivot = new THREE.Group()
  private model = new THREE.Group()
  private rig: Rig | null = null
  private animator: Animator | null = null
  private ragdoll: HeroRagdoll | null = null
  private face: Face | null = null
  private blob: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | null = null
  /** Where held props attach: [left, right] grips under the hand bones (or the root without a rig). */
  private grips: [THREE.Object3D | null, THREE.Object3D | null] = [null, null]
  private owned: Array<{ dispose(): void }> = []
  private off: Array<() => void> = []
  private yaw = 0
  private placed = false
  private blink = false
  private visible = true
  private hit = {} as GroundHit
  private blobHit = {} as GroundHit
  private up = new THREE.Vector3(0, 1, 0)
  private normal = new THREE.Vector3()
  private headLocal = new THREE.Vector3()
  /** The model's bytes, requested as soon as the game is created so they download while the island builds. */
  private heroBytes: Promise<ArrayBuffer | Error>

  constructor(private ctx: Ctx) {
    this.root.name = 'hero'
    this.root.add(this.pivot)
    this.pivot.add(this.model)
    this.heroBytes = loadBytes(HERO_URL)
  }

  async init(): Promise<void> {
    const ctx = this.ctx
    ctx.scene.add(this.root)
    this.makeBlob()
    this.watchMood()
    try {
      const bytes = await this.heroBytes
      if (bytes instanceof Error) throw bytes
      const gltf = await new GLTFLoader().register(embeddedImagesViaImg).parseAsync(bytes, '')
      this.setupModel(gltf.scene)
    } catch (err) {
      console.error('[starfall] hero model failed to load — using a placeholder', err)
      this.makePlaceholder()
    }
    ctx.progress(1)
  }

  private setupModel(scene: THREE.Object3D): void {
    let height = 0
    let faceFound = false
    const anisotropy = Math.min(8, this.ctx.renderer.capabilities.getMaxAnisotropy())
    scene.updateMatrixWorld(true)
    scene.traverse(o => {
      const mesh = o as THREE.SkinnedMesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.frustumCulled = false
      mesh.geometry.computeBoundingBox()
      const bb = mesh.geometry.boundingBox!
      height = Math.max(height, bb.max.y - bb.min.y)
      this.owned.push(mesh.geometry)
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const mat of mats as THREE.MeshStandardMaterial[]) {
        mat.metalness = 0
        mat.roughness = 0.8
        mat.envMapIntensity = 0.6
        if (mat.map) {
          mat.map.anisotropy = anisotropy
          this.owned.push(mat.map)
          if (mat.name === 'HeroFace' && !this.face) {
            this.face = new Face(mat.map)
            mat.map = this.face.texture
            faceFound = faceCentre(mesh, this.headLocal)
          }
        }
        this.owned.push(mat)
      }
    })
    const scale = HERO_HEIGHT / (height || 6.24)
    // Head focus point (the eye line of the painted face), carried by the head bone; measured in the rest pose.
    const head = scene.getObjectByName('head')
    if (head && faceFound) head.worldToLocal(this.headLocal)
    else this.headLocal.set(0, 0.09 / scale, 0.02 / scale)
    this.model.scale.setScalar(scale)
    this.model.add(scene)
    this.grips = [createGrip(scene, 'L', scale), createGrip(scene, 'R', scale)]
    this.rig = new Rig(scene, scale)
    this.animator = new Animator(this.rig, this.probe)
    this.ragdoll = new HeroRagdoll(this.rig, this.ctx.collision, { radius: this.ctx.player.radius, height: this.ctx.player.height })
  }

  /** Rounded stand-in so the game stays playable if the model is missing. */
  private makePlaceholder(): void {
    const geo = new THREE.CapsuleGeometry(0.3, 0.95, 6, 16)
    const mat = new THREE.MeshStandardMaterial({ color: 0xc9432f, roughness: 0.8 })
    const m = new THREE.Mesh(geo, mat)
    m.position.y = 0.8
    m.castShadow = true
    this.model.add(m)
    this.owned.push(geo, mat)
  }

  private makeBlob(): void {
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
    const mat = new THREE.MeshBasicMaterial({
      map: this.ctx.textures.get('glow'),
      color: 0x24170f,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      fog: true,
    })
    const blob = new THREE.Mesh(geo, mat)
    blob.name = 'hero-blob-shadow'
    blob.renderOrder = 2
    blob.frustumCulled = false
    this.ctx.scene.add(blob)
    this.blob = blob
    this.owned.push(geo, mat)
  }

  /** Good things make him smile for a moment; a hard landing makes him wince. */
  private watchMood(): void {
    const bus = this.ctx.bus
    const smile = () => this.face?.show('happy', HAPPY_TIME)
    this.off.push(
      bus.on('collect:shard', smile),
      bus.on('collect:heart', smile),
      bus.on('weapon:pickup', smile),
      bus.on('chest:open', smile),
      bus.on('boss:defeat', smile),
      bus.on('ui:victory', () => this.face?.show('happy', 8)),
      bus.on('player:land', e => {
        if (e.impact > HARD_LANDING) this.face?.show('hurt', 0.7)
      }),
    )
  }

  /** Hurt, limp or dead: the pained face stays on for as long as it lasts. */
  private updateFace(dt: number): void {
    const face = this.face
    if (!face) return
    const p = this.ctx.player
    const s = p.motion.state
    face.hold(s === 'hurt' || s === 'dead' || p.hp <= 0 || this.ragdolling ? 'hurt' : 'neutral')
    face.update(dt)
  }

  /** Ground probe handed to the animator (feet planting). */
  private probe = (x: number, z: number, nearY: number, out: GroundSample): boolean => {
    const h = this.ctx.collision.groundAt(x, z, nearY + 0.2, 0.05, 0.45, this.hit)
    if (!(h.y > nearY - 0.5)) return false
    out.y = h.y
    out.nx = h.nx
    out.ny = h.ny
    out.nz = h.nz
    return true
  }

  update(dt: number): void {
    const p = this.ctx.player
    if (!p) return
    this.updateFace(dt)
    const rd = this.ragdoll
    // Cutscenes never show the ragdoll (e.g. tumbling into a shard): they cut straight to him standing.
    if (rd?.active && this.ctx.game.phase === 'cutscene') this.cancelRagdoll()
    if (rd?.active && this.animator) {
      const ev = rd.update(dt, p.controlEnabled && p.hp > 0)
      if (rd.impact > 0) this.ragdollImpact(rd)
      if (ev === 'failed') this.cancelRagdoll()
      else if (ev === 'done') this.animator.releaseOverride()
      else {
        this.updateRagdoll(dt, rd, ev === 'rise')
        return
      }
    }

    const pos = p.position
    if (!Number.isFinite(pos.x + pos.y + pos.z)) return
    const jumped = !this.placed || this.root.position.distanceToSquared(pos) > 4
    this.root.position.copy(pos)
    if (jumped || !Number.isFinite(this.yaw)) this.yaw = p.yaw
    else {
      this.yaw = dampAngle(this.yaw, p.yaw, YAW_RATE, dt)
      const lag = wrapAngle(p.yaw - this.yaw)
      if (Math.abs(lag) > MAX_YAW_LAG) this.yaw = p.yaw - Math.sign(lag) * MAX_YAW_LAG
    }
    this.root.rotation.y = this.yaw
    this.placed = true

    if (this.animator) {
      if (jumped) this.animator.resetFeet()
      // Gestures pose the whole body: one still playing when the player sets off (an emote, the tail
      // of a skipped cutscene) gives way at once instead of sliding along in a frozen pose.
      const setOff = this.ctx.game.phase === 'playing' && p.controlEnabled && busy(p.motion)
      if (setOff && this.animator.gesturing) this.animator.interruptGesture()
      if (this.ctx.weapons) this.animator.setWeapon(this.ctx.weapons.pose)
      this.animator.update(dt, this.root.position, this.yaw)
      this.pivot.rotation.y = this.animator.spin
      this.applyStretch(this.animator.stretch)
    }
    this.finishFrame(pos)
    rd?.track(this.root.position, dt, jumped)
  }

  /** Limp or getting up: the root goes where the ragdoll says and its pose replaces the animation. */
  private updateRagdoll(dt: number, rd: HeroRagdoll, rose: boolean): void {
    const animator = this.animator!
    this.root.position.copy(rd.rootPos)
    this.root.rotation.y = this.yaw = rd.rootYaw
    this.pivot.rotation.y = 0
    this.applyStretch(1)
    if (rose) animator.resetFeet()
    animator.setOverride(rd.pose)
    animator.update(dt, this.root.position, this.yaw)
    this.finishFrame(this.root.position)
    if (rd.phase === 'getup') rd.track(this.root.position, dt, rose)
  }

  /** Squash and stretch about the feet: taller means thinner, so the volume stays put. */
  private applyStretch(y: number): void {
    const side = 1 / Math.sqrt(y)
    this.pivot.scale.set(side, y, side)
  }

  private finishFrame(pos: THREE.Vector3): void {
    this.model.visible = !(this.blink && Math.floor(this.ctx.clock.real * 24) % 2 === 1)
    this.updateBlob(pos)
    this.root.updateMatrixWorld(true)
  }

  /** The limp body hit something hard: the same event as a landing, so audio and effects react. */
  private ragdollImpact(rd: HeroRagdoll): void {
    const p = rd.impactPos
    this.ctx.bus.emit('player:land', { pos: { x: p.x, y: p.y, z: p.z }, impact: rd.impact, surface: rd.impactSurface })
    if (rd.impact > FLOP_IMPACT) this.ctx.bus.emit('player:flop', { pos: { x: p.x, y: p.y, z: p.z }, impact: rd.impact })
    if (rd.impact > RAGDOLL_SHAKE) this.ctx.game.shake(Math.min(0.45, rd.impact / 40), 0.25)
  }

  private updateBlob(pos: THREE.Vector3): void {
    const blob = this.blob
    if (!blob) return
    const g = this.ctx.collision.groundAt(pos.x, pos.z, pos.y + 0.1, 0.2, 0.45, this.blobHit)
    const h = pos.y - g.y
    const show = this.visible && h < 6 && h > -0.5
    blob.visible = show
    if (!show) return
    const fade = 1 - Math.min(1, Math.max(0, h) / 6)
    blob.position.set(pos.x, g.y + 0.02, pos.z)
    blob.quaternion.setFromUnitVectors(this.up, this.normal.set(g.nx, g.ny, g.nz).normalize())
    blob.scale.setScalar(0.95 * (0.55 + 0.45 * fade))
    blob.material.opacity = (this.ctx.quality.shadows ? 0.32 : 0.55) * fade
  }

  getHandPosition(out: THREE.Vector3): THREE.Vector3 {
    if (this.rig) return this.rig.palmR.getWorldPosition(out)
    return out.copy(this.root.position).setY(this.root.position.y + 1.0)
  }

  holdInHand(side: 'left' | 'right', obj: THREE.Object3D): void {
    const grip = this.grips[side === 'left' ? 0 : 1]
    if (grip) {
      grip.add(obj)
      return
    }
    // Placeholder hero: carry it at hip height on that side.
    obj.position.set(side === 'left' ? 0.3 : -0.3, 0.85, 0.15)
    obj.rotation.set(Math.PI / 2, 0, 0)
    this.root.add(obj)
  }

  getHeadPosition(out: THREE.Vector3): THREE.Vector3 {
    if (this.rig) {
      this.rig.headBone.updateWorldMatrix(true, false)
      return this.rig.headBone.localToWorld(out.copy(this.headLocal))
    }
    return out.copy(this.root.position).setY(this.root.position.y + 1.5)
  }

  setMotion(m: MotionState): void {
    this.animator?.setMotion(m)
  }

  playGesture(name: GestureName, opts?: { loop?: boolean; speed?: number }): Promise<void> {
    if (name === 'cheer' || name === 'wave') this.face?.show('happy', HAPPY_TIME)
    return this.animator ? this.animator.playGesture(name, opts) : Promise.resolve()
  }

  stopGesture(opts?: { instant?: boolean }): void {
    this.animator?.stopGesture(opts)
  }

  startRagdoll(impulse: V3): void {
    const rd = this.ragdoll
    const p = this.ctx.player
    if (!rd || !this.animator || !p || !this.placed) return
    if (this.root.position.distanceToSquared(p.position) > 4) {
      // Teleported since the last pose (same frame): carry the posed body along, or it would go
      // limp back where it was.
      this.root.position.copy(p.position)
      this.root.rotation.y = this.yaw = p.yaw
      this.root.updateMatrixWorld(true)
    }
    const v = p.velocity
    const launch = Math.hypot(v.x + impulse.x, v.y + impulse.y, v.z + impulse.z)
    if (!rd.active && launch > BIG_LAUNCH) this.ctx.game.timeWarp(0.4, 0.35)
    // The bones show the pose posed for the root's heading plus the spin-attack twist.
    rd.start(this.root.rotation.y + this.pivot.rotation.y, v, impulse)
    this.animator.setOverride(rd.pose)
  }

  get ragdolling(): boolean {
    return !!this.ragdoll?.active
  }

  get ragdollRecovering(): boolean {
    return this.ragdoll?.phase === 'getup'
  }

  getRagdollAnchor(out: THREE.Vector3): THREE.Vector3 {
    const rd = this.ragdoll
    return out.copy(rd?.active ? rd.anchor : this.ctx.player.position)
  }

  getRagdollBody(out: Float64Array, root: THREE.Vector3): number | null {
    const rd = this.ragdoll
    return rd?.active ? rd.body(out, root) : null
  }

  cancelRagdoll(): void {
    const rd = this.ragdoll
    if (!rd?.active) return
    rd.cancel()
    this.animator?.releaseOverride(0)
    this.animator?.resetFeet()
  }

  lookAt(target: V3 | null): void {
    this.animator?.lookAt(target)
  }

  setBlink(on: boolean): void {
    this.blink = on
    if (!on) this.model.visible = true
  }

  setVisible(v: boolean): void {
    this.visible = v
    this.root.visible = v
    if (this.blob) this.blob.visible = v
  }

  dispose(): void {
    this.ragdoll?.cancel()
    this.ragdoll = null
    this.animator?.stopGesture()
    for (const off of this.off) off()
    this.off = []
    this.root.removeFromParent()
    this.blob?.removeFromParent()
    this.face?.dispose()
    this.face = null
    for (const d of this.owned) d.dispose()
    this.owned = []
    this.animator = null
    this.rig = null
    this.blob = null
    this.grips = [null, null]
  }
}
