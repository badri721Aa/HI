/**
 * The Glitch Grid's materials (the geometry layouts they read are in glitchGeo.ts):
 *
 *   floorMaterial   glossy black slabs traced with a crisp 2 m grid: lit rims, light packets
 *                   running along the lines, the horizon and the pylons mirrored in the polish.
 *                   Its tile variant phases in and out per instance.
 *   wireMaterial    additive line art on flat strips: lattice masts and light beams
 *   shardMaterial   instanced boxes: data cubes, half-loaded fragments, the glyph monolith
 *   domeMaterial    the scanline horizon all around
 *   voidMaterial    the faint grid far below (the kill floor)
 *   moteMaterial    square motes of light rising round the camera
 *
 * Every line is anti-aliased from its screen footprint (fwidth) and dims instead of sparkling
 * when it gets thinner than a pixel. Nothing here divides by, normalises or takes a root of a
 * value that can reach zero, and every output is clamped.
 */
import * as THREE from 'three'
import type { Ctx } from '../types'

/**
 * The shaders' clock wraps here (s) so it stays precise through a long session. Every period in
 * the shaders divides it, so nothing jumps at the wrap.
 */
export const TIME_WRAP = 1680

export const CYAN = '#22e4f2'
export const MAGENTA = '#ff2bd0'

/** Uniforms every Glitch Grid material shares (one object each, so one update reaches them all). */
export interface GlitchUniforms {
  /** Game clock, wrapped at TIME_WRAP. */
  uTime: { value: number }
  /** The map's centre (x, z): patterns are laid out from it, where floats are precise. */
  uOrigin: { value: THREE.Vector2 }
  uCyan: { value: THREE.Color }
  uMagenta: { value: THREE.Color }
}

export function glitchUniforms(center: { x: number; z: number }): GlitchUniforms {
  return {
    uTime: { value: 0 },
    uOrigin: { value: new THREE.Vector2(center.x, center.z) },
    uCyan: { value: new THREE.Color(CYAN) },
    uMagenta: { value: new THREE.Color(MAGENTA) },
  }
}

/** Integer-lattice hash in [0, 1): no trig, so it is the same on every GPU. */
const HASH = /* glsl */ `
float glHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}`

/**
 * Light from a line of half-width w seen d away from its middle, where a pixel covers aa (same
 * unit, aa > 0). Thinner than a pixel, the line is drawn a pixel wide and dimmer: the same light.
 */
const LINE = /* glsl */ `
float glLine(float d, float w, float aa) {
  float hw = max(w, aa);
  return (1.0 - smoothstep(hw - aa, hw + aa, d)) * (w / hw);
}`

/** The glow hugging the horizon in the unit direction d: magenta in the west, cyan in the east. */
const HORIZON = /* glsl */ `
vec3 glHorizon(vec3 d, vec3 cyan, vec3 magenta) {
  float h = 1.0 - smoothstep(0.0, 0.3, abs(d.y));
  float az = d.x / max(length(d.xz), 1e-3);
  return mix(magenta, cyan, smoothstep(-0.9, 0.9, az)) * (h * h);
}`

/* ── the floor ───────────────────────────────────────────────── */

const FLOOR_VERTEX_PARS = /* glsl */ `
uniform vec2 uGlOrigin;
varying vec3 vGlP;
varying float vGlUp;
varying vec2 vGlUv;
#ifdef GLITCH_TILE
  attribute vec2 aPhase;
  varying vec2 vGlPhase;
#endif`

const FLOOR_VERTEX = /* glsl */ `
vec4 glWorld = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  glWorld = instanceMatrix * glWorld;
#endif
glWorld = modelMatrix * glWorld;
vGlP = vec3(glWorld.x - uGlOrigin.x, glWorld.y, glWorld.z - uGlOrigin.y);
vGlUp = normal.y;
vGlUv = uv;
#ifdef GLITCH_TILE
  vGlPhase = aPhase;
#endif`

const FLOOR_FRAGMENT_PARS = /* glsl */ `
uniform float uGlTime;
uniform vec2 uGlOrigin;
uniform vec3 uGlCyan;
uniform vec3 uGlMagenta;
uniform sampler2D tGlNoise;
uniform sampler2D tGlNormal;
varying vec3 vGlP;
varying float vGlUp;
varying vec2 vGlUv;
#if GLITCH_STREAKS > 0
  uniform vec4 uGlPylons[GLITCH_STREAKS];
#endif
#ifdef GLITCH_TILE
  varying vec2 vGlPhase;
#endif
${HASH}
${LINE}
${HORIZON}
// A packet of light on grid line id, seen at along metres down the line and off metres to its
// side (aa: a pixel's footprint). About one line in three carries one, once round a 160 m loop
// every 28 s. Its colours are pulled apart as it goes: x trails, y is its heart, z leads.
vec3 glPacket(float id, float along, float off, float aa, float salt) {
  float carries = step(0.66, glHash(vec2(id, salt + 3.0)));
  float dir = step(0.5, glHash(vec2(id, salt + 9.0))) * 2.0 - 1.0;
  float head = (fract(uGlTime / 28.0 + glHash(vec2(id, salt))) - 0.5) * 160.0;
  vec3 behind = vec3(head - along * dir) - vec3(0.55, 0.0, -0.55);
  vec3 k = max(1.0 - abs(behind) / 1.5, 0.0);
  float halo = max(1.0 - off / 0.55, 0.0);
  return k * k * ((glLine(off, 0.035, aa) * 1.4 + halo * halo * 0.3) * carries);
}`

/** Tiles only: phased out, everything but the outline is cut away, in 25 cm blocks. */
const FLOOR_CUT = /* glsl */ `
#ifdef GLITCH_TILE
  float glEdgeD = abs(vGlUp) > 0.5 ? vGlUv.x : min(vGlUv.y, GLITCH_TILE - vGlUv.y);
  // The outline is never thinner than a pixel and a half, so it stays steady far away.
  float glEdgeW = max(0.05, 1.5 * fwidth(glEdgeD));
  float glBlock = glHash(floor(vGlP.xz * 4.0) + floor(vGlP.y * 4.0 + 0.5) * 7.0 * (1.0 - abs(vGlUp)));
  if (glEdgeD > glEdgeW && glBlock >= vGlPhase.x) discard;
#endif`

/** The surface: grid, rim, packets and the arena's markings; a polish that varies from panel to panel. */
const FLOOR_SURFACE = /* glsl */ `
float glTop = step(0.5, vGlUp);
float glBottom = step(vGlUp, -0.5);
float glFlat = glTop + glBottom;
float glSide = 1.0 - glFlat;
vec2 glP = vGlP.xz;
vec2 glAa = max(fwidth(glP), vec2(1e-4));
float glAaMax = max(glAa.x, glAa.y);
float glDist = length(vViewPosition);

// 2 m cells in thin bright lines, quartered by fainter ones close up.
vec2 glCell = glP * 0.5;
vec2 glToLine = abs(fract(glCell + 0.5) - 0.5) * 2.0;
float glMajor = max(glLine(glToLine.x, 0.02, glAa.x), glLine(glToLine.y, 0.02, glAa.y));
vec2 glToSub = abs(fract(glP * 2.0 + 0.5) - 0.5) * 0.5;
float glMinor = max(glLine(glToSub.x, 0.007, glAa.x), glLine(glToSub.y, 0.007, glAa.y)) * (1.0 - smoothstep(5.0, 20.0, glDist));

// The rim: flat faces know their distance to it, the sides their depth below it.
float glRimD = mix(vGlUv.y, vGlUv.x, glFlat);
float glRimAa = max(fwidth(glRimD), 1e-4);
float glRim = glLine(glRimD, 0.045, glRimAa);
float glRimGlow = 1.0 - smoothstep(0.0, 0.5, glRimD);
glRimGlow *= glRimGlow;
float glBand = glLine(abs(glRimD - 0.3), 0.012, glRimAa) * 0.4 * glSide;

// Packets along the lines.
vec2 glId = floor(glCell + 0.5);
vec3 glPulse = (glPacket(glId.x, glP.y, glToLine.x, glAa.x, 0.0) + glPacket(glId.y, glP.x, glToLine.y, glAa.y, 31.0)) * glTop;

// The arena's markings: the boss's circle, a double ring round the middle and four ticks.
float glR = length(glP);
float glRaa = max(fwidth(glR), 1e-4);
float glArena = step(glR, 23.9);
float glTicks = (glLine(abs(glP.x - glP.y) * 0.7071, 0.02, glAaMax) + glLine(abs(glP.x + glP.y) * 0.7071, 0.02, glAaMax)) * step(6.0, glR) * step(glR, 7.6);
float glMark = (glLine(abs(glR - 18.0), 0.03, glRaa) * 0.45 + glLine(abs(glR - 6.0), 0.03, glRaa) + glLine(abs(glR - 5.3), 0.012, glRaa) * 0.6 + glTicks) * glArena;

// Polish: smudged here and there, a shade different on every panel, with a faint ripple.
float glSmudge = texture2D(tGlNoise, glP * 0.045).r;
float glPanel = glHash(floor(glCell));
roughnessFactor = clamp(roughnessFactor + (glSmudge - 0.5) * 0.3 + (glPanel - 0.5) * 0.08, 0.06, 1.0);
diffuseColor.rgb *= 0.7 + 0.35 * glSmudge + 0.25 * glPanel * glTop;
vec3 glBump = texture2D(tGlNormal, glP * 0.16).xyz * 2.0 - 1.0;
vec3 glUpN = normalize(vec3(glBump.x * 0.14, 1.0, glBump.y * 0.14));
normal = normalize(mix(normal, (viewMatrix * vec4(glUpN, 0.0)).xyz, glTop));

vec3 glTint = uGlCyan;
float glSolid = 1.0;
#ifdef GLITCH_TILE
  // Warning: the tile's light turns magenta and swells. Phased out, its outline stays, dimmed.
  glTint = mix(uGlCyan, uGlMagenta, vGlPhase.y) * (1.0 + 0.6 * vGlPhase.y);
  glSolid = vGlPhase.x;
#endif
vec3 glEmit = glTint * ((glMajor * 1.5 + glMinor * 0.3 + glMark * 1.3) * glTop + glMajor * 0.35 * glBottom + glRim * 2.4 + glRimGlow * 0.22 + glBand);
glEmit *= 0.3 + 0.7 * glSolid;
glEmit += (uGlMagenta * glPulse.x + vec3(0.8, 1.0, 1.0) * glPulse.y + uGlCyan * glPulse.z) * (1.3 * glSolid);
// The sun's shadow on this point (1 = lit), set in the light loop.
float glShade = 1.0;`

/** After lighting: the horizon and the pylons' light mirrored in the polish, strongest at grazing angles. */
const FLOOR_MIRROR = /* glsl */ `
float glGraze = 1.0 - saturate(dot(normal, geometryViewDir));
float glGraze2 = glGraze * glGraze;
float glFresnel = 0.04 + 0.96 * glGraze2 * glGraze2 * glGraze;
// The mirrored view direction, turned from view space into the world (the view matrix is a rotation).
vec3 glBounce = normalize((vec4(reflect(-geometryViewDir, normal), 0.0) * viewMatrix).xyz);
vec3 glMirror = glHorizon(glBounce, uGlCyan, uGlMagenta) * (glFresnel * 0.9);
#if GLITCH_STREAKS > 0
  // A pylon's light mirrors as a streak from its foot toward the eye, widening as it runs.
  vec2 glEye = cameraPosition.xz - uGlOrigin;
  float glEyeH = max(cameraPosition.y - vGlP.y, 0.05);
  vec3 glStreak = vec3(0.0);
  for (int i = 0; i < GLITCH_STREAKS; i++) {
    vec4 py = uGlPylons[i];
    vec2 toEye = glEye - py.xy;
    vec2 toHere = glP - py.xy;
    float len2 = max(dot(toEye, toEye), 1e-3);
    float u = dot(toHere, toEye) / len2;
    float side = abs(toHere.x * toEye.y - toHere.y * toEye.x) * inversesqrt(len2);
    float uTop = py.z / (glEyeH + py.z);
    float uc = clamp(u, 0.0, 0.98);
    float w = 0.07 + 0.03 * (uc * glEyeH / (1.0 - uc));
    float k = side / w;
    float across = 1.0 / (1.0 + k * k);
    float along = smoothstep(0.0, 0.02, u) * (1.0 - smoothstep(uTop * 0.5, uTop, u));
    glStreak += mix(uGlCyan, uGlMagenta, py.w) * (across * across * along * (0.07 / w));
  }
  glMirror += glStreak * ((0.1 + 0.9 * glFresnel) * 2.2 * glArena);
#endif
totalEmissiveRadiance += glEmit * (0.45 + 0.55 * glShade) + glMirror * ((1.15 - 0.7 * glSmudge) * glTop * glShade * glSolid);
totalEmissiveRadiance = min(totalEmissiveRadiance, vec3(8.0));`

/** three's own call that shadows the sun's light (see lightsWithShade). */
const SUN_SHADOW = 'directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ]'

/**
 * three's light loop, with the sun's shadow term also kept in glShade so the floor's lines and
 * mirror images can dim under a shadow. If three's text ever differs, the loop is used unchanged
 * (glShade stays 1).
 */
function lightsWithShade(): string {
  const chunk = THREE.ShaderChunk.lights_fragment_begin
  return chunk.includes(SUN_SHADOW) ? chunk.replace(SUN_SHADOW, SUN_SHADOW.replace('*=', '*= glShade =')) : chunk
}

export interface FloorOptions {
  /**
   * Pylons whose light the floor mirrors: (x, z) from the map's centre, height, tint (0 cyan …
   * 1 magenta). Empty: no streaks (low quality).
   */
  pylons: THREE.Vector4[]
  /**
   * The phasing-tile variant, for an InstancedMesh of slabs `thick` deep with an instanced aPhase
   * attribute: (1 solid … 0 phased out, 0 … 1 warning).
   */
  tile?: { thick: number }
}

export function floorMaterial(ctx: Ctx, u: GlitchUniforms, o: FloorOptions): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: '#232a33', roughness: 0.2, metalness: 0 })
  mat.defines = { ...mat.defines, GLITCH_STREAKS: o.pylons.length }
  if (o.tile) mat.defines.GLITCH_TILE = o.tile.thick.toFixed(3)
  mat.onBeforeCompile = sh => {
    sh.uniforms.uGlTime = u.uTime
    sh.uniforms.uGlOrigin = u.uOrigin
    sh.uniforms.uGlCyan = u.uCyan
    sh.uniforms.uGlMagenta = u.uMagenta
    sh.uniforms.tGlNoise = { value: ctx.textures.get('noise') }
    sh.uniforms.tGlNormal = { value: ctx.textures.get('rock_normal') }
    if (o.pylons.length) sh.uniforms.uGlPylons = { value: o.pylons }
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${FLOOR_VERTEX_PARS}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${FLOOR_VERTEX}`)
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${FLOOR_FRAGMENT_PARS}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${FLOOR_CUT}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${FLOOR_SURFACE}`)
      .replace('#include <lights_fragment_begin>', lightsWithShade())
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>\n${FLOOR_MIRROR}`)
  }
  mat.customProgramCacheKey = () => 'starfall-glitch-floor'
  return mat
}

/* ── line art ────────────────────────────────────────────────── */

const FOG_VERTEX = /* glsl */ `
#include <common>
#include <fog_pars_vertex>`

/**
 * Additive line art on WireBatch strips: a lattice (rails, rungs, crossed braces) or a soft
 * light beam. Fog dims it away, like everything else in the distance.
 */
export function wireMaterial(u: GlitchUniforms): THREE.ShaderMaterial {
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog])
  Object.assign(uniforms, { uCyan: u.uCyan, uMagenta: u.uMagenta })
  return new THREE.ShaderMaterial({
    name: 'starfall.glitch.wire',
    uniforms,
    vertexShader: /* glsl */ `
      ${FOG_VERTEX}
      attribute vec4 aWire;
      attribute float aLine;
      varying vec2 vUv;
      varying vec4 vWire;
      varying float vLine;
      void main() {
        vUv = uv;
        vWire = aWire;
        vLine = aLine;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform vec3 uCyan;
      uniform vec3 uMagenta;
      varying vec2 vUv;
      varying vec4 vWire;
      varying float vLine;
      ${LINE}
      void main() {
        float width = max(vWire.x, 1e-3);
        float x = vUv.x * width;
        float y = vUv.y;
        float aa = max(max(fwidth(x), fwidth(y)), 1e-4);

        // A lattice: a rail down each side, a rung every bay, two braces crossing each bay.
        float bay = max(vWire.y, 1e-3);
        float up = fract(y / bay) * bay;
        float rail = glLine(min(x, width - x), vLine, aa);
        float rung = glLine(min(up, bay - up), vLine * 0.8, aa);
        float slope = inversesqrt(bay * bay + width * width);
        float brace = glLine(min(abs(x * bay - up * width), abs((width - x) * bay - up * width)) * slope, vLine * 0.6, aa) * 0.6;
        float lattice = max(rail, max(rung, brace));

        // A beam: a bright core with a soft edge, fading toward its far end.
        float len = max(-vWire.y, 1e-3);
        float off = abs(vUv.x - 0.5) * 2.0;
        float soft = 1.0 - off;
        float beam = ((1.0 - smoothstep(0.0, 0.3, off)) + soft * soft * 0.35) * (1.0 - smoothstep(0.0, len, y));

        vec3 col = mix(uCyan, uMagenta, vWire.z) * (vWire.w * mix(beam, lattice, step(0.0, vWire.y)));
        #ifdef USE_FOG
          col *= 1.0 - smoothstep(fogNear, fogFar, vFogDepth);
        #endif
        gl_FragColor = vec4(min(col, vec3(4.0)), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: true,
  })
}

/* ── data cubes, fragments, the monolith ─────────────────────── */

/** What a shard instance is: aShard = (tint 0 cyan … 1 magenta, kind, seed 0 … 1, glow). */
export const SHARD = { cube: 0, fragment: 1, monolith: 2 } as const

/**
 * Instanced unit boxes, dark and glossy with lit edges:
 *
 *   cube       a data cube: a second square pulses inside each face
 *   fragment   "unloaded" geometry: above a load line that drifts up and down, only its edges
 *              and a few scan stripes exist; below, it is solid, gridded like the floor
 *   monolith   rows of glyphs crawl along its faces
 */
export function shardMaterial(u: GlitchUniforms): THREE.ShaderMaterial {
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog])
  Object.assign(uniforms, { uTime: u.uTime, uCyan: u.uCyan, uMagenta: u.uMagenta })
  return new THREE.ShaderMaterial({
    name: 'starfall.glitch.shard',
    uniforms,
    vertexShader: /* glsl */ `
      ${FOG_VERTEX}
      attribute vec4 aShard;
      varying vec3 vLocal;
      varying vec3 vSize;
      varying vec3 vFace;
      varying vec3 vNormalW;
      varying vec3 vWorld;
      varying vec4 vShard;
      void main() {
        vLocal = position;
        vFace = normal;
        vShard = aShard;
        vSize = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        vec4 world = modelMatrix * (instanceMatrix * vec4(position, 1.0));
        vWorld = world.xyz;
        // A box's face normals stay on its own axes whatever its scale.
        vec3 n = mat3(modelMatrix) * (mat3(instanceMatrix) * normal);
        vNormalW = n / max(length(n), 1e-5);
        vec4 mvPosition = viewMatrix * world;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform float uTime;
      uniform vec3 uCyan;
      uniform vec3 uMagenta;
      varying vec3 vLocal;
      varying vec3 vSize;
      varying vec3 vFace;
      varying vec3 vNormalW;
      varying vec3 vWorld;
      varying vec4 vShard;
      ${HASH}
      ${LINE}
      void main() {
        // Metres to each pair of faces; the middle one of the three is the way to the nearest edge.
        vec3 toFace = (0.5 - abs(vLocal)) * vSize;
        float edgeD = min(max(toFace.x, toFace.y), min(max(toFace.y, toFace.z), max(toFace.x, toFace.z)));
        float aa = max(fwidth(edgeD), 1e-4);
        // Metres across this face, the box's own up axis upward where the face has one.
        vec3 m = vLocal * vSize;
        vec3 axis = abs(vFace);
        vec2 fuv = axis.x > 0.5 ? m.zy : (axis.y > 0.5 ? m.xz : m.xy);
        vec2 faa = max(fwidth(fuv), vec2(1e-4));
        float height = (vLocal.y + 0.5) * vSize.y;
        float haa = max(fwidth(height), 1e-4);

        float seed = vShard.z;
        float isFragment = step(0.5, vShard.y) * step(vShard.y, 1.5);
        float isMonolith = step(1.5, vShard.y);
        float isCube = 1.0 - step(0.5, vShard.y);
        float wall = 1.0 - step(0.5, axis.y);
        vec3 tint = mix(uCyan, uMagenta, vShard.x);

        // Fragments: above the load line only the outline and (close up) thin scan stripes exist.
        float loadAt = (0.5 + 0.42 * sin(6.2831853 * fract(uTime / 20.0 + seed))) * vSize.y;
        float unloaded = isFragment * step(loadAt, height);
        float stripe = step(abs(fract(height / 0.22) - 0.5), 0.07) * step(haa, 0.03) * wall;
        if (unloaded > 0.5 && edgeD > max(0.035, 1.5 * aa) && stripe < 0.5) discard;

        float edge = glLine(edgeD, 0.028, aa);
        float halo = max(1.0 - edgeD / 0.22, 0.0);
        halo *= halo;

        // Dark faces with a little sheen, so they read as solid against the void.
        vec3 toEye = cameraPosition - vWorld;
        toEye /= max(length(toEye), 1e-4);
        float graze = 1.0 - abs(dot(vNormalW, toEye));
        vec3 body = vec3(0.012, 0.018, 0.026) * (0.8 + 0.8 * max(vNormalW.y, 0.0)) + tint * (graze * graze * 0.05);

        // Data cubes: a second square inside each face, slowly pulsing.
        float inset = 0.22 * min(vSize.x, min(vSize.y, vSize.z));
        float inner = glLine(abs(edgeD - inset), 0.012, aa) * (0.4 + 0.3 * sin(6.2831853 * fract(uTime / 6.0 + seed))) * isCube;

        // Fragments, loaded part: a faint grid like the floor's, and a bright line where it loads.
        vec2 toLine = abs(fract(fuv / 0.5 + 0.5) - 0.5) * 0.5;
        float grid = max(glLine(toLine.x, 0.008, faa.x), glLine(toLine.y, 0.008, faa.y)) * 0.35 * isFragment * (1.0 - unloaded);
        float front = glLine(abs(height - loadAt), 0.03, haa) * isFragment * wall;
        float scan = stripe * unloaded * 0.4;

        // The monolith: rows of glyphs crawling sideways, each row at its own pace.
        float row = floor(fuv.y / 0.3);
        float rowIn = fract(fuv.y / 0.3);
        float pace = floor(glHash(vec2(row, 5.0)) * 4.0) + 1.0;
        float way = step(0.5, glHash(vec2(row, 11.0))) * 2.0 - 1.0;
        float cx = fuv.x / 0.16 + fract(uTime / 240.0 * pace) * 64.0 * way;
        float cellIn = fract(cx);
        float pick = glHash(vec2(mod(floor(cx), 64.0), row));
        float ax = clamp(faa.x / 0.16, 1e-3, 0.4);
        float ay = clamp(faa.y / 0.3, 1e-3, 0.24);
        float dash = smoothstep(0.1, 0.1 + ax, cellIn) * (1.0 - smoothstep(0.9 - ax, 0.9, cellIn))
                   * smoothstep(0.25, 0.25 + ay, rowIn) * (1.0 - smoothstep(0.75 - ay, 0.75, rowIn));
        // Too small to draw cleanly, the glyphs melt into an even glow.
        float near = 1.0 - smoothstep(0.03, 0.1, faa.x);
        float glyph = mix(0.25, dash * step(0.42, pick), near) * isMonolith * wall;
        vec3 glyphs = mix(uCyan, uMagenta, step(0.9, pick)) * (glyph * (0.5 + 0.9 * pick));

        vec3 col = body + tint * ((edge * 1.8 + halo * 0.25 + inner + grid + front * 1.2 + scan) * vShard.w) + glyphs;
        gl_FragColor = vec4(min(col, vec3(6.0)), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    fog: true,
  })
}

/* ── the horizon, the void, the motes ────────────────────────── */

/**
 * The scanline horizon: level rings of light round the dome, packed where it meets the void and
 * drifting slowly upward, over a soft glow (magenta in the west, cyan in the east), with one
 * brighter line climbing the dome every 24 s. Added over the sky, so it needs no sorting.
 */
export function domeMaterial(u: GlitchUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: 'starfall.glitch.dome',
    uniforms: { uTime: u.uTime, uCyan: u.uCyan, uMagenta: u.uMagenta },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uCyan;
      uniform vec3 uMagenta;
      varying vec3 vDir;
      ${LINE}
      ${HORIZON}
      void main() {
        vec3 d = vDir / max(length(vDir), 1e-4);
        float e = d.y;
        // 70 rings between the horizon and the zenith, one step up every 4 s.
        float s = e * 70.0 - fract(uTime / 4.0);
        float aa = max(fwidth(s), 1e-4);
        float rings = glLine(abs(fract(s + 0.5) - 0.5), 0.09, aa);
        float low = smoothstep(-0.01, 0.02, e) * (1.0 - smoothstep(0.02, 0.5, e));
        float climb = fract(uTime / 24.0);
        float sweep = max(1.0 - abs(e - climb * 0.5) / 0.025, 0.0) * (1.0 - climb);
        vec3 glow = glHorizon(d, uCyan, uMagenta);
        float az = d.x / max(length(d.xz), 1e-3);
        vec3 tint = mix(uMagenta, uCyan, smoothstep(-0.9, 0.9, az));
        vec3 col = glow * 0.22 + tint * (rings * low * low * 0.42 + sweep * sweep * 0.3);
        gl_FragColor = vec4(min(col, vec3(2.0)), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  })
}

/**
 * The void's own grid far below (it marks the kill floor): 8 m cells quartered by fainter
 * lines, a slow ripple of light spreading from under the arena, fading into the fog.
 */
export function voidMaterial(u: GlitchUniforms): THREE.ShaderMaterial {
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog])
  Object.assign(uniforms, { uTime: u.uTime, uOrigin: u.uOrigin, uCyan: u.uCyan, uBase: { value: new THREE.Color('#01050a') } })
  return new THREE.ShaderMaterial({
    name: 'starfall.glitch.void',
    uniforms,
    vertexShader: /* glsl */ `
      ${FOG_VERTEX}
      uniform vec2 uOrigin;
      varying vec2 vP;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vP = world.xz - uOrigin;
        vec4 mvPosition = viewMatrix * world;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform float uTime;
      uniform vec3 uCyan;
      uniform vec3 uBase;
      varying vec2 vP;
      ${LINE}
      void main() {
        vec2 aa = max(fwidth(vP), vec2(1e-4));
        vec2 toMajor = abs(fract(vP / 8.0 + 0.5) - 0.5) * 8.0;
        vec2 toMinor = abs(fract(vP / 2.0 + 0.5) - 0.5) * 2.0;
        float major = max(glLine(toMajor.x, 0.06, aa.x), glLine(toMajor.y, 0.06, aa.y));
        float minor = max(glLine(toMinor.x, 0.02, aa.x), glLine(toMinor.y, 0.02, aa.y));
        float r = length(vP);
        float ripple = 0.5 + 0.5 * sin(6.2831853 * fract(r / 90.0 - uTime / 12.0));
        float reach = 1.0 - smoothstep(40.0, 240.0, r);
        vec3 col = uBase + uCyan * ((major * 0.55 + minor * 0.14) * (0.3 + 0.7 * ripple) * reach);
        gl_FragColor = vec4(min(col, vec3(2.0)), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    fog: true,
  })
}

/** uniforms of moteMaterial the builder updates every frame. */
export interface MoteUniforms {
  /** The camera: the motes fill a box that follows it. */
  uCenter: { value: THREE.Vector3 }
  /** Point size at 1 m (pixels): follows the renderer's pixel ratio. */
  uSize: { value: number }
}

/**
 * Square motes of light rising slowly through a box that follows the camera (each wraps round
 * it), a few of them magenta. Positions come from aSeed (three numbers in 0 … 1 per mote).
 */
export function moteMaterial(u: GlitchUniforms): THREE.ShaderMaterial & { uniforms: MoteUniforms } {
  const uniforms = { uTime: u.uTime, uCyan: u.uCyan, uMagenta: u.uMagenta, uCenter: { value: new THREE.Vector3() }, uSize: { value: 60 } }
  const mat = new THREE.ShaderMaterial({
    name: 'starfall.glitch.motes',
    uniforms,
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uCenter;
      uniform float uSize;
      attribute vec3 aSeed;
      varying float vGlow;
      varying float vTint;
      void main() {
        vec3 box = vec3(72.0, 40.0, 72.0);
        vec3 p = aSeed * box;
        // Two to four times up the box every 240 s: 0.3 to 0.7 m/s.
        p.y += fract(uTime / 240.0 * (2.0 + floor(aSeed.x * 3.0))) * box.y;
        p = mod(p - uCenter + box * 0.5, box) + uCenter - box * 0.5;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float dist = max(-mv.z, 0.1);
        gl_PointSize = uSize * (0.5 + aSeed.y) / dist;
        vGlow = (1.0 - smoothstep(14.0, 36.0, dist)) * smoothstep(0.8, 3.0, dist) * (0.35 + 0.65 * aSeed.z);
        vTint = step(0.86, aSeed.y);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uCyan;
      uniform vec3 uMagenta;
      varying float vGlow;
      varying float vTint;
      void main() {
        vec2 c = abs(gl_PointCoord - 0.5) * 2.0;
        float a = (1.0 - smoothstep(0.55, 0.95, max(c.x, c.y))) * vGlow;
        gl_FragColor = vec4(mix(uCyan, uMagenta, vTint) * (a * 0.9), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  })
  return mat as THREE.ShaderMaterial & { uniforms: MoteUniforms }
}
