// Service worker — polls Supabase REST for live data, manages badge + notifications

const SUPABASE_URL = 'https://gvxnzgogfaifmsdkingq.supabase.co'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2eG56Z29nZmFpZm1zZGtpbmdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkwNDkwODAsImV4cCI6MjA2NDYyNTA4MH0.M5YDcMHXOsxvuBFaKRAfkJ1sV_MmKubCL7SZXwZIdJA'

// Poll every 60 seconds
chrome.alarms.create('poll', { periodInMinutes: 1 })
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'poll') poll() })
chrome.runtime.onInstalled.addListener(() => poll())

// Message bus — popup ↔ background ↔ content
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'GET_CACHE') {
    chrome.storage.local.get(['cache', 'auth', 'unread'], r =>
      sendResponse({ cache: r.cache ?? null, auth: r.auth ?? null, unread: r.unread ?? 0 })
    )
    return true
  }
  if (msg.type === 'SET_AUTH') {
    chrome.storage.local.set({ auth: msg.payload }, () => {
      poll()
      sendResponse({ ok: true })
    })
    return true
  }
  if (msg.type === 'CLEAR_AUTH') {
    chrome.storage.local.remove(['auth'], () => sendResponse({ ok: true }))
    return true
  }
  if (msg.type === 'POLL_NOW') {
    poll().then(() => sendResponse({ ok: true }))
    return true
  }
  if (msg.type === 'MARK_READ') {
    chrome.storage.local.set({ unread: 0, lastSeen: Date.now() })
    chrome.action.setBadgeText({ text: '' })
    sendResponse({ ok: true })
    return true
  }
  if (msg.type === 'BROADCAST') {
    // Admin broadcast via REST insert into news
    broadcastNews(msg.payload?.message ?? '', msg.auth).then(r => sendResponse(r))
    return true
  }
})

async function getHeaders(auth) {
  return {
    'apikey': ANON_KEY,
    'Content-Type': 'application/json',
    ...(auth?.access_token ? { 'Authorization': `Bearer ${auth.access_token}` } : {}),
  }
}

async function poll() {
  const { auth, lastSeen } = await chrome.storage.local.get(['auth', 'lastSeen'])
  const headers = await getHeaders(auth)
  const since = new Date(lastSeen ?? Date.now() - 5 * 60 * 1000).toISOString()

  try {
    const [messagesRes, newsRes, onlineRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/chat_messages?deleted=eq.false&order=created_at.desc&limit=10`, { headers }),
      fetch(`${SUPABASE_URL}/rest/v1/news?deleted=eq.false&order=pinned.desc&order=created_at.desc&limit=8`, { headers }),
      fetch(`${SUPABASE_URL}/rest/v1/profiles?select=id,display_name,online_at&online_at=gt.${new Date(Date.now() - 5 * 60 * 1000).toISOString()}&limit=50`, { headers }),
    ])

    const [messages, news, online] = await Promise.all([
      messagesRes.ok ? messagesRes.json() : [],
      newsRes.ok ? newsRes.json() : [],
      onlineRes.ok ? onlineRes.json() : [],
    ])

    // Count new messages since last seen
    const newCount = messages.filter(m => new Date(m.created_at).getTime() > (lastSeen ?? 0)).length
    const prev = await chrome.storage.local.get('unread')
    const unread = (prev.unread ?? 0) + newCount

    await chrome.storage.local.set({ cache: { messages, news, online, updatedAt: Date.now() }, unread })

    // Badge — show online count or unread messages
    const badgeCount = unread > 0 ? unread : online.length
    const badgeColor = unread > 0 ? '#f43f5e' : '#22c55e'

    if (badgeCount > 0) {
      chrome.action.setBadgeText({ text: String(badgeCount > 99 ? '99+' : badgeCount) })
      chrome.action.setBadgeBackgroundColor({ color: badgeColor })
    } else {
      chrome.action.setBadgeText({ text: '' })
    }
  } catch (err) {
    console.error('[Alhekma bg] poll error:', err)
  }
}

async function broadcastNews(message, auth) {
  const headers = await getHeaders(auth)
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/news`, {
      method: 'POST',
      headers: { ...headers, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ message, pinned: true }),
    })
    return { ok: res.ok, status: res.status }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}
