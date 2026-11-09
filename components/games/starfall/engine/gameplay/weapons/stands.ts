/**
 * Display stands for the weapon pickups: a sword-in-the-stone block, a chopping block with the
 * hammer standing on its head, and a small wooden rack with the bow hung across it. Each stand is
 * a couple of merged meshes plus where its weapon sits and the footprint of its collider.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { TextureLib } from '../../textures'
import type { HeldWeapon } from './models'

export interface StandShape {
  /** Merged geometry per material. */
  parts: Array<['stone' | 'wood', THREE.BufferGeometry]>
  /** Weapon placement relative to the stand (feet at the origin). */
  weapon: { y: number; rx: number; rz: number }
  /** Collider: cylinder radius (0 = box) / box half-extents, and height. */
  collider: { r: number; hx: number; hz: number; h: number }
}

const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _e = new THREE.Euler()
const _s = new THREE.Vector3(1, 1, 1)
const _p = new THREE.Vector3()

function at(geo: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo
  if (g !== geo) geo.dispose()
  return g.applyMatrix4(_m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s))
}

function merge(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(list)!
  list.forEach(x => x.dispose())
  return g
}

export function standShape(kind: HeldWeapon): StandShape {
  switch (kind) {
    case 'sword': {
      // Weathered plinth with a cap stone; the blade is buried a hand deep.
      const top = 0.6
      return {
        parts: [['stone', merge([
          at(new THREE.BoxGeometry(0.78, 0.36, 0.7), 0, 0.18, 0, 0, 0.1, 0),
          at(new THREE.BoxGeometry(0.56, 0.24, 0.5), 0, 0.48, 0, 0, -0.08, 0.03),
          at(new THREE.DodecahedronGeometry(0.16), 0.36, 0.08, 0.3, 0.4, 0.7, 0),
        ])]],
        weapon: { y: top + 0.66, rx: Math.PI, rz: 0 },
        collider: { r: 0.44, hx: 0, hz: 0, h: top },
      }
    }
    case 'hammer': {
      const top = 0.44
      return {
        parts: [['wood', merge([
          at(new THREE.CylinderGeometry(0.33, 0.38, top, 14), 0, top / 2, 0),
          at(new THREE.CylinderGeometry(0.07, 0.1, 0.22, 6), 0.34, 0.06, 0.12, 0, 0, 1.2),
        ])]],
        weapon: { y: top + 0.69, rx: Math.PI, rz: 0.12 },
        collider: { r: 0.38, hx: 0, hz: 0, h: top },
      }
    }
    case 'bow': {
      const h = 1.06
      const posts = [-0.46, 0.46].map(x => at(new THREE.CylinderGeometry(0.04, 0.05, h, 8), x, h / 2, 0))
      const feet = [-0.46, 0.46].map(x => at(new THREE.BoxGeometry(0.1, 0.06, 0.42), x, 0.03, 0))
      const pegs = [-0.28, 0.28].map(x => at(new THREE.CylinderGeometry(0.014, 0.014, 0.12, 6), x, 0.86, 0.06, Math.PI / 2, 0, 0))
      return {
        parts: [['wood', merge([...posts, ...feet, ...pegs, at(new THREE.BoxGeometry(1.0, 0.07, 0.07), 0, 0.98, 0)])]],
        weapon: { y: 0.84, rx: 0, rz: Math.PI / 2 },
        collider: { r: 0, hx: 0.52, hz: 0.18, h },
      }
    }
  }
}

/** Shared stand materials (textured stone and wood). */
export function standMaterials(textures: TextureLib): { stone: THREE.MeshStandardMaterial; wood: THREE.MeshStandardMaterial; maps: THREE.Texture[] } {
  const stone = textures.get('stone_albedo', { repeat: 0.8 })
  const stoneN = textures.get('stone_normal', { repeat: 0.8 })
  const wood = textures.get('bark_albedo', { repeat: [1.5, 0.6] })
  const woodN = textures.get('bark_normal', { repeat: [1.5, 0.6] })
  return {
    stone: new THREE.MeshStandardMaterial({ map: stone, normalMap: stoneN, color: 0xd8d0c2, roughness: 0.92 }),
    wood: new THREE.MeshStandardMaterial({ map: wood, normalMap: woodN, color: 0xc49a6c, roughness: 0.85 }),
    maps: [stone, stoneN, wood, woodN],
  }
}
