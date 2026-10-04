// StudyPilot · floating Study Assistant sidebar for Google Docs, Classroom
// (and any page you open it on from the right-click menu or Alt+Shift+S).
(() => {
  // If a live copy is already running, do nothing. If an old copy was orphaned by
  // an extension reload, clear its UI and start fresh.
  try { if (window.__studyPilotAlive?.()) return } catch { /* orphaned */ }
  document.getElementById('studypilot-root')?.remove()
  window.__studyPilotAlive = () => !!chrome.runtime?.id

  const md = globalThis.SPMarkdown
  const ICON = chrome.runtime.getURL('icons/icon48.png')
  const isDocs = location.host === 'docs.google.com'

  const ACCENTS = {
    violet: ['#7C3AED', '#A78BFA'], indigo: ['#4F46E5', '#818CF8'], cyan: ['#0891B2', '#22D3EE'],
    emerald: ['#059669', '#34D399'], rose: ['#E11D48', '#FB7185'], amber: ['#D97706', '#FBBF24'],
  }

  const TOOLS = [
    ['explain', '💡', 'Explain'],
    ['hint', '🪜', 'Hint'],
    ['simplify', '🧒', 'Simplify'],
    ['summarize', '📝', 'Summarize'],
    ['define', '📖', 'Define'],
    ['grammar', '✍️', 'Grammar'],
    ['check', '✅', 'Check'],
    ['flashcards', '🃏', 'Flashcards'],
    ['quiz', '🎯', 'Quiz me'],
    ['stats', '📊', 'Stats'],
  ]

  let settings = { theme: 'auto', accent: 'violet', showLauncher: true, sidebarSide: 'right' }
  let open = false
  let wide = false
  let mode = 'explain'
  let port = null
  let lastResult = null // { tool, input, text }
  let userEditedInput = false

  // ───────── DOM ─────────
  const host = document.createElement('div')
  host.id = 'studypilot-root'
  host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;top:0;left:0;width:0;height:0;'
  const root = host.attachShadow({ mode: 'open' })
  root.innerHTML = `<style>${css()}</style>
    <button class="launcher" title="StudyPilot (Alt+Shift+S)"><img alt="" src="${ICON}"></button>
    <aside class="panel" role="complementary" aria-label="StudyPilot study assistant">
      <header>
        <img class="logo" alt="" src="${ICON}">
        <div class="brand"><b>StudyPilot</b><span>Study Assistant</span></div>
        <button class="icon-btn" data-act="wide" title="Expand">⤢</button>
        <button class="icon-btn" data-act="close" title="Close (Esc)">✕</button>
      </header>
      <div class="scroll">
        <div class="input-card">
          <div class="row">
            <label for="sp-input">Text to study</label>
            <span class="count" id="sp-count">0 words</span>
          </div>
          <textarea id="sp-input" placeholder="${isDocs ? 'Copy text in your Doc (Ctrl+C), then click “Paste” or press Ctrl+V here…' : 'Highlight text on the page, or paste/type it here…'}"></textarea>
          <div class="answer-wrap" hidden>
            <label for="sp-answer">Your answer</label>
            <textarea id="sp-answer" placeholder="Type or paste YOUR answer. StudyPilot will tell you what's right, what's off, and give a hint."></textarea>
          </div>
          <div class="row gap">
            <button class="chip" data-act="selection">✂️ Selection</button>
            <button class="chip" data-act="paste">📋 Paste</button>
            <button class="chip" data-act="speak-input" title="Read aloud">🔊</button>
            <button class="chip" data-act="clear" title="Clear">🧹</button>
          </div>
        </div>
        <div class="tools" role="toolbar"></div>
        <button class="run" data-act="run"><span class="run-label">Explain</span><kbd>Ctrl ↵</kbd></button>
        <section class="output" hidden>
          <div class="out-head">
            <span class="out-title"></span>
            <div class="out-actions">
              <button class="icon-btn" data-act="speak" title="Read aloud">🔊</button>
              <button class="icon-btn" data-act="copy" title="Copy">⧉</button>
              <button class="icon-btn" data-act="stop" title="Stop" hidden>■</button>
            </div>
          </div>
          <div class="out-body" aria-live="polite"></div>
          <form class="followup" hidden>
            <input placeholder="Ask a follow-up question…" aria-label="Follow-up question">
            <button type="submit">Ask</button>
          </form>
        </section>
        <div class="notice" hidden></div>
      </div>
      <footer>Made with 💜 by <b>Abdullah Masoud</b> · StudyPilot</footer>
    </aside>`
  ;(document.body || document.documentElement).appendChild(host)

  const $ = s => root.querySelector(s)
  const panel = $('.panel')
  const launcher = $('.launcher')
  const input = $('#sp-input')
  const answer = $('#sp-answer')
  const output = $('.output')
  const outBody = $('.out-body')
  const notice = $('.notice')

  const toolsEl = $('.tools')
  for (const [id, emoji, label] of TOOLS) {
    const b = document.createElement('button')
    b.className = 'tool'
    b.dataset.tool = id
    b.innerHTML = `<span>${emoji}</span>${label}`
    toolsEl.appendChild(b)
  }

  // Keep page shortcuts (Docs, Classroom) from stealing our keystrokes.
  panel.addEventListener('keydown', e => { if (e.key === 'Escape') setOpen(false) })
  for (const ev of ['keydown', 'keyup', 'keypress', 'paste', 'copy', 'cut']) {
    panel.addEventListener(ev, e => e.stopPropagation())
  }

  // ───────── settings + theme ─────────
  function applySettings() {
    const [a, a2] = ACCENTS[settings.accent] || ACCENTS.violet
    const dark = settings.theme === 'dark' || (settings.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches)
    host.style.setProperty('--accent', a)
    host.style.setProperty('--accent2', a2)
    host.dataset.theme = dark ? 'dark' : 'light'
    panel.classList.toggle('left', settings.sidebarSide === 'left')
    launcher.classList.toggle('left', settings.sidebarSide === 'left')
    launcher.hidden = !settings.showLauncher || open
  }
  const loadSettings = () => chrome.storage.local.get('settings').then(r => { settings = { ...settings, ...(r.settings || {}) }; applySettings() }).catch(() => {})
  loadSettings()
  chrome.storage.onChanged.addListener((c, area) => { if (area === 'local' && c.settings) loadSettings() })
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applySettings)

  // ───────── open / close ─────────
  function setOpen(v) {
    open = v
    panel.classList.toggle('open', v)
    launcher.hidden = !settings.showLauncher || v
    if (v) {
      grabSelection()
      setTimeout(() => input.focus({ preventScroll: true }), 150)
    } else stopSpeaking()
  }

  launcher.addEventListener('click', () => setOpen(true))

  // ───────── selection tracking ─────────
  let lastSelection = ''
  const readSelection = () => {
    try { return String(window.getSelection()?.toString() || '').trim() } catch { return '' }
  }
  document.addEventListener('mouseup', e => {
    if (e.composedPath().includes(host)) return
    const s = readSelection()
    if (s) {
      lastSelection = s
      if (open && !userEditedInput) setInput(s)
    }
  }, true)

  function grabSelection() {
    const s = readSelection() || lastSelection
    if (s && !userEditedInput) setInput(s)
  }

  function setInput(text) {
    input.value = text.slice(0, 20000)
    userEditedInput = false
    updateCount()
  }

  const words = s => (s.match(/[\p{L}\p{N}'’-]+/gu) || []).length
  function updateCount() {
    const n = words(input.value)
    $('#sp-count').textContent = `${n} word${n === 1 ? '' : 's'}`
  }
  input.addEventListener('input', () => { userEditedInput = true; updateCount() })

  // ───────── tool selection ─────────
  function selectTool(id) {
    mode = id
    for (const b of root.querySelectorAll('.tool')) b.classList.toggle('active', b.dataset.tool === id)
    $('.answer-wrap').hidden = id !== 'check'
    const t = TOOLS.find(x => x[0] === id)
    $('.run-label').textContent = id === 'check' ? 'Check my answer' : id === 'stats' ? 'Writing stats' : t[2]
    input.placeholder = id === 'check'
      ? 'Paste the question here…'
      : (isDocs ? 'Copy text in your Doc (Ctrl+C), then click “Paste” or press Ctrl+V here…' : 'Highlight text on the page, or paste/type it here…')
  }
  toolsEl.addEventListener('click', e => {
    const b = e.target.closest('.tool')
    if (!b) return
    selectTool(b.dataset.tool)
    if (input.value.trim() && b.dataset.tool !== 'check') run()
  })
  selectTool('explain')

  // ───────── actions ─────────
  panel.addEventListener('click', async e => {
    const act = e.target.closest('[data-act]')?.dataset.act
    if (!act) return
    if (act === 'close') setOpen(false)
    if (act === 'wide') { wide = !wide; panel.classList.toggle('wide', wide) }
    if (act === 'selection') {
      const s = readSelection() || lastSelection
      if (s) setInput(s)
      else flash(isDocs ? 'Google Docs hides selections from extensions. Copy the text (Ctrl+C) and use “Paste”.' : 'Highlight some text on the page first.')
    }
    if (act === 'paste') {
      try {
        const t = await navigator.clipboard.readText()
        if (t) { setInput(t); userEditedInput = true } else flash('Clipboard is empty. Copy some text first.')
      } catch {
        input.focus()
        flash('Press Ctrl+V (⌘V on Mac) to paste into the box.')
      }
    }
    if (act === 'clear') { input.value = ''; answer.value = ''; userEditedInput = false; updateCount(); output.hidden = true }
    if (act === 'run') run()
    if (act === 'stop') port?.postMessage({ type: 'stop' })
    if (act === 'copy' && lastResult) {
      navigator.clipboard.writeText(lastResult.text).then(() => flash('Copied ✓'), () => flash('Copy failed'))
    }
    if (act === 'speak') speak(outBody.innerText)
    if (act === 'speak-input') speak(input.value)
    if (act === 'open-settings') chrome.runtime.sendMessage({ type: 'OPEN_SETTINGS' })
  })

  input.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run() } })
  answer.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run() } })

  $('.followup').addEventListener('submit', e => {
    e.preventDefault()
    const q = $('.followup input').value.trim()
    if (!q || !lastResult) return
    $('.followup input').value = ''
    const history = [
      { role: 'user', content: `(${lastResult.tool}) ${lastResult.input}`.slice(0, 20000) },
      { role: 'assistant', content: lastResult.text || '(no text)' },
    ]
    ask('ask', '', q, history, `Follow-up: ${q}`)
  })

  let flashTimer
  function flash(msg) {
    notice.textContent = msg
    notice.hidden = false
    clearTimeout(flashTimer)
    flashTimer = setTimeout(() => { notice.hidden = true }, 4000)
  }

  // ───────── run tools ─────────
  function run() {
    const text = input.value.trim()
    if (mode === 'stats') return showStats(text)
    if (!text) return flash(mode === 'check' ? 'Paste the question first.' : 'Add some text first: highlight, paste, or type it.')
    if (mode === 'check' && !answer.value.trim()) return flash('Type your answer so it can be checked.')
    const label = $('.run-label').textContent
    ask(mode, text, mode === 'check' ? answer.value.trim() : undefined, undefined, label)
  }

  function ask(tool, text, extra, history, title) {
    try { port?.disconnect() } catch { /* already closed */ }
    output.hidden = false
    $('.out-title').textContent = title
    outBody.innerHTML = '<div class="thinking"><i></i><i></i><i></i></div>'
    $('.followup').hidden = true
    $('[data-act="stop"]').hidden = false
    let buf = ''
    let raf = 0
    const paint = () => { raf = 0; outBody.innerHTML = md.render(buf) + '<span class="caret"></span>' }

    try {
      port = chrome.runtime.connect({ name: 'ai' })
    } catch {
      outBody.innerHTML = '<p class="err">StudyPilot was updated. Refresh this page to keep using it.</p>'
      return
    }
    const myPort = port
    myPort.onMessage.addListener(msg => {
      if (msg.type === 'delta') {
        buf += msg.text
        if (!raf) raf = requestAnimationFrame(paint)
      } else if (msg.type === 'done') {
        cancelAnimationFrame(raf)
        $('[data-act="stop"]').hidden = true
        lastResult = { tool, input: extra && tool === 'check' ? `${text}\n\nMy answer: ${extra}` : text || extra, text: msg.text }
        if (tool === 'quiz' && msg.data) renderQuiz(msg.data)
        else if (tool === 'flashcards' && msg.data) renderCards(msg.data, msg.saved)
        else outBody.innerHTML = md.render(msg.text) + (msg.truncated ? '<p class="muted">(Answer was cut short.)</p>' : '')
        $('.followup').hidden = tool === 'quiz' || tool === 'flashcards'
        myPort.disconnect()
      } else if (msg.type === 'error') {
        cancelAnimationFrame(raf)
        $('[data-act="stop"]').hidden = true
        if (msg.message === 'NO_KEY') {
          outBody.innerHTML = `<div class="setup"><b>One-time setup needed</b><p>Add your Claude API key to turn on the AI tools. Writing stats works without it.</p><button data-act="open-settings" class="run small">Open settings</button></div>`
        } else {
          outBody.innerHTML = (buf ? md.render(buf) : '') + `<p class="err">${md.esc(msg.message)}</p>`
        }
        myPort.disconnect()
      }
    })
    myPort.onDisconnect.addListener(() => { $('[data-act="stop"]').hidden = true })
    myPort.postMessage({ tool, text, extra, history })
  }

  function renderQuiz(data) {
    const qs = data.questions || []
    let score = 0
    let answered = 0
    outBody.innerHTML = `<p class="muted">Pick an answer for each question.</p>`
    qs.forEach((q, i) => {
      const card = document.createElement('div')
      card.className = 'quiz'
      card.innerHTML = `<p><b>${i + 1}.</b> ${md.esc(q.q)}</p>`
      const opts = document.createElement('div')
      opts.className = 'opts'
      ;(q.options || []).forEach((o, j) => {
        const b = document.createElement('button')
        b.textContent = `${'ABCD'[j] || j + 1}. ${o}`
        b.addEventListener('click', () => {
          if (card.dataset.done) return
          card.dataset.done = '1'
          answered++
          const right = j === q.answer
          if (right) score++
          b.classList.add(right ? 'right' : 'wrong')
          opts.children[q.answer]?.classList.add('right')
          const why = document.createElement('p')
          why.className = 'why'
          why.textContent = `${right ? '✅ Correct!' : '❌ Not quite.'} ${q.why}`
          card.appendChild(why)
          if (answered === qs.length) {
            const s = document.createElement('p')
            s.className = 'score'
            s.textContent = `Score: ${score}/${qs.length} ${score === qs.length ? '🏆' : score >= qs.length / 2 ? '👍' : '💪 Keep going!'}`
            outBody.appendChild(s)
          }
        })
        opts.appendChild(b)
      })
      card.appendChild(opts)
      outBody.appendChild(card)
    })
  }

  function renderCards(data, saved) {
    const cards = data.cards || []
    outBody.innerHTML = `<p class="muted">${saved ? `Saved <b>${saved}</b> cards to the “${md.esc(data.deck || 'General')}” deck. Review them in the StudyPilot popup → Cards.` : 'No cards were generated.'}</p>`
    for (const c of cards) {
      const el = document.createElement('button')
      el.className = 'flip'
      el.innerHTML = `<span class="front">${md.esc(c.front)}</span><span class="back">${md.esc(c.back)}</span>`
      el.title = 'Click to flip'
      el.addEventListener('click', () => el.classList.toggle('flipped'))
      outBody.appendChild(el)
    }
  }

  // ───────── writing stats (local, instant, free) ─────────
  function syllables(w) {
    w = w.toLowerCase().replace(/[^a-z]/g, '')
    if (w.length <= 3) return 1
    w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '')
    return Math.max(1, (w.match(/[aeiouy]{1,2}/g) || []).length)
  }
  const STOP = new Set('the a an and or but of to in on at for with is are was were be been it this that as by from i you he she we they my your his her our their not no so if then than too very can will just do does did have has had me him them us what which who'.split(' '))

  function showStats(text) {
    if (!text) return flash('Add some text first.')
    const ws = text.match(/[\p{L}\p{N}'’-]+/gu) || []
    const sentences = text.split(/[.!?]+(?=\s|$)/).map(s => s.trim()).filter(Boolean)
    const paras = text.split(/\n\s*\n/).filter(p => p.trim()).length
    const syl = ws.reduce((n, w) => n + syllables(w), 0)
    const wps = ws.length / Math.max(1, sentences.length)
    const spw = syl / Math.max(1, ws.length)
    const ease = Math.round(206.835 - 1.015 * wps - 84.6 * spw)
    const grade = Math.max(0, Math.round((0.39 * wps + 11.8 * spw - 15.59) * 10) / 10)
    const long = sentences.filter(s => words(s) > 25).length
    const passive = (text.match(/\b(am|is|are|was|were|be|been|being)\s+\w+(ed|en)\b/gi) || []).length
    const freq = {}
    for (const w of ws) { const k = w.toLowerCase(); if (k.length > 3 && !STOP.has(k)) freq[k] = (freq[k] || 0) + 1 }
    const top = Object.entries(freq).filter(([, n]) => n > 2).sort((a, b) => b[1] - a[1]).slice(0, 6)
    const level = ease >= 80 ? 'Very easy' : ease >= 60 ? 'Plain English' : ease >= 40 ? 'Fairly difficult' : 'Difficult'
    const stat = (k, v) => `<div class="stat"><b>${v}</b><span>${k}</span></div>`
    output.hidden = false
    $('.followup').hidden = true
    $('.out-title').textContent = 'Writing stats'
    lastResult = { tool: 'stats', input: text, text: `Words: ${ws.length}, sentences: ${sentences.length}, reading ease: ${ease} (${level}), grade ${grade}` }
    outBody.innerHTML = `
      <div class="stats">
        ${stat('words', ws.length)}${stat('characters', text.length)}${stat('sentences', sentences.length)}
        ${stat('paragraphs', paras)}${stat('min read', Math.max(1, Math.round(ws.length / 230)))}${stat('min speech', Math.max(1, Math.round(ws.length / 140)))}
      </div>
      <p><b>Readability:</b> ${ease} · ${level} · about grade ${grade}</p>
      <p><b>Avg sentence:</b> ${wps.toFixed(1)} words${long ? ` · <span class="warn">${long} long sentence${long > 1 ? 's' : ''} (25+ words)</span>` : ''}</p>
      ${passive ? `<p><b>Possible passive voice:</b> ${passive} spot${passive > 1 ? 's' : ''}</p>` : ''}
      ${top.length ? `<p><b>Most repeated words:</b> ${top.map(([w, n]) => `<span class="tag">${md.esc(w)} ×${n}</span>`).join(' ')}</p>` : ''}
      <p class="muted">Tip: try ✍️ Grammar for detailed feedback on your own writing.</p>`
  }

  // ───────── read aloud ─────────
  function speak(text) {
    if (!text?.trim()) return flash('Nothing to read yet.')
    if (speechSynthesis.speaking) return stopSpeaking()
    const u = new SpeechSynthesisUtterance(text.slice(0, 5000))
    u.rate = 1.02
    speechSynthesis.speak(u)
  }
  function stopSpeaking() { try { speechSynthesis.cancel() } catch { /* unsupported */ } }

  // ───────── messages from background (menu, shortcut) ─────────
  chrome.runtime.onMessage.addListener((msg, _s, reply) => {
    if (msg?.type !== 'SIDEBAR') return
    if (msg.action === 'toggle') setOpen(!open)
    if (msg.action === 'open') setOpen(true)
    if (msg.action === 'run') {
      setOpen(true)
      if (msg.text) setInput(msg.text)
      userEditedInput = true
      selectTool(msg.tool)
      run()
    }
    reply({ ok: true })
  })

  // ───────── styles ─────────
  function css() {
    return `
    :host { --accent:#7C3AED; --accent2:#A78BFA; }
    :host([data-theme="light"]) { --bg:#ffffff; --bg2:#F6F5FB; --card:#ffffff; --fg:#1B1530; --muted:#6B6585; --line:#E6E3F0; --shadow:0 20px 60px rgba(40,20,90,.22); }
    :host([data-theme="dark"]) { --bg:#13111C; --bg2:#1B1828; --card:#211D31; --fg:#EEEAF8; --muted:#A29CB8; --line:#2F2A45; --shadow:0 20px 60px rgba(0,0,0,.55); }
    * { box-sizing:border-box; font-family: Inter, "Segoe UI", system-ui, -apple-system, Roboto, sans-serif; }
    button { font:inherit; cursor:pointer; }
    [hidden] { display:none !important; }
    .launcher { position:fixed; right:22px; bottom:22px; width:52px; height:52px; border-radius:16px; border:0; padding:0;
      background:linear-gradient(135deg,var(--accent),#C026D3); box-shadow:0 10px 30px rgba(124,58,237,.45); transition:transform .2s; display:grid; place-items:center; }
    .launcher.left { right:auto; left:22px; }
    .launcher:hover { transform:translateY(-3px) scale(1.05); }
    .launcher img { width:40px; height:40px; border-radius:11px; }
    .panel { position:fixed; top:12px; right:12px; bottom:12px; width:380px; max-width:calc(100vw - 24px); display:flex; flex-direction:column;
      background:var(--bg); color:var(--fg); border:1px solid var(--line); border-radius:20px; box-shadow:var(--shadow);
      transform:translateX(calc(100% + 30px)); transition:transform .28s cubic-bezier(.2,.8,.2,1), width .2s; font-size:14px; line-height:1.5; overflow:hidden; }
    .panel.left { right:auto; left:12px; transform:translateX(calc(-100% - 30px)); }
    .panel.open { transform:none; }
    .panel.wide { width:560px; }
    header { display:flex; align-items:center; gap:10px; padding:14px 14px 12px; background:linear-gradient(135deg,var(--accent),#C026D3); color:#fff; }
    header .logo { width:34px; height:34px; border-radius:10px; box-shadow:0 2px 8px rgba(0,0,0,.2); }
    .brand { display:flex; flex-direction:column; flex:1; line-height:1.2; }
    .brand b { font-size:16px; letter-spacing:.2px; } .brand span { font-size:12px; opacity:.85; }
    header .icon-btn { color:#fff; background:rgba(255,255,255,.16); }
    header .icon-btn:hover { background:rgba(255,255,255,.28); }
    .icon-btn { border:0; width:30px; height:30px; border-radius:9px; background:var(--bg2); color:var(--fg); display:grid; place-items:center; font-size:14px; }
    .icon-btn:hover { background:var(--line); }
    .scroll { flex:1; overflow:auto; padding:14px; display:flex; flex-direction:column; gap:12px; }
    .input-card { background:var(--bg2); border:1px solid var(--line); border-radius:14px; padding:10px; display:flex; flex-direction:column; gap:8px; }
    .row { display:flex; align-items:center; justify-content:space-between; }
    .row.gap { justify-content:flex-start; gap:6px; flex-wrap:wrap; }
    label { font-size:12px; font-weight:600; color:var(--muted); text-transform:uppercase; letter-spacing:.5px; }
    .count { font-size:12px; color:var(--muted); }
    textarea { width:100%; min-height:96px; max-height:260px; resize:vertical; border:1px solid var(--line); border-radius:10px; padding:9px 10px;
      background:var(--card); color:var(--fg); font-size:14px; outline:none; }
    textarea:focus, .followup input:focus { border-color:var(--accent); box-shadow:0 0 0 3px color-mix(in srgb, var(--accent) 25%, transparent); }
    .answer-wrap { display:flex; flex-direction:column; gap:6px; }
    .chip { border:1px solid var(--line); background:var(--card); color:var(--fg); border-radius:999px; padding:4px 10px; font-size:12px; }
    .chip:hover { border-color:var(--accent); }
    .tools { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:6px; }
    .tool { border:1px solid var(--line); background:var(--card); color:var(--fg); border-radius:12px; padding:8px 2px 6px; font-size:11px; font-weight:600;
      display:flex; flex-direction:column; align-items:center; gap:2px; transition:all .15s; }
    .tool span { font-size:18px; }
    .tool:hover { border-color:var(--accent); transform:translateY(-1px); }
    .tool.active { background:color-mix(in srgb, var(--accent) 14%, var(--card)); border-color:var(--accent); color:var(--accent); }
    :host([data-theme="dark"]) .tool.active { color:var(--accent2); }
    .run { border:0; border-radius:12px; padding:11px; color:#fff; font-weight:700; font-size:14px; background:linear-gradient(135deg,var(--accent),#C026D3);
      display:flex; align-items:center; justify-content:center; gap:10px; box-shadow:0 6px 18px color-mix(in srgb, var(--accent) 35%, transparent); }
    .run:hover { filter:brightness(1.08); }
    .run.small { padding:8px 14px; font-size:13px; }
    kbd { font-size:10px; background:rgba(255,255,255,.2); padding:2px 6px; border-radius:6px; font-family:inherit; }
    .output { border:1px solid var(--line); border-radius:14px; background:var(--card); overflow:hidden; }
    .out-head { display:flex; align-items:center; justify-content:space-between; padding:8px 10px; border-bottom:1px solid var(--line); background:var(--bg2); }
    .out-title { font-weight:700; font-size:13px; }
    .out-actions { display:flex; gap:4px; }
    .out-body { padding:10px 14px; overflow-wrap:anywhere; }
    .out-body h3, .out-body h4, .out-body h5, .out-body h6 { margin:10px 0 4px; font-size:14px; }
    .out-body p { margin:6px 0; } .out-body ul, .out-body ol { margin:6px 0; padding-left:20px; }
    .out-body code { background:var(--bg2); padding:1px 5px; border-radius:5px; font-family:ui-monospace,Consolas,monospace; font-size:12.5px; }
    .out-body pre { background:var(--bg2); padding:10px; border-radius:8px; overflow:auto; }
    .out-body pre code { background:none; padding:0; }
    .out-body blockquote { margin:6px 0; padding-left:10px; border-left:3px solid var(--accent); color:var(--muted); }
    .out-body a { color:var(--accent); }
    .muted { color:var(--muted); font-size:13px; } .err { color:#E11D48; } .warn { color:#D97706; }
    .caret { display:inline-block; width:7px; height:15px; background:var(--accent); vertical-align:text-bottom; animation:blink 1s steps(1) infinite; border-radius:2px; }
    @keyframes blink { 50% { opacity:0 } }
    .thinking { display:flex; gap:5px; padding:8px 0; } .thinking i { width:8px; height:8px; border-radius:50%; background:var(--accent); animation:bounce 1s infinite ease-in-out; }
    .thinking i:nth-child(2) { animation-delay:.15s } .thinking i:nth-child(3) { animation-delay:.3s }
    @keyframes bounce { 0%,80%,100% { transform:scale(.5); opacity:.4 } 40% { transform:scale(1); opacity:1 } }
    .followup { display:flex; gap:6px; padding:8px 10px; border-top:1px solid var(--line); }
    .followup input { flex:1; border:1px solid var(--line); border-radius:10px; padding:7px 10px; background:var(--bg2); color:var(--fg); outline:none; font-size:13px; }
    .followup button { border:0; border-radius:10px; padding:0 14px; background:var(--accent); color:#fff; font-weight:600; }
    .quiz { border:1px solid var(--line); border-radius:12px; padding:8px 10px; margin:8px 0; }
    .opts { display:flex; flex-direction:column; gap:5px; }
    .opts button { text-align:left; border:1px solid var(--line); background:var(--bg2); color:var(--fg); border-radius:9px; padding:7px 9px; font-size:13px; }
    .opts button:hover { border-color:var(--accent); }
    .opts button.right { background:#DCFCE7; border-color:#16A34A; color:#14532D; }
    .opts button.wrong { background:#FFE4E6; border-color:#E11D48; color:#881337; }
    .why { font-size:13px; margin:6px 0 0; } .score { font-weight:700; font-size:15px; text-align:center; }
    .flip { display:block; width:100%; min-height:64px; margin:8px 0; border:1px solid var(--line); border-radius:12px; background:var(--bg2); color:var(--fg); padding:12px; text-align:left; font-size:13px; }
    .flip .back { display:none; color:var(--accent); } .flip.flipped .front { display:none; } .flip.flipped .back { display:block; }
    :host([data-theme="dark"]) .flip .back { color:var(--accent2); }
    .stats { display:grid; grid-template-columns:repeat(3,1fr); gap:6px; margin:4px 0 8px; }
    .stat { background:var(--bg2); border-radius:10px; padding:8px; text-align:center; } .stat b { display:block; font-size:18px; } .stat span { font-size:11px; color:var(--muted); }
    .tag { display:inline-block; background:var(--bg2); border-radius:999px; padding:1px 8px; font-size:12px; margin:2px 0; }
    .setup { text-align:center; padding:8px 0; } .setup p { color:var(--muted); }
    .notice { position:sticky; bottom:0; background:var(--fg); color:var(--bg); border-radius:10px; padding:9px 12px; font-size:13px; box-shadow:var(--shadow); }
    footer { padding:8px 14px; font-size:11.5px; color:var(--muted); border-top:1px solid var(--line); text-align:center; background:var(--bg2); }
    footer b { background:linear-gradient(90deg,var(--accent),#C026D3); -webkit-background-clip:text; background-clip:text; color:transparent; }
    .scroll::-webkit-scrollbar { width:8px } .scroll::-webkit-scrollbar-thumb { background:var(--line); border-radius:8px }
    @media (prefers-reduced-motion: reduce) { .panel, .launcher, .tool { transition:none } .caret, .thinking i { animation:none } }
    `
  }
})()
