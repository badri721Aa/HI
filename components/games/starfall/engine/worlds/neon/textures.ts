/**
 * Procedural textures for the Neon Metropolis, painted into canvases when the map is built (a few
 * milliseconds) and freed when it is left:
 *
 *   panel / panelNormal   riveted cladding panels with rain streaks, and their relief
 *   windows               the skyscrapers' window grid: 16 × 16 panes, lit in clusters
 *   grate                 bar grating with see-through gaps (catwalks, vents)
 *   hazard                yellow and black warning stripes
 *   signs                 the neon atlas (white on black, tinted by the shaders): made-up glyphs,
 *                         made-up words, holo-billboard pictures and a few plain shapes
 *
 * Every word and glyph is invented: the glyphs are random strokes on a grid, each with a ring no
 * real script uses.
 */
import * as THREE from 'three'
import { seeded } from '../geo'

/** A rectangle of the sign atlas in UV space. */
export interface Cell {
  u0: number
  v0: number
  u1: number
  v1: number
}

export interface NeonTextures {
  panel: THREE.CanvasTexture
  panelNormal: THREE.CanvasTexture
  windows: THREE.CanvasTexture
  grate: THREE.CanvasTexture
  hazard: THREE.CanvasTexture
  signs: THREE.CanvasTexture
  dispose(): void
}

/** One repeat of the window texture is this many panes across and up. */
export const WINDOW_GRID = 16

const ATLAS = 1024
const GLYPH = 64
const GLYPH_COLS = ATLAS / GLYPH
const GLYPH_ROWS = 4
const WORD_W = 512
const WORD_H = 128
const ICON = 256
const MISC_Y = 768

/** Count of made-up glyphs in the atlas. */
export const GLYPHS = GLYPH_COLS * GLYPH_ROWS

/** The made-up names on the word signs (index = word cell). */
const WORDS = ['QUORVEX', 'ZEPHLUME', 'VANTHEX', 'OZMIRA'] as const
export type WordId = 0 | 1 | 2 | 3

function cell(x: number, y: number, w: number, h: number, inset = 0): Cell {
  return { u0: (x + inset) / ATLAS, v0: 1 - (y + h - inset) / ATLAS, u1: (x + w - inset) / ATLAS, v1: 1 - (y + inset) / ATLAS }
}

/** Glyph `i` (wraps around the set). */
export function glyphCell(i: number): Cell {
  const k = ((i % GLYPHS) + GLYPHS) % GLYPHS
  return cell((k % GLYPH_COLS) * GLYPH, Math.floor(k / GLYPH_COLS) * GLYPH, GLYPH, GLYPH)
}

/** A made-up word in tube lettering (4 : 1). */
export function wordCell(i: WordId): Cell {
  return cell((i % 2) * WORD_W, GLYPH_ROWS * GLYPH + Math.floor(i / 2) * WORD_H, WORD_W, WORD_H)
}

/** A holo-billboard picture (square): ringed planet, eye, hexagon, sky-car. */
export function iconCell(i: number): Cell {
  return cell((i % 4) * ICON, 512, ICON, ICON)
}

/** Plain shapes: a solid block, a soft disc, an upward chevron, louvre lines and a ring. */
export const SHAPE = {
  solid: cell(0, MISC_Y, GLYPH, GLYPH, 12),
  disc: cell(GLYPH, MISC_Y, GLYPH, GLYPH),
  chevron: cell(GLYPH * 2, MISC_Y, GLYPH, GLYPH),
  louvre: cell(GLYPH * 3, MISC_Y, GLYPH, GLYPH, 4),
  ring: cell(GLYPH * 4, MISC_Y, GLYPH, GLYPH),
} as const

type Paint = { c: HTMLCanvasElement; g: CanvasRenderingContext2D }

function canvas(w: number, h = w): Paint {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')
  if (!g) throw new Error('neon: 2D canvas unavailable')
  return { c, g }
}

export function buildNeonTextures(renderer: THREE.WebGLRenderer): NeonTextures {
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
  const make = (c: HTMLCanvasElement, srgb: boolean, repeat: boolean): THREE.CanvasTexture => {
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.anisotropy = anisotropy
    return t
  }
  const panels = paintPanels()
  const all = {
    panel: make(panels.albedo, true, true),
    panelNormal: make(normalFromHeight(panels.height, 2.2), false, true),
    windows: make(paintWindows(), true, true),
    grate: make(paintGrate(), true, true),
    hazard: make(paintHazard(), true, true),
    signs: make(paintSigns(), false, false),
  }
  return {
    ...all,
    dispose() {
      for (const t of Object.values(all)) t.dispose()
    },
  }
}

/* ── cladding ────────────────────────────────────────────── */

/** Four riveted panels (the texture tiles): brushed metal, grime running down from the seams. */
function paintPanels(): { albedo: HTMLCanvasElement; height: HTMLCanvasElement } {
  const S = 512
  const N = 2
  const P = S / N
  const rnd = seeded(41)
  const a = canvas(S)
  const h = canvas(S)
  h.g.fillStyle = '#808080'
  h.g.fillRect(0, 0, S, S)
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = i * P
      const y = j * P
      const l = Math.round(132 + rnd() * 44)
      a.g.fillStyle = `rgb(${l},${l + 2},${l + 5})`
      a.g.fillRect(x, y, P, P)
      // Brushed hairlines.
      for (let k = 0; k < 90; k++) {
        a.g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.07)'
        a.g.fillRect(x, y + rnd() * P, P, 1)
      }
      // Rain grime running down from the seam above.
      for (let k = 0; k < 8; k++) {
        const len = P * (0.25 + rnd() * 0.65)
        const grad = a.g.createLinearGradient(0, y, 0, y + len)
        grad.addColorStop(0, 'rgba(14,16,22,0.42)')
        grad.addColorStop(1, 'rgba(14,16,22,0)')
        a.g.fillStyle = grad
        a.g.fillRect(x + rnd() * (P - 20), y, 4 + rnd() * 16, len)
      }
      // A slightly dished face in the relief.
      const dish = h.g.createRadialGradient(x + P / 2, y + P / 2, P * 0.1, x + P / 2, y + P / 2, P * 0.75)
      dish.addColorStop(0, 'rgba(255,255,255,0.06)')
      dish.addColorStop(1, 'rgba(0,0,0,0.08)')
      h.g.fillStyle = dish
      h.g.fillRect(x, y, P, P)
      // Rivets along the top and bottom edges.
      for (let k = 0; k < 4; k++) {
        for (const ry of [y + 16, y + P - 16]) {
          const rx = x + P * (0.125 + k * 0.25)
          a.g.fillStyle = 'rgba(0,0,0,0.45)'
          a.g.beginPath()
          a.g.arc(rx + 1, ry + 1.5, 5, 0, Math.PI * 2)
          a.g.fill()
          a.g.fillStyle = `rgb(${l + 28},${l + 30},${l + 34})`
          a.g.beginPath()
          a.g.arc(rx, ry, 4, 0, Math.PI * 2)
          a.g.fill()
          h.g.fillStyle = '#d8d8d8'
          h.g.beginPath()
          h.g.arc(rx, ry, 4.5, 0, Math.PI * 2)
          h.g.fill()
        }
      }
    }
  }
  // Seams: a groove on every panel border (drawn across the edges so the tile wraps).
  for (let k = 0; k <= N; k++) {
    const p = k * P
    for (const [ctx, groove, lip] of [[a.g, '#1c1f25', 'rgba(255,255,255,0.16)'], [h.g, '#2c2c2c', '#909090']] as const) {
      ctx.fillStyle = lip
      ctx.fillRect(p - 5, 0, 10, S)
      ctx.fillRect(0, p - 5, S, 10)
      ctx.fillStyle = groove
      ctx.fillRect(p - 3, 0, 6, S)
      ctx.fillRect(0, p - 3, S, 6)
    }
  }
  return { albedo: a.c, height: h.c }
}

/** A tangent-space normal map from a tileable greyscale height canvas. */
function normalFromHeight(src: HTMLCanvasElement, strength: number): HTMLCanvasElement {
  const S = src.width
  const g = src.getContext('2d')!
  const data = g.getImageData(0, 0, S, S).data
  const out = canvas(S)
  const img = out.g.createImageData(S, S)
  const at = (x: number, y: number) => data[(((y + S) % S) * S + ((x + S) % S)) * 4]
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = ((at(x + 1, y) - at(x - 1, y)) / 255) * strength
      // Canvas rows run downward, texture v runs upward.
      const dy = ((at(x, y - 1) - at(x, y + 1)) / 255) * strength
      const l = Math.hypot(dx, dy, 1)
      const o = (y * S + x) * 4
      img.data[o] = Math.round((-dx / l) * 127.5 + 127.5)
      img.data[o + 1] = Math.round((-dy / l) * 127.5 + 127.5)
      img.data[o + 2] = Math.round((1 / l) * 127.5 + 127.5)
      img.data[o + 3] = 255
    }
  }
  out.g.putImageData(img, 0, 0)
  return out.c
}

/* ── windows ─────────────────────────────────────────────── */

/** Window light colours and how often each turns up. */
const WINDOW_TINTS: ReadonlyArray<readonly [number, number, number, number]> = [
  [255, 226, 176, 0.42],
  [255, 185, 100, 0.16],
  [214, 230, 255, 0.2],
  [138, 223, 255, 0.09],
  [255, 154, 228, 0.07],
  [185, 164, 255, 0.06],
]

/**
 * A 16 × 16 grid of panes on a black wall (black = no light). Whole floors and bays are livelier
 * or darker than others, so lit windows gather in bands and clusters like a real tower at night.
 */
function paintWindows(): HTMLCanvasElement {
  const S = 1024
  const N = WINDOW_GRID
  const P = S / N
  const rnd = seeded(7)
  const { c, g } = canvas(S)
  g.fillStyle = '#04050a'
  g.fillRect(0, 0, S, S)
  const floor = Array.from({ length: N }, () => 0.18 + rnd() * 0.8)
  const bay = Array.from({ length: N }, () => 0.55 + rnd() * 0.6)
  floor[3] = 0.04
  floor[9] = 1.35
  floor[13] = 0.1
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = i * P + 8
      const y = j * P + 12
      const w = P - 16
      const h = P - 22
      if (rnd() > floor[j] * bay[i] * 0.72) {
        // Dark glass with a faint reflection of the sky.
        g.fillStyle = '#070b15'
        g.fillRect(x, y, w, h)
        const sky = g.createLinearGradient(0, y, 0, y + h)
        sky.addColorStop(0, 'rgba(70,84,150,0.2)')
        sky.addColorStop(1, 'rgba(70,84,150,0)')
        g.fillStyle = sky
        g.fillRect(x, y, w, h)
        continue
      }
      let pick = rnd()
      let tint = WINDOW_TINTS[0]
      for (const t of WINDOW_TINTS) {
        tint = t
        if ((pick -= t[3]) <= 0) break
      }
      const b = 0.5 + rnd() * 0.5
      const glow = g.createLinearGradient(0, y, 0, y + h)
      glow.addColorStop(0, shade(tint, b))
      glow.addColorStop(1, shade(tint, b * 0.5))
      g.fillStyle = glow
      g.fillRect(x, y, w, h)
      const kind = rnd()
      if (kind < 0.3) {
        // Blinds part of the way down.
        const down = y + h * (0.3 + rnd() * 0.7)
        g.fillStyle = 'rgba(0,0,0,0.4)'
        for (let yy = y + 2; yy < down; yy += 5) g.fillRect(x, yy, w, 2)
      } else if (kind < 0.5) {
        g.fillStyle = 'rgba(0,0,0,0.5)'
        g.fillRect(x + (rnd() < 0.5 ? 0 : w * 0.56), y, w * 0.44, h)
      } else if (kind < 0.72) {
        // Something standing in the room.
        g.fillStyle = 'rgba(0,0,0,0.62)'
        g.fillRect(x + rnd() * w * 0.5, y + h * 0.6, w * (0.2 + rnd() * 0.3), h * 0.4)
      }
      g.fillStyle = 'rgba(0,0,0,0.6)'
      g.fillRect(x + w / 2 - 1, y, 2, h)
    }
  }
  return c
}

function shade(rgb: readonly [number, number, number, number], k: number): string {
  return `rgb(${Math.round(rgb[0] * k)},${Math.round(rgb[1] * k)},${Math.round(rgb[2] * k)})`
}

/* ── grating and warning stripes ─────────────────────────── */

/** Bar grating: close-set bearing bars and two cross rods per tile; the gaps are transparent. */
function paintGrate(): HTMLCanvasElement {
  const S = 128
  const { c, g } = canvas(S)
  g.clearRect(0, 0, S, S)
  for (let y = 0; y < S; y += 16) {
    g.fillStyle = '#7d848f'
    g.fillRect(0, y, S, 7)
    g.fillStyle = '#b4bcc8'
    g.fillRect(0, y, S, 2)
    g.fillStyle = '#3c4048'
    g.fillRect(0, y + 6, S, 1)
  }
  for (let x = 0; x < S; x += 64) {
    g.fillStyle = '#8a919c'
    g.fillRect(x, 0, 6, S)
    g.fillStyle = '#c0c8d2'
    g.fillRect(x, 0, 2, S)
  }
  return c
}

/** Diagonal yellow and black stripes, scuffed. */
function paintHazard(): HTMLCanvasElement {
  const S = 128
  const rnd = seeded(13)
  const { c, g } = canvas(S)
  const img = g.createImageData(S, S)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dark = (x + y) % 64 < 30
      const n = 0.86 + rnd() * 0.14
      const o = (y * S + x) * 4
      img.data[o] = (dark ? 22 : 232) * n
      img.data[o + 1] = (dark ? 22 : 178) * n
      img.data[o + 2] = (dark ? 26 : 40) * n
      img.data[o + 3] = 255
    }
  }
  g.putImageData(img, 0, 0)
  for (let k = 0; k < 26; k++) {
    g.strokeStyle = `rgba(20,20,24,${0.12 + rnd() * 0.25})`
    g.lineWidth = 1 + rnd() * 2
    g.beginPath()
    const x = rnd() * S
    const y = rnd() * S
    g.moveTo(x, y)
    g.lineTo(x + (rnd() - 0.5) * 50, y + (rnd() - 0.5) * 14)
    g.stroke()
  }
  return c
}

/* ── the sign atlas ──────────────────────────────────────── */

/** Stroke the current path twice: a soft halo, then the bright tube. */
function tube(g: CanvasRenderingContext2D, width: number, draw: () => void): void {
  g.lineCap = 'round'
  g.lineJoin = 'round'
  g.shadowColor = '#ffffff'
  g.shadowBlur = width * 1.6
  g.strokeStyle = 'rgba(255,255,255,0.5)'
  g.lineWidth = width
  draw()
  g.shadowBlur = 0
  g.strokeStyle = '#ffffff'
  g.lineWidth = width * 0.72
  draw()
}

function paintSigns(): HTMLCanvasElement {
  const { c, g } = canvas(ATLAS)
  g.fillStyle = '#000000'
  g.fillRect(0, 0, ATLAS, ATLAS)
  const rnd = seeded(2077)
  for (let i = 0; i < GLYPHS; i++) paintGlyph(g, (i % GLYPH_COLS) * GLYPH, Math.floor(i / GLYPH_COLS) * GLYPH, rnd)
  WORDS.forEach((w, i) => paintWord(g, w, (i % 2) * WORD_W, GLYPH_ROWS * GLYPH + Math.floor(i / 2) * WORD_H))
  for (let i = 0; i < 4; i++) paintIcon(g, i, i * ICON, 512)
  paintShapes(g)
  return c
}

/**
 * A made-up glyph: three to five strokes along a 4 × 4 grid (so it reads like a written sign),
 * one short diagonal and a small ring.
 */
function paintGlyph(g: CanvasRenderingContext2D, x0: number, y0: number, rnd: () => number): void {
  const m = GLYPH * 0.2
  const u = (GLYPH - m * 2) / 4
  const px = (i: number) => x0 + m + i * u
  const py = (j: number) => y0 + m + j * u
  const int = (n: number) => Math.floor(rnd() * n)
  /** A stroke at least two cells long along one grid line: [from, to]. */
  const span = (): [number, number] => {
    const a = int(3)
    return [a, a + 2 + int(3 - a)]
  }
  // Segments in grid units: [x0, y0, x1, y1].
  const segs: Array<[number, number, number, number]> = []
  const rows = 1 + int(3)
  for (let k = 0; k < rows; k++) {
    const [a, b] = span()
    const j = int(5)
    segs.push([a, j, b, j])
  }
  const cols = 1 + int(2)
  for (let k = 0; k < cols; k++) {
    const [a, b] = span()
    const i = int(5)
    segs.push([i, a, i, b])
  }
  const dx = int(3)
  const dy = int(3)
  segs.push([dx, dy + 2, dx + 1.4, dy + 0.6])
  const rx = px(int(5))
  const ry = py(int(5))
  tube(g, GLYPH * 0.085, () => {
    g.beginPath()
    for (const [ax, ay, bx, by] of segs) {
      g.moveTo(px(ax), py(ay))
      g.lineTo(px(bx), py(by))
    }
    g.moveTo(rx + u * 0.42, ry)
    g.arc(rx, ry, u * 0.42, 0, Math.PI * 2)
    g.stroke()
  })
}

/** A made-up name in outlined tube letters, fitted to its 4 : 1 cell. */
function paintWord(g: CanvasRenderingContext2D, word: string, x0: number, y0: number): void {
  g.save()
  g.font = "800 78px 'Trebuchet MS', 'Segoe UI', 'DejaVu Sans', Verdana, Arial, sans-serif"
  g.textBaseline = 'middle'
  const gap = 12
  const widths = [...word].map(ch => g.measureText(ch).width)
  const total = widths.reduce((s, w) => s + w, 0) + gap * (word.length - 1)
  const fit = Math.min(1, (WORD_W - 56) / total)
  g.translate(x0 + WORD_W / 2 - (total * fit) / 2, y0 + WORD_H / 2 + 3)
  g.scale(fit, 1)
  tube(g, 6, () => {
    let x = 0
    for (let i = 0; i < word.length; i++) {
      g.strokeText(word[i], x, 0)
      x += widths[i] + gap
    }
  })
  g.restore()
}

/** Holo-billboard pictures: a ringed planet, a watching eye, nested hexagons, a sky-car. */
function paintIcon(g: CanvasRenderingContext2D, i: number, x0: number, y0: number): void {
  const cx = x0 + ICON / 2
  const cy = y0 + ICON / 2
  g.save()
  g.beginPath()
  g.rect(x0 + 6, y0 + 6, ICON - 12, ICON - 12)
  g.clip()
  tube(g, 7, () => {
    g.beginPath()
    if (i === 0) {
      g.arc(cx, cy, 58, 0, Math.PI * 2)
      g.moveTo(cx + 108 * Math.cos(-0.28), cy + 108 * Math.sin(-0.28))
      g.ellipse(cx, cy, 108, 30, -0.28, 0, Math.PI * 2)
      for (const [sx, sy] of [[-84, -78], [78, -86], [92, 70], [-70, 84]]) {
        g.moveTo(cx + sx - 9, cy + sy)
        g.lineTo(cx + sx + 9, cy + sy)
        g.moveTo(cx + sx, cy + sy - 9)
        g.lineTo(cx + sx, cy + sy + 9)
      }
    } else if (i === 1) {
      g.moveTo(cx - 104, cy)
      g.quadraticCurveTo(cx, cy - 92, cx + 104, cy)
      g.quadraticCurveTo(cx, cy + 92, cx - 104, cy)
      g.moveTo(cx + 34, cy)
      g.arc(cx, cy, 34, 0, Math.PI * 2)
      g.moveTo(cx + 10, cy)
      g.arc(cx, cy, 10, 0, Math.PI * 2)
      for (let k = -2; k <= 2; k++) {
        g.moveTo(cx + k * 34, cy - 74 + Math.abs(k) * 12)
        g.lineTo(cx + k * 44, cy - 104 + Math.abs(k) * 14)
      }
    } else if (i === 2) {
      for (const r of [104, 68, 30]) {
        for (let k = 0; k <= 6; k++) {
          const a = (k / 6) * Math.PI * 2 + Math.PI / 6
          const px = cx + Math.cos(a) * r
          const py = cy + Math.sin(a) * r
          if (k === 0) g.moveTo(px, py)
          else g.lineTo(px, py)
        }
      }
      g.moveTo(cx, cy - 104)
      g.lineTo(cx, cy - 68)
      g.moveTo(cx, cy + 68)
      g.lineTo(cx, cy + 104)
    } else {
      g.moveTo(cx - 96, cy + 14)
      g.lineTo(cx - 70, cy - 22)
      g.lineTo(cx - 6, cy - 32)
      g.lineTo(cx + 50, cy - 14)
      g.lineTo(cx + 100, cy + 4)
      g.lineTo(cx + 92, cy + 24)
      g.lineTo(cx - 88, cy + 30)
      g.closePath()
      g.moveTo(cx - 46, cy - 16)
      g.lineTo(cx + 16, cy - 16)
      for (let k = 0; k < 3; k++) {
        g.moveTo(cx - 108 + k * 14, cy + 54 + k * 16)
        g.lineTo(cx + 10 + k * 26, cy + 54 + k * 16)
      }
      g.moveTo(cx + 78, cy + 12)
      g.arc(cx + 72, cy + 12, 6, 0, Math.PI * 2)
    }
    g.stroke()
  })
  g.restore()
}

function paintShapes(g: CanvasRenderingContext2D): void {
  const y = MISC_Y
  g.fillStyle = '#ffffff'
  g.fillRect(0, y, GLYPH, GLYPH)
  // Soft disc (lamp faces).
  const d = g.createRadialGradient(GLYPH * 1.5, y + GLYPH / 2, 0, GLYPH * 1.5, y + GLYPH / 2, GLYPH * 0.46)
  d.addColorStop(0, '#ffffff')
  d.addColorStop(0.45, 'rgba(255,255,255,0.85)')
  d.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = d
  g.fillRect(GLYPH, y, GLYPH, GLYPH)
  // Double chevron pointing up (the way on).
  tube(g, 6, () => {
    g.beginPath()
    for (const oy of [0, 18]) {
      g.moveTo(GLYPH * 2 + 14, y + 30 + oy)
      g.lineTo(GLYPH * 2.5, y + 14 + oy)
      g.lineTo(GLYPH * 3 - 14, y + 30 + oy)
    }
    g.stroke()
  })
  // Louvre lines.
  g.fillStyle = '#ffffff'
  for (let k = 0; k < 4; k++) g.fillRect(GLYPH * 3, y + 6 + k * 16, GLYPH, 6)
  // Ring.
  tube(g, 6, () => {
    g.beginPath()
    g.arc(GLYPH * 4.5, y + GLYPH / 2, GLYPH * 0.3, 0, Math.PI * 2)
    g.stroke()
  })
}
