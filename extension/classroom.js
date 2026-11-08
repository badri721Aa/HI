/* ──────────────────────────────────────────────────────────────────────────
   Alhekma Homework Helper — content script for Google Classroom / Docs / Forms.

   Grabs the question → asks Claude (via the background worker → site /api/ai) →
   types the answer into the page like a human (inputs, textareas, contenteditable,
   Google Forms text + multiple-choice, and a best-effort path for the Docs canvas).

   Shortcuts:  Alt+Shift+H toggle panel · Alt+Shift+S grab+solve · Alt+Shift+T auto-type
   ──────────────────────────────────────────────────────────────────────── */

(function () {
  'use strict'
  if (window.__alhekmaHW) return
  window.__alhekmaHW = true

  const HOST = location.hostname
  const IS_FORMS = location.pathname.includes('/forms/') || HOST === 'forms.gle'
  const IS_DOCS = HOST === 'docs.google.com' && location.pathname.includes('/document/')
  const IS_CLASSROOM = HOST === 'classroom.google.com'

  let settings = { apiBase: 'https://alhekma-cheating.vercel.app', speed: 55 }
  let stopFlag = false

  /* ── settings ──────────────────────────────────────────────────────────── */
  function loadSettings() {
    return new Promise(res => {
      chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, r => {
        if (r?.settings) settings = { ...settings, ...r.settings }
        res(settings)
      })
    })
  }
  function saveSettings() {
    chrome.runtime.sendMessage({ type: 'SET_SETTINGS', payload: settings }, () => {})
  }

  /* ── helpers ───────────────────────────────────────────────────────────── */
  const sleep = ms => new Promise(r => setTimeout(r, ms))
  const rand = (a, b) => a + Math.random() * (b - a)
  function status(msg, kind) {
    const el = document.getElementById('hw-status')
    if (el) { el.textContent = msg; el.style.color = kind === 'err' ? '#f87171' : kind === 'ok' ? '#4ade80' : '#a1a1aa' }
  }

  /* ── grab the question text from the page ──────────────────────────────── */
  function grabQuestion() {
    const sel = window.getSelection()?.toString().trim()
    if (sel && sel.length > 3) return sel

    if (IS_FORMS) {
      const q = document.querySelector('[role="listitem"] [role="heading"], [role="heading"][aria-level]')
      const box = q?.closest('[role="listitem"]')
      if (box) return box.innerText.trim().slice(0, 4000)
    }
    if (IS_CLASSROOM) {
      // assignment title + description blocks
      const main = document.querySelector('[role="main"]') || document.body
      const chunks = [...main.querySelectorAll('[role="heading"], div')]
        .map(e => e.innerText?.trim())
        .filter(t => t && t.length > 25)
      chunks.sort((a, b) => b.length - a.length)
      if (chunks[0]) return chunks[0].slice(0, 4000)
    }
    if (IS_DOCS) {
      const title = document.querySelector('.docs-title-input')?.value
      if (title) return `Document: ${title}\n\nWrite the content for this document.`
    }
    return (document.title || '').trim()
  }

  /* ── ask Claude via the background worker ──────────────────────────────── */
  function askClaude(question) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: 'AI_COMPLETE', payload: { question, apiBase: settings.apiBase } },
        r => {
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message))
          if (!r?.ok) return reject(new Error(r?.error || 'AI request failed'))
          resolve(r.text || '')
        },
      )
    })
  }

  /* ── human-like typing into a plain field / contenteditable ────────────── */
  // speed 10..100  →  ~260ms (slow) .. ~15ms (fast) per character
  function perChar() { return Math.max(8, 280 - settings.speed * 2.6) }

  function setNativeValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
    setter ? setter.call(el, value) : (el.value = value)
  }

  async function typeIntoField(el, text) {
    el.focus()
    const delay = perChar()
    if (el.isContentEditable) {
      for (const ch of text) {
        if (stopFlag) return
        document.execCommand('insertText', false, ch)
        el.dispatchEvent(new InputEvent('input', { bubbles: true, data: ch, inputType: 'insertText' }))
        await sleep(rand(delay * 0.6, delay * 1.4))
      }
      return
    }
    let cur = el.value ?? ''
    for (const ch of text) {
      if (stopFlag) return
      cur += ch
      setNativeValue(el, cur)
      el.dispatchEvent(new InputEvent('input', { bubbles: true, data: ch, inputType: 'insertText' }))
      await sleep(rand(delay * 0.6, delay * 1.4))
    }
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }

  /* ── Google Forms: text + multiple choice ──────────────────────────────── */
  async function fillForms(answer) {
    // 1) try multiple-choice match
    const options = [...document.querySelectorAll('[role="radio"], [role="checkbox"]')]
    if (options.length) {
      const labels = options.map(o => ({
        el: o,
        text: (o.getAttribute('aria-label') || o.closest('[role="listitem"]')?.innerText || o.innerText || '').trim().toLowerCase(),
      }))
      const ansLow = answer.toLowerCase()
      // direct letter answer e.g. "Answer: B" or "The answer is C"
      const letter = ansLow.match(/\b(?:answer\s*(?:is|:)?\s*)?\(?([a-e])\)?\b/)
      let hit = null
      if (letter) {
        const idx = letter[1].charCodeAt(0) - 97
        if (labels[idx]) hit = labels[idx]
      }
      if (!hit) {
        // match longest option text that appears in the answer
        const cands = labels
          .filter(l => l.text && ansLow.includes(l.text))
          .sort((a, b) => b.text.length - a.text.length)
        hit = cands[0]
      }
      if (hit) {
        hit.el.click()
        status('Multiple-choice answered ✓', 'ok')
        return true
      }
    }
    // 2) text / paragraph answer
    const field = findTypeTarget()
    if (field) { await typeIntoField(field, answer); status('Typed into form ✓', 'ok'); return true }
    return false
  }

  /* ── Google Docs canvas (hardest target) ───────────────────────────────── */
  async function fillDocs(answer) {
    const iframe = document.querySelector('.docs-texteventtarget-iframe')
    const target = iframe?.contentDocument?.querySelector('[contenteditable="true"]') || iframe?.contentDocument?.body
    if (target) {
      target.focus()
      // Attempt a paste-event injection (Docs listens for paste)
      try {
        const dt = new DataTransfer()
        dt.setData('text/plain', answer)
        const ev = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt })
        target.dispatchEvent(ev)
      } catch {}
      // Also simulate per-char keystrokes for editors that read keydown
      for (const ch of answer) {
        if (stopFlag) return true
        target.dispatchEvent(new InputEvent('textInput', { bubbles: true, data: ch }))
        target.dispatchEvent(new InputEvent('input', { bubbles: true, data: ch, inputType: 'insertText' }))
        await sleep(rand(perChar() * 0.6, perChar() * 1.4))
      }
      status('Sent to Docs — if nothing appeared, use "Copy" + Ctrl+V', 'ok')
      return true
    }
    return false
  }

  /* ── find a generic typeable target ────────────────────────────────────── */
  function findTypeTarget() {
    const active = document.activeElement
    if (active && isTypeable(active)) return active
    const cands = [...document.querySelectorAll('textarea, input[type="text"], input:not([type]), [contenteditable="true"]')]
      .filter(isVisible)
    // prefer empty ones
    return cands.find(e => !(e.value || e.innerText || '').trim()) || cands[0] || null
  }
  function isTypeable(el) {
    return el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && /^(text|search|email|url|)$/.test(el.type || '')) || el.isContentEditable)
  }
  function isVisible(el) {
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'
  }

  /* ── master auto-type dispatcher ───────────────────────────────────────── */
  async function autoType(answer) {
    stopFlag = false
    if (!answer.trim()) { status('Nothing to type — solve first', 'err'); return }
    status('Typing…')
    try {
      let done = false
      if (IS_FORMS) done = await fillForms(answer)
      else if (IS_DOCS) done = await fillDocs(answer)
      else {
        const t = findTypeTarget()
        if (t) { await typeIntoField(t, answer); done = true }
      }
      if (!done) {
        await navigator.clipboard.writeText(answer).catch(() => {})
        status('No field found — copied to clipboard, click the box + Ctrl+V', 'err')
      } else if (!stopFlag) {
        status('Done ✓', 'ok')
      } else {
        status('Stopped', 'err')
      }
    } catch (e) {
      status('Type error: ' + e.message, 'err')
    }
  }

  /* ── UI ────────────────────────────────────────────────────────────────── */
  function buildUI() {
    const btn = document.createElement('div')
    btn.id = 'hw-fab'
    btn.textContent = '🧠'
    btn.title = 'Homework Helper (Alt+Shift+H)'
    Object.assign(btn.style, {
      position: 'fixed', bottom: '20px', right: '20px', width: '46px', height: '46px',
      borderRadius: '50%', background: '#18181b', border: '1px solid #3f3f46', color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px',
      cursor: 'pointer', zIndex: 2147483647, boxShadow: '0 6px 20px rgba(0,0,0,.5)',
    })

    const panel = document.createElement('div')
    panel.id = 'hw-panel'
    Object.assign(panel.style, {
      position: 'fixed', bottom: '76px', right: '20px', width: '340px', maxHeight: '72vh',
      background: '#0b0b0d', border: '1px solid #27272a', borderRadius: '14px', zIndex: 2147483647,
      display: 'none', flexDirection: 'column', overflow: 'hidden', color: '#e4e4e7',
      font: '13px/1.5 system-ui, sans-serif', boxShadow: '0 12px 40px rgba(0,0,0,.6)',
    })
    panel.innerHTML = `
      <div id="hw-head" style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:#121214;cursor:move;border-bottom:1px solid #27272a">
        <strong style="font-size:12px;letter-spacing:.02em">Homework Helper</strong>
        <span style="font-size:10px;color:#71717a">${IS_FORMS ? 'Forms' : IS_DOCS ? 'Docs' : IS_CLASSROOM ? 'Classroom' : 'Web'}</span>
      </div>
      <div style="padding:12px;display:flex;flex-direction:column;gap:8px;overflow:auto">
        <textarea id="hw-q" placeholder="Question (or click Grab)…" rows="3" style="width:100%;resize:vertical;background:#09090b;border:1px solid #27272a;border-radius:8px;color:#e4e4e7;padding:8px;font:12px system-ui;outline:none"></textarea>
        <div style="display:flex;gap:6px">
          <button id="hw-grab" style="flex:1;${btnCss()}">Grab</button>
          <button id="hw-solve" style="flex:1;${btnCss('#6d28d9')}">Solve</button>
        </div>
        <textarea id="hw-a" placeholder="Answer appears here — editable before typing…" rows="7" style="width:100%;resize:vertical;background:#09090b;border:1px solid #27272a;border-radius:8px;color:#e4e4e7;padding:8px;font:12px system-ui;outline:none"></textarea>
        <div style="display:flex;gap:6px">
          <button id="hw-type" style="flex:1;${btnCss('#15803d')}">Auto-type</button>
          <button id="hw-stop" style="${btnCss('#b91c1c')}">Stop</button>
          <button id="hw-copy" style="${btnCss()}">Copy</button>
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-top:2px">
          <span style="font-size:10px;color:#71717a;white-space:nowrap">Speed</span>
          <input id="hw-speed" type="range" min="10" max="100" value="${settings.speed}" style="flex:1">
        </div>
        <details style="margin-top:2px">
          <summary style="font-size:10px;color:#71717a;cursor:pointer">API base</summary>
          <input id="hw-api" value="${settings.apiBase}" style="width:100%;margin-top:6px;background:#09090b;border:1px solid #27272a;border-radius:6px;color:#e4e4e7;padding:6px;font:11px monospace;outline:none">
        </details>
        <div id="hw-status" style="font-size:11px;color:#a1a1aa;min-height:16px"></div>
      </div>`

    document.documentElement.appendChild(btn)
    document.documentElement.appendChild(panel)

    const $ = id => panel.querySelector('#' + id)
    btn.onclick = () => { panel.style.display = panel.style.display === 'none' ? 'flex' : 'none' }

    $('hw-grab').onclick = () => { $('hw-q').value = grabQuestion(); status('Grabbed — edit if needed') }
    $('hw-solve').onclick = async () => {
      const q = $('hw-q').value.trim() || grabQuestion()
      $('hw-q').value = q
      if (!q) { status('No question found', 'err'); return }
      status('Claude is thinking…')
      try { const a = await askClaude(q); $('hw-a').value = a; status('Solved ✓ — review, then Auto-type', 'ok') }
      catch (e) { status(e.message, 'err') }
    }
    $('hw-type').onclick = () => autoType($('hw-a').value)
    $('hw-stop').onclick = () => { stopFlag = true; status('Stopping…', 'err') }
    $('hw-copy').onclick = async () => { await navigator.clipboard.writeText($('hw-a').value).catch(() => {}); status('Copied ✓', 'ok') }
    $('hw-speed').oninput = e => { settings.speed = +e.target.value; saveSettings() }
    $('hw-api').onchange = e => { settings.apiBase = e.target.value.trim().replace(/\/$/, ''); saveSettings() }

    makeDraggable(panel, $('hw-head'))
    return { panel, $ }
  }

  function btnCss(bg) {
    return `padding:7px 10px;border-radius:8px;border:1px solid ${bg ? 'transparent' : '#3f3f46'};background:${bg || '#1c1c1f'};color:#fff;font:12px system-ui;cursor:pointer`
  }

  function makeDraggable(panel, handle) {
    let sx, sy, ox, oy, drag = false
    handle.addEventListener('mousedown', e => {
      drag = true; sx = e.clientX; sy = e.clientY
      const r = panel.getBoundingClientRect(); ox = r.left; oy = r.top
      panel.style.bottom = 'auto'; panel.style.right = 'auto'; panel.style.left = ox + 'px'; panel.style.top = oy + 'px'
      e.preventDefault()
    })
    window.addEventListener('mousemove', e => {
      if (!drag) return
      panel.style.left = ox + (e.clientX - sx) + 'px'
      panel.style.top = oy + (e.clientY - sy) + 'px'
    })
    window.addEventListener('mouseup', () => { drag = false })
  }

  /* ── keyboard shortcuts ────────────────────────────────────────────────── */
  function wireKeys(ui) {
    window.addEventListener('keydown', async e => {
      if (!e.altKey || !e.shiftKey) return
      const k = e.key.toLowerCase()
      if (k === 'h') { ui.panel.style.display = ui.panel.style.display === 'none' ? 'flex' : 'none' }
      else if (k === 's') { ui.$('hw-solve').click() }
      else if (k === 't') { autoType(ui.$('hw-a').value) }
    })
  }

  /* ── boot ──────────────────────────────────────────────────────────────── */
  loadSettings().then(() => {
    const ui = buildUI()
    wireKeys(ui)
  })
})()
