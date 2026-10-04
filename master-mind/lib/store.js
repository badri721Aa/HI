// Settings + secrets.
//   chrome.storage.sync  → preferences (small, follow you across Chrome profiles)
//   chrome.storage.local → secrets (API key never syncs) and small runtime state
// Usable from the service worker and all extension pages (ES module).

export const DEFAULT_TAGS = [
  { id: 'fact', name: 'Important Fact', color: '#22D3EE' },
  { id: 'action', name: 'Action Item', color: '#A3E635' },
  { id: 'question', name: 'Question / Unclear', color: '#F472B6' },
  { id: 'code', name: 'Code Snippet', color: '#A78BFA' },
  { id: 'note', name: 'Note', color: '#FBBF24' },
]

export const DEFAULT_SETTINGS = {
  model: 'claude-opus-5-5',
  effort: 'low',
  autoBrief: true,
  autoBriefMinWords: 600,
  briefMode: 'executive',
  autoJargon: false,
  tags: DEFAULT_TAGS,
  defaultTag: 'fact',
  showSelectionMenu: true,
  reader: { font: 'serif', size: 19, lineHeight: 1.7, width: 720, theme: 'midnight' },
  bionicStrength: 0.45,
  ttsRate: 1,
  ttsVoice: '',
  translateTo: 'English',
  webhookUrl: '',
  accent: 'cyan',
  factCheckSearches: 5,
}

export const ACCENTS = {
  cyan: ['#22D3EE', '#A78BFA'],
  violet: ['#A78BFA', '#F472B6'],
  lime: ['#A3E635', '#22D3EE'],
  pink: ['#F472B6', '#FBBF24'],
  amber: ['#FBBF24', '#FB7185'],
}

export const MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 · smartest' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 · balanced' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 · fastest' },
]

export async function getSettings() {
  const { settings } = await chrome.storage.sync.get('settings')
  const s = { ...DEFAULT_SETTINGS, ...(settings || {}) }
  s.reader = { ...DEFAULT_SETTINGS.reader, ...(settings?.reader || {}) }
  if (!Array.isArray(s.tags) || !s.tags.length) s.tags = DEFAULT_TAGS
  return s
}

export async function setSettings(patch) {
  const next = { ...(await getSettings()), ...patch }
  await chrome.storage.sync.set({ settings: next })
  return next
}

export function onSettings(cb) {
  const fn = (changes, area) => { if (area === 'sync' && changes.settings) getSettings().then(cb) }
  chrome.storage.onChanged.addListener(fn)
  return () => chrome.storage.onChanged.removeListener(fn)
}

export async function getApiKey() {
  return (await chrome.storage.local.get('apiKey')).apiKey || ''
}

export async function setApiKey(apiKey) {
  await chrome.storage.local.set({ apiKey: String(apiKey || '').trim() })
}

/** Apply the accent setting to a document or shadow host as CSS variables. */
export function applyAccent(el, accent) {
  const [a, b] = ACCENTS[accent] || ACCENTS.cyan
  el.style.setProperty('--mm-accent', a)
  el.style.setProperty('--mm-accent-2', b)
}
