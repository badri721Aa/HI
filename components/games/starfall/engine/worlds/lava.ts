/**
 * Molten-rock kit (the Volcanic Ruins use all of it; any hot map may):
 *
 *   lavaRibbon     a flat strip along a path (rivers, channels, cascades, falls) carrying what
 *                  the lava shader needs: metres across / along, the edge and the flow speed
 *   lavaMaterial   self-lit flowing lava: hot cores, cooling dark crust plates with glowing
 *                  seams, crusted banks; 'flow' (rivers), 'fall' (a curtain pouring down) and
 *                  'sea' (a cooling lake seen from far above). Fog-aware, NaN-safe, clamped.
 *   HeatField      the light lava throws on nearby rock without real lights (adding lights
 *                  would recompile every lit shader on each trip): a few glowing spheres plus
 *                  the lava sea's plane, read by heatMaterial
 *   heatMaterial   a MeshStandardMaterial lit by a HeatField, with options: world triplanar
 *                  rock-and-ash texturing (no UV stretching on cliffs), ash dusting on top faces
 *                  and glowing fissures where the ground is hot
 *   embers         sparks drifting up around the camera (one Points draw, allocation-free)
 *
 * Every pattern scrolls with `uTime` wrapped where its textures tile, so nothing loses
 * precision however long the game runs; pulses stay well under 1 Hz.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { TexName } from '../textures'
import type { Ctx } from '../types'

/** A shared animation clock (set `.value = t` once per frame). */
export type TimeUniform = { value: number }

/** Heat sources a HeatField holds (a fixed shader loop). */
export const HEAT_SOURCES = 10

/* ── lava ribbons ─────────────────────────────────────────── */

export type PathPoint = readonly [number, number, number]

/**
 * A strip of lava along `path` (smoothed through its points): `width` (one value, or one per
 * point), flowing toward the path's end at `speed` m/s. Columns across let the middle bulge a
 * little; `step` is the length of each slice (m). Attributes: position, uv (metres across,
 * metres along), aEdge (−1…1 across) and aSpeed.
 */
export function lavaRibbon(path: readonly PathPoint[], width: number | readonly number[], speed: number, step = 0.8, bulge = 0.06): THREE.BufferGeometry {
  const pts = path.map(p => new THREE.Vector3(p[0], p[1], p[2]))
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal')
  const len = curve.getLength()
  const n = Math.max(2, Math.ceil(len / step))
  const across = [-1, -0.5, 0, 0.5, 1]
  const cols = across.length
  const pos = new Float32Array((n + 1) * cols * 3)
  const uv = new Float32Array((n + 1) * cols * 2)
  const edge = new Float32Array((n + 1) * cols)
  const spd = new Float32Array((n + 1) * cols).fill(speed)
  const p = new THREE.Vector3()
  const t = new THREE.Vector3()
  let sx = 1
  let sz = 0
  let along = 0
  const prev = new THREE.Vector3()
  for (let i = 0; i <= n; i++) {
    const u = i / n
    curve.getPointAt(u, p)
    curve.getTangentAt(u, t)
    // Sideways = the horizontal tangent turned a quarter; a vertical stretch (a fall) keeps the last one.
    const h = Math.hypot(t.x, t.z)
    if (h > 1e-3) {
      sx = t.z / h
      sz = -t.x / h
    }
    if (i > 0) along += p.distanceTo(prev)
    prev.copy(p)
    const half = 0.5 * (typeof width === 'number' ? width : widthAt(width, u))
    for (let c = 0; c < cols; c++) {
      const a = across[c]
      const k = (i * cols + c) * 3
      pos[k] = p.x + sx * a * half
      pos[k + 1] = p.y + (1 - a * a) * bulge
      pos[k + 2] = p.z + sz * a * half
      uv[(i * cols + c) * 2] = a * half
      uv[(i * cols + c) * 2 + 1] = along
      edge[i * cols + c] = a
    }
  }
  const index: number[] = []
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = i * cols + c
      const b = a + cols
      // Wound so the strip faces up whichever way it runs.
      index.push(a, b, a + 1, a + 1, b, b + 1)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  g.setAttribute('aEdge', new THREE.BufferAttribute(edge, 1))
  g.setAttribute('aSpeed', new THREE.BufferAttribute(spd, 1))
  g.setIndex(index)
  return g
}

function widthAt(w: readonly number[], u: number): number {
  const f = u * (w.length - 1)
  const i = Math.min(w.length - 2, Math.floor(f))
  return w[i] + (w[i + 1] - w[i]) * (f - i)
}

/**
 * A round pool of lava (centre x, y, z; radius r) as a ribbon-compatible disc: aEdge runs from
 * the middle to the rim, the crust creeping in from the edge, and it churns slowly in place.
 */
export function lavaPool(x: number, y: number, z: number, r: number, seg = 24): THREE.BufferGeometry {
  const g = new THREE.CircleGeometry(r, seg, 0, Math.PI * 2).rotateX(-Math.PI / 2).translate(x, y, z)
  const pos = g.attributes.position as THREE.BufferAttribute
  const uv = new Float32Array(pos.count * 2)
  const edge = new Float32Array(pos.count)
  for (let i = 0; i < pos.count; i++) {
    const dx = pos.getX(i) - x
    const dz = pos.getZ(i) - z
    uv[i * 2] = dx
    uv[i * 2 + 1] = dz
    edge[i] = Math.min(1, Math.hypot(dx, dz) / r)
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  g.setAttribute('aEdge', new THREE.BufferAttribute(edge, 1))
  g.setAttribute('aSpeed', new THREE.BufferAttribute(new Float32Array(pos.count).fill(0.12), 1))
  g.deleteAttribute('normal')
  return g
}

/** Merge lava strips and pools into one geometry (one draw call); frees the parts. */
export function mergeLava(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, false)
  for (const g of parts) g.dispose()
  if (!merged) throw new Error('lava: geometry merge failed')
  merged.computeBoundingSphere()
  return merged
}

/* ── the lava shader ──────────────────────────────────────── */

const LAVA_VS = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
attribute float aEdge;
attribute float aSpeed;
varying vec2 vLuv;
varying float vEdge;
varying float vSpeed;
varying vec3 vW;
void main() {
  vLuv = uv;
  vEdge = aEdge;
  vSpeed = aSpeed;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`

/**
 * Each mode writes `heat` (0 cool … 1 white-hot), `cool` (0 molten … 1 crusted over) and
 * `seam` (glowing cracks through the crust). Scrolls wrap at 40 m: every scale used is a
 * multiple of 1/40, so the noise texture tiles across the wrap and nothing jumps.
 */
const LAVA_MODES = {
  flow: /* glsl */ `
    float s1 = mod(uTime * vSpeed, 40.0);
    float s2 = mod(uTime * vSpeed * 0.55, 40.0);
    vec2 p = vLuv;
    float warp = lavaN(vec2(p.x * 0.05 + 0.31, (p.y - s2) * 0.05)) - 0.5;
    float n1 = lavaN(vec2(p.x * 0.125 + warp * 0.3, (p.y - s1) * 0.075));
    float n2 = lavaN(vec2(p.x * 0.275 - warp * 0.2 + 0.5, (p.y - s1) * 0.175));
    float heat = clamp(n1 * 0.62 + n2 * 0.38, 0.0, 1.0);
    float edge = abs(vEdge);
    // The banks skin over first; the middle runs hot.
    float cool = 1.0 - smoothstep(0.36, 0.52, heat + 0.12 - edge * 0.22);
    cool = max(cool, smoothstep(0.7, 1.0, edge) * 0.85);
    float c = texture2D(tNoise, vec2(p.x * 0.325 + 0.17, (p.y - s1) * 0.325), 1.0).r;
    float cw = max(fwidth(c) * 1.3, 0.025);
    float seam = (1.0 - smoothstep(0.0, cw, abs(c - 0.5))) * (0.025 / cw);`,
  fall: /* glsl */ `
    float s1 = mod(uTime * vSpeed, 40.0);
    float s2 = mod(uTime * vSpeed * 0.7, 40.0);
    vec2 p = vLuv;
    float n1 = lavaN(vec2(p.x * 0.35, (p.y - s1) * 0.025));
    float n2 = lavaN(vec2(p.x * 0.75 + 0.4, (p.y - s2) * 0.05));
    float heat = clamp(n1 * 0.55 + n2 * 0.45 + 0.08, 0.0, 1.0);
    float edge = abs(vEdge);
    // Dark strands of crust stretched down the curtain, thickest at its sides.
    float cool = 1.0 - smoothstep(0.34, 0.5, heat - edge * 0.25);
    float seam = 0.0;`,
  sea: /* glsl */ `
    vec2 p = vW.xz - uOrigin;
    float d = uTime * 0.0025;
    float big = lavaN(p * 0.0045 + vec2(d, d * 0.6));
    float n1 = lavaN(p * 0.017 + vec2(-d * 1.4, d));
    float heat = clamp(big * 0.55 + n1 * 0.45, 0.0, 1.0);
    float cool = 1.0 - smoothstep(0.6, 0.74, heat);
    float c = texture2D(tNoise, p * 0.031 + vec2(d * 0.8, -d * 1.2) + 0.21, 1.5).r;
    float cw = max(fwidth(c) * 1.4, 0.03);
    float seam = (1.0 - smoothstep(0.0, cw, abs(c - 0.5))) * (0.03 / cw) * smoothstep(0.4, 0.62, big) * 0.6;`,
} as const

export type LavaMode = keyof typeof LAVA_MODES

const LAVA_FS = (mode: LavaMode) => /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform float uTime;
uniform sampler2D tNoise;
uniform vec3 uHot;
uniform vec3 uWarm;
uniform vec3 uDeep;
uniform vec3 uCrust;
uniform vec2 uOrigin;
uniform float uGlow;
varying vec2 vLuv;
varying float vEdge;
varying float vSpeed;
varying vec3 vW;
float lavaN(vec2 q) { return texture2D(tNoise, q).r; }
void main() {
  ${LAVA_MODES[mode]}
  vec3 molten = mix(uDeep, uWarm, smoothstep(0.3, 0.6, heat));
  molten = mix(molten, uHot, smoothstep(0.62, 0.86, heat));
  float pulse = 0.9 + 0.1 * sin(uTime * 0.7 + heat * 6.0);
  vec3 crust = uCrust * (0.55 + 0.9 * heat);
  vec3 col = (mix(molten * pulse, crust, cool) + uWarm * seam * cool * 0.8) * uGlow;
  gl_FragColor = vec4(clamp(col, 0.0, 4.0), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`

export interface LavaLook {
  /** White-hot, orange and deep-red molten colours (linear, may exceed 1 to bloom) and the crust. */
  hot?: THREE.ColorRepresentation
  warm?: THREE.ColorRepresentation
  deep?: THREE.ColorRepresentation
  crust?: THREE.ColorRepresentation
  /** World x, z the 'sea' pattern is laid out from. */
  origin?: { x: number; z: number }
  /** Overall brightness (1 = as the colours say). */
  glow?: number
}

/** Self-lit lava for ribbons/pools ('flow', 'fall') or a big sheet ('sea'). */
export function lavaMaterial(ctx: Ctx, mode: LavaMode, uTime: TimeUniform, look: LavaLook = {}): THREE.ShaderMaterial {
  // A fall hangs vertically: seen from either side.
  const col = (c: THREE.ColorRepresentation, k: number) => new THREE.Color(c).multiplyScalar(k)
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog])
  Object.assign(uniforms, {
    uTime,
    tNoise: { value: ctx.textures.get('noise') },
    uHot: { value: col(look.hot ?? '#ffd27a', 3.2) },
    uWarm: { value: col(look.warm ?? '#ff6a12', 2.2) },
    uDeep: { value: col(look.deep ?? '#b3200a', 0.85) },
    uCrust: { value: col(look.crust ?? '#2a1712', 0.6) },
    uOrigin: { value: new THREE.Vector2(look.origin?.x ?? 0, look.origin?.z ?? 0) },
    uGlow: { value: look.glow ?? 1 },
  })
  const mat = new THREE.ShaderMaterial({ vertexShader: LAVA_VS, fragmentShader: LAVA_FS(mode), uniforms, fog: true, side: mode === 'fall' ? THREE.DoubleSide : THREE.FrontSide })
  mat.name = `lava-${mode}`
  return mat
}

/* ── heat: lava light on rock ─────────────────────────────── */

/** The uniforms every heatMaterial of a map shares. */
export interface HeatField {
  /** xyz: a glowing spot (world), w: how far its light reaches (m). Unused slots reach 0. */
  sources: THREE.Vector4[]
  /** x: height of the lava sea, y: how far up from it rock still glows (m). */
  plane: THREE.Vector2
  color: THREE.Color
  /** The fissures' slow shimmer (set `.value = t` each frame). */
  time: TimeUniform
}

export function heatField(color: THREE.ColorRepresentation = '#ff5a14'): HeatField {
  return {
    sources: Array.from({ length: HEAT_SOURCES }, () => new THREE.Vector4(0, -1e5, 0, 1)),
    plane: new THREE.Vector2(-1e5, 1),
    color: new THREE.Color(color),
    time: { value: 0 },
  }
}

/** Light a spot: slot `i` glows at (x, y, z) reaching `reach` metres. */
export function setHeat(field: HeatField, i: number, x: number, y: number, z: number, reach: number): void {
  if (i >= 0 && i < HEAT_SOURCES) field.sources[i].set(x, y, z, Math.max(0.1, reach))
}

export interface HeatLook {
  map: TexName
  normal?: TexName
  color: THREE.ColorRepresentation
  roughness: number
  metalness?: number
  /** How strongly the heat lights this surface (its albedo times the heat colour times this). */
  gain: number
  /** Keep this much of the texture's colour (0 = greyscale, 1 = as painted). */
  saturation?: number
  /**
   * World triplanar texturing: `map` on the sides every `scale` metres, `top` (tinted
   * `topColor`) on faces looking up every `topScale` metres. No UVs needed.
   */
  triplanar?: { scale: number; top: TexName; topScale: number; topColor: THREE.ColorRepresentation }
  /** Ash settled on top faces, in patches (0 … 1). */
  ash?: number
  ashColor?: THREE.ColorRepresentation
  /** Glowing fissures on top faces where the heat is strong (0 … ~2). */
  fissures?: number
  normalScale?: number
  side?: THREE.Side
  flatShading?: boolean
}

const HEAT_PARS = /* glsl */ `
uniform vec4 uHeat[${HEAT_SOURCES}];
uniform vec2 uHeatPlane;
uniform vec3 uHeatColor;
uniform float uHeatGain;
uniform float uHeatTime;
uniform sampler2D tHeatNoise;
varying vec3 vHeatW;
varying vec3 vHeatN;
float heatAt(vec3 p, vec3 n) {
  float h = 0.0;
  for (int i = 0; i < ${HEAT_SOURCES}; i++) {
    vec3 d = uHeat[i].xyz - p;
    float dist = length(d);
    float k = clamp(1.0 - dist / max(uHeat[i].w, 0.1), 0.0, 1.0);
    float face = clamp(dot(n, d / max(dist, 0.001)) * 0.6 + 0.4, 0.0, 1.0);
    h += k * k * face;
  }
  float below = clamp(1.0 - (p.y - uHeatPlane.x) / max(uHeatPlane.y, 0.1), 0.0, 1.0);
  h += below * below * (0.55 - n.y * 0.45);
  return min(h, 1.6);
}
vec3 heatDesat(vec3 c, float k) {
  return mix(vec3(dot(c, vec3(0.3, 0.59, 0.11))), c, k);
}`

/** A lit material that glows where lava is near (see HeatField); `key` names its shader variant. */
export function heatMaterial(ctx: Ctx, field: HeatField, look: HeatLook, key: string): THREE.MeshStandardMaterial {
  const tex = ctx.textures
  const mat = new THREE.MeshStandardMaterial({
    map: tex.get(look.map),
    normalMap: look.normal ? tex.get(look.normal) : null,
    color: look.color,
    roughness: look.roughness,
    metalness: look.metalness ?? 0,
    side: look.side ?? THREE.FrontSide,
    flatShading: look.flatShading ?? false,
  })
  if (look.normal && look.normalScale !== undefined) mat.normalScale.setScalar(look.normalScale)
  const tri = look.triplanar
  const sat = (look.saturation ?? 1).toFixed(3)
  mat.onBeforeCompile = sh => {
    sh.uniforms.uHeat = { value: field.sources }
    sh.uniforms.uHeatPlane = { value: field.plane }
    sh.uniforms.uHeatColor = { value: field.color }
    sh.uniforms.uHeatGain = { value: look.gain }
    sh.uniforms.uHeatTime = field.time
    sh.uniforms.tHeatNoise = { value: tex.get('noise') }
    sh.uniforms.uAshColor = { value: new THREE.Color(look.ashColor ?? '#57514c') }
    if (tri) {
      sh.uniforms.tTop = { value: tex.get(tri.top) }
      sh.uniforms.uTopColor = { value: new THREE.Color(tri.topColor) }
    }
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vHeatW;\nvarying vec3 vHeatN;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 heatP = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          heatP = instanceMatrix * heatP;
        #endif
        vHeatW = (modelMatrix * heatP).xyz;
        vHeatN = (vec4(transformedNormal, 0.0) * viewMatrix).xyz;`,
      )
    const triplanar = tri
      ? `
        vec3 tw = abs(heatN);
        tw = tw * tw;
        tw = tw * tw;
        tw /= max(tw.x + tw.y + tw.z, 1e-4);
        float ts = ${tri.scale.toFixed(4)};
        vec3 rock = texture2D(map, vHeatW.zy * ts).rgb * tw.x + texture2D(map, vHeatW.xy * ts).rgb * tw.z + texture2D(map, vHeatW.xz * ts).rgb * tw.y;
        vec3 topTex = texture2D(tTop, vHeatW.xz * ${tri.topScale.toFixed(4)}).rgb;
        float topK = smoothstep(0.55, 0.85, heatN.y) * (0.75 + 0.25 * texture2D(tHeatNoise, vHeatW.xz * 0.05).r);
        diffuseColor.rgb = mix(diffuse * heatDesat(rock, ${sat}), uTopColor * heatDesat(topTex, ${sat}), topK);`
      : `
        vec4 sampledDiffuseColor = texture2D(map, vMapUv);
        diffuseColor.rgb *= heatDesat(sampledDiffuseColor.rgb, ${sat});`
    const ash = look.ash
      ? `
        float ashK = smoothstep(0.62, 0.95, heatN.y) * smoothstep(0.35, 0.75, texture2D(tHeatNoise, vHeatW.xz * 0.11).r) * ${look.ash.toFixed(3)};
        diffuseColor.rgb = mix(diffuseColor.rgb, uAshColor, ashK);`
      : ''
    const fissures = look.fissures
      ? `
        float fn = texture2D(tHeatNoise, vHeatW.xz * 0.075 + 0.13, 1.5).r;
        float fw = max(fwidth(fn) * 1.4, 0.02);
        float fis = (1.0 - smoothstep(0.0, fw, abs(fn - 0.5))) * (0.02 / fw) * smoothstep(0.6, 0.9, heatN.y);
        fis *= smoothstep(0.15, 0.7, heat) * ${look.fissures.toFixed(3)} * (0.8 + 0.2 * sin(uHeatTime * 0.9 + fn * 12.0));
        totalEmissiveRadiance += uHeatColor * fis * 1.8;
        diffuseColor.rgb *= 1.0 - min(fis, 1.0) * 0.6;`
      : ''
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${HEAT_PARS}\n${tri ? 'uniform sampler2D tTop;\nuniform vec3 uTopColor;' : ''}\nuniform vec3 uAshColor;`)
      .replace('#include <map_fragment>', `vec3 heatN = vHeatN / max(length(vHeatN), 1e-4);\n#ifdef USE_MAP\n${triplanar}\n#endif\n${ash}`)
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float heat = heatAt(vHeatW, heatN);
        ${fissures}
        totalEmissiveRadiance += diffuseColor.rgb * uHeatColor * heat * uHeatGain;
        totalEmissiveRadiance = min(totalEmissiveRadiance, vec3(4.0));`,
      )
  }
  mat.customProgramCacheKey = () => `starfall-heat-${key}`
  mat.name = `heat:${key}`
  return mat
}

/* ── embers ───────────────────────────────────────────────── */

const EMBER_VS = /* glsl */ `
uniform float uTime;
uniform vec3 uCenter;
uniform float uSize;
attribute vec3 aSeed;
varying float vA;
varying float vHot;
void main() {
  // Each spark rises and sways inside a box that follows the camera (wrapped with mod).
  vec3 box = vec3(46.0, 24.0, 46.0);
  vec3 p = aSeed * box;
  float t = uTime;
  p.y += t * (0.7 + aSeed.x * 1.3);
  p.x += sin(t * 0.45 + aSeed.z * 23.0) * 1.4 + t * 0.25;
  p.z += cos(t * 0.38 + aSeed.y * 19.0) * 1.4;
  vec3 lo = uCenter - box * 0.5;
  p = mod(p - lo, box) + lo;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float depth = max(-mv.z, 0.05);
  gl_PointSize = uSize * (0.45 + aSeed.y * 0.9) / depth;
  float f = (p.y - lo.y) / box.y;
  vA = (1.0 - smoothstep(5.0, 21.0, depth)) * smoothstep(0.4, 1.4, depth) * smoothstep(0.0, 0.2, f) * (1.0 - smoothstep(0.75, 1.0, f));
  vHot = 0.55 + 0.45 * sin(t * (0.8 + aSeed.z * 1.6) + aSeed.x * 40.0);
}`

const EMBER_FS = /* glsl */ `
varying float vA;
varying float vHot;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = (1.0 - smoothstep(0.15, 1.0, d)) * vA;
  if (a < 0.01) discard;
  vec3 c = mix(vec3(1.0, 0.28, 0.04), vec3(1.0, 0.72, 0.3), vHot) * (1.2 + vHot);
  gl_FragColor = vec4(c * a, a);
}`

export interface Embers {
  points: THREE.Points
  update(t: number): void
  dispose(): void
}

/** `count` sparks drifting up around the camera (additive, depth-tested, never culled). */
export function embers(ctx: Ctx, count: number, seed = 7): Embers {
  let s = seed
  const rnd = () => {
    s = (s * 16807) % 2147483647
    return s / 2147483647
  }
  const seeds = new Float32Array(count * 3)
  for (let i = 0; i < seeds.length; i++) seeds[i] = rnd()
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3))
  const mat = new THREE.ShaderMaterial({
    vertexShader: EMBER_VS,
    fragmentShader: EMBER_FS,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uSize: { value: 60 } },
  })
  const points = new THREE.Points(geo, mat)
  points.name = 'embers'
  points.frustumCulled = false
  points.renderOrder = 5
  return {
    points,
    update(t: number) {
      mat.uniforms.uTime.value = t
      mat.uniforms.uCenter.value.copy(ctx.camera.position)
      mat.uniforms.uSize.value = 60 * ctx.renderer.getPixelRatio()
    },
    dispose() {
      geo.dispose()
      mat.dispose()
    },
  }
}
