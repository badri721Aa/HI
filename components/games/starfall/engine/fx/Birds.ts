/**
 * Occasional distant flocks: a loose V of flapping silhouettes that crosses the sky every
 * so often. One instanced draw; wing flapping happens in the vertex shader.
 */
import * as THREE from 'three'
import { FOG_FACTOR_GLSL, rand } from './gpu'

const MAX_BIRDS = 11
const COUNTS = [5, 7, 9, 11]

const VERT = /* glsl */ `
uniform float uTime;
uniform vec3 uFlock;
uniform float uYaw;
attribute float aWing;   // 0 body, 0.5 elbow, 1 tip
attribute vec4 iOffset;  // formation offset xyz, phase
#include <fog_pars_vertex>
void main() {
  float ph = uTime * 5.2 + iOffset.w * 6.28;
  // Alternate bursts of flapping with glides.
  float amp = 0.25 + 0.75 * smoothstep(-0.2, 0.4, sin(uTime * 0.45 + iOffset.w * 9.0));
  vec3 p = position;
  p.y += amp * (sin(ph) * 0.42 * min(aWing * 2.0, 1.0) + sin(ph - 0.8) * 0.38 * max(aWing * 2.0 - 1.0, 0.0));
  p += iOffset.xyz + vec3(0.0, sin(uTime * 0.7 + iOffset.w * 11.0) * 0.6, 0.0);
  float c = cos(uYaw);
  float s = sin(uYaw);
  vec3 wp = uFlock + vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  #ifdef USE_FOG
    vFogDepth = -mv.z;
  #endif
  gl_Position = projectionMatrix * mv;
}
`

const FRAG = /* glsl */ `
uniform vec3 uColor;
#include <fog_pars_fragment>
${FOG_FACTOR_GLSL}
void main() {
  vec3 col = uColor;
  #ifdef USE_FOG
    col = mix(col, fogColor, fxFogFactor());
  #endif
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

/** A gull-like silhouette facing +Z, wingspan ≈ 2.5 m (slightly oversized so it reads at distance). */
function birdGeometry(): THREE.InstancedBufferGeometry {
  const pos = [
    0, 0, 0.32, // 0 beak
    0, 0, -0.34, // 1 tail
    -0.5, 0.04, 0.12, // 2 L elbow front
    -0.42, 0.04, -0.12, // 3 L elbow back
    -1.0, 0, -0.2, // 4 L tip
    0.5, 0.04, 0.12, // 5 R
    0.42, 0.04, -0.12, // 6
    1.0, 0, -0.2, // 7
  ]
  const wing = [0, 0, 0.5, 0.5, 1, 0.5, 0.5, 1]
  const geo = new THREE.InstancedBufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos.map(v => v * 1.25), 3))
  geo.setAttribute('aWing', new THREE.Float32BufferAttribute(wing, 1))
  geo.setIndex([0, 2, 3, 0, 3, 1, 2, 4, 3, 0, 6, 5, 0, 1, 6, 5, 6, 7])
  const off = new Float32Array(MAX_BIRDS * 4)
  for (let i = 0; i < MAX_BIRDS; i++) {
    const rank = Math.ceil(i / 2)
    const side = i % 2 === 0 ? 1 : -1
    off[i * 4] = side * rank * 2.3 + rand(-0.5, 0.5)
    off[i * 4 + 1] = rand(-0.6, 0.6)
    off[i * 4 + 2] = -rank * 2.1 + rand(-0.5, 0.5)
    off[i * 4 + 3] = Math.random()
  }
  geo.setAttribute('iOffset', new THREE.InstancedBufferAttribute(off, 4))
  return geo
}

export class Birds {
  readonly mesh: THREE.Mesh
  private geo: THREE.InstancedBufferGeometry
  private mat: THREE.ShaderMaterial
  private active = false
  private timer = rand(6, 14)
  private ttl = 0
  private pos = new THREE.Vector3()
  private vel = new THREE.Vector3()

  constructor() {
    this.geo = birdGeometry()
    this.geo.instanceCount = COUNTS[2]
    this.mat = new THREE.ShaderMaterial({
      name: 'ambient-birds',
      uniforms: {
        ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
        uTime: { value: 0 },
        uFlock: { value: this.pos },
        uYaw: { value: 0 },
        uColor: { value: new THREE.Color('#2e2622') },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.DoubleSide,
      fog: true,
    })
    this.mesh = new THREE.Mesh(this.geo, this.mat)
    this.mesh.name = 'ambient-birds'
    this.mesh.frustumCulled = false
  }

  setQuality(levelIndex: number): void {
    this.geo.instanceCount = COUNTS[levelIndex]
  }

  /** `allowed` is false at night or while nothing should fly (no new flocks start). */
  update(dt: number, time: number, center: THREE.Vector3, allowed: boolean): void {
    this.mat.uniforms.uTime.value = time
    if (this.active) {
      this.pos.addScaledVector(this.vel, dt)
      this.ttl -= dt
      if (this.ttl <= 0 || !allowed) this.active = false
    } else if (allowed) {
      this.timer -= dt
      if (this.timer <= 0) this.launch(center)
    }
    this.mesh.visible = this.active
  }

  /** Start a flock far out on one side, crossing roughly over the player's surroundings. */
  private launch(center: THREE.Vector3): void {
    const a = Math.random() * Math.PI * 2
    const dist = rand(130, 170)
    this.pos.set(center.x + Math.cos(a) * dist, rand(38, 62), center.z + Math.sin(a) * dist)
    const b = a + Math.PI + rand(-0.55, 0.55)
    const tx = center.x + Math.cos(b) * dist
    const tz = center.z + Math.sin(b) * dist
    const speed = rand(8.5, 11.5)
    this.vel.set(tx - this.pos.x, 0, tz - this.pos.z)
    const len = this.vel.length()
    this.vel.multiplyScalar(speed / len)
    this.ttl = len / speed
    this.mat.uniforms.uYaw.value = Math.atan2(this.vel.x, this.vel.z)
    this.active = true
    this.timer = rand(18, 40)
  }

  dispose(): void {
    this.mesh.removeFromParent()
    this.geo.dispose()
    this.mat.dispose()
  }
}
