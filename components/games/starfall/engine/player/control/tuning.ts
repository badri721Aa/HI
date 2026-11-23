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
  /** On 'ice' every ground acceleration, braking and grip is scaled by this (actual ice-skating). */
  iceGrip: 0.12,
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

  // ── Creative flight
  /** Second jump press within this many seconds toggles flight. */
  flyTapWindow: 0.3,
  flySpeed: 9,
  flyFastSpeed: 20,
  flyClimb: 6,
  flyFastClimb: 12,
  /** How quickly flight velocity follows the input (1/s). */
  flyAccel: 6,
  /** No climbing above this height. */
  flyCeiling: 320,

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

  // ── ragdoll
  /** Landings harder than this (m/s) knock the hero flat instead (a fall of ~7.5 m). */
  ragdollImpact: 24,
  /** Flopping on demand: a forward shove and a little hop on top of the current velocity (m/s). */
  ragdollPush: 1.8,
  ragdollHop: 2.4,
  /** Share of the knockback a hit gives a body that is already limp. */
  ragdollHitKick: 0.6,
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
  /** Pulled in closer than closeFrom, the camera rises up to closeLift so the hero's head drops out of the middle of the view. */
  closeFrom: 3,
  closeLift: 0.3,
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
  /** Hand-overs from farther away than this (m) cut instead of swooping across the island. */
  maxGlide: 30,
  /** Slide: extra field of view (°) and how far the view sinks with the hero (m). */
  slideFov: 3,
  slideDrop: 0.3,
  /** Wall-run: extra field of view (°) and the roll away from the wall (rad; only with camera shake on). */
  wallFov: 4,
  wallTilt: 0.075,
  /** How quickly those cues ease in and out (1/s). */
  cueRate: 5,

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

/** The dodge-roll: a short committed tumble along the ground. */
export const ROLL = {
  time: 0.56,
  /** Ready again this long after one ends (s). */
  cooldown: 0.4,
  /** Speed at the start and at the end (m/s); it eases from one to the other through the roll. */
  speed: 8.4,
  endSpeed: 4.6,
  /** Nothing can hurt the hero between these moments of the roll (s). */
  invulnFrom: 0.08,
  invulnTo: 0.38,
  /** A jump press is taken from here on (s): it cuts the recovery short. */
  jumpFrom: 0.42,
  /** Speed kept when it ends with the stick at rest (m/s). */
  exitIdle: 3,
  /** Body height (m) while rolling or sliding: shots at chest height pass over. */
  height: 0.85,
} as const

/** The sprint slide (the low button at speed). Sliding down ground too steep to stand on is MOVE.slide*. */
export const SLIDE = {
  /** Slowest ground speed that can drop into a slide (m/s): faster than a run, so it takes a sprint. */
  enterSpeed: 6.4,
  /** Speed added on the way down (m/s), up to `boostMax`. */
  boost: 1.2,
  boostMax: 9.8,
  /** Braking on the flat (m/s²) and the extra when the stick is pulled back. */
  friction: 4.2,
  brake: 9,
  /** Pull of a slope along the ground (m/s² per unit of sin·cos of its angle). */
  gravity: 24,
  maxSpeed: 13,
  /** How fast the stick turns the slide (rad/s at full deflection). */
  steer: 1.25,
  /** It ends below this speed (m/s), but never before `minTime` (s). */
  endSpeed: 3.2,
  minTime: 0.3,
  /** Ready again this long after one ends (s). */
  cooldown: 0.7,
  /** The low press is remembered this long (s): pressed in the air, it slides on touchdown. */
  buffer: 0.18,
  /** Jumping out: a long, low leap. Lift (m/s), speed gained (×) and its floor and ceiling (m/s). */
  jumpSpeed: 7.4,
  jumpBoost: 1.3,
  jumpMin: 12,
  jumpMax: 14,
} as const

/** Running along a wall. */
export const WALLRUN = {
  /** Longest run (s), and the pause before another wall can be caught (s). */
  time: 1.2,
  cooldown: 0.25,
  /** Slowest horizontal speed that catches a wall (m/s); the run holds at least `speed`, at most `maxSpeed`. */
  minSpeed: 5,
  speed: 7.2,
  maxSpeed: 9.5,
  /** A glancing approach only: the heading may point at most this far into the wall (sine of the angle). */
  maxInto: 0.8,
  /** Falling faster than this (m/s) is too fast to catch a wall. */
  maxFall: 9,
  /** The arc: vertical speed at the start (m/s) and gravity while running (m/s²). */
  rise: 2.6,
  gravity: 5.2,
  /** Feelers: heights above the feet (m), reach beyond the capsule (m), and how far ahead the wall must go on (m). */
  feelLow: 0.4,
  feelHigh: 1.3,
  reach: 0.45,
  ahead: 0.7,
  /** Gap kept between the capsule and the wall (m). */
  gap: 0.04,
  /** Terrain is a wall when its normal.y is at most this (58° or steeper). */
  maxNy: 0.53,
  /** Round colliders thinner than this (m) are posts and trunks, not walls. */
  minRadius: 2,
  /** The feet must be this far above walkable ground to start (m). */
  minHeight: 0.35,
  /** Steering away from the wall for this long (s) lets go of it. */
  letGo: 0.16,
  /** Kick-off: speed away from the wall (m/s), share of the run's speed kept along it, and the lift (m/s). */
  kickOut: 6.2,
  kickKeep: 0.75,
  kickUp: 8.4,
  /** Two walls count as the same one when their normals are within this (cosine of the angle). */
  sameWall: 0.8,
} as const
