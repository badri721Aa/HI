// Pure text utilities shared by extension pages and the service worker (ES module).
// content/core.js ships classic-script copies of normalizeUrl and readingMinutes for content scripts.

const TRACKING = /^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$|ref$|ref_src$|igshid$|si$|spm$)/i

/** Canonical key for a page: no hash, no tracking params, no trailing slash. */
export function normalizeUrl(href) {
  try {
    const u = new URL(href)
    u.hash = ''
    for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k)
    u.searchParams.sort()
    let s = u.toString()
    if (s.endsWith('/') && u.pathname !== '/') s = s.slice(0, -1)
    return s
  } catch {
    return String(href || '')
  }
}

export const siteOf = href => { try { return new URL(href).hostname.replace(/^www\./, '') } catch { return '' } }

export const wordCount = s => (String(s).match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length

/** Average adult silent reading speed ≈ 230 wpm. */
export const readingMinutes = words => Math.max(1, Math.round(words / 230))

const STOP = new Set(('a about above after again against all also am an and any are as at be because been before being below between both but by can could did do does doing down during each even few for from further had has have having he her here hers herself him himself his how however i if in into is it its itself just like may me might more most must my myself no nor not now of off on once only or other our ours ourselves out over own same say says said she should so some such than that the their theirs them themselves then there these they this those through to too under until up upon us very was we well were what when where which while who whom why will with within without would you your yours yourself yourselves new one two use used using many much make made get got also via per etc vs').split(' '))

/** Lowercased content words, stop words removed. */
export function tokens(text) {
  return (String(text).toLowerCase().match(/[\p{L}][\p{L}\p{N}-]{2,}/gu) || []).filter(w => !STOP.has(w))
}

/** Top-N keywords by term frequency (with a light bonus for capitalized terms in the source). */
export function keywords(text, n = 12) {
  const tf = new Map()
  for (const w of tokens(text)) tf.set(w, (tf.get(w) || 0) + 1)
  const caps = new Set((String(text).match(/\b[A-Z][a-zA-Z]{2,}\b/g) || []).map(w => w.toLowerCase()))
  return [...tf.entries()]
    .map(([w, c]) => [w, c * (caps.has(w) ? 1.5 : 1) * Math.min(1.6, 0.6 + w.length / 10)])
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([w]) => w)
}

/** Jaccard-style overlap between two keyword lists, 0..1. */
export function overlap(a, b) {
  if (!a?.length || !b?.length) return 0
  const A = new Set(a)
  const inter = b.filter(x => A.has(x)).length
  return inter / Math.min(A.size, new Set(b).size)
}

export const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

export function timeAgo(ts, now = Date.now()) {
  const s = Math.round((now - ts) / 1000)
  if (s < 60) return 'just now'
  const m = Math.round(s / 60); if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60); if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24); if (d < 30) return `${d}d ago`
  return new Date(ts).toLocaleDateString()
}

export function download(filename, content, type = 'text/plain') {
  const blob = content instanceof Blob ? content : new Blob([content], { type })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

export const slug = s => String(s || 'untitled').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 60) || 'untitled'
