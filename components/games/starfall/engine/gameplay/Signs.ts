/**
 * Signs — trail notice boards at SIGNS (+ the Beacon altar's interaction).
 *
 * Each sign is two posts, a framed plank board with its title painted on both
 * faces (one shared canvas atlas) and a little gabled cap. Everything is batched
 * through a ZoneKit, so all nine signs cost a handful of draw calls.
 *
 * Interaction: the nearest sign within 2.4 m, or the altar within 3 m, shows a
 * context prompt (emitted only when it changes); interact opens the sign's
 * dialog or asks the game to activate the Beacon.
 */
import * as THREE from 'three'
import type { Ctx, ISigns } from '../types'
import { SIGNS, TOTAL_SHARDS, type SignDef } from '../world/level'
import { heightAt } from '../world/heightfield'
import { ZoneKit } from '../world/zones/kit'
import { paintSignAtlas } from './parts/signboard'
import { planksImage, supportHeight } from './parts/util'

const SIGN_RANGE = 2.4
const ALTAR_RANGE = 3
const POST_X = 0.68
const BOARD_W = 1.5
const BOARD_H = 0.62
const BOARD_D = 0.07
const BOARD_Y = 1.22
const FACE_W = 1.36
const FACE_H = 0.51

interface Placed {
  def: SignDef
  x: number
  y: number
  z: number
}

export class Signs implements ISigns {
  private kit: ZoneKit | null = null
  private faceMat: THREE.MeshStandardMaterial | null = null
  private atlas: THREE.CanvasTexture | null = null
  private signs: Placed[] = []
  /** What the HUD currently shows (tracked from the bus, whoever emitted it). */
  private shown = ''
  private unsub: (() => void) | null = null

  private readonly m = new THREE.Matrix4()
  private readonly q = new THREE.Quaternion()
  private readonly e = new THREE.Euler(0, 0, 0, 'YXZ')
  private readonly v = new THREE.Vector3()
  private readonly one = new THREE.Vector3(1, 1, 1)

  constructor(private ctx: Ctx) {}

  init(): void {
    const ctx = this.ctx
    const kit = new ZoneKit(ctx, 'signs')
    this.kit = kit

    const { texture, cells } = paintSignAtlas(SIGNS.map(s => s.title), planksImage(ctx), Math.min(8, ctx.renderer.capabilities.getMaxAnisotropy()))
    this.atlas = texture
    this.faceMat = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.82, metalness: 0 })
    this.faceMat.name = 'signs:faces'

    SIGNS.forEach((def, i) => {
      const cs = Math.cos(def.yaw)
      const sn = Math.sin(def.yaw)
      const wx = (lx: number, lz: number) => def.x + lx * cs + lz * sn
      const wz = (lx: number, lz: number) => def.z - lx * sn + lz * cs
      const g = supportHeight(ctx, def.x, def.z, heightAt(def.x, def.z) + 0.3, 0.3)
      this.signs.push({ def, x: def.x, y: g, z: def.z })

      // posts reach into the ground on whichever side is lower
      for (const side of [-1, 1]) {
        const px = wx(POST_X * side, 0)
        const pz = wz(POST_X * side, 0)
        const bottom = Math.min(g, heightAt(px, pz)) - 0.3
        const top = g + 1.78
        kit.box({ x: px, y: bottom, z: pz, w: 0.12, h: top - bottom, d: 0.12, yaw: def.yaw, mat: 'darkPlanks', uvScale: 0.9 })
        const cap = new THREE.ConeGeometry(0.095, 0.1, 4)
        kit.add(cap, 'darkPlanks', this.m.compose(this.v.set(px, top + 0.05, pz), this.q.setFromEuler(this.e.set(0, def.yaw + Math.PI / 4, 0)), this.one))
      }
      // board + cross rail under it
      kit.box({ x: def.x, y: g + BOARD_Y - BOARD_H / 2, z: def.z, w: BOARD_W, h: BOARD_H, d: BOARD_D, yaw: def.yaw, mat: 'planks', uvScale: 0.7 })
      kit.box({ x: def.x, y: g + BOARD_Y - BOARD_H / 2 - 0.12, z: def.z, w: POST_X * 2, h: 0.07, d: 0.06, yaw: def.yaw, mat: 'darkPlanks', uvScale: 0.9 })
      // gabled cap
      for (const side of [-1, 1]) {
        const slab = new THREE.BoxGeometry(BOARD_W + 0.24, 0.035, 0.2)
        const lz = side * 0.085
        this.q.setFromEuler(this.e.set(side * 0.5, def.yaw, 0))
        kit.add(slab, 'darkPlanks', this.m.compose(this.v.set(wx(0, lz), g + BOARD_Y + BOARD_H / 2 + 0.085, wz(0, lz)), this.q, this.one))
      }
      // painted faces, front and back (both read correctly)
      const cell = cells[i]
      for (const side of [1, -1]) {
        const face = new THREE.PlaneGeometry(FACE_W, FACE_H)
        const uv = face.attributes.uv as THREE.BufferAttribute
        for (let k = 0; k < uv.count; k++) uv.setXY(k, cell.u0 + uv.getX(k) * (cell.u1 - cell.u0), cell.v0 + uv.getY(k) * (cell.v1 - cell.v0))
        const lz = side * (BOARD_D / 2 + 0.002)
        this.q.setFromEuler(this.e.set(0, def.yaw + (side > 0 ? 0 : Math.PI), 0))
        kit.add(face, this.faceMat!, this.m.compose(this.v.set(wx(0, lz), g + BOARD_Y, wz(0, lz)), this.q, this.one), { castShadow: false })
      }
      kit.solidBox(def.x, g, def.z, BOARD_W + 0.1, 1.83, 0.22, def.yaw, { surface: 'wood' })
    })
    kit.finalize()

    this.unsub = ctx.bus.on('ui:prompt', p => {
      this.shown = p ? `${p.key}|${p.label}` : ''
    })
  }

  update(): void {
    const ctx = this.ctx
    const game = ctx.game
    const player = ctx.player
    let label = ''
    let sign: SignDef | null = null
    let beacon = false

    if (game.phase === 'playing' && player.state !== 'dead' && !ctx.cutscenes.active) {
      const p = player.position
      let best = SIGN_RANGE * SIGN_RANGE
      for (const s of this.signs) {
        const dx = p.x - s.x
        const dz = p.z - s.z
        const d = dx * dx + dz * dz
        if (d < best && Math.abs(p.y - s.y) < 2.5) {
          best = d
          sign = s.def
        }
      }
      const altar = ctx.zones.beaconAltar
      if (altar.lengthSq() > 0) {
        const dx = p.x - altar.x
        const dz = p.z - altar.z
        const d = dx * dx + dz * dz
        if (d < ALTAR_RANGE * ALTAR_RANGE && d < (sign ? best : Infinity) && Math.abs(p.y - altar.y) < 3) {
          sign = null
          beacon = true
        }
      }
      if (sign) label = 'Read'
      else if (beacon) label = game.shardCount() >= TOTAL_SHARDS && !game.save.completed ? 'Place shards' : 'Inspect'
    }

    const key = ctx.input.device === 'pad' ? 'Y' : ctx.input.device === 'touch' ? 'Tap' : 'E'
    const want = label ? `${key}|${label}` : ''
    if (want !== this.shown) ctx.bus.emit('ui:prompt', label ? { key, label } : null)

    if (label && ctx.input.state.interact) {
      if (sign) void game.showDialog(sign.title, sign.lines)
      else game.tryActivateBeacon()
    }
  }

  dispose(): void {
    this.unsub?.()
    this.unsub = null
    this.kit?.dispose()
    this.kit = null
    this.faceMat?.dispose()
    this.faceMat = null
    this.atlas?.dispose()
    this.atlas = null
  }
}
