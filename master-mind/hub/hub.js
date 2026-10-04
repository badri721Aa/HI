// Knowledge Hub shell: hash router (#view?params) hosting views from ./views/.
// Each view exports mount(root, ctx) → optional { unmount() }.
import { getSettings, onSettings, applyAccent } from '../lib/store.js'
import { db, uid, onChange } from '../lib/db.js'
import { runTask } from '../lib/ai.js'
import { renderMarkdown, escapeHtml } from '../vendor/markdown.js'

const VIEWS = ['highlights', 'notes', 'graph', 'history', 'settings']
const root = document.getElementById('view')
let current = null
let settings = await getSettings()
applyAccent(document.documentElement, settings.accent)
onSettings(s => { settings = s; applyAccent(document.documentElement, s.accent) })
document.getElementById('ver').textContent = chrome.runtime.getManifest().version

let toastTimer
function toast(msg, ms = 2400) {
  let el = document.querySelector('.mm-toast')
  if (!el) { el = document.createElement('div'); el.className = 'mm-toast'; el.setAttribute('role', 'status'); document.body.appendChild(el) }
  el.textContent = msg
  el.hidden = false
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { el.hidden = true }, ms)
}

function parseHash() {
  const [view, query = ''] = location.hash.slice(1).split('?')
  return { view: VIEWS.includes(view) ? view : 'highlights', params: new URLSearchParams(query) }
}

async function route() {
  const { view, params } = parseHash()
  for (const a of document.querySelectorAll('.nav a')) {
    if (a.dataset.view === view) a.setAttribute('aria-current', 'page')
    else a.removeAttribute('aria-current')
  }
  try { current?.unmount?.() } catch (e) { console.error(e) }
  root.replaceChildren()
  const ctx = {
    params,
    get settings() { return settings },
    db, uid, onDbChange: onChange, runTask, renderMarkdown, escapeHtml, toast,
    navigate(v, p = '') { location.hash = `${v}${p ? `?${p}` : ''}` },
    /** Open (or focus) a URL in a normal browser tab. */
    openUrl(url) { return chrome.tabs.create({ url }) },
  }
  try {
    const mod = await import(`./views/${view}.js`)
    current = mod.mount(root, ctx) || {}
  } catch (e) {
    console.error(e)
    const err = document.createElement('div')
    err.className = 'mm-error'
    err.textContent = `This view failed to load: ${e.message}`
    root.appendChild(err)
    current = null
  }
  document.title = `Master Mind · ${view[0].toUpperCase()}${view.slice(1)}`
}

addEventListener('hashchange', route)
route()
