// Content script — runs on the platform site
// Reads the Supabase session from localStorage and syncs it to the extension

(function () {
  function extractSession() {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (!key || !key.startsWith('sb-')) continue
        if (!key.endsWith('-auth-token')) continue
        const raw = localStorage.getItem(key)
        if (!raw) continue
        const parsed = JSON.parse(raw)
        const session = parsed?.session ?? parsed
        if (session?.access_token) return session
      }
    } catch { /* ignore */ }
    return null
  }

  function sync() {
    const session = extractSession()
    if (session) {
      chrome.runtime.sendMessage({ type: 'SET_AUTH', payload: session })
    } else {
      chrome.runtime.sendMessage({ type: 'CLEAR_AUTH' })
    }
  }

  // Sync immediately and on storage changes
  sync()
  window.addEventListener('storage', sync)
})()
