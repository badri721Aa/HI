/**
 * The stage kit the four newer maps start from (their scenery is a placeholder until each gets
 * its full map):
 *
 *   floorMaterial   a textured floor with glowing lines in it (lava cracks, or a tile grid with
 *                   a few cells lit), animated by a shared uTime
 *   buildStage      the standard layout, all solid: the round main floor, the terrace south of it
 *                   and the entrance ledge the golden arch stands on (read from the MapDef), with
 *                   an optional jagged rock underside so it all floats
 *   abyss           the self-lit sheet far below that marks the kill floor (lava, a cloud sea, a
 *                   city at night or a void grid), fading into the fog
 *
 * A full map may keep using any of it or none; delete this file once no builder imports it.
 */
import * as THREE from 'three'
import type { TexName } from '../textures'
import type { Ctx } from '../types'
import type { ZoneKit } from '../world/zones/kit'
import type { MapDef } from './defs'
import { jaggedCone, place, slab } from './geo'

/** Things a builder made itself and frees in its dispose(). */
export type Owned = Array<{ dispose(): void }>

/** The animation clock a builder shares between its shaders (set uTime.value = t in update). */
export type TimeUniform = { value: number }

/** Width of the terrace between the entrance ledge and the main floor, and the ledge's radius. */
const TERRACE_W = 14
const LEDGE_R = 6
/** The golden arch stands this far behind the ledge's centre (MapDef.exit). */
const ARCH_BACK = 3.6
const THICK = 1.4

/** Integer-lattice hash in [0, 1): no trig, so it stays stable far from the origin. */
const HASH = /* glsl */ `
float stageHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}`

export interface FloorLook {
  map: TexName
  normal?: TexName
  /** Albedo tint. */
  color: string
  roughness: number
  metalness?: number
  /** Glowing lines on top faces: cracks (lava-like) or a tile grid. */
  pattern: 'cracks' | 'grid'
  glow: string
  /** Glow strength (emissive multiplier, kept ≤ 3). */
  strength: number
  /** Cracks: noise repeats per metre (≈0.015). Grid: cells per metre (≈0.5). */
  scale: number
  /** Grid only: a few cells light up, a different few every couple of seconds. */
  cells?: boolean
}

/**
 * A floor material with glowing lines on its top faces. The lines widen and dim with distance
 * (fwidth), so they never sparkle; pulses are slow (well under 1 Hz).
 */
export function floorMaterial(ctx: Ctx, look: FloorLook, uTime: TimeUniform, origin: { x: number; z: number }): THREE.MeshStandardMaterial {
  const tex = ctx.textures
  const mat = new THREE.MeshStandardMaterial({
    map: tex.get(look.map),
    normalMap: look.normal ? tex.get(look.normal) : null,
    color: look.color,
    roughness: look.roughness,
    metalness: look.metalness ?? 0,
  })
  const pattern =
    look.pattern === 'cracks'
      ? `
        float sn = texture2D(tStageNoise, sp * uStageScale).r;
        float sm = texture2D(tStageNoise, sp * uStageScale * 3.2 + 0.37).r;
        float sw = max(0.022, fwidth(sn) * 1.5);
        float mask = (1.0 - smoothstep(0.0, sw, abs(sn - 0.5))) * (0.022 / sw) * smoothstep(0.42, 0.62, sm);
        float pulse = 0.65 + 0.35 * sin(uTime * 1.3 + sm * 9.0);`
      : `
        vec2 sg = sp * uStageScale;
        vec2 sw = max(fwidth(sg), vec2(1e-3));
        vec2 sd = abs(fract(sg - 0.5) - 0.5) / sw;
        float fade = clamp(1.5 - max(sw.x, sw.y) * 3.0, 0.0, 1.0);
        float mask = (1.0 - min(min(sd.x, sd.y) * 0.6, 1.0)) * fade;
        ${look.cells ? 'mask += step(0.95, stageHash(floor(sg) + floor(uTime * 0.45) * vec2(17.0, 31.0))) * 0.3 * fade;' : ''}
        float pulse = 0.78 + 0.22 * sin(uTime * 1.1 + (sg.x + sg.y) * 0.3);`
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = uTime
    sh.uniforms.tStageNoise = { value: tex.get('noise') }
    sh.uniforms.uStageGlow = { value: new THREE.Color(look.glow).multiplyScalar(Math.min(3, look.strength)) }
    sh.uniforms.uStageScale = { value: look.scale }
    sh.uniforms.uStageOrigin = { value: new THREE.Vector2(origin.x, origin.z) }
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vStageP;\nvarying float vStageUp;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvStageP = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvStageUp = normal.y;')
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform sampler2D tStageNoise;
        uniform vec3 uStageGlow;
        uniform float uStageScale;
        uniform vec2 uStageOrigin;
        varying vec3 vStageP;
        varying float vStageUp;
        ${HASH}`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        vec2 sp = vStageP.xz - uStageOrigin;
        ${pattern}
        mask = clamp(mask, 0.0, 1.5) * step(0.5, vStageUp);
        totalEmissiveRadiance += uStageGlow * mask * pulse;
        diffuseColor.rgb *= 1.0 - min(mask, 1.0) * 0.55;`,
      )
  }
  mat.customProgramCacheKey = () => `starfall-stage-floor-${look.pattern}-${look.cells ? 1 : 0}`
  return mat
}

export interface StageOpts {
  /** Radius of the round main floor (at least the boss's circle). */
  floor: number
  /** Top of every slab (the main floor, terrace and ledge). */
  top: THREE.Material
  /** A jagged rock underside under each slab (a floating island); omit to build your own. */
  under?: THREE.Material
  /** Slab thickness (m). */
  thick?: number
}

/**
 * The standard layout, all solid: the round main floor around the map's centre, the entrance
 * ledge under the golden arch (MapDef.exit) and the terrace joining them. Returns the ledge's
 * centre z and the terrace's z range (south of the floor).
 */
export function buildStage(ctx: Ctx, kit: ZoneKit, def: MapDef, o: StageOpts): { ledgeZ: number; terrace: [number, number] } {
  const { x: cx, y: cy, z: cz } = def.center
  const thick = o.thick ?? THICK
  const ledgeZ = def.exit.z - ARCH_BACK
  const t0 = cz + o.floor - 2
  const t1 = ledgeZ - LEDGE_R + 1.5
  const solid = (x: number, z: number, r: number) => kit.own(ctx.collision.addCylinder({ x, y: cy - 6, z, r, h: 6, surface: 'stone' }))

  kit.add(slab(o.floor, o.floor, thick, 72, 3), o.top, place(cx, cy - thick / 2, cz))
  solid(cx, cz, o.floor)
  kit.add(slab(LEDGE_R, LEDGE_R, thick, 40, 3), o.top, place(cx, cy - thick / 2, ledgeZ))
  solid(cx, ledgeZ, LEDGE_R)
  kit.box({ x: cx, y: cy - thick, z: (t0 + t1) / 2, w: TERRACE_W, h: thick, d: t1 - t0, mat: o.top, uvScale: 3, collide: { surface: 'stone' } })

  if (o.under) {
    kit.add(jaggedCone(o.floor - 0.4, 3, o.floor * 0.8, 9), o.under, place(cx, cy - thick, cz))
    kit.add(jaggedCone(LEDGE_R - 0.3, 1, 8, 4), o.under, place(cx, cy - thick, ledgeZ))
    // The terrace's underside: a stretched cone, so it reads as one rocky spur.
    const half = (t1 - t0) / 2
    kit.add(jaggedCone(1, 0.2, 7, 13), o.under, place(cx, cy - thick, (t0 + t1) / 2, 0, 0, 0, TERRACE_W / 2 - 0.3, 1, half - 0.3))
  }
  return { ledgeZ, terrace: [t0, t1] }
}

const ABYSS_VS = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
varying vec3 vW;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`

/** Each abyss: `col` from p (metres from the map's centre), uA (dark) and uB (glow). */
const ABYSS: Record<AbyssKind, string> = {
  lava: `
    float n = texture2D(tNoise, p * 0.006 + vec2(uTime * 0.004, 0.0)).r;
    float m = texture2D(tNoise, p * 0.021 - vec2(0.0, uTime * 0.006)).r;
    float heat = smoothstep(0.35, 0.78, n * 0.6 + m * 0.4);
    float vein = (1.0 - smoothstep(0.0, 0.05, abs(m - 0.5))) * smoothstep(0.3, 0.6, n);
    vec3 col = mix(uA, uB, heat) + uB * vein * 0.7;`,
  clouds: `
    float n = texture2D(tNoise, p * 0.0035 + vec2(uTime * 0.002, uTime * 0.001)).r;
    float m = texture2D(tNoise, p * 0.012 - vec2(uTime * 0.003, 0.0)).r;
    float puff = smoothstep(0.32, 0.82, n * 0.65 + m * 0.35);
    vec3 col = mix(uA, uB, puff);`,
  city: `
    vec2 b = p / 16.0;
    vec2 bw = max(fwidth(b), vec2(1e-3));
    vec2 e = abs(fract(b) - 0.5);
    float street = smoothstep(0.43 - bw.x, 0.43, max(e.x, e.y));
    float tone = stageHash(floor(b) + 7.0);
    vec2 wnd = p / 1.2;
    vec2 ww = max(fwidth(wnd), vec2(1e-3));
    float near = clamp(1.5 - max(ww.x, ww.y) * 2.0, 0.0, 1.0);
    float lit = mix(0.12, step(0.86, stageHash(floor(wnd))), near) * (1.0 - street) * 0.35;
    vec3 col = uA + uB * street * (0.45 + 0.55 * tone) + vec3(1.0, 0.75, 0.45) * lit;`,
  void: `
    vec2 g = p / 6.0;
    vec2 w = max(fwidth(g), vec2(1e-3));
    vec2 d = abs(fract(g - 0.5) - 0.5) / w;
    float line = (1.0 - min(min(d.x, d.y) / 1.2, 1.0)) * clamp(1.0 - max(w.x, w.y) * 2.0, 0.0, 1.0);
    float wave = 0.5 + 0.5 * sin(length(p) * 0.08 - uTime * 0.6);
    vec3 col = uA + uB * line * (0.3 + 0.7 * wave);`,
}

export type AbyssKind = 'lava' | 'clouds' | 'city' | 'void'

/**
 * The self-lit sheet a little above the map's kill height (or at height `y`, e.g. a city's
 * streets far below): what the player sees over the edge and falls toward. `colors`: [dark, glow].
 */
export function abyss(ctx: Ctx, kit: ZoneKit, own: Owned, def: MapDef, kind: AbyssKind, colors: [string, string], uTime: TimeUniform, y = def.killY + 3): void {
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog])
  Object.assign(uniforms, {
    uTime,
    tNoise: { value: ctx.textures.get('noise') },
    uA: { value: new THREE.Color(colors[0]) },
    uB: { value: new THREE.Color(colors[1]) },
    uOrigin: { value: new THREE.Vector2(def.center.x, def.center.z) },
  })
  const mat = new THREE.ShaderMaterial({
    vertexShader: ABYSS_VS,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform float uTime;
      uniform sampler2D tNoise;
      uniform vec3 uA;
      uniform vec3 uB;
      uniform vec2 uOrigin;
      varying vec3 vW;
      ${HASH}
      void main() {
        vec2 p = vW.xz - uOrigin;
        ${ABYSS[kind]}
        gl_FragColor = vec4(clamp(col, 0.0, 3.0), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    uniforms,
    fog: true,
  })
  own.push(mat)
  const geo = new THREE.CircleGeometry(460, 64).rotateX(-Math.PI / 2)
  own.push(geo)
  const sheet = kit.addObject(new THREE.Mesh(geo, mat))
  sheet.position.set(def.center.x, y, def.center.z)
  sheet.name = `abyss:${kind}`
}
