// Master Mind Markdown Workspace: notes list, split Markdown editor with live preview, highlights
// drawer, [[wiki links]] + backlinks, Related Context (keyword linking engine), exports and AI assist.
// Used by the side panel Notes tab (compact) and the Knowledge Hub Notes view (full).
// Extension pages only: reads IndexedDB through lib/db.js and renders with vendor/markdown.js.
//
//   const ws = createWorkspace(container, { db, uid, renderMarkdown, runTask, settings, compact, initialId, onOpenNote })
//   ws.open(id) · ws.insert(markdown, source?, {title?}) · ws.current() · ws.refresh() · ws.destroy()
//
// Optional extras: pageKey() → key of the page being read (highlights drawer), pageSource() → {url,title}
// for text dropped from that page, openUrl(url), openSettings(), toast(msg), onDbChange(cb).
import { keywords, overlap, wordCount, timeAgo, download, slug, siteOf } from './text.js'
import { getSettings as readSettings } from './store.js'
import { onChange as dbOnChange } from './db.js'

const SAVE_DELAY = 600
const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024
const HL_MIME = 'application/x-mm-highlight'
const LIST_CAP = 400
const RECENT_HL = 60
const MENU_GAP = 8 // min distance between a dropdown menu and the viewport edge
const NARROW = 820 // full-mode width below which the notes list stacks above the editor
const SPLIT_MIN = 520 // narrowest editor area that still fits Split (two panes of ~250px)
const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'

/** [[Note Title]] or [[Note Title|label]] */
export const WIKI_RE = /\[\[([^[\]|\n]{1,120}?)(?:\|([^[\]\n]{1,120}?))?\]\]/g

const AI_ACTIONS = [
  { id: 'summarize', label: 'Summarize', icon: 'summarize', hint: 'Short summary + key points',
    instruction: 'Summarize this note as concise Markdown: one short paragraph, then the key points as bullets. Keep facts, numbers, links, math and citations exactly as written. Do not add information that is not in the note.' },
  { id: 'outline', label: 'Turn into outline', icon: 'outline', hint: 'Headings and nested bullets',
    instruction: 'Restructure this note into a clear hierarchical Markdown outline with short headings and nested bullet points. Keep every fact, link, image, math expression and code block. Do not add new facts.' },
  { id: 'grammar', label: 'Fix grammar & clarity', icon: 'wand', hint: 'Same content, cleaner writing',
    instruction: 'Fix grammar, spelling, punctuation and clarity. Keep the structure, Markdown formatting, links, images, math, code and the author\'s voice exactly. Do not add or remove information.' },
  { id: 'expand', label: 'Expand into prose', icon: 'expand', hint: 'Flowing paragraphs from fragments',
    instruction: 'Rewrite this note as well-structured prose paragraphs with smooth transitions (keep useful headings). Keep every fact, link, image, math expression and code block. Do not invent facts or sources.' },
]

const ICONS = {
  bold: '<path d="M7 5h6.5a3.5 3.5 0 0 1 0 7H7zM7 12h7.5a3.5 3.5 0 0 1 0 7H7z"/>',
  italic: '<path d="M19 4h-9M14 20H5M15 4 9 20"/>',
  heading: '<path d="M6 4v16M18 4v16M6 12h12"/>',
  bullet: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r=".6"/><circle cx="4.5" cy="12" r=".6"/><circle cx="4.5" cy="18" r=".6"/>',
  check: '<rect x="3" y="4" width="7" height="7" rx="1.5"/><path d="m4.8 7.6 1.4 1.4 2.3-2.6M14 7.5h7M3 15h7v6H3zM14 18h7"/>',
  quote: '<path d="M10 7H6a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h2v1a3 3 0 0 1-3 3M20 7h-4a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h2v1a3 3 0 0 1-3 3"/>',
  code: '<path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  math: '<path d="M18 7V4H6l6 8-6 8h12v-3"/>',
  mathBlock: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M15.5 8h-7l3.5 4-3.5 4h7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  pin: '<path d="M12 17v5M9 3h6l-1 6 4 4v2H6v-2l4-4z"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>',
  sparkles: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  share: '<path d="M12 15V3M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/>',
  highlighter: '<path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>',
  chev: '<path d="m6 9 6 6 6-6"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  grip: '<circle cx="9" cy="6" r=".8"/><circle cx="15" cy="6" r=".8"/><circle cx="9" cy="12" r=".8"/><circle cx="15" cy="12" r=".8"/><circle cx="9" cy="18" r=".8"/><circle cx="15" cy="18" r=".8"/>',
  note: '<path d="M4 4h12l4 4v12H4zM8 10h8M8 14h8M8 18h5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  back: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  md: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 15V9l3 3 3-3v6M17 9v6M14.5 12.5 17 15l2.5-2.5"/>',
  json: '<path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1M16 21h1a2 2 0 0 0 2-2v-5a2 2 0 0 1 2-2 2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"/>',
  printer: '<path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6z"/>',
  send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  summarize: '<path d="M4 6h16M4 12h10M4 18h6"/>',
  outline: '<path d="M4 5h3M10 5h10M7 12h3M13 12h7M10 19h3M16 19h4"/>',
  wand: '<path d="m15 4 5 5L8 21l-5-5zM12 7l5 5M5 3v3M3.5 4.5h3M19 15v3M17.5 16.5h3"/>',
  expand: '<path d="M4 6h16M4 10h16M4 14h16M4 18h11"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  retry: '<path d="M20 11a8 8 0 0 0-14.9-3.9M4 4v4h4M4 13a8 8 0 0 0 14.9 3.9M20 20v-4h-4"/>',
}

// ───────── tiny DOM helpers ─────────
function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false && k !== 'hidden' && k !== 'disabled') continue
    if (k === 'class') el.className = v
    else if (k === 'text') el.textContent = v
    else if (k === 'dataset') Object.assign(el.dataset, v)
    else if (k === 'vars') for (const [p, val] of Object.entries(v)) el.style.setProperty(p, val)
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v)
    else if (typeof v === 'boolean' || k === 'value') el[k] = v
    else el.setAttribute(k, v)
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c)
  return el
}
function icon(name, cls = '') {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  s.setAttribute('viewBox', '0 0 24 24')
  s.setAttribute('aria-hidden', 'true')
  s.setAttribute('class', `mm-icon ${cls}`.trim())
  s.innerHTML = ICONS[name] || '' // static, trusted constants
  return s
}
const iconBtn = (name, label, onclick, cls = 'mm-btn ghost icon sm') => h('button', { type: 'button', class: cls, 'aria-label': label, title: label, onclick }, icon(name))

// ───────── Markdown helpers (pure, exported for the print page) ─────────
const mdText = s => String(s ?? '').replace(/\s+/g, ' ').trim().replace(/([\\[\]*_`<>])/g, '\\$1')
const mdUrl = u => String(u ?? '').trim().replace(/[\s()<>]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`)
export const mdLink = (title, url) => `[${mdText(title || prettyUrl(url))}](${mdUrl(url)})`
export const prettyUrl = u => { try { const x = new URL(u); return (x.hostname.replace(/^www\./, '') + x.pathname.replace(/\/$/, '')).slice(0, 80) } catch { return String(u || '') } }
const quoteMd = text => String(text).replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim().split('\n').map(l => (l.trim() ? `> ${l.trimEnd()}` : '>')).join('\n')
const sourceLine = src => (src?.url ? `\n>\n> — ${mdLink(src.title || src.url, src.url)}` : '')

export function highlightMarkdown(hl) {
  const note = String(hl.note || '').trim()
  return quoteMd(hl.text) + sourceLine({ url: hl.url, title: hl.title || hl.site }) + (note ? `\n\n${note}` : '')
}

/** Markdown → plain text for snippets, search and keywords (drops images, data URLs, code fences, syntax). */
export function plainText(md) {
  return String(md || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)|!\[[^\]]*\]\[[^\]]*\]/g, ' ')
    .replace(/^\s{0,3}\[[^\]\n]+\]:\s*\S+.*$/gm, ' ')
    .replace(/data:[^\s)]+/g, ' ')
    .replace(/\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]/g, (m, a, b) => b || a)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(^|\n)\s{0,3}(?:#{1,6}|>|[-*+](?: \[[ xX]\])?|\d+[.)])\s+/g, '$1')
    .replace(/\$\$?|[*_`~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const HEADING_RE = /^\s{0,3}#{1,6}\s/
const BLOCK_START_RE = /^\s{0,3}(?:#{1,6}\s|>|[-*+]\s|\d+[.)]\s|\|)/
const TABLE_RULE_RE = /^\s{0,3}\|?(?:\s*:?-{2,}:?\s*\|)+\s*(?::?-{2,}:?\s*)?$/
/**
 * Markdown → one-line preview for note lists. Blocks (headings, paragraphs, list items, quotes) stay
 * apart: "SEI · The SEI forms on first charge." rather than "SEI The SEI forms…". A leading heading that
 * just repeats the note title is dropped.
 */
export function snippetText(md, title = '', max = 160) {
  const blocks = []
  let cur = null
  let afterHeading = false
  for (let line of String(md || '').replace(/\r/g, '').replace(/```[\s\S]*?```/g, '\n\n').split('\n')) {
    if (TABLE_RULE_RE.test(line)) continue
    if (!line.trim()) { cur = null; continue }
    const heading = HEADING_RE.test(line)
    if (!cur || heading || afterHeading || BLOCK_START_RE.test(line)) { cur = { lines: [], heading }; blocks.push(cur) }
    if (/^\s{0,3}\|/.test(line)) line = line.split('|').map(c => c.trim()).filter(Boolean).join(' · ') // table row → its cells
    cur.lines.push(line) // soft-wrapped lines of one paragraph stay together
    afterHeading = heading
  }
  const same = (a, b) => a.toLowerCase() === b.toLowerCase()
  let out = ''
  let first = true
  for (const b of blocks) {
    const text = plainText(b.lines.join('\n'))
    if (!text) continue
    if (first && b.heading && title && same(text, plainText(title))) { first = false; continue }
    first = false
    out = !out ? text : /[.!?:;…,]$/.test(out) ? `${out} ${text}` : `${out} · ${text}`
    if (out.length >= max) break
  }
  return out.slice(0, max)
}

/** Replace [[wiki links]] in text nodes under root (skipping code, links, math) with make(title, label) nodes. */
export function replaceWikiLinks(root, make) {
  const doc = root.ownerDocument || document
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: n => (n.nodeValue.includes('[[') && !n.parentElement?.closest('code, pre, a, .katex, .math-block') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  })
  const nodes = []
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n)
  for (const node of nodes) {
    const text = node.nodeValue
    const frag = doc.createDocumentFragment()
    let last = 0
    for (const m of text.matchAll(WIKI_RE)) {
      if (m.index > last) frag.append(text.slice(last, m.index))
      frag.append(make(m[1].trim(), (m[2] || m[1]).trim()))
      last = m.index + m[0].length
    }
    if (!last) continue
    if (last < text.length) frag.append(text.slice(last))
    node.replaceWith(frag)
  }
}

/** Offsets of the char inside "[ ]" for every GFM task item, in document order (outside code fences). */
function taskOffsets(v) {
  const out = []
  let fence = null
  let pos = 0
  for (const line of v.split('\n')) {
    const f = /^\s{0,3}(`{3,}|~{3,})/.exec(line)
    if (f) { if (!fence) fence = f[1][0]; else if (f[1][0] === fence) fence = null }
    else if (!fence) {
      const m = /^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+)\[[ xX]\](?=\s+\S)/.exec(line)
      if (m) out.push(pos + m[1].length + 1)
    }
    pos += line.length + 1
  }
  return out
}

/** Start of the trailing block of reference definitions ([img-x]: data:…), so appended text stays above it. */
function trailingDefsStart(v) {
  let end = v.length
  let start = v.length
  while (end > 0) {
    const ls = v.lastIndexOf('\n', end - 1) + 1
    const line = v.slice(ls, end)
    if (line.trim() && !/^\s{0,3}\[[^\]\n]+\]:\s*\S/.test(line.slice(0, 200))) break
    if (line.trim()) start = ls
    if (ls === 0) break
    end = ls - 1
  }
  return start
}

function noteToMarkdown(n) {
  const y = s => JSON.stringify(String(s ?? '')) // JSON strings are valid YAML double-quoted scalars
  const iso = t => new Date(t || Date.now()).toISOString()
  const fm = ['---', `title: ${y(n.title || 'Untitled')}`, `tags: [${(n.tags || []).map(y).join(', ')}]`, `created: ${iso(n.created)}`, `updated: ${iso(n.updated)}`]
  if (n.sources?.length) {
    fm.push('sources:')
    for (const s of n.sources) fm.push(`  - url: ${y(s.url)}`, `    title: ${y(s.title || s.url)}`)
  }
  fm.push('---', '')
  return `${fm.join('\n')}# ${n.title || 'Untitled'}\n\n${String(n.body || '').trim()}\n`
}

const fmtBytes = b => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)
const readDataUrl = file => new Promise((resolve, reject) => {
  const r = new FileReader()
  r.onload = () => resolve(String(r.result))
  r.onerror = () => reject(r.error || new Error('Could not read the file'))
  r.readAsDataURL(file)
})
const readText = file => new Promise((resolve, reject) => {
  const r = new FileReader()
  r.onload = () => resolve(String(r.result))
  r.onerror = () => reject(r.error || new Error('Could not read the file'))
  r.readAsText(file)
})
const cleanSource = s => ({ url: String(s.url), title: String(s.title || prettyUrl(s.url)).slice(0, 300) })
const byPinnedUpdated = (a, b) => (!!b.pinned - !!a.pinned) || (b.updated || 0) - (a.updated || 0)
const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d } catch { return d } },
  set(k, v) { try { localStorage.setItem(k, v) } catch { /* storage blocked */ } },
}

// ───────── styles (adopted once per document) ─────────
const STYLES = `
.ws { container: ws / inline-size; position: relative; min-width: 0; --ws-float: rgba(19, 22, 32, .97); }
.ws.full { height: 100%; min-height: 420px; }
.ws-shell { display: grid; grid-template-columns: 272px minmax(0, 1fr); gap: 16px; height: 100%; min-height: 0; }
.ws.compact .ws-shell { display: flex; flex-direction: column; gap: 10px; height: auto; }

/* notes list */
.ws-list { display: flex; flex-direction: column; gap: 10px; padding: 12px; min-height: 0; }
.ws.compact .ws-list { max-height: 380px; padding: 10px; animation: ws-drop .16s var(--mm-ease); }
.ws-list-head { display: flex; gap: 8px; align-items: center; }
.ws-search { position: relative; flex: 1; min-width: 0; }
.ws-search .mm-icon { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); width: 14px; height: 14px; color: var(--mm-muted); pointer-events: none; }
.ws-search .mm-input { padding: 7px 10px 7px 31px; height: 34px; }
.ws-items { list-style: none; margin: 0 -4px; padding: 0 4px; display: flex; flex-direction: column; gap: 3px; overflow-y: auto; flex: 1; min-height: 0; }
.ws-item { position: relative; }
.ws-item-open { display: flex; flex-direction: column; gap: 3px; width: 100%; text-align: left; font: inherit; color: inherit; background: transparent; border: 1px solid transparent; border-radius: 10px; padding: 9px 62px 9px 11px; cursor: pointer; transition: background .15s, border-color .15s; }
.ws-item-open:hover { background: rgba(255, 255, 255, .04); }
.ws-item-open[aria-current="true"] { background: rgba(255, 255, 255, .07); border-color: var(--mm-border-strong); box-shadow: inset 2px 0 0 var(--mm-accent), 0 0 18px color-mix(in srgb, var(--mm-accent) 8%, transparent); }
.ws-item-title { display: flex; align-items: center; gap: 6px; font-weight: 650; font-size: 13px; color: var(--mm-heading); min-width: 0; }
.ws-item-title > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ws-item-title .mm-icon { width: 12px; height: 12px; color: var(--mm-accent); }
.ws-item-title .untitled { color: var(--mm-muted); font-style: italic; font-weight: 600; }
.ws-item-snippet { font-size: 12px; color: var(--mm-muted); line-height: 1.45; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
.ws-item-meta { display: flex; flex-wrap: wrap; gap: 3px 8px; font-size: 11px; color: var(--mm-muted); }
.ws-item-meta .ws-tagref { color: color-mix(in srgb, var(--mm-accent-2) 80%, white); }
.ws-item-actions { position: absolute; top: 7px; right: 6px; display: flex; gap: 1px; opacity: 0; transition: opacity .15s; }
.ws-item:hover .ws-item-actions, .ws-item:focus-within .ws-item-actions { opacity: 1; }
.ws-item-actions .mm-btn[aria-pressed="true"] { color: var(--mm-accent); }
.ws-list-foot { font-size: 11.5px; color: var(--mm-muted); padding: 0 3px; }
.ws-list-empty { padding: 26px 10px; text-align: center; color: var(--mm-muted); font-size: 12.5px; }
.ws-list-empty b { display: block; color: var(--mm-fg-2); font-size: 13px; margin-bottom: 4px; }

/* compact switcher */
.ws-top { display: flex; gap: 8px; align-items: center; }
.ws-switcher { flex: 1; min-width: 0; display: flex; align-items: center; gap: 9px; padding: 8px 11px; border-radius: 11px; background: rgba(0, 0, 0, .28); border: 1px solid var(--mm-border-strong); color: var(--mm-fg); font: 600 13px/1.2 var(--mm-font); cursor: pointer; text-align: left; transition: border-color .15s; }
.ws-switcher:hover { border-color: color-mix(in srgb, var(--mm-accent) 50%, transparent); }
.ws-switcher > .mm-icon:first-child { color: var(--mm-accent); }
.ws-switcher-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ws-switcher .ws-chev { transition: transform .2s var(--mm-ease); color: var(--mm-muted); }
.ws-switcher[aria-expanded="true"] .ws-chev { transform: rotate(180deg); }
.ws-count { font: 700 10.5px/1 var(--mm-font); padding: 3px 7px; border-radius: 99px; background: rgba(255, 255, 255, .07); color: var(--mm-fg-2); }

/* editor */
.ws-main { position: relative; display: flex; flex-direction: column; gap: 10px; min-width: 0; min-height: 0; }
.ws-editor { display: flex; flex-direction: column; gap: 10px; flex: 1; min-height: 0; }
/* The title keeps a readable width: when it can't, the actions wrap below it (right-aligned). */
.ws-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; min-width: 0; }
.ws-title { flex: 1 1 240px; min-width: 0; text-overflow: ellipsis; font: 750 22px/1.25 var(--mm-font); letter-spacing: -.015em; color: var(--mm-heading); background: transparent; border: 0; border-radius: 9px; padding: 5px 8px; margin-left: -8px; outline: none; transition: background .15s, box-shadow .15s; }
.ws-title:hover { background: rgba(255, 255, 255, .03); }
.ws-title:focus { background: rgba(255, 255, 255, .04); box-shadow: 0 0 0 1px var(--mm-border-strong); }
.ws-title::placeholder { color: var(--mm-muted); }
.ws.compact .ws-title { font-size: 17px; flex-basis: 160px; }
.ws-actions { display: flex; align-items: center; gap: 6px; flex: none; margin-left: auto; }
.ws-actions .mm-btn[aria-pressed="true"] { color: var(--mm-accent); background: color-mix(in srgb, var(--mm-accent) 12%, transparent); }
.ws-tags { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-height: 28px; }
.ws-tag { display: inline-flex; align-items: center; gap: 3px; font: 600 12px/1 var(--mm-font); padding: 3px 3px 3px 9px; border-radius: 999px; color: var(--mm-fg); background: color-mix(in srgb, var(--mm-accent-2) 14%, transparent); border: 1px solid color-mix(in srgb, var(--mm-accent-2) 35%, transparent); }
.ws-tag button { display: grid; place-items: center; width: 18px; height: 18px; border-radius: 50%; border: 0; background: transparent; color: var(--mm-fg-2); cursor: pointer; padding: 0; }
.ws-tag button:hover { background: rgba(255, 255, 255, .12); color: #fff; }
.ws-tag button .mm-icon { width: 11px; height: 11px; }
.ws-tag-input { flex: 1; min-width: 120px; font: 12.5px/1 var(--mm-font); color: var(--mm-fg); background: transparent; border: 0; border-radius: 6px; outline: none; padding: 6px 4px; }
.ws-tag-input::placeholder { color: var(--mm-muted); }
.ws-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ws-spacer { flex: 1; }
/* Highlights, AI and Export wrap as one right-aligned group, so their menus always open leftwards in view. */
.ws-bar-end { display: flex; align-items: center; gap: 8px; margin-left: auto; }
.ws-toolbar { display: flex; align-items: center; gap: 1px; padding: 3px; border-radius: 11px; background: rgba(0, 0, 0, .28); border: 1px solid var(--mm-border); flex-wrap: wrap; }
.ws-tb { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 8px; border: 0; padding: 0; background: transparent; color: var(--mm-fg-2); cursor: pointer; transition: background .12s, color .12s, transform .1s; }
.ws-tb:hover { background: rgba(255, 255, 255, .08); color: var(--mm-heading); }
.ws-tb:active { transform: scale(.92); }
.ws-tb .mm-icon { width: 15px; height: 15px; }
.ws-tb-sep { width: 1px; height: 18px; margin: 0 3px; background: var(--mm-border-strong); }
.ws.compact .ws-toolbar { justify-content: space-between; }
.ws.compact .ws-tb { width: 28px; height: 28px; }
.ws.compact .ws-tb-sep { margin: 0 1px; }
.ws-seg { display: inline-flex; padding: 3px; gap: 2px; border-radius: 10px; background: rgba(0, 0, 0, .28); border: 1px solid var(--mm-border); }
.ws-seg button { font: 600 12px/1 var(--mm-font); padding: 7px 11px; border-radius: 7px; border: 0; background: transparent; color: var(--mm-muted); cursor: pointer; transition: color .15s, background .15s; }
.ws-seg button:hover { color: var(--mm-fg); }
.ws-seg button[aria-pressed="true"] { color: var(--mm-heading); background: rgba(255, 255, 255, .09); box-shadow: inset 0 0 0 1px var(--mm-border-strong), 0 0 12px color-mix(in srgb, var(--mm-accent) 14%, transparent); }
.ws.compact .ws-hl-btn { width: 32px; height: 32px; }
.ws-bar .mm-btn[aria-expanded="true"] { border-color: color-mix(in srgb, var(--mm-accent) 55%, transparent); color: var(--mm-heading); background: rgba(255, 255, 255, .08); }

.ws-body { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; flex: 1; min-height: 0; }
.ws-body[data-mode="edit"], .ws-body[data-mode="preview"] { grid-template-columns: minmax(0, 1fr); }
.ws-body[data-mode="edit"] .ws-pane-preview, .ws-body[data-mode="preview"] .ws-pane-edit { display: none; }
.ws-pane { position: relative; min-height: 0; border-radius: var(--mm-radius); border: 1px solid var(--mm-border); background: var(--mm-glass); backdrop-filter: var(--mm-blur); -webkit-backdrop-filter: var(--mm-blur); transition: border-color .15s, box-shadow .2s; }
.ws-pane-edit { display: flex; flex-direction: column; overflow: hidden; background: rgba(8, 9, 13, .55); }
.ws-pane-edit:focus-within { border-color: color-mix(in srgb, var(--mm-accent) 55%, transparent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--mm-accent) 13%, transparent); }
.ws-ta { flex: 1; width: 100%; min-height: 0; resize: none; border: 0; outline: none; background: transparent; color: var(--mm-fg); font: 13px/1.7 var(--mm-mono); padding: 16px 18px; tab-size: 2; caret-color: var(--mm-accent); }
.mm-root .ws-ta:focus-visible { outline: none; }
.ws-ta::placeholder { color: var(--mm-muted); }
.ws.compact .ws-ta { height: max(260px, 50vh); flex: none; resize: vertical; padding: 13px 14px; font-size: 12.5px; }
.ws-pane-preview { overflow-y: auto; padding: 18px 22px 24px; }
.mm-root .ws-pane-preview:focus-visible { outline: 2px solid var(--mm-accent); outline-offset: -2px; border-radius: var(--mm-radius); }
.ws.compact .ws-pane-preview { overflow: visible; padding: 14px 15px; min-height: 160px; }
.ws-preview { font-size: 14px; }
.ws.compact .ws-preview { font-size: 13.5px; }
.ws-preview.is-empty::before { content: "Nothing here yet. Switch to Edit and start writing."; color: var(--mm-muted); font-style: italic; }
.ws-preview a.ws-wikilink { color: var(--mm-violet); text-decoration: none; border-bottom: 1px solid color-mix(in srgb, var(--mm-violet) 50%, transparent); border-radius: 3px; padding: 0 1px; cursor: pointer; }
.ws-preview a.ws-wikilink:hover { background: color-mix(in srgb, var(--mm-violet) 14%, transparent); text-decoration: none; }
.ws-preview a.ws-wikilink.missing { color: var(--mm-muted); border-bottom-style: dashed; }
.ws-preview input[type="checkbox"] { cursor: pointer; }
.ws-body.drag-over .ws-pane::after { content: attr(data-drop); position: absolute; inset: 8px; display: grid; place-items: center; text-align: center; padding: 12px; border: 2px dashed color-mix(in srgb, var(--mm-accent) 70%, transparent); border-radius: 11px; background: color-mix(in srgb, var(--mm-accent) 8%, rgba(11, 12, 16, .78)); color: var(--mm-accent); font: 700 13px/1.4 var(--mm-font); pointer-events: none; z-index: 4; }

.ws-suggest { position: absolute; left: 10px; right: 10px; bottom: 10px; z-index: 5; display: flex; flex-direction: column; padding: 5px; gap: 1px; border-radius: 11px; background: var(--ws-float); border: 1px solid var(--mm-border-strong); box-shadow: var(--mm-shadow); backdrop-filter: var(--mm-blur); -webkit-backdrop-filter: var(--mm-blur); }
.ws-suggest-head { font: 700 10.5px/1 var(--mm-font); letter-spacing: .08em; text-transform: uppercase; color: var(--mm-muted); padding: 6px 8px 5px; }
.ws-opt { display: flex; align-items: center; gap: 8px; padding: 7px 9px; border-radius: 8px; font-size: 13px; color: var(--mm-fg); cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ws-opt .mm-icon { width: 14px; height: 14px; color: var(--mm-violet); }
.ws-opt[aria-selected="true"] { background: color-mix(in srgb, var(--mm-accent) 16%, transparent); color: var(--mm-heading); }

.ws-status { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 14px; font-size: 11.5px; color: var(--mm-muted); padding: 0 4px; min-height: 18px; }
.ws-saved { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; color: var(--mm-fg-2); }
.ws-saved::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: var(--mm-lime); box-shadow: 0 0 8px var(--mm-lime); }
.ws-saved[data-state="dirty"]::before, .ws-saved[data-state="saving"]::before { background: var(--mm-amber); box-shadow: 0 0 8px var(--mm-amber); }
.ws-saved[data-state="error"] { color: var(--mm-red); }
.ws-saved[data-state="error"]::before { background: var(--mm-red); box-shadow: 0 0 8px var(--mm-red); }
.ws-saved button { font: inherit; color: var(--mm-accent); background: none; border: 0; padding: 0; cursor: pointer; text-decoration: underline; }
.ws-msg { margin-left: auto; display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
.ws-msg[data-kind="error"] { color: var(--mm-red); }
.ws-msg[data-kind="ok"] { color: var(--mm-lime); }
.ws-msg[data-kind="busy"] { color: var(--mm-fg-2); }
.ws-msg .mm-spinner { width: 12px; height: 12px; }

/* related context, backlinks, sources */
.ws-context { margin-top: 22px; padding-top: 16px; border-top: 1px solid var(--mm-border); display: flex; flex-direction: column; gap: 20px; }
.ws.compact .ws-context { margin-top: 0; padding: 14px; border: 1px solid var(--mm-border); border-radius: var(--mm-radius); background: var(--mm-glass); backdrop-filter: var(--mm-blur); -webkit-backdrop-filter: var(--mm-blur); }
.mm-root .ws-ctx-h { display: flex; align-items: center; gap: 7px; margin: 0 0 9px; font: 700 11px/1 var(--mm-font); letter-spacing: .09em; text-transform: uppercase; color: var(--mm-fg-2); }
.ws-ctx-h .mm-icon { width: 14px; height: 14px; color: var(--mm-accent); }
.ws-ctx-sub { font-size: 12px; color: var(--mm-muted); margin: -3px 0 10px; }
.ws-ctx-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.ws-ctx-item { display: flex; align-items: flex-start; gap: 10px; width: 100%; text-align: left; font: inherit; color: inherit; padding: 10px 11px; border-radius: 11px; background: rgba(255, 255, 255, .025); border: 1px solid var(--mm-border); cursor: pointer; transition: border-color .15s, background .15s, box-shadow .2s; }
.ws-ctx-item:hover { border-color: color-mix(in srgb, var(--mm-accent) 45%, transparent); background: rgba(255, 255, 255, .045); box-shadow: 0 0 16px color-mix(in srgb, var(--mm-accent) 10%, transparent); }
.ws-ctx-ico { flex: none; display: grid; place-items: center; width: 28px; height: 28px; border-radius: 8px; background: color-mix(in srgb, var(--k, var(--mm-accent)) 14%, transparent); color: var(--k, var(--mm-accent)); }
.ws-ctx-ico .mm-icon { width: 15px; height: 15px; }
.ws-ctx-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 5px; }
.ws-ctx-title { display: flex; align-items: center; gap: 6px; min-width: 0; font-weight: 650; font-size: 13px; color: var(--mm-heading); }
.ws-ctx-title > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ws-ctx-meta { font-size: 11.5px; color: var(--mm-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ws-ctx-snippet { font-size: 12px; color: var(--mm-fg-2); line-height: 1.45; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.ws-kws { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
.ws-kws > span:first-child { font-size: 11px; color: var(--mm-muted); margin-right: 2px; }
.ws-kw { font: 600 10.5px/1 var(--mm-mono); padding: 3px 6px; border-radius: 5px; color: var(--mm-accent); background: color-mix(in srgb, var(--mm-accent) 10%, transparent); border: 1px solid color-mix(in srgb, var(--mm-accent) 25%, transparent); }
.ws-kw.topic { color: var(--mm-violet); background: color-mix(in srgb, var(--mm-violet) 10%, transparent); border-color: color-mix(in srgb, var(--mm-violet) 28%, transparent); }
.ws-score { flex: none; display: flex; flex-direction: column; align-items: flex-end; gap: 5px; width: 46px; font: 700 11px/1 var(--mm-mono); color: var(--mm-fg-2); padding-top: 2px; }
.ws-meter { width: 100%; height: 3px; border-radius: 3px; background: rgba(255, 255, 255, .08); overflow: hidden; }
.ws-meter i { display: block; height: 100%; width: var(--w); background: var(--mm-gradient); border-radius: 3px; }
.ws-cited { font: 700 9.5px/1 var(--mm-font); letter-spacing: .05em; text-transform: uppercase; padding: 3px 5px; border-radius: 5px; color: var(--mm-lime); background: color-mix(in srgb, var(--mm-lime) 12%, transparent); flex: none; }
.ws-ctx-empty { font-size: 12.5px; color: var(--mm-muted); margin: 0; padding: 10px 12px; border-radius: 10px; border: 1px dashed var(--mm-border-strong); }
.ws-ctx-empty code { font-size: 11.5px; }
.ws-src { display: flex; align-items: center; gap: 8px; padding: 6px 8px 6px 10px; border-radius: 9px; background: rgba(255, 255, 255, .025); border: 1px solid var(--mm-border); }
.ws-src a { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12.5px; }
.ws-src span { flex: none; font-size: 11px; color: var(--mm-muted); }

/* highlights drawer */
.ws-drawer { position: absolute; top: 0; right: 0; bottom: 0; width: min(360px, 92%); z-index: 8; display: flex; flex-direction: column; gap: 10px; padding: 14px; border-radius: var(--mm-radius); background: var(--ws-float); border: 1px solid var(--mm-border-strong); box-shadow: -24px 0 60px rgba(0, 0, 0, .5); backdrop-filter: var(--mm-blur); -webkit-backdrop-filter: var(--mm-blur); animation: ws-slide .2s var(--mm-ease); }
.ws.compact .ws-drawer { position: static; width: auto; max-height: 56vh; box-shadow: none; background: var(--mm-glass-strong); animation: ws-drop .16s var(--mm-ease); }
.ws-drawer .ws-search { flex: none; }
.ws-drawer-head { display: flex; align-items: center; gap: 8px; }
.mm-root .ws-drawer-head h3 { flex: 1; display: flex; align-items: center; gap: 8px; font-size: 14px; }
.ws-drawer-head h3 .mm-icon { color: var(--mm-accent); }
.ws-hl-list { overflow-y: auto; flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 8px; margin: 0 -4px; padding: 0 4px 2px; }
.ws-hl-group { display: flex; align-items: center; justify-content: space-between; font: 700 10.5px/1 var(--mm-font); letter-spacing: .09em; text-transform: uppercase; color: var(--mm-muted); margin: 6px 2px 0; }
.ws-hl { display: flex; gap: 6px; align-items: flex-start; padding: 9px 9px 9px 3px; border-radius: 11px; background: rgba(255, 255, 255, .03); border: 1px solid var(--mm-border); border-left: 3px solid var(--c, var(--mm-accent)); }
.ws-hl.inserted { border-color: color-mix(in srgb, var(--mm-lime) 45%, transparent); border-left-color: var(--c, var(--mm-accent)); }
.ws-hl-grip { flex: none; display: grid; place-items: center; width: 20px; height: 30px; color: var(--mm-muted); cursor: grab; border-radius: 6px; }
.ws-hl-grip:hover { color: var(--mm-fg); background: rgba(255, 255, 255, .06); }
.ws-hl-grip:active { cursor: grabbing; }
.ws-hl-grip .mm-icon { width: 14px; height: 14px; }
.ws-hl-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 5px; }
.ws-hl-text { margin: 0; font-size: 12.5px; line-height: 1.5; color: var(--mm-fg); display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
.ws-hl-note { margin: 0; font-size: 12px; color: var(--mm-fg-2); font-style: italic; }
.ws-hl-meta { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--mm-muted); min-width: 0; }
.ws-hl-meta span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ws-hl .mm-btn { flex: none; align-self: center; }

/* AI review */
.ws-ai { display: flex; flex-direction: column; gap: 10px; padding: 12px 14px; animation: ws-drop .16s var(--mm-ease); }
.ws-ai-head { display: flex; align-items: center; gap: 8px; min-width: 0; }
.ws-ai-badge { display: inline-flex; align-items: center; gap: 7px; font: 700 13px/1 var(--mm-font); color: var(--mm-heading); }
.ws-ai-badge .mm-icon { color: var(--mm-accent); }
.ws-ai-scope { font-size: 11.5px; color: var(--mm-muted); }
.ws-ai-out { max-height: 36vh; overflow-y: auto; padding: 11px 13px; border-radius: 10px; background: rgba(0, 0, 0, .28); border: 1px solid var(--mm-border); }
.ws.compact .ws-ai-out { max-height: 42vh; }
.ws-ai-out:empty::before { content: "Thinking…"; color: var(--mm-muted); }
.ws-ai-actions { display: flex; gap: 8px; flex-wrap: wrap; }

/* menus + dialog + empty */
.ws-menu-wrap { position: relative; }
.ws-menu { position: absolute; top: calc(100% + 6px); right: 0; z-index: 30; min-width: min(270px, calc(100vw - 16px)); max-width: min(320px, calc(100vw - 16px)); padding: 6px; display: flex; flex-direction: column; gap: 1px; border-radius: 12px; background: var(--ws-float); border: 1px solid var(--mm-border-strong); box-shadow: var(--mm-shadow); backdrop-filter: var(--mm-blur); -webkit-backdrop-filter: var(--mm-blur); animation: ws-drop .14s var(--mm-ease); }
.ws-menu-label { font: 700 10.5px/1 var(--mm-font); letter-spacing: .08em; text-transform: uppercase; color: var(--mm-muted); padding: 7px 10px 5px; }
.ws-mi { display: flex; align-items: flex-start; gap: 10px; width: 100%; padding: 8px 10px; border: 0; border-radius: 8px; background: transparent; color: var(--mm-fg); font: 600 13px/1.3 var(--mm-font); text-align: left; cursor: pointer; }
.ws-mi .mm-icon { margin-top: 1px; color: var(--mm-accent); }
.ws-mi:hover, .ws-mi:focus { background: rgba(255, 255, 255, .07); outline: none; }
.mm-root .ws-mi:focus-visible { outline: none; box-shadow: inset 0 0 0 1px var(--mm-accent); border-radius: 8px; }
.ws-mi[aria-disabled="true"] { cursor: default; }
.ws-mi[aria-disabled="true"] > span > span, .ws-mi[aria-disabled="true"] .mm-icon { opacity: .45; }
.ws-mi small { display: block; font-weight: 500; font-size: 11.5px; color: var(--mm-muted); margin-top: 2px; }
.ws-menu-sep { height: 1px; background: var(--mm-border); margin: 4px 6px; }
.ws-dialog { width: min(400px, calc(100vw - 32px)); padding: 20px; border-radius: 16px; color: var(--mm-fg); background: rgba(19, 22, 32, .97); border: 1px solid var(--mm-border-strong); box-shadow: var(--mm-shadow); backdrop-filter: var(--mm-blur); -webkit-backdrop-filter: var(--mm-blur); }
.ws-dialog::backdrop { background: rgba(4, 5, 8, .6); backdrop-filter: blur(3px); }
.mm-root .ws-dialog h2 { font-size: 16px; margin: 0 0 8px; }
.ws-dialog p { margin: 0 0 18px; color: var(--mm-fg-2); font-size: 13.5px; overflow-wrap: anywhere; }
.ws-dialog-actions { display: flex; justify-content: flex-end; gap: 8px; }
.ws-dialog .mm-btn.danger-solid { background: var(--mm-red); color: #160509; border-color: transparent; }
.ws-dialog .mm-btn.danger-solid:hover { filter: brightness(1.08); }
.ws-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 12px; padding: 44px 24px; flex: 1; }
.ws-empty-art { width: 64px; height: 64px; border-radius: 18px; display: grid; place-items: center; background: color-mix(in srgb, var(--mm-accent) 10%, transparent); border: 1px solid color-mix(in srgb, var(--mm-accent) 30%, transparent); box-shadow: 0 0 34px color-mix(in srgb, var(--mm-accent) 20%, transparent); color: var(--mm-accent); }
.ws-empty-art .mm-icon { width: 28px; height: 28px; }
.mm-root .ws-empty h2 { font-size: 18px; }
.ws-empty p { max-width: 380px; color: var(--mm-fg-2); margin: 0; }
.ws-empty .ws-tips { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; margin-top: 4px; }
.ws-empty .ws-tips span { font-size: 11.5px; color: var(--mm-fg-2); padding: 5px 9px; border-radius: 99px; border: 1px solid var(--mm-border-strong); background: rgba(255, 255, 255, .03); }

@keyframes ws-slide { from { opacity: 0; transform: translateX(16px); } }
@keyframes ws-drop { from { opacity: 0; transform: translateY(-4px); } }
/* Narrow hub windows: the list stacks above the editor and the workspace is the one scroller (the hub fits
   it to the viewport, so the page never scrolls too). The editor row is a full workspace-height tall, so
   scrolling past the list shows the whole editor; Split stays side by side (JS falls back to Edit when
   two panes can't fit). */
@container ws (max-width: ${NARROW}px) {
  .ws.full .ws-shell { grid-template-columns: minmax(0, 1fr); grid-template-rows: max-content max(420px, 100%); overflow-y: auto; padding-right: 4px; }
  .ws.full .ws-list { max-height: 240px; }
}
@media (prefers-reduced-motion: reduce) {
  .ws *, .ws-dialog { animation: none !important; transition: none !important; }
}
`
function adoptStyles() {
  if (document.getElementById('mm-ws-style')) return
  const st = document.createElement('style')
  st.id = 'mm-ws-style'
  st.textContent = STYLES
  document.head.appendChild(st)
}

let instances = 0

/**
 * Mount a Markdown workspace into `container`.
 * @returns {{ open(id: string|null): Promise<object|null>, insert(markdown: string, source?: {url,title}, opts?: {title?: string}): Promise<object|null>,
 *            current(): object|null, refresh(): void, ready: Promise<void>, destroy(): void }}
 */
export function createWorkspace(container, opts = {}) {
  const {
    db, uid, renderMarkdown, runTask,
    compact = false, initialId = null, onOpenNote,
    pageKey, pageSource,
    openUrl = url => chrome.tabs.create({ url }),
    openSettings = () => chrome.runtime.sendMessage({ type: 'OPEN_HUB', view: 'settings' }),
  } = opts
  const onDbChange = opts.onDbChange || dbOnChange
  let liveSettings = (typeof opts.settings === 'function' ? opts.settings() : opts.settings) || {}
  const n = ++instances
  const ids = { list: `ws${n}-list`, drawer: `ws${n}-drawer`, tags: `ws${n}-tags`, suggest: `ws${n}-suggest`, ai: `ws${n}-ai` }
  adoptStyles()

  // ───────── state ─────────
  let note = null // the open note (in-memory source of truth while editing)
  let notes = [] // cache of every note record
  let pages = null // cache of db.pages, loaded lazily
  let dirty = false
  let destroyed = false
  // pref = the view mode the user picked (remembered); mode = what's shown. Split falls back to Edit while
  // the editor is too narrow for two panes (tight), without forgetting the preference.
  let pref = compact ? (store.get('mm-ws-mode-compact', 'edit') === 'preview' ? 'preview' : 'edit') : (['edit', 'split', 'preview'].includes(store.get('mm-ws-mode', 'split')) ? store.get('mm-ws-mode', 'split') : 'split')
  let mode = pref
  let tight = false
  let saveChain = Promise.resolve()
  let lastSel = null // last caret/selection in the textarea, for inserts at the cursor
  let internalDrag = false
  let suggest = null // { start, items, index }
  let aiJob = null
  // Id of the open note while a delete/clear from another view awaits confirmation: autosave holds off,
  // so a pending write can't re-create a note the user just deleted elsewhere.
  let goneId = null
  const createdHere = new Set()
  const infoCache = new Map() // note id → { updated, plain, kw }
  const timers = {}
  const later = (name, fn, ms) => { clearTimeout(timers[name]); timers[name] = setTimeout(() => { if (!destroyed) fn() }, ms) }
  const menus = []

  // ───────── DOM ─────────
  const root = h('div', { class: `ws ${compact ? 'compact' : 'full'}`, 'aria-live': 'off' })
  const searchInput = h('input', { class: 'mm-input', type: 'search', placeholder: 'Search notes', 'aria-label': 'Search notes', autocomplete: 'off' })
  const itemsEl = h('ul', { class: 'ws-items', 'aria-label': 'Notes' })
  const listFoot = h('div', { class: 'ws-list-foot' })
  const newBtn = h('button', { type: 'button', class: 'mm-btn primary sm', title: 'Create a new note', onclick: () => newNote() }, icon('plus'), 'New')
  const listEl = h('aside', { class: 'ws-list mm-glass', id: ids.list, 'aria-label': 'Notes list' },
    h('div', { class: 'ws-list-head' }, h('div', { class: 'ws-search' }, icon('search'), searchInput), compact ? null : newBtn),
    itemsEl, listFoot)
  const switcherLabel = h('span', { class: 'ws-switcher-label' })
  const switcherCount = h('span', { class: 'ws-count' })
  const switcher = h('button', { type: 'button', class: 'ws-switcher', 'aria-expanded': 'false', 'aria-controls': ids.list, title: 'Show all notes' }, icon('note'), switcherLabel, switcherCount, icon('chev', 'ws-chev'))

  const titleInput = h('input', { class: 'ws-title', type: 'text', placeholder: 'Untitled note', 'aria-label': 'Note title', maxlength: '200', autocomplete: 'off' })
  const pinBtn = iconBtn('pin', 'Pin note', () => note && togglePin(note.id))
  pinBtn.setAttribute('aria-pressed', 'false')
  const deleteBtn = iconBtn('trash', 'Delete note', () => note && deleteNote(note.id))
  const tagsEl = h('div', { class: 'ws-tags', role: 'group', 'aria-label': 'Tags' })
  const tagInput = h('input', { class: 'ws-tag-input', type: 'text', placeholder: '+ Add tag', 'aria-label': 'Add a tag (press Enter)', list: ids.tags, autocomplete: 'off', maxlength: '40' })
  const tagList = h('datalist', { id: ids.tags })

  const FORMATS = [
    ['bold', 'Bold', `${MOD}+B`], ['italic', 'Italic', `${MOD}+I`], ['heading', 'Heading'], '|',
    ['bullet', 'Bulleted list'], ['check', 'Checklist'], ['quote', 'Quote'], '|',
    ['code', 'Code block'], ['link', 'Link', `${MOD}+K`], '|',
    ['math', 'Inline math'], ['mathBlock', 'Math block'],
  ]
  const toolbar = h('div', { class: 'ws-toolbar', role: 'toolbar', 'aria-label': 'Formatting' },
    FORMATS.map(f => (f === '|' ? h('span', { class: 'ws-tb-sep', 'aria-hidden': 'true' }) : h('button', {
      type: 'button', class: 'ws-tb', tabindex: '-1', dataset: { fmt: f[0] },
      'aria-label': f[2] ? `${f[1]} (${f[2]})` : f[1], title: f[2] ? `${f[1]} (${f[2]})` : f[1],
      onmousedown: e => e.preventDefault(), // keep the textarea selection
      onclick: () => format(f[0]),
    }, icon(f[0])))))
  toolbar.querySelector('.ws-tb').tabIndex = 0

  const MODES = compact ? [['edit', 'Edit'], ['preview', 'Preview']] : [['edit', 'Edit'], ['split', 'Split'], ['preview', 'Preview']]
  const modeSeg = h('div', { class: 'ws-seg', role: 'group', 'aria-label': 'View mode' },
    MODES.map(([m, label]) => h('button', { type: 'button', 'aria-pressed': 'false', dataset: { mode: m }, onclick: () => setMode(m) }, label)))
  const hlBtn = h('button', {
    type: 'button', class: compact ? 'mm-btn ghost icon sm ws-hl-btn' : 'mm-btn ghost sm ws-hl-btn', 'aria-expanded': 'false', 'aria-controls': ids.drawer,
    title: 'Saved highlights: insert or drag them into the note', 'aria-label': 'Highlights', onclick: () => toggleDrawer(),
  }, icon('highlighter'), compact ? null : 'Highlights')
  const aiBtn = h('button', { type: 'button', class: 'mm-btn sm', title: 'AI assist' }, icon('sparkles'), 'AI', icon('chev'))
  const exportBtn = h('button', { type: 'button', class: 'mm-btn sm', title: 'Export or send this note' }, icon('share'), 'Export', icon('chev'))
  const aiMenu = makeMenu(aiBtn, aiItems)
  const exportMenu = makeMenu(exportBtn, exportItems)

  const ta = h('textarea', {
    class: 'ws-ta', spellcheck: 'true', 'aria-label': 'Note body in Markdown',
    'aria-autocomplete': 'list', 'aria-controls': ids.suggest, 'aria-expanded': 'false',
    placeholder: 'Write in Markdown…\n\nType [[ to link another note. Drop text, links, images or highlights here.',
  })
  const suggestEl = h('div', { class: 'ws-suggest', id: ids.suggest, role: 'listbox', 'aria-label': 'Link to note', hidden: true })
  const editPane = h('div', { class: 'ws-pane ws-pane-edit', dataset: { drop: 'Drop to insert into this note' } }, ta, suggestEl)
  const previewEl = h('div', { class: 'mm-md ws-preview' })
  const contextEl = h('div', { class: 'ws-context', 'aria-label': 'Backlinks and related context' })
  const previewPane = h('div', { class: 'ws-pane ws-pane-preview', tabindex: '0', role: 'region', 'aria-label': 'Preview', dataset: { drop: 'Drop to insert into this note' } }, previewEl)
  const body = h('div', { class: 'ws-body' }, editPane, previewPane)
  if (compact) previewPane.removeAttribute('tabindex')

  const savedEl = h('span', { class: 'ws-saved', role: 'status' })
  const countsEl = h('span', { class: 'ws-counts' })
  const metaEl = h('span', { class: 'ws-meta' })
  const msgEl = h('span', { class: 'ws-msg', role: 'status', 'aria-live': 'polite' })
  const status = h('div', { class: 'ws-status' }, savedEl, countsEl, compact ? null : metaEl, msgEl)

  const aiPanel = h('section', { class: 'ws-ai mm-card glow', id: ids.ai, hidden: true, 'aria-label': 'AI suggestion' })
  const drawerSearch = h('input', { class: 'mm-input', type: 'search', placeholder: 'Search highlights', 'aria-label': 'Search highlights', autocomplete: 'off' })
  const drawerList = h('div', { class: 'ws-hl-list' })
  const drawer = h('aside', { class: 'ws-drawer', id: ids.drawer, hidden: true, 'aria-label': 'Highlights' },
    h('div', { class: 'ws-drawer-head' }, h('h3', {}, icon('highlighter'), 'Highlights'), iconBtn('x', 'Close highlights', () => toggleDrawer(false))),
    h('div', { class: 'ws-search' }, icon('search'), drawerSearch),
    drawerList)

  const emptyEl = h('div', { class: 'ws-empty mm-card', hidden: true },
    h('div', { class: 'ws-empty-art' }, icon('note')),
    h('h2', { text: 'Your research workspace' }),
    h('p', { text: 'Write in Markdown with live preview, drop in highlights and links, and connect ideas with [[wiki links]]. Everything stays on this device.' }),
    h('button', { type: 'button', class: 'mm-btn primary', onclick: () => newNote() }, icon('plus'), 'New note'),
    h('div', { class: 'ws-tips', 'aria-hidden': 'true' }, h('span', { text: 'Checklists' }), h('span', { text: 'KaTeX math' }), h('span', { text: 'Code highlighting' }), h('span', { text: 'AI assist' })))

  const dialog = h('dialog', { class: 'ws-dialog', 'aria-labelledby': `ws${n}-dlg-title` })

  const headRow = compact
    ? h('div', { class: 'ws-head' }, titleInput, h('div', { class: 'ws-actions' }, pinBtn, deleteBtn))
    : h('div', { class: 'ws-head' }, titleInput, h('div', { class: 'ws-actions' }, pinBtn, aiMenu.wrap, exportMenu.wrap, deleteBtn))
  const tagsRow = h('div', { class: 'ws-tags-row' }, tagsEl, tagList)
  const barRow = compact
    ? [h('div', { class: 'ws-bar' }, modeSeg, h('div', { class: 'ws-bar-end' }, hlBtn, aiMenu.wrap, exportMenu.wrap)), toolbar]
    : [h('div', { class: 'ws-bar' }, toolbar, h('span', { class: 'ws-spacer' }), hlBtn, modeSeg)]
  const editor = h('div', { class: 'ws-editor', hidden: true }, headRow, tagsRow, barRow, compact ? drawer : null, aiPanel, body, compact ? contextEl : null, status)
  const main = h('section', { class: 'ws-main', 'aria-label': 'Note editor' }, editor, emptyEl)
  if (!compact) { previewPane.append(contextEl); body.append(drawer) } // the drawer overlays the panes, never the header
  const shell = compact
    ? h('div', { class: 'ws-shell' }, h('div', { class: 'ws-top' }, switcher, newBtn), listEl, main)
    : h('div', { class: 'ws-shell' }, listEl, main)
  if (compact) listEl.hidden = true
  root.append(shell, dialog)
  container.append(root)

  // ───────── notifications ─────────
  function notify(msg, kind = 'info', ms = 5000, { toast = false } = {}) {
    if (destroyed) return
    msgEl.replaceChildren(kind === 'busy' ? h('span', { class: 'mm-spinner', 'aria-hidden': 'true' }) : '', msg)
    msgEl.dataset.kind = kind
    if (kind !== 'busy') later('msg', () => { msgEl.replaceChildren(); delete msgEl.dataset.kind }, ms)
    else clearTimeout(timers.msg)
    if (opts.toast && (toast || kind === 'error')) opts.toast(msg)
  }
  function setSaved(state, err) {
    savedEl.dataset.state = state
    if (state === 'error') {
      savedEl.replaceChildren(`Couldn’t save: ${err?.message || err}. `, h('button', { type: 'button', text: 'Retry', onclick: () => { dirty = true; save() } }))
    } else savedEl.textContent = { saved: 'Saved', dirty: 'Editing…', saving: 'Saving…' }[state] || ''
  }

  // ───────── notes cache + list ─────────
  function info(nt) {
    let c = infoCache.get(nt.id)
    if (!c || c.updated !== nt.updated || c.title !== nt.title || c.tags !== (nt.tags || []).join('\u0001')) {
      const plain = plainText(nt.body)
      const tags = (nt.tags || []).join('\u0001')
      const text = `${nt.title} ${nt.title} ${(nt.tags || []).join(' ')} ${plain.replace(/https?:\/\/\S+/g, ' ')}`
      c = { updated: nt.updated, title: nt.title, tags, plain, kw: keywords(text, 16), hay: `${nt.title}\n${(nt.tags || []).join(' ')}\n${plain}`.toLowerCase() }
      infoCache.set(nt.id, c)
    }
    return c
  }

  async function loadNotes() {
    const all = await db.all('notes')
    if (destroyed) return
    notes = all.map(r => (note && r.id === note.id ? note : { ...r, tags: r.tags || [], sources: r.sources || [] }))
    if (note && !notes.some(r => r.id === note.id) && createdHere.has(note.id)) notes.push(note)
    renderList()
    renderTagSuggestions()
    renderPreview()
  }

  function renderList() {
    const terms = searchInput.value.trim().toLowerCase().split(/\s+/).filter(Boolean)
    let list = notes.slice().sort(byPinnedUpdated)
    if (terms.length) list = list.filter(nt => { const hay = info(nt).hay; return terms.every(t => hay.includes(t)) })
    const active = itemsEl.contains(document.activeElement) ? document.activeElement : null
    const keepFocus = active && { id: active.closest('.ws-item')?.dataset.id, cls: ['ws-item-open', 'ws-del'].find(c => active.classList.contains(c)) || 'pin' }
    const items = list.slice(0, LIST_CAP).map(itemEl)
    if (!items.length) {
      items.push(h('li', { class: 'ws-list-empty' }, terms.length
        ? [h('b', { text: 'No matching notes' }), `Nothing matches “${searchInput.value.trim()}”.`]
        : [h('b', { text: 'No notes yet' }), 'Create one to start collecting ideas.']))
    }
    itemsEl.replaceChildren(...items)
    if (keepFocus?.id) {
      const li = itemsEl.querySelector(`.ws-item[data-id="${CSS.escape(keepFocus.id)}"]`)
      ;(keepFocus.cls === 'pin' ? li?.querySelector('[aria-pressed]') : li?.querySelector(`.${keepFocus.cls}`))?.focus()
    }
    listFoot.textContent = terms.length
      ? `${list.length} of ${notes.length} notes`
      : `${notes.length} ${notes.length === 1 ? 'note' : 'notes'}${list.length > LIST_CAP ? ` · showing ${LIST_CAP}` : ''}`
    switcherLabel.textContent = note ? (note.title.trim() || 'Untitled note') : 'Notes'
    switcherCount.textContent = String(notes.length)
  }

  function itemEl(nt) {
    const current = note?.id === nt.id
    const c = info(nt)
    const snippet = (c.snippet ??= snippetText(nt.body, nt.title))
    const pin = iconBtn('pin', nt.pinned ? 'Unpin note' : 'Pin note', () => togglePin(nt.id))
    pin.setAttribute('aria-pressed', String(!!nt.pinned))
    const del = iconBtn('trash', 'Delete note', () => deleteNote(nt.id), 'mm-btn ghost icon sm ws-del')
    const open = h('button', {
      type: 'button', class: 'ws-item-open', 'aria-current': current ? 'true' : null,
      onclick: () => { openNote(nt.id); if (compact) toggleList(false) },
      onkeydown: e => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
        e.preventDefault()
        const all = [...itemsEl.querySelectorAll('.ws-item-open')]
        all[Math.max(0, Math.min(all.length - 1, all.indexOf(e.currentTarget) + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus()
      },
    },
    h('span', { class: 'ws-item-title' }, nt.pinned ? icon('pin') : null, h('span', { class: nt.title.trim() ? '' : 'untitled', text: nt.title.trim() || 'Untitled note' })),
    snippet ? h('span', { class: 'ws-item-snippet', text: snippet }) : null,
    h('span', { class: 'ws-item-meta' }, h('span', { text: timeAgo(nt.updated) }), (nt.tags || []).slice(0, 3).map(t => h('span', { class: 'ws-tagref', text: `#${t}` }))))
    return h('li', { class: `ws-item${nt.pinned ? ' pinned' : ''}`, dataset: { id: nt.id } }, open, h('div', { class: 'ws-item-actions' }, pin, del))
  }

  function renderTagSuggestions() {
    const all = new Map()
    for (const nt of notes) for (const t of nt.tags || []) all.set(t.toLowerCase(), t)
    tagList.replaceChildren(...[...all.values()].sort().slice(0, 200).map(t => h('option', { value: t })))
  }

  function toggleList(force) {
    if (!compact) return
    const show = force ?? listEl.hidden
    listEl.hidden = !show
    switcher.setAttribute('aria-expanded', String(show))
    if (show) { renderList(); searchInput.focus() }
  }

  // ───────── open / create / delete / pin ─────────
  function newRecord(fields = {}) {
    const now = Date.now()
    return { id: uid('note_'), title: '', body: '', tags: [], sources: [], created: now, updated: now, pinned: false, ...fields }
  }

  async function newNote(fields = {}, { focusTitle = true } = {}) {
    const rec = newRecord(fields)
    await db.put('notes', rec)
    createdHere.add(rec.id)
    notes.push({ ...rec })
    await openNote(rec.id)
    if (focusTitle && !destroyed) titleInput.focus()
    return rec
  }

  /** Delete the open note if it was created here and never got any content. */
  async function cleanupPristine(nt) {
    if (!nt || !createdHere.has(nt.id)) return
    if (nt.title.trim() || nt.body.trim() || nt.tags.length || nt.sources.length) return
    createdHere.delete(nt.id)
    notes = notes.filter(x => x.id !== nt.id)
    await db.delete('notes', nt.id).catch(() => {})
  }

  async function openNote(id, { quiet = false } = {}) {
    if (destroyed) return null
    if (note?.id === id) return current()
    await flush()
    const prev = note
    const rec = id ? (await db.get('notes', id).catch(() => null)) : null
    if (destroyed) return null
    if (prev && prev.id !== rec?.id) await cleanupPristine(prev)
    if (!rec) {
      if (id && !quiet) notify('That note no longer exists.', 'error')
      setNote(null)
      return null
    }
    setNote(rec)
    return current()
  }

  function setNote(rec) {
    abortAi(true)
    hideSuggest()
    clearTimeout(timers.save)
    dirty = false
    lastSel = null
    goneId = null
    if (!rec) {
      note = null
      editor.hidden = true
      emptyEl.hidden = false
      if (!compact) toggleDrawer(false)
      renderList()
      onOpenNote?.(null)
      return
    }
    note = { ...rec, title: rec.title || '', body: rec.body || '', tags: [...(rec.tags || [])], sources: [...(rec.sources || [])], pinned: !!rec.pinned }
    const i = notes.findIndex(x => x.id === note.id)
    if (i >= 0) notes[i] = note; else notes.push(note)
    titleInput.value = note.title
    ta.value = note.body
    ta.scrollTop = 0
    previewPane.scrollTop = 0
    editor.hidden = false
    emptyEl.hidden = true
    renderTags()
    renderPin()
    renderMeta()
    renderPreview()
    renderCounts()
    setSaved('saved')
    renderList()
    renderContext()
    if (!drawer.hidden) renderDrawer()
    onOpenNote?.(note.id)
  }

  async function deleteNote(id) {
    const target = note?.id === id ? note : notes.find(x => x.id === id)
    if (!target) return
    const ok = await confirmDialog({
      title: 'Delete this note?',
      message: `“${target.title.trim() || 'Untitled note'}” will be permanently deleted. This can’t be undone.`,
      confirm: 'Delete note',
    })
    if (!ok || destroyed) return
    const wasOpen = note?.id === id
    if (wasOpen) { clearTimeout(timers.save); dirty = false; abortAi(true) }
    try {
      await db.delete('notes', id)
    } catch (e) {
      notify(`Couldn’t delete: ${e.message}`, 'error')
      return
    }
    createdHere.delete(id)
    infoCache.delete(id)
    notes = notes.filter(x => x.id !== id)
    if (wasOpen) {
      note = null
      const next = notes.slice().sort(byPinnedUpdated)[0]
      if (next) await openNote(next.id); else setNote(null)
    } else renderList()
    notify('Note deleted.', 'ok')
  }

  async function togglePin(id) {
    if (note?.id === id) {
      if (goneId === id) return // being deleted elsewhere: don't write it back
      note.pinned = !note.pinned
      renderPin()
      await flush()
      await db.put('notes', snapshot()).catch(e => notify(`Couldn’t pin: ${e.message}`, 'error'))
      notify(note?.pinned ? 'Pinned to the top.' : 'Unpinned.', 'ok', 2500)
    } else {
      const rec = await db.get('notes', id)
      if (!rec) return
      rec.pinned = !rec.pinned
      await db.put('notes', rec)
      const i = notes.findIndex(x => x.id === id)
      if (i >= 0) notes[i] = { ...notes[i], pinned: rec.pinned }
    }
    renderList()
  }

  function renderPin() {
    const on = !!note?.pinned
    pinBtn.setAttribute('aria-pressed', String(on))
    pinBtn.title = on ? 'Unpin note' : 'Pin note'
    pinBtn.setAttribute('aria-label', pinBtn.title)
  }

  function renderMeta() {
    if (!note) return
    const d = t => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    metaEl.textContent = `Created ${d(note.created)}`
  }

  // ───────── autosave ─────────
  function snapshot() {
    return { id: note.id, title: note.title, body: note.body, tags: [...note.tags], sources: note.sources.map(s => ({ ...s })), created: note.created, updated: note.updated, pinned: !!note.pinned }
  }
  function markDirty() {
    if (!note) return
    dirty = true
    setSaved('dirty')
    later('save', save, SAVE_DELAY)
  }
  function save() {
    clearTimeout(timers.save)
    saveChain = saveChain.then(async () => {
      if (!note || !dirty) return
      if (goneId === note.id) return // stays dirty; syncExternal() resumes saving or closes the note
      dirty = false
      note.updated = Date.now()
      const rec = snapshot()
      setSaved('saving')
      try {
        await db.put('notes', rec)
        if (note?.id === rec.id && !dirty) setSaved('saved')
      } catch (e) {
        if (note?.id === rec.id) { dirty = true; setSaved('error', e) }
      }
    })
    return saveChain
  }
  const flush = () => (dirty ? save() : saveChain)

  // Another view (hub ⇄ side panel) changed or deleted the open note: adopt the change unless we have
  // unsaved edits; close the note if it's gone. Runs are serialized so callers can await a settled state.
  let syncChain = Promise.resolve()
  const syncExternal = () => (syncChain = syncChain.then(syncNow).catch(e => console.warn('[MM notes] sync failed', e)))
  async function syncNow() {
    if (!note || destroyed) return
    const id = note.id
    // IndexedDB resolves a missing key as undefined: map it to null so "deleted" and "couldn't read" differ.
    const rec = await db.get('notes', id).then(r => r ?? null, () => undefined)
    if (destroyed || note?.id !== id) return
    if (rec === undefined) { // read failed: if a delete is pending, check again rather than guess
      if (goneId === id) later('sync', syncExternal, 1000)
      return
    }
    if (!rec) return closeDeleted(id)
    if (goneId === id) { // false alarm (e.g. re-imported right away): resume the held autosave
      goneId = null
      if (dirty) later('save', save, 0)
    }
    if ((rec.updated || 0) <= (note.updated || 0) && !!rec.pinned === note.pinned) return
    if (dirty) return
    const focused = document.activeElement === ta
    const [s, e] = [ta.selectionStart, ta.selectionEnd]
    Object.assign(note, { title: rec.title || '', body: rec.body || '', tags: [...(rec.tags || [])], sources: [...(rec.sources || [])], updated: rec.updated, pinned: !!rec.pinned })
    if (document.activeElement !== titleInput) titleInput.value = note.title
    if (ta.value !== note.body) {
      ta.value = note.body
      if (focused) ta.setSelectionRange(Math.min(s, ta.value.length), Math.min(e, ta.value.length))
    }
    renderTags(); renderPin(); renderPreview(); renderCounts(); renderList(); renderContext()
  }

  /** The open note was deleted in another view: drop it (never write it back) and open the next one. */
  async function closeDeleted(id) {
    const lost = dirty
    clearTimeout(timers.save)
    dirty = false
    goneId = null
    note = null // from here on save(), insert() and the editor handlers no longer target it
    abortAi(true)
    createdHere.delete(id)
    infoCache.delete(id)
    notes = notes.filter(x => x.id !== id)
    notify(lost ? 'This note was deleted in another window. Your unsaved edits were discarded.' : 'This note was deleted in another window.', 'error', 7000)
    const all = await db.all('notes').catch(() => notes)
    if (destroyed || note) return // the user opened another note meanwhile
    const next = all.filter(x => x.id !== id).sort(byPinnedUpdated)[0]
    if (next) await openNote(next.id, { quiet: true }); else setNote(null)
  }

  // ───────── title + tags ─────────
  titleInput.addEventListener('input', () => {
    if (!note) return
    note.title = titleInput.value
    markDirty()
    later('list', renderList, 150)
    later('ctx', renderContext, 700)
  })
  titleInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); ta.focus(); ta.setSelectionRange(0, 0) }
  })

  function renderTags() {
    if (!note) return
    tagsEl.replaceChildren(
      ...note.tags.map(t => h('span', { class: 'ws-tag' }, `#${t}`, h('button', { type: 'button', 'aria-label': `Remove tag ${t}`, title: `Remove #${t}`, onclick: () => removeTag(t) }, icon('x')))),
      tagInput,
    )
  }
  function addTags(raw, { focus = true } = {}) {
    if (!note) return
    let added = false
    for (let t of String(raw).split(/[,\n]/)) {
      t = t.trim().replace(/^#+/, '').replace(/\s+/g, '-').slice(0, 40)
      if (!t || note.tags.some(x => x.toLowerCase() === t.toLowerCase())) continue
      note.tags.push(t)
      added = true
    }
    if (!added) return
    renderTags()
    if (focus) tagInput.focus()
    markDirty()
    later('ctx', renderContext, 300)
  }
  function removeTag(t) {
    if (!note) return
    note.tags = note.tags.filter(x => x !== t)
    renderTags()
    tagInput.focus()
    markDirty()
    later('ctx', renderContext, 300)
  }
  tagInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTags(tagInput.value)
      tagInput.value = ''
    } else if (e.key === 'Backspace' && !tagInput.value && note?.tags.length) {
      removeTag(note.tags[note.tags.length - 1])
    }
  })
  tagInput.addEventListener('change', () => { // picking from the datalist
    if (tagInput.value.trim() && notes.some(nt => (nt.tags || []).includes(tagInput.value.trim()))) { addTags(tagInput.value); tagInput.value = '' }
  })
  tagInput.addEventListener('blur', () => { if (tagInput.value.trim()) { addTags(tagInput.value, { focus: false }); tagInput.value = '' } })

  // ───────── textarea editing primitives ─────────
  /** Replace [start, end) with text keeping native undo when possible, then select [selStart, selEnd). */
  function edit(start, end, text, selStart = start + text.length, selEnd = selStart, { focus = true } = {}) {
    let done = false
    if (focus && !ta.closest('[hidden]') && getComputedStyle(editPane).display !== 'none') {
      ta.focus()
      ta.setSelectionRange(start, end)
      const before = ta.value.length
      try { done = text ? document.execCommand('insertText', false, text) : (start === end || document.execCommand('delete')) } catch { done = false }
      if (done && ta.value.length !== before - (end - start) + text.length) done = false // safety net
    }
    if (!done) {
      ta.setRangeText(text, start, end, 'end')
      ta.dispatchEvent(new Event('input', { bubbles: true }))
    }
    ta.setSelectionRange(selStart, selEnd)
    lastSel = { start: selStart, end: selEnd }
  }

  function wrap(before, after, placeholder) {
    const v = ta.value
    let s = ta.selectionStart
    let e = ta.selectionEnd
    while (s < e && /\s/.test(v[s])) s++
    while (e > s && /\s/.test(v[e - 1])) e--
    const sel = v.slice(s, e)
    if (v.slice(s - before.length, s) === before && v.slice(e, e + after.length) === after) {
      return edit(s - before.length, e + after.length, sel, s - before.length, e - before.length)
    }
    if (sel.length >= before.length + after.length && sel.startsWith(before) && sel.endsWith(after)) {
      const inner = sel.slice(before.length, sel.length - after.length)
      return edit(s, e, inner, s, s + inner.length)
    }
    const inner = sel || placeholder
    edit(s, e, before + inner + after, s + before.length, s + before.length + inner.length)
  }

  const LIST_RE = /^(\s*)(?:[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+)?/
  const HAS = { bullet: /^\s*[-*+]\s+(?!\[[ xX]\]\s)/, check: /^\s*[-*+]\s+\[[ xX]\]\s/, quote: /^\s*>/ }
  function lines(kind) {
    const v = ta.value
    const s = ta.selectionStart
    const e = ta.selectionEnd
    const ls = v.lastIndexOf('\n', s - 1) + 1
    let le = v.indexOf('\n', e > s && v[e - 1] === '\n' ? e - 1 : e)
    if (le < 0) le = v.length
    const src = v.slice(ls, le).split('\n')
    const filled = src.filter(l => l.trim())
    const on = filled.length > 0 && filled.every(l => HAS[kind].test(l))
    const out = src.map(l => {
      if (!l.trim() && src.length > 1) return l
      if (kind === 'quote') return on ? l.replace(/^(\s*)>\s?/, '$1') : `> ${l}`
      if (on) return l.replace(LIST_RE, '$1')
      return l.replace(LIST_RE, (m, ind) => ind + (kind === 'check' ? '- [ ] ' : '- '))
    })
    const text = out.join('\n')
    if (s === e && src.length === 1) {
      const caret = Math.min(ls + text.length, Math.max(ls, s + text.length - (le - ls)))
      edit(ls, le, text, caret, caret)
    } else edit(ls, le, text, ls, ls + text.length)
  }

  function heading() {
    const v = ta.value
    const s = ta.selectionStart
    const ls = v.lastIndexOf('\n', s - 1) + 1
    let le = v.indexOf('\n', s)
    if (le < 0) le = v.length
    const line = v.slice(ls, le)
    const m = /^(#{1,6})\s+/.exec(line)
    const level = m ? m[1].length : 0
    const next = level === 0 ? 2 : level >= 3 ? 0 : level + 1
    const content = m ? line.slice(m[0].length) : line
    const prefix = next ? `${'#'.repeat(next)} ` : ''
    if (!content.trim() && next) return edit(ls, le, `${prefix}Heading`, ls + prefix.length, ls + prefix.length + 7)
    const text = prefix + content
    edit(ls, le, text, ls + text.length, ls + text.length)
  }

  function fence(open, close, placeholder) {
    const v = ta.value
    const s = ta.selectionStart
    const e = ta.selectionEnd
    const sel = v.slice(s, e).replace(/^\n+|\n+$/g, '')
    const inner = sel || placeholder
    const pre = s === 0 || v[s - 1] === '\n' ? '' : '\n'
    const post = e >= v.length ? '\n' : v[e] === '\n' ? '' : '\n'
    const head = `${pre}${open}\n`
    edit(s, e, `${head}${inner}\n${close}${post}`, s + head.length, s + head.length + inner.length)
  }

  function link() {
    const v = ta.value
    const s = ta.selectionStart
    const e = ta.selectionEnd
    const sel = v.slice(s, e)
    if (/^\s*https?:\/\/\S+\s*$/.test(sel)) return edit(s, e, `[link text](${sel.trim()})`, s + 1, s + 10)
    const label = sel.replace(/\n+/g, ' ') || 'link text'
    const text = `[${label}](https://)`
    if (sel) return edit(s, e, text, s + label.length + 3, s + label.length + 11)
    edit(s, e, text, s + 1, s + 1 + label.length)
  }

  function format(kind) {
    if (!note) return
    if (mode === 'preview') setMode(compact ? 'edit' : 'split')
    ta.focus()
    switch (kind) {
      case 'bold': return wrap('**', '**', 'bold text')
      case 'italic': return wrap('_', '_', 'italic text')
      case 'heading': return heading()
      case 'bullet': return lines('bullet')
      case 'check': return lines('check')
      case 'quote': return lines('quote')
      case 'code': return fence('```', '```', 'code')
      case 'link': return link()
      case 'math': return wrap('$', '$', 'E = mc^2')
      case 'mathBlock': return fence('$$', '$$', 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}')
    }
  }

  // Roving focus inside the formatting toolbar.
  toolbar.addEventListener('keydown', e => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return
    const btns = [...toolbar.querySelectorAll('.ws-tb')]
    let i = btns.indexOf(document.activeElement)
    if (i < 0) return
    e.preventDefault()
    i = e.key === 'Home' ? 0 : e.key === 'End' ? btns.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + btns.length) % btns.length
    for (const b of btns) b.tabIndex = -1
    btns[i].tabIndex = 0
    btns[i].focus()
  })

  /** Enter inside a list/quote continues it; Enter on an empty item ends it. */
  function continueList() {
    const v = ta.value
    const s = ta.selectionStart
    if (s !== ta.selectionEnd) return false
    const ls = v.lastIndexOf('\n', s - 1) + 1
    const line = v.slice(ls, s)
    const m = /^(\s*(?:> ?)*)([-*+] \[[ xX]\] |[-*+] |(\d+)([.)]) )?/.exec(line)
    const prefix = m[0]
    if (!prefix.trim()) return false
    let le = v.indexOf('\n', s)
    if (le < 0) le = v.length
    if (line === prefix && !v.slice(s, le).trim()) {
      edit(ls, s, '', ls, ls)
      return true
    }
    let marker = m[2] || ''
    if (/\[[ xX]\]/.test(marker)) marker = marker.replace(/\[[xX]\]/, '[ ]')
    else if (m[3]) marker = `${Number(m[3]) + 1}${m[4]} `
    const ins = `\n${m[1]}${marker}`
    edit(s, s, ins, s + ins.length, s + ins.length)
    return true
  }

  ta.addEventListener('keydown', e => {
    if (suggest && handleSuggestKey(e)) return
    const mod = (e.ctrlKey || e.metaKey) && !e.altKey
    if (mod && !e.shiftKey) {
      const k = e.key.toLowerCase()
      if (k === 'b') { e.preventDefault(); return format('bold') }
      if (k === 'i') { e.preventDefault(); return format('italic') }
      if (k === 'k') { e.preventDefault(); return format('link') }
      if (k === 's') { e.preventDefault(); save(); return }
    }
    if (e.key === 'Enter' && !e.shiftKey && !mod && !e.altKey && !e.isComposing && continueList()) e.preventDefault()
  })
  const rememberSel = () => { lastSel = { start: ta.selectionStart, end: ta.selectionEnd } }
  for (const ev of ['select', 'keyup', 'mouseup', 'blur', 'focus']) ta.addEventListener(ev, rememberSel)
  ta.addEventListener('input', () => {
    if (!note) return
    note.body = ta.value
    rememberSel()
    markDirty()
    later('preview', renderPreview, ta.value.length > 60000 ? 450 : 160)
    later('counts', renderCounts, 250)
    later('ctx', renderContext, 900)
    later('list', renderList, 600)
    checkSuggest()
  })
  ta.addEventListener('click', () => checkSuggest())
  ta.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== ta) hideSuggest() }, 120))
  let syncRaf = 0
  ta.addEventListener('scroll', () => {
    if (mode !== 'split' || syncRaf) return
    syncRaf = requestAnimationFrame(() => {
      syncRaf = 0
      const max = ta.scrollHeight - ta.clientHeight
      previewPane.scrollTop = max > 0 ? (ta.scrollTop / max) * (previewPane.scrollHeight - previewPane.clientHeight) : 0
    })
  }, { passive: true })

  // ───────── [[wiki link]] autocomplete ─────────
  function checkSuggest() {
    if (!note || ta.selectionStart !== ta.selectionEnd) return hideSuggest()
    const pos = ta.selectionStart
    const m = /\[\[([^[\]\n|]{0,60})$/.exec(ta.value.slice(Math.max(0, pos - 64), pos))
    if (!m) return hideSuggest()
    const q = m[1].trim().toLowerCase()
    const items = notes
      .filter(nt => nt.id !== note.id && nt.title.trim() && nt.title.toLowerCase().includes(q))
      .sort((a, b) => (b.title.toLowerCase().startsWith(q) - a.title.toLowerCase().startsWith(q)) || (b.updated - a.updated))
      .slice(0, 6)
    if (!items.length) return hideSuggest()
    suggest = { start: pos - m[1].length, items, index: Math.min(suggest?.index || 0, items.length - 1) }
    renderSuggest()
  }
  function renderSuggest() {
    suggestEl.replaceChildren(h('div', { class: 'ws-suggest-head', 'aria-hidden': 'true', text: 'Link to note · Enter to insert' }),
      ...suggest.items.map((nt, i) => h('div', {
        class: 'ws-opt', role: 'option', id: `ws${n}-opt-${i}`, 'aria-selected': String(i === suggest.index),
        onmousedown: e => e.preventDefault(), onclick: () => acceptSuggest(i),
      }, icon('note'), nt.title.trim())))
    suggestEl.hidden = false
    ta.setAttribute('aria-expanded', 'true')
    ta.setAttribute('aria-activedescendant', `ws${n}-opt-${suggest.index}`)
  }
  function hideSuggest() {
    if (!suggest && suggestEl.hidden) return
    suggest = null
    suggestEl.hidden = true
    ta.setAttribute('aria-expanded', 'false')
    ta.removeAttribute('aria-activedescendant')
  }
  function acceptSuggest(i) {
    if (!suggest) return
    const title = suggest.items[i].title.trim()
    const end = ta.selectionStart
    const skip = ta.value.slice(end, end + 2) === ']]' ? 2 : 0
    const start = suggest.start
    hideSuggest()
    edit(start, end + skip, `${title}]]`)
  }
  function handleSuggestKey(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      suggest.index = (suggest.index + (e.key === 'ArrowDown' ? 1 : -1) + suggest.items.length) % suggest.items.length
      renderSuggest()
      return true
    }
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); acceptSuggest(suggest.index); return true }
    if (e.key === 'Escape') { e.preventDefault(); hideSuggest(); return true }
    return false
  }

  // ───────── preview ─────────
  function noteIdByTitle(title) {
    const t = title.trim().toLowerCase()
    const hits = notes.filter(nt => nt.title.trim().toLowerCase() === t)
    return hits.sort((a, b) => b.updated - a.updated)[0]?.id || null
  }
  function decorate(frag) {
    replaceWikiLinks(frag, (title, label) => {
      const id = noteIdByTitle(title)
      return h('a', {
        href: '#', class: `ws-wikilink${id ? '' : ' missing'}`, dataset: { title },
        title: id ? `Open “${title}”` : `Create note “${title}”`,
      }, label)
    })
    frag.querySelectorAll('input[type="checkbox"]').forEach((cb, i) => {
      cb.removeAttribute('disabled')
      cb.dataset.task = String(i)
      cb.setAttribute('aria-label', 'Toggle task')
    })
    frag.querySelectorAll('a[href]:not(.ws-wikilink)').forEach(a => {
      if (/^(https?:|mailto:)/i.test(a.getAttribute('href'))) { a.target = '_blank'; a.rel = 'noopener noreferrer' }
    })
  }
  /** Render into the preview, replacing only top-level blocks that changed (keeps images from flickering). */
  function renderPreview() {
    if (!note || mode === 'edit') return
    const tpl = document.createElement('template')
    tpl.innerHTML = renderMarkdown(note.body) // DOMPurify-sanitized
    decorate(tpl.content)
    const next = [...tpl.content.childNodes]
    const prev = [...previewEl.childNodes]
    let i = 0
    for (; i < next.length; i++) {
      if (prev[i]?.isEqualNode(next[i])) continue
      if (prev[i]) previewEl.replaceChild(next[i], prev[i]); else previewEl.appendChild(next[i])
    }
    for (; i < prev.length; i++) prev[i].remove()
    previewEl.classList.toggle('is-empty', !note.body.trim())
  }
  previewEl.addEventListener('click', e => {
    const wl = e.target.closest('a.ws-wikilink')
    if (wl) { e.preventDefault(); openWiki(wl.dataset.title); return }
    const a = e.target.closest('a[href]')
    if (!a) return
    e.preventDefault()
    const href = a.getAttribute('href')
    if (/^https?:/i.test(href)) openUrl(href)
    else if (/^mailto:/i.test(href)) window.open(href, '_blank', 'noopener')
  })
  previewEl.addEventListener('change', e => {
    const cb = e.target.closest('input[type="checkbox"][data-task]')
    if (!cb || !note) return
    const at = taskOffsets(ta.value)[Number(cb.dataset.task)]
    if (at == null) return
    edit(at, at + 1, cb.checked ? 'x' : ' ', undefined, undefined, { focus: false })
  })

  async function openWiki(title) {
    const id = noteIdByTitle(title)
    if (id) return openNote(id)
    await flush()
    await newNote({ title }, { focusTitle: false })
    if (!destroyed) { setMode(compact ? 'edit' : pref === 'preview' ? 'split' : pref); ta.focus() }
    notify(`Created “${title}”.`, 'ok')
  }

  function renderCounts() {
    if (!note) return
    const text = note.body.replace(/data:[^\s)]+/g, '')
    const w = wordCount(text)
    countsEl.textContent = `${w.toLocaleString()} ${w === 1 ? 'word' : 'words'} · ${text.length.toLocaleString()} ${text.length === 1 ? 'char' : 'chars'}`
  }

  function setMode(m) {
    if (!MODES.some(([x]) => x === m)) m = MODES[0][0]
    pref = m
    store.set(compact ? 'mm-ws-mode-compact' : 'mm-ws-mode', m)
    applyMode()
  }
  function applyMode() {
    mode = tight && pref === 'split' ? 'edit' : pref
    body.dataset.mode = mode
    for (const b of modeSeg.children) {
      b.hidden = tight && b.dataset.mode === 'split'
      b.setAttribute('aria-pressed', String(b.dataset.mode === mode))
    }
    toolbar.hidden = mode === 'preview'
    if (mode !== 'edit') renderPreview()
  }
  // Full mode: offer Split only while the editor area fits two readable panes.
  const bodyObs = !compact && typeof ResizeObserver === 'function' ? new ResizeObserver(([entry]) => {
    const w = entry.contentRect.width
    if (!w) return // editor hidden (no note open)
    const next = w < SPLIT_MIN
    if (next !== tight) { tight = next; applyMode() }
  }) : null
  bodyObs?.observe(body)

  // ───────── inserting content ─────────
  function appendBlock(md, { focus = false } = {}) {
    const v = ta.value
    const at = trailingDefsStart(v)
    const head = v.slice(0, at).replace(/\s+$/, '')
    const tail = at < v.length ? '\n\n' : '\n'
    const text = (head ? '\n\n' : '') + md + tail
    edit(head.length, at, text, head.length + text.length - tail.length, undefined, { focus })
  }
  function insertBlockAtCaret(md, { focus = true, at = null } = {}) {
    const v = ta.value
    const sel = at != null ? { start: at, end: at } : lastSel
    if (!sel) return appendBlock(md, { focus })
    const s = Math.min(sel.start, v.length)
    const e = Math.min(Math.max(sel.end, s), v.length)
    const before = v.slice(0, s)
    const after = v.slice(e)
    const pre = !before || /\n\n$/.test(before) ? '' : /\n$/.test(before) ? '\n' : '\n\n'
    const post = !after ? '\n' : /^\n\n/.test(after) ? '' : /^\n/.test(after) ? '\n' : '\n\n'
    edit(s, e, pre + md + post, s + pre.length + md.length, undefined, { focus })
  }
  function addSource(src) {
    if (!note || !src?.url || !/^https?:/i.test(src.url)) return false
    if (note.sources.some(x => x.url === src.url)) return false
    note.sources.push(cleanSource(src))
    markDirty()
    later('ctx', renderContext, 200)
    return true
  }

  async function insertImage(file, at) {
    if (file.size > MAX_IMAGE_BYTES) {
      notify(`“${file.name || 'Image'}” is ${fmtBytes(file.size)}. Images must be 1.5 MB or smaller.`, 'error', 7000)
      return false
    }
    let url
    try { url = await readDataUrl(file) } catch (e) { notify(`Couldn’t read the image: ${e.message}`, 'error'); return false }
    if (destroyed || !note) return false
    const ref = `img-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
    const alt = (file.name || 'image').replace(/\.[a-z0-9]+$/i, '').replace(/[[\]\\]/g, '').slice(0, 80) || 'image'
    // The data URL goes in a reference definition at the very end so the editor stays readable.
    const v = ta.value
    const keep = lastSel ? { ...lastSel } : null
    edit(v.length, v.length, `${/\n$/.test(v) || !v ? '' : '\n'}\n[${ref}]: ${url}\n`, undefined, undefined, { focus: false })
    lastSel = keep // the definition went after everything, so earlier offsets are unchanged
    insertBlockAtCaret(`![${alt}][${ref}]`, { at })
    notify(`Image added (${fmtBytes(file.size)}).`, 'ok', 3000)
    return true
  }

  async function insertFile(file, at) {
    if (/^image\//.test(file.type)) return insertImage(file, at)
    if (/^text\/|\/json$/.test(file.type) || /\.(md|markdown|txt)$/i.test(file.name)) {
      if (file.size > MAX_IMAGE_BYTES) { notify(`“${file.name}” is too large to insert (max 1.5 MB).`, 'error'); return false }
      const text = await readText(file).catch(() => null)
      if (text == null || destroyed || !note) return false
      insertBlockAtCaret(text.trim(), { at })
      return true
    }
    notify(`Only images and text files can be dropped into a note (“${file.name}” is ${file.type || 'unknown'}).`, 'error', 7000)
    return false
  }

  function insertHighlight(hl, at = null) {
    if (!note) return
    if (mode === 'preview' && compact) setMode('edit')
    insertBlockAtCaret(highlightMarkdown(hl), { at, focus: mode !== 'preview' })
    addSource({ url: hl.url, title: hl.title || hl.site })
    notify('Highlight inserted.', 'ok', 2500)
  }

  // ───────── drag & drop + paste ─────────
  const acceptsDrag = dt => !!dt && [...dt.types].some(t => t === 'Files' || t === HL_MIME || t === 'text/plain' || t === 'text/uri-list' || t === 'text/html')
  ta.addEventListener('dragstart', () => { internalDrag = true })
  ta.addEventListener('dragend', () => { internalDrag = false })
  body.addEventListener('dragover', e => {
    if (internalDrag || !note || drawer.contains(e.target) || !acceptsDrag(e.dataTransfer)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    body.classList.add('drag-over')
    later('dragleave', () => body.classList.remove('drag-over'), 160)
  })
  body.addEventListener('drop', e => {
    body.classList.remove('drag-over')
    if (internalDrag || !note || !e.dataTransfer || drawer.contains(e.target)) return
    e.preventDefault()
    const dt = e.dataTransfer
    // DataTransfer is only readable during the event: read everything synchronously.
    const at = caretFromPoint(e)
    const hlId = dt.getData(HL_MIME)
    const files = [...dt.files]
    const uriList = dt.getData('text/uri-list')
    const html = dt.getData('text/html')
    const text = dt.getData('text/plain')
    if (mode === 'preview' && compact) setMode('edit')
    handleDrop({ at, hlId, files, uriList, html, text })
  })
  function caretFromPoint(e) {
    if (e.target !== ta) return null
    try {
      const p = document.caretPositionFromPoint?.(e.clientX, e.clientY)
      if (p && p.offsetNode === ta) return p.offset
    } catch { /* unsupported */ }
    return null
  }
  async function handleDrop({ at, hlId, files, uriList, html, text }) {
    if (hlId) {
      const hl = await db.get('highlights', hlId).catch(() => null)
      if (hl) insertHighlight(hl, at); else notify('That highlight no longer exists.', 'error')
      return
    }
    if (files.length) {
      for (const f of files) await insertFile(f, at)
      return
    }
    const uris = String(uriList || '').split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#'))
    const doc = html ? new DOMParser().parseFromString(html, 'text/html') : null // inert: nothing runs or loads
    if (uris.length) {
      const anchor = doc?.querySelector('a[href]')
      const img = doc?.querySelector('img[src]')
      let title = (anchor?.textContent || '').replace(/\s+/g, ' ').trim()
      const plain = String(text || '').trim()
      if (!title && plain && plain !== uris[0] && !/^https?:\/\//.test(plain)) title = plain
      if (img && !title && /^https?:/i.test(img.getAttribute('src'))) {
        insertBlockAtCaret(`![${mdText(img.getAttribute('alt') || 'image')}](${mdUrl(img.getAttribute('src'))})`, { at })
        return
      }
      const md = uris.map((u, i) => mdLink(i === 0 && title ? title : prettyUrl(u), u))
      insertBlockAtCaret(md.length > 1 ? md.map(l => `- ${l}`).join('\n') : md[0], { at })
      if (/^https?:/i.test(uris[0])) addSource({ url: uris[0], title: title || prettyUrl(uris[0]) })
      return
    }
    let t = String(text || '')
    if (!t.trim() && doc) t = doc.body?.innerText || doc.body?.textContent || ''
    if (!t.trim()) return
    if (/^https?:\/\/\S+$/.test(t.trim())) {
      const u = t.trim()
      insertBlockAtCaret(mdLink(prettyUrl(u), u), { at })
      addSource({ url: u, title: prettyUrl(u) })
      return
    }
    const src = html ? pageSource?.() : null
    insertBlockAtCaret(quoteMd(t) + sourceLine(src), { at })
    if (src?.url) addSource(src)
  }
  ta.addEventListener('paste', e => {
    const files = [...(e.clipboardData?.files || [])].filter(f => /^image\//.test(f.type))
    if (!files.length || !note) return
    e.preventDefault()
    rememberSel()
    ;(async () => { for (const f of files) await insertImage(f) })()
  })

  // ───────── highlights drawer ─────────
  let drawerSeq = 0
  function toggleDrawer(force) {
    const show = force ?? drawer.hidden
    if (show === !drawer.hidden) return
    drawer.hidden = !show
    hlBtn.setAttribute('aria-expanded', String(show))
    if (show) { renderDrawer(); drawerSearch.focus() } else if (drawer.contains(document.activeElement)) hlBtn.focus()
  }
  // Escape closes the drawer from anywhere in the workspace unless something else used the key.
  root.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || e.defaultPrevented || drawer.hidden || dialog.open) return
    if (menus.some(m => m.isOpen())) return
    e.preventDefault()
    toggleDrawer(false)
  })
  drawerSearch.addEventListener('input', () => later('drawer', renderDrawer, 150))

  async function renderDrawer() {
    if (drawer.hidden) return
    const seq = ++drawerSeq
    if (!drawerList.childElementCount) drawerList.replaceChildren(...[0, 1, 2].map(() => h('div', { class: 'mm-skeleton', style: 'height:64px' })))
    let all
    try {
      all = await db.all('highlights')
    } catch (e) {
      if (seq === drawerSeq) drawerList.replaceChildren(h('div', { class: 'mm-error', text: `Couldn’t load highlights: ${e.message}` }))
      return
    }
    if (seq !== drawerSeq || destroyed) return
    const terms = drawerSearch.value.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (terms.length) all = all.filter(hl => { const hay = `${hl.text} ${hl.note} ${hl.title} ${hl.site}`.toLowerCase(); return terms.every(t => hay.includes(t)) })
    all.sort((a, b) => (b.created || 0) - (a.created || 0))
    const key = pageKey?.() || null
    const here = key ? all.filter(hl => hl.pageKey === key) : []
    const rest = all.filter(hl => !key || hl.pageKey !== key)
    const out = []
    if (here.length) out.push(h('div', { class: 'ws-hl-group' }, h('span', { text: 'On this page' }), h('span', { class: 'ws-count', text: String(here.length) })), ...here.map(hlEl))
    if (rest.length) out.push(h('div', { class: 'ws-hl-group' }, h('span', { text: key ? 'Recent' : 'All highlights' }), h('span', { class: 'ws-count', text: String(rest.length) })), ...rest.slice(0, RECENT_HL).map(hlEl))
    if (!out.length) {
      out.push(h('div', { class: 'mm-empty' }, terms.length
        ? [h('b', { text: 'No matches' }), 'Try a different search.']
        : [h('b', { text: 'No highlights yet' }), 'Select text on any page and press Alt+Shift+H to save it here.']))
    }
    drawerList.replaceChildren(...out)
  }
  function hlEl(hl) {
    const tag = (liveSettings.tags || []).find(t => t.id === hl.tag)
    const grip = h('span', { class: 'ws-hl-grip', draggable: 'true', title: 'Drag into the note', 'aria-hidden': 'true' }, icon('grip'))
    grip.addEventListener('dragstart', e => {
      e.dataTransfer.setData(HL_MIME, hl.id)
      e.dataTransfer.setData('text/plain', highlightMarkdown(hl))
      e.dataTransfer.effectAllowed = 'copy'
    })
    const el = h('div', { class: 'ws-hl', vars: tag?.color ? { '--c': tag.color } : {} },
      grip,
      h('div', { class: 'ws-hl-body' },
        h('p', { class: 'ws-hl-text', text: hl.text }),
        hl.note ? h('p', { class: 'ws-hl-note', text: hl.note }) : null,
        h('div', { class: 'ws-hl-meta' }, h('span', { class: 'mm-dot', vars: tag?.color ? { '--c': tag.color } : {} }), h('span', { text: [tag?.name, hl.site || siteOf(hl.url), timeAgo(hl.created)].filter(Boolean).join(' · ') }))),
      h('button', {
        type: 'button', class: 'mm-btn sm', 'aria-label': `Insert highlight: ${String(hl.text).slice(0, 60)}`,
        onclick: () => { insertHighlight(hl); el.classList.add('inserted') },
      }, 'Insert'))
    return el
  }

  // ───────── Related Context: backlinks, linking engine, sources ─────────
  let ctxSeq = 0
  async function renderContext() {
    if (!note || destroyed) return
    const seq = ++ctxSeq
    if (!pages) {
      try { pages = await db.all('pages') } catch { pages = [] }
    }
    if (seq !== ctxSeq || !note || destroyed) return
    const back = backlinks()
    const related = rankRelated()
    const sec = (ic, title, count, ...kids) => h('section', {}, h('h3', { class: 'ws-ctx-h' }, icon(ic), title, count != null ? h('span', { class: 'ws-count', text: String(count) }) : null), ...kids)
    const parts = []
    parts.push(sec('back', 'Backlinks', back.length, back.length
      ? h('ul', { class: 'ws-ctx-list' }, back.map(b => h('li', {}, h('button', { type: 'button', class: 'ws-ctx-item', onclick: () => openNote(b.note.id) },
        h('span', { class: 'ws-ctx-ico', vars: { '--k': 'var(--mm-violet)' } }, icon('note')),
        h('span', { class: 'ws-ctx-main' }, h('span', { class: 'ws-ctx-title' }, h('span', { text: b.note.title.trim() || 'Untitled note' })), h('span', { class: 'ws-ctx-snippet', text: b.snippet }))))))
      : h('p', { class: 'ws-ctx-empty' }, 'No notes link here yet. Link to this note from another one with ', h('code', { text: `[[${note.title.trim() || 'Note title'}]]` }), '.')))
    parts.push(sec('sparkles', 'Related context', related.length,
      h('p', { class: 'ws-ctx-sub', text: 'Archived pages and notes that share keywords with this note.' }),
      related.length
        ? h('ul', { class: 'ws-ctx-list' }, related.map(relatedEl))
        : h('p', { class: 'ws-ctx-empty', text: note.body.trim().length < 40 ? 'Keep writing: related pages and notes appear once this note has a few distinctive keywords.' : 'Nothing related yet. Pages you brief in the side panel and your other notes are matched here by shared keywords.' })))
    if (note.sources.length) {
      parts.push(sec('globe', 'Sources', note.sources.length, h('ul', { class: 'ws-ctx-list' }, note.sources.map(s => h('li', { class: 'ws-src' },
        h('a', { href: s.url, title: s.url, text: s.title || s.url, onclick: e => { e.preventDefault(); openUrl(s.url) } }),
        h('span', { text: siteOf(s.url) }),
        iconBtn('x', `Remove source ${s.title || s.url}`, () => { note.sources = note.sources.filter(x => x.url !== s.url); markDirty(); renderContext() }))))))
    }
    contextEl.replaceChildren(...parts)
  }

  function backlinks() {
    const t = note.title.trim().toLowerCase()
    if (!t) return []
    const out = []
    for (const nt of notes) {
      if (nt.id === note.id) continue
      for (const m of nt.body.matchAll(WIKI_RE)) {
        if (m[1].trim().toLowerCase() !== t) continue
        const ls = nt.body.lastIndexOf('\n', m.index) + 1
        let le = nt.body.indexOf('\n', m.index)
        if (le < 0) le = nt.body.length
        out.push({ note: nt, snippet: plainText(nt.body.slice(ls, le)).slice(0, 180) })
        break
      }
    }
    return out.sort((a, b) => b.note.updated - a.note.updated)
  }

  // overlap() divides by the smaller keyword set, so two short texts sharing one or two words look
  // "100% related". Scale by how many keywords are actually shared (full weight from four).
  const confidence = shared => Math.min(1, shared / 4)
  function rankRelated() {
    const kw = info(note).kw
    if (kw.length < 2) return []
    const tags = new Set(note.tags.map(t => t.toLowerCase().replace(/-/g, ' ')))
    const cited = new Set(note.sources.map(s => s.url))
    const out = []
    for (const p of pages || []) {
      const pk = Array.isArray(p.keywords) ? p.keywords : []
      const shared = kw.filter(k => pk.includes(k))
      const topics = (p.topics || []).filter(t => tags.has(String(t).toLowerCase()))
      if (!shared.length && !topics.length) continue
      if (shared.length < 2 && !topics.length) continue // one common word is not a relationship
      const raw = overlap(kw, pk)
      const score = Math.min(1, raw * confidence(shared.length) + topics.length * 0.1)
      out.push({ kind: 'page', score, shared, topics, rec: p, cited: cited.has(p.url) })
    }
    for (const nt of notes) {
      if (nt.id === note.id) continue
      const nk = info(nt).kw
      const shared = kw.filter(k => nk.includes(k))
      if (shared.length < 2) continue
      const score = overlap(kw, nk) * confidence(shared.length)
      out.push({ kind: 'note', score, shared, topics: [], rec: nt })
    }
    return out.sort((a, b) => b.score - a.score || b.shared.length - a.shared.length).slice(0, 8)
  }

  function relatedEl(r) {
    const isPage = r.kind === 'page'
    const title = isPage ? (r.rec.title || r.rec.url) : (r.rec.title.trim() || 'Untitled note')
    const meta = isPage ? [r.rec.site || siteOf(r.rec.url), r.rec.visited ? `visited ${timeAgo(r.rec.visited)}` : ''].filter(Boolean).join(' · ') : `Note · updated ${timeAgo(r.rec.updated)}`
    const pct = Math.round(r.score * 100)
    return h('li', {}, h('button', {
      type: 'button', class: 'ws-ctx-item', dataset: { kind: r.kind },
      title: isPage ? `Open ${r.rec.url} in a new tab` : `Open note “${title}”`,
      onclick: () => (isPage ? openUrl(r.rec.url) : openNote(r.rec.id)),
    },
    h('span', { class: 'ws-ctx-ico', vars: { '--k': isPage ? 'var(--mm-cyan)' : 'var(--mm-violet)' } }, icon(isPage ? 'globe' : 'note')),
    h('span', { class: 'ws-ctx-main' },
      h('span', { class: 'ws-ctx-title' }, h('span', { text: title }), r.cited ? h('span', { class: 'ws-cited', text: 'Source' }) : null),
      h('span', { class: 'ws-ctx-meta', text: meta }),
      h('span', { class: 'ws-kws', 'aria-label': `Shared keywords: ${r.shared.join(', ')}` },
        h('span', { text: 'Shared' }),
        r.shared.slice(0, 5).map(k => h('span', { class: 'ws-kw', text: k })),
        r.topics.map(t => h('span', { class: 'ws-kw topic', text: `#${t}` })))),
    h('span', { class: 'ws-score', title: `${pct}% keyword overlap` }, `${pct}%`, h('span', { class: 'ws-meter' }, h('i', { vars: { '--w': `${Math.max(6, pct)}%` } })))))
  }

  // ───────── menus ─────────
  function makeMenu(btn, getItems) {
    const menu = h('div', { class: 'ws-menu', role: 'menu', hidden: true })
    const wrapEl = h('div', { class: 'ws-menu-wrap' }, btn, menu)
    btn.setAttribute('aria-haspopup', 'menu')
    btn.setAttribute('aria-expanded', 'false')
    const items = () => [...menu.querySelectorAll('[role="menuitem"]')]
    const outside = e => { if (!wrapEl.contains(e.target)) close(false) }
    // The menu hangs right-aligned under its button. When the button sits near the left edge (a wrapped
    // toolbar row in a narrow side panel), shift it so it stays inside the viewport.
    let placeRaf = 0
    function place() {
      placeRaf = 0
      if (menu.hidden) return
      menu.style.removeProperty('right')
      const vw = document.documentElement.clientWidth
      const r = menu.getBoundingClientRect()
      const shift = r.left < MENU_GAP ? MENU_GAP - r.left : r.right > vw - MENU_GAP ? vw - MENU_GAP - r.right : 0
      if (shift) menu.style.right = `${-Math.round(shift)}px`
    }
    const onResize = () => { if (!placeRaf) placeRaf = requestAnimationFrame(place) }
    function close(focusBtn) {
      if (menu.hidden) return
      menu.hidden = true
      btn.setAttribute('aria-expanded', 'false')
      document.removeEventListener('pointerdown', outside, true)
      removeEventListener('resize', onResize)
      cancelAnimationFrame(placeRaf)
      placeRaf = 0
      if (focusBtn) btn.focus()
    }
    function open(focusLast = false) {
      for (const m of menus) if (m.close !== close) m.close(false)
      menu.replaceChildren(...getItems().map(it => {
        if (it === '-') return h('div', { class: 'ws-menu-sep', role: 'separator' })
        if (it.heading) return h('div', { class: 'ws-menu-label', 'aria-hidden': 'true', text: it.heading })
        return h('button', {
          type: 'button', role: 'menuitem', class: 'ws-mi', tabindex: '-1', dataset: { action: it.id || '' },
          'aria-disabled': it.disabled ? 'true' : null,
          onclick: () => { if (it.disabled) return; close(true); it.onSelect() },
        }, icon(it.icon), h('span', {}, h('span', { text: it.label }), it.hint ? h('small', { text: it.hint }) : null))
      }))
      menu.hidden = false
      place()
      btn.setAttribute('aria-expanded', 'true')
      document.addEventListener('pointerdown', outside, true)
      addEventListener('resize', onResize)
      const list = items()
      ;(focusLast ? list[list.length - 1] : list.find(x => x.getAttribute('aria-disabled') !== 'true') || list[0])?.focus()
    }
    btn.addEventListener('click', () => (menu.hidden ? open() : close(true)))
    btn.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(e.key === 'ArrowUp') }
    })
    menu.addEventListener('keydown', e => {
      const list = items()
      const i = list.indexOf(document.activeElement)
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        list[(i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length]?.focus()
      } else if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault()
        list[e.key === 'Home' ? 0 : list.length - 1]?.focus()
      } else if (e.key === 'Escape') {
        e.preventDefault(); e.stopPropagation(); close(true)
      } else if (e.key === 'Tab') close(false)
    })
    const m = { wrap: wrapEl, close, isOpen: () => !menu.hidden }
    menus.push(m)
    return m
  }

  function aiItems() {
    const hasSel = lastSel && lastSel.end > lastSel.start
    const empty = !note?.body.trim()
    return [
      { heading: hasSel ? 'Rewrite the selection' : 'Rewrite the whole note' },
      ...AI_ACTIONS.map(a => ({ id: `ai-${a.id}`, label: a.label, icon: a.icon, hint: empty ? 'Write something first' : a.hint, disabled: empty || !!aiJob?.running, onSelect: () => runAssist(a) })),
    ]
  }

  function exportItems() {
    const url = String(liveSettings.webhookUrl || '').trim()
    const ok = /^https?:\/\//i.test(url)
    const items = [
      { id: 'md', label: 'Markdown (.md)', icon: 'md', hint: 'With front matter, for Obsidian and friends', onSelect: exportMd },
      { id: 'json', label: 'JSON (.json)', icon: 'json', hint: 'The full note record', onSelect: exportJson },
      { id: 'pdf', label: 'PDF', icon: 'printer', hint: 'Print-ready page, choose “Save as PDF”', onSelect: exportPdf },
      '-',
      { id: 'webhook', label: 'Send to webhook', icon: 'send', hint: ok ? `POST JSON to ${siteOf(url) || url}` : 'Disabled: add a webhook URL in Settings', disabled: !ok, onSelect: sendWebhook },
    ]
    if (!ok) items.push({ id: 'settings', label: 'Open Settings', icon: 'settings', hint: 'Set up your webhook URL', onSelect: () => openSettings() })
    return items
  }

  // ───────── exports ─────────
  async function exportMd() {
    if (!note) return
    await flush()
    download(`${slug(note.title)}.md`, noteToMarkdown(snapshot()), 'text/markdown')
    notify('Markdown downloaded.', 'ok', 3000)
  }
  async function exportJson() {
    if (!note) return
    await flush()
    download(`${slug(note.title)}.json`, JSON.stringify(snapshot(), null, 2), 'application/json')
    notify('JSON downloaded.', 'ok', 3000)
  }
  async function exportPdf() {
    if (!note) return
    await flush()
    await chrome.tabs.create({ url: chrome.runtime.getURL(`hub/print.html#${encodeURIComponent(note.id)}`) })
    notify('Opened the print view. Choose “Save as PDF”.', 'ok', 4000)
  }
  async function sendWebhook() {
    if (!note) return
    liveSettings = await readSettings().catch(() => liveSettings)
    const url = String(liveSettings.webhookUrl || '').trim()
    if (!/^https?:\/\//i.test(url)) { notify('Add a webhook URL in Settings first.', 'error'); return }
    await flush()
    const nt = snapshot()
    const host = siteOf(url) || url
    notify(`Sending to ${host}…`, 'busy')
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 15000)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: nt.title, body: nt.body, tags: nt.tags, sources: nt.sources, created: nt.created, updated: nt.updated }),
        signal: ctrl.signal,
        credentials: 'omit',
      })
      if (!res.ok) throw new Error(`the server answered HTTP ${res.status}`)
      notify(`Sent to ${host} (HTTP ${res.status}).`, 'ok', 6000)
    } catch (e) {
      notify(`Webhook failed: ${e.name === 'AbortError' ? 'timed out after 15 s' : e.message === 'Failed to fetch' ? 'couldn’t reach the server' : e.message}.`, 'error', 8000)
    } finally {
      clearTimeout(timer)
    }
  }

  // ───────── AI assist ─────────
  function abortAi(hide = false) {
    if (aiJob) { aiJob.ctrl.abort(); aiJob.running = false }
    if (hide) { aiJob = null; aiPanel.hidden = true; aiPanel.replaceChildren() }
  }

  /** Swap data-URL images for short tokens so they never go to the API; restore them in the output. */
  function protectImages(text) {
    const map = new Map()
    const out = text.replace(/data:image\/[a-z+.-]+;base64,[A-Za-z0-9+/=]+/g, m => { const k = `mm-image-${map.size + 1}`; map.set(k, m); return k })
    return { text: out, restore: s => s.replace(/mm-image-\d+/g, k => map.get(k) || k) }
  }

  async function runAssist(action) {
    if (!note) return
    const sel = lastSel && lastSel.end > lastSel.start ? { ...lastSel } : null
    const source = sel ? ta.value.slice(sel.start, sel.end) : ta.value
    if (!source.trim()) { notify('Write something first.', 'error'); return }
    abortAi(true)
    const job = { action, noteId: note.id, range: sel, source, out: '', running: true, ctrl: new AbortController() }
    aiJob = job
    const out = h('div', { class: 'mm-md ws-ai-out mm-caret', 'aria-live': 'polite', 'aria-busy': 'true' })
    const spinner = h('span', { class: 'mm-spinner', 'aria-hidden': 'true' })
    const replaceBtn = h('button', { type: 'button', class: 'mm-btn primary sm', disabled: true, onclick: () => applyAi('replace') }, icon('checkmark'), sel ? 'Replace selection' : 'Replace note')
    const appendBtn = h('button', { type: 'button', class: 'mm-btn sm', disabled: true, onclick: () => applyAi('append') }, icon('plus'), sel ? 'Insert below' : 'Append')
    const discardBtn = h('button', { type: 'button', class: 'mm-btn ghost sm', onclick: () => { abortAi(true); ta.focus() } }, icon('x'), 'Discard')
    const actions = h('div', { class: 'ws-ai-actions' }, replaceBtn, appendBtn, discardBtn)
    aiPanel.replaceChildren(
      h('div', { class: 'ws-ai-head' }, h('span', { class: 'ws-ai-badge' }, icon('sparkles'), action.label), h('span', { class: 'ws-ai-scope', text: sel ? `· selection (${wordCount(source)} words)` : '· whole note' }), h('span', { class: 'ws-spacer' }), spinner),
      out, actions)
    aiPanel.hidden = false
    let raf = 0
    const paint = () => { raf = 0; if (aiJob === job) out.innerHTML = renderMarkdown(job.out) }
    const { text, restore } = protectImages(source)
    try {
      const res = await runTask('noteAssist', { text, instruction: action.instruction }, {
        signal: job.ctrl.signal,
        onText: d => { if (aiJob !== job) return; job.out += d; if (!raf) raf = requestAnimationFrame(paint) },
      })
      if (aiJob !== job) return
      job.out = restore(String(res?.text || job.out).trim())
      job.running = false
      cancelAnimationFrame(raf)
      paint()
      out.classList.remove('mm-caret')
      out.setAttribute('aria-busy', 'false')
      spinner.remove()
      if (!job.out) { out.replaceChildren(h('p', { class: 'mm-muted', text: 'Claude returned an empty result. Try again.' })); return }
      if (res?.truncated) actions.prepend(h('span', { class: 'mm-small mm-muted', text: 'The answer was cut short.' }))
      replaceBtn.disabled = false
      appendBtn.disabled = false
      // Offer the decision by keyboard, unless the user went back to typing while it streamed.
      const at = document.activeElement
      if (!at || at === document.body || at === aiBtn || aiPanel.contains(at)) replaceBtn.focus()
    } catch (err) {
      if (aiJob !== job) return
      job.running = false
      cancelAnimationFrame(raf)
      spinner.remove()
      out.classList.remove('mm-caret')
      out.setAttribute('aria-busy', 'false')
      if (err?.code === 'ABORT') { abortAi(true); return }
      replaceBtn.hidden = true
      appendBtn.hidden = true
      out.replaceChildren(aiErrorBox(err, () => runAssist(action)))
    }
  }

  function aiErrorBox(err, retry) {
    const box = h('div', { class: 'mm-error', role: 'alert' })
    if (err?.code === 'NO_KEY') {
      box.append('Add your Claude API key to use AI assist. ', h('button', { type: 'button', class: 'mm-btn sm', onclick: () => openSettings() }, icon('settings'), 'Open settings'))
    } else {
      box.append(`${err?.message || err} `, h('button', { type: 'button', class: 'mm-btn sm', onclick: retry }, icon('retry'), 'Try again'))
    }
    return box
  }

  function applyAi(how) {
    const job = aiJob
    if (!job || job.running || !note || job.noteId !== note.id || !job.out) return
    const v = ta.value
    let range = job.range
    if (range && v.slice(range.start, range.end) !== job.source) {
      const i = v.indexOf(job.source)
      range = i >= 0 ? { start: i, end: i + job.source.length } : null
      if (!range) { notify('The selection changed, so the result was added at the end instead.', 'info') ; appendBlock(job.out, { focus: true }); abortAi(true); return }
    }
    if (how === 'replace') {
      if (range) edit(range.start, range.end, job.out, range.start, range.start + job.out.length)
      else edit(0, v.length, `${job.out}\n`, 0, 0)
      notify('Replaced. Press Ctrl+Z to undo.', 'ok', 4000)
    } else if (range) {
      insertBlockAtCaret(job.out, { at: range.end })
      notify('Inserted below the selection.', 'ok', 3000)
    } else {
      appendBlock(job.out, { focus: true })
      notify('Appended to the note.', 'ok', 3000)
    }
    abortAi(true)
  }

  // ───────── dialog ─────────
  function confirmDialog({ title, message, confirm = 'Delete' }) {
    return new Promise(resolve => {
      const cancelBtn = h('button', { type: 'button', class: 'mm-btn', onclick: () => dialog.close('cancel') }, 'Cancel')
      const okBtn = h('button', { type: 'button', class: 'mm-btn danger-solid', onclick: () => dialog.close('ok') }, icon('trash'), confirm)
      dialog.replaceChildren(h('h2', { id: `ws${n}-dlg-title`, text: title }), h('p', { text: message }), h('div', { class: 'ws-dialog-actions' }, cancelBtn, okBtn))
      dialog.returnValue = ''
      dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok'), { once: true })
      dialog.showModal()
      cancelBtn.focus()
    })
  }

  // ───────── global listeners ─────────
  searchInput.addEventListener('input', () => later('search', renderList, 120))
  searchInput.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); itemsEl.querySelector('.ws-item-open')?.focus() }
    if (e.key === 'Escape' && compact) { e.preventDefault(); toggleList(false); switcher.focus() }
  })
  switcher.addEventListener('click', () => toggleList())
  listEl.addEventListener('keydown', e => { if (e.key === 'Escape' && compact) { toggleList(false); switcher.focus() } })

  const offDb = onDbChange(evt => {
    if (destroyed || !evt) return
    if (evt.store === 'notes') {
      later('reload', loadNotes, 150)
      if (note && (evt.key == null || evt.key === note.id)) {
        // A delete/clear may have removed the open note: hold autosave until syncExternal has checked.
        if (evt.op === 'delete' || evt.op === 'clear') goneId = note.id
        later('sync', syncExternal, 60)
      }
    } else if (evt.store === 'pages') {
      pages = null
      later('ctx', renderContext, 800)
    } else if (evt.store === 'highlights') {
      later('drawer', renderDrawer, 200)
    }
  })
  const onStorage = (changes, area) => {
    if (area === 'sync' && changes.settings) readSettings().then(s => { liveSettings = s; if (!drawer.hidden) renderDrawer() }).catch(() => {})
  }
  chrome.storage.onChanged.addListener(onStorage)
  const onVisibility = () => { if (document.visibilityState === 'hidden') flush() }
  document.addEventListener('visibilitychange', onVisibility)
  addEventListener('pagehide', onVisibility)
  const tick = setInterval(() => { if (!destroyed && !document.hidden) renderList() }, 60000)

  // ───────── boot ─────────
  applyMode()
  const ready = (async () => {
    try { liveSettings = await readSettings() } catch { /* keep given settings */ }
    try {
      await loadNotes()
    } catch (e) {
      itemsEl.replaceChildren(h('li', { class: 'mm-error', text: `Couldn’t load notes: ${e.message}` }))
      return
    }
    if (destroyed || note) return
    const wanted = initialId && notes.some(x => x.id === initialId) ? initialId : null
    if (initialId && !wanted) notify('That note no longer exists, so the latest one is open instead.', 'error')
    const id = wanted || notes.slice().sort(byPinnedUpdated)[0]?.id
    if (id) await openNote(id); else setNote(null)
  })()

  function current() {
    return note ? { ...note, tags: [...note.tags], sources: note.sources.map(s => ({ ...s })) } : null
  }

  return {
    ready,
    async open(id) { await ready; return openNote(id) },
    /** Append Markdown to the open note (creating one titled after the source/page when none is open). */
    async insert(markdown, source, { title } = {}) {
      await ready
      if (destroyed) return null
      const md = String(markdown || '').trim()
      if (!md) return current()
      if (note && goneId === note.id) await syncExternal() // settle a pending delete first, never re-create it
      if (destroyed) return null
      const src = source?.url ? cleanSource(source) : null
      if (!note) {
        const rec = newRecord({ title: String(title || src?.title || 'Untitled note').slice(0, 200), body: `${md}\n`, sources: src && /^https?:/i.test(src.url) ? [src] : [] })
        await db.put('notes', rec)
        notes.push(rec)
        await openNote(rec.id)
        notify(`Created “${rec.title}”.`, 'ok', 5000, { toast: true })
        return current()
      }
      appendBlock(md)
      if (src) addSource(src)
      markDirty()
      await save()
      if (mode === 'edit') ta.scrollTop = ta.scrollHeight
      notify(`Added to “${note.title.trim() || 'Untitled note'}”.`, 'ok', 5000, { toast: true })
      return current()
    },
    current,
    /** Re-read page-dependent bits (highlights drawer grouping, related pages). */
    refresh() { pages = null; renderDrawer(); renderContext() },
    destroy() {
      if (destroyed) return
      const last = note
      flush().then(() => cleanupPristine(last))
      abortAi(true)
      destroyed = true
      for (const t of Object.values(timers)) clearTimeout(t)
      cancelAnimationFrame(syncRaf)
      clearInterval(tick)
      bodyObs?.disconnect()
      for (const m of menus) m.close(false)
      if (dialog.open) dialog.close('cancel')
      offDb()
      chrome.storage.onChanged.removeListener(onStorage)
      document.removeEventListener('visibilitychange', onVisibility)
      removeEventListener('pagehide', onVisibility)
      root.remove()
    },
  }
}
