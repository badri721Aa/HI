/**
 * glTF loading helpers shared by the hero and the Enemy Factory.
 *
 * GLTFLoader decodes embedded images by fetch()-ing a blob: URL, which the site's CSP
 * (connect-src) forbids. Images may come from blob: though, so they are decoded through <img>.
 */
import * as THREE from 'three'
import type { GLTFParser } from 'three/examples/jsm/loaders/GLTFLoader.js'

/** A file's bytes; a failure comes back as an Error rather than a rejection nobody is listening to yet. */
export async function loadBytes(url: string): Promise<ArrayBuffer | Error> {
  try {
    const r = await fetch(url)
    return r.ok ? await r.arrayBuffer() : new Error(`HTTP ${r.status} for ${url}`)
  } catch (err) {
    return err instanceof Error ? err : new Error(String(err))
  }
}

/** GLTFLoader plugin: embedded (bufferView) images are decoded with an <img>, never fetch(). */
export function embeddedImagesViaImg(parser: GLTFParser) {
  const imgLoader = new THREE.TextureLoader(parser.options.manager)
  return {
    name: 'starfall_embedded_images',
    loadTexture(index: number) {
      const def = parser.json.textures?.[index]
      const src = def && parser.json.images?.[def.source]
      if (!src || src.bufferView === undefined) return null
      return parser.loadTextureImage(index, def.source, imgLoader)
    },
  }
}
