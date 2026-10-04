// Settings: Claude API, briefing, highlights, reading, research, notes, appearance, shortcuts, data, about.
// Every control saves immediately (text fields debounced) and flashes a subtle "Saved" indicator.
import { getSettings, setSettings, onSettings, getApiKey, setApiKey, applyAccent, DEFAULT_SETTINGS, DEFAULT_TAGS, ACCENTS, MODELS } from '../../lib/store.js'
import { testKey } from '../../lib/ai.js'
import { BRIEF_MODES } from '../../lib/tasks.js'
import { download, normalizeUrl, siteOf } from '../../lib/text.js'
import { confirmDialog } from './history.js'

const EFFORTS = [
  { id: 'low', label: 'Low · fastest, lowest cost' },
  { id: 'medium', label: 'Medium · balanced' },
  { id: 'high', label: 'High · more thorough' },
  { id: 'xhigh', label: 'Extra high' },
  { id: 'max', label: 'Max · most thorough' },
]
const READER_FONTS = [['serif', 'Serif'], ['sans', 'Sans'], ['mono', 'Mono'], ['legible', 'Legible (hyperlegible)']]
const READER_THEMES = [['midnight', 'Midnight'], ['slate', 'Slate'], ['sepia', 'Sepia'], ['paper', 'Paper'], ['contrast', 'High contrast']]
const LANGUAGES = ['English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Dutch', 'Swedish', 'Norwegian', 'Danish', 'Finnish', 'Polish',
  'Czech', 'Romanian', 'Hungarian', 'Greek', 'Turkish', 'Russian', 'Ukrainian', 'Arabic', 'Hebrew', 'Persian', 'Urdu', 'Hindi', 'Bengali', 'Tamil',
  'Chinese (Simplified)', 'Chinese (Traditional)', 'Japanese', 'Korean', 'Vietnamese', 'Thai', 'Indonesian', 'Malay', 'Filipino', 'Swahili']
const TAG_COLORS = ['#22D3EE', '#A3E635', '#F472B6', '#A78BFA', '#FBBF24', '#FB7185', '#60A5FA', '#34D399', '#F97316', '#E879F9']
const MAX_TAGS = 12
const STORES = [
  { id: 'highlights', key: 'id', label: 'Highlights', desc: 'Every passage you highlighted, with tags and quick notes.' },
  { id: 'notes', key: 'id', label: 'Notes', desc: 'Your Markdown research notes.' },
  { id: 'pages', key: 'key', label: 'Pages & briefs', desc: 'Briefs, topics and entities behind the knowledge graph.' },
  { id: 'history', key: 'id', label: 'Research trail', desc: 'The branching history of how pages led to one another.' },
  { id: 'kv', key: 'k', label: 'Layout & misc', desc: 'Knowledge graph positions and small view preferences.' },
]
const COMMAND_FALLBACK = {
  _execute_action: 'Open the Master Mind side panel',
  'highlight-selection': 'Highlight the selected text',
  'toggle-reader': 'Toggle Focus Reading Mode',
  'capture-text': 'Capture text from a screen region (OCR)',
}
const SECTIONS = [
  ['api', 'Claude API', '<path d="M15 7a4 4 0 1 1-3.9 4.9L4 19v2h3v-2h2v-2h2l1.1-1.1A4 4 0 0 1 15 7z"/><circle cx="16" cy="8" r="1"/>'],
  ['brief', 'Briefing', '<path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5"/>'],
  ['highlights', 'Highlights', '<path d="M9 11l-6 6v3h3l6-6M22 3l-9 9-3-3 9-9z"/>'],
  ['reading', 'Reading', '<path d="M2 5h7a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H2zM22 5h-7a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h8z"/>'],
  ['research', 'Research', '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5M8 11l2 2 4-4"/>'],
  ['notes', 'Notes', '<path d="M4 4h12l4 4v12H4zM8 10h8M8 14h8M8 18h5"/>'],
  ['appearance', 'Appearance', '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18c1.5 0 2-1 2-2s-1-1.5-1-2.5 1-1.5 2-1.5h2a4 4 0 0 0 4-4c0-4.4-4-8-9-8z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/>'],
  ['shortcuts', 'Shortcuts', '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8"/>'],
  ['data', 'Data', '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>'],
  ['about', 'About', '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>'],
]
const svg = (paths, cls = 'mm-icon') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`
const ICON = {
  eye: svg('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  eyeOff: svg('<path d="M3 3l18 18M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),
  check: svg('<path d="M5 12l5 5L20 7"/>'),
  x: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  lock: svg('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  download: svg('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>'),
  upload: svg('<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>'),
  send: svg('<path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>'),
  ext: svg('<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'),
  bolt: svg('<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>'),
  reset: svg('<path d="M4 4v6h6M4.5 15a8 8 0 1 0 1.9-8.3L4 10"/>'),
}

const STYLES = `
.sv{display:grid;grid-template-columns:184px minmax(0,780px);gap:28px;align-items:start}
.sv-head{grid-column:1/-1;margin-bottom:0}
.sv-nav{position:sticky;top:26px;display:flex;flex-direction:column;gap:2px}
.sv-nav button{display:flex;align-items:center;gap:9px;padding:8px 10px;border:0;border-radius:9px;background:none;color:var(--mm-muted);font:600 13px/1.2 var(--mm-font);cursor:pointer;text-align:left;transition:color .15s,background .15s}
.sv-nav button:hover{color:var(--mm-fg);background:rgba(255,255,255,.04)}
.sv-nav button[aria-current="true"]{color:var(--mm-heading);background:rgba(255,255,255,.06);box-shadow:inset 2px 0 0 var(--mm-accent)}
.sv-nav button[aria-current="true"] .mm-icon{color:var(--mm-accent)}
.sv-main{display:flex;flex-direction:column;gap:16px;min-width:0}
.sv-sec{padding:20px 22px 8px;scroll-margin-top:20px}
.sv-sec>header{display:flex;align-items:flex-start;gap:12px;margin-bottom:6px}
.sv-sec>header .ic{width:34px;height:34px;flex:none;border-radius:10px;display:grid;place-items:center;color:var(--mm-accent);background:color-mix(in srgb,var(--mm-accent) 10%,transparent);border:1px solid color-mix(in srgb,var(--mm-accent) 26%,transparent)}
.sv-sec>header .ic .mm-icon{width:17px;height:17px}
.sv-sec>header p{margin:3px 0 0;color:var(--mm-muted);font-size:12.5px}
.sv-field{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,auto);align-items:center;gap:8px 20px;padding:14px 0;border-top:1px solid var(--mm-border)}
.sv-sec>header+.sv-field{border-top:0}
.sv-field.stack{grid-template-columns:1fr}
.sv-fl{min-width:0}
.sv-fl .lbl,.sv-field>.lbl{display:block;font-weight:600;color:var(--mm-heading);font-size:13.5px}
.sv-hint{margin:3px 0 0;color:var(--mm-muted);font-size:12.5px;line-height:1.45}
.sv-fc{display:flex;align-items:center;justify-content:flex-end;gap:8px;min-width:0}
.sv-fc .mm-select{width:230px}
.sv-fc .mm-switch span{margin:0}
.sv-range{display:flex;align-items:center;gap:12px;width:300px}
.sv-range output{font:600 12px/1 var(--mm-mono);color:var(--mm-heading);min-width:84px;text-align:right;white-space:nowrap}
.sv-key{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.sv-key .pw{position:relative;flex:1 1 280px;min-width:220px}
.sv-key .pw input{font-family:var(--mm-mono);font-size:13px;padding-right:42px;height:38px}
.sv-key .pw button{position:absolute;right:4px;top:50%;transform:translateY(-50%)}
.sv-status{display:inline-flex;align-items:center;gap:7px;font:600 12px/1 var(--mm-font);padding:6px 10px;border-radius:99px;border:1px solid var(--mm-border-strong);color:var(--mm-fg-2);white-space:nowrap}
.sv-status.ok{color:var(--mm-lime);border-color:color-mix(in srgb,var(--mm-lime) 40%,transparent);background:color-mix(in srgb,var(--mm-lime) 8%,transparent)}
.sv-status.warn{color:var(--mm-amber);border-color:color-mix(in srgb,var(--mm-amber) 40%,transparent);background:color-mix(in srgb,var(--mm-amber) 8%,transparent)}
.sv-result{display:flex;align-items:center;gap:8px;min-height:20px;font-size:12.5px;margin-top:10px;color:var(--mm-fg-2)}
.sv-result:empty{display:none}
.sv-result.ok{color:var(--mm-lime)}.sv-result.err{color:var(--mm-red)}
.sv-result .mm-icon{width:15px;height:15px}
.sv-note{display:flex;gap:10px;align-items:flex-start;padding:12px 14px;margin:6px 0 14px;border-radius:12px;background:rgba(255,255,255,.03);border:1px solid var(--mm-border);color:var(--mm-fg-2);font-size:12.5px;line-height:1.5}
.sv-note .mm-icon{color:var(--mm-accent);margin-top:1px}
.sv-tags{display:flex;flex-direction:column;gap:6px;width:100%}
.sv-tag{display:grid;grid-template-columns:auto minmax(0,1fr) auto auto;align-items:center;gap:10px;padding:6px 8px 6px 6px;border-radius:12px;background:rgba(255,255,255,.025);border:1px solid var(--mm-border)}
.sv-tag:focus-within{border-color:color-mix(in srgb,var(--c) 50%,transparent);box-shadow:0 0 16px color-mix(in srgb,var(--c) 14%,transparent)}
.sv-swatch{position:relative;width:30px;height:30px;border-radius:9px;overflow:hidden;cursor:pointer;background:var(--c);box-shadow:0 0 12px color-mix(in srgb,var(--c) 45%,transparent),inset 0 0 0 1px rgba(255,255,255,.18)}
.sv-swatch input{position:absolute;inset:-6px;width:calc(100% + 12px);height:calc(100% + 12px);opacity:0;cursor:pointer;border:0;padding:0}
.sv-swatch:focus-within{outline:2px solid var(--mm-accent);outline-offset:2px}
.sv-tag .mm-input{height:34px;background:transparent;border-color:transparent}
.sv-tag .mm-input:hover{border-color:var(--mm-border-strong)}
.sv-tag .mm-input:focus{background:rgba(0,0,0,.28);border-color:var(--mm-accent)}
.sv-tag .def{font:700 10px/1 var(--mm-font);letter-spacing:.06em;text-transform:uppercase;color:var(--c);padding:4px 7px;border-radius:6px;background:color-mix(in srgb,var(--c) 12%,transparent)}
.sv-tag-actions{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:4px;flex-wrap:wrap}
.sv-accents{display:flex;gap:12px;flex-wrap:wrap}
.sv-accent{display:flex;flex-direction:column;align-items:center;gap:7px;border:0;background:none;padding:4px;border-radius:12px;color:var(--mm-fg-2);font:600 11.5px/1 var(--mm-font);cursor:pointer;text-transform:capitalize}
.sv-accent i{width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,var(--a),var(--b));box-shadow:0 0 14px color-mix(in srgb,var(--a) 40%,transparent);display:grid;place-items:center;transition:transform .15s var(--mm-ease),box-shadow .15s}
.sv-accent i .mm-icon{color:#06080D;opacity:0;width:18px;height:18px;stroke-width:3}
.sv-accent:hover i{transform:scale(1.06)}
.sv-accent[aria-checked="true"]{color:var(--mm-heading)}
.sv-accent[aria-checked="true"] i{box-shadow:0 0 0 2px var(--mm-bg),0 0 0 4px var(--a),0 0 22px color-mix(in srgb,var(--a) 60%,transparent)}
.sv-accent[aria-checked="true"] i .mm-icon{opacity:1}
.sv-preview{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:12px}
.sv-keys{list-style:none;margin:0;padding:0;display:flex;flex-direction:column}
.sv-keys li{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 0;border-top:1px solid var(--mm-border);font-size:13px}
.sv-keys li:first-child{border-top:0}
.sv-keys kbd+kbd{margin-left:4px}
.sv-keys .unset{color:var(--mm-muted);font-size:12px;font-style:italic}
.sv-stores{width:100%;border-collapse:collapse;font-size:13px}
.sv-stores td{padding:10px 0;border-top:1px solid var(--mm-border);vertical-align:middle}
.sv-stores tr:first-child td{border-top:0}
.sv-stores td.n{text-align:right;padding:0 16px;font:600 12.5px/1 var(--mm-mono);color:var(--mm-fg-2);white-space:nowrap}
.sv-stores td.a{text-align:right;width:1%}
.sv-stores b{display:block;color:var(--mm-heading);font-weight:600}
.sv-stores small{color:var(--mm-muted);font-size:12px}
.sv-bar{height:8px;border-radius:99px;background:rgba(255,255,255,.06);overflow:hidden;width:260px}
.sv-bar i{display:block;height:100%;background:var(--mm-gradient);box-shadow:0 0 10px var(--mm-accent);border-radius:99px;min-width:3px}
.sv-seg{display:inline-flex;gap:2px;padding:3px;border-radius:10px;background:rgba(0,0,0,.3);border:1px solid var(--mm-border)}
.sv-seg label{position:relative}
.sv-seg input{position:absolute;opacity:0;pointer-events:none}
.sv-seg span{display:block;font:600 12px/1 var(--mm-font);color:var(--mm-muted);border-radius:7px;padding:7px 11px;cursor:pointer}
.sv-seg input:checked+span{color:var(--mm-heading);background:rgba(255,255,255,.09);box-shadow:inset 0 0 0 1px var(--mm-border-strong)}
.sv-seg input:focus-visible+span{outline:2px solid var(--mm-accent);outline-offset:1px}
.sv-about{display:flex;gap:18px;align-items:center;padding:6px 0 16px}
.sv-about img{width:64px;height:64px;border-radius:18px;box-shadow:0 0 30px rgba(34,211,238,.28)}
.sv-about h2{font-size:20px}
.sv-about p{margin:4px 0 0;color:var(--mm-fg-2)}
.sv-about .by{margin-top:8px;font-size:13px;color:var(--mm-fg-2)}
.sv-about .by b{font-weight:700}
.sv-welcome{grid-column:1/-1;position:relative;display:flex;gap:18px;align-items:center;padding:20px 22px;border-color:color-mix(in srgb,var(--mm-accent) 40%,transparent);box-shadow:0 0 34px color-mix(in srgb,var(--mm-accent) 14%,transparent);background:linear-gradient(120deg,color-mix(in srgb,var(--mm-accent) 10%,transparent),color-mix(in srgb,var(--mm-accent-2) 8%,transparent)),var(--mm-glass)}
.sv-welcome img{width:54px;height:54px;border-radius:15px;flex:none}
.sv-welcome h2{font-size:18px}
.sv-welcome ol{margin:8px 0 0;padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:6px 16px;color:var(--mm-fg-2);font-size:13px;counter-reset:s}
.sv-welcome li{counter-increment:s;display:flex;align-items:center;gap:7px}
.sv-welcome li::before{content:counter(s);width:20px;height:20px;border-radius:50%;display:grid;place-items:center;font:700 11px/1 var(--mm-font);color:#06080D;background:var(--mm-gradient)}
.sv-welcome .x{position:absolute;top:10px;right:10px}
.sv-welcome .go{margin-left:auto;margin-right:30px}
.sv-saved{position:fixed;top:16px;right:22px;z-index:50;display:inline-flex;align-items:center;gap:7px;padding:7px 12px 7px 10px;border-radius:99px;font:600 12px/1 var(--mm-font);color:var(--mm-fg);background:var(--mm-glass-strong);border:1px solid var(--mm-border-strong);backdrop-filter:var(--mm-blur);box-shadow:var(--mm-shadow);opacity:0;transform:translateY(-6px);transition:opacity .2s,transform .2s var(--mm-ease);pointer-events:none}
.sv-saved.show{opacity:1;transform:none}
.sv-saved .mm-icon{width:14px;height:14px;color:var(--mm-lime)}
.sv-saved.err{color:var(--mm-red);border-color:color-mix(in srgb,var(--mm-red) 40%,transparent)}
.sv-saved.err .mm-icon{color:var(--mm-red)}
.sv-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.sv a.ext{display:inline-flex;align-items:center;gap:4px}
.sv a.ext .mm-icon{width:13px;height:13px}
@media (max-width:1100px){.sv{grid-template-columns:minmax(0,1fr)}.sv-nav{display:none}}
@media (max-width:640px){.sv-field{grid-template-columns:1fr}.sv-fc{justify-content:flex-start}.sv-range,.sv-bar,.sv-fc .mm-select{width:100%}.sv-welcome{flex-direction:column;align-items:flex-start}.sv-welcome .go{margin:0}}
`

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue
    if (k === 'text') e.textContent = v
    else if (k === 'html') e.innerHTML = v // static icon markup only
    else if (k === 'class') e.className = v
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v)
    else e.setAttribute(k, v === true ? '' : v)
  }
  for (const c of children.flat()) if (c != null && c !== false) e.append(c)
  return e
}

const fmtBytes = b => {
  if (!Number.isFinite(b)) return '—'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++ }
  return `${b.toFixed(b < 10 && i ? 1 : 0)} ${u[i]}`
}
const HEX = /^#[0-9a-f]{6}$/i
let uidSeq = 0
const fid = p => `sv-${p}-${++uidSeq}`

/** Validate + sanitize an imported settings object against DEFAULT_SETTINGS. Unknown keys and bad types are dropped. */
export function sanitizeSettings(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const out = {}
  const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : undefined)
  const pick = (k, v) => { if (v !== undefined) out[k] = v }
  if (MODELS.some(m => m.id === raw.model)) out.model = raw.model
  if (EFFORTS.some(e => e.id === raw.effort)) out.effort = raw.effort
  for (const k of ['autoBrief', 'autoJargon', 'showSelectionMenu']) if (typeof raw[k] === 'boolean') out[k] = raw[k]
  pick('autoBriefMinWords', num(raw.autoBriefMinWords, 0, 20000))
  if (BRIEF_MODES.some(m => m.id === raw.briefMode)) out.briefMode = raw.briefMode
  if (Array.isArray(raw.tags)) {
    const seen = new Set()
    const tags = raw.tags.filter(t => t && typeof t.id === 'string' && t.id && typeof t.name === 'string' && HEX.test(t.color) && !seen.has(t.id) && seen.add(t.id))
      .slice(0, MAX_TAGS).map(t => ({ id: t.id.slice(0, 40), name: t.name.trim().slice(0, 40) || t.id, color: t.color.toUpperCase() }))
    if (tags.length) out.tags = tags
  }
  if (typeof raw.defaultTag === 'string') out.defaultTag = raw.defaultTag
  if (out.tags && !out.tags.some(t => t.id === out.defaultTag)) out.defaultTag = out.tags[0].id
  if (raw.reader && typeof raw.reader === 'object') {
    const r = {}
    if (READER_FONTS.some(f => f[0] === raw.reader.font)) r.font = raw.reader.font
    if (READER_THEMES.some(t => t[0] === raw.reader.theme)) r.theme = raw.reader.theme
    if (num(raw.reader.size, 14, 28) !== undefined) r.size = num(raw.reader.size, 14, 28)
    if (num(raw.reader.lineHeight, 1.3, 2.2) !== undefined) r.lineHeight = num(raw.reader.lineHeight, 1.3, 2.2)
    if (num(raw.reader.width, 520, 960) !== undefined) r.width = num(raw.reader.width, 520, 960)
    out.reader = { ...DEFAULT_SETTINGS.reader, ...r }
  }
  pick('bionicStrength', num(raw.bionicStrength, 0.1, 0.9))
  pick('ttsRate', num(raw.ttsRate, 0.5, 3))
  if (typeof raw.ttsVoice === 'string') out.ttsVoice = raw.ttsVoice.slice(0, 200)
  if (typeof raw.translateTo === 'string' && raw.translateTo.trim()) out.translateTo = raw.translateTo.trim().slice(0, 40)
  if (typeof raw.webhookUrl === 'string' && (raw.webhookUrl === '' || validWebhook(raw.webhookUrl))) out.webhookUrl = raw.webhookUrl
  if (ACCENTS[raw.accent]) out.accent = raw.accent
  pick('factCheckSearches', num(raw.factCheckSearches, 1, 10) !== undefined ? Math.round(num(raw.factCheckSearches, 1, 10)) : undefined)
  return out
}

function validWebhook(u) {
  try {
    const url = new URL(u)
    return url.protocol === 'https:' || (url.protocol === 'http:' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname))
  } catch { return false }
}

/** Parse + validate a backup file. Returns {settings, stores: {name: records}, counts, skipped} or throws a friendly Error. */
export function parseBackup(text) {
  let data
  try { data = JSON.parse(text) } catch { throw new Error('This file isn’t valid JSON.') }
  if (!data || typeof data !== 'object' || data.app !== 'master-mind') throw new Error('This isn’t a Master Mind backup (missing "app": "master-mind").')
  if (data.format !== undefined && data.format !== 1) throw new Error(`Unsupported backup format ${data.format}. Update Master Mind and try again.`)
  const stores = {}
  const counts = {}
  let skipped = 0
  const src = data.stores && typeof data.stores === 'object' ? data.stores : {}
  for (const s of STORES) {
    if (!(s.id in src)) continue
    if (!Array.isArray(src[s.id])) throw new Error(`"${s.id}" must be a list of records.`)
    const ok = []
    const seen = new Set()
    const now = Date.now()
    for (const r of src[s.id]) {
      const key = r && typeof r === 'object' && !Array.isArray(r) ? r[s.key] : undefined
      const rec = typeof key === 'string' && key && key.length <= (s.id === 'pages' ? MAX_URL : MAX_ID) && !seen.has(key) ? cleanRecord(s.id, r, now) : null
      if (!rec) { skipped++; continue }
      seen.add(key)
      ok.push(rec)
    }
    stores[s.id] = ok
    counts[s.id] = ok.length
  }
  const settings = data.settings === undefined ? null : sanitizeSettings(data.settings)
  if (data.settings !== undefined && !settings) throw new Error('The settings in this backup are malformed.')
  if (!Object.keys(stores).length && !settings) throw new Error('This backup contains no data.')
  return { settings, stores, counts, skipped }
}

// ── backup record normalization ──
// A backup is untrusted input: every record is rebuilt field by field to the shape the live writers produce
// (bg/highlights.js clean(), the notes workspace, the Brief tab, bg/history.js), so a hand-edited or hostile file
// can't plant values the views don't expect (a string where a list belongs, a missing title) or URLs that
// aren't web pages (file:, data:, chrome:, javascript:). Unknown fields are dropped.
const MAX_URL = 4096
const MAX_ID = 200
const MAX_NOTE_BODY = 20 * 1024 * 1024 // notes may embed a few data-URL images (≤ 1.5 MB each)
const HL_CONTEXT = 48 // highlight prefix/suffix length (same as bg/highlights.js)
const txt = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '')
const when = v => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0)
const count = v => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : 0)
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v)

/** The URL itself when it is an absolute http(s) URL, else ''. */
function webUrl(v) {
  if (typeof v !== 'string' || !v || v.length > MAX_URL) return ''
  try {
    const { protocol } = new URL(v)
    return protocol === 'http:' || protocol === 'https:' ? v : ''
  } catch { return '' }
}

/** De-duplicated, trimmed, non-empty strings (other entries dropped); `[]` for anything that isn't a list. */
function strList(v, max, len) {
  if (!Array.isArray(v)) return []
  const out = new Set()
  for (const x of v) {
    if (out.size >= max) break
    const s = typeof x === 'string' ? x.replace(/\s+/g, ' ').trim().slice(0, len) : ''
    if (s) out.add(s)
  }
  return [...out]
}

/** Note tags, normalized like the workspace's tag input (no leading #, no spaces, ≤ 40 chars, case-insensitive unique). */
function noteTags(v) {
  const out = []
  for (const t of strList(v, 100, 200)) {
    const tag = t.replace(/^#+/, '').replace(/\s+/g, '-').slice(0, 40)
    if (tag && !out.some(x => x.toLowerCase() === tag.toLowerCase())) out.push(tag)
  }
  return out
}

/** Note sources: http(s) URLs only, unique, `{url, title}`. */
function noteSources(v) {
  if (!Array.isArray(v)) return []
  const out = []
  for (const s of v) {
    const url = isObj(s) ? webUrl(s.url) : ''
    if (!url || out.some(x => x.url === url)) continue
    out.push({ url, title: txt(s.title, 300).trim() })
    if (out.length >= 200) break
  }
  return out
}

function entityList(v, max = 80) {
  if (!Array.isArray(v)) return []
  const out = []
  for (const e of v) {
    const name = (typeof e === 'string' ? e : isObj(e) ? txt(e.name, 200) : '').replace(/\s+/g, ' ').trim().slice(0, 120)
    if (!name) continue
    out.push({ name, type: (isObj(e) && txt(e.type, 40).trim()) || 'other' })
    if (out.length >= max) break
  }
  return out
}

/** A stored brief ({mode, summary, takeaways, topics, contentType, at, words?, entities?}) or null. */
function cleanBrief(b, withEntities) {
  if (!isObj(b) || typeof b.summary !== 'string') return null
  const out = { mode: txt(b.mode, 40), summary: b.summary.slice(0, 50000), takeaways: strList(b.takeaways, 12, 2000), topics: strList(b.topics, 20, 120), contentType: txt(b.contentType, 60), at: when(b.at) }
  if (count(b.words)) out.words = count(b.words)
  if (withEntities && Array.isArray(b.entities)) out.entities = entityList(b.entities)
  return out
}

/** Rebuild one backup record for `store`, or return null when it can't be imported safely. */
function cleanRecord(store, r, now = Date.now()) {
  if (!isObj(r)) return null
  switch (store) {
    case 'highlights': {
      const url = webUrl(r.url)
      const pageKey = normalizeUrl(webUrl(r.pageKey) || url)
      const text = txt(r.text, 20000)
      if (!/^https?:/i.test(pageKey) || !text.trim()) return null
      const page = url || pageKey
      const created = when(r.created) || now
      return {
        id: r.id, pageKey, url: page,
        title: txt(r.title, 500).trim() || siteOf(page) || 'Untitled page',
        site: txt(r.site, 255).trim() || siteOf(page),
        text, prefix: txt(r.prefix, 400).slice(-HL_CONTEXT), suffix: txt(r.suffix, 400).slice(0, HL_CONTEXT),
        tag: txt(r.tag, 80) || 'fact', note: txt(r.note, 10000),
        created, updated: when(r.updated) || created,
      }
    }
    case 'notes': {
      if ((r.title != null && typeof r.title !== 'string') || (r.body != null && typeof r.body !== 'string')) return null
      const body = r.body || ''
      if (body.length > MAX_NOTE_BODY) return null
      const created = when(r.created) || now
      return { id: r.id, title: txt(r.title, 200), body, tags: noteTags(r.tags), sources: noteSources(r.sources), created, updated: when(r.updated) || created, pinned: r.pinned === true }
    }
    case 'pages': {
      if (!webUrl(r.key)) return null // the key is the page's normalized URL
      const url = webUrl(r.url) || r.key
      const out = {
        key: r.key, url, title: txt(r.title, 500), site: txt(r.site, 255).trim() || siteOf(url),
        visited: when(r.visited), wordCount: count(r.wordCount), readingMin: count(r.readingMin),
        entities: entityList(r.entities), topics: strList(r.topics, 40, 120), keywords: strList(r.keywords, 60, 80),
      }
      const brief = cleanBrief(r.brief, false)
      if (brief) out.brief = brief
      if (isObj(r.briefs)) {
        const briefs = {}
        for (const [mode, b] of Object.entries(r.briefs).slice(0, 12)) {
          const c = /^[a-z][a-z0-9_-]{0,29}$/i.test(mode) ? cleanBrief(b, true) : null
          if (c) briefs[mode] = c
        }
        if (Object.keys(briefs).length) out.briefs = briefs
      }
      return out
    }
    case 'history': {
      const url = webUrl(r.url)
      const ts = when(r.ts)
      if (!url || !ts) return null
      return {
        id: r.id, tabId: Number.isSafeInteger(r.tabId) ? r.tabId : -1, url, title: txt(r.title, 500),
        parentId: typeof r.parentId === 'string' && r.parentId && r.parentId.length <= MAX_ID ? r.parentId : null,
        ts, transition: txt(r.transition, 40) || 'link',
      }
    }
    case 'kv': {
      if (!('v' in r)) return null
      if (r.k !== 'graph-layout') return { k: r.k, v: r.v }
      // Knowledge-graph positions: {nodes: {id: [x, y, pinned]}}; anything else is dropped.
      const nodes = {}
      for (const [id, p] of Object.entries(isObj(r.v?.nodes) ? r.v.nodes : {})) {
        if (Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]) && id.length <= MAX_URL + 10) nodes[id] = [p[0], p[1], p[2] ? 1 : 0]
      }
      return { k: r.k, v: { version: 1, saved: when(r.v?.saved) || now, nodes } }
    }
    default: return null
  }
}

export function mount(root, ctx) {
  let settings = { ...DEFAULT_SETTINGS }
  let alive = true
  const timers = new Set()
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn() }, ms); timers.add(t); return t }
  const cleanups = []
  const sync = [] // functions that refresh controls from `settings` (external changes)

  // ── saved indicator ──
  const saved = el('div', { class: 'sv-saved', role: 'status', 'aria-live': 'polite' })
  let savedTimer = 0
  function flash(ok = true, msg) {
    saved.classList.toggle('err', !ok)
    saved.innerHTML = ok ? ICON.check : ICON.x
    saved.append(msg || (ok ? 'Saved' : 'Couldn’t save'))
    saved.classList.add('show')
    clearTimeout(savedTimer)
    savedTimer = later(() => saved.classList.remove('show'), ok ? 1500 : 4000)
  }

  // Writes are serialized so quick successive edits can't overwrite each other.
  let chain = Promise.resolve()
  function save(patch) {
    Object.assign(settings, patch)
    chain = chain.then(() => setSettings(patch)).then(() => { if (alive) flash(true) }, e => { if (alive) flash(false, `Couldn’t save: ${e?.message || e}`) })
    return chain
  }
  const debounced = new Map()
  function saveSoon(key, patchFn, ms = 450) {
    clearTimeout(debounced.get(key)?.t)
    const entry = { fn: patchFn, t: later(() => { debounced.delete(key); save(patchFn()) }, ms) }
    debounced.set(key, entry)
  }
  function flushSoon(key) {
    const d = debounced.get(key)
    if (!d) return
    clearTimeout(d.t)
    timers.delete(d.t)
    debounced.delete(key)
    save(d.fn())
  }

  // ── layout ──
  const nav = el('nav', { class: 'sv-nav', 'aria-label': 'Settings sections' })
  const main = el('div', { class: 'sv-main' })
  const head = el('div', { class: 'view-head sv-head' }, el('div', {}, el('h1', { text: 'Settings' }), el('p', { class: 'mm-muted', style: 'margin:5px 0 0', text: 'Changes save automatically and apply everywhere Master Mind runs.' })))
  const wrap = el('div', { class: 'sv' }, head, nav, main)
  root.replaceChildren(el('style', { text: STYLES }), wrap, saved)

  function section(id, title, desc, ...content) {
    const meta = SECTIONS.find(s => s[0] === id)
    const s = el('section', { class: 'sv-sec mm-card', id: `sv-${id}`, 'aria-labelledby': `sv-${id}-h` },
      el('header', {}, el('span', { class: 'ic', html: svg(meta[2]) }), el('div', {}, el('h2', { id: `sv-${id}-h`, text: title }), desc ? el('p', { text: desc }) : null)),
      ...content)
    return s
  }

  function field(label, hint, control, { id, stack = false } = {}) {
    const lid = fid('l')
    const lbl = id ? el('label', { class: 'lbl', for: id, id: lid, text: label }) : el('span', { class: 'lbl', id: lid, text: label })
    return el('div', { class: `sv-field${stack ? ' stack' : ''}` }, el('div', { class: 'sv-fl' }, lbl, hint ? el('p', { class: 'sv-hint', text: hint }) : null), el('div', { class: 'sv-fc' }, control))
  }

  function switchField(label, hint, get, set) {
    const input = el('input', { type: 'checkbox', role: 'switch' })
    const lid = fid('l')
    input.setAttribute('aria-labelledby', lid)
    input.addEventListener('change', () => set(input.checked))
    sync.push(() => { input.checked = !!get() })
    const f = field(label, hint, el('label', { class: 'mm-switch' }, input, el('span')))
    f.querySelector('.lbl').id = lid
    return f
  }

  function selectField(label, hint, options, get, set) {
    const id = fid('s')
    const sel = el('select', { class: 'mm-select', id }, ...options.map(([v, t]) => el('option', { value: v, text: t })))
    sel.addEventListener('change', () => set(sel.value))
    sync.push(() => { if (document.activeElement !== sel) sel.value = String(get()) })
    return field(label, hint, sel, { id })
  }

  function rangeField(label, hint, { min, max, step, fmt }, get, set) {
    const id = fid('r')
    const input = el('input', { type: 'range', class: 'mm-range', id, min: String(min), max: String(max), step: String(step) })
    const out = el('output', { for: id })
    const show = () => { out.textContent = fmt(Number(input.value)); input.setAttribute('aria-valuetext', out.textContent) }
    input.addEventListener('input', () => { show(); saveSoon(id, () => set(Number(input.value)), 250) })
    input.addEventListener('change', () => flushSoon(id))
    sync.push(() => { if (document.activeElement !== input) { input.value = String(get()); show() } })
    return field(label, hint, el('div', { class: 'sv-range' }, input, out), { id })
  }

  // ───────── Claude API ─────────
  const keyInput = el('input', { class: 'mm-input', id: 'sv-key', type: 'password', placeholder: 'sk-ant-…', autocomplete: 'off', spellcheck: 'false', 'aria-describedby': 'sv-key-hint' })
  const eye = el('button', { type: 'button', class: 'mm-btn ghost icon sm', 'aria-label': 'Show API key', 'aria-pressed': 'false', 'aria-controls': 'sv-key', html: ICON.eye })
  const saveKeyBtn = el('button', { type: 'button', class: 'mm-btn primary', text: 'Save key' })
  const testBtn = el('button', { type: 'button', class: 'mm-btn', html: ICON.bolt }, 'Test')
  const removeKeyBtn = el('button', { type: 'button', class: 'mm-btn ghost', text: 'Remove' })
  const keyStatus = el('span', { class: 'sv-status' })
  const keyResult = el('div', { class: 'sv-result', role: 'status', 'aria-live': 'polite' })
  let storedKey = ''
  const modelSel = el('select', { class: 'mm-select', id: 'sv-model' }, ...MODELS.map(m => el('option', { value: m.id, text: m.label })))
  const effortSel = el('select', { class: 'mm-select', id: 'sv-effort' }, ...EFFORTS.map(e => el('option', { value: e.id, text: e.label })))
  const effortHint = el('p', { class: 'sv-hint' })

  function renderKeyState() {
    const has = !!storedKey
    keyStatus.className = `sv-status ${has ? 'ok' : 'warn'}`
    keyStatus.innerHTML = has ? ICON.check : ICON.x
    keyStatus.append(has ? 'Key saved' : 'No key yet')
    removeKeyBtn.hidden = !has
    saveKeyBtn.disabled = keyInput.value.trim() === storedKey
  }
  function setResult(kind, text) {
    keyResult.className = `sv-result${kind ? ` ${kind}` : ''}`
    keyResult.replaceChildren()
    if (kind === 'busy') keyResult.append(el('span', { class: 'mm-spinner' }))
    else if (kind === 'ok') keyResult.insertAdjacentHTML('beforeend', ICON.check)
    else if (kind === 'err') keyResult.insertAdjacentHTML('beforeend', ICON.x)
    if (text) keyResult.append(el('span', { text }))
  }
  eye.addEventListener('click', () => {
    const show = keyInput.type === 'password'
    keyInput.type = show ? 'text' : 'password'
    eye.innerHTML = show ? ICON.eyeOff : ICON.eye
    eye.setAttribute('aria-pressed', String(show))
    eye.setAttribute('aria-label', show ? 'Hide API key' : 'Show API key')
  })
  keyInput.addEventListener('input', () => { renderKeyState(); setResult('', '') })
  keyInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveKey() } })
  saveKeyBtn.addEventListener('click', saveKey)
  async function saveKey() {
    const v = keyInput.value.trim()
    if (v === storedKey) return
    if (v && !/^sk-ant-/.test(v)) setResult('err', 'Saved, but this doesn’t look like a Claude API key (they start with “sk-ant-”).')
    try {
      await setApiKey(v)
      storedKey = v
      keyInput.value = v
      renderKeyState()
      flash(true, v ? 'API key saved' : 'API key removed')
      if (v && /^sk-ant-/.test(v)) setResult('', '')
    } catch (e) { flash(false, `Couldn’t save the key: ${e?.message || e}`) }
  }
  removeKeyBtn.addEventListener('click', async () => {
    const ok = await confirmDialog({ title: 'Remove your API key?', body: 'AI features (briefs, Q&A, fact-checks, translation) stop working until you add a key again. Your saved data is not affected.', confirm: 'Remove key', danger: true })
    if (!ok || !alive) return
    keyInput.value = ''
    await saveKey()
    setResult('', '')
  })
  testBtn.addEventListener('click', async () => {
    const v = keyInput.value.trim()
    if (!v && !storedKey) { setResult('err', 'Paste your API key first.'); keyInput.focus(); return }
    testBtn.disabled = true
    setResult('busy', 'Testing the connection…')
    const model = MODELS.find(m => m.id === settings.model)?.label.split(' · ')[0] || settings.model
    try {
      const res = await testKey(v || undefined)
      if (!alive) return
      if (res.ok) setResult('ok', `Connected. ${model} is ready${v !== storedKey ? ' (remember to save this key)' : ''}.`)
      else setResult('err', res.error || 'The key didn’t work.')
    } catch (e) {
      setResult('err', e?.message || String(e))
    } finally {
      testBtn.disabled = false
    }
  })
  function renderEffort() {
    const haiku = modelSel.value === 'claude-haiku-4-5'
    effortSel.disabled = haiku
    effortHint.textContent = haiku ? 'Claude Haiku 4.5 doesn’t use effort levels; it always answers at full speed.' : 'Higher effort thinks longer for harder pages and costs more tokens. Low suits everyday briefs and Q&A.'
  }
  modelSel.addEventListener('change', () => { renderEffort(); save({ model: modelSel.value }) })
  effortSel.addEventListener('change', () => save({ effort: effortSel.value }))
  sync.push(() => { modelSel.value = settings.model; effortSel.value = settings.effort; renderEffort() })

  const apiSec = section('api', 'Claude API', 'Master Mind talks to Claude directly from your browser with your own key.',
    el('div', { class: 'sv-field stack' },
      el('div', { class: 'sv-fl mm-row between' }, el('label', { class: 'lbl', for: 'sv-key', text: 'API key' }), keyStatus),
      el('p', { class: 'sv-hint', id: 'sv-key-hint' }, 'Create one in the ', el('a', { class: 'ext', href: 'https://console.anthropic.com/settings/keys', target: '_blank', rel: 'noopener noreferrer', html: ICON.ext }, 'Claude Console'), '. It starts with “sk-ant-”.'),
      el('div', { class: 'sv-key' }, el('div', { class: 'pw' }, keyInput, eye), saveKeyBtn, testBtn, removeKeyBtn),
      keyResult),
    field('Model', 'Opus is the most capable; Sonnet is faster; Haiku is the quickest and cheapest.', modelSel, { id: 'sv-model' }),
    (() => { const f = field('Effort', null, effortSel, { id: 'sv-effort' }); f.querySelector('.sv-fl').append(effortHint); return f })(),
    el('div', { class: 'sv-note', html: ICON.lock }, el('span', { text: 'Your key is stored only on this device (never synced) and is sent only to api.anthropic.com. When you use an AI feature, the page text goes straight from your browser to Anthropic. Master Mind has no servers and collects nothing.' })))

  // ───────── Briefing ─────────
  const briefSec = section('brief', 'Briefing', 'What happens when you open the side panel on an article.',
    switchField('Auto-brief long pages', 'Generate a brief automatically when the side panel opens on a page.', () => settings.autoBrief, v => save({ autoBrief: v })),
    rangeField('Minimum length for auto-brief', 'Shorter pages wait until you ask.', { min: 100, max: 3000, step: 50, fmt: v => `${v} words` }, () => settings.autoBriefMinWords, v => ({ autoBriefMinWords: v })),
    selectField('Default brief mode', 'You can switch modes in the Brief tab at any time.', BRIEF_MODES.map(m => [m.id, m.label]), () => settings.briefMode, v => save({ briefMode: v })),
    switchField('Explain jargon automatically', 'Underline technical terms with plain-language definitions after each brief.', () => settings.autoJargon, v => save({ autoJargon: v })))

  // ───────── Highlights ─────────
  const tagList = el('div', { class: 'sv-tags', role: 'list', 'aria-label': 'Highlight tags' })
  const addTagBtn = el('button', { type: 'button', class: 'mm-btn sm', html: ICON.plus }, 'Add tag')
  const defaultSel = el('select', { class: 'mm-select', id: 'sv-deftag' })
  const tagCount = el('span', { class: 'mm-small mm-muted' })

  const tags = () => (Array.isArray(settings.tags) && settings.tags.length ? settings.tags : DEFAULT_TAGS)
  function renderTags() {
    const list = tags()
    tagList.replaceChildren(...list.map((t, i) => tagRow(t, i, list.length)))
    defaultSel.replaceChildren(...list.map(t => el('option', { value: t.id, text: t.name })))
    defaultSel.value = list.some(t => t.id === settings.defaultTag) ? settings.defaultTag : list[0].id
    addTagBtn.disabled = list.length >= MAX_TAGS
    tagCount.textContent = list.length >= MAX_TAGS ? `Up to ${MAX_TAGS} tags` : `${list.length} of ${MAX_TAGS} tags`
  }
  function tagRow(t, i, n) {
    const nameId = fid('tag')
    const name = el('input', { class: 'mm-input', id: nameId, value: t.name, maxlength: '40', 'aria-label': `Tag ${i + 1} name`, 'data-tag': t.id })
    const color = el('input', { type: 'color', value: t.color, 'aria-label': `Color for ${t.name}` })
    const swatch = el('label', { class: 'sv-swatch', title: 'Change color' }, color)
    const del = el('button', { type: 'button', class: 'mm-btn ghost icon sm', 'aria-label': `Delete tag ${t.name}`, title: n <= 1 ? 'Keep at least one tag' : 'Delete tag', html: ICON.trash, disabled: n <= 1 })
    const row = el('div', { class: 'sv-tag', role: 'listitem', style: `--c:${t.color}`, 'data-tag': t.id }, swatch, name,
      t.id === settings.defaultTag ? el('span', { class: 'def', text: 'Default' }) : el('span'), del)
    const key = `tag-name-${t.id}`
    const commitName = () => {
      const v = name.value.trim()
      if (!v) return null
      return { tags: tags().map(x => (x.id === t.id ? { ...x, name: v } : x)) }
    }
    name.addEventListener('input', () => {
      if (!name.value.trim()) return
      saveSoon(key, () => commitName() || {}, 500)
    })
    name.addEventListener('blur', () => {
      if (!name.value.trim()) { name.value = tags().find(x => x.id === t.id)?.name || t.name; return }
      flushSoon(key)
      renderDefaultOptions()
    })
    name.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); name.blur() } })
    color.addEventListener('input', () => {
      const c = color.value.toUpperCase()
      row.style.setProperty('--c', c)
      saveSoon(`tag-color-${t.id}`, () => ({ tags: tags().map(x => (x.id === t.id ? { ...x, color: c } : x)) }), 300)
    })
    color.addEventListener('change', () => flushSoon(`tag-color-${t.id}`))
    del.addEventListener('click', () => deleteTag(t))
    return row
  }
  function renderDefaultOptions() {
    const v = defaultSel.value
    defaultSel.replaceChildren(...tags().map(t => el('option', { value: t.id, text: t.name })))
    defaultSel.value = tags().some(t => t.id === v) ? v : tags()[0].id
  }
  addTagBtn.addEventListener('click', async () => {
    const list = tags()
    if (list.length >= MAX_TAGS) return
    const used = new Set(list.map(t => t.color.toUpperCase()))
    const color = TAG_COLORS.find(c => !used.has(c)) || TAG_COLORS[list.length % TAG_COLORS.length]
    let n = list.length + 1
    while (list.some(t => t.name === `New tag ${n}`)) n++
    const tag = { id: `tag-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, name: `New tag ${n}`, color }
    await save({ tags: [...list, tag] })
    renderTags()
    const input = tagList.querySelector(`input[data-tag="${tag.id}"]`)
    input?.focus()
    input?.select()
  })
  async function deleteTag(t) {
    const list = tags()
    if (list.length <= 1) return
    const rest = list.filter(x => x.id !== t.id)
    const nextDefault = rest.some(x => x.id === settings.defaultTag) ? settings.defaultTag : rest[0].id
    const fallback = rest.find(x => x.id === nextDefault)
    let used = []
    try { used = await ctx.db.by('highlights', 'tag', t.id) } catch { used = [] }
    if (used.length) {
      const ok = await confirmDialog({
        title: `Delete “${t.name}”?`,
        body: `${used.length} highlight${used.length === 1 ? ' uses' : 's use'} this tag. ${used.length === 1 ? 'It' : 'They'} will move to “${fallback.name}”.`,
        confirm: 'Delete tag', danger: true,
      })
      if (!ok || !alive) return
    }
    await save({ tags: rest, defaultTag: nextDefault })
    renderTags()
    // Re-tag through the background so pages showing these highlights update live.
    let failed = 0
    for (const h of used) {
      try {
        const res = await chrome.runtime.sendMessage({ type: 'HL_SAVE', highlight: { ...h, tag: fallback.id, updated: Date.now() } })
        if (!res?.ok) failed++
      } catch { failed++ }
    }
    ctx.toast(failed ? `Tag deleted. ${failed} highlight${failed === 1 ? '' : 's'} couldn’t be moved; they show in a neutral color.` : `Deleted “${t.name}”${used.length ? `; moved ${used.length} highlight${used.length === 1 ? '' : 's'} to “${fallback.name}”` : ''}`)
  }
  defaultSel.addEventListener('change', async () => { await save({ defaultTag: defaultSel.value }); renderTags() })
  sync.push(() => { if (!tagList.contains(document.activeElement)) renderTags() })

  const hlSec = section('highlights', 'Highlights', 'Tags color-code what you capture. Renaming keeps existing highlights in their tag.',
    el('div', { class: 'sv-field stack' }, tagList, el('div', { class: 'sv-tag-actions' }, addTagBtn, tagCount)),
    field('Default tag', 'Used by Alt+Shift+H and the right-click menu.', defaultSel, { id: 'sv-deftag' }),
    switchField('Selection menu', 'Show the floating highlight menu when you select text on a page.', () => settings.showSelectionMenu, v => save({ showSelectionMenu: v })))

  // ───────── Reading ─────────
  const reader = patch => save({ reader: { ...DEFAULT_SETTINGS.reader, ...settings.reader, ...patch } })
  const readSec = section('reading', 'Reading', 'Defaults for Focus Reading Mode, bionic reading, read-aloud and translation.',
    selectField('Reader font', null, READER_FONTS, () => settings.reader?.font || 'serif', v => reader({ font: v })),
    selectField('Reader theme', null, READER_THEMES, () => settings.reader?.theme || 'midnight', v => reader({ theme: v })),
    rangeField('Text size', null, { min: 14, max: 28, step: 1, fmt: v => `${v}px` }, () => settings.reader?.size ?? 19, v => ({ reader: { ...DEFAULT_SETTINGS.reader, ...settings.reader, size: v } })),
    rangeField('Line height', null, { min: 1.3, max: 2.2, step: 0.1, fmt: v => v.toFixed(1) }, () => settings.reader?.lineHeight ?? 1.7, v => ({ reader: { ...DEFAULT_SETTINGS.reader, ...settings.reader, lineHeight: Math.round(v * 10) / 10 } })),
    rangeField('Line width', null, { min: 520, max: 960, step: 20, fmt: v => `${v}px` }, () => settings.reader?.width ?? 720, v => ({ reader: { ...DEFAULT_SETTINGS.reader, ...settings.reader, width: v } })),
    rangeField('Bionic strength', 'How much of each word is bolded to guide your eyes.', { min: 0.1, max: 0.9, step: 0.05, fmt: v => `${Math.round(v * 100)}%` }, () => settings.bionicStrength, v => ({ bionicStrength: Math.round(v * 100) / 100 })),
    rangeField('Read-aloud speed', null, { min: 0.5, max: 3, step: 0.25, fmt: v => `${v.toFixed(2).replace(/0$/, '')}×` }, () => settings.ttsRate, v => ({ ttsRate: v })),
    selectField('Translate to', 'Target language for one-click translation in the reader.', LANGUAGES.map(l => [l, l]), () => settings.translateTo, v => save({ translateTo: v })))

  // ───────── Research ─────────
  const researchSec = section('research', 'Research', 'Fact-checking verifies claims with live web search.',
    rangeField('Fact-check searches', 'Maximum web searches per fact-check. More searches are more thorough but slower and cost more.', { min: 1, max: 10, step: 1, fmt: v => `${v} search${v === 1 ? '' : 'es'}` }, () => settings.factCheckSearches, v => ({ factCheckSearches: v })))

  // ───────── Notes ─────────
  const hookInput = el('input', { class: 'mm-input', id: 'sv-hook', type: 'url', inputmode: 'url', placeholder: 'https://hooks.example.com/notes', autocomplete: 'off', spellcheck: 'false', style: 'flex:1;min-width:0;height:38px' })
  const hookTest = el('button', { type: 'button', class: 'mm-btn', html: ICON.send }, 'Send test')
  const hookResult = el('div', { class: 'sv-result', role: 'status', 'aria-live': 'polite' })
  function hookState() {
    const v = hookInput.value.trim()
    const ok = !v || validWebhook(v)
    hookInput.setAttribute('aria-invalid', String(!ok))
    hookInput.style.borderColor = ok ? '' : 'var(--mm-red)'
    hookTest.disabled = !v || !ok
    return ok
  }
  function setHookResult(kind, text) {
    hookResult.className = `sv-result${kind ? ` ${kind}` : ''}`
    hookResult.replaceChildren()
    if (kind === 'busy') hookResult.append(el('span', { class: 'mm-spinner' }))
    else if (kind === 'ok') hookResult.insertAdjacentHTML('beforeend', ICON.check)
    else if (kind === 'err') hookResult.insertAdjacentHTML('beforeend', ICON.x)
    if (text) hookResult.append(el('span', { text }))
  }
  hookInput.addEventListener('input', () => {
    const ok = hookState()
    setHookResult(ok ? '' : 'err', ok ? '' : 'Use an https:// URL (http:// is allowed only for localhost).')
    if (ok) saveSoon('hook', () => ({ webhookUrl: hookInput.value.trim() }), 600)
  })
  hookInput.addEventListener('blur', () => flushSoon('hook'))
  hookTest.addEventListener('click', async () => {
    const url = hookInput.value.trim()
    if (!validWebhook(url)) return
    flushSoon('hook')
    hookTest.disabled = true
    setHookResult('busy', 'Sending a sample note…')
    const ctrl = new AbortController()
    const t = later(() => ctrl.abort(), 12000)
    try {
      // Exactly the shape Notes › Export › “Send to webhook” posts (lib/workspace.js sendWebhook), so field
      // mappings built from this sample in Zapier, Make or n8n keep working for every real note.
      const now = Date.now()
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Master Mind webhook test',
          body: 'If you can read this, notes you send from Master Mind will arrive here in this same format.',
          tags: ['test'], sources: [{ url: 'https://example.com/', title: 'Example source' }], created: now, updated: now,
        }),
        signal: ctrl.signal,
        credentials: 'omit',
      })
      if (!alive) return
      if (res.ok) setHookResult('ok', `Delivered (HTTP ${res.status}).`)
      else setHookResult('err', `The server answered HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''}.`)
    } catch (e) {
      if (!alive) return
      setHookResult('err', e?.name === 'AbortError' ? 'No answer within 12 seconds.' : `Couldn’t reach that URL: ${e?.message || e}`)
    } finally {
      clearTimeout(t)
      timers.delete(t)
      hookTest.disabled = false
      hookState()
    }
  })
  sync.push(() => { if (document.activeElement !== hookInput) { hookInput.value = settings.webhookUrl || ''; hookState() } })
  const notesSec = section('notes', 'Notes', 'Send notes to your own tools (Zapier, Make, n8n, a custom server).',
    el('div', { class: 'sv-field stack' },
      el('div', { class: 'sv-fl' }, el('label', { class: 'lbl', for: 'sv-hook', text: 'Webhook URL' }), el('p', { class: 'sv-hint', text: 'When you choose “Send to webhook” on a note, it is POSTed here as JSON: title, body (Markdown), tags, sources, created and updated. “Send test” posts a sample note in exactly that shape. Only the notes you send ever leave your browser.' })),
      el('div', { class: 'mm-row' }, hookInput, hookTest),
      hookResult))

  // ───────── Appearance ─────────
  const accentGroup = el('div', { class: 'sv-accents', role: 'radiogroup', 'aria-label': 'Accent color' })
  function renderAccents() {
    if (!accentGroup.children.length) {
      accentGroup.append(...Object.entries(ACCENTS).map(([name, [a, b]]) => el('button', {
        type: 'button', class: 'sv-accent', role: 'radio', 'data-accent': name, style: `--a:${a};--b:${b}`, onclick: () => pickAccent(name),
      }, el('i', { html: ICON.check }), name)))
    }
    // Update in place so the focused swatch keeps focus.
    for (const b of accentGroup.children) {
      const on = b.dataset.accent === settings.accent
      b.setAttribute('aria-checked', String(on))
      b.tabIndex = on ? 0 : -1
    }
  }
  function pickAccent(name, focus = false) {
    applyAccent(document.documentElement, name) // live, before the write round-trips
    save({ accent: name })
    renderAccents()
    if (focus) accentGroup.querySelector(`[data-accent="${name}"]`)?.focus()
  }
  accentGroup.addEventListener('keydown', e => {
    const names = Object.keys(ACCENTS)
    const i = names.indexOf(settings.accent)
    let j = null
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % names.length
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + names.length) % names.length
    else if (e.key === 'Home') j = 0
    else if (e.key === 'End') j = names.length - 1
    if (j === null) return
    e.preventDefault()
    pickAccent(names[j], true)
  })
  sync.push(renderAccents)
  const appearSec = section('appearance', 'Appearance', 'The neon accent used across the side panel, hub and on-page tools.',
    el('div', { class: 'sv-field stack' }, accentGroup,
      el('div', { class: 'sv-preview', 'aria-hidden': 'true' },
        el('span', { class: 'mm-btn primary sm', text: 'Primary' }), el('span', { class: 'mm-chip active', text: 'Active chip' }), el('span', { class: 'mm-cite', text: 'p4' }),
        el('span', { class: 'mm-gradient-text', style: 'font-weight:700', text: 'Master Mind' }))))

  // ───────── Shortcuts ─────────
  const keysList = el('ul', { class: 'sv-keys' })
  async function renderShortcuts() {
    let cmds = []
    try { cmds = await chrome.commands.getAll() } catch { cmds = [] }
    const order = ['_execute_action', 'highlight-selection', 'toggle-reader', 'capture-text']
    cmds.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name))
    keysList.replaceChildren(...cmds.map(c => {
      const keys = c.shortcut ? c.shortcut.split('+').filter(Boolean) : []
      return el('li', { 'data-command': c.name },
        el('span', { text: c.description || COMMAND_FALLBACK[c.name] || c.name }),
        keys.length ? el('span', { 'aria-label': c.shortcut }, ...keys.map(k => el('kbd', { text: k }))) : el('span', { class: 'unset', text: 'Not set' }))
    }))
  }
  const shortcutBtn = el('button', { type: 'button', class: 'mm-btn sm', html: ICON.ext }, 'Customize shortcuts')
  shortcutBtn.addEventListener('click', () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }))
  const keysSec = section('shortcuts', 'Shortcuts', 'Keyboard shortcuts work on any web page.',
    el('div', { class: 'sv-field stack' }, keysList),
    field('Change a shortcut', 'Chrome manages extension shortcuts on its own page.', shortcutBtn))

  // ───────── Data ─────────
  const storeRows = el('tbody')
  const usageBar = el('i', { style: 'width:0' })
  const usageText = el('p', { class: 'sv-hint' })
  const syncText = el('p', { class: 'sv-hint' })
  const exportBtn = el('button', { type: 'button', class: 'mm-btn primary', html: ICON.download }, 'Export everything')
  const importFile = el('input', { type: 'file', accept: 'application/json,.json', hidden: true, 'aria-label': 'Backup file to import' })
  const importBtn = el('button', { type: 'button', class: 'mm-btn', html: ICON.upload }, 'Import backup…')
  const modeName = fid('mode')
  const mergeRadio = el('input', { type: 'radio', name: modeName, value: 'merge', checked: true })
  const replaceRadio = el('input', { type: 'radio', name: modeName, value: 'replace' })
  const modeSeg = el('div', { class: 'sv-seg', role: 'radiogroup', 'aria-label': 'Import mode' },
    el('label', { title: 'Add new items and update older copies; nothing is deleted' }, mergeRadio, el('span', { text: 'Merge' })),
    el('label', { title: 'Wipe the stores included in the file, then restore them' }, replaceRadio, el('span', { text: 'Replace' })))
  const importResult = el('div', { class: 'sv-result', role: 'status', 'aria-live': 'polite' })
  const resetBtn = el('button', { type: 'button', class: 'mm-btn danger sm', html: ICON.reset }, 'Reset settings')

  async function renderData() {
    const counts = await Promise.all(STORES.map(s => ctx.db.count(s.id).catch(() => 0)))
    if (!alive) return
    storeRows.replaceChildren(...STORES.map((s, i) => el('tr', { 'data-store': s.id },
      el('td', {}, el('b', { text: s.label }), el('small', { text: s.desc })),
      el('td', { class: 'n', text: counts[i].toLocaleString() }),
      el('td', { class: 'a' }, el('button', { type: 'button', class: 'mm-btn danger sm', disabled: !counts[i], 'aria-label': `Clear ${s.label}`, text: 'Clear', onclick: () => clearStore(s, counts[i]) })))))
    try {
      const { usage = 0, quota = 0 } = await navigator.storage.estimate()
      if (!alive) return
      usageBar.style.width = quota ? `${Math.max(0.6, Math.min(100, (usage / quota) * 100))}%` : '0'
      usageText.textContent = quota ? `${fmtBytes(usage)} used of ${fmtBytes(quota)} available to Master Mind on this device.` : `${fmtBytes(usage)} used.`
    } catch { usageText.textContent = 'Storage usage isn’t available in this browser.' }
    try {
      const bytes = await chrome.storage.sync.getBytesInUse('settings')
      const max = chrome.storage.sync.QUOTA_BYTES_PER_ITEM || 8192
      if (alive) syncText.textContent = `Synced settings: ${fmtBytes(bytes)} of ${fmtBytes(max)} (Chrome’s per-item sync limit).`
    } catch { syncText.textContent = '' }
  }

  async function notifyHighlightTabs() {
    try {
      const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] })
      await Promise.all(tabs.map(t => chrome.tabs.sendMessage(t.id, { type: 'MM_HIGHLIGHT_REFRESH' }).catch(() => {})))
    } catch { /* tabs unavailable */ }
  }

  async function clearStore(s, n) {
    const ok = await confirmDialog({
      title: `Clear ${s.label.toLowerCase()}?`,
      body: `This permanently deletes ${n.toLocaleString()} item${n === 1 ? '' : 's'} from this device. Export a backup first if you might want ${n === 1 ? 'it' : 'them'} later.`,
      confirm: `Clear ${s.label.toLowerCase()}`, danger: true,
    })
    if (!ok || !alive) return
    try {
      if (s.id === 'history') {
        const res = await chrome.runtime.sendMessage({ type: 'HISTORY_CLEAR' }).catch(() => null)
        if (!res?.ok) await ctx.db.clear('history')
      } else await ctx.db.clear(s.id)
      if (s.id === 'highlights') notifyHighlightTabs()
      ctx.toast(`${s.label} cleared`)
    } catch (e) {
      ctx.toast(`Couldn’t clear ${s.label.toLowerCase()}: ${e?.message || e}`)
    }
    renderData()
  }

  exportBtn.addEventListener('click', async () => {
    exportBtn.disabled = true
    try {
      const s = await getSettings()
      delete s.apiKey // never part of settings, but make the guarantee explicit
      const stores = {}
      for (const st of STORES) stores[st.id] = await ctx.db.all(st.id)
      const backup = { app: 'master-mind', format: 1, version: chrome.runtime.getManifest().version, exportedAt: new Date().toISOString(), settings: s, stores }
      download(`master-mind-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(backup, null, 2), 'application/json')
      const total = Object.values(stores).reduce((a, b) => a + b.length, 0)
      ctx.toast(`Exported ${total.toLocaleString()} items and your settings (API key excluded)`)
    } catch (e) {
      ctx.toast(`Export failed: ${e?.message || e}`)
    } finally {
      exportBtn.disabled = false
    }
  })
  importBtn.addEventListener('click', () => importFile.click())
  importFile.addEventListener('change', async () => {
    const file = importFile.files?.[0]
    importFile.value = ''
    if (!file) return
    const setImport = (kind, text) => {
      importResult.className = `sv-result${kind ? ` ${kind}` : ''}`
      importResult.replaceChildren()
      if (kind === 'busy') importResult.append(el('span', { class: 'mm-spinner' }))
      else if (kind === 'ok') importResult.insertAdjacentHTML('beforeend', ICON.check)
      else if (kind === 'err') importResult.insertAdjacentHTML('beforeend', ICON.x)
      importResult.append(el('span', { text }))
    }
    if (file.size > 300 * 1024 * 1024) return setImport('err', 'That file is larger than 300 MB.')
    let parsed
    try {
      setImport('busy', `Reading ${file.name}…`)
      parsed = parseBackup(await file.text())
    } catch (e) {
      return setImport('err', e?.message || String(e))
    }
    const mode = replaceRadio.checked ? 'replace' : 'merge'
    const parts = STORES.filter(s => s.id in parsed.counts).map(s => `${parsed.counts[s.id].toLocaleString()} ${s.label.toLowerCase()}`)
    if (parsed.settings) parts.push('settings')
    const what = parts.join(', ')
    const ok = await confirmDialog({
      title: mode === 'replace' ? 'Replace with this backup?' : 'Merge this backup?',
      body: mode === 'replace'
        ? `Import ${what}. Each data type included in the file is wiped first, then restored from it; types not in the file are kept.${parsed.skipped ? ` ${parsed.skipped} invalid item${parsed.skipped === 1 ? '' : 's'} will be skipped.` : ''}`
        : `Import ${what}. New items are added and newer copies replace older ones; nothing is deleted.${parsed.skipped ? ` ${parsed.skipped} invalid item${parsed.skipped === 1 ? '' : 's'} will be skipped.` : ''}`,
      confirm: mode === 'replace' ? 'Replace data' : 'Merge data',
      danger: mode === 'replace',
    })
    if (!ok || !alive) return setImport('', '')
    setImport('busy', 'Importing…')
    try {
      let written = 0
      for (const s of STORES) {
        const recs = parsed.stores[s.id]
        if (!recs) continue
        if (mode === 'replace') {
          if (s.id === 'history') await chrome.runtime.sendMessage({ type: 'HISTORY_CLEAR' }).catch(() => ctx.db.clear('history'))
          await ctx.db.clear(s.id)
          for (let i = 0; i < recs.length; i += 500) await ctx.db.putMany(s.id, recs.slice(i, i + 500))
          written += recs.length
        } else {
          const existing = new Map((await ctx.db.all(s.id)).map(r => [r[s.key], r]))
          const fresh = recs.filter(r => {
            const cur = existing.get(r[s.key])
            return !cur || !(typeof cur.updated === 'number' && typeof r.updated === 'number' && cur.updated > r.updated)
          })
          for (let i = 0; i < fresh.length; i += 500) await ctx.db.putMany(s.id, fresh.slice(i, i + 500))
          written += fresh.length
        }
      }
      if (parsed.settings) {
        if (mode === 'replace') await chrome.storage.sync.set({ settings: { ...DEFAULT_SETTINGS, ...parsed.settings } })
        else await setSettings(parsed.settings)
        settings = await getSettings()
        applyAccent(document.documentElement, settings.accent)
        for (const fn of sync) fn()
      }
      if (parsed.stores.highlights) notifyHighlightTabs()
      if (!alive) return
      setImport('ok', `Imported ${written.toLocaleString()} item${written === 1 ? '' : 's'}${parsed.settings ? ' and your settings' : ''}${parsed.skipped ? ` (${parsed.skipped} invalid skipped)` : ''}.`)
      flash(true, 'Backup imported')
    } catch (e) {
      setImport('err', `Import failed part-way: ${e?.message || e}`)
    }
    renderData()
  })
  resetBtn.addEventListener('click', async () => {
    const ok = await confirmDialog({ title: 'Reset all settings?', body: 'Every preference (including highlight tags and the accent color) returns to its default. Your API key and saved data are kept.', confirm: 'Reset settings', danger: true })
    if (!ok || !alive) return
    await chrome.storage.sync.set({ settings: { ...DEFAULT_SETTINGS } })
    settings = await getSettings()
    applyAccent(document.documentElement, settings.accent)
    for (const fn of sync) fn()
    flash(true, 'Settings reset')
  })

  const dataSec = section('data', 'Data', 'Everything stays on this device. Back it up, move it, or clear it.',
    field('Export', 'Settings (without your API key) plus every highlight, note, page brief, research trail entry and graph layout, as one JSON file.', exportBtn),
    el('div', { class: 'sv-field' },
      el('div', { class: 'sv-fl' }, el('span', { class: 'lbl', text: 'Import' }), el('p', { class: 'sv-hint', text: 'Restore a Master Mind backup. Merge keeps what you have; Replace swaps in the backup’s data.' })),
      el('div', { class: 'sv-fc', style: 'flex-wrap:wrap' }, modeSeg, importBtn, importFile)),
    importResult,
    el('div', { class: 'sv-field stack' }, el('span', { class: 'lbl', text: 'Stored data' }), el('table', { class: 'sv-stores' }, storeRows)),
    el('div', { class: 'sv-field stack' }, el('span', { class: 'lbl', text: 'Storage' }), el('div', { class: 'sv-bar', role: 'presentation' }, usageBar), usageText, syncText),
    field('Reset settings', 'Restore every preference to its default. Data and API key are kept.', resetBtn))
  importResult.style.marginTop = '-4px'
  importResult.style.marginBottom = '10px'

  // ───────── About ─────────
  const ver = chrome.runtime.getManifest().version
  const aboutSec = section('about', 'About', null,
    el('div', { class: 'sv-about' },
      el('img', { src: '../icons/logo.svg', alt: 'Master Mind logo' }),
      el('div', {},
        el('h2', { class: 'mm-gradient-text', text: 'Master Mind' }),
        el('p', { text: 'Your browser’s second brain: briefs, cited answers, highlights, notes and a knowledge graph of everything you read.' }),
        el('div', { class: 'by' }, `Version ${ver} · Created by `, el('b', { class: 'mm-gradient-text', text: 'Abdullah Masoud' })),
        el('p', { class: 'mm-small mm-muted', text: 'Powered by Claude from Anthropic. Your data never leaves this browser unless you send it.' }))))

  // ───────── assemble ─────────
  const sections = [apiSec, briefSec, hlSec, readSec, researchSec, notesSec, appearSec, keysSec, dataSec, aboutSec]
  main.append(...sections)
  nav.append(...SECTIONS.map(([id, label, paths]) => el('button', {
    type: 'button', 'data-sec': id, html: svg(paths),
    onclick: () => {
      const target = document.getElementById(`sv-${id}`)
      target?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
      target?.querySelector('input,select,button')?.focus({ preventScroll: true })
    },
  }, label)))

  // Scrollspy: highlight the section nearest the top of the viewport.
  const visible = new Map()
  const io = new IntersectionObserver(entries => {
    for (const e of entries) visible.set(e.target.id, e.isIntersecting ? e.boundingClientRect.top : null)
    const current = sections.map(s => s.id).find(id => visible.get(id) != null)
    for (const b of nav.querySelectorAll('button')) b.setAttribute('aria-current', String(`sv-${b.dataset.sec}` === current))
  }, { rootMargin: '-10% 0px -60% 0px' })
  for (const s of sections) io.observe(s)
  cleanups.push(() => io.disconnect())

  // Welcome banner (first install opens #settings?welcome=1).
  if (ctx.params.get('welcome')) {
    const close = el('button', { type: 'button', class: 'mm-btn ghost icon sm x', 'aria-label': 'Dismiss welcome', html: ICON.x })
    const go = el('button', { type: 'button', class: 'mm-btn primary go', text: 'Add your API key' })
    const banner = el('section', { class: 'sv-welcome mm-card', 'aria-labelledby': 'sv-welcome-h' },
      el('img', { src: '../icons/logo.svg', alt: '' }),
      el('div', {},
        el('h2', { id: 'sv-welcome-h' }, 'Welcome to ', el('span', { class: 'mm-gradient-text', text: 'Master Mind' })),
        el('ol', {}, el('li', { text: 'Add your Claude API key below' }), el('li', {}, 'Open any article and press ', el('kbd', { text: 'Alt+Shift+M' })), el('li', { text: 'Highlight, ask and watch your graph grow' }))),
      go, close)
    close.addEventListener('click', () => {
      banner.remove()
      history.replaceState(null, '', '#settings') // drop ?welcome without re-routing
      keyInput.focus()
    })
    go.addEventListener('click', () => { apiSec.scrollIntoView({ block: 'start' }); keyInput.focus() })
    wrap.insertBefore(banner, nav)
  }

  // ───────── load ─────────
  ;(async () => {
    try {
      const [s, key] = await Promise.all([getSettings(), getApiKey()])
      if (!alive) return
      settings = s
      storedKey = key
      keyInput.value = key
      renderKeyState()
      renderTags()
      renderAccents()
      for (const fn of sync) fn()
      if (ctx.params.get('welcome') && !key) keyInput.focus({ preventScroll: true })
      const sec = ctx.params.get('section')
      if (sec) document.getElementById(`sv-${sec}`)?.scrollIntoView({ block: 'start' })
    } catch (e) {
      main.prepend(el('div', { class: 'mm-error', role: 'alert', text: `Couldn’t load settings: ${e?.message || e}` }))
    }
    renderShortcuts()
    renderData()
  })()

  // Changes from other contexts (side panel, reader, another hub tab).
  cleanups.push(onSettings(s => {
    if (!alive) return
    settings = s
    for (const fn of sync) fn()
  }))
  const onLocal = (changes, area) => {
    if (area !== 'local' || !changes.apiKey || !alive) return
    storedKey = changes.apiKey.newValue || ''
    if (document.activeElement !== keyInput) keyInput.value = storedKey
    renderKeyState()
  }
  chrome.storage.onChanged.addListener(onLocal)
  cleanups.push(() => chrome.storage.onChanged.removeListener(onLocal))
  let dataTimer = 0
  cleanups.push(ctx.onDbChange(() => { clearTimeout(dataTimer); dataTimer = later(renderData, 500) }))

  return {
    unmount() {
      // Flush pending debounced edits so nothing typed is lost.
      for (const key of [...debounced.keys()]) flushSoon(key)
      alive = false
      for (const t of timers) clearTimeout(t)
      timers.clear()
      for (const fn of cleanups) { try { fn() } catch { /* ignore */ } }
      document.querySelectorAll('dialog.mm-dlg').forEach(d => d.close())
    },
  }
}
