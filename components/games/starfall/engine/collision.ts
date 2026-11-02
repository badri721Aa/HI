/**
 * Collision world: the analytic terrain plus simple solids (yaw-rotated boxes
 * and vertical cylinders). Deliberately tiny and allocation-free in hot paths.
 *
 * Conventions
 *  - Box `yaw` matches THREE.Object3D.rotation.y, so a mesh with rotation.y = yaw
 *    and a box collider with the same yaw line up.
 *  - Box (x, y, z) is the CENTRE; cylinder (x, y, z) is the centre of its BOTTOM face.
 *  - Moving colliders (`dynamic: true`) must be updated with `move()` every frame
 *    BEFORE the player updates; the player is carried by their velocity.
 */
import { heightAt, normalAt, waterLevelAt, surfaceAt, type Surface } from './world/heightfield'

export interface Collider {
  id: number
  shape: 'box' | 'cylinder'
  x: number
  y: number
  z: number
  /** Box half-extents. */
  hx: number
  hy: number
  hz: number
  yaw: number
  /** Cylinder radius / height. */
  r: number
  h: number
  surface: Surface
  /** > 0: launch speed (m/s) when the player lands on it. */
  bounce: number
  dynamic: boolean
  /** Velocity during the last move() (m/s) and yaw rate (rad/s) — used to carry the player. */
  vx: number
  vy: number
  vz: number
  vyaw: number
  enabled: boolean
  /** Free-form label for gameplay code (e.g. 'lilypad', 'mushroom'). */
  tag: string
  /** Called by the player controller when it lands on this collider. */
  onLand?: (impact: number) => void
  /** Called every frame the player stands on it. */
  onStand?: (dt: number) => void
  // internals
  _c: number
  _s: number
  _stamp: number
}

export interface BoxOptions {
  x: number
  y: number
  z: number
  hx: number
  hy: number
  hz: number
  yaw?: number
  surface?: Surface
  bounce?: number
  dynamic?: boolean
  tag?: string
  onLand?: (impact: number) => void
  onStand?: (dt: number) => void
}

export interface CylinderOptions {
  x: number
  /** Bottom of the cylinder. */
  y: number
  z: number
  r: number
  h: number
  surface?: Surface
  bounce?: number
  dynamic?: boolean
  tag?: string
  onLand?: (impact: number) => void
  onStand?: (dt: number) => void
}

export interface GroundHit {
  /** Height of the walkable surface. */
  y: number
  nx: number
  ny: number
  nz: number
  surface: Surface
  /** The collider supporting the point, or null for terrain. */
  collider: Collider | null
  /** Water surface height here (sea or lake). */
  water: number
}

export interface WallPush {
  /** Total horizontal push applied. */
  x: number
  z: number
  hit: boolean
  /** Normal of the last wall touched (XZ). */
  nx: number
  nz: number
}

export interface RayHit {
  t: number
  x: number
  y: number
  z: number
  collider: Collider | null
}

const CELL = 16

export class CollisionWorld {
  private statics = new Map<number, Collider[]>()
  private dynamics: Collider[] = []
  private all = new Set<Collider>()
  private nextId = 1
  private stamp = 1
  private scratch: Collider[] = []
  private nrm: [number, number, number] = [0, 1, 0]

  get count(): number {
    return this.all.size
  }

  addBox(o: BoxOptions): Collider {
    const yaw = o.yaw ?? 0
    const c: Collider = {
      id: this.nextId++, shape: 'box', x: o.x, y: o.y, z: o.z, hx: o.hx, hy: o.hy, hz: o.hz, yaw,
      r: Math.hypot(o.hx, o.hz), h: o.hy * 2, surface: o.surface ?? 'stone', bounce: o.bounce ?? 0,
      dynamic: !!o.dynamic, vx: 0, vy: 0, vz: 0, vyaw: 0, enabled: true, tag: o.tag ?? '',
      onLand: o.onLand, onStand: o.onStand, _c: Math.cos(yaw), _s: Math.sin(yaw), _stamp: 0,
    }
    this.insert(c)
    return c
  }

  addCylinder(o: CylinderOptions): Collider {
    const c: Collider = {
      id: this.nextId++, shape: 'cylinder', x: o.x, y: o.y, z: o.z, hx: o.r, hy: o.h / 2, hz: o.r, yaw: 0,
      r: o.r, h: o.h, surface: o.surface ?? 'stone', bounce: o.bounce ?? 0, dynamic: !!o.dynamic,
      vx: 0, vy: 0, vz: 0, vyaw: 0, enabled: true, tag: o.tag ?? '', onLand: o.onLand, onStand: o.onStand,
      _c: 1, _s: 0, _stamp: 0,
    }
    this.insert(c)
    return c
  }

  /** Moves a dynamic collider and records its velocity (dt in seconds). */
  move(c: Collider, x: number, y: number, z: number, yaw = c.yaw, dt = 1 / 60): void {
    const inv = dt > 0 ? 1 / dt : 0
    c.vx = (x - c.x) * inv
    c.vy = (y - c.y) * inv
    c.vz = (z - c.z) * inv
    c.vyaw = (yaw - c.yaw) * inv
    c.x = x
    c.y = y
    c.z = z
    if (yaw !== c.yaw) {
      c.yaw = yaw
      c._c = Math.cos(yaw)
      c._s = Math.sin(yaw)
    }
  }

  remove(c: Collider): void {
    if (!this.all.delete(c)) return
    if (c.dynamic) {
      const i = this.dynamics.indexOf(c)
      if (i >= 0) this.dynamics.splice(i, 1)
      return
    }
    for (const list of this.statics.values()) {
      const i = list.indexOf(c)
      if (i >= 0) list.splice(i, 1)
    }
  }

  clear(): void {
    this.statics.clear()
    this.dynamics.length = 0
    this.all.clear()
  }

  private key(cx: number, cz: number): number {
    return (cx + 512) * 1024 + (cz + 512)
  }

  private insert(c: Collider): void {
    this.all.add(c)
    if (c.dynamic) {
      this.dynamics.push(c)
      return
    }
    const r = c.shape === 'box' ? Math.hypot(c.hx, c.hz) : c.r
    const x0 = Math.floor((c.x - r) / CELL)
    const x1 = Math.floor((c.x + r) / CELL)
    const z0 = Math.floor((c.z - r) / CELL)
    const z1 = Math.floor((c.z + r) / CELL)
    for (let i = x0; i <= x1; i++) {
      for (let j = z0; j <= z1; j++) {
        const k = this.key(i, j)
        let list = this.statics.get(k)
        if (!list) this.statics.set(k, (list = []))
        list.push(c)
      }
    }
  }

  /** Colliders whose cell overlaps the circle. The returned array is reused — copy if you keep it. */
  query(x: number, z: number, radius: number): Collider[] {
    const out = this.scratch
    out.length = 0
    const st = ++this.stamp
    const x0 = Math.floor((x - radius) / CELL)
    const x1 = Math.floor((x + radius) / CELL)
    const z0 = Math.floor((z - radius) / CELL)
    const z1 = Math.floor((z + radius) / CELL)
    for (let i = x0; i <= x1; i++) {
      for (let j = z0; j <= z1; j++) {
        const list = this.statics.get(this.key(i, j))
        if (!list) continue
        for (const c of list) {
          if (c._stamp === st || !c.enabled) continue
          c._stamp = st
          out.push(c)
        }
      }
    }
    for (const c of this.dynamics) if (c.enabled) out.push(c)
    return out
  }

  private lx = 0
  private lz = 0

  /** Point (x, z) to collider-local XZ, written to this.lx / this.lz (no allocation). */
  private local(c: Collider, x: number, z: number): void {
    const dx = x - c.x
    const dz = z - c.z
    // Inverse of three.js Y rotation: local = R(-yaw) * world
    this.lx = dx * c._c - dz * c._s
    this.lz = dx * c._s + dz * c._c
  }

  private top(c: Collider): number {
    return c.shape === 'box' ? c.y + c.hy : c.y + c.h
  }

  private bottom(c: Collider): number {
    return c.shape === 'box' ? c.y - c.hy : c.y
  }

  /** Does a disc of `radius` at (x, z) rest on top of c? (shrunk a bit so edges feel fair) */
  private supports(c: Collider, x: number, z: number, radius: number): boolean {
    const grace = radius * 0.55
    if (c.shape === 'cylinder') {
      return Math.hypot(x - c.x, z - c.z) <= c.r + grace
    }
    this.local(c, x, z)
    return Math.abs(this.lx) <= c.hx + grace && Math.abs(this.lz) <= c.hz + grace
  }

  /**
   * Highest walkable support at (x, z) whose top is at or below `footY + stepUp`.
   * Considers terrain and colliders. Always returns a hit (terrain is everywhere).
   */
  groundAt(x: number, z: number, footY: number, radius: number, stepUp = 0.45, out?: GroundHit): GroundHit {
    const hit = out ?? ({} as GroundHit)
    const th = heightAt(x, z)
    const n = normalAt(x, z, this.nrm)
    hit.y = th
    hit.nx = n[0]
    hit.ny = n[1]
    hit.nz = n[2]
    hit.collider = null
    hit.water = waterLevelAt(x, z)
    hit.surface = surfaceAt(x, z)
    const limit = footY + stepUp
    const list = this.query(x, z, radius + 1)
    for (const c of list) {
      const t = this.top(c)
      if (t > limit || t <= hit.y) continue
      if (!this.supports(c, x, z, radius)) continue
      hit.y = t
      hit.nx = 0
      hit.ny = 1
      hit.nz = 0
      hit.collider = c
      hit.surface = c.surface
    }
    return hit
  }

  /**
   * Pushes a vertical capsule (feet at y, `height` tall) out of solid colliders horizontally.
   * Colliders the player could step onto (top ≤ feet + stepUp) are ignored here.
   * Mutates pos.x / pos.z.
   */
  pushOut(pos: { x: number; y: number; z: number }, radius: number, height: number, stepUp = 0.45, out?: WallPush): WallPush {
    const res = out ?? ({} as WallPush)
    res.x = res.z = res.nx = res.nz = 0
    res.hit = false
    const feet = pos.y + stepUp
    const head = pos.y + height
    const list = this.query(pos.x, pos.z, radius + 2)
    for (let iter = 0; iter < 2; iter++) {
      for (const c of list) {
        if (this.top(c) <= feet || this.bottom(c) >= head) continue
        if (c.shape === 'cylinder') {
          const dx = pos.x - c.x
          const dz = pos.z - c.z
          const d = Math.hypot(dx, dz)
          const min = c.r + radius
          if (d >= min) continue
          const nx = d > 1e-5 ? dx / d : 1
          const nz = d > 1e-5 ? dz / d : 0
          const p = min - d
          pos.x += nx * p
          pos.z += nz * p
          res.x += nx * p
          res.z += nz * p
          res.nx = nx
          res.nz = nz
          res.hit = true
        } else {
          this.local(c, pos.x, pos.z)
          const lx = this.lx
          const lz = this.lz
          const cx = Math.max(-c.hx, Math.min(c.hx, lx))
          const cz = Math.max(-c.hz, Math.min(c.hz, lz))
          const dx = lx - cx
          const dz = lz - cz
          const d = Math.hypot(dx, dz)
          let p: number
          let nlx: number
          let nlz: number
          if (d > 1e-6) {
            if (d >= radius) continue
            nlx = dx / d
            nlz = dz / d
            p = radius - d
          } else {
            // Centre inside the box: leave by the nearest face.
            const px = c.hx - Math.abs(lx)
            const pz = c.hz - Math.abs(lz)
            if (px < pz) {
              nlx = Math.sign(lx) || 1
              nlz = 0
              p = px + radius
            } else {
              nlx = 0
              nlz = Math.sign(lz) || 1
              p = pz + radius
            }
          }
          // local → world (three.js Y rotation)
          const wx = nlx * c._c + nlz * c._s
          const wz = -nlx * c._s + nlz * c._c
          pos.x += wx * p
          pos.z += wz * p
          res.x += wx * p
          res.z += wz * p
          res.nx = wx
          res.nz = wz
          res.hit = true
        }
      }
    }
    return res
  }

  /** Lowest collider underside above the head at (x, z), or Infinity. */
  ceilingAt(x: number, z: number, headY: number, radius: number): number {
    let best = Infinity
    for (const c of this.query(x, z, radius + 1)) {
      const b = this.bottom(c)
      if (b < headY - 0.3 || b >= best) continue
      if (this.top(c) <= headY) continue
      if (!this.supports(c, x, z, radius * 0.5)) continue
      best = b
    }
    return best
  }

  /**
   * Ray against terrain and colliders. Direction need not be normalised;
   * `t` is in units of the direction's length.
   */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number, ignoreTerrain = false): RayHit | null {
    let bestT = maxT
    let bestC: Collider | null = null
    const len = Math.hypot(dx, dz)
    const reach = len * maxT
    const list = this.query(ox + dx * maxT * 0.5, oz + dz * maxT * 0.5, reach * 0.5 + 2)
    for (const c of list) {
      const t = c.shape === 'box' ? this.rayBox(c, ox, oy, oz, dx, dy, dz) : this.rayCyl(c, ox, oy, oz, dx, dy, dz)
      if (t >= 0 && t < bestT) {
        bestT = t
        bestC = c
      }
    }
    if (!ignoreTerrain) {
      const steps = Math.max(8, Math.ceil((Math.hypot(dx, dy, dz) * bestT) / 0.6))
      let prevT = 0
      for (let i = 1; i <= steps; i++) {
        const t = (bestT * i) / steps
        const y = oy + dy * t
        const gy = heightAt(ox + dx * t, oz + dz * t)
        if (y < gy) {
          // refine
          let a = prevT
          let b = t
          for (let k = 0; k < 6; k++) {
            const m = (a + b) * 0.5
            if (oy + dy * m < heightAt(ox + dx * m, oz + dz * m)) b = m
            else a = m
          }
          bestT = a
          bestC = null
          break
        }
        prevT = t
      }
    }
    if (bestT >= maxT) return null
    return { t: bestT, x: ox + dx * bestT, y: oy + dy * bestT, z: oz + dz * bestT, collider: bestC }
  }

  private rayBox(c: Collider, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): number {
    this.local(c, ox, oz)
    const lox = this.lx
    const loz = this.lz
    const ldx = dx * c._c - dz * c._s
    const ldz = dx * c._s + dz * c._c
    const loy = oy - c.y
    let tmin = -Infinity
    let tmax = Infinity
    const slab = (o: number, d: number, h: number) => {
      if (Math.abs(d) < 1e-9) return o >= -h && o <= h
      let t1 = (-h - o) / d
      let t2 = (h - o) / d
      if (t1 > t2) [t1, t2] = [t2, t1]
      tmin = Math.max(tmin, t1)
      tmax = Math.min(tmax, t2)
      return tmin <= tmax
    }
    if (!slab(lox, ldx, c.hx) || !slab(loy, dy, c.hy) || !slab(loz, ldz, c.hz)) return -1
    if (tmax < 0) return -1
    return tmin >= 0 ? tmin : -1
  }

  private rayCyl(c: Collider, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): number {
    const fx = ox - c.x
    const fz = oz - c.z
    const a = dx * dx + dz * dz
    const b = 2 * (fx * dx + fz * dz)
    const cc = fx * fx + fz * fz - c.r * c.r
    if (a < 1e-9) return -1
    const disc = b * b - 4 * a * cc
    if (disc < 0) return -1
    const sq = Math.sqrt(disc)
    const t = (-b - sq) / (2 * a)
    if (t < 0) return -1
    const y = oy + dy * t
    if (y < c.y || y > c.y + c.h) return -1
    return t
  }
}
