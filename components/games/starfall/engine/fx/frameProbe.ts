/**
 * FrameProbe — a non-blocking look at the canvas.
 *
 * A plain readPixels waits for the GPU to finish everything queued, which costs a frame or more.
 * This copies two short rows of the canvas into a pixel-pack buffer instead, drops a fence behind
 * the copy, and hands back the result a frame or two later, once the GPU has passed the fence.
 *
 * What it reports is whether those rows are flat and dark — what a failed post chain leaves
 * behind (black, or the grade's lift over black).
 */
import type * as THREE from 'three'

/** The rows sampled (fractions of the height), across the central 40% of the width. */
const ROWS = [0.45, 0.55]
const SPAN = 0.4

export class FrameProbe {
  private buf: WebGLBuffer | null = null
  private sync: WebGLSync | null = null
  /** Pixels per row the buffer was sized for. */
  private n = 0
  private data = new Uint8Array(0)

  constructor(private renderer: THREE.WebGLRenderer) {}

  private get gl(): WebGL2RenderingContext {
    return this.renderer.getContext() as WebGL2RenderingContext
  }

  /** A read is in flight. */
  get busy(): boolean {
    return this.sync !== null
  }

  /** Queues a copy of what the canvas holds right now. False if it can't (context lost). */
  request(): boolean {
    const gl = this.gl
    if (this.sync || gl.isContextLost()) return false
    const w = gl.drawingBufferWidth
    const h = gl.drawingBufferHeight
    const n = Math.max(1, Math.floor(w * SPAN))
    const x = Math.floor((w - n) / 2)
    if (!this.buf) this.buf = gl.createBuffer()
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.buf)
    if (n !== this.n) {
      this.n = n
      this.data = new Uint8Array(n * 4 * ROWS.length)
      gl.bufferData(gl.PIXEL_PACK_BUFFER, this.data.byteLength, gl.STREAM_READ)
    }
    // Read from the canvas. The last pass can leave an offscreen buffer bound for reading, and
    // three's binding cache may not match GL there: set GL first, then the cache.
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null)
    this.renderer.state.bindFramebuffer(gl.READ_FRAMEBUFFER, null)
    ROWS.forEach((fy, i) => gl.readPixels(x, Math.floor(h * fy), n, 1, gl.RGBA, gl.UNSIGNED_BYTE, i * n * 4))
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null)
    this.sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)
    return this.sync !== null
  }

  /** The finished read: true = flat and dark. null while the GPU is still on it (or nothing queued). */
  poll(): boolean | null {
    const gl = this.gl
    if (!this.sync) return null
    if (gl.isContextLost()) {
      this.reset()
      return null
    }
    if (gl.getSyncParameter(this.sync, gl.SYNC_STATUS) !== gl.SIGNALED) return null
    gl.deleteSync(this.sync)
    this.sync = null
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.buf)
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, this.data)
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null)
    const px = this.data
    let lo = 255
    let hi = 0
    for (let i = 0; i < px.length; i += 4) {
      const v = Math.max(px[i], px[i + 1], px[i + 2])
      if (v < lo) lo = v
      if (v > hi) hi = v
    }
    return hi <= 48 && hi - lo <= 6
  }

  /** Drops any read in flight. */
  cancel(): void {
    if (this.sync && !this.gl.isContextLost()) this.gl.deleteSync(this.sync)
    this.sync = null
  }

  /** Forgets every GL object (they died with a lost context). */
  reset(): void {
    this.sync = null
    this.buf = null
    this.n = 0
  }

  dispose(): void {
    this.cancel()
    if (this.buf && !this.gl.isContextLost()) this.gl.deleteBuffer(this.buf)
    this.reset()
  }
}
