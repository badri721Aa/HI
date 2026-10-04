// Google Classroom API sync (read-only). Pulls your active courses, their
// published coursework and your own submission state, then merges them into
// the local task list without touching manual tasks or your local edits.

const API = 'https://classroom.googleapis.com/v1/'
const DAY = 24 * 3600e3

export class AuthError extends Error {}

export async function getToken(interactive) {
  try {
    const res = await chrome.identity.getAuthToken({ interactive })
    const token = typeof res === 'string' ? res : res?.token
    if (!token) throw new AuthError('No token returned')
    return token
  } catch (e) {
    const msg = String(e?.message || e)
    if (/client id|oauth2|bad client/i.test(msg)) {
      throw new AuthError('Google sign-in is not configured yet. Add your OAuth client ID to manifest.json (see README → "Connect Google Classroom").')
    }
    throw new AuthError(msg)
  }
}

export async function signOut() {
  try {
    const token = await getToken(false)
    await chrome.identity.removeCachedAuthToken({ token })
    await fetch(`https://oauth2.googleapis.com/revoke?token=${token}`, { method: 'POST' }).catch(() => {})
  } catch { /* already signed out */ }
}

async function api(path, token) {
  const res = await fetch(API + path, { headers: { Authorization: `Bearer ${token}` } })
  if (res.status === 401) {
    await chrome.identity.removeCachedAuthToken({ token })
    throw new AuthError('Google session expired. Click Connect again.')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error?.message || `Classroom API error ${res.status}`)
  }
  return res.json()
}

async function all(path, key, token) {
  const out = []
  let pageToken = ''
  do {
    const sep = path.includes('?') ? '&' : '?'
    const data = await api(path + (pageToken ? `${sep}pageToken=${pageToken}` : ''), token)
    out.push(...(data[key] || []))
    pageToken = data.nextPageToken || ''
  } while (pageToken)
  return out
}

function dueOf(cw) {
  const d = cw.dueDate
  if (!d?.year) return null
  const t = cw.dueTime
  // dueTime is UTC; when it's missing Classroom treats the work as due at the end of the day.
  if (t && (t.hours != null || t.minutes != null)) {
    return Date.UTC(d.year, d.month - 1, d.day, t.hours || 0, t.minutes || 0)
  }
  return new Date(d.year, d.month - 1, d.day, 23, 59).getTime()
}

function estimate(cw) {
  if (cw.workType === 'SHORT_ANSWER_QUESTION' || cw.workType === 'MULTIPLE_CHOICE_QUESTION') return 15
  const pts = cw.maxPoints || 0
  if (pts >= 100) return 90
  if (pts >= 50) return 60
  return 30
}

export async function fetchClassroomTasks(token) {
  const courses = await all('courses?studentId=me&courseStates=ACTIVE&pageSize=100', 'courses', token)
  const perCourse = await Promise.all(courses.map(async c => {
    const [work, subs] = await Promise.all([
      all(`courses/${c.id}/courseWork?courseWorkStates=PUBLISHED&pageSize=100`, 'courseWork', token).catch(() => []),
      all(`courses/${c.id}/courseWork/-/studentSubmissions?userId=me&pageSize=100`, 'studentSubmissions', token).catch(() => []),
    ])
    const subByWork = new Map(subs.map(s => [s.courseWorkId, s]))
    return work.map(cw => {
      const sub = subByWork.get(cw.id)
      const done = sub?.state === 'TURNED_IN' || sub?.state === 'RETURNED'
      return {
        id: `gc_${cw.id}`,
        source: 'classroom',
        title: cw.title || 'Untitled assignment',
        course: c.name,
        courseId: c.id,
        link: sub?.alternateLink || cw.alternateLink || c.alternateLink,
        due: dueOf(cw),
        done,
        late: !!sub?.late,
        points: cw.maxPoints || null,
        estMin: estimate(cw),
        workType: cw.workType,
        grade: sub?.assignedGrade ?? null,
        updated: Date.parse(cw.updateTime || cw.creationTime || '') || Date.now(),
      }
    })
  }))
  const now = Date.now()
  // Keep open work, plus anything finished in the last two weeks for stats.
  return perCourse.flat().filter(t => !t.done || (t.due && now - t.due < 14 * DAY) || now - t.updated < 14 * DAY)
}

export function mergeTasks(existing, incoming) {
  const prev = new Map(existing.map(t => [t.id, t]))
  const merged = existing.filter(t => t.source !== 'classroom')
  for (const t of incoming) {
    const old = prev.get(t.id)
    merged.push({
      ...t,
      // Respect what you changed locally: your own estimate and "mark done".
      estMin: old?.estEdited ? old.estMin : t.estMin,
      estEdited: old?.estEdited || false,
      done: t.done || old?.localDone || false,
      localDone: old?.localDone || false,
      doneAt: old?.doneAt || (t.done ? t.updated : undefined),
    })
  }
  return merged
}
