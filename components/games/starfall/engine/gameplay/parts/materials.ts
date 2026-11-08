/**
 * Custom materials for collectibles: self-lit faceted gems and the
 * navigation light pillars that rise from uncollected star shards.
 */
import * as THREE from 'three'

const gemVertex = /* glsl */ `
uniform float uTime;
uniform float uSpin;
uniform float uBob;
uniform vec3 uColor;
varying vec3 vN;
varying vec3 vW;
varying vec3 vCol;
varying float vR;
#include <fog_pars_vertex>
void main() {
  vec3 pos = position;
  vR = length(position);
  vec3 nrm = normal;
  #ifdef USE_INSTANCING
    mat4 m = modelMatrix * instanceMatrix;
    vec3 ip = instanceMatrix[3].xyz;
    float ph = fract(sin(dot(ip.xz, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831;
  #else
    mat4 m = modelMatrix;
    float ph = 0.0;
  #endif
  float a = uTime * uSpin + ph;
  float c = cos(a);
  float s = sin(a);
  pos.xz = vec2(c * pos.x + s * pos.z, -s * pos.x + c * pos.z);
  nrm.xz = vec2(c * nrm.x + s * nrm.z, -s * nrm.x + c * nrm.z);
  pos.y += sin(uTime * 2.1 + ph) * uBob;
  vec4 wp = m * vec4(pos, 1.0);
  vW = wp.xyz;
  vN = mat3(m) * nrm;
  #ifdef USE_INSTANCING_COLOR
    vCol = instanceColor;
  #else
    vCol = uColor;
  #endif
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`

const gemFragment = /* glsl */ `
uniform vec3 uSunDir;
uniform float uCore;
uniform float uCoreRadius;
uniform float uRim;
varying vec3 vN;
varying vec3 vW;
varying vec3 vCol;
varying float vR;
#include <fog_pars_fragment>
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  vec3 L = normalize(uSunDir);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fres = pow(1.0 - ndv, 2.5);
  float diff = max(dot(N, L), 0.0);
  float spec = pow(max(dot(N, normalize(L + V)), 0.0), 48.0);
  // A warm-white core glows from the centre of the gem; the facets carry the tint.
  float core = 1.0 - smoothstep(0.0, uCoreRadius, vR);
  core *= core * (0.55 + 0.45 * ndv);
  vec3 white = vec3(1.0, 0.93, 0.8);
  vec3 tint = vCol;
  vec3 col = tint * (0.32 + 0.38 * diff + 0.3 * ndv)
           + white * core * uCore
           + tint * fres * uRim
           + white * spec * 1.6;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`

export interface GemOptions {
  /** Spin speed in rad/s applied in the shader (0 = static / CPU driven). */
  spin?: number
  /** Bob amplitude in metres applied in the shader. */
  bob?: number
  /** Brightness of the inner core (≈ 0.6–1.6). */
  core?: number
  /** Local radius (m) at which the core glow has faded out. */
  coreRadius?: number
  rim?: number
  color?: THREE.ColorRepresentation
  side?: THREE.Side
}

/**
 * Self-lit crystal shading; per-instance tint via InstancedMesh.setColorAt.
 * `time` is a shared uniform object and `sunDir` is referenced live (not copied),
 * so every gem follows the clock and the time of day for free.
 */
export function gemMaterial(time: THREE.IUniform<number>, sunDir: THREE.Vector3, o: GemOptions = {}): THREE.ShaderMaterial {
  const m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uSpin: { value: o.spin ?? 0 },
        uBob: { value: o.bob ?? 0 },
        uCore: { value: o.core ?? 1 },
        uCoreRadius: { value: o.coreRadius ?? 0.3 },
        uRim: { value: o.rim ?? 1.3 },
        uColor: { value: new THREE.Color(o.color ?? 0xffffff) },
      },
    ]),
    vertexShader: gemVertex,
    fragmentShader: gemFragment,
    fog: true,
    side: o.side ?? THREE.FrontSide,
  })
  // UniformsUtils.merge clones values — attach the shared ones afterwards.
  m.uniforms.uTime = time
  m.uniforms.uSunDir = { value: sunDir }
  return m
}

const pillarVertex = /* glsl */ `
uniform float uWidenPerMetre;
varying float vH;
varying float vEdge;
varying float vFade;
varying vec3 vCol;
#include <fog_pars_vertex>
void main() {
  vec3 base = instanceMatrix[3].xyz;
  float r = length(instanceMatrix[0].xyz);
  float h = length(instanceMatrix[1].xyz);
  vec2 toCam = cameraPosition.xz - base.xz;
  float dist = length(toCam);
  // Keep a readable on-screen width far away.
  float radius = max(r, dist * uWidenPerMetre);
  vec3 p = base + vec3(position.x * radius, position.y * h, position.z * radius);
  vEdge = abs(dot(normal.xz, toCam / max(dist, 1e-3)));
  vH = position.y;
  // Faint up close (never in the way), stronger far off where it's needed for navigation.
  vFade = smoothstep(5.0, 18.0, dist) * (0.7 + 0.8 * smoothstep(30.0, 160.0, dist)) * step(1e-4, r);
  #ifdef USE_INSTANCING_COLOR
    vCol = instanceColor;
  #else
    vCol = vec3(1.0);
  #endif
  vec4 mvPosition = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`

const pillarFragment = /* glsl */ `
uniform float uTime;
uniform float uIntensity;
varying float vH;
varying float vEdge;
varying float vFade;
varying vec3 vCol;
#include <fog_pars_fragment>
void main() {
  float h = vH;
  float a = pow(vEdge, 3.0) * pow(1.0 - h, 2.4) * smoothstep(0.0, 0.03, h);
  a *= 0.78 + 0.22 * sin(h * 70.0 - uTime * 2.2);
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
    #else
      float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
    #endif
    // Beacons of light should survive the haze better than solid geometry.
    a *= 1.0 - 0.65 * fogFactor;
  #endif
  gl_FragColor = vec4(vCol * a * uIntensity * vFade, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

/** Additive vertical light shaft; instance scale x = radius, y = height; colour via setColorAt. */
export function pillarMaterial(time: THREE.IUniform<number>): THREE.ShaderMaterial {
  const m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uIntensity: { value: 0.2 }, uWidenPerMetre: { value: 0.0032 } }]),
    vertexShader: pillarVertex,
    fragmentShader: pillarFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: true,
  })
  m.uniforms.uTime = time
  return m
}
