/**
 * Small helpers shared by the gameplay objects: seeded randomness, cheap
 * ground queries (terrain + low colliders) and the soft glow texture.
 */
import * as THREE from 'three'
import type { Collider } from '../../collision'
import type { Ctx } from '../../types'
import { heightAt } from '../../world/heightfield'

/** Deterministic PRNG (mulberry32) — same island, same sparkle, every run. */
export function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function colliderTop(c: Collider): number {
  return c.shape === 'box' ? c.y + c.hy : c.y + c.h
}

function colliderCovers(c: Collider, x: number, z: number, radius: number): boolean {
  if (c.shape === 'cylinder') return Math.hypot(x - c.x, z - c.z) <= c.r + radius
  const dx = x - c.x
  const dz = z - c.z
  const cs = Math.cos(c.yaw)
  const sn = Math.sin(c.yaw)
  const lx = dx * cs - dz * sn
  const lz = dx * sn + dz * cs
  return Math.abs(lx) <= c.hx + radius && Math.abs(lz) <= c.hz + radius
}

/**
 * Highest walkable height at (x, z) that is no more than `stepUp` above `footY`:
 * terrain, or the top of a collider (pier deck, plaza paving, crates…).
 * Much cheaper than CollisionWorld.groundAt (no normals / surface lookups).
 */
export function supportHeight(ctx: Ctx, x: number, z: number, footY: number, radius: number, stepUp = 0.45): number {
  let h = heightAt(x, z)
  const limit = footY + stepUp
  const list = ctx.collision.query(x, z, radius + 1)
  for (let i = 0; i < list.length; i++) {
    const c = list[i]
    const t = colliderTop(c)
    if (t > limit || t <= h) continue
    if (colliderCovers(c, x, z, radius)) h = t
  }
  return h
}

/** True when a texture from the TextureLib is a real image rather than the 1×1 placeholder. */
function isRealImage(tex: THREE.Texture): boolean {
  const img = tex.image as { width?: number } | undefined
  return !!img && (img.width ?? 0) > 4
}

/**
 * The shared soft glow sprite. Falls back to a generated radial gradient when the
 * texture file is missing (the placeholder would draw hard white squares).
 * `owned` tells the caller whether it must dispose the returned texture.
 */
export function glowTexture(ctx: Ctx): { texture: THREE.Texture; owned: boolean } {
  const lib = ctx.textures.get('glow')
  if (isRealImage(lib)) return { texture: lib, owned: false }
  const size = 128
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.18, 'rgba(255,255,255,0.62)')
  grad.addColorStop(0.45, 'rgba(255,255,255,0.18)')
  grad.addColorStop(0.75, 'rgba(255,255,255,0.04)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.NoColorSpace
  return { texture: tex, owned: true }
}

/** The loaded planks image (for painting sign boards), or null if only the placeholder exists. */
export function planksImage(ctx: Ctx): CanvasImageSource | null {
  const tex = ctx.textures.get('planks_albedo')
  return isRealImage(tex) ? (tex.image as CanvasImageSource) : null
}

/** Exponential smoothing factor for a rate (1/s), frame-rate independent. */
export function damp(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * dt)
}
