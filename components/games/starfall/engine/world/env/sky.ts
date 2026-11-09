/**
 * Sky dome: zenith/horizon gradient, sun disc + halo, drifting clouds lit by the
 * sun, stars, a faint milky way and the moon at night.
 *
 * The dome sits at infinity (rotation-only view transform, z = w on the far plane), so it
 * follows any camera and costs one draw call. It is drawn after the other opaque geometry
 * with the depth test on, so early-z skips its fairly heavy shader wherever the island
 * already covers the screen (transparent water and effects still blend over it). The same
 * material renders the PMREM environment map (`uEnvPass` = 1 swaps the lower
 * hemisphere for a ground-bounce colour and tones down the disc).
 */
import * as THREE from 'three'
import type { TextureLib } from '../../textures'
import type { Atmosphere } from './atmosphere'

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * vec4( mat3( viewMatrix ) * position, 1.0 );
  // A hair inside the far plane: exactly z = w gets clipped or fails the depth test on some
  // GPUs during fast camera motion, which flashes the black clear colour through the sky.
  gl_Position = vec4(p.xy, p.w * 0.99999, p.w);
}
`

const FRAG = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uHalo;
uniform vec3 uBounce;
uniform vec3 uSunColor;
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform vec3 uCloudLit;
uniform vec3 uCloudShade;
uniform float uSunDisc;
uniform float uMoon;
uniform float uStars;
uniform float uCloudCover;
uniform float uTime;
uniform float uEnvPass;
uniform sampler2D tClouds;
uniform sampler2D tNoise;
varying vec3 vDir;
#ifdef USE_FOG
  uniform vec3 fogColor;
#endif

#include <common>
#include <dithering_pars_fragment>

float skyHash( vec3 p ) {
  p = fract( p * 0.3183099 + 0.1 );
  p *= 17.0;
  return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) );
}

void main() {
  vec3 d = normalize( vDir );
  float h = d.y;
  float hp = max( h, 0.0 );

  // Gradient: warm haze at the horizon, deepening overhead.
  vec3 col = mix( uHorizon, uZenith, pow( hp, 0.5 ) );

  float sd = dot( d, uSunDir );
  float s = max( sd, 0.0 );
  float band = exp( - hp * 5.0 );
  vec3 glow = uHalo * ( pow( s, 3.0 ) * 0.6 * band + pow( s, 14.0 ) * 0.55 + pow( s, 160.0 ) * 1.6 );
  col += glow * uSunDisc;
  // Opposite the sun the low sky picks up a faint pink "belt of Venus".
  col += uHalo * vec3( 0.55, 0.32, 0.45 ) * pow( max( - sd, 0.0 ), 2.0 ) * exp( - abs( h - 0.08 ) * 12.0 ) * 0.25 * uSunDisc;

  // Stars and the milky way.
  if ( uStars > 0.001 ) {
    vec3 sp = d * 170.0;
    vec3 id = floor( sp );
    vec3 f = fract( sp ) - 0.5;
    float r = skyHash( id );
    float horizonFade = smoothstep( -0.02, 0.2, h );
    if ( r > 0.988 ) {
      vec3 off = vec3( skyHash( id + 1.37 ), skyHash( id + 2.71 ), skyHash( id + 4.13 ) ) - 0.5;
      float sdist = length( f - off * 0.6 );
      float tw = 0.7 + 0.3 * sin( uTime * ( 1.3 + r * 5.0 ) + r * 91.0 );
      float bright = ( r - 0.988 ) / 0.012;
      col += mix( vec3( 1.0, 0.85, 0.7 ), vec3( 0.75, 0.85, 1.0 ), fract( r * 37.0 ) ) * smoothstep( 0.2, 0.0, sdist ) * ( 0.4 + bright * bright * 3.0 ) * tw * uStars * horizonFade;
    }
    vec3 mwN = normalize( vec3( 0.42, 0.35, 0.84 ) );
    float mw = exp( - pow( dot( d, mwN ), 2.0 ) * 22.0 );
    float mwc = texture2D( tClouds, d.xz * 1.4 + d.y * 0.7 ).r;
    col += vec3( 0.32, 0.36, 0.55 ) * mw * smoothstep( 0.3, 0.8, mwc ) * 0.22 * uStars * horizonFade;
  }

  // Moon: soft disc with darker maria and a halo.
  if ( uMoon > 0.001 ) {
    float md = dot( d, uMoonDir );
    float disc = smoothstep( 0.99935, 0.99952, md );
    vec3 mt = cross( uMoonDir, vec3( 0.0, 1.0, 0.0 ) );
    vec2 mp = vec2( dot( d, normalize( mt ) ), d.y - uMoonDir.y );
    float maria = texture2D( tNoise, mp * 9.0 + 0.3 ).r;
    col = mix( col, vec3( 1.0, 0.97, 0.9 ) * ( 2.6 - maria * 1.4 ), disc * uMoon );
    float mg = max( md, 0.0 );
    col += vec3( 0.45, 0.55, 0.85 ) * ( pow( mg, 900.0 ) * 0.7 + pow( mg, 40.0 ) * 0.07 ) * uMoon;
  }

  // Sun disc.
  float disc = smoothstep( 0.99962, 0.99978, sd );
  col += uSunColor * disc * mix( 30.0, 4.0, uEnvPass ) * uSunDisc;

  // Clouds on a curved layer: thin near the horizon, lit warm toward the sun.
  if ( h > 0.0 ) {
    vec2 cuv = d.xz / ( h + 0.1 ) * 0.2;
    vec2 wind = vec2( uTime * 0.0032, uTime * 0.0011 );
    float c1 = texture2D( tClouds, cuv + wind ).r;
    float c2 = texture2D( tClouds, cuv * 2.6 - wind * 1.6 + 0.31 ).r;
    float c = c1 * 0.68 + c2 * 0.32;
    float cov = smoothstep( uCloudCover, uCloudCover + 0.22, c ) * smoothstep( 0.0, 0.14, h );
    float thick = smoothstep( uCloudCover + 0.05, uCloudCover + 0.45, c );
    vec3 cc = mix( uCloudLit, uCloudShade, thick * 0.75 );
    cc += uHalo * ( pow( s, 5.0 ) * 1.1 + pow( s, 40.0 ) * 1.4 ) * ( 1.0 - thick * 0.7 ) * uSunDisc;
    col = mix( col, cc, cov * 0.9 );
  }

  // Below the horizon: the main view keeps the haze (it meets the fogged sea);
  // the environment map gets an earthy ground bounce instead.
  col = mix( col, mix( uHorizon, uBounce, uEnvPass ), smoothstep( 0.0, -0.12, h ) );

  gl_FragColor = vec4( col, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  // Meet the fogged sea exactly: three mixes fog after tone mapping, so do the same
  // in a band above the horizon (a little weaker toward the sun, which glows through).
  #ifdef USE_FOG
    float skyFog = ( 1.0 - smoothstep( 0.0, 0.13, h ) ) * ( 1.0 - 0.55 * pow( s, 6.0 ) * uSunDisc );
    gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, skyFog );
  #endif
  #include <dithering_fragment>
}
`

export class Sky {
  readonly mesh: THREE.Mesh
  readonly material: THREE.ShaderMaterial
  readonly uniforms = {
    uZenith: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uHalo: { value: new THREE.Color() },
    uBounce: { value: new THREE.Color() },
    uSunColor: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
    uCloudLit: { value: new THREE.Color() },
    uCloudShade: { value: new THREE.Color() },
    uSunDisc: { value: 1 },
    uMoon: { value: 0 },
    uStars: { value: 0 },
    uCloudCover: { value: 0.5 },
    uTime: { value: 0 },
    uEnvPass: { value: 0 },
    tClouds: { value: null as THREE.Texture | null },
    tNoise: { value: null as THREE.Texture | null },
    // Filled in by three from scene.fog (the material has fog: true).
    fogColor: { value: new THREE.Color() },
    fogNear: { value: 1 },
    fogFar: { value: 1000 },
    fogDensity: { value: 0 },
  }
  private geometry: THREE.SphereGeometry
  private envScene = new THREE.Scene()
  private envMesh: THREE.Mesh
  private pmrem: THREE.PMREMGenerator
  private envTarget: THREE.WebGLRenderTarget | null = null

  constructor(textures: TextureLib, private renderer: THREE.WebGLRenderer) {
    this.uniforms.tClouds.value = textures.get('clouds')
    this.uniforms.tNoise.value = textures.get('noise')
    this.geometry = new THREE.SphereGeometry(1, 48, 24)
    this.material = new THREE.ShaderMaterial({
      name: 'starfall.sky',
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: true,
      dithering: true,
    })
    this.mesh = new THREE.Mesh(this.geometry, this.material)
    this.mesh.name = 'sky'
    this.mesh.frustumCulled = false
    // Last among the opaques (they sort by renderOrder first); transparents still draw after it.
    this.mesh.renderOrder = 1000
    this.mesh.matrixAutoUpdate = false
    this.envMesh = new THREE.Mesh(this.geometry, this.material)
    this.envMesh.frustumCulled = false
    this.envScene.add(this.envMesh)
    this.pmrem = new THREE.PMREMGenerator(renderer)
  }

  apply(a: Atmosphere): void {
    const u = this.uniforms
    u.uZenith.value.copy(a.zenith)
    u.uHorizon.value.copy(a.horizon)
    u.uHalo.value.copy(a.halo)
    u.uBounce.value.copy(a.bounce)
    u.uSunColor.value.copy(a.sunColor)
    u.uSunDir.value.copy(a.sunDir)
    u.uMoonDir.value.copy(a.moonDir)
    u.uCloudLit.value.copy(a.cloudLit)
    u.uCloudShade.value.copy(a.cloudShade)
    u.uSunDisc.value = a.sunDisc
    u.uMoon.value = a.moon
    u.uStars.value = a.stars
    u.uCloudCover.value = a.cloudCover
  }

  /** Re-renders the environment map from the current sky; returns the new texture. */
  renderEnvironment(): THREE.Texture {
    this.uniforms.uEnvPass.value = 1
    const target = this.pmrem.fromScene(this.envScene, 0, 0.1, 10, { size: 128 })
    this.uniforms.uEnvPass.value = 0
    this.envTarget?.dispose()
    this.envTarget = target
    return target.texture
  }

  dispose(): void {
    this.envTarget?.dispose()
    this.pmrem.dispose()
    this.geometry.dispose()
    this.material.dispose()
  }
}
