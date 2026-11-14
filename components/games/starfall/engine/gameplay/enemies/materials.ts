/**
 * Enemy shading, shared by every factory enemy:
 *
 *   skin      the model's own PBR material, patched for a hurt flash, a tint overlay (wards,
 *             frost, a charging glow), a rim light that keeps silhouettes readable, an emissive
 *             multiplier and a noise dissolve with a burning edge (deaths and entrances).
 *             Every instance gets its own uniforms; the shader program is shared.
 *   aura      an additive fresnel shell with scrolling noise flames, inflated along the normals
 *             (works on skinned and rigid meshes alike).
 *   sigil     a flat rune circle on the floor under casters and bosses.
 *   repaint   recolours the legion's gradient atlas cloth swatches per archetype.
 *
 * NaN guards: every normalize() and division checks its length; pow() bases are clamped ≥ 0;
 * smoothstep edges are never equal. A single NaN pixel would black out the frame through bloom.
 */
import * as THREE from 'three'

/** Per-instance uniforms of a patched enemy material. */
export interface SkinUniforms {
  uFlash: { value: number }
  uDissolve: { value: number }
  uGlow: { value: number }
  uEdge: { value: THREE.Color }
  uRim: { value: THREE.Color }
  /** rgb overlay colour, a = amount. */
  uTint: { value: THREE.Vector4 }
}

export function skinUniforms(edge: THREE.ColorRepresentation, rim: THREE.ColorRepresentation, rimStrength: number): SkinUniforms {
  return {
    uFlash: { value: 0 },
    uDissolve: { value: 0 },
    uGlow: { value: 1 },
    uEdge: { value: new THREE.Color(edge).multiplyScalar(3.2) },
    uRim: { value: new THREE.Color(rim).multiplyScalar(rimStrength) },
    uTint: { value: new THREE.Vector4(1, 1, 1, 0) },
  }
}

const NOISE_GLSL = /* glsl */ `
float eHash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.11, 0.17, 0.13));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float eNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(eHash(i), eHash(i + vec3(1.0, 0.0, 0.0)), f.x),
                 mix(eHash(i + vec3(0.0, 1.0, 0.0)), eHash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(eHash(i + vec3(0.0, 0.0, 1.0)), eHash(i + vec3(1.0, 0.0, 1.0)), f.x),
                 mix(eHash(i + vec3(0.0, 1.0, 1.0)), eHash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}`

/**
 * Patch a standard material for one enemy instance (the material is modified in place and
 * should be a per-instance clone). Program cache is shared across instances.
 */
export function patchSkin(mat: THREE.MeshStandardMaterial, u: SkinUniforms): THREE.MeshStandardMaterial {
  mat.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, u)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDissolvePos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvDissolvePos = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uFlash;
uniform float uDissolve;
uniform float uGlow;
uniform vec3 uEdge;
uniform vec3 uRim;
uniform vec4 uTint;
varying vec3 vDissolvePos;
${NOISE_GLSL}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
float dn = eNoise(vDissolvePos * 2.6) * 0.68 + eNoise(vDissolvePos * 7.3) * 0.32;
if (uDissolve > 0.0 && dn < uDissolve) discard;
diffuseColor.rgb = mix(diffuseColor.rgb, uTint.rgb, clamp(uTint.a, 0.0, 1.0));
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), clamp(uFlash, 0.0, 1.0) * 0.7);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
totalEmissiveRadiance *= max(uGlow, 0.0);
float eViewLen = length(vViewPosition);
vec3 eView = eViewLen > 1e-5 ? vViewPosition / eViewLen : vec3(0.0, 0.0, 1.0);
float eRim = pow(clamp(1.0 - abs(dot(normal, eView)), 0.0, 1.0), 2.4);
totalEmissiveRadiance += uRim * eRim;
totalEmissiveRadiance += uTint.rgb * clamp(uTint.a, 0.0, 1.0) * (0.25 + eRim * 0.9);
totalEmissiveRadiance += vec3(0.55) * clamp(uFlash, 0.0, 1.0);
float eBurn = uDissolve > 0.0 ? 1.0 - smoothstep(0.0, 0.09, dn - uDissolve) : 0.0;
totalEmissiveRadiance += uEdge * eBurn;`,
      )
  }
  mat.customProgramCacheKey = () => 'starfall-enemy-skin'
  return mat
}

/* ── aura ────────────────────────────────────────────────────── */

const AURA_VS = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>
uniform float uThick;
uniform float uTime;
varying vec3 vN;
varying vec3 vV;
varying vec3 vP;
void main() {
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  vP = (modelMatrix * vec4(transformed, 1.0)).xyz;
  // Inflate in view space, so the shell is uThick metres thick whatever the mesh's own scale
  // (quantized glTF meshes carry very different node scales).
  vec4 mv = modelViewMatrix * vec4(transformed, 1.0);
  vec3 vn = normalMatrix * objectNormal;
  float vnl = length(vn);
  vn = vnl > 1e-5 ? vn / vnl : vec3(0.0, 0.0, 1.0);
  // A slow breathing wobble so the shell never reads as a hard copy of the body.
  float wob = 0.75 + 0.25 * sin(uTime * 3.1 + vP.y * 2.3 + vP.x * 1.7);
  mv.xyz += vn * uThick * wob;
  vN = vn;
  vV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}`

const AURA_FS = /* glsl */ `
uniform vec3 uA;
uniform vec3 uB;
uniform float uIntensity;
uniform float uPower;
uniform float uTime;
uniform float uFlow;
uniform sampler2D tNoise;
varying vec3 vN;
varying vec3 vV;
varying vec3 vP;
void main() {
  float vl = length(vV);
  vec3 V = vl > 1e-5 ? vV / vl : vec3(0.0, 0.0, 1.0);
  float nl = length(vN);
  vec3 N = nl > 1e-5 ? vN / nl : vec3(0.0, 0.0, 1.0);
  float f = clamp(1.0 - abs(dot(N, V)), 0.0, 1.0);
  float rim = pow(f, max(uPower, 0.5));
  vec2 uv = vec2((vP.x + vP.z) * 0.3, vP.y * 0.42 - uTime * uFlow);
  float n1 = texture2D(tNoise, uv).r;
  float n2 = texture2D(tNoise, uv * 2.3 + vec2(uTime * 0.11, -uTime * uFlow * 0.7)).r;
  float flame = smoothstep(0.22, 0.86, n1 * 0.6 + n2 * 0.4);
  float a = clamp(rim * (0.35 + flame * 1.1) * uIntensity, 0.0, 3.0);
  vec3 col = mix(uA, uB, flame);
  gl_FragColor = vec4(col * (0.8 + flame * 0.9), a);
}`

export interface AuraUniforms {
  uA: { value: THREE.Color }
  uB: { value: THREE.Color }
  uIntensity: { value: number }
  uPower: { value: number }
  uTime: { value: number }
  uFlow: { value: number }
  uThick: { value: number }
  tNoise: { value: THREE.Texture }
}

export function auraMaterial(noise: THREE.Texture, a: THREE.ColorRepresentation, b: THREE.ColorRepresentation, thick: number): THREE.ShaderMaterial & { uniforms: AuraUniforms } {
  const uniforms: AuraUniforms = {
    uA: { value: new THREE.Color(a) },
    uB: { value: new THREE.Color(b) },
    uIntensity: { value: 1 },
    uPower: { value: 2.2 },
    uTime: { value: 0 },
    uFlow: { value: 0.55 },
    uThick: { value: thick },
    tNoise: { value: noise },
  }
  const mat = new THREE.ShaderMaterial({
    vertexShader: AURA_VS,
    fragmentShader: AURA_FS,
    uniforms: uniforms as unknown as Record<string, THREE.IUniform>,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.FrontSide,
  })
  return mat as THREE.ShaderMaterial & { uniforms: AuraUniforms }
}

/* ── ground sigil ────────────────────────────────────────────── */

const SIGIL_VS = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

const SIGIL_FS = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uAlpha;
uniform float uSpin;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float d = length(p);
  float ang = atan(p.y, p.x);
  float outer = smoothstep(0.86, 0.9, d) * (1.0 - smoothstep(0.95, 0.99, d));
  float inner = smoothstep(0.6, 0.63, d) * (1.0 - smoothstep(0.66, 0.69, d));
  float ticks = step(0.7, d) * (1.0 - step(0.84, d)) * step(0.82, fract(ang * 3.8197 + uTime * uSpin));
  float runes = step(0.7, d) * (1.0 - step(0.84, d)) * smoothstep(0.35, 0.65, sin(ang * 18.0 - uTime * uSpin * 6.0) * 0.5 + 0.5) * 0.35;
  float core = (1.0 - smoothstep(0.0, 0.6, d)) * 0.12;
  float a = (outer + inner * 0.8 + ticks * 0.9 + runes + core) * uAlpha;
  gl_FragColor = vec4(uColor * (1.2 + outer), a * (1.0 - smoothstep(0.97, 1.0, d)));
}`

export function sigilMaterial(color: THREE.ColorRepresentation, spin: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: SIGIL_VS,
    fragmentShader: SIGIL_FS,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uTime: { value: 0 },
      uAlpha: { value: 1 },
      uSpin: { value: spin },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  })
}

/* ── legion atlas repaint ────────────────────────────────────── */

/**
 * The legion's atlas is an 8×4 grid of gradient swatches (column, row from the top). These cells
 * hold the cloth and the red accents — hoods, capes, cloaks, robes and hats (2,2), the minion's
 * scarf (5,0), plumes and trims (6,2) — found from the models' UVs. Each archetype repaints them
 * in its colour, keeping the shading.
 */
const CLOTH_CELLS: ReadonlyArray<readonly [number, number]> = [[2, 2], [5, 0], [6, 2]]
const ATLAS_COLS = 8
const ATLAS_ROWS = 4

/** A copy of the atlas with the cloth swatches recoloured (null if the image can't be read). */
export function repaintAtlas(src: THREE.Texture, cloth: THREE.ColorRepresentation): THREE.Texture | null {
  const img = src.image as (CanvasImageSource & { width: number; height: number }) | undefined
  if (!img || !(img.width > 0) || !(img.height > 0) || typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  const g = canvas.getContext('2d', { willReadFrequently: true })
  if (!g) return null
  try {
    g.drawImage(img, 0, 0)
    const target = new THREE.Color(cloth)
    const hsl = { h: 0, s: 0, l: 0 }
    target.getHSL(hsl, THREE.SRGBColorSpace)
    const cw = canvas.width / ATLAS_COLS
    const ch = canvas.height / ATLAS_ROWS
    const px = new THREE.Color()
    const ph = { h: 0, s: 0, l: 0 }
    const rgb = { r: 0, g: 0, b: 0 }
    for (const [cx, cy] of CLOTH_CELLS) {
      const x0 = Math.round(cx * cw)
      const y0 = Math.round(cy * ch)
      const w = Math.round(cw)
      const h = Math.round(ch)
      const data = g.getImageData(x0, y0, w, h)
      const d = data.data
      for (let i = 0; i < d.length; i += 4) {
        px.setRGB(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255, THREE.SRGBColorSpace)
        px.getHSL(ph, THREE.SRGBColorSpace)
        // Keep the swatch's light-to-dark ramp, centred on the target's own lightness.
        const l = THREE.MathUtils.clamp(hsl.l + (ph.l - 0.45) * 0.9, 0.04, 0.92)
        px.setHSL(hsl.h, hsl.s, l, THREE.SRGBColorSpace).getRGB(rgb, THREE.SRGBColorSpace)
        d[i] = Math.round(THREE.MathUtils.clamp(rgb.r, 0, 1) * 255)
        d[i + 1] = Math.round(THREE.MathUtils.clamp(rgb.g, 0, 1) * 255)
        d[i + 2] = Math.round(THREE.MathUtils.clamp(rgb.b, 0, 1) * 255)
      }
      g.putImageData(data, x0, y0)
    }
  } catch {
    return null
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.flipY = src.flipY
  tex.wrapS = src.wrapS
  tex.wrapT = src.wrapT
  tex.magFilter = src.magFilter
  tex.minFilter = src.minFilter
  tex.anisotropy = src.anisotropy
  return tex
}
