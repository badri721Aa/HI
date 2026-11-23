/**
 * The star field: every star in the night sky as one instanced draw call at infinity.
 *
 * Stars are generated once from a fixed seed: a realistic spread of brightness (each magnitude
 * fainter is about three times as common), a handful of colour temperatures, and a distribution
 * that thickens toward the Milky Way — following the same star clouds and dust lanes that are
 * baked into the texture the dome uses for the band's glow. A few hand-placed bright stars and
 * three small invented constellations (the Falling Star, the Lantern, the Crown) give the sky
 * landmarks. Instances are sorted brightest first, so a lower quality level simply draws fewer.
 *
 * Everything else happens in the vertex shader: which stars the darkening sky has revealed
 * (brightest first, overhead first), fading into the horizon haze, behind clouds and into the
 * glow of the sun and moon, and a slow twinkle that touches a few percent of the stars at a time.
 * The CPU only advances the shared time uniform.
 */
import * as THREE from 'three'
import { quadGeometry } from '../../fx/gpu'
import type { QualityLevel } from '../../settings'
import { GALAXY_CORE, GALAXY_POLE, GALAXY_SIDE, GALAXY_SPAN, SKY_CLIP_GLSL, SKY_CLOUDS_GLSL, sharedUniforms, skyDir, type SkyShared } from './skyShared'

/** Stars drawn per quality level (of the brightest-first list). */
export const STAR_COUNTS: Record<QualityLevel, number> = { low: 1600, medium: 3600, high: 5600, ultra: 8000 }
const TOTAL = STAR_COUNTS.ultra

/** Faintest magnitude generated, and the brightest a random star may be (the named ones go beyond). */
const MAG_FAINT = 6.6
const MAG_BRIGHT = 1.7
/** Share of random stars that belong to the Milky Way, for the brightest and the faintest. */
const BAND_SHARE: [number, number] = [0.3, 0.68]

const MILKY_W = 640
const MILKY_H = 160

type Tint = readonly [number, number, number]
const BLUE: Tint = [0.7, 0.81, 1]
const WHITE: Tint = [0.92, 0.95, 1]
const YELLOW: Tint = [1, 0.95, 0.83]
const ORANGE: Tint = [1, 0.82, 0.62]
const RED: Tint = [1, 0.68, 0.52]

/** Hand-placed stars: bearing, elevation (degrees), magnitude, tint, and whether it twinkles (planets don't). */
const NAMED: ReadonlyArray<readonly [number, number, number, Tint, boolean]> = [
  // The evening star: first out at dusk, low in the south-west.
  [236, 15, -1.5, YELLOW, false],
  // Northlight, high above the Beacon; Tidestar over the southern sea; Ember in the east.
  [352, 46, -0.2, BLUE, true],
  [185, 16, 0.2, BLUE, true],
  [118, 19, 0.5, RED, true],
  [20, 12, 1, YELLOW, true],
  [310, 17, 1.1, WHITE, true],
  [75, 13, 1.3, ORANGE, true],
  [158, 62, 0.9, WHITE, true],
  [275, 58, 1.2, ORANGE, true],
]

/** Constellations: centre bearing and elevation, then stars as [east, up (degrees), magnitude, tint]. */
const CONSTELLATIONS: ReadonlyArray<{ az: number; el: number; stars: ReadonlyArray<readonly [number, number, number, Tint]> }> = [
  {
    // The Falling Star: seven stars, a kite-shaped head with a trailing tail, diving toward the island.
    az: 42,
    el: 30,
    stars: [
      [-3.5, -3, 0.6, YELLOW], [-2.2, -0.6, 1.7, WHITE], [-0.9, -2.6, 1.8, WHITE], [0.4, -0.3, 1.3, BLUE],
      [2.8, 1.7, 2, WHITE], [5.4, 3.2, 2.3, BLUE], [8.2, 4.1, 2.6, WHITE],
    ],
  },
  {
    // The Lantern: a narrow tower with a warm flame on top.
    az: 255,
    el: 24,
    stars: [[-1.6, -4, 2.2, WHITE], [1.6, -4, 2.2, WHITE], [-0.9, 0, 2.4, BLUE], [0.9, 0, 2.4, BLUE], [0, 3.6, 0.7, ORANGE]],
  },
  {
    // The Crown: a half ring with one bright gem.
    az: 205,
    el: 47,
    stars: [[-3.3, 0.6, 2.8, WHITE], [-2.4, -2.2, 2.5, WHITE], [-0.6, -3.3, 2.6, YELLOW], [1.2, -3.1, 1.5, BLUE], [2.8, -1.8, 2.6, WHITE], [3.4, 0.5, 2.9, WHITE]],
  },
]

/** A tight little cluster of faint blue stars (bearing, elevation, spread in degrees, how many). */
const CLUSTER = { az: 72, el: 33, spread: 0.55, count: 9 }

/* ── deterministic noise ─────────────────────────────────────── */

function mulberry32(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hash3(x: number, y: number, z: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177)
  h = Math.imul(h ^ (h >>> 13), 1103515245)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** Smooth value noise, 0..1. */
function noise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const zi = Math.floor(z)
  const fx = x - xi
  const fy = y - yi
  const fz = z - zi
  const u = fx * fx * (3 - 2 * fx)
  const v = fy * fy * (3 - 2 * fy)
  const w = fz * fz * (3 - 2 * fz)
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t
  return lerp(
    lerp(lerp(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), u), lerp(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), u), v),
    lerp(lerp(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), u), lerp(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), u), v),
    w,
  )
}

function fbm(x: number, y: number, z: number, octaves: number): number {
  let sum = 0
  let amp = 0.5
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    sum += noise3(x, y, z) * amp
    norm += amp
    amp *= 0.5
    x = x * 2.03 + 11.7
    y = y * 2.03 + 5.3
    z = z * 2.03 + 2.9
  }
  return sum / norm
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}

/* ── the Milky Way ───────────────────────────────────────────── */

/** How strongly the galactic bulge shows at longitude `lon` (radians from the core). */
function bulge(lon: number): number {
  return Math.exp(-(lon * lon) / 0.3)
}

/**
 * Brightness of the Milky Way (0..1) at galactic longitude `lon` (radians, 0 = the core) and
 * `s` = sin(latitude): a band that swells into a bulge at the core, broken into star clouds,
 * split by the great rift (a dust lane weaving along the mid-plane) and veined with thinner dust.
 * Sampled on a cylinder, so it wraps seamlessly in longitude.
 */
function galaxy(lon: number, s: number): number {
  const cx = Math.cos(lon)
  const cy = Math.sin(lon)
  const b = bulge(lon)
  // The band's centre line wanders a little, so it never reads as a ruled stripe.
  const mid = (fbm(cx * 1.3 + 3.1, cy * 1.3 + 8.4, 0.3, 2) - 0.5) * 0.09
  const width = 0.07 + 0.06 * b + 0.015 * cx
  const t = (s - mid) / width
  const band = Math.exp(-t * t)
  if (band < 0.004) return 0
  // Star clouds: bright knots over a mottled haze, with dim gaps between them.
  const haze = fbm(cx * 1.7 + 0.9, cy * 1.7 + 6.1, s * 4, 3)
  const clouds = smooth(0.36, 0.7, fbm(cx * 2.6 + 7.1, cy * 2.6 + 3.3, s * 7, 5))
  let g = band * (0.2 + 0.5 * b + 0.12 * (0.5 + 0.5 * cx)) * (0.5 * haze + 1.5 * clouds)

  // The great rift comes and goes along the band, weaving and changing width.
  const weave = (fbm(cx * 1.9 + 1.7, cy * 1.9 + 9.2, 0.5, 3) - 0.5) * 0.24
  const laneWidth = 0.01 + 0.05 * fbm(cx * 3.7 + 4.4, cy * 3.7 + 0.6, 2.2, 3)
  const patches = smooth(0.38, 0.58, fbm(cx * 2.9 + 6.6, cy * 2.9 + 1.2, 4.1, 3))
  const ls = (s - mid - weave) / laneWidth
  const rift = Math.exp(-ls * ls) * patches * (0.45 + 0.55 * Math.exp(-(lon * lon) / 3))
  const wisps = smooth(0.5, 0.75, fbm(cx * 6.3 + 2.2, cy * 6.3 + 5.9, s * 18, 4))
  g *= (1 - 0.82 * rift) * (1 - 0.55 * wisps)
  return clamp01(g)
}

/**
 * The band's glow for the dome: u = longitude, v = sin(latitude) across ±GALAXY_SPAN.
 * R = brightness, G = how warm the light is there (the old yellow stars of the bulge).
 */
function bakeMilkyWay(): THREE.DataTexture {
  const data = new Uint8Array(MILKY_W * MILKY_H * 4)
  for (let j = 0; j < MILKY_H; j++) {
    const s = ((j + 0.5) / MILKY_H - 0.5) * 2 * GALAXY_SPAN
    // Fade to nothing at the texture's edge so the dome needs no extra mask.
    const edge = 1 - smooth(0.8 * GALAXY_SPAN, GALAXY_SPAN, Math.abs(s))
    for (let i = 0; i < MILKY_W; i++) {
      const lon = ((i + 0.5) / MILKY_W - 0.5) * 2 * Math.PI
      const k = (j * MILKY_W + i) * 4
      data[k] = Math.round(255 * Math.sqrt(galaxy(lon, s) * edge))
      data[k + 1] = Math.round(255 * clamp01(bulge(lon) * Math.exp(-(s * s) / 0.02)))
      data[k + 3] = 255
    }
  }
  const tex = new THREE.DataTexture(data, MILKY_W, MILKY_H, THREE.RGBAFormat, THREE.UnsignedByteType)
  tex.name = 'starfall.milkyway'
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  // No mipmaps: the longitude seam would otherwise show as a line of the smallest mip.
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.generateMipmaps = false
  tex.needsUpdate = true
  return tex
}

/* ── star catalogue ──────────────────────────────────────────── */

/** Floats per star while generating: direction, magnitude, tint, twinkle depth. */
const STRIDE = 8

function generateStars(): Float32Array {
  const rnd = mulberry32(0x57a2fa11)
  const raw = new Float32Array(TOTAL * STRIDE)
  const d = new THREE.Vector3()
  let n = 0
  const put = (mag: number, tint: Tint, twinkle: number) => {
    raw.set([d.x, d.y, d.z, mag, tint[0], tint[1], tint[2], twinkle], n * STRIDE)
    n++
  }

  for (const [az, el, mag, tint, twinkles] of NAMED) {
    skyDir(az, el, d)
    put(mag, tint, twinkles ? 0.35 : 0)
  }
  for (const c of CONSTELLATIONS) {
    const stretch = 1 / Math.cos((c.el * Math.PI) / 180)
    for (const [east, up, mag, tint] of c.stars) {
      skyDir(c.az + east * stretch, c.el + up, d)
      put(mag, tint, 0.3)
    }
  }
  for (let i = 0; i < CLUSTER.count; i++) {
    const r = CLUSTER.spread * Math.sqrt(rnd())
    const a = rnd() * Math.PI * 2
    skyDir(CLUSTER.az + (r * Math.cos(a)) / Math.cos((CLUSTER.el * Math.PI) / 180), CLUSTER.el + r * Math.sin(a), d)
    put(3 + rnd() * 1.6, BLUE, 0.25)
  }

  while (n < TOTAL) {
    // Each magnitude fainter is ~3.2x as common.
    const mag = Math.max(MAG_BRIGHT, MAG_FAINT + Math.log10(1 - rnd()) * 2)
    const faint = smooth(2, 6, mag)
    let placed = false
    if (rnd() < BAND_SHARE[0] + (BAND_SHARE[1] - BAND_SHARE[0]) * faint) {
      // A Milky Way star: more likely where the band is bright, rare inside the dust lanes.
      for (let tries = 0; tries < 60 && !placed; tries++) {
        const lon = (rnd() * 2 - 1) * Math.PI
        const s = (rnd() * 2 - 1) * 0.3
        const c = Math.sqrt(1 - s * s)
        d.set(0, 0, 0)
          .addScaledVector(GALAXY_CORE, c * Math.cos(lon))
          .addScaledVector(GALAXY_SIDE, c * Math.sin(lon))
          .addScaledVector(GALAXY_POLE, s)
        // Half the band is below the horizon: skip those before the costly density test.
        placed = d.y > -0.02 && rnd() < galaxy(lon, s) * 1.6 + 0.02
      }
    }
    if (!placed) {
      // A field star: anywhere above the horizon, evenly over the sphere.
      const y = rnd() * 1.02 - 0.02
      const a = rnd() * Math.PI * 2
      const r = Math.sqrt(Math.max(0, 1 - y * y))
      d.set(r * Math.cos(a), y, r * Math.sin(a))
    }
    const pick = rnd()
    const tint = pick < 0.14 ? BLUE : pick < 0.46 ? WHITE : pick < 0.74 ? YELLOW : pick < 0.93 ? ORANGE : RED
    put(mag, tint, rnd() < 0.25 ? 0.45 + 0.35 * rnd() : 0)
  }
  return raw
}

/** Instance attributes, brightest star first. */
function buildAttributes(): { dir: Float32Array; color: Float32Array; star: Float32Array } {
  const raw = generateStars()
  const rnd = mulberry32(0x0c0ffee5)
  const order = Array.from({ length: TOTAL }, (_, i) => i).sort((a, b) => raw[a * STRIDE + 3] - raw[b * STRIDE + 3])
  const dir = new Float32Array(TOTAL * 3)
  const color = new Float32Array(TOTAL * 4)
  const star = new Float32Array(TOTAL * 4)
  for (let i = 0; i < TOTAL; i++) {
    const k = order[i] * STRIDE
    const mag = raw[k + 3]
    dir.set(raw.subarray(k, k + 3), i * 3)
    // Faint stars read as nearly white to the eye; the bright ones keep their colour.
    const wash = 0.4 * smooth(1.5, 5.5, mag)
    color[i * 4] = raw[k + 4] + (0.94 - raw[k + 4]) * wash
    color[i * 4 + 1] = raw[k + 5] + (0.95 - raw[k + 5]) * wash
    color[i * 4 + 2] = raw[k + 6] + (1 - raw[k + 6]) * wash
    color[i * 4 + 3] = raw[k + 7]
    // Amplitude (square root of the flux: the eye's range, not the telescope's), the sky darkness at
    // which the star comes out, and its twinkle phase and rate (0.08–0.38 Hz).
    star[i * 4] = Math.min(1.9, Math.pow(10, -0.2 * mag))
    star[i * 4 + 1] = clamp01((mag + 1.5) / 8.6) * 0.8
    star[i * 4 + 2] = rnd() * Math.PI * 2
    star[i * 4 + 3] = 0.5 + 1.9 * rnd()
  }
  return { dir, color, star }
}

/* ── rendering ───────────────────────────────────────────────── */

const VERT = /* glsl */ `
uniform float uTime;
uniform float uStars;
uniform float uSunDisc;
uniform float uMoon;
uniform float uCloudCover;
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform vec3 uView;
uniform sampler2D tClouds;
attribute vec3 aDir;
attribute vec4 aColor;  // tint, twinkle depth
attribute vec4 aStar;   // amplitude, reveal threshold, twinkle phase, twinkle rate
varying vec2 vUv;
varying vec3 vColor;
varying vec3 vShape;    // half size (px), 1 / core radius² (px), glow
${SKY_CLOUDS_GLSL}
${SKY_CLIP_GLSL}

void main() {
  vec3 d = aDir;
  float h = d.y;

  // How dark the sky is toward this star: stars come out overhead and away from the sun first,
  // and the faint ones drown in the moon's glow (none shine through its disc).
  float dark = uStars * ( 1.0 - 0.85 * uSunDisc * smoothstep( -0.2, 0.9, dot( d, uSunDir ) ) );
  dark *= mix( 1.0, smoothstep( 0.05, 0.55, h ), uSunDisc );
  float md = dot( d, uMoonDir );
  float mg = max( md, 0.0 );
  mg *= mg; mg *= mg; mg *= mg; mg *= mg;
  dark *= 1.0 - uMoon * ( 0.6 * mg + 0.4 * smoothstep( 0.9975, 0.999, md ) );

  float alpha = smoothstep( aStar.y - 0.05, aStar.y + 0.2, dark ) * smoothstep( 0.015, 0.17, h );
  if ( alpha < 0.004 ) {
    gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 );
    return;
  }
  alpha *= 1.0 - 0.94 * skyClouds( tClouds, d, uCloudCover, uTime ).x;

  // Twinkle: a slow swell now and then (stronger low in the sky, where the air is thick).
  float pulse = 0.5 + 0.5 * sin( uTime * aStar.w + aStar.z );
  pulse *= pulse; pulse *= pulse; pulse *= pulse; pulse *= pulse;
  float shimmer = sin( uTime * aStar.w * 1.7 + aStar.z * 2.3 );
  float twinkle = 1.0 + aColor.a * ( mix( 1.5, 1.0, smoothstep( 0.1, 0.6, h ) ) * ( 0.9 * pulse - 0.1 ) + 0.1 * shimmer );

  float amp = aStar.x;
  // Low stars are dimmed and reddened by the air.
  vec3 air = mix( vec3( 0.85, 0.68, 0.52 ), vec3( 1.0 ), smoothstep( 0.03, 0.3, h ) );
  vColor = aColor.rgb * air * ( amp * 2.0 * alpha * max( twinkle, 0.0 ) );

  float glow = smoothstep( 0.5, 1.3, amp );
  float core = ( 0.62 + 0.5 * min( amp, 1.2 ) ) * uView.z;
  float size = ( 1.6 + 2.4 * min( amp, 1.2 ) + 6.0 * glow ) * uView.z;
  vShape = vec3( size, 1.0 / ( core * core ), glow );
  vUv = position.xy;
  vec4 p = skyClip( d );
  p.xy += position.xy * size * uView.xy * p.w;
  gl_Position = p;
}
`

const FRAG = /* glsl */ `
varying vec2 vUv;
varying vec3 vColor;
varying vec3 vShape;

void main() {
  float r2 = dot( vUv, vUv );
  float rim = max( 1.0 - r2, 0.0 );
  float px2 = r2 * vShape.x * vShape.x;
  // A sharp core; the brightest stars add a soft halo and four faint rays.
  float light = exp( - px2 * vShape.y ) * smoothstep( 0.0, 0.15, rim );
  vec2 a = abs( vUv );
  light += vShape.z * rim * rim * ( 0.07 + 0.1 * ( exp( - a.y * 16.0 ) + exp( - a.x * 16.0 ) ) );
  gl_FragColor = vec4( vColor * light, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

export class StarField {
  readonly mesh: THREE.Mesh
  /** The Milky Way's glow, for the dome (see bakeMilkyWay). */
  readonly milkyWay: THREE.DataTexture
  private geometry: THREE.InstancedBufferGeometry
  private material: THREE.ShaderMaterial

  constructor(shared: SkyShared) {
    this.milkyWay = bakeMilkyWay()
    const { dir, color, star } = buildAttributes()
    const geo = new THREE.InstancedBufferGeometry()
    quadGeometry(geo)
    geo.setAttribute('aDir', new THREE.InstancedBufferAttribute(dir, 3))
    geo.setAttribute('aColor', new THREE.InstancedBufferAttribute(color, 4))
    geo.setAttribute('aStar', new THREE.InstancedBufferAttribute(star, 4))
    geo.instanceCount = STAR_COUNTS.high
    this.geometry = geo
    this.material = new THREE.ShaderMaterial({
      name: 'starfall.stars',
      uniforms: { ...sharedUniforms(shared) },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    this.mesh = new THREE.Mesh(geo, this.material)
    this.mesh.name = 'stars'
    this.mesh.frustumCulled = false
    // First among the transparents: water, mist and effects blend over the stars.
    this.mesh.renderOrder = -100
    this.mesh.matrixAutoUpdate = false
  }

  setQuality(level: QualityLevel): void {
    this.geometry.instanceCount = STAR_COUNTS[level]
  }

  dispose(): void {
    this.mesh.removeFromParent()
    this.geometry.dispose()
    this.material.dispose()
    this.milkyWay.dispose()
  }
}
