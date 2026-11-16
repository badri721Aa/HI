/**
 * How the Neon Metropolis is lit. The game keeps a fixed number of real lights (adding one would
 * recompile every shader), so the map's neon reaches its surroundings through NeonLights instead:
 *
 *   pools   soft coloured light on whatever stands near a lamp or a sign (every material patched
 *           with litMaterial picks them up)
 *   bars    tall light sources mirrored in the wet floors: for each one the deck shader finds
 *           where the mirrored view ray passes it, so the streak slides with the camera like a
 *           real reflection, sharp in puddles and smeared on damp concrete
 *
 * The deck variant also paints the helipad (landing circle, H, striped rim, apron lanes), slab
 * joints, puddles that follow a noise field and rain rings spreading across them.
 */
import * as THREE from 'three'
import type { Ctx } from '../../types'
import { WINDOW_GRID } from './textures'

/** Slots in the shaders' light arrays (unused ones stay black). */
const BARS = 12
const POOLS = 16

/** The animation clock a map shares between its shaders. */
export type TimeUniform = { value: number }

/** The glow of the streets in the haze far below (the towers' feet and the city floor fade into it). */
export const HAZE_COLOR = '#4a1d62'

/** Integer-lattice hash in [0, 1): no trig, so it stays stable far from the origin. */
export const HASH_GLSL = /* glsl */ `
float neonHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}`

export class NeonLights {
  /** x, z, bottom, top. */
  readonly bars = Array.from({ length: BARS }, () => new THREE.Vector4(0, 0, 0, 0))
  /** Linear rgb × intensity, half-width (m). */
  readonly barColors = Array.from({ length: BARS }, () => new THREE.Vector4(0, 0, 0, 1))
  /** Position, radius (m). */
  readonly pools = Array.from({ length: POOLS }, () => new THREE.Vector4(0, 0, 0, 1))
  readonly poolColors = Array.from({ length: POOLS }, () => new THREE.Vector3())
  private nBars = 0
  private nPools = 0
  private readonly c = new THREE.Color()

  /** A tall light at (x, z) between heights y0 and y1; `width` is its half-width. Returns its slot (-1: none left). */
  bar(x: number, z: number, y0: number, y1: number, color: THREE.ColorRepresentation, intensity: number, width: number): number {
    if (this.nBars >= BARS) return -1
    const i = this.nBars++
    this.bars[i].set(x, z, y0, y1)
    this.barColors[i].w = Math.max(0.05, width)
    this.tintBar(i, color, intensity)
    return i
  }

  /** Recolour a bar (a billboard changing its picture). Allocation-free. */
  tintBar(i: number, color: THREE.ColorRepresentation, intensity: number): void {
    if (i < 0) return
    const c = this.c.set(color)
    const v = this.barColors[i]
    v.x = c.r * intensity
    v.y = c.g * intensity
    v.z = c.b * intensity
  }

  /** Soft light around a point, fading over `radius` metres. Returns its slot (-1: none left). */
  pool(x: number, y: number, z: number, radius: number, color: THREE.ColorRepresentation, intensity: number): number {
    if (this.nPools >= POOLS) return -1
    const i = this.nPools++
    this.pools[i].set(x, y, z, Math.max(0.5, radius))
    this.tintPool(i, color, intensity)
    return i
  }

  tintPool(i: number, color: THREE.ColorRepresentation, intensity: number): void {
    if (i < 0) return
    const c = this.c.set(color)
    this.poolColors[i].set(c.r * intensity, c.g * intensity, c.b * intensity)
  }
}

export interface LitOpts {
  /** The wet floor: puddles, markings and mirrored neon. */
  deck?: boolean
  /** Rain rings on the puddles (off on 'low'). */
  ripples?: boolean
}

const LIT_PARS = /* glsl */ `
#define NEON_BARS ${BARS}
#define NEON_POOLS ${POOLS}
uniform float uNeonTime;
uniform vec3 uNeonCentre;
uniform sampler2D tNeonNoise;
uniform vec4 uNeonBar[NEON_BARS];
uniform vec4 uNeonBarCol[NEON_BARS];
uniform vec4 uNeonPool[NEON_POOLS];
uniform vec3 uNeonPoolCol[NEON_POOLS];
varying vec3 vNeonP;
varying vec3 vNeonN;
${HASH_GLSL}
/** 1 between lo and hi, with edges w wide (w > 0). */
float neonBand(float x, float lo, float hi, float w) {
  return smoothstep(lo - w, lo + w, x) * (1.0 - smoothstep(hi - w, hi + w, x));
}
/** 1 inside the box at c with half-size h. */
float neonBox(vec2 p, vec2 c, vec2 h, float w) {
  vec2 d = abs(p - c) - h;
  return 1.0 - smoothstep(-w, w, max(d.x, d.y));
}
/** Coloured light from the map's lamps and signs on a surface point. */
vec3 neonPools(vec3 p, vec3 n) {
  vec3 sum = vec3(0.0);
  for (int i = 0; i < NEON_POOLS; i++) {
    vec3 d = uNeonPool[i].xyz - p;
    float d2 = dot(d, d) + 1e-3;
    float r2 = uNeonPool[i].w * uNeonPool[i].w;
    float att = r2 / (r2 + d2);
    sum += uNeonPoolCol[i] * (max(dot(n, d), 0.0) * inversesqrt(d2) * att * att);
  }
  return sum;
}`

/** Albedo, roughness and wetness of the deck (runs once the base colour and roughness are known). */
const DECK_SURFACE = /* glsl */ `
vec3 neonN = vNeonN / max(length(vNeonN), 1e-4);
vec2 np = vNeonP.xz - uNeonCentre.xz;
float neonTop = step(0.7, neonN.y);
float neonWet = 0.0;
vec3 neonPaint = vec3(0.0);
#ifdef NEON_DECK
{
  float nr = length(np);
  float level = vNeonP.y - uNeonCentre.y;
  float onPad = neonTop * (1.0 - step(0.3, abs(level)));
  // Slabs: a joint every 4 m (widened and faded with distance), each slab its own grey.
  vec2 nj = np / 4.0;
  vec2 njw = max(fwidth(nj), vec2(1e-4));
  vec2 njd = abs(fract(nj - 0.5) - 0.5) / njw;
  float joint = (1.0 - clamp(min(njd.x, njd.y) / 1.4, 0.0, 1.0)) * clamp(1.0 - max(njw.x, njw.y) * 10.0, 0.0, 1.0) * neonTop;
  diffuseColor.rgb *= (0.88 + 0.24 * neonHash(floor(nj))) * (1.0 - joint * 0.6);
  // The lower roofs are older bitumen, a little greener.
  diffuseColor.rgb *= mix(vec3(1.0), vec3(0.8, 0.95, 0.9), step(level, -1.0));

  // Paint on the helipad and its apron, worn where the noise says so.
  float wr = max(fwidth(nr), 0.004);
  float wp = max(max(fwidth(np.x), fwidth(np.y)), 0.004);
  float wear = 0.45 + 0.55 * smoothstep(0.3, 0.62, texture2D(tNeonNoise, np * 0.21 + 0.71).r);
  float white = max(max(neonBox(np, vec2(-2.3, 0.0), vec2(0.5, 3.8), wp), neonBox(np, vec2(2.3, 0.0), vec2(0.5, 3.8), wp)), neonBox(np, vec2(0.0), vec2(2.3, 0.5), wp));
  white = max(white, neonBand(nr, 8.0, 8.24, wr));
  float lanes = neonBox(vec2(abs(np.x), np.y), vec2(12.0, 26.8), vec2(0.09, 8.2), wp);
  lanes = max(lanes, neonBox(np, vec2(0.0, 29.0), vec2(0.1, 5.6), wp) * step(0.5, fract(np.y * 0.5)));
  float ss = (np.x + np.y) * 0.55;
  float sw = clamp(fwidth(ss) * 2.0, 0.02, 0.5);
  float stripes = smoothstep(0.5 - sw, 0.5 + sw, abs(fract(ss) - 0.5) * 2.0);
  float yellow = max(max(neonBand(nr, 17.5, 18.0, wr), lanes), neonBand(nr, 20.3, 21.2, wr) * stripes);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.74, 0.76, 0.74), white * wear * onPad);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.6, 0.1), yellow * wear * onPad);
  // The markings are reflective paint: they stay readable in the dark.
  neonPaint = (vec3(0.74, 0.76, 0.74) * white + vec3(0.9, 0.6, 0.1) * yellow * (1.0 - white)) * (wear * onPad * 0.09);

  // Rain: damp everywhere, standing water where the noise field dips.
  float wn = texture2D(tNeonNoise, np * 0.019).r * 0.6 + texture2D(tNeonNoise, np * 0.057 + 0.37).r * 0.4;
  neonWet = smoothstep(0.5, 0.58, wn) * neonTop;
  diffuseColor.rgb *= mix(1.0, 0.5, neonWet);
  roughnessFactor = mix(clamp(roughnessFactor * (0.7 + 0.6 * wn), 0.05, 1.0), 0.04, neonWet);
}
#endif`

/** Puddles lie flat; rain rings spread across them (one per 0.8 m cell, restarting at its own beat). */
const DECK_NORMAL = /* glsl */ `
#ifdef NEON_DECK
  normal = normalize(mix(normal, nonPerturbedNormal, neonWet * 0.94));
  #ifdef NEON_RIPPLES
  {
    vec2 rg = np / 0.8;
    vec2 rc = floor(rg);
    float rh = neonHash(rc);
    vec2 rf = fract(rg) - 0.5 - (vec2(neonHash(rc + 3.1), neonHash(rc + 7.7)) - 0.5) * 0.3;
    float rt = fract(uNeonTime * (0.45 + rh * 0.3) + rh * 9.0);
    float rd = length(rf);
    float ring = rd - rt * 0.34;
    float prof = sin(ring * 46.0) * exp(-ring * ring * 420.0) * (1.0 - rt) * (1.0 - rt);
    vec2 slope = rf / max(rd, 1e-3) * (prof * 0.5 * neonWet);
    normal = normalize(normal + (viewMatrix * vec4(slope.x, 0.0, slope.y, 0.0)).xyz);
  }
  #endif
#endif`

/** Light from the pools on every surface; on the deck, the bars mirrored in the wet floor. */
const LIT_EMISSIVE = /* glsl */ `
totalEmissiveRadiance += diffuseColor.rgb * (1.0 - metalnessFactor * 0.5) * neonPools(vNeonP, neonN) + neonPaint;
#ifdef NEON_DECK
if (neonTop > 0.5) {
  vec3 nv = vNeonP - cameraPosition;
  float ncos = clamp(-nv.y / max(length(nv), 1e-3), 0.0, 1.0);
  float fres = 0.05 + 0.95 * pow(1.0 - ncos, 4.0);
  float hl = max(length(nv.xz), 1e-3);
  vec2 hd = nv.xz / hl;
  // Height the mirrored view ray gains per metre travelled.
  float rise = clamp(-nv.y / hl, 0.0, 40.0);
  float blur = mix(0.07, 0.014, neonWet);
  float jit = (texture2D(tNeonNoise, np * 0.33).r - 0.5) * mix(0.16, 0.02, neonWet);
  vec3 refl = vec3(0.0);
  for (int i = 0; i < NEON_BARS; i++) {
    vec2 toL = uNeonBar[i].xy - vNeonP.xz;
    float along = dot(toL, hd);
    float reach = max(along, 0.0);
    float across = toL.x * hd.y - toL.y * hd.x + jit * along;
    float w = uNeonBarCol[i].w + reach * blur;
    float gx = exp(-(across * across) / max(w * w, 1e-4));
    float soft = 0.3 + reach * blur * 2.0;
    float hitY = vNeonP.y + along * rise;
    float gy = smoothstep(uNeonBar[i].z - soft, uNeonBar[i].z + soft, hitY) * (1.0 - smoothstep(uNeonBar[i].w - soft, uNeonBar[i].w + soft, hitY));
    refl += uNeonBarCol[i].rgb * (gx * gy * step(0.0, along) / (1.0 + reach * 0.02));
  }
  totalEmissiveRadiance += min(refl, vec3(6.0)) * fres * mix(0.25, 1.0, neonWet);
}
#endif`

/**
 * Patches a standard material so the map's neon lights it. Call before the material is first
 * used; `centre` is the helipad's floor (the deck's markings are laid out around it).
 */
export function litMaterial<T extends THREE.MeshStandardMaterial>(ctx: Ctx, mat: T, lights: NeonLights, uTime: TimeUniform, centre: { x: number; y: number; z: number }, opts: LitOpts = {}): T {
  const defines = `${opts.deck ? '#define NEON_DECK\n' : ''}${opts.deck && opts.ripples ? '#define NEON_RIPPLES\n' : ''}`
  mat.onBeforeCompile = sh => {
    sh.uniforms.uNeonTime = uTime
    sh.uniforms.uNeonCentre = { value: new THREE.Vector3(centre.x, centre.y, centre.z) }
    sh.uniforms.tNeonNoise = { value: ctx.textures.get('noise') }
    sh.uniforms.uNeonBar = { value: lights.bars }
    sh.uniforms.uNeonBarCol = { value: lights.barColors }
    sh.uniforms.uNeonPool = { value: lights.pools }
    sh.uniforms.uNeonPoolCol = { value: lights.poolColors }
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vNeonP;\nvarying vec3 vNeonN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvNeonP = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvNeonN = mat3(modelMatrix) * objectNormal;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${defines}${LIT_PARS}`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>\n${DECK_SURFACE}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${DECK_NORMAL}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${LIT_EMISSIVE}`)
  }
  mat.customProgramCacheKey = () => `starfall-neon-lit:${opts.deck ? 1 : 0}:${opts.deck && opts.ripples ? 1 : 0}`
  return mat
}

const TOWER_VS = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
attribute vec3 aTint;
attribute vec3 aAccent;
attribute vec4 aWin;
uniform vec3 uLightDir;
varying vec2 vWuv;
varying vec3 vTint;
varying vec3 vAccent;
varying vec4 vInfo;
varying float vWorldY;
varying float vLit;
varying vec4 vRoof;
void main() {
  // The box is a unit cube: its size is the instance's scale.
  vec3 sc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
  vec3 lp = (position + 0.5) * sc;
  vec2 wm = abs(normal.x) > 0.5 ? lp.zy : lp.xy;
  vWuv = wm / (aWin.z * ${WINDOW_GRID}.0) + aWin.xy;
  vRoof = vec4(lp.xz, sc.xz);
  vTint = aTint;
  vAccent = aAccent;
  vLit = aWin.w;
  vec3 wn = mat3(instanceMatrix) * normal;
  wn /= max(length(wn), 1e-4);
  vInfo = vec4(1.0 - abs(normal.y), lp.y, sc.y, 0.5 + 0.5 * max(dot(wn, uLightDir), 0.0));
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWorldY = wp.y;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`

const TOWER_FS = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform sampler2D tWindows;
uniform vec3 uWall;
uniform vec3 uHazeColor;
uniform vec3 uHaze;
varying vec2 vWuv;
varying vec3 vTint;
varying vec3 vAccent;
varying vec4 vInfo;
varying float vWorldY;
varying float vLit;
varying vec4 vRoof;
${HASH_GLSL}
void main() {
  float wall = vInfo.x;
  vec3 col = uWall * vInfo.w * mix(0.5, 1.0, wall);
  // Roofs: a parapet round the edge, plant boxes and a few small lamps (fading out where they get too small to draw).
  vec2 rim = min(vRoof.xy, vRoof.zw - vRoof.xy);
  vec2 rg = vRoof.xy / 3.2;
  vec2 rf = abs(fract(rg) - 0.5);
  float rh = neonHash(floor(rg) + floor(vRoof.zw * 4.0 + 0.5));
  float near = clamp(1.5 - max(fwidth(rg.x), fwidth(rg.y)) * 4.0, 0.0, 1.0) * (1.0 - wall);
  float plant = step(0.72, rh) * step(max(rf.x, rf.y), 0.34) * step(1.6, min(rim.x, rim.y));
  col *= 1.0 + (plant * 1.1 + (1.0 - step(0.7, min(rim.x, rim.y))) * 0.8) * near;
  col += vAccent * (step(0.93, rh) * (1.0 - smoothstep(0.03, 0.09, max(rf.x, rf.y))) * near * 0.8);
  col += texture2D(tWindows, vWuv).rgb * vTint * (vLit * wall);
  // A lit band under the roof line.
  float band = smoothstep(vInfo.z - 2.4, vInfo.z - 2.0, vInfo.y) * (1.0 - smoothstep(vInfo.z - 1.0, vInfo.z - 0.6, vInfo.y));
  col += vAccent * (band * wall);
  #ifdef USE_FOG
    // The glowing murk over the streets: thicker with distance, thinning with height.
    float murk = (1.0 - exp(-vFogDepth * uHaze.x)) * exp(-max(vWorldY - uHaze.y, 0.0) / uHaze.z);
    col = mix(col, uHazeColor, clamp(murk, 0.0, 1.0));
  #endif
  gl_FragColor = vec4(min(col, vec3(8.0)), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`

/**
 * Distant skyscrapers (one instanced draw): unlit dark walls with the window grid, a lit band
 * under the roof and a glowing haze that swallows their feet. Instance attributes: aTint (window
 * light), aAccent (roof band), aWin (window uv offset, metres per pane, brightness).
 */
export function towerMaterial(windows: THREE.Texture, lightDir: THREE.Vector3, streetY: number): THREE.ShaderMaterial {
  const mat = new THREE.ShaderMaterial({
    name: 'starfall.neon.towers',
    vertexShader: TOWER_VS,
    fragmentShader: TOWER_FS,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        tWindows: { value: null },
        uWall: { value: new THREE.Color('#141627') },
        uLightDir: { value: lightDir.clone().normalize() },
        uHazeColor: { value: new THREE.Color(HAZE_COLOR) },
        uHaze: { value: new THREE.Vector3(0.006, streetY, 42) },
      },
    ]),
    fog: true,
  })
  // Set after the merge, which would clone the texture.
  mat.uniforms.tWindows.value = windows
  return mat
}
