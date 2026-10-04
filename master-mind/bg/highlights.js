// Highlights store (service worker side).
// Content scripts can't reach our IndexedDB (they run in the page's origin), so every highlight write goes
// through these handlers. Extension pages read the store directly but mutate through here as well, so that
// tabs showing the same page stay in sync (MM_HIGHLIGHT_REFRESH / MM_HIGHLIGHT_REMOVE).
import { db, uid } from '../lib/db.js'
import { normalizeUrl, siteOf } from '../lib/text.js'

const STORE = 'highlights'
const MAX_TEXT = 20000
const MAX_NOTE = 10000
const CTX = 48 // prefix / suffix length used for re-anchoring

const str = (v, max) => (typeof v === 'string' ? v : v == null ? '' : String(v)).slice(0, max)
const num = (v, fallback) => (Number.isFinite(v) && v > 0 ? v : fallback)

/** Build a clean record from an incoming (possibly partial) highlight merged over the stored one. */
function clean(input, existing) {
  const now = Date.now()
  const merged = { ...(existing || {}), ...input }
  const url = str(merged.url, 4096)
  const pageKey = normalizeUrl(merged.pageKey || url)
  return {
    id: existing?.id || str(input.id, 80) || uid('hl_'),
    pageKey,
    url: url || pageKey,
    title: str(merged.title, 500).trim() || siteOf(url || pageKey) || 'Untitled page',
    site: str(merged.site, 255).trim() || siteOf(url || pageKey),
    text: str(merged.text, MAX_TEXT),
    prefix: str(merged.prefix, 400).slice(-CTX),
    suffix: str(merged.suffix, 400).slice(0, CTX),
    tag: str(merged.tag, 80) || 'fact',
    note: str(merged.note, MAX_NOTE),
    created: num(existing?.created, num(input.created, now)),
    updated: now,
  }
}

/**
 * Message every tab (other than `exceptTabId`) whose normalized URL is `pageKey`.
 * Tabs without our content script (restricted pages, not yet injected) just reject; that's ignored.
 */
async function notifyTabs(pageKey, message, exceptTabId) {
  if (!pageKey) return 0
  let tabs = []
  try { tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] }) } catch { return 0 }
  const targets = tabs.filter(t => t.id !== exceptTabId && t.id >= 0 && t.url && normalizeUrl(t.url) === pageKey)
  await Promise.all(targets.map(t => chrome.tabs.sendMessage(t.id, message).catch(() => null)))
  return targets.length
}

const byCreated = (a, b) => (a.created || 0) - (b.created || 0)

export const handlers = {
  async HL_LIST({ pageKey }) {
    if (!pageKey) return { ok: false, error: 'pageKey is required' }
    const items = await db.by(STORE, 'pageKey', normalizeUrl(pageKey))
    return { ok: true, items: items.sort(byCreated) }
  },

  /** {highlight}: no id → create; id → update (merged over the stored record; recreated if it was deleted). */
  async HL_SAVE({ highlight }, sender) {
    if (!highlight || typeof highlight !== 'object') return { ok: false, error: 'highlight is required' }
    const existing = highlight.id ? await db.get(STORE, highlight.id) : null
    const rec = clean(highlight, existing)
    if (!rec.text.trim()) return { ok: false, error: 'A highlight needs some text' }
    if (!/^https?:/i.test(rec.pageKey)) return { ok: false, error: 'Highlights can only be saved for web pages' }
    await db.put(STORE, rec)
    const from = sender?.tab?.id
    await notifyTabs(rec.pageKey, { type: 'MM_HIGHLIGHT_REFRESH' }, from)
    // A highlight moved to another page (rare: edited URL) must disappear from the old one.
    if (existing && existing.pageKey !== rec.pageKey) await notifyTabs(existing.pageKey, { type: 'MM_HIGHLIGHT_REMOVE', id: rec.id }, from)
    return { ok: true, highlight: rec }
  },

  /** {id} or {ids: string[]} (bulk, used by the hub's multi-select). */
  async HL_DELETE({ id, ids }, sender) {
    const list = [...new Set([id, ...(Array.isArray(ids) ? ids : [])].filter(x => typeof x === 'string' && x))]
    if (!list.length) return { ok: false, error: 'id is required' }
    const from = sender?.tab?.id
    let deleted = 0
    for (const key of list) {
      const rec = await db.get(STORE, key)
      if (!rec) continue
      await db.delete(STORE, key)
      deleted++
      await notifyTabs(rec.pageKey, { type: 'MM_HIGHLIGHT_REMOVE', id: key }, from)
    }
    return { ok: true, deleted }
  },

  async HL_ALL() {
    const items = await db.all(STORE)
    return { ok: true, items: items.sort((a, b) => (b.created || 0) - (a.created || 0)) }
  },
}

export function init() {}
