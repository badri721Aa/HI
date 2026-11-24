/**
 * The air: distance haze that thins with height and glows toward the sun and the moon, and a soft
 * rim of sky light on characters — written into three's own fog and lighting chunks, so every
 * material that already takes fog gets them. No extra pass, no per-material code, and the cost is
 * a handful of multiplies per pixel.
 *
 * The values travel in one shared `Float32Array` (`AIR`). three clones a material's uniform values
 * but passes a typed array through by reference, so every program reads the same five vec4s and
 * the Environment only writes 20 floats when the look changes. A material that never got the
 * uniform (all zeros) falls back to three's stock fog exactly.
 *
 * `installAir()` must run before the first shader compiles; `uninstallAir()` restores three as it
 * was (other pages on the site share this copy of three).
 */
import * as THREE from 'three'

/**
 * Five vec4s:
 *   0  xyz unit direction toward the sun's glow, w haze falloff per metre of height
 *   1  rgb the sun's glow in the fog,            w height the haze starts thinning at
 *   2  xyz unit direction toward the moon
 *   3  rgb the moon's glow in the fog
 *   4  rgb rim light on characters
 */
export const AIR = new Float32Array(20)
const UNIFORM = 'starfallAir'

/** The shared uniform and the fog colour toward a direction (also used by the sky dome's haze band). */
export const AIR_GLSL = /* glsl */ `
uniform vec4 ${UNIFORM}[ 5 ];
// Fog colour toward the unit direction d: the scene's fog plus the glow around the sun and the moon.
vec3 starfallAirColor( vec3 fog, vec3 d ) {
  float s = max( dot( d, ${UNIFORM}[ 0 ].xyz ), 0.0 );
  float m = max( dot( d, ${UNIFORM}[ 2 ].xyz ), 0.0 );
  s *= s;
  m *= m;
  return fog + ${UNIFORM}[ 1 ].rgb * ( s * 0.3 + s * s * s * 0.7 ) + ${UNIFORM}[ 3 ].rgb * ( m * m * m );
}
`

const PARS_VERTEX = /* glsl */ `
#ifdef USE_FOG
	// xyz: world-space offset from the camera, w: 1 on skinned meshes (characters).
	varying vec4 vFogAir;
#endif
`

const VERTEX = /* glsl */ `
#ifdef USE_FOG
	vFogAir.xyz = mvPosition.xyz * mat3( viewMatrix );
	#ifdef USE_SKINNING
		vFogAir.w = 1.0;
	#else
		vFogAir.w = 0.0;
	#endif
#endif
`

const PARS_FRAGMENT = /* glsl */ `
#ifdef USE_FOG
	varying vec4 vFogAir;
	${AIR_GLSL}
#endif
`

/** three's line that mixes the fog in, and what replaces it. */
const FOG_MIX = 'gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );'
const FOG_AIR = /* glsl */ `
	// The haze thins above its base height (peaks stand clear of it), but never at the far limit,
	// where everything still has to melt away.
	float airThin = exp( - max( cameraPosition.y + vFogAir.y - ${UNIFORM}[ 1 ].w, 0.0 ) * ${UNIFORM}[ 0 ].w );
	fogFactor *= mix( airThin, 1.0, fogFactor * fogFactor );
	vec3 airDir = vFogAir.xyz * inversesqrt( max( dot( vFogAir.xyz, vFogAir.xyz ), 1e-6 ) );
	gl_FragColor.rgb = mix( gl_FragColor.rgb, starfallAirColor( fogColor, airDir ), fogFactor );
`

const RIM = /* glsl */ `
#ifdef USE_FOG
	// Characters catch a soft rim of sky light, strongest on their upper edges.
	float airRim = 1.0 - saturate( dot( geometryNormal, geometryViewDir ) );
	reflectedLight.directDiffuse += ${UNIFORM}[ 4 ].rgb * ( vFogAir.w * airRim * airRim * airRim * ( 0.6 + 0.4 * geometryNormal.y ) );
#endif
`

type ChunkName = 'fog_pars_vertex' | 'fog_vertex' | 'fog_pars_fragment' | 'fog_fragment' | 'lights_fragment_end'
const CHUNKS: ChunkName[] = ['fog_pars_vertex', 'fog_vertex', 'fog_pars_fragment', 'fog_fragment', 'lights_fragment_end']

let stock: Record<ChunkName, string> | null = null

/** Every uniform set a fog-taking material is built from: the shared fog block and three's own shaders. */
function uniformSets(): Array<Record<string, THREE.IUniform>> {
  const sets: Array<Record<string, THREE.IUniform>> = [THREE.UniformsLib.fog]
  for (const shader of Object.values(THREE.ShaderLib)) if (shader.uniforms.fogColor) sets.push(shader.uniforms)
  return sets
}

/** Adds the air to three's fog. False (and nothing changed) if three's fog chunk is not the one this was written for. */
export function installAir(): boolean {
  if (stock) return true
  const chunk = THREE.ShaderChunk
  if (!chunk.fog_fragment.includes(FOG_MIX)) return false
  stock = {
    fog_pars_vertex: chunk.fog_pars_vertex,
    fog_vertex: chunk.fog_vertex,
    fog_pars_fragment: chunk.fog_pars_fragment,
    fog_fragment: chunk.fog_fragment,
    lights_fragment_end: chunk.lights_fragment_end,
  }
  chunk.fog_pars_vertex += PARS_VERTEX
  chunk.fog_vertex += VERTEX
  chunk.fog_pars_fragment += PARS_FRAGMENT
  chunk.fog_fragment = chunk.fog_fragment.replace(FOG_MIX, FOG_AIR)
  chunk.lights_fragment_end += RIM
  for (const set of uniformSets()) set[UNIFORM] = { value: AIR }
  return true
}

/** Puts three's chunks and uniform sets back, and clears the air for anything still drawing with it. */
export function uninstallAir(): void {
  AIR.fill(0)
  if (!stock) return
  for (const name of CHUNKS) THREE.ShaderChunk[name] = stock[name]
  for (const set of uniformSets()) delete set[UNIFORM]
  stock = null
}
