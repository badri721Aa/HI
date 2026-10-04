// Shared storage helpers for the popup and the background worker.
// Everything lives in chrome.storage.local so it stays on this device.

export const DEFAULT_SETTINGS = {
  apiKey: '',
  model: 'claude-opus-5-5',
  effort: 'low',
  theme: 'auto',
  accent: 'violet',
  remindersOn: true,
  reminderHours: 24,
  autoSync: true,
  dailyCapacityMin: 120,
  dailyFocusGoalMin: 60,
  focusLen: 25,
  breakLen: 5,
  showLauncher: true,
  sidebarSide: 'right',
}

export const MODELS = [
  { id: 'claude-opus-5-5', label: 'Opus 5.5 (smartest)' },
  { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5 (balanced)' },
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5 (fastest)' },
]

export const ACCENTS = {
  violet: ['#7C3AED', '#A78BFA'],
  indigo: ['#4F46E5', '#818CF8'],
  cyan: ['#0891B2', '#22D3EE'],
  emerald: ['#059669', '#34D399'],
  rose: ['#E11D48', '#FB7185'],
  amber: ['#D97706', '#FBBF24'],
}

const DEFAULTS = {
  settings: DEFAULT_SETTINGS,
  tasks: [],
  flashcards: [],
  stats: { focusByDay: {}, doneByDay: {}, sessions: 0 },
  focus: { mode: 'focus', running: false, endsAt: 0, remainingMs: 0 },
  classroom: { connected: false, lastSync: 0, error: '' },
  notified: {},
}

export async function load(keys = Object.keys(DEFAULTS)) {
  const raw = await chrome.storage.local.get(keys)
  const out = {}
  for (const k of keys) {
    const def = DEFAULTS[k]
    const v = raw[k]
    out[k] = def && typeof def === 'object' && !Array.isArray(def) && v && typeof v === 'object' && !Array.isArray(v)
      ? { ...def, ...v }
      : v ?? structuredClone(def)
  }
  return out
}

export async function save(obj) {
  await chrome.storage.local.set(obj)
}

export async function getSettings() {
  return (await load(['settings'])).settings
}

export async function updateSettings(patch) {
  const settings = { ...(await getSettings()), ...patch }
  await save({ settings })
  return settings
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36)

export const dayKey = (d = new Date()) => {
  const x = new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

const HOUR = 3600e3
const DAY = 24 * HOUR

// Lower score = more urgent. Overdue work floats to the top, undated work sinks.
export function urgency(task, now = Date.now()) {
  if (task.done) return { score: 1e15, level: 'done', label: 'Done' }
  if (!task.due) return { score: 1e14, level: 'none', label: 'No due date' }
  const left = task.due - now
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0)
  const endOfToday = startOfToday.getTime() + DAY
  let level
  if (left < 0) level = 'overdue'
  else if (task.due < endOfToday) level = 'today'
  else if (task.due < endOfToday + DAY) level = 'tomorrow'
  else if (left < 7 * DAY) level = 'week'
  else level = 'later'
  // Bigger estimates pull a task slightly earlier so long work gets started sooner.
  const score = left - (task.estMin || 30) * 60e3 * 4
  return { score, level, label: relTime(task.due, now) }
}

export function relTime(ts, now = Date.now()) {
  const diff = ts - now
  const abs = Math.abs(diff)
  let txt
  if (abs < HOUR) txt = `${Math.max(1, Math.round(abs / 60e3))}m`
  else if (abs < DAY) txt = `${Math.round(abs / HOUR)}h`
  else txt = `${Math.round(abs / DAY)}d`
  return diff < 0 ? `Overdue ${txt}` : `Due in ${txt}`
}

export function sortByUrgency(tasks, now = Date.now()) {
  return tasks
    .map(t => ({ ...t, u: urgency(t, now) }))
    .sort((a, b) => a.u.score - b.u.score)
}

// Earliest-deadline-first planner: spreads each task's estimated minutes
// across the days before it is due, never exceeding the daily capacity
// unless a deadline forces it.
export function buildPlan(tasks, capacityMin, days = 7, now = Date.now()) {
  const start = new Date(now); start.setHours(0, 0, 0, 0)
  const plan = Array.from({ length: days }, (_, i) => ({
    date: new Date(start.getTime() + i * DAY),
    items: [],
    total: 0,
  }))
  const todo = sortByUrgency(tasks.filter(t => !t.done), now)
  for (const t of todo) {
    let remaining = t.estMin || 30
    const lastIdx = t.due
      ? Math.min(days - 1, Math.max(0, Math.floor((t.due - start.getTime()) / DAY) - (new Date(t.due).getHours() < 12 ? 1 : 0)))
      : days - 1
    for (let i = 0; i <= lastIdx && remaining > 0; i++) {
      const free = capacityMin - plan[i].total
      if (free <= 0) continue
      const chunk = Math.min(remaining, free, 90)
      plan[i].items.push({ id: t.id, title: t.title, course: t.course, minutes: chunk, level: t.u.level })
      plan[i].total += chunk
      remaining -= chunk
    }
    if (remaining > 0) {
      const i = Math.max(0, lastIdx)
      plan[i].items.push({ id: t.id, title: t.title, course: t.course, minutes: remaining, level: t.u.level, overflow: true })
      plan[i].total += remaining
    }
  }
  return plan
}

// Leitner spaced repetition: box 1..5, interval grows with each correct review.
export const BOX_DAYS = [0, 1, 2, 4, 8, 16]

export function reviewCard(card, grade) {
  const box = grade === 'again' ? 1 : Math.min(5, (card.box || 1) + (grade === 'easy' ? 2 : 1))
  return { ...card, box, next: Date.now() + BOX_DAYS[box] * DAY - (grade === 'again' ? DAY : 0), reviews: (card.reviews || 0) + 1 }
}

export function streak(byDay) {
  let n = 0
  const d = new Date()
  if (!byDay[dayKey(d)]) d.setDate(d.getDate() - 1)
  while (byDay[dayKey(d)]) { n++; d.setDate(d.getDate() - 1) }
  return n
}
