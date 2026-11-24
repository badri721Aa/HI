/**
 * The building blocks: their look, feel and the compact encodings used for saving and
 * for the room channel. No three.js here, so the HUD and the network can share it.
 *
 * Blocks sit on a 1 m grid: cell (x, y, z) spans [x, x+1) × [y, y+1) × [z, z+1).
 * A block's `code` packs its type (low 4 bits) and its quarter-turn rotation (next 2 bits).
 */
import type { TexName } from '../textures'
import type { Surface } from '../world/heightfield'

export interface BlockDef {
  name: string
  surface: Surface
  /** Full cube, or four quarter-height steps rising toward the block's local -Z. */
  shape: 'cube' | 'stairs'
  /** Textures for the faces (and the HUD icon). */
  top: TexName
  side: TexName
  /** Multiplies the textures (CSS colour). */
  tint: string
  /** Launch speed (m/s) when landed on. */
  bounce?: number
  /** Special materials. */
  look?: 'glass' | 'lamp' | 'grass' | 'bouncy'
}

/** Hotbar order: keys 1–9 and 0 pick the first ten, the wheel reaches them all. */
export const BLOCKS: readonly BlockDef[] = [
  { name: 'Grass', surface: 'grass', shape: 'cube', top: 'grass_albedo', side: 'dirt_albedo', tint: '#ffffff', look: 'grass' },
  { name: 'Dirt', surface: 'dirt', shape: 'cube', top: 'dirt_albedo', side: 'dirt_albedo', tint: '#ffffff' },
  { name: 'Sand', surface: 'sand', shape: 'cube', top: 'sand_albedo', side: 'sand_albedo', tint: '#ffffff' },
  { name: 'Stone', surface: 'rock', shape: 'cube', top: 'rock_albedo', side: 'rock_albedo', tint: '#ffffff' },
  { name: 'Brick', surface: 'stone', shape: 'cube', top: 'stone_albedo', side: 'stone_albedo', tint: '#e8c4a8' },
  { name: 'Wood planks', surface: 'wood', shape: 'cube', top: 'planks_albedo', side: 'planks_albedo', tint: '#ffffff' },
  { name: 'Glass', surface: 'ice', shape: 'cube', top: 'plaster_albedo', side: 'plaster_albedo', tint: '#cfe6ee', look: 'glass' },
  { name: 'Roof tiles', surface: 'stone', shape: 'cube', top: 'roof_albedo', side: 'roof_albedo', tint: '#ffffff' },
  { name: 'Lamp', surface: 'stone', shape: 'cube', top: 'stone_albedo', side: 'stone_albedo', tint: '#ffffff', look: 'lamp' },
  { name: 'Bounce pad', surface: 'leaves', shape: 'cube', top: 'cloth_albedo', side: 'cloth_albedo', tint: '#e0705a', bounce: 14, look: 'bouncy' },
  { name: 'Stairs', surface: 'wood', shape: 'stairs', top: 'planks_albedo', side: 'planks_albedo', tint: '#ffffff' },
]

export const BLOCK_COUNT = BLOCKS.length
export const LAMP_TYPE = BLOCKS.findIndex(b => b.look === 'lamp')

/** Most blocks one player may have placed. */
export const BLOCK_LIMIT = 3000
/** How far from the hero's head blocks can be placed and broken (m). */
export const BUILD_REACH = 8

/** Grid limits: the island and both portal maps (±2400 m), sea floor to well above the peaks. */
export const GRID_XZ = 4000
export const GRID_Y_LO = -64
export const GRID_Y_HI = 400

export function inGrid(x: number, y: number, z: number): boolean {
  return (
    Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(z) &&
    x >= -GRID_XZ && x < GRID_XZ && z >= -GRID_XZ && z < GRID_XZ && y >= GRID_Y_LO && y < GRID_Y_HI
  )
}

/** Unique number for a grid cell (exact in a double: 13 + 13 + 10 bits). */
export function cellKey(x: number, y: number, z: number): number {
  return ((x + 4096) * 8192 + (z + 4096)) * 1024 + (y + 512)
}

export const blockCode = (type: number, rot: number): number => (type & 15) | ((rot & 3) << 4)
export const codeType = (code: number): number => code & 15
export const codeRot = (code: number): number => (code >> 4) & 3

export function validCode(code: unknown): code is number {
  return Number.isInteger(code) && (code as number) >= 0 && (code as number) < 64 && codeType(code as number) < BLOCK_COUNT
}

/* ── save encoding: 7 bytes per block (i16 x, y, z · u8 code), base64 ─────────── */

const STRIDE = 7

/** `cells` is flat [x, y, z, code, …]. */
export function encodeBlocks(cells: readonly number[]): string {
  const n = Math.floor(cells.length / 4)
  const view = new DataView(new ArrayBuffer(n * STRIDE))
  for (let i = 0; i < n; i++) {
    const o = i * STRIDE
    view.setInt16(o, cells[i * 4], true)
    view.setInt16(o + 2, cells[i * 4 + 1], true)
    view.setInt16(o + 4, cells[i * 4 + 2], true)
    view.setUint8(o + 6, cells[i * 4 + 3])
  }
  const bytes = new Uint8Array(view.buffer)
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

/** Inverse of encodeBlocks; drops anything malformed. Returns flat [x, y, z, code, …]. */
export function decodeBlocks(data: string | null, limit = BLOCK_LIMIT): number[] {
  const out: number[] = []
  if (!data) return out
  let bin: string
  try {
    bin = atob(data)
  } catch {
    return out
  }
  const n = Math.min(limit, Math.floor(bin.length / STRIDE))
  const bytes = new Uint8Array(n * STRIDE)
  for (let i = 0; i < bytes.length; i++) bytes[i] = bin.charCodeAt(i)
  const view = new DataView(bytes.buffer)
  for (let i = 0; i < n; i++) {
    const o = i * STRIDE
    const x = view.getInt16(o, true)
    const y = view.getInt16(o + 2, true)
    const z = view.getInt16(o + 4, true)
    const code = view.getUint8(o + 6)
    if (inGrid(x, y, z) && validCode(code)) out.push(x, y, z, code)
  }
  return out
}

/* ── room channel ─────────────────────────────────────────── */

/**
 * A block edit from another player: `add` carries [x, y, z, code, …] (single placements and the
 * parts of a player's full list), `del` carries [x, y, z, …], `clear` drops all their blocks.
 */
export interface BlockMsg {
  op: 'add' | 'del' | 'clear'
  cells: number[]
}

/** Blocks per `add` message (list parts are this size). */
export const BLOCKS_PER_MSG = 200

/** Validates an untrusted block message; null if anything is off. */
export function parseBlockMsg(op: unknown, raw: unknown): BlockMsg | null {
  if (op === 'clear') return { op, cells: [] }
  if ((op !== 'add' && op !== 'del') || !Array.isArray(raw)) return null
  const stride = op === 'add' ? 4 : 3
  if (raw.length === 0 || raw.length % stride !== 0 || raw.length > BLOCKS_PER_MSG * stride) return null
  for (let i = 0; i < raw.length; i += stride) {
    if (!inGrid(raw[i], raw[i + 1], raw[i + 2])) return null
    if (stride === 4 && !validCode(raw[i + 3])) return null
  }
  return { op, cells: raw as number[] }
}
