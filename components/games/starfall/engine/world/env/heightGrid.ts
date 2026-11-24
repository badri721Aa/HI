/**
 * Cached terrain heights on a regular grid over ±WORLD_HALF, plus the GPU
 * resources derived from it: a height texture (water depth / shore foam) and
 * a baked "sun visibility" texture (soft terrain self-shadowing from the low
 * sun, re-baked incrementally when the time of day changes).
 */
import * as THREE from 'three'
import { heightAt, waterLevelAt, WORLD_HALF } from '../heightfield'

export class HeightGrid {
  /** Samples per side. */
  readonly n: number
  /** Metres between samples. */
  readonly cell: number
  readonly h: Float32Array
  maxHeight = -Infinity

  constructor(n: number) {
    this.n = n
    this.cell = (WORLD_HALF * 2) / (n - 1)
    this.h = new Float32Array(n * n)
  }

  /** World coordinate of grid index i (x) or j (z). */
  coord(i: number): number {
    return -WORLD_HALF + i * this.cell
  }

  /** Fills the grid in row slices, yielding to the browser so the loading bar keeps moving. */
  async build(onProgress: (f: number) => void): Promise<void> {
    const { n, h } = this
    const rowsPerSlice = 40
    let max = -Infinity
    for (let j0 = 0; j0 < n; j0 += rowsPerSlice) {
      const j1 = Math.min(n, j0 + rowsPerSlice)
      for (let j = j0; j < j1; j++) {
        const z = this.coord(j)
        for (let i = 0; i < n; i++) {
          const v = heightAt(this.coord(i), z)
          h[j * n + i] = v
          if (v > max) max = v
        }
      }
      onProgress(j1 / n)
      await new Promise(r => setTimeout(r, 0))
    }
    this.maxHeight = max
  }

  /** Height at grid index (clamped to the grid). */
  at(i: number, j: number): number {
    const n = this.n
    i = i < 0 ? 0 : i >= n ? n - 1 : i
    j = j < 0 ? 0 : j >= n ? n - 1 : j
    return this.h[j * n + i]
  }

  /** Bilinear height at world (x, z), clamped at the grid edge. */
  sample(x: number, z: number): number {
    const n = this.n
    let gx = (x + WORLD_HALF) / this.cell
    let gz = (z + WORLD_HALF) / this.cell
    const lim = n - 1.0001
    gx = gx < 0 ? 0 : gx > lim ? lim : gx
    gz = gz < 0 ? 0 : gz > lim ? lim : gz
    const i = gx | 0
    const j = gz | 0
    const fx = gx - i
    const fz = gz - j
    const k = j * n + i
    const h = this.h
    const a = h[k] + (h[k + 1] - h[k]) * fx
    const b = h[k + n] + (h[k + n + 1] - h[k + n]) * fx
    return a + (b - a) * fz
  }

  /**
   * Half-float height texture; texel (i, j) holds the height at grid point (i, j).
   * Shaders map world → uv with `heightUv()` (see water.ts).
   */
  createTexture(): THREE.DataTexture {
    const { n, h } = this
    const data = new Uint16Array(n * n)
    for (let k = 0; k < n * n; k++) data[k] = THREE.DataUtils.toHalfFloat(h[k])
    const tex = new THREE.DataTexture(data, n, n, THREE.RedFormat, THREE.HalfFloatType)
    tex.minFilter = THREE.LinearFilter
    tex.magFilter = THREE.LinearFilter
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
    tex.generateMipmaps = false
    tex.needsUpdate = true
    return tex
  }
}

/**
 * Bakes how much of the sun each ground point sees (0..1) by marching the
 * height grid toward the light and tracking the steepest horizon angle.
 * The penumbra is measured in angle, so shadows soften with distance like real ones.
 *
 * Two textures are kept so a new bake can cross-fade over the old one:
 * shaders read `mix(A, B, uSunVisMix)`.
 */
export class SunShadowBaker {
  readonly size: number
  readonly uniforms = {
    tSunVisA: { value: null as THREE.DataTexture | null },
    tSunVisB: { value: null as THREE.DataTexture | null },
    uSunVisMix: { value: 0 },
  }
  private textures: [THREE.DataTexture, THREE.DataTexture]
  /** Index of the texture currently bound to A. */
  private front = 0
  private row = -1
  private dx = 0
  private dz = 0
  private tanE = 1
  private fade = 0
  private fadeSpeed = 1

  constructor(private grid: HeightGrid, size = 320) {
    this.size = size
    const make = () => {
      const tex = new THREE.DataTexture(new Uint8Array(size * size).fill(255), size, size, THREE.RedFormat, THREE.UnsignedByteType)
      tex.minFilter = THREE.LinearFilter
      tex.magFilter = THREE.LinearFilter
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
      tex.generateMipmaps = false
      tex.needsUpdate = true
      return tex
    }
    this.textures = [make(), make()]
    this.uniforms.tSunVisA.value = this.textures[0]
    this.uniforms.tSunVisB.value = this.textures[1]
  }

  /** Bakes `dir` immediately into the front texture (used at init and for instant time changes). */
  bakeNow(dir: THREE.Vector3): void {
    this.setDir(dir)
    const tex = this.textures[this.front]
    const data = tex.image.data as Uint8Array
    for (let j = 0; j < this.size; j++) this.bakeRow(j, data)
    tex.needsUpdate = true
    this.row = -1
    this.fade = 0
    this.uniforms.uSunVisMix.value = 0
    this.uniforms.tSunVisA.value = tex
  }

  /** Starts an incremental bake toward `dir`; it cross-fades in over `fadeSeconds` once done. */
  begin(dir: THREE.Vector3, fadeSeconds: number): void {
    // If a fade was in flight, settle it so the back buffer is free to overwrite.
    if (this.fade > 0) this.finishFade()
    this.setDir(dir)
    this.row = 0
    this.fadeSpeed = 1 / Math.max(0.25, fadeSeconds)
  }

  /** Advance the bake/fade; cheap when idle. */
  update(dt: number, rowBudget = 24): void {
    if (this.row >= 0) {
      const back = this.textures[1 - this.front]
      const data = back.image.data as Uint8Array
      const end = Math.min(this.size, this.row + rowBudget)
      for (let j = this.row; j < end; j++) this.bakeRow(j, data)
      this.row = end
      if (end >= this.size) {
        this.row = -1
        back.needsUpdate = true
        this.uniforms.tSunVisB.value = back
        this.fade = 1e-4
      }
    } else if (this.fade > 0) {
      this.fade = Math.min(1, this.fade + dt * this.fadeSpeed)
      this.uniforms.uSunVisMix.value = this.fade
      if (this.fade >= 1) this.finishFade()
    }
  }

  dispose(): void {
    for (const t of this.textures) t.dispose()
  }

  private finishFade(): void {
    this.front = 1 - this.front
    this.uniforms.tSunVisA.value = this.textures[this.front]
    this.uniforms.tSunVisB.value = this.textures[1 - this.front]
    this.uniforms.uSunVisMix.value = 0
    this.fade = 0
  }

  private setDir(dir: THREE.Vector3): void {
    const hl = Math.max(1e-4, Math.hypot(dir.x, dir.z))
    this.dx = dir.x / hl
    this.dz = dir.z / hl
    this.tanE = Math.max(0.02, dir.y / hl)
  }

  private bakeRow(j: number, out: Uint8Array): void {
    const { size, grid, dx, dz, tanE } = this
    const texel = (WORLD_HALF * 2) / size
    const z = -WORLD_HALF + (j + 0.5) * texel
    const maxH = grid.maxHeight
    const penumbra = 0.075
    for (let i = 0; i < size; i++) {
      const x = -WORLD_HALF + (i + 0.5) * texel
      const h0 = Math.max(grid.sample(x, z), waterLevelAt(x, z))
      const reach = Math.min(240, (maxH - h0) / tanE)
      let best = -1e9
      // Start a couple of metres out: local relief is handled by N·L in the shader.
      let t = 2
      while (t < reach) {
        const s = (grid.sample(x + dx * t, z + dz * t) - h0) / t
        if (s > best) best = s
        t += 0.7 + t * 0.055
      }
      const v = (tanE - best) / penumbra + 0.5
      out[j * size + i] = v <= 0 ? 0 : v >= 1 ? 255 : (v * 255) | 0
    }
  }
}
