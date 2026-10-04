// Canvas OCR, service-worker side.
//   OCR_CAPTURE   {rect: {x, y, w, h} (CSS px), dpr} from content/ocr.js
//                 → captures the visible tab, crops + scales it with OffscreenCanvas, runs the `ocr` task → {ok, text}
//   OCR_CANCEL    (from content) → aborts the tab's running OCR request
//   OCR_SAVE_NOTE {text, url, title} → stores the text as a note tagged "ocr" → {ok, id}
// After the screenshot is taken the tab gets MM_OCR_STATUS {stage: 'reading'} so it can show its result card
// without the card ending up in the capture.
import { runTask } from '../lib/ai.js'
import { db, uid } from '../lib/db.js'
import { siteOf } from '../lib/text.js'

const MAX_EDGE = 1568 // Claude's vision sweet spot: long edge ≤ 1568 px
const MIN_EDGE = 512 // tiny crops are upscaled (up to 2×) so small print stays legible
const CAPTURE_GAP = 550 // captureVisibleTab allows 2 calls per second
const MAX_TEXT = 100000

const running = new Map() // tabId → AbortController
const sleep = ms => new Promise(r => setTimeout(r, ms))

// ───────── rate-limited capture queue ─────────
let queue = Promise.resolve()
let lastCapture = 0
function captureVisible(windowId) {
  const job = queue.then(async () => {
    for (let attempt = 0; ; attempt++) {
      const wait = lastCapture + CAPTURE_GAP - Date.now()
      if (wait > 0) await sleep(wait)
      lastCapture = Date.now()
      try {
        return await chrome.tabs.captureVisibleTab(windowId, { format: 'png' })
      } catch (e) {
        if (attempt < 3 && /MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND|quota/i.test(String(e?.message))) { await sleep(CAPTURE_GAP); continue }
        throw e
      }
    }
  })
  queue = job.catch(() => {})
  return job
}

// ───────── image helpers ─────────
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const num = v => (Number.isFinite(Number(v)) ? Number(v) : NaN)

/** Base64 without String.fromCharCode(...hugeArray) blowing the call stack. */
export function bytesToBase64(bytes) {
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK))
  return btoa(bin)
}

/**
 * Crop `bitmap` to the CSS-pixel rect, then scale so the long edge is ≤ MAX_EDGE.
 * @returns {Promise<{base64: string, width: number, height: number}>}
 */
async function cropToPng(bitmap, rect, dpr) {
  // The screenshot is the visible viewport in device pixels; devicePixelRatio already includes page zoom.
  const x0 = clamp(Math.floor(rect.x * dpr), 0, bitmap.width - 1)
  const y0 = clamp(Math.floor(rect.y * dpr), 0, bitmap.height - 1)
  const x1 = clamp(Math.ceil((rect.x + rect.w) * dpr), x0 + 1, bitmap.width)
  const y1 = clamp(Math.ceil((rect.y + rect.h) * dpr), y0 + 1, bitmap.height)
  const cw = x1 - x0
  const ch = y1 - y0
  const long = Math.max(cw, ch)
  const scale = long > MAX_EDGE ? MAX_EDGE / long : long < MIN_EDGE ? Math.min(2, MIN_EDGE / long) : 1
  const width = Math.max(1, Math.round(cw * scale))
  const height = Math.max(1, Math.round(ch * scale))
  const canvas = new OffscreenCanvas(width, height)
  const g = canvas.getContext('2d')
  g.fillStyle = '#fff'
  g.fillRect(0, 0, width, height)
  g.imageSmoothingEnabled = true
  g.imageSmoothingQuality = 'high'
  g.drawImage(bitmap, x0, y0, cw, ch, 0, 0, width, height)
  const blob = await canvas.convertToBlob({ type: 'image/png' })
  return { base64: bytesToBase64(new Uint8Array(await blob.arrayBuffer())), width, height }
}

// ───────── handlers ─────────
async function capture(msg, sender) {
  const tab = sender?.tab
  if (!tab?.id) return { ok: false, code: 'BAD_REQUEST', error: 'Text capture works from a web page.' }
  const r = msg.rect || {}
  const rect = { x: num(r.x), y: num(r.y), w: num(r.w), h: num(r.h) }
  if (![rect.x, rect.y, rect.w, rect.h].every(Number.isFinite) || rect.w < 1 || rect.h < 1) {
    return { ok: false, code: 'BAD_REQUEST', error: 'Select an area to capture first.' }
  }
  const dpr = clamp(num(msg.dpr) || 1, 0.25, 8)

  // A newer capture from the same tab replaces the older one.
  running.get(tab.id)?.abort()
  const ctrl = new AbortController()
  running.set(tab.id, ctrl)
  try {
    const live = await chrome.tabs.get(tab.id).catch(() => null)
    if (!live?.active) return { ok: false, code: 'NOT_VISIBLE', error: 'Switch back to the tab you want to capture and try again.' }

    let dataUrl
    try {
      dataUrl = await captureVisible(live.windowId)
    } catch (e) {
      return { ok: false, code: 'CAPTURE', error: `Chrome wouldn’t capture this tab: ${e?.message || e}` }
    }
    if (ctrl.signal.aborted) return { ok: false, code: 'ABORT', error: 'Stopped.' }
    chrome.tabs.sendMessage(tab.id, { type: 'MM_OCR_STATUS', stage: 'reading' }, { frameId: sender.frameId ?? 0 }).catch(() => {})

    const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob())
    let image
    try { image = await cropToPng(bitmap, rect, dpr) } finally { bitmap.close() }

    try {
      const res = await runTask('ocr', { image: image.base64 }, { signal: ctrl.signal })
      return { ok: true, text: String(res.text || '').trim(), truncated: !!res.truncated, size: { w: image.width, h: image.height } }
    } catch (e) {
      return { ok: false, code: e.code || 'API', error: e.message || String(e) }
    }
  } finally {
    if (running.get(tab.id) === ctrl) running.delete(tab.id)
  }
}

function cancel(_msg, sender) {
  abortTab(sender?.tab?.id)
  return { ok: true }
}

const mdEscape = s => String(s).replace(/([\\[\]*_`<>])/g, '\\$1')
const mdUrl = u => String(u).replace(/[\s()<>]/g, c => encodeURIComponent(c))

async function saveNote(msg, sender) {
  const text = String(msg.text ?? '').trim().slice(0, MAX_TEXT)
  if (!text) return { ok: false, error: 'There is no text to save.' }
  const rawUrl = String(msg.url || sender?.tab?.url || '')
  const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : ''
  const pageTitle = String(msg.title || sender?.tab?.title || '').replace(/\s+/g, ' ').trim().slice(0, 300) || siteOf(url) || 'Untitled page'
  const site = siteOf(url) || 'screen'
  const now = Date.now()
  const when = new Date(now).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  const body = `${text}\n\n---\n\n*Captured from the screen${url ? ` · Source: [${mdEscape(pageTitle)}](${mdUrl(url)})` : ''} · ${when}*\n`
  const note = {
    id: uid('note_'),
    title: `Captured text: ${site}`,
    body,
    tags: ['ocr'],
    sources: url ? [{ url, title: pageTitle }] : [],
    created: now,
    updated: now,
    pinned: false,
  }
  await db.put('notes', note)
  return { ok: true, id: note.id }
}

export const handlers = {
  OCR_CAPTURE: capture,
  OCR_CANCEL: cancel,
  OCR_SAVE_NOTE: saveNote,
}

function abortTab(tabId) {
  running.get(tabId)?.abort()
  running.delete(tabId)
}

export function init() {
  // The card that would show the result is gone: stop paying for the request.
  chrome.tabs.onRemoved.addListener(abortTab)
  chrome.webNavigation.onCommitted.addListener(d => { if (d.frameId === 0) abortTab(d.tabId) })
}
