/**
 * Procedural weapon models — sword, hammer, bow and the arrow — built once and shared: every
 * copy in a hand, on a stand or in flight reuses the same geometries and materials.
 *
 * Model frame (metres): the grip is at the origin, +Y runs out of the fist on the thumb side
 * (blade, hammer head, upper bow limb), +Z is where the knuckles face (sword edge, hammer face,
 * the bow's back). Arrows have their nock at the origin and point along +Z.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { WeaponId } from '../../events'
import type { TextureLib } from '../../textures'

export type HeldWeapon = Exclude<WeaponId, 'fists'>
type MatName = 'steel' | 'iron' | 'brass' | 'leather' | 'wood' | 'bowWood'

/** Bow limb tips (the string's ends) and how far the string comes back at full draw (m). */
export const BOW_TIP = { y: 0.6, z: -0.085 }
export const BOW_DRAW = 0.4
export const ARROW_LEN = 0.72

const TEXTURED = new Set<MatName>(['leather', 'wood', 'bowWood'])

/** A copy of a weapon; the bow also has a string whose nock can be pulled back. */
export interface WeaponModel {
  group: THREE.Group
  /** Bow only: the nocked arrow (hidden until drawing). */
  arrow?: THREE.Mesh
  /** Bow only: pull the string back, 0..1. */
  setDraw?: (draw: number) => void
}

export class WeaponKit {
  readonly arrowGeometry: THREE.BufferGeometry
  readonly arrowMaterial: THREE.MeshStandardMaterial
  private mats: Record<MatName, THREE.MeshStandardMaterial>
  private stringMat = new THREE.LineBasicMaterial({ color: 0xefe6d2 })
  private parts: Record<HeldWeapon, Array<[MatName, THREE.BufferGeometry]>>
  private strings: THREE.BufferGeometry[] = []
  /** Repeat-configured clones (they share the library's GPU images). */
  private maps: THREE.Texture[]

  constructor(textures: TextureLib) {
    const wood = textures.get('planks_albedo', { repeat: [0.4, 1.6] })
    const cloth = textures.get('cloth_albedo', { repeat: [2, 1] })
    this.maps = [wood, cloth]
    this.mats = {
      steel: new THREE.MeshStandardMaterial({ color: 0xdfe4ea, metalness: 0.92, roughness: 0.24 }),
      iron: new THREE.MeshStandardMaterial({ color: 0x5d636c, metalness: 0.85, roughness: 0.42 }),
      brass: new THREE.MeshStandardMaterial({ color: 0xd9a548, metalness: 0.9, roughness: 0.3 }),
      leather: new THREE.MeshStandardMaterial({ color: 0x7a4a2e, map: cloth, roughness: 0.82 }),
      wood: new THREE.MeshStandardMaterial({ color: 0xb98a5c, map: wood, roughness: 0.7 }),
      bowWood: new THREE.MeshStandardMaterial({ color: 0x9a6236, map: wood, roughness: 0.55 }),
    }
    this.arrowMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide })
    this.arrowGeometry = arrowGeometry()
    this.parts = { sword: sword(), hammer: hammer(), bow: bow() }
  }

  make(id: HeldWeapon): WeaponModel {
    const group = new THREE.Group()
    group.name = `weapon-${id}`
    for (const [mat, geo] of this.parts[id]) {
      const m = new THREE.Mesh(geo, this.mats[mat])
      m.castShadow = true
      group.add(m)
    }
    if (id !== 'bow') return { group }

    // String: top tip → nock → bottom tip, one line per copy so each can be drawn.
    const pos = new Float32Array([0, BOW_TIP.y, BOW_TIP.z, 0, 0, BOW_TIP.z, 0, -BOW_TIP.y, BOW_TIP.z])
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    this.strings.push(geo)
    const string = new THREE.Line(geo, this.stringMat)
    string.frustumCulled = false
    const arrow = new THREE.Mesh(this.arrowGeometry, this.arrowMaterial)
    arrow.visible = false
    arrow.position.set(0.012, 0.02, BOW_TIP.z)
    group.add(string, arrow)
    const attr = geo.attributes.position as THREE.BufferAttribute
    const setDraw = (draw: number) => {
      const z = BOW_TIP.z - BOW_DRAW * draw
      attr.setZ(1, z)
      attr.needsUpdate = true
      arrow.position.z = z
    }
    return { group, arrow, setDraw }
  }

  dispose(): void {
    for (const list of Object.values(this.parts)) for (const [, geo] of list) geo.dispose()
    for (const m of Object.values(this.mats)) m.dispose()
    for (const g of this.strings) g.dispose()
    for (const t of this.maps) t.dispose()
    this.stringMat.dispose()
    this.arrowGeometry.dispose()
    this.arrowMaterial.dispose()
  }
}

/* ── geometry helpers ───────────────────────────────────────────── */

const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _e = new THREE.Euler()
const _s = new THREE.Vector3()
const _p = new THREE.Vector3()

function at(geo: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): THREE.BufferGeometry {
  return geo.applyMatrix4(_m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz)))
}

/** Merges parts per material (non-indexed; uv kept only for textured materials). */
function group(parts: Array<[MatName, THREE.BufferGeometry]>): Array<[MatName, THREE.BufferGeometry]> {
  const by = new Map<MatName, THREE.BufferGeometry[]>()
  for (const [mat, geo] of parts) {
    const g = geo.index ? geo.toNonIndexed() : geo
    if (g !== geo) geo.dispose()
    if (!TEXTURED.has(mat)) g.deleteAttribute('uv')
    else if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2))
    if (!by.has(mat)) by.set(mat, [])
    by.get(mat)!.push(g)
  }
  return [...by].map(([mat, list]) => {
    const merged = list.length === 1 ? list[0] : mergeGeometries(list)!
    if (list.length > 1) list.forEach(g => g.dispose())
    return [mat, merged]
  })
}

/**
 * Lofts a faceted solid along +Y: each station is [y, half width along Z, half thickness along X]
 * with a diamond cross-section (edges at ±Z) — a sword blade or a bevelled bar.
 */
function loftDiamond(stations: Array<[number, number, number]>): THREE.BufferGeometry {
  const ring = (i: number, k: number): [number, number, number] => {
    const [y, w, t] = stations[i]
    const a = (k % 4) * (Math.PI / 2)
    return [Math.cos(a) * t, y, Math.sin(a) * w]
  }
  const pos: number[] = []
  for (let i = 0; i < stations.length - 1; i++) {
    for (let k = 0; k < 4; k++) {
      const a = ring(i, k)
      const b = ring(i, k + 1)
      const c = ring(i + 1, k + 1)
      const d = ring(i + 1, k)
      pos.push(...a, ...c, ...b, ...a, ...d, ...c)
    }
  }
  // Base cap (hidden in the guard, but keeps the solid closed for shadows).
  for (let k = 0; k < 4; k++) pos.push(0, stations[0][0], 0, ...ring(0, k), ...ring(0, k + 1))
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.computeVertexNormals()
  return geo
}

/* ── the weapons ────────────────────────────────────────────────── */

function sword(): Array<[MatName, THREE.BufferGeometry]> {
  const R = Math.PI / 2
  return group([
    ['steel', loftDiamond([[0.06, 0.033, 0.011], [0.18, 0.035, 0.01], [0.58, 0.029, 0.009], [0.71, 0.018, 0.007], [0.81, 0.0008, 0.0008]])],
    // Fuller: a darker groove line down the middle of each face.
    ['iron', at(new THREE.BoxGeometry(0.004, 0.44, 0.012), 0.009, 0.32, 0)],
    ['iron', at(new THREE.BoxGeometry(0.004, 0.44, 0.012), -0.009, 0.32, 0)],
    // Crossguard with swept tips and a centre boss.
    ['brass', at(new THREE.BoxGeometry(0.042, 0.03, 0.2), 0, 0.045, 0)],
    ['brass', at(new THREE.ConeGeometry(0.019, 0.07, 8), 0, 0.06, 0.125, -R + 0.5)],
    ['brass', at(new THREE.ConeGeometry(0.019, 0.07, 8), 0, 0.06, -0.125, R - 0.5)],
    ['brass', at(new THREE.SphereGeometry(0.026, 12, 8), 0, 0.045, 0, 0, 0, 0, 1.25, 0.9, 1)],
    // Wrapped grip between two ferrules, and the pommel.
    ['leather', at(new THREE.CylinderGeometry(0.018, 0.02, 0.16, 10), 0, -0.035, 0)],
    ['brass', at(new THREE.CylinderGeometry(0.023, 0.023, 0.016, 12), 0, 0.03, 0)],
    ['brass', at(new THREE.CylinderGeometry(0.023, 0.023, 0.016, 12), 0, -0.115, 0)],
    ['brass', at(new THREE.SphereGeometry(0.031, 14, 10), 0, -0.145, 0, 0, 0, 0, 1, 0.85, 1)],
  ])
}

function hammer(): Array<[MatName, THREE.BufferGeometry]> {
  const R = Math.PI / 2
  const headY = 0.6
  return group([
    ['wood', at(new THREE.CylinderGeometry(0.022, 0.026, 0.86, 10), 0, 0.2, 0)],
    ['leather', at(new THREE.CylinderGeometry(0.029, 0.029, 0.2, 10), 0, -0.04, 0)],
    ['iron', at(new THREE.CylinderGeometry(0.034, 0.03, 0.05, 10), 0, -0.24, 0)],
    // Octagonal head along Z with bright striking faces and brass bands.
    ['iron', at(new THREE.CylinderGeometry(0.088, 0.088, 0.3, 8), 0, headY, 0, R, 0, Math.PI / 8)],
    ['steel', at(new THREE.CylinderGeometry(0.098, 0.092, 0.04, 8), 0, headY, 0.16, R, 0, Math.PI / 8)],
    ['steel', at(new THREE.CylinderGeometry(0.092, 0.098, 0.04, 8), 0, headY, -0.16, R, 0, Math.PI / 8)],
    ['brass', at(new THREE.CylinderGeometry(0.094, 0.094, 0.03, 8), 0, headY, 0.075, R, 0, Math.PI / 8)],
    ['brass', at(new THREE.CylinderGeometry(0.094, 0.094, 0.03, 8), 0, headY, -0.075, R, 0, Math.PI / 8)],
    ['brass', at(new THREE.CylinderGeometry(0.04, 0.034, 0.06, 10), 0, headY - 0.11, 0)],
    ['iron', at(new THREE.ConeGeometry(0.032, 0.07, 8), 0, headY + 0.12, 0)],
  ])
}

/** Recurve limbs: a parabola toward the archer with tips flicking forward again. */
function limbZ(y: number): number {
  const u = Math.abs(y) / BOW_TIP.y
  return -0.13 * u * u + 1.15 * Math.max(0, u - 0.8) ** 2
}

function bow(): Array<[MatName, THREE.BufferGeometry]> {
  const pts: THREE.Vector3[] = []
  for (let i = 0; i <= 24; i++) {
    const y = -BOW_TIP.y + (i / 24) * BOW_TIP.y * 2
    pts.push(new THREE.Vector3(0, y, limbZ(y)))
  }
  const curve = new THREE.CatmullRomCurve3(pts)
  const segs = 48
  const limbs = new THREE.TubeGeometry(curve, segs, 0.015, 6, false)
  // Taper toward the tips, and make the limbs wider (X) than they are thick.
  const pos = limbs.attributes.position as THREE.BufferAttribute
  const c = new THREE.Vector3()
  for (let i = 0; i <= segs; i++) {
    curve.getPointAt(i / segs, c)
    const k = 1.3 - 0.75 * Math.abs(i / segs - 0.5) * 2
    for (let j = 0; j <= 6; j++) {
      const v = i * 7 + j
      pos.setXYZ(v, (pos.getX(v) - c.x) * k * 1.6, c.y + (pos.getY(v) - c.y) * k, c.z + (pos.getZ(v) - c.z) * k)
    }
  }
  limbs.computeVertexNormals()
  return group([
    ['bowWood', limbs],
    ['leather', at(new THREE.CylinderGeometry(0.024, 0.024, 0.15, 10), 0, 0, 0.004, 0, 0, 0, 1.2, 1, 1)],
    ['brass', at(new THREE.CylinderGeometry(0.026, 0.026, 0.012, 10), 0, 0.08, 0.004, 0, 0, 0, 1.2, 1, 1)],
    ['brass', at(new THREE.CylinderGeometry(0.026, 0.026, 0.012, 10), 0, -0.08, 0.004, 0, 0, 0, 1.2, 1, 1)],
    ['brass', at(new THREE.SphereGeometry(0.014, 8, 6), 0, BOW_TIP.y, BOW_TIP.z)],
    ['brass', at(new THREE.SphereGeometry(0.014, 8, 6), 0, -BOW_TIP.y, BOW_TIP.z)],
  ])
}

/** Vertex-coloured arrow: wooden shaft, steel head, red and cream fletching. */
function arrowGeometry(): THREE.BufferGeometry {
  const R = Math.PI / 2
  const tint = (geo: THREE.BufferGeometry, hex: number) => {
    const g = geo.index ? geo.toNonIndexed() : geo
    g.deleteAttribute('uv')
    const col = new THREE.Color(hex)
    const n = g.attributes.position.count
    const a = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) col.toArray(a, i * 3)
    g.setAttribute('color', new THREE.BufferAttribute(a, 3))
    return g
  }
  const parts = [
    tint(at(new THREE.CylinderGeometry(0.0055, 0.0055, 0.66, 6), 0, 0, 0.33, R), 0xb98a55),
    tint(at(new THREE.ConeGeometry(0.017, 0.075, 4), 0, 0, ARROW_LEN - 0.0375, R, 0, 0, 1, 1, 0.45), 0xcfd4da),
    tint(at(new THREE.CylinderGeometry(0.008, 0.008, 0.02, 6), 0, 0, 0.01, R), 0x2b2b2b),
  ]
  for (let k = 0; k < 3; k++) {
    // A vane: a tapered quad in the plane through the shaft at angle a.
    const a = (k / 3) * Math.PI * 2 + Math.PI / 2
    const ca = Math.cos(a)
    const sa = Math.sin(a)
    const r0 = 0.005
    const v = (r: number, z: number) => [ca * r, sa * r, z]
    const quad = [...v(r0, 0.03), ...v(0.024, 0.05), ...v(0.024, 0.15), ...v(r0, 0.03), ...v(0.024, 0.15), ...v(r0, 0.17)]
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(quad, 3))
    g.computeVertexNormals()
    parts.push(tint(g, k === 0 ? 0xf3eee6 : 0xd9553e))
  }
  const merged = mergeGeometries(parts)!
  parts.forEach(p => p.dispose())
  return merged
}
