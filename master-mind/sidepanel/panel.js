// Side panel shell: tracks the active tab, extracts its page, and hosts the tab modules.
// Each module in ./tabs/ exports mount(root, ctx) → optional { onShow(), onPage(page) }.
import { getSettings, onSettings, getApiKey, applyAccent } from '../lib/store.js'
import { db, uid } from '../lib/db.js'
import { runTask } from '../lib/ai.js'
import { renderMarkdown, escapeHtml } from '../vendor/markdown.js'
import { siteOf, normalizeUrl } from '../lib/text.js'

const CONTENT_FILES = ['content/core.js', 'content/extract.js', 'content/jargon.js', 'content/highlight.js', 'content/reader.js', 'content/ocr.js']
const TABS = ['brief', 'ask', 'analyze', 'notes', 'tools']
const $ = s => document.querySelector(s)

let settings = await getSettings()
let currentTab = null // chrome.tabs.Tab
let page = null // last extracted Page
let pageError = null // string when the page can't be read (chrome:// etc.)
let windowId = (await chrome.windows.getCurrent()).id
const pageSubs = new Set()
const bus = new Map()
const pendingEvents = new Map()
const mounted = new Map()
/** Bus events that carry a user command, so they wait for the (lazily mounted) tab that handles them. */
const QUEUED_EVENTS = new Set(['ask', 'insert-note'])
const MAX_QUEUED = 20

// ───────── ctx: the API every tab module gets ─────────
const ctx = {
  get tab() { return currentTab },
  get page() { return page },
  get pageError() { return pageError },
  get settings() { return settings },
  db, uid, runTask, renderMarkdown, escapeHtml,

  /** Extract (or return cached) page content from the active tab. Null if the page can't be read. */
  async getPage({ force = false } = {}) {
    if (!currentTab) return null
    if (page && !force && !loadingDoc && (page.url === currentTab.url || (!refreshTimer && page.key === normalizeUrl(currentTab.url)))) return page
    return extract(force)
  },
  /** Subscribe to page changes: cb(page|null). Returns unsubscribe. */
  onPageChange(cb) { pageSubs.add(cb); return () => pageSubs.delete(cb) },
  onSettings(cb) { return onSettings(cb) },

  /** Message the active tab's content scripts (injects them if needed). */
  async sendToTab(type, data = {}) {
    if (!currentTab?.id) throw new Error('No active tab')
    const msg = { type, ...data }
    try { return await chrome.tabs.sendMessage(currentTab.id, msg) } catch {
      await inject(currentTab.id)
      return chrome.tabs.sendMessage(currentTab.id, msg)
    }
  },
  showTab,
  openHub(view = 'highlights', params = '') { return chrome.runtime.sendMessage({ type: 'OPEN_HUB', view, params }) },
  toast,
  /**
   * Panel-wide event bus: ctx.on('insert-note', fn) / ctx.emit('insert-note', {markdown}).
   * Tabs mount lazily, so a command emitted before its tab listens ('ask', 'insert-note': e.g. "Save to
   * notes" before the Notes tab was ever opened) is queued for the first subscriber. Any other event
   * nobody listens to ('brief-ready', 'jargon-ready') is dropped: it describes the moment it was sent
   * (and 'brief-ready' holds a whole Page), so replaying it later would only deliver stale data.
   */
  on(name, fn) {
    ;(bus.get(name) || bus.set(name, new Set()).get(name)).add(fn)
    const queued = pendingEvents.get(name)
    if (queued) { pendingEvents.delete(name); for (const d of queued) fn(d) }
    return () => bus.get(name)?.delete(fn)
  },
  emit(name, data) {
    const subs = bus.get(name)
    if (subs?.size) { for (const fn of [...subs]) fn(data); return }
    if (!QUEUED_EVENTS.has(name)) return
    const queue = pendingEvents.get(name) || pendingEvents.set(name, []).get(name)
    if (name === 'ask') queue.length = 0 // only the latest question is still wanted
    queue.push(data)
    if (queue.length > MAX_QUEUED) queue.shift()
  },
  /** Friendly inline error/empty rendering for AI failures (handles NO_KEY). */
  errorBox(err) {
    const box = document.createElement('div')
    box.className = 'mm-error'
    if (err?.code === 'NO_KEY') {
      box.innerHTML = 'Add your Claude API key to use AI features. '
      const b = document.createElement('button')
      b.className = 'mm-btn sm'
      b.textContent = 'Open settings'
      b.onclick = () => ctx.openHub('settings')
      box.appendChild(b)
    } else box.textContent = err?.message || String(err)
    return box
  },
}

async function inject(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: CONTENT_FILES })
}

const readable = tab => !!tab?.id && /^https?:|^file:/.test(tab.url || '')

let extracting = null // in-flight extraction: {tabId, promise}
let extractSeq = 0
/**
 * Read the page in the followed tab. `force` re-reads it from scratch; otherwise the content script
 * may answer from its cache when the page's main content hasn't changed (same ids either way).
 */
async function extract(force) {
  const tab = currentTab
  if (!readable(tab)) {
    page = null
    pageError = 'Master Mind works on regular web pages. This page is protected by Chrome.'
    return null
  }
  if (extracting && !force && extracting.tabId === tab.id) return extracting.promise
  const my = ++extractSeq
  const msg = { type: 'MM_EXTRACT', force: !!force }
  setBusy(true)
  const promise = (async () => {
    let res, err = null
    try {
      try { res = await chrome.tabs.sendMessage(tab.id, msg) } catch {
        await inject(tab.id)
        res = await chrome.tabs.sendMessage(tab.id, msg)
      }
      if (!res?.paragraphs) throw new Error(res?.error || 'Could not read this page.')
    } catch (e) { err = e }
    if (currentTab?.id !== tab.id) return page // tab switched mid-flight
    if (my !== extractSeq) return err ? null : res // a newer read owns the shared state; still answer this caller
    if (err) {
      page = null
      pageError = /Cannot access|cannot be scripted|chrome-extension|webstore/i.test(String(err?.message))
        ? 'Chrome doesn’t allow extensions to read this page.'
        : `Couldn’t read this page: ${err?.message || err}`
    } else {
      page = res
      pageError = null
    }
    return page
  })()
  extracting = { tabId: tab.id, promise }
  promise.finally(() => {
    if (extracting?.promise === promise) extracting = null
    if (my === extractSeq) setBusy(false)
  })
  return promise
}

function setBusy(b) { $('#refreshBtn').classList.toggle('spin', b) }

/** Header subtitle for the followed tab: the site, or a plain label for pages that aren't websites. */
function siteLabel(url) {
  if (/^https?:/i.test(url)) return siteOf(url)
  if (/^file:/i.test(url)) return 'Local file'
  if (url.startsWith(chrome.runtime.getURL(''))) return 'Master Mind'
  return url ? 'Browser page' : ''
}

function renderHeader() {
  $('#pageTitle').textContent = currentTab?.title || 'Master Mind'
  const site = siteLabel(currentTab?.url || '')
  $('#pageSite').textContent = page ? `${site} · ${page.wordCount.toLocaleString()} words · ${page.readingMin} min read` : site || 'Open a web page to begin'
}

// ───────── keeping the page fresh ─────────
// What each change costs: a tab switch, a new document (load, reload, back/forward) or the refresh
// button re-reads the page and tells every tab module. A same-document URL change (SPA route,
// scroll-spy hash, ?page=N) waits until the URL stops changing; modules hear about it only when the
// page actually differs from what they last got, so URL churn alone doesn't re-run briefs or writes.
let shownPage = null // the Page last delivered to the tab modules
let loadingDoc = false // a new document committed in the followed tab and hasn't been read yet
let refreshTimer = 0
let refreshOpts = null
let lazySince = 0
let lazyRanAt = 0
let refreshSeq = 0
const LAZY_MIN_GAP = 4000 // URL churn (infinite scroll, scroll-spy) re-reads the page at most this often

const samePage = (a, b) => a === b || (!!a && !!b && a.key === b.key && a.title === b.title &&
  a.paragraphs.length === b.paragraphs.length && a.paragraphs.every((p, i) => p.id === b.paragraphs[i].id && p.text === b.paragraphs[i].text))

async function refreshPage({ force = false, always = false } = {}) {
  const my = ++refreshSeq
  const prev = shownPage
  const p = await extract(force)
  if (my !== refreshSeq) return // a newer refresh owns the result
  if (!always && samePage(p, prev)) {
    if (prev) page = prev // keep the object the modules already hold
    renderHeader()
    return
  }
  shownPage = p
  renderHeader()
  for (const fn of pageSubs) { try { fn(p) } catch (e) { console.error(e) } }
  for (const m of mounted.values()) { try { m?.onPage?.(p) } catch (e) { console.error(e) } }
}

function runRefresh() {
  const opts = refreshOpts
  if (!opts?.always) lazyRanAt = Date.now()
  clearTimeout(refreshTimer)
  refreshTimer = 0
  refreshOpts = null
  lazySince = 0
  return refreshPage(opts || {})
}

function cancelRefresh() {
  clearTimeout(refreshTimer)
  refreshTimer = 0
  refreshOpts = null
  lazySince = 0
}

/** Re-read the page shortly and deliver it to every module (tab switch, new document, refresh button). */
function refreshSoon({ force = false } = {}) {
  clearTimeout(refreshTimer)
  refreshOpts = { force: force || !!refreshOpts?.force, always: true }
  lazySince = 0
  refreshTimer = setTimeout(runRefresh, 350)
}

/**
 * Re-read the page once things settle: debounced by `delay`, but at most `maxWait` after the first
 * request and never sooner than LAZY_MIN_GAP after the previous lazy re-read. Modules are told only
 * if the page changed. A pending refreshSoon() already covers it.
 */
function refreshLazy(delay, maxWait = Infinity) {
  if (refreshOpts?.always) return
  const now = Date.now()
  if (!lazySince) lazySince = now
  clearTimeout(refreshTimer)
  refreshOpts = { force: false, always: false }
  const due = Math.max(Math.min(now + delay, lazySince + maxWait), lazyRanAt + LAZY_MIN_GAP)
  refreshTimer = setTimeout(runRefresh, Math.max(0, due - now))
}

/** The followed tab switched to another tab (or the panel just opened). */
function setActiveTab(tab) {
  const switched = tab?.id !== currentTab?.id
  const moved = !switched && tab?.url !== currentTab?.url
  currentTab = tab
  if (switched) {
    loadingDoc = false
    page = null
    pageError = null
    refreshSoon({ force: true })
  } else if (moved) urlChanged(tab.url)
  renderHeader()
}

/** Same document, new URL (history.pushState/replaceState, #hash). */
function urlChanged(url) {
  if (loadingDoc || !url) return // part of a document load: read when it's ready
  const key = normalizeUrl(url)
  // Same page (hash or tracking params only): re-read once the URL stops changing (scroll-spy hashes).
  if (key === (shownPage?.key ?? page?.key)) refreshLazy(1500)
  // A new route: give the view a moment to render, and don't chase URLs that change continuously.
  else refreshLazy(1000, 6000)
}

/** A new document committed in the followed tab (navigation, reload, back/forward): the old Page is gone. */
function documentCommitted() {
  loadingDoc = true
  cancelRefresh()
  page = null
  pageError = null
  renderHeader()
}

/** The followed tab's document is ready (DOMContentLoaded / load / error page). */
function documentReady({ loaded = false } = {}) {
  if (loadingDoc) { loadingDoc = false; refreshSoon({ force: true }) }
  // Fully loaded after an earlier read: pick up late-rendered content (modules hear only if it changed).
  else if (loaded) refreshLazy(300)
}

// ───────── tabs UI ─────────
const mounting = new Map()
/** Mount a tab module without showing it (idempotent). */
function mountTab(name) {
  if (!mounting.has(name)) {
    mounting.set(name, import(`./tabs/${name}.js`).then(mod => {
      mounted.set(name, mod.mount($(`#panel-${name}`), ctx) || {})
    }))
  }
  return mounting.get(name)
}

async function showTab(name) {
  if (!TABS.includes(name)) return
  for (const t of TABS) {
    const btn = $(`#tab-${t}`)
    btn.setAttribute('aria-selected', String(t === name))
    btn.tabIndex = t === name ? 0 : -1
    $(`#panel-${t}`).hidden = t !== name
  }
  await mountTab(name)
  mounted.get(name)?.onShow?.()
  try { localStorage.setItem('mm-tab', name) } catch { /* ignore */ }
}

for (const b of document.querySelectorAll('[role="tab"]')) {
  b.addEventListener('click', () => showTab(b.dataset.tab))
  b.addEventListener('keydown', e => {
    const i = TABS.indexOf(b.dataset.tab)
    const next = e.key === 'ArrowRight' ? TABS[(i + 1) % TABS.length] : e.key === 'ArrowLeft' ? TABS[(i + TABS.length - 1) % TABS.length] : null
    if (next) { e.preventDefault(); showTab(next); $(`#tab-${next}`).focus() }
  })
}

let toastTimer
function toast(msg, ms = 2200) {
  let el = document.querySelector('.mm-toast')
  if (!el) { el = document.createElement('div'); el.className = 'mm-toast'; el.setAttribute('role', 'status'); document.body.appendChild(el) }
  el.textContent = msg
  el.hidden = false
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { el.hidden = true }, ms)
}

$('#refreshBtn').addEventListener('click', () => refreshSoon({ force: true }))
$('#hubBtn').addEventListener('click', () => ctx.openHub('graph'))
$('#settingsBtn').addEventListener('click', () => ctx.openHub('settings'))
$('#noKeyBtn').addEventListener('click', () => ctx.openHub('settings'))

async function checkKey() { $('#noKey').hidden = !!(await getApiKey()) }
chrome.storage.onChanged.addListener((c, area) => { if (area === 'local' && c.apiKey) checkKey() })

onSettings(s => { settings = s; applyAccent(document.documentElement, s.accent) })
applyAccent(document.documentElement, settings.accent)

// ───────── follow the active tab in this window ─────────
// ?tabId=N pins the panel to one tab (used when the panel is opened as a normal page, e.g. in tests).
const pinnedTabId = Number(new URLSearchParams(location.search).get('tabId')) || null
const following = tabId => tabId != null && tabId === currentTab?.id
chrome.tabs.onActivated.addListener(async ({ tabId, windowId: w }) => {
  if (pinnedTabId || w !== windowId) return
  setActiveTab(await chrome.tabs.get(tabId))
})
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (!following(tabId)) return
  const moved = !!info.url && info.url !== currentTab.url
  currentTab = tab
  if (info.title || info.url) renderHeader()
  // A cross-document navigation reports its URL here first; webNavigation.onCommitted then takes over.
  if (moved) urlChanged(tab.url)
  // Only finishes a pending document load: 'complete' also follows every pushState and #hash change.
  if (info.status === 'complete') documentReady()
})
// Documents, not URLs: a reload keeps the URL but replaces the document (and every paragraph id in it).
const mainFrame = d => d.frameId === 0 && following(d.tabId) && d.documentLifecycle !== 'prerender'
chrome.webNavigation.onCommitted.addListener(d => { if (mainFrame(d)) documentCommitted() })
chrome.webNavigation.onDOMContentLoaded.addListener(d => { if (mainFrame(d)) documentReady() })
chrome.webNavigation.onCompleted.addListener(d => { if (mainFrame(d)) documentReady({ loaded: true }) })
chrome.webNavigation.onErrorOccurred.addListener(d => { if (mainFrame(d)) documentReady() })
chrome.webNavigation.onHistoryStateUpdated.addListener(d => { if (mainFrame(d)) urlChanged(d.url) })
chrome.webNavigation.onReferenceFragmentUpdated.addListener(d => { if (mainFrame(d)) urlChanged(d.url) })
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type === 'MM_PAGE_CHANGED' && following(sender.tab?.id) && typeof msg.url === 'string') {
    currentTab = { ...currentTab, url: msg.url }
    urlChanged(msg.url)
  }
})

// "Ask Master Mind about…" from the context menu. It's addressed to one tab: only the panel following
// that tab answers it (every open panel, one per window, sees the storage change).
let claimedAsk = null
async function consumePendingAsk() {
  const { pendingAsk: p } = await chrome.storage.session.get('pendingAsk')
  if (!p || Date.now() - p.ts > 60e3 || !following(p.tabId)) return
  const id = p.id ?? p.ts
  if (claimedAsk === id) return // the boot check and the change listener both saw it
  claimedAsk = id
  // Remove it unless a newer request replaced it meanwhile.
  const { pendingAsk: now } = await chrome.storage.session.get('pendingAsk')
  if ((now?.id ?? now?.ts) === id) await chrome.storage.session.remove('pendingAsk')
  await showTab('ask')
  ctx.emit('ask', { question: p.question })
}
chrome.storage.onChanged.addListener((c, area) => { if (area === 'session' && c.pendingAsk?.newValue) consumePendingAsk() })

// ───────── boot ─────────
const active = pinnedTabId
  ? await chrome.tabs.get(pinnedTabId).catch(() => null)
  : (await chrome.tabs.query({ active: true, windowId }))[0]
setActiveTab(active)
checkKey()
let startTab = 'brief'
try { startTab = localStorage.getItem('mm-tab') || 'brief' } catch { /* ignore */ }
await showTab(TABS.includes(startTab) ? startTab : 'brief')
consumePendingAsk()
// Notes receives "Save to notes" from other tabs, so it's always listening (mounted hidden).
mountTab('notes')
