/**
 * Ancient portal arches: a stone doorway (batched into a ZoneKit, pillars solid) holding a
 * swirling membrane. Awake, the swirl spins in the destination's colours and walking into it
 * travels; sealed, it is a dark slow shimmer and an invisible pane stops the player.
 *
 * Local frame: the doorway spans local X (−INNER..INNER), the membrane lies in the plane
 * local z = 0, and the side the player walks in from faces `yaw` (forward = (sin yaw, cos yaw)).
 */
import * as THREE from 'three'
import type { Collider } from '../collision'
import type { V3 } from '../events'
import type { Ctx } from '../types'
import { worldBox, type ZoneKit } from '../world/zones/kit'
import { place } from './geo'

/** Half-width of the opening, outer half-width of the stonework, height where the arc begins (m). */
const INNER = 1.5
const OUTER = 2.3
const SPRING = 2.7
const DEPTH = 1.0
const PLINTH = 0.22

const SWIRL_VS = /* glsl */ `
varying vec2 vP;
void main() {
  vP = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

const SWIRL_FS = /* glsl */ `
uniform float uTime;
uniform float uOpen;
uniform vec3 uA;
uniform vec3 uB;
uniform sampler2D tNoise;
varying vec2 vP;
void main() {
  vec2 d = vP - vec2(0.0, ${(SPRING * 0.8).toFixed(2)});
  float r = length(d) / ${(INNER + 0.7).toFixed(2)};
  float a = atan(d.y, d.x);
  float sw = a + r * 5.0 - uTime * 1.3;
  float n = texture2D(tNoise, vec2(sw * 0.16, r * 0.5 - uTime * 0.07)).r;
  float bands = 0.5 + 0.5 * sin(sw * 3.0 + n * 4.0);
  float core = smoothstep(1.0, 0.05, r);
  vec3 col = mix(uB, uA, clamp(core * 0.85 + bands * 0.4 * n, 0.0, 1.0)) * (0.8 + core * 1.4 + bands * 0.25);
  vec3 sealed = vec3(0.012, 0.012, 0.016) + uB * 0.05 * bands * n;
  gl_FragColor = vec4(mix(sealed, col, uOpen), mix(0.9, 0.95, uOpen));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

export class Arch {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly yaw: number
  private readonly swirl: THREE.Mesh
  private readonly mat: THREE.ShaderMaterial
  private readonly seal: Collider
  private open = 1
  private target = 1

  constructor(private readonly ctx: Ctx, kit: ZoneKit, at: { x: number; y: number; z: number; yaw: number }, colors: [string, string]) {
    this.x = at.x
    this.y = at.y
    this.z = at.z
    this.yaw = at.yaw
    const { x, y, z, yaw } = this
    const c = Math.cos(yaw)
    const s = Math.sin(yaw)
    // Local (lx, lz) → world.
    const wx = (lx: number, lz: number) => x + lx * c + lz * s
    const wz = (lx: number, lz: number) => z - lx * s + lz * c
    const stone = kit.mat('stone', { color: '#b9b2a8' })
    const rune = kit.mat('glow', { color: colors[0], emissive: colors[1], emissiveIntensity: 2.4, key: `rune${colors[1]}` })

    kit.box({ x, y: y - 0.4, z, w: OUTER * 2 + 0.9, h: 0.4 + PLINTH, d: DEPTH + 0.9, yaw, mat: stone, collide: { surface: 'stone' } })
    const base = y + PLINTH
    for (const side of [-1, 1]) {
      const lx = side * (INNER + OUTER) / 2
      kit.box({ x: wx(lx, 0), y: base, z: wz(lx, 0), w: OUTER - INNER, h: SPRING, d: DEPTH, yaw, mat: stone, collide: { surface: 'stone' } })
      // A glowing rune strip down the face of each pillar, on both sides.
      for (const face of [-1, 1]) {
        kit.box({ x: wx(lx, face * (DEPTH / 2 + 0.01)), y: base + 0.5, z: wz(lx, face * (DEPTH / 2 + 0.01)), w: 0.12, h: SPRING - 0.9, d: 0.04, yaw, mat: rune, castShadow: false })
      }
    }
    // The arc: wedge-ish voussoirs around a half circle, and a bigger keystone with a gem.
    const n = 9
    const mid = (INNER + OUTER) / 2
    for (let i = 0; i < n; i++) {
      const a = ((i + 0.5) / n) * Math.PI
      const key = i === (n - 1) / 2
      const lx = Math.cos(a) * mid
      const ly = base + SPRING + Math.sin(a) * mid
      const geo = worldBox(((Math.PI * mid) / n) * 1.04, (OUTER - INNER) * (key ? 1.25 : 1), DEPTH * (key ? 1.15 : 1))
      kit.add(geo, stone, place(wx(lx, 0), ly, wz(lx, 0), 0, yaw, a - Math.PI / 2))
    }
    kit.add(new THREE.OctahedronGeometry(0.22, 0), rune, place(wx(0, DEPTH * 0.6), base + SPRING + OUTER - 0.05, wz(0, DEPTH * 0.6), 0, yaw, 0, 1, 1.4, 0.6))
    kit.add(new THREE.OctahedronGeometry(0.22, 0), rune, place(wx(0, -DEPTH * 0.6), base + SPRING + OUTER - 0.05, wz(0, -DEPTH * 0.6), 0, yaw, 0, 1, 1.4, 0.6))

    // The membrane fills the opening: a rectangle up to the spring line, a half disc above.
    const shape = new THREE.Shape()
    shape.moveTo(-INNER, 0)
    shape.lineTo(INNER, 0)
    shape.lineTo(INNER, SPRING)
    shape.absarc(0, SPRING, INNER, 0, Math.PI, false)
    shape.lineTo(-INNER, 0)
    this.mat = new THREE.ShaderMaterial({
      vertexShader: SWIRL_VS,
      fragmentShader: SWIRL_FS,
      transparent: true,
      // Open, the swirl shows only on the side you walk in from: arriving travellers stand in
      // front of an arch with the camera behind it, and must see the world, not the swirl.
      side: THREE.FrontSide,
      uniforms: {
        uTime: { value: 0 },
        uOpen: { value: 1 },
        uA: { value: new THREE.Color(colors[0]) },
        uB: { value: new THREE.Color(colors[1]) },
        tNoise: { value: ctx.textures.get('noise') },
      },
    })
    this.swirl = new THREE.Mesh(new THREE.ShapeGeometry(shape, 24), this.mat)
    this.swirl.position.set(x, base, z)
    this.swirl.rotation.y = yaw
    this.swirl.name = 'portal-swirl'
    kit.addObject(this.swirl)

    this.seal = ctx.collision.addBox({ x, y: base + SPRING / 2 + 0.5, z, hx: INNER, hy: SPRING / 2 + 0.5, hz: 0.12, yaw, tag: 'portal-seal' })
    this.seal.enabled = false
  }

  /** Awake (swirling, walk-through) or sealed (dark, solid). */
  setOpen(open: boolean, instant = false): void {
    this.target = open ? 1 : 0
    if (instant) this.open = this.target
    this.seal.enabled = !open
    // A sealed pane is a wall, so it reads from both sides.
    this.mat.side = open ? THREE.FrontSide : THREE.DoubleSide
  }

  get isOpen(): boolean {
    return this.target === 1
  }

  update(dt: number): void {
    this.open += (this.target - this.open) * Math.min(1, dt * 1.5)
    this.mat.uniforms.uOpen.value = this.open
    this.mat.uniforms.uTime.value += dt
  }

  /** Is the point inside the doorway (within `slab` metres of the membrane)? */
  inside(p: V3, slab = 0.5): boolean {
    const dx = p.x - this.x
    const dz = p.z - this.z
    const c = Math.cos(this.yaw)
    const s = Math.sin(this.yaw)
    const along = dx * s + dz * c
    const side = dx * c - dz * s
    return Math.abs(along) < slab && Math.abs(side) < INNER - 0.2 && p.y > this.y - 0.6 && p.y < this.y + SPRING + 1
  }

  /** Where someone coming out of this arch stands: `ahead` metres in front, facing away. */
  exitSpot(ahead = 3.2): { x: number; y: number; z: number; yaw: number } {
    return { x: this.x + Math.sin(this.yaw) * ahead, y: this.y, z: this.z + Math.cos(this.yaw) * ahead, yaw: this.yaw }
  }

  dispose(): void {
    this.ctx.collision.remove(this.seal)
    this.swirl.geometry.dispose()
    this.mat.dispose()
    this.swirl.removeFromParent()
  }
}
