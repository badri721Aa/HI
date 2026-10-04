// Highlights store (service worker side).
// Content scripts can't reach our IndexedDB (they run in the page's origin), so every highlight write goes
// through these handlers. Extension pages read the store directly but mutate through here as well, so that
// tabs showing the same page stay in sync (MM_HIGHLIGHT_REFRESH / MM_HIGHLIGHT_REMOVE).
//
// Incognito: the extension runs in Chrome's default "spanning" mode, so this one worker also serves Incognito
// tabs, and the IndexedDB store is the regular profile's, on disk. Like history (bg/history.js), nothing an
// Incognito tab creates is written there: its new highlights live in chrome.storage.session (memory only, and
// not readable by content scripts), are listed only to Incognito tabs, and are dropped when the last Incognito
// window closes. Highlights saved earlier in a regular window still show (and can be edited) in Incognito.
import { db, uid } from '../lib/db.js'
import { normalizeUrl, siteOf } from '../lib/text.js'

const STORE = 'highlights'
const MAX_TEXT = 20000
const MAX_NOTE = 10000
const CTX = 48 // prefix / suffix length used for re-anchoring
const SESSION_KEY = 'incognitoHighlights'
const UNDO_MS = 2 * 60e3 // a stored highlight deleted from an Incognito tab can be restored (Undo) for this long

const str = (v, max) => (typeof v === 'string' ? v : v == null ? '' : String(v)).slice(0, max)
const num = (v, fallback) => (Number.isFinite(v) && v > 0 ? v : fallback)
const isIncognito = sender => !!sender?.tab?.incognito

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

// ───────── Incognito session store (memory only) ─────────
let sessionP = null
/** id → highlight made in an Incognito tab. One shared Map; every change is written back to storage.session. */
const session = () => (sessionP ||= chrome.storage.session.get(SESSION_KEY)
  .then(r => new Map(Object.entries(r?.[SESSION_KEY] || {})))
  .catch(() => new Map()))
const saveSession = map => chrome.storage.session.set({ [SESSION_KEY]: Object.fromEntries(map) })
/** Ids of stored highlights an Incognito tab just deleted, so its Undo puts them back in the store. */
const tombstones = new Map()

async function clearSessionIfNoIncognito() {
  let wins = []
  try { wins = await chrome.windows.getAll() } catch { return }
  if (wins.some(w => w.incognito)) return
  sessionP = Promise.resolve(new Map())
  tombstones.clear()
  await chrome.storage.session.remove(SESSION_KEY).catch(() => {})
}

/**
 * Message every tab (other than `exceptTabId`) whose normalized URL is `pageKey`; with `incognitoOnly`, only
 * Incognito tabs (an Incognito highlight must never reach a regular window).
 * Tabs without our content script (restricted pages, not yet injected) just reject; that's ignored.
 */
async function notifyTabs(pageKey, message, exceptTabId, incognitoOnly = false) {
  if (!pageKey) return 0
  let tabs = []
  try { tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] }) } catch { return 0 }
  const targets = tabs.filter(t => t.id !== exceptTabId && t.id >= 0 && t.url && (!incognitoOnly || t.incognito) && normalizeUrl(t.url) === pageKey)
  await Promise.all(targets.map(t => chrome.tabs.sendMessage(t.id, message).catch(() => null)))
  return targets.length
}

const byCreated = (a, b) => (a.created || 0) - (b.created || 0)

export const handlers = {
  async HL_LIST({ pageKey }, sender) {
    if (!pageKey) return { ok: false, error: 'pageKey is required' }
    const key = normalizeUrl(pageKey)
    const items = await db.by(STORE, 'pageKey', key)
    if (isIncognito(sender)) for (const rec of (await session()).values()) if (rec.pageKey === key) items.push(rec)
    return { ok: true, items: items.sort(byCreated) }
  },

  /**
   * {highlight}: no id → create; id → update (merged over the stored record; recreated if it was deleted).
   * From an Incognito tab, new highlights go to the session store (response `incognito: true`).
   */
  async HL_SAVE({ highlight }, sender) {
    if (!highlight || typeof highlight !== 'object') return { ok: false, error: 'highlight is required' }
    const incognito = isIncognito(sender)
    const map = incognito ? await session() : null
    const inSession = !!(highlight.id && map?.has(highlight.id))
    const existing = !highlight.id ? null : inSession ? map.get(highlight.id) : await db.get(STORE, highlight.id)
    const rec = clean(highlight, existing)
    if (!rec.text.trim()) return { ok: false, error: 'A highlight needs some text' }
    if (!/^https?:/i.test(rec.pageKey)) return { ok: false, error: 'Highlights can only be saved for web pages' }
    // Where it lives: an Incognito highlight stays in memory; a stored one stays stored (an edit, or the Undo of a
    // delete made from this Incognito tab); anything new from an Incognito tab is Incognito.
    const restoring = !existing && (Date.now() - (tombstones.get(rec.id) || 0) < UNDO_MS)
    const ephemeral = incognito && (inSession || (!existing && !restoring))
    if (ephemeral) {
      map.set(rec.id, rec)
      try { await saveSession(map) } catch (e) { map.delete(rec.id); return { ok: false, error: `Couldn’t keep the highlight: ${e?.message || e}` } }
    } else {
      await db.put(STORE, rec)
      tombstones.delete(rec.id)
    }
    const from = sender?.tab?.id
    await notifyTabs(rec.pageKey, { type: 'MM_HIGHLIGHT_REFRESH' }, from, ephemeral)
    // A highlight moved to another page (rare: edited URL) must disappear from the old one.
    if (existing && existing.pageKey !== rec.pageKey) await notifyTabs(existing.pageKey, { type: 'MM_HIGHLIGHT_REMOVE', id: rec.id }, from, ephemeral)
    return ephemeral ? { ok: true, highlight: rec, incognito: true } : { ok: true, highlight: rec }
  },

  /** {id} or {ids: string[]} (bulk, used by the hub's multi-select). */
  async HL_DELETE({ id, ids }, sender) {
    const list = [...new Set([id, ...(Array.isArray(ids) ? ids : [])].filter(x => typeof x === 'string' && x))]
    if (!list.length) return { ok: false, error: 'id is required' }
    const incognito = isIncognito(sender)
    const map = incognito ? await session() : null
    const from = sender?.tab?.id
    let deleted = 0
    let sessionChanged = false
    for (const key of list) {
      const own = map?.get(key)
      if (own) {
        map.delete(key)
        sessionChanged = true
        deleted++
        await notifyTabs(own.pageKey, { type: 'MM_HIGHLIGHT_REMOVE', id: key }, from, true)
        continue
      }
      const rec = await db.get(STORE, key)
      if (!rec) continue
      await db.delete(STORE, key)
      deleted++
      if (incognito) tombstones.set(key, Date.now())
      await notifyTabs(rec.pageKey, { type: 'MM_HIGHLIGHT_REMOVE', id: key }, from)
    }
    if (sessionChanged) await saveSession(map).catch(() => {})
    for (const [k, at] of tombstones) if (Date.now() - at >= UNDO_MS) tombstones.delete(k)
    return { ok: true, deleted }
  },

  /** Stored highlights only (extension pages: hub, exports). Incognito ones never leave Incognito tabs. */
  async HL_ALL() {
    const items = await db.all(STORE)
    return { ok: true, items: items.sort((a, b) => (b.created || 0) - (a.created || 0)) }
  },
}

export function init() {
  // The Incognito session ends when its last window closes: forget its highlights with it.
  chrome.windows.onRemoved.addListener(() => { clearSessionIfNoIncognito() })
  // A browser restart already empties storage.session; this covers a worker that missed the close event.
  clearSessionIfNoIncognito()
}
