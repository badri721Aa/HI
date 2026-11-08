/**
 * Feel knobs for the hero and the gameplay camera, in one place.
 * Units: metres, seconds, radians (FOV in degrees).
 */

export const MOVE = {
  radius: 0.35,
  height: 1.6,
  maxHp: 5,

  // ── ground locomotion
  walkSpeed: 2.2,
  runSpeed: 5.6,
  sprintSpeed: 8.6,
  /** Stick magnitude below this is ignored. */
  deadzone: 0.05,
  /** On a gamepad, holding the stick past this tilt for padSprintDelay seconds sprints. */
  padSprintTilt: 0.94,
  padSprintDelay: 0.45,
  accel: 40,
  decel: 45,
  /** Braking while reversing direction — makes turnarounds snappy. */
  turnAccel: 90,
  /** How fast sideways velocity dies on the ground (tight curves, no ice-skating). */
  grip: 60,
  /** Speed lost walking up slopes, at full tilt (fraction). */
  uphillSlow: 0.3,

  // ── facing
  /** Exponential approach of the facing yaw (1/s) and its max rate (rad/s). */
  turnSharp: 16,
  turnRate: 20,
  airTurnScale: 0.55,

  // ── air
  airControl: 0.45,
  /** Horizontal slow-down in the air without input (m/s²). */
  airDrag: 5,
  jumpSpeed: 9.2,
  doubleJumpSpeed: 8.6,
  /** With exact (trapezoidal) integration: apex = jumpSpeed² / 2·gravityUp ≈ 1.57 m (+ a little apex hang). */
  gravityUp: 27,
  gravityDown: 38,
  /** Near the apex (|vy| below band) while jump is held, gravity is scaled for a little hang time. */
  apexBand: 1.2,
  apexGravity: 0.7,
  /** Releasing jump early multiplies the rising speed by this (variable height). */
  jumpCut: 0.45,
  terminal: 32,
  coyote: 0.12,
  jumpBuffer: 0.13,
  /** Dash / attack presses are remembered this long. */
  actionBuffer: 0.12,
  /** Air poses switch to 'fall' once vy drops below this. */
  fallAfterVy: -3,
  /** Short drops (stairs, kerbs) keep the ground pose this long before 'fall'. */
  fallDelay: 0.14,

  // ── dash
  dashSpeed: 17,
  dashTime: 0.2,
  dashCooldown: 0.75,
  dashGravity: 0.15,
  /** Vertical speed kept / granted when dashing in the air. */
  dashAirKeep: 0.3,
  dashAirLift: 1.2,
  dashExit: 7,
  dashExitIdle: 3.5,
  /** Horizontal speed carried into a jump that cancels a dash. */
  dashJump: 9.4,
  dashFovKick: 6,

  // ── spin attack
  attackTime: 0.45,
  attackCooldown: 0.35,
  attackMove: 0.4,
  /** Small hop the first time you spin in each airtime. */
  attackAirLift: 3,

  // ── collision
  stepUp: 0.45,
  airStepUp: 0.3,
  snapDown: 0.5,
  maxSubstep: 0.25,
  /** Terrain is walkable while normal.y ≥ this; steeper ground slides. */
  walkableNy: 0.68,
  /** Leave a slide only once the ground is clearly gentler (hysteresis). */
  slideExitNy: 0.72,
  slideAccel: 16,
  slideSteer: 5,
  slideMax: 11,

  // ── water
  splashDepth: 0.2,
  wadeMin: 0.25,
  wadeMax: 1.1,
  drownDepth: 1.25,
  wadeSlow: 0.6,
  wadeInterval: 0.5,

  // ── damage
  knockback: 7,
  knockbackUp: 5,
  hurtTime: 0.35,
  invulnTime: 1.3,

  // ── feedback (stride lengths match the animator's gait)
  /** Shuffling steps when creeping, growing to the walk stride at walkSpeed. */
  stepMin: 0.45,
  stepWalk: 0.75,
  stepRun: 1.25,
  stepSprint: 1.6,
  /** Wading shortens the stride by up to this fraction. */
  stepWadeShorten: 0.25,
  /** Landings harder than this (m/s) play the 'land' state. */
  landStateImpact: 4,
} as const

export const CAM = {
  /** Orbit pivot above the feet (upper chest). */
  pivotHeight: 1.45,
  /** The view aims this far above the pivot so the hero sits a little low in frame. */
  lookLift: 0.3,
  distance: 6.2,
  zoomMin: 3.2,
  zoomMax: 10,
  /** Metres per unit of input.state.zoom. */
  zoomStep: 1,
  pitchMin: -0.35,
  pitchMax: 1.15,
  defaultPitch: 0.3,

  // ── follow smoothing (1/s)
  followRate: 18,
  vFollowGround: 10,
  vFollowAir: 4,
  vFollowFall: 12,
  /** While airborne the view only rises once the hero is this far above the take-off height. */
  airRise: 2,
  /** Hard limit on vertical lag so the hero never leaves the frame. */
  maxVLag: 2.4,

  // ── boom collision
  margin: 0.3,
  minDist: 1,
  /** How quickly the boom extends again after an obstruction clears (1/s). */
  boomOutRate: 3.5,
  groundClear: 0.6,
  waterClear: 0.35,

  // ── look-ahead assist
  assistDelay: 1.2,
  assistRate: 0.6,
  pitchRelax: 0.35,

  // ── effects
  sprintFov: 7,
  shakeFreq: 14,
  shakeRot: 0.045,
  shakeMove: 0.12,
  /** Seconds to glide from a cutscene / menu camera into the gameplay camera. */
  handover: 0.6,

  // ── title
  /** Start angle relative to the hero's facing (0 = straight in front). */
  titleAngle: 0.55,
  titleSpin: 0.045,
  titleRadius: 7.5,
  titleHeight: 1.15,
  titleLookY: 1.0,
  /** Sideways aim offset so the hero sits on the right third (menus are bottom-left). */
  titleSide: 1.9,
  titleFovOffset: -10,
} as const
