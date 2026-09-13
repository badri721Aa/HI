const SITE_URL = 'https://alhekma-cheating.vercel.app'
const OWNER_EMAILS = ['abdulla.mjasim@alhekma.com', 'abdullahmasoud063@gmail.com']

let currentTab = 'online'
let cache = null
let auth = null
let unread = 0
let userRole = 'user'
let broadcastStatus = ''
let statusMode = 'online'

function relTime(iso) {
  const d = Date.now() - new Date(iso).getTime()
  if (d < 60000) return 'just now'
  if (d < 3600000) return `${Math.floor(d / 60000)}m ago`
  if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`
  return `${Math.floor(d / 86400000)}d ago`
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function isOwner(email) {
  return OWNER_EMAILS.includes((email ?? '').toLowerCase())
}

function canAdmin(role) {
  return role === 'admin' || role === 'owner'
}

function renderOnline() {
  const list = cache?.online ?? []
  if (!list.length) return '<div class="empty">No users currently online.<br/>Check back later.</div>'
  return `
    <div class="section-label">${list.length} online now</div>
    ${list.map(u => `
      <div class="user-row">
        <span class="dot green"></span>
        <span class="user-name">${esc(u.display_name || 'Unnamed')}</span>
      </div>
    `).join('')}
  `
}

function renderMessages() {
  const list = cache?.messages ?? []
  if (!list.length) return '<div class="empty">No recent messages.</div>'
  return list.map(m => `
    <div class="msg-card">
      <div class="msg-meta">
        <span class="msg-author">${esc(m.user_name || 'Anonymous')}</span>
        <span class="msg-time">${relTime(m.created_at)}</span>
      </div>
      <div class="msg-body">${esc(m.content)}</div>
    </div>
  `).join('')
}

function renderNews() {
  const list = cache?.news ?? []
  if (!list.length) return '<div class="empty">No announcements yet.</div>'
  return list.map(n => `
    <div class="news-card ${n.pinned ? 'pinned' : ''}">
      <div class="news-meta">
        ${n.pinned ? '<span class="pin-badge">pinned</span>' : ''}
        <span class="news-time">${relTime(n.created_at)}</span>
      </div>
      <div class="news-body">${esc(n.message)}</div>
    </div>
  `).join('')
}

function renderAdmin() {
  if (!canAdmin(userRole) && !isOwner(auth?.user?.email)) {
    return '<div class="empty">Admin access required.</div>'
  }
  return `
    <div class="admin-panel">
      <div class="admin-section">
        <div class="section-label">Status</div>
        <div class="status-toggle">
          <button class="status-opt ${statusMode === 'online' ? 'active-green' : ''}" data-status="online">🟢 Online</button>
          <button class="status-opt ${statusMode === 'away' ? 'active-amber' : ''}" data-status="away">🟡 Away</button>
        </div>
      </div>

      <div class="admin-section">
        <div class="section-label">Quick Broadcast</div>
        <textarea class="broadcast-input" id="broadcast-input" placeholder="Post a pinned announcement to everyone…" maxlength="500"></textarea>
        <button class="btn-primary" id="broadcast-btn">Post Announcement</button>
        ${broadcastStatus ? `<div class="feedback ${broadcastStatus.startsWith('Error') ? 'error' : ''}">${esc(broadcastStatus)}</div>` : ''}
      </div>

      <div class="admin-section">
        <div class="section-label">Platform</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn-sm" onclick="openTab('/admin')">Admin Panel</button>
          <button class="btn-sm" onclick="openTab('/admin/troll-panel')">Troll Engine</button>
          <button class="btn-sm" onclick="openTab('/admin/devtools')">Dev Tools</button>
          <button class="btn-sm" onclick="openTab('/admin/roles')">Role Manager</button>
        </div>
      </div>
    </div>
  `
}

function render() {
  const content = document.getElementById('content')
  const statusText = document.getElementById('status-text')
  const unreadDot = document.getElementById('unread-dot')
  const liveDot = document.getElementById('live-dot')
  const adminTab = document.getElementById('admin-tab')

  // Show/hide admin tab
  if (adminTab) {
    adminTab.style.display = (canAdmin(userRole) || isOwner(auth?.user?.email)) ? '' : 'none'
  }

  // Unread badge on messages tab
  if (unreadDot) unreadDot.style.display = unread > 0 ? '' : 'none'

  // Live dot
  if (liveDot) liveDot.style.display = cache ? '' : 'none'

  if (cache?.updatedAt) {
    statusText.textContent = `Updated ${relTime(new Date(cache.updatedAt).toISOString())}`
  }

  if (!cache) { content.innerHTML = '<div class="loading">Connecting…</div>'; return }

  switch (currentTab) {
    case 'online': content.innerHTML = renderOnline(); break
    case 'messages': content.innerHTML = renderMessages(); break
    case 'news': content.innerHTML = renderNews(); break
    case 'admin': content.innerHTML = renderAdmin(); wireAdmin(); break
  }
}

function wireAdmin() {
  document.getElementById('broadcast-btn')?.addEventListener('click', async () => {
    const input = document.getElementById('broadcast-input')
    const msg = input?.value?.trim()
    if (!msg) return
    const btn = document.getElementById('broadcast-btn')
    btn.disabled = true
    btn.textContent = 'Posting…'
    const result = await chrome.runtime.sendMessage({ type: 'BROADCAST', payload: { message: msg }, auth })
    broadcastStatus = result.ok ? '✓ Posted to news feed' : `Error: ${result.status ?? 'failed'}`
    if (result.ok && input) input.value = ''
    btn.disabled = false
    btn.textContent = 'Post Announcement'
    render()
  })

  document.querySelectorAll('.status-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      statusMode = btn.dataset.status
      document.querySelectorAll('.status-opt').forEach(b => {
        b.className = `status-opt${b.dataset.status === statusMode ? (statusMode === 'online' ? ' active-green' : ' active-amber') : ''}`
      })
    })
  })
}

function switchTab(tab) {
  currentTab = tab
  document.querySelectorAll('.tab').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === tab)
  })
  if (tab === 'messages') {
    unread = 0
    chrome.runtime.sendMessage({ type: 'MARK_READ' })
  }
  render()
}

function openTab(path) {
  chrome.tabs.create({ url: SITE_URL + path })
}

async function init() {
  const result = await chrome.runtime.sendMessage({ type: 'GET_CACHE' })
  cache = result.cache
  auth = result.auth
  unread = result.unread ?? 0

  // Determine role from auth user metadata or email
  if (auth?.user?.email) {
    if (isOwner(auth.user.email)) userRole = 'owner'
    else if (auth?.user?.user_metadata?.role) userRole = auth.user.user_metadata.role
  }

  render()
}

// Tab clicks
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab))
})

document.getElementById('open-site').addEventListener('click', () => {
  chrome.tabs.create({ url: SITE_URL })
})

document.getElementById('refresh-btn').addEventListener('click', async () => {
  document.getElementById('status-text').textContent = 'Refreshing…'
  await chrome.runtime.sendMessage({ type: 'POLL_NOW' })
  const result = await chrome.runtime.sendMessage({ type: 'GET_CACHE' })
  cache = result.cache
  unread = result.unread ?? 0
  render()
})

init()
