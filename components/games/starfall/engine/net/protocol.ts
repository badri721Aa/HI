/**
 * Wire formats and validation. Every incoming packet is untrusted: it is
 * type-checked, size-capped and clamped here before anything else sees it.
 *
 * Peer-to-peer state packets are a fixed 40-byte binary layout:
 *
 *   0 u8 kind (1)   1 u8 state   2 u8 flags   3 u8 wading·255
 *   4 f32 t (sender clock, s)   8..19 f32 x y z   20 f32 yaw
 *   24..35 f32 vx vy vz   36 i8 slope·127   37 u8 weapon in hand   38 u8 map   39 reserved
 *
 * Ping/pong: 16 bytes — u8 kind (2 ping, 3 pong), f64 timestamp at offset 8.
 * The Supabase relay uses small JSON objects with the same fields.
 */
import type { GestureName, PlayerState, WeaponId } from '../types'
import { WORLD_HALF } from '../world/heightfield'
import { CHAT_MAX, NAME_MAX, SHIRT_COLORS } from './config'

/* ── player state codes ──────────────────────────────────── */

/** Order is the wire code (append new states at the end). */
const STATES: readonly PlayerState[] = [
  'idle', 'move', 'jump', 'doubleJump', 'fall', 'land', 'dash',
  'attack', 'hurt', 'dead', 'wade', 'bounce', 'cutscene', 'ragdoll',
]

const STATE_CODE = new Map<PlayerState, number>(STATES.map((s, i) => [s, i]))

export function stateCode(s: PlayerState): number {
  return STATE_CODE.get(s) ?? 0
}

export function stateFromCode(code: number): PlayerState {
  return STATES[code] ?? 'idle'
}

export const FLAG_GROUNDED = 1
export const FLAG_RAGDOLL = 2
/** The player is in a menu (title / paused): name tag dims. */
export const FLAG_AWAY = 4
export const FLAG_ACTIVE = 8

/** Weapon wire codes (append new weapons at the end). */
const WEAPONS: readonly WeaponId[] = ['fists', 'sword', 'hammer', 'bow', 'starblade', 'frostHammer']
/** Number of map wire codes (see worlds/defs mapCode). */
const MAP_COUNT = 3

export function weaponCode(w: WeaponId): number {
  return Math.max(0, WEAPONS.indexOf(w))
}

export function weaponFromCode(code: number): WeaponId {
  return WEAPONS[code] ?? 'fists'
}

/* ── state snapshots ─────────────────────────────────────── */

export interface Snapshot {
  /** Sender clock (s). */
  t: number
  x: number
  y: number
  z: number
  yaw: number
  vx: number
  vy: number
  vz: number
  state: number
  flags: number
  /** 0..1 */
  wading: number
  /** -1..1 */
  slope: number
  /** Weapon code (see weaponCode). */
  weapon: number
  /** Map code (see worlds/defs mapCode). */
  map: number
}

export function makeSnapshot(): Snapshot {
  return { t: 0, x: 0, y: 0, z: 0, yaw: 0, vx: 0, vy: 0, vz: 0, state: 0, flags: FLAG_GROUNDED, wading: 0, slope: 0, weapon: 0, map: 0 }
}

export function copySnapshot(out: Snapshot, s: Snapshot): Snapshot {
  out.t = s.t
  out.x = s.x
  out.y = s.y
  out.z = s.z
  out.yaw = s.yaw
  out.vx = s.vx
  out.vy = s.vy
  out.vz = s.vz
  out.state = s.state
  out.flags = s.flags
  out.wading = s.wading
  out.slope = s.slope
  out.weapon = s.weapon
  out.map = s.map
  return out
}

export const KIND_STATE = 1
export const KIND_PING = 2
export const KIND_PONG = 3
export const STATE_BYTES = 40
export const PING_BYTES = 16

/** The island plus the portal maps' regions (out to ±2400 m, up to ~140 m). */
const LIMIT_XZ = 2400 + WORLD_HALF
const LIMIT_Y_LO = -40
const LIMIT_Y_HI = 400
const LIMIT_V = 80
const LIMIT_T = 1e7

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Clamps a decoded snapshot into the world; false if it is unusable. */
function sanitizeSnapshot(s: Snapshot): boolean {
  if (!(fin(s.t) && fin(s.x) && fin(s.y) && fin(s.z) && fin(s.yaw) && fin(s.vx) && fin(s.vy) && fin(s.vz))) return false
  if (s.t < 0 || s.t > LIMIT_T) return false
  s.x = clamp(s.x, -LIMIT_XZ, LIMIT_XZ)
  s.z = clamp(s.z, -LIMIT_XZ, LIMIT_XZ)
  s.y = clamp(s.y, LIMIT_Y_LO, LIMIT_Y_HI)
  s.yaw = Math.atan2(Math.sin(s.yaw), Math.cos(s.yaw))
  s.vx = clamp(s.vx, -LIMIT_V, LIMIT_V)
  s.vy = clamp(s.vy, -LIMIT_V, LIMIT_V)
  s.vz = clamp(s.vz, -LIMIT_V, LIMIT_V)
  if (s.state >= STATES.length || s.state < 0) s.state = 0
  s.flags &= 0xff
  s.wading = clamp(fin(s.wading) ? s.wading : 0, 0, 1)
  s.slope = clamp(fin(s.slope) ? s.slope : 0, -1, 1)
  if (!(s.weapon >= 0 && s.weapon < WEAPONS.length)) s.weapon = 0
  if (!(s.map >= 0 && s.map < MAP_COUNT)) s.map = 0
  return true
}

export function encodeState(view: DataView, s: Snapshot): void {
  view.setUint8(0, KIND_STATE)
  view.setUint8(1, s.state)
  view.setUint8(2, s.flags)
  view.setUint8(3, Math.round(clamp(s.wading, 0, 1) * 255))
  view.setFloat32(4, s.t, true)
  view.setFloat32(8, s.x, true)
  view.setFloat32(12, s.y, true)
  view.setFloat32(16, s.z, true)
  view.setFloat32(20, s.yaw, true)
  view.setFloat32(24, s.vx, true)
  view.setFloat32(28, s.vy, true)
  view.setFloat32(32, s.vz, true)
  view.setInt8(36, Math.round(clamp(s.slope, -1, 1) * 127))
  view.setUint8(37, s.weapon)
  view.setUint8(38, s.map)
}

export function decodeState(view: DataView, out: Snapshot): boolean {
  if (view.byteLength !== STATE_BYTES || view.getUint8(0) !== KIND_STATE) return false
  out.state = view.getUint8(1)
  out.flags = view.getUint8(2)
  out.wading = view.getUint8(3) / 255
  out.t = view.getFloat32(4, true)
  out.x = view.getFloat32(8, true)
  out.y = view.getFloat32(12, true)
  out.z = view.getFloat32(16, true)
  out.yaw = view.getFloat32(20, true)
  out.vx = view.getFloat32(24, true)
  out.vy = view.getFloat32(28, true)
  out.vz = view.getFloat32(32, true)
  out.slope = view.getInt8(36) / 127
  out.weapon = view.getUint8(37)
  out.map = view.getUint8(38)
  return sanitizeSnapshot(out)
}

/** JSON form for the Supabase relay (rounded to keep messages small). */
export interface RelayPacket {
  from: string
  t: number
  p: [number, number, number]
  r: number
  v: [number, number, number]
  s: number
  f: number
  w: number
  sl: number
  /** Weapon code (absent from older clients). */
  wp?: number
  /** Map code (absent from older clients: the island). */
  m?: number
}

const r3 = (v: number) => Math.round(v * 1000) / 1000
const r2 = (v: number) => Math.round(v * 100) / 100

export function toRelay(from: string, s: Snapshot): RelayPacket {
  return {
    from,
    t: r3(s.t),
    p: [r3(s.x), r3(s.y), r3(s.z)],
    r: r3(s.yaw),
    v: [r2(s.vx), r2(s.vy), r2(s.vz)],
    s: s.state,
    f: s.flags,
    w: r2(s.wading),
    sl: r2(s.slope),
    wp: s.weapon,
    m: s.map,
  }
}

function vec3(v: unknown): [number, number, number] | null {
  if (!Array.isArray(v) || v.length !== 3 || !v.every(fin)) return null
  return v as [number, number, number]
}

export function fromRelay(raw: unknown, out: Snapshot): boolean {
  const o = raw as Partial<RelayPacket> | null
  if (!o || typeof o !== 'object') return false
  const p = vec3(o.p)
  const v = vec3(o.v)
  if (!p || !v || !fin(o.t) || !fin(o.r) || !fin(o.s) || !fin(o.f)) return false
  out.t = o.t
  out.x = p[0]
  out.y = p[1]
  out.z = p[2]
  out.yaw = o.r
  out.vx = v[0]
  out.vy = v[1]
  out.vz = v[2]
  out.state = Math.floor(o.s)
  out.flags = Math.floor(o.f)
  out.wading = fin(o.w) ? o.w : 0
  out.slope = fin(o.sl) ? o.sl : 0
  out.weapon = fin(o.wp) ? Math.floor(o.wp) : 0
  out.map = fin(o.m) ? Math.floor(o.m) : 0
  return sanitizeSnapshot(out)
}

/* ── ids, names, text ────────────────────────────────────── */

const ID_RE = /^[a-z0-9]{8,24}$/

export function isPeerId(v: unknown): v is string {
  return typeof v === 'string' && ID_RE.test(v)
}

export function randomId(len = 12): string {
  const bytes = new Uint8Array(len)
  crypto.getRandomValues(bytes)
  let s = ''
  for (const b of bytes) s += (b % 36).toString(36)
  return s
}

// Control characters, zero-width / bidi overrides and line separators.
const UNSAFE = /[\u0000-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff\ufff9-\ufffb]/g

/** Strips unsafe characters, collapses whitespace, trims and caps the length (by code point). */
export function sanitizeText(v: unknown, max: number): string {
  if (typeof v !== 'string') return ''
  const clean = v.slice(0, max * 4).replace(UNSAFE, ' ').replace(/\s+/g, ' ').trim()
  const chars = Array.from(clean)
  return chars.length > max ? chars.slice(0, max).join('').trim() : clean
}

export function sanitizeName(v: unknown): string {
  return sanitizeText(v, NAME_MAX)
}

export function sanitizeChat(v: unknown): string {
  return sanitizeText(v, CHAT_MAX)
}

const COLOR_RE = /^#[0-9a-f]{6}$/i

export function sanitizeColor(v: unknown): string | null {
  return typeof v === 'string' && COLOR_RE.test(v) ? v.toLowerCase() : null
}

export function defaultName(): string {
  return `Islander ${10 + Math.floor(Math.random() * 90)}`
}

export function defaultColor(): string {
  return SHIRT_COLORS[Math.floor(Math.random() * SHIRT_COLORS.length)]
}

const CODE_RE = /^[a-z0-9]{3,12}$/

/** Lower-cased room code, or null when it is not 3–12 letters/digits. */
export function normalizeRoomCode(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const c = v.trim().toLowerCase()
  return CODE_RE.test(c) ? c : null
}

/* ── broadcast payloads ──────────────────────────────────── */

/** Gestures other players may trigger on our copy of them. */
export const EMOTES: readonly GestureName[] = ['wave', 'cheer', 'point', 'shrug']

export function isEmote(v: unknown): v is GestureName {
  return typeof v === 'string' && (EMOTES as readonly string[]).includes(v)
}

export interface MemberInfo {
  name: string
  color: string
  joinedAt: number
}

/** Presence payload of a room member (sanitised, with fallbacks). */
export function parseMember(raw: unknown): MemberInfo {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    name: sanitizeName(o.name) || 'Islander',
    color: sanitizeColor(o.color) ?? SHIRT_COLORS[0],
    joinedAt: fin(o.joinedAt) ? o.joinedAt : Number.MAX_SAFE_INTEGER,
  }
}

export interface SignalMsg {
  from: string
  to: string
  /** Link session id, chosen by the impolite peer; stale sessions are ignored. */
  sid: string
  d?: { type: 'offer' | 'answer'; sdp: string }
  c?: RTCIceCandidateInit[]
}

const SID_RE = /^[a-z0-9]{6,16}$/
const MAX_SDP = 16000
const MAX_CANDIDATES = 24

export function parseSignal(raw: unknown): SignalMsg | null {
  const o = raw as Partial<SignalMsg> | null
  if (!o || typeof o !== 'object' || !isPeerId(o.from) || !isPeerId(o.to)) return null
  if (typeof o.sid !== 'string' || !SID_RE.test(o.sid)) return null
  const msg: SignalMsg = { from: o.from, to: o.to, sid: o.sid }
  if (o.d !== undefined) {
    const d = o.d as { type?: unknown; sdp?: unknown }
    if (!d || (d.type !== 'offer' && d.type !== 'answer') || typeof d.sdp !== 'string' || d.sdp.length > MAX_SDP) return null
    msg.d = { type: d.type, sdp: d.sdp }
  }
  if (o.c !== undefined) {
    if (!Array.isArray(o.c) || o.c.length > MAX_CANDIDATES) return null
    const list: RTCIceCandidateInit[] = []
    for (const raw of o.c as unknown[]) {
      const c = raw as RTCIceCandidateInit | null
      if (!c || typeof c.candidate !== 'string' || c.candidate.length > 512) return null
      const mid = c.sdpMid
      const idx = c.sdpMLineIndex
      if (mid != null && (typeof mid !== 'string' || mid.length > 16)) return null
      if (idx != null && !(Number.isInteger(idx) && idx >= 0 && idx < 16)) return null
      list.push({ candidate: c.candidate, sdpMid: mid ?? null, sdpMLineIndex: idx ?? null })
    }
    msg.c = list
  }
  return msg.d || msg.c ? msg : null
}

export function parseVec(raw: unknown, limit: number): [number, number, number] | null {
  const v = vec3(raw)
  return v ? [clamp(v[0], -limit, limit), clamp(v[1], -limit, limit), clamp(v[2], -limit, limit)] : null
}

/** Small token bucket (rate limiting chat and emotes). */
export class Bucket {
  private tokens: number
  private last = 0

  constructor(private capacity: number, private perSecond: number) {
    this.tokens = capacity
  }

  take(now: number): boolean {
    this.tokens = Math.min(this.capacity, this.tokens + Math.max(0, now - this.last) * this.perSecond)
    this.last = now
    if (this.tokens < 1) return false
    this.tokens -= 1
    return true
  }
}
