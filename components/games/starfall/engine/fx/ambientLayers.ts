/**
 * GPU "wrap-around" ambient layers: a fixed set of instanced quads whose world positions
 * tile a box centred on the player (positions wrap as you move), lifted onto the baked
 * surface-height map and thinned by a baked density channel. Zero per-frame CPU work
 * beyond a few uniforms; one draw call per layer.
 */
import * as THREE from 'three'
import { FOG_FACTOR_GLSL, MIN_PIXEL_GLSL, quadGeometry } from './gpu'
import { MAP_XFORM, type WorldMap } from './worldMap'

export type LayerKind = 'fireflies' | 'pollen' | 'leaves'

interface LayerDef {
  /** Instance counts per quality level (low, medium, high, ultra). */
  counts: [number, number, number, number]
  /** Side of the wrap box (m). */
  box: number
  additive: boolean
}

export const LAYERS: Record<LayerKind, LayerDef> = {
  fireflies: { counts: [50, 110, 180, 260], box: 64, additive: true },
  pollen: { counts: [90, 180, 300, 420], box: 34, additive: true },
  leaves: { counts: [24, 50, 90, 130], box: 44, additive: false },
}

/** Single leaves cut from the leaves_albedo atlas: [x, y, w, h] in 512² pixels (top-left origin). */
const LEAF_RECTS = [
  [279, 374, 30, 26],
  [300, 419, 72, 54],
  [308, 286, 46, 38],
  [411, 387, 54, 42],
]

const COMMON = /* glsl */ `
uniform float uTime;
uniform float uBox;
uniform float uViewHeight;
uniform float uIntensity;
uniform float uDark;
uniform vec3 uCenter;
uniform vec3 uSunDir;
uniform vec3 uWind;
uniform vec2 uMapXform;
uniform sampler2D uHeight;
uniform sampler2D uDensity;
attribute vec4 iSeed;
attribute vec4 iSeed2;
varying vec2 vUv;
varying vec4 vColor;
#include <fog_pars_vertex>
${MIN_PIXEL_GLSL}

/** Wraps a world XZ position into the box around uCenter; returns xz and the 0..1 edge fade in z. */
vec3 wrapXZ(vec2 p) {
  vec2 rel = mod(p - uCenter.xz + 0.5 * uBox, uBox) - 0.5 * uBox;
  float d = max(abs(rel.x), abs(rel.y)) / (0.5 * uBox);
  return vec3(uCenter.xz + rel, 1.0 - smoothstep(0.72, 1.0, d));
}
vec2 mapUv(vec2 xz) { return xz * uMapXform.x + uMapXform.y; }
`

const VERT: Record<LayerKind, string> = {
  fireflies: /* glsl */ `
${COMMON}
void main() {
  float t = uTime;
  vec2 wander = vec2(
    sin(t * 0.31 + iSeed.z * 40.0) * 1.6 + sin(t * 0.83 + iSeed.w * 17.0) * 0.5,
    cos(t * 0.27 + iSeed.w * 31.0) * 1.6 + cos(t * 0.71 + iSeed.z * 13.0) * 0.5);
  vec3 w = wrapXZ(iSeed.xy * uBox + wander);
  vec2 uv = mapUv(w.xy);
  float ground = texture2D(uHeight, uv).r;
  float dens = texture2D(uDensity, uv).r * uIntensity;
  float vis = smoothstep(iSeed2.x, iSeed2.x + 0.12, dens) * w.z;
  vec3 wp = vec3(w.x, ground + 0.45 + iSeed.z * 2.6 + sin(t * 0.9 + iSeed2.w * 20.0) * 0.35, w.y);

  // Slow pulses: mostly dim, glowing for about a third of the time.
  float blink = smoothstep(0.25, 1.0, sin(t * (0.7 + iSeed2.y * 1.1) + iSeed2.z * 60.0));
  float glow = 0.06 + 0.94 * blink;

  vec4 mv = viewMatrix * vec4(wp, 1.0);
  float size = 0.26 * (0.8 + 0.4 * iSeed2.y) * step(0.001, vis);
  float a = fxMinPixel(size, mv.z, 1.5) * vis;
  mv.xy += position.xy * size;
  vec3 tint = mix(vec3(0.62, 1.0, 0.22), vec3(1.0, 0.82, 0.25), iSeed2.w);
  vUv = position.xy;
  vColor = vec4(tint * glow * 3.2, a);
  #ifdef USE_FOG
    vFogDepth = -mv.z;
  #endif
  gl_Position = projectionMatrix * mv;
}
`,
  pollen: /* glsl */ `
${COMMON}
void main() {
  float t = uTime;
  vec2 swirl = vec2(sin(t * 0.43 + iSeed.z * 23.0), cos(t * 0.37 + iSeed.w * 19.0)) * 0.7;
  vec3 w = wrapXZ(iSeed.xy * uBox + uWind.xz * t + swirl);
  vec2 uv = mapUv(w.xy);
  float ground = texture2D(uHeight, uv).r;
  float dens = texture2D(uDensity, uv).b * uIntensity;
  float vis = smoothstep(iSeed2.x, iSeed2.x + 0.15, dens) * w.z;
  vec3 wp = vec3(w.x, ground + 0.3 + iSeed.z * 3.6 + sin(t * 0.5 + iSeed2.z * 30.0) * 0.4, w.y);

  // Motes light up when they sit between the eye and the low sun (forward scattering).
  vec3 toP = normalize(wp - cameraPosition);
  float glint = pow(max(dot(toP, uSunDir), 0.0), 6.0);
  float twinkle = 0.7 + 0.3 * sin(t * (2.0 + iSeed2.y * 3.0) + iSeed2.w * 50.0);
  float bright = (0.25 + 2.8 * glint) * twinkle * (1.0 - 0.85 * uDark);

  vec4 mv = viewMatrix * vec4(wp, 1.0);
  float size = (0.035 + 0.03 * iSeed2.y) * step(0.001, vis);
  float a = fxMinPixel(size, mv.z, 1.3) * vis;
  mv.xy += position.xy * size;
  vUv = position.xy;
  vColor = vec4(vec3(1.0, 0.9, 0.68) * bright, a);
  #ifdef USE_FOG
    vFogDepth = -mv.z;
  #endif
  gl_Position = projectionMatrix * mv;
}
`,
  leaves: /* glsl */ `
${COMMON}
uniform vec4 uRects[4];
varying vec4 vRect;
varying float vShade;
void main() {
  float t = uTime;
  const float range = 9.0;
  float fall = 0.55 + 0.5 * iSeed2.y;
  float phase = fract(iSeed.z + t * fall / range);
  vec2 sway = vec2(sin(t * 1.6 + iSeed.w * 20.0), cos(t * 1.25 + iSeed2.z * 13.0)) * 0.55;
  vec3 w = wrapXZ(iSeed.xy * uBox + uWind.xz * t * 0.6 + sway);
  vec2 uv = mapUv(w.xy);
  float ground = texture2D(uHeight, uv).r;
  float dens = texture2D(uDensity, uv).g * uIntensity;
  float vis = smoothstep(iSeed2.x, iSeed2.x + 0.1, dens) * w.z;
  vec3 wp = vec3(w.x, ground + 0.15 + (1.0 - phase) * range, w.y);

  // Flutter: spin in the screen plane and flip around the leaf's long axis.
  float ang = t * (0.8 + iSeed2.w * 1.6) * (iSeed.w > 0.5 ? 1.0 : -1.0) + iSeed.z * 6.28;
  float flip = cos(t * (2.2 + iSeed2.z * 2.0) + iSeed.w * 9.0);
  float size = (0.11 + 0.07 * iSeed2.w) * vis * smoothstep(1.0, 0.94, phase);
  vec2 q = position.xy * vec2(max(abs(flip), 0.18), 1.0) * size;
  float c = cos(ang);
  float s = sin(ang);
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  mv.xy += vec2(c * q.x - s * q.y, s * q.x + c * q.y);

  int r = int(min(iSeed2.z * 4.0, 3.0));
  vRect = uRects[r];
  vShade = flip > 0.0 ? 1.0 : 0.72;
  vUv = position.xy;
  vColor = vec4(1.0);
  #ifdef USE_FOG
    vFogDepth = -mv.z;
  #endif
  gl_Position = projectionMatrix * mv;
}
`,
}

const FRAG: Record<LayerKind, string> = {
  fireflies: /* glsl */ `
varying vec2 vUv;
varying vec4 vColor;
#include <fog_pars_fragment>
${FOG_FACTOR_GLSL}
void main() {
  float r2 = dot(vUv, vUv);
  float a = (exp(-r2 * 7.0) * 0.55 + exp(-r2 * 70.0)) * vColor.a;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor.rgb * (1.0 - fxFogFactor()), a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`,
  pollen: /* glsl */ `
varying vec2 vUv;
varying vec4 vColor;
#include <fog_pars_fragment>
${FOG_FACTOR_GLSL}
void main() {
  float r2 = dot(vUv, vUv);
  float a = exp(-r2 * 4.0) * (1.0 - smoothstep(0.7, 1.0, r2)) * vColor.a;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor.rgb * (1.0 - fxFogFactor()), a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`,
  leaves: /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uLight;
varying vec2 vUv;
varying vec4 vColor;
varying vec4 vRect;
varying float vShade;
#include <fog_pars_fragment>
${FOG_FACTOR_GLSL}
void main() {
  // Leaf-shaped mask trims neighbouring leaves out of the atlas cell.
  float m = 1.0 - smoothstep(0.82, 1.0, length(vUv * vec2(1.0, 1.12)));
  vec2 uv = vRect.xy + (vUv * 0.5 + 0.5) * vRect.zw;
  vec4 tex = texture2D(uMap, uv);
  if (tex.a * m < 0.5) discard;
  vec3 col = tex.rgb * uLight * vShade;
  #ifdef USE_FOG
    col = mix(col, fogColor, fxFogFactor());
  #endif
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`,
}

/** Shared uniforms every layer reads (the Ambient system updates them once per frame). */
export interface LayerUniforms {
  uTime: THREE.IUniform<number>
  uViewHeight: THREE.IUniform<number>
  uDark: THREE.IUniform<number>
  uCenter: THREE.IUniform<THREE.Vector3>
  uSunDir: THREE.IUniform<THREE.Vector3>
  uWind: THREE.IUniform<THREE.Vector3>
  uMapXform: THREE.IUniform<THREE.Vector2>
  uHeight: THREE.IUniform<THREE.Texture>
  uDensity: THREE.IUniform<THREE.Texture>
}

export function createLayerUniforms(map: WorldMap): LayerUniforms {
  return {
    uTime: { value: 0 },
    uViewHeight: { value: 720 },
    uDark: { value: 0 },
    uCenter: { value: new THREE.Vector3() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uWind: { value: new THREE.Vector3(0.45, 0, 0.25) },
    uMapXform: { value: MAP_XFORM },
    uHeight: { value: map.height },
    uDensity: { value: map.density },
  }
}

export class AmbientLayer {
  readonly mesh: THREE.Mesh
  readonly uniforms: { uIntensity: THREE.IUniform<number>; uLight?: THREE.IUniform<THREE.Color> }
  private geo: THREE.InstancedBufferGeometry
  private mat: THREE.ShaderMaterial

  constructor(readonly kind: LayerKind, shared: LayerUniforms, leafAtlas: THREE.Texture | null) {
    const def = LAYERS[kind]
    const max = def.counts[3]
    const geo = new THREE.InstancedBufferGeometry()
    quadGeometry(geo)
    // Deterministic seeds so the layout is stable between sessions.
    let s = kind.length * 7919
    const rnd = () => {
      s = (s * 16807) % 2147483647
      return (s - 1) / 2147483646
    }
    const a = new Float32Array(max * 4)
    const b = new Float32Array(max * 4)
    for (let i = 0; i < max * 4; i++) {
      a[i] = rnd()
      b[i] = rnd()
    }
    geo.setAttribute('iSeed', new THREE.InstancedBufferAttribute(a, 4))
    geo.setAttribute('iSeed2', new THREE.InstancedBufferAttribute(b, 4))
    geo.instanceCount = def.counts[2]
    this.geo = geo

    const own: Record<string, THREE.IUniform> = { uIntensity: { value: 1 }, uBox: { value: def.box } }
    if (kind === 'leaves') {
      own.uMap = { value: leafAtlas }
      own.uLight = { value: new THREE.Color(1, 0.92, 0.8) }
      own.uRects = { value: LEAF_RECTS.map(([x, y, w, h]) => new THREE.Vector4(x / 512, 1 - (y + h) / 512, w / 512, h / 512)) }
    }
    this.uniforms = own as AmbientLayer['uniforms']
    this.mat = new THREE.ShaderMaterial({
      name: `ambient-${kind}`,
      // Shared uniform objects are referenced (not cloned) so one update reaches every layer.
      uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), ...shared, ...own },
      vertexShader: VERT[kind],
      fragmentShader: FRAG[kind],
      transparent: def.additive,
      depthWrite: !def.additive,
      blending: def.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      fog: true,
    })
    this.mesh = new THREE.Mesh(geo, this.mat)
    this.mesh.name = `ambient-${kind}`
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = def.additive ? 15 : 0
  }

  setQuality(levelIndex: number): void {
    this.geo.instanceCount = LAYERS[this.kind].counts[levelIndex]
  }

  dispose(): void {
    this.mesh.removeFromParent()
    this.geo.dispose()
    this.mat.dispose()
  }
}
