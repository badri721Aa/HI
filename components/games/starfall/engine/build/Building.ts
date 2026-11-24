/**
 * Block building on a 1 m grid, in story and Creative games alike.
 *
 *  - Build mode (B): the camera eases over the shoulder and a ghost shows where the block in
 *    hand goes — on the face under the crosshair, within reach of the hero. The attack button
 *    places, the dash button breaks (own blocks only, never the island's props), the wheel and
 *    1–9 / 0 pick the block, R turns stairs.
 *  - Every block is a box collider (stairs: one per step) and an instance in BlockMeshes.
 *  - Our blocks are saved per save slot (compact base64) a moment after each change.
 *  - Online, edits go out over the room channel (batched, a few messages a second) and each new
 *    player gets our whole list once, in parts. Other players' blocks render and collide too and
 *    stay until we leave the room.
 *  - Lamps glow; two real point lights follow the nearest ones (the light count never changes,
 *    so nothing recompiles).
 */
import * as THREE from 'three'
import type { Collider, RayHit } from '../collision'
import { loadBlockData, storeBlockData } from '../save'
import type { Ctx, IBuilding } from '../types'
import { smoothstep } from '../world/heightfield'
import { damp } from '../player/control/math'
import { BlockMeshes, STAIR_STEPS, type Placed } from './BlockMeshes'
import {
  BLOCK_COUNT, BLOCK_LIMIT, BLOCKS, BLOCKS_PER_MSG, BUILD_REACH, LAMP_TYPE, blockCode, cellKey, codeRot, codeType, decodeBlocks,
  encodeBlocks, inGrid, type BlockMsg,
} from './blocks'

interface Block extends Placed {
  key: number
  /** '' = ours, otherwise the peer id that placed it. */
  owner: string
  colliders: Collider[]
}

interface Outgoing extends BlockMsg {
  to?: string
}

interface LampLight {
  light: THREE.PointLight
  lamp: Block | null
  level: number
}

const HALF_PI = Math.PI / 2
const SELF = ''
/** Seconds after the last change before the blocks are written to storage. */
const SAVE_DELAY = 2
/** One room message per this many seconds (edits made meanwhile are batched into it). */
const SEND_INTERVAL = 0.25
/** New players arriving within this window get one combined list. */
const LIST_DELAY = 1.2
/** Other players whose blocks we keep at most. */
const MAX_OWNERS = 16
const LAMP_LIGHTS = 2
const LAMP_INTENSITY = 6
const LAMP_RANGE = 11
const LAMP_NEAR = 18
const LAMP_FAR = 28
const GHOST_OK = new THREE.Color('#F5B455')
const GHOST_BAD = new THREE.Color('#ff5a4a')

export class Building implements IBuilding {
  private meshes: BlockMeshes | null = null
  private cells = new Map<number, Block>()
  private owners = new Map<string, Set<Block>>([[SELF, new Set()]])
  private lamps = new Set<Block>()
  private _active = false
  private slot = 0
  /** Extra quarter turns for stairs (R). */
  private turn = 0
  private dirty = false
  private saveT = 0
  /** What the HUD last showed (slot, count; slot -1 = not building). */
  private hudSlot = -2
  private hudCount = -1

  // aim
  private placeOk = false
  private placeShown = false
  private readonly target = new THREE.Vector3()
  private targetBlock: Block | null = null
  private readonly dir = new THREE.Vector3()
  private readonly head = new THREE.Vector3()
  private ghost: THREE.Mesh | null = null
  private ghostEdges: THREE.LineSegments | null = null
  private breakBox: THREE.LineSegments | null = null
  private edgeGeos: THREE.BufferGeometry[] = []
  private ghostMats: THREE.Material[] = []

  private lights: LampLight[] = []
  private lampT = 0
  private readonly nearLamps: Block[] = []
  private readonly nearD2: number[] = []

  // network
  private outbox: Outgoing[] = []
  /** Real-clock time the next message may go out. */
  private sendAt = 0
  private listTo = new Set<string>()
  private listAt = 0
  private unsubs: Array<() => void> = []

  constructor(private ctx: Ctx) {}

  get active(): boolean {
    return this._active
  }

  get count(): number {
    return this.owners.get(SELF)!.size
  }

  /* ── lifecycle ───────────────────────────────────────────── */

  init(): void {
    const ctx = this.ctx
    this.meshes = new BlockMeshes(ctx.scene, ctx.textures)

    const fill = new THREE.MeshBasicMaterial({ color: GHOST_OK, transparent: true, opacity: 0.22, depthWrite: false })
    const line = new THREE.LineBasicMaterial({ color: GHOST_OK, transparent: true, opacity: 0.9, depthWrite: false })
    const outline = new THREE.LineBasicMaterial({ color: '#fff4e0', transparent: true, opacity: 0.75, depthWrite: false })
    this.ghostMats.push(fill, line, outline)
    const box = new THREE.BoxGeometry(1, 1, 1)
    const cubeEdges = new THREE.EdgesGeometry(box)
    box.dispose()
    const stairEdges = new THREE.EdgesGeometry(this.meshes.geometry(BLOCKS.findIndex(b => b.shape === 'stairs')))
    this.edgeGeos.push(cubeEdges, stairEdges)
    this.ghost = new THREE.Mesh(this.meshes.geometry(0), fill)
    this.ghostEdges = new THREE.LineSegments(cubeEdges, line)
    this.ghost.add(this.ghostEdges)
    this.breakBox = new THREE.LineSegments(cubeEdges, outline)
    this.breakBox.scale.setScalar(1.025)
    // Left visible (far below the world) until the first frame so the shader warm-up compiles them.
    for (const o of [this.ghost, this.breakBox]) {
      o.position.y = -1e4
      o.renderOrder = 3
      o.frustumCulled = false
      ctx.scene.add(o)
    }

    for (let i = 0; i < LAMP_LIGHTS; i++) {
      const light = new THREE.PointLight('#ffb35c', 0, LAMP_RANGE, 2)
      ctx.scene.add(light)
      this.lights.push({ light, lamp: null, level: 0 })
    }

    const bus = ctx.bus
    this.unsubs.push(
      bus.on('net:peer', e => {
        if (!e.joined) return
        this.listTo.add(e.id)
        this.listAt = ctx.clock.real + LIST_DELAY
      }),
      bus.on('net:room', e => {
        if (!e) this.dropRemote()
      }),
      bus.on('net:blocks', e => this.applyRemote(e.id, e)),
      bus.on('ui:phase', e => {
        if (e.phase === 'title') this.setActive(false)
      }),
    )
  }

  dispose(): void {
    for (const u of this.unsubs) u()
    this.unsubs = []
    for (const b of [...this.cells.values()]) this.removeBlock(b)
    this.meshes?.dispose()
    this.meshes = null
    for (const o of [this.ghost, this.breakBox, ...this.lights.map(l => l.light)]) o?.removeFromParent()
    this.lights = []
    for (const g of this.edgeGeos) g.dispose()
    for (const m of this.ghostMats) m.dispose()
    this.ctx.input.buildMode = false
  }

  /* ── API ─────────────────────────────────────────────────── */

  setActive(on: boolean): void {
    if (on === this._active) return
    this._active = on
    this.ctx.input.buildMode = on
    if (!on) this.hideAim()
    this.syncHud()
  }

  select(slot: number): void {
    if (!(slot >= 0 && slot < BLOCK_COUNT)) return
    this.slot = slot
    this.syncHud()
  }

  syncWithSave(): void {
    for (const b of [...this.owners.get(SELF)!]) this.removeBlock(b)
    const cells = decodeBlocks(loadBlockData(this.ctx.game.save.mode))
    for (let i = 0; i < cells.length; i += 4) this.placeAt(cells[i], cells[i + 1], cells[i + 2], codeType(cells[i + 3]), codeRot(cells[i + 3]), SELF)
    this.dirty = false
    // Online: the others drop what we had and get the new list.
    if (this.ctx.net.room) {
      this.outbox.length = 0
      this.outbox.push({ op: 'clear', cells: [] })
      this.queueList(undefined)
    }
    this.syncHud()
  }

  flush(): void {
    if (!this.dirty) return
    this.dirty = false
    storeBlockData(this.ctx.game.save.mode, encodeBlocks(this.ownCells()))
  }

  /** Puts a block in an empty cell for `owner` ('' = us). Returns null if the cell is taken or a limit is hit. */
  placeAt(x: number, y: number, z: number, type: number, rot: number, owner = SELF): Block | null {
    if (!inGrid(x, y, z) || !(type >= 0 && type < BLOCK_COUNT) || !this.meshes) return null
    const key = cellKey(x, y, z)
    if (this.cells.has(key)) return null
    let mine = this.owners.get(owner)
    if (!mine) {
      if (this.owners.size > MAX_OWNERS) return null
      this.owners.set(owner, (mine = new Set()))
    }
    if (mine.size >= BLOCK_LIMIT) return null
    const b: Block = { key, x, y, z, type, rot: rot & 3, owner, colliders: [], batch: null, slot: 0 }
    this.addColliders(b)
    this.meshes.add(b)
    this.cells.set(key, b)
    mine.add(b)
    if (type === LAMP_TYPE) this.lamps.add(b)
    return b
  }

  /** Removes the block in a cell if `owner` placed it. */
  removeAt(x: number, y: number, z: number, owner = SELF): boolean {
    const b = this.cells.get(cellKey(x, y, z))
    if (!b || b.owner !== owner) return false
    this.removeBlock(b)
    return true
  }

  /* ── frame ───────────────────────────────────────────────── */

  update(dt: number): void {
    if (!this.meshes) return
    const ctx = this.ctx
    const s = ctx.input.state
    const playing = ctx.game.phase === 'playing'
    if (playing && s.build && !ctx.worlds.travelling) this.setActive(!this._active)

    if (this._active && playing && ctx.player.controlEnabled && !ctx.character.ragdolling) {
      if (s.slot >= 0) this.select(s.slot)
      else if (s.cycle) this.select((this.slot + s.cycle + BLOCK_COUNT) % BLOCK_COUNT)
      if (s.rotate) this.turn = (this.turn + 1) & 3
      this.updateAim()
      if (s.place) this.tryPlace()
      if (s.remove) this.tryBreak()
      this.syncHud()
    } else {
      this.hideAim()
    }

    this.meshes.update()
    this.updateLamps(dt)
    this.updateNet()
    if (this.dirty) {
      this.saveT -= dt
      if (this.saveT <= 0) this.flush()
    }
  }

  /* ── aiming, placing, breaking ───────────────────────────── */

  /** Casts from the camera through the crosshair; fills target / targetBlock / placeOk and moves the ghost. */
  private updateAim(): void {
    const ctx = this.ctx
    const cam = ctx.camera
    const p = ctx.player.position
    const head = this.head.set(p.x, p.y + 1.4, p.z)
    const dir = cam.getWorldDirection(this.dir)
    const maxT = cam.position.distanceTo(head) + BUILD_REACH + 1
    const hit = ctx.collision.raycast(cam.position.x, cam.position.y, cam.position.z, dir.x, dir.y, dir.z, maxT)
    this.targetBlock = null
    this.placeShown = false
    if (hit && Math.hypot(hit.x - head.x, hit.y - head.y, hit.z - head.z) <= BUILD_REACH) {
      const c = hit.collider
      const blk = c && c.tag === 'block' ? this.cells.get(cellKey(Math.floor(c.x), Math.floor(c.y), Math.floor(c.z))) : undefined
      if (c && blk) {
        this.targetBlock = blk
        this.faceStep(c, hit, blk)
      } else {
        // Terrain and props: the cell just in front of the hit (a little up on terrain, so blocks sit into slopes).
        const lift = c ? 0 : 0.2
        this.target.set(Math.floor(hit.x - dir.x * 0.05), Math.floor(hit.y - dir.y * 0.05 + lift), Math.floor(hit.z - dir.z * 0.05))
      }
      this.placeShown = true
    }
    this.placeOk = this.placeShown && this.canPlace(this.target.x, this.target.y, this.target.z)
    this.showAim()
  }

  /** target = the cell beside `blk` across the face the ray hit (read from the hit collider's box). */
  private faceStep(c: Collider, hit: RayHit, blk: Block): void {
    const cs = Math.cos(c.yaw)
    const sn = Math.sin(c.yaw)
    const dx = hit.x - c.x
    const dy = hit.y - c.y
    const dz = hit.z - c.z
    const lx = dx * cs - dz * sn
    const lz = dx * sn + dz * cs
    const rx = Math.abs(lx) / c.hx
    const ry = Math.abs(dy) / c.hy
    const rz = Math.abs(lz) / c.hz
    let nx = 0
    let ny = 0
    let nz = 0
    if (ry >= rx && ry >= rz) ny = Math.sign(dy)
    else if (rx >= rz) {
      nx = Math.round(Math.sign(lx) * cs)
      nz = Math.round(-Math.sign(lx) * sn)
    } else {
      nx = Math.round(Math.sign(lz) * sn)
      nz = Math.round(Math.sign(lz) * cs)
    }
    this.target.set(blk.x + nx, blk.y + ny, blk.z + nz)
  }

  private canPlace(x: number, y: number, z: number): boolean {
    if (!inGrid(x, y, z) || this.cells.has(cellKey(x, y, z)) || this.count >= BLOCK_LIMIT) return false
    const pl = this.ctx.player
    const p = pl.position
    const r = pl.radius - 0.02
    const overlapsHero = x < p.x + r && x + 1 > p.x - r && z < p.z + r && z + 1 > p.z - r && y < p.y + pl.height - 0.02 && y + 1 > p.y + 0.02
    if (overlapsHero) return false
    const h = this.head
    return Math.hypot(x + 0.5 - h.x, y + 0.5 - h.y, z + 0.5 - h.z) <= BUILD_REACH + 0.9
  }

  private tryPlace(): void {
    if (!this.placeOk) {
      if (this.placeShown && this.count >= BLOCK_LIMIT) {
        this.ctx.bus.emit('ui:toast', { kind: 'warning', title: 'Block limit reached', body: `${BLOCK_LIMIT} blocks — break some to build more` })
      }
      return
    }
    const { x, y, z } = this.target
    const b = this.placeAt(x, y, z, this.slot, this.stairRot(), SELF)
    if (!b) return
    this.changed()
    this.send('add', b)
    const pos = { x: x + 0.5, y: y + 0.5, z: z + 0.5 }
    this.ctx.bus.emit('block:place', { pos, surface: BLOCKS[b.type].surface })
    this.ctx.fx.burst('dust', pos, { count: 8, scale: 0.7 })
    this.updateAim()
  }

  private tryBreak(): void {
    const b = this.targetBlock
    if (!b || b.owner !== SELF) return
    const pos = { x: b.x + 0.5, y: b.y + 0.5, z: b.z + 0.5 }
    this.send('del', b)
    this.removeBlock(b)
    this.changed()
    this.ctx.bus.emit('block:break', { pos, surface: BLOCKS[b.type].surface })
    this.ctx.fx.burst('poof', pos, { count: 12, scale: 0.8 })
    this.updateAim()
  }

  /** Stairs climb away from the camera, plus the player's extra turns. */
  private stairRot(): number {
    return (Math.round((this.ctx.cameraRig.yaw + Math.PI) / HALF_PI) + this.turn) & 3
  }

  private showAim(): void {
    const ghost = this.ghost!
    const brk = this.breakBox!
    const def = BLOCKS[this.slot]
    ghost.visible = this.placeShown
    if (this.placeShown) {
      const t = this.target
      ghost.geometry = this.meshes!.geometry(this.slot)
      this.ghostEdges!.geometry = this.edgeGeos[def.shape === 'stairs' ? 1 : 0]
      ghost.position.set(t.x + 0.5, t.y + 0.5, t.z + 0.5)
      ghost.rotation.y = def.shape === 'stairs' ? this.stairRot() * HALF_PI : 0
      const color = this.placeOk ? GHOST_OK : GHOST_BAD
      ;(ghost.material as THREE.MeshBasicMaterial).color.copy(color)
      ;(this.ghostEdges!.material as THREE.LineBasicMaterial).color.copy(color)
    }
    const b = this.targetBlock
    brk.visible = !!b && b.owner === SELF
    if (b) brk.position.set(b.x + 0.5, b.y + 0.5, b.z + 0.5)
  }

  private hideAim(): void {
    this.placeShown = this.placeOk = false
    this.targetBlock = null
    if (this.ghost) this.ghost.visible = false
    if (this.breakBox) this.breakBox.visible = false
  }

  /* ── blocks ──────────────────────────────────────────────── */

  private addColliders(b: Block): void {
    const def = BLOCKS[b.type]
    const col = this.ctx.collision
    const cx = b.x + 0.5
    const cz = b.z + 0.5
    if (def.shape === 'cube') {
      b.colliders.push(col.addBox({ x: cx, y: b.y + 0.5, z: cz, hx: 0.5, hy: 0.5, hz: 0.5, surface: def.surface, bounce: def.bounce, tag: 'block' }))
      return
    }
    // One box per step, each from the floor up, in the block's turned frame.
    const yaw = b.rot * HALF_PI
    const sn = Math.sin(yaw)
    const cs = Math.cos(yaw)
    const d = 1 / STAIR_STEPS
    for (let j = 0; j < STAIR_STEPS; j++) {
      const h = (j + 1) * d
      const lz = 0.5 - d * (j + 0.5)
      b.colliders.push(col.addBox({ x: cx + lz * sn, y: b.y + h / 2, z: cz + lz * cs, hx: 0.5, hy: h / 2, hz: d / 2, yaw, surface: def.surface, tag: 'block' }))
    }
  }

  private removeBlock(b: Block): void {
    for (const c of b.colliders) {
      // Anything still holding it (the hero standing on it) lets go.
      c.enabled = false
      this.ctx.collision.remove(c)
    }
    b.colliders.length = 0
    this.meshes?.remove(b)
    this.cells.delete(b.key)
    this.lamps.delete(b)
    const set = this.owners.get(b.owner)
    set?.delete(b)
    if (set && !set.size && b.owner !== SELF) this.owners.delete(b.owner)
  }

  private changed(): void {
    this.dirty = true
    this.saveT = SAVE_DELAY
    this.syncHud()
  }

  /** Our blocks as flat [x, y, z, code, …]. */
  private ownCells(): number[] {
    const out: number[] = []
    for (const b of this.owners.get(SELF)!) out.push(b.x, b.y, b.z, blockCode(b.type, b.rot))
    return out
  }

  private syncHud(): void {
    const count = this.count
    const slot = this._active ? this.slot : -1
    if (slot === this.hudSlot && count === this.hudCount) return
    this.hudSlot = slot
    this.hudCount = count
    this.ctx.hud.set({ build: this._active ? { slot, count, max: BLOCK_LIMIT } : null })
  }

  /* ── lamps ───────────────────────────────────────────────── */

  private updateLamps(dt: number): void {
    this.lampT -= dt
    if (this.lampT <= 0) {
      this.lampT = 0.25
      this.assignLamps()
    }
    const p = this.ctx.player.position
    for (const l of this.lights) {
      let target = 0
      if (l.lamp) {
        const d = Math.hypot(l.lamp.x + 0.5 - p.x, l.lamp.y + 0.5 - p.y, l.lamp.z + 0.5 - p.z)
        target = LAMP_INTENSITY * (1 - smoothstep(LAMP_NEAR, LAMP_FAR, d))
      }
      l.level = damp(l.level, target, 5, dt)
      l.light.intensity = l.level < 0.01 ? 0 : l.level
    }
  }

  /** Hands the real lights to the nearest lamps; a light lets go (fades) before it moves. */
  private assignLamps(): void {
    const p = this.ctx.player.position
    const near = this.nearLamps
    const d2 = this.nearD2
    near.length = d2.length = 0
    // The few nearest lamps in range, kept sorted by insertion.
    for (const b of this.lamps) {
      const d = (b.x + 0.5 - p.x) ** 2 + (b.y + 0.5 - p.y) ** 2 + (b.z + 0.5 - p.z) ** 2
      if (d > LAMP_FAR * LAMP_FAR || (near.length === LAMP_LIGHTS && d >= d2[LAMP_LIGHTS - 1])) continue
      let i = Math.min(near.length, LAMP_LIGHTS - 1)
      while (i > 0 && d2[i - 1] > d) {
        near[i] = near[i - 1]
        d2[i] = d2[i - 1]
        i--
      }
      near[i] = b
      d2[i] = d
    }
    for (const l of this.lights) if (l.lamp && !near.includes(l.lamp)) l.lamp = null
    for (const b of near) {
      let lit = false
      let free: LampLight | null = null
      for (const l of this.lights) {
        if (l.lamp === b) lit = true
        else if (!l.lamp && l.level < 0.05) free = l
      }
      if (lit || !free) continue
      free.lamp = b
      free.light.position.set(b.x + 0.5, b.y + 0.5, b.z + 0.5)
    }
  }

  /* ── network ─────────────────────────────────────────────── */

  /** Queues one edit, merged into the last unsent message when it can be. */
  private send(op: 'add' | 'del', b: Block): void {
    if (!this.ctx.net.room) return
    const stride = op === 'add' ? 4 : 3
    let msg = this.outbox[this.outbox.length - 1]
    if (!msg || msg.op !== op || msg.to !== undefined || msg.cells.length >= BLOCKS_PER_MSG * stride) {
      msg = { op, cells: [] }
      this.outbox.push(msg)
    }
    if (op === 'add') msg.cells.push(b.x, b.y, b.z, blockCode(b.type, b.rot))
    else msg.cells.push(b.x, b.y, b.z)
  }

  /** Our whole list, in parts, for one player (`to`) or everybody. */
  private queueList(to: string | undefined): void {
    const cells = this.ownCells()
    for (let i = 0; i < cells.length; i += BLOCKS_PER_MSG * 4) {
      this.outbox.push({ op: 'add', cells: cells.slice(i, i + BLOCKS_PER_MSG * 4), to })
    }
  }

  private updateNet(): void {
    const net = this.ctx.net
    const now = this.ctx.clock.real
    if (!net.room) {
      this.outbox.length = 0
      this.listTo.clear()
      return
    }
    if (this.listTo.size && now >= this.listAt) {
      const [first] = this.listTo
      this.queueList(this.listTo.size === 1 ? first : undefined)
      this.listTo.clear()
    }
    if (now < this.sendAt || !this.outbox.length) return
    // Not connected right now (reconnecting): keep the message for the next try.
    if (!net.sendBlocks(this.outbox[0], this.outbox[0].to)) return
    this.outbox.shift()
    this.sendAt = now + SEND_INTERVAL
  }

  /** A validated edit from another player. */
  private applyRemote(id: string, msg: BlockMsg): void {
    if (!id || id === this.ctx.net.selfId) return
    const c = msg.cells
    if (msg.op === 'clear') {
      for (const b of [...(this.owners.get(id) ?? [])]) this.removeBlock(b)
    } else if (msg.op === 'add') {
      for (let i = 0; i < c.length; i += 4) this.placeAt(c[i], c[i + 1], c[i + 2], codeType(c[i + 3]), codeRot(c[i + 3]), id)
    } else {
      for (let i = 0; i < c.length; i += 3) this.removeAt(c[i], c[i + 1], c[i + 2], id)
    }
  }

  /** Left the room: everybody else's blocks go. */
  private dropRemote(): void {
    for (const [owner, set] of this.owners) {
      if (owner === SELF) continue
      for (const b of [...set]) this.removeBlock(b)
    }
  }
}
