// StudyPilot background service worker
// Classroom sync · reminders · badge · focus timer · context menu · AI streaming
import { load, save, getSettings, uid, dayKey, sortByUrgency } from './lib/store.js'
import { getToken, signOut, fetchClassroomTasks, mergeTasks, AuthError } from './lib/classroom.js'
import { runTool, testKey } from './lib/ai.js'

const HOUR = 3600e3
const CONTENT_FILES = ['lib/md.js', 'content.js']

// ───────────────────────── lifecycle ─────────────────────────
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  chrome.alarms.create('tick', { periodInMinutes: 15 })
  setupContextMenu()
  await refreshBadge()
  // Inject into Docs/Classroom tabs that were already open, so there's no reload needed.
  const tabs = await chrome.tabs.query({ url: ['https://docs.google.com/*', 'https://classroom.google.com/*'] })
  for (const t of tabs) chrome.scripting.executeScript({ target: { tabId: t.id }, files: CONTENT_FILES }).catch(() => {})
  if (reason === 'install') chrome.tabs.create({ url: chrome.runtime.getURL('popup.html?full=1&tab=settings&welcome=1') })
})

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create('tick', { periodInMinutes: 15 })
  refreshBadge()
})

// ───────────────────────── alarms ─────────────────────────
chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name === 'tick') {
    const { settings, classroom } = await load(['settings', 'classroom'])
    if (settings.autoSync && classroom.connected && Date.now() - classroom.lastSync > HOUR) {
      await syncClassroom(false).catch(() => {})
    }
    await checkReminders()
    await refreshBadge()
  }
  if (alarm.name === 'focus') await finishFocusPhase()
})

// ───────────────────────── classroom ─────────────────────────
async function syncClassroom(interactive) {
  const { classroom, tasks } = await load(['classroom', 'tasks'])
  try {
    const token = await getToken(interactive)
    const incoming = await fetchClassroomTasks(token)
    const merged = mergeTasks(tasks, incoming)
    await save({ tasks: merged, classroom: { ...classroom, connected: true, lastSync: Date.now(), error: '' } })
    await refreshBadge()
    return { ok: true, count: incoming.filter(t => !t.done).length }
  } catch (e) {
    const auth = e instanceof AuthError
    await save({ classroom: { ...classroom, connected: auth ? false : classroom.connected, error: e.message } })
    return { ok: false, error: e.message }
  }
}

// ───────────────────────── badge + reminders ─────────────────────────
async function refreshBadge() {
  const { tasks } = await load(['tasks'])
  const sorted = sortByUrgency(tasks)
  const overdue = sorted.filter(t => t.u.level === 'overdue').length
  const soon = sorted.filter(t => t.u.level === 'today' || t.u.level === 'tomorrow').length
  const n = overdue + soon
  await chrome.action.setBadgeText({ text: n ? String(n) : '' })
  await chrome.action.setBadgeBackgroundColor({ color: overdue ? '#E11D48' : '#7C3AED' })
  await chrome.action.setTitle({ title: n ? `StudyPilot: ${overdue} overdue, ${soon} due soon` : 'StudyPilot: all caught up' })
}

async function checkReminders() {
  const { tasks, settings, notified } = await load(['tasks', 'settings', 'notified'])
  if (!settings.remindersOn) return
  const now = Date.now()
  const windowMs = settings.reminderHours * HOUR
  let changed = false
  for (const t of tasks) {
    if (t.done || !t.due) continue
    const left = t.due - now
    const key = `${t.id}:${t.due}`
    if (left > 0 && left <= windowMs && !notified[key]) {
      notified[key] = now
      changed = true
      chrome.notifications.create(`task:${t.id}`, {
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: `Due soon: ${t.title}`,
        message: `${t.course ? t.course + ' · ' : ''}due ${new Date(t.due).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`,
        priority: 1,
      })
    }
  }
  // Forget reminders older than 30 days.
  for (const [k, ts] of Object.entries(notified)) if (now - ts > 30 * 24 * HOUR) { delete notified[k]; changed = true }
  if (changed) await save({ notified })
}

chrome.notifications.onClicked.addListener(async id => {
  if (id.startsWith('task:')) {
    const { tasks } = await load(['tasks'])
    const t = tasks.find(x => x.id === id.slice(5))
    if (t?.link) chrome.tabs.create({ url: t.link })
  }
  chrome.notifications.clear(id)
})

// ───────────────────────── focus timer ─────────────────────────
async function startFocus(mode) {
  const { focus, settings } = await load(['focus', 'settings'])
  const resuming = !mode && focus.remainingMs > 0 && focus.lengthMs
  const m = mode || focus.mode || 'focus'
  const lengthMs = resuming ? focus.lengthMs : (m === 'focus' ? settings.focusLen : settings.breakLen) * 60e3
  const next = { mode: m, running: true, endsAt: Date.now() + (resuming ? focus.remainingMs : lengthMs), remainingMs: 0, lengthMs }
  await save({ focus: next })
  chrome.alarms.create('focus', { when: next.endsAt })
  return next
}

async function pauseFocus() {
  const { focus } = await load(['focus'])
  const next = { ...focus, running: false, remainingMs: Math.max(0, focus.endsAt - Date.now()) }
  await chrome.alarms.clear('focus')
  await save({ focus: next })
  return next
}

async function resetFocus(mode) {
  await chrome.alarms.clear('focus')
  const next = { mode: mode || 'focus', running: false, endsAt: 0, remainingMs: 0 }
  await save({ focus: next })
  return next
}

async function finishFocusPhase() {
  const { focus, stats, settings } = await load(['focus', 'stats', 'settings'])
  if (!focus.running) return
  const wasFocus = focus.mode === 'focus'
  if (wasFocus) {
    const k = dayKey()
    const mins = Math.round((focus.lengthMs || settings.focusLen * 60e3) / 60e3)
    stats.focusByDay[k] = (stats.focusByDay[k] || 0) + mins
    stats.sessions = (stats.sessions || 0) + 1
    await save({ stats })
  }
  chrome.notifications.create(`focus:${Date.now()}`, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: wasFocus ? '🎉 Focus session complete!' : '⏰ Break is over',
    message: wasFocus ? `Nice work. Take a ${settings.breakLen}-minute break.` : 'Ready for another focus session?',
    priority: 2,
  })
  // Auto-start the break after focus; stop after a break.
  if (wasFocus) await startFocus('break')
  else await resetFocus('focus')
}

// ───────────────────────── context menu + shortcuts ─────────────────────────
const MENU = [
  ['explain', 'Explain this'],
  ['hint', 'Give me a hint'],
  ['simplify', 'Simplify'],
  ['summarize', 'Summarize'],
  ['define', 'Define'],
  ['grammar', 'Check my grammar'],
  ['flashcards', 'Make flashcards'],
  ['quiz', 'Quiz me on this'],
]

function setupContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'sp-root', title: 'StudyPilot', contexts: ['selection'] })
    for (const [id, title] of MENU) chrome.contextMenus.create({ id: `sp-${id}`, parentId: 'sp-root', title, contexts: ['selection'] })
    chrome.contextMenus.create({ id: 'sp-open', title: 'Open StudyPilot sidebar', contexts: ['page'] })
  })
}

async function sendToTab(tabId, msg) {
  try {
    return await chrome.tabs.sendMessage(tabId, msg)
  } catch {
    // Content script isn't on this page yet: inject it (allowed via activeTab), then retry.
    await chrome.scripting.executeScript({ target: { tabId }, files: CONTENT_FILES })
    return chrome.tabs.sendMessage(tabId, msg)
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return
  if (info.menuItemId === 'sp-open') return sendToTab(tab.id, { type: 'SIDEBAR', action: 'open' }).catch(() => {})
  const tool = String(info.menuItemId).replace('sp-', '')
  sendToTab(tab.id, { type: 'SIDEBAR', action: 'run', tool, text: info.selectionText || '' }).catch(() => {})
})

chrome.commands.onCommand.addListener(async command => {
  if (command !== 'toggle-sidebar') return
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (tab?.id) sendToTab(tab.id, { type: 'SIDEBAR', action: 'toggle' }).catch(() => {})
})

// ───────────────────────── messages ─────────────────────────
const handlers = {
  async SYNC({ interactive }) { return syncClassroom(!!interactive) },
  async DISCONNECT() {
    await signOut()
    const { tasks, classroom } = await load(['tasks', 'classroom'])
    await save({ tasks: tasks.filter(t => t.source !== 'classroom'), classroom: { ...classroom, connected: false, lastSync: 0, error: '' } })
    await refreshBadge()
    return { ok: true }
  },
  async REFRESH_BADGE() { await refreshBadge(); return { ok: true } },
  async FOCUS_START({ mode }) { return startFocus(mode) },
  async FOCUS_PAUSE() { return pauseFocus() },
  async FOCUS_RESET({ mode }) { return resetFocus(mode) },
  async TEST_KEY({ apiKey, model }) { return testKey({ apiKey, model }) },
  async OPEN_SETTINGS() {
    await chrome.tabs.create({ url: chrome.runtime.getURL('popup.html?full=1&tab=settings') })
    return { ok: true }
  },
  async ADD_CARDS({ deck, cards }) {
    const { flashcards } = await load(['flashcards'])
    const now = Date.now()
    const added = cards.filter(c => c.front && c.back).map(c => ({ id: uid(), deck: deck || 'General', front: c.front, back: c.back, box: 1, next: now, created: now }))
    await save({ flashcards: [...flashcards, ...added] })
    return { ok: true, count: added.length }
  },
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const h = handlers[msg?.type]
  if (!h) return false
  h(msg).then(sendResponse, e => sendResponse({ ok: false, error: String(e?.message || e) }))
  return true
})

// Streaming AI over a long-lived port: {type:'delta'} chunks, then {type:'done'} or {type:'error'}.
chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'ai') return
  const controller = new AbortController()
  port.onDisconnect.addListener(() => controller.abort())
  port.onMessage.addListener(async req => {
    if (req.type === 'stop') return controller.abort()
    const settings = await getSettings()
    try {
      const result = await runTool(req, settings, delta => {
        try { port.postMessage({ type: 'delta', text: delta }) } catch { controller.abort() }
      }, controller.signal)
      if (req.tool === 'flashcards' && result.data?.cards?.length) {
        const r = await handlers.ADD_CARDS({ deck: result.data.deck, cards: result.data.cards })
        result.saved = r.count
      }
      port.postMessage({ type: 'done', ...result })
    } catch (e) {
      try { port.postMessage({ type: 'error', message: e.message }) } catch { /* port closed */ }
    }
  })
})

// Keep the badge fresh whenever tasks change (from the popup or a sync).
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.tasks) refreshBadge()
})
