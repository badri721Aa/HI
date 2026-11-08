/**
 * Silver Falls (Shard 4).
 *
 * A stream runs across an overhanging rock shelf on the mesa's lip and pours off its front
 * edge as a wide water curtain into the pool. Behind the curtain, a stone ledge holds the
 * shard; a line of mossy stepping stones crosses the deep pool to reach it. The south face
 * of the mesa is dressed with big rock masses so it reads as a cliff.
 *
 * Draw calls: rock, moss stone, water (curtain + stream + pool foam, one mesh), mist points.
 */
import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Ctx } from '../../types'
import { FALLS } from '../level'
import { ZoneKit, type ZonePart } from './kit'

const TAU = Math.PI * 2
const G = 9.81

function rng(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), s | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Lumpy rock from a subdivided icosahedron: smooth low-frequency bumps, box-projected
 * world UVs (metres / uvScale) so the rock texture never stretches. Unit radius, then scaled.
 */
export function boulderGeometry(rand: () => number, sx: number, sy: number, sz: number, opts: { flatTop?: boolean; uvScale?: number } = {}): THREE.BufferGeometry {
  const base = new THREE.IcosahedronGeometry(1, 2)
  base.deleteAttribute('uv')
  base.deleteAttribute('normal')
  const g = mergeVertices(base)
  base.dispose()
  const p = g.attributes.position as THREE.BufferAttribute
  const k1 = 1.3 + rand() * 1.2
  const k2 = 2.6 + rand() * 1.8
  const o1 = rand() * TAU
  const o2 = rand() * TAU
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const y = p.getY(i)
    const z = p.getZ(i)
    const bump = 1 + 0.16 * Math.sin(x * k1 + o1) * Math.cos(z * k1 - o2) + 0.08 * Math.sin(y * k2 + z * k2 + o2) + (rand() - 0.5) * 0.05
    let ny = y * bump
    if (opts.flatTop && ny > 0.55) ny = 0.55 + (ny - 0.55) * 0.15
    p.setXYZ(i, x * bump * sx, ny * sy, z * bump * sz)
  }
  g.computeVertexNormals()
  const out = g.toNonIndexed()
  g.dispose()
  boxProjectUV(out, opts.uvScale ?? 2.5)
  return out
}

/** Per-face planar UVs along the face's dominant axis (non-indexed geometry). */
function boxProjectUV(g: THREE.BufferGeometry, uvScale: number): void {
  const p = g.attributes.position as THREE.BufferAttribute
  const uv = new Float32Array(p.count * 2)
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i)
    b.fromBufferAttribute(p, i + 1)
    c.fromBufferAttribute(p, i + 2)
    const n = b.sub(a).cross(c.sub(a))
    const ax = Math.abs(n.x)
    const ay = Math.abs(n.y)
    const az = Math.abs(n.z)
    for (let k = 0; k < 3; k++) {
      const x = p.getX(i + k)
      const y = p.getY(i + k)
      const z = p.getZ(i + k)
      const [u, v] = ay >= ax && ay >= az ? [x, z] : ax >= az ? [z, y] : [x, y]
      uv[(i + k) * 2] = u / uvScale
      uv[(i + k) * 2 + 1] = v / uvScale
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
}

/* ────────────────────────────────────────────────────────────
   Water: one geometry for the stream, the curtain and the pool foam.
   aFlow = (across 0..1, flow time in seconds, fall fraction 0..1) — or (angle, radius, -1) for foam.
   ──────────────────────────────────────────────────────────── */

const CURTAIN_HALF_TOP = 3.4
const CURTAIN_HALF_BOTTOM = 4.0
/** Horizontal speed the water leaves the lip with (m/s) — sets how far the curtain bows out. */
const LIP_SPEED = 0.8
const STREAM_SPEED = 1.5
const STREAM_FROM = -57.5

function waterGeometry(poolY: number): { geo: THREE.BufferGeometry; bottomZ: number } {
  const F = FALLS
  const cols = 16
  const pos: number[] = []
  const flow: number[] = []
  const rows: Array<{ y: number; z: number; t: number; f: number; half: number }> = []
  const lipZ = F.curtainZ - 0.25
  const streamY = F.topY + 0.07
  // Stream across the shelf.
  for (let k = 0; k <= 8; k++) {
    const z = STREAM_FROM + ((lipZ - STREAM_FROM) * k) / 8
    rows.push({ y: streamY, z, t: (z - STREAM_FROM) / STREAM_SPEED, f: 0, half: CURTAIN_HALF_TOP - (8 - k) * 0.05 })
  }
  // Curl over the lip.
  const r = 0.35
  const tLip = rows[rows.length - 1].t
  for (let k = 1; k <= 4; k++) {
    const phi = (k / 4) * (Math.PI / 2)
    rows.push({ y: streamY - r + r * Math.cos(phi), z: lipZ + r * Math.sin(phi), t: tLip + (phi * r) / STREAM_SPEED, f: 0, half: CURTAIN_HALF_TOP })
  }
  // Free fall (parabola).
  const y0 = streamY - r
  const z0 = lipZ + r
  const t0 = rows[rows.length - 1].t
  const depth = y0 - (poolY - 0.05)
  let bottomZ = z0
  for (let k = 1; k <= 24; k++) {
    const d = depth * Math.pow(k / 24, 1.6)
    const tf = Math.sqrt((2 * d) / G)
    const f = d / depth
    bottomZ = z0 + LIP_SPEED * tf
    rows.push({ y: y0 - d, z: bottomZ, t: t0 + tf, f: Math.max(0.001, f), half: CURTAIN_HALF_TOP + (CURTAIN_HALF_BOTTOM - CURTAIN_HALF_TOP) * Math.sqrt(f) })
  }
  const index: number[] = []
  // Pool foam first (it is drawn behind the curtain within the same mesh).
  const ring = 20
  const rad = 5
  const fx = F.x
  const fz = bottomZ - 0.4
  for (let j = 0; j <= rad; j++) {
    for (let i = 0; i <= ring; i++) {
      const a = (i / ring) * TAU
      const rr = j / rad
      pos.push(fx + Math.cos(a) * rr * 6.2, poolY + 0.04, fz + Math.sin(a) * rr * 3.2)
      flow.push(i / ring, rr, -1)
    }
  }
  for (let j = 0; j < rad; j++) {
    for (let i = 0; i < ring; i++) {
      const a = j * (ring + 1) + i
      const b = a + ring + 1
      index.push(a, b, a + 1, a + 1, b, b + 1)
    }
  }
  const start = pos.length / 3
  for (const row of rows) {
    for (let i = 0; i <= cols; i++) {
      const u = i / cols
      const x = F.x + (u - 0.5) * 2 * row.half + Math.sin(u * 17 + row.t) * 0.05
      pos.push(x, row.y, row.z + Math.sin(u * 11) * 0.06 * row.f)
      flow.push(u, row.t, row.f)
    }
  }
  for (let j = 0; j < rows.length - 1; j++) {
    for (let i = 0; i < cols; i++) {
      const a = start + j * (cols + 1) + i
      const b = a + cols + 1
      index.push(a, a + 1, b, a + 1, b + 1, b)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 3))
  geo.setIndex(index)
  geo.computeVertexNormals()
  geo.computeBoundingSphere()
  return { geo, bottomZ }
}

function waterMaterial(noise: THREE.Texture, uTime: { value: number }): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0, transparent: true, depthWrite: false, side: THREE.DoubleSide })
  m.onBeforeCompile = shader => {
    shader.uniforms.uFallTime = uTime
    shader.uniforms.uFallNoise = { value: noise }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aFlow;\nvarying vec3 vFlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFlow = aFlow;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uFallTime;\nuniform sampler2D uFallNoise;\nvarying vec3 vFlow;\nfloat fallFoam;')
      .replace(
        '#include <map_fragment>',
        /* glsl */ `#include <map_fragment>
        vec3 tint = vec3(0.62, 0.78, 0.82);
        if (vFlow.z < -0.5) {
          // Churning foam ring where the curtain hits the pool.
          float r = vFlow.y;
          float n1 = texture2D(uFallNoise, vec2(vFlow.x * 5.0, r * 0.9 - uFallTime * 0.32)).r;
          float n2 = texture2D(uFallNoise, vec2(vFlow.x * 11.0 + 0.37, r * 1.8 - uFallTime * 0.55)).r;
          float churn = smoothstep(0.45, 0.78, n1 * 0.55 + n2 * 0.55);
          fallFoam = clamp(churn * (1.0 - smoothstep(0.35, 1.0, r)) + (1.0 - smoothstep(0.0, 0.45, r)) * 0.75, 0.0, 1.0);
          diffuseColor.rgb = mix(tint, vec3(1.0), fallFoam);
          diffuseColor.a = fallFoam * 0.85;
        } else {
          float u = vFlow.x;
          float t = vFlow.y;
          float f = vFlow.z;
          float broad = texture2D(uFallNoise, vec2(u * 2.3, t * 0.33 - uFallTime * 0.33)).r;
          float fine = texture2D(uFallNoise, vec2(u * 9.0 + 0.21, t * 0.8 - uFallTime * 0.8)).r;
          float streak = smoothstep(0.38, 0.8, broad * 0.55 + fine * 0.55);
          float edge = smoothstep(0.0, 0.07 + fine * 0.05, u) * smoothstep(1.0, 0.93 - fine * 0.05, u);
          float lip = f > 0.0 ? 1.0 - smoothstep(0.0, 0.07, f) : 0.0;
          float base = smoothstep(0.82, 1.0, f);
          fallFoam = clamp(streak * (f > 0.0 ? 0.75 : 0.35) + lip * 0.6 + base * 0.8, 0.0, 1.0);
          diffuseColor.rgb = mix(tint, vec3(1.0), fallFoam);
          diffuseColor.a = edge * (f > 0.0 ? 0.42 + 0.5 * fallFoam : 0.7 + 0.25 * fallFoam);
        }`,
      )
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(0.1, 0.12, 0.13) + fallFoam * vec3(0.22);')
  }
  m.customProgramCacheKey = () => 'starfall-falls-water'
  return m
}

/* ────────────────────────────────────────────────────────────
   Mist: GPU-animated billboards rising from the plunge pool.
   ──────────────────────────────────────────────────────────── */

function mistPoints(count: number, x: number, y: number, z: number, sprite: THREE.Texture, rand: () => number) {
  const pos = new Float32Array(count * 3)
  const seed = new Float32Array(count * 4)
  for (let i = 0; i < count; i++) {
    pos[i * 3] = x + (rand() - 0.5) * 2 * CURTAIN_HALF_BOTTOM
    pos[i * 3 + 1] = y
    pos[i * 3 + 2] = z + (rand() - 0.5) * 1.2
    seed[i * 4] = rand()
    seed[i * 4 + 1] = rand()
    seed[i * 4 + 2] = 3 + rand() * 2.5
    seed[i * 4 + 3] = rand()
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4))
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(x, y + 3, z + 1.5), 9)
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      { uTime: { value: 0 }, uPx: { value: 400 }, uColor: { value: new THREE.Color(1, 1, 1) }, uSprite: { value: null } },
    ]),
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      attribute vec4 aSeed;
      uniform float uTime;
      uniform float uPx;
      varying float vAlpha;
      void main() {
        float life = aSeed.z;
        float k = fract(uTime / life + aSeed.x);
        vec3 p = position;
        p.y += k * (3.5 + aSeed.y * 3.0);
        p.z += k * (1.5 + aSeed.w * 2.5);
        p.x += sin(uTime * 0.6 + aSeed.y * 6.28) * 0.6 * k;
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = (1.2 + k * 3.2) * uPx / max(0.5, -mvPosition.z);
        vAlpha = smoothstep(0.0, 0.15, k) * (1.0 - smoothstep(0.45, 1.0, k)) * (0.18 + aSeed.w * 0.12);
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform sampler2D uSprite;
      uniform vec3 uColor;
      varying float vAlpha;
      void main() {
        float a = texture2D(uSprite, gl_PointCoord).a * vAlpha;
        if (a < 0.004) discard;
        gl_FragColor = vec4(uColor, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    fog: true,
  })
  mat.uniforms.uSprite.value = sprite
  const pts = new THREE.Points(geo, mat)
  pts.frustumCulled = true
  return pts
}

/* ────────────────────────────────────────────────────────────
   Builder
   ──────────────────────────────────────────────────────────── */

/** Stepping stones across the deep pool to the ledge's east end: x, z, top (abs), radius. */
const STONES: Array<[number, number, number, number]> = [
  [-63.3, -37.3, 2.75, 0.9],
  [-61.6, -40.0, 2.85, 0.85],
  [-62.9, -42.9, 2.95, 0.9],
  [-61.4, -45.7, 3.1, 0.85],
  [-60.6, -48.5, 3.45, 0.8],
  [-60.0, -51.0, 3.85, 0.75],
]

export function buildFalls(ctx: Ctx): ZonePart {
  const kit = new ZoneKit(ctx, 'falls')
  const F = FALLS
  const rand = rng(0xfa115)
  const poolY = F.poolLevel
  const m4 = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const v = new THREE.Vector3()
  const one = new THREE.Vector3(1, 1, 1)
  const rockMat = kit.mat('rock', { color: 0xc9bfb2, key: 'cliff' })

  const rock = (x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw: number, collide: boolean, flatTop = false) => {
    q.setFromEuler(new THREE.Euler((rand() - 0.5) * 0.2, yaw, (rand() - 0.5) * 0.2))
    kit.add(boulderGeometry(rand, sx, sy, sz, { flatTop }), rockMat, m4.compose(v.set(x, y, z), q, one))
    if (collide) kit.own(ctx.collision.addCylinder({ x, y: y - sy, z, r: Math.min(sx, sz) * 0.85, h: sy * (flatTop ? 1.5 : 1.7), surface: 'rock' }))
  }

  /* ── overhanging shelf + stream banks ──────────────────────── */
  const shelfBack = -59.5
  const shelfBottom = F.topY - 1.8
  {
    const w = 11.2
    const d = F.curtainZ - shelfBack
    const g = new THREE.BoxGeometry(w, 1.8, d, 10, 3, 10)
    const p = g.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i)
      const y = p.getY(i)
      const z = p.getZ(i)
      const top = y > 0.89
      const front = z > d / 2 - 0.01
      const n = Math.sin(x * 1.7 + z * 0.9) * Math.cos(z * 1.3 - x * 0.4)
      if (top) {
        // Keep the walkable top flat; only rough up its edges.
        if (Math.abs(x) > w / 2 - 0.01 || Math.abs(z) > d / 2 - 0.01) p.setY(i, y - 0.08 - Math.abs(n) * 0.15)
        continue
      }
      p.setXYZ(i, x + n * 0.3, y + (y < -0.89 ? n * 0.45 - 0.2 : n * 0.15), front ? z + n * 0.12 : z + n * 0.3)
    }
    g.computeVertexNormals()
    const ng = g.toNonIndexed()
    g.dispose()
    boxProjectUV(ng, 2.5)
    kit.add(ng, rockMat, m4.makeTranslation(F.x, shelfBottom + 0.9, shelfBack + d / 2))
    kit.solidBox(F.x, shelfBottom, shelfBack + d / 2, w, 1.8, d, 0, { surface: 'rock' })
    // Banks along the stream and the spring rocks at its head.
    for (const side of [-1, 1]) {
      for (let k = 0; k < 4; k++) {
        const s = 0.6 + rand() * 0.4
        rock(F.x + side * (4.35 + rand() * 0.4), F.topY + s * 0.45, -57.6 + k * 2.1, s * 1.1, s, s * 1.2, rand() * TAU, true)
      }
    }
    for (let k = 0; k < 3; k++) rock(F.x - 2.4 + k * 2.4, F.topY + 0.6, -58.9 + rand() * 0.4, 1.3, 1.0, 1.0, rand() * TAU, true)
    // Bulk rock wedged under the shelf so it reads as part of the cliff.
    rock(F.x - 4.9, shelfBottom - 0.9, -56.2, 2.2, 2.6, 2.6, 0.4, false)
    rock(F.x + 4.9, shelfBottom - 0.9, -56.0, 2.0, 2.8, 2.6, 1.3, false)
    rock(F.x, shelfBottom - 0.6, -57.2, 4.0, 1.6, 1.8, 0, false)
  }

  /* ── ledge behind the curtain ──────────────────────────────── */
  {
    const x0 = F.x - 5
    const x1 = F.x + 5
    const zBack = -53.4
    const zFront = F.curtainZ - 0.4
    const d = zFront - zBack
    const zc = (zBack + zFront) / 2
    const y0 = Math.min(kit.ground(F.x, zFront), kit.ground(x0, zFront), kit.ground(x1, zFront)) - 0.3
    // Rough rock body, then a mossy flagstone top that overhangs the front a little.
    const half = (F.ledgeY - 0.4 - y0) / 2
    for (let k = 0; k < 4; k++) rock(x0 + 1.25 + k * 2.5, y0 + half, zc + 0.2, 1.6, half, d / 2 + 0.1, rand() * 0.6, false, true)
    for (let k = 0; k < 5; k++) {
      const x = x0 + 1.0 + k * 2.0
      const w = 1.95 + rand() * 0.1
      kit.box({ x, y: F.ledgeY - 0.38 + (rand() - 0.5) * 0.03, z: zc + 0.08, w, h: 0.4, d: d + 0.15, yaw: (rand() - 0.5) * 0.04, mat: 'mossStone', uvScale: 1.4, collide: false })
    }
    kit.solidBox(F.x, y0, zc, x1 - x0, F.ledgeY - y0, d, 0, { surface: 'stone' })
    // Pebbles and a mossy hump at the back wall.
    for (let k = 0; k < 6; k++) rock(x0 + 0.8 + rand() * 8.4, F.ledgeY + 0.08, zBack + 0.5 + rand() * 0.5, 0.25 + rand() * 0.2, 0.15, 0.25, rand() * TAU, false)
  }

  /* ── stepping stones over the deep pool ────────────────────── */
  for (const [x, z, top, r] of STONES) {
    const ground = kit.ground(x, z)
    const h = top - ground + 0.5
    const g = new THREE.CylinderGeometry(r, r * 1.2, h, 11, 3)
    const p = g.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i)
      const k = 1 + (Math.sin(Math.atan2(p.getZ(i), p.getX(i)) * 3 + x) * 0.07 + (rand() - 0.5) * 0.06) * (y < h / 2 - 0.01 ? 1 : 0.6)
      p.setXYZ(i, p.getX(i) * k, y < h / 2 - 0.01 ? y : y + (rand() - 0.5) * 0.04, p.getZ(i) * k)
    }
    g.computeVertexNormals()
    const ng = g.toNonIndexed()
    g.dispose()
    boxProjectUV(ng, 1.4)
    kit.add(ng, 'mossStone', m4.makeTranslation(x, top - h / 2, z))
    kit.own(ctx.collision.addCylinder({ x, y: ground - 0.5, z, r: r * 0.95, h, surface: 'stone', tag: 'stepping-stone' }))
  }

  /* ── cliff dressing along the mesa's south face ────────────── */
  {
    /** First z (marching north from the pool) where the ground rises above y. */
    const cliffZ = (x: number, y: number) => {
      for (let z = -40; z > -66; z -= 0.25) if (kit.ground(x, z) > y) return z
      return -66
    }
    for (let x = -84; x <= -48; x += 3.2 + rand() * 1.6) {
      const nearFalls = x > F.x - 9 && x < F.x + 9
      for (const band of [0, 1, 2]) {
        if (nearFalls && band < 2) continue
        const y = [4.5, 9.5, 13.8][band] + (rand() - 0.5) * 1.5
        const z = cliffZ(x, y) - 0.6
        const s = 1.6 + rand() * 1.6
        const foot = band === 0 && kit.ground(x, z + s) < y + 1
        rock(x + (rand() - 0.5) * 1.2, y, z, s * (1 + rand() * 0.4), s * (1.1 + rand() * 0.6), s, rand() * TAU, foot)
      }
    }
    // Pillars of rock framing the falls.
    rock(F.x - 6.4, 7.5, cliffZ(F.x - 6.4, 7.5) - 0.2, 1.6, 6.5, 1.8, 0.3, false)
    rock(F.x + 6.4, 7.0, cliffZ(F.x + 6.4, 7.0) - 0.2, 1.7, 6.0, 1.9, 1.1, false)
    rock(F.x - 6.6, 3.0, -52.2, 1.5, 1.8, 1.4, 0.7, true)
    // Wet boulders around the pool rim.
    for (const [x, z, s] of [[-73.5, -46.5, 1.2], [-74.8, -41.0, 0.9], [-55.2, -47.6, 1.0], [-54.5, -39.2, 0.8], [-70.5, -35.8, 0.7]] as const) {
      rock(x, kit.ground(x, z) + s * 0.35, z, s * 1.2, s * 0.8, s, rand() * TAU, true)
    }
  }

  /* ── water ─────────────────────────────────────────────────── */
  const uTime = { value: 0 }
  const water = waterGeometry(poolY)
  const waterMat = waterMaterial(ctx.textures.get('noise'), uTime)
  const waterMesh = new THREE.Mesh(water.geo, waterMat)
  waterMesh.renderOrder = 2
  kit.addObject(waterMesh)

  const mistCount = Math.round(70 * Math.min(1.4, Math.max(0.4, ctx.quality.particles / 2500)))
  const mist = mistPoints(mistCount, F.x, poolY + 0.2, water.bottomZ - 0.2, ctx.textures.get('glow'), rand)
  mist.renderOrder = 3
  kit.addObject(mist)
  const mistMat = mist.material as THREE.ShaderMaterial

  kit.finalize()

  const size = new THREE.Vector2()
  const white = new THREE.Color(1, 1, 1)
  return {
    update(_dt, t) {
      uTime.value = t
      mistMat.uniforms.uTime.value = t
      ctx.renderer.getDrawingBufferSize(size)
      mistMat.uniforms.uPx.value = size.y * 0.5 * ctx.camera.projectionMatrix.elements[5]
      // Mist takes on the sky's colour so it never glows at night.
      ;(mistMat.uniforms.uColor.value as THREE.Color).copy(ctx.env.fogColor).lerp(white, 0.45)
    },
    dispose: () => {
      kit.dispose()
      waterMat.dispose()
      mistMat.dispose()
    },
  }
}
