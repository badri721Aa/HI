// Knowledge Hub › Notes: the full-size Markdown workspace. #notes?id=<noteId> opens that note.
import { createWorkspace } from '../../lib/workspace.js'

export function mount(root, ctx) {
  const head = document.createElement('div')
  head.className = 'view-head'
  const titles = document.createElement('div')
  const h1 = document.createElement('h1')
  h1.textContent = 'Notes'
  const sub = document.createElement('p')
  sub.className = 'mm-muted mm-small'
  sub.style.margin = '4px 0 0'
  sub.textContent = 'Markdown notes with live preview, wiki links, highlights and AI assist.'
  titles.append(h1, sub)
  head.append(titles)
  const host = document.createElement('div')
  // Fill the viewport below the title row (#view padding 26 + 40, head ≈ 68): the panes scroll, not the page.
  host.style.height = 'calc(100vh - 136px)'
  host.style.minHeight = '540px'
  root.append(head, host)

  const ws = createWorkspace(host, {
    db: ctx.db,
    uid: ctx.uid,
    renderMarkdown: ctx.renderMarkdown,
    runTask: ctx.runTask,
    settings: () => ctx.settings,
    compact: false,
    initialId: ctx.params.get('id'),
    onDbChange: ctx.onDbChange,
    // Keep the address bar in sync without re-routing (replaceState fires no hashchange).
    onOpenNote(id) {
      const hash = `#notes${id ? `?id=${encodeURIComponent(id)}` : ''}`
      if (location.hash !== hash) history.replaceState(null, '', hash)
    },
    openUrl: url => ctx.openUrl(url),
    openSettings: () => ctx.navigate('settings'),
    toast: msg => ctx.toast(msg),
  })

  return { unmount() { ws.destroy() } }
}
