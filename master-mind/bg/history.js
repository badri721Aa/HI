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
import { db, uid } from '../lib/db.js'

const MAX_NODES = 5000
const STATE_KEY = 'mmHistoryState'
const ROOT_TRANSITIONS = new Set(['typed', 'generated', 'keyword', 'keyword_generated', 'auto_bookmark', 'start_page', 'auto_toplevel'])
const IGNORED_TRANSITIONS = new Set(['reload', 'auto_subframe', 'manual_subframe'])
const CLIENT_REDIRECT_MS = 5000
const OPENER_TTL_MS = 10 * 60 * 1000
const WEB = { url: [{ schemes: ['http', 'https'] }] }

const isWeb = u => /^https?:\/\//i.test(u || '')
const docUrl = u => String(u || '').split('#')[0]
const sameDoc = (a, b) => docUrl(a) === docUrl(b)

let state = null // { tabs: {[tabId]: {id, url, ts}}, openers: {[tabId]: {nodeId, ts}}, pending: {[tabId]: {url, transition, qualifiers, ts}} }
let queue = Promise.resolve()
let started = false

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
  const node = await db.get('history', cur.id)
  if (node && node.title !== title) {
    node.title = title
    await db.put('history', node)
  }
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
    const nodes = (await db.all('history')).filter(n => (n.ts || 0) >= from).sort((a, b) => a.ts - b.ts)
    return { ok: true, nodes }
  },
  /** Wipe the whole research trail and forget every tab's position in it. */
  async HISTORY_CLEAR() {
    await enqueue(async () => {
      await db.clear('history')
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
