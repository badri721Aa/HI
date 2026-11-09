/**
 * Weapon names, hotbar order and move tuning (shared by the engine and the HUD; no three.js here).
 * Times are seconds, speeds m/s, distances metres.
 */
import type { WeaponId } from '../../events'

/** Hotbar order: keys 1–6. */
export const HOTBAR: readonly WeaponId[] = ['fists', 'sword', 'hammer', 'bow', 'starblade', 'frostHammer']

export const WEAPON_NAMES: Record<WeaponId, string> = {
  fists: 'Fists', sword: 'Sword', hammer: 'Hammer', bow: 'Bow', starblade: 'Starblade', frostHammer: 'Frost Hammer',
}

/** The move set (and hand poses, grip, sounds) a weapon uses: reward weapons are variants. */
export type WeaponKind = 'fists' | 'sword' | 'hammer' | 'bow'

export const KIND: Record<WeaponId, WeaponKind> = {
  fists: 'fists', sword: 'sword', hammer: 'hammer', bow: 'bow', starblade: 'sword', frostHammer: 'hammer',
}

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
