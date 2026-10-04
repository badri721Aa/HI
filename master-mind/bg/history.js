// Visual Research History Tree: records how main-frame navigations lead to one another.
//
//  • link / form_submit (and SPA pushState) continue from the tab's current node
//  • back/forward moves the tab's pointer back to the node it already has for that URL
//    (so the next link becomes a sibling branch), or continues from the current node
//  • a tab opened from another tab (openerTabId / onCreatedNavigationTarget) branches from the opener's node
//  • typed, generated (search), keyword, auto_bookmark and start-page navigations start new roots
//
// The per-tab "current node" map lives in chrome.storage.session because the service worker restarts.
// Records: { id, tabId, url, title, parentId, ts, transition } in the IndexedDB `history` store.
//
// Titles: a node takes the page's first real title right away. Changes during the first moments on a page
// ("Loading…" → the real title, SPA routes renaming themselves) are applied at most every few seconds, and after
// that the title is settled: unread counters, timers and "New message!" flashes don't rewrite the trail (every
// write is broadcast to every open extension view).
import { db, uid } from '../lib/db.js'

const MAX_NODES = 5000
const STATE_KEY = 'mmHistoryState'
const ROOT_TRANSITIONS = new Set(['typed', 'generated', 'keyword', 'keyword_generated', 'auto_bookmark', 'start_page', 'auto_toplevel'])
const IGNORED_TRANSITIONS = new Set(['reload', 'auto_subframe', 'manual_subframe'])
const CLIENT_REDIRECT_MS = 5000
const OPENER_TTL_MS = 10 * 60 * 1000
const TITLE_SETTLE_MS = 10 * 1000 // after this long on a page its title no longer changes in the trail
const TITLE_THROTTLE_MS = 2000 // at most one title write per node per this long while it may still change
const WEB = { url: [{ schemes: ['http', 'https'] }] }

const isWeb = u => /^https?:\/\//i.test(u || '')
const docUrl = u => String(u || '').split('#')[0]
const sameDoc = (a, b) => docUrl(a) === docUrl(b)

let state = null // { tabs: {[tabId]: {id, url, ts}}, openers: {[tabId]: {nodeId, ts}}, pending: {[tabId]: {url, transition, qualifiers, ts}} }
let queue = Promise.resolve()
let started = false
const titles = new Map() // node id → {at: last write (ms), title: pending title, timer} for nodes whose title may still change

async function load() {
  if (!state) {
    const stored = (await chrome.storage.session.get(STATE_KEY))[STATE_KEY]
    state = { tabs: {}, openers: {}, pending: {}, ...(stored || {}) }
  }
  return state
}
const save = () => chrome.storage.session.set({ [STATE_KEY]: state })

/** Serialize all bookkeeping so events from several tabs can't interleave mid-update. */
function enqueue(fn) {
  queue = queue.then(fn).catch(e => console.warn('[Master Mind history]', e?.message || e))
  return queue
}

/** True when a title is just Chrome's placeholder (the URL) rather than the page's own. */
function placeholderTitle(title, url) {
  if (!title) return true
  const t = title.trim()
  return t === url || t === url.replace(/^https?:\/\//, '') || t === docUrl(url).replace(/^https?:\/\//, '')
}

async function record(tabId, url, transition, qualifiers = [], ts = Date.now()) {
  if (IGNORED_TRANSITIONS.has(transition)) return
  const st = await load()
  const cur = st.tabs[tabId]
  const isRootNav = ROOT_TRANSITIONS.has(transition) && !qualifiers.includes('forward_back')

  // Same document again (e.g. a link to the page we're on): nothing new happened.
  if (cur && sameDoc(cur.url, url) && !isRootNav) return

  // A client-side redirect right after the previous commit replaces that node instead of chaining.
  if (cur && qualifiers.includes('client_redirect') && ts - cur.ts < CLIENT_REDIRECT_MS) {
    const node = await db.get('history', cur.id)
    if (node) {
      node.url = url
      node.title = ''
      await db.put('history', node)
      st.tabs[tabId] = { id: node.id, url, ts }
      return save()
    }
  }

  // Back/forward: return to the node this tab already has for that URL.
  if (qualifiers.includes('forward_back')) {
    const seen = (await db.by('history', 'tabId', tabId)).filter(n => sameDoc(n.url, url))
    if (seen.length) {
      const match = seen.reduce((a, b) => (b.ts > a.ts ? b : a))
      st.tabs[tabId] = { id: match.id, url, ts }
      return save()
    }
  }

  let parentId = null
  if (!isRootNav) {
    if (cur) parentId = cur.id
    else {
      const op = st.openers[tabId]
      if (op && ts - op.ts < OPENER_TTL_MS) parentId = op.nodeId || null
    }
  }
  delete st.openers[tabId]

  const node = { id: uid('h'), tabId, url, title: '', parentId, ts, transition: qualifiers.includes('forward_back') ? 'forward_back' : transition }
  // The title may already be known (SPA navigations, cached pages).
  const tab = await chrome.tabs.get(tabId).catch(() => null)
  if (tab && sameDoc(tab.url || tab.pendingUrl, url) && !placeholderTitle(tab.title, url) && tab.status === 'complete') node.title = tab.title
  await db.put('history', node)
  st.tabs[tabId] = { id: node.id, url, ts }
  await save()
  await db.trim('history', 'ts', MAX_NODES) // a cheap count unless we're over the cap
}

async function onCommitted(d) {
  if (d.frameId !== 0 || !isWeb(d.url)) return
  const ts = Math.round(d.timeStamp) || Date.now()
  if (d.documentLifecycle === 'prerender') {
    // Prerendered pages only count once the user actually activates them (tabs.onUpdated url).
    const st = await load()
    st.pending[d.tabId] = { url: d.url, transition: d.transitionType, qualifiers: d.transitionQualifiers || [], ts }
    return save()
  }
  const tab = await chrome.tabs.get(d.tabId).catch(() => null)
  if (tab?.incognito) return
  await record(d.tabId, d.url, d.transitionType, d.transitionQualifiers || [], ts)
}

async function onHistoryStateUpdated(d) {
  // SPA route change via history.pushState/replaceState.
  if (d.frameId !== 0 || !isWeb(d.url)) return
  const tab = await chrome.tabs.get(d.tabId).catch(() => null)
  if (tab?.incognito) return
  const st = await load()
  const cur = st.tabs[d.tabId]
  if (cur && sameDoc(cur.url, d.url)) return
  const transition = ROOT_TRANSITIONS.has(d.transitionType) ? 'link' : (d.transitionType || 'link')
  await record(d.tabId, d.url, transition, (d.transitionQualifiers || []).filter(q => q !== 'client_redirect'), Math.round(d.timeStamp) || Date.now())
}

async function rememberOpener(tabId, openerTabId) {
  if (tabId == null || openerTabId == null || tabId === openerTabId) return
  const st = await load()
  const from = st.tabs[openerTabId]
  if (!from) return
  st.openers[tabId] = { nodeId: from.id, ts: Date.now() }
  await save()
}

async function onTabUpdated(tabId, change, tab) {
  if (!change.title && !change.url) return
  const st = await load()
  if (change.url && st.pending[tabId]) {
    const p = st.pending[tabId]
    delete st.pending[tabId]
    if (sameDoc(p.url, change.url)) await record(tabId, change.url, p.transition, p.qualifiers, Date.now())
    else await save()
  }
  const title = change.title || tab?.title
  const cur = st.tabs[tabId]
  if (!title || !cur || !sameDoc(tab?.url, cur.url) || placeholderTitle(title, cur.url)) return
  const known = titles.get(cur.id)
  if (known?.settled) return // fast path for ticking titles: no IndexedDB read either
  const node = await db.get('history', cur.id)
  if (!node) return
  if (node.title === title) { if (known) known.title = ''; return } // back to the stored title: drop a pending one
  const now = Date.now()
  if (node.title && !placeholderTitle(node.title, node.url)) {
    // The node already has a real title: only early changes count, and those are throttled.
    if (now - node.ts > TITLE_SETTLE_MS) { settleTitle(node.id); return }
    const t = known || { at: 0 }
    titles.set(node.id, t)
    t.title = title
    const wait = t.at + TITLE_THROTTLE_MS - now
    if (wait > 0) {
      t.timer ||= setTimeout(() => { t.timer = 0; enqueue(() => flushTitle(node.id)) }, wait)
      return
    }
  }
  await writeTitle(node, title)
}

async function writeTitle(node, title) {
  const t = titles.get(node.id) || { at: 0 }
  clearTimeout(t.timer)
  t.timer = 0
  t.at = Date.now()
  t.title = ''
  titles.set(node.id, t)
  if (titles.size > 200) for (const id of [...titles.keys()].slice(0, 100)) if (!titles.get(id).timer) titles.delete(id)
  node.title = title
  await db.put('history', node)
}

/** Trailing write of the last title seen while a node's title was being throttled. */
async function flushTitle(id) {
  const t = titles.get(id)
  if (!t?.title) return
  const node = await db.get('history', id) // gone after HISTORY_CLEAR or a trim: nothing to do
  if (!node || node.title === t.title) { t.title = ''; return }
  await writeTitle(node, t.title)
}

/** Ignore this node's later title changes (a write already throttled from before still lands). */
function settleTitle(id) {
  const t = titles.get(id)
  if (t) t.settled = true
  else titles.set(id, { settled: true, at: 0 })
}

async function onTabRemoved(tabId) {
  const st = await load()
  if (!(tabId in st.tabs) && !(tabId in st.openers) && !(tabId in st.pending)) return
  delete st.tabs[tabId]
  delete st.openers[tabId]
  delete st.pending[tabId]
  await save()
}

async function onTabReplaced(addedTabId, removedTabId) {
  const st = await load()
  if (st.tabs[removedTabId]) st.tabs[addedTabId] = st.tabs[removedTabId]
  delete st.tabs[removedTabId]
  delete st.openers[removedTabId]
  delete st.pending[removedTabId]
  await save()
}

export const handlers = {
  /** {since?: ms epoch} → {ok, nodes} sorted oldest first. */
  async HISTORY_TREE({ since } = {}) {
    await queue
    const from = Number(since) || 0
    // A time range reads only its slice of the `ts` index (already in ts order) instead of the whole store.
    const nodes = from > 0
      ? await db.by('history', 'ts', IDBKeyRange.lowerBound(from))
      : (await db.all('history')).sort((a, b) => (a.ts || 0) - (b.ts || 0))
    return { ok: true, nodes }
  },
  /** Wipe the whole research trail and forget every tab's position in it. */
  async HISTORY_CLEAR() {
    await enqueue(async () => {
      await db.clear('history')
      for (const t of titles.values()) clearTimeout(t.timer)
      titles.clear()
      const st = await load()
      st.tabs = {}
      st.openers = {}
      st.pending = {}
      await save()
    })
    return { ok: true }
  },
}

/** Register listeners synchronously (called at the top level of the service worker). */
export function init() {
  if (started) return
  started = true
  chrome.webNavigation.onCommitted.addListener(d => enqueue(() => onCommitted(d)), WEB)
  chrome.webNavigation.onHistoryStateUpdated.addListener(d => enqueue(() => onHistoryStateUpdated(d)), WEB)
  chrome.webNavigation.onCreatedNavigationTarget.addListener(d => enqueue(() => rememberOpener(d.tabId, d.sourceTabId)))
  chrome.tabs.onCreated.addListener(tab => enqueue(() => rememberOpener(tab.id, tab.openerTabId)))
  chrome.tabs.onUpdated.addListener((tabId, change, tab) => { if (change.title || change.url) enqueue(() => onTabUpdated(tabId, change, tab)) })
  chrome.tabs.onRemoved.addListener(tabId => enqueue(() => onTabRemoved(tabId)))
  chrome.tabs.onReplaced.addListener((added, removed) => enqueue(() => onTabReplaced(added, removed)))
  enqueue(() => db.trim('history', 'ts', MAX_NODES))
}
