/**
 * Small instanced overlays for the factory's mobs, one draw call each:
 *
 *   HpBars      a slim health bar over a mob that was hit recently (fades out after a few
 *               seconds; gold while it is warded)
 *   BlobShadows soft contact shadows under every mob (keeps them grounded on the 'low' preset,
 *               where there are no shadow maps)
 *   Drops       hearts that pop out of fallen enemies, bob, drift to the player and heal one
 */
import * as THREE from 'three'
import type { Ctx } from '../../types'
import { heightAt } from '../../world/heightfield'

const BAR_VS = /* glsl */ `
attribute vec4 aBar;
varying vec2 vUv;
varying vec4 vBar;
void main() {
  vUv = uv;
  vBar = aBar;
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  mv.xy += position.xy * vec2(1.1, 0.13);
  gl_Position = projectionMatrix * mv;
}`

const BAR_FS = /* glsl */ `
varying vec2 vUv;
varying vec4 vBar;
void main() {
  // vBar: x fill, y alpha, z warded, w the chunk just lost.
  vec2 p = vUv;
  float border = step(0.03, p.x) * step(p.x, 0.97) * step(0.16, p.y) * step(p.y, 0.84);
  vec3 back = vec3(0.04, 0.03, 0.05);
  vec3 fill = mix(vec3(0.91, 0.3, 0.22), vec3(1.0, 0.82, 0.35), vBar.z);
  vec3 col = back;
  if (border > 0.5) {
    float x = (p.x - 0.03) / 0.94;
    col = x < vBar.x ? fill * (0.85 + 0.3 * (p.y - 0.16)) : (x < vBar.w ? vec3(0.95, 0.92, 0.88) : vec3(0.12, 0.1, 0.12));
  }
  gl_FragColor = vec4(col, vBar.y * 0.92);
}`

export interface BarSource {
  readonly position: THREE.Vector3
  readonly height: number
  readonly hpFraction: number
  readonly lastHit: number
  readonly ward: number
  readonly alive: boolean
}

export class HpBars {
  private mesh: THREE.InstancedMesh
  private attr: THREE.InstancedBufferAttribute
  private trail = new Map<BarSource, number>()
  private readonly m = new THREE.Matrix4()

  constructor(private ctx: Ctx, private cap: number) {
    const geo = new THREE.PlaneGeometry(1, 1)
    this.attr = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage)
    geo.setAttribute('aBar', this.attr)
    const mat = new THREE.ShaderMaterial({ vertexShader: BAR_VS, fragmentShader: BAR_FS, transparent: true, depthWrite: false, depthTest: true })
    this.mesh = new THREE.InstancedMesh(geo, mat, cap)
    this.mesh.name = 'enemy-hp-bars'
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 30
    this.mesh.count = 0
    ctx.scene.add(this.mesh)
  }

  update(dt: number, list: readonly BarSource[]): void {
    const a = this.attr.array as Float32Array
    let n = 0
    for (const s of list) {
      if (n >= this.cap) break
      const shown = s.alive && s.lastHit < 4.5
      if (!shown) {
        this.trail.delete(s)
        continue
      }
      // The white "lost" chunk drains toward the fill.
      let trail = this.trail.get(s) ?? s.hpFraction
      trail = Math.max(s.hpFraction, trail - dt * (s.lastHit > 0.35 ? 0.9 : 0))
      this.trail.set(s, trail)
      const alpha = Math.min(1, (4.5 - s.lastHit) / 0.6)
      this.m.makeTranslation(s.position.x, s.position.y + s.height + 0.45, s.position.z)
      this.mesh.setMatrixAt(n, this.m)
      a[n * 4] = s.hpFraction
      a[n * 4 + 1] = alpha
      a[n * 4 + 2] = s.ward > 0 ? 1 : 0
      a[n * 4 + 3] = trail
      n++
    }
    this.mesh.count = n
    this.mesh.visible = n > 0
    if (n) {
      this.mesh.instanceMatrix.needsUpdate = true
      this.attr.needsUpdate = true
    }
  }

  dispose(): void {
    this.mesh.removeFromParent()
    this.mesh.geometry.dispose()
    ;(this.mesh.material as THREE.Material).dispose()
    this.mesh.dispose()
  }
}

export interface ShadowSource {
  readonly position: THREE.Vector3
  readonly radius: number
  readonly alive: boolean
}

export class BlobShadows {
  private mesh: THREE.InstancedMesh
  private readonly m = new THREE.Matrix4()
  private readonly q = new THREE.Quaternion()
  private readonly p = new THREE.Vector3()
  private readonly s = new THREE.Vector3()

  constructor(ctx: Ctx, private cap: number) {
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
    const mat = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uStrength;
        varying vec2 vUv;
        void main() {
          float d = length(vUv - 0.5) * 2.0;
          gl_FragColor = vec4(0.04, 0.03, 0.06, (1.0 - smoothstep(0.2, 1.0, d)) * uStrength);
        }`,
      uniforms: { uStrength: { value: 0.4 } },
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
    this.mesh = new THREE.InstancedMesh(geo, mat, cap)
    this.mesh.name = 'enemy-blob-shadows'
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 1
    this.mesh.count = 0
    ctx.scene.add(this.mesh)
  }

  update(list: readonly ShadowSource[], shadowMaps: boolean): void {
    ;(this.mesh.material as THREE.ShaderMaterial).uniforms.uStrength.value = shadowMaps ? 0.26 : 0.45
    let n = 0
    for (const s of list) {
      if (n >= this.cap || !s.alive) continue
      const k = s.radius * 2.6
      this.m.compose(this.p.set(s.position.x, s.position.y + 0.04, s.position.z), this.q, this.s.set(k, 1, k))
      this.mesh.setMatrixAt(n++, this.m)
    }
    this.mesh.count = n
    this.mesh.visible = n > 0
    if (n) this.mesh.instanceMatrix.needsUpdate = true
  }

  dispose(): void {
    this.mesh.removeFromParent()
    this.mesh.geometry.dispose()
    ;(this.mesh.material as THREE.Material).dispose()
    this.mesh.dispose()
  }
}

/* ── drops ───────────────────────────────────────────────────── */

const DROPS = 16
const DROP_LIFE = 14
const MAGNET = 3.2

interface Drop {
  on: boolean
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  t: number
  ground: number
  landed: boolean
}

export class Drops {
  private list: Drop[] = []
  private mesh: THREE.InstancedMesh
  private readonly m = new THREE.Matrix4()
  private readonly q = new THREE.Quaternion()
  private readonly e = new THREE.Euler()
  private readonly p = new THREE.Vector3()
  private readonly s = new THREE.Vector3()

  constructor(private ctx: Ctx) {
    const shape = new THREE.Shape()
    shape.moveTo(0, -0.28)
    shape.bezierCurveTo(-0.05, -0.2, -0.32, -0.05, -0.3, 0.12)
    shape.bezierCurveTo(-0.28, 0.3, -0.06, 0.32, 0, 0.17)
    shape.bezierCurveTo(0.06, 0.32, 0.28, 0.3, 0.3, 0.12)
    shape.bezierCurveTo(0.32, -0.05, 0.05, -0.2, 0, -0.28)
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2, curveSegments: 10 })
    geo.translate(0, 0, -0.06)
    const mat = new THREE.MeshStandardMaterial({ color: 0xff4f6d, emissive: 0xff2a50, emissiveIntensity: 1.6, roughness: 0.3, metalness: 0.1 })
    this.mesh = new THREE.InstancedMesh(geo, mat, DROPS)
    this.mesh.name = 'enemy-drops'
    this.mesh.frustumCulled = false
    this.mesh.count = 0
    this.mesh.castShadow = true
    for (let i = 0; i < DROPS; i++) this.list.push({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, t: 0, ground: 0, landed: false })
    ctx.scene.add(this.mesh)
  }

  /** A heart pops out of (x, y, z) with a little hop. */
  heart(x: number, y: number, z: number, seed: number): void {
    const d = this.list.find(q => !q.on)
    if (!d) return
    const a = seed * 2.39996
    Object.assign(d, { on: true, x, y: y + 1, z, vx: Math.sin(a) * 1.6, vy: 5.5, vz: Math.cos(a) * 1.6, t: 0, ground: heightAt(x, z), landed: false })
    d.ground = y
  }

  clear(): void {
    for (const d of this.list) d.on = false
    this.mesh.count = 0
  }

  update(dt: number): void {
    const ctx = this.ctx
    const pl = ctx.player
    const pp = pl.position
    const time = ctx.clock.t
    let n = 0
    for (let i = 0; i < this.list.length; i++) {
      const d = this.list[i]
      if (!d.on) continue
      d.t += dt
      const dx = pp.x - d.x
      const dy = pp.y + 0.9 - d.y
      const dz = pp.z - d.z
      const dist = Math.hypot(dx, dy, dz)
      if (d.t > DROP_LIFE) {
        d.on = false
        continue
      }
      if (dist < 0.9 && pl.hp > 0) {
        d.on = false
        if (pl.hp < pl.maxHp) pl.heal(1)
        ctx.bus.emit('collect:heart', { pos: { x: d.x, y: d.y - 1, z: d.z } })
        continue
      }
      if (d.t > 0.6 && dist < MAGNET && pl.hp > 0) {
        // Drawn to the player once it has settled.
        const k = (9 * dt) / Math.max(dist, 0.2)
        d.x += dx * Math.min(1, k)
        d.y += dy * Math.min(1, k)
        d.z += dz * Math.min(1, k)
      } else if (!d.landed) {
        d.vy -= 18 * dt
        d.x += d.vx * dt
        d.y += d.vy * dt
        d.z += d.vz * dt
        if (d.y <= d.ground + 0.55 && d.vy < 0) {
          d.y = d.ground + 0.55
          d.landed = true
        }
      }
      const blink = d.t > DROP_LIFE - 2.5 && Math.sin(d.t * 18) < 0 ? 0.001 : 1
      const bob = d.landed ? Math.sin(time * 3 + i) * 0.08 : 0
      this.e.set(0, time * 2.2 + i, 0)
      this.m.compose(this.p.set(d.x, d.y + bob, d.z), this.q.setFromEuler(this.e), this.s.setScalar(blink * 1.1))
      this.mesh.setMatrixAt(n++, this.m)
    }
    this.mesh.count = n
    this.mesh.visible = n > 0
    if (n) this.mesh.instanceMatrix.needsUpdate = true
  }

  dispose(): void {
    this.mesh.removeFromParent()
    this.mesh.geometry.dispose()
    ;(this.mesh.material as THREE.Material).dispose()
    this.mesh.dispose()
  }
}
