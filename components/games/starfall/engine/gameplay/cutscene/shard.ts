/**
 * Shard pickup (3.6 s): a short low orbit around the hero holding the shard up,
 * a thread of light flies from his hand to the Beacon, one line of subtitle.
 * Starts from wherever the gameplay camera is, so it never feels like a cut.
 */
import * as THREE from 'three'
import type { Ctx } from '../../types'
import { SHARDS, TOTAL_SHARDS } from '../../world/level'
import { OrbitShot, ease } from './camera'
import { SceneBuilder, type Scene } from './scene'

/** One line per shard, shown under its name. */
const LINES = [
  'Cool as the evening tide.',
  'It hums whenever the wind turns.',
  'Soft green-gold, like moss in lamplight.',
  'Still warm from its long fall.',
  'It was shining through the water all along.',
  'The lake lets it go without a ripple.',
  'The old ship kept it safe.',
]
const LAST_LINE = 'The last one. The Beacon is waiting.'

/** Light colour per shard (gentle tints of the star's gold). */
export const SHARD_COLORS = ['#a9e4ff', '#e4f2c8', '#c9f2a6', '#ffd27a', '#bfe6ff', '#e8e6ff', '#ffc890']

const DURATION = 3.6
const TAU = Math.PI * 2

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

export function buildShard(ctx: Ctx, index: number): Scene {
  const s = new SceneBuilder(ctx)
  const i = Math.min(SHARDS.length - 1, Math.max(0, Math.floor(index) || 0))
  const def = SHARDS[i]
  const color = SHARD_COLORS[i % SHARD_COLORS.length]
  const last = ctx.game.shardCount() >= TOTAL_SHARDS

  // Orbit from the current gameplay camera toward the hero's face, closing in and dropping low.
  const p = ctx.player.position
  const cam = ctx.camera.position
  const offX = cam.x - p.x
  const offZ = cam.z - p.z
  const a0 = Math.hypot(offX, offZ) > 0.2 ? Math.atan2(offX, offZ) : ctx.player.yaw + Math.PI
  const r0 = THREE.MathUtils.clamp(Math.hypot(offX, offZ), 2.6, 8)
  const h0 = THREE.MathUtils.clamp(cam.y - p.y, 0.4, 4.5)
  const towardFace = wrap(ctx.player.yaw - a0)
  const sweep = (towardFace >= 0 ? 1 : -1) * THREE.MathUtils.clamp(Math.abs(towardFace), 0.6, TAU * 0.24)

  s.shot(
    new OrbitShot({
      at: 0,
      duration: DURATION,
      focus: out => out.copy(ctx.player.position),
      azimuth: [a0, a0 + sweep],
      radius: [r0, 3.7],
      height: [h0, 1.05],
      lookY: [1.3, 1.65],
      fov: [ctx.camera.fov, 46],
      ease: ease.inOutSine,
    }),
  )

  s.at(0, () => {
    ctx.collectibles.hideShard(i)
    ctx.character.lookAt(null)
    void ctx.character.playGesture('raiseShard')
  }).letterbox(0, true)
  s.say(0.3, last ? LAST_LINE : LINES[i], def.name)

  // The raised hand peaks around 0.95 s into raiseShard.
  s.at(1.0, () => {
    const hand = ctx.character.getHandPosition(new THREE.Vector3())
    if (!Number.isFinite(hand.x) || hand.distanceToSquared(ctx.player.position) > 9) hand.copy(ctx.player.position).y += 2.2
    const lantern = ctx.zones.beaconLantern.clone()
    ctx.fx.burst('spark', hand, { color })
    ctx.fx.streak(hand, lantern, 1.5, color)
  })
  s.hush(2.9).letterbox(3.0, false)

  return s.build('shard', DURATION, skipped => {
    // The shard is hidden at the start and the gameplay camera glides back from wherever the
    // orbit stopped; on a skip he just lowers the raised arm.
    if (skipped) ctx.character.stopGesture()
  })
}
