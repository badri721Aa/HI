export type QualityLevel = 'low' | 'medium' | 'high' | 'ultra'

export interface Settings {
  quality: QualityLevel
  /** Drop render resolution automatically when the frame rate dips. */
  autoQuality: boolean
  /** Multiplier on the preset's pixel ratio (0.5–1). */
  renderScale: number
  fov: number
  showFps: boolean
  mouseSensitivity: number
  invertY: boolean
  cameraShake: boolean
  masterVolume: number
  musicVolume: number
  sfxVolume: number
  ambienceVolume: number
  subtitles: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  quality: 'high',
  autoQuality: true,
  renderScale: 1,
  fov: 62,
  showFps: false,
  mouseSensitivity: 1,
  invertY: false,
  cameraShake: true,
  masterVolume: 0.8,
  musicVolume: 0.55,
  sfxVolume: 0.8,
  ambienceVolume: 0.7,
  subtitles: true,
}

/** Concrete knobs every renderer-side module reads. */
export interface QualityProfile {
  level: QualityLevel
  /** Cap on devicePixelRatio before renderScale. */
  pixelRatio: number
  shadows: boolean
  shadowMapSize: number
  /** Radius (m) the follow-shadow camera covers around the player. */
  shadowRadius: number
  bloom: boolean
  /** MSAA samples on the post-processing target (0 = off). */
  msaa: number
  /** 0..1.5 — scales grass blades, flowers and small clutter. */
  grassDensity: number
  /** Radius (m) around the player where grass is drawn. */
  grassRadius: number
  /** 0..1 — scales trees/rocks/bushes. */
  foliageDensity: number
  /** Distance fog end (m). */
  viewDistance: number
  /** Max live particles. */
  particles: number
  /** Animated water detail (normal-map layers, foam). */
  waterDetail: 0 | 1 | 2
}

export const QUALITY: Record<QualityLevel, QualityProfile> = {
  low: {
    level: 'low', pixelRatio: 1, shadows: false, shadowMapSize: 1024, shadowRadius: 30, bloom: false, msaa: 0,
    grassDensity: 0.3, grassRadius: 28, foliageDensity: 0.55, viewDistance: 260, particles: 600, waterDetail: 0,
  },
  medium: {
    level: 'medium', pixelRatio: 1.25, shadows: true, shadowMapSize: 1024, shadowRadius: 36, bloom: true, msaa: 0,
    grassDensity: 0.6, grassRadius: 40, foliageDensity: 0.8, viewDistance: 340, particles: 1200, waterDetail: 1,
  },
  high: {
    level: 'high', pixelRatio: 1.5, shadows: true, shadowMapSize: 2048, shadowRadius: 44, bloom: true, msaa: 4,
    grassDensity: 1, grassRadius: 52, foliageDensity: 1, viewDistance: 420, particles: 2500, waterDetail: 2,
  },
  ultra: {
    level: 'ultra', pixelRatio: 2, shadows: true, shadowMapSize: 4096, shadowRadius: 56, bloom: true, msaa: 4,
    grassDensity: 1.4, grassRadius: 64, foliageDensity: 1, viewDistance: 500, particles: 4000, waterDetail: 2,
  },
}

/** A sensible starting preset for the device. */
export function detectQuality(): QualityLevel {
  if (typeof navigator === 'undefined') return 'high'
  const touch = navigator.maxTouchPoints > 0 && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8
  const cores = navigator.hardwareConcurrency ?? 4
  if (touch) return mem >= 6 ? 'medium' : 'low'
  if (cores <= 4 || mem <= 4) return 'medium'
  return 'high'
}

/** The choices on the first-launch "Choose your device" screen. */
export type DeviceKind = 'chromebook' | 'laptop' | 'gaming' | 'phone'

export const DEVICE_QUALITY: Record<DeviceKind, QualityLevel> = {
  chromebook: 'low',
  laptop: 'medium',
  gaming: 'high',
  phone: 'low',
}

const GPU_GAMING = /NVIDIA|GeForce|RTX|GTX|Radeon RX|Radeon Pro|Apple M\d/i
const GPU_WEAK = /SwiftShader|llvmpipe|Software|Mali|Adreno|PowerVR|UHD Graphics|HD Graphics/i

/** Best guess at the device from the user agent and the GPU's name (WEBGL_debug_renderer_info). */
export function recommendDevice(gl: WebGLRenderingContext | WebGL2RenderingContext | null): { kind: DeviceKind; gpu: string } {
  if (typeof navigator === 'undefined') return { kind: 'laptop', gpu: '' }
  const ua = navigator.userAgent
  let gpu = ''
  try {
    const ext = gl?.getExtension('WEBGL_debug_renderer_info')
    gpu = String((ext && gl?.getParameter(ext.UNMASKED_RENDERER_WEBGL)) || gl?.getParameter(gl.RENDERER) || '')
  } catch {
    /* the GPU name is only a hint */
  }
  const touch = navigator.maxTouchPoints > 0
  // iPadOS reports a Mac user agent, but Macs have no touch screen.
  if (touch && (/Mobi|Android|iPhone|iPad|Tablet/i.test(ua) || /Macintosh/.test(ua))) return { kind: 'phone', gpu }
  if (/CrOS/.test(ua)) return { kind: 'chromebook', gpu }
  if (GPU_GAMING.test(gpu)) return { kind: 'gaming', gpu }
  if (GPU_WEAK.test(gpu)) return { kind: 'chromebook', gpu }
  return { kind: 'laptop', gpu }
}
