/**
 * Enemy models: the bundled CC0 glTF files, their loading (never blocking, never throwing),
 * per-enemy dressing and the puppets that animate them.
 *
 *   ModelLib     fetches and parses each file once (mob models while the loading screen is up,
 *                boss models in the background and on demand), repaints the legion's atlas per
 *                archetype, and falls back to a procedural stand-in when a file can't be had.
 *   EnemyModel   one enemy's copy: a skinned clone (or a stand-in), its gear on the hand slots,
 *                per-instance patched materials (flash, tint, rim, dissolve) and a puppet.
 *   Puppet       plays semantic animations (AnimName): clip cross-fades on glTF models, a
 *                procedural rig on stand-ins.
 *
 * Sources (all CC0; see the in-game credits):
 *   legion-*.glb     KayKit Character Pack: Skeletons, Kay Lousberg (kaylousberg.com) — github.com/
 *                    KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0. Parts joined per
 *                    material, 27 of the 95 clips kept in legion-anims.glb (shared rig).
 *   iron-titan.glb   "RobotExpressive", Tomás Laulhé (Quaternius), modifications by Don McCurdy —
 *                    three.js examples/models/gltf/RobotExpressive. Re-proportioned and re-armoured here.
 *   vortex-weaver / plasma-overlord / void-stalker.glb
 *                    Quaternius monsters (Dragon, Big Alien, Ghost Skull) — quaternius.com, via the
 *                    licence-checked @netforge/asset-library-files package. Recoloured here.
 *   sentry-turret.glb  Kenney Space Kit "turret_double" — kenney.nl/assets/space-kit.
 * Every file was compressed with glTF-Transform (KHR_mesh_quantization only: no decoder needed).
 */
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { embeddedImagesViaImg, loadBytes } from '../../gltf'
import type { AnimName, GearId, Look, ModelId, ModelSpec } from './defs'
import { buildFallback, buildGear, compactFallback, type RigKind } from './fallback'
import { patchSkin, repaintAtlas, skinUniforms, type SkinUniforms } from './materials'

const BASE = '/games/starfall/models/'
const FILES: Record<ModelId | 'legion-anims' | 'legion-gear', string> = {
  'legion-rogue': 'legion-rogue.glb',
  'legion-warrior': 'legion-warrior.glb',
  'legion-minion': 'legion-minion.glb',
  'legion-mage': 'legion-mage.glb',
  'legion-anims': 'legion-anims.glb',
  'legion-gear': 'legion-gear.glb',
  'iron-titan': 'iron-titan.glb',
  'vortex-weaver': 'vortex-weaver.glb',
  'plasma-overlord': 'plasma-overlord.glb',
  'void-stalker': 'void-stalker.glb',
  'sentry-turret': 'sentry-turret.glb',
}

type ClipMap = Partial<Record<AnimName, string>>

const LEGION_CLIPS: ClipMap = {
  idle: 'Idle', combat: 'Idle_Combat', walk: 'Walking_D_Skeletons', run: 'Running_A', sprint: 'Running_B',
  hit: 'Hit_A', death: 'Death_C_Skeletons', spawn: 'Spawn_Ground_Skeletons', block: 'Blocking', blockHit: 'Block_Hit',
  bash: 'Block_Attack', slash: 'Dualwield_Melee_Attack_Slice', chop: '1H_Melee_Attack_Chop', aim: '2H_Ranged_Aiming',
  shoot: '2H_Ranged_Shoot', reload: '2H_Ranged_Reload', cast: 'Spellcasting', castShoot: 'Spellcast_Shoot',
  summon: 'Spellcast_Summon', raise: 'Spellcast_Raise', throw: 'Throw', taunt: 'Taunt', dodge: 'Dodge_Backward',
}

const CLIPS: Record<ModelId, ClipMap> = {
  'legion-rogue': LEGION_CLIPS,
  'legion-warrior': LEGION_CLIPS,
  'legion-minion': LEGION_CLIPS,
  'legion-mage': LEGION_CLIPS,
  'iron-titan': { idle: 'Idle', walk: 'Walking', run: 'Running', punch: 'Punch', jump: 'Jump', death: 'Death', spin: 'Dance', slash: 'Punch' },
  'vortex-weaver': { idle: 'Flying_Idle', fly: 'Flying_Idle', flyFast: 'Fast_Flying', headbutt: 'Headbutt', punch: 'Punch', hit: 'HitReact', death: 'Death', taunt: 'Yes' },
  'plasma-overlord': { idle: 'Idle', punch: 'Punch', cast: 'Weapon', raise: 'Wave', hit: 'HitReact', death: 'Death', slump: 'Duck', taunt: 'Yes' },
  'void-stalker': { idle: 'Flying_Idle', fly: 'Flying_Idle', flyFast: 'Fast_Flying', headbutt: 'Headbutt', punch: 'Punch', hit: 'HitReact', death: 'Death', taunt: 'No', slash: 'Punch' },
  'sentry-turret': {},
}

/** What to play when a model has no clip for a name. */
const STAND_IN: Partial<Record<AnimName, AnimName>> = {
  combat: 'idle', sprint: 'run', run: 'walk', walk: 'idle', fly: 'idle', flyFast: 'fly', block: 'combat', blockHit: 'hit',
  bash: 'punch', slash: 'punch', chop: 'slash', aim: 'combat', shoot: 'punch', reload: 'idle', cast: 'idle', castShoot: 'cast',
  summon: 'cast', raise: 'cast', throw: 'punch', taunt: 'idle', dodge: 'hit', punch: 'idle', headbutt: 'punch', slump: 'hit',
  spin: 'idle', jump: 'idle', spawn: 'idle', hit: 'idle', death: 'hit',
}

const LEGION_IDS: ReadonlySet<ModelId> = new Set(['legion-rogue', 'legion-warrior', 'legion-minion', 'legion-mage'])

interface Template {
  scene: THREE.Object3D
  clips: Map<string, THREE.AnimationClip>
  skinned: boolean
  kind: RigKind | 'clips'
  fallback: boolean
}

type Status = 'idle' | 'loading' | 'ready' | 'failed'

export class ModelLib {
  private templates = new Map<ModelId, Template>()
  private status = new Map<string, Status>()
  private pending = new Map<string, Promise<void>>()
  private gltf = new Map<string, { scene: THREE.Group; animations: THREE.AnimationClip[] }>()
  private atlases = new Map<string, THREE.Texture>()
  private fallbacks = new Map<string, Template>()
  private gearFallback = new Map<string, THREE.Group>()
  private owned: Array<{ dispose(): void }> = []
  private loader = new GLTFLoader().register(embeddedImagesViaImg)
  private disposed = false

  constructor(private readonly anisotropy: number) {}

  /** Fetch and parse these models (and the legion's shared files); resolves when each is ready or has failed. */
  async preload(ids: readonly ModelId[], onProgress?: (f: number) => void): Promise<void> {
    const keys = new Set<string>(ids)
    if (ids.some(id => LEGION_IDS.has(id))) {
      keys.add('legion-anims')
      keys.add('legion-gear')
    }
    let done = 0
    await Promise.all(
      [...keys].map(k =>
        this.load(k).then(() => {
          done++
          onProgress?.(done / keys.size)
        }),
      ),
    )
  }

  /** How much of what was asked for so far has loaded or failed (0..1), for the loading bar. */
  settledFraction(): number {
    let n = 0
    let done = 0
    for (const s of this.status.values()) {
      n++
      if (s === 'ready' || s === 'failed') done++
    }
    return n ? done / n : 1
  }

  /** Start loading in the background (no await). */
  prefetch(ids: readonly ModelId[]): void {
    void this.preload(ids)
  }

  /** The model's file is loaded, or has failed (its stand-in will be used). */
  settled(id: ModelId): boolean {
    const s = this.status.get(id)
    return s === 'ready' || s === 'failed'
  }

  /** A dressed copy for one enemy. Uses the stand-in if the file failed or hasn't arrived. */
  create(spec: ModelSpec, edge: string): EnemyModel {
    const t = this.template(spec.id, spec.look)
    return new EnemyModel(this, t, spec, edge)
  }

  /** The legion's atlas with its cloth repainted (cached per colour). */
  atlas(src: THREE.Texture, cloth: string): THREE.Texture {
    const key = `${src.uuid}|${cloth}`
    let tex = this.atlases.get(key)
    if (!tex) {
      tex = repaintAtlas(src, cloth) ?? src
      if (tex !== src) {
        tex.anisotropy = this.anisotropy
        this.owned.push(tex)
      }
      this.atlases.set(key, tex)
    }
    return tex
  }

  /** A copy of a gear model (from the gear file, or procedural). */
  gear(id: GearId, look: Look): THREE.Object3D {
    if (id !== 'bomb' && id !== 'pack') {
      const file = this.gltf.get('legion-gear')
      const node = file?.scene.getObjectByName(id)
      if (node) return node.clone(true)
    }
    const key = `${id}|${look.glow}|${look.cloth ?? ''}`
    let g = this.gearFallback.get(key)
    if (!g) {
      g = buildGear(id, look)
      compactFallback(g)
      this.gearFallback.set(key, g)
      g.traverse(o => this.own(o))
    }
    return g.clone(true)
  }

  dispose(): void {
    this.disposed = true
    for (const f of this.gltf.values()) f.scene.traverse(o => this.own(o, true))
    for (const o of new Set(this.owned)) o.dispose()
    this.owned = []
    this.gltf.clear()
    this.templates.clear()
    this.fallbacks.clear()
    this.gearFallback.clear()
    this.atlases.clear()
  }

  /* ── internals ───────────────────────────────────────────── */

  private load(key: string): Promise<void> {
    const existing = this.pending.get(key)
    if (existing) return existing
    this.status.set(key, 'loading')
    const p = (async () => {
      const bytes = await loadBytes(BASE + FILES[key as keyof typeof FILES])
      try {
        if (bytes instanceof Error) throw bytes
        const gltf = await this.loader.parseAsync(bytes, '')
        if (this.disposed) return
        gltf.scene.updateMatrixWorld(true)
        this.gltf.set(key, { scene: gltf.scene, animations: gltf.animations })
        this.status.set(key, 'ready')
      } catch (err) {
        // A missing or broken file is not the player's problem: the stand-in takes its place.
        console.info(`[starfall] enemy model ${key} unavailable, using its procedural stand-in`, (err as Error)?.message ?? err)
        this.status.set(key, 'failed')
      }
    })()
    this.pending.set(key, p)
    return p
  }

  private template(id: ModelId, look: Look): Template {
    const ready = this.templates.get(id)
    if (ready) return ready
    const file = this.gltf.get(id)
    if (file) {
      const clips = new Map<string, THREE.AnimationClip>()
      const source = LEGION_IDS.has(id) ? (this.gltf.get('legion-anims')?.animations ?? []) : file.animations
      for (const c of source) clips.set(c.name, c)
      let skinned = false
      file.scene.traverse(o => {
        if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned = true
      })
      const t: Template = { scene: file.scene, clips, skinned, kind: 'clips', fallback: false }
      this.templates.set(id, t)
      return t
    }
    // Not loaded (yet, or ever): a stand-in, cached per look. Not cached as the template so a
    // later successful load is used by the next spawn.
    const key = `${id}|${look.glow}|${look.cloth ?? ''}`
    let fb = this.fallbacks.get(key)
    if (!fb) {
      const built = buildFallback(id, look)
      compactFallback(built.root)
      built.root.traverse(o => this.own(o))
      fb = { scene: built.root, clips: new Map(), skinned: false, kind: built.kind, fallback: true }
      this.fallbacks.set(key, fb)
    }
    return fb
  }

  private own(o: THREE.Object3D, all = false): void {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    this.owned.push(m.geometry)
    const mats = Array.isArray(m.material) ? m.material : [m.material]
    for (const mat of mats) {
      this.owned.push(mat)
      if (all) for (const v of Object.values(mat)) if (v instanceof THREE.Texture) this.owned.push(v)
    }
  }
}

/* ── one enemy's model ───────────────────────────────────────── */

export class EnemyModel {
  /** Placed by the enemy (feet at the origin, facing +Z). */
  readonly root = new THREE.Group()
  /** Scaled holder of the model (procedural poses and boss bone tweaks act under it). */
  readonly body: THREE.Object3D
  readonly puppet: Puppet
  readonly skin: SkinUniforms
  readonly fallback: boolean
  readonly meshes: THREE.Mesh[] = []
  private materials: THREE.Material[] = []
  private bones = new Map<string, THREE.Object3D>()
  private gearNodes = new Map<GearId, THREE.Object3D[]>()
  private shadows = true

  constructor(lib: ModelLib, t: Template, spec: ModelSpec, edge: string) {
    const look = spec.look
    this.fallback = t.fallback
    this.skin = skinUniforms(edge, look.rim, look.rimStrength ?? 0.5)
    const body = t.skinned ? cloneSkinned(t.scene) : t.scene.clone(true)
    body.scale.multiplyScalar(spec.scale)
    this.body = body
    this.root.add(body)
    body.traverse(o => this.register(o))
    this.dress(body, look, lib)
    for (const slot of spec.gear ?? []) {
      const bone = this.bones.get(slot.bone) ?? this.bones.get('chest') ?? body
      const g = lib.gear(slot.gear, look)
      if (slot.pos) g.position.set(slot.pos[0], slot.pos[1], slot.pos[2])
      if (slot.rot) g.rotation.set(slot.rot[0], slot.rot[1], slot.rot[2])
      if (slot.scale) g.scale.multiplyScalar(slot.scale)
      bone.add(g)
      this.dress(g, look, lib)
      const list = this.gearNodes.get(slot.gear) ?? []
      list.push(g)
      this.gearNodes.set(slot.gear, list)
      g.traverse(o => this.register(o))
    }
    this.puppet = t.kind === 'clips' ? new ClipPuppet(body, t.clips, CLIPS[spec.id]) : new ProcPuppet(this.bones, t.kind)
  }

  /** A bone, joint or gear node by name. */
  bone(name: string): THREE.Object3D | null {
    return this.bones.get(name) ?? null
  }

  gearOf(id: GearId): readonly THREE.Object3D[] {
    return this.gearNodes.get(id) ?? []
  }

  setShadows(on: boolean): void {
    if (on === this.shadows) return
    this.shadows = on
    for (const m of this.meshes) m.castShadow = on
  }

  dispose(): void {
    this.root.removeFromParent()
    for (const m of this.materials) m.dispose()
    this.materials = []
    this.puppet.dispose()
  }

  /**
   * Index a node by name. GLTFLoader makes duplicate names unique with a suffix ("Head_1") and a
   * rig's bone and the rigid mesh it carries often share a name: the bone wins.
   */
  private register(o: THREE.Object3D): void {
    if (!o.name) return
    const base = o.name.replace(/_\d+$/, '')
    const isBone = (o as THREE.Bone).isBone === true
    for (const key of base === o.name ? [o.name] : [o.name, base]) {
      const prev = this.bones.get(key)
      if (!prev || (isBone && !(prev as THREE.Bone).isBone)) this.bones.set(key, o)
    }
  }

  private dress(node: THREE.Object3D, look: Look, lib: ModelLib): void {
    node.traverse(o => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
      const src = mesh.material as THREE.MeshStandardMaterial
      const mat = (src.isMeshStandardMaterial ? src.clone() : new THREE.MeshStandardMaterial({ color: 0x888888 })) as THREE.MeshStandardMaterial
      const over = look.materials?.[src.name]
      if (over) {
        if (over.color) mat.color.set(over.color)
        if (over.emissive) mat.emissive.set(over.emissive)
        if (over.emissiveIntensity !== undefined) mat.emissiveIntensity = over.emissiveIntensity
        if (over.metalness !== undefined) mat.metalness = over.metalness
        if (over.roughness !== undefined) mat.roughness = over.roughness
      }
      if (src.name === 'Glow' || mesh.name === 'fuse-tip') {
        mat.color.set(look.glow)
        mat.emissive.set(look.glow)
        mat.emissiveIntensity = look.glowIntensity ?? 3
      }
      if (look.cloth && mat.map && src.name === 'skeleton') mat.map = lib.atlas(mat.map, look.cloth)
      if (src.name === 'skeleton') {
        mat.roughness = 0.78
        mat.metalness = 0
      }
      patchSkin(mat, this.skin)
      mesh.material = mat
      this.materials.push(mat)
      this.meshes.push(mesh)
      if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) {
        // Culling uses a sphere from one pose: pad it so swinging limbs never pop out at the edges.
        const sk = mesh as THREE.SkinnedMesh
        sk.computeBoundingSphere()
        if (sk.boundingSphere) sk.boundingSphere.radius *= 1.6
      }
    })
  }
}

/* ── puppets ─────────────────────────────────────────────────── */

export interface PlayOpts {
  /** Cross-fade seconds. */
  fade?: number
  /** Play once and hold the last frame (`done` turns true). */
  once?: boolean
  speed?: number
  /** Restart even if this animation is already playing. */
  restart?: boolean
}

export interface Puppet {
  readonly current: AnimName
  /** The one-shot has reached its end. */
  readonly done: boolean
  /** 0..1 through the current animation (one-shots) or its loop. */
  readonly progress: number
  play(name: AnimName, opts?: PlayOpts): void
  setSpeed(speed: number): void
  update(dt: number): void
  dispose(): void
}

class ClipPuppet implements Puppet {
  current: AnimName = 'idle'
  private mixer: THREE.AnimationMixer
  private actions = new Map<string, THREE.AnimationAction>()
  private action: THREE.AnimationAction | null = null
  private once = false

  constructor(root: THREE.Object3D, private clips: Map<string, THREE.AnimationClip>, private map: ClipMap) {
    this.mixer = new THREE.AnimationMixer(root)
  }

  get done(): boolean {
    const a = this.action
    return !a || (this.once && a.time >= a.getClip().duration - 1e-3)
  }

  get progress(): number {
    const a = this.action
    if (!a) return 1
    const d = a.getClip().duration
    return d > 0 ? Math.min(1, (a.time % (d + 1e-6)) / d) : 1
  }

  play(name: AnimName, o: PlayOpts = {}): void {
    if (name === this.current && this.action && !o.restart) {
      if (o.speed !== undefined) this.action.timeScale = o.speed
      return
    }
    const clip = this.resolve(name)
    this.current = name
    if (!clip) return
    let next = this.actions.get(clip.name)
    if (!next) {
      next = this.mixer.clipAction(clip)
      this.actions.set(clip.name, next)
    }
    const fade = o.fade ?? 0.18
    this.once = !!o.once
    next.reset()
    next.setLoop(o.once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity)
    next.clampWhenFinished = !!o.once
    next.timeScale = o.speed ?? 1
    next.setEffectiveWeight(1)
    if (this.action && this.action !== next) {
      next.crossFadeFrom(this.action, fade, false)
    } else if (!this.action) {
      next.fadeIn(Math.min(fade, 0.05))
    }
    next.play()
    this.action = next
  }

  setSpeed(speed: number): void {
    if (this.action) this.action.timeScale = speed
  }

  update(dt: number): void {
    this.mixer.update(dt)
  }

  dispose(): void {
    this.mixer.stopAllAction()
    this.mixer.uncacheRoot(this.mixer.getRoot())
    this.actions.clear()
  }

  private resolve(name: AnimName): THREE.AnimationClip | null {
    let n: AnimName | undefined = name
    for (let i = 0; i < 6 && n; i++) {
      const clipName = this.map[n]
      const clip = clipName ? this.clips.get(clipName) : undefined
      if (clip) return clip
      n = STAND_IN[n]
    }
    return this.clips.get(this.map.idle ?? '') ?? null
  }
}

/**
 * Acts the semantic animations out on a stand-in's joints: walk and run cycles, wing beats,
 * strikes, casts, a collapse. Joints are eased toward each frame's target, so changes blend.
 */
class ProcPuppet implements Puppet {
  current: AnimName = 'idle'
  private t = 0
  private speed = 1
  private once = false
  private readonly j: Partial<Record<string, THREE.Object3D>> = {}
  private readonly rest = new Map<THREE.Object3D, THREE.Vector3>()
  private readonly hipsY: number

  constructor(bones: Map<string, THREE.Object3D>, private kind: RigKind) {
    for (const name of ['hips', 'chest', 'head', 'armL', 'armR', 'foreL', 'foreR', 'legL', 'legR', 'shinL', 'shinR', 'wingL', 'wingR', 'tail']) {
      const o = bones.get(name)
      if (o) {
        this.j[name] = o
        this.rest.set(o, o.position.clone())
      }
    }
    this.hipsY = this.j.hips?.position.y ?? 0
  }

  get duration(): number {
    switch (this.current) {
      case 'death': return 1.2
      case 'spawn': return 1.4
      case 'hit': case 'blockHit': return 0.45
      case 'slash': case 'chop': case 'bash': case 'punch': case 'headbutt': case 'shoot': case 'throw': case 'castShoot': return 0.7
      case 'reload': case 'summon': case 'raise': case 'taunt': case 'dodge': return 1.1
      default: return 1
    }
  }

  get done(): boolean {
    return this.once && this.t >= this.duration
  }

  get progress(): number {
    return Math.min(1, this.t / this.duration)
  }

  play(name: AnimName, o: PlayOpts = {}): void {
    if (o.speed !== undefined) this.speed = o.speed
    if (name === this.current && !o.restart) return
    this.current = name
    this.once = !!o.once
    this.t = 0
  }

  setSpeed(speed: number): void {
    this.speed = speed
  }

  update(dt: number): void {
    this.t += dt * this.speed
    const k = 1 - Math.exp(-14 * dt)
    const t = this.t
    const u = this.progress
    const name = this.current
    const swing = (a: number) => Math.sin(u * Math.PI) * a
    const set = (name: string, x: number, y = 0, z = 0) => {
      const o = this.j[name]
      if (!o) return
      o.rotation.x += (x - o.rotation.x) * k
      o.rotation.y += (y - o.rotation.y) * k
      o.rotation.z += (z - o.rotation.z) * k
    }
    let bob = 0
    let lean = 0
    if (this.kind === 'turret') return
    if (this.kind === 'flyer') {
      const fast = name === 'flyFast' ? 2 : 1
      const flap = Math.sin(t * 6 * fast)
      set('wingL', 0, 0, flap * 0.7)
      set('wingR', 0, 0, -flap * 0.7)
      set('tail', Math.sin(t * 2.2) * 0.2, Math.sin(t * 1.7) * 0.35)
      set('head', name === 'headbutt' ? swing(0.8) : Math.sin(t * 1.5) * 0.08)
      bob = Math.sin(t * 6 * fast + 1.2) * 0.12
      if (name === 'death') lean = u * 1.4
      if (name === 'hit') lean = -swing(0.4)
    } else {
      const walk = name === 'walk' ? 1 : name === 'run' ? 1.7 : name === 'sprint' ? 2.2 : 0
      const cyc = t * (walk ? 5 + walk * 2 : 0)
      const legA = walk ? Math.sin(cyc) * (0.35 + walk * 0.18) : 0
      set('legL', legA)
      set('legR', -legA)
      set('shinL', walk ? Math.max(0, -Math.sin(cyc)) * 0.9 : 0)
      set('shinR', walk ? Math.max(0, Math.sin(cyc)) * 0.9 : 0)
      bob = walk ? Math.abs(Math.sin(cyc)) * 0.06 * walk : Math.sin(t * 2.2) * 0.02
      let armL = walk ? -legA * 0.8 : -0.1
      let armR = walk ? legA * 0.8 : -0.1
      let foreL = -0.25
      let foreR = -0.25
      let spine = Math.sin(t * 2.2) * 0.03 + walk * 0.08
      let head = 0
      switch (name) {
        case 'combat': case 'aim': case 'block':
          armL = -0.9; armR = -1.1; foreL = -0.6; foreR = -0.4; spine = 0.18
          if (name === 'block') { armL = -1.4; foreL = -1.2 }
          break
        case 'slash': case 'chop': case 'bash': case 'punch': case 'headbutt':
          armR = -0.6 - swing(1.6); armL = -0.4 - swing(0.8); spine = 0.1 + swing(0.35)
          break
        case 'shoot': case 'castShoot': case 'throw':
          armR = -1.4 + swing(0.5); foreR = -0.1; spine = 0.08 - swing(0.15)
          break
        case 'cast': case 'summon': case 'raise': case 'taunt':
          armL = armR = -2.4 + Math.sin(t * 4) * 0.15; foreL = foreR = -0.3; head = -0.2
          break
        case 'reload':
          armR = -0.8; foreR = -1.4 + Math.sin(t * 6) * 0.3
          break
        case 'hit': case 'blockHit': case 'dodge':
          spine = -swing(0.45); head = -swing(0.3)
          break
        case 'slump':
          spine = 0.6; head = 0.4; armL = armR = 0.2
          break
        case 'death':
          lean = Math.min(1, u * 1.6) * -1.45
          break
        case 'spawn':
          bob = -(1 - u) * (this.hipsY + 0.2)
          break
      }
      if (this.kind === 'floater') bob += Math.sin(t * 2) * 0.1
      set('armL', armL, 0, 0.12)
      set('armR', armR, 0, -0.12)
      set('foreL', foreL)
      set('foreR', foreR)
      set('chest', spine)
      set('head', head)
    }
    const hips = this.j.hips
    if (hips) {
      const rest = this.rest.get(hips)!
      const y = rest.y + bob - (name === 'death' ? Math.min(1, u * 1.6) * this.hipsY * 0.8 : 0)
      hips.position.y += (y - hips.position.y) * k
      hips.rotation.x += (lean - hips.rotation.x) * k
    }
  }

  dispose(): void {
    /* joints belong to the model */
  }
}
