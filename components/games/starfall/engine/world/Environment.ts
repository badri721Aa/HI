/**
 * Environment — terrain, sea & lakes, sky, sun/moon light, fog and time of day.
 *
 * Init builds a cached height grid once and derives everything from it: the
 * chunked terrain mesh, the water depth texture and a baked soft terrain-shadow
 * texture. Each frame it only advances shader time, blends the time of day when
 * a transition is running, and keeps the texel-snapped shadow frustum on the player.
 */
import * as THREE from 'three'
import type { V3 } from '../events'
import type { Ctx, IEnvironment, TimeOfDay } from '../types'
import { Atmosphere, PRESETS } from './env/atmosphere'
import { HeightGrid, SunShadowBaker } from './env/heightGrid'
import { buildSeaStacks } from './env/seaStacks'
import { Sky } from './env/sky'
import { buildTerrain, CHUNKS, createTerrainMaterial, type TerrainUniforms } from './env/terrain'
import { buildWater, createWaterMaterial, type WaterUniforms } from './env/water'

/** Grid points per side: 8 chunks × 48 cells (≈1.04 m) + 1. */
const GRID_N = CHUNKS * 48 + 1
/** Distance of the shadow camera from its focus, along the light. */
const SHADOW_DIST = 170
/** Seconds between environment-map refreshes while the time of day blends. */
const ENV_REFRESH = 0.4

const _x = new THREE.Vector3()
const _y = new THREE.Vector3()
const _up = new THREE.Vector3(0, 1, 0)

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

  private uTime = { value: 0 }
  private terrainUniforms: TerrainUniforms | null = null
  private waterUniforms: WaterUniforms | null = null

  /** Live (blended) atmosphere and the endpoints of the running transition. */
  private atmo = new Atmosphere()
  private from = new Atmosphere()
  private to: Atmosphere = PRESETS.dusk
  private blend = 1
  private blendDuration = 0
  private envTimer = 0

  private focus = new THREE.Vector3()
  private shadowKey = ''
  private waterDetail = -1
  private ready = false

  constructor(private ctx: Ctx) {
    this.fog.color = this.fogColor
    this.atmo.copy(PRESETS.dusk)
    this.sun.name = 'sun'
    this.sun.target.name = 'sun-target'
    this.hemi.name = 'sky-fill'
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
    this.add(this.sky.mesh)

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
    this.sky!.uniforms.uTime.value = this.uTime.value

    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt / this.blendDuration)
      const t = this.blend
      this.atmo.lerpBetween(this.from, this.to, t * t * (3 - 2 * t))
      this.applyAtmosphere()
      this.envTimer -= dt
      if (this.envTimer <= 0 || this.blend >= 1) {
        this.envTimer = ENV_REFRESH
        this.refreshEnvironment()
      }
    }
    this.baker!.update(dt)
    this.syncQuality()
  }

  setTimeOfDay(tod: TimeOfDay, seconds: number): void {
    this.to = PRESETS[tod]
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
    if (this.fog.far !== q.viewDistance) {
      this.fog.far = q.viewDistance
      this.fog.near = Math.round(q.viewDistance * 0.35)
    }
    const key = `${q.shadowMapSize}:${q.shadowRadius}`
    if (key !== this.shadowKey) {
      this.shadowKey = key
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
      s.bias = -0.00025
      s.normalBias = 0.045
      s.radius = 2.5
      this.placeSun()
    }
    if (this.waterMat && q.waterDetail !== this.waterDetail) {
      this.waterDetail = q.waterDetail
      this.waterMat.defines = { WATER_DETAIL: q.waterDetail }
      this.waterMat.needsUpdate = true
    }
  }
}
