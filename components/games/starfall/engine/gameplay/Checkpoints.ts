/**
 * Checkpoints — wooden lantern posts that light up when the player reaches them.
 *
 * Static parts (stone plinth, post, arm, brace, rocks) are batched with a ZoneKit.
 * The iron lanterns hang from the arm and sway gently (two InstancedMeshes: iron
 * frame + glass panes whose warm glow is a per-instance attribute). Two real
 * PointLights follow the nearest lit lanterns; the light count never changes, so
 * no shader is ever recompiled.
 */
import * as THREE from 'three'
import type { GroundHit, WallPush } from '../collision'
import type { Ctx, ICheckpoints } from '../types'
import { CHECKPOINTS, type CheckpointDef } from '../world/level'
import { heightAt, waterLevelAt } from '../world/heightfield'
import { ZoneKit } from '../world/zones/kit'
import { Billboards, FLARE } from './parts/Billboards'
import { LANTERN_DROP, lanternFrameGeometry, lanternGlassGeometry } from './parts/shapes'
import { glowTexture, rng, supportHeight } from './parts/util'

const REACH = 2.6
const SPAWN_AHEAD = 1.6
const PLAYER_RADIUS = 0.35
/** Respawn spots tried in order, as [side, ahead] metres from the post (side −1 = away from the arm). */
const SPAWN_SPOTS: ReadonlyArray<readonly [number, number]> = [[-1, SPAWN_AHEAD], [-1, 1.0], [0, SPAWN_AHEAD], [0, 1.0], [0, -SPAWN_AHEAD]]
const ARM_REACH = 0.64
const ARM_Y = 2.38
const LIGHT_SLOTS = 2
const LIGHT_RANGE = 45
const LIGHT_INTENSITY = 7
const IGNITE_TIME = 0.7
const WARM = new THREE.Color('#ffb15a')

interface Lantern {
  def: CheckpointDef
  ground: number
  /** Hang point (end of the arm). */
  hang: THREE.Vector3
  /** Glass centre, updated with the sway. */
  centre: THREE.Vector3
  lit: boolean
  /** 0..1 (overshoots during ignition). */
  level: number
  litT: number
  /** Extra swing after being reached. */
  kick: number
  seed: number
}

interface LightSlot {
  light: THREE.PointLight
  target: number
  level: number
}

export class Checkpoints implements ICheckpoints {
  private kit: ZoneKit | null = null
  private lanterns: Lantern[] = []
  private frame: THREE.InstancedMesh | null = null
  private glass: THREE.InstancedMesh | null = null
  private glowAttr: THREE.InstancedBufferAttribute | null = null
  private glows: Billboards | null = null
  private glowTex: { texture: THREE.Texture; owned: boolean } | null = null
  private slots: LightSlot[] = []
  private unsub: (() => void) | null = null
  private readonly want = [-1, -1]
  private readonly spawnHit: GroundHit = { y: 0, nx: 0, ny: 1, nz: 0, surface: 'grass', collider: null, water: 0 }
  private readonly spawnPush: WallPush = { x: 0, z: 0, hit: false, nx: 0, nz: 0 }
  private readonly spawnPos = { x: 0, y: 0, z: 0 }

  private readonly m = new THREE.Matrix4()
  private readonly q = new THREE.Quaternion()
  private readonly e = new THREE.Euler()
  private readonly one = new THREE.Vector3(1, 1, 1)
  private readonly squash = new THREE.Vector3(1, 0.7, 1.15)
  private readonly v = new THREE.Vector3()
  private readonly drop = new THREE.Vector3(0, -LANTERN_DROP, 0)

  constructor(private ctx: Ctx) {}

  init(): void {
    const ctx = this.ctx
    const kit = new ZoneKit(ctx, 'checkpoints')
    this.kit = kit
    const rand = rng(0xc4ec)

    this.lanterns = CHECKPOINTS.map((def, i) => {
      const g = supportHeight(ctx, def.x, def.z, heightAt(def.x, def.z) + 0.3, 0.3)
      const yaw = def.yaw
      const cs = Math.cos(yaw)
      const sn = Math.sin(yaw)
      // local (lx, lz) → world, matching Object3D.rotation.y = yaw
      const wx = (lx: number, lz: number) => def.x + lx * cs + lz * sn
      const wz = (lx: number, lz: number) => def.z - lx * sn + lz * cs

      kit.cylinder({ x: def.x, y: g - 0.18, z: def.z, r: 0.34, rTop: 0.27, h: 0.45, segments: 9, mat: 'stone', uvScale: 0.8, collide: true })
      kit.cylinder({ x: def.x, y: g + 0.22, z: def.z, r: 0.085, rTop: 0.072, h: 2.46, segments: 8, mat: 'darkPlanks', uvScale: 0.8, collide: { surface: 'wood' } })
      const cap = new THREE.ConeGeometry(0.11, 0.14, 4)
      kit.add(cap, 'darkPlanks', this.m.compose(this.v.set(def.x, g + 2.75, def.z), this.q.setFromEuler(this.e.set(0, yaw + Math.PI / 4, 0)), this.one))
      kit.box({ x: wx(0.32, 0), y: g + ARM_Y, z: wz(0.32, 0), w: 0.74, h: 0.075, d: 0.075, yaw, mat: 'darkPlanks', uvScale: 0.8 })
      // diagonal brace from the post up to the arm
      const brace = new THREE.BoxGeometry(0.5, 0.055, 0.055)
      this.q.setFromEuler(this.e.set(0, yaw, Math.atan2(0.4, 0.3), 'YXZ'))
      kit.add(brace, 'darkPlanks', this.m.compose(this.v.set(wx(0.2, 0), g + ARM_Y - 0.19, wz(0.2, 0)), this.q, this.one))
      this.e.order = 'XYZ'
      // iron bracket at the arm's end
      kit.box({ x: wx(ARM_REACH, 0), y: g + ARM_Y - 0.03, z: wz(ARM_REACH, 0), w: 0.06, h: 0.13, d: 0.1, yaw, mat: 'metal', uvScale: 1 })
      // a few rocks huddled around the plinth
      for (let k = 0; k < 3; k++) {
        const a = yaw + 2.2 + k * 1.6 + rand() * 0.6
        const r = 0.46 + rand() * 0.12
        const s = 0.1 + rand() * 0.08
        const rock = new THREE.DodecahedronGeometry(s, 0)
        const x = def.x + Math.cos(a) * r
        const z = def.z + Math.sin(a) * r
        this.q.setFromEuler(this.e.set(rand() * 3, rand() * 3, rand() * 3))
        kit.add(rock, 'rock', this.m.compose(this.v.set(x, heightAt(x, z) + s * 0.25, z), this.q, this.squash))
      }
      return {
        def,
        ground: g,
        hang: new THREE.Vector3(wx(ARM_REACH, 0), g + ARM_Y - 0.09, wz(ARM_REACH, 0)),
        centre: new THREE.Vector3(),
        lit: false,
        level: 0,
        litT: IGNITE_TIME,
        kick: 0,
        seed: i * 1.37 + rand() * 10,
      }
    })
    kit.finalize()

    // swaying lanterns
    const n = this.lanterns.length
    const frame = new THREE.InstancedMesh(lanternFrameGeometry(), kit.mat('metal', { color: 0x3a332c, roughness: 0.55, key: 'lantern' }), n)
    frame.name = 'lantern-frames'
    frame.castShadow = true
    frame.frustumCulled = false
    const glassGeo = lanternGlassGeometry()
    this.glowAttr = new THREE.InstancedBufferAttribute(new Float32Array(n), 1).setUsage(THREE.DynamicDrawUsage)
    glassGeo.setAttribute('aGlow', this.glowAttr)
    const glass = new THREE.InstancedMesh(glassGeo, lanternGlassMaterial(), n)
    glass.name = 'lantern-glass'
    glass.frustumCulled = false
    this.frame = frame
    this.glass = glass

    this.glowTex = glowTexture(ctx)
    const glows = new Billboards(n * 2, this.glowTex.texture, { bias: 0.45, name: 'lantern-glows' })
    glows.alloc(n * 2)
    for (let i = 0; i < n; i++) {
      glows.set(i * 2, 0, 0, 0, 0, WARM.r, WARM.g, WARM.b, 0)
      glows.set(i * 2 + 1, 0, 0, 0, 0, 1, 0.82, 0.55, 0, FLARE)
    }
    this.glows = glows

    for (let i = 0; i < LIGHT_SLOTS; i++) {
      const light = new THREE.PointLight(WARM, 0, 14, 2)
      light.name = `lantern-light-${i}`
      this.slots.push({ light, target: -1, level: 0 })
      ctx.scene.add(light)
    }
    ctx.scene.add(frame, glass, glows.mesh)

    this.unsub = ctx.bus.on('checkpoint', ev => {
      const i = this.lanterns.findIndex(l => l.def.id === ev.id)
      if (i < 0) return
      const l = this.lanterns[i]
      l.kick = 1
      if (!l.lit) {
        l.lit = true
        l.litT = 0
      }
    })
    this.syncWithSave()
  }

  /* ── API ─────────────────────────────────────────────────── */

  syncWithSave(): void {
    const save = this.ctx.game.save
    for (const l of this.lanterns) {
      l.lit = save.checkpoints.includes(l.def.id)
      l.level = l.lit ? 1 : 0
      l.litT = IGNITE_TIME
      l.kick = 0
    }
    this.render(0)
  }

  /**
   * Where the hero reappears: a little ahead of the post and off to the side away from the lantern
   * arm, so the post never stands between him and the gameplay camera straight behind him. Spots
   * that are wet, too steep or inside something fall back to ones straight ahead / behind the post.
   */
  spawnPoint(id: string): { x: number; y: number; z: number; yaw: number } {
    const c = CHECKPOINTS.find(x => x.id === id) ?? CHECKPOINTS[0]
    const fx = Math.sin(c.yaw)
    const fz = Math.cos(c.yaw)
    const col = this.ctx.collision
    for (const [side, ahead] of SPAWN_SPOTS) {
      // local +x (the arm's side) is (cos yaw, −sin yaw) in world space
      const x = c.x + side * fz + ahead * fx
      const z = c.z - side * fx + ahead * fz
      const g = col.groundAt(x, z, heightAt(x, z) + 1.2, PLAYER_RADIUS, 0.45, this.spawnHit)
      if (waterLevelAt(x, z) - g.y >= 0.2 || (!g.collider && g.ny < 0.72)) continue
      this.spawnPos.x = x
      this.spawnPos.y = g.y
      this.spawnPos.z = z
      if (col.pushOut(this.spawnPos, PLAYER_RADIUS, 1.6, 0.45, this.spawnPush).hit) continue
      return { x, y: g.y, z, yaw: c.yaw }
    }
    return { x: c.x + fx * SPAWN_AHEAD, y: heightAt(c.x, c.z), z: c.z + fz * SPAWN_AHEAD, yaw: c.yaw }
  }

  /* ── frame ───────────────────────────────────────────────── */

  update(dt: number): void {
    if (!this.glows) return
    const ctx = this.ctx
    // Not while dying or fading out to respawn: a tumbling body must not move the respawn point.
    if (ctx.game.phase === 'playing' && ctx.player.controlEnabled && ctx.player.hp > 0) {
      const p = ctx.player.position
      const current = ctx.game.save.checkpoint
      for (const l of this.lanterns) {
        if (l.def.id === current) continue
        const dx = p.x - l.def.x
        const dz = p.z - l.def.z
        if (dx * dx + dz * dz < REACH * REACH && Math.abs(p.y - l.ground) < 2.5) ctx.game.reachCheckpoint(l.def.id)
      }
    }
    this.render(dt)
  }

  private render(dt: number): void {
    const frame = this.frame
    const glass = this.glass
    const glows = this.glows
    if (!frame || !glass || !glows) return
    const t = this.ctx.clock.t
    const glow = this.glowAttr!.array as Float32Array
    const current = this.ctx.game.save.checkpoint

    for (let i = 0; i < this.lanterns.length; i++) {
      const l = this.lanterns[i]
      if (l.lit && l.litT < IGNITE_TIME) {
        l.litT += dt
        const u = Math.min(1, l.litT / IGNITE_TIME)
        // ease-out-back: a bright catch before settling
        const c1 = 2.2
        l.level = 1 + (c1 + 1) * (u - 1) ** 3 + c1 * (u - 1) ** 2
      } else {
        l.level = l.lit ? 1 : 0
      }
      l.kick = Math.max(0, l.kick - dt * 0.6)

      const amp = 0.03 + l.kick * 0.22
      const ax = Math.sin(t * 1.3 + l.seed) * amp
      const az = Math.sin(t * 0.93 + l.seed * 2.1) * amp * 1.2
      this.q.setFromEuler(this.e.set(ax, l.def.yaw, az))
      this.m.compose(l.hang, this.q, this.one)
      frame.setMatrixAt(i, this.m)
      glass.setMatrixAt(i, this.m)
      l.centre.copy(this.drop).applyMatrix4(this.m)

      const flicker = l.lit ? 0.86 + 0.08 * Math.sin(t * 13.1 + l.seed) + 0.06 * Math.sin(t * 23.7 + l.seed * 3.3) : 0
      const level = Math.max(0, l.level) * flicker
      glow[i] = level
      const c = l.centre
      const big = l.def.id === current ? 1.2 : 1
      glows.move(i * 2, c.x, c.y, c.z, level > 0 ? 1.7 * big : 0)
      glows.intensity(i * 2, 0.5 * level)
      glows.move(i * 2 + 1, c.x, c.y - 0.03, c.z, level > 0 ? 0.55 : 0)
      glows.intensity(i * 2 + 1, 0.75 * level)
    }
    frame.instanceMatrix.needsUpdate = true
    glass.instanceMatrix.needsUpdate = true
    this.glowAttr!.needsUpdate = true
    glows.commit()
    this.updateLights(dt)
  }

  /** Hand the two real lights to the nearest lit lanterns, cross-fading on change. */
  private updateLights(dt: number): void {
    const p = this.ctx.player.position
    let b0 = -1
    let b1 = -1
    let d0 = LIGHT_RANGE * LIGHT_RANGE
    let d1 = d0
    for (let i = 0; i < this.lanterns.length; i++) {
      const l = this.lanterns[i]
      if (!l.lit) continue
      const dx = l.hang.x - p.x
      const dz = l.hang.z - p.z
      const d = dx * dx + dz * dz
      if (d < d0) {
        b1 = b0
        d1 = d0
        b0 = i
        d0 = d
      } else if (d < d1) {
        b1 = i
        d1 = d
      }
    }
    this.want[0] = b0
    this.want[1] = b1
    for (const s of this.slots) {
      const wanted = s.target >= 0 && (s.target === b0 || s.target === b1)
      if (wanted) s.level = Math.min(1, s.level + dt * 2.5)
      else if (s.target >= 0) {
        s.level -= dt * 3
        if (s.level <= 0) s.target = -1
      }
    }
    for (const w of this.want) {
      if (w < 0 || this.slots.some(s => s.target === w)) continue
      const free = this.slots.find(s => s.target < 0)
      if (!free) break
      free.target = w
      free.level = dt > 0 ? 0 : 1
    }
    for (const s of this.slots) {
      if (s.target < 0) {
        s.light.intensity = 0
        continue
      }
      const l = this.lanterns[s.target]
      s.light.position.copy(l.centre)
      s.light.position.y -= 0.15
      s.light.intensity = LIGHT_INTENSITY * s.level * Math.max(0, l.level) * (0.9 + 0.1 * Math.sin(this.ctx.clock.t * 17 + l.seed))
    }
  }

  dispose(): void {
    this.unsub?.()
    this.unsub = null
    for (const mesh of [this.frame, this.glass]) {
      if (!mesh) continue
      mesh.removeFromParent()
      mesh.geometry.dispose()
      mesh.dispose()
    }
    ;(this.glass?.material as THREE.Material | undefined)?.dispose()
    this.frame = this.glass = null
    for (const s of this.slots) {
      s.light.removeFromParent()
      s.light.dispose()
    }
    this.slots = []
    this.glows?.dispose()
    this.glows = null
    if (this.glowTex?.owned) this.glowTex.texture.dispose()
    this.glowTex = null
    this.kit?.dispose()
    this.kit = null
  }
}

/** Dark cold glass that fills with a warm hot spot as the lantern is lit (per-instance `aGlow`). */
function lanternGlassMaterial(): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: 0x2a3640, roughness: 0.12, metalness: 0.35 })
  const warm = new THREE.Color('#ffa24a').multiplyScalar(2.4)
  mat.onBeforeCompile = shader => {
    shader.uniforms.uWarm = { value: warm }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aGlow;\nvarying float vLit;\nvarying vec2 vPane;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLit = aGlow;\nvPane = uv;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uWarm;\nvarying float vLit;\nvarying vec2 vPane;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        vec2 pq = (vPane - vec2(0.5, 0.42)) * vec2(1.7, 1.2);
        float spot = 1.0 - smoothstep(0.0, 0.85, length(pq));
        totalEmissiveRadiance += uWarm * vLit * (0.3 + 1.6 * spot * spot);
        diffuseColor.rgb *= 1.0 - 0.7 * min(vLit, 1.0);`,
      )
  }
  mat.customProgramCacheKey = () => 'starfall-lantern-glass'
  return mat
}
