/**
 * Everything in the Neon Metropolis that shines by itself, in two draws:
 *
 *   GlowBatch   one merged mesh of additive quads cut from the sign atlas: neon signs, light
 *               strips, lamp faces, beacons. Each quad has a colour, a brightness and a calm
 *               animation chosen from MODE (nothing changes faster than about once a second).
 *   holo        the holographic billboard: a floating panel that shows one picture and word
 *               after another, wiping slowly from each to the next, with scan lines.
 */
import * as THREE from 'three'
import type { TimeUniform } from './materials'
import type { Cell } from './textures'

/** How a quad's light behaves over time. */
export const MODE = {
  steady: 0,
  /** A slow swell (about 0.2 Hz). */
  breathe: 1,
  /** A tired tube: sags for a moment every nine seconds. */
  faulty: 2,
  /** An aircraft warning light: on for half a second every 2.2 s, eased in and out. */
  beacon: 3,
  /** A slow wave running round a ring of lamps (phase = position on the ring, 0..1). */
  chase: 4,
} as const
export type GlowMode = (typeof MODE)[keyof typeof MODE]

const GLOW_VS = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
attribute vec4 aColor;
attribute vec2 aAnim;
uniform float uTime;
varying vec2 vUv;
varying vec4 vColor;
void main() {
  vUv = uv;
  float ph = aAnim.x;
  float k = 1.0;
  if (aAnim.y > 3.5) {
    k = 0.45 + 0.55 * smoothstep(0.2, 1.0, 0.5 + 0.5 * sin((ph - uTime * 0.11) * 6.2832));
  } else if (aAnim.y > 2.5) {
    float c = fract(uTime / 2.2 + ph);
    k = 0.08 + 0.92 * smoothstep(0.0, 0.1, c) * (1.0 - smoothstep(0.24, 0.4, c));
  } else if (aAnim.y > 1.5) {
    float c = fract(uTime / 9.0 + ph);
    k = 1.0 - 0.6 * smoothstep(0.0, 0.035, c) * (1.0 - smoothstep(0.07, 0.13, c));
  } else if (aAnim.y > 0.5) {
    k = 0.82 + 0.18 * sin(uTime * 1.3 + ph * 6.2832);
  }
  vColor = vec4(aColor.rgb, aColor.a * k);
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`

const GLOW_FS = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform sampler2D tAtlas;
varying vec2 vUv;
varying vec4 vColor;
void main() {
  float m = texture2D(tAtlas, vUv).r;
  // The tube's colour, burning white along its core.
  vec3 col = vColor.rgb * (m * vColor.a) + vec3(m * m * m * 0.3 * vColor.a);
  #ifdef USE_FOG
    col *= 1.0 - 0.92 * smoothstep(fogNear, fogFar, vFogDepth);
  #endif
  gl_FragColor = vec4(min(col, vec3(8.0)), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

const _c = new THREE.Color()

/** Collects quads, then builds one mesh. */
export class GlowBatch {
  private pos: number[] = []
  private uv: number[] = []
  private col: number[] = []
  private anim: number[] = []
  private idx: number[] = []

  /**
   * A quad centred on (x, y, z) spanned by the half-extent vectors r (toward its right edge) and
   * u (toward its top edge).
   */
  quad(x: number, y: number, z: number, rx: number, ry: number, rz: number, ux: number, uy: number, uz: number, cell: Cell, color: THREE.ColorRepresentation, intensity: number, mode: GlowMode = MODE.steady, phase = 0): void {
    const base = this.pos.length / 3
    const corners: Array<[number, number, number, number]> = [[-1, -1, cell.u0, cell.v0], [1, -1, cell.u1, cell.v0], [1, 1, cell.u1, cell.v1], [-1, 1, cell.u0, cell.v1]]
    const c = _c.set(color)
    for (const [a, b, u, v] of corners) {
      this.pos.push(x + rx * a + ux * b, y + ry * a + uy * b, z + rz * a + uz * b)
      this.uv.push(u, v)
      this.col.push(c.r, c.g, c.b, intensity)
      this.anim.push(phase, mode)
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }

  /**
   * An upright quad `w` × `h` centred on (x, y, z), its face looking along `yaw` (forward =
   * (sin yaw, 0, cos yaw)), as seen from in front.
   */
  wall(x: number, y: number, z: number, yaw: number, w: number, h: number, cell: Cell, color: THREE.ColorRepresentation, intensity: number, mode: GlowMode = MODE.steady, phase = 0): void {
    this.quad(x, y, z, (Math.cos(yaw) * w) / 2, 0, (-Math.sin(yaw) * w) / 2, 0, h / 2, 0, cell, color, intensity, mode, phase)
  }

  /** A quad lying flat, `w` (along x before `yaw`) × `d`, facing up. */
  flat(x: number, y: number, z: number, w: number, d: number, cell: Cell, color: THREE.ColorRepresentation, intensity: number, mode: GlowMode = MODE.steady, phase = 0, yaw = 0): void {
    const c = Math.cos(yaw)
    const s = Math.sin(yaw)
    this.quad(x, y, z, (c * w) / 2, 0, (-s * w) / 2, (-s * d) / 2, 0, (-c * d) / 2, cell, color, intensity, mode, phase)
  }

  /**
   * A column of glyphs read top to bottom on an upright sign `w` wide and `h` tall (centre at
   * x, y, z; facing `yaw`). `cells`: the glyphs.
   */
  column(x: number, y: number, z: number, yaw: number, w: number, h: number, cells: readonly Cell[], color: THREE.ColorRepresentation, intensity: number, mode: GlowMode = MODE.steady, phase = 0): void {
    const step = h / cells.length
    const size = Math.min(w, step)
    cells.forEach((cell, i) => this.wall(x, y + h / 2 - step * (i + 0.5), z, yaw, size, size, cell, color, intensity, mode, phase))
  }

  /** The mesh (null when nothing was added); the caller disposes its geometry and material. */
  build(atlas: THREE.Texture, uTime: TimeUniform): THREE.Mesh | null {
    if (!this.idx.length) return null
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2))
    geo.setAttribute('aColor', new THREE.Float32BufferAttribute(this.col, 4))
    geo.setAttribute('aAnim', new THREE.Float32BufferAttribute(this.anim, 2))
    geo.setIndex(this.idx)
    const mat = new THREE.ShaderMaterial({
      name: 'starfall.neon.glow',
      vertexShader: GLOW_VS,
      fragmentShader: GLOW_FS,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { tAtlas: { value: null }, uTime: { value: 0 } }]),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: true,
    })
    mat.uniforms.tAtlas.value = atlas
    mat.uniforms.uTime = uTime
    const mesh = new THREE.Mesh(geo, mat)
    mesh.name = 'neon-glow'
    mesh.frustumCulled = false
    mesh.renderOrder = 3
    return mesh
  }
}

/** Seconds each holo picture shows (the wipe to the next takes the last 1.6 s). */
export const HOLO_PERIOD = 8
export const HOLO_ADS = 4

const HOLO_VS = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`

const HOLO_FS = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform sampler2D tAtlas;
uniform float uTime;
uniform float uAspect;
uniform float uGain;
uniform vec4 uIcon[${HOLO_ADS}];
uniform vec4 uWord[${HOLO_ADS}];
uniform vec3 uTintA[${HOLO_ADS}];
uniform vec3 uTintB[${HOLO_ADS}];
varying vec2 vUv;
/** Atlas brightness of rect (u0, v0, du, dv) at q (0..1 across the rect); 0 outside it. */
float holoCell(vec4 rect, vec2 q) {
  vec2 inside = step(vec2(0.0), q) * step(q, vec2(1.0));
  return texture2D(tAtlas, rect.xy + clamp(q, 0.0, 1.0) * rect.zw).r * inside.x * inside.y;
}
vec3 holoAd(int i, vec2 uv) {
  // The picture fills the upper part, the name runs underneath.
  vec2 iq = vec2((uv.x - 0.5) * uAspect / 0.6 + 0.5, (uv.y - 0.36) / 0.6);
  vec2 wq = vec2((uv.x - 0.5) * uAspect / 1.1 + 0.5, (uv.y - 0.07) / 0.275);
  float m = holoCell(uIcon[i], iq) + holoCell(uWord[i], wq);
  return mix(uTintB[i], uTintA[i], uv.y) * m;
}
void main() {
  float cyc = uTime / ${HOLO_PERIOD}.0;
  float f = fract(cyc);
  int a = int(mod(floor(cyc), ${HOLO_ADS}.0));
  int b = int(mod(floor(cyc) + 1.0, ${HOLO_ADS}.0));
  // The next picture wipes in from the bottom over the last fifth of the cycle.
  float wipe = smoothstep(0.8, 1.0, f) * 1.2 - 0.1;
  float next = 1.0 - smoothstep(wipe - 0.08, wipe + 0.08, vUv.y);
  vec3 col = mix(holoAd(a, vUv), holoAd(b, vUv), next);
  // Scan lines, a slow bright band drifting down, a faint haze so the panel reads as a sheet of light.
  float scan = 0.72 + 0.28 * sin(vUv.y * 150.0);
  float bd = (fract(vUv.y + uTime * 0.07) - 0.5) * 9.0;
  float band = exp(-bd * bd);
  vec3 tint = mix(uTintB[a], uTintA[a], vUv.y);
  col = col * scan * (1.0 + band * 0.5) + tint * (0.035 + band * 0.03);
  // A frame of light, and soft edges.
  vec2 e = min(vUv, 1.0 - vUv);
  float frame = (1.0 - smoothstep(0.006, 0.014, e.y)) + (1.0 - smoothstep(0.004, 0.009, e.x));
  col += tint * frame * 0.5;
  col *= smoothstep(0.0, 0.01, e.x) * smoothstep(0.0, 0.015, e.y);
  #ifdef USE_FOG
    col *= 1.0 - 0.9 * smoothstep(fogNear, fogFar, vFogDepth);
  #endif
  gl_FragColor = vec4(min(col * uGain, vec3(6.0)), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

export interface HoloAd {
  icon: Cell
  word: Cell
  /** Colours at the top and the bottom of the picture. */
  top: THREE.ColorRepresentation
  bottom: THREE.ColorRepresentation
}

/** The holographic billboard's material for a panel `aspect` times as wide as it is tall. */
export function holoMaterial(atlas: THREE.Texture, uTime: TimeUniform, aspect: number, ads: readonly HoloAd[], gain: number): THREE.ShaderMaterial {
  const rect = (c: Cell) => new THREE.Vector4(c.u0, c.v0, c.u1 - c.u0, c.v1 - c.v0)
  const list = Array.from({ length: HOLO_ADS }, (_, i) => ads[i % ads.length])
  const mat = new THREE.ShaderMaterial({
    name: 'starfall.neon.holo',
    vertexShader: HOLO_VS,
    fragmentShader: HOLO_FS,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        tAtlas: { value: null },
        uTime: { value: 0 },
        uAspect: { value: aspect },
        uGain: { value: gain },
        uIcon: { value: list.map(a => rect(a.icon)) },
        uWord: { value: list.map(a => rect(a.word)) },
        uTintA: { value: list.map(a => new THREE.Color(a.top)) },
        uTintB: { value: list.map(a => new THREE.Color(a.bottom)) },
      },
    ]),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: true,
  })
  mat.uniforms.tAtlas.value = atlas
  mat.uniforms.uTime = uTime
  return mat
}
