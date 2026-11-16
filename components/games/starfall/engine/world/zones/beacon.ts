/**
 * Beacon Summit — a round stone lighthouse tower with a glazed lantern room, a paved plaza
 * ringed by seven pillars, and the altar on the south side with seven sockets.
 *
 * Shard feedback: each placed shard sets a glowing gem in an altar socket AND lights the
 * flame on one of the seven pillars (one InstancedMesh, gems/flames interleaved so `count`
 * reveals them in pairs). ignite() ramps up the lantern crystal and glass, a strong PointLight
 * (pre-created at intensity 0), a tall light pillar, two sweeping lighthouse beams and a glow sprite.
 */
import * as THREE from 'three'
import type { Ctx } from '../../types'
import { ZoneKit, type ZonePart } from './kit'
import { BEACON, TOTAL_SHARDS } from '../level'
import { heightAt } from '../heightfield'
import { beam, openCylinder, place, rod, slab, solidCyl, tbox } from './beach'

export interface BeaconPart extends ZonePart {
  /** World position of the lantern (shards fly here). */
  lantern: THREE.Vector3
  /** Where the player stands to activate it. */
  altar: THREE.Vector3
  /** Light it up (final cutscene). */
  ignite(): void
  /** Show how many of the 7 sockets are filled. */
  setSockets(n: number): void
}

const X = BEACON.x
const Z = BEACON.z
const PLAZA_R = 9.4
const PILLAR_R = 8.4
/** Altar pedestal distance south of the tower centre. */
const ALTAR_D = 5.6
const SOCKET_R = 0.55
/** Seconds for the ignition ramp. */
const RAMP = 3

export function buildBeacon(ctx: Ctx): BeaconPart {
  const kit = new ZoneKit(ctx, 'beacon')
  const g = heightAt(X, Z)
  const P = g + 0.4
  const top = g + BEACON.towerHeight
  const lanternY = top + 1.2

  buildPlaza(kit, g, P)
  buildTower(kit, g, P, top)
  const sockets = buildAltar(kit, P)
  const pillars = buildPillars(kit, P)
  kit.finalize()

  /* ── dynamic parts ────────────────────────────────────── */

  // Lantern crystal: a dull amber stone until ignition.
  const coreMat = new THREE.MeshStandardMaterial({ color: 0xffe2b0, emissive: 0xffa640, emissiveIntensity: 0.2, roughness: 0.3, flatShading: true })
  const core = kit.addObject(new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 0), coreMat))
  core.position.set(X, lanternY, Z)
  const glass = kit.mat('glass')

  // Gems in the altar sockets and flames on the pillars, interleaved: [gem0, flame0, gem1, flame1, …].
  const gemMat = new THREE.MeshStandardMaterial({ color: 0xfff0c8, emissive: 0xffc35a, emissiveIntensity: 2.4, roughness: 0.25, flatShading: true })
  const gems = kit.addObject(new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.1, 0), gemMat, TOTAL_SHARDS * 2))
  gems.count = 0
  gems.visible = false
  gems.frustumCulled = false
  const slots: THREE.Vector3[] = []
  for (let i = 0; i < TOTAL_SHARDS; i++) slots.push(sockets[i], pillars[i])
  const appear = new Float32Array(TOTAL_SHARDS).fill(-1)

  // Effects, hidden until ignite().
  const warm = new THREE.Color(0xffc477)
  const pillarMat = beamMaterial()
  const pillarBeam = kit.addObject(new THREE.Mesh(fadeCylinder(0.55, 1.5, 150, 20, 8, warm, 1.6), pillarMat))
  pillarBeam.position.set(X, lanternY, Z)
  const sweepMat = beamMaterial()
  const sweep = kit.addObject(new THREE.Mesh(sweepGeometry(warm), sweepMat))
  sweep.position.set(X, lanternY, Z)
  const spriteMat = new THREE.SpriteMaterial({ map: ctx.textures.get('glow'), color: 0xffcf8a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, opacity: 0 })
  const sprite = kit.addObject(new THREE.Sprite(spriteMat))
  sprite.position.set(X, lanternY, Z)
  sprite.scale.setScalar(10)
  const effects: THREE.Object3D[] = [pillarBeam, sweep, sprite]
  for (const o of effects) {
    o.visible = false
    o.renderOrder = 10
    o.frustumCulled = false
  }
  // The lantern light exists (and stays visible) from the start at intensity 0: adding a light,
  // or toggling its visibility, changes the light count and recompiles every lit shader mid-cutscene.
  const light = kit.addObject(new THREE.PointLight(0xffc27a, 0, 90, 2))
  light.position.set(X, lanternY, Z)

  let lit = false
  let litTime = 0
  let shown = 0
  let elapsed = 0
  const m4 = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  const s3 = new THREE.Vector3()
  const p3 = new THREE.Vector3()
  const glassGlow = new THREE.Color(0xffb35c)

  const setLevel = (k: number) => {
    coreMat.emissiveIntensity = 0.2 + k * 9
    glass.emissive.copy(glassGlow).multiplyScalar(k * 0.7)
    pillarMat.opacity = k * 0.45
    sweepMat.opacity = k * 0.42
    spriteMat.opacity = k
    light.intensity = k * 420
  }

  const extinguish = () => {
    lit = false
    for (const o of effects) o.visible = false
    setLevel(0)
  }

  return {
    lantern: new THREE.Vector3(X, lanternY, Z),
    altar: new THREE.Vector3(X, P, Z + ALTAR_D + 2),
    ignite() {
      if (lit) return
      lit = true
      litTime = elapsed
      for (const o of effects) o.visible = true
      setLevel(0)
    },
    setSockets(n: number) {
      const c = Math.max(0, Math.min(TOTAL_SHARDS, Math.floor(n)))
      for (let i = shown; i < c; i++) appear[i] = elapsed
      for (let i = c; i < shown; i++) appear[i] = -1
      shown = c
      gems.count = c * 2
      // An empty instanced mesh would still cost a draw call every frame.
      gems.visible = c > 0
      if (lit && c < TOTAL_SHARDS) extinguish()
    },
    update(dt, t) {
      elapsed += dt
      // Gems pop into their sockets and spin; pillar flames flicker.
      for (let i = 0; i < shown; i++) {
        const age = elapsed - appear[i]
        const pop = age >= 1 ? 1 : easeOutBack(Math.max(0, age))
        for (let j = 0; j < 2; j++) {
          const flame = j === 1
          const base = slots[i * 2 + j]
          const k = flame ? 1.9 + Math.sin(t * 9 + i * 1.7) * 0.18 + Math.sin(t * 23 + i) * 0.08 : 1
          p3.copy(base)
          p3.y += flame ? 0.22 * k : 0.16 + Math.sin(t * 2 + i) * 0.02
          e.set(0, t * (flame ? 2.5 : 0.8) + i, 0)
          q.setFromEuler(e)
          s3.set(pop * k, pop * k * (flame ? 1.9 : 1.7), pop * k)
          m4.compose(p3, q, s3)
          gems.setMatrixAt(i * 2 + j, m4)
        }
      }
      if (shown) gems.instanceMatrix.needsUpdate = true
      gemMat.emissiveIntensity = 2.2 + Math.sin(t * 3) * 0.4

      if (!lit) return
      const k = THREE.MathUtils.smoothstep(elapsed - litTime, 0, RAMP)
      const pulse = 1 + Math.sin(t * 2.2) * 0.06
      setLevel(k * pulse)
      sweep.rotation.y = t * 0.55
      sprite.scale.setScalar((9 + k * 5) * pulse)
      core.rotation.y = t * 0.7
    },
    dispose() {
      extinguish()
      light.removeFromParent()
      light.dispose()
      sprite.removeFromParent()
      gems.dispose()
      for (const m of [coreMat, gemMat, pillarMat, sweepMat, spriteMat]) m.dispose()
      kit.dispose()
    },
  }
}

function easeOutBack(x: number): number {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2)
}

function beamMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
  })
}

/** Open cylinder from y = 0 up to h whose vertex colour fades from `color` to black (invisible when additive). */
function fadeCylinder(r0: number, r1: number, h: number, seg: number, rows: number, color: THREE.Color, power: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r1, r0, h, seg, rows, true)
  g.translate(0, h / 2, 0)
  const p = g.attributes.position as THREE.BufferAttribute
  const c = new Float32Array(p.count * 3)
  for (let i = 0; i < p.count; i++) {
    const f = Math.pow(1 - p.getY(i) / h, power)
    c[i * 3] = color.r * f
    c[i * 3 + 1] = color.g * f
    c[i * 3 + 2] = color.b * f
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3))
  return g
}

/** Two opposed, slightly downward lighthouse beams (narrow at the lantern, wide far out). */
function sweepGeometry(color: THREE.Color): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  for (const s of [0, Math.PI]) {
    const g = fadeCylinder(0.25, 3.0, 55, 16, 6, color, 1.6)
    g.rotateZ(-Math.PI / 2 - 0.07)
    g.rotateY(s)
    parts.push(g)
  }
  const a = parts[0]
  const b = parts[1]
  const merged = new THREE.BufferGeometry()
  for (const name of ['position', 'normal', 'uv', 'color']) {
    const A = a.attributes[name] as THREE.BufferAttribute
    const B = b.attributes[name] as THREE.BufferAttribute
    const arr = new Float32Array(A.array.length + B.array.length)
    arr.set(A.array as Float32Array, 0)
    arr.set(B.array as Float32Array, A.array.length)
    merged.setAttribute(name, new THREE.BufferAttribute(arr, A.itemSize))
  }
  const ia = a.index!
  const ib = b.index!
  const idx: number[] = []
  for (let i = 0; i < ia.count; i++) idx.push(ia.getX(i))
  const off = a.attributes.position.count
  for (let i = 0; i < ib.count; i++) idx.push(ib.getX(i) + off)
  merged.setIndex(idx)
  a.dispose()
  b.dispose()
  return merged
}

/* ── static stonework ───────────────────────────────────── */

function buildPlaza(kit: ZoneKit, g: number, P: number): void {
  // Paved disc with a lower mossy kerb ring; inlaid rings around the tower.
  slab(kit, 'stone', X, P, Z, 0, PLAZA_R, 1.6, 48, 2.2)
  slab(kit, 'mossStone', X, g + 0.22, Z, PLAZA_R, PLAZA_R + 0.9, 1.4, 48, 1.4)
  solidCyl(kit, X, g - 1.2, Z, PLAZA_R, P - (g - 1.2), 'stone')
  solidCyl(kit, X, g - 1.2, Z, PLAZA_R + 0.9, 1.42, 'stone')
  slab(kit, 'mossStone', X, P + 0.02, Z, 6.0, 6.45, 0.04, 48, 1.2)
  slab(kit, 'mossStone', X, P + 0.02, Z, 3.4, 3.75, 0.04, 32, 1.2)
  // Eight radial inlays between the rings, like a compass.
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2
    const c = Math.cos(a)
    const s = Math.sin(a)
    tbox(kit, 'mossStone', X + c * 4.85, P - 0.01, Z + s * 4.85, 0.22, 0.05, 2.3, Math.atan2(c, s), 0, 0, 1.2)
  }
}

function buildTower(kit: ZoneKit, g: number, P: number, top: number): void {
  // Plinth, tapering shaft with string courses, corbelled gallery.
  kit.cylinder({ x: X, y: P - 0.3, z: Z, r: 3.35, rTop: 3.15, h: 1.1, segments: 24, mat: 'mossStone', uvScale: 1.6 })
  kit.cylinder({ x: X, y: P + 0.8, z: Z, r: 2.85, rTop: 2.3, h: top - 0.6 - (P + 0.8), segments: 24, mat: 'stone', uvScale: 2.2 })
  for (const y of [P + 3.6, P + 6.6]) {
    const r = 2.85 - (0.55 * (y - P - 0.8)) / (top - 0.6 - P - 0.8)
    kit.cylinder({ x: X, y, z: Z, r: r + 0.12, h: 0.28, segments: 24, mat: 'mossStone', uvScale: 1.2 })
  }
  kit.cylinder({ x: X, y: top - 0.9, z: Z, r: 2.3, rTop: 3.05, h: 0.5, segments: 24, mat: 'stone', uvScale: 1.2 })
  slab(kit, 'stone', X, top, Z, 0, 3.1, 0.42, 32, 1.5)
  solidCyl(kit, X, g - 0.5, Z, 3.0, top - (g - 0.5), 'stone')
  // Gallery railing.
  const n = 20
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * Math.PI * 2
    const a1 = ((k + 1) / n) * Math.PI * 2
    const r = 2.95
    rod(kit, 'metal', X + Math.cos(a0) * r, top, Z + Math.sin(a0) * r, X + Math.cos(a0) * r, top + 0.9, Z + Math.sin(a0) * r, 0.035, 5, 1)
    beam(kit, 'metal', X + Math.cos(a0) * r, top + 0.9, Z + Math.sin(a0) * r, X + Math.cos(a1) * r, top + 0.9, Z + Math.sin(a1) * r, 0.07, 0.05, 1)
    beam(kit, 'metal', X + Math.cos(a0) * r, top + 0.45, Z + Math.sin(a0) * r, X + Math.cos(a1) * r, top + 0.45, Z + Math.sin(a1) * r, 0.04, 0.04, 1)
  }
  // Lantern room: iron drum, glazing with mullions, cornice ring, dome, finial; crystal pedestal inside.
  kit.cylinder({ x: X, y: top, z: Z, r: 1.8, rTop: 1.7, h: 0.45, segments: 16, mat: 'metal', uvScale: 1 })
  // Glazing is see-through: it must not cast a solid shadow over the gallery and the crystal.
  kit.add(openCylinder(1.55, 1.55, 1.6, 16, 1), 'glass', place(X, top + 0.45 + 0.8, Z), { castShadow: false })
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2
    tbox(kit, 'metal', X + Math.cos(a) * 1.58, top + 1.25, Z + Math.sin(a) * 1.58, 0.1, 1.6, 0.1, Math.atan2(Math.cos(a), Math.sin(a)), 0, 0, 1)
  }
  kit.cylinder({ x: X, y: top + 2.05, z: Z, r: 1.82, h: 0.18, segments: 16, mat: 'metal', uvScale: 1 })
  const dome = new THREE.SphereGeometry(1.72, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2)
  dome.scale(1, 0.72, 1)
  kit.add(dome, 'metal', place(X, top + 2.23, Z))
  rod(kit, 'metal', X, top + 3.3, Z, X, top + 4.1, Z, 0.06, 6, 1)
  kit.add(new THREE.SphereGeometry(0.17, 10, 6), 'metal', place(X, top + 4.2, Z))
  kit.cylinder({ x: X, y: top + 0.45, z: Z, r: 0.42, rTop: 0.25, h: 0.25, segments: 10, mat: 'metal', uvScale: 1 })
  // Door on the north face, framed in mossy stone; a few dark window slits.
  const dz = Z - 2.8
  tbox(kit, 'darkPlanks', X, P + 1.1, dz, 1.2, 2.2, 0.16, 0, 0, 0, 1)
  for (const s of [-1, 1]) tbox(kit, 'mossStone', X + s * 0.75, P + 1.15, dz - 0.04, 0.3, 2.3, 0.3, 0, 0, 0, 1)
  tbox(kit, 'mossStone', X, P + 2.4, dz - 0.04, 1.8, 0.3, 0.32, 0, 0, 0, 1)
  tbox(kit, 'metal', X + 0.32, P + 1.1, dz - 0.1, 0.06, 0.12, 0.06, 0, 0, 0, 1)
  for (const [y, a] of [[3.0, 0.6], [5.4, 2.5], [7.9, -2.2], [5.0, -0.7]] as Array<[number, number]>) {
    const r = 2.85 - (0.55 * (y - 0.8)) / (top - 0.6 - P - 0.8) + 0.02
    tbox(kit, 'metal', X + Math.cos(a) * r, P + y, Z + Math.sin(a) * r, 0.32, 0.95, 0.12, Math.atan2(Math.cos(a), Math.sin(a)), 0, 0, 1)
    tbox(kit, 'mossStone', X + Math.cos(a) * (r + 0.02), P + y - 0.55, Z + Math.sin(a) * (r + 0.02), 0.55, 0.12, 0.2, Math.atan2(Math.cos(a), Math.sin(a)), 0, 0, 1)
  }
}

/** Altar pedestal south of the tower; returns the 7 socket positions (on the top disc). */
function buildAltar(kit: ZoneKit, P: number): THREE.Vector3[] {
  const az = Z + ALTAR_D
  kit.box({ x: X, y: P, z: az, w: 2.6, h: 0.3, d: 2.0, mat: 'stone', uvScale: 1.2, collide: true })
  kit.box({ x: X, y: P + 0.3, z: az, w: 1.9, h: 0.3, d: 1.5, mat: 'mossStone', uvScale: 1.2, collide: true })
  kit.cylinder({ x: X, y: P + 0.6, z: az, r: 0.42, rTop: 0.36, h: 0.45, segments: 12, mat: 'stone', uvScale: 1 })
  slab(kit, 'stone', X, P + 1.2, az, 0, 0.85, 0.15, 24, 1)
  slab(kit, 'mossStone', X, P + 1.05, az, 0.3, 0.92, 0.08, 24, 1)
  solidCyl(kit, X, P + 0.6, az, 0.88, 0.6, 'stone')
  const out: THREE.Vector3[] = []
  for (let i = 0; i < TOTAL_SHARDS; i++) {
    const a = -Math.PI / 2 + (i / TOTAL_SHARDS) * Math.PI * 2
    const sx = X + Math.cos(a) * SOCKET_R
    const sz = az + Math.sin(a) * SOCKET_R
    kit.cylinder({ x: sx, y: P + 1.2, z: sz, r: 0.1, rTop: 0.12, h: 0.05, segments: 8, mat: 'metal', uvScale: 1 })
    out.push(new THREE.Vector3(sx, P + 1.25, sz))
  }
  // A small iron star in the middle.
  for (let k = 0; k < 4; k++) tbox(kit, 'metal', X, P + 1.215, az, 0.05, 0.03, 0.42, (k * Math.PI) / 4, 0, 0, 1)
  return out
}

/** Seven pillars with braziers around the plaza (open to the south); returns the flame positions. */
function buildPillars(kit: ZoneKit, P: number): THREE.Vector3[] {
  const out: THREE.Vector3[] = []
  const step = (Math.PI * 2) / TOTAL_SHARDS
  const angles: number[] = []
  for (let i = 0; i < TOTAL_SHARDS; i++) angles.push(Math.PI / 2 + step / 2 + i * step)
  for (const a of angles) {
    const x = X + Math.cos(a) * PILLAR_R
    const z = Z + Math.sin(a) * PILLAR_R
    const yaw = Math.atan2(Math.cos(a), Math.sin(a))
    kit.box({ x, y: P, z, w: 1.1, h: 0.3, d: 1.1, yaw, mat: 'mossStone', uvScale: 1 })
    kit.cylinder({ x, y: P + 0.3, z, r: 0.42, rTop: 0.36, h: 2.3, segments: 10, mat: 'stone', uvScale: 1.2 })
    kit.box({ x, y: P + 2.6, z, w: 0.95, h: 0.2, d: 0.95, yaw, mat: 'mossStone', uvScale: 1 })
    kit.cylinder({ x, y: P + 2.8, z, r: 0.2, rTop: 0.42, h: 0.28, segments: 10, mat: 'metal', uvScale: 1 })
    kit.solidBox(x, P, z, 1.0, 2.8, 1.0, yaw, { surface: 'stone' })
    out.push(new THREE.Vector3(x, P + 3.02, z))
  }
  // Low curved benches between the northern pillars.
  for (let i = 1; i < 4; i++) {
    const a0 = angles[i]
    const a1 = angles[i + 1]
    const segs = 3
    for (let k = 0; k < segs; k++) {
      const b0 = a0 + ((a1 - a0) * (k + 0.18)) / segs
      const b1 = a0 + ((a1 - a0) * (k + 0.82)) / segs
      const x0 = X + Math.cos(b0) * PILLAR_R
      const z0 = Z + Math.sin(b0) * PILLAR_R
      const x1 = X + Math.cos(b1) * PILLAR_R
      const z1 = Z + Math.sin(b1) * PILLAR_R
      const len = Math.hypot(x1 - x0, z1 - z0)
      const yaw = Math.atan2(x1 - x0, z1 - z0)
      kit.box({ x: (x0 + x1) / 2, y: P, z: (z0 + z1) / 2, w: 0.55, h: 0.5, d: len, yaw, mat: 'stone', uvScale: 1, collide: true })
    }
  }
  return out
}
