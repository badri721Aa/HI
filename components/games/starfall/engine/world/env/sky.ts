/**
 * The sky: a dome with the zenith/horizon gradient, sun disc + halo, drifting clouds lit by the
 * sun and moon, the moon itself, the Milky Way's glow and a faint aurora — plus the star field
 * (starfield.ts) and the shooting stars (meteors.ts) drawn over it.
 *
 * The dome sits at infinity (rotation-only view transform, z = w on the far plane), so it
 * follows any camera and costs one draw call. It is drawn after the other opaque geometry
 * with the depth test on, so early-z skips its fairly heavy shader wherever the island
 * already covers the screen (transparent water and effects still blend over it). The same
 * material renders the PMREM environment map (`uEnvPass` = 1 swaps the lower
 * hemisphere for a ground-bounce colour and tones down the disc).
 *
 * Cost: three draw calls in all (dome, stars, shooting stars) and no extra passes. On 'low' the
 * dome drops the Milky Way glow and the aurora (`SKY_DETAIL` 0) and the star field draws fewer stars.
 */
import * as THREE from 'three'
import type { QualityLevel } from '../../settings'
import type { TextureLib } from '../../textures'
import { AIR, AIR_GLSL } from './air'
import type { Atmosphere } from './atmosphere'
import { ShootingStars } from './meteors'
import { GALAXY_CORE, GALAXY_POLE, GALAXY_SIDE, GALAXY_SPAN, SKY_CLIP_GLSL, SKY_CLOUDS_GLSL, skyDir } from './skyShared'
import { StarField } from './starfield'

/** The moon's radius as the sine of its angle on the sky (a stylised 1.9°). */
const MOON_RADIUS = 0.034
/** The aurora hangs low over the eastern sea, clear of the moon and the Milky Way's core. */
const AURORA_BEARING = 84
/** Sunlight on the moon in its own frame (x, y across the disc, z toward the viewer): a waxing gibbous. */
const MOON_SUN = new THREE.Vector3(-0.42, -0.2, 0.88).normalize()

const glsl = (v: number) => v.toFixed(5)
const aurora = skyDir(AURORA_BEARING, 0)

const VERT = /* glsl */ `
varying vec3 vDir;
${SKY_CLIP_GLSL}
void main() {
  vDir = position;
  gl_Position = skyClip( position );
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
uniform vec3 uMoonRight;
uniform vec3 uMoonUp;
uniform vec3 uCloudLit;
uniform vec3 uCloudShade;
uniform vec3 uGalPole;
uniform vec3 uGalCore;
uniform vec3 uGalSide;
uniform float uSunDisc;
uniform float uMoon;
uniform float uStars;
uniform float uMilkyWay;
uniform float uAurora;
uniform float uCloudCover;
uniform float uTime;
uniform float uEnvPass;
uniform sampler2D tClouds;
uniform sampler2D tNoise;
uniform sampler2D tMilkyWay;
varying vec3 vDir;
#ifdef USE_FOG
  uniform vec3 fogColor;
#endif
${AIR_GLSL}

#include <common>
#include <dithering_pars_fragment>
${SKY_CLOUDS_GLSL}

void main() {
  vec3 d = normalize( vDir );
  float h = d.y;
  float hp = max( h, 0.0 );

  // Gradient: haze at the horizon, deepening overhead.
  vec3 col = mix( uHorizon, uZenith, sqrt( hp ) );

  float sd = dot( d, uSunDir );
  float s = max( sd, 0.0 );
  float band = exp( - hp * 5.0 );
  vec3 glow = uHalo * ( pow( s, 3.0 ) * 0.5 * band + pow( s, 18.0 ) * 0.4 + pow( s, 160.0 ) * 1.4 );
  col += glow * uSunDisc;
  // Opposite the sun the low sky picks up a faint pink "belt of Venus".
  col += uHalo * vec3( 0.55, 0.32, 0.45 ) * pow( max( - sd, 0.0 ), 2.0 ) * exp( - abs( h - 0.08 ) * 12.0 ) * 0.25 * uSunDisc;

  float md = dot( d, uMoonDir );
  float mg = max( md, 0.0 );

  #if SKY_DETAIL > 0
    // The faint lights only show in a properly dark sky: clear of the haze, the afterglow and the moon.
    float faint = uStars * uStars * smoothstep( 0.02, 0.3, h ) * ( 1.0 - 0.7 * uSunDisc * ( 0.5 + 0.5 * sd ) ) * ( 1.0 - 0.5 * uMoon * pow( mg, 8.0 ) );

    // The Milky Way's glow, from the baked band texture (longitude around the band, latitude across it).
    float gs = dot( d, uGalPole );
    if ( uMilkyWay * faint > 0.002 && abs( gs ) < ${glsl(GALAXY_SPAN)} ) {
      float gx = dot( d, uGalCore );
      float lon = atan( dot( d, uGalSide ), abs( gx ) < 1e-4 ? 1e-4 : gx );
      vec4 mw = texture2D( tMilkyWay, vec2( lon * 0.15915494 + 0.5, gs * ${glsl(0.5 / GALAXY_SPAN)} + 0.5 ) );
      col += mix( vec3( 0.5, 0.6, 0.92 ), vec3( 1.0, 0.84, 0.66 ), mw.g ) * ( mw.r * mw.r * 0.1 * uMilkyWay * faint );
    }

    // Aurora: a curtain with a crisp lower edge that fades upward, slowly drifting.
    float toward = dot( d.xz, vec2( ${glsl(aurora.x)}, ${glsl(aurora.z)} ) );
    if ( uAurora * faint > 0.002 && toward > 0.05 && h > 0.03 && h < 0.62 ) {
      float across = dot( d.xz, vec2( ${glsl(-aurora.z)}, ${glsl(aurora.x)} ) ) / toward;
      float edge = 0.09 + 0.2 * texture2D( tNoise, vec2( across * 0.21 + uTime * 0.0035, 0.37 ) ).r;
      float rays = texture2D( tNoise, vec2( across * 1.9 - uTime * 0.008, h * 0.35 + uTime * 0.002 ) ).r;
      float up = h - edge;
      float curtain = smoothstep( 0.0, 0.035, up ) * exp( - max( up, 0.0 ) * 6.5 ) * ( 1.0 - smoothstep( 0.35, 0.95, abs( across ) ) );
      vec3 ac = mix( vec3( 0.16, 0.95, 0.5 ), vec3( 0.42, 0.3, 0.9 ), smoothstep( 0.02, 0.3, up ) );
      col += ac * ( curtain * ( 0.3 + 0.7 * rays ) * 0.1 * uAurora * faint );
    }
  #endif

  // Moon: a shaded globe (soft terminator, limb darkening, dark seas, a little earthshine) in a halo.
  if ( uMoon > 0.001 ) {
    col += vec3( 0.45, 0.55, 0.85 ) * ( pow( mg, 700.0 ) * 0.5 + pow( mg, 60.0 ) * 0.09 + pow( mg, 8.0 ) * 0.03 ) * uMoon;
    vec2 mp = vec2( dot( d, uMoonRight ), dot( d, uMoonUp ) ) * ${glsl(1 / MOON_RADIUS)};
    float mr = dot( mp, mp );
    if ( md > 0.0 && mr < 1.0 ) {
      vec3 n = vec3( mp, sqrt( max( 1.0 - mr, 0.0 ) ) );
      float lit = smoothstep( -0.1, 0.35, dot( n, vec3( ${glsl(MOON_SUN.x)}, ${glsl(MOON_SUN.y)}, ${glsl(MOON_SUN.z)} ) ) );
      float seas = smoothstep( 0.42, 0.68, texture2D( tNoise, mp * 0.21 + 0.31 ).r );
      float craters = texture2D( tNoise, mp * 0.85 + 0.7 ).r;
      float albedo = mix( 1.0, 0.56, seas ) * ( 0.88 + 0.24 * craters );
      vec3 surface = vec3( 1.0, 0.97, 0.9 ) * ( albedo * ( 0.7 + 0.3 * n.z ) * ( 0.05 + 0.95 * lit ) * 1.3 );
      col = mix( col, surface, ( 1.0 - smoothstep( 0.9, 1.0, mr ) ) * uMoon );
    }
  }

  // Sun disc.
  float disc = smoothstep( 0.99962, 0.99978, sd );
  col += uSunColor * disc * mix( 18.0, 4.0, uEnvPass ) * uSunDisc;

  // Clouds: lit warm toward the sun, silver-edged around the moon.
  if ( h > 0.0 ) {
    vec2 cl = skyClouds( tClouds, d, uCloudCover, uTime );
    vec3 cc = mix( uCloudLit, uCloudShade, cl.y * 0.75 );
    cc += uHalo * ( pow( s, 5.0 ) * 1.1 + pow( s, 40.0 ) * 1.4 ) * ( 1.0 - cl.y * 0.7 ) * uSunDisc;
    cc += vec3( 0.42, 0.5, 0.78 ) * ( pow( mg, 10.0 ) * 0.1 + pow( mg, 90.0 ) * 0.45 ) * ( 1.0 - cl.y * 0.75 ) * uMoon;
    col = mix( col, cc, cl.x * 0.9 );
  }

  // Below the horizon: the main view keeps the haze (it meets the fogged sea);
  // the environment map gets an earthy ground bounce instead.
  col = mix( col, mix( uHorizon, uBounce, uEnvPass ), smoothstep( 0.0, -0.12, h ) );

  gl_FragColor = vec4( col, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  // Meet the fogged sea exactly: three mixes fog after tone mapping, so do the same in a band
  // above the horizon, with the same glow toward the sun and moon the haze has (env/air.ts).
  // The band is a little weaker toward the sun, which shines through.
  #ifdef USE_FOG
    float skyFog = ( 1.0 - smoothstep( 0.0, 0.13, h ) ) * ( 1.0 - 0.55 * pow( s, 6.0 ) * uSunDisc );
    gl_FragColor.rgb = mix( gl_FragColor.rgb, starfallAirColor( fogColor, d ), skyFog );
  #endif
  #include <dithering_fragment>
}
`

const _size = new THREE.Vector2()
const _up = new THREE.Vector3(0, 1, 0)

export class Sky {
  /** Dome, stars and shooting stars (this is what goes in the scene). */
  readonly group = new THREE.Group()
  readonly material: THREE.ShaderMaterial
  readonly uniforms = {
    uZenith: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uHalo: { value: new THREE.Color() },
    uBounce: { value: new THREE.Color() },
    uSunColor: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
    /** The moon's own frame across its disc (built on the CPU: no zero-length cross product on the GPU). */
    uMoonRight: { value: new THREE.Vector3(1, 0, 0) },
    uMoonUp: { value: new THREE.Vector3(0, 0, 1) },
    uCloudLit: { value: new THREE.Color() },
    uCloudShade: { value: new THREE.Color() },
    uGalPole: { value: GALAXY_POLE },
    uGalCore: { value: GALAXY_CORE },
    uGalSide: { value: GALAXY_SIDE },
    uSunDisc: { value: 1 },
    uMoon: { value: 0 },
    uStars: { value: 0 },
    uMilkyWay: { value: 0 },
    uAurora: { value: 0 },
    uCloudCover: { value: 0.5 },
    uTime: { value: 0 },
    uEnvPass: { value: 0 },
    uView: { value: new THREE.Vector3(0.002, 0.002, 1) },
    tClouds: { value: null as THREE.Texture | null },
    tNoise: { value: null as THREE.Texture | null },
    tMilkyWay: { value: null as THREE.Texture | null },
    // Filled in by three from scene.fog (the material has fog: true).
    fogColor: { value: new THREE.Color() },
    fogNear: { value: 1 },
    fogFar: { value: 1000 },
    fogDensity: { value: 0 },
    /** The haze's glow (shared with every fogged material, see env/air.ts). */
    starfallAir: { value: AIR },
  }
  private mesh: THREE.Mesh
  private geometry: THREE.SphereGeometry
  private stars: StarField
  private meteors: ShootingStars
  private envScene = new THREE.Scene()
  private envMesh: THREE.Mesh
  private pmrem: THREE.PMREMGenerator
  private envTarget: THREE.WebGLRenderTarget | null = null

  constructor(textures: TextureLib, private renderer: THREE.WebGLRenderer) {
    this.uniforms.tClouds.value = textures.get('clouds')
    this.uniforms.tNoise.value = textures.get('noise')
    this.stars = new StarField(this.uniforms)
    this.meteors = new ShootingStars(this.uniforms)
    this.uniforms.tMilkyWay.value = this.stars.milkyWay
    this.geometry = new THREE.SphereGeometry(1, 48, 24)
    this.material = new THREE.ShaderMaterial({
      name: 'starfall.sky',
      uniforms: this.uniforms,
      defines: { SKY_DETAIL: 1 },
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
    this.group.name = 'sky'
    this.group.add(this.mesh, this.stars.mesh, this.meteors.mesh)
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
    const right = u.uMoonRight.value.crossVectors(_up, a.moonDir)
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0)
    right.normalize()
    u.uMoonUp.value.crossVectors(a.moonDir, right)
    u.uCloudLit.value.copy(a.cloudLit)
    u.uCloudShade.value.copy(a.cloudShade)
    u.uSunDisc.value = a.sunDisc
    u.uMoon.value = a.moon
    u.uStars.value = a.stars
    u.uMilkyWay.value = a.milkyWay
    u.uAurora.value = a.aurora
    u.uCloudCover.value = a.cloudCover
  }

  /** Per frame: the shader clock, the pixel size stars are drawn at, and the shooting stars. */
  update(dt: number, time: number, camera: THREE.Camera): void {
    const u = this.uniforms
    u.uTime.value = time
    this.renderer.getDrawingBufferSize(_size)
    // Star sizes are in pixels of a ~760-line picture: they grow with sharper screens, never shrink.
    u.uView.value.set(2 / Math.max(1, _size.x), 2 / Math.max(1, _size.y), Math.min(3, Math.max(1, _size.y / 760)))
    this.meteors.update(dt, time, camera, u.uStars.value)
  }

  /** 'low' draws fewer stars and no Milky Way glow or aurora (the dome recompiles only when that changes). */
  setQuality(level: QualityLevel): void {
    this.stars.setQuality(level)
    const detail = level === 'low' ? 0 : 1
    if (this.material.defines.SKY_DETAIL !== detail) {
      this.material.defines.SKY_DETAIL = detail
      this.material.needsUpdate = true
    }
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
    this.stars.dispose()
    this.meteors.dispose()
    this.geometry.dispose()
    this.material.dispose()
  }
}
