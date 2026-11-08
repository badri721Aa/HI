/**
 * Shared GPU particle pool used by Particles (bursts, streaks) and Ambient (spray, mist).
 *
 * One instanced draw of camera-facing quads per pool. Motion is evaluated in the vertex
 * shader from the spawn state (position, velocity, gravity, exponential drag, spawn time),
 * so the CPU only writes newly spawned particles into preallocated typed arrays — a ring
 * buffer — and uploads the touched range once per frame.
 */
import * as THREE from 'three'

/** Fragment shapes (analytic sprites, no texture lookups except smoke noise). */
export const SHAPE = { glow: 0, ring: 1, star: 2, smoke: 3, heart: 4, drop: 5 } as const
/** Orientation: billboard, stretched along the screen-space velocity, or lying flat on the XZ plane. */
export const MODE = { billboard: 0, stretch: 1, flat: 2 } as const

/** Mutable spawn record — callers keep one and refill it to avoid allocations. */
export interface ParticleInit {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  /** Seconds. */
  life: number
  /** Radius (m) at birth / death; eased in between. */
  size0: number
  size1: number
  /** Vertical acceleration (m/s², negative falls). */
  gravity: number
  /** Exponential velocity damping (1/s). */
  drag: number
  /** Linear RGB (may exceed 1 for HDR glow). */
  r: number
  g: number
  b: number
  a: number
  rot: number
  spin: number
  shape: number
  mode: number
}

export function particleInit(): ParticleInit {
  return {
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 1, size0: 0.1, size1: 0.1, gravity: 0, drag: 0,
    r: 1, g: 1, b: 1, a: 1, rot: 0, spin: 0, shape: SHAPE.glow, mode: MODE.billboard,
  }
}

/** Distance-fog factor shared by every effects shader (expects `vFogDepth`). */
export const FOG_FACTOR_GLSL = /* glsl */ `
float fxFogFactor() {
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      return 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
    #else
      return smoothstep(fogNear, fogFar, vFogDepth);
    #endif
  #else
    return 0.0;
  #endif
}
`

/**
 * Keeps tiny sprites at least `minPx` pixels wide (scaling alpha down instead) so distant
 * sparks don't shimmer. Returns the alpha factor and updates `size` in place.
 */
export const MIN_PIXEL_GLSL = /* glsl */ `
float fxMinPixel(inout float size, float viewZ, float minPx) {
  float px = size * projectionMatrix[1][1] * 0.5 * uViewHeight / max(-viewZ, 0.05);
  if (px >= minPx) return 1.0;
  float k = px / minPx;
  size *= 1.0 / max(k, 1e-3);
  return k * k;
}
`

const VERT = /* glsl */ `
uniform float uTime;
uniform float uViewHeight;
attribute vec4 iPos;   // xyz, spawn time
attribute vec4 iVel;   // xyz, life
attribute vec4 iCol;   // rgb, alpha
attribute vec4 iSize;  // size0, size1, gravity, drag
attribute vec4 iMisc;  // rot, spin, shape, mode
varying vec2 vUv;
varying vec4 vColor;
varying float vShape;
varying float vSeed;
#include <fog_pars_vertex>
${MIN_PIXEL_GLSL}

void main() {
  float age = uTime - iPos.w;
  float life = iVel.w;
  if (age < 0.0 || age >= life) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  float t = age / life;
  float k = iSize.w;
  float travel = k > 1e-3 ? (1.0 - exp(-k * age)) / k : age;
  vec3 wp = iPos.xyz + iVel.xyz * travel;
  wp.y += 0.5 * iSize.z * age * age;

  float grow = 1.0 - (1.0 - t) * (1.0 - t);
  float size = mix(iSize.x, iSize.y, grow);
  float mode = iMisc.w;
  float shape = iMisc.z;

  vec4 mv = viewMatrix * vec4(wp, 1.0);
  float alpha = iCol.a * fxMinPixel(size, mv.z, 1.4);
  // Envelope: smoke fades in softly; everything fades out.
  alpha *= shape > 2.5 && shape < 3.5 ? smoothstep(0.0, 0.18, t) : 1.0;
  alpha *= pow(1.0 - t, 1.3);

  float ang = iMisc.x + iMisc.y * age;
  float c = cos(ang);
  float s = sin(ang);
  vec2 q = vec2(c * position.x - s * position.y, s * position.x + c * position.y);

  if (mode > 1.5) {
    wp.xz += q * size;
    mv = viewMatrix * vec4(wp, 1.0);
  } else if (mode > 0.5) {
    vec3 v = iVel.xyz * exp(-k * age) + vec3(0.0, iSize.z * age, 0.0);
    vec2 sv = (viewMatrix * vec4(v, 0.0)).xy;
    float sl = length(sv);
    vec2 ax = sl > 1e-4 ? sv / sl : vec2(0.0, 1.0);
    vec2 px = vec2(-ax.y, ax.x);
    mv.xy += px * position.x * size + ax * position.y * (size + sl * 0.045);
  } else {
    mv.xy += q * size;
  }

  vUv = position.xy;
  vColor = vec4(iCol.rgb, alpha);
  vShape = shape;
  vSeed = fract(iMisc.x * 0.1591);
  #ifdef USE_FOG
    vFogDepth = -mv.z;
  #endif
  gl_Position = projectionMatrix * mv;
}
`

const FRAG = /* glsl */ `
uniform float uTime;
uniform sampler2D uNoise;
varying vec2 vUv;
varying vec4 vColor;
varying float vShape;
varying float vSeed;
#include <fog_pars_fragment>
${FOG_FACTOR_GLSL}

void main() {
  float r = length(vUv);
  vec3 col = vColor.rgb;
  float a;
  if (vShape < 0.5) {
    // soft glow with a hot core
    a = exp(-r * r * 5.0) * (1.0 - smoothstep(0.85, 1.0, r));
    col *= 1.0 + 1.6 * exp(-r * r * 28.0);
  } else if (vShape < 1.5) {
    // soft annulus, broad enough to survive grazing views of flat ripples
    a = smoothstep(0.38, 0.78, r) * (1.0 - smoothstep(0.8, 1.0, r));
  } else if (vShape < 2.5) {
    // four-point twinkling sparkle
    vec2 p = abs(vUv);
    float rays = (1.0 - p.x) * exp(-p.y * 16.0) + (1.0 - p.y) * exp(-p.x * 16.0);
    float core = exp(-r * r * 9.0);
    a = clamp(core + rays * 0.85 + exp(-r * r * 3.5) * 0.22, 0.0, 1.0) * (1.0 - smoothstep(0.9, 1.0, r));
    a *= 0.6 + 0.4 * sin(uTime * 17.0 + vSeed * 60.0);
    col *= 1.0 + core * 1.5;
  } else if (vShape < 3.5) {
    // textured puff (dust, smoke, mist)
    float n = texture2D(uNoise, vUv * 0.32 + vec2(vSeed, vSeed * 1.7)).r;
    a = 1.0 - smoothstep(0.2, 1.0, r + (n - 0.5) * 0.5);
    col *= 0.8 + 0.35 * n;
  } else if (vShape < 4.5) {
    // heart (implicit curve) with a faint halo
    vec2 p = vUv * 1.32 + vec2(0.0, 0.12);
    float f = pow(dot(p, p) - 1.0, 3.0) - p.x * p.x * p.y * p.y * p.y;
    a = max(1.0 - smoothstep(-0.03, 0.03, f), exp(-r * r * 3.0) * 0.3);
  } else {
    // droplet
    a = 1.0 - smoothstep(0.35, 1.0, r);
  }
  a *= vColor.a;
  if (a < 0.004) discard;

  float fog = fxFogFactor();
  #ifdef ADDITIVE
    col *= 1.0 - fog;
  #else
    #ifdef USE_FOG
      col = mix(col, fogColor, fog);
    #endif
  #endif
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

const ATTRS = ['iPos', 'iVel', 'iCol', 'iSize', 'iMisc'] as const

/** Unit quad (corners at ±1) shared by every effects layer. */
export function quadGeometry(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3))
  geo.setIndex([0, 1, 2, 0, 2, 3])
  return geo
}

export interface PoolOptions {
  /** Max instances ever (the live limit can be lowered with setLimit). */
  capacity: number
  additive: boolean
  /** Slots [0, reserved) are never handed out by the ring (written explicitly by index). */
  reserved?: number
  noise: THREE.Texture
  renderOrder?: number
  name: string
}

export class ParticlePool {
  readonly mesh: THREE.Mesh
  private geo: THREE.InstancedBufferGeometry
  private mat: THREE.ShaderMaterial
  private attrs: THREE.InstancedBufferAttribute[]
  private pos: Float32Array
  private vel: Float32Array
  private col: Float32Array
  private size: Float32Array
  private misc: Float32Array
  private reserved: number
  private limit: number
  private head: number
  /** Slots written since the last update() … */
  private dirtyLo = Infinity
  private dirtyHi = -1
  /** … and slots submitted for upload that the renderer hasn't uploaded yet. */
  private sentLo = Infinity
  private sentHi = -1
  /** Game time after which every particle is dead (lets us skip the draw call). */
  private aliveUntil = -1
  private persistent = 0

  constructor(private opts: PoolOptions) {
    const cap = opts.capacity
    this.reserved = opts.reserved ?? 0
    this.limit = cap
    this.head = this.reserved

    const geo = new THREE.InstancedBufferGeometry()
    quadGeometry(geo)
    const data = ATTRS.map(() => new Float32Array(cap * 4))
    ;[this.pos, this.vel, this.col, this.size, this.misc] = data
    this.attrs = ATTRS.map((name, i) => {
      const a = new THREE.InstancedBufferAttribute(data[i], 4)
      a.setUsage(THREE.DynamicDrawUsage)
      geo.setAttribute(name, a)
      return a
    })
    this.attrs[0].onUpload(() => {
      this.sentLo = Infinity
      this.sentHi = -1
    })
    // Everything starts dead: life 0.
    geo.instanceCount = cap
    this.geo = geo

    this.mat = new THREE.ShaderMaterial({
      name: `fx-${opts.name}`,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        { uTime: { value: 0 }, uViewHeight: { value: 720 }, uNoise: { value: null } },
      ]),
      vertexShader: VERT,
      fragmentShader: FRAG,
      defines: opts.additive ? { ADDITIVE: '' } : {},
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      fog: true,
    })
    this.mat.uniforms.uNoise.value = opts.noise

    this.mesh = new THREE.Mesh(this.geo, this.mat)
    this.mesh.name = `fx-${opts.name}`
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = opts.renderOrder ?? 10
    // Visible until the first update() so the loader's shader warm-up compiles it.
    this.mesh.visible = true
  }

  /** Live ring size (quality). Particles above the new limit simply stop drawing. */
  setLimit(n: number): void {
    const lim = Math.max(this.reserved + 8, Math.min(this.opts.capacity, Math.round(n)))
    if (lim === this.limit) return
    this.limit = lim
    if (this.head >= lim) this.head = this.reserved
    this.geo.instanceCount = lim
  }

  /** Writes a particle into the next ring slot (or into `slot` when given). */
  spawn(p: ParticleInit, time: number, slot = -1): void {
    let i = slot
    if (i < 0) {
      i = this.head
      this.head = this.head + 1 >= this.limit ? this.reserved : this.head + 1
    }
    const o = i * 4
    const { pos, vel, col, size, misc } = this
    pos[o] = p.x
    pos[o + 1] = p.y
    pos[o + 2] = p.z
    pos[o + 3] = time
    vel[o] = p.vx
    vel[o + 1] = p.vy
    vel[o + 2] = p.vz
    vel[o + 3] = p.life
    col[o] = p.r
    col[o + 1] = p.g
    col[o + 2] = p.b
    col[o + 3] = p.a
    size[o] = p.size0
    size[o + 1] = p.size1
    size[o + 2] = p.gravity
    size[o + 3] = p.drag
    misc[o] = p.rot
    misc[o + 1] = p.spin
    misc[o + 2] = p.shape
    misc[o + 3] = p.mode
    if (i < this.dirtyLo) this.dirtyLo = i
    if (i > this.dirtyHi) this.dirtyHi = i
    // Reserved slots are kept alive by their owner via setPersistent().
    if (slot < 0 && time + p.life > this.aliveUntil) this.aliveUntil = time + p.life
  }

  /** Kill a slot immediately (reserved slots only). */
  kill(slot: number): void {
    this.vel[slot * 4 + 3] = 0
    if (slot < this.dirtyLo) this.dirtyLo = slot
    if (slot > this.dirtyHi) this.dirtyHi = slot
  }

  /** Number of reserved slots currently held alive by their owner (keeps the pool drawing). */
  setPersistent(n: number): void {
    this.persistent = n
  }

  /** Upload what changed this frame and advance the shader clock. */
  update(time: number, viewHeight: number): void {
    if (this.dirtyHi >= 0) {
      // Merge with anything still waiting, so nothing is lost if a frame skips drawing us.
      this.sentLo = Math.min(this.sentLo, this.dirtyLo)
      this.sentHi = Math.max(this.sentHi, this.dirtyHi)
      this.dirtyLo = Infinity
      this.dirtyHi = -1
      const start = this.sentLo * 4
      const count = (this.sentHi - this.sentLo + 1) * 4
      for (const a of this.attrs) {
        a.clearUpdateRanges()
        a.addUpdateRange(start, count)
        a.needsUpdate = true
      }
    }
    const u = this.mat.uniforms
    u.uTime.value = time
    u.uViewHeight.value = viewHeight
    this.mesh.visible = this.persistent > 0 || time < this.aliveUntil
  }

  dispose(): void {
    this.mesh.removeFromParent()
    this.geo.dispose()
    this.mat.dispose()
  }
}

/** Uniform random in [a, b). */
export function rand(a: number, b: number): number {
  return a + Math.random() * (b - a)
}
