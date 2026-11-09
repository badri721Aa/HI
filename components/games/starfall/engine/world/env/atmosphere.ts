/**
 * Time-of-day presets and the blendable lighting state the Environment drives.
 *
 * Colours are authored as sRGB hex (THREE converts them to the linear working
 * space), directions point TOWARD the light. `lightDir` is the shadow-casting
 * light: the sun by day, the moon at night.
 */
import * as THREE from 'three'
import type { MapId } from '../../events'
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
  /** Multiplies the fog distances (< 1 = thicker fog). */
  fogScale = 1

  copy(a: Atmosphere): this {
    return this.lerpBetween(a, a, 0)
  }

  /** this = mix(a, b, t). Safe when `this` is `a` or `b`. */
  lerpBetween(a: Atmosphere, b: Atmosphere, t: number): this {
    // When the light hands over between sun and moon, dim it through the middle
    // and swing it while it is dim, instead of sweeping a bright light overhead.
    const handover = Math.abs(a.sunDisc - b.sunDisc) > 0.5
    const dirT = handover ? smooth(0.3, 0.7, t) : t
    lerpDir(this.lightDir, a.lightDir, b.lightDir, dirT)
    lerpDir(this.sunDir, a.sunDir, b.sunDir, t)
    lerpDir(this.moonDir, a.moonDir, b.moonDir, t)
    for (let i = 0; i < COLOR_KEYS.length; i++) {
      const k = COLOR_KEYS[i]
      this[k].copy(a[k]).lerp(b[k], t)
    }
    this.lightIntensity = mix(a.lightIntensity, b.lightIntensity, t) * (handover ? 1 - 0.8 * Math.sin(Math.PI * t) : 1)
    this.sunDisc = mix(a.sunDisc, b.sunDisc, t)
    this.moon = mix(a.moon, b.moon, t)
    this.stars = mix(a.stars, b.stars, t)
    this.cloudCover = mix(a.cloudCover, b.cloudCover, t)
    this.hemiIntensity = mix(a.hemiIntensity, b.hemiIntensity, t)
    this.envIntensity = mix(a.envIntensity, b.envIntensity, t)
    this.exposure = mix(a.exposure, b.exposure, t)
    this.caustics = mix(a.caustics, b.caustics, t)
    this.fogScale = mix(a.fogScale, b.fogScale, t)
    return this
  }
}

const COLOR_KEYS = [
  'lightColor', 'sunColor', 'zenith', 'horizon', 'halo', 'bounce', 'fog', 'cloudLit', 'cloudShade',
  'hemiSky', 'hemiGround', 'waterShallow', 'waterDeep',
] as const

function mix(x: number, y: number, t: number): number {
  return x + (y - x) * t
}

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
  /** Fog colour (defaults to the horizon) and distance scale. */
  fog?: string
  fogScale?: number
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
  a.fog.set(d.fog ?? d.horizon)
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
  a.fogScale = d.fogScale ?? 1
  return a
}

export const PRESETS: Record<TimeOfDay, Atmosphere> = {
  dusk: build(DEFS.dusk),
  night: build(DEFS.night),
  dawn: build(DEFS.dawn),
}

/**
 * The portal maps' looks. Shadow Rift: a starry violet void with storm clouds and cold
 * moonlight from above. Frost Peak: a pale low sun, overcast sky and thick, cold blue fog.
 */
const MAP_DEFS: Record<Exclude<MapId, 'isle'>, PresetDef> = {
  rift: {
    lightDir: [0.35, 0.85, 0.4],
    lightColor: '#cdb0ff',
    lightIntensity: 2.4,
    sunDir: [-0.3, -0.5, 0.8],
    sunDisc: 0,
    sunColor: '#ffffff',
    moonDir: [0.45, 0.42, -0.78],
    moon: 0.7,
    stars: 1,
    zenith: '#07030f',
    horizon: '#3a1563',
    halo: '#7a2fb8',
    bounce: '#1a0d2a',
    cloudLit: '#9a5ad8',
    cloudShade: '#1a0a2c',
    cloudCover: 0.64,
    hemiSky: '#9a7ad8',
    hemiGround: '#3a2450',
    hemiIntensity: 1.3,
    envIntensity: 0.75,
    exposure: 1.35,
    waterShallow: '#2a1a40',
    waterDeep: '#0a0618',
    caustics: 0,
    fog: '#2c1050',
    fogScale: 0.8,
  },
  frost: {
    lightDir: [0.45, 0.5, -0.74],
    lightColor: '#e2efff',
    lightIntensity: 2.4,
    sunDir: [0.45, 0.32, -0.83],
    sunDisc: 0.65,
    sunColor: '#fff6ea',
    moonDir: [-0.4, 0.3, 0.86],
    moon: 0,
    stars: 0,
    zenith: '#577fae',
    horizon: '#c4d8ea',
    halo: '#eef4ff',
    bounce: '#8aa0b8',
    cloudLit: '#f2f6ff',
    cloudShade: '#8494ab',
    cloudCover: 0.72,
    hemiSky: '#b8d4f0',
    hemiGround: '#8b9db2',
    hemiIntensity: 1.0,
    envIntensity: 0.85,
    exposure: 1.0,
    waterShallow: '#9fd4ea',
    waterDeep: '#3a6f96',
    caustics: 0,
    fog: '#a9c4de',
    fogScale: 0.42,
  },
}

export const MAP_PRESETS: Record<Exclude<MapId, 'isle'>, Atmosphere> = {
  rift: build(MAP_DEFS.rift),
  frost: build(MAP_DEFS.frost),
}
