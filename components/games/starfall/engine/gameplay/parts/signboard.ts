/**
 * Paints every signpost title into one canvas atlas: weathered plank board,
 * a darker routed frame, cream hand-painted lettering and a small star flourish.
 */
import * as THREE from 'three'
import { rng } from './util'

export interface AtlasCell {
  u0: number
  v0: number
  u1: number
  v1: number
}

export interface SignAtlas {
  texture: THREE.CanvasTexture
  cells: AtlasCell[]
}

const W = 1024
const COLS = 2
const CELL_W = W / COLS
const CELL_H = 204
/** Matches the sign face aspect (1.36 m × 0.51 m). */
export const FACE_ASPECT = CELL_W / CELL_H

const FONT = "'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, Charter, 'Bitstream Charter', Caladea, 'DejaVu Serif', serif"

function star(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.beginPath()
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4 - Math.PI / 2
    const rr = k % 2 === 0 ? r : r * 0.32
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
  }
  g.closePath()
  g.fill()
}

function paintBoard(g: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, rand: () => number, planks: CanvasImageSource | null): void {
  // base wood
  const base = g.createLinearGradient(x0, y0, x0, y0 + h)
  base.addColorStop(0, '#8d5d36')
  base.addColorStop(0.5, '#7a4e2c')
  base.addColorStop(1, '#6a4225')
  g.fillStyle = base
  g.fillRect(x0, y0, w, h)

  // optional real plank texture for fine detail
  if (planks) {
    g.save()
    g.globalAlpha = 0.35
    g.globalCompositeOperation = 'multiply'
    g.drawImage(planks, x0, y0, w, h)
    g.restore()
  }

  // three horizontal planks with slightly different tones and grain
  const planksN = 3
  const ph = h / planksN
  for (let p = 0; p < planksN; p++) {
    const py = y0 + p * ph
    g.fillStyle = `rgba(${p % 2 ? 30 : 255},${p % 2 ? 16 : 220},${p % 2 ? 6 : 170},${0.05 + rand() * 0.05})`
    g.fillRect(x0, py, w, ph)
    for (let k = 0; k < 26; k++) {
      const gy = py + 4 + rand() * (ph - 8)
      g.strokeStyle = `rgba(48,26,12,${0.08 + rand() * 0.14})`
      g.lineWidth = 0.6 + rand() * 1.4
      g.beginPath()
      g.moveTo(x0, gy)
      const amp = 1 + rand() * 3
      const f = 0.01 + rand() * 0.02
      const off = rand() * 10
      for (let x = 0; x <= w; x += 16) g.lineTo(x0 + x, gy + Math.sin(x * f + off) * amp)
      g.stroke()
    }
    // knot
    if (rand() < 0.7) {
      const kx = x0 + 30 + rand() * (w - 60)
      const ky = py + ph * (0.3 + rand() * 0.4)
      g.strokeStyle = 'rgba(45,24,10,0.35)'
      for (let r = 3; r < 13; r += 3) {
        g.lineWidth = 1
        g.beginPath()
        g.ellipse(kx, ky, r * 1.8, r * 0.7, 0, 0, Math.PI * 2)
        g.stroke()
      }
    }
    // seam
    if (p > 0) {
      g.fillStyle = 'rgba(30,15,6,0.65)'
      g.fillRect(x0, py - 1.5, w, 3)
      g.fillStyle = 'rgba(255,220,170,0.12)'
      g.fillRect(x0, py + 1.5, w, 1.5)
    }
  }

  // routed frame
  const inset = 10
  g.strokeStyle = 'rgba(38,20,8,0.55)'
  g.lineWidth = 5
  g.strokeRect(x0 + inset, y0 + inset, w - inset * 2, h - inset * 2)
  g.strokeStyle = 'rgba(255,225,180,0.14)'
  g.lineWidth = 1.5
  g.strokeRect(x0 + inset + 3.5, y0 + inset + 3.5, w - inset * 2 - 7, h - inset * 2 - 7)

  // nails
  g.fillStyle = 'rgba(40,36,34,0.9)'
  for (const [nx, ny] of [[22, 22], [w - 22, 22], [22, h - 22], [w - 22, h - 22]]) {
    g.beginPath()
    g.arc(x0 + nx, y0 + ny, 3.2, 0, Math.PI * 2)
    g.fill()
  }

  // edge darkening
  const vg = g.createRadialGradient(x0 + w / 2, y0 + h / 2, h * 0.3, x0 + w / 2, y0 + h / 2, w * 0.62)
  vg.addColorStop(0, 'rgba(0,0,0,0)')
  vg.addColorStop(1, 'rgba(25,12,4,0.38)')
  g.fillStyle = vg
  g.fillRect(x0, y0, w, h)
}

function paintTitle(g: CanvasRenderingContext2D, text: string, cx: number, cy: number, maxW: number, rand: () => number): void {
  let size = 74
  const set = () => (g.font = `600 ${size}px ${FONT}`)
  set()
  const spaced = g as CanvasRenderingContext2D & { letterSpacing?: string }
  if ('letterSpacing' in spaced) spaced.letterSpacing = '2px'
  while (g.measureText(text).width > maxW && size > 30) {
    size -= 2
    set()
  }
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  const ty = cy - 10

  // carved shadow + painted letters
  g.fillStyle = 'rgba(28,14,5,0.7)'
  g.fillText(text, cx + 2, ty + 3)
  g.fillStyle = '#f2e3c2'
  g.fillText(text, cx, ty)

  // flourish: a painted rule with a little star
  const tw = Math.min(maxW, g.measureText(text).width)
  const ry = ty + size * 0.58
  const half = Math.max(70, tw * 0.42)
  g.strokeStyle = 'rgba(242,227,194,0.85)'
  g.lineWidth = 2.2
  g.lineCap = 'round'
  for (const s of [-1, 1]) {
    g.beginPath()
    g.moveTo(cx + s * 18, ry)
    g.lineTo(cx + s * half, ry)
    g.stroke()
    g.beginPath()
    g.arc(cx + s * (half + 8), ry, 2.4, 0, Math.PI * 2)
    g.fillStyle = 'rgba(242,227,194,0.85)'
    g.fill()
  }
  g.fillStyle = '#f6d58a'
  star(g, cx, ry, 11)

  // wear: flecks of wood showing through the paint
  g.save()
  g.globalCompositeOperation = 'source-atop'
  for (let k = 0; k < 140; k++) {
    const x = cx - tw / 2 + rand() * tw
    const y = ty - size * 0.45 + rand() * size * 1.1
    g.fillStyle = `rgba(110,70,40,${0.25 + rand() * 0.4})`
    g.fillRect(x, y, 1 + rand() * 3, 1 + rand() * 1.5)
  }
  g.restore()
}

export function paintSignAtlas(titles: string[], planks: CanvasImageSource | null, anisotropy: number): SignAtlas {
  const rows = Math.max(1, Math.ceil(titles.length / COLS))
  const H = THREE.MathUtils.ceilPowerOfTwo(rows * CELL_H)
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const g = canvas.getContext('2d')!
  const rand = rng(0x5161)
  const cells: AtlasCell[] = []
  titles.forEach((title, i) => {
    const x0 = (i % COLS) * CELL_W
    const y0 = Math.floor(i / COLS) * CELL_H
    g.save()
    g.beginPath()
    g.rect(x0, y0, CELL_W, CELL_H)
    g.clip()
    paintBoard(g, x0, y0, CELL_W, CELL_H, rand, planks)
    paintTitle(g, title, x0 + CELL_W / 2, y0 + CELL_H / 2, CELL_W - 90, rand)
    g.restore()
    // half-texel inset so mipmaps don't bleed neighbouring boards
    const e = 1.5
    cells.push({ u0: (x0 + e) / W, u1: (x0 + CELL_W - e) / W, v1: 1 - (y0 + e) / H, v0: 1 - (y0 + CELL_H - e) / H })
  })
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = anisotropy
  texture.generateMipmaps = true
  texture.minFilter = THREE.LinearMipmapLinearFilter
  return { texture, cells }
}
