/**
 * Boss hazards, all telegraphed and pooled (no allocation while fighting):
 *
 *   ring    an expanding shockwave wall along the floor — jump over it
 *   warn    a circle on the floor that fills up, then goes off (the caller decides what happens)
 *   lob     an orb or a boulder flying to a marked spot; a blast where it lands
 *   spikes  a line of ice spikes erupting one after another, each over its own warning circle
 *   lane    the long stripe a charge will run along
 *
 * Damage goes through ctx.player.hurt (which owns invulnerability frames and knockback).
 */
import * as THREE from 'three'
import type { V3 } from '../../events'
import type { Ctx } from '../../types'
import { rockGeometry } from '../geo'

const RINGS = 8
const WARNS = 40
/** Projectile pool: half orbs, half boulders. */
const SHOTS = 16
const SPIKES = 30
/** A shockwave catches feet within this distance of its front, unless they are this high above the floor. */
const RING_BAND = 0.55
const RING_CLEAR = 0.75
const SPIKE_UP = 0.12
const SPIKE_HOLD = 0.9

export interface HazardColors {
  ring: string
  warn: string
}

interface Ring {
  mesh: THREE.Mesh
  mat: THREE.ShaderMaterial
  on: boolean
  x: number
  y: number
  z: number
  r: number
  speed: number
  maxR: number
  damage: number
  hit: boolean
}

interface Warn {
  mesh: THREE.Mesh
  mat: THREE.ShaderMaterial
  on: boolean
  t: number
  delay: number
  boom: (() => void) | null
}

interface Shot {
  mesh: THREE.Mesh
  on: boolean
  boulder: boolean
  t: number
  dur: number
  arc: number
  from: THREE.Vector3
  to: THREE.Vector3
  radius: number
}

interface Spike {
  mesh: THREE.Mesh
  on: boolean
  t: number
  h: number
}

const RING_VS = /* glsl */ `
varying float vH;
void main() {
  vH = uv.y;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`
const RING_FS = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
varying float vH;
void main() {
  float a = pow(1.0 - vH, 1.6) * uAlpha + smoothstep(0.12, 0.0, vH) * 0.6 * uAlpha;
  gl_FragColor = vec4(uColor * (1.2 + (1.0 - vH)), a);
}`

const WARN_VS = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`
const WARN_FS = /* glsl */ `
uniform vec3 uColor;
uniform float uFill;
uniform float uTime;
varying vec2 vUv;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float rim = smoothstep(0.84, 0.92, d) * smoothstep(1.0, 0.95, d);
  float fill = step(d, uFill) * 0.32 + smoothstep(uFill - 0.08, uFill, d) * step(d, uFill) * 0.5;
  float pulse = 0.65 + 0.35 * sin(uTime * (10.0 + uFill * 14.0));
  float a = (rim * 0.9 * pulse + fill) * smoothstep(1.0, 0.97, d);
  gl_FragColor = vec4(uColor * (1.0 + uFill), a);
}`

export class Hazards {
  private rings: Ring[] = []
  private warns: Warn[] = []
  private shots: Shot[] = []
  private spikesPool: Spike[] = []
  private lane: THREE.Mesh
  private laneMat: THREE.ShaderMaterial
  private readonly group = new THREE.Group()
  private readonly owned: Array<{ dispose(): void }> = []
  private time = 0
  private timers: Array<{ t: number; fn: () => void }> = []
  private readonly ringColor: THREE.Color
  private readonly warnColor: THREE.Color

  constructor(private ctx: Ctx, colors: HazardColors) {
    this.group.name = 'boss-hazards'
    this.ringColor = new THREE.Color(colors.ring)
    this.warnColor = new THREE.Color(colors.warn)
    const own = <T extends { dispose(): void }>(o: T): T => {
      this.owned.push(o)
      return o
    }

    const ringGeo = own(new THREE.CylinderGeometry(1, 1, 1, 72, 1, true).translate(0, 0.5, 0))
    for (let i = 0; i < RINGS; i++) {
      const mat = own(new THREE.ShaderMaterial({
        vertexShader: RING_VS, fragmentShader: RING_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, uniforms: { uColor: { value: this.ringColor.clone() }, uAlpha: { value: 1 } },
      }))
      const mesh = new THREE.Mesh(ringGeo, mat)
      mesh.visible = false
      mesh.frustumCulled = false
      this.group.add(mesh)
      this.rings.push({ mesh, mat, on: false, x: 0, y: 0, z: 0, r: 0, speed: 0, maxR: 0, damage: 0, hit: false })
    }

    const warnGeo = own(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2))
    for (let i = 0; i < WARNS; i++) {
      const mat = own(new THREE.ShaderMaterial({
        vertexShader: WARN_VS, fragmentShader: WARN_FS, transparent: true, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
        uniforms: { uColor: { value: this.warnColor }, uFill: { value: 0 }, uTime: { value: 0 } },
      }))
      const mesh = new THREE.Mesh(warnGeo, mat)
      mesh.visible = false
      mesh.renderOrder = 2
      this.group.add(mesh)
      this.warns.push({ mesh, mat, on: false, t: 0, delay: 1, boom: null })
    }

    // Dark orbs and ice-rimmed boulders.
    const orbGeo = own(new THREE.SphereGeometry(0.55, 18, 12))
    const orbMat = own(new THREE.MeshStandardMaterial({ color: 0x1a0a2a, emissive: 0x8a3cff, emissiveIntensity: 2.2, roughness: 0.3 }))
    const boulderGeo = own(rockGeometry(0.85, 7))
    const boulderMat = own(new THREE.MeshStandardMaterial({
      map: ctx.textures.get('rock_albedo'), normalMap: ctx.textures.get('rock_normal'), color: 0xaab4c2, roughness: 0.95,
    }))
    for (let i = 0; i < SHOTS; i++) {
      const boulder = i >= SHOTS / 2
      const mesh = new THREE.Mesh(boulder ? boulderGeo : orbGeo, boulder ? boulderMat : orbMat)
      mesh.visible = false
      mesh.castShadow = true
      this.group.add(mesh)
      this.shots.push({ mesh, on: false, boulder, t: 0, dur: 1, arc: 0, from: new THREE.Vector3(), to: new THREE.Vector3(), radius: 1 })
    }

    const spikeGeo = own(new THREE.ConeGeometry(0.42, 2.3, 6).translate(0, 1.15, 0))
    const spikeMat = own(new THREE.MeshStandardMaterial({ color: 0xbfe9ff, emissive: 0x2a8fd0, emissiveIntensity: 0.6, roughness: 0.12, metalness: 0.05 }))
    for (let i = 0; i < SPIKES; i++) {
      const mesh = new THREE.Mesh(spikeGeo, spikeMat)
      mesh.visible = false
      mesh.castShadow = true
      this.group.add(mesh)
      this.spikesPool.push({ mesh, on: false, t: 0, h: 1 })
    }

    this.laneMat = own(new THREE.ShaderMaterial({
      vertexShader: WARN_VS,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uTime;
        varying vec2 vUv;
        void main() {
          float side = smoothstep(0.5, 0.42, abs(vUv.x - 0.5));
          float chevron = step(0.5, fract(vUv.y * 7.0 - abs(vUv.x - 0.5) * 2.0 - uTime * 3.0));
          float a = side * (0.25 + 0.3 * chevron) * smoothstep(1.0, 0.85, vUv.y);
          gl_FragColor = vec4(uColor * 1.4, a);
        }`,
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      uniforms: { uColor: { value: this.warnColor }, uTime: { value: 0 } },
    }))
    // Unit plane: x across, +z along (0..1).
    this.lane = new THREE.Mesh(own(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5)), this.laneMat)
    this.lane.visible = false
    this.group.add(this.lane)
    ctx.scene.add(this.group)
  }

  /** An expanding shockwave from (x, y, z). */
  ring(x: number, y: number, z: number, o: { speed?: number; maxR?: number; damage?: number; height?: number } = {}): void {
    const r = this.rings.find(q => !q.on)
    if (!r) return
    Object.assign(r, { on: true, x, y, z, r: 0.5, speed: o.speed ?? 9, maxR: o.maxR ?? 20, damage: o.damage ?? 1, hit: false })
    r.mesh.position.set(x, y + 0.02, z)
    r.mesh.scale.set(0.5, o.height ?? 0.7, 0.5)
    r.mesh.visible = true
  }

  /** A warning circle of radius `r` that fills for `delay` seconds, then calls `boom`. */
  warn(x: number, y: number, z: number, r: number, delay: number, boom: (() => void) | null): void {
    const w = this.warns.find(q => !q.on)
    if (!w) {
      boom?.()
      return
    }
    w.on = true
    w.t = 0
    w.delay = delay
    w.boom = boom
    w.mesh.position.set(x, y + 0.04, z)
    w.mesh.scale.setScalar(r)
    w.mat.uniforms.uFill.value = 0
    w.mesh.visible = true
  }

  /** An orb (falls, purple blast) or a boulder (thrown on an arc) landing at `to` after `dur` s. */
  lob(kind: 'orb' | 'boulder', from: V3, to: V3, dur: number, arc: number, radius: number): void {
    const boulder = kind === 'boulder'
    const s = this.shots.find(q => !q.on && q.boulder === boulder)
    if (!s) return
    s.on = true
    s.t = 0
    s.dur = dur
    s.arc = arc
    s.radius = radius
    s.from.set(from.x, from.y, from.z)
    s.to.set(to.x, to.y, to.z)
    s.mesh.position.copy(s.from)
    s.mesh.visible = true
    this.warn(to.x, to.y, to.z, radius, dur, null)
  }

  /** A line of `count` spikes from (x, z) along (dx, dz), each erupting `step` s after the last. */
  spikes(x: number, y: number, z: number, dx: number, dz: number, count: number, spacing: number, delay: number, step: number): void {
    for (let i = 0; i < count; i++) {
      const sx = x + dx * spacing * i
      const sz = z + dz * spacing * i
      this.warn(sx, y, sz, 0.95, delay + step * i, () => this.erupt(sx, y, sz))
    }
  }

  /** Run `fn` after `seconds` of fight time (dropped by clear()). */
  after(seconds: number, fn: () => void): void {
    this.timers.push({ t: seconds, fn })
  }

  showLane(x: number, y: number, z: number, yaw: number, length: number, width: number): void {
    this.lane.position.set(x, y + 0.05, z)
    this.lane.rotation.y = yaw
    this.lane.scale.set(width, 1, length)
    this.lane.visible = true
  }

  hideLane(): void {
    this.lane.visible = false
  }

  update(dt: number): void {
    this.time += dt
    this.laneMat.uniforms.uTime.value = this.time
    if (this.timers.length) {
      for (const tm of this.timers) tm.t -= dt
      const due = this.timers.filter(tm => tm.t <= 0)
      if (due.length) {
        this.timers = this.timers.filter(tm => tm.t > 0)
        for (const tm of due) tm.fn()
      }
    }
    for (const r of this.rings) if (r.on) this.stepRing(r, dt)
    for (const w of this.warns) {
      if (!w.on) continue
      w.t += dt
      w.mat.uniforms.uFill.value = Math.min(1, w.t / w.delay)
      w.mat.uniforms.uTime.value = this.time
      if (w.t < w.delay) continue
      w.on = false
      w.mesh.visible = false
      const boom = w.boom
      w.boom = null
      boom?.()
    }
    for (const s of this.shots) if (s.on) this.stepShot(s, dt)
    for (const k of this.spikesPool) {
      if (!k.on) continue
      k.t += dt
      const up = Math.min(1, k.t / SPIKE_UP)
      const down = Math.max(0, (k.t - SPIKE_UP - SPIKE_HOLD) / 0.35)
      k.mesh.scale.set(1, Math.max(0.001, k.h * up * (1 - down)), 1)
      if (down >= 1) {
        k.on = false
        k.mesh.visible = false
      }
    }
  }

  /** Clear every hazard at once (boss reset, travel). */
  clear(): void {
    this.timers = []
    for (const r of this.rings) r.on = r.mesh.visible = false
    for (const w of this.warns) {
      w.on = w.mesh.visible = false
      w.boom = null
    }
    for (const s of this.shots) s.on = s.mesh.visible = false
    for (const k of this.spikesPool) k.on = k.mesh.visible = false
    this.lane.visible = false
  }

  dispose(): void {
    this.group.removeFromParent()
    for (const o of this.owned) o.dispose()
    this.owned.length = 0
  }

  /* ── internals ───────────────────────────────────────────── */

  private stepRing(r: Ring, dt: number): void {
    r.r += r.speed * dt
    const fade = 1 - Math.max(0, (r.r - r.maxR * 0.7) / (r.maxR * 0.3))
    r.mat.uniforms.uAlpha.value = Math.max(0, fade)
    r.mesh.scale.x = r.mesh.scale.z = r.r
    if (r.r >= r.maxR) {
      r.on = false
      r.mesh.visible = false
      return
    }
    if (r.hit) return
    const p = this.ctx.player.position
    const d = Math.hypot(p.x - r.x, p.z - r.z)
    if (Math.abs(d - r.r) < RING_BAND && p.y - r.y < RING_CLEAR && p.y - r.y > -1.5) {
      r.hit = true
      this.hurt(r.damage, r.x, r.y, r.z)
    }
  }

  private stepShot(s: Shot, dt: number): void {
    s.t += dt
    const u = Math.min(1, s.t / s.dur)
    const m = s.mesh
    m.position.lerpVectors(s.from, s.to, u)
    m.position.y += 4 * s.arc * u * (1 - u)
    m.rotation.x += dt * (s.boulder ? 5 : 2)
    m.rotation.z += dt * 3
    if (u < 1) return
    s.on = false
    m.visible = false
    const { x, y, z } = s.to
    this.ctx.bus.emit('boss:impact', { pos: { x, y, z }, kind: s.boulder ? 'boulder' : 'orb' })
    this.ctx.fx.burst(s.boulder ? 'land' : 'poof', { x, y: y + 0.2, z }, { scale: s.radius, color: s.boulder ? '#d9e6f2' : '#9a5cff' })
    if (s.boulder) this.ctx.fx.burst('dust', { x, y, z }, { scale: 1.6, color: '#c9d6e4' })
    this.ctx.game.shake(s.boulder ? 0.35 : 0.2, 0.2)
    this.blast(x, y, z, s.radius)
  }

  private erupt(x: number, y: number, z: number): void {
    const k = this.spikesPool.find(q => !q.on)
    if (k) {
      k.on = true
      k.t = 0
      k.h = 0.8 + Math.random() * 0.45
      k.mesh.position.set(x, y - 0.1, z)
      k.mesh.rotation.set((Math.random() - 0.5) * 0.3, Math.random() * 6.28, (Math.random() - 0.5) * 0.3)
      k.mesh.scale.set(1, 0.001, 1)
      k.mesh.visible = true
    }
    this.ctx.bus.emit('boss:impact', { pos: { x, y, z }, kind: 'spike' })
    this.ctx.fx.burst('dust', { x, y: y + 0.1, z }, { count: 4, scale: 0.8, color: '#e6f4ff' })
    const p = this.ctx.player.position
    if (Math.hypot(p.x - x, p.z - z) < 1.05 && p.y - y < 1.6 && p.y - y > -1) {
      if (this.hurt(1, x, y - 1, z)) this.ctx.player.launch(9)
    }
  }

  /** Blast of `r` metres: the player is hurt when inside it (and not far above or below). */
  private blast(x: number, y: number, z: number, r: number): void {
    const p = this.ctx.player.position
    if (Math.hypot(p.x - x, p.z - z) < r && Math.abs(p.y - y) < 2) this.hurt(1, x, y, z)
  }

  private hurt(amount: number, x: number, y: number, z: number): boolean {
    const pl = this.ctx.player
    if (pl.invulnerable || pl.hp <= 0 || !pl.controlEnabled) return false
    pl.hurt(amount, { x, y, z })
    return true
  }
}
