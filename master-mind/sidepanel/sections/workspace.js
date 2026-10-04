// Side panel → Tools → "Browser workspace": Smart Tab Grouping (TABS_GROUP / TABS_UNGROUP), screen-region text
// capture (MM_OCR_START to the page) and a doorway to the Highlight Hub.
// The group list mirrors the window's live chrome.tabGroups state, so it stays right when groups change elsewhere.
import { onChange as onDbChange } from '../../lib/db.js'

const NONE = -1 // chrome.tabGroups.TAB_GROUP_ID_NONE
const MIN_TABS = 3
// Chrome's own tab-group palette (dark theme) so the dots match the tab strip.
const GROUP_HEX = {
  grey: '#BDC1C6', blue: '#8AB4F8', red: '#F28B82', yellow: '#FDD663', green: '#81C995',
  pink: '#FF8BCB', purple: '#C58AF9', cyan: '#78D9EC', orange: '#FCAD70',
}
const SVGNS = 'http://www.w3.org/2000/svg'
const ICONS = {
  group: ['M3 7.5A2.5 2.5 0 0 1 5.5 5h3l2 2h8A2.5 2.5 0 0 1 21 9.5v7a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5z', 'M8 13h8'],
  sparkle: ['M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z', 'M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z'],
  ungroup: ['M4 6h7v5H4z', 'M13 13h7v5h-7z', 'M11 8.5h3.5a2 2 0 0 1 2 2V13'],
  scan: ['M4 8V6a2 2 0 0 1 2-2h2', 'M16 4h2a2 2 0 0 1 2 2v2', 'M20 16v2a2 2 0 0 1-2 2h-2', 'M8 20H6a2 2 0 0 1-2-2v-2', 'M8 10h8', 'M8 14h5'],
  marker: ['M15.5 4.5l4 4L10 18H6v-4z', 'M13 7l4 4', 'M4 21h9'],
  arrow: ['M5 12h14', 'M13 6l6 6-6 6'],
  chevron: ['M6 9l6 6 6-6'],
}

const STYLE = `
.ws{display:flex;flex-direction:column;gap:12px}
.ws-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
.ws-head h2{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:var(--mm-fg-2)}
.ws-block{display:flex;flex-direction:column;gap:10px}
.ws-sub{display:flex;align-items:flex-start;gap:10px}
.ws-sub .ico{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;flex:none;color:var(--c,var(--mm-accent));
  background:color-mix(in srgb,var(--c,var(--mm-accent)) 11%,transparent);border:1px solid color-mix(in srgb,var(--c,var(--mm-accent)) 26%,transparent)}
.ws-sub .txt{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.ws-sub h3{font-size:13.5px}
.ws-sub p{margin:0;line-height:1.45}
.ws-actions{display:flex;gap:8px;flex-wrap:wrap}
.ws-actions .grow{flex:1 1 auto}
.ws-actions .mm-btn{padding:9px 12px}
.ws-meta{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--mm-muted);min-height:16px}
.ws-meta b{color:var(--mm-fg-2);font-weight:650;font-variant-numeric:tabular-nums}
.ws-groups{list-style:none;margin:0;padding:4px;display:flex;flex-direction:column;gap:2px;border-radius:12px;background:rgba(0,0,0,.22);border:1px solid var(--mm-border)}
.ws-groups:empty{display:none}
.ws-group{display:flex;align-items:center;gap:10px;padding:6px 6px 6px 10px;border-radius:9px;transition:background .15s}
.ws-group:hover{background:rgba(255,255,255,.04)}
.ws-group .mm-dot{width:9px;height:9px}
.ws-group .name{flex:1;min-width:0;font-weight:600;font-size:13px;color:var(--mm-fg);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ws-group .name.unnamed{color:var(--mm-muted);font-style:italic;font-weight:500}
.ws-group .count{font:600 11px/1 var(--mm-mono);color:var(--mm-fg-2);padding:4px 7px;border-radius:99px;background:color-mix(in srgb,var(--c) 14%,transparent);border:1px solid color-mix(in srgb,var(--c) 30%,transparent);white-space:nowrap}
.ws-group .mm-btn.icon svg{transition:transform .2s var(--mm-ease)}
.ws-group .mm-btn[aria-expanded="false"] svg{transform:rotate(-90deg)}
.ws-group[data-collapsed="true"] .name{color:var(--mm-fg-2)}
.ws-status{font-size:12.5px;color:var(--mm-fg-2);display:flex;align-items:center;gap:8px}
.ws-status:empty{display:none}
.ws-status .mm-icon{width:14px;height:14px;color:var(--mm-lime)}
.ws-skel{display:flex;flex-direction:column;gap:7px;padding:8px 10px;border-radius:12px;border:1px solid var(--mm-border)}
.ws-skel .mm-skeleton{height:12px}
.ws-msg:empty{display:none}
.ws .mm-btn[aria-busy="true"]:disabled{opacity:.92;cursor:progress}
.ws .mm-btn.primary .mm-spinner{border-color:rgba(6,8,13,.22);border-top-color:#06080D}
.ws .mm-divider{margin:2px 0}
.ws-key{display:inline-flex;align-items:center;gap:4px;white-space:nowrap}
.ws-note{font-size:12px;color:var(--mm-muted);padding:8px 10px;border-radius:var(--mm-radius-sm);border:1px dashed var(--mm-border-strong)}
.ws-hub{display:flex;align-items:center;gap:10px}
.ws-hub .txt{flex:1;min-width:0}
`

function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue
    if (k === 'class') el.className = v
    else if (k === 'text') el.textContent = v
    else if (k === 'style') el.style.cssText = v
    else el.setAttribute(k, v === true ? '' : String(v))
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c)
  return el
}
function icon(name) {
  const s = document.createElementNS(SVGNS, 'svg')
  s.setAttribute('viewBox', '0 0 24 24')
  s.setAttribute('aria-hidden', 'true')
  s.setAttribute('class', 'mm-icon')
  for (const d of ICONS[name]) {
    const p = document.createElementNS(SVGNS, 'path')
    p.setAttribute('d', d)
    s.appendChild(p)
  }
  return s
}
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
const isWeb = url => /^https?:\/\//i.test(url || '')

function friendly(e) {
  const m = String(e?.message || e || '')
  if (/Cannot access|cannot be scripted|chrome-extension:|webstore|extensions gallery|Receiving end|Could not establish|No active tab|No tab with id|Frame with ID/i.test(m)) {
    return 'Master Mind can’t reach this page. Reload it and try again.'
  }
  return m || 'Something went wrong.'
}

export function mount(root, ctx) {
  if (!document.getElementById('mm-ws-style')) document.head.appendChild(h('style', { id: 'mm-ws-style' }, STYLE))
  root.classList.add('ws')
  root.setAttribute('aria-labelledby', 'ws-title')

  let alive = true
  let grouping = false
  let windowId = ctx.tab?.windowId ?? null
  let refreshSeq = 0

  // ───────── Smart Tab Grouping ─────────
  const countEl = h('span', {}, 'Checking this window…')
  const groupLabel = h('span', {}, 'Group my tabs')
  const groupIcon = h('span', { style: 'display:contents' }, icon('sparkle'))
  const groupBtn = h('button', { type: 'button', class: 'mm-btn primary grow', 'aria-describedby': 'ws-count' }, groupIcon, groupLabel)
  const ungroupBtn = h('button', { type: 'button', class: 'mm-btn', disabled: true }, icon('ungroup'), 'Ungroup all')
  const status = h('div', { class: 'ws-status', role: 'status', 'aria-live': 'polite' })
  let statusTimer = 0
  /** Show the outcome of the last action for a while, then get out of the way. */
  function setStatus(...kids) {
    status.replaceChildren(...kids)
    clearTimeout(statusTimer)
    if (kids.length) statusTimer = setTimeout(() => status.replaceChildren(), 9000)
  }
  const list = h('ul', { class: 'ws-groups', 'aria-label': 'Tab groups in this window' })
  const groupMsg = h('div', { class: 'ws-msg' })
  const skeleton = h('div', { class: 'ws-skel', hidden: true, 'aria-hidden': 'true' },
    h('div', { class: 'mm-skeleton', style: 'width:70%' }), h('div', { class: 'mm-skeleton', style: 'width:52%' }), h('div', { class: 'mm-skeleton', style: 'width:61%' }))

  const groupingBlock = h('div', { class: 'ws-block' },
    h('div', { class: 'ws-sub', style: '--c:var(--mm-violet)' },
      h('span', { class: 'ico' }, icon('group')),
      h('div', { class: 'txt' },
        h('h3', {}, 'Smart Tab Grouping'),
        h('p', { class: 'mm-muted mm-small' }, 'Claude sorts this window’s ungrouped tabs into colored groups by topic.'))),
    h('div', { class: 'ws-actions' }, groupBtn, ungroupBtn),
    h('div', { class: 'ws-meta', id: 'ws-count' }, countEl),
    status, groupMsg, skeleton, list)

  // ───────── Capture text ─────────
  const ocrBtn = h('button', { type: 'button', class: 'mm-btn grow', 'aria-keyshortcuts': 'Alt+Shift+O' }, icon('scan'), 'Capture text from screen')
  const ocrNote = h('div', { class: 'ws-note', hidden: true })
  const ocrMsg = h('div', { class: 'ws-msg' })
  const ocrBlock = h('div', { class: 'ws-block' },
    h('div', { class: 'ws-sub', style: '--c:var(--mm-cyan)' },
      h('span', { class: 'ico' }, icon('scan')),
      h('div', { class: 'txt' },
        h('h3', {}, 'Screen text capture'),
        h('p', { class: 'mm-muted mm-small' }, 'Drag over any part of the page (images, charts, video frames, canvas) and Claude transcribes the text.'))),
    h('div', { class: 'ws-actions' }, ocrBtn),
    h('div', { class: 'ws-meta' }, h('span', { class: 'ws-key' }, 'Shortcut ', h('kbd', {}, 'Alt'), '+', h('kbd', {}, 'Shift'), '+', h('kbd', {}, 'O'))),
    ocrNote, ocrMsg)

  // ───────── Highlight Hub ─────────
  const hlCount = h('p', { class: 'mm-muted mm-small' }, 'Every passage you highlight, across every site, in one place.')
  const hubBtn = h('button', { type: 'button', class: 'mm-btn sm' }, 'Open', icon('arrow'))
  hubBtn.setAttribute('aria-label', 'Open the Highlight Hub')
  const hubBlock = h('div', { class: 'ws-hub ws-sub', style: '--c:var(--mm-lime)' },
    h('span', { class: 'ico' }, icon('marker')),
    h('div', { class: 'txt' }, h('h3', {}, 'Highlight Hub'), hlCount),
    hubBtn)

  root.replaceChildren(
    h('div', { class: 'ws-head' }, h('h2', { id: 'ws-title' }, 'Browser workspace')),
    groupingBlock, h('hr', { class: 'mm-divider' }), ocrBlock, h('hr', { class: 'mm-divider' }), hubBlock)

  // ───────── live window state ─────────
  async function currentWindowId() {
    if (ctx.tab?.windowId != null) return ctx.tab.windowId
    return (await chrome.windows.getCurrent().catch(() => null))?.id ?? null
  }

  async function refresh() {
    const seq = ++refreshSeq
    windowId = await currentWindowId()
    if (windowId == null) return
    const [tabs, groups] = await Promise.all([
      chrome.tabs.query({ windowId }),
      chrome.tabGroups.query({ windowId }),
    ]).catch(() => [[], []])
    if (!alive || seq !== refreshSeq) return
    const counts = new Map()
    for (const t of tabs) if (t.groupId !== NONE) counts.set(t.groupId, (counts.get(t.groupId) || 0) + 1)
    const eligible = tabs.filter(t => !t.pinned && t.groupId === NONE && isWeb(t.url || t.pendingUrl)).length
    renderCounts(eligible, groups.length)
    // Order groups as they appear in the tab strip.
    const firstIndex = new Map()
    for (const t of tabs) if (t.groupId !== NONE && !firstIndex.has(t.groupId)) firstIndex.set(t.groupId, t.index)
    groups.sort((a, b) => (firstIndex.get(a.id) ?? 0) - (firstIndex.get(b.id) ?? 0))
    renderGroups(groups.map(g => ({ ...g, count: counts.get(g.id) || 0 })))
  }
  const scheduleRefresh = (() => { let t; return () => { clearTimeout(t); t = setTimeout(refresh, 250) } })()

  function renderCounts(eligible, groupCount) {
    if (grouping) return
    countEl.replaceChildren(
      h('b', {}, String(eligible)), ` ungrouped web ${eligible === 1 ? 'tab' : 'tabs'}`,
      groupCount ? ` · ${plural(groupCount, 'group')}` : '', ' in this window')
    groupBtn.disabled = eligible < MIN_TABS
    groupLabel.textContent = eligible >= MIN_TABS ? `Group ${eligible} tabs` : 'Group my tabs'
    groupBtn.title = eligible < MIN_TABS ? `Open at least ${MIN_TABS} ungrouped web tabs to group them` : ''
    ungroupBtn.disabled = !groupCount
  }

  function renderGroups(groups) {
    list.replaceChildren(...groups.map(g => {
      const c = GROUP_HEX[g.color] || GROUP_HEX.grey
      const name = g.title?.trim()
      const toggle = h('button', {
        type: 'button', class: 'mm-btn ghost icon sm', 'aria-expanded': String(!g.collapsed),
        'aria-label': `${g.collapsed ? 'Expand' : 'Collapse'} ${name || 'unnamed'} group`, title: g.collapsed ? 'Expand group' : 'Collapse group',
      }, icon('chevron'))
      toggle.addEventListener('click', async () => {
        try { await chrome.tabGroups.update(g.id, { collapsed: !g.collapsed }) } catch (e) { ctx.toast(friendly(e)) }
        scheduleRefresh()
      })
      return h('li', { class: 'ws-group', style: `--c:${c}`, 'data-color': g.color, 'data-collapsed': String(!!g.collapsed), 'data-group-id': g.id },
        h('span', { class: 'mm-dot', 'aria-hidden': 'true' }),
        h('span', { class: `name${name ? '' : ' unnamed'}` }, name || 'Unnamed group'),
        h('span', { class: 'count' }, plural(g.count, 'tab')),
        toggle)
    }))
  }

  function setGrouping(on, n = 0) {
    grouping = on
    groupBtn.disabled = on
    ungroupBtn.disabled = on
    groupBtn.setAttribute('aria-busy', String(on))
    groupIcon.replaceChildren(on ? h('span', { class: 'mm-spinner', 'aria-hidden': 'true' }) : icon('sparkle'))
    groupLabel.textContent = on ? 'Grouping…' : 'Group my tabs'
    skeleton.hidden = !on
    if (on) countEl.textContent = `Claude is sorting ${plural(n, 'tab')}…`
  }

  groupBtn.addEventListener('click', async () => {
    if (grouping) return
    groupMsg.replaceChildren()
    setStatus()
    const wid = await currentWindowId()
    const eligible = (await chrome.tabs.query({ windowId: wid })).filter(t => !t.pinned && t.groupId === NONE && isWeb(t.url || t.pendingUrl)).length
    setGrouping(true, eligible)
    let res
    try {
      res = await chrome.runtime.sendMessage({ type: 'TABS_GROUP', windowId: wid })
    } catch (e) {
      res = { ok: false, error: friendly(e) }
    }
    if (!alive) return
    setGrouping(false)
    if (res?.ok) {
      const n = res.groups.length
      setStatus(icon('sparkle'), `Sorted ${plural(res.total, 'tab')} into ${plural(n, 'group')}.`)
      ctx.toast(`Created ${plural(n, 'tab group')}`)
    } else {
      groupMsg.replaceChildren(ctx.errorBox({ code: res?.code, message: res?.error || 'Grouping failed.' }))
    }
    await refresh()
  })

  ungroupBtn.addEventListener('click', async () => {
    groupMsg.replaceChildren()
    setStatus()
    ungroupBtn.disabled = true
    try {
      const res = await chrome.runtime.sendMessage({ type: 'TABS_UNGROUP', windowId: await currentWindowId() })
      if (!res?.ok) throw new Error(res?.error || 'Ungrouping failed.')
      setStatus(res.count ? `Ungrouped ${plural(res.count, 'tab')}.` : 'There were no groups to undo.')
    } catch (e) {
      if (alive) groupMsg.replaceChildren(ctx.errorBox({ message: friendly(e) }))
    }
    if (alive) await refresh()
  })

  // ───────── capture text ─────────
  function renderOcrAvailability() {
    const url = ctx.tab?.url || ''
    const ok = isWeb(url)
    ocrBtn.disabled = !ok
    ocrNote.hidden = ok
    if (!ok) ocrNote.textContent = ctx.tab ? 'Text capture works on regular web pages. Chrome doesn’t let extensions capture this one.' : 'Open a web page to capture text from it.'
  }

  ocrBtn.addEventListener('click', async () => {
    ocrMsg.replaceChildren()
    ocrBtn.disabled = true
    try {
      const res = await ctx.sendToTab('MM_OCR_START')
      if (res && res.ok === false) throw new Error(res.error)
      ctx.toast('Drag over the page to capture text. Esc cancels.')
    } catch (e) {
      if (alive) ocrMsg.replaceChildren(ctx.errorBox({ message: friendly(e) }))
    } finally {
      if (alive) renderOcrAvailability()
    }
  })

  // ───────── highlight hub ─────────
  async function renderHighlightCount() {
    const n = await ctx.db.count('highlights').catch(() => 0)
    if (!alive) return
    hlCount.textContent = n
      ? `${plural(n, 'highlight')} saved across the web. Search, filter and export them.`
      : 'Every passage you highlight, across every site, in one place.'
  }
  hubBtn.addEventListener('click', () => ctx.openHub('highlights'))

  // ───────── subscriptions ─────────
  const tabEvents = [chrome.tabs.onCreated, chrome.tabs.onRemoved, chrome.tabs.onUpdated, chrome.tabs.onAttached, chrome.tabs.onDetached, chrome.tabs.onMoved]
  const groupEvents = [chrome.tabGroups.onCreated, chrome.tabGroups.onUpdated, chrome.tabGroups.onRemoved, chrome.tabGroups.onMoved]
  const onTabsChanged = () => scheduleRefresh()
  for (const ev of [...tabEvents, ...groupEvents]) ev?.addListener(onTabsChanged)
  const offDb = onDbChange(e => { if (e.store === 'highlights') renderHighlightCount() })
  addEventListener('pagehide', () => {
    alive = false
    for (const ev of [...tabEvents, ...groupEvents]) ev?.removeListener(onTabsChanged)
    offDb()
  }, { once: true })

  renderOcrAvailability()
  refresh()
  renderHighlightCount()

  return {
    onShow() { renderOcrAvailability(); refresh(); renderHighlightCount() },
    onPage() { renderOcrAvailability(); if (ctx.tab?.windowId !== windowId) refresh() },
  }
}
