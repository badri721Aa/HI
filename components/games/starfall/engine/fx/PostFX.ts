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
 */
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { FXAAPass } from 'three/examples/jsm/postprocessing/FXAAPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import type { Ctx, IPostFX } from '../types'

const BLOOM = { strength: 0.5, radius: 0.6, threshold: 1.1, knee: 0.6 }

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
    void main() {
      vec4 tex = texture2D(tDiffuse, vUv);
      vec3 c = max(tex.rgb, 0.0);
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

export class PostFX implements IPostFX {
  private composer: EffectComposer | null = null
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

  constructor(private ctx: Ctx) {}

  init(): void {
    // Draw-call stats should cover the whole frame (scene + passes), not just the last pass.
    this.ctx.renderer.info.autoReset = false
    this.ready = true
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
  }

  setSize(width: number, height: number, pixelRatio: number): void {
    this.width = width
    this.height = height
    this.pixelRatio = pixelRatio
    if (!this.composer) return
    this.composer.setPixelRatio(pixelRatio)
    this.composer.setSize(width, height)
    this.grade!.uniforms.uAspect.value = width / height
  }

  applyQuality(): void {
    if (!this.ready) return
    const q = this.ctx.quality
    if (q.level === 'low') {
      this.destroyComposer()
      return
    }
    if (!this.composer || this.samples !== q.msaa) this.buildComposer(q.msaa)
    this.bloom!.enabled = q.bloom
    this.fxaa!.enabled = q.msaa === 0
  }

  dispose(): void {
    this.destroyComposer()
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
    const grade = new ShaderPass(GradeShader)
    const output = new OutputPass()
    const fxaa = new FXAAPass()

    composer.addPass(new RenderPass(scene, camera))
    composer.addPass(bloom)
    composer.addPass(grade)
    composer.addPass(output)
    composer.addPass(fxaa)

    this.composer = composer
    this.bloom = bloom
    this.grade = grade
    this.output = output
    this.fxaa = fxaa
    this.samples = samples
    this.setSize(this.width, this.height, this.pixelRatio)
    // Scene shaders differ between drawing to the canvas (tone mapping + sRGB in every material) and
    // into this linear HDR target. Leave the target bound so the loader's warm-up compile (which uses
    // the current target) builds the variants the composer really draws with, instead of a full
    // second set compiling on the first frames. render() sets its own targets every frame.
    renderer.setRenderTarget(composer.readBuffer)
  }

  private destroyComposer(): void {
    if (!this.composer) return
    // Never leave a disposed target bound (a later bind would quietly re-allocate it).
    this.ctx.renderer.setRenderTarget(null)
    for (const pass of this.composer.passes) pass.dispose()
    this.composer.dispose()
    this.composer = null
    this.bloom = this.grade = this.output = this.fxaa = null
    this.samples = -1
  }
}
