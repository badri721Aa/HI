/**
 * Frost Peak: a snowy plateau with snow-laden pines, boulders and a frozen lake, a climb of
 * rock ledges and slippery ice platforms up the face of a rock column, and the Frost Golem's
 * arena on its flat top. Snow falls all around the camera; peaks loom in the cold blue fog.
 */
import * as THREE from 'three'
import type { Ctx } from '../types'
import type { ZoneKit } from '../world/zones/kit'
import type { MapDef } from './defs'
import { jaggedCone, place, rockGeometry, scaleUv, seeded, slab } from './geo'
import type { MapBuild } from './rift'

/** Arena radius (m) on top of the rock column. */
export const FROST_RADIUS = 16

/** The climb: [x, top above the plateau, z, kind] relative to the map centre. */
const STEPS: Array<[number, number, number, 'rock' | 'ice']> = [
  [-6, 1.3, 4, 'rock'],
  [-1, 2.6, 2, 'ice'],
  [4, 3.9, 0, 'rock'],
  [8, 5.2, -3, 'ice'],
  [4, 6.5, -6, 'rock'],
  [-1, 7.8, -8, 'ice'],
  [-6, 9.1, -9.5, 'ice'],
  [-9, 10.4, -12.5, 'rock'],
  [-5, 11.7, -12.0, 'ice'],
  // Against the column: one more jump up onto the arena.
  [-1, 13.0, -12.4, 'rock'],
]

const SNOW_VS = /* glsl */ `
uniform float uTime;
uniform vec3 uCenter;
uniform float uSize;
attribute vec3 aSeed;
varying float vA;
void main() {
  // Each flake falls and sways inside a box that follows the camera (wrapped with mod).
  vec3 box = vec3(56.0, 30.0, 56.0);
  vec3 p = aSeed * box;
  p.y -= uTime * (1.1 + aSeed.x * 0.7);
  p.x += sin(uTime * 0.7 + aSeed.z * 20.0) * 0.8;
  p.z += cos(uTime * 0.6 + aSeed.y * 20.0) * 0.8;
  p = mod(p - uCenter + box * 0.5, box) + uCenter - box * 0.5;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * (0.6 + aSeed.y * 0.8) / -mv.z;
  vA = smoothstep(30.0, 6.0, -mv.z) * smoothstep(0.3, 1.5, -mv.z);
}`

const SNOW_FS = /* glsl */ `
varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.2, d) * vA * 0.9;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vec3(0.96, 0.98, 1.0), a);
}`

export function buildFrost(ctx: Ctx, kit: ZoneKit, def: MapDef): MapBuild {
  const { x: cx, y: cy, z: cz } = def.center
  const owned: Array<{ dispose(): void }> = []
  const own = <T extends { dispose(): void }>(o: T): T => {
    owned.push(o)
    return o
  }
  const rnd = seeded(31)
  const tex = ctx.textures

  // Snow: the plaster scan brightened past white and cooled, with a soft grainy relief.
  const snow = own(new THREE.MeshStandardMaterial({ map: tex.get('plaster_albedo'), normalMap: tex.get('sand_normal'), normalScale: new THREE.Vector2(0.45, 0.45), roughness: 0.9 }))
  snow.color.setRGB(1.25, 1.32, 1.42)
  const ice = own(new THREE.MeshStandardMaterial({
    color: 0x9fd6f2, emissive: 0x123a55, roughness: 0.06, metalness: 0.05, normalMap: tex.get('rock_normal'), normalScale: new THREE.Vector2(0.25, 0.25),
  }))
  const rock = kit.mat('rock', { color: '#b8c4d2', key: 'frostrock' })
  const bark = kit.mat('bark', { color: '#6a5a4c', key: 'frostbark' })
  const needles = own(new THREE.MeshStandardMaterial({ map: tex.get('leaves_albedo'), color: 0x3d6a4c, roughness: 0.9 }))
  const snowSurface = { surface: 'snow' as const }
  const iceSurface = { surface: 'ice' as const }

  // ── the plateau ──
  const pz0 = cz - 16
  const pz1 = cz + 48
  kit.box({ x: cx, y: cy - 7, z: (pz0 + pz1) / 2, w: 44, h: 7, d: pz1 - pz0, mat: snow, uvScale: 4, collide: snowSurface })
  // Rocky flanks and a tapering root so the slab reads as a mountain shoulder, not a box.
  kit.add(jaggedCone(30, 6, 26, 12), rock, place(cx, cy - 6.5, cz + 16, 0, 0, 0, 0.82, 1, 1.15))
  for (let i = 0; i < 16; i++) {
    const side = i % 2 ? 1 : -1
    const z = pz0 + 4 + (i >> 1) * 8 + rnd() * 3
    kit.add(rockGeometry(4 + rnd() * 3, 200 + i, 1), rock, place(cx + side * (21 + rnd() * 2), cy - 3.5 - rnd() * 2, z, rnd(), rnd() * 6, 0, 1, 1.1, 1.2))
  }
  for (let i = 0; i < 5; i++) {
    kit.add(rockGeometry(4.5 + rnd() * 2, 230 + i, 1), rock, place(cx - 18 + i * 9, cy - 4 - rnd() * 2, pz1 + 1.5, rnd(), rnd() * 6, 0, 1.1, 1, 0.9))
  }
  // Snow drifts.
  for (let i = 0; i < 10; i++) {
    const x = cx + (rnd() - 0.5) * 36
    const z = cz + 12 + rnd() * 34
    if (Math.abs(x - cx) < 4 && z > cz + 34) continue // keep the arrival clear
    kit.add(rockGeometry(1.6 + rnd() * 1.4, 300 + i), snow, place(x, cy - 0.5, z, 0, rnd() * 6, 0, 1.6, 0.45, 1.2), { castShadow: false })
  }

  // ── the frozen lake ──
  const lake = { x: cx + 10, z: cz + 25, r: 7 }
  kit.add(slab(lake.r, lake.r, 0.12, 48, 3), ice, place(lake.x, cy - 0.03, lake.z))
  kit.own(ctx.collision.addCylinder({ x: lake.x, y: cy - 0.1, z: lake.z, r: lake.r, h: 0.12, surface: 'ice' }))
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2
    kit.add(rockGeometry(0.6 + rnd() * 0.5, 400 + i), snow, place(lake.x + Math.cos(a) * (lake.r + 0.4), cy - 0.1, lake.z + Math.sin(a) * (lake.r + 0.4), 0, rnd() * 6, 0, 1.4, 0.5, 1), { castShadow: false })
  }

  // ── snowy pines ──
  const pines: Array<[number, number, number]> = [
    [-16, 40, 1.1], [-13, 31, 0.9], [-18, 22, 1.2], [-15, 12, 1.0], [-17, 2, 1.3], [-12, -8, 1.1],
    [16, 40, 1.0], [18, 32, 1.2], [19, 14, 1.1], [15, 6, 0.9], [17, -4, 1.25], [13, -11, 1.0],
    [-8, 44, 0.8], [7, 45, 0.85], [-6, 22, 0.75], [3, 15, 0.7],
  ]
  for (const [ox, oz, s] of pines) {
    const x = cx + ox + (rnd() - 0.5)
    const z = cz + oz + (rnd() - 0.5)
    kit.cylinder({ x, y: cy - 0.2, z, r: 0.28 * s, rTop: 0.2 * s, h: 2.2 * s, segments: 7, mat: bark, collide: { surface: 'wood' } })
    for (let k = 0; k < 3; k++) {
      const y = cy + (1.4 + k * 1.35) * s
      const r = (2.1 - k * 0.55) * s
      const h = (2.3 - k * 0.3) * s
      kit.add(new THREE.ConeGeometry(r, h, 9).translate(0, h / 2, 0), needles, place(x, y, z, 0, rnd() * 6, 0))
      kit.add(new THREE.ConeGeometry(r * 0.8, h * 0.45, 9).translate(0, h * 0.225, 0), snow, place(x, y + h * 0.5, z, 0, rnd() * 6, 0))
    }
  }

  // ── boulders ──
  for (const [ox, oz, s] of [[-9, 34, 1.3], [12, 37, 1.0], [-14, 18, 1.5], [6, 10, 0.9], [15, 20, 1.1]] as const) {
    const x = cx + ox
    const z = cz + oz
    kit.add(rockGeometry(1, 500 + ox), rock, place(x, cy + 0.2 * s, z, rnd(), rnd() * 6, 0, s * 1.3, s, s * 1.1))
    kit.add(rockGeometry(0.9, 520 + ox), snow, place(x, cy + 0.75 * s, z, 0, rnd() * 6, 0, s * 1.2, s * 0.35, s))
    kit.own(ctx.collision.addCylinder({ x, y: cy - 0.5, z, r: 1.05 * s, h: 1.4 * s, surface: 'rock' }))
  }

  // ── the climb: rock ledges capped with snow, and slippery ice slabs ──
  for (const [ox, top, oz, kind] of STEPS) {
    const x = cx + ox
    const z = cz + oz
    const y = cy + top
    if (kind === 'rock') {
      const w = 3.8
      kit.box({ x, y: y - 1.6, z, w, h: 1.45, d: w, yaw: rnd() * 0.4, mat: rock, collide: snowSurface })
      kit.box({ x, y: y - 0.15, z, w: w + 0.1, h: 0.15, d: w + 0.1, mat: snow })
      kit.add(rockGeometry(1.5, 600 + ox), rock, place(x, y - 2.2, z, 0, rnd() * 6, 0, 1.4, 1.1, 1.4))
    } else {
      kit.box({ x, y: y - 0.5, z, w: 3.1, h: 0.5, d: 3.1, yaw: rnd() * 0.5, mat: ice, collide: iceSurface })
      kit.add(new THREE.ConeGeometry(1.2, 1.6, 6).rotateX(Math.PI), ice, place(x, y - 1.3, z, 0, rnd() * 6, 0))
    }
  }

  // ── the arena on its rock column ──
  const ax = def.arena.x
  const az = def.arena.z
  const ay = def.arena.y
  kit.add(slab(FROST_RADIUS, FROST_RADIUS, 0.4, 56, 4), snow, place(ax, ay - 0.2, az))
  kit.add(slab(FROST_RADIUS - 0.2, FROST_RADIUS * 0.82, 18, 40, 4), rock, place(ax, ay - 9.4, az))
  kit.add(jaggedCone(FROST_RADIUS * 0.82, 4, 16, 21), rock, place(ax, ay - 18.4, az))
  kit.own(ctx.collision.addCylinder({ x: ax, y: cy - 10, z: az, r: FROST_RADIUS, h: ay - cy + 10, surface: 'snow' }))
  // Crags round the column's flanks so it reads as a mountain top (the south face, where the climb is, stays clear).
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + rnd() * 0.2
    if (Math.sin(a) > 0.2) continue
    const y = ay - 4 - rnd() * 12
    const rr = FROST_RADIUS * (y > ay - 9 ? 0.98 : 0.86)
    kit.add(rockGeometry(4 + rnd() * 2.5, 260 + i, 1), rock, place(ax + Math.cos(a) * rr, y, az + Math.sin(a) * rr, rnd(), rnd() * 6, rnd() * 0.4, 1, 1.5, 1))
  }
  // Two icy patches on the arena floor.
  for (const [ox, oz, r] of [[-7, 3, 2.6], [6, -5, 2.2]] as const) {
    kit.add(slab(r, r, 0.06, 28, 3), ice, place(ax + ox, ay + 0.02, az + oz))
    kit.own(ctx.collision.addCylinder({ x: ax + ox, y: ay - 0.05, z: az + oz, r, h: 0.08, surface: 'ice' }))
  }
  // Rim: ice crystals and rocks, leaving the south (where the climb arrives) open.
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    if (Math.sin(a) > 0.75) continue
    const x = ax + Math.cos(a) * (FROST_RADIUS - 0.8)
    const z = az + Math.sin(a) * (FROST_RADIUS - 0.8)
    if (i % 3 === 0) {
      kit.add(rockGeometry(1.1, 700 + i), rock, place(x, ay + 0.3, z, rnd(), rnd() * 6, 0, 1.2, 1, 1))
      kit.own(ctx.collision.addCylinder({ x, y: ay, z, r: 1.1, h: 1.2, surface: 'rock' }))
    } else {
      const h = 1.4 + rnd() * 1.6
      kit.add(new THREE.ConeGeometry(0.35, h, 5).translate(0, h / 2, 0), ice, place(x, ay - 0.1, z, (rnd() - 0.5) * 0.6, rnd() * 6, (rnd() - 0.5) * 0.6))
    }
  }

  // ── distant peaks in the fog ──
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI / 2 + (i - 4) * 0.42 + (rnd() - 0.5) * 0.2
    const d = 90 + rnd() * 50
    const h = 45 + rnd() * 40
    const r = 30 + rnd() * 18
    const x = cx + Math.cos(a) * d
    const z = cz - 20 + Math.sin(a) * d
    kit.add(scaleUv(new THREE.ConeGeometry(r, h, 9, 1), 8, 5).translate(0, h / 2, 0), rock, place(x, cy - 40, z, 0, rnd() * 6, 0), { castShadow: false })
    kit.add(scaleUv(new THREE.ConeGeometry(r * 0.42, h * 0.42, 9, 1), 5, 3).translate(0, h * 0.21, 0), snow, place(x, cy - 40 + h * 0.58, z, 0, rnd() * 6, 0), { castShadow: false })
  }

  // ── snowfall ──
  const count = Math.round(Math.min(2400, Math.max(500, ctx.quality.particles * 0.6)))
  const seeds = new Float32Array(count * 3)
  for (let i = 0; i < seeds.length; i++) seeds[i] = rnd()
  const snowGeo = own(new THREE.BufferGeometry())
  snowGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
  snowGeo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3))
  const flakesMat = own(new THREE.ShaderMaterial({
    vertexShader: SNOW_VS, fragmentShader: SNOW_FS, transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uSize: { value: 70 } },
  }))
  const flakes = kit.addObject(new THREE.Points(snowGeo, flakesMat))
  flakes.frustumCulled = false
  flakes.renderOrder = 5

  return {
    pillars: [],
    update(_dt: number, t: number) {
      flakesMat.uniforms.uTime.value = t
      flakesMat.uniforms.uCenter.value.copy(ctx.camera.position)
      flakesMat.uniforms.uSize.value = 70 * ctx.renderer.getPixelRatio()
    },
    dispose() {
      for (const o of owned) o.dispose()
    },
  }
}
