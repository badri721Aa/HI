/**
 * Beams: aim lasers, healing tethers and the Plasma Overlord's sweeping rays — pooled
 * camera-facing ribbons between two points. Enemies call draw() every frame a beam shows;
 * flush() hides whatever wasn't drawn. Nothing is allocated per frame.
 */
import * as THREE from 'three'
import type { V3 } from '../../events'
import type { Ctx } from '../../types'

export const BEAM = { laser: 0, tether: 1, plasma: 2, lane: 3 } as const
export type BeamStyle = (typeof BEAM)[keyof typeof BEAM]

const VS = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

const FS = /* glsl */ `
uniform vec3 uColor;
uniform float uIntensity;
uniform float uStyle;
uniform float uTime;
uniform float uLength;
varying vec2 vUv;
void main() {
  float along = vUv.y * uLength;
  float x = vUv.x - 0.5;
  if (uStyle > 0.5 && uStyle < 1.5) {
    // Tether: a lazy wave with motes running toward the receiver.
    x += sin(along * 1.6 - uTime * 7.0) * 0.18;
  }
  float d = abs(x) * 2.0;
  float core = exp(-d * d * 28.0);
  float glow = exp(-d * d * 4.0);
  float ends = smoothstep(0.0, 0.04, vUv.y) * (1.0 - smoothstep(0.96, 1.0, vUv.y));
  float a;
  vec3 col;
  if (uStyle < 0.5) {
    float flick = 0.85 + 0.15 * sin(uTime * 41.0 + along * 3.0);
    col = uColor * (1.3 + core * 2.2) + vec3(core * 1.4);
    a = (core * 0.95 + glow * 0.35) * flick;
  } else if (uStyle < 1.5) {
    float motes = smoothstep(0.55, 1.0, sin(along * 3.2 - uTime * 9.0)) * core;
    col = uColor * (1.2 + core * 1.6 + motes * 2.0);
    a = core * 0.8 + glow * 0.3 + motes * 0.6;
  } else if (uStyle > 2.5) {
    // Lane: lies on the ground; chevrons run toward the far end.
    float chev = step(0.5, fract(along * 0.9 - abs(x) * 1.6 - uTime * 2.6));
    float side = 1.0 - smoothstep(0.4, 0.5, abs(x));
    col = uColor * (1.3 + chev * 0.9);
    a = side * (0.22 + chev * 0.38);
  } else {
    float ripple = 0.75 + 0.25 * sin(along * 2.4 - uTime * 26.0);
    col = uColor * (1.6 + glow * 1.2) + vec3(core * 2.6);
    a = (core + glow * 0.75 * ripple);
  }
  gl_FragColor = vec4(col, clamp(a * ends * uIntensity, 0.0, 1.0));
}`

interface Slot {
  mesh: THREE.Mesh
  u: { uColor: { value: THREE.Color }; uIntensity: { value: number }; uStyle: { value: number }; uTime: { value: number }; uLength: { value: number } }
}

const _from = new THREE.Vector3()
const _dir = new THREE.Vector3()
const _view = new THREE.Vector3()
const _x = new THREE.Vector3()
const _z = new THREE.Vector3()

export class Beams {
  private slots: Slot[] = []
  private used = 0
  private time = 0
  private readonly geo: THREE.PlaneGeometry
  private readonly group = new THREE.Group()

  constructor(private ctx: Ctx, capacity = 16) {
    // Unit ribbon: x across (−0.5..0.5), y along (0..1).
    this.geo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0)
    this.group.name = 'enemy-beams'
    for (let i = 0; i < capacity; i++) {
      const u = {
        uColor: { value: new THREE.Color() },
        uIntensity: { value: 1 },
        uStyle: { value: 0 },
        uTime: { value: 0 },
        uLength: { value: 1 },
      }
      const mat = new THREE.ShaderMaterial({
        vertexShader: VS,
        fragmentShader: FS,
        uniforms: u,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      })
      const mesh = new THREE.Mesh(this.geo, mat)
      mesh.matrixAutoUpdate = false
      mesh.frustumCulled = false
      mesh.visible = false
      mesh.renderOrder = 23
      this.group.add(mesh)
      this.slots.push({ mesh, u })
    }
    ctx.scene.add(this.group)
  }

  /** Show a beam this frame from `a` to `b`, `width` metres wide. */
  draw(a: V3, b: V3, width: number, color: THREE.Color, intensity: number, style: BeamStyle): void {
    if (this.used >= this.slots.length) return
    _from.set(a.x, a.y, a.z)
    _dir.set(b.x - a.x, b.y - a.y, b.z - a.z)
    const len = _dir.length()
    if (!(len > 1e-3)) return
    _dir.multiplyScalar(1 / len)
    const cam = this.ctx.camera.position
    _view.set(cam.x - (a.x + b.x) * 0.5, cam.y - (a.y + b.y) * 0.5, cam.z - (a.z + b.z) * 0.5)
    // Lanes lie flat on the floor; the rest turn to face the camera around their own axis.
    if (style === BEAM.lane) _view.set(0, 1, 0)
    _x.crossVectors(_dir, _view)
    if (_x.lengthSq() < 1e-8) _x.set(Math.abs(_dir.y) > 0.9 ? 1 : 0, Math.abs(_dir.y) > 0.9 ? 0 : 1, 0).cross(_dir)
    _x.normalize()
    _z.crossVectors(_x, _dir)
    const s = this.slots[this.used++]
    const m = s.mesh
    m.matrix.makeBasis(_x.multiplyScalar(width), _dir.multiplyScalar(len), _z).setPosition(_from)
    m.matrixWorldNeedsUpdate = true
    m.visible = true
    s.u.uColor.value.copy(color)
    s.u.uIntensity.value = intensity
    s.u.uStyle.value = style
    s.u.uTime.value = this.time
    s.u.uLength.value = len
  }

  /** Hide every beam not drawn since the last flush. Call once per frame after the enemies. */
  flush(dt: number): void {
    this.time += dt
    for (let i = this.used; i < this.slots.length; i++) {
      const m = this.slots[i].mesh
      if (m.visible) m.visible = false
    }
    this.used = 0
  }

  clear(): void {
    for (const s of this.slots) s.mesh.visible = false
    this.used = 0
  }

  dispose(): void {
    this.group.removeFromParent()
    this.geo.dispose()
    for (const s of this.slots) (s.mesh.material as THREE.Material).dispose()
    this.slots = []
  }
}
