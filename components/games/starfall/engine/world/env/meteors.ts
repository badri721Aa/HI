/**
 * Shooting stars: the island's signature. Every so often a thin streak crosses the night sky —
 * usually somewhere the player is looking — and fades out within a second. Now and then a longer,
 * golden one falls, like the star shards once did.
 *
 * A pool of four instanced ribbons at infinity (one draw call). Each streak is a great-circle arc
 * evaluated in the vertex shader from its launch time, so the CPU only writes a slot when a streak
 * launches. They dim with the stars, behind clouds and toward the horizon, and are never bright or
 * wide enough to read as a flash.
 */
import * as THREE from 'three'
import { SKY_CLIP_GLSL, SKY_CLOUDS_GLSL, sharedUniforms, skyDir, type SkyShared } from './skyShared'

const POOL = 4
/** Seconds between streaks under a full night sky (they come less often while few stars are out). */
const GAP: [number, number] = [10, 25]
/** One launch in this many is a long golden starfall. */
const STARFALL_ODDS = 7

const VERT = /* glsl */ `
uniform float uTime;
uniform float uStars;
uniform float uCloudCover;
uniform vec3 uView;
uniform sampler2D tClouds;
attribute vec4 iStart;    // direction it appears at, launch time
attribute vec4 iTangent;  // unit direction of travel (perpendicular to the start), duration
attribute vec4 iShape;    // arc travelled, tail length (radians), brightness, half width (px)
attribute vec3 iTint;
varying vec2 vUv;
varying vec3 vColor;
${SKY_CLOUDS_GLSL}
${SKY_CLIP_GLSL}

vec3 arcDir( float angle ) {
  return iStart.xyz * cos( angle ) + iTangent.xyz * sin( angle );
}

void main() {
  float u = ( uTime - iStart.w ) / max( iTangent.w, 0.05 );
  if ( u <= 0.0 || u >= 1.0 || uStars < 0.05 ) {
    gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 );
    return;
  }
  // position.x runs from just ahead of the head (< 0) to the end of the tail (1).
  float angle = u * iShape.x - position.x * iShape.y * smoothstep( 0.0, 0.3, u );
  vec3 d = arcDir( angle );
  vec4 p = skyClip( d );
  vec4 q = skyClip( arcDir( angle + 0.02 ) );
  // The ribbon's width is set in pixels, across its direction of travel on screen.
  vec2 travel = ( q.xy / max( q.w, 1e-3 ) - p.xy / max( p.w, 1e-3 ) ) / uView.xy;
  float len = length( travel );
  vec2 t = len > 1e-4 ? travel / len : vec2( 1.0, 0.0 );
  float width = iShape.w * uView.z * ( 1.0 - 0.75 * max( position.x, 0.0 ) );
  p.xy += vec2( - t.y, t.x ) * position.y * width * uView.xy * p.w;
  gl_Position = p;

  float life = smoothstep( 0.0, 0.12, u ) * ( 1.0 - smoothstep( 0.5, 1.0, u ) );
  float sky = smoothstep( 0.02, 0.2, d.y ) * ( 1.0 - 0.94 * skyClouds( tClouds, d, uCloudCover, uTime ).x );
  vColor = iTint * ( iShape.z * life * sky * clamp( uStars * 1.4, 0.0, 1.0 ) );
  vUv = position.xy;
}
`

const FRAG = /* glsl */ `
varying vec2 vUv;
varying vec3 vColor;

void main() {
  float along = vUv.x;
  float across = vUv.y * vUv.y;
  // A rounded head, a tail that thins and fades, soft edges.
  float body = along < 0.0 ? smoothstep( -0.06, 0.0, along ) : ( 1.0 - along ) * ( 1.0 - along );
  float light = body * exp( - across * 5.0 ) * ( 1.0 - across );
  light *= 1.0 + 1.5 * exp( - max( along, 0.0 ) * 30.0 );
  vec3 cool = mix( vec3( 1.0 ), vec3( 0.62, 0.8, 1.0 ), clamp( along, 0.0, 1.0 ) );
  gl_FragColor = vec4( vColor * cool * light, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

const _forward = new THREE.Vector3()
const _start = new THREE.Vector3()
const _east = new THREE.Vector3()
const _up = new THREE.Vector3()

function rand(lo: number, hi: number): number {
  return lo + Math.random() * (hi - lo)
}

export class ShootingStars {
  readonly mesh: THREE.Mesh
  private geometry: THREE.InstancedBufferGeometry
  private material: THREE.ShaderMaterial
  private start: THREE.InstancedBufferAttribute
  private tangent: THREE.InstancedBufferAttribute
  private shape: THREE.InstancedBufferAttribute
  private tint: THREE.InstancedBufferAttribute
  private next = 0
  /** Seconds (at full night) until the next launch. */
  private timer = 5

  constructor(shared: SkyShared) {
    const geo = new THREE.InstancedBufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.06, -1, 0, 1, -1, 0, 1, 1, 0, -0.06, 1, 0], 3))
    geo.setIndex([0, 1, 2, 0, 2, 3])
    // Launch times far in the past: every slot starts out finished (drawn off screen).
    const start = new Float32Array(POOL * 4)
    const tangent = new Float32Array(POOL * 4)
    for (let i = 0; i < POOL; i++) {
      start[i * 4 + 3] = -1e4
      tangent[i * 4 + 3] = 1
    }
    this.start = new THREE.InstancedBufferAttribute(start, 4)
    this.tangent = new THREE.InstancedBufferAttribute(tangent, 4)
    this.shape = new THREE.InstancedBufferAttribute(new Float32Array(POOL * 4), 4)
    this.tint = new THREE.InstancedBufferAttribute(new Float32Array(POOL * 3), 3)
    geo.setAttribute('iStart', this.start)
    geo.setAttribute('iTangent', this.tangent)
    geo.setAttribute('iShape', this.shape)
    geo.setAttribute('iTint', this.tint)
    geo.instanceCount = POOL
    this.geometry = geo
    this.material = new THREE.ShaderMaterial({
      name: 'starfall.meteors',
      uniforms: { ...sharedUniforms(shared) },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    // Always in the scene (idle slots sit off screen), so its shader is compiled with the rest at load.
    this.mesh = new THREE.Mesh(geo, this.material)
    this.mesh.name = 'shooting-stars'
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = -99
    this.mesh.matrixAutoUpdate = false
  }

  /** `time` is the sky's shader clock; `stars` how far the stars are out (0..1). */
  update(dt: number, time: number, camera: THREE.Camera, stars: number): void {
    if (stars < 0.1) return
    this.timer -= dt * Math.min(1, Math.max(0.3, stars))
    if (this.timer > 0) return
    this.launch(time, camera)
    // Now and then a second one follows close behind.
    this.timer = Math.random() < 0.15 ? rand(0.5, 1.6) : rand(GAP[0], GAP[1])
  }

  dispose(): void {
    this.mesh.removeFromParent()
    this.geometry.dispose()
    this.material.dispose()
  }

  private launch(time: number, camera: THREE.Camera): void {
    // Mostly in the part of the sky the player is facing, so they get seen; the rest anywhere.
    camera.getWorldDirection(_forward)
    const facing = (Math.atan2(_forward.x, -_forward.z) * 180) / Math.PI
    const bearing = Math.random() < 0.7 ? facing + rand(-48, 48) : rand(0, 360)
    skyDir(bearing, rand(16, 58), _start)
    // Travel falls across the sky: sideways either way, 20°–70° below level.
    _east.set(-_start.z, 0, _start.x).normalize()
    _up.crossVectors(_east, _start)
    const fall = rand(0.35, 1.25)
    const side = Math.random() < 0.5 ? -1 : 1
    _east.multiplyScalar(side * Math.cos(fall)).addScaledVector(_up, -Math.sin(fall))

    const starfall = Math.random() * STARFALL_ODDS < 1
    let arc = starfall ? rand(0.42, 0.6) : rand(0.16, 0.36)
    // Keep the whole path above the haze: shorten one that would dive into the horizon.
    for (let i = 0; i < 4 && _start.y * Math.cos(arc) + _east.y * Math.sin(arc) < 0.1; i++) arc *= 0.7

    const i = this.next
    this.next = (i + 1) % POOL
    this.start.setXYZW(i, _start.x, _start.y, _start.z, time)
    this.tangent.setXYZW(i, _east.x, _east.y, _east.z, starfall ? rand(1.3, 1.8) : rand(0.5, 1))
    this.shape.setXYZW(i, arc, starfall ? 0.2 : rand(0.07, 0.13), starfall ? 1.15 : rand(0.6, 0.95), starfall ? 2.2 : rand(1.3, 1.8))
    if (starfall) this.tint.setXYZ(i, 1, 0.86, 0.6)
    else this.tint.setXYZ(i, 0.86, 0.93, 1)
    this.start.needsUpdate = this.tangent.needsUpdate = this.shape.needsUpdate = this.tint.needsUpdate = true
  }
}
