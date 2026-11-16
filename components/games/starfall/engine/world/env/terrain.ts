/**
 * Terrain: chunked heightfield mesh + splat material.
 *
 * - 8×8 chunks over ±WORLD_HALF. Chunks that reach near the surface use the full
 *   grid resolution (~1 m); deep sea-floor chunks use a quarter of it and are
 *   merged into a single mesh. Fine edges next to coarse neighbours are snapped
 *   onto the coarse edge, so there are no cracks.
 * - Per-vertex splat weights (sand / dirt / rock, grass = remainder), ambient
 *   occlusion, height above water and a lushness tint come from the heightfield,
 *   following the same rules as `surfaceAt()` so footsteps match the visuals.
 * - The material is MeshStandardMaterial patched with onBeforeCompile, so it keeps
 *   lights, shadows, fog and IBL. Rock is triplanar; the other layers are planar
 *   with a second rotated scale blended in patches to hide tiling.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { TextureLib } from '../../textures'
import { fbm, LAKES, pathWeight, smoothstep, waterLevelAt, WORLD_HALF, ZONES } from '../heightfield'
import type { HeightGrid } from './heightGrid'
import { patchSunVisibility } from './shaderUtil'

/** Chunks per side. */
export const CHUNKS = 8
const FINE = 48
const COARSE = 12

export interface TerrainUniforms {
  uTime: { value: number }
  uCaustic: { value: THREE.Color }
  tSunVisA: { value: THREE.Texture | null }
  tSunVisB: { value: THREE.Texture | null }
  uSunVisMix: { value: number }
}

/* ────────────────────────────────────────────────────────────
   Per-vertex attributes
   ──────────────────────────────────────────────────────────── */

const FOREST = ZONES.find(z => z.id === 'forest')!

interface ChunkAttrs {
  splat: Float32Array
  misc: Float32Array
  normal: Float32Array
}

/**
 * Computes, for every grid point a chunk uses (`used`): normal, splat (sand, dirt,
 * rock, macro brightness) and misc (ao, height above water, lushness).
 */
function computeAttributes(grid: HeightGrid, used: Uint8Array): ChunkAttrs {
  const { n, cell } = grid
  const splat = new Float32Array(n * n * 4)
  const misc = new Float32Array(n * n * 3)
  const normal = new Float32Array(n * n * 3)
  const at = (i: number, j: number) => grid.at(i, j)
  const r1 = 2
  const r2 = 6
  for (let j = 0; j < n; j++) {
    const z = grid.coord(j)
    for (let i = 0; i < n; i++) {
      const k = j * n + i
      if (!used[k]) continue
      const x = grid.coord(i)
      const h = grid.h[k]
      // Normal by central differences (same convention as normalAt()).
      let nx = at(i - 1, j) - at(i + 1, j)
      let ny = 2 * cell
      let nz = at(i, j - 1) - at(i, j + 1)
      const len = Math.hypot(nx, ny, nz)
      nx /= len
      ny /= len
      nz /= len
      normal[k * 3] = nx
      normal[k * 3 + 1] = ny
      normal[k * 3 + 2] = nz

      const wl = waterLevelAt(x, z)
      const hw = h - wl
      const slope = 1 - ny
      const nMid = fbm(x * 0.05, z * 0.05, 2)

      const highland = smoothstep(9, 18, h)
      // Steep ground (surfaceAt: slope > 0.32).
      const rock = smoothstep(0.25, 0.35, slope + nMid * 0.03)

      // Paths (surfaceAt: pathWeight > 0.5).
      let dirt = h > wl - 0.3 ? smoothstep(0.3, 0.62, pathWeight(x, z)) : 0
      // Lakes: muddy banks and beds instead of beach sand.
      let lakeT = 0
      for (const l of LAKES) {
        const d = Math.hypot(x - l.x, z - l.z)
        lakeT = Math.max(lakeT, 1 - smoothstep(l.r + 4, l.r + 10, d))
      }
      dirt = Math.max(dirt, lakeT * (1 - smoothstep(0.1, 0.55, hw)) * 0.85)
      // Leaf litter patches on the forest floor.
      const forest = 1 - smoothstep(FOREST.r * 0.6, FOREST.r * 1.15, Math.hypot(x - FOREST.x, z - FOREST.z))
      if (forest > 0) dirt = Math.max(dirt, forest * smoothstep(0.08, 0.32, fbm(x * 0.09 - 7.7, z * 0.09 + 3.1, 3)) * 0.7)

      // Beach sand (surfaceAt: h < 1.9 + fbm * 0.6), not around the lakes. Extra fine
      // noise only frays the visual edge into tufts; the rule's line stays put.
      let sand = 0
      if (h < 4) {
        const sandLine = 1.9 + nMid * 0.6 + fbm(x * 0.21 + 4.4, z * 0.21 - 1.9, 2) * 0.35
        sand = (1 - smoothstep(sandLine - 0.45, sandLine + 0.3, h)) * (1 - lakeT)
      }

      const wRock = rock
      const wDirt = (1 - wRock) * dirt
      const wSand = (1 - wRock) * (1 - dirt) * sand
      splat[k * 4] = wSand
      splat[k * 4 + 1] = wDirt
      splat[k * 4 + 2] = wRock
      // Large-scale brightness/tint variation (0..1), cheaper here than a texture fetch.
      splat[k * 4 + 3] = 0.5 + fbm(x * 0.0045 - 3.3, z * 0.0045 + 8.1, 3) * 0.9

      // Cavity AO: compare with the average height on two rings (2 m and 6 m).
      let s1 = 0
      let s2 = 0
      for (let a = 0; a < 8; a++) {
        const ox = OCT_X[a]
        const oz = OCT_Z[a]
        s1 += at(i + ox * r1, j + oz * r1)
        s2 += at(i + ox * r2, j + oz * r2)
      }
      const cav = (h - s1 / 8) * 0.55 + (h - s2 / 8) * 0.16
      const ao = Math.min(1, Math.max(0.42, 1 + Math.min(0, cav) + Math.max(0, cav) * 0.15))
      misc[k * 3] = ao
      misc[k * 3 + 1] = hw
      // Lushness: greener in the wood and low meadows, drier on the heights and by the beach.
      // Convex knolls dry out first, hollows stay green.
      misc[k * 3 + 2] =
        fbm(x * 0.011 + 1.3, z * 0.011 - 4.2, 3) * 0.9 + forest * 0.55 - highland * 0.35 - (1 - smoothstep(2, 4, hw)) * 0.3 -
        Math.min(0.5, Math.max(-0.4, cav * 2.2))
    }
  }
  return { splat, misc, normal }
}

const OCT_X = [1, 1, 0, -1, -1, -1, 0, 1]
const OCT_Z = [0, 1, 1, 1, 0, -1, -1, -1]

/* ────────────────────────────────────────────────────────────
   Chunk geometry
   ──────────────────────────────────────────────────────────── */

function chunkGeometry(grid: HeightGrid, attrs: ChunkAttrs, cx: number, cz: number, seg: number, neighbourSeg: (dx: number, dz: number) => number): THREE.BufferGeometry {
  const n = grid.n
  const stride = FINE / seg
  const i0 = cx * FINE
  const j0 = cz * FINE
  const vcount = (seg + 1) * (seg + 1)
  const pos = new Float32Array(vcount * 3)
  const nrm = new Float32Array(vcount * 3)
  const spl = new Float32Array(vcount * 4)
  const msc = new Float32Array(vcount * 3)

  // Snapping ratio per edge: >1 when that neighbour is coarser.
  const west = Math.max(1, seg / neighbourSeg(-1, 0))
  const east = Math.max(1, seg / neighbourSeg(1, 0))
  const north = Math.max(1, seg / neighbourSeg(0, -1))
  const south = Math.max(1, seg / neighbourSeg(0, 1))
  const gh = (a: number, b: number) => grid.h[(j0 + b * stride) * n + i0 + a * stride]
  /** Height along an edge, interpolated between the coarse neighbour's vertices. */
  const edgeH = (along: number, ratio: number, fixed: (t: number) => number) => {
    const r = along % ratio
    if (r === 0) return fixed(along)
    const a = along - r
    return fixed(a) + (fixed(a + ratio) - fixed(a)) * (r / ratio)
  }

  let v = 0
  for (let b = 0; b <= seg; b++) {
    for (let a = 0; a <= seg; a++, v++) {
      const gi = i0 + a * stride
      const gj = j0 + b * stride
      const k = gj * n + gi
      let h = grid.h[k]
      if (a === 0 && west > 1) h = edgeH(b, west, t => gh(0, t))
      else if (a === seg && east > 1) h = edgeH(b, east, t => gh(seg, t))
      else if (b === 0 && north > 1) h = edgeH(a, north, t => gh(t, 0))
      else if (b === seg && south > 1) h = edgeH(a, south, t => gh(t, seg))
      pos[v * 3] = grid.coord(gi)
      pos[v * 3 + 1] = h
      pos[v * 3 + 2] = grid.coord(gj)
      for (let c = 0; c < 3; c++) {
        nrm[v * 3 + c] = attrs.normal[k * 3 + c]
        msc[v * 3 + c] = attrs.misc[k * 3 + c]
      }
      for (let c = 0; c < 4; c++) spl[v * 4 + c] = attrs.splat[k * 4 + c]
    }
  }

  const idx = new Uint16Array(seg * seg * 6)
  let t = 0
  for (let b = 0; b < seg; b++) {
    for (let a = 0; a < seg; a++) {
      const p = b * (seg + 1) + a
      const q = p + seg + 1
      // Alternate the diagonal so slopes don't show a uniform grain.
      if ((a + b) & 1) {
        idx.set([p, q, p + 1, p + 1, q, q + 1], t)
      } else {
        idx.set([p, q, q + 1, p, q + 1, p + 1], t)
      }
      t += 6
    }
  }

  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3))
  g.setAttribute('aSplat', new THREE.BufferAttribute(spl, 4))
  g.setAttribute('aMisc', new THREE.BufferAttribute(msc, 3))
  g.setIndex(new THREE.BufferAttribute(idx, 1))
  g.computeBoundingBox()
  g.computeBoundingSphere()
  return g
}

/* ────────────────────────────────────────────────────────────
   Material
   ──────────────────────────────────────────────────────────── */

const VERT_PARS = /* glsl */ `
attribute vec4 aSplat;
attribute vec3 aMisc;
varying vec3 vTWorld;
varying vec3 vTNormal;
varying vec4 vTSplat;
varying vec3 vTMisc;
`

const VERT_MAIN = /* glsl */ `
vTWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
vTNormal = normalize( mat3( modelMatrix ) * objectNormal );
vTSplat = aSplat;
vTMisc = aMisc;
`

const FRAG_PARS = /* glsl */ `
uniform sampler2D tGrass;
uniform sampler2D tGrassN;
uniform sampler2D tSand;
uniform sampler2D tSandN;
uniform sampler2D tDirt;
uniform sampler2D tDirtN;
uniform sampler2D tRock;
uniform sampler2D tRockN;
uniform sampler2D tNoise;
uniform sampler2D tSunVisA;
uniform sampler2D tSunVisB;
uniform float uSunVisMix;
uniform float uTime;
uniform vec3 uCaustic;
varying vec3 vTWorld;
varying vec3 vTNormal;
varying vec4 vTSplat;
varying vec3 vTMisc;

float tLum( vec3 c ) { return dot( c, vec3( 0.3, 0.5, 0.2 ) ); }

float sunVisAt( vec2 xz ) {
  vec2 uv = xz / ${(WORLD_HALF * 2).toFixed(1)} + 0.5;
  float v = texture2D( tSunVisA, uv ).r;
  if ( uSunVisMix > 0.0 ) v = mix( v, texture2D( tSunVisB, uv ).r, uSunVisMix );
  return v;
}
`

/** Replaces <map_fragment>: computes albedo plus the values later chunks consume. */
const FRAG_SURFACE = /* glsl */ `
vec3 tWP = vTWorld;
vec3 tGN = normalize( vTNormal );
vec2 tUV = vec2( tWP.x, - tWP.z );
float nBig = vTSplat.w;
float nMid = texture2D( tNoise, tWP.xz * 0.021 + vec2( 0.31, 0.17 ) ).r;
float tileMix = smoothstep( 0.4, 0.6, nMid );

// Layer UVs. Layers are skipped where their weight is ~0, so implicit
// derivatives inside the branches only ever matter where they are invisible.
vec2 uvA = tUV * 0.33;
vec2 uvB = mat2( 0.76, -0.65, 0.65, 0.76 ) * tUV * 0.121 + 0.37;
vec2 uvS = tUV * 0.27;
vec2 uvD = tUV * 0.36;
float rs = 0.21;
vec2 uX = tWP.zy * rs, uY = tWP.xz * rs + 0.37, uZ = tWP.xy * rs + 0.71;

vec4 tw = vec4( 1.0 - vTSplat.x - vTSplat.y - vTSplat.z, vTSplat.x, vTSplat.y, vTSplat.z );
tw = max( tw, 0.0 );

vec3 aG = vec3( 0.0 ), aS = vec3( 0.0 ), aD = vec3( 0.0 ), aR = vec3( 0.0 );
vec2 nG = vec2( 0.0 ), nS = vec2( 0.0 ), nD = vec2( 0.0 );
vec3 nR = tGN;

if ( tw.x > 0.003 ) {
  vec3 g1 = texture2D( tGrass, uvA ).rgb;
  vec3 g2 = texture2D( tGrass, uvB ).rgb;
  aG = mix( g1, g2, tileMix );
  nG = ( texture2D( tGrassN, uvA ).xy * 2.0 - 1.0 ) * 0.8;
}
if ( tw.y > 0.003 ) {
  vec3 s1 = texture2D( tSand, uvS ).rgb;
  vec3 s2 = texture2D( tSand, uvB * 0.9 ).rgb;
  aS = mix( s1, s2, tileMix * 0.8 );
  nS = ( texture2D( tSandN, uvS ).xy * 2.0 - 1.0 ) * 0.7;
}
if ( tw.z > 0.003 ) {
  aD = texture2D( tDirt, uvD ).rgb;
  nD = ( texture2D( tDirtN, uvD ).xy * 2.0 - 1.0 ) * 0.9;
}
if ( tw.w > 0.003 ) {
  vec3 bl = pow( abs( tGN ), vec3( 4.0 ) );
  bl /= dot( bl, vec3( 1.0 ) );
  aR = texture2D( tRock, uX ).rgb * bl.x + texture2D( tRock, uY ).rgb * bl.y + texture2D( tRock, uZ ).rgb * bl.z;
  // Whiteout-blended triplanar normals.
  vec3 tnX = texture2D( tRockN, uX ).xyz * 2.0 - 1.0;
  vec3 tnY = texture2D( tRockN, uY ).xyz * 2.0 - 1.0;
  vec3 tnZ = texture2D( tRockN, uZ ).xyz * 2.0 - 1.0;
  tnX = vec3( tnX.xy * 1.1 + tGN.zy, abs( tnX.z ) * tGN.x );
  tnY = vec3( tnY.xy * 1.1 + tGN.xz, abs( tnY.z ) * tGN.y );
  tnZ = vec3( tnZ.xy * 1.1 + tGN.xy, abs( tnZ.z ) * tGN.z );
  nR = normalize( tnX.zyx * bl.x + tnY.xzy * bl.y + tnZ.xyz * bl.z );
}

// Fray the grass/sand/dirt borders with a fine noise so they break into tufts.
if ( min( tw.x, max( tw.y, tw.z ) ) > 0.01 ) {
  float nF = texture2D( tNoise, tWP.xz * 0.31 + vec2( 0.53, 0.29 ) ).r;
  tw.x *= 0.35 + nF * 1.3;
}

// Height-based blending: texels brighter than their layer's average (pebbles,
// blade tips) win the transitions, so edges fray into tufts instead of a line.
vec4 hb = tw * ( 0.25 + vec4( tLum( aG ) / 0.145, tLum( aS ) / 0.55, tLum( aD ) / 0.15, tLum( aR ) / 0.18 ) );
float hmax = max( max( hb.x, hb.y ), max( hb.z, hb.w ) );
hb = max( hb - hmax * 0.55, 0.0 );
tw = hb / ( hb.x + hb.y + hb.z + hb.w + 1e-5 );

// Grass tint: lush in the wood and low meadows, sun-dried on the heights.
float lush = clamp( vTMisc.z + ( nBig - 0.5 ) * 0.9, -1.0, 1.0 );
vec3 grassTint = lush > 0.0 ? mix( vec3( 1.0 ), vec3( 0.74, 0.94, 0.72 ), lush ) : mix( vec3( 1.0 ), vec3( 1.28, 1.08, 0.62 ), - lush );
aG = mix( vec3( tLum( aG ) ), aG, 0.88 ) * grassTint;
aR *= vec3( 1.06, 1.0, 0.9 );
aG *= mix( 0.78, 1.12, smoothstep( 0.2, 0.8, nMid ) );
aS *= mix( vec3( 0.9, 0.86, 0.8 ), vec3( 0.84, 0.83, 0.82 ), nMid );
aD *= 1.08;

vec3 tAlb = aG * tw.x + aS * tw.y + aD * tw.z + aR * tw.w;
tAlb *= 0.82 + nBig * 0.36;

float tAO = vTMisc.x;
float hw = vTMisc.y;
tAlb *= mix( 0.72, 1.0, tAO );

// Wet band at the waterline, darker and glossier; tinted underwater.
float wet = 1.0 - smoothstep( 0.0, 0.35, hw );
float wetAmt = wet * ( tw.y + tw.z * 0.8 + tw.x * 0.5 + tw.w * 0.6 );
tAlb *= mix( 1.0, 0.58, wetAmt );
tAlb *= mix( vec3( 1.0 ), vec3( 0.7, 0.86, 0.9 ), smoothstep( 0.0, -2.5, hw ) );

float tRough = dot( tw, vec4( 0.93, 0.86, 0.95, 0.8 ) );
tRough = mix( tRough, 0.3, wet * tw.y * step( 0.0, hw ) );

// Normal: planar layers share a world-aligned tangent frame (u = +x, v = -z).
vec2 nP = nG * tw.x + nS * tw.y + nD * tw.z;
vec3 tT0 = vec3( 1.0, 0.0, 0.0 ) - tGN * tGN.x;
vec3 tT = dot( tT0, tT0 ) > 1e-5 ? normalize( tT0 ) : vec3( 0.0, 0.0, 1.0 );
vec3 tB = cross( tGN, tT );
vec3 tNP = normalize( tT * nP.x + tB * nP.y + tGN );
vec3 tN = normalize( mix( tNP, nR, tw.w ) );

float tSunVis = sunVisAt( tWP.xz ) * mix( 0.75, 1.0, tAO );

// Caustics on the shallow sea floor.
vec3 tCaustic = vec3( 0.0 );
float tCamDist = length( tWP - cameraPosition );
if ( hw < 0.05 && tCamDist < 90.0 ) {
  vec2 cp = tWP.xz * 0.15;
  float c1 = texture2D( tNoise, cp + vec2( uTime * 0.019, uTime * 0.011 ) ).r;
  float c2 = texture2D( tNoise, cp * 1.37 + vec2( - uTime * 0.015, uTime * 0.017 ) + 0.5 ).r;
  float c = pow( 1.0 - abs( c1 - c2 ), 10.0 );
  tCaustic = uCaustic * c * tSunVis * smoothstep( 0.05, -0.35, hw ) * smoothstep( -6.0, -1.0, hw ) * smoothstep( 90.0, 35.0, tCamDist ) * tAlb;
}

diffuseColor.rgb = tAlb;
`

export function createTerrainMaterial(textures: TextureLib, uniforms: TerrainUniforms): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 })
  mat.name = 'starfall.terrain'
  // The heightfield is a single sheet: render back faces into the shadow map so
  // lit slopes never self-shadow (no acne) while ridges still cast.
  mat.shadowSide = THREE.BackSide
  mat.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms, {
      tGrass: { value: textures.get('grass_albedo') },
      tGrassN: { value: textures.get('grass_normal') },
      tSand: { value: textures.get('sand_albedo') },
      tSandN: { value: textures.get('sand_normal') },
      tDirt: { value: textures.get('dirt_albedo') },
      tDirtN: { value: textures.get('dirt_normal') },
      tRock: { value: textures.get('rock_albedo') },
      tRockN: { value: textures.get('rock_normal') },
      tNoise: { value: textures.get('noise') },
    })
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERT_MAIN}`)
    shader.fragmentShader = patchSunVisibility(
      shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${FRAG_PARS}`)
        .replace('#include <map_fragment>', FRAG_SURFACE)
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = tRough;')
        .replace('#include <normal_fragment_maps>', 'normal = normalize( ( viewMatrix * vec4( tN, 0.0 ) ).xyz );')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += tCaustic;')
        .replace(
          '#include <lights_fragment_end>',
          '#include <lights_fragment_end>\nreflectedLight.indirectDiffuse *= tAO;\nreflectedLight.indirectSpecular *= tAO;',
        ),
      'tSunVis',
    )
  }
  mat.customProgramCacheKey = () => 'starfall.terrain.v1'
  return mat
}

/* ────────────────────────────────────────────────────────────
   Build
   ──────────────────────────────────────────────────────────── */

export interface TerrainBuild {
  group: THREE.Group
  geometries: THREE.BufferGeometry[]
  triangles: number
}

/** Builds every chunk (fine chunks as separate meshes for culling, coarse ones merged). */
export function buildTerrain(grid: HeightGrid, material: THREE.Material): TerrainBuild {
  const n = grid.n
  // Fine where any point comes within 4 m of the surface (visible through shallow water).
  const segOf: number[] = []
  for (let cz = 0; cz < CHUNKS; cz++) {
    for (let cx = 0; cx < CHUNKS; cx++) {
      let max = -Infinity
      for (let j = cz * FINE; j <= (cz + 1) * FINE; j += 2) {
        for (let i = cx * FINE; i <= (cx + 1) * FINE; i += 2) max = Math.max(max, grid.h[j * n + i])
      }
      segOf.push(max > -4 ? FINE : COARSE)
    }
  }
  const neighbour = (cx: number, cz: number) => (dx: number, dz: number) => {
    const x = cx + dx
    const z = cz + dz
    if (x < 0 || z < 0 || x >= CHUNKS || z >= CHUNKS) return FINE
    return segOf[z * CHUNKS + x]
  }
  // Only grid points some chunk actually uses need attributes (coarse chunks use 1 in 16).
  const used = new Uint8Array(n * n)
  for (let cz = 0; cz < CHUNKS; cz++) {
    for (let cx = 0; cx < CHUNKS; cx++) {
      const stride = FINE / segOf[cz * CHUNKS + cx]
      for (let j = cz * FINE; j <= (cz + 1) * FINE; j += stride) {
        for (let i = cx * FINE; i <= (cx + 1) * FINE; i += stride) used[j * n + i] = 1
      }
    }
  }
  const attrs = computeAttributes(grid, used)

  const group = new THREE.Group()
  group.name = 'terrain'
  const geometries: THREE.BufferGeometry[] = []
  const coarse: THREE.BufferGeometry[] = []
  let triangles = 0
  for (let cz = 0; cz < CHUNKS; cz++) {
    for (let cx = 0; cx < CHUNKS; cx++) {
      const seg = segOf[cz * CHUNKS + cx]
      const g = chunkGeometry(grid, attrs, cx, cz, seg, neighbour(cx, cz))
      triangles += seg * seg * 2
      if (seg === COARSE) {
        coarse.push(g)
        continue
      }
      const mesh = new THREE.Mesh(g, material)
      mesh.name = `terrain-${cx}-${cz}`
      mesh.receiveShadow = true
      mesh.castShadow = true
      mesh.matrixAutoUpdate = false
      group.add(mesh)
      geometries.push(g)
    }
  }
  if (coarse.length) {
    const merged = mergeGeometries(coarse)
    for (const g of coarse) g.dispose()
    if (merged) {
      merged.computeBoundingSphere()
      const floor = new THREE.Mesh(merged, material)
      floor.name = 'terrain-seafloor'
      floor.receiveShadow = true
      floor.matrixAutoUpdate = false
      group.add(floor)
      geometries.push(merged)
    }
  }
  return { group, geometries, triangles }
}
