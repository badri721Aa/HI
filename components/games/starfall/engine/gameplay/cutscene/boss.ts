/**
 * Boss introduction (2.8 s, skippable): from behind the player the camera swings round to a
 * low shot of the boss's face as it wakes and roars, its name and title in the subtitle bar.
 * The fight begins when it ends — or at once when skipped.
 */
import type { Ctx } from '../../types'
import { PathShot, ease } from './camera'
import { SceneBuilder, vec, type Scene } from './scene'

const DURATION = 2.8

export function buildBoss(ctx: Ctx): Scene {
  const s = new SceneBuilder(ctx)
  const intro = ctx.worlds.bossIntro()
  if (!intro) return s.build('boss', 0, () => {})
  const f = intro.focus.clone()
  const p = ctx.player.position
  // Unit vector from the boss toward the player, and its right-hand side.
  let dx = p.x - f.x
  let dz = p.z - f.z
  const d = Math.hypot(dx, dz) || 1
  dx /= d
  dz /= d
  const rx = -dz
  const rz = dx
  const behind = vec(p.x + dx * 4 + rx * 1.5, p.y + 2.6, p.z + dz * 4 + rz * 1.5)
  const mid = vec(f.x + dx * 12 + rx * 5, f.y - 1.2, f.z + dz * 12 + rz * 5)
  const close = vec(f.x + dx * 8.5 + rx * 2.5, f.y - 2.6, f.z + dz * 8.5 + rz * 2.5)

  s.letterbox(0, true)
  s.music(0.5, 'boss')
  s.shot(new PathShot({ at: 0, duration: 1.1, pos: [behind, mid], target: f, fov: [52, 46], ease: ease.inOutSine }))
  s.shot(new PathShot({ at: 1.1, duration: DURATION - 1.1, pos: [mid, close], target: [f, vec(f.x, f.y + 0.4, f.z)], fov: [46, 38], ease: ease.outCubic }))
  s.at(0.8, () => intro.roar())
  s.say(1.1, intro.title, intro.name)
  s.hush(DURATION - 0.1)
  return s.build('boss', DURATION, () => intro.begin())
}
