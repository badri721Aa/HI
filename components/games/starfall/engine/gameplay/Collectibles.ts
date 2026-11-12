/**
 * Collectibles — star shards, sparks and hearts.
 *
 *  - Shards: faceted glowing stars (one InstancedMesh), each with a soft glow,
 *    a slowly turning star flare, orbiting motes and a tall light pillar that
 *    guides the player from across the island.
 *  - Sparks: small golden gems laid along SPARK_TRAILS (+ SPARK_SINGLES) in a
 *    deterministic order (index = save id). Spin/bob run in the shader; they are
 *    pulled toward the player within 2.5 m and collected at 0.9 m.
 *  - Hearts: rosy heart gems that restore health (only taken when hurt).
 *
 * Draw calls: shard stars, pillars, spark gems, heart gems, one billboard batch.
 */
import * as THREE from 'three'
import type { Ctx, ICollectibles } from '../types'
import { HEARTS, SHARDS, SPARK_SINGLES, SPARK_TRAILS } from '../world/level'
import { heightAt, waterLevelAt } from '../world/heightfield'
import { Billboards, FLARE, GLOW } from './parts/Billboards'
import { gemMaterial, pillarMaterial } from './parts/materials'
import { heartGeometry, sparkGeometry, starGeometry } from './parts/shapes'
import { glowTexture, supportHeight } from './parts/util'

/** Per-shard tint (the core stays warm white). Indexed like SHARDS. */
const SHARD_TINTS = ['#7fdcf5', '#a8f0cf', '#e2f08a', '#b9b6ff', '#8cc3ff', '#ffbfe0', '#ffc77a']
const SPARK_COLOR = '#ffc44d'
const HEART_COLOR = '#ec4f72'

/** Chest height above the feet used for pickup distances. */
const CHEST = 1.0
const SHARD_PICKUP = 1.3
const SPARK_MAGNET = 2.5
const SPARK_COLLECT = 0.9
const HEART_PICKUP = 1.2

const MOTES = 4
/** Billboard slots per shard: glow, flare, motes. */
const SHARD_SLOTS = 2 + MOTES
const PILLAR_HEIGHT = 64
const PILLAR_RADIUS = 0.42
const SHARD_COLLECT_TIME = 0.45
const HEART_COLLECT_TIME = 0.25

const IDLE = 0
const PULLED = 1
const COLLECTING = 2
const GONE = 3

interface Shard {
  base: THREE.Vector3
  out: THREE.Vector3
  tint: THREE.Color
  state: number
  t: number
  /** Current (bobbing) centre, used for pickup and effects. */
  x: number
  y: number
  z: number
}

interface Spark {
  bx: number
  by: number
  bz: number
  x: number
  y: number
  z: number
  state: number
  pull: number
}

interface Heart {
  x: number
  y: number
  z: number
  state: number
  t: number
}

/** Spark positions in save-id order. Exported for tools and tests. */
export function sparkLayout(ground: (x: number, z: number) => number): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = []
  for (const trail of SPARK_TRAILS) {
    const pts = trail.points
    const seg: number[] = []
    let total = 0
    for (let i = 0; i < pts.length - 1; i++) {
      const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][2] - pts[i][2])
      seg.push(l)
      total += l
    }
    const n = Math.floor(total / trail.spacing + 1e-6) + 1
    for (let k = 0; k < n; k++) {
      let d = Math.min(total, k * trail.spacing)
      let i = 0
      while (i < seg.length - 1 && d > seg[i]) {
        d -= seg[i]
        i++
      }
      const t = seg[i] > 0 ? Math.min(1, d / seg[i]) : 0
      const a = pts[i]
      const b = pts[Math.min(i + 1, pts.length - 1)]
      const x = a[0] + (b[0] - a[0]) * t
      const yo = a[1] + (b[1] - a[1]) * t
      const z = a[2] + (b[2] - a[2]) * t
      out.push([x, trail.abs ? yo : ground(x, z) + yo, z])
    }
  }
  for (const [x, y, z] of SPARK_SINGLES) out.push([x, y, z])
  return out
}

export class Collectibles implements ICollectibles {
  sparkTotal = 0

  private readonly time: THREE.IUniform<number> = { value: 0 }
  private shards: Shard[] = []
  private sparks: Spark[] = []
  private hearts: Heart[] = []

  private starMesh: THREE.InstancedMesh | null = null
  private pillarMesh: THREE.InstancedMesh | null = null
  private sparkMesh: THREE.InstancedMesh | null = null
  private heartMesh: THREE.InstancedMesh | null = null
  private glows: Billboards | null = null
  private glowTex: { texture: THREE.Texture; owned: boolean } | null = null
  private shardSlot = 0
  private sparkSlot = 0
  private heartSlot = 0
  private sparkDirty = false
  private heartDirty = false

  // scratch
  private readonly m = new THREE.Matrix4()
  private readonly q = new THREE.Quaternion()
  private readonly e = new THREE.Euler()
  private readonly p = new THREE.Vector3()
  private readonly s = new THREE.Vector3()
  /** Where a spark being drawn to the player was and is this frame (its trail). */
  private readonly trailFrom = new THREE.Vector3()
  private readonly trailTo = new THREE.Vector3()
  private readonly c = new THREE.Color()
  private readonly white = new THREE.Color(1, 0.97, 0.9)

  constructor(private ctx: Ctx) {}

  init(): void {
    const ctx = this.ctx
    const sun = ctx.env.sunDirection

    // ── layout ──
    this.shards = SHARDS.map((d, i) => {
      const tint = new THREE.Color(SHARD_TINTS[i % SHARD_TINTS.length])
      return { base: new THREE.Vector3(d.x, d.y, d.z), out: new THREE.Vector3(), tint, state: IDLE, t: 0, x: d.x, y: d.y, z: d.z }
    })
    const ground = (x: number, z: number) => Math.max(supportHeight(ctx, x, z, heightAt(x, z) + 0.3, 0.2), waterLevelAt(x, z))
    this.sparks = sparkLayout(ground).map(([x, y, z]) => ({ bx: x, by: y, bz: z, x, y, z, state: IDLE, pull: 0 }))
    this.sparkTotal = this.sparks.length
    this.hearts = HEARTS.map(([x, z]) => ({ x, y: ground(x, z) + 1, z, state: IDLE, t: 0 }))

    // ── shards ──
    const star = new THREE.InstancedMesh(starGeometry(), gemMaterial(this.time, sun, { core: 1.4, coreRadius: 0.36, rim: 0.9 }), this.shards.length)
    star.name = 'shards'
    star.frustumCulled = false
    const cylinder = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true)
    cylinder.translate(0, 0.5, 0)
    const pillar = new THREE.InstancedMesh(cylinder, pillarMaterial(this.time), this.shards.length)
    pillar.name = 'shard-pillars'
    pillar.frustumCulled = false
    pillar.renderOrder = 1
    this.shards.forEach((sh, i) => {
      star.setColorAt(i, sh.tint)
      pillar.setColorAt(i, this.c.copy(sh.tint).lerp(this.white, 0.15))
    })
    this.starMesh = star
    this.pillarMesh = pillar

    // ── sparks ──
    const spark = new THREE.InstancedMesh(sparkGeometry(), gemMaterial(this.time, sun, { spin: 2.4, bob: 0.07, core: 1.2, coreRadius: 0.2, rim: 1.0 }), Math.max(1, this.sparks.length))
    spark.name = 'sparks'
    spark.frustumCulled = false
    spark.count = this.sparks.length
    this.sparkMesh = spark

    // ── hearts ──
    const heart = new THREE.InstancedMesh(heartGeometry(), gemMaterial(this.time, sun, { face: true, spin: 1.3, bob: 0.1, core: 0.75, coreRadius: 0.3, rim: 0.75, color: HEART_COLOR }), Math.max(1, this.hearts.length))
    heart.name = 'hearts'
    heart.frustumCulled = false
    heart.count = this.hearts.length
    this.heartMesh = heart

    // ── glows ──
    this.glowTex = glowTexture(ctx)
    const glows = new Billboards(this.shards.length * SHARD_SLOTS + this.sparks.length + this.hearts.length, this.glowTex.texture, { name: 'collectible-glows' })
    this.shardSlot = glows.alloc(this.shards.length * SHARD_SLOTS)
    this.sparkSlot = glows.alloc(this.sparks.length)
    this.heartSlot = glows.alloc(this.hearts.length)
    const gold = this.c.set(SPARK_COLOR)
    this.sparks.forEach((sp, i) => glows.set(this.sparkSlot + i, sp.x, sp.y, sp.z, 0.85, gold.r, gold.g, gold.b, 0.5))
    const pink = this.c.set(HEART_COLOR)
    this.hearts.forEach((h, i) => glows.set(this.heartSlot + i, h.x, h.y, h.z, 1.5, pink.r, pink.g, pink.b, 0.5))
    this.shards.forEach((sh, i) => {
      const k = this.shardSlot + i * SHARD_SLOTS
      const t = sh.tint
      glows.set(k, sh.x, sh.y, sh.z, 2.4, t.r, t.g, t.b, 0.2, GLOW)
      this.c.copy(t).lerp(this.white, 0.6)
      glows.set(k + 1, sh.x, sh.y, sh.z, 1.5, this.c.r, this.c.g, this.c.b, 0.2, FLARE)
      for (let j = 0; j < MOTES; j++) glows.set(k + 2 + j, sh.x, sh.y, sh.z, 0.13, this.c.r, this.c.g, this.c.b, 0.5, GLOW)
    })
    this.glows = glows

    ctx.scene.add(pillar, star, spark, heart, glows.mesh)
    this.writeSparkMatrices()
    this.writeHeartMatrices()
    this.update(0)
  }

  /* ── API ─────────────────────────────────────────────────── */

  syncWithSave(): void {
    const save = this.ctx.game.save
    const taken = new Set(save.sparks)
    this.shards.forEach((sh, i) => {
      sh.state = save.shards[i] ? GONE : IDLE
      sh.t = 0
    })
    this.sparks.forEach((sp, i) => {
      sp.state = taken.has(i) ? GONE : IDLE
      sp.pull = 0
      sp.x = sp.bx
      sp.y = sp.by
      sp.z = sp.bz
    })
    const hearts = new Set(save.hearts)
    this.hearts.forEach((h, i) => {
      h.state = hearts.has(i) ? GONE : IDLE
      h.t = 0
    })
    this.writeSparkMatrices()
    this.writeHeartMatrices()
    this.update(0)
  }

  shardPosition(index: number): THREE.Vector3 {
    const sh = this.shards[index]
    if (!sh) {
      const d = SHARDS[index] ?? SHARDS[0]
      return new THREE.Vector3(d.x, d.y, d.z)
    }
    return sh.out.copy(sh.base)
  }

  hideShard(index: number): void {
    const sh = this.shards[index]
    if (!sh) return
    sh.state = GONE
    this.update(0)
  }

  /* ── frame ───────────────────────────────────────────────── */

  update(dt: number): void {
    if (!this.glows) return
    const ctx = this.ctx
    const t = ctx.clock.t
    this.time.value = t
    const playing = ctx.game.phase === 'playing'
    // A dying body (or one fading out to respawn) must not start a shard cutscene or waste a heart.
    const alive = playing && ctx.player.controlEnabled && ctx.player.hp > 0
    const pp = ctx.player.position
    const cx = pp.x
    const cy = pp.y + CHEST
    const cz = pp.z

    this.updateShards(dt, t, alive, cx, cy, cz)
    this.updateSparks(dt, t, playing, cx, cy, cz)
    this.updateHearts(dt, t, alive, cx, cy, cz)

    if (this.sparkDirty) this.writeSparkMatrices()
    if (this.heartDirty) this.writeHeartMatrices()
    this.glows.commit()
  }

  private updateShards(dt: number, t: number, alive: boolean, cx: number, cy: number, cz: number): void {
    const star = this.starMesh!
    const pillar = this.pillarMesh!
    const glows = this.glows!
    for (let i = 0; i < this.shards.length; i++) {
      const sh = this.shards[i]
      const k = this.shardSlot + i * SHARD_SLOTS
      if (sh.state === GONE) {
        this.m.makeScale(0, 0, 0)
        star.setMatrixAt(i, this.m)
        pillar.setMatrixAt(i, this.m)
        for (let j = 0; j < SHARD_SLOTS; j++) glows.hide(k + j)
        continue
      }

      let scale = 1
      let lift = 0
      let fade = 1
      if (sh.state === COLLECTING) {
        sh.t += dt
        const u = Math.min(1, sh.t / SHARD_COLLECT_TIME)
        scale = u < 0.3 ? 1 + (u / 0.3) * 0.35 : 1.35 * (1 - (u - 0.3) / 0.7) ** 2
        lift = u * 0.7
        fade = 1 - u
        if (u >= 1) sh.state = GONE
      }

      const b = sh.base
      sh.x = b.x
      sh.y = b.y + Math.sin(t * 1.6 + i * 1.3) * 0.14 + lift
      sh.z = b.z

      if (alive && sh.state === IDLE) {
        const dx = sh.x - cx
        const dy = sh.y - cy
        const dz = sh.z - cz
        if (dx * dx + dy * dy + dz * dz < SHARD_PICKUP * SHARD_PICKUP) {
          sh.state = COLLECTING
          sh.t = 0
          this.ctx.game.collectShard(i)
        }
      }

      this.q.setFromEuler(this.e.set(0, t * 1.1 + i * 0.9, Math.sin(t * 0.8 + i) * 0.12))
      this.m.compose(this.p.set(sh.x, sh.y, sh.z), this.q, this.s.setScalar(scale * 1.08))
      star.setMatrixAt(i, this.m)

      this.q.identity()
      this.m.compose(this.p.set(b.x, b.y - 0.3, b.z), this.q, this.s.set(PILLAR_RADIUS * fade, PILLAR_HEIGHT, PILLAR_RADIUS * fade))
      pillar.setMatrixAt(i, this.m)

      const pulse = 0.85 + 0.15 * Math.sin(t * 2.3 + i * 2.1)
      glows.move(k, sh.x, sh.y, sh.z, 2.4 * pulse * (0.4 + 0.6 * scale))
      glows.intensity(k, 0.2 * (sh.state === COLLECTING ? 1 + 2.5 * fade : 1))
      glows.move(k + 1, sh.x, sh.y, sh.z, 1.5 * pulse * scale)
      glows.rotate(k + 1, t * 0.35 + i)
      for (let j = 0; j < MOTES; j++) {
        const a = t * (1.1 + j * 0.27) + j * 1.7 + i
        const r = (0.62 + j * 0.09) * scale
        const tilt = 0.5 + j * 0.55
        const ox = Math.cos(a) * r
        const oz = Math.sin(a) * r
        glows.move(k + 2 + j, sh.x + ox, sh.y + oz * Math.sin(tilt) * 0.6 + Math.sin(a * 2) * 0.05, sh.z + oz * Math.cos(tilt), 0.13 + 0.04 * Math.sin(t * 5 + j))
      }
    }
    star.instanceMatrix.needsUpdate = true
    pillar.instanceMatrix.needsUpdate = true
  }

  private updateSparks(dt: number, t: number, playing: boolean, cx: number, cy: number, cz: number): void {
    const glows = this.glows!
    const r2 = SPARK_MAGNET * SPARK_MAGNET
    for (let i = 0; i < this.sparks.length; i++) {
      const sp = this.sparks[i]
      const slot = this.sparkSlot + i
      if (sp.state === GONE) {
        glows.hide(slot)
        continue
      }
      const dx = cx - sp.x
      const dy = cy - sp.y
      const dz = cz - sp.z
      const d2 = dx * dx + dy * dy + dz * dz
      if (playing && sp.state === IDLE && d2 < r2) sp.state = PULLED
      if (sp.state === PULLED) {
        if (!playing) {
          // Cutscenes / dialogs: drift back home instead of hanging mid-air.
          sp.state = IDLE
          sp.pull = 0
          sp.x = sp.bx
          sp.y = sp.by
          sp.z = sp.bz
          this.sparkDirty = true
        } else {
          const d = Math.sqrt(d2)
          if (d < SPARK_COLLECT) {
            sp.state = GONE
            glows.hide(slot)
            this.sparkDirty = true
            this.ctx.game.collectSpark(i)
            continue
          }
          sp.pull += dt
          const step = Math.min(d, (4 + sp.pull * 34) * dt)
          this.trailFrom.set(sp.x, sp.y, sp.z)
          sp.x += (dx / d) * step
          sp.y += (dy / d) * step
          sp.z += (dz / d) * step
          this.ctx.fx.trail('spark', this.trailFrom, this.trailTo.set(sp.x, sp.y, sp.z))
          this.sparkDirty = true
        }
      }
      glows.move(slot, sp.x, sp.y, sp.z, 0.85)
      glows.intensity(slot, 0.42 + 0.14 * Math.sin(t * 3.1 + i * 1.7) + (sp.state === PULLED ? 0.4 : 0))
    }
  }

  private updateHearts(dt: number, t: number, alive: boolean, cx: number, cy: number, cz: number): void {
    const glows = this.glows!
    const player = this.ctx.player
    const hurt = player.hp < player.maxHp
    for (let i = 0; i < this.hearts.length; i++) {
      const h = this.hearts[i]
      const slot = this.heartSlot + i
      if (h.state === GONE) {
        glows.hide(slot)
        continue
      }
      if (h.state === COLLECTING) {
        h.t += dt
        this.heartDirty = true
        if (h.t >= HEART_COLLECT_TIME) {
          h.state = GONE
          glows.hide(slot)
          continue
        }
      } else if (alive && hurt) {
        const dx = h.x - cx
        const dy = h.y - cy
        const dz = h.z - cz
        if (dx * dx + dy * dy + dz * dz < HEART_PICKUP * HEART_PICKUP) {
          h.state = COLLECTING
          h.t = 0
          this.heartDirty = true
          this.ctx.game.collectHeart(i)
        }
      }
      const u = h.state === COLLECTING ? h.t / HEART_COLLECT_TIME : 0
      glows.move(slot, h.x, h.y, h.z, 1.5 * (1 + u))
      glows.intensity(slot, (0.32 + 0.08 * Math.sin(t * 2.4 + i)) * (1 - u))
    }
  }

  private writeSparkMatrices(): void {
    const mesh = this.sparkMesh
    if (!mesh) return
    for (let i = 0; i < this.sparks.length; i++) {
      const sp = this.sparks[i]
      if (sp.state === GONE) this.m.makeScale(0, 0, 0)
      else this.m.makeTranslation(sp.x, sp.y, sp.z)
      mesh.setMatrixAt(i, this.m)
    }
    mesh.instanceMatrix.needsUpdate = true
    this.sparkDirty = false
  }

  private writeHeartMatrices(): void {
    const mesh = this.heartMesh
    if (!mesh) return
    for (let i = 0; i < this.hearts.length; i++) {
      const h = this.hearts[i]
      if (h.state === GONE) {
        this.m.makeScale(0, 0, 0)
      } else {
        const u = h.state === COLLECTING ? Math.min(1, h.t / HEART_COLLECT_TIME) : 0
        const sc = u < 0.4 ? 1 + u * 0.8 : 1.32 * (1 - (u - 0.4) / 0.6)
        this.m.compose(this.p.set(h.x, h.y + u * 0.6, h.z), this.q.identity(), this.s.setScalar(sc))
      }
      mesh.setMatrixAt(i, this.m)
    }
    mesh.instanceMatrix.needsUpdate = true
    this.heartDirty = false
  }

  dispose(): void {
    for (const mesh of [this.starMesh, this.pillarMesh, this.sparkMesh, this.heartMesh]) {
      if (!mesh) continue
      mesh.removeFromParent()
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
      mesh.dispose()
    }
    this.starMesh = this.pillarMesh = this.sparkMesh = this.heartMesh = null
    this.glows?.dispose()
    this.glows = null
    if (this.glowTex?.owned) this.glowTex.texture.dispose()
    this.glowTex = null
  }
}
