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

// ───────── message router ─────────
const handlers = {
  async OPEN_HUB({ view = 'highlights', params = '' }) {
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
  Promise.resolve()
    .then(() => fn(msg, sender))
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
      const result = await runTask(msg.task, msg.input, {
        signal: ctrl.signal,
        onText: text => { try { port.postMessage({ type: 'delta', text }) } catch { ctrl.abort() } },
      })
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
    await chrome.storage.session.set({ pendingAsk: { question: `Explain this in context: "${info.selectionText}"`, tabId: tab.id, ts: Date.now() } })
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
