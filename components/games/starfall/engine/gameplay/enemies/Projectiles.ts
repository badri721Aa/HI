/**
 * Enemy projectiles: one pooled, instanced draw for every bolt, orb, needle and wind blade in
 * flight — the bullet-hell patterns of the bosses and the mobs' shots alike.
 *
 * State lives in flat typed arrays (no objects per shot, nothing allocated while firing). Each
 * frame a shot steers (curl, homing, acceleration, gravity), moves, and is tested against the
 * player's body (dashing through is a dodge; while the player blinks after a hit, shots pass),
 * the floor, the terrain and — a third of the shots per frame — the colliders around it. Live
 * shots are packed into the instance buffer, so the GPU only draws what flies.
 *
 * Shots are drawn as outlined glows (a dark rim around a hot core) with normal blending, so they
 * read on bright sand and in the dark alike; the cores are bright enough to bloom.
 */
import * as THREE from 'three'
import type { V3 } from '../../events'
import { FOG_FACTOR_GLSL } from '../../fx/gpu'
import type { Ctx } from '../../types'
import { heightAt } from '../../world/heightfield'
import { SHOTS, type ShotId, type ShotSpec, type ShotStyle } from './defs'

const STYLE: Record<ShotStyle, number> = { orb: 0, ember: 1, bolt: 2, needle: 3, blade: 4 }
const IDS = Object.keys(SHOTS) as ShotId[]
const SPECS: ShotSpec[] = IDS.map(id => SHOTS[id])
const INDEX = new Map<ShotId, number>(IDS.map((id, i) => [id, i]))
/** Shots spawn small and grow to full size over this long (s). */
const GROW = 0.12
const FADE = 0.25

const VS = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
attribute vec3 aPos;
attribute vec3 aVel;
attribute vec4 aCol;
attribute vec2 aSA;
varying vec2 vQ;
varying vec4 vCol;
varying float vAlpha;
varying float vStretch;
void main() {
  vec4 mv = viewMatrix * vec4(aPos, 1.0);
  vec3 vd = (viewMatrix * vec4(aVel, 0.0)).xyz;
  float dl = length(vd.xy);
  vec2 ax = dl > 1e-4 ? vd.xy / dl : vec2(1.0, 0.0);
  vec2 ay = vec2(-ax.y, ax.x);
  float style = aCol.w;
  // Orbs stay round; the rest stretch along their screen-space heading.
  float stretch = style < 0.5 ? 0.0 : clamp(dl * (style > 2.5 && style < 3.5 ? 0.11 : 0.06), 0.0, 3.0);
  vStretch = stretch;
  vec2 q = position.xy * 2.0;
  vQ = q;
  float size = aSA.x;
  mv.xy += (ax * q.x * (1.0 + stretch) + ay * q.y) * size;
  vCol = aCol;
  vAlpha = aSA.y;
  #ifdef USE_FOG
    vFogDepth = -mv.z;
  #endif
  gl_Position = projectionMatrix * mv;
}`

const FS = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
varying vec2 vQ;
varying vec4 vCol;
varying float vAlpha;
varying float vStretch;
${FOG_FACTOR_GLSL}
void main() {
  float style = vCol.w;
  vec2 q = vQ;
  // Distance in the shot's own frame: x is squeezed by the stretch so the core stays round-ended.
  vec2 p = vec2(q.x * (1.0 + vStretch) / max(1.0 + vStretch * 0.92, 1e-3), q.y);
  float r = length(p);
  if (style > 3.5) {
    // Wind blade: a crescent opening backwards.
    float outer = length(q - vec2(0.18, 0.0));
    float inner = length(q - vec2(-0.12, 0.0));
    r = max(outer, 1.0 - inner * 1.25);
  }
  if (r > 1.0) discard;
  float core = 1.0 - smoothstep(0.0, 0.42, r);
  float body = 1.0 - smoothstep(0.55, 0.78, r);
  float rim = smoothstep(0.62, 0.8, r) * (1.0 - smoothstep(0.86, 1.0, r));
  vec3 hot = vCol.rgb * 2.6 + vec3(1.6) * core * core;
  vec3 dark = vCol.rgb * 0.16;
  vec3 col = mix(dark, hot, max(body, core));
  float a = max(body, rim * 0.85) * vAlpha;
  float fog = fxFogFactor();
  #ifdef USE_FOG
    col = mix(col, fogColor, fog * 0.85);
  #endif
  gl_FragColor = vec4(col, a * (1.0 - fog * 0.6));
}`

export class Projectiles {
  private readonly cap: number
  private n = 0
  private frame = 0
  // Per-shot state (packed: indices 0..n-1 are live).
  private readonly px: Float32Array
  private readonly py: Float32Array
  private readonly pz: Float32Array
  private readonly vx: Float32Array
  private readonly vy: Float32Array
  private readonly vz: Float32Array
  private readonly age: Float32Array
  private readonly floor: Float32Array
  private readonly blast: Float32Array
  private readonly spec: Uint8Array
  private readonly mesh: THREE.InstancedMesh
  private readonly aPos: THREE.InstancedBufferAttribute
  private readonly aVel: THREE.InstancedBufferAttribute
  private readonly aCol: THREE.InstancedBufferAttribute
  private readonly aSA: THREE.InstancedBufferAttribute
  private readonly colors: THREE.Color[]
  private readonly hex: string[]
  private readonly hit: V3 = { x: 0, y: 0, z: 0 }
  private readonly burstAt: V3 = { x: 0, y: 0, z: 0 }
  /** Bursts this frame (a dense wave hitting a wall must not flood the particle pool). */
  private bursts = 0

  constructor(private ctx: Ctx, capacity: number) {
    this.cap = capacity
    const f = () => new Float32Array(capacity)
    this.px = f()
    this.py = f()
    this.pz = f()
    this.vx = f()
    this.vy = f()
    this.vz = f()
    this.age = f()
    this.floor = f()
    this.blast = f()
    this.spec = new Uint8Array(capacity)
    this.colors = SPECS.map(s => new THREE.Color(s.color))
    this.hex = this.colors.map(c => `#${c.getHexString()}`)

    const geo = new THREE.InstancedBufferGeometry()
    const quad = new THREE.PlaneGeometry(1, 1)
    geo.index = quad.index
    geo.setAttribute('position', quad.getAttribute('position'))
    const inst = (size: number) => new THREE.InstancedBufferAttribute(new Float32Array(capacity * size), size).setUsage(THREE.DynamicDrawUsage)
    this.aPos = inst(3)
    this.aVel = inst(3)
    this.aCol = inst(4)
    this.aSA = inst(2)
    geo.setAttribute('aPos', this.aPos)
    geo.setAttribute('aVel', this.aVel)
    geo.setAttribute('aCol', this.aCol)
    geo.setAttribute('aSA', this.aSA)
    const mat = new THREE.ShaderMaterial({
      vertexShader: VS,
      fragmentShader: FS,
      uniforms: THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      transparent: true,
      depthWrite: false,
      fog: true,
    })
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity)
    this.mesh.name = 'enemy-projectiles'
    this.mesh.frustumCulled = false
    this.mesh.count = 0
    this.mesh.renderOrder = 22
    ctx.scene.add(this.mesh)
  }

  get count(): number {
    return this.n
  }

  /**
   * Fire one shot from (x, y, z) along (dx, dy, dz) (normalised here). `floor` kills it below that
   * height (default: the terrain). Returns false when the pool is full.
   */
  fire(id: ShotId, x: number, y: number, z: number, dx: number, dy: number, dz: number, speed?: number, floor = -Infinity): boolean {
    if (this.n >= this.cap) return false
    const si = INDEX.get(id)!
    const s = SPECS[si]
    const l = Math.hypot(dx, dy, dz)
    if (!(l > 1e-6)) return false
    const v = (speed ?? s.speed) / l
    const i = this.n++
    this.px[i] = x
    this.py[i] = y
    this.pz[i] = z
    this.vx[i] = dx * v
    this.vy[i] = dy * v
    this.vz[i] = dz * v
    this.age[i] = 0
    this.floor[i] = floor
    this.blast[i] = 0
    this.spec[i] = si
    return true
  }

  /** `count` shots evenly around the Y axis starting at angle `phase`, tilted by `pitch`. */
  ring(id: ShotId, x: number, y: number, z: number, count: number, phase: number, pitch = 0, speed?: number, floor = -Infinity): void {
    const cp = Math.cos(pitch)
    const sp = Math.sin(pitch)
    for (let k = 0; k < count; k++) {
      const a = phase + (k / count) * Math.PI * 2
      this.fire(id, x, y, z, Math.sin(a) * cp, sp, Math.cos(a) * cp, speed, floor)
    }
  }

  /** `count` shots fanned across `spread` radians around heading `yaw`. */
  fan(id: ShotId, x: number, y: number, z: number, yaw: number, count: number, spread: number, pitch = 0, speed?: number, floor = -Infinity): void {
    const cp = Math.cos(pitch)
    const sp = Math.sin(pitch)
    for (let k = 0; k < count; k++) {
      const a = yaw + (count > 1 ? (k / (count - 1) - 0.5) * spread : 0)
      this.fire(id, x, y, z, Math.sin(a) * cp, sp, Math.cos(a) * cp, speed, floor)
    }
  }

  /** One shot at the player's chest, leading his motion by `lead` seconds. */
  aimed(id: ShotId, x: number, y: number, z: number, lead = 0, speed?: number, floor = -Infinity): boolean {
    const pl = this.ctx.player
    const p = pl.position
    const v = pl.velocity
    const tx = p.x + v.x * lead
    const ty = p.y + pl.height * 0.55
    const tz = p.z + v.z * lead
    return this.fire(id, x, y, z, tx - x, ty - y, tz - z, speed, floor)
  }

  /**
   * A ballistic shot landing on (tx, ty, tz) after `time` seconds; it bursts there with a blast of
   * `radius` metres (the caller draws the warning circle).
   */
  lob(id: ShotId, x: number, y: number, z: number, tx: number, ty: number, tz: number, time: number, radius: number): boolean {
    if (this.n >= this.cap || !(time > 0.05)) return false
    const si = INDEX.get(id)!
    const g = SPECS[si].gravity ?? 20
    const i = this.n++
    this.px[i] = x
    this.py[i] = y
    this.pz[i] = z
    this.vx[i] = (tx - x) / time
    this.vy[i] = (ty - y) / time + 0.5 * g * time
    this.vz[i] = (tz - z) / time
    this.age[i] = 0
    this.floor[i] = ty
    this.blast[i] = radius
    this.spec[i] = si
    return true
  }

  /** Swings and slams knock parryable shots out of the air. Returns how many popped. */
  parry(c: V3, radius: number): number {
    let popped = 0
    for (let i = this.n - 1; i >= 0; i--) {
      const s = SPECS[this.spec[i]]
      if (!s.parry) continue
      const r = radius + s.radius
      const dx = this.px[i] - c.x
      const dy = this.py[i] - c.y
      const dz = this.pz[i] - c.z
      if (dx * dx + dy * dy + dz * dz > r * r) continue
      this.pop(i, true)
      this.kill(i)
      popped++
    }
    return popped
  }

  /** Remove every shot (boss reset, despawn, travel). */
  clear(): void {
    this.n = 0
    this.mesh.count = 0
  }

  update(dt: number): void {
    this.frame++
    this.bursts = 0
    const ctx = this.ctx
    const pl = ctx.player
    const p = pl.position
    const hy0 = p.y + 0.3
    const hy1 = p.y + pl.height - 0.25
    const pr = pl.radius * 0.8
    const vulnerable = pl.hp > 0 && pl.controlEnabled && !pl.invulnerable && pl.state !== 'dash' && !ctx.game.creative
    const chestY = p.y + pl.height * 0.55
    for (let i = this.n - 1; i >= 0; i--) {
      const s = SPECS[this.spec[i]]
      const age = (this.age[i] += dt)
      if (age >= s.life) {
        this.expire(i, s)
        continue
      }
      let vx = this.vx[i]
      let vy = this.vy[i]
      let vz = this.vz[i]
      if (s.accel) {
        const sp = Math.hypot(vx, vy, vz)
        if (sp > 1e-4) {
          const k = Math.max(0.6, sp + s.accel * dt) / sp
          vx *= k
          vy *= k
          vz *= k
        }
      }
      if (s.curl) {
        const a = s.curl * dt
        const c = Math.cos(a)
        const sn = Math.sin(a)
        const nx = vx * c + vz * sn
        vz = -vx * sn + vz * c
        vx = nx
      }
      if (s.homing && age < (s.homingTime ?? 1)) {
        const tx = p.x - this.px[i]
        const ty = chestY - this.py[i]
        const tz = p.z - this.pz[i]
        const tl = Math.hypot(tx, ty, tz)
        const sp = Math.hypot(vx, vy, vz)
        if (tl > 0.5 && sp > 1e-4) {
          // Turn toward the target by at most homing·dt radians (spherical lerp of the heading).
          const cos = THREE.MathUtils.clamp((vx * tx + vy * ty + vz * tz) / (sp * tl), -1, 1)
          const ang = Math.acos(cos)
          const step = s.homing * dt
          if (ang > 1e-4) {
            const f = Math.min(1, step / ang)
            const nx = vx / sp + (tx / tl - vx / sp) * f
            const ny = vy / sp + (ty / tl - vy / sp) * f
            const nz = vz / sp + (tz / tl - vz / sp) * f
            const nl = Math.hypot(nx, ny, nz)
            if (nl > 1e-5) {
              vx = (nx / nl) * sp
              vy = (ny / nl) * sp
              vz = (nz / nl) * sp
            }
          }
        }
      }
      if (s.gravity) vy -= s.gravity * dt
      this.vx[i] = vx
      this.vy[i] = vy
      this.vz[i] = vz
      const x = (this.px[i] += vx * dt)
      const y = (this.py[i] += vy * dt)
      const z = (this.pz[i] += vz * dt)

      // The player: a capsule from the shins to the head.
      if (vulnerable) {
        const r = pr + s.radius
        const cy = y < hy0 ? hy0 : y > hy1 ? hy1 : y
        const dx = x - p.x
        const dy = y - cy
        const dz = z - p.z
        if (dx * dx + dy * dy + dz * dz < r * r) {
          this.hit.x = x - vx * 0.1
          this.hit.y = y
          this.hit.z = z - vz * 0.1
          pl.hurt(s.damage, this.hit)
          this.pop(i, false)
          this.kill(i)
          continue
        }
      }
      // Lobbed shells burst on their floor; everything else dies on the floor or the ground.
      if (this.blast[i] > 0) {
        if (vy < 0 && y <= this.floor[i]) {
          this.detonate(i)
          this.kill(i)
        }
        continue
      }
      // Boss shots die on their arena floor; the rest check the terrain every other frame.
      const fl = this.floor[i]
      const ground = fl === -Infinity && ((i + this.frame) & 1) === 0 && y < heightAt(x, z) - 0.1
      if (y < fl || ground || ((i + this.frame) % 3 === 0 && this.inSolid(x, y, z))) {
        this.pop(i, false)
        this.kill(i)
      }
    }
    this.render()
  }

  dispose(): void {
    this.mesh.removeFromParent()
    this.mesh.geometry.dispose()
    ;(this.mesh.material as THREE.Material).dispose()
    this.mesh.dispose()
  }

  /* ── internals ───────────────────────────────────────────── */

  private expire(i: number, s: ShotSpec): void {
    const x = this.px[i]
    const y = this.py[i]
    const z = this.pz[i]
    const floor = this.floor[i]
    this.kill(i)
    if (s.split) {
      // Phase from the position, so a split is the same on every run.
      this.ring(s.split.shot, x, y, z, s.split.count, (x * 1.7 + z * 2.3) % (Math.PI * 2), 0, undefined, floor)
      this.burstAt.x = x
      this.burstAt.y = y
      this.burstAt.z = z
      this.ctx.fx.burst('hit', this.burstAt, { color: this.hex[INDEX.get(s.split.shot)!], scale: 1.2 })
    }
  }

  private detonate(i: number): void {
    const x = this.px[i]
    const y = this.floor[i]
    const z = this.pz[i]
    const r = this.blast[i]
    const ctx = this.ctx
    this.burstAt.x = x
    this.burstAt.y = y + 0.1
    this.burstAt.z = z
    const color = this.hex[this.spec[i]]
    ctx.fx.burst('land', this.burstAt, { scale: r * 0.9, color: '#4a3a30' })
    ctx.fx.burst('hit', this.burstAt, { scale: r * 0.8, color })
    ctx.bus.emit('boss:impact', { pos: { x, y, z }, kind: 'orb' })
    ctx.game.shake(0.25, 0.18)
    const pl = ctx.player
    const p = pl.position
    if (Math.hypot(p.x - x, p.z - z) < r + pl.radius * 0.5 && p.y - y < 1.6 && p.y - y > -1.2 && !pl.invulnerable && pl.hp > 0) {
      this.hit.x = x
      this.hit.y = y
      this.hit.z = z
      pl.hurt(SPECS[this.spec[i]].damage, this.hit)
    }
  }

  private pop(i: number, parried: boolean): void {
    if (this.bursts >= 6) return
    this.bursts++
    this.burstAt.x = this.px[i]
    this.burstAt.y = this.py[i]
    this.burstAt.z = this.pz[i]
    this.ctx.fx.burst(parried ? 'hit' : 'spark', this.burstAt, { color: this.hex[this.spec[i]], scale: parried ? 0.8 : 0.45, count: parried ? undefined : 4 })
  }

  /** Swap-remove: the last live shot takes slot i. */
  private kill(i: number): void {
    const last = --this.n
    if (i === last) return
    this.px[i] = this.px[last]
    this.py[i] = this.py[last]
    this.pz[i] = this.pz[last]
    this.vx[i] = this.vx[last]
    this.vy[i] = this.vy[last]
    this.vz[i] = this.vz[last]
    this.age[i] = this.age[last]
    this.floor[i] = this.floor[last]
    this.blast[i] = this.blast[last]
    this.spec[i] = this.spec[last]
  }

  /** Inside a static solid (walls, pillars, props)? Enemy and boss bodies don't stop shots. */
  private inSolid(x: number, y: number, z: number): boolean {
    const list = this.ctx.collision.query(x, z, 0.5)
    for (let k = 0; k < list.length; k++) {
      const c = list[k]
      if (!c.enabled || c.tag === 'enemy' || c.tag === 'boss') continue
      if (c.shape === 'cylinder') {
        if (y < c.y || y > c.y + c.h) continue
        if ((x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r) return true
      } else {
        if (Math.abs(y - c.y) > c.hy) continue
        const dx = x - c.x
        const dz = z - c.z
        const cs = Math.cos(c.yaw)
        const sn = Math.sin(c.yaw)
        if (Math.abs(dx * cs - dz * sn) < c.hx && Math.abs(dx * sn + dz * cs) < c.hz) return true
      }
    }
    return false
  }

  private render(): void {
    const n = this.n
    const pos = this.aPos.array as Float32Array
    const vel = this.aVel.array as Float32Array
    const col = this.aCol.array as Float32Array
    const sa = this.aSA.array as Float32Array
    for (let i = 0; i < n; i++) {
      const s = SPECS[this.spec[i]]
      const c = this.colors[this.spec[i]]
      const age = this.age[i]
      const grow = age < GROW ? 0.35 + 0.65 * (age / GROW) : 1
      const fade = Math.min(1, (s.life - age) / FADE)
      pos[i * 3] = this.px[i]
      pos[i * 3 + 1] = this.py[i]
      pos[i * 3 + 2] = this.pz[i]
      vel[i * 3] = this.vx[i]
      vel[i * 3 + 1] = this.vy[i]
      vel[i * 3 + 2] = this.vz[i]
      col[i * 4] = c.r
      col[i * 4 + 1] = c.g
      col[i * 4 + 2] = c.b
      col[i * 4 + 3] = STYLE[s.style]
      sa[i * 2] = s.radius * (s.size ?? 1.5) * grow
      sa[i * 2 + 1] = fade
    }
    this.mesh.count = n
    this.mesh.visible = n > 0
    if (!n) return
    upload(this.aPos, n * 3)
    upload(this.aVel, n * 3)
    upload(this.aCol, n * 4)
    upload(this.aSA, n * 2)
  }
}

function upload(a: THREE.InstancedBufferAttribute, count: number): void {
  a.clearUpdateRanges()
  a.addUpdateRange(0, count)
  a.needsUpdate = true
}
