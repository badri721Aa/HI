const SITE_URL = 'https://alhekma-cheating.vercel.app'

let currentTab = 'online'
let cache = null
let auth = null

function relTime(iso) {
  const d = Date.now() - new Date(iso).getTime()
  if (d < 60000) return 'just now'
  if (d < 3600000) return `${Math.floor(d / 60000)}m ago`
  if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`
  return `${Math.floor(d / 86400000)}d ago`
}

function escape(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function renderOnline() {
  const list = cache?.online ?? []
  if (list.length === 0) {
    return '<div class="empty">No users online right now</div>'
  }
  return `
    <div class="section-label">${list.length} online now</div>
    ${list.map(u => `
      <div class="user-row">
        <span class="dot online"></span>
        <span class="user-name">${escape(u.display_name || 'Unnamed')}</span>
      </div>
    `).join('')}
  `
}

function renderMessages() {
  const list = cache?.messages ?? []
  if (list.length === 0) {
    return '<div class="empty">No recent messages</div>'
  }
  return list.map(m => `
    <div class="msg-row">
      <div class="msg-meta">
        <span class="msg-author">${escape(m.user_name || 'Anonymous')}</span>
        <span class="msg-time">${relTime(m.created_at)}</span>
      </div>
      <div class="msg-body">${escape(m.content)}</div>
    </div>
  `).join('')
}

function renderNews() {
  const list = cache?.news ?? []
  if (list.length === 0) {
    return '<div class="empty">No announcements</div>'
  }
  return list.map(n => `
    <div class="news-row ${n.pinned ? 'pinned' : ''}">
      <div class="news-meta">
        ${n.pinned ? '<span class="pin-badge">pinned</span>' : ''}
        <span class="news-time">${relTime(n.created_at)}</span>
      </div>
      <div class="news-body">${escape(n.message)}</div>
    </div>
  `).join('')
}

function render() {
  const content = document.getElementById('content')
  const statusText = document.getElementById('status-text')

  if (!cache) {
    content.innerHTML = '<div class="loading">Loading...</div>'
    return
  }

  statusText.textContent = cache.updatedAt
    ? `Updated ${relTime(new Date(cache.updatedAt).toISOString())}`
    : '—'

  switch (currentTab) {
    case 'online': content.innerHTML = renderOnline(); break
    case 'messages': content.innerHTML = renderMessages(); break
    case 'news': content.innerHTML = renderNews(); break
  }
}

function switchTab(tab) {
  currentTab = tab
  document.querySelectorAll('.tab').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === tab)
  })
  render()
}

async function init() {
  const result = await chrome.runtime.sendMessage({ type: 'GET_CACHE' })
  cache = result.cache
  auth = result.auth
  render()
}

document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab))
})

document.getElementById('open-site').addEventListener('click', () => {
  chrome.tabs.create({ url: SITE_URL })
})

document.getElementById('refresh-btn').addEventListener('click', async () => {
  document.getElementById('status-text').textContent = 'Refreshing...'
  await chrome.runtime.sendMessage({ type: 'POLL_NOW' })
  const result = await chrome.runtime.sendMessage({ type: 'GET_CACHE' })
  cache = result.cache
  render()
})

init()
