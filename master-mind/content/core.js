// Master Mind content-script core. Loaded first; every other content/*.js file extends globalThis.MM.
// Classic script (content scripts can't be ES modules). Runs in the page's isolated world.
(() => {
  // A live copy already runs here → skip. An orphan from an extension reload → let the new copy take over.
  try { if (globalThis.MM?.alive?.()) { globalThis.MM.__skip = true; return } } catch { /* orphaned */ }
  document.querySelectorAll('[data-mm-host]').forEach(el => el.remove())

  const handlers = new Map()
  const events = new Map()
  const hosts = new Map()
  const TOKENS_URL = chrome.runtime.getURL('lib/tokens.css')
  const ACCENTS = {
    cyan: ['#22D3EE', '#A78BFA'], violet: ['#A78BFA', '#F472B6'], lime: ['#A3E635', '#22D3EE'],
    pink: ['#F472B6', '#FBBF24'], amber: ['#FBBF24', '#FB7185'],
  }

  const MM = {
    __skip: false,
    version: chrome.runtime.getManifest().version,
    settings: {},

    /** True while this script's extension context is still valid. */
    alive: () => !!chrome.runtime?.id,

    /** Send a message to the background. Resolves null if the extension was reloaded. */
    async send(type, data = {}) {
      if (!MM.alive()) return null
      try { return await chrome.runtime.sendMessage({ type, ...data }) } catch { return null }
    },

    /** Register a handler for messages sent to this tab (chrome.tabs.sendMessage). May return a Promise. */
    on(type, fn) { handlers.set(type, fn) },

    /** In-page event bus between content modules. */
    events: {
      on(name, fn) { (events.get(name) || events.set(name, new Set()).get(name)).add(fn); return () => events.get(name)?.delete(fn) },
      emit(name, data) { for (const fn of events.get(name) || []) { try { fn(data) } catch (e) { console.warn('[MM]', name, e) } } },
    },

    /**
     * Get (or create) an isolated Shadow DOM host. Design tokens are loaded inside.
     * @param {string} id unique per feature, e.g. 'highlight-menu'
     * @param {string} [css] extra CSS for this host
     * @returns {{host: HTMLElement, root: ShadowRoot, layer: HTMLDivElement}}
     */
    shadow(id, css = '') {
      if (hosts.has(id)) return hosts.get(id)
      const host = document.createElement('mm-host')
      host.dataset.mmHost = id
      host.style.cssText = 'all:initial;position:absolute;top:0;left:0;width:0;height:0;z-index:2147483646;'
      const root = host.attachShadow({ mode: 'open' })
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = TOKENS_URL
      const style = document.createElement('style')
      style.textContent = `:host{all:initial} .layer{font:14px/1.5 var(--mm-font);color:var(--mm-fg)} ${css}`
      const layer = document.createElement('div')
      layer.className = 'mm-root layer'
      root.append(link, style, layer)
      ;(document.body || document.documentElement).appendChild(host)
      MM.applyAccent(host)
      // Keep page shortcuts from swallowing keystrokes typed into our UI.
      for (const ev of ['keydown', 'keyup', 'keypress']) layer.addEventListener(ev, e => e.stopPropagation())
      const h = { host, root, layer }
      hosts.set(id, h)
      return h
    },

    applyAccent(el) {
      const [a, b] = ACCENTS[MM.settings.accent] || ACCENTS.cyan
      el.style.setProperty('--mm-accent', a)
      el.style.setProperty('--mm-accent-2', b)
    },

    toast(msg, ms = 2400) {
      const { layer } = MM.shadow('toast')
      layer.replaceChildren()
      const t = document.createElement('div')
      t.className = 'mm-toast'
      t.setAttribute('role', 'status')
      t.textContent = msg
      layer.appendChild(t)
      clearTimeout(MM._toastTimer)
      MM._toastTimer = setTimeout(() => t.remove(), ms)
    },

    /**
     * Run an AI task through the background (streams over a port).
     * @returns {Promise<{text, data, sources}>} rejects with Error whose .code mirrors lib/ai.js AIError codes
     */
    ai(task, input, { onText, signal } = {}) {
      return new Promise((resolve, reject) => {
        if (!MM.alive()) return reject(Object.assign(new Error('Master Mind was updated. Reload this page.'), { code: 'RELOAD' }))
        const port = chrome.runtime.connect({ name: 'mm-ai' })
        let done = false
        signal?.addEventListener('abort', () => { try { port.postMessage({ type: 'stop' }) } catch { /* closed */ } })
        port.onMessage.addListener(m => {
          if (m.type === 'delta') onText?.(m.text)
          else if (m.type === 'done') { done = true; port.disconnect(); resolve(m.result) }
          else if (m.type === 'error') { done = true; port.disconnect(); reject(Object.assign(new Error(m.message), { code: m.code })) }
        })
        port.onDisconnect.addListener(() => { if (!done) reject(Object.assign(new Error('Connection to Master Mind closed.'), { code: 'ABORT' })) })
        port.postMessage({ task, input })
      })
    },

    /** Canonical page key (mirror of lib/text.js normalizeUrl). */
    pageKey(href = location.href) {
      try {
        const u = new URL(href)
        u.hash = ''
        for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$|ref$|ref_src$|igshid$|si$|spm$)/i.test(k)) u.searchParams.delete(k)
        u.searchParams.sort()
        let s = u.toString()
        if (s.endsWith('/') && u.pathname !== '/') s = s.slice(0, -1)
        return s
      } catch { return String(href) }
    },

    debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms) } },
    throttle(fn, ms) { let last = 0, t; return (...a) => { const now = Date.now(); clearTimeout(t); if (now - last >= ms) { last = now; fn(...a) } else t = setTimeout(() => { last = Date.now(); fn(...a) }, ms - (now - last)) } },
    escape: s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    /** True for nodes that belong to Master Mind's own UI. */
    isOwn: node => !!(node && (node.nodeType === 1 ? node : node.parentElement)?.closest?.('[data-mm-host],mm-host')),
  }
  globalThis.MM = MM

  // Fonts must be declared at document scope to be usable inside shadow roots.
  if (!document.getElementById('mm-fonts')) {
    const f = document.createElement('style')
    f.id = 'mm-fonts'
    const u = p => chrome.runtime.getURL(p)
    f.textContent = `@font-face{font-family:"Inter MM";src:url("${u('vendor/fonts/inter-latin-wght-normal.woff2')}") format("woff2-variations");font-weight:100 900;font-display:swap}
@font-face{font-family:"Inter MM";src:url("${u('vendor/fonts/inter-latin-wght-italic.woff2')}") format("woff2-variations");font-weight:100 900;font-style:italic;font-display:swap}
@font-face{font-family:"JetBrains Mono MM";src:url("${u('vendor/fonts/jetbrains-mono-latin-wght-normal.woff2')}") format("woff2-variations");font-weight:100 800;font-display:swap}`
    ;(document.head || document.documentElement).appendChild(f)
  }

  // Settings (synced preferences) stay live.
  const loadSettings = () => chrome.storage.sync.get('settings').then(r => {
    MM.settings = r.settings || {}
    for (const { host } of hosts.values()) MM.applyAccent(host)
    MM.events.emit('settings', MM.settings)
  }).catch(() => {})
  loadSettings()
  chrome.storage.onChanged.addListener((c, area) => { if (area === 'sync' && c.settings) loadSettings() })

  // One listener dispatches to every module's handlers.
  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    const fn = handlers.get(msg?.type)
    if (!fn) return false
    Promise.resolve()
      .then(() => fn(msg, sender))
      .then(v => reply(v === undefined ? { ok: true } : v), e => reply({ ok: false, error: String(e?.message || e) }))
    return true
  })
  MM.on('MM_PING', () => ({ ok: true, url: location.href, key: MM.pageKey() }))

  // SPA navigation: tell modules (and the side panel) when the URL changes without a reload.
  let lastUrl = location.href
  const checkUrl = () => {
    if (location.href === lastUrl) return
    const from = lastUrl
    lastUrl = location.href
    MM.events.emit('urlchange', { from, to: lastUrl })
    MM.send('MM_PAGE_CHANGED', { url: lastUrl })
  }
  if (globalThis.navigation?.addEventListener) globalThis.navigation.addEventListener('navigatesuccess', () => setTimeout(checkUrl, 0))
  addEventListener('popstate', checkUrl)
  setInterval(checkUrl, 1500)
})()
