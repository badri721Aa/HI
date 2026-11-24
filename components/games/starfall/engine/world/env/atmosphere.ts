/**
 * Time-of-day presets and the blendable lighting state the Environment drives.
 *
 * Colours are authored as sRGB hex (THREE converts them to the linear working
 * space), directions point TOWARD the light. `lightDir` is the shadow-casting
 * light: the sun by day, the moon at night.
 *
 * The island's evening is a sequence of looks (`EVENING`): golden dusk, sunset, the blue hour and
 * full moonlit night, with a mixed step between the keys. The story walks through them as shards
 * are found; the finale turns the night to `PRESETS.dawn`. Night is lit to be played in: a cool
 * moon bright enough to cast clear shadows, and enough sky fill that nothing sinks to black.
 */
import * as THREE from 'three'
import type { MapId } from '../../events'
import type { TimeOfDay } from '../../types'
import { MAPS } from '../../worlds/defs'
import { skyDir } from './skyShared'

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
  /** 0..1 how far the stars are out (the brightest show first). */
  stars = 0
  /** Strength of the Milky Way's glow and of the aurora (both only show in a dark sky). */
  milkyWay = 1
  aurora = 0
  /** 1 while the moon is the shadow-casting light, 0 for the sun. */
  moonlit = 0
  /** 0..1 how far the colour grade leans from warm evening to cool night. */
  night = 0
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
  /** The haze starts at this fraction of its end distance (lower = it reaches nearer). */
  fogNear = 0.35
  /** How fast the haze thins with height (per metre) above `fogBase` (world height, m). */
  fogHeight = 0
  fogBase = 0
  /** Strength of the sun's glow in the haze (the halo colour, toward the sun). */
  fogGlow = 0
  /** 0..1 how much lanterns, windows and fires light their surroundings. */
  localLight = 0
  /** Strength of the sky-light rim on characters. */
  rim = 0

  copy(a: Atmosphere): this {
    return this.lerpBetween(a, a, 0)
  }

  /** this = mix(a, b, t). Safe when `this` is `a` or `b`. */
  lerpBetween(a: Atmosphere, b: Atmosphere, t: number): this {
    // When the light hands over between sun and moon, dim it through the middle
    // and swing it while it is dim, instead of sweeping a bright light overhead.
    const handover = Math.abs(a.moonlit - b.moonlit) > 0.5
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
    this.milkyWay = mix(a.milkyWay, b.milkyWay, t)
    this.aurora = mix(a.aurora, b.aurora, t)
    this.moonlit = mix(a.moonlit, b.moonlit, t)
    this.night = mix(a.night, b.night, t)
    this.cloudCover = mix(a.cloudCover, b.cloudCover, t)
    this.hemiIntensity = mix(a.hemiIntensity, b.hemiIntensity, t)
    this.envIntensity = mix(a.envIntensity, b.envIntensity, t)
    this.exposure = mix(a.exposure, b.exposure, t)
    this.caustics = mix(a.caustics, b.caustics, t)
    this.fogScale = mix(a.fogScale, b.fogScale, t)
    this.fogNear = mix(a.fogNear, b.fogNear, t)
    this.fogHeight = mix(a.fogHeight, b.fogHeight, t)
    this.fogBase = mix(a.fogBase, b.fogBase, t)
    this.fogGlow = mix(a.fogGlow, b.fogGlow, t)
    this.localLight = mix(a.localLight, b.localLight, t)
    this.rim = mix(a.rim, b.rim, t)
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
  /** Milky Way and aurora strength (defaults 1 and 0). */
  milkyWay?: number
  aurora?: number
  /** The light is the moon (default: whenever the sun disc is mostly hidden). */
  moonlit?: boolean
  /** Lean of the colour grade toward cool night (default 0). */
  night?: number
  /** Where the haze starts, as a fraction of its end distance (default 0.35). */
  fogNear?: number
  /** Haze falloff per metre of height, and the height above the floor it starts at (defaults 0.008, 6 m). */
  fogHeight?: number
  fogBase?: number
  /** Strength of the sun's glow in the haze (default 0.2). */
  fogGlow?: number
  /** How much lanterns and fires light their surroundings (default 1). */
  localLight?: number
  /** Strength of the rim light on characters (default 0.38). */
  rim?: number
}

type Dir = [number, number, number]
/** Direction toward a compass bearing (degrees clockwise from north) and elevation. */
const at = (bearing: number, elevation: number): Dir => skyDir(bearing, elevation).toArray()

/**
 * The sun sets in the west-north-west. The moon climbs in the south-east: behind a player heading
 * north to the Beacon, so the way ahead is front-lit, and low enough to throw long, readable shadows.
 */
const SUN_DUSK: Dir = [-0.8, 0.27, -0.52]
const SUN_DAWN: Dir = [0.86, 0.2, -0.3]
const MOON: Dir = at(150, 33)

/**
 * The island's air: haze that begins well inside the view (hills layer behind hills) and thins
 * above the treetops, so the Beacon's hill stands clear of it.
 */
const ISLE_AIR = { fogNear: 0.2, fogHeight: 0.014, fogBase: 3 }

const DEFS: Record<TimeOfDay | 'sunset' | 'twilight', PresetDef> = {
  dusk: {
    ...ISLE_AIR,
    // A peach haze a shade deeper than the horizon; the glow turns it gold toward the sun.
    fog: '#dfa98b',
    fogGlow: 0.35,
    localLight: 0.6,
    lightDir: SUN_DUSK,
    lightColor: '#ffbe7a',
    lightIntensity: 3.4,
    sunDir: SUN_DUSK,
    sunDisc: 1,
    sunColor: '#fff0d0',
    moonDir: [0.5, -0.3, 0.8],
    moon: 0,
    // The first stars are already out overhead.
    stars: 0.5,
    zenith: '#3a63a6',
    horizon: '#f0b27a',
    halo: '#ff9a4a',
    bounce: '#6e5a44',
    cloudLit: '#ffc9a0',
    cloudShade: '#8f7290',
    cloudCover: 0.5,
    // A cool sky fill against the warm sun: shaded sides stay blue-violet instead of grey.
    hemiSky: '#9cb6ea',
    hemiGround: '#7a6448',
    hemiIntensity: 0.68,
    envIntensity: 0.64,
    exposure: 1.0,
    waterShallow: '#46c2b6',
    waterDeep: '#155a78',
    caustics: 0.55,
  },
  // The sun's disc on the horizon: long orange light, a deepening sky, the moon just up.
  sunset: {
    ...ISLE_AIR,
    fog: '#d1917a',
    fogGlow: 0.6,
    localLight: 0.85,
    // The light stays a little above the disc so the island is not all one long shadow.
    lightDir: at(302, 9.5),
    lightColor: '#ffa76a',
    lightIntensity: 2.4,
    sunDir: at(302, 2.5),
    sunDisc: 0.95,
    sunColor: '#ffc890',
    moonDir: at(128, 6),
    moon: 0.5,
    stars: 0.62,
    zenith: '#243f86',
    horizon: '#e89c74',
    halo: '#f8742f',
    bounce: '#5c4638',
    cloudLit: '#ffa785',
    cloudShade: '#6a5278',
    cloudCover: 0.52,
    hemiSky: '#93a2dc',
    hemiGround: '#6c5244',
    hemiIntensity: 0.82,
    envIntensity: 0.75,
    exposure: 1.04,
    waterShallow: '#3fb0ae',
    waterDeep: '#134f72',
    caustics: 0.35,
    night: 0.15,
  },
  // The blue hour: an afterglow where the sun went down, the moon taking over, most stars out.
  twilight: {
    ...ISLE_AIR,
    fogGlow: 0.7,
    moonlit: true,
    lightDir: at(143, 26),
    lightColor: '#b2c2ff',
    lightIntensity: 0.9,
    sunDir: at(301, -7),
    sunDisc: 0.45,
    sunColor: '#ff9a60',
    moonDir: at(140, 21),
    moon: 0.9,
    stars: 0.9,
    aurora: 0.25,
    zenith: '#0d1638',
    horizon: '#3d3d5e',
    halo: '#ff8448',
    bounce: '#1c1a2e',
    cloudLit: '#544c72',
    cloudShade: '#191b36',
    cloudCover: 0.58,
    hemiSky: '#6a7ec8',
    hemiGround: '#383650',
    hemiIntensity: 1.2,
    envIntensity: 1.05,
    exposure: 1.32,
    waterShallow: '#28768c',
    waterDeep: '#0a2846',
    caustics: 0.15,
    night: 0.75,
  },
  // Full night: blue-silver moonlight, a clear sky, every star.
  night: {
    ...ISLE_AIR,
    moonlit: true,
    lightDir: MOON,
    lightColor: '#b8caff',
    lightIntensity: 1.25,
    sunDir: [-0.82, -0.32, -0.48],
    sunDisc: 0,
    sunColor: '#ffd0a0',
    moonDir: MOON,
    moon: 1,
    stars: 1,
    aurora: 0.7,
    // A deep, slightly grey navy: the tone curve makes anything bluer glow electric.
    zenith: '#090e24',
    horizon: '#232c44',
    halo: '#30406a',
    bounce: '#0e1220',
    cloudLit: '#272f47',
    cloudShade: '#0c1122',
    cloudCover: 0.66,
    // A strong sky fill: under the trees, where the moon does not reach, paths and enemies must
    // still read. Moonlit ground stays about three times brighter than its shadows.
    hemiSky: '#6c86d0',
    hemiGround: '#40466c',
    hemiIntensity: 1.55,
    envIntensity: 1.2,
    exposure: 1.4,
    waterShallow: '#1f6d78',
    waterDeep: '#061c33',
    caustics: 0.12,
    night: 1,
  },
  dawn: {
    ...ISLE_AIR,
    fog: '#e6b8b0',
    fogGlow: 0.5,
    localLight: 0.35,
    // Like at sunset, the light stands a little above the disc: the low sun still rakes across
    // the island, but open ground is properly lit instead of grazed.
    lightDir: at(71, 21),
    lightColor: '#ffc4a0',
    lightIntensity: 3.0,
    sunDir: SUN_DAWN,
    sunDisc: 1,
    sunColor: '#fff2e0',
    moonDir: [-0.4, 0.25, 0.85],
    moon: 0.3,
    // The last bright stars linger overhead.
    stars: 0.3,
    zenith: '#4a6cb0',
    horizon: '#f6bfb2',
    halo: '#ff9a78',
    bounce: '#6a5452',
    cloudLit: '#ffd3c4',
    cloudShade: '#9a7e9e',
    cloudCover: 0.53,
    hemiSky: '#a9b8ee',
    hemiGround: '#76605a',
    hemiIntensity: 0.7,
    envIntensity: 0.68,
    exposure: 1.02,
    waterShallow: '#4cc0bb',
    waterDeep: '#17577a',
    caustics: 0.5,
    night: 0.05,
  },
}

/** `floor`: height of the ground the look is for (the sea for the island, a portal map's main floor). */
function build(d: PresetDef, floor = 0): Atmosphere {
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
  a.milkyWay = d.milkyWay ?? 1
  a.aurora = d.aurora ?? 0
  a.moonlit = (d.moonlit ?? d.sunDisc < 0.5) ? 1 : 0
  a.night = d.night ?? 0
  a.fogNear = d.fogNear ?? 0.35
  a.fogHeight = d.fogHeight ?? 0.008
  a.fogBase = floor + (d.fogBase ?? 6)
  a.fogGlow = d.fogGlow ?? 0.2
  a.localLight = d.localLight ?? 1
  a.rim = d.rim ?? 0.38
  return a
}

export const PRESETS: Record<TimeOfDay, Atmosphere> = {
  dusk: build(DEFS.dusk),
  night: build(DEFS.night),
  dawn: build(DEFS.dawn),
}

const SUNSET = build(DEFS.sunset)
const TWILIGHT = build(DEFS.twilight)
const between = (a: Atmosphere, b: Atmosphere, t: number) => new Atmosphere().lerpBetween(a, b, t)

/**
 * The island's evening by star shards found (0–7): dusk at the start, the sun gone by the third
 * shard, starlit night from the fifth. The last steps are the very preset the finale asks for.
 */
export const EVENING: readonly Atmosphere[] = [
  PRESETS.dusk,
  between(PRESETS.dusk, SUNSET, 0.5),
  SUNSET,
  TWILIGHT,
  between(TWILIGHT, PRESETS.night, 0.55),
  PRESETS.night,
  PRESETS.night,
  PRESETS.night,
]

/** The blue hour: behind the title screen, and the earliest a Creative world gets. */
export const BLUE_HOUR = 3

/**
 * The portal maps' looks (a map can add its own backdrop on top, e.g. the Rift's void sphere).
 * Shadow Rift: a starry violet void with storm clouds and cold moonlight from above. Frost Peak:
 * a pale low sun, overcast sky and thick, cold blue fog. Volcanic Ruins: a red sun low through
 * ash, the lava's glow from below. Sky Isles: bright day above a sea of clouds. Neon Metropolis:
 * a violet night lit from below by the city. Glitch Grid: a black void with a cold cyan light.
 * Fog stays thick enough (fogScale ≤ 0.7) that a map's kill-floor sheet melts away before its edge.
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
    // The dark maps take the cool night grade, not the warm evening one.
    night: 0.8,
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
    fogGlow: 0.15,
    localLight: 0.4,
  },
  volcanic: {
    // Dusk under ash: a low sun setting in the west through the smoke, a dark maroon sky, cool
    // grey fill from the ash overhead and a red bounce from the lava below.
    lightDir: [-0.78, 0.36, 0.5],
    lightColor: '#ffa36e',
    lightIntensity: 2.6,
    sunDir: [-0.86, 0.1, 0.5],
    sunDisc: 0.55,
    sunColor: '#ff8a4a',
    moonDir: [0.4, 0.3, -0.86],
    moon: 0,
    stars: 0,
    zenith: '#1c1220',
    horizon: '#a0442a',
    halo: '#ff6a2a',
    bounce: '#3a1a10',
    cloudLit: '#c4673f',
    cloudShade: '#2a1c24',
    cloudCover: 0.58,
    hemiSky: '#7a7690',
    hemiGround: '#4a2418',
    hemiIntensity: 1.0,
    envIntensity: 0.65,
    exposure: 1.12,
    waterShallow: '#3a1a10',
    waterDeep: '#1a0805',
    caustics: 0,
    fog: '#3e2624',
    fogScale: 0.55,
  },
  sky: {
    lightDir: [0.35, 0.72, 0.6],
    lightColor: '#fff4e0',
    lightIntensity: 3.0,
    sunDir: [0.35, 0.4, 0.85],
    sunDisc: 1,
    sunColor: '#fff6e0',
    moonDir: [-0.4, 0.3, -0.86],
    moon: 0,
    stars: 0,
    zenith: '#3f7fd0',
    horizon: '#cfe4f5',
    halo: '#fff2d0',
    bounce: '#c8d4e4',
    cloudLit: '#ffffff',
    cloudShade: '#a8b8d0',
    cloudCover: 0.42,
    hemiSky: '#b8d8ff',
    hemiGround: '#d8dce4',
    hemiIntensity: 1.0,
    envIntensity: 0.9,
    exposure: 1.0,
    waterShallow: '#9fd4ea',
    waterDeep: '#3a6f96',
    caustics: 0,
    fog: '#d6e6f4',
    // Clear air: the cloud sea reaches further out (560 m) than the other maps' sheets.
    fogScale: 1,
    fogGlow: 0.1,
    localLight: 0.25,
  },
  neon: {
    lightDir: [-0.3, 0.8, 0.5],
    lightColor: '#b8a8ff',
    lightIntensity: 1.3,
    sunDir: [-0.8, -0.3, -0.5],
    sunDisc: 0,
    sunColor: '#ffd0a0',
    moonDir: [-0.35, 0.55, -0.76],
    moon: 0.8,
    // City glow: only the brighter stars make it through, and barely any Milky Way.
    stars: 0.5,
    milkyWay: 0.25,
    zenith: '#060818',
    horizon: '#3a1450',
    halo: '#7a2a8a',
    bounce: '#1a0c2a',
    cloudLit: '#6a3a8a',
    cloudShade: '#120a22',
    cloudCover: 0.55,
    hemiSky: '#6a5ab8',
    hemiGround: '#5a1a5a',
    hemiIntensity: 1.2,
    envIntensity: 0.8,
    exposure: 1.3,
    waterShallow: '#1a1430',
    waterDeep: '#05030c',
    caustics: 0,
    fog: '#1e0c34',
    fogScale: 0.6,
    night: 0.8,
  },
  glitch: {
    lightDir: [0.3, 0.85, 0.42],
    lightColor: '#cffaff',
    lightIntensity: 1.8,
    sunDir: [-0.3, -0.5, 0.8],
    sunDisc: 0,
    sunColor: '#ffffff',
    moonDir: [0.4, 0.4, -0.8],
    moon: 0,
    // Cold points of light in the void, no galaxy behind them.
    stars: 0.8,
    milkyWay: 0,
    zenith: '#010308',
    horizon: '#06242a',
    halo: '#0a4a50',
    bounce: '#041014',
    cloudLit: '#0f5a60',
    cloudShade: '#020a0e',
    // No clouds in a digital void (the cover is a threshold: 1 clears the sky).
    cloudCover: 1,
    hemiSky: '#5ab8c8',
    hemiGround: '#0a3a40',
    hemiIntensity: 1.1,
    envIntensity: 0.7,
    exposure: 1.3,
    waterShallow: '#06242a',
    waterDeep: '#010308',
    caustics: 0,
    fog: '#03141a',
    fogScale: 0.6,
    // A void has no weather: the same thin haze at every height.
    fogHeight: 0,
    night: 1,
  },
}

export const MAP_PRESETS: Record<Exclude<MapId, 'isle'>, Atmosphere> = {
  rift: build(MAP_DEFS.rift, MAPS.rift.center.y),
  frost: build(MAP_DEFS.frost, MAPS.frost.center.y),
  volcanic: build(MAP_DEFS.volcanic, MAPS.volcanic.center.y),
  sky: build(MAP_DEFS.sky, MAPS.sky.center.y),
  neon: build(MAP_DEFS.neon, MAPS.neon.center.y),
  glitch: build(MAP_DEFS.glitch, MAPS.glitch.center.y),
}
