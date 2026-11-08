/**
 * Wreck Cove — the Driftwood, run aground and listing toward the shore.
 *
 * The ship is built in its own tilted frame (yaw WRECK.yaw, a slight list and pitch) that is
 * solved so the deck centre sits at WRECK.deckY and the crow's nest — on top of the broken
 * mast — is centred exactly on WRECK at WRECK.nestY (shard 6 floats above it).
 * Collision boxes can only yaw, so the tilted deck is approximated by flat strips.
 *
 * Climb: a low crate → crate stacks on the shore side → deck (through a gap in the bulwark) →
 * plank steps spiralling up the mast (each ≤ 1.15 m) → crow's nest.
 * A balance spar crosses the hull breach, whose bare ribs open onto the beach.
 */
import * as THREE from 'three'
import type { Ctx } from '../../types'
import { heightAt } from '../heightfield'
import { WRECK } from '../level'
import { ZoneKit, type ZonePart } from './kit'
import {
  barrel, beam, crate, crateStack, frame, hangingLantern, hullGeometry, hullHalfBeam, hullHalfWidthAt, hullPoint, place, rod, rope,
  ropeCoil, slab, tbox, type HullOpts,
} from './beach'

const HULL: HullOpts = { length: 17, beam: 5.4, depth: 4.8, sheer: 0.9, rocker: 0.5, thickness: 0.12, transom: 0.22, segV: 14, uvScale: 1.6 }
/** Deck height above the keel (ship-local). */
const DECK = 4.2
/** Mast position along the ship (local z). */
const ZM = 1.2
/** Hull breach on the shore side (deck missing, ribs exposed) and the climbing gap in the bulwark (local z). */
const BREACH: [number, number] = [-4.6, -1.6]
const GAP: [number, number] = [3.2, 5.4]
const PITCH = -0.02
/** Positive roll lowers the starboard (local -x, shore) side. */
const ROLL = 0.09
const L = HULL.length
const NEST_R = 1.35

const uAt = (z: number) => z / L + 0.5

export function buildCove(ctx: Ctx): ZonePart {
  const kit = new ZoneKit(ctx, 'cove')
  const ship = new Ship(kit)
  ship.build()
  scatter(kit, ship)
  kit.finalize()
  return { dispose: () => kit.dispose() }
}

class Ship {
  /** Ship frame (local → world). */
  readonly M: THREE.Matrix4
  /** Local height of the nest top above the keel. */
  readonly nestY: number
  private v = new THREE.Vector3()

  constructor(private kit: ZoneKit) {
    // Solve the frame: deck centre at WRECK.deckY, nest centre exactly over WRECK at nestY.
    const R = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(PITCH, WRECK.yaw, ROLL, 'YXZ'))
    const ey = new THREE.Vector3(0, 1, 0).applyMatrix4(R)
    const ez = new THREE.Vector3(0, 0, 1).applyMatrix4(R)
    const oy = WRECK.deckY - ey.y * DECK
    this.nestY = (WRECK.nestY - oy - ez.y * ZM) / ey.y
    const ox = WRECK.x - (ey.x * this.nestY + ez.x * ZM)
    const oz = WRECK.z - (ey.z * this.nestY + ez.z * ZM)
    this.M = frame(ox, oy, oz, WRECK.yaw, PITCH, ROLL)
  }

  /** Local → world (returns a shared vector). */
  world(x: number, y: number, z: number): THREE.Vector3 {
    return this.v.set(x, y, z).applyMatrix4(this.M)
  }

  /** Flat world collider for a ship-local box whose top centre is (x, top, z); extends `depth` down. */
  box(x: number, top: number, z: number, w: number, d: number, depth: number, yaw = 0): void {
    const p = this.world(x, top, z)
    this.kit.solidBox(p.x, p.y - depth, p.z, w, depth, d, WRECK.yaw + yaw, { surface: 'wood' })
  }

  /** As box(), but reaching down into the sand under it. */
  solid(x: number, top: number, z: number, w: number, d: number): void {
    const p = this.world(x, top, z)
    const wx = p.x
    const wy = p.y
    const wz = p.z
    let g = Infinity
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const c = this.world(x + (sx * w) / 2, top, z + (sz * d) / 2)
      g = Math.min(g, heightAt(c.x, c.z))
    }
    this.kit.solidBox(wx, g - 0.4, wz, w, wy - (g - 0.4), d, WRECK.yaw, { surface: 'wood' })
  }

  build(): void {
    this.hull()
    this.deck()
    this.mast()
    this.details()
  }

  private hull(): void {
    const kit = this.kit
    const vDeck = -0.86
    const pieces: Array<[number, number, number, boolean]> = [
      [-L / 2, BREACH[0], -1, true],
      [BREACH[0], BREACH[1], -0.35, false],
      [BREACH[1], GAP[0], -1, false],
      [GAP[0], GAP[1], vDeck, false],
      [GAP[1], L / 2, -1, false],
    ]
    for (const [z0, z1, v0, cap] of pieces) {
      const u0 = uAt(z0)
      const u1 = uAt(z1)
      const g = hullGeometry({ ...HULL, u0, u1, v0, cap, segU: Math.max(2, Math.round((u1 - u0) * 26)) })
      g.applyMatrix4(this.M)
      kit.add(g, 'darkPlanks')
    }
    // Bare ribs in the breach (some snapped short), following the inside of the hull.
    const P = new THREE.Vector3()
    const ribs = 5
    for (let k = 0; k < ribs; k++) {
      const u = uAt(BREACH[0] + 0.3 + ((BREACH[1] - BREACH[0] - 0.6) * k) / (ribs - 1))
      const vStart = k % 2 === 0 ? -1 : -0.62 - 0.1 * k
      const n = 10
      let prev: [number, number, number] | null = null
      for (let i = 0; i <= n; i++) {
        const v = vStart + ((0.15 - vStart) * i) / n
        hullPoint(HULL, u, v, P)
        const cur: [number, number, number] = [P.x * 0.97, P.y + 0.1, P.z]
        if (prev) beam(kit, 'darkPlanks', ...prev, ...cur, 0.2, 0.16, 1, this.M)
        prev = cur
      }
    }
    // Keel timber along the bottom and a rudder kicked over at the stern.
    rod(kit, 'darkPlanks', 0, 0.1, -L / 2 + 0.6, 0, 0.35, L / 2 - 0.4, 0.16, 6, 1, this.M, 0.16, true)
    tbox(kit, 'darkPlanks', 0.25, 2.3, -L / 2 - 0.35, 0.2, 3.4, 1.1, 0.35, 0, 0, 1, this.M)
    // Broken bowsprit.
    const yb = HULL.depth + (HULL.sheer ?? 0)
    rod(kit, 'darkPlanks', 0, yb - 0.5, L / 2 - 1.2, 0, yb + 0.55, L / 2 + 1.8, 0.17, 8, 1, this.M, 0.12, true)
  }

  /** Half-width of the deck at local z. */
  private hw(z: number): number {
    return Math.max(0.3, hullHalfWidthAt(HULL, uAt(z), DECK))
  }

  private deck(): void {
    const kit = this.kit
    const ranges: Array<[number, number]> = [[-L / 2 + 0.35, BREACH[0]], [BREACH[1], L / 2 - 1.0]]
    for (const [za, zb] of ranges) {
      // Plank surface following the hull's inside line (planks run fore and aft).
      const pos: number[] = []
      const uv: number[] = []
      const n = Math.max(2, Math.ceil((zb - za) / 0.5))
      for (let i = 0; i < n; i++) {
        const z0 = za + ((zb - za) * i) / n
        const z1 = za + ((zb - za) * (i + 1)) / n
        const w0 = this.hw(z0)
        const w1 = this.hw(z1)
        for (const [y, up] of [[DECK, true], [DECK - 0.14, false]] as const) {
          const quad = [[-w0, z0], [-w1, z1], [w1, z1], [-w0, z0], [w1, z1], [w0, z0]]
          if (!up) quad.reverse()
          for (const [x, z] of quad) {
            pos.push(x, y, z)
            uv.push(z / 1.6, x / 1.6)
          }
        }
      }
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
      g.computeVertexNormals()
      g.applyMatrix4(this.M)
      kit.add(g, 'planks')

      // Flat collider strips (deck tilt ≈ 0.2 m across a strip) that also make the hull solid.
      const pieces = Math.max(1, Math.ceil((zb - za) / 2))
      for (let i = 0; i < pieces; i++) {
        const z0 = za + ((zb - za) * i) / pieces
        const z1 = za + ((zb - za) * (i + 1)) / pieces
        const w = Math.min(this.hw(z0), this.hw(z1))
        const strips = w > 1.2 ? 3 : 1
        for (let s = 0; s < strips; s++) {
          const x0 = -w + (2 * w * s) / strips
          const x1 = -w + (2 * w * (s + 1)) / strips
          this.solid((x0 + x1) / 2, DECK, (z0 + z1) / 2, x1 - x0, z1 - z0)
        }
        // Bulwarks (open on the shore side at the climbing gap, and gone along the breach).
        const zc = (z0 + z1) / 2
        const u = uAt(zc)
        const e = 2 * u - 1
        const rail = HULL.depth + (HULL.sheer ?? 0) * e * e - DECK + 0.05
        for (const side of [-1, 1]) {
          if (side < 0 && zc > GAP[0] && zc < GAP[1]) continue
          this.box(side * (w + 0.08), DECK + rail, zc, 0.22, z1 - z0, rail + 0.1)
        }
      }
      // Deck beams across the cut ends.
      for (const z of [za, zb]) {
        if (z !== BREACH[0] && z !== BREACH[1]) continue
        const w = this.hw(z)
        beam(kit, 'darkPlanks', -w, DECK - 0.12, z, w, DECK - 0.12, z, 0.26, 0.26, 1, this.M)
      }
    }
    // Hull wall on the sea side of the breach (the shore side is open between the ribs).
    for (const z of [BREACH[0] + 0.75, BREACH[1] - 0.75]) {
      const p = this.world(this.hw(z) + 0.1, DECK + 0.7, z)
      const g = heightAt(p.x, p.z)
      this.kit.solidBox(p.x, g - 0.4, p.z, 0.25, p.y - (g - 0.4), 1.5, WRECK.yaw, { surface: 'wood' })
    }
    // Stern transom rail.
    this.box(0, DECK + 1.5, -L / 2 + 0.4, this.hw(-L / 2 + 0.4) * 2, 0.25, 1.6)
    // Splintered planks hanging into the breach and a fallen spar to balance across it.
    tbox(kit, 'planks', -0.6, DECK - 0.25, BREACH[1] - 0.45, 0.32, 0.06, 1.1, 0.1, 0.45, 0, 1, this.M)
    tbox(kit, 'planks', 0.9, DECK - 0.2, BREACH[1] - 0.35, 0.3, 0.06, 0.9, -0.2, 0.35, 0, 1, this.M)
    tbox(kit, 'planks', -1.3, DECK - 0.2, BREACH[0] + 0.35, 0.3, 0.06, 0.8, 0.15, -0.4, 0, 1, this.M)
    rod(kit, 'darkPlanks', 1.0, DECK + 0.12, BREACH[0] - 0.4, 0.85, DECK + 0.12, BREACH[1] + 0.4, 0.15, 8, 1, this.M, 0.13, true)
    this.box(0.92, DECK + 0.26, (BREACH[0] + BREACH[1]) / 2, 0.3, BREACH[1] - BREACH[0] + 0.8, 0.3)
  }

  private mast(): void {
    const kit = this.kit
    const M = this.M
    const top = this.nestY
    // Mast with iron bands, broken off just above the nest.
    rod(kit, 'darkPlanks', 0, 0.5, ZM, 0, top + 0.5, ZM, 0.34, 10, 1, M, 0.27, true)
    for (const y of [DECK + 0.4, DECK + 3.5, DECK + 6.5]) rod(kit, 'metal', 0, y, ZM, 0, y + 0.08, ZM, 0.35, 10, 1, M)
    for (let k = 0; k < 4; k++) {
      const a = k * 1.7
      beam(kit, 'darkPlanks', Math.cos(a) * 0.12, top + 0.4, ZM + Math.sin(a) * 0.12, Math.cos(a) * 0.18, top + 0.75 + (k % 2) * 0.3, ZM + Math.sin(a) * 0.18, 0.1, 0.06, 1, M)
    }
    // Mast colliders: stacked short cylinders follow the list of the mast.
    for (let y = DECK; y < top - 0.3; y += 2.2) {
      const h = Math.min(2.2, top - 0.2 - y)
      const p = this.world(0, y + h / 2, ZM)
      kit.own(kit.ctx.collision.addCylinder({ x: p.x, y: p.y - h / 2, z: p.z, r: 0.34, h, surface: 'wood' }))
    }

    // Plank steps spiralling up the mast, each on a bracket.
    const k = Math.ceil((top - DECK) / 1.12) - 1
    const rise = (top - DECK) / (k + 1)
    const A0 = 2.1
    const DA = -1.3
    const angles: number[] = []
    for (let i = 0; i < k; i++) {
      const y = DECK + (i + 1) * rise
      const a = A0 + i * DA
      angles.push(a)
      const yaw = Math.atan2(Math.cos(a), Math.sin(a))
      // The top steps stick out past the nest: its underside would otherwise cap the jumps.
      const outer = i >= k - 3
      const r0 = outer ? NEST_R + 0.1 : 0.3
      const r1 = outer ? NEST_R + 1.25 : 2.0
      const rc = (r0 + r1) / 2
      const tw = outer ? 1.2 : 1.0
      tbox(kit, 'planks', Math.cos(a) * rc, y - 0.06, ZM + Math.sin(a) * rc, tw, 0.12, r1 - r0, yaw, 0, 0, 1, M)
      beam(kit, 'darkPlanks', Math.cos(a) * 0.3, y - (outer ? 1.6 : 0.95), ZM + Math.sin(a) * 0.3, Math.cos(a) * (r1 - 0.25), y - 0.14, ZM + Math.sin(a) * (r1 - 0.25), 0.1, 0.1, 1, M)
      if (outer) beam(kit, 'darkPlanks', Math.cos(a) * 0.3, y - 0.1, ZM + Math.sin(a) * 0.3, Math.cos(a) * r0, y - 0.1, ZM + Math.sin(a) * r0, 0.12, 0.1, 1, M)
      this.box(Math.cos(a) * rc, y, ZM + Math.sin(a) * rc, tw, r1 - r0, 0.3, yaw)
    }
    const last = angles[angles.length - 1]

    // Crow's nest: platform, plank wall (open toward the last step) and a top rail.
    slab(kit, 'planks', 0, top, ZM, 0, NEST_R, 0.18, 12, 1.2, 0, M)
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4
      beam(kit, 'darkPlanks', Math.cos(a) * 0.3, top - 1.0, ZM + Math.sin(a) * 0.3, Math.cos(a) * (NEST_R - 0.15), top - 0.17, ZM + Math.sin(a) * (NEST_R - 0.15), 0.1, 0.1, 1, M)
    }
    const c = this.world(0, top, ZM)
    kit.own(kit.ctx.collision.addCylinder({ x: c.x, y: c.y - 0.2, z: c.z, r: NEST_R, h: 0.2, surface: 'wood' }))
    const n = 12
    const wallR = NEST_R - 0.06
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2
      const a1 = ((i + 1) / n) * Math.PI * 2
      const mid = (a0 + a1) / 2
      const open = Math.abs(Math.atan2(Math.sin(mid - last), Math.cos(mid - last))) < 0.5
      const x0 = Math.cos(a0) * wallR
      const z0 = ZM + Math.sin(a0) * wallR
      const x1 = Math.cos(a1) * wallR
      const z1 = ZM + Math.sin(a1) * wallR
      if (open) continue
      const len = Math.hypot(x1 - x0, z1 - z0)
      const yaw = Math.atan2(x1 - x0, z1 - z0)
      tbox(kit, 'planks', (x0 + x1) / 2, top + 0.42, (z0 + z1) / 2, 0.06, 0.84, len + 0.02, yaw, 0, 0, 1, M)
      beam(kit, 'darkPlanks', x0, top + 0.88, z0, x1, top + 0.88, z1, 0.1, 0.08, 1, M)
      tbox(kit, 'darkPlanks', x0, top + 0.44, z0, 0.1, 0.9, 0.1, 0, 0, 0, 1, M)
      this.box((x0 + x1) / 2, top + 0.88, (z0 + z1) / 2, 0.14, len, 0.88, yaw)
    }

    // The yard, drooping, set between two steps and clear of them; a torn sail hangs off one arm.
    const yy = DECK + 2.5 * rise
    const phi = (angles[1] + angles[2]) / 2 + Math.PI / 2
    const ux = Math.cos(phi)
    const uz = Math.sin(phi)
    rod(kit, 'darkPlanks', -ux * 3.6, yy - 0.55, ZM - uz * 3.6, ux * 4.0, yy + 0.25, ZM + uz * 4.0, 0.13, 8, 1, M, 0.13, true)
    let far = -1
    let sailDir = 1
    for (const s of [1, -1]) {
      let best = Infinity
      for (let i = 0; i < 3; i++) best = Math.min(best, Math.abs(Math.atan2(Math.sin(phi + (s < 0 ? Math.PI : 0) - angles[i]), Math.cos(phi + (s < 0 ? Math.PI : 0) - angles[i]))))
      if (best > far) {
        far = best
        sailDir = s
      }
    }
    const sx = ux * sailDir
    const sz = uz * sailDir
    const sail = new THREE.PlaneGeometry(2.0, 2.5, 6, 6)
    const sp = sail.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < sp.count; i++) {
      const x = sp.getX(i)
      const y = sp.getY(i)
      const ragged = y < -1.0 ? Math.sin(x * 9.1) * 0.35 + 0.2 : 0
      sp.setXYZ(i, x, y + ragged, Math.sin(x * 2.3 + y * 1.7) * 0.12 + (1.25 - y) * 0.06)
    }
    sail.computeVertexNormals()
    const sailYaw = Math.atan2(sz, sx) * -1
    sail.applyMatrix4(place(sx * 2.7, yy + (sailDir > 0 ? 0.0 : -0.4) - 1.3, ZM + sz * 2.7, sailYaw, 0, 0, M))
    kit.add(sail, 'cloth')
    // Loose lines dangling from the yard arms.
    for (const s of [-1, 1]) {
      const r = s > 0 ? 3.9 : 3.5
      const y = s > 0 ? yy + 0.22 : yy - 0.52
      rod(kit, 'rope', ux * r * s, y, ZM + uz * r * s, ux * r * s * 0.97, y - 2.4, ZM + uz * r * s * 0.97, 0.025, 4, 2, M)
    }
  }

  private details(): void {
    const kit = this.kit
    const M = this.M
    // Deckhouse at the stern with a lit window and a lantern by the door; a barrel to climb it.
    const dz = -6.6
    tbox(kit, 'planks', 0, DECK + 0.9, dz, 2.4, 1.8, 2.2, 0, 0, 0, 1.4, M)
    tbox(kit, 'darkPlanks', 0, DECK + 1.88, dz, 2.8, 0.16, 2.6, 0, 0, 0, 1.4, M)
    tbox(kit, 'darkPlanks', -0.45, DECK + 0.8, dz + 1.13, 0.75, 1.55, 0.06, 0, 0, 0, 1, M)
    tbox(kit, 'glow', 0.55, DECK + 1.15, dz + 1.12, 0.45, 0.4, 0.04, 0, 0, 0, 1, M)
    tbox(kit, 'glow', 1.22, DECK + 1.15, dz, 0.04, 0.4, 0.5, 0, 0, 0, 1, M)
    const lp = this.world(-1.0, DECK + 1.75, dz + 1.35)
    hangingLantern(kit, lp.x, lp.y, lp.z)
    this.solid(0, DECK + 1.96, dz, 2.8, 2.6)
    const b = this.world(1.55, DECK, -5.0)
    barrel(kit, b.x, b.y, b.z, { yaw: WRECK.yaw })
    this.box(1.55, DECK + 0.95, -5.0, 0.7, 0.7, 0.95)

    // Hatch, capstan, coiled rope on deck.
    tbox(kit, 'darkPlanks', 0, DECK + 0.17, -0.45, 1.6, 0.34, 1.2, 0, 0, 0, 1, M)
    tbox(kit, 'planks', 0, DECK + 0.36, -0.45, 1.3, 0.06, 0.95, 0, 0, 0, 1, M)
    this.box(0, DECK + 0.38, -0.45, 1.6, 1.2, 0.4)
    rod(kit, 'darkPlanks', 0, DECK, 6.3, 0, DECK + 0.9, 6.3, 0.38, 10, 1, M, 0.3, true)
    rod(kit, 'darkPlanks', 0, DECK + 0.9, 6.3, 0, DECK + 1.0, 6.3, 0.45, 10, 1, M)
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 4
      beam(kit, 'darkPlanks', -Math.cos(a) * 0.9, DECK + 0.8, 6.3 - Math.sin(a) * 0.9, Math.cos(a) * 0.9, DECK + 0.8, 6.3 + Math.sin(a) * 0.9, 0.07, 0.07, 1, M)
    }
    this.box(0, DECK + 1.0, 6.3, 0.9, 0.9, 1.0)
    const rc = this.world(1.4, DECK, 2.6)
    ropeCoil(kit, rc.x, rc.y, rc.z, 0.36)

    // Anchor cable from the hawse at the bow down to the anchor on the sand.
    const hawse = this.world(-0.7, HULL.depth + 0.4, L / 2 - 1.3).clone()
    const an = this.world(-4.4, 0, L / 2 + 0.6)
    const ring = anchor(kit, an.x, heightAt(an.x, an.z), an.z, WRECK.yaw + 0.9)
    rope(kit, hawse.x, hawse.y, hawse.z, ring.x, ring.y, ring.z, 1.2, 0.05)
  }
}

/** A big iron anchor lying on its side in the sand; returns its ring position. */
function anchor(kit: ZoneKit, x: number, g: number, z: number, yaw: number): THREE.Vector3 {
  const m = frame(x, g + 0.12, z, yaw, 0, Math.PI / 2 - 0.25)
  rod(kit, 'metal', 0, 0, 0, 0, 2.2, 0, 0.09, 8, 1, m)
  for (const s of [-1, 1]) {
    beam(kit, 'metal', 0, 0.05, 0, s * 0.75, 0.55, 0, 0.14, 0.12, 1, m)
    tbox(kit, 'metal', s * 0.82, 0.68, 0, 0.36, 0.3, 0.05, 0, 0, s * 0.6, 1, m)
  }
  beam(kit, 'darkPlanks', 0, 1.95, -1.0, 0, 1.95, 1.0, 0.14, 0.14, 1, m)
  const ring = new THREE.TorusGeometry(0.2, 0.04, 6, 14)
  ring.applyMatrix4(place(0, 2.4, 0, 0, 0, 0, m))
  kit.add(ring, 'metal')
  const mid = new THREE.Vector3(0, 1.0, 0).applyMatrix4(m)
  kit.solidBox(mid.x, g - 0.2, mid.z, 0.9, 0.6, 2.3, yaw + Math.PI / 2, { surface: 'metal' })
  return new THREE.Vector3(0, 2.6, 0).applyMatrix4(m)
}

/** Shore-side clutter (in ship-local XZ), the climbing crates, driftwood and a fallen topmast. */
function scatter(kit: ZoneKit, ship: Ship): void {
  const W = (x: number, z: number): [number, number] => {
    const p = ship.world(x, 0, z)
    return [p.x, p.z]
  }
  // The climbing route: low crate → crate stacks → deck strip on the shore side.
  const zc = 4.3
  const hb = hullHalfBeam(HULL, uAt(zc))
  const deckTop = ship.world((-2 * hullHalfWidthAt(HULL, uAt(zc), DECK)) / 3, DECK, zc).y
  const aTop = deckTop - 0.95
  const [ax, az] = W(-(hb + 0.75), zc)
  crateStack(kit, ax, az, aTop, 1.1, WRECK.yaw + 0.1)
  const [bx, bz] = W(-(hb + 1.95), zc - 0.9)
  if (aTop - 1.1 - heightAt(bx, bz) > 0.45) crateStack(kit, bx, bz, aTop - 1.1, 1.0, WRECK.yaw - 0.25)
  const [qx, qz] = W(-(hb + 1.9), zc + 1.25)
  crateStack(kit, qx, qz, heightAt(qx, qz) + 0.85, 1.05, WRECK.yaw + 0.5)
  const [px, pz] = W(-(hb + 3.0), zc + 1.6)
  barrel(kit, px, heightAt(px, pz) - 0.08, pz, { collide: true })

  // Barrels and crates washed up and half sunk in the sand.
  const yaw = WRECK.yaw
  const lying: Array<[number, number, number]> = [[-5.6, -2.2, 0.3], [-7.0, 1.4, 1.9], [3.9, 7.6, 0.8]]
  for (const [lx, lz, a] of lying) {
    const [x, z] = W(lx, lz)
    barrel(kit, x, heightAt(x, z) - 0.12, z, { pitch: Math.PI / 2, yaw: yaw + a, collide: true })
  }
  const [ux, uz] = W(-4.7, -6.6)
  barrel(kit, ux, heightAt(ux, uz) - 0.3, uz, { roll: 0.25, collide: true })
  const [cx, cz] = W(-5.3, -4.1)
  const cg = heightAt(cx, cz)
  tbox(kit, 'planks', cx, cg + 0.25, cz, 0.9, 0.9, 0.9, yaw + 0.5, 0.2, 0.3, 1)
  kit.solidBox(cx, cg - 0.2, cz, 0.9, 0.85, 0.9, yaw + 0.5, { surface: 'wood' })
  const [dx, dz] = W(-7.6, 6.2)
  crate(kit, dx, heightAt(dx, dz) - 0.2, dz, 0.85, yaw - 0.4)
  for (const [lx, lz] of [[-4.5, 0.4], [-6.3, -3.2]]) {
    const [x, z] = W(lx, lz)
    ropeCoil(kit, x, heightAt(x, z) - 0.02, z, 0.3)
  }

  // Fallen topmast with its tangle of rigging.
  const [t0x, t0z] = W(-6.4, -8.6)
  const [t1x, t1z] = W(-7.9, -2.4)
  const g0 = heightAt(t0x, t0z)
  const g1 = heightAt(t1x, t1z)
  rod(kit, 'darkPlanks', t0x, g0 + 0.12, t0z, t1x, g1 + 0.1, t1z, 0.2, 8, 1, undefined, 0.15, true)
  kit.solidBox((t0x + t1x) / 2, Math.min(g0, g1) - 0.2, (t0z + t1z) / 2, 0.4, 0.55, Math.hypot(t1x - t0x, t1z - t0z), Math.atan2(t1x - t0x, t1z - t0z), { surface: 'wood' })
  const [rx, rz] = W(-6.0, -1.0)
  rope(kit, t1x, g1 + 0.2, t1z, rx, heightAt(rx, rz) + 0.05, rz, 0.1, 0.03)

  // Driftwood.
  const logs: Array<[number, number, number, number]> = [[-9.2, 3.5, 0.6, 3.0], [-3.8, 10.8, 1.3, 2.4], [-8.4, -6.0, -0.4, 2.2]]
  for (const [lx, lz, a, len] of logs) {
    const [x, z] = W(lx, lz)
    const g = heightAt(x, z)
    const ox = Math.sin(yaw + a) * len * 0.5
    const oz = Math.cos(yaw + a) * len * 0.5
    rod(kit, 'bark', x - ox, g + 0.08, z - oz, x + ox, g + 0.14, z + oz, 0.17, 7, 1.5, undefined, 0.12)
  }
}
