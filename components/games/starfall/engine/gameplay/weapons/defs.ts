/**
 * Weapon names, hotbar order and move tuning (shared by the engine and the HUD; no three.js here).
 * Times are seconds, speeds m/s, distances metres.
 */
import type { WeaponId } from '../../events'

/** Hotbar order: keys 1–8. */
export const HOTBAR: readonly WeaponId[] = ['fists', 'sword', 'hammer', 'bow', 'starblade', 'frostHammer', 'starBlaster', 'cometLauncher']

export const WEAPON_NAMES: Record<WeaponId, string> = {
  fists: 'Fists', sword: 'Sword', hammer: 'Hammer', bow: 'Bow', starblade: 'Starblade', frostHammer: 'Frost Hammer',
  starBlaster: 'Star Blaster', cometLauncher: 'Comet Launcher',
}

/** The move set (and hand poses, grip, sounds) a weapon uses: reward weapons are variants. */
export type WeaponKind = 'fists' | 'sword' | 'hammer' | 'bow' | 'blaster' | 'launcher'

export const KIND: Record<WeaponId, WeaponKind> = {
  fists: 'fists', sword: 'sword', hammer: 'hammer', bow: 'bow', starblade: 'sword', frostHammer: 'hammer',
  starBlaster: 'blaster', cometLauncher: 'launcher',
}

/** The star-tech weapons: aimed with the crosshair, they shoot bolts of starlight instead of swinging. */
export type StarWeapon = 'starBlaster' | 'cometLauncher'

export const isStarWeapon = (w: WeaponId): w is StarWeapon => w === 'starBlaster' || w === 'cometLauncher'

/** Fast three-slash combo; pressing attack during a slash chains the next. */
export const SWORD = {
  time: [0.34, 0.34, 0.44],
  /** Point in each slash (0..1) where the blade connects. */
  hitAt: 0.34,
  damage: [34, 34, 48],
  knock: [7, 7, 12],
  lift: [4.5, 4.5, 8],
  /** The blow is a sphere this far ahead of the hero, at chest height. */
  reach: 1.15,
  radius: 1.35,
  moveScale: 0.45,
  rest: 0.18,
}

/** The Gloom King's reward: the sword's combo, harder and with a longer reach. */
export const STARBLADE = {
  ...SWORD,
  damage: [55, 55, 80],
  knock: [8, 8, 14],
  reach: 1.3,
  radius: 1.5,
}

/** Slow wind-up and overhead slam: a heavy direct hit plus a shockwave ring. */
export const HAMMER = {
  time: 0.92,
  hitAt: 0.56,
  damage: 75,
  knock: 17,
  lift: 11,
  reach: 1.35,
  radius: 1.1,
  wave: { radius: 3.4, damage: 36, knock: 10, lift: 8 },
  moveScale: 0.15,
  rest: 0.15,
}

/** The Frost Golem's reward: the hammer's slam; survivors freeze solid for a moment. */
export const FROST_HAMMER = {
  ...HAMMER,
  damage: 85,
  wave: { radius: 3.8, damage: 40, knock: 10, lift: 8 },
  /** Seconds a gloomling stays frozen. */
  freeze: 2.6,
}

/** Hold to draw, release to shoot: speed and damage grow with the draw. */
export const BOW = {
  fullDraw: 0.7,
  releaseTime: 0.3,
  rest: 0.12,
  speed: [17, 46],
  damage: [18, 62],
  drawScale: 0.45,
  releaseScale: 0.7,
}

export const ARROW = {
  gravity: 12,
  /** Seconds an arrow stays stuck in the ground, and its longest flight. */
  stuckLife: 10,
  flightLife: 6,
  max: 24,
}

/** Star-tech: hold the trigger for a stream of quick, light bolts that fly dead straight. */
export const STAR_BLASTER = {
  /** Seconds between bolts, and from the press to the first one (the arm comes up). */
  interval: 0.2,
  lead: 0.07,
  /** The aim is held this long after the last bolt (s). */
  hold: 0.5,
  speed: 52,
  damage: 11,
  knock: 3,
  lift: 2,
  /** A bolt strikes whatever comes this close to it (m) and fizzles out after this long (s). */
  radius: 0.3,
  life: 1.25,
  moveScale: 0.8,
}

/** Star-tech: one slow comet on an arc; it bursts where it lands and throws everything around it. */
export const COMET_LAUNCHER = {
  /** The whole shot (s), and the point in it (0..1) where the comet leaves the tube. */
  time: 0.85,
  fireAt: 0.16,
  rest: 0.2,
  speed: 25,
  gravity: 16,
  /** The enemy the comet itself strikes takes this; the burst is for everything else in reach. */
  damage: 40,
  radius: 0.45,
  blast: { radius: 3.2, damage: 34, knock: 13, lift: 9 },
  life: 5,
  moveScale: 0.35,
}
