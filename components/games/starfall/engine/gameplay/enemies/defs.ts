/**
 * The Enemy Factory's data: every mob and boss as a typed definition — model and look, stats,
 * behaviour tuning, projectiles, drops and the cues it raises. Behaviour code reads these; it
 * holds no numbers of its own. No three.js here, so the UI (the Creative spawner) can share it.
 *
 * Units: metres, seconds, m/s, rad/s; damage to the player in hearts, to enemies in hit points.
 */
import type { EnemyCue, EnemyKind, FactoryBossKind, MobKind } from '../../events'

/* ── models ──────────────────────────────────────────────────── */

export type ModelId =
  | 'legion-rogue' | 'legion-warrior' | 'legion-minion' | 'legion-mage'
  | 'iron-titan' | 'vortex-weaver' | 'plasma-overlord' | 'void-stalker' | 'sentry-turret'

export type GearId = 'shield' | 'buckler' | 'axe' | 'blade' | 'crossbow' | 'quiver' | 'staff' | 'bomb' | 'pack'

/** Semantic animations; each model maps them to its clips (or its procedural rig acts them out). */
export type AnimName =
  | 'idle' | 'combat' | 'walk' | 'run' | 'sprint' | 'hit' | 'death' | 'spawn'
  | 'block' | 'blockHit' | 'bash' | 'slash' | 'chop' | 'aim' | 'shoot' | 'reload'
  | 'cast' | 'castShoot' | 'summon' | 'raise' | 'throw' | 'taunt' | 'dodge'
  | 'fly' | 'flyFast' | 'punch' | 'headbutt' | 'slump' | 'spin' | 'jump'

export interface MaterialLook {
  color?: string
  emissive?: string
  emissiveIntensity?: number
  metalness?: number
  roughness?: number
}

/** How a model is dressed for one enemy. */
export interface Look {
  /** Legion bodies: the atlas's red cloth is repainted this colour. */
  cloth?: string
  /** Eyes and other glowing bits (emissive). */
  glow: string
  glowIntensity?: number
  /** Gloom-touched rim light that keeps the silhouette readable on any background. */
  rim: string
  rimStrength?: number
  /** Overrides per glTF material name (the bosses' plain-colour materials). */
  materials?: Readonly<Record<string, MaterialLook>>
}

export interface GearSlot {
  gear: GearId
  /** Bone (or node) the gear rides on, as GLTFLoader names it (dots stripped: 'handslotr'). */
  bone: string
  pos?: readonly [number, number, number]
  rot?: readonly [number, number, number]
  scale?: number
}

export interface ModelSpec {
  id: ModelId
  /** Uniform scale on top of the model's own size. */
  scale: number
  look: Look
  gear?: readonly GearSlot[]
}

/* ── projectiles ─────────────────────────────────────────────── */

export type ShotStyle = 'orb' | 'bolt' | 'needle' | 'blade' | 'ember'

/** One kind of projectile. Patterns (rings, fans, spirals) are fired from these. */
export interface ShotSpec {
  style: ShotStyle
  color: number
  /** Hit radius (m); the glow is drawn a little larger. */
  radius: number
  speed: number
  /** Hearts. */
  damage: number
  life: number
  /** Visual size multiplier on the radius. */
  size?: number
  /** Downward acceleration (mortar arcs), m/s². */
  gravity?: number
  /** Heading curl (rad/s): positive turns left — spiral arms bend. */
  curl?: number
  /** Speed change along the path (m/s²); negative slows it to a hover. */
  accel?: number
  /** Turning toward the player (rad/s) for the first `homingTime` seconds. */
  homing?: number
  homingTime?: number
  /** Blades and swings knock it out of the air. */
  parry?: boolean
  /** On expiry, burst into this many shots of `split.shot` (a ring). */
  split?: { shot: ShotId; count: number }
}

export type ShotId = 'snipe' | 'sentry' | 'wisp' | 'rivet' | 'mortar' | 'gale' | 'galeR' | 'feather' | 'plasma' | 'spark' | 'needle' | 'shade'

export const SHOTS: Readonly<Record<ShotId, ShotSpec>> = {
  /** Sniper's crossbow bolt: fast, straight, telegraphed by the aim laser. */
  snipe: { style: 'bolt', color: 0xff4a3a, radius: 0.22, speed: 36, damage: 1, life: 1.6, size: 1.6, parry: true },
  /** Healer with nobody to mend: a slow homing wisp. */
  wisp: { style: 'orb', color: 0x7dffb6, radius: 0.28, speed: 7.5, damage: 1, life: 3.2, size: 1.7, homing: 1.3, homingTime: 1.4, parry: true },
  /** Sentry turret bursts: slow enough to sidestep. */
  sentry: { style: 'bolt', color: 0x5ae8ff, radius: 0.2, speed: 15, damage: 1, life: 2.6, size: 1.3, parry: true },
  /** Iron Titan: rivets sprayed from the chest furnace. */
  rivet: { style: 'ember', color: 0xff8a2a, radius: 0.32, speed: 9.5, damage: 1, life: 4.2, size: 1.5, parry: true },
  /** Iron Titan: molten mortar shell (lobbed onto a warning circle). */
  mortar: { style: 'orb', color: 0xff6a1a, radius: 0.55, speed: 0, damage: 1, life: 6, size: 1.7, gravity: 22 },
  /** Vortex Weaver: wind blades along the spiral arms. */
  gale: { style: 'blade', color: 0x8ff7ff, radius: 0.3, speed: 8.5, damage: 1, life: 4.5, size: 1.7, curl: 0.35, parry: true },
  /** Vortex Weaver: the counter-turning arm of the tempest. */
  galeR: { style: 'blade', color: 0xc8fbff, radius: 0.3, speed: 8.5, damage: 1, life: 4.5, size: 1.7, curl: -0.35, parry: true },
  /** Vortex Weaver: feather darts that home in briefly. */
  feather: { style: 'needle', color: 0xd8fff6, radius: 0.2, speed: 13, damage: 1, life: 3, size: 1.6, homing: 2.2, homingTime: 0.9, parry: true },
  /** Plasma Overlord: big slow orbs that home a little, then split. */
  plasma: { style: 'orb', color: 0xff4fd8, radius: 0.5, speed: 7, damage: 1, life: 3.2, size: 1.8, homing: 1.1, homingTime: 1.6, split: { shot: 'spark', count: 6 } },
  /** Plasma Overlord: nova rings and the sparks orbs split into. */
  spark: { style: 'orb', color: 0x7fe3ff, radius: 0.3, speed: 8, damage: 1, life: 3.4, size: 1.6, parry: true },
  /** Void Stalker: shadow needles (dark core, bright violet rim so they read in the dark). */
  needle: { style: 'needle', color: 0xb26bff, radius: 0.22, speed: 15, damage: 1, life: 2.6, size: 1.7, parry: true },
  /** Void Stalker clones: slower needles. */
  shade: { style: 'needle', color: 0x8c5cff, radius: 0.2, speed: 10, damage: 1, life: 2.8, size: 1.5, parry: true },
}

/* ── mobs ────────────────────────────────────────────────────── */

export interface MobStats {
  hp: number
  /** Body radius and height (m) for hits, collision and stomps. */
  radius: number
  height: number
  walk: number
  run: number
  /** Turn rate (rad/s) — slow turners can be flanked. */
  turn: number
  accel: number
  /** Notices the player within this range (m). */
  sight: number
  /** Touching it hurts (hearts per touch; 0 = harmless). */
  contact: number
  /** Knockback taken is divided by this. */
  mass: number
}

export interface RusherTune {
  /** Charges from this far (m). */
  engage: number
  windup: number
  chargeSpeed: number
  chargeTime: number
  /** Dazed after a charge (takes bonus damage). */
  recover: number
  damage: number
  slashRange: number
  slashWindup: number
  cooldown: number
}

export interface ShieldTune {
  /** Half-angle of the shield's cover (rad). */
  arc: number
  /** Damage that gets through the shield (fraction). */
  chip: number
  /** Blows at least this heavy break the guard (hammer slams always do). */
  heavy: number
  broken: number
  bashRange: number
  bashWindup: number
  bashDamage: number
  cooldown: number
}

export interface BomberTune {
  /** Lights the fuse this close (m). */
  trigger: number
  fuse: number
  /** Blast radius and damage (hearts to the player, HP to other enemies). */
  radius: number
  damage: number
  enemyDamage: number
  /** A bomb dropped by a defeated bomber goes off after this long, with this fraction of the radius. */
  dropFuse: number
  dropScale: number
}

export interface SniperTune {
  /** Keeps between these distances (m). */
  near: number
  far: number
  aim: number
  /** The laser stops tracking this long before the shot (the dodge window). */
  lock: number
  reload: number
  shot: ShotId
}

export interface HealerTune {
  range: number
  /** HP per second through the tether. */
  heal: number
  tether: number
  cooldown: number
  /** Empower: damage taken × (1 − ward) and speed × haste, for `buff` seconds. */
  ward: number
  haste: number
  buff: number
  /** Blinks away when the player gets this close. */
  flee: number
  blink: number
  blinkCooldown: number
}

export interface SpawnerTune {
  near: number
  far: number
  /** Seconds between deployments, and the most turrets alive at once. */
  every: number
  max: number
  throwTime: number
}

export interface TurretTune {
  /** Burst size, gap between shots, charge-up telegraph, rest between bursts. */
  burst: number
  gap: number
  charge: number
  rest: number
  range: number
  shot: ShotId
  /** Powers down this long after its spawner falls. */
  orphan: number
}

export interface MobTunes {
  rusher: RusherTune
  shieldBearer: ShieldTune
  bomber: BomberTune
  sniper: SniperTune
  healer: HealerTune
  turretSpawner: SpawnerTune
  turret: TurretTune
}

export type MobLikeKind = MobKind | 'turret'

export interface DropTable {
  /** Chance of a heart (heals one) and how many motes of light burst out (flair only). */
  heal: number
  motes: number
}

export interface MobDef<K extends MobLikeKind = MobLikeKind> {
  kind: K
  name: string
  /** One line for the Creative spawner. */
  role: string
  /** Accent colour: spawner swatch, hit sparks, telegraphs. */
  color: string
  model: ModelSpec
  stats: MobStats
  tune: MobTunes[K]
  drops: DropTable
  /** The cue raised when it notices the player. */
  alert: EnemyCue
}

const BONE = '#e8dcc0'

export const MOBS: { readonly [K in MobLikeKind]: MobDef<K> } = {
  rusher: {
    kind: 'rusher',
    name: 'Rusher',
    role: 'Winds up, then charges in a straight line. Sidestep and punish the stumble.',
    color: '#ff7a3a',
    model: {
      id: 'legion-rogue', scale: 0.82,
      look: { cloth: '#d4511f', glow: '#ffb347', glowIntensity: 2.2, rim: '#ff7a3a', rimStrength: 0.22 },
      gear: [
        { gear: 'blade', bone: 'handslotr' },
        { gear: 'blade', bone: 'handslotl' },
      ],
    },
    stats: { hp: 90, radius: 0.42, height: 1.75, walk: 2.2, run: 5.4, turn: 7, accel: 18, sight: 16, contact: 0, mass: 1 },
    tune: { engage: 9, windup: 0.75, chargeSpeed: 15, chargeTime: 0.95, recover: 1.5, damage: 1, slashRange: 1.9, slashWindup: 0.38, cooldown: 0.9 },
    drops: { heal: 0.25, motes: 6 },
    alert: 'windup',
  },
  shieldBearer: {
    kind: 'shieldBearer',
    name: 'Shield-Bearer',
    role: 'A tower shield turns blows from the front. Flank it, or break the guard with a heavy hit.',
    color: '#6fa8ff',
    model: {
      id: 'legion-warrior', scale: 0.98,
      look: { cloth: '#2f5fb8', glow: '#9fd0ff', glowIntensity: 2.2, rim: '#6fa8ff', rimStrength: 0.22 },
      gear: [
        { gear: 'shield', bone: 'handslotl' },
        { gear: 'axe', bone: 'handslotr' },
      ],
    },
    stats: { hp: 170, radius: 0.55, height: 2, walk: 1.6, run: 2.6, turn: 1.7, accel: 9, sight: 14, contact: 0, mass: 2.4 },
    tune: { arc: 1.2, chip: 0.1, heavy: 60, broken: 2.8, bashRange: 2.2, bashWindup: 0.55, bashDamage: 1, cooldown: 1.6 },
    drops: { heal: 0.4, motes: 8 },
    alert: 'block',
  },
  bomber: {
    kind: 'bomber',
    name: 'Bomber',
    role: 'Sprints in, lights its fuse and blows up. Get clear of the red circle — or pop it early.',
    color: '#ffc23d',
    model: {
      id: 'legion-minion', scale: 0.74,
      look: { cloth: '#d99a1c', glow: '#ffd36b', glowIntensity: 2.2, rim: '#ffb84d', rimStrength: 0.22 },
      gear: [{ gear: 'bomb', bone: 'handslotr', pos: [0, 0.12, 0.08], scale: 1.7 }],
    },
    stats: { hp: 40, radius: 0.38, height: 1.4, walk: 2.6, run: 6.3, turn: 9, accel: 22, sight: 15, contact: 0, mass: 0.8 },
    tune: { trigger: 3, fuse: 1.35, radius: 3.4, damage: 2, enemyDamage: 120, dropFuse: 0.65, dropScale: 0.7 },
    drops: { heal: 0.15, motes: 4 },
    alert: 'fuse',
  },
  sniper: {
    kind: 'sniper',
    name: 'Sniper',
    role: 'Keeps its distance and paints you with a laser. Move when the laser locks.',
    color: '#ff3b55',
    model: {
      id: 'legion-rogue', scale: 0.86,
      look: { cloth: '#5b1630', glow: '#ff4a5a', glowIntensity: 2.2, rim: '#ff3b55', rimStrength: 0.22 },
      gear: [
        { gear: 'crossbow', bone: 'handslotr' },
        { gear: 'quiver', bone: 'chest', pos: [0, 0.15, -0.3], rot: [0.3, 0, 0] },
      ],
    },
    stats: { hp: 70, radius: 0.42, height: 1.8, walk: 2.4, run: 4.2, turn: 5, accel: 14, sight: 26, contact: 0, mass: 1 },
    tune: { near: 10, far: 19, aim: 1.7, lock: 0.42, reload: 1.5, shot: 'snipe' },
    drops: { heal: 0.3, motes: 6 },
    alert: 'aim',
  },
  healer: {
    kind: 'healer',
    name: 'Healer',
    role: 'Tethers to hurt allies and mends them, or wards them. Cut the tether — strike it first.',
    color: '#5dff9c',
    model: {
      id: 'legion-mage', scale: 0.84,
      look: { cloth: '#1d8a55', glow: '#7dffb6', glowIntensity: 2.2, rim: '#5dff9c', rimStrength: 0.22 },
      gear: [{ gear: 'staff', bone: 'handslotr' }],
    },
    stats: { hp: 85, radius: 0.42, height: 1.95, walk: 2.2, run: 4.4, turn: 6, accel: 14, sight: 18, contact: 0, mass: 1 },
    tune: { range: 14, heal: 26, tether: 2.2, cooldown: 1.4, ward: 0.45, haste: 1.25, buff: 6, flee: 4.5, blink: 6.5, blinkCooldown: 6 },
    drops: { heal: 0.6, motes: 10 },
    alert: 'heal',
  },
  turretSpawner: {
    kind: 'turretSpawner',
    name: 'Turret-Spawner',
    role: 'Throws down sentry turrets that fire bursts. Wreck the turrets, then the thrower.',
    color: '#4fe3ff',
    model: {
      id: 'legion-minion', scale: 0.86,
      look: { cloth: '#1f8fa8', glow: '#7ff0ff', glowIntensity: 2.2, rim: '#4fe3ff', rimStrength: 0.22 },
      gear: [
        { gear: 'pack', bone: 'chest', pos: [0, 0.05, -0.32] },
        { gear: 'buckler', bone: 'handslotl' },
      ],
    },
    stats: { hp: 100, radius: 0.42, height: 1.6, walk: 2.2, run: 4.6, turn: 6, accel: 14, sight: 20, contact: 0, mass: 1.1 },
    tune: { near: 9, far: 15, every: 6.5, max: 2, throwTime: 0.75 },
    drops: { heal: 0.35, motes: 8 },
    alert: 'deploy',
  },
  turret: {
    kind: 'turret',
    name: 'Sentry Turret',
    role: 'Deployed by Turret-Spawners. Glows before each burst.',
    color: '#4fe3ff',
    model: {
      id: 'sentry-turret', scale: 1.35,
      look: {
        glow: '#5ae8ff', glowIntensity: 2.2, rim: '#4fe3ff', rimStrength: 0.2,
        materials: {
          metal: { color: '#8f9bab', metalness: 0.6, roughness: 0.38 },
          metalDark: { color: '#56606f', metalness: 0.65, roughness: 0.42 },
          dark: { color: '#232831', metalness: 0.4, roughness: 0.5 },
          metalRed: { color: '#1b5f73', emissive: '#2fd0ff', emissiveIntensity: 0.3, metalness: 0.55, roughness: 0.35 },
        },
      },
    },
    stats: { hp: 60, radius: 0.55, height: 1.1, walk: 0, run: 0, turn: 3.2, accel: 0, sight: 22, contact: 0, mass: 99 },
    tune: { burst: 3, gap: 0.16, charge: 0.6, rest: 2.1, range: 22, shot: 'sentry', orphan: 3 },
    drops: { heal: 0, motes: 5 },
    alert: 'deploy',
  },
}

/** Spawner order. */
export const MOB_KINDS: readonly MobKind[] = ['rusher', 'shieldBearer', 'bomber', 'sniper', 'healer', 'turretSpawner']

/* ── bosses ──────────────────────────────────────────────────── */

export interface BossDef<K extends FactoryBossKind = FactoryBossKind> {
  kind: K
  /** Subtitle under the name (HUD, intro). */
  title: string
  role: string
  color: string
  model: ModelSpec
  hp: number
  /** HP fractions where phases 2 and 3 begin. */
  phases: readonly number[]
  /** Hit volume: radius, height, and how high its feet float above the floor at rest. */
  radius: number
  height: number
  hover: number
  /** Summoning circle radius when no arena is given. */
  arena: number
  /** Hazard colours: shockwave rings and warning circles. */
  ring: string
  warn: string
  /** Aura gradient (inner → outer) per phase. */
  aura: readonly (readonly [string, string])[]
  drops: { hearts: number; motes: number }
}

const BOSS_SCALE = 1

export const BOSSES: { readonly [K in FactoryBossKind]: BossDef<K> } = {
  ironTitan: {
    kind: 'ironTitan',
    title: 'Furnace-Heart of the Old Foundry',
    role: 'Slams, quake rings and rivet sprays. Overheats in phase 3 — hit the open furnace.',
    color: '#ff8a2a',
    model: {
      id: 'iron-titan', scale: 1.42 * BOSS_SCALE,
      look: {
        glow: '#ffb15a', glowIntensity: 4, rim: '#ff6a1a', rimStrength: 0.35,
        materials: {
          Main: { color: '#2c3036', metalness: 0.72, roughness: 0.44 },
          Grey: { color: '#7c828c', metalness: 0.85, roughness: 0.3 },
          Black: { color: '#1a0d06', emissive: '#ff7a1a', emissiveIntensity: 3.2, metalness: 0.2, roughness: 0.4 },
        },
      },
    },
    hp: 1400,
    phases: [0.66, 0.33],
    radius: 1.9,
    height: 6.2,
    hover: 0,
    arena: 19,
    ring: '#ffb35a',
    warn: '#ff5a1f',
    aura: [['#ff7a1a', '#ffcf6a'], ['#ff5a14', '#ffd27a'], ['#fff1d6', '#ff8a2a']],
    drops: { hearts: 3, motes: 40 },
  },
  vortexWeaver: {
    kind: 'vortexWeaver',
    title: 'Storm-Spinner of the High Winds',
    role: 'Spiral gales, downdrafts and a vortex that drags you in. Hit it when it lands.',
    color: '#8ff7ff',
    model: {
      id: 'vortex-weaver', scale: 1.15 * BOSS_SCALE,
      look: {
        glow: '#bffcff', glowIntensity: 4, rim: '#8ff7ff', rimStrength: 0.6,
        materials: {
          Dragon_Main: { color: '#cfe7ea', metalness: 0.05, roughness: 0.55 },
          Dragon_Secondary: { color: '#2a8ea0', emissive: '#3fe0ff', emissiveIntensity: 0.6, roughness: 0.4 },
          Dragon_Horn: { color: '#eaf7ff', metalness: 0.3, roughness: 0.25 },
          Eye_Black: { color: '#0c2a30', emissive: '#a8fbff', emissiveIntensity: 4.5 },
        },
      },
    },
    hp: 1200,
    phases: [0.66, 0.33],
    radius: 1.7,
    height: 2.8,
    hover: 3.2,
    arena: 19,
    ring: '#a8fbff',
    warn: '#4fd8ff',
    aura: [['#7fefff', '#e8ffff'], ['#3fd6ff', '#c8fbff'], ['#2ab8ff', '#ffffff']],
    drops: { hearts: 3, motes: 40 },
  },
  plasmaOverlord: {
    kind: 'plasmaOverlord',
    title: 'Sovereign of the Burning Core',
    role: 'Homing orbs that split, nova rings and a sweeping beam to jump. Strike when it overloads.',
    color: '#ff4fd8',
    model: {
      id: 'plasma-overlord', scale: 1.25 * BOSS_SCALE,
      look: {
        glow: '#ff7ae6', glowIntensity: 4, rim: '#ff4fd8', rimStrength: 0.55,
        materials: {
          Alien_Main: { color: '#1b1636', metalness: 0.55, roughness: 0.32 },
          Alien_Secondary: { color: '#4a1450', emissive: '#ff4fd8', emissiveIntensity: 1.8, roughness: 0.35 },
          Eye_White: { color: '#ffe6fb', emissive: '#7fe3ff', emissiveIntensity: 4.2 },
          Eye_Black: { color: '#ffffff', emissive: '#ff9af0', emissiveIntensity: 4.5 },
          Tongue: { color: '#ff7ae6', emissive: '#ff4fd8', emissiveIntensity: 3.2 },
        },
      },
    },
    hp: 1300,
    phases: [0.66, 0.33],
    radius: 1.6,
    height: 4.2,
    hover: 1.2,
    arena: 19,
    ring: '#ff9af0',
    warn: '#ff3fbf',
    aura: [['#ff4fd8', '#7fe3ff'], ['#ff2fb8', '#a8f0ff'], ['#ffffff', '#ff4fd8']],
    drops: { hearts: 3, motes: 40 },
  },
  voidStalker: {
    kind: 'voidStalker',
    title: 'The Shadow Between Stars',
    role: 'Blinks behind you, splits into shadow clones and drowns the arena in darkness. The real one casts a shadow.',
    color: '#b26bff',
    model: {
      id: 'void-stalker', scale: 1.2 * BOSS_SCALE,
      look: {
        glow: '#d6a8ff', glowIntensity: 4, rim: '#b26bff', rimStrength: 0.75,
        materials: {
          Ghost_Main: { color: '#0b0714', metalness: 0.2, roughness: 0.6 },
          Ghost_Secondary: { color: '#d9d0c4', roughness: 0.55 },
        },
      },
    },
    hp: 1150,
    phases: [0.66, 0.33],
    radius: 1.4,
    height: 3.6,
    hover: 0.7,
    arena: 19,
    ring: '#c79bff',
    warn: '#9b5cff',
    aura: [['#3a1466', '#b26bff'], ['#2a0d52', '#d6a8ff'], ['#12051f', '#f0d6ff']],
    drops: { hearts: 3, motes: 40 },
  },
}

/** Spawner order. */
export const BOSS_KINDS: readonly FactoryBossKind[] = ['ironTitan', 'vortexWeaver', 'plasmaOverlord', 'voidStalker']

export function isBossKind(k: EnemyKind): k is FactoryBossKind {
  return k in BOSSES
}

export function isMobKind(k: EnemyKind): k is MobLikeKind {
  return k in MOBS
}

/** The bone-white the procedural stand-ins share with the legion's atlas. */
export const LEGION_BONE = BONE
