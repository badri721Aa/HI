// Content script — runs on the platform site
// Syncs Supabase session tokens to the extension background worker

(function () {
  'use strict'

  function extractSession() {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (!key || !key.startsWith('sb-') || !key.endsWith('-auth-token')) continue
        const raw = localStorage.getItem(key)
        if (!raw) continue
        const parsed = JSON.parse(raw)
        const session = parsed?.session ?? parsed
        if (session?.access_token && session?.user) return session
      }
    } catch { /* storage not accessible */ }
    return null
  }

  function sync() {
    const session = extractSession()
    if (session) {
      chrome.runtime.sendMessage({ type: 'SET_AUTH', payload: session }).catch(() => {})
    } else {
      chrome.runtime.sendMessage({ type: 'CLEAR_AUTH' }).catch(() => {})
    }
  }

  // Sync on load and on any storage change (login/logout)
  sync()
  window.addEventListener('storage', (e) => {
    if (e.key?.startsWith('sb-')) sync()
  })
})()
