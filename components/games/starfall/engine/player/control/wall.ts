/**
 * Feeling for a wall beside the hero (wall-running).
 *
 * A wall is whatever two horizontal feelers, at shin and shoulder height, both reach: the side of a
 * static collider, or terrain steep enough to be a cliff face. A low ledge fails the upper feeler,
 * a walkable slope fails the steepness test, and a post or a trunk fails a third feeler cast a
 * step further along (a wall goes on). Allocation-free.
 */
import type { Collider, CollisionWorld, RayHit } from '../../collision'
import { normalAt, surfaceAt, type Surface } from '../../world/heightfield'
import { MOVE as M, WALLRUN as W } from './tuning'

export interface WallContact {
  /** Unit normal in the ground plane, pointing from the wall to the hero. */
  nx: number
  nz: number
  /** Distance from the capsule's axis to the wall at shin height, measured along the normal (m). */
  dist: number
  /** How far the face leans back per metre of height (0 = vertical; cliffs lean). */
  lean: number
  surface: Surface
}

export function makeWallContact(): WallContact {
  return { nx: 0, nz: 1, dist: 0, lean: 0, surface: 'stone' }
}

function copyContact(out: WallContact, c: WallContact): void {
  out.nx = c.nx
  out.nz = c.nz
  out.dist = c.dist
  out.lean = c.lean
  out.surface = c.surface
}

/** Outward normal (XZ) of a collider's side at a point on it. */
function sideNormal(c: Collider, x: number, z: number, out: WallContact): void {
  const dx = x - c.x
  const dz = z - c.z
  if (c.shape === 'cylinder') {
    const l = Math.hypot(dx, dz) || 1
    out.nx = dx / l
    out.nz = dz / l
    return
  }
  // Into the box's own frame (the inverse of a three.js Y rotation), where the face is the axis the point is furthest out on.
  const cs = Math.cos(c.yaw)
  const sn = Math.sin(c.yaw)
  const lx = dx * cs - dz * sn
  const lz = dx * sn + dz * cs
  const onX = Math.abs(lx) * c.hz > Math.abs(lz) * c.hx
  const nlx = onX ? Math.sign(lx) || 1 : 0
  const nlz = onX ? 0 : Math.sign(lz) || 1
  out.nx = nlx * cs + nlz * sn
  out.nz = -nlx * sn + nlz * cs
}

export class WallSensor {
  private readonly ray = {} as RayHit
  private readonly nrm: [number, number, number] = [0, 1, 0]
  private readonly upper = makeWallContact()
  private readonly ahead = makeWallContact()
  private readonly side = makeWallContact()

  constructor(private col: CollisionWorld) {}

  /** One feeler from (ox, oy, oz) along the unit direction (dx, dz): a wall face within `reach`? */
  private cast(ox: number, oy: number, oz: number, dx: number, dz: number, reach: number, out: WallContact): boolean {
    const hit = this.col.raycast(ox, oy, oz, dx, 0, dz, reach, false, this.ray)
    if (!hit) return false
    const c = hit.collider
    if (c) {
      // Movers, enemies, posts and trunks are not walls.
      if (c.dynamic || (c.shape === 'cylinder' && c.r < W.minRadius)) return false
      sideNormal(c, hit.x, hit.z, out)
      out.lean = 0
      out.surface = c.surface
    } else {
      const n = normalAt(hit.x, hit.z, this.nrm)
      if (n[1] > W.maxNy) return false
      const hl = Math.hypot(n[0], n[2])
      out.nx = n[0] / hl
      out.nz = n[2] / hl
      out.lean = n[1] / hl
      out.surface = surfaceAt(hit.x, hit.z)
    }
    // It must face the feeler; the distance is taken square to the face.
    const facing = -(dx * out.nx + dz * out.nz)
    if (facing < 0.3) return false
    out.dist = hit.t * facing
    return true
  }

  /**
   * Is there a wall within `reach` of the capsule standing at (x, y, z), along the unit direction
   * (dx, dz)? Both feelers must find one; the contact at shin height is written to `out`.
   */
  feel(x: number, y: number, z: number, dx: number, dz: number, reach: number, out: WallContact): boolean {
    if (!this.cast(x, y + W.feelLow, z, dx, dz, reach, out)) return false
    const facing = -(dx * out.nx + dz * out.nz)
    // A leaning face is further away at shoulder height.
    const further = (out.dist + out.lean * (W.feelHigh - W.feelLow)) / facing + 0.15
    const up = this.upper
    return this.cast(x, y + W.feelHigh, z, dx, dz, further, up) && up.nx * out.nx + up.nz * out.nz > 0.5
  }

  /**
   * The wall the hero is brushing as he heads along the unit direction (hx, hz): beside him, within
   * reach, tall enough and going on ahead. The nearer of the two sides wins.
   */
  find(x: number, y: number, z: number, hx: number, hz: number, out: WallContact): boolean {
    const reach = M.radius + W.reach
    const c = this.side
    let found = false
    for (let s = -1; s <= 1; s += 2) {
      // Sideways of the heading first, which finds any wall he is skimming…
      if (!this.feel(x, y, z, -hz * s, hx * s, reach, c)) continue
      // …then squarely at it for the true distance, and a step along it to see that it goes on.
      if (!this.feel(x, y, z, -c.nx, -c.nz, reach, c)) continue
      const nx = c.nx
      const nz = c.nz
      const along = -nz * hx + nx * hz >= 0 ? 1 : -1
      const ax = x - nz * along * W.ahead
      const az = z + nx * along * W.ahead
      if (!this.feel(ax, y, az, -nx, -nz, reach + 0.3, this.ahead)) continue
      if (found && c.dist >= out.dist) continue
      copyContact(out, c)
      found = true
    }
    return found
  }
}
