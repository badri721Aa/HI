// Knowledge Hub › Notes: the full-size Markdown workspace. #notes?id=<noteId> opens that note.
import { createWorkspace } from '../../lib/workspace.js'

const MIN_HEIGHT = 420 // below this the page scrolls too, so the editor stays usable in very short windows

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
  host.style.minHeight = `${MIN_HEIGHT}px`
  root.append(head, host)

  // Fill the viewport below the title row so the workspace (list, panes) is the only scroller, never the
  // page as well. Measured, not assumed: the hub's sidebar becomes an icon rail or a wrapping top bar on
  // narrower windows, which moves the workspace down by a varying amount.
  let raf = 0
  const fit = () => {
    raf = 0
    const top = host.getBoundingClientRect().top + scrollY
    const padBottom = parseFloat(getComputedStyle(root).paddingBottom) || 0
    host.style.height = `${Math.max(MIN_HEIGHT, Math.floor(innerHeight - top - padBottom))}px`
  }
  const refit = () => { if (!raf) raf = requestAnimationFrame(fit) }
  fit()
  addEventListener('resize', refit)
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(refit) : null
  ro?.observe(head) // the title row can wrap
  const side = document.querySelector('.side')
  if (side) ro?.observe(side) // the top bar (narrow windows) can wrap to more rows

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

  return {
    unmount() {
      removeEventListener('resize', refit)
      ro?.disconnect()
      cancelAnimationFrame(raf)
      ws.destroy()
    },
  }
}
