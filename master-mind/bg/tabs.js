// Smart Tab Grouping Engine.
//   TABS_GROUP   {windowId?} → asks Claude (groupTabs task) to sort the window's ungrouped, unpinned web tabs
//                into topic groups, validates the answer and creates colored Chrome tab groups.
//   TABS_UNGROUP {windowId?} → ungroups every tab in the window.
import { runTask } from '../lib/ai.js'

const NONE = -1 // chrome.tabGroups.TAB_GROUP_ID_NONE
export const GROUP_COLORS = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange']
const MIN_TABS = 3
const MAX_TABS = 300 // tabs sent to Claude; anything beyond goes to "Misc"
const MISC = 'Misc'

const busyWindows = new Set()
const sleep = ms => new Promise(r => setTimeout(r, ms))
const isWeb = url => /^https?:\/\//i.test(url || '')

/** The window to work on: the given one, else the last focused normal window. */
async function resolveWindow(windowId) {
  if (Number.isInteger(windowId)) {
    const w = await chrome.windows.get(windowId).catch(() => null)
    if (!w) throw new Error('That browser window is no longer open.')
    return w
  }
  const w = await chrome.windows.getLastFocused({ windowTypes: ['normal'] }).catch(() => null)
  if (w?.type === 'normal') return w
  const all = await chrome.windows.getAll({ windowTypes: ['normal'] })
  if (!all.length) throw new Error('No browser window is open.')
  return all.find(x => x.focused) || all[0]
}

/** Tabs that may be grouped: ungrouped, unpinned, http(s). */
async function candidates(windowId) {
  const tabs = await chrome.tabs.query({ windowId })
  return tabs.filter(t => !t.pinned && t.groupId === NONE && isWeb(t.url || t.pendingUrl))
}

/** Trim a URL for the prompt: drop the hash and long queries, keep it short. */
function shortUrl(href) {
  try {
    const u = new URL(href)
    const q = u.search.length > 60 ? '' : u.search
    return `${u.hostname}${u.pathname}${q}`.slice(0, 160)
  } catch {
    return String(href || '').slice(0, 160)
  }
}

const cleanName = s => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40)

/**
 * Validate Claude's grouping against the real tab ids: every tab appears exactly once,
 * unknown ids are dropped, duplicate names merge, colors are legal, leftovers go to "Misc".
 * Exported for unit testing.
 */
export function normalizeGroups(raw, tabIds) {
  const valid = new Set(tabIds)
  const seen = new Set()
  const byName = new Map()
  const used = new Set()
  for (const g of Array.isArray(raw) ? raw : []) {
    const ids = (Array.isArray(g?.tabIds) ? g.tabIds : [])
      .map(Number)
      .filter(id => Number.isInteger(id) && valid.has(id) && !seen.has(id))
    if (!ids.length) continue
    for (const id of ids) seen.add(id)
    const name = cleanName(g.name) || 'Group'
    const key = name.toLowerCase()
    const existing = byName.get(key)
    if (existing) { existing.tabIds.push(...ids); continue }
    let color = GROUP_COLORS.includes(g.color) ? g.color : null
    if (!color) color = GROUP_COLORS.find(c => !used.has(c) && c !== 'grey') || 'grey'
    used.add(color)
    byName.set(key, { name, color, tabIds: ids })
  }
  const leftovers = tabIds.filter(id => !seen.has(id))
  if (leftovers.length) {
    const misc = byName.get(MISC.toLowerCase())
    if (misc) misc.tabIds.push(...leftovers)
    else byName.set(MISC.toLowerCase(), { name: MISC, color: 'grey', tabIds: leftovers })
  }
  return [...byName.values()]
}

/** chrome.tabs.group fails while the user drags a tab; retry briefly. */
async function withRetry(fn, tries = 4) {
  for (let i = 0; ; i++) {
    try { return await fn() } catch (e) {
      if (i >= tries - 1 || !/dragging|cannot be edited right now/i.test(String(e?.message))) throw e
      await sleep(250 * (i + 1))
    }
  }
}

async function group({ windowId } = {}) {
  const win = await resolveWindow(windowId)
  if (busyWindows.has(win.id)) return { ok: false, code: 'BUSY', error: 'Already grouping the tabs in this window.' }
  busyWindows.add(win.id)
  try {
    const tabs = await candidates(win.id)
    if (tabs.length < MIN_TABS) {
      return {
        ok: false,
        code: 'TOO_FEW',
        error: tabs.length
          ? `Only ${tabs.length} ungrouped web tab${tabs.length === 1 ? '' : 's'} here. Open at least ${MIN_TABS} to group them.`
          : `No ungrouped web tabs in this window. Open at least ${MIN_TABS} to group them.`,
      }
    }
    const sent = tabs.slice(0, MAX_TABS)
    let result
    try {
      result = await runTask('groupTabs', {
        tabs: sent.map(t => ({ id: t.id, title: cleanName((t.title || '').slice(0, 140)) || shortUrl(t.url), url: shortUrl(t.url || t.pendingUrl) })),
      })
    } catch (e) {
      return { ok: false, code: e.code || 'API', error: e.message || String(e) }
    }

    // Tabs may have closed, moved or been grouped by hand while Claude was thinking.
    const still = new Map((await candidates(win.id)).map(t => [t.id, t]))
    const ids = tabs.map(t => t.id).filter(id => still.has(id))
    if (!ids.length) return { ok: false, code: 'GONE', error: 'Those tabs were closed or grouped while Claude was working.' }
    const plan = normalizeGroups(result.data?.groups, ids)

    const groups = []
    for (const g of plan) {
      const groupId = await withRetry(() => chrome.tabs.group({ tabIds: g.tabIds, createProperties: { windowId: win.id } }))
      await withRetry(() => chrome.tabGroups.update(groupId, { title: g.name, color: g.color, collapsed: false }))
      groups.push({ id: groupId, name: g.name, color: g.color, count: g.tabIds.length })
    }
    return { ok: true, windowId: win.id, total: ids.length, groups }
  } finally {
    busyWindows.delete(win.id)
  }
}

async function ungroup({ windowId } = {}) {
  const win = await resolveWindow(windowId)
  const tabs = (await chrome.tabs.query({ windowId: win.id })).filter(t => t.groupId !== NONE)
  if (tabs.length) await withRetry(() => chrome.tabs.ungroup(tabs.map(t => t.id)))
  return { ok: true, windowId: win.id, count: tabs.length }
}

export const handlers = {
  TABS_GROUP: msg => group(msg),
  TABS_UNGROUP: msg => ungroup(msg),
}

export function init() {}
