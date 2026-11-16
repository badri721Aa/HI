/**
 * Procedural geometry for the gameplay objects. Everything is built once at
 * init and shared by instanced meshes.
 */
import * as THREE from 'three'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/** Faceted five-point star: a flat star outline with an apex on each side. */
export function starGeometry(outer = 0.42, inner = 0.19, depth = 0.16): THREE.BufferGeometry {
  const rim: Array<[number, number]> = []
  for (let k = 0; k < 10; k++) {
    const a = Math.PI / 2 + (k * Math.PI) / 5
    const r = k % 2 === 0 ? outer : inner
    rim.push([Math.cos(a) * r, Math.sin(a) * r])
  }
  const pos: number[] = []
  for (let k = 0; k < 10; k++) {
    const [ax, ay] = rim[k]
    const [bx, by] = rim[(k + 1) % 10]
    pos.push(0, 0, depth, ax, ay, 0, bx, by, 0)
    pos.push(0, 0, -depth, bx, by, 0, ax, ay, 0)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  return g
}

/** Small elongated diamond for sparks. */
export function sparkGeometry(radius = 0.13): THREE.BufferGeometry {
  const g = new THREE.OctahedronGeometry(radius, 0)
  g.scale(1, 1.45, 1)
  return g
}

/** Plump heart gem, centred, ~0.5 m tall. */
export function heartGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape()
  s.moveTo(0, -0.5)
  s.bezierCurveTo(-0.16, -0.33, -0.52, -0.12, -0.52, 0.16)
  s.bezierCurveTo(-0.52, 0.42, -0.22, 0.56, 0, 0.32)
  s.bezierCurveTo(0.22, 0.56, 0.52, 0.42, 0.52, 0.16)
  s.bezierCurveTo(0.52, -0.12, 0.16, -0.33, 0, -0.5)
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.14, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.08, bevelSegments: 3, curveSegments: 14 })
  g.center()
  g.scale(0.5, 0.5, 0.5)
  g.deleteAttribute('uv')
  return g
}

/* ── Gloomling ──────────────────────────────────────────────── */

function paint(g: THREE.BufferGeometry, color: THREE.ColorRepresentation, glow = 0): THREE.BufferGeometry {
  const n = g.attributes.position.count
  const c = new THREE.Color(color)
  const col = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    col[i * 3] = c.r
    col[i * 3 + 1] = c.g
    col[i * 3 + 2] = c.b
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  g.setAttribute('aGlow', new THREE.BufferAttribute(new Float32Array(n).fill(glow), 1))
  if (g.attributes.uv) g.deleteAttribute('uv')
  return g
}

const BODY_R = 0.5
const BOTTOM_KNEE = -0.2
const BOTTOM_SQUASH = 0.45
/** Horizontal widening toward the base (gumdrop silhouette). */
const bodyWiden = (ny: number) => 1 + 0.06 * (1 - ny)
const bodyLift = -(BOTTOM_KNEE + (-BODY_R - BOTTOM_KNEE) * BOTTOM_SQUASH)

/** Front surface z of the deformed body at final height y and lateral offset x. */
function bodySurfaceZ(x: number, y: number): number {
  const y0 = y - bodyLift
  const ny = y0 / BODY_R
  const rh = Math.sqrt(Math.max(0, BODY_R * BODY_R - y0 * y0)) * bodyWiden(ny)
  return Math.sqrt(Math.max(0, rh * rh - x * x))
}

/** Height of the gloomling body at scale 1 (feet at y = 0). */
export const GLOOM_HEIGHT = BODY_R + bodyLift

/**
 * A gloomling at scale 1, feet at the origin, facing +Z: gumdrop jelly body,
 * two slit-pupil glowing eyes, little horns and a fanged grin.
 * Attributes: position, normal, color, aGlow (1 = eye glow).
 */
export function gloomlingGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []

  // Body — weld the sphere seam first so the deformed normals stay smooth.
  let body: THREE.BufferGeometry = new THREE.SphereGeometry(BODY_R, 36, 24)
  body.deleteAttribute('uv')
  body.deleteAttribute('normal')
  body = mergeVertices(body)
  const p = body.attributes.position as THREE.BufferAttribute
  const top = new THREE.Color('#5d3190')
  const bottom = new THREE.Color('#1e0f33')
  const belly = new THREE.Color('#71409f')
  const col = new Float32Array(p.count * 3)
  const tmp = new THREE.Color()
  for (let i = 0; i < p.count; i++) {
    const x0 = p.getX(i)
    let y = p.getY(i)
    const z0 = p.getZ(i)
    const ny = y / BODY_R
    const w = bodyWiden(ny)
    if (y < BOTTOM_KNEE) y = BOTTOM_KNEE + (y - BOTTOM_KNEE) * BOTTOM_SQUASH
    p.setXYZ(i, x0 * w, y + bodyLift, z0 * w)
    const t = THREE.MathUtils.smoothstep(ny, -0.9, 0.85)
    tmp.copy(bottom).lerp(top, t)
    // A slightly lighter, translucent-looking belly at the front.
    const front = Math.max(0, z0 / BODY_R) * (1 - Math.abs(ny))
    tmp.lerp(belly, front * 0.35)
    col[i * 3] = tmp.r
    col[i * 3 + 1] = tmp.g
    col[i * 3 + 2] = tmp.b
  }
  body.computeVertexNormals()
  body.setAttribute('color', new THREE.BufferAttribute(col, 3))
  body.setAttribute('aGlow', new THREE.BufferAttribute(new Float32Array(p.count), 1))
  parts.push(body)

  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  const v = new THREE.Vector3()
  const s = new THREE.Vector3()

  // Eyes with vertical slit pupils, turned to follow the body's curve.
  const eyeY = 0.5
  for (const side of [-1, 1]) {
    const ex = 0.165 * side
    const ez = bodySurfaceZ(ex, eyeY)
    const yaw = Math.atan2(ex, ez)
    q.setFromEuler(e.set(-0.12, yaw, 0))
    const fwd = v.set(Math.sin(yaw), 0, Math.cos(yaw))
    const eye = paint(new THREE.SphereGeometry(0.1, 16, 12), '#ffd447', 1)
    eye.applyMatrix4(m.compose(new THREE.Vector3(ex, eyeY, ez).addScaledVector(fwd, -0.035), q, s.set(1, 1.28, 0.62)))
    parts.push(eye)
    const pupil = paint(new THREE.SphereGeometry(0.06, 10, 8), '#14081c')
    pupil.applyMatrix4(m.compose(new THREE.Vector3(ex, eyeY, ez).addScaledVector(fwd, 0.017), q, s.set(0.3, 1.25, 0.32)))
    parts.push(pupil)
  }

  // Tiny curved horns.
  for (const side of [-1, 1]) {
    const horn = paint(new THREE.ConeGeometry(0.055, 0.17, 10), '#24112f')
    horn.translate(0, 0.085, 0)
    q.setFromEuler(e.set(0.18, 0, -0.42 * side))
    horn.applyMatrix4(m.compose(v.set(0.15 * side, GLOOM_HEIGHT - 0.06, 0.02), q, s.set(1, 1, 1)))
    parts.push(horn)
  }

  // Grin with two little fangs.
  const mouthY = 0.36
  const mouth = paint(new THREE.TorusGeometry(0.1, 0.019, 6, 16, Math.PI), '#14081c')
  mouth.rotateZ(Math.PI)
  mouth.scale(1, 0.75, 0.6)
  mouth.translate(0, mouthY, bodySurfaceZ(0, mouthY) - 0.008)
  parts.push(mouth)
  for (const side of [-1, 1]) {
    const fx = 0.045 * side
    const fy = mouthY - Math.sqrt(0.01 - fx * fx) * 0.75
    const fang = paint(new THREE.ConeGeometry(0.019, 0.05, 6), '#f3ead6')
    fang.rotateX(Math.PI)
    fang.translate(fx, fy - 0.022, bodySurfaceZ(fx, fy) + 0.004)
    parts.push(fang)
  }

  const merged = mergeGeometries(parts, false)!
  for (const g of parts) g.dispose()
  merged.computeBoundingSphere()
  return merged
}

/* ── Checkpoint lantern ─────────────────────────────────────── */

/** Distance from the lantern's hang point down to the centre of its glass. */
export const LANTERN_DROP = 0.5

/**
 * Iron lantern frame (base, corner posts, top plate, pyramid roof, ring and a
 * short chain), origin at the hang point, hanging down the -Y axis.
 */
export function lanternFrameGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const add = (g: THREE.BufferGeometry, x: number, y: number, z: number) => {
    if (g.attributes.uv) g.deleteAttribute('uv')
    g.translate(x, y - LANTERN_DROP, z)
    parts.push(g.index ? g.toNonIndexed() : g)
  }
  add(new THREE.BoxGeometry(0.28, 0.035, 0.28), 0, -0.165, 0)
  add(new THREE.BoxGeometry(0.17, 0.04, 0.17), 0, -0.2, 0)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(new THREE.BoxGeometry(0.03, 0.31, 0.03), 0.118 * sx, 0, 0.118 * sz)
  add(new THREE.BoxGeometry(0.29, 0.03, 0.29), 0, 0.16, 0)
  const roof = new THREE.ConeGeometry(0.215, 0.15, 4, 1)
  roof.rotateY(Math.PI / 4)
  add(roof, 0, 0.25, 0)
  add(new THREE.CylinderGeometry(0.03, 0.04, 0.05, 8), 0, 0.345, 0)
  add(new THREE.TorusGeometry(0.045, 0.011, 6, 14), 0, 0.41, 0)
  add(new THREE.BoxGeometry(0.014, 0.05, 0.014), 0, 0.475, 0)
  const merged = mergeGeometries(parts, false)!
  for (const g of parts) g.dispose()
  merged.computeBoundingSphere()
  return merged
}

/** The four glass panes (one box) — UVs 0..1 per face drive the hot-spot glow. */
export function lanternGlassGeometry(): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(0.21, 0.29, 0.21)
  g.translate(0, -LANTERN_DROP, 0)
  return g
}
