import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

/* ──────────────────────────────────────────────────────────────────────────
   Google Classroom proxy.

   The browser obtains a short-lived OAuth access token via Google Identity
   Services (classroom.*.readonly scopes) and posts it here; this route calls
   the Classroom REST API and returns JSON. Nothing is stored server-side.

   POST body: { accessToken, action, courseId?, courseWorkId? }
   actions:
     'courses'      → active courses
     'coursework'   → assignments for a course
     'submissions'  → this student's submissions for an assignment
   ──────────────────────────────────────────────────────────────────────── */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const API = 'https://classroom.googleapis.com/v1'

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function POST(req: NextRequest) {
  const { accessToken, action, courseId, courseWorkId, pageToken } = await req.json().catch(() => ({}))

  if (!accessToken || typeof accessToken !== 'string') {
    return NextResponse.json({ error: 'Missing accessToken' }, { status: 400, headers: CORS })
  }

  const auth = { Authorization: `Bearer ${accessToken}` }
  let url: string

  switch (action) {
    case 'courses':
      url = `${API}/courses?courseStates=ACTIVE&pageSize=100`
      break
    case 'coursework':
      if (!courseId) return bad('Missing courseId')
      url = `${API}/courses/${encodeURIComponent(courseId)}/courseWork?pageSize=100&orderBy=${encodeURIComponent('dueDate desc')}`
      break
    case 'coursework_materials':
      if (!courseId) return bad('Missing courseId')
      url = `${API}/courses/${encodeURIComponent(courseId)}/courseWorkMaterials?pageSize=100`
      break
    case 'submissions':
      if (!courseId || !courseWorkId) return bad('Missing courseId/courseWorkId')
      url = `${API}/courses/${encodeURIComponent(courseId)}/courseWork/${encodeURIComponent(courseWorkId)}/studentSubmissions?userId=me`
      break
    case 'announcements':
      if (!courseId) return bad('Missing courseId')
      url = `${API}/courses/${encodeURIComponent(courseId)}/announcements?pageSize=50`
      break
    default:
      return bad('Unknown action')
  }

  // Forward the client's page cursor so large course/assignment lists aren't
  // silently capped at one page. The upstream nextPageToken is passed through
  // in the returned JSON for the client to continue.
  if (pageToken && typeof pageToken === 'string') {
    url += (url.includes('?') ? '&' : '?') + 'pageToken=' + encodeURIComponent(pageToken)
  }

  try {
    const res = await fetch(url, { headers: auth })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const message = data?.error?.message ?? `Classroom API error ${res.status}`
      return NextResponse.json({ error: message, status: res.status }, { status: res.status, headers: CORS })
    }
    return NextResponse.json(data, { headers: CORS })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502, headers: CORS })
  }
}

function bad(message: string) {
  return NextResponse.json({ error: message }, { status: 400, headers: CORS })
}
