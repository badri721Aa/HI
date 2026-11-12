/**
 * Shared contracts between the Starfall engine modules.
 *
 * Every module is a class constructed with the shared `Ctx` and implementing
 * one of the interfaces below. Game.ts builds them in a fixed order, awaits
 * `init()`, then calls `update(dt)` in a fixed order each frame (see Game.ts).
 * Modules talk to each other through `ctx.bus` events or through the typed
 * references on `ctx` — never through globals.
 */
import type * as THREE from 'three'
import type { CollisionWorld, Collider } from './collision'
import type { BlockMsg } from './build/blocks'
import type { BossId, CutsceneName, EventBus, GamePhase, MapId, MusicMood, V3, WeaponId } from './events'
import type { Input } from './input'
import type { SaveGame } from './save'
import type { QualityProfile, Settings } from './settings'
import type { CompassMarker, HudStore } from './store'
import type { TextureLib } from './textures'

export interface Ctx {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  bus: EventBus
  hud: HudStore
  input: Input
  collision: CollisionWorld
  textures: TextureLib
  /** Current settings (replaced wholesale on change; read fresh each time). */
  settings: Settings
  quality: QualityProfile
  /** Game-time clock: `t` stops while paused. `real` never stops. */
  clock: { t: number; real: number }
  /** Report loading progress for the current init step (0..1). */
  progress(fraction: number, label?: string): void

  game: GameApi
  env: IEnvironment
  vegetation: IVegetation
  zones: IZones
  character: ICharacter
  player: IPlayerController
  cameraRig: ICameraRig
  collectibles: ICollectibles
  enemies: IEnemies
  checkpoints: ICheckpoints
  signs: ISigns
  cutscenes: ICutscenes
  fx: IParticles
  ambient: IAmbient
  post: IPostFX
  audio: IAudio
  net: INetwork
  weapons: IWeapons
  worlds: IWorlds
  build: IBuilding
}

/** Base lifecycle. */
export interface System {
  init(): Promise<void> | void
  update(dt: number): void
  dispose(): void
}

/* ────────────────────────────────────────────────────────────
   Game rules (implemented by Game.ts)
   ──────────────────────────────────────────────────────────── */

export interface GameApi {
  readonly phase: GamePhase
  /** Live progress for the current run. Mutate only through the methods below. */
  readonly save: SaveGame
  readonly isTouch: boolean
  /** A Creative game: everything unlocked, no damage, flying (save.mode === 'creative'). */
  readonly creative: boolean
  /** Shards collected so far. */
  shardCount(): number
  collectShard(index: number): void
  collectSpark(index: number): void
  collectHeart(index: number): void
  defeatEnemy(index: number): void
  /** Record the weapons picked up (fists excluded) and the one in hand. */
  setWeapons(owned: readonly WeaponId[], equipped: WeaponId): void
  reachCheckpoint(id: string): void
  /** Called by the player controller when the player falls in the sea / off the world / runs out of HP. */
  playerDied(cause: 'water' | 'fall' | 'enemy'): void
  /** Called by Signs when the player presses interact at the Beacon altar. */
  tryActivateBeacon(): void
  /** Opens a dialog box; resolves when the player closes it. Pauses gameplay meanwhile. */
  showDialog(title: string, lines: string[]): Promise<void>
  setMusic(mood: MusicMood): void
  /** Plays a cutscene with the usual phase handling (gameplay holds still meanwhile); resolves when it ends. */
  playCutscene(name: CutsceneName, arg?: number): Promise<void>
  /** Record a portal map as unlocked (saved at once). */
  unlockMap(id: MapId): void
  /** Record a boss as defeated (saved at once). */
  defeatBoss(id: BossId): void
  /** Short screen shake via the camera rig (respects the setting). */
  shake(intensity: number, duration: number): void
  /** Scale game time by `scale` for `seconds` of real time (hit-stop, slow motion). The strongest request wins. */
  timeWarp(scale: number, seconds: number): void
  /**
   * The UI is capturing text (chat): gameplay input is ignored and losing pointer lock doesn't pause.
   * Call with false when typing ends (then call requestPointerLock from a user gesture if needed).
   */
  setTextEntry(active: boolean): void
}

/* ────────────────────────────────────────────────────────────
   World
   ──────────────────────────────────────────────────────────── */

export type TimeOfDay = 'dusk' | 'night' | 'dawn'

/** world/Environment.ts — terrain mesh + splat material, sea, lakes, sky, sun, fog. */
export interface IEnvironment extends System {
  readonly sun: THREE.DirectionalLight
  /** Unit vector pointing TOWARD the sun (for lens effects / god rays). */
  readonly sunDirection: THREE.Vector3
  /** Smoothly blend lighting/sky to a time of day over `seconds`. */
  setTimeOfDay(tod: TimeOfDay, seconds: number): void
  /** Centre of the follow-shadow frustum (call each frame with the player position). */
  setShadowFocus(p: V3): void
  /**
   * Blend sky, fog, sun and fill light to a map's look over `seconds`. 'isle' restores the
   * island's current time of day; time-of-day changes made meanwhile apply once back there.
   */
  setAtmosphere(map: MapId, seconds: number): void
  /** For effects that want to match the sky (e.g. fog-coloured particles). */
  readonly fogColor: THREE.Color
}

/** world/Vegetation.ts — instanced trees, palms, pines, bushes, rocks, grass, flowers. */
export interface IVegetation extends System {
  /** Trunk colliders are registered with ctx.collision during init. */
  readonly instanceCount: number
}

/** world/zones/index.ts — all hand-built landmarks (pier, village, windmill, grove, ruins, falls, islet, wreck, beacon, checkpoints' lanterns are NOT here). */
export interface IZones extends System {
  /** Beacon lantern world position (shards fly here in the final cutscene). */
  readonly beaconLantern: THREE.Vector3
  /** Altar position the player stands at to activate the beacon. */
  readonly beaconAltar: THREE.Vector3
  /** Light up the beacon (final cutscene calls this). */
  igniteBeacon(): void
}

/* ────────────────────────────────────────────────────────────
   Player
   ──────────────────────────────────────────────────────────── */

export type PlayerState =
  | 'idle' | 'move' | 'jump' | 'doubleJump' | 'fall' | 'land' | 'dash'
  | 'attack' | 'hurt' | 'dead' | 'wade' | 'bounce' | 'cutscene' | 'ragdoll'

/** What the animator needs to pose the character each frame. */
export interface MotionState {
  state: PlayerState
  /** Seconds since entering `state`. */
  stateTime: number
  /** Horizontal speed (m/s). */
  speed: number
  /** Reference speeds for blending. */
  walkSpeed: number
  runSpeed: number
  sprintSpeed: number
  vy: number
  grounded: boolean
  /** Signed yaw rate (rad/s), positive = turning left. Used for leaning into turns. */
  turnRate: number
  /** Downward speed at last landing (m/s). */
  landImpact: number
  /** 0..1 how deep in water the player stands (wading). */
  wading: number
  /** Ground slope under the feet along the facing direction (-1..1, + = uphill). */
  slope: number
}

/** Named one-shot / looping poses used by gameplay and cutscenes. */
export type GestureName = 'wave' | 'cheer' | 'lookUp' | 'raiseShard' | 'kneel' | 'wakeUp' | 'shrug' | 'point'

/** player/Character.ts — loads /games/starfall/hero.glb, owns the Animator. */
export interface ICharacter extends System {
  /** Root the controller positions (feet at origin, faces +Z when rotation.y = 0). */
  readonly root: THREE.Group
  /** World-space position of the right hand (for holding a shard in cutscenes). */
  getHandPosition(out: THREE.Vector3): THREE.Vector3
  /** Head bone world position (camera focus / look-at). */
  getHeadPosition(out: THREE.Vector3): THREE.Vector3
  /**
   * Parent `obj` to a hand's grip so it follows the animation and the ragdoll. The object's own
   * frame is the grip (metres): +Y runs out of the fist on the thumb side, +Z points where the
   * knuckles face.
   */
  holdInHand(side: 'left' | 'right', obj: THREE.Object3D): void
  /** Feed the motion every frame (Game calls this right after the controller). */
  setMotion(m: MotionState): void
  /** Play a gesture; resolves when it ends (looping gestures resolve on stopGesture). */
  playGesture(name: GestureName, opts?: { loop?: boolean; speed?: number }): Promise<void>
  /** Stop the current gesture; `instant` snaps straight back to the base pose (cutscene cuts). */
  stopGesture(opts?: { instant?: boolean }): void
  /**
   * Go limp: a physical ragdoll that starts from the current animated pose, carries the player's
   * velocity plus `impulse` (m/s), collides with the world, settles and then gets back up by itself.
   */
  startRagdoll(impulse: V3): void
  /** True from startRagdoll until the get-up has finished. */
  readonly ragdolling: boolean
  /** True once the get-up has started (the controller may move the capsule to the anchor then). */
  readonly ragdollRecovering: boolean
  /**
   * Under the ragdoll's pelvis: the ground point while it lies on something (where the player stands up),
   * or a point that rises with the body while it is airborne (so the camera follows a thrown body).
   */
  getRagdollAnchor(out: THREE.Vector3): THREE.Vector3
  /** End any ragdoll immediately and snap back to the animated pose (respawns, teleports, cutscenes). */
  cancelRagdoll(): void
  /** Head/eyes look toward a world point (null = natural). */
  lookAt(target: V3 | null): void
  /** Invincibility blink and similar. */
  setBlink(on: boolean): void
  setVisible(v: boolean): void
}

/** player/PlayerController.ts — movement, collision, abilities, health. */
export interface IPlayerController extends System {
  /** Feet position. */
  readonly position: THREE.Vector3
  readonly velocity: THREE.Vector3
  /** Facing yaw (rotation.y; 0 = facing +Z). */
  readonly yaw: number
  readonly state: PlayerState
  readonly hp: number
  readonly maxHp: number
  readonly grounded: boolean
  readonly motion: MotionState
  /** 0..1 dash readiness. */
  readonly dashReady: number
  /** True while invulnerable after a hit. */
  readonly invulnerable: boolean
  /** Capsule radius (m) and height (m). */
  readonly radius: number
  readonly height: number
  /** When false, input is ignored (cutscenes, dialogs) but physics still runs. */
  controlEnabled: boolean
  /** Creative flight (double-tap jump): no gravity, jump rises, descend sinks; touching down ends it. */
  readonly flying: boolean
  teleport(x: number, y: number, z: number, yaw: number): void
  /** Damage from `from` (knockback away from it). Ignored while invulnerable. */
  hurt(amount: number, from: V3): void
  heal(amount: number): void
  /** Restore full HP (respawn / new game). */
  resetHealth(): void
  /** External launch (bounce pads, stomps). */
  launch(vy: number): void
  /** Is the player currently in an attacking spin (enemies take damage)? */
  readonly attacking: boolean
  /** Did the player land on top of something this frame from above (for stomps)? Returns the downward speed or 0. */
  readonly stompSpeed: number
}

/** player/CameraRig.ts — third-person orbit camera with collision; yields to cutscenes. */
export interface ICameraRig extends System {
  /** Camera yaw around the player (radians). Movement is relative to this. */
  readonly yaw: number
  readonly pitch: number
  /** 'follow' = gameplay camera, 'scripted' = cutscene director drives ctx.camera directly, 'title' = slow orbit for menus. */
  mode: 'follow' | 'scripted' | 'title'
  /** Instantly place the camera behind the player. */
  snapBehind(): void
  shake(intensity: number, duration: number): void
  /** Briefly pull the field of view (e.g. dash) — additive degrees. */
  kickFov(deg: number, duration: number): void
}

/* ────────────────────────────────────────────────────────────
   Gameplay
   ──────────────────────────────────────────────────────────── */

/** gameplay/Collectibles.ts — shards, sparks, hearts (meshes, spin/bob, pickup radius). */
export interface ICollectibles extends System {
  readonly sparkTotal: number
  /** Re-sync visibility with ctx.game.save (after loading/continuing). */
  syncWithSave(): void
  /** World position of each shard (uncollected or not). */
  shardPosition(index: number): THREE.Vector3
  /** Hide a shard's world mesh (used when the cutscene takes over). */
  hideShard(index: number): void
}

/** gameplay/Enemies.ts — Gloomlings: wander, chase, hop; stomp or spin to defeat. */
export interface IEnemies extends System {
  syncWithSave(): void
  /** Count alive within radius (for music mood). */
  aliveNear(p: V3, radius: number): number
  /** Freeze AI (cutscenes). */
  frozen: boolean
  /** A weapon blow: every gloomling (and registered target) the sphere touches takes it. Returns how many were hit. */
  hit(h: WeaponHit): number
  /** The closest live gloomling or target within `radius` (written to `out`); false if none. */
  nearest(p: V3, radius: number, out: THREE.Vector3): boolean
  /** Let weapon blows (swings, slams, arrows) strike something else too, e.g. a boss. Returns the unregister function. */
  addTarget(t: HitTarget): () => void
  /** Spawn a temporary gloomling that chases the player at once (boss minions; never saved). False when the pool is full. */
  spawnMinion(x: number, y: number, z: number): boolean
  /** Pop every minion at once (boss reset, travel). */
  clearMinions(): void
  readonly minionCount: number
}

/** Something besides the gloomlings that weapon blows can strike (bosses). */
export interface HitTarget {
  /** Take the blow if its sphere touches you; true when it landed. */
  takeHit(h: WeaponHit): boolean
  /** Point melee swings turn toward (written to `out`); false while not targetable. */
  aimPoint(out: THREE.Vector3): boolean
}

/** A weapon blow against the gloomlings. */
export interface WeaponHit {
  weapon: WeaponId
  center: V3
  radius: number
  damage: number
  /** Horizontal knockback (m/s) away from `from`, and upward launch (m/s). */
  knock: number
  lift: number
  from: V3
  /** Stop after this many gloomlings (an arrow hits one). */
  max?: number
  /** Frost: a surviving gloomling freezes solid for this many seconds. */
  freeze?: number
}

/** Arm moves the animator layers over the body for the held weapon. */
export type WeaponMove = 'none' | 'slash1' | 'slash2' | 'slash3' | 'slam' | 'draw' | 'release'

export interface WeaponPose {
  weapon: WeaponId
  move: WeaponMove
  /** Seconds into `move`. */
  t: number
  /** Bow draw, 0..1. */
  charge: number
}

/** gameplay/Weapons.ts — pickups, the weapon in hand, swings, arrows and the hotbar. */
export interface IWeapons extends System {
  /** Hotbar order, fists first. */
  readonly owned: readonly WeaponId[]
  readonly equipped: WeaponId
  /** A weapon is in hand: the attack button swings it instead of the fists' spin. */
  readonly armed: boolean
  /** Movement speed factor while swinging or drawing (1 = free). */
  readonly moveScale: number
  /** Heading the hero should turn to (aiming, a locked-on swing), or null. */
  readonly aimYaw: number | null
  readonly pose: WeaponPose
  equip(id: WeaponId): void
  /** A reward: own `id` (saved), put it in hand and announce it. */
  grant(id: WeaponId): void
  /** Re-sync owned weapons and pickups with ctx.game.save (new game / continue). */
  syncWithSave(): void
}

/** worlds/Worlds.ts — portal arches, the maps behind them (built on first visit), their bosses and rewards. */
export interface IWorlds extends System {
  readonly current: MapId
  /** A portal fade is running (the player can't act). */
  readonly travelling: boolean
  /** Below this height the player has fallen off the current map. */
  readonly killY: number
  /** Soft wall around the current map's play area. */
  readonly bounds: { x: number; z: number; r: number }
  /** HUD name of the current map; null on the island (its zones name themselves). */
  readonly mapName: string | null
  isUnlocked(id: MapId): boolean
  /** Respawn point inside the current map; null on the island (use the checkpoint). */
  spawnPoint(): { x: number; y: number; z: number; yaw: number } | null
  /** Fade out, build the map on its first visit, move the player there and fade back in. */
  travel(to: MapId): void
  /** Compass markers: awake portals on the island; the boss and the way home elsewhere. */
  compass(p: V3, cameraYaw: number, out: CompassMarker[]): void
  /** What the 'boss' cutscene frames, or null when no fight is waiting. */
  bossIntro(): BossIntro | null
  /** Back on the island with every fight reset (new game / continue / quit to title). */
  syncWithSave(): void
}

export interface BossIntro {
  name: string
  title: string
  /** The boss's face (camera target) and the way it faces. */
  focus: THREE.Vector3
  yaw: number
  /** Cue: the boss wakes and roars. */
  roar(): void
  /** The intro ended or was skipped: the fight begins. */
  begin(): void
}

/** build/Building.ts — the block sandbox: build mode, our blocks and other players', lamps and saving. */
export interface IBuilding extends System {
  /** Build mode: the attack / dash buttons place and break blocks, the wheel and 1–9 / 0 pick one. */
  readonly active: boolean
  setActive(on: boolean): void
  /** Put block type `slot` in hand (the HUD bar's taps). */
  select(slot: number): void
  /** Blocks this player has placed (capped at BLOCK_LIMIT). */
  readonly count: number
  /** Load the current save slot's blocks (new game, continue, Creative). */
  syncWithSave(): void
  /** Write unsaved block changes now. */
  flush(): void
}

/** gameplay/Checkpoints.ts — lantern posts that light up and become respawn points. */
export interface ICheckpoints extends System {
  syncWithSave(): void
  /** Respawn transform for a checkpoint id. */
  spawnPoint(id: string): { x: number; y: number; z: number; yaw: number }
}

/** gameplay/Signs.ts — signposts + the Beacon altar: interact prompts and dialogs. */
export type ISigns = System

/** gameplay/Cutscenes.ts — scripted sequences with letterbox, subtitles, camera shots. */
export interface ICutscenes extends System {
  readonly active: boolean
  readonly current: CutsceneName | null
  /** Plays a cutscene; resolves when it ends or is skipped. `arg` = shard index for 'shard'. */
  play(name: CutsceneName, arg?: number): Promise<void>
  skip(): void
}

/* ────────────────────────────────────────────────────────────
   Effects & audio
   ──────────────────────────────────────────────────────────── */

export type BurstKind =
  | 'dust' | 'land' | 'jump' | 'doubleJump' | 'dash' | 'splash' | 'ripple'
  | 'spark' | 'shard' | 'heart' | 'poof' | 'stomp' | 'hit' | 'checkpoint' | 'bounce' | 'beacon'

/** fx/Particles.ts — pooled GPU particles for one-shot bursts and trails. */
export interface IParticles extends System {
  burst(kind: BurstKind, pos: V3, opts?: { dir?: V3; count?: number; color?: string; scale?: number }): void
  /** A shooting-star style streak from a to b over `duration` seconds (intro/final cutscenes). */
  streak(from: V3, to: V3, duration: number, color?: string): void
}

/** fx/Ambient.ts — fireflies, drifting leaves, pollen, sea spray, waterfall mist. */
export type IAmbient = System

/** fx/PostFX.ts — final render: bloom, vignette, colour grade, FXAA/MSAA; dynamic resolution. */
export interface IPostFX extends System {
  render(dt: number): void
  setSize(width: number, height: number, pixelRatio: number): void
  /** Re-read ctx.quality / ctx.settings. */
  applyQuality(): void
}

export type SfxName =
  | 'ui-hover' | 'ui-click' | 'ui-back' | 'ui-open' | 'pause' | 'resume'
  /** A toggle or segmented control changed · one notch of a slider · an action that isn't available. */
  | 'ui-toggle' | 'ui-tick' | 'ui-error'

/** audio/AudioEngine.ts — synthesised SFX, procedural music & ambience, all WebAudio. */
export interface IAudio extends System {
  /** Must be called from a user gesture before anything is audible. */
  unlock(): void
  /** Re-read volumes from ctx.settings. */
  applySettings(): void
  /** UI sounds (React calls these). */
  ui(name: SfxName): void
  setMusic(mood: MusicMood): void
  /** Pause/resume everything (tab hidden, paused menu ducks instead). */
  setPaused(paused: boolean): void
}

/* ────────────────────────────────────────────────────────────
   Multiplayer
   ──────────────────────────────────────────────────────────── */

export type NetStatus = 'offline' | 'connecting' | 'online' | 'error'

export interface RoomInfo {
  /** Room code: a fixed name for public rooms ('sunset', 'meadow', …), 5 letters for private ones. */
  code: string
  name: string
  public: boolean
  players: number
  max: number
}

/** Another player in the room, as rendered locally (smoothed). */
export interface NetPeer {
  id: string
  name: string
  /** Shirt colour, hex. */
  color: string
  position: THREE.Vector3
  yaw: number
  state: PlayerState
  ragdoll: boolean
  /** The map the peer is in (only peers in the local player's map are drawn). */
  map: MapId
  /** Direct peer-to-peer link (true) or relayed through the server (false). */
  direct: boolean
  /** Round-trip time in ms, or -1 if unknown. */
  ping: number
}

/**
 * net/Network.ts — rooms, presence, chat and replicated players.
 * Supabase Realtime carries rooms, presence, chat and WebRTC signalling;
 * movement goes peer-to-peer over WebRTC data channels, with a low-rate relay fallback.
 * Progress (shards, sparks) stays per player; the world is shared visually.
 */
export interface INetwork extends System {
  readonly status: NetStatus
  readonly room: RoomInfo | null
  readonly selfId: string
  readonly peers: ReadonlyMap<string, NetPeer>
  /** Display name and shirt colour; persisted locally. */
  readonly profile: { name: string; color: string }
  setProfile(p: Partial<{ name: string; color: string }>): void
  /** Public rooms with live player counts. */
  listPublicRooms(): Promise<RoomInfo[]>
  /**
   * Join a room by code. By default an empty room is created; with `{ create: false }` it rejects with
   * Error('No room with that code') when nobody is in it. Rejects with a readable Error on failure (e.g. full).
   */
  join(code: string, opts?: { create?: boolean }): Promise<void>
  /** Join the busiest public room that still has space. */
  quickJoin(): Promise<void>
  /** Create a private room and join it; resolves with its code. */
  createPrivate(): Promise<string>
  leave(): Promise<void>
  sendChat(text: string): void
  sendEmote(name: GestureName): void
  /** Broadcast block edits to the room (`to`: only that player acts on it). False when not connected. */
  sendBlocks(msg: BlockMsg, to?: string): boolean
}

export type { BossId, Collider, MapId, WeaponId }
