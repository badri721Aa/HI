// Side panel shell: tracks the active tab, extracts its page, and hosts the tab modules.
// Each module in ./tabs/ exports mount(root, ctx) → optional { onShow(), onPage(page) }.
import { getSettings, onSettings, getApiKey, applyAccent } from '../lib/store.js'
import { db, uid } from '../lib/db.js'
import { runTask } from '../lib/ai.js'
import { renderMarkdown, escapeHtml } from '../vendor/markdown.js'
import { siteOf } from '../lib/text.js'

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
const mounted = new Map()

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
    if (page && !force && page.url === currentTab.url) return page
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
  /** Panel-wide event bus: ctx.on('insert-note', fn) / ctx.emit('insert-note', {markdown}). */
  on(name, fn) { (bus.get(name) || bus.set(name, new Set()).get(name)).add(fn); return () => bus.get(name)?.delete(fn) },
  emit(name, data) { for (const fn of bus.get(name) || []) fn(data) },
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

let extracting = null
async function extract(force) {
  const tab = currentTab
  if (!tab?.id || !/^https?:|^file:/.test(tab.url || '')) {
    page = null
    pageError = 'Master Mind works on regular web pages. This page is protected by Chrome.'
    return null
  }
  if (extracting && !force) return extracting
  setBusy(true)
  extracting = (async () => {
    try {
      let res
      try { res = await chrome.tabs.sendMessage(tab.id, { type: 'MM_EXTRACT' }) } catch {
        await inject(tab.id)
        res = await chrome.tabs.sendMessage(tab.id, { type: 'MM_EXTRACT' })
      }
      if (currentTab?.id !== tab.id) return page // tab switched mid-flight
      if (!res?.paragraphs) throw new Error(res?.error || 'Could not read this page.')
      page = res
      pageError = null
    } catch (e) {
      page = null
      pageError = /Cannot access|cannot be scripted|chrome-extension|webstore/i.test(String(e?.message))
        ? 'Chrome doesn’t allow extensions to read this page.'
        : `Couldn’t read this page: ${e?.message || e}`
    } finally {
      setBusy(false)
      extracting = null
    }
    return page
  })()
  return extracting
}

function setBusy(b) { $('#refreshBtn').classList.toggle('spin', b) }

function renderHeader() {
  $('#pageTitle').textContent = currentTab?.title || 'Master Mind'
  const site = siteOf(currentTab?.url || '')
  $('#pageSite').textContent = page ? `${site} · ${page.wordCount.toLocaleString()} words · ${page.readingMin} min read` : site || 'Open a web page to begin'
}

const notifyPage = (() => {
  let t
  return () => {
    clearTimeout(t)
    t = setTimeout(async () => {
      await extract(true)
      renderHeader()
      for (const fn of pageSubs) { try { fn(page) } catch (e) { console.error(e) } }
      for (const m of mounted.values()) { try { m?.onPage?.(page) } catch (e) { console.error(e) } }
    }, 350)
  }
})()

async function setActiveTab(tab) {
  const changed = tab?.id !== currentTab?.id || tab?.url !== currentTab?.url
  currentTab = tab
  renderHeader()
  if (changed) { page = null; notifyPage() }
}

// ───────── tabs UI ─────────
async function showTab(name) {
  if (!TABS.includes(name)) return
  for (const t of TABS) {
    const btn = $(`#tab-${t}`)
    btn.setAttribute('aria-selected', String(t === name))
    btn.tabIndex = t === name ? 0 : -1
    $(`#panel-${t}`).hidden = t !== name
  }
  if (!mounted.has(name)) {
    mounted.set(name, null)
    const mod = await import(`./tabs/${name}.js`)
    mounted.set(name, mod.mount($(`#panel-${name}`), ctx) || {})
  }
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

$('#refreshBtn').addEventListener('click', () => notifyPage())
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
chrome.tabs.onActivated.addListener(async ({ tabId, windowId: w }) => {
  if (pinnedTabId || w !== windowId) return
  setActiveTab(await chrome.tabs.get(tabId))
})
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (tabId !== currentTab?.id) return
  if (info.title) { currentTab = tab; renderHeader() }
  if (info.status === 'complete' || info.url) setActiveTab(tab)
})
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type === 'MM_PAGE_CHANGED' && sender.tab?.id === currentTab?.id) {
    currentTab = { ...currentTab, url: msg.url }
    page = null
    notifyPage()
  }
})

// "Ask Master Mind about…" from the context menu.
async function consumePendingAsk() {
  const { pendingAsk } = await chrome.storage.session.get('pendingAsk')
  if (!pendingAsk || Date.now() - pendingAsk.ts > 60e3) return
  await chrome.storage.session.remove('pendingAsk')
  await showTab('ask')
  ctx.emit('ask', { question: pendingAsk.question })
}
chrome.storage.onChanged.addListener((c, area) => { if (area === 'session' && c.pendingAsk?.newValue) consumePendingAsk() })

// ───────── boot ─────────
const active = pinnedTabId
  ? await chrome.tabs.get(pinnedTabId).catch(() => null)
  : (await chrome.tabs.query({ active: true, windowId }))[0]
await setActiveTab(active)
checkKey()
let startTab = 'brief'
try { startTab = localStorage.getItem('mm-tab') || 'brief' } catch { /* ignore */ }
await showTab(TABS.includes(startTab) ? startTab : 'brief')
consumePendingAsk()
