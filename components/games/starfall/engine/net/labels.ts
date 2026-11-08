/**
 * Canvas-drawn sprites above remote players: a name tag (pill with the
 * player's colour dot) and a chat bubble. Text is only ever drawn with
 * fillText — never interpreted as markup.
 *
 * Canvases have a fixed size so a redraw never reallocates the GPU texture;
 * the visible shape is centred inside and the rest stays transparent.
 */
import * as THREE from 'three'

const INK = 'rgba(11, 15, 20, 0.66)'
const PAPER = 'rgba(246, 241, 233, 0.94)'
const TEXT = '#F3EEE6'
const TEXT_INK = '#16110c'

export const TAG_W = 512
export const TAG_H = 96
export const BUBBLE_W = 512
export const BUBBLE_H = 200

function fontFamily(): string {
  try {
    const f = getComputedStyle(document.body).fontFamily
    if (f) return `${f}, system-ui, sans-serif`
  } catch {
    /* no DOM */
  }
  return 'system-ui, -apple-system, "Segoe UI", sans-serif'
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}

/** A sprite backed by its own canvas texture. */
export class CanvasSprite {
  readonly sprite: THREE.Sprite
  readonly canvas: HTMLCanvasElement
  readonly g: CanvasRenderingContext2D
  readonly texture: THREE.CanvasTexture
  readonly material: THREE.SpriteMaterial
  readonly aspect: number

  constructor(w: number, h: number, anisotropy: number) {
    this.canvas = document.createElement('canvas')
    this.canvas.width = w
    this.canvas.height = h
    this.g = this.canvas.getContext('2d')!
    this.aspect = w / h
    this.texture = new THREE.CanvasTexture(this.canvas)
    this.texture.colorSpace = THREE.SRGBColorSpace
    this.texture.anisotropy = anisotropy
    this.material = new THREE.SpriteMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    })
    this.sprite = new THREE.Sprite(this.material)
    this.sprite.center.set(0.5, 0)
    this.sprite.renderOrder = 10
  }

  dispose(): void {
    this.sprite.removeFromParent()
    this.texture.dispose()
    this.material.dispose()
  }
}

/** Name pill: coloured dot + name; dimmed when the player is away in a menu. */
export function drawNameTag(s: CanvasSprite, name: string, color: string, away: boolean): void {
  const g = s.g
  const W = s.canvas.width
  const H = s.canvas.height
  g.clearRect(0, 0, W, H)
  const family = fontFamily()
  let size = 40
  g.font = `600 ${size}px ${family}`
  const pad = 26
  const dot = 11
  const gap = 14
  const maxText = W - pad * 2 - dot * 2 - gap - 8
  let tw = g.measureText(name).width
  if (tw > maxText) {
    size = Math.max(24, Math.floor((size * maxText) / tw))
    g.font = `600 ${size}px ${family}`
    tw = Math.min(maxText, g.measureText(name).width)
  }
  const h = 64
  const w = Math.ceil(pad * 2 + dot * 2 + gap + tw)
  const x = Math.round((W - w) / 2)
  const y = Math.round((H - h) / 2)

  g.globalAlpha = away ? 0.6 : 1
  roundRect(g, x, y, w, h, h / 2)
  g.fillStyle = INK
  g.fill()
  g.lineWidth = 2
  g.strokeStyle = 'rgba(255, 255, 255, 0.14)'
  g.stroke()

  const cx = x + pad + dot
  const cy = y + h / 2
  g.beginPath()
  g.arc(cx, cy, dot + 3, 0, Math.PI * 2)
  g.fillStyle = 'rgba(255, 255, 255, 0.22)'
  g.fill()
  g.beginPath()
  g.arc(cx, cy, dot, 0, Math.PI * 2)
  g.fillStyle = color
  g.fill()

  g.fillStyle = TEXT
  g.textBaseline = 'middle'
  g.textAlign = 'left'
  g.fillText(name, cx + dot + gap, cy + 1, maxText)
  g.globalAlpha = 1
  s.texture.needsUpdate = true
}

/** Splits text into at most `maxLines` lines that fit `width` (ellipsis on overflow). */
function wrap(g: CanvasRenderingContext2D, text: string, width: number, maxLines: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let line = ''
  for (let i = 0; i < words.length; i++) {
    let word = words[i]
    // Hard-break words longer than a line.
    while (g.measureText(word).width > width) {
      let cut = word.length - 1
      while (cut > 1 && g.measureText(word.slice(0, cut)).width > width) cut--
      if (line) {
        lines.push(line)
        line = ''
      }
      lines.push(word.slice(0, cut))
      word = word.slice(cut)
    }
    const next = line ? `${line} ${word}` : word
    if (g.measureText(next).width <= width) line = next
    else {
      if (line) lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  if (lines.length > maxLines) {
    lines.length = maxLines
    let last = lines[maxLines - 1]
    while (last.length > 1 && g.measureText(`${last}…`).width > width) last = last.slice(0, -1)
    lines[maxLines - 1] = `${last.trimEnd()}…`
  }
  return lines
}

/** Speech bubble with a small tail, anchored to the bottom centre of the canvas. */
export function drawBubble(s: CanvasSprite, text: string): void {
  const g = s.g
  const W = s.canvas.width
  const H = s.canvas.height
  g.clearRect(0, 0, W, H)
  const size = 32
  g.font = `500 ${size}px ${fontFamily()}`
  const padX = 24
  const padY = 16
  const lineH = Math.round(size * 1.22)
  const lines = wrap(g, text, W - padX * 2 - 8, 3)
  let tw = 0
  for (const l of lines) tw = Math.max(tw, g.measureText(l).width)
  const tail = 14
  const w = Math.ceil(Math.min(W - 4, tw + padX * 2))
  const h = lines.length * lineH + padY * 2
  const x = Math.round((W - w) / 2)
  const y = H - tail - h - 2

  roundRect(g, x, y, w, h, 22)
  g.fillStyle = PAPER
  g.fill()
  g.beginPath()
  g.moveTo(W / 2 - tail, y + h - 1)
  g.lineTo(W / 2, y + h + tail)
  g.lineTo(W / 2 + tail, y + h - 1)
  g.closePath()
  g.fill()

  g.fillStyle = TEXT_INK
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  for (let i = 0; i < lines.length; i++) g.fillText(lines[i], W / 2, y + padY + lineH * (i + 0.5) + 1)
  s.texture.needsUpdate = true
}
