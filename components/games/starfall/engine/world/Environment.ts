/**
 * Environment — terrain, sea & lakes, sky, sun/moon light, fog and time of day.
 *
 * Init builds a cached height grid once and derives everything from it: the
 * chunked terrain mesh, the water depth texture and a baked soft terrain-shadow
 * texture. Each frame it only advances shader time, blends the time of day when
 * a transition is running, and keeps the texel-snapped shadow frustum on the player.
 *
 * The island's evening follows the story: it starts at golden dusk and deepens toward a starlit
 * night with every star shard found (see EVENING in env/atmosphere.ts), read straight from the
 * save so a continued game comes back at the right hour. Cutscenes that set the time of day
 * themselves (the dusk opening, night → dawn at the Beacon) keep it until they end; a finished
 * story stays at dawn, and the title screen shows the blue hour.
 *
 * Light beyond the sun and sky: the haze's height falloff and glow and the characters' rim light
 * live in three's fog chunk (env/air.ts), and lanterns, windows and fires registered with
 * addLight() share a small pool of real point lights (env/localLights.ts).
 */
import * as THREE from 'three'
import type { MapId, V3 } from '../events'
import type { Ctx, IEnvironment, LightAnchor, LightAnchorOpts, TimeOfDay } from '../types'
import { AIR, installAir, uninstallAir } from './env/air'
import { Atmosphere, BLUE_HOUR, EVENING, MAP_PRESETS, PRESETS } from './env/atmosphere'
import { HeightGrid, SunShadowBaker } from './env/heightGrid'
import { LocalLights } from './env/localLights'
import { buildSeaStacks } from './env/seaStacks'
import { Sky } from './env/sky'
import { buildTerrain, CHUNKS, createTerrainMaterial, type TerrainUniforms } from './env/terrain'
import { buildWater, createWaterMaterial, type WaterUniforms } from './env/water'

/** Grid points per side: 8 chunks × 48 cells (≈1.04 m) + 1. */
const GRID_N = CHUNKS * 48 + 1
/** Distance of the shadow camera from its focus, along the light. */
const SHADOW_DIST = 170
/** Environment-map refreshes while the time of day blends: this many per blend, at least this far apart (s). */
const ENV_REFRESHES = 12
const ENV_REFRESH_MIN = 0.4
/** Seconds the evening takes to deepen after a shard is found, and to settle behind the title screen. */
const EVENING_BLEND = 14
const TITLE_BLEND = 2.5
/** Shadow penumbra (m) by quality, and the filter radius range (shadow-map texels) it may ask for. */
const SHADOW_SOFTNESS = { low: 0.14, medium: 0.14, high: 0.17, ultra: 0.17 }
const SHADOW_RADIUS: [number, number] = [1.5, 4]
/** The moon's own glow in the haze. */
const MOON_HAZE = new THREE.Color(0.027, 0.034, 0.056)
/** Local lights are chosen around a point this far ahead of the camera (m). */
const LIGHT_FOCUS = 6

const _x = new THREE.Vector3()
const _y = new THREE.Vector3()
const _up = new THREE.Vector3(0, 1, 0)
const _glow = new THREE.Color()
const _mixed = new THREE.Color()
const _fogOut = new THREE.Color()

export class Environment implements IEnvironment {
  readonly sun = new THREE.DirectionalLight(0xffffff, 3)
  readonly sunDirection = new THREE.Vector3(0, 1, 0)
  readonly fogColor = new THREE.Color()

  private hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1)
  private fog = new THREE.Fog(0xffffff, 60, 420)
  private baker: SunShadowBaker | null = null
  private sky: Sky | null = null
  private heightTex: THREE.DataTexture | null = null
  private terrainMat: THREE.MeshStandardMaterial | null = null
  private waterMat: THREE.MeshStandardMaterial | null = null
  private objects: THREE.Object3D[] = []
  private geometries: THREE.BufferGeometry[] = []
  private envTex: THREE.Texture | null = null
  private lights: LocalLights

  private uTime = { value: 0 }
  private terrainUniforms: TerrainUniforms | null = null
  private waterUniforms: WaterUniforms | null = null

  /** Live (blended) atmosphere and the endpoints of the running transition. */
  private atmo = new Atmosphere()
  private from = new Atmosphere()
  private to: Atmosphere = EVENING[BLUE_HOUR]
  private blend = 1
  private blendDuration = 0
  private envTimer = 0
  /** The look a cutscene asked for with setTimeOfDay; it holds until that cutscene ends. */
  private scripted: Atmosphere | null = null
  /** The menus were showing on the last update (a game starting from there cuts to its hour). */
  private inMenu = true
  /** The map whose look is showing. */
  private map: MapId = 'isle'

  private focus = new THREE.Vector3()
  /** Shadow settings the light was last configured for (re-read from ctx.quality). */
  private shadowSize = 0
  private shadowRadius = 0
  private waterDetail = -1
  private skyLevel = ''
  private ready = false

  constructor(private ctx: Ctx) {
    this.fog.color = this.fogColor
    this.atmo.copy(this.to)
    this.sun.name = 'sun'
    this.sun.target.name = 'sun-target'
    this.hemi.name = 'sky-fill'
    // Before any shader compiles: the haze goes into three's fog chunk, and the light pool must
    // be in the scene from the first frame.
    installAir()
    this.lights = new LocalLights(ctx.scene)
  }

  async init(): Promise<void> {
    const { ctx } = this
    const { scene, renderer, textures } = ctx

    const grid = new HeightGrid(GRID_N)
    await grid.build(f => ctx.progress(f * 0.62, 'Raising the island'))

    const baker = new SunShadowBaker(grid)
    baker.bakeNow(this.atmo.lightDir)
    this.baker = baker
    ctx.progress(0.7, 'Shaping the hills')

    this.heightTex = grid.createTexture()
    this.terrainUniforms = { uTime: this.uTime, uCaustic: { value: new THREE.Color() }, ...baker.uniforms }
    this.waterUniforms = {
      uTime: this.uTime,
      uShallow: { value: new THREE.Color() },
      uDeep: { value: new THREE.Color() },
      ...baker.uniforms,
    }

    this.terrainMat = createTerrainMaterial(textures, this.terrainUniforms)
    const terrain = buildTerrain(grid, this.terrainMat)
    this.add(terrain.group)
    this.geometries.push(...terrain.geometries)
    ctx.progress(0.86, 'Filling the sea')

    this.waterDetail = ctx.quality.waterDetail
    this.waterMat = createWaterMaterial(textures, grid, this.heightTex, this.waterUniforms, this.waterDetail)
    const water = buildWater(this.waterMat)
    this.add(water.group)
    this.geometries.push(...water.geometries)

    const stacks = buildSeaStacks(this.terrainMat)
    if (stacks) {
      this.add(stacks)
      this.geometries.push(stacks.geometry)
    }

    this.sky = new Sky(textures, renderer)
    this.add(this.sky.group)

    this.sun.castShadow = ctx.quality.shadows
    this.add(this.sun, this.sun.target, this.hemi)
    scene.fog = this.fog
    scene.background = null

    this.syncQuality()
    this.applyAtmosphere()
    this.refreshEnvironment()
    this.ready = true
    ctx.progress(1)
  }

  update(dt: number): void {
    if (!this.ready) return
    this.uTime.value += dt
    this.sky!.update(dt, this.uTime.value, this.ctx.camera)
    this.followStory()

    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt / this.blendDuration)
      const t = this.blend
      this.atmo.lerpBetween(this.from, this.to, t * t * (3 - 2 * t))
      this.applyAtmosphere()
      this.envTimer -= dt
      if (this.envTimer <= 0 || this.blend >= 1) {
        this.envTimer = Math.max(ENV_REFRESH_MIN, this.blendDuration / ENV_REFRESHES)
        this.refreshEnvironment()
      }
    }
    this.baker!.update(dt)
    this.syncQuality()
    this.applyAir()
    const camera = this.ctx.camera
    _y.copy(camera.position).addScaledVector(camera.getWorldDirection(_x), LIGHT_FOCUS)
    this.lights.update(dt, this.uTime.value, _y, this.atmo.localLight)
  }

  addLight(x: number, y: number, z: number, opts?: LightAnchorOpts): LightAnchor {
    return this.lights.add(x, y, z, opts)
  }

  removeLight(anchor: LightAnchor): void {
    this.lights.remove(anchor)
  }

  /** 0..1 how far the look leans from warm evening to cool moonlit night (the colour grade follows it). */
  get night(): number {
    return this.atmo.night
  }

  setTimeOfDay(tod: TimeOfDay, seconds: number): void {
    this.scripted = PRESETS[tod]
    // Away from the island the map keeps its own look; this applies on the way back.
    if (this.map !== 'isle') return
    this.blendTo(this.scripted, seconds)
  }

  setAtmosphere(map: MapId, seconds: number): void {
    this.map = map
    this.blendTo(map === 'isle' ? this.isleLook() : MAP_PRESETS[map], seconds)
  }

  /** The island's look right now: what a running cutscene set, else the hour the story has reached. */
  private isleLook(): Atmosphere {
    if (this.scripted) return this.scripted
    const game = this.ctx.game
    if (game.phase === 'title' || game.phase === 'loading') return EVENING[BLUE_HOUR]
    const save = game.save
    if (save.completed) return PRESETS.dawn
    let shards = 0
    for (let i = 0; i < save.shards.length; i++) if (save.shards[i]) shards++
    // A Creative world is for stargazing too: it never starts earlier than the blue hour.
    if (game.creative) shards = Math.max(shards, BLUE_HOUR)
    return EVENING[Math.min(shards, EVENING.length - 1)]
  }

  /** Eases the island toward the hour the story has reached (cuts to it when a game starts). */
  private followStory(): void {
    const phase = this.ctx.game.phase
    const menu = phase === 'title' || phase === 'loading'
    const fromMenu = this.inMenu && !menu
    this.inMenu = menu
    // A cutscene that set the time of day keeps it until it is over.
    if (this.scripted && phase === 'cutscene') return
    this.scripted = null
    if (this.map !== 'isle') return
    const look = this.isleLook()
    if (look !== this.to) this.blendTo(look, fromMenu ? 0 : menu ? TITLE_BLEND : EVENING_BLEND)
  }

  private blendTo(to: Atmosphere, seconds: number): void {
    // Already there (e.g. the intro re-asserting dusk): nothing to re-bake.
    if (this.to === to && this.blend >= 1) return
    this.to = to
    this.from.copy(this.atmo)
    if (!this.ready) {
      // Before init: just start from the requested preset.
      this.atmo.copy(this.to)
      this.blend = 1
      return
    }
    if (seconds <= 0) {
      this.atmo.copy(this.to)
      this.blend = 1
      this.applyAtmosphere()
      this.refreshEnvironment()
      this.baker!.bakeNow(this.to.lightDir)
      return
    }
    this.blend = 0
    this.blendDuration = seconds
    this.envTimer = 0
    this.baker!.begin(this.to.lightDir, seconds * 0.75)
  }

  setShadowFocus(p: V3): void {
    this.focus.set(p.x, p.y, p.z)
    this.placeSun()
  }

  dispose(): void {
    this.ready = false
    const { scene } = this.ctx
    for (const o of this.objects) scene.remove(o)
    this.objects.length = 0
    for (const g of this.geometries) g.dispose()
    this.geometries.length = 0
    this.terrainMat?.dispose()
    this.waterMat?.dispose()
    this.heightTex?.dispose()
    this.baker?.dispose()
    this.sky?.dispose()
    this.sun.shadow.map?.dispose()
    this.sun.dispose()
    this.hemi.dispose()
    this.lights.dispose()
    uninstallAir()
    if (scene.environment === this.envTex) scene.environment = null
    if (scene.fog === this.fog) scene.fog = null
    this.envTex = null
  }

  /* ── internals ───────────────────────────────────────────── */

  private add(...objs: THREE.Object3D[]): void {
    for (const o of objs) {
      this.ctx.scene.add(o)
      this.objects.push(o)
    }
  }

  /** Pushes the live atmosphere into lights, fog, sky, materials and exposure. */
  private applyAtmosphere(): void {
    const a = this.atmo
    const { scene, renderer } = this.ctx
    this.sunDirection.copy(a.lightDir)
    this.sun.color.copy(a.lightColor)
    this.sun.intensity = a.lightIntensity
    this.hemi.color.copy(a.hemiSky)
    this.hemi.groundColor.copy(a.hemiGround)
    this.hemi.intensity = a.hemiIntensity
    this.fogColor.copy(a.fog)
    scene.environmentIntensity = a.envIntensity
    renderer.toneMappingExposure = a.exposure
    this.sky?.apply(a)
    if (this.terrainUniforms) this.terrainUniforms.uCaustic.value.copy(a.lightColor).multiplyScalar(a.caustics * a.lightIntensity)
    if (this.waterUniforms) {
      this.waterUniforms.uShallow.value.copy(a.waterShallow)
      this.waterUniforms.uDeep.value.copy(a.waterDeep)
    }
    this.placeSun()
  }

  /**
   * The haze's glow toward the sun and moon, its height falloff and the characters' rim light,
   * for every fogged shader (env/air.ts). Runs each frame: 20 floats.
   */
  private applyAir(): void {
    const a = this.atmo
    // three mixes fog in after tone mapping: in display colours when drawing straight to the
    // canvas ('low'), in linear light inside the post chain. The glows must be in the same space.
    const direct = this.ctx.renderer.getRenderTarget() === null
    if (direct) _fogOut.copyLinearToSRGB(this.fogColor)
    this.writeGlow(4, _glow.copy(a.halo).multiplyScalar(a.fogGlow * a.sunDisc), direct)
    this.writeGlow(12, _glow.copy(MOON_HAZE).multiplyScalar(a.moon * a.moonlit), direct)
    AIR[0] = a.sunDir.x
    AIR[1] = a.sunDir.y
    AIR[2] = a.sunDir.z
    AIR[3] = a.fogHeight
    AIR[7] = a.fogBase
    AIR[8] = a.moonDir.x
    AIR[9] = a.moonDir.y
    AIR[10] = a.moonDir.z
    _mixed.copy(a.hemiSky).lerp(a.lightColor, 0.4).multiplyScalar(a.rim)
    AIR[16] = _mixed.r
    AIR[17] = _mixed.g
    AIR[18] = _mixed.b
  }

  /** Stores a glow (linear) at AIR[at..at+2] as what it adds to the fog colour in the space fog is mixed in. */
  private writeGlow(at: number, glow: THREE.Color, direct: boolean): void {
    if (direct) glow.add(this.fogColor).convertLinearToSRGB().sub(_fogOut)
    AIR[at] = glow.r
    AIR[at + 1] = glow.g
    AIR[at + 2] = glow.b
  }

  private refreshEnvironment(): void {
    if (!this.sky) return
    this.envTex = this.sky.renderEnvironment()
    this.ctx.scene.environment = this.envTex
  }

  /**
   * Positions the light so its orthographic shadow frustum is centred on the
   * focus, snapped to whole shadow-map texels in light space (no shimmering).
   */
  private placeSun(): void {
    const q = this.ctx.quality
    const dir = this.sunDirection
    const texel = (q.shadowRadius * 2) / q.shadowMapSize
    _x.crossVectors(_up, dir).normalize()
    _y.crossVectors(dir, _x)
    const px = this.focus.dot(_x)
    const py = this.focus.dot(_y)
    const sx = Math.round(px / texel) * texel - px
    const sy = Math.round(py / texel) * texel - py
    const target = this.sun.target.position
    target.copy(this.focus).addScaledVector(_x, sx).addScaledVector(_y, sy)
    this.sun.position.copy(target).addScaledVector(dir, SHADOW_DIST)
  }

  /** Re-reads the quality knobs this module honours (cheap; runs every frame). */
  private syncQuality(): void {
    const q = this.ctx.quality
    const far = Math.round(q.viewDistance * this.atmo.fogScale)
    this.fog.far = far
    this.fog.near = Math.round(far * this.atmo.fogNear)
    if (q.shadowMapSize !== this.shadowSize || q.shadowRadius !== this.shadowRadius) {
      this.shadowSize = q.shadowMapSize
      this.shadowRadius = q.shadowRadius
      const s = this.sun.shadow
      s.mapSize.set(q.shadowMapSize, q.shadowMapSize)
      s.map?.dispose()
      s.map = null
      const cam = s.camera
      cam.left = -q.shadowRadius
      cam.right = q.shadowRadius
      cam.top = q.shadowRadius
      cam.bottom = -q.shadowRadius
      cam.near = 1
      cam.far = SHADOW_DIST * 2
      cam.updateProjectionMatrix()
      // The same soft edge in metres at every preset (sharper maps just resolve it better), and
      // a normal offset that grows with the texel so coarse maps do not self-shadow.
      const texel = (q.shadowRadius * 2) / q.shadowMapSize
      s.bias = -0.00025
      s.normalBias = Math.min(0.07, Math.max(0.03, texel * 0.9))
      s.radius = Math.min(SHADOW_RADIUS[1], Math.max(SHADOW_RADIUS[0], SHADOW_SOFTNESS[q.level] / texel))
      this.placeSun()
    }
    if (q.level !== this.skyLevel) {
      this.skyLevel = q.level
      this.sky?.setQuality(q.level)
      this.lights.setQuality(q.level)
    }
    if (this.waterMat && q.waterDetail !== this.waterDetail) {
      this.waterDetail = q.waterDetail
      this.waterMat.defines = { WATER_DETAIL: q.waterDetail }
      this.waterMat.needsUpdate = true
    }
  }
}
