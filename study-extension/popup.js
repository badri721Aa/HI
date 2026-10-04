// StudyPilot popup: dashboard · planner · focus timer · flashcards · settings
import { load, save, updateSettings, uid, dayKey, sortByUrgency, buildPlan, reviewCard, streak, MODELS, ACCENTS } from './lib/store.js'

const $ = s => document.querySelector(s)
const $$ = s => [...document.querySelectorAll(s)]
const md = globalThis.SPMarkdown
const params = new URLSearchParams(location.search)
const DAY = 24 * 3600e3
const EST_STEPS = [15, 30, 45, 60, 90, 120, 180]

if (params.get('full')) document.body.classList.add('full')

let state = await load()
let filter = 'all'
let query = ''
let courseFilter = ''
let tab = 'dashboard'
let reviewing = null
let revealed = false

const send = (type, data = {}) => chrome.runtime.sendMessage({ type, ...data })

// ───────────────────────── helpers ─────────────────────────
let toastTimer
function toast(msg, action) {
  const el = $('#toast')
  el.textContent = msg
  if (action) {
    const b = document.createElement('button')
    b.textContent = action.label
    b.className = 'btn primary sm'
    b.style.marginLeft = '10px'
    b.onclick = () => { action.run(); el.hidden = true }
    el.appendChild(b)
  }
  el.hidden = false
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { el.hidden = true }, action ? 5000 : 2200)
}

const hue = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h }
const fmtMin = m => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m}m`)
const el = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v
    else if (k === 'style') e.style.cssText = v
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v)
    else if (k === 'html') e.innerHTML = v
    else e.setAttribute(k, v)
  }
  for (const k of kids.flat()) if (k != null) e.append(k)
  return e
}
const icon = path => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.innerHTML = path; return s }
const ICONS = {
  check: '<path d="M5 12l5 5L20 7"/>',
  open: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
}

// ───────────────────────── theme ─────────────────────────
function applyTheme() {
  const s = state.settings
  if (s.theme === 'auto') delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = s.theme
  const [a, a2] = ACCENTS[s.accent] || ACCENTS.violet
  document.documentElement.style.setProperty('--accent', a)
  document.documentElement.style.setProperty('--accent2', a2)
}

function greet() {
  const h = new Date().getHours()
  $('#greeting').textContent = h < 5 ? 'Late night grind 🌙' : h < 12 ? 'Good morning ☀️' : h < 17 ? 'Good afternoon 📚' : 'Good evening ✨'
}

// ───────────────────────── tabs ─────────────────────────
function showTab(name) {
  tab = name
  for (const s of $$('.tab')) s.hidden = s.id !== `tab-${name}`
  for (const b of $$('.nav')) b.classList.toggle('active', b.dataset.tab === name)
  try { localStorage.setItem('sp-tab', name) } catch { /* storage unavailable */ }
  render()
}
for (const b of $$('.nav')) b.addEventListener('click', () => showTab(b.dataset.tab))

function render() {
  if (tab === 'dashboard') renderDashboard()
  if (tab === 'plan') renderPlan()
  if (tab === 'focus') renderFocus()
  if (tab === 'cards') renderCards()
}

// ───────────────────────── dashboard ─────────────────────────
function matchesFilter(t) {
  const lvl = t.u.level
  if (filter === 'done') return t.done
  if (t.done) return false
  if (filter === 'overdue') return lvl === 'overdue'
  if (filter === 'today') return lvl === 'today'
  if (filter === 'week') return lvl === 'today' || lvl === 'tomorrow' || lvl === 'week'
  if (filter === 'later') return lvl === 'later' || lvl === 'none'
  return true
}

function renderDashboard() {
  const now = Date.now()
  const all = sortByUrgency(state.tasks, now)
  const open = all.filter(t => !t.done)
  const count = lvls => open.filter(t => lvls.includes(t.u.level)).length
  const overdue = count(['overdue'])
  const today = count(['today'])
  const week = count(['today', 'tomorrow', 'week'])
  const done7 = state.tasks.filter(t => t.done && t.doneAt && now - t.doneAt < 7 * DAY).length
  $('#cOverdue').textContent = overdue
  $('#cToday').textContent = today
  $('#cWeek').textContent = week
  $('#cDone').textContent = done7

  // Weekly progress: work due Monday–Sunday of this week.
  const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
  const end = start.getTime() + 7 * DAY
  const thisWeek = state.tasks.filter(t => t.due && t.due >= start.getTime() && t.due < end)
  const pct = thisWeek.length ? Math.round(100 * thisWeek.filter(t => t.done).length / thisWeek.length) : 100
  const C = 2 * Math.PI * 34
  const ring = $('#weekRing')
  ring.style.strokeDasharray = C
  ring.style.strokeDashoffset = C * (1 - pct / 100)
  $('#weekPct').textContent = `${pct}%`

  const next = open.find(t => t.due && t.due > now)
  if (overdue) {
    $('#heroTitle').textContent = `${overdue} overdue: let's fix that 💪`
  } else if (today) {
    $('#heroTitle').textContent = `${today} due today ⏳`
  } else if (open.length) {
    $('#heroTitle').textContent = `${open.length} task${open.length > 1 ? 's' : ''} on your list`
  } else {
    $('#heroTitle').textContent = 'All caught up 🎉'
  }
  $('#heroSub').textContent = next ? `Next: ${next.title} · ${next.u.label.replace('Due ', '')}` : open.length ? 'No upcoming deadlines.' : 'Nothing due soon. Enjoy it!'
  const activeDays = { ...state.stats.doneByDay, ...state.stats.focusByDay }
  const st = streak(activeDays)
  $('#streak').hidden = !st
  $('#streak').textContent = `🔥 ${st}-day streak`

  // Classroom banner + status
  const gc = state.classroom
  $('#connectBanner').hidden = gc.connected
  $('#syncError').hidden = !gc.error
  $('#syncError').textContent = gc.error ? `⚠️ ${gc.error}` : ''
  $('#syncStatus').textContent = gc.connected
    ? `Google Classroom synced ${gc.lastSync ? ago(gc.lastSync) : 'never'}`
    : 'Manual tasks only. Connect Classroom to import homework.'

  // Class filter options
  const courses = [...new Set(state.tasks.map(t => t.course).filter(Boolean))].sort()
  const sel = $('#courseFilter')
  const cur = sel.value
  sel.replaceChildren(el('option', { value: '' }, 'All classes'), ...courses.map(c => el('option', { value: c }, c)))
  sel.value = courses.includes(cur) ? cur : ''
  courseFilter = sel.value
  $('#courseList').replaceChildren(...courses.map(c => el('option', { value: c })))

  for (const c of $$('#filterChips .chip')) c.classList.toggle('active', c.dataset.filter === filter)

  const q = query.toLowerCase()
  const list = all.filter(t => matchesFilter(t) && (!courseFilter || t.course === courseFilter) && (!q || `${t.title} ${t.course}`.toLowerCase().includes(q)))
  if (filter === 'done') list.sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0))
  $('#taskList').replaceChildren(...list.slice(0, 150).map(taskRow))

  const empty = $('#empty')
  empty.hidden = list.length > 0
  if (!list.length) {
    empty.innerHTML = state.tasks.length
      ? '<b>🔍</b>Nothing matches this filter.'
      : '<b>📭</b>No homework yet. Connect Google Classroom or press <kbd>+</kbd> to add a task.'
  }
}

function ago(ts) {
  const m = Math.round((Date.now() - ts) / 60e3)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  if (m < 1440) return `${Math.round(m / 60)}h ago`
  return `${Math.round(m / 1440)}d ago`
}

function taskRow(t) {
  const lvl = t.done ? 'done' : t.u.level
  const meta = el('div', { class: 't-meta' })
  if (t.course) meta.append(el('i', { class: 'dot', style: `--c:hsl(${hue(t.course)} 70% 55%)` }), t.course)
  if (t.points) meta.append(` · ${t.points} pts`)
  if (t.source === 'classroom') meta.append(' · ', el('span', { title: 'From Google Classroom' }, '🏫'))
  const est = el('button', { class: 'est', title: 'Time estimate: click to change' }, `~${fmtMin(t.estMin || 30)}`)
  est.addEventListener('click', () => cycleEstimate(t.id))
  meta.append(' ', est)

  const actions = el('div', { class: 't-actions' })
  if (t.link) actions.append(el('a', { class: 'mini', href: t.link, target: '_blank', title: 'Open in Classroom' }, icon(ICONS.open)))
  if (t.source !== 'classroom') actions.append(el('button', { class: 'mini', title: 'Delete', onclick: () => removeTask(t.id) }, icon(ICONS.trash)))

  return el('li', { class: `task lvl-${lvl}`, 'data-id': t.id },
    el('button', { class: 'check', title: t.done ? 'Mark as not done' : 'Mark as done', 'aria-label': 'Toggle done', onclick: () => toggleDone(t.id) }, t.done ? icon(ICONS.check) : null),
    el('div', { class: 't-main' }, el('div', { class: 't-title', title: t.title }, t.title), meta),
    t.done ? null : el('span', { class: 'pill' }, t.u.level === 'none' ? 'No date' : t.u.label),
    actions,
  )
}

async function toggleDone(id) {
  const tasks = state.tasks.map(t => ({ ...t }))
  const t = tasks.find(x => x.id === id)
  if (!t) return
  const k = dayKey()
  const stats = { ...state.stats, doneByDay: { ...state.stats.doneByDay } }
  if (t.done) {
    t.done = false
    t.localDone = false
    if (t.doneAt && dayKey(t.doneAt) === k) stats.doneByDay[k] = Math.max(0, (stats.doneByDay[k] || 1) - 1)
    t.doneAt = undefined
  } else {
    t.done = true
    t.localDone = true
    t.doneAt = Date.now()
    stats.doneByDay[k] = (stats.doneByDay[k] || 0) + 1
    toast(['Nice! ✅', 'Crushed it! 🎉', 'One down! 🚀', 'Great work! ⭐'][Math.floor(Math.random() * 4)])
  }
  state.tasks = tasks
  state.stats = stats
  await save({ tasks, stats })
  renderDashboard()
}

async function cycleEstimate(id) {
  const tasks = state.tasks.map(t => {
    if (t.id !== id) return t
    const i = EST_STEPS.indexOf(t.estMin)
    return { ...t, estMin: EST_STEPS[(i + 1) % EST_STEPS.length], estEdited: true }
  })
  state.tasks = tasks
  await save({ tasks })
  render()
}

async function removeTask(id) {
  const row = $(`.task[data-id="${CSS.escape(id)}"]`)
  row?.classList.add('removing')
  const removed = state.tasks.find(t => t.id === id)
  state.tasks = state.tasks.filter(t => t.id !== id)
  setTimeout(async () => {
    await save({ tasks: state.tasks })
    renderDashboard()
    toast('Task deleted', { label: 'Undo', run: async () => { state.tasks = [...state.tasks, removed]; await save({ tasks: state.tasks }); renderDashboard() } })
  }, 200)
}

$('#search').addEventListener('input', e => { query = e.target.value; renderDashboard() })
$('#courseFilter').addEventListener('change', e => { courseFilter = e.target.value; renderDashboard() })
for (const c of $$('[data-filter]')) c.addEventListener('click', () => { filter = c.dataset.filter; renderDashboard() })
$('#addToggle').addEventListener('click', () => { const f = $('#addForm'); f.hidden = !f.hidden; if (!f.hidden) $('#fTitle').focus() })
$('#addForm').addEventListener('submit', async e => {
  e.preventDefault()
  const due = $('#fDue').value ? new Date($('#fDue').value).getTime() : null
  const task = {
    id: uid(), source: 'manual', title: $('#fTitle').value.trim(), course: $('#fCourse').value.trim(),
    due, done: false, estMin: Number($('#fEst').value), estEdited: true, created: Date.now(),
  }
  if (!task.title) return
  state.tasks = [...state.tasks, task]
  await save({ tasks: state.tasks })
  e.target.reset()
  $('#addForm').hidden = true
  filter = 'all'
  renderDashboard()
  toast('Task added ✨')
})

async function sync(interactive) {
  const btn = $('#syncBtn')
  btn.classList.add('spin')
  try {
    const r = await send('SYNC', { interactive })
    if (r?.ok) toast(`Synced: ${r.count} open assignment${r.count === 1 ? '' : 's'} 🏫`)
    else toast(r?.error ? 'Sync failed, see the message on the dashboard' : 'Sync failed')
  } finally {
    btn.classList.remove('spin')
    state = await load()
    render()
    renderSettings()
  }
}
$('#syncBtn').addEventListener('click', () => sync(true))
$('#connectBtn').addEventListener('click', () => sync(true))

// ───────────────────────── planner ─────────────────────────
function renderPlan() {
  const cap = state.settings.dailyCapacityMin
  $('#capacity').value = String(cap)
  const plan = buildPlan(state.tasks, cap)
  const fmtDay = (d, i) => i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })
  $('#planDays').replaceChildren(...plan.map((day, i) => {
    const over = day.total > cap
    return el('div', { class: 'day' },
      el('div', { class: 'day-head' }, el('b', {}, fmtDay(day.date, i)), el('span', {}, day.total ? `${fmtMin(day.total)} / ${fmtMin(cap)}` : 'Free')),
      el('div', { class: `bar${over ? ' over' : ''}` }, el('i', { style: `width:${Math.min(100, (100 * day.total) / cap)}%` })),
      day.items.length
        ? el('ul', {}, day.items.map(it => el('li', { style: `--lvl:var(--${it.level})` },
            el('i', { class: 'dot' }), el('span', { title: it.title }, it.title), el('em', {}, `${fmtMin(it.minutes)}${it.overflow ? ' ⚠️' : ''}`))))
        : el('div', { class: 'free' }, i < 2 ? 'Nothing planned. Get ahead, or rest up 😌' : 'Free day'),
    )
  }))
}
$('#capacity').addEventListener('change', async e => {
  state.settings = await updateSettings({ dailyCapacityMin: Number(e.target.value) })
  renderPlan()
})

$('#aiPlanBtn').addEventListener('click', () => {
  const open = sortByUrgency(state.tasks).filter(t => !t.done).slice(0, 40)
  if (!open.length) return toast('Add some homework first 📚')
  const payload = JSON.stringify({
    now: new Date().toString(),
    dailyMinutesAvailable: state.settings.dailyCapacityMin,
    tasks: open.map(t => ({ title: t.title, class: t.course || undefined, due: t.due ? new Date(t.due).toString() : 'none', estimateMinutes: t.estMin || 30 })),
  })
  streamInto($('#aiPlan'), 'plan', payload, $('#aiPlanBtn'))
})

function streamInto(box, tool, text, btn) {
  box.hidden = false
  box.innerHTML = '<p class="muted">Thinking…</p>'
  btn.disabled = true
  let buf = ''
  const port = chrome.runtime.connect({ name: 'ai' })
  port.onMessage.addListener(m => {
    if (m.type === 'delta') { buf += m.text; box.innerHTML = md.render(buf) }
    if (m.type === 'done') { box.innerHTML = md.render(m.text); btn.disabled = false; port.disconnect() }
    if (m.type === 'error') {
      btn.disabled = false
      box.innerHTML = m.message === 'NO_KEY'
        ? '<p>Add your Claude API key in <b>Settings</b> to use AI planning.</p>'
        : `<p class="bad">${md.esc(m.message)}</p>`
      port.disconnect()
    }
  })
  port.onDisconnect.addListener(() => { btn.disabled = false })
  port.postMessage({ tool, text })
}

// ───────────────────────── focus timer ─────────────────────────
let timerLoop
function renderFocus() {
  const f = state.focus
  const s = state.settings
  const mode = f.mode || 'focus'
  for (const b of $$('.seg-btn')) b.classList.toggle('active', b.dataset.mode === mode)
  $('.timer').classList.toggle('break', mode === 'break')
  $('#timerMode').textContent = mode === 'focus' ? (f.running ? 'Focusing…' : 'Focus') : (f.running ? 'On a break' : 'Break')
  $('#timerStart').textContent = f.running ? 'Pause' : f.remainingMs ? 'Resume' : 'Start'

  const today = state.stats.focusByDay[dayKey()] || 0
  $('#focusToday').textContent = `${today} / ${s.dailyFocusGoalMin} min`
  $('#focusBar').style.width = `${Math.min(100, (100 * today) / s.dailyFocusGoalMin)}%`
  $('#focusSessions').textContent = `${state.stats.sessions || 0} session${state.stats.sessions === 1 ? '' : 's'} total`
  const st = streak(state.stats.focusByDay)
  $('#focusStreak').textContent = st ? `🔥 ${st}-day focus streak` : ''

  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (6 - i)); return d })
  const vals = days.map(d => state.stats.focusByDay[dayKey(d)] || 0)
  const max = Math.max(30, ...vals)
  $('#weekChart').replaceChildren(...days.map((d, i) => el('div', { class: `col${i === 6 ? ' today' : ''}` },
    el('em', {}, vals[i] ? `${vals[i]}` : ''),
    el('i', { style: `height:${(100 * vals[i]) / max}%` }),
    el('span', {}, d.toLocaleDateString([], { weekday: 'narrow' })))))

  clearInterval(timerLoop)
  tickTimer()
  if (f.running) timerLoop = setInterval(tickTimer, 250)
}

function tickTimer() {
  const f = state.focus
  const s = state.settings
  const full = f.lengthMs || (f.mode === 'break' ? s.breakLen : s.focusLen) * 60e3
  const left = f.running ? Math.max(0, f.endsAt - Date.now()) : f.remainingMs || full
  const secs = Math.ceil(left / 1000)
  const txt = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`
  $('#timerTime').textContent = txt
  const C = 2 * Math.PI * 88
  const ring = $('#timerRing')
  ring.style.strokeDasharray = C
  ring.style.strokeDashoffset = C * (1 - left / full)
  if (f.running) document.title = `${txt} · StudyPilot`
}

$('#timerStart').addEventListener('click', async () => {
  state.focus = await send(state.focus.running ? 'FOCUS_PAUSE' : 'FOCUS_START', {})
  renderFocus()
})
$('#timerReset').addEventListener('click', async () => { state.focus = await send('FOCUS_RESET', { mode: state.focus.mode }); renderFocus() })
$('#timerSkip').addEventListener('click', async () => {
  state.focus = state.focus.mode === 'focus' ? await send('FOCUS_START', { mode: 'break' }) : await send('FOCUS_RESET', { mode: 'focus' })
  renderFocus()
})
for (const b of $$('.seg-btn')) b.addEventListener('click', async () => { state.focus = await send('FOCUS_RESET', { mode: b.dataset.mode }); renderFocus() })

// ───────────────────────── flashcards ─────────────────────────
function renderCards() {
  const deck = $('#deckFilter').value
  const decks = {}
  const now = Date.now()
  for (const c of state.flashcards) {
    decks[c.deck] ??= { total: 0, due: 0 }
    decks[c.deck].total++
    if (c.next <= now) decks[c.deck].due++
  }
  const names = Object.keys(decks).sort()
  $('#deckFilter').replaceChildren(el('option', { value: '' }, 'All decks'), ...names.map(n => el('option', { value: n }, n)))
  $('#deckFilter').value = names.includes(deck) ? deck : ''
  $('#deckList').replaceChildren(...names.map(n => el('option', { value: n })))
  $('#deckListView').replaceChildren(...(names.length ? names.map(n => el('li', {},
    el('b', {}, n),
    el('span', {}, `${decks[n].due} due · ${decks[n].total} cards `,
      el('button', { class: 'mini', title: `Delete “${n}”`, onclick: () => deleteDeck(n) }, icon(ICONS.trash))),
  )) : [el('li', {}, el('span', {}, 'No decks yet.'))]))

  const active = $('#deckFilter').value
  const due = state.flashcards.filter(c => (!active || c.deck === active) && c.next <= now).sort((a, b) => a.next - b.next)
  reviewing = due[0] || null
  revealed = false
  $('#reviewCard').hidden = !reviewing
  $('#reviewEmpty').hidden = !!reviewing
  if (!reviewing) {
    $('#reviewEmpty').innerHTML = state.flashcards.length ? '🎉 <b>All caught up!</b><br>No cards are due right now.' : '🃏 <b>No flashcards yet</b><br>Make some from any text with the sidebar, or add one below.'
    return
  }
  $('#fcDeck').textContent = reviewing.deck
  $('#fcFront').textContent = reviewing.front
  $('#fcBack').textContent = reviewing.back
  $('#fcBack').hidden = true
  $('#showAnswer').hidden = false
  $('#gradeBtns').hidden = true
  $('#reviewLeft').textContent = `${due.length} card${due.length === 1 ? '' : 's'} due`
}

function reveal() {
  if (!reviewing) return
  revealed = true
  $('#fcBack').hidden = false
  $('#showAnswer').hidden = true
  $('#gradeBtns').hidden = false
}

async function grade(g) {
  if (!reviewing || !revealed) return
  const updated = reviewCard(reviewing, g)
  state.flashcards = state.flashcards.map(c => (c.id === updated.id ? updated : c))
  await save({ flashcards: state.flashcards })
  renderCards()
}

async function deleteDeck(name) {
  if (!confirm(`Delete the “${name}” deck and all its cards?`)) return
  state.flashcards = state.flashcards.filter(c => c.deck !== name)
  await save({ flashcards: state.flashcards })
  renderCards()
}

$('#showAnswer').addEventListener('click', reveal)
$('#flashcard').addEventListener('click', reveal)
for (const b of $$('[data-grade]')) b.addEventListener('click', () => grade(b.dataset.grade))
$('#deckFilter').addEventListener('change', renderCards)
$('#cardForm').addEventListener('submit', async e => {
  e.preventDefault()
  const card = { id: uid(), front: $('#cFront').value.trim(), back: $('#cBack').value.trim(), deck: $('#cDeck').value.trim() || 'General', box: 1, next: Date.now(), created: Date.now() }
  if (!card.front || !card.back) return
  state.flashcards = [...state.flashcards, card]
  await save({ flashcards: state.flashcards })
  $('#cFront').value = ''
  $('#cBack').value = ''
  renderCards()
  toast('Card added 🃏')
})

// ───────────────────────── settings ─────────────────────────
const BOOL = ['autoSync', 'remindersOn', 'showLauncher']
const NUM = ['reminderHours', 'dailyFocusGoalMin', 'focusLen', 'breakLen']
const STR = ['model', 'effort', 'theme', 'sidebarSide']

$('#model').replaceChildren(...MODELS.map(m => el('option', { value: m.id }, m.label)))
$('#swatches').replaceChildren(...Object.entries(ACCENTS).map(([name, [c]]) =>
  el('button', { class: 'swatch', 'data-accent': name, title: name, style: `background:${c}`, 'aria-label': `${name} accent` })))

function renderSettings() {
  const s = state.settings
  if (document.activeElement !== $('#apiKey')) $('#apiKey').value = s.apiKey
  for (const k of BOOL) $(`#${k}`).checked = !!s[k]
  for (const k of [...NUM, ...STR]) $(`#${k}`).value = String(s[k])
  for (const b of $$('.swatch')) b.classList.toggle('active', b.dataset.accent === s.accent)
  $('#effort').disabled = s.model === 'claude-haiku-4-5'
  const gc = state.classroom
  $('#gcStatus').textContent = gc.connected
    ? `✅ Connected · last sync ${gc.lastSync ? ago(gc.lastSync) : 'never'}`
    : gc.error ? `⚠️ ${gc.error}` : 'Not connected. Click Connect and pick your school Google account.'
  $('#gcConnect').textContent = gc.connected ? 'Sync now' : 'Connect'
  $('#gcDisconnect').hidden = !gc.connected
  $('#version').textContent = `v${chrome.runtime.getManifest().version}`
}

async function set(patch) {
  state.settings = await updateSettings(patch)
  applyTheme()
  renderSettings()
}
for (const k of BOOL) $(`#${k}`).addEventListener('change', e => set({ [k]: e.target.checked }))
for (const k of NUM) $(`#${k}`).addEventListener('change', e => set({ [k]: Number(e.target.value) }))
for (const k of STR) $(`#${k}`).addEventListener('change', e => set({ [k]: e.target.value }))
for (const b of $$('.swatch')) b.addEventListener('click', () => set({ accent: b.dataset.accent }))

let keyTimer
$('#apiKey').addEventListener('input', e => {
  clearTimeout(keyTimer)
  keyTimer = setTimeout(() => set({ apiKey: e.target.value.trim() }), 300)
})
$('#showKey').addEventListener('click', () => {
  const i = $('#apiKey')
  i.type = i.type === 'password' ? 'text' : 'password'
  $('#showKey').textContent = i.type === 'password' ? 'Show' : 'Hide'
})
$('#testKey').addEventListener('click', async () => {
  const apiKey = $('#apiKey').value.trim()
  const status = $('#keyStatus')
  if (!apiKey) { status.className = 'hint bad'; status.textContent = 'Paste your API key first.'; return }
  await set({ apiKey })
  status.className = 'hint'
  status.textContent = 'Testing…'
  const r = await send('TEST_KEY', { apiKey, model: state.settings.model })
  status.className = `hint ${r?.ok ? 'ok' : 'bad'}`
  status.textContent = r?.ok ? '✅ Key works! AI tools are ready in Google Docs & Classroom.' : `❌ ${r?.error || 'Test failed'}`
})

$('#gcConnect').addEventListener('click', () => sync(true))
$('#gcDisconnect').addEventListener('click', async () => {
  if (!confirm('Disconnect Google Classroom? Imported assignments will be removed (manual tasks stay).')) return
  await send('DISCONNECT')
  state = await load()
  render()
  renderSettings()
  toast('Disconnected')
})

$('#themeBtn').addEventListener('click', () => {
  const order = ['auto', 'light', 'dark']
  const next = order[(order.indexOf(state.settings.theme) + 1) % 3]
  set({ theme: next })
  toast(`Theme: ${next === 'auto' ? 'match system' : next}`)
})

// Backup excludes your API key on purpose.
$('#exportBtn').addEventListener('click', async () => {
  const data = await load()
  data.settings = { ...data.settings, apiKey: '' }
  const blob = new Blob([JSON.stringify({ app: 'StudyPilot', version: 1, exported: new Date().toISOString(), data }, null, 2)], { type: 'application/json' })
  const a = el('a', { href: URL.createObjectURL(blob), download: `studypilot-backup-${dayKey()}.json` })
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
})
$('#importFile').addEventListener('change', async e => {
  const file = e.target.files[0]
  if (!file) return
  try {
    const json = JSON.parse(await file.text())
    if (json?.app !== 'StudyPilot' || !json.data) throw new Error('Not a StudyPilot backup')
    const { tasks, flashcards, stats, settings } = json.data
    const patch = {}
    if (Array.isArray(tasks)) patch.tasks = tasks
    if (Array.isArray(flashcards)) patch.flashcards = flashcards
    if (stats && typeof stats === 'object') patch.stats = stats
    if (settings && typeof settings === 'object') patch.settings = { ...state.settings, ...settings, apiKey: state.settings.apiKey }
    await save(patch)
    state = await load()
    applyTheme()
    render()
    renderSettings()
    toast('Backup restored ✅')
  } catch (err) {
    toast(`Import failed: ${err.message}`)
  }
  e.target.value = ''
})
$('#resetBtn').addEventListener('click', async () => {
  if (!confirm('Reset StudyPilot? This deletes all tasks, flashcards, stats and settings (including your API key) from this browser.')) return
  await chrome.storage.local.clear()
  await send('REFRESH_BADGE')
  location.reload()
})

// ───────────────────────── keyboard ─────────────────────────
document.addEventListener('keydown', e => {
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)
  if (typing || e.ctrlKey || e.metaKey || e.altKey) {
    if (e.key === 'Escape' && typing) document.activeElement.blur()
    return
  }
  const tabs = ['dashboard', 'plan', 'focus', 'cards', 'settings']
  if (tab === 'cards' && reviewing) {
    if (e.key === ' ') { e.preventDefault(); return reveal() }
    if (revealed && ['1', '2', '3'].includes(e.key)) return grade(['again', 'good', 'easy'][Number(e.key) - 1])
  }
  if (e.key >= '1' && e.key <= '5') return showTab(tabs[Number(e.key) - 1])
  if (e.key === '/') { e.preventDefault(); showTab('dashboard'); $('#search').focus() }
  if (e.key.toLowerCase() === 'n') { e.preventDefault(); showTab('dashboard'); $('#addForm').hidden = false; $('#fTitle').focus() }
  if (e.key.toLowerCase() === 'r') sync(true)
  if (e.key.toLowerCase() === 't') $('#themeBtn').click()
})

// ───────────────────────── live updates ─────────────────────────
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local') return
  const keys = Object.keys(changes)
  const fresh = await load(keys.filter(k => k in state))
  Object.assign(state, fresh)
  if (changes.settings) { applyTheme(); renderSettings() }
  if (changes.focus || changes.stats) { if (tab === 'focus') renderFocus() }
  if (changes.tasks || changes.classroom) { if (tab === 'dashboard') renderDashboard(); if (tab === 'plan') renderPlan(); renderSettings() }
  if (changes.flashcards && tab === 'cards' && !revealed) renderCards()
})
setInterval(() => { if (tab === 'dashboard') renderDashboard() }, 60e3)

// ───────────────────────── boot ─────────────────────────
applyTheme()
greet()
renderSettings()
if (params.get('welcome')) $('#welcome').hidden = false
let startTab = params.get('tab')
if (!startTab) { try { startTab = localStorage.getItem('sp-tab') } catch { /* storage unavailable */ } }
showTab(['dashboard', 'plan', 'focus', 'cards', 'settings'].includes(startTab) ? startTab : 'dashboard')
