/**
 * Mirror Lake (Shard 5).
 *
 * A wooden jetty juts out from the south shore; from its end a trail of lily pads leads
 * across deep water to a small rocky islet with a grassy top, a stone lantern and a cairn.
 * Every pad is a dynamic collider (tag 'lilypad') that dips under the player's weight and
 * bobs back; pads and their lotus flowers are two instanced meshes.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Collider } from '../../collision'
import type { Ctx } from '../../types'
import { ISLET } from '../level'
import { boulderGeometry } from './falls'
import { ZoneKit, type ZonePart } from './kit'

const TAU = Math.PI * 2

function rng(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), s | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Jetty along +z → -z at x = JETTY.x; deck top at lake level + 0.55. */
const JETTY = { x: 62, z0: -45.0, z1: -53.0, width: 2.0 }

/** Lily pads: x, z, radius, has flower. The first three form the path to the islet. */
const PADS: Array<[number, number, number, boolean]> = [
  [61.0, -55.6, 1.15, false],
  [63.6, -58.0, 1.05, true],
  [61.4, -60.6, 1.1, false],
  [55.0, -60.0, 0.8, false],
  [57.4, -56.8, 0.95, true],
  [68.2, -58.4, 1.0, false],
  [70.2, -63.4, 0.8, true],
  [66.6, -71.2, 0.9, false],
  [56.0, -70.2, 1.0, true],
  [58.6, -74.2, 0.7, false],
  [67.6, -54.6, 0.7, false],
]

interface Pad {
  col: Collider
  x: number
  z: number
  r: number
  phase: number
  dip: number
  dipV: number
  /** Seconds left of "someone is standing here". */
  pressed: number
  flower: number
}

/** Unit lily pad: a gently cupped disc with the classic notch, facing up. */
function padGeometry(): THREE.BufferGeometry {
  const notch = 0.2
  const g = new THREE.CircleGeometry(1, 32, notch, TAU - 2 * notch)
  g.rotateX(-Math.PI / 2)
  const p = g.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < p.count; i++) {
    const r = Math.hypot(p.getX(i), p.getZ(i))
    p.setY(i, 0.025 * r * r + (r > 0.96 ? 0.02 : 0))
  }
  g.computeVertexNormals()
  return g
}

/** Lotus: two rings of cupped petals around a golden centre, coloured per vertex. */
function flowerGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const pink = new THREE.Color(0xe58fb0)
  const white = new THREE.Color(0xfff4ef)
  const gold = new THREE.Color(0xf2c14e)
  const petal = (len: number, tilt: number, yaw: number, y: number) => {
    const g = new THREE.SphereGeometry(1, 8, 6, 0, TAU, 0, Math.PI / 2)
    g.scale(0.09, 0.05, len)
    g.translate(0, 0, len)
    g.rotateX(-tilt)
    g.rotateY(yaw)
    g.translate(0, y, 0)
    return g
  }
  for (let i = 0; i < 8; i++) parts.push(petal(0.2, 0.55, (i / 8) * TAU, 0.02))
  for (let i = 0; i < 6; i++) parts.push(petal(0.15, 1.0, (i / 6) * TAU + 0.3, 0.05))
  const core = new THREE.SphereGeometry(0.06, 8, 5)
  core.scale(1, 0.6, 1).translate(0, 0.08, 0)
  for (const g of [...parts, core]) {
    const p = g.attributes.position as THREE.BufferAttribute
    const c = new Float32Array(p.count * 3)
    const col = new THREE.Color()
    for (let i = 0; i < p.count; i++) {
      if (g === core) col.copy(gold)
      else col.copy(pink).lerp(white, Math.min(1, Math.hypot(p.getX(i), p.getZ(i)) / 0.3 + (p.getY(i) - 0.02) * 2))
      c.set([col.r, col.g, col.b], i * 3)
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3))
  }
  const merged = mergeGeometries([...parts, core].map(g => (g.index ? g.toNonIndexed() : g)))
  for (const g of [...parts, core]) g.dispose()
  return merged
}

export function buildLake(ctx: Ctx): ZonePart {
  const kit = new ZoneKit(ctx, 'lake')
  const rand = rng(0x1a4e)
  const I = ISLET
  const level = I.lakeLevel
  const m4 = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const v = new THREE.Vector3()
  const one = new THREE.Vector3(1, 1, 1)
  const rockMat = kit.mat('rock', { color: 0xb8b0a6, key: 'islet' })

  /* ── islet ─────────────────────────────────────────────────── */
  const bed = kit.ground(I.x, I.z) - 0.6
  {
    const h = I.topY - bed
    const g = new THREE.CylinderGeometry(I.r + 0.12, I.r + 1.6, h, 30, 5, true)
    const p = g.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i)
      if (y > h / 2 - 0.01) continue
      const a = Math.atan2(p.getZ(i), p.getX(i))
      const k = 1 + 0.08 * Math.sin(a * 5 + y * 1.3) + 0.05 * Math.sin(a * 11 - y * 2.1) + (rand() - 0.5) * 0.04
      p.setXYZ(i, p.getX(i) * k, y + Math.sin(a * 7) * 0.06, p.getZ(i) * k)
    }
    g.computeVertexNormals()
    const ng = g.toNonIndexed()
    g.dispose()
    // Rock texture wraps around the sides: u = angle × circumference.
    const uv = ng.attributes.uv as THREE.BufferAttribute
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * TAU * I.r) / 2.2, (uv.getY(i) * h) / 2.2)
    kit.add(ng, rockMat, m4.makeTranslation(I.x, bed + h / 2, I.z))
    kit.own(ctx.collision.addCylinder({ x: I.x, y: bed, z: I.z, r: I.r, h, surface: 'grass' }))
  }
  const grassMat = new THREE.MeshStandardMaterial({ map: ctx.textures.get('grass_albedo'), normalMap: ctx.textures.get('grass_normal'), roughness: 0.95, color: 0xd8e6b8 })
  {
    const g = new THREE.CircleGeometry(I.r + 0.14, 30, 0, TAU)
    g.rotateX(-Math.PI / 2)
    const p = g.attributes.position as THREE.BufferAttribute
    const uv = g.attributes.uv as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) {
      const r = Math.hypot(p.getX(i), p.getZ(i))
      p.setY(i, 0.06 * (1 - (r / I.r) ** 2))
      uv.setXY(i, p.getX(i) / 2.5, p.getZ(i) / 2.5)
    }
    g.computeVertexNormals()
    kit.add(g, grassMat, m4.makeTranslation(I.x, I.topY, I.z))
  }
  // Mossy rim stones, open toward the lily pads (south).
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU + (rand() - 0.5) * 0.15
    if (a > 0.95 && a < 2.2) continue
    const s = 0.35 + rand() * 0.25
    q.setFromAxisAngle(v.set(0, 1, 0), rand() * TAU)
    kit.add(boulderGeometry(rand, s * 1.3, s * 0.45, s, { flatTop: true, uvScale: 1.2 }), 'mossStone', m4.compose(v.set(I.x + Math.cos(a) * (I.r - 0.05), I.topY - 0.05, I.z + Math.sin(a) * (I.r - 0.05)), q, one))
  }
  // Boulders at the waterline.
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + rand() * 0.5
    if (a > 1.0 && a < 2.1) continue
    const s = 0.6 + rand() * 0.6
    q.setFromAxisAngle(v.set(0, 1, 0), rand() * TAU)
    kit.add(boulderGeometry(rand, s * 1.4, s * 0.8, s), rockMat, m4.compose(v.set(I.x + Math.cos(a) * (I.r + 1.0), level + 0.05, I.z + Math.sin(a) * (I.r + 1.0)), q, one))
  }

  /* ── shrine: stone lantern, shard dais, cairn ──────────────── */
  {
    const lx = I.x - 1.55
    const lz = I.z - 1.25
    const y = I.topY
    kit.box({ x: lx, y: y - 0.05, z: lz, w: 0.75, h: 0.3, d: 0.75, yaw: 0.6, mat: 'mossStone', uvScale: 1 })
    kit.cylinder({ x: lx, y: y + 0.25, z: lz, r: 0.17, h: 0.75, segments: 10, mat: 'mossStone', uvScale: 1 })
    kit.box({ x: lx, y: y + 0.98, z: lz, w: 0.62, h: 0.12, d: 0.62, yaw: 0.6, mat: 'mossStone', uvScale: 1 })
    // Firebox: four corner posts around a glowing core.
    const c = Math.cos(0.6)
    const sn = Math.sin(0.6)
    for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const px = (ox * c + oz * sn) * 0.2
      const pz = (-ox * sn + oz * c) * 0.2
      kit.box({ x: lx + px, y: y + 1.1, z: lz + pz, w: 0.08, h: 0.38, d: 0.08, yaw: 0.6, mat: 'mossStone', uvScale: 1 })
    }
    kit.box({ x: lx, y: y + 1.13, z: lz, w: 0.3, h: 0.3, d: 0.3, yaw: 0.6, mat: 'glow', castShadow: false })
    const roof = new THREE.ConeGeometry(0.52, 0.34, 4, 1)
    roof.rotateY(Math.PI / 4 + 0.6)
    kit.add(roof, 'mossStone', m4.makeTranslation(lx, y + 1.65, lz))
    kit.add(new THREE.SphereGeometry(0.08, 8, 6), 'mossStone', m4.makeTranslation(lx, y + 1.86, lz))
    kit.own(ctx.collision.addCylinder({ x: lx, y: y - 0.1, z: lz, r: 0.42, h: 2.0, surface: 'stone' }))

    // Low round dais under the shard, ringed with tiny glowing pebbles.
    kit.cylinder({ x: I.x, y: y - 0.05, z: I.z, r: 0.95, rTop: 0.9, h: 0.2, segments: 20, mat: 'mossStone', uvScale: 1.2, collide: true })
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU
      kit.add(new THREE.IcosahedronGeometry(0.05, 0), 'glow', m4.makeTranslation(I.x + Math.cos(a) * 1.15, y + 0.04, I.z + Math.sin(a) * 1.15), { castShadow: false })
    }
    // Cairn of balanced stones.
    let cy = y
    for (let k = 0; k < 4; k++) {
      const s = 0.3 - k * 0.055
      q.setFromAxisAngle(v.set(0, 1, 0), rand() * TAU)
      kit.add(boulderGeometry(rand, s * 1.3, s * 0.55, s, { uvScale: 1 }), 'mossStone', m4.compose(v.set(I.x + 1.75, cy + s * 0.5, I.z - 0.9), q, one))
      cy += s * 0.95
    }
    kit.own(ctx.collision.addCylinder({ x: I.x + 1.75, y: y - 0.1, z: I.z - 0.9, r: 0.38, h: cy - y + 0.1, surface: 'stone' }))
  }

  /* ── jetty ─────────────────────────────────────────────────── */
  const deck = level + 0.55
  {
    const len = JETTY.z0 - JETTY.z1
    const board = 0.32
    const n = Math.floor(len / board)
    for (let i = 0; i < n; i++) {
      const z = JETTY.z0 - (i + 0.5) * (len / n)
      kit.box({ x: JETTY.x + (rand() - 0.5) * 0.06, y: deck - 0.07 + (rand() - 0.5) * 0.015, z, w: JETTY.width + (rand() - 0.5) * 0.1, h: 0.07, d: len / n - 0.03, yaw: (rand() - 0.5) * 0.03, mat: 'planks', uvScale: 1.6 })
    }
    for (const side of [-1, 1]) {
      kit.box({ x: JETTY.x + side * 0.75, y: deck - 0.27, z: (JETTY.z0 + JETTY.z1) / 2, w: 0.16, h: 0.2, d: len, mat: 'darkPlanks', uvScale: 1.6 })
    }
    for (let z = JETTY.z0 - 0.6; z >= JETTY.z1 - 0.01; z -= 2) {
      for (const side of [-1, 1]) {
        const x = JETTY.x + side * (JETTY.width / 2 + 0.05)
        const g = kit.ground(x, z)
        const end = z - 2 < JETTY.z1
        const top = deck + (end ? 0.75 : 0.12)
        kit.cylinder({ x, y: g - 0.4, z, r: 0.12, h: top - g + 0.4, segments: 8, mat: 'darkPlanks', uvScale: 1.2, collide: end ? { surface: 'wood' } : false })
        if (end && side > 0) kit.box({ x, y: top, z, w: 0.16, h: 0.16, d: 0.16, mat: 'glow', castShadow: false })
      }
    }
    kit.solidBox(JETTY.x, deck - 0.3, (JETTY.z0 + JETTY.z1) / 2, JETTY.width + 0.1, 0.3, len, 0, { surface: 'wood' })
  }

  kit.finalize()

  /* ── lily pads (instanced, dynamic colliders) ──────────────── */
  const padMat = new THREE.MeshStandardMaterial({ color: 0x6b9440, roughness: 0.5, metalness: 0 })
  padMat.onBeforeCompile = shader => {
    shader.uniforms.uPadNoise = { value: ctx.textures.get('noise') }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vPad;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPad = position.xz;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uPadNoise;\nvarying vec2 vPad;')
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        float pr = length(vPad);
        float pa = atan(vPad.y, vPad.x);
        float vein = pow(abs(cos(pa * 9.0)), 48.0) * smoothstep(0.06, 0.3, pr) * (1.0 - smoothstep(0.82, 0.97, pr));
        float mott = texture2D(uPadNoise, vPad * 0.55 + 0.37).r;
        diffuseColor.rgb *= 0.72 + 0.45 * mott;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.5 + vec3(0.05, 0.06, 0.0), vein * 0.55);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.3, 0.16), smoothstep(0.9, 1.0, pr) * 0.55);`,
      )
  }
  padMat.customProgramCacheKey = () => 'starfall-lilypad'
  const padGeo = padGeometry()
  const padMesh = new THREE.InstancedMesh(padGeo, padMat, PADS.length)
  padMesh.receiveShadow = true
  padMesh.name = 'lake:lilypads'
  const flowerGeo = flowerGeometry()
  const flowerMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, emissive: 0x3a1a24, emissiveIntensity: 0.35 })
  const flowerCount = PADS.filter(p => p[3]).length
  const flowerMesh = new THREE.InstancedMesh(flowerGeo, flowerMat, flowerCount)
  flowerMesh.castShadow = true
  flowerMesh.name = 'lake:lotus'
  const tint = new THREE.Color()
  const pads: Pad[] = []
  let fi = 0
  PADS.forEach(([x, z, r, flower], i) => {
    const top = level + 0.06
    const col = ctx.collision.addCylinder({ x, y: top - 0.3, z, r: r * 0.95, h: 0.3, dynamic: true, surface: 'leaves', tag: 'lilypad' })
    const pad: Pad = { col, x, z, r, phase: rand() * TAU, dip: 0, dipV: 0, pressed: 0, flower: flower ? fi++ : -1 }
    col.onStand = () => {
      pad.pressed = 0.1
    }
    col.onLand = impact => {
      pad.dipV += 0.25 + impact * 0.035
    }
    kit.own(col)
    pads.push(pad)
    padMesh.setColorAt(i, tint.setHSL(0.24 + rand() * 0.05, 0.42 + rand() * 0.15, 0.4 + rand() * 0.08))
  })
  kit.addObject(padMesh)
  kit.addObject(flowerMesh)

  const mtx = new THREE.Matrix4()
  const pos = new THREE.Vector3()
  const rot = new THREE.Quaternion()
  const scl = new THREE.Vector3()
  const yAxis = new THREE.Vector3(0, 1, 0)
  const place = (t: number, dt: number) => {
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i]
      // Spring towards the pressed depth; a landing kicks it down further.
      const target = p.pressed > 0 ? 0.09 : 0
      p.pressed -= dt
      p.dipV += ((target - p.dip) * 60 - p.dipV * 7) * dt
      p.dip += p.dipV * dt
      const bob = Math.sin(t * 1.3 + p.phase) * 0.015
      const y = level + 0.06 - p.dip + bob
      if (dt > 0) ctx.collision.move(p.col, p.x, y - 0.3, p.z, 0, dt)
      rot.setFromAxisAngle(yAxis, p.phase + Math.sin(t * 0.2 + p.phase) * 0.06)
      mtx.compose(pos.set(p.x, y - 0.035, p.z), rot, scl.set(p.r, 1, p.r))
      padMesh.setMatrixAt(i, mtx)
      if (p.flower >= 0) {
        mtx.compose(pos.set(p.x + p.r * 0.35, y - 0.01, p.z - p.r * 0.2), rot, scl.set(1, 1, 1))
        flowerMesh.setMatrixAt(p.flower, mtx)
      }
    }
    padMesh.instanceMatrix.needsUpdate = true
    flowerMesh.instanceMatrix.needsUpdate = true
  }
  place(0, 0)
  padMesh.computeBoundingSphere()
  flowerMesh.computeBoundingSphere()

  return {
    update(dt, t) {
      place(t, dt)
    },
    dispose: () => {
      padMesh.dispose()
      flowerMesh.dispose()
      kit.dispose()
      grassMat.dispose()
      padMat.dispose()
      flowerMat.dispose()
    },
  }
}
