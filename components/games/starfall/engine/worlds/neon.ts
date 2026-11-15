/**
 * Cyberpunk Neon Metropolis (placeholder scenery, replaced by the full map): the Plasma
 * Overlord's arena is the roof of a tower high over a city at night: dark tiles seamed with
 * magenta light, a parapet with a neon strip, antenna masts, and skyscrapers all around in the
 * haze above the glowing street grid.
 */
import * as THREE from 'three'
import type { Ctx } from '../types'
import type { ZoneKit } from '../world/zones/kit'
import type { MapDef } from './defs'
import { place, seeded, slab } from './geo'
import type { MapBuild } from './registry'
import { abyss, buildStage, floorMaterial, type Owned } from './stage'

/** The Plasma Overlord's circle (m); the roof reaches 4 m further. */
export const NEON_RADIUS = 18
const FLOOR = NEON_RADIUS + 4
/** The streets lie this far below the roof; the tower's shaft reaches down to them. */
const STREETS = 72
const SHAFT = STREETS - 2

export function buildNeon(ctx: Ctx, kit: ZoneKit, def: MapDef): MapBuild {
  const { x: cx, y: cy, z: cz } = def.center
  const owned: Owned = []
  const uTime = { value: 0 }
  const rnd = seeded(17)

  const roof = floorMaterial(ctx, { map: 'stone_albedo', normal: 'stone_normal', color: '#4a4f66', roughness: 0.55, metalness: 0.35, pattern: 'grid', glow: '#ff3fd2', strength: 1.5, scale: 0.25 }, uTime, def.center)
  owned.push(roof)
  const steel = kit.mat('metal', { color: '#2a2e3a', key: 'neon-steel' })
  const pink = kit.mat('glow', { color: '#ffd6fb', emissive: '#ff3fd2', emissiveIntensity: 2.4, key: 'neon-pink' })
  const cyan = kit.mat('glow', { color: '#d6fbff', emissive: '#29d8ff', emissiveIntensity: 2.2, key: 'neon-cyan' })
  const warm = kit.mat('glow', { color: '#1a1426', emissive: '#ffb86b', emissiveIntensity: 0.9, key: 'neon-warm' })
  const towers = windowMaterial(def.center)
  owned.push(towers)
  const { ledgeZ, terrace } = buildStage(ctx, kit, def, { floor: FLOOR, top: roof })

  // The tower under the roof (and a smaller one under the entrance), banded with light; a steel
  // skybridge between them.
  kit.add(slab(FLOOR - 0.6, FLOOR - 0.6, SHAFT, 32, 6), steel, place(cx, cy - 1.4 - SHAFT / 2, cz), { castShadow: false })
  kit.add(slab(5.2, 5.2, SHAFT, 20, 6), steel, place(cx, cy - 1.4 - SHAFT / 2, ledgeZ), { castShadow: false })
  for (let k = 0; k < 9; k++) {
    const y = cy - 4 - k * 6.5
    kit.add(slab(FLOOR - 0.45, FLOOR - 0.45, 0.35, 32, 2), k % 3 === 0 ? cyan : warm, place(cx, y, cz), { castShadow: false })
    kit.add(slab(5.35, 5.35, 0.3, 20, 2), warm, place(cx, y, ledgeZ), { castShadow: false })
  }
  kit.box({ x: cx, y: cy - 2.6, z: (terrace[0] + terrace[1]) / 2, w: 13, h: 1.2, d: terrace[1] - terrace[0], mat: steel, castShadow: false })

  // A parapet with a neon strip round the roof edge; the way in from the south stays open.
  const segs = 28
  for (let i = 0; i < segs; i++) {
    const a = ((i + 0.5) / segs) * Math.PI * 2
    if (Math.cos(a) > 0.86) continue
    const x = cx + Math.sin(a) * (FLOOR - 0.35)
    const z = cz + Math.cos(a) * (FLOOR - 0.35)
    const len = ((Math.PI * 2 * (FLOOR - 0.35)) / segs) * 1.02
    kit.box({ x, y: cy, z, w: len, h: 0.85, d: 0.5, yaw: a + Math.PI / 2, mat: steel, collide: { surface: 'metal' } })
    kit.box({ x, y: cy + 0.85, z, w: len, h: 0.1, d: 0.22, yaw: a + Math.PI / 2, mat: i % 2 ? pink : cyan, castShadow: false })
  }
  // Antenna masts with lit tips on four corners of the roof.
  for (const a of [Math.PI * 0.62, Math.PI * 1.38, Math.PI * 0.9, Math.PI * 1.1]) {
    const x = cx + Math.sin(a) * (FLOOR - 2.4)
    const z = cz + Math.cos(a) * (FLOOR - 2.4)
    const h = 6 + rnd() * 4
    kit.box({ x, y: cy, z, w: 1.4, h: 0.8, d: 1.4, yaw: a, mat: steel, collide: { surface: 'metal' } })
    kit.cylinder({ x, y: cy + 0.8, z, r: 0.12, h, segments: 6, mat: steel })
    kit.cylinder({ x, y: cy + 0.8 + h, z, r: 0.22, h: 0.4, segments: 8, mat: pink, castShadow: false })
  }

  // Skyscrapers in the haze all around, rising from the streets far below.
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + rnd() * 0.2
    const d = 60 + rnd() * 90
    const w = 10 + rnd() * 14
    const h = 50 + rnd() * 70
    const x = cx + Math.sin(a) * d
    const z = cz + Math.cos(a) * d
    const yaw = rnd()
    kit.box({ x, y: cy - STREETS, z, w, h, d: w * (0.7 + rnd() * 0.6), yaw, mat: towers, castShadow: false })
    kit.box({ x, y: cy - STREETS + h, z, w: w * 0.92, h: 0.5, d: w * 0.6, yaw, mat: i % 2 ? pink : cyan, castShadow: false })
  }

  abyss(ctx, kit, owned, def, 'city', ['#05030c', '#ff3fd2'], uTime, cy - STREETS)

  return {
    update(_dt: number, t: number) {
      uTime.value = t
    },
    dispose() {
      for (const o of owned) o.dispose()
    },
  }
}

/**
 * Dark glass and steel with rows of lit windows (some dark, a few cool white) on every wall,
 * fading to an even glow where the windows get too small to draw cleanly.
 */
function windowMaterial(origin: { x: number; z: number }): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: '#1b1d2a', roughness: 0.35, metalness: 0.6 })
  mat.onBeforeCompile = sh => {
    sh.uniforms.uWinOrigin = { value: new THREE.Vector2(origin.x, origin.z) }
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWinP;\nvarying vec3 vWinN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWinP = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWinN = normal;')
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec2 uWinOrigin;
        varying vec3 vWinP;
        varying vec3 vWinN;
        float winHash(vec2 p) {
          vec3 p3 = fract(vec3(p.xyx) * 0.1031);
          p3 += dot(p3, p3.yzx + 33.33);
          return fract((p3.x + p3.y) * p3.z);
        }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        vec2 wo = vWinP.xz - uWinOrigin;
        // Along the wall (its horizontal tangent) and up it, in window cells.
        vec2 wuv = vec2(dot(wo, vec2(-vWinN.z, vWinN.x)) / 2.4, vWinP.y / 3.4);
        vec2 wf = fract(wuv);
        vec2 ww = max(fwidth(wuv), vec2(1e-3));
        float pane = smoothstep(0.2, 0.2 + ww.x, wf.x) * (1.0 - smoothstep(0.8 - ww.x, 0.8, wf.x))
                   * smoothstep(0.25, 0.25 + ww.y, wf.y) * (1.0 - smoothstep(0.75 - ww.y, 0.75, wf.y));
        vec2 cell = floor(wuv);
        float on = step(0.42, winHash(cell));
        float far = clamp(max(ww.x, ww.y) * 2.5 - 0.6, 0.0, 1.0);
        float wall = 1.0 - step(0.5, abs(vWinN.y));
        float lit = mix(pane * on, 0.2, far) * wall;
        vec3 tint = mix(vec3(1.0, 0.7, 0.4), vec3(0.6, 0.85, 1.0), step(0.82, winHash(cell + 3.7)));
        totalEmissiveRadiance += tint * lit * 1.3;`,
      )
  }
  mat.customProgramCacheKey = () => 'starfall-neon-windows'
  return mat
}
