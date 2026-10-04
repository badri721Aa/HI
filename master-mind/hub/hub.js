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

let routeSeq = 0
let shownView = null
const navLabel = view => document.querySelector(`.nav a[data-view="${view}"]`)?.textContent.trim() || view

async function route() {
  const my = ++routeSeq
  const { view, params } = parseHash()
  for (const a of document.querySelectorAll('.nav a')) {
    if (a.dataset.view === view) a.setAttribute('aria-current', 'page')
    else a.removeAttribute('aria-current')
  }
  try { current?.unmount?.() } catch (e) { console.error(e) }
  current = null
  root.replaceChildren()
  const ctx = {
    params,
    get settings() { return settings },
    db, uid, onDbChange: onChange, runTask, renderMarkdown, escapeHtml, toast,
    navigate(v, p = '') { location.hash = `${v}${p ? `?${p}` : ''}` },
    /** Open a web URL in a normal browser tab. Stored URLs are untrusted, so only http(s) is allowed. */
    openUrl(url) {
      if (!/^https?:\/\//i.test(String(url || ''))) { toast('Only web links can be opened.'); return Promise.resolve(null) }
      return chrome.tabs.create({ url })
    },
  }
  let mod = null
  let error = null
  try { mod = await import(`./views/${view}.js`) } catch (e) { error = e }
  // A newer navigation started while this view's module was loading: it owns the page now.
  if (my !== routeSeq) return
  if (mod) {
    try { current = mod.mount(root, ctx) || {} } catch (e) { error = e }
  }
  if (error) {
    console.error(error)
    const err = document.createElement('div')
    err.className = 'mm-error'
    err.textContent = `This view failed to load: ${error.message}`
    root.replaceChildren(err)
    current = null
  }
  document.title = `Master Mind · ${view[0].toUpperCase()}${view.slice(1)}`
  const viewTookFocus = document.activeElement !== root && root.contains(document.activeElement)
  if (shownView !== null && view !== shownView && !viewTookFocus) {
    // A new view (not just new params): take keyboard and screen-reader users to its title, which is
    // read out. The old view's DOM is gone, so focus would otherwise fall back to the top of the page.
    const h1 = root.querySelector('.view-head h1') || root.querySelector('h1')
    if (h1) {
      if (!h1.hasAttribute('tabindex')) h1.tabIndex = -1
      h1.focus({ preventScroll: true })
    } else {
      root.focus({ preventScroll: true })
      announce(navLabel(view))
    }
  }
  shownView = view
}

/** Polite, one-line announcement (the views themselves aren't a live region: they'd be read out whole). */
function announce(msg) {
  const el = document.getElementById('routeStatus')
  el.textContent = ''
  setTimeout(() => { el.textContent = msg }, 50)
}

addEventListener('hashchange', route)
route()
