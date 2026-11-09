/**
 * Shadow Rift: a floating obsidian arena over a starry void. Broken pillars stand as cover
 * (and as walls for the Gloom King's charges), violet cracks glow in the floor, crystals grow
 * at the rim, rocks drift around the edge, and a broken causeway leads in from the entrance
 * ledge where the return arch stands. Falling off the edge drops into the void (respawn).
 */
import * as THREE from 'three'
import type { Ctx } from '../types'
import { worldCylinder, type ZoneKit } from '../world/zones/kit'
import type { Pillar } from './bosses/GloomKing'
import type { MapDef } from './defs'
import { jaggedCone, place, rockGeometry, seeded, slab } from './geo'

/** Arena radius (m) — the fight circle; the floor reaches this far. */
export const RIFT_RADIUS = 22.5
const FLOATERS = 12

export interface MapBuild {
  /** Pillars a charging boss crashes into. */
  pillars: Pillar[]
  update(dt: number, t: number): void
  dispose(): void
}

const VOID_VS = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

/** Below and around the arena: a violet nebula full of stars (fades out above the horizon, where the sky takes over). */
const VOID_FS = /* glsl */ `
uniform float uTime;
uniform sampler2D tNoise;
varying vec3 vDir;
float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
void main() {
  vec3 d = normalize(vDir);
  vec2 sph = vec2(atan(d.z, d.x) / 6.2832, d.y * 0.5 + 0.5);
  float n = texture2D(tNoise, sph * vec2(1.0, 0.6) + vec2(uTime * 0.003, 0.0)).r;
  float n2 = texture2D(tNoise, sph * vec2(2.0, 1.3) - vec2(uTime * 0.004, 0.0)).r;
  float cloud = smoothstep(0.3, 0.85, n * 0.65 + n2 * 0.35);
  vec3 col = mix(vec3(0.015, 0.006, 0.04), vec3(0.17, 0.05, 0.27), cloud * 0.85);
  col += vec3(0.3, 0.09, 0.38) * smoothstep(0.55, 0.9, n * n2 * 1.8) * 0.35;
  vec3 g = floor(d * 160.0);
  float h = hash(g);
  float star = step(0.985, h) * smoothstep(0.32, 0.0, length(fract(d * 160.0) - 0.5));
  float tw = 0.6 + 0.4 * sin(uTime * 2.0 + h * 50.0);
  col += vec3(0.9, 0.85, 1.0) * star * tw * (0.5 + h * 2.0);
  float a = smoothstep(0.22, -0.02, d.y);
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

export function buildRift(ctx: Ctx, kit: ZoneKit, def: MapDef): MapBuild {
  const { x: cx, y: cy, z: cz } = def.center
  const owned: Array<{ dispose(): void }> = []
  const own = <T extends { dispose(): void }>(o: T): T => {
    owned.push(o)
    return o
  }
  const rnd = seeded(77)
  const tex = ctx.textures
  const uTime = { value: 0 }

  // ── the floor: polished obsidian with pulsing violet cracks ──
  const floor = own(new THREE.MeshStandardMaterial({
    map: tex.get('rock_albedo'), normalMap: tex.get('rock_normal'), color: 0x76658c, roughness: 0.5, metalness: 0.1,
  }))
  floor.onBeforeCompile = sh => {
    sh.uniforms.uTime = uTime
    sh.uniforms.tCrack = { value: tex.get('noise') }
    sh.uniforms.uCrack = { value: new THREE.Color('#c45cff') }
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCrackP;\nvarying float vCrackUp;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCrackP = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvCrackUp = normal.y;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform sampler2D tCrack;\nuniform vec3 uCrack;\nvarying vec3 vCrackP;\nvarying float vCrackUp;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float cn = texture2D(tCrack, vCrackP.xz * 0.014).r;
        float cm = texture2D(tCrack, vCrackP.xz * 0.045 + 0.37).r;
        // Thin lines where the noise crosses 0.5, widened (and dimmed) with distance so they never sparkle.
        float cw = max(0.022, fwidth(cn) * 1.5);
        float crack = (1.0 - smoothstep(0.0, cw, abs(cn - 0.5))) * (0.022 / cw) * smoothstep(0.42, 0.62, cm) * step(0.5, vCrackUp);
        float pulse = 0.6 + 0.4 * sin(uTime * 1.7 + cm * 9.0);
        totalEmissiveRadiance += uCrack * crack * pulse * 2.4;
        diffuseColor.rgb *= 1.0 - crack * 0.6;`,
      )
  }
  floor.customProgramCacheKey = () => 'starfall-rift-floor'
  const obsidian = kit.mat('rock', { color: '#5a4c70', key: 'obsidian' })
  const ruin = kit.mat('stone', { color: '#b4a6c8', key: 'riftstone' })
  const crystal = own(new THREE.MeshStandardMaterial({ color: 0x3a1660, emissive: 0xa040ff, emissiveIntensity: 1.6, roughness: 0.15, metalness: 0.2 }))

  // Arena slab (solid) and its jagged underside tapering into the void.
  kit.add(slab(RIFT_RADIUS, RIFT_RADIUS, 1.4, 72, 3), floor, place(cx, cy - 0.7, cz))
  kit.own(ctx.collision.addCylinder({ x: cx, y: cy - 5, z: cz, r: RIFT_RADIUS, h: 5, surface: 'stone' }))
  kit.add(jaggedCone(RIFT_RADIUS - 0.4, 3, 17, 9), obsidian, place(cx, cy - 1.4, cz))
  // Entrance ledge with the return arch, and the broken causeway to the arena.
  const ez = cz + 31
  kit.add(slab(5.5, 5.5, 1.2, 40, 3), floor, place(cx, cy - 0.6, ez))
  kit.own(ctx.collision.addCylinder({ x: cx, y: cy - 4, z: ez, r: 5.5, h: 4, surface: 'stone' }))
  kit.add(jaggedCone(5.2, 0.8, 7, 4), obsidian, place(cx, cy - 1.2, ez))
  for (let i = 0; i < 3; i++) {
    const z0 = cz + 21.8 + i * 1.75
    kit.box({ x: cx + (i - 1) * 0.25, y: cy - 0.6, z: z0 + 0.8, w: 3.4 - i * 0.2, h: 0.6, d: 1.6, yaw: (i - 1) * 0.06, mat: obsidian, collide: { surface: 'stone' } })
  }

  // ── pillars: cover, and walls for the charge ──
  const pillars: Pillar[] = []
  const angles = [-30, 30, 150, 210, 270]
  angles.forEach((deg, i) => {
    const a = (deg * Math.PI) / 180
    const px = cx + Math.cos(a) * 13
    const pz = cz + Math.sin(a) * 13
    const h = 3.6 + rnd() * 2.6
    kit.cylinder({ x: px, y: cy, z: pz, r: 1.45, h: 0.55, segments: 12, mat: ruin })
    kit.cylinder({ x: px, y: cy + 0.55, z: pz, r: 1.05, rTop: 0.98, h, segments: 14, mat: ruin, collide: { surface: 'stone' } })
    // A broken, tilted drum on top.
    kit.add(worldCylinder(1.0, 1.0, 0.7, 14), ruin, place(px + 0.1, cy + 0.55 + h + 0.25, pz, 0.18, i, 0.12))
    // Rubble at the foot.
    for (let k = 0; k < 3; k++) {
      const ra = rnd() * Math.PI * 2
      kit.add(rockGeometry(0.35 + rnd() * 0.3, i * 10 + k), ruin, place(px + Math.cos(ra) * 1.9, cy + 0.15, pz + Math.sin(ra) * 1.9, rnd(), rnd() * 6, 0))
    }
    pillars.push({ x: px, z: pz, r: 1.1 })
  })

  // ── crystals and rim stones ──
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.3
    if (Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2))) < 0.35) continue // keep the causeway clear
    const r = RIFT_RADIUS - 1.6 - rnd() * 1.2
    const x = cx + Math.cos(a) * r
    const z = cz + Math.sin(a) * r
    for (let k = 0; k < 3; k++) {
      const h = 1.2 + rnd() * 1.8
      kit.add(new THREE.ConeGeometry(0.28 + rnd() * 0.15, h, 5).translate(0, h / 2, 0), crystal, place(x + (rnd() - 0.5) * 1.2, cy - 0.1, z + (rnd() - 0.5) * 1.2, (rnd() - 0.5) * 0.7, rnd() * 6, (rnd() - 0.5) * 0.7), { castShadow: false })
    }
    kit.add(rockGeometry(0.8, 100 + i), obsidian, place(x + 0.8, cy + 0.2, z - 0.4, 0, rnd() * 6, 0, 1.2, 0.8, 1))
  }

  // ── the void: nebula and stars all around and below ──
  const voidMat = own(new THREE.ShaderMaterial({
    vertexShader: VOID_VS, fragmentShader: VOID_FS, side: THREE.BackSide, transparent: true, depthWrite: false, fog: false,
    uniforms: { uTime, tNoise: { value: tex.get('noise') } },
  }))
  const sky = kit.addObject(new THREE.Mesh(own(new THREE.SphereGeometry(420, 48, 24)), voidMat))
  sky.position.set(cx, cy, cz)
  sky.renderOrder = -1
  sky.frustumCulled = false

  // ── rocks drifting around the rim ──
  const floatGeo = own(rockGeometry(1, 5, 1))
  const floaters = kit.addObject(new THREE.InstancedMesh(floatGeo, obsidian, FLOATERS))
  floaters.castShadow = true
  floaters.frustumCulled = false
  const drift = Array.from({ length: FLOATERS }, (_, i) => {
    const a = (i / FLOATERS) * Math.PI * 2 + rnd() * 0.4
    const r = 30 + rnd() * 20
    return { x: cx + Math.cos(a) * r, y: cy - 6 + rnd() * 16, z: cz + Math.sin(a) * r, s: 1.2 + rnd() * 2.8, ph: rnd() * 6, spin: (rnd() - 0.5) * 0.3 }
  })
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  const p = new THREE.Vector3()
  const s = new THREE.Vector3()

  return {
    pillars,
    update(dt: number, t: number) {
      uTime.value = t
      for (let i = 0; i < FLOATERS; i++) {
        const f = drift[i]
        m.compose(p.set(f.x, f.y + Math.sin(t * 0.4 + f.ph) * 0.8, f.z), q.setFromEuler(e.set(f.ph, t * f.spin + f.ph, 0.3)), s.set(f.s, f.s * 0.8, f.s))
        floaters.setMatrixAt(i, m)
      }
      floaters.instanceMatrix.needsUpdate = true
    },
    dispose() {
      for (const o of owned) o.dispose()
      floaters.dispose()
    },
  }
}
