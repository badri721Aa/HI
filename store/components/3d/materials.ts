import * as THREE from "three";
import type { Finish } from "@/types";
import { CORNER_HALF, STAR_HALF } from "./core/pattern";

/*
 * The print material: MeshPhysicalMaterial plus a small onBeforeCompile patch
 * that adds what makes a part look printed rather than cast.
 *
 * - Layer lines: a periodic profile on the object-space height, anti-aliased
 *   by fading out as lines approach ~2 px apart (no moiré in thumbnails),
 *   applied as ≤10 % diffuse darkening, roughness modulation and a tiny
 *   normal tilt (which is what gives silk its banded metallic sheen).
 * - Clip: everything above uClipY is discarded; the last ~1.5 mm under the
 *   cut glows in uHotColor (the molten layer under the nozzle). Back faces,
 *   which are only ever seen through the cut or through lattice holes, are
 *   shaded as the wall's cross-section, so walls read as solid.
 * - Mashrabiya: an eight-point-star lattice cut out of the lamp shade on its
 *   cylindrical UVs, with fwidth-based edges and alpha-to-coverage.
 * - Material grain: hash noise in object space (no textures), a slow
 *   brightness drift between bands of layers plus a fine surface grain in
 *   colour and roughness, each faded out before it gets too small to resolve.
 * - Light follows the cursor a little: the shared uMouse uniform tilts the
 *   view direction used for specular and reflections by at most ~10°, so
 *   highlights slide across the piece without the diffuse shading moving.
 *
 * SPACE: uClipY is in OBJECT space (model units, 0 = the base of the piece),
 * so a scaled, rotated or moved product still clips against its own height.
 * ProductMesh sets it as clipHeight × model height.
 */

export type PrintPattern = "none" | "mashrabiya";
export type PrintQuality = "low" | "high";

export interface PrintMaterialOptions {
  color: string;
  finish: Finish;
  /** Real layer height in mm; the shader exaggerates it so lines stay visible but never alias. */
  layerHeight: number;
  /** Lattice cut by the shader. Default "none". The lamp uses "mashrabiya". */
  pattern?: PrintPattern;
  /** "low" for thumbnails (no transmission), "high" for the standalone viewer. Default "low". */
  quality?: PrintQuality;
  /** Layer-line strength 0–1. Default: 0.12 for resin-fine layers (≤ 0.08 mm), else by finish. */
  layerStrength?: number;
}

export interface PrintUniforms {
  /**
   * Object-space Y (model units) above which fragments are discarded (print
   * progress). Any value ≥ PRINT_NO_CLIP (or Infinity) = no clip.
   */
  uClipY: { value: number };
  /** Colour of the glowing "hot" band just under the clip plane. */
  uHotColor: { value: THREE.Color };
  /** Visual layer spacing in model units. */
  uLayer: { value: number };
  /** 0–1 strength of the layer-line shading. */
  uLayerStrength: { value: number };
  uTime: { value: number };
  /** Emissive multiplier of the hot band. */
  uHotIntensity: { value: number };
  /** Thickness of the hot band in model units (default 1.5 mm). */
  uHotBand: { value: number };
  /**
   * Hot trail behind a moving nozzle: x = nozzle angle θ in object space
   * (atan2(z, x)), y = 0–1 amount. At 1 the band burns brightest just behind
   * the nozzle and cools around the perimeter; at 0 it glows evenly.
   */
  uHotTrail: { value: THREE.Vector2 };
  /** Extra emissive light (linear RGB) added everywhere, e.g. a lamp shade lit from inside. */
  uInnerGlow: { value: THREE.Color };
  /** Lattice tiles: x = around (integer), y = rows. */
  uPatternRepeat: { value: THREE.Vector2 };
  /** Lattice band in v (uv.y): [start, end]. */
  uPatternRange: { value: THREE.Vector2 };
}

export interface PrintMaterialState {
  uniforms: PrintUniforms;
  finish: Finish;
  pattern: PrintPattern;
  quality: PrintQuality;
}

export type PrintMaterial = THREE.MeshPhysicalMaterial & { userData: PrintMaterialState };

/** Clip value meaning "not clipping". */
export const PRINT_NO_CLIP = 1e6;

/** Default hot-band colour: the brand's glow token (#7DE3EE). */
export const HOT_COLOR = "#7de3ee";

const MM = 0.01;

/**
 * Smoothed pointer, -1…1 on each axis (y down), shared by every print
 * material. SceneRoot writes it each frame; it stays at 0 for touch input
 * and under reduced motion.
 */
export const printPointer = { value: new THREE.Vector2(0, 0) };

/** Specular tilt per unit of pointer offset: tan(10°). */
const POINTER_TILT = 0.176;
/** Height of a brightness-drift band and size of a grain cell (model units). */
const DRIFT_BAND = 2.4 * MM;
const GRAIN_CELL = 1.2 * MM;

/** Visual layer spacing in model units: clamp(layerHeight × 3, 0.45 mm, 1.2 mm). */
export function layerSpacing(layerHeight: number): number {
  return Math.min(Math.max(layerHeight * 3, 0.45), 1.2) * MM;
}

function defaultLayerStrength(finish: Finish, layerHeight: number): number {
  if (layerHeight <= 0.08) return 0.12;
  if (finish === "silk") return 0.5;
  if (finish === "translucent") return 0.4;
  return 0.6;
}

/* -------------------------------------------------------------------------- */
/* GLSL                                                                       */
/* -------------------------------------------------------------------------- */

const f = (n: number) => n.toFixed(6);

const VERT_DECL = /* glsl */ `
varying vec3 vPrintPos;
varying vec2 vPrintUv;
varying vec3 vPrintUp;
varying float vPrintNy;
`;

const VERT_NORMAL = /* glsl */ `
vPrintNy = objectNormal.y;
vPrintUp = normalize( normalMatrix * vec3( 0.0, 1.0, 0.0 ) );
`;

const VERT_POS = /* glsl */ `
vPrintPos = transformed;
vPrintUv = uv;
`;

const PATTERN_FN = /* glsl */ `
#ifdef PRINT_PATTERN
uniform vec2 uPatternRepeat;
uniform vec2 uPatternRange;
// Signed distance in tile units to the eight-point-star lattice (> 0 = solid).
// Mirrors latticeSdf() in core/pattern.ts.
float printLattice( vec2 uv ) {
  float rows = uPatternRepeat.y;
  vec2 c = vec2( uv.x * uPatternRepeat.x, ( uv.y - uPatternRange.x ) / ( uPatternRange.y - uPatternRange.x ) * rows );
  if ( c.y < 0.0 ) return -c.y;
  if ( c.y > rows ) return c.y - rows;
  vec2 q = abs( fract( c ) - 0.5 );
  float star = min( max( q.x, q.y ), ( q.x + q.y ) * 0.70710678 ) - ${f(STAR_HALF)};
  vec2 k = c - floor( c + 0.5 );
  float cornerRow = floor( c.y + 0.5 );
  float corner = max( abs( k.x ), abs( k.y ) ) - ${f(CORNER_HALF)};
  if ( cornerRow < 0.5 || cornerRow > rows - 0.5 ) corner = 1.0;
  return min( star, corner );
}
#endif
`;

const NOISE_FN = /* glsl */ `
// Hashes without sine (stable precision on mobile GPUs).
float printHash11( float p ) {
  p = fract( p * 0.1031 );
  p *= p + 33.33;
  p *= p + p;
  return fract( p );
}
float printHash13( vec3 p3 ) {
  p3 = fract( p3 * 0.1031 );
  p3 += dot( p3, p3.zyx + 31.32 );
  return fract( ( p3.x + p3.y ) * p3.z );
}
float printValue1( float x ) {
  float i = floor( x );
  float u = fract( x );
  return mix( printHash11( i ), printHash11( i + 1.0 ), u * u * ( 3.0 - 2.0 * u ) );
}
float printValue3( vec3 p ) {
  vec3 i = floor( p );
  vec3 u = fract( p );
  u = u * u * ( 3.0 - 2.0 * u );
  return mix(
    mix( mix( printHash13( i ), printHash13( i + vec3( 1, 0, 0 ) ), u.x ),
         mix( printHash13( i + vec3( 0, 1, 0 ) ), printHash13( i + vec3( 1, 1, 0 ) ), u.x ), u.y ),
    mix( mix( printHash13( i + vec3( 0, 0, 1 ) ), printHash13( i + vec3( 1, 0, 1 ) ), u.x ),
         mix( printHash13( i + vec3( 0, 1, 1 ) ), printHash13( i + vec3( 1, 1, 1 ) ), u.x ), u.y ),
    u.z );
}
`;

const FRAG_DECL = /* glsl */ `
uniform float uClipY;
uniform vec3 uHotColor;
uniform float uHotIntensity;
uniform float uHotBand;
uniform vec2 uHotTrail;
uniform float uLayer;
uniform float uLayerStrength;
uniform float uTime;
uniform vec3 uInnerGlow;
uniform vec2 uMouse;
varying vec3 vPrintPos;
varying vec2 vPrintUv;
varying vec3 vPrintUp;
varying float vPrintNy;
${PATTERN_FN}
${NOISE_FN}
`;

const FRAG_MAIN = /* glsl */ `
  // Screen-space derivatives first: they must be taken in uniform control flow.
  float printDy = fwidth( vPrintPos.y );
  vec2 printInfillQ = vec2( vPrintPos.x + vPrintPos.z, vPrintPos.x - vPrintPos.z ) * ( 0.70710678 / ${f(4 * MM)} );
  float printInfillAa = max( fwidth( printInfillQ.x ), 1.0e-5 );
  float printSpan = max( printDy, max( fwidth( vPrintPos.x ), fwidth( vPrintPos.z ) ) );
  #ifdef PRINT_PATTERN
    float printSd = printLattice( vPrintUv );
    float printAa = max( fwidth( printSd ), 1.0e-5 ) * 0.75;
  #endif

  // Print progress: nothing above the clip plane exists yet.
  if ( vPrintPos.y > uClipY ) discard;
  float printClipOn = 1.0 - step( 1.0e5, uClipY );
  float printBelow = uClipY - vPrintPos.y;
  float printBand = max( uHotBand, printDy * 1.5 );
  float printHot = printClipOn * ( 1.0 - smoothstep( 0.0, printBand, printBelow ) );

  #ifdef PRINT_PATTERN
    float printCov = smoothstep( -printAa, printAa, printSd );
    if ( printCov < 0.004 ) discard;
    diffuseColor.a *= printCov;
  #endif

  // Layer lines on walls only (fade on horizontal faces), faded out before they alias.
  float printWall = 1.0 - smoothstep( 0.72, 0.96, abs( vPrintNy ) );
  float printPx = uLayer / max( printDy, 1.0e-6 );
  float printLayerAmt = uLayerStrength * printWall * smoothstep( 2.0, 4.0, printPx );
  float printPhase = 6.28318530718 * vPrintPos.y / uLayer;
  float printSeam = 0.5 + 0.5 * cos( printPhase );
  // Each layer's line is a little deeper or shallower than the next.
  float printGroove = printSeam * printSeam * ( 0.7 + 0.6 * printHash11( floor( vPrintPos.y / uLayer + 0.5 ) ) );
  diffuseColor.rgb *= 1.0 - 0.1 * printLayerAmt * printGroove;

  // Material grain: a slow drift between bands of layers and a fine grain,
  // faded out before they shrink below ~3 px (no shimmer at small sizes).
  float printDrift = ( printValue1( vPrintPos.y / ${f(DRIFT_BAND)} ) - 0.5 )
    * ( 1.0 - smoothstep( 0.2, 0.4, printDy / ${f(DRIFT_BAND)} ) );
  float printGrain = ( printValue3( vPrintPos / ${f(GRAIN_CELL)} ) - 0.5 )
    * ( 1.0 - smoothstep( 0.3, 0.6, printSpan / ${f(GRAIN_CELL)} ) );
  diffuseColor.rgb *= 1.0 + 0.05 * printDrift + 0.06 * printGrain;

  #ifdef DOUBLE_SIDED
    // Back faces are only visible through the cut or a lattice hole: shade
    // them as the part's cross-section. While printing, a 45° infill grid
    // shows inside solid parts and the freshest ~2 mm of wall glows.
    if ( ! gl_FrontFacing ) {
      vec2 printCell = abs( fract( printInfillQ ) - 0.5 );
      float printLine = 1.0 - smoothstep( 0.07 - printInfillAa, 0.07 + printInfillAa, 0.5 - max( printCell.x, printCell.y ) );
      printLine *= 1.0 - smoothstep( 0.15, 0.6, printInfillAa );
      diffuseColor.rgb *= mix( 0.55, 0.9, printLine * printClipOn );
      printHot = max( printHot, printClipOn * ( 1.0 - smoothstep( 0.0, printBand * 1.4, printBelow ) ) );
    }
  #endif
`;

const FRAG_ROUGH = /* glsl */ `
  roughnessFactor = clamp( roughnessFactor + printLayerAmt * 0.14 * ( printGroove - 0.4 ) + 0.08 * printGrain, 0.03, 1.0 );
`;

/* The view direction the lights see, tilted towards the cursor (specular and reflections only). */
const VIEW_DIR_LINE = "vec3 geometryViewDir = ( isOrthographic ) ? vec3( 0, 0, 1 ) : normalize( vViewPosition );";
const VIEW_DIR_TILT = /* glsl */ `
{
  vec2 printM = uMouse;
  float printMl = length( printM );
  if ( printMl > 1.0 ) printM /= printMl;
  geometryViewDir = normalize( geometryViewDir + vec3( printM.x, - printM.y, 0.0 ) * ${f(POINTER_TILT)} );
}
`;

const FRAG_NORMAL = /* glsl */ `
  {
    // Tilt the normal along the bead profile: d(groove)/d(phase).
    vec3 printT = vPrintUp - normal * dot( normal, vPrintUp );
    float printTl = length( printT );
    if ( printTl > 1.0e-4 && printLayerAmt > 0.0 ) {
      float printSlope = - sin( printPhase ) * printSeam;
      normal = normalize( normal + ( printT / printTl ) * printSlope * 0.22 * printLayerAmt );
    }
  }
`;

const FRAG_EMISSIVE = /* glsl */ `
  totalEmissiveRadiance += uInnerGlow;
  float printFlicker = 0.94 + 0.06 * sin( uTime * 9.0 + ( vPrintPos.x + vPrintPos.z ) * 60.0 );
  float printBehind = mod( uHotTrail.x - atan( vPrintPos.z, vPrintPos.x ), 6.28318530718 );
  float printTrail = mix( 1.0, 0.22 + 1.5 * exp( -printBehind * 1.6 ), uHotTrail.y );
  totalEmissiveRadiance += uHotColor * ( printHot * uHotIntensity * printFlicker * printTrail );
`;

function patch(src: string, anchor: string, add: string, after = true): string {
  if (!src.includes(anchor)) {
    // Fail loudly in development: a three.js upgrade moved a chunk.
    if (process.env.NODE_ENV !== "production") console.error(`[print-material] shader anchor not found: ${anchor}`);
    return src;
  }
  return src.replace(anchor, after ? `${anchor}\n${add}` : `${add}\n${anchor}`);
}

/** Expands `#include <name>` so a line inside the chunk can be patched. */
function replaceInclude(src: string, name: keyof typeof THREE.ShaderChunk, edit: (chunk: string) => string): string {
  const include = `#include <${name}>`;
  if (!src.includes(include)) {
    if (process.env.NODE_ENV !== "production") console.error(`[print-material] shader include not found: ${include}`);
    return src;
  }
  return src.replace(include, edit(THREE.ShaderChunk[name]));
}

/* -------------------------------------------------------------------------- */
/* Finishes                                                                   */
/* -------------------------------------------------------------------------- */

const WHITE = new THREE.Color(1, 1, 1);

/** Keeps colours that derive from the base colour (sheen, attenuation, glow) in sync. */
export function syncPrintColors(m: PrintMaterial): void {
  const { finish, quality } = m.userData;
  if (finish === "silk") m.sheenColor.copy(m.color).lerp(WHITE, 0.45);
  if (finish === "translucent") {
    m.attenuationColor.copy(m.color);
    if (quality === "low") m.emissive.copy(m.color).multiplyScalar(0.1);
  }
}

/** Sets the base colour (any three.js colour input) without recompiling. */
export function setPrintColor(m: PrintMaterial, color: THREE.ColorRepresentation): void {
  m.color.set(color);
  syncPrintColors(m);
}

/**
 * Applies a finish. Parameter-only changes never recompile; switching to a
 * finish that turns on a different shader feature (sheen, clearcoat,
 * transmission) is flagged with needsUpdate by three.js itself.
 */
export function applyFinish(m: PrintMaterial, finish: Finish, quality: PrintQuality = m.userData.quality): void {
  m.userData.finish = finish;
  m.userData.quality = quality;
  // Reset to matte defaults, then layer the finish on top.
  m.roughness = 0.78;
  m.metalness = 0;
  m.sheen = 0;
  m.clearcoat = 0;
  m.clearcoatRoughness = 0.2;
  m.transmission = 0;
  m.thickness = 0;
  m.attenuationDistance = Infinity;
  m.ior = 1.5;
  m.specularIntensity = 1;
  m.transparent = false;
  m.opacity = 1;
  m.depthWrite = true;
  m.emissive.setRGB(0, 0, 0);
  m.envMapIntensity = 0.85;
  const lattice = m.userData.pattern !== "none";
  m.side = THREE.DoubleSide;

  if (finish === "silk") {
    m.roughness = 0.3;
    m.metalness = 0.35;
    m.sheen = 0.6;
    m.sheenRoughness = 0.35;
    m.clearcoat = 0.4;
    m.clearcoatRoughness = 0.22;
    m.envMapIntensity = 1.15;
  } else if (finish === "translucent") {
    // Transmission / blending look wrong on back faces, and nothing here needs them.
    m.side = lattice ? THREE.DoubleSide : THREE.FrontSide;
    m.roughness = 0.22;
    m.envMapIntensity = 1;
    if (quality === "high") {
      m.transmission = 0.55;
      m.thickness = 0.12;
      m.ior = 1.5;
      m.attenuationDistance = 0.6;
    } else {
      m.transparent = true;
      m.opacity = 0.85;
    }
  }
  syncPrintColors(m);
}

/* -------------------------------------------------------------------------- */
/* Factory                                                                    */
/* -------------------------------------------------------------------------- */

function makeUniforms(layerHeight: number, strength: number): PrintUniforms {
  return {
    uClipY: { value: PRINT_NO_CLIP },
    uHotColor: { value: new THREE.Color(HOT_COLOR) },
    uLayer: { value: layerSpacing(layerHeight) },
    uLayerStrength: { value: strength },
    uTime: { value: 0 },
    uHotIntensity: { value: 2.4 },
    uHotBand: { value: 1.5 * MM },
    uHotTrail: { value: new THREE.Vector2(0, 0) },
    uInnerGlow: { value: new THREE.Color(0, 0, 0) },
    uPatternRepeat: { value: new THREE.Vector2(14, 6) },
    uPatternRange: { value: new THREE.Vector2(0.15, 0.95) },
  };
}

export function createPrintMaterial(opts: PrintMaterialOptions): PrintMaterial {
  const pattern = opts.pattern ?? "none";
  const quality = opts.quality ?? "low";
  const strength = opts.layerStrength ?? defaultLayerStrength(opts.finish, opts.layerHeight);
  const m = new THREE.MeshPhysicalMaterial({ color: opts.color }) as PrintMaterial;
  const uniforms = makeUniforms(opts.layerHeight, strength);
  m.userData = { uniforms, finish: opts.finish, pattern, quality };
  if (pattern !== "none") {
    m.defines = { ...m.defines, PRINT_PATTERN: "" };
    // Smooth lattice edges under MSAA; the shadow pass treats this as alphaTest 0.5.
    m.alphaToCoverage = true;
  }
  applyFinish(m, opts.finish, quality);

  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.uniforms.uMouse = printPointer;
    let vs = shader.vertexShader;
    vs = patch(vs, "#include <common>", VERT_DECL);
    vs = patch(vs, "#include <beginnormal_vertex>", VERT_NORMAL);
    vs = patch(vs, "#include <begin_vertex>", VERT_POS);
    shader.vertexShader = vs;
    let fs = shader.fragmentShader;
    fs = patch(fs, "#include <common>", FRAG_DECL);
    fs = patch(fs, "vec4 diffuseColor = vec4( diffuse, opacity );", FRAG_MAIN);
    fs = patch(fs, "#include <roughnessmap_fragment>", FRAG_ROUGH);
    fs = patch(fs, "#include <normal_fragment_maps>", FRAG_NORMAL);
    fs = patch(fs, "#include <emissivemap_fragment>", FRAG_EMISSIVE);
    fs = replaceInclude(fs, "lights_fragment_begin", (chunk) => patch(chunk, VIEW_DIR_LINE, VIEW_DIR_TILT));
    shader.fragmentShader = fs;
  };
  // One program per variant of the injected code (the pattern adds a define;
  // finish and quality change which physical features are compiled in).
  m.customProgramCacheKey = () => `lu-print-v2:${pattern}:${m.userData.finish}:${m.userData.quality}`;
  return m;
}

/**
 * Depth material for shadow maps that honours the clip plane and the lattice
 * (so a half-printed piece casts a half shadow and the lamp throws its star
 * pattern). Shares the uniforms of `source`; assign it to mesh.customDepthMaterial.
 */
export function createPrintDepthMaterial(source: PrintMaterial): THREE.MeshDepthMaterial {
  const { uniforms, pattern } = source.userData;
  const m = new THREE.MeshDepthMaterial();
  if (pattern !== "none") m.defines = { ...m.defines, PRINT_PATTERN: "" };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = patch(
      patch(shader.vertexShader, "#include <common>", "varying vec3 vPrintPos;\nvarying vec2 vPrintUv;"),
      "#include <begin_vertex>",
      "vPrintPos = transformed;\nvPrintUv = uv;",
    );
    shader.fragmentShader = patch(
      patch(
        shader.fragmentShader,
        "#include <common>",
        `uniform float uClipY;\nvarying vec3 vPrintPos;\nvarying vec2 vPrintUv;\n${PATTERN_FN}`,
      ),
      "#include <clipping_planes_fragment>",
      `if ( vPrintPos.y > uClipY ) discard;\n#ifdef PRINT_PATTERN\nif ( printLattice( vPrintUv ) < 0.0 ) discard;\n#endif`,
    );
  };
  m.customProgramCacheKey = () => `lu-print-depth-v1:${pattern}`;
  return m;
}

/* -------------------------------------------------------------------------- */
/* Hot-band halo                                                              */
/* -------------------------------------------------------------------------- */

const HALO_VERT = /* glsl */ `
uniform float uHaloGrow;
varying float vHaloY;
varying vec3 vHaloNormal;
varying vec3 vHaloView;
void main() {
  vHaloY = position.y;
  vec4 mv = modelViewMatrix * vec4( position + normal * uHaloGrow, 1.0 );
  vHaloNormal = normalize( normalMatrix * normal );
  vHaloView = - mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

const HALO_FRAG = /* glsl */ `
uniform float uClipY;
uniform vec3 uHotColor;
uniform float uHaloWidth;
uniform float uHaloStrength;
varying float vHaloY;
varying vec3 vHaloNormal;
varying vec3 vHaloView;
void main() {
  if ( uClipY > 1.0e5 ) discard;
  float d = ( vHaloY - uClipY ) / uHaloWidth;
  float band = exp( - d * d );
  float rim = 1.0 - abs( dot( normalize( vHaloNormal ), normalize( vHaloView ) ) );
  float a = band * ( 0.3 + 0.7 * rim * rim ) * uHaloStrength;
  if ( a < 0.002 ) discard;
  gl_FragColor = vec4( uHotColor, a );
  #include <colorspace_fragment>
}
`;

export type HaloMaterial = THREE.ShaderMaterial & { uniforms: { uHaloStrength: { value: number } } };

/**
 * A cheap bloom stand-in for the hot band: the piece's own geometry, pushed
 * out a little along its normals and drawn additively in the hot colour,
 * fading away above and below the cut and brightest towards the silhouette
 * (a fresnel shell). Shares uClipY and uHotColor with `source`; drive
 * uHaloStrength (0 = off) per frame and hide the mesh when it is 0.
 */
export function createHotHaloMaterial(source: PrintMaterial): HaloMaterial {
  const { uClipY, uHotColor } = source.userData.uniforms;
  return new THREE.ShaderMaterial({
    vertexShader: HALO_VERT,
    fragmentShader: HALO_FRAG,
    uniforms: {
      uClipY,
      uHotColor,
      uHaloGrow: { value: 1.2 * MM },
      uHaloWidth: { value: 3.5 * MM },
      uHaloStrength: { value: 0 },
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  }) as HaloMaterial;
}

/** Points the lattice uniforms at a lamp's layout (see getModelInfo().lamp.pattern). */
export function setPrintPattern(m: PrintMaterial, repeat: readonly [number, number], range: readonly [number, number]): void {
  m.userData.uniforms.uPatternRepeat.value.set(repeat[0], repeat[1]);
  m.userData.uniforms.uPatternRange.value.set(range[0], range[1]);
}

/** Sets the clip plane from a 0–1 fraction of `height` (object space); null/undefined = off. */
export function setPrintClip(m: PrintMaterial, fraction: number | null | undefined, height: number): void {
  m.userData.uniforms.uClipY.value =
    fraction === null || fraction === undefined || !Number.isFinite(fraction) || fraction >= 1
      ? PRINT_NO_CLIP
      : Math.max(fraction, 0) * height;
}
