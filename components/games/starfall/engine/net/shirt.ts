/**
 * Per-player shirt colour for remote heroes. The hero has one baked albedo
 * texture; in the fragment shader, texels that are "shirt red" (narrow hue
 * band, saturated, not dark — so skin, hair and the white stripes are left
 * alone) are moved to the player's hue while keeping their own shading and
 * fabric detail. All tinted heroes share a single shader program; the colour
 * is a per-material uniform.
 */
import * as THREE from 'three'

const FUNCS = /* glsl */ `
uniform vec3 uShirtHsv;
vec3 sfRgb2Hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-6)), d / (q.x + 1e-6), q.x);
}
vec3 sfHsv2Rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}
`

/** Reference shirt texel (sRGB HSV): hue ≈ 9°, saturation ≈ 0.74, value ≈ 0.8. */
const TINT = /* glsl */ `
{
  vec3 sfSrgb = pow(max(diffuseColor.rgb, vec3(0.0)), vec3(1.0 / 2.2));
  vec3 sfHsv = sfRgb2Hsv(sfSrgb);
  float sfDh = abs(sfHsv.x - 0.024);
  sfDh = min(sfDh, 1.0 - sfDh);
  float sfMask = (1.0 - smoothstep(0.022, 0.042, sfDh)) * smoothstep(0.46, 0.6, sfHsv.y) * smoothstep(0.3, 0.45, sfHsv.z);
  vec3 sfTint = sfHsv2Rgb(vec3(uShirtHsv.x, clamp(uShirtHsv.y * sfHsv.y / 0.74, 0.0, 1.0), clamp(uShirtHsv.z * sfHsv.z / 0.8, 0.0, 1.0)));
  diffuseColor.rgb = mix(diffuseColor.rgb, pow(sfTint, vec3(2.2)), sfMask);
}
`

/** sRGB hex → HSV (all 0..1). */
function hexToHsv(hex: string, out: THREE.Vector3): THREE.Vector3 {
  const n = parseInt(hex.slice(1), 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const d = max - Math.min(r, g, b)
  let h = 0
  if (d > 0) {
    if (max === r) h = ((g - b) / d + 6) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
  }
  return out.set(h / 6, max > 0 ? d / max : 0, max)
}

export class ShirtMaterial {
  readonly material: THREE.MeshStandardMaterial
  private hsv = { value: new THREE.Vector3() }

  constructor(base: THREE.MeshStandardMaterial, color: string) {
    const m = (this.material = base.clone())
    m.name = 'HeroRemote'
    const uniform = this.hsv
    m.onBeforeCompile = shader => {
      shader.uniforms.uShirtHsv = uniform
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${FUNCS}`)
        .replace('#include <map_fragment>', `#include <map_fragment>\n${TINT}`)
    }
    m.customProgramCacheKey = () => 'starfall-remote-shirt-1'
    this.setColor(color)
  }

  setColor(hex: string): void {
    hexToHsv(hex, this.hsv.value)
  }

  dispose(): void {
    this.material.dispose()
  }
}
