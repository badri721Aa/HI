// Master Mind service worker: message router, AI streaming port, menus, shortcuts.
// Feature modules in bg/ export `handlers` (message type → async fn) and optional `init()`.
import { runTask } from './lib/ai.js'
import * as highlights from './bg/highlights.js'
import * as history from './bg/history.js'
import * as tabs from './bg/tabs.js'
import * as ocr from './bg/ocr.js'
import * as sounds from './bg/sounds.js'

const MODULES = [highlights, history, tabs, ocr, sounds]
export const CONTENT_FILES = ['content/core.js', 'content/extract.js', 'content/jargon.js', 'content/highlight.js', 'content/reader.js', 'content/ocr.js']
const HUB_VIEWS = ['highlights', 'notes', 'graph', 'history', 'settings']
const EXT_ORIGIN = chrome.runtime.getURL('')

// ───────── trust boundary ─────────
// Content scripts run inside web pages' renderer processes, so they're the least trusted part of the
// extension. The API key (storage.local) is for extension pages and this worker only.
chrome.storage.local.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' }).catch(() => {})

/** True for messages from our own pages (side panel, hub, offscreen), false for content scripts. */
const fromExtensionPage = sender => sender?.id === chrome.runtime.id && String(sender.url || '').startsWith(EXT_ORIGIN)
/** The only messages a content script may send. The rest (SEND_TO_TAB, HL_ALL, HISTORY_*, TABS_*, SOUND_*…) need an extension page. */
const CONTENT_MESSAGES = new Set(['MM_PAGE_CHANGED', 'OPEN_PANEL', 'OPEN_HUB', 'HL_LIST', 'HL_SAVE', 'HL_DELETE', 'OCR_CAPTURE', 'OCR_CANCEL', 'OCR_SAVE_NOTE'])

// ───────── keep the worker alive while work is in flight ─────────
// Chrome stops an idle extension service worker after ~30 s, and an open port or a pending fetch
// doesn't count as activity: only extension API calls and events do. An AI task can easily stream
// for longer than that while sending nothing back (schema tasks such as 'translate' or 'groupTabs'),
// so tick a cheap extension API every 20 s while any message handler or AI port task is running.
let inFlight = 0
let ticker = 0
const MAX_KEEPALIVE = 15 * 60e3 // never pin the worker forever on a handler that hangs
function keepAlive(promise) {
  if (inFlight++ === 0) ticker = setInterval(() => { chrome.runtime.getPlatformInfo().catch(() => {}) }, 20e3)
  let released = false
  const release = () => {
    if (released) return
    released = true
    clearTimeout(cap)
    if (--inFlight === 0) { clearInterval(ticker); ticker = 0 }
  }
  const cap = setTimeout(release, MAX_KEEPALIVE)
  promise.then(release, release)
  return promise
}

// ───────── message router ─────────
const handlers = {
  async OPEN_HUB({ view = 'highlights', params = '' }, sender) {
    if (!HUB_VIEWS.includes(view)) view = 'highlights'
    params = String(params || '')
    if (!fromExtensionPage(sender)) {
      // A web page's content script may only point at a record (id) or a search (q).
      const allowed = new URLSearchParams()
      for (const [k, v] of new URLSearchParams(params)) if (k === 'id' || k === 'q') allowed.set(k, v.slice(0, 500))
      params = allowed.toString()
    }
    const url = chrome.runtime.getURL(`hub/index.html#${view}${params ? `?${params}` : ''}`)
    const [existing] = await chrome.tabs.query({ url: chrome.runtime.getURL('hub/index.html') + '*' })
    if (existing) {
      await chrome.tabs.update(existing.id, { active: true, url })
      await chrome.windows.update(existing.windowId, { focused: true })
    } else await chrome.tabs.create({ url })
    return { ok: true }
  },
  async OPEN_PANEL(_msg, sender) {
    const tabId = sender.tab?.id
    if (tabId) await chrome.sidePanel.open({ tabId }).catch(() => {})
    return { ok: true }
  },
  // Content script noticed an SPA navigation; the side panel listens for this too.
  async MM_PAGE_CHANGED() { return { ok: true } },
}
for (const m of MODULES) Object.assign(handlers, m.handlers || {})

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  const fn = handlers[msg?.type]
  if (!fn) return false
  if (!fromExtensionPage(sender) && !CONTENT_MESSAGES.has(msg.type)) {
    reply({ ok: false, error: `${msg.type} is only available to Master Mind's own pages.` })
    return false
  }
  keepAlive(Promise.resolve().then(() => fn(msg, sender)))
    .then(v => reply(v ?? { ok: true }), e => reply({ ok: false, error: String(e?.message || e) }))
  return true
})

// ───────── AI streaming port (content scripts) ─────────
// Client sends {task, input}; server streams {type:'delta', text}, then {type:'done', result} or {type:'error', code, message}.
chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'mm-ai') return
  const ctrl = new AbortController()
  port.onDisconnect.addListener(() => ctrl.abort())
  port.onMessage.addListener(async msg => {
    if (msg.type === 'stop') return ctrl.abort()
    try {
      const result = await keepAlive(runTask(msg.task, msg.input, {
        signal: ctrl.signal,
        onText: text => { try { port.postMessage({ type: 'delta', text }) } catch { ctrl.abort() } },
      }))
      port.postMessage({ type: 'done', result })
    } catch (e) {
      try { port.postMessage({ type: 'error', code: e.code || 'API', message: e.message }) } catch { /* port closed */ }
    }
  })
})

// ───────── injection helpers ─────────
/** Send a message to a tab, injecting the content scripts first if they aren't there yet. */
export async function sendToTab(tabId, msg) {
  try {
    return await chrome.tabs.sendMessage(tabId, msg)
  } catch {
    await chrome.scripting.executeScript({ target: { tabId }, files: CONTENT_FILES })
    return chrome.tabs.sendMessage(tabId, msg)
  }
}
handlers.SEND_TO_TAB = async ({ tabId, message }) => sendToTab(tabId, message)

// ───────── install, menus, shortcuts ─────────
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {})
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'mm-highlight', title: 'Highlight with Master Mind', contexts: ['selection'] })
    chrome.contextMenus.create({ id: 'mm-ask', title: 'Ask Master Mind about “%s”', contexts: ['selection'] })
    chrome.contextMenus.create({ id: 'mm-reader', title: 'Open in Focus Reading Mode', contexts: ['page'] })
    chrome.contextMenus.create({ id: 'mm-ocr', title: 'Capture text from screen region…', contexts: ['page', 'image'] })
  })
  // Existing tabs don't get manifest content scripts until reload; inject where we can.
  const open = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] })
  for (const t of open) chrome.scripting.executeScript({ target: { tabId: t.id }, files: CONTENT_FILES }).catch(() => {})
  if (reason === 'install') chrome.tabs.create({ url: chrome.runtime.getURL('hub/index.html#settings?welcome=1') })
})

for (const m of MODULES) m.init?.()

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return
  if (info.menuItemId === 'mm-highlight') return sendToTab(tab.id, { type: 'MM_HIGHLIGHT_SELECTION' }).catch(() => {})
  if (info.menuItemId === 'mm-reader') return sendToTab(tab.id, { type: 'MM_READER', action: 'open' }).catch(() => {})
  if (info.menuItemId === 'mm-ocr') return sendToTab(tab.id, { type: 'MM_OCR_START' }).catch(() => {})
  if (info.menuItemId === 'mm-ask') {
    await chrome.sidePanel.open({ tabId: tab.id }).catch(() => {})
    // The panel picks this up on load (or live via storage.onChanged).
    // Addressed to this tab: only the panel following it answers (one panel per window).
    await chrome.storage.session.set({ pendingAsk: { id: crypto.randomUUID(), question: `Explain this in context: "${info.selectionText}"`, tabId: tab.id, ts: Date.now() } })
  }
})

chrome.commands.onCommand.addListener(async (command, tab) => {
  tab ??= (await chrome.tabs.query({ active: true, currentWindow: true }))[0]
  if (!tab?.id) return
  const map = {
    'highlight-selection': { type: 'MM_HIGHLIGHT_SELECTION' },
    'toggle-reader': { type: 'MM_READER', action: 'toggle' },
    'capture-text': { type: 'MM_OCR_START' },
  }
  if (map[command]) sendToTab(tab.id, map[command]).catch(() => {})
})
