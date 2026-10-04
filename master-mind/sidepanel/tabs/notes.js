// Notes tab: the Markdown workspace in compact mode, plus quick capture from the page being read.
// Listens to the panel bus: ctx.on('insert-note', {markdown, source?}) appends to the open note
// (creating one titled after the page when none is open).
import { createWorkspace, mdLink } from '../../lib/workspace.js'
import { normalizeUrl } from '../../lib/text.js'

const LAST_KEY = 'mm-notes-last'
const STYLES = `
.nt-quick { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.nt-quick .mm-btn { flex: 1 1 auto; }
.nt-quick .nt-hub { flex: none; }
.nt-hint { font-size: 11.5px; color: var(--mm-muted); margin: -4px 2px 0; }
`

const svg = d => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  s.setAttribute('viewBox', '0 0 24 24')
  s.setAttribute('aria-hidden', 'true')
  s.innerHTML = d // static icon paths
  return s
}
const ICON_LINK = '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>'
const ICON_CLIP = '<path d="M9 4h6v3H9zM9 5H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-3M8.5 12h7M8.5 16h5"/>'
const ICON_HUB = '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'

/** "[p3][p9]" → "(¶3, ¶9)": citations only make sense next to the live page, so notes get plain text. */
export function plainCitations(md) {
  return String(md || '')
    .replace(/\s*((?:\[p\d+\])+)/g, (m, group) => ` (${[...group.matchAll(/p(\d+)/g)].map(x => `¶${x[1]}`).join(', ')})`)
    .replace(/ +([.,;:!?])/g, '$1')
}

export function mount(root, ctx) {
  if (!document.getElementById('mm-notes-tab-style')) {
    const st = document.createElement('style')
    st.id = 'mm-notes-tab-style'
    st.textContent = STYLES
    document.head.appendChild(st)
  }

  const isWeb = () => /^https?:/i.test(ctx.tab?.url || '')
  const pageTitle = () => ctx.page?.title || ctx.tab?.title || 'Untitled page'
  const pageUrl = () => ctx.page?.url || ctx.tab?.url || ''
  const pageKey = () => (ctx.page?.key || (isWeb() ? normalizeUrl(ctx.tab.url) : null))
  const pageSource = () => (isWeb() ? { url: pageUrl(), title: pageTitle() } : null)

  const linkBtn = document.createElement('button')
  linkBtn.type = 'button'
  linkBtn.className = 'mm-btn sm'
  linkBtn.title = 'Add a link to this page to the open note'
  linkBtn.append(svg(ICON_LINK), 'Link this page')
  const clipBtn = document.createElement('button')
  clipBtn.type = 'button'
  clipBtn.className = 'mm-btn sm'
  clipBtn.title = 'Add this page’s brief (summary and takeaways) to the open note'
  clipBtn.append(svg(ICON_CLIP), 'Clip page brief')
  const hubBtn = document.createElement('button')
  hubBtn.type = 'button'
  hubBtn.className = 'mm-btn ghost icon sm nt-hub'
  hubBtn.title = 'Open this note in the Knowledge Hub'
  hubBtn.setAttribute('aria-label', 'Open this note in the Knowledge Hub')
  hubBtn.append(svg(ICON_HUB))
  const quick = document.createElement('div')
  quick.className = 'nt-quick'
  quick.setAttribute('role', 'group')
  quick.setAttribute('aria-label', 'Capture from this page')
  quick.append(linkBtn, clipBtn, hubBtn)
  const hint = document.createElement('p')
  hint.className = 'nt-hint'
  hint.hidden = true
  const host = document.createElement('div')
  root.append(quick, hint, host)

  let initialId = null
  try { initialId = localStorage.getItem(LAST_KEY) } catch { /* storage blocked */ }
  const ws = createWorkspace(host, {
    db: ctx.db,
    uid: ctx.uid,
    renderMarkdown: ctx.renderMarkdown,
    runTask: ctx.runTask,
    settings: () => ctx.settings,
    compact: true,
    initialId,
    onOpenNote(id) {
      try { if (id) localStorage.setItem(LAST_KEY, id); else localStorage.removeItem(LAST_KEY) } catch { /* storage blocked */ }
      hubBtn.disabled = !id
    },
    pageKey,
    pageSource,
    openUrl: url => chrome.tabs.create({ url }),
    openSettings: () => ctx.openHub('settings'),
    toast: msg => ctx.toast(msg),
  })

  const offInsert = ctx.on('insert-note', data => {
    if (!data?.markdown) return
    ws.insert(data.markdown, data.source, { title: pageTitle() }).catch(e => ctx.toast(`Couldn’t add to the note: ${e.message}`))
  })
  void offInsert // the panel lives as long as this tab; nothing to unmount

  function renderQuick() {
    const web = isWeb()
    linkBtn.disabled = !web
    clipBtn.disabled = !web
    hint.hidden = web
    hint.textContent = web ? '' : 'Open a regular web page to link or clip it. Notes still work here.'
  }

  linkBtn.addEventListener('click', async () => {
    const src = pageSource()
    if (!src) return
    await ws.insert(mdLink(src.title, src.url), src, { title: src.title })
  })

  let clipSeq = 0
  clipBtn.addEventListener('click', async () => {
    const src = pageSource()
    const key = pageKey()
    if (!src || !key) return
    const seq = ++clipSeq
    clipBtn.disabled = true
    try {
      const rec = await ctx.db.get('pages', key)
      if (seq !== clipSeq || pageKey() !== key) return // navigated away meanwhile
      const brief = rec?.brief
      if (!brief?.summary) {
        ctx.toast('No brief for this page yet. Generate one in the Brief tab first.')
        return
      }
      const parts = [`## Brief: ${src.title.replace(/\s+/g, ' ').trim()}`, plainCitations(brief.summary).trim()]
      const takeaways = (brief.takeaways || []).filter(Boolean)
      if (takeaways.length) parts.push(`**Key takeaways**\n${takeaways.map(t => `- ${plainCitations(t).trim()}`).join('\n')}`)
      const topics = (brief.topics || rec.topics || []).filter(Boolean)
      if (topics.length) parts.push(`*Topics: ${topics.join(' · ')}*`)
      parts.push(`Source: ${mdLink(src.title, src.url)}`)
      await ws.insert(parts.join('\n\n'), src, { title: src.title })
    } catch (e) {
      ctx.toast(`Couldn’t clip the brief: ${e.message}`)
    } finally {
      renderQuick()
    }
  })

  hubBtn.addEventListener('click', () => {
    const id = ws.current()?.id
    ctx.openHub('notes', id ? `id=${encodeURIComponent(id)}` : '')
  })

  renderQuick()
  return {
    onShow() { renderQuick() },
    onPage() { renderQuick(); ws.refresh() },
  }
}
