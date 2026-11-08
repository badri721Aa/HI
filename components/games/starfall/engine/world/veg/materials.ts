/**
 * Vegetation materials: three's MeshStandardMaterial with small shader patches.
 *
 *  - Wind: every vertex sways by its `aWind.x` bend weight (trunk stiff → twig tips
 *    loose) plus leaf flutter (`aWind.y`), driven by ONE shared time/wind uniform.
 *    The offset is computed in world space and mapped back to object space, so
 *    shadows and lighting see exactly the same displaced vertex.
 *  - Distance fade: small clutter shrinks into the ground before it is culled.
 *  - Tint mask: the per-instance colour only tints where `aWind.z` = 1
 *    (flower petals, mushroom caps) and leaves the rest alone.
 *  - Foliage: no back-face normal flip (canopies use spherical normals),
 *    alpha-to-mip compensation so leaf cards don't thin out with distance, and a
 *    cheap translucency term so backlit leaves glow in the low sun.
 *  - Rocks: procedural moss on upward faces above the beach, darker when wet.
 */
import * as THREE from 'three'
import type { TextureLib } from '../../textures'

/** Uniforms shared by every vegetation material (updated once per frame). */
export interface VegUniforms {
  uVegTime: { value: number }
  /** xz = unit wind direction, y = strength. */
  uVegWind: { value: THREE.Vector3 }
  /** Gameplay camera position (distance fades must agree between colour and shadow passes). */
  uVegCam: { value: THREE.Vector3 }
  uVegPlayer: { value: THREE.Vector3 }
}

export function createVegUniforms(): VegUniforms {
  return {
    uVegTime: { value: 0 },
    uVegWind: { value: new THREE.Vector3(0.86, 1, 0.5).normalize().setY(1) },
    uVegCam: { value: new THREE.Vector3() },
    uVegPlayer: { value: new THREE.Vector3(0, -1000, 0) },
  }
}

export type VegKind = 'bark' | 'leaf' | 'plant' | 'rock'

export interface VegMaterialOpts {
  kind: VegKind
  /** Shrink-out distance band from the camera (m). Omit for never. */
  fade?: [number, number]
  /** Multiplier on the wind sway. */
  sway?: number
  /** Backlit glow strength (leaf / plant). */
  translucency?: number
  /** How far low plants bend away from the player (m). */
  push?: number
  /** Moss amount on rocks (0..1). */
  moss?: number
  roughness?: number
  name: string
}

export interface VegMaterial {
  material: THREE.MeshStandardMaterial
  /** For shadow casting (wind + alpha-tested cards); null for static solids. */
  depth: THREE.MeshDepthMaterial | null
}

/* ────────────────────────────────────────────────────────────
   GLSL
   ──────────────────────────────────────────────────────────── */

/** Wind uniforms and `vegWindOffset()`; also used by the grass field. */
export const VEG_VERT_PARS = /* glsl */ `
attribute vec3 aWind;
uniform float uVegTime;
uniform vec3 uVegWind;
uniform vec3 uVegCam;
uniform vec3 uVegPlayer;
uniform vec3 uVegFade;
uniform float uVegPush;
varying vec3 vVegWorld;

vec3 vegWindOffset( vec3 origin, vec3 wp, float bend, float flutter ) {
  vec2 dir = uVegWind.xz;
  float t = uVegTime;
  // Gusts roll across the island along the wind.
  float along = dot( origin.xz, dir );
  float gust = 0.62 + 0.38 * sin( along * 0.045 - t * 0.75 ) * sin( along * 0.011 + origin.x * 0.006 - t * 0.29 );
  float ph = dot( origin.xz, vec2( 0.37, 0.61 ) );
  float sway = sin( t * 1.25 + ph ) * 0.65 + sin( t * 2.05 + ph * 1.7 ) * 0.35;
  float amp = uVegWind.y * uVegFade.z * bend * gust;
  vec3 off = vec3( 0.0 );
  off.xz = dir * amp * ( 0.55 + 0.45 * sway ) + vec2( - dir.y, dir.x ) * amp * 0.28 * sin( t * 0.93 + ph * 0.7 );
  off.y = - amp * amp * 0.12;
  float fp = dot( wp, vec3( 1.7, 2.3, 1.3 ) );
  off += vec3( sin( t * 6.3 + fp ), sin( t * 7.7 + fp * 1.3 ) * 0.6, cos( t * 5.1 + fp * 0.7 ) ) * flutter * 0.04 * ( 0.35 + gust ) * uVegWind.y;
  return off;
}
`

const VERT_MAIN = /* glsl */ `
#ifdef USE_INSTANCING
  mat4 vegM = modelMatrix * instanceMatrix;
#else
  mat4 vegM = modelMatrix;
#endif
vec3 vegOrigin = vegM[ 3 ].xyz;
transformed *= 1.0 - smoothstep( uVegFade.x, uVegFade.y, distance( vegOrigin, uVegCam ) );
#ifndef VEG_STATIC
{
  mat3 vm3 = mat3( vegM );
  vec3 wp = ( vegM * vec4( transformed, 1.0 ) ).xyz;
  vec3 off = vegWindOffset( vegOrigin, wp, aWind.x * length( vm3[ 1 ] ), aWind.y );
  if ( uVegPush > 0.0 ) {
    vec2 away = wp.xz - uVegPlayer.xz;
    float d = length( away );
    float k = ( 1.0 - smoothstep( 0.25, 1.15, d ) ) * ( 1.0 - smoothstep( 0.4, 1.4, wp.y - uVegPlayer.y ) ) * step( - 0.6, wp.y - uVegPlayer.y );
    float w = clamp( aWind.x * 6.0, 0.0, 1.0 ) * k * uVegPush;
    off.xz += away / max( d, 0.001 ) * w;
    off.y -= w * 0.5;
  }
  vec3 lo = transpose( vm3 ) * off;
  lo /= vec3( dot( vm3[ 0 ], vm3[ 0 ] ), dot( vm3[ 1 ], vm3[ 1 ] ), dot( vm3[ 2 ], vm3[ 2 ] ) );
  transformed += lo;
}
#endif
vVegWorld = ( vegM * vec4( transformed, 1.0 ) ).xyz;
`

const FRAG_PARS = /* glsl */ `
varying vec3 vVegWorld;
uniform float uVegTrans;
uniform float uVegMoss;
uniform sampler2D uVegNoise;
`

/** Declared after the lighting structs exist. */
const FRAG_LIGHT_FN = /* glsl */ `
void vegTranslucency( const in IncidentLight dl, const in vec3 viewDir, const in vec3 n, const in vec3 albedo, inout ReflectedLight rl ) {
  float back = pow( saturate( dot( viewDir, - dl.direction ) ), 3.0 );
  float wrap = saturate( 0.3 - dot( n, dl.direction ) * 0.5 );
  rl.directDiffuse += dl.color * albedo * ( back * 0.85 + wrap * 0.3 ) * uVegTrans;
}
`

/** Keeps alpha-tested cards dense in the distance (alpha falls as mip levels average in the transparent background). */
const ALPHA_MIP = /* glsl */ `
#ifdef USE_MAP
{
  vec2 vegPx = vMapUv * 512.0;
  vec2 vegDx = dFdx( vegPx );
  vec2 vegDy = dFdy( vegPx );
  float vegLod = max( 0.0, 0.5 * log2( max( dot( vegDx, vegDx ), dot( vegDy, vegDy ) ) ) );
  diffuseColor.a *= 1.0 + vegLod * 0.3;
}
#endif
`

const ROCK_SURFACE = /* glsl */ `
{
  vec3 vegN = normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );
  float mn = texture2D( uVegNoise, vVegWorld.xz * 0.21 + vVegWorld.y * 0.05 ).r;
  float moss = smoothstep( 0.5, 0.85, vegN.y + ( mn - 0.5 ) * 0.7 ) * smoothstep( 2.4, 4.2, vVegWorld.y ) * uVegMoss;
  diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.13, 0.17, 0.055 ) * ( 0.65 + 0.7 * mn ), moss );
  float wet = 1.0 - smoothstep( 0.05, 0.75, vVegWorld.y );
  diffuseColor.rgb *= 1.0 - wet * 0.45;
  roughnessFactor = mix( roughnessFactor, 0.38, wet * 0.8 ) + moss * 0.1;
}
`

const RE_DIRECT = 'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );'

/** Shared fragment set-up: uniforms, the translucency helper, and (for thin foliage) no back-face flip + backlight. */
export function patchFoliageFragment(fs: string, foliage: boolean): string {
  fs = fs
    .replace('#include <common>', `#include <common>\n${FRAG_PARS}`)
    .replace('#include <lights_physical_pars_fragment>', `#include <lights_physical_pars_fragment>\n${FRAG_LIGHT_FN}`)
  if (!foliage) return fs
  return fs
    .replace('float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;', 'float faceDirection = 1.0;')
    .split(RE_DIRECT)
    .join(`${RE_DIRECT}\n\t\tvegTranslucency( directLight, geometryViewDir, geometryNormal, material.diffuseColor, reflectedLight );`)
}

function patchVertex(src: string, isStatic: boolean): string {
  return (isStatic ? '#define VEG_STATIC\n' : '') + src
    .replace('#include <common>', `#include <common>\n${VEG_VERT_PARS}`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERT_MAIN}`)
    .replace('vColor.rgb *= instanceColor.rgb;', 'vColor.rgb *= mix( vec3( 1.0 ), instanceColor.rgb, aWind.z );')
}

/* ────────────────────────────────────────────────────────────
   Factory
   ──────────────────────────────────────────────────────────── */

const NEVER: [number, number] = [1e6, 2e6]

export function createVegMaterial(textures: TextureLib, shared: VegUniforms, o: VegMaterialOpts): VegMaterial {
  const fade = o.fade ?? NEVER
  const own = {
    uVegFade: { value: new THREE.Vector3(fade[0], fade[1], o.sway ?? 1) },
    uVegPush: { value: o.push ?? 0 },
    uVegTrans: { value: o.translucency ?? 0 },
    uVegMoss: { value: o.moss ?? 0 },
    uVegNoise: { value: textures.get('noise') },
  }
  const uniforms = { ...shared, ...own }
  const kind = o.kind
  const isStatic = kind === 'rock'

  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: o.roughness ?? 0.9, metalness: 0 })
  mat.name = `veg:${o.name}`
  if (kind === 'bark') {
    mat.map = textures.get('bark_albedo')
    mat.normalMap = textures.get('bark_normal')
    mat.normalScale.set(1.2, 1.2)
  } else if (kind === 'leaf') {
    mat.map = textures.get('leaves_albedo')
    mat.alphaTest = 0.45
    mat.side = THREE.DoubleSide
  } else if (kind === 'plant') {
    mat.map = textures.get('noise')
    mat.side = THREE.DoubleSide
  } else {
    mat.map = textures.get('rock_albedo')
    mat.normalMap = textures.get('rock_normal')
    mat.flatShading = true
  }

  mat.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = patchVertex(shader.vertexShader, isStatic)
    let fs = patchFoliageFragment(shader.fragmentShader, kind === 'leaf' || kind === 'plant')
    if (kind === 'leaf') fs = fs.replace('#include <map_fragment>', `#include <map_fragment>\n${ALPHA_MIP}`)
    if (kind === 'plant') {
      // The noise map only modulates the vertex colours (it is greyscale around 0.5).
      fs = fs.replace('#include <map_fragment>', '#ifdef USE_MAP\n\tdiffuseColor.rgb *= 0.72 + 0.56 * texture2D( map, vMapUv ).r;\n#endif')
    }
    if (kind === 'rock') fs = fs.replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>\n${ROCK_SURFACE}`)
    shader.fragmentShader = fs
  }
  mat.customProgramCacheKey = () => `starfall.veg.${kind}.v1`

  let depth: THREE.MeshDepthMaterial | null = null
  if (!isStatic) {
    depth = new THREE.MeshDepthMaterial()
    depth.name = `veg:${o.name}:depth`
    depth.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, uniforms)
      shader.vertexShader = patchVertex(shader.vertexShader, false)
      if (kind === 'leaf') shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>\n${ALPHA_MIP}`)
    }
    depth.customProgramCacheKey = () => `starfall.veg.depth.${kind}.v1`
  }
  return { material: mat, depth }
}
