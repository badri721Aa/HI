/**
 * Sea and lakes: one MeshStandardMaterial patched with onBeforeCompile, so the
 * water keeps PBR sun glints, IBL sky reflections (fresnel), real-time shadows
 * and fog, and adds:
 *  - gentle vertex swell (open sea only),
 *  - two or three scrolling layers of 'water_normal',
 *  - depth from a terrain height texture → turquoise shallows to deep blue,
 *    soft transparency at the shore and animated foam lines rolling in,
 *  - the baked terrain shadow on the sun.
 */
import * as THREE from 'three'
import type { TextureLib } from '../../textures'
import { LAKES, SEA_LEVEL, WORLD_HALF } from '../heightfield'
import type { HeightGrid } from './heightGrid'
import { patchSunVisibility } from './shaderUtil'

export interface WaterUniforms {
  uTime: { value: number }
  uShallow: { value: THREE.Color }
  uDeep: { value: THREE.Color }
  tSunVisA: { value: THREE.Texture | null }
  tSunVisB: { value: THREE.Texture | null }
  uSunVisMix: { value: number }
}

/** Inner sea grid half-size (m) — swell lives here; beyond it the sea is a flat ring. */
const SEA_INNER = 240
const SEA_SEG = 120
const SEA_OUTER = 1300

const VERT_PARS = /* glsl */ `
attribute vec2 aWater;
uniform float uTime;
varying vec3 vWWorld;
varying vec3 vWNormal;
varying vec2 vWater;

void swellWave( vec2 p, vec2 d, float k, float a, float c, inout float h, inout vec2 g ) {
  float ph = dot( d, p ) * k - uTime * k * c;
  h += a * sin( ph );
  g += a * k * cos( ph ) * d;
}
`

const VERT_NORMAL = /* glsl */ `
float wSwellH = 0.0;
vec2 wSwellG = vec2( 0.0 );
swellWave( position.xz, vec2( 0.148, -0.989 ), 0.1745, 0.075, 2.2, wSwellH, wSwellG );
swellWave( position.xz, vec2( -0.6, -0.8 ), 0.2856, 0.045, 1.8, wSwellH, wSwellG );
swellWave( position.xz, vec2( 0.707, -0.707 ), 0.4488, 0.026, 1.4, wSwellH, wSwellG );
wSwellH *= aWater.x;
wSwellG *= aWater.x;
vec3 objectNormal = normalize( vec3( - wSwellG.x, 1.0, - wSwellG.y ) );
`

const VERT_MAIN = /* glsl */ `
transformed.y += wSwellH;
vWWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
vWNormal = normalize( mat3( modelMatrix ) * objectNormal );
vWater = aWater;
`

function fragPars(grid: HeightGrid): string {
  const n = grid.n.toFixed(1)
  return /* glsl */ `
uniform sampler2D tWaterN;
uniform sampler2D tHeight;
uniform sampler2D tNoise;
uniform sampler2D tSunVisA;
uniform sampler2D tSunVisB;
uniform float uSunVisMix;
uniform float uTime;
uniform vec3 uShallow;
uniform vec3 uDeep;
varying vec3 vWWorld;
varying vec3 vWNormal;
varying vec2 vWater;

float waterGround( vec2 xz ) {
  vec2 uv = ( ( xz + ${WORLD_HALF.toFixed(1)} ) / ${grid.cell.toFixed(6)} + 0.5 ) / ${n};
  return texture2D( tHeight, uv ).r;
}

// The sea plane runs under the whole island; inside a lake basin (whose bed dips
// below sea level) it must not show through the lake surface above it.
bool seaUnderLake( vec3 p ) {
${LAKES.map(l => `  if ( p.y < ${(l.level - 1).toFixed(2)} && distance( p.xz, vec2( ${l.x.toFixed(1)}, ${l.z.toFixed(1)} ) ) < ${(l.r + 7).toFixed(1)} ) return true;`).join('\n')}
  return false;
}

float waterSunVis( vec2 xz ) {
  vec2 uv = xz / ${(WORLD_HALF * 2).toFixed(1)} + 0.5;
  float v = texture2D( tSunVisA, uv ).r;
  if ( uSunVisMix > 0.0 ) v = mix( v, texture2D( tSunVisB, uv ).r, uSunVisMix );
  return v;
}
`
}

/** Replaces <map_fragment>. */
const FRAG_SURFACE = /* glsl */ `
vec3 wP = vWWorld;
if ( seaUnderLake( wP ) ) discard;
float wDepth = wP.y - waterGround( wP.xz );
float wD = max( wDepth, 0.0 );
float wSea = vWater.x;
vec3 wGN = normalize( vWNormal );
vec2 wUV = vec2( wP.x, - wP.z );
float wDist = length( wP - cameraPosition );

// Layers at different scales and orientations (v * R rotates each normal back).
vec2 wNx = ( texture2D( tWaterN, wUV * 0.037 + vec2( uTime * 0.010, uTime * 0.005 ) ).xy * 2.0 - 1.0 ) * 0.5;
#if WATER_DETAIL > 0
  const mat2 wR2 = mat2( 0.6, -0.8, 0.8, 0.6 );
  wNx += ( ( texture2D( tWaterN, ( wR2 * wUV ) * 0.097 + vec2( - uTime * 0.008, uTime * 0.014 ) + 0.5 ).xy * 2.0 - 1.0 ) * wR2 ) * 0.36;
#endif
#if WATER_DETAIL > 1
  const mat2 wR3 = mat2( -0.28, -0.96, 0.96, -0.28 );
  wNx += ( ( texture2D( tWaterN, ( wR3 * wUV ) * 0.26 + vec2( uTime * 0.024, - uTime * 0.017 ) + 0.25 ).xy * 2.0 - 1.0 ) * wR3 ) * 0.2;
#endif
// Calmer far away (clean horizon reflection), in the very shallows and on the lakes.
wNx *= 0.75 * mix( 1.0, 0.3, smoothstep( 25.0, 180.0, wDist ) ) * mix( 0.45, 1.0, smoothstep( 0.0, 1.5, wD ) ) * mix( 0.6, 1.0, wSea );
vec3 wN = normalize( vec3( wGN.x + wNx.x, wGN.y, wGN.z - wNx.y ) );

vec3 wCol = mix( uShallow, uDeep, 1.0 - exp( - wD * 0.3 ) );

// Shoreline foam: a ragged contact line plus lines rolling in toward the beach.
float wN1 = texture2D( tNoise, wP.xz * 0.071 + vec2( uTime * 0.013, - uTime * 0.009 ) ).r;
float wN2 = texture2D( tNoise, wP.xz * 0.23 + vec2( - uTime * 0.02, uTime * 0.017 ) ).r;
float wFoam = ( 1.0 - smoothstep( 0.0, 0.14 + wN1 * 0.3, wD ) ) * ( 0.55 + 0.45 * wN2 );
#if WATER_DETAIL > 0
  float wBand = 1.0 - smoothstep( 0.0, 0.9 + wSea * 0.9, wD );
  float wPhase = wD * 6.0 + uTime * 1.6 + wN1 * 8.0;
  float wLines = sin( wPhase ) * 0.5 + 0.5;
  // Fade the lines out where they get thinner than a pixel (they would only sparkle).
  float wLineAA = 1.0 - smoothstep( 0.6, 1.6, fwidth( wPhase ) );
  wFoam = max( wFoam, wBand * wLineAA * smoothstep( 0.7, 0.95, wLines ) * smoothstep( 0.35, 0.62, wN2 ) * mix( 0.5, 1.0, wSea ) );
#endif
wFoam = clamp( wFoam, 0.0, 1.0 );
wCol = mix( wCol, vec3( 0.92, 0.95, 0.96 ), wFoam );

float wBody = mix( 0.38, 1.0, smoothstep( 0.0, 3.8, wD ) );
wBody = max( wBody, wFoam * 0.92 );
float wEdge = smoothstep( 0.0, 0.1, wDepth ) * ( 1.0 - smoothstep( 0.82, 1.0, vWater.y ) );
float wRough = mix( 0.045, 0.5, wFoam );
float wSunVis = waterSunVis( wP.xz );

diffuseColor = vec4( wCol, wBody );
`

/** Before <opaque_fragment>: fresnel makes grazing water opaque (all reflection), then the edge fade. */
const FRAG_ALPHA = /* glsl */ `
float wFres = pow( 1.0 - saturate( dot( normalize( vViewPosition ), normal ) ), 5.0 );
diffuseColor.a = mix( diffuseColor.a, 1.0, wFres * ( 1.0 - wFoam ) ) * wEdge;
#include <opaque_fragment>
`

export function createWaterMaterial(textures: TextureLib, grid: HeightGrid, heightTex: THREE.Texture, uniforms: WaterUniforms, detail: number): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.05, metalness: 0, transparent: true })
  mat.name = 'starfall.water'
  mat.defines = { WATER_DETAIL: detail }
  const pars = fragPars(grid)
  mat.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms, {
      tWaterN: { value: textures.get('water_normal') },
      tNoise: { value: textures.get('noise') },
      tHeight: { value: heightTex },
    })
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
      .replace('#include <beginnormal_vertex>', VERT_NORMAL)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERT_MAIN}`)
    shader.fragmentShader = patchSunVisibility(
      shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${pars}`)
        .replace('#include <map_fragment>', FRAG_SURFACE)
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = wRough;')
        .replace('#include <normal_fragment_maps>', 'normal = normalize( ( viewMatrix * vec4( wN, 0.0 ) ).xyz );')
        .replace('#include <opaque_fragment>', FRAG_ALPHA),
      'wSunVis',
    )
  }
  mat.customProgramCacheKey = () => 'starfall.water.v1'
  return mat
}

/* ────────────────────────────────────────────────────────────
   Geometry
   ──────────────────────────────────────────────────────────── */

/** Dense swell grid around the island + a flat outer ring out past the far plane. */
function seaGeometry(): THREE.BufferGeometry {
  const pos: number[] = []
  const wat: number[] = []
  const idx: number[] = []
  const n = SEA_SEG
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const x = -SEA_INNER + (i / n) * SEA_INNER * 2
      const z = -SEA_INNER + (j / n) * SEA_INNER * 2
      pos.push(x, SEA_LEVEL, z)
      const edge = Math.max(Math.abs(x), Math.abs(z))
      const swell = 1 - Math.min(1, Math.max(0, (edge - 170) / (SEA_INNER - 170)))
      wat.push(swell * swell * (3 - 2 * swell), 0)
    }
  }
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const p = j * (n + 1) + i
      const q = p + n + 1
      idx.push(p, q, p + 1, p + 1, q, q + 1)
    }
  }
  // Outer ring: 8 flat quads around the inner square.
  const c = [-SEA_OUTER, -SEA_INNER, SEA_INNER, SEA_OUTER]
  for (let b = 0; b < 3; b++) {
    for (let a = 0; a < 3; a++) {
      if (a === 1 && b === 1) continue
      const base = pos.length / 3
      pos.push(c[a], SEA_LEVEL, c[b], c[a + 1], SEA_LEVEL, c[b], c[a], SEA_LEVEL, c[b + 1], c[a + 1], SEA_LEVEL, c[b + 1])
      wat.push(0, 0, 0, 0, 0, 0, 0, 0)
      idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, k) => (k % 3 === 1 ? 1 : 0)), 3))
  g.setAttribute('aWater', new THREE.Float32BufferAttribute(wat, 2))
  g.setIndex(idx)
  g.computeBoundingSphere()
  return g
}

/** Flat disc at the lake's level; aWater.y runs 0 → 1 toward the rim for a soft edge. */
function lakeGeometry(x: number, z: number, level: number, radius: number): THREE.BufferGeometry {
  const seg = 56
  const rings = [0, 0.45, 0.82, 1]
  const pos: number[] = [x, level, z]
  const wat: number[] = [0, 0]
  const idx: number[] = []
  for (let r = 1; r < rings.length; r++) {
    for (let s = 0; s < seg; s++) {
      const a = (s / seg) * Math.PI * 2
      pos.push(x + Math.cos(a) * radius * rings[r], level, z + Math.sin(a) * radius * rings[r])
      wat.push(0, rings[r])
    }
  }
  for (let s = 0; s < seg; s++) {
    const s1 = (s + 1) % seg
    idx.push(0, 1 + s1, 1 + s)
  }
  for (let r = 1; r < rings.length - 1; r++) {
    const a0 = 1 + (r - 1) * seg
    const b0 = 1 + r * seg
    for (let s = 0; s < seg; s++) {
      const s1 = (s + 1) % seg
      idx.push(a0 + s, a0 + s1, b0 + s, a0 + s1, b0 + s1, b0 + s)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, k) => (k % 3 === 1 ? 1 : 0)), 3))
  g.setAttribute('aWater', new THREE.Float32BufferAttribute(wat, 2))
  g.setIndex(idx)
  g.computeBoundingSphere()
  return g
}

export interface WaterBuild {
  group: THREE.Group
  geometries: THREE.BufferGeometry[]
}

export function buildWater(material: THREE.Material): WaterBuild {
  const group = new THREE.Group()
  group.name = 'water'
  const geometries: THREE.BufferGeometry[] = []
  const add = (g: THREE.BufferGeometry, name: string) => {
    const m = new THREE.Mesh(g, material)
    m.name = name
    m.receiveShadow = true
    m.renderOrder = -10
    m.matrixAutoUpdate = false
    group.add(m)
    geometries.push(g)
    return m
  }
  const sea = add(seaGeometry(), 'sea')
  sea.frustumCulled = false
  for (const l of LAKES) add(lakeGeometry(l.x, l.z, l.level, l.r + 6), `lake-${l.id}`)
  return { group, geometries }
}
