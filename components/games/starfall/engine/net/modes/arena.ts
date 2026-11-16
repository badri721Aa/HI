/**
 * The Knockout arena: a round stone floor floating over the sea south-west of the
 * beach, on an inverted crag of rock, with a broken ring of low posts (gaps to be
 * knocked through) and four lantern pillars. Built with ZoneKit on the first
 * Knockout round, so single-player never pays for it.
 */
import type { Ctx } from '../../types'
import { ZoneKit } from '../../world/zones/kit'
import { ARENA } from './defs'

const POSTS = 20
const FLOOR_H = 1.6

export function buildArena(ctx: Ctx): ZoneKit {
  const kit = new ZoneKit(ctx, 'knockout-arena')
  const { x, y, z, r } = ARENA
  const floorY = y - FLOOR_H
  kit.cylinder({ x, y: floorY, z, r, h: FLOOR_H, segments: 40, mat: 'stone', uvScale: 3, collide: true })
  // A worn mossy medallion in the middle and a darker band near the edge.
  kit.cylinder({ x, y: y - 0.02, z, r: 4.2, h: 0.06, segments: 32, mat: 'mossStone', castShadow: false })
  kit.cylinder({ x, y: floorY - 0.4, z, r: r + 0.35, h: 0.7, segments: 40, mat: kit.mat('stone', { color: '#8a7f72', key: 'arena-lip' }), castShadow: false })
  // The crag it floats on.
  kit.cylinder({ x, y: floorY - 11, z, r: 1.4, rTop: r * 0.92, h: 11, segments: 14, mat: 'rock', uvScale: 4 })
  kit.cylinder({ x: x + 2, y: floorY - 16, z: z - 1, r: 0.3, rTop: 2.6, h: 5.5, segments: 9, mat: 'rock', uvScale: 4 })

  // Low posts around the rim, every third one missing.
  for (let i = 0; i < POSTS; i++) {
    if (i % 3 === 2) continue
    const a = (i / POSTS) * Math.PI * 2
    const px = x + Math.sin(a) * (r - 0.45)
    const pz = z + Math.cos(a) * (r - 0.45)
    kit.box({ x: px, y, z: pz, w: 0.55, h: 0.6, d: 0.55, yaw: a, mat: 'mossStone', collide: true })
  }
  // Lantern pillars on the diagonals.
  const glow = kit.mat('glow', { color: '#ffd9a0', emissive: '#ff9a3c', emissiveIntensity: 2.6, key: 'arena-lamp' })
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2
    const px = x + Math.sin(a) * (r - 0.5)
    const pz = z + Math.cos(a) * (r - 0.5)
    kit.cylinder({ x: px, y, z: pz, r: 0.38, h: 2.6, segments: 8, mat: 'stone', collide: true })
    kit.box({ x: px, y: y + 2.6, z: pz, w: 0.55, h: 0.5, d: 0.55, mat: glow, castShadow: false })
    kit.box({ x: px, y: y + 3.1, z: pz, w: 0.8, h: 0.14, d: 0.8, mat: 'darkPlanks' })
  }
  // A few loose rocks drifting around it.
  const drift: Array<[number, number, number, number]> = [[-17, -3, 6, 1.6], [15, 2, -9, 1.2], [5, -7, 17, 2], [-8, 4, -16, 0.9]]
  for (const [dx, dy, dz, s] of drift) {
    kit.cylinder({ x: x + dx, y: y + dy - s, z: z + dz, r: s * 0.35, rTop: s, h: s * 1.4, segments: 7, mat: 'rock', uvScale: 3 })
  }
  kit.finalize()
  return kit
}
