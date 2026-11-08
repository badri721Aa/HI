/**
 * Time-of-day presets and the blendable lighting state the Environment drives.
 *
 * Colours are authored as sRGB hex (THREE converts them to the linear working
 * space), directions point TOWARD the light. `lightDir` is the shadow-casting
 * light: the sun by day, the moon at night.
 */
import * as THREE from 'three'
import type { TimeOfDay } from '../../types'

export class Atmosphere {
  readonly lightDir = new THREE.Vector3()
  readonly lightColor = new THREE.Color()
  lightIntensity = 0
  /** Where the sun disc sits in the sky (may be below the horizon at night). */
  readonly sunDir = new THREE.Vector3()
  /** 0..1 visibility of the sun disc and its glow. */
  sunDisc = 0
  readonly sunColor = new THREE.Color()
  readonly moonDir = new THREE.Vector3()
  moon = 0
  stars = 0
  readonly zenith = new THREE.Color()
  readonly horizon = new THREE.Color()
  /** Warm glow around the sun. */
  readonly halo = new THREE.Color()
  /** Lower hemisphere of the environment map (ground bounce). */
  readonly bounce = new THREE.Color()
  readonly fog = new THREE.Color()
  readonly cloudLit = new THREE.Color()
  readonly cloudShade = new THREE.Color()
  cloudCover = 0.5
  readonly hemiSky = new THREE.Color()
  readonly hemiGround = new THREE.Color()
  hemiIntensity = 1
  envIntensity = 1
  exposure = 1
  /** Water body colours (lit by the scene lights like any surface). */
  readonly waterShallow = new THREE.Color()
  readonly waterDeep = new THREE.Color()
  /** Strength of underwater caustics (scaled by the light colour). */
  caustics = 0

  copy(a: Atmosphere): this {
    return this.lerpBetween(a, a, 0)
  }

  /** this = mix(a, b, t). Safe when `this` is `a` or `b`. */
  lerpBetween(a: Atmosphere, b: Atmosphere, t: number): this {
    const n = (x: number, y: number) => x + (y - x) * t
    // When the light hands over between sun and moon, dim it through the middle
    // and swing it while it is dim, instead of sweeping a bright light overhead.
    const handover = Math.abs(a.sunDisc - b.sunDisc) > 0.5
    const dirT = handover ? smooth(0.3, 0.7, t) : t
    lerpDir(this.lightDir, a.lightDir, b.lightDir, dirT)
    lerpDir(this.sunDir, a.sunDir, b.sunDir, t)
    lerpDir(this.moonDir, a.moonDir, b.moonDir, t)
    for (const k of COLOR_KEYS) this[k].copy(a[k]).lerp(b[k], t)
    this.lightIntensity = n(a.lightIntensity, b.lightIntensity) * (handover ? 1 - 0.8 * Math.sin(Math.PI * t) : 1)
    this.sunDisc = n(a.sunDisc, b.sunDisc)
    this.moon = n(a.moon, b.moon)
    this.stars = n(a.stars, b.stars)
    this.cloudCover = n(a.cloudCover, b.cloudCover)
    this.hemiIntensity = n(a.hemiIntensity, b.hemiIntensity)
    this.envIntensity = n(a.envIntensity, b.envIntensity)
    this.exposure = n(a.exposure, b.exposure)
    this.caustics = n(a.caustics, b.caustics)
    return this
  }
}

const COLOR_KEYS = [
  'lightColor', 'sunColor', 'zenith', 'horizon', 'halo', 'bounce', 'fog', 'cloudLit', 'cloudShade',
  'hemiSky', 'hemiGround', 'waterShallow', 'waterDeep',
] as const

function smooth(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

const _tmp = new THREE.Vector3()
function lerpDir(out: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, t: number): void {
  _tmp.copy(a).lerp(b, t)
  // Near-opposite directions would collapse to zero: arc over the top instead.
  if (_tmp.lengthSq() < 0.04) _tmp.y += 0.3
  out.copy(_tmp.normalize())
}

interface PresetDef {
  lightDir: [number, number, number]
  lightColor: string
  lightIntensity: number
  sunDir: [number, number, number]
  sunDisc: number
  sunColor: string
  moonDir: [number, number, number]
  moon: number
  stars: number
  zenith: string
  horizon: string
  halo: string
  bounce: string
  cloudLit: string
  cloudShade: string
  cloudCover: number
  hemiSky: string
  hemiGround: string
  hemiIntensity: number
  envIntensity: number
  exposure: number
  waterShallow: string
  waterDeep: string
  caustics: number
}

/** The sun sets in the west-north-west; the moon rides high in the south-east. */
const SUN_DUSK: [number, number, number] = [-0.8, 0.27, -0.52]
const SUN_DAWN: [number, number, number] = [0.86, 0.2, -0.3]
const MOON: [number, number, number] = [0.36, 0.62, 0.6]

const DEFS: Record<TimeOfDay, PresetDef> = {
  dusk: {
    lightDir: SUN_DUSK,
    lightColor: '#ffc98a',
    lightIntensity: 3.1,
    sunDir: SUN_DUSK,
    sunDisc: 1,
    sunColor: '#fff0d0',
    moonDir: [0.5, -0.3, 0.8],
    moon: 0,
    stars: 0,
    zenith: '#3a63a6',
    horizon: '#f2c39a',
    halo: '#ff9a4a',
    bounce: '#6e5a44',
    cloudLit: '#ffc9a0',
    cloudShade: '#8f7290',
    cloudCover: 0.5,
    hemiSky: '#a9c1e6',
    hemiGround: '#7a6448',
    hemiIntensity: 0.75,
    envIntensity: 0.7,
    exposure: 1,
    waterShallow: '#46c2b6',
    waterDeep: '#155a78',
    caustics: 0.55,
  },
  night: {
    lightDir: MOON,
    lightColor: '#9fb8ff',
    lightIntensity: 0.75,
    sunDir: [-0.82, -0.32, -0.48],
    sunDisc: 0,
    sunColor: '#ffd0a0',
    moonDir: MOON,
    moon: 1,
    stars: 1,
    zenith: '#050b1e',
    horizon: '#1c2b4a',
    halo: '#30406a',
    bounce: '#0c1018',
    cloudLit: '#2c3858',
    cloudShade: '#10152a',
    cloudCover: 0.56,
    hemiSky: '#4a5f96',
    hemiGround: '#1a1a24',
    hemiIntensity: 0.7,
    envIntensity: 0.9,
    exposure: 1.35,
    waterShallow: '#1f6d78',
    waterDeep: '#061c33',
    caustics: 0.12,
  },
  dawn: {
    lightDir: SUN_DAWN,
    lightColor: '#ffbfa0',
    lightIntensity: 2.7,
    sunDir: SUN_DAWN,
    sunDisc: 1,
    sunColor: '#fff2e0',
    moonDir: [-0.4, 0.25, 0.85],
    moon: 0.15,
    stars: 0.04,
    zenith: '#4a6cb0',
    horizon: '#f6bfb2',
    halo: '#ff9a78',
    bounce: '#6a5452',
    cloudLit: '#ffd3c4',
    cloudShade: '#9a7e9e',
    cloudCover: 0.53,
    hemiSky: '#b4bfe8',
    hemiGround: '#76605a',
    hemiIntensity: 0.8,
    envIntensity: 0.75,
    exposure: 1.05,
    waterShallow: '#4cc0bb',
    waterDeep: '#17577a',
    caustics: 0.5,
  },
}

function build(d: PresetDef): Atmosphere {
  const a = new Atmosphere()
  a.lightDir.set(...d.lightDir).normalize()
  a.sunDir.set(...d.sunDir).normalize()
  a.moonDir.set(...d.moonDir).normalize()
  a.lightColor.set(d.lightColor)
  a.sunColor.set(d.sunColor)
  a.zenith.set(d.zenith)
  a.horizon.set(d.horizon)
  a.halo.set(d.halo)
  a.bounce.set(d.bounce)
  // Fog is the horizon colour, so distant land and sea melt into the sky.
  a.fog.set(d.horizon)
  a.cloudLit.set(d.cloudLit)
  a.cloudShade.set(d.cloudShade)
  a.hemiSky.set(d.hemiSky)
  a.hemiGround.set(d.hemiGround)
  a.waterShallow.set(d.waterShallow)
  a.waterDeep.set(d.waterDeep)
  a.lightIntensity = d.lightIntensity
  a.sunDisc = d.sunDisc
  a.moon = d.moon
  a.stars = d.stars
  a.cloudCover = d.cloudCover
  a.hemiIntensity = d.hemiIntensity
  a.envIntensity = d.envIntensity
  a.exposure = d.exposure
  a.caustics = d.caustics
  return a
}

export const PRESETS: Record<TimeOfDay, Atmosphere> = {
  dusk: build(DEFS.dusk),
  night: build(DEFS.night),
  dawn: build(DEFS.dawn),
}
