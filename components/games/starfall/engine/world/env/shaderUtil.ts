/** Small helpers for patching three's built-in shaders. */
import * as THREE from 'three'

/**
 * Multiplies every directional light's colour by `visExpr` (a float expression
 * evaluated in the fragment shader) — used to apply the baked terrain shadow
 * to the sun on top of the real-time shadow map.
 */
export function patchSunVisibility(fragmentShader: string, visExpr: string): string {
  const anchor = 'getDirectionalLightInfo( directionalLight, directLight );'
  const chunk = THREE.ShaderChunk.lights_fragment_begin.replace(anchor, `${anchor}\n\t\tdirectLight.color *= ${visExpr};`)
  return fragmentShader.replace('#include <lights_fragment_begin>', chunk)
}
