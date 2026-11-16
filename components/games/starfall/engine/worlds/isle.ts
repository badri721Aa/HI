/**
 * Floating isles and the sky around them, generated (no models to load):
 *
 *   isleTop / isleUnder   a round turf top with a drooping lip, and the craggy rock that hangs
 *                         under it and tapers to points
 *   isleMaterial          paints both by world position: grass on top, turf draped over the lip,
 *                         a band of earth, then layered rock darkening with depth
 *   cloudSea / puffMaterial   the rolling sea of clouds below and the cumulus rising out of it
 *   waterRibbon / waterDisc / waterMaterial   springs, and falls that thin into mist
 *   windRibbon / windMaterial   pale streaks of wind drifting along a path
 *
 * Angles follow the engine: θ = 0 points to +z, x = sin θ · r, z = cos θ · r. Geometry is
 * returned non-shared (the caller owns it); every shader is NaN-safe and clamps its output.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Ctx } from '../types'
import { seeded } from './geo'

export type TimeUniform = { value: number }
export type PathPoint = readonly [number, number, number]

/* ── isle geometry ────────────────────────────────────────── */

/**
 * The turf on top of an isle: a flat disc of radius r at y = 0 whose lip overhangs a little and
 * droops. uv.x carries the depth below the lawn (m) for isleMaterial.
 */
export function isleTop(r: number, seed: number): THREE.BufferGeometry {
  const rnd = seeded(seed)
  const seg = Math.min(96, Math.max(12, Math.round((Math.PI * 2 * r) / 0.9)))
  const rings = [0.45, 0.8, 1]
  const pos: number[] = [0, 0, 0]
  const nrm: number[] = [0, 1, 0]
  const uv: number[] = [0, 0]
  for (let j = 0; j <= rings.length; j++) {
    const lip = j === rings.length
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2
      const sx = Math.sin(a)
      const sz = Math.cos(a)
      if (lip) {
        const rr = r + 0.08 + rnd() * 0.26
        const drop = 0.1 + rnd() * 0.18
        pos.push(sx * rr, -drop, sz * rr)
        nrm.push(sx * 0.6, 0.8, sz * 0.6)
        uv.push(drop, 0)
      } else {
        pos.push(sx * r * rings[j], 0, sz * r * rings[j])
        nrm.push(0, 1, 0)
        uv.push(0, 0)
      }
    }
  }
  const index: number[] = []
  for (let i = 0; i < seg; i++) index.push(0, 1 + i, 1 + ((i + 1) % seg))
  for (let j = 0; j < rings.length; j++) {
    for (let i = 0; i < seg; i++) {
      const a = 1 + j * seg + i
      const a1 = 1 + j * seg + ((i + 1) % seg)
      index.push(a, a + seg, a1 + seg, a, a1 + seg, a1)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(index)
  return g
}

/**
 * The rock under an isle of radius r: an earth skirt below the rim, then crags tapering to a
 * point `depth` below the top, with a few more spikes hanging beside it. Faceted; uv.x carries
 * the depth below the lawn (m). Its top ring sits at y = 0, under the turf's lip.
 */
export function isleUnder(r: number, depth: number, seed: number): THREE.BufferGeometry {
  const rnd = seeded(seed)
  const seg = Math.min(72, Math.max(10, Math.round((Math.PI * 2 * r) / 1.3)))
  const rings = Math.min(10, Math.max(4, Math.round(r / 1.6) + 3))
  const ox = (rnd() - 0.5) * 0.5 * r
  const oz = (rnd() - 0.5) * 0.5 * r
  const l2 = rnd() * 6.28
  const l3 = rnd() * 6.28
  const skirt = Math.min(depth * 0.3, 0.9 + rnd() * 0.6)
  const spikes = Array.from({ length: r > 3 ? 2 + Math.floor(rnd() * 3) : 0 }, () => {
    const a = rnd() * Math.PI * 2
    const d = (0.22 + rnd() * 0.4) * r
    return { x: Math.sin(a) * d, z: Math.cos(a) * d, w: r * (0.11 + rnd() * 0.1), d: depth * (0.18 + rnd() * 0.34) }
  })
  const spiked = (x: number, z: number, u: number) => {
    let s = 0
    for (const k of spikes) s += k.d * Math.exp(-((x - k.x) ** 2 + (z - k.z) ** 2) / (k.w * k.w))
    return s * Math.min(1, Math.max(0, (u - 0.08) / 0.3))
  }
  // Rings from the rim (j = 0) inward and down; the last vertex is the tip.
  const pts: number[] = []
  for (let j = 0; j < rings; j++) {
    const u = j < 2 ? 0 : (j - 1) / (rings - 1)
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2
      let rho = r
      let y = 0
      if (j === 1) {
        rho = r * (0.985 - rnd() * 0.035)
        y = -skirt * (0.7 + rnd() * 0.6)
      } else if (j > 1) {
        const lobe = 1 + 0.2 * Math.sin(a * 2 + l2) + 0.13 * Math.sin(a * 3 + l3)
        rho = r * Math.pow(1 - u, 0.85) + (rnd() - 0.5) * 0.7 * (r / rings)
        y = -skirt - (depth - skirt) * Math.pow(u, 1.15) * lobe * (0.85 + rnd() * 0.3)
      }
      const x = Math.sin(a) * rho + ox * u * u
      const z = Math.cos(a) * rho + oz * u * u
      pts.push(x, y - spiked(x, z, u), z)
    }
  }
  pts.push(ox, -depth - spiked(ox, oz, 1), oz)
  const tip = rings * seg
  const pos: number[] = []
  const uv: number[] = []
  /** One facet, wound to face down and out (the rock is a height field hanging under the lawn). */
  const tri = (a: number, b: number, c: number) => {
    const ax = pts[a * 3]
    const ay = pts[a * 3 + 1]
    const az = pts[a * 3 + 2]
    let bx = pts[b * 3]
    let by = pts[b * 3 + 1]
    let bz = pts[b * 3 + 2]
    let cx = pts[c * 3]
    let cy = pts[c * 3 + 1]
    let cz = pts[c * 3 + 2]
    if ((bz - az) * (cx - ax) - (bx - ax) * (cz - az) > 0) {
      ;[bx, by, bz, cx, cy, cz] = [cx, cy, cz, bx, by, bz]
    }
    pos.push(ax, ay, az, bx, by, bz, cx, cy, cz)
    uv.push(-ay, 0, -by, 0, -cy, 0)
  }
  for (let j = 0; j < rings - 1; j++) {
    for (let i = 0; i < seg; i++) {
      const a = j * seg + i
      const a1 = j * seg + ((i + 1) % seg)
      tri(a, a + seg, a1 + seg)
      tri(a, a1 + seg, a1)
    }
  }
  for (let i = 0; i < seg; i++) tri((rings - 1) * seg + i, tip, (rings - 1) * seg + ((i + 1) % seg))
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.computeVertexNormals()
  return g
}

/** A whole floating rock (turf top at y = 0 plus its underside) as one geometry, e.g. to instance. */
export function isleChunk(r: number, depth: number, seed: number): THREE.BufferGeometry {
  const top = isleTop(r, seed)
  const flat = top.toNonIndexed()
  const under = isleUnder(r, depth, seed + 1)
  const merged = mergeGeometries([flat, under], false)
  top.dispose()
  flat.dispose()
  under.dispose()
  if (!merged) throw new Error('isle: merge failed')
  return merged
}

/* ── isle material ────────────────────────────────────────── */

/**
 * The isles' ground: textures are projected by world position (no UVs), chosen by the surface's
 * slope and its depth below the lawn (uv.x): grass, a turf fringe, earth, then strata of rock.
 */
export function isleMaterial(ctx: Ctx): THREE.MeshStandardMaterial {
  const tex = ctx.textures
  const mat = new THREE.MeshStandardMaterial({ map: tex.get('rock_albedo'), roughness: 0.93, metalness: 0 })
  mat.onBeforeCompile = sh => {
    sh.uniforms.tIsleGrass = { value: tex.get('grass_albedo') }
    sh.uniforms.tIsleDirt = { value: tex.get('dirt_albedo') }
    sh.uniforms.tIsleNoise = { value: tex.get('noise') }
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vIsleW;\nvarying vec3 vIsleN;\nvarying float vIsleDepth;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 isleP = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          isleP = instanceMatrix * isleP;
        #endif
        vIsleW = (modelMatrix * isleP).xyz;
        vIsleN = (vec4(transformedNormal, 0.0) * viewMatrix).xyz;
        vIsleDepth = uv.x;`,
      )
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D tIsleGrass;
        uniform sampler2D tIsleDirt;
        uniform sampler2D tIsleNoise;
        varying vec3 vIsleW;
        varying vec3 vIsleN;
        varying float vIsleDepth;`,
      )
      .replace(
        '#include <map_fragment>',
        `{
          vec3 isleN = vIsleN / max(length(vIsleN), 1e-4);
          vec3 tw = abs(isleN);
          tw = tw * tw;
          tw = tw * tw;
          tw /= max(tw.x + tw.y + tw.z, 1e-4);
          vec3 rock = texture2D(map, vIsleW.zy * 0.17).rgb * tw.x + texture2D(map, vIsleW.xy * 0.17).rgb * tw.z + texture2D(map, vIsleW.xz * 0.17).rgb * tw.y;
          float patches = texture2D(tIsleNoise, vIsleW.xz * 0.031).r;
          float grain = texture2D(tIsleNoise, vIsleW.xz * 0.19 + vIsleW.y * 0.083).r;
          // Rock in warm and cool strata, banded by height.
          float strata = texture2D(tIsleNoise, vec2(vIsleW.y * 0.09 + patches * 0.2, 0.37)).r;
          vec3 col = mix(vec3(dot(rock, vec3(0.34))), rock, 0.55) * mix(vec3(0.74, 0.72, 0.72), vec3(1.22, 1.14, 1.02), smoothstep(0.3, 0.7, strata));
          // Moss on ledges that look up.
          float moss = smoothstep(0.35, 0.8, isleN.y) * smoothstep(0.35, 0.65, grain) * smoothstep(0.6, 1.4, vIsleDepth);
          col = mix(col, vec3(0.2, 0.27, 0.1) * (0.7 + 0.6 * grain), moss * 0.7);
          // The earth under the turf.
          vec3 dirt = texture2D(tIsleDirt, vIsleW.xz * 0.27 + vIsleW.y * 0.19).rgb * vec3(0.7, 0.6, 0.5);
          col = mix(col, dirt, 1.0 - smoothstep(0.4, 1.7, vIsleDepth + (grain - 0.5) * 1.3));
          // Grass on top, and turf draped a little way over the lip.
          float sward = smoothstep(0.25, 0.75, patches * 0.7 + grain * 0.3);
          vec3 grass = texture2D(tIsleGrass, vIsleW.xz * 0.23).rgb * mix(vec3(0.7, 0.86, 0.6), vec3(1.12, 1.06, 0.74), sward);
          float onTop = smoothstep(0.5, 0.8, isleN.y) * (1.0 - smoothstep(0.3, 0.7, vIsleDepth));
          float drape = 1.0 - smoothstep(0.05, 0.35 + grain * 0.9, vIsleDepth);
          col = mix(col, grass, max(onTop, drape));
          // Deep crags sit in their own shade.
          col *= mix(1.0, 0.7, smoothstep(2.0, 24.0, vIsleDepth));
          diffuseColor.rgb = col;
        }`,
      )
  }
  mat.customProgramCacheKey = () => 'starfall-isle-v1'
  mat.name = 'isle'
  return mat
}

/* ── clouds ───────────────────────────────────────────────── */

export interface CloudLook {
  /** Sunlit tops, shaded sides and the hollows between the billows. */
  lit: THREE.ColorRepresentation
  shade: THREE.ColorRepresentation
  deep: THREE.ColorRepresentation
  /** Unit vector toward the sun. */
  sun: THREE.Vector3
}

/** The cloud sea's height field (0 … 1) at p metres from the map's centre. */
const SEA_HEIGHT = /* glsl */ `
uniform float uTime;
uniform sampler2D tSeaNoise;
float seaH(vec2 p, float lod) {
  float a = textureLod(tSeaNoise, p * 0.0037 + vec2(uTime * 0.0012, uTime * 0.0005), lod).r;
  float b = textureLod(tSeaNoise, p * 0.0131 - vec2(uTime * 0.0027, 0.0), lod + 1.0).r;
  return a * 0.68 + b * 0.32;
}`

export interface CloudSea {
  mesh: THREE.Mesh
  dispose(): void
}

/**
 * A sea of clouds: a wide sheet centred on (x, z) whose billows rise and fall `amp` metres
 * around height y, drifting slowly and lit from the sun's side.
 */
export function cloudSea(ctx: Ctx, uTime: TimeUniform, x: number, y: number, z: number, amp: number, look: CloudLook): CloudSea {
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog])
  Object.assign(uniforms, {
    uTime,
    tSeaNoise: { value: ctx.textures.get('noise') },
    tCloud: { value: ctx.textures.get('clouds') },
    uOrigin: { value: new THREE.Vector2(x, z) },
    uAmp: { value: amp },
    uSun: { value: look.sun },
    uLit: { value: new THREE.Color(look.lit) },
    uShade: { value: new THREE.Color(look.shade) },
    uDeep: { value: new THREE.Color(look.deep) },
  })
  const material = new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      uniform vec2 uOrigin;
      uniform float uAmp;
      varying vec3 vW;
      ${SEA_HEIGHT}
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        wp.y += (seaH(wp.xz - uOrigin, 3.0) - 0.5) * uAmp * 2.0;
        vW = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform sampler2D tCloud;
      uniform vec2 uOrigin;
      uniform float uAmp;
      uniform vec3 uSun;
      uniform vec3 uLit;
      uniform vec3 uShade;
      uniform vec3 uDeep;
      varying vec3 vW;
      ${SEA_HEIGHT}
      void main() {
        vec2 p = vW.xz - uOrigin;
        float e = 3.0 + distance(vW.xz, cameraPosition.xz) * 0.03;
        float h = seaH(p, 0.0);
        float hx = seaH(p + vec2(e, 0.0), 0.0);
        float hz = seaH(p + vec2(0.0, e), 0.0);
        // Wisps drifting over the billows.
        float wisp = texture2D(tCloud, p * 0.011 + vec2(uTime * 0.004, uTime * 0.002)).r;
        vec3 n = normalize(vec3((h - hx) * uAmp * 16.0 / e, 1.0, (h - hz) * uAmp * 16.0 / e));
        float lit = clamp(dot(n, uSun) * 0.7 + 0.36, 0.0, 1.0);
        float crest = smoothstep(0.34, 0.66, h);
        vec3 col = mix(uShade, uLit, clamp(lit * (0.45 + 0.55 * crest) + wisp * 0.22, 0.0, 1.0));
        col = mix(uDeep, col, smoothstep(0.24, 0.47, h + wisp * 0.1));
        gl_FragColor = vec4(clamp(col, 0.0, 1.5), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    uniforms,
    fog: true,
  })
  material.name = 'cloud-sea'
  // Rings tighten toward the middle, where the billows are seen from close above.
  const rings = 54
  const seg = 96
  const pos: number[] = [0, 0, 0]
  for (let j = 1; j <= rings; j++) {
    const rho = 560 * Math.pow(j / rings, 1.7)
    for (let i = 0; i < seg; i++) {
      const a = ((i + (j % 2) * 0.5) / seg) * Math.PI * 2
      pos.push(Math.sin(a) * rho, 0, Math.cos(a) * rho)
    }
  }
  const index: number[] = []
  for (let i = 0; i < seg; i++) index.push(0, 1 + i, 1 + ((i + 1) % seg))
  for (let j = 0; j < rings - 1; j++) {
    for (let i = 0; i < seg; i++) {
      const a = 1 + j * seg + i
      const a1 = 1 + j * seg + ((i + 1) % seg)
      index.push(a, a + seg, a1 + seg, a, a1 + seg, a1)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geometry.setIndex(index)
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 570)
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.set(x, y, z)
  mesh.name = 'cloud-sea'
  return {
    mesh,
    dispose() {
      geometry.dispose()
      material.dispose()
    },
  }
}

/**
 * Cumulus for an InstancedMesh of unit spheres (IcosahedronGeometry(1, 3)): each sphere is
 * lumped by cloud noise, shaded softly from the sun's side and melts into `rim` at its outline.
 */
export function puffMaterial(ctx: Ctx, uTime: TimeUniform, look: CloudLook, rim: THREE.Color): THREE.ShaderMaterial {
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog])
  Object.assign(uniforms, {
    uTime,
    tCloud: { value: ctx.textures.get('clouds') },
    uSun: { value: look.sun },
    uLit: { value: new THREE.Color(look.lit) },
    uShade: { value: new THREE.Color(look.shade) },
    uRim: { value: rim },
  })
  const mat = new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      uniform float uTime;
      uniform sampler2D tCloud;
      varying vec3 vW;
      varying vec3 vN;
      void main() {
        mat4 m = modelMatrix;
        #ifdef USE_INSTANCING
          m = modelMatrix * instanceMatrix;
        #endif
        vec2 o = m[3].xz * 0.017;
        float lump = textureLod(tCloud, position.xy * 0.19 + position.z * 0.11 + o + uTime * 0.0015, 0.0).r * 0.65
          + textureLod(tCloud, position.zy * 0.43 - position.x * 0.27 + o.yx, 0.0).r * 0.35;
        vec4 wp = m * vec4(position * (0.76 + lump * 0.48), 1.0);
        vW = wp.xyz;
        vN = mat3(m) * normal;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform vec3 uSun;
      uniform vec3 uLit;
      uniform vec3 uShade;
      uniform vec3 uRim;
      varying vec3 vW;
      varying vec3 vN;
      void main() {
        vec3 n = vN / max(length(vN), 1e-4);
        vec3 v = cameraPosition - vW;
        v /= max(length(v), 1e-4);
        float lit = clamp(dot(n, uSun) * 0.55 + 0.5, 0.0, 1.0);
        vec3 col = mix(uShade, uLit, lit) * mix(0.82, 1.0, clamp(n.y * 0.5 + 0.5, 0.0, 1.0));
        float edge = 1.0 - clamp(dot(n, v), 0.0, 1.0);
        col = mix(col, uRim, edge * edge * 0.6);
        gl_FragColor = vec4(clamp(col, 0.0, 1.5), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    uniforms,
    fog: true,
  })
  mat.name = 'cloud-puff'
  return mat
}

/* ── water ────────────────────────────────────────────────── */

/**
 * A strip of water along `path` (smoothed through its points), `width[i]` wide at each point.
 * Attributes: position, uv (−1 … 1 across, metres along) and aDrop (metres fallen below the
 * path's start: 0 on a stream, growing down a fall).
 */
export function waterRibbon(path: readonly PathPoint[], width: readonly number[], step = 0.7): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(path.map(p => new THREE.Vector3(p[0], p[1], p[2])), false, 'centripetal')
  const n = Math.max(2, Math.ceil(curve.getLength() / step))
  const across = [-1, -0.5, 0, 0.5, 1]
  const cols = across.length
  const pos: number[] = []
  const uv: number[] = []
  const drop: number[] = []
  const p = new THREE.Vector3()
  const t = new THREE.Vector3()
  const prev = new THREE.Vector3()
  let sx = 1
  let sz = 0
  let along = 0
  for (let i = 0; i <= n; i++) {
    const u = i / n
    curve.getPointAt(u, p)
    curve.getTangentAt(u, t)
    // Sideways = the horizontal tangent turned a quarter; a sheer drop keeps the last one.
    const h = Math.hypot(t.x, t.z)
    if (h > 0.05) {
      sx = t.z / h
      sz = -t.x / h
    }
    if (i > 0) along += p.distanceTo(prev)
    prev.copy(p)
    const f = u * (width.length - 1)
    const k = Math.min(width.length - 2, Math.floor(f))
    const half = 0.5 * (width[k] + (width[k + 1] - width[k]) * (f - k))
    for (const a of across) {
      pos.push(p.x + sx * a * half, p.y, p.z + sz * a * half)
      uv.push(a, along)
      drop.push(Math.max(0, path[0][1] - p.y))
    }
  }
  const index: number[] = []
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = i * cols + c
      index.push(a, a + cols, a + 1, a + 1, a + cols, a + cols + 1)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setAttribute('aDrop', new THREE.Float32BufferAttribute(drop, 1))
  g.setIndex(index)
  return g
}

/** A round pond (centre x, y, z; radius r) with the ribbon's attributes: still water, soft at the rim. */
export function waterDisc(x: number, y: number, z: number, r: number, seg = 20): THREE.BufferGeometry {
  const g = new THREE.CircleGeometry(r, seg).rotateX(-Math.PI / 2).translate(x, y, z)
  const pos = g.attributes.position as THREE.BufferAttribute
  const uv = new Float32Array(pos.count * 2)
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = Math.min(1, Math.hypot(pos.getX(i) - x, pos.getZ(i) - z) / r)
    uv[i * 2 + 1] = pos.getZ(i) - z
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  g.setAttribute('aDrop', new THREE.BufferAttribute(new Float32Array(pos.count), 1))
  g.deleteAttribute('normal')
  return g
}

/** Merge water strips and ponds into one geometry (one draw call); frees the parts. */
export function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, false)
  for (const g of parts) g.dispose()
  if (!merged) throw new Error('isle: geometry merge failed')
  merged.computeBoundingSphere()
  return merged
}

/**
 * Running and falling water: blue where it lies, streaked white as it falls, breaking up and
 * thinning to nothing over the 14 m above `mistY` (where the clouds take it).
 */
export function waterMaterial(ctx: Ctx, uTime: TimeUniform, mistY: number, color: THREE.ColorRepresentation): THREE.ShaderMaterial {
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog])
  Object.assign(uniforms, {
    uTime,
    tNoise: { value: ctx.textures.get('noise') },
    uWater: { value: new THREE.Color(color) },
    uMistY: { value: mistY },
  })
  const mat = new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      attribute float aDrop;
      varying vec2 vUv;
      varying float vDrop;
      varying float vY;
      void main() {
        vUv = uv;
        vDrop = aDrop;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vY = wp.y;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform float uTime;
      uniform sampler2D tNoise;
      uniform vec3 uWater;
      uniform float uMistY;
      varying vec2 vUv;
      varying float vDrop;
      varying float vY;
      void main() {
        float ax = abs(vUv.x);
        float fall = smoothstep(0.25, 3.0, vDrop);
        vec2 q = vec2(vUv.x * mix(0.35, 0.8, fall), vUv.y * mix(0.22, 0.07, fall) - uTime * mix(0.16, 0.55, fall));
        float streak = smoothstep(0.4, 0.75, texture2D(tNoise, q).r * 0.6 + texture2D(tNoise, q * vec2(2.3, 1.7) + 0.37).r * 0.4);
        float white = clamp(streak * (0.3 + 0.7 * fall) + fall * 0.3 + smoothstep(0.7, 1.0, ax) * 0.25, 0.0, 1.0);
        vec3 col = mix(uWater, vec3(1.0), white);
        float a = (1.0 - smoothstep(0.72, 1.0, ax)) * mix(0.8, 0.92, fall);
        a *= mix(1.0, 0.5 + 0.5 * streak, fall);
        a *= smoothstep(uMistY, uMistY + 14.0, vY);
        gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    uniforms,
    fog: true,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  mat.name = 'sky-water'
  return mat
}

/* ── wind ─────────────────────────────────────────────────── */

/**
 * A streak of wind: a thin ribbon along `path` that slowly twists. Attributes: position, uv
 * (−1 … 1 across, 0 … 1 along) and aPhase (so streaks don't run in step).
 */
export function windRibbon(path: readonly PathPoint[], width: number, phase: number): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(path.map(p => new THREE.Vector3(p[0], p[1], p[2])), false, 'centripetal')
  const n = Math.max(8, Math.ceil(curve.getLength() / 1.2))
  const pos: number[] = []
  const uv: number[] = []
  const ph: number[] = []
  const p = new THREE.Vector3()
  const t = new THREE.Vector3()
  const side = new THREE.Vector3()
  const up = new THREE.Vector3(0, 1, 0)
  const lift = new THREE.Vector3()
  for (let i = 0; i <= n; i++) {
    const u = i / n
    curve.getPointAt(u, p)
    curve.getTangentAt(u, t)
    side.crossVectors(t, up)
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0)
    side.normalize()
    lift.crossVectors(side, t).normalize()
    // The ribbon rolls about its own line as it goes.
    const roll = u * 5 + phase * 6.28
    const half = width * 0.5 * Math.sin(Math.PI * u)
    const wx = (side.x * Math.cos(roll) + lift.x * Math.sin(roll)) * half
    const wy = (side.y * Math.cos(roll) + lift.y * Math.sin(roll)) * half
    const wz = (side.z * Math.cos(roll) + lift.z * Math.sin(roll)) * half
    pos.push(p.x - wx, p.y - wy, p.z - wz, p.x + wx, p.y + wy, p.z + wz)
    uv.push(-1, u, 1, u)
    ph.push(phase, phase)
  }
  const index: number[] = []
  for (let i = 0; i < n; i++) {
    const a = i * 2
    index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setAttribute('aPhase', new THREE.Float32BufferAttribute(ph, 1))
  g.setIndex(index)
  return g
}

/** Wind streaks: a soft pale band that travels along each ribbon every ~14 s and fades at both ends. */
export function windMaterial(uTime: TimeUniform): THREE.ShaderMaterial {
  const mat = new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      attribute float aPhase;
      varying vec2 vUv;
      varying float vPhase;
      void main() {
        vUv = uv;
        vPhase = aPhase;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      varying float vPhase;
      void main() {
        float w = fract(vUv.y * 0.9 - uTime * 0.07 + vPhase);
        float band = smoothstep(0.0, 0.3, w) * (1.0 - smoothstep(0.45, 0.85, w));
        float soft = 1.0 - vUv.x * vUv.x;
        float a = band * soft * soft * 0.42;
        gl_FragColor = vec4(vec3(1.0), clamp(a, 0.0, 1.0));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    uniforms: { uTime },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  mat.name = 'sky-wind'
  return mat
}
