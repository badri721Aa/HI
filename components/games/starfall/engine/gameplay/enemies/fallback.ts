/**
 * Procedural stand-ins, built at each glTF model's native size and pivoted like it: if a model
 * file fails to load, the enemy is built from these instead and nobody sees an error. Each is
 * a jointed figure (hips, spine, head, arms with hand slots, legs — or wings, a tail, a turret
 * head) that the procedural puppet animates, dressed in the same palette as the real model.
 *
 * Also the factory's own gear that has no glTF source: the Bomber's bomb and the Turret-Spawner's
 * crate pack, plus procedural versions of the legion's weapons and shields.
 */
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { LEGION_BONE, type GearId, type Look, type ModelId } from './defs'

/** How the procedural puppet moves a stand-in. */
export type RigKind = 'biped' | 'flyer' | 'floater' | 'turret'

/** Joints a procedural figure exposes (each is an Object3D named after its key). */
export const JOINT_NAMES = [
  'hips', 'chest', 'head', 'armL', 'armR', 'foreL', 'foreR', 'legL', 'legR', 'shinL', 'shinR', 'wingL', 'wingR', 'tail', 'turret',
] as const
export type JointName = (typeof JOINT_NAMES)[number]

export interface ProcModel {
  root: THREE.Group
  kind: RigKind
}

type Palette = Record<'bone' | 'cloth' | 'dark' | 'metal' | 'glow' | 'main' | 'trim', THREE.MeshStandardMaterial>

/** Builds the stand-in for a model id. Geometry and materials belong to the returned tree. */
export function buildFallback(id: ModelId, look: Look): ProcModel {
  const pal = palette(id, look)
  switch (id) {
    case 'legion-rogue':
    case 'legion-warrior':
    case 'legion-minion':
    case 'legion-mage':
      return { root: legion(id, pal), kind: 'biped' }
    case 'iron-titan':
      return { root: titan(pal), kind: 'biped' }
    case 'vortex-weaver':
      return { root: wyrm(pal), kind: 'flyer' }
    case 'plasma-overlord':
      return { root: overlord(pal), kind: 'floater' }
    case 'void-stalker':
      return { root: wraith(pal), kind: 'floater' }
    case 'sentry-turret':
      return { root: sentry(pal), kind: 'turret' }
  }
}

/** Gear that is always procedural (bomb, pack) or stands in for a missing gear file. */
export function buildGear(id: GearId, look: Look): THREE.Group {
  const pal = palette('legion-minion', look)
  const g = new THREE.Group()
  g.name = `gear-${id}`
  switch (id) {
    case 'bomb': {
      part(g, new THREE.SphereGeometry(0.3, 20, 14), pal.dark, 0, 0.3, 0)
      part(g, new THREE.TorusGeometry(0.3, 0.035, 6, 24).rotateX(Math.PI / 2), pal.metal, 0, 0.3, 0)
      part(g, new THREE.TorusGeometry(0.3, 0.03, 6, 24), pal.metal, 0, 0.3, 0)
      part(g, new THREE.CylinderGeometry(0.08, 0.1, 0.1, 10), pal.metal, 0, 0.62, 0)
      const fuse = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.66, 0), new THREE.Vector3(0.04, 0.76, 0.02), new THREE.Vector3(0.1, 0.8, 0.05)])
      part(g, new THREE.TubeGeometry(fuse, 8, 0.018, 5), pal.cloth, 0, 0, 0)
      const tip = part(g, new THREE.SphereGeometry(0.045, 8, 6), pal.glow, 0.1, 0.8, 0.05)
      tip.name = 'fuse-tip'
      break
    }
    case 'pack': {
      part(g, new RoundedBoxGeometry(0.55, 0.6, 0.32, 2, 0.05), pal.trim, 0, 0, 0)
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) part(g, new THREE.BoxGeometry(0.08, 0.08, 0.36), pal.metal, sx * 0.25, sy * 0.28, 0)
      part(g, new THREE.BoxGeometry(0.4, 0.05, 0.02), pal.glow, 0, 0.12, -0.165)
      part(g, new THREE.BoxGeometry(0.4, 0.05, 0.02), pal.glow, 0, -0.02, -0.165)
      part(g, new THREE.CylinderGeometry(0.012, 0.012, 0.5, 5), pal.metal, 0.18, 0.55, 0.05)
      part(g, new THREE.SphereGeometry(0.035, 8, 6), pal.glow, 0.18, 0.8, 0.05)
      break
    }
    case 'shield':
    case 'buckler': {
      const r = id === 'shield' ? 0.42 : 0.26
      part(g, new THREE.CylinderGeometry(r, r * 0.95, 0.07, 20).rotateX(Math.PI / 2), pal.trim, 0, 0.05, 0.1)
      part(g, new THREE.TorusGeometry(r, 0.035, 6, 22), pal.metal, 0, 0.05, 0.14)
      part(g, new THREE.SphereGeometry(r * 0.25, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), pal.metal, 0, 0.05, 0.14)
      break
    }
    case 'blade':
    case 'axe': {
      part(g, new THREE.CylinderGeometry(0.03, 0.03, 0.26, 6), pal.dark, 0, 0.0, 0)
      part(g, new THREE.BoxGeometry(0.2, 0.04, 0.05), pal.metal, 0, 0.14, 0)
      if (id === 'blade') part(g, new THREE.BoxGeometry(0.07, 0.62, 0.02), pal.metal, 0, 0.47, 0)
      else {
        part(g, new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), pal.trim, 0, 0.38, 0)
        const s = new THREE.Shape()
        s.moveTo(0, 0)
        s.quadraticCurveTo(0.26, 0.05, 0.3, 0.22)
        s.lineTo(0.3, -0.22)
        s.quadraticCurveTo(0.26, -0.05, 0, -0.08)
        part(g, new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: false }).translate(0, 0, -0.015), pal.metal, 0.02, 0.55, 0)
      }
      break
    }
    case 'crossbow': {
      part(g, new RoundedBoxGeometry(0.08, 0.08, 0.7, 2, 0.02), pal.trim, 0, 0.05, 0.2)
      part(g, new THREE.TorusGeometry(0.34, 0.025, 5, 16, Math.PI).rotateX(Math.PI / 2), pal.dark, 0, 0.05, 0.42)
      part(g, new THREE.CylinderGeometry(0.005, 0.005, 0.68, 4).rotateZ(Math.PI / 2), pal.bone, 0, 0.05, 0.42)
      break
    }
    case 'quiver': {
      part(g, new THREE.CylinderGeometry(0.11, 0.09, 0.55, 10), pal.trim, 0, 0, 0)
      for (let i = 0; i < 4; i++) part(g, new THREE.ConeGeometry(0.03, 0.12, 4), pal.cloth, Math.cos(i * 1.6) * 0.05, 0.36, Math.sin(i * 1.6) * 0.05)
      break
    }
    case 'staff': {
      part(g, new THREE.CylinderGeometry(0.03, 0.035, 1.7, 7), pal.trim, 0, 0.35, 0)
      part(g, new THREE.TorusGeometry(0.12, 0.025, 6, 16), pal.metal, 0, 1.22, 0)
      part(g, new THREE.SphereGeometry(0.09, 12, 8), pal.glow, 0, 1.22, 0)
      break
    }
  }
  return g
}

/* ── figures ─────────────────────────────────────────────────── */

function legion(id: ModelId, pal: Palette): THREE.Group {
  const root = new THREE.Group()
  root.name = 'fallback'
  const minion = id === 'legion-minion'
  const hips = joint(root, 'hips', 0, 0.95, 0)
  part(hips, new THREE.TorusGeometry(0.17, 0.06, 6, 14).rotateX(Math.PI / 2).scale(1.1, 1, 0.8), pal.bone, 0, 0, 0)
  part(hips, new THREE.CylinderGeometry(0.21, 0.24, 0.22, 10), pal.trim, 0, 0.02, 0)
  const chest = joint(hips, 'chest', 0, 0.16, 0)
  part(chest, new THREE.CylinderGeometry(0.045, 0.05, 0.42, 6), pal.bone, 0, 0.2, -0.05)
  for (let i = 0; i < 4; i++) {
    const r = 0.17 + Math.sin((i / 3) * Math.PI) * 0.05
    part(chest, new THREE.TorusGeometry(r, 0.03, 5, 16, Math.PI * 1.55).rotateX(Math.PI / 2).rotateY(Math.PI * 0.72), pal.bone, 0, 0.12 + i * 0.09, -0.02)
  }
  // Mantle: a cloth collar in the archetype colour.
  part(chest, new THREE.CylinderGeometry(0.2, 0.3, 0.16, 12, 1, true), pal.cloth, 0, 0.47, 0, 0, 0, 0, true)
  const head = joint(chest, 'head', 0, 0.56, 0)
  part(head, new THREE.SphereGeometry(0.28, 18, 14).scale(1, 0.95, 1), pal.bone, 0, 0.24, 0)
  part(head, new RoundedBoxGeometry(0.34, 0.12, 0.26, 2, 0.04), pal.bone, 0, 0.04, 0.06)
  for (const sx of [-1, 1]) {
    part(head, new THREE.SphereGeometry(0.075, 10, 8), pal.dark, sx * 0.1, 0.24, 0.22)
    part(head, new THREE.SphereGeometry(0.04, 8, 6), pal.glow, sx * 0.1, 0.24, 0.27)
  }
  if (id === 'legion-rogue') {
    part(head, new THREE.SphereGeometry(0.34, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), pal.cloth, 0, 0.26, -0.04, -0.35, 0, 0, true)
  } else if (id === 'legion-warrior') {
    part(head, new THREE.SphereGeometry(0.31, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.45), pal.metal, 0, 0.3, 0)
    for (const sx of [-1, 1]) part(head, new THREE.ConeGeometry(0.07, 0.34, 7).translate(0, 0.17, 0), pal.bone, sx * 0.27, 0.42, 0, 0, 0, -sx * 0.7)
  } else if (id === 'legion-mage') {
    part(head, new THREE.CylinderGeometry(0.5, 0.5, 0.03, 20), pal.cloth, 0, 0.42, 0)
    part(head, new THREE.ConeGeometry(0.27, 0.62, 14).translate(0, 0.31, 0), pal.cloth, 0, 0.42, -0.03, -0.18, 0, 0)
    part(head, new THREE.TorusGeometry(0.26, 0.03, 5, 18).rotateX(Math.PI / 2), pal.trim, 0, 0.47, 0)
  }
  for (const side of [1, -1] as const) {
    const sx = side
    const arm = joint(chest, side === 1 ? 'armL' : 'armR', sx * 0.3, 0.4, 0)
    part(arm, new THREE.SphereGeometry(0.075, 8, 6), pal.bone, 0, 0, 0)
    part(arm, new THREE.CapsuleGeometry(0.045, 0.24, 3, 6), pal.bone, 0, -0.16, 0)
    const fore = joint(arm, side === 1 ? 'foreL' : 'foreR', 0, -0.32, 0)
    part(fore, new THREE.CapsuleGeometry(0.04, 0.22, 3, 6), pal.bone, 0, -0.14, 0)
    part(fore, new THREE.SphereGeometry(0.07, 8, 6).scale(1, 0.8, 1), pal.bone, 0, -0.3, 0)
    joint(fore, side === 1 ? 'handslotl' : 'handslotr', 0, -0.33, 0.02)
    const leg = joint(hips, side === 1 ? 'legL' : 'legR', sx * 0.13, -0.06, 0)
    part(leg, new THREE.CapsuleGeometry(0.055, 0.3, 3, 6), pal.bone, 0, -0.2, 0)
    const shin = joint(leg, side === 1 ? 'shinL' : 'shinR', 0, -0.42, 0)
    part(shin, new THREE.CapsuleGeometry(0.05, 0.28, 3, 6), pal.bone, 0, -0.2, 0)
    part(shin, new RoundedBoxGeometry(0.14, 0.08, 0.24, 2, 0.03), pal.trim, 0, -0.44, 0.05)
  }
  if (minion) root.scale.setScalar(0.92)
  return root
}

function titan(pal: Palette): THREE.Group {
  const root = new THREE.Group()
  root.name = 'fallback'
  const hips = joint(root, 'hips', 0, 1.9, 0)
  part(hips, new RoundedBoxGeometry(1.2, 0.5, 0.8, 3, 0.12), pal.metal, 0, 0, 0)
  const chest = joint(hips, 'chest', 0, 0.3, 0)
  part(chest, new RoundedBoxGeometry(1.9, 1.35, 1.25, 3, 0.2), pal.main, 0, 0.75, 0)
  part(chest, new THREE.CylinderGeometry(0.34, 0.34, 0.12, 18).rotateX(Math.PI / 2), pal.metal, 0, 0.8, 0.62)
  part(chest, new THREE.SphereGeometry(0.27, 16, 12), pal.glow, 0, 0.8, 0.62)
  for (const sx of [-1, 1]) part(chest, new THREE.CylinderGeometry(0.13, 0.16, 0.9, 10), pal.metal, sx * 0.45, 1.5, -0.5)
  const head = joint(chest, 'head', 0, 1.45, 0.05)
  part(head, new RoundedBoxGeometry(0.62, 0.5, 0.55, 3, 0.1), pal.main, 0, 0.25, 0)
  part(head, new RoundedBoxGeometry(0.5, 0.1, 0.06, 2, 0.02), pal.glow, 0, 0.28, 0.28)
  for (const side of [1, -1] as const) {
    const sx = side
    part(chest, new RoundedBoxGeometry(0.8, 0.5, 0.95, 3, 0.15), pal.metal, sx * 1.15, 1.35, 0)
    const arm = joint(chest, side === 1 ? 'armL' : 'armR', sx * 1.15, 1.1, 0)
    part(arm, new THREE.CylinderGeometry(0.26, 0.22, 0.9, 10), pal.main, 0, -0.45, 0)
    const fore = joint(arm, side === 1 ? 'foreL' : 'foreR', 0, -0.95, 0)
    part(fore, new THREE.CylinderGeometry(0.25, 0.3, 0.8, 10), pal.metal, 0, -0.4, 0)
    part(fore, new RoundedBoxGeometry(0.75, 0.6, 0.7, 3, 0.15), pal.main, 0, -0.95, 0.05)
    joint(fore, side === 1 ? 'handslotl' : 'handslotr', 0, -1.05, 0)
    const leg = joint(hips, side === 1 ? 'legL' : 'legR', sx * 0.45, -0.2, 0)
    part(leg, new THREE.CylinderGeometry(0.28, 0.24, 0.85, 10), pal.metal, 0, -0.42, 0)
    const shin = joint(leg, side === 1 ? 'shinL' : 'shinR', 0, -0.85, 0)
    part(shin, new THREE.CylinderGeometry(0.3, 0.26, 0.75, 10), pal.main, 0, -0.38, 0)
    part(shin, new RoundedBoxGeometry(0.62, 0.22, 0.95, 2, 0.08), pal.metal, 0, -0.8, 0.12)
  }
  return root
}

function wyrm(pal: Palette): THREE.Group {
  const root = new THREE.Group()
  root.name = 'fallback'
  const hips = joint(root, 'hips', 0, 1.2, 0)
  part(hips, new THREE.SphereGeometry(0.62, 18, 14).scale(0.85, 0.8, 1.3), pal.main, 0, 0, 0)
  part(hips, new THREE.SphereGeometry(0.5, 14, 10).scale(0.7, 0.62, 1.15), pal.cloth, 0, -0.16, 0.08)
  const chest = joint(hips, 'chest', 0, 0.25, 0.55)
  part(chest, new THREE.CylinderGeometry(0.2, 0.3, 0.7, 10).rotateX(-0.9), pal.main, 0, 0.22, 0.12)
  const head = joint(chest, 'head', 0, 0.55, 0.42)
  part(head, new THREE.SphereGeometry(0.32, 14, 10).scale(0.9, 0.85, 1.2), pal.main, 0, 0, 0)
  part(head, new THREE.ConeGeometry(0.2, 0.5, 10).rotateX(Math.PI / 2), pal.main, 0, -0.06, 0.42)
  for (const sx of [-1, 1]) {
    part(head, new THREE.ConeGeometry(0.06, 0.4, 6).translate(0, 0.2, 0), pal.trim, sx * 0.16, 0.18, -0.1, -0.9, 0, -sx * 0.25)
    part(head, new THREE.SphereGeometry(0.06, 8, 6), pal.glow, sx * 0.17, 0.08, 0.2)
  }
  for (const side of [1, -1] as const) {
    const wing = joint(hips, side === 1 ? 'wingL' : 'wingR', side * 0.45, 0.35, 0.15)
    const s = new THREE.Shape()
    s.moveTo(0, 0)
    s.lineTo(1.9, 0.75)
    s.lineTo(2.25, 0.1)
    s.lineTo(1.75, -0.2)
    s.lineTo(1.35, -0.55)
    s.lineTo(0.85, -0.45)
    s.lineTo(0.45, -0.75)
    s.lineTo(0, -0.35)
    const geo = new THREE.ShapeGeometry(s).rotateX(-Math.PI / 2)
    if (side === -1) geo.scale(-1, 1, 1)
    part(wing, geo, pal.cloth, 0, 0, 0, 0, 0, 0, true)
    part(wing, new THREE.CylinderGeometry(0.05, 0.03, 2.0, 6).rotateZ(-side * (Math.PI / 2 - 0.37)), pal.trim, side * 0.95, 0.02, -0.38)
    const leg = joint(hips, side === 1 ? 'legL' : 'legR', side * 0.32, -0.38, 0.15)
    part(leg, new THREE.CapsuleGeometry(0.1, 0.3, 3, 6), pal.main, 0, -0.18, 0)
    part(leg, new THREE.ConeGeometry(0.08, 0.2, 5).rotateX(Math.PI / 2), pal.trim, 0, -0.42, 0.1)
  }
  const tail = joint(hips, 'tail', 0, 0.05, -0.75)
  let seg: THREE.Object3D = tail
  for (let i = 0; i < 4; i++) {
    const r = 0.22 - i * 0.045
    part(seg, new THREE.CylinderGeometry(r * 0.75, r, 0.55, 8).rotateX(Math.PI / 2), pal.main, 0, 0, -0.27)
    seg = joint(seg, `tail${i}`, 0, 0, -0.52)
  }
  part(seg, new THREE.ConeGeometry(0.16, 0.4, 4).rotateX(-Math.PI / 2).scale(1, 0.3, 1), pal.cloth, 0, 0, -0.15)
  return root
}

function overlord(pal: Palette): THREE.Group {
  const root = new THREE.Group()
  root.name = 'fallback'
  const hips = joint(root, 'hips', 0, 1.0, 0)
  part(hips, new THREE.SphereGeometry(0.62, 18, 14).scale(1, 0.85, 0.85), pal.main, 0, 0, 0)
  const chest = joint(hips, 'chest', 0, 0.55, 0)
  part(chest, new THREE.SphereGeometry(0.85, 22, 16).scale(1, 1.05, 0.85), pal.main, 0, 0.55, 0)
  part(chest, new THREE.SphereGeometry(0.34, 18, 12), pal.glow, 0, 0.42, 0.55)
  part(chest, new THREE.TorusGeometry(0.4, 0.05, 8, 24), pal.trim, 0, 0.42, 0.6)
  const head = joint(chest, 'head', 0, 1.25, 0.15)
  part(head, new THREE.SphereGeometry(0.5, 18, 14).scale(1, 0.9, 0.9), pal.main, 0, 0.2, 0)
  for (const sx of [-1, 1]) {
    part(head, new THREE.SphereGeometry(0.11, 10, 8), pal.glow, sx * 0.2, 0.24, 0.38)
    const horn = new THREE.TorusGeometry(0.32, 0.07, 6, 14, Math.PI * 1.2)
    part(head, horn, pal.cloth, sx * 0.38, 0.62, -0.05, 0, sx * 0.4, sx === 1 ? 0.2 : Math.PI - 0.2)
  }
  for (const side of [1, -1] as const) {
    const arm = joint(chest, side === 1 ? 'armL' : 'armR', side * 0.82, 0.85, 0)
    part(arm, new THREE.CapsuleGeometry(0.16, 0.7, 4, 8), pal.main, 0, -0.45, 0)
    const fore = joint(arm, side === 1 ? 'foreL' : 'foreR', 0, -0.95, 0)
    part(fore, new THREE.CapsuleGeometry(0.14, 0.7, 4, 8), pal.main, 0, -0.42, 0)
    for (let f = 0; f < 3; f++) part(fore, new THREE.ConeGeometry(0.05, 0.3, 5).rotateX(Math.PI), pal.cloth, (f - 1) * 0.08, -0.95, 0.02)
    joint(fore, side === 1 ? 'handslotl' : 'handslotr', 0, -0.95, 0)
    const leg = joint(hips, side === 1 ? 'legL' : 'legR', side * 0.32, -0.4, 0)
    part(leg, new THREE.CapsuleGeometry(0.16, 0.4, 4, 8), pal.main, 0, -0.3, 0)
  }
  return root
}

function wraith(pal: Palette): THREE.Group {
  const root = new THREE.Group()
  root.name = 'fallback'
  const hips = joint(root, 'hips', 0, 0.9, 0)
  // A tattered cloak: a lathe with a jagged hem.
  const pts: THREE.Vector2[] = []
  for (let i = 0; i <= 10; i++) {
    const t = i / 10
    pts.push(new THREE.Vector2(0.18 + Math.sin(t * Math.PI * 0.9) * 0.62 * (1 - t * 0.45), -0.9 + t * 1.9))
  }
  const cloak = new THREE.LatheGeometry(pts, 18)
  const pos = cloak.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) > -0.7) continue
    const a = Math.atan2(pos.getZ(i), pos.getX(i))
    pos.setY(i, pos.getY(i) + (Math.sin(a * 9) * 0.5 + 0.5) * 0.28)
  }
  cloak.computeVertexNormals()
  part(hips, cloak, pal.main, 0, 0, 0, 0, 0, 0, true)
  const chest = joint(hips, 'chest', 0, 0.75, 0)
  const head = joint(chest, 'head', 0, 0.55, 0.1)
  part(head, new THREE.SphereGeometry(0.42, 18, 14).scale(1, 1.05, 1.05), pal.bone, 0, 0.1, 0)
  part(head, new RoundedBoxGeometry(0.46, 0.18, 0.36, 2, 0.06), pal.bone, 0, -0.22, 0.06)
  for (const sx of [-1, 1]) {
    part(head, new THREE.SphereGeometry(0.12, 10, 8), pal.dark, sx * 0.16, 0.1, 0.34)
    part(head, new THREE.SphereGeometry(0.05, 8, 6), pal.glow, sx * 0.16, 0.1, 0.4)
    part(head, new THREE.ConeGeometry(0.09, 0.85, 7).translate(0, 0.42, 0), pal.main, sx * 0.3, 0.35, -0.12, -0.25, 0, -sx * 0.32)
  }
  for (const side of [1, -1] as const) {
    const arm = joint(chest, side === 1 ? 'armL' : 'armR', side * 0.45, 0.35, 0)
    part(arm, new THREE.CapsuleGeometry(0.09, 0.62, 3, 6), pal.main, 0, -0.38, 0)
    const fore = joint(arm, side === 1 ? 'foreL' : 'foreR', 0, -0.78, 0)
    part(fore, new THREE.CapsuleGeometry(0.08, 0.6, 3, 6), pal.main, 0, -0.34, 0)
    for (let f = 0; f < 3; f++) part(fore, new THREE.ConeGeometry(0.035, 0.42, 5).rotateX(Math.PI - 0.3), pal.dark, (f - 1) * 0.07, -0.85, 0.08)
    joint(fore, side === 1 ? 'handslotl' : 'handslotr', 0, -0.8, 0)
  }
  return root
}

function sentry(pal: Palette): THREE.Group {
  const root = new THREE.Group()
  root.name = 'fallback'
  part(root, new THREE.CylinderGeometry(0.36, 0.42, 0.12, 14), pal.dark, 0, 0.06, 0)
  part(root, new THREE.CylinderGeometry(0.12, 0.16, 0.36, 10), pal.metal, 0, 0.3, 0)
  const head = joint(root, 'turret', 0, 0.52, 0)
  part(head, new RoundedBoxGeometry(0.5, 0.26, 0.42, 2, 0.06), pal.main, 0, 0.02, 0)
  part(head, new THREE.BoxGeometry(0.32, 0.05, 0.02), pal.glow, 0, 0.05, 0.215)
  for (const sx of [-1, 1]) part(head, new THREE.CylinderGeometry(0.04, 0.05, 0.42, 8).rotateX(Math.PI / 2), pal.metal, sx * 0.13, -0.02, 0.36)
  return root
}

/* ── helpers ─────────────────────────────────────────────────── */

function palette(id: ModelId, look: Look): Palette {
  const m = look.materials ?? {}
  const pick = (name: string, fallback: string) => m[name]?.color ?? fallback
  const std = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.05, ...extra })
  const glow = new THREE.MeshStandardMaterial({ color: look.glow, emissive: look.glow, emissiveIntensity: look.glowIntensity ?? 3, roughness: 0.4 })
  const cloth = look.cloth ?? '#6b2b3a'
  switch (id) {
    case 'iron-titan':
      return {
        bone: std('#c9c2b4'), cloth: std(cloth), dark: std('#14161b', { metalness: 0.5 }), glow,
        main: std(pick('Main', '#3b3f47'), { metalness: 0.85, roughness: 0.36 }),
        metal: std(pick('Grey', '#8a8f99'), { metalness: 0.9, roughness: 0.28 }),
        trim: std('#5a5f69', { metalness: 0.8, roughness: 0.4 }),
      }
    case 'vortex-weaver':
      return {
        bone: std('#eaf7ff'), cloth: std(pick('Dragon_Secondary', '#2a8ea0'), { emissive: look.glow, emissiveIntensity: 0.25, side: THREE.DoubleSide }),
        dark: std('#0c2a30'), glow, main: std(pick('Dragon_Main', '#cfe7ea')), metal: std('#9fb4bb', { metalness: 0.4 }),
        trim: std(pick('Dragon_Horn', '#eaf7ff'), { metalness: 0.3, roughness: 0.25 }),
      }
    case 'plasma-overlord':
      return {
        bone: std('#ffe6fb'), cloth: std(pick('Alien_Secondary', '#4a1450'), { emissive: look.glow, emissiveIntensity: 1.4 }),
        dark: std('#0a0816'), glow, main: std(pick('Alien_Main', '#1b1636'), { metalness: 0.55, roughness: 0.32 }),
        metal: std('#6c6a8a', { metalness: 0.8 }), trim: std('#d9b25a', { metalness: 0.85, roughness: 0.3 }),
      }
    case 'void-stalker':
      return {
        bone: std(pick('Ghost_Secondary', '#d9d0c4')), cloth: std('#2a0d52'), dark: std('#050208'), glow,
        main: std(pick('Ghost_Main', '#0b0714'), { roughness: 0.65, side: THREE.DoubleSide }),
        metal: std('#3a2d4a'), trim: std('#4a3a5c'),
      }
    case 'sentry-turret':
      return {
        bone: std('#c9c2b4'), cloth: std(cloth), glow,
        dark: std(pick('dark', '#11151c'), { metalness: 0.4, roughness: 0.5 }),
        main: std(pick('metal', '#3a4352'), { metalness: 0.75, roughness: 0.38 }),
        metal: std(pick('metalDark', '#262d38'), { metalness: 0.7, roughness: 0.45 }),
        trim: std(pick('metalRed', '#1b6f86'), { metalness: 0.6 }),
      }
    default:
      return {
        bone: std(LEGION_BONE, { roughness: 0.75 }), cloth: std(cloth, { roughness: 0.85, side: THREE.DoubleSide }),
        dark: std('#1c1a1f', { roughness: 0.7 }), glow, main: std('#4a4650'),
        metal: std('#7c828c', { metalness: 0.75, roughness: 0.38 }), trim: std('#5a3c2a', { roughness: 0.8 }),
      }
  }
}

function joint(parent: THREE.Object3D, name: string, x: number, y: number, z: number): THREE.Group {
  const g = new THREE.Group()
  g.name = name
  g.position.set(x, y, z)
  parent.add(g)
  return g
}

function part(
  parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material,
  x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, doubleSide = false,
): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat)
  m.position.set(x, y, z)
  m.rotation.set(rx, ry, rz)
  m.castShadow = true
  m.receiveShadow = true
  if (doubleSide && !(mat as THREE.MeshStandardMaterial).side) (mat as THREE.MeshStandardMaterial).side = THREE.DoubleSide
  parent.add(m)
  return m
}

/** Merge a figure's rigid parts per joint and material (fewer draw calls for the stand-ins). */
export function compactFallback(root: THREE.Object3D): void {
  root.traverse(node => {
    const groups = new Map<THREE.Material, THREE.Mesh[]>()
    for (const c of node.children) {
      const m = c as THREE.Mesh
      if (!m.isMesh || m.name === 'fuse-tip' || m.children.length) continue
      const mat = m.material as THREE.Material
      if (!groups.has(mat)) groups.set(mat, [])
      groups.get(mat)!.push(m)
    }
    for (const [mat, meshes] of groups) {
      if (meshes.length < 2) continue
      const geos = meshes.map(m => {
        m.updateMatrix()
        const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()
        for (const key of Object.keys(g.attributes)) if (key !== 'position' && key !== 'normal' && key !== 'uv') g.deleteAttribute(key)
        if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2))
        return g.applyMatrix4(m.matrix)
      })
      const merged = mergeGeometries(geos)
      geos.forEach(g => g.dispose())
      if (!merged) continue
      for (const m of meshes) {
        m.geometry.dispose()
        node.remove(m)
      }
      const mesh = new THREE.Mesh(merged, mat)
      mesh.castShadow = mesh.receiveShadow = true
      node.add(mesh)
    }
  })
}
