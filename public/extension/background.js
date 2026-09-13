// Service worker — polls Supabase REST API for unread counts and news

const SUPABASE_URL = 'https://gvxnzgogfaifmsdkingq.supabase.co'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2eG56Z29nZmFpZm1zZGtpbmdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDgzNTE1NDEsImV4cCI6MjA2MzkyNzU0MX0.5i_FXcm4kRU8LHplY3DqHjGijmqVS1BPNdJiEq0B2N0'

const POLL_INTERVAL_SECONDS = 60

chrome.alarms.create('poll', { periodInMinutes: POLL_INTERVAL_SECONDS / 60 })

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'poll') return
  await poll()
})

chrome.runtime.onInstalled.addListener(async () => {
  await poll()
})

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'GET_CACHE') {
    chrome.storage.local.get(['cache', 'auth'], (result) => {
      sendResponse({ cache: result.cache ?? null, auth: result.auth ?? null })
    })
    return true
  }
  if (msg.type === 'SET_AUTH') {
    chrome.storage.local.set({ auth: msg.payload }, () => sendResponse({ ok: true }))
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
})

async function poll() {
  const { auth } = await chrome.storage.local.get('auth')
  const headers = {
    'apikey': ANON_KEY,
    'Content-Type': 'application/json',
  }
  if (auth?.access_token) {
    headers['Authorization'] = `Bearer ${auth.access_token}`
  }

  try {
    const [messagesRes, newsRes, profilesRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/chat_messages?deleted=eq.false&order=created_at.desc&limit=5`, { headers }),
      fetch(`${SUPABASE_URL}/rest/v1/news?deleted=eq.false&order=pinned.desc&order=created_at.desc&limit=5`, { headers }),
      fetch(`${SUPABASE_URL}/rest/v1/profiles?select=id,display_name,online_at&online_at=gt.${new Date(Date.now() - 5 * 60 * 1000).toISOString()}`, { headers }),
    ])

    const [messages, news, online] = await Promise.all([
      messagesRes.ok ? messagesRes.json() : [],
      newsRes.ok ? newsRes.json() : [],
      profilesRes.ok ? profilesRes.json() : [],
    ])

    const cache = { messages, news, online, updatedAt: Date.now() }
    await chrome.storage.local.set({ cache })

    // Badge with online count
    const count = online.length
    chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' })
    chrome.action.setBadgeBackgroundColor({ color: '#22c55e' })
  } catch (err) {
    console.error('[Alhekma bg] poll error:', err)
  }
}
