/**
 * Pieces the sky dome, the star field and the shooting stars share: the cloud layer (so stars
 * dim behind exactly the clouds the dome draws), the layout of the night sky and the vertex
 * transform that pins geometry to the far plane.
 */
import * as THREE from 'three'

/** Unit vector toward a compass bearing (degrees clockwise from north = −Z) and elevation. */
export function skyDir(azimuth: number, elevation: number, out = new THREE.Vector3()): THREE.Vector3 {
  const az = (azimuth * Math.PI) / 180
  const el = (elevation * Math.PI) / 180
  return out.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el))
}

/**
 * The Milky Way's frame. Its band crosses the horizon in the north, close behind the Beacon as
 * seen from the beach, and leans west as it climbs; `GALAXY_CORE` (the bright bulge) sits low in
 * the north. `GALAXY_POLE` is the band's normal, `GALAXY_SIDE` completes the right-handed frame.
 */
export const GALAXY_POLE = skyDir(100, 28)
export const GALAXY_CORE = skyDir(357, 22).addScaledVector(GALAXY_POLE, -skyDir(357, 22).dot(GALAXY_POLE)).normalize()
export const GALAXY_SIDE = new THREE.Vector3().crossVectors(GALAXY_POLE, GALAXY_CORE)
/** The baked Milky Way texture covers sin(latitude) in ±this around the band. */
export const GALAXY_SPAN = 0.5

/**
 * skyClouds(): x = how much of the sky the drifting cloud layer covers toward `d`, y = how thick
 * the cloud is there. The layer is a curved sheet: thin near the horizon, gone below it.
 */
export const SKY_CLOUDS_GLSL = /* glsl */ `
vec2 skyClouds( sampler2D clouds, vec3 d, float cover, float time ) {
  float h = max( d.y, 0.0 );
  vec2 cuv = d.xz / ( h + 0.1 ) * 0.2;
  vec2 wind = vec2( time * 0.0032, time * 0.0011 );
  float c1 = texture2D( clouds, cuv + wind ).r;
  float c2 = texture2D( clouds, cuv * 2.6 - wind * 1.6 + 0.31 ).r;
  float c = c1 * 0.68 + c2 * 0.32;
  return vec2(
    smoothstep( cover, cover + 0.22, c ) * smoothstep( 0.0, 0.14, d.y ),
    smoothstep( cover + 0.05, cover + 0.45, c ) );
}
`

/**
 * skyClip(): clip-space position of a direction, at infinity (rotation-only view transform). A hair
 * inside the far plane: exactly z = w gets clipped or fails the depth test on some GPUs during
 * fast camera motion, which flashes the black clear colour through the sky.
 */
export const SKY_CLIP_GLSL = /* glsl */ `
vec4 skyClip( vec3 d ) {
  vec4 p = projectionMatrix * vec4( mat3( viewMatrix ) * d, 1.0 );
  return vec4( p.xy, p.w * 0.99999, p.w );
}
`

/** Uniforms the dome owns and the star field and shooting stars read (shared by reference). */
export interface SkyShared {
  uTime: THREE.IUniform<number>
  uStars: THREE.IUniform<number>
  uSunDisc: THREE.IUniform<number>
  uMoon: THREE.IUniform<number>
  uCloudCover: THREE.IUniform<number>
  uSunDir: THREE.IUniform<THREE.Vector3>
  uMoonDir: THREE.IUniform<THREE.Vector3>
  tClouds: THREE.IUniform<THREE.Texture | null>
  /** xy = 2 / drawing-buffer size (clip units per pixel), z = pixel scale for star sizes. */
  uView: THREE.IUniform<THREE.Vector3>
}

/** Just the shared uniforms, for a material that reads them (the same objects, not copies). */
export function sharedUniforms(s: SkyShared): SkyShared {
  return {
    uTime: s.uTime,
    uStars: s.uStars,
    uSunDisc: s.uSunDisc,
    uMoon: s.uMoon,
    uCloudCover: s.uCloudCover,
    uSunDir: s.uSunDir,
    uMoonDir: s.uMoonDir,
    tClouds: s.tClouds,
    uView: s.uView,
  }
}
