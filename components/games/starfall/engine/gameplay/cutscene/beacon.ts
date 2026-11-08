/**
 * The Beacon (~21 s): night falls on the summit, the seven shards spiral up the
 * tower into the lantern, the Beacon ignites, and dawn breaks while the camera
 * pulls back over the whole island. Ends on black; the victory screen follows.
 */
import * as THREE from 'three'
import type { Ctx } from '../../types'
import { heightAt } from '../../world/heightfield'
import { BEACON, TOTAL_SHARDS } from '../../world/level'
import { PathShot, ease, type Shot } from './camera'
import { SceneBuilder, heroFrame, settlePose, vec, type Scene } from './scene'
import { SHARD_COLORS } from './shard'

const LINES = [
  'Seven pieces of a fallen star, carried home at last.',
  'The Beacon burns again, and its light runs far across the water.',
  'Somewhere out at sea, a sailor sees it and turns for home.',
]

const DURATION = 21.4
const IGNITE = 9.7
const FLAME = '#fff0c8'

/** Radius of the tower around its axis, read from its colliders (spirals must clear it). */
function towerRadius(ctx: Ctx, x: number, z: number): number {
  let r = 1.6
  for (const c of ctx.collision.query(x, z, 3)) {
    if (Math.hypot(c.x - x, c.z - z) > 1.2) continue
    r = Math.max(r, c.shape === 'cylinder' ? c.r : Math.hypot(c.hx, c.hz))
  }
  return Math.min(r, 4.5)
}

export function buildBeacon(ctx: Ctx): Scene {
  const s = new SceneBuilder(ctx)
  const zones = ctx.zones
  const g = heightAt(BEACON.x, BEACON.z)
  const lantern = zones.beaconLantern.lengthSq() > 0 ? zones.beaconLantern.clone() : vec(BEACON.x, g + BEACON.towerHeight + 1, BEACON.z)
  const altar = zones.beaconAltar.lengthSq() > 0 ? zones.beaconAltar.clone() : vec(BEACON.x, g, BEACON.z + 4)

  // Hero-relative frame at the altar, facing the tower.
  const dx = lantern.x - altar.x
  const dz = lantern.z - altar.z
  const reach = Math.max(0.5, Math.hypot(dx, dz))
  const yaw = Math.hypot(dx, dz) > 0.3 ? Math.atan2(dx, dz) : Math.PI
  const hero = heroFrame(altar, yaw)
  const rise = lantern.y - altar.y
  const axis = vec(lantern.x, altar.y, lantern.z)
  const chest = hero.at(0, 0, 1.3)

  let ignited = false
  const ignite = () => {
    if (ignited) return
    ignited = true
    zones.igniteBeacon()
  }
  const standAtAltar = () => ctx.player.teleport(altar.x, altar.y, altar.z, yaw)

  // ── night falls on the summit ──────────────────────────────
  s.at(0, () => {
    standAtAltar()
    ctx.env.setTimeOfDay('night', 2.5)
    ctx.character.lookAt(lantern)
  })
    .letterbox(0, true)
    .music(0, 'cutscene')
  s.say(0.8, LINES[0]).hush(4.2)
  s.at(1.4, () => void ctx.character.playGesture('raiseShard', { loop: true }))

  s.shot(
    new PathShot({
      at: 0,
      duration: 4.4,
      pos: [hero.at(-4.2, 1.8, 1.4), hero.at(-6.0, 1.2, 1.9)],
      target: [hero.at(2.0, 0, 1.5), hero.at(4.0, 0, 3.6)],
      fov: [48, 50],
      ease: ease.inOutSine,
      anchor: chest,
    }),
  )

  // ── seven lights spiral up into the lantern ────────────────
  const orbitR = Math.max(reach + 5.5, 9.5)
  const back = Math.atan2(altar.x - axis.x, altar.z - axis.z)
  const around = (a: number, r: number, y: number) => vec(axis.x + Math.sin(a) * r, y, axis.z + Math.cos(a) * r)
  const orbit: THREE.Vector3[] = []
  for (let k = 0; k <= 4; k++) {
    const u = k / 4
    orbit.push(around(back + THREE.MathUtils.degToRad(42 - 58 * u), orbitR, altar.y + 1.0 + u))
  }
  s.shot(
    new PathShot({
      at: 4.4,
      duration: 5.2,
      pos: orbit,
      target: [vec(axis.x, altar.y + rise * 0.42, axis.z), vec(axis.x, lantern.y + 0.3, axis.z)],
      fov: 58,
      ease: ease.inOutSine,
    }),
  )

  const origin = hero.at(Math.min(1.8, reach * 0.45), 0, 1.15)
  const helixR = towerRadius(ctx, axis.x, axis.z) + 1.0
  const a0 = Math.atan2(origin.x - axis.x, origin.z - axis.z)
  // Each light leaves the altar, winds ~1.1–1.3 turns around the tower (alternating direction,
  // bulging out mid-climb) and dives into the lantern.
  for (let i = 0; i < TOTAL_SHARDS; i++) {
    const turns = (1.1 + (i % 3) * 0.12) * (i % 2 ? -1 : 1)
    const pts: THREE.Vector3[] = [origin]
    for (let k = 1; k <= 7; k++) {
      const u = k / 7
      const a = a0 + turns * Math.PI * 2 * u
      const r = helixR + (helixR * 0.25) * Math.sin(Math.PI * u)
      pts.push(around(a, THREE.MathUtils.lerp(r, helixR * 0.8, u * u), THREE.MathUtils.lerp(origin.y, lantern.y - 0.4, ease.inOutSine(u))))
    }
    pts.push(lantern)
    const color = SHARD_COLORS[i % SHARD_COLORS.length]
    const arrive = s.trail(2.4 + i * 0.85, pts, 0.2, color)
    s.burst(arrive, 'spark', lantern, { color })
  }
  s.at(9.3, () => ctx.character.stopGesture())

  // ── ignition ───────────────────────────────────────────────
  // Wide enough to hold the hero at the altar and the lantern above him.
  const c0 = hero.at(-11, -4.5, 0.6)
  const c1 = hero.at(-11.8, -4.8, 0.7)
  const cTarget = chest.clone().lerp(lantern, 0.5)
  s.shot(new PathShot({ at: 9.6, duration: 3.4, pos: [c0, c1], target: cTarget, fov: 58, ease: ease.linear, anchor: chest }))
  s.at(IGNITE, ignite)
    .flash(IGNITE, 'rgba(255, 244, 214, 0.9)', 1.1)
    .burst(IGNITE, 'beacon', lantern, { scale: 1.4, color: FLAME })
    .at(IGNITE, () => ctx.game.shake(0.5, 1.1))
    .music(IGNITE, 'victory')
  s.at(10.4, () => {
    ctx.character.lookAt(null)
    void ctx.character.playGesture('cheer')
  })

  // ── dawn: pull back over the whole island ──────────────────
  s.at(12.4, () => ctx.env.setTimeOfDay('dawn', 6))
  const wideEnd = vec(BEACON.x - 140, 80, BEACON.z + 180)
  const wideLook = vec(BEACON.x + 20, 6, BEACON.z + 30)
  const wide: Shot = new PathShot({
    at: 13.0,
    duration: DURATION - 13.0,
    pos: [c1, hero.at(-24, -16, rise + 9), vec(BEACON.x - 62, 50, BEACON.z + 82), wideEnd],
    target: [cTarget, vec(lantern.x, lantern.y - 2, lantern.z), wideLook],
    fov: [58, 46],
    ease: ease.inOutCubic,
  })
  s.shot(wide)
  s.burst(13.6, 'beacon', vec(lantern.x + 5, lantern.y + 9, lantern.z + 2), { color: '#ffd27a' })
  s.burst(14.5, 'beacon', vec(lantern.x - 6, lantern.y + 12, lantern.z - 3), { color: '#ffb3a1' })
  s.burst(15.5, 'beacon', vec(lantern.x + 1, lantern.y + 15, lantern.z - 6), { color: '#bfe6ff' })
  s.say(13.6, LINES[1]).hush(16.6)
  s.say(16.8, LINES[2]).hush(19.6)
  s.fade(19.7, 1, 1.4)

  return s.build('beacon', DURATION, skipped => {
    ignite()
    if (skipped) {
      ctx.env.setTimeOfDay('dawn', 0)
      standAtAltar()
      settlePose(ctx.character)
      // Leave the closing wide shot behind the victory screen.
      const pos = new THREE.Vector3()
      const look = new THREE.Vector3()
      const fov = wide.sample(wide.duration, 0, pos, look)
      ctx.camera.position.copy(pos)
      ctx.camera.lookAt(look)
      ctx.camera.fov = fov
      ctx.camera.updateProjectionMatrix()
    }
    // Lift the black slowly so the dawn island appears behind the victory screen.
    ctx.bus.emit('ui:fade', { to: 0, duration: skipped ? 0.6 : 1.6 })
  })
}
