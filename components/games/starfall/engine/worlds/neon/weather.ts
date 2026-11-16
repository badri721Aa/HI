/**
 * The air of the Neon Metropolis. Each effect is one draw call animated entirely in its vertex
 * shader (nothing is updated per frame but a clock and the camera position):
 *
 *   rain      thin streaks falling in a box that follows the camera
 *   steam     soft puffs rising from vents; a timed jet only shows the puffs it blew while open
 *   traffic   sky-car light trails gliding along far-off lanes
 *   smog      the glowing murk drifting over the streets
 */
import * as THREE from 'three'
import type { Ctx } from '../../types'
import { seeded } from '../geo'
import { HAZE_COLOR, type TimeUniform } from './materials'

/** What every effect hands back: the object to add to the scene and how to free it. */
export interface Effect {
  object: THREE.Object3D
  dispose(): void
}

/** `count` quads sharing one geometry: `aCorner` is each vertex's place on its quad (x: -1 / 1, y: 0 / 1). */
function quads(count: number): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry()
  const corner = new Float32Array(count * 8)
  const index = new Uint16Array(count * 6)
  for (let i = 0; i < count; i++) {
    corner.set([-1, 0, 1, 0, 1, 1, -1, 1], i * 8)
    index.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6)
  }
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 12), 3))
  geo.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2))
  geo.setIndex(new THREE.BufferAttribute(index, 1))
  return geo
}

/** A per-quad attribute: `fill(i)` gives quad i's values, repeated on its four vertices. */
function perQuad(geo: THREE.BufferGeometry, name: string, size: number, count: number, fill: (i: number) => readonly number[]): void {
  const data = new Float32Array(count * 4 * size)
  for (let i = 0; i < count; i++) {
    const v = fill(i)
    for (let k = 0; k < 4; k++) data.set(v, (i * 4 + k) * size)
  }
  geo.setAttribute(name, new THREE.BufferAttribute(data, size))
}

function mesh(name: string, geo: THREE.BufferGeometry, mat: THREE.ShaderMaterial, renderOrder: number): Effect {
  const object = new THREE.Mesh(geo, mat)
  object.name = name
  object.frustumCulled = false
  object.renderOrder = renderOrder
  return {
    object,
    dispose() {
      geo.dispose()
      mat.dispose()
    },
  }
}

/* ── rain ────────────────────────────────────────────────── */

const RAIN_VS = /* glsl */ `
uniform float uTime;
uniform vec3 uCenter;
attribute vec3 aSeed;
attribute vec2 aCorner;
varying float vA;
varying float vX;
void main() {
  // Each streak falls, leaning with the wind, inside a box that follows the camera.
  vec3 box = vec3(34.0, 20.0, 34.0);
  float speed = 15.0 + aSeed.x * 7.0;
  vec3 p = aSeed * box;
  p.y -= uTime * speed;
  p.x += uTime * 1.4;
  p = mod(p - uCenter + box * 0.5, box) + uCenter - box * 0.5;
  vec3 fall = normalize(vec3(1.4, -speed, 0.0));
  vec3 toCam = cameraPosition - p;
  float dist = length(toCam);
  vec3 side = cross(fall, toCam);
  side /= max(length(side), 1e-4);
  p += fall * (-(0.5 + aSeed.z * 0.5) * aCorner.y) + side * (aCorner.x * 0.015);
  vX = aCorner.x;
  vA = (0.35 + 0.65 * aSeed.y) * (1.0 - smoothstep(11.0, 17.0, dist)) * smoothstep(0.6, 2.5, dist);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`

const RAIN_FS = /* glsl */ `
varying float vA;
varying float vX;
void main() {
  float a = vA * (1.0 - abs(vX));
  gl_FragColor = vec4(vec3(0.5, 0.58, 0.85) * a * 0.85, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

/** Light rain around the camera: `count` streaks. Set `center.value` to the camera position each frame. */
export function buildRain(count: number, uTime: TimeUniform): Effect & { center: THREE.Vector3 } {
  const rnd = seeded(91)
  const geo = quads(count)
  perQuad(geo, 'aSeed', 3, count, () => [rnd(), rnd(), rnd()])
  const center = new THREE.Vector3()
  const mat = new THREE.ShaderMaterial({
    name: 'starfall.neon.rain',
    vertexShader: RAIN_VS,
    fragmentShader: RAIN_FS,
    uniforms: { uTime, uCenter: { value: center } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  })
  return { ...mesh('neon-rain', geo, mat, 6), center }
}

/* ── steam ───────────────────────────────────────────────── */

/** A timed jet's rhythm: open for `open` seconds of every `period`, first at `offset` seconds. */
export interface Beat {
  period: number
  offset: number
  open: number
}

/** A vent: where the steam leaves it, how the plume grows, and (for a timed jet) its beat. */
export interface Vent {
  x: number
  y: number
  z: number
  /** Height the puffs reach (m) and their radius at the top. */
  rise: number
  spread: number
  /** Seconds a puff lives. */
  life: number
  /** Omitted: always on. */
  beat?: Beat
}

/** Seconds since a timed jet last opened at game time `t` (it is open while this is below `beat.open`). The steam shader applies the same rule to each puff's moment of birth. */
export function jetPhase(beat: Beat, t: number): number {
  const u = (t - beat.offset) / beat.period
  return (u - Math.floor(u)) * beat.period
}

const STEAM_VS = /* glsl */ `
uniform float uTime;
attribute vec2 aCorner;
attribute vec3 aVent;
attribute vec4 aPlume;
attribute vec3 aBeat;
attribute vec2 aSeed;
varying vec2 vQ;
varying float vA;
void main() {
  float life = max(aPlume.z, 0.1);
  float age = fract(uTime / life + aSeed.x);
  // A timed jet: only puffs blown while it was open exist.
  float born = uTime - age * life;
  float period = max(aBeat.x, 0.1);
  float beat = fract((born - aBeat.y) / period) * period;
  float open = aBeat.x > 0.0 ? 1.0 - smoothstep(aBeat.z - 0.25, aBeat.z, beat) : 1.0;
  float ang = aSeed.y * 6.2832;
  vec3 p = aVent + vec3(cos(ang), 0.0, sin(ang)) * (aPlume.y * 0.6 * age * age);
  p.y += aPlume.x * age * (1.4 - 0.4 * age);
  // The wind leans the plume as it climbs.
  p.x += aPlume.x * 0.12 * age * age;
  float size = mix(0.25, 1.0, sqrt(age)) * aPlume.y;
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vQ = vec2(aCorner.x, aCorner.y * 2.0 - 1.0);
  p += (right * vQ.x + up * vQ.y) * size;
  vA = smoothstep(0.0, 0.12, age) * (1.0 - age) * (1.0 - age) * open * aPlume.w;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`

const STEAM_FS = /* glsl */ `
uniform vec3 uColor;
varying vec2 vQ;
varying float vA;
void main() {
  float d = min(length(vQ), 1.0);
  float a = (1.0 - d * d) * (1.0 - d * d) * vA;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

/** Steam plumes: `puffs` soft billboards per vent. */
export function buildSteam(vents: readonly Vent[], puffs: number, uTime: TimeUniform): Effect {
  const rnd = seeded(57)
  const count = vents.length * puffs
  const geo = quads(count)
  const of = (i: number) => vents[Math.floor(i / puffs)]
  perQuad(geo, 'aVent', 3, count, i => [of(i).x, of(i).y, of(i).z])
  perQuad(geo, 'aPlume', 4, count, i => [of(i).rise, of(i).spread, of(i).life, of(i).beat ? 0.5 : 0.3])
  perQuad(geo, 'aBeat', 3, count, i => {
    const b = of(i).beat
    return b ? [b.period, b.offset, b.open] : [0, 0, 0]
  })
  perQuad(geo, 'aSeed', 2, count, i => [((i % puffs) + rnd() * 0.6) / puffs, rnd()])
  const mat = new THREE.ShaderMaterial({
    name: 'starfall.neon.steam',
    vertexShader: STEAM_VS,
    fragmentShader: STEAM_FS,
    uniforms: { uTime, uColor: { value: new THREE.Color('#8f86b8') } },
    transparent: true,
    depthWrite: false,
  })
  return mesh('neon-steam', geo, mat, 4)
}

/* ── traffic ─────────────────────────────────────────────── */

/** A straight lane of sky-cars from `a` to `b` (world space). */
export interface Lane {
  a: THREE.Vector3
  b: THREE.Vector3
  cars: number
  /** Seconds to fly the lane. */
  time: number
  color: THREE.ColorRepresentation
}

const TRAFFIC_VS = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
uniform float uTime;
attribute vec2 aCorner;
attribute vec3 aFrom;
attribute vec3 aTo;
attribute vec3 aCar;
attribute vec3 aTint;
varying vec2 vQ;
varying vec3 vTint;
varying float vA;
void main() {
  float u = fract(uTime / max(aCar.x, 1.0) + aCar.y);
  vec3 lane = aTo - aFrom;
  vec3 dir = lane / max(length(lane), 1e-3);
  vec3 head = aFrom + lane * u;
  vec3 side = cross(dir, cameraPosition - head);
  side /= max(length(side), 1e-4);
  vec3 p = head - dir * (aCorner.y * aCar.z) + side * (aCorner.x * 0.8);
  vQ = aCorner;
  vTint = aTint;
  vA = smoothstep(0.0, 0.06, u) * (1.0 - smoothstep(0.94, 1.0, u));
  vec4 mvPosition = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`

const TRAFFIC_FS = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
varying vec2 vQ;
varying vec3 vTint;
varying float vA;
void main() {
  float tail = (1.0 - vQ.y) * (1.0 - vQ.y);
  float across = 1.0 - abs(vQ.x);
  // A white-hot head, then the trail in the car's colour.
  vec3 col = (vTint * tail + vec3(1.0) * smoothstep(0.9, 1.0, 1.0 - vQ.y)) * across * vA * 3.0;
  #ifdef USE_FOG
    col *= 1.0 - 0.85 * smoothstep(fogNear, fogFar, vFogDepth);
  #endif
  gl_FragColor = vec4(min(col, vec3(4.0)), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

/** Light trails of sky-cars flying the lanes. */
export function buildTraffic(lanes: readonly Lane[], uTime: TimeUniform): Effect {
  const rnd = seeded(23)
  const cars: Array<{ lane: Lane; phase: number; length: number; tint: THREE.Color }> = []
  for (const lane of lanes) {
    const tint = new THREE.Color(lane.color)
    for (let k = 0; k < lane.cars; k++) cars.push({ lane, phase: (k + rnd() * 0.7) / lane.cars, length: 14 + rnd() * 12, tint })
  }
  const count = cars.length
  const geo = quads(count)
  perQuad(geo, 'aFrom', 3, count, i => cars[i].lane.a.toArray())
  perQuad(geo, 'aTo', 3, count, i => cars[i].lane.b.toArray())
  perQuad(geo, 'aCar', 3, count, i => [cars[i].lane.time, cars[i].phase, cars[i].length])
  perQuad(geo, 'aTint', 3, count, i => cars[i].tint.toArray())
  const mat = new THREE.ShaderMaterial({
    name: 'starfall.neon.traffic',
    vertexShader: TRAFFIC_VS,
    fragmentShader: TRAFFIC_FS,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 } }]),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: true,
  })
  mat.uniforms.uTime = uTime
  return mesh('neon-traffic', geo, mat, 3)
}

/* ── smog ────────────────────────────────────────────────── */

const SMOG_VS = /* glsl */ `
varying vec2 vP;
void main() {
  vP = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

const SMOG_FS = /* glsl */ `
uniform float uTime;
uniform float uRadius;
uniform vec3 uColor;
uniform sampler2D tNoise;
varying vec2 vP;
void main() {
  float n = texture2D(tNoise, vP * 0.0031 + vec2(uTime * 0.003, 0.0)).r * 0.6 + texture2D(tNoise, vP * 0.0093 - vec2(0.0, uTime * 0.005)).r * 0.4;
  float edge = 1.0 - smoothstep(0.55, 1.0, length(vP) / uRadius);
  gl_FragColor = vec4(uColor * (0.55 + 0.9 * n), (0.5 + 0.45 * n) * edge);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

/** A sheet of slowly drifting haze at height `y`, `radius` metres wide, lit from below by the streets. */
export function buildSmog(ctx: Ctx, x: number, y: number, z: number, radius: number, uTime: TimeUniform): Effect {
  const geo = new THREE.PlaneGeometry(radius * 2, radius * 2)
  const mat = new THREE.ShaderMaterial({
    name: 'starfall.neon.smog',
    vertexShader: SMOG_VS,
    fragmentShader: SMOG_FS,
    uniforms: { uTime, uRadius: { value: radius }, uColor: { value: new THREE.Color(HAZE_COLOR) }, tNoise: { value: ctx.textures.get('noise') } },
    transparent: true,
    depthWrite: false,
  })
  const fx = mesh('neon-smog', geo, mat, 1)
  fx.object.rotation.x = -Math.PI / 2
  fx.object.position.set(x, y, z)
  return fx
}
