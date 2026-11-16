import * as THREE from 'three'

export const TEXTURE_BASE = '/games/starfall/textures/'

/**
 * Every texture file the game ships. Generated offline by tools/starfall/gen_textures.py
 * into public/games/starfall/textures/<name>.webp. All tile seamlessly.
 */
export const TEXTURES = [
  // terrain (1024², tileable)
  'grass_albedo', 'grass_normal',
  'sand_albedo', 'sand_normal',
  'dirt_albedo', 'dirt_normal',
  'rock_albedo', 'rock_normal',
  // props (512², tileable)
  'planks_albedo', 'planks_normal',
  'stone_albedo', 'stone_normal',
  'bark_albedo', 'bark_normal',
  'roof_albedo', 'roof_normal',
  'plaster_albedo',
  'cloth_albedo',
  /** RGBA foliage-card atlas (leaf clusters on transparent background). */
  'leaves_albedo',
  // effects
  'water_normal',
  /** Greyscale tileable fBm noise (R channel). */
  'noise',
  /** Greyscale tileable soft cloud noise. */
  'clouds',
  /** RGBA soft radial glow sprite, white. */
  'glow',
] as const

export type TexName = (typeof TEXTURES)[number]

const LINEAR = new Set<TexName>(['grass_normal', 'sand_normal', 'dirt_normal', 'rock_normal', 'planks_normal', 'stone_normal', 'bark_normal', 'roof_normal', 'water_normal', 'noise', 'clouds'])

export interface TexOptions {
  /** UV repeat (number = both axes). Returns a clone sharing the same image. */
  repeat?: number | [number, number]
}

export class TextureLib {
  private cache = new Map<TexName, THREE.Texture>()
  private loader = new THREE.TextureLoader()
  private anisotropy: number

  constructor(renderer: THREE.WebGLRenderer) {
    this.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
  }

  /** Loads every texture; missing files fall back to a neutral placeholder. */
  async preload(onProgress?: (fraction: number) => void): Promise<void> {
    let done = 0
    await Promise.all(
      TEXTURES.map(name =>
        new Promise<void>(resolve => {
          this.loader.load(
            `${TEXTURE_BASE}${name}.webp`,
            tex => {
              this.configure(name, tex)
              this.cache.set(name, tex)
              onProgress?.(++done / TEXTURES.length)
              resolve()
            },
            undefined,
            () => {
              console.warn(`[starfall] texture ${name} missing — using a placeholder`)
              this.cache.set(name, this.placeholder(name))
              onProgress?.(++done / TEXTURES.length)
              resolve()
            },
          )
        }),
      ),
    )
  }

  private configure(name: TexName, tex: THREE.Texture): void {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.anisotropy = this.anisotropy
    tex.colorSpace = LINEAR.has(name) ? THREE.NoColorSpace : THREE.SRGBColorSpace
    tex.generateMipmaps = true
    tex.minFilter = THREE.LinearMipmapLinearFilter
    tex.magFilter = THREE.LinearFilter
    tex.needsUpdate = true
  }

  private placeholder(name: TexName): THREE.Texture {
    const isNormal = name.endsWith('_normal') || name === 'water_normal'
    const data = new Uint8Array(isNormal ? [128, 128, 255, 255] : name === 'glow' ? [255, 255, 255, 255] : [160, 160, 160, 255])
    const tex = new THREE.DataTexture(data, 1, 1)
    this.configure(name, tex)
    return tex
  }

  /** Shared texture (or a repeat-configured clone that shares the same GPU image). */
  get(name: TexName, opts: TexOptions = {}): THREE.Texture {
    let tex = this.cache.get(name)
    if (!tex) {
      tex = this.placeholder(name)
      this.cache.set(name, tex)
    }
    if (opts.repeat === undefined) return tex
    const c = tex.clone()
    const [rx, ry] = typeof opts.repeat === 'number' ? [opts.repeat, opts.repeat] : opts.repeat
    c.repeat.set(rx, ry)
    return c
  }

  dispose(): void {
    for (const t of this.cache.values()) t.dispose()
    this.cache.clear()
  }
}
