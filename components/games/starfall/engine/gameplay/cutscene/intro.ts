/**
 * Intro (~20 s): dusk over the island, a star bursts above the summit and falls
 * as seven shards; on Sunset Beach the hero wakes, looks up at the dark Beacon,
 * and the camera settles behind him to hand over to the player.
 */
import * as THREE from 'three'
import type { Ctx } from '../../types'
import { heightAt } from '../../world/heightfield'
import { BEACON, SPAWN, TOTAL_SHARDS } from '../../world/level'
import { PathShot, ease, followPose } from './camera'
import { SceneBuilder, heroFrame, settlePose, vec, type Scene } from './scene'

const LINES = [
  'For a thousand years, the Beacon on Starfall Isle lit the way home for every ship at sea.',
  'One quiet evening its flame went dark, and the star at its heart broke apart.',
  'Seven shards fell across the island — on rooftops, in the woods, beneath the falls.',
  'Find them. Carry them to the summit. Light the Beacon again.',
]

const STAR = '#fff1cf'
const SHARD_LIGHT = '#ffd98c'

export function buildIntro(ctx: Ctx): Scene {
  const s = new SceneBuilder(ctx)
  const ground = heightAt(SPAWN.x, SPAWN.z)
  const feet = vec(SPAWN.x, ground, SPAWN.z)
  const hero = heroFrame(feet, SPAWN.yaw)
  const summitY = heightAt(BEACON.x, BEACON.z)
  /** Where the star bursts, high above the Beacon. */
  const burstAt = vec(BEACON.x, summitY + 26, BEACON.z)
  const lantern = ctx.zones.beaconLantern.lengthSq() > 0 ? ctx.zones.beaconLantern.clone() : vec(BEACON.x, summitY + BEACON.towerHeight + 1, BEACON.z)
  const shards = Array.from({ length: TOTAL_SHARDS }, (_, i) => ctx.collectibles.shardPosition(i).clone())

  // ── opening: black → dusk aerial ───────────────────────────
  s.at(0, () => {
    ctx.env.setTimeOfDay('dusk', 0)
    ctx.player.teleport(feet.x, feet.y, feet.z, SPAWN.yaw)
    // wakeUp loops its first half-second: the hero lies on the sand until stopGesture().
    void ctx.character.playGesture('wakeUp', { loop: true })
    ctx.character.lookAt(null)
  })
    .fade(0, 1, 0)
    .letterbox(0, true)
    .music(0, 'cutscene')
    .fade(0.1, 0, 1.8)

  s.shot(
    new PathShot({
      at: 0,
      duration: 5.0,
      pos: [vec(104, 30, 214), vec(78, 38, 200), vec(52, 46, 186)],
      target: [vec(-6, 12, 24), vec(-4, 18, -20)],
      fov: [50, 52],
      ease: ease.linear,
    }),
  )
  s.say(1.0, LINES[0]).hush(4.8)

  // High behind the summit, looking out over the island: the star arrives and bursts…
  s.shot(
    new PathShot({
      at: 5.0,
      duration: 5.0,
      pos: [vec(BEACON.x - 46, summitY + 42, BEACON.z - 64), vec(BEACON.x - 38, summitY + 50, BEACON.z - 54)],
      target: [vec(BEACON.x, summitY + 20, BEACON.z + 4), vec(BEACON.x + 8, summitY - 2, BEACON.z + 50)],
      fov: [54, 58],
      ease: ease.inOutSine,
    }),
  )
  s.streak(5.1, vec(170, 170, 140), burstAt, 1.7, STAR)
  s.burst(6.8, 'beacon', burstAt, { scale: 1.6, color: STAR })
  s.flash(6.8, 'rgba(255, 236, 200, 0.45)', 0.8)
  s.say(6.9, LINES[1]).hush(9.6)

  // …and seven shards fall to where the player will find them.
  shards.forEach((p, i) => {
    const t = 7.0 + i * 0.13
    const d = 1.7 + (i % 3) * 0.25
    s.streak(t, burstAt, p, d, SHARD_LIGHT)
    s.burst(t + d, 'spark', p, { color: SHARD_LIGHT })
  })

  // ── Sunset Beach: the hero wakes ───────────────────────────
  s.fade(9.6, 1, 0.4).fade(10.05, 0, 0.9)
  s.shot(
    new PathShot({
      at: 10.0,
      duration: 3.1,
      pos: [hero.at(0.8, -3.1, 1.5), hero.at(0.4, -2.4, 1.2)],
      target: [hero.at(-0.5, 0, 0.35), hero.at(-0.15, 0, 0.75)],
      fov: [40, 38],
      ease: ease.outCubic,
      anchor: hero.at(0, 0, 0.6),
    }),
  )
  s.at(10.5, () => ctx.character.stopGesture())
  s.say(10.7, LINES[2]).hush(13.6)

  // He looks up at the dark summit.
  s.shot(
    new PathShot({
      at: 13.1,
      duration: 2.5,
      pos: [hero.at(2.4, -1.6, 0.95), hero.at(2.2, -1.9, 0.85)],
      target: [hero.at(0, 0, 1.5), hero.at(0, 0, 1.6)],
      fov: 36,
      ease: ease.linear,
      anchor: hero.at(0, 0, 1.5),
    }),
  )
  s.at(13.1, () => {
    void ctx.character.playGesture('lookUp', { loop: true })
    ctx.character.lookAt(lantern)
  })
  s.say(13.8, LINES[3]).hush(17.4)

  // Over his shoulder, tilting up to the Beacon.
  const horizon = hero.at(60, 0, 4)
  const summit = vec(lantern.x, lantern.y - 4, lantern.z)
  const c2End = hero.at(-3.2, 0.9, 2.0)
  s.shot(
    new PathShot({
      at: 15.6,
      duration: 2.2,
      pos: [hero.at(-2.6, 1.1, 1.55), c2End],
      target: [horizon, summit],
      fov: [42, 40],
      ease: ease.inOutSine,
      anchor: hero.at(0, 0, 1.4),
    }),
  )
  s.at(17.3, () => {
    ctx.character.stopGesture()
    ctx.character.lookAt(null)
  })

  // ── hand-over: glide into the gameplay camera ──────────────
  const followPos = new THREE.Vector3()
  const followLook = new THREE.Vector3()
  followPose(feet, SPAWN.yaw, 60, followPos, followLook)
  s.shot(
    new PathShot({
      at: 17.8,
      duration: 2.6,
      pos: [c2End, hero.at(-4.8, 0.45, 2.7), followPos],
      target: [summit, followLook],
      fov: [40, ctx.settings.fov],
      ease: ease.inOutSine,
      anchor: hero.at(0, 0, 1.4),
    }),
  )
  s.letterbox(19.1, false)

  return s.build('intro', 20.4, skipped => {
    // Point the rig behind the hero; Game switches it back to 'follow' afterwards.
    if (skipped) {
      ctx.env.setTimeOfDay('dusk', 0)
      ctx.player.teleport(feet.x, feet.y, feet.z, SPAWN.yaw)
      settlePose(ctx.character)
      // A cut, not a glide across the island.
      ctx.cameraRig.mode = 'follow'
    }
    ctx.cameraRig.snapBehind()
  })
}
