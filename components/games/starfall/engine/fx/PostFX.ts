/**
 * PostFX — the final render.
 *
 *   RenderPass (HDR half-float target, MSAA when ctx.quality.msaa > 0)
 *   → UnrealBloomPass (internally half resolution; subtle, only emissives and the sun bloom)
 *   → grade (warm lift/gamma/gain, saturation, vignette — in linear HDR)
 *   → OutputPass (tone mapping + sRGB, using the renderer's live exposure)
 *   → FXAA (only without MSAA, medium quality and up)
 *
 * On 'low' the composer is dropped and the scene renders straight to the canvas, where the
 * renderer applies tone mapping and sRGB itself.
 *
 * Robustness: some GPUs produce a NaN (an undefined shader op) or an Inf (a highlight past
 * half-float range) here and there. The bloom blurs every pixel across the frame, so a single one
 * would black out the whole view — both the bloom input and the grade scrub them. Beyond that the
 * chain only uses MSAA sample counts the GPU supports for its buffers, checks the buffers are
 * complete after every resize, and watches the first frames after a change: if the picture
 * stays black, it steps down (MSAA → bloom → no post chain) and remembers that for this GPU.
 * Resolution is never touched.
 */
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { FXAAPass } from 'three/examples/jsm/postprocessing/FXAAPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { gpuName } from '../settings'
import type { Ctx, IPostFX } from '../types'
import { FrameProbe } from './frameProbe'

const BLOOM = { strength: 0.5, radius: 0.6, threshold: 1.1, knee: 0.6 }

/**
 * Replaces NaN with 0 and clamps to [0, cap] (±Inf lands on 0 / cap). The NaN test reads the bits,
 * which no compiler may optimise away (isnan() can be under fast math), and the boolean mix() is
 * a select, so the NaN itself never enters any arithmetic.
 */
const SANE_GLSL = /* glsl */ `
vec3 fxSane(vec3 c, float cap) {
  bvec3 nan = greaterThan(floatBitsToUint(c) & 0x7fffffffu, uvec3(0x7f800000u));
  return mix(clamp(c, 0.0, cap), vec3(0.0), nan);
}
`

/** The brightest value the bloom sees: plenty for the sun, and no single pixel can flood the frame. */
const BLOOM_CAP = 64

const GradeShader = {
  name: 'StarfallGrade',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uLift: { value: new THREE.Vector3(0.006, 0.0045, 0.002) },
    uGamma: { value: new THREE.Vector3(1.03, 1.0, 0.97) },
    uGain: { value: new THREE.Vector3(1.03, 1.0, 0.96) },
    uSaturation: { value: 1.05 },
    uVignette: { value: 0.24 },
    uAspect: { value: 16 / 9 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec3 uLift;
    uniform vec3 uGamma;
    uniform vec3 uGain;
    uniform float uSaturation;
    uniform float uVignette;
    uniform float uAspect;
    varying vec2 vUv;
    ${SANE_GLSL}
    void main() {
      vec4 tex = texture2D(tDiffuse, vUv);
      vec3 c = fxSane(tex.rgb, 65504.0);
      // Lift only touches the darks; gain and gamma tilt the balance warm.
      c = c * uGain + uLift * (1.0 - smoothstep(0.0, 0.25, c));
      c = pow(c, 1.0 / uGamma);
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = max(mix(vec3(l), c, uSaturation), 0.0);
      vec2 d = (vUv - 0.5) * vec2(uAspect, 1.0) / (0.5 * sqrt(uAspect * uAspect + 1.0));
      c *= 1.0 - uVignette * smoothstep(0.35, 1.05, length(d));
      gl_FragColor = vec4(c, tex.a);
    }
  `,
}

/** Stand-alone scrub pass, only used if three's bloom shader ever changes shape (see buildComposer). */
const SaneShader = {
  name: 'StarfallSane',
  uniforms: { tDiffuse: { value: null as THREE.Texture | null } },
  vertexShader: GradeShader.vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    ${SANE_GLSL}
    void main() {
      vec4 tex = texture2D(tDiffuse, vUv);
      gl_FragColor = vec4(fxSane(tex.rgb, 65504.0), tex.a);
    }
  `,
}

/**
 * Fallback levels, remembered per GPU. Each one gives up a feature, never resolution:
 *   0  what the quality preset asks for
 *   1  FXAA instead of MSAA
 *   2  also no bloom
 *   3  no post chain: the scene renders straight to the canvas
 */
const SAFE_KEY = 'starfall:gpu-safe:v1'
const SAFE_MAX = 3

/**
 * Frame checks after a change, half a second apart; three black ones in a row (with a plain grey
 * test frame coming out of the chain black too) step down.
 */
const PROBES = 8
const PROBE_GAP_MS = 500
const BLACK_RUN = 3

export class PostFX implements IPostFX {
  private composer: EffectComposer | null = null
  private scenePass: RenderPass | null = null
  private bloom: UnrealBloomPass | null = null
  private grade: ShaderPass | null = null
  private output: OutputPass | null = null
  private fxaa: FXAAPass | null = null
  /** MSAA sample count the current composer was built with. */
  private samples = -1
  private width = 1
  private height = 1
  private pixelRatio = 1
  private ready = false

  private gpu = ''
  private safe = 0
  /** The GPU can render to half-float buffers (the HDR chain needs it). */
  private hdr = true
  /** Sample counts the GPU supports for the HDR colour + depth buffers, highest first. */
  private sampleCounts: number[] = []

  private probe: FrameProbe
  private probesLeft = 0
  private probeAt = 0
  private blackRun = 0
  /** What the read in flight shows: the live frame, or the grey test frame. */
  private reading: 'live' | 'test' = 'live'
  /** The last live frame was dark and flat: put the test frame through the chain next. */
  private testNext = false
  /** A plain mid-grey frame (just a clear colour: no shaders to compile) for testing the chain. */
  private testScene: THREE.Scene | null = null

  private onRestored = (): void => {
    // three rebuilds its GL state by itself; the probe's buffers died with the old context.
    this.probe.reset()
    this.watch()
  }

  constructor(private ctx: Ctx) {
    this.probe = new FrameProbe(ctx.renderer)
  }

  init(): void {
    const { renderer } = this.ctx
    const gl = renderer.getContext() as WebGL2RenderingContext
    // Draw-call stats should cover the whole frame (scene + passes), not just the last pass.
    renderer.info.autoReset = false
    this.gpu = gpuName(gl)
    this.safe = loadSafe(this.gpu)
    this.hdr = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float')
    this.sampleCounts = supportedSamples(gl)
    renderer.domElement.addEventListener('webglcontextrestored', this.onRestored)
    this.ready = true
    if (!this.hdr) console.warn('[starfall] this GPU cannot render HDR buffers — drawing without post effects')
    this.applyQuality()
  }

  update(): void {}

  render(): void {
    const { renderer, scene, camera } = this.ctx
    renderer.info.reset()
    if (!this.composer) {
      renderer.setRenderTarget(null)
      renderer.render(scene, camera)
      return
    }
    this.composer.render()
    this.check()
  }

  setSize(width: number, height: number, pixelRatio: number): void {
    this.width = width
    this.height = height
    this.pixelRatio = pixelRatio
    if (!this.composer) return
    this.composer.setPixelRatio(pixelRatio)
    this.composer.setSize(width, height)
    this.grade!.uniforms.uAspect.value = width / height
    if (!this.buffersOk()) {
      this.stepDown('its buffers could not be created at this size')
      return
    }
    this.watch()
  }

  applyQuality(): void {
    if (!this.ready) return
    const q = this.ctx.quality
    if (q.level === 'low' || !this.hdr || this.safe >= SAFE_MAX) {
      this.destroyComposer()
      return
    }
    const samples = this.safe >= 1 ? 0 : this.pickSamples(q.msaa)
    if (!this.composer || this.samples !== samples) this.buildComposer(samples)
    if (!this.composer) return // the build stepped down to drawing without post effects
    // Read back from the chain itself: a step-down during the build may have rebuilt it.
    this.bloom!.enabled = q.bloom && this.safe < 2
    this.fxaa!.enabled = this.samples === 0
    this.watch()
  }

  /** Check the next frames for a black picture (after a phase or map change, and any rebuild). */
  watch(): void {
    if (!this.composer) return
    this.probe.cancel()
    this.probesLeft = PROBES
    this.blackRun = 0
    this.testNext = false
    this.probeAt = performance.now() + PROBE_GAP_MS
  }

  dispose(): void {
    this.ctx.renderer.domElement.removeEventListener('webglcontextrestored', this.onRestored)
    this.destroyComposer()
    this.probe.dispose()
    this.ctx.renderer.info.autoReset = true
    this.ready = false
  }

  /* ── internals ─────────────────────────────────────────────── */

  private buildComposer(samples: number): void {
    this.destroyComposer()
    const { renderer, scene, camera } = this.ctx
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples })
    target.texture.name = 'starfall.post'
    const composer = new EffectComposer(renderer, target)

    const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), BLOOM.strength, BLOOM.radius, BLOOM.threshold)
    // A soft knee so highlights ease into the bloom instead of popping.
    bloom.materialHighPassFilter.uniforms.smoothWidth.value = BLOOM.knee
    const scrubbed = scrubBloomInput(bloom)
    const grade = new ShaderPass(GradeShader)
    const output = new OutputPass()
    const fxaa = new FXAAPass()

    const scenePass = new RenderPass(scene, camera)
    composer.addPass(scenePass)
    if (!scrubbed) composer.addPass(new ShaderPass(SaneShader))
    composer.addPass(bloom)
    composer.addPass(grade)
    composer.addPass(output)
    composer.addPass(fxaa)

    this.composer = composer
    this.scenePass = scenePass
    this.bloom = bloom
    this.grade = grade
    this.output = output
    this.fxaa = fxaa
    this.samples = samples
    this.setSize(this.width, this.height, this.pixelRatio)
    // setSize found the buffers unusable and stepped down: this chain is already gone.
    if (this.composer !== composer) return
    // Scene shaders differ between drawing to the canvas (tone mapping + sRGB in every material) and
    // into this linear HDR target. Leave the target bound so the loader's warm-up compile (which uses
    // the current target) builds the variants the composer really draws with, instead of a full
    // second set compiling on the first frames. render() sets its own targets every frame.
    renderer.setRenderTarget(composer.readBuffer)
  }

  private destroyComposer(): void {
    this.probesLeft = 0
    this.testNext = false
    this.probe.cancel()
    if (!this.composer) return
    // Never leave a disposed target bound (a later bind would quietly re-allocate it).
    this.ctx.renderer.setRenderTarget(null)
    for (const pass of this.composer.passes) pass.dispose()
    this.composer.dispose()
    this.composer = null
    this.scenePass = null
    this.bloom = this.grade = this.output = this.fxaa = null
    this.samples = -1
  }

  /** The highest supported sample count up to `wanted` (0 = no MSAA). */
  private pickSamples(wanted: number): number {
    if (wanted <= 0) return 0
    const cap = Math.min(wanted, this.ctx.renderer.capabilities.maxSamples)
    return this.sampleCounts.find(n => n <= cap) ?? 0
  }

  /** One step down the fallback ladder, remembered for this GPU. */
  private stepDown(why: string): void {
    if (this.safe >= SAFE_MAX) return
    // Without MSAA in use, dropping it changes nothing: go straight to the next step.
    this.safe = this.safe === 0 && this.samples === 0 ? 2 : this.safe + 1
    saveSafe(this.gpu, this.safe)
    console.warn(`[starfall] post effects stepped down to level ${this.safe}: ${why}`)
    this.applyQuality()
  }

  /** False when the GPU can't create the chain's buffers at the current size. */
  private buffersOk(): boolean {
    const { renderer } = this.ctx
    const gl = renderer.getContext()
    if (gl.isContextLost()) return true
    // Drop stale errors so only this check's count.
    for (let i = 0; i < 16; i++) if (gl.getError() === gl.NO_ERROR) break
    const prev = renderer.getRenderTarget()
    let ok = true
    for (const t of [this.composer!.renderTarget1, this.composer!.renderTarget2]) {
      // Binding allocates the buffers at the new size.
      renderer.setRenderTarget(t)
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) ok = false
    }
    renderer.setRenderTarget(prev)
    if (gl.getError() === gl.OUT_OF_MEMORY) ok = false
    return ok
  }

  /**
   * Called right after a composed frame while a watch runs: collects a finished read, or starts the
   * next one. Reads never block (see FrameProbe), so this costs nothing a player could feel.
   */
  private check(): void {
    if (this.probe.busy) {
      const flat = this.probe.poll()
      if (flat === null) return
      if (this.reading === 'test') {
        this.blackRun = flat ? this.blackRun + 1 : 0
        if (this.blackRun >= BLACK_RUN) this.stepDown('the picture stayed black')
      } else if (flat) {
        // Dark and flat — but a night sky can be too. Only if a plain grey frame comes out of
        // the chain dark as well is the chain to blame.
        this.testNext = true
      } else {
        this.blackRun = 0
      }
      return
    }
    if (this.testNext) {
      this.testNext = false
      this.readTestFrame()
      return
    }
    if (this.probesLeft <= 0) return
    const now = performance.now()
    if (now < this.probeAt) return
    this.probeAt = now + PROBE_GAP_MS
    this.probesLeft--
    this.reading = 'live'
    this.probe.request()
  }

  /** Puts the mid-grey frame through the chain, queues a read of it, then redraws the real frame. */
  private readTestFrame(): void {
    const composer = this.composer!
    const pass = this.scenePass!
    if (!this.testScene) {
      this.testScene = new THREE.Scene()
      this.testScene.background = new THREE.Color(0.5, 0.5, 0.5)
    }
    pass.scene = this.testScene
    composer.render()
    this.reading = 'test'
    this.probe.request()
    pass.scene = this.ctx.scene
    composer.render()
  }
}

/** Scrubs the bloom's input in place. False if three's shader no longer has the expected line. */
function scrubBloomInput(bloom: UnrealBloomPass): boolean {
  const mat = bloom.materialHighPassFilter
  const read = 'vec4 texel = texture2D( tDiffuse, vUv );'
  const main = 'void main() {'
  if (!mat.fragmentShader.includes(read) || !mat.fragmentShader.includes(main)) return false
  mat.fragmentShader = mat.fragmentShader
    .replace(main, `${SANE_GLSL}\n${main}`)
    .replace(read, `${read}\ntexel.rgb = fxSane( texel.rgb, ${BLOOM_CAP.toFixed(1)} );`)
  mat.needsUpdate = true
  return true
}

/** Sample counts usable for both the half-float colour and the depth buffer, highest first. */
function supportedSamples(gl: WebGL2RenderingContext): number[] {
  try {
    const color = Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER, gl.RGBA16F, gl.SAMPLES) as Int32Array)
    const depth = Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, gl.SAMPLES) as Int32Array)
    return color.filter(n => depth.includes(n)).sort((a, b) => b - a)
  } catch {
    return []
  }
}

function loadSafe(gpu: string): number {
  try {
    const s = JSON.parse(localStorage.getItem(SAFE_KEY) || 'null') as { gpu?: string; level?: number } | null
    if (!s || s.gpu !== gpu) return 0
    return Math.max(0, Math.min(SAFE_MAX, Math.floor(Number(s.level) || 0)))
  } catch {
    return 0
  }
}

function saveSafe(gpu: string, level: number): void {
  try {
    localStorage.setItem(SAFE_KEY, JSON.stringify({ gpu, level }))
  } catch {
    /* private mode: the step-down still holds for this session */
  }
}
