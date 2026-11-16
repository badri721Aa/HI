/**
 * Billboards — one draw call of additive, camera-facing quads.
 *
 * Each slot has a centre, a world size, a colour × intensity and a kind:
 *   0 = soft glow (glow texture), 1 = four-point star flare (analytic).
 * Slots are written straight into typed arrays; size 0 hides a slot.
 * Fog fades the light out instead of tinting it, which is what additive light should do.
 */
import * as THREE from 'three'

export const GLOW = 0
export const FLARE = 1

const vertex = /* glsl */ `
attribute vec4 aCenter;
attribute vec4 aColor;
attribute vec2 aMisc;
uniform float uBias;
varying vec2 vUv;
varying vec4 vColor;
varying float vKind;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vColor = aColor;
  vKind = aMisc.x;
  vec4 mvPosition = viewMatrix * vec4(aCenter.xyz, 1.0);
  float s = aCenter.w;
  float c = cos(aMisc.y);
  float sn = sin(aMisc.y);
  vec2 p = position.xy;
  mvPosition.xy += vec2(c * p.x - sn * p.y, sn * p.x + c * p.y) * s;
  // Pull the quad toward the camera so big glows don't slice into nearby geometry.
  float d = length(mvPosition.xyz);
  if (d > 1e-3) mvPosition.xyz -= mvPosition.xyz / d * min(s * uBias, d * 0.5);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`

const fragment = /* glsl */ `
uniform sampler2D uMap;
varying vec2 vUv;
varying vec4 vColor;
varying float vKind;
#include <fog_pars_fragment>
void main() {
  float a;
  if (vKind < 0.5) {
    a = texture2D(uMap, vUv).a;
  } else {
    vec2 q = vUv - 0.5;
    float r = length(q) * 2.0;
    float rays = exp(-abs(q.x) * 70.0) * exp(-abs(q.y) * 4.5) + exp(-abs(q.y) * 70.0) * exp(-abs(q.x) * 4.5);
    a = rays * (1.0 - smoothstep(0.55, 1.0, r)) + exp(-r * r * 60.0) * 0.35;
  }
  vec3 col = vColor.rgb * (vColor.a * a);
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
    #else
      float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
    #endif
    col *= 1.0 - fogFactor;
  #endif
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

export class Billboards {
  readonly mesh: THREE.Mesh
  private readonly center: Float32Array
  private readonly color: Float32Array
  private readonly misc: Float32Array
  private readonly aCenter: THREE.InstancedBufferAttribute
  private readonly aColor: THREE.InstancedBufferAttribute
  private readonly aMisc: THREE.InstancedBufferAttribute
  private readonly geometry: THREE.InstancedBufferGeometry
  private readonly material: THREE.ShaderMaterial
  private used = 0

  constructor(readonly capacity: number, map: THREE.Texture, opts: { bias?: number; name?: string } = {}) {
    const quad = new THREE.PlaneGeometry(1, 1)
    const geo = new THREE.InstancedBufferGeometry()
    geo.index = quad.index
    geo.setAttribute('position', quad.attributes.position)
    geo.setAttribute('uv', quad.attributes.uv)
    this.center = new Float32Array(capacity * 4)
    this.color = new Float32Array(capacity * 4)
    this.misc = new Float32Array(capacity * 2)
    this.aCenter = new THREE.InstancedBufferAttribute(this.center, 4).setUsage(THREE.DynamicDrawUsage)
    this.aColor = new THREE.InstancedBufferAttribute(this.color, 4).setUsage(THREE.DynamicDrawUsage)
    this.aMisc = new THREE.InstancedBufferAttribute(this.misc, 2).setUsage(THREE.DynamicDrawUsage)
    geo.setAttribute('aCenter', this.aCenter)
    geo.setAttribute('aColor', this.aColor)
    geo.setAttribute('aMisc', this.aMisc)
    geo.instanceCount = 0
    this.geometry = geo

    this.material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uMap: { value: null }, uBias: { value: opts.bias ?? 0.35 } }]),
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: true,
    })
    this.material.uniforms.uMap.value = map
    this.mesh = new THREE.Mesh(geo, this.material)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 2
    this.mesh.name = opts.name ?? 'billboards'
  }

  /** Reserve `n` consecutive slots; returns the first index. */
  alloc(n: number): number {
    const first = this.used
    if (first + n > this.capacity) throw new Error(`Billboards(${this.mesh.name}): capacity ${this.capacity} exceeded`)
    this.used += n
    this.geometry.instanceCount = this.used
    return first
  }

  set(i: number, x: number, y: number, z: number, size: number, r: number, g: number, b: number, intensity: number, kind = GLOW, rotation = 0): void {
    const c = i * 4
    this.center[c] = x
    this.center[c + 1] = y
    this.center[c + 2] = z
    this.center[c + 3] = size
    this.color[c] = r
    this.color[c + 1] = g
    this.color[c + 2] = b
    this.color[c + 3] = intensity
    this.misc[i * 2] = kind
    this.misc[i * 2 + 1] = rotation
  }

  /** Move a slot without touching its colour. */
  move(i: number, x: number, y: number, z: number, size: number): void {
    const c = i * 4
    this.center[c] = x
    this.center[c + 1] = y
    this.center[c + 2] = z
    this.center[c + 3] = size
  }

  intensity(i: number, v: number): void {
    this.color[i * 4 + 3] = v
  }

  rotate(i: number, angle: number): void {
    this.misc[i * 2 + 1] = angle
  }

  hide(i: number): void {
    this.center[i * 4 + 3] = 0
  }

  /** Upload this frame's changes (call once after all writes). */
  commit(): void {
    this.aCenter.needsUpdate = true
    this.aColor.needsUpdate = true
    this.aMisc.needsUpdate = true
  }

  dispose(): void {
    this.mesh.removeFromParent()
    this.geometry.dispose()
    this.material.dispose()
  }
}
