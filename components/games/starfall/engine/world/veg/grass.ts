/**
 * Grass field around the player.
 *
 * The ground near the player is split into 8 m tiles. Each tile's tufts are
 * generated once (deterministically, so a tile always looks the same) into a
 * pre-allocated slot pool, a few tiles per frame, nearest first. Whenever the
 * tile set or the visible tiles change, the visible tiles' tufts are compacted
 * into one instanced draw — thinned with distance (by a per-tuft rank, faded
 * smoothly in the shader) and shrunk to nothing at the edge of the radius.
 *
 * Blade colour samples the terrain's own grass texture and tint at the tuft, so
 * blades grow out of the ground in exactly its colour and get lighter toward the tip.
 */
import * as THREE from 'three'
import type { QualityProfile } from '../../settings'
import type { TextureLib } from '../../textures'
import { fbm, smoothstep, WORLD_HALF, ZONES } from '../heightfield'
import { CLEARINGS } from '../level'
import type { Blockers } from './blockers'
import { patchFoliageFragment, VEG_VERT_PARS, type VegUniforms } from './materials'
import type { GroundCache } from './ground'
import { hash2, Rng } from './rng'
import { coverAt, newSite } from './site'

const TILE = 8
/** Candidate cells per tile side (0.4 m apart). */
const SUB = 20
/** Fraction of candidate cells used at grassDensity 1 (≈ 3.1 tufts / m²). */
const BASE_FILL = 0.5
const TILES_X = Math.ceil((WORLD_HALF * 2) / TILE)
/** Floats per tuft: aTuft (x, y, z, rank) + aTint (r, g, b, scale). */
const STRIDE = 8
/** Full density out to here, then thinning toward the radius. */
const FULL_RADIUS = 11
const FAR_DENSITY = 0.12
/** Per-frame time budget for generating tiles (ms). */
const GEN_BUDGET = 2.5

const FOREST = ZONES.find(z => z.id === 'forest')!
/** Big clearings (buildings, platforms) keep grass off their footprint. */
const BARE = CLEARINGS.filter(c => c[2] >= 4).map(c => [c[0], c[1], c[2] * 0.78] as const)

/** One tuft: 8 curved blades, 2 segments each, base at the origin. */
function tuftGeometry(): THREE.BufferGeometry {
  const rng = new Rng(4242)
  const pos: number[] = []
  const nrm: number[] = []
  const bl: number[] = []
  const idx: number[] = []
  for (let b = 0; b < 8; b++) {
    const a = rng.range(0, Math.PI * 2)
    const r = rng.range(0.02, 0.2)
    const bx = Math.cos(a) * r
    const bz = Math.sin(a) * r
    const h = rng.range(0.26, 0.5)
    const w = rng.range(0.035, 0.055)
    const la = a + rng.jitter(0.8)
    const lx = Math.cos(la)
    const lz = Math.sin(la)
    const lean = rng.range(0.08, 0.2) * (h / 0.4)
    const sx = -lz
    const sz = lx
    const rnd = rng.next()
    const base = pos.length / 3
    for (let s = 0; s <= 2; s++) {
      const t = s / 2
      const cx = bx + lx * lean * t * t
      const cz = bz + lz * lean * t * t
      const cy = h * t - lean * 0.3 * t * t - 0.03
      const ww = (w / 2) * (1 - t)
      // Face normal of the blade (perpendicular to its width and lean).
      const nx = lx
      const nz = lz
      if (s === 2) {
        pos.push(cx, cy, cz)
        nrm.push(nx, 0.3, nz)
        bl.push(t, rnd)
      } else {
        pos.push(cx - sx * ww, cy, cz - sz * ww, cx + sx * ww, cy, cz + sz * ww)
        nrm.push(nx, 0.3, nz, nx, 0.3, nz)
        bl.push(t, rnd, t, rnd)
      }
    }
    idx.push(base, base + 1, base + 3, base, base + 3, base + 2, base + 2, base + 3, base + 4)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
  g.setAttribute('aBlade', new THREE.Float32BufferAttribute(bl, 2))
  g.setIndex(idx)
  return g
}

const VERT_PARS = /* glsl */ `
attribute vec4 aTuft;
attribute vec4 aTint;
attribute vec2 aBlade;
uniform sampler2D uGrassTex;
uniform sampler2D uGrassNoise;
uniform vec3 uGrass;
varying vec3 vGrassCol;
varying float vGrassT;
`

/**
 * Replaces <beginnormal_vertex>: per-tuft transform + normal. Density thins with
 * distance from the camera (screen size); the field ends at the radius around the player.
 */
const VERT_NORMAL = /* glsl */ `
vec3 gOrigin = aTuft.xyz;
float gDist = distance( gOrigin.xz, uVegPlayer.xz );
float gFar = clamp( ( distance( gOrigin, uVegCam ) - ${FULL_RADIUS.toFixed(1)} ) / ( uGrass.x - ${FULL_RADIUS.toFixed(1)} ), 0.0, 1.0 );
float gDensity = uGrass.y + ( 1.0 - uGrass.y ) * ( 1.0 - gFar ) * ( 1.0 - gFar );
float gKeep = clamp( ( gDensity - aTuft.w ) * 14.0, 0.0, 1.0 );
float gScale = aTint.w * gKeep * ( 1.0 - smoothstep( uGrass.x * 0.8, uGrass.x, gDist ) ) * ( 1.0 + gFar * 0.5 );
float gYaw = fract( sin( dot( gOrigin.xz, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ) * 6.2831;
mat2 gRot = mat2( cos( gYaw ), sin( gYaw ), - sin( gYaw ), cos( gYaw ) );
vec3 objectNormal = vec3( normal );
objectNormal.xz = gRot * objectNormal.xz;
objectNormal = normalize( mix( normalize( objectNormal ), vec3( 0.0, 1.0, 0.0 ), 0.7 ) );
`

/** Replaces <begin_vertex>: world-space blade with wind and the player's push. */
const VERT_POS = /* glsl */ `
vec3 transformed = position * gScale;
transformed.xz = gRot * transformed.xz;
float gT = aBlade.x;
vec3 gWp = gOrigin + transformed;
vec3 gOff = vegWindOffset( gOrigin, gWp, 0.11 * gT * gT * gScale, 0.0 );
vec2 gAway = gWp.xz - uVegPlayer.xz;
float gAd = length( gAway );
float gPush = ( 1.0 - smoothstep( 0.2, 1.05, gAd ) ) * ( 1.0 - smoothstep( 0.5, 1.6, abs( gWp.y - uVegPlayer.y ) ) );
gOff.xz += gAway / max( gAd, 0.001 ) * gPush * 0.32 * gT * gScale;
gOff.y -= gPush * 0.2 * gT * gScale;
transformed = gWp + gOff;
vVegWorld = transformed;
vGrassT = gT;
{
  // Terrain grass albedo at the tuft (same layering as the terrain shader).
  vec2 tUV = vec2( gOrigin.x, - gOrigin.z );
  float nMid = textureLod( uGrassNoise, gOrigin.xz * 0.021 + vec2( 0.31, 0.17 ), 0.0 ).r;
  vec3 g1 = textureLod( uGrassTex, tUV * 0.33, 3.0 ).rgb;
  vec3 g2 = textureLod( uGrassTex, mat2( 0.76, -0.65, 0.65, 0.76 ) * tUV * 0.121 + 0.37, 3.0 ).rgb;
  vGrassCol = mix( g1, g2, smoothstep( 0.4, 0.6, nMid ) ) * mix( 0.78, 1.12, smoothstep( 0.2, 0.8, nMid ) ) * aTint.rgb * ( 0.88 + 0.24 * aBlade.y );
}
`

const FRAG_COLOR = /* glsl */ `
diffuseColor.rgb *= vGrassCol * mix( vec3( 0.5, 0.52, 0.42 ), vec3( 1.16, 1.12, 0.9 ), smoothstep( 0.0, 1.0, vGrassT ) );
`

export class GrassField {
  readonly mesh: THREE.Mesh
  private geo: THREE.InstancedBufferGeometry
  private material: THREE.MeshStandardMaterial
  private aTuft: THREE.InstancedBufferAttribute
  private aTint: THREE.InstancedBufferAttribute
  private uGrass = { value: new THREE.Vector3(52, FAR_DENSITY, 0) }

  // Pool
  private radius = 0
  private perTile = 0
  private slots = 0
  private pool = new Float32Array(0)
  private slotTile = new Int32Array(0)
  private slotCount = new Int32Array(0)
  private slotMinY = new Float32Array(0)
  private slotMaxY = new Float32Array(0)
  private slotVisible = new Uint8Array(0)
  private tileSlot = new Int32Array(TILES_X * TILES_X).fill(-1)
  /** Needed tiles around the player (tile ids) and their nearest-point distances. */
  private needed = new Int32Array(0)
  private neededDist = new Float32Array(0)
  /** Distance from the camera to each needed tile (drives thinning). */
  private neededCam = new Float32Array(0)
  private neededN = 0
  private lastCam = new THREE.Vector3(Infinity, 0, 0)
  private isNeeded = new Uint8Array(TILES_X * TILES_X)
  private perm = new Uint16Array(SUB * SUB)

  private lastTx = Number.NaN
  private lastTz = Number.NaN
  private dirty = true
  private site = newSite()
  private sphere = new THREE.Sphere()
  private blockers: Blockers | null = null

  constructor(private ground: GroundCache, textures: TextureLib, shared: VegUniforms, parent: THREE.Object3D) {
    const rng = new Rng(77)
    for (let i = 0; i < this.perm.length; i++) this.perm[i] = i
    for (let i = this.perm.length - 1; i > 0; i--) {
      const j = rng.int(i + 1)
      const t = this.perm[i]
      this.perm[i] = this.perm[j]
      this.perm[j] = t
    }

    const tuft = tuftGeometry()
    this.geo = new THREE.InstancedBufferGeometry()
    this.geo.index = tuft.index
    for (const k of ['position', 'normal', 'aBlade']) this.geo.setAttribute(k, tuft.getAttribute(k))
    this.aTuft = new THREE.InstancedBufferAttribute(new Float32Array(4), 4)
    this.aTint = new THREE.InstancedBufferAttribute(new Float32Array(4), 4)
    this.geo.setAttribute('aTuft', this.aTuft)
    this.geo.setAttribute('aTint', this.aTint)
    this.geo.instanceCount = 0

    const uniforms = {
      ...shared,
      uGrass: this.uGrass,
      uGrassTex: { value: textures.get('grass_albedo') },
      uGrassNoise: { value: textures.get('noise') },
      uVegFade: { value: new THREE.Vector3(1e6, 2e6, 1) },
      uVegPush: { value: 0 },
      uVegTrans: { value: 0.55 },
      uVegMoss: { value: 0 },
      uVegNoise: { value: textures.get('noise') },
    }
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0, side: THREE.DoubleSide })
    mat.name = 'veg:grass'
    mat.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, uniforms)
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${VEG_VERT_PARS}\n${VERT_PARS}`)
        .replace('#include <beginnormal_vertex>', VERT_NORMAL)
        .replace('#include <begin_vertex>', VERT_POS)
      shader.fragmentShader = patchFoliageFragment(shader.fragmentShader, true)
        .replace('#include <common>', '#include <common>\nvarying vec3 vGrassCol;\nvarying float vGrassT;')
        .replace('#include <color_fragment>', FRAG_COLOR)
    }
    mat.customProgramCacheKey = () => 'starfall.veg.grass.v1'
    this.material = mat

    this.mesh = new THREE.Mesh(this.geo, mat)
    this.mesh.name = 'veg:grass'
    this.mesh.frustumCulled = false
    this.mesh.matrixAutoUpdate = false
    this.mesh.receiveShadow = true
    this.mesh.castShadow = false
    parent.add(this.mesh)
  }

  /** (Re)allocates the pool for the quality's radius and density. */
  private configure(q: QualityProfile): void {
    // Drop the old GPU buffers before swapping in differently sized ones.
    if (this.slots) this.geo.dispose()
    this.radius = q.grassRadius
    this.perTile = Math.max(8, Math.round(SUB * SUB * BASE_FILL * q.grassDensity))
    const reach = this.radius + TILE * 0.75
    this.slots = Math.ceil(((Math.PI * reach * reach) / (TILE * TILE)) * 1.2) + 12
    this.pool = new Float32Array(this.slots * this.perTile * STRIDE)
    this.slotTile = new Int32Array(this.slots).fill(-1)
    this.slotCount = new Int32Array(this.slots)
    this.slotMinY = new Float32Array(this.slots)
    this.slotMaxY = new Float32Array(this.slots)
    this.slotVisible = new Uint8Array(this.slots)
    this.tileSlot.fill(-1)
    const span = Math.ceil(reach / TILE) * 2 + 2
    this.needed = new Int32Array(span * span)
    this.neededDist = new Float32Array(span * span)
    this.neededCam = new Float32Array(span * span)
    this.isNeeded.fill(0)
    const cap = this.slots * this.perTile
    this.aTuft = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4)
    this.aTint = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4)
    this.aTuft.setUsage(THREE.DynamicDrawUsage)
    this.aTint.setUsage(THREE.DynamicDrawUsage)
    this.geo.setAttribute('aTuft', this.aTuft)
    this.geo.setAttribute('aTint', this.aTint)
    this.geo.instanceCount = 0
    this.uGrass.value.x = this.radius
    this.lastTx = Number.NaN
    this.dirty = true
  }

  /** Keep tufts out of landmark solids from now on; regenerates every resident tile. */
  setBlockers(b: Blockers): void {
    this.blockers = b
    this.slotTile.fill(-1)
    this.tileSlot.fill(-1)
    this.slotCount.fill(0)
    this.slotVisible.fill(0)
    this.dirty = true
  }

  /** Generates every tile within `r` of (x, z) right away. */
  prewarm(q: QualityProfile, x: number, z: number, r: number): void {
    if (q.grassRadius !== this.radius || this.perTile !== Math.max(8, Math.round(SUB * SUB * BASE_FILL * q.grassDensity))) this.configure(q)
    this.collectNeeded(x, z)
    for (let k = 0; k < this.neededN; k++) {
      if (this.neededDist[k] > r) continue
      const id = this.needed[k]
      if (this.tileSlot[id] < 0 && !this.generate(id)) break
    }
  }

  update(q: QualityProfile, px: number, pz: number, cam: THREE.Vector3, frustum: THREE.Frustum): void {
    if (q.grassDensity <= 0 || q.grassRadius <= 0) {
      this.mesh.visible = false
      return
    }
    if (q.grassRadius !== this.radius || this.perTile !== Math.max(8, Math.round(SUB * SUB * BASE_FILL * q.grassDensity))) this.configure(q)
    this.mesh.visible = true

    const tx = Math.floor(px / TILE)
    const tz = Math.floor(pz / TILE)
    if (tx !== this.lastTx || tz !== this.lastTz) {
      this.lastTx = tx
      this.lastTz = tz
      this.collectNeeded(px, pz)
      this.dirty = true
    }

    // Stream in missing tiles, nearest first, within the time budget.
    const t0 = performance.now()
    for (let guard = 0; guard < 16; guard++) {
      let best = -1
      let bestD = Infinity
      for (let k = 0; k < this.neededN; k++) {
        if (this.tileSlot[this.needed[k]] >= 0) continue
        if (this.neededDist[k] < bestD) {
          bestD = this.neededDist[k]
          best = this.needed[k]
        }
      }
      if (best < 0 || !this.generate(best)) break
      this.dirty = true
      if (performance.now() - t0 > GEN_BUDGET) break
    }

    if (cam.distanceToSquared(this.lastCam) > 4) {
      this.lastCam.copy(cam)
      this.dirty = true
    }

    // Visibility of resident tiles, and their distance from the camera.
    for (let k = 0; k < this.neededN; k++) {
      const s = this.tileSlot[this.needed[k]]
      if (s < 0) continue
      const id = this.needed[k]
      const cx = ((id % TILES_X) + 0.5) * TILE - WORLD_HALF
      const cz = (Math.floor(id / TILES_X) + 0.5) * TILE - WORLD_HALF
      this.sphere.center.set(cx, (this.slotMinY[s] + this.slotMaxY[s]) * 0.5, cz)
      this.sphere.radius = TILE * 0.72 + (this.slotMaxY[s] - this.slotMinY[s]) * 0.5 + 0.8
      this.neededCam[k] = Math.max(0, this.sphere.distanceToPoint(cam))
      const v = this.slotCount[s] > 0 && frustum.intersectsSphere(this.sphere) ? 1 : 0
      if (v !== this.slotVisible[s]) {
        this.slotVisible[s] = v
        this.dirty = true
      }
    }
    if (this.dirty) this.compact()
  }

  private collectNeeded(px: number, pz: number): void {
    for (let k = 0; k < this.neededN; k++) this.isNeeded[this.needed[k]] = 0
    const reach = this.radius + 1
    const t0x = Math.floor((px - reach + WORLD_HALF) / TILE)
    const t1x = Math.floor((px + reach + WORLD_HALF) / TILE)
    const t0z = Math.floor((pz - reach + WORLD_HALF) / TILE)
    const t1z = Math.floor((pz + reach + WORLD_HALF) / TILE)
    let n = 0
    for (let j = Math.max(0, t0z); j <= Math.min(TILES_X - 1, t1z); j++) {
      for (let i = Math.max(0, t0x); i <= Math.min(TILES_X - 1, t1x); i++) {
        const x0 = i * TILE - WORLD_HALF
        const z0 = j * TILE - WORLD_HALF
        const dx = Math.max(x0 - px, 0, px - (x0 + TILE))
        const dz = Math.max(z0 - pz, 0, pz - (z0 + TILE))
        const d = Math.sqrt(dx * dx + dz * dz)
        if (d > reach || n >= this.needed.length) continue
        const id = j * TILES_X + i
        this.needed[n] = id
        this.neededDist[n] = d
        this.isNeeded[id] = 1
        n++
      }
    }
    this.neededN = n
  }

  /** Fills a slot with a tile's tufts (evicting a tile that is no longer needed). False if the pool is full. */
  private generate(id: number): boolean {
    let slot = -1
    for (let s = 0; s < this.slots; s++) {
      const t = this.slotTile[s]
      if (t < 0 || !this.isNeeded[t]) {
        slot = s
        break
      }
    }
    if (slot < 0) return false
    const old = this.slotTile[slot]
    if (old >= 0) this.tileSlot[old] = -1
    this.slotTile[slot] = id
    this.tileSlot[id] = slot
    this.slotVisible[slot] = 0

    const ti = id % TILES_X
    const tj = Math.floor(id / TILES_X)
    const x0 = ti * TILE - WORLD_HALF
    const z0 = tj * TILE - WORLD_HALF
    const cx = x0 + TILE / 2
    const cz = z0 + TILE / 2
    // Slow terrain tint terms (mirrors the terrain shader's lushness), once per tile.
    const lushBase = fbm(cx * 0.011 + 1.3, cz * 0.011 - 4.2, 3) * 0.9
    const nBig = 0.5 + fbm(cx * 0.0045 - 3.3, cz * 0.0045 + 8.1, 3) * 0.9
    const fdx = cx - FOREST.x
    const fdz = cz - FOREST.z
    const forestT = 1 - smoothstep(FOREST.r * 0.6, FOREST.r * 1.15, Math.sqrt(fdx * fdx + fdz * fdz))
    let bare = false
    for (const c of BARE) {
      const dx = Math.max(Math.abs(cx - c[0]) - TILE / 2, 0)
      const dz = Math.max(Math.abs(cz - c[1]) - TILE / 2, 0)
      if (dx * dx + dz * dz < c[2] * c[2]) bare = true
    }
    // Landmark solids overlapping this tile (null when there are none).
    const blockers = this.blockers && this.blockers.gather(cx, cz, TILE * 0.75) > 0 ? this.blockers : null

    const s = this.site
    const pool = this.pool
    let o = slot * this.perTile * STRIDE
    let n = 0
    let minY = Infinity
    let maxY = -Infinity
    const flip = hash2(ti, tj, 5)
    const K = this.perTile
    const cell = TILE / SUB
    for (let k = 0; k < K; k++) {
      let ci = this.perm[k] % SUB
      let cj = Math.floor(this.perm[k] / SUB)
      if (flip < 0.5) {
        const t = ci
        ci = cj
        cj = t
      }
      if (flip > 0.25 && flip < 0.75) ci = SUB - 1 - ci
      const x = x0 + (ci + 0.1 + 0.8 * hash2(id, k, 11)) * cell
      const z = z0 + (cj + 0.1 + 0.8 * hash2(id, k, 13)) * cell
      const grass = coverAt(this.ground, x, z, s)
      if (grass < 0.25 || grass < hash2(id, k, 17) * 0.5 + 0.25) continue
      if (bare && this.inBare(x, z)) continue
      if (blockers && blockers.hits(x, z, 0.12, s.h + 0.02, s.h + 0.45)) continue
      const highland = smoothstep(9, 18, s.h)
      const lush = Math.max(-1, Math.min(1, lushBase + forestT * 0.55 - highland * 0.35 - (1 - smoothstep(2, 4, s.hw)) * 0.3 + (nBig - 0.5) * 0.9))
      const k1 = nBig * 0.36 + 0.82
      let r: number
      let g: number
      let b: number
      if (lush > 0) {
        r = 1 + (0.74 - 1) * lush
        g = 1 + (0.94 - 1) * lush
        b = 1 + (0.72 - 1) * lush
      } else {
        r = 1 + 0.28 * -lush
        g = 1 + 0.08 * -lush
        b = 1 - 0.38 * -lush
      }
      const h = s.h
      pool[o] = x
      pool[o + 1] = h
      pool[o + 2] = z
      pool[o + 3] = (k + 0.5) / K
      pool[o + 4] = r * k1 * 0.92
      pool[o + 5] = g * k1 * 0.92
      pool[o + 6] = b * k1 * 0.92
      // Taller in lush meadows, shorter where the grass thins out.
      pool[o + 7] = (0.7 + 0.55 * hash2(id, k, 19)) * (0.75 + 0.25 * smoothstep(0.25, 0.8, grass)) * (1 + Math.max(0, lush) * 0.25)
      if (h < minY) minY = h
      if (h > maxY) maxY = h
      o += STRIDE
      n++
    }
    this.slotCount[slot] = n
    this.slotMinY[slot] = n ? minY : 0
    this.slotMaxY[slot] = n ? maxY + 0.6 : 0
    return true
  }

  private inBare(x: number, z: number): boolean {
    for (const c of BARE) {
      const dx = x - c[0]
      const dz = z - c[1]
      if (dx * dx + dz * dz < c[2] * c[2]) return true
    }
    return false
  }

  /** Copies the visible tiles' tufts (thinned by distance) into the instance buffers. */
  private compact(): void {
    this.dirty = false
    const a = this.aTuft.array as Float32Array
    const b = this.aTint.array as Float32Array
    const pool = this.pool
    const span = this.radius - FULL_RADIUS
    let n = 0
    for (let k = 0; k < this.neededN; k++) {
      const s = this.tileSlot[this.needed[k]]
      if (s < 0 || !this.slotVisible[s]) continue
      // Same thinning curve as the shader, at the tile's nearest point (an upper bound).
      const t = Math.min(1, Math.max(0, (this.neededCam[k] - FULL_RADIUS) / span))
      const limit = FAR_DENSITY + (1 - FAR_DENSITY) * (1 - t) * (1 - t) + 0.05
      let o = s * this.perTile * STRIDE
      for (let i = 0, e = this.slotCount[s]; i < e; i++, o += STRIDE) {
        if (pool[o + 3] > limit) break
        const q = n * 4
        a[q] = pool[o]
        a[q + 1] = pool[o + 1]
        a[q + 2] = pool[o + 2]
        a[q + 3] = pool[o + 3]
        b[q] = pool[o + 4]
        b[q + 1] = pool[o + 5]
        b[q + 2] = pool[o + 6]
        b[q + 3] = pool[o + 7]
        n++
      }
    }
    this.geo.instanceCount = n
    if (n > 0) {
      upload(this.aTuft, n * 4)
      upload(this.aTint, n * 4)
    }
  }

  get tufts(): number {
    return this.geo.instanceCount
  }

  get triangles(): number {
    return ((this.geo.index?.count ?? 0) / 3) * this.geo.instanceCount
  }

  dispose(): void {
    this.mesh.removeFromParent()
    this.geo.dispose()
    this.material.dispose()
  }
}

function upload(attr: THREE.InstancedBufferAttribute, count: number): void {
  attr.clearUpdateRanges()
  attr.addUpdateRange(0, count)
  attr.needsUpdate = true
}
