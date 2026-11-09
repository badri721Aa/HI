/**
 * Renders the other players: a clone of the hero per peer (shared geometry and
 * texture, own skeleton), animated by the same procedural Animator as the local
 * hero from a MotionState rebuilt out of the network stream, with a tinted
 * shirt, a soft blob shadow, a name tag and chat bubbles.
 *
 *   root (smoothed position, yaw) → pivot (spin attack) → model (unit scale) → cloned glTF scene
 *
 * The hero model is loaded lazily, the first time another player shows up.
 */
import * as THREE from 'three'
import { GLTFLoader, type GLTFParser } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import type { GroundHit } from '../collision'
import type { Ctx, GestureName, MotionState, WeaponId, WeaponPose } from '../types'
import { WeaponKit, type HeldWeapon } from '../gameplay/weapons/models'
import { Animator, type GroundSample } from '../player/Animator'
import { createGrip } from '../player/anim/grip'
import { Rig } from '../player/anim/Rig'
import { BUBBLE_TIME, TAG_FADE_START, TAG_HIDE } from './config'
import { BUBBLE_H, BUBBLE_W, CanvasSprite, TAG_H, TAG_W, drawBubble, drawNameTag } from './labels'
import type { RemotePeer } from './RemotePeer'
import { ShirtMaterial } from './shirt'

const HERO_URL = '/games/starfall/hero.glb'
const HERO_HEIGHT = 1.62
/** Name tag anchor above the feet (m), its world height at close range, and its minimum on-screen height (fraction of the view). */
const TAG_Y = 1.98
const TAG_SIZE = 0.2
const TAG_SCREEN = 0.048
const BUBBLE_SCALE = 1.12
/** Beyond these distances the animator runs every 2nd / 4th frame. */
const LOD1 = 45
const LOD2 = 90
const CULL_DIST = 240
/** A ragdolling remote lies back this far (rad) about its pelvis, which rests this high (m). */
const LIE_ANGLE = Math.PI / 2 - 0.1
const LIE_PELVIS = 0.16
/** How far back (m) the labels move to sit over the torso of a lying body. */
const LIE_TAG_BACK = 0.45

/** Same CSP-safe embedded image decoding as the local hero (see player/Character.ts). */
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

interface Template {
  scene: THREE.Object3D
  scale: number
  hero: THREE.MeshStandardMaterial | null
}

const _sphere = new THREE.Sphere()
const _m = new THREE.Matrix4()
const _n = new THREE.Vector3()
const UP = new THREE.Vector3(0, 1, 0)

class Avatar {
  readonly root = new THREE.Group()
  readonly pivot = new THREE.Group()
  readonly model = new THREE.Group()
  readonly tag: CanvasSprite
  readonly bubble: CanvasSprite
  readonly blob: THREE.Mesh
  animator: Animator | null = null
  rig: Rig | null = null
  shirt: ShirtMaterial | null = null
  placeholder: THREE.Mesh<THREE.CapsuleGeometry, THREE.MeshStandardMaterial> | null = null
  bubbleT = 0
  drawn = { name: '', color: '', away: false }
  wasVisible = false
  animAcc = 0
  frame = 0
  /** Hand grips [left, right] and the weapon copies made so far (shown: the one in the peer's hand). */
  private grips: [THREE.Object3D | null, THREE.Object3D | null] = [null, null]
  private weapons = new Map<HeldWeapon, THREE.Object3D>()
  private readonly weaponPose: WeaponPose = { weapon: 'fists', move: 'none', t: 0, charge: 0 }
  prevYaw = 0
  turnRate = 0
  /** 0..1 how far the body has gone limp onto the ground. */
  limp = 0
  readonly hit = {} as GroundHit
  readonly blobHit = {} as GroundHit
  readonly motion: MotionState

  constructor(
    private ctx: Ctx,
    readonly peer: RemotePeer,
    template: Template | null,
    blobGeo: THREE.BufferGeometry,
    blobMat: THREE.Material,
    private weaponKit: () => WeaponKit,
  ) {
    const anisotropy = Math.min(4, ctx.renderer.capabilities.getMaxAnisotropy())
    this.root.name = `remote-${peer.id}`
    this.root.add(this.pivot)
    this.pivot.add(this.model)
    const local = ctx.player?.motion
    this.motion = {
      state: 'idle', stateTime: 0, speed: 0,
      walkSpeed: local?.walkSpeed ?? 2.2, runSpeed: local?.runSpeed ?? 5.6, sprintSpeed: local?.sprintSpeed ?? 8.6,
      vy: 0, grounded: true, turnRate: 0, landImpact: 0, wading: 0, slope: 0,
    }

    if (template) this.buildHero(template)
    else this.buildPlaceholder()

    this.tag = new CanvasSprite(TAG_W, TAG_H, anisotropy)
    this.tag.sprite.position.y = TAG_Y
    this.root.add(this.tag.sprite)
    this.bubble = new CanvasSprite(BUBBLE_W, BUBBLE_H, anisotropy)
    this.bubble.sprite.visible = false
    this.root.add(this.bubble.sprite)
    this.redrawTag()

    this.blob = new THREE.Mesh(blobGeo, blobMat)
    this.blob.renderOrder = 2
    this.blob.frustumCulled = false

    this.root.position.copy(peer.position)
    this.root.rotation.y = this.prevYaw = peer.yaw
    ctx.scene.add(this.root, this.blob)
  }

  private buildHero(t: Template): void {
    const scene = cloneSkinned(t.scene)
    scene.traverse(o => {
      const mesh = o as THREE.SkinnedMesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.frustumCulled = false
      if (t.hero && mesh.material === t.hero) {
        this.shirt = new ShirtMaterial(t.hero, this.peer.color)
        mesh.material = this.shirt.material
      }
    })
    this.model.scale.setScalar(t.scale)
    this.model.add(scene)
    try {
      this.grips = [createGrip(scene, 'L', t.scale), createGrip(scene, 'R', t.scale)]
      this.rig = new Rig(scene, t.scale)
      this.animator = new Animator(this.rig, this.probe)
    } catch (err) {
      console.warn('[starfall] remote hero rig failed', err)
    }
  }

  private buildPlaceholder(): void {
    const geo = new THREE.CapsuleGeometry(0.3, 0.95, 6, 16)
    const mat = new THREE.MeshStandardMaterial({ color: this.peer.color, roughness: 0.8 })
    const m = new THREE.Mesh(geo, mat)
    m.position.y = 0.8
    m.castShadow = true
    this.model.add(m)
    this.placeholder = m
  }

  /** Puts the peer's weapon in the right hand grip (the bow in the left); copies are made on first use. */
  private showWeapon(id: WeaponId): void {
    this.weaponPose.weapon = id
    for (const [w, o] of this.weapons) o.visible = w === id
    if (id === 'fists' || this.weapons.has(id)) return
    const grip = this.grips[id === 'bow' ? 0 : 1]
    if (!grip) return
    const m = this.weaponKit().make(id)
    grip.add(m.group)
    this.weapons.set(id, m.group)
  }

  /** Ground probe for the animator's foot planting (same as the local hero's). */
  private probe = (x: number, z: number, nearY: number, out: GroundSample): boolean => {
    const h = this.ctx.collision.groundAt(x, z, nearY + 0.2, 0.05, 0.45, this.hit)
    if (!(h.y > nearY - 0.5)) return false
    out.y = h.y
    out.nx = h.nx
    out.ny = h.ny
    out.nz = h.nz
    return true
  }

  redrawTag(): void {
    const p = this.peer
    if (this.drawn.name === p.name && this.drawn.color === p.color && this.drawn.away === p.away) return
    this.drawn.name = p.name
    this.drawn.color = p.color
    this.drawn.away = p.away
    drawNameTag(this.tag, p.name, p.color, p.away)
    this.shirt?.setColor(p.color)
    this.placeholder?.material.color.set(p.color)
  }

  say(text: string): void {
    drawBubble(this.bubble, text)
    this.bubbleT = BUBBLE_TIME
  }

  update(dt: number, camera: THREE.PerspectiveCamera, frustum: THREE.Frustum): void {
    const p = this.peer
    const root = this.root
    root.position.copy(p.position)
    root.rotation.y = p.yaw
    const raw = Math.atan2(Math.sin(p.yaw - this.prevYaw), Math.cos(p.yaw - this.prevYaw)) / Math.max(dt, 1e-3)
    this.prevYaw = p.yaw
    this.turnRate += (THREE.MathUtils.clamp(raw, -12, 12) - this.turnRate) * (1 - Math.exp(-10 * dt))
    if (this.drawn.away !== p.away) this.redrawTag()
    if (this.bubbleT > 0) this.bubbleT -= dt

    const dist = camera.position.distanceTo(p.position)
    _sphere.center.set(p.position.x, p.position.y + 0.9, p.position.z)
    _sphere.radius = 1.4
    const visible = p.ready && dist < CULL_DIST && frustum.intersectsSphere(_sphere)
    root.visible = visible
    this.updateBlob(visible && dist < 60)
    if (!visible) {
      this.wasVisible = false
      return
    }

    const a = this.animator
    if (a) {
      const m = this.motion
      // Remote copies don't run the ragdoll physics: they go limp (death pose, lying down) at the replicated anchor.
      m.state = p.ragdoll ? 'dead' : p.state
      m.stateTime = p.stateTime
      m.speed = Math.hypot(p.velocity.x, p.velocity.z)
      m.vy = p.velocity.y
      m.grounded = p.grounded
      m.turnRate = this.turnRate
      m.landImpact = p.landImpact
      m.wading = p.wading
      m.slope = p.slope
      a.setMotion(m)
      if (p.weapon !== this.weaponPose.weapon) this.showWeapon(p.weapon)
      a.setWeapon(this.weaponPose)
      if (p.snapped || !this.wasVisible) a.resetFeet()
      this.animAcc += dt
      const every = dist > LOD2 ? 4 : dist > LOD1 ? 2 : 1
      if (++this.frame % every === 0 || !this.wasVisible) {
        a.update(this.animAcc, root.position, p.yaw)
        this.pivot.rotation.y = a.spin
        this.animAcc = 0
      }
      this.updateLimp(dt, p.ragdoll)
    }
    this.wasVisible = true

    // Labels keep a readable on-screen size with distance, then fade out.
    const viewK = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)
    const s = Math.max(TAG_SIZE, TAG_SCREEN * viewK * dist)
    const fade = 1 - THREE.MathUtils.smoothstep(dist, TAG_FADE_START, TAG_HIDE)
    const tag = this.tag.sprite
    // Lying down, the labels drop and move back over the torso.
    const lie = this.limp * this.limp * (3 - 2 * this.limp)
    const tagY = TAG_Y - lie * 1.3
    tag.position.set(0, tagY, -LIE_TAG_BACK * lie)
    this.bubble.sprite.position.z = tag.position.z
    tag.visible = fade > 0.01
    tag.scale.set(s * this.tag.aspect, s, 1)
    this.tag.material.opacity = fade
    const bubble = this.bubble.sprite
    if (this.bubbleT > 0) {
      const bs = s * (BUBBLE_H / TAG_H) * BUBBLE_SCALE
      bubble.visible = fade > 0.01
      bubble.position.y = tagY + s * 0.78
      bubble.scale.set(bs * this.bubble.aspect, bs, 1)
      this.bubble.material.opacity = fade * Math.min(1, this.bubbleT / 0.6, (BUBBLE_TIME - this.bubbleT) / 0.15)
    } else bubble.visible = false
  }

  /** Tilts the body onto its back about the pelvis while ragdolling, and back up after. */
  private updateLimp(dt: number, on: boolean): void {
    const target = on ? 1 : 0
    if (this.limp === target && !on) return
    this.limp += (target - this.limp) * (1 - Math.exp(-(on ? 6 : 4) * dt))
    if (Math.abs(this.limp - target) < 0.002) this.limp = target
    const pivot = this.pivot
    if (this.limp === 0) {
      pivot.rotation.x = 0
      pivot.position.set(0, 0, 0)
      return
    }
    const w = this.limp * this.limp * (3 - 2 * this.limp)
    const h = Math.max(LIE_PELVIS, this.rig ? this.rig.hipsPos.y : 0.5)
    const th = -w * LIE_ANGLE
    // Rotate about the pelvis (0, h, 0), then lower it towards the ground.
    pivot.rotation.x = th
    pivot.position.set(0, h - h * Math.cos(th) - w * (h - LIE_PELVIS), -h * Math.sin(th))
  }

  private updateBlob(show: boolean): void {
    const blob = this.blob
    const pos = this.peer.position
    if (!show) {
      blob.visible = false
      return
    }
    const g = this.ctx.collision.groundAt(pos.x, pos.z, pos.y + 0.1, 0.2, 0.45, this.blobHit)
    const h = pos.y - g.y
    blob.visible = h < 6 && h > -0.5
    if (!blob.visible) return
    const fade = 1 - Math.min(1, Math.max(0, h) / 6)
    blob.position.set(pos.x, g.y + 0.02, pos.z)
    blob.quaternion.setFromUnitVectors(UP, _n.set(g.nx, g.ny, g.nz).normalize())
    blob.scale.setScalar(0.95 * (0.45 + 0.55 * fade))
  }

  dispose(): void {
    this.animator?.stopGesture()
    // Geometry and textures belong to the shared template; each clone owns its skeleton (bone texture).
    this.model.traverse(o => (o as THREE.SkinnedMesh).skeleton?.dispose())
    this.root.removeFromParent()
    this.blob.removeFromParent()
    this.tag.dispose()
    this.bubble.dispose()
    this.shirt?.dispose()
    if (this.placeholder) {
      this.placeholder.geometry.dispose()
      this.placeholder.material.dispose()
    }
    this.animator = null
  }
}

export class RemotePlayers {
  private avatars = new Map<string, Avatar>()
  private template: Template | null = null
  private loading: Promise<void> | null = null
  private settled = false
  private disposed = false
  private owned: Array<{ dispose(): void }> = []
  private blob: { geo: THREE.PlaneGeometry; mat: THREE.MeshBasicMaterial } | null = null
  private frustum = new THREE.Frustum()

  /** Shared weapon models for every avatar, made when the first one holds something. */
  private kit: WeaponKit | null = null
  private weaponKit = (): WeaponKit => (this.kit ??= new WeaponKit(this.ctx.textures))

  constructor(private ctx: Ctx) {}

  /** Shared blob-shadow quad, made on first use (textures are only loaded after construction). */
  private blobParts(): { geo: THREE.PlaneGeometry; mat: THREE.MeshBasicMaterial } {
    if (!this.blob) {
      this.blob = {
        geo: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
        mat: new THREE.MeshBasicMaterial({
          map: this.ctx.textures.get('glow'),
          color: 0x24170f,
          transparent: true,
          opacity: 0.42,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
          fog: true,
        }),
      }
    }
    return this.blob
  }

  /** Starts loading the hero model once (idempotent). */
  preload(): void {
    if (this.loading) return
    this.loading = new GLTFLoader()
      .register(embeddedImagesViaImg)
      .loadAsync(HERO_URL)
      .then(gltf => {
        if (this.disposed) return
        this.template = this.makeTemplate(gltf.scene)
      })
      .catch(err => console.warn('[starfall] remote hero failed to load — using placeholders', err))
      .finally(() => {
        this.settled = true
      })
  }

  private makeTemplate(scene: THREE.Object3D): Template {
    let height = 0
    let hero: THREE.MeshStandardMaterial | null = null
    const anisotropy = Math.min(8, this.ctx.renderer.capabilities.getMaxAnisotropy())
    scene.traverse(o => {
      const mesh = o as THREE.SkinnedMesh
      if (!mesh.isMesh) return
      mesh.geometry.computeBoundingBox()
      const bb = mesh.geometry.boundingBox!
      height = Math.max(height, bb.max.y - bb.min.y)
      this.owned.push(mesh.geometry)
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const mat of mats as THREE.MeshStandardMaterial[]) {
        const eye = mat.name === 'HeroEye'
        mat.metalness = 0
        mat.roughness = eye ? 0.14 : 0.8
        mat.envMapIntensity = eye ? 1 : 0.6
        if (mat.map) {
          mat.map.anisotropy = anisotropy
          this.owned.push(mat.map)
        }
        if (mat.name === 'Hero') hero = mat
        this.owned.push(mat)
      }
    })
    return { scene, scale: HERO_HEIGHT / (height || 6.24), hero }
  }

  /** Creates avatars for peers that have a position, updates and animates all of them. */
  update(dt: number, peers: readonly RemotePeer[]): void {
    if (peers.length && !this.loading) this.preload()
    const camera = this.ctx.camera
    _m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    this.frustum.setFromProjectionMatrix(_m)
    for (let i = 0; i < peers.length; i++) {
      const peer = peers[i]
      let av = this.avatars.get(peer.id)
      if (!av) {
        if (!peer.ready || !this.settled) continue
        const blob = this.blobParts()
        av = new Avatar(this.ctx, peer, this.template, blob.geo, blob.mat, this.weaponKit)
        this.avatars.set(peer.id, av)
      }
      av.update(dt, camera, this.frustum)
    }
  }

  /** Name / colour / away changed. */
  refresh(id: string): void {
    this.avatars.get(id)?.redrawTag()
  }

  say(id: string, text: string): void {
    this.avatars.get(id)?.say(text)
  }

  gesture(id: string, name: GestureName): void {
    void this.avatars.get(id)?.animator?.playGesture(name)
  }

  /** A player went limp: a puff of dust where they fall (the limp pose itself comes from the state stream). */
  flop(id: string, v: [number, number, number]): void {
    const av = this.avatars.get(id)
    if (!av?.root.visible) return
    const p = av.peer.position
    this.ctx.fx?.burst('dust', p, { dir: { x: v[0] * 0.15, y: 1, z: v[2] * 0.15 }, count: 6, scale: 0.8 })
  }

  remove(id: string): void {
    const av = this.avatars.get(id)
    if (!av) return
    av.dispose()
    this.avatars.delete(id)
  }

  clear(): void {
    for (const av of this.avatars.values()) av.dispose()
    this.avatars.clear()
  }

  dispose(): void {
    this.disposed = true
    this.clear()
    for (const d of this.owned) d.dispose()
    this.owned = []
    this.template = null
    this.kit?.dispose()
    this.kit = null
    this.blob?.geo.dispose()
    this.blob?.mat.dispose()
    this.blob = null
  }
}
